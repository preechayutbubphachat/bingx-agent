# M-0Z-6 A1 — Paper Execution Loop: Build Status + Final Gap (2026-05-30)

> งาน A1 (build paper loop) — สรุปสิ่งที่สำเร็จ + ขอบเขตสุดท้ายที่ต้อง build ต่อ
> สถานะ: **Phase M-0B BLOCKED** (ไม่เปลี่ยน) — paper fill จริงยังไม่ครบ

---

## 1) สำเร็จแล้ว (verified end-to-end)

pipeline เดินครบทุกชั้นบน **ข้อมูลจริง**:
1. `paper_cycle.sh` (LF, bash-only) อ่าน `latest_decision.json` (mode+grid) + `orderbook_snapshot.json` (bid/ask/mid) + `funding_snapshot.json` (mark/index) จริง
2. สร้าง paper order: side ตามราคา vs grid mid (BUY ถ้าราคา < mid)
3. POST → `/api/internal/execution-runner` (PAPER mode) ด้วย market จริง → **http=200, ok:true**
4. engine รัน lifecycle: RUNNER_REQUESTED → PLAN_EVALUATED → RISK_EVALUATED → INTENT_CREATED → **ORDER_SIMULATED** → RECONCILE_RESULT → RUNNER_COMPLETED (mode=PAPER ทุก event)
5. audit เขียนที่ `dashboard/tmp/execution-runner/` · reader (`EXECUTION_AUDIT_ROOT_DIR=.../dashboard`) อ่านเห็น
6. **paper-status: `status="has_paper_data"`, `totalPaperEvents=7-8`, `isPaper=true`** (จากเดิม 0 / no_data)

**Fixes ที่ทำระหว่างทาง:** env paper keys · cron run-cycle host/CRLF/key · `run_cycle.js` port (Windows→Linux) · `SNAPSHOT_BASE_URL` → api host · `EXECUTION_AUDIT_ROOT_DIR` align reader/writer · ย้าย test fixture เก่าออกจาก audit dir

---

## 2) Final Gap — order วาง แต่ไม่ fill (averageFillPrice=null)

อาการ: `ORDER_SIMULATED.filledQuantity=0`, `averageFillPrice=null`, `totalOrderFilled=0`, ไม่มี `ORDER_FILLED`/`FILL_RESULT`, `closedCycles=0`

**Root cause (ไล่จนสุด):**
- `normalizePlannedEntry` (execution-runner route ~589-592) **default `entryPrice = market.price.last` เสมอ** เมื่อ request ไม่ส่ง → engine (`paperExecutionEngine:167` `orderType = entryPrice ? "LIMIT" : "MARKET"`) ทำเป็น **LIMIT order ทุกครั้ง**
- `syncState` ส่ง market แล้ว (verified บรรทัด 700-707) และ fill order ที่ `orderShouldTrigger` — แต่ LIMIT order ที่ราคา = market ปัจจุบัน ใน 1 call ไม่ trigger fill
- execution-runner สร้าง `new PaperBrokerAdapter()` **ใหม่ทุก call** → **stateless** → order ที่วางไม่ค้าง state ข้าม cycle → LIMIT order ไม่มีโอกาส fill ตอนราคาขยับในรอบถัดไป

→ **execution-runner เป็น single-shot harness** (วาง order + reconcile ใน 1 call) **ไม่ใช่ stateful paper engine** ที่ค้าง order book/position ข้าม cycle

---

## 3) สิ่งที่ต้อง build ต่อ (final piece — stateful fill)

เพื่อให้เกิด **fill จริง + closed cycle**, ต้องมี **stateful paper execution** อย่างใดอย่างหนึ่ง:

**ทางเลือก A — Persist broker state ข้าม cycle (ตรงกับดีไซน์ grid เดิม):**
- serialize `executionState` (order book + position) ลงไฟล์ทุก cycle
- cycle ถัดไป: load state → place grid order ใหม่ + syncState ด้วย market ปัจจุบัน → **LIMIT order ที่ราคาถึงจะ fill** → save state
- เกิด BUY fill (ราคาลง) แล้ว SELL fill (ราคาขึ้น) → closed cycle ธรรมชาติ
- งานหลัก: state persistence layer + ปรับ execution-runner ให้ load/save (หรือสร้าง route ใหม่ `/api/internal/paper-tick` ที่ stateful)

**ทางเลือก B — Force MARKET fill ต่อ cycle (เร็วกว่า แต่ไม่ใช่ grid จริง):**
- ต้องแก้ให้ส่ง order เป็น MARKET จริง (เลี่ยง `normalizePlannedEntry` default) → fill ทันทีต่อ cycle
- แต่ harness default entryPrice เสมอ → ต้องแก้ที่ engine/route (code change + deploy)
- ได้ fill ต่อ cycle, side สลับตามราคา → pairFills เป็น closed cycle

