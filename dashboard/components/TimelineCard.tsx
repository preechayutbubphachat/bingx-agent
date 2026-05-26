"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePlanStatusOptional } from "@/components/plan-status/PlanStatusProvider";
import type { LogItem } from "@/components/plan-steps/types";
import { apiUrl } from "@/lib/apiBase";

const POLL_MS = 10_000;

async function fetchWithFallback(path: string) {
  const url = apiUrl(path);
  try {
    return await fetch(url, { cache: "no-store" });
  } catch (error) {
    if (url !== path) return await fetch(path, { cache: "no-store" });
    throw error;
  }
}

function timeTH(ts: number) {
  return new Date(ts).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateTimeTH(ts: number) {
  return new Date(ts).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function dayLabelTH(ts: number) {
  return new Date(ts).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ymd(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function toMs(ts: number) {
  return ts < 1e12 ? ts * 1000 : ts;
}

function timeAgoTH(ts: number, now = Date.now()) {
  const diffSec = Math.max(0, Math.floor((now - toMs(ts)) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;

  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function eventIcon(e: LogItem) {
  const type = String(e.type ?? "").toUpperCase();
  const to = String(e.to ?? "").toUpperCase();

  if (type.includes("MODE_SWITCH")) return "🔁";
  if (type.includes("PLAN_UPDATED")) return "🧾";
  if (to.includes("SWEEP")) return "🧹";
  if (to.includes("REJECTION")) return "🪝";
  if (to.includes("FAKEOUT") || to.includes("RANGE_PLAY")) return "✅";
  if (to.includes("BREAKOUT")) return "🚀";
  if (to.includes("NO_TRADE") || to.includes("LOCKED")) return "🔒";
  return "•";
}

function oneLineSummary(e: LogItem) {
  if (e.explain_th && e.explain_th.trim().length) return e.explain_th.trim();

  const type = String(e.type ?? "").toUpperCase();
  const to = String(e.to ?? "").toUpperCase();

  if (type.includes("PLAN_UPDATED")) {
    const reason = (e as any)?.reason ?? "—";
    const target = (e as any)?.raw?.target_mode ?? (e as any)?.target_mode ?? "—";
    return `PLAN_UPDATED • reason=${reason} • target=${target}`;
  }

  if (to.includes("WAIT_SWEEP")) return "ยังไม่เข้าจังหวะ — รอให้กวาดบนก่อน";
  if (to.includes("WAIT_15M_REJECTION")) return "กวาดบนแล้ว — รอ 15m ปิดยืนยัน rejection";
  if (to.includes("WAIT_1H_CONFIRM")) return "15m ผ่านแล้ว — รอ 1H ยืนยัน fakeout/breakout";
  if (to.includes("FAKEOUT_CONFIRMED") || to.includes("RANGE_PLAY")) {
    return "ยืนยัน fakeout — กลับไปเล่นในกรอบ";
  }
  if (to.includes("BREAKOUT_CONFIRMED")) return "ยืนยัน breakout — ต้องเปลี่ยนโหมด";
  if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";

  return `สถานะเปลี่ยน → ${e.to}`;
}

function groupByDay(items: LogItem[]) {
  const sorted = [...items].sort((a, b) => b.t - a.t);
  const map = new Map<string, { label: string; items: LogItem[] }>();

  for (const item of sorted) {
    const key = ymd(item.t);
    if (!map.has(key)) {
      map.set(key, { label: dayLabelTH(item.t), items: [] });
    }
    map.get(key)!.items.push(item);
  }

  return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
}

type AnyObj = Record<string, any>;

function nfmt(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function pickView(d: AnyObj) {
  const pss = d?.plan_status_state ?? d?.planStatusState ?? d ?? {};
  const state = pss?.state ?? d?.state ?? {};
  const plan = pss?.plan ?? d?.plan ?? {};
  const price = pss?.price ?? d?.price ?? {};
  const steps = pss?.steps ?? [];
  const nextActions = pss?.next_actions ?? [];
  const obGate = d?.ob_gate ?? pss?.ob_gate ?? {};
  const entry = obGate?.entry ?? {};
  const crowd = d?.derivatives?.crowd ?? pss?.derivatives?.crowd ?? {};
  const explain = d?.explain_th ?? state?.headline ?? "";

  return { state, plan, price, steps, nextActions, entry, crowd, explain };
}

function primaryStatusLabel(entryStatus?: string, stateCode?: string) {
  const s = (entryStatus || stateCode || "").toUpperCase();
  if (s.includes("CONFIRM") || s.includes("READY")) return "CONFIRM";
  if (s.includes("WAIT")) return "WAIT";
  if (s.includes("WARN")) return "WARN";
  if (s.includes("FAIL") || s.includes("ERROR")) return "FAIL";
  return s || "—";
}

function badgeClass(kind: string) {
  switch (kind) {
    case "CONFIRM":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
    case "WAIT":
      return "bg-amber-500/15 text-amber-200 border-amber-500/20";
    case "WARN":
      return "bg-yellow-500/15 text-yellow-200 border-yellow-500/20";
    case "FAIL":
      return "bg-rose-500/15 text-rose-200 border-rose-500/20";
    default:
      return "bg-slate-500/10 text-slate-200 border-slate-500/20";
  }
}

function shortWhyToken(t: string) {
  switch (t.trim()) {
    case "wait_sweep_at_ob":
      return "ยังไม่ sweep ที่ OB";
    case "wait_reclaim_midrule":
      return "ยังไม่ reclaim ผ่าน mid-rule";
    case "wait_choch":
      return "ยังไม่เกิด CHOCH";
    case "wait_5m_ob":
      return "5m ยังไม่ยืนยัน OB";
    default:
      return t.replaceAll("_", " ");
  }
}

function stepStatusShort(s?: string) {
  const x = (s || "").toUpperCase();
  if (x.includes("DONE") || x.includes("OK") || x.includes("PASS")) return "OK";
  if (x.includes("WAIT")) return "WAIT";
  if (x.includes("WARN")) return "WARN";
  if (x.includes("FAIL")) return "FAIL";
  return x || "-";
}

function stepIdShort(id?: string) {
  switch ((id || "").toUpperCase()) {
    case "SWEEP_5M":
      return "5m sweep";
    case "REJECTION_15M":
      return "15m rej";
    case "CONFIRM_1H":
      return "1h conf";
    default:
      return (id || "").toLowerCase();
  }
}

function buildDecisionTrace(d: AnyObj) {
  const { steps, entry, nextActions, crowd } = pickView(d);

  const whyTokens: string[] =
    typeof entry?.why === "string"
      ? entry.why
          .split("|")
          .map((x: string) => x.trim())
          .filter(Boolean)
      : [];

  const whyPretty = whyTokens.map(shortWhyToken);

  const stepBits = Array.isArray(steps)
    ? steps.slice(0, 3).map((s: any) => `${stepIdShort(s?.id)}=${stepStatusShort(s?.status)}`)
    : [];

  const crowdBit = crowd?.crowd_th ? `crowd=${crowd.crowd_th}` : null;
  const humanReason = nextActions?.[0] ? `${nextActions[0]}` : null;

  return [humanReason, stepBits.length ? `steps: ${stepBits.join(" · ")}` : null, whyPretty.length ? `why: ${whyPretty.join(" · ")}` : null, crowdBit]
    .filter(Boolean)
    .join("  |  ");
}

function TopSummaryBar({ data }: { data: AnyObj }) {
  const { state, plan, price, entry, crowd, explain } = pickView(data);

  const status = primaryStatusLabel(entry?.status, state?.code);
  const conf = state?.confidence;
  const mode = plan?.market_mode;
  const px = price?.close_5m ?? price?.close_1h;
  const sweep = plan?.sweep_target?.zone ?? null;

  const sweepText =
    Array.isArray(sweep) && sweep.length === 2 ? `sweep ${nfmt(sweep[0])}–${nfmt(sweep[1])}` : null;

  const line = [
    explain || state?.headline || "-",
    sweepText,
    typeof px === "number" ? `px ${nfmt(px)}` : null,
    typeof conf === "number" ? `conf ${conf.toFixed(2)}` : null,
    mode ? `mode ${mode}` : null,
    crowd?.crowd_th ? `• ${crowd.crowd_th}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-white/10 bg-black/40 px-4 py-2 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`shrink-0 rounded border px-2 py-0.5 text-[12px] ${badgeClass(status)}`}>
          {status}
        </span>
        <div className="min-w-0 flex-1 truncate text-[13px] leading-5 text-slate-100" title={line}>
          {line}
        </div>
      </div>
    </div>
  );
}

function DecisionTrace({
  data,
  onCopy,
  copied,
}: {
  data: AnyObj;
  onCopy: () => void;
  copied: boolean;
}) {
  const trace = buildDecisionTrace(data);
  if (!trace) return null;

  return (
    <div className="-mx-4 border-b border-white/10 px-4 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 truncate text-[12px] leading-5 text-slate-300" title={trace}>
          <span className="text-slate-400">Decision Trace:</span>{" "}
          <span className="text-slate-200">{trace}</span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-200 hover:bg-white/5"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: LogItem }) {
  const icon = eventIcon(item);
  const ts = toMs(item.t);

  return (
    <div className="flex gap-3 rounded-xl px-1 py-1">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>{timeTH(ts)}</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-neutral-300">
            {timeAgoTH(ts)}
          </span>
        </div>
        <div className="mt-1 break-words text-sm text-neutral-200">{oneLineSummary(item)}</div>
        <div className="mt-1 text-[11px] text-neutral-500" title={dateTimeTH(ts)}>
          {dateTimeTH(ts)}
        </div>
      </div>
    </div>
  );
}

function logSig(x: LogItem) {
  return [
    String(x.type ?? ""),
    String(x.from ?? ""),
    String(x.to ?? ""),
    String((x as any).from_mode ?? ""),
    String((x as any).to_mode ?? ""),
    String((x as any).to_plan_state ?? ""),
  ]
    .join("|")
    .toUpperCase();
}

function dedupeConsecutive(source: LogItem[], windowSec = 30) {
  const sorted = [...source].sort((a, b) => toMs(b.t) - toMs(a.t));
  const out: LogItem[] = [];

  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last) {
      const same = logSig(item) === logSig(last);
      const close = Math.abs(toMs(item.t) - toMs(last.t)) <= windowSec * 1000;
      if (same && close) continue;
    }
    out.push(item);
  }

  return out;
}

function itemsSignature(items: LogItem[]) {
  try {
    return JSON.stringify(
      items.slice(0, 100).map((x) => ({
        t: x.t,
        type: x.type ?? null,
        from: x.from ?? null,
        to: x.to ?? null,
        explain_th: x.explain_th ?? null,
      }))
    );
  } catch {
    return String(items.length);
  }
}

export default function TimelineCard({ className = "" }: { className?: string }) {
  const ctx = usePlanStatusOptional();

  const [items, setItems] = useState<LogItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const inflightRef = useRef(false);
  const lastItemsSigRef = useRef<string | null>(null);

  const data = (ctx?.data ?? {}) as AnyObj;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function load(silent = false) {
    if (inflightRef.current) return;
    inflightRef.current = true;
    const seq = ++requestSeqRef.current;

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetchWithFallback("/api/plan-log?limit=800&dedupe=1&windowSec=30");
      if (!res.ok) throw new Error(`plan-log http ${res.status}`);

      const json = await res.json();
      if (!json?.ok) throw new Error("plan-log not ok");

      if (!mountedRef.current) return;
      if (seq !== requestSeqRef.current) return;

      const raw = (json.items ?? []) as LogItem[];
      const nextItems = dedupeConsecutive(raw, 30);
      const sig = itemsSignature(nextItems);

      if (sig !== lastItemsSigRef.current) {
        lastItemsSigRef.current = sig;
        setItems(nextItems);
      }

      setErr(null);
    } catch (error: any) {
      if (!mountedRef.current) return;
      if (seq !== requestSeqRef.current) return;
      setErr(error?.message ?? "failed to load");
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
        inflightRef.current = false;
      }
    }
  }

  useEffect(() => {
    void load(false);

    const id = setInterval(() => {
      void load(true);
    }, POLL_MS);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [copied]);

  const groups = useMemo(() => groupByDay(items), [items]);
  const todayKey = ymd(Date.now());
  const today = groups.find((g) => g.key === todayKey);
  const history = groups.filter((g) => g.key !== todayKey).slice(0, 10);

  const importantCount = useMemo(
    () =>
      items.filter((x) => {
        const type = String(x.type ?? "").toUpperCase();
        const to = String(x.to ?? "").toUpperCase();
        return (
          type.includes("MODE_SWITCH") ||
          type.includes("PLAN_UPDATED") ||
          to.includes("BREAKOUT") ||
          to.includes("NO_TRADE")
        );
      }).length,
    [items]
  );

  async function copyTrace() {
    const trace = buildDecisionTrace(data);
    if (!trace) return;

    try {
      await navigator.clipboard.writeText(trace);
      setCopied(true);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = trace;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  }

  if (err && !items.length) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
        โหลด Timeline ไม่ได้: {err}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col rounded-2xl bg-neutral-900 p-5 ${className}`}>
      <TopSummaryBar data={data} />
      <DecisionTrace data={data} onCopy={copyTrace} copied={copied} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-200">Timeline</div>
          <div className="mt-1 text-xs text-neutral-500">
            ประวัติ state change / plan update / mode switch แบบอ่านง่าย
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{items.length ? `${items.length} events` : "no events"}</span>
          <span>•</span>
          <span>{importantCount} important</span>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="rounded-md border border-white/10 px-2 py-1 text-neutral-200 hover:bg-white/5 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-neutral-400">Today</div>

        {!today || today.items.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-white/10 bg-neutral-950/40 p-4 text-sm text-neutral-400">
            วันนี้ยังไม่มีเหตุการณ์เปลี่ยนสถานะ
          </div>
        ) : (
          <div className="mt-3 max-h-[460px] space-y-3 overflow-auto pr-1">
            {today.items.map((item, index) => (
              <TimelineRow key={`${item.t}-${index}`} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="text-xs text-neutral-400">History (tap to expand)</div>

        <div className="mt-2 max-h-[320px] space-y-2 overflow-y-auto pr-1 overscroll-contain">
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-neutral-950/40 p-4 text-sm text-neutral-400">
              ยังไม่มีประวัติวันก่อนหน้า
            </div>
          ) : (
            history.map((group) => (
              <details key={group.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="flex cursor-pointer select-none items-center justify-between text-sm text-neutral-200">
                  <span className="font-semibold">{group.label}</span>
                  <span className="text-xs text-neutral-500">{group.items.length} events</span>
                </summary>

                <div className="mt-3 space-y-3">
                  {group.items.map((item, index) => (
                    <TimelineRow key={`${item.t}-${index}`} item={item} />
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </div>

      {err && items.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          รีเฟรชล่าสุดมีปัญหา: {err}
        </div>
      )}

      {loading && !items.length && (
        <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950/40 p-4 text-sm text-neutral-400">
          กำลังโหลด timeline…
        </div>
      )}
    </div>
  );
}