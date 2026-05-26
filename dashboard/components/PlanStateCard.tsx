"use client";

import { useMemo } from "react";

import { usePlanStatus } from "@/components/plan-status/PlanStatusProvider";

type PlanStatusResp = {
  ok: boolean;
  symbol?: string;
  updated_at?: number;
  source_updated_at?: number;
  generated_at?: string;

  mode_lock?: { value?: string; changed?: boolean };
  plan_state?: string;

  price?: {
    close_5m?: number | null;
    close_1h?: number | null;
    [k: string]: any;
  };

  plan_status_state?: {
    generated_at?: string;
    age_sec?: number | null;
    source_updated_at?: number | null;

    price?: {
      close_5m?: number | null;
      close_1h?: number | null;
      [k: string]: any;
    };

    plan?: {
      market_regime?: string;
      market_mode?: string;
      confidence?: number | null;
      plan_id?: string | null;
      plan_version?: string | null;
      previous_plan_id?: string | null;
      previous_plan_version?: string | null;
      [k: string]: any;
    };

    state?: {
      code?: string;
      headline?: string;
      direction_hint?: string;
      confidence?: number | null;
      step_set?: string;
      [k: string]: any;
    };

    signals?: Record<string, string>;
    next_actions?: string[];
    steps?: Array<{ id?: string; title?: string; status?: string; why?: string }>;

    __state_guard?: {
      selected_state_source?: string;
      use_canonical_state?: boolean;
      stale_reason?: string | null;
      regeneration_mode?: string;
      carried_event_log_from_canonical?: boolean;
      canonical_state_same_plan_version?: boolean;
      [k: string]: any;
    };

    [k: string]: any;
  };

  canonical_state_guard?: {
    selectedStateSource?: string;
    useCanonicalState?: boolean;
    staleReason?: string | null;
    [k: string]: any;
  };

  debug?: {
    truth_boundary?: {
      live_price_owner?: string;
      regenerated_state_owner?: string;
      [k: string]: any;
    };
    [k: string]: any;
  };
};

