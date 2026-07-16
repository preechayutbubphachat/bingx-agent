import { createHash } from "node:crypto";
import {
  mkdir as nodeMkdir,
  rename as nodeRename,
  rm as nodeRm,
  stat as nodeStat,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Bounded D8 evidence-repair acquisition for one fixed public candle contract.
export const APPROVED_EVALUATION_BOUNDARY = "2026-07-02T22:44:16.852Z";
export const APPROVED_SYMBOL = "BTC-USDT";
export const APPROVED_MARKET_TYPE = "perpetual-swap";

const PUBLIC_ORIGIN = "https://open-api.bingx.com";
const PUBLIC_KLINE_PATH = "/openApi/swap/v3/quote/klines";
const MAX_REQUEST_LIMIT = 1440;

export type D8Timeframe = "5M" | "15M" | "1H";
export type AcquisitionMode = "plan-only" | "dry-run" | "apply";

type ApprovedWindow = {
  startTime: string;
  lastOpenTime: string;
  expectedCount: number;
  intervalMs: number;
  publicInterval: string;
};

export const APPROVED_WINDOWS: Readonly<Record<D8Timeframe, ApprovedWindow>> = {
  "5M": {
    startTime: "2026-06-29T01:40:00.000Z",
    lastOpenTime: "2026-07-02T22:35:00.000Z",
    expectedCount: 1116,
    intervalMs: 5 * 60 * 1000,
    publicInterval: "5m",
  },
  "15M": {
    startTime: "2026-06-29T01:30:00.000Z",
    lastOpenTime: "2026-07-02T22:15:00.000Z",
    expectedCount: 372,
    intervalMs: 15 * 60 * 1000,
    publicInterval: "15m",
  },
  "1H": {
    startTime: "2026-06-29T01:00:00.000Z",
    lastOpenTime: "2026-07-02T21:00:00.000Z",
    expectedCount: 93,
    intervalMs: 60 * 60 * 1000,
    publicInterval: "1h",
  },
};

const APPROVED_TIMEFRAMES: readonly D8Timeframe[] = ["5M", "15M", "1H"];
const AUTH_RESPONSE_CODES = new Set([100001, 100004, 100412, 100413, 100419, 100421]);

export class AcquisitionError extends Error {
  readonly blockers: string[];
  readonly endpointAvailability: "UNCONFIRMED" | "NOT_APPLICABLE";

  constructor(
    blockers: Iterable<string>,
    message?: string,
    endpointAvailability: "UNCONFIRMED" | "NOT_APPLICABLE" = "NOT_APPLICABLE",
  ) {
    const values = [...new Set(blockers)].sort();
    super(message ?? values.join(", "));
    this.name = "AcquisitionError";
    this.blockers = values;
    this.endpointAvailability = endpointAvailability;
  }
}

export type AcquireD8PublicCandlesOptions = {
  mode: AcquisitionMode;
  evaluationBoundary: string;
  symbol: string;
  marketType: string;
  timeframes: readonly D8Timeframe[];
  sourcePackRoot: string;
  outputRoot?: string;
  runId?: string;
  requestTimeoutMs: number;
  maxRetries: number;
  implementationCommit?: string;
};

export type BoundedRequestPlan = {
  timeframe: D8Timeframe;
  publicInterval: string;
  symbol: string;
  marketType: string;
  startTimeMs: number;
  lastOpenTimeMs: number;
  endTimeMs: number;
  evaluationBoundaryMs: number;
  intervalMs: number;
  expectedCount: number;
  limit: number;
  requestCount: 1;
};

export type BoundedAcquisitionPlan = {
  evaluationBoundary: string;
  evaluationBoundaryMs: number;
  symbol: string;
  marketType: string;
  sourcePackRoot: string;
  requests: BoundedRequestPlan[];
  totalExpectedCandles: number;
};

export type NormalizedAcquiredCandle = {
  timeframe: D8Timeframe;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceFile: string;
  sourceLine: number;
};

type PublicResponse = {
  status: number;
  bodyText: string;
};

type PublicTransport = (
  url: string,
  init: {
    method: "GET";
    headers: { Accept: "application/json" };
    redirect: "error";
    timeoutMs: number;
  },
) => Promise<PublicResponse>;

type FilesystemAdapter = {
  stat(target: string): Promise<{ exists: boolean }>;
  mkdir(target: string): Promise<void>;
  writeFile(target: string, bytes: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(target: string): Promise<void>;
};

export type AcquisitionDependencies = {
  transport?: PublicTransport;
  fs?: FilesystemAdapter;
  approvedOutputParent?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => string;
  log?: (message: string) => void;
};

const defaultFilesystem: FilesystemAdapter = {
  async stat(target) {
    try {
      await nodeStat(target);
      return { exists: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
      throw error;
    }
  },
  async mkdir(target) {
    await nodeMkdir(target);
  },
  async writeFile(target, bytes) {
    await nodeWriteFile(target, bytes);
  },
  async rename(from, to) {
    await nodeRename(from, to);
  },
  async rm(target) {
    await nodeRm(target, { recursive: true, force: true });
  },
};

const defaultTransport: PublicTransport = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      redirect: init.redirect,
      signal: controller.signal,
    });
    return { status: response.status, bodyText: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
};

function assertValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseAcquireD8PublicCandlesArgs(args: string[]): AcquireD8PublicCandlesOptions {
  const parsed: Partial<AcquireD8PublicCandlesOptions> = {
    mode: "plan-only",
    requestTimeoutMs: 15_000,
    maxRetries: 2,
  };
  let selectedMode = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--plan-only" || flag === "--dry-run" || flag === "--apply") {
      if (selectedMode) throw new Error("Only one execution mode may be selected");
      parsed.mode = flag.slice(2) as AcquisitionMode;
      selectedMode = true;
      continue;
    }

    const value = assertValue(args, index, flag);
    index += 1;
    switch (flag) {
      case "--evaluation-boundary":
        parsed.evaluationBoundary = value;
        break;
      case "--symbol":
        parsed.symbol = value;
        break;
      case "--market-type":
        parsed.marketType = value;
        break;
      case "--timeframes":
        parsed.timeframes = value.split(",") as D8Timeframe[];
        break;
      case "--source-pack-root":
        parsed.sourcePackRoot = value;
        break;
      case "--output-root":
        parsed.outputRoot = value;
        break;
      case "--run-id":
        parsed.runId = value;
        break;
      case "--request-timeout-ms":
        parsed.requestTimeoutMs = Number(value);
        break;
      case "--max-retries":
        parsed.maxRetries = Number(value);
        break;
      case "--implementation-commit":
        parsed.implementationCommit = value;
        break;
      default:
        throw new Error(`Unsupported argument: ${flag}`);
    }
  }

  const options = parsed as AcquireD8PublicCandlesOptions;
  buildBoundedAcquisitionPlan(options);
  if (!exactTimeframes(options.timeframes)) {
    throw new Error("timeframes must be exactly 5M,15M,1H");
  }
  if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
    throw new Error("request timeout must be a positive integer");
  }
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 5) {
    throw new Error("max retries must be an integer from 0 through 5");
  }
  if (options.mode === "apply" && (!options.outputRoot || !options.runId)) {
    throw new Error("apply requires output root and run id");
  }
  return options;
}

