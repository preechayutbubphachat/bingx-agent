# D8.0 Entry Candidate Resolver and RR Repair Engine

## Purpose

D8.0 adds a diagnostics-only resolver that explains whether the current canonical trend setup has a reviewable entry candidate, whether reward/risk can be repaired using existing market geometry, and why opposite-direction exact candidates are rejected.

The resolver does not change strategy, runner, broker, execution, order, activation, paper, or live behavior. It consumes existing diagnostics and produces read-only contract and UI fields.

## Current Runtime Interpretation

The current runtime can contain all of the following at the same time:

- a canonical bullish or bearish regime;
- an aligned trend entry zone that current price has not reached;
- exact candidates near current price in the opposite direction;
- candidates rejected for both regime conflict and poor target geometry;
- no clean current-price candidate.

The resolver must preserve those distinctions. An opposite-direction candidate must not become the recommended entry merely because it is nearer to current price.

## Architecture

Add a pure helper:

`dashboard/lib/trend/entryCandidateResolver.ts`

```ts
resolveEntryCandidate(input: EntryCandidateResolverInput): EntryCandidateResolution
```

Data flow:

1. Consume canonical regime, trend strategy and entry-zone geometry.
2. Consume current-price exact subset, regime-aware watchlist, MTF pipeline, attribution, evidence, and current-price audit.
3. Resolve aligned direction and current-price location.
4. Build available RR scenarios without inventing market levels.
5. Quarantine opposite-direction candidates with all applicable blockers.
6. Select the best review-only scenario under the status precedence below.
7. Expose the result through `paperLoopDiagnostics.entryCandidateResolution`.
8. Map compact operator fields through the Agent HQ adapter and view model.
9. Render a compact `Entry Candidate Resolution` section with raw scenarios collapsed.

The helper must be deterministic, side-effect free, and must not mutate its inputs.

## Safety Contract

Every output branch must retain:

```ts
activationAllowed: false
paperActivationAllowed: false
liveActivationAllowed: false
reviewOnly: true
shadowOnly: true
```

The feature must not add activation or order controls and must not write runtime JSON or JSONL.

## Output Contract

The result contains at least:

```ts
type EntryCandidateResolutionStatus =
  | "NO_ALIGNED_SETUP"
  | "WAITING_PULLBACK"
  | "RR_REPAIR_REQUIRED"
  | "RR_REPAIRED_REVIEW_ONLY"
  | "COUNTER_REGIME_ONLY"
  | "CLEAN_REVIEW_CANDIDATE"
  | "NO_TRADE_BAD_RR";

type EntryPriceLocation =
  | "INSIDE_LONG_ZONE"
  | "NEAR_LONG_ZONE"
  | "ABOVE_LONG_ZONE"
  | "BELOW_LONG_ZONE"
  | "INSIDE_SHORT_ZONE"
  | "NEAR_SHORT_ZONE"
  | "ABOVE_SHORT_ZONE"
  | "BELOW_SHORT_ZONE"
  | "NO_ZONE"
  | "UNKNOWN";

interface EntryCandidateResolution {
  status: EntryCandidateResolutionStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  priceLocation: EntryPriceLocation;
  rrThreshold: number;
  rrThresholdSource: string;
  rrScenarios: EntryRrScenario[];
  bestReviewCandidate: EntryRrScenario | null;
  rejectedOppositeCandidates: RejectedOppositeCandidate[];
  blockers: string[];
  nextAction: string;
  doNotDo: string[];
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}
```

Each RR scenario exposes:

- scenario name;
- `available`;
- direction;
- entry, stop loss, and target;
- risk distance and reward distance;
- calculated RR;
- whether it meets the threshold;
- source fields and availability notes.

Unavailable scenarios remain visible with `available=false`, null geometry and RR, and an explicit reason.

## Canonical Direction

- Canonical bullish/uptrend resolves to `LONG`.
- Canonical bearish/downtrend resolves to `SHORT`.
- Unknown, mixed, or insufficient canonical evidence resolves to `UNKNOWN`.
- Exact candidates in the opposite direction never replace the canonical aligned direction.

## Current-Price Location

Location is evaluated against the aligned entry zone using canonical current price.

- Inside zone maps to `INSIDE_LONG_ZONE` or `INSIDE_SHORT_ZONE`.
- Near zone uses the existing current-price eligibility tolerance of 0.25%, mapping to `NEAR_LONG_ZONE` or `NEAR_SHORT_ZONE`.
- Otherwise location identifies whether price is above or below the aligned zone.
- Missing zone maps to `NO_ZONE`; missing or non-finite current price maps to `UNKNOWN`.

Near-zone classification is review context only. It does not bypass confirmation, quality, freshness, or safety blockers.

## RR Threshold

Use the existing project threshold:

```ts
rrThreshold = 1.2
rrThresholdSource = "trendStrategy.DEFAULT_MIN_RR"
```

The resolver must expose both fields so an operator can distinguish configured policy from calculated RR.

## RR Calculation

For LONG:

```text
risk = entry - stopLoss
reward = target - entry
rr = reward / risk
```

For SHORT:

```text
risk = stopLoss - entry
reward = entry - target
rr = reward / risk
```

A scenario is unavailable when geometry is missing, non-finite, zero-risk, or directionally invalid. Invalid geometry must never produce infinity, negative RR, or a passing result.

## Scenario Builder

Build scenarios from existing evidence only:

