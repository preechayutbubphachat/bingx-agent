"use client";

import { useEffect, useMemo, useState } from "react";

type WinrateResp = {
  ok: boolean;
  has_data: boolean;
  overall: { total: number; wins: number; losses: number; winrate: number; avgR: number | null };
  by_type: {
    OB: { total: number; wins: number; losses: number; winrate: number; avgR: number | null };
    TREND: { total: number; wins: number; losses: number; winrate: number; avgR: number | null };
  };
  last_events: Array<{
    t: number;
    type: string;
    trade_id?: string;
    result: "WIN" | "LOSS";
    r_multiple?: number | null;
  }>;
};

const POLL_MS = 10_000;

function toEpochMs(ts: number) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  if (n >= 1e18) return Math.trunc(n / 1e6);
  if (n >= 1e15) return Math.trunc(n / 1e3);
  if (n >= 1e12) return Math.trunc(n);
  if (n >= 1e9) return Math.trunc(n * 1000);
  return Date.now();
}

function formatAgo(ts: number) {
  const ms = toEpochMs(ts);
  const diffMs = Date.now() - ms;
  if (!Number.isFinite(diffMs)) return "—";
  if (diffMs <= 0) return "just now";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatDateTime(ts: number) {
  return new Date(toEpochMs(ts)).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtR(x: number | null | undefined) {
  return typeof x === "number" && Number.isFinite(x) ? x.toFixed(3) : "—";
}

function cardTone(winrate: number) {
  if (winrate >= 60) return "border-emerald-500/20 bg-emerald-500/10";
  if (winrate >= 45) return "border-amber-500/20 bg-amber-500/10";
  return "border-rose-500/20 bg-rose-500/10";
}

function resultTone(result: "WIN" | "LOSS") {
  return result === "WIN"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    : "border-rose-500/20 bg-rose-500/10 text-rose-200";
}

function StatCard({
  label,
  total,
  wins,
  losses,
  winrate,
  avgR,
}: {
  label: string;
  total: number;
  wins: number;
  losses: number;
  winrate: number;
  avgR: number | null;
}) {
  return (
    <div className={`rounded-xl border p-3 ${cardTone(winrate)}`}>
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-100">{winrate.toFixed(2)}%</div>
      <div className="mt-1 text-xs text-neutral-300">
        {wins}W / {losses}L • total {total}
      </div>
      <div className="mt-1 text-xs text-neutral-500">avgR {fmtR(avgR)}</div>
    </div>
  );
}

export default function WinrateCard() {
  const [data, setData] = useState<WinrateResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  async function load(silent = false) {
    try {
      setErr(null);
      if (!silent) setLoading(true);

      const res = await fetch("/api/winrate", { cache: "no-store" });
      const json = (await res.json()) as WinrateResp;
      setData(json);
    } catch (error: any) {
      setErr(String(error?.message ?? error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);

    const pollId = setInterval(() => load(true), POLL_MS);
    const clockId = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(pollId);
      clearInterval(clockId);
    };
  }, []);

  const recentWins = useMemo(() => {
    return (data?.last_events ?? []).filter((event) => event.result === "WIN").length;
  }, [data]);

  const recentLosses = useMemo(() => {
    return (data?.last_events ?? []).filter((event) => event.result === "LOSS").length;
  }, [data]);

  if (err && !data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
        <div className="font-semibold text-rose-100">Winrate</div>
        <div className="mt-1 text-sm text-rose-200/80">โหลดไม่ได้: {err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4">
        <div className="font-semibold text-neutral-100">Winrate</div>
        <div className="mt-1 text-sm text-neutral-400">กำลังโหลด…</div>
      </div>
    );
  }

  const overall = data.overall;
  const ob = data.by_type.OB;
  const trend = data.by_type.TREND;

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-neutral-100">Winrate (from plan_history)</div>
          <div className="mt-1 text-xs text-neutral-500">
            สรุปผลลัพธ์ไม้ที่ปิดแล้วจาก plan_history.jsonl
          </div>
        </div>

        <button
          onClick={() => load(false)}
          className="rounded-lg border border-white/10 px-3 py-1 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-60"
          disabled={loading}
          title={loading ? "Loading..." : "Refresh"}
          type="button"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!data.has_data ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-neutral-950/40 p-4 text-sm text-neutral-400">
          ยังไม่มีอีเวนต์ปิดไม้ (TP/SL) ใน plan_history.jsonl
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <StatCard
              label="Overall"
              total={overall.total}
              wins={overall.wins}
              losses={overall.losses}
              winrate={overall.winrate}
              avgR={overall.avgR}
            />
            <StatCard
              label="OB"
              total={ob.total}
              wins={ob.wins}
              losses={ob.losses}
              winrate={ob.winrate}
              avgR={ob.avgR}
            />
            <StatCard
              label="TREND"
              total={trend.total}
              wins={trend.wins}
              losses={trend.losses}
              winrate={trend.winrate}
              avgR={trend.avgR}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-neutral-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-neutral-400">Last closes</div>
              <div className="text-xs text-neutral-500">
                {data.last_events.length} events • {recentWins}W / {recentLosses}L
              </div>
            </div>

            <div className="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1 text-sm">
              {data.last_events.slice(0, 50).map((event) => (
                <div
                  key={`${event.t}-${event.trade_id}-${event.type}`}
                  className="rounded-lg border border-white/5 px-3 py-2 hover:bg-white/5"
                  title={formatDateTime(event.t)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 truncate text-neutral-200">
                      <span className="text-neutral-500">{formatAgo(event.t)}</span>{" "}
                      <span className="font-medium">{event.type}</span>
                    </div>

                    <span className={`rounded-full border px-2 py-0.5 text-xs ${resultTone(event.result)}`}>
                      {event.result}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <span>R={fmtR(event.r_multiple ?? null)}</span>
                    {event.trade_id ? <span className="truncate">id: {event.trade_id}</span> : null}
                    <span>{formatDateTime(event.t)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {err && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              รีเฟรชล่าสุดมีปัญหา: {err}
            </div>
          )}
        </>
      )}
    </div>
  );
}