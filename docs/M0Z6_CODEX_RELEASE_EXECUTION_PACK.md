# M-0Z-6 — Codex Release Execution Pack (Claude-prepared, Codex-to-run)

> ผู้จัดทำ: Claude cowork (เตรียมงานแทน Codex แบบ offline — **Claude ไม่รัน Git เอง**)
> วันที่: 2026-05-29 · ประเภท: **OFFLINE PREP** — คำสั่งให้ Codex/เจ้าของรัน
> สถานะปลายทาง: **Phase M-0B BLOCKED** (ไม่เปลี่ยน — ชุดนี้แค่เตรียม release ของ Fix 1+2 + docs)

---

## 0) ขอบเขต / ใครรันอะไร

- **Claude ทำให้แล้ว (offline):** pre-flight safety check, แก้ `.env.example` (เติม paper keys), ร่างคำสั่ง git, commit message, report template
- **Codex ต้องรันเอง (ผมทำแทนไม่ได้):** ทุกคำสั่ง `git` + push — เพราะเป็น hard rule (Claude ห้ามรัน Git/deploy)
- **Operator:** ดู Owner Execution Packet `docs/M0Z6_OWNER_EXECUTION_PACKET.md` §6 สำหรับ deploy ต่อ

---

## 1) Pre-flight Safety Check — ✅ ผ่าน (ตรวจจากไฟล์จริง read-only)

| รายการ | ผล | หลักฐาน |
|--------|-----|---------|
| ไฟล์ code ที่จะ release มีจริง | ✅ | `readPaperJournal.ts`, `paperPerformance.ts` พบ |
| ไฟล์ docs ที่จะ release มีจริง | ✅ | PROJECT_CONTEXT/MAP, docs/M0Z6* พบครบ |
| `.gitignore` ignore runtime JSON | ✅ | market_snapshot/latest_decision/plan_status_state/paper_pnl.jsonl อยู่ใน `.gitignore` |
| `.gitignore` ignore `.env` + secrets | ✅ | `.env`, `.env.*` ignore + `!.env.example` เปิดให้ stage |
| `.gitignore` ignore node_modules/.next | ✅ | บรรทัด 52–55 |
| `.env.example` แก้แล้ว (เติม paper keys) | ✅ | เพิ่ม `PAPER_TRADING_ENABLED`, `EXECUTION_AUDIT_ROOT_DIR` (placeholder, ไม่มี secret) |
| ไฟล์ต้องห้าม stage มีในเครื่องแต่ถูก ignore | ✅ ปลอดภัย | `.env`, `latest_decision.json`, `market_snapshot.json`, `plan_status_state.json` มี แต่ `.gitignore` กันไว้ |

**สรุป:** `git add` ตาม allowlist ด้านล่างจะไม่ลากไฟล์ต้องห้ามเข้า แม้พิมพ์พลาดก็ยังมี `.gitignore` เป็นด่านสอง

---

## 2) Staged-file Allowlist (ยืนยันแล้ว) / Denylist

**✅ ALLOW (stage เฉพาะนี้):**
```
dashboard/lib/readPaperJournal.ts
dashboard/lib/paperPerformance.ts
.env.example
PROJECT_CONTEXT.md
PROJECT_MAP.md
docs/SERVER_EVIDENCE_LEDGER.md
docs/M0Z6_CONTROL_INDEX.md
docs/M0Z6G_OFFLINE_ACCEPTANCE_PACK.md
docs/M0Z6H_CONTROL_PACK_CONSOLIDATION.md
docs/M0Z6I_MANUAL_EVIDENCE_PACK.md
docs/M0Z6J_CONTROL_FREEZE.md
docs/M0Z6_PROJECT_OWNER_CONTROL_MANUAL.md
docs/M0Z6_OWNER_EXECUTION_PACKET.md
docs/M0Z6_CODEX_RELEASE_EXECUTION_PACK.md
```

**⛔ DENY (ห้าม stage เด็ดขาด):** `.env` · `latest_decision.json` · `market_snapshot.json` · runtime `*.json`/`*.jsonl`/`*.txt` · `paper_pnl.jsonl` · `node_modules/` · `.next/` · `dashboard/app/public/data/*` · `dashboard/public/data/*` · `dashboard/tmp/*`

---

## 3) คำสั่งให้ Codex รัน (copy-paste, ทีละบล็อก ตรวจผลก่อนไปต่อ)

> ⚠️ Claude ไม่รันให้ — Codex รันเองและตรวจ output ทุกบล็อก

