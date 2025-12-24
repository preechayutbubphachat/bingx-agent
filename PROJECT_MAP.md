# PROJECT_MAP — bingx-agent

> แผนที่โปรเจคสำหรับดู “ภาพรวม + โครงสร้าง + จุดต่อเพิ่มฟีเจอร์” แบบเปิดไฟล์เดียวจบ

## 0) TL;DR (โปรเจคนี้ทำอะไร)
- Node/Server ฝั่งเก็บ snapshot + สร้างไฟล์ JSON ต่าง ๆ
- Next.js Dashboard สำหรับดูสถานะ/แผน (Plan Steps) + ปุ่มสั่ง snapshot
- API routes สำคัญ: `/run_full_snapshot` และ `/api/plan-status`

---

## 1) โครงสร้างโฟลเดอร์หลัก (High-level)

### A) Dashboard (Next.js)
อยู่ใน `dashboard/`

**Pages**
- `dashboard/app/public/page.tsx` — หน้าแสดงผลหลัก (public dashboard page)

**API Routes**
- `dashboard/app/api/plan-status/route.ts` — endpoint ส่งสถานะ plan/decision ให้หน้าเว็บ
- `dashboard/app/run_full_snapshot/route.ts` — endpoint สำหรับ “สั่งรัน snapshot” (ใช้กับปุ่ม Run Snapshot)

**Components**
- `dashboard/components/MarketStatusCard.tsx` — การ์ดสรุปสภาวะตลาด
- `dashboard/components/PlanTrackerCard.tsx` — การ์ดติดตาม plan/steps
- `dashboard/components/RunSnapshotButton.tsx` — ปุ่มยิง `/run_full_snapshot`
- `dashboard/components/RefreshPageButton.tsx` — ปุ่มรีเฟรชหน้า
- `dashboard/components/Step2Panel.tsx` — แสดงสรุป Step02/ข้อความไทย (ถ้ามี)

**Plan Steps System**
- `dashboard/components/plan-steps/`
  - `buildSteps.ts` — ประกอบ steps สำหรับ UI
  - `timelineHelpers.ts` — helper (เช่น 2-liner Price vs OI)
  - `types.ts` — type ของ steps/log/status
  - `sets/` — ชุดกติกาแต่ละโหมด (GRID / TREND / NO_TRADE)
    - `gridSweepPipeline.ts`
    - `modeLockedTrend.ts`, `modeLockedTrendUp.ts`
    - `modeLockedNoTrade.ts`
    - `breakoutSwitchMode.ts`

**Lib**
- `dashboard/lib/readLatest.ts` — อ่านไฟล์ latest/สแนปช็อตล่าสุด
- `dashboard/lib/publicSummaryTH.ts` — สรุปไทยสำหรับหน้า public

> อ้างอิงเส้นทางจาก tree ล่าสุดที่ export ไว้ใน repo/documentation ของคุณ

---

### B) Server / Routes (Node)
- `server.cjs` — ตัวรันเซิร์ฟเวอร์หลัก (Node)
- `routes/newsContext.cjs` — ทำ news_context (สร้าง/อัปเดตไฟล์ข่าว) 

---

## 2) Data / Runtime Files (ไฟล์ที่ “ระบบสร้างระหว่างรัน”)
> หมายเหตุ: ตอนนี้คุณ “ตั้งใจให้ push ขึ้น repo” เพื่อดูได้ง่าย (ไม่ใช่ best practice แต่คุณเลือกแล้ว)

**Dashboard data folder**
- `dashboard/app/public/data/`
  - `latest_decision.json`
  - `market_snapshot.json`
  - `plan_history.jsonl`
  - `plan_status.json`

**Root runtime/caches (ตัวอย่าง)**
- `market_snapshot.json`
- `news_context.json`
- `*_snapshot.json`, `*_cache.json`
- `latest_*.json`, `latest_*.tmp`
- `plan_status_log.jsonl`, `plan_status_state.json`
- `derivatives_history_cache.json`, `oi_history_cache.json`, `volatility_baseline_cache.json`

---
## Source of Truth (ข้อมูลจริงของระบบอยู่ที่ไหน)

**ระบบถือว่าไฟล์ที่ root เป็น “ความจริง” (authoritative):**
- `C:\bingx-agent\market_snapshot.json`  → snapshot ตลาดล่าสุด (OHLC / orderbook / derivatives / session / volatility)
- `C:\bingx-agent\latest_decision.json`  → ผลวิเคราะห์ STEP01 ล่าสุด (market_mode / risk_warning / reason / levels / parameters / summary)

**Dashboard/API ของ Next.js ต้องอ่านจาก 2 ไฟล์นี้เป็นหลัก**
- ห้ามไปอ้างไฟล์อื่นเป็นหลักแทน ถ้ามีไฟล์ซ้ำใน `dashboard/app/public/data/` ให้ถือว่าเป็น “mirror/สำเนาเพื่อโชว์” เท่านั้น
 
 ### Data Flow (ของจริง)
1) Trigger snapshot → อัปเดต `market_snapshot.json`
2) STEP01 run → เขียน `latest_decision.json`
3) Dashboard `/api/plan-status` → อ่าน 2 ไฟล์นี้เพื่อสร้างการ์ด/steps
4) (optional) คัดลอกบางส่วนไป `dashboard/app/public/data/` เพื่อให้หน้า public เปิดได้เร็ว

## 3) เส้นทางสำคัญ (Endpoints)
- Dashboard UI page: `/public`
- Trigger snapshot: `/run_full_snapshot`
- Get plan status: `/api/plan-status`

---

## 4) Workflow (ภาพรวมการไหลของระบบ)
1) กดปุ่ม Run Snapshot (หรือเรียก endpoint ตรง)
2) ระบบไปสร้าง/อัปเดตไฟล์ snapshot/caches
3) `plan-status` route อ่านไฟล์ล่าสุด → สร้าง `planStatusState` + steps
4) หน้า `/public` ดึงข้อมูล → render cards + steps

---

## 5) จุดที่มักจะ “เพิ่มฟีเจอร์” ต่อ
- เพิ่มการ์ดใหม่ในหน้า `/public` → แก้ `page.tsx` + สร้าง component ใน `dashboard/components/`
- เพิ่ม logic แสดง steps ใหม่ → เพิ่ม set ใน `dashboard/components/plan-steps/sets/`
- เพิ่มข้อมูลที่ UI ต้องอ่าน → ปรับ `dashboard/lib/readLatest.ts` และ `plan-status/route.ts`
- เพิ่ม pipeline news → แก้ `routes/newsContext.cjs`

---

## 6) TODO / Next upgrades (ใส่สิ่งที่กำลังจะทำ)
- [ ] ทำระบบ “ignore หรือ snapshot-only” สำหรับไฟล์ cache (เลือกได้ว่าจะ commit หรือไม่)
- [ ] ทำ `PROJECT_MAP.md` ให้ auto-update ด้วยสคริปต์ generate tree
- [ ] เพิ่ม “release notes” สั้น ๆ ใน repo เมื่อเพิ่มฟีเจอร์ใหญ่

Full tree: `docs/tree_full.txt`
Dashboard tree: `docs/tree_dashboard.txt`
Routes tree: `docs/tree_routes.txt`