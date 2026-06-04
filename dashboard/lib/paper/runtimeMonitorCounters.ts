import * as fs from "fs/promises";
import * as path from "path";
import type { RuntimeMonitorCounters } from "./paperLoopDiagnostics";

type JsonEvent = {
  ts?: number | string;
  timestamp?: number | string;
  at?: number | string;
  type?: string;
  mode?: string;
  payload?: Record<string, unknown>;
};

const MAX_LINES_PER_FILE = 100_000;

function resolveAuditRootDir(): string {
  const explicit = process.env.EXECUTION_AUDIT_LOG_PATH;
  if (explicit) return path.dirname(path.resolve(explicit));

  const rootDir =
    process.env.EXECUTION_AUDIT_ROOT_DIR ??
    process.env.BINGX_AGENT_DIR ??
    null;

  if (rootDir) return path.resolve(rootDir, "tmp");
  return path.resolve(process.cwd(), "tmp");
}

function isoFromEventTime(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function eventIso(event: JsonEvent): string | null {
  return isoFromEventTime(event.ts ?? event.timestamp ?? event.at ?? event.payload?.ts ?? event.payload?.timestamp);
}

function newerIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function asEvent(line: string): JsonEvent | null {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" ? parsed as JsonEvent : null;
  } catch {
    return null;
  }
}

async function readJsonlEvents(filePath: string): Promise<JsonEvent[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES_PER_FILE)
    .flatMap((line) => {
      const event = asEvent(line);
      return event ? [event] : [];
    });
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => path.join(dir, entry));
  } catch {
    return [];
  }
}

function sideOf(event: JsonEvent): string | null {
  const direct = typeof (event as Record<string, unknown>).side === "string"
    ? String((event as Record<string, unknown>).side)
    : null;
  const payload = typeof event.payload?.side === "string" ? event.payload.side : null;
  return (direct ?? payload)?.trim().toUpperCase() ?? null;
}

export async function readRuntimeMonitorCounters(): Promise<RuntimeMonitorCounters> {
  const auditRootDir = resolveAuditRootDir();
  const rootFiles = await listJsonlFiles(auditRootDir);
  const runnerFiles = await listJsonlFiles(path.join(auditRootDir, "execution-runner"));
  const allFiles = [...rootFiles, ...runnerFiles];

  let cumulativeBuyFillCount = 0;
  let cumulativeSellFillCount = 0;
  let paperNoTradeCount = 0;
  let regridCandidateCount = 0;
  let latestFillAt: string | null = null;
  let latestNoTradeAt: string | null = null;
  let latestRegridCandidateAt: string | null = null;

  for (const filePath of runnerFiles) {
    for (const event of await readJsonlEvents(filePath)) {
      if (String(event.type ?? "").toUpperCase() !== "FILL_RESULT") continue;
      if (event.mode && String(event.mode).toUpperCase() !== "PAPER") continue;
      const side = sideOf(event);
      if (side === "BUY") cumulativeBuyFillCount++;
      if (side === "SELL") cumulativeSellFillCount++;
      latestFillAt = newerIso(latestFillAt, eventIso(event));
    }
  }

  for (const filePath of allFiles.filter((fp) => path.basename(fp) === "paper_no_trade.jsonl")) {
    for (const event of await readJsonlEvents(filePath)) {
      if (String(event.type ?? "PAPER_NO_TRADE").toUpperCase() !== "PAPER_NO_TRADE") continue;
      paperNoTradeCount++;
      latestNoTradeAt = newerIso(latestNoTradeAt, eventIso(event));
    }
  }

  for (const filePath of allFiles.filter((fp) => path.basename(fp) === "regrid_candidate.jsonl")) {
    for (const event of await readJsonlEvents(filePath)) {
      if (String(event.type ?? "REGRID_CANDIDATE").toUpperCase() !== "REGRID_CANDIDATE") continue;
      regridCandidateCount++;
      latestRegridCandidateAt = newerIso(latestRegridCandidateAt, eventIso(event));
    }
  }

  return {
    cumulativeBuyFillCount,
    cumulativeSellFillCount,
    paperNoTradeCount,
    regridCandidateCount,
    latestFillAt,
    latestNoTradeAt,
    latestRegridCandidateAt,
  };
}
