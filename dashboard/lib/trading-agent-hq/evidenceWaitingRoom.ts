import type { PaperVM, ReviewReadinessDimensionVM, ShadowEvidenceCoverageRequirementVM } from "./viewModel";

export type EvidenceWaitingRoomStage = {
  label: string;
  activeIndex: number;
  resultLine: string;
};

export type EvidenceWaitingRoomTone = "not-ready" | "partial-review" | "ready-review" | "blocked" | "safety-lock";

export type EvidenceWaitingRoomModel = {
  scoreText: string;
  statusText: string;
  compactSummary: string;
  tone: EvidenceWaitingRoomTone;
  progress: { percent: number; label: string };
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

const TOOLTIP_TEXT: Record<string, string> = {
  "Review Readiness": "คะแนนความพร้อมสำหรับให้มนุษย์รีวิวหลักฐาน ไม่ใช่คะแนนสำหรับเปิดเทรด",
  Grid: "ระบบกริด ต้องมีรอบ BUY→SELL ปิดจริงก่อนถึงจะวัด edge ได้",
  Shadow: "ข้อมูลจำลอง/ข้อมูลเงา ใช้ประเมิน setup โดยไม่ส่งคำสั่งจริง",
  Trend: "ฝั่งกลยุทธ์ตามเทรนด์ ต้องมี closed trades แยกจาก grid",
  "No-trade": "เหตุผลที่ระบบไม่เปิดไม้ในรอบนี้ ใช้ตรวจว่าไม่เทรดเพราะอะไร",
  RANGE: "สภาวะตลาดแกว่งในกรอบ เหมาะกับการประเมิน grid มากกว่าเทรนด์แรง",
  "Entry-touch": "จำนวนครั้งที่ราคาวิ่งมาแตะโซนเข้า ถ้าน้อยเกินไปยังสรุปผล target/invalidation ไม่ได้",
  "UNKNOWN context": "ข้อมูลที่ยังไม่มีบริบทตลาดครบ ต้องลดสัดส่วนนี้ก่อน review",
  "Price context": "บริบทของราคากับกริด เช่น BELOW_GRID, INSIDE_GRID, ABOVE_GRID",
  "Dynamic Grid context": "สถานะของ dynamic grid เช่น PAUSE_EXPOSURE_LIMIT หรือ READY",
  "Grid Exposure Guard": "ตัวป้องกันไม่ให้กริดเปิดไม้เพิ่มตอนมี BUY exposure ฝั่งเดียวและยังไม่มี SELL ปิดรอบ",
  Activation: "การอนุญาตให้ระบบเริ่มทำงานขั้นถัดไป ต้องผ่าน approval แยก ไม่ได้มาจากคะแนนนี้",
  Live: "การเทรดเงินจริง ยังปิดอยู่และต้องมี manual approval แยก",
  Order: "คำสั่งซื้อขายจริงหรือ paper order ใหม่ การ์ดนี้ไม่มีสิทธิ์ส่ง order",
  "M-0B": "ด่านปลดล็อก production readiness ยัง BLOCKED จนกว่า evidence ครบ",
  "Phase 2-B": "ขั้น paper activation/regrid review ยัง BLOCKED จนกว่า operator approve",
};

export function evidenceTooltip(term: string): string | null {
  return TOOLTIP_TEXT[term] ?? null;
}

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
  const normalized = id.toLowerCase();
  if (normalized === "range_subset") return "ตลาด RANGE";
  if (normalized === "entry_touch") return "ราคาแตะ Entry";
  if (normalized === "price_context_diversity") return "เพิ่ม Price Context ให้หลากหลายขึ้น";
  if (normalized === "dynamic_grid_diversity") return "Dynamic Grid context";
  if (normalized === "unknown_context_dilution") return "ลด UNKNOWN context";
  if (normalized === "context_ready_setups") return "Context-ready setups";
  if (normalized === "context_ready_resolved") return "Context-ready resolved";
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

function clampScore(value: number | null): number {
  if (value == null) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function reviewProgressTone(status: string | null | undefined, score?: number | null): EvidenceWaitingRoomTone {
  if (status === "READY_FOR_REVIEW") return "ready-review";
  if (status === "PARTIAL_REVIEW") return "partial-review";
  const overallScore = safeNumber(score ?? null);
  if (overallScore != null && overallScore >= 70) return "ready-review";
  if (overallScore != null && overallScore >= 40) return "partial-review";
  return "not-ready";
}

function progressLabel(score: number): string {
  if (score >= 70) return "พร้อมให้คนรีวิว";
  if (score >= 40) return "เริ่มรีวิวบางส่วน";
  return "เก็บข้อมูลต่อ";
}

function compactSummary(
  score: PaperVM["reviewReadinessScore"],
  milestone: PaperVM["shadowEvidenceCoverage"] extends infer Coverage
    ? Coverage extends { nextEvidenceMilestone: infer Milestone }
      ? Milestone
      : never
    : never,
): string {
  const overallScore = safeNumber(score.overallScore);
  if (overallScore != null && overallScore >= 70) {
    return "พร้อมให้มนุษย์รีวิวหลักฐาน · ยังไม่ใช่สัญญาณเปิดเทรด · ต้องรอ Operator Review";
  }
  if (overallScore != null && overallScore >= 40) {
    return "เริ่มมีข้อมูลให้รีวิวบางส่วน · ยังต้องรอหลักฐานเพิ่ม · ยังไม่ใช่ Activation";
  }
  const milestoneId = milestone && typeof milestone === "object" && "id" in milestone ? String(milestone.id) : null;
  const waitLabel = milestoneId ? `สิ่งที่ต้องรออันดับแรก: ${evidenceRequirementLabel(milestoneId)}` : "รอ evidence เพิ่ม";
  return `ตอนนี้อยู่โหมดเก็บข้อมูลต่อ · ${waitLabel} · ยังไม่ใช่สัญญาณเปิดเทรด`;
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
  const progressPercent = clampScore(safeNumber(score.overallScore));

  return {
    scoreText: score.available && safeNumber(score.overallScore) != null ? `${score.overallScore}/100` : "ยังไม่มีข้อมูล Review Readiness",
    statusText: reviewStatusLabelTh(score.overallStatus),
    compactSummary: compactSummary(score, milestone),
    tone: reviewProgressTone(score.overallStatus, score.overallScore),
    progress: { percent: progressPercent, label: progressLabel(progressPercent) },
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
