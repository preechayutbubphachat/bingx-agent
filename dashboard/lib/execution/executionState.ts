import * as fs from "fs/promises";

import type {
  BrokerMode,
  OpenOrderSnapshot,
  OrderIntent,
  PositionSnapshot,
  ReconcileResult,
} from "../broker/types";
import type { RiskApprovalStatus, FailSafeMode } from "../riskTypes";

export const EXECUTION_STATE_SCHEMA_VERSION = "execution_state_v1";

export type ExecutionStateWriterStage =
  | "init"
  | "intent_created"
  | "order_submitted"
  | "order_filled"
  | "reconcile_sync"
  | "restart_restore"
  | "manual_override";

export type ExecutionIntentStatus =
  | "CREATED"
  | "SUBMITTED"
  | "ACKED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "EXPIRED"
  | "FAILED";

export type ExecutionPositionState = {
  exists: boolean;
  side: "FLAT" | "LONG" | "SHORT";
  size: number;
  entry_price: number | null;
  average_entry: number | null;
  mark_price: number | null;
  unrealized_pnl: number | null;
  realized_pnl_day: number | null;
  opened_at: number | null;
  updated_at: number | null;
  source: string;
};

export type ExecutionOrderState = {
  order_id: string;
  client_order_id: string | null;
  intent_key: string | null;
  kind: string;
  side: "BUY" | "SELL";
  type: string;
  status: string;
  quantity: number;
  filled_quantity: number | null;
  remaining_quantity: number | null;
  price: number | null;
  stop_price: number | null;
  reduce_only: boolean;
  created_at: number | null;
  updated_at: number | null;
};

export type ExecutionPendingIntent = {
  intent_key: string;
  parent_intent_key: string | null;
  event_key: string | null;
  candle_key: string | null;
  kind: string;
  symbol: string;
  side: "BUY" | "SELL" | null;
  quantity: number | null;
  status: ExecutionIntentStatus;
  created_at: number | null;
  updated_at: number | null;
  expires_at: number | null;
  reason: string | null;
};

export type ExecutionLastEvent = {
  event_key: string | null;
  candle_key: string | null;
  action: string | null;
  intent_key: string | null;
  result: string | null;
  applied_at: number | null;
};

export type ExecutionLastReconcile = {
  at: number | null;
  ok: boolean;
  issues: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  requires_freeze: boolean;
  requires_reduce: boolean;
  requires_force_exit: boolean;
  requires_cancel: boolean;
  broker_snapshot_ref: string | null;
};

export type ExecutionIdempotency = {
  processed_event_keys: string[];
  processed_candle_keys: string[];
  processed_intent_keys: string[];
  last_event_key: string | null;
  last_intent_key: string | null;
};

export type ExecutionSafety = {
  risk_status: RiskApprovalStatus | string;
  fail_safe_mode: FailSafeMode | string;
  execution_frozen: boolean;
  force_exit_required: boolean;
  reduce_required: boolean;
  marker_consistent: boolean;
  canonical_consistent: boolean;
  persist_healthy: boolean;
};

export type ExecutionAudit = {
  source: string;
  notes: string[];
  last_broker_sync_at: number | null;
  last_seen_broker_mode: BrokerMode;
  last_seen_machine_state: string;
  last_seen_risk_status: string;
};

export type ExecutionIntentResultStatus =
  | "CREATED"
  | "SUBMITTED"
  | "ACKED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "EXPIRED"
  | "FAILED";

export type ExecutionState = {
  schema_version: string;
  updated_at: number;
  writer: string;
  writer_stage: ExecutionStateWriterStage | string;
  broker_mode: BrokerMode;
  symbol: string;
  current_position: ExecutionPositionState;
  active_orders: ExecutionOrderState[];
  pending_intents: ExecutionPendingIntent[];
  last_execution_event: ExecutionLastEvent;
  last_closed_candle_key: string | null;
  last_reconcile: ExecutionLastReconcile;
  idempotency: ExecutionIdempotency;
  safety: ExecutionSafety;
  audit: ExecutionAudit;
};

