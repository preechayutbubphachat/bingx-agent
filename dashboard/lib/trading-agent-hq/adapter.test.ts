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
            windowExactSamples: 70,
            lifetimeExactSamples: 352,
            reviewSamplesUsed: 352,
            requiredExactSamples: 100,
            samplesRemaining: 25,
            sampleCountMeaning: "WINDOW_FOR_RECENT_PATTERN",
            reviewSampleGatePassed: true,
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
          compactTopCandidates: [{
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
            previousAnalysisPriceSource: null,
            previousAnalysisPrice: null,
            previousAnalysisDriftPct: null,
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
        regimeAwareExactCandidateWatchlist: {
          schemaVersion: 1,
          source: "REGIME_AWARE_EXACT_CANDIDATE_WATCHLIST_V1",
          status: "REGIME_NOT_CONFIRMED",
          readiness: "REVIEW_NOT_ACTIVATION",
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
          currentMarket: {
            currentPrice: 101.5,
            freshnessStatus: "FRESH",
            regime: "NO_TRADE",
            direction: "UNKNOWN",
            confidence: 35,
            trendZoneStatus: "NO_ACTIVE_TREND_ZONE",
            noZoneReason: "No active trend zone exists.",
          },
          watchlistSummary: {
            totalCandidates: 65,
            uniqueCandidates: 48,
            watchCandidates: 1,
            waitingPullbackCandidates: 0,
            regimeBlockedCandidates: 1,
            qualityRejectedCandidates: 0,
            degradedWatchCandidates: 0,
            missedCandidates: 44,
            invalidatedCandidates: 4,
            cleanReviewCandidates: 0,
          },
          watchlistDedupSummary: {
            rawWatchCandidates: 1,
            uniqueWatchCandidates: 1,
            duplicateWatchCandidates: 0,
            clusteringTolerance: "entry/target rounded to 0.1 USDT; stop grouped within 1 USDT",
          },
          compactSummary: {
            currentPrice: 101.5,
            freshnessStatus: "FRESH",
            regime: "NO_TRADE",
            direction: "UNKNOWN",
            watchlistStatus: "REGIME_NOT_CONFIRMED",
            cleanReviewCandidates: 0,
            nextAction: "wait for regime and price",
            topCandidateDisplayLimit: 3,
            detailsCollapsedByDefault: true,
          },
          topWatchCandidates: [{
            id: "short-watch-63654",
            direction: "SHORT",
            actionability: "WAIT_FOR_REGIME_CONFIRMATION",
            currentPriceStatus: "WAITING_PULLBACK_TO_ENTRY",
            qualityStatus: "TARGET_TOO_CLOSE",
            entry: 63654.92,
            stopLoss: 64200,
            target1: 62900,
            netRR: 1.1,
            distanceToEntryPct: 1.49,
            priceMoveRequiredDirection: "UP_TO_ENTRY",
            occurrenceCount: 2,
            representativeStopLoss: 64200,
            stopLossRange: [64199.8, 64200.3],
            blockers: ["regime not confirmed", "price not near entry", "TARGET_TOO_CLOSE"],
            watchCondition: "รอราคาเข้าใกล้ 63654.92 และต้องเห็น regime/trend confirmation ใหม่ก่อน review",
            doNotDo: ["do not treat as entry signal", "do not activate paper/live", "do not place order"],
          }],
          nextTriggerChecklist: {
            regimeRequired: ["confirm trend regime"],
            priceRequired: ["wait for price near entry"],
            confirmationRequired: ["wait for 5m confirmation"],
            qualityRequired: ["clear target-too-close"],
            dataRequired: [],
          },
          verdict: {
            status: "WAIT_FOR_REGIME_AND_PRICE",
            summary: "Watchlist only.",
            nextAction: "wait for regime and price",
          },
        },
        entryCandidateResolution: {
          schemaVersion: 1,
          source: "ENTRY_CANDIDATE_RESOLVER_V1",
          status: "WAITING_PULLBACK",
          alignedDirection: "LONG",
          priceLocation: "ABOVE_LONG_ZONE",
          currentPrice: 101.5,
          alignedEntryZone: [99, 101],
          rrThreshold: 1.2,
          rrThresholdSource: "trendStrategy.DEFAULT_MIN_RR",
          rrScenarios: [{
            name: "ZONE_MID_ENTRY",
            available: true,
            direction: "LONG",
            entry: 100,
            stopLoss: 97,
            target: 105,
            riskDistance: 3,
            rewardDistance: 5,
            rr: 1.67,
            meetsThreshold: true,
            sources: ["trendStrategy.entryZone.mid"],
            notes: [],
          }],
          bestReviewCandidate: {
            name: "ZONE_MID_ENTRY",
            available: true,
            direction: "LONG",
            entry: 100,
            stopLoss: 97,
            target: 105,
            riskDistance: 3,
            rewardDistance: 5,
            rr: 1.67,
            meetsThreshold: true,
            sources: ["trendStrategy.entryZone.mid"],
            notes: [],
          },
          rejectedOppositeCandidates: [{
            id: "short-near",
            direction: "SHORT",
            entry: 101.5,
            stopLoss: 102,
            target1: 101,
            currentPriceStatus: "NEAR_ENTRY",
            qualityStatus: "TARGET_TOO_CLOSE",
            actionability: "COUNTER_REGIME_REJECTED",
            blockers: ["REGIME_DIRECTION_CONFLICT", "TARGET_TOO_CLOSE"],
            doNotUseAsEntry: true,
          }],
          blockers: ["CURRENT_PRICE_OUTSIDE_ALIGNED_ENTRY_ZONE", "REGIME_DIRECTION_CONFLICT"],
          nextAction: "wait for current price to enter the aligned LONG pullback zone",
          doNotDo: ["do not place or cancel orders"],
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
        },
        resolverDrivenPullbackGate: {
          schemaVersion: 1,
          source: "RESOLVER_DRIVEN_PULLBACK_GATE_V1",
          readiness: "REVIEW_NOT_ACTIVATION",
          status: "WAITING_PULLBACK",
          alignedDirection: "LONG",
          currentPrice: 105,
          zone: [99, 101],
          zoneTolerance: 0.0525,
          priceDistanceToZonePct: 3.8095,
          bestRR: 1.8,
          rrThreshold: 1.2,
          rrStatus: "PASS",
          confirmationStatus: "NOT_EVALUATED_OUTSIDE_ZONE",
          blockers: ["CURRENT_PRICE_OUTSIDE_ALIGNED_ZONE"],
          nextAction: "wait for current price to enter the aligned LONG zone",
          doNotDo: ["do not place or cancel orders"],
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
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
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.windowExactSamples, 70);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.lifetimeExactSamples, 352);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.reviewSamplesUsed, 352);
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.sampleCountMeaning, "WINDOW_FOR_RECENT_PATTERN");
  assert.equal(vm.paper.mtfEntryCandidatePipeline.zoneCandidate.reviewSampleGatePassed, true);
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
  assert.equal(vm.paper.currentPriceEligibleExactSubset.compactTopCandidates.length, 1);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.compactTopCandidates[0]?.id, "snapshot-long-clean");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.compactTopCandidates[0]?.representativeStopLoss, 99.5);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.compactTopCandidates[0]?.duplicateGroupSize, 2);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.dedupSummary.duplicateCandidates, 1);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.priceSourceAudit.priceSourceConsistent, false);
  assert.equal(vm.paper.currentPriceEligibleExactSubset.priceSourceAudit.snapshotPriceSource, "not_available_at_snapshot_build");
  assert.equal(vm.paper.currentPriceEligibleExactSubset.priceSourceAudit.previousAnalysisPriceSource, null);
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
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.status, "REGIME_NOT_CONFIRMED");
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.currentMarket.regime, "NO_TRADE");
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.watchlistSummary.cleanReviewCandidates, 0);
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.watchlistSummary.degradedWatchCandidates, 0);
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.watchlistDedupSummary.rawWatchCandidates, 1);
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.compactSummary.topCandidateDisplayLimit, 3);
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.compactSummary.detailsCollapsedByDefault, true);
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.topWatchCandidates[0]?.actionability, "WAIT_FOR_REGIME_CONFIRMATION");
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.topWatchCandidates[0]?.occurrenceCount, 2);
  assert.deepEqual(vm.paper.regimeAwareExactCandidateWatchlist.topWatchCandidates[0]?.stopLossRange, [64199.8, 64200.3]);
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.activationAllowed, false);
  assert.equal(vm.paper.entryCandidateResolution.entryResolutionStatus, "WAITING_PULLBACK");
  assert.equal(vm.paper.entryCandidateResolution.alignedDirection, "LONG");
  assert.equal(vm.paper.entryCandidateResolution.rrBest, 1.67);
  assert.equal(vm.paper.entryCandidateResolution.rrThreshold, 1.2);
  assert.equal(vm.paper.entryCandidateResolution.priceLocation, "ABOVE_LONG_ZONE");
  assert.equal(vm.paper.entryCandidateResolution.rejectedOppositeCount, 1);
  assert.equal(vm.paper.entryCandidateResolution.rrScenarios[0]?.name, "ZONE_MID_ENTRY");
  assert.equal(vm.paper.entryCandidateResolution.detailsCollapsedByDefault, true);
  assert.equal(vm.paper.entryCandidateResolution.activationAllowed, false);
  assert.equal(vm.paper.entryCandidateResolution.paperActivationAllowed, false);
  assert.equal(vm.paper.entryCandidateResolution.liveActivationAllowed, false);
  assert.equal(vm.paper.resolverDrivenPullbackGate.status, "WAITING_PULLBACK");
  assert.equal(vm.paper.resolverDrivenPullbackGate.alignedDirection, "LONG");
  assert.equal(vm.paper.resolverDrivenPullbackGate.priceDistanceToZonePct, 3.8095);
  assert.equal(vm.paper.resolverDrivenPullbackGate.bestRR, 1.8);
  assert.equal(vm.paper.resolverDrivenPullbackGate.rrThreshold, 1.2);
  assert.equal(vm.paper.resolverDrivenPullbackGate.confirmationStatus, "NOT_EVALUATED_OUTSIDE_ZONE");
  assert.equal(vm.paper.resolverDrivenPullbackGate.activationAllowed, false);
  assert.equal(vm.paper.resolverDrivenPullbackGate.paperActivationAllowed, false);
  assert.equal(vm.paper.resolverDrivenPullbackGate.liveActivationAllowed, false);
  assert.equal(vm.paper.operatorSummary.pullbackGate.pullbackGateStatus, "WAITING_PULLBACK");
  assert.equal(vm.paper.operatorSummary.pullbackGate.alignedDirection, "LONG");
  assert.equal(vm.paper.operatorSummary.pullbackGate.bestRR, 1.8);
  assert.equal(vm.paper.operatorSummary.pullbackGate.confirmationStatus, "NOT_EVALUATED_OUTSIDE_ZONE");
  assert.equal(vm.paper.operatorSummary.currentPrice, 101.5);
  assert.equal(vm.paper.operatorSummary.freshnessStatus, "FRESH");
  assert.equal(vm.paper.operatorSummary.regime, "NO_TRADE");
  assert.equal(vm.paper.operatorSummary.direction, "UNKNOWN");
  assert.equal(vm.paper.operatorSummary.confidence, 35);
  assert.equal(vm.paper.operatorSummary.reviewSamplesUsed, 75);
  assert.equal(vm.paper.operatorSummary.reviewTargetSamples, 100);
  assert.equal(vm.paper.operatorSummary.currentPriceEligibleExactSamples, null);
  assert.equal(vm.paper.operatorSummary.cleanCurrentPriceEligibleSamples, null);
  assert.equal(vm.paper.operatorSummary.watchlistStatus, "REGIME_NOT_CONFIRMED");
  assert.match(vm.paper.operatorSummary.mainBlocker, /structured exact candidate geometry missing|targetTooCloseRate/);
  assert.equal(vm.paper.operatorSummary.nextAction, "wait for regime and price");
  assert.equal(vm.paper.operatorSummary.safety.activationAllowed, false);
  assert.equal(vm.paper.operatorSummary.safety.paperActivationAllowed, false);
  assert.equal(vm.paper.operatorSummary.safety.liveActivationAllowed, false);
  assert.equal(vm.paper.operatorSummary.safety.orderAllowed, false);
});

