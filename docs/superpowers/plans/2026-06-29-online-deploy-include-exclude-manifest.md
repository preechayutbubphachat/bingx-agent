# Online Deployment Include / Exclude Manifest

Date: 2026-06-29

Document status: LOCAL GOVERNANCE DOCUMENT - NOT DEPLOYED BY DEFAULT

Roadmap status: D8 Snapshot Capture & Replay Evidence Repair remains frozen after Phase 6K.

## 1. Purpose

This manifest defines a path-closed proposal for a clean online/server deployment. It prevents local development, research, replay, diagnostics, generated evidence, cache, and secret material from entering a deployment.

This document does not authorize branch creation, cloning, packaging, archive creation, build, deployment, cleanup, migration, service restart, or any server action.

## 2. Confirmed Baseline And Source Eligibility

Audited tracked baseline:

- Approved commit: `e6bedfadeb13c3ba5ec6ef86f1c59de5c8e71e3b`.
- Tracked files: 560.
- Tracked content: 40,476,891 bytes, approximately 38.6 MiB.
- `.git` history is outside the working-tree estimate.

Every deploy input must satisfy all source eligibility rules:

- It is tracked at the explicitly approved commit.
- It is selected by an `INCLUDE` or satisfied `CONDITIONAL_INCLUDE` row below.
- It is not ignored, untracked, cached, runtime state, generated evidence, or local mirror content.
- It contains no secret, credential, private key, or machine-specific value.
- It is not selected merely because it exists in a local working directory.

## 3. Path-Closed Deployment Matrix

Status meanings:

- `INCLUDE`: eligible from the approved tracked commit.
- `CONDITIONAL_INCLUDE`: eligible only after its stated condition is evidenced and separately approved.
- `EXCLUDE`: never part of the deployment input under this manifest.
- `UNRESOLVED`: blocks packaging until resolved.

### Root production files

| Status | Exact path or prefix | Approval condition |
| --- | --- | --- |
| CONDITIONAL_INCLUDE | `server.cjs` | Required by an approved startup command after the `server.js` mismatch is resolved. |
| CONDITIONAL_INCLUDE | `routes/newsContext.cjs` | Required by the approved `server.cjs` import graph. |
| UNRESOLVED | `server.js` | Referenced by root `package.json` but absent from the tracked tree. No substitute is authorized automatically. |

### Root package metadata and template

| Status | Exact path | Approval condition |
| --- | --- | --- |
| CONDITIONAL_INCLUDE | `package.json` | Root Node runtime is approved and its startup command is corrected or reconciled. |
| CONDITIONAL_INCLUDE | `package-lock.json` | Root dependencies are installed for the approved root runtime. |
| CONDITIONAL_INCLUDE | `.env.example` | Confirmed non-secret template and required for user-operated environment setup. |

### Dashboard production source and assets

| Status | Exact tracked prefix | Approval condition |
| --- | --- | --- |
| INCLUDE | `dashboard/app/` | Tracked files at the approved commit only. |
| INCLUDE | `dashboard/components/` | Tracked files at the approved commit only. |
| INCLUDE | `dashboard/lib/` | Tracked files at the approved commit only. |
| INCLUDE | `dashboard/public/` | Assets referenced by the deployed runtime, from the approved commit only. |
| INCLUDE | `dashboard/types/` | Tracked files at the approved commit only. |

### Dashboard package metadata and configuration

