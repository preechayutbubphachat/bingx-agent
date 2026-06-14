# D5.1 — Post-Geometry Work Queue

> Analysis / design / handoff only. No git, no commit, no deploy, no runtime mutation.
> Verified against working tree (commit context: 91bdb31 D5.1-a). Generated 2026-06-14.
> M-0B BLOCKED · Phase 2-B BLOCKED · live/order/exchange/adaptive-RR/OB-FVG-exec all remain OFF.

## 1. Executive summary

D5.1-a (geometry capture) is **confirmed present and correctly wired** in the working tree:
`exactZone.fillResolutionInput { direction, entry, invalidation, target, timeframe, capturedAt, source:"D5_1_FILL_RESOLUTION_INPUT_V1" }` is written by the route, persisted by the snapshot builder, and consumed by `normalizeSnapshot()`, which now derives `entry/invalidation/target/direction` from it and emits the three counters (`fillResolutionInputSamples`, `fillResolutionInputMissing`, `fillResolutionGeometryReadyCount`). The fill-resolution algorithm (`resolveOneFill`/`computeFillResolution`/`priceTouched`) is untouched and still gated by `candlesByTimeframe == null → NOT_CONFIGURED`.

Two items are **safe to hand to Codex now** (C: CostGate spacing observability, D: Winrate NO_DATA/LOW_SAMPLE shell) — both are display/data-threading over fields that already exist, zero trading-logic surface. Candle wiring (B) is **design-ready but execution-gated**: it needs (a) a contiguity/coverage guard to avoid gap-misalignment, and (b) real geometry-ready samples to test against, which only accrue after A's deploy. Post-deploy verification (A) is an **operator checklist, ready to run**, but the PASS/FAIL verdict needs runtime evidence.

## 2. Workstream classifications

| WS | Topic | Classification | Codex now? |
|---|---|---|---|
| A | D5.1-a post-deploy verify | **D5_1A_POST_DEPLOY_VERIFY_READY** (verdict → NEEDS_RUNTIME_EVIDENCE) | No (operator) |
| B | Candle wiring feasibility | **D5_1B_WAIT_FOR_GEOMETRY_SAMPLES** (design ready, +mandatory contiguity guard) | No — gate on A |
| C | CostGate gridSpacingPct | **COST_GATE_SPACING_OBSERVABILITY_HANDOFF_READY** | ✅ Yes |
| D | Winrate readiness shell | **WINRATE_NO_DATA_SHELL_HANDOFF_READY** | ✅ Yes |
| E | Priority ranking | see §3 ranking | — |

**Queue status: `D5_1_POST_GEOMETRY_QUEUE_COMPLETE` + `COST_GATE_HANDOFF_READY` + `WINRATE_SHELL_HANDOFF_READY` + `WAIT_FOR_RUNTIME_EVIDENCE` (A verdict, B execution).**

## 3. Top findings

1. **Geometry capture is real and parser-guarded.** `normalizeSnapshot` only accepts `fillResolutionInput` when `schemaVersion===1 && source==="D5_1_FILL_RESOLUTION_INPUT_V1"` and entry/invalidation/target are finite + direction∈{LONG,SHORT}. Old records (no geometry) → `hasFillResolutionInput=false`, `fillResolutionGeometryReady=false` → they stay PENDING. Safe.
2. **`fillResolution.status` will stay `NOT_CONFIGURED` until B.** The report path `summarizeExactZoneComparison(records)` at `trendEvidenceDecisionLog.ts:336` passes **no** `candlesByTimeframe`. Geometry-ready ≠ fill-resolved — A measures geometry only.
3. **Candle source is a rolling window, not a retained series.** Candles come from `getCandlesFromSnapshot(latest.marketSnapshot, "15M")` — ~200 bars (~50h of 15m). `resolveOneFill` filters `candleTime > capturedAt` then `slice(0, lookahead)` but does **not** verify the window actually covers the bars *immediately* after `capturedAt`. For a snapshot older than the window start, "first candles after capturedAt" are the oldest *retained* bars (a time gap) → a wrong fill could be produced. This is the central B risk.
4. **CostGate UI already handles NO_DATA.** `CostGatePanel.tsx` renders `gridSpacingPct===null → "—"` and `status:"unknown"`. The only gap is data: `dynamicGrid` computes `spacingPct` (lines 97/264) but it is never threaded into the costGate object (`costGate?: { pass, requiredMinSpacingPct }` — no spacing field). Pure observability plumbing.
5. **WinrateCard already exists with a no-data branch** (`!data.has_data`). `/api/winrate` reads `plan_history.jsonl`, splits OB/TREND totals. It does **not** expose grid `closedCycles`. The task's explicit tiering (NO_DATA / LOW_SAMPLE / 30 / 100) is presentation logic to add over existing totals; grid-cycle tier needs a `closedCycles` source (exists in `paperLoopDiagnostics`/`paper-performance`, not yet in winrate API).

