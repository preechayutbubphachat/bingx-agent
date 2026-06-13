# R0-OBS-C Codex Handoff — Cost Gate Breakdown + Inventory Clarity
**Date**: 2026-06-13  
**Phase**: M-0Z-6 Paper Simulation (read-only observability only)  
**Classification**: `OBSC_HANDOFF_READY`

---

## ⚠️ Pre-flight: OBS-B Already Implemented

Before starting: **OBS-B is fully done**. `RegimeDiagnosticVM`, `VolBaselineDiagnosticVM`,
adapter mappings, and `CanonicalMarketRegimeCard` rendering are already in the codebase.
Do NOT re-implement OBS-B. The `R0_OBSB_HANDOFF_2026-06-13.md` doc is now obsolete.

---

## Scope

Two items only:

| Item | Target | Type |
|------|--------|------|
| OBS-04 | Cost gate breakdown (fee / slippage / funding / spacing / roundTrip) | ViewModel + adapter + UI |
| OBS-05 | Inventory / one-sided exposure clarity | UI-only (no ViewModel changes) |

---

## Hard Safety Constraints (NEVER violate)

- Read-only observability ONLY — no trading logic changes
- Do NOT run git / commit / push / deploy
- Do NOT modify runtime JSON/JSONL files
- Do NOT touch env/secrets
- Do NOT enable live trading, order placement, or exchange approval
- Do NOT change `reward_risk_min`, `TREND_PAPER_MIN_REWARD_RISK`
- Do NOT change entry/detector thresholds
- Do NOT change grid spacing, order size, or regrid behavior
- Do NOT enable adaptive RR or OB/FVG execution
- M-0B remains BLOCKED
- Phase 2-B remains BLOCKED
- Do NOT implement OBS-03 hysteresis

---

## OBS-04: Cost Gate Breakdown

### Gap Analysis

**What exists today in `PaperVM`:**
```typescript
costGateStatus: "PASS" | "WARNING" | "FAIL" | "UNKNOWN";  // only status — no breakdown
```

**What's already available in the data pipeline (no new computation needed):**

From `perf.costGate` (already read as `const costGate = obj(perf.costGate)` at adapter.ts line 82):
- `costGate.roundTripCostPct` — round-trip fee+slippage estimate as %
- `costGate.gridSpacingPct` — current grid spacing as %
- `costGate.requiredMinSpacingPct` — minimum spacing required to pass
- `costGate.pass` — boolean
- `costGate.warning` — boolean
- `costGate.nextAction` — string (operator guidance)

From `perf` top-level (same `perf` object, `...report` spread in route response):
- `perf.feeEstimateTotal` — total fee estimate (number | null)
- `perf.slippageEstimateTotal` — total slippage estimate (number | null)
- `perf.fundingEstimateTotal` — total funding estimate (number | null)

From `loop.trendPaperConfigPublic` (already in adapter at lines 277–281):
- `obj(loop.trendPaperConfigPublic).feePct` — fee % from env (read-only display)
- `obj(loop.trendPaperConfigPublic).slippagePct` — slippage % from env (read-only display)

**What's missing:**
- Per-regime cost breakdown → NOT available in existing data (no `attribution.byRegime` with cost gate). **Skip for now — OBS-04 scoped to global breakdown only.**
- Spread estimate → NOT in existing data. **Skip.**

### Implementation Plan

**4 files to edit:**

---

#### File 1: `dashboard/lib/trading-agent-hq/viewModel.ts`

**Add new interface** (place after `TrendPaperConfigPublicVM`, around line 96):

```typescript
// OBS-04: cost gate breakdown (read-only observability)
export interface CostGateBreakdownVM {
  roundTripCostPct: number | null;
  gridSpacingPct: number | null;
  requiredMinSpacingPct: number | null;
  pass: boolean | null;
  warning: boolean | null;
  nextAction: string | null;
  feeEstimateTotal: number | null;
  slippageEstimateTotal: number | null;
  fundingEstimateTotal: number | null;
  feePctConfig: number | null;
  slippagePctConfig: number | null;
}
```

