# TradingAgentHQ Agent Progression Architecture

> Scope: read-only frontend architecture only. This document does not authorize backend changes, trading changes, live trading, order placement, approval changes, or M-0B unlock.

## Purpose

TradingAgentHQ can feel like a game while staying truthful and safety-first. Each cartoon character represents one AI trading subsystem. Progression turns real evidence quality, safety discipline, data completeness, and operator review status into readable missions, levels, skills, badges, and moods.

The goal is operator understanding, not trading control.

## Hard Boundaries

- Read-only UI architecture.
- Visualization only.
- No bot behavior change.
- No trading decision change.
- No risk logic change.
- No order placement.
- No approval control.
- No live trading toggle.
- No runtime JSON writes.
- No source-of-truth override.
- No M-0B unlock.
- No profit-as-XP before sufficient closed-cycle evidence and positive net expectancy.

Core rule:

```text
Agent levels are visual evidence indicators only. Agent XP does not control trading.
```

## Agent Model

```ts
type AgentProgression = {
  agentId: string;
  role: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  missions: Mission[];
  skills: Skill[];
  badges: Badge[];
  mood: "calm" | "focused" | "blocked" | "warning" | "unknown";
  status: "active" | "watching" | "data_gap" | "blocked" | "unknown";
  evidenceQuality: "strong" | "partial" | "data_gap" | "stale" | "unknown";
  safetyState: "safe" | "warning" | "blocked";
  blockedReasons: string[];
  lastUpdated: string;
};
```

Canonical agents:

| Agent | Role |
|---|---|
| Grid Bot | Order & Execution / Grid Evidence |
| Trend Bot | Momentum / Opportunity Scout |
| Risk Manager | Safety / Gatekeeper |
| News Analyst | News / Sentiment / Event Risk |
| Market Regime Analyst | Macro / Regime Detection |
| Memory / Second Brain | Journal / Evidence / Lessons |

## XP Formula

Suggested visual level formula:

```text
level = floor(sqrt(totalXp / 100)) + 1
```

This intentionally grows slowly. Levels should make evidence maturity visible without turning the UI into a trading approval system.

XP sources:

- `evidenceCompletenessXP`
- `safetyConsistencyXP`
- `dataQualityXP`
- `uptimeXP`
- `reviewXP`
- `closedCycleXP` only after real closed cycles exist

XP penalties:

- `missingEvidencePenalty`
- `falseReadinessPenalty`
- `staleDataPenalty`
- `safetyWarningPenalty`

Forbidden XP sources:

- raw profit before sufficient sample
- raw number of trades
- fake paper PnL
- live-ready claims
- approval status

## Mission Taxonomy

### Daily Safety Missions

- Keep live OFF.
- Keep orders OFF.
- Keep approval `not_approved` until all gates pass.
- No secret exposure.
- No stack trace.

### Paper Evidence Missions

- Collect paper fills with `averageFillPrice`.
- Maintain `costGate=PASS`.
- Collect first closed cycle.
- Collect 30 closed cycles.
- Compute net expectancy after fees and slippage.

### Data Quality Missions

- `hasGridSpacing=true`
- `hasModeTags=true`
- `hasRegimeTags=true`
- `hasSessionTags=true`
- `hasClosedTrades=true`
- `hasNoTradeReasons=true`

### Visual QA Missions

- `/public` visual PASS.
- `/agent-hq` visual PASS.
- No false live-ready claim.
- Mobile/tablet sanity.

### Operator Review Missions

- Independent evidence review.
- Approval only after every gate PASS.

Mission status labels:

- `DONE`
- `IN_PROGRESS`
- `DATA_GAP`
- `BLOCKED`
- `NOT_APPROVED`
- `WARNING`
- `FAIL`

## Skill Mapping

| Agent | Skills |
|---|---|
| Grid Bot | Grid Spacing Awareness; Fill Quality Tracking; Closed Cycle Pairing; Cost Gate Discipline |
| Trend Bot | Momentum Scan; Regime Confirmation; Signal Patience; False Breakout Awareness |
| Risk Manager | Kill Switch Awareness; Approval Discipline; Drawdown Guard; Safety Gate Integrity |
| News Analyst | Event Risk Detection; News Context Coverage; No-Trade Reason Logging; Sentiment Awareness |
| Market Regime Analyst | Range Detection; Trend Detection; Volatility State; Session Context |
| Memory / Second Brain | Journal Completeness; Evidence Recall; Lessons Learned; Attribution Coverage |

## Badge Examples

Badges must be evidence descriptors, not trading approval.

- `Cost Disciplined`: `costGate=PASS`; not edge.
- `Fill Evidence Online`: paper fills include `averageFillPrice`; not profitability.
- `First Closed Cycle`: at least one real closed cycle exists.
- `Sample Builder`: closed cycle sample is growing.
- `Safety Steward`: live OFF, orders OFF, approval not approved.
- `No False Ready Claim`: UI contains no live-ready, production-ready, or approved claim.
- `Fresh Data Watcher`: data freshness is inside threshold.
- `Operator Reviewed`: operator evidence review recorded.

## Data Binding Rules

Progression may map only from safe evidence:

- `/api/public-health`
- authenticated `/api/paper-performance`
- safe frontend view model
- visual QA status
- operator evidence status

Rules:

- Missing data = `DATA_GAP`.
- `closedCycles=0` cannot give Edge XP.
- `costGate=PASS` can give Cost Discipline XP, not Edge XP.
- Paper fills can give Fill Evidence XP, not Profit XP.
- Levels must not claim profitability.
- No fake PnL.
- Stale data reduces confidence and mood.
- M-0B remains blocked until all real gates pass.

## UI Placement

Future UI may place progression in:

- agent inspector: level, XP bar, skills, badges, blocked reasons
- bottom dock: mission list and evidence progress
- agent bubble: short mood/status only
- top HUD: aggregate mission status
- advanced/debug: raw safe evidence fields and mapping explanation

Do not add:

- order buttons
- approval buttons
- live toggles
- private/execution API calls
- runtime writes
- profit badges that imply edge

## Future Implementation Phases

### THQ-FE-6A — Docs and schema

- Finalize progression model.
- Define status labels and badge names.
- Confirm safe input fields.

### THQ-FE-6B — Mission widget design

- Add read-only mission widget mock.
- Show `DONE`, `IN_PROGRESS`, `DATA_GAP`, `BLOCKED`, `NOT_APPROVED`, `WARNING`, `FAIL`.

### THQ-FE-6C — Agent level badges in inspector

- Add visual-only level and badges to right inspector.
- Keep blocked reasons visible.

### THQ-FE-6D — XP/progress bar read-only binding

- Bind XP to safe evidence only.
- Ensure `closedCycles=0` blocks Edge XP.
- Ensure `costGate=PASS` is cost discipline only.

### THQ-FE-6E — Visual-only cosmetics

- Add harmless visual cosmetics or animation variants.
- Cosmetics must not unlock trading, approval, or readiness.

### THQ-FE-6F — QA and safety checklist

- Verify no false live-ready claim.
- Verify no order/approval/live controls.
- Verify no runtime JSON writes.
- Verify mobile/tablet layout.
- Verify M-0B remains blocked.

## Final Boundary

TradingAgentHQ Agent Progression is a read-only evidence visualization architecture. It may later become frontend-only UI work, but it cannot unlock M-0B, approve risk, enable live trading, enable order placement, or claim profitability.
