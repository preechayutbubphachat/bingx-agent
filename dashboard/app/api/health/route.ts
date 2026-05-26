/**
 * /api/health
 * Phase E — Production Hardening
 * Phase I — Reconcile & Runtime State Audit (runtimeAudit summary added)
 * Phase K — Live Migration Gate (liveReadiness summary added)
 * Phase M-0 — Shadow Live Readiness (exchangeReadiness summary added)
 * Phase M-0B — Preflight Gate (m0bPreflight summary added)
 * Phase M-0D — Operator Evidence Tracker (operatorEvidence summary added)
 *
 * Health / readiness endpoint สำหรับ bingx-agent dashboard
 *
 * Response:
 *   200 OK   — healthy: true (warning อาจมี แต่ระบบทำงานได้)
 *   200 OK   — healthy: false + severity + errors (ระบบมีปัญหา แต่ยังตอบ request ได้)
 *   500      — เฉพาะกรณี unexpected exception
 *
 * ไม่ใช้ 503 เพื่อไม่ให้ reverse proxy หยุด route อื่น
 * ไม่ทำให้ /api/plan-status เสีย
 *
 * Safety: ไม่ expose secret, credential, หรือ full stack trace ไปยัง client
 */

import { NextResponse } from "next/server";
import path from "path";
import {
  runSystemHealthCheck,
  readSafetyFlags,
  type SystemHealthResult,
  type ConfigError,
} from "@/lib/runtimeConfigValidation";
import { runRuntimeAudit } from "@/lib/runtimeAudit";
import { evaluateLiveReadiness } from "@/lib/liveReadiness";
import { evaluateExchangeReadiness } from "@/lib/exchangeReadiness";
import { evaluateM0BPreflight } from "@/lib/m0bPreflight";
import { computePaperPerformance } from "@/lib/paperPerformance";
import { evaluateOperatorEvidence } from "@/lib/operatorEvidence";
import { resolveRuntimeDir } from "@/lib/readLatest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_ENDPOINT_VERSION = "1.0.0";

async function resolveRootDirForHealth(): Promise<{ rootDir: string; resolvedFrom: string }> {
  const envCandidates = [
    process.env.BINGX_AGENT_DIR?.trim(),
    process.env.DATA_DIR?.trim(),
    process.env.BINGX_DATA_DIR?.trim(),
    process.env.OBGATE_DATA_DIR?.trim(),
  ].filter(Boolean) as string[];

  if (envCandidates.length > 0) {
    return {
      rootDir: path.resolve(envCandidates[0]),
      resolvedFrom: "env",
    };
  }

  const resolved = await resolveRuntimeDir();
  return {
    rootDir: resolved.dir,
    resolvedFrom: "runtime_dir_detection",
  };
}

function sanitizePath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.slice(-3).join("/");
}

function safeError(e: ConfigError) {
  return {
    code: e.code,
    severity: e.severity,
    message: e.message,
    nextAction: e.nextAction,
    ...(e.sourcePath ? { sourcePath: sanitizePath(e.sourcePath) } : {}),
  };
}

