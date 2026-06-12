# T-3H-6-d — Exact OB/FVG Zone Detector Design & Readiness Spec

> Status: **DESIGN ONLY** (2026-06-12) — ห้าม implement จนกว่าจะอนุมัติเป็นเฟส d1+
> ไม่มี code change ในเฟสนี้ · ทุก invariant เดิมคงอยู่: paper-only, live=false, exchange=false,
> M-0B BLOCKED, Phase 2-B BLOCKED, adaptive RR disabled, OB/FVG execution disabled

## 0) Why now

c/c1/c2 พิสูจน์ว่า refined entry geometry มีศักยภาพ (avg netRR 1.08 → 1.37, +0.29, quality ~70)
แต่ทั้งหมดเป็น `HEURISTIC_ESTIMATE_ONLY` — entry ที่ refine มาจากการประมาณ ไม่ใช่ zone จริง
c2 review จึงล็อกไว้ว่า `exactZoneReadiness` จะเป็น `EXACT_ZONE_READY` ได้ก็ต่อเมื่อมี
structured exact-zone data เท่านั้น เอกสารนี้นิยาม zone เหล่านั้นแบบ machine-detectable

จุดต่อที่มีอยู่แล้ว (ไม่ต้องรื้อ): `MtfObFvgRefinementShadowInput.optionalObZone / optionalFvgZone`
(PriceZone {low, high}) — detector ใหม่แค่ผลิต input นี้ + metadata

---

## 1) Task A — Exact Order Block definition (deterministic)

หน่วยตรวจ: ชุด candle ปิดแล้วของ timeframe เดียว `C[0..n-1]` (เก่า→ใหม่) ห้ามใช้ candle ที่ยังไม่ปิด

**Bullish OB (สำหรับ LONG):**
1. `C[i]` เป็น **down candle**: `close[i] < open[i]`
2. ตามด้วย **displacement ขึ้น** ภายใน ≤ `K_disp=3` candles: มี `C[j]` (i<j≤i+3) ที่
   `close[j] > high[i]` และ `body[j] ≥ DISP_BODY_MULT × medianBody(20)` (default 1.5×)
   และ `range[j] ≥ DISP_ATR_MULT × ATR(tf,14)` (default 1.0×)
3. displacement leg ทำ **structure confirmation**: `close[j..]` ทะลุ swing high ล่าสุด
   (BOS) หรือกลับทิศจาก swing low (CHOCH) — นิยาม swing ที่ §1.1 · **ใช้ราคา close เท่านั้น
   ห้ามนับ wick-break เป็น BOS**
4. Bearish OB: mirror ทุกข้อ (up candle + displacement ลง + ทะลุ swing low ด้วย close)

**Fields ต่อ OB (ทั้งหมด derive ได้จาก OHLC ไม่มีดุลพินิจ):**

| field | นิยาม |
|---|---|
| timeframe | tf ที่ตรวจ ("4H"/"1H"/"15M"/"5M") |
| direction | BULLISH / BEARISH |
| candle | {t, open, high, low, close} ของ C[i] |
| bodyZone | bullish: [min(open,close), max(open,close)] |
| wickZone | bullish: [low, min(open,close)] · bearish: [max(open,close), high] |
| refinedZoneCandidate | bodyZone ∪ 50% ของ wickZone ฝั่ง extreme (zone ที่ส่งให้ shadow) |
| displacementRef | {index j, bodyMult, atrMult} ของ candle displacement |
| structureConfirm | "BOS" / "CHOCH" / "MSS" + ราคา swing ที่ถูกทะลุ + t ของ candle ยืนยัน |
| mitigation | ดู §1.2 |
| invalidationPrice | bullish: `low[i]` · bearish: `high[i]` (close ทะลุ = INVALIDATED) |
| ageCandles | จำนวน candle ปิดหลัง C[i] |
| qualityScore | §4 |

**§1.1 Deterministic swing**: pivot fractal `L`=2 — `high[k]` เป็น swing high เมื่อสูงกว่า
high ของ L candles ก่อนและหลัง (ต้องรอ L candles ปิดยืนยัน) mirror สำหรับ swing low
MSS = CHOCH ที่มี displacement ≥ เกณฑ์ข้อ 2

