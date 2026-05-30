# Phase M-0Z-6H — Offline Control-Pack Consolidation + Evidence Review Runbook + M-0B No-Go Compiler

> ผู้จัดทำ: Claude cowork (Principal Developer / QA Gatekeeper / Evidence Parser / Runbook Hardening)
> วันที่: 2026-05-29
> ประเภท: **OFFLINE / STATIC EXECUTION** — ไม่มี Git, ไม่ deploy, ไม่แตะ runtime, ไม่เรียก BingX, ไม่เปิด trading
> เป้าหมาย: รวมงาน offline ทั้งหมด (6A–6G) ให้เป็น **ระบบรีวิว evidence เดียว** ที่หยิบมาใช้ได้ทันทีเมื่อหลักฐานจริงมาถึง
> สถานะปลายทาง: **Phase M-0B BLOCKED** (ไม่เปลี่ยน)

---

## 1) Current State Confirmation (Part A)

**Current Phase:** M-0Z-6 — Evidence Intake Execution + Post-Deploy Triage + Paper Liveness Decision
**Offline sub-phase ตอนนี้:** M-0Z-6H — Control-Pack Consolidation + Evidence Review Runbook + No-Go Compiler

| สถานะ | รายการ |
|--------|--------|
| **PASS** | env safety flags (LIVE/ORDER/PROD = false ใน `.env.example`) |
| **PRE_DEPLOY_PASS_ONLY** | `npm run build` EXIT:0 · `/api/public-health` JSON · protected endpoints SAFE_W_BLOCKERS |
| **STATIC_FINDING** | reader path ถูกต้อง (resolve จาก `EXECUTION_AUDIT_ROOT_DIR→BINGX_AGENT_DIR→tmp`) · route try/catch→`no_data` ปลอดภัย · `.env.example` ขาด paper keys |
| **INSTRUMENTATION_FIXED_PENDING_DEPLOY** | Fix 1 (ORDER_FILLED parse) · Fix 2 (FILL_RESULT ใน extractFills) |
| **PENDING_EXTERNAL** | Git release · Plesk deploy · `BINGX_AGENT_DIR` verify · runtime files verify · public-health post-deploy · `/public` visual · paper-performance post-deploy |
| **DATA_GAP** | paper fills (0) · closed cycles (0) |
| **NOT_APPROVED** | `EXCHANGE_MANUAL_APPROVAL` |
| **BLOCKED** | Phase M-0B |

**Claude ทำต่อได้ offline ตอนนี้:** consolidation index, review runbook, no-go compiler, scoring rubric, decision worksheet, paper liveness pack, /public truth pack, escalation map, doc patches, risk v5 — ครบในเอกสารนี้

**สิ่งที่ห้าม upgrade เป็น PASS แบบ offline (เด็ดขาด):**
- post-deploy gates ใด ๆ (ยังไม่ deploy → PENDING_EXTERNAL เท่านั้น)
- paper fills / closed cycles (0 → DATA_GAP เท่านั้น ไม่ใช่ PASS ไม่ใช่ FAIL)
- `EXCHANGE_MANUAL_APPROVAL` (not_approved จนทุก gate PASS)
- pre-deploy PASS → ห้ามนับเป็น post-deploy PASS
- synthetic fixture (6G) → ห้ามนับเป็นหลักฐานจริง

---

## 2) What Claude Completed Offline Now

1. ✅ Control-Pack Consolidation Index — 13 artifacts ที่ควรมีครบ + สถานะ
2. ✅ Evidence Review Runbook — 14 steps (รับ pasted text ได้)
3. ✅ M-0B No-Go Compiler Spec — 20 inputs + pseudocode + 5 sample outputs
4. ✅ Evidence Quality Scoring Rubric — 0–5 ใช้กับ 9 evidence types
5. ✅ Reviewer Decision Worksheet — copy-paste template
6. ✅ Paper Runner Liveness Review Pack — 10 sections
7. ✅ /public Truthfulness Review Pack — 10 truth statements
8. ✅ Failure Escalation Map (offline-only, ไม่พึ่ง Codex/Operator) — 14 classes
9. ✅ Documentation Patch Proposal v4
10. ✅ Risk Register v5 — 30 risks
11. ✅ Final Offline No-Go Packet + Files inspect/not-touch

---

## 3) Control-Pack Consolidation Index (Part B)

