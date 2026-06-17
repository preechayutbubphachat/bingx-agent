import type { PaperVM, ReviewReadinessDimensionVM, ShadowEvidenceCoverageRequirementVM } from "./viewModel";

export type EvidenceWaitingRoomStage = {
  label: string;
  activeIndex: number;
  resultLine: string;
};

export type EvidenceWaitingRoomModel = {
  scoreText: string;
  statusText: string;
  stage: EvidenceWaitingRoomStage;
  progressSteps: { label: string; status: "current" | "locked" | "future" }[];
  missingRequirements: { id: string; label: string; text: string }[];
  missingRequirementsFallback: string | null;
  nextMilestone: string;
  blocker: {
    title: string;
    explanation: string;
    details: {
      priceVsGrid: string;
      dynamicGridStatus: string;
      regridReadinessStatus: string;
      trendStrategyStatus: string;
    };
  };
  dimensionChips: { label: string; score: number; status: string }[];
  safetyLocks: string[];
};

const PROGRESS_STEPS = [
  "เก็บข้อมูล Runtime",
  "Review Readiness >= 40",
  "Evidence Review เบื้องต้น",
  "Review Readiness >= 70",
  "Human Edge Review",
  "Phase 2-B Paper Activation Review",
  "M-0B Unlock Review",
  "Live Approval / Real trading",
];

export function reviewStatusLabelTh(status: string | null | undefined): string {
  if (status === "NOT_READY") return "ยังไม่พร้อม";
  if (status === "PARTIAL_REVIEW") return "พร้อมรีวิวบางส่วน";
  if (status === "READY_FOR_REVIEW") return "พร้อมให้คนรีวิว";
  if (status === "NO_DATA") return "ยังไม่มีข้อมูล";
  return status ?? "ยังไม่มีข้อมูล";
}

export function dimensionStatusLabelTh(status: string | null | undefined): string {
  if (status === "NO_REALIZED_EDGE_SAMPLE") return "ยังไม่มีรอบปิดจริง";
  if (status === "LOW_QUALITY_NOT_READY") return "ข้อมูลยังคุณภาพต่ำ";
  if (status === "NO_DATA_INVALIDATED") return "ยังไม่มีข้อมูล / แผนถูก invalidated";
  if (status === "EXPLAINED_WITH_DIAGNOSTICS_GAP") return "อธิบายเหตุผลได้แล้ว แต่ diagnostics ยังไม่ครบ";
  return reviewStatusLabelTh(status);
}

export function evidenceRequirementLabel(id: string): string {
  if (id === "range_subset") return "ตลาด RANGE";
  if (id === "entry_touch") return "ราคาแตะ Entry";
  if (id === "price_context_diversity") return "Price context";
  if (id === "dynamic_grid_diversity") return "Dynamic Grid context";
  if (id === "unknown_context_dilution") return "ลด UNKNOWN context";
  if (id === "context_ready_setups") return "Context-ready setups";
  if (id === "context_ready_resolved") return "Context-ready resolved";
  return id;
}

