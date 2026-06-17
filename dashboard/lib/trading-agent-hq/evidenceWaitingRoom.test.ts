// dashboard/lib/trading-agent-hq/evidenceWaitingRoom.test.ts
// Run: node --test --experimental-strip-types lib/trading-agent-hq/evidenceWaitingRoom.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceWaitingRoomModel,
  evidenceRequirementLabel,
  evidenceTooltip,
  reviewProgressTone,
  reviewReadinessStage,
  reviewStatusLabelTh,
} from "./evidenceWaitingRoom.ts";
import type { PaperVM, ReviewReadinessScoreVM } from "./viewModel.ts";

const dim = (score: number, status = "NOT_READY") => ({
  status,
  score,
  weight: 0,
  weightedScore: 0,
  drivers: [],
});

function score(overallScore: number | null, overrides: Partial<ReviewReadinessScoreVM> = {}): ReviewReadinessScoreVM {
  return {
    available: true,
    overallScore,
    overallStatus: "NOT_READY",
    scoreType: "REVIEW_READINESS_NOT_ACTIVATION",
    tag: null,
    activationAllowed: false,
    reviewOnly: true,
    disclaimer: null,
    dimensions: {
      grid: dim(0, "NO_REALIZED_EDGE_SAMPLE"),
      shadow: dim(0, "LOW_QUALITY_NOT_READY"),
      trend: dim(0, "NO_DATA_INVALIDATED"),
      noTradeExplanation: dim(60, "EXPLAINED_WITH_DIAGNOSTICS_GAP"),
    },
    ...overrides,
  };
}

const paper = (reviewReadinessScore: ReviewReadinessScoreVM): PaperVM =>
  ({
    reviewReadinessScore,
    shadowEvidenceCoverage: {
      status: "NOT_READY",
      coverageScore: 0.28,
      requirementsMet: 1,
      requirementsTotal: 7,
      requirements: [
        { id: "range_subset", met: false, current: 2, target: 8, remaining: 6, unit: "samples", note: "" },
        { id: "entry_touch", met: false, current: 0, target: 3, remaining: 3, unit: "samples", note: "" },
        { id: "price_context_diversity", met: true, current: 2, target: 2, remaining: 0, unit: "buckets", note: "" },
      ],
      nextEvidenceMilestone: {
        id: "ENTRY_TOUCH",
        remaining: 3,
        unit: "samples",
        description: "Need more entry touches",
      },
    },
    noTradeReasonAnalysis: {
      status: "BOTH_PATHS_BLOCKED",
      activationAllowed: false,
      reviewOnly: true,
      activationBlocked: true,
      gridBlocked: true,
      trendBlocked: true,
      diagnosticsGap: true,
      primaryReason: { code: "GRID_EXPOSURE_GUARD_PAUSE", category: "GRID", label: "Grid paused" },
      tag: null,
    },
    dynamicRegrid: {
      priceVsGrid: "BELOW_GRID",
      candidate: { candidateStatus: "PAUSE_EXPOSURE_LIMIT" },
    },
    regridReadiness: { status: "NOT_READY" },
    trendStrategy: { status: "INVALIDATED" },
  }) as PaperVM;

test("review readiness stage stays in evidence collection below 40", () => {
  assert.equal(reviewReadinessStage(score(23)).label, "เก็บข้อมูลต่อ");
  assert.equal(reviewReadinessStage(score(23)).activeIndex, 0);
});

test("review readiness stage advances for review thresholds without activation", () => {
  assert.equal(reviewReadinessStage(score(45)).label, "เริ่ม review เบื้องต้นได้");
  assert.equal(reviewReadinessStage(score(72)).label, "รอ Grid/Shadow มีคะแนนก่อน");
  assert.equal(reviewReadinessStage(score(72, { dimensions: { grid: dim(12), shadow: dim(8), trend: dim(0), noTradeExplanation: dim(60) } })).label, "พร้อมให้มนุษย์ review");
});

test("labels translate operator-facing statuses and requirement ids", () => {
  assert.equal(reviewStatusLabelTh("NOT_READY"), "ยังไม่พร้อม");
  assert.equal(reviewStatusLabelTh("READY_FOR_REVIEW"), "พร้อมให้คนรีวิว");
  assert.equal(evidenceRequirementLabel("range_subset"), "ตลาด RANGE");
  assert.equal(evidenceRequirementLabel("entry_touch"), "ราคาแตะ Entry");
});

