"use client";

import { useEffect, useMemo, useState } from "react";
import MarketStatusCard from "@/components/MarketStatusCard";


type LatestPayload = {
  ok: boolean;
  dir?: string;
  updatedAt?: number;
  decision?: any;
  step2Text?: string | null;
  error?: string;
};

function fmtTime(ms?: number) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function freshness(ageMs: number) {
  if (ageMs <= 10 * 60 * 1000) return { label: "FRESH", tone: "good" as const };
  if (ageMs <= 30 * 60 * 1000) return { label: "STALE", tone: "warn" as const };
  return { label: "OLD", tone: "bad" as const };
}

function toneColor(tone: "good" | "warn" | "bad") {
  if (tone === "good") return "text-emerald-400";
  if (tone === "warn") return "text-amber-400";
  return "text-rose-400";
}

export default function Page() {
  const [data, setData] = useState<LatestPayload>({ ok: false });
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/latest", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setData({ ok: false, error: e?.message ?? "fetch failed" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const pollMs = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 10000);
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, []);

  const decision = data.decision;
  const updatedAt = data.updatedAt;
  const ageMs = updatedAt ? Date.now() - updatedAt : Infinity;
  const fresh = useMemo(() => freshness(ageMs), [ageMs]);

  const title =
    decision ? `${decision.regime} · ${decision.market_mode}` : "No Data";

  const confidence =
    typeof decision?.confidence === "number" ? decision.confidence : null;

  const warnings: string[] = Array.isArray(decision?.risk_warning)
    ? decision.risk_warning
    : [];

  const summary: string = decision?.summary_for_bot ?? "";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">BingX Agent Dashboard</h1>
            <p className="text-sm text-neutral-400">
              Updated: <span className="text-neutral-200">{fmtTime(updatedAt)}</span>
              {" · "}
              Status: <span className={toneColor(fresh.tone)}>{fresh.label}</span>
              {loading ? " · loading…" : ""}
            </p>
            <p className="text-xs text-neutral-500">
              Reading from: {data.dir ?? "(unknown)"} / latest_decision.json + latest_step2.txt
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="space-y-4">
            <div className="rounded-2xl bg-neutral-900 p-5 shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">Market Status</div>
                  <div className="mt-1 text-2xl font-semibold">{title}</div>
                </div>
                {confidence !== null && (
                  <div className="rounded-xl bg-neutral-950 px-3 py-2 text-right">
                    <div className="text-xs text-neutral-400">Confidence</div>
                    <div className="text-lg font-semibold">
                      {(confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>

              {confidence !== null && (
                <div className="mt-4">
                  <div className="h-2 w-full rounded-full bg-neutral-800">
                    <div
                      className="h-2 rounded-full bg-neutral-200"
                      style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-neutral-400">
                    Confidence ต่ำ = ต้อง “รอคอนเฟิร์ม” ก่อนเสมอ
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {warnings.map((w, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300"
                    >
                      ⚠ {w}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-neutral-900 p-5 shadow">
              <div className="text-sm text-neutral-400">Action Summary</div>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-neutral-950 p-4 text-sm text-neutral-200">
                {summary || "(no summary_for_bot)"}
              </pre>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl bg-neutral-900 p-5 shadow">
              <div className="text-sm text-neutral-400">Reason Breakdown</div>

              {decision?.reason ? (
                <div className="mt-3 space-y-3">
                  {["trend", "momentum", "volatility", "orderflow", "smc", "news_impact"].map(
                    (k) => (
                      <div key={k} className="rounded-xl bg-neutral-950 p-4">
                        <div className="text-xs uppercase tracking-wide text-neutral-400">
                          {k}
                        </div>
                        <div className="mt-2 text-sm text-neutral-200">
                          {decision.reason[k] ?? "-"}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-neutral-400">(no reason)</div>
              )}
            </div>

            <div className="rounded-2xl bg-neutral-900 p-5 shadow">
              <div className="text-sm text-neutral-400">STEP02 (Thai Visual)</div>
              <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-neutral-950 p-4 text-sm text-neutral-200">
                {data.step2Text || "(latest_step2.txt not found)"}
              </pre>
            </div>
          </section>
        </div>

        {!data.ok && data.error && (
          <div className="mt-6 rounded-2xl bg-rose-500/10 p-5 text-rose-200">
            Error: {data.error}
          </div>
        )}
      </div>
    </main>
  );
}
