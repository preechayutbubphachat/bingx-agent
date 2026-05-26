/**
 * m0bPreflight.ts
 * Phase M-0B Preflight Gate
 *
 * Pure preflight check: "พร้อมเริ่ม Phase M-0B หรือยัง?"
 *
 * Safety guarantees:
 * - NO network calls — ไม่เรียก BingX API หรือ exchange ใดๆ ทั้งสิ้น
 * - READ ONLY — ไม่เขียน / ไม่แก้ / ไม่ลบ ไฟล์ใดเลย
 * - ไม่มี API key / secret ใดถูกแสดง
 * - ตรวจ presence ของ secret เป็น boolean เท่านั้น
 * - ไม่ import BingX execution / order placement ใดๆ
 * - default status = BLOCKED (safe default)
 * - Phase M-0B = planning/approval gate ONLY — no exchange calls yet
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type M0BPreflightStatus =
  | "BLOCKED"
  | "WAITING_FOR_BUILD"
  | "WAITING_FOR_PAPER_FILL_QUALITY"
  | "WAITING_FOR_OPERATOR_APPROVAL"
  | "READY_FOR_M0B_APPROVAL_REVIEW";

export type M0BGateResult = {
  name: string;
  passed: boolean;
  required: boolean;
  detail: string;
};

export type M0BPreflightReport = {
  ok: false; // เสมอ false — ต้องผ่าน manual approval ก่อน
  readOnly: true; // เสมอ true
  noExchangeApiCalls: true; // เสมอ true — Phase M-0B ยังไม่มี network
  status: M0BPreflightStatus;
  phase: "M-0B Preflight";
  gates: M0BGateResult[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  safetyFlags: {
    liveTradingEnabled: boolean;
    enableOrderPlacement: boolean;
    productionTradingReady: boolean;
    shadowLiveEnabled: boolean;
    exchangeReadonlySyncEnabled: boolean;
    manualApprovalStatus: "approved" | "not_approved";
  };
  paperQuality: {
    hasAverageFillPrice: boolean | null;
    hasClosedTrades: boolean | null;
    qualityStatus: string | null;
    checkedAt: string | null;
  };
  credentialReadiness: {
    hasReadOnlyApiKey: boolean; // presence only — ห้ามแสดงค่า
    hasReadOnlySecret: boolean; // presence only — ห้ามแสดงค่า
    approvalStatus: "approved" | "not_approved";
  };
  checkedAt: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function readBoolEnv(key: string, defaultVal: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === null) return defaultVal;
  return v.toLowerCase() === "true";
}

function hasEnvValue(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * evaluateM0BPreflight
 *
 * ตรวจ preflight gates สำหรับ Phase M-0B
 * รับ optional paper quality data (จาก computePaperPerformance หรือ API)
 */
