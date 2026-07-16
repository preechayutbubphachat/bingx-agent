import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AcquisitionError,
  APPROVED_EVALUATION_BOUNDARY,
  APPROVED_MARKET_TYPE,
  APPROVED_SYMBOL,
  APPROVED_WINDOWS,
  buildAcquisitionManifest,
  buildBoundedAcquisitionPlan,
  buildPublicKlineRequest,
  buildRequestPlanManifest,
  classifyPublicTransportFailure,
  generateExpectedOpenTimes,
  main,
  normalizeAcquiredCandles,
  parseAcquireD8PublicCandlesArgs,
  parsePublicKlineResponse,
  planAtomicApply,
  runAcquireD8PublicCandles,
  validateExactCandleCoverage,
} from "./acquire-d8-public-candles.ts";

type Timeframe = "5M" | "15M" | "1H";

const ALL_TIMEFRAMES: Timeframe[] = ["5M", "15M", "1H"];

function approvedArgs(extra: string[] = []): string[] {
  return [
    "--evaluation-boundary",
    APPROVED_EVALUATION_BOUNDARY,
    "--symbol",
    APPROVED_SYMBOL,
    "--market-type",
    APPROVED_MARKET_TYPE,
    "--timeframes",
    "5M,15M,1H",
    "--source-pack-root",
    "C:/fixture/historical-packs",
    ...extra,
  ];
}

function plan(timeframe: Timeframe = "5M") {
  return buildBoundedAcquisitionPlan({
    evaluationBoundary: APPROVED_EVALUATION_BOUNDARY,
    symbol: APPROVED_SYMBOL,
    marketType: APPROVED_MARKET_TYPE,
    timeframes: [timeframe],
    sourcePackRoot: "C:/fixture/historical-packs",
  }).requests[0];
}

function rawRows(timeframe: Timeframe = "5M") {
  const request = plan(timeframe);
  return generateExpectedOpenTimes(request).map((openTime, index) => [
    openTime,
    "100",
    "102",
    "99",
    "101",
    "10",
    openTime + request.intervalMs,
    "0",
    index,
    "0",
    "0",
  ]);
}

function responseFor(timeframe: Timeframe = "5M", rows = rawRows(timeframe)) {
  return JSON.stringify({ code: 0, msg: "", data: rows });
}

function blockers(error: unknown): string[] {
  assert.ok(error instanceof AcquisitionError);
  return error.blockers;
}

async function rejectsWithBlocker(
  action: () => unknown | Promise<unknown>,
  expected: string,
) {
  await assert.rejects(action, (error) => blockers(error).includes(expected));
}

function mockTransport(overrides: Partial<Record<Timeframe, unknown>> = {}) {
  const calls: Array<{ url: string; init: unknown }> = [];
  const transport = async (url: string, init: unknown) => {
    calls.push({ url, init });
    const publicInterval = new URL(url).searchParams.get("interval");
    const interval = ({ "5m": "5M", "15m": "15M", "1h": "1H" } as const)[publicInterval as "5m" | "15m" | "1h"];
    const override = overrides[interval];
    if (override instanceof Error) throw override;
    if (override && typeof override === "object" && "status" in override) {
      return override as { status: number; bodyText: string };
    }
    return { status: 200, bodyText: responseFor(interval) };
  };
  return { calls, transport };
}

function inMemoryFs() {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  const calls: string[] = [];
  return {
    calls,
    files,
    directories,
    adapter: {
      async stat(target: string) {
        calls.push(`stat:${target}`);
        if (files.has(target) || directories.has(target)) return { exists: true };
        return { exists: false };
      },
      async mkdir(target: string) {
        calls.push(`mkdir:${target}`);
        directories.add(target);
      },
      async writeFile(target: string, bytes: Uint8Array) {
        calls.push(`write:${target}`);
        files.set(target, bytes);
      },
      async rename(from: string, to: string) {
        calls.push(`rename:${from}:${to}`);
        directories.delete(from);
        directories.add(to);
        for (const [name, bytes] of [...files]) {
          if (name.startsWith(`${from}${path.sep}`)) {
            files.delete(name);
            files.set(`${to}${name.slice(from.length)}`, bytes);
          }
        }
      },
      async rm(target: string) {
        calls.push(`rm:${target}`);
        directories.delete(target);
        for (const name of [...files.keys()]) {
          if (name === target || name.startsWith(`${target}${path.sep}`)) files.delete(name);
        }
      },
    },
  };
}

function validRunOptions(mode: "plan-only" | "dry-run" | "apply" = "dry-run") {
  return {
    mode,
    evaluationBoundary: APPROVED_EVALUATION_BOUNDARY,
    symbol: APPROVED_SYMBOL,
    marketType: APPROVED_MARKET_TYPE,
    timeframes: ALL_TIMEFRAMES,
    sourcePackRoot: "C:/fixture/historical-packs",
    outputRoot: "C:/approved/acquisition-run",
    runId: "acquisition-run",
    requestTimeoutMs: 5_000,
    maxRetries: 0,
    implementationCommit: "test-commit",
  } as const;
}

