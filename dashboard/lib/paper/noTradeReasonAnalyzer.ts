export type NoTradeCategory =
  | "ACTIVATION"
  | "GRID_EXPOSURE"
  | "GRID_REGRID"
  | "GRID_PRICE"
  | "TREND_SETUP"
  | "TREND_GATE"
  | "DIAGNOSTICS_GAP";

export type NoTradeSeverity = "BLOCKER" | "CONTRIBUTING" | "INFO";

export type NoTradeStatus =
  | "NO_DIAGNOSTICS"
  | "BOTH_PATHS_BLOCKED"
  | "GRID_BLOCKED_ONLY"
  | "TREND_BLOCKED_ONLY"
  | "NO_STRATEGY_BLOCKER";

export interface NoTradeReason {
  code: string;
  category: NoTradeCategory;
  severity: NoTradeSeverity;
  label: string;
  evidence: string[];
  blocksGrid: boolean;
  blocksTrend: boolean;
}

export interface NoTradeReasonAnalysis {
  schemaVersion: 1;
  source: "NO_TRADE_REASON_ANALYZER_V1";
  tag: string;
  status: NoTradeStatus;
  activationAllowed: false;
  reviewOnly: true;
  activationBlocked: boolean;
  gridBlocked: boolean;
  trendBlocked: boolean;
  diagnosticsGap: boolean;
  primaryReason: { code: string; category: NoTradeCategory; label: string } | null;
  reasons: NoTradeReason[];
  counters: {
    paperNoTradeCount: number;
    regridCandidateCount: number;
  };
  context: {
    priceVsGrid: string | null;
    paperLoopState: string | null;
    dynamicGridStatus: string | null;
    dynamicGridReason: string | null;
    regridReadinessStatus: string | null;
    trendStrategyStatus: string | null;
    trendArmGateStatus: string | null;
  };
  notes: string[];
  nextReviewAction: string;
}

export interface NoTradeReasonAnalysisInput {
  noTradeDiagnostics?: unknown;
  noTradeReasons?: unknown;
  runtimeMonitor?: unknown;
  dynamicGrid?: unknown;
  regridReadiness?: unknown;
  priceVsGrid?: unknown;
  paperLoopState?: unknown;
  trendStrategy?: unknown;
  trendManualPaperArmGate?: unknown;
  trendManualPaperArmGateRaw?: unknown;
  trendManualPaperArmGateEffective?: unknown;
  trendPaperExecutionPreflight?: unknown;
  trendPaperExecutionEngine?: unknown;
  activationAllowed?: unknown;
  paperActivationAllowed?: unknown;
  liveActivationAllowed?: unknown;
}

type MutableReason = Omit<NoTradeReason, "evidence"> & { evidence: string[] };

