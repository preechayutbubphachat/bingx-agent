# Trend Strategy T-2 — Manual Paper Armed Plan (DESIGN ONLY)

> **Phase T-2 = design/docs เท่านั้น** · ยังไม่ implement · ไม่มีปุ่ม arm · ไม่ส่ง paper/live order · M-0B BLOCKED
> ต่อจาก T-1 (Trend Strategy Shadow) + T-1M (Trend Transition Monitor) · ดู `docs/TREND_STRATEGY_PAPER_DESIGN.md`
> **T-2 = manual paper ARMED state เท่านั้น · paper simulated order จริง = T-3**

---

## 1) T-2 purpose
T-2 Manual Paper Armed = **operator review trendStrategy แล้ว arm paper-only trend setup ด้วยมือ** เมื่อ setup สุก (AWAITING_CONFIRMATION + risk PASS)
**ไม่ใช่:** real exchange order · live trading · old grid exposure conversion · auto arm · M-0B unlock · paper order (นั่นคือ T-3)

**T-2 ต้องมีครบ (precondition):**
- `trendStrategy.status` = AWAITING_CONFIRMATION หรือ SETUP_READY
- `riskStatus` = PASS
- `confirmationStatus` = WAITING_5M_CONFIRM
- `trendTransitionMonitor.shouldNotifyOperator` = true
- `canonicalMarketRegime` direction ยังตรง trendStrategy.direction
- `canonicalRegimeGate` ยัง block grid / confirm trend check (ไม่ขัดแย้ง)
- `oldGridExposurePolicy` = QUARANTINE_OLD_GRID_EXPOSURE

## 2) Manual Paper Arm Gate contract (spec — ยังไม่ implement)
```ts
trendManualPaperArmGate = {
  phase: "T-2_DESIGN" | "T-2_READY_FOR_OPERATOR" | "T-2_ARMED" | "T-2_REJECTED" | "T-2_EXPIRED",
  status:
    | "NOT_READY"
    | "READY_FOR_OPERATOR_REVIEW"
    | "OPERATOR_ARMED_PAPER_ONLY"
    | "REJECTED_BY_OPERATOR"
    | "EXPIRED"
    | "BLOCKED",
  requiredConditions: string[],
  passedConditions: string[],
  failedConditions: string[],
  operatorActionRequired: boolean,
  expiryAt,                       // ISO time
  setupId,                        // hash ของ setup (direction + zone + epoch)
  paperActivationAllowed: false,  // hard false ใน T-2 design
  liveActivationAllowed: false,   // hard false เสมอ
  notes: string[]
}
```
**ข้อบังคับ:**
- T-2 design: `paperActivationAllowed=false` (คงไว้)
- implement ภายหลังอาจมี flag แยก `paperArmAllowed` แต่ **ห้ามเปิดตอนนี้**
- `status=OPERATOR_ARMED_PAPER_ONLY` เปลี่ยนได้เฉพาะจาก operator action เอง (ไม่ใช่ auto) · armed ≠ execution (execution = T-3)
- arm gate (paper-only) **แยกจาก** Phase 2-B grid activation และ **แยกจาก** `EXCHANGE_MANUAL_APPROVAL`

## 3) Required conditions → READY_FOR_OPERATOR_REVIEW (ต้องครบทุกข้อ)
- `trendStrategy.phase` = T-1_SHADOW
- `trendStrategy.status` ∈ {AWAITING_CONFIRMATION, SETUP_READY}
- `trendStrategy.riskStatus` = PASS
- `trendStrategy.rewardRisk >= minRewardRisk`
- `trendStrategy.confirmationRequired` = true
- `trendStrategy.confirmationStatus` = WAITING_5M_CONFIRM
- `trendZoneCandidate.buildStatus` = READY
- currentPrice อยู่ใน entryZone (หรือขอบที่ยอมรับได้)
- price **ไม่ใกล้ target** (ไม่ไล่ราคา)
- `canonicalMarketRegime` direction ตรง trendStrategy.direction
- `indicatorGate` ไม่ขัดแย้ง
- data freshness = fresh
- old grid exposure quarantined
- ไม่มี Phase 2-B grid activation
- M-0B ยัง blocked

