// dashboard/components/trading-agent-hq/ModeSwitch.tsx
"use client";

import Link from "next/link";

export default function ModeSwitch({
  lowPower, debug, onToggleLowPower, onToggleDebug,
}: {
  lowPower: boolean;
  debug: boolean;
  onToggleLowPower: () => void;
  onToggleDebug: () => void;
}) {
  const base = "rounded-full px-3 py-1 text-xs font-medium ring-1 transition";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-neutral-700">🎮 TradingAgentHQ</span>
      <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">read-only</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLowPower}
          aria-pressed={lowPower}
          className={`${base} ${lowPower ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-neutral-700 ring-neutral-300"}`}
        >
          Low Power: {lowPower ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          onClick={onToggleDebug}
          aria-pressed={debug}
          className={`${base} ${debug ? "bg-fuchsia-600 text-white ring-fuchsia-600" : "bg-white text-neutral-700 ring-neutral-300"}`}
        >
          Debug: {debug ? "ON" : "OFF"}
        </button>
        <Link
          href="/public"
          className={`${base} bg-neutral-800 text-white ring-neutral-800 hover:bg-neutral-700`}
        >
          Classic Dashboard →
        </Link>
      </div>
    </div>
  );
}
