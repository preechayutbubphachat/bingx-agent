# D8.4.1 No-Review-Candidate Bottleneck Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure review-only diagnostic resolver that identifies why D8.0-D8.4 did not produce a review candidate and recommends the next algorithmic research branch without changing candidate generation.

**Architecture:** A new pure helper consumes the approved D8.0-D8.4 outputs plus normalized 5M/15M indicator evidence. Paper diagnostics exposes the result additively, Agent HQ maps a full defensive contract and a compact operator summary, and the existing Entry Candidate section displays only the blocker, distance, recommendation, and next action.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing paper diagnostics and Agent HQ adapter/view-model patterns.

---

## File Structure

- Create `dashboard/lib/trend/noReviewCandidateBottleneckResolver.ts`: pure context, safety, distance, MTF continuation-evidence, precedence, and recommendation logic.
- Create `dashboard/lib/trend/noReviewCandidateBottleneckResolver.test.ts`: status precedence, current-runtime, thresholds, safety, and immutability tests.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: construct and expose D8.4.1 after D8.4.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: additive integration and safe-default assertions.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: full D8.4.1 VM plus compact Operator Summary contract.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive full mapping and compact summary projection.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: full mapping, compact mapping, and safe defaults.
- Modify `dashboard/lib/trading-agent-hq/mockState.ts`: complete static safe default.
- Modify `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact rows and collapsed diagnostic details inside the existing card.
- Keep `docs/superpowers/specs/2026-06-21-d8-4-1-no-review-candidate-bottleneck-resolver-design.md`: approved design source.
- Keep `docs/superpowers/plans/2026-06-21-d8-4-1-no-review-candidate-bottleneck-resolver.md`: this plan.

Do not modify D8.0-D8.4 helpers, D8.5 files, API/internal routes, runner/broker/execution/order/live paths, runtime JSON/JSONL, environment/configuration files, or unrelated dirty/untracked files. Do not create a continuation branch. Use one explicit final commit only after every validation gate passes.

### Task 1: Pure Helper RED Tests

**Files:**
- Create: `dashboard/lib/trend/noReviewCandidateBottleneckResolver.test.ts`

- [ ] **Step 1: Add the wished-for API and canonical fixtures**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNoReviewCandidateBottleneckResolver } from "./noReviewCandidateBottleneckResolver.ts";

const safe = {
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
} as const;

function d8_0(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "ENTRY_CANDIDATE_RESOLVER_V1",
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    ...safe,
    ...overrides,
  };
}

function d8_1(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1",
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    bestRR: 6.208,
    rrThreshold: 1.2,
    ...safe,
    ...overrides,
  };
}

function d8_2(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_TRIGGER_THRESHOLDS_V1",
    status: "WAITING_FOR_TRIGGER_PRICE",
    alignedDirection: "LONG",
    currentPrice: 64_435.4,
    triggerPrice: 63_834.4677,
    distanceToTriggerAbs: 600.9323,
    distanceToTriggerPct: 600.9323 / 64_435.4 * 100,
    bestRR: 6.208,
    rrThreshold: 1.2,
    rrReady: true,
    ...safe,
    ...overrides,
  };
}

function d8_3(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "PULLBACK_ZONE_TOUCH_EVIDENCE_V1",
    status: "NO_TOUCH_YET",
    alignedDirection: "LONG",
    confirmationWindowStatus: "WAITING_FOR_TOUCH",
    ...safe,
    ...overrides,
  };
}

function d8_4(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "TOUCH_AWARE_CONFIRMATION_REVIEW_V1",
    status: "TOUCH_WINDOW_INACTIVE",
    alignedDirection: "LONG",
    confirmationStatus: "NOT_EVALUATED",
    shouldPromoteToReview: false,
    ...safe,
    ...overrides,
  };
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateNoReviewCandidateBottleneckResolver({
    entryCandidateResolution: d8_0(),
    resolverDrivenPullbackGate: d8_1(),
    pullbackTriggerThresholds: d8_2(),
    pullbackZoneTouchEvidence: d8_3(),
    touchAwareConfirmationReview: d8_4(),
    multiTimeframeIndicatorEvidence: null,
    ...overrides,
  });
}
```