// A. CLI and mode contract (10)
test("01 default mode is plan-only", () => {
  assert.equal(parseAcquireD8PublicCandlesArgs(approvedArgs()).mode, "plan-only");
});

test("02 explicit plan-only mode parses", () => {
  assert.equal(parseAcquireD8PublicCandlesArgs(approvedArgs(["--plan-only"])).mode, "plan-only");
});

test("03 dry-run mode parses without apply", () => {
  assert.equal(parseAcquireD8PublicCandlesArgs(approvedArgs(["--dry-run"])).mode, "dry-run");
});

test("04 apply mode requires explicit apply switch", () => {
  assert.equal(parseAcquireD8PublicCandlesArgs(approvedArgs([
    "--apply",
    "--output-root",
    "C:/approved/acquisition-run",
    "--run-id",
    "acquisition-run",
  ])).mode, "apply");
});

test("05 mutually exclusive modes are rejected", () => {
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs(["--dry-run", "--apply"])));
});

test("06 arbitrary origin and endpoint arguments are rejected", () => {
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs(["--origin", "https://example.com"])));
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs(["--endpoint", "/other"])));
});

test("07 non-approved symbol and market type are rejected", () => {
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs().map((v) => v === APPROVED_SYMBOL ? "ETH-USDT" : v)));
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs().map((v) => v === APPROVED_MARKET_TYPE ? "spot" : v)));
});

test("08 non-approved evaluation boundary and timeframe set are rejected", () => {
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs().map((v) => v === APPROVED_EVALUATION_BOUNDARY ? "2026-07-02T22:44:17.000Z" : v)));
  assert.throws(() => parseAcquireD8PublicCandlesArgs(approvedArgs().map((v) => v === "5M,15M,1H" ? "5M" : v)));
});

test("09 implementation source excludes private credentials and trading capabilities", async () => {
  const source = await readFile(new URL("./acquire-d8-public-candles.ts", import.meta.url), "utf8");
  const forbidden = [
    ["process", "env"].join("."),
    ["create", "Hmac"].join(""),
    ["X-BX", "APIKEY"].join("-"),
    ["Author", "ization"].join(""),
    ["BINGX", "API", "KEY"].join("_"),
    ["BINGX", "SECRET", "KEY"].join("_"),
    ["fetch", "Signed"].join(""),
    ["place", "Order"].join(""),
    ["submit", "Order"].join(""),
  ];
  for (const marker of forbidden) assert.equal(source.includes(marker), false, marker);
});

test("10 import is inert and main accepts injected dependencies", async () => {
  const fs = inMemoryFs();
  const result = await main(approvedArgs(), {
    transport: async () => assert.fail("transport must not run"),
    fs: fs.adapter,
    approvedOutputParent: "C:/approved",
    now: () => "2026-07-14T00:00:00.000Z",
    log: () => undefined,
  });
  assert.equal(result.mode, "plan-only");
  assert.deepEqual(fs.calls, []);
});

// B. Bounded plan and public request contract (11)
test("11 bounded plan contains exactly three requests", () => {
  assert.equal(buildBoundedAcquisitionPlan(validRunOptions()).requests.length, 3);
});

test("12 expected 5M sequence has exact endpoints and count", () => {
  const times = generateExpectedOpenTimes(plan("5M"));
  assert.equal(times.length, 1116);
  assert.equal(new Date(times[0]).toISOString(), "2026-06-29T01:40:00.000Z");
  assert.equal(new Date(times.at(-1)!).toISOString(), "2026-07-02T22:35:00.000Z");
});

test("13 expected 15M sequence has exact endpoints and count", () => {
  const times = generateExpectedOpenTimes(plan("15M"));
  assert.equal(times.length, 372);
  assert.equal(new Date(times[0]).toISOString(), "2026-06-29T01:30:00.000Z");
  assert.equal(new Date(times.at(-1)!).toISOString(), "2026-07-02T22:15:00.000Z");
});

test("14 expected 1H sequence has exact endpoints and count", () => {
  const times = generateExpectedOpenTimes(plan("1H"));
  assert.equal(times.length, 93);
  assert.equal(new Date(times[0]).toISOString(), "2026-06-29T01:00:00.000Z");
  assert.equal(new Date(times.at(-1)!).toISOString(), "2026-07-02T21:00:00.000Z");
});

test("15 total expected candle count is 1581", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  assert.equal(bounded.totalExpectedCandles, 1581);
});

test("16 each timeframe uses one request and stays below the hard limit", () => {
  for (const request of buildBoundedAcquisitionPlan(validRunOptions()).requests) {
    assert.equal(request.requestCount, 1);
    assert.ok(request.expectedCount <= 1440);
    assert.equal(request.limit, request.expectedCount);
  }
  assert.throws(
    () => generateExpectedOpenTimes({ ...plan("1H"), expectedCount: 1441, limit: 1441 }),
    (error) => blockers(error).includes("WINDOW_EXCEEDS_SINGLE_REQUEST_LIMIT"),
  );
});

