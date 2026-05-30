# M-0Z-6 — Project Owner Control Manual (Frozen Offline Control Pack)

> ผู้จัดทำ: Claude cowork (Principal Developer / QA Gatekeeper / Source-of-Truth Audit)
> วันที่: 2026-05-29
> ประเภท: **OFFLINE / STATIC — OWNER MANUAL** (finalize ของ frozen M-0Z-6 control pack — ไม่ใช่ phase ใหม่)
> สถานะปลายทาง: **Phase M-0B BLOCKED** (FROZEN)
> 📌 เอกสารนี้อ่านจบเล่มเดียวรู้ทุกอย่างที่เจ้าของโปรเจคต้องรู้ — ไม่ต้องไล่ phase history เก่า

---

## 1) Current State Confirmation

**Current Stage:** M-0Z-6 — Evidence Intake Execution + Post-Deploy Triage + Paper Liveness Decision (Frozen Offline Control Pack Execution — ไม่ใช่ phase ใหม่)

ยืนยันจาก source จริง (read-only รอบก่อน): reader resolve จาก `BINGX_AGENT_DIR` ถูกต้อง · route try/catch→`no_data` ปลอดภัย · `.env.example` ขาด paper keys · Fix 1+2 อยู่ในโค้ดจริง

**สรุปคำเดียว:** งาน offline ทั้งหมดทำเสร็จและ frozen แล้ว — ทุกอย่างที่เหลือรอ external evidence; M-0B ยัง BLOCKED

---

## 2) What Claude Completed Offline Now

Owner Control Manual ปิดเล่ม — รวม 11 artifact ในไฟล์เดียวให้เจ้าของใช้: Current State Board · Owner Manual · Frozen Evidence Gate Board · Manual Action Summary · Evidence Acceptance Rules · Paper Evidence Decision Rules · /public Visual Truth Rules · Source-of-Truth Safety Rules · M-0B Blocked Memo · No-New-Phase Rule · Doc Patch v7

ไม่มี artifact offline ใหม่ที่ยังขาด — ชุดนี้คือการ finalize เพื่อให้เจ้าของหยิบใช้ได้เอง

---

## 3) Current State Board (Part A)

| # | Row | Status | Evidence already known | Evidence missing | Why it matters | M-0B impact |
|---|-----|--------|------------------------|------------------|----------------|-------------|
| 1 | build EXIT:0 | PRE_DEPLOY_PASS_ONLY | EXIT:0 บนเครื่องจริง | hash ผูก deploy | code รุ่นถูก | required |
| 2 | Fix 1 ORDER_FILLED parse | INSTRUMENTATION_FIXED_PENDING_DEPLOY | โค้ดมีจริง (readPaperJournal 308–321) | deploy + fill จริง | จับ fill price | required |
| 3 | Fix 2 FILL_RESULT extract | INSTRUMENTATION_FIXED_PENDING_DEPLOY | โค้ดมีจริง (FILL_RESULT ใน extractFills) | deploy + fill จริง | นับ fill | required |
| 4 | /api/public-health pre-deploy | PRE_DEPLOY_PASS_ONLY | 200 JSON ปลอดภัย | post-deploy curl | endpoint ปลอดภัย | required |
| 5 | protected endpoints pre-deploy | PRE_DEPLOY_PASS_ONLY | SAFE_W_BLOCKERS (api.txt 2026-05-28) | post-deploy | auth ปลอดภัย | required |
| 6 | env safety flags | PASS | LIVE/ORDER/PROD=false (`.env.example`) | — | กัน live เผลอเปิด | hard |
| 7 | Git release | PENDING_EXTERNAL | — | hash+staged+push | code ออกถูก | required |
| 8 | Plesk deploy | PENDING_EXTERNAL | — | pull+rebuild+restart | code live | required |
| 9 | BINGX_AGENT_DIR post-deploy | PENDING_EXTERNAL | — | echo=httpdocs | source-of-truth root | required |
| 10 | runtime files post-deploy | PENDING_EXTERNAL | — | ls 2 ไฟล์ | truth files มีจริง | required |
| 11 | /api/public-health post-deploy | PENDING_EXTERNAL | — | curl หลัง deploy | endpoint จริงปลอดภัย | required |
| 12 | /public visual | PENDING_EXTERNAL | — | screenshot+16-item | สื่อสารถูกต้อง | required |
| 13 | /api/paper-performance | PENDING_EXTERNAL | route ปลอดภัย (static) | curl post-deploy | paper data | required |
| 14 | paper fills | DATA_GAP | 0 fills | fill จริง+schema | edge proof | required |
| 15 | closed cycles | DATA_GAP | 0 cycles | entry+exit+net | edge proof | required |
| 16 | EXCHANGE_MANUAL_APPROVAL | NOT_APPROVED | not_approved (`.env.example`) | Operator review หลัง gate ครบ | กัน bypass safety | hard |
| 17 | Phase M-0B decision | BLOCKED | gate ไม่ครบ | ทุก gate PASS | go/no-go | — |

