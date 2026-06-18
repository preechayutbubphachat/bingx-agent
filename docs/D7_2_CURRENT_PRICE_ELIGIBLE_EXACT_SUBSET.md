# D7.2 Current-Price Eligible Exact Subset

## Purpose

D7.2 answers the operator question: which exact OB/FVG candidates are still usable against the current market price?

D7.1 proved that exact-zone RR geometry can be promising while quality remains weak. D7.2 adds the missing current-price subset layer so the dashboard does not reuse an old verdict without re-checking the latest price context.

## Current-Price-First Principle

The analyzer reads current price from the D7.0-c `currentPriceContext` already produced by `mtfEntryCandidatePipeline`.

Required fields are:

- `currentPrice`
- `priceSource`
- `latestCandleAt`
- `freshnessStatus`
- `ageSeconds`
- `currentCandidateReevaluation`

If price is missing or stale, D7.2 returns `STALE_REEVALUATION_REQUIRED`, sets eligible counts to zero, and asks for a market snapshot refresh or the next runtime cycle.

## Sample Accounting

- Lifetime exact samples: cumulative review progress. This can pass the 100-sample gate.
- Window exact samples: recent rolling sample window. This can move up or down.
- Current-price eligible exact samples: candidates that still line up with the latest price after structured geometry is checked.
- Clean current-price eligible samples: eligible candidates that also pass clean review filters.

Passing lifetime sample count is not the same as having a clean current-price subset.

## Geometry Input Requirement

D7.2 must not invent geometry. Aggregate exact-zone summaries are useful but not enough to compute current-price eligibility.

D7.3 adds `exactCandidateGeometrySnapshot` as the preferred per-candidate source. D7.2 reads candidates in this order:

- `exactCandidateGeometrySnapshot.candidates`
- existing exact candidate records
- latest shadow snapshot fill-resolution input
- aggregate-only exact summary as missing geometry

Required per-candidate fields:

- `direction`
- `entryLow` / `entryHigh` or `entry`
- `stopLoss` or `invalidation`
- `target1` or `target`
- `netRR` or `exactNetRR`

If these fields are missing, status is `GEOMETRY_INPUTS_MISSING` and `currentPriceEligibleExactSamples` remains `null`.

## Clean Subset Rules

A clean candidate is review-only and must have:

- fresh current price
- structured geometry
- known direction
- entry area or entry point
- stop/invalidation
- target
- net RR at least 1.2
- not target-too-close
- not cost-too-high
- not invalidated
- not already missed
- current price near or inside entry

The clean subset gate still requires at least 10 clean eligible candidates plus the D7.1 quality thresholds.

## Safety Model

D7.2 is read-only, shadow-only, and review-only. It does not change entry logic, target/stop logic, runtime control, paper activation, Live activation, approval, or Order placement. It only classifies already-available diagnostics for operator review.

## Expected Current Runtime Interpretation

Current runtime is expected to be Case B unless the decision summary already carries per-candidate exact geometry.

Case B means:

- exact sample gate can be passed
- exact RR geometry can be better than heuristic RR
- current price can be fresh
- but current-price eligible subset cannot be computed yet because structured geometry records are missing
- status is `GEOMETRY_INPUTS_MISSING`
- next action is to add exact candidate geometry snapshot fields to observability

If per-candidate geometry appears later, D7.2 can classify Case A without changing trading behavior.
