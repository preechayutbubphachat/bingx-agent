# M-0Z-6 — Owner Execution Packet (Frozen Offline Control Pack Application)

> ผู้จัดทำ: Claude cowork (Principal Developer / QA Gatekeeper / Evidence Parser)
> วันที่: 2026-05-29 · ประเภท: **OFFLINE / STATIC** — ไม่ใช่ phase ใหม่ ไม่ใช่ roadmap
> สถานะปลายทาง: **Phase M-0B BLOCKED** (FROZEN)
> 📌 หัวใจของเอกสารนี้ = **Manual Evidence Collection Form (§6)** — copy-paste กรอกได้ทันทีเมื่อ evidence จริงมาถึง

---

## 1) Current State Confirmation

**Current Stage:** M-0Z-6 — Frozen Offline Control Pack Application (ไม่ใช่ phase ใหม่)
ยืนยันจาก source จริง: reader resolve จาก `BINGX_AGENT_DIR` ถูกต้อง · route try/catch→`no_data` ปลอดภัย · `.env.example` ขาด paper keys · Fix 1+2 อยู่ในโค้ดจริง · safety flags=false

---

## 2) What Claude Completed Offline Now

Owner Execution Packet (เล่มนี้) — รวม State Board · Owner Packet · Frozen Gate Classification Rules · **Manual Evidence Collection Form (copy-paste, ใหม่)** · Paper Decision Logic · /public Truth Rules · Source-of-Truth Rules · No-Go Memo · No-New-Phase Rule · Doc Patch v8. งาน offline ปิดครบ — ที่เหลือรอ external evidence

---

## 3) Current State Board (Task A)

| # | Row | Status | Known | Missing | Why matters | M-0B |
|---|-----|--------|-------|---------|-------------|------|
| 1 | npm run build | PRE_DEPLOY_PASS_ONLY | EXIT:0 เครื่องจริง | hash ผูก deploy | code รุ่นถูก | required |
| 2 | Fix 1 ORDER_FILLED parse | INSTRUMENTATION_FIXED_PENDING_DEPLOY | โค้ดมีจริง | deploy+fill จริง | จับ fill price | required |
| 3 | Fix 2 FILL_RESULT extract | INSTRUMENTATION_FIXED_PENDING_DEPLOY | โค้ดมีจริง | deploy+fill จริง | นับ fill | required |
| 4 | /api/public-health pre-deploy | PRE_DEPLOY_PASS_ONLY | 200 JSON ปลอดภัย | post-deploy curl | endpoint ปลอดภัย | required |
| 5 | protected endpoints pre-deploy | PRE_DEPLOY_PASS_ONLY | SAFE_W_BLOCKERS | post-deploy | auth ปลอดภัย | required |
| 6 | env safety flags | PASS | LIVE/ORDER/PROD=false | — | กัน live เผลอเปิด | hard |
| 7 | Git release | PENDING_EXTERNAL | — | hash+staged+push | code ออกถูก | required |
| 8 | Plesk deploy | PENDING_EXTERNAL | — | pull+rebuild+restart | code live | required |
| 9 | BINGX_AGENT_DIR post-deploy | PENDING_EXTERNAL | — | echo=httpdocs | SoT root | required |
| 10 | runtime SoT files post-deploy | PENDING_EXTERNAL | — | ls 2 ไฟล์ | truth files มีจริง | required |
| 11 | /api/public-health post-deploy | PENDING_EXTERNAL | — | curl post | endpoint จริงปลอดภัย | required |
| 12 | /public visual | PENDING_EXTERNAL | — | screenshot+16-item | สื่อสารถูกต้อง | required |
| 13 | /api/paper-performance | PENDING_EXTERNAL | route ปลอดภัย(static) | curl post | paper data | required |
| 14 | paper fills | DATA_GAP | 0 fills | fill จริง+schema | edge proof | required |
| 15 | closed cycles | DATA_GAP | 0 cycles | entry+exit+net | edge proof | required |
| 16 | EXCHANGE_MANUAL_APPROVAL | NOT_APPROVED | not_approved | Operator review หลัง gate ครบ | กัน bypass | hard |
| 17 | Phase M-0B decision | BLOCKED | gate ไม่ครบ | ทุก gate PASS | go/no-go | — |

---

## 4) Owner Execution Packet (Task B)

