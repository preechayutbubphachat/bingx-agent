// dashboard/lib/trend/trendTransitionMonitor.ts
// Phase T-1M — Trend Transition Monitor (read-only alerting, monitor-only).
// Pure: no I/O, no side effects, no order/execution intent. Always paper/live activation false.

import type { TrendStrategy } from "./trendStrategy.ts";
import type { CanonicalMarketRegime } from "../market-regime/canonicalMarketRegime.ts";
import type { IndicatorGate } from "../grid/indicatorGate.ts";
import type { TrendZoneShadow } from "../market-regime/trendZoneBuilder.ts";

export type TrendTransitionStatus =
  | "IDLE_NO_TRADE"
  | "WATCHING_PULLBACK"
  | "ENTRY_ZONE_REACHED"
  | "AWAITING_CONFIRMATION"
  | "RISK_REJECTED"
  | "SETUP_INVALIDATED"
  | "REGIME_CHANGED"
  | "SAFETY_BLOCK";

export type TrendTransitionSeverity = "info" | "watch" | "warning" | "critical";

export interface TrendTransitionMonitorInput {
  trendStrategy: TrendStrategy | null | undefined;
  canonicalMarketRegime: CanonicalMarketRegime | null | undefined;
  indicatorGate?: IndicatorGate | null | undefined;
  trendZoneCandidate?: TrendZoneShadow | null | undefined;
  currentPrice?: number | null | undefined;
  checkedAt?: string | null | undefined;
}

export interface TrendTransitionMonitor {
  status: TrendTransitionStatus;
  severity: TrendTransitionSeverity;
  message: string;
  operatorAction: string;
  shouldNotifyOperator: boolean;
  checkedAt: string | null;
  watchedFields: {
    trendStatus: string | null;
    riskStatus: string | null;
    direction: "LONG" | "SHORT" | null;
    currentPrice: number | null;
    entryZone: [number, number] | null;
    invalidation: number | null;
    target1: number | null;
    rewardRisk: number | null;
  };
  paperActivationAllowed: false;
  liveActivationAllowed: false;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function regimeMatchesDirection(regime: string | null | undefined, direction: "LONG" | "SHORT" | null): boolean {
  if (direction === "SHORT") return regime === "DOWNTREND";
  if (direction === "LONG") return regime === "UPTREND";
  // no active direction → matches only if regime is a trend regime (still eligible context)
  return regime === "DOWNTREND" || regime === "UPTREND";
}

export function evaluateTrendTransitionMonitor(input: TrendTransitionMonitorInput): TrendTransitionMonitor {
  const ts = input.trendStrategy ?? null;
  const regime = input.canonicalMarketRegime?.regime ?? null;
  const checkedAt = typeof input.checkedAt === "string" ? input.checkedAt : null;

  const watchedFields: TrendTransitionMonitor["watchedFields"] = {
    trendStatus: ts?.status ?? null,
    riskStatus: ts?.riskStatus ?? null,
    direction: ts?.direction ?? null,
    currentPrice: finite(input.currentPrice) ? input.currentPrice : (ts?.currentPrice ?? null),
    entryZone: ts?.entryZone ?? null,
    invalidation: ts?.invalidation ?? null,
    target1: ts?.target1 ?? null,
    rewardRisk: ts?.rewardRisk ?? null,
  };

  const lock = { paperActivationAllowed: false as const, liveActivationAllowed: false as const, checkedAt, watchedFields };
  const activationState = ts as { paperActivationAllowed?: unknown; liveActivationAllowed?: unknown } | null;

  // 1) SAFETY_BLOCK — defensive: missing strategy or any activation flag unexpectedly true
  if (!ts || activationState?.paperActivationAllowed === true || activationState?.liveActivationAllowed === true) {
    return {
      status: "SAFETY_BLOCK",
      severity: "critical",
      message: "ตรวจพบสภาวะผิดปกติของ trend strategy หรือ activation flag — บล็อกเพื่อความปลอดภัย",
      operatorAction: "หยุดและตรวจสอบระบบ ห้าม arm/ส่งคำสั่งใด ๆ",
      shouldNotifyOperator: true,
      ...lock,
    };
  }

  // 2) REGIME_CHANGED — regime ไม่ใช่ trend ที่ตรงกับ setup เดิม
  if (!regimeMatchesDirection(regime, ts.direction)) {
    return {
      status: "REGIME_CHANGED",
      severity: "warning",
      message: `Regime เปลี่ยนเป็น ${regime ?? "UNKNOWN"} ไม่ตรงกับ setup เดิม`,
      operatorAction: "Regime เปลี่ยน หยุดติดตาม setup เดิม",
      shouldNotifyOperator: true,
      ...lock,
    };
  }

  // 3) map by trendStrategy.status
  switch (ts.status) {
    case "WATCHING_PULLBACK":
      return {
        status: "WATCHING_PULLBACK",
        severity: "watch",
        message: "ราคาเริ่มเด้งกลับเข้าใกล้โซน เฝ้าดูต่อ",
        operatorAction: "ราคาเริ่มเด้งกลับเข้าใกล้โซน เฝ้าดูต่อ",
        shouldNotifyOperator: true,
        ...lock,
      };
    case "AWAITING_CONFIRMATION":
      return {
        status: "AWAITING_CONFIRMATION",
        severity: "warning",
        message: "ราคาเข้าโซนแล้ว รอ 5m confirmation",
        operatorAction: "ราคาเข้าโซนแล้ว รอ 5m confirmation ห้ามส่งคำสั่งอัตโนมัติ",
        shouldNotifyOperator: true,
        ...lock,
      };
    case "RISK_REJECTED":
      return {
        status: "RISK_REJECTED",
        severity: "warning",
        message: "Setup ถูก reject ด้วย risk gate",
        operatorAction: "Setup ถูก reject ด้วย risk gate ห้าม arm paper",
        shouldNotifyOperator: true,
        ...lock,
      };
    case "INVALIDATED":
      return {
        status: "SETUP_INVALIDATED",
        severity: "critical",
        message: "Trend setup invalidated (ราคาทะลุ invalidation)",
        operatorAction: "Trend setup invalidated รีเซ็ตแผน",
        shouldNotifyOperator: true,
        ...lock,
      };
    case "SETUP_READY":
      return {
        status: "ENTRY_ZONE_REACHED",
        severity: "warning",
        message: "Setup พร้อม (ยังต้องรอ confirmation)",
        operatorAction: "เฝ้าดูการเข้าโซน + รอ 5m confirmation ห้ามส่งคำสั่งอัตโนมัติ",
        shouldNotifyOperator: true,
        ...lock,
      };
    case "NO_TRADE":
    default:
      // NO_TRADE_NEAR_TARGET หรือ NO_TRADE อื่น ๆ → idle, ไม่แจ้งเตือน
      return {
        status: "IDLE_NO_TRADE",
        severity: "info",
        message: ts.riskStatus === "NO_TRADE_NEAR_TARGET"
          ? "ราคาใกล้ target เกินไป ยังไม่มี setup (ห้ามไล่ราคา)"
          : "ยังไม่มี trend setup",
        operatorAction: "รอ pullback ใหม่ ห้ามไล่ราคา",
        shouldNotifyOperator: false,
        ...lock,
      };
  }
}
