/**
 * runtimeAudit.ts
 * Phase I — Reconcile & Runtime State Audit
 *
 * Read-only helper ตรวจสอบ runtime state files ของ bingx-agent
 * รายงานว่าแต่ละไฟล์ missing / stale / invalid / fresh
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียน / ไม่แก้ / ไม่ลบ ไฟล์ใดเลย
 * - ไม่ call BingX API
 * - ไม่มี API key / secret
 * - ไม่ auto-fix runtime files
 * - ถ้าไม่มีไฟล์หรืออ่านไม่ได้ → คืน result ชัดเจน ไม่ throw
 * - errors ถูก swallow + รายงานใน warnings[]
 *
 * Root resolution (same pattern as readLatest.ts):
 *   1. BINGX_AGENT_DIR env var
 *   2. Well-known path: C:\bingx-agent
 *   3. cwd scan (cwd, .., ..\..\..)
 */

import * as fs from "fs/promises";
import * as path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuditFileFreshness = "fresh" | "stale" | "missing" | "invalid" | "unknown";

export type AuditFileSeverity = "ok" | "warning" | "critical";

export type AuditFileCode =
  | "OK"
  | "FILE_MISSING"
  | "INVALID_JSON"
  | "FILE_EMPTY"
  | "FILE_STALE"
  | "READ_ERROR"
  | "OPTIONAL_MISSING";

export type AuditFileAuthority =
  | "root_authoritative"  // source-of-truth — must exist for system to function
  | "canonical"           // canonical state file — should exist when system is running
  | "derived"             // derived from canonical — stale is warning, missing is tolerable
  | "optional";           // optional — missing is not an error

export type AuditFileResult = {
  /** ชื่อไฟล์ (ไม่รวม path) */
  fileName: string;
  /** role ของไฟล์ในระบบ */
  role: string;
  /** authority level ของไฟล์ */
  authority: AuditFileAuthority;
  /** full path ที่ตรวจสอบ */
  expectedPath: string;
  /** มีไฟล์อยู่จริง */
  exists: boolean;
  /** อ่านได้โดยไม่ error */
  readable: boolean;
  /** parse JSON ได้ */
  validJson: boolean | null;
  /** ขนาดไฟล์ (bytes) — null ถ้าไม่มีไฟล์ */
  sizeBytes: number | null;
  /** mtime ของไฟล์ (ISO 8601) — null ถ้าไม่มีไฟล์ */
  updatedAt: string | null;
  /** อายุไฟล์ (วินาที) — null ถ้าไม่มีไฟล์ */
  ageSec: number | null;
  /** สถานะความสด */
  freshness: AuditFileFreshness;
  /** severity ของสถานะนี้ */
  severity: AuditFileSeverity;
  /** audit code */
  code: AuditFileCode;
  /** ข้อความอธิบาย */
  message: string;
  /** ขั้นตอนแนะนำถัดไป */
  nextAction: string;
};

export type RuntimeAuditSummary = {
  total: number;
  ok: number;
  warning: number;
  critical: number;
  missing: number;
  invalid: number;
  stale: number;
};

export type RuntimeAuditReport = {
  /** overall health — false ถ้า severity = critical */
  ok: boolean;
  /** worst severity ของไฟล์ทั้งหมด */
  severity: AuditFileSeverity;
  /** อ่านอย่างเดียว — ไม่แก้ไฟล์ใดเลย */
  readOnly: true;
  /** เวลาที่ audit */
  checkedAt: string;
  /** root directory ที่ใช้ค้นหาไฟล์ */
  rootDir: string;
  /** source ของ rootDir */
  rootDirSource: "env_BINGX_AGENT_DIR" | "well_known" | "cwd_scan" | "fallback";
  /** สรุปจำนวน */
  summary: RuntimeAuditSummary;
  /** รายงานแต่ละไฟล์ */
  files: AuditFileResult[];
  /** คำเตือนจาก audit process เอง */
  warnings: string[];
  /** action ที่แนะนำสำหรับ operator */
  nextActions: string[];
};

