"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TradingAgentHQViewModel, AgentId } from "@/lib/trading-agent-hq/viewModel";
import { buildAgentProgressions } from "@/lib/trading-agent-hq/progression";
import { useTradingAgentHQ } from "@/lib/trading-agent-hq/useTradingAgentHQ";
import { useAgentAnimations } from "@/lib/trading-agent-hq/useAgentAnimations";
import SceneCanvas from "./SceneCanvas";
import TopHud from "./TopHud";
import BottomLogBar from "./BottomLogBar";
import RightInspector from "./RightInspector";
import ModeSwitch from "./ModeSwitch";
import CommandRail from "./CommandRail";
import SafetyStatusStrip from "./SafetyStatusStrip";
import BottomWidgetDock from "./BottomWidgetDock";
import AdvancedDebugCard from "./AdvancedDebugCard";

// THQ-5: starts from server-provided initial (mock), then hydrates from public-safe endpoints.
export default function TradingAgentHQPage({ initialVm }: { initialVm: TradingAgentHQViewModel }) {
  const router = useRouter();
  const { vm, state, error, refresh } = useTradingAgentHQ(initialVm);
  const [selected, setSelected] = useState<AgentId | null>("risk_manager");
  const [hovered, setHovered] = useState<AgentId | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const [debug, setDebug] = useState(false);

  const animKeys = useAgentAnimations(vm.agents);
  const progressions = buildAgentProgressions(vm);
  const selectedAgent = selected ? vm.agents[selected] : null;
  const selectedProgression = selected ? progressions[selected] : null;
  const live = vm.meta.source === "public-safe-api" && state === "ready";

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const goDebug = () => router.push("/public");

  return (
    <div className="min-h-screen bg-[#21170f] px-2 py-3 text-[#2f241b] sm:px-4">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3">
        <SafetyStatusStrip vm={vm} state={state} error={error} live={live} onRefresh={refresh} />

        <ModeSwitch
          lowPower={lowPower}
          debug={debug}
          onToggleLowPower={() => setLowPower((value) => !value)}
          onToggleDebug={() => setDebug((value) => !value)}
        />

        <TopHud vm={vm} />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[86px_minmax(0,1fr)_360px]">
          <CommandRail vm={vm} selected={selected} onSelect={(id) => setSelected(id)} />

          <section className="min-w-0 rounded-lg border border-[#3a2c21]/10 bg-[#fff4df] p-2 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="text-sm font-black text-[#2f241b]">Cafe Floor</h2>
                <p className="text-[11px] text-[#7a6550]">Click an agent to inspect. Double click opens the classic dashboard.</p>
              </div>
              <div className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">
                closedCycles={vm.paper.closedCycles} | {vm.paper.edgeStatus}
              </div>
            </div>

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
          </section>

          <div className="hidden min-h-[260px] space-y-3 xl:block">
            <RightInspector agent={selectedAgent} progression={selectedProgression} paper={vm.paper} onClose={() => setSelected(null)} onDebug={goDebug} />
            <AdvancedDebugCard vm={vm} lowPower={lowPower} debug={debug} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:hidden">
          <RightInspector agent={selectedAgent} progression={selectedProgression} paper={vm.paper} onClose={() => setSelected(null)} onDebug={goDebug} />
          <div className="hidden md:block">
            <AdvancedDebugCard vm={vm} lowPower={lowPower} debug={debug} />
          </div>
        </div>

        <BottomWidgetDock vm={vm} progressions={progressions} onPick={(id) => setSelected(id)} />
        <BottomLogBar log={vm.bottomLog} onPick={(id) => setSelected(id)} selected={selected} />

        <p className="px-1 text-[11px] text-[#cbb799]">
          TradingAgentHQ is a read-only visual layer. It does not send orders, approve risk, enable live trading, or write runtime JSON.
          Data is {live ? "loaded from public-safe endpoints" : "mock/fallback"}; authoritative runtime files remain outside this UI.
        </p>
      </div>
    </div>
  );
}