test("operator summary explains aligned trend setup and counter-regime exact candidates", () => {
  const vm = mapToViewModel(
    {
      generatedAt: "2026-06-20T00:20:00.000Z",
      phase: "M-0B_BLOCKED",
      exchangeManualApproval: "not_approved",
      runtimeCoreFiles: {},
    },
    {
      checkedAt: "2026-06-20T00:20:00.000Z",
      paperJournal: { paperModeDetected: true, totalOrderFilled: 0, totalPaperEvents: 0, recentEvents: [] },
    },
    {
      edgeDiagnostics: { closedCycles: 0 },
      paperLoopDiagnostics: {
        mtfEntryCandidatePipeline: {
          currentPriceContext: {
            currentPrice: 63_470.1,
            latestCandleAt: "2026-06-20T00:15:00.000Z",
            freshnessStatus: "FRESH",
          },
          sampleAccounting: { reviewSamplesUsed: 369, reviewTargetSamples: 100 },
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
        },
        currentPriceEligibleExactSubset: {
          status: "CURRENT_PRICE_ELIGIBLE_DEGRADED",
          sampleAccounting: {
            lifetimeExactSamples: 369,
            windowExactSamples: 56,
            currentPriceEligibleExactSamples: 11,
            cleanCurrentPriceEligibleSamples: 0,
          },
          cleanSubsetGate: { failed: ["clean eligible candidates < 10"] },
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
        },
        canonicalMarketRegime: {
          regime: "UPTREND",
          direction: "BULLISH",
          confidence: 78,
        },
        trendStrategy: {
          status: "RISK_REJECTED",
          direction: "LONG",
          riskStatus: "NO_TRADE_BAD_RR",
          entryZone: [62_799.9334, 62_960.85],
          currentPrice: 63_470.1,
          confirmationStatus: "WAITING_5M_CONFIRM",
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          shadowOnly: true,
        },
        regimeAwareExactCandidateWatchlist: {
          status: "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES",
          currentMarket: {
            currentPrice: 63_470.1,
            freshnessStatus: "FRESH",
            regime: "UPTREND",
            direction: "BULLISH",
            confidence: 78,
          },
          watchlistSummary: { cleanReviewCandidates: 0 },
          compactSummary: {
            currentPrice: 63_470.1,
            freshnessStatus: "FRESH",
            regime: "UPTREND",
            direction: "BULLISH",
            watchlistStatus: "NO_CURRENT_PRICE_ELIGIBLE_CANDIDATES",
            cleanReviewCandidates: 0,
          },
          topWatchCandidates: [{
            id: "short-counter-regime",
            direction: "SHORT",
            actionability: "COUNTER_REGIME_REJECTED",
            currentPriceStatus: "NEAR_ENTRY",
            qualityStatus: "TARGET_TOO_CLOSE",
            blockers: ["REGIME_DIRECTION_CONFLICT", "TARGET_TOO_CLOSE"],
          }],
          verdict: {
            status: "WATCH_ONLY",
            nextAction: "wait for aligned LONG pullback and quality improvement",
          },
          activationAllowed: false,
          paperActivationAllowed: false,
          liveActivationAllowed: false,
          reviewOnly: true,
          shadowOnly: true,
        },
      },
    },
  );

  assert.equal(vm.paper.operatorSummary.regime, "UPTREND");
  assert.equal(vm.paper.operatorSummary.direction, "BULLISH");
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.status, "CURRENT_PRICE_ELIGIBLE_DEGRADED");
  assert.equal(vm.paper.regimeAwareExactCandidateWatchlist.topWatchCandidates[0]?.directionAlignment, "COUNTER_REGIME");
  assert.equal(vm.paper.operatorSummary.trendSetupDirection, "LONG");
  assert.equal(vm.paper.operatorSummary.trendSetupStatus, "RISK_REJECTED");
  assert.equal(vm.paper.operatorSummary.trendRiskStatus, "NO_TRADE_BAD_RR");
  assert.deepEqual(vm.paper.operatorSummary.trendEntryZone, [62_799.9334, 62_960.85]);
  assert.equal(vm.paper.operatorSummary.trendPriceMoveRequiredDirection, "DOWN_TO_ENTRY");
  assert.equal(vm.paper.operatorSummary.nearCandidateDirection, "SHORT");
  assert.equal(vm.paper.operatorSummary.nearCandidateDirectionAlignment, "COUNTER_REGIME");
  assert.equal(vm.paper.operatorSummary.nearCandidateQualityStatus, "TARGET_TOO_CLOSE");
  assert.match(vm.paper.operatorSummary.candidateInterpretation, /SHORT.*counter-regime.*TARGET_TOO_CLOSE/i);
  assert.equal(vm.paper.operatorSummary.currentPriceEligibleExactSamples, 11);
  assert.equal(vm.paper.operatorSummary.cleanCurrentPriceEligibleSamples, 0);
  assert.equal(vm.paper.operatorSummary.safety.activationAllowed, false);
  assert.equal(vm.paper.operatorSummary.safety.paperActivationAllowed, false);
  assert.equal(vm.paper.operatorSummary.safety.liveActivationAllowed, false);
  assert.equal(vm.paper.operatorSummary.safety.orderAllowed, false);
});
