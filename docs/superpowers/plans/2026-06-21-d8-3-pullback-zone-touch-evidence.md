# D8.3 Pullback Zone Touch Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded recent-candle touch evidence and a review-only confirmation window derived from D8.2 trigger geometry and D8.1 safety context.

**Architecture:** A new pure helper normalizes caller-provided candle arrays, selects 5M before 15M, applies fixed lookbacks, and derives window/invalidation state without reading runtime snapshots or candidate lists. Paper diagnostics builds the helper after D8.2, Agent HQ maps full and compact contracts, and the existing Entry Candidate Resolution card receives compact rows with raw evidence collapsed.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing candle adapter, paper diagnostics, and Agent HQ adapter patterns.

---

## File Structure

- Create `dashboard/lib/trend/pullbackZoneTouchEvidence.ts`: pure D8.3 contracts, candle normalization, touch detection, and window state.
- Create `dashboard/lib/trend/pullbackZoneTouchEvidence.test.ts`: direction, timeframe, lookback, safety, and mutation tests.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: normalize existing candle sources, build D8.3 after D8.2, and expose it additively.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: default/additive integration assertions.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: full touch-evidence VM and compact Operator Summary type.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive full mapper and compact summary mapping.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: full/compact mapping and safe-default assertions.
- Modify `dashboard/lib/trading-agent-hq/mockState.ts`: complete static default fixture.
- Modify `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact touch rows and collapsed raw evidence.
- Keep `docs/superpowers/specs/2026-06-21-d8-3-pullback-zone-touch-evidence-design.md`: approved D8.3 design.
- Create `docs/superpowers/plans/2026-06-21-d8-3-pullback-zone-touch-evidence.md`: this implementation plan.

Do not modify API routes, internal cycle/evidence routes, D8.0-D8.2 helpers, runner/broker/execution/order/live paths, environment/config files, runtime JSON/JSONL, or unrelated dirty/untracked files. The only commit occurs after every validation gate passes.

### Task 1: Pure Helper RED Tests

**Files:**
- Create: `dashboard/lib/trend/pullbackZoneTouchEvidence.test.ts`

- [ ] **Step 1: Add the wished-for API and canonical fixtures**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePullbackZoneTouchEvidence } from "./pullbackZoneTouchEvidence.ts";

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    status: "WAITING_FOR_TRIGGER_PRICE",
    alignedDirection: "LONG",
    currentPrice: 102,
    rawZoneLow: 99,
    rawZoneHigh: 101,
    expandedZoneLow: 98.5,
    expandedZoneHigh: 101.5,
    triggerPrice: 101.5,
    rrReady: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    ...overrides,
  };
}

function gate(overrides: Record<string, unknown> = {}) {
  return {
    rrStatus: "PASS",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    ...overrides,
  };
}

function candle(index: number, low: number, high: number) {
  return { t: Date.parse("2026-06-21T00:00:00.000Z") + index * 300_000, low, high };
}
```

- [ ] **Step 2: Add missing-context and no-evidence tests**

Assert:

```ts
assert.equal(missing.status, "NO_TRIGGER_CONTEXT");
assert.equal(missing.confirmationWindowStatus, "NOT_AVAILABLE");
assert.deepEqual(missing.blockers, ["NO_TRIGGER_CONTEXT"]);

assert.equal(noValid.status, "NO_TOUCH_YET");
assert.equal(noValid.confirmationWindowStatus, "NOT_AVAILABLE");
assert.ok(noValid.blockers.includes("NO_VALID_CANDLES"));

assert.equal(noTouch.status, "NO_TOUCH_YET");
assert.equal(noTouch.confirmationWindowStatus, "WAITING_FOR_TOUCH");
assert.ok(noTouch.blockers.includes("PULLBACK_ZONE_NOT_TOUCHED"));
```

- [ ] **Step 3: Add LONG active and expired touch tests**

Use a latest expanded-only candle with `[low=101.25, high=102]` and expect active, `EXPANDED_ZONE_TOUCHED`, `candlesSinceTouch=0`, timeframe `5M`, and confirmation evaluation true.

Use a latest raw-touch candle with `[low=100, high=102]` and expect active, `RAW_ZONE_TOUCHED`, deepest price `100`, and the approved LONG touch-distance percentage.

Place the last touch three candles before the latest 5M candle and expect:

```ts
assert.equal(result.status, "CONFIRMATION_WINDOW_EXPIRED");
assert.equal(result.candlesSinceTouch, 3);
assert.equal(result.confirmationWindowStatus, "EXPIRED");
assert.equal(result.shouldEvaluateConfirmation, false);
```

- [ ] **Step 4: Add LONG invalidation event tests**

