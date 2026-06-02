import type { AgentId, TradingAgentHQViewModel } from "./viewModel";

export type MissionCategory =
  | "Daily Safety"
  | "Paper Evidence"
  | "Data Quality"
  | "Visual QA"
  | "Operator Review";

/** Thai display label for mission category (UI only; type stays stable) */
export const MISSION_CATEGORY_TH: Record<MissionCategory, string> = {
  "Daily Safety": "ความปลอดภัยประจำวัน",
  "Paper Evidence": "หลักฐาน Paper",
  "Data Quality": "คุณภาพข้อมูล",
  "Visual QA": "ตรวจสอบภาพ",
  "Operator Review": "การรีวิวโดย Operator",
};

export type MissionStatus =
  | "DONE"
  | "IN_PROGRESS"
  | "DATA_GAP"
  | "BLOCKED"
  | "NOT_APPROVED"
  | "WARNING"
  | "FAIL";

export type ProgressionMood = "calm" | "focused" | "blocked" | "warning" | "unknown";
export type ProgressionStatus = "active" | "watching" | "data_gap" | "blocked" | "unknown";
export type EvidenceQuality = "strong" | "partial" | "data_gap" | "stale" | "unknown";
export type SafetyState = "safe" | "warning" | "blocked";

export interface Mission {
  id: string;
  category: MissionCategory;
  title: string;
  detail: string;
  status: MissionStatus;
  progressPct: number;
  completeEvidence: string[];
  missingEvidence: string[];
  whyItMatters: string;
  nextSafeAction: string;
  safetyNote: string;
}

export interface AgentSkill {
  name: string;
  state: "online" | "watching" | "locked" | "data_gap";
}

export interface AgentBadge {
  name: string;
  tone: "safe" | "info" | "warning" | "blocked";
  description: string;
  evidenceSource: string;
  doesNotMean: string;
}

export interface AgentProgression {
  agentId: AgentId;
  name: string;
  role: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  xpPct: number;
  missions: Mission[];
  skills: AgentSkill[];
  badges: AgentBadge[];
  mood: ProgressionMood;
  status: ProgressionStatus;
  evidenceQuality: EvidenceQuality;
  safetyState: SafetyState;
  blockedReasons: string[];
  lastUpdated: string;
}

const AGENT_COPY: Record<AgentId, { name: string; role: string }> = {
  grid_bot: { name: "Grid Bot", role: "หลักฐาน Grid / จำลองคำสั่ง" },
  trend_bot: { name: "Trend Bot", role: "โมเมนตัม / สอดส่องโอกาส" },
  risk_manager: { name: "Risk Manager", role: "ผู้คุมประตูความปลอดภัย" },
  news_analyst: { name: "News Analyst", role: "ความเสี่ยงจากข่าว / sentiment" },
  market_regime: { name: "Market Regime Analyst", role: "บริบท regime / ความผันผวน" },
  memory_brain: { name: "Memory / Second Brain", role: "บันทึก / หลักฐาน / บทเรียน" },
};

const ORDER: AgentId[] = ["grid_bot", "trend_bot", "risk_manager", "news_analyst", "market_regime", "memory_brain"];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function levelFromXp(totalXp: number) {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const currentLevelFloor = (level - 1) * (level - 1) * 100;
  const nextLevelFloor = level * level * 100;
  const xpPct = clamp(((xp - currentLevelFloor) / Math.max(1, nextLevelFloor - currentLevelFloor)) * 100);
  return {
    level,
    xp,
    xpToNextLevel: Math.max(0, nextLevelFloor - xp),
    xpPct,
  };
}

function statusProgress(status: MissionStatus): number {
  if (status === "DONE") return 100;
  if (status === "IN_PROGRESS") return 55;
  if (status === "WARNING") return 45;
  if (status === "DATA_GAP") return 25;
  if (status === "NOT_APPROVED") return 15;
  if (status === "BLOCKED") return 10;
  return 0;
}

