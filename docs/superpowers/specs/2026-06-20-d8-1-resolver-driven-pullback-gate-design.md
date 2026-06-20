# D8.1 Resolver-Driven Pullback Trigger and Confirmation Gate Design

## Purpose

D8.1 turns the D8.0 `entryCandidateResolution` contract into the source of truth for a second, pure analysis state machine. The new gate re-evaluates whether current price has reached the aligned pullback zone, whether the resolver's best RR is acceptable, and whether fresh 5M/15M indicators provide non-conflicting directional confirmation.

The gate remains diagnostics-only and review-only. It does not alter runner, broker, execution, order, paper activation, live activation, approval, strategy, or exchange behavior.

## Architecture

Create:

`dashboard/lib/trend/resolverDrivenPullbackGate.ts`

```ts
evaluateResolverDrivenPullbackGate(input: ResolverDrivenPullbackGateInput): ResolverDrivenPullbackGate
```

The helper consumes only:

- `entryCandidateResolution` from D8.0;
- `multiTimeframeIndicatorEvidence` for fresh 5M/15M ATR and momentum evidence.

It does not consume raw exact candidates or watchlist candidates. This prevents a counter-regime candidate from becoming an entry source.

Data flow:

1. `entryCandidateResolution` resolves canonical aligned direction, current price, aligned zone, best RR, and threshold.
2. The pullback gate calculates tolerance and current distance to the raw zone.
3. The gate evaluates expanded-zone membership.
4. RR is evaluated only from D8.0 `bestReviewCandidate.rr` and `rrThreshold`.
5. Confirmation is evaluated only after price is in the expanded aligned zone.
6. `paperLoopDiagnostics.resolverDrivenPullbackGate` exposes the additive output.
7. Agent HQ maps the output into a dedicated VM and nested compact Operator Summary fields.
8. The existing Entry Candidate Resolution card receives one compact Pullback Gate section; no second diagnostic card is added.

The helper is deterministic, side-effect free, and must not mutate either input.

## Output Contract

