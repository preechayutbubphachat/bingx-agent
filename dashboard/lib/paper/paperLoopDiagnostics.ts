// dashboard/lib/paper/paperLoopDiagnostics.ts
// Part F — paper-loop observability (read-only, additive, backward-compatible).
// Pure: derives diagnostics from a PaperJournalSummary. No I/O, no side effects,
// no trading behaviour. Never enables live/order/approval.

import type { PaperJournalSummary, PaperEventSummary } from "../readPaperJournal.ts";
import { calculateDynamicGrid, type DynamicGridResult } from "../grid/dynamicGrid.ts";
import { evaluateRegridCandidate, type RegridCandidate } from "../grid/regridCandidate.ts";
import {
  buildPaperEpochDiagnostics,
  evaluateRegridReadiness,
  type PaperEpochDiagnostics,
  type RegridReadiness,
} from "../grid/regridReadiness.ts";
import { evaluateIndicatorGate, type IndicatorGate } from "../grid/indicatorGate.ts";
import type {
  CanonicalMarketRegime,
  MultiTimeframeIndicatorEvidence,
} from "../market-regime/canonicalMarketRegime.ts";
import {
  applyCanonicalRegimeGateShadow,
  buildCanonicalRegimeGate,
  type CanonicalRegimeGate,
  type CanonicalRegimeGateShadowCompare,
} from "../market-regime/canonicalRegimeGate.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";
import {
  buildTrendPaperEpoch,
  evaluateTrendStrategy,
  type TrendPaperEpoch,
  type TrendStrategy,
} from "../trend/trendStrategy.ts";
import {
  evaluateTrendTransitionMonitor,
  type TrendTransitionMonitor,
} from "../trend/trendTransitionMonitor.ts";
import {
  evaluateTrendManualPaperArmGate,
  type TrendManualPaperArmGate,
} from "../trend/trendManualPaperArmGate.ts";
import {
  evaluateTrendPaperExecutionPreflight,
  type TrendPaperExecutionPreflight,
} from "../trend/trendPaperExecutionPreflight.ts";
import {
  evaluateTrendEdgeReview,
  type TrendEdgeReview,
} from "../trend/trendEdgeReview.ts";
import {
  evaluateTrendPaperExecutionEngine,
  summarizeTrendPaperExecutionSnapshot,
  type TrendPaperExecutionCandle,
  type TrendPaperExecutionConfig,
  type TrendPaperExecutionSnapshot,
} from "../trend/trendPaperExecutionEngine.ts";
import type { TrendPaperJournalSnapshot } from "../trend/trendPaperJournalWriter.ts";
import {
  summarizeTrendPaperArmSession,
  type TrendPaperArmSession,
  type TrendPaperArmSessionView,
} from "../trend/trendPaperArmSession.ts";
import {
  deriveEffectiveTrendManualPaperArmGate,
  type TrendPaperArmIntentBridgeResult,
} from "../trend/trendPaperArmIntentBridge.ts";
import { buildRegimeEvidence, type RegimeEvidence } from "./regimeEvidence.ts";

export type PriceVsGrid = "BELOW_GRID" | "INSIDE_GRID" | "ABOVE_GRID" | "UNKNOWN";

