# D8 Snapshot Local Writer Producer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separately approved, local-only D8 point-in-time snapshot writer/producer that persists canonical D8 snapshot rows into the approved local mirror path without changing strategy behavior or enabling activation.

**Architecture:** Phase 1 owns the canonical D8 snapshot schema and strict L5 ingestion path. Phase 2 owns the pure capture shape from already-computed paper diagnostics. Phase 3 implementation should add only a path-guarded local writer and, if needed, a local collection command that consumes the Phase 2 shape, validates with the Phase 1 validator, and writes JSONL only under the approved mirror tmp path.

**Tech Stack:** TypeScript, `node:test`, Node.js `fs/promises` only inside the writer implementation, existing Phase 1 validator in `tools/local-replay/d8-point-in-time-snapshot.ts`, existing Phase 2 capture helper in `dashboard/lib/paper/d8PointInTimeSnapshotCapture.ts`.

---

## Roadmap Gate

Roadmap gate remains:

```text
D8 Snapshot Capture & Replay Evidence Repair
```

This plan is docs-only. It does not implement code, write snapshot JSONL, create `dashboard/tmp/d8-snapshots`, write the local mirror, run L5 apply, run L7 replay, generate replay packs or research runs, copy generated JSON or JSONL into the repository, touch D8.5, touch continuation, or alter activation, order, execution, API, env, or config paths.

## Problem Statement

Phase 1 made L5 ingestion strict. The L5 pack builder accepts D8 snapshot evidence only from:

```text
dashboard/tmp/d8-snapshots/*.jsonl
```

Rows must validate through the canonical D8 snapshot validator in:

```text
tools/local-replay/d8-point-in-time-snapshot.ts
```

Phase 2 created a read-only canonical snapshot capture shape in:

```text
dashboard/lib/paper/d8PointInTimeSnapshotCapture.ts
```

`paperLoopDiagnostics.ts` now exposes `d8PointInTimeSnapshot` as a diagnostics field, but it does not persist it. The remaining missing component is controlled local-only persistence to `dashboard/tmp/d8-snapshots/*.jsonl`. The current real local mirror still has:

```text
d8SnapshotCount = 0
d8SnapshotDataQualityStatus = NO_D8_SNAPSHOTS
```

Until controlled local-only snapshot rows exist, L5 can remain mechanically usable while D8 replay evidence lacks the required coverage.

## Writer Producer Objective

The future writer/producer must:

- Persist canonical D8 snapshot rows only.
- Use the Phase 2 capture helper as the source shape.
- Validate every output row with the Phase 1 canonical validator before any write.
- Write local-only output under the approved path only:

```text
C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-snapshots/
```

- Never write into the active repository.
- Never write source, staging, or server paths.
- Never call API, broker, order, or execution code.
- Never mutate strategy behavior.
- Consume already-computed diagnostics only.
- Keep all emitted rows review-only and shadow-only.

The writer exists to create replay evidence coverage. It is not a trading feature.

## Proposed Files

### Required Minimal Writer Files

- Create: `dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.ts`
- Create: `dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts`

Responsibilities:

- `d8PointInTimeSnapshotJournalWriter.ts` should own path validation, canonical row validation, deterministic append policy, and JSONL serialization.
- `d8PointInTimeSnapshotJournalWriter.test.ts` should own all writer safety, schema, and path guard proof.

### Optional Local Collection Tool

Only add this pair if a separately approved implementation needs an operator command that invokes the writer from local diagnostics data:

- Create: `tools/local-replay/collect-d8-snapshots-local-only.ts`
- Create: `tools/local-replay/collect-d8-snapshots-local-only.test.ts`

Justification:

- The writer library should stay small and pure except for local file I/O.
- A command script can hold CLI argument parsing and explicit local mirror root handling.
- The command must not run L5 apply, run L7 replay, or write replay packs.

## Path Safety Rules

The implementation must enforce these rules before creating a directory or writing a file:

- Require explicit output root input.
- Reject output root inside the active repository.
- Reject source, staging, server-like, or production web root paths.
- Reject any path outside the approved local mirror tmp path:

```text
C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/d8-snapshots/
```

- Create the `d8-snapshots` directory only when a future implementation is separately approved.
- Write only `.jsonl` files.
- Use a deterministic append policy:
  - target file name: `d8_snapshots.jsonl`
  - append one validated row per line
  - reject duplicate `evaluatedAt` rows already present in the target file
  - preserve existing valid rows
  - reject malformed existing lines instead of overwriting the file
- Do not overwrite replay packs.
- Do not write `research-packs`.
- Do not write `research-runs`.
- Do not write runtime JSON or JSONL anywhere in the active repository.
- Do not create or modify `.env`, secrets, `config/db.php`, or API route files.

