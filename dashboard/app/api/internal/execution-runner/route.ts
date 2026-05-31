import { NextRequest, NextResponse } from "next/server";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

import { BingxBrokerAdapter, type BingxReadOnlyTransport, type BingxTradingTransport } from "@/lib/broker/BingxBrokerAdapter";
import { PaperBrokerAdapter } from "@/lib/broker/PaperBrokerAdapter";
import type {
  BrokerMode,
  BrokerSide,
  MarketSnapshot,
  OpenOrderSnapshot,
  OrderType,
  PositionSnapshot,
} from "@/lib/broker/types";
import type { BingxCancelOrderRequest, BingxOrderPayload, BingxPlaceOrderRequest, BingxPositionPayload } from "@/lib/broker/bingxTypes";
import {
  runPaperExecution,
  type PaperExecutionContext,
  type PaperExecutionEntry,
  type PaperExecutionRunResult,
} from "@/lib/execution/paperExecutionEngine";
import {
  buildExecutionAuditContract,
  createAuditEvent,
  ensureExecutionAuditLogger,
  inferAuditMode,
  type ExecutionAuditContract,
} from "@/lib/execution/executionAuditLog";
import {
  runLiveShadowExecution,
  type LiveShadowContext,
  type LiveShadowRunResult,
} from "@/lib/execution/liveShadowExecution";
import {
  buildKillSwitchResponse,
  readKillSwitchState,
} from "../../../../lib/operator/killSwitch";
import { buildExecutionRunnerFixtureCaps } from "../../../../lib/operator/effectiveConfig";
import type { TradingModeCaps, TradingModeGateInput } from "@/lib/execution/tradingModeGate";
import type { PlanMachineState } from "@/lib/planStateMachine";
import type { RiskOverlay } from "@/lib/riskTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunnerScenario =
  | "paper_open"
  | "live_shadow_open"
  | "live_limited_block"
  | "live_limited_allow"
  | "live_limited_dry_run"
  | "live_limited_transport_missing"
  | "live_limited_exchange_error"
  | "live_limited_validation_error";

type TraceEntry = {
  method: string;
  at: string;
  payload: unknown;
};

type TransportTrace = {
  readOnlyCalls: TraceEntry[];
  tradingCalls: TraceEntry[];
};

type RunnerRequest = {
  scenario?: RunnerScenario | null;
  mode?: BrokerMode | null;
  symbol?: string | null;
  machineState?: PlanMachineState | null;
  market?: Partial<MarketSnapshot> | null;
  plannedEntry?: Partial<PaperExecutionEntry> | null;
  riskOverlay?: Partial<RiskOverlay> | null;
  gateInput?: Partial<Omit<TradingModeGateInput, "mode" | "action" | "symbol" | "riskOverlay" | "exposure">> | null;
  limitedCaps?: TradingModeCaps | null;
  allowLiveExecution?: boolean | null;
  killSwitchActive?: boolean | null;
  auditFileName?: string | null;
  brokerState?: {
    position?: Partial<PositionSnapshot> | null;
    openOrders?: Array<Partial<OpenOrderSnapshot>> | null;
  } | null;
};

type RunnerConfig = {
  scenario: RunnerScenario;
  mode: BrokerMode;
  symbol: string;
  machineState: PlanMachineState;
  market: MarketSnapshot;
  plannedEntry: PaperExecutionEntry | null;
  riskOverlay: RiskOverlay;
  gateInput: Partial<Omit<TradingModeGateInput, "mode" | "action" | "symbol" | "riskOverlay" | "exposure">>;
  limitedCaps: TradingModeCaps | null;
  allowLiveExecution: boolean;
  killSwitchActive: boolean;
  dryRun: boolean;
  transportBehavior: "normal" | "missing_trading" | "throw_exchange_error";
  auditFileName: string;
  brokerState: {
    position: PositionSnapshot | null;
    openOrders: OpenOrderSnapshot[];
  };
};

type RunnerPathProof = {
  runner: "runPaperExecution" | "runLiveShadowExecution";
  scenario: RunnerScenario;
  mode: BrokerMode;
  gateVerdict: string;
  gateAllowExecution: boolean;
  gateAllowLiveExecution: boolean;
  decisionAction: string;
  intentCount: number;
  resultCount: number;
  transportWriteCount: number;
  transportWriteAttempted: boolean;
  adapterNoSendCount: number;
  noSendGuardCodes: string[];
  normalizedErrorCategories: string[];
  blockedBeforeBroker: boolean;
  shadowInvariantPassed: boolean | null;
  matchedExpectation: boolean;
  expectation: string;
};

