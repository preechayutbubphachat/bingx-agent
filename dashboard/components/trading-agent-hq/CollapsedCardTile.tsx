"use client";

// dashboard/components/trading-agent-hq/CollapsedCardTile.tsx
// Phase UI-1.1 — a collapsed card rendered as a compact, clickable dashboard chip/tile.
// SAFETY: presentation only. No runtime side effects or control surfaces.

import type { CardSnapshot, CardUpdateSeverity } from "@/lib/trading-agent-hq/cardUpdateSignatures";
import { SEVERITY_BADGE_TH } from "@/lib/trading-agent-hq/cardUpdateSignatures";
import { statusTileClass } from "@/lib/trading-agent-hq/missionControlVisual";

export type CollapsedTile = {
  id: string;
  title: string;
  snapshot: CardSnapshot;
  severity: CardUpdateSeverity;
  hasUpdates: boolean;
  /** UI-2.2: per-card display icon from the layout registry (presentation only) */
  icon?: string;
};

type Props = {
  tile: CollapsedTile;
  onExpand: (cardId: string) => void;
};

// Tile surface accent — mirrors the top summary boxes, tinted by severity when updated.
function tileSurface(sev: CardUpdateSeverity, emphasized: boolean): string {
  if (!emphasized) return "border-cyan-400/20 bg-slate-900/80 hover:border-cyan-300/40 hover:bg-cyan-400/10";
  switch (sev) {
    case "critical":
      return "border-rose-300/40 bg-rose-400/10 ring-1 ring-rose-300/20 hover:bg-rose-400/15";
    case "success":
      return "border-emerald-300/40 bg-emerald-400/10 ring-1 ring-emerald-300/20 hover:bg-emerald-400/15";
    case "warning":
      return "border-amber-300/40 bg-amber-400/10 ring-1 ring-amber-300/20 hover:bg-amber-400/15";
    case "info":
      return "border-cyan-300/40 bg-cyan-400/10 ring-1 ring-cyan-300/20 hover:bg-cyan-400/15";
    default:
      return "border-cyan-400/20 bg-slate-900/80 hover:border-cyan-300/40 hover:bg-cyan-400/10";
  }
}

function dotClass(sev: CardUpdateSeverity): string {
  switch (sev) {
    case "critical":
      return "bg-red-500";
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-cyan-400";
    default:
      return "bg-slate-500";
  }
}

function badgeClass(sev: CardUpdateSeverity): string {
  switch (sev) {
    case "critical":
      return "border border-rose-300/40 bg-rose-400/10 text-rose-100";
    case "success":
      return "border border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
    case "warning":
      return "border border-amber-300/40 bg-amber-400/10 text-amber-100";
    case "info":
      return "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100";
    default:
      return "border border-slate-600 bg-slate-900 text-slate-300";
  }
}

export default function CollapsedCardTile({ tile, onExpand }: Props) {
  const { id, title, snapshot, severity, hasUpdates, icon } = tile;
  const emphasized = severity !== "none" || hasUpdates;
  return (
    <button
      type="button"
      onClick={() => onExpand(id)}
      aria-expanded="false"
      aria-label={`ขยายการ์ด ${title}`}
      title={`${title} — กดเพื่อขยาย`}
      className={`${statusTileClass()} shadow-[0_0_18px_rgba(34,211,238,0.05)] transition-colors ${tileSurface(severity, emphasized)}`}
    >
      {/* UI-2.2 mockup-style header: icon chip + title, severity dot/badge on the right */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon ? (
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-cyan-300/30 bg-cyan-400/10 text-[12px] text-cyan-100"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <span className="agent-hq-tile-title text-[12px] font-black leading-tight text-slate-100">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {emphasized ? (
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${badgeClass(severity)}`}>
              {SEVERITY_BADGE_TH[severity]}
            </span>
          ) : null}
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass(severity)}`} aria-hidden="true" />
        </div>
      </div>
      <div className="mt-0.5 truncate text-[11px] font-bold text-cyan-100">{snapshot.status}</div>
      {snapshot.summary ? (
        <div className="truncate text-[10px] font-medium text-slate-400">{snapshot.summary}</div>
      ) : null}
      <div className="mt-auto flex items-center justify-between text-[9px] text-slate-500">
        <span>กดเพื่อขยาย</span>
        {snapshot.lastRunAt ? <span className="truncate pl-1">{snapshot.lastRunAt}</span> : null}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${severity === "critical" ? "bg-rose-300" : severity === "warning" ? "bg-amber-300" : severity === "success" ? "bg-emerald-300" : "bg-cyan-300"}`} style={{ width: emphasized ? "76%" : "42%" }} />
      </div>
    </button>
  );
}