**Add field to `PaperVM`** (after `costGateStatus` line, around line 59):

```typescript
  costGateStatus: "PASS" | "WARNING" | "FAIL" | "UNKNOWN";
  costGateBreakdown: CostGateBreakdownVM;   // OBS-04
```

---

#### File 2: `dashboard/lib/trading-agent-hq/adapter.ts`

**In `mapPaper()` function**, after `const costGate = obj(perf.costGate);` (line 82), no new reads needed — all data already accessible.

**In the return object**, after `costGateStatus: mapCostGateStatus(...)` (line 130), add:

```typescript
    costGateBreakdown: {
      roundTripCostPct: numOrNull(costGate.roundTripCostPct),
      gridSpacingPct: numOrNull(costGate.gridSpacingPct),
      requiredMinSpacingPct: numOrNull(costGate.requiredMinSpacingPct),
      pass: boolOrNull(costGate.pass),
      warning: boolOrNull(costGate.warning),
      nextAction: strOrNull(costGate.nextAction),
      feeEstimateTotal: numOrNull(perf.feeEstimateTotal),
      slippageEstimateTotal: numOrNull(perf.slippageEstimateTotal),
      fundingEstimateTotal: numOrNull(perf.fundingEstimateTotal),
      feePctConfig: numOrNull(obj(loop.trendPaperConfigPublic).feePct),
      slippagePctConfig: numOrNull(obj(loop.trendPaperConfigPublic).slippagePct),
    },
```

**Note**: `loop` is already `obj(perf.paperLoopDiagnostics)` (line 83). `perf` is the top-level `perf` argument.

---

#### File 3: `dashboard/components/trading-agent-hq/DynamicRegridStatusCard.tsx`

Add a cost gate breakdown section at the bottom of the card (after the existing candidate/cooldown row). This is the correct card because it already shows grid health.

**Add after the final `<div className="mt-3 rounded-md border ...">` section (line 98–104):**

```tsx
      {/* OBS-04: Cost gate breakdown */}
      <div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2">
        <div className="text-[11px] font-black text-[#5b4432]">Cost Gate Breakdown</div>
        <div className="text-[10px] font-bold text-[#80644c]">
          อ่านอย่างเดียว — ไม่เปลี่ยนพฤติกรรมกริด
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="roundTripCostPct"
            value={paper.costGateBreakdown.roundTripCostPct != null
              ? `${paper.costGateBreakdown.roundTripCostPct.toFixed(4)}%`
              : "—"}
          />
          <Metric
            label="gridSpacingPct"
            value={paper.costGateBreakdown.gridSpacingPct != null
              ? `${paper.costGateBreakdown.gridSpacingPct.toFixed(4)}%`
              : "—"}
          />
          <Metric
            label="requiredMinSpacingPct"
            value={paper.costGateBreakdown.requiredMinSpacingPct != null
              ? `${paper.costGateBreakdown.requiredMinSpacingPct.toFixed(4)}%`
              : "—"}
          />
          <Metric
            label="costGate pass"
            value={paper.costGateBreakdown.pass === true
              ? "✓ ผ่าน"
              : paper.costGateBreakdown.pass === false
                ? "✗ ไม่ผ่าน"
                : "—"}
          />
          <Metric
            label="feePctConfig"
            value={paper.costGateBreakdown.feePctConfig != null
              ? `${paper.costGateBreakdown.feePctConfig}%`
              : "—"}
          />
          <Metric
            label="slippagePctConfig"
            value={paper.costGateBreakdown.slippagePctConfig != null
              ? `${paper.costGateBreakdown.slippagePctConfig}%`
              : "—"}
          />
          <Metric
            label="feeEstimateTotal"
            value={paper.costGateBreakdown.feeEstimateTotal != null
              ? `$${paper.costGateBreakdown.feeEstimateTotal.toFixed(4)}`
              : "—"}
          />
          <Metric
            label="fundingEstimateTotal"
            value={paper.costGateBreakdown.fundingEstimateTotal != null
              ? `$${paper.costGateBreakdown.fundingEstimateTotal.toFixed(4)}`
              : "—"}
          />
        </div>
        {paper.costGateBreakdown.nextAction ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-950">
            {paper.costGateBreakdown.nextAction}
          </div>
        ) : null}
      </div>
```

