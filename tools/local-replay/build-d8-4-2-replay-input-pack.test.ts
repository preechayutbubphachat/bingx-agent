import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildReplayInputPack,
  classifyDataQuality,
  classifyHistoricalPackTimeframe,
  normalizeCandlesForPack,
  plannedPackFiles,
  type DataQualityStatus,
  type ReplayPackTimeframe,
  type ReplayInputPackManifest,
} from "./build-d8-4-2-replay-input-pack.ts";

const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);

async function tempRoot(prefix = "d8-pack-") {
  return await mkdtemp(join(tmpdir(), prefix));
}

function candle(index: number, overrides: Record<string, unknown> = {}) {
  return {
    timeframe: "5M",
    openTime: new Date(BASE + index * 5 * 60_000).toISOString(),
    closeTime: new Date(BASE + (index + 1) * 5 * 60_000).toISOString(),
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 10 + index,
    complete: true,
    ...overrides,
  };
}

function candleFor(timeframe: ReplayPackTimeframe, index: number, overrides: Record<string, unknown> = {}) {
  const minutes = timeframe === "5M" ? 5 : timeframe === "15M" ? 15 : 60;
  return {
    timeframe,
    openTime: new Date(BASE + index * minutes * 60_000).toISOString(),
    closeTime: new Date(BASE + (index + 1) * minutes * 60_000).toISOString(),
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 10 + index,
    complete: true,
    ...overrides,
  };
}