**§1.2 Mitigation state machine** (ตรวจจาก candle หลัง zone เกิด):
- `FRESH` — ราคายังไม่เคยกลับเข้า refinedZoneCandidate
- `PARTIALLY_MITIGATED` — เคยแตะ zone แต่ลึก < 50% และยังไม่ close ทะลุ invalidation
- `MITIGATED` — แตะลึก ≥ 50% หรือแตะ ≥ `MIT_MAX=2` ครั้ง
- `INVALIDATED` — มี close (tf เดียวกัน) ทะลุ invalidationPrice
- age > `MAX_AGE` (4H:60 · 1H:96 · 15M:192 candles) → ตัดทิ้งจาก candidate list

ห้าม "ดูเหมือน OB" — ทุกเงื่อนไขเป็นตัวเลข ทุก threshold เป็น constant ที่ test ได้

---

## 2) Task B — Exact FVG definition (deterministic)

โครงสร้าง 3 แท่ง `A=C[i-1], B=C[i], C=C[i+1]` (ปิดแล้วทั้งหมด):

- **Bullish FVG**: `low[C] > high[A]` → gap = [high[A], low[C]]
- **Bearish FVG**: `high[C] < low[A]` → gap = [high[C], low[A]]
- ขนาดขั้นต่ำ: `gapSize ≥ FVG_MIN_ATR × ATR(tf,14)` (default 0.25×) กัน micro-gap noise

**Fields ต่อ FVG:**

| field | นิยาม |
|---|---|
| timeframe / direction | ตามตรวจ |
| structure | {t,o,h,l,c} ของ A, B, C |
| gapHigh / gapLow | ขอบ gap ตามนิยามบน |
| midpoint (CE) | (gapHigh+gapLow)/2 — consequent encroachment |
| fillPct | สัดส่วน gap ที่ราคาย้อนเข้ามาแล้ว (0–100, จาก extreme ของ candle หลัง C) |
| mitigation | FRESH (fill=0) / PARTIALLY_MITIGATED (<50) / MITIGATED (≥50 แตะ CE) / FULLY_FILLED (100) → fully filled = หมดสภาพ |
| obRelation | `OB_OVERLAP` (ช่วงทับ OB ≥ 30% ของ gap) / `OB_ADJACENT` (ขอบห่าง ≤ 0.5×ATR) / `NO_OB_CONTEXT` |
| displacementStrength | body[B] / medianBody(20) |
| qualityScore | §4 |

**Invalidation**: bullish FVG ตายเมื่อ close < gapLow · bearish ตายเมื่อ close > gapHigh ·
อายุเกิน MAX_AGE เดียวกับ OB → ตัดทิ้ง

---

## 3) Task C — Multi-timeframe model

ใช้ข้อมูลที่มีจริง (snapshot มี 1D/4H/1H/15M/5M × 200 แท่ง · **ไม่มี 1m → mark OPTIONAL/FUTURE**):

| บทบาท | TF | ใช้ทำอะไร |
|---|---|---|
| Bias | **4H** (1D ประกอบ) | ทิศ external structure + ห้ามมี zone สวน bias |
| External liquidity / TP | **4H/1H** | swing high/low ที่ยังไม่ถูก sweep = target |
| Zone | **1H หลัก, 15M รอง** | OB/FVG ที่ผ่านนิยาม §1–2 |
| Entry confirmation | **5M** | CHOCH ระดับ micro ใน zone (มี candles 5M แล้ว) · 1m = future |
| Premium/Discount | **1H dealer range** | swing-to-swing ล่าสุด; LONG เอาเฉพาะ zone ใน discount (< EQ), SHORT เฉพาะ premium |

**Conflict rules (กันสัญญาณตีกัน):**
1. zone ที่ direction สวน 4H bias → ตัดทิ้งตั้งแต่ detector (ไม่ใช่แค่หักคะแนน)
2. 1H zone กับ 15M zone ทับกัน → ใช้ 1H เป็น zone หลัก, 15M เป็น refinement ภายใน
3. 5M CHOCH สวน zone direction ขณะราคาอยู่ใน zone → zone เป็น WATCH ไม่เป็น candidate
4. regime จาก canonicalMarketRegime ขัด (เช่น RANGE แต่ขอ trend-continuation zone) → penalty §4 ไม่ใช่ตัดทิ้ง (เก็บไว้วัด)

---

## 4) Task D — `obFvgZoneQualityScore` (0–100, clamp)

Base 0, บวก/ลบตามนี้ (ทุกตัวมี input ชัดเจน ไม่มีดุลพินิจ):

