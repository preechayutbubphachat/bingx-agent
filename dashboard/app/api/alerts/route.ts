/**
 * /api/alerts
 * Phase G — Extended Monitoring & Alerts
 *
 * GET /api/alerts — คืน alert list ปัจจุบัน
 *
 * Response (200 เสมอ — ไม่ว่าจะมี alert หรือไม่):
 * {
 *   ok: true,
 *   alerts: Alert[],
 *   summary: AlertSummary,
 *   checkedAt: string (ISO),
 * }
 *
 * ใช้สำหรับ:
 *   - External monitoring (uptime tool, Slack webhook)
 *   - Client-side polling แบบ lightweight
 *   - /api/health ดูสถานะระบบ — /api/alerts ดูว่าต้องทำอะไร
 *
 * Safety:
 *   - ไม่ expose stack trace / full path / credential
 *   - ไม่ trigger action ใด ๆ — READ ONLY
 */

import { NextResponse } from "next/server";
import { readLatest } from "@/lib/readLatest";
import { readSchedulerHeartbeat } from "@/lib/readSchedulerHeartbeat";
import { computeAlerts, summarizeAlerts } from "@/lib/alertEngine";
import type { FreshnessInput } from "@/lib/alertEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildFreshnessInput(latest: Awaited<ReturnType<typeof readLatest>>): FreshnessInput {
  if (!latest.ok) {
    return {
      tag: "MISSING",
      ageSec: null,
      hasDecision: false,
      hasSnapshot: false,
    };
  }

  const freshness = latest.freshness as
    | { tag?: FreshnessInput["tag"]; ageSec?: number | null }
    | undefined;

  return {
    tag: freshness?.tag ?? "UNKNOWN",
    ageSec: freshness?.ageSec ?? null,
    hasDecision: Boolean(latest.decision),
    hasSnapshot: Boolean(latest.marketSnapshot),
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    // อ่านข้อมูล (parallel)
    const [latest, heartbeat] = await Promise.all([
      readLatest(),
      readSchedulerHeartbeat(),
    ]);

    // สร้าง FreshnessInput จาก readLatest result
    const freshness: FreshnessInput | null = buildFreshnessInput(latest);

    const alerts = computeAlerts(freshness, heartbeat);
    const summary = summarizeAlerts(alerts);

    return NextResponse.json(
      {
        ok: true,
        alerts,
        summary,
        checkedAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    // Unexpected error — ไม่ expose details
    const message =
      err instanceof Error ? err.message : "Unknown error in alerts endpoint";

    console.error("[/api/alerts] Unexpected error:", message);

    return NextResponse.json(
      {
        ok: false,
        alerts: [],
        summary: {
          total: 0,
          fatal: 0,
          critical: 0,
          warning: 0,
          info: 0,
          highestSeverity: "none",
        },
        checkedAt,
        error: "alerts endpoint encountered an unexpected error",
      },
      { status: 200 }
    );
  }
}
