"use client";

/**
 * RuntimeAuditCard.tsx
 * Phase I — Reconcile & Runtime State Audit
 *
 * Client component — แสดงสถานะ runtime state audit
 * อ่านข้อมูลจาก /api/runtime-audit แบบ client-side fetch
 *
 * States:
 *   loading       — กำลังโหลด
 *   ok            — ไฟล์ทั้งหมด fresh + valid
 *   warning       — มีไฟล์ stale หรือ optional missing
 *   critical      — มีไฟล์ missing หรือ invalid ที่สำคัญ
 *   error         — fetch ล้มเหลวหรือ network error
 *
 * Safety:
 * - ไม่ expose secret / API key ใดๆ
 * - ไม่ call BingX API
 * - ไม่ crash dashboard ถ้า /api/runtime-audit ล้มเหลว
 * - แสดง empty state ถ้าไม่มีข้อมูล
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileFreshness = "fresh" | "stale" | "missing" | "invalid" | "unknown";
type FileSeverity = "ok" | "warning" | "critical";

type AuditFile = {
  fileName: string;
  role: string;
  authority: string;
  expectedPath: string;
  exists: boolean;
  readable: boolean;
  validJson: boolean | null;
  sizeBytes: number | null;
  updatedAt: string | null;
  ageSec: number | null;
  freshness: FileFreshness;
  severity: FileSeverity;
  code: string;
  message: string;
  nextAction: string;
};

type AuditSummary = {
  total: number;
  ok: number;
  warning: number;
  critical: number;
  missing: number;
  invalid: number;
  stale: number;
};

type AuditReport = {
  ok: boolean;
  severity: "ok" | "warning" | "critical";
  readOnly: boolean;
  checkedAt: string;
  rootDir: string;
  rootDirSource: string;
  summary: AuditSummary;
  files: AuditFile[];
  warnings: string[];
  nextActions: string[];
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: AuditReport; fetchedAt: string }
  | { status: "error"; message: string; fetchedAt: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severityColor(severity: FileSeverity | "ok" | "warning" | "critical") {
  if (severity === "critical") return "text-rose-400";
  if (severity === "warning") return "text-amber-400";
  return "text-emerald-400";
}

function severityBg(severity: FileSeverity | "ok" | "warning" | "critical") {
  if (severity === "critical") return "bg-rose-950/40 border-rose-700/50";
  if (severity === "warning") return "bg-amber-950/30 border-amber-700/40";
  return "bg-emerald-950/20 border-emerald-800/30";
}

function freshnessLabel(freshness: FileFreshness): string {
  if (freshness === "fresh") return "สด";
  if (freshness === "stale") return "เก่า";
  if (freshness === "missing") return "หาย";
  if (freshness === "invalid") return "เสีย";
  return "?";
}

function freshnessBadgeClass(freshness: FileFreshness): string {
  if (freshness === "fresh")
    return "bg-emerald-900/50 text-emerald-300 border-emerald-700";
  if (freshness === "stale")
    return "bg-amber-900/50 text-amber-300 border-amber-700";
  if (freshness === "missing")
    return "bg-rose-900/50 text-rose-300 border-rose-700";
  if (freshness === "invalid")
    return "bg-rose-900/60 text-rose-200 border-rose-600";
  return "bg-neutral-800 text-neutral-400 border-neutral-700";
}

function formatAge(ageSec: number | null): string {
  if (ageSec === null) return "—";
  if (ageSec < 60) return `${ageSec}s`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m`;
  return `${Math.floor(ageSec / 3600)}h`;
}

function overallIcon(severity: "ok" | "warning" | "critical"): string {
  if (severity === "critical") return "🔴";
  if (severity === "warning") return "🟡";
  return "🟢";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RuntimeAuditCard() {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  async function fetchAudit() {
    setState({ status: "loading" });
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch("/api/runtime-audit", { cache: "no-store" });
      if (!res.ok) {
        setState({
          status: "error",
          message: `HTTP ${res.status}`,
          fetchedAt,
        });
        return;
      }
      const data: AuditReport = await res.json();
      setState({ status: "ok", data, fetchedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setState({ status: "error", message: msg, fetchedAt });
    }
  }

  useEffect(() => {
    fetchAudit();
  }, []);

  // ─── Render: loading ────────────────────────────────────────────────────
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-400 animate-pulse">
            ⏳ กำลังตรวจสอบ runtime files…
          </span>
        </div>
      </div>
    );
  }

  // ─── Render: fetch error ────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-rose-300">
            🔴 Runtime Audit — ไม่สามารถโหลดข้อมูลได้
          </span>
          <button
            onClick={fetchAudit}
            className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700/60"
          >
            ลองใหม่
          </button>
        </div>
        <p className="mt-1 text-xs text-rose-400/70">{state.message}</p>
      </div>
    );
  }

  // ─── Render: data ───────────────────────────────────────────────────────
  const { data } = state;
  const cardBorder = severityBg(data.severity);

  return (
    <div className={`rounded-lg border px-4 py-3 ${cardBorder}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${severityColor(data.severity)}`}>
            {overallIcon(data.severity)} Runtime State Audit
          </span>
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${
              data.severity === "critical"
                ? "border-rose-700 bg-rose-900/60 text-rose-300"
                : data.severity === "warning"
                ? "border-amber-700 bg-amber-900/40 text-amber-300"
                : "border-emerald-700 bg-emerald-900/40 text-emerald-300"
            }`}
          >
            {data.severity.toUpperCase()}
          </span>
          <span className="text-xs font-mono text-neutral-500">
            READ_ONLY
          </span>
        </div>
        <button
          onClick={fetchAudit}
          className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700/60"
        >
          รีเฟรช
        </button>
      </div>

      {/* Summary chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SummaryChip label="ทั้งหมด" value={data.summary.total} color="neutral" />
        <SummaryChip label="ปกติ" value={data.summary.ok} color="ok" />
        {data.summary.warning > 0 && (
          <SummaryChip label="เตือน" value={data.summary.warning} color="warning" />
        )}
        {data.summary.critical > 0 && (
          <SummaryChip label="วิกฤต" value={data.summary.critical} color="critical" />
        )}
        {data.summary.missing > 0 && (
          <SummaryChip label="หายไป" value={data.summary.missing} color="critical" />
        )}
        {data.summary.stale > 0 && (
          <SummaryChip label="เก่า" value={data.summary.stale} color="warning" />
        )}
        {data.summary.invalid > 0 && (
          <SummaryChip label="เสีย" value={data.summary.invalid} color="critical" />
        )}
      </div>

      {/* File list */}
      <div className="mt-3 space-y-1.5">
        {data.files.map((f) => (
          <FileRow key={f.fileName} file={f} />
        ))}
      </div>

      {/* Next actions */}
      {data.nextActions.length > 0 && (
        <div className="mt-3 rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2">
          <p className="text-xs font-semibold text-amber-400">⚡ แนะนำ:</p>
          <ul className="mt-1 space-y-0.5">
            {data.nextActions.map((action, i) => (
              <li key={i} className="text-xs text-amber-300/80">
                • {action}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings from audit process */}
      {data.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-xs text-neutral-500">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* Footer: checked time */}
      <p className="mt-2 text-xs text-neutral-600">
        ตรวจเมื่อ: {new Date(data.checkedAt).toLocaleTimeString("th-TH")} ·{" "}
        rootDir: {data.rootDir} ({data.rootDirSource})
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "ok" | "warning" | "critical" | "neutral";
}) {
  const cls =
    color === "ok"
      ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
      : color === "warning"
      ? "bg-amber-900/30 text-amber-300 border-amber-700"
      : color === "critical"
      ? "bg-rose-900/40 text-rose-300 border-rose-700"
      : "bg-neutral-800/50 text-neutral-400 border-neutral-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${cls}`}
    >
      <span className="opacity-60">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function FileRow({ file }: { file: AuditFile }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded border px-3 py-1.5 ${
        file.severity === "critical"
          ? "border-rose-800/50 bg-rose-950/20"
          : file.severity === "warning"
          ? "border-amber-800/40 bg-amber-950/15"
          : "border-neutral-800/50 bg-neutral-900/20"
      }`}
    >
      <div
        className="flex cursor-pointer flex-wrap items-center gap-2"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Freshness badge */}
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${freshnessBadgeClass(file.freshness)}`}
        >
          {freshnessLabel(file.freshness)}
        </span>

        {/* File name */}
        <span
          className={`text-xs font-mono ${
            file.severity === "critical"
              ? "text-rose-300"
              : file.severity === "warning"
              ? "text-amber-300"
              : "text-neutral-300"
          }`}
        >
          {file.fileName}
        </span>

        {/* Age */}
        <span className="text-xs text-neutral-500">
          {file.ageSec !== null ? formatAge(file.ageSec) : "—"}
        </span>

        {/* Expand toggle */}
        <span className="ml-auto text-xs text-neutral-600">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-1.5 space-y-0.5 border-t border-neutral-800/50 pt-1.5">
          <p className="text-xs text-neutral-400">{file.message}</p>
          {file.severity !== "ok" && (
            <p className="text-xs text-amber-400/80">→ {file.nextAction}</p>
          )}
          <p className="text-xs text-neutral-600">
            path: {file.expectedPath} · size: {file.sizeBytes ?? "—"} bytes
          </p>
        </div>
      )}
    </div>
  );
}
