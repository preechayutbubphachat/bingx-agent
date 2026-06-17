"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AgentId, LogEntry, TradingAgentHQViewModel } from "@/lib/trading-agent-hq/viewModel";
import {
  listActiveMissions,
  listAgentProgressions,
  MISSION_CATEGORY_TH,
  type AgentBadge,
  type AgentProgression,
  type Mission,
  type MissionStatus,
} from "@/lib/trading-agent-hq/progression";

const TYPE_BADGE: Record<LogEntry["type"], string> = {
  FILL_RESULT: "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200",
  ALERT: "border border-amber-300/40 bg-amber-400/10 text-amber-200",
  DECISION: "border border-cyan-300/40 bg-cyan-400/10 text-cyan-200",
  SYSTEM: "border border-slate-600 bg-slate-800 text-slate-300",
};

function Widget({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-[310px] min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-3 shadow-[0_0_30px_rgba(34,211,238,0.07)]">
      <h2 className="mb-2 flex shrink-0 items-center gap-1.5 truncate text-xs font-black uppercase tracking-[0.12em] text-cyan-100">
        {icon && <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 text-sm text-cyan-100" aria-hidden>{icon}</span>}
        <span className="truncate">{title}</span>
      </h2>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">{children}</div>
    </section>
  );
}

function MiniProgress({ label, status }: { label: string; status: "COST_PASS" | "DATA_GAP" | "BLOCKED" | "PENDING" | "INFO" }) {
  const statusLabel = {
    COST_PASS: "ต้นทุนผ่าน",
    DATA_GAP: "ข้อมูลยังไม่พอ",
    BLOCKED: "ถูกบล็อก",
    PENDING: "รอข้อมูล",
    INFO: "กำลังสะสม",
  }[status];
  const cls =
    status === "COST_PASS"
      ? "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
      : status === "DATA_GAP"
        ? "border border-amber-300/40 bg-amber-400/10 text-amber-200"
        : status === "BLOCKED"
          ? "border border-rose-300/40 bg-rose-400/10 text-rose-200"
          : status === "INFO"
            ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-200"
            : "border border-slate-600 bg-slate-800 text-slate-300";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b border-cyan-400/10 py-1.5 text-xs last:border-0">
      <span className="min-w-0 break-words text-slate-300">{label}</span>
      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black ${cls}`}>{statusLabel}</span>
    </div>
  );
}

function missionTone(status: MissionStatus) {
  if (status === "DONE") return "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200";
  if (status === "IN_PROGRESS") return "border border-cyan-300/40 bg-cyan-400/10 text-cyan-200";
  if (status === "DATA_GAP" || status === "WARNING") return "border border-amber-300/40 bg-amber-400/10 text-amber-200";
  if (status === "NOT_APPROVED") return "border border-orange-300/40 bg-orange-400/10 text-orange-200";
  return "border border-rose-300/40 bg-rose-400/10 text-rose-200";
}

const MISSION_STATUS_TH: Record<MissionStatus, string> = {
  DONE: "เสร็จแล้ว",
  IN_PROGRESS: "กำลังทำ",
  DATA_GAP: "ยังไม่มีข้อมูลรอบปิด",
  WARNING: "ต้องระวัง",
  NOT_APPROVED: "ยังไม่อนุมัติ",
  BLOCKED: "ถูกบล็อก",
  FAIL: "ไม่ผ่าน",
};

const PROGRESSION_STATUS_TH: Record<string, string> = {
  active: "กำลังทำงาน",
  watching: "เฝ้าดู",
  data_gap: "ข้อมูลยังไม่พอ",
  blocked: "ถูกบล็อก",
  unknown: "ไม่ทราบ",
};

function badgeTone(tone: AgentBadge["tone"]) {
  if (tone === "safe") return "border-emerald-300/40 bg-emerald-400/10 text-emerald-200";
  if (tone === "info") return "border-cyan-300/40 bg-cyan-400/10 text-cyan-200";
  if (tone === "warning") return "border-amber-300/40 bg-amber-400/10 text-amber-200";
  return "border-rose-300/40 bg-rose-400/10 text-rose-200";
}

function AgentProgressRow({ item, onPick }: { item: AgentProgression; onPick: (id: AgentId) => void }) {
  const reason = item.blockedReasons[0] ?? "ติดตามหลักฐานแบบอ่านอย่างเดียว";
  return (
    <button
      type="button"
      onClick={() => onPick(item.agentId)}
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-left text-xs transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
    >
      <div className="min-w-0">
        <div className="truncate font-black text-slate-100">{item.name}</div>
        <div className="truncate text-[10px] text-slate-500">{reason}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.xpPct}%` }} />
        </div>
      </div>
      <div className="text-right">
        <div className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">LV {item.level}</div>
        <div className="mt-1 text-[10px] font-bold uppercase text-slate-500">{PROGRESSION_STATUS_TH[item.status] ?? item.status}</div>
      </div>
    </button>
  );
}