## Runtime Safety Rules

The writer/producer must:

- Keep `activationAllowed=false`.
- Keep `paperActivationAllowed=false`.
- Keep `liveActivationAllowed=false`.
- Keep `reviewOnly=true`.
- Keep `shadowOnly=true`.
- Avoid paper/live order paths.
- Avoid broker, order, execution, API, env, secrets, and config imports.
- Avoid private exchange clients.
- Avoid network calls.
- Avoid strategy mutation.
- Avoid scheduler or service integration.
- Consume already-computed diagnostics only.
- Treat missing diagnostics as safe `UNKNOWN` or `false` values through the Phase 2 capture helper.

The writer must not decide whether a candidate is valid for trading. It only persists the already-computed review snapshot shape.

## Snapshot Row Requirements

Every emitted row must include every canonical field:

```text
schemaVersion
source
evaluatedAt
sourceTimeframe
alignedContext
d8_0AlignedCandidate
rrReady
d8_2Status
triggerReached
d8_3Status
zoneTouched
confirmationWindowActive
d8_4Status
confirmationAligned
promotableReviewCandidate
bottleneckStatus
triggerDistanceClass
sourceSafetyValid
dataQualityValid
activationAllowed=false
paperActivationAllowed=false
liveActivationAllowed=false
reviewOnly=true
shadowOnly=true
```

The writer must validate each row through:

```ts
validateD8PointInTimeSnapshot(row)
```

The writer must reject rows with:

- missing required fields
- invalid `evaluatedAt`
- invalid `sourceTimeframe`
- unsafe activation flags
- invalid boolean fields
- invalid string fields

The writer must not attempt to repair invalid rows during persistence. Repairs belong in the capture helper or upstream diagnostics, with tests.

## Data Quality Handoff

After a separately approved writer implementation and a separately approved local capture run, L5 dry-run should verify these fields:

- `d8SnapshotCount > 0` when writer has produced rows
- `d8SnapshotCoverageRatio`
- `d8SnapshotMissingCount`
- `d8SnapshotFutureLeakCount = 0`
- `d8SnapshotSchemaInvalidCount = 0`
- `d8SnapshotDataQualityStatus`

Expected transition:

```text
NO_D8_SNAPSHOTS -> LOW_D8_COVERAGE -> D8_SNAPSHOT_REPLAY_READY
```

The transition to `D8_SNAPSHOT_REPLAY_READY` is allowed only when coverage is sufficient for the evaluation candle set. Low coverage remains an evidence limitation, not a strategy failure. Future leakage or schema invalid rows must block replay readiness.

## Implementation Tasks For A Later Approved Phase

### Task 1: Writer Path Guard

**Files:**

- Create: `dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts`
- Create: `dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.ts`

- [ ] **Step 1: Write failing path guard tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateD8SnapshotOutputRoot } from "./d8PointInTimeSnapshotJournalWriter.ts";

test("rejects output root inside active repo", () => {
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: "C:/2025/web-69/ob-gate17-200369/httpdocs",
      outputRoot: "C:/2025/web-69/ob-gate17-200369/httpdocs/dashboard/tmp/d8-snapshots",
      approvedMirrorRoot: "C:/2025/ob-gate-local-mirror/httpdocs",
    }),
    /output_root_inside_active_repo/,
  );
});

test("rejects output root outside approved local mirror tmp path", () => {
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: "C:/2025/web-69/ob-gate17-200369/httpdocs",
      outputRoot: "C:/2025/other/httpdocs/dashboard/tmp/d8-snapshots",
      approvedMirrorRoot: "C:/2025/ob-gate-local-mirror/httpdocs",
    }),
    /output_root_not_approved_d8_snapshot_path/,
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts
```

Expected: fail because `d8PointInTimeSnapshotJournalWriter.ts` does not exist or `validateD8SnapshotOutputRoot` is not exported.

- [ ] **Step 3: Implement the minimal path guard**

```ts
import { resolve, relative, isAbsolute, join } from "node:path";

