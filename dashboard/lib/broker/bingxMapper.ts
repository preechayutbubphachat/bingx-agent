import type {
  AccountBalanceSnapshot,
  BrokerSide,
  CancelOrderRequest,
  CancelOrderResult,
  MarketSnapshot,
  OpenOrderSnapshot,
  OrderRequest,
  OrderResult,
  OrderStatus,
  OrderType,
  PositionSide,
  PositionSnapshot,
  TimeInForce,
} from "./types";
import type {
  BingxBalancePayload,
  BingxCancelOrderRequest,
  BingxNormalizedError,
  BingxOrderPayload,
  BingxOrderSide,
  BingxOrderStatus,
  BingxOrderType,
  BingxPlaceOrderRequest,
  BingxPositionPayload,
  BingxPositionSide,
  BingxRequestValidationResult,
  BingxTickerPayload,
} from "./bingxTypes";

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function formatDecimal(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return String(value);
}

function inferErrorCategory(message: string): BingxNormalizedError["category"] {
  const lowered = message.toLowerCase();

  if (
    lowered.includes("missing") ||
    lowered.includes("not configured") ||
    lowered.includes("configuration") ||
    lowered.includes("config")
  ) {
    return "CONFIG";
  }

  if (lowered.includes("401") || lowered.includes("403") || lowered.includes("signature") || lowered.includes("auth")) {
    return "AUTH";
  }

  if (lowered.includes("429") || lowered.includes("rate limit") || lowered.includes("too many request")) {
    return "RATE_LIMIT";
  }

  if (lowered.includes("timeout") || lowered.includes("econn") || lowered.includes("network") || lowered.includes("socket")) {
    return "NETWORK";
  }

  if (lowered.includes("not found") || lowered.includes("404")) {
    return "NOT_FOUND";
  }

  if (
    lowered.includes("invalid") ||
    lowered.includes("quantity") ||
    lowered.includes("price") ||
    lowered.includes("parameter") ||
    lowered.includes("validation")
  ) {
    return "VALIDATION";
  }

  if (lowered.includes("guard") || lowered.includes("blocked") || lowered.includes("deny") || lowered.includes("no send")) {
    return "GUARD_BLOCKED";
  }

  return "EXCHANGE";
}

function normalizeKnownLikeError(known: Record<string, unknown>, raw: unknown): BingxNormalizedError | null {
  const knownCategory = toText(known.category)?.toUpperCase();
  const knownCode = toText(known.code);
  const knownMessage = toText(known.message) ?? toText(known.msg);
  const knownRetriable = typeof known.retriable === "boolean" ? known.retriable : null;

  if (knownCategory && knownCode && knownMessage) {
    return {
      category: knownCategory as BingxNormalizedError["category"],
      code: knownCode,
      message: knownMessage,
      retriable: knownRetriable === true,
      raw: known.raw ?? raw,
    };
  }

  const envelopeCode = knownCode;
  const envelopeMessage = knownMessage;
  if (envelopeCode && envelopeMessage) {
    const category = inferErrorCategory(envelopeMessage);
    return {
      category,
      code: envelopeCode,
      message: envelopeMessage,
      retriable: category === "RATE_LIMIT" || category === "NETWORK",
      raw: known.raw ?? raw,
    };
  }

  return null;
}

export function normalizeBingxError(error: unknown): BingxNormalizedError {
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const known = error as Record<string, unknown>;
    const normalizedDirect = normalizeKnownLikeError(known, error);
    if (normalizedDirect) return normalizedDirect;

    const responseData = known.response && typeof known.response === "object"
      ? (known.response as Record<string, unknown>).data
      : null;
    if (responseData && typeof responseData === "object" && !Array.isArray(responseData)) {
      const normalizedResponseData = normalizeKnownLikeError(responseData as Record<string, unknown>, error);
      if (normalizedResponseData) return normalizedResponseData;
    }

    const nestedEnvelope = known.data;
    if (nestedEnvelope && typeof nestedEnvelope === "object" && !Array.isArray(nestedEnvelope)) {
      const normalizedNestedEnvelope = normalizeKnownLikeError(
        nestedEnvelope as Record<string, unknown>,
        error
      );
      if (normalizedNestedEnvelope) return normalizedNestedEnvelope;
    }
  }

  const message =
    error instanceof Error ? error.message : toText(error) ?? "unknown BingX adapter error";
  const category = inferErrorCategory(message);
  return {
    category,
    code:
      category === "CONFIG"
        ? "bingx_config_error"
        : category === "AUTH"
          ? "bingx_auth_error"
          : category === "RATE_LIMIT"
            ? "bingx_rate_limit"
            : category === "NETWORK"
              ? "bingx_network_error"
              : category === "NOT_FOUND"
                ? "bingx_not_found"
                : category === "VALIDATION"
                  ? "bingx_validation_error"
                  : category === "GUARD_BLOCKED"
                    ? "bingx_guard_blocked"
                    : "bingx_exchange_error",
    message,
    retriable: category === "RATE_LIMIT" || category === "NETWORK",
    raw: error,
  };
}

