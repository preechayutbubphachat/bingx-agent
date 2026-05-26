export type StepStatus =
  | "LOCKED"
  | "WAITING"
  | "CONFIRMED"
  | "FAILED"
  | "SKIPPED"
  | "DONE"
  | "WARN";

export type EngineStepStatus = "WAITING" | "PASS" | "WARN" | "FAIL" | "DONE";

export type StepSetKey =
  | "GRID_SWEEP_PIPELINE"
  | "BREAKOUT_SWITCH_MODE"
  | "MODE_LOCKED_NO_TRADE"
  | "MODE_LOCKED_TREND"
  | "OB_GATE_STEPSET"
  | "TREND_UP_STEPSET"
  | "TREND_DOWN_STEPSET"
  | (string & {});

export type SweepTarget = {
  side?: "UP" | "DOWN";
  zone?: [number, number];
  note_th?: string;
  note?: string;
  status?: string;
  [k: string]: any;
};

export type GridPlan = {
  lower?: number;
  upper?: number;
  count?: number | null;
  [k: string]: any;
};

export type TrendPlan = {
  pullback_zone?: [number, number] | { low: number; high: number } | null;
  confirm_line?: number | null;
  invalidation?: number | null;
  tp1?: number | null;
  swing_high_1h?: number | null;
  swing_low_1h?: number | null;
  eq_1h?: number | null;
  liquidity_note?: string | null;
  targets?: {
    t1?: number | null;
    t2?: number | null;
    [k: string]: any;
  };
  [k: string]: any;
};

export type StepTruthOwner = "route.plan_status_state.steps" | "ui_fallback_builder" | (string & {});

export type StepTruthMeta = {
  owner?: StepTruthOwner;
  payload_kind?: string;
  fail_safe_mode?: string;
  resolved_plan_source?: string;
  selected_state_source?: string;
  route_source_marker?: string;
  route_build_marker?: string;
  [k: string]: any;
};

export type StepUI = {
  id: string;
  title: string;
  status: StepStatus;
  badge: string;
  detail: string;
  why?: string;
  __step_truth?: StepTruthMeta;
};

export type PlanIdentity = {
  plan_id?: string | null;
  plan_version?: string | null;
  previous_plan_id?: string | null;
  previous_plan_version?: string | null;
  [k: string]: any;
};

export type PlanStatusStateStep = {
  id: string;
  title: string;
  status: EngineStepStatus;
  why?: string;
  data?: any;
};

export type PlanStatusStateGuard = {
  selected_state_source?: string;
  use_canonical_state?: boolean;
  stale_reason?: string | null;
  regeneration_mode?: string;
  carried_event_log_from_canonical?: boolean;
  canonical_state_same_plan_version?: boolean;
  [k: string]: any;
};

export type PlanStatusState = {
  generated_at: string;
  age_sec: number | null;
  source_updated_at?: number | null;
  freshness?: {
    tag?: string;
    ageSec?: number | null;
    [k: string]: any;
  };

  price?: {
    close_5m?: number | null;
    close_1h?: number | null;
    [k: string]: any;
  };

  plan?: {
    market_regime?: string;
    market_mode?: string;
    confidence?: number | null;
    risk_warning?: string[];
    riskWarnings?: string[];
    sweep_zone_up?: { low: number; high: number };
    sweep_target?: SweepTarget;
    grid?: GridPlan;
    trend?: TrendPlan | any;
    plan_id?: string | null;
    plan_version?: string | null;
    previous_plan_id?: string | null;
    previous_plan_version?: string | null;
    meta?: Record<string, any>;
    [k: string]: any;
  };

  state: {
    code: string;
    headline: string;
    direction_hint?: string;
    confidence?: number | null;
    step_set?: StepSetKey;
    confirm_ts?: number | null;
    entry_1_done?: boolean;
    entry_2_done?: boolean;
    why?: string;
    [k: string]: any;
  };

  signals?: Record<string, any>;
  next_actions?: string[];
  steps: PlanStatusStateStep[];
  event_log?: Array<{
    t?: string | number;
    event?: string;
    type?: string;
    note?: string;
    message?: string;
    [k: string]: any;
  }>;

  __state_guard?: PlanStatusStateGuard;

  [k: string]: any;
};

export type DerivativesSeries = {
  now: number | null;
  trend_5m: { dir: string | null; pct: number | null };
  trend_15m: { dir: string | null; pct: number | null };
  has_data?: boolean;
  status?: string;
  reason?: string | null;
  source?: any;
  integrity?: any;
  [k: string]: any;
};

export type CanonicalMeta = {
  exists?: boolean;
  path?: string;
  route_write_canonical_enabled?: boolean;
  root_plan_present?: boolean;
  has_plan?: boolean;
  updated_at?: number | null;
  plan_id?: string | null;
  plan_version?: string | null;
  previous_plan_id?: string | null;
  previous_plan_version?: string | null;
  [k: string]: any;
};

export type CanonicalStateGuard = {
  hasCanonicalState?: boolean;
  canonicalStateGeneratedAtMs?: number | null;
  canonicalStateSourceUpdatedAtMs?: number | null;
  effectiveCanonicalWriteMs?: number | null;
  derivedStateGeneratedAtMs?: number | null;
  derivedSourceUpdatedAtMs?: number | null;
  staleAgainstWrite?: boolean;
  staleAgainstSource?: boolean;
  selectedStateSource?: string;
  useCanonicalState?: boolean;
  staleReason?: string | null;
  [k: string]: any;
};

