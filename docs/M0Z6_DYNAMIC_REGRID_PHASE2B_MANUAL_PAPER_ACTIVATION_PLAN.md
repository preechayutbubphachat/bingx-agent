# Phase 2-B — Manual Paper Activation Plan (DESIGN ONLY)

> สถานะ: **DESIGN / PLANNING เท่านั้น** · ยังไม่ implement · implementation ต้องมี **Codex handoff แยกภายหลัง**
> ต่อจาก: Phase 2-A (Regrid Readiness, read-only) — `docs/M0Z6_DYNAMIC_REGRID_DESIGN.md` + `docs/M0Z6_DYNAMIC_REGRID_PHASE2A_MONITORING.md`
> Architecture: `PROJECT_ARCHITECTURE.md` Layer 07/09/11 · **M-0B remains BLOCKED · live activation remains prohibited**

---

## 0) Classification
```
PHASE_2B                  = DESIGN_ONLY
PROJECT_FLOW              = ON_DESIGN
M-0B                      = BLOCKED_EXPECTED
liveActivationAllowed     = false (always, throughout Phase 2)
paperActivationAllowed    = false (until explicit Operator approval of this plan's gate)
```

---

## 1) Phase 2-B purpose
Phase 2-B = **Manual Paper Activation Plan สำหรับ dynamic grid epoch ใหม่** — นิยามวิธีที่ Operator จะ **อนุมัติด้วยมือ** ให้เปิด paper dynamic grid รอบใหม่ ได้อย่างปลอดภัย

**Phase 2-B ไม่ใช่ (NOT):**
- automatic dynamic grid activation
- live trading
- real order placement
- M-0B unlock
- exchange approval (`EXCHANGE_MANUAL_APPROVAL`)
- fake SELL / fake closed cycle
- rewriting old journals

> Operator approval ของ Phase 2-B (paper-only) เป็น **คนละตัว** กับ `EXCHANGE_MANUAL_APPROVAL` — อนุมัติ Phase 2-B ไม่แตะ live เด็ดขาด

---

## 2) Required preconditions (ต้องจริงครบทุกข้อ ก่อนพิจารณา Phase 2-B)
- Phase 2-A runtime monitor **stable**
- BUY cumulative count **ไม่เพิ่ม** ขณะ price = BELOW_GRID
- PAPER_NO_TRADE ยัง log ต่อเนื่อง
- REGRID_CANDIDATE ยัง log ต่อเนื่อง
- `regridReadiness.status` = `WATCH` หรือ `READY_FOR_OPERATOR_REVIEW`
- `stableCandleCount >= requiredStableCandles`
- `cooldownRemaining = 0`
- candidate grid มีอยู่: `candidateGridLower` / `candidateGridUpper` / `candidateGridMid` / `candidateSpacingPct`
- cost gate ผ่าน: `candidateSpacingPct > roundTripCostPct × 2.5`
- data freshness ผ่าน (decision/snapshot drift ≤ 1%)
- price source ใช้ **latest close** ถูกต้อง
- regime ไม่ใช่ strong trend สวน neutral grid
- volatility ไม่สุดขั้ว
- old exposure policy = explicit `QUARANTINE_OLD_ONE_SIDED_EXPOSURE`
- `paperActivationAllowed` ยัง **false** จนกว่า operator approve อย่างชัดเจน
- `liveActivationAllowed` = **false** เสมอ

> ถ้าข้อใดไม่ผ่าน → **คง Phase 2-A (NO_TRADE)** · ห้ามขอ Phase 2-B

---

## 3) Manual Paper Activation Gate (design/spec)
Gate object (spec — ยังไม่ implement):
```jsonc
manualPaperActivationGate = {
  phase: "2-B",
  status: "NOT_REQUESTED" | "REQUESTED" | "OPERATOR_APPROVED" | "REJECTED" | "EXPIRED",
  requestedAt,            // ISO time
  reviewedAt,            // ISO time
  reviewedBy: "operator",
  candidateId,           // hash ของ candidate geometry + epoch
  candidateGridLower,
  candidateGridUpper,
  candidateGridMid,
  candidateSpacingPct,
  reason,                // ทำไมถึงเสนอ candidate นี้
  riskSummary,           // exposure / cost / regime / volatility สรุป
  oldExposurePolicy: "QUARANTINE_OLD_ONE_SIDED_EXPOSURE",
  liveActivationAllowed: false   // hard-coded false
}
```
**ข้อบังคับ:**
- spec/design เท่านั้น จนกว่าจะถูกสั่งให้ implement ภายหลัง
- **ไม่มีปุ่ม dashboard ใดเปิดเทรดได้ตอนนี้**
- ถ้าออกแบบ UI → ต้องเป็น read-only หรือ "approval required" display เท่านั้น
- Operator approval (paper-only) แยกจาก `EXCHANGE_MANUAL_APPROVAL`
- `status` เปลี่ยนเป็น `OPERATOR_APPROVED` ได้เฉพาะจาก action ที่ operator ทำเอง (ไม่ใช่ระบบ auto) → set `paperActivationAllowed=true` เฉพาะ epoch นั้น
- `EXPIRED` เมื่อ candidate เก่าเกิน TTL หรือ data เปลี่ยนจน geometry ไม่ valid

---

## 4) Paper Epoch Plan
แนวคิด "epoch" = ช่วงชีวิตของ grid หนึ่งชุด เมื่อราคาออกนอกช่วง grid เดิม = epoch เดิม **จบ/invalidate** ห้ามลากหลักฐานข้าม epoch

