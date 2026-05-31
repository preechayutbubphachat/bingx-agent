import type { BrokerSide, OrderStatus, OrderType, PositionSide, TimeInForce } from "./types";

export type BingxEnvironment = "production" | "testnet";
export type BingxProductType = "PERPETUAL" | "STANDARD";
export type BingxMarginMode = "ISOLATED" | "CROSSED" | "UNKNOWN";
export type BingxPositionMode = "ONE_WAY" | "HEDGE" | "UNKNOWN";
export type BingxOrderSide = "BUY" | "SELL";
export type BingxPositionSide = "LONG" | "SHORT" | "BOTH";
export type BingxOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP_MARKET"
  | "STOP"
  | "TAKE_PROFIT_MARKET"
  | "TAKE_PROFIT"
  | "TRIGGER_MARKET"
  | "TRIGGER_LIMIT";
export type BingxOrderStatus =
  | "PENDING"
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "FAILED"
  | "EXPIRED"
  | "UNKNOWN";

export type BingxErrorCategory =
  | "CONFIG"
  | "NETWORK"
  | "AUTH"
  | "RATE_LIMIT"
  | "VALIDATION"
  | "NOT_FOUND"
  | "EXCHANGE"
  | "GUARD_BLOCKED"
  | "UNKNOWN";

export type BingxNormalizedError = {
  category: BingxErrorCategory;
  code: string;
  message: string;
  retriable: boolean;
  raw?: unknown;
};

export type BingxRequestValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type BingxRequestValidationResult = {
  ok: boolean;
  issues: BingxRequestValidationIssue[];
};

export type BingxReadOnlyMethod = "getBalances" | "getPositions" | "getOpenOrders";
export type BingxTradingMethod = "placeOrder" | "cancelOrder";

export type BingxApiEnvelope<T> = {
  code: number | string;
  msg?: string | null;
  message?: string | null;
  data?: T | null;
  ts?: number | null;
};

export type BingxSymbolInfo = {
  symbol: string;
  baseAsset?: string | null;
  quoteAsset?: string | null;
  pricePrecision?: number | null;
  quantityPrecision?: number | null;
  minQty?: string | number | null;
  stepSize?: string | number | null;
  tickSize?: string | number | null;
  contractSize?: string | number | null;
  productType?: BingxProductType | null;
  raw?: unknown;
};

export type BingxTickerPayload = {
  symbol: string;
  lastPrice?: string | number | null;
  bidPrice?: string | number | null;
  askPrice?: string | number | null;
  markPrice?: string | number | null;
  indexPrice?: string | number | null;
  time?: number | null;
  raw?: unknown;
};

export type BingxBalancePayload = {
  asset?: string | null;
  currency?: string | null;
  balance?: string | number | null;
  availableMargin?: string | number | null;
  available?: string | number | null;
  frozenMargin?: string | number | null;
  usedMargin?: string | number | null;
  unrealizedProfit?: string | number | null;
  updateTime?: number | null;
  raw?: unknown;
};

export type BingxPositionPayload = {
  symbol: string;
  positionSide?: BingxPositionSide | string | null;
  side?: BingxOrderSide | string | null;
  positionAmt?: string | number | null;
  availableAmt?: string | number | null;
  avgPrice?: string | number | null;
  entryPrice?: string | number | null;
  markPrice?: string | number | null;
  unrealizedProfit?: string | number | null;
  leverage?: string | number | null;
  isolated?: boolean | null;
  marginType?: string | null;
  liquidationPrice?: string | number | null;
  updateTime?: number | null;
  raw?: unknown;
};

export type BingxOrderPayload = {
  orderId?: string | number | null;
  clientOrderId?: string | null;
  symbol: string;
  side?: BingxOrderSide | string | null;
  positionSide?: BingxPositionSide | string | null;
  type?: BingxOrderType | string | null;
  origQty?: string | number | null;
  executedQty?: string | number | null;
  cumQty?: string | number | null;
  price?: string | number | null;
  stopPrice?: string | number | null;
  avgPrice?: string | number | null;
  status?: BingxOrderStatus | string | null;
  reduceOnly?: boolean | null;
  closePosition?: boolean | null;
  timeInForce?: string | null;
  updateTime?: number | null;
  createTime?: number | null;
  raw?: unknown;
};

export type BingxPlaceOrderRequest = {
  symbol: string;
  side: BingxOrderSide;
  positionSide?: BingxPositionSide | null;
  type: BingxOrderType;
  quantity: string;
  price?: string | null;
  stopPrice?: string | null;
  timeInForce?: string | null;
  reduceOnly?: boolean | null;
  closePosition?: boolean | null;
  clientOrderId?: string | null;
  recvWindow?: number | null;
  timestamp?: number | null;
};

export type BingxCancelOrderRequest = {
  symbol: string;
  orderId?: string | null;
  clientOrderId?: string | null;
  recvWindow?: number | null;
  timestamp?: number | null;
};

export type BingxNormalizedOrderMapping = {
  internalType: OrderType;
  internalStatus: OrderStatus;
  internalSide: BrokerSide;
  internalPositionSide: PositionSide;
  internalTif: TimeInForce | null;
};

export type BingxTransportDependencyBoundary = {
  read_only_methods: BingxReadOnlyMethod[];
  trading_methods: BingxTradingMethod[];
  required_dependencies: Array<"transport" | "clock" | "config" | "dry_run_flag" | "live_execution_guard">;
  transport_profile?: BingxTransportProfile | null;
};

export type BingxTransportMethodAvailability = "configured" | "missing";

export type BingxTransportProfile = {
  wiring: "direct" | "split";
  read_only: Record<BingxReadOnlyMethod, BingxTransportMethodAvailability>;
  trading: Record<BingxTradingMethod, BingxTransportMethodAvailability>;
  all_read_only_configured: boolean;
  any_trading_configured: boolean;
  all_trading_configured: boolean;
};
