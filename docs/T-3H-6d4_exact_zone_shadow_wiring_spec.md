# T-3H-6-d4 Prep — Exact Zone Shadow Wiring Design

> Status: **SPEC ONLY** (2026-06-12) — design สำหรับ Codex implement d4
> **Prerequisite: d3 (`mtfZoneMerger.ts`) ต้อง implement และ merge ก่อน** — ขณะเขียน spec นี้
> d1+d2 ลงแล้ว, d3 มีแต่ spec (docs/T-3H-6d3_mtf_zone_merger_spec.md ซึ่งล็อก interface ไว้แล้ว)
> Invariants คงเดิม: paper-only · live=false · exchange=false · M-0B/2-B BLOCKED ·
> adaptive RR disabled · OB/FVG execution disabled · observe-only ตลอดเฟส

## 1) ผล audit pipeline ปัจจุบัน (c1/c2)

| ชิ้น | สถานะที่ตรวจพบ |
|---|---|
| route `trend-paper-evidence-cycle` | มี builder ภายในที่เรียก `computeRrBlockerDrilldown` + `computeMtfObFvgRefinementShadow` แล้วคืน `{rrSnapshot, smcMtfShadowSnapshot}` แนบเข้า decision record (POST run_once เท่านั้น, best-effort) — **จุดเสียบ d4 คือบรรทัด `optionalObZone: null, optionalFvgZone: null`** (route.ts ~บรรทัด 234–235) |
| `mtfObFvgShadowSnapshot.ts` | `SmcMtfShadowSnapshot` (schemaVersion 1) มี `usesExactObFvgZones: boolean` อยู่แล้ว (ปัจจุบัน false เสมอ) + `buildSmcMtfShadowSnapshot` + `summarizeMtfObFvgShadowSnapshots` |
| `mtfObFvgRefinementShadow.ts` | รับ `optionalObZone/optionalFvgZone: PriceZone {low, high}` อยู่แล้ว — มี note "exact-ob-fvg-zone-used-for-shadow" เมื่อได้ zone จริง |
| `mtfObFvgShadowReview.ts` | `reviewMtfObFvgShadowSummary` มี `exactZoneReadiness` gate ที่จะหลุดจาก HEURISTIC_ONLY เมื่อ data จริงเข้า |
| paper-performance route | อ่าน summary จาก decision log → VM (`mtfObFvgShadowSummary`) |
| `MtfObFvgShadowCard.tsx` | read-only แสดง summary + review block |

**สรุป: pipeline ออกแบบรอ exact zones ไว้แล้วทุกชั้น — d4 คือการเติม producer เท่านั้น**

## 2) Exact-zone input source

- **Candles**: จาก `buildDiagnostics()` เดิมใน route → `latest.marketSnapshot` →
  `getCandlesFromSnapshot(snapshot, tf)` — มี **4H / 1H / 15M / 5M × 200 แท่ง** (1D ด้วย; 1M ไม่มี = future)
- **ขั้นต่ำต่อ TF**: `MIN_CANDLES = 60` (รองรับ swing L/R=2 + structure lookback + median 20 + ATR 14
  พร้อม margin) — 200 ที่มีจริงเกินพอ
- **TF หาย/แท่งไม่พอ**: ข้าม TF นั้น → degrade `exactZoneDataStatus` (เช่น ไม่มี 4H → bias=null →
  ผล merger เป็น OB_FVG_CONFLUENCE แทน MTF_ALIGNED) → ไม่มีกรณี throw
- **กัน runtime failure**: ห่อทั้ง producer ใน try/catch ชั้นเดียว → คืน
  `{ obZone: null, fvgZone: null, exact: null, warnings: ["exact_zone_builder_failed: ..."] }`
  → shadow ตกกลับ heuristic path เดิมโดยอัตโนมัติ (พฤติกรรมเท่ากับวันนี้เป๊ะ) —
  **exact-zone layer พังแล้ว cycle ต้องทำงานเหมือนเดิม 100%**

