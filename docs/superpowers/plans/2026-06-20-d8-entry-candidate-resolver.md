# D8.0 Entry Candidate Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, review-only entry candidate resolver that explains aligned setup geometry, RR repair options, and counter-regime rejection without changing trading behavior.

**Architecture:** A new pure helper consumes existing canonical regime, trend strategy, current-price audit, exact subset, watchlist, and 5M indicator evidence. `paperLoopDiagnostics` builds the resolver after all upstream diagnostics, the Agent HQ adapter maps an additive VM contract, and a compact card renders the summary with raw scenarios collapsed.

**Tech Stack:** TypeScript, Node `node:test`, Next.js/React, existing Agent HQ adapter/view-model pattern.

---

## File Structure

- Create `dashboard/lib/trend/entryCandidateResolver.ts`: pure resolver, RR scenario builder, location/status classification, safety literals.
- Create `dashboard/lib/trend/entryCandidateResolver.test.ts`: unit tests for direction, RR math, scenarios, status precedence, safety, and immutability.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.ts`: additive resolver type/import, build call, and output field.
- Modify `dashboard/lib/paper/paperLoopDiagnostics.test.ts`: integration assertion that canonical diagnostics reach the resolver.
- Modify `dashboard/lib/trading-agent-hq/viewModel.ts`: additive resolver VM types and `PaperVM.entryCandidateResolution`.
- Modify `dashboard/lib/trading-agent-hq/adapter.ts`: defensive mapping for resolver summaries and raw scenarios.
- Modify `dashboard/lib/trading-agent-hq/adapter.test.ts`: adapter contract and false safety flags.
- Create `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`: compact read-only summary with collapsed raw details.
- Modify `dashboard/components/trading-agent-hq/TradingAgentHQPage.tsx`: render the card directly after Operator Summary.
- Keep `docs/D8_0_ENTRY_CANDIDATE_RESOLVER_AND_RR_REPAIR.md`: approved design source of truth.

The pre-existing dirty `TopHud.tsx`, Trading Cafe files, M0Z6 documentation, runtime artifacts, and all unrelated untracked files are excluded.

### Task 1: Pure Resolver RED Tests

**Files:**
- Create: `dashboard/lib/trend/entryCandidateResolver.test.ts`

- [ ] **Step 1: Define test fixtures and the expected public API**

Use fixtures shaped like the existing diagnostics, without constructing operational objects:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveEntryCandidate } from "./entryCandidateResolver.ts";

function bullishInput(overrides: Record<string, unknown> = {}) {
  return {
    canonicalMarketRegime: { regime: "UPTREND", direction: "BULLISH", confidence: 82 },
    trendStrategy: {
      status: "RISK_REJECTED",
      direction: "LONG",
      entryZone: [99, 101],
      currentPrice: 105,
      invalidation: 97,
      target1: 103,
      target2: null,
      rewardRisk: 1,
      confirmationRequired: true,
      confirmationStatus: "WAITING_5M_CONFIRM",
      riskStatus: "NO_TRADE_BAD_RR",
    },
    currentPriceConsistencyAudit: {
      canonicalCurrentPrice: { value: 105, freshnessStatus: "FRESH" },
    },
    currentPriceEligibleExactSubset: { topCandidates: [] },
    regimeAwareExactCandidateWatchlist: { topWatchCandidates: [] },
    multiTimeframeIndicatorEvidence: {},
    ...overrides,
  };
}
```

- [ ] **Step 2: Add direction, price-location, counter-regime, and safety tests**

```ts
test("bullish setup waits for LONG pullback and rejects near-price SHORT", () => {
  const result = resolveEntryCandidate(bullishInput({
    regimeAwareExactCandidateWatchlist: {
      topWatchCandidates: [{
        id: "short-near",
        direction: "SHORT",
        directionAlignment: "COUNTER_REGIME",
        actionability: "COUNTER_REGIME_REJECTED",
        qualityStatus: "TARGET_TOO_CLOSE",
        currentPriceStatus: "NEAR_ENTRY",
        entry: 105,
        stopLoss: 106,
        target1: 104.5,
        blockers: ["REGIME_DIRECTION_CONFLICT", "TARGET_TOO_CLOSE"],
      }],
    },
  }));

  assert.equal(result.alignedDirection, "LONG");
  assert.equal(result.priceLocation, "ABOVE_LONG_ZONE");
  assert.equal(result.status, "WAITING_PULLBACK");
  assert.equal(result.rejectedOppositeCandidates[0]?.doNotUseAsEntry, true);
  assert.deepEqual(result.rejectedOppositeCandidates[0]?.blockers, [
    "REGIME_DIRECTION_CONFLICT",
    "TARGET_TOO_CLOSE",
  ]);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.paperActivationAllowed, false);
  assert.equal(result.liveActivationAllowed, false);
});
```

