# T-3H-6-D5.1 â€” Exact Zone Fill Resolution Design
**Phase:** T-3H-6 (D5 extension)
**Date:** 2026-06-13
**Classification:** `D5_1_FILL_RESOLUTION_DESIGN_READY` (schema exists) + `D5_1_NEEDS_RUNTIME_FIELD_AUDIT` (candle data availability)
**Safety:** Read-only counterfactual analysis. Does not change entry logic, zone detection, or order placement.

---

## Current State Audit

### What already exists

`dashboard/lib/trend/exactZoneComparisonSummary.ts` already implements fill resolution:

```typescript
export type ExactZoneFillResolutionStatus =
  | "NOT_CONFIGURED"  // No candle data provided at all
  | "NO_CANDLES"      // Candle data attempted but empty
  | "PENDING"         // Candles present but not enough post-snapshot bars
  | "PARTIAL"         // Some records resolved, some still pending
  | "RESOLVED"        // All resolvable records have final fill/miss determination

export interface ExactZoneFillResolution {
  status: ExactZoneFillResolutionStatus;
  totalResolvable: number;     // snapshots with entry+invalidation+target defined
  filled: number;              // price hit entry zone before invalidation
  missed: number;              // invalidation hit before entry
  pending: number;             // not yet enough bars to determine
  invalidationFirst: number;   // subset of missed: invalidation hit first
  missedFillRate: number | null; // missed / totalResolvable
}
```

**Line 281:** `if (candlesByTimeframe == null) return emptyFillResolution("NOT_CONFIGURED")`
**Line 191:** `fillResolution: emptyFillResolution("NOT_CONFIGURED")` â€” default state

### What is missing (the real D5.1 gap)

The schema and computation logic exist. What does NOT exist yet:

1. **Post-snapshot candle data is not stored alongside snapshots** â€” the runtime snapshot writer captures market state at the moment of snapshot but does NOT append subsequent candles (the bars that trade AFTER the snapshot is taken). Fill resolution requires those future bars.

2. **`candlesByTimeframe` is not populated** in the `exactZoneComparisonSummary()` call path â€” it's passed as `null` everywhere â†’ result is always `NOT_CONFIGURED`.

3. **No candle retention store** â€” there is no file/DB holding historical OHLCV bars indexed by timestamp that can be joined to a snapshot's `capturedAt`.

---

## Problem Statement

**D5 currently shows:** exact RR vs heuristic RR for each snapshot. Tells us: "would this entry have had better RR?"

**D5.1 adds:** would the exact entry (e.g., OB/FVG refined entry at 97,200 vs heuristic at 97,500) actually FILL before the setup is invalidated?

This is a **counterfactual** question:
- Snapshot captured at Tâ‚€ with exact entry=97,200, invalidation=96,800, target1=98,200
- After Tâ‚€, did price ever trade at or below 97,200 before it hit 96,800?
- If yes â†’ FILL
- If no â†’ MISSED (invalidation came first)

This does NOT change any live order. It is pure historical simulation on paper data.

---

## Required Per-Record Fields (at snapshot time)

Each snapshot record used in fill resolution must have:

```typescript
interface FillResolutionRecord {
  // From existing snapshot
  capturedAt: string;          // ISO timestamp â€” anchor for candle alignment
  snapshotId: string;          // unique snapshot identifier
  direction: "LONG" | "SHORT"; // determines which price side triggers fill

  // Entry and exit levels (already exists in D5 data)
  exactEntry: number;          // refined OB/FVG entry price
  invalidation: number;        // price that voids the setup
  target1: number;             // first take-profit price

  // For fill determination
  lookAheadBars: number;       // how many bars after capturedAt to look (config: e.g. 20 bars on 15m)
  timeframeMins: number;       // which timeframe candles to use (e.g. 15)
}
```

---

## Required Candle Windows

For each snapshot record:
1. Query candles from `capturedAt` to `capturedAt + (lookAheadBars Ã— timeframeMins)`
2. Timeframe: **15m or 1h** (recommended: 15m for fill precision, 1h for macro perspective)
3. Required OHLCV fields: `time`, `high`, `low` (close optional)

### Alignment rule