---

#### File 4 (Optional — if TypeScript strict check requires it): `dashboard/app/public/page.tsx`

No change expected here — `DynamicRegridStatusCard` receives `paper` prop which already includes the new field once ViewModel and adapter are updated.

---

## OBS-05: Inventory / One-sided Exposure Clarity

### Gap Analysis

**What exists today in `DynamicRegridStatusCard.tsx`:**
- `buyFillCount`, `sellFillCount`, `closedCycles` — ✅ shown
- `regridExposureLabel(regrid)` — ✅ already shows one-sided exposure text:
  - "มี BUY ค้างฝั่งเดียว ยังไม่มี SELL" when `buyFillCount > 0 && sellFillCount === 0`
  - "มี SELL ค้างฝั่งเดียว ยังไม่มี BUY" when `sellFillCount > 0 && buyFillCount === 0`
- `priceVsGrid`, `paperLoopState`, `candidate` — ✅ shown

**What's missing from current UI (data already in `PaperVM`, no ViewModel changes needed):**

1. **Cumulative fill counts** — `paper.runtimeMonitor.cumulativeBuyFillCount` and
   `paper.runtimeMonitor.cumulativeSellFillCount` are in the ViewModel but NOT displayed.
   These show total fills across all samples (vs. sample-only counts in `dynamicRegrid`).

2. **Old exposure policy** — `paper.paperEpoch.oldExposurePolicy: string[]` not shown anywhere.
   This is the quarantine policy label (e.g., `["QUARANTINE_OLD_GRID_EXPOSURE"]`).

3. **Imbalance ratio** — No numeric buy:sell ratio shown. Would help diagnose "5 buy : 0 sell"
   at a glance without reading both numbers.

### Implementation Plan

**1 file to edit:**

---

#### File: `dashboard/components/trading-agent-hq/DynamicRegridStatusCard.tsx`

**Add to the existing metrics grid** (the `lg:grid-cols-4` section at line 84–96):

```tsx
        <Metric
          label="cumulativeBuyFillCount"
          value={paper.runtimeMonitor.cumulativeBuyFillCount}
        />
        <Metric
          label="cumulativeSellFillCount"
          value={paper.runtimeMonitor.cumulativeSellFillCount}
        />
```

**Add old exposure policy** (after the Exposure line at line 98–104):

```tsx
      {paper.paperEpoch.oldExposurePolicy.length > 0 ? (
        <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-2 py-1.5 text-[11px] font-black text-orange-900">
          <span className="text-[#2f241b]">Old Exposure Policy: </span>
          {paper.paperEpoch.oldExposurePolicy.join(", ")}
        </div>
      ) : null}
```

**Add imbalance ratio badge** (inline in the existing Exposure line, after `regridExposureLabel(regrid)`):

```tsx
      <div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2 text-[11px] leading-relaxed text-[#6d5745]">
        <span className="font-black text-[#2f241b]">Exposure: </span>
        {regridExposureLabel(regrid)}
        <span className="mx-2 text-[#b08a5a]">·</span>
        <span className="font-black text-[#2f241b]">Buy:Sell = </span>
        {regrid.buyFillCount}:{regrid.sellFillCount}
        {(regrid.buyFillCount > 0 && regrid.sellFillCount === 0) ||
         (regrid.sellFillCount > 0 && regrid.buyFillCount === 0) ? (
          <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-800">
            ⚠ one-sided
          </span>
        ) : null}
        <span className="mx-2 text-[#b08a5a]">·</span>
        <span className="font-black text-[#2f241b]">candidateReason: </span>
        {candidate.candidateReason ?? "ยังไม่มีข้อมูล candidate reason"}
      </div>
```

---

## Safety Verification

### Grep before submitting (Codex must run all of these — pass = safe)