export type ValidationIssue = {
  path: string;
  message: string;
  severity: "warn" | "error";
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

function nowMs() {
  return Date.now();
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPositiveNumber(v: unknown): number | null {
  const n = toFiniteNumber(v);
  return n !== null && n > 0 ? n : null;
}

function toNonNegativeNumber(v: unknown): number | null {
  const n = toFiniteNumber(v);
  return n !== null && n >= 0 ? n : null;
}

function toBool(v: unknown): boolean {
  return v === true;
}

function toText(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function dedupeStrings(values: string[], max = 200): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }

  return out;
}

function normalizeBrokerMode(v: unknown): BrokerMode {
  const raw = toText(v, "READ_ONLY").toUpperCase();
  if (raw === "PAPER") return "PAPER";
  if (raw === "LIVE_SHADOW") return "LIVE_SHADOW";
  if (raw === "LIVE_LIMITED") return "LIVE_LIMITED";
  if (raw === "LIVE_FULL") return "LIVE_FULL";
  return "READ_ONLY";
}

function normalizePositionSide(v: unknown): "FLAT" | "LONG" | "SHORT" {
  const raw = toText(v, "FLAT").toUpperCase();
  if (raw === "LONG") return "LONG";
  if (raw === "SHORT") return "SHORT";
  return "FLAT";
}

function normalizeIntentStatus(v: unknown): ExecutionIntentStatus {
  const raw = toText(v, "CREATED").toUpperCase();
  if (raw === "SUBMITTED") return "SUBMITTED";
  if (raw === "ACKED") return "ACKED";
  if (raw === "PARTIALLY_FILLED") return "PARTIALLY_FILLED";
  if (raw === "FILLED") return "FILLED";
  if (raw === "CANCELED") return "CANCELED";
  if (raw === "EXPIRED") return "EXPIRED";
  if (raw === "FAILED") return "FAILED";
  return "CREATED";
}

function normalizeBrokerSide(v: unknown): "BUY" | "SELL" | null {
  const raw = toText(v).toUpperCase();
  if (raw === "BUY") return "BUY";
  if (raw === "SELL") return "SELL";
  return null;
}

export function createDefaultExecutionState(symbol = "BTC-USDT", brokerMode: BrokerMode = "READ_ONLY"): ExecutionState {
  return {
    schema_version: EXECUTION_STATE_SCHEMA_VERSION,
    updated_at: nowMs(),
    writer: "executionState",
    writer_stage: "init",
    broker_mode: brokerMode,
    symbol,
    current_position: {
      exists: false,
      side: "FLAT",
      size: 0,
      entry_price: null,
      average_entry: null,
      mark_price: null,
      unrealized_pnl: null,
      realized_pnl_day: null,
      opened_at: null,
      updated_at: null,
      source: "execution_state",
    },
    active_orders: [],
    pending_intents: [],
    last_execution_event: {
      event_key: null,
      candle_key: null,
      action: null,
      intent_key: null,
      result: null,
      applied_at: null,
    },
    last_closed_candle_key: null,
    last_reconcile: {
      at: null,
      ok: true,
      issues: [],
      requires_freeze: false,
      requires_reduce: false,
      requires_force_exit: false,
      requires_cancel: false,
      broker_snapshot_ref: null,
    },
    idempotency: {
      processed_event_keys: [],
      processed_candle_keys: [],
      processed_intent_keys: [],
      last_event_key: null,
      last_intent_key: null,
    },
    safety: {
      risk_status: "APPROVED",
      fail_safe_mode: "NORMAL",
      execution_frozen: false,
      force_exit_required: false,
      reduce_required: false,
      marker_consistent: true,
      canonical_consistent: true,
      persist_healthy: true,
    },
    audit: {
      source: "executionState",
      notes: [],
      last_broker_sync_at: null,
      last_seen_broker_mode: brokerMode,
      last_seen_machine_state: "HOLD",
      last_seen_risk_status: "APPROVED",
    },
  };
}

export function normalizeExecutionState(input: unknown, defaults?: Partial<ExecutionState>): ExecutionState {
  const base = createDefaultExecutionState(defaults?.symbol, defaults?.broker_mode);
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const side = normalizePositionSide((obj.current_position as any)?.side);
  const size = toNonNegativeNumber((obj.current_position as any)?.size) ?? 0;
  const exists = toBool((obj.current_position as any)?.exists) || size > 0 || side !== "FLAT";
  const normalizedPosition: ExecutionPositionState = {
    exists: exists && side !== "FLAT" && size > 0,
    side: exists && size > 0 ? side : "FLAT",
    size: exists && size > 0 ? size : 0,
    entry_price: toPositiveNumber((obj.current_position as any)?.entry_price),
    average_entry: toPositiveNumber((obj.current_position as any)?.average_entry),
    mark_price: toPositiveNumber((obj.current_position as any)?.mark_price),
    unrealized_pnl: toFiniteNumber((obj.current_position as any)?.unrealized_pnl),
    realized_pnl_day: toFiniteNumber((obj.current_position as any)?.realized_pnl_day),
    opened_at: toFiniteNumber((obj.current_position as any)?.opened_at),
    updated_at: toFiniteNumber((obj.current_position as any)?.updated_at),
    source: toText((obj.current_position as any)?.source, "execution_state"),
  };

  const normalizedOrders: ExecutionOrderState[] = Array.isArray(obj.active_orders)
    ? obj.active_orders
        .map((raw) => raw as Record<string, unknown>)
        .map((order) => ({
          order_id: toText(order.order_id),
          client_order_id: toText(order.client_order_id) || null,
          intent_key: toText(order.intent_key) || null,
          kind: toText(order.kind, "UNKNOWN"),
          side: normalizeBrokerSide(order.side) ?? "BUY",
          type: toText(order.type, "UNKNOWN"),
          status: toText(order.status, "UNKNOWN"),
          quantity: toNonNegativeNumber(order.quantity) ?? 0,
          filled_quantity: toNonNegativeNumber(order.filled_quantity),
          remaining_quantity: toNonNegativeNumber(order.remaining_quantity),
          price: toPositiveNumber(order.price),
          stop_price: toPositiveNumber(order.stop_price),
          reduce_only: toBool(order.reduce_only),
          created_at: toFiniteNumber(order.created_at),
          updated_at: toFiniteNumber(order.updated_at),
        }))
        .filter((order) => order.order_id.length > 0)
    : [];

  const normalizedIntents: ExecutionPendingIntent[] = Array.isArray(obj.pending_intents)
    ? obj.pending_intents
        .map((raw) => raw as Record<string, unknown>)
        .map((intent) => ({
          intent_key: toText(intent.intent_key),
          parent_intent_key: toText(intent.parent_intent_key) || null,
          event_key: toText(intent.event_key) || null,
          candle_key: toText(intent.candle_key) || null,
          kind: toText(intent.kind, "UNKNOWN"),
          symbol: toText(intent.symbol, defaults?.symbol ?? base.symbol),
          side: normalizeBrokerSide(intent.side),
          quantity: toPositiveNumber(intent.quantity),
          status: normalizeIntentStatus(intent.status),
          created_at: toFiniteNumber(intent.created_at),
          updated_at: toFiniteNumber(intent.updated_at),
          expires_at: toFiniteNumber(intent.expires_at),
          reason: toText(intent.reason) || null,
        }))
        .filter((intent) => intent.intent_key.length > 0)
    : [];

  const normalized: ExecutionState = {
    schema_version: toText(obj.schema_version, EXECUTION_STATE_SCHEMA_VERSION),
    updated_at: toFiniteNumber(obj.updated_at) ?? nowMs(),
    writer: toText(obj.writer, defaults?.writer ?? base.writer),
    writer_stage: toText(obj.writer_stage, defaults?.writer_stage ?? base.writer_stage),
    broker_mode: normalizeBrokerMode(obj.broker_mode ?? defaults?.broker_mode ?? base.broker_mode),
    symbol: toText(obj.symbol, defaults?.symbol ?? base.symbol),
    current_position: normalizedPosition,
    active_orders: normalizedOrders,
    pending_intents: normalizedIntents,
    last_execution_event: {
      event_key: toText((obj.last_execution_event as any)?.event_key) || null,
      candle_key: toText((obj.last_execution_event as any)?.candle_key) || null,
      action: toText((obj.last_execution_event as any)?.action) || null,
      intent_key: toText((obj.last_execution_event as any)?.intent_key) || null,
      result: toText((obj.last_execution_event as any)?.result) || null,
      applied_at: toFiniteNumber((obj.last_execution_event as any)?.applied_at),
    },
    last_closed_candle_key: toText(obj.last_closed_candle_key) || null,
    last_reconcile: {
      at: toFiniteNumber((obj.last_reconcile as any)?.at),
      ok: (obj.last_reconcile as any)?.ok !== false,
      issues: Array.isArray((obj.last_reconcile as any)?.issues)
        ? (obj.last_reconcile as any).issues.map((issue: any) => ({
            code: toText(issue?.code, "UNKNOWN"),
            severity: toText(issue?.severity, "warn"),
            message: toText(issue?.message, "unknown issue"),
          }))
        : [],
      requires_freeze: toBool((obj.last_reconcile as any)?.requires_freeze),
      requires_reduce: toBool((obj.last_reconcile as any)?.requires_reduce),
      requires_force_exit: toBool((obj.last_reconcile as any)?.requires_force_exit),
      requires_cancel: toBool((obj.last_reconcile as any)?.requires_cancel),
      broker_snapshot_ref: toText((obj.last_reconcile as any)?.broker_snapshot_ref) || null,
    },
    idempotency: {
      processed_event_keys: dedupeStrings(asStringArray((obj.idempotency as any)?.processed_event_keys)),
      processed_candle_keys: dedupeStrings(asStringArray((obj.idempotency as any)?.processed_candle_keys)),
      processed_intent_keys: dedupeStrings(asStringArray((obj.idempotency as any)?.processed_intent_keys)),
      last_event_key: toText((obj.idempotency as any)?.last_event_key) || null,
      last_intent_key: toText((obj.idempotency as any)?.last_intent_key) || null,
    },
    safety: {
      risk_status: toText((obj.safety as any)?.risk_status, base.safety.risk_status),
      fail_safe_mode: toText((obj.safety as any)?.fail_safe_mode, base.safety.fail_safe_mode),
      execution_frozen: toBool((obj.safety as any)?.execution_frozen),
      force_exit_required: toBool((obj.safety as any)?.force_exit_required),
      reduce_required: toBool((obj.safety as any)?.reduce_required),
      marker_consistent: (obj.safety as any)?.marker_consistent !== false,
      canonical_consistent: (obj.safety as any)?.canonical_consistent !== false,
      persist_healthy: (obj.safety as any)?.persist_healthy !== false,
    },
    audit: {
      source: toText((obj.audit as any)?.source, base.audit.source),
      notes: asStringArray((obj.audit as any)?.notes),
      last_broker_sync_at: toFiniteNumber((obj.audit as any)?.last_broker_sync_at),
      last_seen_broker_mode: normalizeBrokerMode((obj.audit as any)?.last_seen_broker_mode),
      last_seen_machine_state: toText((obj.audit as any)?.last_seen_machine_state, base.audit.last_seen_machine_state),
      last_seen_risk_status: toText((obj.audit as any)?.last_seen_risk_status, base.audit.last_seen_risk_status),
    },
  };

  if (!normalized.current_position.exists) {
    normalized.current_position.side = "FLAT";
    normalized.current_position.size = 0;
  }

  return normalized;
}

export function validateExecutionState(state: ExecutionState): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!state.schema_version) {
    issues.push({ path: "schema_version", message: "schema_version is required", severity: "error" });
  }

  if (!state.symbol) {
    issues.push({ path: "symbol", message: "symbol is required", severity: "error" });
  }

  if (!state.writer) {
    issues.push({ path: "writer", message: "writer is required", severity: "error" });
  }

  if (state.current_position.side === "FLAT" && state.current_position.size > 0) {
    issues.push({
      path: "current_position.size",
      message: "flat position cannot have positive size",
      severity: "error",
    });
  }

  if (state.current_position.side !== "FLAT" && state.current_position.size <= 0) {
    issues.push({
      path: "current_position.side",
      message: "non-flat position must have positive size",
      severity: "error",
    });
  }

  for (let index = 0; index < state.active_orders.length; index += 1) {
    const order = state.active_orders[index];
    if (!order.order_id) {
      issues.push({
        path: `active_orders[${index}].order_id`,
        message: "active order must have order_id",
        severity: "error",
      });
    }
  }

  for (let index = 0; index < state.pending_intents.length; index += 1) {
    const intent = state.pending_intents[index];
    if (!intent.intent_key) {
      issues.push({
        path: `pending_intents[${index}].intent_key`,
        message: "pending intent must have intent_key",
        severity: "error",
      });
    }
  }

  if (!Array.isArray(state.idempotency.processed_event_keys)) {
    issues.push({
      path: "idempotency.processed_event_keys",
      message: "processed_event_keys must be an array",
      severity: "error",
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export async function readExecutionState(
  filePath: string,
  defaults?: Partial<ExecutionState>
): Promise<ExecutionState> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeExecutionState(JSON.parse(raw), defaults);
  } catch {
    return normalizeExecutionState(undefined, defaults);
  }
}

export async function writeExecutionState(filePath: string, state: ExecutionState): Promise<void> {
  const normalized = normalizeExecutionState(state);
  const validation = validateExecutionState(normalized);

  if (!validation.ok) {
    const message = validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`execution state validation failed: ${message}`);
  }

  const payload = JSON.stringify(normalized, null, 2);
  await fs.writeFile(filePath, payload, "utf8");
}

