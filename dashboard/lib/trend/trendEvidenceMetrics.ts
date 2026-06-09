// dashboard/lib/trend/trendEvidenceMetrics.ts
// Phase T-3H-2 — trend paper EVIDENCE metrics (closed-trade statistics for win-rate / expectancy analysis).
// Pure: no I/O. Consumes closed trend trades (from trend_paper_journal closing events only).
// expectancyR = (winRate × avgWinR) − ((1 − winRate) × |avgLossR|)
// Hard rule: do NOT classify strategy good/bad before 30 closed trades (sample-status gate).

import type { TrendClosedTradeInput } from "./trendEdgeReview.ts";

export type TrendEvidenceSampleStatus =
  | "INSUFFICIENT_SAMPLE_BOOTSTRAP" // < 5
  | "BEHAVIOR_CHECK_ONLY" // 5–9
  | "EARLY_SIGNAL_ONLY" // 10–29
  | "FIRST_STATISTICAL_READ" // 30–99
  | "USABLE_EVIDENCE"; // 100+

/** Sample-size gate. Never allow an edge conclusion below 30 closed trades. */
export function classifyTrendEvidenceSample(closedTrades: number): TrendEvidenceSampleStatus {
  const n = Number.isFinite(closedTrades) ? closedTrades : 0;
  if (n < 5) return "INSUFFICIENT_SAMPLE_BOOTSTRAP";
  if (n < 10) return "BEHAVIOR_CHECK_ONLY";
  if (n < 30) return "EARLY_SIGNAL_ONLY";
  if (n < 100) return "FIRST_STATISTICAL_READ";
  return "USABLE_EVIDENCE";
}

export interface TrendEvidenceMetrics {
  trendClosedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  expectancyR: number | null; // gross R expectancy
  netExpectancyAfterCosts: number | null; // mean net R (decisive metric)
  profitFactor: number | null;
  maxDrawdownR: number | null;
  maxConsecutiveLosses: number | null;
  averageHoldTimeMinutes: number | null;
  byDirection: Record<string, { count: number; netRSum: number }>;
  byExitReason: Record<string, { count: number; netRSum: number }>;
  sampleStatus: TrendEvidenceSampleStatus;
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
  notes: string[];
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function netR(t: TrendClosedTradeInput): number {
  return finite(t.netRMultiple) ? t.netRMultiple : t.rMultiple;
}

function bump(map: Record<string, { count: number; netRSum: number }>, key: string | null | undefined, r: number) {
  const k = typeof key === "string" && key.length > 0 ? key : "unknown";
  const b = map[k] ?? { count: 0, netRSum: 0 };
  b.count += 1;
  b.netRSum += r;
  map[k] = b;
}

const EMPTY_NOTE = [
  "win rate alone is not enough — netExpectancyAfterCosts is the decisive metric",
  "no edge conclusion before 30 closed trades (sampleStatus gate)",
];

export function buildTrendEvidenceMetrics(
  closedTrades: TrendClosedTradeInput[] | null | undefined,
): TrendEvidenceMetrics {
  const base = {
    paperOnly: true as const,
    liveActivationAllowed: false as const,
    exchangeOrderAllowed: false as const,
  };
  const trades = Array.isArray(closedTrades) ? closedTrades.filter((t) => t && finite(t.rMultiple)) : [];
  const n = trades.length;
  const empty: TrendEvidenceMetrics = {
    trendClosedTrades: n,
    wins: 0, losses: 0, breakeven: 0,
    winRate: null, avgWinR: null, avgLossR: null,
    expectancyR: null, netExpectancyAfterCosts: null, profitFactor: null,
    maxDrawdownR: null, maxConsecutiveLosses: null, averageHoldTimeMinutes: null,
    byDirection: {}, byExitReason: {},
    sampleStatus: classifyTrendEvidenceSample(n),
    ...base,
    notes: EMPTY_NOTE,
  };
  if (n === 0) return empty;

  const wins = trades.filter((t) => netR(t) > 0);
  const losses = trades.filter((t) => netR(t) < 0);
  const breakeven = trades.filter((t) => netR(t) === 0);

  const winRate = wins.length / n;
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + netR(t), 0) / wins.length : null;
  const avgLossR = losses.length > 0 ? losses.reduce((s, t) => s + netR(t), 0) / losses.length : null;

  const expectancyR = trades.reduce((s, t) => s + t.rMultiple, 0) / n; // gross
  const netExpectancyAfterCosts = trades.reduce((s, t) => s + netR(t), 0) / n;

  const grossProfit = wins.reduce((s, t) => s + netR(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + netR(t), 0));
  const profitFactor = grossLoss > 1e-9 ? grossProfit / grossLoss : null;

  // equity-curve drawdown (net R) + consecutive losses
  let equity = 0, peak = 0, maxDrawdownR = 0, consec = 0, maxConsecutiveLosses = 0;
  for (const t of trades) {
    const r = netR(t);
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdownR) maxDrawdownR = dd;
    if (r < 0) {
      consec += 1;
      if (consec > maxConsecutiveLosses) maxConsecutiveLosses = consec;
    } else {
      consec = 0;
    }
  }

  const holdTimes = trades.map((t) => t.holdTimeMinutes).filter((v): v is number => finite(v));
  const averageHoldTimeMinutes = holdTimes.length > 0 ? holdTimes.reduce((s, v) => s + v, 0) / holdTimes.length : null;

  const byDirection: Record<string, { count: number; netRSum: number }> = {};
  const byExitReason: Record<string, { count: number; netRSum: number }> = {};
  for (const t of trades) {
    const r = netR(t);
    bump(byDirection, t.direction, r);
    bump(byExitReason, t.exitReason ?? t.failureLabel, r);
  }

  const notes = [...EMPTY_NOTE];
  if (averageHoldTimeMinutes == null) notes.push("averageHoldTimeMinutes null — closed events missing holdTimeMinutes (gap)");
  notes.push("MAE/MFE not included — requires running-extreme tracking in evidence runner (T-3H-3 gap)");

  return {
    trendClosedTrades: n,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate,
    avgWinR,
    avgLossR,
    expectancyR,
    netExpectancyAfterCosts,
    profitFactor,
    maxDrawdownR,
    maxConsecutiveLosses,
    averageHoldTimeMinutes,
    byDirection,
    byExitReason,
    sampleStatus: classifyTrendEvidenceSample(n),
    ...base,
    notes,
  };
}
