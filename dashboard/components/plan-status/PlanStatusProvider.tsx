"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiUrl } from "@/lib/apiBase";
import type {
  PlanStatusRoutePayload,
  RouteFailSafe,
  RouteFieldOwnershipBoundary,
  RouteMarkerPolicy,
  RouteMarkerProof,
} from "@/lib/planStatusContract";

export type PlanStatusResp = PlanStatusRoutePayload;

type Ctx = {
  data: PlanStatusResp | null;
  error: string | null;
  fetchedAt: number | null;
  now: number;
  isLoading: boolean;
  isRefreshing: boolean;
  reload: () => Promise<void>;
};

const PlanStatusCtx = createContext<Ctx | null>(null);

async function fetchWithFallback(path: string) {
  const url = apiUrl(path);

  try {
    return await fetch(url, { cache: "no-store" });
  } catch (error) {
    if (url !== path) {
      return await fetch(path, { cache: "no-store" });
    }
    throw error;
  }
}

function isPlainObject(input: unknown): input is Record<string, any> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

function normalizeNullableFiniteNumber(input: unknown): number | null | undefined {
  if (input === null) return null;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  return undefined;
}

function normalizeOptionalFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  return undefined;
}

function normalizeOptionalString(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

function normalizeOptionalStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.filter((x): x is string => typeof x === "string");
}

function normalizePrice(input: any): PlanStatusResp["price"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    ...input,
    close_5m: normalizeNullableFiniteNumber(input.close_5m),
    close_1h: normalizeNullableFiniteNumber(input.close_1h),
  };
}

function normalizeSourceFreshness(input: any): PlanStatusResp["source_freshness"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    tag: normalizeOptionalString(input.tag),
    ageSec: normalizeNullableFiniteNumber(input.ageSec),
  };
}

function normalizeFailSafe(input: any): PlanStatusResp["fail_safe"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    ...input,
    ok: typeof input.ok === "boolean" ? input.ok : undefined,
    mode: normalizeOptionalString(input.mode),
    should_freeze_trade_actions:
      typeof input.should_freeze_trade_actions === "boolean"
        ? input.should_freeze_trade_actions
        : undefined,
    should_serve_public_view_only:
      typeof input.should_serve_public_view_only === "boolean"
        ? input.should_serve_public_view_only
        : undefined,
    should_block_canonical_write:
      typeof input.should_block_canonical_write === "boolean"
        ? input.should_block_canonical_write
        : undefined,
    should_block_legacy_public_status_write:
      typeof input.should_block_legacy_public_status_write === "boolean"
        ? input.should_block_legacy_public_status_write
        : undefined,
    reasons: normalizeOptionalStringArray(input.reasons),
    source_marker: normalizeOptionalString(input.source_marker),
    build_marker: normalizeOptionalString(input.build_marker),
    runtime_marker: normalizeOptionalString(input.runtime_marker),
    marker_proof: normalizeMarkerProof(input.marker_proof),
  } as RouteFailSafe;
}

function normalizeFieldOwnershipBoundary(
  input: any
): PlanStatusResp["field_ownership_boundary"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    ...input,
    canonical_owned: normalizeOptionalStringArray(input.canonical_owned),
    route_live_owned: normalizeOptionalStringArray(input.route_live_owned),
    route_regenerated_owned: normalizeOptionalStringArray(input.route_regenerated_owned),
    route_persisted_outputs: normalizeOptionalStringArray(input.route_persisted_outputs),
  } as RouteFieldOwnershipBoundary;
}

