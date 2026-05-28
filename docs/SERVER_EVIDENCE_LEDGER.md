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

Current Stage: Phase M-0U — Operator Evidence Intake After Public-Health Release + M-0B Gate Decision Preparation

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

## Latest Phase M-0W Operator Verification Result Intake

> This section is for Operator to fill in after running verification commands on Plesk.
> Claude cowork does not fill evidence values — Operator fills actual results only.
> Classification rules are in the Evidence Classification section below.
> Phase M-0W Purpose: Record and classify operator verification results; close out gate evidence for Phase M-0B decision.

### 1) Public Health Probe Result (`/api/public-health`)

> Command: `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000`
> Run **without login** — this endpoint must be publicly accessible.

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| HTTP status | 200 | | PENDING |
| Content-Type | application/json | | PENDING |
| Redirect to /login | NO | | PENDING |
| Secret / API key exposed | NO | | PENDING |
| Stack trace exposed | NO | | PENDING |
| Raw runtime JSON in response | NO | | PENDING |
| Exchange API called | NO | | PENDING |
| Runtime state mutated | NO | | PENDING |
| `phase` field | `M-0B_BLOCKED` | | PENDING |
| `liveTradingEnabled` | `false` | | PENDING |
| `orderPlacementEnabled` | `false` | | PENDING |
| `productionReady` | `false` | | PENDING |
| `exchangeManualApproval` | `not_approved` | | PENDING |
| `runtimeCoreFiles` summary | present, existence only | | PENDING |
| `blockers` field | present | | PENDING |
| `warnings` field | present | | PENDING |
| `nextActions` field | present | | PENDING |

**Decision: PENDING**

Classification rules:
- **PASS** = HTTP 200 JSON, no redirect, no secret, no stack trace, all expected fields present
- **WARNING** = JSON ok but expected blockers present (e.g. paper evidence pending, phase blocked)
- **FAIL** = redirect to /login, HTML response, stack trace, secret exposed, raw runtime JSON
- **PENDING** = operator has not yet submitted evidence

Operator evidence timestamp (ICT):
Notes:

---

### 2) Protected Endpoint Result After Login

> Open each URL in a **logged-in** browser session.
> HTTP 307 on unauthenticated access = expected auth behavior — not a bug.

| Endpoint | JSON Response | Stack Trace | Secret Exposed | ok/status field | Result |
|----------|---------------|-------------|----------------|-----------------|--------|
| `/api/health` | | | | | PENDING |
| `/api/plan-status` | | | | | PENDING |
| `/api/runtime-audit` | | | | | PENDING |
| `/api/operator-evidence` | | | | | PENDING |
| `/api/m0b-preflight` | | | | | PENDING |
| `/api/paper-performance` | | | | | PENDING |
| `/api/exchange-readiness` | | | | | PENDING |
| `/api/winrate` | | | | | PENDING |
| `/api/ob-stats` | | | | | PENDING |
| `/api/plan-log` | | | | | PENDING |

**Decision: PENDING_AUTHENTICATED_CHECK**

Classification rules:
- **PASS** = all endpoints return structured JSON, no stack trace, no secret
- **WARNING** = JSON ok, expected blockers present in response
- **FAIL** = any endpoint returns HTML error, raw 500, stack trace, or exposes secret
- **PENDING** = operator has not yet verified after login

Operator evidence timestamp (ICT):
Browser used:
Notes:

---

### 3) Public Dashboard Visual Result (`/public`)

> Open in **logged-in** browser: `https://ob-gate.com/public`

| Check | Expected | Result |
|-------|----------|--------|
| Page renders without crash | YES | PENDING |
| No white screen / component error | YES | PENDING |
| DashboardDiagnosticsCard visible | YES | PENDING |
| OperatorEvidenceCard visible | YES | PENDING |
| M0BPreflightCard visible | YES | PENDING |
| ExchangeReadinessCard visible | YES or N/A | PENDING |
| PaperPerformanceCard visible | YES | PENDING |
| LiveMigrationGateCard visible | YES | PENDING |
| MarketRegimeMiniChart or waiting state | YES | PENDING |
| Raw stack trace visible to user | NO | PENDING |
| Secret / API key exposed to user | NO | PENDING |
| Red blocks classified as expected blockers | YES | PENDING |

