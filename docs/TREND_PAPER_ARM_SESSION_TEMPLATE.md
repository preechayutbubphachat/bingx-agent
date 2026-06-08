# Trend Paper Arm Session — Manual Template (T-3C)

> **paper-only · time-boxed · manual** — operator สร้างไฟล์นี้เองเพื่ออนุมัติหน้าต่าง paper arm แบบจำกัดเวลา/จำนวน
> **ไม่ใช่ live · ไม่ใช่ exchange approval · ไม่ปลด M-0B · ไม่ activate Phase 2-B**
> ระบบ **อ่านอย่างเดียว** (ไม่มี writer) — สร้าง/ลบ/แก้ไฟล์นี้ทำมือเท่านั้น

---

## ที่ตั้งไฟล์ (runtime — ห้าม commit)
```
dashboard/tmp/trend-paper/trend_paper_arm_session.json
```
อยู่ใต้ `dashboard/tmp/` ซึ่ง gitignored แล้ว — **ห้าม commit ไฟล์ runtime นี้เด็ดขาด**

## วิธีทำงาน (T-3C bridge)
```
raw gate = READY_FOR_OPERATOR_REVIEW
   + session ACTIVE (ยังไม่หมดอายุ + ยังไม่ครบ maxEntries)
   + paperArmIntentRequested = true
=> effective gate = OPERATOR_ARMED_PAPER_ONLY  (paper-only)
=> engine จึงพิจารณา CREATE_PAPER_ENTRY ได้ (ถ้า gate อื่นผ่านครบ)
```
ถ้าขาดข้อใด → effective gate คง `READY_FOR_OPERATOR_REVIEW` → engine = NO_ACTION

## Template (คัดลอกแล้วแก้ค่า)
```json
{
  "schemaVersion": "trend-paper-arm-session/1",
  "sessionId": "manual-YYYYMMDD-HHMM",
  "status": "ACTIVE",
  "symbol": "BTC-USDT",
  "direction": "SHORT",
  "startedAt": 1780000000000,
  "expiresAt": 1780021600000,
  "maxEntries": 1,
  "usedEntries": 0,
  "maxRiskPerTradePct": 0.25,
  "maxSessionRiskPct": 0.5,
  "approvedBy": "OPERATOR",
  "paperArmIntentRequested": true,
  "paperOnly": true,
  "liveActivationAllowed": false,
  "exchangeOrderAllowed": false,
  "oldExposurePolicy": "QUARANTINE_OLD_GRID_EXPOSURE",
  "notes": ["manual paper-only test"]
}
```
> `startedAt`/`expiresAt` รับได้ทั้ง epoch ms (ตัวอย่าง) หรือ ISO string

## คำอธิบายฟิลด์
| field | ความหมาย |
|---|---|
| `sessionId` | id ของ session (ตั้งเอง เช่น `manual-20260608-0700`) |
| `status` | `ACTIVE` เท่านั้นจึงจะ arm ได้ (`INACTIVE`/`REVOKED`/`EXPIRED`/`LIMIT_REACHED` = ไม่ arm) |
| `direction` | `LONG`/`SHORT`/`ANY` — ต้องตรงกับทิศ setup (หรือ `ANY`) |
| `expiresAt` | เวลาหมดอายุ (ต้อง > `startedAt`) — เลยเวลา = ไม่ arm |
| `maxEntries` | จำนวน entry สูงสุดในหน้าต่างนี้ (≥1) |
| `usedEntries` | นับที่ใช้ไปแล้ว — ถ้า ≥ `maxEntries` = LIMIT_REACHED |
| `maxRiskPerTradePct` | เพดาน risk/trade (engine ใช้ตรวจ — config risk เกินเพดานนี้ = NO_ACTION) |
| `paperArmIntentRequested` | **true = operator อนุมัติ arm paper สำหรับ session นี้** · false/ไม่ใส่ = monitor-only |

## Hard invariants (validator บังคับ — ผิด = reject ไม่ arm)
- `paperOnly` = **true**
- `liveActivationAllowed` = **false**
- `exchangeOrderAllowed` = **false**
- `oldExposurePolicy` = **QUARANTINE_OLD_GRID_EXPOSURE**
- `approvedBy` = **OPERATOR**

## ข้อควรระวัง / สิ่งที่ไฟล์นี้ **ไม่** ทำ
- **ไม่ใช่ live trading** · ไม่ส่ง order จริง · ไม่เรียก BingX
- **ไม่ปลด M-0B** · ไม่ activate Phase 2-B grid
- ไม่แปลง old grid BUY exposure เป็น trend SELL
- ต้องเปิด `TREND_PAPER_SIMULATION_ENABLED=true` แยกต่างหาก (env) ระบบจึงจะจำลอง paper จริง — template นี้แค่ "อนุมัติหน้าต่าง" ไม่ได้เปิด execution เอง
- ลบไฟล์ = ยกเลิก arm ทันที (effective กลับเป็น READY)
