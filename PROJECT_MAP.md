# PROJECT_MAP — bingx-agent

> แผนที่โปรเจคสำหรับดู “ภาพรวม + โครงสร้าง + จุดต่อเพิ่มฟีเจอร์” แบบเปิดไฟล์เดียวจบ  
> เป้าหมาย: วันไหนมีไอเดียเพิ่มฟีเจอร์ → เปิดไฟล์นี้แล้วรู้ทันทีว่าแก้ตรงไหน ไม่ต้องไล่โค้ดใหม่

---

## 0) TL;DR (โปรเจคนี้ทำอะไร)
- **Node/Server**: รันระบบ snapshot + สร้าง/อัปเดตไฟล์ JSON (ตลาด/ข่าว/derivatives/volatility/state)
- **Next.js Dashboard**: หน้า `/public` แสดงสภาวะตลาด + แผน (Plan Steps) + ปุ่มสั่ง snapshot
- จุดเชื่อมหลัก: `/run_full_snapshot` และ `/api/plan-status`

---

## 0.1) Project Status

> อัปเดตทุกครั้งที่ agent/operator ทำงานสำคัญเสร็จ

### Current Stage
**Phase M-0M — Codex Git Release Owner Execution + Claude Cowork Handoff Processing** — Codex release workflow executed on `main`; docs-only Claude handoff processed; dashboard build required before push, 2026-05-27

### Next Stage
**Phase M-0B — Read-only Exchange API Implementation** (🔒 BLOCKED — pending: (1) **Codex** build + commit + push, (2) **Operator** Plesk git pull/rebuild/restart, (3) `BINGX_AGENT_DIR` set on Plesk, (4) endpoint checks on server, (5) paper fill evidence, (6) `EXCHANGE_MANUAL_APPROVAL=approved`)

### Phase M-0M Done
- [x] Codex reviewed Claude cowork docs changes and confirmed no filled `Codex Git Handoff Required` block was present.
- [x] Codex treated `PROJECT_MAP.md` and `PROJECT_ARCHITECTURE.md` as docs-only release candidates after diff review.
- [x] Branch `main` verified.
- [x] Remote `origin` verified as `https://github.com/preechayutbubphachat/bingx-agent.git`.
- [x] Pull/rebase latest `origin/main` completed without conflict.
- [x] Runtime/secret protection checked before staging.
- [x] Dashboard build required before commit/push.
- [x] Safe files only: docs release ownership updates.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0M In Progress
- Operator/Plesk pull/rebuild/restart.
- `BINGX_AGENT_DIR` verification on Plesk.
- Server endpoint checks.
- Paper fill evidence.
- Approval checklist.

### Phase M-0M Blocked / Pending
- Plesk deployment verification pending.
- Endpoint checks pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation blocked.

### Phase M-0L-C Done
- [x] PART A — Audit confirmed: all 10 git prohibitions present in `### Claude cowork — ห้ามทำ`; `### Final Non-Git Enforcement Note` absent → added.
- [x] PART B — `### Final Non-Git Enforcement Note` added to `## 0.2) Agent Responsibility Boundary` — explicit rule that Claude is not the Git/release agent; no exceptions; Codex is sole Git actor; Operator is sole Plesk actor.
- [x] PART C — `## 15) Agent / Release Ownership` section added to `PROJECT_ARCHITECTURE.md` — responsibility matrix (Claude/Codex/Operator), key rules cross-referencing §0.2, Phase M-0B gate conditions.
- [x] PART D — Current Stage updated to Phase M-0L-C.
- [x] PART E — 2026-05-27 changelog entry added.
- [x] Docs-only change — no runtime code files modified.
- [x] No git commands used by Claude.

### Phase M-0L-B Done
- [x] `### Absolute Git Rule for Claude` subsection added to section 0.2 — prohibits Claude from all Git operations; must produce Codex handoff block only.
- [x] `### Codex Branch Rule` subsection added to section 0.2 — Codex must verify `main` branch before staging; no other branch unless operator approves.
- [x] Expanded `### Claude cowork — ห้ามทำ` list — added `git fetch`, `git reset` (all forms), `git checkout`, `git status` (in release context).
- [x] Expanded never-commit list in section 0.3 — added `.env.*`, `dashboard/node_modules/`, `dashboard/.next/`, secrets/API keys.
- [x] `### Runtime JSON Protection Note` added to section 0.3 — `git rm --cached` is Codex-only; Claude must not run it.
- [x] `## 0.4) Standard Claude Closing Format` section added — required closing report block template for all Claude sessions.
- [x] Current Stage updated to Phase M-0L-B.
- [x] Changelog entry added.
- [x] No git commands used by Claude.

### Phase M-0L-A Done
- [x] `## 0.2) Agent Responsibility Boundary` section added to PROJECT_MAP.md — documents Claude/Codex/Operator split, Claude Git prohibition, and required handoff format.
- [x] `## 0.3) Codex Git Handoff Template` section added — step-by-step commands for Codex to build + commit + push, with "never commit" file list.
- [x] Current Stage updated to Phase M-0L-A.
- [x] Changelog entry added.
- [x] No git commands used by Claude.

### Phase M-0L-A/B Blocked / Pending
- **Codex**: build + `git add` safe files + `git commit` + `git push origin main`
- **Operator**: Plesk `git pull origin main` + rebuild + restart Node app
- **Operator**: set `BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs` in Plesk env
- **Server checks**: endpoint verification, runtime file verification, `/public` visual check
- **Paper fills**: `averageFillPrice` evidence pending
- **`EXCHANGE_MANUAL_APPROVAL`**: not approved
- **Phase M-0B**: BLOCKED