---

## 4) Project Owner Control Manual (Part B)

**1. ปลอดภัยตอนนี้:** live/order/prod flags = false · approval = not_approved · paper readers อ่านจาก root ถูกต้อง · route paper-performance ปลอดภัย (try/catch→no_data) · ไม่มี secret leak ในที่ที่ตรวจ

**2. ยังไม่พิสูจน์:** ทุก gate ที่ต้องดูหลัง deploy (release, deploy, runtime root, health, visual, paper data) · paper fills + closed cycles จริง

**3. ต้องปิดไว้เสมอ:** LIVE_TRADING_ENABLED · ENABLE_ORDER_PLACEMENT · PRODUCTION_TRADING_READY · BingX execution API · order placement จริง

**4. evidence ที่ต้องการภายหลัง:** commit hash + staged list · pull/rebuild/restart log · echo BINGX_AGENT_DIR · ls runtime files · curl public-health (post-deploy) · /public screenshot · curl paper-performance · fill+closed cycle จริง

**5. manual action ที่เหลือ:** ดู §6 Manual Action Summary

**6. รู้ได้ยังไงว่า gate = PASS:** หลักฐาน real + fresh + post-deploy (ที่ต้อง) + source ตรง root + ไม่มี secret/trace/false claim + (paper) field ครบ + closed cycle มี

**7. รู้ได้ยังไงว่า gate = FAIL:** มี stack trace/secret · cache เป็น truth · false live-ready · runtime overwrite · fills จริงแต่ขาด averageFillPrice/fillQty · approve ก่อน gate ครบ · flag ใด=true

**8. 0 paper fills → ทำยังไง:** ถือเป็น **DATA_GAP** เสมอ ไม่ใช่ PASS ไม่ใช่ bug → ตรวจ runner/env/path ก่อน (ดู §8) · ห้าม force-fill

**9. no_data → ทำยังไง:** ถือเป็น **DATA_GAP หรือ PENDING_EXTERNAL** ไม่ใช่ PASS → curl หลัง deploy + ตรวจ runner

**10. ห้ามทำเด็ดขาด:** เปิด live/order/prod · approve ก่อน gate ครบ · เรียก BingX execution API · commit runtime/secret/.env · แก้ runtime JSON · ใช้ cache เป็น source-of-truth · อ้าง live/production ready

---

## 5) Frozen Evidence Gate Board (Part C)