- [ ] **Step 2: Add missing-context and promotable-candidate tests**

Delete each D8.0-D8.4 source in separate table cases and assert:

```ts
assert.equal(result.status, "NO_CONTEXT");
assert.equal(result.primaryBlocker, "MISSING_CONTEXT");
assert.equal(result.nextAlgorithmBranch, "NO_ACTION");
```

Use D8.4 status `PROMOTABLE_REVIEW_CANDIDATE` with `shouldPromoteToReview=true`. Expect `PROMOTABLE_REVIEW_EXISTS`, blocker `NONE`, branch `NO_ACTION`, and no attempt to classify continuation evidence.

- [ ] **Step 3: Add RR precedence tests**

Set D8.2 `rrReady=false` and best RR below threshold while leaving waiting/no-touch statuses unchanged. Assert `RR_NOT_READY`, `RR_BELOW_THRESHOLD`, and `REPAIR_RR` precede trigger/touch classification.

Also test a contradictory `rrReady=true` with best RR below threshold. Expect `NO_CONTEXT`, because canonical RR fields disagree.

- [ ] **Step 4: Add LONG and SHORT trigger-wait tests**

For the canonical LONG fixture with no MTF evidence, expect:

```ts
assert.equal(result.status, "WAITING_FOR_PULLBACK_TRIGGER");
assert.equal(result.primaryBlocker, "PRICE_ABOVE_LONG_TRIGGER");
assert.equal(result.triggerDistanceClass, "FAR");
assert.equal(result.nextAlgorithmBranch, "RUN_HISTORICAL_REPLAY_REVIEW");
assert.equal(result.rrReady, true);
```

Mirror all source directions to SHORT, set current price below trigger, and assert `PRICE_BELOW_SHORT_TRIGGER`.

Add contradictory directional price relations and inconsistent distance fields. Expect `NO_CONTEXT`.

- [ ] **Step 5: Add no-touch and expired-window tests**

Use a valid non-waiting D8.2 status with D8.3 `NO_TOUCH_YET`. Expect `NO_TOUCH_EVIDENCE` and `PULLBACK_ZONE_NOT_TOUCHED`.

Use D8.3 `CONFIRMATION_WINDOW_EXPIRED`. Expect `TOUCH_WINDOW_EXPIRED` and `TOUCH_WINDOW_INACTIVE`, preceding generic confirmation-not-ready handling.

- [ ] **Step 6: Add confirmation tests**

Use D8.4 `CONFIRMATION_CONFLICTING`. Expect `CONFIRMATION_CONFLICTING`, `MOMENTUM_CONFLICT`, and `REPAIR_CONFIRMATION`.

Use D8.4 `WAITING_FOR_FRESH_CONFIRMATION` and `CONFIRMATION_NOT_ALIGNED` in separate cases. Expect `CONFIRMATION_NOT_READY`, `MOMENTUM_NOT_CONFIRMED`, and `REPAIR_CONFIRMATION`.

- [ ] **Step 7: Add safety precedence tests**

For each source and each activation primitive, create a mismatch with a computed property so the test file contains no positive activation literal:

```ts
const mismatched = { ...d8_2(), [field]: Boolean(1) };
```

Expect `SAFETY_BLOCKED`, `SOURCE_SAFETY_INVALID`, `NO_ACTION`, and forced-safe output literals.

- [ ] **Step 8: Add distance-class boundary tests**

Build internally consistent prices/distances at exactly 0.05%, 0.25%, and 0.75%. Assert inclusive classes:

```ts
assert.equal(at005.triggerDistanceClass, "AT_TRIGGER");
assert.equal(at025.triggerDistanceClass, "NEAR");
assert.equal(at075.triggerDistanceClass, "FAR");
```

Assert an interior value such as 0.5% is `MID_RANGE`.

