"use client";

// dashboard/components/trading-agent-hq/TradingCafeShell.tsx
// Phase UI-2 — command-center frame: dark sidebar + cream workspace with sticky top bar.
// SAFETY: layout container only.

import type { ReactNode } from "react";

type Props = { sidebar: ReactNode; topbar: ReactNode; children: ReactNode };

export default function TradingCafeShell({ sidebar, topbar, children }: Props) {
  return (
    <div className="flex min-h-screen bg-[#f7efe3] text-[#2b2118]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20">{topbar}</div>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5">
          <div className="mx-auto flex max-w-[1560px] flex-col gap-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
