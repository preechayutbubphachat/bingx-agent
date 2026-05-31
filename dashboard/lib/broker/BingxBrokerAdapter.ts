import { BaseBrokerAdapter } from "./BrokerAdapter";
import {
  mapBalanceFromBingx,
  mapCancelOrderRequestToBingx,
  mapCancelResultFromBingx,
  mapOpenOrderFromBingx,
  mapOrderResultFromBingx,
  mapPlaceOrderRequestToBingx,
  mapPositionFromBingx,
  normalizeBingxError,
} from "./bingxMapper";
import type {
  BingxBalancePayload,
  BingxCancelOrderRequest,
  BingxEnvironment,
  BingxNormalizedError,
  BingxOrderPayload,
  BingxPlaceOrderRequest,
  BingxPositionPayload,
  BingxProductType,
  BingxReadOnlyMethod,
  BingxTradingMethod,
  BingxTransportDependencyBoundary,
  BingxTransportProfile,
} from "./bingxTypes";
import type {
  AccountBalanceSnapshot,
  BrokerIdentity,
  CancelOrderRequest,
  CancelOrderResult,
  OpenOrderSnapshot,
  OrderRequest,
  OrderResult,
  PositionSnapshot,
  ReconcileIssue,
  ReconcileResult,
  SyncStateInput,
} from "./types";

type BingxExecutionMode = "LIVE_SHADOW" | "LIVE_LIMITED" | "LIVE_FULL";

export type BingxReadOnlyTransport = {
  getBalances(params?: { productType?: BingxProductType | null }): Promise<BingxBalancePayload[]>;
  getPositions(params: { symbol: string; productType?: BingxProductType | null }): Promise<BingxPositionPayload[]>;
  getOpenOrders(params: { symbol: string; productType?: BingxProductType | null }): Promise<BingxOrderPayload[]>;
};

export type BingxTradingTransport = {
  placeOrder(request: BingxPlaceOrderRequest): Promise<BingxOrderPayload>;
  cancelOrder(request: BingxCancelOrderRequest): Promise<BingxOrderPayload | null>;
};

export type BingxTransport =
  | (BingxReadOnlyTransport & Partial<BingxTradingTransport>)
  | {
      readOnly: BingxReadOnlyTransport;
      trading?: BingxTradingTransport | null;
    };

export type BingxBrokerAdapterOptions = {
  environment?: BingxEnvironment;
  productType?: BingxProductType;
  currency?: string;
  executionMode?: BingxExecutionMode;
  allowLiveExecution?: boolean;
  requireExplicitSymbolMatch?: boolean;
  recvWindowMs?: number;
  dryRun?: boolean;
  transport: BingxTransport;
};

type ResolvedTransport = {
  readOnly: BingxReadOnlyTransport;
  trading: Partial<BingxTradingTransport> | null;
};

type GuardedTradingDecision = {
  ok: boolean;
  code: string;
  message: string;
  noSend: boolean;
  dryRun: boolean;
};

type TradingModeGateSnapshot = {
  verdict?: string | null;
  allowExecution?: boolean | null;
  allowLiveExecution?: boolean | null;
  actionPermission?: string | null;
  blockingConditionIds?: string[] | null;
};

type BingxMethodClassification = {
  readOnly: BingxReadOnlyMethod[];
  trading: BingxTradingMethod[];
  gatedTrading: BingxTradingMethod[];
};

type TransportHealth = {
  ok: boolean;
  code: string | null;
  message: string | null;
};

type SyncReadFailure = ReturnType<typeof normalizeReadFailure>;

type ReadMethodUnavailableResult = SyncReadFailure & {
  method_classification: BingxMethodClassification;
  transport_profile: BingxTransportProfile;
};

type SyncPositionSnapshot = {
  position: PositionSnapshot;
  failure: SyncReadFailure | null;
};

type SyncOpenOrdersSnapshot = {
  openOrders: OpenOrderSnapshot[];
  failure: SyncReadFailure | null;
};

