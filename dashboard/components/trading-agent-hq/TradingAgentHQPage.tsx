"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TradingAgentHQViewModel, AgentId } from "@/lib/trading-agent-hq/viewModel";
import { buildAgentProgressions } from "@/lib/trading-agent-hq/progression";
import { buildMissionControlSummary } from "@/lib/trading-agent-hq/missionControl";
import { analysisRailReadabilityClass, normalizedPanelClass } from "@/lib/trading-agent-hq/missionControlVisual";
import { useTradingAgentHQ } from "@/lib/trading-agent-hq/useTradingAgentHQ";
import { useAgentAnimations } from "@/lib/trading-agent-hq/useAgentAnimations";
import {
  AGENT_HQ_CARD_LAYOUT,
  type AgentHqCardId,
  type AgentHqViewFilter,
  applyCollapseAll,
  applyExpandAll,
  applyResetLayout,
  defaultCollapsedMap,
  loadStoredLayout,
  saveStoredLayout,
} from "@/lib/trading-agent-hq/cardLayout";
import {
  buildCardSnapshot,
  computeUpdateSeverity,
  tileStatusCategory,
  STATUS_CATEGORY_LABEL_TH,
  type CardSnapshot,
  type CardUpdateSeverity,
  type TileStatusCategory,
} from "@/lib/trading-agent-hq/cardUpdateSignatures";
import SceneCanvas from "./SceneCanvas";
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
import CanonicalMarketRegimeCard from "./CanonicalMarketRegimeCard";
import CanonicalRegimeGateCard from "./CanonicalRegimeGateCard";
import IndicatorGateShadowCard from "./IndicatorGateShadowCard";
import TrendRegimeConfirmationCard from "./TrendRegimeConfirmationCard";
import TrendZoneCandidateCard from "./TrendZoneCandidateCard";
import TrendStrategyShadowCard from "./TrendStrategyShadowCard";
import TrendTransitionMonitorCard from "./TrendTransitionMonitorCard";
import TrendManualPaperArmGateCard from "./TrendManualPaperArmGateCard";
import TrendPaperExecutionPreflightCard from "./TrendPaperExecutionPreflightCard";
import TrendPaperExecutionEngineCard from "./TrendPaperExecutionEngineCard";
import TrendEdgeReviewCard from "./TrendEdgeReviewCard";
import TrendPaperArmSessionCard from "./TrendPaperArmSessionCard";
import TrendPaperArmIntentBridgeCard from "./TrendPaperArmIntentBridgeCard";
import TrendPaperDryRunConsoleCard from "./TrendPaperDryRunConsoleCard";
import TrendPaperEvidenceRunnerCard from "./TrendPaperEvidenceRunnerCard";
import CollapsibleCard from "./CollapsibleCard";
import AgentHqCardControls from "./AgentHqCardControls";
import CollapsedCardGrid from "./CollapsedCardGrid";
import type { CollapsedTile } from "./CollapsedCardTile";
import TradingCafeShell from "./TradingCafeShell";
import TradingCafeSidebar from "./TradingCafeSidebar";
import TradingCafeTopBar from "./TradingCafeTopBar";
import TradingCafeKpiCard, { type KpiItem } from "./TradingCafeKpiCard";
import RiskManagerPanel from "./RiskManagerPanel";
import EvidencePilotHealthCard from "./EvidencePilotHealthCard";
import RejectionAnalysisCard from "./RejectionAnalysisCard";
import RrDrilldownCard from "./RrDrilldownCard";
import MtfObFvgShadowCard from "./MtfObFvgShadowCard";
import ShadowOutcomeSummaryCard from "./ShadowOutcomeSummaryCard";
import ReviewReadinessNextStepCard from "./ReviewReadinessNextStepCard";
import TradingCafeBottomPanels from "./TradingCafeBottomPanels";

const STATUS_FILTERS: ("all" | TileStatusCategory)[] = ["all", "working", "waiting", "notready"];

