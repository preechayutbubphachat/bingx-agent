import type {
  AccountBalanceSnapshot,
  BrokerIdentity,
  CancelOrderRequest,
  CancelOrderResult,
  MarketSnapshot,
  OpenOrderSnapshot,
  OrderRequest,
  OrderResult,
  PositionSnapshot,
  ReconcileResult,
  SyncStateInput,
} from "./types";

export interface BrokerAdapter {
  getIdentity(): BrokerIdentity;

  getBalance(): Promise<AccountBalanceSnapshot>;

  getPosition(symbol: string): Promise<PositionSnapshot>;

  getOpenOrders(symbol: string): Promise<OpenOrderSnapshot[]>;

  placeOrder(request: OrderRequest): Promise<OrderResult>;

  cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResult>;

  syncState(input: SyncStateInput): Promise<ReconcileResult>;
}

export abstract class BaseBrokerAdapter implements BrokerAdapter {
  abstract getIdentity(): BrokerIdentity;

  abstract getBalance(): Promise<AccountBalanceSnapshot>;

  abstract getPosition(symbol: string): Promise<PositionSnapshot>;

  abstract getOpenOrders(symbol: string): Promise<OpenOrderSnapshot[]>;

  abstract placeOrder(request: OrderRequest): Promise<OrderResult>;

  abstract cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResult>;

  abstract syncState(input: SyncStateInput): Promise<ReconcileResult>;

  protected createEmptyPosition(symbol: string): PositionSnapshot {
    return {
      symbol,
      side: "FLAT",
      size: 0,
      entryPrice: null,
      updatedAtMs: Date.now(),
    };
  }

  protected createEmptyOpenOrders(): OpenOrderSnapshot[] {
    return [];
  }

  protected createUnavailableBalance(currency = "USDT"): AccountBalanceSnapshot {
    return {
      currency,
      total: null,
      available: null,
      updatedAtMs: Date.now(),
    };
  }

  protected createSyncUnavailable(symbol: string): ReconcileResult {
    const identity = this.getIdentity();

    return {
      ok: false,
      symbol,
      brokerMode: identity.mode,
      issues: [
        {
          code: "BROKER_UNAVAILABLE",
          severity: "block",
          message: "broker sync is not available in the current adapter state",
        },
      ],
      requiresFreeze: true,
      requiresReduce: false,
      requiresForceExit: false,
      requiresCancel: false,
      lastSyncAtMs: Date.now(),
    };
  }

  protected attachMarketToResult<T extends { raw?: unknown }>(result: T, market?: MarketSnapshot | null): T {
    if (!market) return result;

    return {
      ...result,
      raw: {
        result: result.raw ?? null,
        market,
      },
    };
  }
}
