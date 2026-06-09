// dashboard/lib/trend/trendEdgeReview.ts
// Phase T-4 Metrics Shadow Contract — read-only trend edge / expectancy evaluator.
// Pure: no I/O, NO journal read/write, no order, no fill simulation, no live.
// Evidence comes ONLY from closed trend paper trades (which do not exist yet → NO_DATA / INSUFFICIENT_DATA).
// Hard invariants: paperActivationAllowed=false, liveActivationAllowed=false.
// Trend evidence NEVER unlocks grid; grid evidence NEVER unlocks trend; old grid exposure stays quarantined.

export type TrendEdgeReviewStatus =
  | "NO_DATA"
  | "INSUFFICIENT_DATA"
  | "EARLY_SAMPLE"
  | "USABLE_SAMPLE"
  | "REVIEW_SAMPLE"
  | "PRODUCTION_CANDIDATE_REVIEW";

export type TrendEdgeReviewDecision =
  | "HOLD"
  | "CONTINUE_PAPER"
  | "PARAMETER_REVIEW"
  | "PAUSE_STRATEGY"
  | "READY_FOR_LIMITED_CANARY_REVIEW";

export type TrendEdgeSampleTier = "none" | "early" | "usable" | "review" | "production_candidate";

/** One CLOSED trend paper trade (final, after all partials). Source = trend_paper_journal closing events only. */
export interface TrendClosedTradeInput {
  /** gross R-multiple (before costs) */
  rMultiple: number;
  /** net R-multiple after fee+slippage(+funding). Falls back to rMultiple when absent. */
  netRMultiple?: number | null;
  feeCost?: number | null;
  slippageCost?: number | null;
  fundingCost?: number | null;
  /** failure taxonomy label — only for losing/aborted trades */
  failureLabel?: string | null;
  regime?: string | null;
  session?: string | null;
  indicatorState?: string | null;
  zoneQuality?: string | null;
  confirmationType?: string | null;
  // T-3H-2 evidence enrichment (optional)
  holdTimeMinutes?: number | null;
  direction?: "LONG" | "SHORT" | null;
  exitReason?: string | null;
}

export interface TrendEdgeReviewInput {
  /** closed trend paper trades. null/undefined OR journalExists=false → NO_DATA. [] (present, empty) → INSUFFICIENT_DATA. */
  closedTrades: TrendClosedTradeInput[] | null | undefined;
  /** whether a trend_paper_journal source is present/readable. Default: inferred from closedTrades != null. */
  journalExists?: boolean;
  /** fractional risk per trade for risk-of-ruin estimate (default 0.01 = 1%). */
  riskPerTradeFraction?: number;
  /** minimum net expectancy (R) margin required to consider canary-ready (default 0.05R). */
  minNetExpectancyR?: number;
  /** max acceptable maxDrawdownR for canary-ready (default 8R). */
  maxAcceptableDrawdownR?: number;
}

export interface TrendEdgeAttributionBucket {
  count: number;
  netRSum: number;
}

export interface TrendEdgeReview {
  phase: "T-4_EDGE_REVIEW";
  status: TrendEdgeReviewStatus;
  trendClosedTrades: number;
  sampleTier: TrendEdgeSampleTier;
  winRate: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  expectancyR: number | null;
  netExpectancyAfterCosts: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  maxConsecutiveLosses: number | null;
  riskOfRuinEstimate: number | null;
  costDrag: number | null;
  slippageAttribution: number | null;
  fundingAttribution: number | null;
  failureTaxonomy: Record<string, number>;
  attribution: {
    byRegime: Record<string, TrendEdgeAttributionBucket>;
    bySession: Record<string, TrendEdgeAttributionBucket>;
    byIndicatorState: Record<string, TrendEdgeAttributionBucket>;
    byTrendZoneQuality: Record<string, TrendEdgeAttributionBucket>;
    byConfirmationType: Record<string, TrendEdgeAttributionBucket>;
  };
  decision: TrendEdgeReviewDecision;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  /** explicit reminder: trend evidence never unlocks grid, grid evidence never unlocks trend */
  unlocksGrid: false;
  unlocksLive: false;
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  notes: string[];
}

const DEFAULT_RISK_FRACTION = 0.01;
const DEFAULT_MIN_NET_EXP_R = 0.05;
const DEFAULT_MAX_DD_R = 8;

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function tierFor(n: number): { tier: TrendEdgeSampleTier; status: TrendEdgeReviewStatus } {
  if (n <= 0) return { tier: "none", status: "INSUFFICIENT_DATA" };
  if (n < 10) return { tier: "early", status: "EARLY_SAMPLE" };
  if (n < 20) return { tier: "usable", status: "USABLE_SAMPLE" };
  if (n < 30) return { tier: "review", status: "REVIEW_SAMPLE" };
  return { tier: "production_candidate", status: "PRODUCTION_CANDIDATE_REVIEW" };
}

