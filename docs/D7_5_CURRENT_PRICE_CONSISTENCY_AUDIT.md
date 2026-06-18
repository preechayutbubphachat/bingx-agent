# D7.5 Current Price Consistency Audit

## Purpose

D7.5 adds a read-only audit that checks whether trend gates are interpreting the same canonical current price before an operator reads candidate status.

It does not change entry logic, runtime loops, private exchange access, approval, or placement behavior.

## Canonical Price Priority

The audit chooses the canonical current price in this order:

1. `mtfEntryCandidatePipeline.currentPriceContext.currentPrice` when freshness is `FRESH`.
2. `marketSnapshotCurrentPriceContext` when provided and freshness is `FRESH`.
3. `currentPriceEligibleExactSubset.currentPrice.value`.
4. Missing current price.

## Output Location

`paperLoopDiagnostics.currentPriceConsistencyAudit`

Schema source:

`CURRENT_PRICE_CONSISTENCY_AUDIT_V1`

## What It Checks

The audit compares known current-price consumers against the canonical price:

- `mtfEntryCandidatePipeline.currentPriceContext.currentPrice`
- `currentPriceEligibleExactSubset.currentPrice.value`
- `trendStrategy.currentPrice`
- `trendTransitionMonitor.watchedFields.currentPrice`
- `snapshotPrice`
- `decisionPrice`

It also re-evaluates the condition `price_inside_entry_zone_or_edge` against the canonical current price.

## Status Semantics

- `CONSISTENT`: canonical price exists and checked consumers match.
- `PRICE_MISMATCH_DETECTED`: at least one consumer uses a different price.
- `STALE_TREND_PRICE_CONSUMERS`: canonical price exists but the selected source is stale.
- `MISSING_CURRENT_PRICE`: no usable canonical current price exists.

## Operator Meaning

If a gate used an older price to conclude that price was inside the entry zone, D7.5 marks that condition as stale for current interpretation. The card shows that the previous zone state is not current truth until the candidate is re-evaluated against the canonical current price.

## Safety

The audit is diagnostics-only:

- `reviewOnly=true`
- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`
- `orderAllowed=false`
