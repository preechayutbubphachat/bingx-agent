// dashboard/components/OBGateCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";
import {
    usePlanStatusOptional,
    type PlanStatusResp as CtxPlanStatusResp,
} from "@/components/plan-status/PlanStatusProvider";
import { mapAllGates } from "@/components/ob-gate/gateNodeMap";

const POLL_MS = 10_000;
const STALE_WARN_SEC = 180;
const STALE_BAD_SEC = 420;

type GateNode = {
    status?: string;
    status_th?: string;
    note_th?: string;
    note?: string;
    bias_1h?: string;
};

type GateEntry = {
    status?: string;
    status_th?: string;
    reason_th?: string;
    hint_th?: string;
    hint?: string;
    entry_zone?: [number, number] | { low?: number; high?: number } | null;
    sl?: number | null;
    tp1?: number | null;
    why?: string;
    why_th?: string;
};

type OBGate = any;
type PlanStatusResp = CtxPlanStatusResp;
type Props = { obGate?: OBGate | null };


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
function fmtTs(ms: number | null) {
    if (!ms) return "—";
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return String(ms);
    }
}

function pickReasonAny(obj: any) {
    return (
        obj?.reason_th ??
        obj?.reason ??
        obj?.note_th ??
        obj?.note ??
        obj?.why_th ??
        obj?.why ??
        ""
    );
}

function normStatus(s?: string) {
    return String(s ?? "").trim().toUpperCase();
}
function stageTone(status?: string) {
    const s = normStatus(status);
    if (s === "READY" || s === "CONFIRMED" || s === "PASS") {
        return {
            wrap: "border-emerald-500/30 bg-emerald-500/10",
            dot: "bg-emerald-400",
            title: "text-emerald-100",
            sub: "text-emerald-200/80",
            badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
        };
    }
    if (s.includes("WAIT") || s.includes("PENDING")) {
        return {
            wrap: "border-amber-500/30 bg-amber-500/10",
            dot: "bg-amber-400",
            title: "text-amber-100",
            sub: "text-amber-200/80",
            badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        };
    }
    if (s.includes("BLOCK") || s.includes("FAIL") || s.includes("INVALID") || s.includes("NO") || s.includes("MISSING")) {
        return {
            wrap: "border-rose-500/30 bg-rose-500/10",
            dot: "bg-rose-400",
            title: "text-rose-100",
            sub: "text-rose-200/80",
            badge: "border-rose-500/30 bg-rose-500/10 text-rose-200",
        };
    }
    return {
        wrap: "border-white/10 bg-white/5",
        dot: "bg-white/25",
        title: "text-neutral-100",
        sub: "text-neutral-400",
        badge: "border-neutral-700 bg-white/5 text-neutral-300",
    };
}

function noteTH(node?: { note_th?: string; note?: string }) {
    return node?.note_th ?? node?.note ?? "";
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
function fmt1(n: number | null | undefined) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}
function normalizeZone(z: any): [number, number] | null {
    if (!z) return null;
    if (Array.isArray(z) && typeof z[0] === "number" && typeof z[1] === "number") return [z[0], z[1]];
    if (typeof z === "object") {
        const lo = z.low ?? z.l ?? z.min;
        const hi = z.high ?? z.h ?? z.max;
        if (typeof lo === "number" && typeof hi === "number") return [lo, hi];
    }
    return null;
}
function fmtZone(z: any) {
    const zz = normalizeZone(z);
    if (!zz) return "—";
    const lo = Math.min(zz[0], zz[1]);
    const hi = Math.max(zz[0], zz[1]);
    return `${fmt1(lo)}–${fmt1(hi)}`;
}
function biasTone(b?: string) {
    const s = String(b ?? "").toUpperCase();
    if (s.includes("LONG") || s.includes("BULL")) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    if (s.includes("SHORT") || s.includes("BEAR")) return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    if (s.includes("RANGE") || s.includes("NEUTRAL")) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    return "border-neutral-700 bg-white/5 text-neutral-300";
}

function gateMarkFromNode(node: any) {
    const raw = String(node?.status ?? node?.status_th ?? "").toUpperCase();

    if (!raw || raw === "UNKNOWN") return "•";
    if (raw === "READY" || raw === "CONFIRMED") return "🟢";
    if (raw === "PASS" || raw === "OK" || raw === "DONE") return "✅";
    if (raw.includes("WAIT") || raw.includes("PENDING")) return "⏳";
    if (raw.includes("BLOCK") || raw.includes("FAIL") || raw.includes("INVALID") || raw.includes("MISSING") || raw.includes("NO")) return "❌";
    return "•";
}

