# Phase M-0Z-6I — Offline Manual Evidence Pack + Reviewer Playbook + Gate Closure Simulator

> ผู้จัดทำ: Claude cowork (Principal Developer / QA Gatekeeper / Evidence Parser / Manual-Ops Pack)
> วันที่: 2026-05-29
> ประเภท: **OFFLINE / STATIC EXECUTION** — ไม่มี Git, ไม่ deploy, ไม่แตะ runtime, ไม่เรียก BingX, ไม่เปิด trading
> เป้าหมาย: เปลี่ยนงาน control M-0Z-6 ทั้งหมดให้เป็น **ระบบรีวิวด้วยมือ (manual)** ที่เจ้าของโปรเจคหยิบใช้ได้เองเมื่อ evidence จาก Codex/Operator มาถึง
> สถานะปลายทาง: **Phase M-0B BLOCKED** (ไม่เปลี่ยน)

---

## 1) Current State Confirmation (Part A)

**Current Phase:** M-0Z-6 — Evidence Intake Execution + Post-Deploy Triage + Paper Liveness Decision
**Offline sub-phase:** M-0Z-6I — Manual Evidence Pack + Reviewer Playbook + Gate Closure Simulator

| สถานะ | รายการ |
|--------|--------|
| **PASS** | env safety flags (LIVE/ORDER/PROD=false ใน `.env.example`) |
| **PRE_DEPLOY_PASS_ONLY** | `npm run build` EXIT:0 · `/api/public-health` JSON · protected endpoints SAFE_W_BLOCKERS |
| **STATIC_FINDING** | reader path ถูกต้อง · route try/catch→`no_data` ปลอดภัย · `.env.example` ขาด paper keys |
| **INSTRUMENTATION_FIXED_PENDING_DEPLOY** | Fix 1 (ORDER_FILLED parse) · Fix 2 (FILL_RESULT extractFills) |
| **PENDING_EXTERNAL** | Git release · Plesk deploy · BINGX_AGENT_DIR verify · runtime files · public-health post-deploy · /public visual · paper-performance post-deploy |
| **DATA_GAP** | paper fills (0) · closed cycles (0) |
| **NOT_APPROVED** | EXCHANGE_MANUAL_APPROVAL |
| **BLOCKED** | Phase M-0B |

**Claude ทำต่อได้ offline ตอนนี้:** manual checklist, dossier template, reviewer playbook, gate closure simulator, mapping table, 0-fill playbook, visual script, secret SOP, go/no-go brief, doc patch v5

**ห้าม upgrade เป็น PASS แบบ offline:** post-deploy gates (→ PENDING_EXTERNAL) · paper fills/closed cycles (→ DATA_GAP) · approval (→ not_approved) · pre-deploy PASS (≠ post-deploy) · synthetic fixture (≠ real) · manual checklist ติ๊กบนกระดาษ (≠ evidence ถ้าไม่มี output จริงแนบ)

---

## 2) What Claude Completed Offline Now

1. ✅ Manual Evidence Checklist (9 กลุ่ม)
2. ✅ Evidence Dossier Template (15 sections, copy-paste)
3. ✅ Reviewer Playbook (14 steps)
4. ✅ Gate Closure Simulator (19 inputs + pseudocode + 5 scenarios)
5. ✅ Evidence-to-Decision Mapping Table (20 rows)
6. ✅ Paper 0-Fill Investigation Playbook (12 branches)
7. ✅ /public Visual Review Script (16 items)
8. ✅ Secret-Safe Evidence Handling SOP
9. ✅ Phase M-0B Go/No-Go Brief
10. ✅ Documentation Patch Proposal v5 + Final Action Packet
11. ✅ packet `docs/M0Z6I_MANUAL_EVIDENCE_PACK.md`

---

## 3) Manual Evidence Checklist for Project Owner (Part B)

> เป็น checklist **offline** — ไม่ต้องทำตอนนี้. หยิบใช้เมื่อพร้อมเก็บ evidence จริง

