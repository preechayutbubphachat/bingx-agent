# Server Evidence Ledger

> This file records Plesk/server evidence required before Phase M-0B read-only exchange API implementation is approved.
> Claude cowork does not fill this file — Operator fills evidence fields only.
> Do not record secrets, API keys, or credentials.

---

## 1) Purpose

This file is the single evidence ledger for all server-side, Plesk, runtime, and dashboard
checks that must be completed before Phase M-0B (read-only exchange sync) may be unblocked.

Phase M-0B approval requires:
- All checklist items in this ledger checked by Operator
- All evidence fields populated
- EXCHANGE_MANUAL_APPROVAL=approved set by Operator (not by any agent)

---

## 2) Current Decision

**Phase M-0B: BLOCKED**

Reason:
- Plesk deployment evidence pending
- BINGX_AGENT_DIR verification pending
- server endpoint checks pending
- paper fill evidence pending
- EXCHANGE_MANUAL_APPROVAL not approved

Current Stage: Phase M-0N — Server Evidence Intake + Plesk Verification + M-0B Gate Readiness Ledger

---

## 3) Plesk Deployment Evidence

### Required Checklist

- [ ] git pull origin main completed by Operator
- [ ] dashboard/.next cleaned (`rm -rf dashboard/.next`)
- [ ] npm install completed (EXIT:0)
- [ ] npm run build completed (EXIT:0)
- [ ] Node.js App restarted in Plesk
- [ ] /public hard refresh completed (Ctrl+Shift+R)

### Evidence Fields

- Operator:
- Timestamp (ICT):
- Commit hash verified:
- Build result (EXIT:0 / EXIT:1):
- Notes:

---

## 4) Environment Evidence

### Required Checklist

- [ ] BINGX_AGENT_DIR is set in Plesk environment
- [ ] BINGX_AGENT_DIR points to project root (httpdocs/)
- [ ] LIVE_TRADING_ENABLED=false confirmed
- [ ] ENABLE_ORDER_PLACEMENT=false confirmed
- [ ] PRODUCTION_TRADING_READY=false confirmed
- [ ] EXCHANGE_MANUAL_APPROVAL is NOT "approved" (must remain blocked until all gates pass)

> **Do not record secret values here. Record only key names and confirmation of correct state.**

### Evidence Fields

- Operator:
- Timestamp (ICT):
- BINGX_AGENT_DIR path (no secrets):
- Safety flags confirmed:
- Notes:

---

## 5) Runtime File Evidence

### Required Checklist

- [ ] latest_decision.json exists at PROJECT_ROOT
- [ ] latest_decision.json is valid JSON (no parse errors)
- [ ] latest_decision.json is fresh (updated within expected window)
- [ ] market_snapshot.json exists at PROJECT_ROOT
- [ ] market_snapshot.json is valid JSON
- [ ] market_snapshot.json is fresh
- [ ] klines.json checked if referenced (exists or safe-missing handled)
- [ ] orderbook_snapshot.json checked if referenced
- [ ] open_interest_snapshot.json checked if referenced
- [ ] news_context.json checked if referenced
- [ ] scheduler_heartbeat.json checked (missing is expected-blocker if scheduler not running)

> **Source of Truth**: `<PROJECT_ROOT>/latest_decision.json` and `<PROJECT_ROOT>/market_snapshot.json`
> `dashboard/app/public/data/*.json` = display/cache mirror only — never authoritative.

### Evidence Fields

- Operator:
- Timestamp (ICT):
- latest_decision.json status:
- market_snapshot.json status:
- scheduler_heartbeat.json status:
- Notes:

---

## 6) Endpoint Evidence

### Required Endpoint Checks

For each endpoint, record HTTP status, JSON shape, and whether any error is exposed:

| Endpoint | HTTP Status | JSON Response | ok/status | Blockers | Warnings | Raw Stack Exposed | Secret Exposed |
|----------|-------------|---------------|-----------|----------|----------|-------------------|----------------|
| /api/health | | | | | | | |
| /api/plan-status | | | | | | | |
| /api/runtime-audit | | | | | | | |
| /api/operator-evidence | | | | | | | |
| /api/m0b-preflight | | | | | | | |
| /api/paper-performance | | | | | | | |
| /api/exchange-readiness | | | | | | | |
| /api/winrate | | | | | | | |
| /api/ob-stats | | | | | | | |
| /api/plan-log | | | | | | | |

