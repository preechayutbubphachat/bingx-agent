# T-3H-6-c MTF OB/FVG Entry Refinement Shadow

## Purpose

T-3H-6-c adds a read-only shadow diagnostic that estimates whether a multi-timeframe Order Block / Fair Value Gap style entry refinement could improve reward/risk geometry.

This phase does not lower standards. It asks whether better entry geometry could help setups that fail `reward_risk_min`, especially near-miss cases. It does not change the actual entry, stop, target, runner decision, strategy threshold, order path, or evidence runner behavior.

## Current Project Position

- Paper-only evidence collection remains the active posture.
- Live trading remains disabled.
- Exchange order placement remains disabled.
- M-0B remains BLOCKED.
- Dynamic Regrid Phase 2-B remains BLOCKED.
- Adaptive RR remains design/shadow only.
- Trend evidence and grid evidence remain separate.

## Why This Exists

T-3H-6-b showed that `reward_risk_min` can be the dominant hard blocker. The latest observed RR drilldown pattern was a near-miss raw RR with cost drag after fee/slippage.

The correct next question is not "lower RR now". The safer question is:

- Would a refined entry closer to invalidation improve raw RR?
- Would netRR after fee/slippage improve enough?
- Is the failure caused by entry geometry or cost drag?
- Is there enough evidence to justify a later controlled shadow/sample phase?

## Data Audit

Available now in Agent HQ / paper-performance view model:

- Trend setup direction.
- Current entry estimate or entry zone midpoint.
- Stop/invalidation.
- TP1/liquidity target.
- Raw reward/risk.
- Required reward/risk from public display config.
- Fee and slippage config.
- Current price and distance to entry zone.
- Canonical regime / regime evidence strings.
- ADX, ATR, ATR%, BBW indicator evidence.
- Trend zone candidate pullback zone, invalidation, and target hints.

Missing now:

- Exact OB zone coordinates in the Agent HQ VM.
- Exact FVG zone coordinates in the Agent HQ VM.
- Premium/discount zone coordinates.
- Spread-at-entry snapshot.
- Per-cycle RR snapshot history for >=100 sample comparison.
- Confirmed OB/FVG alignment history.

Approximated in this phase:

- If exact OB/FVG zones are missing, the helper uses a conservative geometry refinement estimate.
- The estimate uses the current entry zone edge or a capped 25% move toward invalidation.
- The estimate is labeled `HEURISTIC_ESTIMATE_ONLY`.

Explicitly not used:

- No private exchange data.
- No live order path.
- No runtime write path.
- No runner decision input.
- No threshold mutation.

## Shadow Model

Pure helper:

- `dashboard/lib/trend/mtfObFvgRefinementShadow.ts`

Inputs include:

- direction
- currentEntry
- currentStop
- currentTarget
- currentRawRR
- requiredRR
- feePct
- slippagePct
- regime
- ADX / ATR / ATR% / BBW
- currentPrice
- distanceToEntryZonePct
- optional OB/FVG zones if they become available later
- optional liquidity target
- optional invalidation

Outputs include:

- currentRawRR / currentNetRR
- refinedEntryEstimate
- refinedStopEstimate
- refinedTargetEstimate
- refinedRawRR / refinedNetRR
- rrImprovement
- netRrImprovement
- wouldPassStaticRR
- wouldPassNetRR
- dataStatus
- classification
- confidence
- qualityScore
- activation flags hard-false

Classifications:

- `NO_DATA`
- `NO_REFINEMENT_AVAILABLE`
- `REFINEMENT_IMPROVES_RR`
- `REFINEMENT_STILL_FAILS_COST`
- `TARGET_TOO_CLOSE`
- `STOP_TOO_WIDE`
- `ENTRY_GEOMETRY_NEAR_MISS`
- `COST_DRAG_DOMINANT`
- `SHADOW_ONLY`

Quality score is conservative and bounded 0-100. Exact OB/FVG availability can increase score later, but current VM data usually produces heuristic confidence only.

## UI

Agent HQ adds `MTF OB/FVG Shadow` near RR Drilldown and Rejection Analysis.

The card displays:

- current rawRR / netRR
- refined rawRR / netRR
- RR improvement
- netRR improvement
- requiredRR
- refined entry estimate
- quality score
- classification
- data status
- observe-only warning

It has no action buttons, no browser token, no fetch to an internal write route, and no order/live/exchange controls.

## Safety Rules

- No threshold change.
- No `TREND_PAPER_MIN_REWARD_RISK` change.
- No runner decision change.
- No entry behavior change.
- No adaptive RR activation.
- No paper order creation.
- No live order creation.
- No exchange API call.
- No token exposure.
- No M-0B unlock.
- No Dynamic Regrid Phase 2-B activation.

## Future Phases

- T-3H-6-c1: optional `rrSnapshot` / `smcMtfShadow` logging in decision evidence.
- T-3H-6-c2: compare static entry vs refined shadow over >=100 samples.
- T-3H-6-c3: paper-only controlled experiment after operator review.

All future activation requires separate approval.

## T-3H-6-c1 Snapshot Logging

Status: IMPLEMENTED as shadow-only observability.

T-3H-6-c1 adds optional snapshot fields to the existing trend evidence decision log. The write hook remains in the internal evidence-cycle route after the evidence state write succeeds. The runner, gate, strategy, preflight, execution engine, broker layer, and thresholds do not read these snapshots.

