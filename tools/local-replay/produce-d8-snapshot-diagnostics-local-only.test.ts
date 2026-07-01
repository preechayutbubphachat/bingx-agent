import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateD8PointInTimeSnapshot } from "./d8-point-in-time-snapshot.ts";
import {
  parseProduceD8SnapshotDiagnosticsArgs,
  produceD8SnapshotDiagnosticsLocalOnly,
  validateD8SnapshotDiagnosticsOutputPath,
} from "./produce-d8-snapshot-diagnostics-local-only.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function tempRoots(prefix = "d8-producer-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const activeRepoRoot = join(root, "repo");
  const approvedLocalMirrorRoot = join(root, "mirror");
  const inputPath = join(root, "input.jsonl");
  const outputPath = join(
    approvedLocalMirrorRoot,
    "dashboard",
    "tmp",
    "d8-snapshot-diagnostics",
    "diagnostics.jsonl",
  );
  return { root, activeRepoRoot, approvedLocalMirrorRoot, inputPath, outputPath };
}

function diagnosticsRow(overrides: Record<string, unknown> = {}) {
  return {
    rowReference: "row-1",
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    sourceTimeframe: "5M",
    diagnostics: {
      entryCandidateResolution: {
        status: "ALIGNED_CANDIDATE_READY",
        activationAllowed: false,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
      pullbackTriggerThresholds: {
        status: "READY",
        rrReady: true,
        triggerReached: true,
        triggerDistanceClass: "NEAR",
        activationAllowed: false,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
      pullbackZoneTouchEvidence: {
        status: "ZONE_TOUCHED",
        zoneTouched: true,
        shouldEvaluateConfirmation: true,
        activationAllowed: false,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
      touchAwareConfirmationReview: {
        status: "PROMOTABLE_REVIEW_CANDIDATE",
        confirmationStatus: "PROMOTABLE_REVIEW_CANDIDATE",
        shouldPromoteToReview: true,
        activationAllowed: false,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
      noReviewCandidateBottleneckResolver: {
        status: "CLEAR",
        triggerDistanceClass: "NEAR",
        activationAllowed: false,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
    },
    ...overrides,
  };
}

function jsonl(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

test("parse defaults to dry-run and requires explicit paths", () => {
  assert.throws(() => parseProduceD8SnapshotDiagnosticsArgs([]), /input_required/);
  const parsed = parseProduceD8SnapshotDiagnosticsArgs([
    "--input",
    "input.jsonl",
    "--output",
    "out.jsonl",
    "--active-repo-root",
    "repo",
    "--approved-local-mirror-root",
    "mirror",
  ]);
  assert.equal(parsed.apply, false);
});

test("dry-run default writes nothing", async () => {
  const roots = await tempRoots();
  const report = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([diagnosticsRow()]),
  });

  assert.equal(report.mode, "DRY_RUN");
  assert.equal(report.snapshotsProduced, 1);
  assert.equal(report.wroteFiles.length, 0);
  assert.equal(await exists(roots.outputPath), false);
});

test("apply is required before writing and apply writes temp fixture only", async () => {
  const roots = await tempRoots();
  const dryRun = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([diagnosticsRow()]),
  });
  const applied = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([diagnosticsRow()]),
    apply: true,
  });

  assert.equal(dryRun.wroteFiles.length, 0);
  assert.deepEqual(applied.wroteFiles, [roots.outputPath]);
  const output = await readFile(roots.outputPath, "utf8");
  const row = JSON.parse(output.trim());
  assert.equal(row.source.kind, "D8_SNAPSHOT_DIAGNOSTICS_LOCAL_ONLY");
  assert.equal(row.source.inputRowNumber, 1);
  assert.equal(row.source.rowReference, "row-1");
  assert.ok(row.producedAt);
  assert.ok(validateD8PointInTimeSnapshot(row.d8PointInTimeSnapshot).valid);
});

test("rejects output inside active repo", async () => {
  const roots = await tempRoots();
  const outputPath = join(roots.activeRepoRoot, "dashboard", "tmp", "d8-snapshot-diagnostics", "x.jsonl");
  assert.throws(
    () => validateD8SnapshotDiagnosticsOutputPath({ ...roots, outputPath }),
    /output_path_inside_active_repo/,
  );
});

test("rejects output outside approved mirror tmp diagnostics path", () => {
  assert.throws(
    () => validateD8SnapshotDiagnosticsOutputPath({
      activeRepoRoot: "C:/repo",
      approvedLocalMirrorRoot: "C:/mirror",
      outputPath: "C:/other/dashboard/tmp/d8-snapshot-diagnostics/x.jsonl",
    }),
    /output_path_not_approved_d8_snapshot_diagnostics_path/,
  );
});

test("rejects research pack and run paths", () => {
  for (const segment of ["research-packs", "research-runs"]) {
    assert.throws(
      () => validateD8SnapshotDiagnosticsOutputPath({
        activeRepoRoot: "C:/repo",
        approvedLocalMirrorRoot: "C:/mirror",
        outputPath: `C:/mirror/${segment}/x.jsonl`,
      }),
      /output_path_forbidden_path/,
    );
  }
});

test("rejects final d8-snapshots collector path", () => {
  assert.throws(
    () => validateD8SnapshotDiagnosticsOutputPath({
      activeRepoRoot: "C:/repo",
      approvedLocalMirrorRoot: "C:/mirror",
      outputPath: "C:/mirror/dashboard/tmp/d8-snapshots/d8_snapshots.jsonl",
    }),
    /output_path_final_snapshot_path_forbidden/,
  );
});

