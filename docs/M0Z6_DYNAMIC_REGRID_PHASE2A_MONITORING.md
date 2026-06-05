# Dynamic Regrid Phase 2-A — Runtime Monitoring Checklist

> สำหรับ Operator + future cowork session — เฝ้าดู Phase 2-A บน `/agent-hq` แบบ read-only
> Design: `docs/M0Z6_DYNAMIC_REGRID_DESIGN.md` · Architecture: `PROJECT_ARCHITECTURE.md` Layer 07/09/11
> **Phase 2-A = observability/readiness เท่านั้น — ไม่เปิด grid ไม่ส่ง order ไม่ปลดล็อก M-0B**

## Classification (ปัจจุบัน)
```
DYNAMIC_REGRID_PHASE_2A_MONITORING = ACTIVE
PROJECT_FLOW                       = ON_DESIGN
M-0B                               = BLOCKED_EXPECTED
```

---

## 1) สิ่งที่ต้องดูบน Agent HQ (`/agent-hq`)
ดูจาก Runtime Monitor + card `ความพร้อม Regrid Phase 2-A` (ข้อมูลจาก `/api/paper-performance` → `paperLoopDiagnostics`)

| รายการ | field | ความหมาย |
|---|---|---|
| จำนวน BUY สะสม | cumulative buy | ต้อง **นิ่ง** ขณะ BELOW_GRID |
| จำนวน SELL สะสม | cumulative sell | 0 ได้ (ราคายังไม่กลับเข้า grid) |
| จำนวน No-Trade | PAPER_NO_TRADE count | ต้อง **เพิ่มขึ้น** (guardrail ทำงาน) |
| จำนวน Regrid Candidate | REGRID_CANDIDATE / REGRID_READINESS count | ต้อง **เพิ่มขึ้น** |
| activationAllowed | dynamicGrid.candidate.activationAllowed | ต้อง **false** เสมอ |
| paperActivationAllowed | regridReadiness.paperActivationAllowed | ต้อง **false** (จนกว่า operator approve Phase 2-B) |
| liveActivationAllowed | regridReadiness.liveActivationAllowed | ต้อง **false** ตลอด Phase 2 |
| priceVsGrid | priceVsGrid | BELOW_GRID / INSIDE_GRID / ABOVE_GRID |
| paperLoopState | paperLoopState | REGRID_REQUIRED ขณะนอก grid |
| candidateStatus | dynamicGrid.candidate.candidateStatus | NO_TRADE / REGRID_REQUIRED ตาม event |
| cooldownRemaining | candidate.cooldownRemaining / readiness | ลดลงเมื่อ candle นิ่งต่อเนื่อง |
| stableCandleCount | candidate.stableCandleCount | เพิ่มเมื่อราคาเสถียร |
| readiness status | regridReadiness.status | NOT_READY / WATCH / READY_FOR_OPERATOR_REVIEW |
| readiness score | regridReadiness.score | คะแนนรวม gate (ถ้ามี) |
| oldExposurePolicy | oldExposurePolicy | QUARANTINE_OLD_ONE_SIDED_EXPOSURE |
| closedCycles | closedCycles | ต้อง **0** จนกว่าจะมี SELL จริงจับคู่ |

---

## 2) PASS pattern (ปกติ — Phase 2-A ทำงานถูกต้อง)
- BUY สะสม **คงที่**
- SELL อาจยังเป็น 0
- PAPER_NO_TRADE **เพิ่มขึ้น**
- REGRID_CANDIDATE / REGRID_READINESS **เพิ่มขึ้น**
- activationAllowed = false
- paperActivationAllowed = false
- liveActivationAllowed = false
- M-0B ยัง BLOCKED

## 3) WARNING pattern (ต้องสังเกต — ยังไม่ใช่ bug)
- No-Trade **หยุดเพิ่ม**
- Regrid Candidate **หยุดเพิ่ม**
- UI stale / `latestJournalAt` ไม่ขยับ
- readiness ค้างโดยไม่มีคำอธิบาย
- cooldown ไม่เปลี่ยนทั้งที่ราคาเริ่มนิ่ง
> → ตรวจ cron (`paper_cycle.sh` ทุก 5 นาที) + snapshot freshness ก่อน สรุปว่าเป็น bug

## 4) FAIL pattern (เป็น bug / ละเมิด safety — หยุดและรายงาน)
- BUY **เพิ่มขึ้น** ขณะ priceVsGrid = BELOW_GRID
- Dynamic grid **activate** โดยไม่มี operator approval
- activationAllowed = true โดยไม่คาดคิด
- paperActivationAllowed = true โดยไม่คาดคิด
- liveActivationAllowed = true
- closedCycles เปลี่ยนโดยไม่มี SELL evidence ที่ถูกต้อง
- runtime JSON/JSONL หาย / อ่านไม่ได้
> → ถ้าเจอ FAIL = clear bug → เตรียม Codex handoff (ดู §7) ห้ามแก้ runtime เอง

---

## 5) Phase 2-B entry criteria (ห้ามเริ่มจนกว่าครบทุกข้อ)
> Phase 2-B design เต็ม: `docs/M0Z6_DYNAMIC_REGRID_PHASE2B_MANUAL_PAPER_ACTIVATION_PLAN.md` (DESIGN ONLY)

Phase 2-B (เปิด dynamic grid จริง — paper) **ต้องไม่เริ่ม** จนกว่า:
1. stableCandleCount เพิ่มและคงที่ข้ามหลาย cycle
2. cooldownRemaining ถึง 0
3. candidate grid มีอยู่ + spacing ผ่าน cost gate (spacingPct > roundTripCostPct × 2.5)
4. stale data check ผ่าน (decision/snapshot drift ≤ 1%)
5. regime ไม่ใช่ strong trend สวน grid
6. old one-sided exposure quarantine = explicit (ยืนยันแล้ว)
7. **operator approve Phase 2-B paper-only activation design อย่างชัดเจน**
8. liveActivationAllowed ยัง false

## 6) Explicit prohibition (Phase 2-A)
- ห้าม place order
- ห้ามเปิด grid ใหม่
- ห้าม approve M-0B
- ห้ามเปิด live / order / approval flag

---

## 7) Codex handoff
**ตอนนี้: ไม่จำเป็น** — Task A/B เป็น docs-only, runtime modules (regridReadiness.ts ฯลฯ) implement ไปก่อนแล้ว
จำเป็นเมื่อ: เจอ FAIL pattern (§4) ที่เป็น code/runtime bug → เตรียม commit handoff แยก พร้อม validation (build + tsc + node:test) ก่อนเสมอ

## Safety (คงเดิม)
ไม่เปิด live · ไม่ส่ง order · ไม่ approve · ไม่ปลดล็อก M-0B · ไม่แก้ runtime JSON/JSONL · ไม่ลบ evidence · ไม่ใช้ git
