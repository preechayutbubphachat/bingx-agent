/**
 * paperPerformance.ts
 * Phase L+ — Attribution Depth & Edge Diagnostics
 * (builds on Phase L Foundation)
 *
 * Read-only performance metrics engine สำหรับ paper trading
 * คำนวณ expectancy, attribution by mode/regime/session,
 * failure reasons, edge diagnostics, costGate, noTrade diagnostics
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียน / ไม่แก้ / ไม่ลบ ไฟล์ใดเลย
 * - ไม่ call BingX API
 * - ไม่มี API key / secret
 * - paper PnL ≠ live PnL เสมอ
 * - ห้ามสรุปว่า strategy has edge ถ้า sample ไม่พอ
 * - errors ถูก swallow + รายงานใน warnings[]
 * - default edgeStatus = "unproven"
 * - default costDragStatus = "ok" (not enough data)
 * - sample < 30 closed cycles → unproven / insufficient เสมอ
 *
 * Data source: readPaperJournal (audit log fills)
 * Optional PnL log: <BINGX_AGENT_DIR>/paper_pnl.jsonl
 */

import * as fs from "fs/promises";
import * as path from "path";
import { readPaperJournal, type PaperEventSummary } from "@/lib/readPaperJournal";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EdgeStatus =
  | "unproven"
  | "negative"
  | "positive_unconfirmed"
  | "positive_candidate"
  | "regime_specific_candidate"
  | "cost_dragged"
  | "sample_insufficient"
  | "blocked_by_drawdown";

export type SampleSizeStatus =
  | "insufficient_data"
  | "early_sample"
  | "usable_sample"
  | "robust_sample";

export type CostDragStatus = "ok" | "cost_drag_high" | "critical_cost_drag";

export type NoTradeReason =
  | "data_missing"
  | "regime_unclear"
  | "cost_too_high"
  | "spread_too_high"
  | "slippage_too_high"
  | "volatility_extreme"
  | "funding_risk"
  | "news_risk"
  | "runtime_audit_critical"
  | "cost_exceeds_edge"
  | "paper_edge_unproven"
  | "insufficient_paper_edge";

export type FailureReason =
  | "fee_drag"
  | "slippage_drag"
  | "funding_drag"
  | "breakout_against_neutral_grid"
  | "false_trend_signal"
  | "mode_switch_late"
  | "mode_switch_too_frequent"
  | "high_volatility_whipsaw"
  | "stale_signal"
  | "insufficient_data"
  | "unknown_failure";

export type TradingMode =
  | "NEUTRAL_GRID"
  | "LONG_GRID"
  | "SHORT_GRID"
  | "PAUSE"
  | "MONITOR"
  | "UNKNOWN";

export type MarketRegime =
  | "RANGE"
  | "UPTREND"
  | "DOWNTREND"
  | "HIGH_VOL"
  | "LOW_VOL"
  | "EVENT_RISK"
  | "UNKNOWN";

export type TradingSession =
  | "ASIA"
  | "LONDON"
  | "NEW_YORK"
  | "OVERLAP_LN"
  | "OVERLAP_NY"
  | "LOW_LIQUIDITY"
  | "UNKNOWN";

/** Per-bucket attribution (mode/regime/session) */
export type AttributionBucket = {
  label: string;
  count: number;
  grossPnl: number | null;
  totalCost: number | null;
  netPnl: number | null;
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  costToGrossProfitRatio: number | null;
  dataAvailable: boolean;
  sampleWarning: string | null;
};

/** Cost gate — compares roundTripCostPct vs gridSpacingPct */
export type CostGate = {
  status: "pass" | "fail" | "warn" | "unknown";
  roundTripCostPct: number;
  gridSpacingPct: number | null;
  requiredMinSpacingPct: number;
  pass: boolean | null;
  warning: string | null;
  nextAction: string;
};

/** Failure reason entry */
export type FailureEntry = {
  reason: FailureReason;
  count: number;
  pct: number;
};

/** Edge diagnostics */
export type EdgeDiagnostics = {
  status: EdgeStatus;
  closedCycles: number;
  sampleSizeStatus: SampleSizeStatus;
  expectancy: number | null;
  netPnl: number | null;
  maxDrawdown: number | null;
  costToGrossProfitRatio: number | null;
  dominantMode: string | null;
  dominantRegime: string | null;
  positiveRegimes: string[];
  negativeRegimes: string[];
  summary: string;
};

/** No-trade diagnostics */
export type NoTradeDiagnostics = {
  hasNoTradeLogs: boolean;
  noTradeReasonCoverage: NoTradeReason[];
  missingReasons: NoTradeReason[];
  recommendedReasons: NoTradeReason[];
  status: "complete" | "partial" | "missing";
  nextAction: string;
};


/** Paper data quality — ตรวจว่า paper event/fill data มีข้อมูลพอสำหรับ analysis */
export type PaperDataQualityStatus = "insufficient" | "partial" | "usable" | "robust";

export type PaperDataQuality = {
  /** ORDER_FILLED events มี averageFillPrice จริงหรือยัง */
  hasAverageFillPrice: boolean;
  /** มี closed round-trips (BUY+SELL pairs) หรือยัง */
  hasClosedTrades: boolean;
  /** paper events มี mode tag (NEUTRAL_GRID/LONG/SHORT) หรือยัง */
  hasModeTags: boolean;
  /** paper events มี regime tag (RANGE/UPTREND/etc.) หรือยัง */
  hasRegimeTags: boolean;
  /** paper events สามารถ derive session ได้ (ts-based fallback ok) */
  hasSessionTags: boolean;
  /** paper events หรือ pnl log มี gridSpacingPct หรือยัง */
  hasGridSpacing: boolean;
  /** สามารถ estimate fee/slippage/funding ได้หรือยัง (true ถ้า fills มีราคา) */
  hasCostEstimates: boolean;
  /** มี no-trade reason logs หรือยัง */
  hasNoTradeReasons: boolean;
  /** fields ที่ขาด */
  missingFields: string[];
  /** overall quality status */
  qualityStatus: PaperDataQualityStatus;
  /** action items สำหรับ operator */
  nextActions: string[];
};

