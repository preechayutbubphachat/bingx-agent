# R2 â€” Evidence Dashboard Blueprint
**Date:** 2026-06-13
**Phase:** M-0Z-6 Â· Paper-only
**Classification:** `R2_EVIDENCE_DASHBOARD_BLUEPRINT_READY` + `R2_EVIDENCE_DASHBOARD_WAIT_FOR_DATA`

All cards described here are **observability-only**. None trigger trades, unlock phases, or constitute approval.

---

## Guiding Principles

1. **Never show metrics as green/approved without explicit evidence thresholds**
2. **Always show sample tier and sample count alongside any metric**
3. **Always include "Read-only diagnostic" subtitle on every card**
4. **NO_DATA is honest â€” show it prominently rather than hiding empty state**
5. **Any metric visible before threshold must display INSUFFICIENT_SAMPLE_WARNING**
6. **Separate grid evidence from trend evidence â€” they are independent systems**

---

## Card 1 â€” Winrate & Expectancy Card

**ViewModel source:** `paper.trendEdgeReview` (TrendEdgeReviewVM)
**Route:** `/api/paper-performance` â†’ adapter â†’ `trendEdgeReview`

### Fields to display

| Field | ViewModel path | Format | NO_DATA display |
|-------|----------------|--------|----------------|
| Sample tier | `trendEdgeReview.sampleTier` | Pill: none/early/usable/review/prod_candidate | "No trades yet" |
| Closed trades | `trendEdgeReview.trendClosedTrades` | Number | 0 |
| Win rate | `trendEdgeReview.winRate` | `X.X%` | "â€”" |
| Net expectancy/R | `trendEdgeReview.netExpectancyAfterCosts` | `+X.XXR` / `-X.XXR` | "â€”" |
| Avg win R | `trendEdgeReview.averageWinR` | `X.XXR` | "â€”" |
| Avg loss R | `trendEdgeReview.averageLossR` | `X.XXR` | "â€”" |
| Profit factor | `trendEdgeReview.profitFactor` | `X.XX` | "â€”" |
| Max drawdown R | `trendEdgeReview.maxDrawdownR` | `X.XXR` | "â€”" |
| Cost drag | `trendEdgeReview.costDrag` | `X.XXXX%` | "â€”" |
| Decision | `trendEdgeReview.decision` | Text label | "HOLD" |

### State thresholds

| State | Condition | Display |
|-------|-----------|---------|
| NO_DATA | `trendClosedTrades === 0` | "No closed trades. Continue paper trading." |
| INSUFFICIENT_DATA | sampleTier: early (1â€“4) | "Too few trades â€” {N} of minimum 15. Results not representative." |
| EARLY_PATTERN | sampleTier: usable (5â€“14) | "Early pattern. High variance. Not deployment-ready." |
| USABLE_SAMPLE | sampleTier: review (15â€“29) | "Usable sample. Operator review required." |
| REVIEW_ELIGIBLE | sampleTier: production_candidate (30+) | "Review eligible â€” operator + safety sign-off required before any canary." |

### WARNING conditions

| Condition | Warning text |
|-----------|-------------|
| `netExpectancyAfterCosts <= 0` | "Negative expectancy after costs â€” strategy under review" (red) |
| `profitFactor < 1.0` | "Profit factor below 1.0 â€” gross losses exceed gross wins" (red) |
| `invalidRiskModelCount > 0` | "Invalid risk model in {N} trades â€” excluded from metrics" (amber) |
| `invalidMissingStopLossCount > 0` | "Missing stop-loss in {N} trades â€” risk model incomplete" (red) |
| `costDrag > netExpectancyAfterCosts * 0.3` | "Cost drag is > 30% of expectancy â€” fee-sensitive strategy" (amber) |

### REVIEW_ELIGIBLE condition (cautious)

Only show REVIEW_ELIGIBLE when ALL of:
- `trendClosedTrades >= 30`
- `netExpectancyAfterCosts > 0`
- `invalidRiskModelCount === 0`
- `decision === "READY_FOR_LIMITED_CANARY_REVIEW"`

AND always append: "Read-only diagnostic â€” not activation approval. Operator sign-off required."