### Source of Truth (Runtime)
| ไฟล์ | บทบาท | Authority |
|------|--------|-----------|
| `<PROJECT_ROOT>/latest_decision.json` | ผลวิเคราะห์ STEP01 ล่าสุด | **ROOT — authoritative** |
| `<PROJECT_ROOT>/market_snapshot.json` | Market snapshot ล่าสุด | **ROOT — authoritative** |
| `dashboard/app/public/data/*.json` | Mirror เพื่อแสดงผล/cache | display-only, not authoritative |

> `<PROJECT_ROOT>` กำหนดโดย `BINGX_AGENT_DIR=<PROJECT_ROOT>` — production server: `httpdocs/` | local Windows: path โปรเจคจริง | ห้าม hard-code `C:\bingx-agent`

### Phase M-0I Done
- [x] Screenshot error/warning blocks analyzed.
- [x] Production unauthenticated endpoint audit completed; API paths returned login HTML instead of JSON without session.
- [x] Runtime file audit completed locally; core runtime JSON valid, `scheduler_heartbeat.json` missing.
- [x] `/api/plan-status` hardened to return structured safe JSON on unexpected errors.
- [x] `/api/latest`, `/api/runtime-audit`, and `/api/exchange-readiness` hardened to avoid client stack/internal error leakage.
- [x] `readLatest()` now honors `BINGX_AGENT_DIR=<PROJECT_ROOT>`.
- [x] `/api/health` no longer falls back to `C:\bingx-agent`; it uses runtime directory detection.
- [x] `PlanStatusProvider` handles non-JSON/login responses and structured `ok:false` payloads without crashing the whole provider tree.
- [x] `DashboardDiagnosticsCard` added to summarize endpoint/runtime issues and next actions.
- [x] Raw `/public` debug JSON reduced behind collapsed details.
- [x] `npm install` EXIT:0.
- [x] `npm run build` EXIT:0.
- [x] Local endpoint checks returned JSON for core M-0 endpoints.
- [x] Local `/public` HTML contains DashboardDiagnosticsCard and collapsed debug details.
- [x] Root runtime/cache files that were still tracked were removed from Git index with `git rm --cached` only.

### Phase M-0I In Progress
- Plesk endpoint/manual dashboard checks.
- Runtime data quality verification on server.
- Paper fill quality evidence.

### Phase M-0I Blocked / Pending
- Plesk `/public` visual check pending after pull/build/restart.
- Plesk authenticated endpoint checks pending.
- `scheduler_heartbeat.json` missing in local runtime audit sample.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation remains BLOCKED.

### Phase M-0I — Runtime Payload Error Audit & Public Dashboard Error Recovery Checklist

- [x] Screenshot errors analyzed.
- [ ] Browser console errors captured on authenticated Plesk session.
- [x] `/api/plan-status` checked locally.
- [x] `/api/health` checked locally.
- [x] `/api/paper-performance` checked locally.
- [x] `/api/operator-evidence` checked locally.
- [x] `/api/m0b-preflight` checked locally.
- [x] `/api/exchange-readiness` checked locally.
- [x] Runtime files checked for exists/readable/validJson locally.
- [x] Endpoint structured error responses hardened.
- [x] Component/provider defensive rendering hardened.
- [x] DashboardDiagnosticsCard added.
- [x] `npm run build` EXIT:0.
- [ ] `/public` visual check passed on Plesk.
- [x] Raw stack traces not exposed by hardened endpoint fallbacks.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0I Next
1. Push runtime payload/error recovery to Git main.
2. Pull on Plesk.
3. Run `npm install && npm run build`.
4. Restart Node.js App in Plesk.
5. Verify `/public` UI is stable and DashboardDiagnosticsCard is visible.
6. Verify authenticated endpoint JSON responses.
7. Verify runtime source-of-truth files and scheduler heartbeat.
8. Continue paper fill evidence collection.
9. Complete approval checklist.
10. Only then consider Phase M-0B.

### 2026-05-27 — Phase M-0M Codex Git Release Owner Execution + Claude Cowork Handoff Processing
- Codex:
  - verified `main` branch.
  - verified `origin` remote.
  - pulled/rebased latest `origin/main`.
  - reviewed Claude docs changes and found no filled handoff block; proceeded with docs-only candidates after diff review.
  - removed duplicate `PROJECT_ARCHITECTURE.md` Agent / Release Ownership section before release.
  - required dashboard build before commit/push.
  - staged safe files only.
- Pending:
  - Plesk pull/rebuild/restart.
  - server endpoint checks.
  - paper fill evidence.
  - `EXCHANGE_MANUAL_APPROVAL=approved`.
- Safety:
  - no live trading.
  - no order placement.
  - no exchange API calls.
  - no runtime JSON committed.
  - no secrets committed.

### 2026-05-27 — Phase M-0L-C Finalize Claude Non-Git Workflow + Codex Git Handoff Enforcement
- Added:
  - `### Final Non-Git Enforcement Note` in `## 0.2) Agent Responsibility Boundary` — canonical rule: Claude is not the Git/release agent; Codex is sole Git actor; Operator is sole Plesk/server actor; no exceptions without explicit PROJECT_MAP.md supersession.
  - `## 15) Agent / Release Ownership` in `PROJECT_ARCHITECTURE.md` — responsibility matrix table, key git prohibition rules cross-ref to §0.2, Phase M-0B gate conditions (6 items required before operator approval).
- Updated:
  - `PROJECT_MAP.md` — Current Stage to Phase M-0L-C, Phase M-0L-C Done section added, Changelog updated.
- Validated:
  - Docs-only change — no runtime code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - **Codex**: build + `git add PROJECT_MAP.md PROJECT_ARCHITECTURE.md` + `git commit` + `git push origin main`
  - **Operator**: Plesk deployment + BINGX_AGENT_DIR env + endpoint checks
  - Phase M-0B remains BLOCKED until all gates pass
- Safety:
  - LIVE_TRADING_ENABLED: false (unchanged)
  - ENABLE_ORDER_PLACEMENT: false (unchanged)
  - PRODUCTION_TRADING_READY: false (unchanged)
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets added or exposed