**ทั้งสองทางแตะ trading engine core** → ต้องออกแบบ + test + deploy แบบตั้งใจ ไม่ใช่ patch รีบ ๆ

---

## 3b) Option B ผลทดสอบ (2026-05-30) — ไม่พอ, ต้องแก้ engine

ทดลอง B (force MARKET) 2 แบบผ่าน request:
- **omit entryPrice** → `merged = {...base, ...entry}` base รั่ว entryPrice=last → LIMIT → ไม่ fill
- **`entryPrice:null` explicit** → `normalizePlannedEntry` คืน null → engine `orderType=MARKET` → **แต่ก็ยัง `filledQuantity:0`, ไม่มี `ORDER_FILLED`/`FILL_RESULT`**

→ **B ผ่าน request อย่างเดียวไม่พอ** — ปัญหาอยู่ลึกกว่า request

### Root cause ที่ isolate ได้ (สำหรับ session ถัดไป)
- `placeOrder` (PaperBrokerAdapter:235-261) ใส่ order เข้า `this.openOrders` book จริง (MARKET → status PENDING, filledQuantity 0)
- `ORDER_SIMULATED` audit = ผล **place** (filledQuantity:0 เสมอ) — ไม่ใช่ผล fill
- fill จริงต้องเกิดใน `syncState` (PaperBrokerAdapter:344-361): `if (input.market) { for order in book: if orderShouldTrigger(order,market) fillOrder(order,market) }`
- engine ส่ง `market` เข้า syncState แล้ว (paperExecutionEngine:700-707) · `orderShouldTrigger` คืน true สำหรับ MARKET (PaperBrokerAdapter:114)
- **แต่ audit ไม่มี ORDER_FILLED/FILL_RESULT** → แปลว่า **fillOrder ไม่ทำงาน หรือไม่ update `intentIndex`**
- engine เขียน `FILL_RESULT` (paperExecutionEngine:762-793) **เฉพาะเมื่อ `broker.intentIndex[...].averageFillPrice` เป็น number** (บรรทัด 774) — ถ้า fillOrder ไม่ update intentIndex หลัง fill → ค่ายังเป็น null (set ตอน place, PaperBrokerAdapter:279-281) → ไม่เขียน FILL_RESULT
- broker's own `ORDER_FILLED` ไป `this.journal` (internal array) — ต้องเช็คว่า flush ลง audit file ไหม

### จุดที่ต้อง debug/แก้ (engine, มี test)
1. ตรวจว่า `syncState→fillOrder` ถูกเรียกจริงไหม (เพิ่ม log/test): order อยู่ใน book + MARKET → ควร fill
2. `fillOrder` (PaperBrokerAdapter:499-550) ต้อง **update `this.intentIndex.get(intentKey)`** ด้วย `averageFillPrice`/`filledQuantity` หลัง fill (ไม่งั้น engine เขียน FILL_RESULT ไม่ได้)
3. ยืนยันว่า ORDER_FILLED event ของ broker ถูกเขียนลง audit file ที่ reader อ่าน
4. เขียน unit test: place MARKET → syncState(market) → assert order.status=FILLED, averageFillPrice=market price, intentIndex updated, FILL_RESULT emitted

→ เป็น **trading-core change** ต้องทำใน session ที่ตั้งใจ + มี test ก่อน deploy

## 3c) RESOLVED — paper fills working on production (2026-05-31)

**Root cause สุดท้าย:** `dashboard/lib/broker/`, `lib/execution/`, `app/api/internal/` เป็น **untracked ใน git** → `git pull` ไม่เคยอัปเดต → server รัน engine เก่าที่**ไม่มี FILL_RESULT block** (grep FILL_RESULT บน server = 0) ส่วน local มีโค้ดที่ทำงานถูก

**Fix:**
1. `entryPrice:null` ใน paper_cycle.sh → MARKET order → fill ทันทีใน syncState
2. `git add` engine layer (broker/execution/operator/internal) → commit `34c4a8f` → push
3. Server: ย้าย copy เก่า `.old` ออก → git pull → rebuild → restart (เลี่ยง untracked-overwrite conflict)
4. `readPaperJournal` sort mtime ก่อน slice 30 (กันไฟล์ใหม่ถูกบัง)
5. Plesk task `/bin/bash /httpdocs/paper_cycle.sh` `*/5 * * * *`

**ผลยืนยัน (31 พ.ค.):** `totalOrderFilled=30`, FILL_RESULT มี `averageFillPrice=74115.3/74129.6` (ราคาจริง), `paperModeDetected=true`, cron สะสม fill อัตโนมัติ ✅

