import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMarketRegimeFreshness } from "./freshness.ts";

test("uses the last candle timestamp for freshness, not the first candle", () => {
  const result = assessMarketRegimeFreshness({
    marketSnapshot: { meta: { generated_at: "2026-06-05T00:00:00.000Z" } },
    indicatorEvidenceByTimeframe: {
      "15M": {
        freshness: {
          latestCandleAt: "2026-06-05T00:00:00.000Z",
          ageMs: 0,
        },
      },
    },
    nowMs: Date.parse("2026-06-05T00:01:00.000Z"),
  });

  assert.equal(result.latestCandleAtByTimeframe["15M"], "2026-06-05T00:00:00.000Z");
  assert.equal(result.warnings.includes("stale_candle_15M"), false);
});

test("detects missing required timeframes", () => {
  const result = assessMarketRegimeFreshness({
    marketSnapshot: {},
    indicatorEvidenceByTimeframe: { "15M": { freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 0 } } },
  });

  assert.equal(result.status, "partial");
  assert.ok(result.warnings.includes("missing_required_timeframe_1H"));
  assert.ok(result.warnings.includes("missing_required_timeframe_4H"));
});

test("detects stale T0 and candle mismatch", () => {
  const result = assessMarketRegimeFreshness({
    marketSnapshot: { meta: { generated_at: "2026-06-05T01:00:00.000Z" } },
    indicatorEvidenceByTimeframe: {
      "15M": { freshness: { latestCandleAt: "2026-06-04T20:00:00.000Z", ageMs: 5 * 60 * 60_000 } },
      "1H": { freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60 * 60_000 } },
      "4H": { freshness: { latestCandleAt: "2026-06-05T00:00:00.000Z", ageMs: 60 * 60_000 } },
    },
  });

  assert.equal(result.generatedAt, "2026-06-05T01:00:00.000Z");
  assert.ok(result.warnings.includes("stale_candle_15M"));
  assert.ok(result.warnings.includes("snapshot_generated_at_far_after_latest_candle_15M"));
});
