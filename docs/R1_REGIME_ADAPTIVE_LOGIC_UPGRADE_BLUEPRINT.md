# R-1 Regime-Adaptive Logic Upgrade Blueprint
**Date**: 2026-06-13  
**Phase**: M-0Z-6 Paper Simulation — Design/Research Only  
**Classification**: `R1_DESIGN_ONLY_CONTINUE_EVIDENCE`  
**Author**: Claude cowork (design only — no trading logic changed)

---

## ⚠️ Safety Header — Read Before Everything

This document is **design/research only**. Nothing in this document activates trading, modifies logic, or changes evidence gates.

**NEVER implement until ALL of the following are true:**
- closedCycles ≥ 30 (currently: 0)
- Operator independent review completed
- EXCHANGE_MANUAL_APPROVAL = approved
- OOS / walk-forward review passed
- Cost gate stable across ≥ 10 recent snapshots
- Missed-fill analysis resolved

**Hard constraints that never change regardless of design:**
- No live trading / order placement / exchange approval
- No `reward_risk_min` or `TREND_PAPER_MIN_REWARD_RISK` changes
- No entry/detector threshold changes
- No adaptive RR activation
- No OB/FVG execution activation
- M-0B remains BLOCKED
- Phase 2-B remains BLOCKED
- All activation flags remain false

---

## 0) Current State Summary (Context for Blueprint)

| Field | Current Value |
|-------|--------------|
| Phase | M-0Z-6 Paper Simulation |
| priceVsGrid | BELOW_GRID |
| paperLoopState | REGRID_REQUIRED |
| cumulative BUY | ≈ 1,460 (stable — guardrail stopped accumulation) |
| cumulative SELL | 0 |
| closedCycles | 0 |
| old exposure policy | QUARANTINE (no force-close) |
| activationAllowed | false |
| canonicalRegime | Shadow diagnostics only |
| OBS-B, OBS-C | Implemented (read-only) |
| T-3H-6-d5 exact zones | INFORMATIONAL — sample tier: NO_DATA / LT_50 |
| M-0B | BLOCKED |

**Implication for blueprint**: All upgrade designs in this document are forward-looking. Current system has zero closed cycles and one-sided BUY exposure. Any regime logic upgrade must wait until the evidence baseline exists.

---

## 1) Regime Upgrade Matrix

> Rows = 7 canonical market regimes  
> Columns = current behavior → vulnerability → recommended upgrade → evidence gates → guardrails → read-only constraints → phase name → Codex difficulty

---

### 1.1 Sideway / Range (canonical: RANGE)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | Neutral grid allowed when market_mode = GRID_NEUTRAL. canonicalRegime = RANGE is shadow-only. Spacing not validated against round-trip cost at regime level. No range-quality confidence gate. |
| **Main vulnerability** | Grid may activate in low-confidence range (ADX rising, range decaying). Spacing may be too tight → fee grind → net negative expectancy. No inventory cap enforced by regime layer. |
| **Recommended future logic** | Neutral grid allowed ONLY when: (1) range confidence ≥ 65, (2) spacingPct > roundTripCostPct × 1.5, (3) buyFillCount:sellFillCount imbalance within 3:1, (4) range freshness confirmed (latest candle at by TF all within 30min), (5) grid mid within ±0.5% of price at regrid time |
| **Required evidence before implementation** | ≥ 30 closed cycles in RANGE regime. Cost gate stable for ≥ 10 snapshots. Missed-fill analysis: range mid deviation < 0.3% in historical records. Operator review. |
| **Safety guardrails** | If range confidence drops below 50 during active grid: PAUSE_OUT_OF_RANGE (no immediate close). Inventory cap enforced: if buyFillCount > sellFillCount × 3 → block new BUY. |
| **What must remain read-only** | canonicalRegime engine, confidence score computation, spacing calculation. No direct write to gridSpacingPct from regime logic. |
| **Suggested phase name** | R-1A: Range Quality Gate |
| **Codex difficulty** | Medium — requires regime-to-grid-param linkage; no execution path change |

---