- [ ] **Step 9: Add fresh MTF continuation-evidence tests**

Use fresh 5M evidence for LONG:

```ts
const strongLong = {
  "5M": {
    adx: 30,
    plusDI: 28,
    minusDI: 14,
    macdHistogram: 2,
    emaSlope: 0.5,
    freshness: { ageMs: 60_000 },
  },
};
```

Expect `STRONG_ALIGNED`. Mirror bearish values for SHORT. Test ADX below 25, mixed momentum, opposite DI+momentum, stale 5M over 15 minutes, and stale 15M over 45 minutes. Expect `WEAK_OR_MIXED`, `CONFLICTING`, or `INSUFFICIENT` exactly as specified.

- [ ] **Step 10: Add strategy-branch-gap tests**

Use FAR, RR-ready, waiting-trigger, no-touch, touch-window-inactive, and strong aligned MTF evidence. Expect:

```ts
assert.equal(result.status, "STRATEGY_BRANCH_GAP");
assert.equal(result.primaryBlocker, "PRICE_ABOVE_LONG_TRIGGER");
assert.deepEqual(result.contributingBlockers, [
  "PRICE_ABOVE_LONG_TRIGGER",
  "PULLBACK_ZONE_NOT_TOUCHED",
  "PULLBACK_ONLY_STRATEGY_GAP",
]);
assert.equal(result.nextAlgorithmBranch, "DESIGN_CONTINUATION_REVIEW_BRANCH");
```

Replace evidence with missing or weak evidence. Expect ordinary `WAITING_FOR_PULLBACK_TRIGGER` and `RUN_HISTORICAL_REPLAY_REVIEW`.

Set distance to NEAR or MID_RANGE with strong evidence. Expect `WAITING_FOR_PULLBACK_TRIGGER` and `WAIT_FOR_PULLBACK`, proving the continuation recommendation cannot fire close to the existing trigger.

- [ ] **Step 11: Add no-mutation and all-branch safety assertions**

Deep-clone every source and MTF input before evaluation and assert exact equality afterward. Iterate representative statuses and assert:

```ts
assert.equal(result.activationAllowed, false);
assert.equal(result.paperActivationAllowed, false);
assert.equal(result.liveActivationAllowed, false);
assert.equal(result.reviewOnly, true);
assert.equal(result.shadowOnly, true);
assert.ok(result.doNotDo.length > 0);
```

- [ ] **Step 12: Run the focused test and verify RED**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `noReviewCandidateBottleneckResolver.ts` does not exist. Do not create the helper before observing this failure.

### Task 2: Pure Helper GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/noReviewCandidateBottleneckResolver.ts`
- Test: `dashboard/lib/trend/noReviewCandidateBottleneckResolver.test.ts`

- [ ] **Step 1: Define literal contracts and constants**

Define the exact status, blocker, branch, distance, continuation-evidence, input, and output unions from the spec. Use these review-only constants:

```ts
const AT_TRIGGER_MAX_PCT = 0.05;
const NEAR_TRIGGER_MAX_PCT = 0.25;
const FAR_TRIGGER_MIN_PCT = 0.75;
const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;
const FIFTEEN_MINUTE_FRESH_MS = 45 * 60 * 1000;
const MIN_STRONG_ADX = 25;
const DISTANCE_PCT_TOLERANCE = 0.0001;
```

The output interface must use literal false/true safety fields and include `contributingBlockers`, `d8Statuses`, `triggerDistanceClass`, and `continuationEvidence`.

- [ ] **Step 2: Implement defensive primitives and safe defaults**

Use local helpers only:

```ts
type AnyObj = Record<string, unknown>;

function obj(value: unknown): AnyObj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyObj : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sourceSafetyValid(source: AnyObj): boolean {
  return source.activationAllowed === false
    && source.paperActivationAllowed === false
    && source.liveActivationAllowed === false;
}
```

Create one `baseOutput()` that sets null/unknown values, `NO_CONTEXT`, `MISSING_CONTEXT`, `NO_ACTION`, a non-empty `doNotDo`, and forced-safe output literals.

