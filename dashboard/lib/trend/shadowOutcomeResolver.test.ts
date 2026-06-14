import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  emptyShadowOutcomeSummary,
  resolveShadowOutcome,
  summarizeShadowOutcomes,
  type ShadowOutcomeCandle,
  type ShadowSetupInput,
} from "./shadowOutcomeResolver.ts";

const T0 = "2026-06-14T00:00:00.000Z";
const t = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

function candle(minutes: number, low: number, high: number): ShadowOutcomeCandle {
  return { t: t(minutes), low, high };
}

function setup(overrides: Partial<ShadowSetupInput> = {}): ShadowSetupInput {
  return {
    capturedAt: T0,
    direction: "LONG",
    entry: 100,
    invalidation: 95,
    target: 110,
    timeframe: "15M",
    context: {
      canonicalRegime: "RANGE",
      canonicalDirection: "NEUTRAL",
      priceVsGrid: "INSIDE_GRID",
      dynamicGridStatus: "ACTIVE",
    },
    ...overrides,
  };
}

function record(overrides: Partial<ShadowSetupInput> = {}) {
  const s = setup(overrides);
  return {
    smcMtfShadowSnapshot: {
      exactZone: {
        fillResolutionInput: {
          schemaVersion: 1,
          source: "D5_1_FILL_RESOLUTION_INPUT_V1",
          capturedAt: s.capturedAt,
          direction: s.direction,
          entry: s.entry,
          invalidation: s.invalidation,
          target: s.target,
          timeframe: s.timeframe,
        },
        setupContext: {
          schemaVersion: 1,
          source: "D5_2_SETUP_CONTEXT_V1",
          capturedAt: s.capturedAt,
          canonicalRegime: s.context?.canonicalRegime ?? null,
          canonicalDirection: s.context?.canonicalDirection ?? null,
          priceVsGrid: s.context?.priceVsGrid ?? null,
          dynamicGridStatus: s.context?.dynamicGridStatus ?? null,
        },
      },
    },
  };
}

const baseCandles = [candle(-15, 90, 91), candle(15, 90, 91), candle(30, 90, 91), candle(45, 90, 91), candle(60, 90, 91)];

test("empty summary is naming-safe and stable", () => {
  assert.deepEqual(emptyShadowOutcomeSummary(), {
    schemaVersion: 1,
    source: "SHADOW_OUTCOME_SUMMARY_V1",
    shadowOutcomes: {
      totalSetups: 0,
      geometryReady: 0,
      noGeometry: 0,
      pending: 0,
      insufficientFutureCandles: 0,
      entryNotReached: 0,
      invalidationFirst: 0,
      entryTouched: 0,
      entryTouchRate: null,
      entryNotReachedRate: null,
      invalidationFirstRate: null,
      targetAfterEntryTouchRate: null,
      invalidationAfterEntryTouchRate: null,
      timeoutAfterEntryTouchRate: null,
    },
    splitByCanonicalRegime: {},
    splitByPriceVsGrid: {},
    splitByDynamicGridStatus: {},
    settings: { entryLookahead: 12, exitLookahead: 48 },
    disclaimer: "Shadow outcome evidence - not real trades",
  });
});

test("guards missing geometry and candles", () => {
  assert.equal(resolveShadowOutcome(null, baseCandles), "NO_GEOMETRY");
  assert.equal(resolveShadowOutcome(setup(), []), "NO_CANDLES");
});

test("coverage guard and incomplete future window are non-terminal", () => {
  assert.equal(resolveShadowOutcome(setup(), [candle(15, 99, 101), candle(30, 109, 111)], { entryLookahead: 2, exitLookahead: 2 }), "INSUFFICIENT_FUTURE_CANDLES");
  assert.equal(resolveShadowOutcome(setup(), [candle(-15, 90, 91), candle(15, 99, 101)], { entryLookahead: 2, exitLookahead: 2 }), "PENDING");
});

test("entry not reached", () => {
  assert.equal(resolveShadowOutcome(setup(), baseCandles, { entryLookahead: 4, exitLookahead: 2 }), "ENTRY_NOT_REACHED");
});

test("entry touched then target reached", () => {
  const candles = [candle(-15, 90, 91), candle(15, 99, 101), candle(30, 109, 111)];
  assert.equal(resolveShadowOutcome(setup(), candles, { entryLookahead: 2, exitLookahead: 2 }), "ENTRY_TOUCHED_TARGET_REACHED");
});