### 1.2 Uptrend (canonical: UPTREND)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | Grid continues as neutral regardless of uptrend signal. canonicalRegime = UPTREND is shadow-only. TrendStrategy is shadow-only. Old exposure remains quarantined. No bias toward long-weighted grid. |
| **Main vulnerability** | Neutral grid in uptrend accumulates BUY fills that may not cycle back through SELL → closed cycle never forms. Miss the directional move while being inventory-neutral. Or worse: SELL orders fill near pullback low → wrong-side fills. |
| **Recommended future logic** | In UPTREND: (1) neutral full grid blocked unless confidence low → no-trade, (2) trend pullback logic (TrendStrategy) considered: entry only after confirmed pullback zone + risk pass + confirmation candle, (3) no new BUY orders above 70% of grid upper bound ("chasing near target" guard), (4) if entering trend mode: reduce grid density, bias upper half only |
| **Required evidence before implementation** | TrendStrategy: ≥ 30 closed trend trades in paper simulation. Exact-zone samples ≥ 100 (REVIEW_ELIGIBLE per T-3H-6-d5 tiers). OOS walk-forward required. Old quarantined exposure resolved or fully aged out (epoch closed). Operator review + Phase 2-B gate complete. |
| **Safety guardrails** | No trend entry without confirmation candle. No entry near T1/T2 target (within 0.5% distance). TrendStrategy remains paper-only until explicit operator unlock. |
| **What must remain read-only** | entry zone calculation, reward_risk_min, trendPaperExecutionPreflight gate, liveActivationAllowed must stay false |
| **Suggested phase name** | R-1B: Trend-Aware Grid Bias (design only until T-3H evidence sufficient) |
| **Codex difficulty** | Hard — requires TrendStrategy gate integration into grid mode decision; many evidence preconditions |

---

### 1.3 Downtrend (canonical: DOWNTREND)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | Grid continues as neutral. BUY guardrail fires when price is BELOW_GRID but this is position-based not regime-based. No short-bias logic. Old long exposure quarantined. |
| **Main vulnerability** | Neutral BUY grid in downtrend: fills accumulate on the way down with no SELL counterpart → inventory one-sided BUY into a declining market. No forced close but exposure compounds. |
| **Recommended future logic** | In DOWNTREND: (1) new neutral grid blocked (no-trade default), (2) if existing grid is active: reduce to monitoring-only, no new BUY orders, (3) old long exposure remains quarantined — NOT force-closed, (4) short-biased grid possible ONLY after explicit operator approval + Phase 2-B gate + separate short paper evidence, (5) no "buy the dip" logic without regime shift back to RANGE/UPTREND confirmed |
| **Required evidence before implementation** | Downtrend paper cycles: ≥ 30 closed cycles observed in DOWNTREND regime. Short-grid requires separate approval track. Force-close logic requires explicit operator decision per epoch. |
| **Safety guardrails** | Hard block: no new BUY when canonicalRegime = DOWNTREND and confidence ≥ 70. Old exposure policy = QUARANTINE remains immutable unless operator unlocks explicitly. No auto short activation. |
| **What must remain read-only** | oldExposurePolicy, force-close logic, short order path |
| **Suggested phase name** | R-1C: Downtrend No-Trade Guard (regime-side block only, no execution change) |
| **Codex difficulty** | Low-Medium — mostly adding regime check to block new grid activation; no execution change |

---

### 1.4 High Volatility (canonical: VOLATILITY_EXPANSION)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | Grid continues regardless of ATR/BBW spike. volBaselineDiagnostic (OBS-02) shows vol state but doesn't gate grid activation. No size reduction triggered by regime. No cooldown enforced. |
| **Main vulnerability** | During volatility expansion: (1) fill prices may deviate significantly from order price → slippage exceeds estimates, (2) funding rates may spike, (3) grid spacing too tight → fills on wrong side, (4) potential for runaway regrid storm (multiple candidates within short window) |
| **Recommended future logic** | In VOLATILITY_EXPANSION: (1) reduce position size by 50% or pause grid, (2) widen grid spacing by ATR multiplier (e.g., spacing ≥ 2× ATR_pct), (3) increase slippage buffer in cost gate (e.g., ×1.5), (4) check funding rate before any regrid: if funding elevated → block, (5) enforce cooldown: no regrid within 4 hours of volatility spike, (6) require vol baseline samples ≥ requiredBaselineSamples before vol state is trusted |
| **Required evidence before implementation** | Vol baseline ≥ 50 samples (currently 24/50). ATR ratio history across ≥ 30 sessions. Cost gate behavior verified across vol expansion periods. Operator review. |
| **Safety guardrails** | Hard block: if ATR ratio > 2.0 and vol_state = VOLATILITY_EXPANSION → HARD_PAUSE, no new orders. Funding rate > 0.1%/8h → block any new order. |
| **What must remain read-only** | slippage estimate calculation, ATR computation, vol baseline engine |
| **Suggested phase name** | R-1D: Vol Expansion Pause Guard |
| **Codex difficulty** | Medium — ATR/funding checks can be added as pre-execution gate; no execution path change |