Expected red blocks (not real bugs):
- `EXCHANGE_MANUAL_APPROVAL` not approved
- Phase M-0B blocked
- paper fills missing `averageFillPrice`
- paper sample insufficient
- read-only exchange sync not yet approved
- `news_context.json` missing while NO_NEWS mode active

Real bugs (must fix before proceeding):
- TypeError / Cannot read properties of undefined or null
- JSON parse error
- endpoint returns HTML instead of JSON
- raw stack trace visible on page
- secret exposed to user
- dashboard crash / white screen

**Decision: PENDING_VISUAL_CHECK**

Operator evidence timestamp (ICT):
Screenshot attached: yes / no
Notes:

---

### 4) Paper Evidence Result

| Check | Required | Actual | Result |
|-------|----------|--------|--------|
| `averageFillPrice` in paper fills | YES | | PENDING |
| `fillQty` in paper fills | YES | | PENDING |
| Entry/exit or open/close timestamps | YES | | PENDING |
| `mode` tag (NEUTRAL/LONG/SHORT) | YES | | PENDING |
| `regime` tag | if available | | PENDING |
| `session` tag | if available | | PENDING |
| `paperDataQuality` != `insufficient` | YES | | PENDING |
| Enough closed paper cycles | operator judgment | | PENDING |

**Decision: PENDING**

> Paper PnL is NOT live PnL. Paper evidence unlocks READY_FOR_REVIEW only — not live trading.

Operator evidence timestamp (ICT):
Source (file/log/dashboard):
Notes:

---

### 5) Phase M-0B Gate Result

| Gate | Status |
|------|--------|
| `/api/public-health` HTTP 200 JSON (no secret, no redirect) | PENDING |
| Protected endpoints JSON after login (no secret, no stack trace) | PENDING |
| `/public` renders without crash, no secret, no stack trace | PENDING |
| Paper evidence (`averageFillPrice`, `fillQty`, closed cycles) | PENDING |
| `EXCHANGE_MANUAL_APPROVAL=approved` | NOT_APPROVED |
| **Phase M-0B** | **BLOCKED** |

**Gate Rules:**
- If `/api/public-health` = FAIL → Phase M-0B BLOCKED
- If any required evidence = PENDING → Phase M-0B BLOCKED
- If protected endpoints = FAIL → Phase M-0B BLOCKED
- If `/public` has real bug → Phase M-0B BLOCKED
- If paper evidence insufficient → Phase M-0B BLOCKED
- If `EXCHANGE_MANUAL_APPROVAL` not approved → Phase M-0B BLOCKED
- If all evidence = PASS → mark **READY_FOR_REVIEW only**
- **READY_FOR_REVIEW does not enable live trading**
- **READY_FOR_REVIEW does not enable order placement**

Operator final decision:
Timestamp (ICT):

---

## Latest Phase M-0V Public-Health / Endpoint / Dashboard Evidence Intake

> This section is for Operator to fill in after the M-0V verification round.
> Claude cowork does not fill this — Operator fills evidence fields only.
> Classification rules are in the Evidence Classification section below.
> Phase M-0V Purpose: Close out the public-health probe verification and protected endpoint evidence so Phase M-0B gate decision can be made.

### 1) Public Health Probe (`/api/public-health`)

> Verify **without login**: `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000`
> Or open in browser (no login required): `https://ob-gate.com/api/public-health`

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| HTTP status | 200 | | PENDING |
| Content-Type | application/json | | PENDING |
| Redirect to /login | NO | | PENDING |
| Secret / API key exposed | NO | | PENDING |
| Stack trace exposed | NO | | PENDING |
| Raw runtime JSON in response | NO | | PENDING |
| `phase` field | `M-0B_BLOCKED` | | PENDING |
| `liveTradingEnabled` | `false` | | PENDING |
| `orderPlacementEnabled` | `false` | | PENDING |
| `productionReady` | `false` | | PENDING |
| `exchangeManualApproval` | `not_approved` | | PENDING |
| `runtimeCoreFiles` summary | present, file existence only | | PENDING |
| `blockers` field | present | | PENDING |
| `warnings` field | present | | PENDING |
| `nextActions` field | present | | PENDING |

