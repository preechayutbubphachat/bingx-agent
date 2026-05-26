/**
 * PaperModeBanner.tsx
 * Phase H — Paper Trading Readiness
 *
 * Server component — แสดง execution mode ที่ชัดเจนที่ด้านบน dashboard
 * ทำให้ operator รู้ทันทีว่าระบบอยู่ใน mode ใด
 *
 * Mode States:
 *   DANGER      — LIVE_TRADING_ENABLED=true (ไม่ควรเกิด จนกว่า live migration gate ผ่าน)
 *   PAPER       — PAPER_TRADING_ENABLED=true (จำลองเท่านั้น ไม่มี real order)
 *   MONITOR     — ค่า default (live=false, paper=false/not_confirmed) = observe only
 *
 * ไม่แสดง banner ถ้า mode = MONITOR และไม่มีสิ่งผิดปกติ (clean state)
 *
 * Safety:
 * - ไม่ expose secret / API key ใดๆ
 * - ไม่ call BingX API
 * - ไม่แก้ source-of-truth files
 * - อ่านค่า env vars ฝั่ง server เท่านั้น
 */

import { readSafetyFlags } from "@/lib/runtimeConfigValidation";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExecutionMode = "DANGER" | "PAPER" | "MONITOR";

type ModeConfig = {
  icon: string;
  label: string;
  sublabel: string;
  bg: string;
  text: string;
  border: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
};

// ─── Mode configs ─────────────────────────────────────────────────────────────

const MODE_CONFIGS: Record<ExecutionMode, ModeConfig> = {
  DANGER: {
    icon: "🚨",
    label: "LIVE TRADING ENABLED",
    sublabel:
      "⚠️ ระบบอาจส่ง real order ได้ — ห้ามดำเนินการต่อจนกว่าจะผ่าน Live Migration Gate",
    bg: "bg-rose-950/70",
    text: "text-rose-200",
    border: "border-rose-600",
    chipBg: "bg-rose-900/60",
    chipText: "text-rose-300",
    chipBorder: "border-rose-700",
  },
  PAPER: {
    icon: "📄",
    label: "PAPER TRADING ACTIVE",
    sublabel: "จำลองการเทรดเท่านั้น — ไม่มีการส่ง real order ไปยัง BingX",
    bg: "bg-amber-950/50",
    text: "text-amber-200",
    border: "border-amber-700/60",
    chipBg: "bg-amber-900/40",
    chipText: "text-amber-300",
    chipBorder: "border-amber-700",
  },
  MONITOR: {
    icon: "🔍",
    label: "Monitor Mode",
    sublabel: "Live & Paper Disabled — ระบบอยู่ใน read-only / observe mode",
    bg: "bg-neutral-900/50",
    text: "text-neutral-300",
    border: "border-neutral-700/50",
    chipBg: "bg-neutral-800/60",
    chipText: "text-neutral-400",
    chipBorder: "border-neutral-700",
  },
};

// ─── Helper: resolve mode ────────────────────────────────────────────────────

function resolveMode(
  liveTradingEnabled: boolean,
  paperTradingEnabled: boolean | "not_confirmed"
): ExecutionMode {
  if (liveTradingEnabled === true) return "DANGER";
  if (paperTradingEnabled === true) return "PAPER";
  return "MONITOR";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaperModeBanner() {
  const flags = readSafetyFlags();

  const orderPlacementEnabled =
    (process.env.ENABLE_ORDER_PLACEMENT ?? "false").toLowerCase() === "true";
  const tradingSafetyMode =
    (process.env.TRADING_SAFETY_MODE ?? "readonly").toLowerCase();

  const mode = resolveMode(flags.liveTradingEnabled, flags.paperTradingEnabled);
  const config = MODE_CONFIGS[mode];

  // MONITOR mode ที่สะอาด (ค่า default ปกติ) — ไม่แสดง banner เพื่อไม่ให้ noisy
  // แต่ถ้า orderPlacement หรือ tradingSafetyMode ผิดปกติ ยังแสดงเสมอ
  const isCleanMonitorMode =
    mode === "MONITOR" &&
    !orderPlacementEnabled &&
    tradingSafetyMode === "readonly";

  if (isCleanMonitorMode) return null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${config.bg} ${config.border}`}
      role="status"
      aria-label={`Execution mode: ${mode}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode label */}
        <span className={`text-sm font-bold tracking-wide ${config.text}`}>
          {config.icon} {config.label}
        </span>

        {/* Chips: flags */}
        <div className="flex flex-wrap gap-2">
          <ModeChip
            label="Live"
            value={flags.liveTradingEnabled ? "ON 🔴" : "OFF"}
            config={config}
            danger={flags.liveTradingEnabled}
          />
          <ModeChip
            label="Paper"
            value={
              flags.paperTradingEnabled === true
                ? "ON"
                : flags.paperTradingEnabled === "not_confirmed"
                ? "NOT_SET"
                : "OFF"
            }
            config={config}
            highlight={flags.paperTradingEnabled === true}
          />
          <ModeChip
            label="Orders"
            value={orderPlacementEnabled ? "ENABLED ⚠️" : "DISABLED"}
            config={config}
            danger={orderPlacementEnabled}
          />
          <ModeChip
            label="Safety"
            value={tradingSafetyMode.toUpperCase()}
            config={config}
          />
        </div>
      </div>

      {/* Sublabel */}
      <p className={`mt-1.5 text-xs ${config.text} opacity-80`}>
        {config.sublabel}
      </p>

      {/* Extra: DANGER mode warning */}
      {mode === "DANGER" && (
        <div className="mt-2 rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
          🛑 กรุณาตรวจ LIVE_TRADING_ENABLED ใน .env.local และปิดทันที ถ้ายังไม่ผ่าน Live Migration Gate
        </div>
      )}

      {/* Extra: PAPER mode note */}
      {mode === "PAPER" && (
        <div className="mt-2 text-xs text-amber-400/70">
          Paper orders จะถูก simulate ผ่าน PaperBrokerAdapter — ไม่กระทบ BingX account จริง
        </div>
      )}
    </div>
  );
}

// ─── Chip subcomponent ────────────────────────────────────────────────────────

function ModeChip({
  label,
  value,
  config,
  danger = false,
  highlight = false,
}: {
  label: string;
  value: string;
  config: ModeConfig;
  danger?: boolean;
  highlight?: boolean;
}) {
  const colorClass = danger
    ? "bg-rose-900/60 text-rose-300 border-rose-700"
    : highlight
    ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
    : `${config.chipBg} ${config.chipText} ${config.chipBorder}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono ${colorClass}`}
    >
      <span className="opacity-60">{label}:</span>
      <span>{value}</span>
    </span>
  );
}
