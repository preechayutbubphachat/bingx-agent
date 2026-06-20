# D7.10 Operator Rail Final Compact QA

## Scope

D7.10 keeps the MTF exact-candidate pipeline diagnostics-only. It does not change entry logic, runner behavior, broker/execution behavior, runtime JSON/JSONL output, or exchange connectivity.

## Compact Candidate Dedup

`currentPriceEligibleExactSubset.topCandidates` remains the detailed reviewed list. `compactTopCandidates` is now a display-focused clustered list with a maximum of 3 items.

The compact cluster key uses:

- direction
- rounded entry
- rounded target1
- current price status
- quality status
- zone family
- readiness
- stop-loss compatibility within 1 USDT

Each compact candidate exposes:

- `occurrenceCount`
- `representativeStopLoss`
- `stopLossRange`
- `duplicateGroupSize`

This keeps near-duplicate candidates readable without hiding the raw candidate detail list.

## Operator Summary

The right rail now starts with a compact Operator Summary card:

- Current Price and Freshness
- Regime / Direction / Confidence
- review progress sample count
- window samples as latest pattern context
- current-price eligible count
- clean candidate count
- watchlist status
- main blocker
- next action
- read-only safety labels

Technical details remain available but are collapsed by default:

- รายละเอียด candidate / MTF exact diagnostics
- ข้อมูล debug / raw และ RR diagnostics

## Safety

The UI remains read-only and review-only:

- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`
- `reviewOnly=true`
- `shadowOnly=true`

The operator copy explicitly says:

- ยังไม่ใช่สัญญาณเข้าไม้
- ไม่ส่ง Order / ไม่ Activation
- snapshot price = previous context
- current-price eligible = ใช้กับราคาตอนนี้
