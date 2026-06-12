# T-3H-6-d2 Prep — Exact Order Block Detector: Design & Acceptance Spec

> Status: **SPEC ONLY** (2026-06-12) — เอกสารเตรียมงานสำหรับ Codex implement เฟส d2
> อิง d1 ที่ลงแล้วจริง: `smcSwing.ts` (findFractalSwings, L/R=2, confirmByClose default true)
> และ `exactFvgDetector.ts` (ExactFvg มี `obRelation: "NOT_EVALUATED"` รอ d2/d3 เติม)
> Invariants เดิมทั้งหมดคงอยู่: paper-only · live=false · exchange=false · M-0B/2-B BLOCKED ·
> adaptive RR disabled · OB/FVG execution disabled · ไม่มี entry behavior change

## 1) Exact OB definition (Task A)

Input: `readonly SmcCandle[]` (shape เดียวกับ d1: {time?, open, high, low, close}) ปิดแล้วทั้งหมด

**Bullish OB**: candle `C[i]` เป็น bearish (`close < open`) ตัวสุดท้ายก่อน displacement ขึ้น —
ภายใน `maxDisplacementLookahead=3` แท่งถัดไป ต้องมีแท่ง j ที่:
(1) `close[j] > สวิงไฮยืนยันล่าสุดก่อน i` (**close-break เท่านั้น**)
(2) displacement ≥ acceptable (§4)
ถ้ามี bearish candle ติดกันหลายแท่งก่อน displacement → ใช้**แท่งสุดท้าย** (ใกล้ displacement สุด) เป็น OB
**Bearish OB**: mirror (bullish candle สุดท้ายก่อน displacement ลง + close ต่ำกว่าสวิงโลว์ยืนยัน)

Output object (ครบทุก field ตาม task spec):

```ts
export interface ExactOrderBlock {
  id: string;                       // `ob:${timeframe}:${direction}:${obIndex}`
  timeframe?: string;
  direction: "BULLISH" | "BEARISH";
  obIndex: number;                  // index ของ OB candle
  obTime?: number | string;
  candleOpen: number; candleHigh: number; candleLow: number; candleClose: number;
  bodyLow: number;                  // min(open, close)
  bodyHigh: number;                 // max(open, close)
  wickLow: number;                  // = candleLow
  wickHigh: number;                 // = candleHigh
  zoneLower: number;                // bullish: candleLow  · bearish: bodyLow
  zoneUpper: number;                // bullish: bodyHigh   · bearish: candleHigh
  refinedLower: number;             // bullish: bodyLow − 0.5×(bodyLow−candleLow)
  refinedUpper: number;             // bearish: bodyHigh + 0.5×(candleHigh−bodyHigh) · อีกฝั่ง = ขอบ body
  midpoint: number;                 // (zoneLower+zoneUpper)/2
  invalidationPrice: number;        // bullish: candleLow · bearish: candleHigh
  displacementStartIndex: number;   // i+1
  displacementEndIndex: number;     // j (แท่งที่ close-break)
  bosIndex: number;                 // = displacementEndIndex (d2 ใช้ BOS เดียว)
  bosLevel: number;                 // ราคา swing ที่ถูกทะลุ
  bosClose: number;                 // close ของแท่งที่ทะลุ
  displacementStrength: number;     // 0–100 (§4)
  ageBars: number;                  // lastIndex − obIndex
  mitigationStatus: "FRESH" | "PARTIALLY_MITIGATED" | "MITIGATED" | "INVALIDATED";
  fillPct: number;                  // §3
  fvgRelation: "OB_OVERLAP" | "OB_ADJACENT" | "FVG_AFTER_DISPLACEMENT" | "NO_FVG_CONTEXT"; // §5
  classification: ExactObClassification; // §2
  qualityScore: number;             // 0–100 (§6)
  source: "EXACT_OB_DETECTOR_V1";
}
```

Options (default ทุกตัวเป็น constant, มี test):
`{ timeframe?, swingLeftBars=2, swingRightBars=2, minBodyMultiple=1.5, minRangeAtrMultiple=1.0,
atrPeriod=14, medianBodyLookback=20, maxDisplacementLookahead=3, maxAgeBars=96,
maxSwings?, exactFvgs?: readonly ExactFvg[] }`

## 2) Structure confirmation (Task B)

ใช้ d1 จริง: `findFractalSwings(candles, {leftBars:2, rightBars:2, confirmByClose:true})` แล้วหา
**swing ยืนยันล่าสุดที่ index < obIndex** (swing ต้อง confirm ครบ rightBars ก่อนตำแหน่ง OB —
กัน lookahead: swing ที่ confirmation candle อยู่หลัง displacement ใช้ไม่ได้)

