# T-3H-6-d3 Prep — MTF Zone Merger + Quality Score Spec

> Status: **SPEC ONLY** (2026-06-12) — เตรียมสำหรับ Codex implement d3
> อิง interface จริงที่ลงแล้ว: d1 `exactFvgDetector.ts` (ExactFvg) และ d2
> `exactOrderBlockDetector.ts` (ExactOrderBlock, ExactOrderBlockContext, evaluateObFvgRelation,
> quality bands IGNORE/WATCH_ONLY/SHADOW_CANDIDATE/HIGH_QUALITY_SHADOW) — ไม่มี assumption
> Invariants คงเดิมทั้งหมด: paper-only · live=false · exchange=false · M-0B/2-B BLOCKED ·
> adaptive RR disabled · OB/FVG execution disabled · d3 เป็น pure read-only ไม่แตะ d1/d2

## 1) MTF model

d3 เป็น **pure merger**: caller (d4 ในอนาคต) เป็นคนรัน detector ต่อ TF แล้วส่งผลเข้ามา —
d3 **ไม่อ่าน candle เอง ไม่เรียก detector เอง** (คุม purity + ทดสอบง่าย)

```ts
export interface MtfZoneMergerInput {
  htf: {                              // 4H (และ/หรือ 1H สำหรับ liquidity)
    bias: "BULLISH" | "BEARISH" | "NEUTRAL" | null;   // จาก summarizeSwingStructure(4H) ของ caller
    externalLiquidityTargets?: { price: number; kind: "SWING_HIGH" | "SWING_LOW"; timeframe: string }[];
  };
  primary: { timeframe: string; obs: readonly ExactOrderBlock[]; fvgs: readonly ExactFvg[] };   // 1H
  refinement?: { timeframe: string; obs: readonly ExactOrderBlock[]; fvgs: readonly ExactFvg[] }; // 15M
  micro?: { timeframe: string; chochAgainstZone?: boolean | null };  // 5M (optional; 1M = future)
  context?: {
    dealerRange?: { low: number; high: number } | null;  // 1H fractal-swing range
    regime?: string | null;
    session?: string | null;
    currentPrice?: number | null;
    targetPrice?: number | null;     // TP1 เดิมของ strategy (fallback target)
    requiredRR?: number | null;
    feePct?: number | null;
    slippagePct?: number | null;
  };
}
```

บทบาท TF (ตาม d-doc §3): 4H = bias + external liquidity · 1H = primary zone · 15M =
refinement ภายใน primary · 5M = micro confirmation flag · **1M = OPTIONAL_FUTURE** (runtime ไม่มี)

## 2) Zone priority + conflict rules

คัด candidate ตามลำดับ (ตกข้อใดข้อหนึ่ง = ตัดหรือลดชั้น):

1. **ตัดทิ้ง**: zone direction สวน `htf.bias` (เมื่อ bias ไม่ใช่ NEUTRAL/null) → ไม่เข้า list
   (นับจำนวนใส่ `conflictingDropped`)
2. **ตัดทิ้ง**: OB ที่ classification ≠ `VALID_OB` · FVG ที่ INVALIDATED/FULLY_FILLED
   (close-confirmed BOS การันตีจาก d2 อยู่แล้ว — merger ไม่ผ่อนเกณฑ์)
3. **จัดอันดับ** เมื่อหลาย zone แข่งกัน:
   OB+FVG confluence (OB_OVERLAP > FVG_AFTER_DISPLACEMENT > OB_ADJACENT) >
   OB เดี่ยว > FVG เดี่ยว · FRESH > PARTIALLY_MITIGATED (MITIGATED ไม่เป็น candidate) ·
   quality สูงกว่า > ต่ำกว่า · ใกล้ currentPrice กว่า > ไกลกว่า (tie-break สุดท้าย: zone ใหม่กว่า)
4. **Refinement**: 15M zone ที่อยู่ **ภายใน** ขอบ 1H zone → ใช้บีบ `refinedEntry`;
   15M zone นอก 1H zone → ignore (ไม่สร้าง candidate อิสระใน d3)
