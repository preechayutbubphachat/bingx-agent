import { NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import readline from "readline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fileExists(p: string) {
    try {
        await fsp.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * หา dataDir แบบเดียวกับ plan-status:
 * - env BINGX_DATA_DIR (ถ้ามี)
 * - cwd / .. / ../..
 * โดยดูจากการมีอยู่ของ latest_decision.json
 */
async function resolveDataDir() {
    const envDir = process.env.BINGX_DATA_DIR?.trim();
    const candidates = [
        envDir,
        process.cwd(),
        path.resolve(process.cwd(), ".."),
        path.resolve(process.cwd(), "../.."),
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
        const probe = path.join(dir, "latest_decision.json");
        if (await fileExists(probe)) return dir;
    }
    return process.cwd();
}

type CloseKind = "TP1_HIT" | "STOP_HIT";

type CloseEvent = {
    t?: number; // ms (normalized)
    type?: string; // toState/logType raw (debug)
    close_kind?: CloseKind | null;

    trade_id?: string | null;
    symbol?: string | null;
    bias?: "LONG" | "SHORT" | null;

    result?: "WIN" | "LOSS" | null;
    r_multiple?: number | null;

    entry_price?: number | null;
    exit_price?: number | null;
    sl?: number | null;
    tp1?: number | null;

    _src?: string; // debug: มาจากไฟล์ไหน
};

function safeNum(x: any): number | null {
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
    return Number.isFinite(n) ? n : null;
}

// ✅ normalize timestamp: ให้เป็น ms เสมอ (กัน sec/ms mismatch)
function normalizeTsMs(t: number | null): number | null {
    if (t === null || t === undefined || !Number.isFinite(t)) return null;
    // ถ้าต่ำกว่า 1e12 ให้ถือว่าเป็น seconds → แปลงเป็น ms
    return t < 1e12 ? t * 1000 : t;
}

function pct(n: number) {
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

/**
 * อ่าน JSONL แบบ “เอาท้ายไฟล์” โดยเก็บไว้แค่ last N lines
 */
async function readClosedTradesFromJsonlTail(logPath: string, limitLines: number, srcLabel: string) {
    const stream = fs.createReadStream(logPath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const buffer: string[] = [];
    for await (const line of rl) {
        const s = line.trim();
        if (!s) continue;

        buffer.push(s);
        if (buffer.length > limitLines) buffer.shift();
    }

    rl.close();
    stream.close();

    const closes: CloseEvent[] = [];

    for (const s of buffer) {
        let j: any = null;
        try {
            j = JSON.parse(s);
        } catch {
            continue;
        }

        const logType = String(j?.type ?? "");
        const toState = String(j?.to ?? "");

        // ✅ close condition: STATE_CHANGE + to ลงท้าย *_TP1_HIT|*_STOP_HIT
        const isClose =
            (logType === "STATE_CHANGE" && /_(TP1_HIT|STOP_HIT)$/.test(toState)) ||
            /^(OB_TP1_HIT|OB_STOP_HIT)$/.test(logType);

        if (!isClose) continue;

        // close kind
        const closeKind: CloseKind | null =
            /_TP1_HIT$/.test(toState) || logType === "OB_TP1_HIT"
                ? "TP1_HIT"
                : /_STOP_HIT$/.test(toState) || logType === "OB_STOP_HIT"
                    ? "STOP_HIT"
                    : null;

        // result
        const result =
            closeKind === "TP1_HIT" ? "WIN" : closeKind === "STOP_HIT" ? "LOSS" : null;

        const tRaw = safeNum(j?.t);
        const tMs = normalizeTsMs(tRaw);

        closes.push({
            t: tMs ?? undefined,
            type: toState || logType,
            close_kind: closeKind,

            trade_id: (j?.trade_id ?? null) as any,
            symbol: (j?.symbol ?? null) as any,
            bias: (j?.bias ?? null) as any,

            result,
            r_multiple: safeNum(j?.r_multiple),
            entry_price: safeNum(j?.entry_price),
            exit_price: safeNum(j?.exit_price),
            sl: safeNum(j?.sl),
            tp1: safeNum(j?.tp1),

            _src: srcLabel,
        });
    }

    closes.sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
    return closes;
}

function computeStats(closes: CloseEvent[]) {
    const total = closes.length;
    const wins = closes.filter((x) => x.result === "WIN").length;
    const losses = closes.filter((x) => x.result === "LOSS").length;
    const winrate = total > 0 ? (wins / total) * 100 : 0;

    const rs = closes.map((x) => x.r_multiple).filter((x): x is number => typeof x === "number");
    const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;

    const byBias = (bias: "LONG" | "SHORT") => {
        const xs = closes.filter((x) => x.bias === bias);
        const t = xs.length;
        const w = xs.filter((x) => x.result === "WIN").length;
        const l = xs.filter((x) => x.result === "LOSS").length;
        const wr = t ? (w / t) * 100 : 0;

        const rxs = xs.map((x) => x.r_multiple).filter((x): x is number => typeof x === "number");
        const ar = rxs.length ? rxs.reduce((a, b) => a + b, 0) / rxs.length : 0;

        return { total: t, wins: w, losses: l, winrate: pct(wr), avg_r: pct(ar) };
    };

    return {
        total,
        wins,
        losses,
        winrate: pct(winrate),
        avg_r: pct(avgR),
        by_bias: {
            LONG: byBias("LONG"),
            SHORT: byBias("SHORT"),
        },
    };
}

function batchKeyFromEvent(ev: CloseEvent) {
    const sym = String(ev.symbol ?? "").trim() || "—";
    const bias = String(ev.bias ?? "").trim() || "—";

    // ใช้ราคาเป็นตัวบอกว่า “ชุดเดียวกัน”
    const ep = ev.entry_price ?? "—";
    const sl = ev.sl ?? "—";
    const tp1 = ev.tp1 ?? "—";

    // time bucket กันชน: 10 นาที (ปรับได้)
    const t = ev.t ?? 0;
    const bucket = t ? Math.floor(t / (10 * 60 * 1000)) : 0;

    return `OB|${sym}|${bias}|EP=${ep}|SL=${sl}|TP1=${tp1}|B=${bucket}`;
}



// ✅ กุญแจ dedupe ที่ “มีความหมายต่อการเทรด” มากกว่า t
function dedupeKey(x: CloseEvent) {
    const tid = String(x.trade_id ?? "").trim();
    const kind = String(x.close_kind ?? "").trim();
    const res = String(x.result ?? "").trim();

    // ถ้ามี trade_id: ถือว่าหนึ่ง trade ควรมี close ของ kind/res แบบเดียวกัน
    // (ถ้าคุณมี partial close จริง ๆ ค่อยเพิ่ม leg_id ภายหลัง)
    if (tid) return `${tid}|${kind}|${res}`;

    // fallback: ถ้าไม่มี trade_id ให้ใช้ลายนิ้วมือจากราคา/สัญลักษณ์
    const sym = String(x.symbol ?? "").trim();
    const bias = String(x.bias ?? "").trim();
    const ep = x.entry_price ?? "—";
    const xp = x.exit_price ?? "—";
    const sl = x.sl ?? "—";
    const tp1 = x.tp1 ?? "—";
    return `${sym}|${bias}|${kind}|${res}|${ep}|${xp}|${sl}|${tp1}`;
}

export async function GET(req: Request) {
    const url = new URL(req.url);

    const limitLines = Math.max(
        1000,
        Math.min(200_000, Number(url.searchParams.get("limitLines") ?? "80000"))
    );

    const recent = Math.max(10, Math.min(200, Number(url.searchParams.get("recent") ?? "50")));

    const dataDir = await resolveDataDir();

    const logA = path.join(dataDir, "plan_status_log.jsonl");
    const logB = path.join(dataDir, "plan_history.jsonl");

    const logsUsed: Array<{ path: string; exists: boolean }> = [
        { path: logA, exists: await fileExists(logA) },
        { path: logB, exists: await fileExists(logB) },
    ];

    const existingLogs = logsUsed.filter((x) => x.exists).map((x) => x.path);

    if (!existingLogs.length) {
        return NextResponse.json(
            {
                ok: false,
                error: "no jsonl logs found",
                data_dir: dataDir,
                tried: logsUsed,
            },
            { status: 404 }
        );
    }

    // อ่านท้ายไฟล์แต่ละอัน แล้ว merge
    let allRaw: CloseEvent[] = [];
    const perFile: Record<string, number> = {};

    for (const p of existingLogs) {
        const label = path.basename(p);
        const part = await readClosedTradesFromJsonlTail(p, limitLines, label);
        perFile[label] = part.length;
        allRaw = allRaw.concat(part);
    }

    // ✅ Dedupe: เก็บ “ตัวล่าสุด” ต่อ key
    const map = new Map<string, CloseEvent>();
    const dupSamples: Array<{
        key: string;
        keep_src?: string;
        drop_src?: string;
        keep_t?: number;
        drop_t?: number;
        trade_id?: string | null;
        type_keep?: string;
        type_drop?: string;
    }> = [];

    for (const x of allRaw) {
        const key = dedupeKey(x);
        const prev = map.get(key);

        if (!prev) {
            map.set(key, x);
            continue;
        }

        const prevT = prev.t ?? 0;
        const curT = x.t ?? 0;

        // keep newest (higher t)
        if (curT >= prevT) {
            if (dupSamples.length < 20) {
                dupSamples.push({
                    key,
                    keep_src: x._src,
                    drop_src: prev._src,
                    keep_t: curT,
                    drop_t: prevT,
                    trade_id: x.trade_id ?? prev.trade_id ?? null,
                    type_keep: x.type,
                    type_drop: prev.type,
                });
            }
            map.set(key, x);
        } else {
            if (dupSamples.length < 20) {
                dupSamples.push({
                    key,
                    keep_src: prev._src,
                    drop_src: x._src,
                    keep_t: prevT,
                    drop_t: curT,
                    trade_id: prev.trade_id ?? x.trade_id ?? null,
                    type_keep: prev.type,
                    type_drop: x.type,
                });
            }
        }
    }

    let all = Array.from(map.values());
    all.sort((a, b) => (b.t ?? 0) - (a.t ?? 0));

    type BatchSummary = {
        batch_key: string;
        count: number;
        wins: number;
        losses: number;
        trade_ids: string[];
        newest_t?: number;
        oldest_t?: number;
    };

    function buildBatchSummaries(all: CloseEvent[]) {
        const buckets = new Map<string, CloseEvent[]>();

        for (const ev of all) {
            const key = batchKeyFromEvent(ev);
            if (!key) continue;
            const arr = buckets.get(key) ?? [];
            arr.push(ev);
            buckets.set(key, arr);
        }

        const out: BatchSummary[] = [];

        for (const [batchKey, items] of buckets.entries()) {
            // unique trade_id จริง ๆ
            const tids = Array.from(
                new Set(items.map((x) => String(x.trade_id ?? "").trim()).filter(Boolean))
            );

            const wins = items.filter((x) => x.result === "WIN").length;
            const losses = items.filter((x) => x.result === "LOSS").length;

            const ts = items.map((x) => x.t ?? 0).filter(Boolean).sort((a, b) => a - b);
            const oldest = ts.length ? ts[0] : undefined;
            const newest = ts.length ? ts[ts.length - 1] : undefined;

            out.push({
                batch_key: batchKey,
                count: tids.length,
                wins,
                losses,
                trade_ids: tids,
                oldest_t: oldest,
                newest_t: newest,
            });
        }

        // เรียง batch ที่ “น่าสงสัย” ก่อน: count มากสุด
        out.sort((a, b) => b.count - a.count || (b.newest_t ?? 0) - (a.newest_t ?? 0));
        return out;
    }


    const stats = computeStats(all);

    const duplicatesRemoved = Math.max(0, allRaw.length - all.length);

    const batches = buildBatchSummaries(all);

    // สงสัยว่าเปิดซ้ำ/ยิงซ้ำ ถ้าเกิน 3
    const suspicious_batches = batches.filter((b) => b.count > 3).slice(0, 50);

    // แสดง batch ปกติด้วย (ช่วยดูว่า count=3 เป็นส่วนใหญ่ไหม)
    const top_batches = batches.slice(0, 50);


    return NextResponse.json({
        ok: true,
        updated_at: Date.now(),
        data_dir: dataDir,
        logs_used: logsUsed,
        batch: {
            top_batches,
            suspicious_batches,
            note: "count = จำนวน trade_id ต่อ batch (โดยคาดว่า 1 OB เปิด 3 ออเดอร์)",
        },

        meta: {
            limitLines,
            closed_events_found_raw: allRaw.length,
            closed_events_found_deduped: all.length,
            duplicates_removed: duplicatesRemoved,
            per_file_counts: perFile,
            recent_sent: Math.min(recent, all.length),
        },
        debug: {
            // ช่วยไล่สาเหตุว่าซ้ำมาจากไฟล์ไหน/คีย์อะไร
            dup_samples: dupSamples,
            dedupe_key_note: "trade_id|close_kind|result (fallback uses symbol/bias/prices)",
        },
        stats,
        recent_trades: all.slice(0, recent),
    });
}
