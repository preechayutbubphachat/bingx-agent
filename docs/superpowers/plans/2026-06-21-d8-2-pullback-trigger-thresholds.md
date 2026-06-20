# D8.2 Pullback Trigger Thresholds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direction-aware pullback trigger thresholds and review-candidate promotion diagnostics derived exclusively from D8.1.

**Architecture:** A new pure helper projects the D8.1 gate into trigger geometry, remaining distance, location state, and conservative promotion blockers. Paper diagnostics expose the result additively, Agent HQ maps a safe VM and compact summary, and the existing Entry Candidate Resolution card gains compact trigger rows with raw details collapsed.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing paper diagnostics and Agent HQ adapter patterns.

---

## File Structure

- Create `dashboard/lib/trend/pullbackTriggerThresholds.ts`: pure trigger and promotion contract.
- Create `dashboard/lib/trend/pullbackTriggerThresholds.test.ts`: geometry, status, promotion, safety, and immutability tests.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: build and expose the additive D8.2 field.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: integration contract assertions.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: full D8.2 VM and compact summary type.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive mapper and Operator Summary mapping.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: mapping/default/safety assertions.
- Modify `dashboard/lib/trading-agent-hq/mockState.ts`: complete static D8.2 fixture.
- Modify `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact trigger rows and collapsed raw detail.
- Create `docs/superpowers/specs/2026-06-21-d8-2-pullback-trigger-thresholds-design.md`: approved design.
- Create `docs/superpowers/plans/2026-06-21-d8-2-pullback-trigger-thresholds.md`: this plan.

Pre-existing dirty Trading Cafe, `TopHud.tsx`, M0Z6, runtime, environment, and unrelated files remain excluded.

### Task 1: Pure Helper RED Tests

**Files:**
- Create: `dashboard/lib/trend/pullbackTriggerThresholds.test.ts`

- [ ] **Step 1: Add the wished-for API and a D8.1 gate fixture**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePullbackTriggerThresholds } from "./pullbackTriggerThresholds.ts";

function gate(overrides: Record<string, unknown> = {}) {
  return {
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    currentPrice: 105,
    zone: [99, 101],
    zoneTolerance: 0.5,
    bestRR: 1.8,
    rrThreshold: 1.2,
    rrStatus: "PASS",
    confirmationStatus: "NOT_EVALUATED_OUTSIDE_ZONE",
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}
```

- [ ] **Step 2: Add LONG boundary/status tests**

Assert that price `102` with zone `[99,101]` and tolerance `0.5` is `WAITING_FOR_TRIGGER_PRICE`, price `101.25` is `INSIDE_EXPANDED_ZONE`, price `100` is `INSIDE_RAW_ZONE`, and price `98.25` is `BEYOND_ZONE_INVALIDATION_RISK`. Assert exact trigger/raw trigger/expanded boundaries and inclusive behavior at `101.5`, `101`, `99`, and `98.5`.

- [ ] **Step 3: Add SHORT mirror tests**

Use SHORT with zone `[99,101]`, tolerance `0.5`: price `98` waits, `98.75` is expanded, `100` is raw, and `101.75` is invalidation risk. Assert trigger `98.5`, raw trigger `99`, and inclusive boundaries.

- [ ] **Step 4: Add distance and supplied-runtime tests**

For the supplied runtime assert:

```ts
assert.equal(result.status, "WAITING_FOR_TRIGGER_PRICE");
assert.equal(result.triggerPrice, 63795.4228);
assert.equal(result.rawZoneTriggerPrice, 63763.5);
assert.ok(Math.abs((result.distanceToTriggerAbs ?? 0) - 50.1772) < 1e-9);
assert.ok(Math.abs((result.distanceToTriggerPct ?? 0) - 0.078591) < 1e-5);
assert.equal(result.rrReady, true);
assert.equal(result.confirmationRequired, true);
```

Assert distance becomes zero after the directional trigger is reached.

- [ ] **Step 5: Add promotion precedence/blocker tests**

Verify RR pass outside the zone remains waiting and includes `PRICE_NOT_AT_TRIGGER`. Inside-zone `NOT_EVALUATED_OUTSIDE_ZONE` includes `CONFIRMATION_NOT_EVALUATED`; conflicting/pending confirmation includes `CONFIRMATION_NOT_ALIGNED`; RR fail includes `RR_NOT_READY`.

