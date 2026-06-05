# Dynamic Regrid Activation — Design Plan (v2.1, design-only)

> สถานะ: **Phase 1 = READ-ONLY EVALUATOR (implemented)** · paper-only · **M-0B remains BLOCKED**
> ต่อจาก ALGO_V2_RUNTIME_PASS (guardrail หยุด BUY นอก grid + PAPER_NO_TRADE log ทำงานจริง)
> เป้าหมาย: นิยามเงื่อนไขที่ปลอดภัยในการ "สร้าง grid ใหม่" เมื่อราคาออกนอกช่วง โดย**ไม่ฝืนเทรด**

## Phase 1 — Read-Only Candidate Evaluator (implemented)
ประเมิน "candidate grid กำลังก่อตัวไหม" เมื่อราคา **นอก grid** (BELOW/ABOVE/REGRID_REQUIRED/PAUSE_OUT_OF_RANGE) แบบ **อ่านอย่างเดียว ไม่ activate**
- `dashboard/lib/grid/regridCandidate.ts` — `evaluateRegridCandidate()` (pure) คำนวณ candidate geometry รอบราคาปัจจุบัน (ปิด old-grid range gate) → คืน candidateStatus/Reason/Lower/Upper/Mid/WidthPct/SpacingPct/GridCount/stableCandleCount/cooldownRemaining + **`activationAllowed=false` เสมอ (Phase 1 invariant)**
- `paper_cycle.sh` — เขียน audit event `type=REGRID_CANDIDATE` → `tmp/execution-runner/regrid_candidate.jsonl` (marker, activationAllowed=false) เมื่อ below/above grid · ไม่ส่ง order
- `/api/paper-performance` → `paperLoopDiagnostics.dynamicGrid.candidate = {status, reason, lower, upper, mid, widthPct, spacingPct, gridCount, stableCandleCount, activationAllowed:false}`
- **ผล:** ระบบยัง NO_TRADE ขณะนอก grid · API โชว์ได้ว่า candidate กำลังก่อตัว · **ไม่มีการเปิด grid อัตโนมัติ** · activation = เฟสถัดไป (รอ operator approve + M-0B)
- tests: `regridCandidate.test.ts` (INACTIVE in-range / candidate geometry out-of-range / activationAllowed always false / stable-candle cooldown)

---

## Phase 2-A — Regrid Readiness + Paper Epoch Preparation (implemented)
Phase 2-A is still visibility-only and paper-only. It prepares operator review signals but does not activate a dynamic grid, does not place paper orders differently, and does not unlock live trading.

- `dashboard/lib/grid/regridReadiness.ts` adds a pure readiness evaluator with status `NOT_READY`, `WATCH`, or `READY_FOR_OPERATOR_REVIEW`.
- Readiness output always keeps `paperActivationAllowed=false` and `liveActivationAllowed=false`; `READY_FOR_OPERATOR_REVIEW` is only an operator review signal, not an execution permission.
- `/api/paper-performance` exposes `paperLoopDiagnostics.regridReadiness` and `paperLoopDiagnostics.paperEpoch` without removing existing fields.
- `paper_cycle.sh` writes read-only audit event `REGRID_READINESS` to `dashboard/tmp/execution-runner/regrid_readiness.jsonl` when the paper loop is outside the grid and already taking the no-trade/regrid-candidate path.
- Old one-sided BUY exposure is quarantined under policy:
  - `QUARANTINE_OLD_ONE_SIDED_EXPOSURE`
  - `DO_NOT_COUNT_AS_CLOSED_CYCLE`
  - `DO_NOT_FORCE_SELL`
  - `DO_NOT_USE_FOR_EXPECTANCY`
- Dynamic grid activation requires a later explicit Phase 2-B approval path. This phase does not activate Dynamic Grid, does not change M-0B, and does not change paper execution decisions.
- Live trading remains prohibited: no `LIVE_TRADING_ENABLED`, no `ENABLE_ORDER_PLACEMENT`, no `PRODUCTION_TRADING_READY`, and no exchange approval changes.
- Agent HQ shows the Thai read-only card `ความพร้อม Regrid Phase 2-A` so operators can inspect readiness, epoch, and old-exposure quarantine state without SSH/grep.