// ─── File Definitions ───────────────────────────────────────────────────────

type FileSpec = {
  fileName: string;
  role: string;
  authority: AuditFileAuthority;
  /** threshold (วินาที) ก่อนถือว่า stale */
  staleThresholdSec: number;
  /** ถ้า false → missing = OPTIONAL_MISSING severity=ok */
  required: boolean;
};

const AUDIT_FILES: FileSpec[] = [
  {
    fileName: "market_snapshot.json",
    role: "Market snapshot — OHLC, orderbook, derivatives, volatility",
    authority: "root_authoritative",
    staleThresholdSec: 600, // 10 min
    required: true,
  },
  {
    fileName: "latest_decision.json",
    role: "Latest STEP01 analysis — market_mode, risk_warning, levels, parameters",
    authority: "root_authoritative",
    staleThresholdSec: 600, // 10 min
    required: true,
  },
  {
    fileName: "plan_status.json",
    role: "Plan status — current plan + step states",
    authority: "canonical",
    staleThresholdSec: 600, // 10 min
    required: false,
  },
  {
    fileName: "plan_status_state.json",
    role: "Plan status machine state — persisted state for plan tracker",
    authority: "derived",
    staleThresholdSec: 600, // 10 min
    required: false,
  },
  {
    fileName: "scheduler_heartbeat.json",
    role: "Scheduler heartbeat — confirms scheduler process is alive",
    authority: "optional",
    staleThresholdSec: 120, // 2 min
    required: false,
  },
];

// ─── Root Dir Resolution ─────────────────────────────────────────────────────