### 3.1 Before-deploy
- เก็บ: build log + commit hash · field: `build_exit_code`, `commit_hash` · format: `EXIT:0` + `a1b2c3d` · PASS: EXIT:0+hash · FAIL: EXIT≠0 · PENDING: ไม่มี log · matters: code รุ่นถูก · M-0B: required

### 3.2 Plesk deploy
- เก็บ: `git pull` output + rebuild + restart · field: `deploy_pull`, `deploy_rebuild`, `deploy_restart` · format: "pull: up to date / X files; rebuild EXIT:0; app restarted" · PASS: ทั้งสาม OK + ไม่มี runtime overwrite · FAIL: runtime JSON ถูก overwrite / rebuild error · PENDING: ยังไม่ทำ · matters: code live = code ที่ตั้งใจ · M-0B: required

### 3.3 Runtime root
- เก็บ: `echo $BINGX_AGENT_DIR` + `ls -la $BINGX_AGENT_DIR/{latest_decision,market_snapshot}.json` · field: `bingx_agent_dir`, `runtime_files_exist`, `runtime_mtime` · format: path + 2 บรรทัด ls + mtime · PASS: path=httpdocs + ไฟล์มี size>0 + mtime สด · FAIL: path ผิด/ไฟล์หาย · PENDING: ยังไม่ตรวจ · matters: source-of-truth จริง · M-0B: required

### 3.4 Post-deploy health
- เก็บ: `curl -i .../api/public-health` (หลัง deploy) · field: `public_health_status`, `public_health_body` · format: `HTTP 200` + JSON ย่อ · PASS: 200+blocked fields+ไม่มี trace/secret · FAIL: 5xx/trace/secret/false ready · PENDING: ยังไม่ curl หลัง deploy · matters: endpoint จริงปลอดภัย · M-0B: required

### 3.5 /public visual
- เก็บ: screenshot + 16-item script (§9) · field: `visual_result` · PASS: truths ครบ ไม่มี false claim · FAIL: live-ready claim/ซ่อน blocker · PENDING: ยังไม่ดู · matters: สื่อสารถูกต้อง · M-0B: required

### 3.6 Paper runner
- เก็บ: env dump (redacted) + process/heartbeat + `ls tmp/*.jsonl` · field: `paper_env`, `runner_alive`, `journal_files` · PASS: env ครบ+runner รัน+มี event สด · FAIL: endpoint 5xx · PENDING: ยังไม่เก็บ · DATA_GAP: 0 event · matters: paper liveness · M-0B: required

### 3.7 Paper fill
- เก็บ: `curl .../api/paper-performance` + fill sample · field: `totalOrderFilled`, `averageFillPrice_present`, `fillQty_present`, `side/symbol/ts` · PASS: fills>0 + field ครบ · FAIL: fills>0 แต่ขาด price/qty (bug) · DATA_GAP: 0 fills · matters: edge proof · M-0B: required

### 3.8 Approval
- เก็บ: ค่า `EXCHANGE_MANUAL_APPROVAL` · field: `approval_status` · PASS (live only): approved + ทุก gate PASS · ปัจจุบัน not_approved=ถูกต้อง · FAIL: approve ก่อนเวลา · M-0B: hard

### 3.9 Final M-0B decision
- รวมทุก field → Gate Closure Simulator (§6) · PASS: ทุก required gate PASS → READY_FOR_REVIEW · ไม่งั้น BLOCKED

---

## 4) Evidence Dossier Template (Part C)

