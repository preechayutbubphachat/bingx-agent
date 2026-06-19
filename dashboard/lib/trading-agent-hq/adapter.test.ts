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
          sampleAccounting: {
            lifetimeExactSamples: 75,
            windowExactSamples: 70,
            currentPriceEligibleExactSamples: 12,
            reviewTargetSamples: 100,
            reviewSamplesUsed: 75,
            reviewSamplesRemaining: 25,
            sampleSource: "LIFETIME_CUMULATIVE",
            isMonotonicExpected: true,
            canDecrease: false,
            explanation: "Lifetime cumulative exact samples drive review progress.",
            warnings: [],
          },
          verdict: {
            status: "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY",
            summary: "Exact Zone มี RR geometry ดีกว่า heuristic แต่ execution outcome ยังไม่พร้อม",
            blockers: ["exact samples 75/100 - ขาด exact samples อีก 25"],
            nextAction: "continue_collecting_exact_zone_and_shadow_outcome_evidence",
          },
        },
        mtfExactZoneFailureAttribution: {
          schemaVersion: 1,
          source: "MTF_EXACT_ZONE_FAILURE_ATTRIBUTION_V1",
          status: "GEOMETRY_PROMISING_EXECUTION_WEAK",
          readiness: "REVIEW_NOT_ACTIVATION",
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
          sample: {
            lifetimeExactSamples: 325,
            windowExactSamples: 65,
            currentPriceEligibleExactSamples: null,
            reviewTargetSamples: 100,
            sampleGatePassed: true,
            sampleInterpretation: "sample gate passed",
          },
          geometryEdge: {
            exactAvgNetRR: 5.06,
            heuristicAvgNetRR: 1.62,
            delta: 3.44,
            ratio: 3.12,
            status: "GEOMETRY_EDGE_STRONG",
          },
          failureRates: {
            targetTooCloseRate: 0.615,
            missedFillRate: 0.797,
            entryTouchRate: 0.2,
            targetAfterTouchRate: 0,
            invalidationAfterTouchRate: 0.72,
          },
          failureAttribution: {
            dominantFailures: [
              { code: "TARGET_TOO_CLOSE_DOMINATES", severity: "BLOCKER", evidence: ["40/65"], interpretation: "Target too close dominates." },
            ],
          },
          cleanSubsetGate: {
            status: "NOT_READY",
            passed: ["sample gate passed"],
            failed: ["targetTooCloseRate > 0.4"],
            thresholds: {
              minLifetimeExactSamples: 100,
              maxTargetTooCloseRate: 0.4,
              maxMissedFillRate: 0.5,
              minEntryTouchRate: 0.35,
              minTargetAfterTouchRate: 0.25,
              maxInvalidationAfterTouchRate: 0.5,
              currentPriceEligibleRequired: true,
            },
          },
          nextAction: {
            primary: "isolate clean candidate subset before review",
            reviewTasks: ["separate target-too-close cases"],
            doNotDo: ["do not activate paper/live"],
          },
        },
        currentPriceEligibleExactSubset: {
          schemaVersion: 1,
          source: "CURRENT_PRICE_ELIGIBLE_EXACT_SUBSET_V1",
          status: "GEOMETRY_INPUTS_MISSING",
          readiness: "REVIEW_NOT_ACTIVATION",
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
          currentPrice: {
            value: 101.5,
            source: "market_snapshot.15m.close",
            latestCandleAt: "2026-06-18T10:00:00.000Z",
            freshnessStatus: "FRESH",
            ageSeconds: 300,
          },
          sampleAccounting: {
            lifetimeExactSamples: 325,
            windowExactSamples: 65,
            currentPriceEligibleExactSamples: null,
            cleanCurrentPriceEligibleSamples: null,
            geometryInputSamples: 0,
            geometryMissingSamples: 0,
          },
          eligibilityFilters: {
            totalCandidates: 0,
            freshCandidates: 0,
            currentPriceInsideOrNearEntry: 0,
            missedCandidates: 0,
            invalidatedCandidates: 0,
            targetTooCloseCandidates: 0,
            costTooHighCandidates: 0,
            cleanCandidates: 0,
          },
          cleanSubsetGate: {
            status: "NOT_READY",
            passed: [],
            failed: ["structured exact candidate geometry missing"],
            thresholds: {
              minCleanEligibleCandidates: 10,
              maxTargetTooCloseRate: 0.4,
              maxMissedFillRate: 0.5,
              minEntryTouchRate: 0.35,
              minTargetAfterTouchRate: 0.25,
              maxInvalidationAfterTouchRate: 0.5,
              requireFreshCurrentPrice: true,
              requireStructuredGeometry: true,
            },
          },
          topCandidates: [{
            id: "snapshot-long-clean",
            direction: "LONG",
            zoneType: "OB_FVG_OVERLAP",
            readiness: "READY",
            status: "CLEAN_REVIEW_ONLY",
            currentPriceStatus: "INSIDE_ENTRY_ZONE",
            qualityStatus: "CLEAN",
            entry: 101.5,
            entryLow: 101.2,
            entryHigh: 101.8,
            stopLoss: 99.5,
            target1: 104.5,
            target2: null,
            netRR: 1.6,
            distanceToEntryPct: 0,
            distanceToEntryAbs: 0,
            priceMoveRequiredDirection: "INSIDE_ENTRY",
            occurrenceCount: 2,
            flags: ["REVIEW_ONLY"],
            reason: "Current price is inside the exact entry area.",
          }],
          dedupSummary: {
            rawCandidates: 3,
            uniqueCandidates: 2,
            duplicateCandidates: 1,
          },
          priceSourceAudit: {
            subsetPriceSource: "market_snapshot.15m.close",
            snapshotPriceSource: "not_available_at_snapshot_build",
            subsetCurrentPrice: 101.5,
            snapshotCurrentPrice: null,
            priceSourceConsistent: false,
            notes: ["Snapshot currentPrice is missing; subset uses currentPriceContext as source of truth."],
          },
          requiredGeometryInputs: ["direction", "entryLow/entryHigh or entry"],
          warnings: ["aggregate-only"],
          nextAction: "add exact candidate geometry snapshot fields to observability log",
        },
        currentPriceConsistencyAudit: {
          schemaVersion: 1,
          source: "CURRENT_PRICE_CONSISTENCY_AUDIT_V1",
          status: "PRICE_MISMATCH_DETECTED",
          canonicalCurrentPrice: {
            value: 101.5,
            source: "market_snapshot.15m.close",
            latestCandleAt: "2026-06-18T10:00:00.000Z",
            freshnessStatus: "FRESH",
            ageSeconds: 300,
          },
          detectedConsumers: [
            {
              path: "trendStrategy.currentPrice",
              value: 103.5,
              source: "trendStrategy.currentPrice",
              priceDelta: 2,
              priceDeltaPct: 1.9704,
              status: "MISMATCH",
            },
          ],
          affectedConditions: [
            {
              condition: "price_inside_entry_zone_or_edge",
              previousValue: true,
              currentPriceBasedValue: false,
              impact: "PASS_TO_FAIL",
              explanation: "A previous in-zone state is not current truth.",
            },
          ],
          currentPriceReevaluation: {
            trendZoneStatus: "REGIME_NOT_TREND",
            distanceToEntryZonePct: null,
            distanceToEntryZoneAbs: null,
            priceMoveRequiredDirection: "NO_ZONE",
            explanation: "Canonical regime is VOLATILITY_COMPRESSION / NEUTRAL; no trend entry zone is built.",
          },
          recommendations: ["Use canonical current price for all trend gate diagnostics before interpreting readiness."],
          pricePropagationAudit: {
            staleConsumerCount: 1,
            propagatedConsumerCount: 2,
            previousAnalysisPriceCount: 1,
            notes: ["Treat mismatched values as previous analysis or snapshot context, not current price."],
          },
          safety: {
            reviewOnly: true,
            activationAllowed: false,
            paperActivationAllowed: false,
            liveActivationAllowed: false,
            orderAllowed: false,
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
  assert.equal(vm.paper.mtfEntryCandidatePipeline.sampleAccounting.reviewSamplesUsed, 75);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.sampleAccounting.windowExactSamples, 70);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.sampleAccounting.currentPriceEligibleExactSamples, 12);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.verdict.status, "PROMISING_GEOMETRY_BUT_EXECUTION_NOT_READY");
  assert.equal(vm.paper.mtfEntryCandidatePipeline.activationAllowed, false);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.paperActivationAllowed, false);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.liveActivationAllowed, false);
  assert.equal(vm.paper.mtfExactZoneFailureAttribution.status, "GEOMETRY_PROMISING_EXECUTION_WEAK");
  assert.equal(vm.paper.mtfExactZoneFailureAttribution.sample.sampleGatePassed, true);
  assert.equal(vm.paper.mtfExactZoneFailureAttribution.failureAttribution.dominantFailures[0]?.code, "TARGET_TOO_CLOSE_DOMINATES");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.status, "GEOMETRY_INPUTS_MISSING");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.currentPrice.value, 101.5);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.zoneType, "OB_FVG_OVERLAP");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.readiness, "READY");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.currentPriceStatus, "INSIDE_ENTRY_ZONE");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.qualityStatus, "CLEAN");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.priceMoveRequiredDirection, "INSIDE_ENTRY");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.occurrenceCount, 2);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.topCandidates[0]?.flags[0], "REVIEW_ONLY");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.dedupSummary.duplicateCandidates, 1);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.priceSourceAudit.priceSourceConsistent, false);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.priceSourceAudit.snapshotPriceSource, "not_available_at_snapshot_build");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.requiredGeometryInputs[0], "direction");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.activationAllowed, false);
  assert.equal(vm.paper.currentPriceConsistencyAudit.status, "PRICE_MISMATCH_DETECTED");
  assert.equal(vm.paper.currentPriceConsistencyAudit.canonicalCurrentPrice.value, 101.5);
  assert.equal(vm.paper.currentPriceConsistencyAudit.detectedConsumers[0]?.status, "MISMATCH");
  assert.equal(vm.paper.currentPriceConsistencyAudit.affectedConditions[0]?.impact, "PASS_TO_FAIL");
  assert.equal(vm.paper.currentPriceConsistencyAudit.currentPriceReevaluation.trendZoneStatus, "REGIME_NOT_TREND");
  assert.equal(vm.paper.currentPriceConsistencyAudit.currentPriceReevaluation.priceMoveRequiredDirection, "NO_ZONE");
  assert.equal(vm.paper.currentPriceConsistencyAudit.pricePropagationAudit.staleConsumerCount, 1);
  assert.equal(vm.paper.currentPriceConsistencyAudit.pricePropagationAudit.previousAnalysisPriceCount, 1);
  assert.equal(vm.paper.currentPriceConsistencyAudit.safety.activationAllowed, false);
  assert.equal(vm.paper.currentPriceConsistencyAudit.safety.orderAllowed, false);
});