export async function GET() {
  try {
    const { rootDir, resolvedFrom } = await resolveRootDirForHealth();
    const health: SystemHealthResult = runSystemHealthCheck(rootDir);
    const flags = readSafetyFlags();

    // Phase I: Runtime state audit
    let runtimeAuditSummary: {
      ok: boolean;
      severity: string;
      summary: { total: number; ok: number; warning: number; critical: number; missing: number; invalid: number; stale: number };
      rootDirSource: string;
      warnings: string[];
    } | null = null;
    try {
      const auditReport = await runRuntimeAudit(rootDir);
      runtimeAuditSummary = {
        ok: auditReport.ok,
        severity: auditReport.severity,
        summary: auditReport.summary,
        rootDirSource: auditReport.rootDirSource,
        warnings: auditReport.warnings,
      };
    } catch {
      runtimeAuditSummary = null;
    }

    // Phase K: Live migration gate
    type LiveReadinessSummary = {
      ok: false;
      status: string;
      liveTradingEnabled: false;
      orderPlacementEnabled: false;
      productionTradingReady: false;
      manualApprovalRequired: true;
      manualApprovalStatus: string;
      summary: { total: number; passed: number; warning: number; blocked: number; critical: number };
      gates: Array<{ id: string; label: string; status: string; severity: string; passed: boolean; reasons: string[]; nextActions: string[] }>;
      warnings: string[];
      blockers: string[];
      nextActions: string[];
      readOnly: true;
    };
    let liveReadinessResult: LiveReadinessSummary | null = null;
    try {
      const lr = await evaluateLiveReadiness();
      liveReadinessResult = {
        ok: lr.ok,
        status: lr.status,
        liveTradingEnabled: lr.liveTradingEnabled,
        orderPlacementEnabled: lr.orderPlacementEnabled,
        productionTradingReady: lr.productionTradingReady,
        manualApprovalRequired: lr.manualApprovalRequired,
        manualApprovalStatus: lr.manualApprovalStatus,
        summary: lr.summary,
        gates: lr.gates,
        warnings: lr.warnings,
        blockers: lr.blockers,
        nextActions: lr.nextActions,
        readOnly: lr.readOnly,
      };
    } catch {
      liveReadinessResult = null;
    }

    // Phase M-0: Exchange readiness
    let exchangeReadinessResult: {
      ok: boolean;
      status: string;
      readOnly: boolean;
      shadowLiveEnabled: boolean;
      exchangeReadOnlySyncEnabled: boolean;
      manualApprovalRequired: boolean;
      manualApprovalStatus: string;
      blockers: string[];
      warnings: string[];
      nextActions: string[];
    } | null = null;
    try {
      const er = evaluateExchangeReadiness();
      exchangeReadinessResult = {
        ok: er.ok,
        status: er.status,
        readOnly: er.readOnly,
        shadowLiveEnabled: er.shadowLiveEnabled,
        exchangeReadOnlySyncEnabled: er.exchangeReadOnlySyncEnabled,
        manualApprovalRequired: er.manualApprovalRequired,
        manualApprovalStatus: er.manualApprovalStatus,
        blockers: er.blockers,
        warnings: er.warnings,
        nextActions: er.nextActions,
      };
    } catch {
      exchangeReadinessResult = null;
    }

    // Phase M-0B: preflight gate
    let m0bPreflightResult: {
      ok: false;
      status: string;
      readOnly: true;
      noExchangeApiCalls: true;
      blockers: string[];
      warnings: string[];
      nextActions: string[];
    } | null = null;
    try {
      let paperDataQuality: {
        hasAverageFillPrice?: boolean | null;
        hasClosedTrades?: boolean | null;
        qualityStatus?: string | null;
      } | null = null;
      try {
        const perf = await computePaperPerformance();
        paperDataQuality = {
          hasAverageFillPrice: perf.paperDataQuality?.hasAverageFillPrice ?? null,
          hasClosedTrades: perf.paperDataQuality?.hasClosedTrades ?? null,
          qualityStatus: perf.paperDataQuality?.qualityStatus ?? null,
        };
      } catch {
        paperDataQuality = null;
      }
      const pf = evaluateM0BPreflight({ paperDataQuality });
      m0bPreflightResult = {
        ok: pf.ok,
        status: pf.status,
        readOnly: pf.readOnly,
        noExchangeApiCalls: pf.noExchangeApiCalls,
        blockers: pf.blockers,
        warnings: pf.warnings,
        nextActions: pf.nextActions,
      };
    } catch {
      m0bPreflightResult = null;
    }

    // Phase M-0D: Operator evidence tracker
    let operatorEvidenceResult: {
      ok: false;
      readOnly: true;
      status: string;
      phase: string;
      summary: {
        totalRequired: number;
        passed: number;
        pending: number;
        failed: number;
        blocked: number;
      };
      blockers: string[];
      warnings: string[];
      nextActions: string[];
    } | null = null;
    try {
      let paperDataQualityForEvidence: {
        hasAverageFillPrice?: boolean | null;
        hasClosedTrades?: boolean | null;
        qualityStatus?: string | null;
      } | null = null;
      try {
        const perf2 = await computePaperPerformance();
        paperDataQualityForEvidence = {
          hasAverageFillPrice: perf2.paperDataQuality?.hasAverageFillPrice ?? null,
          hasClosedTrades: perf2.paperDataQuality?.hasClosedTrades ?? null,
          qualityStatus: perf2.paperDataQuality?.qualityStatus ?? null,
        };
      } catch {
        paperDataQualityForEvidence = null;
      }
      const oe = evaluateOperatorEvidence({ paperDataQuality: paperDataQualityForEvidence });
      operatorEvidenceResult = {
        ok: oe.ok,
        readOnly: oe.readOnly,
        status: oe.status,
        phase: oe.phase,
        summary: oe.summary,
        blockers: oe.blockers,
        warnings: oe.warnings,
        nextActions: oe.nextActions,
      };
    } catch {
      operatorEvidenceResult = null;
    }

    const body = {
      healthy: health.healthy,
      severity: health.severity,
      version: HEALTH_ENDPOINT_VERSION,
      checkedAt: health.checkedAt,
      safetyFlags: {
        liveTradingEnabled: flags.liveTradingEnabled,
        paperTradingEnabled: flags.paperTradingEnabled,
        productionTradingReady: flags.productionTradingReady,
        nodeEnv: flags.nodeEnv,
      },
      sourceStatus: {
        resolvedFrom,
        rootDirHint: sanitizePath(rootDir),
        envOk: health.envOk,
        filesChecked: health.files.map((f) => ({
          file: f.file,
          exists: f.exists,
          validJson: f.validJson,
          ageSec: f.ageSec,
          freshness:
            f.ageSec === null
              ? "UNKNOWN"
              : f.ageSec > 900
              ? "OLD"
              : f.ageSec > 300
              ? "STALE"
              : "FRESH",
        })),
      },
      runtimeAudit: runtimeAuditSummary,
      liveReadiness: liveReadinessResult,
      exchangeReadiness: exchangeReadinessResult,
      m0bPreflight: m0bPreflightResult,
      operatorEvidence: operatorEvidenceResult,
      errors: health.errors.map(safeError),
      warnings: health.warnings.map(safeError),
      nextActions: health.nextActions,
    };

    return NextResponse.json(body, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error in health check";

    console.error("[/api/health] Unexpected error:", message);

    return NextResponse.json(
      {
        healthy: false,
        severity: "fatal",
        version: HEALTH_ENDPOINT_VERSION,
        checkedAt: new Date().toISOString(),
        safetyFlags: {
          liveTradingEnabled: false,
          paperTradingEnabled: "not_confirmed",
          productionTradingReady: false,
          nodeEnv: process.env.NODE_ENV ?? "unknown",
        },
        runtimeAudit: null,
        liveReadiness: null,
        exchangeReadiness: null,
        m0bPreflight: null,
        operatorEvidence: null,
        errors: [
          {
            code: "MISSING_ROOT_FILE",
            severity: "fatal",
            message: "Health check failed due to unexpected error",
            nextAction: "Check server logs for error details",
          },
        ],
        warnings: [],
        nextActions: ["Check server logs for error details"],
      },
      { status: 200 }
    );
  }
}