> รวม artifact offline ที่ควรมีครบ ณ ตอนนี้ และอ้างที่อยู่ไฟล์จริง

| # | Artifact | Purpose | Usefulness ตอนนี้ | Required Inputs | Output | Prevents | ต้องใช้ external evidence? | M-0B impact |
|---|----------|---------|-------------------|-----------------|--------|----------|---------------------------|-------------|
| 1 | Source-of-Truth Contract (`M0Z6E`) | นิยาม root vs cache | สูง | runtime root + reader code | กฎ root authoritative | cache เป็น truth | ไม่ (spec) | required |
| 2 | Paper Engine Ops Contract (`M0Z6E`) | นิยาม runner/env/path | สูง | env keys + path | ops contract | runner misconfig | ไม่ (spec) | required |
| 3 | Evidence Validator Spec (`M0Z6F`) | กฎ classify evidence | สูง | evidence groups | PASS/WARN/FAIL/PENDING/DATA_GAP/REJECT | mis-classify | ไม่ | required |
| 4 | Evidence Parser Pseudocode (`M0Z6F`) | parse pasted text | สูง | pasted blocks | classified gates | accept incomplete | ไม่ | required |
| 5 | Paper Runner Contract Matrix (`M0Z6G`) | 23-row contract tests | สูง | env/journal/schema | per-row PASS/FAIL/DATA_GAP | path/schema gap | บางส่วน (รัน later) | required |
| 6 | /public Truthfulness Spec (`M0Z6G`) | allowed/forbidden labels | สูง | UI screenshot | PASS/WARN/FAIL | false readiness | post-deploy visual | required |
| 7 | M-0B Gate Simulator (`M0Z6G`) | 16-input simulator | สูง | gate statuses | BLOCKED/READY_FOR_REVIEW | premature ready | ใช้ค่าจริง later | required |
| 8 | Evidence Fixture Library (`M0Z6G`) | 19 synthetic fixtures | กลาง (ทดสอบ parser) | — | sample classifications | parser bug | ไม่ (synthetic) | support |
| 9 | Acceptance Test Pack (`M0Z6G`) | 40 test cases | สูง | evidence | per-test verdict | ad-hoc judgment | ใช้ค่าจริง later | required |
| 10 | Risk Register (`M0Z6G`/นี่ v5) | risk tracking | สูง | — | mitigations | blind spots | ไม่ | required |
| 11 | Secret-Safety Policy (`M0Z6G`) | redaction rules | สูง | pasted evidence | safe handling | secret leak | ไม่ | required |
| 12 | Documentation Patch Proposal (นี่ v4) | doc updates เสนอ | กลาง | docs | patch text | doc drift | ไม่ | support |
| 13 | M-0B No-Go Memo (นี่) | คำตัดสินรวม | สูง | gate matrix | BLOCKED | false go | ไม่ | required |

**Coverage:** artifact spec/offline ครบทั้ง 13. ที่ยังเปิดอยู่คือ "ค่าจริงจาก external" ที่ใส่เข้า simulator/acceptance/contract — ทั้งหมด PENDING_EXTERNAL

---

## 4) Evidence Review Runbook (Part C)

> ใช้ได้แม้ evidence มาเป็น text แปะ. ทุก step คืน output field ลงใน Worksheet (§7)