test("17 request uses fixed public origin path and GET", () => {
  const request = buildPublicKlineRequest(plan("5M"));
  const url = new URL(request.url);
  assert.equal(url.origin, "https://open-api.bingx.com");
  assert.equal(url.pathname, "/openApi/swap/v3/quote/klines");
  assert.equal(request.init.method, "GET");
});

test("18 request query contains only bounded public parameters", () => {
  const url = new URL(buildPublicKlineRequest(plan("5M")).url);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["endTime", "interval", "limit", "startTime", "symbol"]);
  assert.equal(url.searchParams.get("endTime"), String(Date.parse(APPROVED_EVALUATION_BOUNDARY)));
});

test("19 request has redirect error and only Accept header", () => {
  const { init } = buildPublicKlineRequest(plan("5M"));
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.headers, { Accept: "application/json" });
});

test("20 request-plan manifest is deterministic", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  const first = buildRequestPlanManifest(bounded);
  assert.deepEqual(first, buildRequestPlanManifest(bounded));
  assert.match(first.requestPlanPayloadSHA256, /^[a-f0-9]{64}$/);
});

test("21 invalid bounded-plan input fails before transport", async () => {
  const mock = mockTransport();
  await assert.rejects(() => runAcquireD8PublicCandles({ ...validRunOptions(), symbol: "ETH-USDT" }, { transport: mock.transport }));
  assert.equal(mock.calls.length, 0);
});

// C. Response parsing and transport failures (13)
test("22 parses a successful public response", () => {
  assert.equal(parsePublicKlineResponse(responseFor("1H"), 200).length, 93);
});

test("23 HTTP 401 maps to public endpoint auth required", () => {
  assert.equal(classifyPublicTransportFailure({ status: 401, bodyText: "{}" }), "PUBLIC_ENDPOINT_AUTH_REQUIRED");
});

test("24 HTTP 403 maps to public endpoint auth required", () => {
  assert.equal(classifyPublicTransportFailure({ status: 403, bodyText: "{}" }), "PUBLIC_ENDPOINT_AUTH_REQUIRED");
});

for (const [index, code] of [100001, 100004, 100412, 100413, 100419, 100421].entries()) {
  test(`${25 + index} BingX auth code ${code} maps to public endpoint auth required`, () => {
    assert.equal(classifyPublicTransportFailure({ status: 200, bodyText: JSON.stringify({ code, data: [] }) }), "PUBLIC_ENDPOINT_AUTH_REQUIRED");
  });
}

test("Auth error code is classified before candle-data schema validation", async () => {
  for (const code of [100001, 100004]) {
    const fs = inMemoryFs();
    let attempts = 0;
    await rejectsWithBlocker(() => runAcquireD8PublicCandles({ ...validRunOptions("apply"), maxRetries: 3 }, {
      transport: async () => {
        attempts += 1;
        return { status: 200, bodyText: JSON.stringify({ code }) };
      },
      fs: fs.adapter,
      approvedOutputParent: "C:/approved",
    }), "PUBLIC_ENDPOINT_AUTH_REQUIRED");
    assert.equal(attempts, 1, `code=${code}`);
    assert.deepEqual(fs.calls, [], `code=${code}`);
  }
});

