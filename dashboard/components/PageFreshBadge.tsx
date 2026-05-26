"use client";

import { useEffect, useMemo, useState } from "react";
import { getDataHealth, formatAgeSeconds, sourceKindLabel } from "@/lib/dataHealth";

function formatPageAge(sec: number | null) {
  if (sec === null) return "-";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

type Props = {
  freshness?: { tag?: string; ageSec?: number | null } | null;
  decisionKind?: "root" | "mirror" | null;
  snapshotKind?: "root" | "mirror" | null;
  hasDecision?: boolean;
  hasSnapshot?: boolean;
};

export default function PageFreshBadge(props: Props) {
  const { freshness, decisionKind, snapshotKind, hasDecision, hasSnapshot } = props;

  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pageAgeSec = useMemo(
    () => Math.max(0, Math.floor((now - startedAt) / 1000)),
    [now, startedAt]
  );

  const hasDataHealthProps =
    freshness !== undefined ||
    decisionKind !== undefined ||
    hasDecision !== undefined;

  const health = useMemo(() => {
    if (!hasDataHealthProps) return null;
    return getDataHealth({
      freshness,
      decisionKind,
      snapshotKind,
      hasDecision: hasDecision ?? false,
      hasSnapshot: hasSnapshot ?? false,
    });
  }, [freshness, decisionKind, snapshotKind, hasDecision, hasSnapshot, hasDataHealthProps]);

  if (!health) {
    return (
      <span
        className="rounded-full border border-neutral-700 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-300"
        title="Page Fresh = time since last page load"
      >
        Page Fresh: <span className="font-medium text-neutral-100">{formatPageAge(pageAgeSec)}</span>
      </span>
    );
  }

  const tooltipParts = [
    `status: ${health.labelTH}`,
    health.ageSec !== null ? `age: ${formatAgeSeconds(health.ageSec)}` : null,
    `decision: ${sourceKindLabel(health.decisionKind)}`,
    `snapshot: ${sourceKindLabel(health.snapshotKind)}`,
    `page age: ${formatPageAge(pageAgeSec)}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const usingMirror = health.decisionKind === "mirror" || health.snapshotKind === "mirror";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-300"
      title={tooltipParts}
    >
      <span className={`font-semibold ${health.color}`}>{health.labelTH}</span>

      {health.ageSec !== null && (
        <>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{formatAgeSeconds(health.ageSec)}</span>
        </>
      )}

      {usingMirror && (
        <>
          <span className="text-neutral-600">|</span>
          <span className="text-amber-400">fallback</span>
        </>
      )}

      <span className="text-neutral-600">|</span>
      <span className="text-neutral-500">{formatPageAge(pageAgeSec)}</span>
    </span>
  );
}
