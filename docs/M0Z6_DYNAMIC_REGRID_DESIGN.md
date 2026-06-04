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
