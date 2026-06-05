"use client";

import { useEffect, useRef, useState } from "react";
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
import DynamicRegridStatusCard from "./DynamicRegridStatusCard";
import RegridPhase2AReadinessCard from "./RegridPhase2AReadinessCard";
import RuntimeMonitorCard from "./RuntimeMonitorCard";
import RegimeEvidenceCard from "./RegimeEvidenceCard";
import IndicatorGateShadowCard from "./IndicatorGateShadowCard";
import TrendRegimeConfirmationCard from "./TrendRegimeConfirmationCard";

const DEFAULT_AGENT_ID: AgentId = "risk_manager";
const edgeStatusLabel = (status: string) =>
  status === "DATA_GAP"
    ? "ยังไม่มีข้อมูลรอบปิด"
    : status === "REAL_FILLS_ACCUMULATING"
      ? "กำลังสะสม fills จริง แต่ตัวอย่างยังไม่พอ"
      : status;

// THQ-5: starts from server-provided initial (mock), then hydrates from public-safe endpoints.
export default function TradingAgentHQPage({ initialVm }: { initialVm: TradingAgentHQViewModel }) {
  const router = useRouter();
  const { vm, state, error, refresh } = useTradingAgentHQ(initialVm);
  const [selected, setSelected] = useState<AgentId>(DEFAULT_AGENT_ID);
  const [hovered, setHovered] = useState<AgentId | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const [debug, setDebug] = useState(false);
  const [runtimePollMessages, setRuntimePollMessages] = useState<string[]>([]);
  const previousRuntimeMonitor = useRef<{
    cumulativeBuyFillCount: number;
    paperNoTradeCount: number;
    regridCandidateCount: number;
  } | null>(null);

  const animKeys = useAgentAnimations(vm.agents);
  const progressions = buildAgentProgressions(vm);
  const effectiveSelected = vm.agents[selected] ? selected : DEFAULT_AGENT_ID;
  const selectedAgent = vm.agents[effectiveSelected] ?? initialVm.agents[effectiveSelected] ?? null;
  const selectedProgression = progressions[effectiveSelected] ?? progressions[DEFAULT_AGENT_ID] ?? null;
  const live = vm.meta.source === "public-safe-api" && state === "ready";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(DEFAULT_AGENT_ID);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const monitor = vm.paper.runtimeMonitor;
    const previous = previousRuntimeMonitor.current;
    let timeoutId: number | null = null;
    if (previous) {
      const messages: string[] = [];
      if (
        monitor.cumulativeBuyFillCount > previous.cumulativeBuyFillCount &&
        vm.paper.dynamicRegrid.priceVsGrid === "BELOW_GRID"
      ) {
        messages.push("ผิดปกติ: BUY เพิ่มทั้งที่อยู่นอกกรอบ");
      }
      if (monitor.paperNoTradeCount > previous.paperNoTradeCount) messages.push("No-Trade ทำงาน");
      if (monitor.regridCandidateCount > previous.regridCandidateCount) messages.push("Regrid evaluator ทำงาน");
      timeoutId = window.setTimeout(() => setRuntimePollMessages(messages), 0);
    }
    previousRuntimeMonitor.current = {
      cumulativeBuyFillCount: monitor.cumulativeBuyFillCount,
      paperNoTradeCount: monitor.paperNoTradeCount,
      regridCandidateCount: monitor.regridCandidateCount,
    };
    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [
    vm.paper.runtimeMonitor,
    vm.paper.runtimeMonitor.cumulativeBuyFillCount,
    vm.paper.runtimeMonitor.paperNoTradeCount,
    vm.paper.runtimeMonitor.regridCandidateCount,
    vm.paper.dynamicRegrid.priceVsGrid,
  ]);

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

        {/* การ์ดอธิบายสถานะ (ไทย) — ช่วยให้ operator เข้าใจทันทีว่าไม่ใช่ Fail */}
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[#5b4432] shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900">สถานะระบบ (อ่านง่าย)</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">ไม่ใช่ Fail</span>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-800">M-0B: ถูกบล็อก</span>
          </div>
          <p className="mt-2 text-[13px] font-bold leading-relaxed text-[#3f2f22]">
            {vm.paper.closedCycles === 0
              ? `ระบบ Paper ทำงานแล้วและมี fills แล้ว (${vm.paper.totalOrderFilled} ครั้ง) แต่ยังไม่มีรอบ BUY→SELL ที่ปิดครบ ดังนั้น M-0B ยังถูกบล็อกตามปกติ — ยังไม่ใช่ Fail และยังไม่พร้อมเปิดเงินจริง`
              : `ระบบ Paper ทำงานและเริ่มมีรอบปิดครบ (${vm.paper.closedCycles} รอบ) — ยังต้องสะสมตัวอย่างให้พอและผ่าน operator review ก่อน M-0B จะปลดบล็อก`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#6d5745]">
            <span className="font-black text-[#2f241b]">ขั้นตอนถัดไป: </span>
            ปล่อย paper loop รันต่อ และตรวจ raw fills ว่ามี BUY/SELL ครบหรือยัง เป้าหมายถัดไปคือ <span className="font-black">closedCycles &gt; 0</span> ·
            เกตต้นทุน: {vm.paper.costGateStatus === "PASS" ? "ผ่าน (ต้นทุน ไม่ใช่ edge)" : vm.paper.costGateStatus} ·
            เงินจริง/คำสั่งจริงต้องปิดไว้เสมอจนกว่าจะอนุมัติ
          </p>
        </section>

        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          <DynamicRegridStatusCard paper={vm.paper} safety={vm.safety} />
          <RuntimeMonitorCard paper={vm.paper} safety={vm.safety} pollMessages={runtimePollMessages} />
        </div>
        <RegridPhase2AReadinessCard paper={vm.paper} />
        <RegimeEvidenceCard paper={vm.paper} />
        <IndicatorGateShadowCard paper={vm.paper} />
        <TrendRegimeConfirmationCard paper={vm.paper} />

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[86px_minmax(0,1fr)_360px]">
          <CommandRail vm={vm} selected={effectiveSelected} onSelect={(id) => setSelected(id)} />

          <section className="min-w-0 rounded-lg border border-[#3a2c21]/10 bg-[#fff4df] p-2 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="text-sm font-black text-[#2f241b]">ห้องคาเฟ่ (Cafe Floor)</h2>
                <p className="text-[11px] text-[#7a6550]">คลิกที่ Agent เพื่อดูรายละเอียด · ดับเบิลคลิกเพื่อเปิดแดชบอร์ดคลาสสิก</p>
              </div>
              <div className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">
                closedCycles={vm.paper.closedCycles} | {edgeStatusLabel(vm.paper.edgeStatus)}
              </div>
            </div>

            <SceneCanvas
              vm={vm}
              animKeys={animKeys}
              selected={effectiveSelected}
              hovered={hovered}
              lowPower={lowPower}
              debug={debug}
              onHover={setHovered}
              onSelect={(id) => setSelected(id)}
              onDouble={goDebug}
            />
          </section>

          <div className="hidden min-h-[260px] space-y-3 xl:block">
            <RightInspector agent={selectedAgent} progression={selectedProgression} paper={vm.paper} onClose={() => setSelected(DEFAULT_AGENT_ID)} onDebug={goDebug} />
            <AdvancedDebugCard vm={vm} lowPower={lowPower} debug={debug} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:hidden">
          <RightInspector agent={selectedAgent} progression={selectedProgression} paper={vm.paper} onClose={() => setSelected(DEFAULT_AGENT_ID)} onDebug={goDebug} />
          <div className="hidden md:block">
            <AdvancedDebugCard vm={vm} lowPower={lowPower} debug={debug} />
          </div>
        </div>

        <BottomWidgetDock vm={vm} progressions={progressions} onPick={(id) => setSelected(id)} />
        <BottomLogBar log={vm.bottomLog} onPick={(id) => setSelected(id)} selected={effectiveSelected} />

        <p className="px-1 text-[11px] text-[#cbb799]">
          TradingAgentHQ เป็นเลเยอร์แสดงผลแบบอ่านอย่างเดียว — ไม่ส่งคำสั่งเทรด ไม่อนุมัติความเสี่ยง ไม่เปิดเงินจริง และไม่เขียนไฟล์ runtime
          ข้อมูล{live ? "ดึงจาก endpoint ปลอดภัย (public-safe)" : "เป็นข้อมูลจำลอง (mock/fallback)"} · ไฟล์ source of truth จริงอยู่นอก UI นี้
        </p>
      </div>
    </div>
  );
}