Optional fields:

```json
{
  "rrSnapshot": {
    "schemaVersion": 1,
    "source": "rr-blocker-drilldown",
    "capturedAt": "2026-06-11T12:00:00.000Z",
    "currentRawRR": 1.15,
    "currentNetRR": 1.06,
    "requiredRR": 1.2,
    "rrGap": 0.05,
    "riskDistance": 921.5,
    "rewardDistance": 1062.9,
    "costR": 0.09,
    "failSeverity": "NEAR_MISS",
    "reason": "TARGET_TOO_CLOSE"
  },
  "smcMtfShadowSnapshot": {
    "schemaVersion": 1,
    "source": "mtf-ob-fvg-refinement-shadow",
    "capturedAt": "2026-06-11T12:00:00.000Z",
    "dataStatus": "HEURISTIC_ESTIMATE_ONLY",
    "classification": "REFINEMENT_IMPROVES_RR",
    "qualityScore": 65,
    "currentRawRR": 1.15,
    "currentNetRR": 1.06,
    "refinedRawRR": 1.45,
    "refinedNetRR": 1.34,
    "rrImprovement": 0.3,
    "netRrImprovement": 0.28,
    "wouldPassStaticRR": true,
    "wouldPassNetRR": true,
    "requiredRR": 1.2,
    "shadowOnly": true,
    "usesExactObFvgZones": false,
    "notes": ["heuristic geometry estimate only"]
  }
}
```

Summary metrics are exposed read-only through the existing decision summary:

- total shadow samples
- samples with refinement
- samples with no data
- average current rawRR / netRR
- average refined rawRR / netRR
- average RR and netRR improvement
- static and net pass counts
- average quality score
- classification counts
- data status counts
- latest snapshot
- sample warning

Sample interpretation:

- `<50` samples: informational only.
- `50-100` samples: early pattern only.
- `>=100` samples: eligible for operator review, not activation.

Safety:

- Snapshot logging failure is best-effort and must not fail the route.
- Older log records without snapshots remain valid.
- Malformed snapshots are skipped in summaries.
- No secrets, headers, tokens, request payloads, account data, order objects, or exchange data are stored.
- No threshold, entry, runner decision, adaptive RR, OB/FVG execution, live trading, or exchange workflow is activated.

## T-3H-6-c2 Shadow Review and Exact Zone Readiness

Status: IMPLEMENTED as Agent HQ review-only observability.

T-3H-6-c2 adds a pure review helper over the existing `mtfObFvgShadowSummary`. It does not read runtime files directly and does not feed any strategy, runner, arm gate, preflight, threshold, or execution path.

Review output:

- `sampleCount`
- `sampleTier`: `INSUFFICIENT_LT_50`, `EARLY_PATTERN_50_TO_99`, `REVIEW_READY_100_PLUS`
- average current/refined netRR and average netRR improvement
- `passNetRate`
- `qualityAverage`
- dominant `dataStatus` and `classification`
- `evidenceGrade`: `NO_DATA`, `WEAK`, `PROMISING`, `STRONG_SHADOW`, `NEEDS_EXACT_ZONE_DATA`
- `readiness`: `OBSERVE_ONLY`, `CONTINUE_LOGGING`, `EXACT_ZONE_DETECTOR_RECOMMENDED`, `ELIGIBLE_FOR_REVIEW_AFTER_100`
- `exactZoneReadiness`: `EXACT_ZONE_READY`, `PARTIAL_DATA_ONLY`, `HEURISTIC_ONLY`, `MISSING_REQUIRED_DATA`
- warnings and recommended next step
- hard safety flags: `paperActivationAllowed=false`, `liveActivationAllowed=false`, `exchangeOrderAllowed=false`

Readiness rules:

- No data: `NO_DATA` / `OBSERVE_ONLY`.
- `<50` samples: `WEAK` / `CONTINUE_LOGGING`.
- `50-99` samples with average netRR improvement `>=0.20`, pass net rate `>=70%`, and quality average `>=65`: `PROMISING` / `EXACT_ZONE_DETECTOR_RECOMMENDED`.
- `>=100` samples with the same strong metrics: `STRONG_SHADOW` / `ELIGIBLE_FOR_REVIEW_AFTER_100`.
- Heuristic-only data always keeps a warning that exact OB/FVG coordinates are required before controlled activation.

Exact zone audit:

- Current c/c1 data can summarize heuristic OB/FVG-style refinement evidence.
- Current review does not have structured exact OB/FVG coordinates, mitigation state, displacement candle geometry, or premium/discount range data in the shadow summary.
- Therefore the current expected exact-zone readiness is usually `HEURISTIC_ONLY`; any future `EXACT_ZONE_READY` state requires explicit structured exact-zone data, not inferred labels or UI text.

Agent HQ UI:

- `MTF OB/FVG Shadow` now includes a `shadow review` block.
- The block displays sample tier, evidence grade, readiness, exact-zone readiness, pass net rate, and dominant data status.
- The card states: `Shadow review only - not an entry signal`, `Exact OB/FVG zones required before activation`, and `No entry logic changed`.

Safety:

- No `reward_risk_min` or `TREND_PAPER_MIN_REWARD_RISK` change.
- No runner decision change.
- No strategy threshold change.
- No arm gate or preflight change.
- No adaptive RR activation.
- No OB/FVG execution activation.
- No paper/live/exchange order path.
