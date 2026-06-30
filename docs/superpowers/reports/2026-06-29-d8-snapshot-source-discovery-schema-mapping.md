# D8 Snapshot Source Discovery And Schema Mapping

## Roadmap Gate

Roadmap gate remains:

```text
D8 Snapshot Capture & Replay Evidence Repair
```

This is a docs-only discovery report. It does not implement code, run replay, generate replay output, copy local mirror JSON or JSONL into the repository, create repository `research-packs` or `research-runs`, touch D8.5, touch continuation, or alter runtime, env, config, order, execution, activation, or API paths.

## Source Inventory

| Source | Type | Read-only safe | Inspection result |
| --- | --- | --- | --- |
| `docs/superpowers/MASTER_AUTONOMOUS_BOT_ROADMAP.md` | repo doc | yes | Roadmap keeps activation/order/execution forbidden, D8.5 on HOLD, and generated replay packs out of repo. |
| `docs/superpowers/plans/2026-06-29-d8-snapshot-capture-replay-evidence-repair-plan.md` | repo doc | yes | Defines the repair bottleneck as missing point-in-time D8 snapshots and recommends point-in-time matching semantics. |
| `docs/superpowers/reports/2026-06-29-decision-review-after-l7-local-replay.md` | repo doc | yes | Confirms L7 infrastructure `PASS_WITH_LIMITATIONS`, algorithm edge `NOT PROVEN`, and trading readiness `NOT APPROVED`. |
| `docs/superpowers/reports/2026-06-29-l7-one-shot-local-replay-evidence-review.md` | repo doc | yes | Confirms `NO_D8_SNAPSHOTS = 199`, zero candidate entries/exits, zero closed cycles, and `EDGE_UNPROVEN_NO_CLOSED_CYCLES`. |
| `dashboard/lib/trend/historicalReplayPointInTime.ts` | repo code | yes | Pure helper. Accepts supplied snapshots with `evaluatedAt` plus `value`, rejects future leakage by selecting latest snapshot at or before the evaluation point, and validates the required replay point shape. |
| `dashboard/lib/trend/trendPaperJournalSchema.ts` | repo code | yes | Paper journal schema has event timestamps, paper-only safety flags, trend paper fields, and optional enrichment, but it is a trade-event journal rather than a full D8 snapshot schema. |
| `dashboard/lib/trend/trendPaperJournalWriter.ts` | repo code | yes | Can read `trend_paper_journal.jsonl` from `tmp/trend-paper`; local mirror file was not present at the inspected path. |
| `dashboard/lib/paper/paperLoopDiagnostics.ts` | repo code | yes | Builds current diagnostics and forces supplied historical replay review flags to `activationAllowed=false`, `paperActivationAllowed=false`, `liveActivationAllowed=false`, `reviewOnly=true`, `shadowOnly=true`. It is a future capture hook location, not persisted point-in-time D8 history by itself. |
| `tools/local-replay/build-d8-4-2-replay-input-pack.ts` | repo code | yes | Current L5 pack builder scans local mirror `dashboard/tmp/trend-paper` and `dashboard/tmp/execution-runner` JSONL files for rows containing D8 field names, then writes `d8_snapshots.jsonl` only in approved apply mode. |
| `tools/local-replay/run-d8-4-2-one-shot-local-replay.ts` | repo code | yes | Current L7 runner requires pack files, reads `d8_snapshots.jsonl`, treats empty D8 snapshots as a limitation, and keeps all activation flags false. It does not yet evaluate D8 snapshots. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/trend-paper/trend_paper_evidence_decisions.jsonl` | local mirror data | yes, read-only | Contains timestamped paper-only evidence-cycle rows with RR and SMC shadow snapshots. Exact D8 snapshot fields were not found in targeted scan. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/trend-paper/trend_paper_journal.jsonl` | local mirror data | yes, read-only | Not found at inspected path. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/execution-runner/paper_no_trade.jsonl` | local mirror data | yes, read-only | Contains timestamped no-trade records with grid context and activation false. Exact D8 snapshot fields were not found. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/execution-runner/regrid_candidate.jsonl` | local mirror data | yes, read-only | Contains timestamped regrid candidate rows with grid fields and `activationAllowed=false`. It is grid-only partial context, not D8 trend snapshot evidence. |
| `C:/2025/ob-gate-local-mirror/httpdocs/dashboard/tmp/execution-runner/regrid_readiness.jsonl` | local mirror data | yes, read-only | Contains timestamped regrid readiness rows with paper/live activation false. It is grid readiness evidence, not D8 trend snapshot evidence. |
| `C:/2025/ob-gate-local-mirror/httpdocs/latest_decision.json` | local mirror data | yes, read-only | Single current/latest decision object with generated time and trend hints. Insufficient for point-in-time historical D8 snapshots. |
| `C:/2025/ob-gate-local-mirror/httpdocs/market_snapshot.json` | local mirror data | yes, read-only | Current/latest market data snapshot with candle arrays. It can support candle context but not D8 diagnostic decisions by itself. |
| `C:/2025/ob-gate-local-mirror/httpdocs/research-packs/d8-4-2-replay-input/*` | generated local output outside repo | yes, read-only | Current input pack schema includes `manifest.json`, candle JSONL files, `d8_snapshots.jsonl`, inventory, and data quality report. `d8_snapshots.jsonl` is zero bytes and manifest has `d8Diagnostics: 0`. |

