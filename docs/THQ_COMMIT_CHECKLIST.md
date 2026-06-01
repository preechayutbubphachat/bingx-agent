# Commit Checklist — Hotfix + TradingAgentHQ (THQ) + Docs (2026-05-31)

> สำหรับ Codex/Operator รัน Git + build + deploy (Claude ไม่รัน Git ตาม policy)
> **ลำดับปลอดภัย:** ลบ lock → add เป็นกลุ่ม → build PASS → commit → push → deploy → verify
> **ห้าม:** commit runtime JSON / `.env` / secrets · เปิด live/order flag · set APPROVAL=approved
> **Phase M-0B remains BLOCKED** — งานชุดนี้เป็น frontend read-only + bugfix เท่านั้น ไม่ปลดล็อก M-0B

---

## 0) เคลียร์ lock ที่ค้าง (ถ้ามี)
```powershell
cd C:\2025\web-69\ob-gate17-200369\httpdocs
del .git\index.lock   # ถ้ามี; ปิด git GUI/editor ค้างก่อน
```

## 1) Group A — Hotfix: paper-performance UI crash (สำคัญสุด)
แก้ `Cannot read properties of undefined (reading 'roundTripCostPct')` บน `/public` เมื่อมี paper data
```
git add dashboard/app/api/paper-performance/route.ts
git add dashboard/components/PaperPerformanceCard.tsx
```

## 2) Group B — TradingAgentHQ frontend (read-only mode ใหม่)
```
# route + link
git add dashboard/app/agent-hq/page.tsx
git add dashboard/app/public/page.tsx            # เพิ่มลิงก์ 🎮 (1 บรรทัด)
# components
git add dashboard/components/trading-agent-hq/
# lib
git add dashboard/lib/trading-agent-hq/
# styles (THQ keyframes ต่อท้าย)
git add dashboard/app/globals.css
# assets (sprite sheets + café background)
git add dashboard/public/assets/trading-agent-hq/
```

## 3) Group C — Docs (architecture + plan + QA + M-0Z-6 updates)
```
git add PROJECT_ARCHITECTURE.md PROJECT_MAP.md PROJECT_CONTEXT.md
git add docs/TRADING_AGENT_HQ_ARCHITECTURE.md
git add docs/TRADING_AGENT_HQ_IMPLEMENTATION_PLAN.md
git add docs/TRADING_AGENT_HQ_ASSET_SPEC.md
git add docs/TRADING_AGENT_HQ_VISUAL_QA.md
git add docs/THQ_COMMIT_CHECKLIST.md
git add docs/SERVER_EVIDENCE_LEDGER.md
git add docs/M0Z6_PAPER_LOOP_A1_STATUS.md
git add docs/M0Z6_SERVER_DEPLOY_FIXES_2026-05-30.md
git add docs/M0Z6_CONTROL_INDEX.md
```
(optional) design source: `git add "TradingAgentHQ/"` — ไฟล์ออกแบบ (ใหญ่ ~30MB) commit หรือไม่ก็ได้

## 4) ตรวจก่อน commit — ต้องไม่มี runtime/secret หลุด
```
git status            # ยืนยันไม่มี *.json runtime / .env / *_cache / tmp/ / *.jsonl
git diff --cached --stat
```
ถ้าเห็น runtime JSON/.env/secret ใน staged → `git restore --staged <file>` ออกก่อน

## 5) Build gate (ต้อง EXIT 0)
```
cd dashboard
npm run build         # ต้อง Compiled / exit 0
cd ..
```
> หมายเหตุ: tsc ผ่าน Linux sandbox เคยให้ false error (mount truncate ไฟล์ใหญ่) — **ยึด `npm run build` บนเครื่องจริงเป็น gate**

## 6) Commit
```
git commit -m "fix(dashboard): paper-performance gridSpacingCheck + feat: TradingAgentHQ read-only visual mode

- fix: add gridSpacingCheck to /api/paper-performance success payload + guard PaperPerformanceCard
       (prevents /public crash when paper data present)
- feat: TradingAgentHQ (/agent-hq) cozy café command center — read-only visual layer
        * 6 agent sprites (24-frame sheets, transparent) on designed café background
        * public-safe adapter (public-health/paper-status/paper-performance) -> ViewModel, fallback->mock
        * animation resolver (priority/minHold/cooldown) + frame-cycling + CSS transforms
        * interaction: hover/click/double-click/ESC/log-highlight/mobile bottom-sheet
        * honest HUD: M-0B_BLOCKED, live OFF, orders OFF, approval not_approved, closedCycles=0 -> DATA_GAP
- docs: Layer 13 architecture + implementation plan + asset spec + visual QA (16/16) + M-0Z-6 ledger

Read-only presentation only. No trading logic, no live/order flags, no source-of-truth change.
Phase M-0B remains BLOCKED."
```

## 7) Push + Deploy (Plesk)
```
git push origin main
# บน server:
cd /var/www/vhosts/ob-gate.com/httpdocs && git pull
cd dashboard && npm run build && touch tmp/restart.txt   # หรือ restart app ใน Plesk
```

## 8) Verify หลัง deploy
- [ ] `/public` เปิดได้ ไม่ crash · การ์ด Paper Performance โชว์ "Round-trip cost" เป็น % (hotfix ทำงาน)
- [ ] `/agent-hq` โชว์ café + 6 ตัวนั่งตรงโต๊ะ · hover เห็นชื่อ+glow · click เปิด inspector · double-click → `/public`
- [ ] HUD badges: `M-0B_BLOCKED` · live OFF · orders OFF · approval not_approved · source `public-safe data`
- [ ] `/api/public-health` ยังคืน phase=M-0B_BLOCKED, flags=false (ไม่กระทบ)
- [ ] Low Power / Debug toggle ทำงาน · มือถือ inspector เด้ง bottom-sheet
- [ ] ไม่มี secret/stack trace บนหน้า · ไม่มี live-ready/approved claim

## Rollback (ถ้าพัง)
```
git revert <commit_sha>   # ปลอดภัยกว่า reset; redeploy ตามขั้น 7
```
หรือถ้า build พังเฉพาะ THQ: ลบลิงก์ใน `app/public/page.tsx` ออก แล้ว `/agent-hq` จะไม่ถูกเข้าถึง (route แยก ไม่กระทบ `/public`)

---

## Files summary
| Group | Files | Risk |
|---|---|---|
| A Hotfix | `paper-performance/route.ts`, `PaperPerformanceCard.tsx` | low (fix crash) |
| B THQ code | `app/agent-hq/`, `components/trading-agent-hq/` (8), `lib/trading-agent-hq/` (9), `globals.css`, `app/public/page.tsx` | low (read-only, route แยก) |
| B THQ assets | `public/assets/trading-agent-hq/sheets/` (6) + `background/cafe_scene.png` | low (static) |
| C Docs | architecture/plan/asset-spec/visual-QA/checklist + 4 M-0Z-6 docs + 3 PROJECT files | none |

**ยืนยัน:** ไม่มี trading-logic change · ไม่มี private/execution API · ไม่มี runtime JSON/.env ใน commit · live/order/approval คงเดิม · **Phase M-0B remains BLOCKED**
