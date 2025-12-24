# PROJECT_MAP — bingx-agent

> แผนที่โปรเจคสำหรับดู “ภาพรวม + โครงสร้าง + จุดต่อเพิ่มฟีเจอร์” แบบเปิดไฟล์เดียวจบ  
> เป้าหมาย: วันไหนมีไอเดียเพิ่มฟีเจอร์ → เปิดไฟล์นี้แล้วรู้ทันทีว่าแก้ตรงไหน ไม่ต้องไล่โค้ดใหม่

---

## 0) TL;DR (โปรเจคนี้ทำอะไร)
- **Node/Server**: รันระบบ snapshot + สร้าง/อัปเดตไฟล์ JSON (ตลาด/ข่าว/derivatives/volatility/state)
- **Next.js Dashboard**: หน้า `/public` แสดงสภาวะตลาด + แผน (Plan Steps) + ปุ่มสั่ง snapshot
- จุดเชื่อมหลัก: `/run_full_snapshot` และ `/api/plan-status`

---

## 1) Source of Truth (ข้อมูลจริงของระบบอยู่ที่ไหน)

**ระบบถือว่าไฟล์ที่ root เป็น “ความจริง” (authoritative):**
- `C:\bingx-agent\market_snapshot.json`  
  → snapshot ตลาดล่าสุด (OHLC / orderbook / derivatives / session / volatility)
- `C:\bingx-agent\latest_decision.json`  
  → ผลวิเคราะห์ STEP01 ล่าสุด (market_mode / risk_warning / reason / levels / parameters / summary)

**Dashboard/API ของ Next.js ต้องอ่านจาก 2 ไฟล์นี้เป็นหลัก**
- ถ้ามีไฟล์ซ้ำใน `dashboard/app/public/data/` ให้ถือว่าเป็น **mirror/สำเนาเพื่อโชว์** เท่านั้น (ไม่ใช่แหล่งจริง)

---

## 2) Data Flow (ของจริง)
1) Trigger snapshot → อัปเดต `market_snapshot.json` (+ caches อื่น)
2) STEP01 run → เขียน `latest_decision.json`
3) Dashboard `/api/plan-status` → อ่าน 2 ไฟล์นี้เพื่อสร้างการ์ด/steps + สถานะ
4) (optional) mirror บางส่วนไป `dashboard/app/public/data/` เพื่อให้หน้า public เปิดได้เร็ว

---

## 3) โครงสร้างโฟลเดอร์หลัก (High-level)

### A) Dashboard (Next.js) — `dashboard/`

**Pages**
- `dashboard/app/public/page.tsx` — หน้าแสดงผลหลัก (Public Dashboard)
- `dashboard/app/page.tsx` — หน้า root (ถ้ามีใช้แยกจาก public)

**API Routes**
- `dashboard/app/api/plan-status/route.ts` — (หัวใจ) สร้างข้อมูลรวมสำหรับการ์ด/steps/status
- `dashboard/app/api/plan-log/route.ts` — ส่ง log ประวัติ plan
- `dashboard/app/api/latest/route.ts` — ส่งข้อมูล latest (เช่น decision/snapshot ล่าสุด)
- `dashboard/app/run_full_snapshot/route.ts` — endpoint สำหรับ “สั่งรัน snapshot” จากหน้าเว็บ

**Components (UI)**
- `dashboard/components/MarketStatusCard.tsx` — การ์ดสรุปสภาวะตลาด
- `dashboard/components/PlanTrackerCard.tsx` — การ์ดติดตาม plan/steps
- `dashboard/components/Step2Panel.tsx` — แสดงสรุป Step02/ข้อความไทย (ถ้ามี)
- `dashboard/components/PlanStepsRow.tsx` — แสดงแถว steps
- `dashboard/components/PageFreshBadge.tsx` — แสดงความสดของข้อมูล
- ปุ่ม:
  - `dashboard/components/RunSnapshotButton.tsx` — ปุ่มยิง `/run_full_snapshot`
  - `dashboard/components/RefreshPageButton.tsx` — ปุ่มรีเฟรชหน้า
  - `dashboard/components/CopyPostButton.tsx` — ปุ่มคัดลอกสรุป

