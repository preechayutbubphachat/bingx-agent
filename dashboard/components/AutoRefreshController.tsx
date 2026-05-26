"use client";

/**
 * AutoRefreshController.tsx
 * Phase F — Live Validation & Monitoring
 *
 * Client component ที่ auto-refresh page ทุก N วินาที
 * โดยเรียก router.refresh() ซึ่งจะ re-fetch Server Components โดยไม่ full reload
 *
 * Props:
 *   intervalSec  — interval ในวินาที (default 30)
 *   defaultOn    — เปิด auto-refresh เมื่อ mount ครั้งแรก (default true)
 *
 * Env:
 *   NEXT_PUBLIC_AUTO_REFRESH_INTERVAL_SEC — override default interval (optional)
 *
 * Safety:
 *   - ไม่แตะ trading logic / API keys ใดๆ ทั้งสิ้น
 *   - ทำแค่ router.refresh() เท่านั้น — ไม่มี side effect อื่น
 *   - user ปิดได้ตลอดเวลา
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// ─── อ่าน interval จาก env var (NEXT_PUBLIC_ prefix เท่านั้น) ─────────────────
function resolveInterval(propSec: number): number {
  const envRaw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_AUTO_REFRESH_INTERVAL_SEC ?? "")
      : "";
  const envSec = parseInt(envRaw, 10);
  if (!isNaN(envSec) && envSec >= 5) return envSec;
  return propSec;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  intervalSec?: number;
  defaultOn?: boolean;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AutoRefreshController({
  intervalSec = 30,
  defaultOn = true,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const resolvedInterval = resolveInterval(intervalSec);

  const [enabled, setEnabled] = useState(defaultOn);
  const [countdown, setCountdown] = useState(resolvedInterval);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const countdownRef = useRef(resolvedInterval);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const doRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
    setLastRefreshedAt(new Date());
    countdownRef.current = resolvedInterval;
    setCountdown(resolvedInterval);
  }, [router, resolvedInterval]);

  // ─── Tick every 1s ─────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (!enabledRef.current) return;

      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        doRefresh();
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [doRefresh]);

  // ─── Reset countdown เมื่อ toggle หรือ interval เปลี่ยน ────────────────────
  useEffect(() => {
    countdownRef.current = resolvedInterval;
    setCountdown(resolvedInterval);
  }, [enabled, resolvedInterval]);

  // ─── Format last refreshed ─────────────────────────────────────────────────
  function formatLastRefreshed(d: Date | null): string {
    if (!d) return "";
    const secAgo = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secAgo < 60) return `${secAgo}s`;
    return `${Math.floor(secAgo / 60)}m`;
  }

  const handleToggle = () => {
    setEnabled((prev) => !prev);
  };

  const handleNow = () => {
    if (isPending) return;
    doRefresh();
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle button */}
      <button
        type="button"
        onClick={handleToggle}
        title={enabled ? "ปิด auto-refresh" : "เปิด auto-refresh"}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono transition
          ${
            enabled
              ? "border-sky-700/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/40"
              : "border-neutral-700 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/40"
          }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-sky-400 animate-pulse" : "bg-neutral-600"}`} />
        {enabled ? (
          <>
            Auto <span className="tabular-nums">{countdown}s</span>
          </>
        ) : (
          "Auto OFF"
        )}
      </button>

      {/* Manual refresh now */}
      <button
        type="button"
        onClick={handleNow}
        disabled={isPending}
        title="รีเฟรชทันที"
        className={`rounded-lg border px-2.5 py-1 text-xs transition
          ${isPending
            ? "cursor-not-allowed border-neutral-800 text-neutral-600 bg-neutral-900/20"
            : "border-neutral-700 bg-neutral-900/40 text-neutral-400 hover:bg-neutral-800/40"
          }`}
      >
        {isPending ? "…" : "↻"}
      </button>

      {/* Last refreshed */}
      {lastRefreshedAt && !isPending && (
        <span className="text-xs text-neutral-600">
          refreshed {formatLastRefreshed(lastRefreshedAt)} ago
        </span>
      )}
    </div>
  );
}
