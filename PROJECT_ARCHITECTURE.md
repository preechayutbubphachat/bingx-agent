# PROJECT_ARCHITECTURE.md

> Professional Trading Bot System Blueprint
> Project: `bingx-agent`
> Purpose: à¸ à¸²à¸žà¸£à¸§à¸¡à¹‚à¸„à¸£à¸‡à¸ªà¸£à¹‰à¸²à¸‡à¸£à¸°à¸šà¸š 100% à¸ªà¸³à¸«à¸£à¸±à¸šà¸šà¸­à¸—à¹€à¸—à¸£à¸”à¹€à¸”à¸­à¸£à¹Œà¸¡à¸·à¸­à¹‚à¸›à¸£
> Status: Blueprint / Architecture Reference
> Live Trading: **Disabled by default**
> Real Order Placement: **Disabled by default**

---

## 0) How This File Should Be Used

à¹„à¸Ÿà¸¥à¹Œà¸™à¸µà¹‰à¸„à¸·à¸­ **à¸ à¸²à¸žà¸£à¸§à¸¡à¹‚à¸„à¸£à¸‡à¸ªà¸£à¹‰à¸²à¸‡à¸£à¸°à¸šà¸šà¹€à¸•à¹‡à¸¡ 100%** à¸‚à¸­à¸‡à¹‚à¸›à¸£à¹€à¸ˆà¸„à¸šà¸­à¸—à¹€à¸—à¸£à¸”à¹€à¸”à¸­à¸£à¹Œ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹„à¸Ÿà¸¥à¹Œ status à¸£à¸²à¸¢à¸§à¸±à¸™

à¹ƒà¸«à¹‰à¹à¸¢à¸à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¸à¸±à¸š `PROJECT_MAP.md` à¸”à¸±à¸‡à¸™à¸µà¹‰:

```text
PROJECT_MAP.md
= à¸ªà¸–à¸²à¸™à¸°à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸‚à¸­à¸‡à¹‚à¸›à¸£à¹€à¸ˆà¸„, phase à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™, roadmap, source of truth, changelog, agent rules

PROJECT_ARCHITECTURE.md
= blueprint à¸£à¸°à¸šà¸šà¹€à¸•à¹‡à¸¡ 100%, layer architecture, trading logic, risk logic, paper/live flow
```

AI cowork à¸•à¹‰à¸­à¸‡à¸­à¹ˆà¸²à¸™à¹„à¸Ÿà¸¥à¹Œà¸™à¸µà¹‰à¹€à¸¡à¸·à¹ˆà¸­à¸—à¸³à¸‡à¸²à¸™à¹€à¸à¸µà¹ˆà¸¢à¸§à¸à¸±à¸š:

- à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸£à¸·à¸­à¹à¸à¹‰ trading logic
- à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸£à¸·à¸­à¹à¸à¹‰ paper trading
- à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸£à¸·à¸­à¹à¸à¹‰ live readiness
- à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸£à¸·à¸­à¹à¸à¹‰ risk engine
- à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸£à¸·à¸­à¹à¸à¹‰ SMC / regime / grid logic
- à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸£à¸·à¸­à¹à¸à¹‰ monitoring / incident / audit architecture
- à¸§à¸²à¸‡à¹à¸œà¸™ phase à¹ƒà¸«à¸¡à¹ˆà¸«à¸¥à¸±à¸‡à¸ˆà¸²à¸ roadmap à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™

AI cowork à¸•à¹‰à¸­à¸‡à¸­à¹ˆà¸²à¸™ `PROJECT_MAP.md` à¸à¹ˆà¸­à¸™à¹€à¸ªà¸¡à¸­à¹€à¸žà¸·à¹ˆà¸­à¸”à¸¹à¸ªà¸–à¸²à¸™à¸°à¸¥à¹ˆà¸²à¸ªà¸¸à¸” à¹à¸¥à¹‰à¸§à¸ˆà¸¶à¸‡à¸­à¹ˆà¸²à¸™à¹„à¸Ÿà¸¥à¹Œà¸™à¸µà¹‰à¹€à¸žà¸·à¹ˆà¸­à¹€à¸‚à¹‰à¸²à¹ƒà¸ˆà¸ à¸²à¸žà¹ƒà¸«à¸à¹ˆà¸‚à¸­à¸‡à¸£à¸°à¸šà¸š

---

## 1) Design Philosophy

à¸£à¸°à¸šà¸šà¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸­à¸­à¸à¹à¸šà¸šà¹€à¸›à¹‡à¸™ â€œà¸šà¸­à¸—à¸ªà¹ˆà¸‡ order à¸•à¸²à¸¡à¸ªà¸±à¸à¸à¸²à¸“â€ à¹à¸•à¹ˆà¹€à¸›à¹‡à¸™ **Trading Operating System** à¸—à¸µà¹ˆà¸„à¸¸à¸¡à¸„à¸£à¸šà¸•à¸±à¹‰à¸‡à¹à¸•à¹ˆ data, signal, regime, SMC, grid, risk, paper simulation, monitoring, à¹à¸¥à¸° live migration gate

à¸«à¸¥à¸±à¸à¸à¸²à¸£à¸ªà¸³à¸„à¸±à¸:

```text
1. Data-first
2. Source-of-truth-first
3. Risk-first
4. Paper-before-live
5. Monitoring-before-scaling
6. No trade is a valid decision
7. Signal â‰  Order
8. Backtest profit â‰  Live readiness
9. Gross PnL is not edge; net expectancy is edge
10. Strategy signal must never override safety guardrail
```

à¹à¸™à¸§à¸„à¸´à¸”à¸«à¸¥à¸±à¸à¸‚à¸­à¸‡à¸£à¸°à¸šà¸š:

```text
Market Data
â†’ Feature / Indicator Engine
â†’ Market Regime Engine
â†’ SMC Hybrid Bias Engine
â†’ Grid Mode Decision Engine
â†’ Grid Parameter Engine
â†’ Cost / Risk / Expectancy Gate
â†’ Paper Execution or Live Execution Gate
â†’ Monitoring / Audit / Journal
â†’ Performance Attribution
â†’ Live Migration Decision
```

