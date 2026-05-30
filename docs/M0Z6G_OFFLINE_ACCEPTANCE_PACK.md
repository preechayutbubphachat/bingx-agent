# Phase M-0Z-6G — Offline Acceptance Test Pack + Evidence Fixture Library + M-0B Gate Simulator Spec

> ผู้จัดทำ: Claude cowork (Principal Developer / Solution Architect / QA Gatekeeper / Evidence Parser)
> วันที่: 2026-05-29
> ประเภท: **OFFLINE / STATIC EXECUTION** — ไม่มี Git, ไม่ deploy, ไม่แตะ runtime, ไม่เรียก BingX, ไม่เปิด trading
> Read-first order: `PROJECT_CONTEXT.md` → `PROJECT_MAP.md` → `PROJECT_ARCHITECTURE.md` → `docs/SERVER_EVIDENCE_LEDGER.md` → `docs/RUNTIME_FILES_GIT_POLICY.md`
> สถานะปลายทาง: **Phase M-0B BLOCKED** (ไม่เปลี่ยน) — เอกสารนี้คือ "ไม้บรรทัด" ไว้ตัดสิน evidence รอบหน้า

---

## 1) Current State Confirmation (Part A)

**Current Phase:** M-0Z-6 — Evidence Intake Execution + Post-Deploy Triage + Paper Liveness Decision
**Offline sub-phase ที่ทำตอนนี้:** M-0Z-6G — Acceptance Test Pack + Evidence Fixture Library + Gate Simulator Spec

ยืนยันจากการอ่าน source จริง (read-only): reader path ถูกต้อง, route ปลอดภัย, `.env.example` ขาด paper keys จริง, Fix 1+2 อยู่ในโค้ดจริง

| # | หัวข้อ | สถานะ | หลักฐาน/เหตุผล |
|---|--------|--------|----------------|
| 1 | `npm run build` EXIT:0 | **PRE_DEPLOY_PASS_ONLY** | PASS บนเครื่องจริง M-0Z-4 แต่ยังไม่พิสูจน์ว่า code เดียวกันถูก deploy |
| 2 | Env safety flags (LIVE/ORDER/PROD) | **PASS** | `.env.example` ยืนยัน `=false` ทั้งสามตัว — ค่าปลอดภัยเป็น default |
| 3 | `EXCHANGE_MANUAL_APPROVAL` | **NOT_APPROVED** | `.env.example` = `not_approved` |
| 4 | `/api/public-health` JSON | **PRE_DEPLOY_PASS_ONLY** | 200 JSON ปลอดภัย แต่ pre-deploy เท่านั้น |
| 5 | Protected endpoints | **PRE_DEPLOY_PASS_ONLY** (SAFE_W_BLOCKERS) | Operator api.txt 2026-05-28 ก่อน deploy |
| 6 | Reader path (`readPaperJournal.ts` / `paperPerformance.ts`) | **STATIC_FINDING** (ถูกต้อง) | resolve จาก `EXECUTION_AUDIT_ROOT_DIR → BINGX_AGENT_DIR → tmp` ยืนยันบรรทัด 103–118 |
| 7 | `/api/paper-performance` route | **STATIC_FINDING** (ปลอดภัย) | try/catch → 200 `status:"no_data"`, `readOnly:true`, ไม่มี secret (route.ts 39–164) |
| 8 | Fix 1 — ORDER_FILLED parse | **INSTRUMENTATION_FIXED_PENDING_DEPLOY** | `readPaperJournal.ts` 308–321 มี averageFillPrice/avgPrice + filledQuantity/executedQty |
| 9 | Fix 2 — FILL_RESULT ใน extractFills | **INSTRUMENTATION_FIXED_PENDING_DEPLOY** | `FILL_RESULT` อยู่ใน PAPER_ORDER_EVENTS + parse 301–306, 340–343 |
| 10 | `.env.example` paper keys | **STATIC_FINDING** (ขาด) | ไม่มี `PAPER_TRADING_ENABLED`, `EXECUTION_AUDIT_ROOT_DIR` ใน `.env.example` |
| 11 | Git release | **PENDING_EXTERNAL** | ต้องใช้ Codex (ห้ามทำ) |
| 12 | Plesk deploy | **PENDING_EXTERNAL** | ต้องใช้ Operator (ห้ามทำ) |
| 13 | `BINGX_AGENT_DIR` post-deploy | **PENDING_EXTERNAL** | ต้อง shell บน server |
| 14 | Runtime files verify | **PENDING_EXTERNAL** | ต้อง `ls` บน server |
| 15 | `/api/public-health` post-deploy | **PENDING_EXTERNAL** | ต้อง curl หลัง deploy |
| 16 | `/public` visual | **PENDING_EXTERNAL** | ต้อง login browser |
| 17 | `/api/paper-performance` post-deploy | **PENDING_EXTERNAL** | ต้อง curl หลัง deploy |
| 18 | Paper fills | **DATA_GAP** | 0 fills — รอ accumulation หลัง deploy |
| 19 | Closed cycles | **DATA_GAP** | ยังไม่มี entry+exit จริง |
| 20 | Phase M-0B | **BLOCKED** | gate ยังไม่ครบ |

**สรุปสำคัญ 2 ข้อ:**
- เอกสารปัจจุบัน "ไม่" ทำให้เข้าใจผิดว่า live-ready (ทุกที่ระบุ BLOCKED/disabled ชัด)
- เอกสารปัจจุบัน "ไม่" ทำให้เข้าใจผิดว่า paper evidence PASS (ระบุ DATA_GAP ชัด)

