# L6 First Local Replay Input Pack Build Runbook

Date: 2026-06-22
Status: Operator runbook
Scope: First local-only D8.4.2 replay input pack build

## Purpose

This runbook describes the first local-only build of a D8.4.2 replay input pack from a manually downloaded server-data staging folder into a local pull-only mirror.

L6 does not run replay. It only prepares and validates the input pack that a later L7 one-shot local replay may consume.

## Safety Boundary

Allowed direction:

```text
MANUAL_SERVER_DOWNLOAD -> LOCAL_MIRROR_ROOT -> LOCAL_REPLAY_INPUT_PACK
```

Forbidden directions:

```text
LOCAL -> SERVER
LOCAL_REPLAY_INPUT_PACK -> SERVER
REPO_RUNTIME_JSON -> LOCAL_REPLAY_INPUT_PACK
```

Hard rules:

- No D8.5.
- No continuation branch.
- No replay run in L6.
- No order, execution, broker, runner, or API changes.
- No env, secrets, or config files.
- No server upload or writeback.
- No scheduler or service.
- No generated replay pack committed.
- No `git add .`.

## Local Paths

Recommended manual download staging root:

```text
C:/2025/ob-gate-server-download/httpdocs
```

Recommended local mirror root:

```text
C:/2025/ob-gate-local-mirror/httpdocs
```

Create the folders locally before the first run:

```powershell
New-Item -ItemType Directory -Force -Path "C:/2025/ob-gate-server-download/httpdocs"
New-Item -ItemType Directory -Force -Path "C:/2025/ob-gate-local-mirror/httpdocs"
```

The local mirror root must be outside the Git repository:

```text
C:/2025/web-69/ob-gate17-200369/httpdocs
```

## Manual Server Download / Staging

Download server files manually into:

```text
C:/2025/ob-gate-server-download/httpdocs
```

Use this allowlist only:

- `market_snapshot.json`
- `latest_decision.json`
- `plan_status_state.json`, if present
- `scheduler_heartbeat.json`, if present
- `dashboard/tmp/execution-runner/*.jsonl`
- `dashboard/tmp/trend-paper/*.jsonl`
- `dashboard/tmp/historical-packs/*.json`, if approved and present
- `dashboard/tmp/historical-packs/*.jsonl`, if approved and present

Keep the same relative folder structure as the server.

Never download:

- `.env`
- Secrets
- `config/db.php`
- Private keys
- `node_modules`
- `.next`
- Lock files
- Order, execution, or approval files

## L2 Mirror Dry-run

Actual L2 script:

```text
tools/local-mirror/pull-runtime-mirror.ps1
```

Dry-run command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File ".\tools\local-mirror\pull-runtime-mirror.ps1" `
  -ServerSource "C:/2025/ob-gate-server-download/httpdocs" `
  -LocalMirrorRoot "C:/2025/ob-gate-local-mirror/httpdocs"
```

Expected dry-run behavior:

- Prints `Mode: DRY_RUN`.
- Prints `Direction: SERVER -> LOCAL`.
- Prints planned allowlisted copy operations.
- Prints missing optional allowlisted files.
- Prints forbidden path matches if detected.
- Writes nothing.
- Does not create `localMirrorStatus.json`.

Stop if forbidden paths are reported.

## L2 Mirror Apply

Run apply only after dry-run output is reviewed.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File ".\tools\local-mirror\pull-runtime-mirror.ps1" `
  -ServerSource "C:/2025/ob-gate-server-download/httpdocs" `
  -LocalMirrorRoot "C:/2025/ob-gate-local-mirror/httpdocs" `
  -Apply
```

Apply behavior:

- Copies only allowlisted files from the manual download staging root.
- Writes only under `C:/2025/ob-gate-local-mirror/httpdocs`.
- Sets copied files read-only where possible.
- Writes `localMirrorStatus.json` under the local mirror root only.
- Does not delete source files.
- Does not upload local files.
- Does not contact the server.

If apply reports forbidden path matches, stop and remove the forbidden downloaded files from the staging root.

## L5 Replay Pack Builder Dry-run

Actual L5 builder:

```text
tools/local-replay/build-d8-4-2-replay-input-pack.ts
```

Dry-run command:

```powershell
node --experimental-strip-types `
  ".\tools\local-replay\build-d8-4-2-replay-input-pack.ts" `
  --local-mirror-root "C:/2025/ob-gate-local-mirror/httpdocs" `
  --dry-run
```

Expected dry-run behavior:

- Prints planned input files.
- Prints planned output files.
- Prints data quality status.
- Writes nothing.
- Does not create `research-packs`.
- Does not run replay.

