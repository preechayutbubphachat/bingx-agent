# PROJECT_MAP — bingx-agent

> แผนที่โปรเจคสำหรับดู “ภาพรวม + โครงสร้าง + จุดต่อเพิ่มฟีเจอร์” แบบเปิดไฟล์เดียวจบ  
> เป้าหมาย: วันไหนมีไอเดียเพิ่มฟีเจอร์ → เปิดไฟล์นี้แล้วรู้ทันทีว่าแก้ตรงไหน ไม่ต้องไล่โค้ดใหม่

---

## 0) TL;DR (โปรเจคนี้ทำอะไร)
- **Node/Server**: รันระบบ snapshot + สร้าง/อัปเดตไฟล์ JSON (ตลาด/ข่าว/derivatives/volatility/state)
- **Next.js Dashboard**: หน้า `/public` แสดงสภาวะตลาด + แผน (Plan Steps) + ปุ่มสั่ง snapshot
- จุดเชื่อมหลัก: `/run_full_snapshot` และ `/api/plan-status`

---

## 0.1) Project Status

> อัปเดตทุกครั้งที่ agent/operator ทำงานสำคัญเสร็จ

### Current Stage
**Phase M-0Z-6 — Paper Execution LIVE + Evidence Accumulation** (base) · **Overlay: Dynamic Regrid Phase 2-A — Regrid Readiness + Paper Epoch Preparation** (read-only/paper-only, 2026-06) — base: paper fill จริงบน production. overlay: Algorithm v2 guardrail หยุด BUY ขาเดียวเมื่อ BELOW_GRID + read-only REGRID_CANDIDATE evaluator + Runtime Monitor/Regrid Readiness บน `/agent-hq`. **PASS:** algorithm v2 guardrail · price source hotfix · PAPER_NO_TRADE log · REGRID_CANDIDATE log · Runtime Monitor UI · Regrid Readiness UI · BUY accumulation stopped · activationAllowed/paperActivationAllowed/liveActivationAllowed=false. **Blocked:** closedCycles=0 · sellFillCount=0 · expectancy=null · sample<30 · `/public` visual(16-item) · operator review · `EXCHANGE_MANUAL_APPROVAL` NOT_APPROVED. **Phase M-0B remains BLOCKED.** Dynamic Grid activation = Phase 2-B (รอ operator approve ภายหลัง).

---

### Dynamic Regrid Phase 2-A — Regrid Readiness + Paper Epoch Preparation (2026-06)
> read-only/paper-only overlay เหนือ Phase M-0Z-6 · ดู `docs/M0Z6_DYNAMIC_REGRID_DESIGN.md` + `docs/M0Z6_DYNAMIC_REGRID_PHASE2A_MONITORING.md` · Architecture: `PROJECT_ARCHITECTURE.md` Layer 07/09/11
> **Phase 2-A = observability/readiness เท่านั้น — ไม่เปิด grid ใหม่ ไม่สร้าง order ไม่ปลดล็อก M-0B**

**Done ✅**
- [x] Out-of-grid guardrail (block BUY เมื่อ BELOW_GRID / block SELL-open เมื่อ ABOVE_GRID → REGRID_REQUIRED)
- [x] Latest close source fix (ใช้ close ล่าสุดจริง ไม่ใช่ first/oldest)
- [x] PAPER_NO_TRADE audit path (`tmp/execution-runner/paper_no_trade.jsonl`)
- [x] REGRID_CANDIDATE read-only evaluator (`dashboard/lib/grid/regridCandidate.ts` · `tmp/execution-runner/regrid_candidate.jsonl` · activationAllowed=false เสมอ)
- [x] Runtime Monitor UI (`/agent-hq`)
- [x] Regrid Readiness card (Phase 2-A diagnostics)
- [x] Paper epoch diagnostics (`paperLoopDiagnostics.dynamicGrid.candidate`)
- [x] Old one-sided BUY exposure quarantine policy (ไม่ force SELL ปิด · ไม่ใช้ประเมิน edge)

**In Progress 🔄**
- [ ] Phase 2-A runtime monitoring (BUY นิ่ง / No-Trade เพิ่ม / Regrid Candidate เพิ่ม)
- [ ] readiness evidence accumulation (stableCandleCount / cooldownRemaining / candidate quality)
- [ ] cooldown / stable candle observation
- [ ] operator review preparation

**Blocked 🔒**
- [ ] Phase 2-B activation (เปิด dynamic grid จริง — paper)
- [ ] paperActivationAllowed = true (คง false จนกว่า operator approve Phase 2-B design)
- [ ] liveActivationAllowed = true (คง false ตลอด Phase 2)
- [ ] Phase M-0B

**Decision Log**
- Dynamic Regrid Phase 2-A อนุญาตเป็น **read-only readiness/diagnostics เท่านั้น**
- Dynamic Grid activation ต้องผ่าน **operator approval อย่างชัดเจน (Phase 2-B paper-only design)** ก่อนเสมอ
- No-Trade ขณะนอก grid = decision ที่ถูกต้อง — ห้าม regrid เพื่อให้ได้เทรด · ห้าม force BUY/SELL · ห้าม fake closedCycles

### Trend Strategy Phase T-2 — Manual Paper Arm Plan (DESIGN ONLY, 2026-06)
> เอกสาร: `docs/TREND_STRATEGY_T2_MANUAL_PAPER_ARM_PLAN.md` · **design เท่านั้น — ไม่มีปุ่ม arm, ไม่ส่ง order**
- `trendManualPaperArmGate` (NOT_READY→READY_FOR_OPERATOR_REVIEW→OPERATOR_ARMED_PAPER_ONLY/REJECTED/EXPIRED/BLOCKED) + required conditions (status AWAITING_CONFIRMATION/SETUP_READY + risk PASS + RR≥min + confirm WAITING_5M + zone READY + regime match + fresh + old exposure quarantined) + expiry (15m/3×5m)
- **armed (T-2) ≠ executed (T-3)** · arm ไม่สร้าง order/fill/evidence · paper/liveActivationAllowed=false · แยกจาก Phase 2-B + EXCHANGE_MANUAL_APPROVAL
- T-3 (paper simulated execution) = เฟสถัดไป: trend paper journal แยก, ไม่ปนกับ grid closedCycles/expectancy
- Status: T-1+T-1M active (shadow+monitor) · T-2 = design · M-0B BLOCKED

### Trend Strategy Paper — Phase T-0 (DESIGN ONLY, 2026-06)
> เอกสาร: `docs/TREND_STRATEGY_PAPER_DESIGN.md` · **กลยุทธ์ trend-following แยกจาก Grid · design เท่านั้น**
- ใช้ canonicalMarketRegime + indicatorGate + trendZoneCandidate + multiTF + 5m confirm · setup = pullback-confirm (ห้ามไล่ราคา)
- **แยกจาก Grid:** share canonicalRegime/multiTF/freshness/risk gates แต่ **ไม่ share** closedCycles/expectancy/exposure accounting/activation approval
- `trendPaperEpoch` แยก · old grid BUY exposure = `QUARANTINE_OLD_GRID_EXPOSURE` (ไม่ force SELL · ไม่นับเป็น trend evidence)
- Roadmap: T-0 design → T-1 shadow → T-2 manual paper armed → T-3 paper execution → T-4 trend edge review · **live ห้ามตลอดจนกว่ามี approval แยก**
- **Blocked:** T-1+ implementation (รอ operator approve + Codex handoff) · paper/live activation=false · Phase 2-B · M-0B
- ตัวอย่าง DOWNTREND ปัจจุบัน → trendStrategy.status=NO_TRADE (ราคาเลย sell zone + ใกล้ t1 = ห้ามไล่)

### Dynamic Regrid Phase 2-B — Manual Paper Activation Plan (DESIGN ONLY, 2026-06)
> เอกสาร: `docs/M0Z6_DYNAMIC_REGRID_PHASE2B_MANUAL_PAPER_ACTIVATION_PLAN.md` · **design/planning เท่านั้น — ยังไม่ implement**
- นิยาม: Manual Paper Activation Gate (`NOT_REQUESTED→REQUESTED→OPERATOR_APPROVED/REJECTED/EXPIRED`) + paper epoch plan (previous=INVALIDATED_RANGE/quarantine, next=CANDIDATE) + state machine 8 steps + fail paths
- Operator approval (paper-only) **แยกจาก** `EXCHANGE_MANUAL_APPROVAL` · `liveActivationAllowed=false` เสมอ · `paperActivationAllowed=false` จนกว่า operator approve
- **Blocked:** Phase 2-B implementation (รอ operator approve + Codex handoff แยก) · live ตลอด Phase 2 · M-0B
- Non-goals: ไม่ place order · ไม่แก้ `paper_cycle.sh` · ไม่ activate grid · ไม่ approve exchange · ไม่ unlock M-0B · ไม่แปลง old BUY→SELL · ไม่ fake closedCycles

### Next Stage
**Paper Evidence Accumulation → M-0B** (🔒 M-0B BLOCKED) — รอ: (1) closed cycles สะสม (ราคาต้องข้าม grid mid ให้เกิด SELL), (2) sample ~30 closed cycles เพื่อประเมิน edge, (3) `/public` 16-item visual PASS, (4) operator independent review, (5) `EXCHANGE_MANUAL_APPROVAL=approved` (หลังทุก gate PASS). M-0B = Read-only Exchange API Implementation ยัง BLOCKED จนกว่า paper evidence + approval ครบ

### Phase M-0Z-6 — Paper Execution LIVE (2026-05-30 → 31) ✅
**สำเร็จ: paper fill จริงทำงานบน production** — ไล่จาก deploy/cron/engine พังหมด จนเดินครบวงจร

- [x] Git release commit `59472f8` (Fix1/2 + .env.example paper keys + docs) push origin main
- [x] Plesk deploy + rebuild + restart — PASS post-deploy
- [x] Runtime source-of-truth verified ผ่าน `/api/public-health` (latest_decision/market_snapshot/schedulerHeartbeat = exists, phase=M-0B_BLOCKED, no leak)
- [x] `BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs` verified
- [x] env paper keys: `PAPER_TRADING_ENABLED=true`, `EXECUTION_AUDIT_ROOT_DIR=.../httpdocs/dashboard`
- [x] cron run-cycle fix: host (api→ob-gate.com via `OBGATE_RUN_CYCLE_BASE_URL`), CRLF→LF (`cron_scheduler_chain.sh`), key match
- [x] `run_cycle.js` ported: เลิก hardcode `C:\bingx-agent` + `localhost:3000`→`SNAPSHOT_BASE_URL=https://api.ob-gate.com`
- [x] **`paper_cycle.sh` (ใหม่)**: อ่าน decision/orderbook/funding จริง → MARKET paper order (`entryPrice:null`) → `/api/internal/execution-runner` → fill
- [x] **Root cause สุดท้าย**: `dashboard/lib/broker/` + `lib/execution/` + `app/api/internal/` เคย **untracked ใน git** → server รัน engine เก่าไม่มี FILL_RESULT block → fill เกิดแต่ไม่ surface
- [x] **Fix**: `git add` engine layer + commit `34c4a8f` + deploy (ย้าย copy เก่า `.old` ออกก่อน pull เลี่ยง untracked-overwrite) → server fill ได้
- [x] `readPaperJournal.ts`: S1 (นับ FILL_RESULT) + S3 (hasAverageFillPrice รวม FILL_RESULT) + sort mtime ก่อน slice 30
- [x] dev verification: debug route พิสูจน์ broker fill MARKET (averageFillPrice 73800) + engine emit FILL_RESULT — debug route ลบแล้ว ไม่ commit
- [x] Plesk cron `paper_cycle.sh` `*/5 * * * *` — สะสม fills อัตโนมัติ
- [x] **ผลยืนยัน (31 พ.ค.)**: `totalOrderFilled=30`, FILL_RESULT averageFillPrice=74115.3/74129.6 (ราคาจริง), paperModeDetected=true
- [x] docs: M0Z6_PAPER_LOOP_A1_STATUS.md, M0Z6_SERVER_DEPLOY_FIXES_2026-05-30.md + M0Z6 offline control pack (6D–6J + Owner packets)
- [x] No live trading / order placement enabled · EXCHANGE_MANUAL_APPROVAL=not_approved · Phase M-0B remains BLOCKED

### Phase M-0Z-6 — Remaining (ก่อน M-0B)
- [ ] closed cycles > 0 — รอราคาแกว่งข้าม grid mid ให้เกิด SELL (ตอนนี้ fill BUY หมด, ราคา < mid)
- [ ] sample ~30 closed cycles เพื่อประเมิน expectancy/edge
- [ ] `/public` 16-item visual verification (authenticated) — **visual evidence candidate logged (2026-05-31, low-res screenshot) = PENDING_EXTERNAL**; รอ full-res authenticated 16-item checklist
- [ ] operator independent review
- [ ] EXCHANGE_MANUAL_APPROVAL=approved (หลังทุก gate PASS เท่านั้น)
- [ ] (watch) ถ้า closed cycles ไม่เกิดใน 1-2 วัน → review side logic ของ `paper_cycle.sh`

### Parallel Track — TradingAgentHQ (frontend mode, ไม่ปลดล็อก M-0B)
> cozy pixel-art AI Agent Command Center (codename Trading Caffe HQ) — read-only visual layer เหนือ bot state
> Architecture: `PROJECT_ARCHITECTURE.md` Layer 13 · Full: `docs/TRADING_AGENT_HQ_ARCHITECTURE.md` / `_IMPLEMENTATION_PLAN.md` / `_ASSET_SPEC.md`
> สถานะ: APPROVED FOR DESIGN + READ-ONLY PLANNING · production = PENDING BUILD/QA · **M-0B impact = none**

- [x] THQ-0 asset & idea inventory (จาก `TradingAgentHQ/`)
- [x] THQ-1 architecture docs integration (Layer 13 + 3 docs + map ref)
- [x] THQ-2 asset pipeline: sprite sheets (24-frame, color-keyed transparent) + café background art + manifest/frame map
- [x] THQ-3 route `/agent-hq` + ModeSwitch (คง `/public` เดิม) + ลิงก์จาก `/public`
- [x] THQ-4 static scene prototype (bg + 6 agents)
- [x] THQ-5 real bot state adapter (public-safe endpoints → ViewModel, fallback→mock)
- [x] THQ-6 animation state resolver (priority/minHold/cooldown) + frame-cycling + CSS transforms
- [x] THQ-7 interaction layer (hover/click/double-click/ESC/log-highlight/mobile bottom-sheet)
- [x] THQ-8 UI overlay (TopHud + bottom log + RightInspector + source/freshness)
- [x] THQ-9 visual QA gate 16/16 PASS → `docs/TRADING_AGENT_HQ_VISUAL_QA.md`
- [~] THQ-10 perf/low-power (Low Power + reduced-motion ✅; ยังไม่ profile หนัก)
- [ ] THQ-11 frontend production readiness (รอ operator commit + build PASS + mobile/tablet sanity)
- ห้าม: order button / approval control / live flag / runtime write / private API · TradingAgentHQ **ไม่ใช่** source-of-truth · **ไม่ปลดล็อก M-0B**

- [ ] THQ-FE-6 — Agent Progression & Missions
   - Status: PLANNED
   - Scope: read-only frontend gamification and evidence-progress visualization
   - M-0B impact: none
   - Safety: no trading controls, no approval controls, no live toggles

---

### Phase M-0S Done
- [x] `/api/public-health` implemented.
- [x] Public-safe JSON response contract added.
- [x] Auth allowlist updated for `/api/public-health` only.
- [x] `docs/SERVER_EVIDENCE_LEDGER.md` updated with public-safe probe evidence section.
- [x] Dashboard build EXIT:0.
- [x] Safe files committed.
- [x] Push `origin main` completed.

### Phase M-0T Done
- [x] PART A — Phase M-0S release acknowledged; Current Stage updated to Phase M-0T.
- [x] PART B — Operator verification commands documented in SERVER_EVIDENCE_LEDGER.md.
- [x] PART C — Phase M-0T evidence intake section added to SERVER_EVIDENCE_LEDGER.md.
- [x] PART D — Expected blocker vs real bug classification confirmed current.
- [x] PART F — PROJECT_CONTEXT.md §8 updated with Phase M-0T workflow (8 steps).
- [x] PART G — Changelog entry added.
- [x] Docs-only change — no code files modified.
- [x] No git commands used by Claude.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0T In Progress
- Operator pulls latest M-0S release on Plesk.
- Operator rebuilds/restarts dashboard after pull.
- `/api/public-health` unauthenticated verification.
- Authenticated protected endpoint verification.
- `/public` visual verification after login.
- Paper fill evidence with `averageFillPrice`.
- Approval checklist completion.

