/**
 * runtimeConfigValidation.ts
 * Phase E — Production Hardening
 *
 * Structured runtime config validation สำหรับ bingx-agent dashboard
 * ทำหน้าที่:
 *   1. ตรวจ env vars ที่จำเป็น
 *   2. ตรวจไฟล์ JSON ที่ระบบต้องอ่าน
 *   3. ตรวจ safety flags (live trading ปิดไว้)
 *   4. ตรวจ data freshness (STALE_DATA)
 *
 * ใช้ใน /api/health และ /api/plan-status
 * ไม่ crash dashboard — คืน ok:false พร้อม structured error เสมอ
 */

import fs from "fs";
import path from "path";

// ─── Error Codes ─────────────────────────────────────────────────────────────

export type ConfigErrorCode =
  | "MISSING_ROOT_FILE"   // ไม่พบไฟล์ใน BINGX_AGENT_DIR
  | "INVALID_JSON"        // JSON parse error
  | "ENV_NOT_SET"         // env var ที่จำเป็นไม่ได้ตั้ง
  | "STALE_DATA"          // ข้อมูลเก่าเกิน threshold
  | "MIRROR_FALLBACK"     // ใช้ mirror แทน root (non-silent warning)
  | "LIVE_TRADING_BLOCKED" // LIVE_TRADING_ENABLED=true แต่ยัง block
  | "PRODUCTION_NOT_READY"; // PRODUCTION_TRADING_READY=false

export type ConfigSeverity = "info" | "warning" | "critical" | "fatal";

export type ConfigError = {
  ok: false;
  code: ConfigErrorCode;
  severity: ConfigSeverity;
  /** ข้อความที่ operator อ่านเข้าใจได้ — ห้ามมี secret/credential */
  message: string;
  /** ขั้นตอนแก้ไขสำหรับ operator */
  nextAction: string;
  /** path ที่ระบบพยายามเข้าถึง (sanitized — ไม่มี credential) */
  sourcePath?: string;
};

export type ConfigOk = {
  ok: true;
  warnings: ConfigError[];
};

export type ConfigResult = ConfigOk | ConfigError;

// ─── Safety Flag Validation ───────────────────────────────────────────────────

export type SafetyFlags = {
  liveTradingEnabled: boolean;
  paperTradingEnabled: boolean | "not_confirmed";
  productionTradingReady: boolean;
  nodeEnv: string;
};