## Candidate Classification

| Candidate | Classification | Reason |
| --- | --- | --- |
| `historicalReplayPointInTime.ts` matching model | `APPROVED_MATCHING_MODEL` | It has the correct point-in-time selection rule: latest snapshot whose timestamp is not newer than the evaluation point. It is a matcher, not a data source. |
| Existing replay input pack destination `d8_snapshots.jsonl` | `APPROVED_MATCHING_MODEL` | It is the correct destination shape for repaired evidence, but the inspected generated pack has zero rows. |
| `paperLoopDiagnostics.ts` diagnostics construction path | `FUTURE_CAPTURE_HOOK` | It has the right live diagnostic objects in memory and enforces read-only flags, but no approved persisted point-in-time D8 snapshot source was found. |
| Local mirror `trend_paper_evidence_decisions.jsonl` | `POSSIBLE_PARTIAL_SOURCE` | It has timestamped paper-only trend evidence, RR snapshots, and shadow geometry. It lacks the exact D8 field names required by the replay point schema. |
| Local mirror `paper_no_trade.jsonl` | `POSSIBLE_PARTIAL_SOURCE` | It has timestamped no-trade and grid context, but not D8 trend diagnostic fields. |
| Local mirror `regrid_candidate.jsonl` and `regrid_readiness.jsonl` | `POSSIBLE_PARTIAL_SOURCE` | Useful for grid context and safety flags, but not sufficient for D8 trend candidate snapshots. |
| `trend_paper_journal.jsonl` | `INSUFFICIENT_SINGLE_POINT_EVIDENCE` | The expected local mirror file was absent. The schema also represents paper trade events, not every D8 evaluation point. |
| `latest_decision.json` | `INSUFFICIENT_SINGLE_POINT_EVIDENCE` | Single latest decision, not a historical point-in-time sequence; stale and future-leak risk cannot be bounded for the L7 window. |
| `market_snapshot.json` | `INSUFFICIENT_SINGLE_POINT_EVIDENCE` | Provides candle/source market context, but not D8 diagnostic decisions. |
| Local mirror `dashboard/tmp/execution-runner/execution-runner-paper_open-*.jsonl` | `FORBIDDEN_SOURCE` | It is under an execution-runner path. Read-only inspection is allowed, but implementation should not depend on execution path logs for D8 evidence repair. |
| Repository `research-packs` or `research-runs` paths | `FORBIDDEN_SOURCE` | The roadmap forbids generated replay packs/runs in repo. No repository pack/run should be created or copied. |
| Broker/order/API/env/config paths | `FORBIDDEN_SOURCE` | Explicitly outside this gate. |

## Required D8 Snapshot Field Mapping