test("entry touched then invalidation reached", () => {
  const candles = [candle(-15, 90, 91), candle(15, 99, 101), candle(30, 94, 96)];
  assert.equal(resolveShadowOutcome(setup(), candles, { entryLookahead: 2, exitLookahead: 2 }), "ENTRY_TOUCHED_INVALIDATION_REACHED");
});

test("invalidation before entry is conservative", () => {
  const candles = [candle(-15, 90, 91), candle(15, 94, 96), candle(30, 99, 101)];
  assert.equal(resolveShadowOutcome(setup(), candles, { entryLookahead: 2, exitLookahead: 2 }), "INVALIDATION_FIRST");
});

test("same candle target and invalidation after entry is conservative", () => {
  const candles = [candle(-15, 90, 91), candle(15, 99, 101), candle(30, 94, 111)];
  assert.equal(resolveShadowOutcome(setup(), candles, { entryLookahead: 2, exitLookahead: 2 }), "ENTRY_TOUCHED_INVALIDATION_REACHED");
});

test("entry touched timeout and pending outcome window", () => {
  assert.equal(resolveShadowOutcome(setup(), [candle(-15, 90, 91), candle(15, 99, 101), candle(30, 101, 102)], { entryLookahead: 1, exitLookahead: 2 }), "ENTRY_TOUCHED_TIMEOUT");
  assert.equal(resolveShadowOutcome(setup(), [candle(-15, 90, 91), candle(15, 99, 101)], { entryLookahead: 1, exitLookahead: 2 }), "PENDING");
});

test("summary splits by setup context and maps old records to UNKNOWN", () => {
  const records = [
    record(),
    record({ context: { canonicalRegime: "DOWNTREND", canonicalDirection: "BEARISH", priceVsGrid: "BELOW_GRID", dynamicGridStatus: "PAUSE_EXPOSURE_LIMIT" } }),
    { smcMtfShadowSnapshot: { exactZone: {} } },
  ];
  const summary = summarizeShadowOutcomes(records, {
    candlesByTimeframe: { "15M": [candle(-15, 90, 91), candle(15, 99, 101), candle(30, 109, 111)] },
    settings: { entryLookahead: 2, exitLookahead: 2 },
  });

  assert.equal(summary.shadowOutcomes.totalSetups, 3);
  assert.equal(summary.shadowOutcomes.geometryReady, 2);
  assert.equal(summary.shadowOutcomes.noGeometry, 1);
  assert.equal(summary.shadowOutcomes.entryTouched, 2);
  assert.equal(summary.shadowOutcomes.entryTouchRate, 1);
  assert.equal(summary.shadowOutcomes.targetAfterEntryTouchRate, 1);
  assert.equal(summary.splitByCanonicalRegime.RANGE?.entryTouched, 1);
  assert.equal(summary.splitByCanonicalRegime.DOWNTREND?.entryTouched, 1);
  assert.equal(summary.splitByCanonicalRegime.UNKNOWN?.noGeometry, 1);
  assert.equal(summary.splitByPriceVsGrid.INSIDE_GRID?.entryTouched, 1);
  assert.equal(summary.splitByDynamicGridStatus.PAUSE_EXPOSURE_LIMIT?.entryTouched, 1);
});

test("summary does not mutate inputs", () => {
  const records = [record()];
  const candles = [candle(-15, 90, 91), candle(15, 99, 101), candle(30, 109, 111)];
  const before = JSON.stringify({ records, candles });
  summarizeShadowOutcomes(records, { candlesByTimeframe: { "15M": candles }, settings: { entryLookahead: 2, exitLookahead: 2 } });
  assert.equal(JSON.stringify({ records, candles }), before);
});

test("resolver source has no forbidden public state vocabulary or unsafe imports", async () => {
  const src = await readFile("lib/trend/shadowOutcomeResolver.ts", "utf8");
  const withoutDisclaimer = src.replace(/not real trades/g, "");
  assert.doesNotMatch(withoutDisclaimer, /fill|trade|order|position|closedTrade/i);
  assert.doesNotMatch(src, /import .*from .*runner|import .*from .*execution|import .*from .*broker|import .*from .*grid|import .*from .*regrid|paperJournal/i);
  const unsafeRuntimePattern = new RegExp(["process\\.env", "append" + "File", "write" + "File", "read" + "File", "fetch\\("].join("|"), "i");
  assert.doesNotMatch(src, unsafeRuntimePattern);
});