function validationIssue(field: string, code: string, message: string) {
  return { field, code, message };
}

function validationErrorMessage(scope: string, result: BingxRequestValidationResult) {
  return `${scope} validation failed: ${result.issues.map((issue) => `${issue.field}:${issue.code}`).join(", ")}`;
}

export function mapOrderTypeToBingx(type: OrderType): BingxOrderType {
  switch (type) {
    case "MARKET":
      return "MARKET";
    case "LIMIT":
      return "LIMIT";
    case "STOP_MARKET":
      return "STOP_MARKET";
    case "STOP_LIMIT":
      return "STOP";
    case "TAKE_PROFIT_MARKET":
      return "TAKE_PROFIT_MARKET";
    case "TAKE_PROFIT_LIMIT":
      return "TAKE_PROFIT";
    default:
      return "MARKET";
  }
}

export function mapOrderTypeFromBingx(type: unknown): OrderType {
  const normalized = toText(type)?.toUpperCase();
  switch (normalized) {
    case "MARKET":
      return "MARKET";
    case "LIMIT":
      return "LIMIT";
    case "STOP_MARKET":
    case "TRIGGER_MARKET":
      return "STOP_MARKET";
    case "STOP":
    case "TRIGGER_LIMIT":
      return "STOP_LIMIT";
    case "TAKE_PROFIT_MARKET":
      return "TAKE_PROFIT_MARKET";
    case "TAKE_PROFIT":
      return "TAKE_PROFIT_LIMIT";
    default:
      return "MARKET";
  }
}

export function mapSideToBingx(side: BrokerSide): BingxOrderSide {
  return side;
}

export function mapSideFromBingx(side: unknown): BrokerSide {
  return toText(side)?.toUpperCase() === "SELL" ? "SELL" : "BUY";
}

export function mapPositionSideToBingx(side: PositionSide): BingxPositionSide {
  switch (side) {
    case "LONG":
      return "LONG";
    case "SHORT":
      return "SHORT";
    default:
      return "BOTH";
  }
}

export function mapPositionSideFromBingx(positionSide: unknown, side?: unknown, size?: unknown): PositionSide {
  const normalizedPositionSide = toText(positionSide)?.toUpperCase();
  if (normalizedPositionSide === "LONG") return "LONG";
  if (normalizedPositionSide === "SHORT") return "SHORT";

  const normalizedSide = toText(side)?.toUpperCase();
  const amount = toFiniteNumber(size);
  if (normalizedSide === "BUY" && (amount === null || amount >= 0)) return amount === 0 ? "FLAT" : "LONG";
  if (normalizedSide === "SELL" && (amount === null || amount >= 0)) return amount === 0 ? "FLAT" : "SHORT";
  return amount === 0 ? "FLAT" : "FLAT";
}

export function mapTimeInForceToBingx(timeInForce: TimeInForce | null | undefined): string | null {
  if (!timeInForce) return null;
  switch (timeInForce) {
    case "GTC":
      return "GTC";
    case "IOC":
      return "IOC";
    case "FOK":
      return "FOK";
    case "POST_ONLY":
      return "POST_ONLY";
    default:
      return null;
  }
}

export function mapTimeInForceFromBingx(timeInForce: unknown): TimeInForce | null {
  const normalized = toText(timeInForce)?.toUpperCase();
  if (normalized === "GTC") return "GTC";
  if (normalized === "IOC") return "IOC";
  if (normalized === "FOK") return "FOK";
  if (normalized === "POST_ONLY") return "POST_ONLY";
  return null;
}

export function mapOrderStatusFromBingx(status: unknown): OrderStatus {
  const normalized = toText(status)?.toUpperCase() as BingxOrderStatus | undefined;
  switch (normalized) {
    case "PENDING":
      return "PENDING";
    case "NEW":
      return "NEW";
    case "PARTIALLY_FILLED":
      return "PARTIALLY_FILLED";
    case "FILLED":
      return "FILLED";
    case "CANCELED":
      return "CANCELED";
    case "FAILED":
      return "REJECTED";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "UNKNOWN";
  }
}