Include multiple invalidation candles. Assert status `INVALIDATION_RISK_TOUCHED`, event timestamp/index comes from the latest invalidation candle, deepest price is the minimum invalidation low, window is `INVALIDATED`, and confirmation evaluation is false.

Test the latest invalidation candle intersecting raw, expanded-only, and neither interval so `touchType` maps to raw, expanded, and null respectively.

- [ ] **Step 5: Add SHORT mirror tests**

Use SHORT geometry with the same raw/expanded intervals and trigger `98.5`. Cover expanded-only active, raw active, expired, and `high > 101.5` invalidation. Assert deepest touch is the maximum high and:

```ts
const expectedPct = Math.max(0, (deepestTouchPrice - 98.5) / 98.5 * 100);
assert.equal(result.touchDistancePct, expectedPct);
```

- [ ] **Step 6: Add timeframe, lookback, and dedupe tests**

Verify valid 5M no-touch evidence wins over touching 15M evidence. Verify invalid-only 5M falls back to 15M and uses the two-candle window.

Build 13 valid 5M candles with a touch/invalidation only at the oldest index; expect no touch because the latest 12 are scanned. Mirror with 9 valid 15M candles and an event only at the excluded oldest index.

Provide duplicate timestamps whose later input record changes no-touch to raw-touch, in unsorted order. Expect the later record to win and `candlesSinceTouch` to be based on ascending timestamp order.

- [ ] **Step 7: Add RR, safety, output-safety, and mutation tests**

For an active touch, set D8.2 `rrReady=false` and expect blocker `RR_NOT_READY`. Set each D8.2 and D8.1 activation flag true separately and expect `SOURCE_SAFETY_FLAGS_INVALID`.

For representative output statuses, assert:

```ts
assert.equal(result.activationAllowed, false);
assert.equal(result.paperActivationAllowed, false);
assert.equal(result.liveActivationAllowed, false);
assert.equal(result.reviewOnly, true);
assert.equal(result.shadowOnly, true);
```

Deep-clone trigger, gate, and both candle arrays before evaluation and assert exact equality afterward.

- [ ] **Step 8: Run the focused test and verify RED**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `pullbackZoneTouchEvidence.ts`.

### Task 2: Pure Helper GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/pullbackZoneTouchEvidence.ts`
- Test: `dashboard/lib/trend/pullbackZoneTouchEvidence.test.ts`

- [ ] **Step 1: Define exact literal contracts and constants**

Define the status, touch type, confirmation-window status, input, and output contracts from the approved spec. Use:

```ts
const FIVE_MINUTE_LOOKBACK = 12;
const FIFTEEN_MINUTE_LOOKBACK = 8;
const FIVE_MINUTE_WINDOW = 3;
const FIFTEEN_MINUTE_WINDOW = 2;

export interface PullbackZoneTouchEvidenceInput {
  pullbackTriggerThresholds?: unknown;
  resolverDrivenPullbackGate?: unknown;
  recent5mCandles?: readonly unknown[] | null;
  recent15mCandles?: readonly unknown[] | null;
}
```

- [ ] **Step 2: Implement safe base output and trigger validation**

Create a base output with `NO_TRIGGER_CONTEXT`, null evidence, `NOT_AVAILABLE`, false confirmation evaluation, forced false activation flags, and true review/shadow flags.

Validate D8.2 direction, positive finite current price/trigger/bounds, ordered raw/expanded intervals, and status not `NO_GATE`. Do not import or read D8.0, exact candidates, or watchlists.

- [ ] **Step 3: Implement immutable candle normalization**

For each array, iterate input order and accept only finite positive `t/high/low` with `high >= low`. Store normalized copies in a `Map<number, Candle>` so later duplicate timestamps replace earlier records. Sort copied values ascending.

Select normalized 5M when non-empty; otherwise select normalized 15M. Slice the selected array to its approved lookback only after dedupe/sort.

- [ ] **Step 4: Implement intersection and event discovery**

Use inclusive interval intersection. For each lookback candle derive raw touch, expanded touch, and direction-specific invalidation.

If invalidation exists, select the latest invalidation candle for time/index/type and min LONG low or max SHORT high for deepest price. Otherwise select the latest expanded-zone touch and derive raw-vs-expanded type from that candle; deepest price spans every zone-touch candle in the lookback.

- [ ] **Step 5: Implement status/window precedence**

Apply:

```text
invalid context -> NO_TRIGGER_CONTEXT / NOT_AVAILABLE
invalidation -> INVALIDATION_RISK_TOUCHED / INVALIDATED
touch and candlesSinceTouch < window -> CONFIRMATION_WINDOW_ACTIVE / ACTIVE
touch outside window -> CONFIRMATION_WINDOW_EXPIRED / EXPIRED
valid candles without touch -> NO_TOUCH_YET / WAITING_FOR_TOUCH
no valid candles -> NO_TOUCH_YET / NOT_AVAILABLE
```

