export type RiskApprovalStatus = "APPROVED" | "BLOCKED" | "FROZEN" | "HARD_STOP";
export type RiskReasonSeverity = "info" | "warn" | "block" | "hard_stop";
export type RiskTruthStatus = "HEALTHY" | "DEGRADED" | "BROKEN" | "UNKNOWN";
export type RiskPositionState = "FLAT" | "OPEN" | "REDUCING" | "EXITING" | "UNKNOWN";
export type FailSafeMode = "NORMAL" | "DEGRADED" | "HARD_STOP" | "UNKNOWN";

export type RiskReason = {
  code: string;
  severity: RiskReasonSeverity;
  message: string;
};

export type RiskCaps = {
  maxRiskPerTradePct: number | null;
  maxDailyLossPct: number | null;
  maxConcurrentExposure: number | null;
  staleDataWarnSec: number | null;
  staleDataFreezeSec: number | null;
  derivativesStaleWarnSec: number | null;
  derivativesStaleFreezeSec: number | null;
  cooldownMs: number | null;
};

export type RiskFreshness = {
  tag?: string | null;
  ageSec?: number | null;
};

export type RiskMarkerProof = {
  all_match?: boolean | null;
  mismatches?: string[] | null;
  source_build_match?: boolean | null;
  source_runtime_match?: boolean | null;
  build_runtime_match?: boolean | null;
};

export type RiskFailSafe = {
  mode?: FailSafeMode | null;
  reasons?: string[] | null;
  should_freeze_trade_actions?: boolean | null;
  should_serve_public_view_only?: boolean | null;
  should_block_canonical_write?: boolean | null;
  should_block_legacy_public_status_write?: boolean | null;
  marker_proof?: RiskMarkerProof | null;
};

export type RiskTradeInput = {
  entryPrice?: number | null;
  stopPrice?: number | null;
  quantity?: number | null;
  notional?: number | null;
  equity?: number | null;
};

export type RiskPnlStats = {
  dailyRealizedPnl?: number | null;
  dailyRealizedPnlPct?: number | null;
  consecutiveLosses?: number | null;
};

export type RiskExposure = {
  activePositions?: number | null;
  sameSymbolOpen?: boolean | null;
  pendingEntryIntents?: number | null;
  hasProtection?: boolean | null;
  notionalExposure?: number | null;
  positionState?: RiskPositionState | null;
};

export type RiskContext = {
  failSafe?: RiskFailSafe | null;
  sourceFreshness?: RiskFreshness | null;
  derivativesFreshness?: RiskFreshness | null;
  markerProof?: RiskMarkerProof | null;
  canonicalPlanPresent?: boolean | null;
  canonicalConsistent?: boolean | null;
  executionConsistent?: boolean | null;
  persistError?: string | null;
  machineState?: string | null;
  planState?: string | null;
  exposure?: RiskExposure | null;
  trade?: RiskTradeInput | null;
  pnl?: RiskPnlStats | null;
  cooldownActive?: boolean | null;
  cooldownReason?: string | null;
  cooldownUntilTs?: number | null;
  killSwitchActive?: boolean | null;
  brokerMode?: string | null;
  caps?: Partial<RiskCaps> | null;
};

export type RiskOverlay = {
  status: RiskApprovalStatus;
  truthStatus: RiskTruthStatus;
  canOpenNewTrade: boolean;
  shouldFreezeTrading: boolean;
  shouldReduceRisk: boolean;
  shouldForceExit: boolean;
  reasons: RiskReason[];
  hardStopReasons: RiskReason[];
  warnings: RiskReason[];
  caps: RiskCaps;
  truthIntegrity: {
    canonicalPlanPresent: boolean;
    canonicalConsistent: boolean;
    markerProofConsistent: boolean;
    sourceFresh: boolean;
    derivativesFresh: boolean;
    executionConsistent: boolean;
    persistHealthy: boolean;
  };
  exposureSummary: {
    activePositions: number;
    sameSymbolOpen: boolean;
    pendingEntryIntents: number;
    hasProtection: boolean;
    positionState: RiskPositionState;
  };
  tradeRisk: {
    projectedRiskPct: number | null;
    projectedRiskAllowed: boolean;
  };
  dailyLoss: {
    dailyRealizedPnl: number | null;
    dailyRealizedPnlPct: number | null;
    dailyLossLimitHit: boolean;
  };
  cooldown: {
    active: boolean;
    reason: string | null;
    untilTs: number | null;
  };
};
