"use client";

/**
 * NoTradeDiagnosticsPanel.tsx
 * Phase L+ — No-Trade Diagnostics Subcomponent
 *
 * แสดง noTradeDiagnostics: coverage ของ no-trade reason types
 * missing reasons, recommended reasons
 *
 * Safety guarantees:
 * - DISPLAY ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - paper — ไม่ใช่ live trading
 */

import { type NoTradeDiagnostics, type NoTradeReason } from "@/lib/paperPerformance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coverageStyle(status: NoTradeDiagnostics["status"]): {
  border: string;
  bg: string;
  badge: string;
  icon: string;
  label: string;
} {
  switch (status) {
    case "complete":
      return {
        border: "border-emerald-800/50",
        bg: "bg-emerald-950/20",
        badge: "border-emerald-700 bg-emerald-900/30 text-emerald-300",
        icon: "✅",
        label: "Complete",
      };
    case "partial":
      return {
        border: "border-amber-800/50",
        bg: "bg-amber-950/20",
        badge: "border-amber-700 bg-amber-900/30 text-amber-300",
        icon: "⚠️",
        label: "Partial",
      };
    case "missing":
    default:
      return {
        border: "border-rose-800/50",
        bg: "bg-rose-950/20",
        badge: "border-rose-700 bg-rose-900/30 text-rose-300",
        icon: "🔴",
        label: "Missing",
      };
  }
}

function reasonBadgeCls(
  reason: NoTradeReason,
  covered: NoTradeReason[],
  recommended: NoTradeReason[]
): string {
  if (covered.includes(reason)) {
    return "border-emerald-700/50 bg-emerald-900/20 text-emerald-400";
  }
  if (recommended.includes(reason)) {
    return "border-blue-700/50 bg-blue-900/20 text-blue-400";
  }
  return "border-neutral-700/50 bg-neutral-800/20 text-neutral-500";
}

// ─── Component ────────────────────────────────────────────────────────────────

const REQUIRED_REASONS: NoTradeReason[] = [
  "data_missing",
  "regime_unclear",
  "cost_too_high",
  "spread_too_high",
  "slippage_too_high",
  "volatility_extreme",
  "funding_risk",
  "news_risk",
  "runtime_audit_critical",
  "cost_exceeds_edge",
];

type Props = {
  noTradeDiagnostics: NoTradeDiagnostics;
};

export default function NoTradeDiagnosticsPanel({ noTradeDiagnostics: ntd }: Props) {
  const style = coverageStyle(ntd.status);
  const coveredCount = ntd.noTradeReasonCoverage.length;
  const requiredCount = REQUIRED_REASONS.length;
  const coveragePct = requiredCount > 0
    ? Math.round((coveredCount / requiredCount) * 100)
    : 0;

  return (
    <div className={`rounded border ${style.border} ${style.bg} px-3 py-2`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          No-Trade Diagnostics
        </p>
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${style.badge}`}>
          {style.icon} {style.label}
        </span>
      </div>

      {/* Coverage bar */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-neutral-500 whitespace-nowrap">Coverage:</span>
        <div className="flex-1 bg-neutral-800/50 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              coveragePct === 100
                ? "bg-emerald-500"
                : coveragePct >= 50
                ? "bg-amber-500"
                : "bg-rose-500"
            }`}
            style={{ width: `${coveragePct}%` }}
          />
        </div>
        <span className={`text-xs font-mono font-bold ${
          coveragePct === 100
            ? "text-emerald-400"
            : coveragePct >= 50
            ? "text-amber-400"
            : "text-rose-400"
        }`}>
          {coveredCount}/{requiredCount} ({coveragePct}%)
        </span>
      </div>

      {/* Reason badges — all 10 required, colored by status */}
      <div className="mt-2 flex flex-wrap gap-1">
        {REQUIRED_REASONS.map((r) => (
          <span
            key={r}
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${reasonBadgeCls(
              r,
              ntd.noTradeReasonCoverage,
              ntd.recommendedReasons
            )}`}
            title={
              ntd.noTradeReasonCoverage.includes(r)
                ? "Covered ✓"
                : ntd.recommendedReasons.includes(r)
                ? "Recommended — ยังไม่มีข้อมูล"
                : "Missing"
            }
          >
            {ntd.noTradeReasonCoverage.includes(r) ? "✓" : "○"} {r.replace(/_/g, "_")}
          </span>
        ))}
      </div>

      {/* Missing reasons */}
      {ntd.missingReasons.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-rose-400/80 font-medium">
            Missing reasons ({ntd.missingReasons.length}):
          </p>
          <p className="text-xs text-rose-400/60 font-mono mt-0.5">
            {ntd.missingReasons.join(", ")}
          </p>
        </div>
      )}

      {/* Has no-trade logs indicator */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-neutral-500">No-trade log entries:</span>
        <span className={`text-xs font-mono ${ntd.hasNoTradeLogs ? "text-emerald-400" : "text-neutral-600"}`}>
          {ntd.hasNoTradeLogs ? "มีข้อมูล" : "ยังไม่มี"}
        </span>
      </div>

      {/* Next action */}
      <p className="mt-1.5 text-xs text-neutral-600">→ {ntd.nextAction}</p>

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-neutral-700">
        <span className="text-emerald-600">■ Covered</span>
        <span className="text-blue-600">■ Recommended (ยังไม่มีข้อมูล)</span>
        <span className="text-neutral-600">■ Missing</span>
      </div>
    </div>
  );
}