test("31 auth failure performs no writes, temp creation, credential fallback, or retry", async () => {
  const fs = inMemoryFs();
  let attempts = 0;
  let caught: unknown;
  try {
    await runAcquireD8PublicCandles({ ...validRunOptions("apply"), maxRetries: 3 }, {
      transport: async () => {
        attempts += 1;
        return { status: 401, bodyText: "{}" };
      },
      fs: fs.adapter,
      approvedOutputParent: "C:/approved",
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof AcquisitionError);
  assert.ok(caught.blockers.includes("PUBLIC_ENDPOINT_AUTH_REQUIRED"));
  assert.equal(caught.endpointAvailability, "UNCONFIRMED");
  assert.equal(attempts, 1);
  assert.deepEqual(fs.calls, []);
});

test("32 unreachable endpoint maps to public endpoint unreachable", async () => {
  const mock = mockTransport({ "5M": new TypeError("network down") });
  await rejectsWithBlocker(() => runAcquireD8PublicCandles(validRunOptions(), { transport: mock.transport }), "PUBLIC_ENDPOINT_UNREACHABLE");
});

test("33 rate-limit exhaustion is bounded and mapped", async () => {
  let attempts = 0;
  await rejectsWithBlocker(() => runAcquireD8PublicCandles({ ...validRunOptions(), maxRetries: 1 }, {
    transport: async () => {
      attempts += 1;
      return { status: 429, bodyText: "{}" };
    },
    sleep: async () => undefined,
  }), "RATE_LIMIT_EXHAUSTED");
  assert.equal(attempts, 2);
});

test("34 invalid JSON and invalid envelope map to response schema invalid", () => {
  assert.throws(() => parsePublicKlineResponse("not-json", 200), (error) => blockers(error).includes("RESPONSE_SCHEMA_INVALID"));
  assert.throws(() => parsePublicKlineResponse(JSON.stringify({ code: 0, data: {} }), 200), (error) => blockers(error).includes("RESPONSE_SCHEMA_INVALID"));
});

// D. Normalization and exact temporal coverage (20)
test("35 normalizes valid ascending 5M candles", () => {
  const normalized = validateExactCandleCoverage(rawRows("5M"), plan("5M"));
  assert.equal(normalized.length, 1116);
  assert.equal(normalized[0].timeframe, "5M");
});

test("36 normalizes descending response into ascending order", () => {
  const normalized = validateExactCandleCoverage(rawRows("5M").reverse(), plan("5M"));
  assert.ok(Date.parse(normalized[0].openTime) < Date.parse(normalized.at(-1)!.openTime));
});

test("37 normalizes valid 15M and 1H candles", () => {
  assert.equal(validateExactCandleCoverage(rawRows("15M"), plan("15M")).length, 372);
  assert.equal(validateExactCandleCoverage(rawRows("1H"), plan("1H")).length, 93);
});

test("38 missing first candle is rejected", () => {
  assert.throws(() => validateExactCandleCoverage(rawRows("5M").slice(1), plan("5M")), (error) => blockers(error).includes("GAP_DETECTED"));
});

test("39 missing final candle is rejected", () => {
  assert.throws(() => validateExactCandleCoverage(rawRows("5M").slice(0, -1), plan("5M")), (error) => blockers(error).includes("GAP_DETECTED"));
});

test("40 interior gap is rejected", () => {
  const rows = rawRows("5M");
  rows.splice(100, 1);
  assert.throws(() => validateExactCandleCoverage(rows, plan("5M")), (error) => blockers(error).includes("GAP_DETECTED"));
});

test("41 extra earlier and later candles are rejected", () => {
  const request = plan("5M");
  const rows = rawRows("5M");
  rows.push([request.startTimeMs - request.intervalMs, "1", "1", "1", "1", "1", request.startTimeMs, "0", 0, "0", "0"]);
  rows.push([request.lastOpenTimeMs + request.intervalMs, "1", "1", "1", "1", "1", request.lastOpenTimeMs + 2 * request.intervalMs, "0", 0, "0", "0"]);
  assert.throws(() => validateExactCandleCoverage(rows, request), (error) => blockers(error).includes("OUT_OF_RANGE_CANDLE_BLOCKED"));
});

test("42 duplicate candle is rejected", () => {
  const rows = rawRows("5M");
  rows.push([...rows[0]]);
  assert.throws(() => validateExactCandleCoverage(rows, plan("5M")), (error) => blockers(error).includes("DUPLICATE_CANDLE_BLOCKED"));
});

test("43 conflicting duplicate candle is rejected", () => {
  const rows = rawRows("5M");
  const conflict = [...rows[0]];
  conflict[5] = "11";
  rows.push(conflict);
  assert.throws(() => validateExactCandleCoverage(rows, plan("5M")), (error) => blockers(error).includes("CONFLICTING_DUPLICATE_BLOCKED"));
});

test("44 wrong exact timestamp set is rejected", () => {
  const rows = rawRows("5M");
  rows[10][0] = Number(rows[10][0]) + 1;
  rows[10][6] = Number(rows[10][6]) + 1;
  assert.throws(() => validateExactCandleCoverage(rows, plan("5M")), (error) => blockers(error).includes("TIMESTAMP_ALIGNMENT_BLOCKED"));
});

test("45 future and partial candles are rejected", () => {
  const request = plan("5M");
  const rows = rawRows("5M");
  const nextOpenTime = request.lastOpenTimeMs + request.intervalMs;
  rows.push([nextOpenTime, "1", "1", "1", "1", "1", nextOpenTime + request.intervalMs, "0", 0, "0", "0"]);
  assert.throws(() => validateExactCandleCoverage(rows, request), (error) => blockers(error).includes("FUTURE_LEAK_BLOCKED"));
});

test("46 malformed tuple is rejected", () => {
  const rows = rawRows("1H");
  rows[0] = [rows[0][0]];
  assert.throws(() => validateExactCandleCoverage(rows, plan("1H")), (error) => blockers(error).includes("MALFORMED_CANDLE_BLOCKED"));
});

test("47 invalid numeric fields are rejected", () => {
  const rows = rawRows("1H");
  rows[0][1] = "NaN";
  assert.throws(() => normalizeAcquiredCandles(rows, plan("1H")), (error) => blockers(error).includes("MALFORMED_CANDLE_BLOCKED"));
});

test("48 invalid OHLC relation is rejected", () => {
  const rows = rawRows("1H");
  rows[0][2] = "90";
  assert.throws(() => normalizeAcquiredCandles(rows, plan("1H")), (error) => blockers(error).includes("INVALID_OHLC_BLOCKED"));
});

test("49 negative volume is rejected", () => {
  const rows = rawRows("1H");
  rows[0][5] = "-1";
  assert.throws(() => normalizeAcquiredCandles(rows, plan("1H")), (error) => blockers(error).includes("NEGATIVE_VOLUME_BLOCKED"));
});

test("50 optional row symbol mismatch is rejected", () => {
  const request = plan("1H");
  const row = { symbol: "ETH-USDT", interval: "1H", openTime: request.startTimeMs, open: 1, high: 1, low: 1, close: 1, volume: 1, closeTime: request.startTimeMs + request.intervalMs };
  assert.throws(() => normalizeAcquiredCandles([row], request), (error) => blockers(error).includes("SYMBOL_MISMATCH"));
});

test("51 optional row interval mismatch is rejected", () => {
  const request = plan("1H");
  const row = { symbol: APPROVED_SYMBOL, interval: "15M", openTime: request.startTimeMs, open: 1, high: 1, low: 1, close: 1, volume: 1, closeTime: request.startTimeMs + request.intervalMs };
  assert.throws(() => normalizeAcquiredCandles([row], request), (error) => blockers(error).includes("INTERVAL_MISMATCH"));
});

test("52 empty response is rejected", () => {
  assert.throws(() => validateExactCandleCoverage([], plan("1H")), (error) => blockers(error).includes("EMPTY_RESPONSE_BLOCKED"));
});

test("53 short response reports insufficient coverage and unexpected count", () => {
  assert.throws(() => validateExactCandleCoverage(rawRows("1H").slice(0, -2), plan("1H")), (error) => {
    const values = blockers(error);
    return values.includes("INSUFFICIENT_COVERAGE") && values.includes("UNEXPECTED_RESPONSE_COUNT");
  });
});

test("54 close-time interval misalignment is rejected", () => {
  const rows = rawRows("1H");
  rows[0][6] = Number(rows[0][6]) + 1;
  assert.throws(() => validateExactCandleCoverage(rows, plan("1H")), (error) => blockers(error).includes("TIMESTAMP_ALIGNMENT_BLOCKED"));
});

// E. Modes, retries, and manifests (9)
test("55 plan-only performs zero HTTP and zero filesystem operations", async () => {
  const fs = inMemoryFs();
  const mock = mockTransport();
  const result = await runAcquireD8PublicCandles(validRunOptions("plan-only"), { transport: mock.transport, fs: fs.adapter });
  assert.equal(result.mode, "plan-only");
  assert.equal(mock.calls.length, 0);
  assert.deepEqual(fs.calls, []);
});

test("56 dry-run performs HTTP through injection and zero writes", async () => {
  const fs = inMemoryFs();
  const mock = mockTransport();
  const result = await runAcquireD8PublicCandles(validRunOptions("dry-run"), { transport: mock.transport, fs: fs.adapter });
  assert.equal(result.candleCount, 1581);
  assert.equal(result.acquisitionManifest.authenticationMode, "PUBLIC_UNAUTHENTICATED_ONLY");
  assert.equal(result.acquisitionManifest.authenticationUsed, false);
  assert.equal(result.acquisitionManifest.networkUsed, true);
  assert.equal(mock.calls.length, 3);
  assert.deepEqual(fs.calls, []);
});

test("57 requests execute once per timeframe without pagination", async () => {
  const mock = mockTransport();
  await runAcquireD8PublicCandles(validRunOptions("dry-run"), { transport: mock.transport });
  assert.deepEqual(mock.calls.map(({ url }) => new URL(url).searchParams.get("interval")), ["5m", "15m", "1h"]);
});

test("58 transient failure retry count is bounded", async () => {
  let attempts = 0;
  const attemptedUrls: string[] = [];
  const result = await runAcquireD8PublicCandles({ ...validRunOptions("dry-run"), maxRetries: 1 }, {
    transport: async (url) => {
      attemptedUrls.push(url);
      const publicInterval = new URL(url).searchParams.get("interval");
      const interval = ({ "5m": "5M", "15m": "15M", "1h": "1H" } as const)[publicInterval as "5m" | "15m" | "1h"];
      attempts += 1;
      if (attempts === 1) throw new TypeError("temporary");
      return { status: 200, bodyText: responseFor(interval) };
    },
    sleep: async () => undefined,
  });
  assert.equal(result.candleCount, 1581);
  assert.equal(attempts, 4);
  assert.equal(attemptedUrls[0], attemptedUrls[1]);
});

test("59 request-plan manifest includes provenance and exact windows", () => {
  const manifest = buildRequestPlanManifest(buildBoundedAcquisitionPlan(validRunOptions()), {
    runId: "run-1",
    implementationCommit: "abc",
    generatedAt: "2026-07-14T00:00:00.000Z",
    mode: "plan-only",
    requestTimeoutMs: 5000,
    maxRetries: 0,
  });
  assert.equal(manifest.evaluationBoundary, APPROVED_EVALUATION_BOUNDARY);
  assert.equal(manifest.requests.length, 3);
  assert.equal(manifest.totalExpectedCandles, 1581);
  assert.equal(manifest.runId, "run-1");
  assert.equal(manifest.authenticationMode, "PUBLIC_UNAUTHENTICATED_ONLY");
  assert.equal(manifest.authenticationUsed, false);
  assert.equal(manifest.endpointAvailability, "NOT_YET_NETWORK_VERIFIED");
  assert.equal(manifest.networkUsed, false);
  assert.equal(Object.keys(manifest.requestFingerprints).length, 3);
});

test("60 acquisition manifest is deterministic with per-file SHA-256", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  const candles = Object.fromEntries(ALL_TIMEFRAMES.map((timeframe) => [timeframe, validateExactCandleCoverage(rawRows(timeframe), plan(timeframe))]));
  const context = { implementationCommit: "abc", sourcePackRoot: "C:/fixture/historical-packs", runId: "run-1", generatedAt: "2026-07-14T00:00:00.000Z", acquiredAt: "2026-07-14T00:00:00.000Z", mode: "dry-run" as const };
  const first = buildAcquisitionManifest(bounded, candles, context);
  const second = buildAcquisitionManifest(bounded, candles, context);
  assert.deepEqual(first, second);
  assert.match(first.manifestPayloadSHA256, /^[a-f0-9]{64}$/);
  assert.equal(Object.keys(first.candleFileSHA256).length, 3);
  assert.equal(first.qualityCounters.expectedTotal, 1581);
  assert.equal(first.qualityCounters.acceptedTotal, 1581);
  assert.equal(first.qualityCounters.rejectedTotal, 0);
  assert.equal(first.qualityCounters.blockerCount, first.blockers.length);
  assert.equal(Object.keys(first.timeframeResults).length, 3);
});

test("61 normalized JSONL bytes are deterministic and L5-compatible", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  const candles = Object.fromEntries(ALL_TIMEFRAMES.map((timeframe) => [timeframe, validateExactCandleCoverage(rawRows(timeframe), plan(timeframe))]));
  const apply = planAtomicApply({
    boundedPlan: bounded,
    candles,
    outputRoot: "C:/approved/acquisition-run",
    approvedOutputParent: "C:/approved",
    implementationCommit: "abc",
  });
  const bytes = apply.files.get("candles-5M.jsonl")!;
  const firstRow = JSON.parse(new TextDecoder().decode(bytes).split("\n")[0]);
  assert.deepEqual(Object.keys(firstRow), ["timeframe", "openTime", "closeTime", "open", "high", "low", "close", "volume", "sourceFile", "sourceLine"]);
});