export type RouteWriteGuard = {
  requested_route_write_canonical?: boolean;
  hard_disabled?: boolean;
  effective_route_write_canonical?: boolean;
  requested_legacy_public_plan_status?: boolean;
  effective_legacy_public_plan_status?: boolean;
  canonical_writer_policy?:
    | "reader_only_default"
    | "explicit_env_but_hard_disabled"
    | "explicit_env_allowed"
    | string;
  reason?: string;
  [k: string]: any;
};

export type FailSafeMode = "NORMAL" | "DEGRADED" | "HARD_STOP" | (string & {});

export type FailSafeState = {
  ok?: boolean;
  mode?: FailSafeMode;
  should_freeze_trade_actions?: boolean;
  should_serve_public_view_only?: boolean;
  should_block_canonical_write?: boolean;
  should_block_legacy_public_status_write?: boolean;
  reasons?: string[];
  source_marker?: string;
  build_marker?: string;
  [k: string]: any;
};

export type FieldOwnershipBoundary = {
  canonical_owned?: string[];
  route_live_owned?: string[];
  route_regenerated_owned?: string[];
  route_persisted_outputs?: string[];
  [k: string]: any;
};

export type TruthBoundaryDebug = {
  canonical_root_plan_used?: boolean;
  canonical_derived_plan_seen?: boolean;
  resolved_plan_source?: string;
  selected_state_source?: string;
  live_price_owner?: string;
  regenerated_state_owner?: string;
  route_writer_policy?: string;
  [k: string]: any;
};

export type PlanStatusDebug = {
  truth_boundary?: TruthBoundaryDebug;
  semantic_consistency?: {
    rootPlanVersion?: string | null;
    explainVersion?: string | null;
    reasonVersion?: string | null;
    headlineVersion?: string | null;
    mismatches?: boolean;
    [k: string]: any;
  };
  canonical_state_guard?: CanonicalStateGuard;
  route_write_guard?: RouteWriteGuard;
  persist_error?: string | null;
  [k: string]: any;
};

export type PlanStatus = {
  ok: boolean;
  symbol?: string;

  t?: number;
  updated_at?: number;
  generated_at?: string;
  source_updated_at?: number | null;
  source_freshness?: {
    tag?: string;
    ageSec?: number | null;
  };

  payload_kind?: string;
  route_source_marker?: string;
  route_build_marker?: string;

  price?: {
    close_5m?: number | null;
    close_1h?: number | null;
    [k: string]: any;
  };

  mode_lock?: {
    value?: string;
    changed?: boolean;
    [k: string]: any;
  };

  plan?: {
    market_regime?: string;
    market_mode?: string;
    risk_warning?: string[];
    riskWarnings?: string[];
    confidence?: number | null;
    sweep_target?: SweepTarget;
    sweep_zone_up?: { low: number; high: number };
    grid?: GridPlan;
    trend?: TrendPlan | any;
    plan_id?: string | null;
    plan_version?: string | null;
    previous_plan_id?: string | null;
    previous_plan_version?: string | null;
    meta?: Record<string, any>;
    [k: string]: any;
  };

  canonical?: CanonicalMeta;
  meta?: Record<string, any>;

  resolved_plan_source?: "canonical_plan" | "decision_fallback" | string;
  resolved_plan_identity?: PlanIdentity;

  derivatives?: {
    updated_at?: number | null;
    freshness?: { tag: string; ageSec: number | null };

    oi?: DerivativesSeries & {
      at_sweep?: number | null;
    };

    funding?: DerivativesSeries;

    crowd?: {
      side?: string;
      trapped?: string;
      crowd_th?: string;
      trapped_th?: string;
      note?: string;
      [k: string]: any;
    };

    [k: string]: any;
  };

  states?: {
    sweep_5m?: string;
    rejection_15m?: string;
    confirm_1h?: string;
    plan_state?: string;
    [k: string]: any;
  };

  plan_state?: string;
  plan_status_state?: PlanStatusState | null;
  canonical_state_guard?: CanonicalStateGuard;
  route_write_guard?: RouteWriteGuard;
  fail_safe?: FailSafeState;
  field_ownership_boundary?: FieldOwnershipBoundary;

  // backward compatibility
  planStatus?: any;
  planStatusState?: any;

  explain_th?: string;

  ob_gate?: any;
  ob_trade?: any;
  trend_trade?: any;
  market_data?: any;
  liquidity_magnet?: any;
  debug?: PlanStatusDebug;

  reason_agent?: any;
  summary_for_bot?: any;
  policy?: any;
  risk_overlay?: any;
  __read_meta?: any;
  _writer?: any;
  _writer_stage?: any;
  _write_ts?: number | null;

  [k: string]: any;
};

export type LogItem = {
  t: number;
  type?: string;
  from?: string | null;
  to?: string | null;
  mode_lock?: string;

  price?: { close_5m?: number | null; close_1h?: number | null };
  deriv?: {
    oi5_dir?: string;
    oi5_pct?: number;
    fund5_dir?: string;
    fund5_pct?: number;
    crowd?: string;
    trapped?: string;
    [k: string]: any;
  };

  sweep?: any;
  explain_th?: string;

  from_mode?: string | null;
  to_mode?: string | null;
  to_plan_state?: string | null;

  symbol?: string;
  reason?: string;
  raw?: any;

  [k: string]: any;
};

export type BuildStepsResult = {
  key: StepSetKey;
  title: string;
  steps: StepUI[];
  activeStepId: string | null;
};
