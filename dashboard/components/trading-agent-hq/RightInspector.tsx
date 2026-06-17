"use client";

import { useState } from "react";
import type { AgentVM, PaperVM } from "@/lib/trading-agent-hq/viewModel";
import type { AgentProgression, AgentBadge, AgentSkill, Mission, MissionStatus } from "@/lib/trading-agent-hq/progression";
import { MISSION_CATEGORY_TH } from "@/lib/trading-agent-hq/progression";
import { AGENT_PLACEMENTS } from "@/lib/trading-agent-hq/sceneConfig";

const STATUS_TH: Record<string, string> = {
  running: "กำลังทำงาน", scanning: "กำลังสแกน", guarding: "เฝ้าระวัง", logging: "กำลังบันทึก",
  alert: "เตือนภัย", paused: "หยุดชั่วคราว", error: "ผิดพลาด", unknown: "ไม่ทราบ",
};

const MISSION_STATUS_TH: Record<MissionStatus, string> = {
  DONE: "เสร็จแล้ว",
  IN_PROGRESS: "กำลังทำ",
  DATA_GAP: "ยังไม่มีข้อมูลรอบปิด",
  WARNING: "ต้องระวัง",
  NOT_APPROVED: "ยังไม่อนุมัติ",
  BLOCKED: "ถูกบล็อก",
  FAIL: "ไม่ผ่าน",
};

const SKILL_STATE_TH: Record<AgentSkill["state"], string> = {
  online: "ออนไลน์",
  watching: "เฝ้าดู",
  data_gap: "ข้อมูลยังไม่พอ",
  locked: "ล็อกอยู่",
};

const PROGRESSION_STATUS_TH: Record<string, string> = {
  active: "กำลังทำงาน",
  watching: "เฝ้าดู",
  data_gap: "ข้อมูลยังไม่พอ",
  blocked: "ถูกบล็อก",
  unknown: "ไม่ทราบ",
  calm: "นิ่ง",
  focused: "โฟกัส",
  warning: "ต้องระวัง",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-cyan-400/10 py-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold text-slate-100">{value}</span>
    </div>
  );
}

function statusTone(status: MissionStatus) {
  if (status === "DONE") return "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200";
  if (status === "IN_PROGRESS") return "border border-cyan-300/40 bg-cyan-400/10 text-cyan-200";
  if (status === "DATA_GAP" || status === "WARNING") return "border border-amber-300/40 bg-amber-400/10 text-amber-200";
  if (status === "NOT_APPROVED") return "border border-orange-300/40 bg-orange-400/10 text-orange-200";
  return "border border-rose-300/40 bg-rose-400/10 text-rose-200";
}

function skillTone(state: AgentSkill["state"]) {
  if (state === "online") return "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200";
  if (state === "watching") return "border border-cyan-300/40 bg-cyan-400/10 text-cyan-200";
  if (state === "data_gap") return "border border-amber-300/40 bg-amber-400/10 text-amber-200";
  return "border border-slate-600 bg-slate-800 text-slate-300";
}

function badgeTone(tone: AgentBadge["tone"]) {
  if (tone === "safe") return "border-emerald-300/40 bg-emerald-400/10 text-emerald-200";
  if (tone === "info") return "border-cyan-300/40 bg-cyan-400/10 text-cyan-200";
  if (tone === "warning") return "border-amber-300/40 bg-amber-400/10 text-amber-200";
  return "border-rose-300/40 bg-rose-400/10 text-rose-200";
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase text-slate-500">{label}</div>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="mt-1 text-[11px] text-slate-500">ยังไม่มีรายการที่ขาด</div>
      )}
    </div>
  );
}

