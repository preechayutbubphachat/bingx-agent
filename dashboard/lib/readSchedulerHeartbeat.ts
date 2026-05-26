/**
 * readSchedulerHeartbeat.ts
 * Phase F — Live Validation & Monitoring
 *
 * อ่านและ parse scheduler_heartbeat.json จาก root dir อย่างปลอดภัย
 * ใช้สำหรับแสดงสถานะ snapshot cycle ใน dashboard
 *
 * Source of truth: C:\bingx-agent\scheduler_heartbeat.json (root file)
 * ไม่ใช่ mirror — ห้าม fallback ไป dashboard/app/public/data/ โดยไม่ warn
 *
 * Schema: scheduler_heartbeat_v1
 */

import { promises as fs } from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "never"
  | "running"
  | "success"
  | "error"
  | "startup_error"
  | string;

export type SchedulerTask = {
  task: string;
  running: boolean;
  last_status: TaskStatus;
  last_started_at: number | null;
  last_finished_at: number | null;
  last_success_at: number | null;
  last_error_at: number | null;
  last_error: string | null;
  last_duration_ms: number | null;
  last_trigger_id: string | null;
  last_success_trigger_id: string | null;
  last_expected_at: number | null;
  last_route: string | null;
  last_method: string | null;
  last_symbol: string | null;
  last_trigger_source: string | null;
  run_count: number;
  success_count: number;
  error_count: number;
  overlap_skip_count: number;
  duplicate_skip_count: number;
};

export type SchedulerHeartbeat = {
  schema_version: string;
  updated_at: number;
  scheduler_model: string;
  data_dir: string;
  tasks: Record<string, SchedulerTask>;
};

export type HeartbeatReadResult =
  | {
      ok: true;
      heartbeat: SchedulerHeartbeat;
      readAt: string;
      sourceKind: "root";
      ageSec: number | null;
      warning: null;
    }
  | {
      ok: false;
      heartbeat: null;
      readAt: string;
      sourceKind: "none";
      ageSec: null;
      warning: string;
    };

// ─── Known task names (for display ordering) ─────────────────────────────────
export const KNOWN_TASKS = [
  "full_snapshot",
  "run_cycle",
  "derivatives_history",
  "volatility_history",
] as const;

export type KnownTask = (typeof KNOWN_TASKS)[number];

// ─── resolveRootDir ───────────────────────────────────────────────────────────

function resolveRootDir(): string {
  const candidates = [
    process.env.DATA_DIR?.trim(),
    process.env.BINGX_DATA_DIR?.trim(),
    process.env.BINGX_AGENT_DIR?.trim(),
    process.env.OBGATE_DATA_DIR?.trim(),
  ].filter(Boolean) as string[];

  if (candidates.length > 0) return path.resolve(candidates[0]);
  return path.resolve("C:\\bingx-agent");
}

// ─── Main reader ──────────────────────────────────────────────────────────────

export async function readSchedulerHeartbeat(): Promise<HeartbeatReadResult> {
  const readAt = new Date().toISOString();

  try {
    const rootDir = resolveRootDir();
    const filePath = path.join(rootDir, "scheduler_heartbeat.json");

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch {
      return {
        ok: false,
        heartbeat: null,
        readAt,
        sourceKind: "none",
        ageSec: null,
        warning: `scheduler_heartbeat.json not found at root dir`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        heartbeat: null,
        readAt,
        sourceKind: "none",
        ageSec: null,
        warning: `scheduler_heartbeat.json is not valid JSON`,
      };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        heartbeat: null,
        readAt,
        sourceKind: "none",
        ageSec: null,
        warning: `scheduler_heartbeat.json has unexpected shape`,
      };
    }

    const hb = parsed as SchedulerHeartbeat;

    // คำนวณ age จาก updated_at
    let ageSec: number | null = null;
    if (typeof hb.updated_at === "number" && hb.updated_at > 0) {
      ageSec = Math.floor((Date.now() - hb.updated_at) / 1000);
    }

    return {
      ok: true,
      heartbeat: hb,
      readAt,
      sourceKind: "root",
      ageSec,
      warning: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      heartbeat: null,
      readAt,
      sourceKind: "none",
      ageSec: null,
      warning: `readSchedulerHeartbeat unexpected error: ${msg}`,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format seconds เป็น human-readable */
export function formatAgeSec(ageSec: number | null): string {
  if (ageSec === null) return "—";
  if (ageSec < 60) return `${ageSec}s`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ${ageSec % 60}s`;
  return `${Math.floor(ageSec / 3600)}h ${Math.floor((ageSec % 3600) / 60)}m`;
}

/** สรุป freshness tag จาก age */
export function heartbeatFreshnessTag(
  ageSec: number | null
): "FRESH" | "STALE" | "OLD" | "UNKNOWN" {
  if (ageSec === null) return "UNKNOWN";
  if (ageSec > 600) return "OLD";
  if (ageSec > 180) return "STALE";
  return "FRESH";
}

/** สรุป status badge ของแต่ละ task */
export function taskStatusLabel(task: SchedulerTask): {
  label: string;
  tone: "ok" | "warn" | "error" | "neutral";
} {
  if (task.running) return { label: "RUNNING", tone: "ok" };
  if (task.last_status === "never") return { label: "NEVER RUN", tone: "neutral" };
  if (task.last_status === "success") return { label: "OK", tone: "ok" };
  if (
    task.last_status === "error" ||
    task.last_status === "startup_error"
  )
    return { label: "ERROR", tone: "error" };
  return { label: task.last_status.toUpperCase(), tone: "warn" };
}
