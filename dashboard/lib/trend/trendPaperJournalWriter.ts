import * as fs from "fs/promises";
import * as path from "path";

import type { TrendClosedTradeInput } from "./trendEdgeReview.ts";
import type { TrendPaperPosition } from "./trendPaperExecutionEngine.ts";
import {
  TREND_PAPER_JOURNAL_SCHEMA_VERSION,
  type TrendPaperJournalEvent,
  type ValidationResult,
  validateTrendPaperJournalEvent,
} from "./trendPaperJournalSchema.ts";

export const TREND_PAPER_JOURNAL_FILE_NAME = "trend_paper_journal.jsonl";

export interface TrendPaperJournalSnapshot {
  path: string;
  exists: boolean;
  events: TrendPaperJournalEvent[];
  openPosition: TrendPaperPosition | null;
  lastEntryAt: string | null;
  lastExitAt: string | null;
  closedTrades: TrendClosedTradeInput[];
  invalidRiskModelCount?: number;
  invalidMissingStopLossCount?: number;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveTrendPaperJournalPath(rootDir?: string | null): string {
  const baseDir = rootDir
    ? path.resolve(rootDir)
    : path.resolve(process.cwd(), "tmp");
  return path.resolve(baseDir, "trend-paper", TREND_PAPER_JOURNAL_FILE_NAME);
}

function validateJournalPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.endsWith(`/trend-paper/${TREND_PAPER_JOURNAL_FILE_NAME}`);
}

function eventPositionId(event: TrendPaperJournalEvent): string {
  return strOrNull((event as unknown as Record<string, unknown>).positionId)
    ?? `${event.setupId}:${event.epochId}`;
}