**Decision: PENDING**

> If `/api/public-health` returns HTTP 307 → real bug.
> Check: `dashboard/app/api/public-health/route.ts`, `middleware.ts` auth allowlist.
> Report to Claude before proceeding.

---

### 2) Protected Endpoint Evidence (Authenticated Browser Session)

> Open each URL in a **logged-in** browser session.
> HTTP 307 without login = expected auth behavior — not a bug.
> Only verify after login.

| Endpoint | JSON Response | Stack Trace Visible | Secret Exposed | ok/status field | Result |
|----------|---------------|---------------------|----------------|-----------------|--------|
| `/api/health` | | | | | PENDING |
| `/api/plan-status` | | | | | PENDING |
| `/api/runtime-audit` | | | | | PENDING |
| `/api/operator-evidence` | | | | | PENDING |
| `/api/m0b-preflight` | | | | | PENDING |
| `/api/paper-performance` | | | | | PENDING |
| `/api/exchange-readiness` | | | | | PENDING |
| `/api/winrate` | | | | | PENDING |
| `/api/ob-stats` | | | | | PENDING |
| `/api/plan-log` | | | | | PENDING |

**Decision: PENDING_AUTHENTICATED_CHECK**

- Evidence timestamp (ICT):
- Browser used:
- Notes:

---

### 3) Public Dashboard Visual Evidence (`/public`)

> Open in **logged-in** browser: `https://ob-gate.com/public`

| Check | Expected | Result |
|-------|----------|--------|
| Page renders without crash | YES | PENDING |
| No white screen / component error | YES | PENDING |
| DashboardDiagnosticsCard visible | YES | PENDING |
| OperatorEvidenceCard visible | YES | PENDING |
| M0BPreflightCard visible | YES | PENDING |
| ExchangeReadinessCard visible | YES or N/A | PENDING |
| PaperPerformanceCard visible | YES | PENDING |
| LiveMigrationGateCard visible | YES | PENDING |
| MarketRegimeMiniChart or waiting state | YES | PENDING |
| Raw stack trace visible to user | NO | PENDING |
| Secret / API key exposed to user | NO | PENDING |
| Red blocks classified (expected blocker, not real bug) | YES | PENDING |

**Decision: PENDING_VISUAL_CHECK**

- Evidence timestamp (ICT):
- Screenshot attached: yes / no
- Notes:

---

### 4) Paper Evidence

| Check | Required | Actual | Result |
|-------|----------|--------|--------|
| `averageFillPrice` in paper fills | YES | | PENDING |
| `fillQty` in paper fills | YES | | PENDING |
| Entry/exit or open/close timestamps | YES | | PENDING |
| `mode` tag (NEUTRAL/LONG/SHORT) | YES | | PENDING |
| `regime` tag | if available | | PENDING |
| `session` tag | if available | | PENDING |
| `paperDataQuality` != `insufficient` | YES | | PENDING |
| Enough closed paper cycles | operator judgment | | PENDING |

**Decision: PENDING**

- Evidence timestamp (ICT):
- Source file / log:
- Notes:

---

### 5) Phase M-0V Gate Decision

| Gate | Status |
|------|--------|
| `/api/public-health` HTTP 200 JSON (no secret, no redirect) | PENDING |
| Protected endpoints return JSON after login (no secret, no stack trace) | PENDING |
| `/public` renders without crash, no secret, no stack trace | PENDING |
| Paper evidence (averageFillPrice, fillQty, closed cycles) | PENDING |
| `EXCHANGE_MANUAL_APPROVAL=approved` | NOT_APPROVED |
| **Phase M-0B** | **BLOCKED** |

**Gate Rules:**
- If `/api/public-health` fails → Phase M-0B BLOCKED
- If any protected endpoint after login returns raw stack trace or secret → Phase M-0B BLOCKED
- If `/public` crashes or exposes secret → Phase M-0B BLOCKED
- If paper evidence insufficient (`paperDataQuality=insufficient`) → Phase M-0B BLOCKED
- If `EXCHANGE_MANUAL_APPROVAL` is not approved → Phase M-0B BLOCKED
- If all evidence PASS → mark READY_FOR_REVIEW only
- READY_FOR_REVIEW does not enable live trading or order placement

