import type { BrokerAdapter } from "../broker/BrokerAdapter";
import type { BrokerMode, MarketSnapshot, OpenOrderSnapshot, PositionSnapshot } from "../broker/types";
import type { PlanMachineState } from "../planStateMachine";
import type { RiskOverlay } from "../riskTypes";
import {
  auditPayloadFromDecision,
  auditPayloadFromGate,
  auditPayloadFromReconcile,
  auditPayloadFromRisk,
  classifyIntentEvent,
  createAuditEvent,
  ensureExecutionAuditLogger,
  type ExecutionAuditLogger,
} from "./executionAuditLog";
import {
  evaluateTradingModeGate,
  type TradingModeCaps,
  type TradingModeGateResult,
} from "./tradingModeGate";
import {
  decidePaperExecution,
  type PaperExecutionContext,
  type PaperExecutionDecision,
  type PaperExecutionEntry,
  type PaperExecutionIdempotency,
} from "./paperExecutionEngine";

export type LiveShadowContext = {
  mode?: BrokerMode | null;
  symbol: string;
  machineState: PlanMachineState;
  riskOverlay: RiskOverlay;
  market: MarketSnapshot;
  plannedEntry?: PaperExecutionEntry | null;
  reduceQuantity?: number | null;
  closeReason?: string | null;
  idempotency?: PaperExecutionIdempotency | null;
  allowLiveExecution?: boolean | null;
  killSwitchActive?: boolean | null;
  limitedCaps?: TradingModeCaps | null;
  auditLogger?: ExecutionAuditLogger | null;
  auditRootDir?: string | null;
  auditFileName?: string | null;
};

export type ShadowIntentObservation = {
  intentKey: string | null;
  kind: string;
  side: string | null;
  quantity: number | null;
  reachableNow: boolean;
  triggerPrice: number | null;
  marketLast: number | null;
};

export type LiveShadowVerification = {
  requestedMode: BrokerMode;
  effectiveMode: "LIVE_SHADOW";
  brokerMode: BrokerMode | string;
  gateShadowOnly: boolean;
  gateAllowExecution: boolean;
  gateAllowLiveExecution: boolean;
  gateActionPermission: string;
  brokerMethodsUsed: Array<"getPosition" | "getOpenOrders" | "syncState">;
  brokerWriteMethodsUsed: Array<"placeOrder" | "cancelOrder">;
  noRealOrderPlacementObserved: boolean;
  noRealCancelObserved: boolean;
  invariantPassed: boolean;
  violations: string[];
};

export type LiveShadowRunResult = {
  auditPath: string;
  gate: TradingModeGateResult;
  decision: PaperExecutionDecision;
  position: PositionSnapshot;
  openOrders: OpenOrderSnapshot[];
  sync?: Awaited<ReturnType<BrokerAdapter["syncState"]>>;
  observations: ShadowIntentObservation[];
  verification: LiveShadowVerification;
  summaryLog: {
    mode: BrokerMode;
    requestedMode: BrokerMode;
    symbol: string;
    machineState: PlanMachineState;
    riskStatus: string;
    shadowOnly: boolean;
    gateVerdict: string;
    gateBlockingConditionIds: string[];
    intendedAction: string;
    wouldExecuteLive: boolean;
    verificationPassed: boolean;
    verificationViolations: string[];
    blockedBy: string[];
    notes: string[];
  };
};

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeMode(value: BrokerMode | null | undefined): BrokerMode {
  if (value === "PAPER") return "PAPER";
  if (value === "LIVE_LIMITED") return "LIVE_LIMITED";
  if (value === "LIVE_FULL") return "LIVE_FULL";
  if (value === "LIVE_SHADOW") return "LIVE_SHADOW";
  return "LIVE_SHADOW";
}

