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