- Bullish OB valid เมื่อ `close[j] > latestConfirmedSwingHigh.price`
- Bearish OB valid เมื่อ `close[j] < latestConfirmedSwingLow.price`
- **wick ทะลุแต่ close ไม่ผ่าน = ไม่ใช่ BOS** → candidate ตกเป็น `NO_STRUCTURE_CONFIRMATION`
- ไม่มี swing ยืนยันก่อนหน้า → `NO_STRUCTURE_CONFIRMATION`
- d2 ใช้ **close-confirmed BOS อย่างเดียว** — ไม่มี CHOCH/MSS (เลื่อนไป d3)

Classifications (เรียงลำดับ precedence ตอน assign):
`INSUFFICIENT_DATA` (candles < swingWindow+lookahead) → `NO_STRUCTURE_CONFIRMATION` →
`WEAK_DISPLACEMENT` (§4 < 40) → `INVALIDATED` → `TOO_OLD` (age > maxAgeBars) →
`ALREADY_MITIGATED` → `CONFLICTING_DIRECTION` (caller ส่ง bias เข้ามาแล้วสวน — optional input) →
`TARGET_TOO_CLOSE` (optional: caller ส่ง target แล้ว reward < risk) → `VALID_OB`
หมายเหตุ: `CONFLICTING_DIRECTION`/`TARGET_TOO_CLOSE` ประเมินเฉพาะเมื่อ caller ให้ context
(optional input `htfBias?`, `targetPrice?`) — ไม่ให้ก็ข้าม ไม่ reject

## 3) Mitigation state machine (Task C)

ตรวจจากแท่ง **หลัง** `displacementEndIndex` เท่านั้น (แท่ง displacement เองไม่นับ):

```
fillPct (bullish) = clamp01plus( (zoneUpper − minLowAfter) / (zoneUpper − zoneLower) )
fillPct (bearish) = clamp01plus( (maxHighAfter − zoneLower) / (zoneUpper − zoneLower) )
  โดยนับเฉพาะแท่งที่ low/high เข้ามาแตะ zone แล้ว · ไม่เคยแตะ → 0
```

| state | เงื่อนไข (deterministic, ประเมินตามลำดับ) |
|---|---|
| `INVALIDATED` | มีแท่ง **close** ทะลุ invalidationPrice (bullish: close < candleLow · bearish: close > candleHigh) — **wick-only ไม่ invalidate** (นิยามชัดตาม task: ใช้ close เท่านั้น) |
| `MITIGATED` | fillPct ≥ 1 (ราคา traverse เต็ม zone ถึง zoneLower/zoneUpper ฝั่ง extreme ด้วย wick ก็นับ) |
| `PARTIALLY_MITIGATED` | 0 < fillPct < 1 |
| `FRESH` | fillPct = 0 |

fillPct: `0` = untouched · `0–1` = partial · `≥1` = mitigated (ตรงตาม task spec) ·
รายงานค่า fillPct จริงเสมอ (cap ที่ 1 ใน output) · age > maxAgeBars → classification `TOO_OLD` (state คงค่าที่เป็น)

## 4) Displacement scoring (Task D)

Inputs ทั้งหมดคำนวณจาก candle array (ATR/medianBody สูตรเดียวกับ d1 exactFvgDetector เพื่อความสม่ำเสมอ):

```
bodyMultiple    = body[j] / medianBody(lookback=20 ก่อน j)
rangeAtrMultiple= range[j] / ATR(14 ณ j)
closeBreakAtr   = |close[j] − bosLevel| / ATR(14 ณ j)
fvgBoost        = 1 ถ้ามี ExactFvg (จาก d1) เกิดใน displacement leg, else 0

displacementStrength = round(clamp(
    25 × min(bodyMultiple / 2, 1)
  + 25 × min(rangeAtrMultiple / 2, 1)
  + 30 × min(closeBreakAtr / 1, 1)
  + 20 × fvgBoost
, 0, 100))
```

Bands (ตรงตาม task): `<40` weak → `WEAK_DISPLACEMENT` (OB ตกเกณฑ์) · `40–59` acceptable ·
`60–79` strong · `80+` impulsive — **OB ต้อง ≥ 40** · ATR คำนวณไม่ได้ (แท่งไม่พอ) → ใช้เฉพาะ
เทอม bodyMultiple + fvgBoost แล้ว scale (45 max → คูณ 100/45) พร้อม flag `atrAvailable:false` แบบ d1

## 5) OB/FVG confluence (Task E)

