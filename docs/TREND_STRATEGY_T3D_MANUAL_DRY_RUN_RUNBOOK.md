# Trend Strategy T-3D — Manual Session Dry Run Runbook (OPERATOR)

> **runbook/ops only · ยังไม่รัน · docs-only** — ขั้นตอนปลอดภัยสุดเพื่อรัน **paper trend 1 cycle เดียว** ด้วย manual session file โดย**ไม่ใช้ cron**
> ไม่ใช่ live · ไม่เรียก exchange · ไม่ปลด M-0B · ไม่ activate Phase 2-B · old grid exposure ยัง quarantined
> ต้องทำโดย **operator เอง** — Claude/Codex ไม่สร้างไฟล์ session ไม่เปิด env ไม่ติด cron

---

## 0) ภาพรวม + คำเตือนสำคัญ (อ่านก่อน)
- เป้าหมาย: ยืนยันว่า bridge + session + engine ทำงานครบ "ตั้งแต่ session → arm → (อาจ) paper entry → journal" แบบควบคุมได้ **ครั้งเดียว**
- **`usedEntries` ยังไม่ persist** (ไม่มี writer) — ดังนั้น **ต้องตั้ง `maxEntries: 1`** และ **ยิง route แค่ครั้งเดียว** มิฉะนั้นถ้ายิงซ้ำในรอบ session เดิม + setup ready ค้าง อาจเกิด entry เกิน 1 ได้
- ทุกขั้นตอนมี **rollback** — ลบไฟล์ session = ยกเลิก arm ทันที

## 1) Preconditions (ต้องครบก่อนเริ่ม)
- [ ] deployed HEAD รวม T-3C แล้ว (commit `4289ad3` ขึ้นไป) — verify: `git log -1 --oneline`
- [ ] มี internal route auth token ใน env ฝั่ง server: `RUN_CYCLE_TRIGGER_KEY` (หรือ `INTERNAL_API_KEY` / `REFRESH_ENDPOINT_KEY`)
- [ ] `TREND_PAPER_SIMULATION_ENABLED` = **false** (หรือไม่ตั้ง) สำหรับ step A
- [ ] **ไม่มี** ไฟล์ `dashboard/tmp/trend-paper/trend_paper_arm_session.json`
- [ ] **ไม่มี** ไฟล์ `dashboard/tmp/trend-paper/trend_paper_journal.jsonl`
- [ ] ไม่มี cron `trend_paper_cycle` ติดตั้ง — verify: `crontab -l | grep trend_paper_cycle` (ควรว่าง)

> ถ้าไม่มี token → **STOP → classify `T3D_BLOCKED_NO_TOKEN`**

## 2) Step A — env=false baseline (ยืนยัน NO_ACTION ก่อน)
ยิง internal route 1 ครั้ง (ผ่าน token):
```bash
curl -fsS -X POST "https://<host>/api/internal/trend-paper-cycle" \
  -H "Authorization: Bearer $RUN_CYCLE_TRIGGER_KEY" \
  -H "Content-Type: application/json" --data '{}' | jq '{ok, action, reason, journalAppended}'
```
**Expected:**
```json
{ "ok": true, "action": "NO_ACTION", "reason": "CONFIG_DISABLED", "journalAppended": false }
```
- [ ] `action = NO_ACTION` · `journalAppended = false`
- [ ] ยังไม่มีไฟล์ `trend_paper_journal.jsonl`
- [ ] `diagnostics.trendPaperArmIntentBridge.source = SESSION_MISSING`, `upgradedToArmed=false`

> ถ้าได้อย่างอื่นที่ไม่ใช่ NO_ACTION → **STOP → `T3D_SAFETY_FAIL`** (ตรวจ deploy/flag)

## 3) Step B — สร้าง manual session file (operator ทำเอง)
สร้างไฟล์ `dashboard/tmp/trend-paper/trend_paper_arm_session.json` (ดู template ด้านล่าง)
**ค่าบังคับสำหรับ dry run:**
- `maxEntries: 1` (สำคัญสุด — กัน entry เกินเพราะ usedEntries ไม่ persist)
- `expiresAt` = ปัจจุบัน + **15–30 นาทีเท่านั้น** (หน้าต่างสั้น)
- `paperArmIntentRequested: true`
- `direction` ตรงกับทิศ setup ปัจจุบัน (หรือ `"ANY"`)
- `maxRiskPerTradePct` ต้อง **≥** ค่า `TREND_PAPER_RISK_PER_TRADE_PCT` ที่ env ตั้ง (default 1) มิฉะนั้น engine คืน `PAPER_ARM_SESSION_RISK_EXCEEDS_CAP`

