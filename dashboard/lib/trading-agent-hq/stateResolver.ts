// dashboard/lib/trading-agent-hq/stateResolver.ts
// THQ-6 — pure resolver enforcing minHold / cooldown / transient-decay.
// SAFETY: presentation only.

import type { AnimKey } from "./animationConfig";
import { PRIORITY, VISUAL_BEHAVIOR, TIMING } from "./animationConfig";

export interface ResolvedAnim {
  /** key currently displayed */
  key: AnimKey;
  /** when current key started */
  sinceTs: number;
  /** base (non-transient) key to decay back to */
  baseKey: AnimKey;
  /** last time a transient anim fired (for cooldown) */
  lastTransientTs: number;
}

export function initResolved(candidate: AnimKey, now: number): ResolvedAnim {
  const transient = VISUAL_BEHAVIOR[candidate].transient;
  return {
    key: candidate,
    sinceTs: now,
    baseKey: transient ? "idle" : candidate,
    lastTransientTs: transient ? now : 0,
  };
}

/**
 * Compute next resolved animation.
 * Rules:
 *  - higher-priority candidate preempts immediately.
 *  - same/lower priority must wait minHoldMs before switching (anti-flicker).
 *  - transient candidate (alert/error) is gated by cooldownMs.
 *  - transient anim auto-decays to baseKey after transientDecayMs.
 */
export function resolveNext(
  prev: ResolvedAnim | undefined,
  candidate: AnimKey,
  now: number,
): ResolvedAnim {
  if (!prev) return initResolved(candidate, now);

  const candTransient = VISUAL_BEHAVIOR[candidate].transient;
  const curTransient = VISUAL_BEHAVIOR[prev.key].transient;

  // 1) transient currently showing → decay back to base after decay window
  if (curTransient && now - prev.sinceTs >= TIMING.transientDecayMs) {
    const base = prev.baseKey;
    // re-evaluate candidate against the decayed base below by recursing once
    return resolveNext(
      { ...prev, key: base, sinceTs: now },
      candidate,
      now,
    );
  }

  if (candidate === prev.key) {
    // refresh base if non-transient
    return curTransient ? prev : { ...prev, baseKey: candidate };
  }

  const higher = PRIORITY[candidate] > PRIORITY[prev.key];

  // 2) transient candidate: respect cooldown
  if (candTransient) {
    const cooled = now - prev.lastTransientTs >= TIMING.cooldownMs;
    if (!cooled) return prev; // suppress repeat flash
    return {
      key: candidate,
      sinceTs: now,
      baseKey: prev.baseKey === "idle" && !curTransient ? prev.key : prev.baseKey,
      lastTransientTs: now,
    };
  }

  // 3) non-transient candidate: preempt if higher priority, else wait minHold
  if (higher || now - prev.sinceTs >= TIMING.minHoldMs) {
    return { key: candidate, sinceTs: now, baseKey: candidate, lastTransientTs: prev.lastTransientTs };
  }

  return prev; // hold current
}
