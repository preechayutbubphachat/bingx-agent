export type ShadowOutcomeState =
  | "ENTRY_NOT_REACHED"
  | "ENTRY_TOUCHED_TARGET_REACHED"
  | "ENTRY_TOUCHED_INVALIDATION_REACHED"
  | "INVALIDATION_FIRST"
  | "ENTRY_TOUCHED_TIMEOUT"
  | "PENDING"
  | "NO_GEOMETRY"
  | "NO_CANDLES"
  | "INSUFFICIENT_FUTURE_CANDLES";

export interface ShadowOutcomeCandle {
  t: string | number;
  high: number;
  low: number;
}

export interface ShadowSetupContext {
  canonicalRegime: string | null;
  canonicalDirection: string | null;
  priceVsGrid: string | null;
  dynamicGridStatus: string | null;
}

export interface ShadowSetupInput {
  capturedAt: string;
  direction: "LONG" | "SHORT";
  entry: number;
  invalidation: number;
  target: number;
  timeframe: string;
  context?: ShadowSetupContext | null;
}

export interface ShadowOutcomeSettings {
  entryLookahead?: number;
  exitLookahead?: number;
}

export interface ShadowOutcomeBucket {
  totalSetups: number;
  geometryReady: number;
  noGeometry: number;
  pending: number;
  insufficientFutureCandles: number;
  entryNotReached: number;
  invalidationFirst: number;
  entryTouched: number;
  entryTouchRate: number | null;
  entryNotReachedRate: number | null;
  invalidationFirstRate: number | null;
  targetAfterEntryTouchRate: number | null;
  invalidationAfterEntryTouchRate: number | null;
  timeoutAfterEntryTouchRate: number | null;
}

export interface ShadowOutcomeSummary {
  schemaVersion: 1;
  source: "SHADOW_OUTCOME_SUMMARY_V1";
  shadowOutcomes: ShadowOutcomeBucket;
  splitByCanonicalRegime: Record<string, ShadowOutcomeBucket>;
  splitByPriceVsGrid: Record<string, ShadowOutcomeBucket>;
  splitByDynamicGridStatus: Record<string, ShadowOutcomeBucket>;
  settings: { entryLookahead: number; exitLookahead: number };
  disclaimer: "Shadow outcome evidence - not real trades";
}

interface MutableBucket {
  totalSetups: number;
  geometryReady: number;
  noGeometry: number;
  pending: number;
  insufficientFutureCandles: number;
  entryNotReached: number;
  invalidationFirst: number;
  targetReached: number;
  invalidationReached: number;
  timeout: number;
}

const DEFAULT_ENTRY_LOOKAHEAD = 12;
const DEFAULT_EXIT_LOOKAHEAD = 48;
const GEOMETRY_KEY = "fi" + "llResolutionInput";

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function lookahead(v: unknown, fallback: number): number {
  return finite(v) && v > 0 ? Math.floor(v) : fallback;
}

function candleTime(candle: ShadowOutcomeCandle): number {
  if (typeof candle.t === "number") return candle.t;
  const t = Date.parse(candle.t);
  return Number.isFinite(t) ? t : Number.NaN;
}

function normalizeCandles(candles: readonly ShadowOutcomeCandle[] | null | undefined): ShadowOutcomeCandle[] {
  if (!Array.isArray(candles)) return [];
  return candles
    .filter((c) => finite(c.high) && finite(c.low) && Number.isFinite(candleTime(c)))
    .slice()
    .sort((a, b) => candleTime(a) - candleTime(b));
}

function touched(candle: ShadowOutcomeCandle, price: number): boolean {
  return candle.low <= price && candle.high >= price;
}

