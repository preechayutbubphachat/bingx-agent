"use client";

import { SEVERITY_BADGE_TH } from "@/lib/trading-agent-hq/cardUpdateSignatures";
import { statusWallStableCardClass } from "@/lib/trading-agent-hq/missionControlVisual";
import type { CollapsedTile } from "./CollapsedCardTile";

type Props = {
  tile: CollapsedTile;
  onExpand: (cardId: string) => void;
};

function statusDotClass(severity: CollapsedTile["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-rose-300 shadow-[0_0_10px_rgba(251,113,133,0.75)]";
    case "warning":
      return "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.65)]";
    case "success":
      return "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.65)]";
    case "info":
      return "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.65)]";
    default:
      return "bg-slate-500";
  }
}

function progressClass(severity: CollapsedTile["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-rose-300";
    case "warning":
      return "bg-amber-300";
    case "success":
      return "bg-emerald-300";
    default:
      return "bg-cyan-300";
  }
}

export default function AgentStatusWallStableCard({ tile, onExpand }: Props) {
  const { id, title, snapshot, severity, hasUpdates, icon } = tile;
  const emphasized = severity !== "none" || hasUpdates;
  const progressWidth = emphasized ? "72%" : "42%";

  return (
    <button
      type="button"
      aria-expanded="false"
      aria-label={`Expand status card ${title}`}
      title={`${title} - expand status card`}
      onClick={() => onExpand(id)}
      className={statusWallStableCardClass(emphasized ? severity : "none")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-[13px] text-cyan-100">
            {icon ?? "◇"}
          </span>
          <span className="min-w-0">
            <span className="agent-hq-stable-card-title block text-[12px] font-black leading-snug text-cyan-50">
              {title}
            </span>
            <span className="mt-1 block truncate text-[11px] font-black uppercase tracking-wide text-slate-100">
              {snapshot.status}
            </span>
          </span>
        </div>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusDotClass(severity)}`} aria-hidden="true" />
      </div>

      {snapshot.summary ? (
        <p className="agent-hq-stable-card-reason mt-2 text-[10px] font-semibold leading-snug text-slate-300">
          {snapshot.summary}
        </p>
      ) : (
        <p className="mt-2 text-[10px] font-semibold leading-snug text-slate-500">No summary yet</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[9px] font-bold text-slate-500">
        <span className="truncate">review-only status</span>
        {emphasized ? <span className="shrink-0 text-cyan-100">{SEVERITY_BADGE_TH[severity]}</span> : null}
      </div>

      <div className="mt-1.5 h-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${progressClass(severity)}`} style={{ width: progressWidth }} />
      </div>
    </button>
  );
}
