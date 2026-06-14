# D5.1-c — Fill Quality Gate (analysis + handoff)

> Analysis / design / handoff only. No git, no commit, no push, no deploy, no runtime JSON/JSONL edits, no env/cron/scripts edits.
> No trading-logic / entry / stop / target / RR-math / RR-threshold / detector / runner / execution change.
> M-0B BLOCKED · Phase 2-B BLOCKED · live/order/exchange OFF.
> Verified against working tree. Generated 2026-06-14. **Codex: do NOT implement yet.**

## 1. D5.1-c runtime interpretation

**`status = PARTIAL`** means D5.1-b is fully working: candles wired, resolver running, some snapshots reached terminal states while others remain pending. `totalResolvable=10`, `pending` = the rest of `geometryReadyCount`/exact samples still awaiting ≥12 future 15M bars.

**What `filled=0, missed=10, invalidationFirst=0, missedFillRate=1.0` actually says:** in the resolver, `MISSED` = the future window (12×15M ≈ 3h) elapsed and price touched **neither** the entry nor the invalidation. `invalidationFirst=0` confirms invalidation wasn't hit either. So for all 10 resolved counterfactuals, **price never returned to the exact entry zone at all** within the window.

**Why this is important:** earlier turns showed exact RR geometry looked excellent on paper (`exactAvgNetRR ≈ 3.6`). D5.1-c reveals the catch the shadow system was built to expose — **a high-RR zone that price never reaches is not actionable.** 100% missed-fill on the resolved set means these "great RR" entries would not have filled. This is exactly the counterfactual signal we wanted: *paper RR ≠ reachable RR*.

**Why it is explainable, not a system failure:** `canonicalMarketRegime=DOWNTREND`, `priceVsGrid=BELOW_GRID`, `trendStrategy.status=RISK_REJECTED`, `dynamicGrid=PAUSE_EXPOSURE_LIMIT`. In a downtrend with price below grid, long-pullback / OB-FVG entry zones sit above price and simply aren't revisited within 3h. The resolver is behaving correctly; the regime explains the 100% miss.

**Why this is NOT yet trade-logic evidence (either direction):**
- **Tiny sample:** 10 resolved counterfactuals.
- **Single-regime:** all from one DOWNTREND / BELOW_GRID window — concluding "geometry is bad" would be curve-fitting to one regime; concluding "geometry is good" is impossible (0 fills).
- **Counterfactual, not executed:** no real entry, no closed trade (`closedCycles=0`, `trendClosedTrades=0`). It measures *would-the-zone-have-been-touched*, not P&L.
- It is **read-only shadow evidence** and must stay observability-only. It cannot unlock, gate, or modify any trade path.

## 2. Fill quality state machine (read-only, derived)

```
            ┌─ candlesByTimeframe == null ──────────────► NOT_CONFIGURED
            ├─ candles present but empty ───────────────► NO_CANDLES
            ├─ totalResolvable == 0 (all pending) ──────► PENDING
            ├─ 0 < totalResolvable < MIN_RESOLVED ──────► INSUFFICIENT_RESOLVED_SAMPLE
            ├─ totalResolvable >= MIN_RESOLVED:
            │     ├─ missedFillRate >= 0.8 ─────────────► HIGH_MISSED_FILL_RATE
            │     ├─ 0.5 <= missedFillRate < 0.8 ───────► WARNING_MISSED_FILL_RATE
            │     └─ missedFillRate < 0.5 ──────────────► PASS_FILL_QUALITY
```

This is a **new derived field** (`fillQualityState`) layered on the existing `fillResolution` numbers. It does **not** replace or alter `fillResolution.status` or the resolver. It is mapped at the summary/presentation layer.

**Current runtime → `HIGH_MISSED_FILL_RATE`** (totalResolvable=10 ≥ floor, missedFillRate=1.0 ≥ 0.8).

## 3. Exact thresholds (+ required caveats)

