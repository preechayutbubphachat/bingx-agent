# PROJECT_CONTEXT.md

> Short-term memory / Current snapshot / Read-first context
> อ่านไฟล์นี้ก่อนเสมอ — เปิด 2 นาทีรู้สถานะปัจจุบันทันที
> ห้ามใส่ phase history ยาวในไฟล์นี้ — ดู PROJECT_MAP.md สำหรับ full history

---

## Current Snapshot — Read This First

**Current Stage:**
Phase M-0Z-6 — Paper Execution Live + Evidence Accumulation
**Overlay: Dynamic Regrid Phase 2-A — Regrid Readiness + Paper Epoch Preparation** (read-only/paper-only)
(base: paper fill จริงบน production ตั้งแต่ 2026-05-31 · overlay: out-of-grid guardrail + regrid readiness monitor บน `/agent-hq`)

**✅ Confirmed PASS (ของจริงบน server / runtime):**
- Algorithm v2 guardrail PASS (block BUY เมื่อราคาหลุดต่ำกว่า grid → REGRID_REQUIRED)
- Price source hotfix PASS (ใช้ latest close จริง ไม่ใช่ first/oldest)
- PAPER_NO_TRADE logging PASS (`tmp/execution-runner/paper_no_trade.jsonl`)
- REGRID_CANDIDATE logging PASS (read-only evaluator → `tmp/execution-runner/regrid_candidate.jsonl`)
- Runtime Monitor UI PASS (`/agent-hq`)
- Regrid Readiness UI PASS (Phase 2-A section)
- **BUY accumulation stopped** (guardrail ทำงาน — ไม่ซื้อรัวขาเดียวต่อขณะ BELOW_GRID)
- activationAllowed=false · paperActivationAllowed=false · liveActivationAllowed=false
- Env safety flags: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, PRODUCTION_TRADING_READY=false
- EXCHANGE_MANUAL_APPROVAL = not_approved
- old one-sided BUY exposure = **quarantined** (ไม่ปิดด้วยการ force SELL · ไม่ใช้ประเมิน edge)

**📊 Latest observed runtime (Phase 2-A):**
- cumulative BUY ≈ 1,460 (นิ่ง — หยุดเพิ่ม) · cumulative SELL = 0
- sample buyFillCount = 14 · sample sellFillCount = 0 · closedCycles = 0
- priceVsGrid = BELOW_GRID · paperLoopState = REGRID_REQUIRED
- lastNoTradeReason = price_below_grid_lower
- candidateStatus = NO_TRADE / REGRID_REQUIRED (ตาม event ล่าสุด) · activationAllowed = false
- Phase 2-A readiness = NOT_READY / WATCH · oldExposurePolicy = quarantine

**⏳ Blocked state (ก่อน M-0B):**
- closedCycles = 0 · sellFillCount = 0 · expectancy = null
- sample ยังไม่ถึง ~30 closed cycles
- `/public` visual verification (16-item) — authenticated browser
- Operator independent review
- EXCHANGE_MANUAL_APPROVAL: not_approved (เปลี่ยนไม่ได้จนทุก gate PASS)
- **Phase M-0B remains BLOCKED**

**Decision:**
Phase M-0B remains **BLOCKED**. Dynamic Regrid Phase 2-A เป็น read-only readiness/diagnostics เท่านั้น — **ไม่เปิด grid ใหม่ ไม่ส่ง order ไม่ปลดล็อก M-0B** · activation = Phase 2-B (รอ operator approve ภายหลัง)

**Gate Summary (2026-05-31):**
- PASS: release · staging · build · deploy · BINGX_AGENT_DIR · runtime files · public-health post-deploy · paper-performance endpoint · env safety flags
- **REAL_FILLS_ACCUMULATING**: paper fill quality (มี averageFillPrice จริง — ขยับจาก DATA_GAP)
- DATA_GAP: closed cycles (0 — รอราคาแกว่ง 2 ทาง) · sample (< 30 cycles)
- PENDING_EXTERNAL: /public visual (16-item) · operator review
- NOT_APPROVED: EXCHANGE_MANUAL_APPROVAL
- BLOCKED: Phase M-0B