---

## WORKSTREAM A — D5.1-a post-deploy verification (operator checklist)

**API to poll:** `GET /api/internal/trend-paper-evidence-cycle` → `exactZoneComparisonSummary`.

**Fields to collect each check:**
`exactSamples`, `fillResolutionInputSamples`, `fillResolutionInputMissing`, `fillResolutionGeometryReadyCount`, `fillResolution.status`, `dominantExactStatus`, `dominantExactReadiness`.

**Minimum cycles to wait:** cadence = 15 min/cycle. Wait **≥ 5 cycles (~75 min)** for a first signal; **10–20 cycles (~2.5–5 h)** for a stable read. Only cycles that run *after deploy* can raise geometry counters.

**PASS** (geometry capture working):
- After N new post-deploy cycles, `fillResolutionGeometryReadyCount` increases by ~N (allowing for cycles where direction/entry/invalidation/target were legitimately null, e.g. NO_DATA regimes).
- `fillResolutionInputSamples` rises in step with new exact samples.
- `fillResolutionInputMissing` stays low and is explainable (NO_DATA / non-actionable cycles).
- `fillResolution.status` remains `NOT_CONFIGURED` (expected — candles not wired yet). **This is a PASS, not a fail.**

**WARNING:**
- Geometry counters flat while `exactSamples` rises → geometry not being captured on actionable cycles (check route geometry source).
- `fillResolutionInputMissing` ≈ all new samples → entry/stop/target arriving null at write time.

**FAIL:**
- Parser/schema error, summary throws, or counters absent from payload → schema/deploy mismatch; roll back review.
- `fillResolution.status` flips to `RESOLVED/PARTIAL` **without** B being implemented → unexpected candle path; investigate before trusting.

**Screenshots to capture:** (1) Operator/Evidence card showing the three counters + `exactSamples`; (2) CostGate panel (for WS-C baseline); (3) the raw `exactZoneComparisonSummary` JSON block.

**Verdict tag:** plan = `D5_1A_POST_DEPLOY_VERIFY_READY`; data verdict = `D5_1A_NEEDS_RUNTIME_EVIDENCE` until ≥5 post-deploy cycles collected.

---

## WORKSTREAM B — Candle wiring feasibility (design ready, execution gated)

**Q1 — Can current rolling 200 candles be used safely for new snapshots?**
Yes, **only for snapshots whose `capturedAt` falls inside the retained window AND whose immediately-following bar is present** (window earliest-candle-time ≤ capturedAt). For fresh snapshots this is true ~3 h after capture (lookahead 12×15m). Not safe for any snapshot older than the window start.

