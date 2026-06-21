# D8.3 Pullback Zone Touch Evidence & Confirmation Window Design

## Purpose

D8.2 compares the latest current price with the aligned pullback trigger. That point-in-time comparison cannot prove that a candle wick touched the zone between dashboard refreshes and then moved back outside it. D8.3 adds read-only candle evidence that records recent zone contact, invalidation-side contact, and the remaining confirmation window.

D8.3 is diagnostics-only and review-only. It does not alter D8.0, D8.1, D8.2, strategy behavior, runner, broker, execution, approval, order handling, paper activation, live activation, or exchange behavior.

## Architecture

Create `dashboard/lib/trend/pullbackZoneTouchEvidence.ts` with one pure function:

```ts
evaluatePullbackZoneTouchEvidence({
  pullbackTriggerThresholds,
  resolverDrivenPullbackGate,
  recent5mCandles,
  recent15mCandles,
})
```

The helper receives normalized candle arrays. It must not read `marketSnapshot`, raw exact candidates, watchlist candidates, or runtime files. D8.2 is the only trigger-geometry source. D8.1 supplies the independent safety context. D8.0 is not needed by the helper because aligned direction and geometry are already canonical in D8.2.

Data flow:

1. Paper diagnostics obtains normalized 5M and 15M candle arrays from existing read-only context paths.
2. D8.2 supplies direction, current price, raw/expanded bounds, trigger, and `rrReady`.
3. D8.1 supplies source safety flags.
4. D8.3 selects one timeframe, applies a bounded evidence lookback, and evaluates touch/invalidation evidence.
5. D8.3 derives confirmation-window state and whether confirmation should be evaluated now.
6. Paper diagnostics exposes the additive contract.
7. Agent HQ maps a full safe VM and a compact Operator Summary projection.
8. The existing Entry Candidate Resolution card displays compact touch state; raw evidence remains collapsed.

The helper is deterministic, side-effect free, and must not mutate any input.

## Output Contract

```ts
type PullbackZoneTouchEvidenceStatus =
  | "NO_TRIGGER_CONTEXT"
  | "NO_TOUCH_YET"
  | "CONFIRMATION_WINDOW_ACTIVE"
  | "CONFIRMATION_WINDOW_EXPIRED"
  | "INVALIDATION_RISK_TOUCHED";

type PullbackZoneTouchType =
  | "RAW_ZONE_TOUCHED"
  | "EXPANDED_ZONE_TOUCHED";

type ConfirmationWindowStatus =
  | "NOT_AVAILABLE"
  | "WAITING_FOR_TOUCH"
  | "ACTIVE"
  | "EXPIRED"
  | "INVALIDATED";

interface PullbackZoneTouchEvidence {
  schemaVersion: 1;
  source: "PULLBACK_ZONE_TOUCH_EVIDENCE_V1";
  readiness: "REVIEW_NOT_ACTIVATION";
  status: PullbackZoneTouchEvidenceStatus;
  alignedDirection: "LONG" | "SHORT" | "UNKNOWN";
  currentPrice: number | null;
  rawZoneLow: number | null;
  rawZoneHigh: number | null;
  expandedZoneLow: number | null;
  expandedZoneHigh: number | null;
  triggerPrice: number | null;
  lastTouchAt: string | null;
  lastTouchTimeframe: "5M" | "15M" | null;
  candlesSinceTouch: number | null;
  touchType: PullbackZoneTouchType | null;
  deepestTouchPrice: number | null;
  touchDistancePct: number | null;
  confirmationWindowCandles: number | null;
  confirmationWindowStatus: ConfirmationWindowStatus;
  shouldEvaluateConfirmation: boolean;
  blockers: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
}
```

`RAW_ZONE_TOUCHED` and `EXPANDED_ZONE_TOUCHED` are touch types, not primary statuses. Once candle time and window state are known, primary status reports the confirmation-window lifecycle.

## Trigger Context Validation

A valid D8.2 trigger context requires:

- direction is `LONG` or `SHORT`;
- current price is finite and positive;
- raw and expanded zone bounds are finite and positive;
- each low bound is less than or equal to its high bound;
- trigger price is finite and positive;
- D8.2 status is not `NO_GATE`.