```
barIndex = floor((bar.time - capturedAt) / timeframeMins_in_ms)
Valid bars: barIndex >= 0 AND barIndex < lookAheadBars
```

Do NOT include bars with `time < capturedAt` â€” that is lookahead bias.

---

## Lookahead Bias Prevention

> This is the most important correctness constraint.

**VIOLATION:** Using a bar with `time < capturedAt` to determine fill â†’ the system "knew" the price before the snapshot was taken.

**Rule:** Only use bars where `bar.closingTime > capturedAt`. For open-bar alignment: `bar.openTime >= capturedAt`.

**Implementation guard:**
```typescript
const validBars = candles.filter(c => c.time >= capturedAt);
if (validBars.length === 0) return emptyFillResolution("NO_CANDLES");
if (validBars.length < MIN_BARS_FOR_RESOLUTION) return emptyFillResolution("PENDING");
```

---

## Fill Decision Rules

### LONG setup

```typescript
function determineFillLong(bars: Candle[], entry: number, invalidation: number): FillOutcome {
  for (const bar of bars) {  // bars are in chronological order
    if (bar.low <= invalidation) return { outcome: "INVALIDATION_FIRST", barIndex: i };
    if (bar.low <= entry) return { outcome: "FILLED", barIndex: i };
  }
  return { outcome: "PENDING" };  // ran out of bars before either event
}
```

### SHORT setup

```typescript
function determineFillShort(bars: Candle[], entry: number, invalidation: number): FillOutcome {
  for (const bar of bars) {
    if (bar.high >= invalidation) return { outcome: "INVALIDATION_FIRST", barIndex: i };
    if (bar.high >= entry) return { outcome: "FILLED", barIndex: i };
  }
  return { outcome: "PENDING" };
}
```

### Fill-before-invalidation rule

FILLED = entry level traded BEFORE invalidation level traded (in bar sequence, bar by bar, checking bar LOW/HIGH in priority order: invalidation first, then entry)

> Why check invalidation first within each bar: if both invalidation and entry are breached in the same bar (wide-range bar), the conservative reading is INVALIDATION_FIRST â€” the setup was already invalid when the entry level was hit. This avoids overcounting fills.

### Invalidation-before-fill rule

`invalidationFirst` counter = records where outcome was INVALIDATION_FIRST. These are valid misses â€” the setup did not invalidate due to bad entry, it invalidated because market moved against the entire setup.

### Pending / insufficient candles rule

If `validBars.length < MIN_BARS_FOR_RESOLUTION` (e.g., < 3 bars available):
- Status = `PENDING`
- Increment `pending` counter
- Do not count as filled or missed
- Re-evaluate when more candle data is available

---

## Storage Implications

### Option A â€” On-demand candle fetch (recommended for now)

When computing fill resolution, fetch historical candles from a cache or BingX historical endpoint for the required time window. No new persistent store needed. Candles are fetched at report-generation time, not during snapshot creation.

**Cost:** Each report generation hits candle data source.
**Benefit:** No new JSON file, no runtime change.
**Constraint:** Historical candle data must be available N bars after snapshot timestamp.

### Option B â€” Append candles to snapshot store (future)

Modify snapshot writer to also append subsequent candles alongside each snapshot entry.

**Cost:** Changes `paper_cycle.sh` or snapshot writer â€” NOT safe yet under current constraints.
**Benefit:** Self-contained data for fill resolution.
**Status:** BLOCKED until M-0Z-6+ and operator approval.

**Recommendation:** Implement Option A first. Use BingX historical candle API (already available via market data routes) to fetch bars for each snapshot's `capturedAt` + lookAhead window at report time.

---

## Tests Required

```typescript
// Fill resolution tests
test("LONG fill: price touches entry before invalidation â†’ FILLED")
test("LONG fill: price touches invalidation before entry â†’ INVALIDATION_FIRST")
test("LONG fill: wide bar touches both â†’ INVALIDATION_FIRST (conservative)")
test("SHORT fill: mirror of LONG tests")
test("No bars available â†’ NOT_CONFIGURED")
test("Empty bars array â†’ NO_CANDLES")
test("Fewer than MIN_BARS bars â†’ PENDING")
test("Bars with time < capturedAt are excluded â†’ lookahead bias guard")
test("missedFillRate = missed / totalResolvable")
test("pending records do not count toward filled or missed")
test("totalResolvable = filled + missed + pending (accounting identity)")
```