function normUpper(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function pct(conf?: number | null) {
  if (typeof conf !== "number" || !Number.isFinite(conf)) return "—";
  return `${Math.round(conf * 100)}%`;
}

function fmtPrice(x: unknown) {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function tone(tag?: string) {
  const t = normUpper(tag);

  if (t.includes("DONE") || t.includes("CONFIRMED") || t.includes("READY") || t.includes("PASS")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  if (t.includes("WAIT") || t.includes("PENDING") || t.includes("WARN")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  if (t.includes("FAIL") || t.includes("BLOCK") || t.includes("INVALID") || t.includes("NO_TRADE")) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  }

  return "border-neutral-700 bg-white/5 text-neutral-300";
}

function truthTone(isFreshDerived?: boolean) {
  return isFreshDerived
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

/**
 * Ownership boundary:
 * - live price truth = top-level raw.price
 * - plan/state truth = raw.plan_status_state
 * - canonical state metadata = raw.canonical_state_guard
 *
 * This card may DISPLAY fallback values for resilience,
 * but must not reinterpret ownership or synthesize new truth.
 */
export default function PlanStateCard() {
  const ctx = usePlanStatus();

  const raw = (ctx.data as PlanStatusResp | null) ?? null;
  const err = ctx.error;
  const fetchedAt = ctx.fetchedAt;
  const now = ctx.now;
  const isLoading = ctx.isLoading;
  const isRefreshing = ctx.isRefreshing;

  const ps = useMemo(() => raw?.plan_status_state ?? null, [raw]);

  const fetchAgeSec = useMemo(() => {
    if (!fetchedAt) return null;
    return Math.max(0, Math.floor((now - fetchedAt) / 1000));
  }, [now, fetchedAt]);

  const headline = ps?.state?.headline ?? "—";
  const code = ps?.state?.code ?? "UNKNOWN";
  const stepSet = ps?.state?.step_set ?? "—";
  const direction = ps?.state?.direction_hint ?? "—";
  const confidence =
    typeof ps?.state?.confidence === "number"
      ? ps.state.confidence
      : typeof ps?.plan?.confidence === "number"
        ? ps.plan.confidence
        : undefined;

  const ageSec = typeof ps?.age_sec === "number" ? ps.age_sec : null;
  const signals = Object.entries(ps?.signals ?? {});
  const nextActions = Array.isArray(ps?.next_actions) ? ps.next_actions : [];
  const regime = ps?.plan?.market_regime ?? "—";
  const mode = ps?.plan?.market_mode ?? "—";
  const planId = ps?.plan?.plan_id ?? "—";
  const planVersion = ps?.plan?.plan_version ?? "—";

  const liveClose5m =
    raw?.price?.close_5m !== undefined ? raw.price.close_5m : (ps?.price?.close_5m ?? null);

  const liveClose1h =
    raw?.price?.close_1h !== undefined ? raw.price.close_1h : (ps?.price?.close_1h ?? null);

  const stateGuard = ps?.__state_guard ?? null;
  const canonicalStateGuard = raw?.canonical_state_guard ?? null;
  const truthBoundary = raw?.debug?.truth_boundary ?? null;

  const selectedStateSource =
    stateGuard?.selected_state_source ??
    canonicalStateGuard?.selectedStateSource ??
    "—";

  const staleReason =
    stateGuard?.stale_reason ??
    canonicalStateGuard?.staleReason ??
    "—";

  const regenerationMode =
    stateGuard?.regeneration_mode ??
    truthBoundary?.regenerated_state_owner ??
    "route_fresh_derived_snapshot";

  const isFreshDerivedSnapshot = stateGuard?.use_canonical_state === false;

  if (err) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
        โหลด PlanState ไม่ได้: {err}
      </div>
    );
  }

  if (isLoading && !raw) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        กำลังโหลด Plan State…
      </div>
    );
  }

  if (!raw) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        ไม่มีข้อมูล plan-status จาก provider
      </div>
    );
  }

  if (!ps) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        /api/plan-status ยังไม่ส่ง plan_status_state มา
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-hidden rounded-2xl bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-100">
            <span className="truncate">Plan State</span>

            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${tone(code)}`}>
              {code}
            </span>

            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${tone(direction)}`}>
              {direction}
            </span>

            <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-950/40 px-2 py-0.5 text-xs text-neutral-300">
              conf: {pct(confidence)}
            </span>

            {isRefreshing ? (
              <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">
                refreshing
              </span>
            ) : null}
          </div>

          <div className="mt-1 break-words text-xs text-neutral-400">
            step_set: <span className="text-neutral-200">{stepSet}</span>
            {raw?.mode_lock?.value ? (
              <>
                {" "}
                • mode_lock: <span className="text-neutral-200">{String(raw.mode_lock.value)}</span>
              </>
            ) : null}
          </div>

          <div className="mt-1 text-xs text-neutral-500">
            regime: {regime} • mode: {mode}
          </div>

          <div className="mt-1 text-xs text-neutral-500">
            plan_id: {planId} • plan_version: {planVersion}
          </div>
        </div>

        <div className="shrink-0 text-right text-[11px] text-neutral-500">
          <div>Card Fresh: {fetchAgeSec == null ? "—" : `${fetchAgeSec}s`}</div>
          <div>State Age: {ageSec == null ? "—" : `${ageSec}s`}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4">
          <div className="text-xs text-neutral-400">Live price truth</div>

          <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-100">
            <span className="rounded-full border border-neutral-700 bg-white/5 px-3 py-1">
              close_5m: {fmtPrice(liveClose5m)}
            </span>

            <span className="rounded-full border border-neutral-700 bg-white/5 px-3 py-1">
              close_1h: {fmtPrice(liveClose1h)}
            </span>
          </div>

          <div className="mt-2 text-[11px] text-neutral-500">
            owner: {truthBoundary?.live_price_owner ?? "route_live_candles"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4">
          <div className="text-xs text-neutral-400">State regeneration</div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded-full border px-3 py-1 ${truthTone(isFreshDerivedSnapshot)}`}
            >
              {isFreshDerivedSnapshot ? "fresh_derived_snapshot" : "canonical_or_carry"}
            </span>

            <span
              className={`rounded-full border px-3 py-1 ${tone(String(selectedStateSource))}`}
            >
              {selectedStateSource}
            </span>
          </div>

          <div className="mt-2 break-words text-[11px] text-neutral-500">
            regeneration_mode: {regenerationMode}
            <br />
            stale_reason: {staleReason}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4">
        <div className="text-xs text-neutral-400">Headline</div>
        <div className="mt-1 break-words whitespace-pre-wrap text-sm text-neutral-100">
          {headline}
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Confidence</span>
            <span>{pct(confidence)}</span>
          </div>

          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full bg-white/25"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, Math.round(((typeof confidence === "number" ? confidence : 0) * 100)))
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs text-neutral-400">Signals</div>

        <div className="mt-2 flex flex-wrap gap-2">
          {signals.length === 0 ? (
            <span className="text-xs text-neutral-400">—</span>
          ) : (
            signals.map(([key, value]) => (
              <span
                key={key}
                className={`rounded-full border px-3 py-1 text-xs ${tone(value)}`}
                title={key}
              >
                {key}: {String(value)}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs text-neutral-400">Next actions</div>

        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-200">
          {nextActions.length ? (
            nextActions.map((x, i) => <li key={i}>• {x}</li>)
          ) : (
            <li className="text-neutral-400">—</li>
          )}
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs text-neutral-400">Steps snapshot</div>

        <div className="mt-2 space-y-2">
          {(ps?.steps ?? []).length ? (
            ps.steps!.map((step, i) => (
              <div
                key={`${step.id ?? i}`}
                className="rounded-lg border border-white/10 bg-neutral-950/30 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-neutral-100">
                      {step.title ?? step.id ?? `STEP_${i + 1}`}
                    </div>

                    {step.why ? (
                      <div className="mt-1 break-words text-xs text-neutral-400">
                        {step.why}
                      </div>
                    ) : null}
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${tone(
                      step.status
                    )}`}
                  >
                    {String(step.status ?? "—")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-neutral-400">—</div>
          )}
        </div>
      </div>
    </div>
  );
}