"use client";

/**
 * SystemHealthBanner.tsx
 * Phase E — Production Hardening
 *
 * แสดงสถานะ production safety ของระบบ ที่ด้านบน dashboard
 * ไม่ใช่ redesign — เป็น minimal status block ที่เพิ่มเข้ามา
 *
 * States ที่รองรับ:
 *   Ready           — healthy: true, no warnings
 *   Warning         — healthy: true, has warnings
 *   Critical        — healthy: false, severity: critical
 *   Missing Source  — code: MISSING_ROOT_FILE
 *   Stale Data      — code: STALE_DATA (severity: warning)
 *   Mirror Fallback — code: MIRROR_FALLBACK
 *   Live Trading Disabled — liveTradingEnabled: false (expected/normal)
 *
 * Props รับมาจาก /api/plan-status ใหม่ (backward-compatible)
 * ถ้า props ไม่มี health ให้ silently ไม่แสดง banner
 */

import { useMemo } from "react";

export type HealthSeverity = "info" | "warning" | "critical" | "fatal";

export type HealthError = {
  code: string;
  severity: HealthSeverity;
  message: string;
  nextAction?: string;
};

export type SystemHealthProps = {
  healthy?: boolean;
  severity?: HealthSeverity;
  safetyFlags?: {
    liveTradingEnabled?: boolean;
    paperTradingEnabled?: boolean | "not_confirmed";
    productionTradingReady?: boolean;
    nodeEnv?: string;
  };
  errors?: HealthError[];
  warnings?: string[];
  sourceStatus?: {
    resolvedFrom?: string;
    rootDirHint?: string;
    envOk?: boolean;
  };
};

type BannerState =
  | "live_trading_disabled" // normal/expected — liveTradingEnabled: false
  | "ready"
  | "warning"
  | "stale"
  | "mirror_fallback"
  | "missing_source"
  | "critical"
  | "fatal";

function getBannerState(props: SystemHealthProps): BannerState {
  const { healthy, severity, errors = [], warnings = [], safetyFlags } = props;

  if (!safetyFlags && healthy === undefined) return "ready"; // no data = silent

  if (severity === "fatal") return "fatal";

  const hasMissingSource = errors.some((e) => e.code === "MISSING_ROOT_FILE");
  if (hasMissingSource) return "missing_source";

  if (severity === "critical" || healthy === false) return "critical";

  const hasMirrorFallback = errors.some((e) => e.code === "MIRROR_FALLBACK") ||
    warnings.some((w) => w.toLowerCase().includes("mirror"));
  if (hasMirrorFallback) return "mirror_fallback";

  const hasStaleData = errors.some((e) => e.code === "STALE_DATA");
  if (hasStaleData) return "stale";

  if (severity === "warning" || warnings.length > 0) return "warning";

  // live trading disabled = expected state — แสดงเป็น info
  if (safetyFlags && safetyFlags.liveTradingEnabled === false) {
    return "live_trading_disabled";
  }

  return "ready";
}

type BannerConfig = {
  icon: string;
  label: string;
  bg: string;
  text: string;
  border: string;
};

const BANNER_CONFIGS: Record<BannerState, BannerConfig> = {
  ready: {
    icon: "✅",
    label: "ระบบพร้อมใช้งาน",
    bg: "bg-emerald-950/40",
    text: "text-emerald-300",
    border: "border-emerald-800/60",
  },
  live_trading_disabled: {
    icon: "🔒",
    label: "Live Trading ปิดอยู่ — Monitor Mode",
    bg: "bg-neutral-900/60",
    text: "text-neutral-300",
    border: "border-neutral-700/60",
  },
  warning: {
    icon: "⚠️",
    label: "มี Warning — ระบบยังทำงานได้",
    bg: "bg-amber-950/40",
    text: "text-amber-300",
    border: "border-amber-800/60",
  },
  stale: {
    icon: "⏳",
    label: "ข้อมูลเก่า — ตรวจ snapshot cycle",
    bg: "bg-amber-950/40",
    text: "text-amber-300",
    border: "border-amber-800/60",
  },
  mirror_fallback: {
    icon: "📋",
    label: "ใช้ข้อมูลสำรอง (Mirror) — root file อาจมีปัญหา",
    bg: "bg-amber-950/40",
    text: "text-amber-300",
    border: "border-amber-800/60",
  },
  missing_source: {
    icon: "❌",
    label: "ไม่พบไฟล์ข้อมูลหลัก — ตรวจ BINGX_AGENT_DIR",
    bg: "bg-rose-950/40",
    text: "text-rose-300",
    border: "border-rose-800/60",
  },
  critical: {
    icon: "🚨",
    label: "ระบบมีปัญหา — ดู error ด้านล่าง",
    bg: "bg-rose-950/40",
    text: "text-rose-300",
    border: "border-rose-800/60",
  },
  fatal: {
    icon: "💀",
    label: "ระบบล้มเหลว — ต้องการความช่วยเหลือจาก operator",
    bg: "bg-rose-950/60",
    text: "text-rose-200",
    border: "border-rose-700",
  },
};