---

### 1.5 Low Volatility (canonical: VOLATILITY_COMPRESSION)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | Grid allowed. No check that spacing exceeds costs in low-vol environment. No detection of pre-breakout compression. Fee-grind risk unmitigated. |
| **Main vulnerability** | Low volatility → tight price range → (1) fills happen but profit per cycle ≈ fee+slippage → net negative, (2) BBW compression often precedes breakout → grid placed near breakout becomes one-sided instantly |
| **Recommended future logic** | In VOLATILITY_COMPRESSION: (1) require spacingPct ≥ roundTripCostPct × 2.0 (stricter than normal 1.5×), (2) detect Bollinger Band compression signal: if BBW < BBW_mean × 0.5 → warn + reduce size, (3) add "pre-breakout risk" label to UI, (4) do not open new grid when BBW percentile < 10th percentile of baseline |
| **Required evidence before implementation** | BBW baseline ≥ 50 samples. Cost gate history showing fee-grind patterns in low-vol periods. Vol baseline complete. |
| **Safety guardrails** | Soft block: if BBW < compression threshold → warning + reduce grid size to 50%. Hard block not required unless breakout imminent (reserve for HIGH_VOL phase). |
| **What must remain read-only** | BBW calculation, spacing computation, cost gate logic |
| **Suggested phase name** | R-1E: Low Vol Spacing Guard + Breakout Warning |
| **Codex difficulty** | Low-Medium — BBW threshold check + spacing enforcement; no execution path change |

---

### 1.6 Event Risk (canonical: EVENT_RISK)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | Grid may be active during event risk. `news_context.json` provides context but doesn't currently gate grid activation at the paper-loop level. |
| **Main vulnerability** | During CPI/FOMC/ETF events: (1) price spikes invalidate grid bounds instantly, (2) funding rates can spike dramatically, (3) spread widens → fill quality degrades, (4) momentum-based volatility can trigger regrid storm |
| **Recommended future logic** | In EVENT_RISK: (1) hard no-trade policy: no new grid activation, no new orders, (2) if existing grid active → monitoring-only mode (no new fills attempted), (3) funding/news risk warning surfaced prominently in dashboard, (4) cooldown after event: 2 hours minimum before any regrid consideration, (5) news_context.json checked before every paper loop cycle |
| **Required evidence before implementation** | news_context.json integration already exists at route level (readLatest). Implementation is mostly policy enforcement, not evidence-gated. |
| **Safety guardrails** | Hard block: if news_context shows high-impact event within ±4 hours → block all grid activation. Funding spike > 0.05%/8h concurrent with event → extend block to 8 hours. |
| **What must remain read-only** | news_context reader, funding rate reader |
| **Suggested phase name** | R-1F: Event Risk No-Trade Policy |
| **Codex difficulty** | Low — news context already loaded; add check to paper-loop gate |

---

### 1.7 Unknown / Data Gap (canonical: UNKNOWN)

| Dimension | Detail |
|-----------|--------|
| **Current behavior** | If canonical regime = UNKNOWN, grid continues from previous state. No explicit fail-closed logic at regime layer. volBaselineDiagnostic may show BUILDING/INSUFFICIENT but doesn't block grid. |
| **Main vulnerability** | Trading with unknown regime = trading blind. Vol baseline insufficient → vol_state unreliable. Source freshness stale → indicators outdated. Any trade decision during data gap is noise, not signal. |
| **Recommended future logic** | In UNKNOWN / DATA_GAP: (1) fail closed — no new grid activation, (2) if vol baseline INSUFFICIENT → block any activation, (3) if source freshness STALE (any TF candle > 30min old) → block, (4) if indicatorEvidence.candleCount < minimum threshold → block, (5) wait for: baseline ≥ requiredBaselineSamples, freshness = fresh, evidenceCompleteness ≥ 80% |
| **Required evidence before implementation** | This is the safest and most urgent upgrade — no closedCycles evidence required. Implementation is purely defensive. |
| **Safety guardrails** | Hard block: if regime = UNKNOWN → no new grid activation, no new BUY orders. Existing positions maintain quarantine. |
| **What must remain read-only** | All data sources, indicator engine, freshness checks |
| **Suggested phase name** | R-1G: Unknown Regime Fail-Closed Guard |
| **Codex difficulty** | Low — add regime=UNKNOWN → no-trade to paper-loop gate; read-only check |

