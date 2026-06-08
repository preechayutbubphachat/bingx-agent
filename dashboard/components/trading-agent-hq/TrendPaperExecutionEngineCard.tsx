import type { PaperVM } from "@/lib/trading-agent-hq/viewModel";

type Props = { paper: PaperVM };

const NA = "no data";

function fmt(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NA;
  return `${(v * 100).toFixed(1)}%`;
}

function actionLabel(action: string): string {
  switch (action) {
    case "NO_ACTION": return "NO_ACTION";
    case "CREATE_PAPER_ENTRY": return "CREATE_PAPER_ENTRY";
    case "CREATE_PAPER_EXIT": return "CREATE_PAPER_EXIT";
    case "CREATE_PAPER_CANCEL": return "CREATE_PAPER_CANCEL";
    default: return "UNKNOWN";
  }
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${strong ? "border-[#b08a5e] bg-[#fbf4e8]" : "border-[#d6c2a6] bg-white/75"}`}>
      <div className="text-[10px] font-black text-[#8a6a4f]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] font-black text-[#2f241b]">{value}</div>
    </div>
  );
}

export default function TrendPaperExecutionEngineCard({ paper }: Props) {
  const engine = paper.trendPaperExecutionEngine;
  const position = engine.openTrendPaperPosition;

  return (
    <section className="rounded-lg border border-[#d1b58c] bg-[#f4efe7] p-3 text-[#3f2f22] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-[#2f241b]">Trend Paper Execution Engine</h2>
          <p className="mt-0.5 text-[11px] font-bold text-[#80644c]">
            Paper simulation only. No exchange order, no live execution, no arm button.
          </p>
        </div>
        <span className="rounded-full border border-[#d6c2a6] bg-white/75 px-2 py-1 text-[10px] font-black text-[#5b4432]">
          {engine.enabled ? "enabled" : "disabled"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Last action" value={actionLabel(engine.lastAction)} strong />
        <Field label="Last reason" value={engine.lastReason ?? NA} />
        <Field label="Open position" value={position ? `${position.direction ?? "?"} ${position.status}` : "none"} />
        <Field label="Setup ID" value={position?.setupId ?? NA} />
        <Field label="Entry" value={fmt(position?.entryPrice)} />
        <Field label="Stop Loss" value={fmt(position?.stopLoss)} />
        <Field label="Target 1" value={fmt(position?.takeProfit1)} />
        <Field label="Target 2" value={fmt(position?.takeProfit2)} />
        <Field label="Qty / Remaining" value={position ? `${fmt(position.quantityPaper, 4)} / ${fmt(position.remainingQuantityPaper, 4)}` : NA} />
        <Field label="Last entry" value={engine.lastEntryAt ?? NA} />
        <Field label="Last exit" value={engine.lastExitAt ?? NA} />
        <Field label="Closed trades" value={String(engine.trendPaperClosedTrades)} />
        <Field label="Win rate" value={fmtPct(engine.winRate)} />
        <Field label="Net expectancy" value={fmt(engine.netExpectancyAfterCosts)} />
        <Field label="paperOnly" value={engine.paperOnly ? "true" : "false"} />
        <Field label="liveActivationAllowed" value={engine.liveActivationAllowed ? "true" : "false"} />
      </div>

      <div className="mt-3 rounded-md border border-[#d6c2a6] bg-white/70 px-3 py-2 text-[12px] font-black text-[#5b4432]">
        Warning: simulated journal only. Trend evidence remains separate from grid evidence, and old grid exposure stays quarantined.
      </div>
    </section>
  );
}