export function markExecutionEvent(
  state: ExecutionState,
  args: {
    eventKey?: string | null;
    candleKey?: string | null;
    intentKey?: string | null;
    action?: string | null;
    result?: string | null;
    appliedAt?: number | null;
  }
): ExecutionState {
  const next = normalizeExecutionState(state);
  const eventKey = toText(args.eventKey) || null;
  const candleKey = toText(args.candleKey) || null;
  const intentKey = toText(args.intentKey) || null;
  const appliedAt = toFiniteNumber(args.appliedAt) ?? nowMs();

  next.last_execution_event = {
    event_key: eventKey,
    candle_key: candleKey,
    action: toText(args.action) || null,
    intent_key: intentKey,
    result: toText(args.result) || null,
    applied_at: appliedAt,
  };

  if (candleKey) next.last_closed_candle_key = candleKey;
  if (eventKey) {
    next.idempotency.processed_event_keys = dedupeStrings([
      eventKey,
      ...next.idempotency.processed_event_keys,
    ]);
    next.idempotency.last_event_key = eventKey;
  }
  if (candleKey) {
    next.idempotency.processed_candle_keys = dedupeStrings([
      candleKey,
      ...next.idempotency.processed_candle_keys,
    ]);
  }
  if (intentKey) {
    next.idempotency.processed_intent_keys = dedupeStrings([
      intentKey,
      ...next.idempotency.processed_intent_keys,
    ]);
    next.idempotency.last_intent_key = intentKey;
  }

  next.updated_at = appliedAt;
  return next;
}

