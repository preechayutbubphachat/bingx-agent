import type {
  BrokerMode,
  BrokerSide,
  OpenOrderSnapshot,
  OrderIntent,
  PositionSnapshot,
  ReconcileIssue,
  ReconcileResult,
} from "../broker/types";
import type { ExecutionOrderState, ExecutionPendingIntent, ExecutionState } from "./executionState";

export type ReconcileInput = {
  symbol: string;
  brokerMode: BrokerMode;
  executionState: ExecutionState;
  brokerPosition: PositionSnapshot;
  brokerOpenOrders: OpenOrderSnapshot[];
  intendedIntents?: OrderIntent[] | null;
  nowMs?: number | null;
  pendingIntentStaleMs?: number;
};

export type ReconcileSummary = {
  missingProtection: boolean;
  duplicateIntentRisk: boolean;
  stalePendingIntentKeys: string[];
  executionVsBrokerPositionMismatch: boolean;
  executionVsBrokerOrderMismatch: boolean;
  intendedVsBrokerOrderMismatch: boolean;
};

function currentTimeMs(nowMs?: number | null) {
  return typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeSideFromIntent(intent: Pick<OrderIntent, "side" | "kind">): BrokerSide | null {
  if (intent.side === "BUY" || intent.side === "SELL") return intent.side;

  if (
    intent.kind === "ADD_PROTECTION" ||
    intent.kind === "TAKE_PROFIT" ||
    intent.kind === "REDUCE_POSITION" ||
    intent.kind === "CLOSE_POSITION"
  ) {
    return null;
  }

  return null;
}

function activeBrokerOrder(order: OpenOrderSnapshot) {
  return order.status === "NEW" || order.status === "PENDING" || order.status === "PARTIALLY_FILLED";
}

function activeExecutionOrder(order: ExecutionOrderState) {
  return order.status === "NEW" || order.status === "PENDING" || order.status === "PARTIALLY_FILLED";
}

function protectionBrokerOrder(order: OpenOrderSnapshot) {
  return (
    order.reduceOnly === true ||
    order.type === "STOP_MARKET" ||
    order.type === "STOP_LIMIT" ||
    order.type === "TAKE_PROFIT_MARKET" ||
    order.type === "TAKE_PROFIT_LIMIT"
  );
}

function protectionExecutionOrder(order: ExecutionOrderState) {
  return (
    order.reduce_only === true ||
    order.type === "STOP_MARKET" ||
    order.type === "STOP_LIMIT" ||
    order.type === "TAKE_PROFIT_MARKET" ||
    order.type === "TAKE_PROFIT_LIMIT"
  );
}

function approximatelyEqual(a: number | null, b: number | null, tolerance = 0.00000001) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerance;
}

function collectActiveIntentKeys(intents: ExecutionPendingIntent[]) {
  const keys = new Set<string>();
  for (let index = 0; index < intents.length; index += 1) {
    const intent = intents[index];
    const status = normalizeText(intent.status)?.toUpperCase();
    if (!intent.intent_key) continue;
    if (status === "CANCELED" || status === "EXPIRED" || status === "FAILED" || status === "FILLED") continue;
    keys.add(intent.intent_key);
  }
  return keys;
}

function inferExpectedProtectionSides(position: PositionSnapshot) {
  if (position.side === "LONG" && position.size > 0) return ["SELL"] as BrokerSide[];
  if (position.side === "SHORT" && position.size > 0) return ["BUY"] as BrokerSide[];
  return [];
}

function pendingIntentIsStale(intent: ExecutionPendingIntent, nowMs: number, staleMs: number) {
  const status = normalizeText(intent.status)?.toUpperCase();
  if (!intent.intent_key) return false;
  if (status === "CANCELED" || status === "EXPIRED" || status === "FAILED" || status === "FILLED") return false;

  const referenceTs =
    toFiniteNumber(intent.updated_at) ??
    toFiniteNumber(intent.created_at) ??
    toFiniteNumber(intent.expires_at);
  if (referenceTs === null) return false;
  return nowMs - referenceTs > staleMs;
}

