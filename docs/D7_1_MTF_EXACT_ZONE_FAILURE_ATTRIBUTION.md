# D7.1 MTF Exact-Zone Failure Attribution

## Purpose

D7.1 adds a read-only analyzer for why MTF Exact Zone candidates are still not ready after D7.0-c and D7.0-d.

The sample gate can now pass at the lifetime cumulative level while the quality gates remain blocked. D7.1 separates these concepts:

- lifetime sample gate
- geometry edge
- fill and touch quality
- current-price eligible evidence
- clean subset gate

## Current Runtime Interpretation

The latest runtime-like state is:

- lifetime exact samples: about `325 / 100`, passed
- latest window exact samples: about `65`
- current-price eligible exact samples: not available yet
- exact RR is materially better than heuristic RR
- target-too-close rate is high
- missed fill rate is high
- target after touch is not proven

Classification: `GEOMETRY_PROMISING_EXECUTION_WEAK`.

This means sample count is no longer the blocker. The blocker is quality: the current window is dominated by candidates that are too close to target, miss fills, or fail to prove target reach after entry touch.

## Geometry Edge vs Quality Edge

RR geometry can be promising without being ready for review.

`exactAvgNetRR > heuristicAvgNetRR` means the exact-zone geometry is useful for ranking and investigation. It does not mean the candidate subset is clean enough.

Clean subset review also requires:

- target-too-close rate not too high
- missed fill rate not too high
- entry touch rate high enough
- target after touch proven
- invalidation after touch controlled
- current-price eligible sample count available

## Clean Subset Thresholds

D7.1 uses these read-only thresholds:

- `minLifetimeExactSamples = 100`
- `maxTargetTooCloseRate = 0.4`
- `maxMissedFillRate = 0.5`
- `minEntryTouchRate = 0.35`
- `minTargetAfterTouchRate = 0.25`
- `maxInvalidationAfterTouchRate = 0.5`
- `currentPriceEligibleRequired = true`

If all pass, the status can become `CLEAN_CANDIDATE_REVIEW_READY_NOT_ACTIVATION`.

Even then, this remains manual review only.

## Safety Model

D7.1 is diagnostics-only and shadow-only.

It does not change entry logic, trade-path behavior, paper activation, real-money activation, private exchange API access, runtime writes, secrets, or configuration.

All activation flags remain false.

## D7.2 Recommendation

Next recommended phase: build a current-price eligible exact subset builder.

D7.2 should isolate the exact-zone observations still valid against the latest market snapshot, then feed that count and subset quality into D7.1. That should make `currentPriceEligibleExactSamples` actionable instead of `null`.