| Step | Objective | Required Evidence | PASS | FAIL | PENDING | Common Trap | Output Field |
|------|-----------|-------------------|------|------|---------|-------------|--------------|
| 1 Intake | รับ + ติด review id/date | raw text | รับครบ | — | ไม่มี evidence | `review_id`, `evidence_source` |
| 2 Redact | ลบ secret ก่อน parse | — | redact แล้ว | พบ secret→REJECT | — | แปะ secret ดิบ | `secret_exposure` |
| 3 Classify type | ระบุชนิด gate | header/content | ระบุได้ | — | คลุมเครือ | เดาผิดชนิด | `evidence_type` |
| 4 Freshness | เช็ค timestamp | ts/mtime | สด | stale อ้าง fresh | ไม่มี ts | ไม่มี ts ถือว่าใหม่ | `evidence_freshness` |
| 5 Pre vs post deploy | แยกเฟส | deploy marker | post-deploy ชัด | pre อ้าง post | ไม่ระบุ | reuse pre เป็น post | `pre_or_post_deploy` |
| 6 Source-of-truth | root vs cache | path | root | cache เป็น truth | ไม่ระบุ source | cache=authoritative | `sot_aligned` |
| 7 Safety flags | LIVE/ORDER/PROD | env values | =false | ตัวใด=true | ไม่มีค่า | ไม่เช็ค | `safety_flags_status` |
| 8 /public truth | UI truthfulness | screenshot | truths ครบ | false claim | ไม่มี visual | ซ่อน blocker | `expected_blockers_present` |
| 9 Paper liveness | runner alive | event ts | event สด | endpoint 5xx | no curl | no_data=PASS | `paper_fills_count` |
| 10 Paper fill quality | schema fill | fill sample | field ครบ | ขาด price/qty (bug) | 0 fills | 0=fail | `averageFillPrice_present`,`fillQty_present` |
| 11 Closed cycles | entry+exit | cycle data | มี realized | อ้างไม่มี exit | 0 cycles | warning แทน gap | `closed_cycle_present` |
| 12 Approval | manual approval | env | approved+gate ครบ | approve ก่อนเวลา | — | approve เร็ว | `approval_status` |
| 13 Compile | รวมผ่าน No-Go Compiler | ทุก field | — | — | — | ข้าม gate | `classification`,`score` |
| 14 Final | no-go / ready-for-review | compiler output | READY_FOR_REVIEW (ครบ PASS) | BLOCKED | BLOCKED | สับสน ready=live | `final_decision`,`next_safe_action` |

---

## 5) M-0B No-Go Compiler Spec (Part D)

### Inputs (20)
```
buildStatus, codexReleaseStatus, safeStagingStatus,
noRuntimeJsonCommitted, noSecretsCommitted,
pleskDeployStatus, runtimeRootStatus, runtimeFilesStatus,
publicHealthPostDeployStatus, publicVisualTruthStatus,
paperRunnerLivenessStatus, paperPerformanceStatus,
paperFillQualityStatus, closedCycleStatus,
exchangeManualApprovalStatus,
liveTradingFlag, orderPlacementFlag, productionTradingReadyFlag,
sourceOfTruthStatus, secretExposureStatus, falseReadinessStatus
Output: BLOCKED | READY_FOR_REVIEW    # ไม่มี LIVE_READY (out of scope)
```

### Pseudocode
```
function compileM0B(g):
    # Tier 0 — safety violations (รุนแรงสุด → FAIL+BLOCKED)
    if g.liveTradingFlag:            return FAIL_BLOCKED("live trading enabled")
    if g.orderPlacementFlag:         return FAIL_BLOCKED("order placement enabled")
    if g.productionTradingReadyFlag: return FAIL_BLOCKED("production_ready before evidence")
    if g.secretExposureStatus==FAIL: return FAIL_BLOCKED("secret exposure → run secret-handling")
    if g.falseReadinessStatus==FAIL: return FAIL_BLOCKED("false live-ready claim")
    if g.noSecretsCommitted==FAIL:   return BLOCKED("secret committed")
    if g.noRuntimeJsonCommitted==FAIL:return BLOCKED("runtime JSON committed")

    required = [buildStatus, codexReleaseStatus, safeStagingStatus,
                pleskDeployStatus, runtimeRootStatus, runtimeFilesStatus,
                publicHealthPostDeployStatus, publicVisualTruthStatus,
                paperRunnerLivenessStatus, paperPerformanceStatus,
                paperFillQualityStatus, closedCycleStatus]

    # Tier 1 — any FAIL
    if any(x==FAIL for x in required):          return BLOCKED("a required gate FAILED")
    # Tier 2 — source-of-truth ambiguity
    if g.sourceOfTruthStatus==AMBIGUOUS:        return BLOCKED("source-of-truth ambiguous")
    # Tier 3 — any PENDING_EXTERNAL
    if any(x==PENDING_EXTERNAL for x in required): return BLOCKED("evidence pending external")
    # Tier 4 — paper specifics
    if g.paperFillQualityStatus==DATA_GAP:      return BLOCKED("paper fills = DATA_GAP")
    if g.closedCycleStatus!=PASS:               return BLOCKED("closed cycles not PASS")
    # Tier 5 — approval
    if g.exchangeManualApprovalStatus!=approved:return BLOCKED("manual approval not approved")
    # Tier 6 — unresolved WARNING
    if any(x==WARNING for x in required):       return BLOCKED("unresolved WARNING")
    # Pass-through
    if all(x==PASS for x in required):          return READY_FOR_REVIEW
    return BLOCKED("default deny")
```