function MissionDetailPanel({ mission }: { mission: Mission }) {
  return (
    <div className="mt-2 rounded-lg border border-cyan-400/20 bg-slate-900/80 p-3 text-[11px] text-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-black text-slate-100">{mission.title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(mission.status)}`}>{MISSION_STATUS_TH[mission.status]}</span>
      </div>
      <div className="mt-1 text-slate-500">{MISSION_CATEGORY_TH[mission.category]}</div>
      <div className="mt-3 grid gap-2">
        <DetailList label="หลักฐานที่มีแล้ว" items={mission.completeEvidence} />
        <DetailList label="หลักฐานที่ยังขาด" items={mission.missingEvidence} />
        <div><span className="font-black text-slate-100">ทำไมถึงสำคัญ: </span>{mission.whyItMatters}</div>
        <div><span className="font-black text-slate-100">ขั้นถัดไปที่ปลอดภัย: </span>{mission.nextSafeAction}</div>
        <div className="rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 font-bold text-amber-200">{mission.safetyNote}</div>
      </div>
    </div>
  );
}

function BadgeDetailPanel({ badge }: { badge: AgentBadge }) {
  return (
    <div className={`mt-2 rounded-lg border p-3 text-[11px] ${badgeTone(badge.tone)}`}>
      <div className="font-black">{badge.name}</div>
      <div className="mt-1">{badge.description}</div>
      <div className="mt-2"><span className="font-black">ที่มาหลักฐาน: </span>{badge.evidenceSource}</div>
      <div className="mt-1"><span className="font-black">ไม่ได้หมายความว่า: </span>{badge.doesNotMean}</div>
    </div>
  );
}

export default function RightInspector({
  agent,
  progression,
  paper,
  onClose,
  onDebug,
}: {
  agent: AgentVM | null;
  progression: AgentProgression | null;
  paper: PaperVM;
  onClose: () => void;
  onDebug: () => void;
}) {
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [selectedBadgeName, setSelectedBadgeName] = useState<string | null>(null);
  const closedCycleLabel = paper.closedCycles === 0 ? "ยังไม่มีข้อมูลรอบปิด" : "มีหลักฐานรอบปิด";

  if (!agent) {
    return (
      <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-4 text-center text-xs text-slate-500 shadow-[0_0_26px_rgba(34,211,238,0.06)]">
        <span className="text-sm font-black text-cyan-100">เลือกโต๊ะ Agent เพื่อดูสถานะ (อ่านอย่างเดียว)</span>
        <span className="mt-2 max-w-[280px] leading-relaxed">
          หน้านี้ไม่มีปุ่มเปิดเงินจริง/ส่งคำสั่ง/อนุมัติ ใช้ปุ่ม Agent หรือโต๊ะในคาเฟ่เพื่อดูสถานะเท่านั้น
        </span>
      </div>
    );
  }

  const place = AGENT_PLACEMENTS.find((p) => p.id === agent.id);
  const activeMission = progression?.missions.find((item) => item.status !== "DONE") ?? progression?.missions[0];
  const inspectedMission = progression?.missions.find((item) => item.id === selectedMissionId) ?? activeMission;
  const inspectedBadge = progression?.badges.find((item) => item.name === selectedBadgeName) ?? progression?.badges[0];

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] min-h-[360px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-4 shadow-[0_0_30px_rgba(34,211,238,0.07)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-cyan-100">{progression?.name ?? place?.label ?? agent.id}</h3>
          <p className="text-[11px] text-slate-500">{progression?.role ?? place?.role ?? "โต๊ะ Agent"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-cyan-400/20 px-2 py-0.5 text-xs text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-100">
          รีเซ็ต
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {progression ? (
          <div className="mb-3 rounded-lg border border-cyan-400/20 bg-slate-900/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-1 text-[10px] font-black text-cyan-100">LV {progression.level}</span>
              <span className="text-[10px] font-black uppercase text-slate-500">
                {PROGRESSION_STATUS_TH[progression.mood] ?? progression.mood} / {PROGRESSION_STATUS_TH[progression.status] ?? progression.status}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${progression.xpPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500">
              <span>{progression.xp} XP</span>
              <span>{progression.xpToNextLevel} XP ถึงเลเวลถัดไป</span>
            </div>
            <details className="mt-2 rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-100">
              <summary className="cursor-pointer font-black">XP คืออะไร</summary>
              <div className="mt-1 space-y-0.5 font-bold">
                <div>XP = ระดับความสมบูรณ์ของหลักฐานเท่านั้น</div>
                <div>XP ไม่ควบคุมการเทรด</div>
                <div>เลเวลไม่ปลดล็อกเงินจริง</div>
                <div>ต้องมีรอบปิดครบก่อนจึงประเมิน expectancy</div>
                <div>Cost ผ่าน ≠ edge ผ่าน</div>
              </div>
            </details>
          </div>
        ) : null}

        {activeMission ? (
          <div className="mb-3 rounded-lg border border-cyan-400/20 bg-slate-900/80 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-slate-500">ภารกิจปัจจุบัน</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(activeMission.status)}`}>{MISSION_STATUS_TH[activeMission.status]}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMissionId(activeMission.id)}
              className="block w-full rounded-md text-left hover:bg-cyan-400/10"
            >
              <div className="text-xs font-black text-slate-100">{activeMission.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{activeMission.detail}</div>
            </button>
            {inspectedMission ? <MissionDetailPanel mission={inspectedMission} /> : null}
          </div>
        ) : null}

        <Row label="สถานะ" value={STATUS_TH[agent.status] ?? agent.status} />
        <Row label="งานปัจจุบัน" value={agent.currentTask} />
        <Row label="การกระทำล่าสุด" value={agent.lastAction} />
        <Row label="ตัวชี้วัด" value={agent.metric ?? "-"} />
        <Row label="ความมั่นใจ / ความเสี่ยง" value={agent.confidence ?? "-"} />
        <Row label="แอนิเมชัน" value={agent.animation} />

        {progression ? (
          <>
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-black uppercase text-slate-500">ทักษะ</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                {progression.skills.map((skill) => (
                  <div key={skill.name} className="min-w-0 rounded-md border border-cyan-400/20 bg-slate-900/80 px-2 py-1.5 text-[11px]">
                    <div className="truncate font-bold text-slate-100">{skill.name}</div>
                    <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${skillTone(skill.state)}`}>{SKILL_STATE_TH[skill.state]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-[10px] font-black uppercase text-slate-500">เหรียญ / รางวัล</div>
              <div className="flex flex-wrap gap-1.5">
                {progression.badges.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    title={item.description}
                    onClick={() => setSelectedBadgeName(item.name)}
                    className={`rounded-full border px-2 py-1 text-[10px] font-black transition hover:scale-[1.02] ${badgeTone(item.tone)}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              {inspectedBadge ? <BadgeDetailPanel badge={inspectedBadge} /> : null}
            </div>

            <div className="mt-3 rounded-lg border border-cyan-400/20 bg-slate-900/80 p-3 text-[11px] text-slate-300">
              <div className="font-black uppercase text-cyan-100">คุณภาพหลักฐาน</div>
              <div className="mt-1">คุณภาพ={progression.evidenceQuality} | ความปลอดภัย={progression.safetyState} | อัปเดต={progression.lastUpdated}</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {progression.blockedReasons.slice(0, 4).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <div className="mt-3 rounded-lg border border-amber-300/40 bg-amber-400/10 p-3 text-[11px] text-amber-100">
          <div className="font-black uppercase">ความซื่อตรงของหลักฐาน Paper</div>
          <div className="mt-1">
            จำนวน fills paper={paper.totalOrderFilled} | รอบปิดครบ={paper.closedCycles} / {closedCycleLabel} | สถานะ edge={paper.edgeStatus === "DATA_GAP" ? "ยังไม่มีข้อมูลรอบปิด" : paper.edgeStatus}
          </div>
          <div className="mt-1">เกตต้นทุน: {paper.costGateStatus === "PASS" ? "ผ่าน" : paper.costGateStatus} | Cost ผ่าน ≠ edge ผ่าน | นับ fills เท่านั้น ไม่ใช่กำไร</div>
          {paper.closedCycles === 0 ? <div className="mt-1 font-bold">ยังไม่มีข้อมูลรอบปิด: ยังขาดหลักฐานรอบ BUY→SELL ที่ปิดครบ</div> : null}
          <div className="mt-1 font-bold">M-0B ยังถูกบล็อก</div>
        </div>

        <button
          type="button"
          onClick={onDebug}
          className="mt-3 w-full rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/20"
        >
          ขั้นสูง / ดีบัก ไปที่ /public
        </button>
      </div>
    </div>
  );
}
