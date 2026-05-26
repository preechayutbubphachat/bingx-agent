"use client";

import type React from "react";
import { useMemo } from "react";

import DecisionTop from "@/components/DecisionTop";
import { usePlanStatusOptional } from "@/components/plan-status/PlanStatusProvider";

type Props = {
  top?: React.ReactNode;
  regime: string;
  marketMode: string;
  confidence?: number;
  updatedAt?: number;
  riskWarnings?: string[];
};

type Tone = "red" | "green" | "yellow" | "gray" | "blue";

function pickTone(regime: string, marketMode?: string): Tone {
  const r = String(regime ?? "").toUpperCase();
  const m = String(marketMode ?? "").toUpperCase();

  if (r.includes("TREND_DOWN") || m.includes("TREND_DOWN") || m.includes("SHORT")) return "red";
  if (r.includes("TREND_UP") || m.includes("TREND_UP") || m.includes("LONG")) return "green";
  if (r.includes("RANGE") || m.includes("RANGE") || m.includes("GRID")) return "yellow";
  if (r.includes("NO_TRADE") || m.includes("NO_TRADE") || m.includes("HOLD")) return "gray";
  return "blue";
}

function toneClass(tone: Tone) {
  switch (tone) {
    case "red":
      return "border-red-500/30 bg-red-500/10 text-red-100";
    case "green":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "yellow":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "gray":
      return "border-neutral-500/30 bg-neutral-500/10 text-neutral-100";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  }
}

function freshness(updatedAt?: number) {
  if (!updatedAt || !Number.isFinite(updatedAt)) {
    return { label: "UNKNOWN", color: "text-neutral-400" as const };
  }

  const ageMin = (Date.now() - updatedAt) / 60000;

  if (ageMin < 10) return { label: "FRESH", color: "text-emerald-400" as const };
  if (ageMin < 30) return { label: "STALE", color: "text-amber-400" as const };
  return { label: "OLD", color: "text-rose-400" as const };
}

function pickBadgeLabel(code?: string) {
  const c = String(code ?? "").trim().toUpperCase();

  if (!c) return "INFO";
  if (c.startsWith("WAIT")) return "WAIT";
  if (c.startsWith("CONFIRM") || c.startsWith("READY") || c.startsWith("OK")) return "CONFIRM";
  if (c.startsWith("NO_TRADE") || c.startsWith("HOLD") || c.startsWith("PAUSE")) return "NO_TRADE";
  if (c.startsWith("BREAKOUT")) return "BREAKOUT";
  if (c.startsWith("TREND")) return "TREND";

  const base = c.split("_")[0];
  return base || "INFO";
}

function buildDecisionWhyOrTrace(pss: any) {
  const directWhy =
    String(pss?.state?.why ?? "").trim() ||
    String(pss?.why ?? "").trim() ||
    String(pss?.debug?.confirm_why ?? "").trim() ||
    String(pss?.debug?.rejection_why ?? "").trim();

  if (directWhy) return directWhy;

  const steps = Array.isArray(pss?.steps) ? pss.steps : [];
  const hot = steps
    .filter((s: any) => {
      const status = String(s?.status ?? "").toUpperCase();
      return status && status !== "OK" && status !== "PASS" && status !== "DONE";
    })
    .slice(0, 3)
    .map((s: any) => s?.title || s?.id)
    .filter(Boolean);

  const trail = hot.length ? `steps: ${hot.join(" → ")}` : "";
  const hint = String(pss?.state?.headline ?? "").trim();

  return trail || hint || "";
}

function formatModeLabel(regime: string, marketMode: string) {
  const r = String(regime ?? "").trim() || "NO_DATA";
  const m = String(marketMode ?? "").trim() || "NO_DATA";
  return { regime: r, marketMode: m };
}

function normalizeWarnings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function clampConfidence(confidence?: number) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return undefined;
  return Math.max(0, Math.min(1, confidence));
}

function normalizeFailSafeMode(mode: unknown) {
  const m = String(mode ?? "").trim().toUpperCase();
  if (!m) return "NORMAL";
  return m;
}