function exactTimeframes(timeframes: readonly D8Timeframe[] | undefined): boolean {
  return Boolean(
    timeframes
      && timeframes.length === APPROVED_TIMEFRAMES.length
      && APPROVED_TIMEFRAMES.every((timeframe, index) => timeframes[index] === timeframe),
  );
}

export function buildBoundedAcquisitionPlan(
  input: Pick<AcquireD8PublicCandlesOptions, "evaluationBoundary" | "symbol" | "marketType" | "timeframes" | "sourcePackRoot">,
): BoundedAcquisitionPlan {
  const blockers: string[] = [];
  if (input.evaluationBoundary !== APPROVED_EVALUATION_BOUNDARY) blockers.push("UNAPPROVED_EVALUATION_BOUNDARY");
  if (input.symbol !== APPROVED_SYMBOL) blockers.push("SYMBOL_MISMATCH");
  if (input.marketType !== APPROVED_MARKET_TYPE) blockers.push("MARKET_TYPE_MISMATCH_BLOCKED");
  if (!input.sourcePackRoot) blockers.push("SOURCE_PACK_ROOT_REQUIRED");
  if (!input.timeframes || input.timeframes.length === 0) blockers.push("TIMEFRAMES_REQUIRED");
  for (const timeframe of input.timeframes ?? []) {
    if (!APPROVED_TIMEFRAMES.includes(timeframe)) blockers.push("UNAPPROVED_TIMEFRAME");
  }
  if (blockers.length > 0) throw new AcquisitionError(blockers);

  const evaluationBoundaryMs = Date.parse(input.evaluationBoundary);
  const requests = input.timeframes.map((timeframe) => {
    const window = APPROVED_WINDOWS[timeframe];
    const startTimeMs = Date.parse(window.startTime);
    const lastOpenTimeMs = Date.parse(window.lastOpenTime);
    const computedCount = Math.floor((lastOpenTimeMs - startTimeMs) / window.intervalMs) + 1;
    if (computedCount !== window.expectedCount || window.expectedCount > MAX_REQUEST_LIMIT) {
      throw new AcquisitionError(["BOUNDED_PLAN_INVALID"]);
    }
    return {
      timeframe,
      publicInterval: window.publicInterval,
      symbol: input.symbol,
      marketType: input.marketType,
      startTimeMs,
      lastOpenTimeMs,
      endTimeMs: evaluationBoundaryMs,
      evaluationBoundaryMs,
      intervalMs: window.intervalMs,
      expectedCount: window.expectedCount,
      limit: window.expectedCount,
      requestCount: 1 as const,
    };
  });

  return {
    evaluationBoundary: input.evaluationBoundary,
    evaluationBoundaryMs,
    symbol: input.symbol,
    marketType: input.marketType,
    sourcePackRoot: input.sourcePackRoot,
    requests,
    totalExpectedCandles: requests.reduce((total, request) => total + request.expectedCount, 0),
  };
}