export function hasProcessedExecutionKey(
  state: ExecutionState,
  args: { eventKey?: string | null; candleKey?: string | null; intentKey?: string | null }
): boolean {
  const eventKey = toText(args.eventKey) || null;
  const candleKey = toText(args.candleKey) || null;
  const intentKey = toText(args.intentKey) || null;

  return (
    (eventKey !== null && state.idempotency.processed_event_keys.includes(eventKey)) ||
    (candleKey !== null && state.idempotency.processed_candle_keys.includes(candleKey)) ||
    (intentKey !== null && state.idempotency.processed_intent_keys.includes(intentKey))
  );
}

export function upsertPendingIntent(state: ExecutionState, intent: OrderIntent): ExecutionState {
  const next = normalizeExecutionState(state);
  const intentKey = toText(intent.intentKey);
  if (!intentKey) return next;

  const normalizedIntent: ExecutionPendingIntent = {
    intent_key: intentKey,
    parent_intent_key: toText(intent.parentIntentKey) || null,
    event_key: toText(intent.eventKey) || null,
    candle_key: toText(intent.candleKey) || null,
    kind: toText(intent.kind, "UNKNOWN"),
    symbol: toText(intent.symbol, next.symbol),
    side: normalizeBrokerSide(intent.side),
    quantity: toPositiveNumber(intent.quantity),
    status: "CREATED",
    created_at: nowMs(),
    updated_at: nowMs(),
    expires_at: null,
    reason: toText(intent.reason) || null,
  };

  const index = next.pending_intents.findIndex((item) => item.intent_key === intentKey);
  if (index >= 0) next.pending_intents[index] = normalizedIntent;
  else next.pending_intents.push(normalizedIntent);

  next.updated_at = nowMs();
  return next;
}