---

## 2) Upgrade Concept Details

### 2.1 Range Confidence Gate (expands on 1.1)

Current range detection uses multi-indicator consensus (ADX, BBW, RSI, MACD) but lacks explicit confidence threshold enforcement at the grid-activation layer. The canonicalRegime engine correctly labels RANGE, but this label alone is not sufficient for a grid:

Required additions:
- `rangeConfidence` field exposed in CanonicalMarketRegimeVM (already has `confidence: number`)
- Grid activation blocked if `confidence < 65 && regime == RANGE`
- Spacing enforcement: `gridSpacingPct > roundTripCostPct × 1.5` checked at regrid evaluation time
- `rangeFreshness`: all TF candles must be within 30 minutes
- `rangeMidRelevance`: gridMid must be within 0.5% of current price at regrid decision time
- `inventoryCap`: if buyFillCount > sellFillCount × 3 → block new grid (one-sided exposure limit)

### 2.2 Trend Pullback Entry Logic (expands on 1.2)

TrendStrategy is already shadow-running (T-1_SHADOW phase). The current system has:
- `buildTrendZoneShadow()` → computes pullback zone, target1/target2, invalidation
- `trendPaperExecutionPreflight` → evaluates entry readiness
- `trendManualPaperArmGate` → T-2 manual arm gate
- `TrendPaperEvidenceRunner` → tracks closed trend trades

What is missing before trend-aware grid bias can be implemented:
1. Exact-zone sample tier: currently NO_DATA → need ≥ 100 (REVIEW_ELIGIBLE) for even paper consideration
2. Closed trend trades: 0 current → need ≥ 30
3. OOS walk-forward: not yet run
4. Operator explicit arm via T-2 gate
5. Phase 2-B gate completed

The "near-target" guard is already partially implemented via `riskStatus: NO_TRADE_NEAR_TARGET` in TrendStrategyVM. This needs surfacing as a hard block in the grid bias layer when trend evidence becomes sufficient.

### 2.3 Downtrend Quarantine Extension (expands on 1.3)

The old one-sided BUY exposure quarantine policy (`oldExposurePolicy = QUARANTINE_OLD_GRID_EXPOSURE`) is already implemented. What is missing:

- No-new-BUY enforcement at the regime layer (current: only at priceVsGrid = BELOW_GRID layer)
- Regime-level block: canonicalRegime = DOWNTREND and confidence ≥ 70 → block new BUY grid
- This is a policy enforcement upgrade, not an evidence-gated upgrade
- Short-biased grid: requires Phase 2-B separate short paper evidence track (≥ 30 closed short cycles)

### 2.4 Vol Expansion Guardrail (expands on 1.4)

Key insight: `volBaselineDiagnostic.baselineReadiness` is already exposed in the dashboard (OBS-02, implemented). Blockers:

- Vol baseline currently at 24/50 samples (BUILDING state) → not READY
- ATR ratio is available in `market_snapshot.json.volatility.relative.atr_ratio`
- Vol state = NORMAL currently but with only 24 samples, this classification is less reliable

Immediate safe work: add `BUILDING_BASELINE` warning label to UI when `baselineSamples1h < 50`. This is already shown via `volBaselineDiagnostic` but could be more prominent.

Future logic gate: when ATR ratio > threshold AND vol_state = VOLATILITY_EXPANSION → PAUSE. Currently ATR ratio = 1.0 (baseline = snapshot, only 24 samples).

### 2.5 Low Vol Fee-Grind Detector (expands on 1.5)

Currently `costGate.roundTripCostPct` and `costGate.gridSpacingPct` are surfaced (OBS-04, implemented). The fee-grind detector needs:

- BBW percentile rank against baseline (not just absolute BBW)
- spacingPct vs roundTripCostPct ratio exposed as a "margin buffer" metric
- Warning when margin buffer < 1.5× ("approaching fee-grind territory")
- Hard block when margin buffer < 1.0× (no profit possible)