**Operator decision recorded by:**
**Timestamp (ICT):**
**Decision:**

---

## Phase M-0U Operator Evidence Intake

> This section is for Operator to fill in after verifying the M-0S release on Plesk.
> Claude cowork does not fill this — Operator fills evidence fields only.
> Classification rules are in the Evidence Classification section below.

### 1) Plesk Deployment After M-0S Release

| Item | Status |
|------|--------|
| `git pull origin main` completed | PENDING |
| `rm -rf dashboard/.next` completed | PENDING |
| `npm install` completed (EXIT:0) | PENDING |
| `npm run build` completed (EXIT:0) | PENDING |
| Node.js App restarted in Plesk | PENDING |

- Evidence timestamp (ICT):
- Notes:

---

### 2) Public Health Probe (`/api/public-health`)

> Verify without login: `curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000`

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| HTTP status | 200 | | PENDING |
| Content-Type | application/json | | PENDING |
| Redirect to /login | NO | | PENDING |
| Secret exposed | NO | | PENDING |
| Stack trace exposed | NO | | PENDING |
| `phase` field | `M-0B_BLOCKED` | | PENDING |
| `liveTradingEnabled` | `false` | | PENDING |
| `orderPlacementEnabled` | `false` | | PENDING |
| `productionReady` | `false` | | PENDING |
| `exchangeManualApproval` | `not_approved` | | PENDING |
| `runtimeCoreFiles` summary | present, no raw JSON | | PENDING |
| `blockers` field | present | | PENDING |
| `warnings` field | present | | PENDING |
| `nextActions` field | present | | PENDING |

**Decision: PENDING**

> If `/api/public-health` returns 307 → real bug. Check: `dashboard/app/api/public-health/route.ts`, `proxy.ts`, `middleware.ts` auth allowlist.

---

### 3) Protected Endpoint Evidence (Authenticated Browser Session)

> Open each URL in a **logged-in** browser. HTTP 307 without login = expected auth behavior.

| Endpoint | JSON Response | Stack Trace | Secret Exposed | ok/status | Result |
|----------|---------------|-------------|----------------|-----------|--------|
| `/api/health` | | | | | PENDING |
| `/api/plan-status` | | | | | PENDING |
| `/api/runtime-audit` | | | | | PENDING |
| `/api/operator-evidence` | | | | | PENDING |
| `/api/m0b-preflight` | | | | | PENDING |
| `/api/paper-performance` | | | | | PENDING |
| `/api/exchange-readiness` | | | | | PENDING |
| `/api/winrate` | | | | | PENDING |
| `/api/ob-stats` | | | | | PENDING |
| `/api/plan-log` | | | | | PENDING |

**Decision: PENDING_AUTHENTICATED_CHECK**

---

### 4) Public Dashboard Evidence (`/public`)

| Check | Expected | Result |
|-------|----------|--------|
| Page renders without crash | YES | PENDING |
| DashboardDiagnosticsCard visible | YES | PENDING |
| OperatorEvidenceCard visible | YES | PENDING |
| M0BPreflightCard visible | YES | PENDING |
| ExchangeReadinessCard visible | YES or N/A | PENDING |
| PaperPerformanceCard visible | YES | PENDING |
| LiveMigrationGateCard visible | YES | PENDING |
| MarketRegimeMiniChart or waiting state | YES | PENDING |
| Raw stack trace visible | NO | PENDING |
| Secret exposed to user | NO | PENDING |
| Red blocks classified (expected vs real bug) | YES | PENDING |

**Decision: PENDING_VISUAL_CHECK**

---

### 5) Paper Evidence

| Check | Required | Result |
|-------|----------|--------|
| `averageFillPrice` in paper fills | YES | PENDING |
| `fillQty` in paper fills | YES | PENDING |
| Entry/exit or open/close timestamps | YES | PENDING |
| `mode` tag (NEUTRAL/LONG/SHORT) | YES | PENDING |
| `regime` tag | if available | PENDING |
| `session` tag | if available | PENDING |
| `paperDataQuality` != `insufficient` | YES | PENDING |
| Enough closed paper cycles | operator judgment | PENDING |

