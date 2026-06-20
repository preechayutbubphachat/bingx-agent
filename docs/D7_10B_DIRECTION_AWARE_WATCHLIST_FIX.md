# D7.10-b Direction-Aware Watchlist and Compact Candidate Fix

## Purpose

D7.10-b corrects three read-only diagnostics contradictions found in the served runtime:

- `compactTopCandidates` can still show several rows for the same candidate geometry when stop values differ by a few USDT.
- the watchlist can report `NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES` while the exact subset reports eligible samples greater than zero but no clean samples.
- a candidate close to current price can look important even when its direction conflicts with the canonical market direction.

This work changes diagnostics contracts and presentation only. It does not change entry, risk, runner, broker, execution, order, paper activation, or live activation behavior.

## Data Flow

1. `currentPriceEligibleExactSubset` retains raw `topCandidates` and builds a separate compact presentation list.
2. `regimeAwareExactCandidateWatchlist` combines compact candidate geometry with canonical regime direction and exact-subset accounting.
3. the Agent HQ adapter maps the watchlist and trend setup into a compact operator summary.
4. the right rail explains the current trend setup, counter-regime candidates, quality blockers, and safety posture without adding controls.

## Compact Candidate Clustering

Candidates belong to the same compact group when these fields match:

- direction
- entry rounded to 0.1 USDT
- target rounded to 0.1 USDT
- current-price status
- quality status
- zone family when available
- readiness when available

Stops use fixed 5 USDT single-link clustering: a candidate joins when its stop is within 5 USDT of any stop already in the group. This collapses the runtime entry `63450.7728` group from `64474.2029` through `64482.7429` without changing raw candidates.

Clustering runs across the full sorted candidate set before the display limit is applied. The group keeps the rank of its highest-ranked member. After grouping, the result is ordered by that retained rank and limited to three rows.

Each compact row exposes aggregated `occurrenceCount`, `representativeStopLoss`, `stopLossRange`, and `duplicateGroupSize`. Raw `topCandidates` remain unchanged.

## Eligible Versus Clean Semantics

`currentPriceEligibleExactSamples` answers whether current price is inside or near structured exact candidate geometry. `cleanCurrentPriceEligibleSamples` answers whether those candidates also pass quality requirements.

When eligible samples are greater than zero and clean samples are zero, the watchlist status is `CURRENT_PRICE_ELIGIBLE_DEGRADED` and the verdict remains `WATCH_ONLY`. It must not use `NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES`.

## Direction Alignment

Each watch candidate receives one direction alignment value:

- `ALIGNED`: LONG under BULLISH or SHORT under BEARISH.
- `COUNTER_REGIME`: SHORT under BULLISH or LONG under BEARISH.
- `REGIME_NOT_CONFIRMED`: canonical direction is neutral, unknown, no-trade, or not confirmed by its regime.
- `UNKNOWN`: candidate direction is unavailable.

Counter-regime candidates receive blocker `REGIME_DIRECTION_CONFLICT`. Direction rejection takes precedence in `actionability`, while independent quality blockers such as `TARGET_TOO_CLOSE` remain visible. A counter-regime candidate is never clean.

Each watch candidate exposes `clean`. It is true only for an aligned `CLEAN_REVIEW_ONLY` candidate; counter-regime and quality-rejected candidates always expose `clean=false`.

The supported degraded actionability values are:

- `COUNTER_REGIME_REJECTED`
- `ELIGIBLE_BUT_DIRECTION_REJECTED`
- `ELIGIBLE_BUT_QUALITY_REJECTED`
- `ELIGIBLE_BUT_DEGRADED`

## Operator Summary

The summary adds explicit trend setup context:

- trend direction, strategy status, and risk status
- pullback zone and required price move
- current-price eligible count and clean count as separate values
- an explanation when near-price candidates are counter-regime and quality rejected
- a next action that waits for the aligned pullback and quality improvement, or a canonical regime change before reviewing the opposite direction

Near entry is labeled as observation context, not an entry signal.

For a stored payload created before D7.10-b, the Agent HQ adapter derives missing direction alignment from candidate direction plus canonical direction and normalizes the contradictory no-eligible status from exact-subset accounting. It does not mutate or write the stored payload.

## Safety Invariants

All output branches preserve:

- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`
- `reviewOnly=true`
- `shadowOnly=true`

The UI remains display-only. No activation, approval, trade, or order control is added. No private exchange request or runtime JSON/JSONL write is introduced.

## Verification Design

Test-first coverage will verify:

1. four near-duplicate raw candidates collapse into one compact row while raw candidates remain available;
2. eligible greater than zero with clean equal to zero maps to degraded watch-only status;
3. BULLISH plus SHORT and BEARISH plus LONG are counter-regime;
4. an aligned candidate with `TARGET_TOO_CLOSE` is quality rejected rather than direction rejected;
5. all safety flags remain locked in every tested branch;
6. helpers do not mutate their inputs;
7. adapter output explains the aligned trend setup and rejected counter-regime candidates.

Release gates are the four focused Node test files, TypeScript checking, a complete production build, served Agent HQ smoke when available, changed-line safety grep, forbidden-path audit, and an explicit staged-file audit.