- [ ] **Step 3: Validate sources, directions, RR, and distances**

Read only approved source/version pairs. Require one agreed LONG/SHORT direction. Read canonical numeric fields from D8.2 and verify:

```ts
const computedAbs = Math.abs(currentPrice - triggerPrice);
const computedPct = computedAbs / currentPrice * 100;
const absTolerance = Math.max(0.01, currentPrice * 0.000001);
```

Reject context when distance differences exceed their tolerances, waiting direction disagrees with price relation, or `rrReady` disagrees with `bestRR >= rrThreshold`.

- [ ] **Step 4: Implement distance classification**

Apply boundaries in this order:

```ts
if (distancePct <= AT_TRIGGER_MAX_PCT) return "AT_TRIGGER";
if (distancePct <= NEAR_TRIGGER_MAX_PCT) return "NEAR";
if (distancePct >= FAR_TRIGGER_MIN_PCT) return "FAR";
return "MID_RANGE";
```

- [ ] **Step 5: Implement fresh MTF classification**

Read only `5M` and `15M`. Ignore invalid ages and stale records. A timeframe is strongly aligned only when ADX is at least 25, DI agrees with direction, and MACD histogram or EMA slope agrees. Opposite DI plus opposite momentum is conflicting.

Aggregate in this order: any conflict -> `CONFLICTING`; otherwise any strong aligned -> `STRONG_ALIGNED`; otherwise any fresh usable -> `WEAK_OR_MIXED`; otherwise `INSUFFICIENT`.

- [ ] **Step 6: Implement exact status precedence**

Implement the spec order without using D8.3/D8.4 derived booleans as shortcuts:

```text
NO_CONTEXT
SAFETY_BLOCKED
PROMOTABLE_REVIEW_EXISTS
RR_NOT_READY
CONFIRMATION_CONFLICTING
TOUCH_WINDOW_EXPIRED
STRATEGY_BRANCH_GAP
WAITING_FOR_PULLBACK_TRIGGER
NO_TOUCH_EVIDENCE
CONFIRMATION_NOT_READY
```

For a branch gap, preserve the directional price blocker as primary and add no-touch plus pullback-only blockers. Never alter source contracts.

- [ ] **Step 7: Implement recommendation and copy mapping**

Map statuses and evidence to the six approved branches. FAR plus strong aligned evidence is the only path to `DESIGN_CONTINUATION_REVIEW_BRANCH`. FAR plus insufficient/weak evidence maps to replay review. AT_TRIGGER/NEAR/MID_RANGE maps to waiting for the existing pullback.

Every next action must describe review or research only. Every `doNotDo` array must prohibit moving the trigger, bypassing touch, creating a candidate, implementing D8.5, and activating operational behavior.

- [ ] **Step 8: Run focused tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts
```

Expected: all D8.4.1 helper tests pass with zero failures.

- [ ] **Step 9: Run TypeScript immediately**

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0.

### Task 3: Additive Paper Diagnostics Wiring

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts:108-115,119-199,1118-1157`

- [ ] **Step 1: Add RED integration assertions**

In the existing safe-default diagnostics test, assert:

```ts
assert.equal(d.noReviewCandidateBottleneckResolver.source, "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1");
assert.equal(d.noReviewCandidateBottleneckResolver.status, "NO_CONTEXT");
assert.equal(d.noReviewCandidateBottleneckResolver.primaryBlocker, "MISSING_CONTEXT");
assert.equal(d.noReviewCandidateBottleneckResolver.activationAllowed, false);
assert.equal(d.noReviewCandidateBottleneckResolver.paperActivationAllowed, false);
assert.equal(d.noReviewCandidateBottleneckResolver.liveActivationAllowed, false);
```

Add one current-runtime-style context assertion that preserves `rrReady=true`, `PRICE_ABOVE_LONG_TRIGGER`, and either the branch-gap or replay recommendation according to supplied MTF evidence.

