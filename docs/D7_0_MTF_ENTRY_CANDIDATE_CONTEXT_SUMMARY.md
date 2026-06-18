# D7.0 MTF Entry Candidate Context Summary

## 1. Current Stage

Project is in Phase M-0Z-6 Paper Execution Live + Evidence Accumulation, with Dynamic Regrid Phase 2-A as a read-only/paper-only overlay. Trend evidence T-3H-6-c through D5.5 already exposes MTF OB/FVG shadow, exact-zone comparison, shadow outcome, no-trade explanation, and review-readiness score.

## 2. Current Blockers

- Phase M-0B remains BLOCKED.
- `activationAllowed=false`, `paperActivationAllowed=false`, and `liveActivationAllowed=false` remain required.
- Exact-zone sample count is still below review target: about 75/100.
- TARGET_TOO_CLOSE dominates the exact-zone readiness breakdown.
- Fill resolution is partial and missed-fill rate is high.
- After entry touch, target-after-touch is not proven to beat invalidation-after-touch.

## 3. Existing Exact Zone Evidence

Exact-zone comparison is already summarized under trend evidence diagnostics. Current known runtime is roughly:

- exactSamples ~= 75
- exactAvgNetRR ~= 6.19
- heuristicAvgNetRR ~= 1.71
- exactVsHeuristicDelta ~= +4.87
- dominant exact status = EXACT_ZONE_CONFLICT
- dominant exact readiness = TARGET_TOO_CLOSE
- TARGET_TOO_CLOSE count ~= 50
- fill status = PARTIAL

This means the RR geometry looks promising, but the aggregate zone-readiness and fill/outcome evidence are not ready.

## 4. Existing Shadow Outcome Evidence

Shadow outcome already reports counterfactual reachability, not real trades. Current known runtime is roughly:

- entryTouched ~= 21
- missedFillRate high
- targetAfterEntryTouchRate = 0
- invalidationAfterEntryTouchRate high

This blocks review-ready classification even when exact-zone RR is better than heuristic RR.

## 5. Existing No-Trade / Review Readiness Evidence

No-trade analysis and review-readiness score already explain why the system remains blocked. These diagnostics are review-only and must not unlock runner, gate, paper, live, or order paths.

## 6. What D7.0 Will Add

D7.0 adds a central `mtfEntryCandidatePipeline` object that combines existing diagnostics into one operator-readable candidate view:

- HTF bias
- exact-zone quality
- LTF trigger/outcome review
- geometry readiness
- RR quality
- blockers
- next action
- review verdict

## 7. What D7.0 Must NOT Change

D7.0 must not change entry logic, stop/target logic, runner decisions, grid/regrid behavior, paper execution behavior, live behavior, order placement, approval flow, runtime files, secrets, or activation gates.

D7.0 is analysis only: review-only, shadow-only, no activation, no live, no order.