### 2.6 Event Risk Integration (expands on 1.6)

`news_context.json` is already read by `readLatest()`. The paper-loop diagnostics already have a `session` field. The integration point:

- `news_context.json` → extract high-impact event flag → pass to `buildPaperLoopDiagnostics()`
- Add `eventRisk: { active: boolean, eventType: string | null, hoursToEvent: number | null }` to PaperLoopDiagnostics
- UI: show event risk warning prominently when active
- Logic gate: if eventRisk.active → no new grid activation (paper loop)

This is the lowest evidence bar of all upgrades — it's defensive and doesn't require closed cycles.

### 2.7 Unknown/Data Gap Fail-Closed (expands on 1.7)

The fail-closed logic already exists conceptually in:
- `indicatorGate.blocking = true` → blocks activation
- `candidateStatus = NO_TRADE` → no regrid
- `activationAllowed = false` → blocks grid open

What is missing: explicit check that if `canonicalRegime = UNKNOWN` AND `evidenceCompleteness.status ≠ complete` → hard block. Currently the system may continue from prior state without explicit fail-closed check.

---

## 3) Evidence Requirements Before Any Logic Implementation

All regime-adaptive logic upgrades require the following evidence baseline. Items marked **🔒 HARD GATE** are non-negotiable regardless of other conditions.

### 3.1 Global Evidence Gates (apply to ALL upgrades)

| Gate | Required Value | Current | Status |
|------|---------------|---------|--------|
| Closed cycles (grid) | ≥ 30 minimum | 0 | 🔒 BLOCKED |
| Closed cycles (stronger review) | ≥ 100 | 0 | BLOCKED |
| Vol baseline samples | ≥ 50 (required_points.for_baseline_50) | 24 | BUILDING |
| Cost gate stable | ≥ 10 consecutive PASS snapshots | unknown | UNVERIFIED |
| Missed-fill analysis | Resolved (counterfactual fill study done) | NOT DONE | PENDING |
| OOS / walk-forward | Required | NOT DONE | PENDING |
| Operator review | Independent review completed | NOT DONE | PENDING |
| EXCHANGE_MANUAL_APPROVAL | approved | not_approved | 🔒 BLOCKED |

### 3.2 Per-Upgrade Evidence Requirements

| Upgrade | Minimum Additional Evidence |
|---------|---------------------------|
| R-1A Range Quality Gate | ≥ 30 closed cycles in RANGE regime specifically |
| R-1B Trend-Aware Bias | Exact samples ≥ 100 (REVIEW_ELIGIBLE per T-3H-6-d5); ≥ 30 closed trend trades; Phase 2-B complete |
| R-1C Downtrend No-Trade Guard | No additional evidence (defensive only, but wait for ≥ 30 grid cycles minimum) |
| R-1D Vol Expansion Pause | Vol baseline ≥ 50 samples; ATR history across ≥ 30 sessions |
| R-1E Low Vol Spacing Guard | Vol baseline ≥ 50 samples; BBW baseline stable |
| R-1F Event Risk No-Trade | Lowest bar — primarily policy; news_context integration existing |
| R-1G Unknown Fail-Closed | No evidence required (pure defensive) |

### 3.3 OB/FVG Exact Zone Tier Rules (from T-3H-6-d5)

| Tier | Samples | Meaning | Allowed Action |
|------|---------|---------|----------------|
| NO_DATA | 0 | No data | Read-only only |
| INFORMATIONAL_LT_50 | < 50 | Early signal visible | Read-only + warning labels |
| EARLY_PATTERN_50_TO_99 | 50–99 | Pattern may be emerging | Dashboard display, no threshold change |
| REVIEW_ELIGIBLE_100_PLUS | ≥ 100 | Eligible for operator review | Review only, still not activation ready |

**Hard rule**: REVIEW_ELIGIBLE ≠ approval to trade, lower thresholds, or activate adaptive RR.

---

## 4) Safe-Now Work (Can Implement Without Evidence)

The following work is safe to implement today — no closed cycles, no operator approval, no threshold changes required:

### 4.1 Documentation and Design
- This blueprint document ✅ (being created now)
- Per-regime design specs (one doc per regime)
- Evidence tracking checklist doc
- Phase naming and sequencing doc

