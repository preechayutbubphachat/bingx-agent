// D5.2-c — Shadow Outcome evidence card (READ-ONLY).
//
// SAFETY:
//   - Display only. Consumes the already-computed shadowOutcomeSummary from PaperVM.
//   - Never recomputes outcomes, never imports runner/execution/grid/resolver.
//   - Counterfactual reachability evidence — NOT real trades. Does not count toward
//     closedCycles/trendClosedTrades and must never feed any decision/trade path.
//   - Naming policy: public labels use touch/reachability/outcome terms only
//     (the word "trades" appears solely in the "not real trades" disclaimer).

import type { PaperVM, ShadowOutcomeBucketVM, ShadowOutcomeSummaryVM } from "@/lib/trading-agent-hq/viewModel";

const EARLY_CONTEXT_THRESHOLD = 30;
const HIGH_NOT_REACHED_RATE = 0.8;
const HIGH_NOT_REACHED_MIN_SAMPLE = 10;

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
}

// entry touch / not-reached rate: 0 must show "0%"; null means no resolvable sample yet.
function rateResolvable(v: number | null): string {
  return v === null ? "no resolvable sample yet" : pct(v);
}

// target / invalidation / timeout after entry-touch: null means entryTouched === 0.
function rateAfterTouch(v: number | null): string {
  return v === null ? "no entry-touch sample yet" : pct(v);
}

function dominantKey(split: Record<string, ShadowOutcomeBucketVM>): string | null {
  let best: string | null = null;
  let bestN = -1;
  for (const [k, b] of Object.entries(split)) {
    if (k === "UNKNOWN") continue;
    if (b.totalSetups > bestN) {
      bestN = b.totalSetups;
      best = k;
    }
  }
  return bestN > 0 ? best : null;
}

