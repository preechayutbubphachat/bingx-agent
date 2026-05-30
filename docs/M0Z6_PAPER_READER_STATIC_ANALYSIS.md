# M-0Z-6 — Paper Reader Static Analysis (Real Edge-Case Findings)

> ผู้จัดทำ: Claude cowork (Static Analysis / Debugger / Paper-Trading Audit)
> วันที่: 2026-05-29 · ประเภท: **OFFLINE STATIC ANALYSIS** (read-only) — เสนอ minimal scoped fix, ยังไม่แก้ logic
> ขอบเขต: `dashboard/lib/readPaperJournal.ts` + `dashboard/lib/paperPerformance.ts`
> ⚠️ ของจริง ไม่ใช่ churn — เป็น logic inconsistency ที่กระทบ gate ที่กำลังรีวิว (paper fills) โดยตรง

---

## สรุปผู้บริหาร

เจอ inconsistency จริง 3 จุด (S1 สำคัญสุด) ที่ **อาจทำให้ fill จริงถูกอ่านเป็น 0 fills / DATA_GAP** ทั้งที่ Fix 1+2 ทำงานถูกต้องในส่วนของมัน. ทั้งหมดเป็น **STATIC_FINDING** (ยืนยัน impact เต็มต้องมี post-deploy data) — เสนอ minimal scoped fix ให้ Codex deploy+verify ไม่ใช่แก้ทันทีแบบเงียบ ๆ

| ID | Severity | จุด | อาการ | Classification |
|----|----------|-----|--------|----------------|
| S1 | **HIGH** | `totalPaperFills` นับเฉพาะ ORDER_FILLED | FILL_RESULT จริงไม่ถูกนับ → headline 0 fills | STATIC_FINDING |
| S2 | MEDIUM | extractFills อ่านจาก recentEvents (cap 20) | fill-pair estimate เพดาน ~10 cycles | STATIC_FINDING |
| S3 | LOW-MED | hasAverageFillPrice ไม่รวม FILL_RESULT | data quality รายงาน false ทั้งที่มีราคา | STATIC_FINDING |
| S4 | LOW | sampleSizeStatus ผูกกับ fills ไม่ใช่ closed cycles | robustness ประเมินจากตัวเลขผิดชั้น | DESIGN_NOTE |
| S5 | (ดี) | extractFills guard null price/qty/side | ถูกต้อง — ทำให้ "fills แต่ขาด avgFillPrice" ตรวจจับได้ | OK |

---

## S1 — `totalPaperFills` counting inconsistency (HIGH)

**หลักฐาน:**
- `paperPerformance.ts:965` → `const totalPaperFills = journal.totalOrderFilled;`
- `readPaperJournal.ts:263-265` → `totalOrderFilled` เพิ่มเฉพาะเมื่อ `eventType === "ORDER_FILLED"`
- แต่ `FILL_RESULT` (event จริงของ Phase M-0B ที่จับ averageFillPrice หลัง syncState) อยู่ใน `PAPER_ORDER_EVENTS` (`readPaperJournal.ts:92`) และถูกใช้ใน `extractFills` (`paperPerformance.ts:470`) — **แต่ไม่เพิ่ม `totalOrderFilled`**

**อาการ/ผลกระทบ:**
ถ้า paper runner ปล่อย `FILL_RESULT` (fill จริง) แต่ไม่ปล่อย `ORDER_FILLED` → `totalPaperFills = 0` → `sampleSizeStatus = insufficient_data` → **หน้าจอ/endpoint โชว์ 0 fills** ทั้งที่ extractFills คำนวณ trips ได้จริงจาก FILL_RESULT. นี่ทำให้ scenario "มี fill จริง" ถูกอ่านเป็น **DATA_GAP (0 fills)** ผิด → ลบล้างเจตนาของ Fix 1+2 บางส่วน

**ความเชื่อมโยงกับ gate:** ตรงกับ Evidence Contract row "paper fill quality" — ถ้าเกิดจริง จะถูก mis-classify เป็น DATA_GAP แทนที่จะเป็น PASS/มี fills

**Minimal scoped fix (เสนอ — ยังไม่ลงมือ):**
ทางเลือก A (แก้ที่ต้นทาง, แนะนำ): ใน `readPaperJournal.ts` เพิ่มการนับ `FILL_RESULT` เป็น fill ด้วย — แต่ระวัง double-count ถ้า runner ปล่อยทั้ง ORDER_FILLED และ FILL_RESULT ของ order เดียวกัน → ต้อง dedupe ด้วย `eventKey`/`orderId`
```
// readPaperJournal.ts — ใกล้บรรทัด 263
if (eventType === "ORDER_FILLED") totalOrderFilled++;
// + เพิ่ม (กัน double count):
if (eventType === "FILL_RESULT") {
  const k = event.eventKey ?? (event.payload as any)?.orderId ?? null;
  if (!k || !countedFillKeys.has(k)) { totalOrderFilled++; if (k) countedFillKeys.add(k); }
}
```
ทางเลือก B (แก้ฝั่ง consumer): ใน `paperPerformance.ts` derive `totalPaperFills` จาก `extractFills(...).length` แทน `journal.totalOrderFilled` — แต่ติด S2 (cap 20)

