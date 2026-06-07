# Trend Strategy Paper Design — Phase T-0 (DESIGN ONLY)

> **Phase T-0 = design/docs เท่านั้น** · ไม่ implement execution · ไม่ส่ง paper/live order · ไม่แตะ `paper_cycle.sh`
> แยกจาก Grid อย่างชัดเจน · ใช้ canonicalMarketRegime + indicatorGate + trendZoneCandidate + multiTF + 5m confirm
> **no live · no order · no paper execution yet · no Phase 2-B · M-0B BLOCKED · old grid BUY exposure quarantined**

---

## 1) Purpose
Phase T-0 = **Trend Strategy Paper Design** สำหรับ setup เทรนด์ที่ regime ยืนยันแล้ว (pullback + confirm)
**ไม่ใช่:** live trading · real order · immediate paper execution · grid activation · Phase 2-B activation · M-0B unlock · force SELL ของ grid exposure เดิม · fake closed cycle

> นี่คือกลยุทธ์ **trend-following คนละระบบกับ Grid** — Grid จัดการ range/neutral, Trend จัดการ DOWNTREND/UPTREND pullback-confirm

## 2) Trend setup eligibility
**SHORT setup (ต้องครบทุกข้อ):**
- canonicalMarketRegime.regime = **DOWNTREND** · direction = **BEARISH**
- indicatorGate.status = **TREND_DOWN_BLOCK** (หรือ bearish trend state เทียบเท่า)
- trendZoneCandidate: dir = **DOWN** · buildStatus = **READY** · pullbackZone/invalidation/targets.t1 มีครบ
- price ยัง**ไม่ใกล้ target เกินไป** (ดู §4) · entry ต้อง **confirm ไม่ใช่ไล่ราคา**

**LONG setup:** regime=UPTREND · direction=BULLISH · trendZoneCandidate.dir=UP · zone/invalidation/target ครบเหมือนกัน

**ถ้าข้อมูล missing / stale / ขัดแย้ง → status = NO_TRADE · ไม่สร้าง setup**

## 3) Entry logic (DOWNTREND example)
ใช้ trendZoneCandidate: pullbackZone = sell zone · invalidation = stop เหนือ swingHigh + ATR buffer · t1 = swingLow · entry.type = **CONFIRM**

**SHORT entry ต้องครบ (ห้าม trigger เพราะแค่ trend ลง):**
1. ราคา pull back **เข้า** pullbackZone
2. 5m candle ยืนยัน rejection
3. momentum อ่อนแรงใกล้ zone
4. ไม่มี volatility/news/session risk override
5. R:R ยอมรับได้
6. operator/paper-mode approval (เฟส T ถัดไป)

**5m confirmation (อย่างใดอย่างหนึ่ง/หลายอย่าง):**
- 5m close กลับ**ใต้** zone midpoint หรือขอบล่าง
- rejection wick ใกล้ pullbackZone
- MACD histogram 5m ฟื้นไม่ขึ้น/พลิกลง
- RSI 5m ต่ำกว่า 50 / rolls over
- (optional) OI/funding ไม่ขัดแย้ง setup

> **ห้ามไล่ราคา** ถ้าราคาปัจจุบันใกล้ t1 แล้ว

## 4) Risk model (paper-only)
```ts
trendRisk = {
  riskPerTradePct,            // เช่น 0.5–1.0% ของ paper capital
  maxDailyTrendTrades,        // เช่น 2–3
  maxConsecutiveTrendLosses,  // เช่น 2 → pause
  invalidation,               // = trendZoneCandidate.invalidation
  stopLoss,                   // = invalidation
  takeProfit1,                // = trendZoneCandidate.targets.t1
  takeProfit2,                // optional เฉพาะ extension เชื่อถือได้
  minRewardRisk,              // configurable, แนะนำ >= 1.2 (เข้ม 1.5) สำหรับ paper test
  maxAtrPct,                  // เกิน → NO_TRADE (volatility สูง)
  maxSlippagePct,
  oldGridExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE"
}
```
**Rules:** SL = invalidation · TP1 = t1 · TP2 optional · ถ้า entry→invalidation risk ใหญ่เกิน → NO_TRADE · ถ้าราคาใกล้ target → NO_TRADE · old grid BUY exposure **quarantined** · trend trades มี **paper epoch + expectancy แยก**

## 5) Paper epoch separation
```ts
trendPaperEpoch = {
  epochId, source: "TREND_STRATEGY", regime, direction, setupId, trendZoneId,
  status: "NOT_REQUESTED" | "WATCHING_PULLBACK" | "SETUP_READY" | "AWAITING_CONFIRMATION"
        | "PAPER_ARMED" | "PAPER_ACTIVE" | "CLOSED" | "INVALIDATED",
  oldGridExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
  countTowardGridClosedCycles: false,
  countTowardTrendEvidence: true
}
```
**บังคับ:** trend paper evidence **แยกจาก** grid paper evidence · ไม่ปน trend expectancy กับ grid expectancy · old one-sided grid BUY exposure **ห้าม**กลายเป็น trend SELL