function bump(map: Record<string, TrendEdgeAttributionBucket>, key: string | null | undefined, netR: number): void {
  const k = (typeof key === "string" && key.length > 0) ? key : "unknown";
  const b = map[k] ?? { count: 0, netRSum: 0 };
  b.count += 1;
  b.netRSum += netR;
  map[k] = b;
}

/**
 * Rough risk-of-ruin estimate using the gambler's-ruin approximation for fixed-fractional sizing.
 * Returns null unless the sample is large enough (>=30) to be even loosely meaningful.
 * Conservative: clamps to [0,1]; returns 1 when expectancy <= 0.
 */
function estimateRiskOfRuin(
  count: number,
  winRate: number,
  avgWinR: number,
  avgLossR: number,
  riskFraction: number,
): number | null {
  if (count < 30) return null;
  const lossRate = 1 - winRate;
  const payoff = Math.abs(avgLossR) > 1e-9 ? avgWinR / Math.abs(avgLossR) : 0;
  // edge per the classic approximation: A = (W*payoff - L) / (payoff)
  const edge = payoff > 0 ? (winRate * payoff - lossRate) / payoff : -1;
  if (!Number.isFinite(edge) || edge <= 0) return 1;
  // units of capital = 1 / riskFraction
  const units = riskFraction > 0 ? 1 / riskFraction : 100;
  const base = (1 - edge) / (1 + edge); // in (0,1) when edge in (0,1)
  const ror = Math.pow(base, units);
  if (!Number.isFinite(ror)) return 0;
  return Math.min(1, Math.max(0, ror));
}

function emptyReview(
  status: TrendEdgeReviewStatus,
  tier: TrendEdgeSampleTier,
  notes: string[],
): TrendEdgeReview {
  return {
    phase: "T-4_EDGE_REVIEW",
    status,
    trendClosedTrades: 0,
    sampleTier: tier,
    winRate: null,
    averageWinR: null,
    averageLossR: null,
    expectancyR: null,
    netExpectancyAfterCosts: null,
    profitFactor: null,
    maxDrawdownR: null,
    maxConsecutiveLosses: null,
    riskOfRuinEstimate: null,
    costDrag: null,
    slippageAttribution: null,
    fundingAttribution: null,
    failureTaxonomy: {},
    attribution: {
      byRegime: {},
      bySession: {},
      byIndicatorState: {},
      byTrendZoneQuality: {},
      byConfirmationType: {},
    },
    decision: "HOLD",
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    unlocksGrid: false,
    unlocksLive: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    notes,
  };
}

