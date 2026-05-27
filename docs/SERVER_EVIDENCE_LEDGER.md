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

Current Stage: Phase M-0S — Public-Safe Health Endpoint + Auth-Aware Evidence Release

---

## Public-Safe Health Probe Evidence

Endpoint:
- `/api/public-health`

Purpose:
- Allow Scheduled Task / external monitor to verify safe runtime readiness without login.
- Does not replace authenticated endpoint verification.
- Does not approve Phase M-0B.
- Does not expose secrets.
- Does not call exchange API.

Expected:
- HTTP 200.
- JSON response.
- `phase = M-0B_BLOCKED`.
- `liveTradingEnabled=false`.
- `orderPlacementEnabled=false`.
- `productionReady=false`.
- `exchangeManualApproval=not_approved`.
- Runtime core file existence only.
- No raw runtime JSON.
- No secrets.
- No stack trace.

Still required:
- Authenticated endpoint verification.
- `/public` visual verification.
- Paper fill evidence with `averageFillPrice`.
- Manual approval.

Evidence Fields:
- Operator:
- Timestamp (ICT):
- `/api/public-health` HTTP status:
- JSON response confirmed:
- Secrets exposed: yes/no
- Stack trace exposed: yes/no
- Runtime raw payload exposed: yes/no
- Result: PASS / FAIL
- Notes:

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

**No agent may set EXCH
---

## Latest Operator Evidence — 2026-05-27 (Phase M-0R)

### Plesk Build Evidence

| Item | Result |
|------|--------|
| npm install | PASSED |
| npm run build | PASSED |
| Next.js build | PASSED (EXIT:0) |
| TypeScript check | PASSED |
| /public route generated | YES |
| API routes generated | YES |
| Node.js App restart | DONE |

- Operator: Operator/Plesk
- Timestamp (ICT): 2026-05-27
- Build result: EXIT:0

### Environment Evidence

| Variable | Result |
|----------|--------|
| dashboard/.env.local readable | PASSED |
| DATA_DIR | PATH_OK — /var/www/vhosts/ob-gate.com/httpdocs |
| BINGX_AGENT_DIR | PATH_OK — /var/www/vhosts/ob-gate.com/httpdocs |
| AGENT_DIR | PATH_OK — /var/www/vhosts/ob-gate.com/httpdocs |
| LIVE_TRADING_ENABLED=false | PASS |
| ENABLE_ORDER_PLACEMENT=false | PASS |
| PRODUCTION_TRADING_READY=false | PASS |
| EXCHANGE_MANUAL_APPROVAL=not_approved | PASS |

> All three dir env vars (DATA_DIR / BINGX_AGENT_DIR / AGENT_DIR) resolve to the same root path.
> No secret values recorded here — only key names and correct-state confirmation.

### Runtime File Evidence

| File | Status | JSON Start Check |
|------|--------|-----------------|
| latest_decision.json | EXISTS | LIKELY_JSON |
| market_snapshot.json | EXISTS | LIKELY_JSON |
| klines.json | EXISTS | LIKELY_JSON |
| orderbook_snapshot.json | EXISTS | LIKELY_JSON |
| open_interest_snapshot.json | EXISTS | LIKELY_JSON |
| scheduler_heartbeat.json | EXISTS | LIKELY_JSON |
| plan_status.json | EXISTS | LIKELY_JSON |
| news_context.json | MISSING | N/A — WARNING (optional if NO_NEWS mode active) |

> Source of Truth: `latest_decision.json` and `market_snapshot.json` exist and start with JSON.
> news_context.json missing is classified as **Expected Blocker** (not a real bug) if NO_NEWS mode is active or news scheduler not running.

### Endpoint Evidence (Unauthenticated curl -k)

| Endpoint | HTTP Status | Observation |
|----------|-------------|-------------|
| /api/health | 307 | Redirects to /login?next=/api/health |
| /api/plan-status | 307 | Redirects to /login?next=/api/plan-status |
| (other API endpoints) | 307 (likely) | Same auth redirect behavior expected |