| + | เงื่อนไข (ตรวจจาก) |
|---|---|
| +15 | HTF bias aligned (4H structure direction == zone direction) |
| +15 | displacement strength ≥ 2.0× medianBody (1.5–2.0 ได้ +8) |
| +15 | มี BOS/CHOCH close-confirmed หลัง zone |
| +10 | FVG overlap OB (`OB_OVERLAP`) |
| +10 | อยู่ฝั่ง discount/premium ถูกต้องเทียบ EQ ของ dealer range |
| +10 | มี liquidity sweep ก่อน reaction (wick ทะลุ swing เดิมแล้ว close กลับ — ตรวจจาก candle) |
| +10 | invalidation ใกล้ (riskDistance ≤ 1.2×ATR) |
| +10 | HTF target ยังไม่ถูก sweep และ rewardDistance ≥ requiredRR×risk |
| +5 | FRESH (ยังไม่ mitigated) |

| − | เงื่อนไข |
|---|---|
| −20 | zone อยู่กลาง dealer range (ระหว่าง 40–60% ของ range) |
| −20 | MITIGATED แล้ว |
| −20 | target ใกล้เกิน (rewardDistance < risk) |
| −15 | costR > 0.25 (cost drag สูงเทียบ risk) |
| −15 | regime ขัด (canonical regime สวนทาง) |
| −10 | age > 50% ของ MAX_AGE |

Threshold (ตรงตาม spec): `<50` ignore · `50–64` watch only · `65–74` shadow candidate ·
`75+` high-quality shadow candidate — **ทุกระดับยังเป็น shadow เท่านั้น**

---

## 5) Task E — Exact refined entry (shadow-only)

**LONG** (zone = bullish OB/FVG ใน discount):
- quality 65–74 → entry = conservative edge (ขอบบนของ zone)
- quality ≥ 75 → entry = midpoint/CE (ลึกขึ้น RR ดีขึ้น เพราะ zone น่าเชื่อขึ้น)
- stop = `min(OB.invalidationPrice, sweepLow ถ้ามี)` − buffer `0.1×ATR`
- target = HTF liquidity (swing 4H/1H ที่ยังไม่ sweep) หรือ TP1 เดิมของ strategy แล้วแต่ใกล้กว่า
- rawRR = (target−entry)/(entry−stop) · netRR = rawRR − costR (สูตรเดียวกับ rrBlockerDrilldown)

**SHORT**: mirror (bearish zone ใน premium, stop = max(invalidation, sweepHigh)+buffer)

Output ส่งเข้า pipeline เดิม: `optionalObZone/optionalFvgZone` ของ
`mtfObFvgRefinementShadow` + ตั้ง `usesExactObFvgZones=true` → dataStatus เปลี่ยนจาก
HEURISTIC_ESTIMATE_ONLY โดย **ไม่แตะ logic ภายใน shadow** — ไม่มี activation path ใด ๆ
ในเอกสารนี้ และห้ามออกแบบปุ่ม/flag เปิด execution

---

## 6) Task F — Data availability audit

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| OHLC 4H/1H/15M/5M | **AVAILABLE** | `market_snapshot.market_data.klines` 200 แท่ง/TF + `candleAdapter` รองรับ |
| OHLC 1m | **MISSING → NOT_REQUIRED_YET** | LTF confirm ใช้ 5M ไปก่อน |
| ความยาว history | **PARTIAL** | 200 แท่งพอสำหรับ lookback 50–100 · 5M=~16ชม. สั้นสำหรับ stat ระยะยาว |
| Swing high/low utility | **PARTIAL** | มีแค่ max/min window 1H ใน trendZoneBuilder — ไม่ใช่ fractal pivot ต้องสร้างใหม่ใน d1 |
| BOS/CHOCH/MSS | **MISSING (มีแต่ display field)** | VM มี field bos/choch/mss แต่ source (`latest_decision.levels.smc`) มีแค่ swing/eq → ค่า null ไม่มี calculator จริง |
| FVG utility | **MISSING** | มีเฉพาะ heuristic shadow |
| OB utility | **MISSING** | เช่นกัน |
| Liquidity sweep detection | **PARTIAL** | มีแค่ session label `liquidity_sweep_probability` — ไม่ detect จาก candle |
| Premium/discount range | **PARTIAL** | `eq_1h` simple range — ต้องยกระดับเป็น dealer range จาก fractal swing |
| Session data | **AVAILABLE** | `meta.session` (current/overlap/risk_overlay) |
| Fee/slippage config | **AVAILABLE** | `trendPaperConfigPublic` |
| Shadow plumbing (input/log/review) | **AVAILABLE** | optionalObZone/FvgZone + c1 snapshot + c2 review พร้อมรับ exact data |
| Heuristic-vs-exact comparison store | **DESIGN_ONLY** | ใช้ d4 |

