import type { IndicatorEvidence } from "../indicators/computeIndicators.ts";

export type EvidenceCompletenessStatus = "complete" | "partial" | "missing";

export interface EvidenceValue<T = number | string | boolean> {
  value: T | null;
  source: string;
}

export interface RegimeEvidence {
  evidenceCompleteness: {
    status: EvidenceCompletenessStatus;
    scorePct: number;
    availableCount: number;
    expectedCount: number;
  };
  sourceFreshness: {
    latestDecisionAt: string | null;
    marketSnapshotAt: string | null;
    planStatusStateAt: string | null;
    warnings: string[];
  };
  decision: {
    marketMode: string | null;
    regime: string | null;
    trendDir: string | null;
    trendTriggerRule: string | null;
    trendInvalidation: number | string | null;
    smcBias: string | null;
    structureState: string | null;
    bos: string | boolean | null;
    choch: string | boolean | null;
    mss: string | boolean | null;
    sweep: string | boolean | null;
    obContext: string | null;
    fvgContext: string | null;
  };
  indicators: {
    adx: EvidenceValue<number>;
    plusDI: EvidenceValue<number>;
    minusDI: EvidenceValue<number>;
    rsi: EvidenceValue<number>;
    atr: EvidenceValue<number>;
    atrPct: EvidenceValue<number>;
    bbw: EvidenceValue<number>;
    macd: EvidenceValue<number | string>;
    macdSignal: EvidenceValue<number>;
    macdHistogram: EvidenceValue<number>;
    emaSlope: EvidenceValue<number>;
  };
  indicatorEvidence: Pick<
    IndicatorEvidence,
    "source" | "calculatedAt" | "candleCount" | "timeframe" | "freshness" | "missingFields" | "notes"
  > | null;
  derivatives: {
    oiBias: string | null;
    oiChange: number | null;
    fundingRate: number | null;
    fundingBias: string | null;
    fundingRisk: string | null;
    openInterest: number | null;
    derivativesBias: string | null;
  };
  obGate: {
    status: string | null;
    reason: string | null;
    score: number | null;
    passed: boolean | null;
    blockedReason: string | null;
  };
  missingFields: string[];
  availableFields: string[];
  notes: string[];
}

export interface RegimeEvidenceInput {
  decision: unknown;
  marketSnapshot: unknown;
  planStatusState: unknown;
  sourceInfo: unknown;
  indicatorEvidence?: IndicatorEvidence | null;
}

type AnyObj = Record<string, unknown>;

const obj = (value: unknown): AnyObj => (value && typeof value === "object" ? (value as AnyObj) : {});

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function boolOrText(value: unknown): string | boolean | null {
  if (typeof value === "boolean") return value;
  return text(value);
}

function get(root: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let current: unknown = root;
    let ok = true;
    for (const part of path.split(".")) {
      if (!current || typeof current !== "object" || !(part in current)) {
        ok = false;
        break;
      }
      current = (current as AnyObj)[part];
    }
    if (ok && current !== undefined && current !== null && current !== "") return current;
  }
  return null;
}

function pickText(root: unknown, paths: string[]): string | null {
  return text(get(root, paths));
}

function pickNumber(root: unknown, paths: string[]): number | null {
  return finite(get(root, paths));
}

function pushField(
  field: string,
  value: unknown,
  availableFields: string[],
  missingFields: string[]
) {
  if (value !== null && value !== undefined && value !== "") availableFields.push(field);
  else missingFields.push(field);
}

function indicator(
  field: string,
  root: unknown,
  paths: string[],
  availableFields: string[],
  missingFields: string[],
  notes: string[]
): EvidenceValue<number> {
  for (const path of paths) {
    const value = pickNumber(root, [path]);
    if (value != null) {
      availableFields.push(field);
      return { value, source: path.replace(/^marketSnapshot\./, "market_snapshot.").replace(/^decision\./, "latest_decision.") };
    }
  }
  missingFields.push(field);
  if (!notes.includes("indicator_not_available_in_runtime_source")) {
    notes.push("indicator_not_available_in_runtime_source");
  }
  return { value: null, source: "missing" };
}

