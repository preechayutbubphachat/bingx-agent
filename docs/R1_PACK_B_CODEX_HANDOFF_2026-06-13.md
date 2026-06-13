# R1 Safe Pack B â€” Codex Handoff Document
**Date:** 2026-06-13
**Phase:** M-0Z-6 Â· Paper-only Â· Read-only diagnostic additions
**Precondition:** R1 Safe Pack A is deployed and verified (commit `2e5f9fb6b240ae6d75c1905b3b12431930f7df52`)
**Classification:** `R1_PACK_B_HANDOFF_READY`

This document contains two independent handoffs:
- **R1F base** â€” Event Risk News Context Label (read-only warning from existing data)
- **OBS-D base** â€” Regime Transition Alert as NOT_CONFIGURED placeholder (no history store exists)

Both are **read-only observability additions only**. Neither changes trading behavior, regime detection, grid parameters, or order logic.

---

## âš ï¸ Hard Safety Constraints â€” Read Before Any Edit

```
DO NOT run git / commit / push / deploy
DO NOT modify runtime JSON / JSONL files
DO NOT touch .env / secrets / cron / paper_cycle.sh
DO NOT enable live trading, order placement, or exchange approval
DO NOT change reward_risk_min or TREND_PAPER_MIN_REWARD_RISK
DO NOT change entry/detector thresholds
DO NOT enable adaptive RR or OB/FVG execution
DO NOT enable M-0B â€” it remains BLOCKED
DO NOT change Phase 2-B state
DO NOT change grid spacing, order size, or regrid behavior
DO NOT implement OBS-03 hysteresis
R1F: read-only label ONLY â€” no new fetches, no API keys, no external news APIs
OBS-D: NOT_CONFIGURED display ONLY â€” do NOT create a new regime history cache file
OBS-D: do NOT implement hysteresis, do NOT change regime behavior or thresholds
```

---

---

# HANDOFF 1 â€” R1F Base: Event Risk News Context Label

## Data Availability Analysis (Pre-verified)

### What already exists server-side

| Finding | File | Line |
|---------|------|------|
| `readLatest()` imported | `dashboard/app/api/paper-performance/route.ts` | 36 |
| `readLatest()` called | `dashboard/app/api/paper-performance/route.ts` | 79 â€” `const latest = await readLatest().catch(() => null)` |
| `newsContext` returned by `readLatest()` | `dashboard/lib/readLatest.ts` | 317 â€” `newsContext: newsRead.ok ? newsRead.value : null` |
| `news_context.json` in ROOT_JSON_FILES | `dashboard/lib/readLatest.ts` | 31-36 |

**Conclusion:** `latest.newsContext` is available in the paper-performance route handler. It is NOT currently included in the API response. This is the only gap.

### Schema of `news_context.json` (from `routes/newsContext.cjs`)

```typescript
// SAFE fields to expose to frontend
interface NewsContextSummary {
  risk_level: "LOW" | "MED" | "HIGH" | null;  // from scoreRisk()
  has_hot_news: boolean | null;                  // important_count >= 2 OR negative_count >= 4
  macro_risk_level: "LOW" | "MED" | "HIGH" | null;  // macro.overall_risk_level
  macro_events_count: number | null;             // macro.events.length â€” count only, not content
  generated_at: string | null;                   // ISO timestamp for freshness check
  stale: boolean;                                // computed server-side: generated_at > 30 min ago
}

// DO NOT expose these fields:
// - crypto_news_headlines (full text / API data)
// - macro.events[].title (content)
// - macro.notes
// - source (internal routing detail)
// - notes (internal notes)
```

### Freshness rule
`stale = Date.now() - new Date(generated_at).getTime() > 30 * 60 * 1000`
If `generated_at` is null â†’ `stale = true`

---

## Files to Read First (in order)

1. `dashboard/app/api/paper-performance/route.ts` â€” find where `latest` is used and where the response JSON is constructed
2. `dashboard/lib/trading-agent-hq/viewModel.ts` â€” find `PaperVM` interface definition (lines ~50-90)
3. `dashboard/lib/trading-agent-hq/adapter.ts` â€” find `mapToViewModel()` signature and `mapPaper()` function
4. `dashboard/lib/trading-agent-hq/mockState.ts` â€” find `MOCK_VIEW_MODEL` and `paper:` field