export function generateExpectedOpenTimes(plan: BoundedRequestPlan): number[] {
  if (plan.expectedCount > MAX_REQUEST_LIMIT) {
    throw new AcquisitionError(["WINDOW_EXCEEDS_SINGLE_REQUEST_LIMIT"]);
  }
  return Array.from({ length: plan.expectedCount }, (_, index) => plan.startTimeMs + index * plan.intervalMs);
}

export function buildPublicKlineRequest(plan: BoundedRequestPlan, timeoutMs = 15_000) {
  const url = new URL(PUBLIC_KLINE_PATH, PUBLIC_ORIGIN);
  url.searchParams.set("symbol", plan.symbol);
  url.searchParams.set("interval", plan.publicInterval);
  url.searchParams.set("startTime", String(plan.startTimeMs));
  url.searchParams.set("endTime", String(plan.endTimeMs));
  url.searchParams.set("limit", String(plan.limit));
  return {
    url: url.toString(),
    init: {
      method: "GET" as const,
      headers: { Accept: "application/json" as const },
      redirect: "error" as const,
      timeoutMs,
    },
  };
}

function parseEnvelope(bodyText: string): { code: number; data: unknown } | undefined {
  try {
    const parsed = JSON.parse(bodyText) as { code?: unknown; data?: unknown };
    if (!parsed || typeof parsed !== "object") return undefined;
    const code = typeof parsed.code === "number" ? parsed.code : Number(parsed.code ?? 0);
    if (!Number.isFinite(code)) return undefined;
    return { code, data: parsed.data };
  } catch {
    return undefined;
  }
}

export function classifyPublicTransportFailure(response: PublicResponse): string | undefined {
  if (response.status === 401 || response.status === 403) return "PUBLIC_ENDPOINT_AUTH_REQUIRED";
  if (response.status === 429) return "RATE_LIMIT_EXHAUSTED";
  const envelope = parseEnvelope(response.bodyText);
  if (envelope && AUTH_RESPONSE_CODES.has(envelope.code)) return "PUBLIC_ENDPOINT_AUTH_REQUIRED";
  if (envelope?.code === 100410) return "RATE_LIMIT_EXHAUSTED";
  if (response.status < 200 || response.status >= 300) return "HTTP_REQUEST_FAILED";
  if (!envelope) return "RESPONSE_SCHEMA_INVALID";
  if (envelope.code !== 0) return "HTTP_REQUEST_FAILED";
  if (!Array.isArray(envelope.data)) return "RESPONSE_SCHEMA_INVALID";
  return undefined;
}

export function parsePublicKlineResponse(bodyText: string, status: number): unknown[] {
  const blocker = classifyPublicTransportFailure({ status, bodyText });
  if (blocker) throw new AcquisitionError([blocker]);
  const envelope = parseEnvelope(bodyText);
  if (!envelope || !Array.isArray(envelope.data)) throw new AcquisitionError(["RESPONSE_SCHEMA_INVALID"]);
  return envelope.data;
}

type ParsedCandle = NormalizedAcquiredCandle & {
  openTimeMs: number;
  closeTimeMs: number;
};