For LONG with `CONFIRMED_BULLISH` and SHORT with `CONFIRMED_BEARISH`, inside raw/expanded zone and RR pass, expect `READY_FOR_CONFIRMATION_REVIEW` with no blockers. Opposite confirmation must not promote.

- [ ] **Step 6: Add invalid source, safety, no-candidate-input, and mutation tests**

Assert missing/invalid D8.1 fields return `NO_GATE`. Set each source activation flag true separately and expect blocker `SOURCE_SAFETY_FLAGS_INVALID` with output flags still false. Assert the public input type has only `resolverDrivenPullbackGate`, deep-clone the fixture before evaluation, and verify exact equality afterward.

- [ ] **Step 7: Run the focused test and verify RED**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
```

Expected: FAIL because `pullbackTriggerThresholds.ts` does not exist.

### Task 2: Pure Helper GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/pullbackTriggerThresholds.ts`
- Test: `dashboard/lib/trend/pullbackTriggerThresholds.test.ts`

- [ ] **Step 1: Define literal contracts and safe base output**

Define the six statuses and exact output from the approved design. `PullbackTriggerThresholdsInput` contains only:

```ts
interface PullbackTriggerThresholdsInput {
  resolverDrivenPullbackGate?: unknown;
}
```

The base output forces activation flags false and review/shadow flags true.

- [ ] **Step 2: Implement defensive D8.1 validation**

Read direction, price, zone, tolerance, RR fields, confirmation, and source safety only from `resolverDrivenPullbackGate`. Normalize the zone, reject non-finite/non-positive geometry and negative tolerance, and return `NO_GATE` without fallback sources.

- [ ] **Step 3: Implement direction-aware geometry and remaining distance**

Calculate expanded boundaries once. Use expanded high as LONG trigger and expanded low as SHORT trigger. Use:

```ts
const distance = direction === "LONG"
  ? Math.max(0, currentPrice - triggerPrice)
  : Math.max(0, triggerPrice - currentPrice);
const distancePct = distance / currentPrice * 100;
```

- [ ] **Step 4: Implement location classification**

Apply the approved LONG/SHORT boundary rules with invalidation before waiting, raw-zone membership before expanded-only membership, and inclusive boundaries.

- [ ] **Step 5: Implement RR/confirmation promotion and blockers**

Require D8.1 RR PASS plus finite consistent RR values. Require `CONFIRMED_BULLISH` for LONG or `CONFIRMED_BEARISH` for SHORT. Build additive blockers for location, RR, confirmation, and invalid source safety. Promote only eligible raw/expanded locations with no blockers.

- [ ] **Step 6: Implement deterministic next actions**

Waiting actions include the direction-aware trigger formatted to two decimals. Invalidation asks for resolver re-evaluation. Inside states identify remaining RR/confirmation blockers. Ready state says human review only and explicitly denies activation/order interpretation.

- [ ] **Step 7: Run focused tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
```

Expected: all tests PASS.

### Task 3: Paper Diagnostics Wiring with TDD

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts`

- [ ] **Step 1: Add failing integration assertions**

Extend the old/default payload assertions:

```ts
assert.equal(d.pullbackTriggerThresholds.source, "PULLBACK_TRIGGER_THRESHOLDS_V1");
assert.equal(d.pullbackTriggerThresholds.status, "NO_GATE");
assert.equal(d.pullbackTriggerThresholds.activationAllowed, false);
assert.equal(d.pullbackTriggerThresholds.paperActivationAllowed, false);
assert.equal(d.pullbackTriggerThresholds.liveActivationAllowed, false);
```

Add a valid context assertion proving it uses the already-built D8.1 output.

- [ ] **Step 2: Run paper diagnostics test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because the additive field is absent.

- [ ] **Step 3: Wire directly after D8.1 construction**

Import the helper/type, extend `PaperLoopDiagnostics`, then build:

```ts
const pullbackTriggerThresholds = evaluatePullbackTriggerThresholds({
  resolverDrivenPullbackGate,
});
```

Return it next to D8.1. Do not pass it into strategy or operational paths.

- [ ] **Step 4: Run helper and paper tests and verify GREEN**