If context is invalid, return:

- status `NO_TRIGGER_CONTEXT`;
- window status `NOT_AVAILABLE`;
- touch/timeframe/numeric evidence fields null where no valid context exists;
- blocker `NO_TRIGGER_CONTEXT`;
- `shouldEvaluateConfirmation=false`.

The helper never reconstructs missing bounds from D8.1, D8.0, raw candidates, or watchlists.

## Candle Normalization

The helper accepts unknown/read-only candle inputs and creates new normalized records. A valid candle requires:

- `t`, `high`, and `low` are finite positive numbers;
- `high >= low`.

Invalid candles are ignored. Input arrays and candle objects are never sorted or modified in place.

Normalization order:

1. Iterate input order and normalize valid records.
2. Deduplicate by timestamp, keeping the latest valid record from input order.
3. Sort the deduplicated records by timestamp ascending.
4. Select 5M when at least one valid 5M candle remains.
5. Use 15M only when zero valid 5M candles remain.
6. Apply the selected timeframe's evidence lookback after dedupe and sort.

The helper does not merge timeframes.

## Evidence Lookback and Window

Fixed limits:

| Timeframe | Evidence lookback | Confirmation window |
| --- | ---: | ---: |
| 5M | 12 valid candles | 3 candles |
| 15M fallback | 8 valid candles | 2 candles |

Old touches and invalidation wicks outside the selected lookback are ignored completely.

`candlesSinceTouch` is measured from the latest candle in the selected lookback:

```text
candlesSinceTouch = latestCandleIndex - eventCandleIndex
```

The touch candle counts as the first window candle:

- 5M is active when `candlesSinceTouch < 3`;
- 15M is active when `candlesSinceTouch < 2`.

Thus a latest-candle touch has `candlesSinceTouch=0`.

## Touch Detection

For either direction, interval intersection is inclusive:

```text
candle.low <= zoneHigh
and
candle.high >= zoneLow
```

For LONG:

- expanded touch intersects `[expandedZoneLow, expandedZoneHigh]`;
- raw touch intersects `[rawZoneLow, rawZoneHigh]`;
- invalidation risk occurs when `candle.low < expandedZoneLow`.

For SHORT:

- expanded touch intersects `[expandedZoneLow, expandedZoneHigh]`;
- raw touch intersects `[rawZoneLow, rawZoneHigh]`;
- invalidation risk occurs when `candle.high > expandedZoneHigh`.

Raw touch wins over expanded-only touch for a candle that intersects both intervals.

## Normal Touch Event Model

When no invalidation-risk candle exists in the lookback:

- identify the latest candle that intersects the expanded zone;
- `lastTouchAt` is that candle's timestamp in ISO format;
- `candlesSinceTouch` is measured from that candle;
- `touchType` is `RAW_ZONE_TOUCHED` if the latest touch candle intersects the raw zone, otherwise `EXPANDED_ZONE_TOUCHED`;
- LONG `deepestTouchPrice` is the minimum low among all zone-touch candles in the lookback;
- SHORT `deepestTouchPrice` is the maximum high among all zone-touch candles in the lookback.

Touch penetration uses the directional trigger:

```text
LONG  = max(0, (triggerPrice - deepestTouchPrice) / triggerPrice * 100)
SHORT = max(0, (deepestTouchPrice - triggerPrice) / triggerPrice * 100)
```

## Invalidation Event Model

Invalidation risk dominates both touch and window states when any invalidation-risk candle exists inside the selected lookback.

For `INVALIDATION_RISK_TOUCHED`:

- `lastTouchAt` references the latest invalidation candle;
- `candlesSinceTouch` is measured from the latest invalidation candle;
- LONG `deepestTouchPrice` is the minimum low among invalidation-risk candles;
- SHORT `deepestTouchPrice` is the maximum high among invalidation-risk candles;
- `touchType` is derived from the latest invalidation candle only:
  - raw when it intersects the raw zone;
  - expanded when it intersects expanded zone but not raw;
  - null when it does not intersect either zone;
- `touchDistancePct` uses the same approved directional penetration formula;
- window status is `INVALIDATED`;
- `shouldEvaluateConfirmation=false`;
- next action requests resolver/zone re-evaluation before review.

