import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
} from "../../dashboard/lib/paper/d8PointInTimeSnapshot.ts";
import {
  captureD8DiagnosticsInputLocalOnly,
  parseCaptureD8DiagnosticsInputArgs,
  validateD8DiagnosticsInputCaptureOutputPath,
} from "./capture-d8-diagnostics-input-local-only.ts";
import { produceD8SnapshotDiagnosticsLocalOnly } from "./produce-d8-snapshot-diagnostics-local-only.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "d8-diagnostics-input-capture-"));
  const activeRepoRoot = join(root, "active-repo");
  const approvedLocalMirrorRoot = join(root, "local-mirror");
  const approvedDiagnosticsInputRoot = join(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-diagnostics-input");
  const inputPath = join(root, "input.jsonl");
  const outputPath = join(approvedDiagnosticsInputRoot, "d8_diagnostics_input.jsonl");
  return { root, activeRepoRoot, approvedLocalMirrorRoot, approvedDiagnosticsInputRoot, inputPath, outputPath };
}

function canonicalSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    sourceTimeframe: "5M",
    alignedContext: false,
    d8_0AlignedCandidate: false,
    rrReady: false,
    d8_2Status: "NO_GATE",
    triggerReached: false,
    d8_3Status: "NO_TRIGGER_CONTEXT",
    zoneTouched: false,
    confirmationWindowActive: false,
    d8_4Status: "NO_TOUCH_CONTEXT",
    confirmationAligned: false,
    promotableReviewCandidate: false,
    bottleneckStatus: "NO_CONTEXT",
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

function diagnosticsInputRow(overrides: Record<string, unknown> = {}) {
  const snapshot = canonicalSnapshot(overrides.d8PointInTimeSnapshot as Record<string, unknown> ?? {});
  return {
    schemaVersion: 1,
    source: "paper-loop-diagnostics",
    evaluatedAt: snapshot.evaluatedAt,
    producedAt: "2026-06-30T00:00:01.000Z",
    sourceTimeframe: snapshot.sourceTimeframe,
    diagnostics: {
      d8PointInTimeSnapshot: snapshot,
      noReviewCandidateBottleneckResolver: {
        status: "NO_CONTEXT",
        activationAllowed: false,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
      },
    },
    d8PointInTimeSnapshot: snapshot,
    safety: {
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
      reviewOnly: true,
      shadowOnly: true,
    },
    ...overrides,
  };
}

function jsonl(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

test("parse defaults to dry-run and requires explicit paths", () => {
  assert.throws(() => parseCaptureD8DiagnosticsInputArgs([]), /input_required/);
  assert.throws(() => parseCaptureD8DiagnosticsInputArgs(["--input", "x"]), /output_required/);

  const parsed = parseCaptureD8DiagnosticsInputArgs([
    "--input", "in.jsonl",
    "--output", "out.jsonl",
    "--active-repo-root", "repo",
    "--approved-local-mirror-root", "mirror",
  ]);

  assert.deepEqual(parsed, {
    inputPath: "in.jsonl",
    outputPath: "out.jsonl",
    activeRepoRoot: "repo",
    approvedLocalMirrorRoot: "mirror",
    apply: false,
  });
});

test("dry-run default writes nothing", async () => {
  const roots = await fixture();
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: diagnosticsInputRow() }]),
  });

  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.inputRows, 1);
  assert.equal(result.candidateRows, 1);
  assert.equal(result.validRows, 1);
  assert.equal(result.writtenRows, 0);
  assert.deepEqual(result.wroteFiles, []);
  assert.equal(await exists(roots.outputPath), false);
});

test("apply is required before writing and apply writes temp fixture only", async () => {
  const roots = await fixture();

  const dry = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: diagnosticsInputRow() }]),
  });
  assert.equal(dry.writtenRows, 0);
  assert.equal(await exists(roots.outputPath), false);

  const applied = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    apply: true,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: diagnosticsInputRow() }]),
  });
  assert.equal(applied.mode, "APPLY");
  assert.equal(applied.writtenRows, 1);
  assert.deepEqual(applied.wroteFiles, [roots.outputPath]);
  assert.equal(await exists(roots.outputPath), true);
});