---

## 2) Current Known Project Position

> à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸: à¸ªà¹ˆà¸§à¸™à¸™à¸µà¹‰à¹€à¸›à¹‡à¸™ snapshot à¸ˆà¸²à¸à¸ªà¸–à¸²à¸™à¸°à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸—à¸µà¹ˆà¸„à¸¸à¸¢à¸à¸±à¸™à¹ƒà¸™à¹‚à¸›à¸£à¹€à¸ˆà¸„ à¸«à¸²à¸à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸ªà¸–à¸²à¸™à¸°à¸ˆà¸£à¸´à¸‡à¸¥à¹ˆà¸²à¸ªà¸¸à¸” à¹ƒà¸«à¹‰à¸”à¸¹ `PROJECT_MAP.md`

## 2.1 Runtime Root Location Policy

à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸•à¸¥à¸²à¸”à¸ˆà¸£à¸´à¸‡à¹à¸¥à¸°à¹„à¸Ÿà¸¥à¹Œ decision/runtime à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸–à¸¹à¸ fix à¹„à¸§à¹‰à¸—à¸µà¹ˆ path à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡ `C:/bingx-agent` à¹€à¸ªà¸¡à¸­à¹„à¸›

à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸—à¸µà¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡à¸„à¸·à¸­ **project runtime root** à¸«à¸£à¸·à¸­ **à¹‚à¸Ÿà¸¥à¹€à¸”à¸­à¸£à¹Œà¸«à¸¥à¸±à¸à¸‚à¸­à¸‡à¹‚à¸›à¸£à¹€à¸ˆà¸„à¸—à¸µà¹ˆ backend/snapshot process à¹€à¸‚à¸µà¸¢à¸™à¹„à¸Ÿà¸¥à¹Œ JSON à¸¥à¸‡à¹„à¸›**

à¹ƒà¸™ production server:

```text
<PROJECT_ROOT> = httpdocs/
à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡: /home/<user>/httpdocs/
```

à¹ƒà¸™à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡ local Windows:

```text
<PROJECT_ROOT> = .../httpdocs/
à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡: C:/2025/web-69/ob-gate17-200369/httpdocs/
```

à¸”à¸±à¸‡à¸™à¸±à¹‰à¸™à¹„à¸Ÿà¸¥à¹Œ source-of-truth à¸„à¸§à¸£à¸­à¹‰à¸²à¸‡à¹à¸šà¸šà¸™à¸µà¹‰:

```text
<PROJECT_ROOT>/market_snapshot.json
<PROJECT_ROOT>/latest_decision.json
```

à¹„à¸¡à¹ˆà¸„à¸§à¸£ hard-code à¹€à¸›à¹‡à¸™:

```text
C:/bingx-agent/market_snapshot.json
C:/bingx-agent/latest_decision.json
```

Environment variable à¸—à¸µà¹ˆà¹ƒà¸Šà¹‰à¸Šà¸µà¹‰ root path à¸„à¸§à¸£à¸«à¸¡à¸²à¸¢à¸–à¸¶à¸‡ project root/httpdocs:

```text
BINGX_AGENT_DIR=<PROJECT_ROOT>
```

à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡ local:

```text
BINGX_AGENT_DIR=C:/2025/web-69/ob-gate17-200369/httpdocs
```

à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡ server:

```text
BINGX_AGENT_DIR=/home/<user>/httpdocs
```

Hard rule:

```text
- Source-of-truth files à¸­à¸¢à¸¹à¹ˆà¸—à¸µà¹ˆ project root/httpdocs
- Dashboard à¸•à¹‰à¸­à¸‡à¸­à¹ˆà¸²à¸™à¸ˆà¸²à¸ project root à¸œà¹ˆà¸²à¸™ BINGX_AGENT_DIR à¸«à¸£à¸·à¸­ root-detection à¸—à¸µà¹ˆà¸›à¸¥à¸­à¸”à¸ à¸±à¸¢
- à¸«à¹‰à¸²à¸¡à¸œà¸¹à¸ architecture à¸à¸±à¸š path C:/bingx-agent à¹à¸šà¸šà¸•à¸²à¸¢à¸•à¸±à¸§
- dashboard/app/public/data/*.json à¸¢à¸±à¸‡à¹€à¸›à¹‡à¸™ mirror/cache/display-only à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
- Git must not track runtime generated JSON/TXT/JSONL files
- Use docs/RUNTIME_FILES_GIT_POLICY.md as the release rule for runtime file cleanup
- Use .example.json or .example.jsonl only for committed sample data
- If runtime files were tracked before, remove them with git rm --cached only
- Never delete server runtime files during Git cleanup
```


à¸ªà¸–à¸²à¸™à¸°à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¹‚à¸”à¸¢à¸›à¸£à¸°à¸¡à¸²à¸“:

```text
Phase G â€” Extended Monitoring & Alerts: completed
Phase H â€” Paper Trading Readiness: in progress / partially completed
Phase I â€” Reconcile & Runtime State Audit: next or in progress depending latest PROJECT_MAP.md
Phase J â€” Paper Trading Simulation Dashboard: next after Phase I
Phase K â€” Live Migration Gate: future
```

à¸ªà¸–à¸²à¸™à¸° safety:

```text
Production Trading: Not yet
Live Trading Enabled: No
Order Placement Enabled: No
Paper Trading: being prepared / simulation only
```

Source of truth à¸«à¸¥à¸±à¸:

```text
<PROJECT_ROOT>/market_snapshot.json
<PROJECT_ROOT>/latest_decision.json
```

Mirror/cache only:

```text
dashboard/app/public/data/*.json
```

---

## 3) 100% Professional Bot Architecture â€” 12 Layers

à¸£à¸°à¸šà¸šà¹€à¸•à¹‡à¸¡à¸„à¸§à¸£à¹à¸šà¹ˆà¸‡à¹€à¸›à¹‡à¸™ 12 layers à¸”à¸±à¸‡à¸™à¸µà¹‰

