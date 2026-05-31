import type { BrokerAdapter } from "../broker/BrokerAdapter";
import type {
  BrokerSide,
  MarketSnapshot,
  OpenOrderSnapshot,
  OrderIntent,
  OrderRequest,
  OrderResult,
  PositionSnapshot,
} from "../broker/types";
import type { PlanMachineState } from "../planStateMachine";
import type { RiskOverlay } from "../riskTypes";
import {
  applyOrderResultsToExecutionState,
  applyReconcileResult,
  compactPendingIntents,
  hasProcessedExecutionKey,
  markExecutionEvent,
  normalizeExecutionState,
  replaceActiveOrders,
  type ExecutionState,
  updateExecutionAudit,
  updateExecutionSafety,
  upsertBrokerPosition,
  upsertPendingIntent,
  validateExecutionState,
} from "./executionState";
import {
  auditPayloadFromBrokerResults,
  auditPayloadFromDecision,
  auditPayloadFromGate,
  auditPayloadFromReconcile,
  auditPayloadFromRisk,
  classifyIntentEvent,
  createAuditEvent,
  ensureExecutionAuditLogger,
  hasOpenPositionLike,
  type ExecutionAuditLogger,
} from "./executionAuditLog";
import {
  evaluateTradingModeGate,
  type TradingModeAction,
  type TradingModeGateInput,
  type TradingModeGateResult,
} from "./tradingModeGate";

export type PaperExecutionAction = "IGNORE" | "OPEN" | "PROTECT" | "REDUCE" | "CLOSE";

export type PaperExecutionEntry = {
  side: BrokerSide;
  quantity: number;
  entryPrice?: number | null;
  stopPrice?: number | null;
  takeProfitPrice?: number | null;
  reason?: string | null;
};

export type PaperExecutionIdempotency = {
  eventKey?: string | null;
  candleKey?: string | null;
  processedKeys?: string[];
};

export type PaperExecutionContext = {
  symbol: string;
  machineState: PlanMachineState;
  riskOverlay: RiskOverlay;
  market: MarketSnapshot;
  plannedEntry?: PaperExecutionEntry | null;
  reduceQuantity?: number | null;
  closeReason?: string | null;
  idempotency?: PaperExecutionIdempotency | null;
  executionState?: ExecutionState | null;
  gateInput?: Partial<Omit<TradingModeGateInput, "mode" | "action" | "symbol" | "riskOverlay" | "exposure">> | null;
  auditLogger?: ExecutionAuditLogger | null;
  auditRootDir?: string | null;
  auditFileName?: string | null;
};

export type PaperExecutionDecision = {
  action: PaperExecutionAction;
  allowed: boolean;
  blockedByIdempotency: boolean;
  eventKey: string | null;
  reasons: string[];
  intents: OrderIntent[];
};

export type PaperExecutionRunResult = {
  auditPath: string;
  gate: TradingModeGateResult;
  decision: PaperExecutionDecision;
  position: PositionSnapshot;
  openOrders: OpenOrderSnapshot[];
  results: OrderResult[];
  sync?: Awaited<ReturnType<BrokerAdapter["syncState"]>>;
  executionState: ExecutionState;
  executionStateValidation: ReturnType<typeof validateExecutionState>;
};

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeQuantity(v: unknown): number | null {
  const n = toFiniteNumber(v);
  return n !== null && n > 0 ? n : null;
}