**Q2 — Limitations:**
- Coverage ≈ last ~48 h of 15m bars only; older snapshots are unresolvable → must stay PENDING.
- Window is overwritten each refresh; no durable history → a snapshot missed during its resolvable window is PENDING forever.
- Single timeframe (15M) — matches resolver default; fine.
- **Gap-misalignment risk** (finding #3) must be guarded.

**Q3 — If richer history needed later:** minimal retention = append-only 15M candle log in `tmp/` keyed by time, pruned to cover `max(snapshot age to resolve) + lookahead`. Defer until rolling-window wiring proves insufficient.

**Q4 — `fillResolution.status` target after wiring:**
`NOT_CONFIGURED` (no candles passed) → `NO_CANDLES` (candles arg present but empty) → `PENDING` (no resolvable samples yet / insufficient future bars) → `PARTIAL` (some resolved, some pending) → `RESOLVED` (all resolvable resolved). Old/uncovered records contribute to `pending`.

**Q5 — Safe wiring plan (the next Codex patch, AFTER A shows geometryReadyCount ≥ ~5):**
1. Add a read-only candle provider that builds `candlesByTimeframe` from the **same** `getCandlesFromSnapshot(marketSnapshot,"15M")` already used at cycle time (no new fetch, no external API).
2. Pass it into `summarizeExactZoneComparison(records, { candlesByTimeframe })` at `trendEvidenceDecisionLog.ts:336`.
3. **Add a coverage guard (additive — do NOT alter `resolveOneFill`/`priceTouched` matching):** before resolving a snapshot, require `min(candleTime) <= capturedAt`. If not, classify that snapshot PENDING. Implement as a thin pre-check helper so the core matcher stays byte-identical.

**Tests:** snapshot inside window + contiguous → resolves; snapshot older than window start → PENDING (guard); empty candle array → NO_CANDLES; future.length < lookahead → PENDING; geometry-missing record → PENDING; no candle with `t <= capturedAt` is ever read for the match decision.

**Classification:** `D5_1B_WAIT_FOR_GEOMETRY_SAMPLES` — hand off only after A confirms geometry-ready samples exist; ship with the contiguity guard mandatory.

---

## WORKSTREAM C — CostGate gridSpacingPct observability  ✅ HANDOFF READY

**Root cause:** `dynamicGrid` produces `spacingPct` (real spacing), but the costGate observability object threaded to `CostGatePanel` only carries `{ pass, requiredMinSpacingPct, roundTripCostPct }` — no `gridSpacingPct`. So the panel receives `gridSpacingPct=null` → `status:"unknown"`. UI already renders NO_DATA correctly.

**Safe field source:** `dynamicGrid(...).spacingPct` (already computed in the paper loop via `paperLoopDiagnostics`). Copy the value into the costGate snapshot — do **not** recompute or change spacing logic.

### Codex handoff — C

**เป้าหมาย:** ส่งค่า `gridSpacingPct` (จาก `dynamicGrid.spacingPct` ที่คำนวณอยู่แล้ว) เข้าไปใน costGate observability object เพื่อให้ panel แสดงค่าจริงแทน NO_DATA — read-only ล้วน

**ไฟล์ที่ต้องอ่านก่อน:** `dashboard/lib/grid/dynamicGrid.ts` (spacingPct), `dashboard/lib/paper/paperLoopDiagnostics.ts` (costGate object), `dashboard/components/CostGatePanel.tsx` (ผู้บริโภค), route ที่ประกอบ costGate payload

**สิ่งที่ต้องแก้:**
1. เพิ่ม field `gridSpacingPct: number | null` ใน costGate snapshot type/object
2. set ค่าจาก `dynamicGrid(...).spacingPct` ที่จุดที่ paper loop มีผลลัพธ์ grid อยู่แล้ว (ถ้าไม่มี → null)
3. ไม่ต้องแตะ `CostGatePanel.tsx` (รองรับ null อยู่แล้ว) — ตรวจว่า prop ชื่อตรงกัน

**ข้อห้าม:** ห้ามเปลี่ยน spacing logic / grid parameters / requiredMinSpacing formula (= roundTripCost × 2.5) / ห้ามเปิด regrid / ห้าม recompute spacing — คัดลอกค่าเท่านั้น

**Output:** diff ของ type + builder; old records → `gridSpacingPct=null` (panel โชว์ "—" / unknown); record ใหม่ที่มี grid result → โชว์ค่าจริง + ✓/✗ เทียบ requiredMinSpacing

**Tests:** (1) grid result present → costGate.gridSpacingPct = spacingPct; (2) no grid result → null → panel NO_DATA; (3) spacingOk = gridSpacingPct ≥ requiredMinSpacingPct; (4) old record null ไม่ throw

**UI wording:** คงเดิม — "Actual grid spacing: —" เมื่อ null; เมื่อมีค่า แสดง % + ✓/✗

**Classification:** `COST_GATE_SPACING_OBSERVABILITY_HANDOFF_READY`

---

## WORKSTREAM D — Winrate NO_DATA / LOW_SAMPLE shell  ✅ HANDOFF READY

**Current:** `WinrateCard.tsx` already has a no-data branch (`!data.has_data`) and OB/TREND/Overall StatCards from `/api/winrate` (reads `plan_history.jsonl`). Missing: explicit status tiering and grid closed-cycle separation.

**Status rule (display-only, default safe):**
- `closedCycles === 0 && trendClosedTrades === 0` → **WINRATE_NO_DATA**
- `trendClosedTrades >= 1` → allow **LOW_SAMPLE** trend shell only
- grid `closedCycles >= 1` → allow **LOW_SAMPLE** grid closed-cycle shell only
- `closedCycles >= 30` → usable review · `>= 100` → stronger review

**Fields required:** `overall.total`, `by_type.TREND.total` (have), grid `closedCycles` (from `paperLoopDiagnostics`/`paper-performance` — expose read-only in winrate payload or pass as prop; until then grid tier = NO_DATA).

### Codex handoff — D

**เป้าหมาย:** เพิ่ม status tier (NO_DATA / LOW_SAMPLE / usable / stronger) ลงใน WinrateCard เป็น display logic ล้วน default = NO_DATA — ไม่แตะการคำนวณ winrate

**ไฟล์ที่ต้องอ่านก่อน:** `dashboard/components/WinrateCard.tsx`, `dashboard/app/api/winrate/route.ts`, `dashboard/lib/paper/paperLoopDiagnostics.ts` (closedCycles)

**สิ่งที่ต้องแก้:**
1. derive `winrateStatus` ใน card จาก `overall.total` / `by_type.TREND.total` + (optional) grid `closedCycles`
2. NO_DATA wording (ไทย): "ยังไม่มีไม้ปิด (TP/SL) — รอข้อมูลจริงก่อนประเมิน winrate"
3. LOW_SAMPLE warning (ไทย): "ตัวอย่างน้อย (n < 30) — ผลยังไม่น่าเชื่อถือ ใช้ดูแนวโน้มเท่านั้น ไม่ใช้ตัดสินใจ activation"
4. grid closed-cycle tier = NO_DATA stub จนกว่าจะมี `closedCycles` ใน payload
5. คง branch `!has_data` เดิม

**ข้อห้าม:** ห้ามแก้สูตร winrate/avgR/expectancy / ห้ามเปลี่ยนแหล่งข้อมูล plan_history / ห้ามให้ card นี้ feed กลับ decision path / ห้าม activation hint ใด ๆ (observability เท่านั้น)

**Output:** diff ของ WinrateCard (+ optional winrate route เพิ่ม `closedCycles` read-only); 0 trades → NO_DATA; trend ≥1 → LOW_SAMPLE trend shell; ≥30/≥100 → usable/stronger label

**Tests:** (1) 0/0 → NO_DATA; (2) trend total ≥1 → LOW_SAMPLE; (3) total ≥30 → usable; (4) ≥100 → stronger; (5) ไม่มี closedCycles → grid tier NO_DATA, ไม่ throw

**Classification:** `WINRATE_NO_DATA_SHELL_HANDOFF_READY`

---

## WORKSTREAM E — Next priority ranking

| Task | Safe now? | Needs data? | Codex difficulty | Risk | Value |
|---|---|---|---|---|---|
| C CostGate spacing observability | ✅ | No | Low | Very low (read-only, UI ready) | High (unblocks costGate.status) |
| D Winrate NO_DATA/LOW_SAMPLE shell | ✅ | No | Low | Very low (display-only) | Medium |
| A D5.1 post-deploy QA | ✅ operator | Collects it | None (no code) | None | High (gates B) |
| B D5.1-b candle wiring | Design only | Yes (geom samples) | Medium | Medium (gap-misalignment) | High |
| Closed-cycle blocker monitor | Partial | Yes | Medium | Low | Medium |
| Regime transition history design | Design | Yes | Medium | Low | Medium |
| Range quality gate design | Design | Yes | Medium | Med | Medium |
| Low-vol fee-grind behavior design | Design | Yes | Medium | Med | Low-Med |

**Top 3 recommended next:**
1. **C — CostGate gridSpacingPct observability** (Codex now): lowest risk, UI already built, immediately removes a `costGate.status=unknown` blind spot.
2. **D — Winrate NO_DATA/LOW_SAMPLE shell** (Codex now): display-only, safe, sets correct expectations while no closed trades exist.
3. **A — D5.1 post-deploy QA** (operator now): zero code, collects the evidence that gates B. Run in parallel with C/D.

B (candle wiring) is task #4 — start only after A confirms `fillResolutionGeometryReadyCount ≥ ~5`.

---

## 4–8. Synthesis

- **Codex can do now, minimal risk:** C (CostGate spacing) and D (Winrate shell) — both read-only/display, no trading surface.
- **Must wait for runtime evidence:** A's PASS/FAIL verdict (≥5 post-deploy cycles); B's execution (geometry-ready samples to test the wiring + guard).
- **Operator should collect next:** the 7 fields in WS-A every ~15 min for 10–20 cycles, plus the 3 screenshots.
- **Codex handoff blocks:** C and D above are ready to paste. B is drafted but **do not ship** until A clears and the contiguity guard is included.
- **Final recommendation:** ship C, then D, via Codex now; run A in parallel; hold B until A's geometry counters are positive. Keep M-0B / Phase 2-B / live / adaptive-RR / OB-FVG execution OFF throughout.