| Status | Exact path | Approval condition |
| --- | --- | --- |
| INCLUDE | `dashboard/package.json` | Required by approved dashboard commands. |
| INCLUDE | `dashboard/package-lock.json` | Required for locked dependency installation. |
| INCLUDE | `dashboard/tsconfig.json` | Required by the dashboard build. |
| INCLUDE | `dashboard/proxy.ts` | Referenced by the deployed dashboard runtime. |
| CONDITIONAL_INCLUDE | `dashboard/next.config.js` | Only if verified as the selected Next.js configuration. |
| CONDITIONAL_INCLUDE | `dashboard/next.config.ts` | Only if verified as the selected Next.js configuration. |
| CONDITIONAL_INCLUDE | `dashboard/postcss.config.js` | Only if verified as the selected PostCSS configuration. |
| CONDITIONAL_INCLUDE | `dashboard/postcss.config.mjs` | Only if verified as the selected PostCSS configuration. |
| CONDITIONAL_INCLUDE | `dashboard/tailwind.config.js` | Required by the approved dashboard build. |
| INCLUDE | `dashboard/scripts/clean-public-build-artifacts.cjs` | Required by the tracked `prebuild` command. |
| EXCLUDE | `dashboard/eslint.config.mjs` | Lint-only configuration. |
| EXCLUDE | `dashboard/.gitignore` | Source-control metadata. |
| CONDITIONAL_INCLUDE | `dashboard/.env.local.example` | Confirmed non-secret template required for user-operated setup. |

Configuration selection is unresolved until one Next.js config and one PostCSS config are verified as authoritative. Packaging must not include both alternatives by assumption.

### Approved runtime scripts

| Status | Exact path | Approval condition |
| --- | --- | --- |
| CONDITIONAL_INCLUDE | `paper_cycle.sh` | Required by a separately approved startup or scheduler command. |
| CONDITIONAL_INCLUDE | `run_cycle.js` | Required by a separately approved startup or scheduler command. |
| CONDITIONAL_INCLUDE | `run_cycle_no_news.cmd` | Required by an approved target-platform command. |
| CONDITIONAL_INCLUDE | `run_latest_decision.cjs` | Required by a separately approved startup or scheduler command. |
| CONDITIONAL_INCLUDE | `trend_paper_cycle.sh` | Required by a separately approved startup or scheduler command. |

### Schema and migration paths

| Status | Exact path | Approval condition |
| --- | --- | --- |
| UNRESOLVED | `<no dedicated tracked migration path identified>` | Requires a separately approved procedure identifying an exact tracked path. |

Schema modules under `dashboard/lib/` follow that prefix status. This row does not authorize migration execution.

### Minimal operational documentation

| Status | Exact path or prefix | Approval condition |
| --- | --- | --- |
| CONDITIONAL_INCLUDE | `README.md` | Separately approved as operationally necessary and free of research/evidence content. |
| CONDITIONAL_INCLUDE | `dashboard/README.md` | Separately approved as operationally necessary and free of research/evidence content. |
| EXCLUDE | `docs/` | Default for all tracked documentation; exact exceptions require separate approval. |
| EXCLUDE | `docs/superpowers/plans/2026-06-29-online-deploy-include-exclude-manifest.md` | LOCAL GOVERNANCE DOCUMENT - NOT DEPLOYED BY DEFAULT. |

## 4. Exclude Paths And Patterns

These exclusions apply even when matching material exists locally:

- `dashboard/node_modules/**`
- `dashboard/.next/**`
- `dashboard/.next_old/**`
- `dashboard/tmp/**`
- `node_modules/**`
- `tmp/**`
- `TradingAgentHQ/**`
- `research-packs/**`
- `research-runs/**`
- `logs/**`
- `**/*.log`
- `C:/2025/ob-gate-local-mirror/httpdocs/**`
- `dashboard/tmp/d8-diagnostics-input/**`
- `dashboard/tmp/d8-snapshot-diagnostics/**`
- `dashboard/tmp/d8-snapshots/**`
- `dashboard/tmp/historical-packs/**`
- `tools/local-replay/**`
- `tools/local-mirror/**`
- `bingx-agent-runner/**`
- `latest_decision.tmp`
- `**/.cache/**`
- `**/.next/**`
- `**/node_modules/**`
- `**/.pnpm-store/**`
- `.vscode/**`
- `**/.vscode/**`
- `.idea/**`
- `**/*.bak`
- `**/*.bak_*`
- `**/*.tmp`
- `**/*.swp`
- `_archive/**`
- `**/quarantine/**`
- `**/*.patch`
- `**/*.orig`
- `**/*evidence*.json`
- `**/*evidence*.jsonl`
- `**/*replay*.json`
- `**/*replay*.jsonl`
- `**/*diagnostic*.json`
- `**/*diagnostic*.jsonl`
- `**/d8_snapshot*.jsonl`
- `**/d8_diagnostics*.jsonl`

