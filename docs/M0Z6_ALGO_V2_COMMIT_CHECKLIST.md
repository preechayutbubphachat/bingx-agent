# Codex Commit Checklist — Algorithm v2: Dynamic Grid Guardrail + Regrid Diagnostics

> งานนี้: แก้ paper BUY-only bug (ราคาใต้ grid แต่ยังซื้อ) + dynamic grid engine + observability + tests + docs
> **PAPER-ONLY** · ห้ามแตะ live/order/approval/M-0B · Claude เตรียม patch แล้ว build/typecheck/test ผ่านในเครื่อง

---

## 0) Preflight
```powershell
cd C:\2025\web-69\ob-gate17-200369\httpdocs
del .git\index.lock 2>$null   # ถ้ามี
```
**สำคัญ:** ยืนยันว่า `paper_cycle.sh` บน **server (Plesk)** จะถูก deploy ทับด้วยเวอร์ชันใหม่นี้ — ตัว stale บน server คือต้นเหตุ BUY=1316

## 1) Root cause (สรุปสั้น)
guard `price_below_grid_lower` มีอยู่แล้ว แต่ guard อ่าน `CURRENT_PRICE = orderbook midPrice` (~73981, ค้างใน grid) ไม่ใช่ `market_snapshot close` (~66849 จริง) → guard ไม่ยิง → ซื้อรัวขาเดียว · closedCycles=0 เพราะไม่เคยเกิด SELL

## 2) Files to add (`git add`)
```
git add paper_cycle.sh
git add dashboard/lib/grid/dynamicGrid.ts
git add dashboard/lib/grid/dynamicGrid.test.ts
git add dashboard/lib/grid/marketSnapshot.ts          # hotfix: latest-close selector
git add dashboard/lib/grid/marketSnapshot.test.ts
git add dashboard/lib/paper/paperLoopDiagnostics.ts
git add dashboard/lib/paper/paperLoopDiagnostics.test.ts
git add dashboard/app/api/paper-performance/route.ts
git add PROJECT_ARCHITECTURE.md
git add docs/M0Z6_ALGO_V2_COMMIT_CHECKLIST.md
```

### Hotfix (post-fd95ffd) — included above
- `paper_cycle.sh`: `json_number_last` + `SNAPSHOT_CLOSE` ใช้ **close ตัวล่าสุด** (เดิมอ่านตัวแรก=เก่าสุด → priceVsGrid ผิด) · no-trade audit ย้ายไป `tmp/execution-runner/paper_no_trade.jsonl` type=`PAPER_NO_TRADE` + payload เพิ่ม priceVsGrid/decisionPrice/snapshotPrice/priceDriftPct/buyFillCount/sellFillCount
- `lib/grid/marketSnapshot.ts`: `getLatestCloseFromMarketSnapshot()` (max-ts → last element → scalar) + 7 tests
- `paperLoopDiagnostics.ts`: เพิ่ม `sampleBuyFillCount`/`sampleSellFillCount` (คง raw* backward-compat)
- commit message: `fix(paper): use latest market close for grid diagnostics and no-trade audit logs`

## 3) สิ่งที่แต่ละไฟล์ทำ
| ไฟล์ | การเปลี่ยน |
|---|---|
| `paper_cycle.sh` | **fix หลัก:** `CURRENT_PRICE` = market_snapshot close (เดิม orderbook mid) + **stale gate** (drift>1% → `stale_decision_or_price_mismatch`) + **exposure cap** (one-sided fills>5 → `one_sided_buy_limit`/`one_sided_sell_limit`). guard below/above grid เดิมคงไว้ |
| `lib/grid/dynamicGrid.ts` | `calculateDynamicGrid()` pure — 11 states, gates เรียง stale→exposure→range→vol→cost→regime→inside, dynamic grid candidate (ATR width, spacing > cost×2.5) |
| `lib/grid/dynamicGrid.test.ts` | 9 unit tests (node:test) |
| `lib/paper/paperLoopDiagnostics.ts` | `buildPaperLoopDiagnostics(summary)` pure — priceVsGrid/state/noTradeReason counts/dynamicGrid |
| `lib/paper/paperLoopDiagnostics.test.ts` | 4 unit tests |
| `app/api/paper-performance/route.ts` | เพิ่ม `paperLoopDiagnostics` + `paperDataQuality.hasNoTradeLogs/hasDynamicGridDiagnostics` (additive, try/catch, backward-compatible) |
| `PROJECT_ARCHITECTURE.md` | Layer 07 · Dynamic Grid Engine v2 |