```
================ M-0B EVIDENCE DOSSIER ================
[1] REVIEW METADATA
    review_id: ___  date_time: ___(ISO)  reviewer: ___  phase: M-0Z-6
    real_or_synthetic: [ ] real  [ ] synthetic(REJECT for gate)

[2] CODEX RELEASE        fields: commit_hash, branch, staged_files, build_exit
    classification:___  score(0-5):___  missing:___  next_safe_action:___
[3] DEPLOY               fields: pull_output, rebuild_exit, restart
    classification:___ score:___ missing:___ next:___
[4] RUNTIME ROOT         fields: bingx_agent_dir, files_exist, mtime
    classification:___ score:___ missing:___ next:___
[5] RUNTIME SOURCE-OF-TRUTH  fields: reads_root_not_cache, no_cache_override
    classification:___ score:___ missing:___ next:___
[6] PUBLIC HEALTH        fields: http_status, body_summary, pre_or_post_deploy
    classification:___ score:___ missing:___ next:___
[7] /public VISUAL       fields: 16-item result, false_claim(y/n)
    classification:___ score:___ missing:___ next:___
[8] PAPER RUNNER         fields: paper_env, runner_alive, journal_files, event_fresh
    classification:___ score:___ missing:___ next:___
[9] PAPER PERFORMANCE    fields: totalOrderFilled, status(no_data?), pnlSource
    classification:___ score:___ missing:___ next:___
[10] CLOSED CYCLE        fields: entry_fill, exit_fill, realized_net, fee/slippage
    classification:___ score:___ missing:___ next:___
[11] APPROVAL            fields: exchange_manual_approval
    classification:___ score:___ missing:___ next:___
[12] SAFETY FLAGS        fields: LIVE=___ ORDER=___ PROD=___ (ต้อง false)
    classification:___ score:___ missing:___ next:___
[13] FINAL CLASSIFICATION (รวม): ___
[14] REVIEWER NOTES: ___
[15] FINAL DECISION: [ ] BLOCKED  [ ] READY_FOR_REVIEW(ครบ PASS เท่านั้น)
=======================================================
```

---

## 5) Reviewer Playbook (Part D)

| Step | Objective | Required Evidence | Common Mistake | Rejection Rule | Output Classification |
|------|-----------|-------------------|----------------|----------------|----------------------|
| 1 real vs synthetic | กัน fixture ปน | label/source | นับ fixture เป็นจริง | synthetic→REJECT for gate | real/synthetic |
| 2 redact secrets | ความปลอดภัย | — | แปะ secret ดิบ | secret→REJECT+stop | secret_exposure |
| 3 classify type | ระบุ gate | header | เดาผิดชนิด | ไม่ระบุได้→PENDING | evidence_type |
| 4 freshness | สด? | ts/mtime | ไม่มี ts ถือว่าใหม่ | stale อ้าง fresh→FAIL | fresh/stale |
| 5 pre-deploy reuse | กันหลอก | deploy marker | reuse pre เป็น post | reuse→FAIL | pre/post |
| 6 source-of-truth | root vs cache | path | cache=truth | cache authoritative→BLOCKED | sot_aligned |
| 7 safety flags | LIVE/ORDER/PROD | env | ไม่เช็ค | flag true→FAIL+BLOCKED | flags_status |
| 8 public health | post-deploy 200 | curl | pre อ้าง post | trace/secret→FAIL | health_status |
| 9 /public truth | UI honest | screenshot | ปล่อย false claim | live-ready claim→FAIL | visual_status |
| 10 paper liveness | runner alive | event ts | no_data=PASS | endpoint 5xx→FAIL | runner_status |
| 11 paper fill quality | schema | fill sample | 0=fail | ขาด price/qty→FAIL(bug) | fill_quality |
| 12 closed cycles | entry+exit | cycle | warning แทน gap | อ้างไม่มี exit→FAIL | cycle_status |
| 13 approval | not_approved now | env | approve เร็ว | approve ก่อน gate→FAIL | approval_status |
| 14 compile | รวมผ่าน simulator | ทุก field | ข้าม gate | incomplete→BLOCKED | final_decision |

---

## 6) Gate Closure Simulator (Part E)

### Inputs (19)
```
buildStatus, codexReleaseStatus, safeStagingStatus, deployStatus,
runtimeRootStatus, runtimeFilesStatus, publicHealthStatus, publicVisualStatus,
paperRunnerStatus, paperPerformanceStatus, paperFillQualityStatus, closedCycleStatus,
approvalStatus, liveTradingFlag, orderPlacementFlag, productionTradingReadyFlag,
sourceOfTruthStatus, secretExposureStatus, falseReadinessStatus
Output: BLOCKED | READY_FOR_REVIEW    # ไม่มี LIVE_READY (out of scope)
```

