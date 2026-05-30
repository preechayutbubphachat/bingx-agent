# Phase M-0Z-6J — Offline Control Freeze + Evidence Contract Finalization + Phase-Churn Stopper

> ผู้จัดทำ: Claude cowork (Principal Developer / QA Gatekeeper / Source-of-Truth Audit / Control-Pack Consolidation)
> วันที่: 2026-05-29
> ประเภท: **OFFLINE / STATIC — CONTROL FREEZE** (เอกสารปิดชุด offline control pack)
> สถานะปลายทาง: **Phase M-0B BLOCKED** (FROZEN)
> ⛔ **FREEZE NOTICE:** นี่คือเอกสารปิดชุด M-0Z-6 offline control pack — **ห้ามสร้าง sub-phase offline ใหม่** จนกว่าจะมี external evidence จริงมาเปลี่ยนสถานะ gate (ดู §6 Phase-Churn Stopper)

---

## 1) Current State Confirmation (Part A)

**Current Phase:** M-0Z-6 — Evidence Intake Execution + Post-Deploy Triage + Paper Liveness Decision
**Sub-phase นี้:** M-0Z-6J — Control Freeze (ปิดชุด)

| สถานะ | รายการ |
|--------|--------|
| **PASS** | env safety flags (LIVE/ORDER/PROD=false ใน `.env.example`) |
| **PRE_DEPLOY_PASS_ONLY** | `npm run build` EXIT:0 · `/api/public-health` JSON · protected endpoints SAFE_W_BLOCKERS |
| **STATIC_FINDING** | reader path ถูกต้อง · route try/catch→`no_data` ปลอดภัย · `.env.example` ขาด paper keys |
| **INSTRUMENTATION_FIXED_PENDING_DEPLOY** | Fix 1 (ORDER_FILLED parse) · Fix 2 (FILL_RESULT extractFills) |
| **PENDING_EXTERNAL** | Git release · Plesk deploy · BINGX_AGENT_DIR · runtime files · public-health post-deploy · /public visual · paper-performance post-deploy |
| **DATA_GAP** | paper fills (0) · closed cycles (0) |
| **NOT_APPROVED** | EXCHANGE_MANUAL_APPROVAL |
| **BLOCKED** | Phase M-0B |

**Claude ทำต่อได้ offline ตอนนี้:** เอกสาร freeze นี้เท่านั้น (สรุป + contract + stopper rules) — ไม่มี offline artifact ใหม่ที่ยังขาด หลังจากนี้ทุกอย่างรอ external evidence

**ห้าม upgrade เป็น PASS แบบ offline:** post-deploy gates · paper fills/closed cycles · approval · pre-deploy PASS · synthetic fixture · offline spec/checklist เปล่า

---

## 2) What Claude Completed Offline Now

เอกสาร freeze ปิดชุด — รวม + ตรึง 11 deliverable: Control Freeze Summary · Final Evidence Contract (12 groups) · Evidence Completeness Definition · Phase-Churn Stopper Rules (8) · M-0B Gate Freeze Table (22 rows) · Paper Evidence Contract Freeze · /public Truth Contract Freeze · Source-of-Truth Contract Freeze · Reviewer Final Checklist (11 sections) · Doc Patch v6 · Final No-Go Packet

**Offline Control Pack สถานะ: COMPLETE & FROZEN** (M-0Z-6D → 6J)

---

## 3) M-0Z-6 Control Freeze Summary (Part B)

**Frozen scope:** M-0Z-6 คือเฟส evidence-control ที่ active. Sub-phase M-0Z-6D→6J เป็นงาน offline control-pack (spec/contract/playbook/simulator) — **ไม่ใช่ production evidence**

**Frozen non-goals:** ไม่สร้าง phase ใหม่โดยไม่มี evidence เปลี่ยนสถานะ · ไม่ unblock M-0B จาก offline artifact · ไม่ implement M-0B/exchange API · ไม่ทำงานที่ต้อง Codex/Operator/Git/deploy