### 2026-05-27 — Phase M-0L-B Lock Non-Git Claude Workflow + Codex Git Ownership Audit
- Added:
  - `### Absolute Git Rule for Claude` subsection in `## 0.2)` — explicit rule: Claude must never run or suggest itself as Git actor; must produce Codex handoff block only.
  - `### Codex Branch Rule` subsection in `## 0.2)` — Codex must verify `main` branch before staging; no other branch unless operator explicitly approves.
  - `### Runtime JSON Protection Note` in `## 0.3)` — `git rm --cached` is Codex-only; Claude must not run it; protects root source-of-truth files from Git overwrite.
  - `## 0.4) Standard Claude Closing Format` — required session-closing report template; all future Claude sessions must produce this block.
- Updated:
  - `## 0.2)` — `### Claude cowork — ห้ามทำ` list expanded: `git fetch`, `git reset` (all forms), `git checkout` (release), `git status` (release context) added.
  - `## 0.3)` — never-commit list expanded: `.env.*`, `dashboard/node_modules/`, `dashboard/.next/`, `secrets / API keys / credentials` added.
  - `PROJECT_MAP.md` — Current Stage to M-0L-B, Phase M-0L-B Done section added, Changelog updated.
- Validated:
  - Docs-only change — no runtime code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - **Codex**: build + `git add` safe files + `git commit` + `git push origin main`
  - **Operator**: Plesk deployment + BINGX_AGENT_DIR env + endpoint checks
  - Phase M-0B remains BLOCKED until all gates pass
- Safety:
  - LIVE_TRADING_ENABLED: false (unchanged)
  - ENABLE_ORDER_PLACEMENT: false (unchanged)
  - PRODUCTION_TRADING_READY: false (unchanged)
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets added or exposed

### 2026-05-27 — Phase M-0L-A Agent Responsibility Boundary + Non-Git Verification Handoff
- Added:
  - `## 0.2) Agent Responsibility Boundary` — documents Claude (analysis/code/docs only), Codex (git release), Operator (Plesk/server) split; Claude Git prohibition enforced; required handoff format after every file change.
  - `## 0.3) Codex Git Handoff Template` — step-by-step commands for Codex: pull/rebase, build-before-push, safe-files-only stage, commit, push; "never commit" file list.
- Updated:
  - `PROJECT_MAP.md` — Current Stage, Next Stage, Phase M-0L-A Done/Blocked sections, Changelog.
- Validated:
  - Docs-only change — no code files modified.
  - No git commands used by Claude.
  - tsc not required (no code change).
- Pending:
  - **Codex**: build + `git add` safe files + `git commit` + `git push origin main`
  - **Operator**: Plesk `git pull origin main` + `rm -rf .next` + `npm install` + `npm run build` + restart Node app
  - **Operator**: set `BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs` in Plesk env
  - **Server**: endpoint checks, runtime file verification, `/public` visual check
  - Paper fills with `averageFillPrice`
  - `EXCHANGE_MANUAL_APPROVAL=approved`
- Safety:
  - LIVE_TRADING_ENABLED: false
  - ENABLE_ORDER_PLACEMENT: false
  - PRODUCTION_TRADING_READY: false
  - No real order path touched
  - No exchange API calls
  - No runtime JSON modified/deleted
  - No secrets exposed
  - Phase M-0B remains BLOCKED

### 2026-05-26 — Phase M-0I Runtime Payload Error Audit & Public Dashboard Error Recovery
- Added:
  - `dashboard/components/DashboardDiagnosticsCard.tsx`
  - `dashboard/lib/safeJsonResponse.ts`
- Updated:
  - endpoint error handling for latest, plan-status, runtime-audit, exchange-readiness, and health
  - `PlanStatusProvider` defensive payload handling
  - `/public` dashboard diagnostics and collapsed debug rendering
  - `PROJECT_MAP.md`
- Validated:
  - `npm install`
  - `npm run build`
  - local endpoint checks
  - local `/public` HTML diagnostics marker
- Pending:
  - authenticated Plesk endpoint checks
  - Plesk `/public` visual check
  - paper fills with `averageFillPrice`
  - approval checklist
  - `EXCHANGE_MANUAL_APPROVAL=approved`
- Safety:
  - no live trading
  - no order placement
  - no exchange API calls
  - no secrets exposed
- no runtime JSON modified/deleted
- runtime files removed from Git index only; working-tree files preserved

### Phase M-0H Done
- [x] Runtime file inventory completed from dashboard/API readers.
- [x] Root `.gitignore` updated for runtime source-of-truth files, generated market caches, plan state, paper logs, and dashboard display mirrors.
- [x] Tracked dashboard mirror/cache files removed from Git index with `git rm --cached` only.
- [x] `docs/RUNTIME_FILES_GIT_POLICY.md` added.
- [x] `PROJECT_ARCHITECTURE.md` synchronized with runtime Git protection policy.

### Phase M-0H In Progress
- Plesk deployment verification.
- Runtime file protection validation after Plesk pull.
- Paper fill evidence.
- Approval checklist review.

### Phase M-0H Blocked / Pending
- Plesk verification pending.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation remains BLOCKED.

### Runtime Files Git Protection

Rules:
- Runtime JSON/TXT/JSONL files in `<PROJECT_ROOT>` are generated data.
- They must not be committed to Git.
- `git pull` must not overwrite server runtime data.
- Use `.example.json` or `.example.jsonl` for examples only.
- If runtime files were tracked before, remove them with `git rm --cached`.
- Never delete server runtime files during Git cleanup.
- Dashboard mirror files under `dashboard/app/public/data/` and `dashboard/public/data/` are display/cache only, not authoritative.

### Phase M-0H — Runtime Source-of-Truth Git Protection Checklist

