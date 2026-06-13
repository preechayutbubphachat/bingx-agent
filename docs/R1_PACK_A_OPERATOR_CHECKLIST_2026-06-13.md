# R1 Safe Pack A â€” Operator Verification Checklist
**Date:** 2026-06-13
**Commit:** `2e5f9fb6b240ae6d75c1905b3b12431930f7df52`
**Commit message:** `feat(agent-hq): add unknown regime and fee-grind diagnostics`
**Dashboard URL:** `/agent-hq`
**Phase:** M-0Z-6 Â· Paper-only Â· M-0B BLOCKED

---

## How to Use This Checklist

1. Open `/agent-hq` in browser
2. Check each section below
3. Mark PASS / WARNING / FAIL next to each item
4. If any FAIL â†’ see "What to send Codex" section at bottom

---

## Section 1 â€” CanonicalMarketRegimeCard

### 1-A. Card header

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1 | Card heading | `Market Regime à¸«à¸¥à¸±à¸ (Shadow)` | |
| 2 | Subtitle | `à¹‚à¸«à¸¡à¸”à¹€à¸‡à¸² à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹ƒà¸Šà¹‰à¹€à¸›à¸´à¸”à¸à¸£à¸´à¸”` | |
| 3 | Regime badge (top right) | Any of: `à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸¡à¹ˆà¸žà¸­` / `à¸•à¸¥à¸²à¸”à¸à¸£à¸­à¸š` / `à¹€à¸—à¸£à¸™à¸”à¹Œà¸¥à¸‡` / `à¹€à¸—à¸£à¸™à¸”à¹Œà¸‚à¸¶à¹‰à¸™` / `à¹„à¸¡à¹ˆà¸„à¸§à¸£à¹€à¸—à¸£à¸”` / `à¸„à¸§à¸²à¸¡à¸œà¸±à¸™à¸œà¸§à¸™à¸‚à¸¢à¸²à¸¢à¸•à¸±à¸§` / `à¸„à¸§à¸²à¸¡à¸œà¸±à¸™à¸œà¸§à¸™à¸šà¸µà¸šà¸•à¸±à¸§` / `à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¸ˆà¸²à¸à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œ` | |

**PASS if:** All 3 show correctly.
**FAIL if:** Heading missing, badge missing, or card does not render at all.

---

### 1-B. Shadow-only amber banner

| # | Check | Expected |
|---|-------|----------|
| 4 | Amber banner text | `Market Regime à¸«à¸¥à¸±à¸à¸•à¸­à¸™à¸™à¸µà¹‰à¹€à¸›à¹‡à¸™ Shadow diagnostics à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¹€à¸—à¸£à¸” à¹à¸¥à¸°à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸›à¸¥à¸”à¸¥à¹‡à¸­à¸ M-0B` |

**PASS if:** Banner is amber/yellow background, wording matches exactly.
**WARNING if:** Banner visible but wording differs.
**FAIL if:** Banner missing entirely.

---

### 1-C. UNKNOWN / DATA GAP fail-closed warning â† *NEW in this commit*

**How to trigger:** regime is UNKNOWN, or evidence completeness = missing, or source freshness = stale/unknown. Check the 4 Field metrics visible in the card grid first to confirm this is the current state.

| # | Check | Expected |
|---|-------|----------|
| 5 | Warning block border | Red (`border-red-200`) |
| 6 | Warning block background | Light red (`bg-red-50`) |
| 7 | Line 1 text | `UNKNOWN / DATA GAP - fail closed` |
| 8 | Line 2 text | `No trade should be inferred from incomplete regime data. Read-only warning - does not change trading behavior.` |

**PASS if:** Block present with red styling and both lines of text match exactly.
**WARNING if:** Block present but wording slightly differs (check for missing "fail closed" or missing "Read-only warning").
**FAIL if:** Block not visible when regime IS UNKNOWN or data IS missing/stale.

> **Note:** If the current live regime is NOT UNKNOWN and data is fresh, this block will be hidden â€” that is correct behavior. Check the `Source Freshness` and `Evidence Completeness` fields in the grid (item 1-D) to know if the warning should be visible.

---

### 1-D. Main regime field grid (8 fields)

