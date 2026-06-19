# D7.8 Watchlist Runtime QA

## Why D7.8 Exists

D7.7 added a regime-aware exact candidate watchlist. Served runtime QA then showed that the operator card could still look inconsistent or too noisy:

- upstream current price was `FRESH`, while downstream cards could show `UNKNOWN`
- near-duplicate watch candidates repeated the same entry/target context
- `WAIT_FOR_PULLBACK` could hide `TARGET_TOO_CLOSE`
- the right rail became too long for fast operator scanning

D7.8 hardens those semantics without changing entry logic or trading behavior.

## Freshness Consistency

Freshness is propagated by priority:

1. `mtfEntryCandidatePipeline.currentPriceContext`
2. `currentPriceConsistencyAudit.canonicalCurrentPrice`
3. the current-price subset context

If the raw runtime context has price but no freshness fields, the subset now fills `freshnessStatus` and `ageSeconds` from the evaluated pipeline context.

## Dedup And Clustering

The watchlist keeps raw evidence intact, but presentation is clustered separately:

- direction
- zone family / timeframe placeholder
- entry rounded to 0.1 USDT
- target rounded to 0.1 USDT
- stop grouped within 1 USDT tolerance
- quality status
- current price status

The output exposes `watchlistDedupSummary`, plus per-displayed-candidate `occurrenceCount`, `representativeStopLoss`, and `stopLossRange`.

## Actionability Vs Quality

Price actionability and quality blockers are counted separately. A candidate can be waiting for pullback and still be degraded by quality.

For the current runtime shape:

- status remains `WAITING_PULLBACK`
- top candidate becomes `WAIT_FOR_PULLBACK_DEGRADED`
- blockers include price-not-near-entry and `TARGET_TOO_CLOSE`
- `degradedWatchCandidates` and quality counters make the blocker visible
- `cleanReviewCandidates` remains `0`

Clean review remains allowed only when quality is `CLEAN` and current price is near or inside entry. Even then, it is review-only.

## UI Interpretation

The Agent HQ card now shows a compact summary first:

- current price and freshness
- regime and direction
- watchlist status
- clean candidates
- next action
- raw / unique / duplicate counts

Verbose candidate details and checklist content are collapsed under `รายละเอียด candidate` and limited to the top 3 unique watch candidates.

## Safety

D7.8 is diagnostics-only:

- `reviewOnly=true`
- `shadowOnly=true`
- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`

No order placement, private exchange access, runtime JSON writes, runner changes, broker changes, or execution behavior changes are introduced.