### Safe now? NO â€” wait for trendClosedTrades >= 1 to begin rendering
### Codex difficulty: LOW (ViewModel has all fields, just needs UI rendering)

---

## Card 2 â€” Closed Cycle Quality Card

**ViewModel source:** `paper.closedCycles`, `paper.edgeStatus`, `paper.sampleStatus`, `paper.runtimeMonitor`

### Fields

| Field | Source | Format | NO_DATA |
|-------|--------|--------|---------|
| Grid closed cycles | `paper.closedCycles` | Number | 0 |
| Edge status | `paper.edgeStatus` | DATA_GAP / REAL_FILLS_ACCUMULATING / UNKNOWN | DATA_GAP |
| Sample status | `paper.sampleStatus` | INSUFFICIENT_SAMPLE / SUFFICIENT / UNKNOWN | INSUFFICIENT_SAMPLE |
| Total BUY fills | `paper.totalOrderFilled` | Number | 0 |
| Buy fill count | `paper.runtimeMonitor.cumulativeBuyFillCount` | Number | 0 |
| Sell fill count | `paper.runtimeMonitor.cumulativeSellFillCount` | Number | 0 |
| Buy:Sell ratio | Computed: `buyFills:sellFills` | `N:M` | "N:0" |

### State thresholds

| Cycles | State | Display |
|--------|-------|---------|
| 0 | DATA_GAP | "No closed cycles â€” BUY fills exist but no SELL fill yet. No edge data." |
| 1â€“4 | VERY_EARLY | "First cycles â€” data exists but insufficient. Very high variance." |
| 5â€“14 | EARLY | "Early pattern â€” continue accumulating. Not reviewable yet." |
| 15â€“29 | USABLE | "Usable â€” sufficient for pattern review. Not deployment-ready." |
| 30+ | REVIEW | "Review eligible â€” operator assessment may proceed." |

### WARNING conditions

| Condition | Warning |
|-----------|---------|
| `closedCycles === 0` | "No closed cycles â€” BUY exposure is one-sided. Not yet edge evidence." (amber) |
| `sellFillCount === 0` | "No SELL fills â€” grid cycle cannot close. Expected behavior below-grid." (info) |
| `closedCycles > 0 AND sampleStatus !== "SUFFICIENT"` | "Cycles exist but sample not sufficient yet." (amber) |

### Safe now? YES (fields available) â€” but NO_DATA state for closedCycles=0 phase
### Codex difficulty: LOW

---

## Card 3 â€” Cost Drag Card

**ViewModel source:** `paper.costGateBreakdown`, `paper.trendEdgeReview` (cost fields)

### Fields

| Field | Source | Format |
|-------|--------|--------|
| Round-trip cost % | `costGateBreakdown.roundTripCostPct` | `X.XXXX%` |
| Grid spacing % | `costGateBreakdown.gridSpacingPct` | `X.XXXX%` |
| Spacing buffer ratio | `costGateBreakdown.spacingBufferRatio` | `X.XXx` |
| Fee-grind risk | `costGateBreakdown.feeGrindRisk` | Pill |
| Cost gate status | `costGateBreakdown.status` | Pill |
| Trend cost drag R | `trendEdgeReview.costDrag` | `X.XXXX` (null=unavailable) |
| Slippage attribution | `trendEdgeReview.slippageAttribution` | `X.XXXX` (null=unavailable) |
| Funding attribution | `trendEdgeReview.fundingAttribution` | `X.XXXX` (null=unavailable) |

### State thresholds

| Condition | Display |
|-----------|---------|
| Grid cost gate PASS | Green pill "PASS" â€” but always note: "Cost PASS â‰  edge confirmed" |
| Grid cost gate WARN | Amber pill + "Spacing is thin. Fee-grind risk present." |
| Grid cost gate FAIL | Red pill + "Grid cannot generate profit after costs at this spacing." |
| Trend cost drag null | "Cost drag unavailable â€” requires closed trades." |
| Trend cost drag > 0.3R | "Cost drag is significant â€” check fee/slippage/funding estimates." |

### WARNING conditions

