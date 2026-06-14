# D5.1 — Fill-Resolution Implementation Handoff

> Phase T-3H-6-d5.1 · Read-only counterfactual analysis · Observability-only
> Generated: 2026-06-14

## Final classification

**`D5_1_BLOCKED_BY_MISSING_SNAPSHOT_FIELDS`** (primary)
**`D5_1_BLOCKED_BY_CANDLE_RETENTION`** (secondary)

Result: **NOT `HANDOFF_READY`.** The fill-resolution *algorithm already exists and is correct*. It cannot run because the persisted snapshot does not store the geometry it needs, and no future-candle series is retained. This handoff scaffolds the two prerequisites only.

---

## Key discovery

The fill-resolution engine is **already implemented** in
`dashboard/lib/trend/exactZoneComparisonSummary.ts`:

- `resolveOneFill()` — forward-walks candles after `capturedAt`, returns `FILLED` / `MISSED` / `PENDING` / `INVALIDATION_FIRST`. No lookahead beyond `fillLookaheadBars` (default 12).
- `computeFillResolution()` — aggregates into `{ status, totalResolvable, filled, missed, pending, invalidationFirst, missedFillRate }`.
- `priceTouched()` — `low <= price && high >= price`.
- Output type `ExactZoneFillResolution` and status enum (`NOT_CONFIGURED | NO_CANDLES | PENDING | PARTIAL | RESOLVED`) already exist.

`fillResolution.status = NOT_CONFIGURED` is produced by exactly one line:

```ts
if (candlesByTimeframe == null) return emptyFillResolution("NOT_CONFIGURED");
```

So D5.1 is **NOT** "write the algorithm." It is "make the inputs the algorithm needs durable." Do not re-implement the resolver.

---

## Task 1–2 findings: field availability per persisted exact snapshot

`normalizeSnapshot()` reads from `record.smcMtfShadowSnapshot` (and its `.exactZone`). The persisted shapes are `SmcMtfShadowSnapshot` / `SmcMtfExactZoneSnapshot` in `dashboard/lib/trend/mtfObFvgShadowSnapshot.ts`.

| Field needed by resolver | Persisted today? | Source if added |
|---|---|---|
| `capturedAt` | ✅ yes (`SmcMtfShadowSnapshot.capturedAt`) | — |
| exact / refined `entry` | ❌ **no** | available at cycle time: `route.ts:202` `entry` |
| `invalidation` | ❌ **no** | `route.ts:203` `stop` |
| `target` | ❌ **no** | `route.ts:204` `target` |
| `direction` | ❌ **no** | `route.ts:201` `direction` |
| `timeframe` | ❌ **no** | resolver uses 15M; tag explicitly |

`resolveOneFill()` short-circuits to `PENDING` if **any** of `capturedAt / direction / entry / invalidation` is null. Because three of those four are never persisted, **every** snapshot resolves to `PENDING` regardless of candles. This is the dominant blocker.

Note: the geometry already exists in the cycle (`route.ts` lines 201–204 compute `direction`, `entry`, `stop`, `target`). They are simply **not copied** into the observability snapshot. Recording them is read-only — it does **not** change entry/target/stop logic.

## Candle source findings

- Candles exist at cycle time (`diagnostics.candles4h/1h/15m/5m`) and are fed to `buildExactZoneShadowInput`, but are **not** persisted with the snapshot.
- `klines.json` (root) holds only the **latest rolling window** — 200 bars per TF (`1D/4H/15M/5M`), e.g. 15M spans ~2 days. It is overwritten each refresh, so it is **not** a retained time series of *future* candles keyed to each snapshot's `capturedAt`.
- Fill-resolution needs candles with `t > capturedAt` (future relative to the snapshot). Past candles stored *in* the snapshot cannot resolve a fill. A durable, append-only 15M candle store (or re-reading a retained rolling kline history that covers each `capturedAt + lookahead`) is required. → `D5_1_BLOCKED_BY_CANDLE_RETENTION`.

---

## Fill-resolution algorithm (already implemented — reference, do not rewrite)

```
INPUT: snapshot{capturedAt, direction, entry, invalidation}, candles[], lookahead
1. If capturedAt/direction/entry/invalidation missing -> PENDING
2. future = candles where t > capturedAt, take first `lookahead`
3. If future.length < lookahead -> PENDING            (insufficient future candles)
4. For each candle in future (chronological):
     hitEntry        = low <= entry        <= high
     hitInvalidation = low <= invalidation <= high
     if hitEntry AND hitInvalidation -> INVALIDATION_FIRST  (conservative same-bar)
     if hitEntry                     -> FILLED
     if hitInvalidation              -> INVALIDATION_FIRST
5. No touch within window -> MISSED
```

Aggregation → `fillResolution`:
`status`, `totalResolvable` (= filled+missed+invalidationFirst), `filled`, `missed` (includes invalidationFirst), `pending`, `invalidationFirst`, `missedFillRate = missed/totalResolvable`.

---

## Minimal Codex handoff (scaffolding only — safe)

### เป้าหมาย
ทำให้ fill-resolution engine ที่มีอยู่แล้ว *มีข้อมูลพอจะรัน* โดยไม่แตะ logic การเทรด — เพิ่มแค่การ **บันทึก** geometry ลง observability snapshot และเตรียม candle retention ให้ resolver อ่าน future candles ได้ ทั้งหมดเป็น read-only counterfactual.

