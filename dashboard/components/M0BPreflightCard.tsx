"use client";

/**
 * M0BPreflightCard.tsx
 * Phase M-0B Preflight Gate — Dashboard Card
 *
 * แสดงสถานะ preflight ก่อนเริ่ม Phase M-0B (Read-only Exchange API)
 *
 * Safety guarantees:
 * - Fetch จาก /api/m0b-preflight เท่านั้น (ไม่ใช่ BingX โดยตรง)
 * - ไม่แสดง secret values ใดๆ (แสดงแค่ presence: true/false)
 * - ไม่ทำให้ operator เข้าใจว่า exchange sync เริ่มแล้ว
 * - แสดง "NO EXCHANGE API CALLS YET" อย่างชัดเจน
 */

import { useEffect, useState } from "react";
import type { M0BPreflightReport, M0BPreflightStatus, M0BGateResult } from "@/lib/m0bPreflight";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FetchState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "loaded"; data: M0BPreflightReport & { endpointVersion?: string; _notice?: string } };

// ─── Status badge config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  M0BPreflightStatus,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  BLOCKED: {
    label: "🚫 BLOCKED",
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  WAITING_FOR_BUILD: {
    label: "🔨 รอ Build ยืนยัน",
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  WAITING_FOR_PAPER_FILL_QUALITY: {
    label: "📊 รอ Paper Fill Quality",
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  WAITING_FOR_OPERATOR_APPROVAL: {
    label: "⏳ รอ Operator Approval",
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  READY_FOR_M0B_APPROVAL_REVIEW: {
    label: "✅ พร้อมสำหรับ Approval Review",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
};

const QUALITY_STATUS_LABEL: Record<string, string> = {
  insufficient: "❌ Insufficient",
  partial: "⚠️ Partial",
  usable: "✅ Usable",
  robust: "✅ Robust",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: M0BPreflightStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.BLOCKED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SafetyBanner() {
  return (
    <div className="rounded border border-sky-500/20 bg-sky-500/5 px-3 py-2">
      <p className="text-xs font-semibold text-sky-300">
        🔒 Phase M-0B = Planning &amp; Approval Gate Only
      </p>
      <p className="mt-0.5 text-xs text-sky-400/80">
        NO EXCHANGE API CALLS YET — ยังไม่มี network calls ไป BingX ในขณะนี้
      </p>
    </div>
  );
}

function GateRow({ gate }: { gate: M0BGateResult }) {
  return (
    <div className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-white/5">
      <span className="mt-0.5 shrink-0 text-sm">
        {gate.passed ? "✅" : gate.required ? "❌" : "⚠️"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-neutral-400">{gate.name}</span>
          {gate.required && !gate.passed && (
            <span className="rounded bg-red-500/20 px-1 py-0.5 text-[10px] text-red-300">
              Required
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">{gate.detail}</p>
      </div>
    </div>
  );
}

function FlagChip({
  label,
  value,
  safe,
}: {
  label: string;
  value: string | boolean;
  safe: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1 text-xs ${
        safe
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
          : "border-red-500/20 bg-red-500/10 text-red-300"
      }`}
    >
      <span className="text-neutral-500">{label}: </span>
      <span className="font-mono font-semibold">
        {typeof value === "boolean" ? (value ? "true" : "false") : value}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function M0BPreflightCard() {
  const [state, setState] = useState<FetchState>({ phase: "loading" });

  const fetchPreflight = async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/m0b-preflight", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ phase: "loaded", data });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Unknown fetch error",
      });
    }
  };

  useEffect(() => {
    fetchPreflight();
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────

  if (state.phase === "loading") {
    return (
      <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-neutral-600" />
          <p className="text-sm text-neutral-500">กำลังตรวจ Phase M-0B Preflight…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (state.phase === "error") {
    return (
      <div className="rounded-xl border border-red-500/20 bg-neutral-900 p-4">
        <p className="text-sm font-semibold text-red-300">Phase M-0B Preflight — Error</p>
        <p className="mt-1 text-xs text-neutral-500">{state.message}</p>
        <button
          onClick={fetchPreflight}
          className="mt-3 rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const d = state.data;
  const sf = d.safetyFlags;
  const pq = d.paperQuality;
  const cr = d.credentialReadiness;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-neutral-200">Phase M-0B Preflight Gate</p>
          <p className="text-xs text-neutral-500">
            Read-only Exchange API — สถานะ approval gate
          </p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {/* ── Safety banner ── */}
      <SafetyBanner />

      {/* ── Safety flags ── */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-neutral-400">Safety Flags</p>
        <div className="flex flex-wrap gap-1.5">
          <FlagChip
            label="LiveTrading"
            value={sf.liveTradingEnabled}
            safe={!sf.liveTradingEnabled}
          />
          <FlagChip
            label="OrderPlacement"
            value={sf.enableOrderPlacement}
            safe={!sf.enableOrderPlacement}
          />
          <FlagChip
            label="ProdReady"
            value={sf.productionTradingReady}
            safe={!sf.productionTradingReady}
          />
          <FlagChip
            label="ApprovalStatus"
            value={sf.manualApprovalStatus}
            safe={sf.manualApprovalStatus === "approved"}
          />
        </div>
      </div>

      {/* ── Paper fill quality ── */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-neutral-400">Paper Fill Quality</p>
        <div className="flex flex-wrap gap-1.5">
          <FlagChip
            label="averageFillPrice"
            value={pq.hasAverageFillPrice === null ? "unknown" : String(pq.hasAverageFillPrice)}
            safe={pq.hasAverageFillPrice === true}
          />
          <FlagChip
            label="closedTrades"
            value={pq.hasClosedTrades === null ? "unknown" : String(pq.hasClosedTrades)}
            safe={pq.hasClosedTrades === true}
          />
          {pq.qualityStatus && (
            <div className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300">
              <span className="text-neutral-500">quality: </span>
              <span className="font-mono">
                {QUALITY_STATUS_LABEL[pq.qualityStatus] ?? pq.qualityStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Credential readiness ── */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-neutral-400">
          Read-only Credentials (presence only)
        </p>
        <div className="flex flex-wrap gap-1.5">
          <FlagChip
            label="API Key"
            value={cr.hasReadOnlyApiKey ? "present" : "not set"}
            safe={cr.hasReadOnlyApiKey}
          />
          <FlagChip
            label="Secret"
            value={cr.hasReadOnlySecret ? "present" : "not set"}
            safe={cr.hasReadOnlySecret}
          />
        </div>
        <p className="mt-1 text-[10px] text-neutral-600">
          ห้ามตั้ง key ก่อนได้รับ operator approval — ตรวจ PROJECT_MAP.md checklist
        </p>
      </div>

      {/* ── Gates ── */}
      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-400">
          Preflight Gates ({d.gates.filter((g) => g.passed).length}/{d.gates.length} passed)
        </p>
        <div className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {d.gates.map((gate) => (
            <GateRow key={gate.name} gate={gate} />
          ))}
        </div>
      </div>

      {/* ── Blockers ── */}
      {d.blockers.length > 0 && (
        <div className="rounded border border-red-500/20 bg-red-500/5 p-3">
          <p className="mb-1.5 text-xs font-semibold text-red-300">
            🚫 Blockers ({d.blockers.length})
          </p>
          <ul className="space-y-1">
            {d.blockers.map((b, i) => (
              <li key={i} className="text-xs text-red-400/90">
                • {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Warnings ── */}
      {d.warnings.length > 0 && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="mb-1.5 text-xs font-semibold text-amber-300">
            ⚠️ Warnings ({d.warnings.length})
          </p>
          <ul className="space-y-1">
            {d.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-400/80">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Next actions ── */}
      {d.nextActions.length > 0 && (
        <div className="rounded border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="mb-1.5 text-xs font-semibold text-sky-300">ขั้นตอนถัดไป</p>
          <ol className="space-y-1">
            {d.nextActions.map((a, i) => (
              <li key={i} className="text-xs text-sky-400/80">
                {i + 1}. {a}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-2">
        <p className="text-[10px] text-neutral-600">
          ตรวจเมื่อ: {new Date(d.checkedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
        </p>
        <button
          onClick={fetchPreflight}
          className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          รีเฟรช
        </button>
      </div>
    </div>
  );
}