function nowMs() {
  return Date.now();
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function activeOrder(order: OpenOrderSnapshot) {
  return order.status === "NEW" || order.status === "PENDING" || order.status === "PARTIALLY_FILLED";
}

function approximatelyEqual(a: number | null | undefined, b: number | null | undefined, tolerance = 0.00000001) {
  const left = toFiniteNumber(a);
  const right = toFiniteNumber(b);
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return Math.abs(left - right) <= tolerance;
}

function pickPrimaryPosition(symbol: string, positions: PositionSnapshot[]) {
  const exact = positions.filter((position) => position.symbol === symbol);
  const candidates = exact.length > 0 ? exact : positions;
  const open = candidates.find((position) => position.side !== "FLAT" && position.size > 0);
  return open ?? candidates[0] ?? null;
}

function positionsMismatch(expected: PositionSnapshot | null | undefined, actual: PositionSnapshot) {
  if (!expected) return false;
  if (expected.side !== actual.side) return true;
  if (!approximatelyEqual(expected.size, actual.size)) return true;
  if (!approximatelyEqual(expected.entryPrice, actual.entryPrice)) return true;
  return false;
}

function orderCountMismatch(expected: OpenOrderSnapshot[] | null | undefined, actual: OpenOrderSnapshot[]) {
  if (!expected) return false;
  return expected.filter(activeOrder).length !== actual.filter(activeOrder).length;
}

function resolveTransport(input: BingxTransport): ResolvedTransport {
  if ("readOnly" in input) {
    return {
      readOnly: input.readOnly,
      trading: input.trading ?? null,
    };
  }

  return {
    readOnly: input,
    trading:
      typeof input.placeOrder === "function" || typeof input.cancelOrder === "function"
        ? {
            placeOrder: typeof input.placeOrder === "function" ? input.placeOrder : undefined,
            cancelOrder: typeof input.cancelOrder === "function" ? input.cancelOrder : undefined,
          }
        : null,
  };
}

function hasFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function buildTransportProfile(input: BingxTransport, resolved: ResolvedTransport): BingxTransportProfile {
  const wiring = "readOnly" in input ? "split" : "direct";
  const readOnly = {
    getBalances: hasFunction(resolved.readOnly.getBalances) ? "configured" : "missing",
    getPositions: hasFunction(resolved.readOnly.getPositions) ? "configured" : "missing",
    getOpenOrders: hasFunction(resolved.readOnly.getOpenOrders) ? "configured" : "missing",
  } as const;
  const trading = {
    placeOrder: hasFunction(resolved.trading?.placeOrder) ? "configured" : "missing",
    cancelOrder: hasFunction(resolved.trading?.cancelOrder) ? "configured" : "missing",
  } as const;

  return {
    wiring,
    read_only: readOnly,
    trading,
    all_read_only_configured: Object.values(readOnly).every((value) => value === "configured"),
    any_trading_configured: Object.values(trading).some((value) => value === "configured"),
    all_trading_configured: Object.values(trading).every((value) => value === "configured"),
  };
}

function normalizeReadFailure(method: BingxReadOnlyMethod, error: unknown) {
  const normalized = normalizeBingxError(error);
  return {
    method,
    phase: "read_only",
    normalized_error: normalized,
  };
}

function normalizeTradingFailure(
  method: BingxTradingMethod,
  error: unknown,
  extra?: Record<string, unknown>
) {
  const normalized = normalizeBingxError(error);
  return {
    method,
    phase: "trading",
    normalized_error: normalized,
    ...(extra ?? {}),
  };
}

function methodClassification(): BingxMethodClassification {
  return {
    readOnly: ["getBalances", "getPositions", "getOpenOrders"],
    trading: ["placeOrder", "cancelOrder"],
    gatedTrading: ["placeOrder", "cancelOrder"],
  };
}

function dependencyBoundary(transportProfile?: BingxTransportProfile | null): BingxTransportDependencyBoundary {
  return {
    read_only_methods: ["getBalances", "getPositions", "getOpenOrders"],
    trading_methods: ["placeOrder", "cancelOrder"],
    required_dependencies: ["transport", "clock", "config", "dry_run_flag", "live_execution_guard"],
    transport_profile: transportProfile ?? null,
  };
}

function readTradingModeGateSnapshot(metadata: unknown): TradingModeGateSnapshot | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).tradingModeGate;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const snapshot = raw as Record<string, unknown>;
  return {
    verdict: toText(snapshot.verdict),
    allowExecution: typeof snapshot.allowExecution === "boolean" ? snapshot.allowExecution : null,
    allowLiveExecution: typeof snapshot.allowLiveExecution === "boolean" ? snapshot.allowLiveExecution : null,
    actionPermission: toText(snapshot.actionPermission),
    blockingConditionIds: Array.isArray(snapshot.blockingConditionIds)
      ? snapshot.blockingConditionIds.map((item) => String(item ?? "").trim()).filter(Boolean)
      : null,
  };
}

