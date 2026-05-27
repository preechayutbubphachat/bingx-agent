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

Next correct work:
1. Claude does not perform Git.
2. Codex handles Git release only if files changed (build + commit + push origin main).
3. Operator pulls latest main on Plesk (git pull origin main).
4. Operator rebuilds and restarts Node.js App (rm -rf .next + npm install + npm run build + restart).
5. Operator verifies BINGX_AGENT_DIR is set correctly in Plesk environment.
6. Operator verifies runtime files (latest_decision.json, market_snapshot.json) at PROJECT_ROOT.
7. Operator verifies server endpoints return JSON (see docs/SERVER_EVIDENCE_LEDGER.md §6).
8. Operator verifies /public dashboard (see docs/SERVER_EVIDENCE_LEDGER.md §7).
9. Operator collects paper fill evidence with averageFillPrice (see docs/SERVER_EVIDENCE_LEDGER.md §9).
10. Keep Phase M-0B blocked until all evidence and EXCHANGE_MANUAL_APPROVAL pass (see docs/SERVER_EVIDENCE_LEDGER.md §10).