Normal touch event fields must not replace invalidation event fields in this branch.

## Status Precedence

Apply the first matching rule:

1. Missing/invalid D8.2 geometry -> `NO_TRIGGER_CONTEXT`.
2. Any invalidation-risk candle inside lookback -> `INVALIDATION_RISK_TOUCHED`.
3. Latest zone touch is within the timeframe window -> `CONFIRMATION_WINDOW_ACTIVE`.
4. Zone touch exists but is outside the timeframe window -> `CONFIRMATION_WINDOW_EXPIRED`.
5. Otherwise -> `NO_TOUCH_YET`.

Window-status mapping:

- `NO_TRIGGER_CONTEXT` -> `NOT_AVAILABLE`;
- no valid candles -> `NOT_AVAILABLE`;
- valid candles with no touch -> `WAITING_FOR_TOUCH`;
- active touch -> `ACTIVE`;
- expired touch -> `EXPIRED`;
- invalidation risk -> `INVALIDATED`.

## Confirmation Evaluation Gate

`shouldEvaluateConfirmation=true` only when all conditions hold:

- primary status is `CONFIRMATION_WINDOW_ACTIVE`;
- D8.2 canonical `rrReady` is exactly true;
- D8.2 activation, paper activation, and live activation flags are exactly false;
- D8.1 activation, paper activation, and live activation flags are exactly false;
- no invalidation risk exists in the lookback.

D8.1 RR fields do not override D8.2 `rrReady`. D8.1 is used for independent safety validation.

The true state means only that fresh directional confirmation should be evaluated. It is not an entry signal, permission, approval, activation, or order instruction.

## Blockers and Next Actions

Blockers are additive and emitted in stable order:

- `NO_TRIGGER_CONTEXT`;
- `NO_VALID_CANDLES`;
- `PULLBACK_ZONE_NOT_TOUCHED`;
- `CONFIRMATION_WINDOW_EXPIRED`;
- `INVALIDATION_RISK_TOUCHED`;
- `RR_NOT_READY`;
- `SOURCE_SAFETY_FLAGS_INVALID`.

Rules:

- no valid candles adds `NO_VALID_CANDLES` and does not claim a touch;
- valid candles without a touch add `PULLBACK_ZONE_NOT_TOUCHED`;
- expired evidence adds `CONFIRMATION_WINDOW_EXPIRED`;
- invalidation adds `INVALIDATION_RISK_TOUCHED`;
- non-ready canonical D8.2 RR adds `RR_NOT_READY`;
- any D8.1/D8.2 safety mismatch adds `SOURCE_SAFETY_FLAGS_INVALID`.

Next actions:

- no context: wait for valid D8.2 trigger geometry;
- no candles: wait for valid recent 5M or 15M candle evidence;
- no touch: wait for price to touch the aligned expanded zone;
- active and otherwise eligible: evaluate fresh 5M/15M aligned confirmation;
- active but RR/safety blocked: retain review-only evidence and resolve the blockers;
- expired: wait for a new aligned zone touch;
- invalidation: re-evaluate resolver/zone geometry before review.

## Paper Diagnostics Integration

Do not modify API routes or internal cycle/evidence routes.

Paper diagnostics creates normalized candle arrays using existing inputs:

5M priority:

1. `context.latest5mCandles` when provided;
2. otherwise `getCandlesFromSnapshot(context.marketSnapshot, "5M")`.

15M fallback input:

- `getCandlesFromSnapshot(context.marketSnapshot, "15M")`.

Paper diagnostics passes both arrays to the helper. The helper performs final validity filtering, dedupe, sorting, timeframe selection, and lookback. If the provided 5M array contains zero valid candles, the helper selects valid 15M evidence.

Build immediately after D8.2:

```ts
const pullbackZoneTouchEvidence = evaluatePullbackZoneTouchEvidence({
  pullbackTriggerThresholds,
  resolverDrivenPullbackGate,
  recent5mCandles,
  recent15mCandles,
});
```

Expose it additively on `PaperLoopDiagnostics`. Do not pass it into strategy or operational consumers.

