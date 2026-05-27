# M-0B Operator Evidence Pack

> **Phase M-0C — Operator Evidence Review & Approval Gate Closeout**
> สร้าง: 2026-05-25 | โปรเจค: bingx-agent | Stage: pre-approval gate
> ไฟล์นี้เป็น read-only reference สำหรับ operator — ไม่มีการเรียก exchange API ใดๆ

---

## 1) Purpose

เอกสารนี้ใช้เก็บหลักฐานก่อนอนุมัติ **Phase M-0B — Read-only Exchange API Implementation**

Operator ต้องทำทุก Action ด้านล่างให้ครบ แล้วบันทึกผลลงในแต่ละ Evidence block
ก่อนที่จะตั้ง `EXCHANGE_MANUAL_APPROVAL=approved` และเริ่ม Phase M-0B implementation

> ⚠️ การตั้ง `EXCHANGE_MANUAL_APPROVAL=approved` อนุมัติเฉพาะ **read-only exchange sync** เท่านั้น
> ไม่ใช่การอนุมัติ live trading / order placement / canary deployment

---

## 2) Current Blockers

| # | Blocker | Status |
|---|---------|--------|
| 1 | Windows `npm run build` pending | ❌ PENDING |
| 2 | Manual endpoint check (/api/m0b-preflight, /api/health, /api/paper-performance) | ❌ PENDING |
| 3 | `/public` visual check (M0BPreflightCard + ExchangeReadinessCard) | ❌ PENDING |
| 4 | Paper fills with `averageFillPrice` not yet collected | ❌ PENDING |
| 5 | Approval checklist not completed | ❌ PENDING |
| 6 | `EXCHANGE_MANUAL_APPROVAL` not approved | ❌ PENDING |
| 7 | Read-only credential not approved | ❌ PENDING |

**Default decision: NOT_APPROVED / BLOCKED_UNTIL_OPERATOR_EVIDENCE_COMPLETE**

---

## 3) Required Operator Actions

### Action 1 — Windows Build Validation

**Purpose**: ยืนยันว่า production build ผ่านบน Windows host (ไม่ใช่แค่ tsc)

**Command**:
```
cd C:\2025\web-69\ob-gate17-200369\httpdocs\dashboard && npm run build
```

**Pass criteria**:
- Build exits with code 0
- No `typescript.ignoreBuildErrors = true` workaround
- No hidden type errors from build output
- No EPERM or filesystem errors

**Evidence required** (fill in below):
```
Date/Time (ICT):
Operator:
Exit code:
Output summary (paste last 10 lines or screenshot):
Result: PASS / FAIL
Notes:
```

---

### Action 2 — Dashboard Visual Check

**Purpose**: ยืนยันว่า /public แสดงการ์ดสำคัญครบ

**URL**: `http://localhost:3000/public` (หรือ production URL)

**Check items**:
- [ ] `/public` renders without error
- [ ] `M0BPreflightCard` visible — แสดง status + blockers
- [ ] `ExchangeReadinessCard` visible — แสดง exchange readiness checklist
- [ ] `PaperPerformanceCard` visible — แสดง paper metrics / data quality
- [ ] `LiveMigrationGateCard` visible — แสดง live migration gate status
- [ ] `PaperTradingCard` visible — แสดง paper mode status
- [ ] `RuntimeAuditCard` visible — แสดง runtime file audit
- [ ] `AlertBanner` — แสดงหรือ empty state (ไม่ error)
- [ ] `SystemHealthBanner` — แสดงหรือ empty state (ไม่ error)

**Evidence required** (fill in below):
```
Date/Time (ICT):
Operator:
URL used:
Screenshot filename (optional):
Cards visible: yes/no per card above
Result: PASS / FAIL
Notes:
```

---

### Action 3 — Manual Endpoint Check

**Purpose**: ยืนยันว่า API endpoints ตอบสนองถูกต้อง บน production/staging server

**Endpoints to check**:

**3a. GET /api/m0b-preflight**
```
curl -s http://localhost:3000/api/m0b-preflight | jq .
```
Expected:
- `ok: false` (เสมอ)
- `readOnly: true` (เสมอ)
- `noExchangeApiCalls: true` (เสมอ)
- `status` = "BLOCKED" หรือ status ที่สะท้อนสถานะจริง
- ไม่มี secret value ในผล
- ไม่มี stack trace ในผล

**3b. GET /api/health**
```
curl -s http://localhost:3000/api/health | jq .m0bPreflight
curl -s http://localhost:3000/api/health | jq .exchangeReadiness
curl -s http://localhost:3000/api/health | jq .liveReadiness
```
Expected:
- ทุก field มี status/summary ที่อ่านได้
- ไม่มี null/undefined ที่เป็น crash indicator
- `liveReadiness.passed` = false (ยังไม่ผ่าน)

