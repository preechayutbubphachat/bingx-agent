# D8.1 Resolver-Driven Pullback Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure review-only pullback and confirmation state machine driven exclusively by D8.0 entry resolution and fresh 5M/15M indicator evidence.

**Architecture:** A new pure helper evaluates aligned-zone tolerance, RR readiness, and non-conflicting directional confirmation. Paper diagnostics build it after D8.0, Agent HQ maps it into a dedicated VM and nested Operator Summary summary, and the existing D8 card displays one compact gate section with details collapsed.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing paper diagnostics and Agent HQ adapter patterns.

---

## File Structure

- Create `dashboard/lib/trend/resolverDrivenPullbackGate.ts`: pure gate and public contracts.
- Create `dashboard/lib/trend/resolverDrivenPullbackGate.test.ts`: state, tolerance, confirmation, safety, and immutability tests.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: additive build and output field.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: integration contract test.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: gate VM and nested Operator Summary fields.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive gate mapper and compact summary mapping.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: mapping and safety tests.
- Modify `dashboard/lib/trading-agent-hq/mockState.ts`: complete static VM fixture.
- Modify `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact pullback/confirmation section and collapsed raw gate details.
- Keep `docs/superpowers/specs/2026-06-20-d8-1-resolver-driven-pullback-gate-design.md`: approved design.
- Create `docs/superpowers/plans/2026-06-20-d8-1-resolver-driven-pullback-gate.md`: this implementation plan.

All pre-existing dirty Trading Cafe, TopHud, M0Z6, runtime, environment, and unrelated files remain excluded.

### Task 1: Pure Gate RED Tests

**Files:**
- Create: `dashboard/lib/trend/resolverDrivenPullbackGate.test.ts`

- [ ] **Step 1: Add the wished-for API and fixtures**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateResolverDrivenPullbackGate } from "./resolverDrivenPullbackGate.ts";

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    status: "WAITING_PULLBACK",
    alignedDirection: "LONG",
    currentPrice: 105,
    alignedEntryZone: [99, 101],
    rrThreshold: 1.2,
    bestReviewCandidate: { rr: 1.8 },
    rejectedOppositeCandidates: [],
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    entryCandidateResolution: resolution(),
    multiTimeframeIndicatorEvidence: {},
    ...overrides,
  };
}
```

- [ ] **Step 2: Add pullback and RR precedence tests**

Assert:

```ts
assert.equal(outside.status, "WAITING_PULLBACK");
assert.equal(outside.rrStatus, "PASS");
assert.equal(outside.confirmationStatus, "NOT_EVALUATED_OUTSIDE_ZONE");
assert.equal(insideBadRr.status, "NO_TRADE_BAD_RR");
assert.equal(insideBadRr.rrStatus, "FAIL");
assert.equal(insideUnknownRr.status, "PRICE_IN_ALIGNED_ZONE");
```

- [ ] **Step 3: Add LONG and SHORT confirmation tests**

For LONG, use current price 100 and fresh 5M evidence with `plusDI=24`, `minusDI=14`, `macdHistogram=0.5`, and `emaSlope=1`. Expect `CONFIRMED_BULLISH` and `CLEAN_REVIEW_CANDIDATE`.

For SHORT, use `DOWNTREND`-aligned resolution, current price 100, `plusDI=12`, `minusDI=25`, negative MACD histogram, and negative EMA slope. Expect `CONFIRMED_BEARISH` and clean review.

- [ ] **Step 4: Add pending and conflict tests**

Verify:

```ts
assert.equal(noFreshEvidence.status, "RR_READY_WAITING_CONFIRMATION");
assert.equal(noFreshEvidence.confirmationStatus, "WAITING_FOR_FRESH_EVIDENCE");
assert.equal(neutralEvidence.status, "CONFIRMATION_PENDING");
assert.equal(conflictingTimeframes.confirmationStatus, "CONFLICTING_MOMENTUM");
```

The conflicting fixture uses bullish fresh 5M and bearish fresh 15M evidence.

- [ ] **Step 5: Add tolerance, counter-candidate isolation, safety, and mutation tests**

Use current price 100, zone `[99, 101]`, and fresh 15M ATR 2. Expect `zoneTolerance=0.2`. With stale ATR expect fallback `0.05`.