function mapOrderResultToIntentStatus(status: unknown, ok?: boolean): ExecutionIntentResultStatus {
  const raw = toText(status, ok === false ? "FAILED" : "SUBMITTED").toUpperCase();
  if (raw === "NEW") return "SUBMITTED";
  if (raw === "PENDING") return "SUBMITTED";
  if (raw === "PARTIALLY_FILLED") return "PARTIALLY_FILLED";
  if (raw === "FILLED") return "FILLED";
  if (raw === "CANCELED") return "CANCELED";
  if (raw === "EXPIRED") return "EXPIRED";
  if (raw === "REJECTED") return "FAILED";
  if (raw === "UNKNOWN") return ok === false ? "FAILED" : "ACKED";
  return ok === false ? "FAILED" : "ACKED";
}

export function applyOrderResultsToExecutionState(
  state: ExecutionState,
  results: Array<{
    idempotencyKey?: string | null;
    status?: string | null;
    ok?: boolean;
  }>
): ExecutionState {
  const next = normalizeExecutionState(state);
  const ts = nowMs();

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const intentKey = toText(result.idempotencyKey);
    if (!intentKey) continue;

    const pendingIndex = next.pending_intents.findIndex((intent) => intent.intent_key === intentKey);
    const status = mapOrderResultToIntentStatus(result.status, result.ok);

    if (pendingIndex >= 0) {
      next.pending_intents[pendingIndex] = {
        ...next.pending_intents[pendingIndex],
        status,
        updated_at: ts,
      };
    }

    if (status === "FILLED" || status === "CANCELED" || status === "EXPIRED" || status === "FAILED") {
      next.idempotency.processed_intent_keys = dedupeStrings([
        intentKey,
        ...next.idempotency.processed_intent_keys,
      ]);
      next.idempotency.last_intent_key = intentKey;
    }
  }

  next.updated_at = ts;
  return next;
}

