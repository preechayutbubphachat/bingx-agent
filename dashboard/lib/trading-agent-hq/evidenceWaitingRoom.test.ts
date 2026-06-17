// dashboard/lib/trading-agent-hq/evidenceWaitingRoom.test.ts
// Run: node --test --experimental-strip-types lib/trading-agent-hq/evidenceWaitingRoom.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceWaitingRoomModel,
  evidenceRequirementLabel,
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
  assert.deepEqual(model.missingRequirements.map((r) => r.text), [
    "ตลาด RANGE: ขาด 6 samples",
    "ราคาแตะ Entry: ขาด 3 samples",
  ]);
  assert.equal(model.blocker.title, "Grid Exposure Guard Pause");
  assert.equal(model.blocker.details.priceVsGrid, "BELOW_GRID");
  assert.ok(model.safetyLocks.includes("activationAllowed=false"));
  assert.ok(model.safetyLocks.includes("Order placement = OFF"));
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