5. **Micro**: `micro.chochAgainstZone === true` → readiness เป็น `CONFLICTING_MTF` (zone ยังอยู่ใน list แต่ห้ามเป็น top candidate)
6. **Target gate**: rewardDistance ≥ requiredRR × riskDistance ไม่ผ่าน → `TARGET_TOO_CLOSE`
7. **Cost gate**: netRR < requiredRR ทั้งที่ rawRR ผ่าน → `COST_TOO_HIGH`

## 3) Merged output interface

```ts
export interface MtfMergedZone {
  id: string;                        // `mtfzone:${primaryTimeframe}:${direction}:${obId|fvgId}`
  direction: "BULLISH" | "BEARISH";
  htfBias: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  primaryTimeframe: string;          // "1H"
  refinementTimeframe: string | null; // "15M" เมื่อมี refinement ใช้จริง
  zoneType: "OB_FVG_CONFLUENCE" | "OB_ONLY" | "FVG_ONLY";
  obId: string | null;               // จาก ExactOrderBlock.id
  fvgId: string | null;              // จาก ExactFvg.id
  lower: number;                     // ขอบ zone รวม (union ของ OB/FVG ที่ confluence)
  upper: number;
  midpoint: number;
  refinedEntry: number;              // quality ≥75 → midpoint/CE · 65–74 → conservative edge ·
                                     // มี 15M refinement → ขอบ 15M ภายใน zone
  invalidationPrice: number;         // จาก OB เป็นหลัก (FVG_ONLY → FVG.invalidationPrice)
  targetPrice: number | null;        // HTF liquidity ที่ใกล้ที่สุดเหนือ/ใต้ entry · fallback context.targetPrice
  rawRR: number | null;              // (target−entry)/(entry−invalidation) ตามทิศ
  netRR: number | null;              // rawRR − costR (สูตร costR เดียวกับ rrBlockerDrilldown)
  qualityScore: number;              // 0–100 (§4)
  confidence: "LOW" | "MEDIUM" | "HIGH"; // LOW <60 · MEDIUM 60–74 · HIGH ≥75 (จาก qualityScore + data ครบ)
  dataStatus: "EXACT_DETECTOR_OUTPUT";   // d3 รับเฉพาะ exact — ห้าม heuristic เข้า merger
  readiness: MtfZoneReadiness;       // §5
  warnings: string[];
  paperOnly: true;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
  source: "MTF_OB_FVG_ZONE_MERGER_V1";
}
```

ฟังก์ชันหลัก: `mergeMtfZones(input): { zones: MtfMergedZone[]; topCandidate: MtfMergedZone | null;
readiness: MtfZoneReadiness; conflictingDropped: number; warnings: string[] }`
(zones เรียงตาม priority §2 · topCandidate = zone แรกที่ readiness ไม่ใช่ CONFLICTING/TARGET/COST)

## 4) Quality aggregation (0–100, clamp)

```
base      = 0.5 × obQuality + 0.3 × fvgQuality + 20   (OB_ONLY: 0.7×ob+10 · FVG_ONLY: 0.6×fvg)
+10  MTF alignment (htfBias ตรง — zone ที่สวนถูกตัดแล้ว แต่ NEUTRAL bias ไม่ได้คะแนนนี้)
+5   FRESH ทั้ง OB และ FVG
+5   มี 15M refinement ภายใน zone
−10  PARTIALLY_MITIGATED (ตัวใดตัวหนึ่ง)
−10  regime ขัด (context.regime ชี้ RANGE ขณะ zone เป็น trend-continuation)
−5   session เสี่ยง (context.session เป็น low-liquidity window)
−15  TARGET_TOO_CLOSE
−15  COST_TOO_HIGH (netRR < requiredRR)
−10  micro CHOCH สวน
```
obQuality/fvgQuality ใช้ `qualityScore` ที่ detector คำนวณมาแล้ว — **ไม่คำนวณซ้ำ**
Bands เดิม: <50 ignore · 50–64 watch · 65–74 shadow candidate · 75+ high-quality (shadow ทั้งหมด)

