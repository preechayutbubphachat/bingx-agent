# R2 â€” Winrate & Expectancy Readiness Plan
**Date:** 2026-06-13
**Phase:** M-0Z-6 Â· Paper-only Â· closedCycles = 0
**Classification:** `R2_WINRATE_BLOCKED_BY_NO_CLOSED_CYCLES` + `R2_WINRATE_NEEDS_CODEX_READONLY_HANDOFF`

---

## TL;DR

> Winrate à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¸§à¸²à¸¡à¸«à¸¡à¸²à¸¢à¸•à¸­à¸™à¸™à¸µà¹‰ à¹€à¸žà¸£à¸²à¸° closedCycles = 0 à¸—à¸±à¹‰à¸‡ Grid à¹à¸¥à¸° Trend
> à¸£à¸°à¸šà¸š UI/ViewModel à¸¡à¸µà¸Ÿà¸´à¸¥à¸”à¹Œà¸„à¸£à¸šà¹à¸¥à¹‰à¸§ à¸£à¸­à¹à¸„à¹ˆà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸£à¸´à¸‡
> à¸­à¸¢à¹ˆà¸²à¸­à¹ˆà¸²à¸™à¸„à¹ˆà¸² 0% à¸«à¸£à¸·à¸­ "â€”" à¸§à¹ˆà¸²à¹€à¸›à¹‡à¸™ edge

---

## 1. Why Winrate Is Not Meaningful Yet

### 1-A. Grid side

| Field | Current value | Why not meaningful |
|-------|---------------|-------------------|
| `closedCycles` | **0** | Grid cycle = BUY filled + SELL filled + profit locked. None complete yet. |
| `sellFillCount` | **0** | No SELL filled â†’ no completed round-trip |
| `edgeStatus` | **DATA_GAP** | System's own label: closedCycles=0 â†’ never valid edge |
| `sampleStatus` | **INSUFFICIENT_SAMPLE** | Sample threshold not met |
| `totalOrderFilled` | >0 (BUY fills exist) | Fills â‰  closed cycles. BUY fill is open inventory, not profit. |

A winrate calculated from BUY fills only = meaningless. A "winrate" of 100% with 0 sells = no information.

### 1-B. Trend side

| Field | Current value | Why not meaningful |
|-------|---------------|-------------------|
| `trendClosedTrades` | **0** | No trend paper trade completed yet |
| `TrendEdgeReviewVM.status` | **INSUFFICIENT_DATA** | Explicit system label |
| `TrendEdgeReviewVM.sampleTier` | **none** | Tier: none â†’ early â†’ usable â†’ review â†’ production_candidate |
| `winRate` | **null** | Adapter returns null when no data |
| `expectancyR` | **null** | No data |
| `profitFactor` | **null** | No data |
| `decision` | **HOLD / CONTINUE_PAPER** | Never REVIEW_ELIGIBLE with 0 trades |

### 1-C. What the system correctly says today

The `progression.ts` logic already blocks misinterpretation:
- `closedCycles=0` â†’ pushes reason: `"closedCycles=0: à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸£à¸­à¸šà¸›à¸´à¸” à¹„à¸¡à¹ˆà¸¡à¸µ edge XP"`
- `sampleStatus !== "SUFFICIENT"` â†’ pushes reason: `"à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸žà¸­à¸ªà¸³à¸«à¸£à¸±à¸šà¸›à¸£à¸°à¹€à¸¡à¸´à¸™ expectancy"`
- `edgeStatus: "DATA_GAP"` is always set when closedCycles=0

---

## 2. What Data Unlocks First Visible Winrate

### Grid â€” minimum to show any cycle metric

| Gate | Requirement | Notes |
|------|-------------|-------|
| First number | `closedCycles >= 1` | One BUY+SELL completed cycle |
| First winrate | `closedCycles >= 5` | Extremely noisy but displayable with WARNING |
| First early-pattern | `closedCycles >= 15` | Minimum for pattern recognition |
| First usable estimate | `closedCycles >= 30` | Safe for early analysis, not deployment |

### Trend â€” minimum to show any trade metric

| Gate | Requirement | Notes |
|------|-------------|-------|
| First number | `trendClosedTrades >= 1` | One paper trade completed with entry+exit |
| First sampleTier: early | `trendClosedTrades >= 5` per `sampleTier` definition |
| First sampleTier: usable | `trendClosedTrades >= 15` | |
| First sampleTier: review | `trendClosedTrades >= 30` | Only here can `READY_FOR_LIMITED_CANARY_REVIEW` be possible |
| Production candidate | `trendClosedTrades >= 50` | |

---