**3c. GET /api/paper-performance**
```
curl -s http://localhost:3000/api/paper-performance | jq .paperDataQuality
```
Expected:
- `paperDataQuality` field มีอยู่
- `hasAverageFillPrice`: true (หลังเก็บ FILL_RESULT events)
- `hasClosedTrades`: true (หลังมี closed paper cycles)
- ไม่มี error crash

**Evidence required** (fill in below):
```
Date/Time (ICT):
Operator:
3a result summary:
3b result summary:
3c result summary:
Result: PASS / FAIL
Notes:
```

---

### Action 4 — Paper Fill Quality Check

**Purpose**: ยืนยันว่ามี paper execution fills ที่มี `averageFillPrice` จริง

**Background**:
- `ORDER_SIMULATED` events เขียน log ก่อน syncState → `averageFillPrice` = null เสมอ
- `FILL_RESULT` events เขียนหลัง syncState → มี `averageFillPrice` จริง
- Paper execution engine ต้องรันอย่างน้อย 1 cycle เพื่อสร้าง FILL_RESULT events

**What to check**:
- [ ] มี paper execution cycle รันแล้ว (PAPER_TRADING_ENABLED=true + paper cycle triggered)
- [ ] มี `FILL_RESULT` events ใน audit log files (`dashboard/tmp/*.jsonl`)
- [ ] `averageFillPrice` ไม่ใช่ null ใน FILL_RESULT payload
- [ ] มี `closed` paper cycles (filled buy + filled sell = complete cycle)
- [ ] `/api/paper-performance` → `paperDataQuality.hasAverageFillPrice` = true

**Sample check command** (audit log):
```
# ดู FILL_RESULT events ใน audit log
grep "FILL_RESULT" dashboard/tmp/*.jsonl | head -5
```

**Evidence required** (fill in below):
```
Date/Time (ICT):
Operator:
FILL_RESULT event count:
Sample averageFillPrice value (no sensitive data):
Closed cycle count:
/api/paper-performance paperDataQuality.hasAverageFillPrice:
/api/paper-performance paperDataQuality.hasClosedTrades:
Result: PASS / FAIL
Notes:
```

---

### Action 5 — Full Approval Checklist

**Purpose**: ยืนยันว่าทุก gate ผ่านก่อนตั้ง EXCHANGE_MANUAL_APPROVAL=approved

**Build & Runtime**:
- [ ] `npm run build` EXIT:0 บน Windows
- [ ] tsc --noEmit --incremental false EXIT:0 (ผ่านแล้ว 2026-05-25 ✅)
- [ ] `/api/health` ตอบสนองปกติ
- [ ] `/api/runtime-audit` — ไม่มี critical missing files
- [ ] `/api/m0b-preflight` — ไม่มี crash

**Paper Quality**:
- [ ] มี FILL_RESULT events ใน audit log
- [ ] `averageFillPrice` ไม่ใช่ null ใน FILL_RESULT events
- [ ] มี closed paper cycles อย่างน้อย 1 รอบ
- [ ] `/api/paper-performance` paperDataQuality = partial หรือ usable (ไม่ใช่ insufficient)

**Security & API Permissions**:
- [ ] ไม่มี API key / secret ใน repo
- [ ] ไม่มี secret ใน client-side code (ไม่มี NEXT_PUBLIC_ prefix กับ secret)
- [ ] Read-only API key (ถ้าจะสร้าง): permission = read-only เท่านั้น
- [ ] ไม่มี trade permission
- [ ] ไม่มี order placement permission
- [ ] ไม่มี withdrawal permission
- [ ] ไม่มี transfer permission

**Safety Flags**:
- [ ] `LIVE_TRADING_ENABLED=false`
- [ ] `ENABLE_ORDER_PLACEMENT=false`
- [ ] `PRODUCTION_TRADING_READY=false`
- [ ] `SHADOW_LIVE_ENABLED=false` (หรือไม่ได้ตั้ง)
- [ ] `EXCHANGE_READONLY_SYNC_ENABLED=false` (ก่อน approve)
- [ ] `PAPER_TRADING_ENABLED` = ค่าที่ operator ตั้ง (ไม่บังคับ)

**Evidence required** (fill in below):
```
Date/Time (ICT):
Operator:
Build passed: yes/no
Paper quality passed: yes/no
Security checklist passed: yes/no
Safety flags confirmed: yes/no
All gates passed: yes/no
Result: READY_FOR_APPROVAL / NOT_READY
Notes:
```

---

### Action 6 — Approval Env (LAST STEP — เฉพาะหลังผ่านทุก Action ด้านบน)

**Purpose**: ตั้ง env var เพื่อ unblock Phase M-0B implementation

**Command**:
```
# ใน dashboard/.env.local บน server
EXCHANGE_MANUAL_APPROVAL=approved
```

