"use client";

import { useEffect, useMemo, useState } from "react";

type EndpointState = {
  path: string;
  label: string;
  phase: "loading" | "ready" | "error";
  httpStatus?: number;
  contentType?: string;
  ok?: boolean | null;
  status?: string | null;
  severity?: string | null;
  message?: string | null;
  warnings: string[];
  nextActions: string[];
};

const ENDPOINTS = [
  ["/api/plan-status", "Plan status"],
  ["/api/health", "Health"],
  ["/api/paper-performance", "Paper performance"],
  ["/api/operator-evidence", "Operator evidence"],
  ["/api/m0b-preflight", "M-0B preflight"],
  ["/api/exchange-readiness", "Exchange readiness"],
  ["/api/runtime-audit", "Runtime audit"],
] as const;

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function collectWarnings(payload: any): string[] {
  const direct = asStringArray(payload?.warnings);
  const errors = Array.isArray(payload?.errors)
    ? payload.errors
        .map((x: any) => x?.message ?? x?.code ?? null)
        .filter(Boolean)
        .map(String)
    : [];
  const blockers = asStringArray(payload?.blockers);
  return [...direct, ...errors, ...blockers].slice(0, 4);
}

function collectNextActions(payload: any): string[] {
  const direct = asStringArray(payload?.nextActions);
  const nested = Array.isArray(payload?.errors)
    ? payload.errors
        .map((x: any) => x?.nextAction ?? null)
        .filter(Boolean)
        .map(String)
    : [];
  return [...direct, ...nested].slice(0, 4);
}

function shortMessage(input: unknown) {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

async function probeEndpoint(path: string, label: string): Promise<EndpointState> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();

    if (!contentType.toLowerCase().includes("application/json")) {
      return {
        path,
        label,
        phase: "error",
        httpStatus: res.status,
        contentType,
        ok: false,
        status: "NON_JSON_RESPONSE",
        severity: "critical",
        message: /^\s*</.test(text)
          ? "Endpoint returned HTML/login instead of JSON"
          : "Endpoint did not return JSON",
        warnings: ["API response is not usable by dashboard cards"],
        nextActions: ["Verify Plesk app routing/auth for API paths", "Restart Node app after build"],
      };
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        path,
        label,
        phase: "error",
        httpStatus: res.status,
        contentType,
        ok: false,
        status: "INVALID_JSON",
        severity: "critical",
        message: "Endpoint returned malformed JSON",
        warnings: ["Dashboard cannot parse this endpoint"],
        nextActions: ["Check server logs", "Verify endpoint structured response"],
      };
    }

    const ok =
      typeof payload?.ok === "boolean"
        ? payload.ok
        : typeof payload?.healthy === "boolean"
          ? payload.healthy
          : res.ok;

    return {
      path,
      label,
      phase: "ready",
      httpStatus: res.status,
      contentType,
      ok,
      status: payload?.status ?? payload?.severity ?? (ok ? "OK" : "WARNING"),
      severity: payload?.severity ?? (ok ? "ok" : "warning"),
      message: shortMessage(payload?.message ?? payload?.error ?? payload?._error ?? ""),
      warnings: collectWarnings(payload),
      nextActions: collectNextActions(payload),
    };
  } catch (error) {
    return {
      path,
      label,
      phase: "error",
      ok: false,
      status: "FETCH_FAILED",
      severity: "critical",
      message: error instanceof Error ? shortMessage(error.message) : "Network error",
      warnings: ["Endpoint fetch failed"],
      nextActions: ["Check Node app is running", "Check Plesk reverse proxy route"],
    };
  }
}

function tone(state: EndpointState) {
  if (state.phase === "loading") return "border-neutral-700 bg-neutral-950 text-neutral-300";
  if (state.phase === "error" || state.severity === "critical" || state.severity === "fatal") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  }
  if (state.ok === false || state.severity === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

export default function DashboardDiagnosticsCard() {
  const [states, setStates] = useState<EndpointState[]>(
    ENDPOINTS.map(([path, label]) => ({
      path,
      label,
      phase: "loading",
      warnings: [],
      nextActions: [],
    }))
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next = await Promise.all(ENDPOINTS.map(([path, label]) => probeEndpoint(path, label)));
      if (!cancelled) setStates(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const blockers = useMemo(
    () =>
      states
        .filter((s) => s.phase === "error" || s.ok === false || s.severity === "critical" || s.severity === "fatal")
        .map((s) => `${s.label}: ${s.message || s.status || "needs attention"}`)
        .slice(0, 5),
    [states]
  );

  const nextActions = useMemo(() => {
    const actions = states.flatMap((s) => s.nextActions).filter(Boolean);
    return [...new Set([...actions, "Keep Phase M-0B blocked until all evidence passes"])].slice(0, 6);
  }, [states]);

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-sky-100">Dashboard diagnostics</div>
          <div className="mt-1 text-xs text-sky-100/70">
            Runtime/API readiness summary for operator evidence. Phase M-0B remains BLOCKED.
          </div>
        </div>
        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-100">
          M-0B BLOCKED
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {states.map((state) => (
          <div key={state.path} className={`rounded-xl border p-3 ${tone(state)}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">{state.label}</div>
              <div className="text-[10px] opacity-75">{state.httpStatus ?? "..."}</div>
            </div>
            <div className="mt-1 truncate text-[11px] opacity-80">{state.path}</div>
            <div className="mt-2 text-xs">{state.status ?? state.phase}</div>
            {state.message ? <div className="mt-1 text-[11px] opacity-85">{state.message}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-neutral-950/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Top blockers</div>
          <ul className="mt-2 space-y-1 text-xs text-neutral-200">
            {blockers.length ? blockers.map((x, i) => <li key={i}>- {x}</li>) : <li>No critical API blocker detected.</li>}
          </ul>
        </div>
        <div className="rounded-xl bg-neutral-950/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Next actions</div>
          <ul className="mt-2 space-y-1 text-xs text-neutral-200">
            {nextActions.map((x, i) => (
              <li key={i}>- {x}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