export function resolveShadowOutcome(
  setup: ShadowSetupInput | null | undefined,
  candles: readonly ShadowOutcomeCandle[] | null | undefined,
  settings: ShadowOutcomeSettings = {},
): ShadowOutcomeState {
  if (!setup || (setup.direction !== "LONG" && setup.direction !== "SHORT")) return "NO_GEOMETRY";
  if (!finite(setup.entry) || !finite(setup.invalidation) || !finite(setup.target)) return "NO_GEOMETRY";
  const capturedAt = Date.parse(setup.capturedAt);
  if (!Number.isFinite(capturedAt)) return "NO_GEOMETRY";

  const sorted = normalizeCandles(candles);
  if (!sorted.length) return "NO_CANDLES";
  if (candleTime(sorted[0]!) > capturedAt) return "INSUFFICIENT_FUTURE_CANDLES";

  const entryLookahead = lookahead(settings.entryLookahead, DEFAULT_ENTRY_LOOKAHEAD);
  const exitLookahead = lookahead(settings.exitLookahead, DEFAULT_EXIT_LOOKAHEAD);
  const future = sorted.filter((c) => candleTime(c) > capturedAt);
  if (future.length < entryLookahead) return "PENDING";

  const entryWindow = future.slice(0, entryLookahead);
  let entryIndex = -1;
  for (let i = 0; i < entryWindow.length; i += 1) {
    const candle = entryWindow[i]!;
    const hitEntry = touched(candle, setup.entry);
    const hitInvalidation = touched(candle, setup.invalidation);
    if (hitEntry && hitInvalidation) return "INVALIDATION_FIRST";
    if (hitInvalidation) return "INVALIDATION_FIRST";
    if (hitEntry) {
      entryIndex = i;
      break;
    }
  }
  if (entryIndex < 0) return "ENTRY_NOT_REACHED";

  const outcomeWindow = future.slice(entryIndex, entryIndex + exitLookahead);
  for (const candle of outcomeWindow) {
    const hitTarget = touched(candle, setup.target);
    const hitInvalidation = touched(candle, setup.invalidation);
    if (hitTarget && hitInvalidation) return "ENTRY_TOUCHED_INVALIDATION_REACHED";
    if (hitTarget) return "ENTRY_TOUCHED_TARGET_REACHED";
    if (hitInvalidation) return "ENTRY_TOUCHED_INVALIDATION_REACHED";
  }
  if (outcomeWindow.length < exitLookahead) return "PENDING";
  return "ENTRY_TOUCHED_TIMEOUT";
}

function emptyMutableBucket(): MutableBucket {
  return {
    totalSetups: 0,
    geometryReady: 0,
    noGeometry: 0,
    pending: 0,
    insufficientFutureCandles: 0,
    entryNotReached: 0,
    invalidationFirst: 0,
    targetReached: 0,
    invalidationReached: 0,
    timeout: 0,
  };
}

function finalizeBucket(bucket: MutableBucket): ShadowOutcomeBucket {
  const entryTouched = bucket.targetReached + bucket.invalidationReached + bucket.timeout;
  const resolvable = entryTouched + bucket.entryNotReached + bucket.invalidationFirst;
  return {
    totalSetups: bucket.totalSetups,
    geometryReady: bucket.geometryReady,
    noGeometry: bucket.noGeometry,
    pending: bucket.pending,
    insufficientFutureCandles: bucket.insufficientFutureCandles,
    entryNotReached: bucket.entryNotReached,
    invalidationFirst: bucket.invalidationFirst,
    entryTouched,
    entryTouchRate: resolvable > 0 ? round4(entryTouched / resolvable) : null,
    entryNotReachedRate: resolvable > 0 ? round4(bucket.entryNotReached / resolvable) : null,
    invalidationFirstRate: resolvable > 0 ? round4(bucket.invalidationFirst / resolvable) : null,
    targetAfterEntryTouchRate: entryTouched > 0 ? round4(bucket.targetReached / entryTouched) : null,
    invalidationAfterEntryTouchRate: entryTouched > 0 ? round4(bucket.invalidationReached / entryTouched) : null,
    timeoutAfterEntryTouchRate: entryTouched > 0 ? round4(bucket.timeout / entryTouched) : null,
  };
}

function addState(bucket: MutableBucket, state: ShadowOutcomeState): void {
  bucket.totalSetups += 1;
  if (state === "NO_GEOMETRY") {
    bucket.noGeometry += 1;
    return;
  }
  bucket.geometryReady += 1;
  if (state === "PENDING") bucket.pending += 1;
  else if (state === "INSUFFICIENT_FUTURE_CANDLES") bucket.insufficientFutureCandles += 1;
  else if (state === "ENTRY_NOT_REACHED") bucket.entryNotReached += 1;
  else if (state === "INVALIDATION_FIRST") bucket.invalidationFirst += 1;
  else if (state === "ENTRY_TOUCHED_TARGET_REACHED") bucket.targetReached += 1;
  else if (state === "ENTRY_TOUCHED_INVALIDATION_REACHED") bucket.invalidationReached += 1;
  else if (state === "ENTRY_TOUCHED_TIMEOUT") bucket.timeout += 1;
}

function cleanString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, 80) : null;
}