type RootDirResolution = {
  rootDir: string;
  source: RuntimeAuditReport["rootDirSource"];
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveRootDirForAudit(
  explicitRoot?: string
): Promise<RootDirResolution> {
  // 1. Explicit override (for testing)
  if (explicitRoot) {
    return { rootDir: path.resolve(explicitRoot), source: "env_BINGX_AGENT_DIR" };
  }

  // 2. BINGX_AGENT_DIR env var
  const envDir = process.env.BINGX_AGENT_DIR?.trim();
  if (envDir) {
    return { rootDir: path.resolve(envDir), source: "env_BINGX_AGENT_DIR" };
  }

  // 3. Well-known Windows path
  const wellKnown = "C:\\bingx-agent";
  if (await fileExists(wellKnown)) {
    return { rootDir: wellKnown, source: "well_known" };
  }

  // 4. cwd scan — look for a directory containing at least one known runtime file
  const cwd = process.cwd();
  const cwdCandidates = [
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
  ];

  for (const candidate of cwdCandidates) {
    const markerFile = path.join(candidate, "market_snapshot.json");
    if (await fileExists(markerFile)) {
      return { rootDir: candidate, source: "cwd_scan" };
    }
    const decisionFile = path.join(candidate, "latest_decision.json");
    if (await fileExists(decisionFile)) {
      return { rootDir: candidate, source: "cwd_scan" };
    }
  }

  // 5. Fallback to cwd (so paths are at least deterministic)
  return { rootDir: cwd, source: "fallback" };
}

// ─── Single-file Audit ───────────────────────────────────────────────────────

async function auditFile(
  spec: FileSpec,
  rootDir: string,
  nowMs: number
): Promise<AuditFileResult> {
  const filePath = path.join(rootDir, spec.fileName);

  // ── Case 1: check exists ──────────────────────────────────────────────────
  let statResult: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    statResult = await fs.stat(filePath);
  } catch {
    // file missing or inaccessible
  }

  if (!statResult) {
    if (!spec.required) {
      return {
        fileName: spec.fileName,
        role: spec.role,
        authority: spec.authority,
        expectedPath: filePath,
        exists: false,
        readable: false,
        validJson: null,
        sizeBytes: null,
        updatedAt: null,
        ageSec: null,
        freshness: "missing",
        severity: spec.authority === "optional" ? "ok" : "warning",
        code: "OPTIONAL_MISSING",
        message: `${spec.fileName} ไม่พบ (optional — ระบบทำงานได้ถ้าไม่มีไฟล์นี้)`,
        nextAction:
          spec.authority === "optional"
            ? "ไม่จำเป็นต้องทำอะไร — ไฟล์นี้ optional"
            : "ตรวจสอบ scheduler ว่าทำงานอยู่",
      };
    }

    return {
      fileName: spec.fileName,
      role: spec.role,
      authority: spec.authority,
      expectedPath: filePath,
      exists: false,
      readable: false,
      validJson: null,
      sizeBytes: null,
      updatedAt: null,
      ageSec: null,
      freshness: "missing",
      severity: spec.authority === "root_authoritative" ? "critical" : "warning",
      code: "FILE_MISSING",
      message: `${spec.fileName} ไม่พบใน ${rootDir}`,
      nextAction: `ตรวจสอบว่า BINGX_AGENT_DIR ชี้ไปยังไดเรกทอรีที่ถูกต้อง หรือรัน snapshot ใหม่`,
    };
  }

  const sizeBytes = statResult.size;
  const mtimeMs = statResult.mtimeMs;
  const updatedAt = new Date(mtimeMs).toISOString();
  const ageSec = Math.floor((nowMs - mtimeMs) / 1000);

  // ── Case 2: file empty ────────────────────────────────────────────────────
  if (sizeBytes === 0) {
    return {
      fileName: spec.fileName,
      role: spec.role,
      authority: spec.authority,
      expectedPath: filePath,
      exists: true,
      readable: true,
      validJson: false,
      sizeBytes,
      updatedAt,
      ageSec,
      freshness: "invalid",
      severity: "critical",
      code: "FILE_EMPTY",
      message: `${spec.fileName} มีขนาด 0 bytes — อาจเกิดจาก write ที่ค้างกลางคัน`,
      nextAction: "รัน snapshot ใหม่เพื่อ overwrite ไฟล์นี้",
    };
  }

  // ── Case 3: read + JSON parse ─────────────────────────────────────────────
  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      fileName: spec.fileName,
      role: spec.role,
      authority: spec.authority,
      expectedPath: filePath,
      exists: true,
      readable: false,
      validJson: null,
      sizeBytes,
      updatedAt,
      ageSec,
      freshness: "unknown",
      severity: "critical",
      code: "READ_ERROR",
      message: `อ่าน ${spec.fileName} ไม่ได้: ${msg}`,
      nextAction: "ตรวจสอบ permission ของไฟล์และ disk health",
    };
  }

  let validJson: boolean;
  try {
    JSON.parse(rawContent);
    validJson = true;
  } catch {
    return {
      fileName: spec.fileName,
      role: spec.role,
      authority: spec.authority,
      expectedPath: filePath,
      exists: true,
      readable: true,
      validJson: false,
      sizeBytes,
      updatedAt,
      ageSec,
      freshness: "invalid",
      severity: "critical",
      code: "INVALID_JSON",
      message: `${spec.fileName} มี JSON ที่ parse ไม่ได้ — อาจเกิดจาก write ที่ขาดกลางคัน`,
      nextAction: "รัน snapshot ใหม่เพื่อ overwrite ไฟล์นี้",
    };
  }

  // ── Case 4: staleness check ───────────────────────────────────────────────
  if (ageSec > spec.staleThresholdSec) {
    const ageMin = Math.floor(ageSec / 60);
    const threshMin = Math.floor(spec.staleThresholdSec / 60);
    return {
      fileName: spec.fileName,
      role: spec.role,
      authority: spec.authority,
      expectedPath: filePath,
      exists: true,
      readable: true,
      validJson: true,
      sizeBytes,
      updatedAt,
      ageSec,
      freshness: "stale",
      severity:
        spec.authority === "root_authoritative" ? "critical" : "warning",
      code: "FILE_STALE",
      message: `${spec.fileName} อายุ ${ageMin} นาที (threshold: ${threshMin} นาที)`,
      nextAction:
        spec.authority === "root_authoritative"
          ? "รัน snapshot ทันที — ข้อมูลล้าสมัยอาจทำให้ตัดสินใจผิดพลาด"
          : "ตรวจสอบว่า scheduler ทำงานปกติ",
    };
  }

  // ── Case 5: all good ──────────────────────────────────────────────────────
  const ageMin = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
  return {
    fileName: spec.fileName,
    role: spec.role,
    authority: spec.authority,
    expectedPath: filePath,
    exists: true,
    readable: true,
    validJson: true,
    sizeBytes,
    updatedAt,
    ageSec,
    freshness: "fresh",
    severity: "ok",
    code: "OK",
    message: `${spec.fileName} สดใหม่ (อายุ ${ageMin})`,
    nextAction: "ไม่จำเป็นต้องทำอะไร",
  };
}

