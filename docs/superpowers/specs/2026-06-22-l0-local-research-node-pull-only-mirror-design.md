# L0 Local Research Node / Pull-only Runtime Mirror Design

Date: 2026-06-22
Status: Design only
Scope: Local research/replay/dev mirror for D8.4.2 historical replay input

## Decision

Production runtime remains on the server. The local machine becomes a read-only research, replay, debug, build, and test node.

Data flow is one way:

```text
SERVER -> LOCAL
```

There is no supported path for local files, local replay output, local UI state, or local operator action to write back to the server in L0.

## Purpose

D8.4.2 Historical Replay Candidate Scarcity Review needs approved historical and runtime input without disturbing the 24/7 production paper cycle. Running replay locally keeps heavy offline analysis away from the server runtime and lets the team measure why the algorithm currently produces no candidate, no trade, and no statistics.

The local node exists to answer research questions. It does not control production.

## Responsibility Split

### Server

- Production runtime
- Snapshot loop
- Paper loop
- Dashboard uptime
- Runtime source-of-truth
- Audit and log generation

### Local

- Read-only mirror
- Historical replay
- Dev, debug, build, and test
- Local `/agent-hq` research cockpit
- No production authority

## Mirror Direction

Allowed direction:

```text
SERVER -> LOCAL
```

Forbidden directions and behaviors:

- `LOCAL -> SERVER`
- Bidirectional sync
- Local runtime overwrite on server
- Local order or execution
- Local approval or activation

## Mirror Allowlist

L0 defines the allowlist only. It does not implement sync.

Allowed mirror candidates:

- `market_snapshot.json`
- `latest_decision.json`
- `plan_status_state.json`, if present
- `scheduler_heartbeat.json`, if present
- `dashboard/tmp/execution-runner/*.jsonl`
- `dashboard/tmp/trend-paper/*.jsonl`
- Approved historical candle or snapshot packs, if later created

## Mirror Denylist

Forbidden from mirror scope:

- `.env`
- Secrets
- Private keys
- `config/db.php`
- `node_modules`
- `.next`
- Runtime lock files
- Local build artifacts
- Any file that would enable order, execution, or approval

## Local Environment Model

Examples only. Do not add real env files and do not modify existing env or config in L0.

```text
BINGX_AGENT_DIR=<LOCAL_MIRROR_ROOT>
EXECUTION_AUDIT_ROOT_DIR=<LOCAL_MIRROR_ROOT>/dashboard
LOCAL_RESEARCH_NODE=true
LOCAL_MIRROR_READ_ONLY=true
```

These variables describe how a future local process may read mirrored data. They do not authorize a writer, scheduler, broker, runner, approval flow, or server upload path.

## Agent HQ Modes

### Server `/agent-hq`

- Production monitor
- Reads live runtime source-of-truth
- Operator uptime view

### Local `/agent-hq`

- Research cockpit
- Reads mirrored files
- Shows mirror freshness
- Shows D8.4.2 replay status and result
- Must display this label clearly:

```text
LOCAL RESEARCH MIRROR - NOT PRODUCTION CONTROL
```

Local `/agent-hq` must not include buttons, approval controls, activation controls, or order controls.

## Mirror Freshness Model

Future UI and readiness views may use this shape:

```ts
type LocalMirrorStatus = {
  source: "LOCAL_RESEARCH_MIRROR_V1";
  mode: "PULL_ONLY";
  serverSourceRoot: string | null;
  localMirrorRoot: string | null;
  lastSyncAt: string | null;
  mirrorAgeMs: number | null;
  status:
    | "NOT_CONFIGURED"
    | "STALE"
    | "FRESH"
    | "SYNC_ERROR"
    | "FORBIDDEN_WRITE_RISK";
  freshnessClass: "UNKNOWN" | "FRESH" | "WARN" | "STALE";
  filesMirrored: string[];
  filesMissing: string[];
  forbiddenFilesDetected: string[];
  nextAction: string;
  activationAllowed: false;
  paperActivationAllowed: false;
  liveActivationAllowed: false;
  reviewOnly: true;
  shadowOnly: true;
};
```