### Evidence Fields

- Operator:
- Timestamp (ICT):
- All endpoints returning JSON (not HTML): yes / no / partial
- Any raw stack trace visible: yes / no
- Any secret visible: yes / no
- Notes:

---

## 7) Public Dashboard Evidence

### Required Checklist

- [ ] DashboardDiagnosticsCard visible on /public
- [ ] OperatorEvidenceCard visible on /public
- [ ] M0BPreflightCard visible on /public
- [ ] ExchangeReadinessCard (if present) visible on /public
- [ ] PaperPerformanceCard visible on /public
- [ ] LiveMigrationGateCard visible on /public
- [ ] MarketRegimeMiniChart or waiting state visible
- [ ] No raw stack trace visible to end user
- [ ] Red blocks classified as expected-blocker (not real bugs)

### Evidence Fields

- Operator:
- Timestamp (ICT):
- Screenshot or visual confirmation:
- Unexpected errors visible: yes / no
- Notes:

---

## 8) Red Block Classification

### Expected Blockers (Normal — do not need fixing)

These red/warning states are expected while in pre-approval phase:

- EXCHANGE_MANUAL_APPROVAL not approved
- Phase M-0B blocked
- Paper fills missing averageFillPrice
- Paper sample insufficient / paperDataQuality = insufficient
- Read-only exchange sync not approved
- Server evidence pending (items in this ledger unchecked)
- Optional runtime file missing but handled safely (e.g., scheduler_heartbeat.json)
- No paper cycles yet / paper fills = 0

### Real Bugs (Must Fix Before Proceeding)

These indicate actual code or configuration problems:

- Raw stack trace visible on /public or in API response
- TypeError or "Cannot read properties of undefined/null" visible to user
- Endpoint returns HTML (login page or error page) instead of JSON
- JSON parse error returned from API
- Component crash / white screen
- Secret or API key exposed in response or logs
- Runtime path resolver still using hard-coded path (C:\bingx-agent) instead of BINGX_AGENT_DIR
- UI shows raw JSON dump > 200 chars without collapse mechanism

---

## 9) Paper Evidence

### Required Checklist (before M-0B approval review)

- [ ] paper fills include averageFillPrice field
- [ ] paper fills include fillQty field
- [ ] paper cycles include entry/exit or open/close timestamp
- [ ] paper events include mode tag (NEUTRAL/LONG/SHORT)
- [ ] paper events include regime tag if available
- [ ] paper events include session tag if available
- [ ] paper has enough closed cycles (minimum: operator judgment)
- [ ] paperDataQuality is NOT "insufficient"

> **Paper PnL is NOT live PnL. Never treat simulated fills as real trading results.**

### Evidence Fields

- Operator:
- Timestamp (ICT):
- Closed paper cycles count:
- paperDataQuality value:
- averageFillPrice present: yes / no
- Notes:

---

## 10) Approval Status

### Current Approval

**NOT_APPROVED**

### Gate Conditions

Phase M-0B may only be considered for approval after ALL of the following are confirmed:

1. Plesk deployment evidence complete (Section 3 all checked)
2. BINGX_AGENT_DIR verified (Section 4 all checked)
3. All endpoints verified and returning JSON (Section 6 all checked)
4. /public dashboard verified (Section 7 all checked)
5. Paper evidence complete (Section 9 all checked)
6. Operator explicitly approves
7. EXCHANGE_MANUAL_APPROVAL=approved set in Plesk environment by Operator

**No agent may set EXCHANGE_MANUAL_APPROVAL=approved.**
**No agent may unblock Phase M-0B unilaterally.**
**Manual operator confirmation is required.**

### Approval Fields

- Operator:
- Approval date (ICT):
- All gate conditions confirmed: yes / no
- Notes:
