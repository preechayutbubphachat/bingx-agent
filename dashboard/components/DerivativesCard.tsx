// dashboard/components/DerivativesCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";
import { usePlanStatusOptional } from "@/components/plan-status/PlanStatusProvider";

const POLL_MS = 10_000;

const STALE_WARN_SEC = 180;
const STALE_BAD_SEC = 420;

type PlanStatusResp = {
    ok: boolean;
    source_updated_at?: number;
    updated_at?: number;

    derivatives?: any;
    deriv?: any;

    planStatus?: {
        derivatives?: any;
        deriv?: any;
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

function tagTone(tag?: string) {
    const t = normUpper(tag);
    if (t === "FRESH") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (t === "STALE") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    if (t === "OLD") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    return "border-neutral-700 bg-white/5 text-neutral-300";
}

function staleTone(level?: string) {
    const s = normUpper(level);
    if (s === "OK") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (s === "WARN") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    if (s === "BAD") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    return "border-neutral-700 bg-white/5 text-neutral-300";
}

function dirTone(dir?: string) {
    const d = normUpper(dir);
    if (d === "UP") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (d === "DOWN") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    if (d === "FLAT") return "border-neutral-700 bg-white/5 text-neutral-300";
    return "border-neutral-700 bg-white/5 text-neutral-300";
}

function arrow(dir?: string) {
    const d = normUpper(dir);
    if (d === "UP") return "↑";
    if (d === "DOWN") return "↓";
    if (d === "FLAT") return "→";
    return "•";
}

function fmtNum(n: any, dp = 2) {
    const x = typeof n === "number" && Number.isFinite(n) ? n : null;
    if (x == null) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: dp }).format(x);
}

function fmtPct(n: any, dp = 2) {
    const x = typeof n === "number" && Number.isFinite(n) ? n : null;
    if (x == null) return "—";
    const sign = x >= 0 ? "+" : "";
    return `${sign}${x.toFixed(dp)}%`;
}

function fmtFundingSmart(nowVal: any) {
    const x = typeof nowVal === "number" && Number.isFinite(nowVal) ? nowVal : null;
    if (x == null) return "—";
    const pct = Math.abs(x) < 0.01 ? x * 100 : x;
    return `${pct.toFixed(4)}%`;
}

function MetaBlock({
    title,
    meta,
    dpNow,
    nowFmt,
}: {
    title: string;
    meta: any;
    dpNow?: number;
    nowFmt?: (v: any) => string;
}) {
    const status = meta?.status ?? "UNKNOWN";
    const hasData = !!meta?.has_data;

    const freshnessTag = pick(meta, ["source.freshness.tag", "freshness.tag", "source_tag"]) ?? "UNKNOWN";
    const ageSec = pick(meta, ["source.freshness.ageSec", "freshness.ageSec", "source_age_sec"]) ?? null;

    const nowVal = pick(meta, ["now", "value_now", "latest", "current"]) ?? null;

    const t5 = pick(meta, ["trend_5m", "trend5m", "trend_5"]) ?? null;
    const t15 = pick(meta, ["trend_15m", "trend15m", "trend_15"]) ?? null;

    const t5Dir = pick(t5, ["dir", "direction"]) ?? "UNKNOWN";
    const t5Pct = pick(t5, ["pct", "percent"]) ?? null;

    const t15Dir = pick(t15, ["dir", "direction"]) ?? "UNKNOWN";
    const t15Pct = pick(t15, ["pct", "percent"]) ?? null;

    const reason = meta?.reason ?? meta?.reason_th ?? meta?.note ?? "";
    const nowText = nowFmt ? nowFmt(nowVal) : fmtNum(nowVal, dpNow ?? 2);

    return (
        <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm text-neutral-100 font-semibold">{title}</div>
                    <div className="mt-1 text-xs text-neutral-400 break-words">
                        status: <span className="text-neutral-200">{String(status)}</span> • has_data:{" "}
                        <span className="text-neutral-200">{String(hasData)}</span>
                    </div>
                </div>

                <div className="shrink-0 text-right">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${tagTone(String(freshnessTag))}`}>
                        {String(freshnessTag)}
                        {typeof ageSec === "number" ? ` • ${ageSec}s` : ""}
                    </span>
                    <div className="mt-1 text-[11px] text-neutral-400">
                        now: <span className="text-neutral-200">{nowText}</span>
                    </div>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-full border px-3 py-1 ${dirTone(String(t5Dir))}`}>
                    5m: {arrow(String(t5Dir))} {normUpper(t5Dir)} {typeof t5Pct === "number" ? `(${fmtPct(t5Pct, 2)})` : ""}
                </span>
                <span className={`rounded-full border px-3 py-1 ${dirTone(String(t15Dir))}`}>
                    15m: {arrow(String(t15Dir))} {normUpper(t15Dir)} {typeof t15Pct === "number" ? `(${fmtPct(t15Pct, 2)})` : ""}
                </span>
            </div>

            {reason ? (
                <div className="mt-3 text-sm text-neutral-200 break-words whitespace-pre-wrap">{String(reason)}</div>
            ) : (
                <div className="mt-3 text-sm text-neutral-400">—</div>
            )}

            <div className="mt-3 text-[11px] text-neutral-500">
                pts5: {pick(meta, ["integrity.s5.count"]) ?? "—"} • span5: {pick(meta, ["integrity.s5.spanSec"]) ?? "—"}s • gap5:{" "}
                {pick(meta, ["integrity.s5.maxGapSec"]) ?? "—"}s • mono5: {String(pick(meta, ["integrity.s5.monotonic"]) ?? "—")}
                <br />
                pts15: {pick(meta, ["integrity.s15.count"]) ?? "—"} • span15: {pick(meta, ["integrity.s15.spanSec"]) ?? "—"}s • gap15:{" "}
                {pick(meta, ["integrity.s15.maxGapSec"]) ?? "—"}s • mono15: {String(pick(meta, ["integrity.s15.monotonic"]) ?? "—")}
            </div>
        </div>
    );
}

