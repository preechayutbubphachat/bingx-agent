// dashboard/components/TimelineCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { LogItem } from "@/components/plan-steps/types";
import { apiUrl } from "@/lib/apiBase";

const POLL_MS = 10_000;
const TODAY_KEY = ymd(Date.now());

// ✅ NEW: apiUrl + fallback กันพอร์ต/โดเมนพัง
async function fetchWithFallback(path: string) {
    const url = apiUrl(path);
    try {
        return await fetch(url, { cache: "no-store" });
    } catch (e) {
        if (url !== path) return await fetch(path, { cache: "no-store" });
        throw e;
    }
}

function timeTH(ts: number) {
    return new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}
function dayLabelTH(ts: number) {
    return new Date(ts).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}
function ymd(ts: number) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toMs(ts: number) {
    return ts < 1e12 ? ts * 1000 : ts;
}

function eventIcon(e: LogItem) {
    const type = String(e.type ?? "").toUpperCase();
    const to = String(e.to ?? "").toUpperCase();
    if (type.includes("MODE_SWITCH")) return "🔁";
    if (to.includes("SWEEP")) return "🧹";
    if (to.includes("REJECTION")) return "🪝";
    if (to.includes("FAKEOUT") || to.includes("RANGE_PLAY")) return "✅";
    if (to.includes("BREAKOUT")) return "🚀";
    if (to.includes("NO_TRADE") || to.includes("LOCKED")) return "🔒";
    return "•";
}

function oneLineSummary(e: LogItem) {
    if (e.explain_th && e.explain_th.trim().length) return e.explain_th.trim();
    const to = String(e.to ?? "").toUpperCase();
    if (to.includes("WAIT_SWEEP")) return "ยังไม่เข้าจังหวะ — รอให้กวาดบนก่อน";
    if (to.includes("WAIT_15M_REJECTION")) return "กวาดบนแล้ว — รอ 15m ปิดยืนยัน rejection";
    if (to.includes("WAIT_1H_CONFIRM")) return "15m ผ่านแล้ว — รอ 1H ยืนยัน fakeout/breakout";
    if (to.includes("FAKEOUT_CONFIRMED") || to.includes("RANGE_PLAY")) return "ยืนยัน fakeout — กลับไปเล่นในกรอบ";
    if (to.includes("BREAKOUT_CONFIRMED")) return "ยืนยัน breakout — ต้องเปลี่ยนโหมด";
    if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";
    return `สถานะเปลี่ยน → ${e.to}`;
}

function groupByDay(items: LogItem[]) {
    const sorted = [...items].sort((a, b) => b.t - a.t);
    const map = new Map<string, { label: string; items: LogItem[] }>();
    for (const it of sorted) {
        const k = ymd(it.t);
        if (!map.has(k)) map.set(k, { label: dayLabelTH(it.t), items: [] });
        map.get(k)!.items.push(it);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
}

export default function TimelineCard({ className = "" }: { className?: string }) {
    const [items, setItems] = useState<LogItem[]>([]);
    const [err, setErr] = useState<string | null>(null);

    function logSig(x: LogItem) {
        return [String(x.type ?? ""), String(x.from ?? ""), String(x.to ?? ""), String((x as any).from_mode ?? ""), String((x as any).to_mode ?? ""), String((x as any).to_plan_state ?? "")]
            .join("|")
            .toUpperCase();
    }

    function dedupeConsecutive(items: LogItem[], windowSec = 30) {
        const sorted = [...items].sort((a, b) => toMs(b.t) - toMs(a.t));
        const out: LogItem[] = [];

        for (const it of sorted) {
            const last = out[out.length - 1];
            if (last) {
                const same = logSig(it) === logSig(last);
                const close = Math.abs(toMs(it.t) - toMs(last.t)) <= windowSec * 1000;
                if (same && close) continue;
            }
            out.push(it);
        }
        return out;
    }

    async function load() {
        const res = await fetchWithFallback("/api/plan-log?limit=800&dedupe=1&windowSec=30");
        if (!res.ok) throw new Error(`plan-log http ${res.status}`);
        const j = await res.json();
        if (!j?.ok) throw new Error("plan-log not ok");

        const raw = (j.items ?? []) as LogItem[];
        setItems(dedupeConsecutive(raw, 30));
        setErr(null); // ✅ สำเร็จแล้วเคลียร์ error (กันค้างแดง)
    }

    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                await load();
            } catch (e: any) {
                setErr(e?.message ?? "failed to load");
            }
        })();

        const id = setInterval(async () => {
            try {
                await load(); // ✅ ถ้าสำเร็จ err จะถูกเคลียร์ใน load()
            } catch {
                // ignore
            }
        }, POLL_MS);

        return () => clearInterval(id);
    }, []);

    const groups = useMemo(() => groupByDay(items), [items]);
    const today = groups.find((g) => g.key === TODAY_KEY);
    const history = groups.filter((g) => g.key !== TODAY_KEY).slice(0, 10);

    if (err) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
                โหลด Timeline ไม่ได้: {err}
            </div>
        );
    }

    return (
        <div className={`rounded-2xl bg-neutral-900 p-5 flex flex-col min-h-0 ${className}`}>
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-200">Timeline</div>
                <div className="text-xs text-neutral-500">{items.length ? `${items.length} events` : "no events"}</div>
            </div>

            <div className="mt-3">
                <div className="text-xs text-neutral-400">Today</div>
                {!today || today.items.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-400">วันนี้ยังไม่มีเหตุการณ์เปลี่ยนสถานะ</div>
                ) : (
                    <div className="mt-3 max-h-[460px] overflow-auto pr-1 space-y-3">
                        {today.items.map((x, i) => (
                            <div key={`${x.t}-${i}`} className="flex gap-3">
                                <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm">
                                    {eventIcon(x)}
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-neutral-500">{timeTH(x.t)}</div>
                                    <div className="mt-1 text-sm text-neutral-200">{oneLineSummary(x)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-xs text-neutral-400">History (tap to expand)</div>
                <div className="mt-2 space-y-2">
                    {history.map((g) => (
                        <details key={g.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <summary className="cursor-pointer select-none text-sm text-neutral-200 flex items-center justify-between">
                                <span className="font-semibold">{g.label}</span>
                                <span className="text-xs text-neutral-500">{g.items.length} events</span>
                            </summary>
                            <div className="mt-3 max-h-72 overflow-auto pr-1 space-y-3">
                                {g.items.map((x, i) => (
                                    <div key={`${x.t}-${i}`} className="flex gap-3">
                                        <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm">
                                            {eventIcon(x)}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs text-neutral-500">{timeTH(x.t)}</div>
                                            <div className="mt-1 text-sm text-neutral-200">{oneLineSummary(x)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        </div>
    );
}
