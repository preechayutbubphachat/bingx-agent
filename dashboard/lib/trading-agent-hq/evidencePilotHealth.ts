// dashboard/lib/trading-agent-hq/evidencePilotHealth.ts
// Phase UI-2.1 / Task C — Evidence Pilot Health (PURE derivation, read-only).
// SAFETY: no I/O, no fetch, no write, no order/live/exchange logic.
// Consumes ONLY existing TrendPaperEvidenceRunnerVM fields. Never mutates anything.

export type RunnerHealthStatus = "healthy" | "warning" | "stale" | "unknown";

export const EXPECTED_INTERVAL_MINUTES = 15;
export const HEALTHY_MAX_AGE_MINUTES = 25;
export const WARNING_MAX_AGE_MINUTES = 45;

export interface RunnerHealth {
  status: RunnerHealthStatus;
  /** whole minutes since lastRunAt; null when lastRunAt is missing/invalid */
  minutesSinceLastRun: number | null;
  /** Thai display label for the status */
  labelTh: string;
}

const LABEL_TH: Record<RunnerHealthStatus, string> = {
  healthy: "ปกติ (รันตามรอบ)",
  warning: "ช้ากว่ารอบ (เฝ้าดู)",
  stale: "ขาดรอบนาน (stale)",
  unknown: "ยังไม่มีข้อมูลรอบรัน",
};

/**
 * Derive runner heartbeat health from lastRunAt age.
 * healthy: age <= 25 min · warning: 25–45 min · stale: > 45 min · unknown: no/invalid timestamp.
 * Pure function — caller supplies nowMs (testable, SSR-safe).
 */
export function computeRunnerHealth(lastRunAt: string | null | undefined, nowMs: number): RunnerHealth {
  if (!lastRunAt) return { status: "unknown", minutesSinceLastRun: null, labelTh: LABEL_TH.unknown };
  const t = Date.parse(lastRunAt);
  if (!Number.isFinite(t)) return { status: "unknown", minutesSinceLastRun: null, labelTh: LABEL_TH.unknown };
  const ageMin = Math.max(0, Math.floor((nowMs - t) / 60_000));
  const status: RunnerHealthStatus =
    ageMin <= HEALTHY_MAX_AGE_MINUTES ? "healthy" : ageMin <= WARNING_MAX_AGE_MINUTES ? "warning" : "stale";
  return { status, minutesSinceLastRun: ageMin, labelTh: LABEL_TH[status] };
}
