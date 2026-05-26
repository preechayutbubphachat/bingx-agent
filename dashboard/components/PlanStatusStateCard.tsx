"use client";

import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/apiBase";

const POLL_MS = 10_000;
const STALE_WARN_SEC = 180;
const STALE_BAD_SEC = 420;

type PlanStatusResp = {
  ok: boolean;
  source_updated_at?: number;
  updated_at?: number;
  plan_status_state?: any;
  planStatusState?: any;
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
  if (s === "PASS" || s === "DONE" || s === "READY") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (s === "WARN" || s.includes("WAIT")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (s === "FAIL" || s.includes("INVALID") || s.includes("BLOCK")) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  }
  return "border-neutral-700 bg-white/5 text-neutral-300";
}

function getPath(obj: any, path: string): any {
  try {
    return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
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
  } catch (error) {
    if (url !== path) return await fetch(path, { cache: "no-store" });
    throw error;
  }
}

export default function PlanStatusStateCard() {
  const [raw, setRaw] = useState<PlanStatusResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function load(silent = false) {
    try {
      if (!silent) setRefreshing(true);

      const res = await fetchWithFallback("/api/plan-status");
      if (!res.ok) throw new Error(`plan-status http ${res.status}`);

      const json = (await res.json()) as PlanStatusResp;
      if (!json?.ok) throw new Error("plan-status not ok");

      setRaw(json);
      setFetchedAt(Date.now());
      setErr(null);
    } catch (error: any) {
      setErr(error?.message ?? "failed to load");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(id);
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
    return (
      pick(raw as any, [
        "plan_status_state",
        "planStatusState",
        "planStatus.plan_status_state",
        "planStatus.planStatusState",
      ]) ?? null
    );
  }, [raw]);

  const state = ps?.state ?? {};
  const steps: any[] = Array.isArray(ps?.steps) ? ps.steps : [];
  const nextActions: string[] = Array.isArray(ps?.next_actions) ? ps.next_actions : [];
  const plan = ps?.plan ?? {};

  if (err && !raw) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
        โหลด Plan Status State ไม่ได้: {err}
      </div>
    );
  }

  if (!raw) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        กำลังโหลด Plan Status State…
      </div>
    );
  }

  if (!ps) {
    return (
      <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
        <div className="text-sm font-semibold text-neutral-100">Plan Status State</div>
        <div className="mt-1 text-sm text-neutral-400">/api/plan-status ยังไม่ส่ง plan_status_state มา</div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
            ดู key ใน payload (debug)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-300">
            {JSON.stringify(Object.keys(raw ?? {}), null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-hidden rounded-2xl bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-100">
            <span className="truncate">Plan Status State</span>
            {state?.code ? (
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${pillTone(state?.status ?? state?.code)}`}>
                {String(state.code)}
              </span>
            ) : null}
            {plan?.market_mode ? (
              <span className="shrink-0 rounded-full border border-neutral-700 bg-white/5 px-2 py-0.5 text-xs text-neutral-300">
                {String(plan.market_mode)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 break-words text-sm font-medium text-neutral-100">
            {String(state?.headline ?? "—")}
          </div>

          <div className="mt-1 break-words text-xs text-neutral-400">
            hint: {String(state?.direction_hint ?? "—")} • conf: {String(state?.confidence ?? "—")} • step_set:{" "}
            {String(state?.step_set ?? "—")}
          </div>
        </div>

        <div className="shrink-0 text-right text-[11px] text-neutral-500">
          <div>Card Fresh: {fmtAgo(fetchAgeSec)}</div>
          <div>Source Fresh: {fmtAgo(candleAgeSec)}</div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => load(false)}
              disabled={refreshing}
              className="rounded-md border border-white/10 px-2 py-1 text-neutral-200 hover:bg-white/5 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
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
            {staleLevel === "BAD" ? "⚠️ Data stale มาก" : "⏳ Data เริ่มเก่า"}
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            Source age: {fmtAgo(candleAgeSec)} • เวลาไม่สด แผนก็อาจ “เปลี่ยนใจ” ได้
          </div>
        </div>
      )}

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
                      <div className="truncate text-sm font-medium text-neutral-100">{String(title)}</div>
                      {why ? <div className="mt-1 break-words text-xs text-neutral-400">{String(why)}</div> : null}
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

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs text-neutral-400">Next actions</div>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-neutral-200">
          {nextActions.length ? nextActions.map((a, i) => <li key={i}>{a}</li>) : <li className="text-neutral-400">—</li>}
        </ul>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
          ดู plan_status_state (debug)
        </summary>
        <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
          {JSON.stringify(ps, null, 2)}
        </pre>
      </details>

      {err && raw && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          รีเฟรชล่าสุดมีปัญหา: {err}
        </div>
      )}
    </div>
  );
}