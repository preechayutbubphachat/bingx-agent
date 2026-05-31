import type { BrokerActionPermission, BrokerMode } from "../broker/types";
import type { FailSafeMode, RiskOverlay } from "../riskTypes";

export type TradingModeAction =
  | "ANALYZE"
  | "SYNC"
  | "OPEN"
  | "PROTECT"
  | "REDUCE"
  | "CLOSE"
  | "CANCEL";

export type TradingModeReasonSeverity = "info" | "warn" | "block" | "hard_stop";

export type TradingModeReason = {
  code: string;
  severity: TradingModeReasonSeverity;
  message: string;
};

export type TradingModeCaps = {
  maxConcurrentPositions?: number | null;
  maxOpenIntentCount?: number | null;
  maxOrderNotional?: number | null;
  maxTotalNotional?: number | null;
  symbolWhitelist?: string[] | null;
  orderTypeWhitelist?: string[] | null;
};

type ResolvedTradingModeCaps = {
  maxConcurrentPositions: number;
  maxOpenIntentCount: number;
  maxOrderNotional: number;
  maxTotalNotional: number;
  symbolWhitelist: string[];
  orderTypeWhitelist: string[];
};

export type TradingModeExposure = {
  activePositions?: number | null;
  pendingEntryIntents?: number | null;
  currentNotional?: number | null;
  requestNotional?: number | null;
  sameSymbolOpen?: boolean | null;
};

export type TradingModeGateInput = {
  mode: BrokerMode | string | null | undefined;
  action: TradingModeAction;
  symbol?: string | null;
  orderType?: string | null;
  failSafeMode?: FailSafeMode | string | null;
  riskOverlay?: RiskOverlay | null;
  killSwitchActive?: boolean | null;
  allowLiveExecution?: boolean | null;
  liveShadowOnly?: boolean | null;
  runtimeProofComplete?: boolean | null;
  canonicalConsistent?: boolean | null;
  sourceFresh?: boolean | null;
  derivativesFresh?: boolean | null;
  caps?: TradingModeCaps | null;
  exposure?: TradingModeExposure | null;
};

export type TradingModeGateResult = {
  mode: BrokerMode;
  action: TradingModeAction;
  allowStrategy: boolean;
  allowBrokerSync: boolean;
  allowExecution: boolean;
  allowLiveExecution: boolean;
  shadowOnly: boolean;
  actionPermission: BrokerActionPermission;
  verdict: "ALLOW" | "DENY" | "SIMULATE";
  blockingConditionIds: string[];
  proofRequirements: {
    runtimeProofComplete: boolean | null;
    canonicalConsistent: boolean | null;
  };
  freshnessStatus: {
    sourceFresh: boolean | null;
    derivativesFresh: boolean | null;
  };
  safetyEnvelope: {
    symbol: string | null;
    orderType: string | null;
    symbolWhitelisted: boolean | null;
    orderTypeWhitelisted: boolean | null;
    maxConcurrentPositions: number;
    maxOpenIntentCount: number;
    maxOrderNotional: number;
    maxTotalNotional: number;
  };
  reasons: TradingModeReason[];
};

const DEFAULT_LIMITED_CAPS: ResolvedTradingModeCaps = {
  maxConcurrentPositions: 1,
  maxOpenIntentCount: 2,
  maxOrderNotional: 250,
  maxTotalNotional: 500,
  symbolWhitelist: [],
  orderTypeWhitelist: [],
};

export function getDefaultLimitedCaps(): TradingModeCaps {
  return {
    maxConcurrentPositions: DEFAULT_LIMITED_CAPS.maxConcurrentPositions,
    maxOpenIntentCount: DEFAULT_LIMITED_CAPS.maxOpenIntentCount,
    maxOrderNotional: DEFAULT_LIMITED_CAPS.maxOrderNotional,
    maxTotalNotional: DEFAULT_LIMITED_CAPS.maxTotalNotional,
    symbolWhitelist: [...DEFAULT_LIMITED_CAPS.symbolWhitelist],
    orderTypeWhitelist: [...DEFAULT_LIMITED_CAPS.orderTypeWhitelist],
  };
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toBool(value: unknown): boolean {
  return value === true;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeMode(value: unknown): BrokerMode {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "PAPER") return "PAPER";
  if (raw === "LIVE_SHADOW") return "LIVE_SHADOW";
  if (raw === "LIVE_LIMITED") return "LIVE_LIMITED";
  if (raw === "LIVE_FULL") return "LIVE_FULL";
  return "READ_ONLY";
}

function normalizeFailSafeMode(value: unknown): FailSafeMode {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "NORMAL") return "NORMAL";
  if (raw === "DEGRADED") return "DEGRADED";
  if (raw === "HARD_STOP") return "HARD_STOP";
  return "UNKNOWN";
}