export class BingxBrokerAdapter extends BaseBrokerAdapter {
  private readonly environment: BingxEnvironment;
  private readonly productType: BingxProductType;
  private readonly currency: string;
  private readonly executionMode: BingxExecutionMode;
  private readonly allowLiveExecution: boolean;
  private readonly requireExplicitSymbolMatch: boolean;
  private readonly recvWindowMs: number;
  private readonly dryRun: boolean;
  private readonly readOnlyTransport: BingxReadOnlyTransport;
  private readonly tradingTransport: Partial<BingxTradingTransport> | null;
  private readonly transportProfile: BingxTransportProfile;
  private readonly identity: BrokerIdentity;

  constructor(options: BingxBrokerAdapterOptions) {
    super();

    this.environment = options.environment ?? "production";
    this.productType = options.productType ?? "PERPETUAL";
    this.currency = options.currency ?? "USDT";
    this.executionMode = options.executionMode ?? "LIVE_SHADOW";
    this.allowLiveExecution = options.allowLiveExecution === true;
    this.requireExplicitSymbolMatch = options.requireExplicitSymbolMatch !== false;
    this.recvWindowMs = Math.max(1000, toFiniteNumber(options.recvWindowMs) ?? 5000);
    this.dryRun = options.dryRun === true;

    const transport = resolveTransport(options.transport);
    this.readOnlyTransport = transport.readOnly;
    this.tradingTransport = transport.trading;
    this.transportProfile = buildTransportProfile(options.transport, transport);

    this.identity = {
      brokerId: `bingx-${this.environment}`,
      brokerName: "BingX Broker Adapter",
      mode: this.executionMode,
      capabilities: {
        supportsPaper: false,
        supportsLive: true,
        supportsReduceOnly: true,
        supportsClientOrderId: true,
        supportsPartialFillModel: false,
      },
    };
  }

  getIdentity(): BrokerIdentity {
    return { ...this.identity };
  }

  getMethodClassification(): BingxMethodClassification {
    return methodClassification();
  }

  getDependencyBoundary(): BingxTransportDependencyBoundary {
    return dependencyBoundary(this.transportProfile);
  }

  getTransportProfile(): BingxTransportProfile {
    return { ...this.transportProfile };
  }

