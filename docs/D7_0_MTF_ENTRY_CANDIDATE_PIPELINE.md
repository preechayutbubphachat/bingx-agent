# D7.0 MTF Entry Candidate Pipeline

## Purpose

D7.0 adds a read-only MTF Entry Candidate Pipeline for Agent HQ. It turns existing Multi Timeframe, exact OB/FVG, exact-vs-heuristic, shadow outcome, no-trade, and review-readiness diagnostics into one structured object that an operator can scan.

This is not an entry runner, not paper execution, not live execution, not an order signal, and not an activation gate.

## Inputs

The helper consumes existing diagnostics only:

- `multiTimeframeIndicatorEvidence`
- `canonicalMarketRegime`
- `trendStrategy`
- `trendManualPaperArmGate`
- `trendPaperExecutionPreflight`
- `mtfObFvgShadowSummary`
- `exactZoneComparisonSummary`
- `shadowOutcomeSummary`
- `shadowOutcomeQualityGate`
- `shadowEvidenceCoverage`
- `noTradeReasonAnalysis`
- `reviewReadinessScore`

It does not read candles directly, read runtime files, make network calls, or mutate input.

## Status Model

Top-level status:

- `NO_CANDIDATE`
- `ZONE_BUILDING`
- `ZONE_READY`
- `WAITING_TRIGGER`
- `ENTRY_TOUCHED_REVIEW`
- `WARNING_DEGRADED`
- `REVIEW_READY`
- `NOT_READY`

Verdict status:

- `PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY`
- `INSUFFICIENT_EXACT_SAMPLES`
- `TARGET_TOO_CLOSE_DOMINATES`
- `INVALIDATION_DOMINATES_AFTER_TOUCH`
- `WAIT_MORE_EVIDENCE`
- `REVIEW_READY_NOT_ACTIVATION`
- `NO_CANDIDATE`

## Safety Model

The pipeline hard-codes:

- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`
- `reviewOnly=true`
- `shadowOnly=true`
- `readiness=REVIEW_NOT_ACTIVATION`

The result is exposed for operator review through `paperLoopDiagnostics.mtfEntryCandidatePipeline` and Agent HQ display only. It must not feed any runner, gate, order, live, approval, or activation path.

## Current Runtime Interpretation

Current runtime-like classification is:

`WARNING_DEGRADED` with verdict `PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY`.

Why:

- Exact Zone has better RR geometry than heuristic.
- exact samples are about 75/100, so review sample is still short by about 25.
- TARGET_TOO_CLOSE is high.
- missed fill rate is high.
- after entry touch, target-after-touch is still not proven to beat invalidation-after-touch.

## Why This Does Not Change Entry Logic

D7.0 is a pure helper and presentation card. It derives a review object from existing diagnostics and adds no command, button, network call, runtime write, threshold change, entry calculation path, stop/target execution path, paper/live activation, or order placement.

## Next Phase Suggestions

D7.1: Add operator-facing drilldown for blocker trend over time once exact samples reach 100+.

D7.2: Add manual review packet export from existing diagnostics only, still with activation disabled until a separate operator-approved phase.