**Claude ทำต่อได้ offline ตอนนี้:** Acceptance Test Pack, Evidence Fixture Library, Gate Simulator Spec, Contract Test Matrix, /public Truthfulness Spec, Env/Doc Patch proposals, Redaction Policy, Risk Register v4 — ครบในเอกสารนี้

---

## 2) What Claude Completed Offline Now

1. ✅ Acceptance Test Pack — 10 กลุ่ม, 40 test cases พร้อม PASS/WARNING/FAIL/PENDING_EXTERNAL/DATA_GAP/Rejection/M-0B impact
2. ✅ Evidence Fixture Library — 19 fixtures (synthetic, ติดป้าย SYNTHETIC ทุกอัน)
3. ✅ M-0B Gate Simulator Spec — input schema 16 ตัว + deterministic pseudocode → `BLOCKED | READY_FOR_REVIEW`
4. ✅ Paper Runner Contract Test Matrix — 23 rows
5. ✅ /public Truthfulness Acceptance Spec — allowed/forbidden labels + PASS/WARNING/FAIL
6. ✅ Env Documentation Patch Proposal — 7 keys
7. ✅ Evidence Redaction & Secret-Safety Policy
8. ✅ Documentation Patch Proposal (เสนอ ไม่แก้ไฟล์)
9. ✅ Risk Register v4 — 28 risks
10. ✅ Final Offline Handoff + Files inspect/not-touch + Final No-Go Decision

ทั้งหมด **ไม่แตะ** Git / deploy / runtime / .env / secrets / BingX API

---

## 3) Acceptance Test Pack (Part B)

> รูปแบบ: ทุก test คืนผลได้ 6 ทาง — PASS / WARNING / FAIL / PENDING_EXTERNAL / DATA_GAP / REJECT
> REJECT = หลักฐานเป็นพิษ (มี secret / runtime committed / false claim) → ตัดทิ้ง + ห้ามนับเป็น PASS เด็ดขาด

### Group 1 — Release Integrity
**AT-1.1 commit hash + staged files**
- Objective: ยืนยันว่า commit ที่อ้างมีจริงและ stage เฉพาะไฟล์ปลอดภัย
- Required Evidence: commit hash (เต็ม 40 หรือ short ≥7), `git show --stat` หรือ staged list, branch=main
- PASS: hash มี + staged เป็น code/docs/example เท่านั้น + build EXIT:0 อ้างอิงในรอบเดียวกัน
- WARNING: hash มีแต่ staged list ไม่ครบ/ไม่ชัด
- FAIL: stage มี runtime JSON / `.env` / secret / node_modules / .next
- PENDING_EXTERNAL: ยังไม่มีหลักฐานจาก Codex
- REJECT: log ปรากฏ secret/token
- M-0B Impact: required gate — FAIL/PENDING → BLOCKED

**AT-1.2 build pinned to commit**
- Objective: build EXIT:0 ผูกกับ commit ที่จะ deploy
- Required Evidence: build log EXIT:0 + commit hash เดียวกับที่ push
- PASS: EXIT:0 + hash ตรง; WARNING: EXIT:0 แต่ไม่อ้าง hash; FAIL: EXIT≠0
- PENDING_EXTERNAL: ไม่มี log; M-0B: required

### Group 2 — Deploy Integrity
**AT-2.1 git pull result**
- Required Evidence: `git pull origin main` output + รายงาน "no runtime file overwritten"
- PASS: pull สำเร็จ + ไม่มี runtime JSON ถูกแก้/overwrite; WARNING: pull สำเร็จแต่ไม่ยืนยัน runtime untouched
- FAIL: runtime JSON ถูก overwrite (ละเมิด RUNTIME_FILES_GIT_POLICY)
- PENDING_EXTERNAL: ยังไม่ deploy; M-0B: required

**AT-2.2 rebuild + restart**
- Required Evidence: rebuild EXIT:0 บน server + restart log Node.js app
- PASS: rebuild EXIT:0 + restart สำเร็จ; FAIL: rebuild error/app ไม่ขึ้น; PENDING_EXTERNAL: ยังไม่ทำ; M-0B: required

**AT-2.3 deployed code = build evidence**
- Required Evidence: deployed commit hash = build/push hash
- PASS: ตรงกัน; FAIL: ไม่ตรง (deploy code ผิดรุ่น); PENDING_EXTERNAL: ไม่มีหลักฐาน; M-0B: required

### Group 3 — Runtime Root Integrity
**AT-3.1 BINGX_AGENT_DIR resolved**
- Required Evidence: `echo $BINGX_AGENT_DIR` = httpdocs root จริง
- PASS: ตรง project root; FAIL: ว่าง/ชี้ผิด path; PENDING_EXTERNAL: ยังไม่ตรวจ; M-0B: required

**AT-3.2 runtime files exist at root**
- Required Evidence: `ls -la $BINGX_AGENT_DIR/latest_decision.json` + `market_snapshot.json`
- PASS: ทั้งสองไฟล์มี + size>0; WARNING: มีแต่ขนาดน่าสงสัย/timestamp เก่ามาก; FAIL: ไม่มีไฟล์; PENDING_EXTERNAL: ยังไม่ตรวจ; M-0B: required

**AT-3.3 freshness**
- Required Evidence: mtime ของ runtime files เทียบเวลาปัจจุบัน
- PASS: mtime สดตาม cycle (≤ CYCLE_SCHED_INTERVAL_MS × 2); WARNING: เก่ากว่า threshold; FAIL: stale ถูกนำเสนอเป็น fresh; DATA_GAP: ไม่มี mtime; M-0B: required