### Sample Outputs
1. **ทุกอย่าง PENDING_EXTERNAL** → `BLOCKED("evidence pending external")` ✅ (สถานะปัจจุบัน)
2. **paper zero fills** (`paperFillQualityStatus=DATA_GAP`) → `BLOCKED("paper fills = DATA_GAP")`
3. **public visual=WARNING, paper=PASS, อื่นทุกตัว PASS** → `BLOCKED("unresolved WARNING")` (ต้องแก้ warning ก่อน — *ไม่ใช่* READY_FOR_REVIEW candidate ตราบใดที่ยังมี WARNING; ถ้า warning แก้แล้วเป็น PASS จึง READY_FOR_REVIEW)
4. **secret exposure** → `FAIL_BLOCKED("secret exposure → run secret-handling")`
5. **approval not_approved** (ที่เหลือ PASS) → `BLOCKED("manual approval not approved")`

> หมายเหตุ sample 3: spec บอก "warning only แต่ paper PASS = READY_FOR_REVIEW candidate" — แต่ compiler นี้เลือก **deny-by-default**: WARNING ที่ยังไม่ resolve = BLOCKED. คำว่า "candidate" หมายถึง *ใกล้* เท่านั้น ต้อง clear WARNING → PASS ก่อนถึงจะ READY_FOR_REVIEW จริง

---

## 6) Evidence Quality Scoring Rubric (Part E)

**สเกล 0–5:** 0=หาย/ใช้ไม่ได้/secret leak · 1=มีแต่ stale/partial/pre-deploy only · 2=มีโครงแต่ขาด field บังคับ · 3=ใช้ได้แต่มี warning/ต้อง corroborate · 4=แข็งแรง สด source ตรง ไม่มี safety issue · 5=ครบ สด post-deploy ตามต้อง source ตรง ไม่มี secret ไม่มี false readiness

| Evidence Type | min score = PASS | WARNING | FAIL | PENDING_EXTERNAL | M-0B impact |
|---------------|------------------|---------|------|------------------|-------------|
| 1 Codex release | ≥4 | 3 | 0 (secret) | 1–2 ไม่มี hash | required |
| 2 Deploy | ≥4 | 3 | 0 (runtime overwrite) | 1 ยังไม่ deploy | required |
| 3 Runtime root | =5 | 3–4 | 0 (path mismatch) | 1 ยังไม่ตรวจ | required |
| 4 Public health | ≥4 (post-deploy) | 3 | 0 (stack trace/false ready) | 1 pre-deploy only | required |
| 5 Visual | ≥4 | 3 (expected blockers แต่ wording ไม่ครบ) | 0 (live-ready claim) | 1 ยังไม่ดู | required |
| 6 Paper runner | ≥4 | 3 (stale) | 0 (5xx) | 1 no curl; DATA_GAP=1 ถ้า 0 event | required |
| 7 Paper performance | ≥4 | 3 | 0 (gross เป็น net) | 1 no_data | required |
| 8 Closed cycle | =5 | 3 (ไม่ครบ cycle) | 0 (อ้างไม่มี exit) | DATA_GAP ถ้า 0 | required |
| 9 Approval | =5 (approved+ทุก gate PASS) | — | 0 (approve ก่อนเวลา) | not_approved=คงสถานะ | hard |

**กฎทับ:** 0 fills → score สูงสุด = 1 (DATA_GAP) ไม่ว่าโครงสร้างดีแค่ไหน · มี secret → score = 0 + REJECT เสมอ

---

## 7) Reviewer Decision Worksheet (Part F)