- [ ] **Step 2: Run the paper test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because `noReviewCandidateBottleneckResolver` is absent.

- [ ] **Step 3: Import, construct, and expose D8.4.1**

Add:

```ts
import {
  evaluateNoReviewCandidateBottleneckResolver,
  type NoReviewCandidateBottleneckResolver,
} from "../trend/noReviewCandidateBottleneckResolver.ts";
```

Extend `PaperLoopDiagnostics` with:

```ts
noReviewCandidateBottleneckResolver: NoReviewCandidateBottleneckResolver;
```

Immediately after constructing `touchAwareConfirmationReview`, construct:

```ts
const noReviewCandidateBottleneckResolver = evaluateNoReviewCandidateBottleneckResolver({
  entryCandidateResolution,
  resolverDrivenPullbackGate,
  pullbackTriggerThresholds,
  pullbackZoneTouchEvidence,
  touchAwareConfirmationReview,
  multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
});
```

Return the field additively. Do not feed it into any existing calculation.

- [ ] **Step 4: Run helper and paper tests**

```powershell
node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: both commands pass.

### Task 4: Agent HQ Adapter and View-Model Contract

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts:80-180`
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts:7-885`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts:751-940,1263-1278`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts:404-475,925-1010`

- [ ] **Step 1: Add RED adapter fixtures and assertions**

Add a full raw fixture after `touchAwareConfirmationReview`:

```ts
noReviewCandidateBottleneckResolver: {
  schemaVersion: 1,
  source: "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1",
  readiness: "REVIEW_NOT_ACTIVATION",
  status: "STRATEGY_BRANCH_GAP",
  primaryBlocker: "PRICE_ABOVE_LONG_TRIGGER",
  contributingBlockers: [
    "PRICE_ABOVE_LONG_TRIGGER",
    "PULLBACK_ZONE_NOT_TOUCHED",
    "PULLBACK_ONLY_STRATEGY_GAP",
  ],
  alignedDirection: "LONG",
  currentPrice: 64_435.4,
  triggerPrice: 63_834.4677,
  distanceToTriggerAbs: 600.9323,
  distanceToTriggerPct: 0.9326,
  bestRR: 6.208,
  rrThreshold: 1.2,
  rrReady: true,
  touchStatus: "NO_TOUCH_YET",
  confirmationStatus: "NOT_EVALUATED",
  d8Statuses: {
    d8_0: "WAITING_PULLBACK",
    d8_1: "WAITING_PULLBACK",
    d8_2: "WAITING_FOR_TRIGGER_PRICE",
    d8_3: "NO_TOUCH_YET",
    d8_4: "TOUCH_WINDOW_INACTIVE",
  },
  triggerDistanceClass: "FAR",
  continuationEvidence: {
    status: "STRONG_ALIGNED",
    timeframesUsed: ["5M"],
    reasons: ["5M ADX/DI/momentum support LONG"],
  },
  nextAlgorithmBranch: "DESIGN_CONTINUATION_REVIEW_BRANCH",
  nextAction: "design a separate review-only continuation branch",
  doNotDo: ["do not create a candidate"],
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
},
```

Assert full mapping and compact summary. In the safe-default test assert `NO_CONTEXT`, null numbers, empty arrays, branch `NO_ACTION`, and forced safety.

- [ ] **Step 2: Run adapter tests and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because the D8.4.1 VM fields are absent.

- [ ] **Step 3: Add full and compact VM interfaces**

Add `NoReviewCandidateBottleneckResolverVM` matching the full helper output, using defensive strings for externally mapped unions and nullable numbers.

Add to `PaperVM`:

```ts
noReviewCandidateBottleneckResolver: NoReviewCandidateBottleneckResolverVM;
```

Add to `OperatorSummaryVM`:

```ts
candidateBottleneck: {
  status: string;
  primaryBlocker: string;
  distanceToTriggerAbs: number | null;
  distanceToTriggerPct: number | null;
  triggerDistanceClass: string;
  nextAlgorithmBranch: string;
  nextAction: string;
};
```

- [ ] **Step 4: Add defensive adapter mapping**

Create `mapNoReviewCandidateBottleneckResolver`. Missing input defaults to:

```ts
{
  schemaVersion: 1,
  source: "NO_REVIEW_CANDIDATE_BOTTLENECK_RESOLVER_V1",
  readiness: "REVIEW_NOT_ACTIVATION",
  status: "NO_CONTEXT",
  primaryBlocker: "MISSING_CONTEXT",
  contributingBlockers: [],
  alignedDirection: "UNKNOWN",
  currentPrice: null,
  triggerPrice: null,
  distanceToTriggerAbs: null,
  distanceToTriggerPct: null,
  bestRR: null,
  rrThreshold: null,
  rrReady: false,
  touchStatus: "UNKNOWN",
  confirmationStatus: "UNKNOWN",
  d8Statuses: { d8_0: "UNKNOWN", d8_1: "UNKNOWN", d8_2: "UNKNOWN", d8_3: "UNKNOWN", d8_4: "UNKNOWN" },
  triggerDistanceClass: "UNKNOWN",
  continuationEvidence: { status: "INSUFFICIENT", timeframesUsed: [], reasons: [] },
  nextAlgorithmBranch: "NO_ACTION",
  nextAction: "wait for consistent D8.0-D8.4 diagnostic context",
  doNotDo: [
    "do not move the trigger or create a candidate",
    "do not activate paper or live behavior",
  ],
  activationAllowed: false,
  paperActivationAllowed: false,
  liveActivationAllowed: false,
  reviewOnly: true,
  shadowOnly: true,
}
```

Force safety literals instead of trusting raw payload values. Project `candidateBottleneck` from the same raw object in `buildOperatorSummaryFromRaw`.

- [ ] **Step 5: Add mock-state defaults**

Add the complete full default and compact summary default. Do not add controls or operational state.

- [ ] **Step 6: Run adapter tests and TypeScript**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
```

