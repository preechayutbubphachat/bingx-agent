// dashboard/components/PlanStatusStateCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";

const POLL_MS = 10_000;

// stale thresholds (ตาม vibe เดียวกับ OBGateCard)
const STALE_WARN_SEC = 180;
const STALE_BAD_SEC = 420;

type PlanStatusResp = {
    ok: boolean;
    source_updated_at?: number;
    updated_at?: number;

    plan_status_state?: any;
    planStatusState?: any;

    // เผื่อมี nested
    planStatus?: {
        plan_status_state?: any;
        planStatusState?: any;
    };
};

function toMs(ts: number | null | undefined): number | null {
    if (!ts) return null;
    return ts < 1e12 ? ts * 1000 : ts;
}

function fmtAgo(sec: number | null) {
    if (sec === null) return "—";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
}

function normUpper(x: unknown) {
    return String(x ?? "").trim().toUpperCase();
}

function pillTone(statusRaw?: string) {
    const s = normUpper(statusRaw);
    if (s === "PASS" || s === "DONE" || s === "READY")
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (s === "WARN" || s.includes("WAIT"))
        return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    if (s === "FAIL" || s.includes("INVALID") || s.includes("BLOCK"))
        return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    return "border-neutral-700 bg-white/5 text-neutral-300";
}

// safe getter
function getPath(obj: any, path: string): any {
    try {
        return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
    } catch {
        return undefined;
    }
}
function pick(obj: any, paths: string[]) {
    for (const p of paths) {
        const v = getPath(obj, p);
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
}

async function fetchWithFallback(path: string) {
    const url = apiUrl(path);
    try {
        return await fetch(url, { cache: "no-store" });
    } catch (e) {
        if (url !== path) return await fetch(path, { cache: "no-store" });
        throw e;
    }
}

export default function PlanStatusStateCard() {
    const [raw, setRaw] = useState<PlanStatusResp | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        let alive = true;

        async function load() {
            try {
                const res = await fetchWithFallback("/api/plan-status");
                if (!res.ok) throw new Error(`plan-status http ${res.status}`);
                const j = (await res.json()) as PlanStatusResp;
                if (!j?.ok) throw new Error("plan-status not ok");
                if (!alive) return;

                setRaw(j);
                setFetchedAt(Date.now());
                setErr(null);
            } catch (e: any) {
                if (!alive) return;
                setErr(e?.message ?? "failed to load");
            }
        }

        load();
        const id = setInterval(load, POLL_MS);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);

    const sourceUpdatedAtMs = useMemo(() => {
        return toMs(raw?.source_updated_at ?? null) ?? toMs(raw?.updated_at ?? null) ?? null;
    }, [raw]);

    const candleAgeSec = useMemo(() => {
        if (!sourceUpdatedAtMs) return null;
        return Math.max(0, Math.floor((now - sourceUpdatedAtMs) / 1000));
    }, [now, sourceUpdatedAtMs]);

    const fetchAgeSec = useMemo(() => {
        if (!fetchedAt) return null;
        return Math.max(0, Math.floor((now - fetchedAt) / 1000));
    }, [now, fetchedAt]);

    const staleLevel = useMemo(() => {
        if (candleAgeSec == null) return "UNKNOWN";
        if (candleAgeSec >= STALE_BAD_SEC) return "BAD";
        if (candleAgeSec >= STALE_WARN_SEC) return "WARN";
        return "OK";
    }, [candleAgeSec]);

    const ps = useMemo(() => {
        const v =
            pick(raw as any, ["plan_status_state", "planStatusState", "planStatus.plan_status_state", "planStatus.planStatusState"]) ?? null;
        return v;
    }, [raw]);

    const state = ps?.state ?? {};
    const steps: any[] = Array.isArray(ps?.steps) ? ps.steps : [];
    const nextActions: string[] = Array.isArray(ps?.next_actions) ? ps.next_actions : [];

    if (err) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
                โหลด Plan Status State ไม่ได้: {err}
            </div>
        );
    }

    if (!raw) {
        return <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">กำลังโหลด Plan Status State…</div>;
    }

    if (!ps) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                <div className="text-sm font-semibold text-neutral-100">Plan Status State</div>
                <div className="mt-1 text-sm text-neutral-400">/api/plan-status ยังไม่ส่ง plan_status_state มา</div>
                <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">ดู key ใน payload (debug)</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-300">{JSON.stringify(Object.keys(raw ?? {}), null, 2)}</pre>
                </details>
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-neutral-900 p-5 space-y-4 min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm text-neutral-100 font-semibold flex flex-wrap items-center gap-2">
                        <span className="truncate">Plan Status State</span>
                        {state?.code ? (
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${pillTone(state?.status ?? state?.code)}`}>
                                {String(state.code)}
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-1 text-sm text-neutral-100 font-medium break-words">
                        {String(state?.headline ?? "—")}
                    </div>

                    <div className="mt-1 text-xs text-neutral-400 break-words">
                        hint: {String(state?.direction_hint ?? "—")} • conf: {String(state?.confidence ?? "—")}
                    </div>
                </div>

                <div className="text-right text-[11px] text-neutral-500 shrink-0">
                    <div>Card Fresh: {fmtAgo(fetchAgeSec)}</div>
                    <div>Source Fresh: {fmtAgo(candleAgeSec)}</div>
                </div>
            </div>

            {/* Stale banner */}
            {staleLevel !== "OK" && (
                <div
                    className={`rounded-xl border px-4 py-3 ${staleLevel === "BAD"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        }`}
                >
                    <div className="text-xs font-semibold">{staleLevel === "BAD" ? "⚠️ Data stale มาก" : "⏳ Data เริ่มเก่า"}</div>
                    <div className="mt-1 text-[11px] opacity-80">Source age: {fmtAgo(candleAgeSec)} • เวลาไม่สด แผนก็อาจ “เปลี่ยนใจ” ได้</div>
                </div>
            )}

            {/* Steps */}
            <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-400">Steps</div>

                <div className="mt-3 space-y-2">
                    {steps.length ? (
                        steps.map((x, i) => {
                            const id = x?.id ?? i;
                            const title = x?.title ?? x?.name ?? x?.id ?? `STEP_${i + 1}`;
                            const status = x?.status ?? "UNKNOWN";
                            const why = x?.why ?? x?.note ?? "";

                            return (
                                <div key={id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm text-neutral-100 font-medium truncate">{String(title)}</div>
                                            {why ? <div className="mt-1 text-xs text-neutral-400 break-words">{String(why)}</div> : null}
                                        </div>
                                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${pillTone(status)}`}>
                                            {normUpper(status) || "—"}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-sm text-neutral-400">—</div>
                    )}
                </div>
            </div>

            {/* Next actions */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-neutral-400">Next actions</div>
                <ul className="mt-2 space-y-2 text-sm text-neutral-200 list-disc pl-5">
                    {nextActions.length ? nextActions.map((a, i) => <li key={i}>{a}</li>) : <li className="text-neutral-400">—</li>}
                </ul>
            </div>

            {/* Debug */}
            <details>
                <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">ดู plan_status_state (debug)</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
                    {JSON.stringify(ps, null, 2)}
                </pre>
            </details>
        </div>
    );
}