export function evaluateM0BPreflight(opts?: {
  paperDataQuality?: {
    hasAverageFillPrice?: boolean | null;
    hasClosedTrades?: boolean | null;
    qualityStatus?: string | null;
  } | null;
}): M0BPreflightReport {
  const checkedAt = new Date().toISOString();

  // ── Safety flags (ห้ามแก้ — ต้อง false เสมอในตอนนี้)
  const liveTradingEnabled = readBoolEnv("LIVE_TRADING_ENABLED", false);
  const enableOrderPlacement = readBoolEnv("ENABLE_ORDER_PLACEMENT", false);
  const productionTradingReady = readBoolEnv("PRODUCTION_TRADING_READY", false);
  const shadowLiveEnabled = readBoolEnv("SHADOW_LIVE_ENABLED", false);
  const exchangeReadonlySyncEnabled = readBoolEnv("EXCHANGE_READONLY_SYNC_ENABLED", false);

  // ── Operator approval (must be "approved" explicitly — default safe = not_approved)
  const manualApprovalStatus: "approved" | "not_approved" =
    process.env.EXCHANGE_MANUAL_APPROVAL === "approved" ? "approved" : "not_approved";

  // ── Credential presence (boolean only — ห้ามแสดงค่า)
  const hasReadOnlyApiKey = hasEnvValue("BINGX_READONLY_API_KEY");
  const hasReadOnlySecret = hasEnvValue("BINGX_READONLY_SECRET");

  // ── Paper quality from caller (may be null if not yet computed)
  const pq = opts?.paperDataQuality ?? null;
  const hasAverageFillPrice = pq?.hasAverageFillPrice ?? null;
  const hasClosedTrades = pq?.hasClosedTrades ?? null;
  const qualityStatus = pq?.qualityStatus ?? null;

  // ── Gate evaluation ────────────────────────────────────────────────────────

  const gates: M0BGateResult[] = [
    // Gate 1: Safety flags must be false
    {
      name: "LIVE_TRADING_DISABLED",
      passed: !liveTradingEnabled,
      required: true,
      detail: liveTradingEnabled
        ? "LIVE_TRADING_ENABLED=true — ต้องเป็น false เสมอในขณะนี้"
        : "LIVE_TRADING_ENABLED=false ✓",
    },
    {
      name: "ORDER_PLACEMENT_DISABLED",
      passed: !enableOrderPlacement,
      required: true,
      detail: enableOrderPlacement
        ? "ENABLE_ORDER_PLACEMENT=true — ต้องเป็น false เสมอในขณะนี้"
        : "ENABLE_ORDER_PLACEMENT=false ✓",
    },
    {
      name: "PRODUCTION_TRADING_NOT_READY",
      passed: !productionTradingReady,
      required: true,
      detail: productionTradingReady
        ? "PRODUCTION_TRADING_READY=true — ต้องเป็น false เสมอในขณะนี้"
        : "PRODUCTION_TRADING_READY=false ✓",
    },

    // Gate 2: Windows build
    // ไม่สามารถตรวจ build artifact ใน runtime ได้จาก env
    // ให้ report เป็น warning แทน (operator ต้องรัน manual)
    {
      name: "WINDOWS_BUILD_CONFIRMED",
      passed: false, // conservative default — ต้อง operator confirm
      required: true,
      detail:
        "npm run build บน Windows ยังไม่ได้ยืนยัน — รัน: cd C:\\...\\httpdocs\\dashboard && npm run build",
    },

    // Gate 3: Paper fill quality
    {
      name: "PAPER_AVERAGE_FILL_PRICE",
      passed: hasAverageFillPrice === true,
      required: true,
      detail:
        hasAverageFillPrice === null
          ? "ยังไม่ได้ตรวจ paper fill quality — ตรวจ GET /api/paper-performance"
          : hasAverageFillPrice
          ? "paper fills มี averageFillPrice ✓"
          : "paper fills ยังไม่มี averageFillPrice — ต้องรัน paper execution cycle กับ market data จริง",
    },
    {
      name: "PAPER_CLOSED_TRADES",
      passed: hasClosedTrades === true,
      required: true,
      detail:
        hasClosedTrades === null
          ? "ยังไม่ได้ตรวจ paper closed trades"
          : hasClosedTrades
          ? "paper มี closed trade cycles ✓"
          : "paper ยังไม่มี closed cycles — ต้องเปิด + ปิด position ใน paper mode ก่อน",
    },
    {
      name: "PAPER_QUALITY_SUFFICIENT",
      passed: qualityStatus === "usable" || qualityStatus === "robust",
      required: false, // required ก่อน Phase M (live) แต่ไม่ required สำหรับ M-0B approval review
      detail:
        qualityStatus === null
          ? "paper quality ยังไม่ได้ตรวจ"
          : qualityStatus === "usable" || qualityStatus === "robust"
          ? `paper quality: ${qualityStatus} ✓`
          : `paper quality: ${qualityStatus} — ต้องการ "usable" หรือ "robust" ก่อน Phase M`,
    },

    // Gate 4: Operator approval
    {
      name: "EXCHANGE_MANUAL_APPROVAL",
      passed: manualApprovalStatus === "approved",
      required: true,
      detail:
        manualApprovalStatus === "approved"
          ? "EXCHANGE_MANUAL_APPROVAL=approved ✓"
          : 'EXCHANGE_MANUAL_APPROVAL ยังไม่ approved — ผ่าน checklist ใน PROJECT_MAP.md แล้วตั้งเป็น "approved"',
    },

    // Gate 5: Read-only credential (presence only)
    {
      name: "READONLY_API_KEY_PRESENT",
      passed: hasReadOnlyApiKey,
      required: false, // required แค่ตอน M-0B implementation จริง
      detail: hasReadOnlyApiKey
        ? "BINGX_READONLY_API_KEY present (ไม่แสดงค่า) ✓"
        : "BINGX_READONLY_API_KEY ยังไม่ได้ตั้ง — ต้องรอ operator approval ก่อนสร้าง key",
    },
    {
      name: "READONLY_SECRET_PRESENT",
      passed: hasReadOnlySecret,
      required: false, // same as above
      detail: hasReadOnlySecret
        ? "BINGX_READONLY_SECRET present (ไม่แสดงค่า) ✓"
        : "BINGX_READONLY_SECRET ยังไม่ได้ตั้ง — ต้องรอ operator approval ก่อนสร้าง key",
    },
  ];

  // ── Blockers & warnings ────────────────────────────────────────────────────

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Hard blockers from required gates
  for (const gate of gates) {
    if (gate.required && !gate.passed) {
      blockers.push(`[${gate.name}] ${gate.detail}`);
    } else if (!gate.required && !gate.passed) {
      warnings.push(`[${gate.name}] ${gate.detail}`);
    }
  }

  // Additional context warnings
  if (shadowLiveEnabled) {
    warnings.push(
      "SHADOW_LIVE_ENABLED=true — ตรวจให้แน่ใจว่าเปิดหลัง operator approval เท่านั้น"
    );
  }
  if (exchangeReadonlySyncEnabled) {
    warnings.push(
      "EXCHANGE_READONLY_SYNC_ENABLED=true — ตรวจให้แน่ใจว่าเปิดหลัง operator approval เท่านั้น"
    );
  }

  // ── Status resolution ─────────────────────────────────────────────────────

  let status: M0BPreflightStatus;

  if (liveTradingEnabled || enableOrderPlacement || productionTradingReady) {
    status = "BLOCKED";
  } else if (!hasAverageFillPrice || !hasClosedTrades) {
    status = "WAITING_FOR_PAPER_FILL_QUALITY";
  } else if (manualApprovalStatus !== "approved") {
    status = "WAITING_FOR_OPERATOR_APPROVAL";
  } else if (!hasReadOnlyApiKey || !hasReadOnlySecret) {
    // approval is done but credentials not set yet — still waiting for build confirmation
    status = "WAITING_FOR_BUILD";
  } else {
    // All required gates passed — but Windows build is always conservative false above
    // So we'd only reach here if we remove the build gate conservatism
    status = "READY_FOR_M0B_APPROVAL_REVIEW";
  }

  // Windows build gate overrides any "READY" status
  const buildGate = gates.find((g) => g.name === "WINDOWS_BUILD_CONFIRMED");
  if (buildGate && !buildGate.passed && status === "READY_FOR_M0B_APPROVAL_REVIEW") {
    status = "WAITING_FOR_BUILD";
  }

  // ── Next actions ─────────────────────────────────────────────────────────

  const nextActions: string[] = [];

  if (status === "BLOCKED") {
    nextActions.push("ตรวจ LIVE_TRADING_ENABLED / ENABLE_ORDER_PLACEMENT / PRODUCTION_TRADING_READY ต้องเป็น false");
  }
  if (status === "WAITING_FOR_BUILD" || buildGate?.passed === false) {
    nextActions.push(
      "รัน: cd C:\\...\\httpdocs\\dashboard && npm run build บน Windows host"
    );
  }
  if (!hasAverageFillPrice) {
    nextActions.push(
      "รัน paper execution cycles กับ market data จริงเพื่อให้ fills มี averageFillPrice"
    );
  }
  if (!hasClosedTrades) {
    nextActions.push("เปิด + ปิด position ใน paper mode เพื่อสร้าง closed trade cycles");
  }
  if (manualApprovalStatus !== "approved") {
    nextActions.push(
      'ผ่าน checklist ใน PROJECT_MAP.md Section 16 > Phase M-0B Approval Package แล้วตั้ง EXCHANGE_MANUAL_APPROVAL=approved ใน .env.local'
    );
  }
  if (!hasReadOnlyApiKey || !hasReadOnlySecret) {
    nextActions.push(
      "หลัง operator approval: สร้าง BingX read-only API key แล้วตั้งใน .env.local (server-side เท่านั้น)"
    );
  }

  if (nextActions.length === 0) {
    nextActions.push("ทุก gate ผ่านแล้ว — รอ final operator sign-off ก่อนเริ่ม Phase M-0B implementation");
  }

  // ── Assemble report ────────────────────────────────────────────────────────

  return {
    ok: false, // เสมอ false — ต้องผ่าน manual approval
    readOnly: true,
    noExchangeApiCalls: true,
    status,
    phase: "M-0B Preflight",
    gates,
    blockers,
    warnings,
    nextActions,
    safetyFlags: {
      liveTradingEnabled,
      enableOrderPlacement,
      productionTradingReady,
      shadowLiveEnabled,
      exchangeReadonlySyncEnabled,
      manualApprovalStatus,
    },
    paperQuality: {
      hasAverageFillPrice,
      hasClosedTrades,
      qualityStatus,
      checkedAt,
    },
    credentialReadiness: {
      hasReadOnlyApiKey,
      hasReadOnlySecret,
      approvalStatus: manualApprovalStatus,
    },
    checkedAt,
  };
}