function numeric(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timestamp(value: unknown): number | undefined {
  const direct = numeric(value);
  if (direct !== undefined) return Number.isInteger(direct) ? direct : undefined;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRawCandle(row: unknown, request: BoundedRequestPlan, sourceLine: number): ParsedCandle {
  let values: {
    symbol?: unknown;
    interval?: unknown;
    openTime?: unknown;
    open?: unknown;
    high?: unknown;
    low?: unknown;
    close?: unknown;
    volume?: unknown;
    closeTime?: unknown;
  };

  if (Array.isArray(row)) {
    if (row.length < 7) throw new AcquisitionError(["MALFORMED_CANDLE_BLOCKED"]);
    values = {
      openTime: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5],
      closeTime: row[6],
    };
  } else if (row && typeof row === "object") {
    values = row as typeof values;
    const publicRow = row as Record<string, unknown>;
    values.openTime ??= publicRow.time;
    if (values.closeTime === undefined) {
      const derivedOpenTime = timestamp(values.openTime);
      if (derivedOpenTime !== undefined) values.closeTime = derivedOpenTime + request.intervalMs;
    }
  } else {
    throw new AcquisitionError(["MALFORMED_CANDLE_BLOCKED"]);
  }

  const blockers: string[] = [];
  if (values.symbol !== undefined && values.symbol !== request.symbol) blockers.push("SYMBOL_MISMATCH");
  if (
    values.interval !== undefined
    && values.interval !== request.timeframe
    && values.interval !== request.publicInterval
  ) blockers.push("INTERVAL_MISMATCH");

  const openTimeMs = timestamp(values.openTime);
  const closeTimeMs = timestamp(values.closeTime);
  const open = numeric(values.open);
  const high = numeric(values.high);
  const low = numeric(values.low);
  const close = numeric(values.close);
  const volume = numeric(values.volume);
  if ([openTimeMs, closeTimeMs, open, high, low, close, volume].some((value) => value === undefined)) {
    blockers.push("MALFORMED_CANDLE_BLOCKED");
  }
  if (blockers.length > 0) throw new AcquisitionError(blockers);

  if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || high! < low!) {
    blockers.push("INVALID_OHLC_BLOCKED");
  }
  if (volume! < 0) blockers.push("NEGATIVE_VOLUME_BLOCKED");
  if (closeTimeMs! !== openTimeMs! + request.intervalMs) blockers.push("TIMESTAMP_ALIGNMENT_BLOCKED");
  if (openTimeMs! % request.intervalMs !== 0) blockers.push("TIMESTAMP_ALIGNMENT_BLOCKED");
  if (blockers.length > 0) throw new AcquisitionError(blockers);

  return {
    timeframe: request.timeframe,
    openTime: new Date(openTimeMs!).toISOString(),
    closeTime: new Date(closeTimeMs!).toISOString(),
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
    sourceFile: `${PUBLIC_ORIGIN}${PUBLIC_KLINE_PATH}`,
    sourceLine,
    openTimeMs: openTimeMs!,
    closeTimeMs: closeTimeMs!,
  };
}

export function normalizeAcquiredCandles(rows: unknown[], request: BoundedRequestPlan): ParsedCandle[] {
  const parsed: ParsedCandle[] = [];
  const blockers = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    try {
      parsed.push(parseRawCandle(rows[index], request, index + 1));
    } catch (error) {
      if (!(error instanceof AcquisitionError)) throw error;
      for (const blocker of error.blockers) blockers.add(blocker);
    }
  }
  if (blockers.size > 0) throw new AcquisitionError(blockers);
  return parsed.sort((left, right) => left.openTimeMs - right.openTimeMs);
}

function candleIdentity(candle: ParsedCandle): string {
  return [candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTimeMs].join("|");
}