## 3. Minimum Sample Tiers

### Sample tier table (TrendEdgeReviewVM)

| Tier | Trades required | What it means | What UI should say |
|------|-----------------|---------------|-------------------|
| `none` | 0 | No data at all | "No closed trades yet" |
| `early` | 1â€“4 | First signal visible, high variance | "Early signal â€” too few trades to interpret" |
| `usable` | 5â€“14 | Pattern starting to emerge | "Preliminary â€” continue paper trading" |
| `review` | 15â€“29 | Reviewable but not deployment-ready | "Review eligible â€” operator assessment required" |
| `production_candidate` | 30+ | Statistical basis for canary | "Production candidate review â€” operator + Codex + safety sign-off required" |

### Grid closed-cycle sample tiers (proposed, not yet in viewModel)

| Cycles | Label | What it means |
|--------|-------|---------------|
| 0 | DATA_GAP | No information |
| 1â€“4 | VERY_EARLY | First signal only |
| 5â€“14 | EARLY | Pattern exists but high variance |
| 15â€“29 | USABLE | Statistically starting to converge |
| 30â€“49 | REVIEW | Sufficient for operator review |
| 50+ | PRODUCTION_CANDIDATE | Deployable analysis |

---

## 4. Minimum Sample for Usable Winrate (safety policy)

### Grid
**Hard minimum before showing any winrate:** `closedCycles >= 15`
**Minimum for operator review consideration:** `closedCycles >= 30`
**Minimum before M-0B unlock discussion:** `closedCycles >= 50` AND `expectancy > 0` after costs

### Trend
**Hard minimum before showing winrate:** `trendClosedTrades >= 15`
**Minimum for operator review consideration:** `trendClosedTrades >= 30`
**Minimum before live canary consideration:** `trendClosedTrades >= 50` AND `expectancy > 0` after costs AND operator approval

> **Safety note:** `winRate` alone is never sufficient. A system with 90% winrate and -2R expectancy loses money. Always show `netExpectancyAfterCosts` alongside winrate.

---

## 5. Why Expectancy > Winrate (as the primary metric)

| Metric | Why it matters | Why winrate alone fails |
|--------|----------------|------------------------|
| **netExpectancyAfterCosts** | Net profit per trade after fee+slip+funding drag | A 90% win-rate system with small wins and large losses loses money |
| **averageWinR / averageLossR** | Shape of the distribution | Winrate with R=0.1 per win is not a business |
| **profitFactor** | Gross win / gross loss ratio | Must be > 1.0 to survive long-term |
| **maxDrawdownR** | Worst continuous loss in R | High drawdown â†’ position sizing breaks |
| **costDrag** | Fee + slippage + funding eating PnL | If costDrag > gross expectancy â†’ strategy is fee-ground |
| **riskOfRuinEstimate** | Probability of total loss given Kelly fraction | Even positive expectancy can ruin if oversized |

**Formula reminder:**
```
netExpectancyAfterCosts = (winRate Ã— avgWinR) - (lossRate Ã— avgLossR) - costDrag
```
A winrate of 50% with avgWinR=2.0, avgLossR=1.0, costDrag=0.15 â†’ expectancy = (0.5Ã—2.0) - (0.5Ã—1.0) - 0.15 = **+0.35R per trade** âœ“
A winrate of 80% with avgWinR=0.5, avgLossR=1.0, costDrag=0.1 â†’ expectancy = (0.8Ã—0.5) - (0.2Ã—1.0) - 0.1 = **+0.10R** â€” barely positive, fee-sensitive

---

## 6. What the UI Should Eventually Show

### Primary Evidence Card (TrendEdgeReviewVM â€” already in viewModel)

All fields already exist in `TrendEdgeReviewVM`. UI just needs to render them once data flows:

```
Winrate               â†’ TrendEdgeReviewVM.winRate (null â†’ "â€”")
Net Expectancy/R      â†’ TrendEdgeReviewVM.netExpectancyAfterCosts
Avg Win R             â†’ TrendEdgeReviewVM.averageWinR
Avg Loss R            â†’ TrendEdgeReviewVM.averageLossR
Profit Factor         â†’ TrendEdgeReviewVM.profitFactor
Max Drawdown R        â†’ TrendEdgeReviewVM.maxDrawdownR
Consecutive Losses    â†’ TrendEdgeReviewVM.maxConsecutiveLosses
Risk of Ruin          â†’ TrendEdgeReviewVM.riskOfRuinEstimate
Cost Drag             â†’ TrendEdgeReviewVM.costDrag
Fee attribution       â†’ TrendEdgeReviewVM.slippageAttribution + fundingAttribution
Invalid risk count    â†’ TrendEdgeReviewVM.invalidRiskModelCount
Missing stop-loss     â†’ TrendEdgeReviewVM.invalidMissingStopLossCount
Closed trades         â†’ TrendEdgeReviewVM.trendClosedTrades
Sample tier           â†’ TrendEdgeReviewVM.sampleTier
Decision              â†’ TrendEdgeReviewVM.decision
```