### Phase M-0T Blocked / Pending
- Plesk pull/rebuild/restart after M-0S release pending.
- `/api/public-health` server HTTP 200 JSON verification pending.
- Authenticated endpoint JSON correctness pending.
- `/public` visual check pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0T Next
1. Operator pulls latest main on Plesk.
2. Operator rebuilds dashboard.
3. Operator restarts Node.js App.
4. Operator verifies `/api/public-health` via Scheduled Task or browser without login.
5. Operator verifies protected endpoints after login.
6. Operator verifies `/public` dashboard after login.
7. Operator collects paper fill evidence.
8. Keep Phase M-0B blocked until all gates pass.

### Phase M-0W Done
- [x] PART B — `docs/SERVER_EVIDENCE_LEDGER.md` Phase M-0W verification result intake section added (5 sub-sections: public-health probe result, protected endpoints result, /public visual result, paper evidence result, Phase M-0B gate result — all PENDING operator input).
- [x] PART C — `PROJECT_MAP.md` Current Stage updated to Phase M-0W; Done/In Progress/Blocked/Next blocks added.
- [x] PART D — `PROJECT_CONTEXT.md` §8 updated to Phase M-0W workflow (9 steps).
- [x] Docs-only change — no code files modified.
- [x] No git commands used by Claude.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0W In Progress
- Operator verifies `/api/public-health` without login and records result.
- Operator verifies protected endpoints after login and records result.
- Operator verifies `/public` dashboard after login and records visual result.
- Operator provides paper fill evidence with `averageFillPrice`.
- Approval checklist completion.

### Phase M-0W Blocked / Pending
- `/api/public-health` result pending (operator must run `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000`).
- Authenticated endpoint JSON result pending (operator opens endpoints in logged-in browser).
- `/public` visual result pending (operator opens dashboard in logged-in browser).
- Paper fill evidence with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0W Next
1. Operator sends `/api/public-health` verification output (curl or browser).
2. Operator sends protected endpoint JSON evidence after login.
3. Operator sends `/public` dashboard visual result after login.
4. Operator sends paper fill evidence with `averageFillPrice`.
5. Claude classifies each item as PASS / WARNING / FAIL / PENDING.
6. If any gate FAIL or PENDING → keep Phase M-0B BLOCKED.
7. If all gates PASS → mark READY_FOR_REVIEW only.
8. Do not enable live trading.
9. Do not enable order placement.
10. Do not set `EXCHANGE_MANUAL_APPROVAL=approved` without explicit operator approval after evidence review.

### Phase M-0X Done
- [x] Codex read `PROJECT_CONTEXT.md`, `PROJECT_MAP.md`, `PROJECT_ARCHITECTURE.md`, and evidence/policy docs.
- [x] Branch `main` verified.
- [x] Origin remote verified.
- [x] Latest `origin/main` pulled/rebased.
- [x] Phase M-0W handoff state reviewed; no filled Claude `Codex Git Handoff Required` block found.
- [x] Dashboard build EXIT:0.
- [x] Safe files staged only.
- [x] No runtime JSON/secrets staged.
- [x] Commit created if changes existed.
- [x] Push `origin main` completed if commit existed.

### Phase M-0X In Progress
- Operator verifies `/api/public-health` without login.
- Operator verifies protected endpoints after login.
- Operator verifies `/public` dashboard after login.
- Operator provides paper fill evidence with `averageFillPrice`.
- Approval checklist completion.

### Phase M-0X Blocked / Pending
- `/api/public-health` result pending unless Operator provided PASS.
- Authenticated endpoint result pending unless Operator provided PASS.
- `/public` visual result pending unless Operator provided PASS.
- Paper fills with `averageFillPrice` pending unless Operator provided PASS.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0X Next
1. Operator pulls latest main on Plesk.
2. Operator rebuilds/restarts dashboard.
3. Operator runs `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000`.
4. Operator opens protected endpoints after login.
5. Operator opens `/public` after login.
6. Operator provides paper fill evidence with `averageFillPrice`.
7. Claude classifies evidence as PASS / WARNING / FAIL / PENDING.
8. If any gate is PENDING or FAIL, keep Phase M-0B BLOCKED.
9. If all gates PASS, mark READY_FOR_REVIEW only.
10. Do not enable live trading.
11. Do not enable order placement.
12. Do not set `EXCHANGE_MANUAL_APPROVAL=approved` without explicit operator approval after evidence review.

### Phase M-0Z Done
- [x] Canonical Agent Roles defined (Claude / Codex / Operator) — aligned across PROJECT_CONTEXT.md, PROJECT_MAP.md.
- [x] File Ownership / Purpose model defined: CONTEXT=short-term memory, MAP=control board, ARCH=blueprint, LEDGER=evidence.
- [x] RACI Matrix added to PROJECT_MAP.md.
- [x] Decision Log added to PROJECT_MAP.md.
- [x] Context Hygiene Rules added to PROJECT_CONTEXT.md and PROJECT_MAP.md.
- [x] Current Snapshot section added/updated in PROJECT_CONTEXT.md.
- [x] PROJECT_CONTEXT.md rewritten as short-form 2-minute context (no long phase history).
- [x] /public visual gate PASS/WARNING/FAIL/PENDING criteria defined in SERVER_EVIDENCE_LEDGER.md.
- [x] Paper evidence gate PASS/WARNING/FAIL/PENDING criteria defined in SERVER_EVIDENCE_LEDGER.md.
- [x] `/api/public-health` PASS preserved and confirmed.
- [x] Protected endpoint SAFE_JSON_WITH_EXPECTED_BLOCKERS status preserved.
- [x] No Git commands used by Claude.
- [x] No runtime JSON modified/deleted.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z In Progress
- Codex Git release of M-0Z docs changes (build + commit + push).
- `/public` visual evidence closeout after authenticated browser/session.
- Paper fill evidence collection (averageFillPrice, fillQty, closed cycles).
- Approval checklist review.

### Phase M-0Z Blocked / Pending
- `/public` visual evidence pending — authenticated browser/session required.
- Paper fills missing `averageFillPrice`, `fillQty`, closed cycles.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0Z Next
1. Codex: build + commit + push origin main (docs-only release).
2. Operator: verify `/public` visual in authenticated browser/session.
3. Classify any red blocks as expected blocker vs real bug.
4. Collect paper fill evidence with `averageFillPrice`, `fillQty`, closed cycles.
5. If any gate PENDING or FAIL → keep Phase M-0B BLOCKED.
6. If all gates PASS → mark `READY_FOR_REVIEW` only.
7. Do NOT enable live trading.
8. Do NOT enable order placement.
9. Do NOT set `EXCHANGE_MANUAL_APPROVAL=approved` without complete evidence.

### Phase M-0Z-1 Done
- [x] Paper evidence instrumentation audit completed (2026-05-28).
- [x] Gap 1 identified: `readPaperJournal.ts` — `ORDER_FILLED` payload not parsed for `averageFillPrice` / `filledQuantity`.
- [x] Gap 2 identified: `paperPerformance.ts` `extractFills()` — `FILL_RESULT` events excluded.
- [x] Gap 3 identified: `mode` audit event field = "PAPER" (not grid mode) → always "UNKNOWN" in attribution.
- [x] Gap 4 identified: `regime` not stored in audit events — requires `paper_pnl.jsonl`.
- [x] Gap 5 identified: `paper_pnl.jsonl` not yet written by server.cjs.
- [x] Root cause classification: Gaps 1+2 = instrumentation code issue; Gaps 3-5 = data gap.
- [x] Fix 1+2 proposed: low-effort, dashboard lib only, safe to implement now.
- [x] Fix 3 deferred: server.cjs changes — requires Phase M-0B planning.
- [x] `/public` manual verification checklist written in SERVER_EVIDENCE_LEDGER.md.
- [x] SERVER_EVIDENCE_LEDGER.md updated with audit + implementation plan sections.
- [x] PROJECT_CONTEXT.md Current Snapshot updated to Phase M-0Z-1.
- [x] PROJECT_MAP.md updated to Phase M-0Z-1.
- [x] No Git commands used by Claude.
- [x] No code implemented (fixes proposed only — Codex implements).
- [x] No runtime JSON modified.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z-1 In Progress
- ~~Codex implements Fix 1 (`readPaperJournal.ts`) + Fix 2 (`paperPerformance.ts`).~~ → **DONE by Claude (M-0Z-2)**

### Phase M-0Z-1 Blocked / Pending (resolved in M-0Z-2)
- ~~Fix 1+2 not yet implemented.~~ → IMPLEMENTED
- `/public` visual evidence PENDING → carried to M-0Z-2
- Paper fills PENDING → carried to M-0Z-2

---

### Phase M-0Z-2 Done
- [x] Fix 1 implemented: `dashboard/lib/readPaperJournal.ts` — `ORDER_FILLED` payload parsing added (syntax PASS, 2026-05-28).
- [x] Fix 2 implemented: `dashboard/lib/paperPerformance.ts` — `FILL_RESULT` added to `extractFills()` filter (syntax PASS, 2026-05-28).
- [x] TypeScript syntax check: 0 errors across all project TS/TSX files.
- [x] SERVER_EVIDENCE_LEDGER.md updated to Phase M-0Z-2 (evidence snapshot + implementation result).
- [x] PROJECT_CONTEXT.md Current Snapshot updated to Phase M-0Z-2.
- [x] PROJECT_MAP.md updated to Phase M-0Z-2.
- [x] No Git commands used by Claude.
- [x] No exchange API called.
- [x] No server.cjs modified.
- [x] No runtime JSON modified.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z-2 In Progress
- `npm run build` (Codex — must be EXIT:0 before commit).
- Operator/Codex verifies `/public` visual using manual checklist.
- Paper trading accumulating fills naturally.

### Phase M-0Z-2 Blocked / Pending
- `npm run build` — sandbox DNS blocked; Codex must run on actual machine.
- `/public` visual evidence PENDING — authenticated browser/session required.
- Paper fills with `averageFillPrice`, `fillQty`, closed cycles — PENDING (0 fills yet).
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation BLOCKED.

### Phase M-0Z-2 Next
1. **Codex:** `npm run build` from `dashboard/` — must EXIT:0.
2. **Codex:** Commit Fix 1 + Fix 2 to `origin/main` (safe — dashboard lib only, no server/runtime changes).
3. **Operator/Codex:** Login to browser/session; verify `/public` using checklist in SERVER_EVIDENCE_LEDGER.md.
4. Classify any red blocks as expected blocker vs real bug.
5. Let paper trading accumulate fills naturally — do NOT force-fill.
6. Re-check `paperDataQuality` after build deployed.
7. Keep Phase M-0B BLOCKED until all evidence gates PASS.

---

### Phase M-0Z-3 Done
- [x] Phase M-0Z-3 roadmap designed: Evidence Gate Matrix (10 gates), Codex Handoff Block, Operator Checklist, Paper Evidence Decision Tree, M-0B Pre-Plan (read-only scope), Failure Decision Tree (2026-05-28).
- [x] Evidence Gate Matrix classified: PASS (2 gates), PENDING (2 gates), BLOCKED (2 gates), NOT_APPROVED (1 gate), INSTRUMENTATION_FIXED (2 gates), N/A (1 gate).
- [x] `PROJECT_CONTEXT.md` Current Snapshot updated to Phase M-0Z-3.
- [x] `PROJECT_MAP.md` Current Stage updated to Phase M-0Z-3; Phase M-0Z-3 Done/In Progress/Blocked/Next added.
- [x] `docs/SERVER_EVIDENCE_LEDGER.md` Phase M-0Z-3 evidence intake section added.
- [x] Codex Git Handoff block issued (covers Fix 1+2 code files + M-0Z-3 doc updates).
- [x] No Git commands used by Claude.
- [x] No exchange API called.
- [x] No runtime JSON modified.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z-3 In Progress
- Codex: `npm run build` from `dashboard/` (must EXIT:0).
- Codex: commit Fix 1+2 code changes + doc updates → push `origin main`.
- Operator: Plesk pull + rebuild + restart after Codex push.
- Operator/Codex: `/public` visual verification (11-point checklist) in authenticated browser/session.
- System: Paper fills accumulating naturally (no force-fill).

### Phase M-0Z-3 Blocked / Pending
- `npm run build` — Codex must run on actual machine (sandbox DNS blocked).
- `/public` visual evidence — PENDING (authenticated browser/session required).
- Paper fills with `averageFillPrice`, `fillQty`, closed cycles — PENDING (0 fills yet).
- `EXCHANGE_MANUAL_APPROVAL` — not_approved.
- Phase M-0B implementation — BLOCKED.

### Phase M-0Z-3 Next
1. **Codex:** `npm run build` from `dashboard/` — must EXIT:0 before any commit.
2. **Codex:** Stage safe files (Fix 1+2 lib files + M-0Z-3 doc updates) → commit → push `origin main`.
3. **Operator:** Plesk `git pull origin main` + rebuild dashboard + restart Node.js App.
4. **Operator:** Verify `/api/public-health` returns HTTP 200 JSON after deploy.
5. **Operator/Codex:** Open `/public` (authenticated) → run 11-point visual checklist → record result in LEDGER.
6. **System:** Let paper trading accumulate fills naturally — do NOT force-fill.
7. Re-check `/api/paper-performance` for `averageFillPrice` + `fillQty` after deploy.
8. Do NOT enable live trading.
9. Do NOT enable order placement.
10. Do NOT set `EXCHANGE_MANUAL_APPROVAL=approved` until all evidence gates PASS.

---

### Phase M-0Z-4 Done
- [x] Phase M-0Z-4 roadmap DESIGNED: 7-Checkpoint plan, Evidence Gate Matrix (11 rows), Paper Fill Liveness Audit checklist (8-step), Minimal Fix Policy, Codex Handoff Block, Operator Checklist (11-point), M-0B Read-only Pre-Plan (2026-05-28).
- [x] `PROJECT_CONTEXT.md` Current Snapshot updated to Phase M-0Z-4.
- [x] `PROJECT_MAP.md` Current Stage updated to Phase M-0Z-4; Phase M-0Z-4 Done/In Progress/Blocked/Next added.
- [x] `docs/SERVER_EVIDENCE_LEDGER.md` Phase M-0Z-4 evidence intake section added.
- [x] No Git commands used by Claude.
- [x] No exchange API called.
- [x] No runtime JSON modified.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z-4 In Progress
- Codex: `npm run build` from `dashboard/` (Checkpoint 1 — must EXIT:0).
- Codex: stage safe files + commit + push `origin main` (Checkpoint 2).
- Operator: Plesk pull + rebuild + restart (Checkpoint 3).
- Operator: verify `/api/public-health` post-deploy (Checkpoint 4).
- Operator/Codex: `/public` visual verification — 11-point checklist (Checkpoint 5).
- System: paper fills accumulating naturally (Checkpoint 6).
- Paper Liveness Audit: pending after deploy (8-step checklist if 0 fills persist).

### Phase M-0Z-4 Blocked / Pending
- `npm run build` — PASS (Codex ran on actual machine).
- Safe Git release — PENDING (after build PASS).
- Plesk deploy/restart — PENDING (after Git push).
- `/api/public-health` post-deploy — PENDING.
- `/public` visual verification — PENDING (authenticated browser/session required).
- Paper fills with `averageFillPrice`, `fillQty`, closed cycles — BLOCKED (0 fills; data gap).
- `EXCHANGE_MANUAL_APPROVAL` — NOT_APPROVED.
- Phase M-0B implementation — BLOCKED.

### Phase M-0Z-4 Next
1. **Codex:** `npm run build` from `dashboard/` — PASS EXIT:0.
2. **Codex:** Verify staged files (5 safe files only — no runtime JSON / .env / .next).
3. **Codex:** `git commit` + `git push origin main`.
4. **Operator:** Plesk `git pull origin main` + rebuild + restart Node.js App.
5. **Operator:** `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000` — verify HTTP 200 JSON.
6. **Operator:** Login → open `/public` → run 11-point visual checklist → record in LEDGER.
7. **Operator:** `curl -k -sS https://ob-gate.com/api/paper-performance | head -c 3000` → report output.
8. **System:** Let paper fills accumulate naturally — do NOT force-fill.
9. If 0 fills after deploy: run 8-step Paper Fill Liveness Audit before any code change.
10. Do NOT enable live trading.
11. Do NOT enable order placement.
12. Do NOT set `EXCHANGE_MANUAL_APPROVAL=approved` until all 7 checkpoints PASS.

