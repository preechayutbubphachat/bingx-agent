# D7.10-b Direction-Aware Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct compact candidate deduplication, eligible-versus-clean watchlist status, direction alignment, and Agent HQ operator wording without changing trading behavior.

**Architecture:** Keep candidate geometry accounting in `currentPriceEligibleExactSubset`, add canonical-direction classification in `regimeAwareExactCandidateWatchlist`, and map the resulting diagnostics plus the existing trend strategy into Agent HQ. Raw candidates remain untouched; compact and UI fields are additive read-only projections.

**Tech Stack:** TypeScript, Node test runner, React, Next.js 16.

---

### Task 1: Prove Compact Clustering Regression

**Files:**
- Modify: `dashboard/lib/trend/currentPriceEligibleExactSubset.test.ts`
- Modify: `dashboard/lib/trend/currentPriceEligibleExactSubset.ts`

- [ ] **Step 1: Add a failing four-candidate clustering test**

Add a test that supplies four SHORT candidates with entry `63472.0148`, target `62232.6`, `TARGET_TOO_CLOSE`, `NEAR_ENTRY`, and stops `64535.1086`, `64535.6843`, `64536.8271`, and `64538.56`. Assert:

```ts
assert.equal(result.topCandidates.length, 4);
assert.equal(result.compactTopCandidates.length, 1);
assert.equal(result.compactTopCandidates[0]?.occurrenceCount, 4);
assert.equal(result.compactTopCandidates[0]?.duplicateGroupSize, 4);
assert.equal(result.compactTopCandidates[0]?.representativeStopLoss, 64_535.1086);
assert.deepEqual(result.compactTopCandidates[0]?.stopLossRange, [64_535.1086, 64_538.56]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --experimental-strip-types lib/trend/currentPriceEligibleExactSubset.test.ts
```

Expected: the new test fails because the current 1 USDT stop tolerance produces more than one compact row.

- [ ] **Step 3: Implement full-set clustering with 5 USDT stop tolerance**

Change the compact tolerance to `5`, retain each group's first sorted index, aggregate all compatible candidates, sort groups by that retained index, and only then call `.slice(0, 3)`. Keep `topCandidates: sortedTopCandidates.slice(0, 10)` unchanged.

Core shape:

```ts
const COMPACT_STOP_TOLERANCE_USDT = 5;

function buildCompactTopCandidates(candidates: EligibleTopCandidate[]): EligibleTopCandidate[] {
  const groups: CompactGroup[] = [];
  candidates.forEach((candidate, rank) => {
    // match geometry key and a stop within 5 USDT, preserving the first rank
  });
  return groups
    .map(toCompactCandidate)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: all subset tests pass and the raw-list assertions remain unchanged.

### Task 2: Add Direction-Aware Watchlist Contract

**Files:**
- Modify: `dashboard/lib/trend/regimeAwareExactCandidateWatchlist.test.ts`
- Modify: `dashboard/lib/trend/regimeAwareExactCandidateWatchlist.ts`

- [ ] **Step 1: Add failing status and direction tests**

Add separate tests for:

```ts
// eligible but no clean
assert.equal(result.status, "CURRENT_PRICE_ELIGIBLE_DEGRADED");
assert.equal(result.verdict.status, "WATCH_ONLY");
assert.equal(result.watchlistSummary.cleanReviewCandidates, 0);

// BULLISH + SHORT
assert.equal(top.directionAlignment, "COUNTER_REGIME");
assert.equal(top.actionability, "COUNTER_REGIME_REJECTED");
assert.ok(top.blockers.includes("REGIME_DIRECTION_CONFLICT"));
assert.ok(top.blockers.includes("TARGET_TOO_CLOSE"));

// BEARISH + LONG
assert.equal(top.directionAlignment, "COUNTER_REGIME");

// aligned but poor quality
assert.equal(top.directionAlignment, "ALIGNED");
assert.equal(top.actionability, "ELIGIBLE_BUT_QUALITY_REJECTED");
assert.ok(top.blockers.includes("TARGET_TOO_CLOSE"));
```

Retain the existing no-mutation test and add safety assertions for every new branch.

- [ ] **Step 2: Run the watchlist test and verify RED**

Run:

```powershell
node --test --experimental-strip-types lib/trend/regimeAwareExactCandidateWatchlist.test.ts
```

Expected: failures for the missing `directionAlignment`, incorrect status, and old actionability values.

- [ ] **Step 3: Add types and alignment classifier**

Add:

```ts
export type CandidateDirectionAlignment =
  | "ALIGNED"
  | "COUNTER_REGIME"
  | "REGIME_NOT_CONFIRMED"
  | "UNKNOWN";

