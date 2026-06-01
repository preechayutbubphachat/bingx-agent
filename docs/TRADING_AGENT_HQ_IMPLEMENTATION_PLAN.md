# TradingAgentHQ — Implementation Plan

> Read-only frontend mode · พัฒนาขนานกับ M-0B ได้ · **ไม่ปลดล็อก M-0B**
> อ้างสถาปัตยกรรม: `TRADING_AGENT_HQ_ARCHITECTURE.md` (Layer 13) · asset: `TRADING_AGENT_HQ_ASSET_SPEC.md`

---

## Phased Roadmap (THQ-0 → THQ-11)

| Phase | Objective | Files likely touched | Output | Validation | Risk | Dependency | M-0B impact |
|---|---|---|---|---|---|---|---|
| THQ-0 | Asset & idea inventory | (none — read-only) | asset inventory table (ASSET_SPEC) | ทุกไฟล์ classify | ต่ำ | — | none |
| THQ-1 | Architecture docs integration | PROJECT_ARCHITECTURE.md, PROJECT_MAP.md, docs/* | Layer 13 + roadmap ref | docs render | ต่ำ | THQ-0 | none |
| THQ-2 | Asset manifest + scene config | public/assets/.., lib/.../assetManifest.ts, sceneConfig.ts | manifest + scene config | no secret in assets | ต่ำ | THQ-1 | none |
| THQ-3 | Route + mode switch | app/agent-hq/page.tsx, components/.../ModeSwitch.tsx | `/agent-hq` route + ปุ่มกลับ `/public` | `/public` ไม่เปลี่ยน | ต่ำ | THQ-2 | none |
| THQ-4 | Static scene prototype | SceneCanvas, AgentSprite, AgentBubble | render bg + 6 agents (mock) | ไม่มี real data | ต่ำ | THQ-3 | none |
| THQ-5 | Real bot state adapter | lib/.../viewModel.ts | ViewModel จาก public-safe API | ไม่เรียก private API, ไม่ mutate | กลาง | THQ-4 | none |
| THQ-6 | Animation state resolver | lib/.../stateResolver.ts, animationConfig.ts | raw→visual→anim key | missing→idle | กลาง | THQ-5 | none |
| THQ-7 | Interaction layer | AgentSprite, RightInspector | hover/click/inspect/debug link | mobile hitbox ใหญ่ | ต่ำ | THQ-6 | none |
| THQ-8 | UI overlay integration | TopHud, BottomLogBar, RightInspector | HUD + log + inspector | ไม่มี live-ready claim | กลาง | THQ-7 | none |
| THQ-9 | Visual QA + safety gate | (review) | 16-item truth checklist | no secret/trace/false-PASS | กลาง | THQ-8 | none |
| THQ-10 | Performance + low power | SceneCanvas, ModeSwitch | normal/low-power/debug | no heavy re-render | กลาง | THQ-9 | none |
| THQ-11 | Frontend production readiness | — | build+QA PASS | mobile/tablet sane, no SoT violation | กลาง | THQ-10 | none |

> **ย้ำ:** ทุก phase M-0B impact = none · TradingAgentHQ **ไม่ปลดล็อก M-0B** · live/order/approval คง disabled

---

## Frontend File Structure (proposed)

```
dashboard/app/agent-hq/page.tsx                         # read-only route
dashboard/components/trading-agent-hq/
  TradingAgentHQPage.tsx
  SceneCanvas.tsx        AgentSprite.tsx     AgentBubble.tsx
  TopHud.tsx             BottomLogBar.tsx    RightInspector.tsx
  ModeSwitch.tsx
dashboard/lib/trading-agent-hq/
  viewModel.ts           stateResolver.ts    sceneConfig.ts
  animationConfig.ts     assetManifest.ts
dashboard/public/assets/trading-agent-hq/
  background/            sprites/
```

**Rules:** CSS/HTML overlay ก่อน · ไม่ใส่ PixiJS จนกว่ามีเหตุผล performance (THQ-10+) · React static prototype พอสำหรับ THQ-4 · ไม่มี mutation endpoint / runtime JSON write / trading API call / order button / approval control

---

## Data Binding Contract (ViewModel)

รับจาก public-safe เท่านั้น: `/api/public-health`, `/api/paper-performance`, public-safe diagnostics, plan/status (ถ้าปลอดภัย)

```jsonc
{
  "mode": "trading_agent_hq",
  "meta":   { "lastUpdate": "...", "source": "public-safe-api", "isStale": false },
  "safety": {
    "liveTradingEnabled": false, "orderPlacementEnabled": false,
    "productionTradingReady": false, "exchangeManualApproval": "not_approved",
    "phase": "M-0B_BLOCKED"
  },
  "paper":  {
    "totalOrderFilled": 0, "closedCycles": 0,
    "sampleStatus": "INSUFFICIENT_SAMPLE", "paperModeDetected": true
  },
  "topHud":      { "marketMood": "UNKNOWN", "simEquity": null, "dailyPnl": null, "riskHeat": "UNKNOWN", "agentsActive": 0 },
  "bottomLog":   [ { "ts": "...", "type": "FILL_RESULT|ALERT|DECISION|SYSTEM", "text": "..." } ],
  "selectedAgent": null,
  "agents": {
    "grid_bot":      { "status": "running", "visualStates": ["running","balancing_orders"], "animation": "grid_working", "bubble": "Balancing orders..." },
    "trend_bot":     { "status": "unknown", "visualStates": ["idle"], "animation": "idle", "bubble": "..." },
    "risk_manager":  { "status": "guarding", "visualStates": ["calm"], "animation": "idle", "bubble": "..." },
    "news_analyst":  { "status": "unknown", "visualStates": ["idle"], "animation": "idle", "bubble": "..." },
    "market_regime": { "status": "unknown", "visualStates": ["idle"], "animation": "idle", "bubble": "..." },
    "memory_brain":  { "status": "logging", "visualStates": ["idle"], "animation": "idle", "bubble": "..." }
  }
}
```

**Rules:**
- missing data → UNKNOWN / idle / warning **ไม่ใช่ fake PASS**
- `closedCycles=0` → แสดง DATA_GAP · `totalOrderFilled` อย่างเดียว ≠ edge · paper fill ≠ live PnL
- visual mode แสดง source/freshness (`meta.source`, `meta.isStale`)

---

## UI/UX Acceptance Criteria

**Visual:** bg renders · 6 agents placed ถูกตำแหน่ง · top HUD เห็น · inspector เปิดเมื่อคลิก · bubble render · bottom log render · low power ทำงาน · debug link ทำงาน

**Truthfulness:** M-0B BLOCKED เห็น/infer ได้ · live disabled · order disabled · APPROVAL not_approved · paper closed-cycle honest · ไม่มี live-ready/production-ready/approval claim

**Data:** ทุกค่าจาก public-safe endpoint/safe server reader · source/freshness handled · missing ≠ PASS · cache JSON ไม่ใช่ authoritative

**Performance:** ไม่มี continuous expensive re-render · low power available · mobile/tablet ไม่พัง · right panel collapsible

---

## THQ-9 — 16-item Visual Truth Checklist (gate)
1 UI loads · 2 no crash · 3 no stack trace · 4 no secret · 5 scene/agents render · 6 HUD render · 7 paper area render · 8 paper fill evidence visible · 9 closed-cycle honest · 10 0 closed ≠ PASS · 11 M-0B BLOCKED shown · 12 live disabled · 13 order disabled · 14 APPROVAL not_approved · 15 cache ≠ authoritative · 16 no live-ready/approved claim

ทุกข้อต้อง PASS หรือ acceptable WARNING (ไม่มี real bug) ก่อนถือว่า frontend mode ผ่าน — **แยกขาดจาก M-0B gate**
