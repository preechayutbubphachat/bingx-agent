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

Current stage: Phase M-0W — Operator Verification Result Intake + Public-Health Gate Closeout

Next correct work:
1. Claude does not perform Git.
2. Operator sends `/api/public-health` verification output (curl or browser, no login required).
3. Operator sends protected endpoint evidence after login (JSON / no-stack-trace / no-secret per endpoint).
4. Operator sends `/public` dashboard visual evidence after login (renders, cards visible, no crash, no secret).
5. Operator sends paper fill evidence with `averageFillPrice`, `fillQty`, closed cycles, mode/regime/session tags.
6. Claude classifies each evidence item as PASS / WARNING / FAIL / PENDING (see docs/SERVER_EVIDENCE_LEDGER.md).
7. Keep Phase M-0B blocked if any gate is PENDING or FAIL.
8. If all gates PASS → mark READY_FOR_REVIEW only — does not enable live trading or order placement.
9. READY_FOR_REVIEW does not mean live trading is permitted — `EXCHANGE_MANUAL_APPROVAL` must be set by Operator after independent review of all evidence.