**เงื่อนไขก่อนแก้:** ต้องมี post-deploy paper data ตัวอย่าง (ดูว่า runner ปล่อย ORDER_FILLED, FILL_RESULT หรือทั้งคู่) เพื่อเลือก dedupe strategy ให้ถูก → ตรงกับ Paper Evidence Decision Logic "code change justified only after runner/env/path evidence proves code-side bug"

---

## S2 — extractFills จำกัดที่ recentEvents (cap 20) (MEDIUM)

**หลักฐาน:**
- `paperPerformance.ts:983` → `extractFills(journal.recentEvents)`
- `readPaperJournal.ts:99` → `MAX_RECENT_EVENTS = 20`; `:384-386` slice 20

**ผลกระทบ:**
เส้นทาง `fill_pair_estimate` เห็น event ล่าสุดแค่ 20 → จับคู่ได้ ~10 round trips สูงสุด. การประเมิน expectancy/edge ที่ต้องการ ≥30 closed cycles **เป็นไปไม่ได้** จาก recentEvents เพียงอย่างเดียว — ต้องพึ่ง `paper_pnl.jsonl` (เส้นทาง `paper_pnl_log`) เท่านั้น

**นัยต่อ gate:** closed-cycle gate จะไปถึง PASS ได้ก็ต่อเมื่อมี `paper_pnl.jsonl` จริง (ซึ่ง writer อยู่นอก checkout) — ยืนยันว่า paper PASS ผูกกับ external writer จริง

**Fix:** ไม่ใช่บั๊ก แต่เป็นข้อจำกัดเชิงโครงสร้าง — ควร document ใน reviewer notes ว่า fill_pair_estimate = approximate, robust sample ต้องมาจาก pnl log. (ถ้าต้องการ full history จาก audit log ต้องเพิ่ม path อ่านทั้งไฟล์ — scope ใหญ่กว่า ไม่แนะนำตอนนี้)

---

## S3 — hasAverageFillPrice ไม่รวม FILL_RESULT (LOW-MEDIUM)

**หลักฐาน:** `paperPerformance.ts:808-810`
```
e.type === "ORDER_FILLED" || e.type === "ORDER_SIMULATED"
```
ไม่รวม `FILL_RESULT` ทั้งที่ FILL_RESULT มี `averageFillPrice` จริง (และ extractFills เชื่อถือมัน)

**ผลกระทบ:** ถ้า fill มาทาง FILL_RESULT อย่างเดียว → `paperDataQuality.hasAverageFillPrice = false` ทั้งที่ราคามีจริง → รายงาน data quality ผิด + nextAction ชี้ผิด ("รอ ORDER_FILLED ที่มี averageFillPrice")

**Minimal fix (เสนอ):**
```
e.type === "ORDER_FILLED" || e.type === "ORDER_SIMULATED" || e.type === "FILL_RESULT"
```
low-risk (เป็น quality flag อ่านอย่างเดียว ไม่กระทบ PnL) — แต่ยัง deploy+verify ก่อนถือเป็น PASS

---

## S4 — sampleSizeStatus ผูกกับ fills ไม่ใช่ closed cycles (LOW / DESIGN_NOTE)

`paperPerformance.ts:1006` → `computeSampleSizeStatus(totalPaperFills)`. ความแกร่งของ expectancy ควรวัดจากจำนวน **closed cycles (round trips)** ไม่ใช่ raw fills. ไม่ใช่บั๊กความปลอดภัย แต่ทำให้ป้าย sample size อาจดู "พอ" ทั้งที่ closed cycles น้อย — reviewer ควรดู `closedCycles` ควบคู่เสมอ (ซึ่ง Evidence Contract บังคับอยู่แล้ว)

---

## S5 — extractFills guard (ของดี ไม่ต้องแก้)

`paperPerformance.ts:474` → `if (!price || price <= 0 || !qty || qty <= 0 || !ev.side) continue;`
ทำให้ fill ที่ขาด averageFillPrice ถูกข้าม → `trips=0` → `dataAvailableForPnl=false` → warning "รอ ORDER_FILLED ที่มี averageFillPrice". **นี่คือกลไกตรวจจับ** เคส Evidence Contract "real fills exist but averageFillPrice missing = FAIL" ได้พอดี — แต่ปัจจุบันแสดงเป็น warning ไม่ใช่ FAIL → reviewer ต้องเทียบ `totalOrderFilled>0 && trips==0` เองเพื่อยก FAIL (ดู Decision Rule ด้านล่าง)

