# Trend Strategy T-3F — Manual Dry Run Execution Checklist (OPERATOR)

> **checklist/ops only · ยังไม่รัน · docs-only** — รัน paper trend **1 cycle เดียว** ด้วย manual session หลังผ่าน T-3E verification
> ต่อจาก runbook `docs/TREND_STRATEGY_T3D_MANUAL_DRY_RUN_RUNBOOK.md` — ฉบับนี้คือ **execution checklist พร้อมคำสั่งจริง**
> ไม่ใช่ live · ไม่เรียก exchange · ไม่ปลด M-0B · ไม่ activate Phase 2-B · old grid exposure ยัง quarantined
> **operator ทำเอง** — Claude/Codex ไม่รันคำสั่ง ไม่สร้าง session ไม่เปิด env ไม่ติด cron

---

## ⚠️ คำเตือนก่อนเริ่ม
- ตั้ง **`maxEntries: 1`** + **ยิง route ครั้งเดียว** เสมอ (ถึงแม้ T-3E จะ persist `usedEntries` แล้ว ก็ยึดวินัยนี้สำหรับ dry run แรก)
- ทุกไฟล์ใต้ `dashboard/tmp/` เป็น runtime — **ห้าม commit เด็ดขาด** (gitignored อยู่แล้ว)
- ถ้าเจอสิ่งผิดปกติ → **STOP → cleanup (§8) ทันที → classify `T3F_DRY_RUN_SAFETY_FAIL`**

`SESSION_PATH = dashboard/tmp/trend-paper/trend_paper_arm_session.json`
`JOURNAL_PATH = dashboard/tmp/trend-paper/trend_paper_journal.jsonl`

---

## 1) Deploy latest main
- [ ] `git log -1 --oneline` → รวม T-3E (`9672279`) ขึ้นไป (เช่น HEAD `b912efc`)
- [ ] build/deploy ปกติ (Plesk/host) · `npm run build` ผ่าน
- [ ] มี internal token ฝั่ง server: `RUN_CYCLE_TRIGGER_KEY` (หรือ `INTERNAL_API_KEY`/`REFRESH_ENDPOINT_KEY`)
- [ ] ถ้าไม่มี token → **STOP → `T3F_BLOCKED_NO_TOKEN`**

## 2) Verify env=false baseline
ยืนยัน `TREND_PAPER_SIMULATION_ENABLED` = false (หรือไม่ตั้ง) แล้วยิง route 1 ครั้ง:
```bash
TOKEN="<RUN_CYCLE_TRIGGER_KEY>"
HOST="https://<your-host>"
curl -fsS -X POST "$HOST/api/internal/trend-paper-cycle" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '{}' \
  | tee /tmp/t3f_baseline.json | jq '{ok, action, reason, journalAppended, sessionConsumed}'
```
**Expected:** `action="NO_ACTION"`, `reason="CONFIG_DISABLED"`, `journalAppended=false`, `sessionConsumed=false`
- [ ] ไม่มีไฟล์ `JOURNAL_PATH` · `diagnostics.trendPaperArmIntentBridge.source="SESSION_MISSING"`
- [ ] ถ้าได้อย่างอื่น → **STOP → `T3F_DRY_RUN_SAFETY_FAIL`**

## 3) Create manual session JSON (operator สร้างเอง)
สร้างไฟล์ `SESSION_PATH` (ตั้ง `startedAt`=ตอนนี้, `expiresAt`=+15–30 นาที):
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
  "notes": ["T-3F manual single-cycle dry run"]
}
```
> `direction` ต้องตรงทิศ setup ปัจจุบัน หรือใช้ `"ANY"` · `maxRiskPerTradePct` ต้อง **≥** `TREND_PAPER_RISK_PER_TRADE_PCT` (env, default 1)

## 4) Verify session readable (ยัง env=false)
ยิง route ซ้ำ 1 ครั้ง → ตรวจ bridge แปลง intent ถูก แต่ยังไม่ execute:
```bash
curl -fsS -X POST "$HOST/api/internal/trend-paper-cycle" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '{}' \
  | jq '{action, reason, sessionConsumed, bridge: .diagnostics.trendPaperArmIntentBridge | {source, upgradedToArmed, effectiveStatus}, sess: .diagnostics.trendPaperArmSession | {status, usedEntries, maxEntries}}'