1. `ZONE_LOW_ENTRY`
2. `ZONE_MID_ENTRY`
3. `ZONE_HIGH_ENTRY`
4. `CONFIRMATION_ENTRY`
5. `TIGHT_STOP_ENTRY`
6. `EXTENDED_TARGET_ENTRY`

Rules:

- Zone low/mid/high scenarios require finite aligned-zone geometry, stop loss, and target.
- Confirmation entry requires an explicit confirmation entry, or confirmed current-price evidence while price is inside the aligned zone.
- Tight stop requires finite, fresh 5M ATR evidence.
- For LONG, tight stop is `zoneLow - 1 * ATR`.
- For SHORT, tight stop is `zoneHigh + 1 * ATR`.
- Extended target requires a real `target2` or liquidity target already present in diagnostics.
- The resolver must not synthesize a target, stop, ATR, confirmation price, or liquidity level.

## Best Review Candidate

`bestReviewCandidate` is the available aligned scenario with the highest finite RR. Stable tie-breaking follows scenario order.

Selection does not override current-price location, canonical direction, freshness, confirmation, or candidate quality. A mathematically passing scenario can remain waiting or blocked.

## Status Precedence

Apply the first matching rule:

1. `NO_ALIGNED_SETUP`: canonical direction or required aligned setup evidence is unavailable.
2. `COUNTER_REGIME_ONLY`: candidates exist, but only in the direction opposite to the canonical regime and no aligned zone is available.
3. `WAITING_PULLBACK`: an aligned zone exists but current price is outside or only near the zone. This remains the status even when a hypothetical zone-entry RR passes.
4. `CLEAN_REVIEW_CANDIDATE`: current price is inside the aligned zone, an aligned candidate is clean, and the base RR meets 1.2.
5. `RR_REPAIRED_REVIEW_ONLY`: base RR fails, but an available evidence-backed repair scenario meets 1.2.
6. `RR_REPAIR_REQUIRED`: base RR fails and required repair evidence is missing or unavailable.
7. `NO_TRADE_BAD_RR`: repair scenarios were evaluated and none meets 1.2.

`WAITING_5M_CONFIRM` may remain visible on a review candidate as a blocker and next action. It never implies activation permission. Failed or insufficient confirmation evidence prevents a clean classification.

## Opposite-Direction Quarantine

Each rejected opposite candidate exposes its direction, entry geometry, current-price status, quality status, actionability, and blockers.

Required behavior:

- add `REGIME_DIRECTION_CONFLICT`;
- retain quality blockers such as `TARGET_TOO_CLOSE`;
- set `doNotUseAsEntry=true`;
- retain raw source candidates unchanged;
- report the rejected count to the operator summary.

Direction rejection must remain visible without hiding quality rejection.

## Diagnostics Integration

Add `entryCandidateResolution` to `PaperLoopDiagnostics` after its required upstream diagnostics are built. The builder passes immutable snapshots into the pure resolver and does not alter existing strategy or candidate helpers.

No resolver output may feed runner, broker, execution, order, approval, paper activation, or live activation paths.

## Agent HQ Contract

The adapter and view model expose compact fields:

- `entryResolutionStatus`;
- `alignedDirection`;
- `rrBest`;
- `rrThreshold`;
- `priceLocation`;
- `rejectedOppositeCount`;
- `nextAction`.

Raw RR scenarios and rejected candidate details remain available under diagnostics for auditability.

## UI

Add a compact `Entry Candidate Resolution` section near the Operator Summary.

Visible summary:

- resolver status;
- aligned direction;
- current-price location;
- best RR versus threshold;
- rejected opposite count;
- next action;
- `review-only`, `no activation`, and `no order` labels.

Raw scenarios and rejection evidence are collapsed by default. The UI contains no trade, activation, approval, or order affordance.

## TDD Coverage

Write failing tests before implementation for at least:

1. bullish regime resolves LONG and quarantines SHORT candidates;
2. bearish regime resolves SHORT and quarantines LONG candidates;
3. price outside aligned zone returns `WAITING_PULLBACK` even when zone RR passes;
4. base RR passes inside the zone and returns `CLEAN_REVIEW_CANDIDATE`;
5. evidence-backed scenario repairs RR and returns `RR_REPAIRED_REVIEW_ONLY`;
6. missing repair evidence returns `RR_REPAIR_REQUIRED`;
7. evaluated repairs below threshold return `NO_TRADE_BAD_RR`;
8. only opposite candidates with no aligned setup return `COUNTER_REGIME_ONLY`;
9. invalid geometry cannot pass RR;
10. tight stop uses fresh finite 5M ATR and the approved formula;
11. stale or missing ATR makes tight stop unavailable;
12. extended target is unavailable without real target2 or liquidity evidence;
13. all safety flags remain false in every status;
14. inputs and raw candidate arrays are not mutated;
15. paper diagnostics and Agent HQ adapter expose the additive contract.

Required validation:

```text
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Run served UI smoke from the latest successful build when available. Report honestly if visual smoke cannot be completed.

## Scope and Release Guard

Allowed scope:

- resolver and focused tests;
- paper diagnostics additive wiring;
- Agent HQ adapter/view-model mapping;
- compact read-only UI;
- this design document and implementation plan.

Forbidden scope:

- runner, broker, execution, order, approval, live, or activation behavior;
- `.env`, secrets, `config/db.php`;
- runtime JSON or JSONL;
- unrelated dirty or untracked files.

Before commit, run safety grep on changed files only, audit the explicit staged set, use no `git add .`, and commit only after focused tests, typecheck, and build complete successfully.
