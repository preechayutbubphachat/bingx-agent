# MASTER ROADMAP - Autonomous BTCUSDT Bot Without Scope Drift

Current checkpoint:

- G1 plan released at `91f9953`
- G1 implementation not started
- D8.5 remains HOLD
- Continuation branch not approved
- Activation/order/execution forbidden

## 1. North Star

Final goal:

Autonomous BTCUSDT futures bot.

Current goal:

Validate the algorithm first.

The project must not expand unless the task directly improves one of these gates:

1. candidate generation
2. grid/trend regime routing
3. replay validation
4. paper evidence quality
5. cost/risk validation
6. paper automation readiness
7. supervised live readiness
8. autonomous readiness

## 2. Locked Mindset

No evidence = no activation.

No replay = no algorithm conclusion.

No data quality = no edge conclusion.

Old grid epoch = audit only.

Current market = source of truth.

Fresh candidate = evaluated from current market only.

Every future task must answer:

Does this move the bot closer to validated autonomous trading?

If not, do not do it.

## 3. Locked Safety Flags

```text
activationAllowed = false
paperActivationAllowed = false
liveActivationAllowed = false
reviewOnly = true
shadowOnly = true
```

Forbidden before later approval:

- no live order placement
- no paper/live activation
- no broker/order/execution route changes
- no private exchange execution API
- no leverage/margin change
- no force SELL
- no force close old exposure
- no D8.5 until review-candidate population exists
- no continuation branch until replay proves pullback-only bottleneck
- no generated replay pack committed
- no `.env`/secrets/API keys/`config/db.php`
- no `git add .`

## 4. API Policy

### Stage 1 - Algorithm Validation

Allowed:

- read-only market data
- historical candles
- funding rate
- open interest
- spread/orderbook diagnostics
- local replay input
- server-to-local mirror pull

Forbidden:

- create order
- cancel order
- position modification
- leverage/margin modification
- private execution API
- API keys in repo
- server writeback from local research node

### Stage 2 - Paper Automation

Allowed:

- paper-only decisions
- paper-only fills
- paper-only PnL
- simulated fees/slippage/funding

Still forbidden:

- real exchange orders

### Stage 3 - Supervised Live Readiness

Allowed only after approval:

- private API integration plan
- signature/time-sync tests
- read account state
- restricted supervised dry-run integration

### Stage 4 - Autonomous Bot

Allowed only after all evidence gates pass:

- limited-size autonomous execution
- kill switch active
- risk caps active
- monitoring active
- rollback active
- audit logs active

## 5. Strategy Router

All strategy decisions must follow this order:

1. data freshness and data quality
2. market regime
3. strategy path
4. candidate construction
5. cost gate
6. risk gate
7. replay/paper evidence gate
8. activation readiness gate

Regime routing:

```text
RANGE / VOLATILITY_COMPRESSION / NEUTRAL
-> Grid Review Path

UPTREND / DOWNTREND
-> Trend Review Path

HIGH_VOL / EVENT_RISK / STALE_DATA / UNKNOWN
-> No-Trade / Monitor
```

No path may bypass data quality, cost, risk, and replay evidence.

## 6. Active Work Order

Do not reorder without explicit approval.

### Priority 1: G1 - Grid Epoch Context and Fresh Grid Candidate Review Implementation

Expected files:

- `dashboard/lib/grid/gridEpochContext.ts`
- `dashboard/lib/grid/gridEpochContext.test.ts`

Goal:

Separate old grid epoch audit from current grid eligibility.

Required behavior:

- `oldGridEpoch` does not block `currentGridEligibility`
- old bounds are not reused
- old exposure is not counted as edge
- fresh grid candidate is diagnostics-only
- all outputs remain review-only/shadow-only

### Priority 2: DQ-A Implementation Plan and Implementation

Goal:

Make paper evidence measurable.

Must repair diagnostics for:

- `averageFillPrice`
- closed-cycle pairing visibility
- `gridSpacingPct`
- mode/regime/session tags
- normalized no-trade reasons
- `latest_decision` freshness warning separation
- `PaperEvidenceDataQualityV1`

### Priority 3: L6 Local Replay Input Pack Build

Required output:

- `manifest.json`
- `candles_5m.jsonl`
- `candles_15m.jsonl`
- `candles_1h.jsonl`
- `d8_snapshots.jsonl` if available
- `source_file_inventory.json`
- `data_quality_report.json`

Only `USABLE_FOR_REPLAY` proceeds to L7.

### Priority 4: L7 One-Shot Local Replay

Measure funnel:

- evaluation points
- aligned context
- D8.0 candidate
- RR ready
- trigger reached
- zone touched
- confirmation active
- confirmation aligned
- promotable review candidate

### Priority 5: Decision Review

Only after G1 + DQ-A + L7:

- tune grid
- tune trend
- collect more data
- or plan paper automation

## 7. Grid Path

Grid candidate review may be produced only when:

- current data is fresh
- current price exists
- regime is `RANGE` or `VOLATILITY_COMPRESSION`/`NEUTRAL`
- trend is not violently directional
- ATR/BBW show enough oscillation
- cost gate can be evaluated
- spread/slippage/funding risk is not dominant

Grid review must be blocked when:

- strong `UPTREND`/`DOWNTREND`
- `HIGH_VOL` / `EVENT_RISK`
- stale source-of-truth
- missing current price
- missing `gridSpacingPct`/cost data
- spacing smaller than required cost threshold

Cost gate:

```text
requiredMinSpacingPct = roundTripCostPct * 2.5
costGatePass = candidateGridSpacingPct >= requiredMinSpacingPct
```