| State | Rule |
|---|---|
| NOT_CONFIGURED | `fillResolution.status == NOT_CONFIGURED` |
| NO_CANDLES | `fillResolution.status == NO_CANDLES` |
| PENDING | `totalResolvable == 0` |
| INSUFFICIENT_RESOLVED_SAMPLE | `0 < totalResolvable < MIN_RESOLVED` (MIN_RESOLVED = 10) |
| HIGH_MISSED_FILL_RATE | `totalResolvable >= 10 && missedFillRate >= 0.8` |
| WARNING_MISSED_FILL_RATE | `totalResolvable >= 10 && 0.5 <= missedFillRate < 0.8` |
| PASS_FILL_QUALITY | `totalResolvable >= 10 && missedFillRate < 0.5` |

**⚠️ Caveat 1 — name/threshold collision (must read).** An existing `warningFlags` entry is *already* named `HIGH_MISSED_FILL_RATE` and fires at `missedFillRate >= 0.5` (see `exactZoneComparisonSummary.ts`, warning-flag block). The new gate proposes `HIGH` at `>= 0.8` and `WARNING` at `0.5–0.8`. To avoid conflict:
- Keep the existing `warningFlags` logic **unchanged** (do not retune 0.5 — that would be "changing logic").
- Name the new field distinctly, e.g. `fillQualityState`, so it never overwrites the existing flag. At missedFillRate=0.6 the raw flag still says HIGH while `fillQualityState` says WARNING — that divergence is intentional (raw alert vs operator gate).

**⚠️ Caveat 2 — sample is the real limiter.** `MIN_RESOLVED=10` is a floor for *computability*, not for *trust*. All 10 are single-regime. Recommend the gate also expose a `sampleConfidence` qualifier and only let `PASS_FILL_QUALITY` read as **SUPPORTIVE** after a larger, multi-regime set (suggest `>= 30` resolved AND `>= 2` distinct regimes). Below that, `PASS_FILL_QUALITY` should display as "preliminary, single-regime — not conclusive."

## 4. Confidence impact (display-only)

| fillQualityState | confidenceImpact | meaning (display only) |
|---|---|---|
| HIGH_MISSED_FILL_RATE | **DOWNGRADE** | geometry not actionable on current sample |
| WARNING_MISSED_FILL_RATE | **WATCH** | mixed reachability — monitor |
| INSUFFICIENT_RESOLVED_SAMPLE / PENDING / NO_CANDLES / NOT_CONFIGURED | **NEUTRAL** | not enough to judge |
| PASS_FILL_QUALITY | **SUPPORTIVE** (only with ≥30 resolved & ≥2 regimes; else "preliminary") | zones generally reached |

**Hard invariant:** `confidenceImpact` is a label shown to the operator. It must **not** unlock trading, change entry/stop/target, change RR threshold, or trigger execution. Current runtime → **DOWNGRADE**.

## 5. UI copy (exact strings)

- Header (HIGH): `High missed-fill rate — exact RR geometry is not actionable yet`
- `Resolved fill sample: {totalResolvable}` → `Resolved fill sample: 10`
- `Missed fill rate: {pct}` → `Missed fill rate: 100%`
- Disclaimer line 1: `RR geometry is not activation evidence`
- Disclaimer line 2: `Read-only shadow evidence`
- Sample caveat (when single-regime / <30): `Preliminary — small single-regime sample, not conclusive`
- PENDING state: `Awaiting future candles — fill quality not yet resolvable`
- INSUFFICIENT: `Resolved fill sample below threshold (n={totalResolvable}/10) — collecting`

## 6. Codex handoff (display/readiness-only) — ⏸ PREPARED, DO NOT IMPLEMENT YET

**เป้าหมาย:** เพิ่ม derived `fillQualityState` + `confidenceImpact` (display-only) จากตัวเลข `fillResolution` ที่มีอยู่ และแสดงใน MtfObFvgShadowCard เป็น read-only shadow evidence — ห้ามแตะ resolver / trade path

**Likely file list:**
- `dashboard/lib/trend/exactZoneComparisonSummary.ts` — เพิ่ม pure mapper `deriveFillQualityState(fillResolution)` คืน `{ fillQualityState, confidenceImpact, sampleConfidence }` (อย่าแตะ `resolveOneFill`/`computeFillResolution`/`priceTouched`/warningFlags เดิม)
- `dashboard/components/trading-agent-hq/MtfObFvgShadowCard.tsx` — แสดง state + UI copy (§5)
- `*.test.ts` คู่กัน

