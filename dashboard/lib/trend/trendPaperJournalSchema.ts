// dashboard/lib/trend/trendPaperJournalSchema.ts
// Phase T-3 — trend_paper_journal schema lock + pure dry-run validator.
// PURE: no file I/O, no appendFile/writeFile, no order, no fill, no execution path.
// Validates the SHAPE of a future trend paper journal event. Writing is a later T-3 step.

export const TREND_PAPER_JOURNAL_SCHEMA_VERSION = "trend-paper-journal/1";

export type TrendPaperEventType =
  | "TREND_PAPER_ENTRY"
  | "TREND_PAPER_PARTIAL"
  | "TREND_PAPER_EXIT"
  | "TREND_PAPER_CANCEL"
  | "TREND_PAPER_INVALIDATED";

/** A closing event = produces a closed-trade result (rMultiple / netPnl). */
const CLOSING_EVENTS: TrendPaperEventType[] = ["TREND_PAPER_EXIT", "TREND_PAPER_INVALIDATED"];
const NON_CLOSING_EVENTS: TrendPaperEventType[] = ["TREND_PAPER_ENTRY", "TREND_PAPER_PARTIAL", "TREND_PAPER_CANCEL"];

export interface TrendPaperJournalEvent {
  schemaVersion: string;
  ts: number | string;
  eventType: TrendPaperEventType;
  epochId: string;
  setupId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  fillPricePaper: number | null;
  quantityPaper: number | null;
  riskAmountPaper: number | null;
  rMultiple: number | null;
  grossPnlPaper: number | null;
  feeEstimate: number | null;
  slippageEstimate: number | null;
  netPnlPaper: number | null;
  exitReason: string | null;
  oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE";
  countTowardGridClosedCycles: false;
  countTowardTrendEvidence: boolean;
  liveActivationAllowed: false;

  // ---- T-3H-2 enrichment (OPTIONAL — analysis context only, never affects safety invariants) ----
  positionId?: string;
  statusAfter?: string;
  entryId?: string | null;
  sessionId?: string | null;
  paperOnly?: true;
  exchangeOrderAllowed?: false;
  createdAt?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  holdTimeMs?: number | null;
  holdTimeMinutes?: number | null;
  realizedR?: number | null;
  realizedPnlPaper?: number | null;
  /** max favorable / adverse excursion (R). null until the runner tracks running extremes — gap, do not fake. */
  mfeR?: number | null;
  maeR?: number | null;
  initialRiskR?: number | null;
  initialRiskDistance?: number | null;
  rawGateStatus?: string | null;
  effectiveGateStatus?: string | null;
  gateReason?: string | null;
  regimeAtEvent?: string | null;
  regimeDirection?: string | null;
  sessionAtEvent?: string | null;
  adx?: number | null;
  atr?: number | null;
  rsi?: number | null;
  bollingerBbw?: number | null;
  trendZoneContext?: unknown;
  sourceRoute?: string | null;
  runnerId?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

// fields required for ALL events
const BASE_REQUIRED = ["schemaVersion", "ts", "eventType", "epochId", "setupId", "symbol", "direction", "oldExposurePolicy"];
// numeric setup fields required when an order context exists (entry/partial/exit/invalidated)
const SETUP_NUMERIC = ["entry", "stopLoss", "takeProfit1"];
// closing events must carry result fields
const CLOSING_REQUIRED = ["fillPricePaper", "quantityPaper", "riskAmountPaper", "rMultiple", "grossPnlPaper", "feeEstimate", "slippageEstimate", "netPnlPaper", "exitReason"];
// entry event must carry fill context
const ENTRY_REQUIRED = ["fillPricePaper", "quantityPaper", "riskAmountPaper"];

export function validateTrendPaperJournalEvent(event: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!event || typeof event !== "object") {
    return { valid: false, errors: ["event_is_not_an_object"], warnings };
  }
  const e = event as Record<string, unknown>;

  // base required
  for (const f of BASE_REQUIRED) {
    if (!present(e[f])) errors.push(`missing_required_field:${f}`);
  }

  // schema version
  if (present(e.schemaVersion) && e.schemaVersion !== TREND_PAPER_JOURNAL_SCHEMA_VERSION) {
    warnings.push(`schema_version_mismatch:${String(e.schemaVersion)}`);
  }

