"use client";

// dashboard/components/trading-agent-hq/RiskManagerPanel.tsx
// Phase UI-2 — right-side Risk Manager panel. READ-ONLY derivation from the VM.
// SAFETY: shows paper-only / live-disabled / exchange-disabled state explicitly.
// No order/live/exchange controls, no fetch, no token.

import type { PaperVM, SafetyVM, LogEntry } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM; safety: SafetyVM; log: LogEntry[] };

const NA = "ไม่มีข้อมูล";

function fmtR(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}

function SafetyFlag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${
        ok ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200" : "border-rose-300/40 bg-rose-400/10 text-rose-200"
      }`}
    >
      {ok ? "✓ " : "• "}
      {label}
    </span>
  );
}

function Row({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" | "amber" }) {
  const valCls = tone === "red" ? "text-rose-200" : tone === "amber" ? "text-amber-200" : "text-slate-100";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-cyan-400/20 bg-slate-900/80 px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`text-[12px] font-black ${valCls}`}>{value}</span>
    </div>
  );
}

export default function RiskManagerPanel({ paper, safety, log }: Props) {
  const r = paper.trendPaperEvidenceRunner;
  const engine = paper.trendPaperExecutionEngine;

  const escapes = r.liveActivationAllowed || r.exchangeOrderAllowed || safety.liveTradingEnabled || safety.orderPlacementEnabled;
  const stopped = !!r.stopReason || r.evidencePhase === "SAFETY_BLOCKED";
  const riskLevel = escapes ? "ตรวจสอบด่วน" : stopped ? "หยุดชั่วคราว" : "ต่ำ (Paper-only)";
  const riskTone = escapes ? "red" : stopped ? "amber" : "green";

  // Risk bar: nominal scale on |dailyLossR| up to a 3R reference (display heuristic, not a trade limit).
  const lossMag = typeof r.dailyLossR === "number" && Number.isFinite(r.dailyLossR) ? Math.abs(r.dailyLossR) : 0;
  const barPct = escapes ? 100 : Math.max(8, Math.min(100, Math.round((lossMag / 3) * 100)));
  const barColor = escapes ? "bg-[#e75b52]" : stopped ? "bg-[#f0a737]" : "bg-[#4caf74]";
  const levelBadge =
    riskTone === "red"
      ? "border-rose-300/40 bg-rose-400/10 text-rose-200"
      : riskTone === "amber"
        ? "border-amber-300/40 bg-amber-400/10 text-amber-200"
        : "border-emerald-300/40 bg-emerald-400/10 text-emerald-200";

  const openPos = r.openTrendPosition ?? (engine.openTrendPaperPosition ? { direction: engine.openTrendPaperPosition.direction } : null);
  const alerts: string[] = [];
  if (r.stopReason) alerts.push(`STOP: ${r.stopReason}`);
  if (r.lastRejectReasons?.length) alerts.push(...r.lastRejectReasons.slice(0, 4));
  if (escapes) alerts.push("พบ flag live/exchange เปิด — ต้องตรวจสอบ");

  const feed = log.slice(0, 6);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-3 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
      {/* UI-2.2: icon chip + status dot header (mockup-style) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-black text-cyan-100">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 text-[14px]" aria-hidden="true">◇</span>
          <span className="truncate">Risk Manager</span>
        </h2>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${barColor}`} aria-hidden="true" />
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${levelBadge}`}>{riskLevel}</span>
        </span>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-500">
          <span>ระดับความเสี่ยงรวม</span>
          <span>{escapes ? "ALERT" : `${barPct}%`}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Row label="Daily Loss" value={fmtR(r.dailyLossR)} tone={lossMag > 0 ? "amber" : "neutral"} />
        <Row
          label="Open Exposure"
          value={openPos ? `${openPos.direction ?? "?"} · เปิดอยู่` : "ไม่มีโพสิชัน"}
          tone={openPos ? "amber" : "neutral"}
        />
        <Row label="Max Drawdown" value={fmtR(r.maxDrawdownR)} />
        <Row label="Entries วันนี้" value={`${r.dailyEntryCount ?? 0}/${r.maxEntriesPerDay ?? NA}`} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SafetyFlag ok={true} label="Paper-only" />
        <SafetyFlag ok={!r.liveActivationAllowed && !safety.liveTradingEnabled} label="Live ปิด" />
        <SafetyFlag ok={!r.exchangeOrderAllowed} label="Exchange ปิด" />
        <SafetyFlag ok={safety.phase?.includes("M-0B")} label="M-0B บล็อก" />
      </div>

      <div>
        <div className="mb-1 text-[11px] font-black text-cyan-100">การแจ้งเตือน</div>
        {alerts.length ? (
          <ul className="flex flex-col gap-1">
            {alerts.map((a, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-100"
              >
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-200">
            ไม่มีการแจ้งเตือน · ระบบ paper ปลอดภัย
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-black text-cyan-100">Activity Feed</div>
        {feed.length ? (
          <ul className="flex flex-col gap-1">
            {feed.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-400">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                <span className="truncate">
                  <span className="font-bold text-cyan-300">{e.ts}</span> · {e.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] text-slate-500">ยังไม่มีกิจกรรม</p>
        )}
      </div>
    </section>
  );
}