## 4) ตรวจก่อน commit — ห้ามมี runtime/secret หลุด
```
git status
git diff --cached --stat
```
ต้องไม่มี: `.env` · `*.json` runtime (latest_decision/market_snapshot/...) · `*.jsonl` · `tmp/` · `logs/` · `.next/` · `node_modules/` · secrets
→ ถ้าหลุด: `git restore --staged <file>`

## 5) Validate (ต้องผ่านทั้งหมด)
```
# bash syntax (รันบน checkout จริง — ห้ามใช้ mount ที่ truncate)
bash -n paper_cycle.sh                 # ต้องไม่มี error

cd dashboard
npm run build                          # ต้อง EXIT 0
# (optional) typecheck/lint ถ้ามี script
# unit tests — ถ้ายังไม่มี vitest:
npm i -D vitest && npx vitest run lib/grid lib/paper   # คาดหวัง 13 passed
#   หรือไม่ติด dep: copy lib ไป /tmp, แก้ import เป็น .ts, node --test --experimental-strip-types
cd ..
```
**ผลที่ Claude ได้ในเครื่อง:** tsc clean · unit tests 13/13 passed · drift sim 10.667% (stale gate ยิง) · snapshot close 66849 < grid_lower 72480 = BELOW_GRID

## 6) Commit + Push
```
git commit -m "fix(paper): add dynamic grid guardrail and regrid diagnostics

paper_cycle.sh: use market_snapshot close as gate source-of-truth + stale-price
gate (drift>1%) + one-sided exposure cap. add lib/grid/dynamicGrid.ts (pure paper
engine, 11 states) + lib/paper/paperLoopDiagnostics.ts + /api/paper-performance
observability (additive) + unit tests (13) + Layer 07 architecture docs.

PAPER-ONLY. No live/order/approval changes. M-0B remains BLOCKED."
git push origin main
```

## 7) Deploy (Plesk) + verify
```
# server:
cd /var/www/vhosts/ob-gate.com/httpdocs
bash -n paper_cycle.sh                 # ต้องผ่าน
git pull
cd dashboard && npm run build && touch tmp/restart.txt
```
**ตรวจหลัง deploy:**
- [ ] cron รัน paper_cycle.sh → log แสดง `stale/price mismatch` หรือ `price below grid_lower` · **ไม่มี BUY ใหม่**
- [ ] `/api/paper-performance` → `paperLoopDiagnostics.priceVsGrid=BELOW_GRID` · `rawBuyFillCount>0, rawSellFillCount=0` · `lastNoTradeReason` ปรากฏ · เดิมทุก field ยังอยู่ (backward-compatible)
- [ ] `/api/public-health` ยัง `SAFE_PUBLIC_HEALTH` phase=M-0B_BLOCKED
- [ ] safety flags ไม่เปลี่ยน

## 8) Rollback
```
git revert <sha> ; redeploy ตามขั้น 7
```

## Safety invariants (ยืนยัน)
LIVE_TRADING_ENABLED / ENABLE_ORDER_PLACEMENT / PRODUCTION_TRADING_READY / EXCHANGE_MANUAL_APPROVAL **unchanged** · ไม่ force-fill · ไม่ fake closedCycles · ไม่เรียก BingX private/execution API · ไม่แก้ runtime JSON/.env · **M-0B remains BLOCKED**

> หมายเหตุ: งาน frontend TradingAgentHQ (icons/scroll/Thai localization) เป็น **commit แยก** — ดู `docs/THQ_COMMIT_CHECKLIST.md` ไม่รวมใน commit นี้