- [ ] **Step 3: Add LONG RR and zone comparison tests**

Assert exact calculations for `ZONE_LOW_ENTRY`, `ZONE_MID_ENTRY`, and `ZONE_HIGH_ENTRY` using LONG geometry `zone=[99,101]`, `stop=97`, `target=105`:

```ts
assert.equal(byName.ZONE_LOW_ENTRY.rr, 3);
assert.equal(byName.ZONE_MID_ENTRY.rr, 5 / 3);
assert.equal(byName.ZONE_HIGH_ENTRY.rr, 1);
assert.equal(result.rrThreshold, 1.2);
assert.equal(result.rrThresholdSource, "trendStrategy.DEFAULT_MIN_RR");
```

- [ ] **Step 4: Add bearish mirror and status precedence tests**

Use `DOWNTREND/BEARISH`, `direction=SHORT`, `zone=[99,101]`, `stop=103`, `target1=95` and verify SHORT RR uses `(entry-target)/(stop-entry)`. Add separate tests proving:

```ts
assert.equal(outsideWithPassingRr.status, "WAITING_PULLBACK");
assert.equal(insideCleanWithPassingRr.status, "CLEAN_REVIEW_CANDIDATE");
assert.equal(insideCleanWithPassingRr.reviewOnly, true);
assert.equal(insideCleanWithPassingRr.shadowOnly, true);
```

The clean fixture must contain an aligned watch candidate with `clean=true`, `directionAlignment="ALIGNED"`, and `qualityStatus="CLEAN"`.

- [ ] **Step 5: Add repair availability and immutability tests**

Verify:

```ts
assert.equal(noTarget2.rrScenarios.find((item) => item.name === "EXTENDED_TARGET_ENTRY")?.available, false);
assert.equal(freshAtr.rrScenarios.find((item) => item.name === "TIGHT_STOP_ENTRY")?.stopLoss, 97);
assert.equal(staleAtr.rrScenarios.find((item) => item.name === "TIGHT_STOP_ENTRY")?.available, false);
assert.deepEqual(input, structuredClone(input));
```

For the fresh ATR fixture, use `5M.atr=2` and `5M.freshness.ageMs=60_000`. For stale ATR, use `ageMs=901_000`, which exceeds the 5M 15-minute freshness limit.

- [ ] **Step 6: Run the focused test and verify RED**

Run from `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
```

Expected: FAIL because `entryCandidateResolver.ts` does not exist. This is the required RED evidence.

### Task 2: Pure Resolver GREEN Implementation

**Files:**
- Create: `dashboard/lib/trend/entryCandidateResolver.ts`
- Test: `dashboard/lib/trend/entryCandidateResolver.test.ts`

- [ ] **Step 1: Define literal contracts and constants**

Define exported types from the approved spec, including:

```ts
export const ENTRY_RR_THRESHOLD = 1.2;
export const ENTRY_RR_THRESHOLD_SOURCE = "trendStrategy.DEFAULT_MIN_RR" as const;
const NEAR_ZONE_TOLERANCE_PCT = 0.25;
const FIVE_MINUTE_FRESH_MS = 15 * 60 * 1000;

export type EntryRrScenarioName =
  | "ZONE_LOW_ENTRY"
  | "ZONE_MID_ENTRY"
  | "ZONE_HIGH_ENTRY"
  | "CONFIRMATION_ENTRY"
  | "TIGHT_STOP_ENTRY"
  | "EXTENDED_TARGET_ENTRY";
```

`EntryRrScenario` must include `name`, `available`, `direction`, `entry`, `stopLoss`, `target`, `riskDistance`, `rewardDistance`, `rr`, `meetsThreshold`, `sources`, and `notes`.

- [ ] **Step 2: Implement defensive readers and RR math**

Use local `obj`, `arr`, `finite`, `str`, and `unique` helpers. Calculate RR only when all geometry is finite and directionally valid:

```ts
function calculateRr(direction, entry, stopLoss, target) {
  if (![entry, stopLoss, target].every(finite)) return null;
  const risk = direction === "LONG" ? entry - stopLoss : stopLoss - entry;
  const reward = direction === "LONG" ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) return null;
  return { riskDistance: risk, rewardDistance: reward, rr: reward / risk };
}
```

- [ ] **Step 3: Implement aligned direction and price location**