test("62 checksum manifest matches planned file bytes", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  const candles = Object.fromEntries(ALL_TIMEFRAMES.map((timeframe) => [timeframe, validateExactCandleCoverage(rawRows(timeframe), plan(timeframe))]));
  const apply = planAtomicApply({ boundedPlan: bounded, candles, outputRoot: "C:/approved/acquisition-run", approvedOutputParent: "C:/approved", implementationCommit: "abc" });
  const checksumText = new TextDecoder().decode(apply.files.get("checksums.sha256")!);
  for (const name of ["request-plan.json", "acquisition-manifest.json", "candles-5M.jsonl", "candles-15M.jsonl", "candles-1H.jsonl"]) {
    const hash = createHash("sha256").update(apply.files.get(name)!).digest("hex");
    assert.ok(checksumText.includes(`${hash}  ${name}`));
  }
});

test("63 malformed response stops before any write", async () => {
  const fs = inMemoryFs();
  let requests = 0;
  await rejectsWithBlocker(() => runAcquireD8PublicCandles(validRunOptions("apply"), {
    transport: async (url) => {
      requests += 1;
      const interval = new URL(url).searchParams.get("interval");
      if (interval === "1h") return { status: 200, bodyText: "bad" };
      const timeframe = interval === "5m" ? "5M" : "15M";
      return { status: 200, bodyText: responseFor(timeframe) };
    },
    fs: fs.adapter,
    approvedOutputParent: "C:/approved",
  }), "RESPONSE_SCHEMA_INVALID");
  assert.equal(requests, 3);
  assert.deepEqual(fs.calls, []);
});