function reason(code: string, severity: TradingModeReasonSeverity, message: string): TradingModeReason {
  return { code, severity, message };
}

function mergeCaps(caps?: TradingModeCaps | null): ResolvedTradingModeCaps {
  return {
    maxConcurrentPositions: toFiniteNumber(caps?.maxConcurrentPositions) ?? DEFAULT_LIMITED_CAPS.maxConcurrentPositions,
    maxOpenIntentCount: toFiniteNumber(caps?.maxOpenIntentCount) ?? DEFAULT_LIMITED_CAPS.maxOpenIntentCount,
    maxOrderNotional: toFiniteNumber(caps?.maxOrderNotional) ?? DEFAULT_LIMITED_CAPS.maxOrderNotional,
    maxTotalNotional: toFiniteNumber(caps?.maxTotalNotional) ?? DEFAULT_LIMITED_CAPS.maxTotalNotional,
    symbolWhitelist: toStringArray(caps?.symbolWhitelist).map((item) => item.toUpperCase()),
    orderTypeWhitelist: toStringArray(caps?.orderTypeWhitelist).map((item) => item.toUpperCase()),
  };
}

function defaultPermission(mode: BrokerMode): BrokerActionPermission {
  if (mode === "PAPER") return "SIMULATE";
  if (mode === "LIVE_LIMITED" || mode === "LIVE_FULL") return "ALLOW";
  return "DENY";
}

function actionNeedsExecution(action: TradingModeAction) {
  return action !== "ANALYZE" && action !== "SYNC";
}

function actionNeedsOpenCapability(action: TradingModeAction) {
  return action === "OPEN";
}

function actionNeedsLive(action: TradingModeAction) {
  return action === "OPEN" || action === "PROTECT" || action === "REDUCE" || action === "CLOSE" || action === "CANCEL";
}

function isLimitedWriteAction(action: TradingModeAction) {
  return action === "OPEN" || action === "PROTECT" || action === "REDUCE" || action === "CLOSE" || action === "CANCEL";
}

function blockingConditionIds(reasons: TradingModeReason[]) {
  return reasons
    .filter((item) => item.severity === "block" || item.severity === "hard_stop")
    .map((item) => item.code);
}

function buildGateResult(
  input: TradingModeGateInput,
  mode: BrokerMode,
  caps: ResolvedTradingModeCaps,
  reasons: TradingModeReason[],
  args: {
    actionPermission: BrokerActionPermission;
    allowStrategy: boolean;
    allowBrokerSync: boolean;
    allowExecution: boolean;
    allowLiveExecution: boolean;
    shadowOnly: boolean;
  }
): TradingModeGateResult {
  const normalizedSymbol = String(input.symbol ?? "").trim().toUpperCase();
  const normalizedOrderType = String(input.orderType ?? "").trim().toUpperCase();
  const blocked = blockingConditionIds(reasons);

  return {
    mode,
    action: input.action,
    allowStrategy: args.allowStrategy,
    allowBrokerSync: args.allowBrokerSync,
    allowExecution: args.allowExecution,
    allowLiveExecution: args.allowLiveExecution,
    shadowOnly: args.shadowOnly,
    actionPermission: args.actionPermission,
    verdict:
      args.actionPermission === "SIMULATE" && args.allowExecution
        ? "SIMULATE"
        : args.allowExecution && blocked.length === 0
          ? "ALLOW"
          : "DENY",
    blockingConditionIds: blocked,
    proofRequirements: {
      runtimeProofComplete:
        input.runtimeProofComplete === null || input.runtimeProofComplete === undefined
          ? null
          : input.runtimeProofComplete === true,
      canonicalConsistent:
        input.canonicalConsistent === null || input.canonicalConsistent === undefined
          ? null
          : input.canonicalConsistent === true,
    },
    freshnessStatus: {
      sourceFresh: input.sourceFresh === null || input.sourceFresh === undefined ? null : input.sourceFresh === true,
      derivativesFresh:
        input.derivativesFresh === null || input.derivativesFresh === undefined
          ? null
          : input.derivativesFresh === true,
    },
    safetyEnvelope: {
      symbol: normalizedSymbol || null,
      orderType: normalizedOrderType || null,
      symbolWhitelisted:
        caps.symbolWhitelist.length === 0 ? null : Boolean(normalizedSymbol && caps.symbolWhitelist.includes(normalizedSymbol)),
      orderTypeWhitelisted:
        caps.orderTypeWhitelist.length === 0
          ? null
          : Boolean(normalizedOrderType && caps.orderTypeWhitelist.includes(normalizedOrderType)),
      maxConcurrentPositions: caps.maxConcurrentPositions,
      maxOpenIntentCount: caps.maxOpenIntentCount,
      maxOrderNotional: caps.maxOrderNotional,
      maxTotalNotional: caps.maxTotalNotional,
    },
    reasons,
  };
}