### Latest runtime evidence (2026-06)
- Agent HQ UI (`/agent-hq`) แสดง **Runtime Monitor + Regrid Readiness** (card `ความพร้อม Regrid Phase 2-A`)
- **PAPER_NO_TRADE count = เพิ่มขึ้นต่อเนื่อง** (guardrail ทำงานขณะ BELOW_GRID)
- **REGRID_CANDIDATE count = เพิ่มขึ้นต่อเนื่อง** (read-only evaluator + `REGRID_READINESS` audit)
- **BUY count = นิ่ง (≈1,460, หยุดเพิ่ม)** · SELL = 0 · closedCycles = 0
- priceVsGrid = BELOW_GRID · paperLoopState = REGRID_REQUIRED · lastNoTradeReason = price_below_grid_lower
- regridReadiness = NOT_READY / WATCH · oldExposurePolicy = QUARANTINE_OLD_ONE_SIDED_EXPOSURE
- activationAllowed = false · paperActivationAllowed = false · liveActivationAllowed = false

### Phase 2-A acceptance
**PASS if (ทุกข้อ):**
- BUY count คงที่ (ไม่เพิ่มขณะ BELOW_GRID)
- PAPER_NO_TRADE เพิ่มขึ้น
- REGRID_CANDIDATE / REGRID_READINESS เพิ่มขึ้น
- readiness diagnostics อัปเดต (latestJournalAt / paperEpoch ขยับ)
- activation flags ทั้งหมดยัง false (activationAllowed / paperActivationAllowed / liveActivationAllowed)

**FAIL if (ข้อใดข้อหนึ่ง):**
- BUY เพิ่มขึ้นขณะ priceVsGrid = BELOW_GRID
- activationAllowed กลายเป็น true โดยไม่คาดคิด
- paperActivationAllowed กลายเป็น true โดยไม่คาดคิด
- liveActivationAllowed กลายเป็น true
- no-trade / regrid / readiness logs หยุดอัปเดตขณะ loop ยังทำงาน

> `READY_FOR_OPERATOR_REVIEW` = สัญญาณให้ operator ตรวจเท่านั้น ไม่ใช่ execution permission · activation จริง = Phase 2-B (operator approve อย่างชัดเจน, paper-only) · live ยังบล็อกตลอด Phase 2

### Phase 2-B (next, DESIGN ONLY)
Manual Paper Activation Plan — `docs/M0Z6_DYNAMIC_REGRID_PHASE2B_MANUAL_PAPER_ACTIVATION_PLAN.md`: Manual Paper Activation Gate + paper epoch (previous=INVALIDATED_RANGE/quarantine, next=CANDIDATE) + state machine 8 steps + fail paths + future additive API (`phase2B`, `paperEpoch.nextEpoch`). **design เท่านั้น · implement = Codex handoff แยก · operator approve (paper-only, แยกจาก EXCHANGE_MANUAL_APPROVAL) · liveActivationAllowed=false เสมอ · M-0B BLOCKED**

---

## 0) หลักการ
- ราคา นอก grid = `REGRID_REQUIRED` (no-trade) เป็น **ค่าเริ่มต้นที่ปลอดภัย** เสมอ
- การ "regrid" คือสร้าง candidate grid ใหม่รอบราคาปัจจุบัน → **ต้องผ่าน gate หลายชั้น + cooldown** ก่อน activate
- **No-Trade คือคำตอบที่ถูกต้อง** ถ้า gate ไม่ครบ — ห้าม regrid เพื่อให้ได้เทรด
- ทุกอย่าง paper เท่านั้น · ไม่ปลดล็อก M-0B · ไม่ force fill

## 1) State flow
```
OUT_OF_RANGE (BELOW/ABOVE_GRID)
  → REGRID_REQUIRED            (เริ่มจับเวลา + เก็บหลักฐาน)
  → REGRID_CANDIDATE           (ผ่าน data/vol/cost/regime gate แต่ยังรอ stable candles)
  → [cooldown N candles ผ่าน]
  → DYNAMIC_GRID_ACTIVE        (เปิด grid ใหม่รอบราคาปัจจุบัน, paper)
ถ้า gate ใดไม่ผ่าน → NO_TRADE (พร้อม reason) แล้ววนรอ
```

## 2) Dynamic regrid activation criteria (ต้องครบทุกข้อ)
| # | Gate | เงื่อนไขผ่าน | reason ถ้าไม่ผ่าน |
|---|---|---|---|
| 1 | **Data freshness** | snapshot close สด (อายุ < N นาที) + decision/snapshot drift ≤ 1% | `stale_decision_or_price_mismatch` |
| 2 | **Price stability** | ราคายืนอยู่ในกรอบแคบ (realizedRangePct ของ N แท่งล่าสุด ≤ stabilityMaxPct) ติดต่อกัน ≥ **N_stable แท่ง** (3–6) | `regrid_cooldown` / `dynamic_grid_cooldown` |
| 3 | **Volatility sane** | atrProxyPct ไม่สุดขั้ว (≤ volatilityExtremePct) | `volatility_extreme` |
| 4 | **Regime range-like** | mode ∈ {GRID_NEUTRAL/RANGE/compression} **และ** ไม่มี trend confirmation (ดู §3) | `regime_unclear` / route → `TREND_CHECK` |
| 5 | **Cost gate** | spacingPct (ของ candidate) > roundTripCostPct × 2.5 | `cost_gate_failed` |
| 6 | **Exposure sane** | ไม่มี one-sided inventory เกิน cap (ปิด/รีเซ็ตก่อน regrid) | `one_sided_buy/sell_limit` |
| 7 | **No fresh breakout** | ราคาไม่เพิ่งทะลุแรง (displacement) ในทิศเดียวภายใน K แท่ง | `regime_unclear` |