```
**Expected (ถ้า setup READY):** `bridge.source="SESSION_ARM_INTENT"`, `upgradedToArmed=true`, `effectiveStatus="OPERATOR_ARMED_PAPER_ONLY"` · แต่ `action="NO_ACTION"`, `reason="CONFIG_DISABLED"`, `sessionConsumed=false` (เพราะ env ยังปิด)
- [ ] ยืนยันว่า session อ่านได้ + bridge ทำงาน + **ยังไม่ execute / ยังไม่ consume**

## 5) Temporarily enable execution
- [ ] operator เปิด `TREND_PAPER_SIMULATION_ENABLED=true` (ฝั่ง server, ชั่วคราว) — **ห้ามติด cron**
- [ ] (ถ้าจำเป็นต้อง restart service เพื่อ reload env ก็ทำ — แต่ยังห้าม cron)

## 6) Manual single route call
ยิง route **ครั้งเดียว** แล้วเก็บ response:
```bash
curl -fsS -X POST "$HOST/api/internal/trend-paper-cycle" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '{}' \
  | tee /tmp/t3f_run.json | jq '{action, reason, journalAppended, journalPath, sessionConsumed, sessionConsumeReason, operatorAction, sessionAfter: .sessionAfter | {usedEntries, status}}'
```
> **ห้ามยิงซ้ำใน step นี้**

## 7) Expected outcomes
**A. setup ไม่พร้อม** (price ไม่อยู่ใน zone / `NO_TRADE_NEAR_TARGET` / ยังไม่ confirm 5m):
- `action="NO_ACTION"` (reason เช่น `TREND_STRATEGY_NOT_ENTRY_READY` / `PRICE_NOT_IN_ENTRY_ZONE_OR_EDGE` / `5M_*`)
- `journalAppended=false` · `sessionConsumed=false` · ไม่มีไฟล์ journal
- → ปกติ ปลอดภัย → ไป cleanup (§8) → **`T3F_BLOCKED_SETUP_NOT_READY`** (รอจังหวะหน้า)

**B. setup พร้อม:**
- `action="CREATE_PAPER_ENTRY"` · `journalAppended=true` · `journalPath` = `JOURNAL_PATH`
- `sessionConsumed=true` · `sessionConsumeReason="CONSUMED"` · `sessionAfter.usedEntries=1` · `sessionAfter.status="LIMIT_REACHED"`
- `operatorAction=null` (ถ้า consume สำเร็จ)
- → **`T3F_DRY_RUN_PASS_ENTRY`**

> ถ้า `journalAppended=true` แต่ `sessionConsumed=false` + `operatorAction="inspect session manually"` → consume ล้มเหลวหลัง append (rare) → ตรวจ session file ด้วยมือ + cleanup · ไม่ใช่ safety fail แต่ต้อง reconcile

## 8) Cleanup (ทำทันทีหลังเทสต์ เสมอ)
```bash
# 8.1 ปิด execution (operator แก้ env ฝั่ง server)
#     TREND_PAPER_SIMULATION_ENABLED=false   (restart service ถ้าจำเป็น)

# 8.2 ยกเลิก session — เลือกอย่างใดอย่างหนึ่ง
rm -f dashboard/tmp/trend-paper/trend_paper_arm_session.json
#   หรือแก้ในไฟล์เป็น  "status": "REVOKED"

# 8.3 ยืนยันกลับสู่สถานะปลอดภัย
curl -fsS -X POST "$HOST/api/internal/trend-paper-cycle" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data '{}' \
  | jq '{action, reason, sessionConsumed, bridgeSource: .diagnostics.trendPaperArmIntentBridge.source}'