## 6) Output contract (future API, additive)
```ts
paperLoopDiagnostics.trendStrategy = {
  enabled: false,
  phase: "T-0_DESIGN" | "T-1_SHADOW" | "T-2_PAPER_ARMED" | "T-3_PAPER_ACTIVE",
  status: "NO_TRADE" | "WATCHING_PULLBACK" | "SETUP_READY" | "AWAITING_CONFIRMATION"
        | "RISK_REJECTED" | "INVALIDATED",
  direction: "LONG" | "SHORT" | null,
  setupReason, entryZone, currentPrice, distanceToEntryZonePct,
  invalidation, target1, target2, rewardRisk,
  confirmationRequired, confirmationStatus, riskStatus, oldExposurePolicy,
  paperActivationAllowed: false,   // T-0 hard false
  liveActivationAllowed: false     // hard false
}
```

## 6.1) Current DOWNTREND example (จาก snapshot จริง 2026-06-05)
```
regime=DOWNTREND/BEARISH · indicatorGate=TREND_DOWN_BLOCK · trendZone READY/DOWN
swingHigh=64459.5 · swingLow=61825.2 · pullbackZone=[63142.35, 63453.20] · invalidation=64552.38 · t1=61825.2
currentPrice≈61847.3
→ price อยู่ "ใต้" sell zone (ต้องเด้งขึ้น +2.1% เข้าโซนถึงจะ short) AND ห่าง t1 แค่ ~0.04% (ใกล้ target มาก)
→ trendStrategy.status = NO_TRADE (ยังไม่ pull back เข้าโซน + ราคาใกล้ t1 = ห้ามไล่)
→ direction=SHORT(potential) · confirmationStatus=NOT_CONFIRMED · paper/live activation=false
```
> ตัวอย่างนี้แสดงกฎ "ห้ามไล่ราคา" ชัดเจน — แม้ trend ลงแรง แต่ราคาเลยโซน + ถึง target แล้ว = ไม่เข้า

## 7) UI design (future Agent HQ card)
**Title:** `Trend Strategy Paper Plan (Shadow)`
แสดง: Direction · Setup status · Entry zone · Current price vs entry zone · Invalidation · Target 1/2 · Reward/Risk · Confirmation required · Confirmation status · Risk rejection reason · Old grid exposure policy · Paper activation allowed · Live activation allowed
**Thai copy:**
- "แผน Trend นี้เป็น Paper-only design ยังไม่ส่งคำสั่ง"
- "ไม่ใช้ exposure BUY เดิมของ Grid มาปิดเป็น Trend trade"
- "ต้องรอราคาเข้าโซน + 5m confirm ก่อน"
- "ห้ามเงินจริง"

## 8) Stop / block conditions (→ NO_TRADE / INVALIDATED)
- canonical regime เปลี่ยนเป็น RANGE/UNKNOWN สวน setup
- trendZoneCandidate buildStatus ≠ READY
- ราคาใกล้ target เกินไป
- R:R แย่เกิน (< minRewardRisk)
- ATR% / BBW volatility สูงเกิน
- funding/OI ขัดแย้ง setup ชัดเจน
- session/news risk สูงเกิน
- data stale
- old grid exposure ไม่ถูก quarantine
- paperActivationAllowed ยังไม่ถูก operator approve (เฟส T ถัดไป)

## 9) Relationship with Grid
| | Grid system | Trend system |
|---|---|---|
| รับผิดชอบ | range / neutral grid / regrid candidate | DOWNTREND/UPTREND pullback-confirm |
| **share** | canonicalMarketRegime · multiTF indicators · freshness checks · risk gates | (เหมือนกัน) |
| **ห้าม share** | closedCycles · expectancy · open exposure accounting · activation approval | (แยกเด็ดขาด) |

> Grid closedCycles/expectancy = ของ Grid · Trend closedTrades/expectancy = ของ Trend · ไม่ปนกัน · old grid BUY ไม่ใช่ trend evidence

## 10) Stage roadmap
- **T-0 Design (now):** docs only
- **T-1 Shadow:** compute `trendStrategy` object + แสดงบน Agent HQ · **no execution**
- **T-2 Manual Paper Armed:** operator arm paper-only trend setup ได้ · **ยังไม่ live** · design: `docs/TREND_STRATEGY_T2_MANUAL_PAPER_ARM_PLAN.md` (arm gate + required conditions + expiry; armed ≠ executed)
- **T-3 Paper Execution:** paper-only simulated trend orders · trend evidence แยก · design: `docs/TREND_STRATEGY_T3_PAPER_EXECUTION_PLAN.md` (order obj + trend paper journal แยก + conservative fill + risk limits)
- **T-4 Trend Edge Review:** closed trend trades · expectancy · drawdown · failure reasons
> **live ห้ามตลอด** จนกว่าจะมี approval แยกต่างหาก (คนละตัวกับ paper arm และคนละตัวกับ EXCHANGE_MANUAL_APPROVAL)

## 11) Codex handoff
**ยังไม่จำเป็น** — T-0 เป็น design/docs เท่านั้น · เมื่อ approve T-1: handoff แยก เพิ่ม `trendStrategy.ts` (pure evaluator, shadow) + wire diagnostics + UI card · validation (build + tsc + node:test) · paper/live activation=false · ไม่แตะ paper_cycle.sh

## 12) Safety confirmation
- **no live trading**
- **no order placement**
- **no paper execution yet**
- **no Phase 2-B activation**
- **no M-0B unlock**
- **old grid BUY exposure remains quarantined** (`QUARANTINE_OLD_GRID_EXPOSURE` · ไม่ force SELL · ไม่นับเป็น trend evidence · ไม่ปน closedCycles/expectancy)
- ไม่แตะ `paper_cycle.sh` · ไม่ใช้ git · design เท่านั้น