function mission(
  id: string,
  category: MissionCategory,
  title: string,
  detail: string,
  status: MissionStatus,
  progressPct = statusProgress(status),
  detailFields: Partial<Pick<Mission, "completeEvidence" | "missingEvidence" | "whyItMatters" | "nextSafeAction" | "safetyNote">> = {},
): Mission {
  return {
    id,
    category,
    title,
    detail,
    status,
    progressPct,
    completeEvidence: detailFields.completeEvidence ?? (status === "DONE" ? [detail] : []),
    missingEvidence: detailFields.missingEvidence ?? (status === "DONE" ? [] : ["ต้องการหลักฐานที่ปลอดภัยเพิ่ม"]),
    whyItMatters: detailFields.whyItMatters ?? "ภารกิจนี้แสดงระดับความสมบูรณ์ของหลักฐาน โดยไม่เปลี่ยนพฤติกรรมการเทรด",
    nextSafeAction: detailFields.nextSafeAction ?? "สังเกตหลักฐานแบบอ่านอย่างเดียวต่อไป อย่าฝืนให้เกิดผลลัพธ์",
    safetyNote: detailFields.safetyNote ?? "ความคืบหน้าภารกิจเป็นภาพเท่านั้น ไม่อนุมัติความเสี่ยง ไม่ส่งคำสั่ง และไม่ปลดล็อกเงินจริง",
  };
}

function badge(
  name: string,
  tone: AgentBadge["tone"],
  description: string,
  detailFields: Partial<Pick<AgentBadge, "evidenceSource" | "doesNotMean">> = {},
): AgentBadge {
  return {
    name,
    tone,
    description,
    evidenceSource: detailFields.evidenceSource ?? "หลักฐานจาก ViewModel ฝั่ง frontend ที่ปลอดภัยเท่านั้น",
    doesNotMean: detailFields.doesNotMean ?? "ไม่ได้หมายถึงกำไร การอนุมัติ ความพร้อม live หรือสิทธิ์ส่งคำสั่ง",
  };
}

function commonSafetyMissions(vm: TradingAgentHQViewModel): Mission[] {
  const safeFlags =
    !vm.safety.liveTradingEnabled &&
    !vm.safety.orderPlacementEnabled &&
    !vm.safety.productionTradingReady &&
    vm.safety.exchangeManualApproval === "not_approved";

  return [
    mission(
      "safety-lock",
      "Daily Safety",
      "คงล็อกความปลอดภัยให้ทำงาน",
      "เงินจริงปิด, คำสั่งจริงปิด, ยังไม่พร้อม production, ยังไม่อนุมัติ",
      safeFlags ? "DONE" : "FAIL",
      undefined,
      {
        completeEvidence: safeFlags ? ["liveTradingEnabled=false", "orderPlacementEnabled=false", "productionReady=false", "approval=not_approved"] : [],
        missingEvidence: safeFlags ? [] : ["มี safety flag บางตัวยังไม่ถูกล็อก"],
        whyItMatters: "ล็อกความปลอดภัยทำให้เลเยอร์แสดงผลซื่อตรงระหว่างที่หลักฐานยังไม่ครบ",
        nextSafeAction: "คง flag เป็นปิดไว้ และรีวิวหลักฐานต่อไป",
        safetyNote: "ล็อกความปลอดภัยไม่ได้แปลว่าพร้อม live — แปลว่าตัวควบคุมยังถูกปิดอยู่",
      },
    ),
    mission(
      "m0b-block",
      "Operator Review",
      "คง M-0B ให้ถูกบล็อกจนกว่าหลักฐานจะผ่าน",
      "READY_FOR_REVIEW ไม่ใช่การอนุมัติ; การอนุมัติไม่ใช่การเปิดเงินจริง",
      vm.safety.phase.includes("BLOCKED") ? "BLOCKED" : "WARNING",
      undefined,
      {
        completeEvidence: vm.safety.phase.includes("BLOCKED") ? ["เห็น phase=M-0B_BLOCKED"] : [],
        missingEvidence: ["ตัวอย่างรอบปิด", "การรีวิวโดย operator", "การอนุมัติด้วยมือหลังผ่านทุก gate"],
        whyItMatters: "ป้องกันไม่ให้ milestone บน UI ถูกเข้าใจผิดว่าเป็นการอนุญาตให้เทรด",
        nextSafeAction: "เก็บหลักฐาน paper และผลการรีวิวของ operator ต่อไป",
        safetyNote: "READY_FOR_REVIEW ไม่ใช่การอนุมัติ การอนุมัติไม่ใช่การเปิดเงินจริง",
      },
    ),
  ];
}