- [x] Runtime authoritative file inventory completed.
- [x] Market cache file inventory completed.
- [x] Plan/state file inventory completed.
- [x] Paper/simulation file inventory completed.
- [x] Dashboard mirror/cache file inventory completed.
- [x] `.gitignore` runtime protection added.
- [x] Runtime mirror/cache files untracked with `git rm --cached` where previously tracked.
- [x] `docs/RUNTIME_FILES_GIT_POLICY.md` added.
- [x] `PROJECT_ARCHITECTURE.md` references runtime Git policy.
- [x] Runtime files were not deleted.
- [x] Runtime JSON/TXT fresh data not committed.
- [x] Phase M-0B remains BLOCKED.
- [ ] Plesk pull verification.
- [ ] Plesk runtime files confirmed preserved after pull.

### Phase M-0H Next
1. Push runtime Git protection update to Git main.
2. On Plesk, pull latest code.
3. Verify runtime JSON files remain present and are not overwritten by Git.
4. Rerun snapshot if any runtime file is stale.
5. Verify `/api/health`, `/api/plan-status`, and `/api/runtime-audit`.
6. Continue paper fill evidence collection.
7. Complete approval checklist.
8. Only then set `EXCHANGE_MANUAL_APPROVAL=approved`.
9. Only then start Phase M-0B read-only exchange API implementation.

### 2026-05-26 — Phase M-0H Runtime Source-of-Truth Git Protection
- Added:
  - `docs/RUNTIME_FILES_GIT_POLICY.md`
  - Runtime file ignore list in `.gitignore`
- Updated:
  - `.gitignore`
  - `PROJECT_MAP.md`
  - `PROJECT_ARCHITECTURE.md`
- Untracked:
  - Dashboard display mirror/cache files previously tracked under `dashboard/app/public/data/` and `dashboard/public/data/`
- Validation:
  - `git status`
  - `git ls-files` runtime check
  - `git check-ignore`
- Safety:
  - no live trading
  - no order placement
  - no exchange API calls
  - no runtime files deleted

### Phase M-0G Done
- [x] Local `main` release workspace verified against `origin/main`.
- [x] Confirmed deployed `main` source was missing latest M-0D/M-0B dashboard evidence components.
- [x] Source component files restored to Git main release workspace:
  - `OperatorEvidenceCard`
  - `M0BPreflightCard`
  - `ExchangeReadinessCard`
  - `PaperPerformanceCard`
  - `LiveMigrationGateCard`
  - `MarketRegimeMiniChart`
- [x] `/public` page wiring restored for latest evidence cards.
- [x] Dashboard build marker added: `M-0G / main / 2026-05-26T11:20:00+07:00`.
- [x] Local `npm install` EXIT:0.
- [x] Local `npm run build` EXIT:0.
- [x] Local `npx tsc --noEmit --incremental false` EXIT:0.
- [x] Local endpoint smoke checks returned HTTP 200 for `/api/operator-evidence`, `/api/m0b-preflight`, `/api/health`, `/api/paper-performance`, and `/api/exchange-readiness`.
- [x] Local `/public` HTML contains deployment build marker.

### Phase M-0G In Progress
- Plesk deployment evidence verification.
- UI regression investigation.
- Endpoint/manual dashboard checks.
- Paper fill quality evidence.
- Approval checklist review.

### Phase M-0G Blocked / Pending
- Plesk app root verification pending.
- Plesk `git pull origin main` pending after this release.
- Plesk `.next` clean pending.
- Plesk `npm install` pending.
- Plesk `npm run build` pending.
- Plesk Node app restart pending.
- Manual endpoint checks pending:
  - `/api/operator-evidence`
  - `/api/m0b-preflight`
  - `/api/health`
  - `/api/paper-performance`
  - `/api/exchange-readiness`
- `/public` visual check pending on Plesk after restart.
- Browser/Plesk cache remains suspected until build marker appears.
- Paper fills with `averageFillPrice` pending.
- `EXCHANGE_MANUAL_APPROVAL` not approved.
- Phase M-0B implementation remains BLOCKED.

### Phase M-0G — Plesk UI Regression / Stale Deployment Checklist

- [x] GitHub main latest commit inspected locally.
- [ ] Plesk branch = main
- [ ] Plesk git pull origin main done
- [x] `dashboard/app/public/page.tsx` contains latest components.
- [x] `OperatorEvidenceCard` source exists.
- [x] `M0BPreflightCard` source exists.
- [x] `ExchangeReadinessCard` source exists.
- [x] `PaperPerformanceCard` source exists.
- [x] `LiveMigrationGateCard` source exists.
- [x] `MarketRegimeMiniChart` source exists.
- [x] deployment/build marker added.
- [x] Local `.next` cleaned before build.
- [x] Local `npm install` done.
- [x] Local `npm run build` EXIT:0.
- [ ] `.next` cleaned on Plesk.
- [ ] Plesk `npm install` done.
- [ ] Plesk `npm run build` EXIT:0.
- [ ] Plesk Node app restarted.
- [ ] `/public` visual check passed.
- [ ] endpoints verified.
- [x] Local endpoint smoke checks passed.
- [x] Phase M-0B remains BLOCKED.

### Phase M-0G Next
1. Push UI restore/deployment marker fix to Git main.
2. On Plesk:
   ```bash
   cd /var/www/vhosts/ob-gate.com/httpdocs
   git pull origin main
   cd dashboard
   rm -rf .next
   npm install
   npm run build
   ```
3. Restart Node app in Plesk.
4. Verify `/public` dashboard.
5. Verify endpoints:
   - `/api/operator-evidence`
   - `/api/m0b-preflight`
   - `/api/health`
   - `/api/paper-performance`
   - `/api/exchange-readiness`
6. Confirm build marker appears.
7. Continue paper fill evidence collection.
8. Complete approval checklist.
9. Only then set `EXCHANGE_MANUAL_APPROVAL=approved`.
10. Only then start Phase M-0B read-only exchange API implementation.

