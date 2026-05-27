import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fileExists(p: string) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function resolveDataDir() {
    const envDir = process.env.BINGX_AGENT_DIR?.trim() || process.env.BINGX_DATA_DIR?.trim();
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

type CloseType = "OB" | "TREND";
type CloseResult = "WIN" | "LOSS";

type CloseEvent = {
    t: number;
    type: string;
    symbol?: string;
    trade_id?: string;
    result?: CloseResult;
    r_multiple?: number | null;
};

function isCloseEvent(x: any): x is CloseEvent {
    const tp = String(x?.type ?? "");
    return (
        tp === "OB_TP1_HIT" ||
        tp === "OB_STOP_HIT" ||
        tp === "TREND_TP1_HIT" ||
        tp === "TREND_STOP_HIT"
    );
}

function mapCloseType(evType: string): CloseType {
    return evType.startsWith("TREND_") ? "TREND" : "OB";
}

function mapResult(evType: string, result?: string): CloseResult | null {
    if (result === "WIN" || result === "LOSS") return result;
    if (evType.endsWith("TP1_HIT")) return "WIN";
    if (evType.endsWith("STOP_HIT")) return "LOSS";
    return null;
}

function summarize(events: CloseEvent[]) {
    const total = events.length;
    const wins = events.filter((e) => e.result === "WIN").length;
    const losses = events.filter((e) => e.result === "LOSS").length;

    const rs = events
        .map((e) => (typeof e.r_multiple === "number" ? e.r_multiple : null))
        .filter((x): x is number => typeof x === "number");

    const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;

    return {
        total,
        wins,
        losses,
        winrate: total ? Number(((wins / total) * 100).toFixed(2)) : 0,
        avgR: avgR == null ? null : Number(avgR.toFixed(3)),
    };
}

export async function GET() {
    try {
        const dataDir = await resolveDataDir();
        const historyPath = path.join(dataDir, "plan_history.jsonl");

        if (!(await fileExists(historyPath))) {
            return NextResponse.json({
                ok: true,
                data_dir: dataDir,
                file: "plan_history.jsonl",
                has_data: false,
                reason: "file_missing",
                overall: summarize([]),
                by_type: { OB: summarize([]), TREND: summarize([]) },
                last_events: [],
            });
        }

        const raw = await fs.readFile(historyPath, "utf8");
        const lines = raw.split("\n").filter(Boolean);

        const parsed: CloseEvent[] = [];
        for (const ln of lines) {
            try {
                const obj = JSON.parse(ln);
                if (!isCloseEvent(obj)) continue;

                const r = mapResult(String(obj.type), String(obj.result ?? ""));
                if (!r) continue;

                parsed.push({
                    t: Number(obj.t ?? Date.now()),
                    type: String(obj.type),
                    symbol: obj.symbol,
                    trade_id: obj.trade_id,
                    result: r,
                    r_multiple: typeof obj.r_multiple === "number" ? obj.r_multiple : null,
                });
            } catch {
                // ignore bad line
            }
        }

        // newest first
        parsed.sort((a, b) => b.t - a.t);

        const ob = parsed.filter((e) => mapCloseType(e.type) === "OB");
        const trend = parsed.filter((e) => mapCloseType(e.type) === "TREND");

        return NextResponse.json({
            ok: true,
            data_dir: dataDir,
            file: "plan_history.jsonl",
            has_data: parsed.length > 0,
            overall: summarize(parsed),
            by_type: {
                OB: summarize(ob),
                TREND: summarize(trend),
            },
            last_events: parsed.slice(0, 20),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error in winrate";
        console.error("[/api/winrate] Unexpected error:", message);
        return NextResponse.json({
            ok: false,
            has_data: false,
            reason: "server_error",
            error: message,
            overall: summarize([]),
            by_type: { OB: summarize([]), TREND: summarize([]) },
            last_events: [],
        });
    }
}
