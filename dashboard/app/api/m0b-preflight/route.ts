/**
 * /api/m0b-preflight
 * Phase M-0B Preflight Gate — GET endpoint
 *
 * Safety guarantees:
 * - NO network calls to BingX or any exchange
 * - NO secret values in response (presence only)
 * - NO stack trace exposed to client
 * - NO order placement path touched
 * - เสมอ HTTP 200 — status บอก state, ไม่ใช่ HTTP code
 *
 * ใช้ร่วมกับ /api/health เพื่อ operator monitoring
 */

import { NextResponse } from "next/server";
import { evaluateM0BPreflight } from "@/lib/m0bPreflight";
import { computePaperPerformance } from "@/lib/paperPerformance";

export const dynamic = "force-dynamic";

const ENDPOINT_VERSION = "1.0.0";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    // ── Try to load paper quality (read-only, no network)
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
      // swallow — paper quality is optional; preflight still runs with null quality
      paperDataQuality = null;
    }

    // ── Run preflight (pure function, no network)
    const report = evaluateM0BPreflight({ paperDataQuality });

    return NextResponse.json(
      {
        ...report,
        // Extra metadata for operator clarity
        endpointVersion: ENDPOINT_VERSION,
        // Explicit safety reminders in response
        _notice:
          "Phase M-0B = planning/approval gate only. NO exchange API calls. NO order placement.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    // Unexpected error — never expose stack trace
    const message =
      err instanceof Error ? err.message : "Unknown error in m0b-preflight";

    console.error("[/api/m0b-preflight] Unexpected error:", message);

    return NextResponse.json(
      {
        ok: false,
        readOnly: true,
        noExchangeApiCalls: true,
        status: "BLOCKED",
        phase: "M-0B Preflight",
        gates: [],
        blockers: ["preflight check failed — ตรวจ server logs"],
        warnings: [],
        nextActions: ["ตรวจ server logs สำหรับ error details"],
        safetyFlags: {
          liveTradingEnabled: false,
          enableOrderPlacement: false,
          productionTradingReady: false,
          shadowLiveEnabled: false,
          exchangeReadonlySyncEnabled: false,
          manualApprovalStatus: "not_approved",
        },
        paperQuality: {
          hasAverageFillPrice: null,
          hasClosedTrades: null,
          qualityStatus: null,
          checkedAt,
        },
        credentialReadiness: {
          hasReadOnlyApiKey: false,
          hasReadOnlySecret: false,
          approvalStatus: "not_approved",
        },
        endpointVersion: ENDPOINT_VERSION,
        checkedAt,
        error: {
          code: "PREFLIGHT_ERROR",
          message: "Preflight check encountered an unexpected error",
        },
      },
      { status: 200 }
    );
  }
}