export function validateExactCandleCoverage(
  rows: unknown[],
  request: BoundedRequestPlan,
): NormalizedAcquiredCandle[] {
  if (rows.length === 0) throw new AcquisitionError(["EMPTY_RESPONSE_BLOCKED", "INSUFFICIENT_COVERAGE", "UNEXPECTED_RESPONSE_COUNT"]);
  const normalized = normalizeAcquiredCandles(rows, request);
  const blockers = new Set<string>();
  const expected = new Set(generateExpectedOpenTimes(request));
  const observed = new Map<number, ParsedCandle>();

  for (const candle of normalized) {
    if (candle.closeTimeMs > request.evaluationBoundaryMs) blockers.add("FUTURE_LEAK_BLOCKED");
    if (candle.openTimeMs < request.startTimeMs || candle.openTimeMs > request.lastOpenTimeMs) {
      blockers.add("OUT_OF_RANGE_CANDLE_BLOCKED");
      if (candle.closeTimeMs > request.evaluationBoundaryMs) blockers.add("FUTURE_LEAK_BLOCKED");
      continue;
    }
    if (!expected.has(candle.openTimeMs)) blockers.add("TIMESTAMP_ALIGNMENT_BLOCKED");
    const previous = observed.get(candle.openTimeMs);
    if (previous) {
      blockers.add(candleIdentity(previous) === candleIdentity(candle)
        ? "DUPLICATE_CANDLE_BLOCKED"
        : "CONFLICTING_DUPLICATE_BLOCKED");
    } else {
      observed.set(candle.openTimeMs, candle);
    }
  }

  for (const openTime of expected) {
    if (!observed.has(openTime)) blockers.add("GAP_DETECTED");
  }
  if (observed.size < request.expectedCount) blockers.add("INSUFFICIENT_COVERAGE");
  if (rows.length !== request.expectedCount || observed.size !== request.expectedCount) {
    blockers.add("UNEXPECTED_RESPONSE_COUNT");
  }
  if (blockers.size > 0) throw new AcquisitionError(blockers);

  return normalized.map(({ openTimeMs: _openTimeMs, closeTimeMs: _closeTimeMs, ...candle }) => candle);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function candleJsonl(candles: readonly NormalizedAcquiredCandle[]): Uint8Array {
  return new TextEncoder().encode(`${candles.map((candle) => JSON.stringify(candle)).join("\n")}\n`);
}

type ManifestContext = {
  runId?: string;
  implementationCommit?: string;
  generatedAt?: string;
  acquiredAt?: string;
  mode?: AcquisitionMode;
  requestTimeoutMs?: number;
  maxRetries?: number;
  endpointAvailability?: "NOT_YET_NETWORK_VERIFIED" | "PUBLIC_ENDPOINT_CONFIRMED" | "UNCONFIRMED";
  outputRoot?: string;
};

function requestFingerprint(request: BoundedRequestPlan): string {
  const publicRequest = buildPublicKlineRequest(request);
  return sha256(stableJson({ url: publicRequest.url, method: publicRequest.init.method, headers: publicRequest.init.headers, redirect: publicRequest.init.redirect }));
}

export function buildRequestPlanManifest(plan: BoundedAcquisitionPlan, context: ManifestContext = {}) {
  const mode = context.mode ?? "plan-only";
  const payload = {
    schemaVersion: "d8-public-candle-request-plan/v1",
    mode,
    runId: context.runId ?? "UNSPECIFIED",
    implementationCommit: context.implementationCommit ?? "UNSPECIFIED",
    generatedAt: context.generatedAt ?? "UNSPECIFIED",
    acquiredAt: context.acquiredAt ?? null,
    sourceExchange: "BINGX",
    sourceEndpoint: `${PUBLIC_ORIGIN}${PUBLIC_KLINE_PATH}`,
    endpointVersion: "swap-v3",
    authenticationMode: "PUBLIC_UNAUTHENTICATED_ONLY",
    authenticationUsed: false,
    endpointAvailability: context.endpointAvailability ?? (mode === "plan-only" ? "NOT_YET_NETWORK_VERIFIED" : "UNCONFIRMED"),
    dryRun: mode === "dry-run",
    apply: mode === "apply",
    networkUsed: mode !== "plan-only",
    requestTimeoutMs: context.requestTimeoutMs ?? 15_000,
    maxRetries: context.maxRetries ?? 2,
    outputPlan: mode === "apply" ? {
      finalRoot: context.outputRoot ? path.resolve(context.outputRoot) : "UNSPECIFIED",
      immutable: true,
    } : null,
    evaluationBoundary: plan.evaluationBoundary,
    canonicalSymbol: plan.symbol,
    endpointSymbol: plan.symbol,
    marketType: plan.marketType,
    sourcePackRoot: plan.sourcePackRoot,
    totalExpectedCandles: plan.totalExpectedCandles,
    requestFingerprints: Object.fromEntries(plan.requests.map((request) => [request.timeframe, requestFingerprint(request)])),
    requests: plan.requests.map((request) => ({
      timeframe: request.timeframe,
      interval: request.publicInterval,
      startTime: new Date(request.startTimeMs).toISOString(),
      lastOpenTime: new Date(request.lastOpenTimeMs).toISOString(),
      endTime: new Date(request.endTimeMs).toISOString(),
      expectedCount: request.expectedCount,
      limit: request.limit,
      requestCount: request.requestCount,
    })),
  };
  return { ...payload, requestPlanPayloadSHA256: sha256(stableJson(payload)) };
}

export function buildAcquisitionManifest(
  plan: BoundedAcquisitionPlan,
  candles: Record<string, readonly NormalizedAcquiredCandle[]>,
  provenance: { implementationCommit?: string; sourcePackRoot: string } & ManifestContext,
  linkage?: {
    requestPlan: ReturnType<typeof buildRequestPlanManifest>;
    requestPlanBytes: Uint8Array;
    requestPlanSHA256: string;
  },
) {
  const candleFileSHA256 = Object.fromEntries(
    APPROVED_TIMEFRAMES.map((timeframe) => [
      `candles-${timeframe}.jsonl`,
      sha256(candleJsonl(candles[timeframe] ?? [])),
    ]),
  );
  const mode = provenance.mode ?? "dry-run";
  const requestPlan = linkage?.requestPlan ?? buildRequestPlanManifest(plan, provenance);
  const requestPlanBytes = linkage?.requestPlanBytes ?? jsonBytes(requestPlan);
  const requestPlanSHA256 = sha256(requestPlanBytes);
  if (linkage && linkage.requestPlanSHA256 !== requestPlanSHA256) {
    throw new AcquisitionError(["REQUEST_PLAN_LINKAGE_INVALID"]);
  }
  const candleCounts = Object.fromEntries(APPROVED_TIMEFRAMES.map((timeframe) => [timeframe, candles[timeframe]?.length ?? 0]));
  const totalCandleCount = APPROVED_TIMEFRAMES.reduce((total, timeframe) => total + (candles[timeframe]?.length ?? 0), 0);
  const payload = {
    schemaVersion: "d8-public-candle-acquisition/v1",
    runId: provenance.runId ?? "UNSPECIFIED",
    generatedAt: provenance.generatedAt ?? "UNSPECIFIED",
    acquiredAt: provenance.acquiredAt ?? provenance.generatedAt ?? "UNSPECIFIED",
    evaluationBoundary: plan.evaluationBoundary,
    sourceExchange: "BINGX",
    sourceEndpoint: `${PUBLIC_ORIGIN}${PUBLIC_KLINE_PATH}`,
    endpointVersion: "swap-v3",
    canonicalSymbol: plan.symbol,
    endpointSymbol: plan.symbol,
    marketType: plan.marketType,
    sourcePackRoot: provenance.sourcePackRoot,
    implementationCommit: provenance.implementationCommit ?? "UNSPECIFIED",
    authenticationMode: "PUBLIC_UNAUTHENTICATED_ONLY",
    authenticationUsed: false,
    endpointAvailability: provenance.endpointAvailability ?? "PUBLIC_ENDPOINT_CONFIRMED",
    dryRun: mode === "dry-run",
    apply: mode === "apply",
    networkUsed: true,
    requestTimeoutMs: provenance.requestTimeoutMs ?? 15_000,
    maxRetries: provenance.maxRetries ?? 2,
    requestFingerprints: requestPlan.requestFingerprints,
    timeframeResults: Object.fromEntries(APPROVED_TIMEFRAMES.map((timeframe) => [timeframe, {
      expectedCount: APPROVED_WINDOWS[timeframe].expectedCount,
      acceptedCount: candles[timeframe]?.length ?? 0,
      blockers: [],
    }])),
    qualityCounters: {
      expectedTotal: plan.totalExpectedCandles,
      acceptedTotal: totalCandleCount,
      rejectedTotal: plan.totalExpectedCandles - totalCandleCount,
      blockerCount: 0,
    },
    blockers: [],
    totalCandleCount,
    candleCounts,
    candleFileSHA256,
    requestPlanPath: "request-plan.json",
    requestPlanSHA256,
    safety: {
      publicUnauthenticatedOnly: true,
      exactTemporalCoverageRequired: true,
      futureLeakBlocked: true,
      activationAllowed: false,
      paperActivationAllowed: false,
      liveActivationAllowed: false,
      reviewOnly: true,
      shadowOnly: true,
    },
  };
  return { ...payload, manifestPayloadSHA256: sha256(stableJson(payload)) };
}

function isDirectChild(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative) && !relative.includes(path.sep);
}

