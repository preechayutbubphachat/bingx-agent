# Trend Strategy T-4 — Edge Review & Expectancy Engineering (DESIGN ONLY)

> docs-only · ออกแบบวิธีประเมิน trend paper evidence **หลัง** T-3 paper simulation มีจริง
> ไม่ implement execution · ไม่เขียน journal · ไม่จำลอง fill · ไม่มีปุ่ม arm · **T-4 ≠ live ready** · M-0B BLOCKED
> ใช้ skill `expectancy-risk-of-ruin` + `trade-journal-attribution` ตอน implement · evidence จาก `trend_paper_journal.jsonl` เท่านั้น

---

## 1) Trend closed trade definition
- **closed trend trade** = 1 setup ที่ entry แล้ว exit สมบูรณ์ (ทุก partial ปิดหมด) ผ่าน `TREND_PAPER_EXIT` หรือ `TREND_PAPER_INVALIDATED`
- ENTRY+PARTIAL ที่ยังมี runner เปิด = **ยังไม่ closed** (ไม่นับ)
- CANCEL (ก่อน fill) = ไม่ใช่ trade · ไม่นับเป็น sample
- 1 closed trade = 1 หน่วยของ trend evidence (มี rMultiple/netPnlPaper สุดท้าย หลังรวม partial)

## 2) Trend evidence metrics (คำนวณจาก closed trades เท่านั้น)
```ts
trendEdgeReview.metrics = {
  trendClosedTrades,           // จำนวน closed trades
  winRate,                     // wins / closedTrades
  averageWinR,                 // mean R ของ wins
  averageLossR,                // mean R ของ losses (ค่าลบ)
  expectancyR,                 // winRate*avgWinR + (1-winRate)*avgLossR (gross, ใน R)
  netExpectancyAfterCosts,     // expectancy หลังหัก fee+slippage(+funding) → ตัวตัดสินหลัก
  profitFactor,                // sum(wins$)/|sum(losses$)|
  maxDrawdownR,                // peak-to-trough ใน R จาก equity curve
  maxConsecutiveLosses,
  riskOfRuinEstimate,          // จาก winRate + payoff + fractional risk (skill expectancy-risk-of-ruin)
  costDrag,                    // (gross − net) expectancy = ผลกระทบ fee+slippage
  slippageAttribution,         // ผลรวม slippage paper ต่อ trade
  fundingAttribution           // ถ้ามี perpetual funding ใน paper model
}
```
> **netExpectancyAfterCosts คือ edge ที่แท้จริง** — gross expectancy หรือ win rate อย่างเดียว **ไม่ใช่** edge

## 3) Minimum sample size (gate ด้วยจำนวน closed trends)
| ระดับ | sample (closed trends) | ใช้ทำอะไร |
|---|---|---|
| **early** | 1–9 | สังเกตเฉยๆ · **ห้ามสรุป edge** |
| **usable** | 10–19 | เริ่มดู pattern/attribution · ยังไม่ตัดสิน |
| **review** | 20–29 | ประเมิน expectancy เบื้องต้น (ความเชื่อมั่นต่ำ) |
| **production candidate** | ≥ 30 (เข้ม ≥ 50) | พอประเมิน net expectancy + drawdown + risk-of-ruin |
> sample น้อย = ความผันผวนของ estimate สูง · **ห้ามสรุปว่ามี edge จาก sample < review**

## 4) Failure taxonomy (label ทุก losing/aborted trade)
`bad_regime` · `late_entry` · `no_pullback` · `failed_confirmation` · `volatility_spike` · `liquidity_sweep` · `poor_rr` · `stale_data` · `execution_slippage_cost`
- map จาก journal `exitReason`/`reason` + context (regime/session/indicator ณ event)
- ใช้แปลง failure เป็น action (เช่น failed_confirmation เยอะ → เข้มเงื่อนไข 5m confirm)

## 5) Attribution (แตก performance หลายมิติ)
- **by regime** (DOWNTREND/UPTREND/strength) — setup ทำงานในเทรนด์แรงหรืออ่อน?
- **by session** (Asia/London/NY/killzone)
- **by indicator state** (ADX band · RSI band · MACD hist sign · DI dominance)
- **by trend zone quality** (0.50–0.618 fib · ATR width · swing distance)
- **by confirmation type** (5m close-back · rejection wick · MACD roll-over · RSI<50)
> ทุก attribution คำนวณจาก snapshot ที่บันทึกใน journal event (`regimeAtEvent`/`sessionAtEvent` + indicator fields)

