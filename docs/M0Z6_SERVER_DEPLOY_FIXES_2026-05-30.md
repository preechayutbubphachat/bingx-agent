# M-0Z-6 — Server Deploy Fixes + Paper Pipeline Status (2026-05-30)

> บันทึก session แก้ deployment จริงบน server (ob-gate.com) — ไล่ตั้งแต่ release ถึง execution-runner
> สถานะปลายทาง: **Phase M-0B BLOCKED** (ไม่เปลี่ยน) — paper evidence จริงยังไม่ได้

---

## 1) สิ่งที่แก้สำเร็จวันนี้ (verified)

| # | สิ่งที่แก้ | หลักฐาน |
|---|-----------|---------|
| 1 | Git release commit `59472f8` push main | staging สะอาด (ไม่มี runtime/secret), build EXIT:0 |
| 2 | `.env.example` เพิ่ม `PAPER_TRADING_ENABLED`, `EXECUTION_AUDIT_ROOT_DIR` | committed |
| 3 | Plesk deploy (pull+rebuild+restart) | build ✓ Compiled บน server, route ครบ |
| 4 | runtime source-of-truth | `/api/public-health` ยืนยัน latest_decision/market_snapshot/scheduler = exists |
| 5 | env: `PAPER_TRADING_ENABLED=true`, `EXECUTION_AUDIT_ROOT_DIR=/httpdocs` (`.env` + `dashboard/.env.local`) | paper-status `paperTradingEnabled:"true"` |
| 6 | cron run-cycle host (404) | patch `cron_scheduler_chain.sh` เพิ่ม `RUN_CYCLE_BASE_URL` แยก base; env `OBGATE_RUN_CYCLE_BASE_URL='https://ob-gate.com'` |
| 7 | cron CRLF พัง (set: pipefail) | สร้างไฟล์ LF ใหม่ (เครื่อง local ทำ CRLF) |
| 8 | run-cycle key | Next app เห็น `RUN_CYCLE_TRIGGER_KEY` → auth ผ่าน (401→ผ่าน) |
| 9 | `run_cycle.js` hardcoded Windows path | port ใหม่: `BASE_DIR` จาก env/__dirname, spawn `process.execPath`, inject SNAPSHOT/NEWS/OUT_PATH, `SNAPSHOT_BASE_URL` |
| 10 | snapshot host (localhost:3000 refused) | env `SNAPSHOT_BASE_URL=https://api.ob-gate.com` → decision engine exit 0 เขียน latest_decision.json (mode=GRID_NEUTRAL) |
| 11 | execution-runner ยิงได้ | `paper_open` → ok:true (แต่ใช้ market fixture) |

**Pipeline ตอนนี้:** snapshot ✅ → decision ✅ (latest_decision.json สด) → execution-runner harness ✅ (แต่ synthetic)

---

## 2) สถาปัตยกรรมจริงที่ค้นพบ (dual-host + dev-script)

- **`api.ob-gate.com`** = Express backend (`server.cjs`) ใต้ Passenger — snapshot, collect_market_snapshot (public, ไม่มี key)
- **`ob-gate.com`** = Next.js dashboard — `/api/internal/run-cycle` (spawn `run_cycle.js`), `/api/internal/execution-runner`, diagnostic APIs
- `localhost:3000` ไม่มี listener (Passenger จัดการ ไม่ได้ listen port จริง) → engine ต้องเรียกผ่านโดเมน
- engine (`run_cycle.js`, `run_latest_decision.cjs`) เดิม hardcode `C:\bingx-agent` + `localhost:3000` = เขียนสำหรับ local Windows machine ไม่เคย port มา server

---

## 3) Gap ที่เหลือ — ทำไม paper fill ยัง 0 (DATA_GAP)

### 3.1 Path mismatch (audit reader vs writer)
- **Writer** (execution-runner route): `process.cwd()/tmp/execution-runner` = **`/httpdocs/dashboard/tmp/execution-runner/`**
- **Reader** (`readPaperJournal`): `EXECUTION_AUDIT_ROOT_DIR/tmp[/execution-runner]` = **`/httpdocs/tmp/...`** (ปัจจุบัน EXECUTION_AUDIT_ROOT_DIR=/httpdocs)
- **Fix:** ตั้ง `EXECUTION_AUDIT_ROOT_DIR=/var/www/vhosts/ob-gate.com/httpdocs/dashboard` → reader จะอ่าน `dashboard/tmp/execution-runner` ตรงกับ writer