### Pseudocode
```
function gateClosure(g):
    # Tier 0 — safety violations
    if g.liveTradingFlag:            return FAIL_BLOCKED("live trading enabled")
    if g.orderPlacementFlag:         return FAIL_BLOCKED("order placement enabled")
    if g.productionTradingReadyFlag: return FAIL_BLOCKED("production_ready before evidence")
    if g.secretExposureStatus==FAIL: return FAIL_BLOCKED("secret exposure")
    if g.falseReadinessStatus==FAIL: return FAIL_BLOCKED("false live-ready claim")

    required = [buildStatus, codexReleaseStatus, safeStagingStatus, deployStatus,
                runtimeRootStatus, runtimeFilesStatus, publicHealthStatus, publicVisualStatus,
                paperRunnerStatus, paperPerformanceStatus, paperFillQualityStatus, closedCycleStatus]

    if any(x==FAIL for x in required):            return BLOCKED("a required gate FAILED")
    if g.sourceOfTruthStatus==AMBIGUOUS:          return BLOCKED("source-of-truth ambiguous")
    if any(x==PENDING_EXTERNAL for x in required):return BLOCKED("evidence pending external")
    if g.paperFillQualityStatus==DATA_GAP:        return BLOCKED("paper fills DATA_GAP")
    if g.closedCycleStatus==DATA_GAP or g.closedCycleStatus!=PASS: return BLOCKED("closed cycles not PASS")
    if g.approvalStatus!=approved:                return BLOCKED("approval not approved")
    if any(x==WARNING for x in required):         return BLOCKED("unresolved WARNING")
    if all(x==PASS for x in required):            return READY_FOR_REVIEW
    return BLOCKED("default deny")
```

### 5 Sample Scenarios
1. **current state** (ทุก post-deploy=PENDING_EXTERNAL, paper=DATA_GAP) → `BLOCKED("evidence pending external")` ✅
2. **post-deploy health PASS แต่ paper 0 fills** (`paperFillQualityStatus=DATA_GAP`) → `BLOCKED("paper fills DATA_GAP")`
3. **visual PASS แต่ approval not_approved** → `BLOCKED("approval not approved")`
4. **paper fills exist แต่ไม่มี closed cycles** (`closedCycleStatus=DATA_GAP`) → `BLOCKED("closed cycles not PASS")`
5. **ทุก gate PASS แต่ live flag เผลอ true** → `FAIL_BLOCKED("live trading enabled")` (Tier 0 ตัดก่อน)

---

## 7) Evidence-to-Decision Mapping Table (Part F)

| # | Evidence | PASS | WARNING | FAIL | PENDING | DATA_GAP | Decision impact | Safe next action |
|---|----------|------|---------|------|---------|----------|-----------------|------------------|
| 1 | build EXIT:0 | EXIT:0 | — | EXIT≠0 | no log | — | required | pin hash |
| 2 | commit hash | hash จริง | short ไม่ชัด | — | ไม่มี | — | required | ขอ hash |
| 3 | staged files | code/docs only | ไม่ครบ list | มี runtime/.env | ไม่มี | — | required | ตรวจ staged |
| 4 | no runtime committed | ไม่มี | — | มี runtime | — | — | hard | git policy |
| 5 | no secrets committed | ไม่มี | — | มี secret | — | — | hard | rotate |
| 6 | Plesk pull/rebuild/restart | ครบ+ไม่ overwrite | บางส่วน | overwrite/error | ยังไม่ทำ | — | required | redeploy |
| 7 | BINGX_AGENT_DIR | =httpdocs | — | ผิด | ยังไม่ตรวจ | — | required | echo |
| 8 | latest_decision.json exists | มี size>0 | mtime เก่า | หาย | ยังไม่ตรวจ | — | required | ls |
| 9 | market_snapshot.json exists | มี size>0 | mtime เก่า | หาย | ยังไม่ตรวจ | — | required | ls |
| 10 | public-health post-deploy | 200 safe | field หาย | 5xx/leak | ยังไม่ curl | — | required | curl post |
| 11 | /public visual | truths ครบ | wording ไม่ครบ | false claim | ยังไม่ดู | — | required | run script |
| 12 | paper-performance output | data จริง | stale | 5xx | ยังไม่ curl | no_data | required | curl |
| 13 | totalOrderFilled | >0 | — | — | — | 0 | required | liveness playbook |
| 14 | averageFillPrice | มี | — | null(bug) | — | n/a 0 fills | required | สอบ writer |
| 15 | fillQty/filledQuantity | มี | — | null(bug) | — | n/a 0 fills | required | สอบ writer |
| 16 | side/symbol/timestamp | ครบ | — | ขาด | — | n/a | required | สอบ writer |
| 17 | closed cycle | entry+exit+net | ไม่ครบ | อ้างไม่มี exit | — | 0 cycles | required | รอ accumulate |
| 18 | EXCHANGE_MANUAL_APPROVAL | approved(ทุก gate PASS) | — | approve เร็ว | — | — | hard | คง not_approved |
| 19 | live/order flags | false | — | true | — | — | hard | คง false |
| 20 | final M-0B | ทุก PASS→READY_FOR_REVIEW | — | safety violate | gate pending | paper gap | — | run simulator |

