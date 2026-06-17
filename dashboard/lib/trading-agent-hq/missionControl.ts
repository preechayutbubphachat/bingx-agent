import type { TradingAgentHQViewModel } from "./viewModel";

export type MissionTone = "active" | "review" | "info" | "waiting" | "blocked" | "neutral";

export type MissionKpi = {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: MissionTone;
};

export type MissionControlSummary = {
  environment: string;
  region: string;
  systemTime: string;
  safetyLine: string;
  kpis: MissionKpi[];
};

export function missionStatusTone(status: string | null | undefined): MissionTone {
  if (status === "READY_FOR_REVIEW") return "review";
  if (status === "PARTIAL_REVIEW") return "info";
  if (status === "BOTH_PATHS_BLOCKED" || status === "BLOCKED") return "blocked";
  if (status === "ACTIVE" || status === "PASS") return "active";
  return "waiting";
}

function pct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "0%";
}

export function buildMissionControlSummary(vm: TradingAgentHQViewModel, systemTime: string): MissionControlSummary {
  const review = vm.paper.reviewReadinessScore;
  const alertCount =
    (vm.paper.trendPaperEvidenceRunner.lastRejectReasons?.length ?? 0) +
    (vm.paper.trendPaperEvidenceRunner.stopReason ? 1 : 0) +
    (vm.paper.trendStrategy.warnings?.length ?? 0);
  const agentTotal = Object.keys(vm.agents).length;

  return {
    environment: "PAPER REVIEW",
    region: "Thailand (BKK)",
    systemTime,
    safetyLine: "Review-only · ไม่ใช่ Activation · Live OFF · Order OFF",
    kpis: [
      {
        id: "mission",
        label: "สถานะภารกิจ / Mission Status",
        value: vm.paper.canonicalMarketRegime.regime ?? "UNKNOWN",
        sub: vm.paper.canonicalMarketRegime.direction ?? "รอข้อมูลตลาด",
        tone: "info",
      },
      {
        id: "review",
        label: "ความพร้อมรีวิว / Review Readiness",
        value: review.available ? pct(review.overallScore) : "NO DATA",
        sub: review.overallStatus ?? "ยังไม่มีข้อมูล",
        tone: missionStatusTone(review.overallStatus),
      },
      {
        id: "agents",
        label: "Agent ที่กำลังทำงาน / Active Agents",
        value: `${vm.topHud.agentsActive}/${agentTotal}`,
        sub: "Online in command center",
        tone: vm.topHud.agentsActive > 0 ? "active" : "waiting",
      },
      {
        id: "alerts",
        label: "การแจ้งเตือน / Alerts",
        value: String(alertCount),
        sub: alertCount > 0 ? "Requires attention" : "No urgent alerts",
        tone: alertCount > 0 ? "blocked" : "neutral",
      },
      {
        id: "paperMode",
        label: "โหมดระบบ / System Mode",
        value: "Paper-only",
        sub: vm.safety.phase,
        tone: "review",
      },
    ],
  };
}