| Condition | Warning |
|-----------|---------|
| `feeGrindRisk === "FEE_GRIND_RISK"` | "Spacing may not exceed round-trip costs â€” grid profitability uncertain." (red) |
| `spacingBufferRatio < 1.5` | "Thin buffer â€” small spread/slippage changes could erode profitability." (amber) |
| `costDrag > netExpectancyAfterCosts` | "Cost drag exceeds expectancy â€” strategy may be fee-ground." (red) |

### Safe now? YES (already partially rendered in DynamicRegridStatusCard)
### Codex difficulty: LOW (card exists, just needs trend cost fields added)

---

## Card 4 â€” Regime Split Performance Card

**ViewModel source:** `paper.trendEdgeReview` â†’ future: per-regime attribution
**Data source:** Would require annotation of each trade record with the regime active at time of entry

### Fields (future â€” not in ViewModel yet)

| Field | Status | Notes |
|-------|--------|-------|
| Win rate by regime | NOT_IN_VIEWMODEL | Requires trade journal with regime tag |
| Expectancy by regime | NOT_IN_VIEWMODEL | Same |
| Trade count by regime | NOT_IN_VIEWMODEL | Same |
| Cost drag by regime | NOT_IN_VIEWMODEL | Same |

### State thresholds

| Condition | Display |
|-----------|---------|
| No trade journal | "Regime split unavailable â€” trade journal not configured" |
| < 30 trades total | "Regime split too noisy â€” wait for 30+ trades total" |
| Specific regime < 10 trades | Show with INSUFFICIENT_SAMPLE warning per regime |

### Safe now? NO â€” requires trade journal with regime annotation (not yet built)
### Blocked by: `trendClosedTrades < 30`, trade journal schema not defined
### Codex difficulty: HIGH (requires schema + annotation + attribution)

---

## Card 5 â€” Trend vs Grid Evidence Separation Card

**Purpose:** Make explicit that grid evidence and trend evidence are independent and must not be conflated.

### Fields

| Grid system | Trend system |
|-------------|-------------|
| `paper.closedCycles` | `trendEdgeReview.trendClosedTrades` |
| `paper.edgeStatus` | `trendEdgeReview.status` |
| `paper.sampleStatus` | `trendEdgeReview.sampleTier` |
| `costGateBreakdown.status` | `trendEdgeReview.netExpectancyAfterCosts` |

### Display rules

Show two clear side-by-side panels with labels:
```
[GRID EVIDENCE]              [TREND EVIDENCE]
Closed cycles: 0             Closed trades: 0
Status: DATA_GAP             Status: INSUFFICIENT_DATA
Sample: INSUFFICIENT         Sample tier: none
Cost gate: PASS              Expectancy: â€”
```

Always show: "Grid and Trend are independent systems. GRID cost-gate PASS does not imply TREND edge confirmed."

### Safe now? YES (data available) â€” needs UI card
### Codex difficulty: LOW

---

## Card 6 â€” Invalid Risk Model Card

**ViewModel source:** `paper.trendEdgeReview.invalidRiskModelCount` + `invalidMissingStopLossCount`

### Fields

| Field | Source | Format |
|-------|--------|--------|
| Invalid risk model count | `trendEdgeReview.invalidRiskModelCount` | Number |
| Missing stop-loss count | `trendEdgeReview.invalidMissingStopLossCount` | Number |
| % trades invalid | Computed: `(invalidRiskModelCount + invalidMissingStopLossCount) / trendClosedTrades` | `X.X%` |

### State thresholds

| Condition | Display |
|-----------|---------|
| `invalidRiskModelCount === 0` | "No invalid risk model detected." (neutral) |
| `invalidRiskModelCount > 0` | "Warning: {N} trades had invalid risk model â€” excluded from metrics." (amber) |
| `invalidMissingStopLossCount > 0` | "Warning: {N} trades missing stop-loss â€” risk model incomplete." (red) |
| `(invalid/total) > 0.1` | "Over 10% of trades have risk model issues â€” review entry process." (red) |

### Safe now? YES (fields in ViewModel) â€” needs display when trendClosedTrades >= 1
### Codex difficulty: LOW