### Session JSON template (คัดลอก → แก้เวลา)
```json
{
  "schemaVersion": "trend-paper-arm-session/1",
  "sessionId": "manual-YYYYMMDD-HHMM",
  "status": "ACTIVE",
  "symbol": "BTC-USDT",
  "direction": "SHORT",
  "startedAt": "2026-06-08T07:00:00.000Z",
  "expiresAt": "2026-06-08T07:25:00.000Z",
  "maxEntries": 1,
  "usedEntries": 0,
  "maxRiskPerTradePct": 1,
  "maxSessionRiskPct": 1,
  "approvedBy": "OPERATOR",
  "paperArmIntentRequested": true,
  "paperOnly": true,
  "liveActivationAllowed": false,
  "exchangeOrderAllowed": false,
  "oldExposurePolicy": "QUARANTINE_OLD_GRID_EXPOSURE",
  "notes": ["T-3D manual single-cycle dry run"]
}
```
**ตรวจหลังสร้าง (ยัง env=false):** ยิง route ซ้ำ 1 ครั้ง → ดู `diagnostics.trendPaperArmIntentBridge`
- ถ้า setup `READY_FOR_OPERATOR_REVIEW` → ควรเห็น `source=SESSION_ARM_INTENT`, `upgradedToArmed=true`, `effectiveStatus=OPERATOR_ARMED_PAPER_ONLY`
- แต่ `action` ยัง `NO_ACTION` / `CONFIG_DISABLED` (เพราะ env ยัง false) · journal ยังไม่เขียน ✅ (พิสูจน์ว่า bridge แปลงถูก แต่ execution ยังปิด)

## 4) Step C — env=true, ยิงครั้งเดียว (controlled)
1. operator เปิด `TREND_PAPER_SIMULATION_ENABLED=true` (ฝั่ง server, ชั่วคราว) — **ห้ามติด cron**
2. ยิง route **ครั้งเดียว** (คำสั่งเดียวกับ step A)
3. อ่านผล:
   - **ถ้า setup ไม่พร้อม** (เช่น `NO_TRADE_NEAR_TARGET` / price ไม่อยู่ใน zone / ยังไม่ confirm 5m) → `action = NO_ACTION` พร้อม reason เช่น `TREND_STRATEGY_NOT_ENTRY_READY` / `PRICE_NOT_IN_ENTRY_ZONE_OR_EDGE` / `5M_*` → **ปกติ · ไม่มี entry** → ไป cleanup (§5) แล้วรอจังหวะหน้า หรือ classify `T3D_BLOCKED_SETUP_NOT_READY`
   - **ถ้า setup พร้อม** → `action = CREATE_PAPER_ENTRY`, `journalAppended=true`, `journalState.after.openPosition` มีค่า → **paper entry 1 รายการ**
4. ตรวจ journal ด้วยมือ:
```bash
cat dashboard/tmp/trend-paper/trend_paper_journal.jsonl | jq '{eventType, direction, fillPricePaper, countTowardGridClosedCycles, liveActivationAllowed, oldExposurePolicy}'
```
- [ ] `countTowardGridClosedCycles = false` ทุก event
- [ ] `liveActivationAllowed = false` · `oldExposurePolicy = QUARANTINE_OLD_GRID_EXPOSURE`
- [ ] path = `dashboard/tmp/trend-paper/trend_paper_journal.jsonl` เท่านั้น

> **ห้ามยิง route ซ้ำใน step C** (usedEntries ไม่ persist → ยิงซ้ำขณะ position ปิดแล้ว + setup ใหม่พร้อม อาจเปิด entry ที่ 2)