async function readSafeJson(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    const isHtml = /^\s*</.test(text);
    throw new Error(
      isHtml
        ? "endpoint returned HTML/login instead of JSON"
        : `endpoint returned ${contentType || "unknown content-type"}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("endpoint returned invalid JSON");
  }
}

function normalizeMarkerProof(input: any): PlanStatusResp["marker_proof"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    ...input,
    marker: normalizeOptionalString(input.marker),
    source_marker: normalizeOptionalString(input.source_marker),
    build_marker: normalizeOptionalString(input.build_marker),
    runtime_marker: normalizeOptionalString(input.runtime_marker),
    runtime_marker_stamped: normalizeOptionalString(input.runtime_marker_stamped),
    build_identity:
      typeof input.build_identity === "string" || input.build_identity === null
        ? input.build_identity
        : undefined,
    source_build_match:
      typeof input.source_build_match === "boolean" ? input.source_build_match : undefined,
    source_runtime_match:
      typeof input.source_runtime_match === "boolean" ? input.source_runtime_match : undefined,
    build_runtime_match:
      typeof input.build_runtime_match === "boolean" ? input.build_runtime_match : undefined,
    all_match: typeof input.all_match === "boolean" ? input.all_match : undefined,
    mismatches: normalizeOptionalStringArray(input.mismatches),
    mismatch_reasons: normalizeOptionalStringArray(input.mismatch_reasons),
  } as RouteMarkerProof;
}

function normalizeMarkerPolicy(input: any): PlanStatusResp["marker_policy"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    ...input,
    marker: normalizeOptionalString(input.marker),
    invariant: normalizeOptionalString(input.invariant),
    proof_pairs: normalizeOptionalStringArray(input.proof_pairs),
    canonical_writer_policy: normalizeOptionalString(input.canonical_writer_policy),
    proof_observability: normalizeOptionalString(input.proof_observability),
    build_identity:
      typeof input.build_identity === "string" || input.build_identity === null
        ? input.build_identity
        : undefined,
    runtime_marker_stamped: normalizeOptionalString(input.runtime_marker_stamped),
    proof: normalizeMarkerProof(input.proof),
  } as RouteMarkerPolicy;
}

function normalizeProof(input: any): PlanStatusResp["proof"] | undefined {
  if (!isPlainObject(input)) return undefined;

  return {
    ...input,
    route_version: normalizeOptionalString(input.route_version),
    source_marker: normalizeOptionalString(input.source_marker),
    build_marker: normalizeOptionalString(input.build_marker),
    runtime_marker: normalizeOptionalString(input.runtime_marker),
    runtime_marker_stamped: normalizeOptionalString(input.runtime_marker_stamped),
    build_identity:
      typeof input.build_identity === "string" || input.build_identity === null
        ? input.build_identity
        : undefined,
    marker_match: typeof input.marker_match === "boolean" ? input.marker_match : undefined,
    pairwise_matches: isPlainObject(input.pairwise_matches)
      ? {
          ...input.pairwise_matches,
          source_build:
            typeof input.pairwise_matches.source_build === "boolean"
              ? input.pairwise_matches.source_build
              : undefined,
          source_runtime:
            typeof input.pairwise_matches.source_runtime === "boolean"
              ? input.pairwise_matches.source_runtime
              : undefined,
          build_runtime:
            typeof input.pairwise_matches.build_runtime === "boolean"
              ? input.pairwise_matches.build_runtime
              : undefined,
        }
      : undefined,
    mismatches: normalizeOptionalStringArray(input.mismatches),
    mismatch_reasons: normalizeOptionalStringArray(input.mismatch_reasons),
    runtime_started_at: normalizeOptionalString(input.runtime_started_at),
    process_identity: normalizeOptionalString(input.process_identity),
    proof_observability: normalizeOptionalString(input.proof_observability),
    route_policy: isPlainObject(input.route_policy)
      ? {
          ...input.route_policy,
          reader_first:
            typeof input.route_policy.reader_first === "boolean"
              ? input.route_policy.reader_first
              : undefined,
          canonical_writer_policy: normalizeOptionalString(input.route_policy.canonical_writer_policy),
          canonical_write_enabled:
            typeof input.route_policy.canonical_write_enabled === "boolean"
              ? input.route_policy.canonical_write_enabled
              : undefined,
        }
      : undefined,
    plan_truth: isPlainObject(input.plan_truth)
      ? {
          ...input.plan_truth,
          root_plan_owner: normalizeOptionalString(input.plan_truth.root_plan_owner),
          derived_plan_owner: normalizeOptionalString(input.plan_truth.derived_plan_owner),
          resolved_plan_source:
            typeof input.plan_truth.resolved_plan_source === "string" ||
            input.plan_truth.resolved_plan_source === null
              ? input.plan_truth.resolved_plan_source
              : undefined,
          canonical_root_plan_present:
            typeof input.plan_truth.canonical_root_plan_present === "boolean"
              ? input.plan_truth.canonical_root_plan_present
              : undefined,
          derived_state_plan_present:
            typeof input.plan_truth.derived_state_plan_present === "boolean"
              ? input.plan_truth.derived_state_plan_present
              : undefined,
        }
      : undefined,
  };
}

function normalizePlanStatusResp(input: any): PlanStatusResp {
  const obj = isPlainObject(input) ? input : {};

  return {
    ok: Boolean(obj.ok),

    t: normalizeOptionalFiniteNumber(obj.t),
    updated_at: normalizeOptionalFiniteNumber(obj.updated_at),
    generated_at: normalizeOptionalString(obj.generated_at),
    source_updated_at: normalizeOptionalFiniteNumber(obj.source_updated_at),
    source_freshness: normalizeSourceFreshness(obj.source_freshness),

    symbol: normalizeOptionalString(obj.symbol),
    plan_state: normalizeOptionalString(obj.plan_state),
    mode_lock: obj.mode_lock,

    plan: obj.plan ?? undefined,
    canonical: obj.canonical ?? undefined,
    meta: obj.meta ?? undefined,

    resolved_plan_source: normalizeOptionalString(obj.resolved_plan_source),
    resolved_plan_identity: obj.resolved_plan_identity ?? undefined,

    ob_gate: obj.ob_gate ?? undefined,
    ob_trade: obj.ob_trade ?? undefined,
    trend_trade: obj.trend_trade ?? undefined,
    derivatives: obj.derivatives ?? undefined,
    liquidity_magnet: obj.liquidity_magnet ?? undefined,
    market_data: obj.market_data ?? undefined,

    price: normalizePrice(obj.price),

    states: obj.states ?? undefined,
    debug: obj.debug ?? undefined,
    explain_th: normalizeOptionalString(obj.explain_th),
    reason_agent: obj.reason_agent ?? undefined,
    summary_for_bot: obj.summary_for_bot ?? undefined,
    policy: obj.policy ?? undefined,
    risk_overlay: obj.risk_overlay ?? undefined,
    __read_meta: obj.__read_meta ?? undefined,
    _writer: obj._writer ?? undefined,
    _writer_stage: obj._writer_stage ?? undefined,
    _write_ts: normalizeNullableFiniteNumber(obj._write_ts),

    plan_status_state: obj.plan_status_state ?? undefined,
    canonical_state_guard: obj.canonical_state_guard ?? undefined,
    route_write_guard: obj.route_write_guard ?? undefined,
    fail_safe: normalizeFailSafe(obj.fail_safe),
    field_ownership_boundary: normalizeFieldOwnershipBoundary(obj.field_ownership_boundary),
    payload_kind: normalizeOptionalString(obj.payload_kind),
    route_source_marker: normalizeOptionalString(obj.route_source_marker),
    route_build_marker: normalizeOptionalString(obj.route_build_marker),
    route_runtime_marker: normalizeOptionalString(obj.route_runtime_marker),
    runtime_marker_stamped: normalizeOptionalString(obj.runtime_marker_stamped),
    route_build_identity:
      typeof obj.route_build_identity === "string" || obj.route_build_identity === null
        ? obj.route_build_identity
        : undefined,
    marker_policy: normalizeMarkerPolicy(obj.marker_policy),
    marker_proof: normalizeMarkerProof(obj.marker_proof),
    proof: normalizeProof(obj.proof),

    // backward compatibility
    planStatus: obj.planStatus ?? undefined,
    planStatusState: obj.planStatusState ?? undefined,
  };
}

/**
 * Provider นี้ต้องไม่ resolve truth เอง
 *
 * Truth owners:
 * - plan truth = top-level plan + resolved_plan_identity
 * - price truth = top-level price
 * - state truth = top-level plan_status_state
 * - fail_safe truth = top-level fail_safe
 * - ownership truth = top-level field_ownership_boundary
 *
 * Provider มีหน้าที่แค่:
 * - fetch
 * - normalize response shape
 * - cache
 * - expose raw route truth
 *
 * Provider ต้องไม่:
 * - merge legacy mirrors เข้าหา root truth
 * - revive / synthesize plan_status_state
 * - fallback ข้าม ownership boundary
 * - downgrade fail_safe / payload_kind / ownership metadata
 */
function stableSignature(input: PlanStatusResp | null): string {
  try {
    return JSON.stringify({
      ok: input?.ok ?? null,
      t: input?.t ?? null,
      updated_at: input?.updated_at ?? null,
      generated_at: input?.generated_at ?? null,
      source_updated_at: input?.source_updated_at ?? null,
      source_freshness_tag: input?.source_freshness?.tag ?? null,
      source_freshness_age_sec: input?.source_freshness?.ageSec ?? null,

      symbol: input?.symbol ?? null,
      plan_state: input?.plan_state ?? null,
      resolved_plan_source: input?.resolved_plan_source ?? null,
      payload_kind: input?.payload_kind ?? null,
      route_source_marker: input?.route_source_marker ?? null,
      route_build_marker: input?.route_build_marker ?? null,
      route_runtime_marker: input?.route_runtime_marker ?? null,
      runtime_marker_stamped: input?.runtime_marker_stamped ?? null,
      route_build_identity: input?.route_build_identity ?? null,
      proof_route_version: input?.proof?.route_version ?? null,
      proof_marker_match: input?.proof?.marker_match ?? null,
      proof_runtime_started_at: input?.proof?.runtime_started_at ?? null,
      proof_process_identity: input?.proof?.process_identity ?? null,

      plan_id:
        input?.resolved_plan_identity?.plan_id ??
        input?.plan?.plan_id ??
        input?.meta?.plan_id ??
        null,

      plan_version:
        input?.resolved_plan_identity?.plan_version ??
        input?.plan?.plan_version ??
        input?.meta?.plan_version ??
        null,

      previous_plan_id:
        input?.resolved_plan_identity?.previous_plan_id ??
        input?.plan?.previous_plan_id ??
        input?.meta?.previous_plan_id ??
        null,

      previous_plan_version:
        input?.resolved_plan_identity?.previous_plan_version ??
        input?.plan?.previous_plan_version ??
        input?.meta?.previous_plan_version ??
        null,

      market_regime: input?.plan?.market_regime ?? null,
      market_mode: input?.plan?.market_mode ?? null,
      plan_confidence: input?.plan?.confidence ?? null,

      price_close_5m: input?.price?.close_5m ?? null,
      price_close_1h: input?.price?.close_1h ?? null,

      state_generated_at: input?.plan_status_state?.generated_at ?? null,
      state_source_updated_at: input?.plan_status_state?.source_updated_at ?? null,
      state_code: input?.plan_status_state?.state?.code ?? null,
      state_headline: input?.plan_status_state?.state?.headline ?? null,
      state_step_set: input?.plan_status_state?.state?.step_set ?? null,
      state_plan_id: input?.plan_status_state?.plan?.plan_id ?? null,
      state_plan_version: input?.plan_status_state?.plan?.plan_version ?? null,
      state_guard_selected:
        input?.plan_status_state?.__state_guard?.selected_state_source ?? null,
      state_guard_mode:
        input?.plan_status_state?.__state_guard?.regeneration_mode ?? null,

      canonical_root_plan_present:
        input?.canonical?.root_plan_present ??
        input?.canonical?.has_plan ??
        null,
      canonical_plan_id: input?.canonical?.plan_id ?? null,
      canonical_plan_version: input?.canonical?.plan_version ?? null,

      canonical_state_selected_source:
        input?.canonical_state_guard?.selectedStateSource ?? null,
      canonical_state_use_source:
        input?.canonical_state_guard?.useCanonicalState ?? null,
      canonical_state_stale_reason:
        input?.canonical_state_guard?.staleReason ?? null,

      fail_safe_ok: input?.fail_safe?.ok ?? null,
      fail_safe_mode: input?.fail_safe?.mode ?? null,
      fail_safe_freeze: input?.fail_safe?.should_freeze_trade_actions ?? null,
      fail_safe_public_only: input?.fail_safe?.should_serve_public_view_only ?? null,
      fail_safe_reasons: input?.fail_safe?.reasons ?? null,

      canonical_owned: input?.field_ownership_boundary?.canonical_owned ?? null,
      route_live_owned: input?.field_ownership_boundary?.route_live_owned ?? null,
      route_regenerated_owned:
        input?.field_ownership_boundary?.route_regenerated_owned ?? null,
      route_persisted_outputs:
        input?.field_ownership_boundary?.route_persisted_outputs ?? null,

      ob_entry_status: input?.ob_gate?.entry?.status ?? null,
      ob_entry_label_th: input?.ob_gate?.entry?.label_th ?? null,
      ob_trade_id: input?.ob_trade?.trade_id ?? null,
      ob_trade_active: input?.ob_trade?.active ?? null,
      trend_trade_id: input?.trend_trade?.trade_id ?? null,
      trend_trade_active: input?.trend_trade?.active ?? null,

      deriv_updated_at: input?.derivatives?.updated_at ?? null,
      liq_magnet_hint:
        input?.liquidity_magnet?.summary_th ??
        input?.liquidity_magnet?.m5?.alignment ??
        null,
    });
  } catch {
    return "plan-status-signature-fallback";
  }
}

export function usePlanStatusOptional() {
  return useContext(PlanStatusCtx);
}

export function usePlanStatus() {
  const ctx = useContext(PlanStatusCtx);
  if (!ctx) {
    throw new Error("usePlanStatus must be used inside PlanStatusProvider");
  }
  return ctx;
}

export default function PlanStatusProvider(props: {
  pollMs?: number;
  children: React.ReactNode;
}) {
  const pollMs = props.pollMs ?? 10_000;

  const [data, setData] = useState<PlanStatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const firstLoadDoneRef = useRef(false);
  const requestSeqRef = useRef(0);
  const lastSigRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const timer = window.setInterval(() => {
      if (mountedRef.current) {
        setNow(Date.now());
      }
    }, 1000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, []);

  const reload = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    const seq = ++requestSeqRef.current;
    const isFirstLoad = !firstLoadDoneRef.current;

    if (mountedRef.current) {
      if (isFirstLoad) setIsLoading(true);
      else setIsRefreshing(true);
    }

    try {
      const res = await fetchWithFallback("/api/plan-status");
      if (!res.ok) {
        throw new Error(`plan-status http ${res.status}`);
      }

      const raw = await readSafeJson(res);
      const normalized = normalizePlanStatusResp(raw);

      if (!normalized.ok) {
        const safeError =
          typeof raw?.message === "string"
            ? raw.message
            : typeof raw?.error === "string"
              ? raw.error
              : "plan-status returned structured warning";
        if (!mountedRef.current) return;
        if (seq !== requestSeqRef.current) return;
        setData(normalized);
        setFetchedAt(Date.now());
        setError(safeError);
        firstLoadDoneRef.current = true;
        return;
      }

      if (!mountedRef.current) return;
      if (seq !== requestSeqRef.current) return;

      const sig = stableSignature(normalized);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        setData(normalized);
      }

      setFetchedAt(Date.now());
      setError(null);
      firstLoadDoneRef.current = true;
    } catch (error: any) {
      if (!mountedRef.current) return;
      if (seq !== requestSeqRef.current) return;

      setError(error?.message ?? "failed to load");
    } finally {
      if (seq === requestSeqRef.current) {
        inFlightRef.current = false;

        if (mountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await reload();
    };

    void run();

    const timer = window.setInterval(() => {
      if (!cancelled) {
        void reload();
      }
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs, reload]);

  const value = useMemo<Ctx>(
    () => ({
      data,
      error,
      fetchedAt,
      now,
      isLoading,
      isRefreshing,
      reload,
    }),
    [data, error, fetchedAt, now, isLoading, isRefreshing, reload]
  );

  return <PlanStatusCtx.Provider value={value}>{props.children}</PlanStatusCtx.Provider>;
}