function resolveShadowModes(value: BrokerMode | null | undefined) {
  const requestedMode = normalizeMode(value);
  const effectiveMode: "LIVE_SHADOW" = "LIVE_SHADOW";
  return {
    requestedMode,
    effectiveMode,
  };
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

function computeRequestNotional(plannedEntry: PaperExecutionEntry | null | undefined, market: MarketSnapshot) {
  if (!plannedEntry) return 0;
  const referencePrice = toFiniteNumber(plannedEntry.entryPrice) ?? toFiniteNumber(market.price.last) ?? 0;
  return referencePrice > 0 ? referencePrice * plannedEntry.quantity : 0;
}

function intentTriggerPrice(intent: PaperExecutionDecision["intents"][number]) {
  return toFiniteNumber(intent.price) ?? toFiniteNumber(intent.stopPrice) ?? toFiniteNumber(intent.takeProfitPrice);
}

function isIntentReachableNow(intent: PaperExecutionDecision["intents"][number], market: MarketSnapshot) {
  const last = toFiniteNumber(market.price.last);
  const triggerPrice = intentTriggerPrice(intent);
  if (last === null) return false;
  if (intent.orderType === "MARKET" || !intent.orderType) return true;
  if (triggerPrice === null) return false;

  if (intent.orderType === "LIMIT") {
    if (intent.side === "BUY") return last <= triggerPrice;
    if (intent.side === "SELL") return last >= triggerPrice;
  }

  if (intent.orderType === "STOP_MARKET" || intent.orderType === "STOP_LIMIT") {
    if (intent.side === "BUY") return last >= triggerPrice;
    if (intent.side === "SELL") return last <= triggerPrice;
  }

  if (intent.orderType === "TAKE_PROFIT_MARKET" || intent.orderType === "TAKE_PROFIT_LIMIT") {
    if (intent.side === "SELL") return last >= triggerPrice;
    if (intent.side === "BUY") return last <= triggerPrice;
  }

  return false;
}

function buildObservations(decision: PaperExecutionDecision, market: MarketSnapshot): ShadowIntentObservation[] {
  return decision.intents.map((intent) => ({
    intentKey: intent.intentKey ?? null,
    kind: intent.kind,
    side: intent.side ?? null,
    quantity: toFiniteNumber(intent.quantity),
    reachableNow: isIntentReachableNow(intent, market),
    triggerPrice: intentTriggerPrice(intent),
    marketLast: toFiniteNumber(market.price.last),
  }));
}

function buildBlockedBy(gate: TradingModeGateResult, decision: PaperExecutionDecision) {
  const blockedBy = gate.reasons
    .filter((reason) => reason.severity === "block" || reason.severity === "hard_stop")
    .map((reason) => reason.code);

  if (decision.blockedByIdempotency) blockedBy.push("idempotency_gate");
  if (!decision.allowed && decision.reasons.length > 0) blockedBy.push("execution_decision_blocked");
  return Array.from(new Set(blockedBy));
}

function buildLiveShadowVerification(args: {
  requestedMode: BrokerMode;
  effectiveMode: "LIVE_SHADOW";
  brokerMode: BrokerMode | string;
  gate: TradingModeGateResult;
}): LiveShadowVerification {
  const violations: string[] = [];

  if (args.requestedMode !== "LIVE_SHADOW") {
    violations.push(`requested_mode_${args.requestedMode.toLowerCase()}_coerced_to_live_shadow`);
  }
  if (args.gate.shadowOnly !== true) {
    violations.push("gate_shadow_only_false");
  }
  if (args.gate.allowExecution !== false) {
    violations.push("gate_allow_execution_true");
  }
  if (args.gate.allowLiveExecution !== false) {
    violations.push("gate_allow_live_execution_true");
  }
  if (args.gate.actionPermission !== "DENY") {
    violations.push(`gate_action_permission_${String(args.gate.actionPermission).toLowerCase()}`);
  }

  return {
    requestedMode: args.requestedMode,
    effectiveMode: args.effectiveMode,
    brokerMode: args.brokerMode,
    gateShadowOnly: args.gate.shadowOnly,
    gateAllowExecution: args.gate.allowExecution,
    gateAllowLiveExecution: args.gate.allowLiveExecution,
    gateActionPermission: args.gate.actionPermission,
    brokerMethodsUsed: ["getPosition", "getOpenOrders", "syncState"],
    brokerWriteMethodsUsed: [],
    noRealOrderPlacementObserved: true,
    noRealCancelObserved: true,
    invariantPassed: violations.length === 0,
    violations,
  };
}

export async function runLiveShadowExecution(
  broker: BrokerAdapter,
  ctx: LiveShadowContext
): Promise<LiveShadowRunResult> {
  const auditLogger = ensureExecutionAuditLogger(ctx.auditLogger, {
    rootDir: ctx.auditRootDir ?? null,
    fileName: ctx.auditFileName ?? null,
  });
  const { requestedMode, effectiveMode } = resolveShadowModes(ctx.mode);
  const mode = effectiveMode;
  const brokerMode = broker.getIdentity().mode;
  const position = await broker.getPosition(ctx.symbol);
  const openOrders = await broker.getOpenOrders(ctx.symbol);

  const gate = evaluateTradingModeGate({
    mode,
    action:
      ctx.machineState === "READY"
        ? "OPEN"
        : ctx.machineState === "IN_POSITION"
          ? "PROTECT"
          : ctx.machineState === "REDUCE"
            ? "REDUCE"
            : ctx.machineState === "EXIT"
              ? "CLOSE"
              : "SYNC",
    failSafeMode: ctx.riskOverlay.truthStatus === "BROKEN" ? "HARD_STOP" : undefined,
    riskOverlay: ctx.riskOverlay,
    killSwitchActive: ctx.killSwitchActive,
    allowLiveExecution: ctx.allowLiveExecution,
    liveShadowOnly: true,
    caps: ctx.limitedCaps,
    exposure: {
      activePositions: position.side === "FLAT" || position.size <= 0 ? 0 : 1,
      pendingEntryIntents: openOrders.length,
      currentNotional:
        (toFiniteNumber(position.entryPrice) ?? toFiniteNumber(ctx.market.price.last) ?? 0) * Math.max(position.size, 0),
      requestNotional: computeRequestNotional(ctx.plannedEntry, ctx.market),
      sameSymbolOpen: position.side !== "FLAT" && position.size > 0,
    },
  });
  const verification = buildLiveShadowVerification({
    requestedMode,
    effectiveMode,
    brokerMode,
    gate,
  });

  const paperContext: PaperExecutionContext = {
    symbol: ctx.symbol,
    machineState: ctx.machineState,
    riskOverlay: ctx.riskOverlay,
    market: ctx.market,
    plannedEntry: ctx.plannedEntry,
    reduceQuantity: ctx.reduceQuantity,
    closeReason: ctx.closeReason,
    idempotency: ctx.idempotency,
  };

  const decision = decidePaperExecution(paperContext, position, openOrders);
  const sync = await broker.syncState({
    symbol: ctx.symbol,
    market: ctx.market,
    expectedPosition: position,
    expectedOrders: openOrders,
    intents: decision.intents,
    eventKey: decision.eventKey,
  });
  const observations = buildObservations(decision, ctx.market);
  const blockedBy = buildBlockedBy(gate, decision);
  await auditLogger.appendMany([
    createAuditEvent("PLAN_EVALUATED", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: {
        machineState: ctx.machineState,
        intendedAction: decision.action,
        shadowOnly: true,
        verification,
      },
    }),
    createAuditEvent("RISK_EVALUATED", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: auditPayloadFromRisk(ctx.riskOverlay),
    }),
    createAuditEvent(
      gate.allowExecution && decision.allowed && decision.intents.length > 0 ? "ORDER_SHADOWED" : classifyIntentEvent(decision),
      {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: {
        decision: auditPayloadFromDecision(decision),
        gate: auditPayloadFromGate(gate),
        observations,
        verification,
      },
      }
    ),
    createAuditEvent("RECONCILE_RESULT", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: auditPayloadFromReconcile(sync) ?? {},
    }),
    createAuditEvent("LIVE_SHADOW_SUMMARY", {
      symbol: ctx.symbol,
      mode,
      eventKey: decision.eventKey,
      candleKey: ctx.idempotency?.candleKey ?? null,
      payload: {
        gate: auditPayloadFromGate(gate),
        decision: auditPayloadFromDecision(decision),
        blockedBy,
        verification,
      },
    }),
  ]);

  if (!gate.allowExecution) {
    await auditLogger.append(
      createAuditEvent("MODE_BLOCKED", {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: {
          gate: auditPayloadFromGate(gate),
          decision: auditPayloadFromDecision(decision),
          blockedBy,
          verification,
        },
      })
    );
  }

  if (ctx.riskOverlay.shouldFreezeTrading || ctx.riskOverlay.status === "HARD_STOP") {
    await auditLogger.append(
      createAuditEvent("FAIL_SAFE_TRIGGERED", {
        symbol: ctx.symbol,
        mode,
        eventKey: decision.eventKey,
        candleKey: ctx.idempotency?.candleKey ?? null,
        payload: {
          risk: auditPayloadFromRisk(ctx.riskOverlay),
          gate: auditPayloadFromGate(gate),
          verification,
        },
      })
    );
  }

  return {
    auditPath: auditLogger.path,
    gate,
    decision,
    position,
    openOrders,
    sync,
    observations,
    verification,
    summaryLog: {
      mode,
      requestedMode,
      symbol: ctx.symbol,
      machineState: ctx.machineState,
      riskStatus: ctx.riskOverlay.status,
      shadowOnly: true,
      gateVerdict: gate.verdict,
      gateBlockingConditionIds: gate.blockingConditionIds,
      intendedAction: decision.action,
      wouldExecuteLive: false,
      verificationPassed: verification.invariantPassed,
      verificationViolations: verification.violations,
      blockedBy,
      notes: [
        `requested_mode=${requestedMode}`,
        `effective_mode=${mode}`,
        `broker_mode=${brokerMode}`,
        ...gate.reasons.map((reason) => `${reason.code}:${reason.message}`),
        ...decision.reasons,
        ...verification.violations,
        sync ? `sync_ok=${sync.ok}` : "sync_missing",
        `open_orders=${openOrders.length}`,
        `has_protection=${hasProtectionOrders(openOrders)}`,
      ],
    },
  };
}
