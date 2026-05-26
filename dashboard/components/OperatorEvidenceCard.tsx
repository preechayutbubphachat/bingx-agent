"use client";

/**
 * OperatorEvidenceCard.tsx
 * Phase M-0D — Operator Evidence Intake & Approval Status Tracker
 *
 * แสดงสถานะ evidence tracker ก่อน Phase M-0B
 *
 * Safety guarantees:
 * - Fetch จาก /api/operator-evidence เท่านั้น (ไม่ใช่ BingX โดยตรง)
 * - ไม่แสดง secret values ใดๆ (แสดงแค่ presence/boolean)
 * - ไม่ทำให้ operator เข้าใจว่า exchange sync เริ่มแล้ว
 * - แสดง "NO EXCHANGE API CALLS" อย่างชัดเจน
 */

import { useEffect, useState } from "react";
import type {
  EvidenceItem,
  EvidenceItemStatus,
  OperatorEvidenceStatus,
  OperatorEvidenceSummary,
} from "@/lib/operatorEvidence";

// ─── Response type (จาก /api/operator-evidence) ──────────────────────────────

type OperatorEvidenceResponse = {
  version: string;
  checkedAt: string;
  ok: false;
  readOnly: true;
  status: OperatorEvidenceStatus;
  phase: string;
  evidence: EvidenceItem[];
  summary: OperatorEvidenceSummary;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  paperQualityUsed: {
    hasAverageFillPrice: boolean | null;
    hasClosedTrades: boolean | null;
    qualityStatus: string | null;
  } | null;
  _notice?: string;
};

// ─── Fetch state ──────────────────────────────────────────────────────────────