### Group 4 — Source-of-Truth Integrity
**AT-4.1 reader reads root not cache**
- Required Evidence: ยืนยันว่า reader path = root (static ผ่านแล้ว) + runtime ใช้ค่าจาก root
- PASS: อ่านจาก root; FAIL: อ่านจาก `dashboard/app/public/data/*` เป็น authoritative; M-0B: required
- หมายเหตุ static: reader resolve จาก env root → STATIC_FINDING ผ่าน, แต่ post-deploy ต้องยืนยันค่า env จริง

**AT-4.2 cache never overrides root**
- Required Evidence: ไม่มี logic ให้ cache JSON ทับ root + git ไม่ track runtime (ดู RUNTIME_FILES_GIT_POLICY)
- PASS: ตรงนโยบาย; FAIL: cache override / runtime tracked; M-0B: required

### Group 5 — Public Health Integrity
**AT-5.1 post-deploy /api/public-health**
- Required Evidence: `curl -i .../api/public-health` หลัง deploy
- PASS: 200 JSON + blocked-phase fields ถูกต้อง + ไม่มี stack trace/secret
- WARNING: 200 แต่บาง field หาย/ไม่ชัด
- FAIL: 5xx / stack trace / secret leak / อ้าง live-ready
- PENDING_EXTERNAL: ยังไม่ curl หลัง deploy; REJECT: secret ใน body; M-0B: required

**AT-5.2 no false live-ready in payload**
- PASS: ไม่มีคำว่า production_ready/live_ready=true; FAIL: payload อ้าง ready ทั้งที่ flags=false; M-0B: required

### Group 6 — /public Visual Truthfulness
**AT-6.1 disabled states visible**
- Required Evidence: screenshot/รายงาน 11-point checklist
- PASS: แสดง Live OFF / Order OFF / approval not_approved / M-0B blocked ครบ
- WARNING: แสดง expected blockers แต่ wording ไม่ชัด
- FAIL: อ้าง live/production ready หรือซ่อน blocker; PENDING_EXTERNAL: ยังไม่ดู; M-0B: required

**AT-6.2 cache labeled display-only**
- PASS: UI ระบุ cache=display-only; FAIL: cache แสดงเป็น authoritative; M-0B: required

### Group 7 — Paper Runner Liveness
**AT-7.1 paper event freshness**
- Required Evidence: `/api/paper-performance` หรือ journal มี event timestamp สด
- PASS: มี event + ts สด; WARNING: มี event แต่ stale; DATA_GAP: 0 event/ไม่มีไฟล์; FAIL: endpoint error 5xx; PENDING_EXTERNAL: ยังไม่ curl; M-0B: required (DATA_GAP → BLOCKED)

**AT-7.2 paper mode actually enabled**
- Required Evidence: `PAPER_TRADING_ENABLED` ค่าจริงบน server (ไม่ใช่ "false")
- PASS: เปิด (ค่าที่ทำให้ runner ทำงาน); DATA_GAP: unset → reader fallback; FAIL: ตั้งผิดทำ runner ตาย; M-0B: required

### Group 8 — Paper Fill Quality
**AT-8.1 fills > 0**
- PASS: totalOrderFilled>0; DATA_GAP: 0 fills (ไม่ใช่ FAIL, ไม่ใช่ PASS); M-0B: DATA_GAP → BLOCKED

**AT-8.2 fill schema complete**
- Required Evidence: fill มี averageFillPrice, filledQuantity/fillQty, side, symbol, timestamp
- PASS: ครบทุก field; FAIL: fills มีแต่ขาด averageFillPrice หรือ fillQty (ถือเป็น bug จริง ห้าม downgrade เป็น warning); WARNING: ครบ field แต่ค่าขอบเขตน่าสงสัย; DATA_GAP: 0 fills; M-0B: required

**AT-8.3 closed cycles**
- Required Evidence: มี entry fill + exit fill + realized/net result
- PASS: มี closed cycle จริง; WARNING: มี fills แต่ยังไม่ครบ cycle; DATA_GAP: 0 fills; FAIL: cycle อ้างผลแต่ไม่มี exit; M-0B: required (ไม่ PASS → BLOCKED)

**AT-8.4 cost fields**
- PASS: มี fee/slippage/funding หรือระบุ explicitly unavailable; WARNING: ขาดบางส่วน; FAIL: รายงาน gross เป็น net (ไม่หัก cost); M-0B: required-for-edge

### Group 9 — Approval Control
**AT-9.1 EXCHANGE_MANUAL_APPROVAL**
- PASS (สำหรับ live เท่านั้น): approved + ทุก gate PASS แล้ว; **ปัจจุบัน NOT_APPROVED = ถูกต้อง**
- FAIL/REJECT: ตั้ง approved ก่อน gate ครบ; M-0B: required — ต้อง not_approved จนกว่าทุก gate PASS

### Group 10 — Safety Flags
**AT-10.1 live/order/prod flags**
- Required Evidence: ค่าจริงทั้งสาม flag
- PASS: ทั้งสาม = false; FAIL+BLOCKED (รุนแรง): ตัวใดตัวหนึ่ง = true ในเฟสนี้; M-0B: hard gate

---

## 4) Evidence Fixture Library (Part C)