If `gridSpacingPct` is missing:

```text
currentGridEligibility = DATA_QUALITY_BLOCKED
not strategy failure
```

Old epoch rule:

```text
oldGridEpoch != currentGridEligibility
```

Old epoch policy:

- `DO_NOT_FORCE_SELL`
- `DO_NOT_COUNT_AS_EDGE`
- `DO_NOT_USE_FOR_NEW_GRID_RANGE`
- `KEEP_FOR_AUDIT_ONLY`

## 8. Trend Path

Trend path remains D8-based.

Trend candidate must pass:

- confirmed current regime direction
- valid entry zone
- RR threshold
- trigger/touch evidence
- confirmation window
- review-only promotion

D8.5 remains locked until there is a review-candidate population.

Continuation remains locked until L7 replay proves pullback-only is the dominant bottleneck.

## 9. Data Quality Gates

No algorithm edge conclusion if these are missing:

- `averageFillPrice`
- closed round-trip pairing
- `gridSpacingPct`
- mode tags
- regime tags
- session tags
- cost estimates
- normalized no-trade reasons
- fresh current price propagation

Data quality states:

- `NO_DATA`
- `INSUFFICIENT`
- `PARTIAL`
- `REVIEW_READY`

Only `REVIEW_READY` may support edge conclusions.

## 10. Replay Gates

Replay must be:

- point-in-time
- local-only
- read-only
- no runtime writes
- no server writes
- no order placement
- no paper/live activation

Minimum usable replay target:

```text
USABLE_SAMPLE >= 500 evaluation points
```

If below threshold:

```text
recommendedNextResearch = COLLECT_MORE_HISTORY
```

## 11. Paper Automation Gates

Paper automation can be considered only after:

- G1 implemented
- DQ-A implemented
- L7 replay completed
- candidate generation exists
- cost gate measurable
- paper data quality at least `PARTIAL`
- old epoch no longer contaminates current eligibility

Paper automation is still not live trading.

## 12. Supervised Live Readiness Gates

Supervised live readiness can be considered only after paper automation shows:

- net expectancy > 0 after fees/slippage/funding
- profit factor > 1.1
- max drawdown within approved limit
- minimum sample satisfied
- no unknown failure dominance
- kill switch tested
- monitoring tested
- API signing/time sync tested
- position sizing tested

## 13. Autonomous Readiness Gates

Autonomous trading requires:

- algorithm evidence passed
- paper evidence passed
- execution evidence passed
- risk controls passed
- kill switch passed
- monitoring passed
- rollback passed
- operator explicitly approved autonomous release

Fallback to no-trade on:

- stale market data
- unknown regime
- missing cost data
- API time drift
- signature failure
- spread/slippage spike
- funding risk spike
- drawdown breach
- order mismatch
- position mismatch
- runtime audit critical

## 14. Codex Workflow Rules

Every task must:

1. read this master roadmap first
2. state which roadmap gate the task moves
3. keep scope narrow
4. write RED tests before GREEN implementation when code changes
5. use additive diagnostics only unless explicitly approved
6. avoid activation/order/execution/API unless roadmap stage allows it
7. run validation
8. run safety scan
9. stage explicitly only approved files
10. never use `git add .`

Required report:

1. roadmap gate moved
2. files changed
3. tests run
4. typecheck result
5. build result
6. safety scan result
7. files staged
8. commit hash if released
9. confirmation no unrelated files touched
10. confirmation D8.5 / continuation / activation status

## 15. Standard Validation

For dashboard code changes:

```powershell
cd dashboard
node --test --experimental-strip-types lib/grid/gridEpochContext.test.ts
node --test --experimental-strip-types lib/paper/paperLoopDiagnostics.test.ts
node --test --experimental-strip-types lib/trading-agent-hq/adapter.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Safety scans:

- unfinished-marker scan
- trailing whitespace
- `.env` / secrets / `config/db.php`
- order/execution/broker/API route changes
- generated replay packs
- runtime JSON/JSONL
- `git add .`

## 16. Anti-Drift Rules

Do not allow:

- more diagnostics without decision impact
- new strategy branches before replay
- old grid blocker as permanent excuse
- UI expansion without algorithm evidence
- paper/live activation before data quality
- D8.5 before candidate population
- continuation before pullback bottleneck proof
- private API execution before supervised live stage

## 17. Next Immediate Task

After this master file is committed, next task:

G1 - Grid Epoch Context and Fresh Grid Candidate Review Implementation

Expected implementation files:

- `dashboard/lib/grid/gridEpochContext.ts`
- `dashboard/lib/grid/gridEpochContext.test.ts`

Allowed secondary files only if needed:

- `dashboard/lib/paper/paperLoopDiagnostics.ts`
- `dashboard/lib/paper/paperLoopDiagnostics.test.ts`
- `dashboard/lib/trading-agent-hq/adapter.ts`
- `dashboard/lib/trading-agent-hq/adapter.test.ts`
- existing Grid/Paper UI component

Strictly forbidden:

- order/execution/API/env/config
- D8.5
- continuation branch
- generated replay pack
- server upload/writeback
- paper/live activation

## 18. Final Rule

The project reaches autonomous trading by closing gates, not by adding more ideas.

Gate order:

```text
G1 -> DQ-A -> L6 -> L7 -> Decision Review -> Paper Automation -> Supervised Live -> Autonomous
```

Do not skip gates.

Do not reorder gates.

Do not let old data block current evaluation.

Do not activate before evidence.