Resolve `BULLISH/UPTREND` to LONG and `BEARISH/DOWNTREND` to SHORT. Normalize zone endpoints. Use the canonical current price from `currentPriceConsistencyAudit.canonicalCurrentPrice.value`, then trend strategy current price as fallback. Classify inside, near within 0.25%, above, below, no-zone, or unknown.

- [ ] **Step 4: Build six immutable scenarios**

Always return all six names. Zone scenarios use low/mid/high, invalidation, and target1. Confirmation scenario uses explicit confirmed current price only. Tight-stop uses fresh finite 5M ATR and:

```ts
const tightStop = direction === "LONG" ? zoneLow - atr : zoneHigh + atr;
```

Extended target uses `trendStrategy.target2` only. Missing evidence creates an unavailable scenario with null geometry and an explanatory note.

- [ ] **Step 5: Quarantine opposite candidates and resolve status**

Copy opposite watch candidates into `rejectedOppositeCandidates`; never mutate source arrays. Prefix `REGIME_DIRECTION_CONFLICT`, preserve quality blockers, and set `doNotUseAsEntry=true`.

Implement approved precedence in one classifier: unknown/no aligned setup, counter-only, waiting pullback, clean base pass, repaired pass, repair evidence missing, evaluated but bad RR.

- [ ] **Step 6: Run resolver tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
```

Expected: PASS with no warnings.

- [ ] **Step 7: Refactor only after GREEN**

Remove duplicated scenario construction through one `scenario(...)` helper, keep public names unchanged, then rerun the focused test and expect PASS.

### Task 3: Paper Diagnostics Wiring with TDD

**Files:**
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- Modify: `dashboard/lib/paper/paperLoopDiagnostics.ts`

- [ ] **Step 1: Add a failing integration assertion**

Extend the existing canonical-current-price runtime test with:

```ts
assert.equal(d.entryCandidateResolution.alignedDirection, "UNKNOWN");
assert.equal(d.entryCandidateResolution.status, "NO_ALIGNED_SETUP");
assert.equal(d.entryCandidateResolution.activationAllowed, false);
assert.equal(d.entryCandidateResolution.paperActivationAllowed, false);
assert.equal(d.entryCandidateResolution.liveActivationAllowed, false);
```

Add one trend fixture proving the resolver receives `trendStrategy`, canonical current price, watchlist, and 5M evidence.

- [ ] **Step 2: Run paper diagnostics test and verify RED**

```powershell
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: FAIL because `entryCandidateResolution` is absent.

- [ ] **Step 3: Add the resolver after watchlist construction**

Import `resolveEntryCandidate` and `EntryCandidateResolution`, add the interface field, then build:

```ts
const entryCandidateResolution = resolveEntryCandidate({
  canonicalMarketRegime: context.canonicalMarketRegime ?? null,
  trendStrategy,
  currentPriceConsistencyAudit,
  currentPriceEligibleExactSubset,
  regimeAwareExactCandidateWatchlist,
  mtfEntryCandidatePipeline,
  mtfExactZoneFailureAttribution,
  multiTimeframeIndicatorEvidence: context.multiTimeframeIndicatorEvidence ?? null,
});
```

Return it next to the existing D7 diagnostics. Do not route it into any strategy or operational consumer.