Expected: both commands pass.

### Task 5: Existing Entry Candidate Section UI

**Files:**
- Modify: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx:49-190`

- [ ] **Step 1: Read only the compact summary for visible rows**

Add:

```ts
const bottleneck = paper.operatorSummary.candidateBottleneck;
const bottleneckRaw = paper.noReviewCandidateBottleneckResolver;
```

- [ ] **Step 2: Add compact rows inside the existing Pullback & Confirmation section**

Add only:

```tsx
<Row label="Primary blocker" value={bottleneck.primaryBlocker} />
<Row
  label="Distance to trigger"
  value={`${fmt(bottleneck.distanceToTriggerAbs)} / ${pct(bottleneck.distanceToTriggerPct)}`}
/>
<Row label="Next algorithm branch" value={bottleneck.nextAlgorithmBranch} />
```

Use `bottleneck.nextAction` before older fallback next-action strings. Do not add a card, button, click handler, or action control.

- [ ] **Step 3: Add collapsed diagnostic details**

Inside the existing `<details>`, display status, distance class, D8.0-D8.4 statuses, continuation-evidence reasons, contributing blockers, and `doNotDo`. Keep the section collapsed by default.

- [ ] **Step 4: Extend tone mapping without implying trade readiness**

Use warning styling for waiting/no-touch/branch-gap states, rose styling for safety/conflict/RR failure, and emerald only for `PROMOTABLE_REVIEW_EXISTS`. The label remains review-only.

- [ ] **Step 5: Run TypeScript**

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0.

### Task 6: Required Validation and Served Smoke

**Files:**
- No new files.

- [ ] **Step 1: Run all focused tests from `dashboard`**

```powershell
node --test --experimental-strip-types lib/trend/noReviewCandidateBottleneckResolver.test.ts
node --test --experimental-strip-types lib/trend/touchAwareConfirmationReview.test.ts
node --test --experimental-strip-types lib/trend/pullbackZoneTouchEvidence.test.ts
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: all commands pass with zero failed tests.