export type PaperPerformanceReport = {
  /** true only if data sufficient AND edge not negative */
  ok: boolean;
  /** always true — read-only guarantee */
  readOnly: true;
  /** data availability state */
  status: "no_data" | "insufficient_data" | "has_data";
  // ─── Sample counts ──────────────────────────────────────────────────────
  totalEvents: number;
  totalPaperOrders: number;
  totalPaperFills: number;
  sampleSizeStatus: SampleSizeStatus;
  // ─── PnL metrics ────────────────────────────────────────────────────────
  grossPaperPnl: number | null;
  feeEstimateTotal: number | null;
  slippageEstimateTotal: number | null;
  fundingEstimateTotal: number | null;
  netPaperPnl: number | null;
  // ─── Trade performance metrics ───────────────────────────────────────────
  winRate: number | null;
  lossRate: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  /** expectancy = (winRate × avgWin) − (lossRate × avgLoss) */
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  averageHoldingTime: number | null;
  // ─── Cost metrics ────────────────────────────────────────────────────────
  costToGrossProfitRatio: number | null;
  costDragStatus: CostDragStatus;
  // ─── Enhanced: Cost gate ─────────────────────────────────────────────────
  costGate: CostGate;
  // ─── Enhanced: Edge diagnostics ──────────────────────────────────────────
  edgeStatus: EdgeStatus;
  edgeDiagnostics: EdgeDiagnostics;
  // ─── Enhanced: Attribution depth ─────────────────────────────────────────
  attribution: {
    byMode: AttributionBucket[];
    byRegime: AttributionBucket[];
    bySession: AttributionBucket[];
  };
  // ─── Enhanced: Failure reasons ───────────────────────────────────────────
  failureReasons: FailureEntry[];
  totalLossCycles: number;
  unknownFailurePct: number | null;
  // ─── Enhanced: No-trade diagnostics ─────────────────────────────────────
  noTradeReasons: NoTradeReason[];
  noTradeReadiness: "ready" | "not_ready" | "unknown";
  noTradeDiagnostics: NoTradeDiagnostics;
  // ─── Meta ────────────────────────────────────────────────────────────────
  // ─── L++: Paper data quality ────────────────────────────────────────────────
  paperDataQuality: PaperDataQuality;
  // ─── Meta ────────────────────────────────────────────────────────────────────
  dataAvailableForPnl: boolean;
  pnlSource: "paper_pnl_log" | "fill_pair_estimate" | "none";
  warnings: string[];
  nextActions: string[];
  checkedAt: string;
};

// ─── PnL log entry type (optional: <rootDir>/paper_pnl.jsonl) ────────────────

type PnlLogEntry = {
  ts?: number;
  roundTripId?: string;
  mode?: string;
  regime?: string;
  session?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  quantity?: number;
  entryPrice?: number;
  exitPrice?: number;
  grossPnl?: number;
  fee?: number;
  slippage?: number;
  funding?: number;
  netPnl?: number;
  holdingTimeSec?: number;
  gridSpacingPct?: number;
  failureReason?: string;
  noTradeReason?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Sample thresholds */
const MIN_FILLS_EARLY = 5;
const MIN_FILLS_USABLE = 20;
const MIN_FILLS_ROBUST = 50;
/** Closed cycles needed for meaningful edge assessment */
const MIN_CYCLES_UNPROVEN_THRESHOLD = 30;
const MIN_CYCLES_CONFIRMED_THRESHOLD = 100;

/** BingX BTCUSDT Futures fee estimates */
const MAKER_FEE_PCT = 0.0002;   // 0.02%
const TAKER_FEE_PCT = 0.0005;   // 0.05%
const SLIPPAGE_PCT = 0.0001;    // 0.01% per leg
const FUNDING_PCT = 0.0001;     // 0.01% per 8h

/** Grid spacing minimum */
const GRID_SPACING_MULTIPLIER = 2.5;

/** Cost drag thresholds */
const COST_DRAG_HIGH_THRESHOLD = 0.40;
const COST_DRAG_CRITICAL_THRESHOLD = 0.60;

/** Max drawdown threshold for blocking live gate */
const MAX_DRAWDOWN_BLOCK_THRESHOLD_USD = 500;

/** Unknown failure pct warning threshold */
const UNKNOWN_FAILURE_WARNING_THRESHOLD = 0.5;

/** Required no-trade reasons */
const REQUIRED_NO_TRADE_REASONS: NoTradeReason[] = [
  "data_missing",
  "regime_unclear",
  "spread_too_high",
  "slippage_too_high",
  "funding_risk",
  "news_risk",
  "volatility_extreme",
  "runtime_audit_critical",
  "cost_exceeds_edge",
  "paper_edge_unproven",
];

// ─── Root dir resolution ──────────────────────────────────────────────────────

function resolvePnlLogPath(): string | null {
  const rootDir =
    process.env.BINGX_AGENT_DIR ??
    process.env.DATA_DIR ??
    null;
  if (!rootDir) return null;
  return path.resolve(rootDir, "paper_pnl.jsonl");
}

async function readPnlLog(p: string): Promise<PnlLogEntry[]> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 5000)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          return typeof parsed === "object" && parsed !== null ? [parsed as PnlLogEntry] : [];
        } catch { return []; }
      });
  } catch { return []; }
}

// ─── Session derivation ───────────────────────────────────────────────────────

function deriveSession(tsMs: number): TradingSession {
  const h = new Date(tsMs).getUTCHours();
  const inAsia = h >= 0 && h < 8;
  const inLondon = h >= 7 && h < 16;
  const inNY = h >= 12 && h < 21;
  if (inLondon && inNY) return "OVERLAP_NY";
  if (inAsia && inLondon) return "OVERLAP_LN";
  if (inAsia) return "ASIA";
  if (inLondon) return "LONDON";
  if (inNY) return "NEW_YORK";
  return "LOW_LIQUIDITY";
}

function deriveMode(s: string | null): TradingMode {
  if (!s) return "UNKNOWN";
  const u = s.toUpperCase();
  if (u === "NEUTRAL_GRID" || u === "NEUTRAL") return "NEUTRAL_GRID";
  if (u === "LONG_GRID" || u === "LONG") return "LONG_GRID";
  if (u === "SHORT_GRID" || u === "SHORT") return "SHORT_GRID";
  if (u === "PAUSE") return "PAUSE";
  if (u === "MONITOR") return "MONITOR";
  return "UNKNOWN";
}