const GRID_EXPOSURE_STATUS = "PAUSE_EXPOSURE_LIMIT";
const READY_STATUSES = new Set(["READY", "PASS", "ACTIVE", "SETUP_READY", "ARMED", "OPERATOR_ARMED_PAPER_ONLY"]);

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstObject(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    const object = objectOrEmpty(value);
    if (Object.keys(object).length > 0) return object;
  }
  return {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayOfStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        const obj = objectOrEmpty(item);
        return stringOrNull(obj.id) ?? stringOrNull(obj.code) ?? stringOrNull(obj.reason);
      })
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizeCode(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function statusText(value: unknown): string | null {
  return stringOrNull(value)?.toUpperCase() ?? null;
}

function hasInput(input: NoTradeReasonAnalysisInput): boolean {
  return Object.values(input).some((value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

function addReason(reasons: MutableReason[], reason: MutableReason): void {
  const existing = reasons.find((item) => item.code === reason.code);
  if (existing) {
    existing.evidence = Array.from(new Set([...existing.evidence, ...reason.evidence]));
    existing.blocksGrid ||= reason.blocksGrid;
    existing.blocksTrend ||= reason.blocksTrend;
    return;
  }
  reasons.push(reason);
}

function isReadyStatus(value: string | null): boolean {
  return value != null && READY_STATUSES.has(value);
}

function buildTag(status: NoTradeStatus): string {
  if (status === "BOTH_PATHS_BLOCKED") return "D5_4_NO_TRADE_OVERDETERMINED_BOTH_PATHS_BLOCKED";
  return `D5_4_NO_TRADE_${status}`;
}

function nextActionForStatus(status: NoTradeStatus, diagnosticsGap: boolean): string {
  if (status === "NO_DIAGNOSTICS") return "restore_no_trade_diagnostics_before_review";
  if (diagnosticsGap) return "repair_no_trade_diagnostics_then_review_grid_and_trend_blockers";
  if (status === "BOTH_PATHS_BLOCKED") return "review_grid_exposure_guard_and_trend_gate_without_activation";
  if (status === "GRID_BLOCKED_ONLY") return "review_grid_exposure_and_regrid_readiness_without_parameter_change";
  if (status === "TREND_BLOCKED_ONLY") return "review_trend_setup_gate_without_activation";
  return "continue_observation_no_strategy_blocker_identified";
}

function primaryReasonOf(reasons: NoTradeReason[]): NoTradeReason | null {
  const severityRank: Record<NoTradeSeverity, number> = { BLOCKER: 0, CONTRIBUTING: 1, INFO: 2 };
  const categoryRank: Record<NoTradeCategory, number> = {
    GRID_EXPOSURE: 0,
    TREND_SETUP: 1,
    ACTIVATION: 2,
    GRID_REGRID: 3,
    TREND_GATE: 4,
    GRID_PRICE: 5,
    DIAGNOSTICS_GAP: 6,
  };
  return [...reasons].sort((a, b) => {
    const severity = severityRank[a.severity] - severityRank[b.severity];
    if (severity !== 0) return severity;
    const category = categoryRank[a.category] - categoryRank[b.category];
    if (category !== 0) return category;
    return a.code.localeCompare(b.code);
  })[0] ?? null;
}

export function evaluateNoTradeReasonAnalysis(input: NoTradeReasonAnalysisInput | null | undefined): NoTradeReasonAnalysis {
  const sourceInput = input ?? {};
  const noTradeDiagnostics = objectOrEmpty(sourceInput.noTradeDiagnostics);
  const runtimeMonitor = objectOrEmpty(sourceInput.runtimeMonitor);
  const dynamicGrid = objectOrEmpty(sourceInput.dynamicGrid);
  const regridReadiness = objectOrEmpty(sourceInput.regridReadiness);
  const trendStrategy = objectOrEmpty(sourceInput.trendStrategy);
  const trendArmGate = firstObject(
    sourceInput.trendManualPaperArmGateEffective,
    sourceInput.trendManualPaperArmGate,
    sourceInput.trendManualPaperArmGateRaw
  );
  const trendPreflight = objectOrEmpty(sourceInput.trendPaperExecutionPreflight);
  const trendEngine = objectOrEmpty(sourceInput.trendPaperExecutionEngine);

  const dynamicGridStatus = statusText(dynamicGrid.status);
  const dynamicGridReason = stringOrNull(dynamicGrid.reason);
  const regridStatus = statusText(regridReadiness.status);
  const trendStatus = statusText(trendStrategy.status);
  const trendArmStatus = statusText(trendArmGate.status);
  const priceVsGrid = statusText(sourceInput.priceVsGrid);
  const paperLoopState = statusText(sourceInput.paperLoopState);
  const noTradeReasons = arrayOfStrings(sourceInput.noTradeReasons);
  const diagnosticsStatus = statusText(noTradeDiagnostics.status);
  const hasNoTradeLogs = boolOrNull(noTradeDiagnostics.hasNoTradeLogs);
  const paperNoTradeCount = numberOrZero(runtimeMonitor.paperNoTradeCount);
  const regridCandidateCount = numberOrZero(runtimeMonitor.regridCandidateCount);

  const reasons: MutableReason[] = [];
  const anyInput = hasInput(sourceInput);
  const activationSignals = [
    sourceInput.activationAllowed,
    sourceInput.paperActivationAllowed,
    sourceInput.liveActivationAllowed,
    runtimeMonitor.activationAllowed,
    trendArmGate.paperActivationAllowed,
    trendArmGate.liveActivationAllowed,
    trendPreflight.paperActivationAllowed,
    trendPreflight.liveActivationAllowed,
    trendEngine.paperActivationAllowed,
    trendEngine.liveActivationAllowed,
  ];
  const activationBlocked = activationSignals.some((signal) => signal === false);

  if (!anyInput) {
    return {
      schemaVersion: 1,
      source: "NO_TRADE_REASON_ANALYZER_V1",
      tag: buildTag("NO_DIAGNOSTICS"),
      status: "NO_DIAGNOSTICS",
      activationAllowed: false,
      reviewOnly: true,
      activationBlocked: true,
      gridBlocked: false,
      trendBlocked: false,
      diagnosticsGap: true,
      primaryReason: null,
      reasons: [],
      counters: { paperNoTradeCount: 0, regridCandidateCount: 0 },
      context: {
        priceVsGrid: null,
        paperLoopState: null,
        dynamicGridStatus: null,
        dynamicGridReason: null,
        regridReadinessStatus: null,
        trendStrategyStatus: null,
        trendArmGateStatus: null,
      },
      notes: ["No diagnostics input was available; review-only fail-closed summary."],
      nextReviewAction: nextActionForStatus("NO_DIAGNOSTICS", true),
    };
  }

  const diagnosticsGap = diagnosticsStatus === "MISSING"
    || hasNoTradeLogs === false
    || noTradeReasons.map((reason) => reason.toLowerCase()).includes("data_missing");

  if (activationBlocked) {
    addReason(reasons, {
      code: "ACTIVATION_NOT_ALLOWED",
      category: "ACTIVATION",
      severity: "BLOCKER",
      label: "Activation is blocked by safety diagnostics",
      evidence: ["activationAllowed/paper/live flag is false"],
      blocksGrid: true,
      blocksTrend: true,
    });
  }

  if (dynamicGridStatus === GRID_EXPOSURE_STATUS) {
    addReason(reasons, {
      code: "GRID_EXPOSURE_GUARD_PAUSE",
      category: "GRID_EXPOSURE",
      severity: "BLOCKER",
      label: "Grid exposure guard paused new grid entries",
      evidence: [dynamicGridReason ?? dynamicGridStatus],
      blocksGrid: true,
      blocksTrend: false,
    });
  }

  if (regridStatus && !isReadyStatus(regridStatus)) {
    addReason(reasons, {
      code: "REGRID_NOT_READY",
      category: "GRID_REGRID",
      severity: "BLOCKER",
      label: "Regrid readiness is not ready",
      evidence: [regridStatus],
      blocksGrid: true,
      blocksTrend: false,
    });
  }

  for (const gate of arrayOfStrings(regridReadiness.failedGates)) {
    addReason(reasons, {
      code: normalizeCode(gate),
      category: "GRID_REGRID",
      severity: "CONTRIBUTING",
      label: `Regrid gate failed: ${gate}`,
      evidence: [gate],
      blocksGrid: true,
      blocksTrend: false,
    });
  }

  if (priceVsGrid === "BELOW_GRID" || priceVsGrid === "ABOVE_GRID") {
    addReason(reasons, {
      code: priceVsGrid === "BELOW_GRID" ? "PRICE_BELOW_GRID" : "PRICE_ABOVE_GRID",
      category: "GRID_PRICE",
      severity: "CONTRIBUTING",
      label: priceVsGrid === "BELOW_GRID" ? "Price is below the grid" : "Price is above the grid",
      evidence: [priceVsGrid],
      blocksGrid: true,
      blocksTrend: false,
    });
  }

  if (trendStatus && !isReadyStatus(trendStatus)) {
    addReason(reasons, {
      code: trendStatus === "INVALIDATED" ? "TREND_INVALIDATED" : `TREND_${normalizeCode(trendStatus)}`,
      category: "TREND_SETUP",
      severity: "BLOCKER",
      label: `Trend setup status is ${trendStatus}`,
      evidence: [trendStatus],
      blocksGrid: false,
      blocksTrend: true,
    });
  }

  if (trendArmStatus && !isReadyStatus(trendArmStatus)) {
    addReason(reasons, {
      code: "TREND_ARM_GATE_NOT_READY",
      category: "TREND_GATE",
      severity: "BLOCKER",
      label: "Trend manual paper arm gate is not ready",
      evidence: [trendArmStatus],
      blocksGrid: false,
      blocksTrend: true,
    });
  }

  for (const condition of arrayOfStrings(trendArmGate.failedConditions)) {
    addReason(reasons, {
      code: `TREND_${normalizeCode(condition)}`,
      category: "TREND_GATE",
      severity: "CONTRIBUTING",
      label: `Trend gate condition failed: ${condition}`,
      evidence: [condition],
      blocksGrid: false,
      blocksTrend: true,
    });
  }

  for (const failedInput of arrayOfStrings(trendPreflight.failedInputs)) {
    addReason(reasons, {
      code: `PREFLIGHT_${normalizeCode(failedInput)}`,
      category: "TREND_GATE",
      severity: "CONTRIBUTING",
      label: `Trend preflight input failed: ${failedInput}`,
      evidence: [failedInput],
      blocksGrid: false,
      blocksTrend: true,
    });
  }

  const engineReason = stringOrNull(trendEngine.lastReason) ?? stringOrNull(trendEngine.reason);
  if (engineReason && engineReason !== "NO_ACTION") {
    addReason(reasons, {
      code: `ENGINE_${normalizeCode(engineReason)}`,
      category: "TREND_GATE",
      severity: "CONTRIBUTING",
      label: `Trend engine reason: ${engineReason}`,
      evidence: [engineReason],
      blocksGrid: false,
      blocksTrend: true,
    });
  }

  if (diagnosticsGap) {
    addReason(reasons, {
      code: "NATIVE_NO_TRADE_DIAGNOSTICS_GAP",
      category: "DIAGNOSTICS_GAP",
      severity: "INFO",
      label: "No-trade diagnostics are missing or incomplete",
      evidence: [
        diagnosticsStatus ? `status=${diagnosticsStatus}` : "status=unknown",
        hasNoTradeLogs === false ? "hasNoTradeLogs=false" : "hasNoTradeLogs=unknown",
        noTradeReasons.length ? `reasons=${noTradeReasons.join(",")}` : "reasons=unknown",
      ],
      blocksGrid: false,
      blocksTrend: false,
    });
  }

  const gridBlocked = reasons.some((reason) => reason.severity === "BLOCKER" && reason.blocksGrid);
  const trendBlocked = reasons.some((reason) => reason.severity === "BLOCKER" && reason.blocksTrend);
  const status: NoTradeStatus = !anyInput
    ? "NO_DIAGNOSTICS"
    : gridBlocked && trendBlocked
      ? "BOTH_PATHS_BLOCKED"
      : gridBlocked
        ? "GRID_BLOCKED_ONLY"
        : trendBlocked
          ? "TREND_BLOCKED_ONLY"
          : "NO_STRATEGY_BLOCKER";
  const primary = primaryReasonOf(reasons);
  const notes = [
    "Review-only explanation; does not change grid or trend behavior.",
    activationBlocked
      ? "Activation remains blocked; this is a flag, not the headline status."
      : "No activation flag blocker was found in the provided diagnostics.",
  ];
  if (diagnosticsGap) notes.push("Native no-trade diagnostics are incomplete; runtime counters may still show no-trade activity.");
  if (status === "NO_STRATEGY_BLOCKER") notes.push("No grid or trend blocker was identified from the provided diagnostics.");

  return {
    schemaVersion: 1,
    source: "NO_TRADE_REASON_ANALYZER_V1",
    tag: buildTag(status),
    status,
    activationAllowed: false,
    reviewOnly: true,
    activationBlocked,
    gridBlocked,
    trendBlocked,
    diagnosticsGap,
    primaryReason: primary ? { code: primary.code, category: primary.category, label: primary.label } : null,
    reasons,
    counters: { paperNoTradeCount, regridCandidateCount },
    context: {
      priceVsGrid,
      paperLoopState,
      dynamicGridStatus,
      dynamicGridReason,
      regridReadinessStatus: regridStatus,
      trendStrategyStatus: trendStatus,
      trendArmGateStatus: trendArmStatus,
    },
    notes,
    nextReviewAction: nextActionForStatus(status, diagnosticsGap),
  };
}
