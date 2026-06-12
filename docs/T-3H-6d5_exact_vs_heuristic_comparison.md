# T-3H-6-d5 Exact vs Heuristic Shadow Comparison

Status: IMPLEMENTED READ-ONLY OBSERVABILITY.

Purpose: compare heuristic MTF OB/FVG shadow records against exact-zone MTF OB/FVG shadow records from the existing decision-log summary. This is technical evidence only, not an entry signal and not activation approval.

## Metrics

- exactSamples and heuristicSamples
- exactAvgNetRR and heuristicAvgNetRR
- avgExactVsHeuristicDelta
- exactPassRate using the configured required RR input to the pure helper
- exactDataStatusCounts and exactReadinessCounts
- usesExactObFvgZonesCount
- dominantExactStatus and dominantExactReadiness

## Sample Tiers

- NO_DATA: no exact-zone comparison data
- INFORMATIONAL_LT_50: early observability only
- EARLY_PATTERN_50_TO_99: pattern may be visible but not review eligible
- REVIEW_ELIGIBLE_100_PLUS: review eligible only, still not activation ready

Hard rule: REVIEW_ELIGIBLE is not approval to trade, lower thresholds, activate adaptive RR, or enable OB/FVG execution.

## Warning Flags

- LOW_EXACT_SAMPLE_SIZE
- EXACT_SAMPLES_STUCK
- OB_ONLY_DOMINANT
- NO_FVG_CONFLUENCE
- NEGATIVE_EXACT_DELTA
- LOW_EXACT_PASS_RATE
- HIGH_CONFLICT_RATE
- HIGH_TARGET_TOO_CLOSE_RATE
- HIGH_COST_TOO_HIGH_RATE
- HIGH_MISSED_FILL_RATE
- REVIEW_NOT_ACTIVATION

All warning flags are observability labels only. They do not feed runner, entry, gate, preflight, threshold, or execution decisions.

## Fill-Resolution Placeholder

The helper includes optional counterfactual fill-resolution support. It does not fetch candles and does not read runtime files.

- No candle input: NOT_CONFIGURED
- Empty candle input: NO_CANDLES
- Insufficient future candles or missing price fields: PENDING
- Mixed resolved and pending records: PARTIAL
- Fully resolved records: RESOLVED

Fill rule: a candidate is filled when price touches the refined entry before invalidation. If invalidation is hit first, it is counted as invalidationFirst and missed.

## Safety

- No trading logic change
- No runner decision change
- No entry logic change
- No reward_risk_min or TREND_PAPER_MIN_REWARD_RISK change
- No adaptive RR activation
- No OB/FVG execution activation
- No live trading
- No exchange order path
- No browser write action or internal route call from Agent HQ
- M-0B remains BLOCKED
- Phase 2-B remains BLOCKED