The generated JSON/JSONL patterns are deployment exclusions, not source-control ignore rules. They do not alter `.gitignore`.

## 5. Deployment Model Proposal

The proposed model is a fresh disposable checkout of an approved `main` revision, using single-branch semantics and optionally a shallow clone. Dependencies would be installed after checkout, and build output would be generated on the target or in controlled CI rather than copied from a dirty local workspace.

NOT AUTHORIZED TO RUN IN THIS GATE.

Never deploy by copying the whole development directory.

## 6. Branch Decision

- No `online` branch has been created.
- No `onpc` branch has been created.
- Branch split may be reconsidered later.
- Branch split does not remove ignored or untracked caches.
- The current recommendation remains an approved `main` revision plus a reviewed path-closed packaging manifest.

## 7. Clean Checkout Experiment Proposal

A future experiment would use a disposable non-production directory, measure tracked checkout size, verify exclusions, optionally measure shallow-clone `.git` size, and stop before build or deployment.

NOT AUTHORIZED TO RUN IN THIS GATE.

## LOCAL/CODEX PREPARATION

Codex may perform only separately approved local preparation:

- Repository inspection.
- Manifest preparation.
- Package inventory.
- Dry-run validation.
- Local archive proposal after separate explicit approval.

Codex must not connect to the server, use SSH/SFTP/FTP/Plesk API, upload files, deploy, delete server files, modify server configuration, or run server commands.

## USER-OPERATED PLESK ACTION

Only the user may perform these actions on Plesk after separate explicit approval:

- Plesk login.
- Backup.
- Upload or copy.
- Document-root configuration.
- Environment configuration.
- Permissions changes.
- Server-side install, build, or start commands.
- Health verification.
- Rollback.

This document contains no credential, hostname, IP address, username, secret, or private key.

## NOT YET APPROVED

- Branch creation.
- Worktree creation.
- Clone.
- Shallow-clone experiment.
- Packaging.
- Archive creation.
- Build.
- Deploy.
- Server cleanup.
- File deletion.
- History purge.
- Migration execution.
- Service restart.

## ROLLBACK / SERVER SAFEGUARDS

- The user creates and verifies a backup before change.
- The user deploys to a new sibling directory.
- The existing deployment is not overwritten immediately.
- The user performs health verification before switching traffic.
- A clear rollback path restores the prior directory and revision.
- The prior deployment remains available until success is confirmed.
- Server-specific state and secrets come from approved secure sources, never this manifest.

## 8. Duplicate Checkout Handling

Duplicate checkouts remain inventory-only. No deletion, movement, cleanup, or consolidation is approved.

## 9. History Purge Policy

History purge is not required now. It requires separate approval and backup if later measurements prove it necessary.

## 10. Trading Roadmap Separation

- Track A: D8 PAUSED after Phase 6K.
- Phase 6L: NOT APPROVED.
- D8.5: HOLD.
- Continuation: NOT APPROVED.
- Paper/live/activation/order/API: FORBIDDEN.
- Edge: NOT PROVEN.

## 11. Stop Conditions

Stop before packaging or server action if:

- A secret, credential, private endpoint, or unsafe configuration is discovered.
- Root startup remains inconsistent.
- Dashboard configuration precedence remains unresolved.
- A required production path is uncertain.
- The include matrix is incomplete.
- Generated or mirror content is found tracked.
- Any action under NOT YET APPROVED would be required.

## 12. Recommended Next Gate

Review this path-closed proposal. Applying it requires separate explicit approval. No branch, clone, package, archive, build, deployment, cleanup, migration, restart, or server connection is authorized.
