# THQ-9 — TradingAgentHQ Visual QA Gate (16-item truthfulness checklist)

> Scope: **frontend visual mode gate only**. PASS ที่นี่ **ไม่ปลดล็อก M-0B** และไม่ใช่ live-ready.
> Method: static code verification (grep evidence) + live render confirmed by operator screenshots.
> Date: 2026-05-31 · Route: `/agent-hq` (read-only)

---

## Checklist

| # | Item | Class | Evidence |
|---|------|-------|----------|
| 1 | UI loads | **PASS** | route `app/agent-hq/page.tsx` renders; tsc no real TS2xxx; operator screenshot shows page |
| 2 | no crash page | **PASS** | adapter defensive (optional-chain); hook fallback→mock on fetch fail; screenshot renders |
| 3 | no stack trace visible | **PASS** | errors shown as short text `endpoint: <msg>`, never raw trace |
| 4 | no secret / env exposure | **PASS** | grep `process.env / API_KEY / SECRET / TOKEN` in client = **NONE** |
| 5 | scene + 6 agents render | **PASS** | café background + 6 sprites placed (screenshot) |
| 6 | top HUD renders | **PASS** | `TopHud` shows mood/equity/PnL/riskHeat/agents/lastUpdate |
| 7 | paper area renders | **PASS** | bottom log always-on (`no recent paper events`) + RightInspector paper block |
| 8 | paper fill evidence visible | **PASS** | inspector `Paper: fills=N · closedCycles=N`; Grid bubble `Filled N`; log entries |
| 9 | closed-cycle status honest | **PASS** | `closedCycles === 0 → "DATA_GAP (ยังไม่พิสูจน์ edge)"` (RightInspector + adapter) |
| 10 | 0 closed cycles ≠ PASS | **PASS** | adapter `edgeStatus = closedCycles===0 ? "DATA_GAP"`; never "edge PASS" at 0 |
| 11 | M-0B BLOCKED shown | **PASS** | TopHud red badge `{s.phase}` = `M-0B_BLOCKED` |
| 12 | live trading disabled visible | **PASS** | TopHud `live: OFF` from `liveTradingEnabled` |
| 13 | order placement disabled visible | **PASS** | TopHud `orders: OFF` from `orderPlacementEnabled` |
| 14 | APPROVAL not_approved visible | **PASS** | TopHud amber `approval: not_approved` |
| 15 | cache JSON not authoritative | **PASS** | adapter reads only public-safe **API** (`/api/public-health`, `/api/paper-status`, `/api/paper-performance`), never cache files; footer: "source of truth อยู่ที่ Classic Dashboard /public"; source badge `public-safe data` vs `MOCK / fallback` |
| 16 | no live-ready / production-ready / approved claim | **PASS** | grep forbidden claims → only in **comments** ("never live-ready"); no user-facing claim; values shown honestly |

**Result: 16 / 16 PASS** (no real bug, no truthfulness violation)

---

## Notes / minor
- Detailed paper metrics live in **RightInspector** (click agent); always-on signals = bottom log + Grid bubble + HUD badges. Acceptable.
- Sprites are real design-sheet frames (transparent); background is procedural café art. No claim of being a live/production trading control.
- Source/freshness always shown (`meta.source`, `isStale`, `loading…`).

## Gate boundary (must not soften)
- This is the **TradingAgentHQ frontend visual gate** — PASS here means the read-only mode renders honestly.
- It is **independent of M-0B**. Phase **M-0B remains BLOCKED**; live trading DISABLED; order placement DISABLED; EXCHANGE_MANUAL_APPROVAL not_approved.
- TradingAgentHQ does **not** unblock M-0B, mark READY_FOR_REVIEW, or imply LIVE_READY.

## Operator live re-check (recommended, full-res authenticated)
เปิด `/agent-hq` จริง → ยืนยันด้วยตา: ตัวละคร 6 ตัวขึ้น, HUD badges (M-0B_BLOCKED/live OFF/orders OFF/not_approved) อ่านได้, ลองคลิก agent ดู DATA_GAP, สลับ Low Power/Debug, double-click → `/public`. ถ้าครบ = visual gate ของ frontend mode ปิดงานได้ (แยกจาก `/public` 16-item gate ของ M-0B)