**⚠️ Evidence semantics (อ่านก่อนตีความ gate):**
- `REAL_FILLS_ACCUMULATING` ≠ edge PASS — `totalOrderFilled` เพิ่ม / มี `averageFillPrice` = paper fill quality ดีขึ้น **ไม่ใช่หลักฐาน edge**
- `closedCycles=0` = DATA_GAP → Phase M-0B **คง BLOCKED** (gross PnL ไม่ใช่ edge; net expectancy หลังหัก fee/slippage เท่านั้นคือ edge)
- **Visual evidence candidate (2026-05-31):** มี screenshot `/public` แต่เป็น low-res → classify **PENDING_EXTERNAL** (ไม่ผ่านอัตโนมัติ) ต้องทำ 16-item checklist บนหน้าจริง full-res แบบ authenticated
- ห้าม live / order placement / set APPROVAL=approved จนทุก gate PASS

**🎮 Parallel track:** TradingAgentHQ (read-only pixel-art command center, codename Trading Caffe HQ) = APPROVED FOR DESIGN/PLANNING — ดู `PROJECT_ARCHITECTURE.md` Layer 13 + `docs/TRADING_AGENT_HQ_*.md` · **ไม่ปลดล็อก M-0B**, ไม่แตะ trading logic

**🎯 Current Tactical Blocker — D8 Candidate Generation**
- D8.4.1 No-Review-Candidate Bottleneck Resolver is implemented and pushed; current scarcity is not an RR failure.
- Primary blocker remains `PRICE_ABOVE_LONG_TRIGGER`: price is FAR from the pullback trigger, D8.2=`WAITING_FOR_TRIGGER_PRICE`, D8.3=`NO_TOUCH_YET`, and D8.4=`TOUCH_WINDOW_INACTIVE`.
- D8.5 outcome recorder remains APPROVED DESIGN and IMPLEMENTATION HOLD because there is no candidate population to evaluate.
- Mandatory next step: D8.4.2 Historical Replay Review to quantify where D8.0-D8.4 loses candidates. A continuation branch is not approved unless replay proves pullback-only scarcity over a usable sample.
- Review-only/shadow-only: no activation, order, runtime writer, runner, broker, or execution changes.

**Next Actions:**
1. Monitor Phase 2-A บน `/agent-hq` (ดู `docs/M0Z6_DYNAMIC_REGRID_PHASE2A_MONITORING.md`)
2. **Do NOT activate Phase 2-B yet** — Phase 2-B = DESIGN ONLY (`docs/M0Z6_DYNAMIC_REGRID_PHASE2B_MANUAL_PAPER_ACTIVATION_PLAN.md`); activation ต้อง operator approve + Codex handoff แยก
3. รอ readiness gates: stable candles, cooldown, candidate quality, regime confirmation
4. คง old one-sided exposure quarantined (ไม่ force SELL ปิด · ไม่ใช้ประเมิน edge)
5. No live / order / approval changes · คง M-0B BLOCKED
6. (ภายหลัง) Operator: login → `/public` → 16-item visual checklist → report

---

## 1) Project Mission

This project is a BingX BTCUSDT Futures trading bot dashboard and automation system.

The current goal is NOT live trading yet.
The current goal is to stabilize:
- runtime source-of-truth
- dashboard diagnostics
- **paper trading evidence (fills + closed cycles + edge sample)** ← กำลังสะสม
- deployment workflow
- safety gates

---

## 2) Current Operating Mode