function unitLabel(unit: string): string {
  if (unit === "buckets") return "bucket";
  if (unit === "context_ready_samples") return "context-ready samples";
  return unit || "samples";
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function reviewReadinessStage(score: PaperVM["reviewReadinessScore"]): EvidenceWaitingRoomStage {
  const overallScore = safeNumber(score.overallScore);
  const gridScore = safeNumber(score.dimensions.grid.score) ?? 0;
  const shadowScore = safeNumber(score.dimensions.shadow.score) ?? 0;

  if (overallScore == null || !score.available || overallScore < 40) {
    return {
      label: "เก็บข้อมูลต่อ",
      activeIndex: 0,
      resultLine: "ตอนนี้ยังไม่ถึงเกณฑ์ review เบื้องต้น - เก็บข้อมูลต่อ",
    };
  }

  if (overallScore < 70) {
    return {
      label: "เริ่ม review เบื้องต้นได้",
      activeIndex: 2,
      resultLine: "เริ่มดู evidence เบื้องต้นได้ แต่ยังไม่ใช่ activation",
    };
  }

  if (gridScore > 0 && shadowScore > 0) {
    return {
      label: "พร้อมให้มนุษย์ review",
      activeIndex: 4,
      resultLine: "พร้อมให้มนุษย์ review แต่ยังไม่ใช่สัญญาณเปิดเทรด",
    };
  }

  return {
    label: "รอ Grid/Shadow มีคะแนนก่อน",
    activeIndex: 3,
    resultLine: "คะแนนรวมถึง 70 แล้ว แต่ Grid/Shadow ยังต้องมีหลักฐานมากกว่า 0",
  };
}

function progressSteps(stage: EvidenceWaitingRoomStage): EvidenceWaitingRoomModel["progressSteps"] {
  return PROGRESS_STEPS.map((label, index) => ({
    label,
    status: index === stage.activeIndex ? "current" : index < stage.activeIndex ? "future" : "locked",
  }));
}

function missingRequirementText(req: ShadowEvidenceCoverageRequirementVM): string {
  return `${evidenceRequirementLabel(req.id)}: ขาด ${req.remaining} ${unitLabel(req.unit)}`;
}

function blockerTitle(code: string | null | undefined): string {
  if (code === "GRID_EXPOSURE_GUARD_PAUSE") return "Grid Exposure Guard Pause";
  return code ?? "ยังไม่มีข้อมูลตัวบล็อกหลัก";
}

function blockerExplanation(code: string | null | undefined, fallback: string | null | undefined): string {
  if (code === "GRID_EXPOSURE_GUARD_PAUSE") {
    return "กริดถูกหยุด เพราะมี BUY exposure ฝั่งเดียว ยังไม่มี SELL มาปิดรอบ";
  }
  return fallback || "ยังไม่มีข้อมูลตัวบล็อกหลัก";
}

function dimensionChip(label: string, dim: ReviewReadinessDimensionVM): EvidenceWaitingRoomModel["dimensionChips"][number] {
  return {
    label,
    score: safeNumber(dim.score) ?? 0,
    status: dimensionStatusLabelTh(dim.status),
  };
}

export function buildEvidenceWaitingRoomModel(paper: PaperVM): EvidenceWaitingRoomModel {
  const score = paper.reviewReadinessScore;
  const stage = reviewReadinessStage(score);
  const missing = paper.shadowEvidenceCoverage?.requirements.filter((req) => !req.met) ?? [];
  const primary = paper.noTradeReasonAnalysis?.primaryReason ?? null;
  const milestone = paper.shadowEvidenceCoverage?.nextEvidenceMilestone ?? null;

  return {
    scoreText: score.available && safeNumber(score.overallScore) != null ? `${score.overallScore}/100` : "ยังไม่มีข้อมูล Review Readiness",
    statusText: reviewStatusLabelTh(score.overallStatus),
    stage,
    progressSteps: progressSteps(stage),
    missingRequirements: missing.map((req) => ({
      id: req.id,
      label: evidenceRequirementLabel(req.id),
      text: missingRequirementText(req),
    })),
    missingRequirementsFallback: paper.shadowEvidenceCoverage ? null : "ยังไม่มีข้อมูลสิ่งที่ต้องรอ",
    nextMilestone: milestone ? `${evidenceRequirementLabel(milestone.id)}: ขาด ${milestone.remaining} ${unitLabel(milestone.unit)}` : "รอข้อมูล milestone ถัดไป",
    blocker: {
      title: blockerTitle(primary?.code),
      explanation: blockerExplanation(primary?.code, primary?.label),
      details: {
        priceVsGrid: paper.dynamicRegrid.priceVsGrid ?? "UNKNOWN",
        dynamicGridStatus: paper.dynamicRegrid.candidate.candidateStatus ?? "UNKNOWN",
        regridReadinessStatus: paper.regridReadiness.status ?? "UNKNOWN",
        trendStrategyStatus: paper.trendStrategy.status ?? "UNKNOWN",
      },
    },
    dimensionChips: [
      dimensionChip("Grid", score.dimensions.grid),
      dimensionChip("Shadow", score.dimensions.shadow),
      dimensionChip("Trend", score.dimensions.trend),
      dimensionChip("No-trade", score.dimensions.noTradeExplanation),
    ],
    safetyLocks: [
      "activationAllowed=false",
      "reviewOnly=true",
      "Live trading = OFF",
      "Order placement = OFF",
      "M-0B = BLOCKED",
      "Phase 2-B = BLOCKED",
    ],
  };
}
