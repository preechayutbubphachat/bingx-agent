# D8.4 Touch-Aware Confirmation Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure review-only promotion state machine that evaluates fresh 5M/15M momentum only after D8.3 touch-window, D8.2 RR, and D8.1-D8.3 safety gates pass.

**Architecture:** A new pure helper consumes only approved D8.1-D8.3 contracts and multi-timeframe indicator evidence. Paper diagnostics exposes it additively, Agent HQ maps a full safe contract and compact summary, and the existing Entry Candidate Resolution section displays compact confirmation state with raw votes collapsed.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing paper diagnostics and Agent HQ adapter patterns.

---

## File Structure

- Create `dashboard/lib/trend/touchAwareConfirmationReview.ts`: pure D8.4 precedence, freshness, vote, confirmation, and promotion logic.
- Create `dashboard/lib/trend/touchAwareConfirmationReview.test.ts`: precedence, direction, freshness, safety, and immutability tests.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: construct and expose D8.4 after D8.3.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: additive/default integration assertions.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: full D8.4 VM and compact Operator Summary contract.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive full mapping and compact summary projection.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: full/compact mapping and safe-default assertions.
- Modify `dashboard/lib/trading-agent-hq/mockState.ts`: complete static safe default.
- Modify `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact D8.4 rows and collapsed vote details.
- Keep `docs/superpowers/specs/2026-06-21-d8-4-touch-aware-confirmation-review-design.md`: approved design.
- Create `docs/superpowers/plans/2026-06-21-d8-4-touch-aware-confirmation-review.md`: this implementation plan.

Do not modify D8.0-D8.3 helpers, API routes, internal routes, runner/broker/execution/order/live paths, runtime JSON/JSONL, environment/config files, or unrelated dirty/untracked files. Use one explicit final commit only after all validation gates pass.

### Task 1: Pure Helper RED Tests

**Files:**
- Create: `dashboard/lib/trend/touchAwareConfirmationReview.test.ts`

- [ ] **Step 1: Add wished-for API and canonical source fixtures**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTouchAwareConfirmationReview } from "./touchAwareConfirmationReview.ts";

function touch(overrides: Record<string, unknown> = {}) {
  return {
    status: "CONFIRMATION_WINDOW_ACTIVE",
    alignedDirection: "LONG",
    touchType: "RAW_ZONE_TOUCHED",
    confirmationWindowStatus: "ACTIVE",
    shouldEvaluateConfirmation: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    ...overrides,
  };
}

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    status: "INSIDE_RAW_ZONE",
    alignedDirection: "LONG",
    currentPrice: 100,
    triggerPrice: 101.5,
    rawZoneLow: 99,
    rawZoneHigh: 101,
    expandedZoneLow: 98.5,
    expandedZoneHigh: 101.5,
    bestRR: 1.8,
    rrThreshold: 1.2,
    rrReady: true,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    ...overrides,
  };
}

function gate(overrides: Record<string, unknown> = {}) {
  return {
    status: "CLEAN_REVIEW_CANDIDATE",
    alignedDirection: "LONG",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    ...overrides,
  };
}

function indicator(overrides: Record<string, unknown> = {}) {
  return {
    plusDI: null,
    minusDI: null,
    macdHistogram: null,
    emaSlope: null,
    freshness: { ageMs: 60_000 },
    ...overrides,
  };
}
```

- [ ] **Step 2: Add context, invalidation, and inactive-window tests**

Assert missing D8.1, D8.2, or D8.3 returns `NO_TOUCH_CONTEXT`, confirmation `NOT_EVALUATED`, empty vote arrays, and safe output flags.

Assert D8.3 `INVALIDATION_RISK_TOUCHED` returns `INVALIDATION_REVIEW_REQUIRED`. Assert `NO_TOUCH_YET` and `CONFIRMATION_WINDOW_EXPIRED` both return `TOUCH_WINDOW_INACTIVE` before RR/safety/indicator evaluation.

- [ ] **Step 3: Prove RR and safety statuses remain reachable**

Use active D8.3 touch with `shouldEvaluateConfirmation=false` and D8.2 `rrReady=false`. Expect:

```ts
assert.equal(result.status, "RR_NOT_READY");
assert.equal(result.confirmationStatus, "NOT_EVALUATED");
assert.deepEqual(result.confirmationVotes, []);
```