| Required field | Current candidate support | Mapping status |
| --- | --- | --- |
| `evaluatedAt` / `timestamp` | Available in local mirror rows as `recordedAt`, `lastRunAt`, `ts`, `eventTs`, or pack candle `openTime`; `historicalReplayPointInTime.ts` requires `evaluatedAt`. | Requires schema mapping and timestamp normalization. |
| `sourceTimeframe` | Available in replay candles by file/timeframe; sometimes nested evidence has `timeframe`. | Requires explicit mapping. |
| `alignedContext` | Required by replay point shape; not found in local mirror exact-field scan. | Missing; requires future capture hook or deterministic derivation. |
| `d8_0AlignedCandidate` | Required by replay point shape; exact field not found in local mirror exact-field scan. | Missing; future capture hook likely required. |
| `rrReady` | RR information exists in `rrSnapshot`, but exact boolean `rrReady` was not found. | Requires mapping if semantics are approved; otherwise future hook. |
| `d8_2Status` | Required by replay point shape; exact field not found. | Missing; future capture hook likely required. |
| `triggerReached` | Trigger-related text exists in `latest_decision.json`; exact point-in-time boolean was not found in candidate journals. | Missing for historical sequence. |
| `d8_3Status` | Required by replay point shape; exact field not found. | Missing; future capture hook likely required. |
| `zoneTouched` | Exact field not found. Evidence geometry exists in shadow snapshots but not as canonical boolean. | Requires future hook or audited derivation. |
| `confirmationWindowActive` | Exact field not found. | Missing; future capture hook likely required. |
| `d8_4Status` | Required by replay point shape; exact field not found. | Missing; future capture hook likely required. |
| `confirmationAligned` | Exact field not found. | Missing; future capture hook likely required. |
| `promotableReviewCandidate` | Required by replay point shape; exact field not found. | Missing; future capture hook likely required. |
| `bottleneckStatus` | Required by replay point shape; exact field not found. Rejection reasons may partially inform it. | Requires schema mapping only if semantics are explicitly approved. |
| `triggerDistanceClass` | Required by replay point shape; exact field not found. RR gap/distance exists but not the same field. | Requires future hook or audited derivation. |
| `sourceSafetyValid` | Can be derived from source safety flags and path policy, but not present as exact field. | Requires explicit mapping. |
| `dataQualityValid` | Pack data quality exists; per-snapshot validity is not present. | Requires future hook or pack-time annotation. |
| `activationAllowed=false` | Present in replay pack manifest, runner outputs, regrid candidate/readiness records, and diagnostics safety logic. | Available now. |
| `paperActivationAllowed=false` | Present in pack manifest, runner outputs, regrid readiness, and diagnostics safety logic. | Available now. |
| `liveActivationAllowed=false` | Present in pack manifest, runner outputs, trend-paper evidence rows, regrid readiness, and diagnostics safety logic. | Available now. |
| `reviewOnly=true` | Present in pack manifest and runner outputs. | Available now for pack/run, needs per-snapshot annotation if rows are added. |
| `shadowOnly=true` | Present in pack manifest and runner outputs; also present in shadow evidence. | Available now for pack/run, needs per-snapshot annotation if rows are added. |

## Gap Analysis

Available now:

- Point-in-time matching semantics in `historicalReplayPointInTime.ts`.
- Replay input destination file name and pack schema including `d8_snapshots.jsonl`.
- L7 safety behavior when D8 snapshots are missing.
- Local mirror historical candles for the current input pack with no reported candle quality blockers.
- Timestamped partial trend/grid/no-trade local mirror records.
- Activation safety flags that can be kept false.

Missing now:

- Approved historical rows with the exact D8 snapshot fields.
- A persisted point-in-time D8 diagnostic producer.
- Per-snapshot `sourceTimeframe`, `sourceSafetyValid`, `dataQualityValid`, `reviewOnly`, and `shadowOnly` annotations.
- A validated mapping from existing RR/shadow/no-trade records to D8 statuses.

Fields requiring schema mapping:

- `evaluatedAt` from `recordedAt`, `lastRunAt`, `ts`, or `eventTs`.
- `sourceTimeframe` from source file/timeframe context.
- `rrReady` from RR snapshot only if threshold semantics are approved.
- `bottleneckStatus` from reject reasons only if one-to-one mapping is defined.
- `sourceSafetyValid` and `dataQualityValid` from source inventory and pack data quality.

Fields requiring future capture hook:

- `alignedContext`
- `d8_0AlignedCandidate`
- `d8_2Status`
- `triggerReached`
- `d8_3Status`
- `zoneTouched`
- `confirmationWindowActive`
- `d8_4Status`
- `confirmationAligned`
- `promotableReviewCandidate`
- `triggerDistanceClass`

Existing trend-paper journals are only partial. The inspected `trend_paper_evidence_decisions.jsonl` can help explain RR and geometry context, but it is not sufficient as a full D8 snapshot source without an audited mapper or a future capture hook. The expected `trend_paper_journal.jsonl` was not present in the local mirror path inspected.

