type Props = {
  regime: string;
  marketMode: string;
  confidence?: number;
  updatedAt?: number;
  riskWarnings?: string[];
};

function tone(regime: string) {
  if (regime.includes("TREND_DOWN")) return "red";
  if (regime.includes("TREND_UP")) return "green";
  if (regime.includes("RANGE")) return "yellow";
  if (regime.includes("NO_TRADE")) return "gray";
  return "blue";
}

function toneClass(t: string) {
  switch (t) {
    case "red":
      return "bg-red-500/15 text-red-300 border-red-500/30";
    case "green":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "yellow":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "gray":
      return "bg-neutral-500/15 text-neutral-300 border-neutral-500/30";
    default:
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  }
}

function freshness(updatedAt?: number) {
  if (!updatedAt) return { label: "UNKNOWN", color: "text-neutral-400" };
  const ageMin = (Date.now() - updatedAt) / 60000;
  if (ageMin < 10) return { label: "FRESH", color: "text-emerald-400" };
  if (ageMin < 30) return { label: "STALE", color: "text-amber-400" };
  return { label: "OLD", color: "text-rose-400" };
}

export default function MarketStatusCard({
  regime,
  marketMode,
  confidence,
  updatedAt,
  riskWarnings = [],
}: Props) {
  const t = tone(regime);
  const f = freshness(updatedAt);

  return (
    <div className={`rounded-2xl border p-5 ${toneClass(t)}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide opacity-70">
            Market Regime
          </div>
          <div className="mt-1 text-2xl font-semibold">{regime}</div>
          <div className="mt-1 text-sm opacity-80">
            Strategy: <b>{marketMode}</b>
          </div>
        </div>

        <div className="text-right text-xs">
          <div className={f.color}>{f.label}</div>
          {confidence !== undefined && (
            <div className="mt-1 opacity-80">
              Confidence {(confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
      </div>

      {confidence !== undefined && (
        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-black/30">
            <div
              className="h-2 rounded-full bg-current"
              style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {riskWarnings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {riskWarnings.map((w, i) => (
            <span
              key={i}
              className="rounded-full border px-3 py-1 text-xs opacity-80"
            >
              ⚠ {w}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