**สรุป: ไม่มี blocker ระดับข้อมูลดิบ** — candles ครบ แต่ detector layer (fractal swing → BOS/CHOCH → OB/FVG → sweep → dealer range) ยังไม่มี ต้องสร้างเป็น pure functions ใหม่ทั้งหมด

---

## 7) Risk / overfitting warnings

1. **Threshold mining**: ค่า DISP_BODY_MULT/FVG_MIN_ATR/quality weights ถูกตั้งจากหลักการ ไม่ใช่ fit จากข้อมูล — ห้าม tune จาก sample ชุดเดียวกับที่ใช้ตัดสิน (in-sample bias)
2. **Shadow ≠ fill จริง**: refined entry ที่ลึกกว่าอาจ **ไม่เคย fill** — d5 ต้องนับ "would-have-filled" (ราคาย้อนแตะ entry ก่อนถึง invalidation) ไม่ใช่นับแค่ RR สวยขึ้น มิฉะนั้น +0.29 คือภาพลวง
3. **Lookahead**: ห้ามใช้ candle ยังไม่ปิด / ห้ามใช้ swing ที่ยังไม่ confirm ครบ L แท่ง
4. **Sample ปัจจุบันยัง heuristic**: ตัวเลข +0.29 มาจาก estimate — ห้ามใช้เป็นหลักฐานอนุมัติ activation ใด ๆ
5. **Regime dependency**: ผล shadow ต้องแยกตาม regime/session ใน d5 — ค่าเฉลี่ยรวมอาจซ่อน regime ที่แย่
6. 200 แท่ง/TF จำกัด zone เก่า — zone HTF ที่เกิดก่อนหน้าต่างจะมองไม่เห็น (ยอมรับ + บันทึกใน d4 ว่า window เท่าไร)

---

## 8) Task G — Implementation roadmap (ทุกเฟสต้องอนุมัติก่อน)

| เฟส | ทำอะไร | ไฟล์ที่น่าจะแตะ | tests | ข้อห้าม/non-goals |
|---|---|---|---|---|
| **d1** | fractal swing + **exact FVG detector** (pure, read-only) | ใหม่: `lib/trend/smcSwing.ts`, `lib/trend/exactFvgDetector.ts` + tests | gap ทุกแบบ, min-size, fillPct, invalidation, ไม่มี lookahead (fixture candles) | ไม่แตะ shadow/runner/UI · ไม่ผูก candleAdapter จริง (รับ array) |
| **d2** | **exact OB detector** (pure) ใช้ swing จาก d1 | ใหม่: `lib/trend/exactObDetector.ts` + tests | displacement rules, BOS close-confirm, mitigation state machine, age expiry | เหมือน d1 |
| **d3** | **MTF merger + qualityScore** (pure) | ใหม่: `lib/trend/obFvgZoneQuality.ts` + tests | conflict rules §3, score §4 ทุก component, threshold bands | ยังไม่ป้อนเข้า shadow |
| **d4** | ป้อน exact zones เข้า shadow + snapshot (`usesExactObFvgZones=true`) | route hook เดิม (จุด c1) + builder เรียก detector — **ประสานกับ Codex เรื่อง c2 files ก่อน** | snapshot ใหม่ valid, ของเก่า valid, best-effort | ไม่แตะ runner/threshold · log เพิ่ม field optional เท่านั้น |
| **d5** | เปรียบเทียบ heuristic vs exact ≥100 samples + **would-have-filled analysis** | pure aggregator + review extension + UI read-only | นับ fill ถูก, แยก regime/session, ไม่อ่านกลับเข้า decision | ไม่มี recommendation อัตโนมัติให้เปลี่ยน entry |
| **d6** | ข้อเสนอ controlled experiment (paper-only) | docs + operator pack | — | **ต้อง operator approve เป็นลายลักษณ์** · ยังไม่มี live/exchange เด็ดขาด |

Expected output ต่อเฟส: pure helpers + tests ผ่าน + ไม่มี import เข้า decision path (ใส่ isolation test แบบเดียวกับ rrBlockerDrilldown ทุกเฟส)

---

## 9) Safety invariants (ซ้ำเพื่อ lock)

detector ทุกตัวเป็น pure function รับ candle array — ห้าม I/O, ห้าม fetch, ห้าม BingX ·
ห้าม import โดย strategy/gate/preflight/runner/execution/broker/writer ใด ๆ ·
ไม่มี UI ปรับ threshold · ไม่มี activation flag ใหม่ · paper-only ตลอดสาย d1–d5,
d6 เป็นเพียง proposal