Convert event timestamps with `new Date(t).toISOString()` only after verifying `t` is finite and positive.

- [ ] **Step 6: Implement distance, blockers, next action, and confirmation gate**

Calculate:

```ts
const touchDistancePct = direction === "LONG"
  ? Math.max(0, (triggerPrice - deepestTouchPrice) / triggerPrice * 100)
  : Math.max(0, (deepestTouchPrice - triggerPrice) / triggerPrice * 100);
```

Build blockers in the approved stable order. Safety is valid only when all three activation flags are exactly false on both D8.2 and D8.1. Set `shouldEvaluateConfirmation` only for active status with D8.2 `rrReady===true` and valid source safety.

Use deterministic next actions for no context, no candles, no touch, active eligible, active blocked, expired, and invalidation states.

- [ ] **Step 7: Run focused tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
```

Expected: all tests PASS with no failures.

### Task 3: Paper Diagnostics Wiring with TDD

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts`

- [ ] **Step 1: Add failing additive/default assertions**

Extend the old/default payload test before changing production wiring:

```ts
assert.equal(d.pullbackZoneTouchEvidence.source, "PULLBACK_ZONE_TOUCH_EVIDENCE_V1");
assert.equal(d.pullbackZoneTouchEvidence.status, "NO_TRIGGER_CONTEXT");
assert.equal(d.pullbackZoneTouchEvidence.confirmationWindowStatus, "NOT_AVAILABLE");
assert.equal(d.pullbackZoneTouchEvidence.shouldEvaluateConfirmation, false);
assert.equal(d.pullbackZoneTouchEvidence.activationAllowed, false);
assert.equal(d.pullbackZoneTouchEvidence.paperActivationAllowed, false);
assert.equal(d.pullbackZoneTouchEvidence.liveActivationAllowed, false);
```

- [ ] **Step 2: Run paper diagnostics test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because `pullbackZoneTouchEvidence` is undefined.

- [ ] **Step 3: Add imports and output type**

Import `normalizeCandles` alongside `getCandlesFromSnapshot`, import D8.3 helper/type, and add `pullbackZoneTouchEvidence: PullbackZoneTouchEvidence` to `PaperLoopDiagnostics`.

- [ ] **Step 4: Normalize existing context sources and build after D8.2**

Use only existing paper context:

```ts
const recent5mCandles = normalizeCandles(
  context.latest5mCandles ?? (
    context.marketSnapshot ? getCandlesFromSnapshot(context.marketSnapshot, "5M") : []
  ),
);
const recent15mCandles = normalizeCandles(
  context.marketSnapshot ? getCandlesFromSnapshot(context.marketSnapshot, "15M") : [],
);
const pullbackZoneTouchEvidence = evaluatePullbackZoneTouchEvidence({
  pullbackTriggerThresholds,
  resolverDrivenPullbackGate,
  recent5mCandles,
  recent15mCandles,
});
```

Return the field next to D8.2. Do not modify context producers, API routes, internal routes, strategies, or operational consumers.

- [ ] **Step 5: Run helper and paper tests and verify GREEN**

Run D8.3 helper and paper diagnostics tests. Expected: both PASS.

### Task 4: Adapter and View Model Contract with TDD

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts`
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts`

- [ ] **Step 1: Add a failing raw fixture and mapping assertions**

Add a raw active-touch payload to the existing adapter fixture and assert:

```ts
assert.equal(vm.paper.pullbackZoneTouchEvidence.status, "CONFIRMATION_WINDOW_ACTIVE");
assert.equal(vm.paper.pullbackZoneTouchEvidence.touchType, "RAW_ZONE_TOUCHED");
assert.equal(vm.paper.pullbackZoneTouchEvidence.lastTouchTimeframe, "5M");
assert.equal(vm.paper.pullbackZoneTouchEvidence.candlesSinceTouch, 1);
assert.equal(vm.paper.pullbackZoneTouchEvidence.shouldEvaluateConfirmation, true);
assert.equal(vm.paper.operatorSummary.pullbackTouch.touchStatus, "CONFIRMATION_WINDOW_ACTIVE");
assert.equal(vm.paper.operatorSummary.pullbackTouch.confirmationWindowStatus, "ACTIVE");
assert.equal(vm.paper.operatorSummary.pullbackTouch.shouldEvaluateConfirmation, true);
assert.equal(vm.paper.pullbackZoneTouchEvidence.activationAllowed, false);
```

Add a missing-payload/default assertion for `NO_TRIGGER_CONTEXT`, null fields, false booleans, and false activation permissions.

- [ ] **Step 2: Run adapter tests and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because the D8.3 VM and mapper are absent.