**3.1 verify branch + remote (ต้อง main + origin)**
```bash
git rev-parse --abbrev-ref HEAD     # ต้องได้: main
git remote -v                       # ต้องมี origin ชี้ repo ที่ถูกต้อง
git fetch origin && git status      # ตรวจ ahead/behind + working tree
```

**3.2 build ต้อง EXIT:0 ก่อน commit**
```bash
cd dashboard && npm run build       # ต้อง EXIT:0 — ถ้าไม่ 0 หยุด ห้าม commit
cd ..
```

**3.3 stage เฉพาะ allowlist (อย่าใช้ `git add .`)**
```bash
git add dashboard/lib/readPaperJournal.ts dashboard/lib/paperPerformance.ts .env.example \
        PROJECT_CONTEXT.md PROJECT_MAP.md \
        docs/SERVER_EVIDENCE_LEDGER.md docs/M0Z6_CONTROL_INDEX.md \
        docs/M0Z6G_OFFLINE_ACCEPTANCE_PACK.md docs/M0Z6H_CONTROL_PACK_CONSOLIDATION.md \
        docs/M0Z6I_MANUAL_EVIDENCE_PACK.md docs/M0Z6J_CONTROL_FREEZE.md \
        docs/M0Z6_PROJECT_OWNER_CONTROL_MANUAL.md docs/M0Z6_OWNER_EXECUTION_PACKET.md \
        docs/M0Z6_CODEX_RELEASE_EXECUTION_PACK.md
```

**3.4 ยืนยันว่าไม่มีไฟล์ต้องห้ามติด stage (สำคัญ)**
```bash
git status --short          # ทุกบรรทัดต้องเป็นไฟล์ใน allowlist เท่านั้น
git diff --cached --name-only   # ต้องไม่มี .env / runtime *.json/*.jsonl / node_modules / .next
```
ถ้าเห็นไฟล์ต้องห้าม → `git restore --staged <file>` แล้วตรวจซ้ำ

**3.5 commit + push**
```bash
git commit -m "feat(paper): M-0Z-2 ORDER_FILLED parse + FILL_RESULT extractFills; docs: M-0Z-6 offline control pack + .env.example paper keys"
git push origin main
git rev-parse HEAD          # เก็บ commit hash ไปกรอก report
```

---

## 4) Commit Message (ใช้ตามนี้)
```
feat(paper): M-0Z-2 ORDER_FILLED parse + FILL_RESULT extractFills; docs: M-0Z-6 offline control pack + .env.example paper keys
```

---

## 5) Post-Push Report Template → ป้อนกลับเข้า Evidence Form §6 บล็อก [1]
```
[1] CODEX RELEASE
    commit_hash: __________ (จาก git rev-parse HEAD)
    pushed_branch: main
    staged_files: (วาง git diff --cached --name-only ก่อน commit)
    build_exit_code: 0
    runtime_json_committed (y/n): n   ← ต้องยืนยัน n
    secrets_committed (y/n): n        ← ต้องยืนยัน n
    classification: PASS / FAIL / PENDING_EXTERNAL
```
ส่งบล็อกนี้กลับมาให้ Claude → Claude classify gate "release integrity" + "safe staging" + "no runtime/secret committed" ตาม Frozen Gate Classification Rules

---

## 6) ข้อควรระวัง (Codex)
- ห้าม `git add .` / `git add -A` — ใช้ allowlist เท่านั้น
- ห้าม force push · ห้าม push non-main โดยไม่ได้รับอนุมัติ
- ถ้า build ≠ EXIT:0 → หยุด ห้าม commit
- ถ้า `git status` โชว์ runtime JSON ถูกแก้ (จาก backend รัน) → **ห้าม stage** ปล่อยให้ backend regenerate (ดู `RUNTIME_FILES_GIT_POLICY.md`)
- ห้าม deploy ในขั้นนี้ — deploy เป็นงาน Operator ขั้นถัดไป

---

## 7) M-0B Impact
- ชุดนี้ปิด gate ฝั่ง release **บางส่วน** (release integrity / safe staging / no runtime/secret committed) เมื่อ Codex รันสำเร็จ + report กลับมา PASS
- **ยังไม่ unblock M-0B** — ยังเหลือ deploy · runtime root · health post-deploy · /public visual · paper fills · closed cycles · approval

---

## 8) Final Decision
Phase M-0B remains **BLOCKED**. Live trading **DISABLED**. Order placement **DISABLED**. EXCHANGE_MANUAL_APPROVAL **not_approved**.
Claude prepared the Codex release execution pack and applied the `.env.example` paper-keys fix offline, but Git push + deploy must be executed by Codex/Operator before any gate can move past PENDING_EXTERNAL.