async function writeJsonl(path: string, rows: readonly unknown[]) {
  await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function writeJson(path: string, rows: readonly unknown[]) {
  await writeFile(path, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

async function fixtureMirror(candles: readonly unknown[] = [candle(0), candle(1), candle(2)]) {
  const root = await tempRoot();
  await writeFile(join(root, "market_snapshot.json"), JSON.stringify({ observedAt: new Date(BASE).toISOString() }), "utf8");
  await writeFile(join(root, "latest_decision.json"), JSON.stringify({ evaluatedAt: new Date(BASE).toISOString() }), "utf8");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(join(root, "dashboard/tmp/historical-packs"), { recursive: true }));
  await writeJsonl(join(root, "dashboard/tmp/historical-packs/candles_5m.jsonl"), candles);
  return root;
}

test("dry-run writes nothing and reports planned files", async () => {
  const root = await fixtureMirror();
  const result = await buildReplayInputPack({ localMirrorRoot: root });

  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.wroteFiles.length, 0);
  assert.equal(existsSync(join(root, "research-packs")), false);
  assert.deepEqual(result.plannedOutputFiles, plannedPackFiles(root));
});

test("refuses repo-root output and server-like output paths", async () => {
  await assert.rejects(
    () => buildReplayInputPack({ localMirrorRoot: process.cwd() }),
    /outside the Git repository/,
  );
  await assert.rejects(
    () => buildReplayInputPack({ localMirrorRoot: "server:/var/www/vhosts/ob-gate.com/httpdocs" }),
    /server-like/,
  );
  await assert.rejects(
    () => buildReplayInputPack({ localMirrorRoot: "" }),
    /required/,
  );
});

test("refuses forbidden files under the local mirror root", async () => {
  const root = await fixtureMirror();
  await writeFile(join(root, ".env"), "SECRET=value", "utf8");

  await assert.rejects(
    () => buildReplayInputPack({ localMirrorRoot: root }),
    /Forbidden mirror files detected/,
  );
});

test("normalizes finite OHLC, sorts, dedupes, excludes incomplete candles, and preserves source immutability", () => {
  const rows = [
    candle(2),
    candle(1, { close: 101.25 }),
    candle(1, { close: 101.75 }),
    candle(3, { complete: false }),
    candle(4, { high: Number.NaN }),
  ];
  const before = structuredClone(rows);

  const result = normalizeCandlesForPack(rows, {
    timeframe: "5M",
    sourceFile: "fixture.jsonl",
    nowMs: BASE + 60 * 60_000,
  });

  assert.deepEqual(rows, before);
  assert.equal(result.candles.length, 2);
  assert.deepEqual(result.candles.map((item) => item.openTime), [
    new Date(BASE + 1 * 5 * 60_000).toISOString(),
    new Date(BASE + 2 * 5 * 60_000).toISOString(),
  ]);
  assert.equal(result.candles[0]?.close, 101.75);
  assert.equal(result.excludedIncompleteCount, 1);
  assert.equal(result.invalidOhlcCount, 1);
  assert.equal(result.duplicateTimestampCount, 1);
});

test("detects gaps, future timestamps, and timeframe mismatches", () => {
  const future = candle(30, {
    openTime: new Date(BASE + 30 * 5 * 60_000).toISOString(),
    closeTime: new Date(BASE + 31 * 5 * 60_000).toISOString(),
  });
  const mismatch = candle(4, {
    closeTime: new Date(BASE + 4 * 5 * 60_000 + 15 * 60_000).toISOString(),
  });

  const result = normalizeCandlesForPack([candle(0), candle(6), future, mismatch], {
    timeframe: "5M",
    sourceFile: "fixture.jsonl",
    nowMs: BASE + 60 * 60_000,
  });

  assert.equal(result.gapCount > 0, true);
  assert.equal(result.futureTimestampCount, 1);
  assert.equal(result.timeframeMismatchCount, 1);
});

test("classifies data quality readiness states", () => {
  const cases: Array<[DataQualityStatus, Parameters<typeof classifyDataQuality>[0]]> = [
    ["NO_INPUT", { totalCandles: 0, blockers: [], hasQualityBlocker: false }],
    ["INSUFFICIENT_HISTORY", { totalCandles: 10, blockers: [], hasQualityBlocker: false }],
    ["USABLE_FOR_REPLAY", { totalCandles: 500, blockers: [], hasQualityBlocker: false }],
    ["DATA_QUALITY_BLOCKED", { totalCandles: 500, blockers: ["FUTURE_TIMESTAMP"], hasQualityBlocker: true }],
  ];

  for (const [expected, input] of cases) {
    assert.equal(classifyDataQuality(input), expected);
  }
});

test("classifies historical-pack filenames using strict timeframe tokens", () => {
  assert.equal(classifyHistoricalPackTimeframe("klines_15m.json"), "15M");
  assert.equal(classifyHistoricalPackTimeframe("klines_15min.json"), "15M");
  assert.equal(classifyHistoricalPackTimeframe("klines_5m.json"), "5M");
  assert.equal(classifyHistoricalPackTimeframe("klines_5min.json"), "5M");
  assert.equal(classifyHistoricalPackTimeframe("klines_1h.json"), "1H");
  assert.equal(classifyHistoricalPackTimeframe("klines_15m_5m.json"), null);
  assert.equal(classifyHistoricalPackTimeframe("klines.json"), null);
});

test("historical-pack timeframe matching keeps 15M data out of 5M output", async () => {
  const root = await fixtureMirror([]);
  const historicalRoot = join(root, "dashboard/tmp/historical-packs");
  await writeJson(join(historicalRoot, "klines_5m.json"), Array.from({ length: 199 }, (_, index) => candleFor("5M", index)));
  await writeJson(join(historicalRoot, "klines_15m.json"), Array.from({ length: 199 }, (_, index) => candleFor("15M", index)));
  await writeJson(join(historicalRoot, "klines_1h.json"), Array.from({ length: 199 }, (_, index) => candleFor("1H", index)));

  const result = await buildReplayInputPack({ localMirrorRoot: root, apply: true });

  assert.deepEqual(result.manifest.candleCounts, { "5M": 199, "15M": 199, "1H": 199 });
  const packRoot = join(root, "research-packs/d8-4-2-replay-input");
  const fiveMinuteRows = (await readFile(join(packRoot, "candles_5m.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(fiveMinuteRows.length, 199);
  assert.equal(
    fiveMinuteRows.some((row) => Date.parse(row.closeTime) - Date.parse(row.openTime) !== 5 * 60_000),
    false,
  );
  const inventory = JSON.parse(await readFile(join(packRoot, "source_file_inventory.json"), "utf8"));
  const historicalEntries = inventory.files.filter((entry: { relativePath: string }) => entry.relativePath.includes("historical-packs"));
  assert.deepEqual(
    historicalEntries.map((entry: { relativePath: string }) => entry.relativePath).sort(),
    [
      "dashboard/tmp/historical-packs/candles_5m.jsonl",
      "dashboard/tmp/historical-packs/klines_15m.json",
      "dashboard/tmp/historical-packs/klines_1h.json",
      "dashboard/tmp/historical-packs/klines_5m.json",
    ],
  );
});

test("apply writes only expected pack files under local mirror root with manifest safety literals", async () => {
  const root = await fixtureMirror(Array.from({ length: 500 }, (_, index) => candle(index)));
  const sourceBefore = await stat(join(root, "dashboard/tmp/historical-packs/candles_5m.jsonl"));
  const result = await buildReplayInputPack({ localMirrorRoot: root, apply: true });

  assert.equal(result.mode, "APPLY");
  assert.deepEqual(result.wroteFiles.sort(), plannedPackFiles(root).sort());
  for (const file of result.wroteFiles) {
    assert.equal(file.startsWith(join(root, "research-packs", "d8-4-2-replay-input")), true);
    assert.equal(existsSync(file), true);
  }

  const manifest = JSON.parse(await readFile(join(root, "research-packs/d8-4-2-replay-input/manifest.json"), "utf8")) as ReplayInputPackManifest;
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.source, "D8_4_2_REPLAY_INPUT_PACK_V1");
  assert.equal(manifest.activationAllowed, false);
  assert.equal(manifest.paperActivationAllowed, false);
  assert.equal(manifest.liveActivationAllowed, false);
  assert.equal(manifest.reviewOnly, true);
  assert.equal(manifest.shadowOnly, true);
  assert.equal(manifest.dataQualityStatus, "USABLE_FOR_REPLAY");

  const sourceAfter = await stat(join(root, "dashboard/tmp/historical-packs/candles_5m.jsonl"));
  assert.equal(sourceAfter.mtimeMs, sourceBefore.mtimeMs);
});

test("source inventory and data quality report schemas separate missing D8 snapshots from candles", async () => {
  const root = await fixtureMirror([candle(0)]);
  const result = await buildReplayInputPack({ localMirrorRoot: root, apply: true });
  const packRoot = join(root, "research-packs/d8-4-2-replay-input");
  const inventory = JSON.parse(await readFile(join(packRoot, "source_file_inventory.json"), "utf8"));
  const report = JSON.parse(await readFile(join(packRoot, "data_quality_report.json"), "utf8"));

  assert.equal(Array.isArray(inventory.files), true);
  assert.equal(typeof report.candleCounts["5M"], "number");
  assert.equal(typeof report.missingD8Snapshots, "boolean");
  assert.equal(report.missingD8Snapshots, true);
  assert.equal(result.manifest.dataQualityStatus, "INSUFFICIENT_HISTORY");
});

test("does not expose network, server, API, exchange, scheduler, or service behavior", async () => {
  const source = await readFile(new URL("./build-d8-4-2-replay-input-pack.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\baxios\b/);
  assert.doesNotMatch(source, /\bhttp:\/\/|\bhttps:\/\//);
  assert.doesNotMatch(source, /\bNew-Service\b|\bRegister-ScheduledTask\b|\bschtasks\b/i);
  assert.doesNotMatch(source, /exchange|private api/i);
});