ผ่าน 1–7 ครบ + cooldown ครบ → `DYNAMIC_GRID_ACTIVE`

## 3) Regime confirmation requirements (กัน regrid สวนเทรนด์)
- **ต้องยืนยัน "ไม่ใช่ trend" ก่อน regrid neutral grid:**
  - ราคากลับเข้าหา EQ/mid ของ candidate (mean-reversion sign) ไม่ใช่วิ่งหนีต่อ
  - ไม่มี BOS/CHOCH ทิศเดียวต่อเนื่อง (ถ้ามี structure data)
  - ADX/DI (ถ้ามี) ไม่บ่งบอก trend แรง (เช่น ADX < threshold)
  - realizedRangePct หดตัว (compression) มากกว่าขยายตัว
- **ถ้าพบ trend confirmation** → ไม่ regrid neutral · route → `TREND_CHECK` (สำหรับ trend-grid candidate ในเฟสถัดไป) · ระหว่างนั้น `NO_TRADE`
- **ถ้า regime ไม่ชัด** → `NO_TRADE` reason=`regime_unclear` (default ปลอดภัย)

### 3.1) Indicator-Based Readiness Gate (future design, display evidence only)
`indicatorEvidence` จาก `market_snapshot.json` / `regimeEvidence` จะเป็น input สำหรับ gate อนาคตเท่านั้น ยังไม่เปลี่ยน paper loop, ยังไม่ activate Phase 2-B, และยังไม่ปลดล็อก M-0B

**Output contract (spec — ยังไม่ implement trading logic):**
```ts
indicatorGate = {
  status: "TREND_CHECK" | "RANGE_WATCH" | "RECOVERY_WATCH" | "VOLATILITY_BLOCK" | "INSUFFICIENT_DATA",
  reasons: [],
  passed: [],
  failed: [],
  confidence,
  paperActivationAllowed: false,
  liveActivationAllowed: false
}
```

**Threshold defaults (ต้องเป็น config เมื่อ implement):**
| Gate | Threshold |
|---|---|
| trendAdxMin | `ADX > 25` |
| diDominanceMultiplier | `-DI > +DI × 1.2` |
| rangeAdxMax | `ADX < 20` |
| rsiRange | `35 <= RSI <= 65` |
| recoveryRsiMin | `RSI > 45` |
| atrPctMax | configurable risk ceiling; ห้าม hard-code จาก sample เดียว |
| bbwExpansionMax | configurable expansion ceiling; ใช้การเทียบกับ window ก่อนหน้า ไม่ใช้ค่าเดียวตัดสิน |

**Gate definitions:**
- `TREND_DOWN_BLOCK` → `status="TREND_CHECK"` เมื่อ `ADX > 25 AND -DI > +DI * 1.2 AND MACD histogram < 0 AND EMA slope < 0` · neutral grid activation ไม่ปลอดภัย
- `RANGE_WATCH` → `status="RANGE_WATCH"` เมื่อ `ADX < 20 OR DI spread compressing`, `RSI` อยู่ช่วง `35-65`, `BBW` ไม่ expanding, และ `ATR%` ต่ำกว่า configured max
- `VOLATILITY_BLOCK` → `status="VOLATILITY_BLOCK"` เมื่อ `ATR%` สูงกว่า configured max หรือ `BBW` expanding sharply
- `RECOVERY_WATCH` → `status="RECOVERY_WATCH"` เมื่อ `RSI > 45`, MACD histogram ดีขึ้น, EMA slope เริ่ม flatten, และ -DI dominance อ่อนลง
- `INSUFFICIENT_DATA` → indicator ขาด, stale, candle count ไม่พอ, หรือ freshness ไม่ผ่าน

**PASS / WATCH / BLOCK criteria:**
- `BLOCK`: `TREND_DOWN_BLOCK`, `VOLATILITY_BLOCK`, `INSUFFICIENT_DATA`, หรือ evidence stale/malformed → คง `NO_TRADE`
- `WATCH`: `RANGE_WATCH` หรือ `RECOVERY_WATCH` → แสดงว่าเริ่มน่าตรวจ แต่ยังไม่ใช่ permission เปิด grid
- `PASS` ในอนาคตต้องผ่านพร้อมกัน: range-like evidence, no trend block, no volatility block, data fresh, regrid candidate/cost/cooldown/old exposure gates ผ่าน และยังต้อง operator review ของ Phase 2-B