export interface PaperLoopDiagnostics {
  /** windowed counts — reader scans newest ~30 journal files, NOT full history (use grep for cumulative) */
  sampleBuyFillCount: number;
  sampleSellFillCount: number;
  /** @deprecated alias of sample*FillCount (kept for backward-compatibility) */
  rawBuyFillCount: number;
  rawSellFillCount: number;
  latestJournalAt: string | null;
  gridLower: number | null;
  gridUpper: number | null;
  gridMid: number | null;
  currentPrice: number | null;
  marketMode: string | null;
  regime: string | null;
  priceVsGrid: PriceVsGrid;
  decisionPrice: number | null;
  snapshotPrice: number | null;
  priceDriftPct: number | null;
  paperLoopState: string;
  lastNoTradeReason: string | null;
  noTradeReasonCounts: Record<string, number>;
  dynamicGrid: {
    enabled: boolean;
    status: DynamicGridResult["status"];
    reason: string;
    dynamicGridLower: number | null;
    dynamicGridUpper: number | null;
    dynamicGridMid: number | null;
    gridWidthPct: number | null;
    spacingPct: number | null;
    gridCount: number;
    confidence: DynamicGridResult["confidence"];
    cooldownRequired: boolean;
    /** Phase 1 read-only regrid candidate (activationAllowed always false) */
    candidate: RegridCandidate;
  };
  runtimeMonitor: PaperRuntimeMonitor;
  regridReadiness: RegridReadiness;
  paperEpoch: PaperEpochDiagnostics;
  regimeEvidence: RegimeEvidence;
  indicatorGate: IndicatorGate;
  canonicalMarketRegime: CanonicalMarketRegime | null;
  regimeDiagnostic: RegimeDiagnostic;
  volBaselineDiagnostic: VolBaselineDiagnostic;
  eventRiskContext: EventRiskContextDiagnostic;
  regimeTransitionDiagnostic: RegimeTransitionDiagnostic;
  multiTimeframeIndicatorEvidence: MultiTimeframeIndicatorEvidence | null;
  /** Phase D — read-only trend zone shadow (never used for orders) */
  trendZoneCandidate: TrendZoneShadow | null;
  canonicalRegimeGate: CanonicalRegimeGate;
  regridReadinessBeforeCanonicalGate: RegridReadiness;
  regridReadinessAfterCanonicalGate: RegridReadiness;
  canonicalRegimeGateShadowCompare: Pick<CanonicalRegimeGateShadowCompare, "changed" | "downgradeReason">;
  canonicalRegimeGateEnforcement: CanonicalRegimeGateEnforcement;
  trendStrategy: TrendStrategy;
  trendPaperEpoch: TrendPaperEpoch;
  trendTransitionMonitor: TrendTransitionMonitor;
  trendManualPaperArmGate: TrendManualPaperArmGate;
  trendPaperExecutionPreflight: TrendPaperExecutionPreflight;
  trendPaperExecutionEngine: TrendPaperExecutionSnapshot;
  /** T-3B — read-only paper arm session view (time-boxed operator approval window) */
  trendPaperArmSession: TrendPaperArmSessionView;
  /** T-3C — raw gate (display), effective gate (consumed by engine), and the intent bridge derivation */
  trendManualPaperArmGateRaw: TrendManualPaperArmGate;
  trendManualPaperArmGateEffective: TrendManualPaperArmGate;
  trendPaperArmIntentBridge: TrendPaperArmIntentBridgeResult;
  /** Phase T-4 — read-only trend edge / expectancy review (no journal yet → INSUFFICIENT_DATA) */
  trendEdgeReview: TrendEdgeReview;
}