function eventTsIso(event: TrendPaperJournalEvent): string | null {
  const raw = event.ts;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toTrendClosedTrade(event: TrendPaperJournalEvent): TrendClosedTradeInput | null {
  if (event.eventType !== "TREND_PAPER_EXIT" && event.eventType !== "TREND_PAPER_INVALIDATED") return null;
  if (event.countTowardTrendEvidence !== true) return null;
  const stopLoss = numberOrNull(event.stopLoss);
  if (!finite(stopLoss)) return null;
  const riskAmount = numberOrNull(event.riskAmountPaper);
  const grossPnl = numberOrNull(event.grossPnlPaper);
  const netPnl = numberOrNull(event.netPnlPaper);
  const grossR = finite(riskAmount) && riskAmount > 0 && finite(grossPnl) ? grossPnl / riskAmount : null;
  const netR = finite(riskAmount) && riskAmount > 0 && finite(netPnl) ? netPnl / riskAmount : null;
  if (!finite(grossR ?? null) && !finite(netR ?? null)) return null;
  return {
    rMultiple: grossR ?? netR ?? 0,
    netRMultiple: netR,
    feeCost: numberOrNull(event.feeEstimate),
    slippageCost: numberOrNull(event.slippageEstimate),
    fundingCost: 0,
    failureLabel: strOrNull(event.exitReason),
    // T-3H-2 evidence enrichment (real, from enriched exit event)
    holdTimeMinutes: numberOrNull((event as { holdTimeMinutes?: unknown }).holdTimeMinutes),
    direction: event.direction === "LONG" || event.direction === "SHORT" ? event.direction : null,
    exitReason: strOrNull(event.exitReason),
    stopLoss,
  };
}

function isClosingTrendEvidenceEvent(event: TrendPaperJournalEvent): boolean {
  return (
    (event.eventType === "TREND_PAPER_EXIT" || event.eventType === "TREND_PAPER_INVALIDATED") &&
    event.countTowardTrendEvidence === true
  );
}

function hasMissingStopLoss(event: TrendPaperJournalEvent): boolean {
  return isClosingTrendEvidenceEvent(event) && !finite(numberOrNull(event.stopLoss));
}

function replayOpenPosition(events: TrendPaperJournalEvent[]): TrendPaperPosition | null {
  let openPosition: TrendPaperPosition | null = null;

  for (const event of events) {
    const positionId = eventPositionId(event);
    if (event.eventType === "TREND_PAPER_ENTRY") {
      const entryPrice = numberOrNull(event.fillPricePaper);
      const stopLoss = numberOrNull(event.stopLoss);
      const takeProfit1 = numberOrNull(event.takeProfit1);
      const quantityPaper = numberOrNull(event.quantityPaper);
      const riskAmountPaper = numberOrNull(event.riskAmountPaper);
      if (
        !finite(entryPrice) ||
        !finite(stopLoss) ||
        !finite(takeProfit1) ||
        !finite(quantityPaper) ||
        !finite(riskAmountPaper)
      ) {
        continue;
      }
      openPosition = {
        positionId,
        setupId: event.setupId,
        epochId: event.epochId,
        symbol: event.symbol,
        direction: event.direction,
        entryPrice,
        stopLoss,
        takeProfit1,
        takeProfit2: numberOrNull(event.takeProfit2),
        quantityPaper,
        remainingQuantityPaper: quantityPaper,
        riskAmountPaper,
        entryFeeEstimate: numberOrNull(event.feeEstimate) ?? 0,
        entrySlippageEstimate: numberOrNull(event.slippageEstimate) ?? 0,
        openedAt: eventTsIso(event) ?? new Date().toISOString(),
        status: "OPEN",
      };
      continue;
    }

    if (!openPosition || openPosition.positionId !== positionId) continue;

    if (event.eventType === "TREND_PAPER_PARTIAL") {
      const partialQty = numberOrNull(event.quantityPaper);
      if (finite(partialQty) && partialQty > 0) {
        openPosition.remainingQuantityPaper = Math.max(0, openPosition.remainingQuantityPaper - partialQty);
      } else {
        openPosition.remainingQuantityPaper = openPosition.remainingQuantityPaper / 2;
      }
      openPosition.status = openPosition.remainingQuantityPaper > 0 ? "PARTIAL_TP1" : "CLOSED";
      if (openPosition.status === "CLOSED") openPosition = null;
      continue;
    }

    if (event.eventType === "TREND_PAPER_EXIT" || event.eventType === "TREND_PAPER_INVALIDATED") {
      openPosition = null;
      continue;
    }

    if (event.eventType === "TREND_PAPER_CANCEL") {
      openPosition = null;
    }
  }

  return openPosition;
}

export async function appendTrendPaperJournalEvent(
  event: TrendPaperJournalEvent,
  options: { filePath?: string | null } = {},
): Promise<{ ok: true; path: string; validation: ValidationResult }> {
  const filePath = options.filePath
    ? path.resolve(options.filePath)
    : resolveTrendPaperJournalPath();
  if (!validateJournalPath(filePath)) {
    throw new Error("trend_paper_journal_path_not_allowed");
  }

  const validation = validateTrendPaperJournalEvent(event);
  if (!validation.valid) {
    throw new Error(`trend_paper_journal_validation_failed:${validation.errors.join(",")}`);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify({ ...event, schemaVersion: TREND_PAPER_JOURNAL_SCHEMA_VERSION })}\n`, "utf8");
  return { ok: true, path: filePath, validation };
}

export async function readTrendPaperJournalSnapshot(
  options: { filePath?: string | null } = {},
): Promise<TrendPaperJournalSnapshot> {
  const filePath = options.filePath
    ? path.resolve(options.filePath)
    : resolveTrendPaperJournalPath();

  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return {
      path: filePath,
      exists: false,
      events: [],
      openPosition: null,
      lastEntryAt: null,
      lastExitAt: null,
      closedTrades: [],
      invalidRiskModelCount: 0,
      invalidMissingStopLossCount: 0,
    };
  }

  const events = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        const record = asRecord(parsed);
        return record ? [record as unknown as TrendPaperJournalEvent] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => {
      const ta = Date.parse(String(a.ts));
      const tb = Date.parse(String(b.ts));
      return ta - tb;
    });

  const lastEntry = [...events].reverse().find((event) => event.eventType === "TREND_PAPER_ENTRY") ?? null;
  const lastExit = [...events].reverse().find((event) => event.eventType === "TREND_PAPER_EXIT" || event.eventType === "TREND_PAPER_INVALIDATED") ?? null;
  const closedTrades = events.flatMap((event) => {
    const trade = toTrendClosedTrade(event);
    return trade ? [trade] : [];
  });
  const invalidMissingStopLossCount = events.filter(hasMissingStopLoss).length;

  return {
    path: filePath,
    exists: true,
    events,
    openPosition: replayOpenPosition(events),
    lastEntryAt: lastEntry ? eventTsIso(lastEntry) : null,
    lastExitAt: lastExit ? eventTsIso(lastExit) : null,
    closedTrades,
    invalidRiskModelCount: invalidMissingStopLossCount,
    invalidMissingStopLossCount,
  };
}