## Agent HQ Contract

Add a full `PaperVM.pullbackZoneTouchEvidence` contract with conservative defaults:

- status `NO_TRIGGER_CONTEXT`;
- window status `NOT_AVAILABLE`;
- numeric/time/touch fields null;
- `shouldEvaluateConfirmation=false`;
- all permission fields forced false;
- review/shadow fields forced true.

Add compact `operatorSummary.pullbackTouch` fields:

```ts
{
  touchStatus: string;
  touchType: string | null;
  lastTouchAt: string | null;
  lastTouchTimeframe: string | null;
  candlesSinceTouch: number | null;
  confirmationWindowStatus: string;
  shouldEvaluateConfirmation: boolean;
  nextAction: string;
}
```

Adapter mapping must not infer permission from input truthiness. It always maps activation permissions to false.

## UI

Extend only the existing Pullback & Confirmation Gate area in `EntryCandidateResolutionCard.tsx`.

Compact visible rows:

- touch status and type;
- last touch timestamp and timeframe;
- candles since touch and window state;
- whether confirmation should be evaluated;
- next action.

Keep deepest touch price, touch-distance percentage, raw bounds, expanded bounds, and blockers in the existing collapsed details. Do not create a new card, button, approval control, activation control, action handler, or trading affordance.

Visible safety labels remain review-only, no activation, and no order.

## TDD Coverage

Create `dashboard/lib/trend/pullbackZoneTouchEvidence.test.ts` and observe RED before implementation.

Required cases:

1. Missing D8.2 context -> `NO_TRIGGER_CONTEXT`.
2. No valid candles -> `NO_TOUCH_YET` / `NOT_AVAILABLE`.
3. Valid candles with no touch -> `NO_TOUCH_YET` / `WAITING_FOR_TOUCH`.
4. LONG expanded-only latest touch inside 5M window -> active with expanded touch type.
5. LONG raw latest touch inside 5M window -> active with raw touch type.
6. LONG touch at `candlesSinceTouch=3` -> expired.
7. LONG invalidation risk -> dominating invalidation event fields.
8. SHORT expanded/raw/invalidation mirror.
9. Valid 5M evidence has priority over touching 15M evidence.
10. Invalid/empty 5M falls back to valid 15M with two-candle window.
11. 5M lookback excludes touches/invalidation older than 12 valid candles.
12. 15M lookback excludes touches/invalidation older than 8 valid candles.
13. Duplicate timestamps keep the latest input record and sorting is ascending.
14. `shouldEvaluateConfirmation` requires active status and D8.2 RR readiness.
15. Any D8.1 or D8.2 safety mismatch blocks confirmation.
16. Directional touch-distance formula is correct.
17. Helper does not mutate any input.
18. Every branch forces safe output literals.
19. Paper diagnostics exposes the additive field.
20. Adapter maps full and compact contracts with conservative defaults.

## Validation

From `dashboard`:

```text
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Run served smoke from the latest successful build when authentication permits inspection of `/agent-hq`. If the local server redirects to login and no authorized local session is available, report `visual smoke not completed`. Never claim visual pass without inspecting the actual card.

## Safety and Release Scope

Allowed scope:

- new pure D8.3 helper and focused tests;
- additive paper diagnostics wiring/tests;
- Agent HQ adapter, view model, mock state, adapter tests, and existing card extension;
- D8.3 design and implementation-plan documents.

Forbidden scope:

- API routes and internal cycle/evidence routes;
- D8.0, D8.1, or D8.2 behavior changes;
- runner, broker, execution, order, approval, activation, strategy, or exchange behavior;
- private exchange APIs;
- `.env`, secrets, `config/db.php`;
- runtime JSON/JSONL writes;
- unrelated dirty or untracked files.

Before commit:

- inspect status, diff stat, and changed names;
- run changed-line safety grep and forbidden-path audit;
- stage only explicit D8.3 files and never use `git add .`;
- verify cached names, stat, and whitespace;
- require every focused test, typecheck, and full production build to pass;
- report served smoke honestly;
- commit once with `feat(trend): add pullback zone touch evidence`;
- push `main` without force and verify `HEAD...origin/main` is `0 0`.
