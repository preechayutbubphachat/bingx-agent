/**
 * liveReadiness.ts
 * Phase K — Live Migration Gate
 *
 * Read-only evaluator สำหรับประเมิน live migration readiness
 * ผ่าน 8 gates — ผลลัพธ์เป็น structured report
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียน / ไม่แก้ / ไม่ลบ ไฟล์ใดเลย
 * - ไม่ call BingX API
 * - ไม่มี API key / secret
 * - ไม่เปิด live trading / order placement ไม่ว่าในกรณีใด
 * - LIVE_TRADING_ENABLED ยัง false เสมอ
 * - ENABLE_ORDER_PLACEMENT ยัง false เสมอ
 * - Manual approval required เสมอ — ห้าม auto-approve
 * - default status = BLOCKED
 * - errors ถูก swallow + รายงานใน warnings[]
 *
 * Root resolution (ใช้ BINGX_AGENT_DIR env var — ห้าม hard-code C:\bingx-agent):
 *   1. BINGX_AGENT_DIR env var (preferred)
 *   2. cwd scan
 *   3. fallback: process.cwd()
 */

import * as fs from "fs/promises";
import * as path from "path";
import { runRuntimeAudit } from "@/lib/runtimeAudit";
import { readPaperJournal } from "@/lib/readPaperJournal";
import { computePaperPerformance } from "@/lib/paperPerformance";
import { readSchedulerHeartbeat } from "@/lib/readSchedulerHeartbeat";

// ─── Gate Status Types ─────────────────────────────────────────────────────

export type GateStatus =
  | "PASSED"
  | "WARNING"
  | "BLOCKED"
  | "BLOCKED_MANUAL_APPROVAL_REQUIRED"
  | "BLOCKED_BUILD_PENDING"
  | "BLOCKED_METRICS_MISSING"
  | "BLOCKED_SAFETY_FLAGS"
  | "BLOCKED_SOURCE_OF_TRUTH"
  | "BLOCKED_RUNTIME_CRITICAL"
  | "BLOCKED_NO_PAPER_DATA"
  | "BLOCKED_MONITORING"
  | "ERROR";

export type GateSeverity = "info" | "warning" | "critical" | "blocker";

export type LiveReadinessGate = {
  /** unique gate id */
  id: string;
  /** human-readable gate name */
  label: string;
  /** gate status */
  status: GateStatus;
  /** severity level */
  severity: GateSeverity;
  /** true = gate passes (not blocking) */
  passed: boolean;
  /** reasons for current status */
  reasons: string[];
  /** recommended next actions */
  nextActions: string[];
};

export type LiveReadinessSummary = {
  total: number;
  passed: number;
  warning: number;
  blocked: number;
  critical: number;
};

export type LiveReadinessStatus =
  | "BLOCKED"
  | "READY_FOR_REVIEW"
  | "ALL_PASSED_MANUAL_APPROVAL_PENDING";

export type LiveReadinessReport = {
  /** overall — always false until manual approval */
  ok: false;
  /** overall readiness status */
  status: LiveReadinessStatus;
  /** phase label */
  stage: "Phase K — Live Migration Gate";
  /** safety flags — always false */
  liveTradingEnabled: false;
  orderPlacementEnabled: false;
  productionTradingReady: false;
  /** manual approval always required */
  manualApprovalRequired: true;
  manualApprovalStatus: "not_approved" | "pending_review";
  /** gate results */
  gates: LiveReadinessGate[];
  /** summary counts */
  summary: LiveReadinessSummary;
  /** all warnings from evaluation */
  warnings: string[];
  /** all active blockers (short messages) */
  blockers: string[];
  /** recommended next actions */
  nextActions: string[];
  /** ISO timestamp */
  checkedAt: string;
  /** read-only guarantee */
  readOnly: true;
};

// ─── Root Dir Resolution ────────────────────────────────────────────────────

async function resolveRootDir(): Promise<string> {
  const envDir = process.env.BINGX_AGENT_DIR;
  if (envDir) {
    const resolved = path.resolve(envDir);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // fall through
    }
  }

  // cwd scan: cwd, .., ../..
  const cwd = process.cwd();
  const candidates = [cwd, path.join(cwd, ".."), path.join(cwd, "..", "..")];
  for (const candidate of candidates) {
    try {
      const snapshotPath = path.join(candidate, "market_snapshot.json");
      await fs.access(snapshotPath);
      return candidate;
    } catch {
      // try next
    }
  }

  return cwd;
}

