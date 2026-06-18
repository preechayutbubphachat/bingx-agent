# D7.0-d MTF Exact Sample Accounting

## Problem

Operator observed MTF Exact Samples decreasing, for example `75/100 -> 72/100 -> 70/100`.

Root cause: the existing `exactZoneComparisonSummary.exactSamples` is produced from `readTrendEvidenceDecisionLogSummary({ windowHours: 48 })`. The summary filters the decision log to the recent 48-hour window, then `summarizeExactZoneComparison(records)` counts exact-zone snapshots in that window. When older records leave the 48-hour window, the count can decrease.

This is valid as a recent-window freshness metric, but it is not valid as cumulative review progress.

## Semantics

- `lifetimeExactSamples`: cumulative exact samples from all available retained evidence records in `trend_paper_evidence_decisions.jsonl`.
- `windowExactSamples`: exact samples inside the active decision summary window, currently 48 hours.
- `currentPriceEligibleExactSamples`: exact samples still valid for the current market price, when a future producer provides that count.

Review progress must use `lifetimeExactSamples` when it is available.

Window/current-filtered counts can decrease:

- Window samples decrease when older evidence falls out of the rolling window.
- Current-price eligible samples decrease when the market moves away from old candidate context.

## UI Rules

The Agent HQ MTF card must not label a rolling/window count as plain `Samples / 100`.

Thai operator copy:

- ตัวอย่างสะสมควรเพิ่มหรือคงที่
- ค่าที่ลดลงคือ window/current-filtered ไม่ใช่ cumulative
- ใช้ cumulative สำหรับ review progress
- ใช้ current-price eligible สำหรับสภาพตลาดตอนนี้
- ใช้ window samples เพื่อดูความสดของ pattern ล่าสุด

## Runtime Path

`/api/paper-performance` reads the trend evidence decision summary.

`readTrendEvidenceDecisionLogSummary` now exposes:

- lifetime exact samples from all available retained records
- window exact samples from the active 48-hour summary window
- current-price eligible exact samples as `null` until a dedicated producer provides it

`buildPaperLoopDiagnostics` passes this accounting into `evaluateMtfEntryCandidatePipeline`.

## Safety

This is diagnostics-only, review-only, and shadow-only.

No entry logic, trade-path code, paper activation, real-money activation, private exchange API, runtime JSON/JSONL writes, secrets, or env configuration were changed.
