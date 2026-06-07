# Trend Strategy T-3 — Paper Simulated Execution Plan (DESIGN ONLY)

> **Phase T-3 = design/docs เท่านั้น** · ยังไม่ implement · ไม่ส่ง paper/live order · ไม่มีปุ่ม arm · ไม่แก้ `paper_cycle.sh` · M-0B BLOCKED
> ต่อจาก T-2 (Manual Paper Arm Gate, shadow) · ดู `docs/TREND_STRATEGY_T2_MANUAL_PAPER_ARM_PLAN.md` + `docs/TREND_STRATEGY_PAPER_DESIGN.md`
> **paper-only simulation · ไม่เรียก BingX private execution API · trend evidence แยกจาก grid โดยสมบูรณ์**

---

## 1) T-3 purpose
T-3 = **จำลอง paper trend order** (simulated execution) เมื่อ operator arm setup จาก T-2 แล้ว → จำลองการเข้า/ออกตาม trend setup เพื่อเก็บ **trend evidence แยก** สำหรับประเมิน edge (T-4)
**ไม่ใช่:** live trading · real order · BingX execution API · old grid exposure conversion · ปนกับ grid expectancy/closedCycles · M-0B unlock · Phase 2-B activation

> T-2 = armed (เตรียม) · **T-3 = simulated execution (จำลองจริงในกระดาษ)** · ทั้งคู่ paper-only

## 2) Preconditions from T-2
T-3 จำลอง order ได้เฉพาะเมื่อ:
- `trendManualPaperArmGate.status` = `OPERATOR_ARMED_PAPER_ONLY` (operator arm เองแล้ว — ไม่ใช่ auto)
- arm gate ไม่ EXPIRED/REJECTED/BLOCKED
- 5m confirmation = CONFIRMED (จาก trendStrategy.confirmationStatus)
- canonicalMarketRegime ยังตรง direction · canonicalRegimeGate ยัง block grid
- data fresh · old grid exposure ยัง QUARANTINE_OLD_GRID_EXPOSURE
- ภายใต้ risk limits (§8) ยังไม่เกิน
- **`paperArmAllowed` flag (T-2/T-3 paper-only) ถูกเปิดโดย operator** — แยกจาก `liveActivationAllowed` (false เสมอ) และ `EXCHANGE_MANUAL_APPROVAL`

> ถ้าข้อใดไม่ผ่าน → ไม่จำลอง order · คง shadow

## 3) Trend paper order object (spec)
```ts
trendPaperOrder = {
  orderId,                    // uuid (paper)
  setupId,                    // จาก arm gate
  source: "TREND_STRATEGY",
  mode: "PAPER_SIMULATED",
  direction: "SHORT" | "LONG",
  type: "LIMIT" | "MARKET_ON_CONFIRM",   // ปกติ confirm-then-enter
  intendedEntry,             // zone mid หรือ confirm close
  stopLoss,                  // = trendZoneCandidate.invalidation
  takeProfit1,               // = targets.t1
  takeProfit2,               // optional
  sizeUnit,                  // paper risk-based (จาก §8)
  riskPerTradePct,
  createdAt, confirmedAt,
  status: "PAPER_PENDING" | "PAPER_FILLED" | "PAPER_PARTIAL" | "PAPER_CANCELLED" | "PAPER_CLOSED",
  paperArmAllowed: true,          // paper-only operator arm intent — NOT live, NOT activation flag
  paperActivationAllowed: false,  // hard false in this design
  liveActivationAllowed: false    // hard false
}
```
> **paper เท่านั้น** — `orderId` ไม่เคยส่งไป exchange · ไม่มี clientOrderId จริง · ไม่เรียก BingX

## 4) Trend paper journal schema (แยกจาก grid journal)
ไฟล์/ตารางแยก: `tmp/execution-runner/trend_paper_journal.jsonl` (paper, runtime — ไม่ commit)
```ts
trendPaperJournalEvent = {
  ts, type: "TREND_PAPER_ENTRY" | "TREND_PAPER_PARTIAL" | "TREND_PAPER_EXIT" | "TREND_PAPER_CANCEL",
  orderId, setupId, direction,
  price, qty, reason,            // entry/SL/TP1/TP2/manual/invalidation
  rMultiple,                     // (exit-entry)/risk * sign
  netPnlPaper,                   // หลังหัก fee/slippage paper model
  feePaper, slippagePaper,
  regimeAtEvent, sessionAtEvent,
  epochId,                       // trend epoch (แยกจาก grid epoch)
  source: "TREND_STRATEGY"
}
```
**บังคับ:** journal นี้ **แยกจาก** `paper_no_trade.jsonl`/grid execution journal · ไม่ปนกัน

## 5) Entry / SL / TP simulation rules
- **Entry:** จำลองเข้าเมื่อ 5m confirm + ราคาอยู่ใน entryZone (ไม่ไล่ราคา) · entry price = confirm-candle close หรือ zone mid (อนุรักษ์นิยม: ใช้ราคาที่แย่กว่าในกรอบ)
- **SL:** = `trendZoneCandidate.invalidation` (เหนือ swingHigh + ATR buffer สำหรับ SHORT)
- **TP1:** = `targets.t1` (swingLow สำหรับ SHORT) — ปิดบางส่วน (เช่น 50%)
- **TP2:** optional extension · ถ้าไม่มี = ปิดที่ TP1 ทั้งหมด
- **ห้าม:** เลื่อน SL ออกไกล (no widening) · ห้ามเพิ่ม size สวน (no martingale) · ห้ามไล่ราคาถ้าเลย zone

