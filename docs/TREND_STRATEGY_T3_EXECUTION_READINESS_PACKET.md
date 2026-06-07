# Trend Strategy T-3 — Execution Readiness Checklist + Operator Approval Packet

> docs-only · **readiness gate ก่อน implement T-3 paper simulated execution** · ยังไม่ implement
> ไม่เขียน journal · ไม่จำลอง fill · ไม่สร้าง order · ไม่มีปุ่ม arm · live ห้ามตลอด · M-0B BLOCKED
> สถานะปัจจุบัน: T-1/T-1M/T-2/T-3-preflight implemented (shadow) · T-3 journal schema locked + validator (commit `31def5c`) · **T-3 execution = ยังไม่เริ่ม**

---

## 1) T-3 execution readiness checklist (ต้อง ✅ ครบก่อน implement)
**A. Upstream phases**
- [ ] T-1 Trend Strategy Shadow verified PASS
- [ ] T-1M Transition Monitor verified PASS
- [ ] T-2 Manual Paper Arm Gate verified PASS (READY path ทำงาน)
- [ ] T-3 Preflight verified PASS (READY_FOR_PAPER_SIMULATION_REVIEW path ทำงาน)
- [ ] T-3 journal schema locked + `validateTrendPaperJournalEvent` 13/13 tests PASS

**B. Runtime readiness (ตอนจะเริ่ม)**
- [ ] `trendManualPaperArmGate.status` = `OPERATOR_ARMED_PAPER_ONLY` (operator arm เองแล้ว)
- [ ] `trendPaperExecutionPreflight.status` = `READY_FOR_PAPER_SIMULATION_REVIEW` (failedInputs = 0)
- [ ] 5m confirmation = CONFIRMED · regime match · data fresh
- [ ] old grid exposure = QUARANTINE_OLD_GRID_EXPOSURE
- [ ] risk parameters (§6) กำหนดครบ + ไม่เกิน limit

**C. Code readiness (เมื่อ implement)**
- [ ] T-3 execution เรียก `validateTrendPaperJournalEvent` **ก่อนเขียน** ทุก event (valid=true เท่านั้นจึงเขียน)
- [ ] paper journal เขียนที่ `tmp/execution-runner/trend_paper_journal.jsonl` **แยก** จาก grid journal
- [ ] conservative fill (SL-before-TP worst-case) · fee/slippage model
- [ ] build + tsc + node:test PASS · ไม่ commit runtime JSONL/.env

## 2) Operator approval packet (paper-only trend execution)
```
operatorTrendPaperApproval = {
  approvalType: "T3_PAPER_SIMULATION_ONLY",   // ≠ live, ≠ EXCHANGE_MANUAL_APPROVAL
  reviewedBy: "operator",
  reviewedAt,
  setupId,
  decision: "GO" | "GO_SMALL" | "NO_GO" | "HOLD",
  paperArmIntentRequested: true,// operator intent/request (paper-only) — ไม่ใช่ runtime flag
  paperArmAllowed: false,       // hard false in this docs-only packet
  paperActivationAllowed: false,// hard false in this docs-only packet
  liveActivationAllowed: false, // hard false เสมอ
  riskParamsConfirmed: true,
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
  notes
}
```
> **paperArmIntentRequested = future operator intent เท่านั้น** · `paperArmAllowed=false` ใน packet นี้ · ไม่เปิด execution อัตโนมัติ · approval นี้แยกจาก Phase 2-B และ EXCHANGE_MANUAL_APPROVAL

## 3) Required runtime state (ก่อนเริ่ม simulate)
- canonicalMarketRegime ตรง direction · canonicalRegimeGate ยัง block grid (stricter-only)
- trendStrategy.status ∈ {AWAITING_CONFIRMATION, SETUP_READY} · riskStatus PASS · RR ≥ minRewardRisk
- trendZoneCandidate.buildStatus = READY · entry/SL/TP1 available
- price ในโซน + ไม่ใกล้ target · data fresh · ไม่มี volatility spike
- preflight READY + arm gate ARMED + operator approval = GO

## 4) Required safety invariants (hard — ตลอด T-3)
- `paperActivationAllowed` = **false** จนกว่า implementation เฟส execution เปิดให้จริง (มี operator GO)
- `liveActivationAllowed` = **false** เสมอ
- **no M-0B unlock · no Phase 2-B activation**
- old grid BUY exposure = **QUARANTINE_OLD_GRID_EXPOSURE** (ไม่ force SELL · ไม่แปลงเป็น trend SELL)
- **T-3 paper evidence ไม่นับเป็น grid closedCycles** (`countTowardGridClosedCycles=false` ทุก event)
- ไม่เรียก BingX private execution API · ไม่ส่ง real order · ไม่แตะ `paper_cycle.sh` (ใช้ runner/route แยก)

