# Online / Onpc Branch Split And Deploy Size Plan

Date: 2026-06-29

Roadmap gate: D8 Snapshot Capture & Replay Evidence Repair

## 1. Current Freeze Status

The project remains frozen at the D8 Snapshot Capture & Replay Evidence Repair gate.

Current status:

- D8 Evidence Repair is paused after Phase 6K.
- Phase 6L collector dry-run is not approved.
- D8.5 remains HOLD.
- Continuation remains NOT APPROVED.
- No runtime, producer, collector, L5, L7, or local mirror work is approved.
- No paper/live activation, order path, execution path, broker/API work, or strategy behavior change is approved.

## 2. Audit Summary

The read-only size audit found that the active repo size issue is mostly working tree and deployment layout, not tracked D8 replay evidence.

Observed size drivers:

- `dashboard` is the largest working tree area, around 714 MiB.
- `.git` is around 312 MiB.
- Ignored/generated artifacts include `dashboard/node_modules`, `dashboard/.next_old`, `dashboard/.next`, root `node_modules`, and `dashboard/tmp`.
- Duplicated deployment/checkouts exist in the parent path:
  - `httpdocs`
  - `ob-gate290669`
  - `httpdocs-m0f-release`
- No local mirror data was found inside the active repo.
- The local mirror is outside the active repo at `C:/2025/ob-gate-local-mirror/httpdocs`.
- No tracked D8 JSONL, `research-packs`, or `research-runs` data was found in the active repo.

Missing or incomplete ignore coverage:

- Root `research-packs/`.
- Root `research-runs/`.
- A broad generated evidence `*.jsonl` policy needs careful planning so source fixtures and tests are not ignored accidentally.

## 3. Branch Model

Recommended branch model:

- `online` is the server/runtime/deploy branch.
- `onpc` is the local research/replay branch.
- `main` remains the protected integration branch until a separate branch policy is approved.

Recommended main policy:

- Keep `main` as the canonical source branch during the transition.
- Create `online` only after deploy include/exclude rules are documented and reviewed.
- Create `onpc` only after local research artifacts and replay tooling boundaries are documented.
- Do not allow `online` to depend on local mirror paths, local replay generated outputs, or workstation-only caches.

## 4. What Branch Split Can Fix

An `online` / `onpc` split can help with:

- Tracked working tree scope for server deploys.
- Clearer deployment include/exclude rules.
- Safer server pull behavior by keeping local research-only files away from the server branch.
- Reduced risk that replay or diagnostics-only work is pulled into a production runtime tree.
- Cleaner operational review because server deployment changes become easier to distinguish from local research changes.

## 5. What Branch Split Cannot Fix Alone

Branch split alone will not remove or shrink:

- Ignored `dashboard/node_modules`.
- Ignored `dashboard/.next_old`.
- Ignored `dashboard/.next`.
- Ignored `tmp`.
- Untracked `TradingAgentHQ`.
- Existing `.git` pack size.
- Duplicated checkout folders such as `ob-gate290669` and `httpdocs-m0f-release`.

A branch split changes what is tracked and pulled. It does not clean ignored or untracked files already sitting on disk.

## 6. Proposed Online Branch Exclusions

The `online` branch and server deployment process should exclude:

- `dashboard/node_modules`
- `dashboard/.next_old`
- `dashboard/.next`
- `dashboard/tmp`
- root `node_modules`
- root `tmp`
- `TradingAgentHQ`
- runtime `*.log` files
- `research-packs`
- `research-runs`
- local mirror data
- generated evidence JSONL
- workstation-only cache files
- local replay output packs

The `online` branch should contain only source, required static assets, deployment scripts, lockfiles, and minimal runtime configuration templates needed for server deployment.

## 7. Proposed Onpc Scope

The `onpc` branch should be the local research and evidence-work branch.

Allowed `onpc` scope:

