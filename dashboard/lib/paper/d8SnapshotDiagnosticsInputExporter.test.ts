import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
  validateD8PointInTimeSnapshot,
} from "./d8PointInTimeSnapshot.ts";
import {
  createD8SnapshotDiagnosticsInputRow,
  validateD8SnapshotDiagnosticsInputOutputPath,
  writeD8SnapshotDiagnosticsInputRows,
} from "./d8SnapshotDiagnosticsInputExporter.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function tempRoots(prefix = "d8-diagnostics-input-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const activeRepoRoot = join(root, "repo");
  const approvedDiagnosticsInputRoot = join(root, "mirror", "dashboard", "tmp", "d8-diagnostics-input");
  const outputPath = join(approvedDiagnosticsInputRoot, "diagnostics-input.jsonl");
  return { root, activeRepoRoot, approvedDiagnosticsInputRoot, outputPath };
}

function diagnostics(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
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

test("rejects missing evaluatedAt", () => {
  assert.throws(
    () => createD8SnapshotDiagnosticsInputRow({
      source: "paper-loop-diagnostics",
      sourceTimeframe: "5M",
      diagnostics: diagnostics(),
    }),
    /missing_required_field:evaluatedAt/,
  );
});

test("rejects invalid evaluatedAt", () => {
  assert.throws(
    () => createD8SnapshotDiagnosticsInputRow({
      evaluatedAt: "not-a-date",
      source: "paper-loop-diagnostics",
      sourceTimeframe: "5M",
      diagnostics: diagnostics(),
    }),
    /invalid_timestamp:evaluatedAt/,
  );
});

test("accepts already-computed paper diagnostics and emits producer-compatible row", () => {
  const row = createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics: diagnostics(),
    producedAt: "2026-06-30T00:00:01.000Z",
  });

  assert.equal(row.schemaVersion, 1);
  assert.equal(row.source, "paper-loop-diagnostics");
  assert.equal(row.evaluatedAt, "2026-06-30T00:00:00.000Z");
  assert.equal(row.producedAt, "2026-06-30T00:00:01.000Z");
  assert.equal(row.sourceTimeframe, "5M");
  assert.equal(validateD8PointInTimeSnapshot(row.d8PointInTimeSnapshot).valid, true);
  assert.deepEqual(row.diagnostics.entryCandidateResolution, diagnostics().entryCandidateResolution);
});

test("includes d8PointInTimeSnapshot when diagnostics contains one", () => {
  const snapshot = canonicalSnapshot({ evaluatedAt: "2026-06-30T00:05:00.000Z" });
  const row = createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:05:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics: { d8PointInTimeSnapshot: snapshot },
    producedAt: "2026-06-30T00:05:01.000Z",
  });

  assert.deepEqual(row.d8PointInTimeSnapshot, snapshot);
  assert.deepEqual(row.diagnostics.d8PointInTimeSnapshot, snapshot);
});

test("uses capture helper to create d8PointInTimeSnapshot when safe fields are supplied", () => {
  const row = createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:10:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "15M",
    diagnostics: diagnostics(),
  });

  assert.equal(row.d8PointInTimeSnapshot.evaluatedAt, "2026-06-30T00:10:00.000Z");
  assert.equal(row.d8PointInTimeSnapshot.sourceTimeframe, "15M");
  assert.equal(row.d8PointInTimeSnapshot.d8_2Status, "READY");
  assert.equal(row.d8PointInTimeSnapshot.triggerReached, true);
});

test("forces activation flags false and review shadow flags true", () => {
  const row = createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:15:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics: diagnostics({
      activationAllowed: true,
      paperActivationAllowed: true,
      liveActivationAllowed: true,
      reviewOnly: false,
      shadowOnly: false,
    }),
  });

  assert.deepEqual(row.safety, {
    activationAllowed: false,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  });
  assert.equal(row.d8PointInTimeSnapshot.activationAllowed, false);
  assert.equal(row.d8PointInTimeSnapshot.paperActivationAllowed, false);
  assert.equal(row.d8PointInTimeSnapshot.liveActivationAllowed, false);
  assert.equal(row.d8PointInTimeSnapshot.reviewOnly, true);
  assert.equal(row.d8PointInTimeSnapshot.shadowOnly, true);
});

test("missing optional diagnostics map to UNKNOWN and false deterministically", () => {
  const row = createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:20:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics: {},
  });

  assert.equal(row.d8PointInTimeSnapshot.d8_2Status, "UNKNOWN");
  assert.equal(row.d8PointInTimeSnapshot.d8_3Status, "UNKNOWN");
  assert.equal(row.d8PointInTimeSnapshot.d8_4Status, "UNKNOWN");
  assert.equal(row.d8PointInTimeSnapshot.bottleneckStatus, "UNKNOWN");
  assert.equal(row.d8PointInTimeSnapshot.triggerDistanceClass, "UNKNOWN");
  assert.equal(row.d8PointInTimeSnapshot.triggerReached, false);
  assert.equal(row.d8PointInTimeSnapshot.zoneTouched, false);
});

test("does not mutate input diagnostics", () => {
  const inputDiagnostics = diagnostics();
  const before = JSON.stringify(inputDiagnostics);
  createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:25:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics: inputDiagnostics,
  });

  assert.equal(JSON.stringify(inputDiagnostics), before);
});

test("rejects unsafe output paths when write helper is used", async () => {
  const roots = await tempRoots();
  for (const outputPath of [
    join(roots.activeRepoRoot, "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
    join(roots.root, "mirror", "source", "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
    join(roots.root, "mirror", "dashboard", "tmp", "d8-snapshots", "x.jsonl"),
    join(roots.root, "mirror", "research-packs", "x.jsonl"),
    join(roots.root, "other", "dashboard", "tmp", "d8-diagnostics-input", "x.jsonl"),
  ]) {
    assert.throws(
      () => validateD8SnapshotDiagnosticsInputOutputPath({ ...roots, outputPath }),
      /output_path_/,
    );
  }
});

test("writes nothing unless explicit write helper is called", async () => {
  const roots = await tempRoots();
  const row = createD8SnapshotDiagnosticsInputRow({
    evaluatedAt: "2026-06-30T00:30:00.000Z",
    source: "paper-loop-diagnostics",
    sourceTimeframe: "5M",
    diagnostics: diagnostics(),
  });

  assert.equal(await exists(roots.outputPath), false);
  const result = await writeD8SnapshotDiagnosticsInputRows({
    ...roots,
    rows: [row],
  });
  const text = await readFile(roots.outputPath, "utf8");

  assert.deepEqual(result, { outputPath: roots.outputPath, wrote: true, rowCount: 1 });
  assert.deepEqual(JSON.parse(text.trim()), row);
});

test("implementation has no forbidden imports or references", async () => {
  const source = await readFile("dashboard/lib/paper/d8SnapshotDiagnosticsInputExporter.ts", "utf8");
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

test("implementation has no locked roadmap references", async () => {
  const source = await readFile("dashboard/lib/paper/d8SnapshotDiagnosticsInputExporter.ts", "utf8");
  for (const term of ["D8" + ".5", "cont" + "inuation"]) {
    assert.equal(source.toLowerCase().includes(term.toLowerCase()), false);
  }
});