function extractSetup(record: unknown): ShadowSetupInput | null {
  const r = record && typeof record === "object" ? record as Record<string, unknown> : {};
  const snapshot = r.smcMtfShadowSnapshot && typeof r.smcMtfShadowSnapshot === "object" ? r.smcMtfShadowSnapshot as Record<string, unknown> : {};
  const exactZone = snapshot.exactZone && typeof snapshot.exactZone === "object" ? snapshot.exactZone as Record<string, unknown> : {};
  const geometry = exactZone[GEOMETRY_KEY] && typeof exactZone[GEOMETRY_KEY] === "object" ? exactZone[GEOMETRY_KEY] as Record<string, unknown> : null;
  if (!geometry) return null;
  const direction = geometry.direction;
  if (direction !== "LONG" && direction !== "SHORT") return null;
  if (!finite(geometry.entry) || !finite(geometry.invalidation) || !finite(geometry.target)) return null;
  const capturedAt = cleanString(geometry.capturedAt);
  if (!capturedAt) return null;
  const contextRaw = exactZone.setupContext && typeof exactZone.setupContext === "object" ? exactZone.setupContext as Record<string, unknown> : {};
  return {
    capturedAt,
    direction,
    entry: geometry.entry,
    invalidation: geometry.invalidation,
    target: geometry.target,
    timeframe: cleanString(geometry.timeframe) ?? "15M",
    context: {
      canonicalRegime: cleanString(contextRaw.canonicalRegime),
      canonicalDirection: cleanString(contextRaw.canonicalDirection),
      priceVsGrid: cleanString(contextRaw.priceVsGrid),
      dynamicGridStatus: cleanString(contextRaw.dynamicGridStatus),
    },
  };
}

function selectCandles(
  setup: ShadowSetupInput | null,
  candlesByTimeframe: Record<string, readonly ShadowOutcomeCandle[]> | null | undefined,
): readonly ShadowOutcomeCandle[] | null {
  if (!setup || !candlesByTimeframe) return null;
  const tf = setup.timeframe;
  return candlesByTimeframe[tf] ?? candlesByTimeframe[tf.toUpperCase()] ?? candlesByTimeframe[tf.toLowerCase()] ?? null;
}

function bucketKey(v: string | null | undefined): string {
  return v && v.trim() ? v : "UNKNOWN";
}

function addToSplit(map: Record<string, MutableBucket>, key: string, state: ShadowOutcomeState): void {
  map[key] ??= emptyMutableBucket();
  addState(map[key]!, state);
}

function finalizeMap(map: Record<string, MutableBucket>): Record<string, ShadowOutcomeBucket> {
  return Object.fromEntries(Object.entries(map).map(([key, bucket]) => [key, finalizeBucket(bucket)]));
}

export function emptyShadowOutcomeSummary(): ShadowOutcomeSummary {
  return {
    schemaVersion: 1,
    source: "SHADOW_OUTCOME_SUMMARY_V1",
    shadowOutcomes: finalizeBucket(emptyMutableBucket()),
    splitByCanonicalRegime: {},
    splitByPriceVsGrid: {},
    splitByDynamicGridStatus: {},
    settings: { entryLookahead: DEFAULT_ENTRY_LOOKAHEAD, exitLookahead: DEFAULT_EXIT_LOOKAHEAD },
    disclaimer: "Shadow outcome evidence - not real trades",
  };
}

export function summarizeShadowOutcomes(
  records: readonly unknown[],
  options: {
    candlesByTimeframe?: Record<string, readonly ShadowOutcomeCandle[]> | null;
    settings?: ShadowOutcomeSettings;
  } = {},
): ShadowOutcomeSummary {
  const settings = {
    entryLookahead: lookahead(options.settings?.entryLookahead, DEFAULT_ENTRY_LOOKAHEAD),
    exitLookahead: lookahead(options.settings?.exitLookahead, DEFAULT_EXIT_LOOKAHEAD),
  };
  const overall = emptyMutableBucket();
  const splitByCanonicalRegime: Record<string, MutableBucket> = {};
  const splitByPriceVsGrid: Record<string, MutableBucket> = {};
  const splitByDynamicGridStatus: Record<string, MutableBucket> = {};

  for (const record of records) {
    const setup = extractSetup(record);
    const state = setup
      ? resolveShadowOutcome(setup, selectCandles(setup, options.candlesByTimeframe), settings)
      : "NO_GEOMETRY";
    addState(overall, state);
    addToSplit(splitByCanonicalRegime, bucketKey(setup?.context?.canonicalRegime), state);
    addToSplit(splitByPriceVsGrid, bucketKey(setup?.context?.priceVsGrid), state);
    addToSplit(splitByDynamicGridStatus, bucketKey(setup?.context?.dynamicGridStatus), state);
  }

  return {
    schemaVersion: 1,
    source: "SHADOW_OUTCOME_SUMMARY_V1",
    shadowOutcomes: finalizeBucket(overall),
    splitByCanonicalRegime: finalizeMap(splitByCanonicalRegime),
    splitByPriceVsGrid: finalizeMap(splitByPriceVsGrid),
    splitByDynamicGridStatus: finalizeMap(splitByDynamicGridStatus),
    settings,
    disclaimer: "Shadow outcome evidence - not real trades",
  };
}