**ถ้าข้อใดไม่ผ่าน → status = NOT_READY หรือ BLOCKED** (default ปลอดภัย, ไม่ arm)

## 4) Expiry / invalidation (arm request หมดอายุเมื่อ)
- price ออกจาก entry zone
- price ข้าม invalidation
- regime เปลี่ยนจาก trend → RANGE/UNKNOWN
- rewardRisk ต่ำกว่า threshold
- confirmation fail
- data stale
- operator ไม่ act ในเวลาที่กำหนด
- volatility spike
**Suggested expiry:** 15m หรือ 3 แท่ง 5m หลัง setup เข้าสู่ AWAITING_CONFIRMATION → `status=EXPIRED`, ต้องเริ่ม review ใหม่

## 5) UI design (future card, read-only / approval-required)
**Title:** `Trend Manual Paper Arm Gate`
แสดง: Gate status · Required conditions · Passed/failed conditions · Setup ID · Direction · Entry zone · Current price · Invalidation · Target · Reward/Risk · Expiry time · Operator action required · Paper activation allowed · Live activation allowed
**Thai copy:**
- "ขั้นนี้เป็นการเตรียม Manual Paper เท่านั้น ยังไม่ส่งคำสั่ง"
- "ต้องรอ 5m confirmation"
- "ไม่ใช้ exposure BUY เดิมของ Grid"
- "ห้ามเงินจริง"
> **ไม่มีปุ่ม arm ในเฟส design** · ถ้ามีปุ่มในอนาคต = T-2 implementation แยก, paper-only, gated, ไม่แตะ live flag

## 6) API contract (future additive — document only, ยังไม่เพิ่ม)
```ts
paperLoopDiagnostics.trendManualPaperArmGate = {
  phase, status, requiredConditions, passedConditions, failedConditions,
  operatorActionRequired, setupId, expiryAt,
  paperActivationAllowed: false, liveActivationAllowed: false
}
```
> เพิ่มเข้า API ต่อเมื่อ implement T-2 shadow ภายหลัง · T-2 design = document contract เท่านั้น

## 7) Relationship with T-3
| | T-2 (manual paper armed) | T-3 (paper simulated execution) |
|---|---|---|
| ทำอะไร | operator arm setup เท่านั้น | จำลอง paper trend order |
| **ห้าม** | create paper order · create fill · count evidence · update expectancy · close old grid exposure | — |
| T-3 ทำได้ | — | simulate paper order · trend paper journal แยก · track trend closed trades แยก · **ไม่ปนกับ grid closedCycles** |

> armed (T-2) ≠ executed (T-3) · เป็น 2 ขั้นแยก · arm ไม่สร้าง order/fill/evidence ใดๆ

## 8) Safety conditions (hard)
- No live trading · No real order · **No paper order ใน T-2 design**
- No Phase 2-B activation · No M-0B unlock
- No old grid BUY → trend SELL conversion · No fake closed cycles
- No shared expectancy with grid (trend expectancy แยก)

## 9) Codex docs-only commit
**ไม่จำเป็นในรอบนี้** (Claude สร้าง docs ให้แล้ว) — ถ้า operator ต้องการ release docs ขึ้น git: Codex commit docs-only (เอกสาร T-2 + pointers). เมื่อ approve ให้ implement T-2 shadow ค่อย handoff แยกพร้อม validation
Commit (docs): `docs(trend): add T-2 manual paper arm plan (design only)`

## Safety confirmation
- **no paper execution** · **no live execution** · **no M-0B unlock**
- **old grid exposure remains quarantined** (`QUARANTINE_OLD_GRID_EXPOSURE` · ไม่ force SELL · ไม่นับเป็น trend evidence/expectancy)
- ไม่มีปุ่ม arm · ไม่แตะ `paper_cycle.sh` · ไม่ใช้ git · design เท่านั้น · `paperActivationAllowed`/`liveActivationAllowed`=false