## L5 Replay Pack Builder Apply

Run apply only after the L5 dry-run output is reviewed.

```powershell
node --experimental-strip-types `
  ".\tools\local-replay\build-d8-4-2-replay-input-pack.ts" `
  --local-mirror-root "C:/2025/ob-gate-local-mirror/httpdocs" `
  --apply
```

Equivalent build flag:

```powershell
node --experimental-strip-types `
  ".\tools\local-replay\build-d8-4-2-replay-input-pack.ts" `
  --local-mirror-root "C:/2025/ob-gate-local-mirror/httpdocs" `
  --build
```

Apply behavior:

- Reads only from `C:/2025/ob-gate-local-mirror/httpdocs`.
- Writes only under `C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input/`.
- Refuses repo-root output.
- Refuses server-like paths.
- Refuses forbidden mirror files.
- Does not call server, API, exchange, or network.
- Does not run replay.

## Expected Pack Output

Expected output root:

```text
C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input/
```

Expected files:

- `manifest.json`
- `candles_5m.jsonl`
- `candles_15m.jsonl`
- `candles_1h.jsonl`
- `d8_snapshots.jsonl`
- `source_file_inventory.json`
- `data_quality_report.json`

`d8_snapshots.jsonl` may be empty when no approved D8 diagnostic snapshots exist.

## Acceptance Criteria

After L5 apply:

- `manifest.json` exists.
- `data_quality_report.json` exists.
- No forbidden files were copied into the mirror.
- No generated files exist inside the Git repository.
- `manifest.dataQualityStatus` is one of:
  - `NO_INPUT`
  - `INSUFFICIENT_HISTORY`
  - `USABLE_FOR_REPLAY`
  - `DATA_QUALITY_BLOCKED`
- `manifest.activationAllowed` is `false`.
- `manifest.paperActivationAllowed` is `false`.
- `manifest.liveActivationAllowed` is `false`.
- `manifest.reviewOnly` is `true`.
- `manifest.shadowOnly` is `true`.

Inspect the manifest:

```powershell
Get-Content `
  -LiteralPath "C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input/manifest.json" `
  | ConvertFrom-Json `
  | Select-Object source,dataQualityStatus,activationAllowed,paperActivationAllowed,liveActivationAllowed,reviewOnly,shadowOnly
```

Inspect the data quality report:

```powershell
Get-Content `
  -LiteralPath "C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input/data_quality_report.json" `
  | ConvertFrom-Json `
  | Select-Object dataQualityStatus,blockers,missingFiles,missingD8Snapshots
```

Confirm no generated pack exists in the repo:

```powershell
Get-ChildItem -Path "." -Recurse -Filter "manifest.json" |
  Where-Object { $_.FullName -match "research-packs|d8-4-2-replay-input" }
```

Expected result: no output.

## Decision After Pack Build

If status is `NO_INPUT`:

- Fix manual download inputs or L2 mirror inputs.
- Confirm approved candle or snapshot files exist under the local mirror root.

If status is `INSUFFICIENT_HISTORY`:

- Collect more approved historical data.
- Do not treat insufficient data as strategy failure.

If status is `DATA_QUALITY_BLOCKED`:

- Inspect `data_quality_report.json`.
- Repair timestamp, timeframe, future-data, OHLC, or forbidden-source blockers.

If status is `USABLE_FOR_REPLAY`:

- Proceed to L7 one-shot local replay run planning.
- Do not run replay inside L6.

## Git Hygiene

Before and after L6:

```powershell
git status --short
git diff --cached --name-only
```

Expected:

- No generated replay pack staged.
- No runtime JSON or JSONL staged.
- No `.env`, secrets, or config files staged.
- No D8.5 staged.
- No unrelated dirty or untracked files staged.

Do not use:

```powershell
git add .
```

## Validation Notes From Runbook Creation

The actual implemented CLIs were inspected:

- `tools/local-mirror/pull-runtime-mirror.ps1`
- `tools/local-replay/build-d8-4-2-replay-input-pack.ts`

Parse/import checks:

```powershell
# L2 parser check
$tokens=$null; $errors=$null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path "tools/local-mirror/pull-runtime-mirror.ps1"),
  [ref]$tokens,
  [ref]$errors
)

# L5 import check
node --experimental-strip-types -e "await import('./tools/local-replay/build-d8-4-2-replay-input-pack.ts'); console.log('TypeScript import OK')"
```

At runbook creation time, these recommended local paths were not present yet:

- `C:/2025/ob-gate-server-download/httpdocs`
- `C:/2025/ob-gate-local-mirror/httpdocs`

For that reason, no L2 or L5 dry-run was executed during runbook creation.