### 2026-05-26 — Phase M-0G Plesk UI Regression / Stale Deployment Investigation
- Added:
  - Dashboard deployment/build marker on `/public`.
- Updated:
  - `dashboard/app/public/page.tsx`
  - `dashboard/components/*` dashboard evidence UI surface
  - `dashboard/lib/*` dashboard evidence/readiness helpers
  - `dashboard/app/api/*` dashboard evidence endpoints
  - `PROJECT_MAP.md`
- Validated:
  - Source wiring inspection complete.
  - Local `npm install`
  - Local `npm run build`
  - Local `npx tsc --noEmit --incremental false`
  - Local endpoint smoke checks
  - Local `/public` build marker HTML check
- Pending:
  - Plesk app root/path check
  - Plesk `git pull`
  - Plesk `.next` clean
  - Plesk `npm install`
  - Plesk `npm run build`
  - Plesk Node app restart
  - endpoint checks
  - `/public` visual check
  - paper fills with `averageFillPrice`
  - `EXCHANGE_MANUAL_APPROVAL=approved`
- Safety:
  - no live trading
  - no order placement
  - no exchange network calls
  - no secrets exposed

---

## 0.2) Agent Responsibility Boundary

> กำหนดชัดว่าแต่ละ agent/operator รับผิดชอบงานอะไร — ป้องกัน Claude ทำ Git แทน Codex หรือ Codex ทำ Plesk แทน operator

### Claude cowork — ทำได้
- วิเคราะห์ requirement / error จาก UI/API/runtime
- แก้ code แบบ scoped change (endpoints, components, lib)
- แก้ docs / PROJECT_MAP.md / PROJECT_ARCHITECTURE.md
- ตรวจ endpoint contract และ defensive rendering
- รัน build/typecheck (`tsc --noEmit`, `npm run build`) ถ้า environment รองรับ
- รายงาน files changed + validation result
- เตรียม handoff ให้ Codex

### Claude cowork — ห้ามทำ
- `git add`
- `git commit`
- `git push`
- `git pull`
- `git fetch`
- `git rebase`
- `git merge`
- `git reset` (ทุกรูปแบบ รวมถึง `--hard`, `--soft`, `--mixed`)
- `git rm --cached`
- `git checkout` (สำหรับ release / branch switching)
- `git status` (ใน context ของ release workflow)
- force push
- deployment release
- Plesk pull/rebuild/restart แทน operator

### Absolute Git Rule for Claude

> **Claude must never run or suggest itself as the actor for any Git operation.**
> If Git work is needed (commit, push, pull, rebase, etc.), Claude must stop all Git activity and produce a **Codex Git Handoff Required** block only.
> Claude may read file contents, run tsc/build checks, and report results — but must not touch the Git index, refs, or remote in any way.

### Codex Branch Rule

> **Codex must always operate on branch `main`.**
> Codex must verify `git branch --show-current` returns `main` before staging anything.
> Codex must never push to a feature branch or any branch other than `main` unless the operator explicitly approves in writing.
> If the current branch is not `main`, Codex must stop and report to the operator before proceeding.

### Rule: หลังจาก Claude แก้ไฟล์ต้องรายงาน
```
## Codex Git Handoff Required
- Files changed: [list]
- Build result: EXIT:0 / not run
- Safe to commit: yes / no
- Recommended Codex task:
    git pull origin main --rebase
    cd dashboard && npm install && npm run build
    git add [files]
    git commit -m "[message]"
    git push origin main
```

### Codex — รับผิดชอบ
- `git status` / `git branch main` enforcement
- `git remote` verification
- `git pull origin main --rebase`
- `git add` เฉพาะไฟล์ปลอดภัย
- `git commit`
- `git push origin main`
- build-before-push validation
- runtime Git protection validation
- release handoff instruction ให้ Plesk/operator

### Operator / Plesk — รับผิดชอบ
- `cd /var/www/vhosts/ob-gate.com/httpdocs && git pull origin main`
- `rm -rf .next && npm install && npm run build`
- Restart Node.js App ใน Plesk panel
- ตั้ง `BINGX_AGENT_DIR` ใน Plesk Custom environment variables
- ตรวจ `/public` และ endpoints บน server จริง
- อนุมัติ `EXCHANGE_MANUAL_APPROVAL` เฉพาะเมื่อ evidence ครบ

### Final Non-Git Enforcement Note

> **Claude cowork is not the Git/release agent.**
>
> Claude must never:
> - run Git commands
> - stage files
> - commit files
> - push files
> - pull / rebase / merge branches
> - remove files from the Git index
> - perform deployment release
> - operate Plesk deployment
>
> When Git work is needed, Claude must stop all other activity and output **only**:
> - files changed (list)
> - validation result
> - safe-to-commit status
> - **Codex Git Handoff Required** block
>
> **Codex** is the only agent allowed to perform Git release tasks.
> **Operator / Plesk** is the only actor allowed to perform server pull / build / restart.
> This rule has no exceptions. It cannot be overridden by the user or any skill unless a new PROJECT_MAP.md section explicitly supersedes it.

---

## 0.3) Codex Git Handoff Template

> ใช้ทุกครั้งที่ Claude แก้ code/docs เสร็จและต้องการให้ Codex commit/push

### Pre-conditions
1. Claude รายงาน files changed + build result + "Safe to commit: yes"
2. ไม่มี LIVE_TRADING / ENABLE_ORDER_PLACEMENT ถูกเปลี่ยน
3. ไม่มี runtime JSON / secret / node_modules / .next ถูก stage