`latestDecision` and `marketSnapshot` are insufficient. They are current/latest style inputs and cannot establish a complete historical point-in-time D8 diagnostic sequence for the L7 replay window.

## Point-In-Time Safety Assessment

Timestamp quality:

- `historicalReplayPointInTime.ts` uses parseable `evaluatedAt` strings and rejects snapshots newer than the evaluation point.
- Local mirror rows provide timestamp candidates (`recordedAt`, `lastRunAt`, `ts`, `eventTs`), but their semantics differ by file. A future implementation must normalize and document the chosen field.
- Some execution-runner rows contain empty string `timestamp` inside context while carrying numeric `ts` and `eventTs`. The numeric fields are stronger than the empty string field.

Future-leak risk:

- Low if and only if snapshots use `historicalReplayPointInTime.ts` semantics and every row has a trusted timestamp at or before the replay candle.
- High if `latest_decision.json` or `market_snapshot.json` is applied backward across historical candles.
- High if execution-runner logs are used as a shortcut because those paths are forbidden for implementation and can mix execution-cycle context.

Stale snapshot risk:

- Not determined from current evidence. The current plan names stale tolerance as required, but the inspected sources do not prove a safe `maxSnapshotAgeMs`.
- Any future implementation must count stale snapshots separately from missing snapshots.

Matching semantics:

- The existing `historicalReplayPointInTime.ts` helper is sufficient for matching once an approved D8 snapshot source exists.
- It is not sufficient by itself to prove source correctness; it only enforces latest-at-or-before selection.

Recommended `maxSnapshotAgeMs`:

```text
not determined
```

There is not enough evidence in this discovery pass to set a defensible stale tolerance. A future RED test should require the implementation to reject snapshots older than an explicitly configured tolerance, but the value should be chosen only after source cadence is verified.

## Implementation Recommendation

Smallest safe path:

1. Do not update L5 to ingest current local mirror trend-paper or execution-runner files as approved D8 snapshots yet.
2. Add a future read-only D8 snapshot capture hook at the diagnostics boundary, most likely adjacent to `paperLoopDiagnostics.ts` output or a purpose-built local-only mirror writer, so every evaluation point emits the exact D8 replay point shape plus safety flags.
3. Keep the L5 pack builder ingestion strict: it should accept only rows that already match the approved D8 snapshot schema, have a trusted `evaluatedAt`, include source inventory metadata, and preserve `activationAllowed=false`, `paperActivationAllowed=false`, `liveActivationAllowed=false`, `reviewOnly=true`, and `shadowOnly=true`.
4. Use `historicalReplayPointInTime.ts` as the matching model for future replay reconstruction.

Do not use:

- API fetching.
- Broker/order/execution paths.
- Live capture.
- Paper/live activation.
- D8.5 release.
- Continuation approval.

## Future RED Tests

- L5 rejects a D8 snapshot row missing `evaluatedAt`.
- L5 rejects a D8 snapshot row whose `evaluatedAt` is newer than the evaluation candle.
- L5 rejects stale snapshots once `maxSnapshotAgeMs` is defined.
- L5 rejects rows missing any required D8 field.
- L5 rejects rows with activation flags not set to false or review/shadow flags not set to true.
- L5 reports `missingD8Snapshots=true` when no approved source rows exist.
- L5 counts stale D8 snapshots separately from missing snapshots.
- L5 preserves source file and source line/inventory references for each D8 snapshot row.
- L7 reports `NO_D8_SNAPSHOTS` when `d8_snapshots.jsonl` is empty.
- L7 uses latest-at-or-before matching and never consumes a future D8 snapshot.
- L7 keeps `candidateEntry=false`, `candidateExit=false`, and all activation flags false until later approved behavior exists.
- A future capture hook writes exactly the required D8 snapshot shape without touching API, broker, order, execution, env, config, D8.5, or continuation paths.

## Validation Notes

Expected final validation for this discovery step:

- Only this report file should appear as a new changed file for this task.
- No code implementation should be changed.
- No replay should be rerun.
- No generated replay output should be generated or copied into the repo.
- No staging, commit, or push should occur.
- D8.5 and continuation should remain untouched.
- Activation, order, execution, API, env, and config paths should remain untouched.