function deriveRegime(s: string | null | undefined): MarketRegime {
  if (!s) return "UNKNOWN";
  const u = s.toUpperCase();
  if (u === "RANGE") return "RANGE";
  if (u === "UPTREND" || u === "UP") return "UPTREND";
  if (u === "DOWNTREND" || u === "DOWN") return "DOWNTREND";
  if (u === "HIGH_VOL" || u === "HIGH_VOLATILITY") return "HIGH_VOL";
  if (u === "LOW_VOL" || u === "LOW_VOLATILITY") return "LOW_VOL";
  if (u === "EVENT_RISK" || u === "EVENT") return "EVENT_RISK";
  return "UNKNOWN";
}

function deriveFailureReason(entry: PnlLogEntry, netPnl: number): FailureReason {
  if (entry.failureReason) {
    const r = entry.failureReason as FailureReason;
    const valid: FailureReason[] = [
      "fee_drag", "slippage_drag", "funding_drag",
      "breakout_against_neutral_grid", "false_trend_signal",
      "mode_switch_late", "mode_switch_too_frequent",
      "high_volatility_whipsaw", "stale_signal", "insufficient_data",
      "unknown_failure",
    ];
    if (valid.includes(r)) return r;
  }
  if (netPnl >= 0) return "unknown_failure"; // shouldn't be called for wins
  // Heuristic from cost data
  const fee = entry.fee ?? 0;
  const slippage = entry.slippage ?? 0;
  const funding = entry.funding ?? 0;
  const gross = entry.grossPnl ?? 0;
  if (gross > 0 && fee + slippage > gross) return "fee_drag";
  if (gross > 0 && slippage > gross * 0.5) return "slippage_drag";
  if (gross > 0 && funding > gross * 0.5) return "funding_drag";
  return "unknown_failure";
}

function computeSampleSizeStatus(n: number): SampleSizeStatus {
  if (n < MIN_FILLS_EARLY) return "insufficient_data";
  if (n < MIN_FILLS_USABLE) return "early_sample";
  if (n < MIN_FILLS_ROBUST) return "usable_sample";
  return "robust_sample";
}

// ─── Round-trip types ─────────────────────────────────────────────────────────

type RoundTrip = {
  entryTs: number;
  exitTs: number;
  grossPnl: number;
  fee: number;
  slippage: number;
  funding: number;
  netPnl: number;
  holdingTimeSec: number;
  mode: TradingMode;
  regime: MarketRegime;
  session: TradingSession;
  gridSpacingPct: number | null;
  failureReason: FailureReason | null;
};

function tripsFromPnlLog(entries: PnlLogEntry[]): RoundTrip[] {
  return entries.flatMap((e) => {
    if (typeof e.ts !== "number" || typeof e.netPnl !== "number" || typeof e.grossPnl !== "number") return [];
    const netPnl = e.netPnl;
    return [{
      entryTs: e.ts,
      exitTs: e.ts,
      grossPnl: e.grossPnl,
      fee: e.fee ?? 0,
      slippage: e.slippage ?? 0,
      funding: e.funding ?? 0,
      netPnl,
      holdingTimeSec: e.holdingTimeSec ?? 0,
      mode: deriveMode(e.mode ?? null),
      regime: deriveRegime(e.regime),
      session: e.session ? (e.session.toUpperCase() as TradingSession) : deriveSession(e.ts),
      gridSpacingPct: e.gridSpacingPct ?? null,
      failureReason: netPnl < 0 ? deriveFailureReason(e, netPnl) : null,
    } as RoundTrip];
  });
}

// Fill-pair pairing from audit events
type FillRecord = {
  ts: number; side: "BUY" | "SELL";
  price: number; quantity: number;
  mode: TradingMode; session: TradingSession;
};

function extractFills(events: PaperEventSummary[]): FillRecord[] {
  const fills: FillRecord[] = [];
  for (const ev of events) {
    // Phase M-0Z-2: include FILL_RESULT events (have correct averageFillPrice from syncState)
    if (
      ev.type !== "ORDER_FILLED" &&
      ev.type !== "ORDER_SIMULATED" &&
      ev.type !== "FILL_RESULT"
    ) continue;
    const price = ev.averageFillPrice;
    const qty = ev.filledQuantity ?? ev.quantity;
    if (!price || price <= 0 || !qty || qty <= 0 || !ev.side) continue;
    fills.push({
      ts: ev.ts,
      side: ev.side.toUpperCase() === "SELL" ? "SELL" : "BUY",
      price, quantity: qty,
      mode: deriveMode(ev.mode ?? null),
      session: deriveSession(ev.ts),
    });
  }
  return fills.sort((a, b) => a.ts - b.ts);
}

function pairFills(fills: FillRecord[]): RoundTrip[] {
  const trips: RoundTrip[] = [];
  const buyQ: FillRecord[] = [];
  for (const fill of fills) {
    if (fill.side === "BUY") { buyQ.push(fill); continue; }
    if (!buyQ.length) continue;
    const buy = buyQ.shift()!;
    const qty = Math.min(buy.quantity, fill.quantity);
    const grossPnl = (fill.price - buy.price) * qty;
    const mid = (buy.price + fill.price) / 2 * qty;
    const fee = mid * (MAKER_FEE_PCT + TAKER_FEE_PCT);
    const slippage = mid * SLIPPAGE_PCT * 2;
    const holdSec = (fill.ts - buy.ts) / 1000;
    const fundPeriods = Math.max(0, Math.floor(holdSec / (8 * 3600)));
    const funding = mid * FUNDING_PCT * fundPeriods;
    const netPnl = grossPnl - fee - slippage - funding;
    trips.push({
      entryTs: buy.ts, exitTs: fill.ts,
      grossPnl, fee, slippage, funding, netPnl,
      holdingTimeSec: holdSec,
      mode: buy.mode, regime: "UNKNOWN", session: buy.session,
      gridSpacingPct: null,
      failureReason: netPnl < 0 ? "unknown_failure" : null,
    });
  }
  return trips;
}

