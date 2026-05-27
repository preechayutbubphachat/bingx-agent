# Environment Audit

## Purpose
Audit `.env` and `dashboard/.env.local` without exposing secret values.

## Files Audited
- `.env`
- `dashboard/.env.local`

## Path Policy
Expected project root:
`/var/www/vhosts/ob-gate.com/httpdocs`

Required:
- `DATA_DIR`
- `BINGX_AGENT_DIR`
- `AGENT_DIR` for dashboard

## Safety Flags
Required:
- `LIVE_TRADING_ENABLED=false`
- `ENABLE_ORDER_PLACEMENT=false`
- `PRODUCTION_TRADING_READY=false`
- `EXCHANGE_MANUAL_APPROVAL=not_approved`

## Root .env Summary
| Key | Status |
| --- | --- |
| `DATA_DIR` | PATH_OK |
| `BINGX_AGENT_DIR` | PATH_OK |
| `ENABLE_RUN_CYCLE` | SET |
| `DERIV_HISTORY_SCHED_ENABLED` | SET |
| `VOL_SCHED_ENABLED` | SET |
| `CYCLE_SCHED_ENABLED` | SET |
| `CYCLE_SCHED_INTERVAL_MS` | SET |
| `CYCLE_SCHED_MODE` | SET |
| `PUBLIC_BASE_URL` | SET |
| `OBGATE_BASE_URL` | MISSING |
| `OBGATE_SYMBOL` | MISSING |
| `LIVE_TRADING_ENABLED` | MISSING |
| `ENABLE_ORDER_PLACEMENT` | MISSING |
| `PRODUCTION_TRADING_READY` | MISSING |
| `EXCHANGE_MANUAL_APPROVAL` | MISSING |

## Dashboard .env.local Summary
| Key | Status |
| --- | --- |
| `DATA_DIR` | PATH_OK |
| `BINGX_AGENT_DIR` | PATH_OK |
| `AGENT_DIR` | PATH_OK |
| `POLL_MS` | SET |
| `NEXT_DISABLE_TURBOPACK` | SET |
| `BINGX_AGENT_BASE_URL` | SET |
| `NEXT_PUBLIC_API_BASE` | EMPTY |
| `AUTH_PASSWORD_HASH` | SET |
| `AUTH_COOKIE_SECRET` | SET |
| `AUTH_DEBUG` | SET |
| `ADMIN_KEY` | SET |
| `LIVE_TRADING_ENABLED` | SET |
| `ENABLE_ORDER_PLACEMENT` | SET |
| `PRODUCTION_TRADING_READY` | SET |
| `EXCHANGE_MANUAL_APPROVAL` | MISSING |

## Findings
### OK
- Root `DATA_DIR` and `BINGX_AGENT_DIR` point to the expected Plesk project root.
- Dashboard `DATA_DIR`, `BINGX_AGENT_DIR`, and `AGENT_DIR` point to the expected Plesk project root.
- Dashboard auth keys are present.
- `NEXT_PUBLIC_API_BASE` is empty, which is acceptable for same-origin dashboard API use.

### Warning
- Root `.env` is missing required safety flags.
- Root `.env` is missing `OBGATE_BASE_URL` and `OBGATE_SYMBOL`.
- Dashboard `.env.local` is missing `EXCHANGE_MANUAL_APPROVAL=not_approved`.
- Root secret-like keys include weak or duplicated values by policy: `TRADINGECON_USER`, `TRADINGECON_KEY`, `SM_TICK_KEY`, `RUN_CYCLE_TRIGGER_KEY`, `INTERNAL_API_KEY`, `REFRESH_ENDPOINT_KEY`.
- Dashboard `ADMIN_KEY` is weak or short by policy.

### Required Operator Action
- Add missing root safety flags in server `.env`.
- Add `EXCHANGE_MANUAL_APPROVAL=not_approved` in `dashboard/.env.local`.
- Add or confirm `OBGATE_BASE_URL` and `OBGATE_SYMBOL` if the runtime uses those keys.
- Rotate weak or duplicated secret values on the server.
- Restart the Node.js App after env changes.
- Verify `BINGX_AGENT_DIR` on server before endpoint checks.

## Required Operator Actions
1. Update server env files on Plesk only; do not commit real env values.
2. Rotate weak or duplicated secret values.
3. Restart Node.js App after env changes.
4. Run Plesk pull/build/restart verification.
5. Verify `/api/health`, `/api/runtime-audit`, `/api/operator-evidence`, `/api/m0b-preflight`, `/api/paper-performance`, and `/public`.

## Security Note
`.env` and `dashboard/.env.local` must never be committed.
Only `.env.example` and `dashboard/.env.local.example` may be committed.
