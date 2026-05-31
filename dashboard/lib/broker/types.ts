export type BrokerMode = "READ_ONLY" | "PAPER" | "LIVE_SHADOW" | "LIVE_LIMITED" | "LIVE_FULL";
export type BrokerSide = "BUY" | "SELL";
export type PositionSide = "LONG" | "SHORT" | "FLAT";
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "STOP_LIMIT" | "TAKE_PROFIT_MARKET" | "TAKE_PROFIT_LIMIT";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "POST_ONLY";
export type OrderStatus =
  | "NEW"
  | "PENDING"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED"
  | "UNKNOWN";
export type OrderIntentKind =
  | "OPEN_POSITION"
  | "ADD_PROTECTION"
  | "TAKE_PROFIT"
  | "REDUCE_POSITION"
  | "CLOSE_POSITION"
  | "CANCEL_ORDER"
  | "SYNC_ONLY";
export type BrokerActionPermission = "DENY" | "SIMULATE" | "ALLOW";

export type BrokerPriceSnapshot = {
  last: number | null;
  bid: number | null;
  ask: number | null;
  mark?: number | null;
  index?: number | null;
  updatedAtMs: number | null;
};

export type MarketSnapshot = {
  symbol: string;
  timeframe?: string | null;
  closeTs5m?: number | null;
  eventKey?: string | null;
  price: BrokerPriceSnapshot;
  sourceFreshnessTag?: string | null;
  sourceAgeSec?: number | null;
  derivativesFreshnessTag?: string | null;
  derivativesAgeSec?: number | null;
};

export type PositionSnapshot = {
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number | null;
  markPrice?: number | null;
  notional?: number | null;
  unrealizedPnl?: number | null;
  leverage?: number | null;
  liquidationPrice?: number | null;
  isolated?: boolean | null;
  updatedAtMs: number | null;
  raw?: unknown;
};

export type OpenOrderSnapshot = {
  orderId: string;
  clientOrderId?: string | null;
  symbol: string;
  side: BrokerSide;
  type: OrderType;
  status: OrderStatus;
  reduceOnly?: boolean;
  price?: number | null;
  stopPrice?: number | null;
  quantity: number;
  filledQuantity?: number | null;
  remainingQuantity?: number | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  raw?: unknown;
};

export type AccountBalanceSnapshot = {
  currency: string;
  total: number | null;
  available: number | null;
  used?: number | null;
  unrealizedPnl?: number | null;
  updatedAtMs: number | null;
  raw?: unknown;
};

export type OrderIntent = {
  kind: OrderIntentKind;
  symbol: string;
  side?: BrokerSide | null;
  reduceOnly?: boolean;
  closePosition?: boolean;
  quantity?: number | null;
  price?: number | null;
  stopPrice?: number | null;
  takeProfitPrice?: number | null;
  orderType?: OrderType | null;
  timeInForce?: TimeInForce | null;
  eventKey?: string | null;
  candleKey?: string | null;
  intentKey?: string | null;
  parentIntentKey?: string | null;
  reason?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
};

export type OrderRequest = {
  symbol: string;
  side: BrokerSide;
  type: OrderType;
  quantity: number;
  price?: number | null;
  stopPrice?: number | null;
  reduceOnly?: boolean;
  closePosition?: boolean;
  timeInForce?: TimeInForce | null;
  clientOrderId?: string | null;
  intentKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OrderFill = {
  price: number | null;
  quantity: number | null;
  fee?: number | null;
  feeCurrency?: string | null;
  timestampMs: number | null;
};

export type OrderResult = {
  ok: boolean;
  mode: BrokerMode;
  actionPermission: BrokerActionPermission;
  symbol: string;
  orderId?: string | null;
  clientOrderId?: string | null;
  status: OrderStatus;
  filledQuantity?: number | null;
  averageFillPrice?: number | null;
  fills?: OrderFill[];
  rejectedReason?: string | null;
  idempotencyKey?: string | null;
  raw?: unknown;
};

export type CancelOrderRequest = {
  symbol: string;
  orderId?: string | null;
  clientOrderId?: string | null;
  reason?: string | null;
};

export type CancelOrderResult = {
  ok: boolean;
  symbol: string;
  orderId?: string | null;
  clientOrderId?: string | null;
  status: "CANCELED" | "NOT_FOUND" | "REJECTED" | "UNKNOWN";
  reason?: string | null;
  raw?: unknown;
};

export type ReconcileIssueSeverity = "info" | "warn" | "block" | "hard_stop";
export type ReconcileIssueCode =
  | "POSITION_MISMATCH"
  | "OPEN_ORDER_MISMATCH"
  | "MISSING_PROTECTION"
  | "DUPLICATE_INTENT_RISK"
  | "STALE_PENDING_INTENT"
  | "BROKER_UNAVAILABLE"
  | "UNKNOWN";

export type ReconcileIssue = {
  code: ReconcileIssueCode;
  severity: ReconcileIssueSeverity;
  message: string;
  metadata?: Record<string, unknown> | null;
};

export type ReconcileResult = {
  ok: boolean;
  symbol: string;
  brokerMode: BrokerMode;
  issues: ReconcileIssue[];
  requiresFreeze: boolean;
  requiresReduce: boolean;
  requiresForceExit: boolean;
  requiresCancel: boolean;
  lastSyncAtMs: number | null;
  raw?: unknown;
};

export type SyncStateInput = {
  symbol: string;
  market?: MarketSnapshot | null;
  expectedPosition?: PositionSnapshot | null;
  expectedOrders?: OpenOrderSnapshot[];
  intents?: OrderIntent[];
  eventKey?: string | null;
};

export type BrokerIdentity = {
  brokerId: string;
  brokerName: string;
  mode: BrokerMode;
  capabilities: {
    supportsPaper: boolean;
    supportsLive: boolean;
    supportsReduceOnly: boolean;
    supportsClientOrderId: boolean;
    supportsPartialFillModel: boolean;
  };
};