Add rejected opposite candidates to the D8.0 fixture and assert the gate output is unchanged. Deep-clone input before evaluation and assert equality afterward. Iterate representative branches and assert all activation flags are false, `reviewOnly=true`, and `shadowOnly=true`.

- [ ] **Step 6: Run the focused test and verify RED**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
```

Expected: FAIL because `resolverDrivenPullbackGate.ts` does not exist.

### Task 2: Pure Gate GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/resolverDrivenPullbackGate.ts`
- Test: `dashboard/lib/trend/resolverDrivenPullbackGate.test.ts`

- [ ] **Step 1: Define literal contracts and freshness constants**

Define the exact status, RR, confirmation, input, and output types from the approved spec. Use:

```ts
const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;
const FIFTEEN_MINUTE_FRESH_MS = 45 * 60 * 1000;
const PRICE_TOLERANCE_RATIO = 0.0005;
const ATR_TOLERANCE_RATIO = 0.10;
```

- [ ] **Step 2: Implement defensive resolution and tolerance readers**

Read only `entryCandidateResolution`. Normalize the aligned zone and reject missing/invalid direction, current price, zone, or D8.0 no-aligned statuses.

Calculate:

```ts
const priceFloor = currentPrice * PRICE_TOLERANCE_RATIO;
const zoneTolerance = fresh15mAtr == null
  ? priceFloor
  : Math.max(fresh15mAtr * ATR_TOLERANCE_RATIO, priceFloor);
```

- [ ] **Step 3: Implement raw-zone distance and expanded-zone membership**

Return distance zero inside the raw zone. Otherwise use the nearest raw edge divided by current price. Zone membership uses `[zoneLow-zoneTolerance, zoneHigh+zoneTolerance]` for both directions.

- [ ] **Step 4: Implement RR status from D8.0 only**

Read `bestReviewCandidate.rr` and `rrThreshold`. Return PASS, FAIL, or UNKNOWN without recalculating entry geometry.

- [ ] **Step 5: Implement fresh timeframe directional votes**

For each fresh 5M/15M record, derive DI, MACD histogram, and EMA slope votes. A timeframe supports one direction only when at least one vote supports it and no vote opposes it. Mixed evidence is neutral.

For LONG, any bearish-support timeframe conflicts; otherwise one bullish-support timeframe confirms. Mirror for SHORT. Do not evaluate confirmation outside the expanded zone.

- [ ] **Step 6: Implement status precedence and safe output**

Use the exact seven-step precedence from the design. Return stable blockers, next action, do-not-do messages, literal false permission flags, and literal true review/shadow flags.

- [ ] **Step 7: Run focused tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
```

Expected: all tests PASS.

### Task 3: Paper Diagnostics Wiring with TDD

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts`

- [ ] **Step 1: Add failing integration assertions**

Extend the old-payload defaults test:

```ts
assert.equal(d.resolverDrivenPullbackGate.source, "RESOLVER_DRIVEN_PULLBACK_GATE_V1");
assert.equal(d.resolverDrivenPullbackGate.status, "NO_ALIGNED_RESOLUTION");
assert.equal(d.resolverDrivenPullbackGate.activationAllowed, false);
assert.equal(d.resolverDrivenPullbackGate.paperActivationAllowed, false);
assert.equal(d.resolverDrivenPullbackGate.liveActivationAllowed, false);
```

- [ ] **Step 2: Run paper diagnostics test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because the additive field is absent.

- [ ] **Step 3: Wire after D8.0 resolver construction**

Import the helper/type, add `PaperLoopDiagnostics.resolverDrivenPullbackGate`, then build:

```ts
const resolverDrivenPullbackGate = evaluateResolverDrivenPullbackGate({
  entryCandidateResolution,
  multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
});
```

Return it next to `entryCandidateResolution`. Do not pass it to strategy or operational consumers.

- [ ] **Step 4: Run helper and paper tests and verify GREEN**

Run both focused files and expect PASS.

### Task 4: Adapter and View Model Contract with TDD

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts`
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts`

- [ ] **Step 1: Add a failing raw fixture and assertions**