```bash
# ห้ามมีการเปิด order จริง
grep -r "placeOrder\|submitOrder\|createOrder\|live_order" \
  dashboard/lib/trading-agent-hq/adapter.ts \
  dashboard/lib/trading-agent-hq/viewModel.ts \
  dashboard/components/trading-agent-hq/DynamicRegridStatusCard.tsx

# ห้ามแก้ตัวแปร grid spacing หรือ reward risk
grep -r "gridSpacingPct\s*=" dashboard/lib/trading-agent-hq/
grep -r "reward_risk_min\|TREND_PAPER_MIN_REWARD_RISK" \
  dashboard/lib/trading-agent-hq/adapter.ts

# ยืนยันว่า costGateBreakdown ไม่ได้แก้ costGate logic
grep -r "costGate\." dashboard/lib/trading-agent-hq/adapter.ts | grep -v "numOrNull\|strOrNull\|boolOrNull\|obj(\|str(\|bool("
```

All greps above must return **zero results** for the first two patterns. The third is informational.

### TypeScript check

```bash
cd dashboard && npx tsc --noEmit
```

Must pass with zero errors.

---

## Files Summary

| File | Change | Type |
|------|--------|------|
| `dashboard/lib/trading-agent-hq/viewModel.ts` | Add `CostGateBreakdownVM` interface + `costGateBreakdown` field on `PaperVM` | OBS-04 |
| `dashboard/lib/trading-agent-hq/adapter.ts` | Map 11 cost gate fields in `mapPaper()` return | OBS-04 |
| `dashboard/components/trading-agent-hq/DynamicRegridStatusCard.tsx` | Cost gate breakdown section (OBS-04) + cumulative fills + exposure policy + imbalance ratio (OBS-05) | OBS-04+05 |

**No other files should be touched.**

---

## Test Checklist

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] Dashboard loads at `/public` without crash
- [ ] DynamicRegridStatusCard shows "Cost Gate Breakdown" section
- [ ] `roundTripCostPct` displays as formatted `%` (or `—` if null)
- [ ] `gridSpacingPct` displays as formatted `%` (or `—` if null)
- [ ] `costGate pass` shows "✓ ผ่าน" or "✗ ไม่ผ่าน" (not blank)
- [ ] `feePctConfig` and `slippagePctConfig` show env-derived values (from trendPaperConfigPublic)
- [ ] `cumulativeBuyFillCount` and `cumulativeSellFillCount` appear in the metrics grid
- [ ] `Buy:Sell = X:Y` shows correct counts
- [ ] "⚠ one-sided" badge appears when `buyFillCount > 0 && sellFillCount === 0` (or vice versa)
- [ ] Old exposure policy block shows when `paperEpoch.oldExposurePolicy` is non-empty
- [ ] `nextAction` from costGate shows as amber warning block when present
- [ ] All safety greps return zero results for restricted patterns
- [ ] No live trading / order / exchange fields touched
- [ ] `M-0B remains BLOCKED` pill still shows in card

---

## Commit Message

```
obs(OBS-04+05): add cost gate breakdown + inventory clarity [read-only]

OBS-04: expose roundTripCostPct, gridSpacingPct, requiredMinSpacingPct,
feePctConfig, slippagePctConfig, feeEstimateTotal, fundingEstimateTotal
in new CostGateBreakdownVM (viewModel.ts) — mapped from existing
perf.costGate + perf.trendPaperConfigPublic in adapter.ts.
UI: DynamicRegridStatusCard cost gate breakdown section.

OBS-05: surface cumulativeBuyFillCount/cumulativeSellFillCount from
runtimeMonitor, one-sided imbalance ratio badge (Buy:Sell = X:Y),
and paperEpoch.oldExposurePolicy in DynamicRegridStatusCard.
No ViewModel or adapter changes for OBS-05.

Read-only observability — no trading logic changed.
M-0B BLOCKED. Phase 2-B BLOCKED. No order placement.
```

---

## Final Classification

**`OBSC_HANDOFF_READY`**

All source data for OBS-04 and OBS-05 is already in the existing data pipeline.
No new API calls, no new JSON reads, no new env vars required.
Changes are purely additive (new ViewModel type + adapter mapping + UI display).