| # | Gate | Current Status | Required Evidence | PASS | FAIL | Claude offline? | Reason | Safe Next Action | M-0B |
|---|------|----------------|-------------------|------|------|-----------------|--------|------------------|------|
| 1 | release integrity | PENDING_EXTERNAL | hash+staged+build | safe release | runtime/secret staged | ไม่ | ต้อง Git | ขอ Codex report | required |
| 2 | deployment integrity | PENDING_EXTERNAL | pull+rebuild+restart | ครบ+no overwrite | error/overwrite | ไม่ | ต้อง Plesk | ขอ deploy log | required |
| 3 | runtime root integrity | PENDING_EXTERNAL | echo+ls | path=root+ไฟล์มี | path ผิด/หาย | ไม่ | ต้อง server shell | ขอ shell output | required |
| 4 | runtime source-of-truth | PENDING_EXTERNAL | reads root proof | อ่าน root | อ่าน cache | บางส่วน(static ผ่าน) | ต้องยืนยัน env จริง | verify post-deploy | required |
| 5 | public health integrity | PENDING_EXTERNAL | curl post | 200 safe | 5xx/leak | ไม่ | ต้อง curl post | curl หลัง deploy | required |
| 6 | /public visual truthfulness | PENDING_EXTERNAL | screenshot+16-item | truths ครบ | false claim | ไม่ | ต้อง browser | run script | required |
| 7 | paper runner liveness | PENDING_EXTERNAL/DATA_GAP | env+runner+event | event สด | endpoint 5xx | ไม่ | ต้อง server | 0-fill playbook | required |
| 8 | paper performance endpoint | PENDING_EXTERNAL | curl | data จริง | error | ไม่ | ต้อง curl post | curl | required |
| 9 | paper fill quality | DATA_GAP | fill schema | field ครบ | ขาด price/qty | ไม่ | ต้อง fill จริง | สอบ writer | required |
| 10 | closed cycle evidence | DATA_GAP | entry+exit+net | ครบ | อ้างไม่มี exit | ไม่ | ต้อง accumulate | รอ cycle | required |
| 11 | approval control | NOT_APPROVED | value | approved+gate ครบ | approve เร็ว | ไม่(ห้าม) | Operator only | คง not_approved | hard |
| 12 | safety flags | PASS (false) | values | false | true | ใช่(static) | `.env.example`=false | คง false | hard |
| 13 | final M-0B decision | BLOCKED | ทุก gate | ทุก PASS→READY_FOR_REVIEW | ใด ๆ ไม่ PASS | บางส่วน | compile simulator | run Gate Closure Simulator (M0Z6I/6J) | — |

---

## 6) Manual Action Summary (Part D)

> เอกสารไว้ใช้ภายหลัง — ไม่ต้องทำตอนนี้

| # | Action | ใครทำภายหลัง | Evidence ที่เก็บ | PASS | Avoid | ทำไม M-0B ขึ้นกับมัน |
|---|--------|--------------|------------------|------|-------|----------------------|
| 1 | commit hash + staged list | Codex | hash + `git show --stat` | safe files | stage runtime/.env | code รุ่นถูก |
| 2 | confirm push origin main | Codex | push result | pushed main | force/non-main | code ออกสู่ remote |
| 3 | Plesk pull/rebuild/restart | Operator | log 3 บรรทัด | ครบ+no overwrite | overwrite runtime | code live |
| 4 | echo BINGX_AGENT_DIR | Operator | path | =httpdocs | hard-code path | source-of-truth root |
| 5 | ls runtime files | Operator | ls 2 ไฟล์ | มี size>0 | สับสน cache | truth files มีจริง |
| 6 | curl public-health post-deploy | Operator | `200`+body | safe blocked fields | reuse pre-deploy | endpoint จริงปลอดภัย |
| 7 | login + open /public | Operator | session | หน้าโหลด | ส่ง password ใน chat | เห็นหน้าจริง |
| 8 | run visual checklist | Operator | 16-item result | truths ครบ | ปล่อย false claim | สื่อสารถูกต้อง |
| 9 | curl paper-performance | Operator | JSON | data/no_data | no_data=PASS | paper data |
| 10 | collect fill + closed cycle | Operator | fill+cycle sample | field+cycle ครบ | force-fill | edge proof |
| 11 | review EXCHANGE_MANUAL_APPROVAL | Operator | approval decision | approve หลัง gate ครบ | approve เร็ว | กัน bypass safety |

---

## 7) Evidence Acceptance Rules (Part E)

**ยอมรับเมื่อ:** real (ไม่ใช่ synthetic) · fresh · ระบุ source · post-deploy (ที่ต้อง) · ไม่มี secret · ไม่มี stack trace · ไม่มี false live-ready · runtime root aligned · source-of-truth aligned · paper มี field ครบถ้ามี fills · มี closed cycle สำหรับ paper PASS

**ปฏิเสธ (REJECT/FAIL) เมื่อ:** secret ปรากฏ · `.env` ปรากฏ · runtime JSON committed · cache=source-of-truth · 0 fills=PASS · no_data=PASS · /public อ้าง live/production ready · approval อ้างก่อน gate ครบ

---

## 8) Paper Evidence Decision Rules (Part F)