function commonBlockedReasons(vm: TradingAgentHQViewModel): string[] {
  const reasons: string[] = [];
  if (vm.paper.closedCycles === 0) reasons.push("closedCycles=0: ยังไม่มีข้อมูลรอบปิด ไม่มี edge XP");
  if (vm.paper.sampleStatus !== "SUFFICIENT") reasons.push("ตัวอย่างยังไม่พอสำหรับประเมิน expectancy");
  if (vm.safety.exchangeManualApproval !== "approved") reasons.push("EXCHANGE_MANUAL_APPROVAL ยังไม่อนุมัติ");
  if (vm.safety.phase.includes("BLOCKED")) reasons.push("Phase M-0B ยังถูกบล็อก");
  if (vm.meta.isStale) reasons.push("แหล่งข้อมูล/ความสดเป็นข้อมูลเก่า");
  return reasons;
}

function dataQualityMissions(vm: TradingAgentHQViewModel): Mission[] {
  const hasPublicSafeSource = vm.meta.source === "public-safe-api";
  const hasFills = vm.paper.totalOrderFilled > 0;
  return [
    mission(
      "source-freshness",
      "Data Quality",
      "ใช้แหล่งข้อมูล public-safe API",
      "Progression อ่านจาก ViewModel ฝั่ง frontend เท่านั้น; ไฟล์ runtime จริงยังเป็น source of truth นอก UI",
      hasPublicSafeSource && !vm.meta.isStale ? "DONE" : hasPublicSafeSource ? "WARNING" : "DATA_GAP",
      hasPublicSafeSource ? (vm.meta.isStale ? 60 : 100) : 20,
      {
        completeEvidence: hasPublicSafeSource ? [`source=${vm.meta.source}`, `lastUpdate=${vm.meta.lastUpdate}`] : [],
        missingEvidence: vm.meta.isStale ? ["timestamp แหล่ง public-safe ที่สดใหม่"] : [],
        whyItMatters: "หลักฐานแหล่ง public-safe ที่สด ทำให้ UI อ่านง่ายโดยไม่กลายเป็น source of truth",
        nextSafeAction: "รีเฟรชแดชบอร์ด หรือตรวจ endpoint ถ้าแหล่งข้อมูลยังเก่า",
        safetyNote: "public/cache JSON เป็น display เท่านั้น ไม่ใช่ของจริง",
      },
    ),
    mission(
      "fill-evidence",
      "Paper Evidence",
      "เก็บ paper fills พร้อม averageFillPrice",
      "XP จาก fill ไม่ใช่ XP กำไร และไม่ได้แปลว่ามี edge",
      hasFills ? "DONE" : "DATA_GAP",
      hasFills ? 100 : 20,
      {
        completeEvidence: hasFills ? [`paper fills=${vm.paper.totalOrderFilled}`] : [],
        missingEvidence: hasFills ? [] : ["paper fills ที่มี averageFillPrice"],
        whyItMatters: "คุณภาพ paper fill แสดงว่าเส้นทางจำลองกำลังผลิตหลักฐาน",
        nextSafeAction: "ปล่อย paper loop ทำงานตามธรรมชาติต่อไป",
        safetyNote: "paper fills ไม่ใช่กำไร และไม่ใช่ fill เงินจริง",
      },
    ),
    mission(
      "closed-cycle",
      "Paper Evidence",
      "เก็บรอบปิดครบรอบแรก",
      "ต้องมีรอบปิดครบก่อนจึงประเมิน expectancy หรือ edge ได้",
      vm.paper.closedCycles > 0 ? "DONE" : "DATA_GAP",
      vm.paper.closedCycles > 0 ? 100 : 10,
      {
        completeEvidence: vm.paper.closedCycles > 0 ? [`closedCycles=${vm.paper.closedCycles}`] : [],
        missingEvidence: vm.paper.closedCycles > 0 ? [] : ["รอบปิดครบ BUY → SELL"],
        whyItMatters: "รอบปิดครบคือหลักฐานขั้นต่ำสำหรับวิเคราะห์ expectancy",
        nextSafeAction: "ปล่อย paper loop ทำงานต่อ; รอให้ตลาดเคลื่อนตามธรรมชาติ",
        safetyNote: "ห้าม force-fill หรือแก้ runtime JSON เพื่อสร้างรอบปิดปลอม",
      },
    ),
  ];
}

