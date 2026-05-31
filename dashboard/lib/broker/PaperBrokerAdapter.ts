import { BaseBrokerAdapter } from "./BrokerAdapter";
import type {
  AccountBalanceSnapshot,
  BrokerIdentity,
  BrokerSide,
  CancelOrderRequest,
  CancelOrderResult,
  MarketSnapshot,
  OpenOrderSnapshot,
  OrderRequest,
  OrderResult,
  OrderStatus,
  OrderType,
  PositionSnapshot,
  ReconcileIssue,
  ReconcileResult,
  SyncStateInput,
} from "./types";

type PaperBrokerOptions = {
  brokerId?: string;
  brokerName?: string;
  currency?: string;
  startingBalance?: number;
  feeRateBps?: number;
  partialFillRatio?: number | null;
  minPartialFillQty?: number;
};

type PaperOrderRecord = OpenOrderSnapshot & {
  intentKey?: string | null;
  closePosition?: boolean;
  triggerCount: number;
  averageFillPrice: number | null;
};

type PaperJournalEntry = {
  ts: number;
  type:
    | "ORDER_ACCEPTED"
    | "ORDER_FILLED"
    | "ORDER_PARTIALLY_FILLED"
    | "ORDER_CANCELED"
    | "ORDER_REJECTED"
    | "SYNC"
    | "RECONCILE";
  symbol: string;
  orderId?: string | null;
  clientOrderId?: string | null;
  intentKey?: string | null;
  message: string;
  raw?: unknown;
};

