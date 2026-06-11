"use client";

// dashboard/components/trading-agent-hq/CollapsedCardTile.tsx
// Phase UI-1.1 — a collapsed card rendered as a compact, clickable dashboard chip/tile.
// SAFETY: presentation only. No fetch, no token, no run/live/exchange controls.

import type { CardSnapshot, CardUpdateSeverity } from "@/lib/trading-agent-hq/cardUpdateSignatures";
import { SEVERITY_BADGE_TH } from "@/lib/trading-agent-hq/cardUpdateSignatures";

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
  if (!emphasized) return "border-[#d6c2a6] bg-[#f4efe7] hover:bg-[#efe7d8]";
  switch (sev) {
    case "critical":
      return "border-red-300 bg-red-50 ring-1 ring-red-200 hover:bg-red-100";
    case "success":
      return "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200 hover:bg-emerald-100";
    case "warning":
      return "border-amber-300 bg-amber-50 ring-1 ring-amber-200 hover:bg-amber-100";
    case "info":
      return "border-sky-300 bg-sky-50 ring-1 ring-sky-200 hover:bg-sky-100";
    default:
      return "border-[#d6c2a6] bg-[#f4efe7] hover:bg-[#efe7d8]";
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
      return "bg-sky-500";
    default:
      return "bg-[#c9b48f]";
  }
}

function badgeClass(sev: CardUpdateSeverity): string {
  switch (sev) {
    case "critical":
      return "bg-red-200 text-red-900";
    case "success":
      return "bg-emerald-200 text-emerald-900";
    case "warning":
      return "bg-amber-200 text-amber-900";
    case "info":
      return "bg-sky-200 text-sky-900";
    default:
      return "bg-[#e6dac4] text-[#6d5640]";
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
      className={`flex h-full min-h-[78px] w-full flex-col gap-1 rounded-xl border px-2.5 py-2 text-left shadow-sm transition ${tileSurface(severity, emphasized)}`}
    >
      {/* UI-2.2 mockup-style header: icon chip + title, severity dot/badge on the right */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon ? (
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#e5d5bf] bg-white/80 text-[12px]"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <span className="truncate text-[12px] font-black leading-tight text-[#2f241b]">{title}</span>
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
      <div className="truncate text-[11px] font-bold text-[#5b4432]">{snapshot.status}</div>
      {snapshot.summary ? (
        <div className="truncate text-[10px] font-medium text-[#80644c]">{snapshot.summary}</div>
      ) : null}
      <div className="mt-auto flex items-center justify-between text-[9px] text-[#9a8a72]">
        <span>กดเพื่อขยาย</span>
        {snapshot.lastRunAt ? <span className="truncate pl-1">{snapshot.lastRunAt}</span> : null}
      </div>
    </button>
  );
}