// ─── Metrics computation ──────────────────────────────────────────────────────

type Metrics = {
  grossPnl: number; feeTotal: number; slippageTotal: number;
  fundingTotal: number; netPnl: number;
  winRate: number | null; lossRate: number | null;
  avgWin: number | null; avgLoss: number | null;
  payoffRatio: number | null; expectancy: number | null;
  profitFactor: number | null; maxDrawdown: number;
  avgHoldSec: number | null; costToGrossRatio: number | null;
};

function computeMetrics(trips: RoundTrip[]): Metrics {
  const n = trips.length;
  if (n === 0) return {
    grossPnl: 0, feeTotal: 0, slippageTotal: 0, fundingTotal: 0, netPnl: 0,
    winRate: null, lossRate: null, avgWin: null, avgLoss: null,
    payoffRatio: null, expectancy: null, profitFactor: null,
    maxDrawdown: 0, avgHoldSec: null, costToGrossRatio: null,
  };
  const grossPnl = trips.reduce((s, t) => s + t.grossPnl, 0);
  const feeTotal = trips.reduce((s, t) => s + t.fee, 0);
  const slippageTotal = trips.reduce((s, t) => s + t.slippage, 0);
  const fundingTotal = trips.reduce((s, t) => s + t.funding, 0);
  const netPnl = trips.reduce((s, t) => s + t.netPnl, 0);
  const wins = trips.filter((t) => t.netPnl > 0);
  const losses = trips.filter((t) => t.netPnl <= 0);
  const winRate = wins.length / n;
  const lossRate = losses.length / n;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : null;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.netPnl, 0) / losses.length) : null;
  const payoffRatio = avgWin !== null && avgLoss !== null && avgLoss > 0 ? avgWin / avgLoss : null;
  const expectancy = avgWin !== null && avgLoss !== null
    ? winRate * avgWin - lossRate * avgLoss : null;
  const gWins = wins.reduce((s, t) => s + t.netPnl, 0);
  const gLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = gLoss > 0 ? gWins / gLoss : gWins > 0 ? Infinity : null;
  let peak = 0, equity = 0, maxDrawdown = 0;
  for (const t of trips) {
    equity += t.netPnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const avgHoldSec = n > 0 ? trips.reduce((s, t) => s + t.holdingTimeSec, 0) / n : null;
  const totalCost = feeTotal + slippageTotal + fundingTotal;
  const costToGrossRatio = grossPnl > 0 ? totalCost / grossPnl : null;
  return {
    grossPnl, feeTotal, slippageTotal, fundingTotal, netPnl,
    winRate, lossRate, avgWin, avgLoss, payoffRatio, expectancy,
    profitFactor, maxDrawdown, avgHoldSec, costToGrossRatio,
  };
}

// ─── Attribution builder ──────────────────────────────────────────────────────

function buildBuckets<K extends string>(
  trips: RoundTrip[],
  keyFn: (t: RoundTrip) => K,
  allKeys: K[]
): AttributionBucket[] {
  const map = new Map<K, RoundTrip[]>();
  for (const k of allKeys) map.set(k, []);
  for (const t of trips) {
    const k = keyFn(t);
    const b = map.get(k);
    if (b) b.push(t); else map.set(k, [t]);
  }
  const result: AttributionBucket[] = [];
  for (const [label, bTrips] of map.entries()) {
    if (bTrips.length === 0) {
      result.push({ label, count: 0, grossPnl: null, totalCost: null, netPnl: null,
        winRate: null, expectancy: null, profitFactor: null, maxDrawdown: null,
        costToGrossProfitRatio: null, dataAvailable: false, sampleWarning: "No trades in bucket" });
      continue;
    }
    const m = computeMetrics(bTrips);
    const totalCost = m.feeTotal + m.slippageTotal + m.fundingTotal;
    result.push({
      label, count: bTrips.length,
      grossPnl: m.grossPnl, totalCost,
      netPnl: m.netPnl,
      winRate: m.winRate, expectancy: m.expectancy,
      profitFactor: m.profitFactor, maxDrawdown: m.maxDrawdown,
      costToGrossProfitRatio: m.costToGrossRatio,
      dataAvailable: true,
      sampleWarning: bTrips.length < MIN_FILLS_EARLY
        ? `Sample too small (${bTrips.length} trades) — not reliable`
        : null,
    });
  }
  return result;
}

// ─── Edge diagnostics ─────────────────────────────────────────────────────────