---

## What to Change

### Step 1 â€” `dashboard/app/api/paper-performance/route.ts`

Find where the route constructs and returns its JSON response. Add a `newsContextSummary` field derived from `latest.newsContext`:

```typescript
// After the existing response fields, add:
newsContextSummary: latest?.newsContext
  ? {
      risk_level: latest.newsContext.risk_level ?? null,
      has_hot_news: latest.newsContext.has_hot_news ?? null,
      macro_risk_level: latest.newsContext.macro?.overall_risk_level ?? null,
      macro_events_count: Array.isArray(latest.newsContext.macro?.events)
        ? latest.newsContext.macro.events.length
        : null,
      generated_at: latest.newsContext.generated_at ?? null,
      stale: latest.newsContext.generated_at
        ? Date.now() - new Date(latest.newsContext.generated_at).getTime() > 30 * 60 * 1000
        : true,
    }
  : null,
```

**Safety check:** Do NOT include `crypto_news_headlines`, `macro.events[].title`, `macro.notes`, `notes`, or `source`.

---

### Step 2 â€” `dashboard/lib/trading-agent-hq/viewModel.ts`

Add a new ViewModel type and add it to `PaperVM`:

```typescript
// Add new type (near RegimeDiagnosticVM, around line 533):
export interface EventRiskContextVM {
  riskLevel: "LOW" | "MED" | "HIGH" | null;
  hasHotNews: boolean | null;
  macroRiskLevel: "LOW" | "MED" | "HIGH" | null;
  macroEventsCount: number | null;
  generatedAt: string | null;
  stale: boolean;
  missing: boolean; // true if newsContextSummary was null in the API response
}

// In PaperVM interface, add field (near other diagnostic fields):
eventRiskContext: EventRiskContextVM;
```

---

### Step 3 â€” `dashboard/lib/trading-agent-hq/adapter.ts`

In `mapPaper()` function, map the new field from the `paperPerformance` payload:

```typescript
// Add inside mapPaper() return object:
eventRiskContext: mapEventRiskContext(paperPerformance.newsContextSummary),

// Add new helper function:
function mapEventRiskContext(
  raw: { risk_level?: string | null; has_hot_news?: boolean | null; macro_risk_level?: string | null; macro_events_count?: number | null; generated_at?: string | null; stale?: boolean } | null | undefined
): EventRiskContextVM {
  if (!raw) {
    return {
      riskLevel: null,
      hasHotNews: null,
      macroRiskLevel: null,
      macroEventsCount: null,
      generatedAt: null,
      stale: true,
      missing: true,
    };
  }
  return {
    riskLevel: (raw.risk_level as "LOW" | "MED" | "HIGH" | null) ?? null,
    hasHotNews: raw.has_hot_news ?? null,
    macroRiskLevel: (raw.macro_risk_level as "LOW" | "MED" | "HIGH" | null) ?? null,
    macroEventsCount: raw.macro_events_count ?? null,
    generatedAt: raw.generated_at ?? null,
    stale: raw.stale ?? true,
    missing: false,
  };
}
```

---

### Step 4 â€” `dashboard/lib/trading-agent-hq/mockState.ts`

Add mock value inside `MOCK_VIEW_MODEL.paper`:

```typescript
eventRiskContext: {
  riskLevel: "LOW",
  hasHotNews: false,
  macroRiskLevel: "LOW",
  macroEventsCount: 0,
  generatedAt: new Date().toISOString(),
  stale: false,
  missing: false,
},
```

---

### Step 5 â€” UI: Add `EventRiskContextSection` to `CanonicalMarketRegimeCard.tsx`

Add a new section inside the card, **after** the vol baseline diagnostic section (around line 200):

