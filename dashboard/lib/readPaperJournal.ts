/**
 * readPaperJournal.ts
 * Phase H-2 — Paper Trading Readiness
 *
 * Read-only helper อ่าน paper execution audit logs จาก tmp/ directory
 * และคืน summary เบื้องต้นของ paper trading activity
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียน / ไม่แก้ไฟล์ใดเลย
 * - ไม่อ่านจาก root source-of-truth files (market_snapshot.json, latest_decision.json)
 * - ไม่เรียก BingX API
 * - ไม่มี API key / secret
 * - ถ้าไม่มีไฟล์ → คืน empty state ชัดเจน
 * - ไม่ throw — errors ถูก swallow + รายงานใน warnings[]
 *
 * Data source: dashboard/tmp/ หรือ EXECUTION_AUDIT_ROOT_DIR env var
 * ไฟล์ที่อ่าน: *.jsonl ใน audit directory (schema_version: "execution_audit_v1")
 */

import * as fs from "fs/promises";
import * as path from "path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PaperJournalStatus =
  | "no_paper_trades"
  | "waiting_for_paper_signals"
  | "paper_mode_disabled"
  | "has_paper_data"
  | "error";

/** สรุปเหตุการณ์ paper trading รายรายการ — ใช้แสดงใน PaperJournalPanel */
export type PaperEventSummary = {
  ts: number;
  type: string;
  symbol: string | null;
  mode: string;
  strategyMode: string | null;
  regime: string | null;
  session: string | null;
  gridSpacingPct: number | null;
  gridLower: number | null;
  gridUpper: number | null;
  gridMid: number | null;
  currentPrice: number | null;
  eventTs: number | null;
  paperModeDetected: boolean | null;
  noTradeReason: string | null;
  schemaVersion: string | null;
  eventKey: string | null;
  // จาก ORDER_SIMULATED payload
  orderId: string | null;
  orderStatus: string | null;
  filledQuantity: number | null;
  averageFillPrice: number | null;
  // จาก INTENT_CREATED payload.decision.intents[0]
  side: string | null;
  quantity: number | null;
  kind: string | null;
  // safety guarantee — never a live order
  liveOrder: false;
  source: "paper_audit_log";
};

export type PaperJournalSummary = {
  status: PaperJournalStatus;
  totalPaperEvents: number;
  totalOrderSimulated: number;
  totalOrderFilled: number;
  buyFillCount: number;
  sellFillCount: number;
  totalOrderCanceled: number;
  totalOrderRejected: number;
  openPaperOrders: number;
  lastPaperEventAt: string | null;
  lastPaperEventType: string | null;
  lastPaperMode: string | null;
  paperModeDetected: boolean;
  auditFilesScanned: number;
  auditRootDir: string | null;
  warnings: string[];
  checkedAt: string;
  /** เหตุการณ์ paper ล่าสุด (สูงสุด 20 รายการ, เรียงจากใหม่ไปเก่า) — optional เพื่อ backward-compatible */
  recentEvents?: PaperEventSummary[];
};

type AuditEvent = {
  schema_version?: string;
  ts?: number;
  type?: string;
  symbol?: string;
  mode?: string;
  eventKey?: string;
  payload?: Record<string, unknown>;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const PAPER_ORDER_EVENTS = new Set([
  "ORDER_SIMULATED",
  "ORDER_FILLED",
  "ORDER_PARTIALLY_FILLED",
  "ORDER_CANCELED",
  "ORDER_REJECTED",
  "ORDER_ACCEPTED",
  "FILL_RESULT", // Phase M-0B: actual fill price captured after syncState
]);

const TERMINAL_ORDER_EVENTS = new Set(["ORDER_FILLED", "ORDER_CANCELED", "ORDER_REJECTED", "FILL_RESULT"]);

const MAX_FILES_TO_SCAN = 30;
const MAX_LINES_PER_FILE = 2000;
const MAX_RECENT_EVENTS = 20;

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveAuditRootDir(): string {
  const explicit = process.env.EXECUTION_AUDIT_LOG_PATH;
  if (explicit) return path.dirname(path.resolve(explicit));

  const rootDir =
    process.env.EXECUTION_AUDIT_ROOT_DIR ??
    process.env.BINGX_AGENT_DIR ??
    null;

  if (rootDir) {
    return path.resolve(rootDir, "tmp");
  }

  // fallback: cwd/tmp (matches execution-runner default)
  return path.resolve(process.cwd(), "tmp");
}

function parseLines(raw: string): AuditEvent[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES_PER_FILE)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed === "object" && parsed !== null) return [parsed as AuditEvent];
        return [];
      } catch {
        return [];
      }
    });
}