export function validatePlaceOrderRequestForBingx(request: OrderRequest): BingxRequestValidationResult {
  const issues = [];

  if (!toText(request.symbol)) {
    issues.push(validationIssue("symbol", "missing_symbol", "symbol is required"));
  }
  if (!request.side || (request.side !== "BUY" && request.side !== "SELL")) {
    issues.push(validationIssue("side", "invalid_side", "side must be BUY or SELL"));
  }
  if (!request.type) {
    issues.push(validationIssue("type", "missing_type", "order type is required"));
  }

  const quantity = toFiniteNumber(request.quantity);
  if (quantity === null || quantity <= 0) {
    issues.push(validationIssue("quantity", "invalid_quantity", "quantity must be a finite number greater than zero"));
  }

  if (request.type === "LIMIT" || request.type === "STOP_LIMIT" || request.type === "TAKE_PROFIT_LIMIT") {
    const price = toFiniteNumber(request.price);
    if (price === null || price <= 0) {
      issues.push(validationIssue("price", "invalid_price", "limit-like orders require a positive price"));
    }
  }

  if (
    request.type === "STOP_MARKET" ||
    request.type === "STOP_LIMIT" ||
    request.type === "TAKE_PROFIT_MARKET" ||
    request.type === "TAKE_PROFIT_LIMIT"
  ) {
    const stopPrice = toFiniteNumber(request.stopPrice);
    if (stopPrice === null || stopPrice <= 0) {
      issues.push(
        validationIssue("stopPrice", "invalid_stop_price", "trigger/take-profit orders require a positive stop price")
      );
    }
  }

  if (request.closePosition === true && request.reduceOnly !== true) {
    issues.push(
      validationIssue(
        "closePosition|reduceOnly",
        "close_position_requires_reduce_only",
        "closePosition requests must also be marked reduceOnly"
      )
    );
  }

  if (request.closePosition === true && request.quantity > 0) {
    issues.push(
      validationIssue(
        "quantity",
        "close_position_quantity_conflict",
        "closePosition requests should not carry a positive quantity for BingX mapping"
      )
    );
  }

  const clientOrderId = toText(request.clientOrderId ?? request.intentKey);
  if (clientOrderId && clientOrderId.length > 64) {
    issues.push(
      validationIssue(
        "clientOrderId",
        "client_order_id_too_long",
        "clientOrderId/intentKey exceeds the BingX safety limit of 64 characters"
      )
    );
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function validateCancelOrderRequestForBingx(request: CancelOrderRequest): BingxRequestValidationResult {
  const issues = [];

  if (!toText(request.symbol)) {
    issues.push(validationIssue("symbol", "missing_symbol", "symbol is required"));
  }
  if (!toText(request.orderId) && !toText(request.clientOrderId)) {
    issues.push(
      validationIssue(
        "orderId|clientOrderId",
        "missing_cancel_target",
        "cancel requests require either orderId or clientOrderId"
      )
    );
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function mapPlaceOrderRequestToBingx(
  request: OrderRequest,
  options?: {
    positionSide?: PositionSide | null;
    recvWindow?: number | null;
    timestamp?: number | null;
  }
): BingxPlaceOrderRequest {
  const validation = validatePlaceOrderRequestForBingx(request);
  if (!validation.ok) {
    throw {
      category: "VALIDATION",
      code: "bingx_place_order_validation_failed",
      message: validationErrorMessage("placeOrder", validation),
      retriable: false,
      issues: validation.issues,
      raw: request,
    };
  }

  return {
    symbol: request.symbol,
    side: mapSideToBingx(request.side),
    positionSide: options?.positionSide ? mapPositionSideToBingx(options.positionSide) : null,
    type: mapOrderTypeToBingx(request.type),
    quantity: formatDecimal(request.quantity) ?? "0",
    price: formatDecimal(request.price),
    stopPrice: formatDecimal(request.stopPrice),
    timeInForce: mapTimeInForceToBingx(request.timeInForce),
    reduceOnly: request.reduceOnly ?? null,
    closePosition: request.closePosition ?? null,
    clientOrderId: request.clientOrderId ?? request.intentKey ?? null,
    recvWindow: options?.recvWindow ?? null,
    timestamp: options?.timestamp ?? null,
  };
}

export function mapCancelOrderRequestToBingx(
  request: CancelOrderRequest,
  options?: { recvWindow?: number | null; timestamp?: number | null }
): BingxCancelOrderRequest {
  const validation = validateCancelOrderRequestForBingx(request);
  if (!validation.ok) {
    throw {
      category: "VALIDATION",
      code: "bingx_cancel_order_validation_failed",
      message: validationErrorMessage("cancelOrder", validation),
      retriable: false,
      issues: validation.issues,
      raw: request,
    };
  }

  return {
    symbol: request.symbol,
    orderId: request.orderId ?? null,
    clientOrderId: request.clientOrderId ?? null,
    recvWindow: options?.recvWindow ?? null,
    timestamp: options?.timestamp ?? null,
  };
}

export function mapTickerFromBingx(payload: BingxTickerPayload): MarketSnapshot {
  return {
    symbol: payload.symbol,
    price: {
      last: toFiniteNumber(payload.lastPrice),
      bid: toFiniteNumber(payload.bidPrice),
      ask: toFiniteNumber(payload.askPrice),
      mark: toFiniteNumber(payload.markPrice),
      index: toFiniteNumber(payload.indexPrice),
      updatedAtMs: toFiniteNumber(payload.time),
    },
  };
}

export function mapBalanceFromBingx(payload: BingxBalancePayload): AccountBalanceSnapshot {
  return {
    currency: toText(payload.asset) ?? toText(payload.currency) ?? "USDT",
    total: toFiniteNumber(payload.balance),
    available: toFiniteNumber(payload.availableMargin ?? payload.available),
    used: toFiniteNumber(payload.frozenMargin ?? payload.usedMargin),
    unrealizedPnl: toFiniteNumber(payload.unrealizedProfit),
    updatedAtMs: toFiniteNumber(payload.updateTime),
    raw: payload.raw ?? payload,
  };
}

export function mapPositionFromBingx(payload: BingxPositionPayload): PositionSnapshot {
  const rawSize = Math.abs(toFiniteNumber(payload.positionAmt) ?? 0);
  return {
    symbol: payload.symbol,
    side: mapPositionSideFromBingx(payload.positionSide, payload.side, rawSize),
    size: rawSize,
    entryPrice: toFiniteNumber(payload.entryPrice ?? payload.avgPrice),
    markPrice: toFiniteNumber(payload.markPrice),
    notional: null,
    unrealizedPnl: toFiniteNumber(payload.unrealizedProfit),
    leverage: toFiniteNumber(payload.leverage),
    liquidationPrice: toFiniteNumber(payload.liquidationPrice),
    isolated: toBoolean(payload.isolated),
    updatedAtMs: toFiniteNumber(payload.updateTime),
    raw: payload.raw ?? payload,
  };
}

export function mapOpenOrderFromBingx(payload: BingxOrderPayload): OpenOrderSnapshot {
  const quantity = toFiniteNumber(payload.origQty) ?? 0;
  const filledQuantity = toFiniteNumber(payload.executedQty ?? payload.cumQty);
  const remainingQuantity =
    quantity > 0 && filledQuantity !== null ? Math.max(0, quantity - filledQuantity) : null;

  return {
    orderId: toText(payload.orderId) ?? "",
    clientOrderId: toText(payload.clientOrderId),
    symbol: payload.symbol,
    side: mapSideFromBingx(payload.side),
    type: mapOrderTypeFromBingx(payload.type),
    status: mapOrderStatusFromBingx(payload.status),
    reduceOnly: toBoolean(payload.reduceOnly) ?? false,
    price: toFiniteNumber(payload.price),
    stopPrice: toFiniteNumber(payload.stopPrice),
    quantity,
    filledQuantity,
    remainingQuantity,
    createdAtMs: toFiniteNumber(payload.createTime),
    updatedAtMs: toFiniteNumber(payload.updateTime),
    raw: payload.raw ?? payload,
  };
}

export function mapOrderResultFromBingx(
  payload: BingxOrderPayload,
  mode: "LIVE_SHADOW" | "LIVE_LIMITED" | "LIVE_FULL"
): OrderResult {
  const openOrder = mapOpenOrderFromBingx(payload);
  return {
    ok: openOrder.status !== "REJECTED" && openOrder.status !== "UNKNOWN",
    mode,
    actionPermission: "ALLOW",
    symbol: openOrder.symbol,
    orderId: openOrder.orderId,
    clientOrderId: openOrder.clientOrderId ?? null,
    status: openOrder.status,
    filledQuantity: openOrder.filledQuantity ?? null,
    averageFillPrice: toFiniteNumber(payload.avgPrice ?? payload.price),
    rejectedReason: openOrder.status === "REJECTED" ? "bingx order rejected" : null,
    idempotencyKey: openOrder.clientOrderId ?? null,
    raw: payload.raw ?? payload,
  };
}

export function mapCancelResultFromBingx(
  payload: BingxOrderPayload | null | undefined,
  request: CancelOrderRequest
): CancelOrderResult {
  const status = payload ? mapOrderStatusFromBingx(payload.status) : "UNKNOWN";
  return {
    ok: status === "CANCELED" || status === "UNKNOWN",
    symbol: request.symbol,
    orderId: payload ? toText(payload.orderId) : request.orderId ?? null,
    clientOrderId: payload ? toText(payload.clientOrderId) : request.clientOrderId ?? null,
    status: status === "CANCELED" ? "CANCELED" : status === "REJECTED" ? "REJECTED" : "UNKNOWN",
    reason: null,
    raw: payload?.raw ?? payload ?? null,
  };
}