```tsx
// UI wording rules:
// missing=true OR stale=true â†’ "News context missing/stale" in amber
// risk_level=HIGH OR macro_risk_level=HIGH â†’ "High event risk" in red
// has_hot_news=true â†’ show indicator
// All sections say: "Read-only warning â€” does not trigger trades"
// No news headlines, no external links, no raw data

function riskLevelColor(level: EventRiskContextVM["riskLevel"]) {
  if (level === "HIGH") return "bg-red-50 border-red-200 text-red-950";
  if (level === "MED") return "bg-amber-50 border-amber-200 text-amber-950";
  return "bg-[#f3eadf] border-[#dcc7aa] text-[#5b4432]";
}

// Section render:
<div className="mt-3 rounded-md border border-[#dcc7aa] bg-white/70 p-2">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div>
      <div className="text-[11px] font-black text-[#5b4432]">Event risk context</div>
      <div className="text-[10px] font-bold text-[#80644c]">
        Read-only warning â€” does not trigger trades
      </div>
    </div>
    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
      ctx.missing || ctx.stale ? "bg-amber-100 text-amber-900" :
      ctx.riskLevel === "HIGH" ? "bg-red-100 text-red-900" :
      ctx.riskLevel === "MED" ? "bg-amber-100 text-amber-900" :
      "bg-[#fff7e8] text-[#6d5745]"
    }`}>
      {ctx.missing ? "news context missing" :
       ctx.stale ? "news context stale" :
       ctx.riskLevel === "HIGH" ? "high event risk" :
       ctx.riskLevel === "MED" ? "med event risk" :
       "low event risk"}
    </span>
  </div>

  {ctx.missing || ctx.stale ? (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-black text-amber-950">
      News context missing/stale â€” monitoring only. No-trade policy must be operator-reviewed.
    </div>
  ) : (ctx.riskLevel === "HIGH" || ctx.macroRiskLevel === "HIGH") ? (
    <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-black text-red-950">
      High event risk â€” monitoring only. No-trade policy must be operator-reviewed.
    </div>
  ) : null}

  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Crypto risk" value={ctx.riskLevel ?? "no data"} />
    <Field label="Macro risk" value={ctx.macroRiskLevel ?? "no data"} />
    <Field label="Hot news" value={ctx.hasHotNews == null ? "no data" : ctx.hasHotNews ? "yes" : "no"} />
    <Field label="Macro events" value={ctx.macroEventsCount ?? "â€”"} />
  </div>
</div>
```

---

## UI Wording Final Reference

| Condition | Label | Color |
|-----------|-------|-------|
| `missing = true` | `news context missing` | Amber pill |
| `stale = true` | `news context stale` | Amber pill |
| `riskLevel = HIGH` | `high event risk` | Red pill |
| `riskLevel = MED` | `med event risk` | Amber pill |
| `riskLevel = LOW` | `low event risk` | Neutral pill |
| Any HIGH | Warning block | Red background |
| Missing/stale | Warning block | Amber background |
| All states | Footer line | `Read-only warning â€” does not trigger trades` |

---

## Test Checklist â€” R1F

```
[ ] TypeScript compiles without errors (tsc --noEmit)
[ ] /agent-hq loads without runtime errors in browser console
[ ] CanonicalMarketRegimeCard shows "Event risk context" section
[ ] news context missing â†’ amber pill "news context missing" + amber warning block
[ ] news context stale (generated_at > 30 min ago) â†’ amber pill "news context stale"
[ ] riskLevel=LOW â†’ neutral pill, no warning block
[ ] riskLevel=MED â†’ amber pill
[ ] riskLevel=HIGH â†’ red pill + red warning block with "High event risk" text
[ ] Warning block contains "Read-only warning â€” does not trigger trades"
[ ] No headlines, no source names, no raw API data visible in UI
[ ] No new fetch calls added to browser-side code
[ ] Safety pills (à¹€à¸‡à¸´à¸™à¸ˆà¸£à¸´à¸‡/à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¸ˆà¸£à¸´à¸‡/M-0B) unchanged
[ ] No activation or approval buttons introduced
[ ] mockState.ts compiles with new eventRiskContext field
```

---

## Safety Grep â€” Run Before PR

```bash
# Must find 0 results for all of these:
grep -r "headline" dashboard/components/trading-agent-hq/
grep -r "api_key\|apiKey\|API_KEY" dashboard/lib/trading-agent-hq/
grep -r "fetch.*news\|axios.*news" dashboard/
grep -r "liveTradingEnabled.*true\|orderPlacementEnabled.*true" dashboard/
grep -r "exchangeManualApproval.*approved" dashboard/lib/trading-agent-hq/mockState.ts
grep -r "M-0B_BLOCKED.*false\|phase.*M-0B(?!_BLOCKED)" dashboard/lib/trading-agent-hq/
```

---

## Commit Message â€” R1F

```
feat(agent-hq): add event risk news context label (R1F base)