รับ `exactFvgs?: readonly ExactFvg[]` (output จาก `detectExactFvgs` ของ d1 **เท่านั้น** —
ห้ามรับ/สร้าง zone heuristic) เทียบเฉพาะ FVG ที่ direction เดียวกับ OB และยังไม่ INVALIDATED:

| relation | เงื่อนไข |
|---|---|
| `OB_OVERLAP` | ช่วง [gapLow,gapHigh] ทับ [zoneLower,zoneUpper] ≥ 30% ของ gap size |
| `OB_ADJACENT` | ไม่ overlap แต่ขอบใกล้สุดห่าง ≤ 0.5 × ATR |
| `FVG_AFTER_DISPLACEMENT` | FVG.startIndex อยู่ใน [displacementStartIndex−1, displacementEndIndex+1] (gap ที่ displacement leg สร้าง) |
| `NO_FVG_CONTEXT` | ไม่เข้าเงื่อนไขใด หรือไม่ได้ส่ง exactFvgs มา |

precedence: OVERLAP > AFTER_DISPLACEMENT > ADJACENT · FVG เพิ่มคะแนน (§6) —
**ไม่มี FVG ไม่ reject OB** · d2 ควร export helper `evaluateObFvgRelation(ob, fvgs)` แยก เพื่อให้
d3 ใช้เติม `obRelation` ฝั่ง ExactFvg ได้โดยไม่แก้ d1

## 6) Quality score (Task F)

Base 0 → บวก/ลบ → clamp 0–100 (ทุก component มี input ชัด · component ที่ไม่มี context = 0):

บวก: `+20` close-confirmed BOS (เป็นเงื่อนไขบังคับอยู่แล้ว — VALID_OB ทุกตัวได้) ·
`+15` displacementStrength ≥ 60 (40–59 ได้ +8) · `+15` FRESH · `+10` fvgRelation เป็น
OVERLAP/AFTER_DISPLACEMENT (+5 ถ้า ADJACENT) · `+10` htfBias aligned (ถ้า caller ส่ง) ·
`+10` discount/premium ถูกฝั่ง (ถ้า caller ส่ง dealerRange) · `+10` invalidation ใกล้
(zoneHeight ≤ 1.2×ATR) · `+5` ageBars ≤ 25% maxAge · `+5` target distance พอ (ถ้า caller ส่ง target)

ลบ: `−20` MITIGATED · `−25` INVALIDATED · `−20` กลาง dealer range (40–60%) ·
`−15` weak displacement · `−15` regime ขัด (ถ้า caller ส่ง) · `−15` target ใกล้เกิน ·
`−10` age > 50% maxAge

Bands: `<50` ignore · `50–64` watch · `65–74` shadow candidate · `75+` high-quality shadow —
**ทั้งหมด shadow-only** ห้ามผูก activation

## 7) Test fixtures (Task G) — ตัวเลขใช้ได้จริง

ทุก fixture ใช้ format `{o,h,l,c}` · swing options default (L=2,R=2,confirmByClose)

**FX-1 Valid bullish OB** (12 แท่ง):
```
i0  100.0/101.0/99.0/100.5    i1 100.5/102.0/100.0/101.5
i2  101.5/105.0/101.0/104.0   ← swing-high candidate (105.0)
i3  104.0/104.5/102.5/103.0   i4 103.0/103.5/101.5/102.0  ← confirm swing@i2 (close 102<105)
i5  102.0/102.5/100.5/101.0
i6  101.0/101.5/99.5/100.0    ← bearish OB candle (body 100–101, wickLow 99.5)
i7  100.0/106.0/99.8/105.8    ← displacement: close 105.8 > 105.0 (BOS by close), body 5.8 ≈ 5.8×median
i8  105.8/107.0/105.0/106.5   i9 106.5/107.5/105.5/107.0
i10 107.0/107.5/106.0/106.8   i11 106.8/107.2/106.2/106.5
```
expect: VALID_OB · obIndex=6 · zone [99.5,101] · refined [99.75,101] · invalidation 99.5 ·
bosLevel 105.0 · bosIndex 7 · FRESH (fillPct 0) · displacement ≥ 60

**FX-2 Valid bearish OB**: mirror FX-1 (กลับเครื่องหมายรอบ 100)

**FX-3 Wick-only break rejected**: เปลี่ยน i7 → `100.0/106.0/99.8/104.8` (wick ทะลุ 105 แต่ close 104.8)
→ NO_STRUCTURE_CONFIRMATION, ไม่มี VALID_OB