---

## Card 7 â€” Sample Tier / Confidence Card

**ViewModel source:** Multiple trendEdgeReview fields + paper fields
**Purpose:** Single-source-of-truth for "how confident can we be in current metrics?"

### Fields

| Field | Source |
|-------|--------|
| Grid sample status | `paper.sampleStatus` |
| Trend sample tier | `trendEdgeReview.sampleTier` |
| Grid closed cycles | `paper.closedCycles` |
| Trend closed trades | `trendEdgeReview.trendClosedTrades` |
| Exact zone samples | `trendEvidenceDecisionSummary.exactZoneComparisonSummary.exactSamples` |
| Heuristic samples | `trendEvidenceDecisionSummary.exactZoneComparisonSummary.heuristicSamples` |
| D5 sample tier | `trendEvidenceDecisionSummary.exactZoneComparisonSummary.sampleTier` |
| Vol baseline progress | `paper.volBaselineDiagnostic.baselineSamples1h / requiredBaselineSamples` |

### Confidence levels

| Overall confidence | Condition | Display |
|-------------------|-----------|---------|
| NO_DATA | Everything = 0 | "No evidence collected. System is logging." |
| BOOTSTRAP | closedCycles=0 AND trades=0 | "Bootstrap phase. No actionable metrics yet." |
| EARLY_SIGNAL | cycles/trades: 1â€“4 | "Early signal. Do not conclude." |
| PRELIMINARY | cycles/trades: 5â€“14 | "Preliminary. Continue logging." |
| REVIEW_READY | cycles/trades: 15â€“29 | "Review-ready. Operator assessment may begin." |
| REVIEW_ELIGIBLE | cycles/trades: 30+ | "Review eligible â€” per-system approval required." |

### Special gates

| Gate | Threshold | Unlock |
|------|-----------|--------|
| First grid metric display | `closedCycles >= 1` | Show grid cycle count |
| First trend metric display | `trendClosedTrades >= 1` | Show winrate (with EARLY warning) |
| D5 fill resolution | `exactSamples >= 10` | Begin fill resolution |
| Vol baseline ready | `baselineSamples1h >= requiredBaselineSamples` | Vol regime classification stable |
| M-0B discussion eligibility | `closedCycles >= 50 AND netExpectancyAfterCosts > 0` | Operator review may begin (not automatic) |

### Safe now? YES â€” render with current bootstrap data
### Codex difficulty: LOW to MEDIUM

---

## Implementation Priority

| Card | Priority | Safety | Data available | Codex difficulty |
|------|----------|--------|----------------|-----------------|
| 7. Sample Tier / Confidence | HIGH | âœ… Safe now | âœ… Yes | LOW |
| 5. Trend vs Grid Separation | HIGH | âœ… Safe now | âœ… Yes | LOW |
| 2. Closed Cycle Quality | HIGH | âœ… Safe now | âœ… Yes (DATA_GAP) | LOW |
| 3. Cost Drag | HIGH | âœ… Safe now | âœ… Yes | LOW |
| 6. Invalid Risk Model | MEDIUM | âœ… Safe when data flows | âš ï¸ Needs trendClosedTradesâ‰¥1 | LOW |
| 1. Winrate & Expectancy | MEDIUM | âœ… Safe when data flows | âš ï¸ Needs trendClosedTradesâ‰¥1 | LOW |
| 4. Regime Split | LOW | âŒ Wait for 30+ trades | âŒ Trade journal not built | HIGH |

---

## Safety Header Required on Every Card

Each card must display:
```
[subtitle] Read-only diagnostic â€” not activation approval
[subtitle] Does not change trading behavior, grid parameters, or phase status
```

---

*Classification: R2_EVIDENCE_DASHBOARD_BLUEPRINT_READY + R2_EVIDENCE_DASHBOARD_WAIT_FOR_DATA*
*Cards 1,5,6,7 can proceed to Codex for UI-only implementation when trendClosedTrades >= 1*
*Card 4 (Regime Split) blocked until trade journal + 30+ trades*
*Phase 2-B remains BLOCKED Â· M-0B remains BLOCKED*