function findDuplicateIntentRisk(
  pendingIntentKeys: Set<string>,
  executionOrders: ExecutionOrderState[],
  brokerOrders: OpenOrderSnapshot[],
  intendedIntents: OrderIntent[]
) {
  for (let index = 0; index < intendedIntents.length; index += 1) {
    const intent = intendedIntents[index];
    const key = normalizeText(intent.intentKey);
    if (!key) continue;
    if (pendingIntentKeys.has(key)) return true;

    const inExecutionOrders = executionOrders.some((order) => activeExecutionOrder(order) && order.intent_key === key);
    if (inExecutionOrders) return true;

    const inBrokerOrders = brokerOrders.some(
      (order) =>
        activeBrokerOrder(order) &&
        (normalizeText(order.clientOrderId) === key || normalizeText((order.raw as any)?.intentKey) === key)
    );
    if (inBrokerOrders) return true;
  }

  return false;
}

function comparePositions(executionState: ExecutionState, brokerPosition: PositionSnapshot) {
  const executionPosition = executionState.current_position;
  const brokerFlat = brokerPosition.side === "FLAT" || brokerPosition.size <= 0;
  const executionFlat = !executionPosition.exists || executionPosition.side === "FLAT" || executionPosition.size <= 0;

  if (brokerFlat && executionFlat) return false;
  if (brokerFlat !== executionFlat) return true;
  if (brokerPosition.side !== executionPosition.side) return true;
  if (!approximatelyEqual(brokerPosition.size, executionPosition.size)) return true;
  if (!approximatelyEqual(toFiniteNumber(brokerPosition.entryPrice), executionPosition.average_entry)) return true;
  return false;
}

function compareOrderCounts(executionState: ExecutionState, brokerOrders: OpenOrderSnapshot[]) {
  const executionActive = executionState.active_orders.filter(activeExecutionOrder);
  const brokerActive = brokerOrders.filter(activeBrokerOrder);

  if (executionActive.length !== brokerActive.length) return true;

  const executionSignatures = new Set(
    executionActive.map((order) =>
      [
        normalizeText(order.intent_key) ?? normalizeText(order.client_order_id) ?? normalizeText(order.order_id) ?? "na",
        order.side,
        normalizeText(order.type) ?? "UNKNOWN",
        order.reduce_only === true ? "reduce" : "open",
      ].join("|")
    )
  );

  const brokerSignatures = new Set(
    brokerActive.map((order) =>
      [
        normalizeText((order.raw as any)?.intentKey) ??
          normalizeText(order.clientOrderId) ??
          normalizeText(order.orderId) ??
          "na",
        order.side,
        normalizeText(order.type) ?? "UNKNOWN",
        order.reduceOnly === true ? "reduce" : "open",
      ].join("|")
    )
  );

  if (executionSignatures.size !== brokerSignatures.size) return true;

  for (const signature of executionSignatures) {
    if (!brokerSignatures.has(signature)) return true;
  }

  return false;
}

function compareIntendedOrders(intendedIntents: OrderIntent[], brokerOrders: OpenOrderSnapshot[]) {
  const intendedKeys = intendedIntents
    .map((intent) => normalizeText(intent.intentKey))
    .filter((value): value is string => Boolean(value));
  if (intendedKeys.length === 0) return false;

  const brokerKeys = new Set(
    brokerOrders
      .filter(activeBrokerOrder)
      .map((order) => normalizeText(order.clientOrderId) ?? normalizeText((order.raw as any)?.intentKey))
      .filter((value): value is string => Boolean(value))
  );

  for (let index = 0; index < intendedKeys.length; index += 1) {
    if (!brokerKeys.has(intendedKeys[index])) return true;
  }

  return false;
}

function findMissingProtection(
  brokerPosition: PositionSnapshot,
  brokerOrders: OpenOrderSnapshot[],
  executionState: ExecutionState,
  intendedIntents: OrderIntent[]
) {
  if (brokerPosition.side === "FLAT" || brokerPosition.size <= 0) return false;

  const expectedProtectionSides = inferExpectedProtectionSides(brokerPosition);
  if (expectedProtectionSides.length === 0) return false;

  const brokerProtected = brokerOrders.some(
    (order) => activeBrokerOrder(order) && protectionBrokerOrder(order) && expectedProtectionSides.includes(order.side)
  );
  if (brokerProtected) return false;

  const executionProtected = executionState.active_orders.some(
    (order) => activeExecutionOrder(order) && protectionExecutionOrder(order) && expectedProtectionSides.includes(order.side)
  );
  if (executionProtected) return false;

  const intendedProtection = intendedIntents.some((intent) => {
    if (
      intent.kind !== "ADD_PROTECTION" &&
      intent.kind !== "TAKE_PROFIT" &&
      intent.kind !== "REDUCE_POSITION" &&
      intent.kind !== "CLOSE_POSITION"
    ) {
      return false;
    }

    const side = normalizeSideFromIntent(intent);
    return side === null || expectedProtectionSides.includes(side);
  });

  return !intendedProtection;
}