export function planAtomicApply(input: {
  boundedPlan: BoundedAcquisitionPlan;
  candles: Record<string, readonly NormalizedAcquiredCandle[]>;
  outputRoot: string;
  approvedOutputParent: string;
  implementationCommit?: string;
  runId?: string;
  generatedAt?: string;
  acquiredAt?: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  requestPlan?: ReturnType<typeof buildRequestPlanManifest>;
  requestPlanBytes?: Uint8Array;
  requestPlanSHA256?: string;
  acquisitionManifest?: ReturnType<typeof buildAcquisitionManifest>;
}) {
  if (!isDirectChild(input.approvedOutputParent, input.outputRoot)) {
    throw new AcquisitionError(["OUTPUT_ROOT_FORBIDDEN"]);
  }
  const manifestContext: ManifestContext = {
    implementationCommit: input.implementationCommit,
    mode: "apply",
    runId: input.runId,
    generatedAt: input.generatedAt,
    acquiredAt: input.acquiredAt,
    requestTimeoutMs: input.requestTimeoutMs,
    maxRetries: input.maxRetries,
    endpointAvailability: "PUBLIC_ENDPOINT_CONFIRMED",
    outputRoot: input.outputRoot,
  };
  const requestPlan = input.requestPlan ?? buildRequestPlanManifest(input.boundedPlan, manifestContext);
  const requestPlanBytes = input.requestPlanBytes ?? jsonBytes(requestPlan);
  const requestPlanSHA256 = sha256(requestPlanBytes);
  if (input.requestPlanSHA256 !== undefined && input.requestPlanSHA256 !== requestPlanSHA256) {
    throw new AcquisitionError(["REQUEST_PLAN_LINKAGE_INVALID"]);
  }
  const linkage = { requestPlan, requestPlanBytes, requestPlanSHA256 };
  const acquisitionManifest = input.acquisitionManifest ?? buildAcquisitionManifest(input.boundedPlan, input.candles, {
    ...manifestContext,
    sourcePackRoot: input.boundedPlan.sourcePackRoot,
  }, linkage);
  if (acquisitionManifest.requestPlanSHA256 !== requestPlanSHA256) {
    throw new AcquisitionError(["REQUEST_PLAN_LINKAGE_INVALID"]);
  }
  const files = new Map<string, Uint8Array>();
  files.set("request-plan.json", requestPlanBytes);
  files.set("acquisition-manifest.json", jsonBytes(acquisitionManifest));
  for (const timeframe of APPROVED_TIMEFRAMES) {
    files.set(`candles-${timeframe}.jsonl`, candleJsonl(input.candles[timeframe] ?? []));
  }
  const checksums = [...files]
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
    .sort()
    .join("\n");
  files.set("checksums.sha256", new TextEncoder().encode(`${checksums}\n`));
  return {
    outputRoot: path.resolve(input.outputRoot),
    temporaryRoot: path.resolve(`${input.outputRoot}.tmp`),
    files,
    requestPlan,
    acquisitionManifest,
  };
}

