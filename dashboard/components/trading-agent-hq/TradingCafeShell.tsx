"use client";

// dashboard/components/trading-agent-hq/TradingCafeShell.tsx
// D6 mission-control frame. SAFETY: layout container only.
// SAFETY: layout container only.

import type { ReactNode } from "react";
import { threeColumnShellClass } from "@/lib/trading-agent-hq/missionControlVisual";

type Props = { sidebar: ReactNode; topbar: ReactNode; children: ReactNode };

export default function TradingCafeShell({ sidebar, topbar, children }: Props) {
  return (
    <div className={threeColumnShellClass()}>
      {sidebar}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="z-20 shrink-0">{topbar}</div>
        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,240,255,0.18),transparent_30%),radial-gradient(circle_at_78%_0,rgba(236,72,153,0.16),transparent_28%),radial-gradient(circle_at_55%_45%,rgba(168,85,247,0.08),transparent_32%),linear-gradient(180deg,rgba(2,8,23,0),rgba(2,8,23,0.92))]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(125,249,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(125,249,255,0.45)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
          <div className="agent-hq-content-frame relative mx-auto flex min-h-full max-w-[1680px] flex-col gap-4 lg:h-full lg:min-h-0 lg:overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}