**Decision: PENDING**

---

### 6) Phase M-0U Gate Decision

| Gate | Status |
|------|--------|
| Plesk deployment (M-0S release) | PENDING |
| `/api/public-health` HTTP 200 JSON (no secret, no redirect) | PENDING |
| Protected endpoints return JSON after login | PENDING |
| `/public` renders without crash | PENDING |
| Paper evidence (averageFillPrice, closed cycles) | PENDING |
| `EXCHANGE_MANUAL_APPROVAL=approved` | NOT_APPROVED |
| **Phase M-0B** | **BLOCKED** |

**Gate Rules:**
- If `/api/public-health` fails → Phase M-0B BLOCKED
- If protected endpoints fail after login → Phase M-0B BLOCKED
- If `/public` has real bug (crash / stack trace / secret) → Phase M-0B BLOCKED
- If paper evidence insufficient → Phase M-0B BLOCKED
- If `EXCHANGE_MANUAL_APPROVAL` is not approved → Phase M-0B BLOCKED
- If all evidence PASS → mark READY_FOR_REVIEW only — does not enable live trading

---

## Evidence Classification Rules

### PASS
- Expected behavior confirmed
- JSON response present and structured
- No secret or API key exposed
- No stack trace visible
- No live/order flag enabled
- No runtime JSON mutation
- Required evidence fields present

### WARNING (expected blocker — not a real bug)
- `news_context.json` missing while NO_NEWS mode is active
- `scheduler_heartbeat.json` missing (expected if scheduler not running)
- Expected phase blocker visible with clear `nextActions`
- Paper sample small but all required fields present
- `EXCHANGE_MANUAL_APPROVAL` not approved (by design until all gates pass)
- Paper fills count = 0 (expected pre-paper-run)

### FAIL (real bug — must fix before proceeding)
- `/api/public-health` redirects to `/login` (307 or 302)
- `/api/public-health` returns HTML instead of JSON
- Protected endpoint after login returns HTML or raw error
- Raw stack trace visible in response or on `/public`
- Secret or API key exposed in any response or UI
- `/public` dashboard crashes (white screen, component error)
- `latest_decision.json` missing or invalid JSON
- `market_snapshot.json` missing or invalid JSON
- `LIVE_TRADING_ENABLED=true`
- `ENABLE_ORDER_PLACEMENT=true`
- `EXCHANGE_MANUAL_APPROVAL=approved` set before all evidence is complete
- Paper fills missing `averageFillPrice` entirely

---

## Phase M-0T Evidence Intake

### Release Evidence
| Item | Status |
|------|--------|
| Codex M-0S release (build + push origin main) | DONE |
| `/api/public-health` implemented | YES |
| Public-safe JSON response contract | YES |
| Auth allowlist updated for `/api/public-health` only | YES |
| Dashboard build before push (EXIT:0) | PASSED |
| Push origin main | DONE |

### Operator/Plesk Environment (Previously Confirmed)
| Item | Status |
|------|--------|
| DATA_DIR=/var/www/vhosts/ob-gate.com/httpdocs | CONFIRMED |
| BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs | CONFIRMED |
| AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs | CONFIRMED |
| LIVE_TRADING_ENABLED=false | CONFIRMED |
| ENABLE_ORDER_PLACEMENT=false | CONFIRMED |
| PRODUCTION_TRADING_READY=false | CONFIRMED |
| EXCHANGE_MANUAL_APPROVAL=not_approved | CONFIRMED |

### Runtime Core Files (Previously Confirmed)
| File | Status |
|------|--------|
| latest_decision.json | EXISTS — likely valid JSON |
| market_snapshot.json | EXISTS — likely valid JSON |
| klines.json | EXISTS |
| orderbook_snapshot.json | EXISTS |
| open_interest_snapshot.json | EXISTS |
| scheduler_heartbeat.json | EXISTS |
| plan_status.json | EXISTS |
| news_context.json | MISSING — expected if NO_NEWS mode active |