// ─── Severity helpers ────────────────────────────────────────────────────────

function worstSeverity(files: AuditFileResult[]): AuditFileSeverity {
  if (files.some((f) => f.severity === "critical")) return "critical";
  if (files.some((f) => f.severity === "warning")) return "warning";
  return "ok";
}

function buildSummary(files: AuditFileResult[]): RuntimeAuditSummary {
  return {
    total: files.length,
    ok: files.filter((f) => f.severity === "ok").length,
    warning: files.filter((f) => f.severity === "warning").length,
    critical: files.filter((f) => f.severity === "critical").length,
    missing: files.filter((f) => f.freshness === "missing").length,
    invalid: files.filter((f) => f.freshness === "invalid").length,
    stale: files.filter((f) => f.freshness === "stale").length,
  };
}

function buildNextActions(files: AuditFileResult[]): string[] {
  const actions = new Set<string>();
  for (const f of files) {
    if (f.severity !== "ok" && f.nextAction !== "ไม่จำเป็นต้องทำอะไร") {
      actions.add(f.nextAction);
    }
  }
  return [...actions];
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * runRuntimeAudit — ตรวจสอบ runtime state files แบบ read-only
 *
 * @param explicitRootDir — ถ้าระบุ จะใช้แทน env/fallback resolution
 */
export async function runRuntimeAudit(
  explicitRootDir?: string
): Promise<RuntimeAuditReport> {
  const checkedAt = new Date().toISOString();
  const nowMs = Date.now();
  const warnings: string[] = [];

  let rootDir: string;
  let rootDirSource: RuntimeAuditReport["rootDirSource"];

  try {
    const resolved = await resolveRootDirForAudit(explicitRootDir);
    rootDir = resolved.rootDir;
    rootDirSource = resolved.source;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Root dir resolution error: ${msg}`);
    rootDir = process.cwd();
    rootDirSource = "fallback";
  }

  // Audit each file — errors are caught per-file, never bubble up
  const files: AuditFileResult[] = [];
  for (const spec of AUDIT_FILES) {
    try {
      const result = await auditFile(spec, rootDir, nowMs);
      files.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Unexpected error auditing ${spec.fileName}: ${msg}`);
      // Push a safe fallback result
      files.push({
        fileName: spec.fileName,
        role: spec.role,
        authority: spec.authority,
        expectedPath: path.join(rootDir, spec.fileName),
        exists: false,
        readable: false,
        validJson: null,
        sizeBytes: null,
        updatedAt: null,
        ageSec: null,
        freshness: "unknown",
        severity: "warning",
        code: "READ_ERROR",
        message: `Unexpected error: ${msg}`,
        nextAction: "ตรวจ server logs",
      });
    }
  }

  const severity = worstSeverity(files);
  const summary = buildSummary(files);
  const nextActions = buildNextActions(files);

  // Warn if rootDirSource is fallback — operator should set BINGX_AGENT_DIR
  if (rootDirSource === "fallback") {
    warnings.push(
      "rootDir ไม่ได้ถูกตั้งค่าผ่าน BINGX_AGENT_DIR — ใช้ cwd เป็น fallback ผลลัพธ์อาจไม่ถูกต้อง"
    );
  }

  return {
    ok: severity !== "critical",
    severity,
    readOnly: true,
    checkedAt,
    rootDir,
    rootDirSource,
    summary,
    files,
    warnings,
    nextActions,
  };
}