Read-only warning label in CanonicalMarketRegimeCard showing
news context risk level (LOW/MED/HIGH), hot news flag,
macro risk level, and staleness status.

Data source: news_context.json already read by readLatest().
No new fetches, no API keys, no headlines exposed.
Does not change trading behavior, regime detection, or grid params.
M-0B remains BLOCKED.
```

---

---

# HANDOFF 2 â€” OBS-D Base: Regime Transition Alert (NOT_CONFIGURED)

## Data Availability Analysis (Pre-verified)

### What was searched

| Search | Result |
|--------|--------|
| `regimeTransition` in all `.ts` / `.cjs` / `.json` | **Not found** |
| `regime_history` in all files | **Not found** |
| `previousRegime` in all files | **Not found** |
| `lastRegime` in all files | **Not found** |
| `regime_history_cache.json` | **Does not exist** |
| `plan_status_log.jsonl` for regime history | Contains plan log, not regime transition history |
| `latest_decision.json` | Current decision only â€” no history |
| `market_snapshot.json` | Current snapshot only â€” no history |

**Conclusion:** No regime history store exists anywhere in the codebase. There is no database, no JSON cache, no JSONL log, and no in-memory structure tracking regime transitions. The only safe implementation is a `NOT_CONFIGURED` placeholder. No history data should be created.

---

## Files to Read First (in order)

1. `dashboard/lib/trading-agent-hq/viewModel.ts` â€” find `PaperVM` interface
2. `dashboard/lib/trading-agent-hq/adapter.ts` â€” find `mapPaper()` function
3. `dashboard/lib/trading-agent-hq/mockState.ts` â€” find `MOCK_VIEW_MODEL.paper` structure
4. `dashboard/components/trading-agent-hq/CanonicalMarketRegimeCard.tsx` â€” find where to insert the new section

---

## What to Change

### Step 1 â€” `dashboard/lib/trading-agent-hq/viewModel.ts`

Add a new type and field:

```typescript
// Add new type (near EventRiskContextVM or RegimeDiagnosticVM):
export interface RegimeTransitionAlertVM {
  status: "NOT_CONFIGURED";
  message: string;
  hysteresisActive: false;
  designNote: string;
}

// In PaperVM, add field:
regimeTransitionAlert: RegimeTransitionAlertVM;
```

---

### Step 2 â€” `dashboard/lib/trading-agent-hq/adapter.ts`

In `mapPaper()` return object, add:

```typescript
regimeTransitionAlert: {
  status: "NOT_CONFIGURED" as const,
  message: "Regime transition history is not configured",
  hysteresisActive: false as const,
  designNote: "Design-only; no regime behavior change",
},
```

No conditional logic needed. Always returns NOT_CONFIGURED. No data source is read.

---

### Step 3 â€” `dashboard/lib/trading-agent-hq/mockState.ts`

Add inside `MOCK_VIEW_MODEL.paper`:

```typescript
regimeTransitionAlert: {
  status: "NOT_CONFIGURED" as const,
  message: "Regime transition history is not configured",
  hysteresisActive: false as const,
  designNote: "Design-only; no regime behavior change",
},
```

---

### Step 4 â€” UI: Add `RegimeTransitionAlertSection` to `CanonicalMarketRegimeCard.tsx`

Add a compact section inside the card **after** the regime mismatch diagnostic section (around line 177):

```tsx
// Render the NOT_CONFIGURED section:
<div className="mt-3 rounded-md border border-[#e4cba8] bg-white/60 p-2">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div>
      <div className="text-[11px] font-black text-[#5b4432]">Regime Transition Alert</div>
      <div className="text-[10px] font-bold text-[#80644c]">
        Design-only; no regime behavior change
      </div>
    </div>
    <span className="rounded-full bg-[#fff7e8] px-2 py-1 text-[10px] font-black text-[#6d5745]">
      not configured
    </span>
  </div>
  <div className="mt-2 rounded-md border border-[#dcc7aa] bg-[#fffaf0] px-2 py-1.5 text-[11px] font-black text-[#5b4432]">
    {paper.regimeTransitionAlert.message} Â· No hysteresis behavior is active Â· {paper.regimeTransitionAlert.designNote}
  </div>