// F. Apply safety and final integrity (8)
test("64 apply uses a temp directory and one final rename", async () => {
  const fs = inMemoryFs();
  const mock = mockTransport();
  await runAcquireD8PublicCandles(validRunOptions("apply"), {
    transport: mock.transport,
    fs: fs.adapter,
    approvedOutputParent: "C:/approved",
  });
  assert.equal(fs.calls.filter((call) => call.startsWith("mkdir:")).length, 1);
  assert.equal(fs.calls.filter((call) => call.startsWith("rename:")).length, 1);
  assert.ok(fs.directories.has(path.resolve("C:/approved/acquisition-run")));
});

test("65 apply rejects an existing final output before writing", async () => {
  const fs = inMemoryFs();
  fs.directories.add(path.resolve("C:/approved/acquisition-run"));
  const mock = mockTransport();
  await rejectsWithBlocker(() => runAcquireD8PublicCandles(validRunOptions("apply"), {
    transport: mock.transport,
    fs: fs.adapter,
    approvedOutputParent: "C:/approved",
  }), "OUTPUT_ROOT_EXISTS");
  assert.equal(fs.calls.some((call) => call.startsWith("write:")), false);
});

test("66 apply rejects output outside approved parent", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  const candles = Object.fromEntries(ALL_TIMEFRAMES.map((timeframe) => [timeframe, validateExactCandleCoverage(rawRows(timeframe), plan(timeframe))]));
  for (const outputRoot of ["C:/repo/output", "C:/approved/nested/output", "C:/approved"]) {
    assert.throws(() => planAtomicApply({ boundedPlan: bounded, candles, outputRoot, approvedOutputParent: "C:/approved", implementationCommit: "abc" }), (error) => blockers(error).includes("OUTPUT_ROOT_FORBIDDEN"));
  }
});