```
========== M-0B EVIDENCE REVIEW WORKSHEET ==========
review_id:                 __________
date_time:                 __________ (ISO 8601)
reviewer:                  __________ (Claude / Operator / Codex)
phase:                     M-0Z-6  (gate target: M-0B)
evidence_source:           __________ (Codex push / Plesk / curl / browser)
evidence_type:             [ ] release [ ] deploy [ ] runtime-root [ ] public-health
                           [ ] visual [ ] paper-runner [ ] paper-perf [ ] closed-cycle [ ] approval
evidence_freshness:        [ ] fresh  [ ] stale  [ ] no-timestamp
secret_exposure:           [ ] no  [ ] YES → STOP + REJECT + secret-handling
pre_or_post_deploy:        [ ] pre-deploy  [ ] post-deploy  [ ] unknown
sot_aligned (root):        [ ] yes  [ ] no  [ ] ambiguous
expected_blockers_present: [ ] yes  [ ] no
real_bugs_present:         [ ] no  [ ] YES → FAIL (do not downgrade)
paper_fills_count:         ______  (0 = DATA_GAP)
averageFillPrice_present:  [ ] yes  [ ] no(bug)  [ ] n/a(0 fills)
fillQty_present:           [ ] yes  [ ] no(bug)  [ ] n/a(0 fills)
closed_cycle_present:      [ ] yes  [ ] no
approval_status:           [ ] not_approved  [ ] approved
safety_flags_status:       LIVE=___ ORDER=___ PROD=___  (ต้อง false ทั้งหมด)
classification:            [PASS|PRE_DEPLOY_PASS_ONLY|STATIC_FINDING|
                            INSTRUMENTATION_FIXED_PENDING_DEPLOY|PENDING_EXTERNAL|
                            DATA_GAP|NOT_APPROVED|BLOCKED|FAIL|REJECT]
score_0_5:                 ___
m0b_impact:                [ ] required-gate  [ ] hard-gate  [ ] support
final_decision:            [ ] BLOCKED  [ ] READY_FOR_REVIEW (ครบ PASS เท่านั้น)
next_safe_action:          ______________________________________
====================================================
```

---

## 8) Paper Runner Liveness Review Pack (Part G)

1. **Required env evidence:** `PAPER_TRADING_ENABLED`, `EXECUTION_AUDIT_ROOT_DIR`, `BINGX_AGENT_DIR` (redacted dump: key มี/ไม่มี + flag ปลอดภัย)
2. **Required runner/process evidence:** process list / heartbeat ว่า execution-runner รันอยู่
3. **Required journal path evidence:** `ls` พบ `*.jsonl` ใน `<root>/tmp` หรือ `<root>/tmp/execution-runner`
4. **Required writer/reader path alignment:** path ที่ writer เขียน = path ที่ reader resolve (`readPaperJournal.ts` 103–118)
5. **Required event freshness:** last event ts สดตาม cycle
6. **Required ORDER_FILLED / FILL_RESULT schema:** มี orderId/status/qty/price (ORDER_FILLED 308–321; FILL_RESULT 301–306,340–343)
7. **Required closed-cycle:** entry+exit fills → realized/net
8. **Zero-fill decision logic:** 0 fills = **DATA_GAP** หรือ ops/liveness candidate → ตรวจ runner/env/path ก่อน *ห้าม* สรุปเป็น code bug, *ห้าม* PASS
9. **no_data decision logic:** endpoint `no_data` = **PENDING_EXTERNAL** (ยังไม่ deploy) หรือ **DATA_GAP** (deploy แล้วแต่ยังไม่มี data) → *ไม่ใช่* PASS
10. **Code-change threshold:** แก้โค้ดต่อเมื่อ env/path/runner evidence พิสูจน์ว่าเป็น code-side bug จริง (เช่น runner รัน + path ตรง + มี fill จริง แต่ field หาย)

**กฎ:** 0 fills ≠ PASS · no_data ≠ PASS · missing runner evidence = PENDING_EXTERNAL · writer absent = FAIL เฉพาะเมื่อมีหลักฐานยืนยัน absence · ห้าม force-fill · ห้ามแก้ runtime JSON

---

## 9) /public Truthfulness Review Pack (Part H)

| Truth statement | Expected UI wording | Forbidden wording | PASS | WARNING | FAIL | M-0B impact |
|-----------------|--------------------|--------------------|------|---------|------|-------------|
| Live trading disabled | `LIVE: OFF` | "live ready" | แสดงชัด | wording กำกวม | อ้าง live | hard |
| Order placement disabled | `ORDER: OFF` | "trading enabled" | แสดงชัด | กำกวม | อ้างเปิด | hard |
| Approval not_approved | `APPROVAL: NOT_APPROVED` | "approved" | แสดง | — | อ้าง approved | hard |
| M-0B blocked | `PHASE M-0B: BLOCKED` | "ready" | แสดง | — | ซ่อน | required |
| Runtime SoT status | `SOURCE: runtime root (pending verify)` | "verified" (ก่อน post-deploy) | แสดงสถานะจริง | กำกวม | อ้าง verified เท็จ | required |
| Cache display-only | `CACHE — display only` | "ข้อมูลล่าสุดจาก exchange" | ติดป้าย | ไม่ติดป้าย | cache=authoritative | required |
| Paper evidence status | `PAPER: DATA_GAP` | "paper PASS" | แสดง | — | อ้าง PASS | required |
| 0 fills = DATA_GAP | `FILLS: 0 (DATA_GAP)` | "0 fills OK/PASS" | แสดง | — | 0=PASS | required |
| Post-deploy health pending | `HEALTH: pre-deploy only` | "post-deploy verified" | แสดง | กำกวม | อ้าง verified | required |
| No live-ready claim | (ไม่มี banner ready) | "Production Ready ✅" | ไม่มี claim | — | มี claim | hard |

