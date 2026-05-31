import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RunCycleBody = {
  noNews?: boolean;
  observe?: boolean;
  planUpdate?: boolean;
  planForce?: boolean;
  noHoldRefresh?: boolean;
  symbol?: string;
  klineLimit?: number;
  h1Limit?: number;
  depthLimit?: number;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function maskValue(v: string | null | undefined) {
  if (!v) return null;
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}********${v.slice(-2)}`;
}

function normalizeBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

function normalizeInt(v: unknown, fallback?: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function getAuthToken(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  const headerKey =
    req.headers.get("x-run-cycle-key") ||
    req.headers.get("x-internal-key") ||
    req.headers.get("x-api-key");

  if (headerKey) return headerKey.trim();

  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey) return urlKey.trim();

  return null;
}

function verifyAuth(req: NextRequest) {
  const expected =
    process.env.RUN_CYCLE_TRIGGER_KEY ||
    process.env.INTERNAL_API_KEY ||
    process.env.REFRESH_ENDPOINT_KEY ||
    "";

  if (!expected) {
    return {
      ok: false,
      reason:
        "missing server secret: set RUN_CYCLE_TRIGGER_KEY (or INTERNAL_API_KEY / REFRESH_ENDPOINT_KEY)",
      expectedMasked: null as string | null,
      receivedMasked: null as string | null,
    };
  }

  const received = getAuthToken(req);

  return {
    ok: !!received && received === expected,
    reason: received ? "bad key" : "missing key",
    expectedMasked: maskValue(expected),
    receivedMasked: maskValue(received),
  };
}

function resolveRunCyclePath() {
  const cwd = process.cwd();

  const envPath = process.env.RUN_CYCLE_PATH;
  const candidates = [
    envPath,
    path.join(cwd, "run_cycle.js"),
    path.join(cwd, "..", "run_cycle.js"),
    path.join(cwd, "..", "..", "run_cycle.js"),
    path.join(cwd, "scripts", "run_cycle.js"),
    path.join(cwd, "..", "scripts", "run_cycle.js"),
    path.join(cwd, "..", "..", "scripts", "run_cycle.js"),
    "/var/www/vhosts/ob-gate.com/httpdocs/run_cycle.js",
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return path.resolve(p);
    } catch {}
  }

  return null;
}

function resolveDataDir(runCyclePath: string) {
  const envDir =
    process.env.DATA_DIR ||
    process.env.BINGX_AGENT_DIR ||
    process.env.OBGATE_DATA_DIR ||
    "";

  if (envDir) return envDir;

  try {
    return path.dirname(runCyclePath);
  } catch {
    return process.cwd();
  }
}

function buildArgs(body: RunCycleBody) {
  const noNews = normalizeBool(body.noNews, true);
  const observe = normalizeBool(body.observe, false);
  const planUpdate = normalizeBool(body.planUpdate, false);
  const planForce = normalizeBool(body.planForce, false);
  const noHoldRefresh = normalizeBool(body.noHoldRefresh, false);

  if (planForce && observe) {
    return {
      ok: false,
      reason: "--plan-force cannot be combined with --observe",
      args: [] as string[],
    };
  }

  const args: string[] = [];

  if (noNews) args.push("--no-news");
  if (observe) args.push("--observe");
  if (planUpdate) args.push("--plan-update");
  if (planForce) args.push("--plan-force");
  if (noHoldRefresh) args.push("--no-hold-refresh");

  return {
    ok: true,
    reason: null,
    args,
  };
}

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
    });
  }

  let body: RunCycleBody = {};
  try {
    body = (await req.json()) as RunCycleBody;
  } catch {
    body = {};
  }

  const argBuild = buildArgs(body);
  if (!argBuild.ok) {
    return json(400, {
      ok: false,
      error: "bad_request",
      reason: argBuild.reason,
    });
  }

  const runCyclePath = resolveRunCyclePath();
  if (!runCyclePath) {
    return json(500, {
      ok: false,
      error: "run_cycle_not_found",
      searchedFrom: process.cwd(),
    });
  }

  const dataDir = resolveDataDir(runCyclePath);
  const symbol = String(body.symbol || process.env.SYMBOL || "BTC-USDT").trim();
  const klineLimit = normalizeInt(body.klineLimit, undefined);
  const h1Limit = normalizeInt(body.h1Limit, undefined);
  const depthLimit = normalizeInt(body.depthLimit, undefined);

  const startedAt = Date.now();

  const child = spawnSync(process.execPath, [runCyclePath, ...argBuild.args], {
    cwd: path.dirname(runCyclePath),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      BINGX_AGENT_DIR: dataDir,
      SYMBOL: symbol,
      ...(klineLimit ? { KLINE_LIMIT: String(klineLimit) } : {}),
      ...(h1Limit ? { KLINE_LIMIT_1H: String(h1Limit), H1_LIMIT: String(h1Limit) } : {}),
      ...(depthLimit ? { DEPTH_LIMIT: String(depthLimit) } : {}),
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
  });

  const finishedAt = Date.now();
  const durationMs = finishedAt - startedAt;
  const exitCode = child.status ?? 1;
  const stdout = String(child.stdout || "").trim();
  const stderr = String(child.stderr || "").trim();

  const response = {
    ok: exitCode === 0,
    action: "RUN_CYCLE_ONCE",
    exitCode,
    durationMs,
    startedAt,
    finishedAt,
    scriptPath: runCyclePath,
    cwd: path.dirname(runCyclePath),
    dataDir,
    args: argBuild.args,
    input: {
      symbol,
      noNews: argBuild.args.includes("--no-news"),
      observe: argBuild.args.includes("--observe"),
      planUpdate: argBuild.args.includes("--plan-update"),
      planForce: argBuild.args.includes("--plan-force"),
      noHoldRefresh: argBuild.args.includes("--no-hold-refresh"),
      klineLimit: klineLimit ?? null,
      h1Limit: h1Limit ?? null,
      depthLimit: depthLimit ?? null,
    },
    stdout,
    stderr,
  };

  if (exitCode === 0) {
    return json(200, response);
  }

  return json(500, response);
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
    });
  }

  const runCyclePath = resolveRunCyclePath();

  return json(200, {
    ok: true,
    action: "RUN_CYCLE_ENDPOINT_INFO",
    runtime: "nodejs",
    route: "/api/internal/run-cycle",
    method: "POST",
    runCyclePath,
    cwd: process.cwd(),
    hasSecret: !!(
      process.env.RUN_CYCLE_TRIGGER_KEY ||
      process.env.INTERNAL_API_KEY ||
      process.env.REFRESH_ENDPOINT_KEY
    ),
    acceptedBody: {
      noNews: "boolean",
      observe: "boolean",
      planUpdate: "boolean",
      planForce: "boolean",
      noHoldRefresh: "boolean",
      symbol: "string",
      klineLimit: "number",
      h1Limit: "number",
      depthLimit: "number",
    },
  });
}