**previousEpoch:**
- `status = INVALIDATED_RANGE`
- `reason = price_below_grid_lower`
- `oldExposurePolicy = QUARANTINE_OLD_ONE_SIDED_EXPOSURE`
- ไม่นับเป็น closed cycle
- ไม่ force SELL
- ไม่คำนวณ expectancy จาก exposure ที่ไม่สมบูรณ์

**nextEpoch:**
- `status = CANDIDATE`
- `source = Dynamic Regrid Phase 2-A`
- `activation = manual paper-only, future phase`
- `initial closedCycles = 0`
- ต้องเก็บ BUY/SELL round trip ใหม่ **ตามธรรมชาติ**
- ต้อง track expectancy แยก (ไม่ปนกับ epoch เดิม)

---

## 5) Phase 2-B state machine (draft)
```
PHASE_2A_MONITORING
  → READY_FOR_OPERATOR_REVIEW
  → PHASE_2B_REQUESTED
  → OPERATOR_APPROVED_PAPER_ONLY
  → PAPER_DYNAMIC_GRID_EPOCH_ARMED
  → PAPER_DYNAMIC_GRID_EPOCH_ACTIVE
  → PAPER_EVIDENCE_ACCUMULATION
  → EDGE_REVIEW
```
**Failure / stop paths (กลับสู่ NO_TRADE / Phase 2-A):**
- `REJECTED_BY_OPERATOR`
- `EXPIRED_CANDIDATE`
- `STALE_DATA`
- `VOLATILITY_EXTREME`
- `TREND_AGAINST_GRID`
- `COST_GATE_FAILED`
- `OLD_EXPOSURE_NOT_QUARANTINED`
- `RUNTIME_AUDIT_FAIL`

> ทุก failure path → ไม่เปิด grid / ไม่ส่ง order · default = ปลอดภัย (NO_TRADE) · EDGE_REVIEW ≠ M-0B unlock (ยังต้อง operator review + approval + netExpectancy>0)

---

## 6) UI requirements (future Phase 2-B, read-only / approval-required display)
Agent HQ จะมี card (อนาคต — ยังไม่สร้าง):

**Card title:** `Phase 2-B Manual Paper Activation`

Fields: Candidate ID · Candidate grid lower/upper/mid · Candidate spacing · Cost gate · Stable candles · Cooldown · Readiness status · Operator review required · Paper activation allowed · Live activation allowed · Old exposure policy · Current approval state

**Thai labels:**
- พร้อมให้ Operator ตรวจ = `READY_FOR_OPERATOR_REVIEW`
- รออนุมัติ Paper เท่านั้น = `REQUESTED`
- อนุมัติ Paper แล้ว = `OPERATOR_APPROVED`
- ห้ามเงินจริง = `liveActivationAllowed=false`
- แยก exposure เดิม = `QUARANTINE_OLD_ONE_SIDED_EXPOSURE`

> UI ตอนนี้ = read-only เท่านั้น · ปุ่ม approve (ถ้ามีในอนาคต) ต้อง gated + paper-only + ไม่แตะ live flag

---

## 7) Backend / API requirements (future, backward-compatible / additive only)
```jsonc
paperLoopDiagnostics.phase2B = {
  status,                      // จาก state machine §5
  candidateId,
  operatorReviewRequired,     // boolean
  manualPaperActivationStatus, // จาก gate §3
  paperActivationAllowed,     // false จนกว่า operator approve
  liveActivationAllowed,      // false เสมอ
  candidateExpiresAt,
  rejectionReason,
  nextAction
}

paperLoopDiagnostics.paperEpoch.nextEpoch = {
  candidateId,
  status,                     // CANDIDATE | ARMED | ACTIVE
  source,                     // "Dynamic Regrid Phase 2-A"
  gridLower,
  gridUpper,
  gridMid,
  spacingPct,
  activationMode: "MANUAL_PAPER_ONLY"
}
```
**ข้อบังคับ:** เพิ่ม field ใหม่เท่านั้น (additive) · ห้ามลบ/เปลี่ยน field เดิม · `/api/public-health` คง SAFE_PUBLIC_HEALTH · `/api/paper-performance` backward-compatible

---

## 8) Strict non-goals (บันทึกชัดเจน)
Phase 2-B design **ไม่**:
- place orders
- เปลี่ยน `paper_cycle.sh`
- activate grid
- approve exchange
- unlock M-0B
- แปลง old BUY exposure เป็น SELL
- fake closedCycles

---

## 9) Implementation note (เมื่อถึงเวลา)
- ต้องมี **Codex handoff แยก** พร้อม validation: `npm run build` + `npx tsc --noEmit` + node:test (pure evaluators) + ยืนยันไม่ commit runtime JSON/JSONL/.env/secrets
- เพิ่ม module pure (เช่น `phase2BGate.ts`) แบบ read-only ก่อน → activation จริงเป็น step ที่ gated ด้วย operator action เท่านั้น
- ทุก step ต้องคง: live=false, order=false, approval=not_approved, M-0B=BLOCKED

## Safety (คงเดิม)
ไม่เปิด live · ไม่ส่ง order · ไม่ approve exchange · ไม่ปลดล็อก M-0B · ไม่แก้ runtime JSON/JSONL · ไม่ force SELL · ไม่ fake closedCycle · ไม่ใช้ git · `liveActivationAllowed=false` เสมอ · `paperActivationAllowed=false` จนกว่า operator approve อย่างชัดเจน