type FetchState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "loaded"; data: OperatorEvidenceResponse };

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  OperatorEvidenceStatus,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  BLOCKED: {
    label: "🚫 BLOCKED",
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  PARTIAL_EVIDENCE: {
    label: "⏳ PARTIAL EVIDENCE",
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  READY_FOR_OPERATOR_APPROVAL_REVIEW: {
    label: "✅ พร้อม Approval Review",
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  APPROVED_FOR_M0B_READONLY_IMPLEMENTATION: {
    label: "🟢 APPROVED for M-0B Read-only",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
};

const EVIDENCE_STATUS_ICON: Record<EvidenceItemStatus, string> = {
  pass: "✅",
  pending: "⏳",
  fail: "❌",
  unknown: "❓",
};

const EVIDENCE_STATUS_COLOR: Record<EvidenceItemStatus, string> = {
  pass: "text-emerald-400",
  pending: "text-amber-400",
  fail: "text-red-400",
  unknown: "text-neutral-500",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OperatorEvidenceStatus }) {
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
        🔒 Evidence Tracker Only — Phase M-0D
      </p>
      <p className="mt-0.5 text-xs text-sky-400/80">
        NO EXCHANGE API CALLS — Phase M-0B ยังอยู่ใน BLOCKED จนกว่าจะผ่านทุก evidence item
      </p>
    </div>
  );
}

function SummaryBar({ summary }: { summary: OperatorEvidenceSummary }) {
  const { totalRequired, passed, pending, failed } = summary;
  const pct = totalRequired > 0 ? Math.round((passed / totalRequired) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">
          ผ่านแล้ว {passed}/{totalRequired} required items
        </span>
        <span className="font-mono text-neutral-400">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100
              ? "bg-emerald-500"
              : pct > 50
              ? "bg-amber-500"
              : "bg-red-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-neutral-500">
        <span className="text-emerald-400">✅ {passed} pass</span>
        <span className="text-amber-400">⏳ {pending} pending</span>
        {failed > 0 && (
          <span className="text-red-400">❌ {failed} fail</span>
        )}
      </div>
    </div>
  );
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  const [expanded, setExpanded] = useState(false);
  const icon = EVIDENCE_STATUS_ICON[item.status];
  const color = EVIDENCE_STATUS_COLOR[item.status];

  return (
    <div className="border-b border-neutral-800 last:border-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 px-2 py-2 text-left hover:bg-white/5"
      >
        <span className="mt-0.5 shrink-0 text-sm">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${color}`}>{item.label}</span>
            {item.required && !item.passed && (
              <span className="rounded bg-red-500/20 px-1 py-0.5 text-[10px] text-red-300">
                Required
              </span>
            )}
            <span className="text-[10px] text-neutral-600">{item.source}</span>
          </div>
          {!expanded && (
            <p className="mt-0.5 truncate text-[10px] text-neutral-600">
              {item.message}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-neutral-600">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 px-4 pb-2.5">
          <p className="text-xs text-neutral-400">{item.message}</p>
          <div className="rounded bg-neutral-800/60 px-2 py-1">
            <span className="text-[10px] text-neutral-500">ref: </span>
            <span className="font-mono text-[10px] text-neutral-400">
              {item.evidenceRef}
            </span>
          </div>
          {item.nextAction && (
            <div className="rounded border border-sky-500/15 bg-sky-500/5 px-2 py-1">
              <span className="text-[10px] font-semibold text-sky-400">ขั้นตอน: </span>
              <span className="text-[10px] text-sky-400/80">{item.nextAction}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OperatorEvidenceCard() {
  const [state, setState] = useState<FetchState>({ phase: "loading" });

  const fetchEvidence = async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/operator-evidence", { cache: "no-store" });
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
    fetchEvidence();
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (state.phase === "loading") {
    return (
      <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-neutral-600" />
          <p className="text-sm text-neutral-500">
            กำลังตรวจ Operator Evidence…
          </p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────

  if (state.phase === "error") {
    return (
      <div className="rounded-xl border border-red-500/20 bg-neutral-900 p-4">
        <p className="text-sm font-semibold text-red-300">
          Operator Evidence — Fetch Error
        </p>
        <p className="mt-1 text-xs text-neutral-500">{state.message}</p>
        <button
          onClick={fetchEvidence}
          className="mt-3 rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const d = state.data;
  const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.BLOCKED;

  // Group: required vs optional
  const required = d.evidence.filter((e) => e.required);
  const optional = d.evidence.filter((e) => !e.required);

  return (
    <div className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-neutral-200">
            Operator Evidence Tracker
          </p>
          <p className="text-xs text-neutral-500">
            Phase M-0D — สถานะ approval gate สำหรับ Phase M-0B
          </p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {/* ── Safety banner ── */}
      <SafetyBanner />

      {/* ── Summary progress bar ── */}
      <SummaryBar summary={d.summary} />

      {/* ── Required evidence items ── */}
      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-400">
          Required Evidence (
          {required.filter((e) => e.passed).length}/{required.length})
        </p>
        <div
          className={`divide-y divide-neutral-800 rounded border ${statusCfg.border} overflow-hidden`}
        >
          {required.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-600">
              ไม่มี required evidence items
            </p>
          ) : (
            required.map((item) => <EvidenceRow key={item.id} item={item} />)
          )}
        </div>
      </div>

      {/* ── Optional evidence items ── */}
      {optional.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-neutral-400">
            Optional Evidence ({optional.filter((e) => e.passed).length}/{optional.length})
          </p>
          <div className="divide-y divide-neutral-800 rounded border border-neutral-800 overflow-hidden">
            {optional.map((item) => (
              <EvidenceRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

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
          <p className="mb-1.5 text-xs font-semibold text-sky-300">
            ขั้นตอนถัดไป
          </p>
          <ol className="space-y-1">
            {d.nextActions.map((a, i) => (
              <li key={i} className="text-xs text-sky-400/80">
                {i + 1}. {a}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Paper quality used ── */}
      {d.paperQualityUsed && (
        <div className="rounded border border-neutral-700 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold text-neutral-500">
            Paper Quality Used for Evidence
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                d.paperQualityUsed.hasAverageFillPrice
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-neutral-700 text-neutral-500"
              }`}
            >
              averageFillPrice:{" "}
              {d.paperQualityUsed.hasAverageFillPrice === null
                ? "unknown"
                : String(d.paperQualityUsed.hasAverageFillPrice)}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                d.paperQualityUsed.hasClosedTrades
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-neutral-700 text-neutral-500"
              }`}
            >
              closedTrades:{" "}
              {d.paperQualityUsed.hasClosedTrades === null
                ? "unknown"
                : String(d.paperQualityUsed.hasClosedTrades)}
            </span>
            {d.paperQualityUsed.qualityStatus && (
              <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
                quality: {d.paperQualityUsed.qualityStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-2">
        <p className="text-[10px] text-neutral-600">
          ตรวจเมื่อ:{" "}
          {new Date(d.checkedAt).toLocaleString("th-TH", {
            timeZone: "Asia/Bangkok",
          })}
        </p>
        <button
          onClick={fetchEvidence}
          className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          รีเฟรช
        </button>
      </div>
    </div>
  );
}