function evaluateCandidateDirectionAlignment(
  candidateDirection: "LONG" | "SHORT" | "UNKNOWN",
  canonicalDirection: string | null,
  regimeConfirmed: boolean,
): CandidateDirectionAlignment {
  if (candidateDirection === "UNKNOWN") return "UNKNOWN";
  if (!regimeConfirmed) return "REGIME_NOT_CONFIRMED";
  if (canonicalDirection === "BULLISH") return candidateDirection === "LONG" ? "ALIGNED" : "COUNTER_REGIME";
  if (canonicalDirection === "BEARISH") return candidateDirection === "SHORT" ? "ALIGNED" : "COUNTER_REGIME";
  return "REGIME_NOT_CONFIRMED";
}
```

Extend actionability with `COUNTER_REGIME_REJECTED`, `ELIGIBLE_BUT_DIRECTION_REJECTED`, `ELIGIBLE_BUT_QUALITY_REJECTED`, and `ELIGIBLE_BUT_DEGRADED`.

- [ ] **Step 4: Apply classification precedence and blockers**

Use this precedence: invalidated, missed, counter-regime, regime unconfirmed, waiting price, quality rejected, clean review, near-entry confirmation, no action. Add `REGIME_DIRECTION_CONFLICT` for counter-regime candidates without removing independent quality blockers.

- [ ] **Step 5: Correct eligible-versus-clean status**

Read `sampleAccounting.currentPriceEligibleExactSamples` separately from clean samples. Update `statusFor` so eligible greater than zero and clean equal to zero returns `CURRENT_PRICE_ELIGIBLE_DEGRADED`; preserve `NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES` only when eligible is zero.

- [ ] **Step 6: Run the watchlist tests and verify GREEN**

Expected: all direction, status, safety, dedup, and no-mutation tests pass.

### Task 3: Propagate Direction Semantics Through Agent HQ

**Files:**
- Modify: `dashboard/lib/trading-agent-hq/viewModel.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.ts`
- Modify: `dashboard/lib/trading-agent-hq/mockState.ts`
- Modify: `dashboard/lib/trading-agent-hq/adapter.test.ts`
- Modify: `dashboard/components/trading-agent-hq/OperatorSummaryRailCard.tsx`

- [ ] **Step 1: Add failing adapter assertions**

Create a runtime-like fixture with UPTREND/BULLISH, LONG trend strategy, pullback zone `[62799.9334, 62960.85]`, eligible `11`, clean `0`, and a SHORT counter-regime candidate. Assert:

```ts
assert.equal(summary.trendSetupDirection, "LONG");
assert.equal(summary.trendSetupStatus, "RISK_REJECTED");
assert.deepEqual(summary.trendEntryZone, [62_799.9334, 62_960.85]);
assert.equal(summary.nearCandidateDirectionAlignment, "COUNTER_REGIME");
assert.match(summary.candidateInterpretation, /SHORT.*counter-regime.*TARGET_TOO_CLOSE/i);
assert.equal(summary.currentPriceEligibleExactSamples, 11);
assert.equal(summary.cleanCurrentPriceEligibleSamples, 0);
assert.equal(summary.safety.activationAllowed, false);
assert.equal(summary.safety.orderAllowed, false);
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```powershell
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

Expected: failures for new summary fields that are not yet mapped.

- [ ] **Step 3: Extend watchlist and operator view models**

Map `directionAlignment` and add these operator fields:

```ts
trendSetupDirection: string | null;
trendSetupStatus: string | null;
trendRiskStatus: string | null;
trendEntryZone: [number, number] | null;
trendPriceMoveRequiredDirection: string | null;
nearCandidateDirection: string | null;
nearCandidateDirectionAlignment: string | null;
nearCandidateQualityStatus: string | null;
candidateInterpretation: string;
```

- [ ] **Step 4: Build summary wording from existing diagnostics**

Read `loop.trendStrategy`, the watchlist's first candidate, and the subset accounting. Do not hard-code runtime values. When a candidate is counter-regime, explain both direction conflict and quality status. The next action should wait for the aligned trend pullback plus RR/confirmation improvement and require a canonical regime change before opposite-direction review.

- [ ] **Step 5: Render compact Thai-first rows**

Add display-only rows for trend setup, pullback zone, and near-candidate interpretation. Keep current-price eligible and clean values separate. Preserve the safety badges and add no controls.

- [ ] **Step 6: Run adapter and focused trend tests**

Expected: adapter and trend tests pass with all safety fields false.

### Task 4: Complete Documentation and Verification

**Files:**
- Modify: `docs/D7_10B_DIRECTION_AWARE_WATCHLIST_FIX.md`
- Create: `docs/superpowers/plans/2026-06-20-d7-10b-direction-aware-watchlist.md`

- [ ] **Step 1: Run all required focused tests**

```powershell
node --test --experimental-strip-types lib/trend/currentPriceEligibleExactSubset.test.ts
node --test --experimental-strip-types lib/trend/regimeAwareExactCandidateWatchlist.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
```

- [ ] **Step 2: Run TypeScript and production build**

```powershell
npx tsc --noEmit --incremental false
npm run build
```

Expected: both commands exit zero and the Next build reaches final page optimization.

- [ ] **Step 3: Run served smoke from the latest build**

Start Next on an unused port and inspect `/agent-hq`. Verify Operator Summary, eligible/clean separation, direction-conflict wording, compact candidates, collapsed diagnostics, and absence of activation/order controls. Report actual runtime values rather than forcing the expected fixture.

- [ ] **Step 4: Run changed-line safety and forbidden-path audits**

Search only D7.10-b added lines for forbidden operational symbols, allowing explicit false safety fields and prohibition text in docs. Verify the changed-file list contains no environment, secret, runtime JSON/JSONL, database config, or operational path.

- [ ] **Step 5: Stage only the verified D7.10-b file set**

Use explicit `git add <files>` arguments. Verify `git diff --cached --name-only`, `git diff --cached --stat`, and `git diff --cached --check`. Never use `git add .`.

- [ ] **Step 6: Commit and push only after every gate passes**

```powershell
git commit -m "fix(trend): align watchlist direction and compact candidates"
git push origin main
```

Expected: push updates `origin/main` without force; post-push ahead/behind is `0 0`.