const DEFAULT_AGENT_ID: AgentId = "risk_manager";
const edgeStatusLabel = (status: string) =>
  status === "DATA_GAP"
    ? "ยังไม่มีข้อมูลรอบปิด"
    : status === "REAL_FILLS_ACCUMULATING"
      ? "กำลังสะสม fills จริง แต่ตัวอย่างยังไม่พอ"
      : status;

const CARD_TITLES: Record<string, string> = Object.fromEntries(
  AGENT_HQ_CARD_LAYOUT.map((c) => [c.id, c.title]),
);
// UI-2.2: per-card display icons from the layout registry (presentation only)
const CARD_ICONS: Record<string, string | undefined> = Object.fromEntries(
  AGENT_HQ_CARD_LAYOUT.map((c) => [c.id, c.icon]),
);

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

  // ---- UI-1: collapsible card layout state (SSR-safe; defaults identical on server) ----
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => defaultCollapsedMap());
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<AgentHqViewFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TileStatusCategory>("all");
  const [previousSnapshots, setPreviousSnapshots] = useState<Record<string, CardSnapshot>>({});
  const hydratedRef = useRef(false);

  // Build read-only snapshots once per VM change.
  const snapshots = useMemo(() => {
    const out: Record<string, CardSnapshot> = {};
    for (const c of AGENT_HQ_CARD_LAYOUT) {
      out[c.id] = buildCardSnapshot(c.id as AgentHqCardId, vm.paper, vm.safety);
    }
    return out;
  }, [vm.paper, vm.safety]);

  // Hydrate layout from localStorage after mount (avoids hydration mismatch).
  useEffect(() => {
    const stored = loadStoredLayout();
    if (stored) {
      setCollapsed(stored.collapsed);
      setLastSeen(stored.lastSeenSignatures);
      setFilter(stored.filter);
    }
    hydratedRef.current = true;
  }, []);

  // Seed baselines for missing cards and keep EXPANDED cards marked as "seen".
  useEffect(() => {
    setLastSeen((ls) => {
      let changed = false;
      const next = { ...ls };
      for (const c of AGENT_HQ_CARD_LAYOUT) {
        if (c.pinned) continue;
        const sig = snapshots[c.id]?.signature;
        if (sig == null) continue;
        const missing = next[c.id] == null;
        const expanded = !collapsed[c.id];
        if ((missing || expanded) && next[c.id] !== sig) {
          next[c.id] = sig;
          changed = true;
        }
      }
      return changed ? next : ls;
    });
  }, [snapshots, collapsed]);

  // Persist layout (only after hydration so we never clobber stored state with defaults).
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveStoredLayout({ version: 1, collapsed, lastSeenSignatures: lastSeen, filter });
  }, [collapsed, lastSeen, filter]);

  // Track previous snapshots for transition-based severity.
  useEffect(() => {
    setPreviousSnapshots(snapshots);
  }, [snapshots]);

  const animKeys = useAgentAnimations(vm.agents);
  const progressions = buildAgentProgressions(vm);
  const effectiveSelected = vm.agents[selected] ? selected : DEFAULT_AGENT_ID;
  const selectedAgent = vm.agents[effectiveSelected] ?? initialVm.agents[effectiveSelected] ?? null;
  const selectedProgression = progressions[effectiveSelected] ?? progressions[DEFAULT_AGENT_ID] ?? null;
  const live = vm.meta.source === "public-safe-api" && state === "ready";

  const toggleCard = useCallback(
    (id: string) => {
      const currentlyCollapsed = collapsed[id];
      if (currentlyCollapsed) {
        const sig = snapshots[id]?.signature;
        if (sig != null) setLastSeen((ls) => ({ ...ls, [id]: sig }));
      }
      setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
    },
    [collapsed, snapshots],
  );

  const liveSeverity = useCallback(
    (id: string): CardUpdateSeverity => computeUpdateSeverity(snapshots[id], previousSnapshots[id]),
    [snapshots, previousSnapshots],
  );

  const cardHasUpdates = useCallback(
    (id: string): boolean => {
      const snap = snapshots[id];
      if (!snap) return false;
      return !!collapsed[id] && lastSeen[id] != null && lastSeen[id] !== snap.signature;
    },
    [collapsed, lastSeen, snapshots],
  );

  const displayedSeverity = useCallback(
    (id: string): CardUpdateSeverity => {
      const snap = snapshots[id];
      if (!snap) return "none";
      if (snap.critical) return "critical";
      if (cardHasUpdates(id)) {
        const sev = liveSeverity(id);
        return sev === "none" ? "info" : sev;
      }
      return "none";
    },
    [snapshots, cardHasUpdates, liveSeverity],
  );

  const updatedCount = useMemo(
    () =>
      AGENT_HQ_CARD_LAYOUT.filter((c) => !c.pinned).filter((c) => cardHasUpdates(c.id) || snapshots[c.id]?.critical)
        .length,
    [cardHasUpdates, snapshots],
  );

  // UI-1.1: collapsed cards are rendered as compact tiles (CollapsedCardGrid), not inline.
  // wrap() now only renders EXPANDED cards inline; collapsed ones return null here.
  const wrap = useCallback(
    (id: AgentHqCardId, node: ReactNode) => {
      const snap = snapshots[id];
      if (!snap) return null;
      if (collapsed[id]) return null; // shown as a tile above
      if (filter === "updated" && !(cardHasUpdates(id) || snap.critical)) return null;
      return (
        <CollapsibleCard cardId={id} title={CARD_TITLES[id] ?? id} icon={CARD_ICONS[id]} severity={displayedSeverity(id)} onToggle={toggleCard}>
          {node}
        </CollapsibleCard>
      );
    },
    [snapshots, cardHasUpdates, filter, displayedSeverity, collapsed, toggleCard],
  );

  // Compact tiles for every collapsed, non-pinned card (filter-aware: "updated" + status chip).
  const collapsedTiles = useMemo<CollapsedTile[]>(
    () =>
      AGENT_HQ_CARD_LAYOUT.filter((c) => !c.pinned && collapsed[c.id] && snapshots[c.id])
        .filter((c) => filter !== "updated" || cardHasUpdates(c.id) || snapshots[c.id]!.critical)
        .filter((c) => statusFilter === "all" || tileStatusCategory(snapshots[c.id]!) === statusFilter)
        .map((c) => ({
          id: c.id,
          title: c.title,
          icon: c.icon,
          snapshot: snapshots[c.id]!,
          severity: displayedSeverity(c.id),
          hasUpdates: cardHasUpdates(c.id),
        })),
    [collapsed, snapshots, filter, statusFilter, cardHasUpdates, displayedSeverity],
  );

  // KPI row — derived from existing read-only VM; null-safe, never invents market values.
  const kpiItems = useMemo<KpiItem[]>(() => {
    const summary = buildMissionControlSummary(vm, "--:--:--");
    const iconById: Record<string, string> = {
      mission: "◈",
      review: "◎",
      agents: "✦",
      sessions: "◌",
      alerts: "△",
      paperMode: "▣",
    };
    const toneByMission: Record<string, KpiItem["tone"]> = {
      active: "green",
      review: "teal",
      info: "info",
      waiting: "amber",
      blocked: "red",
      neutral: "neutral",
    };
    return summary.kpis.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      sub: item.sub,
      icon: iconById[item.id] ?? "◇",
      tone: toneByMission[item.tone] ?? "neutral",
    }));
  }, [vm]);

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

  const systemStatusNode = (
    <section className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-amber-100 shadow-[0_0_26px_rgba(245,158,11,0.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-100">สถานะระบบ / System Status</span>
        <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">ไม่ใช่ Fail</span>
        <span className="rounded-full border border-rose-300/40 bg-rose-400/10 px-2 py-0.5 text-[10px] font-black text-rose-200">M-0B: ถูกบล็อก</span>
      </div>
      <p className="mt-2 text-[13px] font-bold leading-relaxed text-amber-50">
        {vm.paper.closedCycles === 0
          ? `ระบบ Paper ทำงานแล้วและมี fills แล้ว (${vm.paper.totalOrderFilled} ครั้ง) แต่ยังไม่มีรอบ BUY→SELL ที่ปิดครบ ดังนั้น M-0B ยังถูกบล็อกตามปกติ — ยังไม่ใช่ Fail และยังไม่พร้อมเปิดเงินจริง`
          : `ระบบ Paper ทำงานและเริ่มมีรอบปิดครบ (${vm.paper.closedCycles} รอบ) — ยังต้องสะสมตัวอย่างให้พอและผ่าน operator review ก่อน M-0B จะปลดบล็อก`}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
        <span className="font-black text-amber-50">ขั้นตอนถัดไป: </span>
        ปล่อย paper loop รันต่อ และตรวจ raw fills ว่ามี BUY/SELL ครบหรือยัง เป้าหมายถัดไปคือ <span className="font-black">closedCycles &gt; 0</span> ·
        เกตต้นทุน: {vm.paper.costGateStatus === "PASS" ? "ผ่าน (ต้นทุน ไม่ใช่ edge)" : vm.paper.costGateStatus} ·
        เงินจริง/คำสั่งจริงต้องปิดไว้เสมอจนกว่าจะอนุมัติ
      </p>
    </section>
  );

  return (
    <TradingCafeShell
      sidebar={<TradingCafeSidebar activeId="dashboard" />}
      topbar={<TradingCafeTopBar live={live} lastUpdate={vm.meta.lastUpdate} safety={vm.safety} onRefresh={refresh} />}
    >
      <div className="grid min-h-0 grid-cols-1 gap-4 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-2 scrollbar-thin">
          {/* Strong, always-visible safety banner */}
          <SafetyStatusStrip vm={vm} state={state} error={error} live={live} onRefresh={refresh} />

          {/* KPI summary row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {kpiItems.map((item) => (
              <TradingCafeKpiCard key={item.id} item={item} />
            ))}
          </div>

          {/* View controls (collapse/expand/updated/reset) + render mode toggles */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <AgentHqCardControls
              filter={filter}
              updatedCount={updatedCount}
              onCollapseAll={() => setCollapsed((c) => applyCollapseAll(c))}
              onExpandAll={() => setCollapsed((c) => applyExpandAll(c))}
              onToggleUpdatedFilter={() => setFilter((f) => (f === "updated" ? "all" : "updated"))}
              onResetLayout={() => {
                setCollapsed(applyResetLayout());
                setFilter("all");
                setStatusFilter("all");
              }}
            />
            <ModeSwitch
              lowPower={lowPower}
              debug={debug}
              onToggleLowPower={() => setLowPower((value) => !value)}
              onToggleDebug={() => setDebug((value) => !value)}
            />
          </div>
          {/* Agent & System Status */}
          <section className={`${normalizedPanelClass("standard")} agent-hq-status-wall p-3`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-black text-cyan-100">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 text-[14px]" aria-hidden="true">▦</span>
                Agent &amp; System Status Wall
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((sf) => {
                  const active = statusFilter === sf;
                  const label = sf === "all" ? "ทั้งหมด" : STATUS_CATEGORY_LABEL_TH[sf];
                  return (
                    <button
                      key={sf}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(sf)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition ${
                        active
                          ? "border-cyan-300/70 bg-cyan-400/20 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.16)]"
                          : "border-slate-700 bg-slate-900/80 text-slate-400 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {collapsedTiles.length ? (
              <CollapsedCardGrid tiles={collapsedTiles} onExpand={toggleCard} />
            ) : (
              <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-4 text-center text-[11px] font-bold text-slate-500">
                ไม่มีการ์ดที่ย่อในมุมมองนี้ — การ์ดที่ขยายแสดงอยู่ด้านล่าง
              </p>
            )}
          </section>

          <ReviewReadinessNextStepCard paper={vm.paper} />

          {/* Expanded cards (UI-1 behavior preserved), arranged desktop-first as a dense command grid. */}
          <div className="grid grid-cols-1 items-stretch gap-3 2xl:grid-cols-2 [&>div]:h-full [&_dd]:text-slate-100 [&_dt]:text-slate-500 [&_h2]:text-cyan-100 [&_h3]:text-cyan-100 [&_p]:text-slate-300 [&_section]:h-full [&_section]:border-cyan-400/20 [&_section]:bg-slate-950/70 [&_section]:text-slate-100">
            {wrap("systemStatus", systemStatusNode)}
            {wrap("dynamicRegridStatus", <DynamicRegridStatusCard paper={vm.paper} safety={vm.safety} />)}
            {wrap(
              "runtimeMonitor",
              <RuntimeMonitorCard paper={vm.paper} safety={vm.safety} pollMessages={runtimePollMessages} />,
            )}
            {wrap("regridPhase2AReadiness", <RegridPhase2AReadinessCard paper={vm.paper} />)}
            {wrap("canonicalMarketRegime", <CanonicalMarketRegimeCard paper={vm.paper} />)}
            {wrap("canonicalRegimeGate", <CanonicalRegimeGateCard paper={vm.paper} />)}
            {wrap("regimeEvidence", <RegimeEvidenceCard paper={vm.paper} />)}
            {wrap("indicatorGate", <IndicatorGateShadowCard paper={vm.paper} />)}
            {wrap("trendRegimeConfirmation", <TrendRegimeConfirmationCard paper={vm.paper} />)}
            {wrap("trendZoneCandidate", <TrendZoneCandidateCard paper={vm.paper} />)}
            {wrap("trendStrategyShadow", <TrendStrategyShadowCard paper={vm.paper} />)}
            {wrap("trendTransitionMonitor", <TrendTransitionMonitorCard paper={vm.paper} />)}
            {wrap("trendManualPaperArmGate", <TrendManualPaperArmGateCard paper={vm.paper} />)}
            {wrap("trendPaperArmSession", <TrendPaperArmSessionCard paper={vm.paper} />)}
            {wrap("trendPaperArmIntentBridge", <TrendPaperArmIntentBridgeCard paper={vm.paper} />)}
            {wrap("trendPaperDryRunConsole", <TrendPaperDryRunConsoleCard paper={vm.paper} />)}
            {wrap("trendPaperEvidenceRunner", <TrendPaperEvidenceRunnerCard paper={vm.paper} />)}
            {wrap("trendPaperExecutionPreflight", <TrendPaperExecutionPreflightCard paper={vm.paper} />)}
            {wrap("trendPaperExecutionEngine", <TrendPaperExecutionEngineCard paper={vm.paper} />)}
            {wrap("trendEdgeReview", <TrendEdgeReviewCard paper={vm.paper} />)}
          </div>

          {/* Command Floor — Cafe Floor remains the pinned, always-visible anchor */}
          <section className="relative min-w-0 overflow-hidden rounded-2xl border border-fuchsia-400/25 bg-slate-950/80 p-3 shadow-[0_0_46px_rgba(217,70,239,0.14)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/70 to-transparent" />
            <div className="pointer-events-none absolute -right-12 top-8 h-40 w-40 rounded-full bg-fuchsia-400/10 blur-3xl" />
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-fuchsia-300/50 bg-fuchsia-400/10 text-[17px] text-fuchsia-100" aria-hidden="true">◇</span>
                <div>
                  <h2 className="text-[15px] font-black text-white">Trading Cafe HQ / Visual Command Floor</h2>
                  <p className="text-[11px] text-slate-400">คลิกที่ Agent เพื่อดูรายละเอียด · visual layer เท่านั้น ไม่ส่งคำสั่ง</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-100">โหมดจำลอง</span>
                <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-400/10 px-2 py-1 text-[10px] font-black text-fuchsia-100">Command View</span>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-200">Pinned · แสดงตลอด</span>
                <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-1 text-[10px] font-black text-amber-200">
                  closedCycles={vm.paper.closedCycles} | {edgeStatusLabel(vm.paper.edgeStatus)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[86px_minmax(0,1fr)_340px]">
              <CommandRail vm={vm} selected={effectiveSelected} onSelect={(id) => setSelected(id)} />
              <div className="min-w-0 overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-900/85 p-2 shadow-[inset_0_0_26px_rgba(34,211,238,0.06)] xl:max-h-[430px]">
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
              </div>
              <div className="hidden min-h-[260px] max-h-[430px] space-y-3 overflow-y-auto pr-1 xl:block scrollbar-thin">
                <RightInspector agent={selectedAgent} progression={selectedProgression} paper={vm.paper} onClose={() => setSelected(DEFAULT_AGENT_ID)} onDebug={goDebug} />
                <AdvancedDebugCard vm={vm} lowPower={lowPower} debug={debug} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 xl:hidden">
              <RightInspector agent={selectedAgent} progression={selectedProgression} paper={vm.paper} onClose={() => setSelected(DEFAULT_AGENT_ID)} onDebug={goDebug} />
              <div className="hidden md:block">
                <AdvancedDebugCard vm={vm} lowPower={lowPower} debug={debug} />
              </div>
            </div>
          </section>

          {/* Bottom dashboard panels */}
          <TradingCafeBottomPanels vm={vm} />

          <BottomWidgetDock vm={vm} progressions={progressions} onPick={(id) => setSelected(id)} />
          <BottomLogBar log={vm.bottomLog} onPick={(id) => setSelected(id)} selected={effectiveSelected} />
        </div>

        {/* Right analysis rail: independent desktop scroller, stacks below on smaller screens. */}
        <aside className={analysisRailReadabilityClass()} aria-label="แถบวิเคราะห์ / Analysis Rail">
          <div className="sticky top-0 z-10 rounded-2xl border border-fuchsia-300/25 bg-slate-950/95 px-3 py-2 shadow-[0_12px_28px_rgba(2,8,23,0.78)] backdrop-blur">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-200">Analysis Rail</div>
            <h2 className="mt-0.5 text-[14px] font-black text-cyan-50">แถบวิเคราะห์ / Diagnostics Dock</h2>
            <p className="mt-1 text-[11px] font-bold leading-relaxed text-slate-300">อ่านแยกจาก center canvas ได้ · Paper-only · ไม่ใช่ Activation/Live/Order</p>
          </div>
          {/* UI-2.1 Task C: read-only health heartbeat (existing VM fields only) */}
          <EvidencePilotHealthCard paper={vm.paper} />
          {/* T-3H-6-a: read-only rejection frequency summary (observe only) */}
          <RejectionAnalysisCard paper={vm.paper} />
          {/* T-3H-6-b: read-only RR drilldown for the latest setup (observe only) */}
          <RrDrilldownCard paper={vm.paper} />
          {/* T-3H-6-c: read-only MTF OB/FVG refinement shadow (observe only) */}
          <MtfObFvgShadowCard paper={vm.paper} />
          {/* D5.2-c: read-only shadow outcome (counterfactual reachability) evidence — not real trades */}
          <ShadowOutcomeSummaryCard paper={vm.paper} />
          <RiskManagerPanel paper={vm.paper} safety={vm.safety} log={vm.bottomLog} />
        </aside>
      </div>

      <p className="px-1 text-[11px] text-slate-500">
        TradingAgentHQ เป็นเลเยอร์แสดงผลแบบอ่านอย่างเดียว — ไม่ส่งคำสั่งเทรด ไม่อนุมัติความเสี่ยง ไม่เปิดเงินจริง และไม่เขียนไฟล์ runtime
        ข้อมูล{live ? "ดึงจาก endpoint ปลอดภัย (public-safe)" : "เป็นข้อมูลจำลอง (mock/fallback)"} · ไฟล์ source of truth จริงอยู่นอก UI นี้
      </p>
    </TradingCafeShell>
  );
}
