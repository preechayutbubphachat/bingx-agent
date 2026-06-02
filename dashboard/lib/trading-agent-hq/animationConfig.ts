// dashboard/lib/trading-agent-hq/animationConfig.ts
// THQ-6 — Animation config: Normalized Visual State → Animation Key → Visual Behavior.
// SAFETY: presentation only. Animation never implies trading readiness.

import type { AgentStatus } from "./viewModel";

export type AnimKey =
  | "idle"
  | "working"
  | "scanning"
  | "guarding"
  | "logging"
  | "alert"
  | "error"
  | "paused";

/** higher number = higher priority (can preempt minHold) */
export const PRIORITY: Record<AnimKey, number> = {
  error: 100,
  alert: 80,
  working: 60,
  scanning: 50,
  guarding: 40,
  logging: 30,
  paused: 20,
  idle: 10,
};

export interface VisualBehavior {
  /** css class with the keyframe loop (see globals.css .thq-anim-*) */
  cssClass: string;
  label: string;
  /** transient = one-shot emphasis (alert/error); subject to cooldown */
  transient: boolean;
  /** tone hint for ring/tint */
  tone: "neutral" | "ok" | "warn" | "danger";
}

export const VISUAL_BEHAVIOR: Record<AnimKey, VisualBehavior> = {
  idle: { cssClass: "thq-anim-idle", label: "idle", transient: false, tone: "neutral" },
  working: { cssClass: "thq-anim-working", label: "working", transient: false, tone: "ok" },
  scanning: { cssClass: "thq-anim-scanning", label: "scanning", transient: false, tone: "ok" },
  guarding: { cssClass: "thq-anim-guarding", label: "guarding", transient: false, tone: "ok" },
  logging: { cssClass: "thq-anim-logging", label: "logging", transient: false, tone: "neutral" },
  alert: { cssClass: "thq-anim-alert", label: "alert", transient: true, tone: "warn" },
  error: { cssClass: "thq-anim-error", label: "error", transient: true, tone: "danger" },
  paused: { cssClass: "thq-anim-paused", label: "paused", transient: false, tone: "neutral" },
};

/** sprite-sheet frame (row,col) that best represents each animation key.
 *  Row layout: 0 idle · 1 working(desk) · 2 tablet/pointing · 3 happy/cheer. */
// NOTE: café background already draws each desk, so we avoid row 1 (sprite-with-desk)
// to prevent double-desk. Use standing (row 0) + tablet/pointing (row 2) + cheer (row 3).
export const FRAME: Record<AnimKey, { row: number; col: number; cycle?: boolean }> = {
  idle: { row: 0, col: 0 },                   // static standing frame
  guarding: { row: 0, col: 0 },               // calm static frame
  working: { row: 2, col: 0, cycle: true },   // desk-free tablet/pointing loop
  logging: { row: 2, col: 0, cycle: true },   // writing/knowledge loop
  scanning: { row: 2, col: 0, cycle: true },  // chart/tablet scanning loop
  alert: { row: 3, col: 0 },
  error: { row: 0, col: 1 },
  paused: { row: 0, col: 4 },
};

export const TIMING = {
  /** keep a resolved animation at least this long (anti-flicker) */
  minHoldMs: 1500,
  /** after a transient anim fires, cooldown before it can fire again */
  cooldownMs: 6000,
  /** transient anim auto-decays back to its base after this long */
  transientDecayMs: 2500,
} as const;

/**
 * Raw System State → Normalized Visual State → Animation Key (priority resolve).
 * Pure. Missing/unknown → idle (safe fallback).
 */
export function statusToAnimKey(status: AgentStatus, visualStates: string[]): AnimKey {
  const v = visualStates.map((s) => s.toLowerCase());
  if (status === "error" || v.includes("error")) return "error";
  if (status === "alert" || v.some((s) => s.includes("alert") || s.includes("risk"))) return "alert";
  if (status === "paused" || v.includes("paused")) return "paused";
  if (status === "running" || v.some((s) => s.includes("working") || s.includes("balancing"))) return "working";
  if (status === "scanning" || v.some((s) => s.includes("thinking") || s.includes("scan"))) return "scanning";
  if (status === "guarding" || v.includes("calm")) return "guarding";
  if (status === "logging") return "logging";
  return "idle"; // unknown / missing → idle
}