**Tests:**
1. status NOT_CONFIGURED/NO_CANDLES → ส่งผ่านตรง ๆ
2. totalResolvable=0 → PENDING
3. totalResolvable=9 → INSUFFICIENT_RESOLVED_SAMPLE
4. totalResolvable=10, missedFillRate=1.0 → HIGH_MISSED_FILL_RATE → DOWNGRADE (เคสปัจจุบัน)
5. totalResolvable=10, missedFillRate=0.6 → WARNING → WATCH
6. totalResolvable=10, missedFillRate=0.3 → PASS_FILL_QUALITY → SUPPORTIVE (แต่ flag preliminary ถ้า <30 หรือ 1 regime)
7. ยืนยัน warningFlags เดิมไม่เปลี่ยน (HIGH_MISSED_FILL_RATE ที่ 0.5 ยังอยู่)
8. confidenceImpact ไม่ถูกอ่านโดย runner/decision path (grep)

**Safety grep (ต้องผ่านก่อน merge):**
```
grep -rn "fillQualityState\|confidenceImpact" dashboard/lib dashboard/app | grep -i "runner\|decision\|execut\|order\|activat\|entry\|stop\|target"
# ต้องได้ผลลัพธ์ว่าง — field ใหม่ห้ามถูกอ้างใน trade path
grep -rn "resolveOneFill\|computeFillResolution\|priceTouched" dashboard/lib/trend/exactZoneComparisonSummary.ts
# ต้องไม่มี diff ใน 3 ฟังก์ชันนี้
```

**Commit message:**
```
feat(trend-shadow): add read-only fillQualityState + confidenceImpact display (D5.1-c)

- derive fillQualityState/confidenceImpact from existing fillResolution counters
- MtfObFvgShadowCard shows missed-fill quality as read-only shadow evidence
- no change to resolver, warningFlags, RR math, runner, or execution
- observability-only; does not unlock trading
```

**ข้อห้าม:** read-only/display เท่านั้น — ห้ามแก้ resolver, warningFlags threshold (0.5), RR math, entry/stop/target, runner, execution; field ใหม่ห้าม feed decision path

**Classification:** `D5_1C_FILL_QUALITY_HANDOFF_READY` (design พร้อม — รอ trigger ค่อยให้ Codex ลงมือ)

## 7. What must wait
- **No trading logic** until `closedCycles ≥ 1` or `trendClosedTrades ≥ 1` (ยัง 0/0).
- **No OB/FVG execution** until fill quality ดีขึ้นบน sample ที่มีความหมาย (≥30 resolved, หลาย regime, missedFillRate < 0.5) — ตอนนี้ 100% missed บน 10 ตัว single-regime.
- **No grid/regrid activation** ขณะ M-0B BLOCKED (และ dynamicGrid=PAUSE_EXPOSURE_LIMIT).
- **No live/order/exchange** (`paper/live/exchangeActivationAllowed=false` ทุกตัว).
- **PASS_FILL_QUALITY ห้ามตีความเป็น SUPPORTIVE** จนกว่า sample จะใหญ่พอและข้าม regime.

## Final classification
- Design/handoff: **`D5_1C_FILL_QUALITY_HANDOFF_READY`**
- Runtime evidence: **`D5_1C_NEEDS_MORE_RESOLVED_SAMPLE`** (10 resolved, single DOWNTREND/BELOW_GRID regime, 100% missed — not conclusive)
- **NOT `D5_1C_RUNTIME_FAIL`** — resolver is correct; 100% miss is a valid, explainable observation, not a defect.
- Overall: **`WAIT_FOR_RUNTIME_EVIDENCE`**

## Final recommendation
Treat D5.1-c as **PASS for the pipeline, DOWNGRADE for the geometry's current actionability.** Hold the Codex display patch as prepared (don't implement yet); release it when you want the operator-facing quality label. Keep collecting resolved samples across regimes — the key watch is whether `missedFillRate` stays high once price re-enters/grid un-pauses (RANGE / price INSIDE_GRID), or whether 100% miss was a downtrend artifact. Do not let any of this touch the trade path. M-0B / Phase 2-B / live / grid-regrid / adaptive-RR / OB-FVG execution remain OFF.
