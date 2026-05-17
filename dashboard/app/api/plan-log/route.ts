import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const APP_DATA_DIR = path.join(process.cwd(), "app", "public", "data");

async function fileExists(p: string) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * หา dataDir ที่มี latest_decision.json (เหมือน route อื่น)
 * ใช้สำหรับไฟล์ที่ runner เขียนไว้ข้างนอก (เช่น plan_status_log.jsonl)
 */
async function resolveDataDir() {
    const envDir = process.env.BINGX_DATA_DIR?.trim() || process.env.DATA_DIR?.trim();
    const cwd = process.cwd();
    const candidates = [
        envDir ? path.resolve(cwd, envDir) : "",
        path.resolve(cwd, ".."),
        cwd,
        path.resolve(cwd, "../.."),
    ].filter(Boolean);

    for (const dir of candidates) {
        if (
            await fileExists(path.join(dir, "latest_decision.json")) ||
            await fileExists(path.join(dir, "market_snapshot.json"))
        ) {
            return dir;
        }
    }

    return path.resolve(cwd, "..");
}

function toMs(ts: any) {
    const n = typeof ts === "number" ? ts : Number(ts);
    if (!Number.isFinite(n)) return 0;
    return n < 1e12 ? n * 1000 : n;
}

function logSig(x: any) {
    const derivTrapped = String(x?.deriv?.trapped ?? "");
    const toPlanState = String(x?.to_plan_state ?? x?.plan_state ?? "");
    return [
        String(x?.type ?? ""),
        String(x?.from ?? x?.from_status ?? ""),
        String(x?.to ?? x?.to_status ?? ""),
        String(x?.from_mode ?? ""),
        String(x?.to_mode ?? x?.mode_lock ?? ""),
        toPlanState,
        derivTrapped,
        String(x?._src ?? ""),
    ]
        .join("|")
        .toUpperCase();
}

// ตัด “ซ้ำติดๆกัน” ภายใน windowSec (กัน spam poll)
function dedupeConsecutive(items: any[], windowSec: number) {
    const out: any[] = [];
    for (const it of items) {
        const last = out[out.length - 1];
        if (!last) {
            out.push(it);
            continue;
        }
        const same = logSig(it) === logSig(last);
        const close = Math.abs(toMs(it.t) - toMs(last.t)) <= windowSec * 1000;
        if (same && close) continue;
        out.push(it);
    }
    return out;
}

async function readJsonlTail(filePath: string, limit: number, srcTag: string) {
    if (!(await fileExists(filePath))) return { items: [] as any[], totalLines: 0 };

    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (!lines.length) return { items: [] as any[], totalLines: 0 };

    const tail = lines.slice(Math.max(0, lines.length - limit));

    const items = tail
        .map((ln) => {
            try {
                const obj = JSON.parse(ln);
                return { ...obj, _src: srcTag };
            } catch {
                return null;
            }
        })
        .filter(Boolean) as any[];

    return { items, totalLines: lines.length };
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);

    // ✅ limit เพดาน
    const MAX_LIMIT = 5000;
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(searchParams.get("limit") ?? "120")));

    // ✅ เปิด/ปิด dedupe
    const dedupe = String(searchParams.get("dedupe") ?? "1") === "1";
    const windowSec = Math.max(5, Math.min(600, Number(searchParams.get("windowSec") ?? "30")));

    /**
     * ✅ source:
     * - "status"  = อ่านเฉพาะ plan_status_log.jsonl
     * - "history" = อ่านเฉพาะ plan_history.jsonl (เช่น OB_GATE_READY)
     * - "both"    = รวม 2 ไฟล์เป็น timeline เดียว (แนะนำ)
     */
    const source = String(searchParams.get("source") ?? "both").toLowerCase();

    const dataDir = await resolveDataDir();

    // runner log (มักอยู่ข้าง latest_decision.json)
    const statusLogCandidates = [
        path.join(dataDir, "plan_status_log.jsonl"),
        path.join(APP_DATA_DIR, "plan_status_log.jsonl"),
    ];

    // history log (เราเขียนไว้ใน app/public/data/plan_history.jsonl)
    const historyLogCandidates = [
        path.join(APP_DATA_DIR, "plan_history.jsonl"),
        path.join(dataDir, "plan_history.jsonl"),
    ];

    // เลือก path ที่ “มีจริง” ตัวแรก
    const statusLogPath =
        (await fileExists(statusLogCandidates[0])) ? statusLogCandidates[0] :
            (await fileExists(statusLogCandidates[1])) ? statusLogCandidates[1] :
                null;

    const historyLogPath =
        (await fileExists(historyLogCandidates[0])) ? historyLogCandidates[0] :
            (await fileExists(historyLogCandidates[1])) ? historyLogCandidates[1] :
                null;

    // อ่าน tail จากไฟล์ที่เลือก
    let status = { items: [] as any[], totalLines: 0 };
    let history = { items: [] as any[], totalLines: 0 };

    if ((source === "both" || source === "status") && statusLogPath) {
        status = await readJsonlTail(statusLogPath, limit, "status");
    }

    if ((source === "both" || source === "history") && historyLogPath) {
        history = await readJsonlTail(historyLogPath, limit, "history");
    }

    // รวม + sort ตามเวลา แล้วค่อยตัด limit อีกครั้ง (กัน case: 2 ไฟล์คนละ limit แล้วพลาดตัวใหม่)
    let items = [...status.items, ...history.items]
        .sort((a, b) => toMs(a.t) - toMs(b.t));

    if (items.length > limit) {
        items = items.slice(items.length - limit);
    }

    // dedupe spam ก่อนส่ง
    if (dedupe) {
        items = dedupeConsecutive(items, windowSec);
    }

    return NextResponse.json({
        ok: true,
        items,
        meta: {
            limit,
            dedupe,
            windowSec,
            source,
            dataDir,
            paths: {
                statusLogPath,
                historyLogPath,
            },
            totals: {
                statusLines: status.totalLines,
                historyLines: history.totalLines,
                returned: items.length,
            },
        },
    });
}
