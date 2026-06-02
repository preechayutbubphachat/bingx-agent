// Client read-only loader for Trading Caffee HQ.
// SAFETY: GET-only endpoint reads. No runtime writes, no order placement, no approval mutation.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { TradingCafeHqMock } from "./mockData";
import { mapEndpointsToTradingCafeHq } from "./adapter";

type LoadState = "idle" | "loading" | "ready" | "error";

type EndpointResult = {
  data: unknown;
  error: string | null;
};

async function getJson(url: string): Promise<EndpointResult> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return { data: null, error: `${url} returned ${response.status}` };
    }
    if (!contentType.includes("application/json")) {
      return { data: null, error: `${url} did not return JSON` };
    }
    return { data: await response.json(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "unknown endpoint error",
    };
  }
}

export function useTradingCafeHQ(initialData: TradingCafeHqMock, pollMs = 30_000) {
  const [data, setData] = useState<TradingCafeHqMock>(initialData);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState((current) => (current === "ready" ? "ready" : "loading"));
    const [publicHealth, planStatus, paperPerformance] = await Promise.all([
      getJson("/api/public-health"),
      getJson("/api/plan-status"),
      getJson("/api/paper-performance"),
    ]);

    const mapped = mapEndpointsToTradingCafeHq(publicHealth.data, planStatus.data, paperPerformance.data, initialData);
    const errors = [publicHealth.error, planStatus.error, paperPerformance.error].filter((item): item is string => Boolean(item));

    setData(mapped);
    setError(errors.length > 0 ? errors.join(" | ") : null);
    setState(errors.length === 3 ? "error" : "ready");
  }, [initialData]);

  useEffect(() => {
    const run = () => {
      void refresh();
    };
    const firstLoad = window.setTimeout(run, 0);
    if (pollMs <= 0) {
      return () => window.clearTimeout(firstLoad);
    }

    const interval = window.setInterval(run, pollMs);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(interval);
    };
  }, [pollMs, refresh]);

  return { data, state, error, refresh };
}