export interface D8SnapshotOutputRootInput {
  activeRepoRoot: string;
  outputRoot: string;
  approvedMirrorRoot: string;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalized(value: string): string {
  return resolve(value).replaceAll("\\", "/");
}

export function validateD8SnapshotOutputRoot(input: D8SnapshotOutputRootInput): string {
  const activeRepoRoot = resolve(input.activeRepoRoot);
  const outputRoot = resolve(input.outputRoot);
  const approvedRoot = resolve(input.approvedMirrorRoot);
  const approvedD8Root = resolve(join(approvedRoot, "dashboard", "tmp", "d8-snapshots"));

  if (isInside(activeRepoRoot, outputRoot)) throw new Error("output_root_inside_active_repo");
  if (normalized(outputRoot) !== normalized(approvedD8Root)) {
    throw new Error("output_root_not_approved_d8_snapshot_path");
  }
  return outputRoot;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts
```

Expected: path guard tests pass.

### Task 2: Canonical JSONL Writer

**Files:**

- Modify: `dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.ts`
- Modify: `dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts`

- [ ] **Step 1: Write failing canonical write tests**

```ts
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { D8_POINT_IN_TIME_SNAPSHOT_SOURCE } from "../../../tools/local-replay/d8-point-in-time-snapshot.ts";
import { appendD8PointInTimeSnapshot } from "./d8PointInTimeSnapshotJournalWriter.ts";

function canonicalRow(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    sourceTimeframe: "5M",
    alignedContext: false,
    d8_0AlignedCandidate: false,
    rrReady: false,
    d8_2Status: "UNKNOWN",
    triggerReached: false,
    d8_3Status: "UNKNOWN",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "UNKNOWN",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "UNKNOWN",
    triggerDistanceClass: "UNKNOWN",
    sourceSafetyValid: false,
    dataQualityValid: false,
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
    ...overrides,
  };
}

test("writes only canonical JSONL rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "d8-writer-"));
  const mirrorRoot = join(root, "mirror");
  const outputRoot = join(mirrorRoot, "dashboard", "tmp", "d8-snapshots");
  await mkdir(outputRoot, { recursive: true });

  const result = await appendD8PointInTimeSnapshot({
    activeRepoRoot: join(root, "repo"),
    approvedMirrorRoot: mirrorRoot,
    outputRoot,
    row: canonicalRow(),
  });

  const text = await readFile(result.filePath, "utf8");
  assert.equal(text.trim(), JSON.stringify(canonicalRow()));
  assert.equal(result.wrote, true);
});