function shortStatusLabel(raw?: string) {
    const s = normStatus(raw);
    if (!s || s === "UNKNOWN") return "—";
    if (s === "READY") return "READY";
    if (s === "CONFIRMED") return "CONFIRM";
    if (s === "PASS" || s === "OK" || s === "DONE") return "PASS";
    if (s.includes("WAIT") || s.includes("PENDING")) return "WAIT";
    if (s.includes("BLOCK")) return "BLOCK";
    if (s.includes("FAIL") || s.includes("INVALID") || s.includes("MISSING") || s.includes("NO")) return "FAIL";
    return s.length > 10 ? s.slice(0, 10) : s;
}
function compactBias(bias?: string) {
    const s = String(bias ?? "").toUpperCase();
    if (!s) return "—";
    if (s.includes("LONG") || s.includes("BULL")) return "LONG";
    if (s.includes("SHORT") || s.includes("BEAR")) return "SHORT";
    if (s.includes("RANGE") || s.includes("NEUTRAL")) return "RANGE";
    return s.length > 10 ? s.slice(0, 10) : s;
}

function fmtBr(n: any) {
    // bracket-friendly number
    if (typeof n !== "number" || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function fmtZoneBr(z: any) {
    const zz = normalizeZone(z);
    if (!zz) return "—";
    const lo = Math.min(zz[0], zz[1]);
    const hi = Math.max(zz[0], zz[1]);
    return `${fmtBr(lo)}–${fmtBr(hi)}`;
}

function buildNextAction(args: {
    mappedGates: any;
    entry: any;
    entryZone: any;
    entrySL: any;
    entryTP1: any;
}) {
    const { mappedGates, entry, entryZone, entrySL, entryTP1 } = args;

    const e = normStatus(entry?.status ?? entry?.status_th);
    const touch = normStatus(mappedGates?.touch?.status ?? mappedGates?.touch?.status_th);
    const sweep = normStatus(mappedGates?.sweep?.status ?? mappedGates?.sweep?.status_th);
    const reclaim = normStatus(mappedGates?.reclaim?.status ?? mappedGates?.reclaim?.status_th);
    const choch = normStatus(mappedGates?.choch?.status ?? mappedGates?.choch?.status_th);
    const m5 = normStatus(mappedGates?.m5?.status ?? mappedGates?.m5?.status_th);
    if (m5.includes("MISSING")) return { tone: "WARN", text: "NEXT: ข้อมูล 5m หาย — รอ data กลับมาก่อน" };

    if (e === "READY" || e === "CONFIRMED") {
        return {
            tone: "GOOD",
            text: `ENTRY OK: Z[${fmtZoneBr(entryZone)}] SL[${fmtBr(entrySL)}] TP1[${fmtBr(entryTP1)}]`,
        };
    }
    // ไล่เป็น “ขั้นถัดไป” แบบบังคับสายตา
    if (!touch || touch.includes("WAIT") || touch.includes("PENDING")) return { tone: "WAIT", text: "NEXT: รอ Touch โซน 1H" };
    if (!sweep || sweep.includes("WAIT") || sweep.includes("PENDING")) return { tone: "WAIT", text: "NEXT: รอ Sweep (เก็บ liquidity)" };
    if (!reclaim || reclaim.includes("WAIT") || reclaim.includes("PENDING")) return { tone: "WAIT", text: "NEXT: รอ Reclaim กลับเข้าโซน" };
    if (!choch || choch.includes("WAIT") || choch.includes("PENDING")) return { tone: "WAIT", text: "NEXT: รอ CHOCH ยืนยัน" };

    return { tone: "WAIT", text: "NEXT: รอ Entry permission" };
}

function buildDecisionBanner(args: {
    staleLevel: string;
    nextAction: { tone: string; text: string };
    entry: any;
    mappedGates: any;
}) {
    const { staleLevel, nextAction, entry, mappedGates } = args;

    const e = normStatus(entry?.status ?? entry?.status_th);

    // 1) READY = เข้าได้
    if (e === "READY" || e === "CONFIRMED") {
        return {
            tone: "GOOD",
            title: "✅ ENTRY READY",
            subtitle: "ทำตามแผนได้เลย (เช็ค execution อีกครั้งก่อนกด)",
        };
    }

    // 2) ข้อมูล stale มาก = หยุดก่อน
    if (staleLevel === "BAD") {
        return {
            tone: "BAD",
            title: "⚠️ DATA STALE",
            subtitle: "ข้อมูลเก่าเกินไป — รอรอบใหม่ก่อนตัดสินใจ",
        };
    }

    // 3) data หาย
    const m5 = normStatus(mappedGates?.m5?.status ?? mappedGates?.m5?.status_th);
    if (m5.includes("MISSING")) {
        return {
            tone: "WARN",
            title: "⏳ WAIT DATA",
            subtitle: "5m หาย — รอ data กลับมาก่อน",
        };
    }

    // 4) default = WAIT
    return {
        tone: nextAction.tone === "WARN" ? "WARN" : "WAIT",
        title: "⏳ WAIT",
        subtitle: nextAction.text,
    };
}

function buildOBGateOneLinerDetailed(args: {
    mappedGates: any;
    entryZone: any;
    entrySL: any;
    entryTP1: any;
}) {
    const { mappedGates, entryZone, entrySL, entryTP1 } = args;

    const h1 = mappedGates?.h1 ?? {};
    const entry = mappedGates?.entry ?? {};
    const meta = mappedGates?.meta ?? {};

    const biasRaw = String(meta?.bias_1h ?? h1?.bias_1h ?? "");
    const bias = compactBias(biasRaw);

    const T = gateMarkFromNode(mappedGates?.touch);
    const S = gateMarkFromNode(mappedGates?.sweep);
    const R = gateMarkFromNode(mappedGates?.reclaim);
    const C = gateMarkFromNode(mappedGates?.choch);

    const entryStatusRaw = String(entry?.status ?? entry?.status_th ?? "—");
    const e = shortStatusLabel(entryStatusRaw);

    const z = fmtZoneBr(entryZone);
    const sl = fmtBr(typeof entrySL === "number" ? entrySL : NaN);
    const tp1 = fmtBr(typeof entryTP1 === "number" ? entryTP1 : NaN);

    return `OB[${bias}] | G:T${T} S${S} R${R} C${C} | E[${e}] | Z[${z}] SL[${sl}] TP1[${tp1}]`;
}

function activeIndex(h1?: string, m5?: string, entry?: string) {
    const e = normStatus(entry);
    const m = normStatus(m5);
    const h = normStatus(h1);

    if (e === "READY" || e === "CONFIRMED") return 2;
    if (m.includes("WAIT") || m.includes("PENDING")) return 1;
    if (m === "READY" || m === "CONFIRMED") return 1;
    if (h) return 0;
    return 0;
}

function StepCard(props: { active: boolean; name: string; status: string; note?: string; badgeRaw?: string; mark?: string }) {
    const t = stageTone(props.badgeRaw ?? props.status);
    const ring = props.active ? "ring-2 ring-white/25 shadow-[0_0_0_2px_rgba(255,255,255,0.06)]" : "";

    return (
        <div className={`rounded-2xl border p-3 ${t.wrap} ${ring} min-w-0 overflow-hidden`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                        <div className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
                    </div>

                    <div className="min-w-0">
                        <div className={`text-xs font-semibold ${t.title} truncate flex items-center gap-1`}>
                            {props.mark ? <span>{props.mark}</span> : null}
                            <span>{props.name}</span>
                        </div>

                        <div className={`mt-0.5 text-sm ${t.sub} truncate`}>{props.status}</div>

                        {props.note ? <div className="mt-1 text-[11px] text-neutral-400 break-words line-clamp-2">{props.note}</div> : null}
                    </div>
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${t.badge}`}>
                    {shortStatusLabel(props.badgeRaw ?? "") || "—"}
                </span>
            </div>
        </div>
    );
}

function GateChip({ label, node }: { label: string; node?: GateNode }) {
    const st = node?.status_th ?? node?.status ?? "—";
    const raw = node?.status ?? node?.status_th ?? "—";
    const t = stageTone(raw);
    const mark = gateMarkFromNode(node);

    return (
        <div className={`rounded-xl border px-3 py-2 ${t.wrap} min-w-0`}>
            <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1">
                    <span>{mark}</span>
                    <span>{label}</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${t.badge}`}>
                    {shortStatusLabel(raw)}
                </span>
            </div>
            <div className={`mt-0.5 text-xs ${t.title} truncate`}>{st}</div>
            {noteTH(node) ? <div className="mt-1 text-[11px] text-neutral-400 line-clamp-2">{noteTH(node)}</div> : null}
        </div>
    );
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

export default function OBGateCard({ obGate: obGateProp = null }: Props) {

    const ctx = usePlanStatusOptional();
    const usingProp = !!obGateProp;


    // local fallback
    const [rawLocal, setRawLocal] = useState<PlanStatusResp | null>(null);
    const [errLocal, setErrLocal] = useState<string | null>(null);
    const [fetchedAtLocal, setFetchedAtLocal] = useState<number | null>(null);
    const [nowLocal, setNowLocal] = useState(() => Date.now());
    const [copied, setCopied] = useState(false);


    useEffect(() => {
        if (ctx || usingProp) return;
        const id = setInterval(() => setNowLocal(Date.now()), 1000);
        return () => clearInterval(id);
    }, [ctx, usingProp]);


    useEffect(() => {
        if (ctx || usingProp) return;

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
    }, [ctx, usingProp]);


    const raw = usingProp ? ({ ok: true, ob_gate: obGateProp } as any) : (ctx?.data ?? rawLocal);
    const err = usingProp ? null : (ctx?.error ?? errLocal);
    const fetchedAt = usingProp ? null : (ctx?.fetchedAt ?? fetchedAtLocal);
    const now = ctx?.now ?? nowLocal;


    const ob = useMemo(() => obGateProp ?? (raw as any)?.ob_gate ?? (raw as any)?.planStatus?.ob_gate ?? null, [obGateProp, raw]);
    // ✅ gates normalized (ต้องอยู่ก่อนพวก early-return)
    const mappedGates = useMemo(() => mapAllGates(((ob ?? {}) as any)), [ob]);

    // const oneLiner = useMemo(() => buildOBGateOneLiner(mappedGates), [mappedGates]);


    const sourceUpdatedAtMs = useMemo(() => {
        return toMs((raw as any)?.source_updated_at ?? null) ?? toMs((raw as any)?.updated_at ?? null) ?? null;
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

    if (err) {
        return <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">โหลด OB Gate ไม่ได้: {err}</div>;
    }
    if (!raw) {
        return <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">กำลังโหลด OB Gate…</div>;
    }
    if (!ob) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                <div className="text-sm font-semibold text-neutral-100">OB Gate</div>
                <div className="mt-1 text-sm text-neutral-400">/api/plan-status ยังไม่ส่ง ob_gate มา</div>
            </div>
        );
    }

    // ---- consume from “single contract” (mapAllGates) ----
    const h1 = mappedGates.h1;
    const m5 = mappedGates.m5;
    const entry = (mappedGates.entry ?? {}) as GateEntry;

    const h1ObZone = h1.zone ?? null;
    const h1ObNote = String(h1.note_th ?? h1.note ?? "");
    const bias1h = String(mappedGates.meta.bias_1h ?? "").toUpperCase();

    const entryZone = entry.entry_zone ?? pick(entry as any, ["entry_zone", "zone", "entryZone"]);
    const entrySL = entry.sl ?? pick(entry as any, ["sl", "stop", "stop_loss"]);
    const entryTP1 = entry.tp1 ?? pick(entry as any, ["tp1", "target1", "t1"]);
    const entryWhy = String(entry.why_th ?? entry.why ?? pick(entry as any, ["why_th", "why", "reason_th", "reason"]) ?? "");

    const sourceKey =
        (raw as any)?.source_updated_at != null
            ? "source_updated_at"
            : (raw as any)?.updated_at != null
                ? "updated_at"
                : "missing";

    const reasonText =
        pickReasonAny((mappedGates as any)?.meta) ||
        pickReasonAny((ob as any)) ||
        ""; // ถ้ามี reason จาก meta/ob จะโชว์

    const oneLiner = buildOBGateOneLinerDetailed({
        mappedGates,
        entryZone,
        entrySL: typeof entrySL === "number" ? entrySL : null,
        entryTP1: typeof entryTP1 === "number" ? entryTP1 : null,
    });

    const nextAction = buildNextAction({
        mappedGates,
        entry,
        entryZone,
        entrySL: typeof entrySL === "number" ? entrySL : NaN,
        entryTP1: typeof entryTP1 === "number" ? entryTP1 : NaN,
    });

    const banner = buildDecisionBanner({
        staleLevel,
        nextAction,
        entry,
        mappedGates,
    });



    // ✅ map real gates (normalized)
    const gTouch = mappedGates.touch;
    const gSweep = mappedGates.sweep;
    const gReclaim = mappedGates.reclaim;
    const gChoch = mappedGates.choch;

    // pipeline (dynamic)
    const stage1Status = h1.status_th ?? h1.status ?? "—";
    const stage2Status = m5.status_th ?? m5.status ?? "—";
    const stage3Status = entry.status_th ?? entry.status ?? "—";

    const entryRaw = entry.status ?? entry.status_th;
    const active = activeIndex(h1.status, m5.status, entry.status);
    const isReady = normStatus(entry.status) === "READY" || normStatus(entry.status) === "CONFIRMED";

    const title = String(mappedGates.meta.title_th ?? (ob as any)?.title_th ?? "OB Gate");
    const subtitle = String(mappedGates.meta.subtitle_th ?? (ob as any)?.subtitle_th ?? "1H ให้โซน — 5m ต้องทำอะไรถึงเข้าได้");

    async function onCopy() {
        try {
            await navigator.clipboard?.writeText(oneLiner);
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
        } catch {
            // fallback เผื่อบาง browser/permission
            try {
                const ta = document.createElement("textarea");
                ta.value = oneLiner;
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
            } catch {
                // เงียบไว้ก่อน ไม่ทำ UI พัง
            }
        }
    }


    return (
        <div className="rounded-2xl bg-neutral-900 p-5 space-y-4 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm text-neutral-100 font-semibold flex flex-wrap items-center gap-2">
                        <span className="truncate">{title}</span>

                        {isReady && (
                            <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                                🔥 READY
                            </span>
                        )}

                        {bias1h && (
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${biasTone(bias1h)}`}>
                                bias: {bias1h}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400 break-words">{subtitle}</div>
                    <div
                        className={`mt-2 rounded-2xl border px-4 py-3 ${banner.tone === "GOOD"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            : banner.tone === "BAD"
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                                : banner.tone === "WARN"
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                                    : "border-white/10 bg-white/5 text-neutral-100"
                            }`}
                    >
                        <div className="text-sm font-semibold">{banner.title}</div>
                        <div className="mt-0.5 text-[12px] opacity-90">{banner.subtitle}</div>

                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                Z: {fmtZone(entryZone)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                SL: {fmt1(typeof entrySL === "number" ? entrySL : null)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                                TP1: {fmt1(typeof entryTP1 === "number" ? entryTP1 : null)}
                            </span>
                        </div>
                    </div>

                    <div
                        className={`mt-2 rounded-xl border px-4 py-3 ${nextAction.tone === "GOOD"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            : nextAction.tone === "WARN"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                                : "border-white/10 bg-white/5 text-neutral-100"
                            }`}
                    >
                        <div className="text-[11px] text-neutral-400">Next action</div>
                        <div className="mt-0.5 text-sm font-semibold">{nextAction.text}</div>
                    </div>


                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onCopy}
                            title={oneLiner}
                            className="text-left text-[11px] text-neutral-300/80 font-mono hover:text-neutral-200 max-w-full truncate"
                        >
                            {oneLiner}
                        </button>

                        <button
                            type="button"
                            className={`rounded-full border px-2 py-0.5 text-[11px] hover:bg-white/10 ${copied
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                : "border-neutral-700 bg-neutral-950/40 text-neutral-200"
                                }`}
                            onClick={onCopy}
                            title="Copy summary"
                        >
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
                            <span className="font-mono">
                                source_key: <span className="text-neutral-300">{sourceKey}</span>
                            </span>

                            <span className="font-mono">
                                source_ts: <span className="text-neutral-300">{fmtTs(sourceUpdatedAtMs)}</span>
                            </span>

                            <span className="font-mono">
                                source_age:{" "}
                                <span
                                    className={
                                        staleLevel === "BAD"
                                            ? "text-rose-300"
                                            : staleLevel === "WARN"
                                                ? "text-amber-300"
                                                : "text-emerald-300"
                                    }
                                >
                                    {fmtAgo(candleAgeSec)}
                                </span>
                            </span>

                            <span className="font-mono">
                                card_age: <span className="text-neutral-300">{fmtAgo(fetchAgeSec)}</span>
                            </span>

                            <span className="font-mono">
                                from: <span className="text-neutral-300">{usingProp ? "prop" : ctx ? "context" : "local-fetch"}</span>
                            </span>
                        </div>

                        {reasonText ? (
                            <div className="mt-1 text-[11px] text-neutral-300/90 break-words">
                                <span className="text-neutral-500">reason:</span> {reasonText}
                            </div>
                        ) : null}

                        {!sourceUpdatedAtMs ? (
                            <div className="mt-1 text-[11px] text-amber-200/90">
                                ⚠️ source timestamp missing → freshness อาจเชื่อถือไม่ได้ (API ไม่ส่ง source_updated_at/updated_at)
                            </div>
                        ) : null}
                    </div>

                </div>

                <div className="text-right text-[11px] text-neutral-500 shrink-0">
                    <div>Card Fresh: {fmtAgo(fetchAgeSec)}</div>
                    <div>Source Fresh: {fmtAgo(candleAgeSec)}</div>
                </div>
            </div>

            <details className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer select-none text-xs text-neutral-300 hover:text-neutral-100">
                    ดูรายละเอียด (gates / steps / notes)
                </summary>

                <div className="mt-3 space-y-4">
                    {/* (แนะนำ) ย้าย stale warning มาไว้ในรายละเอียดด้วย จะไม่ซ้ำกับ banner */}
                    {staleLevel !== "OK" && (
                        <div
                            className={`rounded-xl border px-4 py-3 ${staleLevel === "BAD"
                                    ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                                }`}
                        >
                            <div className="text-xs font-semibold">
                                {staleLevel === "BAD" ? "⚠️ Data stale มาก" : "⏳ Data เริ่มเก่า"} — ตัดสินใจด้วยความระวัง
                            </div>
                            <div className="mt-1 text-[11px] opacity-80">Source age: {fmtAgo(candleAgeSec)}</div>
                        </div>
                    )}

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 min-w-0 overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-neutral-400">1H OB Zone</div>
                            <span className="rounded-full border border-neutral-700 bg-neutral-950/40 px-2 py-0.5 text-[11px] text-neutral-300">
                                zone: {fmtZone(h1ObZone)}
                            </span>
                        </div>
                        {h1ObNote ? (
                            <div className="mt-2 text-sm text-neutral-100 break-words whitespace-pre-wrap">{h1ObNote}</div>
                        ) : (
                            <div className="mt-2 text-sm text-neutral-400">—</div>
                        )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-4 min-w-0 overflow-hidden">
                        <div className="text-xs text-neutral-400">SMC Gates (touch → sweep → reclaim → choch)</div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <GateChip label="Touch" node={gTouch} />
                            <GateChip label="Sweep" node={gSweep} />
                            <GateChip label="Reclaim" node={gReclaim} />
                            <GateChip label="CHOCH" node={gChoch} />
                        </div>
                    </div>

                    <div className="relative">
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                            <StepCard
                                active={active === 0}
                                name="1H • Zone"
                                status={stage1Status}
                                note={h1ObNote || undefined}
                                badgeRaw={h1.status}
                                mark="🧭"
                            />
                            <StepCard
                                active={active === 1}
                                name="5m • Confirm"
                                status={stage2Status}
                                note={String(m5.note_th ?? m5.note ?? "") || undefined}
                                badgeRaw={m5.status}
                                mark="🧪"
                            />
                            <StepCard
                                active={active === 2}
                                name="Entry • Permission"
                                status={stage3Status}
                                note={entryWhy || undefined}
                                badgeRaw={entry.status}
                                mark="🎯"
                            />
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 min-w-0 overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-neutral-400">Entry Details</div>
                            <span className="rounded-full border border-neutral-700 bg-neutral-950/40 px-2 py-0.5 text-[11px] text-neutral-300">
                                status: {shortStatusLabel(entryRaw ?? stage3Status)}
                            </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-neutral-700 bg-neutral-950/40 px-3 py-1 text-neutral-200">
                                entry_zone: {fmtZone(entryZone)}
                            </span>
                            <span className="rounded-full border border-neutral-700 bg-neutral-950/40 px-3 py-1 text-neutral-200">
                                SL: {fmt1(typeof entrySL === "number" ? entrySL : null)}
                            </span>
                            <span className="rounded-full border border-neutral-700 bg-neutral-950/40 px-3 py-1 text-neutral-200">
                                TP1: {fmt1(typeof entryTP1 === "number" ? entryTP1 : null)}
                            </span>
                        </div>

                        {entryWhy ? (
                            <div className="mt-2 text-sm text-neutral-100 break-words whitespace-pre-wrap">{entryWhy}</div>
                        ) : (
                            <div className="mt-2 text-sm text-neutral-400">—</div>
                        )}
                    </div>
                </div>
            </details>

        </div>
    );
}