Add a gate payload to the existing adapter fixture and assert:

```ts
assert.equal(vm.paper.resolverDrivenPullbackGate.status, "WAITING_PULLBACK");
assert.equal(vm.paper.resolverDrivenPullbackGate.bestRR, 1.8);
assert.equal(vm.paper.operatorSummary.pullbackGate.pullbackGateStatus, "WAITING_PULLBACK");
assert.equal(vm.paper.operatorSummary.pullbackGate.alignedDirection, "LONG");
assert.equal(vm.paper.operatorSummary.pullbackGate.confirmationStatus, "NOT_EVALUATED_OUTSIDE_ZONE");
assert.equal(vm.paper.resolverDrivenPullbackGate.activationAllowed, false);
```

- [ ] **Step 2: Run adapter test and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because the VM and mapper are absent.

- [ ] **Step 3: Add dedicated gate VM and nested Operator Summary type**

Add `PaperVM.resolverDrivenPullbackGate` with the full safe output. Add `OperatorSummaryVM.pullbackGate` with status, direction, distance, RR, threshold, confirmation, and next action.

- [ ] **Step 4: Implement defensive mapping**

Map null/unknown conservatively. Force permission fields false. In `buildOperatorSummaryFromRaw`, read the mapped-shaped raw gate fields into the nested compact object without overwriting the existing general `nextAction`.

- [ ] **Step 5: Complete static mock state**

Add a `NO_ALIGNED_RESOLUTION` gate and matching nested Operator Summary object with false safety flags and no fabricated RR.

- [ ] **Step 6: Run adapter test and typecheck**

Expect adapter PASS and no missing required field errors from `mockState.ts`.

### Task 5: Compact Existing-Card UI

**Files:**
- Modify: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`

- [ ] **Step 1: Add one compact gate section**

Read `paper.operatorSummary.pullbackGate` and render:

```tsx
<div>Pullback & Confirmation Gate</div>
<Row label="Gate status" value={gate.pullbackGateStatus} />
<Row label="Aligned / Distance" value={`${gate.alignedDirection} / ${fmt(gate.priceDistanceToZonePct)}%`} />
<Row label="Best RR / Threshold" value={`${fmt(gate.bestRR)} / ${fmt(gate.rrThreshold)}`} />
<Row label="Confirmation" value={gate.confirmationStatus} />
```

Show next action and preserve review-only/no activation/no order labels.

- [ ] **Step 2: Extend existing collapsed raw details**

Add gate blockers and do-not-do text inside the existing `<details>` element. Do not add a second card, button, callback, or action handler.

- [ ] **Step 3: Run typecheck**

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS.

### Task 6: Required Validation and Served Smoke

**Files:**
- Verification only.

- [ ] **Step 1: Run required focused tests**

```powershell
node --test --experimental-strip-types lib/trend/resolverDrivenPullbackGate.test.ts
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck and complete production build**

```powershell
npx tsc --noEmit --incremental false
npm run build
```

Expected: both exit 0 and build completes through page generation/finalization.

- [ ] **Step 3: Run served smoke from that successful build**

Start an unused port such as 3023, inspect `/agent-hq`, and verify the existing card shows the compact gate, raw details are closed, no action buttons exist, and safety labels remain visible. Report honestly if browser automation is unavailable.

### Task 7: Safety Audit, Explicit Stage, Commit, and Push

**Files:**
- Only D8.1 files listed above.

- [ ] **Step 1: Inspect status, diff stat, and names**

Confirm no unrelated dirty or untracked file enters scope.

- [ ] **Step 2: Run changed-line safety grep**

Reject activation flags set true, order APIs, runner/broker/execution references in added code, env access, file writes, fetches, or runtime JSON/JSONL paths. Documentation prohibition text is manually classified as allowed.

- [ ] **Step 3: Stage explicit files only**

Use one explicit `git add` list. Never use `git add .`.

- [ ] **Step 4: Verify cached names, stat, and whitespace**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

- [ ] **Step 5: Commit once after every gate passes**

```powershell
git commit -m "feat(trend): add resolver-driven pullback gate diagnostics"
```

- [ ] **Step 6: Push main without force and verify sync**

```powershell
git push origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected final sync: `0 0`.