```ts
type ResolverDrivenPullbackGateStatus =
  | "NO_ALIGNED_RESOLUTION"
  | "WAITING_PULLBACK"
  | "PRICE_IN_ALIGNED_ZONE"
  | "RR_READY_WAITING_CONFIRMATION"
  | "CONFIRMATION_PENDING"
  | "CLEAN_REVIEW_CANDIDATE"
  | "NO_TRADE_BAD_RR";

type PullbackRrStatus = "PASS" | "FAIL" | "UNKNOWN";

type PullbackConfirmationStatus =
  | "NOT_EVALUATED_OUTSIDE_ZONE"
  | "WAITING_FOR_FRESH_EVIDENCE"
  | "CONFLICTING_MOMENTUM"
  | "MOMENTUM_NOT_CONFIRMED"
  | "CONFIRMED_BULLISH"
  | "CONFIRMED_BEARISH"
  | "UNKNOWN";

interface ResolverDrivenPullbackGate {
  schemaVersion: 1;
  source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: ResolverDrivenPullbackGateStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  zone: [number, number] | null;
  zoneTolerance: number | null;
  priceDistanceToZonePct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  rrStatus: PullbackRrStatus;
  confirmationStatus: PullbackConfirmationStatus;
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

All status branches return the same safety literals.

## Aligned Resolution Validation

An aligned resolution exists only when all conditions hold:

- `entryCandidateResolution.alignedDirection` is `LONG` or `SHORT`;
- `currentPrice` is finite and positive;
- `alignedEntryZone` contains two finite positive values;
- the normalized zone has `zoneLow <= zoneHigh`;
- resolver status is not `NO_ALIGNED_SETUP` or `COUNTER_REGIME_ONLY`.

If these conditions fail, return `NO_ALIGNED_RESOLUTION`. The gate must not reconstruct direction or zone from other diagnostics.

## Zone Tolerance

Use fresh 15M ATR when available:

```text
priceFloorTolerance = currentPrice * 0.0005
atrTolerance = 0.10 * ATR_15m
zoneTolerance = max(atrTolerance, priceFloorTolerance)
```

15M ATR is usable only when:

- ATR is finite and greater than zero;
- `freshness.ageMs` is finite, non-negative, and at most 45 minutes.

Fallback when ATR is absent, invalid, or stale:

```text
zoneTolerance = currentPrice * 0.0005
```

Expanded-zone membership for both directions is the same bounded interval:

```text
currentPrice >= zoneLow - zoneTolerance
and
currentPrice <= zoneHigh + zoneTolerance
```

Direction is still required because confirmation is directional.

`priceDistanceToZonePct` measures distance to the raw, unexpanded zone:

- `0` when current price is inside `[zoneLow, zoneHigh]`;
- otherwise `abs(currentPrice - nearestRawZoneEdge) / currentPrice * 100`.

This allows an operator to see a small positive distance while the price is accepted by tolerance.

## RR Gate

RR is sourced only from:

- `entryCandidateResolution.bestReviewCandidate.rr`;
- `entryCandidateResolution.rrThreshold`.

Rules:

- both finite and `bestRR >= rrThreshold` -> `rrStatus = PASS`;
- both finite and `bestRR < rrThreshold` -> `rrStatus = FAIL`;
- either missing or invalid -> `rrStatus = UNKNOWN`.

A passing RR never overrides pullback location. If price remains outside the expanded zone, the gate remains `WAITING_PULLBACK`.

## Indicator Freshness

Freshness limits reuse the current-price rules:

- 5M evidence: `ageMs <= 15 minutes`;
- 15M evidence: `ageMs <= 45 minutes`.

Age must be finite and non-negative. Stale evidence is ignored: it neither confirms nor conflicts. If no fresh usable timeframe remains, confirmation status is `WAITING_FOR_FRESH_EVIDENCE`.

## Directional Confirmation Votes

For each fresh timeframe, derive up to three votes:

1. DI vote, only when both values are finite:
   - `plusDI > minusDI` -> bullish;
   - `minusDI > plusDI` -> bearish;
   - equal -> neutral.
2. MACD histogram vote, only when finite:
   - positive -> bullish;
   - negative -> bearish;
   - zero -> neutral.
3. EMA slope vote, only when finite:
   - positive -> bullish;
   - negative -> bearish;
   - zero -> neutral.

Classify each timeframe:

- bullish support: at least one bullish vote and no bearish vote;
- bearish support: at least one bearish vote and no bullish vote;
- mixed/neutral: both directions appear, all votes are neutral, or no directional vote is available.

Overall LONG confirmation:

- `CONFLICTING_MOMENTUM` when any fresh timeframe is bearish support;
- `CONFIRMED_BULLISH` when at least one fresh timeframe is bullish support and none is bearish support;
- `MOMENTUM_NOT_CONFIRMED` when fresh evidence exists but none provides clean bullish support.

Overall SHORT confirmation mirrors LONG:

- any bullish-support timeframe conflicts;
- at least one bearish-support timeframe with no bullish-support timeframe confirms;
- otherwise momentum is not confirmed.

Therefore, a bullish 5M signal plus bearish 15M signal remains `CONFLICTING_MOMENTUM`, as approved. A mixed timeframe does not confirm and does not override a clean supporting timeframe.

Confirmation is not evaluated before zone touch. Outside the expanded zone it is always `NOT_EVALUATED_OUTSIDE_ZONE`.

## Status Precedence

Apply the first matching rule:

1. Invalid or missing aligned D8.0 resolution -> `NO_ALIGNED_RESOLUTION`.
2. Price outside expanded zone -> `WAITING_PULLBACK`, regardless of RR.
3. Price in expanded zone and RR unknown -> `PRICE_IN_ALIGNED_ZONE`.
4. Price in expanded zone and RR fails -> `NO_TRADE_BAD_RR`.
5. Price in expanded zone, RR passes, but no fresh usable confirmation evidence -> `RR_READY_WAITING_CONFIRMATION`.
6. Price in expanded zone, RR passes, and fresh evidence is conflicting or not confirmed -> `CONFIRMATION_PENDING`.
7. Price in expanded zone, RR passes, and directional confirmation passes -> `CLEAN_REVIEW_CANDIDATE`.

The clean state remains review-only and does not imply permission, activation, approval, or an order.

## Blockers and Next Action

- `NO_ALIGNED_RESOLUTION`: blocker `NO_ALIGNED_RESOLUTION`; wait for D8.0 aligned resolution.
- `WAITING_PULLBACK`: blocker `CURRENT_PRICE_OUTSIDE_ALIGNED_ZONE`; wait for price to enter the tolerance-expanded zone.
- `PRICE_IN_ALIGNED_ZONE`: blocker `RR_EVIDENCE_MISSING`; refresh RR geometry.
- `NO_TRADE_BAD_RR`: blocker `BEST_RR_BELOW_THRESHOLD`; wait for better entry/stop/target geometry.
- `RR_READY_WAITING_CONFIRMATION`: blocker `FRESH_CONFIRMATION_EVIDENCE_MISSING`; wait for the next fresh 5M/15M cycle.
- `CONFIRMATION_PENDING`: blocker `MOMENTUM_CONFLICT` or `MOMENTUM_NOT_CONFIRMED`; wait for non-conflicting aligned recovery.
- `CLEAN_REVIEW_CANDIDATE`: no analytical blocker; next action is human review only.

Every branch includes:

- do not treat diagnostics as an entry signal;
- do not activate paper or live trading;
- do not place or cancel orders.

## Paper Diagnostics Integration

Build `resolverDrivenPullbackGate` immediately after `entryCandidateResolution`:

```ts
const resolverDrivenPullbackGate = evaluateResolverDrivenPullbackGate({
  entryCandidateResolution,
  multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
});
```

Expose it additively on `PaperLoopDiagnostics`. No output is consumed by strategy, runner, broker, execution, approval, paper activation, live activation, or exchange paths.

## Agent HQ Contract

Add `PaperVM.resolverDrivenPullbackGate` with the full safe mapped contract.

Add a nested compact summary to `OperatorSummaryVM` to avoid collisions with existing trend and resolver fields:

```ts
pullbackGate: {
  pullbackGateStatus: string;
  alignedDirection: string;
  priceDistanceToZonePct: number | null;
  bestRR: number | null;
  rrThreshold: number | null;
  confirmationStatus: string;
  nextAction: string;
}
```

The adapter defaults missing data conservatively to `NO_ALIGNED_RESOLUTION`, `UNKNOWN`, and null values. Permission fields always map to false.

## UI

Extend `EntryCandidateResolutionCard.tsx` with one compact `Pullback & Confirmation Gate` section showing:

- gate status;
- aligned direction;
- distance to zone;
- best RR versus threshold;
- confirmation status;
- next action;
- review-only / no activation / no order safety labels.

Keep raw gate blockers and do-not-do details inside the card's existing collapsed details area. Do not create a second card and do not add buttons, approval controls, or action handlers.

## TDD Coverage

Create `dashboard/lib/trend/resolverDrivenPullbackGate.test.ts` and observe RED before implementation.

Required cases:

1. LONG, price above expanded zone, RR pass -> `WAITING_PULLBACK` and confirmation not evaluated.
2. LONG, price in zone, RR pass, fresh neutral/conflicting evidence -> `CONFIRMATION_PENDING`.
3. LONG, price in zone, RR fail -> `NO_TRADE_BAD_RR`.
4. LONG, price in zone, RR pass, clean bullish confirmation -> `CLEAN_REVIEW_CANDIDATE` with all activation flags false.
5. SHORT mirror with bearish confirmation.
6. Opposite/counter-regime candidates in D8.0 raw evidence do not affect the gate result.
7. Fresh 15M ATR uses `max(0.10 * ATR, currentPrice * 0.0005)`.
8. Stale or missing 15M ATR uses the price fallback.
9. Confirmation is not evaluated outside the zone.
10. 5M bullish plus 15M bearish remains pending due to conflict.
11. Missing fresh confirmation evidence returns `RR_READY_WAITING_CONFIRMATION`.
12. RR missing inside zone returns `PRICE_IN_ALIGNED_ZONE`.
13. Helper does not mutate inputs.
14. Safety flags remain false in every status branch.
15. Paper diagnostics and Agent HQ adapter expose the additive contract.

Required validation:

```text
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Run served smoke from the latest successful build when available. Verify the compact gate section, collapsed raw details, and absence of trading controls. Report honestly if visual smoke cannot be completed.

## Safety and Release Scope

Allowed:

- new pure gate and focused tests;
- additive paper diagnostics wiring;
- adapter, view model, mock state, and existing D8 card extension;
- D8.1 design and implementation plan.

Forbidden:

- runner, broker, execution, order, approval, strategy activation, paper/live activation, or exchange behavior;
- `.env`, secrets, `config/db.php`;
- runtime JSON or JSONL writes;
- unrelated dirty or untracked files.

Before commit, run changed-line safety grep, inspect explicit staged files, use no `git add .`, and require focused tests, typecheck, production build, and latest-build smoke evidence.
