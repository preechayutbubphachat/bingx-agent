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
        ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
      }`}
    >
      {ok ? "✓ " : "• "}
      {label}
    </span>
  );
}

function Row({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "red" | "amber" }) {
  const valCls = tone === "red" ? "text-[#b23a33]" : tone === "amber" ? "text-[#a9701a]" : "text-[#2b2118]";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-[#7a6a59]">{label}</span>
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
      ? "border-red-300 bg-red-50 text-red-800"
      : riskTone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-emerald-300 bg-emerald-50 text-emerald-800";

  const openPos = r.openTrendPosition ?? (engine.openTrendPaperPosition ? { direction: engine.openTrendPaperPosition.direction } : null);
  const alerts: string[] = [];
  if (r.stopReason) alerts.push(`STOP: ${r.stopReason}`);
  if (r.lastRejectReasons?.length) alerts.push(...r.lastRejectReasons.slice(0, 4));
  if (escapes) alerts.push("พบ flag live/exchange เปิด — ต้องตรวจสอบ");

  const feed = log.slice(0, 6);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      {/* UI-2.2: icon chip + status dot header (mockup-style) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-black text-[#2b2118]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#3a2c1c] text-[14px]" aria-hidden="true">🛡️</span>
          <span className="truncate">Risk Manager</span>
        </h2>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${barColor}`} aria-hidden="true" />
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${levelBadge}`}>{riskLevel}</span>
        </span>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-[#7a6a59]">
          <span>ระดับความเสี่ยงรวม</span>
          <span>{escapes ? "ALERT" : `${barPct}%`}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#efe2cd]">
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
        <div className="mb-1 text-[11px] font-black text-[#2b2118]">การแจ้งเตือน</div>
        {alerts.length ? (
          <ul className="flex flex-col gap-1">
            {alerts.map((a, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-950"
              >
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">
            ไม่มีการแจ้งเตือน · ระบบ paper ปลอดภัย
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-black text-[#2b2118]">Activity Feed</div>
        {feed.length ? (
          <ul className="flex flex-col gap-1">
            {feed.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#5b4432]">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f9d92]" />
                <span className="truncate">
                  <span className="font-bold text-[#7a6a59]">{e.ts}</span> · {e.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] text-[#9a8a72]">ยังไม่มีกิจกรรม</p>
        )}
      </div>
    </section>
  );
}
