"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  if (!ts || !Number.isFinite(ts)) return null;
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

function stableSignature(j: any) {
  try {
    return JSON.stringify({
      updated_at: j?.updated_at ?? null,
      source_updated_at: j?.source_updated_at ?? null,
      deriv_updated_at:
        j?.derivatives?.updated_at ??
        j?.deriv?.updated_at ??
        j?.planStatus?.derivatives?.updated_at ??
        j?.planStatus?.deriv?.updated_at ??
        null,
      oi_status:
        j?.derivatives?.oi?.status ??
        j?.deriv?.oi?.status ??
        j?.planStatus?.derivatives?.oi?.status ??
        j?.planStatus?.deriv?.oi?.status ??
        null,
      funding_status:
        j?.derivatives?.funding?.status ??
        j?.deriv?.funding?.status ??
        j?.planStatus?.derivatives?.funding?.status ??
        j?.planStatus?.deriv?.funding?.status ??
        null,
      oi_now:
        j?.derivatives?.oi?.now ??
        j?.deriv?.oi?.now ??
        j?.planStatus?.derivatives?.oi?.now ??
        j?.planStatus?.deriv?.oi?.now ??
        null,
      funding_now:
        j?.derivatives?.funding?.now ??
        j?.deriv?.funding?.now ??
        j?.planStatus?.derivatives?.funding?.now ??
        j?.planStatus?.deriv?.funding?.now ??
        null,
    });
  } catch {
    return String(Date.now());
  }
}

function resolveRawSource(ctxData: any, localData: any) {
  if (ctxData) {
    return {
      sourceKind: "context" as const,
      raw: ctxData,
    };
  }

  return {
    sourceKind: "local-fetch" as const,
    raw: localData,
  };
}

function resolveDerivatives(raw: any) {
  return pick(raw as any, ["derivatives", "deriv", "planStatus.derivatives", "planStatus.deriv"]) ?? null;
}

function resolveDerivativeFreshness(derivatives: any, now: number) {
  const tag =
    pick(derivatives, ["freshness.tag"]) ??
    pick(derivatives, ["source.freshness.tag"]) ??
    "UNKNOWN";

  const ageFromField = pick(derivatives, ["freshness.ageSec"]);
  if (typeof ageFromField === "number") {
    return { tag: String(tag), ageSec: ageFromField };
  }

  const upd = pick(derivatives, ["updated_at"]);
  const updMs = typeof upd === "number" ? toMs(upd) : null;
  if (updMs) {
    return {
      tag: String(tag),
      ageSec: Math.max(0, Math.floor((now - updMs) / 1000)),
    };
  }

  return { tag: String(tag), ageSec: null as number | null };
}