test("67 write failure removes only the temporary directory", async () => {
  const fs = inMemoryFs();
  const mock = mockTransport();
  fs.adapter.writeFile = async (target) => {
    fs.calls.push(`write:${target}`);
    throw new Error("disk full");
  };
  await rejectsWithBlocker(() => runAcquireD8PublicCandles(validRunOptions("apply"), {
    transport: mock.transport,
    fs: fs.adapter,
    approvedOutputParent: "C:/approved",
  }), "ATOMIC_WRITE_FAILED");
  assert.equal(fs.calls.filter((call) => call.startsWith("rm:")).length, 1);
  assert.equal(fs.calls.some((call) => call === `rm:${path.resolve("C:/approved/acquisition-run")}`), false);
});

test("68 source-pack provenance is recorded but never mutated", async () => {
  const fs = inMemoryFs();
  const mock = mockTransport();
  await runAcquireD8PublicCandles(validRunOptions("apply"), { transport: mock.transport, fs: fs.adapter, approvedOutputParent: "C:/approved" });
  assert.equal(fs.calls.some((call) => call.includes("historical-packs")), false);
  const manifestBytes = fs.files.get(path.join(path.resolve("C:/approved/acquisition-run"), "acquisition-manifest.json"))!;
  assert.equal(JSON.parse(new TextDecoder().decode(manifestBytes)).sourcePackRoot, "C:/fixture/historical-packs");
});

test("69 apply writes exactly five payload files plus checksums", async () => {
  const fs = inMemoryFs();
  const mock = mockTransport();
  await runAcquireD8PublicCandles(validRunOptions("apply"), { transport: mock.transport, fs: fs.adapter, approvedOutputParent: "C:/approved" });
  assert.deepEqual([...fs.files.keys()].map((name) => path.basename(name)).sort(), [
    "acquisition-manifest.json",
    "candles-15M.jsonl",
    "candles-1H.jsonl",
    "candles-5M.jsonl",
    "checksums.sha256",
    "request-plan.json",
  ]);
});

test("70 checksum file excludes itself and is stable", () => {
  const bounded = buildBoundedAcquisitionPlan(validRunOptions());
  const candles = Object.fromEntries(ALL_TIMEFRAMES.map((timeframe) => [timeframe, validateExactCandleCoverage(rawRows(timeframe), plan(timeframe))]));
  const first = planAtomicApply({ boundedPlan: bounded, candles, outputRoot: "C:/approved/acquisition-run", approvedOutputParent: "C:/approved", implementationCommit: "abc" });
  const second = planAtomicApply({ boundedPlan: bounded, candles, outputRoot: "C:/approved/acquisition-run", approvedOutputParent: "C:/approved", implementationCommit: "abc" });
  const text = new TextDecoder().decode(first.files.get("checksums.sha256")!);
  assert.equal(text.includes("checksums.sha256"), false);
  assert.deepEqual(first.files.get("checksums.sha256"), second.files.get("checksums.sha256"));
});

test("71 temp-fixture apply produces readable deterministic output", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "d8-public-candles-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "run-1");
  const mock = mockTransport();
  await runAcquireD8PublicCandles({ ...validRunOptions("apply"), outputRoot }, {
    transport: mock.transport,
    approvedOutputParent: root,
  });
  assert.equal((await stat(outputRoot)).isDirectory(), true);
  const lines = (await readFile(path.join(outputRoot, "candles-1H.jsonl"), "utf8")).trim().split("\n");
  assert.equal(lines.length, APPROVED_WINDOWS["1H"].expectedCount);
});

test("72 unknown runtime mode fails closed before transport or filesystem effects", async () => {
  const fs = inMemoryFs();
  let transportCalls = 0;
  await rejectsWithBlocker(() => runAcquireD8PublicCandles({
    ...validRunOptions("apply"),
    mode: "unexpected-runtime-mode" as never,
  }, {
    transport: async () => {
      transportCalls += 1;
      return { status: 200, bodyText: responseFor("5M") };
    },
    fs: fs.adapter,
    approvedOutputParent: "C:/approved",
  }), "INVALID_RUNTIME_MODE");
  assert.equal(transportCalls, 0);
  assert.deepEqual(fs.calls, []);
});