- [ ] **Step 2: Run the full typecheck**

```powershell
npx tsc --noEmit --incremental false
```

Expected: exit code 0.

- [ ] **Step 3: Run a complete production build**

```powershell
npm run build
```

Expected: Next.js reports compile, TypeScript, page generation, and finalization success. Partial compilation or timeout is not a pass.

- [ ] **Step 4: Start only the latest build on a free port**

```powershell
npm run start -- -p 3025
```

Open `http://127.0.0.1:3025/agent-hq` and verify:

- Primary blocker is visible in the existing Entry Candidate section.
- Current runtime shows `PRICE_ABOVE_LONG_TRIGGER` when the supplied runtime matches the spec.
- Distance class is FAR near 0.9326%.
- RR remains ready.
- Strong aligned MTF evidence produces `STRATEGY_BRANCH_GAP`; insufficient evidence produces replay review.
- No new card, button, activation control, or trading affordance appears.
- Raw details remain collapsed.

If authentication redirects to login, report `visual smoke not completed`. Do not claim a visual pass.

### Task 7: Safety Audit, Explicit Stage, Commit, and Push

**Files:**
- Audit and stage only the D8.4.1 implementation files listed below.

- [ ] **Step 1: Inspect final scope**

```powershell
git status --short
git diff --stat
git diff --name-only
git diff --check
```

Confirm no D8.0-D8.4 helper, D8.5 implementation, route, runtime data, environment, secret, configuration, or unrelated dirty file was changed.

- [ ] **Step 2: Run changed-line safety grep**

On changed code lines only, reject:

```text
activationAllowed: true
paperActivationAllowed: true
liveActivationAllowed: true
placeOrder
cancelOrder
createOrder
exchangeOrder
ENABLE_ORDER_PLACEMENT
LIVE_TRADING_ENABLED
EXCHANGE_MANUAL_APPROVAL
writeFile
appendFile
process.env
fetch
```

Fields explicitly forced false and documentation stating prohibitions are allowed.

- [ ] **Step 3: Audit forbidden paths**

Reject staged paths containing API/internal routes, runner, broker, execution, order, live, runtime JSON/JSONL, `.env`, secrets, configuration, or `config/db.php`.

- [ ] **Step 4: Stage explicit D8.4.1 files only**

```powershell
git add -- `
  dashboard/lib/trend/noReviewCandidateBottleneckResolver.ts `
  dashboard/lib/trend/noReviewCandidateBottleneckResolver.test.ts `
  dashboard/lib/paper/paperLoopDiagnostics.ts `
  dashboard/lib/paper/paperLoopDiagnostics.test.ts `
  dashboard/lib/trading-agent-hq/viewModel.ts `
  dashboard/lib/trading-agent-hq/adapter.ts `
  dashboard/lib/trading-agent-hq/adapter.test.ts `
  dashboard/lib/trading-agent-hq/mockState.ts `
  dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx `
  docs/superpowers/specs/2026-06-21-d8-4-1-no-review-candidate-bottleneck-resolver-design.md `
  docs/superpowers/plans/2026-06-21-d8-4-1-no-review-candidate-bottleneck-resolver.md
```

Never use `git add .`.

- [ ] **Step 5: Verify the index exactly**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

Expected: exactly the eleven listed D8.4.1 files and no others.

- [ ] **Step 6: Commit only after all gates pass**

```powershell
git commit -m "feat(trend): add no-review-candidate bottleneck resolver"
```

- [ ] **Step 7: Push normally to main and verify sync**

```powershell
git push origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected: push succeeds and the final count is `0 0`. Never force-push.

## Completion Report

Report in Thai:

1. files changed;
2. RED/GREEN evidence;
3. status precedence and current blocker result;
4. current runtime branch recommendation;
5. paper diagnostics and Agent HQ mapping;
6. tests, typecheck, build, and served smoke;
7. safety grep and forbidden-path audit;
8. confirmation that D8.0-D8.4 behavior and D8.5 remain unchanged;
9. commit hash;
10. push status.