---

### Phase M-0Z-5 Done
- [x] Phase M-0Z-5 roadmap DESIGNED: 5-Checkpoint evidence intake plan, 12-row Evidence Gate Matrix (PASS/FAIL/PENDING/DATA_GAP/NOT_APPROVED/BLOCKED classification rules), 8-step Paper Fill Liveness Audit (scheduler → plan_status → market_snapshot → paper mode → journal path → events written → API path → dashboard vs backend), Minimal Fix Policy (6 bug class taxonomy with file/validation/rollback/Codex handoff decision), Codex Git Handoff block, Operator 11-point post-deploy checklist, M-0B gate pre-decision (BLOCKED — 2/11 gates PASS).
- [x] `PROJECT_CONTEXT.md` Current Snapshot updated to Phase M-0Z-5 (confirmed/pending/gate summary/next actions).
- [x] No Git commands used by Claude.
- [x] No exchange API called.
- [x] No runtime JSON modified.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z-5 In Progress
- Codex: confirm commit hash + push `origin main` + report staged files list.
- Operator: Plesk `git pull origin main` + rebuild + restart Node.js App.
- Operator: `echo $BINGX_AGENT_DIR` — verify = project root.
- Operator: `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000` — post-deploy verify.
- Operator: Login → open `/public` → run 11-point visual checklist.
- Operator: `curl -k -sS https://ob-gate.com/api/paper-performance | head -c 3000` → report result.
- Claude: classify each gate result → PASS / FAIL / PENDING / DATA_GAP.
- System: paper fills accumulating naturally (no force-fill).

### Phase M-0Z-5 Blocked / Pending
- Safe Git release — PENDING (Codex must confirm commit + push).
- Plesk deploy / restart — PENDING (Operator, after Codex push).
- `BINGX_AGENT_DIR` verification — PENDING (Operator post-deploy).
- `/api/public-health` post-deploy — PENDING (Operator curl verify).
- `/public` visual verification — PENDING (authenticated browser/session required).
- Paper fills (`averageFillPrice`, `fillQty`, closed cycles) — DATA_GAP (0 fills; Fix 1+2 deployed; natural accumulation required).
- `EXCHANGE_MANUAL_APPROVAL` — NOT_APPROVED.
- Phase M-0B implementation — BLOCKED.

### Phase M-0Z-5 Next
1. **Codex:** Confirm commit hash + `git push origin main` + report staged files list.
2. **Operator:** Plesk `git pull origin main` + rebuild dashboard + restart Node.js App.
3. **Operator:** `echo $BINGX_AGENT_DIR` → verify = httpdocs root.
4. **Operator:** `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000` → send result to Claude.
5. **Operator:** Login → open `/public` → run 11-point visual checklist → report result.
6. **Operator:** `curl -k -sS https://ob-gate.com/api/paper-performance | head -c 3000` → send result to Claude.
7. **Claude:** Classify each gate result → PASS / FAIL / PENDING / DATA_GAP.
8. If 0 fills remain after deploy: run 8-step Paper Fill Liveness Audit before any code change.
9. Do NOT enable live trading.
10. Do NOT enable order placement.
11. Do NOT set `EXCHANGE_MANUAL_APPROVAL=approved` while any gate is PENDING or FAIL.

---

### Phase M-0Z-6 Done
- [x] Phase M-0Z-6 roadmap DESIGNED: 7-Checkpoint evidence intake plan, 13-row Evidence Gate Matrix (PASS/FAIL/PENDING/DATA_GAP/NOT_APPROVED/BLOCKED with PASS/FAIL criteria per gate), 8-step Paper Fill Liveness Audit, optional 14-point deeper audit, 10-class liveness classification, Minimal Fix Policy (8 bug class taxonomy), Codex Git Handoff block, Operator 15-point checklist, M-0B pre-gate decision (BLOCKED — 9 PENDING/1 DATA_GAP/1 NOT_APPROVED).
- [x] `PROJECT_CONTEXT.md` Current Snapshot updated to Phase M-0Z-6 (confirmed/pending/gate summary/12 next actions); §8 header fixed from M-0Z-4 → M-0Z-6.
- [x] `PROJECT_MAP.md` Current Stage → M-0Z-6; Phase M-0Z-6 Done/In Progress/Blocked/Next added; Changelog entry added.
- [x] `docs/SERVER_EVIDENCE_LEDGER.md` Current Stage → M-0Z-6; Phase M-0Z-6 evidence intake section added (13-row table + gate decision).
- [x] No Git commands used by Claude.
- [x] No exchange API called.
- [x] No runtime JSON modified.
- [x] No secrets exposed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0Z-6 In Progress
- Codex: verify branch=main + build EXIT:0 + stage safe files + commit + push origin main + report hash + staged list.
- Operator: Plesk git pull + rebuild + restart.
- Operator: `echo $BINGX_AGENT_DIR` verify.
- Operator: verify runtime files exist at `$BINGX_AGENT_DIR/`.
- Operator: curl `/api/public-health` post-deploy → report to Claude.
- Operator: Login → `/public` → 11-point visual checklist → report to Claude.
- Operator: curl `/api/paper-performance` → report to Claude.
- Claude: classify each result → PASS / FAIL / PENDING / DATA_GAP.
- System: paper fills accumulating naturally (no force-fill).

### Phase M-0Z-6 Blocked / Pending
- Safe Git release — PENDING (Codex must confirm commit hash + push).
- Plesk deploy / restart — PENDING (Operator, after Codex push).
- `BINGX_AGENT_DIR` verification — PENDING (Operator post-deploy).
- Runtime source-of-truth files verification — PENDING (Operator post-deploy).
- `/api/public-health` post-deploy — PENDING (Operator curl verify).
- `/public` visual verification — PENDING (authenticated browser/session required).
- `/api/paper-performance` output — PENDING (Operator curl).
- Paper fills (`averageFillPrice`, `fillQty`, closed cycles) — DATA_GAP (0 fills; Fix 1+2 pending deploy; natural accumulation required).
- `EXCHANGE_MANUAL_APPROVAL` — NOT_APPROVED.
- Phase M-0B implementation — BLOCKED.

### Phase M-0Z-6 Next
1. **Codex:** Verify branch=main; pull/rebase origin/main; `cd dashboard && npm run build` → EXIT:0.
2. **Codex:** Stage safe files ONLY (readPaperJournal.ts, paperPerformance.ts, PROJECT_CONTEXT.md, PROJECT_MAP.md, docs/SERVER_EVIDENCE_LEDGER.md).
3. **Codex:** `git commit` + `git push origin main` → report commit hash + staged files list to Claude.
4. **Operator:** Plesk `git pull origin main` + rebuild + restart Node.js App (after Codex confirms push).
5. **Operator:** `echo $BINGX_AGENT_DIR` → report output.
6. **Operator:** `ls -la $BINGX_AGENT_DIR/latest_decision.json` + `market_snapshot.json` → verify exist.
7. **Operator:** `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000` → report to Claude.
8. **Operator:** Login (browser only, no password in chat) → open `/public` → 11-point checklist → report.
9. **Operator:** `curl -k -sS https://ob-gate.com/api/paper-performance | head -c 3000` → report to Claude.
10. **Claude:** Classify each checkpoint result → PASS / FAIL / PENDING / DATA_GAP.
11. If 0 fills after deploy: run 8-step Paper Fill Liveness Audit before any code change.
12. Do NOT enable live trading.
13. Do NOT enable order placement.
14. Do NOT set `EXCHANGE_MANUAL_APPROVAL=approved` while any gate is PENDING or FAIL.

---

### Phase M-0Y Done
- [x] `/api/public-health` PASS recorded.
- [x] Operator manual burden reduced to login-only when Codex can use a browser/session.
- [x] Codex browser/session verification workflow added.
- [x] Protected endpoint verification checklist prepared.
- [x] `/public` visual verification checklist prepared.
- [x] Paper evidence checklist restated.
- [x] Operator-provided `api.txt` parsed by Codex.
- [x] Protected endpoint evidence classified as safe JSON with expected blockers/warnings.

### Phase M-0Y In Progress
- Codex authenticated browser visual verification if browser/session is available.
- Protected endpoint evidence follow-up only if new endpoint output changes.
- `/public` visual evidence.
- Paper fill evidence with `averageFillPrice`.
- Approval checklist.

### Phase M-0Y Blocked / Pending
- Protected endpoint evidence has safe JSON responses, but expected runtime/paper/approval blockers remain.
- `/public` visual evidence pending unless Codex verifies PASS in an authenticated browser/session.
- Paper fills with `averageFillPrice` pending unless evidence exists.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0Y Next
1. Codex opens browser/session if available.
2. Operator logs in manually only if requested by Codex.
3. Codex verifies protected endpoints.
4. Codex verifies `/public` visual.
5. Codex checks paper evidence.
6. Codex reports manual-only items still required.
7. If any gate is PENDING or FAIL, keep Phase M-0B BLOCKED.
8. If all gates PASS, mark READY_FOR_REVIEW only.
9. Do not enable live trading.
10. Do not enable order placement.

### Phase M-0V Done
- [x] PART B — `docs/SERVER_EVIDENCE_LEDGER.md` Phase M-0V evidence intake section added (5 sub-sections: public-health probe, protected endpoints, /public dashboard, paper evidence, gate decision).
- [x] PART C — `PROJECT_MAP.md` Current Stage updated to Phase M-0V; Done/In Progress/Blocked/Next blocks added.
- [x] PART D — `PROJECT_CONTEXT.md` §8 updated to Phase M-0V workflow (9 steps).
- [x] Docs-only change — no code files modified.
- [x] No git commands used by Claude.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0V In Progress
- Operator verifies `/api/public-health` without login (curl or browser).
- Operator verifies protected endpoints after login (10 endpoints).
- Operator verifies `/public` dashboard after login.
- Operator provides paper fill evidence with `averageFillPrice`.
- Approval checklist completion.

### Phase M-0V Blocked / Pending
- `/api/public-health` server HTTP 200 JSON verification pending (operator must run).
- Authenticated endpoint JSON verification pending.
- `/public` visual check pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0V Next
1. Operator runs `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000` without login.
2. Operator opens protected endpoints in logged-in browser and records JSON / no-secret / no-stack-trace.
3. Operator opens `/public` dashboard after login and records visual result.
4. Operator provides paper fill evidence with `averageFillPrice`.
5. Claude classifies each evidence item as PASS / WARNING / FAIL.
6. If any gate FAIL → keep Phase M-0B blocked; fix real bug first.
7. If all gates PASS → mark READY_FOR_REVIEW only.
8. Do not enable live trading.
9. Do not enable order placement.

### Phase M-0U Done
- [x] PART A — Phase M-0T evidence intake acknowledged; Current Stage updated to Phase M-0U.
- [x] PART B — `docs/SERVER_EVIDENCE_LEDGER.md` Phase M-0U evidence intake section added (6 sub-sections: Plesk deployment, public-health probe, protected endpoints, /public dashboard, paper evidence, gate decision).
- [x] PART C — Evidence Classification Rules added to SERVER_EVIDENCE_LEDGER.md (PASS / WARNING / FAIL with explicit criteria).
- [x] PART D — PROJECT_CONTEXT.md §8 updated to Phase M-0U workflow (8 steps).
- [x] PART G — Changelog entry added.
- [x] Docs-only change — no code files modified.
- [x] No git commands used by Claude.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0U In Progress
- Operator/Plesk deployment after M-0S release.
- `/api/public-health` server verification (unauthenticated).
- Authenticated protected endpoint verification.
- `/public` visual verification after login.
- Paper fill evidence with `averageFillPrice`.
- Approval checklist completion.

### Phase M-0U Blocked / Pending
- Plesk pull/rebuild/restart after M-0S release pending.
- `/api/public-health` server HTTP 200 JSON verification pending.
- Authenticated endpoint JSON verification pending.
- `/public` visual check pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0U Next
1. Operator verifies `/api/public-health` without login (curl or browser).
2. Operator verifies protected endpoints after login.
3. Operator verifies `/public` dashboard after login.
4. Operator provides paper fill evidence with `averageFillPrice`.
5. Claude classifies evidence as PASS / WARNING / FAIL.
6. If any gate FAIL → keep Phase M-0B blocked; fix real bug first.
7. If all gates PASS → mark READY_FOR_REVIEW only.
8. Do not enable live trading.
9. Do not enable order placement.

### Phase M-0R Done
- [x] PART A — SERVER_EVIDENCE_LEDGER.md updated with latest operator evidence (build, restart, env, runtime files, JSON start check, endpoint unauthenticated check).
- [x] PART B — PROJECT_MAP.md Current Stage updated to Phase M-0R; Done/In Progress/Blocked/Next sections updated.
- [x] PART C — Endpoint Verification Strategy (Option A + Option B) documented in SERVER_EVIDENCE_LEDGER.md.
- [x] PART D — Public-safe health endpoint implementation plan prepared (candidate files, JSON contract, auth notes, middleware manifest confirmed empty).
- [x] PART E — PROJECT_CONTEXT.md Section 8 Current Next Step updated.
- [x] PART G — Changelog entry added.
- [x] HTTP 307 auth redirect classified as **Expected Blocker** (auth protection working, not endpoint failure).
- [x] Phase M-0B remains BLOCKED.

### Phase M-0R In Progress
- Authenticated endpoint verification (Operator opens endpoints after login in browser).
- /public visual verification (Operator opens /public after login).
- Paper fill evidence with averageFillPrice (ongoing).

### Phase M-0R Blocked / Pending
- Endpoint JSON correctness not yet verified — unauthenticated Scheduled Task gets HTTP 307 auth redirect.
- /public visual check pending (operator must open in logged-in browser).
- Paper fills with averageFillPrice pending.
- EXCHANGE_MANUAL_APPROVAL not approved.
- Phase M-0B implementation blocked.

### Phase M-0R Next
1. Operator opens protected endpoints in logged-in browser and records JSON response (Option A).
2. OR: Implement `/api/public-health` minimal public endpoint for automated monitoring (Option B — only if needed).
3. Operator visually verifies /public dashboard after login.
4. Classify any remaining red blocks as Expected Blocker vs Real Bug.
5. Continue paper fill evidence collection (averageFillPrice required).
6. Keep Phase M-0B blocked until all gates pass.
7. Codex: build + commit + push (for this docs update).
8. Keep Phase M-0B blocked.

### Phase M-0Q Done
- [x] `.env` audited without exposing secret values.
- [x] `dashboard/.env.local` audited without exposing secret values.
- [x] `docs/ENVIRONMENT_AUDIT.md` created.
- [x] `.env.example` created with placeholders only.
- [x] `dashboard/.env.local.example` updated with Plesk path placeholders and required safety/auth keys.
- [x] `.gitignore` and `dashboard/.gitignore` env protection confirmed/updated.
- [x] Dashboard build EXIT:0.
- [x] Safe files committed.
- [x] Push `origin main` completed.

### Phase M-0Q In Progress
- Operator/Plesk env verification.
- Plesk pull/rebuild/restart.
- Server endpoint checks.
- `/public` visual verification.
- Paper fill evidence.

### Phase M-0Q Blocked / Pending
- Operator must rotate exposed/weak/duplicated secrets if confirmed on server.
- Plesk restart pending after env changes.
- Endpoint checks pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0Q Next
1. Operator rotates any exposed/weak/duplicated secrets.
2. Operator updates Plesk/dashboard env.
3. Operator restarts Node.js App.
4. Operator pulls latest main on Plesk.
5. Operator rebuilds dashboard.
6. Operator verifies env visibility.
7. Operator verifies endpoints.
8. Operator verifies `/public`.
9. Continue paper fill evidence.
10. Keep Phase M-0B blocked.