> news_context.json missing = **expected blocker** if NO_NEWS mode is active. Not a real bug.

### HTTP 307 Auth Redirect Classification
Unauthenticated requests to protected `/api/*` endpoints → HTTP 307 redirect to login.
**Classification: Expected auth behavior — not an endpoint failure.**
Protected endpoints must be verified via authenticated browser session only.

### Public Health Probe (`/api/public-health`)
| Item | Status |
|------|--------|
| Endpoint implemented | YES (M-0S release) |
| Unauthenticated access | EXPECTED (no login required) |
| Expected response | HTTP 200 JSON |
| Secret exposure allowed | NO |
| Exchange API call allowed | NO |
| Runtime JSON mutation allowed | NO |
| Server verification | **PENDING** |

### Protected Endpoint Verification
| Item | Status |
|------|--------|
| `/api/health` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/plan-status` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/runtime-audit` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/operator-evidence` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/m0b-preflight` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/paper-performance` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/exchange-readiness` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/winrate` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/ob-stats` | PENDING_AUTHENTICATED_BROWSER_CHECK |
| `/api/plan-log` | PENDING_AUTHENTICATED_BROWSER_CHECK |

### Public Dashboard Verification
| Item | Status |
|------|--------|
| `/public` visual check | PENDING_VISUAL_CHECK |

### Paper Evidence
| Item | Status |
|------|--------|
| averageFillPrice in paper fills | PENDING |
| fillQty in paper fills | PENDING |
| Closed paper cycles | PENDING |
| paperDataQuality != insufficient | PENDING |

### Gate Decision
| Gate | Status |
|------|--------|
| `/api/public-health` server verification | PENDING |
| Protected endpoints authenticated verification | PENDING |
| `/public` visual verification | PENDING |
| Paper evidence (averageFillPrice) | PENDING |
| EXCHANGE_MANUAL_APPROVAL=approved | NOT_APPROVED |
| **Phase M-0B** | **BLOCKED** |

---

## Operator Verification Commands — Phase M-0T

### 1) Pull / Clean / Build / Restart (after M-0S release)

```bash
cd /var/www/vhosts/ob-gate.com/httpdocs
git pull origin main
cd dashboard
rm -rf .next
npm install
npm run build
```

Then **restart Node.js App** in Plesk control panel.

### 2) Verify `/api/public-health` without login

**Preferred — Scheduled Task / curl:**
```bash
curl -k -sS -i https://ob-gate.com/api/public-health | head -c 4000
```

**Or open in browser (no login needed):**
```
https://ob-gate.com/api/public-health
```

**Expected response:**
- HTTP 200
- `Content-Type: application/json`
- No redirect to `/login`
- `phase = "M-0B_BLOCKED"`
- `liveTradingEnabled: false`
- `orderPlacementEnabled: false`
- `productionReady: false`
- `exchangeManualApproval: "not_approved"`
- Runtime core file existence only (no raw JSON content)
- No secrets
- No stack trace

**If `/api/public-health` returns 307 redirect → login:**
This is a real bug. Check:
- `dashboard/app/api/public-health/route.ts` exists
- `proxy.ts` / `middleware.ts` auth allowlist includes `/api/public-health`
- Report to Claude for fix analysis before proceeding.

### 3) Verify protected endpoints after login

Open these in a **logged-in browser session**:
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

**Expected:**
- JSON response (not HTML login page)
- No raw stack trace in response
- No secret/API key in response
- Structured `ok` / `status` / `warnings` / `blockers` / `nextActions` where applicable
- HTTP 307 without login = expected auth behavior (not a bug)

### 4) Verify `/public` dashboard after login

**Open in logged-in browser:**
```
/public
```

**Expected visible cards:**
- DashboardDiagnosticsCard
- OperatorEvidenceCard
- M0BPreflightCard
- ExchangeReadinessCard (if present)
- PaperPerformanceCard
- LiveMigrationGateCard
- MarketRegimeMiniChart or waiting state

**Expected behavior:**
- No crash / no white screen
- No raw stack trace visible to user
- Red blocks classified as expected-blocker (not real bugs)

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

**Implementation note:** Since middleware manifest