**Current runtime example (2026-06 evidence):**
| Field | Value | Gate impact |
|---|---:|---|
| ADX | 35.44 | ผ่าน trend strength (`>25`) |
| +DI | 14.70 | ถูก -DI dominate |
| -DI | 29.43 | `29.43 > 14.70 × 1.2 = 17.64` |
| RSI | 40.51 | ยังไม่ recovery เหนือ 45 |
| ATR% | 0.75 | ใช้ดู volatility เทียบ config |
| BBW | 0.030 | ใช้ดู expansion เทียบ window |
| MACD histogram | -92.09 | bearish momentum |
| EMA slope | -104.55 | slope ลง |

ผลลัพธ์ที่ออกแบบไว้: `TREND_DOWN_BLOCK` → `indicatorGate.status="TREND_CHECK"` · `paperActivationAllowed=false` · `liveActivationAllowed=false` · Phase 2-B ยัง blocked เพราะ downtrend pressure ยืนยันแล้วและ neutral grid activation ไม่ปลอดภัย

## 4) เมื่อไหร่ "resume grid" (เปิด grid ใหม่)
ทั้งหมดต้องจริงพร้อมกัน:
1. ผ่าน gate 1–7 (§2)
2. stable candles ครบ N_stable (cooldown)
3. candidate grid มี spacing คุ้ม cost (gate 5)
4. ราคาปัจจุบันอยู่**กลาง** candidate range (ไม่ใช่ขอบ) — เริ่มสมดุล
5. ยืนยัน regime range-like (§3)
→ activate paper grid ใหม่รอบ `dynamicGridMid = currentPrice`, lower/upper จาก ATR width

## 5) เมื่อไหร่ "stay NO_TRADE"
- ราคายังนอก grid และ gate ใดไม่ผ่าน
- drift > 1% (stale) · volatility สุดขั้ว · regime ไม่ชัด/เป็น trend · spacing ไม่คุ้ม cost · exposure เกิน cap · เพิ่ง breakout
- **ค่าเริ่มต้นเมื่อข้อมูลไม่ครบ = NO_TRADE** (ไม่เดา)

## 6) ประเมิน regrid candidate โดย "ไม่ฝืนเทรด"
- ใช้ `calculateDynamicGrid()` (มีอยู่แล้ว, pure) เป็น **evaluator อ่านอย่างเดียว** → คืน `status/reason/dynamicGrid*` เป็น **diagnostic** ไม่ใช่คำสั่ง
- candidate ถูกบันทึกเป็น `REGRID_CANDIDATE` event (paper audit) เพื่อเก็บหลักฐาน — **ไม่มีการส่ง order**
- activate จริงต่อเมื่อ cooldown + gate ครบ → ค่อยปล่อยให้ paper grid วาง order (paper) ตามปกติ
- **ห้าม:** สร้าง grid แค่เพื่อให้เกิด fill, ปรับ grid ให้ราคาปัจจุบันอยู่ฝั่ง BUY เสมอ, ลด spacing ต่ำกว่า cost, force SELL เพื่อปิด exposure

## 7) Observability ที่จะเพิ่ม (เฟสถัดไป, ตอน implement)
- `regridState`, `stableCandleCount`, `regimeConfirmation`, `regridCandidate{lower,upper,mid,spacingPct,confidence}`, `regridBlockedReasons[]` ใน `/api/paper-performance`
- audit event `REGRID_CANDIDATE` / `DYNAMIC_GRID_ACTIVE` (paper)

## 8) Acceptance (เมื่อ implement เฟสถัดไป)
- ราคานอก grid + gate ไม่ครบ → ยัง NO_TRADE (ไม่ activate)
- ราคาเสถียร + regime range + cost คุ้ม + cooldown ครบ → activate candidate (paper) → เริ่มมีทั้ง BUY+SELL → closedCycles เริ่มเกิด **ตามธรรมชาติ**
- ไม่มี regrid สวน trend · ไม่มี grid spacing ต่ำกว่า cost
- M-0B ยัง BLOCKED จนกว่า closedCycles + sample + netExpectancy>0 + operator review + approval

## Safety (คงเดิม)
DESIGN ONLY — ยังไม่เขียนโค้ด · ไม่เปิด live/order · ไม่ approve · ไม่ fake closedCycles · ไม่ force SELL · **M-0B remains BLOCKED**
