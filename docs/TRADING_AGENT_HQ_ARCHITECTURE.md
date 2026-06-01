# Layer 13 — TradingAgentHQ Experience Layer (Architecture)

> Canonical mode name: **TradingAgentHQ** · Visual codename: **Trading Caffe HQ — AI Agent Command Center**
> สถานะ: **APPROVED FOR ARCHITECTURE DESIGN + READ-ONLY FRONTEND PLANNING** (production = PENDING BUILD/QA)
> Created: 2026-05-31 · Scope: frontend experience expansion เท่านั้น — **ไม่ใช่** trading engine change

---

## Core Architecture Rule

> **TradingAgentHQ is a renderer of existing bot state, not a producer of trading decisions.**

เป็น presentation layer แบบ read-only ที่ map สถานะบอทจริง (paper evidence / risk / regime / alerts / agent roles) ให้กลายเป็น cozy pixel-art command center อ่านง่าย โดยไม่แตะ source-of-truth, ไม่ส่ง order, ไม่ approve risk, ไม่เปิด live trading, ไม่แทน `/public` technical diagnostics

---

## 1) Purpose
- ให้ frontend mode แบบ game-like cozy command center ที่อ่าน bot state ซับซ้อนได้ง่าย
- เพิ่ม operator awareness (regime/risk/paper/alerts) โดยไม่เปลี่ยน trading logic
- คงหน้า technical dashboard เดิมไว้ครบ (Classic + Advanced/Debug)

## 2) Non-goals
- ไม่เป็น source-of-truth · ไม่ place/cancel/replace order · ไม่ approve risk
- ไม่เปิด live trading / order placement · ไม่ mark readiness / live-ready
- ไม่แทน `/public` · ไม่เขียน runtime JSON · ไม่เรียก private/execution API

## 3) User Modes
| Mode | Route (proposed) | บทบาท |
|---|---|---|
| Classic Technical Dashboard | `/public` (เดิม ไม่แตะ) | ตัวเลข/การ์ด/diagnostics ของจริง = source of operational truth |
| TradingAgentHQ Visual Mode | `/agent-hq` (ใหม่ read-only) | cozy scene + agents + HUD + log |
| Advanced / Debug Mode | ปุ่มจาก `/agent-hq` → `/public` | กลับ technical dashboard + แสดง hitbox/raw state overlay |
| Low Power Mode | toggle ใน `/agent-hq` | static sprite, ไม่มี glow loop, event-only animation |

## 4) Agent Model (canonical 6)
| Agent | role | maps from |
|---|---|---|
| Grid Bot | order-balancing | paper engine / grid mode / fills |
| Trend Bot | momentum/breakout | decision (trend signals) |
| Risk Manager | capital guardian | risk state / safety flags / drawdown |
| News Analyst | news/feed scout | news_context overlay |
| Market Regime Analyst | macro/regime | latest_decision regime |
| Memory / Second Brain | logs/vector memory | journal / plan log |

> หมายเหตุ: idea doc เคยพิมพ์ "Portfolio Manager" หนึ่งครั้ง — **superseded**, canonical = 6 ตัวด้านบน

## 5) Scene Model
- background static 1672×941, coord top-left, sprite anchor bottom-center, default frame 256×256
- 6 desks (2 ฝั่ง × 3 แถว) ตาม placement (ดู ASSET_SPEC §scene)
- desk highlight / room tint = function ของ regime/risk (เช่น risk สูง → โทนแดง/ส้ม, นิ่ง → ฟ้า/เขียว)

## 6) Animation State Resolver
```
Raw System State → Normalized Visual State → Animation Key → Visual Behavior
```
- per-agent priority rules (เช่น error > alert > running > idle)
- `minHoldMs` (กันกระพริบ), `cooldownMs` (กัน flip ถี่), fallback = idle/static
- **missing data → default static/idle/UNKNOWN ห้าม fake active/PASS**

## 7) UI Overlay Model
- **Top HUD:** Market Mood · Sim/Paper Equity (ถ้ามี) · Daily PnL · Risk Heat · Agents Active · Last Update
- **Agent bubbles:** ข้อความสั้นตาม visual state
- **Bottom log bar:** latest paper events / alerts / decision log / system messages
- **Right inspector (คลิก agent):** name · status · current task · last action · metric · confidence/risk · debug link
- ห้ามขึ้นข้อความ live-ready / production-ready / approved

## 8) Interaction Model
- hover: desk glow + mini tooltip
- click: เปิด right inspector
- double-click / ปุ่ม: ไป Advanced/Debug (`/public`)
- click log → highlight agent ที่เกี่ยว
- mobile hitbox ต้องใหญ่กว่า sprite

## 9) Asset Pipeline
design PNG (ปัจจุบัน) → sprite sheet (256×256, 6 cols × 4 rows = 24 frames, 1536×1024, PNG transparent) → assetManifest → SceneCanvas
- assets อยู่ใน `dashboard/public/assets/trading-agent-hq/` (background/ + sprites/)
- **validate: ห้ามมี secret/runtime data ปนใน asset**

## 10) Data Binding Contract
ดู `TRADING_AGENT_HQ_IMPLEMENTATION_PLAN.md` §Data Binding (ViewModel: scene/agents/topHud/bottomLog/selectedAgent/safety/paper/meta) — รับจาก **public-safe endpoints เท่านั้น**

## 11) Performance Rules
- Normal: sprite anim + bubble + glow เบา ๆ · Low Power: static + event-only · Debug: ซ่อน game layer
- หลีกเลี่ยง continuous expensive re-render · refresh event/stale-safe, polling 500–1000ms เฉพาะเมื่อจำเป็น
- CSS/HTML overlay ก่อน — PixiJS/Canvas เฉพาะเมื่อ animation load หนักจริง (THQ-10+)

## 12) Accessibility Rules
- keyboard focus ได้ทุก agent/desk · tooltip มี text จริง · right panel collapsible
- color ไม่ใช่ channel เดียว (risk = สี + ไอคอน + ข้อความ) · contrast ผ่าน WCAG AA

## 13) Source-of-Truth Rules
- authoritative ยังเป็น `<ROOT>/latest_decision.json` + `<ROOT>/market_snapshot.json`; paper audit `<ROOT>/dashboard/tmp/execution-runner/*.jsonl` (via `EXECUTION_AUDIT_ROOT_DIR=<ROOT>/dashboard`)
- public/cache JSON (`dashboard/app/public/data/*`, `dashboard/public/data/*`) = display only **ห้าม** ถือเป็นจริง
- TradingAgentHQ อ่านผ่าน public-safe API/reader เท่านั้น ไม่ bypass ไปอ่าน cache เป็น truth

## 14) Safety Rules
- read-only เต็มตัว · ไม่มีปุ่ม order/approve/enable-live · ไม่มี mutation endpoint
- ต้องโชว์ (หรือ infer ได้): M-0B BLOCKED · live disabled · order disabled · APPROVAL not_approved
- `closedCycles=0` → แสดง DATA_GAP ห้ามโชว์เป็น edge PASS · paper PnL ≠ live PnL

## 15) Acceptance Criteria
ดู `TRADING_AGENT_HQ_IMPLEMENTATION_PLAN.md` §UI/UX Acceptance Criteria (Visual / Truthfulness / Data / Performance)

---

**Final boundary:** TradingAgentHQ ไม่ปลดล็อก M-0B และพัฒนาแบบขนานได้ในฐานะ read-only frontend mode — Phase M-0B remains BLOCKED จนกว่า closed cycles + sample + `/public` visual + operator review + approval ครบ