> ⚠️ ทุก fixture เป็น **SYNTHETIC** สร้างเพื่อทดสอบ parser/acceptance เท่านั้น — **ห้าม** นับเป็นหลักฐานจริงจาก server เด็ดขาด (ดู Risk #28)
> ค่าทั้งหมดสมมุติ ไม่ใช่ของจริง

| # | Fixture | Synthetic Input (ย่อ) | Expected Classification | Why | M-0B Impact |
|---|---------|----------------------|-------------------------|-----|-------------|
| 1 | PASS_CodexReleaseEvidence | `commit a1b2c3d`, staged: `readPaperJournal.ts, paperPerformance.ts, PROJECT_CONTEXT.md`, build EXIT:0 | **PASS** | hash+safe files+build ครบ | gate ผ่าน 1/แต่ยังต้อง gate อื่น |
| 2 | FAIL_CodexSecretCommitted | staged รวม `.env`, log แสดง `ADMIN_KEY=...` | **REJECT/FAIL** | secret + .env committed | BLOCKED + ต้อง rotate secret |
| 3 | PENDING_CodexMissingCommitHash | "pushed already" ไม่มี hash | **PENDING_EXTERNAL** | ขาด field บังคับ | BLOCKED |
| 4 | PASS_PublicHealthPostDeploy | `HTTP 200` JSON: `{phase:"M-0B", blocked:true, live:false}` ไม่มี trace | **PASS** | 200+blocked fields+no leak | gate ผ่าน |
| 5 | FAIL_PublicHealthStackTrace | `HTTP 500` + `at Object.<anonymous> (/var/www/...)` | **FAIL** | stack trace leak | BLOCKED |
| 6 | FAIL_PublicHealthFalseLiveReady | `200 {production_ready:true}` แต่ flags=false | **FAIL** | false live-ready claim | BLOCKED |
| 7 | PASS_RuntimeRootEvidence | `BINGX_AGENT_DIR=/var/www/.../httpdocs`, `ls` พบ 2 ไฟล์ size>0 | **PASS** | root+files ตรง | gate ผ่าน |
| 8 | FAIL_RuntimePathMismatch | `BINGX_AGENT_DIR=/tmp/x`, ไม่พบไฟล์ | **FAIL** | path mismatch | BLOCKED |
| 9 | PASS_PublicVisualTruthfulBlockedState | screenshot: "Live OFF / M-0B BLOCKED / not_approved" | **PASS** | สื่อสาร truth ครบ | gate ผ่าน |
| 10 | WARNING_PublicVisualExpectedBlockersOnly | แสดง blocker แต่ไม่ระบุ cache=display-only | **WARNING** | wording ไม่ครบ | ต้องแก้ก่อน PASS |
| 11 | FAIL_PublicVisualClaimsLiveReady | banner "Production Ready ✅" | **FAIL** | false claim | BLOCKED |
| 12 | DATA_GAP_PaperZeroFills | `{status:"no_paper_trades", totalOrderFilled:0}` | **DATA_GAP** | 0 fills ≠ PASS, ≠ FAIL | BLOCKED (รอ accumulate) |
| 13 | FAIL_PaperFillsMissingAverageFillPrice | fills>0 แต่ `averageFillPrice:null` | **FAIL** | bug จริง — ห้าม downgrade | BLOCKED + ต้องสอบโค้ด |
| 14 | FAIL_PaperFillsMissingFillQty | fills>0 แต่ไม่มี filledQuantity/fillQty | **FAIL** | bug จริง | BLOCKED |
| 15 | WARNING_PaperFillsNoClosedCyclesYet | fills>0 ครบ field แต่ closedCycles:0 | **WARNING** | ยังไม่ครบ cycle | BLOCKED (ยังไม่ PASS) |
| 16 | PASS_PaperClosedCyclesComplete | entry+exit fills, realized net, fee/slippage | **PASS** | cycle ครบ | gate ผ่าน (1 ใน edge gate) |
| 17 | FAIL_PaperEndpointNoDataTreatedAsPass | report เขียน "no_data = healthy PASS" | **REJECT/FAIL** | no_data ≠ PASS | BLOCKED |
| 18 | NOT_APPROVED_ExchangeManualApproval | `EXCHANGE_MANUAL_APPROVAL=not_approved` | **NOT_APPROVED** | สถานะถูกต้องตอนนี้ | คงอยู่จนทุก gate PASS |
| 19 | BLOCKED_M0BIncompleteGateSet | gate matrix มี PENDING/DATA_GAP ปน | **BLOCKED** | gate ไม่ครบ | M-0B BLOCKED |

---

## 5) M-0B Gate Simulator Spec (Part D)

### Input Schema
```
GateInputs = {
  codexReleaseStatus:            PASS | FAIL | PENDING_EXTERNAL
  safeStagingStatus:             PASS | FAIL | PENDING_EXTERNAL
  buildStatus:                   PASS | FAIL | PENDING_EXTERNAL
  noRuntimeJsonCommitted:        PASS | FAIL          // FAIL = พบ runtime committed
  noSecretsCommitted:            PASS | FAIL | REJECT  // REJECT = พบ secret
  pleskDeployStatus:             PASS | FAIL | PENDING_EXTERNAL
  runtimeRootStatus:             PASS | FAIL | PENDING_EXTERNAL
  publicHealthPostDeployStatus:  PASS | WARNING | FAIL | PENDING_EXTERNAL
  publicVisualStatus:            PASS | WARNING | FAIL | PENDING_EXTERNAL
  paperRunnerStatus:             PASS | WARNING | FAIL | DATA_GAP | PENDING_EXTERNAL
  paperFillStatus:               PASS | FAIL | DATA_GAP
  closedCycleStatus:             PASS | WARNING | FAIL | DATA_GAP
  exchangeManualApprovalStatus:  approved | not_approved
  liveTradingFlag:               true | false
  orderPlacementFlag:            true | false
  productionTradingReadyFlag:    true | false
}
Output = BLOCKED | READY_FOR_REVIEW    // ไม่มี output ที่หมายถึง live-ready
```

### Deterministic Pseudocode
```
function simulateM0BGate(g):
    # --- Tier 0: safety violations (รุนแรงสุด) ---
    if g.liveTradingFlag == true:          return FAIL_BLOCKED("live trading flag enabled")
    if g.orderPlacementFlag == true:       return FAIL_BLOCKED("order placement enabled")
    if g.productionTradingReadyFlag == true:return FAIL_BLOCKED("production_ready enabled")
    if g.noSecretsCommitted == REJECT:     return FAIL_BLOCKED("secret committed — rotate required")
    if g.noSecretsCommitted == FAIL:       return BLOCKED("secret risk")
    if g.noRuntimeJsonCommitted == FAIL:   return BLOCKED("runtime JSON committed")

    # --- Tier 1: any FAIL anywhere ---
    requiredGates = [codexReleaseStatus, safeStagingStatus, buildStatus,
                     pleskDeployStatus, runtimeRootStatus,
                     publicHealthPostDeployStatus, publicVisualStatus,
                     paperRunnerStatus, paperFillStatus, closedCycleStatus]
    if any(x == FAIL for x in requiredGates):        return BLOCKED("a required gate FAILED")

    # --- Tier 2: any PENDING_EXTERNAL ---
    if any(x == PENDING_EXTERNAL for x in requiredGates): return BLOCKED("evidence pending external")

    # --- Tier 3: paper-specific ---
    if g.paperFillStatus == DATA_GAP:      return BLOCKED("paper fills = DATA_GAP")
    if g.closedCycleStatus != PASS:        return BLOCKED("closed cycles not PASS")

    # --- Tier 4: approval ---
    if g.exchangeManualApprovalStatus != approved: return BLOCKED("manual approval = not_approved")

    # --- Tier 5: WARNING ก็ยังไม่ปล่อย ---
    if any(x == WARNING for x in requiredGates):     return BLOCKED("unresolved WARNING gate")

    # --- ทุก required gate == PASS และไม่มี safety violation ---
    if all(x == PASS for x in requiredGates):        return READY_FOR_REVIEW
    return BLOCKED("default deny")
```

**Invariants:** (1) ไม่มี path ใดคืน live-ready (2) default = BLOCKED เสมอ (3) READY_FOR_REVIEW ≠ approval ≠ live (4) DATA_GAP/no_data/WARNING/PENDING ไม่เคยถูกนับเป็น PASS

---

## 6) Paper Runner Contract Test Matrix (Part E)

| # | Test | Evidence Needed | PASS | FAIL | DATA_GAP | Safe Next Action | M-0B Impact |
|---|------|-----------------|------|------|----------|------------------|-------------|
| 1 | PAPER_TRADING_ENABLED exists | env dump (redacted) | key มี | — | key ไม่มี | เพิ่มใน `.env` server + `.env.example` | required |
| 2 | PAPER_TRADING_ENABLED safe value | env value | ค่าทำให้ paper ทำงาน, live ไม่ติด | ตั้งเป็นค่าที่เปิด live | unset | set ค่าถูก | required |
| 3 | EXECUTION_AUDIT_ROOT_DIR exists | env dump | มี | — | ไม่มี (reader fallback BINGX_AGENT_DIR) | document + set | required |
| 4 | EXECUTION_AUDIT_ROOT_DIR → expected root | env value | = project root | ชี้ผิด dir | unset | set = root | required |
| 5 | BINGX_AGENT_DIR exists | `echo` | มี | — | ว่าง | set บน server | required |
| 6 | BINGX_AGENT_DIR = httpdocs root | `echo` | ตรง | ผิด | — | แก้ env | required |
| 7 | LIVE_TRADING_ENABLED=false | env | =false | =true | — | คงไว้ false | hard gate |
| 8 | ENABLE_ORDER_PLACEMENT=false | env | =false | =true | — | คงไว้ false | hard gate |
| 9 | PRODUCTION_TRADING_READY=false | env | =false | =true | — | คงไว้ false | hard gate |
| 10 | paper journal exists | `ls tmp/*.jsonl` หรือ paper_pnl.jsonl | พบ | — | ไม่พบ | start runner | required |
| 11 | journal path = API reader path | path เทียบ reader resolve (tmp / execution-runner) | ตรง | ผิด path | — | sync path | required |
| 12 | writer heartbeat fresh | last event ts | สด | — | ไม่มี ts | check runner running | required |
| 13 | ORDER_FILLED schema complete | event sample | มี orderId/status/qty/price | ขาด field | 0 event | สอบ writer | required |
| 14 | FILL_RESULT schema complete | event sample | มี averageFillPrice/filledQuantity/side/quantity | ขาด | 0 event | สอบ writer | required |
| 15 | averageFillPrice present | fill sample | มี | null ทั้งที่ fill จริง (bug) | 0 fills | สอบ writer schema | required |
| 16 | fillQty/filledQuantity present | fill sample | มี | null (bug) | 0 fills | สอบ writer | required |
| 17 | side present | fill/intent sample | มี | null | 0 fills | สอบ intent mapping | required |
| 18 | symbol present | event sample | มี | null | 0 events | สอบ writer | required |
| 19 | timestamp present | event sample | มี ts ตัวเลข | null/format ผิด | 0 events | สอบ writer | required |
| 20 | closed cycle evidence | entry+exit pair | มี realized result | อ้าง cycle ไม่มี exit | 0 cycles | รอ accumulate | required |
| 21 | fee/slippage fields | cost fields | มี หรือ "unavailable" ชัด | gross เป็น net | ขาด | document cost model | required-for-edge |
| 22 | no real order placement | audit `liveOrder:false` + flags | liveOrder=false ทุก event | พบ live order | — | EMERGENCY stop | hard gate |
| 23 | no private execution API call | code/audit | ไม่มี private call | พบ call | — | EMERGENCY stop | hard gate |

---

## 7) /public Truthfulness Acceptance Spec (Part F)

### Required visible truths (ต้องแสดง)
Live trading disabled · Order placement disabled · `EXCHANGE_MANUAL_APPROVAL=not_approved` · Phase M-0B blocked (ขณะ evidence ไม่ครบ) · Runtime source-of-truth status · Paper evidence status · 0 fills = DATA_GAP · Pre-deploy PASS ≠ post-deploy PASS · public/cache JSON = display-only

### Allowed UI labels
`LIVE: OFF` · `ORDER PLACEMENT: OFF` · `APPROVAL: NOT_APPROVED` · `PHASE M-0B: BLOCKED` · `PAPER FILLS: DATA_GAP (0)` · `SOURCE: runtime root (verified post-deploy / pending)` · `CACHE — display only` · `PRE-DEPLOY ONLY`

### Forbidden UI labels/claims
`Live Ready` · `Production Ready` · `Approved` · `Paper PASS` (ขณะ 0 fills) · `Source-of-truth verified` (ขณะไม่มี post-deploy evidence) · ซ่อน blocker · ลดสีแดงเป็นเขียวโดยไม่มีหลักฐาน · แสดง cache เป็น authoritative

### PASS / WARNING / FAIL
- **PASS:** แสดง required truths ครบ + ไม่มี forbidden label + cache ติดป้าย display-only + DATA_GAP แสดงเป็น DATA_GAP
- **WARNING:** แสดง blocker ถูกแต่ wording ไม่ครบ (เช่นไม่ระบุ cache display-only / ไม่บอก pre-deploy)
- **FAIL:** มี forbidden claim ใด ๆ / ซ่อน blocker / 0 fills แสดงเป็น PASS / cache เป็น authoritative

### False readiness examples (ต้อง FAIL)
"✅ ระบบพร้อมเทรดจริง" · "Production Ready" · "Paper edge confirmed" (ขณะ 0 fills) · "ข้อมูลล่าสุดจาก exchange" (ขณะอ่าน cache)

---

## 8) Env Documentation Patch Proposal (Part G)

> เสนอเพิ่มใน `.env.example` (ปัจจุบันขาด 2 ตัวแรก) — **ไม่แก้ `.env` จริง ไม่ใส่ค่า secret**

| Key | Purpose | Safe Default | Required Evidence | Risk if missing | Required before M-0B | ต้อง disabled/not_approved |
|-----|---------|--------------|-------------------|-----------------|----------------------|----------------------------|
| `PAPER_TRADING_ENABLED` | เปิด/ปิด paper runner | `false` (ปลอดภัย) | runner ทำงาน + มี event | runner ไม่รัน → 0 fills เข้าใจผิดว่า bug | **yes** | ปิดได้/เปิดเฉพาะ paper เท่านั้น (ไม่ทำให้ live) |
| `EXECUTION_AUDIT_ROOT_DIR` | root ของ audit jsonl | `<PROJECT_ROOT>` | reader+writer path ตรง | path mismatch → reader หาไฟล์ไม่เจอ | **yes** | n/a |
| `BINGX_AGENT_DIR` | runtime source-of-truth root | `<PROJECT_ROOT>` | `echo` = httpdocs | reader อ่าน root ผิด | **yes** | n/a |
| `LIVE_TRADING_ENABLED` | สวิตช์ live | `false` | env value | เปิด = อันตรายสูงสุด | **yes** | **yes (ต้อง false)** |
| `ENABLE_ORDER_PLACEMENT` | ส่ง order จริง | `false` | env value | เปิด = ส่ง order จริง | **yes** | **yes (ต้อง false)** |
| `PRODUCTION_TRADING_READY` | ธง production | `false` | env value | เปิด = อ้าง ready เท็จ | **yes** | **yes (ต้อง false)** |
| `EXCHANGE_MANUAL_APPROVAL` | อนุมัติ manual | `not_approved` | Operator review หลัง gate ครบ | approve ก่อนเวลา = bypass safety | **yes** | **yes (ต้อง not_approved จนทุก gate PASS)** |

**เสนอ text เพิ่มใน `.env.example` (ต่อท้าย safety flags block):**
```
# Paper trading runner (external execution-runner). Keep paper-only; never enables live.
PAPER_TRADING_ENABLED=false
# Root for paper execution audit jsonl. Defaults to BINGX_AGENT_DIR if unset.
EXECUTION_AUDIT_ROOT_DIR=/var/www/vhosts/ob-gate.com/httpdocs
```

---

## 9) Evidence Redaction & Secret-Safety Policy (Part H)

**Redaction rules (ก่อนวางหลักฐานทุกครั้ง):**
- แทนที่ key/token/cookie/password ด้วย `<REDACTED>` ก่อน paste
- ตัด query string ที่มี token ออกจาก URL → `https://host/path?<REDACTED>`
- ตัด header `Authorization`, `Cookie`, `Set-Cookie` ออก
- env dump ให้แสดงเฉพาะ "key มี/ไม่มี" และค่า flag ปลอดภัย (false/not_approved) — ห้ามแสดงค่า secret

**Forbidden evidence content (ห้ามมีในหลักฐาน):** API keys · secret keys · bearer tokens · session cookies · passwords · private URL ที่มี token · เนื้อหา `.env`

**ถ้าเผลอเปิด secret จริง:**
1. Claude **หยุดทันที** ไม่ประมวลผลต่อ, ไม่ echo ค่า secret กลับ
2. classify evidence นั้นเป็น **REJECT** (เป็นพิษ) → ไม่นับเป็น PASS
3. แจ้งว่าเป็น secret exposure + ระบุชนิด (ไม่ทวนค่า)
4. **Operator ต้อง rotate secret** ถ้าค่าที่เปิดเป็นของจริง production (Claude ไม่ rotate เอง)

**Classification impact:** หลักฐานที่มี secret → REJECT เสมอ → gate ที่เกี่ยวข้อง = BLOCKED จนกว่าจะส่งหลักฐานใหม่ที่ redact แล้ว

**Stop condition:** พบ secret / .env content / runtime JSON committed → หยุด parse, mark REJECT, ขอหลักฐานใหม่

**Claude ห้าม print กลับเด็ดขาด:** API keys, secret keys, bearer tokens, session cookies, passwords, private URLs with tokens, `.env` contents

---

## 10) Documentation Patch Proposal (Part I)

> เสนอเท่านั้น — Claude ไม่แก้ไฟล์เหล่านี้ในเฟส offline (ยกเว้นไฟล์ packet ใหม่นี้)

| # | File | Section | Exact text to add/replace | Reason | Safety impact | Req/Opt | Apply by |
|---|------|---------|---------------------------|--------|---------------|---------|----------|
| 1 | `docs/M0Z6_CONTROL_INDEX.md` | Control Packets table | เพิ่มแถว: `\| M-0Z-6F \| docs/M0Z6F_*.md \| Evidence Validator Spec \| (ตามที่ทำ) \|` และ `\| M-0Z-6G \| docs/M0Z6G_OFFLINE_ACCEPTANCE_PACK.md \| Acceptance Test Pack + Fixture Library + Gate Simulator \| ✅ done \|` | index ให้ครบ ป้องกัน packet หาย | ป้องกัน phase churn | required | Claude/any |
| 2 | `PROJECT_CONTEXT.md` | Offline Static Findings | เพิ่มบรรทัด: `- M-0Z-6G: Acceptance Test Pack (40 cases) + 19 fixtures + Gate Simulator spec → docs/M0Z6G_OFFLINE_ACCEPTANCE_PACK.md` | ชี้ที่อยู่ artifact | ไม่กระทบ readiness | required | Claude/any |
| 3 | `PROJECT_CONTEXT.md` | Decision | คงข้อความ `Phase M-0B remains BLOCKED.` (ไม่เปลี่ยน) | กันเข้าใจผิด | คง BLOCKED | required | คงเดิม |
| 4 | `docs/SERVER_EVIDENCE_LEDGER.md` | ledger | เพิ่ม section "M-0Z-6G Offline Acceptance Pack — 2026-05-29" ระบุว่าเป็น spec/fixture (synthetic) ไม่ใช่ server evidence | แยก synthetic จาก real | กัน fixture ปนหลักฐานจริง | required | Claude/any |
| 5 | `.env.example` | ท้าย safety block | เพิ่ม 2 keys ตาม §8 | document paper keys ที่ขาด | ลด 0-fill misdiagnosis | required | Codex (commit) |
| 6 | `PROJECT_MAP.md` | Changelog | เพิ่มแถว M-0Z-6G + คง gate matrix เป็น control board | track history | ไม่อ้าง ready | optional | Claude/any |

---

## 11) Risk Register v4 (Part J)

| # | Risk | Sev | Prob | Detection | Mitigation | Owner Later | Claude Offline Now | Status | M-0B Impact |
|---|------|-----|------|-----------|------------|-------------|--------------------|--------|-------------|
| 1 | false live-ready claim | Critical | Med | AT-5.2/6.1, parser | block claim, simulator FAIL | Operator | ใส่ rule + fixture #6/#11 | mitigated-spec | hard |
| 2 | runtime path mismatch | High | Med | AT-3.1 | verify echo | Operator | contract row 4–6 | PENDING_EXTERNAL | required |
| 3 | cache used as source-of-truth | High | Med | AT-4.1/4.2 | reader=root only | Codex | static finding ผ่าน | STATIC_FINDING ok | required |
| 4 | runtime JSON committed | High | Low | AT-1.1, git policy | `.gitignore`, simulator FAIL | Codex | rule + fixture #2-class | mitigated-spec | hard |
| 5 | secret committed | Critical | Low | AT-1.1, redaction | REJECT+rotate | Operator | redaction policy §9 | mitigated-spec | hard |
| 6 | .env committed | Critical | Low | AT-1.1 | block, REJECT | Codex/Operator | rule | mitigated-spec | hard |
| 7 | paper gate falsely PASS | High | Med | AT-8.x, simulator | DATA_GAP≠PASS | Claude review | simulator Tier3 | mitigated-spec | required |
| 8 | 0 fills misread as failure | Med | High | decision tree | classify DATA_GAP | Claude | fixture #12 | mitigated-spec | required |
| 9 | 0 fills misread as PASS | High | Med | AT-8.1 | DATA_GAP→BLOCKED | Claude | simulator | mitigated-spec | required |
| 10 | fills missing averageFillPrice | High | Med | AT-8.2 | FAIL (bug, no downgrade) | Codex | fixture #13 | DATA_GAP จนมี fill | required |
| 11 | fills missing fillQty | High | Med | AT-8.2 | FAIL | Codex | fixture #14 | DATA_GAP | required |
| 12 | closed cycle absent | High | High | AT-8.3 | not PASS→BLOCKED | wait+Codex | matrix row 20 | DATA_GAP | required |
| 13 | post-deploy health not rechecked | High | Med | AT-5.1 | force post-deploy curl | Operator | rule | PENDING_EXTERNAL | required |
| 14 | visual gate skipped | Med | Med | AT-6.1 | require checklist | Operator | spec §7 | PENDING_EXTERNAL | required |
| 15 | approval premature | Critical | Low | AT-9.1, simulator | not_approved until all PASS | Operator | simulator Tier4 | NOT_APPROVED | hard |
| 16 | strategy overrides safety gate | Critical | Low | code review | safety > strategy | Codex | note | not-in-scope offline | hard |
| 17 | deployed code ≠ build evidence | High | Med | AT-2.3 | pin hash | Operator/Codex | matrix | PENDING_EXTERNAL | required |
| 18 | stale runtime treated as fresh | Med | Med | AT-3.3 | freshness check | Operator | rule | PENDING_EXTERNAL | required |
| 19 | paper simulation path mismatch | High | Med | AT-7/contract 11 | sync writer/reader path | Codex | matrix row 11 | PENDING_EXTERNAL | required |
| 20 | paper runner env missing | High | High | contract 1–4 | document+set env | Codex/Operator | §8 patch | STATIC_FINDING (ขาด) | required |
| 21 | paper writer absent/not running | High | High | AT-7.1 | start runner | Operator | leading candidate | DATA_GAP | required |
| 22 | .env.example missing paper keys | Med | Confirmed | grep | add keys | Codex | §8 proposal | STATIC_FINDING | required |
| 23 | dashboard hides expected blockers | High | Med | AT-6.1 | show truths | Codex(frontend) | spec §7 | PENDING_EXTERNAL | required |
| 24 | pre-deploy evidence as post-deploy | High | Med | AT-5.1 timestamp | require post-deploy stamp | Claude parser | rule | mitigated-spec | required |
| 25 | parser accepts incomplete evidence | High | Med | required-field check | reject missing field | Claude | AT rules | mitigated-spec | required |
| 26 | API and UI disagree | Med | Med | cross-check | reconcile | Codex | note | PENDING_EXTERNAL | required |
| 27 | no_data treated as healthy PASS | High | Med | AT-7.1 | no_data≠PASS | Claude | fixture #17 | mitigated-spec | required |
| 28 | fixtures mistaken as real evidence | High | Med | label check | SYNTHETIC label ทุก fixture | Claude | §4 + ledger note #4 | mitigated-spec | required |

---

## 12) Final Offline Handoff (Part K)

**Completed by Claude now (offline):**
Acceptance Test Pack (10 groups / 40 cases) · Evidence Fixture Library (19 synthetic) · M-0B Gate Simulator Spec (16 inputs + pseudocode) · Paper Runner Contract Test Matrix (23 rows) · /public Truthfulness Acceptance Spec · Env Documentation Patch Proposal (7 keys) · Evidence Redaction & Secret-Safety Policy · Documentation Patch Proposal · Risk Register v4 (28) · this packet file `docs/M0Z6G_OFFLINE_ACCEPTANCE_PACK.md`

**Still external later (PENDING_EXTERNAL):**
Codex release confirmation · Plesk deploy · runtime root verification · runtime file existence · post-deploy public health · /public visual · paper runner evidence · paper performance evidence · real paper fill evidence · closed cycle evidence · EXCHANGE_MANUAL_APPROVAL review

**Must remain BLOCKED:**
Phase M-0B implementation · read-only exchange API implementation · live trading · order placement · any approval implying live-ready

---

## 13) Files To Inspect / Files Not To Touch (Part L)

**Inspect (read-only):** `PROJECT_CONTEXT.md` · `PROJECT_MAP.md` · `PROJECT_ARCHITECTURE.md` · `docs/M0Z6_CONTROL_INDEX.md` · `docs/SERVER_EVIDENCE_LEDGER.md` · `docs/RUNTIME_FILES_GIT_POLICY.md` · `docs/M0B_OPERATOR_EVIDENCE_PACK.md` · `dashboard/lib/readPaperJournal.ts` · `dashboard/lib/paperPerformance.ts` · `dashboard/app/api/paper-performance/route.ts` · `dashboard/app/public/page.tsx` · `.env.example`

**Do NOT touch:** `latest_decision.json` · `market_snapshot.json` · `paper_pnl.jsonl` · paper journals · runtime JSON/JSONL/TXT · `.env` · `.env.*` · secrets · `node_modules` · `.next` · `logs/` · deployment files

---

## 14) Final Decision

Phase M-0B remains **BLOCKED**.
Live trading remains **DISABLED**.
Order placement remains **DISABLED**.
EXCHANGE_MANUAL_APPROVAL remains **not_approved**.

Claude completed offline acceptance-test, evidence-fixture, and M-0B simulator hardening, but external evidence is still required before READY_FOR_REVIEW.
