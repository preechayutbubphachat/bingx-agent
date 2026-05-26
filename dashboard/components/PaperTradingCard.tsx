"use client";

/**
 * PaperTradingCard.tsx
 * Phase J — Paper Trading Simulation Dashboard
 *
 * Operator-friendly overview ของสถานะ Paper Trading
 * อ่านข้อมูลจาก /api/paper-status
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - ไม่ expose secret / API key ใดๆ
 * - ไม่ crash dashboard ถ้า /api/paper-status ล้มเหลว
 * - isLive: false เสมอ — แสดง badge ชัดเจนว่าเป็น PAPER
 * - ไม่ใช้ paper PnL เป็น live PnL
 * - แสดง "insufficient data" ถ้าไม่มี fills จริง
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SafetyFlags = {
  liveTradingEnabled: boolean;
  paperTradingEnabled: string | boolean;
  orderPlacementEnabled: boolean;
  productionTradingReady: boolean;
};

type PaperJournal = {
  status: string;
  totalPaperEvents: number;
  totalOrderSimulated: number;
  totalOrderFilled: number;
  totalOrderCanceled: number;
  totalOrderRejected: number;
  openPaperOrders: number;
  lastPaperEventAt: string | null;
  lastPaperEventType: string | null;
  lastPaperMode: string | null;
  paperModeDetected: boolean;
  auditFilesScanned: number;
  warnings: string[];
  recentEvents?: unknown[];
};

type PaperStatusResponse = {
  ok: boolean;
  version: string;
  checkedAt: string;
  safetyFlags: SafetyFlags;
  paperJournal: PaperJournal;
  statusMessage: string;
  isLive: boolean;
  isPaper: boolean;
  isMonitorOnly: boolean;
  error?: string;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: PaperStatusResponse; fetchedAt: string }
  | { status: "error"; message: string; fetchedAt: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ที่แล้ว`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ที่แล้ว`;
  return `${Math.floor(diffSec / 3600)}h ที่แล้ว`;
}

function paperStatusIcon(status: string): string {
  switch (status) {
    case "has_paper_data":
      return "📄";
    case "waiting_for_paper_signals":
      return "⏳";
    case "no_paper_trades":
      return "🔘";
    case "paper_mode_disabled":
      return "⛔";
    default:
      return "❓";
  }
}

function paperStatusLabel(status: string): string {
  switch (status) {
    case "has_paper_data":
      return "มีข้อมูล Paper";
    case "waiting_for_paper_signals":
      return "รอ Signals";
    case "no_paper_trades":
      return "ยังไม่มี Trades";
    case "paper_mode_disabled":
      return "Paper Mode ปิด";
    default:
      return "ไม่ทราบสถานะ";
  }
}

function safetyFlagBadge(enabled: boolean | string): { label: string; cls: string } {
  const isTrue =
    enabled === true ||
    (typeof enabled === "string" && enabled.toLowerCase() === "true");
  if (isTrue) {
    return {
      label: "ENABLED",
      cls: "border-emerald-700 bg-emerald-900/40 text-emerald-300",
    };
  }
  return {
    label: typeof enabled === "string" && enabled !== "false" ? enabled.toUpperCase() : "DISABLED",
    cls: "border-neutral-700 bg-neutral-800/50 text-neutral-400",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaperTradingCard() {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  async function fetchStatus() {
    setState({ status: "loading" });
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/paper-status", { cache: "no-store" });
      if (!res.ok) {
        setState({ status: "error", message: `HTTP ${res.status}`, fetchedAt });
        return;
      }
      const data: PaperStatusResponse = await res.json();
      setState({ status: "ok", data, fetchedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setState({ status: "error", message: msg, fetchedAt });
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/40 px-4 py-3">
        <span className="text-sm text-neutral-400 animate-pulse">
          ⏳ กำลังโหลด Paper Trading status…
        </span>
      </div>
    );
  }

  // ─── Fetch error ──────────────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-rose-300">
            🔴 Paper Trading Card — โหลดไม่ได้
          </span>
          <button
            onClick={fetchStatus}
            className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700/60"
          >
            ลองใหม่
          </button>
        </div>
        <p className="mt-1 text-xs text-rose-400/70">{state.message}</p>
      </div>
    );
  }

  const { data } = state;
  const journal = data.paperJournal;
  const status = journal.status;
  const hasPaperData = status === "has_paper_data";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-4 py-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-blue-300">
            {paperStatusIcon(status)} Paper Trading Simulation
          </span>
          {/* PAPER badge — always shown, never LIVE */}
          <span className="inline-flex items-center rounded border border-blue-700 bg-blue-900/50 px-1.5 py-0.5 text-xs font-mono text-blue-300">
            PAPER
          </span>
          {/* NOT LIVE badge */}
          <span className="inline-flex items-center rounded border border-neutral-700 bg-neutral-800/60 px-1.5 py-0.5 text-xs font-mono text-neutral-500">
            NOT LIVE
          </span>
        </div>
        <button
          onClick={fetchStatus}
          className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
        >
          รีเฟรช
        </button>
      </div>

      {/* Status message */}
      <p className="mt-2 text-sm text-blue-200/80">{data.statusMessage}</p>

      {/* Safety flags row */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <FlagChip
          label="LIVE"
          badge={safetyFlagBadge(data.safetyFlags.liveTradingEnabled)}
          warn={data.safetyFlags.liveTradingEnabled === true}
        />
        <FlagChip
          label="PAPER"
          badge={safetyFlagBadge(data.safetyFlags.paperTradingEnabled)}
        />
        <FlagChip
          label="ORDER_PLACEMENT"
          badge={safetyFlagBadge(data.safetyFlags.orderPlacementEnabled)}
          warn={data.safetyFlags.orderPlacementEnabled === true}
        />
      </div>

      {/* Stats grid */}
      {hasPaperData && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatBox label="Events รวม" value={journal.totalPaperEvents} />
          <StatBox label="Orders Simulated" value={journal.totalOrderSimulated} />
          <StatBox label="Filled" value={journal.totalOrderFilled} dim={journal.totalOrderFilled === 0} />
          <StatBox label="Canceled" value={journal.totalOrderCanceled} />
          <StatBox label="Rejected" value={journal.totalOrderRejected} />
          <StatBox label="Open Orders" value={journal.openPaperOrders} />
        </div>
      )}

      {/* PnL disclaimer — no fills = no PnL */}
      <div className="mt-2 rounded border border-amber-800/30 bg-amber-950/15 px-3 py-1.5">
        <p className="text-xs text-amber-400/80">
          ⚠ PnL:{" "}
          {journal.totalOrderFilled > 0
            ? "มีข้อมูล fills — ดูใน Paper Journal Panel"
            : "ไม่มีข้อมูล fills จริง (averageFillPrice = null) — insufficient paper data"}
        </p>
        {!hasPaperData && (
          <p className="mt-0.5 text-xs text-neutral-500">
            {paperStatusLabel(status)}
          </p>
        )}
      </div>

      {/* Last event */}
      {journal.lastPaperEventAt && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
          <span>
            เหตุการณ์ล่าสุด:{" "}
            <span className="text-neutral-400">
              {journal.lastPaperEventType ?? "—"}
            </span>
          </span>
          <span>{formatRelativeTime(journal.lastPaperEventAt)}</span>
          {journal.lastPaperMode && (
            <span className="font-mono text-blue-400/70">
              mode: {journal.lastPaperMode}
            </span>
          )}
        </div>
      )}

      {/* Warnings */}
      {journal.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {journal.warnings.map((w, i) => (
            <p key={i} className="text-xs text-neutral-500">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="mt-2 text-xs text-neutral-600">
        ตรวจเมื่อ: {new Date(data.checkedAt).toLocaleTimeString("th-TH")} ·
        ไฟล์ที่สแกน: {journal.auditFilesScanned}
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: number;
  dim?: boolean;
}) {
  return (
    <div className="rounded border border-neutral-800/60 bg-neutral-900/30 px-2 py-1.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-base font-mono font-bold ${dim ? "text-neutral-600" : "text-blue-300"}`}>
        {value}
      </p>
    </div>
  );
}

function FlagChip({
  label,
  badge,
  warn = false,
}: {
  label: string;
  badge: { label: string; cls: string };
  warn?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${
        warn ? "border-rose-700 bg-rose-900/40 text-rose-300" : badge.cls
      }`}
    >
      <span className="opacity-60">{label}:</span>
      <span>{warn ? "⚠ " + badge.label : badge.label}</span>
    </span>
  );
}