**Interpretation:**
- HTTP 307 = **Auth protection is working correctly**
- This is NOT proof that endpoints are broken or that endpoint code is wrong
- Unauthenticated requests (Scheduled Task, plain curl) are expected to be redirected
- Endpoint JSON correctness is **not yet verified** — requires authenticated session
- Auth redirect source: Next.js Edge Middleware manifest shows empty (`"middleware": {}`), so redirect is likely from route-level auth check or Plesk proxy layer

**Classification:** Expected Blocker (see Red Block Classification Rule)

### Endpoint Verification Strategy

#### Option A — Authenticated Browser Verification (Recommended)

Operator logs into dashboard in browser, then opens each endpoint directly:

```
/api/health
/api/plan-status
/api/runtime-audit
/api/operator-evidence
/api/m0b-preflight
/api/paper-performance
/api/exchange-readiness
/api/winrate
/api/ob-stats
/api/plan-log
```

Pass criteria per endpoint:
- Returns JSON (not HTML login page)
- No raw stack trace visible
- No secret or API key visible
- `ok` / `status` / `warnings` / `blockers` / `nextActions` fields present where applicable

#### Option B — Add Public-Safe Health Endpoint (Optional, for automated monitoring)

Create `/api/public-health` — a minimal no-auth endpoint for Scheduled Task or external monitors.

**Public-safe rules (MUST enforce):**
- No secrets returned
- No AUTH_PASSWORD_HASH / AUTH_COOKIE_SECRET / ADMIN_KEY / API keys
- No raw runtime JSON content dump
- No full env dump or absolute sensitive paths
- No account / position / order data
- No BingX private API call
- No stack trace

**Allowed output only:**
```json
{
  "ok": true,
  "status": "SAFE_PUBLIC_HEALTH",
  "phase": "M-0B_BLOCKED",
  "liveTradingEnabled": false,
  "orderPlacementEnabled": false,
  "productionReady": false,
  "exchangeManualApproval": "not_approved",
  "runtimeCore": {
    "latestDecision": "exists",
    "marketSnapshot": "exists"
  },
  "auth": {
    "protectedEndpoints": true,
    "unauthenticatedApiRedirect": "expected"
  },
  "nextActions": [
    "verify authenticated endpoints",
    "verify public dashboard",
    "collect paper fill evidence"
  ]
}
```

**Candidate files if Option B chosen:**
- `dashboard/app/api/public-health/route.ts` (new file)
- `dashboard/lib/publicHealth.ts` (optional helper)
- Auth exclusion: route handler simply does NOT call `requireAuth()` / auth check — no middleware change needed since Next.js Edge Middleware is empty (confirmed via manifest)
- `PROJECT_MAP.md`, `docs/SERVER_EVIDENCE_LEDGER.md`

**Implementation note:** Since middleware manifest is empty (`"middleware": {}`), a new route at `/api/public-health` with no auth guard in the handler will be publicly accessible without middleware changes.

**Recommendation:** Use Option A first (zero code change). Only implement Option B if Scheduled Task monitoring is required for ongoing server health proof.

### Current Gate Result (Phase M-0R)

| Gate | Status |
|------|--------|
| Plesk deployment (build + restart) | ✅ PASS |
| BINGX_AGENT_DIR / DATA_DIR env path | ✅ PASS |
| Safety flags (LIVE=false, ORDER=false, PROD=false) | ✅ PASS |
| EXCHANGE_MANUAL_APPROVAL=not_approved | ✅ PASS (must stay not_approved until gate clears) |
| Runtime core files exist + JSON start check | ✅ PASS |
| news_context.json | ⚠️ MISSING (Expected Blocker if NO_NEWS mode) |
| Endpoint JSON correctness (authenticated) | ⏳ PENDING |
| /public visual verification | ⏳ PENDING |
| Paper fill evidence (averageFillPrice) | ⏳ PENDING |
| Phase M-0B gate | 🔒 BLOCKED |