---

## Reviewer Decision Rule (เพิ่มเข้า Evidence Form §6 บล็อก [6])
```
ถ้า totalOrderFilled > 0  AND  extractFills/trips == 0  AND  averageFillPrice missing
   → FAIL (real fills but missing averageFillPrice) — ห้าม downgrade เป็น warning
ถ้า totalOrderFilled == 0  AND  recentEvents มี FILL_RESULT ที่มี price/qty/side
   → สงสัย S1 (counting bug) — ตรวจว่า runner ปล่อย FILL_RESULT ไม่ใช่ ORDER_FILLED
   → classify DATA_GAP + flag S1, ไม่ใช่ PASS
```

---

## ข้อเสนอลำดับการแก้ (ทำเมื่อมี post-deploy paper data)
1. เก็บ paper event sample จริง (ดูว่า ORDER_FILLED / FILL_RESULT / ทั้งคู่)
2. ถ้ายืนยัน FILL_RESULT-only → ใช้ S1 fix ทางเลือก A พร้อม dedupe (ผมเขียน patch + unit test ให้ได้)
3. S3 fix ทำพร้อมกันได้ (low-risk)
4. build EXIT:0 → Codex stage 2 ไฟล์ → deploy → curl /api/paper-performance ยืนยัน totalPaperFills ตรงกับ fills จริง

> Claude ทำ patch + test ให้ได้ทันทีเมื่อโด่งสั่ง — แต่ตามวินัย safety จะ **ไม่แก้ logic การนับเงียบ ๆ** ก่อนมี data ยืนยันและก่อน deploy verify

---

## Fix Applied — 2026-05-29 (S1 + S3, pending build/deploy verify)

**S1 — `readPaperJournal.ts`:** เพิ่มการนับ `FILL_RESULT` เข้า `totalOrderFilled` พร้อม dedupe ด้วย `eventKey ?? payload.orderId` (กัน double-count เมื่อ ORDER_FILLED + FILL_RESULT มาจาก order เดียวกัน). no-key → fallback นับเหมือนพฤติกรรม ORDER_FILLED เดิม.
**S3 — `paperPerformance.ts`:** เพิ่ม `FILL_RESULT` ใน filter ของ `hasAverageFillPrice`.

**Test:** `dashboard/scripts/test-paper-fill-counting.mjs` (dependency-free logic mirror) — **15/15 PASS** บนเครื่องจริง (8 S1 + 3 S3 + 4 Reviewer Decision Rule) รวมเคส regression "FILL_RESULT-only นับเป็น 1" (เดิม 0). รัน: `node dashboard/scripts/test-paper-fill-counting.mjs`

**Build verify (เครื่องจริง 2026-05-29):** `cd dashboard && npm run build` → **✓ Compiled successfully + ✓ Finished TypeScript in 7.9s**, 8/8 pages generated, `/api/paper-performance` route present — **EXIT:0 รวม patch S1/S3 แล้ว**. (หมายเหตุ: tsc error ที่เคยเห็นจาก bash sandbox = false alarm จาก stale mount copy ของไฟล์ .ts — ไม่ใช่บั๊กโค้ด ยืนยันด้วย build จริงนี้.)

**สถานะ:** S1, S3 = **INSTRUMENTATION_FIXED_PENDING_DEPLOY** (build/typecheck PASS แบบ pre-deploy แล้ว — ยังไม่ deploy + dedupe ยังต้อง validate กับ paper event จริง post-deploy). S2=STATIC_FINDING (ข้อจำกัดโครงสร้าง ไม่แก้), S4=DESIGN_NOTE, S5=OK.

**ยังต้องทำต่อ (external):** Codex stage+commit+push (Release Pack) → Operator deploy → curl `/api/paper-performance` ยืนยัน `totalPaperFills` ตรงกับ fill จริง + validate S1 dedupe กับ event schema จริง. build PASS แบบ pre-deploy **ยังไม่ใช่** post-deploy PASS.

---

## Final Decision
Phase M-0B remains **BLOCKED**. Live trading **DISABLED**. Order placement **DISABLED**. EXCHANGE_MANUAL_APPROVAL **not_approved**.
Claude completed an offline static-analysis pass and documented 3 real paper-reader inconsistencies (S1 HIGH) with minimal scoped fixes, but post-deploy paper evidence is required to confirm impact and validate any code change before READY_FOR_REVIEW.