// ─── Gate 1: Safety Flags Gate ─────────────────────────────────────────────

function evaluateSafetyFlagsGate(): LiveReadinessGate {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let status: GateStatus = "PASSED";

  const liveEnabled =
    (process.env.LIVE_TRADING_ENABLED ?? "false").toLowerCase() === "true";
  const orderEnabled =
    (process.env.ENABLE_ORDER_PLACEMENT ?? "false").toLowerCase() === "true";
  const productionReady =
    (process.env.PRODUCTION_TRADING_READY ?? "false").toLowerCase() === "true";

  if (liveEnabled) {
    reasons.push("LIVE_TRADING_ENABLED=true — ห้ามเปิดโดยไม่มี manual approval");
    status = "BLOCKED_SAFETY_FLAGS";
  } else {
    reasons.push("LIVE_TRADING_ENABLED=false ✓");
  }

  if (orderEnabled) {
    reasons.push("ENABLE_ORDER_PLACEMENT=true — ต้อง disable ก่อน migration gate");
    status = "BLOCKED_SAFETY_FLAGS";
  } else {
    reasons.push("ENABLE_ORDER_PLACEMENT=false ✓");
  }

  if (productionReady) {
    reasons.push("PRODUCTION_TRADING_READY=true — ตั้งก่อน manual approval จะ bypass gate");
    if (status === "PASSED") status = "WARNING";
  } else {
    reasons.push("PRODUCTION_TRADING_READY=false ✓");
  }

  if (status === "PASSED") {
    reasons.push("Safety flags ทั้งหมดอยู่ใน safe mode");
  } else {
    nextActions.push("ตั้ง LIVE_TRADING_ENABLED=false และ ENABLE_ORDER_PLACEMENT=false ก่อนดำเนิน migration gate");
  }

  const passed = status === "PASSED" || status === "WARNING";
  return {
    id: "safety_flags",
    label: "Safety Flags Gate",
    status,
    severity: status === "BLOCKED_SAFETY_FLAGS" ? "blocker" : status === "WARNING" ? "warning" : "info",
    passed,
    reasons,
    nextActions,
  };
}

// ─── Gate 2: Source-of-Truth Gate ──────────────────────────────────────────

async function evaluateSourceOfTruthGate(rootDir: string): Promise<LiveReadinessGate> {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let status: GateStatus = "PASSED";

  const agentDir = process.env.BINGX_AGENT_DIR;
  if (!agentDir) {
    reasons.push("BINGX_AGENT_DIR env var ไม่ได้ตั้ง — ระบบใช้ fallback path");
    nextActions.push("ตั้ง BINGX_AGENT_DIR=<PROJECT_ROOT> ใน .env.local บน production server");
    status = "WARNING";
  } else {
    reasons.push(`BINGX_AGENT_DIR=${agentDir} ✓`);
  }

  const rootFiles = [
    { name: "market_snapshot.json", critical: true },
    { name: "latest_decision.json", critical: true },
  ];

  const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  for (const f of rootFiles) {
    const filePath = path.join(rootDir, f.name);
    try {
      const stat = await fs.stat(filePath);
      const ageSec = (Date.now() - stat.mtimeMs) / 1000;
      if (stat.size === 0) {
        reasons.push(`${f.name}: ไฟล์ว่าง (0 bytes)`);
        if (f.critical) status = "BLOCKED_SOURCE_OF_TRUTH";
      } else if (stat.mtimeMs < Date.now() - STALE_THRESHOLD_MS) {
        reasons.push(`${f.name}: stale (${Math.floor(ageSec / 60)} นาที)`);
        if (status === "PASSED") status = "WARNING";
      } else {
        reasons.push(`${f.name}: fresh (${Math.floor(ageSec)}s) ✓`);
      }
    } catch {
      reasons.push(`${f.name}: ไม่พบไฟล์ที่ ${filePath}`);
      if (f.critical) {
        status = "BLOCKED_SOURCE_OF_TRUTH";
        nextActions.push(`สร้าง/อัปเดต ${f.name} โดยรัน snapshot ก่อน`);
      }
    }
  }

  const passed = status === "PASSED" || status === "WARNING";
  return {
    id: "source_of_truth",
    label: "Source-of-Truth Gate",
    status,
    severity:
      status === "BLOCKED_SOURCE_OF_TRUTH"
        ? "blocker"
        : status === "WARNING"
        ? "warning"
        : "info",
    passed,
    reasons,
    nextActions,
  };
}

// ─── Gate 3: Runtime Audit Gate ─────────────────────────────────────────────

