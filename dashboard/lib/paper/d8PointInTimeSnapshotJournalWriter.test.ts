import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  D8_POINT_IN_TIME_SNAPSHOT_SOURCE,
  type D8PointInTimeSnapshot,
} from "./d8PointInTimeSnapshot.ts";
import {
  appendD8PointInTimeSnapshot,
  D8_SNAPSHOT_JOURNAL_FILENAME,
  validateD8SnapshotJournalPath,
  validateD8SnapshotOutputRoot,
} from "./d8PointInTimeSnapshotJournalWriter.ts";

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
  outputRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "d8-snapshot-writer-"));
  const activeRepoRoot = join(root, "repo");
  const approvedLocalMirrorRoot = join(root, "mirror", "httpdocs");
  const outputRoot = join(approvedLocalMirrorRoot, "dashboard", "tmp", "d8-snapshots");
  return { activeRepoRoot, approvedLocalMirrorRoot, outputRoot };
}

test("rejects outputRoot inside active repo", async () => {
  const fixture = await tempFixture();
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: fixture.activeRepoRoot,
      approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
      outputRoot: join(fixture.activeRepoRoot, "dashboard", "tmp", "d8-snapshots"),
    }),
    /output_root_inside_active_repo/,
  );
});

test("requires explicit active repo mirror and output roots", async () => {
  const fixture = await tempFixture();
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: "",
      approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
      outputRoot: fixture.outputRoot,
    }),
    /active_repo_root_required/,
  );
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: fixture.activeRepoRoot,
      approvedLocalMirrorRoot: "",
      outputRoot: fixture.outputRoot,
    }),
    /approved_local_mirror_root_required/,
  );
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: fixture.activeRepoRoot,
      approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
      outputRoot: "",
    }),
    /output_root_required/,
  );
});

test("rejects outputRoot outside approved local mirror d8-snapshots path", async () => {
  const fixture = await tempFixture();
  assert.throws(
    () => validateD8SnapshotOutputRoot({
      activeRepoRoot: fixture.activeRepoRoot,
      approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
      outputRoot: join(fixture.approvedLocalMirrorRoot, "dashboard", "tmp", "other-d8-snapshots"),
    }),
    /output_root_not_approved_d8_snapshot_path/,
  );
});

test("rejects research-packs and research-runs outputRoot", async () => {
  const fixture = await tempFixture();
  for (const blocked of ["research-packs", "research-runs"]) {
    assert.throws(
      () => validateD8SnapshotOutputRoot({
        activeRepoRoot: fixture.activeRepoRoot,
        approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
        outputRoot: join(fixture.approvedLocalMirrorRoot, blocked, "d8-snapshots"),
      }),
      /output_root_forbidden_path/,
    );
  }
});

test("rejects source staging and server-like outputRoot", async () => {
  const fixture = await tempFixture();
  for (const blocked of ["source", "staging", "server"]) {
    assert.throws(
      () => validateD8SnapshotOutputRoot({
        activeRepoRoot: fixture.activeRepoRoot,
        approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
        outputRoot: join(fixture.approvedLocalMirrorRoot, blocked, "dashboard", "tmp", "d8-snapshots"),
      }),
      /output_root_forbidden_path/,
    );
  }
});

test("rejects non-jsonl journal filename", async () => {
  const fixture = await tempFixture();
  assert.throws(
    () => validateD8SnapshotJournalPath({
      activeRepoRoot: fixture.activeRepoRoot,
      approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
      outputRoot: fixture.outputRoot,
      fileName: "d8_snapshots.json",
    }),
    /journal_filename_must_be_jsonl/,
  );
});

test("rejects output file outside approved d8-snapshots directory", async () => {
  const fixture = await tempFixture();
  assert.throws(
    () => validateD8SnapshotJournalPath({
      activeRepoRoot: fixture.activeRepoRoot,
      approvedLocalMirrorRoot: fixture.approvedLocalMirrorRoot,
      outputRoot: fixture.outputRoot,
      fileName: "../d8_snapshots.jsonl",
    }),
    /journal_path_escaped_output_root/,
  );
});