- 0 fills = **DATA_GAP** ไม่ใช่ PASS
- no_data = **DATA_GAP หรือ PENDING_EXTERNAL** ไม่ใช่ PASS
- real fill evidence ต้องมี: `averageFillPrice` · `fillQty`/`filledQuantity` · `side` · `symbol` · `timestamp`
- **paper PASS ต้องมี closed cycle evidence**
- missing averageFillPrice หลัง fills จริง = **FAIL**
- missing fillQty หลัง fills จริง = **FAIL**
- closed cycle absent = **BLOCKED หรือ WARNING** ไม่ใช่ PASS
- `paper_pnl.jsonl` writer = external/ไม่อยู่ใน checkout → ต้องมี **runner/env/path evidence** ก่อน
- แก้โค้ด justify เฉพาะเมื่อ runner/env/path evidence พิสูจน์ว่าเป็น code-side bug
- **ห้าม force-fill · ห้ามแก้ runtime JSON**

---

## 9) /public Visual Truth Rules (Part G)

**ห้ามสื่อ:** live-ready · production-ready · approved · paper PASS ขณะ 0 fills · source-of-truth verified โดยไม่มี post-deploy runtime evidence · cache เป็น authoritative

**ควรสื่อ/อนุมานได้:** live disabled · order disabled · approval not_approved · M-0B blocked · runtime source-of-truth status · cache display-only · paper evidence status · 0 fills=DATA_GAP · post-deploy health pending จนพิสูจน์

**PASS:** truths ครบ + ไม่มี forbidden + cache display-only + 0 fills=DATA_GAP
**WARNING:** แสดง blocker ถูกแต่ wording ไม่ครบ
**FAIL:** มี forbidden claim / ซ่อน blocker / 0 fills=PASS / cache authoritative

---

## 10) Source-of-Truth Safety Rules (Part H)

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

## 11) M-0B Blocked Reasoning Memo (Part I)

1. **Current decision:** Phase M-0B = **BLOCKED**
2. **Evidence missing:** release · deploy · runtime root · runtime SoT · public-health post-deploy · /public visual · paper-performance · paper fill quality · closed cycle · approval review
3. **Safety risks ถ้า unblock เร็ว:** อาจเปิด path สู่ live/order โดยที่ source-of-truth/paper edge ยังไม่พิสูจน์ → เสี่ยงเงินจริงบนข้อมูลที่ยังไม่ verified
4. **อะไร unblock ได้:** external evidence ครบทุก gate PASS + paper fills จริง schema ครบ + closed cycle PASS + Operator approval
5. **อะไร unblock ไม่ได้:** pre-deploy PASS · 0 fills/no_data · synthetic fixture · offline spec/manual · WARNING ค้าง
6. **ทำไม offline แทน production evidence ไม่ได้:** spec/contract เป็นไม้บรรทัด ไม่ใช่ตัวชี้วัดว่า server จริงทำงานถูก — ต้องมี output จริงหลัง deploy
7. **ทำไม READY_FOR_REVIEW ≠ LIVE_READY:** READY_FOR_REVIEW = หลักฐานพอให้ "เริ่มรีวิวเพื่ออนุมัติ" เท่านั้น; live ต้องผ่าน approval + safety phase แยก
8. **Final no-go:** Phase M-0B remains **BLOCKED** until every gate is proven PASS

---

## 12) No-New-Phase Rule (Part J)

1. **ห้ามสร้าง M-0Z-7** โดยไม่มี external evidence ใหม่
2. **ห้ามสร้าง offline subphase ใหม่** เว้นแต่ผลิต artifact ใหม่จริง (ปัจจุบัน cover ครบ)
3. ถ้าไม่มี evidence ใหม่ → คืน **Frozen Evidence Gate Board (§5) + Manual Action Summary (§6)**
4. ถ้า evidence มา → classify ผ่าน frozen evidence contract (M0Z6J §4)
5. ถ้า evidence ขาด → mark PENDING_EXTERNAL
6. ถ้า paper ยัง 0 fills → ใช้ Paper Evidence Decision Rules (§8) ก่อนเสนอโค้ด
7. ถ้าเจอ real bug → ผลิตเฉพาะ minimal scoped fix plan
8. **Phase M-0B คง BLOCKED จนทุก gate = PASS**

---