### 4.2 Read-Only Dashboard Additions
- Regime-confidence threshold preview ("Range confidence: 72 — ABOVE gate of 65" label)
- Spacing buffer ratio display: `gridSpacingPct / roundTripCostPct` (margin buffer metric)
- BBW percentile rank against baseline (when baseline is READY)
- Event risk status from `news_context.json` (prominent UI warning)
- "BUILDING_BASELINE" prominent label when vol samples < 50
- Unknown regime prominent warning badge

### 4.3 Warning Labels (UI only, no logic change)
- `RANGE_CONFIDENCE_LOW` — when canonicalRegime = RANGE but confidence < 65
- `FEE_GRIND_RISK` — when spacingPct / roundTripCostPct < 1.5
- `VOL_BASELINE_BUILDING` — when samples < 50 (already shown, make more prominent)
- `PRE_BREAKOUT_COMPRESSION` — when BBW percentile < 20th
- `EVENT_RISK_ACTIVE` — from news_context
- `ONE_SIDED_EXPOSURE_WARNING` — when buyFillCount:sellFillCount > 3:1 (already partially in OBS-05)

### 4.4 Test Harness / Simulation Reports
- Regime transition simulation: what happens if RANGE → DOWNTREND while grid active?
- Cost gate sensitivity analysis: at what spacingPct does net expectancy go negative?
- Vol expansion scenario: ATR 2× baseline → what is expected slippage impact?
- Event risk scenario: FOMC day paper cycle behavior (no-trade vs allow)

### 4.5 Parameter Recommendation Preview (not applied)
- "If range confidence gate were live today, would current grid pass?" — dashboard diagnostic
- "What spacing would be required for PASS in current vol?" — displayed only, not written to config
- "At current ATR, what is minimum viable grid spacing?" — read-only recommendation

---

## 5) Blocked Work (Cannot Implement Until Evidence Gates Met)

The following work is **BLOCKED** regardless of design quality or Codex implementation readiness:

| Blocked Item | Blocker |
|-------------|---------|
| Actual regime-based auto grid switching | closedCycles = 0; no evidence |
| Regime-triggered grid activation | M-0B BLOCKED |
| Regime-triggered regrid activation | Phase 2-B BLOCKED; closedCycles = 0 |
| Adaptive RR (reward/risk min change) | Explicitly prohibited; OB/FVG exact samples = NO_DATA |
| OB/FVG execution activation | Exact samples < 100 (REVIEW_ELIGIBLE threshold) |
| Live / order placement / exchange approval path | EXCHANGE_MANUAL_APPROVAL not_approved |
| Short grid activation | No short paper evidence; no operator unlock |
| Threshold tuning (ADX, RSI, ATR thresholds) | No evidence to justify change |
| Phase 2-B (manual paper regrid arm) | Separate operator gate; not yet ready |
| Force-closing old quarantined exposure | Operator decision only; not auto |
| Auto-resume after volatility pause | Requires cooldown + vol re-check; not implemented |
| Any candle/indicator computation change | Evidence-dependent; design only |

---

## 6) Top 10 Future Upgrades — Risk Ranked

Ranked by: (implementation risk) × (safety impact) — lower score = safer to implement sooner.

| Rank | Upgrade | Phase | Risk | Safety Impact | Priority |
|------|---------|-------|------|--------------|----------|
| 1 | **R-1G: Unknown Fail-Closed Guard** | R-1G | Low | High (prevents trading blind) | 🟢 Implement first |
| 2 | **R-1F: Event Risk No-Trade Policy** | R-1F | Low | High (prevents FOMC/CPI grid activation) | 🟢 Implement second |
| 3 | **R-1C: Downtrend No-Trade Block** | R-1C | Low-Med | High (prevents BUY into downtrend) | 🟢 Implement third |
| 4 | **R-1D: Vol Expansion Pause Guard** | R-1D | Medium | High (prevents runaway fills in spike) | 🟡 After vol baseline ready (≥50 samples) |
| 5 | **R-1E: Low Vol Spacing Guard** | R-1E | Low-Med | Medium (fee-grind prevention) | 🟡 After vol baseline ready |
| 6 | **R-1A: Range Confidence Gate** | R-1A | Medium | Medium (prevents low-confidence grid) | 🟡 After ≥30 RANGE closed cycles |
| 7 | **OBS-D: Regime Transition Alert** | Dashboard | Low | Medium (operator early warning) | 🟢 Can implement now (read-only) |
| 8 | **OBS-E: Fee-Grind Risk Label** | Dashboard | Low | Medium (visibility of cost erosion) | 🟢 Can implement now (read-only) |
| 9 | **R-1B: Trend-Aware Grid Bias** | R-1B | Hard | High (directional position risk) | 🔴 After T-3H REVIEW_ELIGIBLE + Phase 2-B |
| 10 | **R-1B-Short: Short Grid Evidence Track** | R-1B | Very Hard | Very High | 🔴 Separate operator unlock required |

