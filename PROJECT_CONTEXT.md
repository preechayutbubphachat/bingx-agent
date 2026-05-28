# PROJECT_CONTEXT.md

> Short-term memory / Current snapshot / Read-first context
> อ่านไฟล์นี้ก่อนเสมอ — เปิด 2 นาทีรู้สถานะปัจจุบันทันที
> ห้ามใส่ phase history ยาวในไฟล์นี้ — ดู PROJECT_MAP.md สำหรับ full history

---

## Current Snapshot — Read This First

**Current Stage:**
Phase M-0Z-4 — Build Release Verification + Post-Deploy Evidence Intake + Paper Fill Liveness Audit
(Previous: Phase M-0Z-3 — Evidence Gate Closeout Orchestration)

**Confirmed:**
- `/api/public-health`: PASS (HTTP 200 JSON, safe blocked-phase fields, no secret, no stack trace)
- Protected endpoints: SAFE_JSON_WITH_EXPECTED_BLOCKERS (Operator `api.txt` 2026-05-28)
- Runtime core files: previously verified (existence, PATH_OK)
- Env safety flags: LIVE_TRADING_ENABLED=false, ENABLE_ORDER_PLACEMENT=false, PRODUCTION_TRADING_READY=false
- EXCHANGE_MANUAL_APPROVAL: not_approved
- Live trading: DISABLED
- Order placement: DISABLED
- Fix 1 (`readPaperJournal.ts`): IMPLEMENTED + syntax PASS (M-0Z-2)
- Fix 2 (`paperPerformance.ts`): IMPLEMENTED + syntax PASS (M-0Z-2)
- Phase M-0Z-4 roadmap: DESIGNED (Evidence Gate Matrix + 7-Checkpoint plan + Paper Liveness Audit + Codex Handoff + Operator Checklist + M-0B Pre-Plan)

**Pending:**
- `npm run build` (EXIT:0) — PASS on actual machine (Checkpoint 1)
- Codex: commit Fix 1+2 + M-0Z-4 docs → push origin main (Checkpoint 2)
- Operator: Plesk pull + rebuild + restart (Checkpoint 3)
- Operator: verify `/api/public-health` post-deploy (Checkpoint 4)
- Operator/Codex: `/public` visual (authenticated) → 11-point checklist (Checkpoint 5)
- System: paper fills accumulate naturally — check `/api/paper-performance` (Checkpoint 6)
- EXCHANGE_MANUAL_APPROVAL: not_approved (cannot change until all gates PASS)

**Decision:**
Phase M-0B remains **BLOCKED**.

**Gate Summary (2026-05-28):**
- PASS: `/api/public-health`, protected endpoints, env safety flags, Fix 1+2 instrumentation
- PENDING: safe Git release, Plesk deploy, `/public` visual verification
- PASS: `npm run build` on actual machine
- BLOCKED: paper fill evidence (0 fills — data gap), Phase M-0B
- NOT_APPROVED: EXCHANGE_MANUAL_APPROVAL

**Next Actions:**
1. **Codex:** `npm run build` from `dashboard/` → PASS EXIT:0
2. **Codex:** Stage safe files → commit → push origin main (after build PASS)
3. **Operator:** Plesk `git pull origin main` + rebuild + restart Node.js App
4. **Operator:** Verify `/api/public-health` → HTTP 200 JSON (no secret, no trace)
5. **Operator/Codex:** Open `/public` (authenticated) → run 11-point visual checklist → record in LEDGER
6. **System:** Let paper trading accumulate fills naturally (no force-fill)
7. **Operator:** Report `/api/paper-performance` output after deploy (totalOrderFilled, recentEvents)
8. Do NOT enable live trading
9. Do NOT enable order placement
10. Do NOT set `EXCHANGE_MANUAL_APPROVAL=approved`

---

## 1) Project Mission

This project is a BingX BTCUSDT Futures trading bot dashboard and automation system.

The current goal is NOT live trading yet.
The current goal is to stabilize:
- runtime source-of-truth
- dashboard diagnostics
- paper trading evidence
- deployment workflow
- safety gates

---

## 2) Current Operating Mode

```
Production Trading: Disabled
Live Trading: Disabled
Order Placement: Disabled
Read-only Exchange Sync: Not yet approved
Phase M-0B: BLOCKED
EXCHANGE_MANUAL_APPROVAL: not_approved
```

