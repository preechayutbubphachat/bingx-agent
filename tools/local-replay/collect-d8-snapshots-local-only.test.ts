import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
  type D8PointInTimeSnapshot,
} from "./d8-point-in-time-snapshot.ts";
import {
  collectD8SnapshotsLocalOnly,
  parseCollectD8SnapshotArgs,
} from "./collect-d8-snapshots-local-only.ts";

function canonicalRow(overrides: Partial<D8PointInTimeSnapshot> = {}): D8PointInTimeSnapshot {
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

async function tempFixture(): Promise<{
  activeRepoRoot: string;
  approvedLocalMirrorRoot: string;
  inputPath: string;
  outputRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "d8-collector-"));
  const activeRepoRoot = join(root, "repo");
  const approvedLocalMirrorRoot = join(root, "mirror", "httpdocs");
  return {
    activeRepoRoot,
    approvedLocalMirrorRoot,
    inputPath: join(root, "diagnostics.jsonl"),
    outputRoot: join(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots"),
  };
}

async function writeJsonl(path: string, rows: readonly unknown[]): Promise<void> {
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

test("parse args defaults to dry-run and requires explicit inputs", () => {
  assert.deepEqual(
    parseCollectD8SnapshotArgs([
      "--input", "in.jsonl",
      "--output-root", "out",
      "--active-repo-root", "repo",
      "--approved-local-mirror-root", "mirror",
    ]),
    {
      inputPath: "in.jsonl",
      outputRoot: "out",
      activeRepoRoot: "repo",
      approvedLocalMirrorRoot: "mirror",
      apply: false,
    },
  );
  assert.equal(
    parseCollectD8SnapshotArgs([
      "--input", "in.jsonl",
      "--output-root", "out",
      "--active-repo-root", "repo",
      "--approved-local-mirror-root", "mirror",
      "--apply",
    ]).apply,
    true,
  );
  assert.throws(() => parseCollectD8SnapshotArgs([]), /input_required/);
});

test("dry-run reads valid d8PointInTimeSnapshot but writes nothing", async () => {
  const fixture = await tempFixture();
  await writeJsonl(fixture.inputPath, [{ d8PointInTimeSnapshot: canonicalRow() }]);

  const result = await collectD8SnapshotsLocalOnly(fixture);

  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.inputRows, 1);
  assert.equal(result.snapshotsFound, 1);
  assert.equal(result.validSnapshots, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(result.invalidSnapshots, 0);
  assert.equal(result.duplicateSnapshots, 0);
  assert.equal(result.skippedRows, 0);
  assert.deepEqual(result.wroteFiles, []);
  assert.equal(existsSync(fixture.outputRoot), false);
});

test("apply writes valid canonical rows only in temp approved mirror fixture", async () => {
  const fixture = await tempFixture();
  const row = canonicalRow();
  await writeJsonl(fixture.inputPath, [
    { d8PointInTimeSnapshot: row },
    { d8PointInTimeSnapshot: canonicalRow({ evaluatedAt: "invalid" }) },
    { other: "skip" },
  ]);

  const result = await collectD8SnapshotsLocalOnly({ ...fixture, apply: true });

  assert.equal(result.mode, "APPLY");
  assert.equal(result.inputRows, 3);
  assert.equal(result.snapshotsFound, 2);
  assert.equal(result.validSnapshots, 1);
  assert.equal(result.writtenSnapshots, 1);
  assert.equal(result.invalidSnapshots, 1);
  assert.equal(result.skippedRows, 1);
  assert.deepEqual(result.wroteFiles, [result.outputPath]);
  assert.equal((await readFile(result.outputPath, "utf8")).trim(), JSON.stringify(row));
});

test("missing input file returns blocker", async () => {
  const fixture = await tempFixture();

  const result = await collectD8SnapshotsLocalOnly(fixture);

  assert.equal(result.inputRows, 0);
  assert.deepEqual(result.blockers, ["input_file_missing"]);
  assert.equal(result.writtenSnapshots, 0);
});

test("invalid snapshot is counted and not written", async () => {
  const fixture = await tempFixture();
  await writeJsonl(fixture.inputPath, [
    { d8PointInTimeSnapshot: canonicalRow({ sourceTimeframe: "4H" as "5M" }) },
  ]);

  const result = await collectD8SnapshotsLocalOnly({ ...fixture, apply: true });

  assert.equal(result.snapshotsFound, 1);
  assert.equal(result.validSnapshots, 0);
  assert.equal(result.invalidSnapshots, 1);
  assert.equal(result.writtenSnapshots, 0);
  assert.equal(existsSync(fixture.outputRoot), false);
});

test("duplicate evaluatedAt is counted deterministically", async () => {
  const fixture = await tempFixture();
  const row = canonicalRow();
  await writeJsonl(fixture.inputPath, [
    { d8PointInTimeSnapshot: row },
    { d8PointInTimeSnapshot: row },
  ]);

  const result = await collectD8SnapshotsLocalOnly({ ...fixture, apply: true });

  assert.equal(result.snapshotsFound, 2);
  assert.equal(result.validSnapshots, 1);
  assert.equal(result.duplicateSnapshots, 1);
  assert.equal(result.writtenSnapshots, 1);
  assert.equal((await readFile(result.outputPath, "utf8")).trim().split(/\r?\n/).length, 1);
});

test("rejects unsafe output roots with blockers", async () => {
  const fixture = await tempFixture();
  await writeJsonl(fixture.inputPath, [{ d8PointInTimeSnapshot: canonicalRow() }]);

  const cases = [
    { outputRoot: join(fixture.activeRepoRoot, "dashboard", "tmp", "d8-snapshots"), blocker: "output_root_inside_active_repo" },
    { outputRoot: join(fixture.approvedLocalMirrorRoot, "dashboard", "tmp", "other"), blocker: "output_root_not_approved_d8_snapshot_path" },
    { outputRoot: join(fixture.approvedLocalMirrorRoot, "research-packs", "d8-snapshots"), blocker: "output_root_forbidden_path" },
    { outputRoot: join(fixture.approvedLocalMirrorRoot, "research-runs", "d8-snapshots"), blocker: "output_root_forbidden_path" },
    { outputRoot: join(fixture.approvedLocalMirrorRoot, "source", "dashboard", "tmp", "d8-snapshots"), blocker: "output_root_forbidden_path" },
    { outputRoot: join(fixture.approvedLocalMirrorRoot, "staging", "dashboard", "tmp", "d8-snapshots"), blocker: "output_root_forbidden_path" },
    { outputRoot: join(fixture.approvedLocalMirrorRoot, "server", "dashboard", "tmp", "d8-snapshots"), blocker: "output_root_forbidden_path" },
  ];

  for (const item of cases) {
    const result = await collectD8SnapshotsLocalOnly({ ...fixture, outputRoot: item.outputRoot, apply: true });
    assert.equal(result.blockers.includes(item.blocker), true);
    assert.equal(result.writtenSnapshots, 0);
  }
});

test("row nested at diagnostics d8PointInTimeSnapshot is accepted", async () => {
  const fixture = await tempFixture();
  await writeJsonl(fixture.inputPath, [
    { diagnostics: { d8PointInTimeSnapshot: canonicalRow() } },
  ]);

  const result = await collectD8SnapshotsLocalOnly(fixture);

  assert.equal(result.snapshotsFound, 1);
  assert.equal(result.validSnapshots, 1);
  assert.equal(result.skippedRows, 0);
});

test("rows without snapshot are skipped", async () => {
  const fixture = await tempFixture();
  await writeJsonl(fixture.inputPath, [{ other: true }, { diagnostics: {} }]);

  const result = await collectD8SnapshotsLocalOnly(fixture);

  assert.equal(result.inputRows, 2);
  assert.equal(result.snapshotsFound, 0);
  assert.equal(result.skippedRows, 2);
});

test("unsafe activation flags are rejected", async () => {
  const fixture = await tempFixture();
  await writeJsonl(fixture.inputPath, [
    { d8PointInTimeSnapshot: canonicalRow({ activationAllowed: true as false }) },
  ]);

  const result = await collectD8SnapshotsLocalOnly({ ...fixture, apply: true });

  assert.equal(result.invalidSnapshots, 1);
  assert.equal(result.warnings.some((warning) => warning.includes("activation_allowed_must_be_false")), true);
  assert.equal(result.writtenSnapshots, 0);
});

test("report contains exact counters and fields", async () => {
  const fixture = await tempFixture();
  const duplicate = canonicalRow();
  await writeJsonl(fixture.inputPath, [
    { d8PointInTimeSnapshot: duplicate },
    { d8PointInTimeSnapshot: duplicate },
    { diagnostics: { d8PointInTimeSnapshot: canonicalRow({ evaluatedAt: "2026-06-30T00:05:00.000Z" }) } },
    { d8PointInTimeSnapshot: canonicalRow({ evaluatedAt: "invalid" }) },
    { other: "skip" },
  ]);

  const result = await collectD8SnapshotsLocalOnly(fixture);

  assert.deepEqual(
    {
      mode: result.mode,
      inputRows: result.inputRows,
      snapshotsFound: result.snapshotsFound,
      validSnapshots: result.validSnapshots,
      writtenSnapshots: result.writtenSnapshots,
      invalidSnapshots: result.invalidSnapshots,
      duplicateSnapshots: result.duplicateSnapshots,
      skippedRows: result.skippedRows,
      wroteFiles: result.wroteFiles,
      blockers: result.blockers,
    },
    {
      mode: "DRY_RUN",
      inputRows: 5,
      snapshotsFound: 4,
      validSnapshots: 2,
      writtenSnapshots: 0,
      invalidSnapshots: 1,
      duplicateSnapshots: 1,
      skippedRows: 1,
      wroteFiles: [],
      blockers: [],
    },
  );
  assert.equal(result.outputPath.endsWith("d8_snapshots.jsonl"), true);
  assert.equal(Array.isArray(result.warnings), true);
});

test("collector source avoids blocked runtime surfaces and locked roadmap terms", async () => {
  const source = await readFile(new URL("./collect-d8-snapshots-local-only.ts", import.meta.url), "utf8");
  const blockedImportTerms = [
    "bro" + "ker",
    "or" + "der",
    "exec" + "ution",
    "a" + "pi",
    "en" + "v",
    "conf" + "ig",
    "sec" + "ret",
    "net" + "work",
  ].join("|");
  const blockedRuntimeTerms = [
    "fet" + "ch",
    "XML" + "HttpRequest",
    "create" + "Or" + "der",
    "place" + "Or" + "der",
    "acti" + "vate",
    "private[-_ ]?exchange",
  ].join("|");
  const lockedRoadmapTerms = ["D8" + "\\.5", "continu" + "ation"].join("|");
  assert.doesNotMatch(source, new RegExp(`from\\s+["'][^"']*(${blockedImportTerms})`, "i"));
  assert.doesNotMatch(source, new RegExp(`\\b(${blockedRuntimeTerms})\\b`, "i"));
  assert.doesNotMatch(source, new RegExp(`\\b(${lockedRoadmapTerms})\\b`, "i"));
});