**FX-4 Weak displacement rejected**: i7 → `100.0/105.3/99.9/105.1` (close ผ่าน 105 นิดเดียว body 5.1?
ปรับ: body เล็ก — `104.9/105.3/104.6/105.1` ไม่ติด OB เพราะ body 0.2 ≈ 0.2×median, closeBreak 0.1/ATR)
→ WEAK_DISPLACEMENT

**FX-5 No prior swing**: ใช้แท่ง flat 6 แท่งแรก (ไม่มี fractal confirm) + i6/i7 ของ FX-1
→ NO_STRUCTURE_CONFIRMATION

**FX-6 Partial mitigation**: FX-1 + i12 `106.5/106.8/100.2/106.0` → low 100.2 เข้า zone,
fillPct = (101−100.2)/1.5 ≈ 0.533 → PARTIALLY_MITIGATED

**FX-7 Full mitigation**: FX-1 + i12 `106.5/106.8/99.5/100.8` → low แตะ 99.5 → fillPct 1 → MITIGATED

**FX-8 Invalidation by close**: FX-1 + i12 `100.5/100.8/99.0/99.2` → close 99.2 < 99.5 → INVALIDATED
(และ FX-8b: low 99.2 แต่ close 100.6 → ยังไม่ INVALIDATED — กัน wick-only invalidation)

**FX-9 FVG boost**: FX-1 มี bullish FVG จริงจาก d1 (A=i6 high 101.5, C=i8 low 105 → gap [101.5,105])
→ fvgRelation = FVG_AFTER_DISPLACEMENT → quality สูงกว่ารัน FX-1 แบบไม่ส่ง exactFvgs

**FX-10 Determinism/immutability**: deep-freeze candle array → เรียก 2 ครั้ง ผล deepEqual + input ไม่เปลี่ยน

เพิ่มที่ควรมี: zero-height zone guard (OB candle เป็น doji body≈0 → ข้าม/INSUFFICIENT) ·
หลาย bearish candle ติดกัน → เลือกแท่งสุดท้าย

## 8) Known risks / false positives

ตลาด chop: BOS close-break เกิดถี่ → displacement gate ≥40 คือด่านกรองหลัก อย่าลดเกณฑ์ ·
swing เพิ่ง confirm พอดีตำแหน่ง displacement → ต้อง assert ใน test ว่า swing.index+rightBars ≤ j
(กัน lookahead) · OB ซ้อนหลายชั้นใน leg เดียว → ใช้แท่งสุดท้ายก่อน displacement เท่านั้น ·
ตัวเลข fixture เป็น synthetic — d5 เท่านั้นที่ตอบว่า zone จริง fill จริง ·
ห้าม tune default constants จาก sample ที่ใช้ตัดสินผล (in-sample bias)

## 9) Data dependencies จาก d1 (ยืนยันจากไฟล์จริงแล้ว — ไม่มี assumption)

`SmcCandle`/`findFractalSwings`/`getLatestSwingHigh`/`getLatestSwingLow` (smcSwing.ts) ·
`ExactFvg`/`detectExactFvgs` types (exactFvgDetector.ts) · ATR/medianBody pattern ภายใน
exactFvgDetector เป็น private — d2 implement ซ้ำในไฟล์ตัวเอง (คงความ pure แยกไฟล์) หรือ
Codex อาจ refactor เป็น shared util ก็ได้แต่**ห้ามแก้ public API ของ d1**

## 10) Codex handoff — T-3H-6-d2 implementation

```
T-3H-6-d2: exact Order Block detector (pure, read-only, tests only)

Files:
- NEW dashboard/lib/trend/exactOrderBlockDetector.ts
- NEW dashboard/lib/trend/exactOrderBlockDetector.test.ts
Spec: docs/T-3H-6d2_exact_ob_spec.md (sections 1-7 are the acceptance criteria)

Allowed:
- import { findFractalSwings, ... } from "./smcSwing.ts"
- import type { ExactFvg } from "./exactFvgDetector.ts" (+ detectExactFvgs in tests)
- pure functions over candle arrays; deterministic; no I/O

Required tests: fixtures FX-1..FX-10 + doji guard + lookahead guard
+ isolation test: trendStrategy/trendManualPaperArmGate/trendPaperExecutionPreflight/
  trendPaperEvidenceRunner must not contain "exactOrderBlockDetector"

Not allowed: UI, runner, route, snapshot wiring, trading decision, entry logic,
threshold change, execution, live/order/exchange, modifying d1 public API
```

## 11) Safety invariants

detector = pure function · ห้าม import เข้า decision path (isolation test บังคับ) ·
ไม่มี activation/flag/UI ใหม่ · d2 จบที่ tests ผ่าน — การ wire เข้า shadow คือ d4 แยกอนุมัติ