```text
Layer 01 â€” Project Governance & Agent Control
Layer 02 â€” Source of Truth & Runtime State
Layer 03 â€” Market Data & Data Quality Engine
Layer 04 â€” Indicator / Feature Engine
Layer 05 â€” Market Regime Classification Engine
Layer 06 â€” SMC Hybrid Decision Engine
Layer 07 â€” Grid Mode & Parameter Engine
Layer 08 â€” Cost, Risk, Expectancy & Risk-of-Ruin Engine
Layer 09 â€” Paper Trading / Simulation Engine
Layer 10 â€” Execution & Order Lifecycle Engine
Layer 11 â€” Monitoring, Audit & Incident Response Engine
Layer 12 â€” Live Migration & Scaling Gate
```

à¹à¸•à¹ˆà¸¥à¸° layer à¸•à¹‰à¸­à¸‡à¹à¸¢à¸à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¸Šà¸±à¸”à¹€à¸ˆà¸™ à¹à¸¥à¸°à¸«à¹‰à¸²à¸¡à¹ƒà¸«à¹‰ layer à¹ƒà¸”à¸‚à¹‰à¸²à¸¡ safety gate à¹‚à¸”à¸¢à¸•à¸£à¸‡

---

# Layer 01 â€” Project Governance & Agent Control

## Purpose

à¸„à¸¸à¸¡à¹ƒà¸«à¹‰ AI cowork à¹à¸¥à¸° developer à¸—à¸³à¸‡à¸²à¸™à¹€à¸›à¹‡à¸™à¸£à¸°à¸šà¸š à¹„à¸¡à¹ˆà¸«à¸¥à¸‡à¸—à¸²à¸‡ à¹„à¸¡à¹ˆà¹à¸à¹‰à¸œà¸´à¸” scope à¹à¸¥à¸°à¹„à¸¡à¹ˆà¸—à¸³à¹ƒà¸«à¹‰ source-of-truth à¸«à¸£à¸·à¸­ trading safety à¸žà¸±à¸‡

## Main Files

```text
PROJECT_MAP.md
PROJECT_ARCHITECTURE.md
CHANGELOG section à¹ƒà¸™ PROJECT_MAP.md
Agent Work Rules section
Snapshot Commit Policy section
Roadmap section
```

## Responsibilities

- à¸£à¸°à¸šà¸¸ current phase
- à¸£à¸°à¸šà¸¸ next phase
- à¸£à¸°à¸šà¸¸ source of truth
- à¸£à¸°à¸šà¸¸ live/paper/order placement status
- à¸£à¸°à¸šà¸¸ roadmap
- à¸£à¸°à¸šà¸¸ changelog
- à¸£à¸°à¸šà¸¸ hard rules à¸ªà¸³à¸«à¸£à¸±à¸š AI cowork
- à¸£à¸°à¸šà¸¸ validation à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸—à¸³à¸«à¸¥à¸±à¸‡à¹à¸à¹‰

## Required Agent Rule

à¸—à¸¸à¸à¸„à¸£à¸±à¹‰à¸‡à¸à¹ˆà¸­à¸™à¸—à¸³à¸‡à¸²à¸™ AI cowork à¸•à¹‰à¸­à¸‡à¸•à¸­à¸šà¹ƒà¸«à¹‰à¹„à¸”à¹‰:

```text
Current Stage à¸„à¸·à¸­à¸­à¸°à¹„à¸£?
Source of Truth à¸„à¸·à¸­à¸­à¸°à¹„à¸£?
à¹„à¸Ÿà¸¥à¹Œà¹„à¸«à¸™à¸ˆà¸°à¸–à¸¹à¸à¹à¸à¹‰?
Data flow à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸‚à¹‰à¸­à¸‡à¸„à¸·à¸­à¸­à¸°à¹„à¸£?
à¸•à¹‰à¸­à¸‡ validate à¸­à¸°à¹„à¸£?
à¸•à¹‰à¸­à¸‡ update PROJECT_MAP.md à¹„à¸«à¸¡?
```

## Completion Target

```text
Governance completeness target: 95â€“100%
```

---

# Layer 02 â€” Source of Truth & Runtime State

## Purpose

à¸à¸³à¸«à¸™à¸”à¸§à¹ˆà¸²à¹„à¸Ÿà¸¥à¹Œà¹„à¸«à¸™à¸„à¸·à¸­à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸£à¸´à¸‡ à¹à¸¥à¸°à¹„à¸Ÿà¸¥à¹Œà¹„à¸«à¸™à¹€à¸›à¹‡à¸™ derived/cache/display à¹€à¸žà¸·à¹ˆà¸­à¸›à¹‰à¸­à¸‡à¸à¸±à¸™ dashboard à¸«à¸£à¸·à¸­ bot à¸­à¹ˆà¸²à¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸œà¸´à¸”à¸Šà¸¸à¸”

## Authoritative Root Files

à¹„à¸Ÿà¸¥à¹Œ authoritative à¸•à¹‰à¸­à¸‡à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ project runtime root à¸«à¸£à¸·à¸­ `httpdocs/`:

```text
<PROJECT_ROOT>/market_snapshot.json
<PROJECT_ROOT>/latest_decision.json
```

à¹‚à¸”à¸¢ `<PROJECT_ROOT>` à¸„à¸·à¸­:

```text
server: httpdocs/
local: .../httpdocs/
```

à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¹„à¸Ÿà¸¥à¹Œà¸­à¸·à¹ˆà¸™à¸—à¸µà¹ˆà¸­à¸²à¸ˆà¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ root à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™:

```text
<PROJECT_ROOT>/klines.json
<PROJECT_ROOT>/orderbook_snapshot.json
<PROJECT_ROOT>/open_interest_snapshot.json
<PROJECT_ROOT>/news_context.json
<PROJECT_ROOT>/latest_decision_agent.json
<PROJECT_ROOT>/latest_step2.txt
```

## Canonical / Derived Runtime Files