- [ ] **Step 4: Run resolver and paper tests and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
```

Expected: both PASS.

### Task 4: Agent HQ Adapter Contract with TDD

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts`
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts`

- [ ] **Step 1: Add failing adapter fixture and assertions**

Add `entryCandidateResolution` to the existing raw `paperLoopDiagnostics` fixture and assert:

```ts
assert.equal(vm.paper.entryCandidateResolution.entryResolutionStatus, "WAITING_PULLBACK");
assert.equal(vm.paper.entryCandidateResolution.alignedDirection, "LONG");
assert.equal(vm.paper.entryCandidateResolution.rrBest, 1.67);
assert.equal(vm.paper.entryCandidateResolution.rrThreshold, 1.2);
assert.equal(vm.paper.entryCandidateResolution.priceLocation, "ABOVE_LONG_ZONE");
assert.equal(vm.paper.entryCandidateResolution.rejectedOppositeCount, 1);
assert.equal(vm.paper.entryCandidateResolution.detailsCollapsedByDefault, true);
assert.equal(vm.paper.entryCandidateResolution.activationAllowed, false);
```

- [ ] **Step 2: Run adapter test and verify RED**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: FAIL because the VM field and mapper are absent.

- [ ] **Step 3: Add VM types and defensive mapper**

Add `EntryCandidateResolutionVM` with compact fields, safety fields, `rrScenarios`, `blockers`, and rejected candidates. Add `PaperVM.entryCandidateResolution`.

Implement `mapEntryCandidateResolution(raw)` using existing `obj`, `arr`, `str`, `numOrNull`, `bool`, and `strArray` helpers. Derive:

```ts
entryResolutionStatus: str(raw.status, "NO_ALIGNED_SETUP")
rrBest: numOrNull(obj(raw.bestReviewCandidate).rr)
rejectedOppositeCount: arr(raw.rejectedOppositeCandidates).length
detailsCollapsedByDefault: true
```

Map safety fields as false by default; do not infer any positive permission.

- [ ] **Step 4: Run adapter test and verify GREEN**

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: PASS.

### Task 5: Compact Read-Only UI

**Files:**
- Create: `dashboard/components/trading-agent-hq/EntryCandidateResolutionCard.tsx`
- Modify: `dashboard/components/trading-agent-hq/TradingAgentHQPage.tsx`

- [ ] **Step 1: Implement the compact card from mapped data only**

Render status, aligned direction, price location, best RR/threshold, opposite rejection count, and next action. Keep safety labels visible:

```tsx
<span>review-only</span>
<span>no activation</span>
<span>no order</span>
```

Use native collapsed details for audit data:

```tsx
<details>
  <summary>Raw RR scenarios</summary>
  {resolution.rrScenarios.map((scenario) => (
    <div key={scenario.name}>{scenario.name}: {scenario.available ? scenario.rr ?? "N/A" : "unavailable"}</div>
  ))}
</details>
```

No button, toggle, approval control, network call, or action callback is allowed.

- [ ] **Step 2: Place the card after Operator Summary**

Import `EntryCandidateResolutionCard` in `TradingAgentHQPage.tsx` and render it immediately after:

```tsx
<OperatorSummaryRailCard paper={vm.paper} />
<EntryCandidateResolutionCard paper={vm.paper} />
```

- [ ] **Step 3: Run typecheck as the UI compile gate**

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS with exit code 0.

### Task 6: Full Required Validation

**Files:**
- Test only; no edits unless a new failure is reproduced first.

- [ ] **Step 1: Run every required focused test**

From `dashboard`:

```powershell
node --test --experimental-strip-types lib/trend/entryCandidateResolver.test.ts
node --test --experimental-strip-types lib/trend/regimeAwareExactCandidateWatchlist.test.ts
node --test --experimental-strip-types lib/trend/currentPriceEligibleExactSubset.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck**

```powershell
npx tsc --noEmit --incremental false
```

Expected: PASS.

- [ ] **Step 3: Run a complete production build**

```powershell
npm run build
```

Expected: complete success, not partial compilation or timeout.

- [ ] **Step 4: Run served smoke from the successful build when possible**

Start an unused port such as 3023:

```powershell
npm run start -- -p 3023
```

Inspect `http://127.0.0.1:3023/agent-hq` and verify the compact card appears after Operator Summary, raw scenarios start collapsed, and no activation/order controls appear. If browser automation is unavailable, report `visual smoke not completed` without claiming a pass.

### Task 7: Safety Audit, Explicit Stage, Commit, and Push

**Files:**
- All D8.0 files listed in File Structure only.

- [ ] **Step 1: Audit changed scope**

```powershell
git status --short
git diff --stat
git diff --name-only
```

Exclude every pre-existing or unrelated file.

- [ ] **Step 2: Run changed-file safety grep**

Search only D8.0 changed files for forbidden terms: activation flags set true, order methods, runner, broker, execution, env access, file writes, network fetches, and runtime JSON/JSONL paths. Literal false safety fields and documentation describing prohibitions are allowed and must be manually classified.

- [ ] **Step 3: Check forbidden files explicitly**

Confirm no staged path matches `.env`, `*.env`, `secrets`, `config/db.php`, runtime JSON/JSONL, runner, broker, execution, order, or live paths.

- [ ] **Step 4: Stage explicit D8.0 files only**

Use one explicit `git add` command listing actual changed D8.0 files. Never use `git add .`.

- [ ] **Step 5: Verify the staged set**

```powershell
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
```

Expected: only reviewed D8.0 files, no whitespace errors.

- [ ] **Step 6: Commit once after all gates pass**

The user requires one final commit rather than intermediate commits:

```powershell
git commit -m "feat(trend): add entry candidate resolver diagnostics"
```

- [ ] **Step 7: Push main without force**

```powershell
git push origin main
```

Report the commit hash, pushed branch, validation results, safety grep, forbidden-file check, and visual smoke status honestly.