function Badge({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "amber" | "violet" }) {
  const cls =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : tone === "violet"
        ? "border-violet-300 bg-violet-50 text-violet-900"
        : "border-[#e5d5bf] bg-[#fffaf1] text-[#7a6a59]";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wide ${cls}`}>{text}</span>
  );
}

function Row({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "amber" }) {
  const cls = tone === "amber" ? "text-[#a9701a]" : "text-[#2b2118]";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e5d5bf] bg-[#fffaf1] px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-[#7a6a59]">{label}</span>
      <span className={`text-right text-[12px] font-black ${cls}`}>{value}</span>
    </div>
  );
}

function SplitTable({ title, split }: { title: string; split: Record<string, ShadowOutcomeBucketVM> }) {
  const keys = Object.keys(split);
  return (
    <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2">
      <div className="mb-1 text-[11px] font-black text-[#7a6a59]">{title}</div>
      {keys.length === 0 ? (
        <div className="text-[11px] text-[#9a8a72]">no buckets yet</div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#9a8a72]">
            <span className="min-w-0 flex-1">bucket</span>
            <span className="w-12 text-right">setups</span>
            <span className="w-16 text-right">touch</span>
            <span className="w-20 text-right">not-reached</span>
          </div>
          {keys.map((k) => {
            const b = split[k]!;
            return (
              <div key={k} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-bold text-[#2b2118]" title={k}>
                  {k}
                </span>
                <span className="w-12 text-right font-black text-[#2b2118]">{b.totalSetups}</span>
                <span className="w-16 text-right font-black text-[#2b2118]">{rateResolvable(b.entryTouchRate)}</span>
                <span className="w-20 text-right font-black text-[#2b2118]">{rateResolvable(b.entryNotReachedRate)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Header({ summary }: { summary: ShadowOutcomeSummaryVM | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-black text-[#2b2118]">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-[12px]" aria-hidden="true">
          👁
        </span>
        <span className="truncate">Shadow outcome evidence</span>
      </h2>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Badge text="REVIEW_ONLY" tone="violet" />
        <Badge text="NOT_ACTIVATION" tone="violet" />
        {summary === null ? null : null}
      </div>
    </div>
  );
}

export default function ShadowOutcomeSummaryCard({ paper }: { paper: PaperVM }) {
  const summary = paper.trendEvidenceDecisionSummary.shadowOutcomeSummary;

  if (!summary) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
        <Header summary={null} />
        <div className="rounded-lg border border-dashed border-[#e5d5bf] bg-[#fffdf8] p-3 text-[12px] text-[#7a6a59]">
          Shadow outcome summary not available yet.
        </div>
        <p className="text-[10px] leading-relaxed text-[#9a8a72]">
          Shadow outcome evidence — not real trades · Does not count toward closedCycles.
        </p>
      </section>
    );
  }

  const overall = summary.shadowOutcomes;
  const unknownContext = summary.splitByCanonicalRegime["UNKNOWN"]?.totalSetups ?? 0;
  const contextReady = Math.max(0, overall.totalSetups - unknownContext);
  const resolvable = overall.entryTouched + overall.entryNotReached + overall.invalidationFirst;

  const badges: { text: string; tone: "amber" | "violet" }[] = [];
  if (contextReady < EARLY_CONTEXT_THRESHOLD) badges.push({ text: "EARLY_CONTEXT_SAMPLE", tone: "amber" });
  if (unknownContext > contextReady) badges.push({ text: "UNKNOWN_CONTEXT_DOMINATES", tone: "amber" });
  if (overall.entryNotReachedRate !== null && overall.entryNotReachedRate >= HIGH_NOT_REACHED_RATE && resolvable >= HIGH_NOT_REACHED_MIN_SAMPLE) {
    badges.push({ text: "HIGH_ENTRY_NOT_REACHED_RATE", tone: "amber" });
  }
  if (dominantKey(summary.splitByPriceVsGrid) === "BELOW_GRID") badges.push({ text: "BELOW_GRID_CONTEXT", tone: "amber" });
  if (dominantKey(summary.splitByDynamicGridStatus) === "PAUSE_EXPOSURE_LIMIT") badges.push({ text: "PAUSE_EXPOSURE_CONTEXT", tone: "amber" });

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#e5d5bf] bg-[#fffaf1] p-3 shadow-sm">
      <Header summary={summary} />

      {badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {badges.map((b) => (
            <Badge key={b.text} text={b.text} tone={b.tone} />
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-[#e5d5bf] bg-[#fffdf8] p-2 text-[10px] leading-relaxed text-[#7a6a59]">
        <div className="font-black text-[#2b2118]">Shadow outcome evidence — not real trades</div>
        <div>Does not count toward closedCycles</div>
        <div>Used to evaluate setup reachability while closed-cycle evidence is unavailable</div>
        <div>Review-only, not activation</div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Row label="Context-ready samples" value={String(contextReady)} />
        <Row label="Unknown-context samples" value={String(unknownContext)} tone={unknownContext > contextReady ? "amber" : "neutral"} />
        <Row label="Total setups" value={String(overall.totalSetups)} />
        <Row label="Geometry ready" value={String(overall.geometryReady)} />
        <Row label="No geometry" value={String(overall.noGeometry)} />
        <Row label="Pending" value={String(overall.pending)} />
        <Row label="Entry touch rate" value={rateResolvable(overall.entryTouchRate)} />
        <Row label="Entry not-reached rate" value={rateResolvable(overall.entryNotReachedRate)} tone={overall.entryNotReachedRate !== null && overall.entryNotReachedRate >= HIGH_NOT_REACHED_RATE ? "amber" : "neutral"} />
        <Row label="Target after entry-touch rate" value={rateAfterTouch(overall.targetAfterEntryTouchRate)} />
        <Row label="Invalidation after entry-touch rate" value={rateAfterTouch(overall.invalidationAfterEntryTouchRate)} />
        <Row label="Timeout after entry-touch rate" value={rateAfterTouch(overall.timeoutAfterEntryTouchRate)} />
        <Row label="Invalidation-first rate" value={rateResolvable(overall.invalidationFirstRate)} />
      </div>

      <p className="text-[10px] leading-relaxed text-[#9a8a72]">
        Observation only — does not instruct any parameter change. A 0% entry touch rate is an observation, not a parameter-change instruction.
        {unknownContext > contextReady ? " Most records have no captured context yet (pre-D5.2-a); splits are mostly UNKNOWN — interpret with care." : ""}
      </p>

      <div className="flex flex-col gap-1.5">
        <SplitTable title="Split by canonical regime" split={summary.splitByCanonicalRegime} />
        <SplitTable title="Split by price vs grid" split={summary.splitByPriceVsGrid} />
        <SplitTable title="Split by dynamic grid status" split={summary.splitByDynamicGridStatus} />
      </div>
    </section>
  );
}