async function acquireOne(
  request: BoundedRequestPlan,
  options: AcquireD8PublicCandlesOptions,
  transport: PublicTransport,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<NormalizedAcquiredCandle[]> {
  const publicRequest = buildPublicKlineRequest(request, options.requestTimeoutMs);
  let lastBlocker = "PUBLIC_ENDPOINT_UNREACHABLE";
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      const response = await transport(publicRequest.url, publicRequest.init);
      const blocker = classifyPublicTransportFailure(response);
      if (blocker === "PUBLIC_ENDPOINT_AUTH_REQUIRED") throw new AcquisitionError([blocker], undefined, "UNCONFIRMED");
      if (blocker) {
        lastBlocker = blocker;
        if ((blocker === "RATE_LIMIT_EXHAUSTED" || blocker === "HTTP_REQUEST_FAILED") && attempt < options.maxRetries) {
          await sleep(25 * (attempt + 1));
          continue;
        }
        throw new AcquisitionError([blocker]);
      }
      return validateExactCandleCoverage(parsePublicKlineResponse(response.bodyText, response.status), request);
    } catch (error) {
      if (error instanceof AcquisitionError) throw error;
      lastBlocker = "PUBLIC_ENDPOINT_UNREACHABLE";
      if (attempt < options.maxRetries) {
        await sleep(25 * (attempt + 1));
        continue;
      }
    }
  }
  throw new AcquisitionError([lastBlocker]);
}

async function applyFiles(
  applyPlan: ReturnType<typeof planAtomicApply>,
  filesystem: FilesystemAdapter,
): Promise<void> {
  if ((await filesystem.stat(applyPlan.outputRoot)).exists) {
    throw new AcquisitionError(["OUTPUT_ROOT_EXISTS"]);
  }
  if ((await filesystem.stat(applyPlan.temporaryRoot)).exists) {
    throw new AcquisitionError(["TEMP_OUTPUT_EXISTS"]);
  }
  let temporaryCreated = false;
  try {
    await filesystem.mkdir(applyPlan.temporaryRoot);
    temporaryCreated = true;
    for (const [name, bytes] of applyPlan.files) {
      await filesystem.writeFile(path.join(applyPlan.temporaryRoot, name), bytes);
    }
    await filesystem.rename(applyPlan.temporaryRoot, applyPlan.outputRoot);
    temporaryCreated = false;
  } catch (error) {
    if (temporaryCreated) await filesystem.rm(applyPlan.temporaryRoot);
    if (error instanceof AcquisitionError) throw error;
    throw new AcquisitionError(["ATOMIC_WRITE_FAILED"], error instanceof Error ? error.message : undefined);
  }
}