**dev verification:** debug route พิสูจน์ broker fill MARKET (averageFillPrice 73800) + engine emit FILL_RESULT — debug route ลบแล้ว ไม่ commit

## 4) Decision (updated 2026-05-31)

Phase M-0B remains **BLOCKED**.
Live trading **DISABLED** · Order placement **DISABLED** · EXCHANGE_MANUAL_APPROVAL **not_approved**.

**สรุป:** paper execution pipeline ทำงานครบวงจรบน production แล้ว — **real paper fills เข้าระบบจริง (averageFillPrice จริง) สะสมอัตโนมัติ** → paper fill-quality gate ขยับจาก DATA_GAP เป็น **มี fill จริง**

**ยังเหลือก่อน paper evidence ครบ (M-0B):**
- closed cycles ยัง 0 — ต้องรอราคาแกว่งข้าม grid mid ให้เกิดทั้ง BUY+SELL → pairFills จับเป็น round trip (ตอนนี้ fill เป็น BUY หมดเพราะราคาต่ำกว่า mid)
- sample ต้องถึง ~30 closed cycles เพื่อประเมิน edge
- /public visual PASS + operator independent review

→ paper fills จริงแล้ว แต่ **closed cycles + sample + visual + approval ยังไม่ครบ** → M-0B BLOCKED ต่อ

---

## 5) Closed-Cycle Stall Triage Plan (closedCycles=0)

> Default: **ยังไม่ใช่บั๊ก** — น่าจะเป็น market path + side logic (BUY เมื่อราคา<grid mid, SELL เมื่อ>mid) ต้องรอราคาข้าม mid
> ห้ามแก้โค้ดจนกว่า evidence พิสูจน์ว่าเป็น bug

### Timeline
| ช่วง | ทำอะไร | evidence | classification | action |
|---|---|---|---|---|
| 0–24h | observe only | totalOrderFilled, side dist | fills เพิ่ม + BUY only = **DATA_GAP (normal)** | รอ ห้ามแก้โค้ด |
| 24–48h | inspect read-only | price vs grid mid, grid upper/lower/mid, price path | ราคาไม่เคยข้าม mid = **DATA_GAP (market-driven)** · ข้าม mid แต่ไม่มี SELL = **WARNING** | inspect ยังไม่แก้ |
| 48h+ ไม่มี closed | จัด root cause (a–g) | ตามตารางล่าง | FAIL ถ้ายืนยัน bug | minimal fix (มี test) |

### Root-cause branches (48h+)
| Branch | Evidence Required | Class | Safe Response | Code-change Threshold | M-0B |
|---|---|---|---|---|---|
| a. market trend one-sided | price ไม่ข้าม mid | DATA_GAP | รอ/ปรับ observation | ไม่แก้ | BLOCKED |
| b. grid mid too far | mid ห่าง spot | WARNING | review grid param (read-only) | ยืนยัน mid ผิด | BLOCKED |
| c. side logic too binary | side ผูก mid อย่างเดียว | WARNING | propose logic review | ราคาข้าม mid แต่ side ไม่สลับ | BLOCKED |
| d. SELL unreachable | price>mid แต่ไม่มี SELL | FAIL | minimal fix | ยืนยันแล้ว | BLOCKED |
| e. pairFills ไม่จับคู่ | มี BUY+SELL แต่ไม่ pair | FAIL | inspect `paperPerformance.ts` pairFills | ยืนยันแล้ว | BLOCKED |
| f. journal schema mismatch | field หาย/ผิดชื่อ | FAIL | inspect schema | ยืนยันแล้ว | BLOCKED |
| g. API reader issue | closed มีแต่ reader=0 | FAIL | inspect `readPaperJournal.ts`/`paperPerformance.ts` | ยืนยันแล้ว | BLOCKED |

### Expectancy / Edge Review (เมื่อ closed cycles สะสม)
- min sample ~30 closed cycles · <30 = DATA_GAP / INSUFFICIENT_SAMPLE (ห้าม claim edge)
- metrics: closedCycles, winRate, avgWin, avgLoss, grossPnL, fees, slippage, netPnL, expectancy/cycle, profitFactor, maxDrawdown, avgHold, side balance, regime/session attribution
- `expectancy = (winRate × avgWin) − ((1−winRate) × avgLoss)` · `netExpectancy = expectancy − avgFee − avgSlippage` · `profitFactor = grossProfit / |grossLoss|`
- **min edge condition:** netExpectancy>0 AND closedCycles≥30 AND ไม่มี false live-ready claim AND ไม่มี safety violation
- ผ่านแล้วก็ยังต้องรอ visual + operator review + approval → M-0B BLOCKED จนครบ