1. **ปลอดภัยตอนนี้:** safety flags=false · approval=not_approved · reader อ่าน root ถูก · route paper ปลอดภัย · ไม่มี secret leak ในที่ตรวจ
2. **ยังไม่พิสูจน์:** ทุก gate post-deploy · paper fills/closed cycles จริง
3. **ยัง block ภายนอก:** release · deploy · runtime root · SoT · health post-deploy · /public visual · paper-performance
4. **evidence ที่ต้องเก็บภายหลัง:** ดู Manual Evidence Collection Form (§6)
5. **รับเป็น PASS เมื่อ:** real+fresh+post-deploy(ที่ต้อง)+source ตรง root+ไม่มี secret/trace/false claim+field ครบ+closed cycle มี
6. **ต้องปฏิเสธเมื่อ:** secret/.env/runtime committed · cache=truth · 0 fills=PASS · no_data=PASS · live/production-ready claim · approve ก่อน gate ครบ
7. **0 paper fills →** DATA_GAP เสมอ ตรวจ runner/env/path ก่อน ห้าม force-fill
8. **no_data →** DATA_GAP/PENDING_EXTERNAL ไม่ใช่ PASS
9. **ห้ามเด็ดขาด:** เปิด live/order/prod · approve ก่อน gate ครบ · เรียก BingX execution API · commit runtime/secret · แก้ runtime JSON · cache เป็น truth · อ้าง live/production ready
10. **ทำไม M-0B ยัง block:** gate post-deploy ทั้งหมด PENDING_EXTERNAL + paper DATA_GAP + approval not_approved

---

## 5) Frozen Gate Classification Rules (Task C)

- **PASS:** real + fresh + post-deploy(ที่ต้อง) + source-of-truth aligned + no secret + no stack trace + no false live-ready + required fields ครบ
- **PRE_DEPLOY_PASS_ONLY:** valid แต่เก็บก่อน deploy → ห้ามนับเป็น post-deploy PASS
- **PENDING_EXTERNAL:** ต้องใช้ Codex/Operator/Git/deploy/browser/curl/runtime/server evidence
- **DATA_GAP:** ยังไม่มี paper fills จริง / ยังไม่มี closed cycles / no_data หรือ 0 fills ที่ต้องการ paper evidence
- **NOT_APPROVED:** `EXCHANGE_MANUAL_APPROVAL` ยัง not_approved
- **FAIL:** secret exposure · stack trace · false live-ready · cache=source-of-truth · runtime path mismatch · runtime file missing · fills จริงแต่ขาด averageFillPrice/fillQty · paper PASS อ้างกับ 0 fills · live/order flag enabled
- **BLOCKED:** required gate ใด ๆ = PENDING_EXTERNAL / DATA_GAP / NOT_APPROVED / FAIL

---

## 6) Manual Evidence Collection Form (Task D) — copy-paste

```
============== M-0B MANUAL EVIDENCE FORM ==============
[1] CODEX RELEASE
    commit_hash: ____
    pushed_branch: ____ (ต้อง main)
    staged_files: ____
    build_exit_code: ____ (ต้อง 0)
    runtime_json_committed (y/n): ____ (ต้อง n)
    secrets_committed (y/n): ____ (ต้อง n)
    classification: ____  [PASS/FAIL/PENDING_EXTERNAL]

[2] PLESK DEPLOY
    deploy_timestamp: ____
    git_pull_result: ____ (no runtime overwrite)
    dashboard_rebuild_result: ____ (EXIT:0)
    nodejs_restart_result: ____
    classification: ____

[3] RUNTIME ROOT
    BINGX_AGENT_DIR: ____ (=httpdocs root)
    latest_decision.json exists (y/n): ____
    market_snapshot.json exists (y/n): ____
    timestamps: ____
    path_mismatch (y/n): ____ (ต้อง n)
    classification: ____

[4] PUBLIC HEALTH (post-deploy)
    curl_output: ____
    http_status: ____ (ต้อง 200)
    json (y/n): ____
    secret_exposure (y/n): ____ (ต้อง n)
    stack_trace (y/n): ____ (ต้อง n)
    false_live_ready_claim (y/n): ____ (ต้อง n)
    classification: ____

[5] /public VISUAL
    ui_loads (y/n): ____
    crash_page (y/n): ____ (ต้อง n)
    stack_trace (y/n): ____ (ต้อง n)
    secret_exposure (y/n): ____ (ต้อง n)
    live_ready_claim (y/n): ____ (ต้อง n)
    production_ready_claim (y/n): ____ (ต้อง n)
    m0b_blocked_shown (y/n): ____ (ต้อง y)
    paper_0fills_shown_as_DATA_GAP (y/n): ____ (ต้อง y)
    cache_shown_as_authoritative (y/n): ____ (ต้อง n)
    classification: ____

[6] PAPER
    endpoint_output: ____
    totalOrderFilled: ____ (0 = DATA_GAP)
    recentEvents: ____
    averageFillPrice_present (y/n): ____
    fillQty_or_filledQuantity_present (y/n): ____
    side_present (y/n): ____
    symbol_present (y/n): ____
    timestamp_present (y/n): ____
    closed_cycle_present (y/n): ____
    classification: ____

[7] APPROVAL
    EXCHANGE_MANUAL_APPROVAL: ____ (ปัจจุบัน not_approved)
    approved_by: ____
    all_gates_PASS (y/n): ____ (ต้อง y ก่อน approve)
    classification: ____

[8] FINAL DECISION
    m0b_status: ____ [BLOCKED / READY_FOR_REVIEW]
    reason: ____
    next_safe_action: ____
======================================================
```

