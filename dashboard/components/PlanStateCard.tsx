// dashboard/components/PlanStateCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";
import { usePlanStatusOptional } from "@/components/plan-status/PlanStatusProvider";

const POLL_MS = 10_000;

type PlanStatusResp = {
    ok: boolean;
    symbol?: string;
    updated_at?: number;
    source_updated_at?: number;
    mode_lock?: { value?: string; changed?: boolean };
    plan_state?: string;
    plan_status_state?: {
        generated_at?: string;
        age_sec?: number;
        plan?: {
            market_regime?: string;
            market_mode?: string;
        };
        state?: {
            code?: string;
            headline?: string;
            direction_hint?: string;
            confidence?: number;
            step_set?: string;
        };
        signals?: Record<string, string>;
        next_actions?: string[];
        steps?: Array<{ id?: string; title?: string; status?: string; why?: string }>;
    };
};

function normUpper(x: unknown) {
    return String(x ?? "").trim().toUpperCase();
}

function pct(conf?: number) {
    if (typeof conf !== "number" || !Number.isFinite(conf)) return "—";
    return `${Math.round(conf * 100)}%`;
}

function tone(tag?: string) {
    const t = normUpper(tag);
    if (t.includes("DONE") || t.includes("CONFIRMED") || t.includes("READY"))
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (t.includes("WAIT") || t.includes("PENDING"))
        return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    if (t.includes("FAIL") || t.includes("BLOCK") || t.includes("NO_TRADE"))
        return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    return "border-neutral-700 bg-white/5 text-neutral-300";
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

export default function PlanStateCard() {
    const ctx = usePlanStatusOptional();

    // local fallback state (ยังคงไว้)
    const [rawLocal, setRawLocal] = useState<PlanStatusResp | null>(null);
    const [errLocal, setErrLocal] = useState<string | null>(null);
    const [fetchedAtLocal, setFetchedAtLocal] = useState<number | null>(null);
    const [nowLocal, setNowLocal] = useState(() => Date.now());

    // clock (fallback only)
    useEffect(() => {
        if (ctx) return;
        const id = setInterval(() => setNowLocal(Date.now()), 1000);
        return () => clearInterval(id);
    }, [ctx]);

    // poll (fallback only)
    useEffect(() => {
        if (ctx) return;

        let alive = true;

        async function load() {
            try {
                const res = await fetchWithFallback("/api/plan-status");
                if (!res.ok) throw new Error(`plan-status http ${res.status}`);
                const j = (await res.json()) as PlanStatusResp;
                if (!j?.ok) throw new Error("plan-status not ok");
                if (!alive) return;

                setRawLocal(j);
                setFetchedAtLocal(Date.now());
                setErrLocal(null);
            } catch (e: any) {
                if (!alive) return;
                setErrLocal(e?.message ?? "failed to load");
            }
        }

        load();
        const id = setInterval(load, POLL_MS);

        return () => {
            alive = false;
            clearInterval(id);
        };
    }, [ctx]);

    // effective sources
    const raw = (ctx?.data as any as PlanStatusResp | null) ?? rawLocal;
    const err = ctx?.error ?? errLocal;
    const fetchedAt = ctx?.fetchedAt ?? fetchedAtLocal;
    const now = ctx?.now ?? nowLocal;

    const ps = useMemo(() => raw?.plan_status_state ?? null, [raw]);

    const fetchAgeSec = useMemo(() => {
        if (!fetchedAt) return null;
        return Math.max(0, Math.floor((now - fetchedAt) / 1000));
    }, [now, fetchedAt]);

    const headline = ps?.state?.headline ?? "—";
    const code = ps?.state?.code ?? "UNKNOWN";
    const stepSet = ps?.state?.step_set ?? "—";
    const direction = ps?.state?.direction_hint ?? "—";
    const confidence = ps?.state?.confidence;
    const ageSec = typeof ps?.age_sec === "number" ? ps?.age_sec : null;

    if (err) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
                โหลด PlanState ไม่ได้: {err}
            </div>
        );
    }

    if (!raw) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                กำลังโหลด Plan State…
            </div>
        );
    }

    if (!ps) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                /api/plan-status ยังไม่ส่ง plan_status_state มา
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-neutral-900 p-5 space-y-4 min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm text-neutral-100 font-semibold flex flex-wrap items-center gap-2">
                        <span className="truncate">Plan State</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${tone(code)}`}>{code}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${tone(direction)}`}>{direction}</span>
                        <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-950/40 px-2 py-0.5 text-xs text-neutral-300">
                            conf: {pct(confidence)}
                        </span>
                    </div>

                    <div className="mt-1 text-xs text-neutral-400 break-words">
                        step_set: <span className="text-neutral-200">{stepSet}</span>
                        {raw?.mode_lock?.value ? (
                            <>
                                {" "}
                                • mode_lock: <span className="text-neutral-200">{String(raw.mode_lock.value)}</span>
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="text-right text-[11px] text-neutral-500 shrink-0">
                    <div>Card Fresh: {fetchAgeSec == null ? "—" : `${fetchAgeSec}s`}</div>
                    <div>State Age: {ageSec == null ? "—" : `${ageSec}s`}</div>
                </div>
            </div>

            {/* Headline */}
            <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4">
                <div className="text-xs text-neutral-400">Headline</div>
                <div className="mt-1 text-sm text-neutral-100 break-words whitespace-pre-wrap">{headline}</div>

                {/* Confidence bar */}
                <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span>Confidence</span>
                        <span>{pct(confidence)}</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-white/5 overflow-hidden">
                        <div
                            className="h-full bg-white/25"
                            style={{ width: `${Math.max(0, Math.min(100, Math.round((confidence ?? 0) * 100)))}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Signals */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-neutral-400">Signals</div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(ps?.signals ?? {}).length === 0 ? (
                        <span className="text-xs text-neutral-400">—</span>
                    ) : (
                        Object.entries(ps?.signals ?? {}).map(([k, v]) => (
                            <span key={k} className={`rounded-full border px-3 py-1 text-xs ${tone(v)}`} title={k}>
                                {k}: {String(v)}
                            </span>
                        ))
                    )}
                </div>
            </div>

            {/* Next actions */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-neutral-400">Next actions</div>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-200">
                    {(ps?.next_actions ?? []).length ? (
                        ps!.next_actions!.map((x, i) => <li key={i}>• {x}</li>)
                    ) : (
                        <li className="text-neutral-400">—</li>
                    )}
                </ul>
            </div>
        </div>
    );
}