Use active touch, RR ready, and each D8.1/D8.2/D8.3 activation primitive mismatched separately. Expect `SOURCE_SAFETY_INVALID`, proving D8.3's derived boolean is not the primary precedence gate.

- [ ] **Step 4: Add no-fresh/usable evidence tests**

Test absent evidence, stale 5M over 15 minutes, stale 15M over 45 minutes, negative age, non-finite age, and fresh `UNAVAILABLE`-only records. Expect `WAITING_FOR_FRESH_CONFIRMATION`, `WAITING_FOR_FRESH_EVIDENCE`, empty used timeframes, and empty votes.

- [ ] **Step 5: Add exact vote-schema tests**

For fresh 5M evidence, assert DI, MACD histogram, and EMA slope map positive/negative/zero/missing values to `BULLISH`, `BEARISH`, `NEUTRAL`, and `UNAVAILABLE` exactly.

Assert one vote object per fresh usable timeframe:

```ts
assert.deepEqual(result.confirmationTimeframesUsed, ["5M", "15M"]);
assert.deepEqual(result.confirmationVotes.map((vote) => vote.timeframe), ["5M", "15M"]);
assert.equal(result.confirmationVotes[0]?.ageMs, 60_000);
```

- [ ] **Step 6: Add LONG confirmation tests**

Use fresh bullish 5M support and expect `PROMOTABLE_REVIEW_CANDIDATE`, `CONFIRMED_BULLISH`, no blockers, and `shouldPromoteToReview=true`.

Use any bearish-support timeframe and expect `CONFIRMATION_CONFLICTING`. Use mixed/neutral-only evidence and expect `CONFIRMATION_NOT_ALIGNED`. Verify bullish 5M plus mixed 15M remains confirmed, while bullish 5M plus bearish 15M conflicts.

- [ ] **Step 7: Add SHORT mirror tests**

Change aligned direction consistently across D8.1-D8.3. Fresh bearish support must produce `CONFIRMED_BEARISH` and promotable review. Any bullish-support timeframe must conflict; mixed/neutral-only evidence must not align.

- [ ] **Step 8: Add promotion, safety-literal, and no-mutation tests**

Iterate representative statuses and assert `shouldPromoteToReview` is true only for the promotable branch. For every branch assert:

```ts
assert.equal(result.activationAllowed, false);
assert.equal(result.paperActivationAllowed, false);
assert.equal(result.liveActivationAllowed, false);
assert.equal(result.reviewOnly, true);
assert.equal(result.shadowOnly, true);
```

Deep-clone D8.1-D8.3 and indicator inputs before evaluation and assert exact equality afterward.

- [ ] **Step 9: Run focused test and verify RED**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `touchAwareConfirmationReview.ts` does not exist.

### Task 2: Pure Helper GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/touchAwareConfirmationReview.ts`
- Test: `dashboard/lib/trend/touchAwareConfirmationReview.test.ts`

- [ ] **Step 1: Define literal contracts and freshness constants**

Define all approved statuses, confirmation statuses, vote types, per-timeframe vote objects, input, and output contracts. Use:

```ts
const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;
const FIFTEEN_MINUTE_FRESH_MS = 45 * 60 * 1000;

export interface TouchAwareConfirmationReviewInput {
  pullbackZoneTouchEvidence?: unknown;
  pullbackTriggerThresholds?: unknown;
  resolverDrivenPullbackGate?: unknown;
  multiTimeframeIndicatorEvidence?: unknown;
}
```

- [ ] **Step 2: Implement safe base output and context validation**

Return `NO_TOUCH_CONTEXT`, `NOT_EVALUATED`, empty arrays, false promotion, forced false permissions, and true review/shadow flags by default.

Validate presence, matching LONG/SHORT direction across D8.1-D8.3, finite positive D8.2 price/trigger/bounds, ordered zones, D8.2 status not `NO_GATE`, and D8.3 status not `NO_TRIGGER_CONTEXT`. Do not import candidate/watchlist modules.

- [ ] **Step 3: Implement early precedence exactly**

Short-circuit in this order:

```text
invalid context -> NO_TOUCH_CONTEXT
D8.3 invalidation -> INVALIDATION_REVIEW_REQUIRED
D8.3 status not active -> TOUCH_WINDOW_INACTIVE
D8.2 rrReady not true -> RR_NOT_READY
D8.1/D8.2/D8.3 safety mismatch -> SOURCE_SAFETY_INVALID
```

