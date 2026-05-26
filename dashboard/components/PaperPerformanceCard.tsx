"use client";

/**
 * PaperPerformanceCard.tsx
 * Phase L+ — Attribution Depth & Edge Diagnostics (UI)
 *
 * UI card แสดง paper trading performance metrics — L+ version
 * อ่านข้อมูลจาก /api/paper-performance
 * ใช้ subcomponents: PaperAttributionTable, CostGatePanel, NoTradeDiagnosticsPanel
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - paper PnL ≠ live PnL (แสดงชัดเจนใน UI)
 * - default edgeStatus = "unproven"
 * - ไม่ crash dashboard ถ้า API ล้มเหลว
 * - ไม่ expose secret / API key
 */

import { useEffect, useState } from "react";
import PaperAttributionTable from "@/components/PaperAttributionTable";
import CostGatePanel from "@/components/CostGatePanel";
import NoTradeDiagnosticsPanel from "@/components/NoTradeDiagnosticsPanel";
import {
  type EdgeStatus,
  type SampleSizeStatus,
  type CostDragStatus,
  type NoTradeReason,
  type AttributionBucket,
  type CostGate,
  type FailureEntry,
  type EdgeDiagnostics,
  type NoTradeDiagnostics,
  type PaperDataQuality,
} from "@/lib/paperPerformance";

// ─── Types ───────────────────────────────────────────────────────────────────