## 3) Wiring boundary

- ไฟล์ใหม่ `lib/trend/exactZoneShadowInput.ts` — pure producer:
  `buildExactZoneShadowInput({ candlesByTf, direction, context }): ExactZoneShadowInput`
  ภายในเรียก `findFractalSwings`/`detectExactFvgs`/`detectExactOrderBlocks`/`mergeMtfZones` (d3)
- **เรียกได้จากที่เดียว**: snapshot-builder ใน route orchestration layer (จุด c1 เดิม) —
  หลัง runner ตัดสินใจและ state write สำเร็จแล้วเท่านั้น
- **ห้าม**: runner / strategy / gate / preflight / execution engine import หรืออ่าน exact zones —
  isolation test บังคับ (pattern "exactZoneShadowInput|mtfZoneMerger|exactOrderBlockDetector|exactFvgDetector"
  ต้องไม่อยู่ใน decision-path files)
- GET ของ route ยังอ่านอย่างเดียว — producer รันเฉพาะ POST run_once
- logging/producer fail → warning ใน response (`decisionLog.warning` ช่องเดิม) — ไม่ block cycle

## 4) Snapshot schema extension (optional fields — non-breaking, schemaVersion คง 1)

เพิ่มใน `SmcMtfShadowSnapshot` (ทุก field optional · record เก่า valid · summarizer ข้ามเมื่อไม่มี):

```ts
// T-3H-6-d4 optional exact-zone block
exactZone?: {
  usesExactObFvgZones: boolean;        // true เฉพาะเมื่อ zone มาจาก detector จริง
  exactZoneCandidateId: string | null; // MtfMergedZone.id
  exactZoneReadiness: string | null;   // MtfZoneReadiness จาก d3
  exactZoneDataStatus: ExactZoneDataStatus; // §5
  exactZoneSource: "MTF_OB_FVG_ZONE_MERGER_V1" | null;
  exactRawRR: number | null;           // จาก MtfMergedZone
  exactNetRR: number | null;
  exactVsHeuristicDelta: number | null; // exactNetRR − refinedNetRR(heuristic) · null เมื่อฝั่งใดไม่มี
  wouldHaveFilledPending: true;        // d4 ตั้ง pending เสมอ — resolve ใน d5 (offline จาก candles ภายหลัง)
  warnings: string[];
};
```

กติกา: field เดิม `usesExactObFvgZones` (top-level) ให้ sync ค่าเดียวกับใน exactZone block
เพื่อ backward-compat กับ c2 review · `buildSmcMtfShadowSnapshot` รับ argument ใหม่ optional —
ไม่ส่ง = พฤติกรรมเดิมทุก byte

## 5) ExactZoneDataStatus

```ts
export type ExactZoneDataStatus =
  | "HEURISTIC_ESTIMATE_ONLY"     // producer ไม่รัน/fail/ไม่มี candidate → fallback เดิม
  | "EXACT_FVG_ONLY"              // map จาก merger readiness FVG_ONLY
  | "EXACT_OB_ONLY"               // ← OB_ONLY
  | "EXACT_OB_FVG_CONFLUENCE"     // ← OB_FVG_CONFLUENCE
  | "MTF_EXACT_ZONE_ALIGNED"      // ← MTF_ALIGNED
  | "EXACT_ZONE_NO_DATA"          // detector รันแล้วแต่ไม่มี zone ผ่านเกณฑ์ (≠ fail)
  | "EXACT_ZONE_CONFLICT";        // ← CONFLICTING_MTF / TARGET_TOO_CLOSE / COST_TOO_HIGH (เก็บ readiness จริงใน exactZoneReadiness)
```

mapping เป็น pure function เดียว มี test ครบทุก branch ·
`dataStatus` เดิมของ shadow result เปลี่ยนเฉพาะเมื่อ zone จริงถูกใช้ (ตาม logic ภายใน
`computeMtfObFvgRefinementShadow` ที่มีอยู่) — d4 ไม่แก้ logic ภายใน shadow