---

## 7) Suggested Phase Sequence

```
NOW (safe, no evidence required):
  R-1G → R-1F → OBS-D/E warning labels (read-only dashboard)

AFTER vol baseline ≥ 50 samples:
  R-1D → R-1E → vol-aware labels

AFTER ≥ 30 closed grid cycles + cost gate stable:
  R-1C → R-1A → range quality labels
  Full evidence review: expectancy + cost attribution + mode breakdown

AFTER ≥ 30 closed grid cycles + operator review + Phase 2-B:
  Phase 2-B activation (regrid paper arm)
  Then: more evidence accumulation for regime-adaptive regrid

AFTER exact samples ≥ 100 (T-3H REVIEW_ELIGIBLE) + OOS:
  Operator review: R-1B design finalization
  (NOT activation — design review only)

AFTER operator explicit approval + all gates PASS:
  R-1B trend-aware bias (paper-only first)
  Minimum: closedCycles ≥ 100 before considering live
```

---

## 8) What Codex Can Implement Safely Next

Based on the safe-now criteria, the following are ready for Codex handoff:

### Immediate (no evidence gate):

**OBS-D: Regime Transition Alert**
- New `regimeTransitionAlert: { prevRegime: string | null, currentRegime: string, changedAt: string | null, warningLabel: string | null }` field in PaperVM
- Source: track last known regime in `paperLoopDiagnostics` (add `prevCanonicalRegime` field)
- UI: show amber alert if regime changed within last 6 snapshots
- Files: `paperLoopDiagnostics.ts`, `viewModel.ts`, `adapter.ts`, `CanonicalMarketRegimeCard.tsx`
- Codex difficulty: Low

**OBS-E: Fee-Grind Risk Label**  
- Add `spacingBuffer: number | null` (= gridSpacingPct / roundTripCostPct) to `CostGateBreakdownVM` (already being added in OBS-04)
- Add `feeGrindRisk: "SAFE" | "WATCH" | "RISK" | "UNKNOWN"` label:
  - SAFE: buffer ≥ 1.5
  - WATCH: 1.0–1.5
  - RISK: < 1.0
  - UNKNOWN: null spacing or null cost
- UI: display as colored badge in DynamicRegridStatusCard
- Files: `viewModel.ts`, `adapter.ts`, `DynamicRegridStatusCard.tsx`
- Codex difficulty: Low (extend OBS-04 work)

**R-1G Base: Unknown Regime Warning UI**
- If `canonicalRegime.regime = UNKNOWN` → show prominent red warning block
- If `volBaselineDiagnostic.baselineReadiness = INSUFFICIENT | BUILDING` → show amber warning
- If `regime.sourceFreshness.status = stale` → show amber "stale data" block
- UI-only change: `CanonicalMarketRegimeCard.tsx`
- Codex difficulty: Very Low

**R-1F Base: Event Risk News Context Label**
- Read `latest.newsContext` (already loaded in route via `readLatest()`)
- Extract high-risk event flag → attach to `paperLoopDiagnostics` via cast
- Add `newsRiskAlert: { hasHighImpactEvent: boolean, eventSummary: string | null }` to PaperVM
- UI: show warning block when `hasHighImpactEvent = true`
- Files: `route.ts` (cast), `viewModel.ts`, `adapter.ts`, `DynamicRegridStatusCard.tsx`
- Codex difficulty: Low-Medium (depends on news_context.json schema)

---

## 9) What Must Wait for Evidence

