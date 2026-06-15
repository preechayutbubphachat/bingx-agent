import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyReviewReadinessScore,
  evaluateReviewReadinessScore,
} from "./reviewReadinessScore.ts";

function currentRuntimeFixture() {
  return {
    edgeDiagnostics: {
      closedCycles: 0,
      expectancy: null,
    },
    costGate: {
      status: "unknown",
    },
    paperDataQuality: {
      qualityStatus: "insufficient",
    },
    sellFillCount: 0,
    trendStrategy: {
      status: "INVALIDATED",
    },
    trendEdgeReview: {
      status: "NO_DATA",
      trendClosedTrades: 0,
      expectancyR: null,
    },
    trendPaperEvidenceRunner: {
      trendClosedTrades: 0,
      expectancyR: null,
    },
    shadowOutcomeQualityGate: {
      status: "UNKNOWN_CONTEXT_DOMINATES",
      sampleQuality: "LOW",
    },
    shadowEvidenceCoverage: {
      status: "NOT_READY",
      coverageScore: 0.2857,
      requirementsMet: 2,
      requirementsTotal: 7,
    },
    noTradeReasonAnalysis: {
      status: "BOTH_PATHS_BLOCKED",
      diagnosticsGap: true,
    },
  };
}

test("empty score is fail-closed no data and never activation", () => {
  const score = emptyReviewReadinessScore();

  assert.equal(score.overallStatus, "NO_DATA");
  assert.equal(score.overallScore, 0);
  assert.equal(score.activationAllowed, false);
  assert.equal(score.reviewOnly, true);
  assert.equal(score.scoreType, "REVIEW_READINESS_NOT_ACTIVATION");
});

test("D5.5 current runtime fixture scores NOT_READY 11 with expected dimensions", () => {
  const score = evaluateReviewReadinessScore(currentRuntimeFixture());

  assert.equal(score.overallStatus, "NOT_READY");
  assert.equal(score.overallScore, 11);
  assert.equal(score.tag, "D5_5_REVIEW_READINESS_NOT_READY");
  assert.equal(score.dimensions.grid.status, "NO_REALIZED_EDGE_SAMPLE");
  assert.equal(score.dimensions.grid.score, 0);
  assert.equal(score.dimensions.shadow.status, "LOW_QUALITY_NOT_READY");
  assert.equal(score.dimensions.shadow.score, 11);
  assert.equal(score.dimensions.shadow.weightedScore, 3.85);
  assert.equal(score.dimensions.trend.status, "NO_DATA_INVALIDATED");
  assert.equal(score.dimensions.trend.score, 0);
  assert.equal(score.dimensions.noTradeExplanation.status, "EXPLAINED_WITH_DIAGNOSTICS_GAP");
  assert.equal(score.dimensions.noTradeExplanation.score, 70);
  assert.equal(score.dimensions.noTradeExplanation.weightedScore, 7);
  assert.equal(score.activationAllowed, false);
  assert.equal(score.reviewOnly, true);
  assert.equal(score.scoreType, "REVIEW_READINESS_NOT_ACTIVATION");
});

test("READY_FOR_REVIEW requires overall >= 70 plus grid and shadow evidence", () => {
  const score = evaluateReviewReadinessScore({
    edgeDiagnostics: { closedCycles: 20, expectancy: 0.12 },
    sellFillCount: 20,
    costGate: { status: "pass" },
    paperDataQuality: { qualityStatus: "complete" },
    shadowOutcomeQualityGate: { status: "REVIEW_READY", sampleQuality: "HIGH" },
    shadowEvidenceCoverage: { status: "READY", coverageScore: 0.8 },
    trendStrategy: { status: "SETUP_READY" },
    trendEdgeReview: { status: "REVIEW_READY", trendClosedTrades: 30, expectancyR: 0.2 },
    noTradeReasonAnalysis: { status: "BOTH_PATHS_BLOCKED", diagnosticsGap: false },
  });

  assert.equal(score.overallStatus, "READY_FOR_REVIEW");
  assert.ok(score.overallScore >= 70);
  assert.ok(score.dimensions.grid.score > 0);
  assert.ok(score.dimensions.shadow.score > 0);
  assert.equal(score.activationAllowed, false);
});

