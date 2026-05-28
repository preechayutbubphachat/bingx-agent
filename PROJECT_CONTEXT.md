# PROJECT_CONTEXT.md

## 1) Project Mission

This project is a BingX BTCUSDT Futures trading bot dashboard and automation system.

The current goal is NOT live trading yet.
The current goal is to stabilize:
- runtime source-of-truth
- dashboard diagnostics
- paper trading evidence
- deployment workflow
- safety gates

## 2) Current Operating Mode

Production Trading: Disabled
Live Trading: Disabled
Order Placement: Disabled
Read-only Exchange Sync: Not yet approved
Phase M-0B: BLOCKED

## 3) Source of Truth

Runtime files are stored at:

<PROJECT_ROOT>/

Resolved by:

BINGX_AGENT_DIR=<PROJECT_ROOT>

Authoritative files:
- latest_decision.json
- market_snapshot.json

Display/cache only:
- dashboard/app/public/data/*.json
- dashboard/public/data/*.json

Never treat public data JSON as source-of-truth.

## 4) Agent Responsibilities

Claude cowork:
- analysis
- scoped code/docs edit
- validation
- handoff only
- no Git

Codex:
- Git release owner
- build (must pass before commit)
- git add (safe files only)
- commit
- push origin main
- release handoff to operator

Operator/Plesk:
- git pull origin main
- npm install
- npm run build
- restart Node.js app
- verify server endpoints

## 5) Hard Safety Rules

Never:
- enable LIVE_TRADING_ENABLED
- enable ENABLE_ORDER_PLACEMENT
- set EXCHANGE_MANUAL_APPROVAL=approved
- call BingX private execution API
- place/cancel/replace real orders
- commit runtime JSON
- commit secrets
- treat paper PnL as live PnL

## 6) Current Main Blockers

- Codex Git release pending
- Plesk pull/rebuild/restart pending
- BINGX_AGENT_DIR verification pending
- server endpoint checks pending
- paper fills with averageFillPrice pending
- EXCHANGE_MANUAL_APPROVAL not approved

## 7) Required Read Order for AI Agents

1. PROJECT_CONTEXT.md
2. PROJECT_MAP.md
3. PROJECT_ARCHITECTURE.md
4. docs/RUNTIME_FILES_GIT_POLICY.md
5. docs/M0B_OPERATOR_EVIDENCE_PACK.md

## 8) Current Next Step

Claude must not perform Git. Claude ends every session with a Codex Git Handoff Required block.

Current stage: Phase M-0Y — Authenticated Browser Evidence Verification + Operator-Minimal Manual Handoff

Next correct work:
1. Claude does not perform Git.
2. `/api/public-health` passed.
3. Codex should verify protected endpoints after login if browser/session is available.
4. Operator should login only inside browser/session when Codex requests.
5. Operator must not send password/token in chat.
6. Codex should verify `/public` visual after login if possible.
7. Codex should check paper evidence if available.
8. If Codex cannot perform browser verification, it must give Operator a minimal manual checklist.
9. Keep Phase M-0B blocked if any gate is PENDING or FAIL.
10. If all gates PASS, mark READY_FOR_REVIEW only.
11. READY_FOR_REVIEW does not enable live trading or order placement.
