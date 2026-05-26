"use client";

/**
 * PaperAttributionTable.tsx
 * Phase L+ — Attribution Depth Subcomponent
 *
 * Renders enhanced attribution bucket table (mode/regime/session)
 * with full L+ metrics: grossPnl, totalCost, netPnl, winRate,
 * expectancy, profitFactor, costToGrossProfitRatio.
 *
 * Safety guarantees:
 * - DISPLAY ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - paper PnL ≠ live PnL
 * - ไม่ crash ถ้าข้อมูลไม่ครบ
 */

import { type AttributionBucket } from "@/lib/paperPerformance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtPctRaw(v: number | null, decimals = 0): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtNum(v: number | null, dp = 2): string {
  if (v === null) return "—";
  return v.toFixed(dp);
}

function pnlCls(v: number | null): string {
  if (v === null) return "text-neutral-500";
  return v >= 0 ? "text-emerald-400" : "text-rose-400";
}

function costRatioCls(v: number | null): string {
  if (v === null) return "text-neutral-500";
  if (v > 0.5) return "text-rose-400";
  if (v > 0.3) return "text-amber-400";
  return "text-emerald-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  title: string;
  buckets: AttributionBucket[];
};

export default function PaperAttributionTable({ title, buckets }: Props) {
  const activeBuckets = buckets.filter((b) => b.count > 0);

  if (activeBuckets.length === 0) {
    return (
      <div className="mt-2">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
          {title}
        </p>
        <p className="text-xs text-neutral-600 italic">ยังไม่มีข้อมูลในหมวดนี้</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
        {title}
      </p>

      {/* Scrollable table */}
      <div className="overflow-x-auto rounded border border-neutral-800/40">
        <table className="w-full text-xs min-w-[540px]">
          <thead>
            <tr className="bg-neutral-900/60 text-neutral-600 border-b border-neutral-800/50">
              <th className="text-left px-2 py-1 font-medium">Label</th>
              <th className="text-right px-2 py-1 font-medium">Trades</th>
              <th className="text-right px-2 py-1 font-medium">Gross</th>
              <th className="text-right px-2 py-1 font-medium">Cost</th>
              <th className="text-right px-2 py-1 font-medium">Net PnL</th>
              <th className="text-right px-2 py-1 font-medium">Win%</th>
              <th className="text-right px-2 py-1 font-medium">Expect</th>
              <th className="text-right px-2 py-1 font-medium">PF</th>
              <th className="text-right px-2 py-1 font-medium">C/G</th>
            </tr>
          </thead>
          <tbody>
            {activeBuckets.map((b) => (
              <tr
                key={b.label}
                className="border-b border-neutral-800/20 hover:bg-neutral-800/10 transition-colors"
              >
                <td className="px-2 py-1 font-mono text-neutral-300">{b.label}</td>
                <td className="text-right px-2 py-1 text-neutral-400">{b.count}</td>
                <td className={`text-right px-2 py-1 font-mono ${pnlCls(b.grossPnl)}`}>
                  {fmtUsd(b.grossPnl)}
                </td>
                <td className="text-right px-2 py-1 font-mono text-amber-400/80">
                  {b.totalCost !== null ? `−$${Math.abs(b.totalCost).toFixed(2)}` : "—"}
                </td>
                <td className={`text-right px-2 py-1 font-mono font-bold ${pnlCls(b.netPnl)}`}>
                  {fmtUsd(b.netPnl)}
                </td>
                <td className="text-right px-2 py-1 text-neutral-400">
                  {fmtPctRaw(b.winRate, 0)}
                </td>
                <td className={`text-right px-2 py-1 font-mono ${pnlCls(b.expectancy)}`}>
                  {fmtUsd(b.expectancy)}
                </td>
                <td className={`text-right px-2 py-1 font-mono ${
                  b.profitFactor !== null && b.profitFactor >= 1
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}>
                  {fmtNum(b.profitFactor)}
                </td>
                <td className={`text-right px-2 py-1 font-mono ${costRatioCls(b.costToGrossProfitRatio)}`}>
                  {b.costToGrossProfitRatio !== null
                    ? `${(b.costToGrossProfitRatio * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sample warnings */}
      {activeBuckets.some((b) => b.sampleWarning) && (
        <div className="mt-1 space-y-0.5">
          {activeBuckets
            .filter((b) => b.sampleWarning)
            .map((b) => (
              <p key={b.label} className="text-xs text-amber-400/60">
                ⚠ {b.label}: {b.sampleWarning}
              </p>
            ))}
        </div>
      )}

      {/* Legend */}
      <p className="mt-1 text-xs text-neutral-700">
        Gross=gross PnL, Cost=fees+slip+funding, Net=net PnL, PF=profit factor, C/G=cost/gross ratio
      </p>
    </div>
  );
}