---

## 10) Failure Escalation Map (Part I) — offline, ไม่พึ่ง Codex/Operator

| # | Failure class | Classification | Why matters | Claude offline action now | External action later | Do NOT | M-0B impact |
|---|---------------|----------------|-------------|---------------------------|----------------------|--------|-------------|
| 1 | missing evidence | PENDING_EXTERNAL | gate ไม่ครบ | mark + define field ที่ต้องการ | ส่ง evidence | อย่าเดา PASS | BLOCKED |
| 2 | stale evidence | WARNING/PENDING | อาจไม่ตรงสถานะ | flag freshness | curl ใหม่ | อย่านับ fresh | BLOCKED |
| 3 | pre-deploy reused as post | FAIL (ถ้าอ้าง)/PENDING | หลอกว่า deploy แล้ว | แยก marker | curl post-deploy | อย่า reuse | BLOCKED |
| 4 | source-of-truth ambiguity | BLOCKED | cache อาจถูกใช้เป็น truth | บันทึก ambiguous | verify root post-deploy | อย่าปล่อยผ่าน | BLOCKED |
| 5 | paper zero fills | DATA_GAP | edge ยังพิสูจน์ไม่ได้ | classify DATA_GAP + liveness checklist | start runner | อย่า force-fill | BLOCKED |
| 6 | endpoint no_data | PENDING/DATA_GAP | ไม่มี data | mark, ไม่ใช่ PASS | curl post-deploy | no_data≠PASS | BLOCKED |
| 7 | fills missing averageFillPrice | FAIL (bug) | ราคาเข้าหาย | บันทึก bug, ชี้ schema | Codex สอบ writer | อย่า downgrade | BLOCKED |
| 8 | fills missing fillQty | FAIL (bug) | ปริมาณหาย | บันทึก bug | Codex สอบ writer | อย่า downgrade | BLOCKED |
| 9 | missing closed cycles | DATA_GAP/WARNING | edge ยังไม่ครบ | mark | รอ accumulate | อย่า PASS | BLOCKED |
| 10 | /public false readiness | FAIL | สื่อสารเท็จ | flag forbidden wording | Codex แก้ UI | อย่าปล่อย | BLOCKED |
| 11 | secret exposure | FAIL+REJECT | ความปลอดภัย | STOP+redact+REJECT | Operator rotate | อย่า echo secret | BLOCKED |
| 12 | runtime JSON committed | BLOCKED | ละเมิด git policy | flag | Codex `rm --cached` (ไม่ใช่ Claude) | อย่าลบ server file | BLOCKED |
| 13 | approval premature | FAIL | bypass safety | flag | Operator review | อย่า approve | BLOCKED |
| 14 | safety flag enabled | FAIL+BLOCKED | อันตรายสูงสุด | flag ทันที | ปิด flag | อย่าเปิด | hard |

---

## 11) Documentation Patch Proposal v4 (Part J)

> เสนอเท่านั้น — Claude แก้เฉพาะ packet ใหม่นี้ ไม่แก้ไฟล์อื่นในเฟส offline