function validateRuntimeOptions(options: unknown): asserts options is AcquireD8PublicCandlesOptions {
  if (!options || typeof options !== "object") {
    throw new AcquisitionError(["INVALID_RUNTIME_MODE"]);
  }
  const candidate = options as Partial<AcquireD8PublicCandlesOptions>;
  if (candidate.mode !== "plan-only" && candidate.mode !== "dry-run" && candidate.mode !== "apply") {
    throw new AcquisitionError(["INVALID_RUNTIME_MODE"]);
  }
  if (
    !Number.isFinite(candidate.requestTimeoutMs)
    || !Number.isInteger(candidate.requestTimeoutMs)
    || candidate.requestTimeoutMs! <= 0
    || !Number.isFinite(candidate.maxRetries)
    || !Number.isInteger(candidate.maxRetries)
    || candidate.maxRetries! < 0
    || candidate.maxRetries! > 5
  ) {
    throw new AcquisitionError(["INVALID_RUNTIME_OPTIONS"]);
  }
  if (
    candidate.mode === "apply"
    && (
      typeof candidate.runId !== "string"
      || candidate.runId.trim().length === 0
      || typeof candidate.outputRoot !== "string"
      || candidate.outputRoot.trim().length === 0
    )
  ) {
    throw new AcquisitionError(["INVALID_RUNTIME_OPTIONS"]);
  }
}

export async function runAcquireD8PublicCandles(
  options: AcquireD8PublicCandlesOptions,
  dependencies: AcquisitionDependencies = {},
) {
  validateRuntimeOptions(options);
  const boundedPlan = buildBoundedAcquisitionPlan(options);
  if (!exactTimeframes(options.timeframes)) throw new AcquisitionError(["UNAPPROVED_TIMEFRAME_SET"]);
  const provenanceTime = dependencies.now?.() ?? "UNSPECIFIED";
  const manifestContext: ManifestContext = {
    runId: options.runId,
    implementationCommit: options.implementationCommit,
    generatedAt: provenanceTime,
    acquiredAt: options.mode === "plan-only" ? undefined : provenanceTime,
    mode: options.mode,
    requestTimeoutMs: options.requestTimeoutMs,
    maxRetries: options.maxRetries,
    endpointAvailability: options.mode === "plan-only" ? "NOT_YET_NETWORK_VERIFIED" : "PUBLIC_ENDPOINT_CONFIRMED",
    outputRoot: options.outputRoot,
  };
  const requestPlan = buildRequestPlanManifest(boundedPlan, manifestContext);
  const requestPlanBytes = jsonBytes(requestPlan);
  const requestPlanSHA256 = sha256(requestPlanBytes);
  if (options.mode === "plan-only") {
    return { mode: options.mode, requestPlan, requestPlanSHA256, candleCount: 0, blockers: [] as string[] };
  }

  const transport = dependencies.transport ?? defaultTransport;
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const candles: Record<string, NormalizedAcquiredCandle[]> = {};
  for (const request of boundedPlan.requests) {
    candles[request.timeframe] = await acquireOne(request, options, transport, sleep);
  }

  const candleCount = Object.values(candles).reduce((total, rows) => total + rows.length, 0);
  const acquisitionManifest = buildAcquisitionManifest(boundedPlan, candles, {
    implementationCommit: options.implementationCommit,
    sourcePackRoot: options.sourcePackRoot,
    ...manifestContext,
  }, { requestPlan, requestPlanBytes, requestPlanSHA256 });
  if (options.mode === "dry-run") {
    return { mode: options.mode, requestPlan, requestPlanSHA256, acquisitionManifest, candleCount, blockers: [] as string[] };
  }

  if (!options.outputRoot) throw new AcquisitionError(["OUTPUT_ROOT_REQUIRED"]);
  const approvedOutputParent = dependencies.approvedOutputParent
    ?? "C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-public-candle-acquisition";
  const atomicPlan = planAtomicApply({
    boundedPlan,
    candles,
    outputRoot: options.outputRoot,
    approvedOutputParent,
    implementationCommit: options.implementationCommit,
    runId: options.runId,
    generatedAt: provenanceTime,
    acquiredAt: provenanceTime,
    requestTimeoutMs: options.requestTimeoutMs,
    maxRetries: options.maxRetries,
    requestPlan,
    requestPlanBytes,
    requestPlanSHA256,
    acquisitionManifest,
  });
  await applyFiles(atomicPlan, dependencies.fs ?? defaultFilesystem);
  return {
    mode: options.mode,
    requestPlan,
    requestPlanSHA256,
    acquisitionManifest,
    candleCount,
    outputRoot: atomicPlan.outputRoot,
    blockers: [] as string[],
  };
}

export async function main(
  args = process.argv.slice(2),
  dependencies: AcquisitionDependencies = {},
) {
  const options = parseAcquireD8PublicCandlesArgs(args);
  const result = await runAcquireD8PublicCandles(options, dependencies);
  (dependencies.log ?? console.log)(JSON.stringify(result, null, 2));
  return result;
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  main().catch((error) => {
    const blockers = error instanceof AcquisitionError ? error.blockers : ["UNEXPECTED_FAILURE"];
    console.error(JSON.stringify({ status: "BLOCKED", blockers }, null, 2));
    process.exitCode = 1;
  });
}