export function compactPendingIntents(state: ExecutionState, maxKeep = 100): ExecutionState {
  const next = normalizeExecutionState(state);
  const active: ExecutionPendingIntent[] = [];
  const resolved: ExecutionPendingIntent[] = [];

  for (let index = 0; index < next.pending_intents.length; index += 1) {
    const intent = next.pending_intents[index];
    const status = normalizeIntentStatus(intent.status);
    if (
      status === "CANCELED" ||
      status === "EXPIRED" ||
      status === "FAILED" ||
      status === "FILLED"
    ) {
      resolved.push({
        ...intent,
        status,
      });
    } else {
      active.push({
        ...intent,
        status,
      });
    }
  }

  resolved.sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
  next.pending_intents = [...active, ...resolved.slice(0, Math.max(0, maxKeep - active.length))];
  next.updated_at = nowMs();
  return next;
}

export function upsertBrokerPosition(state: ExecutionState, position: PositionSnapshot): ExecutionState {
  const next = normalizeExecutionState(state);
  const size = Math.max(0, toFiniteNumber(position.size) ?? 0);
  const side =
    position.side === "LONG" || position.side === "SHORT"
      ? position.side
      : size > 0
        ? "LONG"
        : "FLAT";

  next.current_position = {
    exists: side !== "FLAT" && size > 0,
    side: side === "LONG" || side === "SHORT" ? side : "FLAT",
    size: side === "FLAT" ? 0 : size,
    entry_price: toPositiveNumber(position.entryPrice),
    average_entry: toPositiveNumber(position.entryPrice),
    mark_price: toPositiveNumber(position.markPrice),
    unrealized_pnl: toFiniteNumber(position.unrealizedPnl),
    realized_pnl_day: next.current_position.realized_pnl_day,
    opened_at: side === "FLAT" ? null : next.current_position.opened_at ?? nowMs(),
    updated_at: toFiniteNumber(position.updatedAtMs) ?? nowMs(),
    source: "broker_snapshot",
  };
  next.updated_at = nowMs();
  return next;
}

