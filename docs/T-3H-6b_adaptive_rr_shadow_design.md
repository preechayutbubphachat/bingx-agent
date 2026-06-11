# T-3H-6-b - RR Blocker Drilldown + Adaptive RR Shadow Design

Status: 2026-06-11

- RR blocker drilldown for the latest setup: IMPLEMENTED as read-only observability.
- RR history and Adaptive RR: DESIGN ONLY.
- No trading decision, threshold, entry, exit, paper execution, live execution, or order path is changed by this phase.

## Current Data Audit

| Field | Status | Source |
|---|---:|---|
| entry / stopLoss / takeProfit1 | Available | `trendPaperExecutionPreflight`, with strategy invalidation/target fallback |
| rawRR | Available | `trendStrategy.rewardRisk` or `trendPaperExecutionPreflight.rewardRisk` |
| requiredRR | Newly exposed read-only | `TREND_PAPER_MIN_REWARD_RISK` -> `trendPaperConfigPublic.minRewardRisk` |
| feePct / slippagePct | Newly exposed read-only | server env -> `trendPaperConfigPublic` |
| riskDistance / rewardDistance | Derived | pure helper only |
| ADX / ATR / ATR% / BBW | Available elsewhere | regime evidence; not used to alter decisions |
| spread estimate | Missing | not in this pipeline |
| RR history per cycle | Missing | current decision log stores reason names, not RR numeric snapshots |

## T-3H-6-b1 Optional RR Snapshot Logging

Future optional field, non-breaking and observability-only:

```json
"rrSnapshot": {
  "rawRR": 1.04,
  "requiredRR": 1.2,
  "rrGap": 0.16,
  "riskDistance": 950.5,
  "rewardDistance": 988.2,
  "riskStatus": "PASS",
  "distanceToEntryZonePct": 0.4
}
```

Rules:

- Add only after the existing T-3H-6-a state-write hook, not inside runner decision logic.
- The field is optional; older records without `rrSnapshot` remain valid.
- Aggregators must skip missing or malformed snapshots.
- The snapshot must never be read back into the entry decision path.
- The snapshot must not change `reward_risk_min` or `TREND_PAPER_MIN_REWARD_RISK`.
- No write route, threshold editor, live control, or order control is implied.

## Adaptive RR Shadow Evaluator Design

The shadow evaluator may compute a `dynamicRR` next to the current static threshold for comparison only.

Static entry logic must continue to use the configured `minRewardRisk` until a separate reviewed activation phase exists.

Suggested shadow output:

```json
{
  "dynamicRR": 1.15,
  "staticRR": 1.2,
  "rawRR": 1.18,
  "wouldPassDynamicRR": true,
  "staticPass": false,
  "disagreement": true
}
```

Suggested future inputs:

- ADX: strong trend may lower required RR slightly in shadow only; weak trend may raise it.
- ATR% rank: very low or very high volatility may raise required RR.
- BBW: squeeze or expansion state may affect the shadow threshold.
- Regime: range-like conditions may raise required RR.
- Session/liquidity: low-liquidity windows may raise required RR.
- Cost: shadow threshold must account for fee/slippage so net RR stays acceptable.

Hard guardrails for any future activation:

- sample >= 100 qualifying setup cycles
- out-of-sample review
- operator review
- paper-only controlled activation first
- separate env/config gate
- no live/order/exchange implication

## Safety Invariants

- RR drilldown is display-only.
- Adaptive RR remains design-only.
- No helper from this phase may be imported by strategy, gate, preflight, runner, execution engine, broker, journal writer, session writer, or state writer.
- No UI can mutate thresholds or config.
- No live trading, exchange order, or M-0B unlock is implied.