### 3.2 execution-runner = test harness, ไม่ใช่ production loop
- `paper_open` แบบ default ใช้ **market สังเคราะห์** (`price.last: 70500` fixture) — ไม่ใช่ราคา BTC จริง
- ไฟล์ใน writer dir เป็น `execution-runner-live_limited_allow-*.jsonl` (test scenario เก่า) + paper_open ของเรา — **mode ไม่ใช่ PAPER จริงจากตลาด** → `paperModeDetected:false`
- **ตามกฎ M-0Z-6: synthetic fixture ≠ real evidence** → ต่อให้ align path ก็ยังไม่ผ่าน M-0B

### 3.3 ไม่มี production paper-execution loop
cron chain ทำแค่ **snapshot + run-cycle(decision)** — **ไม่เคยเรียก execution-runner ด้วย market จริง** การจะได้ paper fill จริงต้อง build loop:
1. อ่าน `latest_decision.json` จริง (mode/levels)
2. อ่าน `market_snapshot.json` จริง (ราคา BTC)
3. สร้าง grid order/entry จาก decision
4. ยิง paper executor ด้วย market จริงทุก cycle
5. align audit path (§3.1)
6. สะสม fill + closed cycle ตามเวลา → write/derive `paper_pnl.jsonl`

→ **นี่คืองาน build paper execution layer จริง** (แตะ trading logic: grid construction, fill simulation, PnL) ต้องออกแบบรอบคอบ ใช้ skill เฉพาะ (adaptive-grid-params, grid-mode-switching, paper-trading, trade-journal-attribution)

---

## 4) Decision

Phase M-0B remains **BLOCKED**.
Live trading **DISABLED** · Order placement **DISABLED** · EXCHANGE_MANUAL_APPROVAL **not_approved**.

**สรุป:** วันนี้ปลด blocker ระดับ infra/deploy/engine-port ได้ครบ (11 จุด) — pipeline เดินถึง decision + execution harness แล้ว แต่ **paper evidence จริง** ต้อง build production paper-execution loop (§3.3) ซึ่งเป็นงานพัฒนาใหม่ ไม่ใช่ config fix · fixture fill ไม่นับเป็น evidence

**Next safe step (เลือก):**
- **A1** build paper-execution loop เต็ม (real market→fills) — scope เป็น phase ใหม่, ใช้ trading skills, มี backtest/paper gate
- **A2** align path (§3.1) + ป้อน market จริงให้ execution-runner ทีละ cycle (เบากว่า แต่ยัง build wiring + ต้องระวัง grid logic)
- **B** หยุดที่นี่ บันทึก gap, คง M-0B BLOCKED

---

## 4) Follow-up (2026-05-31) — Paper Execution LIVE + Hotfix ค้าง commit

**A1 สำเร็จ:** paper-execution loop เดินจริงบน production แล้ว (ดู `M0Z6_PAPER_LOOP_A1_STATUS.md` §3c) — root cause = engine layer untracked ใน git → commit `34c4a8f` + deploy → real fills (averageFillPrice 74115.3/74129.6), cron `paper_cycle.sh` */5

**⚠️ Hotfix ค้าง commit (UI crash บน /public เมื่อมี paper data):**

| ไฟล์ | แก้อะไร | สาเหตุ |
|---|---|---|
| `dashboard/app/api/paper-performance/route.ts` | เติม `gridSpacingCheck` ใน success payload (derive จาก `costGate`) | success path (type `PaperPerformanceReport`) ไม่มี field นี้ มีแต่ใน error fallback |
| `dashboard/components/PaperPerformanceCard.tsx` | `data.gridSpacingCheck?.roundTripCostPct` + `?.note ?? ""` + type optional | กัน `Cannot read properties of undefined (reading 'roundTripCostPct')` |

- อาการ: พอ production มี paper data จริง (`has_data`) เข้า success path → payload ไม่มี `gridSpacingCheck` → component crash ทั้งหน้า `/public`
- สถานะ: แก้แล้วใน workspace · **ยังไม่ commit/deploy** (ติด `.git/index.lock` — operator ต้องลบ lock + commit + deploy เอง)
- read-only เต็มตัว ไม่แตะ engine/trading
- **commit ค้างนี้ = blocker ของ `/public` visual gate** (หน้าจะ crash จนกว่าจะ deploy)

**Next:** operator `del .git\index.lock` → `git add` 2 ไฟล์ → commit → push → Plesk pull+rebuild+restart → ตรวจ `/public` การ์ด Paper Performance โชว์ "Round-trip cost" %

**Phase M-0B remains BLOCKED.**