## 6) Safety rules

exact zones = logged only · ไม่มีปุ่ม/action ใหม่ใน UI (card แสดง field เพิ่มแบบ read-only เท่านั้น
และเป็น optional ของ d4 — แสดงหรือไม่ก็ได้) · ไม่มี order placement · ไม่มี threshold change ·
ไม่มี adaptive RR activation · producer ห้าม import execution engine / broker / private API ·
ไม่มี env/cron/script change · safety flags hard-false stamp ใน exactZone block ผ่าน parent record เดิม

## 7) d5 comparison requirements (ล็อกไว้ก่อนเริ่มเก็บข้อมูล — กัน goalpost-moving)

- sample ≥ **100 cycles ที่มี setup จริง** (ไม่นับ NO_DATA)
- เทียบ heuristic vs exact: avg netRR improvement, exact pass rate (netRR ≥ requiredRR),
  `exactVsHeuristicDelta` distribution
- **would-have-filled analysis**: resolve `wouldHaveFilledPending` จาก candle หลัง capturedAt —
  refined entry นับ filled เมื่อราคา trade เข้าถึง entry ก่อนถึง invalidation ·
  รายงาน **missed-fill rate** (zone สวยแต่ราคาไม่กลับมา fill) — นี่คือตัวตัดสินจริงของ +0.29
- แยกตาม regime และ session ทุก metric (ค่าเฉลี่ยรวมซ่อน regime แย่)
- ผล d5 = รายงานให้ operator review เท่านั้น — **ไม่มี activation อัตโนมัติจาก d5 ทุกกรณี**

## 8) Codex handoff — T-3H-6-d4 implementation

```
T-3H-6-d4: wire exact OB/FVG merged zones into shadow snapshot (observe-only)

PREREQUISITE: T-3H-6-d3 (mtfZoneMerger.ts + tests) merged first.

Files:
- NEW dashboard/lib/trend/exactZoneShadowInput.ts (+ .test.ts)
- MOD dashboard/lib/trend/mtfObFvgShadowSnapshot.ts (optional exactZone block per spec §4;
  non-breaking; summarizer skips missing)
- MOD app/api/internal/trend-paper-evidence-cycle/route.ts (snapshot-builder only:
  build exact input from getCandlesFromSnapshot TFs, fill optionalObZone/optionalFvgZone,
  pass exactZone block to buildSmcMtfShadowSnapshot; try/catch best-effort)
- OPTIONAL read-only display of exactZoneDataStatus in MtfObFvgShadowCard

Tests:
- producer: happy path per TF; missing TF degradation; <60 candles -> skip TF;
  detector throw -> null-safe fallback + warning; determinism/immutability
- snapshot: old records valid; records with exactZone parsed; summarizer unaffected
  when exactZone absent; usesExactObFvgZones true ONLY with real detector output
- dataStatus mapping: all branches §5
- route-level (if low-risk): run_once response unchanged shape; decisionLog warning on producer fail
- isolation grep-test: decision-path files must not reference exactZoneShadowInput/
  mtfZoneMerger/exactOrderBlockDetector/exactFvgDetector

Safety grep: BingX, placeOrder, createOrder, LIVE_TRADING_ENABLED, ENABLE_ORDER_PLACEMENT,
PRODUCTION_TRADING_READY, liveActivationAllowed/exchangeOrderAllowed mutation,
Authorization/Bearer in client, fetch to write route from browser, env/cron/paper_cycle.sh

Commit criteria: all tests pass + tsc clean + npm run build pass + safety grep clean +
no change to runner/strategy/gate/preflight/engine behavior (existing tests still green)

Classifications: T3H6D4_READY / T3H6D4_PARTIAL / T3H6D4_BLOCKED_BY_D3 / T3H6D4_SAFETY_FAIL
```
