# D7.4 Current-Price Candidate QA

## Purpose

D7.4 clarifies the D7.2 current-price exact subset diagnostics after D7.3 started producing structured candidate geometry.

The main runtime interpretation is no longer aggregate-only. Structured exact candidates can exist while `currentPriceEligibleExactSamples` remains `0` because the latest price is not near an entry zone.

## Status Semantics

D7.4 separates two ideas that were previously mixed together:

- `currentPriceStatus`: where the latest price is relative to entry, stop, and target
- `qualityStatus`: whether the candidate itself is clean or degraded

Example with current price around `62778` and a SHORT entry around `63654.92`:

- `currentPriceStatus = WAITING_PULLBACK_TO_ENTRY`
- `qualityStatus = TARGET_TOO_CLOSE`
- `priceMoveRequiredDirection = UP_TO_ENTRY`
- `distanceToEntryPct` is about `1.40`

This means the price is still below the SHORT entry zone and must pull back up before the candidate is current-price eligible. `TARGET_TOO_CLOSE` remains a quality issue, not the current-price state.

## Dedup Semantics

D7.4 deduplicates candidate presentation without deleting underlying evidence.

The deterministic dedup key uses:

- direction
- timeframe
- zone type
- rounded entry
- rounded stop
- rounded target
- readiness

The output includes:

- `dedupSummary.rawCandidates`
- `dedupSummary.uniqueCandidates`
- `dedupSummary.duplicateCandidates`
- `topCandidates[].occurrenceCount`

## Price Source Audit

D7.4 adds `priceSourceAudit` so the operator can see whether D7.2 eligibility used the same price context as the D7.3 geometry snapshot.

If the snapshot does not carry current price, the subset still uses the fresh external `currentPriceContext` as source of truth and marks:

- `snapshotPriceSource = not_available_at_snapshot_build`
- `priceSourceConsistent = false`

## UI Interpretation

The Agent HQ card now shows:

- current price and freshness
- subset price source and snapshot price source
- raw candidate count, unique count, and duplicate count
- current-price eligible count
- clean count
- top candidate current-price status
- top candidate quality status
- distance to entry
- move required toward entry
- occurrence count

Thai operator copy explicitly states:

- current price is not near entry yet
- pullback toward the zone is required before eligibility
- `TARGET_TOO_CLOSE` is a quality issue, not the current-price state

## Safety Model

D7.4 is diagnostics-only:

- `reviewOnly = true`
- `shadowOnly = true`
- `activationAllowed = false`
- `paperActivationAllowed = false`
- `liveActivationAllowed = false`

It does not change entry logic, trading logic, runner behavior, broker behavior, runtime control, paper activation, Live activation, approval, or Order placement.

## Next Step

After D7.4, the next useful phase is runtime verification: confirm the live dashboard shows deduplicated candidates and separates waiting-for-pullback from quality blockers on the latest evidence cycle.