### Phase M-0P Done
- [x] Git release state verified on branch `main`.
- [x] Remote `origin` verified as `https://github.com/preechayutbubphachat/bingx-agent.git`.
- [x] Pull/rebase latest `origin/main` completed.
- [x] Latest Git commit identified for Operator/Plesk pull.
- [x] Operator/Plesk pull/rebuild/restart commands documented.
- [x] Plesk environment verification checklist documented.
- [x] Runtime source-of-truth file verification checklist documented.
- [x] Server endpoint verification checklist documented.
- [x] `/public` dashboard verification checklist documented.
- [x] Runtime JSON / secrets remain excluded from release scope.

### Phase M-0P In Progress
- Operator/Plesk execution.
- `BINGX_AGENT_DIR` verification on server.
- Runtime file exists/valid/fresh verification.
- Server endpoint checks.
- `/public` visual verification.
- Paper fill evidence collection.
- Approval checklist.

### Phase M-0P Blocked / Pending
- Plesk deployment verification pending.
- `BINGX_AGENT_DIR` verification pending.
- Server runtime file verification pending.
- Endpoint checks pending.
- `/public` visual verification pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0P Next
1. Operator completes Plesk `git pull origin main`.
2. Operator removes stale `dashboard/.next`.
3. Operator runs `npm install`.
4. Operator runs `npm run build`.
5. Operator restarts Node.js App in Plesk.
6. Operator verifies `DATA_DIR`, `BINGX_AGENT_DIR`, and `AGENT_DIR` point to `/var/www/vhosts/ob-gate.com/httpdocs`.
7. Operator verifies runtime files at project root.
8. Operator verifies server endpoints return safe JSON.
9. Operator verifies `/public` dashboard and red block classification.
10. Operator collects paper fill evidence.
11. Codex records returned evidence.
12. Only after all gates pass, consider Phase M-0B.

### Phase M-0O Done
- [x] Codex accepted Claude cowork handoff input from Phase M-0N changelog and reported that no fully filled `Codex Git Handoff Required` block was present.
- [x] Branch `main` verified.
- [x] Remote `origin` verified.
- [x] Pull/rebase latest `origin/main` completed.
- [x] Dashboard build EXIT:0.
- [x] Safe files staged only.
- [x] Runtime JSON / secrets excluded from staged files.
- [x] Commit created.
- [x] Push `origin main` completed.

### Phase M-0O In Progress
- Operator/Plesk pull/rebuild/restart.
- `BINGX_AGENT_DIR` verification.
- Server endpoint checks.
- `/public` visual verification.
- Paper fill evidence.
- Approval checklist.

### Phase M-0O Blocked / Pending
- Plesk deployment verification pending.
- `BINGX_AGENT_DIR` verification pending.
- Endpoint checks pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0O Next
1. Operator pulls latest main on Plesk.
2. Operator cleans `dashboard/.next`.
3. Operator runs `npm install`.
4. Operator runs `npm run build`.
5. Operator restarts Node.js App.
6. Operator verifies `BINGX_AGENT_DIR`.
7. Operator verifies runtime files.
8. Operator verifies endpoints.
9. Operator verifies `/public`.
10. Operator collects paper fill evidence.
11. Only after all gates pass, consider Phase M-0B.

### Phase M-0M Done
- [x] Codex reviewed Claude cowork docs changes and confirmed no filled `Codex Git Handoff Required` block was present.
- [x] Codex treated `PROJECT_MAP.md` and `PROJECT_ARCHITECTURE.md` as docs-only release candidates after diff review.
- [x] Branch `main` verified.
- [x] Remote `origin` verified as `https://github.com/preechayutbubphachat/bingx-agent.git`.
- [x] Pull/rebase latest `origin/main` completed without conflict.
- [x] Runtime/secret protection checked before staging.
- [x] Dashboard build required before commit/push.
- [x] Safe files only: docs release ownership updates.
- [x] Phase M-0B remains BLOCKED.



### Phase M-0N Done
- [x] PART A (session 1) — Docs consistency check: PROJECT_CONTEXT.md / PROJECT_MAP.md / PROJECT_ARCHITECTURE.md all aligned; no conflicts found.
- [x] PART B (session 1) — Current Stage updated to Phase M-0N; Done/In Progress/Blocked/Next sections added.
- [x] PART C (session 1) — `## Plesk Server Verification Checklist` section added to PROJECT_MAP.md.
- [x] PART D (session 1) — `## Red Block Classification Rule` section added to PROJECT_MAP.md.
- [x] PART E (session 1) — `## Paper Fill Evidence Plan` section added to PROJECT_MAP.md.
- [x] PART F (session 1) — PROJECT_CONTEXT.md Section 8 verified correct.
- [x] PART G (session 1) — Changelog entry added.
- [x] PART A (session 2) — Docs consistency audit: all 3 files consistent; PROJECT_CONTEXT.md §8 needs expansion; SERVER_EVIDENCE_LEDGER.md missing.
- [x] PART B (session 2) — `docs/SERVER_EVIDENCE_LEDGER.md` created with 10 sections (Purpose, Decision, Plesk, Env, Runtime, Endpoints, Dashboard, Red Block Classification, Paper Evidence, Approval Status).
- [x] PART C (session 2) — PROJECT_MAP.md Current Stage updated; Done block expanded.
- [x] PART D (session 2) — PROJECT_CONTEXT.md §8 expanded from 6 steps to 10 steps with explicit references to SERVER_EVIDENCE_LEDGER.md.
- [x] PART E (session 2) — PROJECT_ARCHITECTURE.md §15 cross-reference updated to include docs/SERVER_EVIDENCE_LEDGER.md.
- [x] PART F (session 2) — Changelog entry added.
- [x] Docs-only change — no code files modified.
- [x] No git commands used by Claude.

### Phase M-0N In Progress
- Codex Git release (build + commit + push origin main).
- Plesk pull/rebuild/restart by Operator.
- `BINGX_AGENT_DIR` verification on Plesk.
- Server endpoint verification.
- `/public` visual verification.
- Paper fill evidence collection.
- Approval checklist completion.

### Phase M-0N Blocked / Pending
- Codex build + commit + push pending if not yet done.
- Plesk pull/rebuild/restart pending if not yet done.
- `BINGX_AGENT_DIR` not verified on server.
- Endpoint checks on server pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0N Next
1. Codex performs build + commit + push origin main.
2. Operator pulls latest main on Plesk.
3. Operator runs `rm -rf .next`.
4. Operator runs `npm install`.
5. Operator runs `npm run build`.
6. Operator restarts Node.js App.
7. Operator verifies `BINGX_AGENT_DIR`.
8. Operator verifies `/public` dashboard.
9. Operator verifies endpoints (see Plesk Server Verification Checklist below).
10. Operator collects paper fill evidence.
11. Only after all gates pass, consider Phase M-0B.

### Phase M-0L-D Done
- [x] PART A — PROJECT_CONTEXT.md audited: all 8 sections present; Section 4 Codex "Git owner" → "Git release owner" updated; Section 8 explicit "Claude must not perform Git" added as first item.
- [x] PART B — PROJECT_MAP.md verified: all key subsections present (§0.2 Agent Responsibility Boundary, Absolute Git Rule, Codex Branch Rule, Final Non-Git Enforcement Note, §0.3 Codex Git Handoff Template, §0.4 Standard Claude Closing Format). No changes required.
- [x] PART C — Codex Git Handoff Template verified: `main` branch check + remote verification present in §0.3. No changes required.
- [x] PART D — PROJECT_ARCHITECTURE.md §15 cross-reference updated: added `PROJECT_CONTEXT.md` reference alongside `PROJECT_MAP.md` and `docs/RUNTIME_FILES_GIT_POLICY.md`.
- [x] PART E — Current Stage updated to Phase M-0L-D.
- [x] PART F — PROJECT_CONTEXT.md Section 8 Current Next Step updated with explicit step list.
- [x] PART G — Changelog entry added.
- [x] Docs-only change — no runtime code files modified.
- [x] No git commands used by Claude.

### Phase M-0M In Progress
- Operator/Plesk pull/rebuild/restart.
- `BINGX_AGENT_DIR` verification on Plesk.
- Server endpoint checks.
- Paper fill evidence.
- Approval checklist.

### Phase M-0M Blocked / Pending
- Plesk deployment verification pending.
- Endpoint checks pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0L-C Done
- [x] PART A — Audit confirmed: all 10 git prohibitions present in `### Claude cowork — ห้ามทำ`; `### Final Non-Git Enforcement Note` absent → added.
- [x] PART B — `### Final Non-Git Enforcement Note` added to `## 0.2) Agent Responsibility Boundary` — explicit rule that Claude is not the Git/release agent; no exceptions; Codex is sole Git actor; Operator is sole Plesk actor.
- [x] PART C — `## 15) Agent / Release Ownership` section added to `PROJECT_ARCHITECTURE.md` — responsibility matrix (Claude/Codex/Operator), key rules cross-referencing §0.2, Phase M-0B gate conditions.
- [x] PART D — Current Stage updated to Phase M-0L-C.
- [x] PART E — 2026-05-27 changelog entry added.
- [x] Docs-only change — no runtime code files modified.
- [x] No git commands used by Claude.

### Phase M-0L-B Done
- [x] `### Absolute Git Rule for Claude` subsection added to section 0.2 — prohibits Claude from all Git operations; must produce Codex handoff block only.
- [x] `### Codex Branch Rule` subsection added to section 0.2 — Codex must verify `main` branch before staging; no other branch unless operator approves.
- [x] Expanded `### Claude cowork — ห้ามทำ` list — added `git fetch`, `git reset` (all forms), `git checkout`, `git status` (in release context).
- [x] Expanded never-commit list in section 0.3 — added `.env.*`, `dashboard/node_modules/`, `dashboard/.next/`, secrets/API keys.
- [x] `### Runtime JSON Protection Note` added to section 0.3 — `git rm --cached` is Codex-only; Claude must not run it.
- [x] `## 0.4) Standard Claude Closing Format` section added — required closing report block template for all Claude sessions.
- [x] Current Stage updated to Phase M-0L-B.
- [x] Changelog entry added.
- [x] No git commands used by Claude.

### Phase M-0L-A Done
- [x] `## 0.2) Agent Responsibility Boundary` section added to PROJECT_MAP.md — documents Claude/Codex/Operator split, Claude Git prohibition, and required handoff format.
- [x] `## 0.3) Codex Git Handoff Template` section added — step-by-step commands for Codex to build + commit + push, with "never commit" file list.
- [x] Current Stage updated to Phase M-0L-A.
- [x] Changelog entry added.
- [x] No git commands used by Claude.

### Phase M-0L-A/B Blocked / Pending
- **Codex**: build + `git add` safe files + `git commit` + `git push origin main`
- **Operator**: Plesk `git pull origin main` + rebuild + restart Node app
- **Operator**: set `BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs` in Plesk env
- **Server checks**: endpoint verification, runtime file verification, `/public` visual check
- **Paper fills**: `averageFillPrice` evidence pending
- **`EXCHANGE_MANUAL_APPROVAL`**: not approved
- **Phase M-0B**: BLOCKED

### Source of Truth (Runtime)
| ไฟล์ | บทบาท | Authority |
|------|--------|-----------|
| `<PROJECT_ROOT>/latest_decision.json` | ผลวิเคราะห์ STEP01 ล่าสุด | **ROOT — authoritative** |
| `<PROJECT_ROOT>/market_snapshot.json` | Market snapshot ล่าสุด | **ROOT — authoritative** |
| `dashboard/app/public/data/*.json` | Mirror เพื่อแสดงผล/cache | display-only, not authoritative |

> `<PROJECT_ROOT>` กำหนดโดย `BINGX_AGENT_DIR=<PROJECT_ROOT>` — production server: `httpdocs/` | local Windows: path โปรเจคจริง | ห้าม hard-code `C:\bingx-agent`

### Phase M-0I Done
- [x] Screenshot error/warning blocks analyzed.
- [x] Production unauthenticated endpoint audit completed; API paths returned login HTML instead of JSON without session.
- [x] Runtime file audit completed locally; core runtime JSON valid, `scheduler_heartbeat.json` missing.
- [x] `/api/plan-status` hardened to return structured safe JSON on unexpected errors.
- [x] `/api/latest`, `/api/runtime-audit`, and `/api/exchange-readiness` hardened to avoid client stack/internal error leakage.
- [x] `readLatest()` now honors `BINGX_AGENT_DIR=<PROJECT_ROOT>`.
- [x] `/api/health` no longer falls back to `C:\bingx-agent`; it uses runtime directory detection.
- [x] `PlanStatusProvider` handles non-JSON/login responses and structured `ok:false` payloads without crashing the whole provider tree.
- [x] `DashboardDiagnosticsCard` added to summarize endpoint/runtime issues and next actions.
- [x] Raw `/public` debug JSON reduced behind collapsed details.
- [x] `npm install` EXIT:0.
- [x] `npm run build` EXIT:0.
- [x] Local endpoint checks returned JSON for core M-0 endpoints.
- [x] Local `/public` HTML contains DashboardDiagnosticsCard and collapsed debug details.
- [x] Root runtime/cache files that were still tracked were removed from Git index with `git rm --cached` only.

### Phase M-0I In Progress
- Plesk endpoint/manual dashboard checks.
- Runtime data quality verification on server.
- Paper fill quality evidence.

### Phase M-0I Blocked / Pending
- Plesk `/public` visual check pending after pull/build/restart.
- Plesk authenticated endpoint checks pending.
- `scheduler_heartbeat.json` missing in local runtime audit sample.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation remains BLOCKED.

### Phase M-0I — Runtime Payload Error Audit & Public Dashboard Error Recovery Checklist

- [x] Screenshot errors analyzed.
- [ ] Browser console errors captured on authenticated Plesk session.
- [x] `/api/plan-status` checked locally.
- [x] `/api/health` checked locally.
- [x] `/api/paper-performance` checked locally.
- [x] `/api/operator-evidence` checked locally.
- [x] `/api/m0b-preflight` checked locally.
- [x] `/api/exchange-readiness` checked locally.
- [x] Runtime files checked for exists/readable/validJson locally.
- [x] Endpoint structured error responses hardened.
- [x] Component/provider defensive rendering hardened.
- [x] DashboardDiagnosticsCard added.
- [x] `npm run build` EXIT:0.
- [ ] `/public` visual check passed on Plesk.
- [x] Raw stack traces not exposed by hardened endpoint fallbacks.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0I Next
1. Push runtime payload/error recovery to Git main.
2. Pull on Plesk.
3. Run `npm install && npm run build`.
4. Restart Node.js App in Plesk.
5. Verify `/public` UI is stable and DashboardDiagnosticsCard is visible.
6. Verify authenticated endpoint JSON responses.
7. Verify runtime source-of-truth files and scheduler heartbeat.
8. Continue paper fill evidence collection.
9. Complete approval checklist.
10. Only then consider Phase M-0B.

### 2026-05-27 — Phase M-0S Public-Safe Health Endpoint + Auth-Aware Evidence Release
- Added:
  - `/api/public-health` public-safe endpoint.
  - Public-safe health response contract.
  - Auth proxy dependency files required for protected endpoint redirect behavior.
  - `docs/SERVER_EVIDENCE_LEDGER.md` public-safe probe section.
- Updated:
  - `PROJECT_MAP.md` Current Stage.
  - `PROJECT_CONTEXT.md` Current Next Step.
  - `dashboard/proxy.ts` auth allowlist for `/api/public-health` only.
  - `dashboard/app/api/auth/login/route.ts` sanitized to avoid secret/hash-fragment logging.
- Validation:
  - `npm install`.
  - `npm run build`.
  - local `/api/public-health` check if runnable.
- Pending:
  - Plesk pull/rebuild/restart.
  - authenticated endpoint checks.
  - `/public` visual check.
  - paper fills with `averageFillPrice`.
  - `EXCHANGE_MANUAL_APPROVAL=approved`.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON modified/deleted.
  - no secrets exposed.
  - Phase M-0B remains BLOCKED.

### 2026-05-27 — Phase M-0R Auth-Aware Endpoint Verification + Public Safe Health Probe Planning
- Added/Updated:
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Latest Operator Evidence section (Plesk build, restart, env, runtime files, JSON start check, endpoint curl results, endpoint verification strategy, current gate result table)
  - `PROJECT_MAP.md` — Current Stage updated to Phase M-0R; Done/In Progress/Blocked/Next block added
  - `PROJECT_CONTEXT.md` — Section 8 Current Next Step updated