function computeEdgeDiagnostics(
  trips: RoundTrip[],
  metrics: Metrics,
  sampleStatus: SampleSizeStatus,
  costDrag: CostDragStatus
): EdgeDiagnostics {
  const n = trips.length;
  const status = computeEdgeStatus(n, metrics, sampleStatus, costDrag);

  const positiveRegimes: string[] = [];
  const negativeRegimes: string[] = [];
  const regimeMap = new Map<MarketRegime, RoundTrip[]>();
  for (const t of trips) {
    const b = regimeMap.get(t.regime) ?? [];
    b.push(t);
    regimeMap.set(t.regime, b);
  }
  for (const [r, rTrips] of regimeMap.entries()) {
    if (r === "UNKNOWN") continue;
    const m = computeMetrics(rTrips);
    if (m.expectancy !== null && m.expectancy > 0 && rTrips.length >= MIN_FILLS_EARLY) {
      positiveRegimes.push(r);
    } else if (m.netPnl !== null && m.netPnl < 0 && rTrips.length >= MIN_FILLS_EARLY) {
      negativeRegimes.push(r);
    }
  }

  // Find dominant mode/regime by count
  let dominantMode: string | null = null;
  let dominantRegime: string | null = null;
  if (n > 0) {
    const modeCounts = new Map<TradingMode, number>();
    const regimeCounts = new Map<MarketRegime, number>();
    for (const t of trips) {
      modeCounts.set(t.mode, (modeCounts.get(t.mode) ?? 0) + 1);
      regimeCounts.set(t.regime, (regimeCounts.get(t.regime) ?? 0) + 1);
    }
    dominantMode = [...modeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    dominantRegime = [...regimeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  const summaryParts: string[] = [`${n} closed cycles`, `edge: ${status}`];
  if (metrics.expectancy !== null) summaryParts.push(`expectancy: ${metrics.expectancy.toFixed(4)}`);
  if (n < MIN_CYCLES_UNPROVEN_THRESHOLD) summaryParts.push("⚠ sample ไม่พอ — ยังสรุป edge ไม่ได้");

  return {
    status, closedCycles: n, sampleSizeStatus: sampleStatus,
    expectancy: metrics.expectancy, netPnl: metrics.netPnl,
    maxDrawdown: metrics.maxDrawdown, costToGrossProfitRatio: metrics.costToGrossRatio,
    dominantMode, dominantRegime, positiveRegimes, negativeRegimes,
    summary: summaryParts.join(" | "),
  };
}

function computeEdgeStatus(
  n: number, metrics: Metrics,
  sampleStatus: SampleSizeStatus, costDrag: CostDragStatus
): EdgeStatus {
  if (n < MIN_CYCLES_UNPROVEN_THRESHOLD) return "sample_insufficient";
  if (sampleStatus === "insufficient_data") return "sample_insufficient";
  if (metrics.expectancy === null || metrics.netPnl === null) return "unproven";
  if (metrics.expectancy < 0 || metrics.netPnl < 0) return "negative";
  if (metrics.maxDrawdown > MAX_DRAWDOWN_BLOCK_THRESHOLD_USD) return "blocked_by_drawdown";
  if (costDrag === "critical_cost_drag") return "cost_dragged";
  if (n < MIN_CYCLES_CONFIRMED_THRESHOLD) return "positive_unconfirmed";
  if (costDrag === "cost_drag_high") return "cost_dragged";
  return "positive_candidate";
}

// ─── Cost gate ────────────────────────────────────────────────────────────────

function computeCostGate(
  trips: RoundTrip[],
  metrics: Metrics
): CostGate {
  const roundTripCostPct = (MAKER_FEE_PCT + TAKER_FEE_PCT + SLIPPAGE_PCT * 2) * 100;
  const requiredMinSpacingPct = roundTripCostPct * GRID_SPACING_MULTIPLIER;

  // Try to get gridSpacingPct from trips
  const spacings = trips.filter((t) => t.gridSpacingPct !== null).map((t) => t.gridSpacingPct!);
  const gridSpacingPct = spacings.length > 0 ? spacings.reduce((a, b) => a + b, 0) / spacings.length : null;

  if (gridSpacingPct === null) {
    return {
      status: "unknown", roundTripCostPct, gridSpacingPct: null,
      requiredMinSpacingPct, pass: null,
      warning: "gridSpacingPct ไม่มีใน paper log — ไม่สามารถยืนยัน cost gate ได้",
      nextAction: "เพิ่ม gridSpacingPct ใน paper events / config snapshot",
    };
  }

  const pass = gridSpacingPct > requiredMinSpacingPct;
  if (!pass) {
    return {
      status: "fail", roundTripCostPct, gridSpacingPct,
      requiredMinSpacingPct, pass: false,
      warning: `Grid spacing ${gridSpacingPct.toFixed(3)}% ≤ required ${requiredMinSpacingPct.toFixed(3)}% — cost จะกินกำไร`,
      nextAction: "widen_spacing_or_reduce_trade_frequency",
    };
  }

  // Check cost ratio as secondary check
  if (metrics.costToGrossRatio !== null && metrics.costToGrossRatio > COST_DRAG_CRITICAL_THRESHOLD) {
    return {
      status: "warn", roundTripCostPct, gridSpacingPct,
      requiredMinSpacingPct, pass: true,
      warning: `Spacing OK แต่ cost drag ${(metrics.costToGrossRatio * 100).toFixed(1)}% สูงกว่า threshold`,
      nextAction: "Monitor cost drag — ตรวจ slippage และ funding",
    };
  }

  return {
    status: "pass", roundTripCostPct, gridSpacingPct,
    requiredMinSpacingPct, pass: true,
    warning: null,
    nextAction: "Cost gate ผ่าน — monitor ต่อเนื่อง",
  };
}

// ─── Failure reasons ──────────────────────────────────────────────────────────

function computeFailureReasons(trips: RoundTrip[]): { entries: FailureEntry[]; unknownPct: number | null } {
  const losers = trips.filter((t) => t.netPnl < 0);
  if (losers.length === 0) return { entries: [], unknownPct: null };
  const counts = new Map<FailureReason, number>();
  for (const t of losers) {
    const r = t.failureReason ?? "unknown_failure";
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const entries: FailureEntry[] = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count, pct: count / losers.length }))
    .sort((a, b) => b.count - a.count);
  const unknownCount = counts.get("unknown_failure") ?? 0;
  return { entries, unknownPct: unknownCount / losers.length };
}

// ─── No-trade diagnostics ─────────────────────────────────────────────────────

function computeNoTradeDiagnostics(
  pnlEntries: PnlLogEntry[],
  sampleStatus: SampleSizeStatus,
  edgeStatus: EdgeStatus,
  costDrag: CostDragStatus
): { reasons: NoTradeReason[]; readiness: "ready" | "not_ready" | "unknown"; diagnostics: NoTradeDiagnostics } {
  // Extract no-trade reasons from pnl log
  const observedReasons = new Set<NoTradeReason>(
    pnlEntries
      .filter((e) => e.noTradeReason)
      .map((e) => e.noTradeReason as NoTradeReason)
  );

  const hasNoTradeLogs = observedReasons.size > 0;
  const coverage = [...observedReasons];
  const missing = REQUIRED_NO_TRADE_REASONS.filter((r) => !observedReasons.has(r));

  const status: "complete" | "partial" | "missing" =
    !hasNoTradeLogs ? "missing" : missing.length === 0 ? "complete" : "partial";

  // Compute active no-trade reasons
  const reasons: NoTradeReason[] = [];
  if (!hasNoTradeLogs && pnlEntries.length === 0) reasons.push("data_missing");
  if (sampleStatus === "insufficient_data") reasons.push("paper_edge_unproven");
  if (edgeStatus === "negative") reasons.push("paper_edge_unproven");
  if (costDrag === "cost_drag_high" || costDrag === "critical_cost_drag") reasons.push("cost_exceeds_edge");

  const readiness: "ready" | "not_ready" | "unknown" =
    reasons.length === 0 && sampleStatus !== "insufficient_data" ? "ready"
    : reasons.includes("data_missing") ? "unknown"
    : "not_ready";

  const nextAction = status === "missing"
    ? "เพิ่ม no-trade decision logging ใน next phase"
    : status === "partial"
    ? `เพิ่ม no-trade reasons ที่ขาด: ${missing.slice(0, 3).join(", ")}`
    : "No-trade coverage ครบ — monitor ต่อเนื่อง";

  return {
    reasons,
    readiness,
    diagnostics: {
      hasNoTradeLogs, noTradeReasonCoverage: coverage,
      missingReasons: missing, recommendedReasons: REQUIRED_NO_TRADE_REASONS,
      status, nextAction,
    },
  };
}

// ─── Paper Data Quality ──────────────────────────────────────────────────────

function computePaperDataQuality(
  trips: RoundTrip[],
  events: PaperEventSummary[],
  pnlEntries: PnlLogEntry[],
  pnlSource: "paper_pnl_log" | "fill_pair_estimate" | "none"
): PaperDataQuality {
  const missing: string[] = [];
  const actions: string[] = [];

  // hasAverageFillPrice: ตรวจว่า ORDER_FILLED/SIMULATED events มีราคาจริง
  const filledEvents = events.filter((e) =>
    e.type === "ORDER_FILLED" || e.type === "ORDER_SIMULATED"
  );
  const hasAverageFillPrice =
    filledEvents.length > 0 &&
    filledEvents.some((e) => e.averageFillPrice && e.averageFillPrice > 0);
  if (!hasAverageFillPrice) {
    missing.push("averageFillPrice");
    actions.push("รอ ORDER_FILLED events ที่มี averageFillPrice จริง (ไม่ใช่ null)");
  }

  // hasClosedTrades: มี round-trips จริงหรือยัง
  const hasClosedTrades = trips.length > 0;
  if (!hasClosedTrades) {
    missing.push("closed_trades");
    actions.push("ต้องการ closed round-trip trades (BUY→SELL pair) — สะสม paper fills ต่อไป");
  }

  // hasModeTags: paper events หรือ pnl log มี mode field ไม่ใช่ UNKNOWN
  const modeTaggedTrips = trips.filter((t) => t.mode !== "UNKNOWN").length;
  const hasModeTags =
    trips.length > 0
      ? modeTaggedTrips / trips.length >= 0.3  // ≥30% มี tag ถือว่า partially OK
      : pnlEntries.some((e) => e.mode && e.mode.toUpperCase() !== "UNKNOWN");
  if (!hasModeTags) {
    missing.push("mode_tags");
    actions.push("เพิ่ม mode field (NEUTRAL_GRID/LONG_GRID/SHORT_GRID) ใน paper audit events");
  }

  // hasRegimeTags: pnl log มี regime field
  const regimeTaggedTrips = trips.filter((t) => t.regime !== "UNKNOWN").length;
  const hasRegimeTags =
    trips.length > 0
      ? regimeTaggedTrips / trips.length >= 0.3
      : pnlEntries.some((e) => e.regime && e.regime.toUpperCase() !== "UNKNOWN");
  if (!hasRegimeTags) {
    missing.push("regime_tags");
    actions.push("เพิ่ม regime field (RANGE/UPTREND/DOWNTREND/etc.) ใน paper_pnl.jsonl");
  }

  // hasSessionTags: derived from ts — ถ้ามี ts ก็ derive ได้เสมอ
  const hasSessionTags = trips.some((t) => t.session !== "UNKNOWN") ||
    filledEvents.some((e) => e.ts > 0);  // ts มี → session derivable
  // session ไม่ missing เพราะ derive ได้เสมอถ้ามี ts

  // hasGridSpacing: trips หรือ pnl log มี gridSpacingPct
  const hasGridSpacing =
    trips.some((t) => t.gridSpacingPct !== null) ||
    pnlEntries.some((e) => typeof e.gridSpacingPct === "number");
  if (!hasGridSpacing) {
    missing.push("gridSpacingPct");
    actions.push("เพิ่ม gridSpacingPct field ใน paper_pnl.jsonl เพื่อให้ cost gate คำนวณได้");
  }

  // hasCostEstimates: ถ้ามี fills ที่มีราคา → cost estimate คำนวณได้
  const hasCostEstimates = hasAverageFillPrice && hasClosedTrades;
  if (!hasCostEstimates && hasClosedTrades) {
    missing.push("cost_estimates");
    actions.push("ต้องการ averageFillPrice ใน fills เพื่อคำนวณ fee/slippage/funding estimate");
  }

  // hasNoTradeReasons: pnl log มี noTradeReason field
  const hasNoTradeReasons = pnlEntries.some((e) => e.noTradeReason && e.noTradeReason.length > 0);
  if (!hasNoTradeReasons) {
    missing.push("no_trade_reasons");
    actions.push("เพิ่ม no-trade decision logging ใน paper pipeline เพื่อ no-trade diagnostics");
  }

  // qualityStatus
  const missingCount = missing.length;
  let qualityStatus: PaperDataQualityStatus;
  if (!hasAverageFillPrice || !hasClosedTrades) {
    qualityStatus = "insufficient";  // hard block: ไม่มี fills จริง
  } else if (missingCount >= 3) {
    qualityStatus = "partial";
  } else if (missingCount >= 1) {
    qualityStatus = "usable";
  } else {
    qualityStatus = "robust";
  }

  return {
    hasAverageFillPrice,
    hasClosedTrades,
    hasModeTags,
    hasRegimeTags,
    hasSessionTags,
    hasGridSpacing,
    hasCostEstimates,
    hasNoTradeReasons,
    missingFields: missing,
    qualityStatus,
    nextActions: actions,
  };
}

// ─── Safe empty report ────────────────────────────────────────────────────────

function emptyReport(warnings: string[], nextActions: string[], checkedAt: string): PaperPerformanceReport {
  const roundTripCostPct = (MAKER_FEE_PCT + TAKER_FEE_PCT + SLIPPAGE_PCT * 2) * 100;
  return {
    ok: false, readOnly: true, status: "no_data",
    totalEvents: 0, totalPaperOrders: 0, totalPaperFills: 0,
    sampleSizeStatus: "insufficient_data",
    grossPaperPnl: null, feeEstimateTotal: null, slippageEstimateTotal: null,
    fundingEstimateTotal: null, netPaperPnl: null,
    winRate: null, lossRate: null, averageWin: null, averageLoss: null,
    payoffRatio: null, expectancy: null, profitFactor: null,
    maxDrawdown: null, averageHoldingTime: null,
    costToGrossProfitRatio: null, costDragStatus: "ok",
    costGate: {
      status: "unknown", roundTripCostPct, gridSpacingPct: null,
      requiredMinSpacingPct: roundTripCostPct * GRID_SPACING_MULTIPLIER,
      pass: null, warning: "ไม่มีข้อมูล", nextAction: "รอ paper data",
    },
    edgeStatus: "unproven",
    edgeDiagnostics: {
      status: "unproven", closedCycles: 0, sampleSizeStatus: "insufficient_data",
      expectancy: null, netPnl: null, maxDrawdown: null, costToGrossProfitRatio: null,
      dominantMode: null, dominantRegime: null,
      positiveRegimes: [], negativeRegimes: [],
      summary: "ยังไม่มีข้อมูล paper trading",
    },
    attribution: { byMode: [], byRegime: [], bySession: [] },
    failureReasons: [], totalLossCycles: 0, unknownFailurePct: null,
    noTradeReasons: ["data_missing"], noTradeReadiness: "unknown",
    noTradeDiagnostics: {
      hasNoTradeLogs: false, noTradeReasonCoverage: [],
      missingReasons: REQUIRED_NO_TRADE_REASONS,
      recommendedReasons: REQUIRED_NO_TRADE_REASONS,
      status: "missing", nextAction: "รอ paper data และ no-trade logs",
    },
    paperDataQuality: {
      hasAverageFillPrice: false, hasClosedTrades: false,
      hasModeTags: false, hasRegimeTags: false, hasSessionTags: false,
      hasGridSpacing: false, hasCostEstimates: false, hasNoTradeReasons: false,
      missingFields: ["averageFillPrice", "closed_trades", "mode_tags", "regime_tags", "gridSpacingPct", "no_trade_reasons"],
      qualityStatus: "insufficient",
      nextActions: ["รอ paper trading signals — ยังไม่มีข้อมูล"],
    },
    dataAvailableForPnl: false, pnlSource: "none",
    warnings, nextActions, checkedAt,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function computePaperPerformance(): Promise<PaperPerformanceReport> {
  const checkedAt = new Date().toISOString();
  const warnings: string[] = [];
  const nextActions: string[] = [];

  // 1. Read paper journal
  const journal = await readPaperJournal();
  const totalEvents = journal.totalPaperEvents;
  const totalPaperOrders = journal.totalOrderSimulated;
  const totalPaperFills = journal.totalOrderFilled;
  warnings.push(...journal.warnings);

  // 2. Try PnL log (preferred source)
  let trips: RoundTrip[] = [];
  let pnlEntries: PnlLogEntry[] = [];
  let pnlSource: "paper_pnl_log" | "fill_pair_estimate" | "none" = "none";
  const pnlLogPath = resolvePnlLogPath();
  if (pnlLogPath) {
    pnlEntries = await readPnlLog(pnlLogPath);
    if (pnlEntries.length > 0) {
      trips = tripsFromPnlLog(pnlEntries);
      pnlSource = "paper_pnl_log";
    }
  }

  // 3. Fallback: fill-pair estimate
  if (trips.length === 0 && journal.recentEvents && journal.recentEvents.length > 0) {
    const fills = extractFills(journal.recentEvents);
    if (fills.length > 0) {
      trips = pairFills(fills);
      if (trips.length > 0) {
        pnlSource = "fill_pair_estimate";
        warnings.push("PnL computed from fill-pair estimate — approximate only. Not an official ledger.");
      }
    }
  }

  // 4. No data path
  const hasData = totalEvents > 0 || trips.length > 0;
  if (!hasData || journal.status === "no_paper_trades" || journal.status === "paper_mode_disabled") {
    if (journal.status === "paper_mode_disabled") {
      warnings.push("PAPER_TRADING_ENABLED=false — paper mode disabled");
      nextActions.push("เปิด PAPER_TRADING_ENABLED=true ใน .env.local เพื่อเริ่ม paper trading");
    } else {
      nextActions.push("รอ paper trading signals — ยังไม่มีข้อมูล");
    }
    return emptyReport(warnings, nextActions, checkedAt);
  }

  // 5. Compute core metrics
  const sampleSizeStatus = computeSampleSizeStatus(totalPaperFills);
  const dataAvailableForPnl = trips.length > 0;
  const metrics = dataAvailableForPnl ? computeMetrics(trips) : {
    grossPnl: 0, feeTotal: 0, slippageTotal: 0, fundingTotal: 0, netPnl: 0,
    winRate: null, lossRate: null, avgWin: null, avgLoss: null,
    payoffRatio: null, expectancy: null, profitFactor: null,
    maxDrawdown: 0, avgHoldSec: null, costToGrossRatio: null,
  };

  if (!dataAvailableForPnl) {
    warnings.push("ยังไม่มี fill price data — รอ ORDER_FILLED events ที่มี averageFillPrice");
  }

  // 6. Cost drag
  let costDragStatus: CostDragStatus = "ok";
  if (metrics.costToGrossRatio !== null) {
    if (metrics.costToGrossRatio > COST_DRAG_CRITICAL_THRESHOLD) {
      costDragStatus = "critical_cost_drag";
      warnings.push(`Cost drag วิกฤต: ${(metrics.costToGrossRatio * 100).toFixed(1)}% ของ gross — ตรวจ grid spacing`);
      nextActions.push("ตรวจ grid spacing ว่า > round-trip cost × 2.5");
    } else if (metrics.costToGrossRatio > COST_DRAG_HIGH_THRESHOLD) {
      costDragStatus = "cost_drag_high";
      warnings.push(`Cost drag สูง: ${(metrics.costToGrossRatio * 100).toFixed(1)}%`);
    }
  }

  // 7. Cost gate
  const costGate = computeCostGate(trips, metrics);

  // 8. Edge status & diagnostics
  const edgeStatus = computeEdgeStatus(trips.length, metrics, sampleSizeStatus, costDragStatus);
  const edgeDiagnostics = computeEdgeDiagnostics(trips, metrics, sampleSizeStatus, costDragStatus);

  // 9. Attribution
  const ALL_MODES: TradingMode[] = ["NEUTRAL_GRID", "LONG_GRID", "SHORT_GRID", "PAUSE", "MONITOR", "UNKNOWN"];
  const ALL_REGIMES: MarketRegime[] = ["RANGE", "UPTREND", "DOWNTREND", "HIGH_VOL", "LOW_VOL", "EVENT_RISK", "UNKNOWN"];
  const ALL_SESSIONS: TradingSession[] = ["ASIA", "LONDON", "NEW_YORK", "OVERLAP_LN", "OVERLAP_NY", "LOW_LIQUIDITY", "UNKNOWN"];
  const byMode = buildBuckets(trips, (t) => t.mode, ALL_MODES);
  const byRegime = buildBuckets(trips, (t) => t.regime, ALL_REGIMES);
  const bySession = buildBuckets(trips, (t) => t.session, ALL_SESSIONS);

  // Check if attribution is mostly UNKNOWN
  const unknownModeCount = trips.filter((t) => t.mode === "UNKNOWN").length;
  const unknownRegimeCount = trips.filter((t) => t.regime === "UNKNOWN").length;
  if (trips.length > 0 && unknownModeCount / trips.length > 0.8) {
    warnings.push("80%+ ของ trades ไม่มี mode tag — attribution by mode ไม่น่าเชื่อถือ");
    nextActions.push("เพิ่ม grid mode tag ใน paper audit events");
  }
  if (trips.length > 0 && unknownRegimeCount / trips.length > 0.8) {
    warnings.push("80%+ ของ trades ไม่มี regime tag — attribution by regime ไม่น่าเชื่อถือ");
    nextActions.push("เพิ่ม market regime tag ใน paper audit events");
  }

  // 10. Failure reasons
  const { entries: failureReasons, unknownPct } = computeFailureReasons(trips);
  const totalLossCycles = trips.filter((t) => t.netPnl < 0).length;
  if (unknownPct !== null && unknownPct > UNKNOWN_FAILURE_WARNING_THRESHOLD) {
    warnings.push(`${(unknownPct * 100).toFixed(0)}% ของ losing cycles ไม่มี failure reason — เพิ่ม reason labels`);
    nextActions.push("เพิ่ม failureReason field ใน paper_pnl.jsonl");
  }

  // 11. No-trade diagnostics
  const { reasons: noTradeReasons, readiness: noTradeReadiness, diagnostics: noTradeDiagnostics } =
    computeNoTradeDiagnostics(pnlEntries, sampleSizeStatus, edgeStatus, costDragStatus);

  // 11b. Paper data quality
  const paperDataQuality = computePaperDataQuality(trips, journal.recentEvents ?? [], pnlEntries, pnlSource);
  if (paperDataQuality.qualityStatus === "insufficient") {
    warnings.push("Paper data quality: insufficient — ไม่มี closed trades หรือ averageFillPrice จริง");
    nextActions.push(...paperDataQuality.nextActions.slice(0, 2));
  } else if (paperDataQuality.qualityStatus === "partial") {
    warnings.push(`Paper data quality: partial — missing fields: ${paperDataQuality.missingFields.join(", ")}`);
    nextActions.push(...paperDataQuality.nextActions.slice(0, 2));
  }

  // 12. Next actions
  if (sampleSizeStatus === "insufficient_data") {
    nextActions.push(`เพิ่ม paper trades ให้ถึง ${MIN_FILLS_EARLY} fills เพื่อ early sample`);
  } else if (sampleSizeStatus === "early_sample") {
    nextActions.push(`เพิ่ม paper trades ให้ถึง ${MIN_FILLS_USABLE} fills เพื่อ usable sample`);
  }
  if (trips.length < MIN_CYCLES_UNPROVEN_THRESHOLD) {
    nextActions.push(`ต้องการ ${MIN_CYCLES_UNPROVEN_THRESHOLD} closed cycles เพื่อประเมิน edge (มี ${trips.length})`);
  }
  if (edgeStatus === "negative") {
    nextActions.push("Expectancy เป็นลบ — ตรวจ grid parameters และ cost model ก่อนดำเนินต่อ");
  }

  const status: "no_data" | "insufficient_data" | "has_data" =
    sampleSizeStatus === "insufficient_data" ? "insufficient_data" : "has_data";

  return {
    ok: edgeStatus === "positive_candidate" || edgeStatus === "positive_unconfirmed",
    readOnly: true, status,
    totalEvents, totalPaperOrders, totalPaperFills, sampleSizeStatus,
    grossPaperPnl: dataAvailableForPnl ? metrics.grossPnl : null,
    feeEstimateTotal: dataAvailableForPnl ? metrics.feeTotal : null,
    slippageEstimateTotal: dataAvailableForPnl ? metrics.slippageTotal : null,
    fundingEstimateTotal: dataAvailableForPnl ? metrics.fundingTotal : null,
    netPaperPnl: dataAvailableForPnl ? metrics.netPnl : null,
    winRate: metrics.winRate, lossRate: metrics.lossRate,
    averageWin: metrics.avgWin, averageLoss: metrics.avgLoss,
    payoffRatio: metrics.payoffRatio, expectancy: metrics.expectancy,
    profitFactor: metrics.profitFactor,
    maxDrawdown: dataAvailableForPnl ? metrics.maxDrawdown : null,
    averageHoldingTime: metrics.avgHoldSec,
    costToGrossProfitRatio: metrics.costToGrossRatio, costDragStatus,
    costGate, edgeStatus, edgeDiagnostics,
    attribution: { byMode, byRegime, bySession },
    failureReasons, totalLossCycles, unknownFailurePct: unknownPct,
    noTradeReasons, noTradeReadiness, noTradeDiagnostics,
    paperDataQuality,
    dataAvailableForPnl, pnlSource,
    warnings, nextActions, checkedAt,
  };
}