## 5) Immediate cleanup (ทำทันทีหลังเทสต์ เสมอ)
1. **ปิด execution:** ตั้ง `TREND_PAPER_SIMULATION_ENABLED=false` กลับ (ถ้าเปิดใน step C)
2. **ยกเลิก session:** ลบไฟล์ `trend_paper_arm_session.json` **หรือ** แก้ `"status": "REVOKED"`
3. ยิง route 1 ครั้งยืนยัน → ควรกลับเป็น `NO_ACTION` / `CONFIG_DISABLED`, `bridge.source=SESSION_MISSING` (ถ้าลบ) หรือ `SESSION_NOT_ACTIVE` (ถ้า REVOKED)
4. ยืนยัน flags ไม่เปลี่ยน: `LIVE_TRADING_ENABLED` / `ENABLE_ORDER_PLACEMENT` / `PRODUCTION_TRADING_READY` / `EXCHANGE_MANUAL_APPROVAL` คงเดิม (ไม่ถูกแตะตลอด dry run)
5. **ห้าม commit** ไฟล์ runtime ใด ๆ ใต้ `dashboard/tmp/` (gitignored อยู่แล้ว)

## 6) Safety checks (ต้องผ่านทุกข้อ)
- [ ] ไม่มี BingX private execution API ถูกเรียก (engine/route/writer ไม่มี ref — ตรวจแล้วใน T-3A/T-3B/T-3C)
- [ ] ไม่มี live order · ไม่มี real order
- [ ] grid `closedCycles` ไม่เพิ่ม (trend journal แยก · `readPaperJournal` ไม่อ่าน trend)
- [ ] trend journal เขียนได้ที่ `dashboard/tmp/trend-paper/trend_paper_journal.jsonl` เท่านั้น (writer path-locked)
- [ ] old grid exposure = `QUARANTINE_OLD_GRID_EXPOSURE`
- [ ] `paper_cycle.sh` ไม่ถูกแตะ · ไม่มี cron

## 7) Classification (เลือกตามผล)
| ผล | classification |
|---|---|
| token ครบ + step A NO_ACTION + bridge แปลงถูก พร้อมรัน step C | **`T3D_DRY_RUN_READY`** |
| ไม่มี internal token | `T3D_BLOCKED_NO_TOKEN` |
| step C: setup ไม่พร้อม (NO_ACTION ไม่ใช่ entry) | `T3D_BLOCKED_SETUP_NOT_READY` (รอจังหวะ ปลอดภัย) |
| เจอ entry ที่ไม่ควรเกิด / journal ปน grid / flag เปลี่ยน / live ถูกแตะ | `T3D_SAFETY_FAIL` (STOP + rollback ทันที) |

> **สถานะ ณ ตอนนี้ = `T3D_DRY_RUN_READY` (เป็นแผน) แต่ยัง NOT STARTED** — ยังไม่มี session/journal/cron · env false · รอ operator ตัดสินใจรันเอง

## 8) ต้องมี session-consume writer ก่อนติด cron ไหม?
**ใช่ — แนะนำให้ทำก่อน automate ด้วย cron** เหตุผล:
- ตอนนี้ `usedEntries` ไม่ persist → ถ้าใช้ cron (ยิงทุก N นาที) session ที่ `maxEntries>1` หรือแม้ `maxEntries=1` ที่ position ปิดไปแล้วและ setup ใหม่พร้อม จะเปิด entry ใหม่ทุก cycle จนกว่า session หมดอายุ → **คุม "จำนวนต่อ session" ไม่ได้จริง**
- สำหรับ **manual single call (T-3D)** = ปลอดภัยพอ เพราะ operator คุมจำนวนการยิงเอง + `maxEntries=1` + หน้าต่างสั้น
- **ก่อน cron (เฟส T-3E ที่แนะนำ):** implement `consumeTrendPaperArmSessionEntry` + **session writer** (validate-before-write, path-locked เหมือน journal writer) ให้ route เขียน `usedEntries++` (และ flip `LIMIT_REACHED`) หลัง append journal สำเร็จ → ทำให้ entry cap บังคับใช้ได้จริงข้าม cycle
- จนกว่าจะมี writer นั้น: **ห้ามติด cron** กับ trend paper execution

## Safety confirmation
- docs/runbook only · ไม่รัน · ไม่สร้าง session · ไม่เปิด env · ไม่ติด cron · ไม่เรียก exchange · ไม่ปลด M-0B · ไม่ activate Phase 2-B · ไม่ commit runtime JSON · git ไม่รัน (Codex owner)