function safetyXp(vm: TradingAgentHQViewModel): number {
  if (vm.safety.liveTradingEnabled || vm.safety.orderPlacementEnabled || vm.safety.productionTradingReady) return 0;
  return vm.safety.exchangeManualApproval === "not_approved" ? 120 : 70;
}

function evidenceQuality(vm: TradingAgentHQViewModel): EvidenceQuality {
  if (vm.meta.isStale) return "stale";
  if (vm.paper.closedCycles === 0) return vm.paper.totalOrderFilled > 0 ? "partial" : "data_gap";
  if (vm.paper.sampleStatus === "SUFFICIENT") return "strong";
  return "partial";
}

function moodFor(vm: TradingAgentHQViewModel, agentId: AgentId): ProgressionMood {
  if (vm.meta.isStale) return "warning";
  if (agentId === "risk_manager") return "calm";
  if (vm.paper.closedCycles === 0) return "blocked";
  if (vm.paper.totalOrderFilled > 0) return "focused";
  return "unknown";
}

function makeProgression(
  vm: TradingAgentHQViewModel,
  agentId: AgentId,
  baseXp: number,
  missions: Mission[],
  skills: AgentSkill[],
  badges: AgentBadge[],
): AgentProgression {
  const blockedReasons = commonBlockedReasons(vm);
  const safetyState: SafetyState =
    vm.safety.liveTradingEnabled || vm.safety.orderPlacementEnabled || vm.safety.productionTradingReady ? "warning"
    : vm.safety.phase.includes("BLOCKED") ? "blocked"
    : "safe";
  const levels = levelFromXp(baseXp);
  const quality = evidenceQuality(vm);

  return {
    agentId,
    ...AGENT_COPY[agentId],
    ...levels,
    missions,
    skills,
    badges,
    mood: moodFor(vm, agentId),
    status: vm.safety.phase.includes("BLOCKED")
      ? vm.paper.closedCycles === 0 ? "data_gap" : "blocked"
      : vm.paper.totalOrderFilled > 0 ? "active" : "watching",
    evidenceQuality: quality,
    safetyState,
    blockedReasons,
    lastUpdated: vm.meta.lastUpdate,
  };
}