test("rejects invalid canonical snapshot before write", async () => {
  const fixture = await tempFixture();
  await assert.rejects(
    () => appendD8PointInTimeSnapshot({
      ...fixture,
      row: canonicalRow({ evaluatedAt: "invalid" }),
    }),
    /invalid_timestamp:evaluatedAt/,
  );
  assert.equal(existsSync(fixture.outputRoot), false);
});

test("writes exactly one canonical JSONL row in temp approved mirror fixture", async () => {
  const fixture = await tempFixture();
  const row = canonicalRow();

  const result = await appendD8PointInTimeSnapshot({ ...fixture, row });

  assert.equal(result.wrote, true);
  assert.equal(result.filePath.endsWith(D8_SNAPSHOT_JOURNAL_FILENAME), true);
  const text = await readFile(result.filePath, "utf8");
  assert.equal(text, `${JSON.stringify(row)}\n`);
});

test("validates row before write and preserves safety flags exactly", async () => {
  const fixture = await tempFixture();
  const unsafeRow = canonicalRow({ activationAllowed: true as false });

  await assert.rejects(
    () => appendD8PointInTimeSnapshot({ ...fixture, row: unsafeRow }),
    /activation_allowed_must_be_false/,
  );

  const safeRow = canonicalRow({ evaluatedAt: "2026-06-30T00:05:00.000Z" });
  const result = await appendD8PointInTimeSnapshot({ ...fixture, row: safeRow });
  const [line] = (await readFile(result.filePath, "utf8")).trim().split(/\r?\n/);
  const written = JSON.parse(line ?? "{}") as D8PointInTimeSnapshot;
  assert.equal(written.activationAllowed, false);
  assert.equal(written.paperActivationAllowed, false);
  assert.equal(written.liveActivationAllowed, false);
  assert.equal(written.reviewOnly, true);
  assert.equal(written.shadowOnly, true);
});

test("rejects duplicate evaluatedAt append", async () => {
  const fixture = await tempFixture();
  const row = canonicalRow();

  await appendD8PointInTimeSnapshot({ ...fixture, row });

  await assert.rejects(
    () => appendD8PointInTimeSnapshot({ ...fixture, row }),
    /duplicate_evaluatedAt/,
  );
});

test("does not mutate input snapshot", async () => {
  const fixture = await tempFixture();
  const row = canonicalRow();
  const before = JSON.stringify(row);

  await appendD8PointInTimeSnapshot({ ...fixture, row });

  assert.equal(JSON.stringify(row), before);
});

test("creates directory only after explicit write call", async () => {
  const fixture = await tempFixture();

  validateD8SnapshotOutputRoot(fixture);

  assert.equal(existsSync(fixture.outputRoot), false);
  await appendD8PointInTimeSnapshot({ ...fixture, row: canonicalRow() });
  assert.equal(existsSync(fixture.outputRoot), true);
});

test("rejects malformed existing JSONL instead of overwriting", async () => {
  const fixture = await tempFixture();
  await mkdir(fixture.outputRoot, { recursive: true });
  await writeFile(join(fixture.outputRoot, D8_SNAPSHOT_JOURNAL_FILENAME), "{malformed}\n", "utf8");

  await assert.rejects(
    () => appendD8PointInTimeSnapshot({ ...fixture, row: canonicalRow() }),
    /existing_journal_malformed_jsonl/,
  );
});

test("writer source avoids blocked runtime surfaces and locked roadmap terms", async () => {
  const source = await readFile(new URL("./d8PointInTimeSnapshotJournalWriter.ts", import.meta.url), "utf8");
  const blockedImportTerms = [
    "bro" + "ker",
    "or" + "der",
    "exec" + "ution",
    "a" + "pi",
    "en" + "v",
    "conf" + "ig",
    "sec" + "ret",
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