```
Production Trading: Disabled
Live Trading: Disabled
Order Placement: Disabled
Paper Trading: ENABLED (PAPER_TRADING_ENABLED=true — simulation only, no real orders)
Read-only Exchange Sync: Not yet approved
Phase M-0B: BLOCKED
EXCHANGE_MANUAL_APPROVAL: not_approved
Dynamic Regrid Phase 2-A: ACTIVE (read-only readiness/diagnostics — no grid open, no order)
Trend Strategy Phase T-0: DESIGN ONLY (docs/TREND_STRATEGY_PAPER_DESIGN.md — แยกจาก Grid, no execution)
Trend Strategy T-1/T-1M: ACTIVE shadow+monitor (read-only) · T-2 manual paper arm = DESIGN ONLY (no arm button, no order)
Trend Evidence T-3H-6-a: ACTIVE observability-only rejection decision log (append-only JSONL after state write; never read by decision logic)
Trend Evidence T-3H-6-c: ACTIVE shadow-only MTF OB/FVG entry refinement diagnostics (heuristic unless exact zones exist; no threshold/entry/runner change)
Trend Evidence T-3H-6-c1: ACTIVE shadow-only MTF OB/FVG snapshot logging (optional decision-log fields; no decision impact)
Trend Evidence T-3H-6-c2: ACTIVE shadow-review-only MTF OB/FVG history review + exact-zone readiness (no threshold/entry/runner change; OB/FVG execution disabled)
activationAllowed / paperActivationAllowed / liveActivationAllowed: false
```

---

## 3) Source of Truth

Runtime files are stored at:

```
<PROJECT_ROOT>/   (server: /var/www/vhosts/ob-gate.com/httpdocs)
```

Resolved by:

```
BINGX_AGENT_DIR=<PROJECT_ROOT>
```

Authoritative files:
- `latest_decision.json`
- `market_snapshot.json`

Paper execution audit (อ่านโดย readPaperJournal):
- `dashboard/tmp/execution-runner/*.jsonl` — resolved โดย `EXECUTION_AUDIT_ROOT_DIR=<PROJECT_ROOT>/dashboard`

Display/cache only (never authoritative):
- `dashboard/app/public/data/*.json`
- `dashboard/public/data/*.json`

**Rule:** Never treat public data JSON as source-of-truth.
**Rule:** Runtime/generated JSON must never be Git committed or overwritten by Git pull.
**Rule:** Engine source layer (`lib/broker`, `lib/execution`, `app/api/internal`) ต้องอยู่ใน git (เคย untracked → ทำให้ deploy เพี้ยน) — ดู changelog 2026-05-31.

---

## 4) Canonical Agent Roles

### Claude cowork

**Role:** Principal Developer / Solution Architect / Senior Developer / System Designer / Debugger

**Responsibilities:**
- Requirement analysis and architecture reasoning
- UI/UX diagnosis and frontend/backend scoped fixes
- API contract review and debugging plan
- Docs update and evidence classification
- Codex handoff preparation
- เขียน script/patch (LF) ให้ Operator นำไป deploy

**Must NOT:**
- Run any Git command (git add / commit / push / pull / fetch / rebase / status / rm --cached / merge / reset / checkout)
- Release deployment or operate Plesk
- Approve risk or set EXCHANGE_MANUAL_APPROVAL
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
- Login inside browser/session when requested (never send password in chat)
- Rotate secrets and verify production env
- Apply server-side env + file changes (deploy, paper env, cron tasks)
- Approve `EXCHANGE_MANUAL_APPROVAL` ONLY after all evidence passes independent review
- Decide when to move gate from BLOCKED → READY_FOR_REVIEW

**Must NOT:**
- Approve Phase M-0B while any evidence gate is pending or fail
- Confuse `READY_FOR_REVIEW` with `LIVE_READY`
- Enable live/order placement without explicit safety phase completion

---

## 5) Hard Safety Rules

**NEVER:**
- Enable `LIVE_TRADING_ENABLED`
- Enable `ENABLE_ORDER_PLACEMENT`
- Set `EXCHANGE_MANUAL_APPROVAL=approved` without complete evidence
- Call BingX private execution API
- Place / cancel / replace real orders
- Commit runtime JSON
- Commit secrets
- Treat paper PnL as live PnL
- Hard-code path like `C:\bingx-agent` — always use `BINGX_AGENT_DIR`

