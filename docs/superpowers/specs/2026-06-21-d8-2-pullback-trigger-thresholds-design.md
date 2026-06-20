# D8.2 Pullback Trigger Thresholds and Candidate Promotion Design

## Purpose

D8.2 turns the D8.1 `resolverDrivenPullbackGate` result into explicit, direction-aware trigger prices and review-candidate promotion diagnostics. It does not search for candidates, reconstruct trend state, recalculate ATR, or read raw exact/watchlist candidates.

The output is diagnostics-only and review-only. It cannot activate paper/live trading, place an order, or affect runner, broker, execution, approval, strategy, or exchange behavior.

## Architecture

Create `dashboard/lib/trend/pullbackTriggerThresholds.ts` with one pure function:

```ts
evaluatePullbackTriggerThresholds(
  input: PullbackTriggerThresholdsInput,
): PullbackTriggerThresholds
```

The input contains only `resolverDrivenPullbackGate`. This boundary makes D8.1 the sole source of aligned direction, current price, raw zone, tolerance, RR state, confirmation state, and safety posture. Because the helper has no candidate-array input, a counter-regime exact/watchlist candidate cannot be promoted.

Data flow:

1. D8.1 produces `resolverDrivenPullbackGate`.
2. D8.2 validates that contract and derives raw/expanded boundaries.
3. D8.2 calculates a direction-aware trigger and remaining distance.
4. D8.2 classifies price location before applying promotion rules.
5. Paper diagnostics expose the additive `pullbackTriggerThresholds` field.
6. Agent HQ maps the full safe contract and a compact summary.
7. The existing Entry Candidate Resolution card displays compact trigger rows and keeps raw details collapsed.

The helper is deterministic, side-effect free, and does not mutate its input.

## Output Contract

```ts
type PullbackTriggerThresholdStatus =
  | "NO_GATE"
  | "WAITING_FOR_TRIGGER_PRICE"
  | "INSIDE_EXPANDED_ZONE"
  | "INSIDE_RAW_ZONE"
  | "BEYOND_ZONE_INVALIDATION_RISK"
  | "READY_FOR_CONFIRMATION_REVIEW";

interface PullbackTriggerThresholds {
  schemaVersion: 1;
  source: "PULLBACK_TRIGGER_THRESHOLDS_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: PullbackTriggerThresholdStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  triggerPrice: number | null;
  rawZoneTriggerPrice: number | null;
  distanceToTriggerAbs: number | null;
  distanceToTriggerPct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrReady: boolean;
  confirmationRequired: boolean;
  promotionBlockedBy: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}
```

All branches return the same safety literals.

## Gate Validation

A valid source gate requires:

- source direction `LONG` or `SHORT`;
- finite positive current price;
- a two-value finite positive zone;
- finite non-negative zone tolerance;
- D8.1 status other than `NO_ALIGNED_RESOLUTION`.

Normalize the zone to `zoneLow <= zoneHigh`. Invalid/missing input returns `NO_GATE`, null geometry, `rrReady=false`, `confirmationRequired=false`, blocker `NO_VALID_PULLBACK_GATE`, and a wait-for-D8.1 next action.

D8.2 never falls back to D8.0, raw MTF evidence, exact candidates, or watchlist candidates.

## Trigger Geometry

For LONG:

```text
expandedZoneLow = zoneLow - tolerance
expandedZoneHigh = zoneHigh + tolerance
triggerPrice = expandedZoneHigh
rawZoneTriggerPrice = zoneHigh
```

For SHORT:

```text
expandedZoneLow = zoneLow - tolerance
expandedZoneHigh = zoneHigh + tolerance
triggerPrice = expandedZoneLow
rawZoneTriggerPrice = zoneLow
```

`distanceToTriggerAbs` means distance remaining before the trigger is reached:

- LONG: `max(0, currentPrice - triggerPrice)`;
- SHORT: `max(0, triggerPrice - currentPrice)`.

Once price reaches or passes the trigger toward the zone, distance is zero. Percentage distance is `distanceToTriggerAbs / currentPrice * 100`.

## Price Location Rules

LONG location precedence:

1. `currentPrice < expandedZoneLow` -> `BEYOND_ZONE_INVALIDATION_RISK`.
2. `currentPrice > expandedZoneHigh` -> `WAITING_FOR_TRIGGER_PRICE`.
3. `zoneLow <= currentPrice <= zoneHigh` -> `INSIDE_RAW_ZONE`.
4. Otherwise inside `[expandedZoneLow, expandedZoneHigh]` -> `INSIDE_EXPANDED_ZONE`.

SHORT mirrors this:

1. `currentPrice > expandedZoneHigh` -> `BEYOND_ZONE_INVALIDATION_RISK`.
2. `currentPrice < expandedZoneLow` -> `WAITING_FOR_TRIGGER_PRICE`.
3. `zoneLow <= currentPrice <= zoneHigh` -> `INSIDE_RAW_ZONE`.
4. Otherwise inside the expanded interval -> `INSIDE_EXPANDED_ZONE`.

Raw and expanded boundaries are inclusive. A price exactly at the directional trigger is inside the expanded zone.

## RR and Confirmation Promotion