| # | File | Section | Exact text to add/replace | Reason | Safety impact | Req/Opt | Apply by |
|---|------|---------|---------------------------|--------|---------------|---------|----------|
| 1 | `docs/M0Z6_CONTROL_INDEX.md` | Control Packets table | เพิ่ม: `\| M-0Z-6H \| docs/M0Z6H_CONTROL_PACK_CONSOLIDATION.md \| Control-Pack Consolidation + Review Runbook + No-Go Compiler \| ✅ done \|` | รวม packet | ป้องกัน phase churn | required | Claude/any |
| 2 | `docs/M0Z6_CONTROL_INDEX.md` | (ใหม่) "M-0Z-6 Control Pack" | จัดกลุ่ม 6E–6H เป็น "Offline Control Pack" ชุดเดียว | กัน churn | ลด confusion | required | Claude/any |
| 3 | `PROJECT_CONTEXT.md` | Offline Static Findings | เพิ่ม: `- M-0Z-6H: Control-Pack consolidation + Evidence Review Runbook (14 steps) + No-Go Compiler (20 inputs) → docs/M0Z6H_CONTROL_PACK_CONSOLIDATION.md` | ชี้ที่อยู่ | ไม่กระทบ readiness | required | Claude/any |
| 4 | `PROJECT_CONTEXT.md` | Decision | คง `Phase M-0B remains BLOCKED.` | กันเข้าใจผิด | คง BLOCKED | required | คงเดิม |
| 5 | `docs/SERVER_EVIDENCE_LEDGER.md` | ledger | เพิ่ม "M-0Z-6H — 2026-05-29: review system spec (offline, ไม่ใช่ server evidence)" | แยก spec จาก evidence จริง | กัน spec ปนหลักฐาน | required | Claude/any |
| 6 | `.env.example` | safety block | เพิ่ม `PAPER_TRADING_ENABLED=false` + `EXECUTION_AUDIT_ROOT_DIR=<root>` | document keys ที่ขาด | ลด 0-fill misdiagnosis | required | Codex |
| 7 | `PROJECT_MAP.md` | Changelog | เพิ่มแถว M-0Z-6H | track history | ไม่อ้าง ready | optional | Claude/any |

---

## 12) Risk Register v5 (Part K)

| # | Risk | Sev | Prob | Detection | Mitigation | Owner Later | Claude Offline Now | Status | M-0B Impact |
|---|------|-----|------|-----------|------------|-------------|--------------------|--------|-------------|
| 1 | false live-ready claim | Critical | Med | runbook S8, compiler | falseReadiness→FAIL | Operator | rule+pack §9 | mitigated-spec | hard |
| 2 | runtime path mismatch | High | Med | runbook S6 | verify echo | Operator | contract matrix | PENDING_EXTERNAL | required |
| 3 | cache as source-of-truth | High | Med | runbook S6 | reader=root | Codex | static finding ผ่าน | STATIC_FINDING ok | required |
| 4 | runtime JSON committed | High | Low | escalation #12 | gitignore | Codex | rule | mitigated-spec | hard |
| 5 | secret committed | Critical | Low | redaction policy | REJECT+rotate | Operator | escalation #11 | mitigated-spec | hard |
| 6 | .env committed | Critical | Low | runbook S2 | block | Codex | rule | mitigated-spec | hard |
| 7 | paper gate falsely PASS | High | Med | compiler Tier4 | DATA_GAP≠PASS | Claude | compiler | mitigated-spec | required |
| 8 | 0 fills misread as failure | Med | High | pack §8 | classify DATA_GAP | Claude | liveness logic | mitigated-spec | required |
| 9 | 0 fills misread as PASS | High | Med | compiler | DATA_GAP→BLOCKED | Claude | compiler | mitigated-spec | required |
| 10 | no_data treated as PASS | High | Med | rubric/escalation #6 | no_data≠PASS | Claude | rule | mitigated-spec | required |
| 11 | fills missing averageFillPrice | High | Med | runbook S10 | FAIL(bug) | Codex | escalation #7 | DATA_GAP จนมี fill | required |
| 12 | fills missing fillQty | High | Med | runbook S10 | FAIL(bug) | Codex | escalation #8 | DATA_GAP | required |
| 13 | closed cycle absent | High | High | runbook S11 | not PASS→BLOCKED | wait+Codex | rubric #8 | DATA_GAP | required |
| 14 | post-deploy health not rechecked | High | Med | runbook S5 | force post curl | Operator | rule | PENDING_EXTERNAL | required |
| 15 | visual gate skipped | Med | Med | runbook S8 | require checklist | Operator | pack §9 | PENDING_EXTERNAL | required |
| 16 | approval premature | Critical | Low | compiler Tier5 | not_approved until PASS | Operator | compiler | NOT_APPROVED | hard |
| 17 | strategy overrides safety | Critical | Low | code review | safety>strategy | Codex | note | out-of-scope offline | hard |
| 18 | deployed ≠ build evidence | High | Med | runbook S5 | pin hash | Operator/Codex | matrix | PENDING_EXTERNAL | required |
| 19 | stale runtime treated fresh | Med | Med | runbook S4 | freshness check | Operator | rule | PENDING_EXTERNAL | required |
| 20 | paper sim path mismatch | High | Med | pack §4 | sync path | Codex | contract row 11 | PENDING_EXTERNAL | required |
| 21 | paper runner env missing | High | High | pack §1 | document+set | Codex/Operator | §11 patch | STATIC_FINDING (ขาด) | required |
| 22 | paper writer absent/not running | High | High | pack §2 | start runner | Operator | leading candidate | DATA_GAP | required |
| 23 | .env.example missing paper keys | Med | Confirmed | grep | add keys | Codex | §11 #6 | STATIC_FINDING | required |
| 24 | dashboard hides blockers | High | Med | pack §9 | show truths | Codex | spec | PENDING_EXTERNAL | required |
| 25 | pre-deploy as post-deploy | High | Med | runbook S5 | require stamp | Claude | rule | mitigated-spec | required |
| 26 | parser accepts incomplete | High | Med | rubric min-score | reject missing field | Claude | rubric §6 | mitigated-spec | required |
| 27 | API and UI disagree | Med | Med | cross-check | reconcile | Codex | note | PENDING_EXTERNAL | required |
| 28 | synthetic fixtures as real | High | Med | label check | SYNTHETIC label | Claude | index §3 | mitigated-spec | required |
| 29 | reviewer worksheet incomplete but accepted | High | Med | worksheet required fields | บังคับครบทุก field ก่อน decision | Claude/reviewer | §7 mandatory fields | mitigated-spec | required |
| 30 | no-go compiler misconfigured | High | Low | unit test compiler vs fixtures | run §5 vs 6G fixtures | Codex (test later) | spec deny-by-default | mitigated-spec | required |