test("rejects invalid rows before write", async () => {
  const root = await mkdtemp(join(tmpdir(), "d8-writer-"));
  const mirrorRoot = join(root, "mirror");
  const outputRoot = join(mirrorRoot, "dashboard", "tmp", "d8-snapshots");
  await mkdir(outputRoot, { recursive: true });

  await assert.rejects(
    () => appendD8PointInTimeSnapshot({
      activeRepoRoot: join(root, "repo"),
      approvedMirrorRoot: mirrorRoot,
      outputRoot,
      row: canonicalRow({ evaluatedAt: "invalid" }),
    }),
    /invalid_timestamp:evaluatedAt/,
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts
```

Expected: fail because `appendD8PointInTimeSnapshot` is not implemented.

- [ ] **Step 3: Implement append with validation**

```ts
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateD8PointInTimeSnapshot } from "../../../tools/local-replay/d8-point-in-time-snapshot.ts";

export interface AppendD8PointInTimeSnapshotInput extends D8SnapshotOutputRootInput {
  row: unknown;
}

export interface AppendD8PointInTimeSnapshotResult {
  filePath: string;
  wrote: boolean;
  skippedReason: string | null;
}

async function existingEvaluatedAt(filePath: string): Promise<Set<string>> {
  try {
    const text = await readFile(filePath, "utf8");
    const seen = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as { evaluatedAt?: unknown };
      if (typeof parsed.evaluatedAt !== "string") throw new Error("existing_row_missing_evaluatedAt");
      seen.add(parsed.evaluatedAt);
    }
    return seen;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Set();
    throw error;
  }
}

export async function appendD8PointInTimeSnapshot(
  input: AppendD8PointInTimeSnapshotInput,
): Promise<AppendD8PointInTimeSnapshotResult> {
  const outputRoot = validateD8SnapshotOutputRoot(input);
  const validation = validateD8PointInTimeSnapshot(input.row);
  if (!validation.valid || validation.snapshot == null) throw new Error(validation.errors.join(","));

  await mkdir(outputRoot, { recursive: true });
  const filePath = join(outputRoot, "d8_snapshots.jsonl");
  const seen = await existingEvaluatedAt(filePath);
  if (seen.has(validation.snapshot.evaluatedAt)) {
    return { filePath, wrote: false, skippedReason: "duplicate_evaluatedAt" };
  }

  await appendFile(filePath, JSON.stringify(validation.snapshot) + "\n", "utf8");
  return { filePath, wrote: true, skippedReason: null };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types dashboard/lib/paper/d8PointInTimeSnapshotJournalWriter.test.ts
```

Expected: canonical write tests pass.

### Task 3: Optional Local Collection Command

**Files:**

- Create if separately approved: `tools/local-replay/collect-d8-snapshots-local-only.ts`
- Create if separately approved: `tools/local-replay/collect-d8-snapshots-local-only.test.ts`

- [ ] **Step 1: Write failing CLI safety tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCollectD8SnapshotArgs } from "./collect-d8-snapshots-local-only.ts";

test("requires explicit local mirror root and output root", () => {
  assert.throws(
    () => parseCollectD8SnapshotArgs([]),
    /local_mirror_root_required/,
  );
});

test("does not expose apply or replay flags", () => {
  assert.throws(
    () => parseCollectD8SnapshotArgs(["--apply"]),
    /unsupported_flag/,
  );
  assert.throws(
    () => parseCollectD8SnapshotArgs(["--run-l7"]),
    /unsupported_flag/,
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/collect-d8-snapshots-local-only.test.ts
```

Expected: fail because the optional command is absent.

- [ ] **Step 3: Implement only argument parsing and writer call boundary**

```ts
export interface CollectD8SnapshotArgs {
  localMirrorRoot: string;
  outputRoot: string;
  dryRun: boolean;
}

export function parseCollectD8SnapshotArgs(argv: readonly string[]): CollectD8SnapshotArgs {
  if (argv.includes("--apply") || argv.includes("--run-l7") || argv.includes("--replay")) {
    throw new Error("unsupported_flag");
  }

  const localMirrorRootIndex = argv.indexOf("--local-mirror-root");
  const outputRootIndex = argv.indexOf("--output-root");
  const localMirrorRoot = localMirrorRootIndex >= 0 ? argv[localMirrorRootIndex + 1] : "";
  const outputRoot = outputRootIndex >= 0 ? argv[outputRootIndex + 1] : "";

  if (!localMirrorRoot) throw new Error("local_mirror_root_required");
  if (!outputRoot) throw new Error("output_root_required");

  return { localMirrorRoot, outputRoot, dryRun: argv.includes("--dry-run") };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types tools/local-replay/collect-d8-snapshots-local-only.test.ts
```

Expected: CLI safety tests pass.

## Future RED Tests

Future implementation must start by proving these tests fail for the expected reason:

- rejects output root inside active repo
- rejects output root outside approved local mirror tmp path
- rejects source, staging, and server-like paths
- rejects write attempt to `research-packs`
- rejects write attempt to `research-runs`
- writes only canonical JSONL rows
- validates every row before write
- forces safety flags false and review/shadow flags true exactly
- does not import broker, order, execution, API, env, or config
- does not import writer dependencies outside the writer module
- does not mutate input diagnostics
- does not write unless explicit writer call is made
- handles duplicate `evaluatedAt` deterministically
- rejects malformed existing target JSONL
- L5 ingests writer output in a temp fixture
- L5 rejects corrupted writer output in a temp fixture

## Acceptance Criteria For Phase 3 Implementation

A later implementation may be accepted only when:

- This docs plan is complete first.
- Implementation starts with RED tests and ends with GREEN tests.
- Writer is local-only and path-guarded.
- Writer uses the Phase 2 capture helper output shape.
- Writer validates with the Phase 1 canonical validator.
- Writer refuses active repository paths.
- Writer refuses source, staging, server, `research-packs`, and `research-runs` paths.
- No real local mirror write occurs until separately approved.
- After writer release, only then a controlled local-only capture dry-run may be requested.
- D8.5 remains `HOLD`.
- Continuation remains `NOT APPROVED`.

## Explicit Non-Goals

This plan does not approve:

- L7 replay rerun
- L5 apply
- paper automation
- supervised live
- autonomous mode
- API activation
- order placement
- D8.5 release
- continuation approval
- strategy tuning
- broker routes
- execution routes
- server writeback
- local mirror write
- repository replay pack generation

## Validation Plan For This Docs-Only Step

Run these checks after creating this plan:

```powershell
git diff --check -- docs/superpowers/plans/2026-06-29-d8-snapshot-local-writer-producer-plan.md
Run the repository's standard marker scan against the plan file.
Select-String -Path docs/superpowers/plans/2026-06-29-d8-snapshot-local-writer-producer-plan.md -Pattern "\s+$"
git diff --name-only
git diff --cached --name-only
```

Expected result:

- Only this plan file changed for this task.
- No code implementation changed.
- No snapshot JSONL generated.
- No local mirror write.
- No L5 apply.
- No L7 replay.
- No stage, commit, or push.
- D8.5 untouched.
- Continuation untouched.
- Activation, order, execution, API, env, and config paths untouched.