test("rejects output inside active repo", async () => {
  const roots = await fixture();
  const outputPath = join(roots.activeRepoRoot, "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl");

  assert.throws(
    () => validateD8DiagnosticsInputCaptureOutputPath({ ...roots, outputPath }),
    /output_path_inside_active_repo/,
  );
});

test("rejects output outside approved d8-diagnostics-input path", async () => {
  const roots = await fixture();

  assert.throws(
    () => validateD8DiagnosticsInputCaptureOutputPath({
      ...roots,
      outputPath: join(roots.approvedLocalMirrorRoot, "dashboard", "tmp", "other", "x.jsonl"),
    }),
    /output_path_not_approved_d8_diagnostics_input_path/,
  );
});

test("rejects research-packs and research-runs output", async () => {
  const roots = await fixture();
  for (const segment of ["research-packs", "research-runs"]) {
    assert.throws(
      () => validateD8DiagnosticsInputCaptureOutputPath({
        ...roots,
        outputPath: join(roots.approvedLocalMirrorRoot, segment, "x.jsonl"),
      }),
      /output_path_forbidden_path/,
    );
  }
});

test("rejects final d8-snapshots output", async () => {
  const roots = await fixture();

  assert.throws(
    () => validateD8DiagnosticsInputCaptureOutputPath({
      ...roots,
      outputPath: join(roots.approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots", "d8_snapshots.jsonl"),
    }),
    /output_path_final_snapshot_path_forbidden/,
  );
});

test("rejects d8-snapshot-diagnostics producer output", async () => {
  const roots = await fixture();

  assert.throws(
    () => validateD8DiagnosticsInputCaptureOutputPath({
      ...roots,
      outputPath: join(roots.approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshot-diagnostics", "x.jsonl"),
    }),
    /output_path_producer_diagnostics_path_forbidden/,
  );
});

test("rejects source staging and server-like paths", async () => {
  const roots = await fixture();
  for (const segment of ["source", "staging", "server"]) {
    assert.throws(
      () => validateD8DiagnosticsInputCaptureOutputPath({
        ...roots,
        outputPath: join(roots.approvedLocalMirrorRoot, segment, "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
      }),
      /output_path_forbidden_path/,
    );
  }
});

test("accepts top-level d8SnapshotDiagnosticsInput", async () => {
  const roots = await fixture();
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: diagnosticsInputRow() }]),
  });

  assert.equal(result.candidateRows, 1);
  assert.equal(result.validRows, 1);
  assert.equal(result.rows[0].source, "paper-loop-diagnostics");
});

test("accepts diagnostics d8SnapshotDiagnosticsInput", async () => {
  const roots = await fixture();
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ diagnostics: { d8SnapshotDiagnosticsInput: diagnosticsInputRow() } }]),
  });

  assert.equal(result.candidateRows, 1);
  assert.equal(result.validRows, 1);
  assert.equal(result.rows[0].sourceTimeframe, "5M");
});

test("rejects missing evaluatedAt", async () => {
  const roots = await fixture();
  const row = diagnosticsInputRow({ evaluatedAt: undefined });
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: row }]),
  });

  assert.equal(result.validRows, 0);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.missingEvaluatedAt, 1);
});

test("rejects invalid evaluatedAt", async () => {
  const roots = await fixture();
  const row = diagnosticsInputRow({ evaluatedAt: "not-a-date" });
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: row }]),
  });

  assert.equal(result.validRows, 0);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.invalidEvaluatedAt, 1);
});

test("rejects missing sourceTimeframe", async () => {
  const roots = await fixture();
  const row = diagnosticsInputRow({ sourceTimeframe: undefined });
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: row }]),
  });

  assert.equal(result.validRows, 0);
  assert.equal(result.invalidRows, 1);
  assert.equal(result.missingSourceTimeframe, 1);
});