  async getBalance(): Promise<AccountBalanceSnapshot> {
    const readHealth = this.ensureReadOnlyMethod("getBalances");
    if (!readHealth.ok) {
      return {
        ...this.createUnavailableBalance(this.currency),
        raw: {
          ...this.readMethodUnavailable("getBalances", readHealth),
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    }

    try {
      const balances = await this.readOnlyTransport.getBalances({ productType: this.productType });
      const first =
        balances.find((entry) => (toText(entry.asset) ?? toText(entry.currency)) === this.currency) ?? balances[0];
      return first
        ? mapBalanceFromBingx({
            ...first,
            raw: {
              payload: first.raw ?? first,
              phase: "read_only",
              method: "getBalances",
              dependency_boundary: dependencyBoundary(this.transportProfile),
            },
          })
        : this.createUnavailableBalance(this.currency);
    } catch (error) {
      return {
        ...this.createUnavailableBalance(this.currency),
        raw: {
          ...normalizeReadFailure("getBalances", error),
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    }
  }

  async getPosition(symbol: string): Promise<PositionSnapshot> {
    const readHealth = this.ensureReadOnlyMethod("getPositions");
    if (!readHealth.ok) {
      return {
        ...this.createEmptyPosition(symbol),
        raw: {
          ...this.readMethodUnavailable("getPositions", readHealth),
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    }

    try {
      const payloads = await this.readOnlyTransport.getPositions({ symbol, productType: this.productType });
      const positions = payloads.map((payload) =>
        mapPositionFromBingx({
          ...payload,
          raw: {
            payload: payload.raw ?? payload,
            phase: "read_only",
            method: "getPositions",
            dependency_boundary: dependencyBoundary(this.transportProfile),
          },
        })
      );
      const position = pickPrimaryPosition(symbol, positions);
      if (!position) return this.createEmptyPosition(symbol);
      if (this.requireExplicitSymbolMatch && position.symbol !== symbol) return this.createEmptyPosition(symbol);
      return position;
    } catch (error) {
      return {
        ...this.createEmptyPosition(symbol),
        raw: {
          ...normalizeReadFailure("getPositions", error),
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    }
  }

  async getOpenOrders(symbol: string): Promise<OpenOrderSnapshot[]> {
    const readHealth = this.ensureReadOnlyMethod("getOpenOrders");
    if (!readHealth.ok) {
      return this.createEmptyOpenOrders();
    }

    try {
      const payloads = await this.readOnlyTransport.getOpenOrders({ symbol, productType: this.productType });
      const orders = payloads.map((payload) =>
        mapOpenOrderFromBingx({
          ...payload,
          raw: {
            payload: payload.raw ?? payload,
            phase: "read_only",
            method: "getOpenOrders",
            dependency_boundary: dependencyBoundary(this.transportProfile),
          },
        })
      );
      if (!this.requireExplicitSymbolMatch) return orders;
      return orders.filter((order) => order.symbol === symbol);
    } catch {
      return this.createEmptyOpenOrders();
    }
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const guard = this.guardTradingAction("placeOrder", request.metadata ?? null);
    if (!guard.ok) {
      return this.buildNoSendOrderResult(request, guard);
    }

    try {
      const placeOrderFn = this.tradingTransport?.placeOrder;
      if (typeof placeOrderFn !== "function") {
        return this.buildNoSendOrderResult(request, {
          ok: false,
          code: "trading_transport_unavailable",
          message: "placeOrder transport is not configured",
          noSend: true,
          dryRun: false,
        });
      }
      const bingxRequest = mapPlaceOrderRequestToBingx(request, {
        positionSide: request.reduceOnly || request.closePosition ? null : mapRequestPositionSide(request),
        recvWindow: this.recvWindowMs,
        timestamp: nowMs(),
      });
      const payload = await placeOrderFn(bingxRequest);
      const result = mapOrderResultFromBingx(payload, this.executionMode);
      return {
        ...result,
        raw: {
          payload: payload.raw ?? payload,
          phase: "trading",
          method: "placeOrder",
          dry_run: false,
          no_send: false,
          transport_profile: this.transportProfile,
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    } catch (error) {
      const normalized = normalizeTradingFailure("placeOrder", error, {
        dry_run: false,
        no_send: false,
        request_symbol: request.symbol,
        transport_profile: this.transportProfile,
        dependency_boundary: dependencyBoundary(this.transportProfile),
      });
      return {
        ok: false,
        mode: this.executionMode,
        actionPermission: "ALLOW",
        symbol: request.symbol,
        clientOrderId: request.clientOrderId ?? request.intentKey ?? null,
        status: "REJECTED",
        rejectedReason: (normalized.normalized_error as BingxNormalizedError).message,
        idempotencyKey: request.intentKey ?? request.clientOrderId ?? null,
        raw: normalized,
      };
    }
  }

  async cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResult> {
    const guard = this.guardTradingAction(
      "cancelOrder",
      (request as { metadata?: Record<string, unknown> | null })?.metadata ?? null
    );
    if (!guard.ok) {
      return this.buildNoSendCancelResult(request, guard);
    }

    try {
      const cancelOrderFn = this.tradingTransport?.cancelOrder;
      if (typeof cancelOrderFn !== "function") {
        return this.buildNoSendCancelResult(request, {
          ok: false,
          code: "trading_transport_unavailable",
          message: "cancelOrder transport is not configured",
          noSend: true,
          dryRun: false,
        });
      }
      const bingxRequest = mapCancelOrderRequestToBingx(request, {
        recvWindow: this.recvWindowMs,
        timestamp: nowMs(),
      });
      const payload = await cancelOrderFn(bingxRequest);
      const result = mapCancelResultFromBingx(payload, request);
      return {
        ...result,
        raw: {
          payload: payload?.raw ?? payload ?? null,
          phase: "trading",
          method: "cancelOrder",
          dry_run: false,
          no_send: false,
          transport_profile: this.transportProfile,
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    } catch (error) {
      const normalized = normalizeTradingFailure("cancelOrder", error, {
        dry_run: false,
        no_send: false,
        request_symbol: request.symbol,
        transport_profile: this.transportProfile,
        dependency_boundary: dependencyBoundary(this.transportProfile),
      });
      return {
        ok: false,
        symbol: request.symbol,
        orderId: request.orderId ?? null,
        clientOrderId: request.clientOrderId ?? null,
        status: "REJECTED",
        reason: (normalized.normalized_error as BingxNormalizedError).message,
        raw: normalized,
      };
    }
  }

  async syncState(input: SyncStateInput): Promise<ReconcileResult> {
    const issues: ReconcileIssue[] = [];

    try {
      const [positionSnapshot, openOrdersSnapshot] = await Promise.all([
        this.readPositionForSync(input.symbol),
        this.readOpenOrdersForSync(input.symbol),
      ]);
      const readFailures = [positionSnapshot.failure, openOrdersSnapshot.failure].filter(
        (failure): failure is SyncReadFailure => Boolean(failure)
      );
      if (readFailures.length > 0) {
        const firstFailure = readFailures[0];
        return this.attachMarketToResult(
          {
            ok: false,
            symbol: input.symbol,
            brokerMode: this.executionMode,
            issues: [
              {
                code: "BROKER_UNAVAILABLE" as const,
                severity: "block" as const,
                message: "broker reconcile snapshot is incomplete because one or more BingX read-only methods failed",
                metadata: {
                  read_failure_methods: readFailures.map((failure) => failure.method),
                  read_failures: readFailures,
                  partial_read_failure: readFailures.length < 2,
                },
              },
            ],
            requiresFreeze: true,
            requiresReduce: false,
            requiresForceExit: false,
            requiresCancel: false,
            lastSyncAtMs: nowMs(),
            raw: {
              phase: "read_only",
              method: "syncState",
              eventKey: input.eventKey ?? null,
              normalized_error: firstFailure.normalized_error,
              read_failures: readFailures,
              partial_read_failure: readFailures.length < 2,
              position_snapshot_available: positionSnapshot.failure === null,
              open_orders_snapshot_available: openOrdersSnapshot.failure === null,
              actualPosition: positionSnapshot.failure === null ? positionSnapshot.position : null,
              actualOpenOrderCount: openOrdersSnapshot.failure === null ? openOrdersSnapshot.openOrders.length : null,
              transport_profile: this.transportProfile,
              dependency_boundary: dependencyBoundary(this.transportProfile),
            },
          },
          input.market
        );
      }
      const actualPosition = positionSnapshot.position;
      const actualOrders = openOrdersSnapshot.openOrders;

      if (positionsMismatch(input.expectedPosition, actualPosition)) {
        issues.push({
          code: "POSITION_MISMATCH",
          severity: "block",
          message: "expected position does not match BingX broker state",
          metadata: {
            expected: input.expectedPosition ?? null,
            actual: actualPosition,
          },
        });
      }

      if (orderCountMismatch(input.expectedOrders, actualOrders)) {
        issues.push({
          code: "OPEN_ORDER_MISMATCH",
          severity: "warn",
          message: "expected open-order count does not match BingX broker state",
          metadata: {
            expected_active_orders: input.expectedOrders?.filter(activeOrder).length ?? 0,
            actual_active_orders: actualOrders.filter(activeOrder).length,
          },
        });
      }

      if (
        actualPosition.side !== "FLAT" &&
        actualPosition.size > 0 &&
        !actualOrders.some((order) => activeOrder(order) && order.reduceOnly === true)
      ) {
        issues.push({
          code: "MISSING_PROTECTION",
          severity: "block",
          message: "live position is open without a reduce-only protection order on broker state",
        });
      }

      const intentKeys = (input.intents ?? [])
        .map((intent) => toText(intent.intentKey))
        .filter((value): value is string => Boolean(value));
      const duplicateIntentKeys = intentKeys.filter((key, index) => intentKeys.indexOf(key) !== index);
      if (duplicateIntentKeys.length > 0) {
        issues.push({
          code: "DUPLICATE_INTENT_RISK",
          severity: "block",
          message: "duplicate intent keys detected before live reconciliation",
          metadata: { duplicate_intent_keys: duplicateIntentKeys },
        });
      }

      return {
        ok: issues.every((issue) => issue.severity === "info" || issue.severity === "warn"),
        symbol: input.symbol,
        brokerMode: this.executionMode,
        issues,
        requiresFreeze: issues.some((issue) => issue.severity === "block" || issue.severity === "hard_stop"),
        requiresReduce: issues.some((issue) => issue.code === "MISSING_PROTECTION"),
        requiresForceExit: false,
        requiresCancel: issues.some((issue) => issue.code === "DUPLICATE_INTENT_RISK"),
        lastSyncAtMs: nowMs(),
        raw: this.attachMarketToResult(
          {
            raw: {
              phase: "read_only",
              method: "syncState",
              eventKey: input.eventKey ?? null,
              actualPosition,
              actualOrders,
              method_classification: methodClassification(),
              transport_profile: this.transportProfile,
              dependency_boundary: dependencyBoundary(this.transportProfile),
            },
          },
          input.market
        ).raw,
      };
    } catch (error) {
      const normalized = normalizeBingxError(error);
      return {
        ok: false,
        symbol: input.symbol,
        brokerMode: this.executionMode,
        issues: [
          {
            code: "BROKER_UNAVAILABLE",
            severity: "block",
            message: normalized.message,
            metadata: {
              normalized_error: normalized,
            },
          },
        ],
        requiresFreeze: true,
        requiresReduce: false,
        requiresForceExit: false,
        requiresCancel: false,
        lastSyncAtMs: nowMs(),
        raw: {
          phase: "read_only",
          method: "syncState",
          normalized_error: normalized,
          eventKey: input.eventKey ?? null,
          transport_profile: this.transportProfile,
          dependency_boundary: dependencyBoundary(this.transportProfile),
        },
      };
    }
  }

  private ensureReadOnlyMethod(method: BingxReadOnlyMethod): TransportHealth {
    if (hasFunction(this.readOnlyTransport[method])) {
      return {
        ok: true,
        code: null,
        message: null,
      };
    }

    return {
      ok: false,
      code: "read_only_transport_unavailable",
      message: `${method} transport is not configured`,
    };
  }

  private readMethodUnavailable(method: BingxReadOnlyMethod, health: TransportHealth): ReadMethodUnavailableResult {
    return {
      method,
      phase: "read_only",
      normalized_error: {
        category: "CONFIG" as const,
        code: health.code ?? "read_only_transport_unavailable",
        message: health.message ?? `${method} transport is not configured`,
        retriable: false,
        raw: {
          method,
          transport_profile: this.transportProfile,
        },
      },
      method_classification: methodClassification(),
      transport_profile: this.transportProfile,
    };
  }

  private guardTradingAction(
    method: BingxTradingMethod,
    metadata?: Record<string, unknown> | null
  ): GuardedTradingDecision {
    if (this.executionMode === "LIVE_SHADOW") {
      return {
        ok: false,
        code: "live_shadow_no_send",
        message: "LIVE_SHADOW mode blocks real trading requests",
        noSend: true,
        dryRun: true,
      };
    }

    if (this.dryRun) {
      return {
        ok: false,
        code: "dry_run_enabled",
        message: "BingX adapter dry-run mode blocked trading request",
        noSend: true,
        dryRun: true,
      };
    }

    if (!this.allowLiveExecution) {
      return {
        ok: false,
        code: "live_execution_guard_disabled",
        message: "explicit live execution guard is disabled",
        noSend: true,
        dryRun: false,
      };
    }

    if (!this.tradingTransport || typeof this.tradingTransport[method] !== "function") {
      return {
        ok: false,
        code: "trading_transport_unavailable",
        message: "trading transport is not configured",
        noSend: true,
        dryRun: false,
      };
    }

    if (this.executionMode === "LIVE_LIMITED" || this.executionMode === "LIVE_FULL") {
      const gateSnapshot = readTradingModeGateSnapshot(metadata);
      if (!gateSnapshot) {
        return {
          ok: false,
          code: "gate_verdict_missing",
          message: "live trading request is missing mandatory trading mode gate verdict metadata",
          noSend: true,
          dryRun: false,
        };
      }

      if (
        gateSnapshot.verdict === "DENY" ||
        gateSnapshot.allowExecution !== true ||
        gateSnapshot.allowLiveExecution !== true ||
        gateSnapshot.actionPermission === "DENY"
      ) {
        const blockingCode =
          gateSnapshot.blockingConditionIds && gateSnapshot.blockingConditionIds.length > 0
            ? gateSnapshot.blockingConditionIds[0]
            : "gate_verdict_denied";
        return {
          ok: false,
          code: blockingCode,
          message: "trading mode gate denied this live trading request",
          noSend: true,
          dryRun: false,
        };
      }
    }

    return {
      ok: true,
      code: "trading_allowed",
      message: `${method} allowed`,
      noSend: false,
      dryRun: false,
    };
  }

  private buildNoSendOrderResult(request: OrderRequest, guard: GuardedTradingDecision): OrderResult {
    return {
      ok: false,
      mode: this.executionMode,
      actionPermission: "DENY",
      symbol: request.symbol,
      clientOrderId: request.clientOrderId ?? request.intentKey ?? null,
      status: "REJECTED",
      rejectedReason: guard.message,
      idempotencyKey: request.intentKey ?? request.clientOrderId ?? null,
      raw: {
        phase: "trading",
        method: "placeOrder",
        no_send: guard.noSend,
        dry_run: guard.dryRun,
        guard_code: guard.code,
        method_classification: methodClassification(),
        transport_profile: this.transportProfile,
        dependency_boundary: dependencyBoundary(this.transportProfile),
        execution_mode: this.executionMode,
      },
    };
  }

  private buildNoSendCancelResult(request: CancelOrderRequest, guard: GuardedTradingDecision): CancelOrderResult {
    return {
      ok: false,
      symbol: request.symbol,
      orderId: request.orderId ?? null,
      clientOrderId: request.clientOrderId ?? null,
      status: "REJECTED",
      reason: guard.message,
      raw: {
        phase: "trading",
        method: "cancelOrder",
        no_send: guard.noSend,
        dry_run: guard.dryRun,
        guard_code: guard.code,
        method_classification: methodClassification(),
        transport_profile: this.transportProfile,
        dependency_boundary: dependencyBoundary(this.transportProfile),
        execution_mode: this.executionMode,
      },
    };
  }

  private async readPositionForSync(symbol: string): Promise<SyncPositionSnapshot> {
    const readHealth = this.ensureReadOnlyMethod("getPositions");
    if (!readHealth.ok) {
      return {
        position: this.createEmptyPosition(symbol),
        failure: this.readMethodUnavailable("getPositions", readHealth),
      };
    }

    try {
      const payloads = await this.readOnlyTransport.getPositions({ symbol, productType: this.productType });
      const positions = payloads.map((payload) =>
        mapPositionFromBingx({
          ...payload,
          raw: {
            payload: payload.raw ?? payload,
            phase: "read_only",
            method: "getPositions",
            dependency_boundary: dependencyBoundary(this.transportProfile),
          },
        })
      );
      const position = pickPrimaryPosition(symbol, positions);
      if (!position) {
        return {
          position: this.createEmptyPosition(symbol),
          failure: null,
        };
      }
      if (this.requireExplicitSymbolMatch && position.symbol !== symbol) {
        return {
          position: this.createEmptyPosition(symbol),
          failure: null,
        };
      }
      return {
        position,
        failure: null,
      };
    } catch (error) {
      return {
        position: this.createEmptyPosition(symbol),
        failure: normalizeReadFailure("getPositions", error),
      };
    }
  }

  private async readOpenOrdersForSync(symbol: string): Promise<SyncOpenOrdersSnapshot> {
    const readHealth = this.ensureReadOnlyMethod("getOpenOrders");
    if (!readHealth.ok) {
      return {
        openOrders: this.createEmptyOpenOrders(),
        failure: this.readMethodUnavailable("getOpenOrders", readHealth),
      };
    }

    try {
      const payloads = await this.readOnlyTransport.getOpenOrders({ symbol, productType: this.productType });
      const orders = payloads.map((payload) =>
        mapOpenOrderFromBingx({
          ...payload,
          raw: {
            payload: payload.raw ?? payload,
            phase: "read_only",
            method: "getOpenOrders",
            dependency_boundary: dependencyBoundary(this.transportProfile),
          },
        })
      );
      return {
        openOrders: this.requireExplicitSymbolMatch ? orders.filter((order) => order.symbol === symbol) : orders,
        failure: null,
      };
    } catch (error) {
      return {
        openOrders: this.createEmptyOpenOrders(),
        failure: normalizeReadFailure("getOpenOrders", error),
      };
    }
  }
}

function mapRequestPositionSide(request: OrderRequest) {
  if (request.reduceOnly || request.closePosition) return null;
  return request.side === "BUY" ? "LONG" : "SHORT";
}