export function evaluateTradingModeGate(input: TradingModeGateInput): TradingModeGateResult {
  const mode = normalizeMode(input.mode);
  const failSafeMode = normalizeFailSafeMode(input.failSafeMode ?? input.riskOverlay?.hardStopReasons?.[0]?.code);
  const caps = mergeCaps(input.caps);
  const reasons: TradingModeReason[] = [];

  const allowStrategy = true;
  const allowBrokerSync = mode !== "READ_ONLY" || input.action === "SYNC" || input.action === "ANALYZE";

  let actionPermission = defaultPermission(mode);
  let allowExecution = actionNeedsExecution(input.action) ? actionPermission !== "DENY" : true;
  let allowLiveExecution =
    (mode === "LIVE_LIMITED" || mode === "LIVE_FULL") &&
    actionNeedsLive(input.action) &&
    toBool(input.allowLiveExecution);
  let shadowOnly = mode === "LIVE_SHADOW" || toBool(input.liveShadowOnly);

  if (input.action === "ANALYZE") {
    return buildGateResult(input, mode, caps, [reason("strategy_analysis_allowed", "info", "strategy analysis is allowed in every trading mode")], {
      allowStrategy,
      allowBrokerSync: true,
      allowExecution: false,
      allowLiveExecution: false,
      shadowOnly,
      actionPermission: "DENY",
    });
  }

  if (toBool(input.killSwitchActive)) {
    reasons.push(reason("kill_switch_active", "hard_stop", "kill switch overrides trading mode and freezes execution"));
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution: false,
      allowLiveExecution: false,
      shadowOnly,
      actionPermission: "DENY",
    });
  }

  if (
    failSafeMode === "HARD_STOP" ||
    input.riskOverlay?.status === "HARD_STOP" ||
    input.riskOverlay?.shouldFreezeTrading === true
  ) {
    reasons.push(
      reason("fail_safe_override", "hard_stop", "fail-safe or risk freeze overrides trading mode and blocks execution")
    );
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution: false,
      allowLiveExecution: false,
      shadowOnly,
      actionPermission: "DENY",
    });
  }

  if (mode === "READ_ONLY") {
    reasons.push(reason("read_only_mode", "block", "READ_ONLY mode allows analysis and sync only"));
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution: false,
      allowLiveExecution: false,
      shadowOnly,
      actionPermission: "DENY",
    });
  }

  if (mode === "PAPER") {
    reasons.push(reason("paper_mode", "info", "PAPER mode simulates execution and never falls through to live"));
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution,
      allowLiveExecution: false,
      shadowOnly: false,
      actionPermission: "SIMULATE",
    });
  }

  if (mode === "LIVE_SHADOW") {
    reasons.push(reason("live_shadow_mode", "info", "LIVE_SHADOW runs decision flow but blocks real execution"));
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution: false,
      allowLiveExecution: false,
      shadowOnly: true,
      actionPermission: "DENY",
    });
  }

  if (!toBool(input.allowLiveExecution)) {
    reasons.push(
      reason("live_execution_guard_disabled", "block", "explicit live execution guard is disabled for this mode")
    );
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution: false,
      allowLiveExecution: false,
      shadowOnly,
      actionPermission: "DENY",
    });
  }

  if (mode === "LIVE_LIMITED") {
    const activePositions = Math.max(0, toFiniteNumber(input.exposure?.activePositions) ?? 0);
    const pendingEntryIntents = Math.max(0, toFiniteNumber(input.exposure?.pendingEntryIntents) ?? 0);
    const currentNotional = Math.max(0, toFiniteNumber(input.exposure?.currentNotional) ?? 0);
    const requestNotional = Math.max(0, toFiniteNumber(input.exposure?.requestNotional) ?? 0);
    const normalizedSymbol = String(input.symbol ?? "").trim().toUpperCase();
    const normalizedOrderType = String(input.orderType ?? "").trim().toUpperCase();

    if (isLimitedWriteAction(input.action)) {
      if (input.runtimeProofComplete !== true) {
        reasons.push(
          reason("runtime_proof_required", "hard_stop", "LIVE_LIMITED requires runtime truth proof before any live write action")
        );
      }

      if (input.canonicalConsistent === false) {
        reasons.push(
          reason("canonical_mismatch_block", "hard_stop", "LIVE_LIMITED blocked because canonical consistency is false")
        );
      }

      if (input.sourceFresh === false || input.derivativesFresh === false) {
        reasons.push(
          reason("stale_data_block", "hard_stop", "LIVE_LIMITED blocked because source or derivatives freshness failed")
        );
      }

      if (caps.symbolWhitelist.length > 0 && !caps.symbolWhitelist.includes(normalizedSymbol)) {
        reasons.push(
          reason("symbol_whitelist_block", "block", "LIVE_LIMITED blocked because symbol is outside the allowed whitelist")
        );
      }

      if (caps.orderTypeWhitelist.length > 0 && normalizedOrderType && !caps.orderTypeWhitelist.includes(normalizedOrderType)) {
        reasons.push(
          reason("order_type_whitelist_block", "block", "LIVE_LIMITED blocked because order type is outside the allowed whitelist")
        );
      }
    }

    if (actionNeedsOpenCapability(input.action)) {
      if (activePositions >= caps.maxConcurrentPositions) {
        reasons.push(
          reason("limited_max_positions", "block", "LIVE_LIMITED blocked opening because max concurrent positions is reached")
        );
      }
      if (pendingEntryIntents >= caps.maxOpenIntentCount) {
        reasons.push(
          reason("limited_max_open_intents", "block", "LIVE_LIMITED blocked opening because pending entry intents is above cap")
        );
      }
      if (requestNotional > caps.maxOrderNotional) {
        reasons.push(
          reason("limited_order_notional", "block", "LIVE_LIMITED blocked opening because request notional exceeds per-order cap")
        );
      }
      if (currentNotional + requestNotional > caps.maxTotalNotional) {
        reasons.push(
          reason("limited_total_notional", "block", "LIVE_LIMITED blocked opening because total notional would exceed cap")
        );
      }
    }

    if (reasons.some((item) => item.severity === "block" || item.severity === "hard_stop")) {
      return buildGateResult(input, mode, caps, reasons, {
        allowStrategy,
        allowBrokerSync,
        allowExecution: false,
        allowLiveExecution: false,
        shadowOnly,
        actionPermission: "DENY",
      });
    }

    reasons.push(reason("live_limited_allowed", "info", "LIVE_LIMITED allowed under current caps and guards"));
    return buildGateResult(input, mode, caps, reasons, {
      allowStrategy,
      allowBrokerSync,
      allowExecution,
      allowLiveExecution,
      shadowOnly,
      actionPermission: "ALLOW",
    });
  }

  reasons.push(reason("live_full_allowed", "info", "LIVE_FULL allowed because explicit live guard is enabled"));
  return buildGateResult(input, mode, caps, reasons, {
    allowStrategy,
    allowBrokerSync,
    allowExecution,
    allowLiveExecution,
    shadowOnly,
    actionPermission: "ALLOW",
  });
}

export function canExecuteTradingAction(input: TradingModeGateInput): boolean {
  return evaluateTradingModeGate(input).allowExecution;
}

export function canPlaceLiveOrder(input: TradingModeGateInput): boolean {
  const result = evaluateTradingModeGate(input);
  return result.allowExecution && result.allowLiveExecution && result.actionPermission === "ALLOW";
}
