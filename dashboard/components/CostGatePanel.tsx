"use client";

/**
 * CostGatePanel.tsx
 * Phase L+ — Cost Gate Subcomponent
 *
 * แสดง costGate result: roundTripCostPct vs gridSpacingPct
 * pass / fail / warn / unknown
 *
 * Safety guarantees:
 * - DISPLAY ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - paper — ไม่ใช่ live trading
 */

import { type CostGate } from "@/lib/paperPerformance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gateCls(status: CostGate["status"]): {
  border: string;
  bg: string;
  badge: string;
  icon: string;
} {
  switch (status) {
    case "pass":
      return {
        border: "border-emerald-800/50",
        bg: "bg-emerald-950/20",
        badge: "border-emerald-700 bg-emerald-900/30 text-emerald-300",
        icon: "✅",
      };
    case "fail":
      return {
        border: "border-rose-800/50",
        bg: "bg-rose-950/20",
        badge: "border-rose-700 bg-rose-900/30 text-rose-300",
        icon: "🔴",
      };
    case "warn":
      return {
        border: "border-amber-800/50",
        bg: "bg-amber-950/20",
        badge: "border-amber-700 bg-amber-900/30 text-amber-300",
        icon: "⚠️",
      };
    case "unknown":
    default:
      return {
        border: "border-neutral-700/50",
        bg: "bg-neutral-900/20",
        badge: "border-neutral-700 bg-neutral-900/30 text-neutral-400",
        icon: "⚪",
      };
  }
}

function fmtPct(v: number | null, dp = 3): string {
  if (v === null) return "—";
  return `${v.toFixed(dp)}%`;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  costGate: CostGate;
};

export default function CostGatePanel({ costGate }: Props) {
  const style = gateCls(costGate.status);

  const spacingOk =
    costGate.gridSpacingPct !== null &&
    costGate.gridSpacingPct >= costGate.requiredMinSpacingPct;

  return (
    <div className={`rounded border ${style.border} ${style.bg} px-3 py-2`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Cost Gate
        </p>
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${style.badge}`}>
          {style.icon} {costGate.status.toUpperCase()}
        </span>
      </div>

      {/* Comparison */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {/* Round-trip cost */}
        <div className="flex justify-between items-center border-b border-neutral-800/20 py-0.5">
          <span className="text-xs text-neutral-500">Round-trip cost</span>
          <span className="text-xs font-mono text-amber-400">
            {fmtPct(costGate.roundTripCostPct)}
          </span>
        </div>

        {/* Required min spacing */}
        <div className="flex justify-between items-center border-b border-neutral-800/20 py-0.5">
          <span className="text-xs text-neutral-500">Required min spacing</span>
          <span className="text-xs font-mono text-neutral-300">
            {fmtPct(costGate.requiredMinSpacingPct)} (×2.5)
          </span>
        </div>

        {/* Actual grid spacing */}
        <div className="flex justify-between items-center border-b border-neutral-800/20 py-0.5">
          <span className="text-xs text-neutral-500">Actual grid spacing</span>
          <span className={`text-xs font-mono font-bold ${
            costGate.gridSpacingPct === null
              ? "text-neutral-500"
              : spacingOk
              ? "text-emerald-400"
              : "text-rose-400"
          }`}>
            {fmtPct(costGate.gridSpacingPct)}
            {costGate.gridSpacingPct !== null && (
              <span className="ml-1">{spacingOk ? "✓" : "✗"}</span>
            )}
          </span>
        </div>

        {/* Pass field */}
        <div className="flex justify-between items-center border-b border-neutral-800/20 py-0.5">
          <span className="text-xs text-neutral-500">Gate pass</span>
          <span className={`text-xs font-mono font-bold ${
            costGate.pass === true
              ? "text-emerald-400"
              : costGate.pass === false
              ? "text-rose-400"
              : "text-neutral-500"
          }`}>
            {costGate.pass === null ? "unknown" : costGate.pass ? "PASS" : "FAIL"}
          </span>
        </div>
      </div>

      {/* Warning */}
      {costGate.warning && (
        <p className="mt-1.5 text-xs text-amber-400/80">⚠ {costGate.warning}</p>
      )}

      {/* Next action */}
      <p className="mt-1.5 text-xs text-neutral-600">→ {costGate.nextAction}</p>

      {/* Formula note */}
      <p className="mt-1 text-xs text-neutral-700">
        สูตร: requiredMinSpacing = roundTripCost × 2.5 — grid spacing ต้องเกิน requiredMinSpacing เพื่อมี edge
      </p>
    </div>
  );
}