test("model exposes missing requirements, current blocker, and safety locks", () => {
  const model = buildEvidenceWaitingRoomModel(paper(score(23)));
  assert.equal(model.scoreText, "23/100");
  assert.equal(model.stage.label, "เก็บข้อมูลต่อ");
  assert.equal(
    model.compactSummary,
    "ตอนนี้อยู่โหมดเก็บข้อมูลต่อ · สิ่งที่ต้องรออันดับแรก: ราคาแตะ Entry · ยังไม่ใช่สัญญาณเปิดเทรด",
  );
  assert.equal(model.progress.label, "เก็บข้อมูลต่อ");
  assert.equal(model.progress.percent, 23);
  assert.equal(model.tone, "not-ready");
  assert.deepEqual(model.missingRequirements.map((r) => r.text), [
    "ตลาด RANGE: ขาด 6 samples",
    "ราคาแตะ Entry: ขาด 3 samples",
  ]);
  assert.equal(model.blocker.title, "Grid Exposure Guard Pause");
  assert.equal(model.blocker.details.priceVsGrid, "BELOW_GRID");
  assert.ok(model.safetyLocks.includes("activationAllowed=false"));
  assert.ok(model.safetyLocks.includes("Order placement = OFF"));
});

test("compact summary and tone follow review thresholds without implying activation", () => {
  const partial = buildEvidenceWaitingRoomModel(paper(score(45, { overallStatus: "PARTIAL_REVIEW" })));
  assert.equal(partial.compactSummary, "เริ่มมีข้อมูลให้รีวิวบางส่วน · ยังต้องรอหลักฐานเพิ่ม · ยังไม่ใช่ Activation");
  assert.equal(partial.progress.label, "เริ่มรีวิวบางส่วน");
  assert.equal(partial.tone, "partial-review");

  const ready = buildEvidenceWaitingRoomModel(
    paper(score(72, { overallStatus: "READY_FOR_REVIEW", dimensions: { grid: dim(12), shadow: dim(8), trend: dim(0), noTradeExplanation: dim(60) } })),
  );
  assert.equal(ready.compactSummary, "พร้อมให้มนุษย์รีวิวหลักฐาน · ยังไม่ใช่สัญญาณเปิดเทรด · ต้องรอ Operator Review");
  assert.equal(ready.progress.label, "พร้อมให้คนรีวิว");
  assert.equal(ready.tone, "ready-review");
  assert.equal(reviewProgressTone("READY_FOR_REVIEW"), "ready-review");
});

test("compact summary falls back safely when next milestone is missing", () => {
  const model = buildEvidenceWaitingRoomModel({
    ...paper(score(23)),
    shadowEvidenceCoverage: {
      ...paper(score(23)).shadowEvidenceCoverage!,
      nextEvidenceMilestone: null,
    },
  });
  assert.equal(model.compactSummary, "ตอนนี้อยู่โหมดเก็บข้อมูลต่อ · รอ evidence เพิ่ม · ยังไม่ใช่สัญญาณเปิดเทรด");
});

test("technical terms expose Thai tooltip copy", () => {
  assert.equal(
    evidenceTooltip("Review Readiness"),
    "คะแนนความพร้อมสำหรับให้มนุษย์รีวิวหลักฐาน ไม่ใช่คะแนนสำหรับเปิดเทรด",
  );
  assert.equal(evidenceTooltip("Grid"), "ระบบกริด ต้องมีรอบ BUY→SELL ปิดจริงก่อนถึงจะวัด edge ได้");
  assert.equal(evidenceTooltip("Activation"), "การอนุญาตให้ระบบเริ่มทำงานขั้นถัดไป ต้องผ่าน approval แยก ไม่ได้มาจากคะแนนนี้");
  assert.equal(evidenceTooltip("unknown-term"), null);
});

test("model has explicit fallback copy for missing review, coverage, and blocker data", () => {
  const model = buildEvidenceWaitingRoomModel({
    ...paper(score(null, { available: false })),
    shadowEvidenceCoverage: null,
    noTradeReasonAnalysis: null,
  });
  assert.equal(model.scoreText, "ยังไม่มีข้อมูล Review Readiness");
  assert.equal(model.missingRequirementsFallback, "ยังไม่มีข้อมูลสิ่งที่ต้องรอ");
  assert.equal(model.blocker.title, "ยังไม่มีข้อมูลตัวบล็อกหลัก");
});