async function evaluateRuntimeAuditGate(): Promise<LiveReadinessGate> {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let status: GateStatus = "PASSED";

  try {
    const audit = await runRuntimeAudit();

    reasons.push(
      `Runtime audit: ${audit.summary.ok} ok, ${audit.summary.warning} warning, ${audit.summary.critical} critical`
    );

    if (audit.summary.critical > 0) {
      status = "BLOCKED_RUNTIME_CRITICAL";
      const criticalFiles = audit.files
        .filter((f) => f.severity === "critical")
        .map((f) => f.fileName);
      reasons.push(`Critical files: ${criticalFiles.join(", ")}`);
      nextActions.push("แก้ไข critical runtime files ก่อน — ดูรายละเอียดใน /api/runtime-audit");
    } else if (audit.summary.warning > 0) {
      status = "WARNING";
      nextActions.push("ตรวจ warning runtime files ก่อน proceed");
    } else {
      reasons.push("ไม่มี critical runtime issues ✓");
    }

    for (const a of audit.nextActions.slice(0, 3)) {
      if (!nextActions.includes(a)) nextActions.push(a);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reasons.push(`Runtime audit error: ${msg}`);
    status = "ERROR";
    nextActions.push("ตรวจ /api/runtime-audit สำหรับรายละเอียด");
  }

  const passed = status === "PASSED" || status === "WARNING";
  return {
    id: "runtime_audit",
    label: "Runtime Audit Gate",
    status,
    severity:
      status === "BLOCKED_RUNTIME_CRITICAL" || status === "ERROR"
        ? "blocker"
        : status === "WARNING"
        ? "warning"
        : "info",
    passed,
    reasons,
    nextActions,
  };
}

// ─── Gate 4: Paper Trading Gate ─────────────────────────────────────────────

async function evaluatePaperTradingGate(): Promise<LiveReadinessGate> {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let status: GateStatus = "PASSED";

  const paperEnabled = process.env.PAPER_TRADING_ENABLED;

  if (paperEnabled === "false") {
    reasons.push("PAPER_TRADING_ENABLED=false — ต้องเปิด paper trading ก่อน live");
    status = "BLOCKED_NO_PAPER_DATA";
    nextActions.push("ตั้ง PAPER_TRADING_ENABLED=true และรัน paper trading session ก่อน");
  } else {
    try {
      const journal = await readPaperJournal();

      if (!journal.paperModeDetected) {
        reasons.push("ไม่พบ paper trading events ใน audit logs");
        status = "BLOCKED_NO_PAPER_DATA";
        nextActions.push("รัน paper trading session ก่อน — ดูสถานะใน /api/paper-status");
      } else if (journal.totalPaperEvents === 0) {
        reasons.push("Paper mode detected แต่ยังไม่มี events");
        status = "BLOCKED_NO_PAPER_DATA";
        nextActions.push("รอ paper trading events สะสมก่อน proceed");
      } else {
        reasons.push(
          `Paper trading detected ✓ — ${journal.totalPaperEvents} events, ${journal.totalOrderFilled} fills`
        );
        if (journal.totalOrderFilled === 0) {
          reasons.push("ยังไม่มี filled orders — ข้อมูล performance ไม่พอ");
          if (status === "PASSED") status = "WARNING";
          nextActions.push("รอ paper fills ก่อนประเมิน performance");
        }
        if (journal.warnings.length > 0) {
          reasons.push(`Paper journal warnings: ${journal.warnings.length} รายการ`);
          if (status === "PASSED") status = "WARNING";
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reasons.push(`Paper journal read error: ${msg}`);
      status = "ERROR";
      nextActions.push("ตรวจ /api/paper-status สำหรับรายละเอียด");
    }
  }

  const passed = status === "PASSED" || status === "WARNING";
  return {
    id: "paper_trading",
    label: "Paper Trading Gate",
    status,
    severity:
      status === "BLOCKED_NO_PAPER_DATA" || status === "ERROR"
        ? "blocker"
        : status === "WARNING"
        ? "warning"
        : "info",
    passed,
    reasons,
    nextActions,
  };
}

// ─── Gate 5: Paper Performance Gate (Phase L+ enhanced) ─────────────────────

async function evaluatePaperPerformanceGate(): Promise<LiveReadinessGate> {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let status: GateStatus = "BLOCKED_METRICS_MISSING";

  try {
    const perf = await computePaperPerformance();

    // ── BLOCK GROUP 1: No data ───────────────────────────────────────────────
    if (perf.status === "no_data") {
      reasons.push("ยังไม่มีข้อมูล paper trading — รอ paper signals");
      status = "BLOCKED_NO_PAPER_DATA";
      nextActions.push(...perf.nextActions.slice(0, 3));
    }

    // ── BLOCK GROUP 2: L+ edgeStatus hard blocks ─────────────────────────────
    else if (perf.edgeStatus === "sample_insufficient") {
      // L+: sample < 30 closed cycles — never positive regardless of metrics
      reasons.push(
        `Sample ไม่พอเพื่อสรุป edge — ${perf.totalPaperFills} fills (ต้องการ ≥30 closed cycles)`
      );
      reasons.push("ห้ามสรุปว่า strategy has edge จนกว่าจะมี closed cycles ≥30");
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push("สะสม paper trades ต่อไป — ต้องการ ≥30 closed cycles");
      nextActions.push("ตรวจว่า PAPER_TRADING_ENABLED=true และ paper signals ทำงานอยู่");
    }

    else if (perf.edgeStatus === "blocked_by_drawdown") {
      // L+: drawdown เกิน safety threshold
      reasons.push(
        `Paper drawdown เกิน safety threshold — maxDrawdown: ${perf.maxDrawdown !== null ? `$${perf.maxDrawdown.toFixed(2)}` : "N/A"}`
      );
      reasons.push("ต้องลด position size หรือตรวจ grid parameters ก่อน proceed");
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push("ตรวจ grid spacing และ leverage configuration");
      nextActions.push("ดู /api/paper-performance → edgeDiagnostics สำหรับรายละเอียด");
    }

    else if (perf.edgeStatus === "negative") {
      // Negative expectancy
      reasons.push(
        `Paper edge เป็นลบ — expectancy: ${perf.expectancy !== null ? perf.expectancy.toFixed(4) : "N/A"}`
      );
      reasons.push("ต้องแก้ grid parameters ก่อน proceed ไป live");
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push("ตรวจ grid spacing, fee model, และ cost drag ก่อน");
      nextActions.push("ดู /api/paper-performance สำหรับ attribution breakdown");
    }

    // ── BLOCK GROUP 3: L+ costGate hard block ────────────────────────────────
    else if (perf.costGate?.pass === false) {
      // L+: grid spacing ไม่เกิน requiredMinSpacingPct (roundTripCost × 2.5)
      const cg = perf.costGate;
      reasons.push(
        `Cost gate FAIL — grid spacing ${cg.gridSpacingPct !== null ? cg.gridSpacingPct.toFixed(3) + "%" : "unknown"} ต่ำกว่า required ${cg.requiredMinSpacingPct.toFixed(3)}% (roundTripCost × 2.5)`
      );
      reasons.push("Grid spacing ต้องเกิน round-trip cost × 2.5 เพื่อให้มี edge หลังหัก cost");
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push("เพิ่ม grid spacing หรือลด trading frequency");
      nextActions.push(cg.nextAction);
    }

    // ── BLOCK GROUP 4: L++ Paper data quality ───────────────────────────────────
    else if (perf.paperDataQuality?.qualityStatus === "insufficient") {
      // L++: ไม่มี averageFillPrice หรือ closed trades จริง → ยืนยัน edge ไม่ได้
      const dq = perf.paperDataQuality;
      const missingList = dq.missingFields.slice(0, 3).join(", ");
      reasons.push(
        `Paper data quality: insufficient — missing: ${missingList || "closed trades / averageFillPrice"}`
      );
      if (!dq.hasAverageFillPrice) {
        reasons.push("ไม่มี averageFillPrice จริงใน fills — PnL คำนวณจาก estimate เท่านั้น");
      }
      if (!dq.hasClosedTrades) {
        reasons.push("ไม่มี closed round-trip trades — ยังไม่สามารถคำนวณ expectancy ได้");
      }
      reasons.push("ห้ามสรุปว่า strategy has edge จนกว่าจะมีข้อมูลคุณภาพพอ");
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push(...(dq.nextActions ?? []).slice(0, 2));
      nextActions.push("ดู /api/paper-performance → paperDataQuality สำหรับรายละเอียด");
    }

    // ── BLOCK GROUP 5: Critical cost drag ────────────────────────────────────
    else if (perf.costDragStatus === "critical_cost_drag") {
      reasons.push(
        `Cost drag สูงวิกฤต (${perf.costToGrossProfitRatio !== null ? (perf.costToGrossProfitRatio * 100).toFixed(1) : "?"}% ของ gross) — grid spacing อาจต่ำกว่า cost`
      );
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push("ตรวจ grid spacing ว่า > round-trip cost × 2.5");
      nextActions.push("ดู /api/paper-performance → costGate สำหรับรายละเอียด");
    }

    // ── BLOCK GROUP 5: Insufficient sample ────────────────────────────────────
    else if (perf.sampleSizeStatus === "insufficient_data" || perf.sampleSizeStatus === "early_sample") {
      reasons.push(
        `Sample ไม่เพียงพอ — ${perf.totalPaperFills} fills (ต้องการ ≥20 fills สำหรับ usable sample)`
      );
      reasons.push(`Edge status: ${perf.edgeStatus} — ยืนยันไม่ได้จนกว่าจะมีข้อมูลเพียงพอ`);
      status = "BLOCKED_METRICS_MISSING";
      nextActions.push(...perf.nextActions.slice(0, 2));
    }

    // ── WARN GROUP 1: edgeStatus = cost_dragged ───────────────────────────────
    else if (perf.edgeStatus === "cost_dragged") {
      // L+: cost drag กำลังกัดกำไร แต่ยังไม่ block
      reasons.push(
        `Edge status: cost_dragged — costToGrossProfitRatio ${perf.costToGrossProfitRatio !== null ? (perf.costToGrossProfitRatio * 100).toFixed(1) + "%" : "unknown"}`
      );
      reasons.push("Cost กำลังกัด gross profit — ต้องตรวจ grid spacing ก่อน approve");
      status = "WARNING";
      nextActions.push("ตรวจ costGate ใน /api/paper-performance");
      nextActions.push("พิจารณา widen grid spacing หรือ reduce trade frequency");
    }

    // ── WARN GROUP 2: cost_drag_high ──────────────────────────────────────────
    else if (perf.costDragStatus === "cost_drag_high") {
      reasons.push(
        `Cost drag สูง (${perf.costToGrossProfitRatio !== null ? (perf.costToGrossProfitRatio * 100).toFixed(1) : "?"}%) — ตรวจ grid spacing`
      );
      if (perf.expectancy !== null && perf.expectancy > 0) {
        reasons.push(`Expectancy ยังบวก: ${perf.expectancy.toFixed(4)} — แต่ cost drag อาจกัดกำไร`);
      }
      status = "WARNING";
      nextActions.push("Monitor cost drag ใกล้ชิด — ตรวจ grid spacing");
      nextActions.push("Review paper performance manually ก่อน approve live gate");
    }

    // ── WARN GROUP 3: positive_unconfirmed (L+) ───────────────────────────────
    else if (perf.edgeStatus === "positive_unconfirmed") {
      // L+: 30–99 closed cycles, edge looks positive but not confirmed
      reasons.push(
        `Edge positive_unconfirmed — ${perf.totalPaperFills} fills (ต้องการ ≥100 สำหรับ positive_candidate)`
      );
      reasons.push(
        `Expectancy: ${perf.expectancy !== null ? perf.expectancy.toFixed(4) : "N/A"} | Win rate: ${perf.winRate !== null ? (perf.winRate * 100).toFixed(1) : "N/A"}%`
      );
      reasons.push("หมายเหตุ: ต้อง review manual ก่อน approve — edge ยังไม่ยืนยันด้วย ≥100 cycles");
      status = "WARNING";
      nextActions.push("สะสม paper trades ต่อ — เป้าหมาย ≥100 closed cycles");
      nextActions.push("ดู /api/paper-performance → attribution breakdown");
    }

    // ── WARN GROUP 4: regime_specific_candidate (L+) ─────────────────────────
    else if (perf.edgeStatus === "regime_specific_candidate") {
      reasons.push(
        `Edge เฉพาะบาง regime — edgeDiagnostics แสดงว่า edge ไม่ consistent ทุก market condition`
      );
      const ed = perf.edgeDiagnostics;
      if (ed.positiveRegimes.length > 0) {
        reasons.push(`Positive regimes: ${ed.positiveRegimes.join(", ")}`);
      }
      if (ed.negativeRegimes.length > 0) {
        reasons.push(`Negative regimes: ${ed.negativeRegimes.join(", ")}`);
      }
      status = "WARNING";
      nextActions.push("ตรวจ regime attribution ก่อน approve — edge อาจไม่ work ทุก market state");
      nextActions.push("ดู /api/paper-performance → attribution.byRegime");
    }

    // ── WARN GROUP 5: usable_sample ───────────────────────────────────────────
    else if (perf.sampleSizeStatus === "usable_sample") {
      reasons.push(
        `Paper performance usable — ${perf.totalPaperFills} fills, edge: ${perf.edgeStatus}`
      );
      reasons.push(
        `Expectancy: ${perf.expectancy !== null ? perf.expectancy.toFixed(4) : "N/A"} | Win rate: ${perf.winRate !== null ? (perf.winRate * 100).toFixed(1) : "N/A"}%`
      );
      reasons.push("หมายเหตุ: ต้อง review manual ก่อน approve live migration");
      status = "WARNING";
      nextActions.push("Review paper performance attribution (mode/regime/session) ก่อน approve");
      nextActions.push("ดู /api/paper-performance สำหรับ full breakdown");
    }

    // ── PASS (WARNING): robust_sample + positive_candidate ────────────────────
    else {
      reasons.push(
        `Paper performance robust — ${perf.totalPaperFills} fills, edge: ${perf.edgeStatus}`
      );
      reasons.push(
        `Expectancy: ${perf.expectancy !== null ? perf.expectancy.toFixed(4) : "N/A"} | Win rate: ${perf.winRate !== null ? (perf.winRate * 100).toFixed(1) : "N/A"}%`
      );
      reasons.push("Manual approval ยังจำเป็น — paper edge ไม่ได้รับประกัน live performance");
      status = "WARNING"; // always WARNING — never auto-PASSED for live gate
      nextActions.push("Review attribution breakdown และ approve manually");
    }

    // ── L+: Additive checks (no status downgrade, only add warnings) ─────────

    // noTradeDiagnostics: warn if coverage missing
    if (status !== "BLOCKED_METRICS_MISSING" && status !== "BLOCKED_NO_PAPER_DATA") {
      const ntd = perf.noTradeDiagnostics;
      if (ntd && ntd.status === "missing") {
        reasons.push("⚠ No-trade decision logging ยังไม่ครบ — ตรวจ noTradeDiagnostics");
        nextActions.push(ntd.nextAction);
      } else if (ntd && ntd.status === "partial" && ntd.missingReasons.length > 0) {
        reasons.push(
          `⚠ No-trade reason coverage partial — missing: ${ntd.missingReasons.slice(0, 3).join(", ")}`
        );
      }

      // unknownFailurePct: warn if > 50%
      if (
        perf.unknownFailurePct !== null &&
        perf.unknownFailurePct > 0.5 &&
        perf.totalLossCycles >= 5
      ) {
        reasons.push(
          `⚠ ${Math.round(perf.unknownFailurePct * 100)}% ของ loss cycles เป็น unknown_failure — เพิ่ม failureReason ใน paper log`
        );
        nextActions.push("Enrich paper_pnl.jsonl ด้วย failureReason field");
      }

      // attribution mostly UNKNOWN: warn
      const byMode = perf.attribution?.byMode ?? [];
      const unknownModeBucket = byMode.find((b) => b.label === "UNKNOWN");
      const totalModeTrades = byMode.reduce((s, b) => s + b.count, 0);
      if (
        unknownModeBucket &&
        totalModeTrades > 0 &&
        unknownModeBucket.count / totalModeTrades > 0.7
      ) {
        reasons.push(
          "⚠ Attribution by mode ส่วนใหญ่เป็น UNKNOWN — เพิ่ม mode tag ใน paper events"
        );
        nextActions.push("Enrich paper audit events ด้วย mode field");
      }

      // costGate unknown: note it
      if (perf.costGate?.status === "unknown") {
        reasons.push("⚠ Cost gate unknown — ไม่มีข้อมูล grid spacing จาก paper events");
        nextActions.push("เพิ่ม gridSpacingPct field ใน paper_pnl.jsonl");
      }
    }

    // Append perf warnings (max 2)
    for (const w of perf.warnings.slice(0, 2)) {
      reasons.push(`⚠ ${w}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reasons.push(`Performance evaluation error: ${msg}`);
    status = "BLOCKED_METRICS_MISSING";
    nextActions.push("ตรวจ /api/paper-performance สำหรับรายละเอียด");
  }

  const passed = status === "WARNING";
  return {
    id: "paper_performance",
    label: "Paper Performance Gate (Phase L+)",
    status,
    severity:
      status === "BLOCKED_METRICS_MISSING" || status === "BLOCKED_NO_PAPER_DATA"
        ? "blocker"
        : status === "WARNING"
        ? "warning"
        : "info",
    passed,
    reasons,
    nextActions,
  };
}

// ─── Gate 6: Monitoring Gate ─────────────────────────────────────────────────

async function evaluateMonitoringGate(): Promise<LiveReadinessGate> {
  const reasons: string[] = [];
  const nextActions: string[] = [];
  let status: GateStatus = "PASSED";

  // Check scheduler heartbeat
  try {
    const heartbeat = await readSchedulerHeartbeat();

    if (!heartbeat.ok || !heartbeat.heartbeat) {
      reasons.push(`Scheduler heartbeat: ${heartbeat.warning ?? "ไม่พบข้อมูล"}`);
      if (status === "PASSED") status = "WARNING";
      nextActions.push("ตรวจสอบ scheduler service ว่า running อยู่");
    } else {
      const hb = heartbeat.heartbeat;
      const ageSec =
        typeof hb.updated_at === "number" && hb.updated_at > 0
          ? (Date.now() - hb.updated_at) / 1000
          : null;

      if (ageSec !== null && ageSec > 300) {
        // stale > 5 minutes
        reasons.push(`Scheduler heartbeat stale (${Math.floor(ageSec)}s) — ควร < 5 minutes`);
        if (status === "PASSED") status = "WARNING";
        nextActions.push("ตรวจ scheduler service — heartbeat ค้างนานเกินไป");
      } else {
        reasons.push(
          ageSec !== null
            ? `Scheduler heartbeat fresh (${Math.floor(ageSec)}s) ✓`
            : "Scheduler heartbeat found ✓"
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reasons.push(`Heartbeat read error: ${msg}`);
    if (status === "PASSED") status = "WARNING";
    nextActions.push("ตรวจ scheduler heartbeat file");
  }

  // Monitoring endpoint availability (can't make HTTP calls from lib — note for operator)
  reasons.push("หมายเหตุ: /api/health และ /api/alerts ต้องตรวจ manually ก่อน live migration");
  reasons.push("หมายเหตุ: AlertBanner ควรไม่แสดง critical alerts ก่อน proceed");

  if (status === "PASSED") {
    reasons.push("Monitoring baseline check ผ่าน ✓");
  } else {
    nextActions.push("แก้ไข monitoring issues ก่อนทำ live migration");
  }

  return {
    id: "monitoring",
    label: "Monitoring & Alerting Gate",
    status,
    severity: status === "PASSED" ? "info" : status === "WARNING" ? "warning" : "blocker",
    passed: status === "PASSED",
    reasons,
    nextActions,
  };
}

// ─── Gate 7: Build Validation Gate ───────────────────────────────────────────

async function evaluateBuildGate(): Promise<LiveReadinessGate> {
  // Cannot verify build status from server runtime — always BLOCKED_BUILD_PENDING
  // Operator must run: cd dashboard && npm run build
  return {
    id: "build_validation",
    label: "Build Validation Gate",
    status: "BLOCKED_BUILD_PENDING",
    severity: "blocker",
    passed: false,
    reasons: [
      "Build validation ต้องรันบน Windows host โดย operator",
      "ระบบ server runtime ไม่สามารถรัน npm build ได้",
      "Pending operator action: cd C:\\2025\\web-69\\ob-gate17-200369\\httpdocs\\dashboard && npm run build",
    ],
    nextActions: [
      "รัน: cd dashboard && npm run build บน Windows host",
      "ยืนยันว่า build สำเร็จและไม่มี TypeScript errors",
      "อัปเดต PROJECT_MAP.md เมื่อ build ผ่าน",
    ],
  };
}

// ─── Gate 8: Manual Approval Gate ────────────────────────────────────────────

async function evaluateManualApprovalGate(): Promise<LiveReadinessGate> {
  // Always BLOCKED_MANUAL_APPROVAL_REQUIRED — ห้าม auto-approve ไม่ว่ากรณีใด
  return {
    id: "manual_approval",
    label: "Manual Approval Gate",
    status: "BLOCKED_MANUAL_APPROVAL_REQUIRED",
    severity: "blocker",
    passed: false,
    reasons: [
      "Gate นี้ต้อง BLOCKED เสมอจนกว่าจะมีการ approve ด้วยมือ",
      "ห้าม auto-approve live migration ไม่ว่า paper performance จะดีแค่ไหน",
      "LIVE_TRADING_ENABLED=false — ยังไม่เปิด",
      "ENABLE_ORDER_PLACEMENT=false — ยังไม่เปิด",
    ],
    nextActions: [
      "Review paper performance attribution ก่อน approve",
      "Review all 8 gates และยืนยันว่า blocker ทุกอันได้รับการแก้ไข",
      "Manual approval โดย operator เท่านั้น — ห้าม auto-proceed",
    ],
  };
}

// ─── Main: evaluateLiveReadiness ──────────────────────────────────────────────

export async function evaluateLiveReadiness(): Promise<LiveReadinessReport> {
  const gates: LiveReadinessGate[] = [];
  const warnings: string[] = [];

  // Resolve root dir once — shared by gates that need it
  const rootDir = await resolveRootDir();

  // Gate 1: Safety Flags (sync)
  try {
    gates.push(evaluateSafetyFlagsGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 1 (safety_flags) error: ${msg}`);
    gates.push({
      id: "safety_flags", label: "Safety Flags Gate",
      status: "BLOCKED_SAFETY_FLAGS", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 2: Source of Truth
  try {
    gates.push(await evaluateSourceOfTruthGate(rootDir));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 2 (source_of_truth) error: ${msg}`);
    gates.push({
      id: "source_of_truth", label: "Source of Truth Gate",
      status: "BLOCKED_SOURCE_OF_TRUTH", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 3: Runtime Audit
  try {
    gates.push(await evaluateRuntimeAuditGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 3 (runtime_audit) error: ${msg}`);
    gates.push({
      id: "runtime_audit", label: "Runtime Audit Gate",
      status: "BLOCKED_RUNTIME_CRITICAL", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 4: Paper Trading
  try {
    gates.push(await evaluatePaperTradingGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 4 (paper_trading) error: ${msg}`);
    gates.push({
      id: "paper_trading", label: "Paper Trading Gate",
      status: "BLOCKED_NO_PAPER_DATA", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 5: Paper Performance
  try {
    gates.push(await evaluatePaperPerformanceGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 5 (paper_performance) error: ${msg}`);
    gates.push({
      id: "paper_performance", label: "Paper Performance Gate (Phase L+)",
      status: "BLOCKED_METRICS_MISSING", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 6: Monitoring
  try {
    gates.push(await evaluateMonitoringGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 6 (monitoring) error: ${msg}`);
    gates.push({
      id: "monitoring", label: "Monitoring & Alerting Gate",
      status: "WARNING", severity: "warning", passed: true,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 7: Build Validation
  try {
    gates.push(await evaluateBuildGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 7 (build_validation) error: ${msg}`);
    gates.push({
      id: "build_validation", label: "Build Validation Gate",
      status: "BLOCKED_BUILD_PENDING", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // Gate 8: Manual Approval
  try {
    gates.push(await evaluateManualApprovalGate());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Gate 8 (manual_approval) error: ${msg}`);
    gates.push({
      id: "manual_approval", label: "Manual Approval Gate",
      status: "BLOCKED_MANUAL_APPROVAL_REQUIRED", severity: "blocker", passed: false,
      reasons: [`Evaluation error: ${msg}`], nextActions: [],
    });
  }

  // ── Overall status computation ─────────────────────────────────────────────

  const blockers = gates.filter((g) => !g.passed);
  const warnings_gates = gates.filter((g) => g.passed && g.severity === "warning");

  let overallStatus: LiveReadinessStatus = "BLOCKED";

  if (blockers.length === 0 && warnings_gates.length === 0) {
    overallStatus = "BLOCKED"; // never auto-READY — manual approval always blocks
  } else if (blockers.length > 0) {
    overallStatus = "BLOCKED";
  } else {
    overallStatus = "BLOCKED"; // even with only warnings: stay BLOCKED until manual approval
  }

  const blockerMessages = blockers.flatMap((g) => g.reasons.slice(0, 2));

  const nextActions: string[] = [];
  for (const gate of blockers.slice(0, 3)) {
    nextActions.push(...gate.nextActions.slice(0, 2));
  }
  if (nextActions.length === 0) {
    nextActions.push("ตรวจ gate warnings ก่อน approve manually");
  }

  const summary: LiveReadinessSummary = {
    total: gates.length,
    passed: gates.filter((g) => g.passed && g.severity === "info").length,
    warning: warnings_gates.length,
    blocked: blockers.length,
    critical: gates.filter((g) => g.severity === "blocker").length,
  };

  return {
    ok: false, // always false — never auto-ok for live migration
    readOnly: true,
    status: overallStatus,
    stage: "Phase K — Live Migration Gate",
    liveTradingEnabled: false,
    orderPlacementEnabled: false,
    productionTradingReady: false,
    manualApprovalRequired: true,
    manualApprovalStatus: "not_approved",
    gates,
    summary,
    blockers: blockerMessages,
    nextActions,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