Freshness labels for research only:

- `FRESH`: `mirrorAgeMs <= 5 minutes`
- `WARN`: `mirrorAgeMs <= 30 minutes`
- `STALE`: `mirrorAgeMs > 30 minutes`

These labels do not imply production readiness, approval, activation, or trade authority.

## Current Funnel Pass/Fail + Replay Input Pack Readiness

Local `/agent-hq` should include a compact research-only summary that separates current funnel state from replay input readiness. The summary is display-only and must not include buttons, approval controls, activation controls, order controls, automatic replay execution, or server writeback.

The goal is to let an operator see, in one small panel, whether the system has data, whether diagnostics passed, whether a candidate exists, and whether execution is still forbidden.

### Grid / Paper Funnel

Future local mirror diagnostics should expose compact pass/fail rows for:

- `paperLoopState`
- `priceVsGrid`
- `closedCycles`
- `sellFillCount`
- `regridRequired`
- `oldExposurePolicy`

These rows describe paper/runtime diagnostic state only. They must not imply that paper activation, live activation, or order placement is allowed.

### Trend D8 Funnel

Future local mirror diagnostics should expose compact pass/fail rows for:

- D8.0 aligned candidate
- RR ready
- D8.2 trigger status
- D8.3 touch status
- D8.4 confirmation/promotable status
- D8.4.1 primary blocker
- D8.4.2 replay status

These rows should make candidate scarcity visible without converting scarcity into an approval decision. A failed or missing row should state the blocker plainly, such as no aligned candidate, RR not ready, trigger not reached, touch window inactive, confirmation not promotable, or replay data missing.

### Replay Input Pack Readiness

Future local mirror diagnostics should expose compact pass/fail rows for:

- `latest_decision.json` mirrored
- `market_snapshot.json` mirrored
- Execution-runner journals mirrored
- Trend-paper journals mirrored
- Historical candles available
- Point-in-time replay input available
- Approved replay result available

Input readiness means the local research node has enough mirrored or approved input to inspect or run offline replay. It does not mean the replay is automatically started, accepted, uploaded, or used by server paper diagnostics.

### Required Copy Separation

The UI copy must clearly separate these meanings:

- Market data available: source files or historical packs exist locally and are fresh enough for research.
- Diagnostic passed: a read-only diagnostic condition passed for the current mirror snapshot.
- Candidate generated: the D8 funnel produced a reviewable candidate.
- Paper/live execution allowed: always false in L0 local research mirror.

The panel must show execution authority separately from diagnostic status. A valid local data pack or passed diagnostic must never be phrased as approval, activation readiness, trade readiness, or permission to order.

## D8.4.2 Integration

The mirror supports D8.4.2 by providing local historical and runtime input packs. D8.4.2 replay runs locally and offline, then the replay result can be reviewed locally first.

Server paper diagnostics must continue to show `NO_REPLAY_DATA` until an approved replay result is supplied through a separately approved path. L0 does not define or implement replay result upload.

## Safety Constraints

Hard constraints:

- No activation
- No paper activation
- No live activation
- No order
- No broker, runner, or execution changes
- No API or internal route changes
- No exchange API
- No runtime writer
- No bidirectional sync
- No server writeback
- No env, secrets, or `config/db.php` changes
- No production behavior change

Every future local mirror diagnostic must force:

```ts
activationAllowed: false;
paperActivationAllowed: false;
liveActivationAllowed: false;
reviewOnly: true;
shadowOnly: true;
```

## L0 Non-goals

L0 does not authorize implementation.

Do not:

- Create sync scripts
- Create services
- Change code
- Change tests
- Run scheduler
- Stage production code
- Commit runtime files
- Touch D8.5
- Touch continuation branch

## Validation Expectations

For this docs-only task:

- Marker scan must pass for this spec.
- Trailing whitespace check must pass for this spec and `PROJECT_CONTEXT.md`.
- Changed files should be limited to this design spec and `PROJECT_CONTEXT.md`.
- Staged set should remain empty unless a docs-only release is explicitly approved.