function buildIssue(code: ReconcileIssue["code"], severity: ReconcileIssue["severity"], message: string, metadata?: Record<string, unknown>): ReconcileIssue {
  return {
    code,
    severity,
    message,
    metadata: metadata ?? null,
  };
}

export function reconcileExecutionState(input: ReconcileInput): ReconcileResult & { summary: ReconcileSummary } {
  const nowMs = currentTimeMs(input.nowMs);
  const staleThresholdMs = input.pendingIntentStaleMs ?? 15 * 60 * 1000;
  const intendedIntents = Array.isArray(input.intendedIntents) ? input.intendedIntents : [];
  const issues: ReconcileIssue[] = [];

  const pendingIntentKeys = collectActiveIntentKeys(input.executionState.pending_intents);
  const stalePendingIntentKeys = input.executionState.pending_intents
    .filter((intent) => pendingIntentIsStale(intent, nowMs, staleThresholdMs))
    .map((intent) => intent.intent_key);

  const executionVsBrokerPositionMismatch = comparePositions(input.executionState, input.brokerPosition);
  const executionVsBrokerOrderMismatch = compareOrderCounts(input.executionState, input.brokerOpenOrders);
  const intendedVsBrokerOrderMismatch = compareIntendedOrders(intendedIntents, input.brokerOpenOrders);
  const duplicateIntentRisk = findDuplicateIntentRisk(
    pendingIntentKeys,
    input.executionState.active_orders,
    input.brokerOpenOrders,
    intendedIntents
  );
  const missingProtection = findMissingProtection(
    input.brokerPosition,
    input.brokerOpenOrders,
    input.executionState,
    intendedIntents
  );

  if (executionVsBrokerPositionMismatch) {
    issues.push(
      buildIssue("POSITION_MISMATCH", "block", "execution state position does not match broker position", {
        execution_position: input.executionState.current_position,
        broker_position: input.brokerPosition,
      })
    );
  }

  if (executionVsBrokerOrderMismatch || intendedVsBrokerOrderMismatch) {
    issues.push(
      buildIssue("OPEN_ORDER_MISMATCH", "warn", "open-order view differs between intended/execution state and broker", {
        execution_active_order_count: input.executionState.active_orders.filter(activeExecutionOrder).length,
        broker_active_order_count: input.brokerOpenOrders.filter(activeBrokerOrder).length,
        intended_intent_count: intendedIntents.length,
      })
    );
  }

  if (missingProtection) {
    issues.push(
      buildIssue("MISSING_PROTECTION", "hard_stop", "open broker exposure is missing protection orders", {
        broker_position_side: input.brokerPosition.side,
        broker_position_size: input.brokerPosition.size,
      })
    );
  }

  if (duplicateIntentRisk) {
    issues.push(
      buildIssue("DUPLICATE_INTENT_RISK", "block", "incoming intents would duplicate existing pending/exchange state", {
        pending_intent_keys: Array.from(pendingIntentKeys),
      })
    );
  }

  if (stalePendingIntentKeys.length > 0) {
    issues.push(
      buildIssue("STALE_PENDING_INTENT", "warn", "pending intents remained unresolved beyond stale threshold", {
        stale_intent_keys: stalePendingIntentKeys,
        stale_threshold_ms: staleThresholdMs,
      })
    );
  }

  const requiresFreeze = issues.some((issue) => issue.severity === "block" || issue.severity === "hard_stop");
  const requiresForceExit = issues.some((issue) => issue.code === "MISSING_PROTECTION" && issue.severity === "hard_stop");
  const requiresReduce = issues.some((issue) => issue.code === "POSITION_MISMATCH");
  const requiresCancel = issues.some(
    (issue) => issue.code === "OPEN_ORDER_MISMATCH" || issue.code === "DUPLICATE_INTENT_RISK"
  );

  return {
    ok: issues.length === 0,
    symbol: input.symbol,
    brokerMode: input.brokerMode,
    issues,
    requiresFreeze,
    requiresReduce,
    requiresForceExit,
    requiresCancel,
    lastSyncAtMs: nowMs,
    raw: null,
    summary: {
      missingProtection,
      duplicateIntentRisk,
      stalePendingIntentKeys,
      executionVsBrokerPositionMismatch,
      executionVsBrokerOrderMismatch,
      intendedVsBrokerOrderMismatch,
    },
  };
}