export default function DerivativesCard() {
    const ctx = usePlanStatusOptional();

    // local fallback state
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

    const sourceUpdatedAtMs = useMemo(() => {
        return toMs(raw?.source_updated_at ?? null) ?? toMs(raw?.updated_at ?? null) ?? null;
    }, [raw]);

    const planAgeSec = useMemo(() => {
        if (!sourceUpdatedAtMs) return null;
        return Math.max(0, Math.floor((now - sourceUpdatedAtMs) / 1000));
    }, [now, sourceUpdatedAtMs]);

    const fetchAgeSec = useMemo(() => {
        if (!fetchedAt) return null;
        return Math.max(0, Math.floor((now - fetchedAt) / 1000));
    }, [now, fetchedAt]);

    const derivatives = useMemo(() => {
        return pick(raw as any, ["derivatives", "deriv", "planStatus.derivatives", "planStatus.deriv"]) ?? null;
    }, [raw]);

    const derivFreshTag = useMemo(() => {
        return pick(derivatives, ["freshness.tag"]) ?? pick(derivatives, ["source.freshness.tag"]) ?? "UNKNOWN";
    }, [derivatives]);

    const derivAgeSec = useMemo(() => {
        const ageFromField = pick(derivatives, ["freshness.ageSec"]);
        if (typeof ageFromField === "number") return ageFromField;

        const upd = pick(derivatives, ["updated_at"]);
        const updMs = typeof upd === "number" ? toMs(upd) : null;
        if (updMs) return Math.max(0, Math.floor((now - updMs) / 1000));

        return null;
    }, [derivatives, now]);

    const staleLevel = useMemo(() => {
        const tag = normUpper(derivFreshTag);
        if (tag === "FRESH") return "OK";
        if (tag === "STALE") return "WARN";
        if (tag === "OLD") return "BAD";

        if (derivAgeSec == null) return "UNKNOWN";
        if (derivAgeSec >= STALE_BAD_SEC) return "BAD";
        if (derivAgeSec >= STALE_WARN_SEC) return "WARN";
        return "OK";
    }, [derivFreshTag, derivAgeSec]);

    const crowd = derivatives?.crowd ?? derivatives?.crowding ?? {};
    const crowdSide = String(crowd?.side ?? "—");
    const trapped = String(crowd?.trapped ?? "—");
    const crowdTH = String(crowd?.crowd_th ?? "").trim();
    const trappedTH = String(crowd?.trapped_th ?? "").trim();

    const oiMeta = pick(derivatives, ["oi", "oi_meta", "oi_series_meta"]) ?? null;
    const fundMeta = pick(derivatives, ["funding", "funding_meta", "funding_series_meta"]) ?? null;

    const mini = useMemo(() => {
        const oi5 = pick(oiMeta, ["trend_5m.pct"]);
        const oi15 = pick(oiMeta, ["trend_15m.pct"]);
        const f5 = pick(fundMeta, ["trend_5m.pct"]);
        const f15 = pick(fundMeta, ["trend_15m.pct"]);

        const s1 = `OI 5m ${fmtPct(oi5, 2)} • 15m ${fmtPct(oi15, 2)}`;
        const s2 = `Funding 5m ${fmtPct(f5, 2)} • 15m ${fmtPct(f15, 2)}`;
        const s3 = crowdTH ? crowdTH : `crowd=${crowdSide}`;
        return `${s1} | ${s2} | ${s3}`;
    }, [oiMeta, fundMeta, crowdTH, crowdSide]);

    if (err) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
                โหลด Derivatives ไม่ได้: {err}
            </div>
        );
    }

    if (!raw) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                กำลังโหลด Derivatives…
            </div>
        );
    }

    if (!derivatives) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                <div className="text-sm font-semibold text-neutral-100">Derivatives</div>
                <div className="mt-1 text-sm text-neutral-400">/api/plan-status ยังไม่ส่ง derivatives มา</div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-neutral-900 p-5 space-y-4 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm text-neutral-100 font-semibold">Derivatives</div>

                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${tagTone(String(derivFreshTag))}`}>
                            {String(derivFreshTag)}
                            {typeof derivAgeSec === "number" ? ` • ${derivAgeSec}s` : ""}
                        </span>

                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${staleTone(staleLevel)}`}>
                            stale: {staleLevel}
                        </span>
                    </div>

                    <div className="mt-1 text-xs text-neutral-400 break-words">
                        crowd: <span className="text-neutral-200">{crowdSide}</span> • trapped:{" "}
                        <span className="text-neutral-200">{trapped}</span>
                        {crowdTH || trappedTH ? (
                            <>
                                {" "}
                                • <span className="text-neutral-200">{crowdTH || "—"}</span> /{" "}
                                <span className="text-neutral-200">{trappedTH || "—"}</span>
                            </>
                        ) : null}
                    </div>

                    <div className="mt-1 text-xs text-neutral-500 break-words">{mini}</div>

                    {crowd?.note ? (
                        <div className="mt-1 text-xs text-neutral-500 break-words whitespace-pre-wrap">{String(crowd.note)}</div>
                    ) : null}
                </div>

                <div className="text-right text-[11px] text-neutral-500 shrink-0">
                    <div>Card Fresh: {fmtAgo(fetchAgeSec)}</div>
                    <div>Plan Fresh: {fmtAgo(planAgeSec)}</div>
                </div>
            </div>

            {staleLevel !== "OK" && (
                <div
                    className={`rounded-xl border px-4 py-3 ${staleLevel === "BAD"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        }`}
                >
                    <div className="text-xs font-semibold">{staleLevel === "BAD" ? "⚠️ Derivatives stale มาก" : "⏳ Derivatives เริ่มเก่า"}</div>
                    <div className="mt-1 text-[11px] opacity-80">age: {fmtAgo(derivAgeSec)} • OI/Funding อาจเป็น “อดีตที่หลอกเรา”</div>
                </div>
            )}

            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <MetaBlock title="Open Interest (OI)" meta={oiMeta} dpNow={0} />
                <MetaBlock title="Funding" meta={fundMeta} dpNow={6} nowFmt={fmtFundingSmart} />
            </div>
        </div>
    );
}
