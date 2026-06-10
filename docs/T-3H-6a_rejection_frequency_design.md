# T-3H-6-a — Rejection Frequency Collection (Design Proposal, NOT implemented)

> Status: DESIGN ONLY · เขียนจากผล audit Phase UI-2.1 (2026-06-11)
> ห้าม implement จนกว่าจะ review — เฟสนี้ต้องไม่เปลี่ยนผลการเข้า/ไม่เข้า trade

## 1) ผล audit แหล่งข้อมูลปัจจุบัน (ทำไมต้อง design ก่อน)

| คำถาม | ผลตรวจ |
|---|---|
| state เก็บเฉพาะ `lastRejectReasons` ล่าสุด? | ใช่ — `trend_paper_evidence_state.json` (schema `trend-paper-evidence-state/1`) เก็บ snapshot ล่าสุดเท่านั้น ถูก overwrite ทุก cycle ผ่าน `writeTrendPaperEvidenceState()` (atomic rename) |
| มี rolling history ของ decision? | ไม่มี — ไม่มีไฟล์/ตารางใดเก็บประวัติ decision ราย cycle |
| reject reasons อยู่ใน journal/log แล้ว? | ไม่ — `trend_paper_journal.jsonl` บันทึกเฉพาะ trade lifecycle events (ENTRY/PARTIAL/EXIT/CANCEL/INVALIDATED) ส่วน cycle ที่จบเป็น WAITING_SETUP จะไม่สร้าง event ใด ๆ; `logs/cycle.log` ก็ไม่มี reject reasons |
| card แบบ read-only คำนวณ frequency ได้โดยไม่แก้ runner? | ไม่ได้ — ข้อมูลที่เหลืออยู่มีแค่ snapshot เดียว |

**ข้อสรุป: ยังคำนวณ rejection frequency จากข้อมูลที่มีอยู่ไม่ได้ → ต้องเพิ่มจุดเก็บแบบ observability-only ก่อน**

## 2) ข้อเสนอ: minimal safe collection

หลักการ: **append-observability-after-decision** — runner ตัดสินใจเสร็จและเขียน state สำเร็จแล้วเท่านั้น จึง append หลักฐาน 1 บรรทัด การ append ล้มเหลวต้องไม่ทำให้ cycle ล้มเหลว (best-effort, try/catch swallow + warn)

- ไฟล์ใหม่: `dashboard/tmp/trend-paper/trend_evidence_decision_log.jsonl` (ที่เดียวกับ state, gitignored, ไม่ commit)
- เขียนโดย helper ใหม่ path-locked แบบเดียวกับ `trendPaperEvidenceState.ts` (suffix lock `/trend-paper/trend_evidence_decision_log.jsonl`)
- จุด hook เดียว: ใน route `trend-paper-evidence-cycle` หลัง `writeTrendPaperEvidenceState(result.nextState)` สำเร็จ — **ไม่แตะ `trendPaperEvidenceRunner.ts` (decision logic) เลย**

Schema ต่อบรรทัด (`trend-evidence-decision-log/1`):

```json
{
  "schemaVersion": "trend-evidence-decision-log/1",
  "ts": "2026-06-11T10:00:00.000Z",
  "evidencePhase": "EVIDENCE_COLLECTION",
  "decision": "WAITING_SETUP",
  "gateStatus": "…",
  "rejectReasons": ["reward_risk_min", "confirmation_required"],
  "dailyEntryCount": 0,
  "paperOnly": true,
  "observabilityOnly": true
}
```

## 3) Retention limit

- เก็บสูงสุด **2,000 บรรทัด หรือ 14 วัน** (อย่างใดถึงก่อน) — ที่ 15 นาที/cycle = 96 บรรทัด/วัน → ~1,344/14วัน
- trim แบบ rewrite-atomic (tmp + rename) เมื่อไฟล์เกิน limit ตอน append ครั้งถัดไป
- ไฟล์เสีย/parse ไม่ได้ → ถือเป็น `NO_DATA` แล้วเริ่มไฟล์ใหม่ (ห้าม throw เข้า cycle)

## 4) การอ่าน (read-only card)

- API: เพิ่ม field ใน response ที่มีอยู่ (เช่น `paper-performance`) หรือ route read-only ใหม่ที่อ่านไฟล์นี้อย่างเดียว
- Card แสดง: top reject reasons + count + last seen + sample window (จำนวน cycle/ช่วงเวลา) + บรรทัด "ยังไม่มีคำแนะนำจูน (sample น้อย)" เมื่อ cycles < 100
- **ห้ามแสดงเป็นคำแนะนำปรับ threshold อัตโนมัติ** — เป็น descriptive analytics เท่านั้น

## 5) Tests ที่ต้องมี

1. helper append: path lock (reject path อื่น), append แล้ว parse กลับได้, trim เกิน limit ถูกต้อง
2. append ล้มเหลว (dir read-only) → ไม่ throw, cycle result ไม่เปลี่ยน
3. frequency aggregator (pure): นับ reason ถูก, last seen ถูก, window ถูก, ไฟล์ว่าง/เสีย → NO_DATA
4. invariant: ทุกบรรทัดต้องมี `paperOnly:true`, `observabilityOnly:true`

## 6) Safety constraints (hard rules)

- ไม่ import / ไม่แก้ `trendPaperEvidenceRunner.ts` decision logic
- ไม่อ่านไฟล์นี้กลับเข้า decision path ใด ๆ (one-way: write-after-decide, read-only-for-UI)
- ไม่มี threshold/cron/env change · ไม่มี BingX call · ไม่มี write route ที่ browser เรียกได้
- ถ้า log layer พัง ระบบเทรด paper ต้องทำงานเหมือนเดิม 100%