export interface CanonicalRegimeGateEnforcement {
  enabled: true;
  mode: "STRICTER_ONLY";
  activeReadinessSource: "regridReadinessAfterCanonicalGate";
  beforeStatus: RegridReadiness["status"];
  afterStatus: RegridReadiness["status"];
  changed: boolean;
  downgradeReason: string | null;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export interface RuntimeMonitorCounters {
  cumulativeBuyFillCount: number;
  cumulativeSellFillCount: number;
  paperNoTradeCount: number;
  regridCandidateCount: number;
  latestFillAt: string | null;
  latestNoTradeAt: string | null;
  latestRegridCandidateAt: string | null;
}

export interface PaperRuntimeMonitor extends RuntimeMonitorCounters {
  sampleBuyFillCount: number;
  sampleSellFillCount: number;
  buyCountStable: boolean;
  noTradeIncreasing: boolean;
  regridCandidateIncreasing: boolean;
  activationAllowed: boolean;
  priceVsGrid: PriceVsGrid;
  paperLoopState: string;
  monitorStatus: "PASS" | "WATCH";
  monitorSummary: "STABLE_RUNTIME_PASS" | "WATCH_RUNTIME";
}

export interface PaperLoopDiagnosticsContext {
  closedCycles?: number | null;
  costGate?: {
    pass?: boolean | null;
    gridSpacingPct?: number | null;
    requiredMinSpacingPct?: number | null;
  } | null;
  regimeEvidence?: RegimeEvidence | null;
  canonicalMarketRegime?: CanonicalMarketRegime | null;
  latestCanonicalMarketRegimeDiagnostic?: unknown;
  marketSnapshot?: unknown;
  newsContext?: unknown;
  multiTimeframeIndicatorEvidence?: MultiTimeframeIndicatorEvidence | null;
  trendZoneCandidate?: TrendZoneShadow | null;
  session?: string | null;
  latest5mCandles?: TrendPaperExecutionCandle[] | null;
  trendPaperJournalSnapshot?: TrendPaperJournalSnapshot | null;
  trendPaperExecutionConfig?: TrendPaperExecutionConfig | null;
  trendPaperArmSession?: TrendPaperArmSession | null;
}

export type CostGateGridSpacingSource =
  | "dynamicGrid.spacingPct"
  | "candidateSpacingPct"
  | "paper_config"
  | null;

export interface CostGateWithGridSpacing {
  status?: unknown;
  roundTripCostPct?: unknown;
  gridSpacingPct?: number | null;
  gridSpacingSource?: CostGateGridSpacingSource;
  requiredMinSpacingPct?: unknown;
  pass?: unknown;
  warning?: unknown;
  nextAction?: unknown;
}

export type RegimeDiagnosticStatus =
  | "NO_CANONICAL_DATA"
  | "MATCHED"
  | "DECISION_REGIME_NULL_CANONICAL_AVAILABLE"
  | "MISMATCH"
  | "LOW_CONFIDENCE"
  | "UNKNOWN";

export interface RegimeDiagnostic {
  decisionRegime: string | null;
  canonicalRegime: string | null;
  canonicalDirection: string | null;
  canonicalConfidence: number | null;
  canonicalSource: string | null;
  canonicalReasons: string[];
  canonicalComputedAt: string | null;
  decisionRegimeMismatch: boolean;
  regimeNullButCanonicalAvailable: boolean;
  status: RegimeDiagnosticStatus;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export type VolBaselineReadiness = "NO_DATA" | "INSUFFICIENT" | "BUILDING" | "READY";

export interface VolBaselineDiagnostic {
  volState: string | null;
  confidence: number | null;
  baselineSamples1h: number | null;
  requiredBaselineSamples: number | null;
  baselineProgressPct: number | null;
  baselineReadiness: VolBaselineReadiness;
  warning: string | null;
}

export type EventRiskContextStatus = "NO_DATA" | "STALE" | "NORMAL" | "WATCH" | "HIGH_EVENT_RISK" | "UNKNOWN";

export interface EventRiskContextDiagnostic {
  status: EventRiskContextStatus;
  headlineCount: number;
  source: string | null;
  freshness: "fresh" | "stale" | "unknown";
  updatedAt: string | null;
  riskLabel: string | null;
  summary: string | null;
  warning: string | null;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

export interface RegimeTransitionDiagnostic {
  status: "NOT_CONFIGURED";
  hasHistoryStore: false;
  hysteresisActive: false;
  message: string;
  warning: string;
}

const DEFAULT_TREND_PAPER_EXECUTION_CONFIG: TrendPaperExecutionConfig = {
  enabled: false,
  mode: "PAPER_SIMULATION_ONLY",
  maxConcurrentTrendPositions: 1,
  riskPerTradePct: 1,
  minRewardRisk: 1.2,
  feePct: 0.05,
  slippagePct: 0.02,
  allowShort: true,
  allowLong: true,
};

function priceVsGridOf(price: number | null, lower: number | null, upper: number | null): PriceVsGrid {
  if (price == null || lower == null || upper == null) return "UNKNOWN";
  if (price < lower) return "BELOW_GRID";
  if (price > upper) return "ABOVE_GRID";
  return "INSIDE_GRID";
}

/** newest-first scan helper: first event matching predicate */
function firstMatch<T>(events: PaperEventSummary[], pick: (e: PaperEventSummary) => T | null): T | null {
  for (const e of events) {
    const v = pick(e);
    if (v != null) return v;
  }
  return null;
}

function evidenceNumber(value: { value: number | string | boolean | null } | null | undefined): number | null {
  return typeof value?.value === "number" && Number.isFinite(value.value) ? value.value : null;
}

function unknownObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = stringOrNull(value);
    if (text) return text;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = finiteOrNull(value);
    if (n != null) return n;
  }
  return null;
}

function costGateStatusText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function costGateBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function validCostGateSpacingSource(value: unknown): CostGateGridSpacingSource {
  return value === "dynamicGrid.spacingPct" || value === "candidateSpacingPct" || value === "paper_config"
    ? value
    : null;
}

function resolveCostGateSpacingSource(diagnostics: unknown): { value: number | null; source: CostGateGridSpacingSource } {
  const d = unknownObj(diagnostics);
  const dynamicGrid = unknownObj(d.dynamicGrid);
  const candidate = unknownObj(dynamicGrid.candidate);
  const dynamicSpacing = finiteOrNull(dynamicGrid.spacingPct);
  if (dynamicSpacing != null) return { value: dynamicSpacing, source: "dynamicGrid.spacingPct" };
  const candidateSpacing = finiteOrNull(candidate.candidateSpacingPct);
  if (candidateSpacing != null) return { value: candidateSpacing, source: "candidateSpacingPct" };
  return { value: null, source: null };
}

export function enrichCostGateWithGridSpacing<T extends CostGateWithGridSpacing | null | undefined>(
  costGate: T,
  diagnostics: unknown,
): (T extends null | undefined ? CostGateWithGridSpacing : T & CostGateWithGridSpacing) {
  const base = unknownObj(costGate) as CostGateWithGridSpacing;
  const existingSpacing = finiteOrNull(base.gridSpacingPct);
  const resolved = existingSpacing != null
    ? { value: existingSpacing, source: validCostGateSpacingSource(base.gridSpacingSource) ?? "paper_config" }
    : resolveCostGateSpacingSource(diagnostics);
  const gridSpacingPct = resolved.value;
  const requiredMinSpacingPct = finiteOrNull(base.requiredMinSpacingPct);
  const currentStatus = costGateStatusText(base.status);
  const currentPass = costGateBool(base.pass);
  const shouldDeriveStatus = gridSpacingPct != null && requiredMinSpacingPct != null && (currentStatus === "" || currentStatus === "unknown" || currentPass == null);

  if (!shouldDeriveStatus) {
    return {
      ...base,
      gridSpacingPct,
      gridSpacingSource: gridSpacingPct != null ? resolved.source : null,
    } as T extends null | undefined ? CostGateWithGridSpacing : T & CostGateWithGridSpacing;
  }

  const pass = gridSpacingPct > requiredMinSpacingPct;
  return {
    ...base,
    status: pass ? "pass" : "fail",
    gridSpacingPct,
    gridSpacingSource: resolved.source,
    pass,
    warning: pass ? null : `Grid spacing ${gridSpacingPct.toFixed(3)}% <= required ${requiredMinSpacingPct.toFixed(3)}% - cost gate fail`,
    nextAction: pass ? "Cost gate passed from existing dynamic grid spacing" : "widen_spacing_or_reduce_trade_frequency",
  } as T extends null | undefined ? CostGateWithGridSpacing : T & CostGateWithGridSpacing;
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function countArray(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function firstHeadlineSummary(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  if (typeof first === "string") return first.slice(0, 120);
  const item = unknownObj(first);
  return firstString(item.summary, item.title, item.headline);
}

function normalizeRegimeForDiagnostic(value: unknown): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return text && text !== "UNKNOWN" ? text : null;
}

export function buildRegimeDiagnostic(input: {
  canonicalMarketRegime?: CanonicalMarketRegime | null;
  latestCanonicalMarketRegimeDiagnostic?: unknown;
}): RegimeDiagnostic {
  const latestDiag = unknownObj(input.latestCanonicalMarketRegimeDiagnostic);
  const canonicalRegime = normalizeRegimeForDiagnostic(latestDiag.regime ?? input.canonicalMarketRegime?.regime);
  const decisionRegime = normalizeRegimeForDiagnostic(latestDiag.decisionRegime);
  const canonicalConfidence = finiteOrNull(latestDiag.confidence) ?? input.canonicalMarketRegime?.confidence ?? null;
  const canonicalDirection = stringOrNull(latestDiag.direction ?? input.canonicalMarketRegime?.direction);
  const canonicalSource = stringOrNull(latestDiag.source) ?? (canonicalRegime ? "canonicalMarketRegime" : null);
  const canonicalReasons = stringArray(latestDiag.reasons).length
    ? stringArray(latestDiag.reasons)
    : input.canonicalMarketRegime?.reasons ?? [];
  const canonicalComputedAt = stringOrNull(latestDiag.computedAt);
  const decisionRegimeMismatch = typeof latestDiag.decisionRegimeMismatch === "boolean"
    ? latestDiag.decisionRegimeMismatch
    : Boolean(decisionRegime && canonicalRegime && decisionRegime !== canonicalRegime);
  const regimeNullButCanonicalAvailable = !decisionRegime && Boolean(canonicalRegime);
  let status: RegimeDiagnosticStatus = "UNKNOWN";
  if (!canonicalRegime) status = "NO_CANONICAL_DATA";
  else if (decisionRegimeMismatch) status = "MISMATCH";
  else if (regimeNullButCanonicalAvailable) status = "DECISION_REGIME_NULL_CANONICAL_AVAILABLE";
  else if (canonicalConfidence != null && canonicalConfidence < 50) status = "LOW_CONFIDENCE";
  else if (decisionRegime === canonicalRegime) status = "MATCHED";

  return {
    decisionRegime,
    canonicalRegime,
    canonicalDirection,
    canonicalConfidence,
    canonicalSource,
    canonicalReasons,
    canonicalComputedAt,
    decisionRegimeMismatch,
    regimeNullButCanonicalAvailable,
    status,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

export function buildVolBaselineDiagnostic(marketSnapshot: unknown): VolBaselineDiagnostic {
  const snapshot = unknownObj(marketSnapshot);
  const volatility = unknownObj(snapshot.volatility);
  const baseline = unknownObj(volatility.baseline);
  const requiredPoints = unknownObj(volatility.required_points);
  const relative = unknownObj(volatility.relative);
  const baselineSamples1h = finiteOrNull(baseline.samples_1h);
  const requiredBaselineSamples = finiteOrNull(requiredPoints.for_baseline_50);
  const volState = stringOrNull(relative.vol_state);
  const confidence = finiteOrNull(relative.confidence);
  const hasData = baselineSamples1h != null && requiredBaselineSamples != null && requiredBaselineSamples > 0;
  const baselineProgressPct = hasData
    ? Math.round(Math.min(100, (baselineSamples1h / requiredBaselineSamples) * 100))
    : null;
  const baselineReadiness: VolBaselineReadiness = !hasData
    ? "NO_DATA"
    : baselineSamples1h >= requiredBaselineSamples
      ? "READY"
      : baselineSamples1h > 0
        ? "INSUFFICIENT"
        : "BUILDING";
  const warning = volState === "NORMAL" && hasData && baselineSamples1h < requiredBaselineSamples
    ? "Vol state is NORMAL, but baseline is still building. Treat confidence cautiously."
    : null;

  return {
    volState,
    confidence,
    baselineSamples1h,
    requiredBaselineSamples,
    baselineProgressPct,
    baselineReadiness,
    warning,
  };
}

export function buildEventRiskContextDiagnostic(
  newsContext: unknown,
  nowMs: number = Date.now()
): EventRiskContextDiagnostic {
  const context = unknownObj(newsContext);
  const macro = unknownObj(context.macro);
  const meta = unknownObj(context.meta);
  const hasAnyData = Object.keys(context).length > 0;
  if (!hasAnyData) {
    return {
      status: "NO_DATA",
      headlineCount: 0,
      source: null,
      freshness: "unknown",
      updatedAt: null,
      riskLabel: null,
      summary: null,
      warning: "News context missing/stale",
      paperActivationAllowed: false,
      liveActivationAllowed: false,
    };
  }

  const updatedAt = firstString(
    context.generated_at,
    context.generatedAt,
    context.updated_at,
    context.updatedAt,
    context.timestamp,
    meta.generated_at,
    meta.updatedAt
  );
  const updatedAtMs = parseTimestampMs(updatedAt);
  const explicitStale = context.stale === true || stringOrNull(context.freshness)?.toLowerCase() === "stale";
  const stale = explicitStale || updatedAtMs == null || nowMs - updatedAtMs > 30 * 60_000;
  const riskLabel = firstString(
    context.risk_label,
    context.riskLabel,
    context.risk_level,
    context.riskLevel,
    context.macro_risk_level,
    context.eventRisk,
    context.event_risk,
    context.severity,
    macro.overall_risk_level,
    macro.risk_level,
    meta.risk_label
  );
  const normalizedRisk = riskLabel?.trim().toUpperCase() ?? null;
  const headlineCount = firstNumber(
    context.headlineCount,
    context.headline_count,
    countArray(context.crypto_news_headlines),
    countArray(context.headlines),
    countArray(context.articles),
    countArray(context.items),
    countArray(context.news)
  ) ?? 0;
  const summaryText = firstString(
    context.summary,
    context.message,
    context.note,
    firstHeadlineSummary(context.headlines),
    firstHeadlineSummary(context.crypto_news_headlines)
  );
  const hasHotNews = context.has_hot_news === true || context.hasHotNews === true;
  const status: EventRiskContextStatus = stale
    ? "STALE"
    : normalizedRisk === "HIGH" || normalizedRisk === "CRITICAL" || hasHotNews
      ? "HIGH_EVENT_RISK"
      : normalizedRisk === "MED" || normalizedRisk === "MEDIUM" || normalizedRisk === "WATCH"
        ? "WATCH"
        : normalizedRisk === "LOW" || headlineCount > 0
          ? "NORMAL"
          : "UNKNOWN";
  const warning =
    status === "STALE" ? "News context missing/stale"
    : status === "HIGH_EVENT_RISK" ? "High event risk - monitoring only"
    : status === "WATCH" ? "Event risk watch - operator review required"
    : null;

  return {
    status,
    headlineCount,
    source: "news_context.json",
    freshness: stale ? "stale" : "fresh",
    updatedAt,
    riskLabel: normalizedRisk,
    summary: summaryText,
    warning,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
}

export function buildRegimeTransitionDiagnostic(): RegimeTransitionDiagnostic {
  return {
    status: "NOT_CONFIGURED",
    hasHistoryStore: false,
    hysteresisActive: false,
    message: "Regime transition history is not configured",
    warning: "Design-only - no regime behavior change",
  };
}

export function buildPaperLoopDiagnostics(summary: PaperJournalSummary): PaperLoopDiagnostics;
export function buildPaperLoopDiagnostics(
  summary: PaperJournalSummary,
  runtimeCounters: RuntimeMonitorCounters | null,
  context?: PaperLoopDiagnosticsContext
): PaperLoopDiagnostics;
export function buildPaperLoopDiagnostics(
  summary: PaperJournalSummary,
  runtimeCounters: RuntimeMonitorCounters | null = null,
  context: PaperLoopDiagnosticsContext = {}
): PaperLoopDiagnostics {
  const events = (summary.recentEvents ?? []) as PaperEventSummary[]; // already newest-first

  const gridLower = firstMatch(events, (e) => e.gridLower);
  const gridUpper = firstMatch(events, (e) => e.gridUpper);
  const gridMid = firstMatch(events, (e) => e.gridMid);
  const currentPrice = firstMatch(events, (e) => e.currentPrice);
  const marketMode = firstMatch(events, (e) => e.strategyMode);
  const regime = firstMatch(events, (e) => e.regime);
  const lastNoTradeReason = firstMatch(events, (e) => e.noTradeReason);

  const noTradeReasonCounts: Record<string, number> = {};
  for (const e of events) {
    if (e.noTradeReason) noTradeReasonCounts[e.noTradeReason] = (noTradeReasonCounts[e.noTradeReason] ?? 0) + 1;
  }

  const priceVsGrid = priceVsGridOf(currentPrice, gridLower, gridUpper);

  // paper loop state (display) — honest derivation, never implies edge/readiness
  let paperLoopState = "UNKNOWN";
  if (lastNoTradeReason === "stale_decision_or_price_mismatch") paperLoopState = "STALE_DATA";
  else if (lastNoTradeReason === "one_sided_buy_limit" || lastNoTradeReason === "one_sided_sell_limit") paperLoopState = "PAUSE_EXPOSURE_LIMIT";
  else if (priceVsGrid === "BELOW_GRID") paperLoopState = "REGRID_REQUIRED";
  else if (priceVsGrid === "ABOVE_GRID") paperLoopState = "REGRID_REQUIRED";
  else if (priceVsGrid === "INSIDE_GRID") paperLoopState = "INSIDE_GRID";

  // dynamic grid candidate (informational only)
  const dg = currentPrice != null
    ? calculateDynamicGrid({
        currentPrice,
        oldGridLower: gridLower,
        oldGridUpper: gridUpper,
        marketMode,
        regime,
        buyFillCount: summary.buyFillCount,
        sellFillCount: summary.sellFillCount,
      })
    : null;

  // Phase 1 read-only regrid candidate (recentCloses not in journal → stableCandleCount best-effort 0)
  const candidate = evaluateRegridCandidate({
    priceVsGrid,
    paperLoopState,
    currentPrice,
    oldGridLower: gridLower,
    oldGridUpper: gridUpper,
    marketMode,
    regime,
    buyFillCount: summary.buyFillCount,
    sellFillCount: summary.sellFillCount,
  });
  const activationAllowed: boolean = Boolean(candidate.activationAllowed);
  const counters: RuntimeMonitorCounters = runtimeCounters ?? {
    cumulativeBuyFillCount: summary.buyFillCount,
    cumulativeSellFillCount: summary.sellFillCount,
    paperNoTradeCount: 0,
    regridCandidateCount: 0,
    latestFillAt: summary.lastPaperEventAt,
    latestNoTradeAt: null,
    latestRegridCandidateAt: null,
  };
  const latestFillTime = counters.latestFillAt ? Date.parse(counters.latestFillAt) : NaN;
  const latestNoTradeTime = counters.latestNoTradeAt ? Date.parse(counters.latestNoTradeAt) : NaN;
  const noNewFillAfterNoTrade =
    !Number.isFinite(latestFillTime) ||
    (Number.isFinite(latestNoTradeTime) && latestNoTradeTime >= latestFillTime);
  const noTradeIncreasing = counters.paperNoTradeCount > 0;
  const regridCandidateIncreasing = counters.regridCandidateCount > 0;
  const outOfGrid = priceVsGrid === "BELOW_GRID" || priceVsGrid === "ABOVE_GRID";
  const buyCountStable = !outOfGrid || noNewFillAfterNoTrade;
  const monitorStatus: PaperRuntimeMonitor["monitorStatus"] =
    !activationAllowed &&
    outOfGrid &&
    noTradeIncreasing &&
    regridCandidateIncreasing &&
    buyCountStable
      ? "PASS"
      : "WATCH";
  const monitorSummary: PaperRuntimeMonitor["monitorSummary"] =
    monitorStatus === "PASS" ? "STABLE_RUNTIME_PASS" : "WATCH_RUNTIME";
  const closedCycles = context.closedCycles ?? 0;
  const regridReadinessBeforeCanonicalGate = evaluateRegridReadiness({
    currentPrice,
    gridLower,
    gridUpper,
    gridMid,
    priceVsGrid,
    candidateStatus: candidate.candidateStatus,
    candidateGridLower: candidate.candidateGridLower,
    candidateGridUpper: candidate.candidateGridUpper,
    candidateGridMid: candidate.candidateGridMid,
    candidateSpacingPct: candidate.candidateSpacingPct,
    stableCandleCount: candidate.stableCandleCount,
    cooldownRemaining: candidate.cooldownRemaining,
    buyFillCount: summary.buyFillCount,
    sellFillCount: summary.sellFillCount,
    closedCycles,
    costGate: context.costGate,
    regime,
    marketMode,
    staleData: paperLoopState === "STALE_DATA",
    runtimeAuditCritical: false,
  });
  const regimeEvidence = context.regimeEvidence ?? buildRegimeEvidence({
    decision: null,
    marketSnapshot: null,
    planStatusState: null,
    sourceInfo: null,
  });
  const indicatorGate = evaluateIndicatorGate({
    adx: evidenceNumber(regimeEvidence.indicators.adx),
    plusDI: evidenceNumber(regimeEvidence.indicators.plusDI),
    minusDI: evidenceNumber(regimeEvidence.indicators.minusDI),
    rsi: evidenceNumber(regimeEvidence.indicators.rsi),
    atrPct: evidenceNumber(regimeEvidence.indicators.atrPct),
    bbw: evidenceNumber(regimeEvidence.indicators.bbw),
    macdHistogram: evidenceNumber(regimeEvidence.indicators.macdHistogram),
    emaSlope: evidenceNumber(regimeEvidence.indicators.emaSlope),
    freshness: regimeEvidence.indicatorEvidence?.freshness ?? null,
  });
  const regimeDiagnostic = buildRegimeDiagnostic({
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    latestCanonicalMarketRegimeDiagnostic: context.latestCanonicalMarketRegimeDiagnostic,
  });
  const volBaselineDiagnostic = buildVolBaselineDiagnostic(context.marketSnapshot);
  const eventRiskContext = buildEventRiskContextDiagnostic(context.newsContext);
  const regimeTransitionDiagnostic = buildRegimeTransitionDiagnostic();
  const canonicalRegimeGate = buildCanonicalRegimeGate({
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    currentRegridReadiness: regridReadinessBeforeCanonicalGate,
  });
  const canonicalRegimeGateShadowCompare = applyCanonicalRegimeGateShadow(regridReadinessBeforeCanonicalGate, canonicalRegimeGate);
  const regridReadinessAfterCanonicalGate = canonicalRegimeGateShadowCompare.after ?? regridReadinessBeforeCanonicalGate;
  const regridReadiness = regridReadinessAfterCanonicalGate;
  const canonicalRegimeGateEnforcement: CanonicalRegimeGateEnforcement = {
    enabled: true,
    mode: "STRICTER_ONLY",
    activeReadinessSource: "regridReadinessAfterCanonicalGate",
    beforeStatus: regridReadinessBeforeCanonicalGate.status,
    afterStatus: regridReadinessAfterCanonicalGate.status,
    changed: canonicalRegimeGateShadowCompare.changed,
    downgradeReason: canonicalRegimeGateShadowCompare.downgradeReason,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
  };
  const paperEpoch = buildPaperEpochDiagnostics({
    priceVsGrid,
    buyFillCount: summary.buyFillCount,
    sellFillCount: summary.sellFillCount,
    candidateGridMid: candidate.candidateGridMid,
    readinessStatus: regridReadiness.status,
  });
  const trendStrategy = evaluateTrendStrategy({
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    indicatorGate,
    trendZoneCandidate: context.trendZoneCandidate ?? null,
    multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
    currentPrice,
    priceVsGrid,
    session: context.session ?? null,
    derivatives: regimeEvidence.derivatives,
    obGate: regimeEvidence.obGate,
    oldGridExposure: {
      buyFillCount: summary.buyFillCount,
      sellFillCount: summary.sellFillCount,
    },
    freshness: {
      stale: context.canonicalMarketRegime?.sourceFreshness?.status === "stale",
      warnings: context.canonicalMarketRegime?.sourceFreshness?.warnings ?? [],
    },
  });
  const trendPaperEpoch = buildTrendPaperEpoch(trendStrategy);
  const trendTransitionMonitor = evaluateTrendTransitionMonitor({
    trendStrategy,
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    indicatorGate,
    trendZoneCandidate: context.trendZoneCandidate ?? null,
    currentPrice,
    checkedAt: summary.lastPaperEventAt ?? null,
  });
  const trendManualPaperArmGate = evaluateTrendManualPaperArmGate({
    trendStrategy,
    trendZoneCandidate: context.trendZoneCandidate ?? null,
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    indicatorGate,
    currentPrice,
    freshness: {
      stale: context.canonicalMarketRegime?.sourceFreshness?.status === "stale",
    },
    checkedAt: summary.lastPaperEventAt ?? null,
  });
  const trendPaperExecutionPreflight = evaluateTrendPaperExecutionPreflight({
    trendManualPaperArmGate,
    trendStrategy,
    trendZoneCandidate: context.trendZoneCandidate ?? null,
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    currentPrice,
    freshness: {
      stale: context.canonicalMarketRegime?.sourceFreshness?.status === "stale",
    },
  });
  const trendPaperExecutionConfig = context.trendPaperExecutionConfig ?? DEFAULT_TREND_PAPER_EXECUTION_CONFIG;
  const trendPaperJournalSnapshot = context.trendPaperJournalSnapshot ?? null;
  // T-4 — read-only edge review. No trend_paper_journal/execution exists yet, so the
  // closed-trade source is present-but-empty → INSUFFICIENT_DATA (trendClosedTrades = 0).
  const trendEdgeReview = evaluateTrendEdgeReview({
    closedTrades: trendPaperJournalSnapshot ? trendPaperJournalSnapshot.closedTrades : [],
    journalExists: trendPaperJournalSnapshot ? trendPaperJournalSnapshot.exists : true,
    invalidMissingStopLossCount: trendPaperJournalSnapshot?.invalidMissingStopLossCount ?? 0,
  });
  const trendPaperArmSessionRaw = context.trendPaperArmSession ?? null;
  const trendPaperArmSession = summarizeTrendPaperArmSession(trendPaperArmSessionRaw, summary.checkedAt);
  // T-3C bridge: derive the effective gate the engine consumes. Raw gate is preserved/exposed for display.
  const trendPaperArmIntentBridge = deriveEffectiveTrendManualPaperArmGate({
    trendManualPaperArmGate,
    trendPaperArmSession: trendPaperArmSessionRaw,
    now: summary.checkedAt,
  });
  const trendManualPaperArmGateEffective = trendPaperArmIntentBridge.effectiveGate ?? trendManualPaperArmGate;
  const trendPaperExecutionResult = evaluateTrendPaperExecutionEngine({
    trendStrategy,
    trendManualPaperArmGate: trendManualPaperArmGateEffective,
    trendPaperArmSession: trendPaperArmSessionRaw,
    trendPaperExecutionPreflight,
    trendZoneCandidate: context.trendZoneCandidate ?? null,
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
    currentPrice,
    latest5mCandles: context.latest5mCandles ?? [],
    openTrendPaperPosition: trendPaperJournalSnapshot?.openPosition ?? null,
    config: trendPaperExecutionConfig,
    symbol: "BTC-USDT",
    now: summary.checkedAt,
  });
  const trendPaperExecutionEngine = summarizeTrendPaperExecutionSnapshot({
    result: trendPaperExecutionResult,
    config: trendPaperExecutionConfig,
    openTrendPaperPosition: trendPaperJournalSnapshot?.openPosition ?? null,
    lastEntryAt: trendPaperJournalSnapshot?.lastEntryAt ?? null,
    lastExitAt: trendPaperJournalSnapshot?.lastExitAt ?? null,
    closedTrades: trendPaperJournalSnapshot?.closedTrades ?? [],
    edgeReview: trendEdgeReview,
  });

  return {
    sampleBuyFillCount: summary.buyFillCount,
    sampleSellFillCount: summary.sellFillCount,
    rawBuyFillCount: summary.buyFillCount,
    rawSellFillCount: summary.sellFillCount,
    latestJournalAt: summary.lastPaperEventAt,
    gridLower,
    gridUpper,
    gridMid,
    currentPrice,
    marketMode,
    regime,
    priceVsGrid,
    // decisionPrice not structured in journal yet; snapshot price == context currentPrice (snapshot close)
    decisionPrice: null,
    snapshotPrice: currentPrice,
    priceDriftPct: null,
    paperLoopState,
    lastNoTradeReason,
    noTradeReasonCounts,
    dynamicGrid: {
      enabled: dg != null,
      status: dg?.status ?? "NO_TRADE",
      reason: dg?.reason ?? "no current price in journal",
      dynamicGridLower: dg?.dynamicGridLower ?? null,
      dynamicGridUpper: dg?.dynamicGridUpper ?? null,
      dynamicGridMid: dg?.dynamicGridMid ?? null,
      gridWidthPct: dg?.gridWidthPct ?? null,
      spacingPct: dg?.spacingPct ?? null,
      gridCount: dg?.gridCount ?? 10,
      confidence: dg?.confidence ?? "low",
      cooldownRequired: dg?.cooldownRequired ?? true,
      candidate,
    },
    runtimeMonitor: {
      ...counters,
      sampleBuyFillCount: summary.buyFillCount,
      sampleSellFillCount: summary.sellFillCount,
      buyCountStable,
      noTradeIncreasing,
      regridCandidateIncreasing,
      activationAllowed,
      priceVsGrid,
      paperLoopState,
      monitorStatus,
      monitorSummary,
    },
    regridReadiness,
    paperEpoch,
    regimeEvidence,
    indicatorGate,
    canonicalMarketRegime: context.canonicalMarketRegime ?? null,
    regimeDiagnostic,
    volBaselineDiagnostic,
    eventRiskContext,
    regimeTransitionDiagnostic,
    multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
    trendZoneCandidate: context.trendZoneCandidate ?? null,
    canonicalRegimeGate,
    regridReadinessBeforeCanonicalGate,
    regridReadinessAfterCanonicalGate,
    canonicalRegimeGateShadowCompare: {
      changed: canonicalRegimeGateShadowCompare.changed,
      downgradeReason: canonicalRegimeGateShadowCompare.downgradeReason,
    },
    canonicalRegimeGateEnforcement,
    trendStrategy,
    trendPaperEpoch,
    trendTransitionMonitor,
    trendManualPaperArmGate,
    trendManualPaperArmGateRaw: trendManualPaperArmGate,
    trendManualPaperArmGateEffective,
    trendPaperArmIntentBridge,
    trendPaperExecutionPreflight,
    trendPaperExecutionEngine,
    trendPaperArmSession,
    trendEdgeReview,
  };
}