- Evidence recorded:
  - Plesk npm install + build: PASSED (EXIT:0)
  - Node.js App restart: DONE
  - dashboard/.env.local readable: PASSED
  - DATA_DIR / BINGX_AGENT_DIR / AGENT_DIR: PATH_OK (all resolve to httpdocs)
  - LIVE_TRADING_ENABLED=false: PASS
  - ENABLE_ORDER_PLACEMENT=false: PASS
  - PRODUCTION_TRADING_READY=false: PASS
  - EXCHANGE_MANUAL_APPROVAL=not_approved: PASS
  - Runtime core files (7 of 8): EXISTS + LIKELY_JSON
  - news_context.json: MISSING — classified Expected Blocker
  - Endpoint unauthenticated curl: HTTP 307 redirect to /login
- Interpretation:
  - HTTP 307 = auth protection working correctly, NOT endpoint failure
  - Endpoint JSON correctness requires authenticated browser session (or public-safe endpoint)
  - Next.js Edge Middleware manifest empty — /api/* auth redirect from route-level guard or Plesk proxy
- Pending:
  - Authenticated endpoint verification
  - /public visual check
  - Paper fills with averageFillPrice
  - EXCHANGE_MANUAL_APPROVAL=approved
- Safety:
  - LIVE_TRADING_ENABLED: false
  - ENABLE_ORDER_PLACEMENT: false
  - Phase M-0B: BLOCKED
  - No runtime JSON modified/deleted
  - No secrets exposed
  - No Git commands used by Claude

### 2026-05-27 — Phase M-0Q Environment File Audit + Git Release Owner Handoff
- Added:
  - `docs/ENVIRONMENT_AUDIT.md`.
  - `.env.example` with placeholder-only server env keys.
- Updated:
  - `dashboard/.env.local.example` with Plesk path placeholders, dashboard settings, auth placeholders, and safety flags.
  - `.gitignore` and `dashboard/.gitignore` env protection.
  - `PROJECT_MAP.md`.
- Validation:
  - `npm install`.
  - `npm run build`.
- Safety:
  - no secrets committed.
  - no `.env` committed.
  - no `dashboard/.env.local` committed.
  - no runtime JSON committed.
  - no live trading.
  - no order placement.
  - Phase M-0B remains BLOCKED.

### 2026-05-27 — Phase M-0P Post-Git Release Plesk Deployment Evidence + Server Verification Handoff
- Codex:
  - verified post-release Git state on branch `main`.
  - verified `origin` remote.
  - pulled/rebased latest `origin/main`.
  - documented Operator/Plesk deployment handoff.
  - documented environment, runtime file, endpoint, and `/public` verification checklists.
- Pending:
  - Plesk pull/rebuild/restart.
  - `BINGX_AGENT_DIR` verification.
  - server runtime file verification.
  - server endpoint checks.
  - `/public` visual check.
  - paper fill evidence.
  - `EXCHANGE_MANUAL_APPROVAL=approved`.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON committed.
  - no secrets committed.
  - Phase M-0B remains BLOCKED.

### 2026-05-27 — Phase M-0O Codex Git Release Owner + Claude Cowork Handoff Execution
- Codex:
  - accepted Claude handoff input from Phase M-0N records and reported handoff block missing.
  - verified branch `main`.
  - verified `origin` remote.
  - pulled/rebased latest `origin/main`.
  - ran dashboard build before commit.
  - staged safe files only.
  - verified no runtime JSON/secrets staged.
  - committed changes.
  - pushed `origin main`.
- Pending:
  - Plesk pull/rebuild/restart.
  - `BINGX_AGENT_DIR` verification.
  - server endpoint checks.
  - `/public` visual check.
  - paper fill evidence.
  - `EXCHANGE_MANUAL_APPROVAL=approved`.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON committed.
  - no secrets committed.
  - Phase M-0B remains BLOCKED.

### 2026-05-28 — Phase M-0X Codex Release Owner: Public-Health Gate Evidence Release + Plesk Verification Handoff
- Codex:
  - verified branch `main`.
  - verified origin remote.
  - pulled/rebased latest `origin/main`.
  - reviewed Phase M-0W evidence/handoff state.
  - ran dashboard build.
  - staged safe files only.
  - committed changes if any.
  - pushed `origin main` if commit existed.
- Pending:
  - `/api/public-health` server verification.
  - authenticated endpoint checks.
  - `/public` visual check.
  - paper fills with `averageFillPrice`.
  - `EXCHANGE_MANUAL_APPROVAL=approved`.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON committed.
  - no secrets committed.
  - Phase M-0B remains BLOCKED.

### 2026-05-29 — Phase M-0Z-6 Evidence Intake Execution + Post-Deploy Triage + Paper Liveness Decision
- Designed:
  - Phase M-0Z-6 roadmap: 7-Checkpoint evidence intake (Codex release confirm → Plesk deploy → BINGX_AGENT_DIR verify → runtime files verify → /api/public-health post-deploy → /public visual + /api/paper-performance → M-0B gate decision).
  - 13-row Evidence Gate Matrix with PASS/FAIL criteria per gate (PASS/FAIL/PENDING/DATA_GAP/NOT_APPROVED/BLOCKED).
  - 8-step Paper Fill Liveness Audit + optional 14-point deeper audit + 10-class liveness classification.
  - Minimal Fix Policy: 8 bug class taxonomy (frontend display / API parsing / paper journal parsing / source-of-truth path / scheduler / deployment-env / simulation fill logic / documentation-only) each with files/validation/rollback/Codex handoff decision.
  - Codex Git Handoff block: safe files, forbidden files, commit message, stop conditions, validation commands, report format.
  - Operator 15-point post-deploy checklist.
  - M-0B pre-gate decision: BLOCKED (1 PASS / 9 PENDING / 1 DATA_GAP / 1 NOT_APPROVED).
- Updated:
  - `PROJECT_CONTEXT.md` — Current Stage → M-0Z-6; §8 header fixed (M-0Z-4 → M-0Z-6); full snapshot rewritten (confirmed/pending/gate summary/12 next actions).
  - `PROJECT_MAP.md` — Current Stage → M-0Z-6; Phase M-0Z-6 Done/In Progress/Blocked/Next added; Changelog entry added.
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Current Stage → M-0Z-6; Phase M-0Z-6 evidence intake section added (13-row table + gate decision + liveness trigger).
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API called.
  - no runtime JSON modified.
  - no secrets exposed.
  - Phase M-0B remains BLOCKED.

----

### 2026-05-29 — Phase M-0Z-5 Post-Release Evidence Intake + Gate Classification + Paper Fill Liveness Root-Cause Plan
- Designed:
  - Phase M-0Z-5 roadmap: 5-Checkpoint evidence intake (Codex commit confirm → Plesk deploy → BINGX_AGENT_DIR verify → endpoint probes → /public visual + paper-performance).
  - 12-row Evidence Gate Matrix with classification rules (PASS/FAIL/PENDING/DATA_GAP/NOT_APPROVED/BLOCKED).
  - 8-step Paper Fill Liveness Audit (scheduler health → plan_status state → market_snapshot age → paper mode flag → journal path resolution → events written in last 24h → /api/paper-performance path → dashboard vs backend reconciliation).
  - Minimal Fix Policy: 6 bug class taxonomy (path resolution / scheduler / paper mode flag / event parsing / API route / data quality) each with files, validation, rollback, Codex handoff decision.
  - Codex Git Handoff block: Fix 1+2 code files + M-0Z-3/4/5 doc updates.
  - Operator 11-point post-deploy checklist.
  - M-0B pre-gate decision: BLOCKED (2/11 gates PASS — `npm run build` + env safety flags).
- Updated:
  - `PROJECT_CONTEXT.md` — Current Stage → M-0Z-5; full snapshot rewritten (confirmed/pending/gate summary/11 next actions).
  - `PROJECT_MAP.md` — Current Stage → M-0Z-5; Phase M-0Z-5 Done/In Progress/Blocked/Next added; Changelog entry added.
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Current Stage → M-0Z-5; Phase M-0Z-5 evidence intake section added (12-row table + gate decision).
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API called.
  - no runtime JSON modified.
  - no secrets exposed.
  - Phase M-0B remains BLOCKED.

----

### 2026-05-28 — Phase M-0Z-4 Build Release Verification + Post-Deploy Evidence Intake + Paper Fill Liveness Audit
- Designed:
  - Phase M-0Z-4 roadmap: 7-Checkpoint plan (Build → Release → Plesk → Health → Visual → Paper → Approval).
  - Evidence Gate Matrix: 11 rows (gate / status / owner / next action / PASS/FAIL criteria / M-0B impact).
  - Paper Fill Liveness Audit: 8-step checklist (scheduler → plan_status → market_snapshot → paper mode → journal path → events written → API path → dashboard vs backend).
  - Minimal Fix Policy: 6 bug type classifications with files/validation/rollback.
  - Codex Handoff Block: 7-step build+release with STOP conditions.
  - Operator Checklist: 11-point deploy + visual + evidence verification.
  - M-0B Read-only Pre-Plan: scope boundary, auth design, rate limit policy, dry-run contract, rollback plan, approval checklist.
- Updated:
  - `PROJECT_CONTEXT.md` — Current Snapshot to Phase M-0Z-4.
  - `PROJECT_MAP.md` — Current Stage to Phase M-0Z-4; Phase M-0Z-4 Done/In Progress/Blocked/Next added.
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Phase M-0Z-4 evidence intake section added.
- Pending (Codex): commit safe files → push origin main after build PASS.
- Pending (Operator): Plesk deploy → /api/public-health verify → /public visual verify.
- Pending (System): paper fills accumulate naturally.
- Safety: no live trading / no order placement / no exchange API / no runtime JSON modified / no secrets exposed / Phase M-0B BLOCKED.

### 2026-05-28 — Phase M-0Z-3 Evidence Gate Closeout Orchestration + Build/Visual/Paper Readiness Handoff
- Designed:
  - Phase M-0Z-3 roadmap (Evidence Gate Matrix, Codex Handoff, Operator Checklist, Paper Evidence Plan, M-0B Pre-Plan, Failure Decision Tree).
  - Evidence Gate Matrix — 10 gates classified (PASS/PENDING/BLOCKED/NOT_APPROVED/INSTRUMENTATION_FIXED/N/A).
  - M-0B Pre-Plan: read-only scope, BingX API auth safety, rate limit policy, rollback conditions.
- Updated:
  - `PROJECT_CONTEXT.md` — Current Snapshot updated to Phase M-0Z-3.
  - `PROJECT_MAP.md` — Current Stage to Phase M-0Z-3; Phase M-0Z-3 Done/In Progress/Blocked/Next added.
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Phase M-0Z-3 evidence intake section added.
- Pending (Codex):
  - `npm run build` (EXIT:0).
  - Commit Fix 1+2 code + M-0Z-3 doc updates → push `origin main`.
- Pending (Operator):
  - Plesk pull + rebuild + restart.
  - `/public` visual verification (authenticated).
- Pending (System):
  - Paper fills to accumulate naturally (0 fills so far).
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON modified/deleted.
  - no secrets exposed.
  - Phase M-0B remains BLOCKED.

### 2026-05-28 — Phase M-0Z-2 Paper Evidence Instrumentation Fix Implementation

- Implemented:
  - Fix 1 — `dashboard/lib/readPaperJournal.ts`: added `ORDER_FILLED` payload extraction block (orderId, orderStatus, filledQuantity, averageFillPrice/avgPrice fallback, executedQty fallback)
  - Fix 2 — `dashboard/lib/paperPerformance.ts`: added `FILL_RESULT` to `extractFills()` event type filter
- Verified:
  - TypeScript syntax check: 0 errors across all project TS/TSX files (node parse check)
  - `npm run build` PENDING — sandbox DNS blocked; Codex must run on actual machine
- Added:
  - `## Phase M-0Z-2 Implementation Result` — in `docs/SERVER_EVIDENCE_LEDGER.md`: Fix 1/2 code, build status, post-fix gate status
  - Phase M-0Z-2 Done/InProgress/Blocked/Next blocks in PROJECT_MAP.md
- Updated:
  - `PROJECT_CONTEXT.md` — Current Snapshot updated to Phase M-0Z-2; Next Actions updated
  - `PROJECT_MAP.md` — Current Stage updated to Phase M-0Z-2
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Evidence snapshot updated to Phase M-0Z-2; implementation result section added
- Evidence:
  - `/api/public-health`: PASS (preserved)
  - Protected endpoints: SAFE_JSON_WITH_EXPECTED_BLOCKERS (preserved)
  - `/public` visual: PENDING
  - Paper instrumentation: INSTRUMENTATION_FIXED — awaiting real paper fills
  - Paper data: BLOCKED — 0 fills yet (data gap remains)
- Gate:
  - Phase M-0B remains **BLOCKED**
- Safety:
  - No Git command used by Claude
  - No exchange API called
  - No server.cjs modified
  - No runtime JSON modified
  - No secrets exposed
  - No live trading enabled

---

### 2026-05-28 — Phase M-0Z-1 Paper Evidence Instrumentation Audit + /public Visual Evidence Closeout

- Added:
  - `## Phase M-0Z-1 Paper Evidence Instrumentation Audit` — in `docs/SERVER_EVIDENCE_LEDGER.md`: 5 gaps classified, root cause table (instrumentation vs data)
  - `## Phase M-0Z-1 Minimal Implementation Plan` — Fix 1 (`readPaperJournal.ts`), Fix 2 (`paperPerformance.ts`), Fix 3 deferred
  - `/public` Manual Verification Script — operator/Codex step-by-step checklist in `docs/SERVER_EVIDENCE_LEDGER.md`
  - Phase M-0Z-1 Done/InProgress/Blocked/Next blocks in PROJECT_MAP.md
- Updated:
  - `PROJECT_CONTEXT.md` — Current Snapshot updated to Phase M-0Z-1; §8 next steps updated
  - `PROJECT_MAP.md` — Current Stage updated to Phase M-0Z-1; Phase M-0Z-1 evidence snapshot row added
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Evidence snapshot updated; audit + implementation plan sections added; /public manual checklist added
- Evidence:
  - `/api/public-health`: PASS (preserved)
  - Protected endpoints: SAFE_JSON_WITH_EXPECTED_BLOCKERS (preserved)
  - `/public` visual: PENDING (manual checklist ready)
  - Paper evidence: BLOCKED — instrumentation gap (Gap 1: ORDER_FILLED not parsed; Gap 2: FILL_RESULT ignored in extractFills) + no paper fills yet
  - Paper instrumentation audit: DONE 2026-05-28
- Gate:
  - Phase M-0B remains **BLOCKED**
  - All PASS → `READY_FOR_REVIEW` only, not live trading
- Safety:
  - No Git command used by Claude
  - No code implemented (Fix 1+2 proposed only — Codex implements)
  - No live trading
  - No order placement
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets exposed

---

### 2026-05-28 — Phase M-0Z Role Governance + Context Optimization + Visual/Paper Evidence Gate Plan

- Added:
  - `## 0.1B) Canonical Agent Roles` — Claude/Codex/Operator role titles + responsibilities + must-not rules
  - `## 0.1C) File Ownership / Purpose Model` — role of each project file
  - `## 0.1D) RACI Matrix` — 14-row RACI across all workstreams
  - `## 0.1E) Decision Log` — 3 decisions recorded (role governance, Phase M-0B gate, file purpose)
  - `## 0.1F) Context Hygiene Rules` — 12 hygiene rules
  - Phase M-0Z Done/InProgress/Blocked/Next blocks in PROJECT_MAP.md
- Updated:
  - `PROJECT_CONTEXT.md` — rewritten as short-form 2-minute context with Current Snapshot section + §4 canonical roles + §9 Context Hygiene Rules + §8 Phase M-0Z next steps
  - `PROJECT_MAP.md` — Current Stage updated to Phase M-0Z
  - `docs/SERVER_EVIDENCE_LEDGER.md` — Phase M-0Z evidence snapshot section + `/public` visual PASS/WARNING/FAIL criteria + paper evidence gate criteria
- Evidence:
  - `/api/public-health`: PASS (preserved from Phase M-0Y)
  - Protected endpoints: SAFE_JSON_WITH_EXPECTED_BLOCKERS (preserved from Phase M-0Y)
  - `/public` visual: PENDING
  - Paper evidence: BLOCKED (missing averageFillPrice/fillQty/closed cycles)
- Gate:
  - Phase M-0B remains **BLOCKED**
  - All PASS → `READY_FOR_REVIEW` only, not live trading
- Safety:
  - No Git command used by Claude
  - No live trading
  - No order placement
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets exposed

---

### 2026-05-28 — Phase M-0Y Authenticated Browser Evidence Verification + Operator-Minimal Manual Handoff
- Updated:
  - `PROJECT_MAP.md` Current Stage.
  - `docs/SERVER_EVIDENCE_LEDGER.md` with `/api/public-health` PASS.
  - `PROJECT_CONTEXT.md` Current Next Step.
- Evidence:
  - `/api/public-health` PASS.
  - protected endpoints classified from Operator `api.txt`: safe JSON responses with expected runtime/paper/approval blockers.
  - `/public` visual pending browser verification.
  - paper fill evidence blocked: missing `averageFillPrice`, fill quantity, and closed cycles.
- Workflow:
  - Codex should verify via browser/session if possible.
  - Operator only logs in when Codex requests.
  - If Codex cannot use browser/session, Operator receives minimal manual checklist.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no secrets requested in chat.
  - no runtime JSON committed.
  - no secrets committed.
  - Phase M-0B remains BLOCKED.

### 2026-05-28 — Phase M-0W Operator Verification Result Intake + Public-Health Gate Closeout
- Updated: `PROJECT_MAP.md` Current Stage → Phase M-0W; Phase M-0W Done/In Progress/Blocked/Next blocks added
- Updated: `docs/SERVER_EVIDENCE_LEDGER.md` — Phase M-0W verification result intake section added (5 sub-sections: public-health probe result, protected endpoints result, /public visual result, paper evidence result, Phase M-0B gate result — all PENDING operator input)
- Updated: `PROJECT_CONTEXT.md` §8 — Current Next Step updated to Phase M-0W workflow (9 steps)
- Evidence: all items PENDING — awaiting Operator to submit `/api/public-health` output, authenticated endpoint results, `/public` visual, paper fill evidence
- Gate rules: FAIL or PENDING on any gate → Phase M-0B BLOCKED; all PASS → READY_FOR_REVIEW only, not live trading
- Validation: docs-only change, no runtime code changed, no git commands used by Claude, build not required
- Pending: all operator evidence fields, EXCHANGE_MANUAL_APPROVAL not approved
- Safety: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, Phase M-0B BLOCKED, no exchange API calls, no runtime JSON modified, no secrets added
- Files changed: PROJECT_MAP.md, PROJECT_CONTEXT.md, docs/SERVER_EVIDENCE_LEDGER.md

### 2026-05-28 — Phase M-0V Public-Health Server Verification Intake + Protected Endpoint Evidence Closeout Plan
- Updated: `PROJECT_MAP.md` Current Stage → Phase M-0V; Phase M-0V Done/In Progress/Blocked/Next blocks added
- Updated: `docs/SERVER_EVIDENCE_LEDGER.md` — Phase M-0V evidence intake section added (5 sub-sections: public-health probe, protected endpoints authenticated, /public dashboard visual, paper evidence, gate decision — all PENDING operator input)
- Updated: `PROJECT_CONTEXT.md` §8 — Current Next Step updated to Phase M-0V workflow (9 steps)
- Evidence status: all items PENDING — awaiting Operator verification of `/api/public-health`, authenticated endpoints, `/public`, paper fills
- Gate rules: if any gate FAIL → Phase M-0B BLOCKED; if all PASS → READY_FOR_REVIEW only, does not enable live trading
- Validation: docs-only change, no runtime code changed, no git commands used by Claude, build not required
- Pending: all operator evidence fields, EXCHANGE_MANUAL_APPROVAL
- Safety: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, Phase M-0B BLOCKED, no exchange API calls, no runtime JSON modified, no secrets added
- Files changed: PROJECT_MAP.md, PROJECT_CONTEXT.md, docs/SERVER_EVIDENCE_LEDGER.md

### 2026-05-27 — Phase M-0U Operator Evidence Intake After Public-Health Release + M-0B Gate Decision Preparation
- Updated: PROJECT_MAP.md Current Stage → Phase M-0U; Phase M-0U Done/In Progress/Blocked/Next block added
- Updated: docs/SERVER_EVIDENCE_LEDGER.md — Phase M-0U evidence intake section (6 sub-sections: Plesk deployment, public-health probe, protected endpoints, /public dashboard, paper evidence, gate decision — all PENDING operator input)
- Updated: docs/SERVER_EVIDENCE_LEDGER.md — Evidence Classification Rules (PASS / WARNING / FAIL with explicit criteria for each)
- Updated: PROJECT_CONTEXT.md §8 — Current Next Step updated to Phase M-0U workflow (8 steps)
- Evidence status: all items PENDING — awaiting Operator input for `/api/public-health`, protected endpoints, `/public`, paper fills
- Gate rules documented: if any gate FAIL → Phase M-0B BLOCKED; if all PASS → READY_FOR_REVIEW only, not live trading
- Validation: docs-only, no runtime code changed, no git commands used by Claude, build not required
- Pending: all operator evidence, EXCHANGE_MANUAL_APPROVAL
- Safety: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, Phase M-0B BLOCKED, no exchange API calls, no runtime JSON modified, no secrets added
- Files changed: PROJECT_MAP.md, PROJECT_CONTEXT.md, docs/SERVER_EVIDENCE_LEDGER.md

### 2026-05-27 — Phase M-0T Public-Health Plesk Evidence Intake + Authenticated Endpoint Closeout Plan
- Updated: PROJECT_MAP.md Current Stage → Phase M-0T; Done/In Progress/Blocked/Next block added
- Updated: docs/SERVER_EVIDENCE_LEDGER.md — Phase M-0T evidence intake (release evidence, env/runtime confirmation, HTTP 307 classification, public-health probe status, endpoint status table, gate decision)
- Updated: docs/SERVER_EVIDENCE_LEDGER.md — Operator Verification Commands (pull/build/restart, public-health curl, protected endpoints, /public visual)
- Updated: PROJECT_CONTEXT.md §8 — Current Next Step updated to Phase M-0T workflow (8 steps)
- Evidence acknowledged: Plesk env/runtime confirmed from previous session; HTTP 307 on protected endpoints = expected auth behavior
- Validation: docs-only, no runtime code changed, no git commands used by Claude, build not required
- Pending: Plesk pull/rebuild/restart after M-0S release, /api/public-health server HTTP 200 verification, authenticated endpoint checks, /public visual check, paper fills with averageFillPrice, EXCHANGE_MANUAL_APPROVAL
- Safety: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, Phase M-0B BLOCKED, no exchange API calls, no runtime JSON modified, no secrets added
- Files changed: PROJECT_MAP.md, PROJECT_CONTEXT.md, docs/SERVER_EVIDENCE_LEDGER.md

### 2026-05-27 — Phase M-0N (session 2) Server Evidence Intake + Plesk Verification + M-0B Gate Readiness Ledger
- Added: `docs/SERVER_EVIDENCE_LEDGER.md` — 10-section server evidence ledger (Plesk deployment, env, runtime files, endpoints, dashboard, red block classification, paper evidence, approval gate)
- Updated: PROJECT_CONTEXT.md §8 — expanded from 6 steps to 10 steps with explicit Operator workflow and SERVER_EVIDENCE_LEDGER.md references
- Updated: PROJECT_ARCHITECTURE.md §15 — cross-reference to docs/SERVER_EVIDENCE_LEDGER.md added
- Updated: PROJECT_MAP.md Current Stage and Done block
- Validation: docs-only, no runtime code changed, no git commands used by Claude, build not required
- Pending: Codex Git release (build + commit + push), Plesk pull/rebuild/restart, BINGX_AGENT_DIR verification, endpoint checks, paper fills with averageFillPrice, EXCHANGE_MANUAL_APPROVAL
- Safety: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, Phase M-0B BLOCKED, no exchange API calls, no runtime JSON modified, no secrets added
- Files changed: docs/SERVER_EVIDENCE_LEDGER.md (created), PROJECT_CONTEXT.md, PROJECT_ARCHITECTURE.md, PROJECT_MAP.md

### 2026-05-27 — Phase M-0N Non-Git Server Evidence Planning + Plesk Verification Handoff
- Added: Plesk Server Verification Checklist (Deployment/Environment/Runtime/Endpoints/Dashboard)
- Added: Red Block Classification Rule (Expected Blockers vs Real Bugs)
- Added: Paper Fill Evidence Plan (10 required checkboxes + Rules block)
- Updated: PROJECT_MAP.md Current Stage → Phase M-0N
- Updated: PROJECT_MAP.md Phase M-0N Done/In Progress/Blocked/Next block
- Validation: docs-only, no runtime code changed, no git commands, build not required
- Pending: Codex build/commit/push, Plesk pull/rebuild/restart, BINGX_AGENT_DIR verification, endpoint checks, paper fills with averageFillPrice, EXCHANGE_MANUAL_APPROVAL
- Safety: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, Phase M-0B BLOCKED, no exchange API calls, no runtime JSON modified, no secrets added
- Files changed: PROJECT_MAP.md only

### 2026-05-27 — Phase M-0L-D Finalize Project Context + Claude Non-Git Rule + Codex Git Ownership
- Added:
  - `PROJECT_ARCHITECTURE.md` §15 cross-reference updated to include `PROJECT_CONTEXT.md` (quick context for AI agents) alongside `PROJECT_MAP.md` and `docs/RUNTIME_FILES_GIT_POLICY.md`.
- Updated:
  - `PROJECT_CONTEXT.md` Section 4 — Codex responsibility: "Git owner" → "Git release owner", added "build must pass before commit" and "safe files only" qualifiers.
  - `PROJECT_CONTEXT.md` Section 8 — Current Next Step: explicit step list with "Claude must not perform Git" as first item; numbered steps for Codex/Operator/paper evidence.
  - `PROJECT_MAP.md` — Current Stage to Phase M-0L-D, Phase M-0L-D Done section added, Changelog updated.
- Validated:
  - Docs-only change — no runtime code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - Codex build + `git add PROJECT_MAP.md PROJECT_ARCHITECTURE.md PROJECT_CONTEXT.md` + `git commit` + `git push origin main`
  - Operator: Plesk deployment + BINGX_AGENT_DIR env + endpoint checks
  - Phase M-0B remains BLOCKED until all gates pass
- Safety:
  - LIVE_TRADING_ENABLED: false (unchanged)
  - ENABLE_ORDER_PLACEMENT: false (unchanged)
  - PRODUCTION_TRADING_READY: false (unchanged)
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets added or exposed

### 2026-05-27 — Phase M-0M Codex Git Release Owner Execution + Claude Cowork Handoff Processing
- Codex:
  - verified `main` branch.
  - verified `origin` remote.
  - pulled/rebased latest `origin/main`.
  - reviewed Claude docs changes and found no filled handoff block; proceeded with docs-only candidates after diff review.
  - removed duplicate `PROJECT_ARCHITECTURE.md` Agent / Release Ownership section before release.
  - required dashboard build before commit/push.
  - staged safe files only.
- Pending:
  - Plesk pull/rebuild/restart.
  - server endpoint checks.
  - paper fill evidence.
  - `EXCHANGE_MANUAL_APPROVAL=approved`.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON committed.
  - no secrets committed.

### 2026-05-27 — Phase M-0L-C Finalize Claude Non-Git Workflow + Codex Git Handoff Enforcement
- Added:
  - `### Final Non-Git Enforcement Note` in `## 0.2) Agent Responsibility Boundary` — canonical rule: Claude is not the Git/release agent; Codex is sole Git actor; Operator is sole Plesk/server actor; no exceptions without explicit PROJECT_MAP.md supersession.
  - `## 15) Agent / Release Ownership` in `PROJECT_ARCHITECTURE.md` — responsibility matrix table, key git prohibition rules cross-ref to §0.2, Phase M-0B gate conditions (6 items required before operator approval).
- Updated:
  - `PROJECT_MAP.md` — Current Stage to Phase M-0L-C, Phase M-0L-C Done section added, Changelog updated.
- Validated:
  - Docs-only change — no runtime code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - **Codex**: build + `git add PROJECT_MAP.md PROJECT_ARCHITECTURE.md` + `git commit` + `git push origin main`
  - **Operator**: Plesk deployment + BINGX_AGENT_DIR env + endpoint checks
  - Phase M-0B remains BLOCKED until all gates pass
- Safety:
  - LIVE_TRADING_ENABLED: false (unchanged)
  - ENABLE_ORDER_PLACEMENT: false (unchanged)
  - PRODUCTION_TRADING_READY: false (unchanged)
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets added or exposed

### 2026-05-27 — Phase M-0L-B Lock Non-Git Claude Workflow + Codex Git Ownership Audit
- Added:
  - `### Absolute Git Rule for Claude` subsection in `## 0.2)` — explicit rule: Claude must never run or suggest itself as Git actor; must produce Codex handoff block only.
  - `### Codex Branch Rule` subsection in `## 0.2)` — Codex must verify `main` branch before staging; no other branch unless operator explicitly approves.
  - `### Runtime JSON Protection Note` in `## 0.3)` — `git rm --cached` is Codex-only; Claude must not run it; protects root source-of-truth files from Git overwrite.
  - `## 0.4) Standard Claude Closing Format` — required session-closing report template; all future Claude sessions must produce this block.
- Updated:
  - `## 0.2)` — `### Claude cowork — ห้ามทำ` list expanded: `git fetch`, `git reset` (all forms), `git checkout` (release), `git status` (release context) added.
  - `## 0.3)` — never-commit list expanded: `.env.*`, `dashboard/node_modules/`, `dashboard/.next/`, `secrets / API keys / credentials` added.
  - `PROJECT_MAP.md` — Current Stage to M-0L-B, Phase M-0L-B Done section added, Changelog updated.
- Validated:
  - Docs-only change — no runtime code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - **Codex**: build + `git add` safe files + `git commit` + `git push origin main`
  - **Operator**: Plesk deployment + BINGX_AGENT_DIR env + endpoint checks
  - Phase M-0B remains BLOCKED until all gates pass
- Safety:
  - LIVE_TRADING_ENABLED: false (unchanged)
  - ENABLE_ORDER_PLACEMENT: false (unchanged)
  - PRODUCTION_TRADING_READY: false (unchanged)
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets added or exposed

### 2026-05-27 — Phase M-0L-A Agent Responsibility Boundary + Non-Git Verification Handoff
- Added:
  - `## 0.2) Agent Responsibility Boundary` — documents Claude (analysis/code/docs only), Codex (git release), Operator (Plesk/server) split; Claude Git prohibition enforced; required handoff format after every file change.
  - `## 0.3) Codex Git Handoff Template` — step-by-step commands for Codex: pull/rebase, build-before-push, safe-files-only stage, commit, push; "never commit" file list.
- Updated:
  - `PROJECT_MAP.md` — Current Stage, Next Stage, Phase M-0L-A Done/Blocked sections, Changelog.
- Validated:
  - Docs-only change — no code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - **Codex**: build + `git add` safe files + `git commit` + `git push origin main`
  - **Operator**: Plesk `git pull origin main` + `rm -rf .next` + `npm install` + `npm run build` + restart Node app
  - **Operator**: set `BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs` in Plesk env
  - **Server**: endpoint checks, runtime file verification, `/public` visual check
  - Paper fills with `averageFillPrice`
  - `EXCHANGE_MANUAL_APPROVAL=approved`
- Safety:
  - LIVE_TRADING_ENABLED: false
  - ENABLE_ORDER_PLACEMENT: false
  - PRODUCTION_TRADING_READY: false
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets exposed
  - Phase M-0B remains BLOCKED

### 2026-05-26 — Phase M-0I Runtime Payload Error Audit & Public Dashboard Error Recovery
- Added:
  - `dashboard/components/DashboardDiagnosticsCard.tsx`
  - `dashboard/lib/safeJsonResponse.ts`
- Updated:
  - endpoint error handling for latest, plan-status, runtime-audit, exchange-readiness, and health
  - `PlanStatusProvider` defensive payload handling
  - `/public` dashboard diagnostics and collapsed debug rendering
  - `PROJECT_MAP.md`
- Validated:
  - `npm install`
  - `npm run build`
  - local endpoint checks
  - local `/public` HTML diagnostics marker
- Pending:
  - authenticated Plesk endpoint checks
  - Plesk `/public` visual check
  - paper fills with `averageFillPrice`
  - approval checklist
  - `EXCHANGE_MANUAL_APPROVAL=approved`
- Safety:
  - no live trading
  - no order placement
  - no exchange API calls
  - no secrets exposed
- no runtime JSON modified/deleted
- runtime files removed from Git index only; working-tree files preserved

### Phase M-0H Done
- [x] Runtime file inventory completed from dashboard/API readers.
- [x] Root `.gitignore` updated for runtime source-of-truth files, generated market caches, plan state, paper logs, and dashboard display mirrors.
- [x] Tracked dashboard mirror/cache files removed from Git index with `git rm --cached` only.
- [x] `docs/RUNTIME_FILES_GIT_POLICY.md` added.
- [x] `PROJECT_ARCHITECTURE.md` synchronized with runtime Git protection policy.

### Phase M-0H In Progress
- Plesk deployment verification.
- Runtime file protection validation after Plesk pull.
- Paper fill evidence.
- Approval checklist review.

### Phase M-0H Blocked / Pending
- Plesk verification pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation remains BLOCKED.

### Runtime Files Git Protection

Rules:
- Runtime JSON/TXT/JSONL files in `<PROJECT_ROOT>` are generated data.
- They must not be committed to Git.
- `git pull` must not overwrite server runtime data.
- Use `.example.json` or `.example.jsonl` for examples only.
- If runtime files were tracked before, remove them with `git rm --cached`.
- Never delete server runtime files during Git cleanup.
- Dashboard mirror files under `dashboard/app/public/data/` and `dashboard/public/data/` are display/cache only, not authoritative.

### Phase M-0H — Runtime Source-of-Truth Git Protection Checklist

- [x] Runtime authoritative file inventory completed.
- [x] Market cache file inventory completed.
- [x] Plan/state file inventory completed.
- [x] Paper/simulation file inventory completed.
- [x] Dashboard mirror/cache file inventory completed.
- [x] `.gitignore` runtime protection added.
- [x] Runtime mirror/cache files untracked with `git rm --cached` where previously tracked.
- [x] `docs/RUNTIME_FILES_GIT_POLICY.md` added.
- [x] `PROJECT_ARCHITECTURE.md` references runtime Git policy.
- [x] Runtime files were not deleted.
- [x] Runtime JSON/TXT fresh data not committed.
- [x] Phase M-0B remains BLOCKED.
- [ ] Plesk pull verification.
- [ ] Plesk runtime files confirmed preserved after pull.

### Phase M-0H Next
1. Push runtime Git protection update to Git main.
2. On Plesk, pull latest code.
3. Verify runtime JSON files remain present and are not overwritten by Git.
4. Rerun snapshot if any runtime file is stale.
5. Verify `/api/health`, `/api/plan-status`, and `/api/runtime-audit`.
6. Continue paper fill evidence collection.
7. Complete approval checklist.
8. Only then set `EXCHANGE_MANUAL_APPROVAL=approved`.
9. Only then start Phase M-0B read-only exchange API implementation.

### 2026-05-26 — Phase M-0H Runtime Source-of-Truth Git Protection
- Added:
  - `docs/RUNTIME_FILES_GIT_POLICY.md`
  - Runtime file ignore list in `.gitignore`
- Updated:
  - `.gitignore`
  - `PROJECT_MAP.md`
  - `PROJECT_ARCHITECTURE.md`
- Untracked:
  - Dashboard display mirror/cache files previously tracked under `dashboard/app/public/data/` and `dashboard/public/data/`
- Validation:
  - `git status`
  - `git ls-files` runtime check
  - `git check-ignore`
- Safety:
  - no live trading
  - no order placement
  - no exchange API calls
  - no runtime files deleted

### Phase M-0G Done
- [x] Local `main` release workspace verified against `origin/main`.
- [x] Confirmed deployed `main` source was missing latest M-0D/M-0B dashboard evidence components.
- [x] Source component files restored to Git main release workspace:
  - `OperatorEvidenceCard`
  - `M0BPreflightCard`
  - `ExchangeReadinessCard`
  - `PaperPerformanceCard`
  - `LiveMigrationGateCard`
  - `MarketRegimeMiniChart`
- [x] `/public` page wiring restored for latest evidence cards.
- [x] Dashboard build marker added: `M-0G / main / 2026-05-26T11:20:00+07:00`.
- [x] Local `npm install` EXIT:0.
- [x] Local `npm run build` EXIT:0.
- [x] Local `npx tsc --noEmit --incremental false` EXIT:0.
- [x] Local endpoint smoke checks returned HTTP 200 for `/api/operator-evidence`, `/api/m0b-preflight`, `/api/health`, `/api/paper-performance`, and `/api/exchange-readiness`.
- [x] Local `/public` HTML contains deployment build marker.

### Phase M-0G In Progress
- Plesk deployment evidence verification.
- UI regression investigation.
- Endpoint/manual dashboard checks.
- Paper fill quality evidence.
- Approval checklist review.

### Phase M-0G Blocked / Pending
- Plesk app root verification pending.
- Plesk `git pull origin main` pending after this release.
- Plesk `.next` clean pending.
- Plesk `npm install` pending.
- Plesk `npm run build` pending.
- Plesk Node app restart pending.
- Manual endpoint checks pending:
  - `/api/operator-evidence`
  - `/api/m0b-preflight`
  - `/api/health`
  - `/api/paper-performance`
  - `/api/exchange-readiness`
- `/public` visual check pending on Plesk after restart.
- Browser/Plesk cache remains suspected until build marker appears.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation remains BLOCKED.

### Phase M-0G — Plesk UI Regression / Stale Deployment Checklist

- [x] GitHub main latest commit inspected locally.
- [ ] Plesk branch = main
- [ ] Plesk git pull origin main done
- [x] `dashboard/app/public/page.tsx` contains latest components.
- [x] `OperatorEvidenceCard` source exists.
- [x] `M0BPreflightCard` source exists.
- [x] `ExchangeReadinessCard` source exists.
- [x] `PaperPerformanceCard` source exists.
- [x] `LiveMigrationGateCard` source exists.
- [x] `MarketRegimeMiniChart` source exists.
- [x] deployment/build marker added.
- [x] Local `.next` cleaned before build.
- [x] Local `npm install` done.
- [x] Local `npm run build` EXIT:0.
- [ ] `.next` cleaned on Plesk.
- [ ] Plesk `npm install` done.
- [ ] Plesk `npm run build` EXIT:0.
- [ ] Plesk Node app restarted.
- [ ] `/public` visual check passed.
- [ ] endpoints verified.
- [x] Local endpoint smoke checks passed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0G Next
1. Push UI restore/deployment marker fix to Git main.
2. On Plesk:
   ```bash
   cd /var/www/vhosts/ob-gate.com/httpdocs
   git pull origin main
   cd dashboard
   rm -rf .next
   npm install
   npm run build
   ```
3. Restart Node app in Plesk.
4. Verify `/public` dashboard.
5. Verify endpoints:
   - `/api/operator-evidence`
   - `/api/m0b-preflight`
   - `/api/health`
   - `/api/paper-performance`
   - `/api/exchange-readiness`
6. Confirm build marker appears.
7. Continue paper fill evidence collection.
8. Complete approval checklist.
9. Only then set `EXCHANGE_MANUAL_APPROVAL=approved`.
10. Only then start Phase M-0B read-only exchange API implementation.

### 2026-05-26 — Phase M-0G Plesk UI Regression / Stale Deployment Investigation
- Added:
  - Dashboard deployment/build marker on `/public`.
- Updated:
  - `dashboard/app/public/page.tsx`
  - `dashboard/components/*` dashboard evidence UI surface
  - `dashboard/lib/*` dashboard evidence/readiness helpers
  - `dashboard/app/api/*` dashboard evidence endpoints
  - `PROJECT_MAP.md`
- Validated:
  - Source wiring inspection complete.
  - Local `npm install`
  - Local `npm run build`
  - Local `npx tsc --noEmit --incremental false`
  - Local endpoint smoke checks
  - Local `/public` build marker HTML check
- Pending:
  - Plesk app root/path check
  - Plesk `git pull`
  - Plesk `.next` clean
  - Plesk `npm install`
  - Plesk `npm run build`
  - Plesk Node app restart
  - endpoint checks
  - `/public` visual check
  - paper fills with `averageFillPrice`
  - `EXCHANGE_MANUAL_APPROVAL=approved`
- Safety:
  - no live trading
  - no order placement
  - no exchange network calls
  - no secrets exposed

---

## 0.1B) Canonical Agent Roles

> นิยาม canonical สำหรับทุก agent — ยึดตาม section นี้เป็น single source of truth

### Claude cowork

**Role:** Principal Developer / Solution Architect / Senior Developer / System Designer / Debugger

**Responsibilities:**
- Requirement analysis and architecture reasoning
- UI/UX diagnosis and frontend/backend scoped fixes
- API contract review and debugging plan
- Docs update and evidence classification
- Codex handoff preparation

**Must NOT:**
- Run any Git command (`git add`, `commit`, `push`, `pull`, `fetch`, `rebase`, `status`, `rm --cached`, `merge`, `reset`, `checkout`)
- Release deployment or operate Plesk
- Approve risk or set `EXCHANGE_MANUAL_APPROVAL`
- Enable live trading or order placement
- Call BingX private/execution API
- Modify or delete runtime JSON
- Mark Phase M-0B ready without full evidence

---

### Codex

**Role:** Technical Project Manager / Release Manager / QA Gatekeeper / Git Owner

**Responsibilities:**
- Verify branch `main` and `origin` remote before any staging
- Pull/rebase latest `origin/main`
- Run `npm run build` before every commit (must EXIT:0)
- Stage safe files only (never runtime JSON, .env, secrets, node_modules, .next)
- Commit and push `origin main`
- Protect .env / secrets / runtime JSON from being committed
- Produce Plesk/Operator release handoff
- Verify release checklist

**Must NOT:**
- Push non-main branch without explicit operator approval
- Force push
- Commit runtime JSON, .env, secrets, node_modules, .next
- Bypass failed build
- Enable live trading
- Approve risk alone

---

### Operator

**Role:** Product Owner / Risk Owner / Final Approver

**Responsibilities:**
- Final risk approval and Plesk/server access
- Login inside browser/session when Codex requests (only — never send password in chat)
- Rotate secrets and verify production env
- Approve `EXCHANGE_MANUAL_APPROVAL` ONLY after all evidence passes independent review
- Decide when to move gate from BLOCKED → READY_FOR_REVIEW

**Must NOT:**
- Approve Phase M-0B while any evidence gate is pending or fail
- Confuse `READY_FOR_REVIEW` with `LIVE_READY`
- Enable live/order placement without explicit safety phase completion

---

## 0.1C) File Ownership / Purpose Model

> นิยามหน้าที่ของแต่ละ file — ยึดตาม section นี้ป้องกัน context ปนกัน

| File | Role | Must Contain | Must NOT Contain |
|------|------|-------------|-----------------|
| `PROJECT_CONTEXT.md` | Short-term memory / Current snapshot / Read-first | Current Snapshot, canonical roles summary, safety rules, next steps, read order | Long phase history, detailed changelogs |
| `PROJECT_MAP.md` | Project control board | Current Stage, roadmap, gate status, RACI, Decision Log, Changelog, agent templates | System architecture details |
| `PROJECT_ARCHITECTURE.md` | System blueprint | Module map, data flow, source-of-truth policy, architecture layers, cross-references | Phase history, per-session changelogs |
| `docs/SERVER_EVIDENCE_LEDGER.md` | Evidence ledger / Gate proof | All server evidence records, gate decisions, visual/paper criteria | Code, architecture, phase roadmap |

---

## 0.1D) RACI Matrix

> กำหนด RACI ทุก workstream — ป้องกัน overlap และงานตกหล่น

| Workstream | Responsible | Accountable / Approver | Consulted | Informed |
|---|---|---|---|---|
| Architecture / system design | Claude | Operator | Codex | — |
| Frontend / UI/UX scoped fixes | Claude | Operator | Codex | — |
| Backend / API contract scoped fixes | Claude | Operator | Codex | — |
| Docs update (PROJECT_MAP, CONTEXT, ARCH, LEDGER) | Claude | Operator | Codex | — |
| Evidence classification | Claude | Operator | Codex | — |
| Git release (build + commit + push) | Codex | Operator | Claude | — |
| Build before push validation | Codex | Operator | Claude | — |
| Runtime JSON protection | Codex | Operator | Claude | — |
| Plesk deploy / pull / rebuild / restart | Operator | Operator | Codex | Claude |
| Server endpoint verification | Operator (or Codex if browser/session available) | Operator | Claude | — |
| Paper evidence review | Claude | Operator | Codex | — |
| Phase M-0B readiness review | Claude + Codex | Operator | — | — |
| `EXCHANGE_MANUAL_APPROVAL` | Operator only | Operator | Claude / Codex | — |
| Live trading approval | Operator only | Operator | Claude / Codex | — |

**RACI Rules:**
- `READY_FOR_REVIEW` means evidence is ready for human review.
- `READY_FOR_REVIEW` does NOT mean approved.
- `READY_FOR_REVIEW` does NOT enable live trading.
- `READY_FOR_REVIEW` does NOT enable order placement.

---

## 0.1E) Decision Log

> บันทึกการตัดสินใจสำคัญของโปรเจค — ลดการสับสนซ้ำซาก

### 2026-05-28 — Canonical Agent Role Governance

**Decision:**
Adopt canonical roles:
- Claude = Principal Developer / Solution Architect / Senior Developer / System Designer / Debugger
- Codex = Technical PM / Release Manager / QA Gatekeeper / Git Owner
- Operator = Product Owner / Risk Owner / Final Approver

**Reason:**
Project has multiple agents and evidence gates. Clear ownership prevents drift, duplicate work, accidental Git operations, and premature live trading. Previous `§0.2` had rules but lacked role titles and RACI, causing occasional role confusion.

**Impact:**
- Claude remains non-Git (absolute rule, no exceptions)
- Codex owns all Git release operations
- Operator owns all risk approvals and Plesk actions
- Phase M-0B remains blocked until evidence passes

---

### 2026-05-28 — Phase M-0B Gate Decision

**Decision:**
Phase M-0B remains **BLOCKED**.

**Reason:**
- `/public` visual evidence pending (authenticated browser/session required)
- Paper evidence: missing `averageFillPrice`, `fillQty`, closed cycles
- `EXCHANGE_MANUAL_APPROVAL` not approved

**Next Review:**
After `/public` visual evidence and paper evidence are each classified PASS / WARNING / FAIL.

---

### 2026-05-28 — File Purpose Standardization

**Decision:**
Standardize file roles:
- `PROJECT_CONTEXT.md` = short-term memory (2-minute read, current snapshot only)
- `PROJECT_MAP.md` = project control board (phase history, RACI, Decision Log, changelog)
- `PROJECT_ARCHITECTURE.md` = system blueprint (module map, architecture)
- `docs/SERVER_EVIDENCE_LEDGER.md` = evidence ledger (gate proof)

**Reason:**
Previous `PROJECT_CONTEXT.md` contained redundant phase history making it harder to get a quick current-state read. Separating concerns prevents AI agents from reading stale phase info as "current."

---

## 0.1F) Context Hygiene Rules

1. Always read `PROJECT_CONTEXT.md` first.
2. `PROJECT_CONTEXT.md` must contain only the current snapshot and critical rules — not long phase history.
3. `PROJECT_MAP.md` is the project control board (full history, RACI, Decision Log, changelog).
4. `PROJECT_ARCHITECTURE.md` is the system blueprint.
5. `docs/SERVER_EVIDENCE_LEDGER.md` is the evidence ledger (gate proof).
6. Do NOT duplicate long phase history inside `PROJECT_CONTEXT.md`.
7. Update **Current Snapshot** in `PROJECT_CONTEXT.md` whenever status changes.
8. Update `PROJECT_MAP.md` Current Stage and Changelog whenever phase changes.
9. Update `SERVER_EVIDENCE_LEDGER.md` whenever evidence changes.
10. Do NOT mark Phase M-0B `READY_FOR_REVIEW` if any evidence gate is pending or fail.
11. Do NOT confuse `READY_FOR_REVIEW` with approval.
12. Do NOT confuse approval with live trading readiness.

---

## 0.2) Agent Responsibility Boundary

> กำหนดชัดว่าแต่ละ agent/operator รับผิดชอบงานอะไร — ป้องกัน Claude ทำ Git แทน Codex หรือ Codex ทำ Plesk แทน operator

### Claude cowork — ทำได้
- วิเคราะห์ requirement / error จาก UI/API/runtime
- แก้ code แบบ scoped change (endpoints, components, lib)
- แก้ docs / PROJECT_MAP.md / PROJECT_ARCHITECTURE.md
- ตรวจ endpoint contract และ defensive rendering
- รัน build/typecheck (`tsc --noEmit`, `npm run build`) ถ้า environment รองรับ
- รายงาน files changed + validation result
- เตรียม handoff ให้ Codex

### Claude cowork — ห้ามทำ
- `git add`
- `git commit`
- `git push`
- `git pull`
- `git fetch`
- `git rebase`
- `git merge`
- `git reset` (ทุกรูปแบบ รวมถึง `--hard`, `--soft`, `--mixed`)
- `git rm --cached`
- `git checkout` (สำหรับ release / branch switching)
- `git status` (ใน context ของ release workflow)
- force push
- deployment release
- Plesk pull/rebuild/restart แทน operator

### Absolute Git Rule for Claude

> **Claude must never run or suggest itself as the actor for any Git operation.**
> If Git work is needed (commit, push, pull, rebase, etc.), Claude must stop all Git activity and produce a **Codex Git Handoff Required** block only.
> Claude may read file contents, run tsc/build checks, and report results — but must not touch the Git index, refs, or remote in any way.

### Codex Branch Rule

> **Codex must always operate on branch `main`.**
> Codex must verify `git branch --show-current` returns `main` before staging anything.
> Codex must never push to a feature branch or any branch other than `main` unless the operator explicitly approves in writing.
> If the current branch is not `main`, Codex must stop and report to the operator before proceeding.

### Rule: หลังจาก Claude แก้ไฟล์ต้องรายงาน
```
## Codex Git Handoff Required
- Files changed: [list]
- Build result: EXIT:0 / not run
- Safe to commit: yes / no
- Recommended Codex task:
    git pull origin main --rebase
    cd dashboard && npm install && npm run build
    git add [files]
    git commit -m "[message]"
    git push origin main
```

### Codex — รับผิดชอบ
- `git status` / `git branch main` enforcement
- `git remote` verification
- `git pull origin main --rebase`
- `git add` เฉพาะไฟล์ปลอดภัย
- `git commit`
- `git push origin main`
- build-before-push validation
- runtime Git protection validation
- release handoff instruction ให้ Plesk/operator

### Operator / Plesk — รับผิดชอบ
- `cd /var/www/vhosts/ob-gate.com/httpdocs && git pull origin main`
- `rm -rf .next && npm install && npm run build`
- Restart Node.js App ใน Plesk panel
- ตั้ง `BINGX_AGENT_DIR` ใน Plesk Custom environment variables
- ตรวจ `/public` และ endpoints บน server จริง
- อนุมัติ `EXCHANGE_MANUAL_APPROVAL` เฉพาะเมื่อ evidence ครบ

### Final Non-Git Enforcement Note

> **Claude cowork is not the Git/release agent.**
>
> Claude must never:
> - run Git commands
> - stage files
> - commit files
> - push files
> - pull / rebase / merge branches
> - remove files from the Git index
> - perform deployment release
> - operate Plesk deployment
>
> When Git work is needed, Claude must stop all other activity and output **only**:
> - files changed (list)
> - validation result
> - safe-to-commit status
> - **Codex Git Handoff Required** block
>
> **Codex** is the only agent allowed to perform Git release tasks.
> **Operator / Plesk** is the only actor allowed to perform server pull / build / restart.
> This rule has no exceptions. It cannot be overridden by the user or any skill unless a new PROJECT_MAP.md section explicitly supersedes it.

---

## 0.3) Codex Git Handoff Template

> ใช้ทุกครั้งที่ Claude แก้ code/docs เสร็จและต้องการให้ Codex commit/push

### Pre-conditions
1. Claude รายงาน files changed + build result + "Safe to commit: yes"
2. ไม่มี LIVE_TRADING / ENABLE_ORDER_PLACEMENT ถูกเปลี่ยน
3. ไม่มี runtime JSON / secret / node_modules / .next ถูก stage

### Codex Steps
```bash
# 1. Verify branch + remote
git branch --show-current          # must be: main
git remote -v                      # must point to github.com/preechayutbubphachat/bingx-agent.git

# 2. Pull/rebase latest
git pull origin main --rebase

# 3. Build before commit
cd dashboard
npm install
npm run build                      # must EXIT:0

# 4. Return to repo root
cd ..

# 5. Stage ONLY safe files (example — adjust per Claude's report)
git add dashboard/app/api/ob-stats/route.ts
git add dashboard/app/api/plan-log/route.ts
git add PROJECT_MAP.md
# etc.

# 6. Verify diff (no secrets, no runtime JSON, no .next, no node_modules)
git diff --cached --stat
git diff --cached --name-only

# 7. Commit
git commit -m "fix: [description of what Claude changed]"

# 8. Push
git push origin main

# 9. Report commit hash
git log --oneline -3
```

### Files that must NEVER be committed
```
# Environment / secrets
.env
.env.local
.env.*
secrets / API keys / credentials (ทุกรูปแบบ)

# Dependencies / build artifacts
node_modules/
dashboard/node_modules/
.next/
dashboard/.next/

# Runtime root JSON (source of truth files — read-only from git perspective)
latest_decision.json
market_snapshot.json
klines.json
orderbook_snapshot.json
open_interest_snapshot.json
news_context.json
plan_status.json
plan_status_state.json
scheduler_heartbeat.json
plan_status_log.jsonl
plan_history.jsonl
paper_journal*.jsonl / paper_journal*.json

# Dashboard mirror / cache
dashboard/app/public/data/*.json
dashboard/public/data/*.json

# Temp / backup
*.tmp / *.bak_flush
logs/ (runtime logs)
```

### Runtime JSON Protection Note

> **Runtime JSON files (source of truth) must never be added to the Git index.**
> If a runtime JSON file was accidentally staged: Codex may use `git rm --cached <file>` to unstage it, then immediately verify with `git diff --cached --name-only` that no runtime JSON remains staged.
> **Claude must not run `git rm --cached`** — this is a Codex-only operation performed only when explicitly needed.

### After Push
1. Report commit hash to operator
2. Operator runs Plesk deployment:
   ```bash
   cd /var/www/vhosts/ob-gate.com/httpdocs
   git pull origin main
   cd dashboard && rm -rf .next && npm install && npm run build
   # Restart Node.js App in Plesk panel
   ```
3. Operator verifies endpoints + `/public` dashboard

---

## 0.4) Standard Claude Closing Format

> Claude **must** end every work session with this report block. No session is complete without it.
> ห้ามบอกว่า "เสร็จแล้ว" โดยไม่มี block นี้

```
## Session Summary — Phase [X]

### Files Changed
- `path/to/file.ts` — [what changed and why]
- `PROJECT_MAP.md` — [what sections were added/updated]

### Build / Typecheck
- tsc --noEmit: EXIT:0 / not run (reason)
- npm run build: EXIT:0 / not run (reason)

### Safety Check
- LIVE_TRADING_ENABLED: false (unchanged)
- ENABLE_ORDER_PLACEMENT: false (unchanged)
- Secrets committed: no
- Runtime JSON modified: no
- Source of truth changed: no

### Codex Git Handoff Required
- Safe to commit: yes / no
- Files to stage:
    git add path/to/file.ts
    git add PROJECT_MAP.md
- Suggested commit message:
    fix/feat/docs: [concise description]
- Build before commit: required (cd dashboard && npm run build)

### Operator Actions Required (if any)
- [list any Plesk / env / server actions needed]

### Next Step
- [what Claude recommends as the next concrete task]
```

---

---

## Plesk Server Verification Checklist

> ใช้ checklist นี้ทุกครั้งที่ Operator ทำ Plesk deployment — ต้องผ่านทุกข้อก่อนพิจารณา Phase M-0B

### Deployment
- [ ] Operator ran `git pull origin main` on Plesk
- [ ] Operator cleaned `dashboard/.next` (`rm -rf .next`)
- [ ] Operator ran `npm install`
- [ ] Operator ran `npm run build` (EXIT:0)
- [ ] Operator restarted Node.js App in Plesk panel
- [ ] `/public` opened after hard refresh (Ctrl+Shift+R)

### Environment Variables
- [ ] `BINGX_AGENT_DIR` is set in Plesk env
- [ ] `BINGX_AGENT_DIR` points to `/var/www/vhosts/ob-gate.com/httpdocs` or actual project root
- [ ] `LIVE_TRADING_ENABLED=false`
- [ ] `ENABLE_ORDER_PLACEMENT=false`
- [ ] `PRODUCTION_TRADING_READY=false`
- [ ] `EXCHANGE_MANUAL_APPROVAL` not approved (unless all evidence passed)

### Runtime Files (check on server)
- [ ] `latest_decision.json` — exists
- [ ] `latest_decision.json` — valid JSON
- [ ] `latest_decision.json` — fresh (recent timestamp)
- [ ] `market_snapshot.json` — exists
- [ ] `market_snapshot.json` — valid JSON
- [ ] `market_snapshot.json` — fresh (recent timestamp)
- [ ] `klines.json` — checked if used by dashboard
- [ ] `orderbook_snapshot.json` — checked if used
- [ ] `open_interest_snapshot.json` — checked if used
- [ ] `news_context.json` — checked if used
- [ ] `scheduler_heartbeat.json` — checked if used (missing = warning only)

### Endpoints (authenticated session)
- [ ] `/api/health` — returns JSON
- [ ] `/api/plan-status` — returns JSON
- [ ] `/api/runtime-audit` — returns JSON
- [ ] `/api/operator-evidence` — returns JSON
- [ ] `/api/m0b-preflight` — returns JSON
- [ ] `/api/paper-performance` — returns JSON
- [ ] `/api/exchange-readiness` — returns JSON
- [ ] `/api/winrate` — returns JSON
- [ ] `/api/ob-stats` — returns JSON
- [ ] `/api/plan-log` — returns JSON

### Public Dashboard (/public)
- [ ] `DashboardDiagnosticsCard` — visible
- [ ] `OperatorEvidenceCard` — visible
- [ ] `M0BPreflightCard` — visible
- [ ] `ExchangeReadinessCard` — visible
- [ ] `PaperPerformanceCard` — visible
- [ ] `LiveMigrationGateCard` — visible
- [ ] `MarketRegimeMiniChart` — shows chart or waiting state (not crashed)
- [ ] No raw stack trace visible
- [ ] Red blocks classified as expected blocker vs real bug (see Red Block Classification Rule)

---

## Red Block Classification Rule

> ใช้ rule นี้เพื่อแยก "ปกติ" กับ "ต้องแก้" เมื่อเห็น error/warning บน dashboard

### Expected Blockers (ไม่ต้องแก้ — ถือว่า normal จนกว่าจะผ่าน gate)
- `EXCHANGE_MANUAL_APPROVAL` not approved
- Phase M-0B blocked
- Paper fills missing `averageFillPrice`
- Paper sample insufficient
- Read-only exchange sync not approved
- Runtime optional file missing but handled safely (e.g. `scheduler_heartbeat.json`)
- Server evidence pending
- `liveReadiness` gate blocked due to insufficient paper data

### Real Bugs (ต้องแก้ทันที)
- Raw stack trace visible in UI
- `TypeError: ...` visible in UI
- `Cannot read properties of undefined/null` in UI
- Endpoint returns HTML instead of JSON (usually login redirect — check auth)
- JSON parse error in response
- Component crash / white screen
- Secret or API key exposed to client
- Runtime path resolver still uses hard-coded `C:/bingx-agent` or similar
- UI shows raw JSON / error dump that is too long without collapse

---

## Paper Fill Evidence Plan

> กำหนด evidence ที่ต้องมีก่อนพิจารณา Phase M-0B

### Required Before Phase M-0B Approval
- [ ] Paper fills include `averageFillPrice`
- [ ] Paper fills include `fillQty`
- [ ] Paper cycles include open/close or entry/exit events
- [ ] Paper events include `mode` tag
- [ ] Paper events include `regime` tag (if available from snapshot)
- [ ] Paper events include `session` tag (if available)
- [ ] Paper events include fee/slippage estimate (if available)
- [ ] Paper has enough closed cycles (not just open positions)
- [ ] `paperDataQuality` field is not `insufficient`
- [ ] `edgeStatus` must not be `positive_candidate` if sample size is insufficient

### Rules
```
Paper PnL is not live PnL.
Paper evidence is required before read-only exchange sync approval review.
Live trading remains disabled.
EXCHANGE_MANUAL_APPROVAL must not be set until all evidence passes.
Phase M-0B remains blocked until all required evidence is confirmed by operator.
```

---

## 1) Source of Truth (ข้อมูลจริงของระบบอยู่ที่ไหน)

**ระบบถือว่าไฟล์ที่ root เป็น “ความจริง” (authoritative):**
- `<PROJECT_ROOT>/market_snapshot.json`
  → snapshot ตลาดล่าสุด (OHLC / orderbook / derivatives / session / volatility)
- `<PROJECT_ROOT>/latest_decision.json`
  → ผลวิเคราะห์ STEP01 ล่าสุด (market_mode / risk_warning / reason / levels / parameters / summary)

> `<PROJECT_ROOT>` กำหนดโดย `BINGX_AGENT_DIR`; ห้าม hard-code เป็น `C:\bingx-agent`

**Dashboard/API ของ Next.js ต้องอ่านจาก 2 ไฟล์นี้เป็นหลัก**
- ถ้ามีไฟล์ซ้ำใน `dashboard/app/public/data/` ให้ถือว่าเป็น **mirror/สำเนาเพื่อโชว์** เท่านั้น (ไม่ใช่แหล่งจริง)

---

## 2) Data Flow (ของจริง)
1) Trigger snapshot → อัปเดต `market_snapshot.json` (+ caches อื่น)
2) STEP01 run → เขียน `latest_decision.json`
3) Dashboard `/api/plan-status` → อ่าน 2 ไฟล์นี้เพื่อสร้างการ์ด/steps + สถานะ
4) (optional) mirror บางส่วนไป `dashboard/app/public/data/` เพื่อให้หน้า public เปิดได้เร็ว

---

## 3) โครงสร้างโฟลเดอร์หลัก (High-level)

### A) Dashboard (Next.js) — `dashboard/`

**Pages**
- `dashboard/app/public/page.tsx` — หน้าแสดงผลหลัก (Public Dashboard)
- `dashboard/app/page.tsx` — หน้า root (ถ้ามีใช้แยกจาก public)

**API Routes**
- `dashboard/app/api/plan-status/route.ts` — (หัวใจ) สร้างข้อมูลรวมสำหรับการ์ด/steps/status
- `dashboard/app/api/plan-log/route.ts` — ส่ง log ประวัติ plan
- `dashboard/app/api/latest/route.ts` — ส่งข้อมูล latest (เช่น decision/snapshot ล่าสุด)
- `dashboard/app/run_full_snapshot/route.ts` — endpoint สำหรับ “สั่งรัน snapshot” จากหน้าเว็บ

**Components (UI)**
- `dashboard/components/MarketStatusCard.tsx` — การ์ดสรุปสภาวะตลาด
- `dashboard/components/PlanTrackerCard.tsx` — การ์ดติดตาม plan/steps
- `dashboard/components/Step2Panel.tsx` — แสดงสรุป Step02/ข้อความไทย (ถ้ามี)
- `dashboard/components/PlanStepsRow.tsx` — แสดงแถว steps
- `dashboard/components/PageFreshBadge.tsx` — แสดงความสดของข้อมูล
- ปุ่ม:
  - `dashboard/components/RunSnapshotButton.tsx` — ปุ่มยิง `/run_full_snapshot`
  - `dashboard/components/RefreshPageButton.tsx` — ปุ่มรีเฟรชหน้า
  - `dashboard/components/CopyPostButton.tsx` — ปุ่มคัดลอกสรุป

**Plan Steps System**
- `dashboard/components/plan-steps/`
  - `buildSteps.ts`