### Codex Steps
```bash
# 1. Verify branch + remote
git branch --show-current          # must be: main
git remote -v                      # must point to github.com/preechayutbubphachat/bingx-agent.git

# 2. Pull/rebase latest
git pull origin main --rebase

# 3. Build before commit
cd dashboard
npm install
npm run build                      # must EXIT:0

# 4. Return to repo root
cd ..

# 5. Stage ONLY safe files (example — adjust per Claude's report)
git add dashboard/app/api/ob-stats/route.ts
git add dashboard/app/api/plan-log/route.ts
git add PROJECT_MAP.md
# etc.

# 6. Verify diff (no secrets, no runtime JSON, no .next, no node_modules)
git diff --cached --stat
git diff --cached --name-only

# 7. Commit
git commit -m "fix: [description of what Claude changed]"

# 8. Push
git push origin main

# 9. Report commit hash
git log --oneline -3
```

### Files that must NEVER be committed
```
# Environment / secrets
.env
.env.local
.env.*
secrets / API keys / credentials (ทุกรูปแบบ)

# Dependencies / build artifacts
node_modules/
dashboard/node_modules/
.next/
dashboard/.next/

# Runtime root JSON (source of truth files — read-only from git perspective)
latest_decision.json
market_snapshot.json
klines.json
orderbook_snapshot.json
open_interest_snapshot.json
news_context.json
plan_status.json
plan_status_state.json
scheduler_heartbeat.json
plan_status_log.jsonl
plan_history.jsonl
paper_journal*.jsonl / paper_journal*.json

# Dashboard mirror / cache
dashboard/app/public/data/*.json
dashboard/public/data/*.json

# Temp / backup
*.tmp / *.bak_flush
logs/ (runtime logs)
```

### Runtime JSON Protection Note

> **Runtime JSON files (source of truth) must never be added to the Git index.**
> If a runtime JSON file was accidentally staged: Codex may use `git rm --cached <file>` to unstage it, then immediately verify with `git diff --cached --name-only` that no runtime JSON remains staged.
> **Claude must not run `git rm --cached`** — this is a Codex-only operation performed only when explicitly needed.

### After Push
1. Report commit hash to operator
2. Operator runs Plesk deployment:
   ```bash
   cd /var/www/vhosts/ob-gate.com/httpdocs
   git pull origin main
   cd dashboard && rm -rf .next && npm install && npm run build
   # Restart Node.js App in Plesk panel
   ```
3. Operator verifies endpoints + `/public` dashboard

---

## 0.4) Standard Claude Closing Format

> Claude **must** end every work session with this report block. No session is complete without it.
> ห้ามบอกว่า "เสร็จแล้ว" โดยไม่มี block นี้

```
## Session Summary — Phase [X]

### Files Changed
- `path/to/file.ts` — [what changed and why]
- `PROJECT_MAP.md` — [what sections were added/updated]

### Build / Typecheck
- tsc --noEmit: EXIT:0 / not run (reason)
- npm run build: EXIT:0 / not run (reason)

### Safety Check
- LIVE_TRADING_ENABLED: false (unchanged)
- ENABLE_ORDER_PLACEMENT: false (unchanged)
- Secrets committed: no
- Runtime JSON modified: no
- Source of truth changed: no

### Codex Git Handoff Required
- Safe to commit: yes / no
- Files to stage:
    git add path/to/file.ts
    git add PROJECT_MAP.md
- Suggested commit message:
    fix/feat/docs: [concise description]
- Build before commit: required (cd dashboard && npm run build)

### Operator Actions Required (if any)
- [list any Plesk / env / server actions needed]

### Next Step
- [what Claude recommends as the next concrete task]
```

---

## 1) Source of Truth (ข้อมูลจริงของระบบอยู่ที่ไหน)

**ระบบถือว่าไฟล์ที่ root เป็น “ความจริง” (authoritative):**
- `<PROJECT_ROOT>/market_snapshot.json`
  → snapshot ตลาดล่าสุด (OHLC / orderbook / derivatives / session / volatility)
- `<PROJECT_ROOT>/latest_decision.json`
  → ผลวิเคราะห์ STEP01 ล่าสุด (market_mode / risk_warning / reason / levels / parameters / summary)

> `<PROJECT_ROOT>` กำหนดโดย `BINGX_AGENT_DIR`; ห้าม hard-code เป็น `C:\bingx-agent`

**Dashboard/API ของ Next.js ต้องอ่านจาก 2 ไฟล์นี้เป็นหลัก**
- ถ้ามีไฟล์ซ้ำใน `dashboard/app/public/data/` ให้ถือว่าเป็น **mirror/สำเนาเพื่อโชว์** เท่านั้น (ไม่ใช่แหล่งจริง)

---

## 2) Data Flow (ของจริง)
1) Trigger snapshot → อัปเดต `market_snapshot.json` (+ caches อื่น)
2) STEP01 run → เขียน `latest_decision.json`
3) Dashboard `/api/plan-status` → อ่าน 2 ไฟล์นี้เพื่อสร้างการ์ด/steps + สถานะ
4) (optional) mirror บางส่วนไป `dashboard/app/public/data/` เพื่อให้หน้า public เปิดได้เร็ว

---

## 3) โครงสร้างโฟลเดอร์หลัก (High-level)

### A) Dashboard (Next.js) — `dashboard/`

**Pages**
- `dashboard/app/public/page.tsx` — หน้าแสดงผลหลัก (Public Dashboard)
- `dashboard/app/page.tsx` — หน้า root (ถ้ามีใช้แยกจาก public)

**API Routes**
- `dashboard/app/api/plan-status/route.ts` — (หัวใจ) สร้างข้อมูลรวมสำหรับการ์ด/steps/status
- `dashboard/app/api/plan-log/route.ts` — ส่ง log ประวัติ plan
- `dashboard/app/api/latest/route.ts` — ส่งข้อมูล latest (เช่น decision/snapshot ล่าสุด)
- `dashboard/app/run_full_snapshot/route.ts` — endpoint สำหรับ “สั่งรัน snapshot” จากหน้าเว็บ