---

## 8) Paper 0-Fill Investigation Playbook (Part G)

**กฎเหล็ก:** 0 fills=DATA_GAP (ไม่ใช่ PASS, ไม่ใช่ code bug อัตโนมัติ) · no_data≠PASS · ห้าม force-fill · ห้ามแก้ runtime JSON · ห้ามแตะ live/order flags · ตรวจ runner/env/path ก่อนแตะโค้ด

| # | Branch | Symptom | Evidence needed | Classification | Safe response | Code change justified เมื่อ | M-0B |
|---|--------|---------|-----------------|----------------|---------------|-----------------------------|------|
| 1 | runner not started | 0 event, no process | process list | PENDING/DATA_GAP | start runner | ไม่ (ops) | BLOCKED |
| 2 | PAPER_TRADING_ENABLED missing/false | reader คืน paper_mode_disabled/no_data | env dump | DATA_GAP | set env | ไม่ (env) | BLOCKED |
| 3 | EXECUTION_AUDIT_ROOT_DIR missing/wrong | reader หา dir ไม่เจอ | env + ls | DATA_GAP | set root | ไม่ (env) | BLOCKED |
| 4 | BINGX_AGENT_DIR wrong | reader อ่าน root ผิด | echo | DATA_GAP/FAIL | แก้ env | ไม่ (env) | BLOCKED |
| 5 | journal path mismatch | writer เขียน path อื่น | writer path vs reader resolve | DATA_GAP | sync path | ไม่ (config) | BLOCKED |
| 6 | writer not writing | runner รันแต่ไม่มี event | runner log | DATA_GAP/FAIL | สอบ writer | เฉพาะถ้ายืนยัน writer code bug | BLOCKED |
| 7 | API reader path mismatch | endpoint no_data แต่ไฟล์มี | reader path vs file path | DATA_GAP | align path | เฉพาะถ้า reader resolve ผิด | BLOCKED |
| 8 | market ไม่ข้าม grid level | runner รัน, ไม่มี fill เพราะตลาด | journal INTENT แต่ไม่ fill | DATA_GAP (ปกติ) | รอ accumulate | ไม่ | BLOCKED (รอ) |
| 9 | strategy เข้มเกิน | no_trade reasons เยอะ | no_trade logs | DATA_GAP | review params | ไม่ (strategy tune) | BLOCKED |
| 10 | timestamp stale/timezone | event เก่า/tz เพี้ยน | event ts vs now | WARNING/DATA_GAP | สอบ clock/tz | เฉพาะถ้า parse tz ผิด | BLOCKED |
| 11 | dashboard/API mismatch | UI กับ API ไม่ตรง | ทั้งสอง output | WARNING | reconcile | เฉพาะถ้า logic ต่างกัน | BLOCKED |
| 12 | code parsing bug (มี fills แล้ว) | fills>0 แต่ field หาย | fill sample | FAIL (bug) | สอบ parse path | **ใช่** — code-side bug จริง | BLOCKED |

