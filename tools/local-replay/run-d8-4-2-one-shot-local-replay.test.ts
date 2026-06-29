import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseReplayArgs,
  runOneShotReplay,
  validateReplayPaths,
} from "./run-d8-4-2-one-shot-local-replay.ts";

type PackFixtureOptions = {
  omitFile?: string;
  unsafeActivation?: boolean;
  contaminate5mDelta?: boolean;
};

const requiredOutputFiles = [
  "replay_manifest.json",
  "replay_summary.json",
  "replay_events.jsonl",
  "replay_limitations.json",
  "replay_safety_audit.json",
];

async function makeTempRoot() {
  return await mkdtemp(path.join(tmpdir(), "l7-local-replay-test-"));
}

function candleRows(count: number, stepMinutes: number, contaminateDelta = false) {
  const start = Date.UTC(2026, 5, 20, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const effectiveStep = contaminateDelta && index > 5 ? stepMinutes + 10 : stepMinutes;
    const timestamp = start + index * effectiveStep * 60_000;

    return {
      openTime: new Date(timestamp).toISOString(),
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
      volume: 10 + index,
    };
  });
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: readonly unknown[]) {
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function createInputPack(root: string, options: PackFixtureOptions = {}) {
  const packPath = path.join(root, "mirror", "httpdocs", "research-packs", "d8-4-2-replay-input");
  await mkdir(packPath, { recursive: true });

  const manifest = {
    schemaVersion: 1,
    source: "D8_4_2_REPLAY_INPUT_PACK_V1",
    createdAt: "2026-06-29T00:00:00.000Z",
    localMirrorRoot: path.join(root, "mirror", "httpdocs"),
    mirrorLastSyncAt: "2026-06-29T00:00:00.000Z",
    timeframesIncluded: ["5M", "15M", "1H"],
    startAt: "2026-06-20T00:00:00.000Z",
    endAt: "2026-06-20T16:30:00.000Z",
    candleCounts: {
      "5M": 199,
      "15M": 199,
      "1H": 199,
    },
    snapshotCounts: {
      latestDecision: 1,
      marketSnapshot: 1,
      d8Diagnostics: 0,
    },
    dataQualityStatus: "USABLE_FOR_REPLAY",
    blockers: [],
    nextAction: "Proceed to L7 one-shot local replay planning.",
    activationAllowed: options.unsafeActivation === true,
    paperActivationAllowed: false,
    liveActivationAllowed: false,
    reviewOnly: true,
    shadowOnly: true,
  };

  const dataQuality = {
    dataQualityStatus: "USABLE_FOR_REPLAY",
    blockers: [],
    warnings: ["d8_snapshots.jsonl is empty"],
    recommendedNextAction: "Run one-shot local replay.",
  };

  const files = new Map<string, () => Promise<void>>([
    ["manifest.json", () => writeJson(path.join(packPath, "manifest.json"), manifest)],
    [
      "source_file_inventory.json",
      () =>
        writeJson(path.join(packPath, "source_file_inventory.json"), {
          source: "D8_4_2_REPLAY_INPUT_PACK_V1",
          files: [],
        }),
    ],
    ["data_quality_report.json", () => writeJson(path.join(packPath, "data_quality_report.json"), dataQuality)],
    ["candles_5m.jsonl", () => writeJsonl(path.join(packPath, "candles_5m.jsonl"), candleRows(199, 5, options.contaminate5mDelta))],
    ["candles_15m.jsonl", () => writeJsonl(path.join(packPath, "candles_15m.jsonl"), candleRows(199, 15))],
    ["candles_1h.jsonl", () => writeJsonl(path.join(packPath, "candles_1h.jsonl"), candleRows(199, 60))],
    ["d8_snapshots.jsonl", () => writeFile(path.join(packPath, "d8_snapshots.jsonl"), "", "utf8")],
  ]);

  for (const [fileName, writer] of files) {
    if (fileName !== options.omitFile) {
      await writer();
    }
  }

  return packPath;
}

async function hashPackFiles(packPath: string) {
  const hashes = new Map<string, string>();
  for (const fileName of await readdir(packPath)) {
    const filePath = path.join(packPath, fileName);
    const contents = await readFile(filePath);
    hashes.set(fileName, createHash("sha256").update(contents).digest("hex"));
  }
  return hashes;
}

test("requires explicit input pack, output root, and one-shot flag", () => {
  assert.throws(() => parseReplayArgs([]), /--input-pack/);
  assert.throws(() => parseReplayArgs(["--input-pack", "x", "--one-shot"]), /--output-root/);
  assert.throws(() => parseReplayArgs(["--input-pack", "x", "--output-root", "y"]), /--one-shot/);

  assert.deepEqual(parseReplayArgs(["--input-pack", "x", "--output-root", "y", "--one-shot"]), {
    inputPack: "x",
    outputRoot: "y",
    oneShot: true,
  });
});

test("rejects input pack or output root inside active repo", () => {
  const activeRepoRoot = process.cwd();

  assert.throws(
    () =>
      validateReplayPaths({
        inputPack: path.join(activeRepoRoot, "research-packs", "pack"),
        outputRoot: path.join(tmpdir(), "safe-output"),
        oneShot: true,
        activeRepoRoot,
      }),
    /inside active repo/,
  );

  assert.throws(
    () =>
      validateReplayPaths({
        inputPack: path.join(tmpdir(), "safe-pack"),
        outputRoot: path.join(activeRepoRoot, "research-runs", "run"),
        oneShot: true,
        activeRepoRoot,
      }),
    /inside active repo/,
  );
});

test("rejects missing pack files", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot, { omitFile: "candles_1h.jsonl" });
    await assert.rejects(
      () =>
        runOneShotReplay({
          inputPack,
          outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7"),
          oneShot: true,
          activeRepoRoot: process.cwd(),
        }),
      /missing required pack file/i,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rejects unsafe activation flags", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot, { unsafeActivation: true });
    await assert.rejects(
      () =>
        runOneShotReplay({
          inputPack,
          outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7"),
          oneShot: true,
          activeRepoRoot: process.cwd(),
        }),
      /unsafe activation flag/i,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rejects contaminated candle deltas", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot, { contaminate5mDelta: true });
    await assert.rejects(
      () =>
        runOneShotReplay({
          inputPack,
          outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7"),
          oneShot: true,
          activeRepoRoot: process.cwd(),
        }),
      /contaminated candle deltas/i,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("writes deterministic replay outputs only under output root", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot);
    const outputRoot = path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7");
    const result = await runOneShotReplay({
      inputPack,
      outputRoot,
      oneShot: true,
      activeRepoRoot: process.cwd(),
    });

    assert.deepEqual((await readdir(outputRoot)).sort(), requiredOutputFiles.sort());
    assert.equal(result.summary.candlesConsumed["5M"], 199);
    assert.equal(result.summary.candlesConsumed["15M"], 199);
    assert.equal(result.summary.candlesConsumed["1H"], 199);
    assert.equal(result.summary.evaluationPoints, 199);
    assert.equal(result.summary.edgeStatus, "EDGE_UNPROVEN_NO_CLOSED_CYCLES");
    assert.equal(result.limitations.d8SnapshotsMissing, true);
    assert.equal(result.limitations.sampleBelow500, true);
    assert.equal(result.limitations.noD8_5Approval, true);
    assert.equal(result.limitations.noContinuationApproval, true);
    assert.equal(result.limitations.noActivationAllowed, true);
    assert.equal(result.limitations.profitabilityNotClaimed, true);

    const summary = JSON.parse(await readFile(path.join(outputRoot, "replay_summary.json"), "utf8"));
    assert.equal(summary.closedCycleCount, 0);
    assert.equal(summary.expectancy, null);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("d8 snapshots missing is a limitation, not a failure", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot);
    const result = await runOneShotReplay({
      inputPack,
      outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7"),
      oneShot: true,
      activeRepoRoot: process.cwd(),
    });

    assert.equal(result.limitations.d8SnapshotsMissing, true);
    assert.equal(result.summary.missingEvidenceFields.includes("d8_snapshots"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("no closed cycles leaves edge unproven without failing the run", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot);
    const result = await runOneShotReplay({
      inputPack,
      outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7"),
      oneShot: true,
      activeRepoRoot: process.cwd(),
    });

    assert.equal(result.summary.closedCycleCount, 0);
    assert.equal(result.summary.expectancy, null);
    assert.equal(result.summary.edgeStatus, "EDGE_UNPROVEN_NO_CLOSED_CYCLES");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("repeated runs on the same fixture are deterministic", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot);
    const first = await runOneShotReplay({
      inputPack,
      outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7-a"),
      oneShot: true,
      activeRepoRoot: process.cwd(),
    });
    const second = await runOneShotReplay({
      inputPack,
      outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7-b"),
      oneShot: true,
      activeRepoRoot: process.cwd(),
    });

    assert.deepEqual(first.summary, second.summary);
    assert.deepEqual(first.events, second.events);
    assert.deepEqual(first.limitations, second.limitations);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("does not mutate the input pack", async () => {
  const tempRoot = await makeTempRoot();
  try {
    const inputPack = await createInputPack(tempRoot);
    const before = await hashPackFiles(inputPack);

    await runOneShotReplay({
      inputPack,
      outputRoot: path.join(tempRoot, "mirror", "httpdocs", "research-runs", "l7"),
      oneShot: true,
      activeRepoRoot: process.cwd(),
    });

    assert.deepEqual(await hashPackFiles(inputPack), before);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("implementation avoids forbidden runtime integration imports", async () => {
  const source = await readFile(path.join(process.cwd(), "tools", "local-replay", "run-d8-4-2-one-shot-local-replay.ts"), "utf8");
  const forbiddenPatterns = [
    /process\.env/,
    /PaperBrokerAdapter/,
    /exchange/i,
    /config\/db\.php/i,
    /config\\db\.php/i,
    /app\/api/i,
    /broker/i,
    /execution/i,
    /order/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern);
  }
});