function failSafeTone(mode: string) {
  if (mode === "HARD_STOP") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (mode === "DEGRADED") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

/**
 * Ownership boundary for this card
 * - regime / marketMode / confidence / updatedAt / riskWarnings:
 *   trust props first because caller should already resolve from route truth model.
 * - provider is used only for contextual live state text (headline / why / trace)
 *   and must not override display regime/mode/confidence/risk warnings.
 * - fail_safe / payload_kind / route markers are provider-side diagnostic truth only,
 *   shown as tiny status metadata and never used to replace display props.
 */
export default function MarketStatusCard({
  top,
  regime,
  marketMode,
  confidence,
  updatedAt,
  riskWarnings = [],
}: Props) {
  const tone = useMemo(() => pickTone(regime, marketMode), [regime, marketMode]);
  const fresh = useMemo(() => freshness(updatedAt), [updatedAt]);

  const ctx = usePlanStatusOptional();
  const providerData = ctx?.data ?? null;
  const pss = providerData?.plan_status_state ?? null;

  const code = String(pss?.state?.code ?? "").trim();
  const badge = pickBadgeLabel(code);

  const headline = String(pss?.state?.headline ?? "").trim();
  const why = buildDecisionWhyOrTrace(pss);

  const labels = useMemo(() => {
    return formatModeLabel(regime, marketMode);
  }, [regime, marketMode]);

  const safeConfidence = useMemo(() => {
    return clampConfidence(confidence);
  }, [confidence]);

  const safeWarnings = useMemo(() => {
    return normalizeWarnings(riskWarnings);
  }, [riskWarnings]);

  const stateOwner =
    providerData?.debug?.truth_boundary?.regenerated_state_owner ??
    pss?.__state_guard?.regeneration_mode ??
    "route_fresh_derived_snapshot";

  const selectedStateSource =
    providerData?.canonical_state_guard?.selectedStateSource ??
    pss?.__state_guard?.selected_state_source ??
    "derived_state";

  const resolvedPlanSource = String(providerData?.resolved_plan_source ?? "UNKNOWN");
  const payloadKind = String(providerData?.payload_kind ?? "UNKNOWN");
  const routeBuildMarker = String(providerData?.route_build_marker ?? "UNKNOWN");
  const failSafeMode = normalizeFailSafeMode(providerData?.fail_safe?.mode);
  const failSafeReasons = Array.isArray(providerData?.fail_safe?.reasons)
    ? providerData?.fail_safe?.reasons.filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
    : [];

  const topNode =
    top ??
    (headline || why ? (
      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <DecisionTop badge={badge} headline={headline} why={why} copyValue={why} />
      </div>
    ) : null);

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneClass(tone)}`}>
      {topNode}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">Market Regime</div>
          <div className="mt-1 break-words text-2xl font-semibold text-white">{labels.regime}</div>
          <div className="mt-2 text-sm text-white/80">
            Strategy: <span className="font-semibold text-white">{labels.marketMode}</span>
          </div>

          {ctx ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
              <span>state owner: {stateOwner}</span>
              <span className="text-white/25">•</span>
              <span>state source: {selectedStateSource}</span>
              <span className="text-white/25">•</span>
              <span>plan source: {resolvedPlanSource}</span>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 text-left text-xs md:text-right">
          <div className={`${fresh.color} font-semibold`}>{fresh.label}</div>
          {safeConfidence !== undefined && (
            <div className="mt-1 text-white/70">Confidence {(safeConfidence * 100).toFixed(0)}%</div>
          )}
        </div>
      </div>

      {ctx ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-full border px-2.5 py-1 ${failSafeTone(failSafeMode)}`}>
            fail-safe: {failSafeMode}
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/70">
            payload: {payloadKind}
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/70">
            marker: {routeBuildMarker}
          </span>
        </div>
      ) : null}

      {ctx && failSafeReasons.length > 0 ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-white/50">Fail-safe reasons</div>
          <div className="flex flex-wrap gap-2">
            {failSafeReasons.map((reason, index) => (
              <span
                key={`${reason}-${index}`}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/85"
              >
                🛡 {reason}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {safeConfidence !== undefined && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-white/50">
            <span>Confidence</span>
            <span>{(safeConfidence * 100).toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-black/30">
            <div
              className="h-2 rounded-full bg-current transition-[width] duration-300"
              style={{ width: `${safeConfidence * 100}%` }}
            />
          </div>
        </div>
      )}

      {safeWarnings.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-white/50">Risk Warnings</div>
          <div className="flex flex-wrap gap-2">
            {safeWarnings.map((warning, index) => (
              <span
                key={`${warning}-${index}`}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/85"
              >
                ⚠ {warning}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