```text
plan_status.json
plan_status_state.json
scheduler_heartbeat.json
alert summary files
paper execution logs
paper ledger files
runtime audit reports
```

## Mirror / Cache Files

```text
dashboard/app/public/data/*.json
```

à¸ªà¸–à¸²à¸™à¸°à¸‚à¸­à¸‡ mirror/cache:

```text
authoritative = false
sourceType = mirror/cache/display-only
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¹ƒà¸«à¹‰ dashboard/app/public/data/*.json à¹€à¸›à¹‡à¸™ source à¸ˆà¸£à¸´à¸‡
- à¸«à¹‰à¸²à¸¡ fallback à¹„à¸› mirror à¹à¸šà¸šà¹€à¸‡à¸µà¸¢à¸š à¹†
- à¸«à¹‰à¸²à¸¡ overwrite root runtime files à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸¡à¸µ policy
- à¸«à¹‰à¸²à¸¡à¸¥à¸š runtime/cache files à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸¡à¸µ cleanup policy
- à¸–à¹‰à¸² root file missing à¸•à¹‰à¸­à¸‡à¹à¸ªà¸”à¸‡ warning à¹à¸¥à¸° nextAction
```

## Runtime Audit Requirements

à¸—à¸¸à¸ root/derived file à¸„à¸§à¸£à¸•à¸£à¸§à¸ˆà¹„à¸”à¹‰à¸§à¹ˆà¸²:

```text
exists
readable
validJson
sizeBytes
updatedAt
ageSec
freshness
severity
code
message
nextAction
```

## Completion Target

```text
Source-of-truth completeness target: 90â€“100%
```

---

# Layer 03 â€” Market Data & Data Quality Engine

## Purpose

à¸£à¸§à¸šà¸£à¸§à¸¡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸•à¸¥à¸²à¸”à¸—à¸µà¹ˆà¸ˆà¸³à¹€à¸›à¹‡à¸™à¸•à¹ˆà¸­à¸à¸²à¸£à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹ƒà¸Šà¹‰à¹à¸„à¹ˆà¸£à¸²à¸„à¸²à¸›à¸´à¸”

## Required Data

```text
OHLCV
last price
mark price
index price
best bid
best ask
spread
order book depth
recent trades
volume
funding rate
next funding time
open interest if available
session/timezone
news/event risk
exchange/API health
```

## Data Quality Flags

```text
dataFreshness
missingFields
invalidValues
staleSnapshot
spreadStatus
liquidityStatus
fundingStatus
newsRiskStatus
```

## Data Quality Output Example

```json
{
  "ok": true,
  "source": "root",
  "freshness": "fresh",
  "missingFields": [],
  "warnings": [],
  "nextActions": []
}
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ stale market data à¹‚à¸”à¸¢à¹„à¸¡à¹ˆ flag
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ missing spread/slippage à¹€à¸›à¹‡à¸™ 0 à¹à¸šà¸šà¹€à¸‡à¸µà¸¢à¸š à¹†
- à¸«à¹‰à¸²à¸¡à¹ƒà¸«à¹‰ signal engine à¸—à¸³à¸‡à¸²à¸™à¹€à¸«à¸¡à¸·à¸­à¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸„à¸£à¸š à¸–à¹‰à¸² market data incomplete
```

## Completion Target

```text
Market data engine target: 85â€“100%
```

---

# Layer 04 â€” Indicator / Feature Engine

## Purpose

à¸„à¸³à¸™à¸§à¸“ feature à¸—à¸µà¹ˆà¹ƒà¸Šà¹‰à¸ˆà¸³à¹à¸™à¸à¸•à¸¥à¸²à¸”à¹à¸¥à¸°à¸•à¸±à¸”à¸ªà¸´à¸™ grid mode

## Required Indicators

```text
ADX
+DI / -DI
RSI
ATR
ATR%
Bollinger Band Width / BBW
MACD line
MACD signal
MACD histogram
EMA / MA slope
Volume profile or volume change
Candle range vs ATR
```

## Derived Features

```text
trendStrength
momentumBias
volatilityState
compressionState
expansionState
breakoutRisk
meanReversionProbability
```

## Example Feature Output

```json
{
  "adx": 28,
  "rsi": 61,
  "atrPct": 1.15,
  "bbwState": "expansion",
  "macdBias": "bullish",
  "trendStrength": "strong",
  "volatilityState": "normal"
}
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ indicator à¸•à¸±à¸§à¹€à¸”à¸µà¸¢à¸§à¸•à¸±à¸”à¸ªà¸´à¸™ mode
- à¸«à¹‰à¸²à¸¡ ignore volatility state à¹€à¸¡à¸·à¹ˆà¸­à¸­à¸­à¸à¹à¸šà¸š grid spacing
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰à¸„à¹ˆà¸² indicator à¸—à¸µà¹ˆ stale à¸«à¸£à¸·à¸­ missing à¹‚à¸”à¸¢à¹„à¸¡à¹ˆ warning
```

## Completion Target

```text
Indicator engine target: 85â€“100%
```

---

# Layer 05 â€” Market Regime Classification Engine

## Purpose

à¸ˆà¸³à¹à¸™à¸à¸•à¸¥à¸²à¸”à¸à¹ˆà¸­à¸™à¹€à¸¥à¸·à¸­à¸à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ à¹€à¸žà¸£à¸²à¸° grid mode à¹€à¸”à¸µà¸¢à¸§à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸—à¸¸à¸à¸ªà¸ à¸²à¸§à¸°

## Required Regimes

```text
Range
Uptrend
Downtrend
High Volatility
Low Volatility
Event Risk
No Trade
Unknown / Insufficient Data
```

## Example Rule Logic

```text
if ADX < 20 and BBW low and price inside range:
    regime = Range

if ADX >= 25 and RSI > 55 and MACD bullish:
    regime = Uptrend

if ADX >= 25 and RSI < 45 and MACD bearish:
    regime = Downtrend

if ATR% spike or BBW expansion extreme or spread high:
    regime = High Volatility

if data missing:
    regime = Unknown
```

## Regime Output