function isPaperEvent(event: AuditEvent): boolean {
  return String(event.mode ?? "").toUpperCase() === "PAPER";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readObservabilityContext(
  event: AuditEvent,
  payload: Record<string, unknown> | undefined
): Record<string, unknown> {
  const fromPayload =
    asRecord(payload?.context) ??
    asRecord(payload?.paperObservabilityContext) ??
    asRecord(payload?.observabilityContext) ??
    {};

  return {
    symbol: event.symbol,
    mode: undefined,
    ...fromPayload,
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function readPaperJournal(): Promise<PaperJournalSummary> {
  const checkedAt = new Date().toISOString();
  const warnings: string[] = [];
  const auditRootDir = resolveAuditRootDir();

  // counters
  let totalPaperEvents = 0;
  let totalOrderSimulated = 0;
  let totalOrderFilled = 0;
  let buyFillCount = 0;
  let sellFillCount = 0;
  let totalOrderCanceled = 0;
  let totalOrderRejected = 0;
  let openPaperOrders = 0;
  let lastPaperEventTs: number | null = null;
  let lastPaperEventType: string | null = null;
  let lastPaperMode: string | null = null;
  let auditFilesScanned = 0;
  let paperModeDetected = false;

  // collect recent events for display (keep all, slice later)
  const allPaperEvents: PaperEventSummary[] = [];

  // check env safety flag
  const paperEnabled = process.env.PAPER_TRADING_ENABLED;
  if (paperEnabled === "false") {
    return {
      status: "paper_mode_disabled",
      totalPaperEvents: 0,
      totalOrderSimulated: 0,
      totalOrderFilled: 0,
      buyFillCount: 0,
      sellFillCount: 0,
      totalOrderCanceled: 0,
      totalOrderRejected: 0,
      openPaperOrders: 0,
      lastPaperEventAt: null,
      lastPaperEventType: null,
      lastPaperMode: null,
      paperModeDetected: false,
      auditFilesScanned: 0,
      auditRootDir: null,
      warnings: [],
      checkedAt,
      recentEvents: [],
    };
  }

  // find audit directory — try auditRootDir and auditRootDir/execution-runner
  const candidateDirs = [
    auditRootDir,
    path.join(auditRootDir, "execution-runner"),
  ];

  let jsonlFiles: string[] = [];

  for (const dir of candidateDirs) {
    try {
      const entries = await fs.readdir(dir);
      const found = entries
        .filter((e) => e.endsWith(".jsonl"))
        .map((e) => path.join(dir, e));
      jsonlFiles = jsonlFiles.concat(found);
    } catch {
      // directory doesn't exist or unreadable — safe to skip
    }
  }

  // deduplicate, then keep the NEWEST files first so recent paper events are never
  // starved by old fixtures when the directory holds more than MAX_FILES_TO_SCAN files.
  {
    const uniqueFiles = [...new Set(jsonlFiles)];
    const withMtime = await Promise.all(
      uniqueFiles.map(async (fp) => {
        let mtimeMs = 0;
        try {
          mtimeMs = (await fs.stat(fp)).mtimeMs;
        } catch {
          mtimeMs = 0;
        }
        return { fp, mtimeMs };
      })
    );
    withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
    jsonlFiles = withMtime.slice(0, MAX_FILES_TO_SCAN).map((x) => x.fp);
  }

  if (jsonlFiles.length === 0) {
    return {
      status: "no_paper_trades",
      totalPaperEvents: 0,
      totalOrderSimulated: 0,
      totalOrderFilled: 0,
      buyFillCount: 0,
      sellFillCount: 0,
      totalOrderCanceled: 0,
      totalOrderRejected: 0,
      openPaperOrders: 0,
      lastPaperEventAt: null,
      lastPaperEventType: null,
      lastPaperMode: null,
      paperModeDetected: false,
      auditFilesScanned: 0,
      auditRootDir,
      warnings: [`No .jsonl files found in ${auditRootDir}`],
      checkedAt,
      recentEvents: [],
    };
  }

  // scan files
  const openOrderKeys = new Set<string>();
  // Phase M-0Z-6 (S1 fix): track filled-order keys so a filled order is counted once
  // across ORDER_FILLED and FILL_RESULT events (FILL_RESULT was previously never counted).
  const filledOrderKeys = new Set<string>();

  for (const filePath of jsonlFiles) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const events = parseLines(raw);
      auditFilesScanned++;

      for (const event of events) {
        if (!isPaperEvent(event)) continue;

        paperModeDetected = true;
        totalPaperEvents++;

        const eventType = String(event.type ?? "").toUpperCase();
        const ts = typeof event.ts === "number" ? event.ts : null;

        if (ts !== null && (lastPaperEventTs === null || ts > lastPaperEventTs)) {
          lastPaperEventTs = ts;
          lastPaperEventType = eventType;
          lastPaperMode = event.mode ?? null;
        }

        // order tracking
        if (eventType === "ORDER_SIMULATED" || eventType === "ORDER_ACCEPTED") {
          totalOrderSimulated++;
          const key = event.eventKey ?? `${event.ts}_${Math.random()}`;
          openOrderKeys.add(key);
        }

        // Phase M-0Z-6 (S1 fix): count a filled order once across ORDER_FILLED and
        // FILL_RESULT (the post-syncState actual-fill event). Previously only ORDER_FILLED
        // incremented totalOrderFilled, so a runner emitting FILL_RESULT-only reported 0 fills
        // even though extractFills() consumed those fills. Dedupe by key to avoid double-count
        // when both events fire for the same order.
        if (eventType === "ORDER_FILLED" || eventType === "FILL_RESULT") {
          const payloadObj = event.payload as Record<string, unknown> | undefined;
          const fillSide =
            typeof payloadObj?.side === "string"
              ? payloadObj.side.trim().toUpperCase()
              : textOrNull(readObservabilityContext(event, payloadObj).side)?.toUpperCase();
          const fillKey =
            event.eventKey ??
            (typeof payloadObj?.orderId === "string" ? payloadObj.orderId : null);
          if (fillKey) {
            if (!filledOrderKeys.has(fillKey)) {
              filledOrderKeys.add(fillKey);
              totalOrderFilled++;
              if (fillSide === "BUY") buyFillCount++;
              if (fillSide === "SELL") sellFillCount++;
            }
          } else {
            // no stable key — count to avoid undercounting (matches prior ORDER_FILLED behavior)
            totalOrderFilled++;
            if (fillSide === "BUY") buyFillCount++;
            if (fillSide === "SELL") sellFillCount++;
          }
        }

        if (eventType === "ORDER_CANCELED") {
          totalOrderCanceled++;
        }

        if (eventType === "ORDER_REJECTED") {
          totalOrderRejected++;
        }

        // close open order tracking
        if (TERMINAL_ORDER_EVENTS.has(eventType)) {
          const key = event.eventKey ?? null;
          if (key) openOrderKeys.delete(key);
        }

        // collect for recentEvents display
        {
          const payload = event.payload as Record<string, unknown> | undefined;
          const context = readObservabilityContext(event, payload);

          // extract from ORDER_SIMULATED
          let orderId: string | null = null;
          let orderStatus: string | null = null;
          let filledQuantity: number | null = null;
          let averageFillPrice: number | null = null;
          if (eventType === "ORDER_SIMULATED" && Array.isArray(payload?.results)) {
            const r = (payload.results as Record<string, unknown>[])[0] ?? {};
            orderId = typeof r.orderId === "string" ? r.orderId : null;
            orderStatus = typeof r.orderStatus === "string" ? r.orderStatus : null;
            filledQuantity = typeof r.filledQuantity === "number" ? r.filledQuantity : null;
            averageFillPrice = typeof r.averageFillPrice === "number" ? r.averageFillPrice : null;
          }

          // extract from FILL_RESULT (Phase M-0B: actual fill price captured AFTER syncState)
          // payload shape: { intentKey, orderId, clientOrderId, status, side, quantity,
          //                  filledQuantity, averageFillPrice, fills, liveOrder: false, source: "paper_fill" }
          if (eventType === "FILL_RESULT") {
            orderId = typeof payload?.orderId === "string" ? payload.orderId : null;
            orderStatus = typeof payload?.status === "string" ? payload.status : null;
            filledQuantity = typeof payload?.filledQuantity === "number" ? payload.filledQuantity : null;
            averageFillPrice = typeof payload?.averageFillPrice === "number" ? payload.averageFillPrice : null;
          }

          // extract from ORDER_FILLED (Phase M-0Z-2: fill price from ORDER_FILLED payload)
          // payload shape may include: orderId, status, filledQuantity, executedQty, averageFillPrice, avgPrice
          if (eventType === "ORDER_FILLED") {
            orderId = typeof payload?.orderId === "string" ? payload.orderId : null;
            orderStatus = typeof payload?.status === "string" ? payload.status : null;
            filledQuantity =
              typeof payload?.filledQuantity === "number" ? payload.filledQuantity
              : typeof payload?.executedQty === "number" ? payload.executedQty
              : null;
            averageFillPrice =
              typeof payload?.averageFillPrice === "number" ? payload.averageFillPrice
              : typeof payload?.avgPrice === "number" ? payload.avgPrice
              : null;
          }

          // extract from INTENT_CREATED
          let side: string | null = null;
          let quantity: number | null = null;
          let kind: string | null = null;
          if (eventType === "INTENT_CREATED") {
            const decision = payload?.decision as Record<string, unknown> | undefined;
            const intents = Array.isArray(decision?.intents)
              ? (decision.intents as Record<string, unknown>[])
              : [];
            const intent0 = intents[0] ?? {};
            side = typeof intent0.side === "string" ? intent0.side : null;
            quantity = typeof intent0.quantity === "number" ? intent0.quantity : null;
            kind = typeof intent0.kind === "string" ? intent0.kind : null;
          }

          // extract side/quantity from FILL_RESULT (Phase M-0B)
          // side/quantity stored directly on payload (sourced from intent at audit event creation)
          if (eventType === "FILL_RESULT") {
            side = typeof payload?.side === "string" ? payload.side : null;
            quantity = typeof payload?.quantity === "number" ? payload.quantity : null;
          }

          side = side ?? textOrNull(context.side);

          allPaperEvents.push({
            ts: ts ?? Date.now(),
            type: eventType,
            symbol: textOrNull(context.symbol) ?? (typeof event.symbol === "string" ? event.symbol : null),
            mode: event.mode ?? "PAPER",
            strategyMode: textOrNull(context.mode),
            regime: textOrNull(context.regime),
            session: textOrNull(context.session),
            gridSpacingPct: numberOrNull(context.gridSpacingPct),
            gridLower: numberOrNull(context.gridLower),
            gridUpper: numberOrNull(context.gridUpper),
            gridMid: numberOrNull(context.gridMid),
            currentPrice: numberOrNull(context.currentPrice),
            eventTs: numberOrNull(context.eventTs),
            paperModeDetected: boolOrNull(context.paperModeDetected),
            noTradeReason: textOrNull(context.noTradeReason),
            schemaVersion:
              textOrNull(context.schemaVersion) ??
              textOrNull(context.paperObservabilitySchemaVersion),
            eventKey: event.eventKey ?? null,
            orderId,
            orderStatus,
            filledQuantity,
            averageFillPrice,
            side,
            quantity,
            kind,
            liveOrder: false,
            source: "paper_audit_log",
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not read ${path.basename(filePath)}: ${msg}`);
    }
  }

  openPaperOrders = openOrderKeys.size;

  const lastPaperEventAt =
    lastPaperEventTs !== null ? new Date(lastPaperEventTs).toISOString() : null;

  let status: PaperJournalStatus;
  if (!paperModeDetected) {
    status = "waiting_for_paper_signals";
  } else if (totalPaperEvents === 0) {
    status = "no_paper_trades";
  } else {
    status = "has_paper_data";
  }

  // sort recentEvents newest-first, cap at MAX_RECENT_EVENTS
  const recentEvents = allPaperEvents
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_RECENT_EVENTS);

  return {
    status,
    totalPaperEvents,
    totalOrderSimulated,
    totalOrderFilled,
    buyFillCount,
    sellFillCount,
    totalOrderCanceled,
    totalOrderRejected,
    openPaperOrders,
    lastPaperEventAt,
    lastPaperEventType,
    lastPaperMode,
    paperModeDetected,
    auditFilesScanned,
    auditRootDir,
    warnings,
    checkedAt,
    recentEvents,
  };
}