Run both focused files and expect PASS.

### Task 4: Adapter and View Model Contract with TDD

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts`
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts`

- [ ] **Step 1: Add a failing adapter fixture and assertions**

Add a raw D8.2 payload and assert:

```ts
assert.equal(vm.paper.pullbackTriggerThresholds.status, "WAITING_FOR_TRIGGER_PRICE");
assert.equal(vm.paper.pullbackTriggerThresholds.triggerPrice, 63795.4228);
assert.equal(vm.paper.operatorSummary.pullbackTrigger.status, "WAITING_FOR_TRIGGER_PRICE");
assert.equal(vm.paper.operatorSummary.pullbackTrigger.rrReady, true);
assert.deepEqual(vm.paper.operatorSummary.pullbackTrigger.promotionBlockedBy, [
  "PRICE_NOT_AT_TRIGGER",
  "CONFIRMATION_NOT_EVALUATED",
]);
assert.equal(vm.paper.pullbackTriggerThresholds.activationAllowed, false);
```

- [ ] **Step 2: Run adapter test and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because VM and mapping fields are absent.

- [ ] **Step 3: Add full VM and compact Operator Summary type**

Add `PaperVM.pullbackTriggerThresholds` with the full safe contract. Add `OperatorSummaryVM.pullbackTrigger` with status, trigger prices, distance, RR readiness, blockers, and next action.

- [ ] **Step 4: Implement conservative mapping**

Map invalid numbers to null, arrays to strings only, booleans conservatively, and force mapped permission fields false. Missing D8.2 data defaults to `NO_GATE`, false readiness, null geometry, and safe next action.

- [ ] **Step 5: Complete mock state**

Add a `NO_GATE` full fixture and matching compact summary without fabricated price/RR values.

- [ ] **Step 6: Run adapter tests and typecheck**

Expect adapter PASS and no missing fixture/type errors.

### Task 5: Compact Existing-Card UI

**Files:**
- Modify: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`

- [ ] **Step 1: Extend the existing gate section**

Read `paper.operatorSummary.pullbackTrigger` and render compact rows for trigger price, raw trigger, remaining distance/percentage, RR ready, promotion blockers, and next action. Reuse the existing section and status badge; do not add a new card.

- [ ] **Step 2: Extend existing collapsed details**

Add full raw/expanded bounds and raw D8.2 blockers to the current `<details>` body. Keep it closed by default and preserve visible `review-only`, `no activation`, and `no order` labels.

- [ ] **Step 3: Run typecheck**

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS.

### Task 6: Required Validation and Served Smoke

**Files:**
- Verification only.

- [ ] **Step 1: Run all required focused tests**

```powershell
node --test --experimental-strip-types lib/trend/pullbackTriggerThresholds.test.ts
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: every command exits 0.

- [ ] **Step 2: Run typecheck and full production build**

```powershell
npx tsc --noEmit --incremental false
npm run build
```

Expected: both exit 0 and build reaches complete success after the latest UI patch.

- [ ] **Step 3: Run served smoke from that build**

Start `next start` on an unused port, inspect `/agent-hq`, and verify the compact trigger section, current trigger values when runtime matches, collapsed raw details, visible safety labels, and absence of action controls. Report honestly if visual smoke is unavailable.

### Task 7: Safety Audit, Explicit Stage, Commit, and Push

**Files:**
- Only D8.2 files listed above.

- [ ] **Step 1: Inspect status, diff stat, and changed names**

Confirm unrelated dirty/untracked files remain outside D8.2.

- [ ] **Step 2: Run changed-file safety grep**

Reject activation flags set true, order APIs, runner/broker/execution references in implementation, env access, file writes, fetches, runtime JSON/JSONL paths, secrets, or forbidden config changes. Classify documentation prohibition text manually.

- [ ] **Step 3: Stage explicit D8.2 files only**

Use one explicit `git add` list. Never use `git add .`.

- [ ] **Step 4: Verify cached scope and whitespace**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

- [ ] **Step 5: Commit only after every validation gate passes**

```powershell
git commit -m "feat(trend): add pullback trigger thresholds"
```

- [ ] **Step 6: Push main without force and verify sync**

```powershell
git push origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected final sync: `0 0`.
