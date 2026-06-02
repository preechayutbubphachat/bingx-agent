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
    <div className="flex justify-between gap-3 border-b border-[#3a2c21]/10 py-1.5 text-xs">
      <span className="text-[#7a6550]">{label}</span>
      <span className="text-right font-bold text-[#2f241b]">{value}</span>
    </div>
  );
}

function statusTone(status: MissionStatus) {
  if (status === "DONE") return "bg-emerald-100 text-emerald-800";
  if (status === "IN_PROGRESS") return "bg-sky-100 text-sky-800";
  if (status === "DATA_GAP" || status === "WARNING") return "bg-amber-100 text-amber-800";
  if (status === "NOT_APPROVED") return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function skillTone(state: AgentSkill["state"]) {
  if (state === "online") return "bg-emerald-100 text-emerald-800";
  if (state === "watching") return "bg-sky-100 text-sky-800";
  if (state === "data_gap") return "bg-amber-100 text-amber-800";
  return "bg-stone-200 text-stone-700";
}

function badgeTone(tone: AgentBadge["tone"]) {
  if (tone === "safe") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-800";
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase text-[#8a735d]">{label}</div>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#5b4432]">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="mt-1 text-[11px] text-[#8a735d]">ยังไม่มีรายการที่ขาด</div>
      )}
    </div>
  );
}

function MissionDetailPanel({ mission }: { mission: Mission }) {
  return (
    <div className="mt-2 rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-3 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-black text-[#2f241b]">{mission.title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(mission.status)}`}>{MISSION_STATUS_TH[mission.status]}</span>
      </div>
      <div className="mt-1 text-[#6d5745]">{MISSION_CATEGORY_TH[mission.category]}</div>
      <div className="mt-3 grid gap-2">
        <DetailList label="หลักฐานที่มีแล้ว" items={mission.completeEvidence} />
        <DetailList label="หลักฐานที่ยังขาด" items={mission.missingEvidence} />
        <div><span className="font-black text-[#2f241b]">ทำไมถึงสำคัญ: </span>{mission.whyItMatters}</div>
        <div><span className="font-black text-[#2f241b]">ขั้นถัดไปที่ปลอดภัย: </span>{mission.nextSafeAction}</div>
        <div className="rounded-md bg-amber-50 px-2 py-1.5 font-bold text-amber-900">{mission.safetyNote}</div>
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
      <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-4 text-center text-xs text-[#8a735d] shadow-sm">
        <span className="text-sm font-black text-[#2f241b]">เลือกโต๊ะ Agent เพื่อดูสถานะ (อ่านอย่างเดียว)</span>
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
    <div className="flex h-full max-h-[calc(100vh-220px)] min-h-[360px] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#3a2c21]/10 bg-[#fffaf1] p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-[#2f241b]">{progression?.name ?? place?.label ?? agent.id}</h3>
          <p className="text-[11px] text-[#8a735d]">{progression?.role ?? place?.role ?? "โต๊ะ Agent"}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs text-[#8a735d] hover:bg-white">
          รีเซ็ต
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {progression ? (
          <div className="mb-3 rounded-lg border border-[#3a2c21]/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-[#2f241b] px-2 py-1 text-[10px] font-black text-[#f8ead3]">LV {progression.level}</span>
              <span className="text-[10px] font-black uppercase text-[#8a735d]">
                {PROGRESSION_STATUS_TH[progression.mood] ?? progression.mood} / {PROGRESSION_STATUS_TH[progression.status] ?? progression.status}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead6b9]">
              <div className="h-full rounded-full bg-[#7d5d3c]" style={{ width: `${progression.xpPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold text-[#6d5745]">
              <span>{progression.xp} XP</span>
              <span>{progression.xpToNextLevel} XP ถึงเลเวลถัดไป</span>
            </div>
            <details className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
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
          <div className="mb-3 rounded-lg border border-[#3a2c21]/10 bg-white p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-[#8a735d]">ภารกิจปัจจุบัน</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(activeMission.status)}`}>{MISSION_STATUS_TH[activeMission.status]}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMissionId(activeMission.id)}
              className="block w-full rounded-md text-left hover:bg-[#fff4df]"
            >
              <div className="text-xs font-black text-[#2f241b]">{activeMission.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[#6d5745]">{activeMission.detail}</div>
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
              <div className="mb-1 text-[10px] font-black uppercase text-[#8a735d]">ทักษะ</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
                {progression.skills.map((skill) => (
                  <div key={skill.name} className="min-w-0 rounded-md bg-white px-2 py-1.5 text-[11px]">
                    <div className="truncate font-bold text-[#2f241b]">{skill.name}</div>
                    <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${skillTone(skill.state)}`}>{SKILL_STATE_TH[skill.state]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 text-[10px] font-black uppercase text-[#8a735d]">เหรียญ / รางวัล</div>
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

            <div className="mt-3 rounded-lg border border-[#3a2c21]/10 bg-white p-3 text-[11px] text-[#6d5745]">
              <div className="font-black uppercase text-[#2f241b]">คุณภาพหลักฐาน</div>
              <div className="mt-1">คุณภาพ={progression.evidenceQuality} | ความปลอดภัย={progression.safetyState} | อัปเดต={progression.lastUpdated}</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {progression.blockedReasons.slice(0, 4).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
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
          className="mt-3 w-full rounded-lg bg-[#2f241b] px-3 py-2 text-xs font-bold text-[#f8ead3] hover:bg-[#473527]"
        >
          ขั้นสูง / ดีบัก ไปที่ /public
        </button>
      </div>
    </div>
  );
}
