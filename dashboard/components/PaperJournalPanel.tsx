"use client";

/**
 * PaperJournalPanel.tsx
 * Phase J — Paper Trading Simulation Dashboard
 *
 * แสดง recent paper events, attribution เบื้องต้น, และ expectancy snapshot
 * อ่านจาก /api/paper-status (recentEvents field)
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - ไม่ expose secret / API key ใดๆ
 * - ไม่ crash dashboard ถ้า /api/paper-status ล้มเหลว
 * - ไม่ใช้ paper PnL เป็น live PnL
 * - แสดง "insufficient data" ถ้าไม่มี fills จริง (averageFillPrice = null)
 * - isLive: false เสมอ
 * - session/mode attribution แสดง "unknown" ถ้าข้อมูลไม่พอ
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaperEventSummary = {
  ts: number;
  type: string;
  symbol: string | null;
  mode: string;
  eventKey: string | null;
  orderId: string | null;
  orderStatus: string | null;
  filledQuantity: number | null;
  averageFillPrice: number | null;
  side: string | null;
  quantity: number | null;
  kind: string | null;
  liveOrder: false;
  source: "paper_audit_log";
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
  lastPaperMode: string | null;
  paperModeDetected: boolean;
  auditFilesScanned: number;
  warnings: string[];
  recentEvents?: PaperEventSummary[];
};

type PaperStatusResponse = {
  ok: boolean;
  checkedAt: string;
  paperJournal: PaperJournal;
  isLive: boolean;
  isPaper: boolean;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: PaperStatusResponse; fetchedAt: string }
  | { status: "error"; message: string; fetchedAt: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function eventTypeBadge(type: string): { label: string; cls: string } {
  switch (type) {
    case "ORDER_SIMULATED":
      return {
        label: "SIM",
        cls: "border-blue-700 bg-blue-900/40 text-blue-300",
      };
    case "ORDER_FILLED":
      return {
        label: "FILLED",
        cls: "border-emerald-700 bg-emerald-900/40 text-emerald-300",
      };
    case "ORDER_CANCELED":
      return {
        label: "CANCEL",
        cls: "border-amber-700 bg-amber-900/30 text-amber-300",
      };
    case "ORDER_REJECTED":
      return {
        label: "REJECT",
        cls: "border-rose-700 bg-rose-900/40 text-rose-300",
      };
    case "INTENT_CREATED":
      return {
        label: "INTENT",
        cls: "border-purple-700 bg-purple-900/30 text-purple-300",
      };
    case "RUNNER_REQUESTED":
      return {
        label: "RUNNER",
        cls: "border-neutral-700 bg-neutral-800/50 text-neutral-400",
      };
    case "PLAN_EVALUATED":
      return {
        label: "PLAN",
        cls: "border-neutral-700 bg-neutral-800/50 text-neutral-400",
      };
    case "RISK_EVALUATED":
      return {
        label: "RISK",
        cls: "border-orange-700 bg-orange-900/30 text-orange-300",
      };
    case "MODE_BLOCKED":
      return {
        label: "BLOCKED",
        cls: "border-rose-700 bg-rose-900/30 text-rose-300",
      };
    case "INTENT_REJECTED":
      return {
        label: "INT_REJ",
        cls: "border-rose-700 bg-rose-900/30 text-rose-300",
      };
    case "RECONCILE_RESULT":
      return {
        label: "RECONCILE",
        cls: "border-teal-700 bg-teal-900/30 text-teal-300",
      };
    default:
      return {
        label: type.slice(0, 8),
        cls: "border-neutral-700 bg-neutral-800/40 text-neutral-500",
      };
  }
}

function sideBadge(side: string | null): string {
  if (side === "BUY") return "text-emerald-400";
  if (side === "SELL") return "text-rose-400";
  return "text-neutral-500";
}

/** Attribution by mode — count events per mode */
function buildModeAttribution(
  events: PaperEventSummary[]
): { mode: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const e of events) {
    const m = e.mode || "unknown";
    map[m] = (map[m] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);
}