### ไฟล์ที่ต้องอ่านก่อน
1. `dashboard/lib/trend/exactZoneComparisonSummary.ts` (resolver — อ่านอย่างเดียว, ห้ามแก้ logic)
2. `dashboard/lib/trend/mtfObFvgShadowSnapshot.ts` (`SmcMtfExactZoneSnapshot` — จุดที่ต้องเพิ่ม field)
3. `dashboard/app/api/internal/trend-paper-evidence-cycle/route.ts` (lines 189–280 — แหล่ง entry/stop/target/direction)
4. `dashboard/lib/trend/trendEvidenceDecisionLog.ts` (record schema + writer)

### สิ่งที่ต้องแก้ (เฉพาะ persistence + retention)
1. **ขยาย `SmcMtfExactZoneSnapshot`** เพิ่ม optional fields บันทึกอย่างเดียว:
   `direction: "LONG"|"SHORT"|null`, `entry: number|null`, `invalidation: number|null`, `target: number|null`, `timeframe: "15M"` (default).
   - แก้ทั้ง `buildExactZoneSnapshot()` (เขียน) และ `parseExactZoneSnapshot()` (อ่าน + validate ช่วงค่า finite)
   - ค่ามาจาก `route.ts` `entry/stop/target/direction` ที่คำนวณไว้แล้ว (lines 201–204) — **คัดลอกค่า ไม่คำนวณใหม่**
2. **ปรับ `normalizeSnapshot()`** ให้รับ `entry/invalidation/direction` จาก field ใหม่ก่อน fallback chain เดิม (ไม่ลบ fallback เดิม → old records ยัง valid)
3. **Candle retention (เลือกทางใดทางหนึ่ง):**
   - (a) append-only 15M candle log keyed by time ใน `tmp/` (durable, observability-only), หรือ
   - (b) ฟังก์ชัน read-only ที่ประกอบ `candlesByTimeframe` จาก kline history ที่ retained แล้วครอบคลุม `capturedAt + lookahead*15m`
4. **Wire** `candlesByTimeframe` เข้า `summarizeExactZoneComparison()` ที่ call site รายงาน (ปัจจุบันส่ง null) — ค่อยทำหลังจาก (1)–(3) เสร็จ

### ข้อห้าม (HARD — ต้องไม่ถูกแตะ)
- entry logic / target logic / stop logic / RR threshold / `reward_risk_min`
- OB/FVG detector threshold / runner decision logic / execution engine
- live / order / exchange / adaptive RR / OB/FVG execution
- ห้ามเปลี่ยน `resolveOneFill` / `computeFillResolution` / `priceTouched` algorithm
- ห้ามให้ snapshot ใหม่ feed กลับเข้า decision path — observability-only เท่านั้น (รักษา invariant `shadowOnly`, `observabilityOnly`)
- ห้ามเรียก external API / browser fetch / runtime mutation เพื่อหา candle

### Output ที่ต้องส่งกลับ
- Full-file diff ของ `mtfObFvgShadowSnapshot.ts`, `trendEvidenceDecisionLog.ts`, route writer, candle-retention module
- `fillResolution` ที่ status เปลี่ยนจาก `NOT_CONFIGURED` → `PENDING/PARTIAL/RESOLVED` บนข้อมูลจริง
- ยืนยัน old records (ไม่มี field ใหม่) ยัง parse ได้และยัง resolve เป็น `PENDING` อย่างปลอดภัย

### Test Checklist (vitest, pure helpers)
1. **fill before invalidation** → `FILLED`
2. **invalidation before fill** → `INVALIDATION_FIRST` (นับเป็น missed ด้วย)
3. **same-bar hit both** → `INVALIDATION_FIRST` (conservative)
4. **no touch within window** → `MISSED`
5. **future.length < lookahead** → `PENDING`
6. **missing entry/invalidation/direction** → `PENDING` (กันไม่ให้ false FILLED)
7. **old record without new fields** → parse ผ่าน, resolve `PENDING`, ไม่ throw
8. `missedFillRate = missed/totalResolvable`, ปัดเศษ 4 ตำแหน่ง; `totalResolvable=0` → `null`
9. no-lookahead-leak: candle ที่ `t <= capturedAt` ต้องไม่ถูกใช้

### Commit message
```
feat(trend-shadow): persist exact-zone geometry + 15M candle retention for D5.1 fill-resolution (observability-only)

- add direction/entry/invalidation/target/timeframe to SmcMtfExactZoneSnapshot (record-only)
- normalizeSnapshot reads persisted geometry; legacy records still parse to PENDING
- retain 15M candles + wire candlesByTimeframe into summarizeExactZoneComparison
- no change to entry/target/stop/RR/detector/runner/execution logic
```

---

## Why blocked, not ready

`HANDOFF_READY` would require the resolver to be runnable on existing data. It is not: 3 of 4 required geometry fields are unpersisted and no future-candle series is retained. Once the scaffolding above lands, re-run D5 to confirm `fillResolution.status` advances past `NOT_CONFIGURED` and re-classify.