> หมายเหตุ: paper trading (PAPER_TRADING_ENABLED=true) = simulation ล้วน ใช้ PaperBrokerAdapter ไม่แตะ live/order flags และไม่เรียก BingX execution API — ปลอดภัยตามกฎข้างบน

---

## 6) Current Main Blockers (ก่อน M-0B)

- **closed cycles = 0** — รอราคาแกว่งข้าม grid mid ให้เกิดทั้ง BUY+SELL → round trip
- **sample < 30 closed cycles** — ยังประเมิน edge ไม่ได้
- `/public` visual verification (16-item) — authenticated browser
- Operator independent review
- `EXCHANGE_MANUAL_APPROVAL` not approved
- Phase M-0B implementation blocked

---

## 7) Required Read Order for AI Agents

1. `PROJECT_CONTEXT.md` ← You are here (read first, 2-minute context)
2. `PROJECT_MAP.md` (project control board — phase history, roadmap, gate status, RACI, changelog)
3. `PROJECT_ARCHITECTURE.md` (system blueprint — module map, data flow, paper execution pipeline)
4. `docs/SERVER_EVIDENCE_LEDGER.md` (evidence ledger — server/gate proof)
5. `docs/M0Z6_PAPER_LOOP_A1_STATUS.md` (paper execution loop — build status + fill mechanism)
6. `docs/M0Z6_SERVER_DEPLOY_FIXES_2026-05-30.md` (server deploy fixes log)
7. `docs/RUNTIME_FILES_GIT_POLICY.md` (runtime file Git protection policy)

---

## 8) Current Next Step — Paper Evidence Accumulation

Scope: ปล่อย paper execution loop สะสม fills + closed cycles แล้วประเมิน edge ก่อนพิจารณา M-0B

**ระบบที่ทำงานอัตโนมัติแล้ว:**
- Plesk cron `cron_scheduler_chain.sh` (ทุกนาที): snapshot (api.ob-gate.com) + run_cycle (ob-gate.com `/api/internal/run-cycle` → `run_cycle.js` → decision)
- Plesk cron `paper_cycle.sh` (ทุก 5 นาที): อ่าน decision+market จริง → MARKET paper order → fill → audit

**สิ่งที่ต้องทำต่อ:**
1. เฝ้าดู `/api/paper-performance`: `totalOrderFilled` เพิ่ม, `closedCycles` เริ่มขึ้นเมื่อราคาแกว่ง 2 ทาง
2. ถ้า closed cycles ไม่เกิดสักที (ราคา trend ทางเดียว) → review side logic ของ `paper_cycle.sh`
3. Operator: `/public` 16-item visual checklist
4. รอ sample ~30 closed cycles → ประเมิน expectancy/edge/cost (ใช้ skill expectancy-risk-of-ruin, trade-journal-attribution)
5. คง Phase M-0B BLOCKED จนทุก gate PASS + operator review
6. ห้ามเปิด live/order/approval

---

## 9) Context Hygiene Rules

1. Always read `PROJECT_CONTEXT.md` first.
2. `PROJECT_CONTEXT.md` must contain only the current snapshot and critical rules — not long phase history.
3. `PROJECT_MAP.md` is the project control board (full phase history, RACI, changelog, gate status).
4. `PROJECT_ARCHITECTURE.md` is the system blueprint (module map, data flow, paper execution pipeline).
5. `docs/SERVER_EVIDENCE_LEDGER.md` is the evidence ledger (server/gate proof).
6. Do NOT duplicate long phase history inside `PROJECT_CONTEXT.md`.
7. Update **Current Snapshot** section whenever status changes.
8. Update `PROJECT_MAP.md` Current Stage and Changelog whenever phase changes.
9. Update `SERVER_EVIDENCE_LEDGER.md` whenever evidence changes.
10. Do NOT mark Phase M-0B `READY_FOR_REVIEW` if any evidence gate is pending or fail.
11. `READY_FOR_REVIEW` ≠ approved. Approved ≠ live trading.
12. Engine source layer must stay tracked in git (lib/broker, lib/execution, app/api/internal) — never let it drift untracked again.
