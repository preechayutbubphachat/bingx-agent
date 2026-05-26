/**
 * alertEngine.ts
 * Phase G — Extended Monitoring & Alerts
 *
 * Pure functions สำหรับ compute alert conditions จากข้อมูล runtime
 * ไม่มี side effects — รับ data เข้า → return Alert[] ออก
 *
 * Alert sources:
 *   1. Snapshot freshness  — ข้อมูลเก่าเกิน threshold
 *   2. Task errors         — scheduler task มี error
 *   3. Scheduler down      — heartbeat ไม่ได้อัปเดตนาน
 *   4. Data missing        — ไม่พบ root files
 *   5. Task never run      — task ที่สำคัญไม่เคยรัน
 *
 * Thresholds (สามารถ override ผ่าน env vars):
 *   SNAPSHOT_WARN_SEC       = 300   (5 min)
 *   SNAPSHOT_CRITICAL_SEC   = 900   (15 min)
 *   HEARTBEAT_WARN_SEC      = 300   (5 min — heartbeat file เก่า)
 *   HEARTBEAT_CRITICAL_SEC  = 600   (10 min)
 *   TASK_ERROR_WARN_COUNT   = 1
 *   TASK_ERROR_CRITICAL_COUNT = 3
 */

import type {
  SchedulerHeartbeat,
  SchedulerTask,
  HeartbeatReadResult,
} from "@/lib/readSchedulerHeartbeat";

// ─── Alert types ──────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical" | "fatal";

export type AlertCode =
  | "SNAPSHOT_STALE"
  | "SNAPSHOT_MISSING"
  | "TASK_ERROR"
  | "TASK_NEVER_RUN"
  | "SCHEDULER_DOWN"
  | "HEARTBEAT_STALE"
  | "HEARTBEAT_MISSING"
  | "DATA_MISSING";

export type Alert = {
  id: string;                  // unique — สำหรับ React key
  code: AlertCode;
  severity: AlertSeverity;
  title: string;
  detail: string;
  suggestedAction: string;
  context?: Record<string, string | number | boolean | null>;
};

// ─── Thresholds ───────────────────────────────────────────────────────────────

type Thresholds = {
  snapshotWarnSec: number;
  snapshotCriticalSec: number;
  heartbeatWarnSec: number;
  heartbeatCriticalSec: number;
  taskErrorWarnCount: number;
  taskErrorCriticalCount: number;
};

function resolveThresholds(): Thresholds {
  function envInt(key: string, fallback: number): number {
    const v = parseInt(process.env[key] ?? "", 10);
    return isNaN(v) || v <= 0 ? fallback : v;
  }
  return {
    snapshotWarnSec:        envInt("SNAPSHOT_WARN_SEC", 300),
    snapshotCriticalSec:    envInt("SNAPSHOT_CRITICAL_SEC", 900),
    heartbeatWarnSec:       envInt("HEARTBEAT_WARN_SEC", 300),
    heartbeatCriticalSec:   envInt("HEARTBEAT_CRITICAL_SEC", 600),
    taskErrorWarnCount:     envInt("TASK_ERROR_WARN_COUNT", 1),
    taskErrorCriticalCount: envInt("TASK_ERROR_CRITICAL_COUNT", 3),
  };
}

// ─── Freshness input type ─────────────────────────────────────────────────────