Do not use D8.3 `shouldEvaluateConfirmation` to select these statuses. Keep confirmation `NOT_EVALUATED` and vote arrays empty for every early branch.

- [ ] **Step 4: Implement fresh usable timeframe filtering**

Read only `5M` and `15M`. Accept finite non-negative age through the approved maximum. Ignore stale/invalid age. Derive three votes; exclude a timeframe only when all votes are `UNAVAILABLE`.

Emit used timeframes and vote records in deterministic 5M then 15M order.

- [ ] **Step 5: Implement vote and timeframe classification**

DI requires both finite values. MACD histogram and EMA slope vote independently. Classify bullish support when bullish exists without bearish, bearish support when bearish exists without bullish, and mixed/neutral otherwise.

- [ ] **Step 6: Implement directional confirmation and remaining statuses**

No usable timeframe returns `WAITING_FOR_FRESH_CONFIRMATION`. For LONG, any bearish support conflicts, otherwise bullish support confirms; mirror for SHORT. Mixed/neutral evidence neither confirms nor conflicts.

Map conflicts to `CONFIRMATION_CONFLICTING`, non-aligned evidence to `CONFIRMATION_NOT_ALIGNED`, and clean direction to `PROMOTABLE_REVIEW_CANDIDATE`.

- [ ] **Step 7: Implement blockers, next actions, and promotion flag**

Use stable blockers from the spec. Set `shouldPromoteToReview=true` only when final status is promotable and all touch/RR/safety/direction conditions still hold. A promotable next action must explicitly say manual review only with no activation/order action.

- [ ] **Step 8: Run focused tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts
```

Expected: all tests PASS.

### Task 3: Paper Diagnostics Wiring with TDD

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts`

- [ ] **Step 1: Add failing additive/default assertions**

Before production wiring, extend the old/default diagnostics test:

```ts
assert.equal(d.touchAwareConfirmationReview.source, "TOUCH_AWARE_CONFIRMATION_REVIEW_V1");
assert.equal(d.touchAwareConfirmationReview.status, "NO_TOUCH_CONTEXT");
assert.equal(d.touchAwareConfirmationReview.confirmationStatus, "NOT_EVALUATED");
assert.equal(d.touchAwareConfirmationReview.shouldPromoteToReview, false);
assert.equal(d.touchAwareConfirmationReview.activationAllowed, false);
assert.equal(d.touchAwareConfirmationReview.paperActivationAllowed, false);
assert.equal(d.touchAwareConfirmationReview.liveActivationAllowed, false);
```

- [ ] **Step 2: Run paper test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because `touchAwareConfirmationReview` is undefined.

- [ ] **Step 3: Add imports, interface field, and construction after D8.3**

Import helper/type, add `touchAwareConfirmationReview: TouchAwareConfirmationReview` to `PaperLoopDiagnostics`, and build:

```ts
const touchAwareConfirmationReview = evaluateTouchAwareConfirmationReview({
  pullbackZoneTouchEvidence,
  pullbackTriggerThresholds,
  resolverDrivenPullbackGate,
  multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
});
```

Return it next to D8.3. Do not pass it into strategy or operational consumers.

- [ ] **Step 4: Run helper and paper tests and verify GREEN**

Run both focused files. Expected: PASS.

### Task 4: Adapter and View Model Contract with TDD

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts`
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts`

- [ ] **Step 1: Add failing full/compact mapping assertions**

Add a promotable raw payload to the existing adapter fixture and assert:

```ts
assert.equal(vm.paper.touchAwareConfirmationReview.status, "PROMOTABLE_REVIEW_CANDIDATE");
assert.equal(vm.paper.touchAwareConfirmationReview.confirmationStatus, "CONFIRMED_BULLISH");
assert.deepEqual(vm.paper.touchAwareConfirmationReview.confirmationTimeframesUsed, ["5M"]);
assert.equal(vm.paper.touchAwareConfirmationReview.confirmationVotes[0]?.classification, "BULLISH_SUPPORT");
assert.equal(vm.paper.touchAwareConfirmationReview.shouldPromoteToReview, true);
assert.equal(vm.paper.operatorSummary.touchConfirmation.status, "PROMOTABLE_REVIEW_CANDIDATE");
assert.equal(vm.paper.operatorSummary.touchConfirmation.shouldPromoteToReview, true);
assert.equal(vm.paper.touchAwareConfirmationReview.activationAllowed, false);
```

