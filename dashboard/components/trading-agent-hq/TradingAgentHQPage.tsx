// dashboard/components/trading-agent-hq/TradingAgentHQPage.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TradingAgentHQViewModel, AgentId } from "@/lib/trading-agent-hq/viewModel";
import { useTradingAgentHQ } from "@/lib/trading-agent-hq/useTradingAgentHQ";
import { useAgentAnimations } from "@/lib/trading-agent-hq/useAgentAnimations";
import SceneCanvas from "./SceneCanvas";
import TopHud from "./TopHud";
import BottomLogBar from "./BottomLogBar";
import RightInspector from "./RightInspector";
import ModeSwitch from "./ModeSwitch";

// THQ-5: starts from server-provided initial (mock), then hydrates from public-safe endpoints.
export default function TradingAgentHQPage({ initialVm }: { initialVm: TradingAgentHQViewModel }) {
  const router = useRouter();
  const { vm, state, error, refresh } = useTradingAgentHQ(initialVm);
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [hovered, setHovered] = useState<AgentId | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const [debug, setDebug] = useState(false);

  const animKeys = useAgentAnimations(vm.agents);
  const selectedAgent = selected ? vm.agents[selected] : null;
  const live = vm.meta.source === "public-safe-api" && state === "ready";

  // ESC closes the inspector
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const goDebug = () => router.push("/public");

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3 sm:p-4">
      <ModeSwitch
        lowPower={lowPower}
        debug={debug}
        onToggleLowPower={() => setLowPower((v) => !v)}
        onToggleDebug={() => setDebug((v) => !v)}
      />

      {/* data-source / freshness indicator (honest) */}
      <div className="flex flex-wrap items-center gap-2 px-1 text-[11px]">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            live ? "bg-emerald-100 text-emerald-700" : "bg-fuchsia-100 text-fuchsia-700"
          }`}
        >
          {state === "loading" ? "loading…" : live ? "public-safe data" : "MOCK / fallback"}
        </span>
        <span className="text-neutral-500">source: {vm.meta.source}</span>
        <span className="text-neutral-400">· updated: {vm.meta.lastUpdate}</span>
        {vm.meta.isStale && <span className="text-amber-600">· ⚠ stale</span>}
        {error && <span className="text-red-600">· endpoint: {error}</span>}
        <button
          type="button"
          onClick={refresh}
          className="ml-auto rounded-full bg-white px-3 py-0.5 font-medium text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"
        >
          Refresh
        </button>
      </div>

      <TopHud vm={vm} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <SceneCanvas
          vm={vm}
          animKeys={animKeys}
          selected={selected}
          hovered={hovered}
          lowPower={lowPower}
          debug={debug}
          onHover={setHovered}
          onSelect={(id) => setSelected(id)}
          onDouble={goDebug}
        />
        {/* side column inspector (lg+) */}
        <div className="hidden min-h-[260px] lg:block">
          <RightInspector
            agent={selectedAgent}
            paper={vm.paper}
            onClose={() => setSelected(null)}
            onDebug={goDebug}
          />
        </div>
      </div>

      {/* mobile bottom-sheet inspector (<lg) */}
      {selectedAgent && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelected(null)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-1 shadow-2xl">
            <RightInspector
              agent={selectedAgent}
              paper={vm.paper}
              onClose={() => setSelected(null)}
              onDebug={goDebug}
            />
          </div>
        </div>
      )}

      <BottomLogBar log={vm.bottomLog} onPick={(id) => setSelected(id)} selected={selected} />

      <p className="px-1 text-[11px] text-neutral-400">
        TradingAgentHQ เป็น read-only visual layer — ไม่ส่งคำสั่งเทรด ไม่ approve risk ไม่เปิด live trading ·
        ข้อมูล {live ? "ดึงจาก public-safe endpoints" : "เป็น MOCK (prototype/fallback)"} ·
        source of truth ที่แท้จริงอยู่ที่ Classic Dashboard (/public)
      </p>
    </div>
  );
}
