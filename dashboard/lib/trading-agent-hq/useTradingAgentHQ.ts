// dashboard/lib/trading-agent-hq/useTradingAgentHQ.ts
// THQ-5 — client hook: fetch public-safe endpoints (relative URLs) → ViewModel via adapter.
// SAFETY: GET only, read-only, no private/execution API, no mutation.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { TradingAgentHQViewModel } from "./viewModel";
import { mapToViewModel } from "./adapter";

type LoadState = "idle" | "loading" | "ready" | "error";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

export function useTradingAgentHQ(initial: TradingAgentHQViewModel, pollMs = 30_000) {
  const [vm, setVm] = useState<TradingAgentHQViewModel>(initial);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState((s) => (s === "ready" ? "ready" : "loading"));
    try {
      // public-safe endpoints only
      const [ph, ps, perf] = await Promise.all([
        getJson("/api/public-health").catch(() => null),
        getJson("/api/paper-status").catch(() => null),
        getJson("/api/paper-performance").catch(() => null),
      ]);
      if (!ph && !ps && !perf) throw new Error("all public-safe endpoints unreachable");
      setVm(mapToViewModel(ph, ps, perf));
      setState("ready");
      setError(null);
    } catch (e) {
      // keep last good vm (or mock); flag honestly
      setError(e instanceof Error ? e.message : "unknown error");
      setState("error");
    }
  }, []);

  useEffect(() => {
    refresh();
    if (pollMs <= 0) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { vm, state, error, refresh };
}