In a missing-payload fixture, assert `NO_TOUCH_CONTEXT`, `NOT_EVALUATED`, empty arrays, false promotion, null numerics, and false permissions.

- [ ] **Step 2: Run adapter tests and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because D8.4 VM/mapping is absent.

- [ ] **Step 3: Add full VM and compact summary types**

Add `PaperVM.touchAwareConfirmationReview` with every output field. Add:

```ts
touchConfirmation: {
  status: string;
  confirmationStatus: string;
  alignedDirection: string;
  touchStatus: string;
  rrReady: boolean;
  shouldPromoteToReview: boolean;
  nextAction: string;
};
```

to `OperatorSummaryVM`.

- [ ] **Step 4: Implement defensive mapper and compact projection**

Map missing payload conservatively, map vote objects field-by-field, preserve only string timeframe values, map numbers through nullable numeric helpers, and map arrays defensively. Force activation permissions false and review/shadow flags true.

Read D8.4 in `buildOperatorSummaryFromRaw` without replacing the existing general operator next action.

- [ ] **Step 5: Complete mock state defaults**

Add full `NO_TOUCH_CONTEXT` and compact `touchConfirmation` defaults. Use empty votes/timeframes, null numbers, false promotion, and no fabricated momentum.

- [ ] **Step 6: Run adapter tests and typecheck**

Expect adapter tests and `npx tsc --noEmit --incremental false` to pass.

### Task 5: Extend Existing Entry Candidate Section

**Files:**
- Modify: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`

- [ ] **Step 1: Add compact D8.4 rows**

Read `paper.operatorSummary.touchConfirmation` and render inside the existing Pullback & Confirmation Gate section:

```tsx
<Row label="Touch confirmation" value={confirmation.status} />
<Row label="Momentum confirmation" value={confirmation.confirmationStatus} />
<Row label="Promote to review" value={confirmation.shouldPromoteToReview ? "YES" : "NO"} />
```

Show D8.4 next action and blockers without creating a new card or control.

- [ ] **Step 2: Add raw votes to existing collapsed details**

Read `paper.touchAwareConfirmationReview`. Render used timeframes, age, DI/MACD/EMA votes, classification, and blockers inside the existing `<details>` element. Keep it closed by default.

- [ ] **Step 3: Run typecheck after final UI patch**

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS.

### Task 6: Required Validation and Served Smoke

**Files:**
- Verification only.

- [ ] **Step 1: Run every required focused test from final working tree**

```powershell
node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts
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

- [ ] **Step 3: Run served smoke when authentication permits**

Restart `next start` from the latest build on an unused local port and inspect `/agent-hq`. Verify compact D8.4 status, collapsed raw votes, visible review-only/no activation/no order labels, and no action controls. If redirected to login without an authorized session, report `visual smoke not completed` and do not claim visual pass.

### Task 7: Safety Audit, Explicit Stage, Commit, and Push

**Files:**
- Only the 11 D8.4 files listed under File Structure.

- [ ] **Step 1: Inspect workspace and scoped diff**

```powershell
git status --short
git diff --stat
git diff --name-only
```

Exclude all pre-existing dirty/untracked files.

- [ ] **Step 2: Run changed-line implementation safety grep**

Reject added implementation lines containing activation flags true, order APIs, live activation, runner/broker/execution references, environment access, file writes, or fetches. Classify spec/plan prohibition wording separately.

- [ ] **Step 3: Run forbidden-path audit**

Confirm D8.4 scope contains no API/internal route, D8.0-D8.3 helper edit, runtime JSON/JSONL, environment/config, runner, broker, execution, order, or live path.

- [ ] **Step 4: Stage explicit safe D8.4 files only**

Use one explicit `git add` list. Never use `git add .`.

- [ ] **Step 5: Verify cached set and whitespace**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

Compare cached names exactly with the approved D8.4 set and verify unrelated files remain unstaged.

- [ ] **Step 6: Commit once after every validation gate passes**

```powershell
git commit -m "feat(trend): add touch-aware confirmation review"
```

- [ ] **Step 7: Push main without force and verify synchronization**

```powershell
git push origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected final synchronization: `0 0`.