</div>
```

---

## UI Wording Final Reference

| Field | Value |
|-------|-------|
| Section heading | `Regime Transition Alert` |
| Section subtitle | `Design-only; no regime behavior change` |
| Status badge | `not configured` (neutral/cream pill) |
| Body line | `Regime transition history is not configured Â· No hysteresis behavior is active Â· Design-only; no regime behavior change` |

No data is fetched. No dropdown, no table, no history log. Just a static informational section.

---

## Test Checklist â€” OBS-D

```
[ ] TypeScript compiles without errors (tsc --noEmit)
[ ] /agent-hq loads without runtime errors
[ ] CanonicalMarketRegimeCard shows "Regime Transition Alert" section
[ ] Status badge shows "not configured"
[ ] Body line includes "Regime transition history is not configured"
[ ] Body line includes "No hysteresis behavior is active"
[ ] Body line includes "Design-only; no regime behavior change"
[ ] No new JSON file created anywhere (grep for "regime_history" in new files)
[ ] No new fetch / readRuntimeJson call for regime history
[ ] No hysteresis logic added anywhere
[ ] Regime detection thresholds unchanged
[ ] Safety pills (à¹€à¸‡à¸´à¸™à¸ˆà¸£à¸´à¸‡/à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¸ˆà¸£à¸´à¸‡/M-0B) unchanged
[ ] mockState.ts compiles with new regimeTransitionAlert field
```

---

## Safety Grep â€” Run Before PR

```bash
# Must find 0 results:
grep -r "regime_history\|regimeHistory\|previousRegime\|lastRegime" dashboard/
grep -r "hysteresis\|HYSTERESIS" dashboard/
grep -r "writeFile.*regime\|appendFile.*regime" .
grep -r "liveTradingEnabled.*true\|orderPlacementEnabled.*true" dashboard/
```

---

## Commit Message â€” OBS-D

```
feat(agent-hq): add regime transition alert placeholder (OBS-D base)

Read-only NOT_CONFIGURED display in CanonicalMarketRegimeCard.
Shows "Regime transition history is not configured" with
"No hysteresis behavior is active" and "Design-only" note.

No regime history cache created. No hysteresis logic added.
No regime detection thresholds changed. M-0B remains BLOCKED.
```

---

---

# Implementation Order

```
1. R1F and OBS-D can be implemented in the same PR or separate PRs.
   Recommended: same PR since both touch the same files.

2. Order within PR:
   a. viewModel.ts â€” add both new types + fields to PaperVM
   b. adapter.ts â€” add both mappers
   c. mockState.ts â€” add both mock values
   d. paper-performance/route.ts â€” add newsContextSummary to response
   e. CanonicalMarketRegimeCard.tsx â€” add both new sections
   f. tsc --noEmit â†’ must be 0 errors
   g. Visual check on /agent-hq

3. Do NOT run git commit until operator visually confirms /agent-hq renders correctly.
```

---

# Final Classification

| Item | Status | Safety |
|------|--------|--------|
| R1F â€” Event Risk News Context Label | `SAFE_TO_CODEX_NOW` | Read-only, existing data, no API keys, no headlines |
| OBS-D â€” Regime Transition Alert | `SAFE_TO_CODEX_NOW` | Static NOT_CONFIGURED, no new files, no new data |
| M-0B | `BLOCKED` â€” unchanged | |
| Phase 2-B | `BLOCKED` â€” unchanged | |
| Live trading | `OFF` â€” unchanged | |
| Order placement | `OFF` â€” unchanged | |

---

*Handoff prepared: 2026-06-13*
*Verification prerequisite: R1 Safe Pack A checklist PASSED*
*Do not implement before Pack A is verified*