  // eventType valid
  const eventType = e.eventType as TrendPaperEventType;
  const allTypes = [...CLOSING_EVENTS, ...NON_CLOSING_EVENTS];
  if (!allTypes.includes(eventType)) {
    errors.push(`invalid_event_type:${String(e.eventType)}`);
  }

  // direction
  if (e.direction !== "LONG" && e.direction !== "SHORT") {
    errors.push(`invalid_direction:${String(e.direction)}`);
  }

  // ===== safety invariants (hard) =====
  if (e.countTowardGridClosedCycles !== false) {
    errors.push("count_toward_grid_closed_cycles_must_be_false");
  }
  if (e.liveActivationAllowed !== false) {
    errors.push("live_activation_allowed_must_be_false");
  }
  if (e.oldExposurePolicy !== "QUARANTINE_OLD_GRID_EXPOSURE") {
    errors.push("old_exposure_policy_must_be_quarantine_old_grid_exposure");
  }
  // T-3H-2: optional enrichment flags, when present, must remain paper-safe
  if (e.exchangeOrderAllowed === true) errors.push("exchange_order_allowed_must_be_false");
  if (e.paperOnly === false) errors.push("paper_only_must_be_true");

  // countTowardTrendEvidence may be true ONLY on closing events
  if (e.countTowardTrendEvidence === true && !CLOSING_EVENTS.includes(eventType)) {
    errors.push("count_toward_trend_evidence_true_only_after_closed_trade");
  }
  if (typeof e.countTowardTrendEvidence !== "boolean") {
    errors.push("missing_required_field:countTowardTrendEvidence");
  }

  // setup numeric fields required for entry/partial/closing
  if (eventType === "TREND_PAPER_ENTRY" || eventType === "TREND_PAPER_PARTIAL" || CLOSING_EVENTS.includes(eventType)) {
    for (const f of SETUP_NUMERIC) {
      if (!isFiniteNum(e[f])) errors.push(`missing_or_invalid_numeric:${f}`);
    }
  }

  // entry-specific
  if (eventType === "TREND_PAPER_ENTRY") {
    for (const f of ENTRY_REQUIRED) {
      if (!isFiniteNum(e[f])) errors.push(`missing_or_invalid_numeric:${f}`);
    }
  }

  // closing-specific (result fields)
  if (CLOSING_EVENTS.includes(eventType)) {
    for (const f of CLOSING_REQUIRED) {
      if (f === "exitReason") {
        if (!present(e[f])) errors.push(`missing_required_field:${f}`);
      } else if (!isFiniteNum(e[f])) {
        errors.push(`missing_or_invalid_numeric:${f}`);
      }
    }
  }

  // cancel: no PnL/R, must not claim trend evidence
  if (eventType === "TREND_PAPER_CANCEL") {
    if (e.countTowardTrendEvidence === true) errors.push("cancel_must_not_count_trend_evidence");
    if (!present(e.exitReason)) warnings.push("cancel_should_have_exit_reason");
  }

  // numeric sanity (when present)
  if (isFiniteNum(e.feeEstimate) && e.feeEstimate < 0) errors.push("fee_estimate_negative");
  if (isFiniteNum(e.slippageEstimate) && e.slippageEstimate < 0) errors.push("slippage_estimate_negative");
  if (isFiniteNum(e.quantityPaper) && e.quantityPaper <= 0) errors.push("quantity_paper_must_be_positive");
  if (isFiniteNum(e.riskAmountPaper) && e.riskAmountPaper <= 0) errors.push("risk_amount_paper_must_be_positive");

  // PnL/R consistency on closing events
  if (CLOSING_EVENTS.includes(eventType) && isFiniteNum(e.rMultiple) && isFiniteNum(e.netPnlPaper)) {
    const rSign = Math.sign(e.rMultiple);
    const pnlSign = Math.sign(e.netPnlPaper);
    if (rSign !== 0 && pnlSign !== 0 && rSign !== pnlSign) {
      warnings.push("rmultiple_netpnl_sign_mismatch");
    }
  }

  // takeProfit2 optional
  if (!present(e.takeProfit2)) warnings.push("take_profit2_absent_optional");

  return { valid: errors.length === 0, errors, warnings };
}