`rrReady=true` only when D8.1 reports `rrStatus=PASS`, `bestRR` and `rrThreshold` are finite, the threshold is positive, and `bestRR >= rrThreshold`. D8.2 does not recalculate RR.

`confirmationRequired=true` for every valid source gate, including while price remains outside the zone. Confirmation is acceptable only when:

- LONG has `CONFIRMED_BULLISH`;
- SHORT has `CONFIRMED_BEARISH`.

Promotion to `READY_FOR_CONFIRMATION_REVIEW` requires all conditions:

- price location is `INSIDE_EXPANDED_ZONE` or `INSIDE_RAW_ZONE`;
- `rrReady=true`;
- confirmation was evaluated and matches aligned direction;
- source gate safety flags are false;
- no counter-regime source is possible because D8.2 consumes no candidate arrays.

`READY_FOR_CONFIRMATION_REVIEW` overrides the location status after every promotion condition passes. Zone location remains observable from raw/expanded boundary fields.

## Status Precedence

Apply the first matching rule:

1. Invalid source gate -> `NO_GATE`.
2. Price beyond the opposite expanded boundary -> `BEYOND_ZONE_INVALIDATION_RISK`.
3. Price has not reached the directional trigger -> `WAITING_FOR_TRIGGER_PRICE`.
4. Price is in raw/expanded zone and all promotion conditions pass -> `READY_FOR_CONFIRMATION_REVIEW`.
5. Price is in raw zone -> `INSIDE_RAW_ZONE`.
6. Price is only in tolerance expansion -> `INSIDE_EXPANDED_ZONE`.

## Promotion Blockers and Next Action

Blockers are additive and stable:

- `NO_VALID_PULLBACK_GATE`: source gate is invalid.
- `PRICE_NOT_AT_TRIGGER`: waiting outside the directional trigger.
- `PRICE_BEYOND_EXPANDED_ZONE`: price crossed beyond the opposite tolerance boundary.
- `RR_NOT_READY`: RR is not a validated pass.
- `CONFIRMATION_NOT_EVALUATED`: D8.1 reports `NOT_EVALUATED_OUTSIDE_ZONE` or `UNKNOWN`.
- `CONFIRMATION_NOT_ALIGNED`: confirmation is pending, conflicting, stale, or opposite to direction.
- `SOURCE_SAFETY_FLAGS_INVALID`: any source activation flag is not exactly false.

Outside the zone, location blockers remain visible alongside RR/confirmation blockers. A ready result has no promotion blockers.

For the supplied LONG runtime, the next action states: wait for price to pull back to the trigger or lower, then evaluate confirmation. Inside the zone, the next action identifies the remaining RR or confirmation requirement. Ready state permits human review only and explicitly does not permit activation or an order.

## Current Runtime Interpretation

Given:

```text
currentPrice = 63845.6
zone = [63623.198, 63763.5]
tolerance = 31.9228
```

D8.2 derives:

```text
expandedZone = [63591.2752, 63795.4228]
triggerPrice = 63795.4228
rawZoneTriggerPrice = 63763.5
distanceToTriggerAbs = 50.1772
distanceToTriggerPct ~= 0.0786
status = WAITING_FOR_TRIGGER_PRICE
rrReady = true
confirmationRequired = true
```

Promotion remains blocked by `PRICE_NOT_AT_TRIGGER` and `CONFIRMATION_NOT_EVALUATED`.

## Integration and UI

Build D8.2 immediately after D8.1:

```ts
const pullbackTriggerThresholds = evaluatePullbackTriggerThresholds({
  resolverDrivenPullbackGate,
});
```

Expose it additively on `PaperLoopDiagnostics`. Do not pass it to strategy or operational consumers.

Add a dedicated VM and nested compact summary containing status, trigger price, raw trigger, distance, RR readiness, blockers, and next action. Adapter defaults are conservative and force all permission fields false.

Extend the existing Pullback & Confirmation Gate section with compact rows. Add raw threshold geometry/blockers to its existing collapsed details. Do not create a new card, button, callback, approval control, or action handler.

## TDD and Validation

Create `dashboard/lib/trend/pullbackTriggerThresholds.test.ts` and observe RED before implementation. Cover LONG/SHORT waiting, expanded, raw, invalidation, RR outside-zone precedence, confirmation requirements, ready promotion, invalid source, source safety, no mutation, exact runtime geometry, paper wiring, and adapter mapping.

Required validation:

```text
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Run served smoke from the latest successful build when available. Verify compact trigger values, collapsed raw details, visible safety labels, and no trading controls. Report honestly if visual smoke is unavailable.

## Safety and Release Scope

Allowed files are the new pure helper/test, additive paper diagnostics test/wiring, Agent HQ adapter/view-model/mock/test, the existing Entry Candidate Resolution card, and D8.2 docs.

Forbidden scope includes runner, broker, execution, order, approval, activation, strategy behavior, exchange behavior, `.env`, secrets, `config/db.php`, runtime JSON/JSONL, and unrelated dirty/untracked files.

Before commit, run changed-file safety grep, inspect the explicit staged set, never use `git add .`, require all focused tests/typecheck/build to pass, then commit and push `main` without force.
