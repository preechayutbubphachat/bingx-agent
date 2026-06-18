// dashboard/lib/trading-agent-hq/adapter.test.ts
// Run: node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { mapToViewModel } from "./adapter.ts";

test("maps MTF entry candidate runtime evidence through Agent HQ VM", () => {
  const vm = mapToViewModel(
    {
      generatedAt: "2026-06-18T00:00:00.000Z",
      phase: "M-0B_BLOCKED",
      exchangeManualApproval: "not_approved",
      runtimeCoreFiles: { latestDecision: "exists" },
    },
    {
      checkedAt: "2026-06-18T00:00:00.000Z",
      paperJournal: {
        paperModeDetected: true,
        totalOrderFilled: 0,
        totalPaperEvents: 0,
        recentEvents: [],
      },
    },
    {
      edgeDiagnostics: { closedCycles: 0 },
      paperLoopDiagnostics: {
        mtfEntryCandidatePipeline: {
          schemaVersion: 1,
          source: "MTF_ENTRY_CANDIDATE_PIPELINE_V1",
          status: "WARNING_DEGRADED",
          readiness: "REVIEW_NOT_ACTIVATION",
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
          htfBias: { status: "BEARISH", confidence: 82, source: "canonicalMarketRegime", reasons: [], warnings: [] },
          zoneCandidate: {
            status: "TARGET_TOO_CLOSE",
            exactSamples: 75,
            requiredExactSamples: 100,
            samplesRemaining: 25,
            exactAvgNetRR: 6.1932,
            heuristicAvgNetRR: 1.7058,
            exactVsHeuristicDelta: 4.8687,
            usesExactObFvgZonesCount: 75,
            dominantExactStatus: "EXACT_ZONE_CONFLICT",
            dominantExactReadiness: "TARGET_TOO_CLOSE",
            warningFlags: ["HIGH_TARGET_TOO_CLOSE_RATE", "HIGH_MISSED_FILL_RATE", "REVIEW_NOT_ACTIVATION"],
          },
          triggerReview: {
            status: "INVALIDATION_DOMINATES",
            entryTouched: 21,
            entryTouchRate: 0.28,
            entryNotReached: 0,
            entryNotReachedRate: 0,
            targetAfterEntryTouchRate: 0,
            invalidationAfterEntryTouchRate: 0.9524,
            pending: 11,
          },
          geometry: {
            status: "WARNING_DEGRADED",
            geometryReady: 64,
            noGeometry: 11,
            fillResolutionStatus: "PARTIAL",
            missedFillRate: 0.6719,
            pending: 11,
            notes: [],
          },
          currentPriceContext: {
            currentPrice: 101.5,
            priceSource: "market_snapshot.15m.close",
            latestCandleAt: "2026-06-18T10:00:00.000Z",
            snapshotGeneratedAt: "2026-06-18T10:01:00.000Z",
            freshnessStatus: "FRESH",
            ageSeconds: 300,
            reevaluationRequired: false,
            notes: ["Latest candle is fresh."],
          },
          currentCandidateReevaluation: {
            status: "CURRENT_PRICE_CONFIRMED",
            previousAnalysisPrice: 101,
            currentPrice: 101.5,
            priceMovePct: 0.5,
            reason: "Current price is fresh and close enough to the prior analysis context.",
          },
          verdict: {
            status: "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY",
            summary: "Exact Zone มี RR geometry ดีกว่า heuristic แต่ execution outcome ยังไม่พร้อม",
            blockers: ["exact samples 75/100 - ขาด exact samples อีก 25"],
            nextAction: "continue_collecting_exact_zone_and_shadow_outcome_evidence",
          },
        },
        trendEvidenceDecisionSummary: {
          exactZoneComparisonSummary: {
            conflictBreakdown: { TARGET_TOO_CLOSE: 50, COST_TOO_HIGH: 0, CONFLICTING_MTF: 0, other: {} },
          },
        },
      },
    },
  );

  assert.equal(vm.paper.mtfEntryCandidatePipeline.status, "WARNING_DEGRADED");
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.exactSamples, 75);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.requiredExactSamples, 100);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.samplesRemaining, 25);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.exactAvgNetRR, 6.1932);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.heuristicAvgNetRR, 1.7058);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.exactVsHeuristicDelta, 4.8687);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.currentPriceContext.freshnessStatus, "FRESH");
  assert.equal(vm.paper.mtfEntryCandidatePipeline.currentPriceContext.currentPrice, 101.5);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.currentCandidateReevaluation.status, "CURRENT_PRICE_CONFIRMED");
  assert.equal(vm.paper.mtfEntryCandidatePipeline.verdict.status, "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY");
  assert.equal(vm.paper.mtfEntryCandidatePipeline.activationAllowed, false);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.paperActivationAllowed, false);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.liveActivationAllowed, false);
});