export function replaceActiveOrders(state: ExecutionState, orders: OpenOrderSnapshot[]): ExecutionState {
  const next = normalizeExecutionState(state);
  next.active_orders = orders.map((order) => ({
    order_id: toText(order.orderId),
    client_order_id: toText(order.clientOrderId) || null,
    intent_key: toText((order as any).intentKey) || null,
    kind: toText((order as any).kind, "UNKNOWN"),
    side: normalizeBrokerSide(order.side) ?? "BUY",
    type: toText(order.type, "UNKNOWN"),
    status: toText(order.status, "UNKNOWN"),
    quantity: toNonNegativeNumber(order.quantity) ?? 0,
    filled_quantity: toNonNegativeNumber(order.filledQuantity),
    remaining_quantity: toNonNegativeNumber(order.remainingQuantity),
    price: toPositiveNumber(order.price),
    stop_price: toPositiveNumber(order.stopPrice),
    reduce_only: toBool(order.reduceOnly),
    created_at: toFiniteNumber(order.createdAtMs),
    updated_at: toFiniteNumber(order.updatedAtMs),
  }));
  next.updated_at = nowMs();
  return next;
}

export function applyReconcileResult(
  state: ExecutionState,
  reconcile: ReconcileResult,
  brokerSnapshotRef?: string | null
): ExecutionState {
  const next = normalizeExecutionState(state);
  next.last_reconcile = {
    at: toFiniteNumber(reconcile.lastSyncAtMs) ?? nowMs(),
    ok: reconcile.ok,
    issues: (reconcile.issues ?? []).map((issue) => ({
      code: toText(issue.code, "UNKNOWN"),
      severity: toText(issue.severity, "warn"),
      message: toText(issue.message, "unknown issue"),
    })),
    requires_freeze: toBool(reconcile.requiresFreeze),
    requires_reduce: toBool(reconcile.requiresReduce),
    requires_force_exit: toBool(reconcile.requiresForceExit),
    requires_cancel: toBool(reconcile.requiresCancel),
    broker_snapshot_ref: toText(brokerSnapshotRef) || null,
  };
  next.audit.last_broker_sync_at = next.last_reconcile.at;
  next.updated_at = nowMs();
  return next;
}

export function updateExecutionSafety(
  state: ExecutionState,
  safety: Partial<ExecutionSafety>
): ExecutionState {
  const next = normalizeExecutionState(state);
  next.safety = {
    ...next.safety,
    ...safety,
  };
  next.audit.last_seen_risk_status = toText(next.safety.risk_status, next.audit.last_seen_risk_status);
  next.updated_at = nowMs();
  return next;
}

export function updateExecutionAudit(
  state: ExecutionState,
  audit: Partial<ExecutionAudit>
): ExecutionState {
  const next = normalizeExecutionState(state);
  next.audit = {
    ...next.audit,
    ...audit,
    notes: Array.isArray(audit.notes) ? asStringArray(audit.notes) : next.audit.notes,
    last_seen_broker_mode: normalizeBrokerMode(audit.last_seen_broker_mode ?? next.audit.last_seen_broker_mode),
    last_seen_machine_state: toText(audit.last_seen_machine_state, next.audit.last_seen_machine_state),
    last_seen_risk_status: toText(audit.last_seen_risk_status, next.audit.last_seen_risk_status),
    source: toText(audit.source, next.audit.source),
  };
  next.updated_at = nowMs();
  return next;
}

export function restoreExecutionState(
  input: unknown,
  defaults?: Partial<ExecutionState>
): { state: ExecutionState; validation: ValidationResult } {
  const state = normalizeExecutionState(input, defaults);
  const validation = validateExecutionState(state);
  return { state, validation };
}