- Research tooling.
- Replay tooling.
- Docs, plans, reports, and evidence review notes.
- Local-only diagnostics workflows.
- Local mirror orchestration helpers.
- D8 evidence repair experiments, only when explicitly approved.

Restrictions:

- No deployment to production server from `onpc`.
- No paper/live activation from `onpc`.
- No order placement, broker execution, or private exchange API work from `onpc`.
- No continuation or D8.5 unless separately approved.

## 8. Gitignore Hygiene Recommendations

Recommended `.gitignore` hygiene for a separate approved step:

- Add root `research-packs/`.
- Add root `research-runs/`.
- Consider a generated evidence JSONL rule only with documented exceptions.
- Keep test fixtures and source-controlled examples visible to Git.
- Avoid broad rules that accidentally hide source fixtures, regression samples, or test inputs.

Possible policy shape:

- Ignore generated output directories explicitly.
- Avoid global `*.jsonl` unless required.
- If global `*.jsonl` is used, add explicit allow rules for source fixtures and tests.
- Keep local mirror paths outside the repo and document that they must never be copied into the active repo.

## 9. Server Cleanup Strategy

Recommended server cleanup strategy:

- Prefer a fresh clean checkout for `online`.
- Use a single-branch clone for server deployment.
- Use a shallow clone if `.git` history size matters for server transfer or disk pressure.
- Do not rely on `git pull` to remove ignored or untracked files.
- Do not clean existing server folders without backup and explicit approval.
- Remove duplicated old deployment folders only after backup, owner confirmation, and a written rollback path.

Recommended deployment layout:

- One active server checkout.
- One backup/archive directory outside the active web root.
- No local mirror inside the server checkout.
- No research outputs inside the server checkout.
- No local replay outputs inside the server checkout.

## 10. History Purge Policy

History purge is not recommended as the first step.

Only consider history purge if:

- Clone size or push size becomes the actual blocker.
- A fresh shallow checkout is insufficient.
- Large historical blobs are confirmed as operationally harmful.
- Backup and rollback are prepared.
- Separate explicit approval is granted.

History purge must be treated as a high-risk repository maintenance operation, not as a routine deployment cleanup step.

## 11. Safe Phased Execution Plan

Phase A: docs-only plan

- Create this plan.
- Do not edit code.
- Do not create branches.
- Do not delete files.

Phase B: `.gitignore` hygiene commit

- Add explicit root ignores for `research-packs/` and `research-runs/`.
- Review generated JSONL policy carefully.
- Do not remove files in the same step.

Phase C: create `online` branch

- Create branch only after explicit approval.
- Keep it deployment-focused.
- Confirm no local mirror, research outputs, or replay outputs are tracked.

Phase D: create `onpc` branch

- Create branch only after explicit approval.
- Keep local research and replay work off production deployment paths.

Phase E: test clean `online` checkout size

- Clone or checkout `online` into a clean directory.
- Measure working tree size.
- Confirm ignored artifacts are absent.
- Confirm server-required source and static assets are present.

Phase F: server deployment migration

- Prepare backup.
- Deploy from clean `online` checkout.
- Confirm runtime paths and permissions.
- Do not migrate local mirror or research outputs.

Phase G: optional history purge

- Only if required.
- Requires separate approval, backup, and rollback.

## 12. Stop Conditions

Stop immediately if any of the following is found:

- Tracked generated data appears in the planned `online` branch.
- Server-only config risk appears.
- Any D8 runtime path is touched.
- Any producer, collector, L5, or L7 path is invoked.
- Any local mirror path appears inside the active repo.
- Any `research-packs` or `research-runs` output is staged.
- Any activation, order, execution, API, env, or config path is touched.
- Any branch creation would include unreviewed dirty files.

## Recommendation

The safest next action is a separate, explicit `.gitignore` hygiene approval followed by a clean `online` checkout size test.

Branch split can reduce server tracked working tree scope and improve deployment hygiene, but it will not by itself remove ignored caches, untracked folders, old duplicated deployment folders, or existing `.git` history size.