test("high no-trade explanation alone cannot produce READY_FOR_REVIEW", () => {
  const score = evaluateReviewReadinessScore({
    edgeDiagnostics: { closedCycles: 0, expectancy: null },
    sellFillCount: 0,
    trendStrategy: { status: "INVALIDATED" },
    trendEdgeReview: { status: "NO_DATA", trendClosedTrades: 0 },
    shadowOutcomeQualityGate: { status: "NO_DATA", sampleQuality: "LOW" },
    shadowEvidenceCoverage: { status: "NO_DATA", coverageScore: 0 },
    noTradeReasonAnalysis: { status: "BOTH_PATHS_BLOCKED", diagnosticsGap: false },
  });

  assert.equal(score.dimensions.noTradeExplanation.score, 100);
  assert.equal(score.overallScore, 10);
  assert.equal(score.overallStatus, "NOT_READY");
});

test("partial review band starts at overall score 40", () => {
  const score = evaluateReviewReadinessScore({
    edgeDiagnostics: { closedCycles: 10, expectancy: 0.1 },
    sellFillCount: 10,
    costGate: { status: "pass" },
    paperDataQuality: { qualityStatus: "complete" },
    shadowOutcomeQualityGate: { status: "UNKNOWN_CONTEXT_DOMINATES", sampleQuality: "LOW" },
    shadowEvidenceCoverage: { status: "NOT_READY", coverageScore: 0.2857 },
    trendStrategy: { status: "INVALIDATED" },
    trendEdgeReview: { status: "NO_DATA", trendClosedTrades: 0 },
    noTradeReasonAnalysis: { status: "BOTH_PATHS_BLOCKED", diagnosticsGap: false },
  });

  assert.equal(score.overallStatus, "PARTIAL_REVIEW");
  assert.ok(score.overallScore >= 40);
  assert.ok(score.overallScore < 70);
});

test("quality factors apply to shadow score", () => {
  const low = evaluateReviewReadinessScore({
    shadowOutcomeQualityGate: { status: "UNKNOWN_CONTEXT_DOMINATES", sampleQuality: "LOW" },
    shadowEvidenceCoverage: { status: "NOT_READY", coverageScore: 0.5 },
  });
  const medium = evaluateReviewReadinessScore({
    shadowOutcomeQualityGate: { status: "CONTEXT_BIASED", sampleQuality: "MEDIUM" },
    shadowEvidenceCoverage: { status: "NOT_READY", coverageScore: 0.5 },
  });
  const high = evaluateReviewReadinessScore({
    shadowOutcomeQualityGate: { status: "REVIEW_READY", sampleQuality: "HIGH" },
    shadowEvidenceCoverage: { status: "READY", coverageScore: 0.5 },
  });

  assert.equal(low.dimensions.shadow.score, 20);
  assert.equal(medium.dimensions.shadow.score, 35);
  assert.equal(high.dimensions.shadow.score, 50);
});

test("no-trade explanation scores 0, 70, and 100 by diagnostic clarity", () => {
  const missing = evaluateReviewReadinessScore({ noTradeReasonAnalysis: { status: "NO_DIAGNOSTICS" } });
  const gap = evaluateReviewReadinessScore({ noTradeReasonAnalysis: { status: "BOTH_PATHS_BLOCKED", diagnosticsGap: true } });
  const explained = evaluateReviewReadinessScore({ noTradeReasonAnalysis: { status: "GRID_BLOCKED_ONLY", diagnosticsGap: false } });

  assert.equal(missing.dimensions.noTradeExplanation.score, 0);
  assert.equal(gap.dimensions.noTradeExplanation.score, 70);
  assert.equal(explained.dimensions.noTradeExplanation.score, 100);
});

test("score clamps dimension values and does not mutate input", () => {
  const input = {
    shadowOutcomeQualityGate: { status: "REVIEW_READY", sampleQuality: "HIGH" },
    shadowEvidenceCoverage: { status: "READY", coverageScore: 2 },
  };
  const before = JSON.stringify(input);
  const score = evaluateReviewReadinessScore(input);

  assert.equal(score.dimensions.shadow.score, 100);
  assert.equal(JSON.stringify(input), before);
});

test("invariants hold for all inputs", () => {
  for (const input of [
    null,
    {},
    currentRuntimeFixture(),
    {
      edgeDiagnostics: { closedCycles: 50, expectancy: 1 },
      sellFillCount: 50,
      shadowOutcomeQualityGate: { status: "REVIEW_READY", sampleQuality: "HIGH" },
      shadowEvidenceCoverage: { status: "READY", coverageScore: 1 },
    },
  ]) {
    const score = evaluateReviewReadinessScore(input);
    assert.equal(score.activationAllowed, false);
    assert.equal(score.reviewOnly, true);
    assert.equal(score.scoreType, "REVIEW_READINESS_NOT_ACTIVATION");
    assert.match(score.disclaimer, /not activation/);
    assert.match(score.disclaimer, /not live/);
  }
});