function staleLevelFrom(tag: string, ageSec: number | null) {
  const t = normUpper(tag);
  if (t === "FRESH") return "OK";
  if (t === "STALE") return "WARN";
  if (t === "OLD") return "BAD";

  if (ageSec == null) return "UNKNOWN";
  if (ageSec >= STALE_BAD_SEC) return "BAD";
  if (ageSec >= STALE_WARN_SEC) return "WARN";
  return "OK";
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
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-100">{title}</div>
          <div className="mt-1 break-words text-xs text-neutral-400">
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
        <div className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-200">{String(reason)}</div>
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

  const [rawLocal, setRawLocal] = useState<PlanStatusResp | null>(null);
  const [errLocal, setErrLocal] = useState<string | null>(null);
  const [fetchedAtLocal, setFetchedAtLocal] = useState<number | null>(null);
  const [nowLocal, setNowLocal] = useState(() => Date.now());

  const mountedRef = useRef(false);
  const requestSeqRef = useRef(0);
  const inflightRef = useRef(false);
  const lastSigRef = useRef<string | null>(null);

  const usingCtx = !!ctx;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (usingCtx) return;
    const id = setInterval(() => setNowLocal(Date.now()), 1000);
    return () => clearInterval(id);
  }, [usingCtx]);

  useEffect(() => {
    if (usingCtx) return;

    async function load() {
      if (inflightRef.current) return;
      inflightRef.current = true;
      const seq = ++requestSeqRef.current;

      try {
        const res = await fetchWithFallback("/api/plan-status");
        if (!res.ok) throw new Error(`plan-status http ${res.status}`);
        const j = (await res.json()) as PlanStatusResp;
        if (!j?.ok) throw new Error("plan-status not ok");

        if (!mountedRef.current) return;
        if (seq !== requestSeqRef.current) return;

        const sig = stableSignature(j);
        if (sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          setRawLocal(j);
        }

        setFetchedAtLocal(Date.now());
        setErrLocal(null);
      } catch (e: any) {
        if (!mountedRef.current) return;
        if (seq !== requestSeqRef.current) return;
        setErrLocal(e?.message ?? "failed to load");
      } finally {
        if (seq === requestSeqRef.current) {
          inflightRef.current = false;
        }
      }
    }

    void load();
    const id = setInterval(() => {
      void load();
    }, POLL_MS);

    return () => {
      clearInterval(id);
    };
  }, [usingCtx]);

  const resolved = useMemo(() => resolveRawSource(ctx?.data ?? null, rawLocal), [ctx?.data, rawLocal]);

  const raw = resolved.raw;
  const err = ctx?.error ?? errLocal;
  const fetchedAt = ctx?.fetchedAt ?? fetchedAtLocal ?? null;
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

  const derivatives = useMemo(() => resolveDerivatives(raw), [raw]);

  const derivFresh = useMemo(() => resolveDerivativeFreshness(derivatives, now), [derivatives, now]);

  const staleLevel = useMemo(() => staleLevelFrom(derivFresh.tag, derivFresh.ageSec), [derivFresh]);

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

  if (err && !raw) {
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
        <div className="mt-2 text-[11px] text-neutral-500">
          source: <span className="text-neutral-300">{resolved.sourceKind}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-hidden rounded-2xl bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-neutral-100">Derivatives</div>

            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${tagTone(String(derivFresh.tag))}`}>
              {String(derivFresh.tag)}
              {typeof derivFresh.ageSec === "number" ? ` • ${derivFresh.ageSec}s` : ""}
            </span>

            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${staleTone(staleLevel)}`}>
              stale: {staleLevel}
            </span>
          </div>

          <div className="mt-1 break-words text-xs text-neutral-400">
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

          <div className="mt-1 break-words text-xs text-neutral-500">{mini}</div>

          {crowd?.note ? (
            <div className="mt-1 whitespace-pre-wrap break-words text-xs text-neutral-500">{String(crowd.note)}</div>
          ) : null}

          <div className="mt-2 text-[11px] text-neutral-500">
            source: <span className="text-neutral-300">{resolved.sourceKind}</span>
          </div>
        </div>

        <div className="shrink-0 text-right text-[11px] text-neutral-500">
          <div>Card Fresh: {fmtAgo(fetchAgeSec)}</div>
          <div>Plan Fresh: {fmtAgo(planAgeSec)}</div>
        </div>
      </div>

      {staleLevel !== "OK" && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            staleLevel === "BAD"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100"
          }`}
        >
          <div className="text-xs font-semibold">
            {staleLevel === "BAD" ? "⚠️ Derivatives stale มาก" : "⏳ Derivatives เริ่มเก่า"}
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            age: {fmtAgo(derivFresh.ageSec)} • OI/Funding อาจเป็น “อดีตที่หลอกเรา”
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetaBlock title="Open Interest (OI)" meta={oiMeta} dpNow={0} />
        <MetaBlock title="Funding" meta={fundMeta} dpNow={6} nowFmt={fmtFundingSmart} />
      </div>

      {err && raw && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          รีเฟรชล่าสุดมีปัญหา: {err}
        </div>
      )}
    </div>
  );
}