```json
{
  "regime": "uptrend",
  "confidence": 74,
  "reasons": ["ADX>=25", "RSI>55", "MACD bullish"],
  "warnings": [],
  "allowedModes": ["LONG_GRID", "PAUSE"],
  "blockedModes": ["FULL_NEUTRAL_GRID"]
}
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¹€à¸›à¸´à¸” Neutral Grid à¹€à¸•à¹‡à¸¡à¸‚à¸™à¸²à¸”à¹ƒà¸™ breakout/trend regime
- à¸«à¹‰à¸²à¸¡à¹€à¸›à¸´à¸” directional grid à¸–à¹‰à¸² regime confidence à¸•à¹ˆà¸³
- Unknown regime à¸•à¹‰à¸­à¸‡ default à¹€à¸›à¹‡à¸™ safe mode à¸«à¸£à¸·à¸­ no-trade
```

## Completion Target

```text
Regime engine target: 90â€“100%
```

---

# Layer 06 â€” SMC Hybrid Decision Engine

## Purpose

à¹ƒà¸Šà¹‰ SMC à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰ context à¹€à¸Šà¸´à¸‡ liquidity/structure à¹à¸•à¹ˆà¹„à¸¡à¹ˆà¹ƒà¸«à¹‰ SMC à¸¢à¸´à¸‡ order à¹‚à¸”à¸¢à¸•à¸£à¸‡

## SMC Components

```text
HTF Bias
Market Structure
BOS
CHOCH / MSS
Liquidity Sweep
Equal High / Equal Low
Order Block
Fair Value Gap
Premium / Discount
Displacement
Invalidation Level
Liquidity Target
```

## SMC Hybrid Principle

```text
SMC output = bias/context/confidence/invalidation
SMC output â‰  order
```

## SMC Output Example

```json
{
  "bias": "bullish",
  "confidence": 72,
  "setup": "sweep_low_choch_fvg",
  "invalidation": 99400,
  "liquidityTarget": 101200,
  "allowedMode": "LONG_GRID",
  "blockedMode": "SHORT_GRID",
  "notes": ["Asia low swept", "Bullish CHOCH confirmed"]
}
```

## Trend Market Logic

### Uptrend

```text
HTF bullish
BOS up
pullback into discount
bullish FVG/OB
liquidity sweep below
CHOCH/MSS back up
â†’ Long Grid / Buy-the-dip Grid
```

### Downtrend

```text
HTF bearish
BOS down
pullback into premium
bearish FVG/OB
liquidity sweep above
CHOCH/MSS back down
â†’ Short Grid / Sell-the-rally Grid
```

### Range

```text
No strong BOS
ADX low
price between range high/low
liquidity both sides
â†’ Neutral Grid light
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¹ƒà¸«à¹‰ SMC signal à¸¢à¸´à¸‡ order à¸•à¸£à¸‡
- à¸—à¸¸à¸ SMC setup à¸•à¹‰à¸­à¸‡à¸¡à¸µ invalidation
- à¸–à¹‰à¸² sweep à¹„à¸¡à¹ˆà¸¡à¸µ displacement/structure shift à¹ƒà¸«à¹‰ confidence à¸•à¹ˆà¸³
- à¸–à¹‰à¸² SMC à¸‚à¸±à¸”à¸à¸±à¸š regime à¹ƒà¸«à¹‰ default à¹€à¸›à¹‡à¸™ reduce/pause
```

## Completion Target

```text
SMC hybrid target: 85â€“100%
```

---

# Layer 07 â€” Grid Mode & Parameter Engine

## Purpose

à¹€à¸¥à¸·à¸­à¸ grid mode à¹à¸¥à¸° parameter à¸•à¸²à¸¡ regime, SMC, volatility, risk à¹à¸¥à¸° cost

## Grid Modes

```text
NEUTRAL_GRID
LONG_GRID
SHORT_GRID
PAUSE
REDUCE_EXPOSURE
NO_TRADE
```

## Mode Selection Example

```text
if regime = Range and ADX < 20:
    mode = NEUTRAL_GRID

if regime = Uptrend and SMC bias bullish:
    mode = LONG_GRID

if regime = Downtrend and SMC bias bearish:
    mode = SHORT_GRID

if eventRisk or volatilityExtreme:
    mode = PAUSE or REDUCE_EXPOSURE
```

## Parameter Inputs

```text
lowerBound
upperBound
gridCount
spacingPct
orderSize
leverage
marginMode
TP
SL
globalStop
reserveMargin
```

## Volatility-Based Spacing

```text
spacingPct = clamp(ATR% * multiplier, minSpacing, maxSpacing)
```

Typical concept:

```text
0.3%â€“0.7% spacing for BTCUSDT grid context, adjusted by ATR and cost model
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ static grid parameter à¸—à¸¸à¸ regime
- à¸«à¹‰à¸²à¸¡à¹€à¸›à¸´à¸” grid à¸–à¹‰à¸² spacing à¹„à¸¡à¹ˆà¸Šà¸™à¸° cost
- à¸«à¹‰à¸²à¸¡à¹€à¸žà¸´à¹ˆà¸¡ leverage à¹€à¸žà¸£à¸²à¸° signal confidence à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸”à¸µà¸¢à¸§
- à¸«à¹‰à¸²à¸¡ regrid à¸–à¸µà¹ˆà¸ˆà¸™à¸à¸¥à¸²à¸¢à¹€à¸›à¹‡à¸™ cancel/replace storm
```

## Completion Target

```text
Grid engine target: 90â€“100%
```

---

# Layer 08 â€” Cost, Risk, Expectancy & Risk-of-Ruin Engine

## Purpose

à¸•à¸±à¸”à¸ªà¸´à¸™à¸§à¹ˆà¸²à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œà¸¡à¸µ edge à¸ˆà¸£à¸´à¸‡à¸«à¸£à¸·à¸­à¹„à¸¡à¹ˆà¸«à¸¥à¸±à¸‡à¸«à¸±à¸à¸•à¹‰à¸™à¸—à¸¸à¸™à¹à¸¥à¸°à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡

## Required Cost Model

```text
maker fee
taker fee
spread cost
slippage cost
funding paid/received
latency buffer
missed fill cost
```

## Core Formula

```text
netPnL = grossPnL - fee - slippage - spreadCost - funding

expectancy = (winRate * averageWin) - (lossRate * averageLoss)

profitFactor = grossProfit / abs(grossLoss)

costToGrossProfitRatio = totalCost / grossProfit
```

## Grid Cost Gate

```text
grid_spacing_pct > total_round_trip_cost_pct * 2.5
```

If fail:

```text
NO_TRADE
WIDEN_SPACING
REDUCE_SIZE
WAIT
```

## Risk Metrics

```text
maxDrawdown
drawdownDuration
riskPerCycle
riskPerDay
riskOfRuin
R-multiple
fractionalKelly
liquidationBuffer
marginRatio
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¸ªà¸£à¸¸à¸›à¸§à¹ˆà¸² strategy à¸”à¸µà¸ˆà¸²à¸ win rate à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸”à¸µà¸¢à¸§
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ gross profit à¹€à¸›à¹‡à¸™ edge
- à¸«à¹‰à¸²à¸¡ scale up à¸–à¹‰à¸² expectancy <= 0
- à¸«à¹‰à¸²à¸¡ ignore fee/slippage/funding
- à¸«à¹‰à¸²à¸¡ live à¸–à¹‰à¸²à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ paper expectancy
```

## Completion Target

```text
Risk/expectancy engine target: 95â€“100%
```

---

# Layer 09 â€” Paper Trading / Simulation Engine

## Purpose

à¸—à¸”à¸ªà¸­à¸š decision + execution behavior à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¹ƒà¸Šà¹‰à¹€à¸‡à¸´à¸™à¸ˆà¸£à¸´à¸‡

## Paper Engine Components

```text
PaperBrokerAdapter
paperExecutionEngine
paper ledger
paper execution log
paper journal summary
paper PnL engine
paper fill simulator
paper cost model
```

## Paper Order Fields

```text
paperOrderId
signalId
symbol
side
intendedPrice
quantity
status
createdAt
source = paper
liveOrder = false
```

## Paper Fill Fields

```text
paperFillId
paperOrderId
fillPrice
fillQty
feeEstimate
slippageEstimate
createdAt
```

## Simulation Requirements

```text
limit fill / no fill
partial fill
slippage
fee
spread
funding estimate
stale signal
missed fill
mode switch delay
```

## Hard Rules

```text
- paper order à¸«à¹‰à¸²à¸¡à¹€à¸£à¸µà¸¢à¸ BingX private API
- paper order à¸«à¹‰à¸²à¸¡à¸›à¸™à¸à¸±à¸š live order ledger
- paper PnL à¸«à¹‰à¸²à¸¡à¹à¸ªà¸”à¸‡à¹€à¸›à¹‡à¸™ live PnL
- paper dashboard à¸•à¹‰à¸­à¸‡ label à¸Šà¸±à¸”à¸§à¹ˆà¸² simulation only
```

## Completion Target

```text
Paper engine target: 90â€“100%
```

---

# Layer 10 â€” Execution & Order Lifecycle Engine

## Purpose

à¸£à¸­à¸‡à¸£à¸±à¸š live execution à¹ƒà¸™à¸­à¸™à¸²à¸„à¸•à¹à¸šà¸š production-grade à¹à¸•à¹ˆà¸•à¹‰à¸­à¸‡à¸­à¸¢à¸¹à¹ˆà¸«à¸¥à¸±à¸‡ migration gate à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™

## Execution Concepts

```text
Order Intent
Exchange Order
clientOrderId
idempotency key
order ledger
fill ledger
position snapshots
cancel/replace flow
partial fill handling
stale order detection
unknown order reconciliation
rate limit policy
circuit breaker
```

## Order Lifecycle

```text
PLANNED
RISK_CHECKED
SUBMITTING
ACKNOWLEDGED
PARTIALLY_FILLED
FILLED
CANCEL_REQUESTED
CANCELLED
REPLACE_REQUESTED
REPLACED
UNKNOWN
STALE
ORPHANED
ERROR
```

## Live Guard

Before any real order:

```text
LIVE_TRADING_ENABLED = true
ENABLE_ORDER_PLACEMENT = true
manual approval = true
migration gate = pass
risk guardrail = pass
runtime audit = pass
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡ retry place order à¸«à¸¥à¸±à¸‡ timeout à¹‚à¸”à¸¢à¹„à¸¡à¹ˆ reconcile
- à¸«à¹‰à¸²à¸¡ place real order à¸ˆà¸²à¸ dashboard-only code
- à¸«à¹‰à¸²à¸¡ live execution à¸à¹ˆà¸­à¸™ paper validation + live migration gate
- à¸«à¹‰à¸²à¸¡à¹ƒà¸Šà¹‰ clientOrderId à¸‹à¹‰à¸³
```

## Completion Target

```text
Execution engine target: future phase, 95â€“100% before live
```

---

# Layer 11 â€” Monitoring, Audit & Incident Response Engine

## Purpose

à¸•à¸£à¸§à¸ˆà¸ªà¸¸à¸‚à¸ à¸²à¸žà¸£à¸°à¸šà¸šà¹à¸¥à¸°à¹€à¸•à¸·à¸­à¸™ operator à¸à¹ˆà¸­à¸™à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¸à¸¥à¸²à¸¢à¹€à¸›à¹‡à¸™à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¸¢à¸«à¸²à¸¢

## Monitoring Components

```text
/api/health
/api/runtime-audit
/api/alerts
SystemHealthBanner
SchedulerHeartbeatCard
AlertBanner
RuntimeAuditCard
PaperModeBanner
PaperTradingCard
PaperJournalPanel
```

## Audit Checks

```text
project root/httpdocs files exist
project root/httpdocs files valid JSON
project root/httpdocs files freshness
scheduler heartbeat
alert summary
paper ledger status
paper log status
mirror/cache misuse
live/order flags
```

