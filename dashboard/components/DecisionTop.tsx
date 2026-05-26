"use client";

import { useEffect, useMemo, useState } from "react";

function shortWhy(why?: string) {
  if (!why) return "";

  const parts = why
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 3);

  const labelMap: Record<string, string> = {
    wait_sweep_at_ob: "ยังไม่ sweep",
    wait_reclaim_midrule: "ยังไม่ reclaim",
    wait_choch: "ยังไม่ CHOCH",
    wait_5m_ob: "ยังไม่ยืนยัน 5m",
    wait_confirm: "ยังไม่ confirm",
    invalidated_by_trend_invalidation: "แผน invalidated",
    "touch+sweep+reclaim+choch+5m_ob_ready": "touch → sweep → reclaim → choch → 5m ob ready",
  };

  const pretty = parts.map((part) => labelMap[part] ?? part.replaceAll("_", " "));
  return pretty.join(" · ");
}

function badgeClass(badge?: string) {
  const normalized = String(badge ?? "").toUpperCase();

  if (normalized.includes("CONFIRM") || normalized.includes("READY") || normalized.includes("OK")) {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
  }

  if (normalized.includes("WAIT") || normalized.includes("PENDING")) {
    return "border-amber-500/30 bg-amber-500/15 text-amber-200";
  }

  if (normalized.includes("NO_TRADE") || normalized.includes("HOLD") || normalized.includes("PAUSE")) {
    return "border-neutral-500/30 bg-neutral-500/15 text-neutral-200";
  }

  return "border-sky-500/30 bg-sky-500/15 text-sky-200";
}

type Props = {
  badge?: string;
  headline?: string;
  why?: string;
  copyValue?: string;
  hideCopy?: boolean;
};

/**
 * Ownership boundary for this component:
 * - receives already-resolved display strings from parent
 * - does not fetch or infer plan truth by itself
 * - only formats headline / why / copy interaction
 */
export default function DecisionTop({
  badge = "WAIT",
  headline,
  why,
  copyValue,
  hideCopy,
}: Props) {
  const [copied, setCopied] = useState(false);

  const safeBadge = String(badge ?? "").trim() || "WAIT";
  const safeHeadline = String(headline ?? "").trim() || "—";
  const safeWhy = String(why ?? "").trim();

  const trace = useMemo(() => shortWhy(safeWhy), [safeWhy]);
  const displayTrace = trace || safeWhy;
  const showTrace = Boolean(displayTrace);

  const toCopy = String(copyValue ?? safeWhy).trim();
  const showCopy = !hideCopy && Boolean(toCopy);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (!toCopy) return;

    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold tracking-wide ${badgeClass(
            safeBadge
          )}`}
        >
          {safeBadge}
        </span>

        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-100">{safeHeadline}</span>
        </div>
      </div>

      {showTrace && (
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 text-xs text-zinc-300">
            <span className="font-semibold text-zinc-200">Decision Trace:</span>{" "}
            <span className="break-words font-mono">{displayTrace}</span>
          </div>

          {showCopy && (
            <button
              type="button"
              className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-100 transition hover:bg-white/5"
              onClick={handleCopy}
              title="Copy trace"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