export type FreshnessInput = {
  tag: "FRESH" | "STALE" | "OLD" | "MISSING" | "UNKNOWN";
  ageSec: number | null;
  hasDecision: boolean;
  hasSnapshot: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSec(sec: number | null): string {
  if (sec === null) return "unknown time";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

// Critical tasks ที่ต้องรัน — ถ้า never run ถือว่า warn
const CRITICAL_TASKS = ["full_snapshot", "run_cycle"] as const;

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * computeAlerts
 *
 * @param freshness  — ข้อมูลจาก readLatest() (freshness + hasDecision/hasSnapshot)
 * @param heartbeat  — ผลจาก readSchedulerHeartbeat()
 * @returns Alert[]  — เรียงลำดับ severity: fatal → critical → warning → info
 */
export function computeAlerts(
  freshness: FreshnessInput | null,
  heartbeat: HeartbeatReadResult | null
): Alert[] {
  const alerts: Alert[] = [];
  const th = resolveThresholds();

  // ─── 1. Data missing ────────────────────────────────────────────────────────
  if (freshness && !freshness.hasDecision) {
    alerts.push({
      id: "data_missing_decision",
      code: "DATA_MISSING",
      severity: "critical",
      title: "ไม่พบ latest_decision.json",
      detail: "ไม่พบไฟล์ latest_decision.json ใน root dir — dashboard ไม่มีข้อมูลวิเคราะห์",
      suggestedAction: "ตรวจ BINGX_AGENT_DIR และรัน snapshot cycle ใหม่",
    });
  }

  if (freshness && !freshness.hasSnapshot) {
    alerts.push({
      id: "data_missing_snapshot",
      code: "DATA_MISSING",
      severity: "critical",
      title: "ไม่พบ market_snapshot.json",
      detail: "ไม่พบไฟล์ market_snapshot.json ใน root dir — ข้อมูลตลาดหาย",
      suggestedAction: "ตรวจ BINGX_AGENT_DIR และรัน full snapshot",
    });
  }

  // ─── 2. Snapshot staleness ──────────────────────────────────────────────────
  if (freshness && (freshness.hasDecision || freshness.hasSnapshot)) {
    const age = freshness.ageSec;
    if (age !== null) {
      if (age >= th.snapshotCriticalSec) {
        alerts.push({
          id: "snapshot_stale_critical",
          code: "SNAPSHOT_STALE",
          severity: "critical",
          title: `ข้อมูลเก่ามาก (${formatSec(age)})`,
          detail: `Snapshot ไม่ได้อัปเดตมา ${formatSec(age)} — เกิน threshold ${formatSec(th.snapshotCriticalSec)}`,
          suggestedAction: "รัน full snapshot ทันที — ตรวจว่า server.cjs กำลังทำงานอยู่",
          context: { ageSec: age, thresholdSec: th.snapshotCriticalSec },
        });
      } else if (age >= th.snapshotWarnSec) {
        alerts.push({
          id: "snapshot_stale_warn",
          code: "SNAPSHOT_STALE",
          severity: "warning",
          title: `ข้อมูลเริ่มเก่า (${formatSec(age)})`,
          detail: `Snapshot ไม่ได้อัปเดตมา ${formatSec(age)} — เกิน warn threshold ${formatSec(th.snapshotWarnSec)}`,
          suggestedAction: "ตรวจว่า snapshot cycle ทำงานปกติ",
          context: { ageSec: age, thresholdSec: th.snapshotWarnSec },
        });
      }
    } else if (freshness.tag === "UNKNOWN" || freshness.tag === "MISSING") {
      alerts.push({
        id: "snapshot_age_unknown",
        code: "SNAPSHOT_STALE",
        severity: "warning",
        title: "ไม่ทราบอายุข้อมูล",
        detail: "ไม่สามารถอ่าน mtime ของไฟล์ได้ — freshness = UNKNOWN",
        suggestedAction: "ตรวจ filesystem permissions ของ root dir",
      });
    }
  }

  // ─── 3. Heartbeat missing/stale ─────────────────────────────────────────────
  if (!heartbeat || !heartbeat.ok) {
    alerts.push({
      id: "heartbeat_missing",
      code: "HEARTBEAT_MISSING",
      severity: "warning",
      title: "ไม่พบ scheduler heartbeat",
      detail: heartbeat?.warning ?? "scheduler_heartbeat.json ไม่พบใน root dir",
      suggestedAction: "ตรวจว่า server.cjs รันอยู่และ BINGX_AGENT_DIR ถูกต้อง",
    });
  } else {
    const hbAge = heartbeat.ageSec;
    if (hbAge !== null) {
      if (hbAge >= th.heartbeatCriticalSec) {
        alerts.push({
          id: "heartbeat_stale_critical",
          code: "HEARTBEAT_STALE",
          severity: "critical",
          title: `Scheduler หยุดทำงาน? (heartbeat ${formatSec(hbAge)} ago)`,
          detail: `scheduler_heartbeat.json ไม่ได้อัปเดตมา ${formatSec(hbAge)} — อาจหมายความว่า server.cjs หยุดทำงาน`,
          suggestedAction: "ตรวจ server.cjs process — restart ถ้าจำเป็น",
          context: { heartbeatAgeSec: hbAge },
        });
      } else if (hbAge >= th.heartbeatWarnSec) {
        alerts.push({
          id: "heartbeat_stale_warn",
          code: "HEARTBEAT_STALE",
          severity: "warning",
          title: `Heartbeat เก่า (${formatSec(hbAge)} ago)`,
          detail: `scheduler_heartbeat.json ไม่ได้อัปเดตมา ${formatSec(hbAge)}`,
          suggestedAction: "ตรวจสถานะ server.cjs",
          context: { heartbeatAgeSec: hbAge },
        });
      }
    }
  }

  // ─── 4. Task errors ──────────────────────────────────────────────────────────
  if (heartbeat?.ok && heartbeat.heartbeat) {
    const tasks = heartbeat.heartbeat.tasks;
    for (const [taskKey, task] of Object.entries(tasks)) {
      if (!task) continue;

      const isError =
        task.last_status === "error" || task.last_status === "startup_error";
      const errCount = task.error_count ?? 0;

      if (isError && errCount >= th.taskErrorCriticalCount) {
        alerts.push({
          id: `task_error_critical_${taskKey}`,
          code: "TASK_ERROR",
          severity: "critical",
          title: `[${taskKey}] Error ${errCount} ครั้ง`,
          detail: task.last_error
            ? task.last_error.slice(0, 150)
            : "Task มี error แต่ไม่มี error message",
          suggestedAction: `ตรวจ server.cjs log สำหรับ task: ${taskKey}`,
          context: { task: taskKey, errorCount: errCount },
        });
      } else if (isError && errCount >= th.taskErrorWarnCount) {
        alerts.push({
          id: `task_error_warn_${taskKey}`,
          code: "TASK_ERROR",
          severity: "warning",
          title: `[${taskKey}] มี Error`,
          detail: task.last_error
            ? task.last_error.slice(0, 150)
            : "Task มี error",
          suggestedAction: `ตรวจ server.cjs log สำหรับ task: ${taskKey}`,
          context: { task: taskKey, errorCount: errCount },
        });
      }
    }

    // ─── 5. Critical tasks never run ───────────────────────────────────────────
    for (const taskKey of CRITICAL_TASKS) {
      const task: SchedulerTask | undefined = tasks[taskKey];
      if (!task) {
        alerts.push({
          id: `task_missing_${taskKey}`,
          code: "TASK_NEVER_RUN",
          severity: "warning",
          title: `[${taskKey}] ไม่พบใน heartbeat`,
          detail: `Task "${taskKey}" ไม่มีใน scheduler_heartbeat.json`,
          suggestedAction: `ตรวจ server.cjs configuration สำหรับ task: ${taskKey}`,
        });
      } else if (task.last_status === "never" && task.run_count === 0) {
        alerts.push({
          id: `task_never_run_${taskKey}`,
          code: "TASK_NEVER_RUN",
          severity: "info",
          title: `[${taskKey}] ยังไม่เคยรัน`,
          detail: `Task "${taskKey}" ยังไม่เคยถูก trigger — อาจเป็นเรื่องปกติถ้าเพิ่ง start server`,
          suggestedAction: `รอ scheduler trigger หรือ trigger manual ผ่าน dashboard`,
        });
      }
    }
  }

  // ─── Sort: fatal → critical → warning → info ─────────────────────────────────
  const order: Record<AlertSeverity, number> = {
    fatal: 0,
    critical: 1,
    warning: 2,
    info: 3,
  };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}

// ─── Severity summary ────────────────────────────────────────────────────────

export type AlertSummary = {
  total: number;
  fatal: number;
  critical: number;
  warning: number;
  info: number;
  highestSeverity: AlertSeverity | "none";
};

export function summarizeAlerts(alerts: Alert[]): AlertSummary {
  const counts = { fatal: 0, critical: 0, warning: 0, info: 0 };
  for (const a of alerts) counts[a.severity]++;

  let highest: AlertSeverity | "none" = "none";
  if (counts.fatal > 0) highest = "fatal";
  else if (counts.critical > 0) highest = "critical";
  else if (counts.warning > 0) highest = "warning";
  else if (counts.info > 0) highest = "info";

  return { total: alerts.length, ...counts, highestSeverity: highest };
}