function normalizeText(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function hasOpenExposure(position: PositionSnapshot, openOrders: OpenOrderSnapshot[]) {
  if (position.side !== "FLAT" && position.size > 0) return true;
  return openOrders.some((order) =>
    order.status === "NEW" || order.status === "PENDING" || order.status === "PARTIALLY_FILLED"
  );
}

function hasProtectionOrders(openOrders: OpenOrderSnapshot[]) {
  return openOrders.some(
    (order) =>
      order.reduceOnly === true ||
      order.type === "STOP_MARKET" ||
      order.type === "STOP_LIMIT" ||
      order.type === "TAKE_PROFIT_MARKET" ||
      order.type === "TAKE_PROFIT_LIMIT"
  );
}

function buildEventKey(ctx: PaperExecutionContext) {
  const raw =
    normalizeText(ctx.idempotency?.eventKey) ??
    normalizeText(ctx.idempotency?.candleKey) ??
    `${ctx.symbol}:${ctx.machineState}:${ctx.market.closeTs5m ?? ctx.market.price.updatedAtMs ?? "na"}`;

  return raw;
}

function alreadyProcessed(ctx: PaperExecutionContext, key: string | null) {
  const eventKey = key;
  const candleKey = normalizeText(ctx.idempotency?.candleKey) || null;
  if (
    ctx.executionState &&
    hasProcessedExecutionKey(ctx.executionState, { eventKey, candleKey })
  ) {
    return true;
  }
  if (!key) return false;
  return Array.isArray(ctx.idempotency?.processedKeys) && ctx.idempotency!.processedKeys!.includes(key);
}

function intentKey(key: string | null, suffix: string) {
  return key ? `${key}:${suffix}` : null;
}

function entryToOpenIntent(ctx: PaperExecutionContext, key: string, entry: PaperExecutionEntry): OrderIntent {
  return {
    kind: "OPEN_POSITION",
    symbol: ctx.symbol,
    side: entry.side,
    quantity: entry.quantity,
    price: entry.entryPrice ?? null,
    orderType: entry.entryPrice ? "LIMIT" : "MARKET",
    eventKey: ctx.idempotency?.eventKey ?? null,
    candleKey: ctx.idempotency?.candleKey ?? null,
    intentKey: intentKey(key, "open"),
    reason: entry.reason ?? "paper open from state/risk approval",
    metadata: {
      machineState: ctx.machineState,
      riskStatus: ctx.riskOverlay.status,
    },
  };
}

function entryToProtectionIntents(ctx: PaperExecutionContext, key: string, entry: PaperExecutionEntry): OrderIntent[] {
  const intents: OrderIntent[] = [];

  if (entry.stopPrice != null) {
    intents.push({
      kind: "ADD_PROTECTION",
      symbol: ctx.symbol,
      side: entry.side === "BUY" ? "SELL" : "BUY",
      quantity: entry.quantity,
      stopPrice: entry.stopPrice,
      orderType: "STOP_MARKET",
      reduceOnly: true,
      eventKey: ctx.idempotency?.eventKey ?? null,
      candleKey: ctx.idempotency?.candleKey ?? null,
      intentKey: intentKey(key, "stop"),
      parentIntentKey: intentKey(key, "open"),
      reason: "paper protective stop",
    });
  }

  if (entry.takeProfitPrice != null) {
    intents.push({
      kind: "TAKE_PROFIT",
      symbol: ctx.symbol,
      side: entry.side === "BUY" ? "SELL" : "BUY",
      quantity: entry.quantity,
      stopPrice: entry.takeProfitPrice,
      orderType: "TAKE_PROFIT_MARKET",
      reduceOnly: true,
      eventKey: ctx.idempotency?.eventKey ?? null,
      candleKey: ctx.idempotency?.candleKey ?? null,
      intentKey: intentKey(key, "tp"),
      parentIntentKey: intentKey(key, "open"),
      reason: "paper take profit",
    });
  }

  return intents;
}

function intentToOrderRequest(intent: OrderIntent): OrderRequest | null {
  const quantity = normalizeQuantity(intent.quantity);
  if (!intent.side || !intent.orderType || quantity === null) return null;

  return {
    symbol: intent.symbol,
    side: intent.side,
    type: intent.orderType,
    quantity,
    price: intent.price ?? null,
    stopPrice: intent.stopPrice ?? intent.takeProfitPrice ?? null,
    reduceOnly: intent.reduceOnly ?? false,
    closePosition: intent.closePosition ?? false,
    clientOrderId: intent.intentKey ?? null,
    intentKey: intent.intentKey ?? null,
    metadata: intent.metadata ?? null,
  };
}

function gateActionForDecision(
  machineState: PlanMachineState,
  decision: PaperExecutionDecision
): TradingModeAction {
  if (decision.action === "OPEN") return "OPEN";
  if (decision.action === "PROTECT") return "PROTECT";
  if (decision.action === "REDUCE") return "REDUCE";
  if (decision.action === "CLOSE") return "CLOSE";
  if (machineState === "READY") return "OPEN";
  if (machineState === "IN_POSITION") return "PROTECT";
  if (machineState === "REDUCE") return "REDUCE";
  if (machineState === "EXIT") return "CLOSE";
  return "SYNC";
}

function buildGateExposure(
  position: PositionSnapshot,
  openOrders: OpenOrderSnapshot[],
  ctx: PaperExecutionContext
) {
  const activePositions = position.side === "FLAT" || position.size <= 0 ? 0 : 1;
  const pendingEntryIntents = openOrders.filter(
    (order) =>
      (order.status === "NEW" || order.status === "PENDING" || order.status === "PARTIALLY_FILLED") &&
      order.reduceOnly !== true
  ).length;
  const currentNotional =
    (toFiniteNumber(position.entryPrice) ?? toFiniteNumber(ctx.market.price.last) ?? 0) * Math.max(position.size, 0);
  const requestNotional =
    (toFiniteNumber(ctx.plannedEntry?.entryPrice) ?? toFiniteNumber(ctx.market.price.last) ?? 0) *
    Math.max(toFiniteNumber(ctx.plannedEntry?.quantity) ?? 0, 0);

  return {
    activePositions,
    pendingEntryIntents,
    currentNotional,
    requestNotional,
    sameSymbolOpen: position.side !== "FLAT" && position.size > 0,
  };
}

function attachGateMetadata(request: OrderRequest, gate: TradingModeGateResult): OrderRequest {
  return {
    ...request,
    metadata: {
      ...(request.metadata ?? {}),
      tradingModeGate: {
        mode: gate.mode,
        action: gate.action,
        verdict: gate.verdict,
        allowExecution: gate.allowExecution,
        allowLiveExecution: gate.allowLiveExecution,
        actionPermission: gate.actionPermission,
        blockingConditionIds: gate.blockingConditionIds,
        reasons: gate.reasons,
      },
    },
  };
}

export function decidePaperExecution(
  ctx: PaperExecutionContext,
  position: PositionSnapshot,
  openOrders: OpenOrderSnapshot[]
): PaperExecutionDecision {
  const reasons: string[] = [];
  const eventKey = buildEventKey(ctx);
  const blockedByIdempotency = alreadyProcessed(ctx, eventKey);

  if (blockedByIdempotency) {
    return {
      action: "IGNORE",
      allowed: false,
      blockedByIdempotency: true,
      eventKey,
      reasons: ["event/candle key already processed"],
      intents: [],
    };
  }

  if (ctx.riskOverlay.shouldFreezeTrading || ctx.riskOverlay.status === "HARD_STOP") {
    return {
      action: "IGNORE",
      allowed: false,
      blockedByIdempotency: false,
      eventKey,
      reasons: ["risk overlay froze execution"],
      intents: [],
    };
  }

  if (ctx.riskOverlay.shouldForceExit) {
    if (position.side === "FLAT" || position.size <= 0) {
      return {
        action: "IGNORE",
        allowed: false,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["force-exit requested but broker is already flat"],
        intents: [],
      };
    }

    const side: BrokerSide = position.side === "LONG" ? "SELL" : "BUY";
    return {
      action: "CLOSE",
      allowed: true,
      blockedByIdempotency: false,
      eventKey,
      reasons: [normalizeText(ctx.closeReason) ?? "risk requested full close"],
      intents: [
        {
          kind: "CLOSE_POSITION",
          symbol: ctx.symbol,
          side,
          quantity: position.size,
          orderType: "MARKET",
          reduceOnly: true,
          closePosition: true,
          eventKey: ctx.idempotency?.eventKey ?? null,
          candleKey: ctx.idempotency?.candleKey ?? null,
          intentKey: intentKey(eventKey, "close"),
          reason: normalizeText(ctx.closeReason) ?? "paper close by execution engine",
        },
      ],
    };
  }

  if (ctx.riskOverlay.shouldReduceRisk) {
    if (position.side === "FLAT" || position.size <= 0) {
      return {
        action: "IGNORE",
        allowed: false,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["reduce requested but broker is flat"],
        intents: [],
      };
    }

    const reduceQty = normalizeQuantity(ctx.reduceQuantity) ?? Math.max(position.size / 2, 0.00000001);
    const side: BrokerSide = position.side === "LONG" ? "SELL" : "BUY";
    return {
      action: "REDUCE",
      allowed: true,
      blockedByIdempotency: false,
      eventKey,
      reasons: ["risk requested exposure reduction"],
      intents: [
        {
          kind: "REDUCE_POSITION",
          symbol: ctx.symbol,
          side,
          quantity: Math.min(reduceQty, position.size),
          orderType: "MARKET",
          reduceOnly: true,
          eventKey: ctx.idempotency?.eventKey ?? null,
          candleKey: ctx.idempotency?.candleKey ?? null,
          intentKey: intentKey(eventKey, "reduce"),
          reason: "paper reduce by execution engine",
        },
      ],
    };
  }

  if (ctx.machineState === "EXIT") {
    if (position.side === "FLAT" || position.size <= 0) {
      return {
        action: "IGNORE",
        allowed: false,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["machine requested exit but broker is flat"],
        intents: [],
      };
    }

    const side: BrokerSide = position.side === "LONG" ? "SELL" : "BUY";
    return {
      action: "CLOSE",
      allowed: true,
      blockedByIdempotency: false,
      eventKey,
      reasons: ["machine state requested exit"],
      intents: [
        {
          kind: "CLOSE_POSITION",
          symbol: ctx.symbol,
          side,
          quantity: position.size,
          orderType: "MARKET",
          reduceOnly: true,
          closePosition: true,
          eventKey: ctx.idempotency?.eventKey ?? null,
          candleKey: ctx.idempotency?.candleKey ?? null,
          intentKey: intentKey(eventKey, "machine-exit"),
          reason: "paper close from machine EXIT",
        },
      ],
    };
  }

  if (ctx.machineState === "IN_POSITION" || position.side !== "FLAT") {
    if (!hasProtectionOrders(openOrders) && ctx.plannedEntry) {
      return {
        action: "PROTECT",
        allowed: true,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["open position is missing protection orders"],
        intents: entryToProtectionIntents(ctx, eventKey ?? `${ctx.symbol}:protect`, ctx.plannedEntry),
      };
    }

    return {
      action: "IGNORE",
      allowed: false,
      blockedByIdempotency: false,
      eventKey,
      reasons: ["position already open or protected; no new action required"],
      intents: [],
    };
  }

  if (ctx.machineState === "READY") {
    if (!ctx.riskOverlay.canOpenNewTrade) {
      return {
        action: "IGNORE",
        allowed: false,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["machine is READY but risk did not approve new trade"],
        intents: [],
      };
    }

    if (!ctx.plannedEntry) {
      return {
        action: "IGNORE",
        allowed: false,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["no planned entry payload available"],
        intents: [],
      };
    }

    if (hasOpenExposure(position, openOrders)) {
      return {
        action: "IGNORE",
        allowed: false,
        blockedByIdempotency: false,
        eventKey,
        reasons: ["double-open prevented because broker already has exposure or pending order"],
        intents: [],
      };
    }

    const openIntent = entryToOpenIntent(ctx, eventKey ?? `${ctx.symbol}:open`, ctx.plannedEntry);
    const protectionIntents = entryToProtectionIntents(ctx, eventKey ?? `${ctx.symbol}:open`, ctx.plannedEntry);

    reasons.push("state machine READY and risk approval granted");
    if (protectionIntents.length > 0) reasons.push("protective orders prepared alongside entry");

    return {
      action: "OPEN",
      allowed: true,
      blockedByIdempotency: false,
      eventKey,
      reasons,
      intents: [openIntent, ...protectionIntents],
    };
  }

  return {
    action: "IGNORE",
    allowed: false,
    blockedByIdempotency: false,
    eventKey,
    reasons: ["no execution action for current machine state"],
    intents: [],
  };
}

export async function runPaperExecution(
  broker: BrokerAdapter,
  ctx: PaperExecutionContext
): Promise<PaperExecutionRunResult> {
  const auditLogger = ensureExecutionAuditLogger(ctx.auditLogger, {
    rootDir: ctx.auditRootDir ?? null,
    fileName: ctx.auditFileName ?? null,
  });
  const position = await broker.getPosition(ctx.symbol);
  const openOrders = await broker.getOpenOrders(ctx.symbol);
  const decision = decidePaperExecution(ctx, position, openOrders);
  const mode = broker.getIdentity().mode;
  const gate = evaluateTradingModeGate({
    mode,
    action: gateActionForDecision(ctx.machineState, decision),
    symbol: ctx.symbol,
    riskOverlay: ctx.riskOverlay,
    exposure: buildGateExposure(position, openOrders, ctx),
    ...(ctx.gateInput ?? {}),
  });
  const gateBlocked =
    decision.intents.length > 0 &&
    (!gate.allowExecution || gate.actionPermission === "DENY" || gate.verdict === "DENY");
  let executionState = normalizeExecutionState(ctx.executionState, {
    symbol: ctx.symbol,
    broker_mode: mode,
  });
  executionState = updateExecutionAudit(executionState, {
    source: "paperExecutionEngine",
    last_seen_broker_mode: mode,
    last_seen_machine_state: ctx.machineState,
    last_seen_risk_status: ctx.riskOverlay.status,
  });
  executionState = updateExecutionSafety(executionState, {
    risk_status: ctx.riskOverlay.status,
    fail_safe_mode: ctx.riskOverlay.status === "HARD_STOP" ? "HARD_STOP" : "NORMAL",
    execution_frozen: ctx.riskOverlay.shouldFreezeTrading || ctx.riskOverlay.status === "HARD_STOP",
    force_exit_required: ctx.riskOverlay.shouldForceExit,
    reduce_required: ctx.riskOverlay.shouldReduceRisk,
    marker_consistent: ctx.riskOverlay.truthStatus !== "BROKEN",
    canonical_consistent: ctx.riskOverlay.truthStatus !== "BROKEN",
    persist_healthy: true,
  });
  const auditEvents = [
    createAuditEvent("PLAN_EVALUATED", {
      symbol: ctx.symbol,
      mode,
      eventKey: ctx.idempotency?.eventKey ?? decision.eventKey ?? null,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: {
        machineState: ctx.machineState,
        marketCloseTs5m: ctx.market.closeTs5m ?? null,
        marketUpdatedAtMs: ctx.market.price.updatedAtMs ?? null,
      },
    }),
    createAuditEvent("RISK_EVALUATED", {
      symbol: ctx.symbol,
      mode,
      eventKey: ctx.idempotency?.eventKey ?? decision.eventKey ?? null,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: auditPayloadFromRisk(ctx.riskOverlay),
    }),
  ];

  if (ctx.riskOverlay.shouldFreezeTrading || ctx.riskOverlay.status === "HARD_STOP") {
    auditEvents.push(
      createAuditEvent("FAIL_SAFE_TRIGGERED", {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: {
          risk: auditPayloadFromRisk(ctx.riskOverlay),
          reasons: decision.reasons,
        },
      })
    );
  }

  if (!decision.allowed || decision.intents.length === 0 || gateBlocked) {
    const sync = await broker.syncState({
      symbol: ctx.symbol,
      market: ctx.market,
      expectedPosition: position,
      expectedOrders: openOrders,
      intents: decision.intents,
      eventKey: decision.eventKey,
    });
    executionState = upsertBrokerPosition(executionState, position);
    executionState = replaceActiveOrders(executionState, openOrders);
    executionState = applyReconcileResult(executionState, sync, decision.eventKey);
    executionState = compactPendingIntents(executionState);
    const executionStateValidation = validateExecutionState(executionState);
    auditEvents.push(
      createAuditEvent(gateBlocked ? "INTENT_REJECTED" : classifyIntentEvent(decision), {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: {
          decision: auditPayloadFromDecision(decision),
          gate: auditPayloadFromGate(gate),
          reconcile: auditPayloadFromReconcile(sync),
        },
      })
    );
    if (gateBlocked) {
      auditEvents.push(
        createAuditEvent("MODE_BLOCKED", {
          symbol: ctx.symbol,
          mode,
          eventKey: decision.eventKey,
          candleKey: ctx.idempotency?.candleKey ?? null,
          payload: {
            gate: auditPayloadFromGate(gate),
            decision: auditPayloadFromDecision(decision),
          },
        })
      );
    }
    auditEvents.push(
      createAuditEvent("RECONCILE_RESULT", {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: auditPayloadFromReconcile(sync) ?? {},
      })
    );
    await auditLogger.appendMany(auditEvents);

    return {
      auditPath: auditLogger.path,
      gate,
      decision,
      position,
      openOrders,
      results: [],
      sync,
      executionState,
      executionStateValidation,
    };
  }
  auditEvents.push(
    createAuditEvent("INTENT_CREATED", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: {
        decision: auditPayloadFromDecision(decision),
        gate: auditPayloadFromGate(gate),
      },
    })
  );

  const results: OrderResult[] = [];
  for (let index = 0; index < decision.intents.length; index += 1) {
    executionState = upsertPendingIntent(executionState, decision.intents[index]);
  }
  for (const intent of decision.intents) {
    const request = intentToOrderRequest(intent);
    if (!request) continue;
    results.push(await broker.placeOrder(attachGateMetadata(request, gate)));
  }
  executionState = applyOrderResultsToExecutionState(executionState, results);
  auditEvents.push(
    createAuditEvent("ORDER_SIMULATED", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: {
        results: auditPayloadFromBrokerResults(results),
      },
    })
  );

  const sync = await broker.syncState({
    symbol: ctx.symbol,
    market: ctx.market,
    expectedPosition: position,
    expectedOrders: openOrders,
    intents: decision.intents,
    eventKey: decision.eventKey,
  });

  const nextPosition = await broker.getPosition(ctx.symbol);
  const nextOpenOrders = await broker.getOpenOrders(ctx.symbol);
  executionState = upsertBrokerPosition(executionState, nextPosition);
  executionState = replaceActiveOrders(executionState, nextOpenOrders);
  executionState = applyReconcileResult(executionState, sync, decision.eventKey);
  executionState = markExecutionEvent(executionState, {
    eventKey: decision.eventKey,
    candleKey: ctx.idempotency?.candleKey ?? null,
    intentKey:
      decision.intents.find((intent) => normalizeText(intent.intentKey))?.intentKey ?? null,
    action: decision.action,
    result: results.every((result) => result.ok) ? "applied" : "partial",
  });
  executionState = compactPendingIntents(executionState);
  const executionStateValidation = validateExecutionState(executionState);
  if (!hasOpenPositionLike(position) && hasOpenPositionLike(nextPosition)) {
    auditEvents.push(
      createAuditEvent("POSITION_OPENED", {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: {
          previousPosition: position,
          nextPosition,
        },
      })
    );
  }
  if (hasOpenPositionLike(position) && !hasOpenPositionLike(nextPosition)) {
    auditEvents.push(
      createAuditEvent("POSITION_CLOSED", {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: {
          previousPosition: position,
          nextPosition,
        },
      })
    );
  }
  auditEvents.push(
    createAuditEvent("RECONCILE_RESULT", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: auditPayloadFromReconcile(sync) ?? {},
    })
  );

  // FILL_RESULT: capture actual fill prices AFTER syncState (per intent)
  // PaperBrokerAdapter.intentIndex ถูก update ใน fillOrder หลัง syncState
  // ใช้ type narrowing เพื่อไม่บังคับ broker interface
  if ("getIntentResult" in broker && typeof broker.getIntentResult === "function") {
    for (const intent of decision.intents) {
      const iKey = normalizeText(intent.intentKey);
      if (!iKey) continue;
      try {
        const fillResult = (broker as { getIntentResult: (k: string) => import("./executionAuditLog").ExecutionAuditEvent | null | import("../broker/types").OrderResult }).getIntentResult(iKey);
        if (
          fillResult &&
          typeof fillResult === "object" &&
          "averageFillPrice" in fillResult &&
          typeof (fillResult as Record<string, unknown>).averageFillPrice === "number" &&
          (fillResult as Record<string, unknown>).averageFillPrice !== null
        ) {
          const fr = fillResult as Record<string, unknown>;
          auditEvents.push(
            createAuditEvent("FILL_RESULT", {
              symbol: ctx.symbol,
              mode,
              eventKey: decision.eventKey,
              candleKey: ctx.idempotency?.candleKey ?? null,
              payload: {
                intentKey: iKey,
                orderId: fr.orderId ?? null,
                clientOrderId: fr.clientOrderId ?? null,
                status: fr.status ?? null,
                side: intent.side ?? null,
                quantity: intent.quantity ?? null,
                filledQuantity: fr.filledQuantity ?? null,
                averageFillPrice: fr.averageFillPrice,
                fills: Array.isArray(fr.fills) ? fr.fills : null,
                liveOrder: false,
                source: "paper_fill",
              },
            })
          );
        }
      } catch {
        // fill result lookup failure must not break execution
      }
    }
  }

  await auditLogger.appendMany(auditEvents);

  return {
    auditPath: auditLogger.path,
    gate,
    decision,
    position: nextPosition,
    openOrders: nextOpenOrders,
    results,
    sync,
    executionState,
    executionStateValidation,
  };
}