| # | Field label | Expected value type |
|---|-------------|---------------------|
| 9 | `Regime à¸«à¸¥à¸±à¸` | Thai label (e.g. "à¸•à¸¥à¸²à¸”à¸à¸£à¸­à¸š") |
| 10 | `Direction` | Thai label (e.g. "à¹€à¸›à¹‡à¸™à¸à¸¥à¸²à¸‡") |
| 11 | `Confidence` | Number + label e.g. `55 (medium)` |
| 12 | `Source Freshness` | `fresh` / `stale` / `unknown` |
| 13 | `Evidence Completeness` | e.g. `ok 75%` |
| 14 | `Legacy Plan Mode` | e.g. `GRID_NEUTRAL / à¹‚à¸«à¸¡à¸”à¸ˆà¸²à¸à¹à¸œà¸™à¹€à¸”à¸´à¸¡ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ regime à¸«à¸¥à¸±à¸` |
| 15 | `Shadow` | `à¹ƒà¸Šà¹ˆ` or `à¹„à¸¡à¹ˆ` |
| 16 | `paper/live activation` | e.g. `à¹„à¸¡à¹ˆ / à¹„à¸¡à¹ˆ` |

**PASS if:** All 8 fields visible and not blank/dash-only.
**WARNING if:** Some fields show `â€”` or `n/a` (acceptable if data missing).
**FAIL if:** Grid section missing entirely or fewer than 4 fields visible.

---

### 1-E. Regime mismatch diagnostic section (OBS-B)

| # | Check | Expected |
|---|-------|----------|
| 17 | Section heading | `Regime mismatch diagnostic` |
| 18 | Section subtitle | `Read-only diagnostic - not a trading trigger` |
| 19 | Status badge | One of: `matched` / `mismatch` / `no canonical data` / `low confidence` / `Decision regime is null/unknown but canonical regime is available` |
| 20 | 8 sub-fields visible | Decision regime / Canonical regime / Canonical confidence / Regime mismatch / Canonical direction / Canonical source / Computed at / Null decision + canonical |
| 21 | Canonical reason tags block | `Canonical reason summary` block visible with tag pills (or "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥") |

**PASS if:** All visible and section renders.
**FAIL if:** Section entirely missing.

---

### 1-F. Vol baseline diagnostic section (OBS-B)

| # | Check | Expected |
|---|-------|----------|
| 22 | Section heading | `Vol baseline diagnostic` |
| 23 | Section subtitle | `Uses latest.marketSnapshot.volatility only` |
| 24 | Readiness badge | `ready` / `insufficient` / `building` / `no data` |
| 25 | 4 sub-fields | Vol state / Confidence / Baseline samples (x/y) / Baseline progress |
| 26 | Warning block | Amber warning block visible if `vol.warning` is non-empty (acceptable if absent when no warning) |

**PASS if:** Section renders and 4 fields visible.
**FAIL if:** Section missing entirely.

---

### 1-G. Bottom list blocks

| # | Check | Expected |
|---|-------|----------|
| 27 | "à¹€à¸«à¸•à¸¸à¸œà¸¥" block | Tag pills for regime reasons |
| 28 | "à¸„à¸³à¹€à¸•à¸·à¸­à¸™" block | Tag pills (or "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥") |
| 29 | "Allowed Modes" block | Tag pills |
| 30 | "Blocked Modes" block | Tag pills |
| 31 | "Latest Candle by TF" block | `1m: â€¦` `5m: â€¦` format |
| 32 | "Ignored Legacy Fields" block | Tag pills (or "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥") |

**PASS if:** All 6 blocks visible.

---

## Section 2 â€” DynamicRegridStatusCard

### 2-A. Card header

| # | Check | Expected |
|---|-------|----------|
| 33 | Card heading | `à¸ªà¸–à¸²à¸™à¸° Dynamic Regrid` |
| 34 | Subtitle | `à¸­à¹ˆà¸²à¸™à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸”à¸µà¸¢à¸§à¸ˆà¸²à¸ /api/paper-performance Â· à¹„à¸¡à¹ˆà¹€à¸›à¸´à¸”à¸à¸£à¸´à¸”à¹ƒà¸«à¸¡à¹ˆà¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´` |

**PASS if:** Both visible.

---

### 2-B. Safety pills (top right)

| # | Check | Expected |
|---|-------|----------|
| 35 | `à¹€à¸‡à¸´à¸™à¸ˆà¸£à¸´à¸‡` pill | Shows **`à¸›à¸´à¸”`** |
| 36 | `à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¸ˆà¸£à¸´à¸‡` pill | Shows **`à¸›à¸´à¸”`** |
| 37 | `à¸à¸²à¸£à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´` pill | Shows **`à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸­à¸™à¸¸à¸¡à¸±à¸•à¸´`** |
| 38 | `M-0B` pill | Shows **`à¸¢à¸±à¸‡à¸–à¸¹à¸à¸šà¸¥à¹‡à¸­à¸`** |

