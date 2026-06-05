// dashboard/lib/paper/paperLoopDiagnostics.ts
// Part F — paper-loop observability (read-only, additive, backward-compatible).
// Pure: derives diagnostics from a PaperJournalSummary. No I/O, no side effects,
// no trading behaviour. Never enables live/order/approval.

import type { PaperJournalSummary, PaperEventSummary } from "@/lib/readPaperJournal";
import { calculateDynamicGrid, type DynamicGridResult } from "@/lib/grid/dynamicGrid";
import { evaluateRegridCandidate, type RegridCandidate } from "@/lib/grid/regridCandidate";
import {
  buildPaperEpochDiagnostics,
  evaluateRegridReadiness,
  type PaperEpochDiagnostics,
  type RegridReadiness,
} from "@/lib/grid/regridReadiness";
import { buildRegimeEvidence, type RegimeEvidence } from "@/lib/paper/regimeEvidence";

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
    requiredMinSpacingPct?: number | null;
  } | null;
  regimeEvidence?: RegimeEvidence | null;
}

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
  const regridReadiness = evaluateRegridReadiness({
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
  const paperEpoch = buildPaperEpochDiagnostics({
    priceVsGrid,
    buyFillCount: summary.buyFillCount,
    sellFillCount: summary.sellFillCount,
    candidateGridMid: candidate.candidateGridMid,
    readinessStatus: regridReadiness.status,
  });
  const regimeEvidence = context.regimeEvidence ?? buildRegimeEvidence({
    decision: null,
    marketSnapshot: null,
    planStatusState: null,
    sourceInfo: null,
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
  };
}