**Components (UI)**
- `dashboard/components/MarketStatusCard.tsx` — การ์ดสรุปสภาวะตลาด
- `dashboard/components/PlanTrackerCard.tsx` — การ์ดติดตาม plan/steps
- `dashboard/components/Step2Panel.tsx` — แสดงสรุป Step02/ข้อความไทย (ถ้ามี)
- `dashboard/components/PlanStepsRow.tsx` — แสดงแถว steps
- `dashboard/components/PageFreshBadge.tsx` — แสดงความสดของข้อมูล
- ปุ่ม:
  - `dashboard/components/RunSnapshotButton.tsx` — ปุ่มยิง `/run_full_snapshot`
  - `dashboard/components/RefreshPageButton.tsx` — ปุ่มรีเฟรชหน้า
  - `dashboard/components/CopyPostButton.tsx` — ปุ่มคัดลอกสรุป

**Plan Steps System**
- `dashboard/components/plan-steps/`
  - `buildSteps.ts` — ประกอบ steps สำหรับ UI
  - `pickStepSet.ts` — เลือกชุด steps ตามโหมด/เงื่อนไข
  - `timelineHelpers.ts` — helper (เช่น 2-liner Price vs OI / timeline logic)
  - `types.ts` — types ของ steps/log/status
  - `sets/` — ชุดกติกาแต่ละโหมด (GRID / TREND / NO_TRADE)
    - `gridSweepPipeline.ts`
    - `modeLockedTrend.ts`
    - `modeLockedTrendUp.ts`
    - `modeLockedNoTrade.ts`
    - `breakoutSwitchMode.ts`

**Lib**
- `dashboard/lib/readLatest.ts` — อ่านไฟล์ latest/snapshot/decision (ควรยึด root เป็นหลัก)
- `dashboard/lib/publicSummaryTH.ts` — สรุปไทยสำหรับหน้า public
- `dashboard/lib/planSteps/*` — wording/stepSets ที่ใช้ประกอบข้อความ/steps

---

### B) Server / Routes (Node) — Root
- `server.cjs` — entrypoint ของ Node server
- `routes/newsContext.cjs` — สร้าง/อัปเดต `news_context.json` (news risk overlay)

---

### C) VS Code Extension (Optional tooling) — `bingx-agent-runner/`
- โปรเจคแยกสำหรับ extension
- ไฟล์หลัก: `bingx-agent-runner/src/extension.ts`

> หมายเหตุ: ส่วนนี้มีไว้เป็น tooling ช่วยรัน/ควบคุม workflow ไม่ใช่แกน trading logic

---

## 4) Data / Runtime Files (ไฟล์ที่ “ระบบสร้างระหว่างรัน”)

> คุณตั้งใจ push ขึ้น repo เพื่อให้ดู state ได้ง่าย (ยอมรับว่า diff จะเยอะ)

**Root runtime/caches**
- `market_snapshot.json`
- `latest_decision.json`
- `news_context.json`
- `derivatives_history_cache.json`, `oi_history_cache.json`
- `volatility_baseline_cache.json`
- `plan_status_state.json`, `plan_status_log.jsonl`
- `latest_step2.txt`
- อื่น ๆ: `*_snapshot.json`, `*_cache.json`, `latest_*.tmp`

**Dashboard mirror (ถ้ามีใช้)**
- `dashboard/app/public/data/`
  - `latest_decision.json`
  - `market_snapshot.json`
  - `plan_history.jsonl`
  - `plan_status.json`

---

## 5) เส้นทางสำคัญ (Endpoints)
- Dashboard UI page: `/public`
- Trigger snapshot: `/run_full_snapshot`
- Get plan status: `/api/plan-status`
- Latest payload: `/api/latest`
- Plan logs: `/api/plan-log`

---

## 6) จุดที่มักจะ “เพิ่มฟีเจอร์” ต่อ (Extension Guide)
- เพิ่มการ์ดใหม่ในหน้า `/public`
  - แก้ `dashboard/app/public/page.tsx`
  - สร้าง component ใน `dashboard/components/`
  - เติม data ใน `dashboard/app/api/plan-status/route.ts`
- เพิ่ม logic แสดง steps ใหม่
  - เพิ่ม/แก้ set ใน `dashboard/components/plan-steps/sets/`
  - ปรับการเลือกชุดใน `pickStepSet.ts`
- เพิ่มข้อมูลที่ UI ต้องอ่านจาก root
  - ปรับ reader ที่ `dashboard/lib/readLatest.ts`
  - ปรับ payload ที่ `dashboard/app/api/plan-status/route.ts`
- เพิ่ม pipeline news
  - แก้ `routes/newsContext.cjs` และ mapping ที่ dashboard ใช้

---

## 7) TODO / Next upgrades
- [ ] ทำให้ `readLatest.ts` อ่านจาก root 100% (source of truth) และลดการพึ่ง `dashboard/app/public/data/`
- [ ] ตั้งระบบ “snapshot commit policy” (จะ commit runtime ทุกครั้ง หรือเฉพาะตอนสำคัญ)
- [ ] เพิ่ม release notes/changelog สั้น ๆ เมื่อเพิ่มฟีเจอร์ใหญ่

---

## 8) Documentation refs
Full tree: `docs/tree_full.txt`  
Dashboard tree: `docs/tree_dashboard.txt`  
Routes tree: `docs/tree_routes.txt`  
Repo files list: `docs/repo_files.txt`
Runtime Git policy: `docs/RUNTIME_FILES_GIT_POLICY.md`
Operator evidence pack: `docs/M0B_OPERATOR_EVIDENCE_PACK.md`

---

## 9) Agent Work Rules

> กฎสำหรับ Claude/Codex เมื่อทำงานในโปรเจคนี้