test("rejects unsafe safety flags", async () => {
  const roots = await fixture();
  const row = diagnosticsInputRow({
    safety: {
      activationAllowed: true,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
      reviewOnly: true,
      shadowOnly: true,
    },
  });
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: row }]),
  });

  assert.equal(result.validRows, 0);
  assert.equal(result.invalidRows, 1);
  assert.match(result.warnings.join("\n"), /unsafe_activationAllowed/);
});

test("duplicate evaluatedAt is counted and rejected deterministically", async () => {
  const roots = await fixture();
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow() },
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow() },
    ]),
  });

  assert.equal(result.candidateRows, 2);
  assert.equal(result.validRows, 1);
  assert.equal(result.duplicateEvaluatedAt, 1);
  assert.equal(result.invalidRows, 1);
});

test("dry-run report counters are exact", async () => {
  const roots = await fixture();
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    inputText: jsonl([
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow() },
      { diagnostics: { d8SnapshotDiagnosticsInput: diagnosticsInputRow({ evaluatedAt: "2026-06-30T00:05:00.000Z" }) } },
      { notD8: true },
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow({ evaluatedAt: undefined }) },
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow() },
    ]),
  });

  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.inputRows, 5);
  assert.equal(result.candidateRows, 4);
  assert.equal(result.validRows, 2);
  assert.equal(result.writtenRows, 0);
  assert.equal(result.invalidRows, 2);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.duplicateEvaluatedAt, 1);
  assert.equal(result.missingEvaluatedAt, 1);
  assert.equal(result.invalidEvaluatedAt, 0);
  assert.equal(result.missingSourceTimeframe, 0);
  assert.equal(result.outputPath, roots.outputPath);
  assert.deepEqual(result.wroteFiles, []);
  assert.deepEqual(result.blockers, []);
});

test("apply writes only valid JSONL rows in temp approved mirror fixture", async () => {
  const roots = await fixture();
  const result = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    apply: true,
    inputText: jsonl([
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow() },
      { notD8: true },
      { d8SnapshotDiagnosticsInput: diagnosticsInputRow({ evaluatedAt: "bad" }) },
    ]),
  });
  const text = await readFile(roots.outputPath, "utf8");
  const rows = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));

  assert.equal(result.validRows, 1);
  assert.equal(result.writtenRows, 1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], diagnosticsInputRow());
});

test("producer can dry-run on emitted diagnostics input in temp fixture", async () => {
  const roots = await fixture();
  const capture = await captureD8DiagnosticsInputLocalOnly({
    ...roots,
    apply: true,
    inputText: jsonl([{ d8SnapshotDiagnosticsInput: diagnosticsInputRow() }]),
  });
  const producer = await produceD8SnapshotDiagnosticsLocalOnly({
    inputPath: roots.outputPath,
    outputPath: join(roots.approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshot-diagnostics", "diagnostics.jsonl"),
    activeRepoRoot: roots.activeRepoRoot,
    approvedLocalMirrorRoot: roots.approvedLocalMirrorRoot,
  });

  assert.equal(capture.writtenRows, 1);
  assert.equal(producer.mode, "DRY_RUN");
  assert.equal(producer.wroteFiles.length, 0);
  assert.equal(producer.snapshotsProduced, 1);
});

test("source has no forbidden imports or references", async () => {
  const source = await readFile("tools/local-replay/capture-d8-diagnostics-input-local-only.ts", "utf8");
  for (const term of [
    "a" + "pi",
    "bro" + "ker",
    "ord" + "er",
    "exec" + "ution",
    "process." + "env",
    "con" + "fig",
    "se" + "cret",
    "net" + "work",
    "fe" + "tch",
  ]) {
    assert.equal(source.toLowerCase().includes(term.toLowerCase()), false);
  }
});

test("source has no locked roadmap references", async () => {
  const source = await readFile("tools/local-replay/capture-d8-diagnostics-input-local-only.ts", "utf8");
  for (const term of ["D8" + ".5", "cont" + "inuation"]) {
    assert.equal(source.toLowerCase().includes(term.toLowerCase()), false);
  }
});