function computedIndicator(
  evidence: IndicatorEvidence | null | undefined,
  key: keyof Pick<
    IndicatorEvidence,
    | "adx"
    | "plusDI"
    | "minusDI"
    | "rsi"
    | "atr"
    | "atrPct"
    | "bbw"
    | "macd"
    | "macdSignal"
    | "macdHistogram"
    | "emaSlope"
  >,
  field: string,
  availableFields: string[],
  missingFields: string[],
  notes: string[]
): EvidenceValue<number> | null {
  if (!evidence) return null;
  const value = evidence[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    availableFields.push(field);
    return { value, source: `market_snapshot.indicatorEvidence.${key}` };
  }
  missingFields.push(field);
  if (evidence.missingFields.includes(String(key)) && !notes.includes("insufficient_candles")) {
    notes.push("insufficient_candles");
  }
  return { value: null, source: "missing" };
}

function trendDir(value: unknown): string | null {
  if (typeof value === "string") return text(value);
  if (value && typeof value === "object") {
    return text((value as AnyObj).dir) ?? text((value as AnyObj).direction) ?? text((value as AnyObj).status);
  }
  return null;
}

function evidenceFreshness(sourceInfo: unknown) {
  const info = obj(sourceInfo);
  const files = Array.isArray(info.files) ? info.files.map(obj) : [];
  const byName = (name: string) => files.find((file) => file.name === name);
  const latestDecision = byName("latest_decision.json");
  const marketSnapshot = byName("market_snapshot.json");
  const planStatusState = byName("plan_status_state.json");
  const warnings = Array.isArray(info.warnings) ? info.warnings.filter((x): x is string => typeof x === "string") : [];

  return {
    latestDecisionAt: text(latestDecision?.mtimeIso) ?? null,
    marketSnapshotAt: text(marketSnapshot?.mtimeIso) ?? null,
    planStatusStateAt: text(planStatusState?.mtimeIso) ?? null,
    warnings,
  };
}