### Grid Evidence (currently in paper.closedCycles â€” needs dedicated card)

```
Grid closed cycles    â†’ paper.closedCycles
Edge status           â†’ paper.edgeStatus
Sample status         â†’ paper.sampleStatus (INSUFFICIENT_SAMPLE / SUFFICIENT)
Grid winrate          â†’ [NOT IN VIEWMODEL YET â€” needs design]
Grid expectancy       â†’ [NOT IN VIEWMODEL YET â€” needs design]
```

### UI wording rules (safety)

| Condition | Display | Color |
|-----------|---------|-------|
| `closedCycles = 0` | "No closed cycles yet â€” data gap" | Gray/neutral |
| `sampleTier: none/early` | "Too few trades to interpret. Continue paper trading." | Amber |
| `sampleTier: usable` | "Preliminary pattern. Not deployment-ready." | Amber |
| `sampleTier: review` | "Review eligible. Operator assessment required." | Blue/info |
| Any metric shown | Always show: "Read-only diagnostic â€” not activation approval" | Small italic |
| `netExpectancyAfterCosts <= 0` | "Negative expectancy after costs â€” strategy under review" | Red |

---

## 7. What Must NOT Be Done

```
DO NOT show winrate before closedCycles >= 15 (grid) or trendClosedTrades >= 15 (trend)
DO NOT show expectancy before sample tier is "usable" or better
DO NOT label any metric as "edge confirmed" or "ready to trade"
DO NOT show winrate without showing expectancy alongside it
DO NOT use winrate as sole criterion for M-0B unlock consideration
DO NOT compare current metrics to any backtest result
DO NOT use cost-gate PASS as a proxy for expectancy
```

---

## 8. Current Status (2026-06-13)

| System | Closed trades | Sample tier | Winrate | Expectancy | Next unlock |
|--------|--------------|-------------|---------|------------|-------------|
| Grid | 0 cycles | DATA_GAP | null | null | First BUY+SELL completed cycle |
| Trend paper | 0 trades | none | null | null | First completed trend paper trade |

**Root cause of zeros:** Price is BELOW_GRID (UPTREND regime, price moved down outside grid lower). No SELL orders fill below grid. Grid not regridded yet (activation blocked pending closedCycles evidence). Trend is in paper phase but no setup has completed entry+exit yet.

---

## 9. Proposed Timeline to Meaningful Data

| Milestone | Trigger | Estimated? | Action |
|-----------|---------|-----------|--------|
| First grid cycle | 1 closedCycle | Unknown â€” depends on market | Dashboard updates automatically |
| First trend trade | 1 trendClosedTrade | Unknown â€” depends on setup quality | Dashboard updates automatically |
| Early sample tier | 5â€“14 trades | Weeks at paper pace | Note patterns, do not conclude |
| Usable sample | 15â€“29 trades | Weeks-months | Operator review, not activation |
| Review sample | 30+ trades | Months | READY_FOR_LIMITED_CANARY_REVIEW possible |
| M-0B consideration | 50+ cycles + positive expectancy | Future | Full operator sign-off required |

---

## 10. Safe Read-Only UI Handoff (Codex)

The `TrendEdgeReviewVM` already has all fields. The gap is UI rendering. When `trendClosedTrades >= 1`:

**Files to touch:**
- `dashboard/components/trading-agent-hq/TrendEdgeReviewCard.tsx` (or equivalent trend card)
- No changes to viewModel.ts, adapter.ts, or any route needed

**Safety constraints:**
- Always render "Read-only diagnostic â€” not activation approval" subtitle
- Always show `sampleTier` next to any metric
- Never show `decision = READY_FOR_LIMITED_CANARY_REVIEW` without explicit `liveActivationAllowed = false` guard
- Never show a "green" / "approved" banner based on any metric alone

**Classification:** `R2_WINRATE_NEEDS_CODEX_READONLY_HANDOFF` â€” handoff safe once `trendClosedTrades >= 1`

---

*Classification: R2_WINRATE_BLOCKED_BY_NO_CLOSED_CYCLES + R2_WINRATE_NEEDS_CODEX_READONLY_HANDOFF*
*Safety tier: Paper-only Â· M-0B BLOCKED Â· no deployment decision from this doc*