**PASS if:** All 4 pills present and show correct values.
**FAIL if:** Any pill shows `à¹€à¸›à¸´à¸”` / `à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹à¸¥à¹‰à¸§` / any value other than the BLOCKED state.

> **âš ï¸ This is a safety-critical check. A FAIL here must be escalated immediately and sent to Codex.**

---

### 2-C. Amber description block

| # | Check | Expected |
|---|-------|----------|
| 39 | Amber block line 1 | `à¸£à¸°à¸šà¸šà¸«à¸¢à¸¸à¸”à¹€à¸›à¸´à¸” BUY à¹€à¸žà¸´à¹ˆà¸¡à¹à¸¥à¹‰à¸§ à¹€à¸žà¸£à¸²à¸°à¸£à¸²à¸„à¸²à¸­à¸¢à¸¹à¹ˆà¸™à¸­à¸à¸à¸£à¸­à¸šà¸¥à¹ˆà¸²à¸‡` |
| 40 | Amber block line 2 | `à¸•à¸­à¸™à¸™à¸µà¹‰à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¹‚à¸«à¸¡à¸”à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸à¸£à¸´à¸”à¹ƒà¸«à¸¡à¹ˆà¹à¸šà¸šà¸­à¹ˆà¸²à¸™à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸”à¸µà¸¢à¸§ à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹€à¸›à¸´à¸”à¸à¸£à¸´à¸”à¹ƒà¸«à¸¡à¹ˆà¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´ à¸•à¹‰à¸­à¸‡à¸£à¸­ cooldown / stable candles / regime confirmation` |
| 41 | Red text inside block | `M-0B à¸¢à¸±à¸‡à¸šà¸¥à¹‡à¸­à¸à¹€à¸žà¸£à¸²à¸° closedCycles = {N}` (N = current count) |

**PASS if:** Block visible with correct wording and closedCycles shows a number.

---

### 2-D. Regrid metric grid (8 fields)

| # | Field label | Check |
|---|-------------|-------|
| 42 | `priceVsGrid` | Not blank |
| 43 | `paperLoopState` | Not blank |
| 44 | `lastNoTradeReason` | Not blank |
| 45 | `candidateStatus` | Not blank |
| 46 | `activationAllowed` | Not blank |
| 47 | `cooldownRemaining` | Shows number or "à¸£à¸­à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ cooldown" |
| 48 | `currentPrice` / `gridLower` / `gridUpper` / `gridMid` | Price values visible |
| 49 | `buyFillCount` / `sellFillCount` / `closedCycles` / `stableCandleCount` | Numeric values visible |

**PASS if:** Grid renders with values.

---

### 2-E. Cost Gate Breakdown section â† *Critical OBS-C check*

| # | Check | Expected |
|---|-------|----------|
| 50 | Section heading | `Cost Gate Breakdown` |
| 51 | Section subtitle | `Read-only diagnostic - does not change grid behavior` |
| 52 | Status badge | Visible (e.g. `PASS` / `WARN` / `FAIL`) |
| 53 | **feeGrindRisk label** â† *NEW in this commit* | One of: `no data` / `healthy buffer` / `thin buffer` / **`fee-grind risk`** / `cost gate fail` |
| 54 | `Round-trip cost` field | Shows `X.XXXX%` |
| 55 | `Grid spacing` field | Shows `X.XXXX%` |
| 56 | `Required min spacing` field | Shows `X.XXXX%` |
| 57 | **`Spacing buffer`** field â† *NEW in this commit* | Shows `X.XXx` ratio format (e.g. `1.43x`) |
| 58 | `Cost gate pass` field | `yes` or `no` |
| 59 | Fee-grind risk red block | Red block visible if feeGrindRisk is `FEE_GRIND_RISK` / `THIN_BUFFER` / `COST_GATE_FAIL`. Contains: `Fee-grind risk: spacing may not sufficiently exceed round-trip costs. Cost diagnostic only - does not change grid parameters.` |

**PASS if:** All 10 items visible. feeGrindRisk badge and spacingBufferRatio both render.
**WARNING if:** feeGrindRisk shows `no data` (adapter returned null â€” acceptable).
**FAIL if:** Cost Gate Breakdown section missing entirely, or spacingBufferRatio missing (`â€”` for all metrics is a WARNING, not FAIL).

---

### 2-F. Inventory / One-sided Exposure section â† *OBS-C check*