---

## 13) Final Offline No-Go Packet (Part L)

**Completed by Claude now (M-0Z-6H):**
Control-Pack Consolidation Index (13) · Evidence Review Runbook (14 steps) · M-0B No-Go Compiler Spec (20 inputs + 5 samples) · Evidence Quality Scoring Rubric (0–5 × 9 types) · Reviewer Decision Worksheet · Paper Runner Liveness Review Pack (10 sections) · /public Truthfulness Review Pack (10 statements) · Failure Escalation Map (14 classes) · Documentation Patch Proposal v4 · Risk Register v5 (30) · packet `docs/M0Z6H_CONTROL_PACK_CONSOLIDATION.md`

**Still external later (PENDING_EXTERNAL):**
Codex release confirmation · Plesk deploy · runtime root verification · runtime file existence · post-deploy public health · /public visual · paper runner evidence · paper performance evidence · real paper fill evidence · closed cycle evidence · EXCHANGE_MANUAL_APPROVAL review

**Must remain BLOCKED:**
Phase M-0B implementation · read-only exchange API implementation · live trading · order placement · any approval implying live-ready

---

## 14) Files To Inspect / Files Not To Touch (Part M)

**Inspect (read-only):** `PROJECT_CONTEXT.md` · `PROJECT_MAP.md` · `PROJECT_ARCHITECTURE.md` · `docs/M0Z6_CONTROL_INDEX.md` · `docs/SERVER_EVIDENCE_LEDGER.md` · `docs/RUNTIME_FILES_GIT_POLICY.md` · `docs/M0B_OPERATOR_EVIDENCE_PACK.md` · `dashboard/lib/readPaperJournal.ts` · `dashboard/lib/paperPerformance.ts` · `dashboard/app/api/paper-performance/route.ts` · `dashboard/app/public/page.tsx` · `.env.example`

**Do NOT touch:** `latest_decision.json` · `market_snapshot.json` · `paper_pnl.jsonl` · paper journals · runtime JSON/JSONL/TXT · `.env` · `.env.*` · secrets · `node_modules` · `.next` · `logs/` · deployment files

---

## 15) Final Decision

Phase M-0B remains **BLOCKED**.
Live trading remains **DISABLED**.
Order placement remains **DISABLED**.
EXCHANGE_MANUAL_APPROVAL remains **not_approved**.

Claude completed offline control-pack consolidation and no-go compiler hardening, but external evidence is still required before READY_FOR_REVIEW.