- [ ] **Step 3: Add full and compact VM types**

Add `PaperVM.pullbackZoneTouchEvidence` with every output field. Add:

```ts
pullbackTouch: {
  touchStatus: string;
  touchType: string | null;
  lastTouchAt: string | null;
  lastTouchTimeframe: string | null;
  candlesSinceTouch: number | null;
  confirmationWindowStatus: string;
  shouldEvaluateConfirmation: boolean;
  nextAction: string;
};
```

to `OperatorSummaryVM`.

- [ ] **Step 4: Implement defensive full and compact mapping**

Map missing strings to approved safe defaults, numbers/timestamps/touch type to null, arrays through `strArray`, and confirmation evaluation through `bool`. Force all three permission fields false and review/shadow fields true regardless of raw input.

Read `loop.pullbackZoneTouchEvidence` in `buildOperatorSummaryFromRaw` without replacing the general operator summary next action.

- [ ] **Step 5: Complete static mock state**

Add a full `NO_TRIGGER_CONTEXT` D8.3 fixture and matching compact `pullbackTouch` fixture. Do not fabricate prices or timestamps.

- [ ] **Step 6: Run adapter tests and typecheck**

Expect adapter tests to PASS and `npx tsc --noEmit --incremental false` to report no missing VM/mock fields.

### Task 5: Compact Existing-Card UI

**Files:**
- Modify: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`

- [ ] **Step 1: Add compact touch rows to the existing gate section**

Read `paper.operatorSummary.pullbackTouch` and render:

```tsx
<Row label="Touch status / Type" value={`${touch.touchStatus} / ${touch.touchType ?? NA}`} />
<Row label="Last touch / Timeframe" value={`${touch.lastTouchAt ?? NA} / ${touch.lastTouchTimeframe ?? NA}`} />
<Row label="Candles since / Window" value={`${touch.candlesSinceTouch ?? NA} / ${touch.confirmationWindowStatus}`} />
<Row label="Evaluate confirmation" value={touch.shouldEvaluateConfirmation ? "YES" : "NO"} />
```

Use D8.3 next action for the touch subsection while preserving existing D8.1/D8.2 visible fields and safety labels. Do not add another card or any interactive control.

- [ ] **Step 2: Add raw evidence to existing collapsed details**

Read `paper.pullbackZoneTouchEvidence` and show deepest touch price, touch distance, raw bounds, expanded bounds, and blockers inside the existing `<details>` body. Keep details closed by default.

- [ ] **Step 3: Run typecheck after the final UI patch**

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS.

### Task 6: Required Validation and Served Smoke

**Files:**
- Verification only.

- [ ] **Step 1: Run every required focused test from the final working tree**

```powershell
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: every command exits 0 with zero failures.

- [ ] **Step 2: Run final typecheck and full production build**

```powershell
npx tsc --noEmit --incremental false
npm run build
```

Expected: typecheck exits 0 and Next.js reaches completed page generation/finalization after the latest UI patch.

- [ ] **Step 3: Run served smoke from that successful build when possible**

Start `next start` on an unused local port and inspect `/agent-hq`. Verify compact touch rows, collapsed raw details, visible review-only/no activation/no order labels, and no action controls. If redirected to login without an authorized local session, record `visual smoke not completed`; do not claim visual pass.

### Task 7: Safety Audit, Explicit Stage, Commit, and Push

**Files:**
- Only the D8.3 files listed in File Structure.

- [ ] **Step 1: Inspect complete workspace status and D8.3 diff scope**

```powershell
git status --short
git diff --stat
git diff --name-only
```

Identify and exclude all pre-existing Trading Cafe, `TopHud.tsx`, M0Z6, environment, runtime, and unrelated files.

- [ ] **Step 2: Run changed-line implementation safety grep**

Reject added implementation lines containing activation flags true, order APIs, live activation, runner/broker/execution references, environment access, file writes, or fetches. Review documentation hits separately as prohibition text.

- [ ] **Step 3: Run forbidden-path audit**

Confirm the D8.3 file set contains no API route, internal route, config, env, secret, runtime JSON/JSONL, runner, broker, execution, order, or live path.

- [ ] **Step 4: Stage only explicit D8.3 files**

Use an explicit `git add` command containing the actual safe files. Never use `git add .`.

- [ ] **Step 5: Verify cached scope and whitespace**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

Compare cached names exactly with the approved D8.3 set and confirm unrelated dirty files remain unstaged.

- [ ] **Step 6: Commit once after every validation gate passes**

```powershell
git commit -m "feat(trend): add pullback zone touch evidence"
```

- [ ] **Step 7: Push main without force and verify synchronization**

```powershell
git push origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected final synchronization: `0 0`.
