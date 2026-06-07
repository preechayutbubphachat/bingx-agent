# Trend Strategy T-3 — Journal Schema Lock + Dry-run Validator

> ล็อก schema ของ `trend_paper_journal` + pure validator **ก่อน** implement T-3 execution
> **ไม่เขียน journal · ไม่จำลอง fill · ไม่สร้าง order · ไม่เปิด paper/live · M-0B BLOCKED**
> validator = pure function (no I/O) · `dashboard/lib/trend/trendPaperJournalSchema.ts`

---

## 1) Event schema (schemaVersion `trend-paper-journal/1`)
**eventType (5):**
- `TREND_PAPER_ENTRY` — เปิด position (paper)
- `TREND_PAPER_PARTIAL` — ปิดบางส่วน (TP1)
- `TREND_PAPER_EXIT` — ปิดสมบูรณ์ (closed trade)
- `TREND_PAPER_CANCEL` — ยกเลิกก่อน fill (ไม่มีผล)
- `TREND_PAPER_INVALIDATED` — ปิดเพราะ invalidation/regime flip (closed)

**closing events** (มีผล trade): `TREND_PAPER_EXIT`, `TREND_PAPER_INVALIDATED`
**non-closing**: `TREND_PAPER_ENTRY`, `TREND_PAPER_PARTIAL`, `TREND_PAPER_CANCEL`

## 2) Required fields
ทุก event: `schemaVersion, ts, eventType, epochId, setupId, symbol, direction, oldExposurePolicy, countTowardGridClosedCycles, countTowardTrendEvidence, liveActivationAllowed`
setup numeric (entry/partial/closing): `entry, stopLoss, takeProfit1` (+ `takeProfit2` optional)
entry: `fillPricePaper, quantityPaper, riskAmountPaper`
closing: `fillPricePaper, quantityPaper, riskAmountPaper, rMultiple, grossPnlPaper, feeEstimate, slippageEstimate, netPnlPaper, exitReason`

**Safety invariants (hard — validator บังคับ error ถ้าผิด):**
- `countTowardGridClosedCycles` = **false** เสมอ
- `liveActivationAllowed` = **false** เสมอ
- `oldExposurePolicy` = **QUARANTINE_OLD_GRID_EXPOSURE** เสมอ
- `countTowardTrendEvidence` = **true ได้เฉพาะ closing event** (ENTRY/PARTIAL/CANCEL ต้อง false)

## 3) Validator
`validateTrendPaperJournalEvent(event) → { valid, errors, warnings }`
- **pure** · no file I/O · no appendFile/writeFile · no execution path · zero imports
- errors: missing required field · invalid eventType/direction · grid-cycle-flag≠false · live≠false · oldExposurePolicy≠quarantine · trend-evidence-true-on-non-closing · invalid/missing numeric (entry/SL/TP/PnL/R) · negative fee/slippage · qty/risk ≤ 0
- warnings: schema version mismatch · takeProfit2 absent (optional) · rMultiple/netPnl sign mismatch · cancel ไม่มี exitReason

## 4) Tests (`trendPaperJournalSchema.test.ts`) — 13/13 pass
valid entry · valid exit · missing fields rejected · grid-cycle-flag must false · live must false · oldExposurePolicy must quarantine · trend-evidence-on-non-closing rejected · invalid PnL/R rejected · negative fee rejected · cancel no-trend-evidence · invalidated closing valid · sign-mismatch warning · invalid event type rejected

## 5) Relationship with T-3 execution
- Schema นี้ถูก **ล็อก** ก่อน implement T-3 → validator เป็น guard ที่ T-3 จะเรียก **ก่อนเขียน** ทุก event ลง `trend_paper_journal.jsonl`
- การเขียน journal จริง / fill simulation / order = **T-3 execution (เฟสถัดไป)** ต้อง operator approve + Codex handoff แยก
- validator นี้ไม่เขียนไฟล์เอง — แค่ตรวจ shape (dry-run)

## 6) Files changed
สร้าง `dashboard/lib/trend/trendPaperJournalSchema.ts` + `.test.ts` (ไม่ wire เข้า runtime — เป็น building block สำหรับ T-3)

## Safety confirmation
- **No journal write** (pure validator, no I/O — คำ appendFile/writeFile มีแค่ใน comment)
- **No simulated fill · No order · No live · No arm button**
- **No M-0B unlock · No Phase 2-B activation**
- `paper_cycle.sh` 0 refs (unchanged) · zero imports · node:test 13/13 · tsc clean
- Codex handoff (commit/push เท่านั้น): `feat(trend): lock trend paper journal schema + dry-run validator`
