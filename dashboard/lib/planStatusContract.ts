export type RoutePayloadKind = "route_full" | "public_view" | (string & {});
export type RouteResolvedPlanSource = "canonical_plan" | "decision_fallback" | (string & {});
export type RouteFailSafeMode = "NORMAL" | "DEGRADED" | "HARD_STOP" | "UNKNOWN";
export type RouteFieldOwnershipClass =
  | "canonical_owned"
  | "route_live_owned"
  | "route_regenerated_owned"
  | "route_persisted_outputs";
export type RouteFieldOwnershipBoundary = {
  canonical_owned?: string[];
  route_live_owned?: string[];
  route_regenerated_owned?: string[];
  route_persisted_outputs?: string[];
  [k: string]: unknown;
};

export type RouteMarkerProof = {
  marker?: string;
  source_marker?: string;
  build_marker?: string;
  runtime_marker?: string;
  runtime_marker_stamped?: string;
  build_identity?: string | null;
  source_build_match?: boolean;
  source_runtime_match?: boolean;
  build_runtime_match?: boolean;
  all_match?: boolean;
  mismatches?: string[];
  mismatch_reasons?: string[];
  [k: string]: unknown;
};

export type RouteMarkerPolicy = {
  marker?: string;
  invariant?: string;
  proof_pairs?: string[];
  canonical_writer_policy?: string;
  proof_observability?: string;
  build_identity?: string | null;
  runtime_marker_stamped?: string;
  proof?: RouteMarkerProof;
  [k: string]: unknown;
};

export type RouteRuntimeProof = {
  route_version?: string;
  source_marker?: string;
  build_marker?: string;
  runtime_marker?: string;
  runtime_marker_stamped?: string;
  build_identity?: string | null;
  marker_match?: boolean;
  pairwise_matches?: {
    source_build?: boolean;
    source_runtime?: boolean;
    build_runtime?: boolean;
    [k: string]: unknown;
  };
  mismatches?: string[];
  mismatch_reasons?: string[];
  runtime_started_at?: string;
  process_identity?: string;
  proof_observability?: string;
  route_policy?: {
    reader_first?: boolean;
    canonical_writer_policy?: string;
    canonical_write_enabled?: boolean;
    [k: string]: unknown;
  };
  plan_truth?: {
    root_plan_owner?: string;
    derived_plan_owner?: string;
    resolved_plan_source?: string | null;
    canonical_root_plan_present?: boolean;
    derived_state_plan_present?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type RouteFailSafe = {
  ok?: boolean;
  mode?: RouteFailSafeMode | (string & {});
  should_freeze_trade_actions?: boolean;
  should_serve_public_view_only?: boolean;
  should_block_canonical_write?: boolean;
  should_block_legacy_public_status_write?: boolean;
  reasons?: string[];
  source_marker?: string;
  build_marker?: string;
  runtime_marker?: string;
  marker_proof?: RouteMarkerProof;
  [k: string]: unknown;
};

export type PlanStatusRoutePayload = {
  ok: boolean;
  t?: number;
  updated_at?: number;
  generated_at?: string;
  source_updated_at?: number | null;
  source_freshness?: {
    tag?: string;
    ageSec?: number | null;
    [k: string]: unknown;
  };

  symbol?: string;
  plan_state?: string;
  mode_lock?: unknown;
  market_mode?: string;
  market_regime?: string;
  confidence?: number | null;
  risk_warning?: string[] | string;
  riskWarnings?: string[] | string;
  sweep_target?: unknown;
  sweepTarget?: unknown;

  plan?: any;
  canonical?: any;
  meta?: any;

  resolved_plan_source?: RouteResolvedPlanSource;
  resolved_plan_identity?: any;

  ob_gate?: any;
  ob_trade?: any;
  trend_trade?: any;
  derivatives?: any;
  liquidity_magnet?: any;
  market_data?: any;

  price?: {
    close_5m?: number | null;
    close_1h?: number | null;
    [k: string]: unknown;
  };

  states?: any;
  debug?: any;
  explain_th?: string;
  reason_agent?: any;
  summary_for_bot?: any;
  policy?: any;
  risk_overlay?: any;
  __read_meta?: any;
  _writer?: any;
  _writer_stage?: any;
  _write_ts?: number | null;

  plan_status_state?: any;
  canonical_state_guard?: any;
  route_write_guard?: any;
  fail_safe?: RouteFailSafe;
  scheduler_status?: any;
  field_ownership_boundary?: RouteFieldOwnershipBoundary;
  payload_kind?: RoutePayloadKind;
  route_source_marker?: string;
  route_build_marker?: string;
  route_runtime_marker?: string;
  runtime_marker_stamped?: string;
  route_build_identity?: string | null;
  marker_policy?: RouteMarkerPolicy;
  marker_proof?: RouteMarkerProof;
  proof?: RouteRuntimeProof;

  // backward compatibility
  plan_status?: any;
  planStatus?: any;
  planStatusState?: any;
};

export const ROUTE_OUTPUT_OWNERSHIP = {
  canonical_owned: [
    "plan",
    "meta",
    "plan_id",
    "plan_version",
    "previous_plan_id",
    "previous_plan_version",
    "reason_agent",
    "summary_for_bot",
    "risk_warning",
    "levels",
    "parameters_for_grid_or_trend",
    "policy",
    "risk_overlay",
    "__read_meta",
    "_writer",
    "_writer_stage",
    "_write_ts",
  ],
  route_live_owned: [
    "price",
    "market_data",
    "derivatives",
    "liquidity_magnet",
    "ob_gate",
    "ob_trade",
    "trend_trade",
    "states",
    "generated_at",
    "source_updated_at",
    "source_freshness",
    "updated_at",
    "t",
  ],
  route_regenerated_owned: ["plan_status_state"],
  public_view_only: [
    "payload_kind=public_view",
    "debug.public_view",
    "debug.canonical_fields_stripped",
  ],
  debug_only: [
    "proof",
    "debug",
    "debug.truth_boundary",
    "debug.analysis_state_machine",
    "debug.scheduler_audit",
    "debug.persisted",
    "debug.semantic_consistency",
  ],
} as const;