| # | Check | Expected |
|---|-------|----------|
| 60 | Section heading | `Inventory / One-sided Exposure` |
| 61 | Section subtitle | `Quarantined exposure is not edge evidence` |
| 62 | `one-sided` badge | Amber badge visible if buyFillCount > 0 and sellFillCount = 0 (expected: visible in current M-0Z-6 state) |
| 63 | `quarantined` badge | Visible if oldExposurePolicy contains "QUARANTINE" |
| 64 | Summary text line | `One-sided exposure detected: yes Â· Old exposure is quarantined Â· No force close / no fake closed cycles` |
| 65 | `Buy:Sell fill ratio` | e.g. `3:0` |
| 66 | `Closed cycles` | `0` (expected in current state) |

**PASS if:** Section renders with all fields.
**FAIL if:** "No force close / no fake closed cycles" wording missing.

---

## Section 3 â€” Global Safety Invariants

| # | Check | Expected | Severity |
|---|-------|----------|----------|
| 67 | No "Start Live Trading" button anywhere | Absent | CRITICAL |
| 68 | No "Approve Exchange" button anywhere | Absent | CRITICAL |
| 69 | No "Activate Grid" button anywhere | Absent | CRITICAL |
| 70 | No "Deploy" or "Go Live" button anywhere | Absent | CRITICAL |
| 71 | No "à¸„à¸¥à¸²à¸¢ M-0B" or "Unlock M-0B" button | Absent | CRITICAL |
| 72 | No "Ready to trade" wording | Absent | HIGH |
| 73 | No "Live order" / "Place order" controls | Absent | CRITICAL |
| 74 | Page is read-only â€” clicking anything does not place or cancel orders | Confirmed by reading wording | HIGH |

**PASS if:** None of the above exist anywhere on `/agent-hq`.
**FAIL if:** Any activation/approval/live control is present. â†’ Escalate immediately.

---

## PASS / WARNING / FAIL Summary

| Result | Meaning |
|--------|---------|
| **PASS** | All items in section verified, wording matches |
| **WARNING** | Minor wording diff, or optional field shows `â€”` but section renders; log it, no blocking action needed |
| **FAIL** | Section missing, critical safety pill wrong, or live control visible â†’ escalate to Codex |

---

## Screenshots Needed

Capture and label the following before closing the verification session:

1. `pack-a-regime-card-full.png` â€” Full CanonicalMarketRegimeCard including UNKNOWN/DATA GAP block (or note "not triggered â€” regime is X, freshness is fresh")
2. `pack-a-regime-mismatch-diagnostic.png` â€” Regime mismatch diagnostic section
3. `pack-a-vol-baseline.png` â€” Vol baseline diagnostic section
4. `pack-a-regrid-header-pills.png` â€” DynamicRegridStatusCard header with the 4 safety pills
5. `pack-a-cost-gate-breakdown.png` â€” Cost Gate Breakdown section with feeGrindRisk label and spacingBufferRatio visible
6. `pack-a-inventory-exposure.png` â€” Inventory section with "No force close / no fake closed cycles" wording visible

---

## What to Send Codex If a Bug Is Found

Use this template if any item is FAIL:

```
BUG REPORT â€” R1 Safe Pack A Verification

Commit: 2e5f9fb6b240ae6d75c1905b3b12431930f7df52
Date: 2026-06-13
Page: /agent-hq

FAILED ITEM:
  - Section: [1-C / 2-E / 2-B / etc.]
  - Item #: [number from checklist]
  - Expected: [exact expected text or behavior]
  - Actual: [what was observed â€” screenshot filename or description]

SEVERITY:
  [ ] CRITICAL (safety pill wrong / live control visible / section missing entirely)
  [ ] HIGH (wording missing / new field not rendering)
  [ ] MEDIUM (minor diff / optional field)

FILES TO INVESTIGATE (likely):
  - dashboard/components/trading-agent-hq/CanonicalMarketRegimeCard.tsx
  - dashboard/components/trading-agent-hq/DynamicRegridStatusCard.tsx
  - dashboard/lib/trading-agent-hq/adapter.ts
  - dashboard/lib/trading-agent-hq/viewModel.ts
  - dashboard/app/api/paper-performance/route.ts

DO NOT:
  - Change safety pill values
  - Change trading behavior
  - Enable live trading, order placement, or exchange approval
  - Modify M-0B block status
  - Change regime thresholds or grid parameters

FIX SCOPE: UI rendering fix only. Read-only diagnostic display only.
```

---

*Classification: OPERATOR_VERIFICATION_ONLY â€” not for live trading decisions*
*Safety tier: Paper-only Â· M-0B BLOCKED Â· Phase M-0Z-6*