---

## 9) /public Visual Review Script (Part H)

| # | Check | Expected wording | Forbidden wording | PASS/WARNING/FAIL | M-0B |
|---|-------|------------------|--------------------|-------------------|------|
| 1 | page loads | (หน้าโหลด) | — | PASS โหลด / FAIL ไม่โหลด | required |
| 2 | no crash page | — | error overlay | PASS ไม่ crash / FAIL crash | required |
| 3 | no stack trace | — | `at Object...` | PASS / FAIL มี trace | required |
| 4 | no secret exposure | — | key/token | PASS / FAIL leak | hard |
| 5 | no live-ready claim | — | "live ready" | PASS / FAIL claim | hard |
| 6 | no production-ready claim | — | "Production Ready" | PASS / FAIL claim | hard |
| 7 | no approval claim | `NOT_APPROVED` | "approved" | PASS / FAIL claim | hard |
| 8 | live disabled visible | `LIVE: OFF` | — | PASS แสดง / WARNING infer ได้ / FAIL ไม่มี | hard |
| 9 | order disabled visible | `ORDER: OFF` | — | PASS / WARNING / FAIL | hard |
| 10 | approval not_approved visible | `NOT_APPROVED` | — | PASS / WARNING / FAIL | hard |
| 11 | M-0B blocked visible | `M-0B: BLOCKED` | "ready" | PASS / WARNING / FAIL | required |
| 12 | source-of-truth honest | `pending verify` | "verified"(ก่อน post-deploy) | PASS honest / FAIL เท็จ | required |
| 13 | cache not authoritative | `display only` | "ข้อมูลล่าสุดจาก exchange" | PASS ติดป้าย / FAIL authoritative | required |
| 14 | 0 fills = DATA_GAP | `FILLS: 0 (DATA_GAP)` | "0 fills PASS/OK" | PASS / FAIL 0=PASS | required |
| 15 | red blocks classified | "expected blocker" vs "bug" | downgrade เงียบ | PASS แยกชัด / WARNING คลุม / FAIL downgrade | required |
| 16 | timestamp/freshness visible | mtime/updated at | — | PASS แสดง / WARNING ไม่มี / FAIL อ้าง fresh เท็จ | required |

---

## 10) Secret-Safe Evidence Handling SOP (Part I)

1. **อาจ paste ได้:** HTTP status, JSON body ที่ redact แล้ว, env "key มี/ไม่มี" + flag ปลอดภัย (false/not_approved), commit hash, ls output, screenshot ที่ไม่มี secret
2. **ห้าม paste เด็ดขาด:** API key · secret key · bearer token · session cookie · password · full `.env` · private URL ที่มี token · raw server log ที่มี secret
3. **วิธี redact:** แทน secret ด้วย `<REDACTED>` · ตัด `Authorization`/`Cookie`/`Set-Cookie` · ตัด query token → `?<REDACTED>`
4. **ถ้าเผลอเปิด secret:** Claude หยุดทันที, ไม่ echo ค่า, classify evidence นั้น REJECT
5. **เมื่อต้องหยุด review:** พบ secret / full .env / runtime JSON committed → stop, ขอ evidence ใหม่ที่ redact
6. **เมื่อต้อง rotate:** ถ้า secret ที่เปิดเป็นของจริง production → **Operator rotate** (Claude ไม่ทำเอง)
7. **Claude ห้ามทวนกลับ:** API keys, secret keys, bearer tokens, session cookies, passwords, private URLs with tokens, `.env` contents, raw logs with secrets
8. **Classification impact:** evidence มี secret → score 0 + REJECT → gate ที่เกี่ยวข้อง BLOCKED จนส่งใหม่

---

## 11) Phase M-0B Go/No-Go Brief (Part J)