---

## 7) Paper Evidence Decision Logic (Task E)

- 0 fills = **DATA_GAP** ไม่ใช่ PASS · no_data = **DATA_GAP/PENDING_EXTERNAL** ไม่ใช่ PASS
- real fill ต้องมี: `averageFillPrice` · `fillQty`/`filledQuantity` · `side` · `symbol` · `timestamp`
- **paper PASS ต้องมี closed cycle** · missing averageFillPrice/fillQty หลัง fills จริง = **FAIL** · closed cycle absent = **BLOCKED/WARNING** ไม่ใช่ PASS
- `paper_pnl.jsonl` writer = external/ไม่อยู่ใน checkout → ต้องมี runner/env/path evidence ก่อน
- แก้โค้ด justify เฉพาะเมื่อ runner/env/path พิสูจน์ว่าเป็น code-side bug · **ห้าม force-fill · ห้ามแก้ runtime JSON**

---

## 8) /public Visual Truth Rules (Task F)

**ห้ามสื่อ:** live-ready · production-ready · approved · paper PASS ขณะ 0 fills · SoT verified โดยไม่มี post-deploy runtime evidence · cache authoritative
**ควรสื่อ/อนุมานได้:** live disabled · order disabled · approval not_approved · M-0B blocked · runtime SoT status · cache display-only · paper evidence status · 0 fills=DATA_GAP · post-deploy health pending จนพิสูจน์
**PASS:** truths ครบ + ไม่มี forbidden + cache display-only + 0 fills=DATA_GAP · **WARNING:** blocker ถูกแต่ wording ไม่ครบ · **FAIL:** มี forbidden claim / ซ่อน blocker / 0 fills=PASS / cache authoritative

---

## 9) Source-of-Truth Safety Rules (Task G)

- `<PROJECT_ROOT>/latest_decision.json` + `<PROJECT_ROOT>/market_snapshot.json` = **authoritative** · resolve โดย `BINGX_AGENT_DIR=<PROJECT_ROOT>`
- `dashboard/app/public/data/*.json` + `dashboard/public/data/*.json` = **display/cache only**
- runtime/generated JSON/JSONL/TXT **ห้าม commit** · Git pull **ห้าม overwrite** runtime truth files
- ถ้า UI/API อ่าน cache เป็น truth → **FAIL** · ถ้า runtime root verify post-deploy ไม่ได้ → **M-0B BLOCKED**

---

## 10) M-0B No-Go Memo (Task H)

1. **Current decision:** M-0B = **BLOCKED**
2. **Evidence missing:** release · deploy · runtime root · SoT · public-health post-deploy · /public visual · paper-performance · paper fill quality · closed cycle · approval
3. **Risks ถ้า unblock เร็ว:** เปิด path สู่ live/order โดย source-of-truth/paper edge ยังไม่ verified → เสี่ยงเงินจริงบนข้อมูลที่ยังไม่พิสูจน์
4. **อะไร unblock ได้:** external evidence ครบทุก gate PASS + paper fills จริง schema ครบ + closed cycle PASS + Operator approval
5. **อะไร unblock ไม่ได้:** pre-deploy PASS · 0 fills/no_data · synthetic fixture · offline spec/checklist · WARNING ค้าง
6. **ทำไม offline แทน production ไม่ได้:** spec เป็นไม้บรรทัด ไม่ใช่หลักฐานว่า server จริงทำงานถูก — ต้องมี output จริงหลัง deploy
7. **ทำไม READY_FOR_REVIEW ≠ LIVE_READY:** เป็นจุดเริ่มรีวิวเพื่ออนุมัติ ไม่ใช่ใบเบิกทาง live
8. **Final no-go:** Phase M-0B remains **BLOCKED** until every gate is proven PASS

---

## 11) No-New-Phase Rule (Task I)