export function evaluateTrendEdgeReview(input: TrendEdgeReviewInput): TrendEdgeReview {
  const journalExists = input.journalExists ?? (input.closedTrades != null);

  // NO_DATA — journal source missing/unreadable (no T-3 execution wired yet)
  if (!journalExists || input.closedTrades == null) {
    return emptyReview("NO_DATA", "none", [
      "ยังไม่มี trend_paper_journal (T-3 execution ยังไม่เริ่ม) — ไม่มีหลักฐานให้ประเมิน",
      "shadow read-only · ไม่ส่งคำสั่ง ไม่เขียน journal ไม่จำลอง fill",
    ]);
  }

  const trades = input.closedTrades.filter((t) => t && finite(t.rMultiple));
  const n = trades.length;

  // INSUFFICIENT_DATA — journal present but 0 closed trades (current expected runtime state)
  if (n === 0) {
    return emptyReview("INSUFFICIENT_DATA", "none", [
      "trend journal พร้อมแต่ยังไม่มี closed trade — trendClosedTrades = 0",
      "shadow read-only · ยังประเมิน edge ไม่ได้ · คง HOLD",
    ]);
  }

  const riskFraction = input.riskPerTradeFraction ?? DEFAULT_RISK_FRACTION;
  const minNetExpR = input.minNetExpectancyR ?? DEFAULT_MIN_NET_EXP_R;
  const maxAcceptableDD = input.maxAcceptableDrawdownR ?? DEFAULT_MAX_DD_R;

  const netR = (t: TrendClosedTradeInput): number => (finite(t.netRMultiple) ? t.netRMultiple : t.rMultiple);

  const wins = trades.filter((t) => netR(t) > 0);
  const losses = trades.filter((t) => netR(t) <= 0);

  const winRate = n > 0 ? wins.length / n : null;
  const averageWinR = wins.length > 0 ? wins.reduce((s, t) => s + netR(t), 0) / wins.length : null;
  const averageLossR = losses.length > 0 ? losses.reduce((s, t) => s + netR(t), 0) / losses.length : null;

  // gross expectancy (R) vs net expectancy (R) — net is the decisive edge metric
  const expectancyR = trades.reduce((s, t) => s + t.rMultiple, 0) / n;
  const netExpectancyAfterCosts = trades.reduce((s, t) => s + netR(t), 0) / n;
  const costDrag = expectancyR - netExpectancyAfterCosts;

  // profit factor on net R; null when no losses (undefined denominator)
  const grossProfit = wins.reduce((s, t) => s + netR(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + netR(t), 0));
  const profitFactor = grossLoss > 1e-9 ? grossProfit / grossLoss : null;

  // max drawdown (R) from cumulative net-R equity curve (input order)
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  let consec = 0;
  let maxConsecutiveLosses = 0;
  for (const t of trades) {
    const r = netR(t);
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdownR) maxDrawdownR = dd;
    if (r <= 0) {
      consec += 1;
      if (consec > maxConsecutiveLosses) maxConsecutiveLosses = consec;
    } else {
      consec = 0;
    }
  }

  const slippageAttribution = trades.reduce((s, t) => s + (finite(t.slippageCost) ? t.slippageCost : 0), 0);
  const fundingAttribution = trades.reduce((s, t) => s + (finite(t.fundingCost) ? t.fundingCost : 0), 0);

  const failureTaxonomy: Record<string, number> = {};
  const attribution: TrendEdgeReview["attribution"] = {
    byRegime: {},
    bySession: {},
    byIndicatorState: {},
    byTrendZoneQuality: {},
    byConfirmationType: {},
  };
  for (const t of trades) {
    const r = netR(t);
    if (typeof t.failureLabel === "string" && t.failureLabel.length > 0) {
      failureTaxonomy[t.failureLabel] = (failureTaxonomy[t.failureLabel] ?? 0) + 1;
    }
    bump(attribution.byRegime, t.regime, r);
    bump(attribution.bySession, t.session, r);
    bump(attribution.byIndicatorState, t.indicatorState, r);
    bump(attribution.byTrendZoneQuality, t.zoneQuality, r);
    bump(attribution.byConfirmationType, t.confirmationType, r);
  }

  const riskOfRuinEstimate =
    winRate != null && averageWinR != null && averageLossR != null
      ? estimateRiskOfRuin(n, winRate, averageWinR, averageLossR, riskFraction)
      : null;

  const { tier, status } = tierFor(n);

  // Decision — netExpectancyAfterCosts is the main edge metric; confidence rises with sample.
  let decision: TrendEdgeReviewDecision;
  const notes: string[] = [];
  if (tier === "early" || tier === "usable") {
    decision = "HOLD";
    notes.push("sample < review (20) — ยังประเมิน edge ไม่ได้ คง HOLD เก็บต่อ");
  } else if (tier === "review") {
    if (netExpectancyAfterCosts > 0) {
      decision = "CONTINUE_PAPER";
      notes.push("review sample + net expectancy > 0 (ความเชื่อมั่นต่ำ) — เก็บ paper ต่อ");
    } else {
      decision = "PARAMETER_REVIEW";
      notes.push("review sample + net expectancy ≤ 0 — ทบทวน parameter/attribution ก่อน (ยังไม่ pause)");
    }
  } else {
    // production_candidate (>=30)
    const ddOk = maxDrawdownR <= maxAcceptableDD;
    const ruinOk = riskOfRuinEstimate == null || riskOfRuinEstimate <= 0.05;
    if (netExpectancyAfterCosts <= 0) {
      decision = "PAUSE_STRATEGY";
      notes.push("production-candidate sample + net expectancy ≤ 0 — หยุด trend strategy");
    } else if (netExpectancyAfterCosts < minNetExpR || !ddOk || !ruinOk) {
      decision = "PARAMETER_REVIEW";
      notes.push("net expectancy บวกแต่ margin/drawdown/risk-of-ruin ยังไม่ผ่านเกณฑ์ — review parameter");
    } else {
      decision = "READY_FOR_LIMITED_CANARY_REVIEW";
      notes.push("หลักฐานพอ + net expectancy > เกณฑ์ + drawdown/ruin ยอมรับได้ — เสนอ operator review (ยังไม่ใช่ live)");
    }
  }
  notes.push("trend evidence ไม่ปลดล็อก grid · grid evidence ไม่ปลดล็อก trend · old grid exposure quarantined · live ห้ามตลอด");

  return {
    phase: "T-4_EDGE_REVIEW",
    status,
    trendClosedTrades: n,
    sampleTier: tier,
    winRate,
    averageWinR,
    averageLossR,
    expectancyR,
    netExpectancyAfterCosts,
    profitFactor,
    maxDrawdownR,
    maxConsecutiveLosses,
    riskOfRuinEstimate,
    costDrag,
    slippageAttribution,
    fundingAttribution,
    failureTaxonomy,
    attribution,
    decision,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    unlocksGrid: false,
    unlocksLive: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    notes,
  };
}
