"use client";

/**
 * LiveMigrationGateCard.tsx
 * Phase K — Live Migration Gate
 *
 * แสดง go/no-go checklist สำหรับ operator บน /public dashboard
 * อ่านข้อมูลจาก /api/health (liveReadiness field)
 *
 * Safety guarantees:
 * - READ ONLY — ไม่เขียนไฟล์ / ไม่ call BingX API
 * - ไม่เปิด live trading / order placement ไม่ว่ากรณีใด
 * - isLive: false เสมอ
 * - default status = BLOCKED
 * - manual approval required เสมอ
 * - ไม่ crash dashboard ถ้า /api/health ล้มเหลว
 * - ไม่ expose secret / API key
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type GateResult = {
  id: string;
  label: string;
  status: string;
  severity: string;
  passed: boolean;
  reasons: string[];
  nextActions: string[];
};

type LiveReadinessSummary = {
  total: number;
  passed: number;
  warning: number;
  blocked: number;
  critical: number;
};

type LiveReadiness = {
  ok: false;
  status: string;
  liveTradingEnabled: false;
  orderPlacementEnabled: false;
  productionTradingReady: false;
  manualApprovalRequired: true;
  manualApprovalStatus: string;
  summary: LiveReadinessSummary;
  gates: GateResult[];
  warnings: string[];
  blockers: string[];
  nextActions: string[];
  readOnly: true;
};

type HealthResponse = {
  healthy: boolean;
  liveReadiness?: LiveReadiness | null;
  checkedAt?: string;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: LiveReadiness; fetchedAt: string }
  | { status: "no_field"; fetchedAt: string }
  | { status: "error"; message: string; fetchedAt: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function overallStatusLabel(status: string): { label: string; cls: string; icon: string } {
  switch (status) {
    case "ALL_PASSED_MANUAL_APPROVAL_PENDING":
      return {
        label: "รอ Manual Approval",
        cls: "border-amber-700 bg-amber-900/30 text-amber-300",
        icon: "⏳",
      };
    case "READY_FOR_REVIEW":
      return {
        label: "พร้อมให้ Review",
        cls: "border-blue-700 bg-blue-900/30 text-blue-300",
        icon: "🔍",
      };
    case "BLOCKED":
    default:
      return {
        label: "BLOCKED — ยังไม่พร้อม",
        cls: "border-rose-800 bg-rose-950/30 text-rose-300",
        icon: "🚫",
      };
  }
}

function gateStatusIcon(passed: boolean, status: string): string {
  if (passed && status === "PASSED") return "✅";
  if (passed && status === "WARNING") return "⚠️";
  if (status === "ERROR") return "🔴";
  return "🚫";
}

function gateSeverityStyle(severity: string, passed: boolean): string {
  if (passed && severity === "info") return "border-emerald-800/40 bg-emerald-950/20";
  if (passed && severity === "warning") return "border-amber-800/40 bg-amber-950/20";
  if (severity === "blocker" || severity === "critical") return "border-rose-800/40 bg-rose-950/20";
  if (severity === "warning") return "border-amber-800/40 bg-amber-950/20";
  return "border-neutral-800/40 bg-neutral-900/20";
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ที่แล้ว`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ที่แล้ว`;
  return `${Math.floor(diffSec / 3600)}h ที่แล้ว`;
}

// ─── Gate Row Sub-component ───────────────────────────────────────────────────

function GateRow({ gate, expanded, onToggle }: {
  gate: GateResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const icon = gateStatusIcon(gate.passed, gate.status);
  const rowStyle = gateSeverityStyle(gate.severity, gate.passed);

  return (
    <div className={`rounded border px-3 py-2 ${rowStyle}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className={`text-sm font-medium ${gate.passed ? "text-neutral-300" : "text-rose-300"}`}>
            {gate.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs ${gate.passed ? "text-emerald-400" : "text-rose-400"}`}>
            {gate.status.replace(/_/g, " ")}
          </span>
          <span className="text-xs text-neutral-500">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-neutral-800/40 pt-2">
          {gate.reasons.map((r, i) => (
            <p key={i} className="text-xs text-neutral-400">
              {r}
            </p>
          ))}
          {gate.nextActions.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {gate.nextActions.map((a, i) => (
                <p key={i} className="text-xs text-amber-400/80">
                  → {a}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveMigrationGateCard() {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [expandedGates, setExpandedGates] = useState<Set<string>>(new Set());

  async function fetchReadiness() {
    setState({ status: "loading" });
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) {
        setState({ status: "error", message: `HTTP ${res.status}`, fetchedAt });
        return;
      }
      const data: HealthResponse = await res.json();
      if (!data.liveReadiness) {
        setState({ status: "no_field", fetchedAt });
        return;
      }
      setState({ status: "ok", data: data.liveReadiness, fetchedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setState({ status: "error", message: msg, fetchedAt });
    }
  }

  useEffect(() => {
    fetchReadiness();
  }, []);

  function toggleGate(id: string) {
    setExpandedGates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/40 px-4 py-3">
        <span className="text-sm text-neutral-400 animate-pulse">
          ⏳ กำลังโหลด Live Migration Gate…
        </span>
      </div>
    );
  }

  // ─── Fetch error ─────────────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-rose-300">
            🔴 Live Migration Gate — โหลดไม่ได้
          </span>
          <button
            onClick={fetchReadiness}
            className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700/60"
          >
            ลองใหม่
          </button>
        </div>
        <p className="mt-1 text-xs text-rose-400/70">{state.message}</p>
      </div>
    );
  }

  // ─── No liveReadiness field in response ───────────────────────────────────
  if (state.status === "no_field") {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/40 px-4 py-3">
        <p className="text-sm text-neutral-400">
          ⚠ liveReadiness field ไม่พบใน /api/health — อาจต้องรีสตาร์ท server หลัง deploy
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          ตรวจสอบว่า liveReadiness.ts และ health/route.ts ถูก deploy แล้ว
        </p>
        <button
          onClick={fetchReadiness}
          className="mt-2 rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
        >
          รีเฟรช
        </button>
      </div>
    );
  }

  const { data, fetchedAt } = state;
  const overallStyle = overallStatusLabel(data.status);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-rose-900/40 bg-rose-950/10 px-4 py-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-rose-300">
            🔒 LIVE MIGRATION GATE — BLOCKED BY DEFAULT
          </span>
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${overallStyle.cls}`}
          >
            {overallStyle.icon} {overallStyle.label}
          </span>
        </div>
        <button
          onClick={fetchReadiness}
          className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
        >
          รีเฟรช
        </button>
      </div>

      {/* Safety badges row */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SafetyBadge label="LIVE_TRADING" enabled={false} />
        <SafetyBadge label="ORDER_PLACEMENT" enabled={false} />
        <SafetyBadge label="MANUAL_APPROVAL" required={true} approved={data.manualApprovalStatus === "approved"} />
      </div>

      {/* Summary row */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <SummaryChip label="Gates รวม" value={data.summary.total} color="neutral" />
        <SummaryChip label="ผ่าน" value={data.summary.passed} color="emerald" />
        <SummaryChip label="Warning" value={data.summary.warning} color="amber" />
        <SummaryChip label="Blocked" value={data.summary.blocked} color="rose" />
        <SummaryChip label="Critical" value={data.summary.critical} color="rose" />
      </div>

      {/* Gates checklist */}
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Gate Checklist ({data.summary.passed}/{data.summary.total} ผ่าน)
        </p>
        {data.gates.map((gate) => (
          <GateRow
            key={gate.id}
            gate={gate}
            expanded={expandedGates.has(gate.id)}
            onToggle={() => toggleGate(gate.id)}
          />
        ))}
      </div>

      {/* Blockers */}
      {data.blockers.length > 0 && (
        <div className="mt-3 rounded border border-rose-800/40 bg-rose-950/20 px-3 py-2">
          <p className="text-xs font-medium text-rose-400 uppercase tracking-wider mb-1">
            🚫 Blockers ({data.blockers.length})
          </p>
          {data.blockers.map((b, i) => (
            <p key={i} className="text-xs text-rose-300/80 font-mono">
              {b}
            </p>
          ))}
        </div>
      )}

      {/* Next actions */}
      {data.nextActions.length > 0 && (
        <div className="mt-2 rounded border border-amber-800/30 bg-amber-950/15 px-3 py-2">
          <p className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-1">
            Next Actions
          </p>
          {data.nextActions.slice(0, 6).map((a, i) => (
            <p key={i} className="text-xs text-amber-300/80">
              {i + 1}. {a}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-xs text-neutral-500">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-800/40 pt-2">
        <p className="text-xs text-neutral-600">
          ตรวจเมื่อ: {formatRelativeTime(fetchedAt)}
        </p>
        <span className="text-xs font-mono text-neutral-700">
          readOnly: {String(data.readOnly)}
        </span>
        <span className="text-xs font-mono text-rose-800">
          live: {String(data.liveTradingEnabled)} · orders: {String(data.orderPlacementEnabled)}
        </span>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SafetyBadge({
  label,
  enabled,
  required,
  approved,
}: {
  label: string;
  enabled?: boolean;
  required?: boolean;
  approved?: boolean;
}) {
  if (required !== undefined) {
    // manual approval badge
    return (
      <span
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${
          approved
            ? "border-emerald-700 bg-emerald-900/40 text-emerald-300"
            : "border-amber-700 bg-amber-900/40 text-amber-300"
        }`}
      >
        <span className="opacity-60">{label}:</span>
        <span>{approved ? "APPROVED" : "REQUIRED"}</span>
      </span>
    );
  }

  // flag badge — always disabled = safe
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${
        enabled
          ? "border-rose-700 bg-rose-900/40 text-rose-300"
          : "border-neutral-700 bg-neutral-800/60 text-neutral-400"
      }`}
    >
      <span className="opacity-60">{label}:</span>
      <span>{enabled ? "⚠ ENABLED" : "DISABLED ✓"}</span>
    </span>
  );
}

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "neutral" | "emerald" | "amber" | "rose";
}) {
  const colorMap = {
    neutral: "text-neutral-300",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  };
  return (
    <div className="rounded border border-neutral-800/60 bg-neutral-900/30 px-2 py-1.5 text-center">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-base font-mono font-bold ${colorMap[color]}`}>
        {value}
      </p>
    </div>
  );
}