## 5) Required journal schema validation path
```
สร้าง event → validateTrendPaperJournalEvent(event)
  ├─ valid=true  → เขียนลง trend_paper_journal.jsonl (paper, แยก)
  └─ valid=false → ไม่เขียน + log error + alert operator (default ปลอดภัย)
```
- validator บังคับ: countTowardGridClosedCycles=false · liveActivationAllowed=false · oldExposurePolicy=QUARANTINE · trend evidence true เฉพาะ closing event
- ทุก write ต้องผ่าน validator ก่อนเสมอ (ไม่มี bypass)

## 6) Required risk parameters (ต้องตั้งครบก่อน GO)
| param | ต้องกำหนด |
|---|---|
| riskPerTradePct | เช่น 0.5–1.0% |
| maxConcurrentTrendTrades | เช่น 1 (เริ่ม) |
| maxDailyTrendTrades | เช่น 2–3 |
| maxConsecutiveTrendLosses | เช่น 2 → pause |
| maxDailyTrendLossPct | เช่น 2% → stop วัน |
| minRewardRisk | เช่น 1.2 (เข้ม 1.5) |
| maxAtrPct / maxSpreadPct / maxSlippagePct | ตามตลาด |

## 7) Required stop / kill conditions (default = หยุด)
- risk limit เกิน (daily loss / consecutive losses / max trades / concurrent)
- regime เปลี่ยน / volatility spike / data stale
- old grid exposure ไม่ quarantined
- runtime audit mismatch (journal inconsistent / validator reject)
- operator manual pause
- ทุกกรณี → **ไม่จำลอง order ใหม่ + alert** · ห้าม auto-resume · live ห้ามตลอด

## 8) Required evidence separation from grid (เด็ดขาด)
| | Grid | Trend (T-3) |
|---|---|---|
| journal | grid execution journal | `trend_paper_journal.jsonl` |
| closed unit | `closedCycles` | `trendClosedTrades` |
| expectancy | grid expectancy | `trendExpectancy` |
| epoch | grid epoch | trend epoch |
**ห้าม:** ปน closedCycles/expectancy · นับ trend trade เป็น grid cycle · ใช้ grid fill เป็น trend evidence · แปลง old grid BUY → trend SELL

## 9) Go / No-Go classification
- **GO** = checklist §1 A+B ✅ ครบ + operator approval GO + risk params ตั้งครบ + ทุก safety invariant คงอยู่
- **GO_SMALL** = GO แต่จำกัด maxConcurrent=1 + riskPerTrade ต่ำสุด (เริ่มเก็บ evidence)
- **HOLD** = บาง runtime state ยังไม่ครบ (เช่น preflight NOT_READY) → คง shadow
- **NO_GO** = safety invariant ใดถูกละเมิด / old exposure ไม่ quarantined / operator ไม่อนุมัติ → ไม่ implement
> **สถานะปัจจุบัน = HOLD** (preflight NOT_READY เพราะ NO_TRADE_NEAR_TARGET · ยังไม่มี operator approval · T-3 execution ยังไม่เริ่ม)

## 10) Codex handoff template (future T-3 execution implementation)
```
Objective: implement T-3 paper simulated trend execution (paper-only)
อ่านก่อน: docs/TREND_STRATEGY_T3_PAPER_EXECUTION_PLAN.md · TREND_STRATEGY_T3_JOURNAL_SCHEMA_LOCK.md ·
          lib/trend/{trendStrategy, trendManualPaperArmGate, trendPaperExecutionPreflight, trendPaperJournalSchema}.ts
Deliver: trendPaperExecutionEngine.ts (pure sim + conservative fill) + journal writer (validate-before-write) +
         trendEvidence metrics + paperLoopDiagnostics.trendPaperExecution + UI card (no live button)
Hard rules: ทุก write ผ่าน validateTrendPaperJournalEvent · paper journal แยก · countTowardGridClosedCycles=false ·
            paperArmAllowed/paperActivationAllowed=false จนกว่า implementation handoff แยก · liveActivationAllowed=false เสมอ ·
            ไม่ unlock M-0B · ไม่ activate Phase 2-B · ไม่แตะ paper_cycle.sh trading path · ไม่เรียก BingX execution API
Validation: npm run build · npx tsc --noEmit · node:test (engine/journalSchema/preflight/armGate) ·
            ไม่ commit runtime JSONL/.env/secrets
Commit: feat(trend): add T-3 paper simulated execution engine (paper-only, validated journal)
```

## Safety confirmation
- no execution · no journal write · no simulated fill · no paper order · no live · no arm button
- paperArmIntentRequested = future operator intent only · paperArmAllowed/paperActivationAllowed/liveActivationAllowed=false ใน packet นี้
- no M-0B unlock · no Phase 2-B activation · old grid exposure quarantined · trend evidence ไม่นับเป็น grid closedCycles
- docs-only · ไม่ใช้ git
