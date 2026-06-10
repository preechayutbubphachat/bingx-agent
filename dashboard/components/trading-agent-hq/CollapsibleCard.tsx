"use client";

// dashboard/components/trading-agent-hq/CollapsibleCard.tsx
// Phase UI-1 — wraps an existing Agent HQ card with collapse/expand + a smart mini-panel.
// SAFETY: presentation only. No fetch, no token, no run/live/exchange controls.

import type { ReactNode } from "react";
import type { CardUpdateSeverity, CardSnapshot } from "@/lib/trading-agent-hq/cardUpdateSignatures";
import { SEVERITY_LABEL_TH } from "@/lib/trading-agent-hq/cardUpdateSignatures";

type Props = {
  cardId: string;
  title: string;
  snapshot: CardSnapshot;
  /** severity used for the collapsed badge / accent */
  severity: CardUpdateSeverity;
  /** whether the card content changed since last seen while collapsed */
  hasUpdates: boolean;
  collapsed: boolean;
  pinned?: boolean;
  onToggle: (cardId: string) => void;
  children: ReactNode;
};

function severityClasses(sev: CardUpdateSeverity): string {
  switch (sev) {
    case "critical":
      return "border-red-300 bg-red-50 text-red-900";
    case "success":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "info":
      return "border-sky-300 bg-sky-50 text-sky-900";
    default:
      return "border-[#d6c2a6] bg-white/70 text-[#5b4432]";
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

export default function CollapsibleCard({
  cardId,
  title,
  snapshot,
  severity,
  hasUpdates,
  collapsed,
  pinned = false,
  onToggle,
  children,
}: Props) {
  // Pinned cards (Cafe Floor) always render fully and can never be collapsed.
  if (pinned) {
    return (
      <div className="relative">
        <span className="absolute right-2 top-2 z-10 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
          ปักหมุด · แสดงตลอด
        </span>
        {children}
      </div>
    );
  }

  if (collapsed) {
    const showBadge = severity !== "none" || hasUpdates;
    const badgeLabel = hasUpdates ? "มีอัปเดต" : SEVERITY_LABEL_TH[severity];
    return (
      <button
        type="button"
        onClick={() => onToggle(cardId)}
        aria-expanded="false"
        className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left shadow-sm transition hover:brightness-[0.99] ${severityClasses(severity)}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotClass(severity)}`} aria-hidden="true" />
            <span className="text-[13px] font-black text-[#2f241b]">{title}</span>
          </div>
          {showBadge ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${severityClasses(severity)}`}>{badgeLabel}</span>
          ) : null}
        </div>
        <div className="truncate text-[11px] font-bold text-[#5b4432]">
          {snapshot.status}
          {snapshot.summary ? <span className="font-medium text-[#7a6550]"> · {snapshot.summary}</span> : null}
        </div>
        <div className="flex items-center justify-between text-[10px] text-[#9a8a72]">
          <span>กดเพื่อขยาย</span>
          {snapshot.lastRunAt ? <span>updated {snapshot.lastRunAt}</span> : null}
        </div>
      </button>
    );
  }

  // Expanded: slim control strip + the original card content untouched.
  return (
    <div className="rounded-lg">
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass(severity)}`} aria-hidden="true" />
          <span className="text-[11px] font-black text-[#cbb799]">{title}</span>
        </div>
        <button
          type="button"
          onClick={() => onToggle(cardId)}
          aria-expanded="true"
          className="rounded-md border border-[#6d5640] bg-[#2c2017] px-2 py-0.5 text-[10px] font-black text-[#e8d8bd] hover:bg-[#3a2c20]"
        >
          ย่อการ์ดนี้
        </button>
      </div>
      {children}
    </div>
  );
}