/** Expectancy snapshot — requires fills with price data */
function buildExpectancySnapshot(events: PaperEventSummary[]): {
  hasData: boolean;
  fills: number;
  reason: string;
} {
  const fills = events.filter(
    (e) =>
      e.type === "ORDER_FILLED" &&
      e.averageFillPrice !== null &&
      (e.averageFillPrice ?? 0) > 0
  );

  if (fills.length === 0) {
    return {
      hasData: false,
      fills: 0,
      reason:
        "ไม่มีข้อมูล fills จริง (averageFillPrice = null) — ยังไม่สามารถคำนวณ expectancy ได้",
    };
  }

  // enough fills to show something
  return {
    hasData: true,
    fills: fills.length,
    reason: `มี ${fills.length} fills — สามารถคำนวณ P&L ขั้นต้นได้`,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaperJournalPanel() {
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
          ⏳ กำลังโหลด Paper Journal…
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
            🔴 Paper Journal — โหลดไม่ได้
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
  const events: PaperEventSummary[] = journal.recentEvents ?? [];
  const modeAttribution = buildModeAttribution(events);
  const expectancy = buildExpectancySnapshot(events);

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (!journal.paperModeDetected || events.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-neutral-400">
            📋 Paper Journal
          </span>
          <span className="inline-flex items-center rounded border border-neutral-700 bg-neutral-800/50 px-1.5 py-0.5 text-xs font-mono text-neutral-500">
            PAPER
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {journal.status === "paper_mode_disabled"
            ? "⛔ Paper Mode ปิดอยู่ — ตั้ง PAPER_TRADING_ENABLED=true"
            : journal.status === "waiting_for_paper_signals"
            ? "⏳ Paper Mode พร้อม — รอ signals เข้ามา"
            : "🔘 ยังไม่มีข้อมูล paper events"}
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          ตรวจเมื่อ: {new Date(data.checkedAt).toLocaleTimeString("th-TH")}
        </p>
      </div>
    );
  }

  // ─── Full render ──────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-blue-900/40 bg-blue-950/10 px-4 py-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-blue-200">
            📋 Paper Journal
          </span>
          <span className="inline-flex items-center rounded border border-blue-700/60 bg-blue-900/40 px-1.5 py-0.5 text-xs font-mono text-blue-300">
            PAPER · NOT LIVE
          </span>
          <span className="text-xs text-neutral-500">
            {events.length} events ล่าสุด
          </span>
        </div>
        <button
          onClick={fetchStatus}
          className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
        >
          รีเฟรช
        </button>
      </div>

      {/* Expectancy snapshot */}
      <div
        className={`mt-2 rounded border px-3 py-2 ${
          expectancy.hasData
            ? "border-emerald-800/40 bg-emerald-950/20"
            : "border-amber-800/30 bg-amber-950/15"
        }`}
      >
        <p className="text-xs font-semibold text-neutral-400">
          Expectancy Snapshot
        </p>
        <p
          className={`mt-0.5 text-xs ${
            expectancy.hasData ? "text-emerald-300" : "text-amber-400/80"
          }`}
        >
          {expectancy.hasData ? "✅" : "⚠"} {expectancy.reason}
        </p>
        <p className="mt-0.5 text-xs text-neutral-600">
          ห้ามใช้ paper results สรุปว่า strategy มี edge โดยไม่มีข้อมูลเพียงพอ
        </p>
      </div>

      {/* Mode attribution */}
      {modeAttribution.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-neutral-500">
            Mode Attribution (ข้อมูล paper events)
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {modeAttribution.map(({ mode, count }) => (
              <span
                key={mode}
                className="inline-flex items-center gap-1 rounded border border-blue-800/40 bg-blue-900/20 px-1.5 py-0.5 text-xs font-mono text-blue-300/70"
              >
                {mode}:<span className="text-blue-200">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Session attribution — minimal since no session tagging in audit logs */}
      <div className="mt-2 rounded border border-neutral-800/40 bg-neutral-900/20 px-2 py-1.5">
        <p className="text-xs text-neutral-500">
          Session Attribution:{" "}
          <span className="text-neutral-600">
            unknown — audit logs ไม่มี session tag (ใช้ timestamp ประมาณเอง)
          </span>
        </p>
      </div>

      {/* Recent events table */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-semibold text-neutral-500">
          Recent Events (ล่าสุด {events.length} รายการ)
        </p>
        <div className="space-y-1">
          {events.map((event, i) => (
            <EventRow key={event.eventKey ?? `evt-${i}`} event={event} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-2 text-xs text-neutral-600">
        ตรวจเมื่อ: {new Date(data.checkedAt).toLocaleTimeString("th-TH")} ·
        mode ล่าสุด: {journal.lastPaperMode ?? "—"}
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventRow({ event }: { event: PaperEventSummary }) {
  const [expanded, setExpanded] = useState(false);
  const badge = eventTypeBadge(event.type);

  return (
    <div className="rounded border border-neutral-800/50 bg-neutral-900/20 px-2 py-1">
      <div
        className="flex cursor-pointer flex-wrap items-center gap-1.5"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Time */}
        <span className="w-16 shrink-0 text-xs font-mono text-neutral-600">
          {formatTs(event.ts)}
        </span>

        {/* Type badge */}
        <span
          className={`inline-flex items-center rounded border px-1 py-0.5 text-xs font-mono ${badge.cls}`}
        >
          {badge.label}
        </span>

        {/* Symbol */}
        {event.symbol && (
          <span className="text-xs font-mono text-neutral-400">
            {event.symbol}
          </span>
        )}

        {/* Side (BUY/SELL) */}
        {event.side && (
          <span className={`text-xs font-bold ${sideBadge(event.side)}`}>
            {event.side}
          </span>
        )}

        {/* Quantity */}
        {event.quantity != null && (
          <span className="text-xs text-neutral-500">
            qty: {event.quantity}
          </span>
        )}

        {/* Fill price or null indicator */}
        {event.type === "ORDER_SIMULATED" && (
          <span className="text-xs text-neutral-600">
            fill: {event.averageFillPrice ?? "null"}
          </span>
        )}

        {/* Expand toggle */}
        <span className="ml-auto text-xs text-neutral-600">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-1 space-y-0.5 border-t border-neutral-800/40 pt-1">
          {event.orderId && (
            <p className="text-xs font-mono text-neutral-500">
              orderId: {event.orderId}
            </p>
          )}
          {event.orderStatus && (
            <p className="text-xs text-neutral-500">
              orderStatus: {event.orderStatus}
            </p>
          )}
          {event.kind && (
            <p className="text-xs text-neutral-500">kind: {event.kind}</p>
          )}
          {event.filledQuantity != null && (
            <p className="text-xs text-neutral-500">
              filledQty: {event.filledQuantity}{" "}
              {event.filledQuantity === 0 && (
                <span className="text-amber-500/70">(ยังไม่มี fill จริง)</span>
              )}
            </p>
          )}
          <p className="text-xs font-mono text-neutral-700">
            mode: {event.mode} · liveOrder: {String(event.liveOrder)} · source:{" "}
            {event.source}
          </p>
        </div>
      )}
    </div>
  );
}