## Incident Triggers

```text
ENV_NOT_SET
ROOT_FILE_MISSING
INVALID_JSON
STALE_DATA
MIRROR_FALLBACK_USED
PLAN_STATUS_ERROR
HEALTH_ENDPOINT_CRITICAL
BUILD_FAILED
LIVE_FLAG_ENABLED
ORDER_PLACEMENT_ENABLED
SECRET_EXPOSURE_RISK
```

## Severity

```text
ok
warning
critical
emergency
lockdown
```

## Hard Rules

```text
- alert à¸•à¹‰à¸­à¸‡à¸¡à¸µ nextAction
- critical runtime state à¸•à¹‰à¸­à¸‡ block live readiness
- dashboard à¸•à¹‰à¸­à¸‡à¹„à¸¡à¹ˆ crash à¹€à¸¡à¸·à¹ˆà¸­ data missing
- stack trace à¸«à¹‰à¸²à¸¡ expose client
```

## Completion Target

```text
Monitoring/audit target: 90â€“100%
```

---

# Layer 12 â€” Live Migration & Scaling Gate

## Purpose

à¸ªà¸£à¹‰à¸²à¸‡ gate à¸à¹ˆà¸­à¸™à¸™à¸³ paper strategy à¹„à¸›à¹€à¸‡à¸´à¸™à¸ˆà¸£à¸´à¸‡

## Migration Stages

```text
Research Freeze
Backtest Gate
Walk-Forward Gate
Paper Trading Gate
Shadow Live Gate
Small Capital Canary
Controlled Scale-Up
```

## Go / No-Go Conditions

GO_SMALL à¹„à¸”à¹‰à¹€à¸¡à¸·à¹ˆà¸­:

```text
build passed
runtime audit ok
paper expectancy positive
max drawdown under limit
paper/live safety flags correct
monitoring ready
kill switch tested
manual approval present
```

NO_GO à¸–à¹‰à¸²:

```text
expectancy <= 0
source-of-truth invalid
runtime audit critical
paper data insufficient
build fail
live/order flags unsafe
secret risk
unknown order state
```

## Hard Rules

```text
- à¸«à¹‰à¸²à¸¡à¸‚à¹‰à¸²à¸¡ paper stage
- à¸«à¹‰à¸²à¸¡ scale up à¸ˆà¸²à¸ win streak à¸ªà¸±à¹‰à¸™ à¹†
- à¸«à¹‰à¸²à¸¡ live à¸–à¹‰à¸² paper expectancy à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸šà¸§à¸
- à¸«à¹‰à¸²à¸¡ live à¸–à¹‰à¸² runtime audit à¸¢à¸±à¸‡ critical
- ERROR_LOCKDOWN à¸«à¹‰à¸²à¸¡ auto-resume
```

## Completion Target

```text
Live migration target: future phase, 100% before real capital
```

---

## 4) End-to-End Data Flow

```text
Snapshot Trigger
â†’ market_snapshot.json
â†’ STEP01 / decision engine
â†’ latest_decision.json
â†’ plan status generator
â†’ plan_status.json / plan_status_state.json
â†’ /api/plan-status
â†’ dashboard /public
â†’ paper mode / paper simulation
â†’ paper ledger / paper log
â†’ paper performance summary
â†’ runtime audit
â†’ monitoring alerts
â†’ live migration gate
```

## Trading Decision Flow

```text
Market Data
â†’ Indicator Features
â†’ Market Regime
â†’ SMC Hybrid Bias
â†’ Grid Mode Decision
â†’ Grid Parameter Design
â†’ Cost/Risk/Expectancy Gate
â†’ Paper Simulation
â†’ Paper Attribution
â†’ Migration Gate
â†’ Live Execution only if approved
```

---

## 5) Professional Trading Decision Contract

Every decision should eventually produce this structure:

```json
{
  "decisionId": "...",
  "symbol": "BTCUSDT",
  "timeframe": "1H",
  "regime": "uptrend",
  "smcBias": "bullish",
  "gridMode": "LONG_GRID",
  "confidence": 72,
  "allowedAction": "PAPER_SIMULATE",
  "blockedActions": ["LIVE_ORDER"],
  "invalidation": 99400,
  "risk": {
    "maxRiskPct": 0.5,
    "liquidationBuffer": null,
    "dailyLossLimit": 2.0
  },
  "cost": {
    "estimatedFeePct": 0.04,
    "estimatedSlippagePct": 0.03,
    "estimatedFundingPct": 0.01,
    "costPass": true
  },
  "nextActions": ["simulate paper order", "log journal", "monitor runtime audit"]
}
```

---

## 6) Required Dashboard Views at 100%

The final operator dashboard should include:

```text
1. Market Status
2. Plan Tracker
3. Source-of-Truth Status
4. System Health Banner
5. Scheduler Heartbeat
6. Runtime Audit Card
7. Alert Banner
8. Paper Mode Banner
9. Paper Trading Card
10. Paper Journal Panel
11. Paper Performance Attribution
12. Regime / Mode Performance
13. Risk & Expectancy Summary
14. Live Migration Gate Status
```

---

## 7) Required API Endpoints at 100%

```text
GET /api/health
GET /api/plan-status
GET /api/runtime-audit
GET /api/alerts
GET /api/paper-status
GET /api/paper-journal-summary
GET /api/performance-attribution
GET /api/live-readiness
```

All endpoints must:

```text
- return structured error
- avoid stack trace leakage
- avoid secret exposure
- remain backward-compatible when extended
- include warnings and nextActions where appropriate
```

---

## 8) Safety Flags

```text
BINGX_AGENT_DIR=<PROJECT_ROOT>
LIVE_TRADING_ENABLED=false
ENABLE_ORDER_PLACEMENT=false
PAPER_TRADING_ENABLED=false or controlled true
PRODUCTION_TRADING_READY=false
TRADING_SAFETY_MODE=readonly/paper
```