function nowMs() {
  return Date.now();
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeQuantity(v: unknown): number | null {
  const n = toFiniteNumber(v);
  return n !== null && n > 0 ? n : null;
}

function normalizePrice(v: unknown): number | null {
  const n = toFiniteNumber(v);
  return n !== null && n > 0 ? n : null;
}

function clampPartialRatio(v: number | null | undefined) {
  if (v == null) return null;
  if (!Number.isFinite(v)) return null;
  if (v <= 0 || v >= 1) return null;
  return v;
}

function sideToPositionSide(side: BrokerSide) {
  return side === "BUY" ? "LONG" : "SHORT";
}

function oppositeSide(side: BrokerSide) {
  return side === "BUY" ? "SELL" : "BUY";
}

function emptyOrderResult(
  symbol: string,
  rejectedReason: string,
  clientOrderId?: string | null,
  intentKey?: string | null
): OrderResult {
  return {
    ok: false,
    mode: "PAPER",
    actionPermission: "SIMULATE",
    symbol,
    clientOrderId: clientOrderId ?? null,
    status: "REJECTED",
    rejectedReason,
    idempotencyKey: intentKey ?? null,
  };
}

function orderShouldTrigger(order: PaperOrderRecord, market: MarketSnapshot): boolean {
  const last = toFiniteNumber(market.price.last);
  const bid = toFiniteNumber(market.price.bid);
  const ask = toFiniteNumber(market.price.ask);
  const price = normalizePrice(order.price);
  const stopPrice = normalizePrice(order.stopPrice);

  if (order.type === "MARKET") return true;

  if (order.type === "LIMIT" && price !== null) {
    if (order.side === "BUY") return ask !== null ? ask <= price : last !== null && last <= price;
    return bid !== null ? bid >= price : last !== null && last >= price;
  }

  if ((order.type === "STOP_MARKET" || order.type === "STOP_LIMIT") && stopPrice !== null) {
    if (order.side === "BUY") return last !== null && last >= stopPrice;
    return last !== null && last <= stopPrice;
  }

  if ((order.type === "TAKE_PROFIT_MARKET" || order.type === "TAKE_PROFIT_LIMIT") && stopPrice !== null) {
    if (order.side === "SELL") return last !== null && last >= stopPrice;
    return last !== null && last <= stopPrice;
  }

  return false;
}

function executionPrice(order: PaperOrderRecord, market: MarketSnapshot): number | null {
  const last = normalizePrice(market.price.last);
  const bid = normalizePrice(market.price.bid);
  const ask = normalizePrice(market.price.ask);
  const orderPrice = normalizePrice(order.price);
  const stopPrice = normalizePrice(order.stopPrice);

  switch (order.type) {
    case "MARKET":
      return order.side === "BUY" ? ask ?? last : bid ?? last;
    case "LIMIT":
      return orderPrice ?? (order.side === "BUY" ? ask ?? last : bid ?? last);
    case "STOP_MARKET":
    case "TAKE_PROFIT_MARKET":
      return order.side === "BUY" ? ask ?? stopPrice ?? last : bid ?? stopPrice ?? last;
    case "STOP_LIMIT":
    case "TAKE_PROFIT_LIMIT":
      return orderPrice ?? stopPrice ?? last;
    default:
      return last;
  }
}

export class PaperBrokerAdapter extends BaseBrokerAdapter {
  private readonly identity: BrokerIdentity;
  private readonly currency: string;
  private readonly feeRateBps: number;
  private readonly partialFillRatio: number | null;
  private readonly minPartialFillQty: number;

  private balance: AccountBalanceSnapshot;
  private readonly positions = new Map<string, PositionSnapshot>();
  private readonly openOrders = new Map<string, PaperOrderRecord[]>();
  private readonly journal: PaperJournalEntry[] = [];
  private readonly intentIndex = new Map<string, OrderResult>();
  private readonly orderSeq = new Map<string, number>();

  constructor(options: PaperBrokerOptions = {}) {
    super();

    this.currency = options.currency ?? "USDT";
    this.feeRateBps = Math.max(0, toFiniteNumber(options.feeRateBps) ?? 0);
    this.partialFillRatio = clampPartialRatio(options.partialFillRatio);
    this.minPartialFillQty = Math.max(0.00000001, toFiniteNumber(options.minPartialFillQty) ?? 0.0001);

    this.identity = {
      brokerId: options.brokerId ?? "paper-broker",
      brokerName: options.brokerName ?? "Paper Broker Adapter",
      mode: "PAPER",
      capabilities: {
        supportsPaper: true,
        supportsLive: false,
        supportsReduceOnly: true,
        supportsClientOrderId: true,
        supportsPartialFillModel: this.partialFillRatio !== null,
      },
    };

    this.balance = {
      currency: this.currency,
      total: toFiniteNumber(options.startingBalance) ?? 10000,
      available: toFiniteNumber(options.startingBalance) ?? 10000,
      used: 0,
      unrealizedPnl: 0,
      updatedAtMs: nowMs(),
    };
  }

  getIdentity(): BrokerIdentity {
    return { ...this.identity };
  }

  async getBalance(): Promise<AccountBalanceSnapshot> {
    return { ...this.balance };
  }

  async getPosition(symbol: string): Promise<PositionSnapshot> {
    const existing = this.positions.get(symbol);
    return existing ? { ...existing } : this.createEmptyPosition(symbol);
  }

  async getOpenOrders(symbol: string): Promise<OpenOrderSnapshot[]> {
    return (this.openOrders.get(symbol) ?? []).map((order) => ({ ...order }));
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const quantity = normalizeQuantity(request.quantity);
    if (quantity === null) {
      return emptyOrderResult(
        request.symbol,
        "quantity must be a positive finite number",
        request.clientOrderId,
        request.intentKey
      );
    }

    if (request.intentKey && this.intentIndex.has(request.intentKey)) {
      const existing = this.intentIndex.get(request.intentKey)!;
      return { ...existing, raw: { duplicateIntent: true, original: existing.raw ?? null } };
    }

    const orderId = this.nextOrderId(request.symbol);
    const ts = nowMs();
    const order: PaperOrderRecord = {
      orderId,
      clientOrderId: request.clientOrderId ?? null,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      status: request.type === "MARKET" ? "PENDING" : "NEW",
      reduceOnly: request.reduceOnly ?? false,
      closePosition: request.closePosition ?? false,
      price: request.price ?? null,
      stopPrice: request.stopPrice ?? null,
      quantity,
      filledQuantity: 0,
      remainingQuantity: quantity,
      createdAtMs: ts,
      updatedAtMs: ts,
      raw: request.metadata ?? null,
      intentKey: request.intentKey ?? null,
      triggerCount: 0,
      averageFillPrice: null,
    };

    const book = this.openOrders.get(request.symbol) ?? [];
    book.push(order);
    this.openOrders.set(request.symbol, book);

    const accepted: OrderResult = {
      ok: true,
      mode: "PAPER",
      actionPermission: "SIMULATE",
      symbol: request.symbol,
      orderId,
      clientOrderId: request.clientOrderId ?? null,
      status: order.status,
      filledQuantity: 0,
      averageFillPrice: null,
      fills: [],
      rejectedReason: null,
      idempotencyKey: request.intentKey ?? null,
      raw: request.metadata ?? null,
    };

    if (request.intentKey) {
      this.intentIndex.set(request.intentKey, accepted);
    }

    this.journal.push({
      ts,
      type: "ORDER_ACCEPTED",
      symbol: request.symbol,
      orderId,
      clientOrderId: request.clientOrderId ?? null,
      intentKey: request.intentKey ?? null,
      message: `${request.type} ${request.side} accepted in PAPER mode`,
      raw: request,
    });

    return accepted;
  }

  async cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResult> {
    const book = this.openOrders.get(request.symbol) ?? [];
    const index = book.findIndex(
      (order) =>
        (request.orderId && order.orderId === request.orderId) ||
        (request.clientOrderId && order.clientOrderId === request.clientOrderId)
    );

    if (index < 0) {
      return {
        ok: false,
        symbol: request.symbol,
        orderId: request.orderId ?? null,
        clientOrderId: request.clientOrderId ?? null,
        status: "NOT_FOUND",
        reason: request.reason ?? "order not found",
      };
    }

    const order = book[index];
    order.status = "CANCELED";
    order.updatedAtMs = nowMs();
    book.splice(index, 1);
    this.openOrders.set(request.symbol, book);

    this.journal.push({
      ts: nowMs(),
      type: "ORDER_CANCELED",
      symbol: request.symbol,
      orderId: order.orderId,
      clientOrderId: order.clientOrderId ?? null,
      intentKey: order.intentKey ?? null,
      message: request.reason ?? "paper order canceled",
      raw: request,
    });

    return {
      ok: true,
      symbol: request.symbol,
      orderId: order.orderId,
      clientOrderId: order.clientOrderId ?? null,
      status: "CANCELED",
      reason: request.reason ?? null,
      raw: order.raw ?? null,
    };
  }

  async syncState(input: SyncStateInput): Promise<ReconcileResult> {
    const symbol = input.symbol;
    const now = nowMs();
    const book = this.openOrders.get(symbol) ?? [];

    if (input.market) {
      for (const order of [...book]) {
        if (!orderShouldTrigger(order, input.market)) continue;
        this.fillOrder(order, input.market);
      }

      this.openOrders.set(
        symbol,
        (this.openOrders.get(symbol) ?? []).filter((order) =>
          !["FILLED", "CANCELED", "REJECTED", "EXPIRED"].includes(order.status)
        )
      );
    }

    const issues: ReconcileIssue[] = [];
    const actualPosition = await this.getPosition(symbol);
    const actualOrders = await this.getOpenOrders(symbol);

    if (input.expectedPosition) {
      const expected = input.expectedPosition;
      if (expected.side !== actualPosition.side || Math.abs(expected.size - actualPosition.size) > 1e-9) {
        issues.push({
          code: "POSITION_MISMATCH",
          severity: "warn",
          message: "expected position does not match paper broker position",
          metadata: { expected, actual: actualPosition },
        });
      }
    }

    if (input.expectedOrders && input.expectedOrders.length !== actualOrders.length) {
      issues.push({
        code: "OPEN_ORDER_MISMATCH",
        severity: "warn",
        message: "expected open orders count does not match paper broker order book",
        metadata: { expectedCount: input.expectedOrders.length, actualCount: actualOrders.length },
      });
    }

    if (actualPosition.side !== "FLAT" && actualPosition.size > 0) {
      const hasProtection = actualOrders.some((order) => order.reduceOnly || order.type.includes("STOP"));
      if (!hasProtection) {
        issues.push({
          code: "MISSING_PROTECTION",
          severity: "block",
          message: "open paper position has no visible protection order",
        });
      }
    }

    if (input.intents && input.intents.length > 1) {
      const uniqueKeys = new Set(
        input.intents.map((intent) => intent.intentKey).filter((value): value is string => !!value)
      );
      if (uniqueKeys.size !== input.intents.filter((intent) => intent.intentKey).length) {
        issues.push({
          code: "DUPLICATE_INTENT_RISK",
          severity: "block",
          message: "duplicate intent keys detected in sync input",
        });
      }
    }

    const requiresFreeze = issues.some((issue) => issue.severity === "block" || issue.severity === "hard_stop");
    const requiresReduce = issues.some((issue) => issue.code === "MISSING_PROTECTION");
    const requiresForceExit = false;
    const requiresCancel = issues.some((issue) => issue.code === "DUPLICATE_INTENT_RISK");

    const result: ReconcileResult = {
      ok: issues.every((issue) => issue.severity === "info" || issue.severity === "warn"),
      symbol,
      brokerMode: "PAPER",
      issues,
      requiresFreeze,
      requiresReduce,
      requiresForceExit,
      requiresCancel,
      lastSyncAtMs: now,
      raw: {
        eventKey: input.eventKey ?? null,
        actualPosition,
        actualOrders,
      },
    };

    this.journal.push({
      ts: now,
      type: "RECONCILE",
      symbol,
      message: `paper broker reconcile completed with ${issues.length} issue(s)`,
      raw: result.raw,
    });

    this.journal.push({
      ts: now,
      type: "SYNC",
      symbol,
      message: "paper broker sync completed",
      raw: input,
    });

    return result;
  }

  getJournal(): PaperJournalEntry[] {
    return this.journal.map((entry) => ({ ...entry }));
  }

  /**
   * getIntentResult
   * คืน OrderResult ล่าสุดสำหรับ intentKey ที่ระบุ
   * ถ้า order ถูก fill แล้ว result จะมี averageFillPrice ที่แท้จริง
   * ใช้สำหรับ internal audit log — ห้ามแสดงต่อ client โดยตรง
   */
  getIntentResult(intentKey: string): import("./types").OrderResult | null {
    return this.intentIndex.get(intentKey) ?? null;
  }

  snapshotState() {
    return {
      balance: { ...this.balance },
      positions: Array.from(this.positions.values()).map((position) => ({ ...position })),
      openOrders: Array.from(this.openOrders.values()).flat().map((order) => ({ ...order })),
      journal: this.getJournal(),
    };
  }

  private nextOrderId(symbol: string) {
    const next = (this.orderSeq.get(symbol) ?? 0) + 1;
    this.orderSeq.set(symbol, next);
    return `PAPER_${symbol}_${String(next).padStart(6, "0")}`;
  }

  private fillOrder(order: PaperOrderRecord, market: MarketSnapshot) {
    const remaining = normalizeQuantity(order.remainingQuantity);
    if (remaining === null) return;

    const fillPrice = executionPrice(order, market);
    if (fillPrice === null) return;

    let fillQty = remaining;
    if (
      this.partialFillRatio !== null &&
      remaining > this.minPartialFillQty &&
      order.triggerCount === 0
    ) {
      fillQty = Math.max(this.minPartialFillQty, Number((remaining * this.partialFillRatio).toFixed(8)));
      fillQty = Math.min(fillQty, remaining);
    }

    const prevFilled = toFiniteNumber(order.filledQuantity) ?? 0;
    const nextFilled = prevFilled + fillQty;
    const nextRemaining = Math.max(0, remaining - fillQty);

    order.triggerCount += 1;
    order.filledQuantity = nextFilled;
    order.remainingQuantity = nextRemaining;
    order.updatedAtMs = nowMs();
    order.averageFillPrice =
      prevFilled > 0 && order.averageFillPrice !== null
        ? ((order.averageFillPrice * prevFilled + fillPrice * fillQty) / nextFilled)
        : fillPrice;
    order.status = nextRemaining > this.minPartialFillQty ? "PARTIALLY_FILLED" : "FILLED";

    this.applyPositionFill(order, fillQty, fillPrice);

    const fee = (fillPrice * fillQty * this.feeRateBps) / 10000;
    this.balance.total = (this.balance.total ?? 0) - fee;
    this.balance.available = (this.balance.available ?? 0) - fee;
    this.balance.used = 0;
    this.balance.updatedAtMs = nowMs();

    const fillType = order.status === "FILLED" ? "ORDER_FILLED" : "ORDER_PARTIALLY_FILLED";
    this.journal.push({
      ts: nowMs(),
      type: fillType,
      symbol: order.symbol,
      orderId: order.orderId,
      clientOrderId: order.clientOrderId ?? null,
      intentKey: order.intentKey ?? null,
      message:
        order.status === "FILLED"
          ? `paper order fully filled at ${fillPrice}`
          : `paper order partially filled at ${fillPrice}`,
      raw: {
        quantity: fillQty,
        fee,
        market,
      },
    });

    if (order.intentKey) {
      this.intentIndex.set(order.intentKey, {
        ok: true,
        mode: "PAPER",
        actionPermission: "SIMULATE",
        symbol: order.symbol,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId ?? null,
        status: order.status,
        filledQuantity: order.filledQuantity ?? null,
        averageFillPrice: order.averageFillPrice,
        fills: [
          {
            price: fillPrice,
            quantity: fillQty,
            fee,
            feeCurrency: this.currency,
            timestampMs: nowMs(),
          },
        ],
        rejectedReason: null,
        idempotencyKey: order.intentKey,
        raw: order.raw ?? null,
      });
    }
  }

  private applyPositionFill(order: PaperOrderRecord, quantity: number, fillPrice: number) {
    const existing = this.positions.get(order.symbol) ?? this.createEmptyPosition(order.symbol);
    const existingSize = Math.abs(existing.size);
    const existingSide = existing.side;
    const fillSide = sideToPositionSide(order.side);
    const reducing =
      order.reduceOnly === true ||
      order.side === oppositeSide(existingSide === "LONG" ? "BUY" : existingSide === "SHORT" ? "SELL" : order.side) ||
      order.closePosition === true;

    if (existingSide === "FLAT" || existingSize === 0) {
      this.positions.set(order.symbol, {
        symbol: order.symbol,
        side: fillSide,
        size: quantity,
        entryPrice: fillPrice,
        updatedAtMs: nowMs(),
        raw: { source: "paper_fill_open" },
      });
      return;
    }

    if (existingSide === fillSide && !reducing) {
      const nextSize = existingSize + quantity;
      const avgEntry =
        existing.entryPrice !== null
          ? (existing.entryPrice * existingSize + fillPrice * quantity) / nextSize
          : fillPrice;

      this.positions.set(order.symbol, {
        ...existing,
        side: fillSide,
        size: nextSize,
        entryPrice: avgEntry,
        updatedAtMs: nowMs(),
      });
      return;
    }

    const remaining = existingSize - quantity;
    if (remaining > this.minPartialFillQty) {
      this.positions.set(order.symbol, {
        ...existing,
        size: remaining,
        updatedAtMs: nowMs(),
        raw: { source: "paper_fill_reduce" },
      });
      return;
    }

    if (remaining < -this.minPartialFillQty) {
      this.positions.set(order.symbol, {
        symbol: order.symbol,
        side: fillSide,
        size: Math.abs(remaining),
        entryPrice: fillPrice,
        updatedAtMs: nowMs(),
        raw: { source: "paper_flip_position" },
      });
      return;
    }

    this.positions.set(order.symbol, this.createEmptyPosition(order.symbol));
  }
}
