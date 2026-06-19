# D7.7 Regime-Aware Exact Candidate Watchlist

## Why D7.7 Exists

D7.6 made canonical current price consistent across trend diagnostics and made no-zone semantics explicit. D7.7 adds the next read-only operator layer: a watchlist that explains which exact candidates are worth monitoring if regime and price later become valid.

This is not an entry system and does not change trading behavior.

## Relation To D7.6

D7.6 answers:

- Which price is canonical current price?
- Are any consumers still using a stale price?
- Is there an active trend zone?

D7.7 answers:

- Which exact candidates should stay on watch?
- What must happen before a candidate can become current-price eligible?
- Which candidates are already missed, invalidated, or quality rejected?

## Current Runtime Interpretation

The current runtime is expected to be watchlist-only:

- Regime is `NO_TRADE`
- Direction is `UNKNOWN`
- No active trend zone is available
- Current-price eligible exact candidates are `0`
- Clean review candidates are `0`
- Top SHORT candidates can wait for pullback, but they remain blocked by regime and quality

The correct operator interpretation is: monitor only, do not treat any candidate as actionable.

## Actionability Semantics

Candidate actionability is classified as:

- `WAIT_FOR_REGIME_CONFIRMATION`
- `WAIT_FOR_PULLBACK`
- `WAIT_FOR_5M_CONFIRMATION`
- `QUALITY_REJECTED`
- `MISSED`
- `INVALIDATED`
- `CLEAN_REVIEW_ONLY`
- `NO_ACTION`

Invalidated and missed candidates are classified before watch states. If regime is `NO_TRADE`, `UNKNOWN`, or not trend-confirmed, candidates cannot be actionable even if their geometry exists.

## Safety Model

The watchlist is diagnostics-only:

- `reviewOnly=true`
- `shadowOnly=true`
- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`

No order placement, approval, private exchange access, runtime file writes, runner changes, broker changes, or execution behavior changes are introduced.

## Next Phase Suggestion

Use the watchlist to reduce operator distraction. The next useful phase is to track whether watched candidates later receive both trend regime confirmation and fresh price proximity, while keeping all activation and order paths blocked.