test("Direct apply requires complete runtime output identity before side effects", async () => {
  const cases = [
    { label: "runId missing", values: { runId: undefined } },
    { label: "runId empty", values: { runId: "" } },
    { label: "runId whitespace", values: { runId: "   " } },
    { label: "outputRoot missing", values: { outputRoot: undefined } },
    { label: "outputRoot empty", values: { outputRoot: "" } },
    { label: "outputRoot whitespace", values: { outputRoot: "   " } },
  ] as const;

  for (const fixture of cases) {
    const fs = inMemoryFs();
    let transportCalls = 0;
    await rejectsWithBlocker(() => runAcquireD8PublicCandles({
      ...validRunOptions("apply"),
      ...fixture.values,
    }, {
      transport: async () => {
        transportCalls += 1;
        return { status: 200, bodyText: responseFor("5M") };
      },
      fs: fs.adapter,
      approvedOutputParent: "C:/approved",
    }), "INVALID_RUNTIME_OPTIONS");
    assert.equal(transportCalls, 0, fixture.label);
    assert.deepEqual(fs.calls, [], fixture.label);
  }
});

test("73 invalid direct runtime retry and timeout options fail closed", async () => {
  const cases = [
    { field: "maxRetries", value: Number.POSITIVE_INFINITY },
    { field: "maxRetries", value: Number.NaN },
    { field: "maxRetries", value: -1 },
    { field: "maxRetries", value: 1.5 },
    { field: "maxRetries", value: 6 },
    { field: "requestTimeoutMs", value: Number.POSITIVE_INFINITY },
    { field: "requestTimeoutMs", value: Number.NaN },
    { field: "requestTimeoutMs", value: 0 },
    { field: "requestTimeoutMs", value: -1 },
    { field: "requestTimeoutMs", value: 1.5 },
  ] as const;

  for (const fixture of cases) {
    const fs = inMemoryFs();
    let transportCalls = 0;
    await rejectsWithBlocker(() => runAcquireD8PublicCandles({
      ...validRunOptions("apply"),
      [fixture.field]: fixture.value,
    }, {
      transport: async () => {
        transportCalls += 1;
        return { status: 200, bodyText: responseFor("5M") };
      },
      fs: fs.adapter,
      approvedOutputParent: "C:/approved",
    }), "INVALID_RUNTIME_OPTIONS");
    assert.equal(transportCalls, 0, `${fixture.field}=${fixture.value}`);
    assert.deepEqual(fs.calls, [], `${fixture.field}=${fixture.value}`);
  }
});

test("74 persisted request plan bytes match manifest and runner linkage", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "d8-public-candles-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outputRoot = path.join(root, "run-linkage");
  const clock = "2026-07-15T00:00:00.000Z";
  const mock = mockTransport();
  const result = await runAcquireD8PublicCandles({
    ...validRunOptions("apply"),
    outputRoot,
    runId: "run-linkage",
  }, {
    transport: mock.transport,
    approvedOutputParent: root,
    now: () => clock,
  });

  const requestPlanBytes = await readFile(path.join(outputRoot, "request-plan.json"));
  const requestPlan = JSON.parse(requestPlanBytes.toString("utf8"));
  const acquisitionManifest = JSON.parse(await readFile(path.join(outputRoot, "acquisition-manifest.json"), "utf8"));
  const persistedSHA256 = createHash("sha256").update(requestPlanBytes).digest("hex");

  assert.equal(requestPlan.mode, "apply");
  assert.equal(requestPlan.apply, true);
  assert.equal(requestPlan.dryRun, false);
  assert.equal(requestPlan.networkUsed, true);
  assert.equal(requestPlan.authenticationMode, "PUBLIC_UNAUTHENTICATED_ONLY");
  assert.equal(requestPlan.authenticationUsed, false);
  assert.equal(requestPlan.runId, "run-linkage");
  assert.equal(requestPlan.evaluationBoundary, APPROVED_EVALUATION_BOUNDARY);
  assert.equal(requestPlan.generatedAt, clock);
  assert.equal(requestPlan.acquiredAt, clock);
  assert.equal(requestPlan.outputPlan.finalRoot, path.resolve(outputRoot));
  assert.match(requestPlan.requestPlanPayloadSHA256, /^[a-f0-9]{64}$/);
  assert.equal(Object.keys(requestPlan.requestFingerprints).length, 3);
  assert.equal(acquisitionManifest.requestPlanPath, "request-plan.json");
  assert.equal(acquisitionManifest.requestPlanSHA256, persistedSHA256);
  assert.deepEqual(result.requestPlan, requestPlan);
  assert.equal(result.requestPlanSHA256, persistedSHA256);
});
