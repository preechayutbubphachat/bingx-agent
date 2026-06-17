"use client";

// dashboard/components/trading-agent-hq/TradingCafeShell.tsx
// D6 mission-control frame. SAFETY: layout container only.
// SAFETY: layout container only.

import type { ReactNode } from "react";

type Props = { sidebar: ReactNode; topbar: ReactNode; children: ReactNode };

export default function TradingCafeShell({ sidebar, topbar, children }: Props) {
  return (
    <div className="flex min-h-screen bg-[#020817] text-[#d7f7ff]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20">{topbar}</div>
        <main className="relative min-w-0 flex-1 overflow-hidden px-3 py-4 sm:px-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,240,255,0.16),transparent_32%),radial-gradient(circle_at_80%_0,rgba(236,72,153,0.15),transparent_30%),linear-gradient(180deg,rgba(2,8,23,0),rgba(2,8,23,0.9))]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(125,249,255,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(125,249,255,0.55)_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="relative mx-auto flex max-w-[1680px] flex-col gap-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