## 13) Documentation Patch Proposal v7 (Part K)

| # | File | Section | Exact text to add/replace | Reason | Safety impact | Req/Opt | Apply by |
|---|------|---------|---------------------------|--------|---------------|---------|----------|
| 1 | `docs/M0Z6_CONTROL_INDEX.md` | Status | เพิ่ม: `Offline Control Pack (6D–6J): FROZEN. Owner Manual → docs/M0Z6_PROJECT_OWNER_CONTROL_MANUAL.md. ห้ามสร้าง phase ใหม่จนมี external evidence (No-New-Phase Rule).` | freeze + owner entry | กัน churn | required | Claude/any |
| 2 | `PROJECT_CONTEXT.md` | Offline Static Findings | เพิ่ม: `- M-0Z-6 Owner Control Manual (frozen) → docs/M0Z6_PROJECT_OWNER_CONTROL_MANUAL.md — อ่านเล่มเดียวรู้สถานะ+evidence ที่ต้องการ` | ชี้ที่อยู่ | ไม่กระทบ readiness | required | Claude/any |
| 3 | `PROJECT_CONTEXT.md` | Decision | คง `Phase M-0B remains BLOCKED.` | กันเข้าใจผิด | คง BLOCKED | required | คงเดิม |
| 4 | `docs/SERVER_EVIDENCE_LEDGER.md` | ledger | เพิ่ม "M-0Z-6 Owner Control Manual — 2026-05-29: offline manual (ไม่ใช่ server evidence)" | แยก spec จากหลักฐาน | กันปน | required | Claude/any |
| 5 | `.env.example` | safety block | เพิ่ม `PAPER_TRADING_ENABLED=false` + `EXECUTION_AUDIT_ROOT_DIR=<root>` | document keys ที่ขาด | ลด 0-fill misdiagnosis | required | Codex |
| 6 | `PROJECT_MAP.md` | Changelog | เพิ่มแถว Owner Control Manual + คง gate board | track | ไม่อ้าง ready | optional | Claude/any |

---

## 14) Final Offline Handoff (Part L)

**Completed by Claude now:**
Owner Control Manual (เล่มนี้) รวม Current State Board · Frozen Evidence Gate Board · Manual Action Summary · Evidence Acceptance Rules · Paper Evidence Decision Rules · /public Visual Truth Rules · Source-of-Truth Safety Rules · M-0B Blocked Memo · No-New-Phase Rule · Doc Patch v7 — ปิดชุด Offline Control Pack (6D–6J + manual)

**Still external later:**
Codex release confirmation · Plesk deploy · runtime root verification · runtime source-of-truth verification · /api/public-health post-deploy · /public visual verification · /api/paper-performance · paper fill quality · closed cycle evidence · EXCHANGE_MANUAL_APPROVAL review

**Must remain blocked:**
Phase M-0B implementation · read-only exchange API implementation · live trading · order placement · any approval implying live-ready

---

## 15) Files To Inspect / Files Not To Touch (Part M)

**Inspect (read-only):** `PROJECT_CONTEXT.md` · `PROJECT_MAP.md` · `PROJECT_ARCHITECTURE.md` · `docs/M0Z6_CONTROL_INDEX.md` · `docs/SERVER_EVIDENCE_LEDGER.md` · `docs/RUNTIME_FILES_GIT_POLICY.md` · `docs/M0B_OPERATOR_EVIDENCE_PACK.md` · `dashboard/lib/readPaperJournal.ts` · `dashboard/lib/paperPerformance.ts` · `dashboard/app/api/paper-performance/route.ts` · `dashboard/app/public/page.tsx` · `.env.example`

**Do NOT touch:** `latest_decision.json` · `market_snapshot.json` · `paper_pnl.jsonl` · paper journals · runtime JSON/JSONL/TXT · `.env` · `.env.*` · secrets · `node_modules` · `.next` · `logs/` · deployment files

---

## 16) Final Decision

Phase M-0B remains **BLOCKED**.
Live trading remains **DISABLED**.
Order placement remains **DISABLED**.
EXCHANGE_MANUAL_APPROVAL remains **not_approved**.

Claude completed offline control manual and frozen evidence gate board, but external evidence is still required before READY_FOR_REVIEW.