type RunnerAuditEnvelope = {
  path: string;
  exists: boolean;
  eventCount: number;
  eventTypes: string[];
  tail: Record<string, unknown>[];
  contract: ExecutionAuditContract;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function maskValue(v: string | null | undefined) {
  if (!v) return null;
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}********${v.slice(-2)}`;
}

function toText(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function getAuthToken(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  const headerKey =
    req.headers.get("x-run-cycle-key") ||
    req.headers.get("x-internal-key") ||
    req.headers.get("x-api-key");

  if (headerKey) return headerKey.trim();

  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey) return urlKey.trim();

  return null;
}

function readEnvValueFromFile(filePath: string, names: string[]) {
  try {
    if (!fsSync.existsSync(filePath)) return null;
    const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      for (const name of names) {
        if (!trimmed.startsWith(`${name}=`)) continue;
        const raw = trimmed.slice(name.length + 1).trim();
        const unquoted = raw.replace(/^['"]|['"]$/g, "").trim();
        if (unquoted) return unquoted;
      }
    }
  } catch {}
  return null;
}

function resolveExpectedSecret() {
  const fromEnv =
    process.env.RUN_CYCLE_TRIGGER_KEY ||
    process.env.INTERNAL_API_KEY ||
    process.env.REFRESH_ENDPOINT_KEY ||
    "";
  if (fromEnv) return fromEnv;

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env.local"),
    path.resolve(process.cwd(), "..", ".env"),
  ];

  for (const filePath of candidates) {
    const fromFile = readEnvValueFromFile(filePath, [
      "RUN_CYCLE_TRIGGER_KEY",
      "INTERNAL_API_KEY",
      "REFRESH_ENDPOINT_KEY",
    ]);
    if (fromFile) return fromFile;
  }

  return "";
}

function verifyAuth(req: NextRequest) {
  const expected = resolveExpectedSecret();

  if (!expected) {
    return {
      ok: false,
      reason:
        "missing server secret: set RUN_CYCLE_TRIGGER_KEY (or INTERNAL_API_KEY / REFRESH_ENDPOINT_KEY)",
      expectedMasked: null as string | null,
      receivedMasked: null as string | null,
    };
  }

  const received = getAuthToken(req);

  return {
    ok: !!received && received === expected,
    reason: received ? "bad key" : "missing key",
    expectedMasked: maskValue(expected),
    receivedMasked: maskValue(received),
  };
}

function cloneForJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowMs() {
  return Date.now();
}

function defaultMarket(symbol: string, scenario: RunnerScenario): MarketSnapshot {
  const timestamp = nowMs();
  const price = 70500;
  return {
    symbol,
    timeframe: "5m",
    closeTs5m: timestamp,
    eventKey: `${symbol}:${scenario}:${timestamp}`,
    price: {
      last: price,
      bid: price - 1,
      ask: price + 1,
      mark: price,
      index: price,
      updatedAtMs: timestamp,
    },
    sourceFreshnessTag: "FRESH",
    sourceAgeSec: 15,
    derivativesFreshnessTag: "FRESH",
    derivativesAgeSec: 10,
  };
}

function defaultPlannedEntry(market: MarketSnapshot): PaperExecutionEntry {
  const last = market.price.last ?? 70500;
  return {
    side: "BUY",
    quantity: 0.01,
    entryPrice: last,
    stopPrice: Math.max(1, last - 350),
    takeProfitPrice: last + 350,
    reason: "execution-runner default planned entry",
  };
}

function defaultRiskOverlay(): RiskOverlay {
  return {
    status: "APPROVED",
    truthStatus: "HEALTHY",
    canOpenNewTrade: true,
    shouldFreezeTrading: false,
    shouldReduceRisk: false,
    shouldForceExit: false,
    reasons: [],
    hardStopReasons: [],
    warnings: [],
    caps: {
      maxRiskPerTradePct: 1,
      maxDailyLossPct: 3,
      maxConcurrentExposure: 1,
      staleDataWarnSec: 120,
      staleDataFreezeSec: 300,
      derivativesStaleWarnSec: 120,
      derivativesStaleFreezeSec: 300,
      cooldownMs: 0,
    },
    truthIntegrity: {
      canonicalPlanPresent: true,
      canonicalConsistent: true,
      markerProofConsistent: true,
      sourceFresh: true,
      derivativesFresh: true,
      executionConsistent: true,
      persistHealthy: true,
    },
    exposureSummary: {
      activePositions: 0,
      sameSymbolOpen: false,
      pendingEntryIntents: 0,
      hasProtection: false,
      positionState: "FLAT",
    },
    tradeRisk: {
      projectedRiskPct: 0.25,
      projectedRiskAllowed: true,
    },
    dailyLoss: {
      dailyRealizedPnl: 0,
      dailyRealizedPnlPct: 0,
      dailyLossLimitHit: false,
    },
    cooldown: {
      active: false,
      reason: null,
      untilTs: null,
    },
  };
}

function mergeRiskOverlay(base: RiskOverlay, patch?: Partial<RiskOverlay> | null): RiskOverlay {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    caps: {
      ...base.caps,
      ...(patch.caps ?? {}),
    },
    truthIntegrity: {
      ...base.truthIntegrity,
      ...(patch.truthIntegrity ?? {}),
    },
    exposureSummary: {
      ...base.exposureSummary,
      ...(patch.exposureSummary ?? {}),
    },
    tradeRisk: {
      ...base.tradeRisk,
      ...(patch.tradeRisk ?? {}),
    },
    dailyLoss: {
      ...base.dailyLoss,
      ...(patch.dailyLoss ?? {}),
    },
    cooldown: {
      ...base.cooldown,
      ...(patch.cooldown ?? {}),
    },
    reasons: Array.isArray(patch.reasons) ? patch.reasons : base.reasons,
    hardStopReasons: Array.isArray(patch.hardStopReasons) ? patch.hardStopReasons : base.hardStopReasons,
    warnings: Array.isArray(patch.warnings) ? patch.warnings : base.warnings,
  };
}

function mergeMarket(base: MarketSnapshot, patch?: Partial<MarketSnapshot> | null): MarketSnapshot {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    price: {
      ...base.price,
      ...(patch.price ?? {}),
    },
  };
}

function normalizeMode(value: unknown, fallback: BrokerMode): BrokerMode {
  const normalized = toText(value).toUpperCase();
  if (normalized === "PAPER") return "PAPER";
  if (normalized === "LIVE_SHADOW") return "LIVE_SHADOW";
  if (normalized === "LIVE_LIMITED") return "LIVE_LIMITED";
  if (normalized === "LIVE_FULL") return "LIVE_FULL";
  return fallback;
}

function normalizeMachineState(value: unknown, fallback: PlanMachineState): PlanMachineState {
  const normalized = toText(value).toUpperCase();
  switch (normalized) {
    case "HOLD":
    case "NO_TRADE_LOCKED":
    case "WAIT_PULLBACK":
    case "WAIT_CONFIRM":
    case "READY":
    case "IN_POSITION":
    case "REDUCE":
    case "EXIT":
    case "FAIL_SAFE":
      return normalized;
    default:
      return fallback;
  }
}

function normalizeSide(value: unknown, fallback: BrokerSide): BrokerSide {
  return toText(value).toUpperCase() === "SELL" ? "SELL" : fallback;
}

function normalizeScenario(value: unknown): RunnerScenario {
  const normalized = toText(value).toLowerCase();
  if (normalized === "paper_open") return "paper_open";
  if (normalized === "live_shadow_open") return "live_shadow_open";
  if (normalized === "live_limited_allow") return "live_limited_allow";
  if (normalized === "live_limited_dry_run") return "live_limited_dry_run";
  if (normalized === "live_limited_transport_missing") return "live_limited_transport_missing";
  if (normalized === "live_limited_exchange_error") return "live_limited_exchange_error";
  if (normalized === "live_limited_validation_error") return "live_limited_validation_error";
  return "live_limited_block";
}

function scenarioDefaults(scenario: RunnerScenario, symbol: string) {
  const market = defaultMarket(symbol, scenario);
  const entry = defaultPlannedEntry(market);
  const base = {
    scenario,
    symbol,
    machineState: "READY" as PlanMachineState,
    market,
    plannedEntry: entry,
    riskOverlay: defaultRiskOverlay(),
    gateInput: {} as Partial<
      Omit<TradingModeGateInput, "mode" | "action" | "symbol" | "riskOverlay" | "exposure">
    >,
    limitedCaps: buildExecutionRunnerFixtureCaps(symbol),
    allowLiveExecution: false,
    killSwitchActive: false,
    dryRun: false,
    transportBehavior: "normal" as const,
    mode: "PAPER" as BrokerMode,
  };

  if (scenario === "paper_open") {
    return {
      ...base,
      mode: "PAPER" as BrokerMode,
    };
  }

  if (scenario === "live_shadow_open") {
    return {
      ...base,
      mode: "LIVE_SHADOW" as BrokerMode,
    };
  }

  if (scenario === "live_limited_allow") {
    return {
      ...base,
      mode: "LIVE_LIMITED" as BrokerMode,
      allowLiveExecution: true,
      gateInput: {
        runtimeProofComplete: true,
        canonicalConsistent: true,
        sourceFresh: true,
        derivativesFresh: true,
        orderType: "LIMIT",
      },
    };
  }

  if (scenario === "live_limited_dry_run") {
    return {
      ...base,
      mode: "LIVE_LIMITED" as BrokerMode,
      allowLiveExecution: true,
      dryRun: true,
      gateInput: {
        runtimeProofComplete: true,
        canonicalConsistent: true,
        sourceFresh: true,
        derivativesFresh: true,
        orderType: "LIMIT",
      },
    };
  }

  if (scenario === "live_limited_transport_missing") {
    return {
      ...base,
      mode: "LIVE_LIMITED" as BrokerMode,
      allowLiveExecution: true,
      transportBehavior: "missing_trading" as const,
      gateInput: {
        runtimeProofComplete: true,
        canonicalConsistent: true,
        sourceFresh: true,
        derivativesFresh: true,
        orderType: "LIMIT",
      },
    };
  }

  if (scenario === "live_limited_exchange_error") {
    return {
      ...base,
      mode: "LIVE_LIMITED" as BrokerMode,
      allowLiveExecution: true,
      transportBehavior: "throw_exchange_error" as const,
      gateInput: {
        runtimeProofComplete: true,
        canonicalConsistent: true,
        sourceFresh: true,
        derivativesFresh: true,
        orderType: "LIMIT",
      },
    };
  }

  if (scenario === "live_limited_validation_error") {
    return {
      ...base,
      mode: "LIVE_LIMITED" as BrokerMode,
      allowLiveExecution: true,
      plannedEntry: {
        ...entry,
        takeProfitPrice: 0,
      },
      gateInput: {
        runtimeProofComplete: true,
        canonicalConsistent: true,
        sourceFresh: true,
        derivativesFresh: true,
        orderType: "LIMIT",
      },
    };
  }

  return {
    ...base,
    mode: "LIVE_LIMITED" as BrokerMode,
    allowLiveExecution: true,
    gateInput: {
      runtimeProofComplete: false,
      canonicalConsistent: true,
      sourceFresh: true,
      derivativesFresh: true,
      orderType: "LIMIT",
    },
  };
}

function normalizePlannedEntry(
  market: MarketSnapshot,
  entry?: Partial<PaperExecutionEntry> | null
): PaperExecutionEntry | null {
  if (entry === null) return null;
  const base = defaultPlannedEntry(market);
  const merged = {
    ...base,
    ...(entry ?? {}),
  };
  const quantity = toFiniteNumber(merged.quantity, base.quantity);
  if (quantity <= 0) return null;

  return {
    side: normalizeSide(merged.side, base.side),
    quantity,
    entryPrice:
      merged.entryPrice === null || merged.entryPrice === undefined
        ? null
        : toFiniteNumber(merged.entryPrice, base.entryPrice ?? market.price.last ?? 70500),
    stopPrice:
      merged.stopPrice === null || merged.stopPrice === undefined
        ? null
        : toFiniteNumber(merged.stopPrice, base.stopPrice ?? 0),
    takeProfitPrice:
      merged.takeProfitPrice === null || merged.takeProfitPrice === undefined
        ? null
        : toFiniteNumber(merged.takeProfitPrice, base.takeProfitPrice ?? 0),
    reason: toText(merged.reason, base.reason ?? "execution-runner planned entry"),
  };
}

function normalizePosition(symbol: string, position?: Partial<PositionSnapshot> | null): PositionSnapshot | null {
  if (!position) return null;
  const side = toText(position.side, "FLAT").toUpperCase();
  return {
    symbol: toText(position.symbol, symbol),
    side: side === "LONG" || side === "SHORT" ? side : "FLAT",
    size: Math.max(0, toFiniteNumber(position.size, 0)),
    entryPrice:
      position.entryPrice === null || position.entryPrice === undefined
        ? null
        : toFiniteNumber(position.entryPrice, 0),
    markPrice:
      position.markPrice === null || position.markPrice === undefined
        ? null
        : toFiniteNumber(position.markPrice, 0),
    notional:
      position.notional === null || position.notional === undefined
        ? null
        : toFiniteNumber(position.notional, 0),
    unrealizedPnl:
      position.unrealizedPnl === null || position.unrealizedPnl === undefined
        ? null
        : toFiniteNumber(position.unrealizedPnl, 0),
    leverage:
      position.leverage === null || position.leverage === undefined
        ? null
        : toFiniteNumber(position.leverage, 0),
    liquidationPrice:
      position.liquidationPrice === null || position.liquidationPrice === undefined
        ? null
        : toFiniteNumber(position.liquidationPrice, 0),
    isolated:
      typeof position.isolated === "boolean" ? position.isolated : null,
    updatedAtMs: toFiniteNumber(position.updatedAtMs, nowMs()),
    raw: cloneForJson(position),
  };
}

function normalizeOpenOrders(symbol: string, orders?: Array<Partial<OpenOrderSnapshot>> | null): OpenOrderSnapshot[] {
  if (!Array.isArray(orders)) return [];
  return orders.map((order, index) => ({
    orderId: toText(order.orderId, `seed-${index + 1}`),
    clientOrderId:
      order.clientOrderId === undefined || order.clientOrderId === null ? null : toText(order.clientOrderId),
    symbol: toText(order.symbol, symbol),
    side: normalizeSide(order.side, "BUY"),
    type: (toText(order.type, "LIMIT").toUpperCase() as OrderType),
    status: (toText(order.status, "NEW").toUpperCase() as OpenOrderSnapshot["status"]),
    reduceOnly: normalizeBool(order.reduceOnly, false),
    price:
      order.price === null || order.price === undefined ? null : toFiniteNumber(order.price, 0),
    stopPrice:
      order.stopPrice === null || order.stopPrice === undefined ? null : toFiniteNumber(order.stopPrice, 0),
    quantity: Math.max(0.0001, toFiniteNumber(order.quantity, 0.01)),
    filledQuantity:
      order.filledQuantity === null || order.filledQuantity === undefined
        ? null
        : toFiniteNumber(order.filledQuantity, 0),
    remainingQuantity:
      order.remainingQuantity === null || order.remainingQuantity === undefined
        ? null
        : toFiniteNumber(order.remainingQuantity, 0),
    createdAtMs: toFiniteNumber(order.createdAtMs, nowMs()),
    updatedAtMs: toFiniteNumber(order.updatedAtMs, nowMs()),
    raw: cloneForJson(order),
  }));
}

function buildConfig(body: RunnerRequest, operatorKillSwitchActive = false): RunnerConfig {
  const requestedScenario = normalizeScenario(body.scenario);
  const symbol = toText(body.symbol, "BTC-USDT");
  const baseline = scenarioDefaults(requestedScenario, symbol);
  const mode = normalizeMode(body.mode, baseline.mode);
  const scenario =
    body.scenario != null
      ? requestedScenario
      : mode === "PAPER"
        ? "paper_open"
        : mode === "LIVE_SHADOW"
          ? "live_shadow_open"
          : baseline.scenario;
  const market = mergeMarket(baseline.market, body.market);
  const riskOverlay = mergeRiskOverlay(baseline.riskOverlay, body.riskOverlay);
  const plannedEntry = normalizePlannedEntry(market, body.plannedEntry ?? baseline.plannedEntry);
  const auditFileName =
    toText(body.auditFileName) || `execution-runner-${scenario}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`;

  return {
    scenario,
    mode,
    symbol,
    machineState: normalizeMachineState(body.machineState, baseline.machineState),
    market,
    plannedEntry,
    riskOverlay,
    gateInput: {
      ...(baseline.gateInput ?? {}),
      ...(body.gateInput ?? {}),
    },
    limitedCaps: body.limitedCaps ?? baseline.limitedCaps ?? null,
    allowLiveExecution: normalizeBool(
      body.allowLiveExecution,
      baseline.allowLiveExecution || mode === "LIVE_FULL"
    ),
    killSwitchActive:
      operatorKillSwitchActive ||
      normalizeBool(body.killSwitchActive, baseline.killSwitchActive),
    dryRun: baseline.dryRun,
    transportBehavior: baseline.transportBehavior,
    auditFileName,
    brokerState: {
      position: normalizePosition(symbol, body.brokerState?.position ?? null),
      openOrders: normalizeOpenOrders(symbol, body.brokerState?.openOrders ?? null),
    },
  };
}

function toBingxPositionPayload(position: PositionSnapshot): BingxPositionPayload {
  const side = position.side === "SHORT" ? "SELL" : "BUY";
  return {
    symbol: position.symbol,
    positionSide: position.side === "FLAT" ? "BOTH" : position.side,
    side,
    positionAmt: position.size,
    entryPrice: position.entryPrice,
    avgPrice: position.entryPrice,
    markPrice: position.markPrice ?? position.entryPrice,
    unrealizedProfit: position.unrealizedPnl ?? 0,
    leverage: position.leverage ?? 1,
    isolated: position.isolated ?? true,
    liquidationPrice: position.liquidationPrice ?? null,
    updateTime: position.updatedAtMs ?? nowMs(),
    raw: {
      source: "execution_runner",
    },
  };
}

function toBingxOrderPayload(order: OpenOrderSnapshot): BingxOrderPayload {
  return {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId ?? null,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    origQty: order.quantity,
    executedQty: order.filledQuantity ?? 0,
    cumQty: order.filledQuantity ?? 0,
    price: order.price ?? null,
    stopPrice: order.stopPrice ?? null,
    avgPrice: order.price ?? null,
    status: order.status,
    reduceOnly: order.reduceOnly ?? false,
    closePosition: false,
    updateTime: order.updatedAtMs ?? nowMs(),
    createTime: order.createdAtMs ?? nowMs(),
    raw: {
      source: "execution_runner",
    },
  };
}

function createTracingTransport(config: RunnerConfig, trace: TransportTrace) {
  const seededPositionPayloads = config.brokerState.position ? [toBingxPositionPayload(config.brokerState.position)] : [];
  const seededOpenOrders = config.brokerState.openOrders.map(toBingxOrderPayload);

  const readOnly: BingxReadOnlyTransport = {
    async getBalances(params) {
      trace.readOnlyCalls.push({
        method: "getBalances",
        at: new Date().toISOString(),
        payload: cloneForJson(params ?? {}),
      });
      return [
        {
          asset: "USDT",
          balance: "10000",
          availableMargin: "10000",
          updateTime: nowMs(),
          raw: {
            source: "execution_runner",
          },
        },
      ];
    },
    async getPositions(params) {
      trace.readOnlyCalls.push({
        method: "getPositions",
        at: new Date().toISOString(),
        payload: cloneForJson(params),
      });
      return cloneForJson(seededPositionPayloads);
    },
    async getOpenOrders(params) {
      trace.readOnlyCalls.push({
        method: "getOpenOrders",
        at: new Date().toISOString(),
        payload: cloneForJson(params),
      });
      return cloneForJson(seededOpenOrders);
    },
  };

  const trading: BingxTradingTransport = {
    async placeOrder(request: BingxPlaceOrderRequest) {
      trace.tradingCalls.push({
        method: "placeOrder",
        at: new Date().toISOString(),
        payload: cloneForJson(request),
      });
      if (config.transportBehavior === "throw_exchange_error") {
        throw {
          code: "100421",
          msg: "exchange rejected order: simulated signature mismatch",
          retriable: false,
          raw: {
            source: "execution_runner",
            simulated: true,
          },
        };
      }
      return {
        orderId: `trace-${trace.tradingCalls.length}`,
        clientOrderId: request.clientOrderId ?? null,
        symbol: request.symbol,
        side: request.side,
        positionSide: request.positionSide ?? "BOTH",
        type: request.type,
        origQty: request.quantity,
        executedQty: "0",
        cumQty: "0",
        price: request.price ?? config.market.price.last ?? null,
        stopPrice: request.stopPrice ?? null,
        avgPrice: request.price ?? config.market.price.last ?? null,
        status: "NEW",
        reduceOnly: request.reduceOnly ?? false,
        closePosition: request.closePosition ?? false,
        createTime: nowMs(),
        updateTime: nowMs(),
        raw: {
          source: "execution_runner",
          transport_trace: true,
        },
      };
    },
    async cancelOrder(request: BingxCancelOrderRequest) {
      trace.tradingCalls.push({
        method: "cancelOrder",
        at: new Date().toISOString(),
        payload: cloneForJson(request),
      });
      return {
        orderId: request.orderId ?? `cancel-${trace.tradingCalls.length}`,
        clientOrderId: request.clientOrderId ?? null,
        symbol: request.symbol,
        side: "SELL",
        type: "LIMIT",
        origQty: "0",
        executedQty: "0",
        cumQty: "0",
        price: null,
        stopPrice: null,
        avgPrice: null,
        status: "CANCELED",
        reduceOnly: false,
        closePosition: false,
        createTime: nowMs(),
        updateTime: nowMs(),
        raw: {
          source: "execution_runner",
          transport_trace: true,
        },
      };
    },
  };

  if (config.transportBehavior === "missing_trading") {
    return { readOnly, trading: null };
  }

  return { readOnly, trading };
}

async function readAuditSummary(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const events = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    return {
      path: filePath,
      exists: true,
      eventCount: events.length,
      eventTypes: events.map((event) => String(event.type ?? "UNKNOWN")),
      tail: events.slice(-5),
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      eventCount: 0,
      eventTypes: [] as string[],
      tail: [] as Record<string, unknown>[],
    };
  }
}

function auditRequiredTypes(config: RunnerConfig) {
  const required = [
    "RUNNER_REQUESTED",
    "PLAN_EVALUATED",
    "RISK_EVALUATED",
    "RECONCILE_RESULT",
    "RUNNER_COMPLETED",
  ] as const;

  if (config.mode === "LIVE_SHADOW") {
    return [...required, "LIVE_SHADOW_SUMMARY", "MODE_BLOCKED"] as const;
  }

  if (config.mode === "PAPER") {
    return [...required, "INTENT_CREATED", "ORDER_SIMULATED"] as const;
  }

  if (config.scenario === "live_limited_block") {
    return [...required, "INTENT_REJECTED", "MODE_BLOCKED"] as const;
  }

  return [...required, "INTENT_CREATED", "ORDER_SIMULATED"] as const;
}

function buildAuditEnvelope(
  audit: Awaited<ReturnType<typeof readAuditSummary>>,
  config: RunnerConfig
): RunnerAuditEnvelope {
  const requiredTypes = [...auditRequiredTypes(config)];
  return {
    ...audit,
    contract: buildExecutionAuditContract(audit.eventTypes, requiredTypes),
  };
}

function adapterNoSendCount(results: Array<{ raw?: unknown }>) {
  return results.filter((result) => {
    if (!result.raw || typeof result.raw !== "object" || Array.isArray(result.raw)) return false;
    const raw = result.raw as Record<string, unknown>;
    return raw.no_send === true;
  }).length;
}

function noSendGuardCodes(results: Array<{ raw?: unknown }>) {
  return Array.from(
    new Set(
      results
        .map((result) => {
          if (!result.raw || typeof result.raw !== "object" || Array.isArray(result.raw)) return null;
          return toText((result.raw as Record<string, unknown>).guard_code);
        })
        .filter((item): item is string => Boolean(item))
    )
  );
}

function normalizedErrorCategories(results: Array<{ raw?: unknown }>) {
  return Array.from(
    new Set(
      results
        .map((result) => {
          if (!result.raw || typeof result.raw !== "object" || Array.isArray(result.raw)) return null;
          const normalized = (result.raw as Record<string, unknown>).normalized_error;
          if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
          return toText((normalized as Record<string, unknown>).category);
        })
        .filter((item): item is string => Boolean(item))
    )
  );
}

function buildProofForPaperOrLive(
  config: RunnerConfig,
  result: PaperExecutionRunResult,
  trace: TransportTrace
): RunnerPathProof {
  const transportWriteCount = trace.tradingCalls.length;
  const noSendCount = adapterNoSendCount(result.results);
  const guardCodes = noSendGuardCodes(result.results);
  const errorCategories = normalizedErrorCategories(result.results);
  const blockedBeforeBroker =
    result.decision.intents.length > 0 &&
    result.results.length === 0 &&
    transportWriteCount === 0 &&
    result.gate.verdict === "DENY";

  let expectation = "paper execution should simulate internally without any live transport write";
  let matchedExpectation = result.results.length > 0 && transportWriteCount === 0;

  if (config.mode === "LIVE_LIMITED" && config.scenario === "live_limited_block") {
    expectation = "LIVE_LIMITED should block before broker write when runtime proof is missing";
    matchedExpectation = blockedBeforeBroker;
  } else if (config.scenario === "live_limited_dry_run") {
    expectation = "LIVE_LIMITED dry-run should no-send every broker write with dry_run_enabled guard";
    matchedExpectation =
      result.results.length === result.decision.intents.length &&
      transportWriteCount === 0 &&
      noSendCount === result.decision.intents.length &&
      guardCodes.includes("dry_run_enabled");
  } else if (config.scenario === "live_limited_transport_missing") {
    expectation = "LIVE_LIMITED should no-send every broker write when trading transport is missing";
    matchedExpectation =
      result.results.length === result.decision.intents.length &&
      transportWriteCount === 0 &&
      noSendCount === result.decision.intents.length &&
      guardCodes.includes("trading_transport_unavailable");
  } else if (config.scenario === "live_limited_exchange_error") {
    expectation = "LIVE_LIMITED should surface normalized exchange errors when trading transport throws";
    matchedExpectation =
      result.results.length === result.decision.intents.length &&
      transportWriteCount === result.decision.intents.length &&
      errorCategories.includes("AUTH");
  } else if (config.scenario === "live_limited_validation_error") {
    expectation = "LIVE_LIMITED should surface normalized validation errors before a bad mapped request is sent";
    matchedExpectation =
      result.results.length === result.decision.intents.length &&
      transportWriteCount < result.results.length &&
      errorCategories.includes("VALIDATION");
  } else if (config.mode === "LIVE_LIMITED" || config.mode === "LIVE_FULL") {
    expectation = "live execution should reach adapter and emit a traced placeOrder write";
    matchedExpectation =
      result.decision.intents.length > 0 &&
      result.results.length > 0 &&
      transportWriteCount > 0 &&
      noSendCount === 0 &&
      result.gate.verdict !== "DENY";
  }

  return {
    runner: "runPaperExecution",
    scenario: config.scenario,
    mode: config.mode,
    gateVerdict: result.gate.verdict,
    gateAllowExecution: result.gate.allowExecution,
    gateAllowLiveExecution: result.gate.allowLiveExecution,
    decisionAction: result.decision.action,
    intentCount: result.decision.intents.length,
    resultCount: result.results.length,
    transportWriteCount,
    transportWriteAttempted: transportWriteCount > 0,
    adapterNoSendCount: noSendCount,
    noSendGuardCodes: guardCodes,
    normalizedErrorCategories: errorCategories,
    blockedBeforeBroker,
    shadowInvariantPassed: null,
    matchedExpectation,
    expectation,
  };
}

function buildProofForShadow(
  config: RunnerConfig,
  result: LiveShadowRunResult,
  trace: TransportTrace
): RunnerPathProof {
  const transportWriteCount = trace.tradingCalls.length;
  const matchedExpectation =
    result.verification.invariantPassed &&
    result.verification.noRealOrderPlacementObserved &&
    transportWriteCount === 0;

  return {
    runner: "runLiveShadowExecution",
    scenario: config.scenario,
    mode: config.mode,
    gateVerdict: result.gate.verdict,
    gateAllowExecution: result.gate.allowExecution,
    gateAllowLiveExecution: result.gate.allowLiveExecution,
    decisionAction: result.decision.action,
    intentCount: result.decision.intents.length,
    resultCount: 0,
    transportWriteCount,
    transportWriteAttempted: false,
    adapterNoSendCount: 0,
    noSendGuardCodes: [],
    normalizedErrorCategories: [],
    blockedBeforeBroker: result.gate.verdict === "DENY" && transportWriteCount === 0,
    shadowInvariantPassed: result.verification.invariantPassed,
    matchedExpectation,
    expectation: "LIVE_SHADOW should evaluate decisions without any broker write method",
  };
}

function buildPaperContext(config: RunnerConfig, auditRootDir: string): PaperExecutionContext {
  return {
    symbol: config.symbol,
    machineState: config.machineState,
    riskOverlay: config.riskOverlay,
    market: config.market,
    plannedEntry: config.plannedEntry,
    idempotency: {
      eventKey: config.market.eventKey ?? `${config.symbol}:${config.scenario}:${config.market.closeTs5m ?? nowMs()}`,
      candleKey: String(config.market.closeTs5m ?? nowMs()),
      processedKeys: [],
    },
    gateInput: {
      ...config.gateInput,
      allowLiveExecution: config.allowLiveExecution,
      killSwitchActive: config.killSwitchActive,
      caps: config.limitedCaps,
    },
    auditRootDir,
    auditFileName: config.auditFileName,
  };
}

function buildShadowContext(config: RunnerConfig, auditRootDir: string): LiveShadowContext {
  return {
    mode: config.mode,
    symbol: config.symbol,
    machineState: config.machineState,
    riskOverlay: config.riskOverlay,
    market: config.market,
    plannedEntry: config.plannedEntry,
    idempotency: {
      eventKey: config.market.eventKey ?? `${config.symbol}:${config.scenario}:${config.market.closeTs5m ?? nowMs()}`,
      candleKey: String(config.market.closeTs5m ?? nowMs()),
      processedKeys: [],
    },
    allowLiveExecution: config.allowLiveExecution,
    killSwitchActive: config.killSwitchActive,
    limitedCaps: config.limitedCaps,
    auditRootDir,
    auditFileName: config.auditFileName,
  };
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
      expectedMasked: auth.expectedMasked,
      receivedMasked: auth.receivedMasked,
    });
  }

  return json(200, {
    ok: true,
    route: "/api/internal/execution-runner",
    purpose: "Bind tradingModeGate to a real runtime runner path and prove block/allow via broker adapter traces",
    scenarios: [
      "paper_open",
      "live_shadow_open",
      "live_limited_block",
      "live_limited_allow",
      "live_limited_dry_run",
      "live_limited_transport_missing",
      "live_limited_exchange_error",
      "live_limited_validation_error",
    ],
    acceptedModes: ["PAPER", "LIVE_SHADOW", "LIVE_LIMITED", "LIVE_FULL"],
    exampleBody: {
      scenario: "live_limited_block",
      mode: "LIVE_LIMITED",
      symbol: "BTC-USDT",
      allowLiveExecution: true,
      gateInput: {
        runtimeProofComplete: false,
        canonicalConsistent: true,
        sourceFresh: true,
        derivativesFresh: true,
      },
    },
  });
}

export async function POST(req: NextRequest) {
  let body: RunnerRequest = {};
  try {
    body = (await req.json()) as RunnerRequest;
  } catch {
    body = {};
  }

  const operatorKillSwitch = await readKillSwitchState();
  const requestedKillSwitchActive = normalizeBool(body.killSwitchActive, false);
  const config = buildConfig(body, operatorKillSwitch.state.active);
  const killSwitch = buildKillSwitchResponse(operatorKillSwitch, {
    requestedActive: requestedKillSwitchActive,
    effectiveActive: config.killSwitchActive,
    source: "operator_runtime_state_with_request_fallback",
  });
  const trace: TransportTrace = {
    readOnlyCalls: [],
    tradingCalls: [],
  };
  const auditRootDir = path.resolve(process.cwd(), "tmp", "execution-runner");
  const auditLogger = ensureExecutionAuditLogger(null, {
    rootDir: auditRootDir,
    fileName: config.auditFileName,
  });
  const auditMode = inferAuditMode(config.mode, config.mode);
  const auditEventKey = config.market.eventKey ?? `${config.symbol}:${config.scenario}:${config.market.closeTs5m ?? nowMs()}`;
  const auditCandleKey = String(config.market.closeTs5m ?? nowMs());
  const auth = verifyAuth(req);
  if (!auth.ok) {
    await auditLogger.append(
      createAuditEvent("AUTH_REJECTED", {
        symbol: config.symbol,
        mode: auditMode,
        eventKey: auditEventKey,
        candleKey: auditCandleKey,
        payload: {
          route: "/api/internal/execution-runner",
          scenario: config.scenario,
          mode: config.mode,
          reason: auth.reason,
          expectedMasked: auth.expectedMasked,
          receivedMasked: auth.receivedMasked,
        },
      })
    );
    const audit = buildAuditEnvelope(await readAuditSummary(auditLogger.path), config);
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
      expectedMasked: auth.expectedMasked,
      receivedMasked: auth.receivedMasked,
      killSwitch,
      audit,
    });
  }

  await auditLogger.append(
    createAuditEvent("RUNNER_REQUESTED", {
      symbol: config.symbol,
      mode: auditMode,
      eventKey: auditEventKey,
      candleKey: auditCandleKey,
      payload: {
        route: "/api/internal/execution-runner",
        scenario: config.scenario,
        mode: config.mode,
        machineState: config.machineState,
        allowLiveExecution: config.allowLiveExecution,
        killSwitchActive: config.killSwitchActive,
        requestedKillSwitchActive,
        operatorKillSwitchActive: operatorKillSwitch.state.active,
        killSwitch,
        gateInput: config.gateInput,
      },
    })
  );

  try {
    if (config.mode === "PAPER") {
      const broker = new PaperBrokerAdapter();
      const result = await runPaperExecution(broker, buildPaperContext(config, auditRootDir));
      const proof = buildProofForPaperOrLive(config, result, trace);
      await auditLogger.append(
        createAuditEvent("RUNNER_COMPLETED", {
          symbol: config.symbol,
          mode: auditMode,
          eventKey: auditEventKey,
          candleKey: auditCandleKey,
          payload: {
            scenario: config.scenario,
            proof,
            auditPath: result.auditPath,
          },
        })
      );
      const audit = buildAuditEnvelope(await readAuditSummary(result.auditPath), config);

      return json(200, {
        ok: true,
        route: "/api/internal/execution-runner",
        config,
        killSwitch,
        proof,
        trace,
        audit,
        result,
      });
    }

    const transport = createTracingTransport(config, trace);
    const broker = new BingxBrokerAdapter({
      executionMode:
        config.mode === "LIVE_FULL"
          ? "LIVE_FULL"
          : config.mode === "LIVE_LIMITED"
            ? "LIVE_LIMITED"
            : "LIVE_SHADOW",
      allowLiveExecution: config.allowLiveExecution,
      dryRun: config.dryRun,
      transport,
    });

    if (config.mode === "LIVE_SHADOW") {
      const result = await runLiveShadowExecution(broker, buildShadowContext(config, auditRootDir));
      const proof = buildProofForShadow(config, result, trace);
      await auditLogger.append(
        createAuditEvent("RUNNER_COMPLETED", {
          symbol: config.symbol,
          mode: auditMode,
          eventKey: auditEventKey,
          candleKey: auditCandleKey,
          payload: {
            scenario: config.scenario,
            proof,
            auditPath: result.auditPath,
          },
        })
      );
      const audit = buildAuditEnvelope(await readAuditSummary(result.auditPath), config);

      return json(200, {
        ok: true,
        route: "/api/internal/execution-runner",
        config,
        killSwitch,
        proof,
        trace,
        audit,
        result,
      });
    }

    const result = await runPaperExecution(broker, buildPaperContext(config, auditRootDir));
    const proof = buildProofForPaperOrLive(config, result, trace);
    await auditLogger.append(
      createAuditEvent("RUNNER_COMPLETED", {
        symbol: config.symbol,
        mode: auditMode,
        eventKey: auditEventKey,
        candleKey: auditCandleKey,
        payload: {
          scenario: config.scenario,
          proof,
          auditPath: result.auditPath,
        },
      })
    );
    const audit = buildAuditEnvelope(await readAuditSummary(result.auditPath), config);

    return json(200, {
      ok: true,
      route: "/api/internal/execution-runner",
      config,
      killSwitch,
      proof,
      trace,
      audit,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "unknown runner error");
    await auditLogger.append(
      createAuditEvent("RUNNER_REJECTED", {
        symbol: config.symbol,
        mode: auditMode,
        eventKey: auditEventKey,
        candleKey: auditCandleKey,
        payload: {
          scenario: config.scenario,
          mode: config.mode,
          error: message,
        },
      })
    );
    const audit = buildAuditEnvelope(await readAuditSummary(auditLogger.path), config);
    return json(500, {
      ok: false,
      error: "execution_runner_failed",
      reason: message,
      config,
      killSwitch,
      trace,
      audit,
    });
  }
}
