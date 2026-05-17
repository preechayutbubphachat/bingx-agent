"use client";

import { useEffect, useState } from "react";

type WinrateResp = {
    ok: boolean;
    has_data: boolean;
    overall: { total: number; wins: number; losses: number; winrate: number; avgR: number | null };
    by_type: {
        OB: { total: number; wins: number; losses: number; winrate: number; avgR: number | null };
        TREND: { total: number; wins: number; losses: number; winrate: number; avgR: number | null };
    };
    last_events: Array<{ t: number; type: string; trade_id?: string; result: "WIN" | "LOSS"; r_multiple?: number | null }>;
};

const POLL_MS = 10_000;

function agoSec(ts: number) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    return s;
}

export default function WinrateCard() {
    const [data, setData] = useState<WinrateResp | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        try {
            setErr(null);
            const r = await fetch("/api/winrate", { cache: "no-store" });
            const j = (await r.json()) as WinrateResp;
            setData(j);
        } catch (e: any) {
            setErr(String(e?.message ?? e));
        }
    }

    useEffect(() => {
        const initialId = setTimeout(load, 0);
        const id = setInterval(load, POLL_MS);
        return () => {
            clearTimeout(initialId);
            clearInterval(id);
        };
    }, []);

    if (err) {
        return (
            <div className="rounded-xl border p-4">
                <div className="font-semibold">Winrate</div>
                <div className="text-sm opacity-70">โหลดไม่ได้: {err}</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="rounded-xl border p-4">
                <div className="font-semibold">Winrate</div>
                <div className="text-sm opacity-70">กำลังโหลด…</div>
            </div>
        );
    }

    const o = data.overall;
    const ob = data.by_type.OB;
    const tr = data.by_type.TREND;

    return (
        <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="font-semibold">Winrate (from plan_history)</div>
                <button
                    onClick={load}
                    className="text-sm rounded-lg border px-3 py-1 hover:bg-black/5"
                >
                    Refresh
                </button>
            </div>

            {!data.has_data ? (
                <div className="text-sm opacity-70">ยังไม่มีอีเวนต์ปิดไม้ (TP/SL) ใน plan_history.jsonl</div>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border p-3">
                            <div className="text-xs opacity-70">Overall</div>
                            <div className="text-lg font-semibold">{o.winrate.toFixed(2)}%</div>
                            <div className="text-xs opacity-70">
                                {o.wins}W / {o.losses}L • total {o.total} • avgR {o.avgR ?? "—"}
                            </div>
                        </div>

                        <div className="rounded-lg border p-3">
                            <div className="text-xs opacity-70">OB</div>
                            <div className="text-lg font-semibold">{ob.winrate.toFixed(2)}%</div>
                            <div className="text-xs opacity-70">
                                {ob.wins}W / {ob.losses}L • total {ob.total} • avgR {ob.avgR ?? "—"}
                            </div>
                        </div>

                        <div className="rounded-lg border p-3">
                            <div className="text-xs opacity-70">TREND</div>
                            <div className="text-lg font-semibold">{tr.winrate.toFixed(2)}%</div>
                            <div className="text-xs opacity-70">
                                {tr.wins}W / {tr.losses}L • total {tr.total} • avgR {tr.avgR ?? "—"}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border p-3">
                        <div className="text-xs opacity-70 mb-2">Last closes</div>
                        <div className="space-y-1 text-sm">
                            {data.last_events.slice(0, 6).map((e) => (
                                <div key={`${e.t}-${e.trade_id}-${e.type}`} className="flex justify-between">
                                    <div className="truncate">
                                        <span className="opacity-70">{agoSec(e.t)}s ago</span>{" "}
                                        <span className="font-medium">{e.type}</span>{" "}
                                        <span className={e.result === "WIN" ? "font-semibold" : "font-semibold"}>
                                            {e.result}
                                        </span>{" "}
                                        <span className="opacity-70">R={typeof e.r_multiple === "number" ? e.r_multiple.toFixed(3) : "—"}</span>
                                    </div>
                                    <div className="opacity-50 truncate">{e.trade_id ?? ""}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
