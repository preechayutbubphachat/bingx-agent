import type { CafeMetric } from "@/lib/trading-cafe-hq/mockData";

const severityClass: Record<CafeMetric["severity"], string> = {
  neutral: "text-[#344054]",
  success: "text-emerald-700",
  warning: "text-orange-700",
  danger: "text-red-700",
  info: "text-blue-700",
};

const barClass: Record<CafeMetric["severity"], string> = {
  neutral: "bg-[#9aa4b2]",
  success: "bg-emerald-500",
  warning: "bg-orange-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
};

export default function MetricCard({ metric }: { metric: CafeMetric }) {
  const statusLabel =
    metric.dataStatus === "loading"
      ? "loading"
      : metric.dataStatus === "stale"
        ? "stale"
        : metric.dataStatus === "error"
          ? "error"
          : "";

  return (
    <button
      type="button"
      disabled={metric.dataStatus === "loading"}
      className="group min-h-[78px] min-w-[142px] rounded-xl border border-[#d4a86f]/60 bg-[#fff8ec] p-3 text-left shadow-[0_2px_0_rgba(92,54,18,0.12)] transition hover:-translate-y-0.5 hover:border-[#bd8245] focus:outline-none focus:ring-2 focus:ring-[#7c4d1d] disabled:opacity-75 motion-reduce:transition-none"
      aria-label={`${metric.label}: ${metric.value}`}
      title="Detail view is a future static placeholder"
    >
      <div className="flex items-start gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-2xl ring-1 ring-[#e3c49a]">
          {metric.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-black uppercase tracking-wide text-[#5f4935]">{metric.label}</span>
            {statusLabel ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800">{statusLabel}</span> : null}
          </div>
          <div className={`mt-1 truncate text-xl font-black leading-none tabular-nums ${severityClass[metric.severity]}`}>
            {metric.dataStatus === "loading" ? "..." : metric.value}
          </div>
          {metric.subValue ? <div className="mt-1 text-[11px] font-bold text-[#6d5745]">{metric.subValue}</div> : null}
        </div>
      </div>
      {typeof metric.progressValue === "number" ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead7b8]">
          <div className={`h-full rounded-full ${barClass[metric.severity]}`} style={{ width: `${Math.max(0, Math.min(100, metric.progressValue))}%` }} />
        </div>
      ) : null}
    </button>
  );
}
