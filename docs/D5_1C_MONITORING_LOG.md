# D5.1-c — Runtime Monitoring Log & Evidence Gate

> Docs-only monitoring note. No git, no commit, no deploy, no runtime JSON/JSONL edits, no trading-logic change.
> M-0B BLOCKED · Phase 2-B BLOCKED · live/order/exchange OFF. Generated 2026-06-14.
> Deployed HEAD = origin/main = `27b559bf06e1e054a8b58d7000382415216e0540`. Codex paused.

## Current status (single snapshot)
`status=PARTIAL · totalResolvable=10 · filled=0 · missed=10 · invalidationFirst=0 · missedFillRate=1.0`
`geometryReadyCount=14 · exactSamples=112 · regime=DOWNTREND · priceVsGrid=BELOW_GRID · dynamicGrid=PAUSE_EXPOSURE_LIMIT · closedCycles=0 · trendClosedTrades=0`

**Gate result:** `totalResolvable (10) < 30` → **stay docs-only**. Classification unchanged: `D5_1C_DOCS_ONLY_WAIT_MORE_SAMPLE` + `WAIT_FOR_RUNTIME_EVIDENCE`.

## 1. Collector (confirmed paths — `GET /api/paper-performance`, every ~15 min × 12)

All fields verified present in the working tree:
- `paperLoopDiagnostics.regime` ✓
- `paperLoopDiagnostics.canonicalMarketRegime.regime` ✓
- `paperLoopDiagnostics.priceVsGrid` ✓
- `paperLoopDiagnostics.dynamicGrid.status` ✓ (paperLoopDiagnostics.ts:91)
- `paperLoopDiagnostics.trendEvidenceDecisionSummary.exactZoneComparisonSummary.fillResolution.*` ✓
- `...exactZoneComparisonSummary.fillResolutionGeometryReadyCount`, `.exactSamples` ✓

```bash
BASE="http://localhost:3000"
S=".paperLoopDiagnostics"
F="$S.trendEvidenceDecisionSummary.exactZoneComparisonSummary"
curl -s "$BASE/api/paper-performance" | jq "{
  checkedAt:         (now|todate),
  regime:            $S.regime,
  canonicalRegime:   $S.canonicalMarketRegime.regime,
  priceVsGrid:       $S.priceVsGrid,
  dynamicGridStatus: $S.dynamicGrid.status,
  fillStatus:        $F.fillResolution.status,
  totalResolvable:   $F.fillResolution.totalResolvable,
  filled:            $F.fillResolution.filled,
  missed:            $F.fillResolution.missed,
  invalidationFirst: $F.fillResolution.invalidationFirst,
  missedFillRate:    $F.fillResolution.missedFillRate,
  geometryReadyCount:$F.fillResolutionGeometryReadyCount,
  exactSamples:      $F.exactSamples,
  closedCycles:      $S.dynamicGrid.closedCycles // .edgeDiagnostics.closedCycles // 0,
  trendClosedTrades: .trendClosedTrades
}"
```
Append one line per cycle to your own local log file (operator-side; not a repo runtime file).

## 2. Regime-split analysis framework (fill in as samples arrive)

| canonicalRegime | priceVsGrid | dynamicGridStatus | n (resolved) | missed | missedFillRate |
|---|---|---|---|---|---|
| DOWNTREND | BELOW_GRID | PAUSE_EXPOSURE_LIMIT | 10 | 10 | 1.00 |
| RANGE | INSIDE_GRID | (active) | — | — | — |
| UPTREND | … | … | — | — | — |

**Focus question:** does `missedFillRate` stay ~1.0 when `canonicalRegime=RANGE` **and** `priceVsGrid=INSIDE_GRID` **and** `dynamicGrid != PAUSE_EXPOSURE_LIMIT`?
- If it **drops** in that row → the 100% miss was a **DOWNTREND/below-grid artifact** (zones above price, never revisited). Geometry may be fine for its intended regime.
- If it **stays high** across RANGE/inside-grid too → **cross-regime reachability problem** with the exact zones — a real signal worth the D5.1-c gate + a DOWNGRADE.

## 3. Decision gate (state machine for the implementation question)

```
totalResolvable < 30                                   → D5_1C_DOCS_ONLY_WAIT_MORE_SAMPLE   (current)
totalResolvable >= 30 & distinctRegimes == 1           → D5_1C_SINGLE_REGIME_SAMPLE          (still docs-only)
totalResolvable >= 30 & regimes >= 2 & no RANGE subset → D5_1C_MISSING_RANGE_SUBSET          (still docs-only)
totalResolvable >= 30 & regimes >= 2 & RANGE subset    → evaluate D5_1C UI state machine     → UI_CLARITY_PATCH_READY / FULL_GATE_READY
```

## 4. Trading-logic eligibility (re-checked, unchanged — all BLOCKED)
entry · stop/target · reward_risk_min · OB/FVG execution · adaptive RR · grid/regrid · live/order/exchange → **all BLOCKED**. Drivers unchanged: `closedCycles=0`, `trendClosedTrades=0`, `dynamicGrid=PAUSE_EXPOSURE_LIMIT`, `trendStrategy=RISK_REJECTED`, M-0B / Phase 2-B blocked, all activation flags false. The only effect any fill-quality data could have is to **lower** confidence, never to unlock.

## 5. Verdict
- **D5.1-c classification:** `D5_1C_DOCS_ONLY_WAIT_MORE_SAMPLE` + `WAIT_FOR_RUNTIME_EVIDENCE`.
- **missedFillRate=1.0 — artifact or cross-regime?** **UNDETERMINED** on a single DOWNTREND/BELOW_GRID sample of 10. Most likely a regime artifact (entries above price in a downtrend), but unprovable until RANGE/inside-grid samples exist. Do not conclude either way yet.
- **Codex now:** nothing (correctly paused). No patch — `HIGH_MISSED_FILL_RATE` warningFlag already surfaces the signal.
- **UI caveat-only patch:** still *optional, low value now*. Justified only if the operator finds the bare `HIGH_MISSED_FILL_RATE` flag misleading at n=10; otherwise wait and ship the full state machine once the gate clears.
- **Next runtime fields needed:** the 14 collector fields above, **stratified by `canonicalRegime` × `priceVsGrid` × `dynamicGrid.status`** — especially at least one RANGE / INSIDE_GRID / non-paused row.
- **Recommendation:** continue evidence collection for 12 cycles (~3h); re-run §3 gate. Hold D5.1-c docs-only. Keep all trade paths OFF.