export default function SystemHealthBanner(props: SystemHealthProps) {
  const state = useMemo(() => getBannerState(props), [props]);
  const config = BANNER_CONFIGS[state];

  const { safetyFlags, errors = [], warnings = [], sourceStatus } = props;

  // ไม่แสดง banner ถ้าระบบ ready และ live trading disabled (normal state — ไม่ต้องเตือน)
  // แต่ถ้ามี source status ที่น่าสังเกต ให้แสดง
  const shouldHide = state === "ready" && !sourceStatus?.rootDirHint;
  if (shouldHide) return null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${config.bg} ${config.border}`}
      role="status"
      aria-label={`System health: ${state}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Main label */}
        <span className={`text-sm font-semibold ${config.text}`}>
          {config.icon} {config.label}
        </span>

        {/* Safety flags */}
        {safetyFlags && (
          <div className="flex flex-wrap gap-2">
            <StatusChip
              label="Live Trading"
              value={safetyFlags.liveTradingEnabled === true ? "ON" : "OFF"}
              active={safetyFlags.liveTradingEnabled === true}
              dangerIfActive
            />
            <StatusChip
              label="Paper Trading"
              value={
                safetyFlags.paperTradingEnabled === "not_confirmed"
                  ? "NOT_CONFIRMED"
                  : safetyFlags.paperTradingEnabled === true
                  ? "ON"
                  : "OFF"
              }
              active={safetyFlags.paperTradingEnabled === true}
            />
            <StatusChip
              label="Prod Ready"
              value={safetyFlags.productionTradingReady === true ? "YES" : "NO"}
              active={safetyFlags.productionTradingReady === true}
            />
            {safetyFlags.nodeEnv && (
              <StatusChip
                label="ENV"
                value={safetyFlags.nodeEnv}
                active={safetyFlags.nodeEnv === "production"}
              />
            )}
          </div>
        )}

        {/* Source hint */}
        {sourceStatus?.rootDirHint && (
          <span className="text-xs text-neutral-500">
            root: <code className="text-neutral-400">{sourceStatus.rootDirHint}</code>
          </span>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-2 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
              <span className={`font-mono font-semibold ${config.text}`}>[{e.code}]</span>
              <span className="text-neutral-300">{e.message}</span>
              {e.nextAction && (
                <span className="text-neutral-500">→ {e.nextAction}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* String warnings (from plan-status warnings[]) */}
      {warnings.filter((w) =>
        w.toLowerCase().includes("mirror") || w.toLowerCase().includes("fallback")
      ).map((w, i) => (
        <div key={`warn-${i}`} className="mt-1 text-xs text-amber-400">
          ⚠ {w}
        </div>
      ))}
    </div>
  );
}

// ─── Chip subcomponent ────────────────────────────────────────────────────────

function StatusChip({
  label,
  value,
  active,
  dangerIfActive = false,
}: {
  label: string;
  value: string;
  active: boolean;
  dangerIfActive?: boolean;
}) {
  const colorClass = dangerIfActive && active
    ? "bg-rose-900/60 text-rose-300 border-rose-700"
    : active
    ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
    : "bg-neutral-800/60 text-neutral-400 border-neutral-700";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${colorClass}`}
    >
      <span className="text-neutral-500">{label}:</span>
      <span>{value}</span>
    </span>
  );
}