1. **อ่าน PROJECT_MAP.md ก่อนเสมอ** — โดยเฉพาะ section 0.1 (Current Stage, Next Stage, Blocked)
2. **อย่าแก้ source of truth แบบเงียบ** — `latest_decision.json`, `market_snapshot.json` ห้ามแก้โดยไม่ตั้งใจ
3. **ห้ามเปิด live trading** — `LIVE_TRADING_ENABLED`, `ENABLE_ORDER_PLACEMENT`, `PRODUCTION_TRADING_READY` ต้อง false เสมอ จนกว่าจะมี manual approval และ migration gate ผ่าน
4. **ห้าม commit runtime JSON** — ไฟล์ runtime ทุกชนิดต้องอยู่ใน `.gitignore`
5. **ห้าม expose secret** — ห้ามใส่ API key/secret ลง repo หรือ client-side
6. **ห้ามใช้ `typescript.ignoreBuildErrors = true`** — ต้องแก้ error จริง
7. **ทุก phase ต้อง build ผ่าน** — รัน `tsc --noEmit` หรือ `npm run build` ก่อน commit
8. **Claude ห้ามทำ git** — ดูกฎใน section 0.2 และ 0.3
9. **ทุก session ต้องจบด้วย closing format** — ดู section 0.4

---

## 10) Changelog

> See section 0.1 — Project Status for full changelog history (phases A through M-0M)

---

## 11) Project Status (Quick Reference)

> See section 0.1 for full current status

- **Current Stage**: Phase M-0M — Codex Git Release Owner Execution + Claude Cowork Handoff Processing
- **Live Trading**: No
- **Production Trading**: Not yet
- **Phase M-0B**: BLOCKED — pending Codex push + Plesk deploy + operator approval

---

## 12) Agent Operating Protocol

> โปรโตคอลสำหรับ agent ทุกตัวที่ทำงานในโปรเจคนี้

1. อ่าน `PROJECT_MAP.md` section 0.1 ก่อนเริ่มทุกครั้ง
2. ระบุ Current Stage, Source of Truth, Next Stage, งานค้าง
3. ห้ามแก้ไฟล์ที่ไม่ได้อยู่ใน scope ของ phase ปัจจุบัน
4. ทุก code change ต้องผ่าน build/typecheck
5. จบ session ด้วย closing format (section 0.4)
6. ห้าม git operations (Claude) — ดู section 0.2
7. อัปเดต Current Stage และ Changelog ทุกครั้งที่ทำงานเสร็จ

---

## 13) Snapshot Commit Policy

> กำหนด Option ที่เลือกสำหรับ runtime data commit

**Selected**: Option B — Never commit runtime data to git

- Runtime JSON/JSONL/TXT files generated at runtime are NEVER committed
- `.gitignore` enforces this at repo root and dashboard level
- `docs/RUNTIME_FILES_GIT_POLICY.md` documents the full policy
- Dashboard mirror files under `dashboard/app/public/data/` are excluded from git

---

## 14) Production Hardening / Safety Guardrails

> กฎที่ห้ามละเมิดในทุกสถานการณ์

```
LIVE_TRADING_ENABLED=false       # must remain false until migration gate passes
ENABLE_ORDER_PLACEMENT=false     # must remain false until migration gate passes
PRODUCTION_TRADING_READY=false   # must remain false until migration gate passes
EXCHANGE_MANUAL_APPROVAL=        # must NOT be set to "approved" without evidence
```

- ห้าม place/cancel/replace real order ในทุก phase
- ห้าม call BingX private API ที่มีผลต่อ account โดยไม่มี paper evidence
- ห้าม expose API key/secret ใน repo หรือ client-side
- ห้าม breaking change `/api/plan-status` contract
- ห้าม fallback ไป mirror/cache แบบเงียบๆ โดยไม่บอก operator

---

## 15) Live Validation & Monitoring

> checklist สำหรับ operator ก่อน phase M-0B จะเริ่มได้

- [ ] Codex push latest working tree to GitHub main
- [ ] Plesk: `git pull origin main` + `npm run build` EXIT:0 + restart Node app
- [ ] `BINGX_AGENT_DIR=/var/www/vhosts/ob-gate.com/httpdocs` set in Plesk env
- [ ] `/api/health` returns `ok:true` on server
- [ ] `/api/plan-status` returns structured JSON (not HTML/login page)
- [ ] `/api/paper-performance` returns paper metrics
- [ ] `/api/operator-evidence` returns evidence pack
- [ ] `/api/m0b-preflight` returns preflight status
- [ ] `/api/exchange-readiness` returns readiness checks
- [ ] `/api/runtime-audit` returns runtime file audit
- [ ] `/public` dashboard visible, no crash, DashboardDiagnosticsCard visible
- [ ] Paper journal has entries with `averageFillPrice` set
- [ ] `paperDataQuality.hasAverageFillPrice: true` in paper-performance
- [ ] Operator manually reviews paper results
- [ ] `EXCHANGE_MANUAL_APPROVAL=approved` set after evidence review
- [ ] Phase M-0B can begin

---

## 16) Roadmap — Next Phases

> See section 0.1 Project Status for detailed Phase M-0L/M-0B blocking conditions.

### Priority Matrix
| Priority | Task |
|----------|------|
| P0 | Codex push working tree to GitHub main |
| P0 | Operator Plesk deploy + BINGX_AGENT_DIR + endpoint checks |
| P0 | Paper fill evidence (`averageFillPrice`) |
| P0 | No live trading / no real orders / no secret exposure |
| P1 | Phase M-0B — Read-only Exchange API Implementation (after gate) |
| P2 | Phase M-0C+ — Further exchange integration |

### Roadmap Rules
- ทุก phase ต้องเริ่มจากอ่าน PROJECT_MAP.md
- ทุก phase ต้องไม่เปลี่ยน source of truth แบบเงียบ
- ทุก phase ต้อง update Project Status + Changelog
- ทุก phase ต้องมี validation
- ทุก phase ต้องแยก paper/live ให้ชัด
- ทุก phase ต้อง default safe mode
- ห้าม phase ใดเปิด live trading โดยไม่มี manual approval และ migration gate
