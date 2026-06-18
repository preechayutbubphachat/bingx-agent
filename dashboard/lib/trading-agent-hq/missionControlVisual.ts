export type HudTone = "cyan" | "magenta" | "violet" | "amber" | "rose" | "emerald" | "slate";

export function hudPanelClass(tone: HudTone = "cyan"): string {
  const border =
    tone === "magenta"
      ? "border-fuchsia-300/30 shadow-[0_0_34px_rgba(217,70,239,0.12)]"
      : tone === "violet"
        ? "border-violet-300/30 shadow-[0_0_34px_rgba(139,92,246,0.12)]"
        : tone === "amber"
          ? "border-amber-300/30 shadow-[0_0_34px_rgba(245,158,11,0.1)]"
          : tone === "rose"
            ? "border-rose-300/30 shadow-[0_0_34px_rgba(251,113,133,0.1)]"
            : tone === "emerald"
              ? "border-emerald-300/30 shadow-[0_0_34px_rgba(16,185,129,0.1)]"
              : "border-cyan-400/20 shadow-[0_0_34px_rgba(34,211,238,0.1)]";
  return `relative overflow-hidden rounded-2xl border bg-slate-950/80 ${border}`;
}

export function missionCardTone(status: string | null | undefined): string {
  const normalized = (status ?? "").toUpperCase();
  if (normalized.includes("BLOCK") || normalized.includes("INVALID")) return "border-rose-300/40 bg-rose-400/10 text-rose-100";
  if (normalized.includes("WAIT") || normalized.includes("NOT_READY") || normalized.includes("DATA")) return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  if (normalized.includes("REVIEW")) return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (normalized.includes("PAPER")) return "border-violet-300/40 bg-violet-400/10 text-violet-100";
  if (normalized.includes("ACTIVE") || normalized.includes("PASS")) return "border-cyan-300/40 bg-cyan-400/10 text-cyan-100";
  return "border-slate-600 bg-slate-900/80 text-slate-300";
}

export function cyberProgressTone(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "bg-slate-600";
  if (score >= 70) return "bg-gradient-to-r from-emerald-400 to-cyan-300";
  if (score >= 35) return "bg-gradient-to-r from-cyan-400 to-blue-300";
  return "bg-gradient-to-r from-amber-400 to-orange-300";
}

export function reviewOnlySafetyCopy(): string {
  return "ใช้เพื่อรีวิวเท่านั้น · ไม่ใช่ Activation · ไม่ใช่ Live · ไม่ใช่ Order";
}

export function threeColumnShellClass(): string {
  return "agent-hq-shell flex h-screen min-h-screen flex-col overflow-hidden bg-[#020817] text-[#d7f7ff] lg:flex-row";
}

export function analysisRailReadabilityClass(): string {
  return [
    "agent-hq-analysis-rail",
    "min-h-0",
    "min-w-0",
    "flex",
    "flex-col",
    "gap-3",
    "lg:h-full",
    "lg:max-h-full",
    "lg:overflow-y-auto",
    "lg:overflow-x-hidden",
    "lg:overscroll-contain",
    "lg:pr-1",
    "lg:pl-1",
    "lg:pb-6",
    "scrollbar-thin",
    "[&>section]:overflow-visible",
    "[&>section]:rounded-2xl",
    "[&>section]:border-cyan-400/25",
    "[&>section]:bg-slate-950/90",
    "[&>section]:text-slate-100",
    "[&>section]:shadow-[0_0_34px_rgba(34,211,238,0.1)]",
    "[&_dd]:text-slate-100",
    "[&_dt]:text-slate-300",
    "[&_h2]:text-cyan-50",
    "[&_h3]:text-cyan-100",
    "[&_p]:leading-relaxed",
    "[&_p]:text-slate-200",
  ].join(" ");
}

export type NormalizedPanelSize = "compact" | "standard" | "tall";

export function normalizedPanelClass(size: NormalizedPanelSize = "standard"): string {
  const height =
    size === "compact"
      ? "min-h-[190px]"
      : size === "tall"
        ? "min-h-[360px]"
        : "min-h-[220px]";
  return `${height} h-auto shrink-0 overflow-visible rounded-2xl border border-cyan-400/20 bg-slate-950/75 shadow-[0_0_30px_rgba(34,211,238,0.06)]`;
}

export function centerInfoCardClass(size: NormalizedPanelSize = "standard"): string {
  return `${normalizedPanelClass(size)} flex flex-col`;
}

export function centerCardBodyClass(mode: "natural" | "scroll" = "natural"): string {
  return mode === "scroll"
    ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin"
    : "min-h-0 flex-1 overflow-visible";
}

export function statusTileClass(): string {
  return "flex h-auto min-h-[160px] w-full flex-col gap-1.5 rounded-xl border px-2.5 py-2.5 text-left [&_.agent-hq-tile-title]:line-clamp-2";
}

export function statusWallGridClass(): string {
  return "agent-hq-collapsed-grid grid gap-2 overflow-visible";
}

export function statusWallPanelClass(): string {
  return "agent-hq-status-wall-stable block h-auto min-h-0 shrink-0 overflow-visible rounded-2xl border border-cyan-400/20 bg-slate-950/75 p-3 shadow-[0_0_18px_rgba(34,211,238,0.05)]";
}

export function statusWallStableGridClass(): string {
  return "agent-hq-status-wall-stable-grid grid gap-3 overflow-visible";
}

export function statusWallStableCardClass(severity: "critical" | "warning" | "success" | "info" | "none" = "none"): string {
  const tone =
    severity === "critical"
      ? "border-rose-300/35 bg-rose-400/10"
      : severity === "warning"
        ? "border-amber-300/35 bg-amber-400/10"
        : severity === "success"
          ? "border-emerald-300/35 bg-emerald-400/10"
          : severity === "info"
            ? "border-cyan-300/35 bg-cyan-400/10"
            : "border-cyan-400/20 bg-slate-900/80";
  return `agent-hq-status-wall-stable-card flex h-auto min-h-[148px] w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left shadow-[0_0_14px_rgba(34,211,238,0.05)] transition-colors ${tone}`;
}