## 6) Fill model (conservative paper)
- จำลอง fill เฉพาะเมื่อราคา **แตะ/ผ่าน** ระดับ (entry/SL/TP) ภายในแท่ง (ใช้ high/low ของ candle ถัดไป)
- **conservative:** ถ้าแท่งเดียวแตะทั้ง SL และ TP → ถือว่า **SL ก่อน** (worst-case)
- fee + slippage paper model: หัก `feePct` + `slippagePct` ทุก fill (เหมือน grid cost model)
- partial fill: TP1 ปิดบางส่วน → เหลือ runner ไป TP2/SL
- ไม่มี look-ahead: ใช้เฉพาะ candle ที่ปิดแล้ว

## 7) Exit model
- exit เมื่อ: แตะ SL · แตะ TP1/TP2 · invalidation (regime เปลี่ยน/structure break) · manual operator close (paper) · time-stop (optional)
- คำนวณ `rMultiple` = (exit − entry)/risk × sign · `netPnlPaper` หลังหัก fee/slippage
- ทุก exit → เขียน `TREND_PAPER_EXIT` event + ปิด order (status PAPER_CLOSED)

## 8) Risk limits (paper)
```ts
trendPaperRiskLimits = {
  riskPerTradePct,            // เช่น 0.5–1.0%
  maxConcurrentTrendTrades,  // เช่น 1 (เริ่ม)
  maxDailyTrendTrades,       // เช่น 2–3
  maxConsecutiveTrendLosses, // เช่น 2 → pause T-3
  maxDailyTrendLossPct,      // เช่น 2% → stop วันนั้น
  minRewardRisk,             // เช่น 1.2/1.5
  maxAtrPct, maxSpreadPct, maxSlippagePct
}
```
เกิน limit ใด → **ไม่จำลอง order ใหม่** + แจ้ง operator (ผ่าน transition monitor)

## 9) Trend evidence metrics (แยก)
- `trendClosedTrades`, `trendWinRate`, `trendExpectancy` (net หลัง cost), `trendAvgR`, `trendProfitFactor`
- `trendMaxDrawdownPct`, `trendSampleSize`
- failure taxonomy: `sl_hit`, `regime_flip_before_tp`, `confirm_failed`, `slippage_drag`, `tp1_only_runner_stopped`
- ทุก metric คำนวณจาก `trend_paper_journal.jsonl` เท่านั้น

## 10) Separation from grid (เด็ดขาด)
| | Grid | Trend (T-3) |
|---|---|---|
| journal | grid execution journal | `trend_paper_journal.jsonl` |
| closed unit | `closedCycles` | `trendClosedTrades` |
| expectancy | grid expectancy | `trendExpectancy` |
| epoch | grid epoch | trend epoch |
| exposure | grid inventory | trend position (paper) |
**ห้าม:** ปน closedCycles/expectancy · นับ trend trade เป็น grid cycle · แปลง old grid BUY exposure เป็น trend SELL · ใช้ grid fill เป็น trend evidence

## 11) UI / API fields (future additive)
```ts
paperLoopDiagnostics.trendPaperExecution = {
  enabled: false,            // จนกว่า operator arm + paperArmAllowed
  phase: "T-3_DESIGN" | "T-3_PAPER_ACTIVE",
  activeOrders: TrendPaperOrder[],
  recentTrendTrades: [...],  // ปิดแล้ว (paper)
  trendEvidence: { trendClosedTrades, trendWinRate, trendExpectancy, trendAvgR, trendMaxDrawdownPct, sampleSize },
  riskState: { dailyTrendTrades, consecutiveLosses, dailyLossPct, limitHit },
  paperArmAllowed,           // paper-only operator arm intent
  paperActivationAllowed: false,
  liveActivationAllowed: false
}
```
UI card (future): `Trend Paper Execution (Paper-only)` — active orders · recent trades · trend evidence · risk state · **ไม่มีปุ่ม live** · Thai copy "จำลอง paper เท่านั้น ไม่ใช่เงินจริง"

## 12) Safety stop conditions
หยุด T-3 (ไม่จำลอง order ใหม่ + alert) เมื่อ:
- risk limit เกิน (daily loss/consecutive losses/max trades)
- regime เปลี่ยน/volatility spike/data stale
- old grid exposure ไม่ quarantined
- runtime audit mismatch (paper journal inconsistent)
- operator manual pause
- **ทุกกรณี default = หยุด (ปลอดภัย)** · live ห้ามตลอด

## 13) T-4 Edge Review transition
เมื่อ trend evidence สะสมพอ (เช่น sample ≥ N closed trends) → **T-4 Edge Review:**
- ประเมิน `trendExpectancy` (net > 0?), drawdown, win rate, R-distribution, failure taxonomy
- ใช้ skill `expectancy-risk-of-ruin` + `trade-journal-attribution`
- **T-4 ≠ live** · live trading ต้อง approval แยกต่างหาก (คนละตัวกับ paper arm และ EXCHANGE_MANUAL_APPROVAL) + ผ่าน M-0B + paper-to-live migration framework

## Hard rules / Safety confirmation
- T-3 = **paper-only simulation** · no live trading · no BingX private execution API
- no old grid BUY exposure conversion · no mixing grid/trend expectancy · no fake closed cycles
- no M-0B unlock · no Phase 2-B activation · ไม่แตะ `paper_cycle.sh` · ไม่มีปุ่ม arm/live · `paperActivationAllowed=false` และ `liveActivationAllowed=false` เสมอ
- implement T-3 = Codex handoff แยก (เมื่อ operator approve) พร้อม validation (build + tsc + node:test) + paper journal แยก + risk limits + conservative fill