---

## 3) Source of Truth

Runtime files are stored at:

```
<PROJECT_ROOT>/
```

Resolved by:

```
BINGX_AGENT_DIR=<PROJECT_ROOT>
```

Authoritative files:
- `latest_decision.json`
- `market_snapshot.json`

Display/cache only (never authoritative):
- `dashboard/app/public/data/*.json`
- `dashboard/public/data/*.json`

**Rule:** Never treat public data JSON as source-of-truth.
**Rule:** Runtime/generated JSON must never be Git committed or overwritten by Git pull.

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

---

## 6) Current Main Blockers

- `/public` visual verification pending (authenticated browser/session required)
- Paper fills missing `averageFillPrice`, `fillQty`, closed cycles
- `EXCHANGE_MANUAL_APPROVAL` not approved
- Phase M-0B implementation blocked

---

## 7) Required Read Order for AI Agents

1. `PROJECT_CONTEXT.md` ← You are here (read first, 2-minute context)
2. `PROJECT_MAP.md` (project control board — phase history, roadmap, gate status, RACI, changelog)
3. `PROJECT_ARCHITECTURE.md` (system blueprint — module map, data flow, architecture)
4. `docs/SERVER_EVIDENCE_LEDGER.md` (evidence ledger — server/gate proof)
5. `docs/RUNTIME_FILES_GIT_POLICY.md` (runtime file Git protection policy)
6. `docs/M0B_OPERATOR_EVIDENCE_PACK.md` (operator approval checklist)

---

## 8) Current Next Step — Phase M-0Z-4

Scope: Build release verification + Post-deploy evidence intake + Paper fill liveness audit

Fix 1+2 DONE (M-0Z-2) — fix ORDER_FILLED parse + FILL_RESULT in extractFills.
M-0Z-4 roadmap DESIGNED — 7-checkpoint plan ready.

**Codex next actions (Checkpoint 1+2):**
1. `cd dashboard && npm run build` — PASS EXIT:0 on actual machine
2. Stage safe files: `readPaperJournal.ts`, `paperPerformance.ts`, `PROJECT_CONTEXT.md`, `PROJECT_MAP.md`, `PROJECT_ARCHITECTURE.md`, `docs/SERVER_EVIDENCE_LEDGER.md`
3. `git commit -m "feat(paper): M-0Z-2/3 ORDER_FILLED parse + FILL_RESULT extractFills; M-0Z-4 doc updates"`
4. `git push origin main`

**Operator next actions (Checkpoint 3-7):**
1. Plesk: `git pull origin main` + rebuild + restart Node.js App
2. Verify: `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000`
3. Login to browser/session → open `/public` → run 11-point visual checklist → record result
4. Report `/api/paper-performance` output (totalOrderFilled, recentEvents)
5. Do NOT force-fill paper data — let accumulate naturally

Keep Phase M-0B BLOCKED until all 7 checkpoints PASS.
Do NOT set EXCHANGE_MANUAL_APPROVAL=approved while any gate is PENDING or FAIL.

---

## 9) Context Hygiene Rules

1. Always read `PROJECT_CONTEXT.md` first.
2. `PROJECT_CONTEXT.md` must contain only the current snapshot and critical rules — not long phase history.
3. `PROJECT_MAP.md` is the project control board (full phase history, RACI, changelog, gate status).
4. `PROJECT_ARCHITECTURE.md` is the system blueprint (module map, data flow, architecture).
5. `docs/SERVER_EVIDENCE_LEDGER.md` is the evidence ledger (server/gate proof).
6. Do NOT duplicate long phase history inside `PROJECT_CONTEXT.md`.
7. Update **Current Snapshot** section whenever status changes.
8. Update `PROJECT_MAP.md` Current Stage and Changelog whenever phase changes.
9. Update `SERVER_EVIDENCE_LEDGER.md` whenever evidence changes.
10. Do NOT mark Phase M-0B `READY_FOR_REVIEW` if any evidence gate is pending or fail.
11. Do NOT confuse `READY_FOR_REVIEW` with approval or live trading readiness.
12. `READY_FOR_REVIEW` ≠ approved. Approved ≠ live trading.