export function readSafetyFlags(): SafetyFlags {
  const liveRaw = (process.env.LIVE_TRADING_ENABLED ?? "false").toLowerCase().trim();
  const paperRaw = (process.env.PAPER_TRADING_ENABLED ?? "not_confirmed").toLowerCase().trim();
  const prodRaw = (process.env.PRODUCTION_TRADING_READY ?? "false").toLowerCase().trim();

  return {
    liveTradingEnabled: liveRaw === "true",
    paperTradingEnabled: paperRaw === "not_confirmed" ? "not_confirmed" : paperRaw === "true",
    productionTradingReady: prodRaw === "true",
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}

export function validateSafetyFlags(flags: SafetyFlags): ConfigError[] {
  const errs: ConfigError[] = [];

  if (flags.liveTradingEnabled) {
    errs.push({
      ok: false,
      code: "LIVE_TRADING_BLOCKED",
      severity: "fatal",
      message:
        "LIVE_TRADING_ENABLED=true แต่ระบบยังไม่ผ่าน production gate — ห้าม place real order",
      nextAction:
        "ตรวจ PRODUCTION_TRADING_READY และ paper trading gate ก่อนเปิด live trading",
    });
  }

  if (!flags.productionTradingReady) {
    errs.push({
      ok: false,
      code: "PRODUCTION_NOT_READY",
      severity: "info",
      message: "PRODUCTION_TRADING_READY=false — ระบบอยู่ใน monitoring/development mode",
      nextAction: "ยังไม่ต้องทำอะไร — dashboard ใช้สำหรับ monitor เท่านั้น",
    });
  }

  return errs;
}

// ─── Env Var Validation ───────────────────────────────────────────────────────

const REQUIRED_ENV_VARS = [
  "BINGX_AGENT_DIR",
  // DATA_DIR, BINGX_DATA_DIR, OBGATE_DATA_DIR ก็ยอมรับ — ดูใน resolveRootDir()
] as const;

const OPTIONAL_ENV_VARS = [
  "DATA_DIR",
  "BINGX_DATA_DIR",
  "OBGATE_DATA_DIR",
  "NODE_ENV",
  "LIVE_TRADING_ENABLED",
  "PAPER_TRADING_ENABLED",
  "PRODUCTION_TRADING_READY",
] as const;

export function validateEnvVars(): { ok: boolean; errors: ConfigError[]; warnings: ConfigError[] } {
  const errors: ConfigError[] = [];
  const warnings: ConfigError[] = [];

  // ต้องมี อย่างน้อยหนึ่งใน root dir vars
  const rootDirVars = [
    process.env.BINGX_AGENT_DIR,
    process.env.DATA_DIR,
    process.env.BINGX_DATA_DIR,
    process.env.OBGATE_DATA_DIR,
  ].filter(Boolean);

  if (rootDirVars.length === 0) {
    errors.push({
      ok: false,
      code: "ENV_NOT_SET",
      severity: "critical",
      message:
        "ไม่พบ env var ที่กำหนด root directory: BINGX_AGENT_DIR, DATA_DIR, BINGX_DATA_DIR หรือ OBGATE_DATA_DIR",
      nextAction:
        "เพิ่ม BINGX_AGENT_DIR=<path> ใน .env.local (เช่น BINGX_AGENT_DIR=C:\\bingx-agent)",
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── File Validation ──────────────────────────────────────────────────────────

export const REQUIRED_ROOT_FILES = [
  "market_snapshot.json",
  "latest_decision.json",
] as const;

export const OPTIONAL_ROOT_FILES = [
  "news_context.json",
  "plan_status_state.json",
  "plan_status_log.jsonl",
] as const;

export type FileValidationResult = {
  file: string;
  exists: boolean;
  readable: boolean;
  validJson: boolean | null; // null = ไม่ได้ check (เช่น jsonl)
  ageSec: number | null;
  error?: ConfigError;
};

export function validateRootFile(
  rootDir: string,
  filename: string,
  opts: { required: boolean; checkJson?: boolean } = { required: true, checkJson: true }
): FileValidationResult {
  // sanitize path — ไม่ expose credential ใน log
  const safePath = path.join(path.basename(rootDir), filename);
  const fullPath = path.join(rootDir, filename);

  try {
    const stat = fs.statSync(fullPath);
    const ageSec = Math.floor((Date.now() - stat.mtimeMs) / 1000);

    if (opts.checkJson && filename.endsWith(".json")) {
      try {
        const raw = fs.readFileSync(fullPath, "utf8");
        JSON.parse(raw);
        return { file: filename, exists: true, readable: true, validJson: true, ageSec };
      } catch {
        return {
          file: filename,
          exists: true,
          readable: true,
          validJson: false,
          ageSec,
          error: {
            ok: false,
            code: "INVALID_JSON",
            severity: "critical",
            message: `ไฟล์ ${filename} มี JSON ที่ parse ไม่ได้`,
            nextAction: `ตรวจสอบ ${filename} ว่ามีเนื้อหาครบและ JSON valid`,
            sourcePath: safePath,
          },
        };
      }
    }

    return { file: filename, exists: true, readable: true, validJson: null, ageSec };
  } catch (e: unknown) {
    const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";

    if (opts.required) {
      return {
        file: filename,
        exists: false,
        readable: false,
        validJson: null,
        ageSec: null,
        error: {
          ok: false,
          code: "MISSING_ROOT_FILE",
          severity: "critical",
          message: `ไม่พบไฟล์ ${filename} ใน root directory`,
          nextAction: `ตรวจสอบว่า bingx-agent Node server กำลังรันและเขียน ${filename} ตามปกติ`,
          sourcePath: safePath,
        },
      };
    }

    return {
      file: filename,
      exists: false,
      readable: false,
      validJson: null,
      ageSec: null,
    };
  }
}

// ─── Stale Data Check ────────────────────────────────────────────────────────

const STALE_THRESHOLD_SEC = 300;   // 5 นาที
const OLD_THRESHOLD_SEC = 900;     // 15 นาที

export type DataFreshnessResult = {
  ageSec: number | null;
  tag: "FRESH" | "STALE" | "OLD" | "UNKNOWN";
  error?: ConfigError;
};

export function checkDataFreshness(ageSec: number | null, filename: string): DataFreshnessResult {
  if (ageSec === null) return { ageSec: null, tag: "UNKNOWN" };

  if (ageSec > OLD_THRESHOLD_SEC) {
    return {
      ageSec,
      tag: "OLD",
      error: {
        ok: false,
        code: "STALE_DATA",
        severity: "warning",
        message: `${filename} เก่ามาก (${Math.floor(ageSec / 60)} นาที) — อาจเป็นปัญหา`,
        nextAction: "ตรวจสอบว่า bingx-agent Node server กำลังรันและ snapshot ทำงานปกติ",
      },
    };
  }

  if (ageSec > STALE_THRESHOLD_SEC) {
    return {
      ageSec,
      tag: "STALE",
      error: {
        ok: false,
        code: "STALE_DATA",
        severity: "info",
        message: `${filename} เก่า (${Math.floor(ageSec / 60)} นาที)`,
        nextAction: "รอ snapshot cycle หรือ trigger manual snapshot",
      },
    };
  }

  return { ageSec, tag: "FRESH" };
}

// ─── Full System Validation ───────────────────────────────────────────────────

export type SystemHealthResult = {
  healthy: boolean;
  severity: ConfigSeverity;
  safetyFlags: SafetyFlags;
  envOk: boolean;
  files: FileValidationResult[];
  errors: ConfigError[];
  warnings: ConfigError[];
  nextActions: string[];
  checkedAt: string;
};

export function runSystemHealthCheck(rootDir: string): SystemHealthResult {
  const errors: ConfigError[] = [];
  const warnings: ConfigError[] = [];
  const nextActions: string[] = [];

  // 1. Safety flags
  const safetyFlags = readSafetyFlags();
  const flagErrors = validateSafetyFlags(safetyFlags);
  for (const e of flagErrors) {
    if (e.severity === "fatal" || e.severity === "critical") errors.push(e);
    else warnings.push(e);
    if (e.nextAction) nextActions.push(e.nextAction);
  }

  // 2. Env vars
  const envCheck = validateEnvVars();
  errors.push(...envCheck.errors);
  warnings.push(...envCheck.warnings);

  // 3. Required files
  const fileResults: FileValidationResult[] = [];
  for (const filename of REQUIRED_ROOT_FILES) {
    const result = validateRootFile(rootDir, filename, { required: true, checkJson: true });
    fileResults.push(result);
    if (result.error) {
      errors.push(result.error);
      if (result.error.nextAction) nextActions.push(result.error.nextAction);
    } else if (result.ageSec !== null) {
      const fresh = checkDataFreshness(result.ageSec, filename);
      if (fresh.error) {
        if (fresh.error.severity === "warning") warnings.push(fresh.error);
        else errors.push(fresh.error);
        if (fresh.error.nextAction) nextActions.push(fresh.error.nextAction);
      }
    }
  }

  // 4. Optional files (warning only, not error)
  for (const filename of OPTIONAL_ROOT_FILES) {
    const result = validateRootFile(rootDir, filename, { required: false, checkJson: filename.endsWith(".json") });
    fileResults.push(result);
    // optional files ที่หายไป = warning เท่านั้น
    if (!result.exists) {
      warnings.push({
        ok: false,
        code: "MISSING_ROOT_FILE",
        severity: "info",
        message: `ไม่พบไฟล์ optional ${filename} — บาง feature อาจไม่แสดงผล`,
        nextAction: `ไม่จำเป็นต้องทำทันที — ตรวจสอบ bingx-agent ถ้ามี feature ที่ต้องใช้ไฟล์นี้`,
      });
    }
  }

  // 5. Determine overall severity
  const hasFatal = errors.some((e) => e.severity === "fatal");
  const hasCritical = errors.some((e) => e.severity === "critical");
  const hasWarning = warnings.length > 0;

  const severity: ConfigSeverity = hasFatal
    ? "fatal"
    : hasCritical
    ? "critical"
    : hasWarning
    ? "warning"
    : "info";

  const healthy = !hasFatal && !hasCritical;

  return {
    healthy,
    severity,
    safetyFlags,
    envOk: envCheck.ok,
    files: fileResults,
    errors,
    warnings,
    nextActions: [...new Set(nextActions)],
    checkedAt: new Date().toISOString(),
  };
}