| Upgrade | Minimum Wait Condition |
|---------|----------------------|
| Regime-based grid activation | closedCycles ≥ 30 + operator review |
| Regime-based regrid gate | Phase 2-B gate + closedCycles ≥ 30 |
| Range confidence → grid param linkage | ≥ 30 RANGE closed cycles |
| Downtrend BUY hard block (logic layer) | closedCycles ≥ 30 (to verify behavior is correct before hardening) |
| Vol pause logic implementation | Vol baseline ≥ 50 samples |
| Trend bias grid | T-3H REVIEW_ELIGIBLE + OOS + Phase 2-B |
| Any threshold tuning | Evidence of wrong threshold from closed cycle data |
| Short grid | Separate short paper evidence track from scratch |

---

## 10) Checklist Before Implementing Any R-1 Upgrade

Copy this checklist for each upgrade implementation:

```
[ ] closedCycles ≥ 30 (for logic changes) or N/A (for read-only)
[ ] Vol baseline ≥ 50 samples (for vol-dependent changes) or N/A
[ ] Cost gate stable ≥ 10 snapshots (for cost-dependent changes) or N/A
[ ] Missed-fill analysis complete or N/A
[ ] OOS / walk-forward complete (for entry/execution logic) or N/A
[ ] Operator independent review passed
[ ] EXCHANGE_MANUAL_APPROVAL = approved (for any activation) or N/A
[ ] M-0B BLOCKED respected
[ ] Phase 2-B BLOCKED respected
[ ] No reward_risk_min / TREND_PAPER_MIN_REWARD_RISK change
[ ] No entry/detector threshold change
[ ] No adaptive RR
[ ] No OB/FVG execution
[ ] No live/order path touched
[ ] TypeScript build passes (npx tsc --noEmit)
[ ] Safety grep passes (no placeOrder / submitOrder / createOrder)
[ ] Codex commit message includes: "[read-only]" or explicit activation gate status
```

---

## 11) File References

| File | Role |
|------|------|
| `docs/R0_OBS_PACK_2026-06-13.md` | R-0 OBS items 1–6 (broad design) |
| `docs/R0_OBSB_HANDOFF_2026-06-13.md` | OBS-01+02 Codex handoff (DONE) |
| `docs/R0_OBSC_HANDOFF_2026-06-13.md` | OBS-04+05 Codex handoff (ready) |
| `docs/T-3H-6d5_exact_vs_heuristic_comparison.md` | OB/FVG exact zone sample tiers |
| `docs/M0Z6_DYNAMIC_REGRID_PHASE2A_MONITORING.md` | Phase 2-A monitoring guide |
| `docs/M0Z6_DYNAMIC_REGRID_PHASE2B_MANUAL_PAPER_ACTIVATION_PLAN.md` | Phase 2-B design (BLOCKED) |
| `PROJECT_CONTEXT.md` | Current state snapshot |
| `PROJECT_ARCHITECTURE.md` | 12-layer system architecture |
| `dashboard/lib/market-regime/canonicalMarketRegime.ts` | Canonical regime engine (shadow) |
| `dashboard/lib/trading-agent-hq/viewModel.ts` | ViewModel types |
| `dashboard/lib/trading-agent-hq/adapter.ts` | PaperVM adapter |
| `dashboard/lib/trading-agent-hq/regridDisplay.ts` | Exposure/regrid display labels |
| `dashboard/components/trading-agent-hq/DynamicRegridStatusCard.tsx` | Inventory/grid UI |
| `dashboard/components/trading-agent-hq/CanonicalMarketRegimeCard.tsx` | Regime UI |

---

## Final Classification

**`R1_DESIGN_ONLY_CONTINUE_EVIDENCE`**

Rationale:
- Blueprint is complete and ready for phased Codex implementation
- Immediate safe work (OBS-D, OBS-E, R-1G/R-1F base labels) can proceed now without evidence gates
- Core regime-adaptive logic (R-1A through R-1C) requires evidence baseline (closedCycles ≥ 30) not yet met
- Vol-dependent upgrades (R-1D, R-1E) require vol baseline completion (24/50 samples currently)
- Trend-adaptive bias (R-1B) requires T-3H REVIEW_ELIGIBLE + Phase 2-B + OOS — longest lead time
- Continue evidence accumulation in paper simulation while safe work proceeds

**Next session recommended action**: Prepare OBS-D (regime transition alert) + OBS-E (fee-grind risk label) Codex handoff, following the same format as `R0_OBSB_HANDOFF` and `R0_OBSC_HANDOFF`.