export function buildRegimeEvidence(input: RegimeEvidenceInput): RegimeEvidence {
  const decision = obj(input.decision);
  const marketSnapshot = obj(input.marketSnapshot);
  const planState = obj(input.planStatusState);
  const nestedPlanStatus = obj(planState.plan_status_state);
  const plan = obj(nestedPlanStatus.plan);
  const obGateRaw = obj(planState.ob_gate);
  const obEntry = obj(obGateRaw.entry);
  const derivativesRaw = obj(planState.derivatives);
  const decisionDerivatives = obj(decision.derivatives);
  const snapshotSignals = obj(obj(marketSnapshot.derivatives).signals);
  const snapshotOi = obj(snapshotSignals.openInterest);
  const snapshotFunding = obj(snapshotSignals.funding);

  const missingFields: string[] = [];
  const availableFields: string[] = [];
  const notes: string[] = [];
  const computed = input.indicatorEvidence ?? null;

  const marketMode =
    pickText(decision, ["market_mode", "marketMode"]) ??
    pickText(plan, ["market_mode", "marketMode"]);
  const regime =
    pickText(decision, ["market_regime", "regime"]) ??
    pickText(plan, ["market_regime", "regime"]);
  const trendRaw = get(decision, ["levels.trend.dir", "trend.dir", "trend.direction"]);
  const trendDirection = trendDir(trendRaw);
  const trendTriggerRule = pickText(decision, ["levels.trend.trigger_rule", "levels.trend.triggerRule"]);
  const trendInvalidation =
    pickNumber(decision, ["levels.trend.invalidation", "parameters_for_grid_or_trend.trend_sl"]) ??
    pickText(decision, ["levels.trend.invalidation"]);
  const smcBias =
    pickText(decision, ["levels.smc.bias", "levels.smc.smc_bias"]) ??
    pickText(obGateRaw, ["bias_1h"]);
  const structureState =
    pickText(decision, ["levels.smc.structure_state", "levels.smc.structureState"]) ??
    pickText(planState, ["plan_state", "state.code"]) ??
    pickText(nestedPlanStatus, ["state.code", "state"]);
  const bos =
    boolOrText(get(decision, ["levels.smc.bos", "levels.smc.BOS"])) ??
    boolOrText(get(obGateRaw, ["h1_ob.strength.bos", "m5_ob_confirm.strength.bos"]));
  const chochRaw = get(obGateRaw, ["choch.dir", "choch.ok"]) ?? get(decision, ["levels.smc.choch", "levels.smc.CHOCH"]);
  const mss = boolOrText(get(decision, ["levels.smc.mss", "levels.smc.MSS"]));
  const sweepRaw = get(obGateRaw, ["sweep.side", "sweep.seen"]) ?? get(nestedPlanStatus, ["signals.sweep_5m"]);
  const obContext =
    pickText(obEntry, ["status"]) ??
    pickText(obGateRaw, ["status", "h1_ob.note", "m5_ob_confirm.note"]);
  const fvgContext = pickText(decision, ["levels.smc.fvg_context", "levels.smc.fvgContext", "levels.smc.fvg"]);

  const decisionEvidence = {
    marketMode,
    regime,
    trendDir: trendDirection,
    trendTriggerRule,
    trendInvalidation,
    smcBias,
    structureState,
    bos,
    choch: boolOrText(chochRaw),
    mss,
    sweep: boolOrText(sweepRaw),
    obContext,
    fvgContext,
  };

  for (const [key, value] of Object.entries(decisionEvidence)) {
    pushField(`decision.${key}`, value, availableFields, missingFields);
  }

  const indicators = {
    adx: computedIndicator(computed, "adx", "indicators.adx", availableFields, missingFields, notes) ?? indicator("indicators.adx", { decision, marketSnapshot }, [
      "decision.indicators.adx",
      "decision.levels.indicators.adx",
      "marketSnapshot.indicators.adx",
    ], availableFields, missingFields, notes),
    plusDI: computedIndicator(computed, "plusDI", "indicators.plusDI", availableFields, missingFields, notes) ?? indicator("indicators.plusDI", { decision, marketSnapshot }, [
      "decision.indicators.plusDI",
      "decision.indicators.plus_di",
      "marketSnapshot.indicators.plusDI",
      "marketSnapshot.indicators.plus_di",
    ], availableFields, missingFields, notes),
    minusDI: computedIndicator(computed, "minusDI", "indicators.minusDI", availableFields, missingFields, notes) ?? indicator("indicators.minusDI", { decision, marketSnapshot }, [
      "decision.indicators.minusDI",
      "decision.indicators.minus_di",
      "marketSnapshot.indicators.minusDI",
      "marketSnapshot.indicators.minus_di",
    ], availableFields, missingFields, notes),
    rsi: computedIndicator(computed, "rsi", "indicators.rsi", availableFields, missingFields, notes) ?? indicator("indicators.rsi", { decision, marketSnapshot }, [
      "decision.indicators.rsi",
      "marketSnapshot.indicators.rsi",
    ], availableFields, missingFields, notes),
    atr: computedIndicator(computed, "atr", "indicators.atr", availableFields, missingFields, notes) ?? indicator("indicators.atr", { decision, marketSnapshot }, [
      "decision.indicators.atr",
      "decision.levels.indicators.atr",
      "marketSnapshot.volatility.now.atr_1h",
      "marketSnapshot.volatility.now.atr",
    ], availableFields, missingFields, notes),
    atrPct: computedIndicator(computed, "atrPct", "indicators.atrPct", availableFields, missingFields, notes) ?? indicator("indicators.atrPct", { decision, marketSnapshot }, [
      "decision.indicators.atrPct",
      "decision.indicators.atr_pct",
      "marketSnapshot.volatility.now.atrPct",
      "marketSnapshot.volatility.now.atr_pct",
    ], availableFields, missingFields, notes),
    bbw: computedIndicator(computed, "bbw", "indicators.bbw", availableFields, missingFields, notes) ?? indicator("indicators.bbw", { decision, marketSnapshot }, [
      "decision.indicators.bbw",
      "decision.levels.indicators.bbw",
      "marketSnapshot.volatility.now.bbw_1h",
      "marketSnapshot.volatility.now.bbw",
    ], availableFields, missingFields, notes),
    macd: computedIndicator(computed, "macd", "indicators.macd", availableFields, missingFields, notes) ?? indicator("indicators.macd", { decision, marketSnapshot }, [
      "decision.indicators.macd",
      "marketSnapshot.indicators.macd",
    ], availableFields, missingFields, notes),
    macdSignal: computedIndicator(computed, "macdSignal", "indicators.macdSignal", availableFields, missingFields, notes) ?? indicator("indicators.macdSignal", { decision, marketSnapshot }, [
      "decision.indicators.macdSignal",
      "decision.indicators.macd_signal",
      "marketSnapshot.indicators.macdSignal",
      "marketSnapshot.indicators.macd_signal",
    ], availableFields, missingFields, notes),
    macdHistogram: computedIndicator(computed, "macdHistogram", "indicators.macdHistogram", availableFields, missingFields, notes) ?? indicator("indicators.macdHistogram", { decision, marketSnapshot }, [
      "decision.indicators.macdHistogram",
      "decision.indicators.macd_histogram",
      "marketSnapshot.indicators.macdHistogram",
      "marketSnapshot.indicators.macd_histogram",
    ], availableFields, missingFields, notes),
    emaSlope: computedIndicator(computed, "emaSlope", "indicators.emaSlope", availableFields, missingFields, notes) ?? indicator("indicators.emaSlope", { decision, marketSnapshot }, [
      "decision.indicators.emaSlope",
      "decision.indicators.ema_slope",
      "marketSnapshot.indicators.emaSlope",
      "marketSnapshot.indicators.ema_slope",
    ], availableFields, missingFields, notes),
  };

  const planOi = obj(derivativesRaw.oi);
  const planFunding = obj(derivativesRaw.funding);
  const decisionOi = obj(decisionDerivatives.oi);
  const decisionFunding = obj(decisionDerivatives.funding);
  const derivatives = {
    oiBias:
      trendDir(get(planOi, ["trend_15m", "trend_5m"])) ??
      pickText(decisionOi, ["trend_15m", "trend_5m", "crowd"]) ??
      pickText(snapshotSignals, ["combined.crowding"]),
    oiChange:
      pickNumber(planOi, ["trend_15m.pct", "trend_5m.pct"]) ??
      pickNumber(snapshotOi, ["pct_15m", "pct_5m", "delta_15m", "delta_5m"]),
    fundingRate:
      pickNumber(planFunding, ["now"]) ??
      pickNumber(decisionFunding, ["now"]) ??
      pickNumber(snapshotFunding, ["last_15m", "last_5m"]),
    fundingBias:
      trendDir(get(planFunding, ["trend_15m", "trend_5m"])) ??
      pickText(decisionFunding, ["trend_15m", "trend_5m"]),
    fundingRisk:
      pickText(planFunding, ["reason", "status"]) ??
      pickText(snapshotSignals, ["combined.risk_note"]),
    openInterest:
      pickNumber(planOi, ["now"]) ??
      pickNumber(decisionOi, ["now"]) ??
      pickNumber(snapshotOi, ["last_15m", "last_5m"]),
    derivativesBias:
      pickText(derivativesRaw, ["crowd.side", "crowd.crowd_th"]) ??
      pickText(decisionOi, ["crowd"]) ??
      pickText(snapshotSignals, ["combined.crowding"]),
  };
  for (const [key, value] of Object.entries(derivatives)) {
    pushField(`derivatives.${key}`, value, availableFields, missingFields);
  }

  const obStatus = pickText(obEntry, ["status"]) ?? pickText(obGateRaw, ["status"]);
  const obReason = pickText(obEntry, ["why"]) ?? pickText(obGateRaw, ["reason", "blockedReason"]);
  const obScore = pickNumber(obGateRaw, ["score"]);
  const obPassed =
    typeof obGateRaw.passed === "boolean"
      ? obGateRaw.passed
      : obStatus != null
        ? ["READY", "PASS", "PASSED"].includes(obStatus.toUpperCase())
        : null;
  const obGate = {
    status: obStatus,
    reason: obReason,
    score: obScore,
    passed: obPassed,
    blockedReason: obPassed === false ? obReason : null,
  };
  for (const [key, value] of Object.entries(obGate)) {
    if (key === "blockedReason" && obPassed !== false) continue;
    pushField(`obGate.${key}`, value, availableFields, missingFields);
  }

  const groupAvailability = [
    marketMode != null || regime != null,
    trendDirection != null || smcBias != null || structureState != null || bos != null || chochRaw != null || mss != null || sweepRaw != null || obContext != null || fvgContext != null,
    obStatus != null || obReason != null || obPassed != null,
    Object.values(derivatives).some((value) => value != null),
    Object.values(indicators).every((value) => value.value != null),
  ];
  const expectedCount = groupAvailability.length;
  const availableCount = groupAvailability.filter(Boolean).length;
  const scorePct = Math.round((availableCount / expectedCount) * 100);
  const status: EvidenceCompletenessStatus =
    availableCount === 0 ? "missing" : availableCount === expectedCount ? "complete" : "partial";

  return {
    evidenceCompleteness: {
      status,
      scorePct,
      availableCount,
      expectedCount,
    },
    sourceFreshness: evidenceFreshness(input.sourceInfo),
    decision: decisionEvidence,
    indicators,
    indicatorEvidence: computed
      ? {
          source: computed.source,
          calculatedAt: computed.calculatedAt,
          candleCount: computed.candleCount,
          timeframe: computed.timeframe,
          freshness: computed.freshness,
          missingFields: computed.missingFields,
          notes: computed.notes,
        }
      : null,
    derivatives,
    obGate,
    missingFields,
    availableFields,
    notes,
  };
}
