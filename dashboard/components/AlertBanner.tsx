/**
 * AlertBanner.tsx
 * Phase G — Extended Monitoring & Alerts
 *
 * แสดง active alerts จาก alertEngine
 * ต่างจาก SystemHealthBanner ที่เน้น trading safety flags —
 * AlertBanner เน้น operational alerts (snapshot stale, task errors, scheduler down)
 *
 * Props:
 *   alerts  — Alert[] จาก computeAlerts() (server-side)
 *
 * ถ้า alerts.length === 0 → ไม่แสดงอะไร (silent green)
 *
 * Server component — ไม่มี "use client"
 */

import type { Alert, AlertSeverity, AlertSummary } from "@/lib/alertEngine";
import { summarizeAlerts } from "@/lib/alertEngine";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  alerts: Alert[];
};

// ─── Severity styles ──────────────────────────────────────────────────────────

type SeverityStyle = {
  icon: string;
  bg: string;
  border: string;
  titleText: string;
  detailText: string;
  codeBg: string;
  codeText: string;
};

const SEVERITY_STYLES: Record<AlertSeverity, SeverityStyle> = {
  fatal: {
    icon: "💀",
    bg: "bg-rose-950/60",
    border: "border-rose-700",
    titleText: "text-rose-200",
    detailText: "text-rose-300",
    codeBg: "bg-rose-900/50",
    codeText: "text-rose-300",
  },
  critical: {
    icon: "🚨",
    bg: "bg-rose-950/40",
    border: "border-rose-800/70",
    titleText: "text-rose-300",
    detailText: "text-rose-400/80",
    codeBg: "bg-rose-900/40",
    codeText: "text-rose-400",
  },
  warning: {
    icon: "⚠️",
    bg: "bg-amber-950/40",
    border: "border-amber-800/60",
    titleText: "text-amber-300",
    detailText: "text-amber-400/80",
    codeBg: "bg-amber-900/40",
    codeText: "text-amber-400",
  },
  info: {
    icon: "ℹ️",
    bg: "bg-sky-950/30",
    border: "border-sky-800/50",
    titleText: "text-sky-300",
    detailText: "text-sky-400/80",
    codeBg: "bg-sky-900/30",
    codeText: "text-sky-400",
  },
};

// ─── Summary header styles ─────────────────────────────────────────────────────

function summaryHeaderStyle(highest: AlertSummary["highestSeverity"]): string {
  if (highest === "fatal" || highest === "critical")
    return "border-rose-800/60 bg-rose-950/30";
  if (highest === "warning") return "border-amber-800/50 bg-amber-950/30";
  if (highest === "info") return "border-sky-800/40 bg-sky-950/20";
  return "border-neutral-800 bg-neutral-900/30";
}

function summaryTitleColor(highest: AlertSummary["highestSeverity"]): string {
  if (highest === "fatal" || highest === "critical") return "text-rose-300";
  if (highest === "warning") return "text-amber-300";
  if (highest === "info") return "text-sky-300";
  return "text-neutral-400";
}

// ─── Sub-component: AlertRow ──────────────────────────────────────────────────

function AlertRow({ alert }: { alert: Alert }) {
  const style = SEVERITY_STYLES[alert.severity];

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${style.bg} ${style.border}`}
      role="alert"
    >
      <div className="flex flex-wrap items-start gap-2">
        {/* Icon + code */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-sm">{style.icon}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-mono font-semibold ${style.codeBg} ${style.codeText}`}
          >
            {alert.code}
          </span>
        </div>

        {/* Title + detail */}
        <div className="min-w-0 flex-1">
          <span className={`text-sm font-semibold ${style.titleText}`}>
            {alert.title}
          </span>
          {alert.detail && (
            <div className={`mt-0.5 text-xs ${style.detailText}`}>
              {alert.detail}
            </div>
          )}
        </div>
      </div>

      {/* Suggested action */}
      {alert.suggestedAction && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-neutral-500">
          <span>→</span>
          <span>{alert.suggestedAction}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlertBanner({ alerts }: Props) {
  // ไม่มี alert → ไม่แสดงอะไร
  if (!alerts || alerts.length === 0) return null;

  const summary = summarizeAlerts(alerts);
  const headerStyle = summaryHeaderStyle(summary.highestSeverity);
  const titleColor = summaryTitleColor(summary.highestSeverity);

  // แยก alerts ตาม severity
  const criticalAndFatal = alerts.filter(
    (a) => a.severity === "fatal" || a.severity === "critical"
  );
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");

  return (
    <div className="space-y-2" role="region" aria-label="System alerts">
      {/* Summary header */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 ${headerStyle}`}
      >
        <span className={`text-sm font-semibold ${titleColor}`}>
          🔔 Alerts ({summary.total})
        </span>

        {/* Count chips */}
        <div className="flex flex-wrap gap-1.5">
          {summary.fatal > 0 && (
            <SeverityChip count={summary.fatal} severity="fatal" />
          )}
          {summary.critical > 0 && (
            <SeverityChip count={summary.critical} severity="critical" />
          )}
          {summary.warning > 0 && (
            <SeverityChip count={summary.warning} severity="warning" />
          )}
          {summary.info > 0 && (
            <SeverityChip count={summary.info} severity="info" />
          )}
        </div>
      </div>

      {/* Critical & Fatal alerts */}
      {criticalAndFatal.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}

      {/* Warnings */}
      {warnings.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}

      {/* Info */}
      {infos.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </div>
  );
}

// ─── SeverityChip ─────────────────────────────────────────────────────────────

function SeverityChip({
  count,
  severity,
}: {
  count: number;
  severity: AlertSeverity;
}) {
  const styles: Record<AlertSeverity, string> = {
    fatal:    "bg-rose-900/60 text-rose-300 border-rose-700",
    critical: "bg-rose-900/40 text-rose-400 border-rose-800",
    warning:  "bg-amber-900/40 text-amber-400 border-amber-800",
    info:     "bg-sky-900/30 text-sky-400 border-sky-800",
  };
  const labels: Record<AlertSeverity, string> = {
    fatal:    "FATAL",
    critical: "CRIT",
    warning:  "WARN",
    info:     "INFO",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${styles[severity]}`}
    >
      {count} {labels[severity]}
    </span>
  );
}