**Frozen safety rules:** live/order/prod = false (คง) · approval = not_approved (คง) · ห้ามเรียก BingX execution API · ห้าม commit runtime/secret · cache ≠ source-of-truth · pre-deploy PASS ≠ post-deploy PASS

**Frozen evidence requirements:** ต้องมี external evidence ครบทุก gate (release → deploy → runtime root → health → visual → paper runner → paper fill → closed cycle → approval) ก่อน READY_FOR_REVIEW

**Final decision status:** **Phase M-0B BLOCKED** — offline artifact ยกระดับคุณภาพการรีวิวได้ แต่ unblock ไม่ได้

> หมายเหตุ index: ชุด offline มี packet 6D, 6E, 6G, 6H, 6I, 6J. **6F ไม่มีไฟล์ packet แยก** (เนื้อหา validator spec/parser ถูกดูดเข้า 6G/6H แล้ว) — ถือว่า covered, ไม่ต้องสร้างเพิ่ม (ตาม Stopper Rule #2)

---

## 4) Final Evidence Contract (Part C)

> Hard rejection (ทุก group): secret printed · `.env` exposed/committed · runtime JSON committed · cache=source-of-truth · false live-ready claim · no_data=PASS · 0 fills=PASS · paper PASS without closed cycle · approval ก่อน gate ครบ · live/order flag enabled → **REJECT/FAIL + BLOCKED**

| # | Group | Required fields | Format | PASS | WARNING | FAIL | PENDING_EXTERNAL | DATA_GAP | M-0B |
|---|-------|-----------------|--------|------|---------|------|------------------|----------|------|
| 1 | Codex release | commit_hash, branch, staged_files, build_exit | hash + list + `EXIT:0` | hash+safe files+EXIT:0 | staged ไม่ชัด | runtime/.env/secret staged | ไม่มีหลักฐาน | — | required |
| 2 | Plesk deploy | pull_output, rebuild_exit, restart | text 3 บรรทัด | ครบ+ไม่ overwrite runtime | บางส่วน | overwrite/rebuild error | ยังไม่ deploy | — | required |
| 3 | Runtime root | bingx_agent_dir, files_exist | echo + ls | path=root+ไฟล์มี | mtime เก่า | path ผิด/ไฟล์หาย | ยังไม่ตรวจ | — | required |
| 4 | Runtime SoT | reads_root, no_cache_override | path proof | อ่าน root | — | อ่าน cache เป็น truth | ยังไม่ verify | — | required |
| 5 | Public health post-deploy | http_status, body | `200`+JSON | 200 safe blocked fields | field หาย | 5xx/trace/secret/false ready | ยังไม่ curl post | — | required |
| 6 | /public visual | 16-item, false_claim | screenshot | truths ครบ | wording ไม่ครบ | live-ready claim/ซ่อน blocker | ยังไม่ดู | — | required |
| 7 | Paper runner | paper_env, runner_alive, journal, event_fresh | dump+ls+ts | env+runner+event สด | stale | endpoint 5xx | ยังไม่เก็บ | 0 event | required |
| 8 | Paper performance | totalOrderFilled, status, pnlSource | JSON | data จริง | stale | gross เป็น net | ยังไม่ curl | no_data | required |
| 9 | Paper fill quality | averageFillPrice, fillQty, side, symbol, ts | fill sample | field ครบ | ค่าขอบเขตน่าสงสัย | ขาด price/qty (bug) | — | 0 fills | required |
| 10 | Closed cycle | entry, exit, realized_net, fee/slippage | cycle | ครบ+net | ยังไม่ครบ cycle | อ้างไม่มี exit | — | 0 cycles | required |
| 11 | Approval | exchange_manual_approval | value | approved+ทุก gate PASS | — | approve ก่อนเวลา | — | — | hard |
| 12 | Safety flags | LIVE, ORDER, PROD | values | =false ทั้งหมด | — | ตัวใด=true | — | — | hard |

---

## 5) Evidence Completeness Definition (Part D)

**"Complete evidence" =** fresh · post-deploy (ที่ต้อง) · source-of-truth aligned · ไม่มี secret · ไม่มี stack trace · ไม่มี false readiness · runtime root verified · paper runner path verified · paper fills จริง (ไม่ใช่ synthetic) · มี averageFillPrice · มี fillQty/filledQuantity · มี side/symbol/timestamp · มี closed cycle evidence · safety flags ยัง disabled · approval ควบคุมโดย Operator — **ครบทุกข้อพร้อมกัน**

**นิยามอื่น:**
- **Incomplete:** ขาด field บังคับ ≥1 → ไม่ใช่ PASS
- **Stale:** timestamp เก่ากว่า threshold หรือก่อน deploy ล่าสุด → WARNING/ปฏิเสธถ้าอ้าง fresh
- **Pre-deploy-only:** เก็บก่อน deploy → ห้ามนับเป็น post-deploy PASS
- **Synthetic:** fixture/ตัวอย่างที่สร้างเอง → REJECT for gate
- **Display/cache-only:** จาก `dashboard/**/public/data/*` → ไม่ authoritative
- **DATA_GAP:** ไม่มีข้อมูลให้ตัดสิน (เช่น 0 fills) → ไม่ใช่ PASS ไม่ใช่ FAIL
- **Expected blocker:** สถานะที่ "ตั้งใจให้ block" (เช่น approval not_approved) → ไม่ใช่ bug
- **Real bug:** พฤติกรรมผิดจากที่ควรเป็น (เช่น fills จริงแต่ averageFillPrice หาย) → FAIL ห้าม downgrade

---

## 6) Phase-Churn Stopper Rules (Part E)

1. **ห้ามสร้าง M-0Z-7** จนกว่า external evidence จะเปลี่ยนสถานะ gate จริง
2. **ห้ามสร้าง offline sub-phase ใหม่** เว้นแต่ผลิต artifact ที่ยังไม่ถูก cover (ปัจจุบัน cover ครบแล้ว → ไม่มีเหตุสร้างเพิ่ม)
3. **ถ้า user ขอ roadmap อีกโดยไม่มี evidence ใหม่** → คืน reference ของ Frozen Control Pack (`docs/M0Z6_CONTROL_INDEX.md` + เอกสาร 6D–6J) + manual action summary แทนการสร้างเฟสใหม่
4. **ถ้า evidence มาถึง** → classify ผ่าน Final Evidence Contract (§4) + Gate Closure Simulator
5. **ถ้า evidence ขาด** → mark PENDING_EXTERNAL, ไม่ประดิษฐ์งาน
6. **ถ้า paper ยัง 0 fills** → รัน Paper 0-Fill Investigation Playbook (M0Z6I §8) ก่อน, ไม่เสนอแก้โค้ดก่อน
7. **ถ้าเจอ real bug** → ผลิตเฉพาะ minimal scoped fix plan
8. **M-0B คง BLOCKED** จนกว่าทุก gate = PASS

---

## 7) M-0B Gate Freeze Table (Part F)

| # | Gate | Current Status | Evidence Required | PASS Condition | FAIL Condition | Claude verify offline? | Why/Why not | M-0B |
|---|------|----------------|-------------------|----------------|----------------|------------------------|-------------|------|
| 1 | build EXIT:0 | PRE_DEPLOY_PASS_ONLY | build log+hash | EXIT:0+hash | EXIT≠0 | บางส่วน | log มีแล้วแต่ไม่ผูก deploy | required |
| 2 | Fix 1 deployed | INSTRUMENTATION_FIXED_PENDING_DEPLOY | deploy proof | code live=fix | ไม่ deploy | ไม่ | ต้อง deploy | required |
| 3 | Fix 2 deployed | INSTRUMENTATION_FIXED_PENDING_DEPLOY | deploy proof | code live=fix | ไม่ deploy | ไม่ | ต้อง deploy | required |
| 4 | Codex release | PENDING_EXTERNAL | hash+staged | safe release | unsafe staged | ไม่ | ต้อง Codex/Git | required |
| 5 | safe staging | PENDING_EXTERNAL | staged list | code/docs only | runtime/secret | ไม่ | ต้อง Git | required |
| 6 | no runtime JSON committed | PENDING_EXTERNAL | staged check | ไม่มี | มี | ไม่ | ต้อง Git | hard |
| 7 | no secrets committed | PENDING_EXTERNAL | staged check | ไม่มี | มี | ไม่ | ต้อง Git | hard |
| 8 | Plesk deploy | PENDING_EXTERNAL | pull+rebuild+restart | ครบ | error | ไม่ | ต้อง Operator | required |
| 9 | BINGX_AGENT_DIR | PENDING_EXTERNAL | echo | =httpdocs | ผิด | ไม่ | ต้อง shell server | required |
| 10 | latest_decision.json | PENDING_EXTERNAL | ls | มี size>0 | หาย | ไม่ | ต้อง shell server | required |
| 11 | market_snapshot.json | PENDING_EXTERNAL | ls | มี size>0 | หาย | ไม่ | ต้อง shell server | required |
| 12 | /api/public-health post-deploy | PENDING_EXTERNAL | curl post | 200 safe | 5xx/leak | ไม่ | ต้อง curl หลัง deploy | required |
| 13 | /public visual | PENDING_EXTERNAL | screenshot | truths ครบ | false claim | ไม่ | ต้อง login browser | required |
| 14 | paper runner liveness | PENDING_EXTERNAL/DATA_GAP | env+runner+event | event สด | endpoint 5xx | ไม่ | ต้อง server | required |
| 15 | /api/paper-performance | PENDING_EXTERNAL | curl | data จริง | error | ไม่ | ต้อง curl post | required |
| 16 | averageFillPrice | DATA_GAP | fill sample | มี | null(bug) | ไม่ | ต้องมี fill จริง | required |
| 17 | fillQty/filledQuantity | DATA_GAP | fill sample | มี | null(bug) | ไม่ | ต้องมี fill จริง | required |
| 18 | side/symbol/timestamp | DATA_GAP | event sample | ครบ | ขาด | ไม่ | ต้องมี fill จริง | required |
| 19 | closed cycles | DATA_GAP | entry+exit | ครบ+net | อ้างไม่มี exit | ไม่ | ต้อง accumulate | required |
| 20 | EXCHANGE_MANUAL_APPROVAL | NOT_APPROVED | value | approved+gate ครบ | approve เร็ว | ไม่ (ห้าม) | Operator only | hard |
| 21 | live/order flags | PASS (false) | values | false | true | ใช่ (อ่าน `.env.example`=false) | static เห็นค่า default | hard |
| 22 | final M-0B decision | BLOCKED | ทุก gate | ทุก PASS→READY_FOR_REVIEW | ใด ๆ ไม่ PASS | บางส่วน | compile via simulator | — |

---

## 8) Paper Evidence Contract Freeze (Part G)

ตรึงสัญญา:
- 0 fills = **DATA_GAP** ไม่ใช่ PASS
- no_data = **DATA_GAP หรือ PENDING_EXTERNAL** ไม่ใช่ PASS
- real fill evidence ต้องมี: `averageFillPrice`, `fillQty`/`filledQuantity`, `side`, `symbol`, `timestamp`
- **PASS ต้องมี closed cycle evidence**
- missing averageFillPrice หลังมี fills จริง = **FAIL**
- missing fillQty หลังมี fills จริง = **FAIL**
- closed cycle absent = **WARNING หรือ BLOCKED** ไม่ใช่ PASS
- `paper_pnl.jsonl` writer เป็น external/ไม่อยู่ใน checkout → ต้องมี **runner/env/path evidence** ก่อน
- แก้โค้ด justify เฉพาะเมื่อ runner/env/path evidence พิสูจน์ว่าเป็น code-side bug
- **ห้าม force-fill · ห้ามแก้ runtime JSON**

---

## 9) /public Truth Contract Freeze (Part H)

**Required visible/inferable truths:** live disabled · order disabled · approval not_approved · M-0B blocked · runtime SoT status · cache display-only · paper evidence status · 0 fills=DATA_GAP · post-deploy health pending (จนพิสูจน์) · ไม่มี live-ready/production-ready/approval claim

**Forbidden claims:** live-ready · production-ready · approved · paper PASS ขณะ 0 fills · SoT verified โดยไม่มี post-deploy runtime evidence · ซ่อน blocker · cache เป็น authoritative

**PASS:** required truths ครบ + ไม่มี forbidden + cache ติดป้าย display-only + 0 fills แสดง DATA_GAP
**WARNING:** แสดง blocker ถูกแต่ wording ไม่ครบ (ไม่ระบุ cache/pre-deploy)
**FAIL:** มี forbidden claim ใด ๆ / ซ่อน blocker / 0 fills=PASS / cache authoritative

---

## 10) Source-of-Truth Contract Freeze (Part I)

ตรึง:
- `<PROJECT_ROOT>/latest_decision.json` = **authoritative**
- `<PROJECT_ROOT>/market_snapshot.json` = **authoritative**
- `BINGX_AGENT_DIR=<PROJECT_ROOT>` resolve runtime root
- `dashboard/app/public/data/*.json` = **display/cache only**
- `dashboard/public/data/*.json` = **display/cache only**
- runtime/generated JSON/JSONL/TXT **ห้าม commit** (ดู `RUNTIME_FILES_GIT_POLICY.md`)
- Git pull **ห้าม overwrite** runtime truth files
- ถ้า UI/API อ่าน cache เป็น truth → **FAIL**
- ถ้า runtime root verify post-deploy ไม่ได้ → **M-0B BLOCKED**

---

## 11) Reviewer Final Checklist (Part J)

| Section | Required Evidence | Classification | Blocker if missing | Safe Next Action |
|---------|-------------------|----------------|--------------------|--------------------|
| 1 Release integrity | hash+staged+build | PASS/FAIL/PENDING | PENDING→BLOCKED | ขอ Codex report |
| 2 Deployment integrity | pull+rebuild+restart | PASS/FAIL/PENDING | PENDING→BLOCKED | ขอ Plesk log |
| 3 Runtime root integrity | echo+ls | PASS/FAIL/PENDING | PENDING→BLOCKED | ขอ server shell output |
| 4 Source-of-truth integrity | root vs cache proof | PASS/FAIL | FAIL→BLOCKED | verify reader root |
| 5 Public health integrity | curl post-deploy | PASS/FAIL/PENDING | PENDING→BLOCKED | curl post-deploy |
| 6 /public truthfulness | 16-item script | PASS/WARNING/FAIL | FAIL→BLOCKED | run visual script |
| 7 Paper runner liveness | env+runner+event | PASS/DATA_GAP/PENDING | DATA_GAP→BLOCKED | 0-fill playbook |
| 8 Paper fill quality | fill schema | PASS/FAIL/DATA_GAP | DATA_GAP/FAIL→BLOCKED | สอบ writer |
| 9 Closed cycles | entry+exit+net | PASS/WARNING/DATA_GAP | ไม่ PASS→BLOCKED | รอ accumulate |
| 10 Approval & safety flags | approval+flags | PASS/FAIL/NOT_APPROVED | ไม่ PASS→BLOCKED | คง not_approved+false |
| 11 Final M-0B decision | ทุก section | BLOCKED/READY_FOR_REVIEW | ใด ๆ ไม่ PASS→BLOCKED | run Gate Closure Simulator |

---

## 12) Documentation Patch Proposal v6 (Part K)

| # | File | Section | Exact text to add/replace | Reason | Safety impact | Req/Opt | Apply by |
|---|------|---------|---------------------------|--------|---------------|---------|----------|
| 1 | `docs/M0Z6_CONTROL_INDEX.md` | Control Packets | เพิ่ม: `\| M-0Z-6J \| docs/M0Z6J_CONTROL_FREEZE.md \| Control Freeze + Final Evidence Contract + Phase-Churn Stopper \| ✅ FROZEN \|` | ปิดชุด | กัน churn | required | Claude/any |
| 2 | `docs/M0Z6_CONTROL_INDEX.md` | Status | เพิ่มบรรทัด: `Offline Control Pack (6D–6J): COMPLETE & FROZEN — ห้ามสร้าง sub-phase ใหม่จนกว่ามี external evidence` | freeze marker | กัน churn | required | Claude/any |
| 3 | `PROJECT_CONTEXT.md` | Offline Static Findings | เพิ่ม: `- M-0Z-6J: Control Freeze + Final Evidence Contract + Phase-Churn Stopper → docs/M0Z6J_CONTROL_FREEZE.md (Offline Control Pack FROZEN)` | ชี้ที่อยู่ + freeze | ไม่กระทบ readiness | required | Claude/any |
| 4 | `PROJECT_CONTEXT.md` | Decision | คง `Phase M-0B remains BLOCKED.` | กันเข้าใจผิด | คง BLOCKED | required | คงเดิม |
| 5 | `docs/SERVER_EVIDENCE_LEDGER.md` | ledger | เพิ่ม "M-0Z-6J — 2026-05-29: Final Evidence Contract frozen (offline spec, ไม่ใช่ server evidence)" | แยก spec จากหลักฐาน | กันปน | required | Claude/any |
| 6 | `.env.example` | safety block | เพิ่ม `PAPER_TRADING_ENABLED=false` + `EXECUTION_AUDIT_ROOT_DIR=<root>` | document keys ที่ขาด | ลด 0-fill misdiagnosis | required | Codex |
| 7 | `PROJECT_MAP.md` | Changelog | เพิ่มแถว M-0Z-6J + ทำเครื่องหมาย Offline Control Pack COMPLETE | track + freeze | ไม่อ้าง ready | optional | Claude/any |

---

## 13) Final No-Go Packet (Part L)

**Current decision:** Phase M-0B **BLOCKED**
**Reason still blocked:** post-deploy gates ทั้งหมด PENDING_EXTERNAL · paper fills + closed cycles DATA_GAP · approval not_approved
**What CAN unblock:** external evidence ครบทุก gate PASS (release+deploy+runtime root+SoT+health+visual) + paper fills จริง schema ครบ + closed cycle PASS + Operator approval review
**What CANNOT unblock:** pre-deploy PASS · 0 fills/no_data · synthetic fixture · offline spec/checklist เปล่า · WARNING ที่ยังไม่ resolve
**What remains forbidden:** live trading · order placement · `PRODUCTION_TRADING_READY=true` · BingX private/execution API · place/cancel/replace · commit runtime/secret · approve ก่อน gate ครบ

**Completed by Claude offline now:** Offline Control Pack 6D–6J (Source-of-Truth Contract · Paper Engine Ops Contract · Evidence Validator/Parser · Acceptance Test Pack · Fixture Library · Gate/No-Go/Closure Simulators · Contract Test Matrix · Review Runbook · Reviewer Playbook · Manual Evidence Pack · 0-Fill Playbook · Visual Review Script · Secret SOP · Risk Registers v3–v5 · **Final Evidence Contract + Phase-Churn Stopper (this freeze)**)

**Still external later (PENDING_EXTERNAL):** Codex release · Plesk deploy · runtime root verify · runtime file existence · post-deploy public health · /public visual · paper runner evidence · paper performance evidence · real paper fill evidence · closed cycle evidence · EXCHANGE_MANUAL_APPROVAL review

**Must remain BLOCKED:** Phase M-0B implementation · read-only exchange API implementation · live trading · order placement · any approval implying live-ready

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

Claude completed offline control freeze and evidence-contract finalization, but external evidence is still required before READY_FOR_REVIEW.
