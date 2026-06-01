// dashboard/lib/trading-agent-hq/useAgentAnimations.ts
// THQ-6 — stateful hook: per-agent resolved AnimKey over time (minHold/cooldown/decay).
// SAFETY: presentation only.

"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentId, AgentVM } from "./viewModel";
import type { AnimKey } from "./animationConfig";
import { statusToAnimKey } from "./animationConfig";
import { resolveNext, type ResolvedAnim } from "./stateResolver";

/**
 * Returns a stable map AgentId → AnimKey, re-resolved when agents change and on a
 * lightweight tick (so transient anims can decay back to base). Default idle.
 */
export function useAgentAnimations(
  agents: Record<AgentId, AgentVM>,
  tickMs = 1000,
): Record<AgentId, AnimKey> {
  const store = useRef<Map<AgentId, ResolvedAnim>>(new Map());
  const [keys, setKeys] = useState<Record<AgentId, AnimKey>>(() =>
    recompute(agents, store.current, Date.now()),
  );

  // re-resolve when input agents change
  useEffect(() => {
    setKeys(recompute(agents, store.current, Date.now()));
  }, [agents]);

  // tick to let transient anims decay back to base
  useEffect(() => {
    if (tickMs <= 0) return;
    const id = setInterval(() => {
      setKeys((prev) => {
        const next = recompute(agents, store.current, Date.now());
        // avoid needless re-render if nothing changed
        const changed = (Object.keys(next) as AgentId[]).some((k) => next[k] !== prev[k]);
        return changed ? next : prev;
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [agents, tickMs]);

  return keys;
}

function recompute(
  agents: Record<AgentId, AgentVM>,
  store: Map<AgentId, ResolvedAnim>,
  now: number,
): Record<AgentId, AnimKey> {
  const out = {} as Record<AgentId, AnimKey>;
  (Object.keys(agents) as AgentId[]).forEach((id) => {
    const vm = agents[id];
    const candidate = statusToAnimKey(vm.status, vm.visualStates);
    const next = resolveNext(store.get(id), candidate, now);
    store.set(id, next);
    out[id] = next.key;
  });
  return out;
}