**⚠️ WARNING — อ่านก่อนตั้ง**:
```
EXCHANGE_MANUAL_APPROVAL=approved

คำเตือน:
  ✅ อนุมัติ: read-only exchange sync เท่านั้น
  ✅ อนุมัติ: GET /api/exchange-readiness
  ✅ อนุมัติ: Phase M-0B read-only implementation

  ❌ ไม่อนุมัติ: live trading
  ❌ ไม่อนุมัติ: order placement
  ❌ ไม่อนุมัติ: canary deployment
  ❌ ไม่อนุมัติ: LIVE_TRADING_ENABLED=true
  ❌ ไม่อนุมัติ: ENABLE_ORDER_PLACEMENT=true
```

**Evidence required** (fill in below):
```
Date/Time (ICT):
Operator:
Actions 1-5 all passed: yes/no
EXCHANGE_MANUAL_APPROVAL set: yes/no
Server restart done: yes/no
/api/m0b-preflight status after restart:
Result: APPROVED / NOT_APPROVED
```

---

## 4) Default Decision

```
CURRENT_STATUS: NOT_APPROVED
REASON:         BLOCKED_UNTIL_OPERATOR_EVIDENCE_COMPLETE
PHASE_M_0B:     BLOCKED — pending all operator evidence actions
LIVE_TRADING:   DISABLED
ORDER_PLACEMENT: DISABLED
EXCHANGE_API:   NOT_CALLED
```

---

## 5) Evidence Summary Record

> กรอกหลังทำทุก Action ครบ

```
Operator:
Date (ICT):
Action 1 (Windows build):        PASS / FAIL
Action 2 (Dashboard visual):     PASS / FAIL
Action 3 (Endpoint check):       PASS / FAIL
Action 4 (Paper fill quality):   PASS / FAIL
Action 5 (Approval checklist):   PASS / FAIL
Action 6 (Approval env):         APPROVED / NOT_APPROVED

Final decision:                  APPROVED / BLOCKED
Notes:
```

---

## 6) Safety Rules

```
HARD RULES — ห้ามละเมิด:

- ห้ามเรียก BingX exchange API ก่อน EXCHANGE_MANUAL_APPROVAL=approved
- ห้าม place real order ทุกกรณี
- ห้าม cancel real order ทุกกรณี
- ห้ามเปิด LIVE_TRADING_ENABLED
- ห้ามเปิด ENABLE_ORDER_PLACEMENT
- ห้ามเปิด PRODUCTION_TRADING_READY
- ห้ามใส่ API key / secret ลงใน repo หรือ client-side code
- ห้าม expose secret ผ่าน NEXT_PUBLIC_ env vars
- ห้าม log secret ใน console หรือ response
- ห้ามใช้ paper PnL เป็นหลักฐาน live edge
- ห้ามสรุปว่า strategy has edge ถ้า paper sample ไม่พอ
- ห้ามบอกว่า production trading ready
- ห้ามแก้ runtime root JSON files (*.json ที่ project root)
- ห้าม fallback ไป dashboard/app/public/data/ แบบ silent
```

---

## 7) Related Files

| ไฟล์ | บทบาท |
|------|--------|
| `dashboard/lib/m0bPreflight.ts` | Preflight gate helper (no-network) |
| `dashboard/app/api/m0b-preflight/route.ts` | Preflight API endpoint |
| `dashboard/components/M0BPreflightCard.tsx` | Preflight dashboard card |
| `dashboard/lib/exchangeReadiness.ts` | Exchange readiness checker (no-network) |
| `dashboard/app/api/exchange-readiness/route.ts` | Exchange readiness API endpoint |
| `dashboard/components/ExchangeReadinessCard.tsx` | Exchange readiness dashboard card |
| `dashboard/lib/readPaperJournal.ts` | Paper journal reader (FILL_RESULT support) |
| `dashboard/lib/paperPerformance.ts` | Paper performance + data quality |
| `dashboard/app/api/paper-performance/route.ts` | Paper performance API endpoint |
| `dashboard/app/api/health/route.ts` | System health endpoint (all flags) |
| `dashboard/.env.local.example` | Env var reference |
| `PROJECT_MAP.md` Section 16 | Operator checklist + roadmap |
| `dashboard/lib/operatorEvidence.ts` | **Phase M-0D** Evidence model (no-network, no-secret) |
| `dashboard/app/api/operator-evidence/route.ts` | **Phase M-0D** Evidence tracker API endpoint |
| `dashboard/components/OperatorEvidenceCard.tsx` | **Phase M-0D** Evidence tracker dashboard card |

---

## 8) Evidence Tracker Mapping (Phase M-0D)

> เชื่อม Action ใน Section 3 → Evidence item ใน API