export function buildAgentProgressions(vm: TradingAgentHQViewModel): Record<AgentId, AgentProgression> {
  const safeXp = safetyXp(vm);
  const costXp = vm.paper.costGateStatus === "PASS" ? 80 : vm.paper.costGateStatus === "UNKNOWN" ? 0 : 20;
  const fillXp = vm.paper.totalOrderFilled > 0 ? 70 : 0;
  const closedCycleXp = vm.paper.closedCycles > 0 ? Math.min(220, vm.paper.closedCycles * 24) : 0;
  const sourceXp = vm.meta.source === "public-safe-api" && !vm.meta.isStale ? 50 : 10;
  const safetyMissions = commonSafetyMissions(vm);
  const dataMissions = dataQualityMissions(vm);
  const commonBadges = [
    ...(safeXp > 0 ? [badge("ล็อกความปลอดภัยทำงาน", "safe", "flag เงินจริง/คำสั่ง/production ยังปิดอยู่", {
      evidenceSource: "safety flags จาก ViewModel ของ TradingAgentHQ",
      doesNotMean: "ไม่ได้แปลว่าพร้อม live หรือ operator อนุมัติแล้ว",
    })] : []),
    ...(vm.paper.closedCycles === 0 ? [badge("เฝ้าระวังช่องว่างข้อมูล", "warning", "ยังไม่มีหลักฐานรอบปิด", {
      evidenceSource: "closedCycles=0 และสถานะ sample จากหลักฐาน paper ที่ปลอดภัย",
      doesNotMean: "ไม่ได้แปลว่า Fail — แปลว่ามองเห็นว่ายังขาดหลักฐาน",
    })] : []),
  ];

  const gridMissions = [
    mission(
      "cost-discipline",
      "Paper Evidence",
      "คงวินัย cost gate",
      "Cost ผ่าน = วินัยต้นทุนเท่านั้น; Cost ผ่าน ไม่ได้แปลว่า edge ผ่าน",
      vm.paper.costGateStatus === "PASS" ? "DONE" : vm.paper.costGateStatus === "UNKNOWN" ? "DATA_GAP" : "WARNING",
      undefined,
      {
        completeEvidence: vm.paper.costGateStatus === "PASS" ? ["costGate.status=PASS"] : [],
        missingEvidence: vm.paper.closedCycles === 0 ? ["รอบปิดครบก่อนรีวิว edge"] : [],
        whyItMatters: "วินัยต้นทุนตรวจว่าต้นทุนที่ประเมินถูกครอบคลุมด้วยสมมติฐาน spacing หรือไม่",
        nextSafeAction: "สังเกตหลักฐาน paper ต่อไป; อย่าถือว่า cost ผ่าน = edge ผ่าน",
        safetyNote: "Cost ผ่าน ไม่ใช่กำไร, expectancy, การอนุมัติ หรือความพร้อม live",
      },
    ),
    ...dataMissions,
  ];

  const progressions: Record<AgentId, AgentProgression> = {
    grid_bot: makeProgression(
      vm,
      "grid_bot",
      100 + costXp + fillXp + closedCycleXp + sourceXp,
      gridMissions,
      [
        { name: "รู้ทัน Grid Spacing", state: vm.paper.costGateStatus === "PASS" ? "online" : "watching" },
        { name: "ติดตามคุณภาพ Fill", state: vm.paper.totalOrderFilled > 0 ? "online" : "data_gap" },
        { name: "จับคู่รอบปิด", state: vm.paper.closedCycles > 0 ? "online" : "data_gap" },
        { name: "วินัย Cost Gate", state: vm.paper.costGateStatus === "PASS" ? "online" : "watching" },
      ],
      [
        ...(vm.paper.costGateStatus === "PASS" ? [badge("ผู้คุม Cost Gate", "safe", "วินัยต้นทุนผ่าน; นี่ไม่ใช่หลักฐาน edge", {
          evidenceSource: "costGate.status=PASS จากหลักฐาน paper performance",
          doesNotMean: "ไม่ได้แปลว่า edge, กำไร, การอนุมัติ หรือความพร้อม production",
        })] : []),
        ...(vm.paper.totalOrderFilled > 0 ? [badge("เริ่มมีหลักฐาน Fill", "info", "paper fills กำลังสะสมพร้อมหลักฐาน fill", {
          evidenceSource: `totalOrderFilled=${vm.paper.totalOrderFilled} จากหลักฐาน paper`,
          doesNotMean: "ไม่ได้แปลว่ากลยุทธ์กำไรหรือหลักฐานเทรดเงินจริง",
        })] : []),
        ...commonBadges,
      ],
    ),
    trend_bot: makeProgression(
      vm,
      "trend_bot",
      80 + sourceXp + (vm.paper.closedCycles > 0 ? 30 : 0),
      [
        mission("trend-patience", "Data Quality", "รอบริบทโอกาสที่ผ่านการยืนยัน", "บริบทเทรนด์เป็นแบบอ่านอย่างเดียว และสั่ง order จากที่นี่ไม่ได้", "IN_PROGRESS"),
        mission("no-false-edge", "Visual QA", "เลี่ยงการอ้าง edge เท็จ", "ต้องผ่าน gate รอบปิดครบและขนาดตัวอย่างก่อนจะอ้าง expectancy", vm.paper.closedCycles === 0 ? "DATA_GAP" : "IN_PROGRESS"),
        ...safetyMissions,
      ],
      [
        { name: "สแกนโมเมนตัม", state: "watching" },
        { name: "ยืนยัน Regime", state: "watching" },
        { name: "อดทนรอสัญญาณ", state: "online" },
        { name: "รู้ทัน False Breakout", state: "watching" },
      ],
      [badge("อดทนรอสัญญาณ", "info", "สถานะโมเมนตัมบนภาพไม่ปลดล็อกการเทรดใด ๆ", {
        evidenceSource: "สถานะภารกิจแบบอ่านอย่างเดียวใน TradingAgentHQ",
        doesNotMean: "ไม่ได้แปลว่ามีการ execute สัญญาณซื้อ/ขาย",
      }), ...commonBadges],
    ),
    risk_manager: makeProgression(
      vm,
      "risk_manager",
      160 + safeXp + sourceXp,
      [
        ...safetyMissions,
        mission("operator-approval", "Operator Review", "คงการอนุมัติเป็นแบบ manual", "การอนุมัติจะเป็น not_approved จนกว่าจะผ่านทุก gate และ operator อนุมัติ", "NOT_APPROVED"),
        mission("visual-safety-copy", "Visual QA", "คงข้อความความปลอดภัยให้เห็นชัด", "XP ไม่ควบคุมการเทรด; M-0B ยังถูกบล็อก", "DONE"),
      ],
      [
        { name: "รู้ทัน Kill Switch", state: "online" },
        { name: "วินัยการอนุมัติ", state: "online" },
        { name: "ป้องกัน Drawdown", state: "watching" },
        { name: "ความสมบูรณ์ของ Safety Gate", state: "online" },
      ],
      [
        badge("ผู้พิทักษ์ความปลอดภัย", "safe", "safety flags ยังถูกล็อกไว้", {
          evidenceSource: "เงินจริงปิด / คำสั่งปิด / ยังไม่อนุมัติ ใน ViewModel ที่ปลอดภัย",
          doesNotMean: "ไม่ได้แปลว่าระบบได้รับอนุมัติให้เทรดเงินจริง",
        }),
        badge("ไม่อ้างความพร้อมเท็จ", "safe", "UI ไม่อ้างความพร้อม live หรือ production", {
          evidenceSource: "ข้อความความปลอดภัยของ TradingAgentHQ และสถานะ phase ที่ถูกบล็อก",
          doesNotMean: "ไม่ได้แปลว่าผ่านทุก gate แล้ว",
        }),
        ...commonBadges,
      ],
    ),
    news_analyst: makeProgression(
      vm,
      "news_analyst",
      70 + sourceXp,
      [
        mission("event-risk", "Data Quality", "ติดตามบริบทความเสี่ยงจากเหตุการณ์", "บริบทข่าว/เหตุการณ์จะแสดงเฉพาะเมื่อหลักฐาน public-safe เปิดเผยเท่านั้น", "IN_PROGRESS"),
        mission("no-trade-reason", "Data Quality", "คงเหตุผลที่ไม่เทรด", "บริบทที่ขาดยังคงเป็นข้อมูลยังไม่พอ ไม่ใช่ PASS ปลอม", "DATA_GAP"),
        ...safetyMissions,
      ],
      [
        { name: "ตรวจจับความเสี่ยงเหตุการณ์", state: "watching" },
        { name: "ความครอบคลุมบริบทข่าว", state: "data_gap" },
        { name: "บันทึกเหตุผลที่ไม่เทรด", state: "watching" },
        { name: "รู้ทัน Sentiment", state: "watching" },
      ],
      [badge("ไม่อ้างข่าวเท็จ", "info", "บริบทข่าวที่ขาดไม่ถูกมองว่าเป็น PASS ปกติ", {
        evidenceSource: "ภารกิจข่าว/เหตุการณ์ยังเป็นข้อมูลยังไม่พอเมื่อขาดหลักฐานที่ปลอดภัย",
        doesNotMean: "ไม่ได้แปลว่าความเสี่ยงจากข่าวหมดไป",
      }), ...commonBadges],
    ),
    market_regime: makeProgression(
      vm,
      "market_regime",
      90 + sourceXp + (vm.paper.costGateStatus === "PASS" ? 20 : 0),
      [
        mission("regime-context", "Data Quality", "อ่านบริบท regime อย่างปลอดภัย", "การแสดง regime เป็นแบบอ่านอย่างเดียว และไม่เคยส่ง order", "IN_PROGRESS"),
        mission("session-tags", "Data Quality", "เก็บ tag mode/regime/session", "tag เพิ่มความสมบูรณ์ของข้อมูลเฉพาะเมื่อมีในหลักฐานที่ปลอดภัย", "DATA_GAP"),
        ...safetyMissions,
      ],
      [
        { name: "ตรวจจับ Range", state: "watching" },
        { name: "ตรวจจับ Trend", state: "watching" },
        { name: "สถานะความผันผวน", state: "watching" },
        { name: "บริบท Session", state: "data_gap" },
      ],
      [badge("บริบท Grid ออนไลน์", "info", "เห็นบริบทต้นทุนและ grid แต่ไม่ใช่การอนุมัติให้เทรด", {
        evidenceSource: "บริบทต้นทุน/regime จาก ViewModel ที่ปลอดภัย",
        doesNotMean: "ไม่ได้แปลว่ามี edge หรือสิทธิ์ส่งคำสั่ง",
      }), ...commonBadges],
    ),
    memory_brain: makeProgression(
      vm,
      "memory_brain",
      110 + fillXp + sourceXp + (vm.paper.closedCycles > 0 ? 60 : 0),
      [
        mission("journal-evidence", "Paper Evidence", "คง journal ให้อ่านได้", "เหตุการณ์ paper เป็นหลักฐาน ไม่ใช่ PnL เงินจริง", vm.paper.totalOrderFilled > 0 ? "DONE" : "DATA_GAP"),
        mission("closed-cycle-memory", "Paper Evidence", "บันทึกหลักฐานรอบปิด", "closedCycles=0 ยังไม่มีข้อมูลรอบปิดจนกว่าจะมีรอบจริง", vm.paper.closedCycles > 0 ? "DONE" : "DATA_GAP"),
        ...safetyMissions,
      ],
      [
        { name: "ความครบของ Journal", state: vm.paper.totalOrderFilled > 0 ? "online" : "data_gap" },
        { name: "เรียกคืนหลักฐาน", state: "watching" },
        { name: "บทเรียนที่ได้", state: vm.paper.closedCycles > 0 ? "online" : "locked" },
        { name: "ความครอบคลุม Attribution", state: "watching" },
      ],
      [
        ...(vm.paper.totalOrderFilled > 0 ? [badge("บัญชีหลักฐานออนไลน์", "info", "หลักฐาน paper ล่าสุดมองเห็นได้บน UI", {
          evidenceSource: "เหตุการณ์ paper ล่าสุดผ่านสถานะ frontend ที่ปลอดภัย",
          doesNotMean: "ไม่ได้แปลว่า PnL เงินจริงหรือความพร้อม production",
        })] : []),
        ...commonBadges,
      ],
    ),
  };

  return progressions;
}

export function listAgentProgressions(progressions: Record<AgentId, AgentProgression>): AgentProgression[] {
  return ORDER.map((id) => progressions[id]);
}

export function listActiveMissions(progressions: Record<AgentId, AgentProgression>): Mission[] {
  const byId = new Map<string, Mission>();
  listAgentProgressions(progressions).forEach((progression) => {
    progression.missions.forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
  });
  const priority: Record<MissionStatus, number> = {
    FAIL: 0,
    BLOCKED: 1,
    NOT_APPROVED: 2,
    DATA_GAP: 3,
    WARNING: 4,
    IN_PROGRESS: 5,
    DONE: 6,
  };
  return [...byId.values()].sort((a, b) => priority[a.status] - priority[b.status]).slice(0, 5);
}