test("rejects source staging and server like paths", () => {
  for (const segment of ["source", "staging", "server"]) {
    assert.throws(
      () => validateD8SnapshotDiagnosticsOutputPath({
        activeRepoRoot: "C:/repo",
        approvedLocalMirrorRoot: "C:/mirror",
        outputPath: `C:/mirror/${segment}/dashboard/tmp/d8-snapshot-diagnostics/x.jsonl`,
      }),
      /output_path_forbidden_path/,
    );
  }
});

test("accepts already-computed diagnostics-like input and emits canonical snapshot", async () => {
  const roots = await tempRoots();
  const report = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([diagnosticsRow()]),
    apply: true,
  });
  const output = await readFile(roots.outputPath, "utf8");
  const [line] = output.trim().split(/\r?\n/);
  const emitted = JSON.parse(line);
  const validation = validateD8PointInTimeSnapshot(emitted.d8PointInTimeSnapshot);

  assert.equal(report.diagnosticsRowsAccepted, 1);
  assert.equal(report.snapshotsProduced, 1);
  assert.equal(validation.valid, true);
  assert.equal(validation.snapshot?.activationAllowed, false);
  assert.equal(validation.snapshot?.paperActivationAllowed, false);
  assert.equal(validation.snapshot?.liveActivationAllowed, false);
  assert.equal(validation.snapshot?.reviewOnly, true);
  assert.equal(validation.snapshot?.shadowOnly, true);
});

test("accepts row with explicit diagnostics object", async () => {
  const roots = await tempRoots();
  const report = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([{
      rowReference: "nested-1",
      diagnostics: diagnosticsRow({ evaluatedAt: "2026-06-30T00:05:00.000Z" }),
    }]),
    apply: true,
  });
  const output = await readFile(roots.outputPath, "utf8");
  const emitted = JSON.parse(output.trim());

  assert.equal(report.snapshotsProduced, 1);
  assert.equal(emitted.d8PointInTimeSnapshot.evaluatedAt, "2026-06-30T00:05:00.000Z");
  assert.equal(emitted.source.rowReference, "nested-1");
});

test("rejects missing or invalid evaluatedAt and counts invalid rows", async () => {
  const roots = await tempRoots();
  const report = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([
      diagnosticsRow({ evaluatedAt: undefined }),
      diagnosticsRow({ evaluatedAt: "not-a-date" }),
    ]),
    apply: true,
  });

  assert.equal(report.inputRows, 2);
  assert.equal(report.invalidRows, 2);
  assert.equal(report.snapshotsProduced, 0);
  assert.equal(report.wroteFiles.length, 0);
  assert.equal(await exists(roots.outputPath), false);
});

test("validates every emitted snapshot with canonical validator", async () => {
  const roots = await tempRoots();
  await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([diagnosticsRow(), diagnosticsRow({ evaluatedAt: "2026-06-30T00:05:00.000Z" })]),
    apply: true,
  });
  const output = await readFile(roots.outputPath, "utf8");
  for (const line of output.trim().split(/\r?\n/)) {
    const emitted = JSON.parse(line);
    assert.equal(validateD8PointInTimeSnapshot(emitted.d8PointInTimeSnapshot).valid, true);
  }
});

test("duplicate evaluatedAt counted deterministically", async () => {
  const roots = await tempRoots();
  const report = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: jsonl([
      diagnosticsRow({ rowReference: "first" }),
      diagnosticsRow({ rowReference: "duplicate" }),
    ]),
    apply: true,
  });
  const output = await readFile(roots.outputPath, "utf8");

  assert.equal(report.duplicateEvaluatedAt, 1);
  assert.equal(report.snapshotsProduced, 1);
  assert.match(report.warnings.join("\n"), /duplicate_evaluatedAt:2026-06-30T00:00:00.000Z/);
  assert.equal(JSON.parse(output.trim()).source.rowReference, "first");
});

test("exact report counters for mixed input", async () => {
  const roots = await tempRoots();
  const report = await produceD8SnapshotDiagnosticsLocalOnly({
    ...roots,
    inputText: [
      JSON.stringify(diagnosticsRow({ rowReference: "good-1" })),
      JSON.stringify(diagnosticsRow({ rowReference: "dup-1" })),
      JSON.stringify({ rowReference: "missing" }),
      "{bad json",
      JSON.stringify(diagnosticsRow({ rowReference: "good-2", evaluatedAt: "2026-06-30T00:10:00.000Z" })),
    ].join("\n"),
    apply: true,
  });

  assert.equal(report.mode, "APPLY");
  assert.equal(report.inputRows, 5);
  assert.equal(report.diagnosticsRowsAccepted, 2);
  assert.equal(report.snapshotsProduced, 2);
  assert.equal(report.invalidRows, 1);
  assert.equal(report.skippedRows, 1);
  assert.equal(report.duplicateEvaluatedAt, 1);
  assert.equal(report.outputPath, roots.outputPath);
  assert.deepEqual(report.wroteFiles, [roots.outputPath]);
  assert.deepEqual(report.blockers, []);
});

test("source has no forbidden imports or references", async () => {
  const source = await readFile("tools/local-replay/produce-d8-snapshot-diagnostics-local-only.ts", "utf8");
  for (const term of ["bro" + "ker", "exec" + "ution-runner", "a" + "pi", "se" + "cret"]) {
    assert.equal(source.toLowerCase().includes(term), false);
  }
  for (const term of ["fe" + "tch", "XML" + "HttpRequest", "create" + "Order", "place" + "Order"]) {
    assert.equal(source.includes(term), false);
  }
});

test("source has no locked roadmap references", async () => {
  const source = await readFile("tools/local-replay/produce-d8-snapshot-diagnostics-local-only.ts", "utf8");
  for (const term of ["D8" + ".5", "cont" + "inuation"]) {
    assert.equal(source.toLowerCase().includes(term.toLowerCase()), false);
  }
});