| Action | Evidence Item ID | API Field | Env Flag / Source |
|--------|-----------------|-----------|------------------|
| Action 1 (Windows build) | `windowsBuild` | `GET /api/operator-evidence → evidence[].id=windowsBuild` | `OPERATOR_WINDOWS_BUILD_CONFIRMED=confirmed` |
| Action 2 (Dashboard visual) | `publicVisualCheck` | `evidence[].id=publicVisualCheck` | `OPERATOR_PUBLIC_VISUAL_CHECKED=confirmed` |
| Action 3a (/api/m0b-preflight) | `m0bPreflightCheck` | `evidence[].id=m0bPreflightCheck` | `OPERATOR_M0B_PREFLIGHT_CHECKED=confirmed` |
| Action 3b (/api/health) | `healthCheck` | `evidence[].id=healthCheck` | `OPERATOR_HEALTH_CHECKED=confirmed` |
| Action 3c (/api/paper-performance) | `paperPerformanceCheck` | `evidence[].id=paperPerformanceCheck` | `OPERATOR_PAPER_PERFORMANCE_CHECKED=confirmed` |
| Action 4 (FILL_RESULT) | `paperFillAverageFillPrice` | `evidence[].id=paperFillAverageFillPrice` | derived from `/api/paper-performance → paperDataQuality.hasAverageFillPrice` |
| Action 4 (closed cycles) | `paperClosedCycles` | `evidence[].id=paperClosedCycles` | derived from `/api/paper-performance → paperDataQuality.hasClosedTrades` |
| Action 4 (fill qty) | `paperFillQty` | `evidence[].id=paperFillQty` | derived from paper quality (proxy) |
| Action 5 (checklist) | `approvalChecklist` | `evidence[].id=approvalChecklist` | `OPERATOR_APPROVAL_CHECKLIST_CONFIRMED=confirmed` |
| Action 5 (no trade perm) | `noTradePermission` | `evidence[].id=noTradePermission` | `OPERATOR_NO_TRADE_PERMISSION_CONFIRMED=confirmed` |
| Action 5 (no withdraw perm) | `noWithdrawPermission` | `evidence[].id=noWithdrawPermission` | `OPERATOR_NO_WITHDRAW_PERMISSION_CONFIRMED=confirmed` |
| Action 6 (approval env) | `exchangeManualApproval` | `evidence[].id=exchangeManualApproval` | `EXCHANGE_MANUAL_APPROVAL=approved` |
| Action 6 (credential) | `readOnlyCredentialApproved` | `evidence[].id=readOnlyCredentialApproved` | presence of `BINGX_READONLY_API_KEY` + `BINGX_READONLY_SECRET` + `EXCHANGE_MANUAL_APPROVAL=approved` |
| Safety flag: LIVE_TRADING | `safetyFlagLiveTrading` | `evidence[].id=safetyFlagLiveTrading` | `LIVE_TRADING_ENABLED=false` (derived) |
| Safety flag: ORDER_PLACEMENT | `safetyFlagOrderPlacement` | `evidence[].id=safetyFlagOrderPlacement` | `ENABLE_ORDER_PLACEMENT=false` (derived) |
| Safety flag: PRODUCTION_TRADING | `safetyFlagProductionReady` | `evidence[].id=safetyFlagProductionReady` | `PRODUCTION_TRADING_READY=false` (derived) |

**Overall status:**
- `GET /api/operator-evidence → status` field
- `GET /api/health → operatorEvidence.status` field (lightweight summary)

**To set an env flag** (in `dashboard/.env.local`):
```
OPERATOR_WINDOWS_BUILD_CONFIRMED=confirmed
OPERATOR_PUBLIC_VISUAL_CHECKED=confirmed
OPERATOR_M0B_PREFLIGHT_CHECKED=confirmed
OPERATOR_HEALTH_CHECKED=confirmed
OPERATOR_PAPER_PERFORMANCE_CHECKED=confirmed
OPERATOR_APPROVAL_CHECKLIST_CONFIRMED=confirmed
OPERATOR_NO_TRADE_PERMISSION_CONFIRMED=confirmed
OPERATOR_NO_WITHDRAW_PERMISSION_CONFIRMED=confirmed
```

> หลังตั้ง env flags ทุกตัว → รีสตาร์ท dev server → ตรวจ `/api/operator-evidence` → status ควรเป็น `READY_FOR_OPERATOR_APPROVAL_REVIEW`
> จากนั้น ตั้ง `EXCHANGE_MANUAL_APPROVAL=approved` เพื่อ unblock Phase M-0B

---

*เอกสารนี้สร้างโดย Phase M-0C — Operator Evidence Review & Approval Gate Closeout*
*Section 8 เพิ่มโดย Phase M-0D — Operator Evidence Intake & Approval Status Tracker*
*ห้ามเริ่ม Phase M-0B implementation ก่อนผ่านทุก Action และบันทึก Evidence ครบ*
