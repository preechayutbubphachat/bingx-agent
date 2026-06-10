"use client";

// dashboard/components/trading-agent-hq/CollapsibleCard.tsx
// Phase UI-1 / UI-1.1 — wraps an EXPANDED Agent HQ card with a slim collapse strip,
// or renders a PINNED card (Cafe Floor) fully and uncollapsible.
// Collapsed cards are NOT rendered here anymore — they appear as compact tiles in
// CollapsedCardGrid. SAFETY: presentation only. No fetch / token / run / live / exchange.

import type { ReactNode } from "react";
import type { CardUpdateSeverity } from "@/lib/trading-agent-hq/cardUpdateSignatures";

type Props = {
  cardId: string;
  title: string;
  /** severity used for the expanded header accent dot */
  severity: CardUpdateSeverity;
  pinned?: boolean;
  onToggle: (cardId: string) => void;
  children: ReactNode;
};

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

export default function CollapsibleCard({ cardId, title, severity, pinned = false, onToggle, children }: Props) {
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