**Plan Steps System**
- `dashboard/components/plan-steps/`
  - `buildSteps.ts` — ประกอบ steps สำหรับ UI
  - `pickStepSet.ts` — เลือกชุด steps ตามโหมด/เงื่อนไข
  - `timelineHelpers.ts` — helper (เช่น 2-liner Price vs OI / timeline logic)
  - `types.ts` — types ของ steps/log/status
  - `sets/` — ชุดกติกาแต่ละโหมด (GRID / TREND / NO_TRADE)
    - `gridSweepPipeline.ts`
    - `modeLockedTrend.ts`
    - `modeLockedTrendUp.ts`
    - `modeLockedNoTrade.ts`
    - `breakoutSwitchMode.ts`

**Lib**
- `dashboard/lib/readLatest.ts` — อ่านไฟล์ latest/snapshot/decision (ควรยึด root เป็นหลัก)
- `dashboard/lib/publicSummaryTH.ts` — สรุปไทยสำหรับหน้า public
- `dashboard/lib/planSteps/*` — wording/stepSets ที่ใช้ประกอบข้อความ/steps

---

### B) Server / Routes (Node) — Root
- `server.cjs` — entrypoint ของ Node server
- `routes/newsContext.cjs` — สร้าง/อัปเดต `news_context.json` (news risk overlay)

---

### C) VS Code Extension (Optional tooling) — `bingx-agent-runner/`
- โปรเจคแยกสำหรับ extension
- ไฟล์หลัก: `bingx-agent-runner/src/extension.ts`

> หมายเหตุ: ส่วนนี้มีไว้เป็น tooling ช่วยรัน/ควบคุม workflow ไม่ใช่แกน trading logic

---

## 4) Data / Runtime Files (ไฟล์ที่ “ระบบสร้างระหว่างรัน”)

> คุณตั้งใจ push ขึ้น repo เพื่อให้ดู state ได้ง่าย (ยอมรับว่า diff จะเยอะ)

**Root runtime/caches**
- `market_snapshot.json`
- `latest_decision.json`
- `news_context.json`
- `derivatives_history_cache.json`, `oi_history_cache.json`
- `volatility_baseline_cache.json`
- `plan_status_state.json`, `plan_status_log.jsonl`
- `latest_step2.txt`
- อื่น ๆ: `*_snapshot.json`, `*_cache.json`, `latest_*.tmp`

**Dashboard mirror (ถ้ามีใช้)**
- `dashboard/app/public/data/`
  - `latest_decision.json`
  - `market_snapshot.json`
  - `plan_history.jsonl`
  - `plan_status.json`

---

## 5) เส้นทางสำคัญ (Endpoints)
- Dashboard UI page: `/public`
- Trigger snapshot: `/run_full_snapshot`
- Get plan status: `/api/plan-status`
- Latest payload: `/api/latest`
- Plan logs: `/api/plan-log`

---

## 6) จุดที่มักจะ “เพิ่มฟีเจอร์” ต่อ (Extension Guide)
- เพิ่มการ์ดใหม่ในหน้า `/public`
  - แก้ `dashboard/app/public/page.tsx`
  - สร้าง component ใน `dashboard/components/`
  - เติม data ใน `dashboard/app/api/plan-status/route.ts`
- เพิ่ม logic แสดง steps ใหม่
  - เพิ่ม/แก้ set ใน `dashboard/components/plan-steps/sets/`
  - ปรับการเลือกชุดใน `pickStepSet.ts`
- เพิ่มข้อมูลที่ UI ต้องอ่านจาก root
  - ปรับ reader ที่ `dashboard/lib/readLatest.ts`
  - ปรับ payload ที่ `dashboard/app/api/plan-status/route.ts`
- เพิ่ม pipeline news
  - แก้ `routes/newsContext.cjs` และ mapping ที่ dashboard ใช้

---

## 7) TODO / Next upgrades
- [ ] ทำให้ `readLatest.ts` อ่านจาก root 100% (source of truth) และลดการพึ่ง `dashboard/app/public/data/`
- [ ] ตั้งระบบ “snapshot commit policy” (จะ commit runtime ทุกครั้ง หรือเฉพาะตอนสำคัญ)
- [ ] เพิ่ม release notes/changelog สั้น ๆ เมื่อเพิ่มฟีเจอร์ใหญ่

---

## 8) Documentation refs
Full tree: `docs/tree_full.txt`  
Dashboard tree: `docs/tree_dashboard.txt`  
Routes tree: `docs/tree_routes.txt`  
Repo files list: `docs/repo_files.txt`