## 5) Readiness

```ts
export type MtfZoneReadiness =
  | "NO_DATA"               // ไม่มี detector output เข้ามาเลย
  | "FVG_ONLY"              // มีแต่ FVG ผ่านเกณฑ์
  | "OB_ONLY"               // มีแต่ OB ผ่านเกณฑ์
  | "OB_FVG_CONFLUENCE"     // มี confluence แต่ htfBias เป็น NEUTRAL/null
  | "MTF_ALIGNED"           // confluence + htfBias ตรง (สถานะดีสุด)
  | "CONFLICTING_MTF"       // micro CHOCH สวน หรือ refinement/primary direction ขัดกัน
  | "TARGET_TOO_CLOSE"
  | "COST_TOO_HIGH";
```
precedence ตอนสรุประดับ result: NO_DATA → CONFLICTING_MTF → TARGET_TOO_CLOSE →
COST_TOO_HIGH → MTF_ALIGNED → OB_FVG_CONFLUENCE → OB_ONLY → FVG_ONLY

## 6) d3 read-only boundary

ไฟล์เดียว pure: **no runner · no UI · no route · no snapshot wiring · no entry logic ·
no execution · no I/O** · import ได้เฉพาะ types/functions จาก `exactFvgDetector.ts` /
`exactOrderBlockDetector.ts` (+`smcSwing` types ถ้าจำเป็น) · ห้ามแก้ d1/d2 ·
isolation test บังคับ: strategy/gate/preflight/runner/executionEngine ต้องไม่มี string
"mtfZoneMerger" · safety flags hard-false stamp ในทุก output

## 7) d4 plan (อนาคต — แยกอนุมัติ)

1. caller ใน evidence-cycle route (จุด hook c1 เดิม) รัน detectors ต่อ TF จาก
   `getCandlesFromSnapshot` → `mergeMtfZones` → ป้อน topCandidate เป็น
   `optionalObZone/optionalFvgZone` ของ `mtfObFvgRefinementShadow`
2. `usesExactObFvgZones=true` **เฉพาะเมื่อ** zone มาจาก detector output จริง
   (dataStatus="EXACT_DETECTOR_OUTPUT") — ห้าม set จาก heuristic เด็ดขาด
3. snapshot เก็บทั้งคู่ (heuristic เดิม + exact ใหม่) เพื่อเทียบใน d5 ≥100 samples
   รวม would-have-filled analysis ตาม d-doc §7
4. ยังไม่มี execution ทุกกรณี — d6 คือ proposal แยก

## 8) Codex handoff — T-3H-6-d3 implementation

```
T-3H-6-d3: MTF zone merger + quality aggregation (pure, read-only, tests only)

Files:
- NEW dashboard/lib/trend/mtfZoneMerger.ts
- NEW dashboard/lib/trend/mtfZoneMerger.test.ts
Spec: docs/T-3H-6d3_mtf_zone_merger_spec.md (sections 1-6 = acceptance criteria)

Allowed imports: types/values from exactFvgDetector.ts, exactOrderBlockDetector.ts,
smcSwing.ts · pure deterministic functions only

Required tests:
- confluence ranking (OVERLAP > AFTER_DISPLACEMENT > ADJACENT > OB_ONLY > FVG_ONLY)
- bias conflict drop + conflictingDropped count
- FRESH beats PARTIALLY_MITIGATED; MITIGATED/INVALID excluded
- 15M refinement inside 1H tightens refinedEntry; outside is ignored
- micro CHOCH against zone -> CONFLICTING_MTF, not top candidate
- TARGET_TOO_CLOSE / COST_TOO_HIGH gates (use rrBlockerDrilldown cost formula)
- readiness precedence; NO_DATA on empty input; quality aggregation per spec §4
- determinism + input immutability + safety flags hard-false
- isolation: no decision-path file contains "mtfZoneMerger"

Commit criteria: all tests pass + tsc clean + no d1/d2 file modified
Not allowed: UI, runner, route, snapshot wiring (=d4), entry logic, thresholds,
execution, live/order/exchange
```