1. ห้ามสร้าง M-0Z-7 โดยไม่มี external evidence ใหม่
2. ห้ามสร้าง offline subphase ใหม่ เว้นแต่ผลิต artifact ใหม่จริง
3. ถ้าไม่มี evidence ใหม่ → คืน **Current State Board (§3) + Manual Evidence Collection Form (§6)**
4. ถ้า evidence มา → classify ด้วย **Frozen Gate Classification Rules (§5)**
5. ถ้า evidence ขาด → mark PENDING_EXTERNAL
6. ถ้า paper ยัง 0 fills → ใช้ Paper Evidence Decision Logic (§7) ก่อนเสนอโค้ด
7. ถ้าเจอ real bug → ผลิตเฉพาะ minimal scoped fix plan
8. **M-0B คง BLOCKED จนทุก gate = PASS**

---

## 12) Documentation Patch Proposal v8 (Task J)

| # | File | Section | Exact text | Reason | Safety impact | Req/Opt | Apply by |
|---|------|---------|-----------|--------|---------------|---------|----------|
| 1 | `docs/M0Z6_CONTROL_INDEX.md` | Status | เพิ่ม: `Owner Execution Packet → docs/M0Z6_OWNER_EXECUTION_PACKET.md (มี copy-paste Manual Evidence Form). Offline Control Pack FROZEN. No-New-Phase Rule active.` | owner entry + freeze | กัน churn | required | Claude/any |
| 2 | `PROJECT_CONTEXT.md` | Offline Static Findings | เพิ่ม: `- M-0Z-6 Owner Execution Packet (frozen) + Manual Evidence Form → docs/M0Z6_OWNER_EXECUTION_PACKET.md` | ชี้ที่อยู่ | ไม่กระทบ readiness | required | Claude/any |
| 3 | `PROJECT_CONTEXT.md` | Decision | คง `Phase M-0B remains BLOCKED.` | กันเข้าใจผิด | คง BLOCKED | required | คงเดิม |
| 4 | `docs/SERVER_EVIDENCE_LEDGER.md` | ledger | เพิ่ม "M-0Z-6 Owner Execution Packet — 2026-05-29: offline form (ไม่ใช่ server evidence)" | แยก spec จากหลักฐาน | กันปน | required | Claude/any |
| 5 | `.env.example` | safety block | เพิ่ม `PAPER_TRADING_ENABLED=false` + `EXECUTION_AUDIT_ROOT_DIR=<root>` | document keys ที่ขาด | ลด 0-fill misdiagnosis | required | Codex |
| 6 | `PROJECT_MAP.md` | Changelog | เพิ่มแถว Owner Execution Packet | track | ไม่อ้าง ready | optional | Claude/any |

---

## 13) Final Offline Handoff (Task K)

**Completed by Claude now:** Owner Execution Packet (เล่มนี้) + copy-paste Manual Evidence Collection Form — ปิดชุด Offline Control Pack
**Still external later:** Codex release confirmation · Plesk deploy · BINGX_AGENT_DIR verification · runtime source-of-truth verification · /api/public-health post-deploy · /public visual verification · /api/paper-performance · paper fill quality evidence · closed cycle evidence · EXCHANGE_MANUAL_APPROVAL review
**Must remain blocked:** Phase M-0B implementation · read-only exchange API implementation · live trading · order placement · any approval implying live-ready

---

## 14) Files To Inspect / Files Not To Touch (Task L)

**Inspect (read-only):** `PROJECT_CONTEXT.md` · `PROJECT_MAP.md` · `PROJECT_ARCHITECTURE.md` · `docs/M0Z6_CONTROL_INDEX.md` · `docs/SERVER_EVIDENCE_LEDGER.md` · `docs/RUNTIME_FILES_GIT_POLICY.md` · `docs/M0B_OPERATOR_EVIDENCE_PACK.md` · `dashboard/lib/readPaperJournal.ts` · `dashboard/lib/paperPerformance.ts` · `dashboard/app/api/paper-performance/route.ts` · `dashboard/app/public/page.tsx` · `.env.example`

**Do NOT touch:** `latest_decision.json` · `market_snapshot.json` · `paper_pnl.jsonl` · paper journals · runtime JSON/JSONL/TXT · `.env` · `.env.*` · secrets · `node_modules` · `.next` · `logs/` · deployment files

---

## 15) Final Decision

Phase M-0B remains **BLOCKED**.
Live trading remains **DISABLED**.
Order placement remains **DISABLED**.
EXCHANGE_MANUAL_APPROVAL remains **not_approved**.

Claude completed the offline Owner Execution Packet and frozen gate classification system, but external evidence is still required before READY_FOR_REVIEW.