#   Expected: action=NO_ACTION, reason=CONFIG_DISABLED, bridgeSource=SESSION_MISSING (ถ้าลบ) / SESSION_NOT_ACTIVE (ถ้า REVOKED)
```
- [ ] `TREND_PAPER_SIMULATION_ENABLED` กลับเป็น false
- [ ] session ถูกลบ/REVOKED
- [ ] flags ไม่เปลี่ยน: `LIVE_TRADING_ENABLED` / `ENABLE_ORDER_PLACEMENT` / `PRODUCTION_TRADING_READY` / `EXCHANGE_MANUAL_APPROVAL` คงเดิม
- [ ] ไม่มี cron: `crontab -l | grep trend_paper_cycle` → ว่าง

## 9) Evidence collection
```bash
# 9.1 route responses (เก็บไว้แล้วจาก tee)
cat /tmp/t3f_baseline.json | jq '{action, reason}'
cat /tmp/t3f_run.json | jq '{action, reason, journalAppended, sessionConsumed, sessionConsumeReason}'

# 9.2 trend journal (ถ้ามี entry) — ตรวจ isolation invariants
tail -n 5 dashboard/tmp/trend-paper/trend_paper_journal.jsonl \
  | jq '{eventType, direction, fillPricePaper, countTowardGridClosedCycles, liveActivationAllowed, oldExposurePolicy}'

# 9.3 session file หลัง consume (ก่อนลบ ถ้าอยากเก็บหลักฐาน)
cat dashboard/tmp/trend-paper/trend_paper_arm_session.json | jq '{usedEntries, maxEntries, status}'

# 9.4 paper-performance trendEdgeReview (ผ่าน public/diagnostics)
curl -fsS "$HOST/api/paper-performance" | jq '.paperLoopDiagnostics.trendEdgeReview // .trendEdgeReview | {status, trendClosedTrades, netExpectancyAfterCosts, decision}'
```
**ต้องผ่าน:** journal ทุก event `countTowardGridClosedCycles=false` · `liveActivationAllowed=false` · `oldExposurePolicy="QUARANTINE_OLD_GRID_EXPOSURE"` · grid `closedCycles` ไม่เพิ่ม · trendEdgeReview แยกจาก grid (sample=1 หลัง entry แรกที่ปิด)

## 10) Classification
| ผล | classification |
|---|---|
| ไม่มี internal token | `T3F_BLOCKED_NO_TOKEN` |
| step 6: setup ไม่พร้อม → NO_ACTION, no append, no consume | `T3F_BLOCKED_SETUP_NOT_READY` |
| step 6: CREATE_PAPER_ENTRY + journal appended + usedEntries=1 + LIMIT_REACHED + invariants ครบ | `T3F_DRY_RUN_PASS_ENTRY` |
| รันครบ + คง NO_ACTION ปลอดภัยตลอด (ไม่มี entry แต่ทุกอย่างถูก) | `T3F_DRY_RUN_PASS_NO_ACTION` |
| entry ที่ไม่ควรเกิด / journal ปน grid / flag เปลี่ยน / live ถูกแตะ / consume ผิดทาง | `T3F_DRY_RUN_SAFETY_FAIL` (STOP + rollback) |

## Rollback (สรุปคำสั่งเร่งด่วน)
```bash
# ปิด execution (env ฝั่ง server) → TREND_PAPER_SIMULATION_ENABLED=false
rm -f dashboard/tmp/trend-paper/trend_paper_arm_session.json   # ยกเลิก arm ทันที
# ยืนยัน: ยิง route แล้วต้องได้ NO_ACTION / CONFIG_DISABLED
# ห้าม: git add dashboard/tmp/**  (runtime — gitignored, อย่า commit)
```

## ⛔ Warnings — ห้าม commit runtime
- **ห้าม** `git add` / commit ไฟล์ใด ๆ ใต้ `dashboard/tmp/` (`trend_paper_arm_session.json`, `trend_paper_journal.jsonl`, `*.tmp-*`)
- ตรวจก่อน commit: `git status --porcelain | grep -i 'dashboard/tmp'` → **ต้องว่าง**
- `dashboard/tmp/` อยู่ใน `.gitignore` แล้ว แต่ตรวจซ้ำเสมอ

## Safety confirmation
- checklist/ops only · ยังไม่รัน · ไม่สร้าง session · ไม่เปิด env · ไม่ติด cron · ไม่ call route · ไม่เรียก exchange · ไม่ปลด M-0B · ไม่ activate Phase 2-B · git ไม่รัน (Codex owner)