1. **Current decision:** Phase M-0B = **BLOCKED**
2. **Why still blocked:** post-deploy gates ทั้งหมด PENDING_EXTERNAL · paper fills + closed cycles = DATA_GAP · approval = not_approved
3. **What CAN unblock:** หลักฐาน post-deploy ครบ PASS (release+deploy+runtime root+health+visual) **และ** paper fills จริงพร้อม schema ครบ **และ** closed cycles PASS **และ** approval review เสร็จ
4. **What CANNOT unblock:** pre-deploy PASS · 0 fills/no_data · synthetic fixture · manual checklist ติ๊กเปล่า · spec/เอกสาร offline · WARNING ที่ยังไม่ resolve
5. **What remains forbidden:** live trading · order placement · `PRODUCTION_TRADING_READY=true` · BingX private/execution API · place/cancel/replace orders · commit runtime/secret
6. **READY_FOR_REVIEW means:** หลักฐานครบพอให้ "เริ่มรีวิวเพื่ออนุมัติ" — เป็นจุดเริ่ม ไม่ใช่ปลายทาง
7. **READY_FOR_REVIEW does NOT mean:** approved · live-ready · เปิด trading ได้ · ข้าม Operator review
8. **Final no-go statement:** Phase M-0B remains **BLOCKED** until every evidence gate is proven PASS

---

## 12) Documentation Patch Proposal v5 (Part K)

| # | File | Section | Exact text to add/replace | Reason | Safety impact | Req/Opt | Apply by |
|---|------|---------|---------------------------|--------|---------------|---------|----------|
| 1 | `docs/M0Z6_CONTROL_INDEX.md` | Control Packets | เพิ่ม: `\| M-0Z-6I \| docs/M0Z6I_MANUAL_EVIDENCE_PACK.md \| Manual Evidence Pack + Reviewer Playbook + Gate Closure Simulator \| ✅ done \|` | index | กัน packet หาย | required | Claude/any |
| 2 | `docs/M0Z6_CONTROL_INDEX.md` | "M-0Z-6 Control Pack" | จัดกลุ่ม 6E–6I เป็น Offline Control Pack ชุดเดียว | กัน phase churn | ลด confusion | required | Claude/any |
| 3 | `PROJECT_CONTEXT.md` | Offline Static Findings | เพิ่ม: `- M-0Z-6I: Manual Evidence Pack + Reviewer Playbook + Gate Closure Simulator → docs/M0Z6I_MANUAL_EVIDENCE_PACK.md` | ชี้ที่อยู่ | ไม่กระทบ readiness | required | Claude/any |
| 4 | `PROJECT_CONTEXT.md` | Decision | คง `Phase M-0B remains BLOCKED.` | กันเข้าใจผิด | คง BLOCKED | required | คงเดิม |
| 5 | `docs/SERVER_EVIDENCE_LEDGER.md` | ledger | เพิ่ม "M-0Z-6I — 2026-05-29: manual review system (offline, ไม่ใช่ server evidence)" | แยก spec จากหลักฐานจริง | กันปน | required | Claude/any |
| 6 | `.env.example` | safety block | เพิ่ม `PAPER_TRADING_ENABLED=false` + `EXECUTION_AUDIT_ROOT_DIR=<root>` | document keys ที่ขาด | ลด 0-fill misdiagnosis | required | Codex |
| 7 | `PROJECT_MAP.md` | Changelog | เพิ่มแถว M-0Z-6I | track | ไม่อ้าง ready | optional | Claude/any |

---

## 13) Final Offline Action Packet (Part L)

**Completed by Claude now (M-0Z-6I):**
Manual Evidence Checklist (9) · Evidence Dossier Template (15 sections) · Reviewer Playbook (14 steps) · Gate Closure Simulator (19 inputs + 5 scenarios) · Evidence-to-Decision Mapping (20 rows) · Paper 0-Fill Investigation Playbook (12 branches) · /public Visual Review Script (16 items) · Secret-Safe Evidence Handling SOP · Phase M-0B Go/No-Go Brief · Documentation Patch Proposal v5 · packet `docs/M0Z6I_MANUAL_EVIDENCE_PACK.md`

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

Claude completed offline manual evidence pack and gate closure simulator hardening, but external evidence is still required before READY_FOR_REVIEW.