`BINGX_AGENT_DIR` à¸•à¹‰à¸­à¸‡à¸Šà¸µà¹‰à¹„à¸›à¸—à¸µà¹ˆ project root/httpdocs à¸—à¸µà¹ˆà¸¡à¸µà¹„à¸Ÿà¸¥à¹Œ runtime à¸ˆà¸£à¸´à¸‡ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ path à¸•à¸±à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¹à¸šà¸š hard-code

Rules:

```text
- default must be safe
- live cannot be enabled by frontend
- paper cannot become live implicitly
- order placement cannot be enabled without migration gate
```

---

## 9) Completion Score by Layer

> à¹ƒà¸«à¹‰ update à¸ˆà¸²à¸ `PROJECT_MAP.md` à¹€à¸¡à¸·à¹ˆà¸­à¸¡à¸µà¸ªà¸–à¸²à¸™à¸°à¸ˆà¸£à¸´à¸‡à¸¥à¹ˆà¸²à¸ªà¸¸à¸”

| Layer | Target | Current Approximation |
|---|---:|---:|
| Project Governance | 100% | 85â€“95% |
| Source of Truth | 100% | 80â€“90% |
| Market Data | 100% | 45â€“60% |
| Indicator Engine | 100% | 50â€“65% |
| Regime Engine | 100% | 45â€“60% |
| SMC Hybrid | 100% | 40â€“55% |
| Grid Engine | 100% | 45â€“60% |
| Risk / Expectancy | 100% | 30â€“45% |
| Paper Trading | 100% | 55â€“70% |
| Execution Lifecycle | 100% | 20â€“35% |
| Monitoring / Audit | 100% | 75â€“90% |
| Live Migration | 100% | 15â€“30% |

---

## 10) Next Build Order

Recommended sequence:

```text
Phase I â€” Runtime State Audit
Phase J â€” Paper Trading Simulation Dashboard
Phase J+ â€” Paper Performance Attribution
Phase J++ â€” Cost Validator + No Trade Decision Engine
Phase K â€” Live Migration Gate
Phase L â€” Shadow Live / Read-only Exchange Sync
Phase M â€” Small Capital Canary Preparation
```


> **Naming note (2026-05-24):** Phases I/J/J+/J++/K above are âœ… **complete**.
> Phase L (Shadow Live / Read-only Exchange Sync) is now called **Phase M-0** in PROJECT_MAP.md.
> Phase M-0 = **Planning & Documentation ONLY** â€” read-only API design, no order placement.
> Phase M (Small Capital Canary Preparation) = **not yet started**, requires manual approval + live migration gate.

Do not start live execution until:

```text
paper expectancy > 0
cost model included
runtime audit clean
monitoring clean
build passed
manual approval exists
migration gate passed
```

---

## 11) Strategic Edge Requirements

To claim the system has potential edge, it must prove:

```text
1. net expectancy positive after fee/slippage/funding
2. drawdown within risk budget
3. regime-specific edge exists
4. grid cost pass rate acceptable
5. no single mode carries all profit
6. neutral grid does not blow up during breakout
7. long grid works in verified uptrend
8. short grid works in verified downtrend
9. no-trade filter reduces bad trades
10. paper result survives at least 100â€“300 simulated cycles
```

---

## 12) Final Professional Principle

The final system should behave like this:

```text
If data is bad â†’ do not trade
If regime is unclear â†’ do not trade
If cost is too high â†’ do not trade
If risk is too high â†’ do not trade
If paper edge is unproven â†’ do not live trade
If live gate is not approved â†’ do not place real order
```

The goal is not to make the bot trade more.

The goal is to make the bot trade only when:

```text
edge > cost + risk + uncertainty
```

---

## 13) File Maintenance Rules

When updating this file:

```text
- Do not use this file for daily status only
- Put daily/current status in PROJECT_MAP.md
- Keep this file as long-term blueprint
- Update completion score only when architecture changes
- Add new layers only if system responsibility is truly new
- Do not mark live readiness without evidence
```

---

## 14) Reference Link To Add In PROJECT_MAP.md

Add this short reference in `PROJECT_MAP.md`:

```md
## Architecture Reference

Full professional trading bot blueprint:

- `PROJECT_ARCHITECTURE.md`

Agents must read this architecture file when modifying:
- strategy logic
- SMC logic
- regime classification
- grid mode/parameter logic
- risk/expectancy logic
- paper trading
- execution lifecycle
- monitoring/audit
- live migration gate
```

---

## 15) Agent / Release Ownership

> Cross-reference: see `PROJECT_MAP.md` sections 0.2, 0.3, 0.4 for full enforcement rules.

### Responsibility Matrix

| Actor | Allowed | Prohibited |
|-------|---------|------------|
| **Claude cowork** | analysis, code/docs edit, tsc/build validation, handoff block | git operations, deployment, Plesk actions, live order placement |
| **Codex** | git release (branch `main` only), build-before-push, safe-file staging, commit, push | pushing to non-main branch without operator approval, committing runtime JSON / secrets / node_modules / .next |
| **Operator / Plesk** | server pull, rebuild, restart, runtime env verification, `EXCHANGE_MANUAL_APPROVAL` | — |

### Key Rules (enforced in PROJECT_MAP.md §0.2)

- Claude must never run or suggest itself as the actor for any Git operation.
- Codex must always verify `git branch --show-current` returns `main` before staging.
- Runtime JSON (source-of-truth root files) must never be committed to Git.
- Secrets / API keys / `.env.*` must never be committed.
- `node_modules/`, `.next/`, build artifacts must never be committed.

### Phase M-0B Gate (as of 2026-05-27)

Phase M-0B (read-only Exchange API implementation) remains **BLOCKED** until all of the following are confirmed by the operator:

1. Codex build + commit + push to `main` complete
2. Operator Plesk `git pull` + `npm run build` + restart complete
3. `BINGX_AGENT_DIR` set in Plesk env
4. Endpoint checks on server pass
5. Paper fill evidence (`averageFillPrice`) confirmed
6. `EXCHANGE_MANUAL_APPROVAL=approved` set by operator

No agent may unblock Phase M-0B unilaterally. Manual operator approval is required.