## 6) Go / No-Go gates (T-4 decision)
| decision | เงื่อนไข |
|---|---|
| **HOLD** | sample < review (< 20) → ยังประเมินไม่ได้ · เก็บต่อ |
| **CONTINUE_PAPER** | sample เริ่มพอ + netExpectancy ยังไม่ชัด → เก็บ paper ต่อ |
| **PARAMETER_REVIEW** | attribution ชี้จุดอ่อนชัด (เช่น session/zone-quality แย่) → ปรับ param แล้วเก็บใหม่ |
| **PAUSE_STRATEGY** | netExpectancy ≤ 0 หลัง sample พอ / drawdown/risk-of-ruin สูงเกิน → หยุด trend strategy |
| **READY_FOR_LIMITED_CANARY_REVIEW** | sample ≥ production candidate + netExpectancy > 0 (มี margin หลัง cost) + drawdown/ruin ยอมรับได้ + attribution robust → **เสนอ operator review** (ยังไม่ใช่ live) |
> READY_FOR_LIMITED_CANARY_REVIEW = สัญญาณให้ operator พิจารณาเท่านั้น **ไม่ใช่ live trigger**

## 7) Separation from grid (เด็ดขาด)
- **trend expectancy ห้ามปลดล็อก grid** (Phase 2-B/M-0B ของ grid ใช้ grid evidence เท่านั้น)
- **grid expectancy ห้ามปลดล็อก trend** (T-4 ใช้ trend evidence เท่านั้น)
- **ไม่ปน closedCycles** — `trendClosedTrades` (trend) ≠ `closedCycles` (grid) · คนละ journal/epoch/metric
- old grid BUY exposure ยัง quarantined — ไม่ใช่ trend evidence

## 8) UI / API design (future additive)
```ts
paperLoopDiagnostics.trendEdgeReview = {
  phase: "T-4_EDGE_REVIEW",
  sampleTier: "early" | "usable" | "review" | "production_candidate",
  metrics: { ...§2 },
  attribution: { byRegime, bySession, byIndicatorState, byTrendZoneQuality, byConfirmationType },
  failureTaxonomyCounts: { bad_regime, late_entry, ... },
  decision: "HOLD" | "CONTINUE_PAPER" | "PARAMETER_REVIEW" | "PAUSE_STRATEGY" | "READY_FOR_LIMITED_CANARY_REVIEW",
  notes,
  paperActivationAllowed: false,
  liveActivationAllowed: false
}
```
UI card (future): `Trend Edge Review` — sample tier · netExpectancyAfterCosts (เด่น) · win rate · avg R · profit factor · maxDrawdownR · risk-of-ruin · attribution breakdown · failure taxonomy · decision · **ไม่มีปุ่ม live** · Thai copy "ประเมินผล paper เท่านั้น · ยังไม่ใช่สัญญาณเทรดจริง"

## 9) Relationship to live migration
- **T-4 ไม่ได้แปลว่า live ready** · READY_FOR_LIMITED_CANARY_REVIEW = แค่หลักฐานพอให้ operator review
- live ยังต้อง **แยกต่างหาก:** M-0B gate + paper-to-live Migration Gate (skill `paper-trading-live-migration`) + operator manual approval + EXCHANGE_MANUAL_APPROVAL
- ลำดับ: T-4 review → (ถ้าผ่าน) limited canary **paper** design → migration framework (shadow live → canary) → live · **ทุกขั้นต้อง approval แยก** · `liveActivationAllowed`=false จนกว่าจะถึง live gate จริง

## 10) Files / docs + Codex handoff
**Files:** สร้าง `docs/TREND_STRATEGY_T4_EDGE_REVIEW_PLAN.md` + pointer `PROJECT_MAP.md` / `PROJECT_ARCHITECTURE.md`
**Codex docs-only handoff (ถ้าต้องการ release docs):** `docs(trend): add T-4 edge review & expectancy engineering plan`
> implement T-4 (metrics engine + edge review evaluator) = เฟสถัดไป หลัง T-3 execution มี closed trades จริง · handoff แยกพร้อม validation

## Safety confirmation
- **no live · no paper execution · no journal write · no simulated fill · no arm button · no M-0B unlock · no Phase 2-B activation**
- old grid exposure quarantined · trend evidence แยกจาก grid (ไม่ปน closedCycles/expectancy)
- T-4 ≠ live ready · `paperActivationAllowed`/`liveActivationAllowed`=false · docs-only · ไม่ใช้ git
