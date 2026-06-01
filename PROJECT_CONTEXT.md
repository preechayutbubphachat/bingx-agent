# PROJECT_CONTEXT.md

> Short-term memory / Current snapshot / Read-first context
> อ่านไฟล์นี้ก่อนเสมอ — เปิด 2 นาทีรู้สถานะปัจจุบันทันที
> ห้ามใส่ phase history ยาวในไฟล์นี้ — ดู PROJECT_MAP.md สำหรับ full history

---

## Current Snapshot — Read This First

**Current Stage:**
Phase M-0Z-6 — Paper Execution Live + Evidence Accumulation
(เพิ่งสำเร็จ: deploy engine layer + paper fill จริงทำงานบน production, 2026-05-31)

**✅ Confirmed PASS (post-deploy, ของจริงบน server):**
- Git release: commit `34c4a8f` (engine layer) + `59472f8` (fix1/2) pushed origin main
- Plesk deploy + rebuild + restart: PASS
- Runtime source-of-truth: `/api/public-health` ยืนยัน `latest_decision.json` + `market_snapshot.json` + `schedulerHeartbeat` = exists, phase=M-0B_BLOCKED, ไม่มี secret/stack trace
- `BINGX_AGENT_DIR` = `/var/www/vhosts/ob-gate.com/httpdocs` (verified)
- Env safety flags: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, PRODUCTION_TRADING_READY=false
- EXCHANGE_MANUAL_APPROVAL = not_approved
- `npm run build` EXIT:0 (server, incl. engine layer)
- **Paper execution pipeline = LIVE**: real decision → real market → paper MARKET fill → `FILL_RESULT` (averageFillPrice จริง เช่น 74115.3) → reader เห็น · `totalOrderFilled` สะสมจาก cron ทุก 5 นาที (`paper_cycle.sh`)

**⚙️ สิ่งที่ deploy รอบนี้ (root cause สุดท้ายของ paper 0-fill):**
- `dashboard/lib/broker/`, `lib/execution/`, `app/api/internal/` เคย **untracked ใน git** → server รัน engine เก่าที่ไม่มี FILL_RESULT block → fill เกิดแต่ไม่ surface
- Fix: track engine layer + commit `34c4a8f` + deploy (ย้าย copy เก่า `.old` ออกก่อน pull) → server fill ได้
- `paper_cycle.sh` (ใหม่, root): อ่าน decision/orderbook/funding จริง → ส่ง MARKET order (`entryPrice:null`) เข้า `/api/internal/execution-runner` → fill
- `run_cycle.js` port (เลิก hardcode `C:\bingx-agent` + `localhost:3000`→`SNAPSHOT_BASE_URL`)
- `readPaperJournal.ts`: S1 (นับ FILL_RESULT) + S3 (hasAverageFillPrice) + sort mtime ก่อน slice 30

**⏳ Pending (ก่อน paper evidence ครบ + M-0B):**
- **closed cycles ยัง 0** — fill เป็น BUY หมด (ราคาต่ำกว่า grid mid) ต้องรอราคาขึ้นเหนือ mid ให้เกิด SELL → pairFills จับคู่เป็น round trip
- sample ต้องถึง ~30 closed cycles เพื่อประเมิน edge
- `/public` visual verification (16-item) — authenticated browser
- Operator independent review
- EXCHANGE_MANUAL_APPROVAL: not_approved (เปลี่ยนไม่ได้จนทุก gate PASS)

**Decision:**
Phase M-0B remains **BLOCKED**.

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

**Next Actions:**
1. ปล่อย cron `paper_cycle.sh` ทำงานสะสม fill (ทุก 5 นาที) — อย่า force-fill
2. เฝ้าดู `/api/paper-performance` → `closedCycles > 0` เมื่อราคาแกว่งข้าม grid mid
3. ถ้าผ่าน 1-2 วันแล้ว closed cycles ยัง 0 → review side logic ของ `paper_cycle.sh` (ตอนนี้ BUY ถ้าราคา<mid / SELL ถ้า>mid)
4. Operator: login → `/public` → 16-item visual checklist → report
5. รอ sample ถึง ~30 closed cycles → ประเมิน expectancy/edge
6. Do NOT enable live trading / order placement / set EXCHANGE_MANUAL_APPROVAL=approved
7. commit docs: M0Z6_PAPER_LOOP_A1_STATUS.md, M0Z6_SERVER_DEPLOY_FIXES_2026-05-30.md, อัปเดต SERVER_EVIDENCE_LEDGER

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