All tests exist in: `dashboard/lib/trend/exactZoneComparisonSummary.test.ts` (partial â€” needs fill resolution cases added)

---

## Performance Cost

| Operation | Cost estimate | Notes |
|-----------|--------------|-------|
| Candle fetch per snapshot | ~1 API call or cache read | Parallelizable |
| Fill determination per record | O(lookAheadBars) = O(20) | Trivial |
| Total for 50 snapshots | ~50 candle windows | Acceptable at report time |
| Continuous re-evaluation | Only PENDING records need re-check | Amortized cheaply |

---

## UI Wording

| Status | Display | Color |
|--------|---------|-------|
| `NOT_CONFIGURED` | "Fill resolution not configured â€” candle data not connected" | Gray |
| `NO_CANDLES` | "No candle data available for this window" | Gray |
| `PENDING` | "Pending â€” waiting for enough post-snapshot bars" | Amber |
| `PARTIAL` | "Partial â€” some records resolved, {N} still pending" | Amber |
| `RESOLVED` | "Resolved â€” {filled}/{total} filled, {missed} missed, {invalidationFirst} invalidation-first" | Blue |
| `missedFillRate > 0.5` | Warning: "Over half of exact entries missed fill â€” entry quality risk" | Amber |
| `WARNING_HIGH_MISSED_FILL_RATE` flag | "High missed fill rate â€” exact zone entry may be too aggressive" | Amber |

Always include:
> "Read-only counterfactual â€” does not change live entry logic or order placement"

---

## Why This Is Read-Only Counterfactual Analysis

Fill resolution answers the question: "Would this entry have filled?" It does NOT:
- Place any order
- Change any parameter
- Affect the live paper cycle
- Change invalidation thresholds
- Enable or disable OB/FVG entry (Phase 2-B remains BLOCKED)

It is pure retrospective analysis on already-captured snapshots. Its purpose is to quantify how often exact OB/FVG entries would fill in practice, to inform future decisions about whether to activate OB/FVG execution â€” decisions that require `exactSamples >= 100` and `fillResolution.status = RESOLVED` before even being considered.

---

## Implementation Sequence (not yet approved)

```
Step 1: Add MIN_BARS_FOR_RESOLUTION config (e.g., 3 bars minimum)
Step 2: Wire candlesByTimeframe in exactZoneComparisonSummary() call
        using existing BingX candle cache (read-only)
Step 3: Apply lookahead bias guard (filter bars < capturedAt)
Step 4: Implement fill determination functions (LONG/SHORT)
Step 5: Compute missedFillRate
Step 6: Add tests
Step 7: UI displays fillResolution section (already in card)
Step 8: Operator review of first resolved results

DO NOT:
- Modify snapshot writer
- Add new persistent files
- Change paper_cycle.sh
- Change entry logic or thresholds
- Enable OB/FVG execution
```

**Current blocker:** No candle-fetching path is wired to `exactZoneComparisonSummary()`. This is a Codex task once `exactSamples >= 10` (enough data to test against).

---

## Current Classification

| Item | Status |
|------|--------|
| ExactZoneFillResolution schema | âœ… Exists in exactZoneComparisonSummary.ts |
| Status states (NOT_CONFIGURED/PENDING/etc) | âœ… Defined |
| emptyFillResolution() function | âœ… Exists |
| Fill determination logic | âŒ Not yet implemented |
| Candle data wiring | âŒ Not yet wired |
| Lookahead bias guard | âŒ Not yet in code path |
| Tests | âš ï¸ Partial (type tests exist, fill logic tests missing) |
| UI rendering | âœ… Card already shows fillResolution section |
| Data to test against | âŒ Need exactSamples >= 10 first |

**Classification: D5_1_FILL_RESOLUTION_DESIGN_READY + D5_1_NEEDS_RUNTIME_FIELD_AUDIT**

---

*Design doc â€” do not implement until exactSamples >= 10 and operator approval*
*Phase 2-B (OB/FVG execution) remains BLOCKED regardless of fill resolution results*
