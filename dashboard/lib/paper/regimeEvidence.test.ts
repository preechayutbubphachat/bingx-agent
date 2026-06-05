import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegimeEvidence } from "./regimeEvidence.ts";

test("maps decision market mode and regime evidence from runtime sources", () => {
  const evidence = buildRegimeEvidence({
    decision: {
      market_mode: "GRID_NEUTRAL",
      regime: "RANGE",
      levels: {
        trend: {
          dir: "SIDEWAYS",
          trigger_rule: "wait for range confirmation",
          invalidation: 86000,
        },
        smc: {
          bias: "RANGE",
          structure_state: "RANGE_PLAY",
          fvg_context: "none",
        },
      },
    },
    marketSnapshot: null,
    planStatusState: null,
    sourceInfo: null,
  });

  assert.equal(evidence.decision.marketMode, "GRID_NEUTRAL");
  assert.equal(evidence.decision.regime, "RANGE");
  assert.equal(evidence.decision.trendDir, "SIDEWAYS");
  assert.equal(evidence.decision.trendTriggerRule, "wait for range confirmation");
  assert.equal(evidence.decision.trendInvalidation, 86000);
  assert.equal(evidence.decision.smcBias, "RANGE");
  assert.equal(evidence.decision.structureState, "RANGE_PLAY");
  assert.ok(evidence.availableFields.includes("decision.marketMode"));
  assert.ok(evidence.availableFields.includes("decision.regime"));
});

test("maps OB gate and derivatives evidence without inventing indicators", () => {
  const evidence = buildRegimeEvidence({
    decision: {},
    marketSnapshot: {
      volatility: {
        now: {
          atr_1h: 288.5,
          bbw_1h: 0.009,
        },
      },
    },
    planStatusState: {
      plan_status_state: {
        plan: {
          market_mode: "GRID_NEUTRAL",
          market_regime: "UNKNOWN",
        },
      },
      ob_gate: {
        entry: {
          status: "READY",
          why: "touch+sweep+reclaim+choch+5m_ob_ready",
        },
        sweep: {
          seen: true,
          side: "DOWN",
        },
        choch: {
          ok: true,
          dir: "UP",
        },
      },
      derivatives: {
        oi: {
          status: "OK",
          now: 1304673499.2,
          trend_15m: { dir: "DOWN", pct: -0.12 },
        },
        funding: {
          status: "OK",
          now: 0.0001,
          trend_15m: { dir: "FLAT", pct: 0 },
        },
        crowd: {
          side: "LONG_UNWIND",
        },
      },
    },
    sourceInfo: null,
  });

  assert.equal(evidence.obGate.status, "READY");
  assert.equal(evidence.obGate.passed, true);
  assert.equal(evidence.obGate.reason, "touch+sweep+reclaim+choch+5m_ob_ready");
  assert.equal(evidence.decision.sweep, "DOWN");
  assert.equal(evidence.decision.choch, "UP");
  assert.equal(evidence.derivatives.openInterest, 1304673499.2);
  assert.equal(evidence.derivatives.oiBias, "DOWN");
  assert.equal(evidence.derivatives.oiChange, -0.12);
  assert.equal(evidence.derivatives.fundingRate, 0.0001);
  assert.equal(evidence.derivatives.fundingBias, "FLAT");
  assert.equal(evidence.derivatives.derivativesBias, "LONG_UNWIND");
  assert.deepEqual(evidence.indicators.atr, { value: 288.5, source: "market_snapshot.volatility.now.atr_1h" });
  assert.deepEqual(evidence.indicators.bbw, { value: 0.009, source: "market_snapshot.volatility.now.bbw_1h" });
  assert.deepEqual(evidence.indicators.adx, { value: null, source: "missing" });
  assert.ok(evidence.missingFields.includes("indicators.adx"));
  assert.ok(evidence.notes.includes("indicator_not_available_in_runtime_source"));
});

test("reports partial completeness when decision ob derivatives exist but directional indicators are missing", () => {
  const evidence = buildRegimeEvidence({
    decision: { market_mode: "GRID_NEUTRAL", regime: "RANGE", levels: { trend: { dir: "SIDEWAYS" } } },
    marketSnapshot: {},
    planStatusState: {
      ob_gate: { entry: { status: "READY" } },
      derivatives: { oi: { now: 1, trend_15m: { dir: "UP" } }, funding: { now: 0.01 } },
    },
    sourceInfo: null,
  });

  assert.equal(evidence.evidenceCompleteness.status, "partial");
  assert.equal(evidence.evidenceCompleteness.expectedCount, 5);
  assert.ok(evidence.evidenceCompleteness.availableCount >= 4);
  assert.ok(evidence.evidenceCompleteness.scorePct < 100);
  assert.equal(evidence.indicators.rsi.value, null);
  assert.equal(evidence.indicators.rsi.source, "missing");
});

test("uses computed indicator evidence when provided", () => {
  const evidence = buildRegimeEvidence({
    decision: { market_mode: "GRID_NEUTRAL", regime: "RANGE", levels: { trend: { dir: "SIDEWAYS" } } },
    marketSnapshot: {},
    planStatusState: {
      ob_gate: { entry: { status: "READY" } },
      derivatives: { oi: { now: 1 }, funding: { now: 0.01 } },
    },
    sourceInfo: null,
    indicatorEvidence: {
      adx: 25,
      plusDI: 18,
      minusDI: 12,
      rsi: 55,
      atr: 100,
      atrPct: 1.2,
      bbw: 0.05,
      macd: 2,
      macdSignal: 1.5,
      macdHistogram: 0.5,
      emaSlope: 3,
      source: "market_snapshot",
      calculatedAt: "2026-06-05T00:00:00.000Z",
      candleCount: 80,
      timeframe: "15m",
      freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 0 },
      missingFields: [],
      notes: [],
    },
  });

  assert.deepEqual(evidence.indicators.adx, { value: 25, source: "market_snapshot.indicatorEvidence.adx" });
  assert.deepEqual(evidence.indicators.plusDI, { value: 18, source: "market_snapshot.indicatorEvidence.plusDI" });
  assert.deepEqual(evidence.indicators.macdSignal, { value: 1.5, source: "market_snapshot.indicatorEvidence.macdSignal" });
  assert.equal(evidence.indicatorEvidence?.timeframe, "15m");
  assert.equal(evidence.indicatorEvidence?.candleCount, 80);
  assert.equal(evidence.evidenceCompleteness.status, "complete");
});