function MissionDetail({ item }: { item: Mission }) {
  return (
    <div className="rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-[11px] text-slate-300">
      <div className="font-black text-slate-100">{item.title}</div>
      <div className="mt-1">มีแล้ว: {item.completeEvidence.length ? item.completeEvidence.join("; ") : "ยังไม่พอ"}</div>
      <div className="mt-1">ที่ยังขาด: {item.missingEvidence.length ? item.missingEvidence.join("; ") : "ไม่มีบันทึก"}</div>
      <div className="mt-1">ถัดไป: {item.nextSafeAction}</div>
      <div className="mt-1 rounded border border-amber-300/40 bg-amber-400/10 px-2 py-1 font-bold text-amber-200">{item.safetyNote}</div>
    </div>
  );
}

function BadgeDetail({ item }: { item: AgentBadge }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 text-[11px] ${badgeTone(item.tone)}`}>
      <div className="font-black">{item.name}</div>
      <div className="mt-1">{item.description}</div>
      <div className="mt-1"><span className="font-black">ที่มาหลักฐาน: </span>{item.evidenceSource}</div>
      <div className="mt-1"><span className="font-black">ไม่ได้หมายความว่า: </span>{item.doesNotMean}</div>
    </div>
  );
}

export default function BottomWidgetDock({
  vm,
  progressions,
  onPick,
}: {
  vm: TradingAgentHQViewModel;
  progressions: Record<AgentId, AgentProgression>;
  onPick: (id: AgentId) => void;
}) {
  const [openMissionId, setOpenMissionId] = useState<string | null>(null);
  const [openBadgeName, setOpenBadgeName] = useState<string | null>(null);
  const alerts = vm.bottomLog.filter((entry) => entry.type === "ALERT");
  const fills = vm.bottomLog.filter((entry) => entry.type === "FILL_RESULT");
  const decisions = vm.bottomLog.filter((entry) => entry.type === "DECISION");
  const agentProgressions = listAgentProgressions(progressions);
  const activeMissions = listActiveMissions(progressions);
  const badges = agentProgressions.flatMap((agent) => agent.badges).filter((item, index, all) => all.findIndex((other) => other.name === item.name) === index);
  const openMission = activeMissions.find((item) => item.id === openMissionId) ?? activeMissions[0];
  const openBadge = badges.find((item) => item.name === openBadgeName) ?? badges[0];
  const closedCycleStatus = vm.paper.closedCycles > 0 ? "INFO" : "DATA_GAP";
  const sampleStatus = vm.paper.sampleStatus === "SUFFICIENT" ? "INFO" : "DATA_GAP";
  const costStatus = vm.paper.costGateStatus === "PASS" ? "COST_PASS" : vm.paper.costGateStatus === "UNKNOWN" ? "PENDING" : "DATA_GAP";
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-4 2xl:grid-cols-7">
      <Widget icon="📊" title="ความคืบหน้า Agent">
        <div className="space-y-2">
          {agentProgressions.map((item) => (
            <AgentProgressRow key={item.agentId} item={item} onPick={onPick} />
          ))}
        </div>
        <div className="mt-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-[10px] font-bold text-amber-100">
          XP = ระดับความสมบูรณ์ของหลักฐานเท่านั้น · XP ไม่ควบคุมการเทรด · เลเวลไม่ปลดล็อกเงินจริง · ต้องมีรอบปิดครบก่อนจึงประเมิน expectancy · Cost ผ่าน ≠ edge ผ่าน
        </div>
      </Widget>

      <Widget icon="🗒️" title="ภารกิจที่กำลังทำ">
        <div className="space-y-2">
          {activeMissions.map((item) => (
            <div key={item.id} className="min-w-0 rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-300">
              <button type="button" onClick={() => setOpenMissionId(item.id)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-black text-slate-100">{item.title}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{MISSION_CATEGORY_TH[item.category]}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${missionTone(item.status)}`}>{MISSION_STATUS_TH[item.status]}</span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.detail}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.progressPct}%` }} />
                </div>
              </button>
            </div>
          ))}
          {openMission ? <MissionDetail item={openMission} /> : null}
        </div>
      </Widget>

      <Widget icon="🏅" title="เหรียญ / รางวัล">
        <div className="flex flex-wrap gap-1.5">
          {badges.map((item) => (
            <button
              key={item.name}
              type="button"
              title={item.description}
              onClick={() => setOpenBadgeName(item.name)}
              className={`rounded-full border px-2 py-1 text-[10px] font-black transition hover:scale-[1.02] ${badgeTone(item.tone)}`}
            >
              {item.name}
            </button>
          ))}
        </div>
        {openBadge ? <div className="mt-2"><BadgeDetail item={openBadge} /></div> : null}
        <div className="mt-3 space-y-1.5 text-[11px] text-slate-300">
          <div className="rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5">Cost ผ่าน ≠ edge ผ่าน</div>
          <div className="rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5">นับ paper fills เท่านั้น ไม่ใช่กำไร</div>
          <div className="rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5">ต้องมีรอบปิดครบก่อนประเมิน expectancy</div>
          <div className="rounded-lg border border-rose-300/40 bg-rose-400/10 px-2 py-1.5 text-rose-200">M-0B ยังถูกบล็อก</div>
        </div>
      </Widget>

      <Widget icon="🧾" title="เหตุการณ์ Paper ล่าสุด">
        <div className="space-y-2">
          {(fills.length ? fills : vm.bottomLog.slice(0, 3)).map((entry, index) => (
            <button
              key={`${entry.ts}-${index}`}
              type="button"
              onClick={() => entry.agentId && onPick(entry.agentId)}
              className="block w-full rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-left text-xs text-slate-300 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
            >
              <span className="block text-[10px] text-slate-500">{entry.ts}</span>
              <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_BADGE[entry.type]}`}>{entry.type}</span>
              {entry.text}
            </button>
          ))}
        </div>
      </Widget>

      <Widget icon="🧭" title="บันทึกการตัดสินใจ">
        <div className="space-y-2">
          {(decisions.length ? decisions : [{ ts: "-", type: "DECISION" as const, text: "ยังไม่มีเหตุการณ์ตัดสินใจใน log ปลอดภัยล่าสุด" }]).map(
            (entry, index) => (
              <div key={`${entry.ts}-${index}`} className="rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-300">
                <span className="block text-[10px] text-slate-500">{entry.ts}</span>
                {entry.text}
              </div>
            ),
          )}
        </div>
      </Widget>

      <Widget icon="📈" title="ความคืบหน้าหลักฐาน">
        <MiniProgress label={`จำนวน fills paper: ${vm.paper.totalOrderFilled} (นับ fills เท่านั้น ไม่ใช่กำไร)`} status={vm.paper.totalOrderFilled > 0 ? "INFO" : "PENDING"} />
        <MiniProgress label={`รอบที่ปิดครบ: ${vm.paper.closedCycles} / ${vm.paper.closedCycles === 0 ? "ยังไม่มีข้อมูลรอบปิด" : "มีหลักฐาน"}`} status={closedCycleStatus} />
        <MiniProgress label="ขนาดตัวอย่าง" status={sampleStatus} />
        <MiniProgress label={`เกตต้นทุน: ${vm.paper.costGateStatus === "PASS" ? "ผ่าน" : vm.paper.costGateStatus} / ไม่ใช่ edge`} status={costStatus} />
        <MiniProgress label={`สถานะ edge: ${vm.paper.edgeStatus === "REAL_FILLS_ACCUMULATING" ? "ตัวอย่างยังไม่พอ" : vm.paper.edgeStatus === "DATA_GAP" ? "ยังไม่มีข้อมูลรอบปิด" : vm.paper.edgeStatus}`} status="DATA_GAP" />
        <MiniProgress label="เกต M-0B" status="BLOCKED" />
      </Widget>

      <Widget icon="🔔" title="การแจ้งเตือน">
        <div className="space-y-2">
          {(alerts.length ? alerts : [{ ts: "-", type: "ALERT" as const, text: "M-0B ยังถูกบล็อกจนกว่าหลักฐานจะผ่าน" }]).map(
            (entry, index) => (
              <div key={`${entry.ts}-${index}`} className="rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-xs text-slate-300">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_BADGE[entry.type]}`}>{entry.type}</span>
                {entry.text}
              </div>
            ),
          )}
        </div>
      </Widget>
    </div>
  );
}
