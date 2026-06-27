# L2 Local Pull-only Mirror Prototype Plan

Date: 2026-06-22
Status: Prototype plan plus safe script skeleton
Scope: Local-only pull mirror for approved runtime research inputs

## Current Release Context

- D8.4.2 Historical Replay Candidate Scarcity Review is released.
- L0 Local Research Node / Pull-only Runtime Mirror Design is released.
- L1 Local Pull-only Mirror Implementation Plan is created.
- D8.5 remains on implementation hold.
- Continuation branch remains not approved.
- The working tree has unrelated dirty and untracked files that must not be touched.

## Prototype Goal

Create a local-only pull mirror skeleton that plans or copies approved runtime research files from a server source into a local mirror root.

The prototype starts in dry-run mode and is not a scheduler, daemon, service, route, or continuous sync.

Allowed direction:

```text
SERVER -> LOCAL
```

Forbidden direction:

```text
LOCAL -> SERVER
```

## Created Skeleton

Approved skeleton path:

```text
tools/local-mirror/pull-runtime-mirror.ps1
```

The skeleton is allowed because it is local-only, defaults to dry-run, requires explicit roots, and blocks mirror writes inside the Git repository.

## Required Invocation Model

Dry-run, default behavior:

```powershell
.\tools\local-mirror\pull-runtime-mirror.ps1 `
  -ServerSource "server:/var/www/vhosts/ob-gate.com/httpdocs" `
  -LocalMirrorRoot "C:/2025/ob-gate-local-mirror/httpdocs"
```

Apply mode, only after operator review:

```powershell
.\tools\local-mirror\pull-runtime-mirror.ps1 `
  -ServerSource "C:/approved-local-download/httpdocs" `
  -LocalMirrorRoot "C:/2025/ob-gate-local-mirror/httpdocs" `
  -Apply
```

The skeleton may copy from a local downloaded source in apply mode. Remote SSH transfer remains dry-run planning only until a separate implementation task approves a concrete transfer method.

## Pull-only Allowlist

The skeleton must plan or copy only:

- `market_snapshot.json`
- `latest_decision.json`
- `plan_status_state.json`, if present
- `scheduler_heartbeat.json`, if present
- `dashboard/tmp/execution-runner/*.jsonl`
- `dashboard/tmp/trend-paper/*.jsonl`
- Approved historical candle or snapshot packs when later created

## Denylist

The skeleton must block:

- `.env`
- Secrets
- Private keys
- `config/db.php`
- `node_modules`
- `.next`
- Lock files
- Build artifacts
- Approval-control file classes
- Trade-control file classes

The skeleton must never read or write secret/config paths. It may detect forbidden path names without opening their contents.

## Dry-run Behavior

Default mode:

- Validates required input parameters.
- Validates local mirror root safety.
- Prints planned pull direction.
- Prints allowlisted source and destination pairs.
- Prints missing optional files.
- Prints forbidden path matches when detectable.
- Does not copy files.
- Does not create a status file.
- Exits non-zero on forbidden writeback risk.

## Apply Behavior

Apply mode is allowed only with `-Apply`.

Apply mode:

- Uses the same validation as dry-run.
- Copies only allowlisted files from a local downloaded source.
- Does not run remote transfer commands.
- Does not delete source files.
- Does not upload local files.
- Creates destination directories under local mirror root as needed.
- Writes `localMirrorStatus.json` under the local mirror root only.
- Keeps all activation flags false and review flags true.

## Writeback Prevention

The skeleton must stop before any copy when:

- `LocalMirrorRoot` is empty.
- `LocalMirrorRoot` looks like a production server path.
- `LocalMirrorRoot` is inside the active Git repository.
- Direction is not exactly source to local destination.
- A forbidden destination is detected.
- A remote SSH source is used with `-Apply`.

There is no code path for upload, reverse copy, source deletion, server deletion, or bidirectional sync.

## Local Mirror Root Safety

Expected local root:

```text
C:/2025/ob-gate-local-mirror/httpdocs
```

The root must be outside:

```text
C:/2025/web-69/ob-gate17-200369/httpdocs
```

This prevents runtime mirror JSON and JSONL files from being written into the Git working tree.

## Mirror Status Output

Future and prototype status output shape:

```json
{
  "source": "LOCAL_RESEARCH_MIRROR_V1",
  "mode": "PULL_ONLY",
  "lastSyncAt": null,
  "mirrorAgeMs": null,
  "status": "NOT_CONFIGURED",
  "filesMirrored": [],
  "filesMissing": [],
  "forbiddenFilesDetected": [],
  "nextAction": "Run dry-run with explicit source and local mirror root.",
  "activationAllowed": false,
  "paperActivationAllowed": false,
  "liveActivationAllowed": false,
  "reviewOnly": true,
  "shadowOnly": true
}
```

The status file must be written only under the local mirror root in apply mode.

## Local Research Cockpit Fit

Future local `/agent-hq` may read the local mirror root and the mirror status output. It must display:

```text
LOCAL RESEARCH MIRROR - NOT PRODUCTION CONTROL
```

It must remain display-only:

- No buttons.
- No approval controls.
- No trade controls.
- No automatic replay.
- No server writeback.

## D8.4.2 Replay Input Fit

The mirror output can later feed a local D8.4.2 replay input pack:

- Build replay input from mirrored runtime files.
- Include approved historical candle or snapshot packs when available.
- Keep replay local until a separate task approves replay execution.
- Keep server paper diagnostics unchanged.
- Make no edge claim until reviewed replay output exists.

## Validation Plan

Run these checks after creating the plan and skeleton:

- Marker scan passes.
- Trailing whitespace scan passes.
- Static safety scan finds no upload command, server delete command, scheduler, service, route, env read, secret read, or config read.
- Script contains no source deletion command.
- Script contains no Git staging command.
- Only the plan and approved skeleton are newly created by this task.
- No files are staged.

## Git Hygiene

This task must not:

- Use `git add .`.
- Stage any file.
- Commit.
- Push.
- Touch unrelated dirty or untracked files.
- Touch D8.5.
- Touch continuation branch work.
- Commit runtime files.