type PaperPerformanceData = {
  ok: boolean;
  readOnly: true;
  status: "no_data" | "insufficient_data" | "has_data";
  edgeStatus: EdgeStatus;
  totalEvents: number;
  totalPaperOrders: number;
  totalPaperFills: number;
  sampleSizeStatus: SampleSizeStatus;
  grossPaperPnl: number | null;
  feeEstimateTotal: number | null;
  slippageEstimateTotal: number | null;
  fundingEstimateTotal: number | null;
  netPaperPnl: number | null;
  winRate: number | null;
  lossRate: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  averageHoldingTime: number | null;
  costToGrossProfitRatio: number | null;
  costDragStatus: CostDragStatus;
  // L+ fields
  costGate: CostGate;
  edgeDiagnostics: EdgeDiagnostics;
  failureReasons: FailureEntry[];
  totalLossCycles: number;
  unknownFailurePct: number | null;
  noTradeDiagnostics: NoTradeDiagnostics;
  // legacy
  gridSpacingCheck: {
    spacingPct: number | null;
    roundTripCostPct: number | null;
    passes: boolean | null;
    note: string;
  };
  noTradeReasons: NoTradeReason[];
  noTradeReadiness: "ready" | "not_ready" | "unknown";
  attribution: {
    byMode: AttributionBucket[];
    byRegime: AttributionBucket[];
    bySession: AttributionBucket[];
  };
  paperDataQuality?: PaperDataQuality;
  dataAvailableForPnl: boolean;
  pnlSource: "paper_pnl_log" | "fill_pair_estimate" | "none";
  warnings: string[];
  nextActions: string[];
  checkedAt: string;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: PaperPerformanceData; fetchedAt: string }
  | { status: "error"; message: string; fetchedAt: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function edgeStatusStyle(s: EdgeStatus): { label: string; cls: string; icon: string } {
  switch (s) {
    case "positive_candidate":
      return { label: "Positive Candidate", cls: "border-emerald-700 bg-emerald-900/30 text-emerald-300", icon: "✅" };
    case "positive_unconfirmed":
      return { label: "Positive (ยังไม่ยืนยัน)", cls: "border-blue-700 bg-blue-900/30 text-blue-300", icon: "🔵" };
    case "regime_specific_candidate":
      return { label: "Regime-Specific Candidate", cls: "border-cyan-700 bg-cyan-900/30 text-cyan-300", icon: "🔷" };
    case "cost_dragged":
      return { label: "Cost Dragged", cls: "border-orange-700 bg-orange-900/30 text-orange-300", icon: "💸" };
    case "blocked_by_drawdown":
      return { label: "Blocked — Drawdown", cls: "border-rose-700 bg-rose-900/30 text-rose-300", icon: "🔴" };
    case "sample_insufficient":
      return { label: "Sample Insufficient (<30)", cls: "border-amber-700 bg-amber-900/30 text-amber-300", icon: "⚠️" };
    case "negative":
      return { label: "Negative Edge", cls: "border-rose-700 bg-rose-900/30 text-rose-300", icon: "🔴" };
    case "unproven":
    default:
      return { label: "Unproven", cls: "border-neutral-700 bg-neutral-900/30 text-neutral-400", icon: "⚪" };
  }
}

function sampleLabel(s: SampleSizeStatus): { label: string; cls: string } {
  switch (s) {
    case "robust_sample":
      return { label: "Robust (≥50 fills)", cls: "text-emerald-400" };
    case "usable_sample":
      return { label: "Usable (≥20 fills)", cls: "text-blue-400" };
    case "early_sample":
      return { label: "Early (≥5 fills)", cls: "text-amber-400" };
    case "insufficient_data":
    default:
      return { label: "ข้อมูลไม่พอ (<5 fills)", cls: "text-rose-400" };
  }
}

function costDragStyle(s: CostDragStatus): string {
  switch (s) {
    case "critical_cost_drag": return "text-rose-400";
    case "cost_drag_high": return "text-amber-400";
    case "ok": return "text-emerald-400";
  }
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function fmtUsd(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtNum(v: number | null, dp = 2): string {
  if (v === null) return "—";
  return v.toFixed(dp);
}

function fmtTime(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${sec.toFixed(0)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ที่แล้ว`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ที่แล้ว`;
  return `${Math.floor(diffSec / 3600)}h ที่แล้ว`;
}

// ─── Metric Row ───────────────────────────────────────────────────────────────

function MetricRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5 border-b border-neutral-800/20">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={`text-xs font-mono ${cls ?? "text-neutral-300"}`}>{value}</span>
    </div>
  );
}

// ─── Failure Reasons Panel ────────────────────────────────────────────────────

function FailureReasonsPanel({
  failureReasons,
  totalLossCycles,
  unknownFailurePct,
}: {
  failureReasons: FailureEntry[];
  totalLossCycles: number;
  unknownFailurePct: number | null;
}) {
  if (failureReasons.length === 0) {
    return (
      <div className="rounded border border-neutral-800/40 bg-neutral-900/20 px-3 py-2">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
          Failure Reasons
        </p>
        <p className="mt-1 text-xs text-neutral-600 italic">
          ยังไม่มีข้อมูล loss cycles
        </p>
      </div>
    );
  }

  const highUnknown = unknownFailurePct !== null && unknownFailurePct >= 0.5;

  return (
    <div className="rounded border border-neutral-800/40 bg-neutral-900/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
          Failure Reasons
        </p>
        <span className="text-xs text-neutral-600">
          {totalLossCycles} loss cycles
        </span>
      </div>

      {highUnknown && (
        <p className="mt-1 text-xs text-amber-400/80">
          ⚠ unknown_failure {Math.round((unknownFailurePct ?? 0) * 100)}% — เพิ่ม failureReason ใน paper_pnl.jsonl
        </p>
      )}

      <div className="mt-2 space-y-0.5">
        {failureReasons.slice(0, 8).map((f) => (
          <div key={f.reason} className="flex items-center gap-2">
            {/* Bar */}
            <div className="flex-1 bg-neutral-800/40 rounded-full h-1 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  f.reason === "unknown_failure" ? "bg-amber-500/60" : "bg-rose-500/60"
                }`}
                style={{ width: `${Math.min(f.pct * 100, 100).toFixed(0)}%` }}
              />
            </div>
            <span className="w-20 text-right text-xs font-mono text-neutral-400">
              {f.reason.replace(/_/g, " ")}
            </span>
            <span className="w-10 text-right text-xs font-mono text-neutral-500">
              {f.count}
            </span>
            <span className={`w-12 text-right text-xs font-mono ${
              f.reason === "unknown_failure" ? "text-amber-400" : "text-rose-400"
            }`}>
              {(f.pct * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Paper Data Quality Section ──────────────────────────────────────────────

function PaperDataQualitySection({ dq }: { dq: PaperDataQuality | undefined }) {
  if (!dq) return null;

  const qualityCls: Record<string, string> = {
    insufficient: "border-rose-800 bg-rose-950/30 text-rose-400",
    partial: "border-amber-800 bg-amber-950/30 text-amber-300",
    usable: "border-blue-800 bg-blue-950/30 text-blue-300",
    robust: "border-emerald-800 bg-emerald-950/30 text-emerald-300",
  };
  const qualityLabel: Record<string, string> = {
    insufficient: "⛔ Insufficient — ยังสรุป edge ไม่ได้",
    partial: "⚠ Partial — ข้อมูลบางส่วนขาด",
    usable: "✔ Usable — ข้อมูลพอวิเคราะห์เบื้องต้น",
    robust: "✅ Robust — ข้อมูลครบ",
  };

  const checks: { key: keyof PaperDataQuality; label: string }[] = [
    { key: "hasAverageFillPrice", label: "averageFillPrice (fills จริง)" },
    { key: "hasClosedTrades", label: "Closed round-trip trades" },
    { key: "hasModeTags", label: "Mode tags (≥30% tagged)" },
    { key: "hasRegimeTags", label: "Regime tags (≥30% tagged)" },
    { key: "hasSessionTags", label: "Session tags (ts-derived)" },
    { key: "hasGridSpacing", label: "gridSpacingPct" },
    { key: "hasCostEstimates", label: "Cost estimates (fee/slippage)" },
    { key: "hasNoTradeReasons", label: "No-trade reason logs" },
  ];

  const cls = qualityCls[dq.qualityStatus] ?? qualityCls["insufficient"];
  const label = qualityLabel[dq.qualityStatus] ?? "Unknown";

  return (
    <div className={`rounded border px-3 py-2 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider">
          Paper Data Quality
        </p>
        <span className="text-xs font-mono">{label}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
        {checks.map(({ key, label: l }) => {
          const val = dq[key] as boolean;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`text-xs ${val ? "text-emerald-400" : "text-rose-400"}`}>
                {val ? "✓" : "✗"}
              </span>
              <span className="text-xs text-neutral-400 truncate">{l}</span>
            </div>
          );
        })}
      </div>

      {dq.missingFields.length > 0 && (
        <p className="mt-1.5 text-xs text-neutral-500">
          Missing: {dq.missingFields.join(", ")}
        </p>
      )}

      {dq.nextActions.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {dq.nextActions.slice(0, 3).map((a, i) => (
            <p key={i} className="text-xs text-amber-400/80">→ {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edge Diagnostics Summary ─────────────────────────────────────────────────

function EdgeDiagnosticsSection({ ed }: { ed: EdgeDiagnostics }) {
  return (
    <div className="rounded border border-neutral-800/40 bg-neutral-900/20 px-3 py-2">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
        Edge Diagnostics
      </p>
      <p className="mt-1 text-xs text-neutral-400">{ed.summary}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4">
        <MetricRow label="Closed cycles" value={String(ed.closedCycles)} />
        <MetricRow
          label="Dominant mode"
          value={ed.dominantMode ?? "—"}
          cls="text-blue-400"
        />
        <MetricRow
          label="Dominant regime"
          value={ed.dominantRegime ?? "—"}
          cls="text-cyan-400"
        />
        <MetricRow
          label="Cost/Gross ratio"
          value={
            ed.costToGrossProfitRatio !== null
              ? `${(ed.costToGrossProfitRatio * 100).toFixed(1)}%`
              : "—"
          }
          cls={
            ed.costToGrossProfitRatio !== null && ed.costToGrossProfitRatio > 0.5
              ? "text-rose-400"
              : "text-neutral-300"
          }
        />
      </div>
      {ed.positiveRegimes.length > 0 && (
        <p className="mt-1 text-xs text-emerald-400/70">
          ✓ Positive regimes: {ed.positiveRegimes.join(", ")}
        </p>
      )}
      {ed.negativeRegimes.length > 0 && (
        <p className="mt-0.5 text-xs text-rose-400/70">
          ✗ Negative regimes: {ed.negativeRegimes.join(", ")}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaperPerformanceCard() {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [showAttribution, setShowAttribution] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  async function fetchPerformance() {
    setState({ status: "loading" });
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/paper-performance", { cache: "no-store" });
      if (!res.ok) {
        setState({ status: "error", message: `HTTP ${res.status}`, fetchedAt });
        return;
      }
      const data: PaperPerformanceData = await res.json();
      setState({ status: "ok", data, fetchedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setState({ status: "error", message: msg, fetchedAt });
    }
  }

  useEffect(() => {
    fetchPerformance();
  }, []);

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/40 px-4 py-3">
        <span className="text-sm text-neutral-400 animate-pulse">
          ⏳ กำลังโหลด Paper Performance…
        </span>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-rose-300">🔴 Paper Performance — โหลดไม่ได้</span>
          <button
            onClick={fetchPerformance}
            className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700/60"
          >
            ลองใหม่
          </button>
        </div>
        <p className="mt-1 text-xs text-rose-400/70">{state.message}</p>
      </div>
    );
  }

  const { data, fetchedAt } = state;
  const edge = edgeStatusStyle(data.edgeStatus);
  const sample = sampleLabel(data.sampleSizeStatus);

  // ─── No data state ────────────────────────────────────────────────────────────
  if (data.status === "no_data") {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-400">📊 Paper Performance</span>
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${edge.cls}`}>
              {edge.icon} {edge.label}
            </span>
          </div>
          <button
            onClick={fetchPerformance}
            className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
          >
            รีเฟรช
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          ยังไม่มีข้อมูล paper trading — รอ paper signals หรือตรวจ PAPER_TRADING_ENABLED
        </p>
        {data.nextActions.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {data.nextActions.map((a, i) => (
              <p key={i} className="text-xs text-amber-400/80">→ {a}</p>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-600">
          ตรวจเมื่อ: {formatRelativeTime(fetchedAt)}
        </p>
      </div>
    );
  }

  // ─── Has data render ──────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-blue-900/30 bg-blue-950/10 px-4 py-3 space-y-3">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-blue-300">📊 Paper Performance</span>
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${edge.cls}`}>
            {edge.icon} {edge.label}
          </span>
          <span className="text-xs text-rose-400/70 font-mono">[PAPER — ไม่ใช่ live]</span>
        </div>
        <button
          onClick={fetchPerformance}
          className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
        >
          รีเฟรช
        </button>
      </div>

      {/* ── Sample size ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-neutral-500">Sample:</span>
        <span className={`text-xs font-mono font-bold ${sample.cls}`}>{sample.label}</span>
        <span className="text-xs text-neutral-600">
          ({data.totalPaperFills} fills / {data.totalPaperOrders} orders / {data.totalEvents} events)
        </span>
        {data.pnlSource !== "none" && (
          <span className="text-xs text-neutral-600 font-mono">src: {data.pnlSource}</span>
        )}
      </div>

      {/* ── Core metrics ── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
        <MetricRow
          label="Net PnL (paper)"
          value={fmtUsd(data.netPaperPnl)}
          cls={data.netPaperPnl !== null && data.netPaperPnl >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <MetricRow label="Gross PnL" value={fmtUsd(data.grossPaperPnl)} />
        <MetricRow label="Fee estimate" value={fmtUsd(data.feeEstimateTotal)} cls="text-amber-400" />
        <MetricRow
          label="Expectancy"
          value={fmtUsd(data.expectancy)}
          cls={data.expectancy !== null && data.expectancy >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <MetricRow label="Win Rate" value={fmtPct(data.winRate)} />
        <MetricRow label="Payoff Ratio" value={fmtNum(data.payoffRatio)} />
        <MetricRow label="Profit Factor" value={fmtNum(data.profitFactor)} />
        <MetricRow label="Max Drawdown" value={fmtUsd(data.maxDrawdown)} cls="text-rose-400/80" />
        <MetricRow label="Avg Hold Time" value={fmtTime(data.averageHoldingTime)} />
      </div>

      {/* ── Cost drag (legacy compact) ── */}
      <div className="rounded border border-neutral-800/40 bg-neutral-900/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Cost Drag</p>
          <span className={`text-xs font-mono font-bold ${costDragStyle(data.costDragStatus)}`}>
            {data.costDragStatus.replace(/_/g, " ").toUpperCase()}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-4">
          <MetricRow
            label="Cost / Gross PnL"
            value={data.costToGrossProfitRatio !== null
              ? `${(data.costToGrossProfitRatio * 100).toFixed(1)}%`
              : "—"}
            cls={costDragStyle(data.costDragStatus)}
          />
          <MetricRow
            label="Round-trip cost"
            value={data.gridSpacingCheck.roundTripCostPct !== null
              ? `${data.gridSpacingCheck.roundTripCostPct.toFixed(3)}%`
              : "—"}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-600">{data.gridSpacingCheck.note}</p>
      </div>

      {/* ── L+: Cost Gate ── */}
      <CostGatePanel costGate={data.costGate} />

      {/* ── L+: No-trade readiness (legacy) ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-neutral-500">No-trade readiness:</span>
        <span className={`text-xs font-mono font-bold ${
          data.noTradeReadiness === "ready" ? "text-emerald-400" :
          data.noTradeReadiness === "not_ready" ? "text-rose-400" : "text-neutral-500"
        }`}>
          {data.noTradeReadiness.toUpperCase()}
        </span>
        {data.noTradeReasons.length > 0 && (
          <span className="text-xs text-amber-400/70">
            ({data.noTradeReasons.join(", ")})
          </span>
        )}
      </div>

      {/* ── L+: No-Trade Diagnostics ── */}
      <NoTradeDiagnosticsPanel noTradeDiagnostics={data.noTradeDiagnostics} />

      {/* ── Toggle: Attribution + Diagnostics ── */}
      <div className="space-y-2">
        {/* Attribution toggle */}
        <button
          onClick={() => setShowAttribution((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-300"
        >
          <span>{showAttribution ? "▲" : "▼"}</span>
          <span>Attribution by Mode / Regime / Session</span>
        </button>

        {showAttribution && (
          <div className="space-y-3 border-t border-neutral-800/40 pt-2">
            <PaperAttributionTable title="By Mode" buckets={data.attribution.byMode} />
            <PaperAttributionTable title="By Regime" buckets={data.attribution.byRegime} />
            <PaperAttributionTable title="By Session" buckets={data.attribution.bySession} />
          </div>
        )}

        {/* Diagnostics toggle */}
        <button
          onClick={() => setShowDiagnostics((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-300"
        >
          <span>{showDiagnostics ? "▲" : "▼"}</span>
          <span>Edge Diagnostics &amp; Failure Reasons</span>
        </button>

        {showDiagnostics && (
          <div className="space-y-3 border-t border-neutral-800/40 pt-2">
            <PaperDataQualitySection dq={data.paperDataQuality} />
            <EdgeDiagnosticsSection ed={data.edgeDiagnostics} />
            <FailureReasonsPanel
              failureReasons={data.failureReasons}
              totalLossCycles={data.totalLossCycles}
              unknownFailurePct={data.unknownFailurePct}
            />
          </div>
        )}
      </div>

      {/* ── Warnings ── */}
      {data.warnings.length > 0 && (
        <div className="space-y-0.5">
          {data.warnings.slice(0, 4).map((w, i) => (
            <p key={i} className="text-xs text-neutral-600">⚠ {w}</p>
          ))}
        </div>
      )}

      {/* ── Next actions ── */}
      {data.nextActions.length > 0 && (
        <div className="space-y-0.5">
          {data.nextActions.slice(0, 4).map((a, i) => (
            <p key={i} className="text-xs text-amber-400/80">→ {a}</p>
          ))}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800/40 pt-2">
        <p className="text-xs text-neutral-600">ตรวจเมื่อ: {formatRelativeTime(fetchedAt)}</p>
        <span className="text-xs font-mono text-neutral-700">readOnly: {String(data.readOnly)}</span>
        <span className="text-xs font-mono text-blue-900">paper — ไม่ใช่ live trading</span>
      </div>
    </div>
  );
}
