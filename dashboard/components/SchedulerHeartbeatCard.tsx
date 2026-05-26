/**
 * SchedulerHeartbeatCard.tsx
 * Phase F — Live Validation & Monitoring
 *
 * แสดงสถานะ snapshot cycle จาก scheduler_heartbeat.json
 * 4 tasks: full_snapshot | run_cycle | derivatives_history | volatility_history
 *
 * Props รับ HeartbeatReadResult จาก readSchedulerHeartbeat() (server-side)
 * ถ้า ok=false → แสดง warning state เบา ๆ ไม่ crash
 *
 * ไม่ใช้ "use client" — server component (รับ props, render only)
 */

import type { HeartbeatReadResult, SchedulerTask } from "@/lib/readSchedulerHeartbeat";
import {
  formatAgeSec,
  heartbeatFreshnessTag,
  taskStatusLabel,
  KNOWN_TASKS,
} from "@/lib/readSchedulerHeartbeat";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  result: HeartbeatReadResult | null;
};

// ─── Tone helpers ─────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "error" | "neutral";

function toneClass(tone: Tone, variant: "bg" | "text" | "border"): string {
  const map: Record<Tone, Record<"bg" | "text" | "border", string>> = {
    ok: {
      bg: "bg-emerald-950/30",
      text: "text-emerald-300",
      border: "border-emerald-800/50",
    },
    warn: {
      bg: "bg-amber-950/30",
      text: "text-amber-300",
      border: "border-amber-800/50",
    },
    error: {
      bg: "bg-rose-950/30",
      text: "text-rose-300",
      border: "border-rose-800/50",
    },
    neutral: {
      bg: "bg-neutral-900/30",
      text: "text-neutral-400",
      border: "border-neutral-700/50",
    },
  };
  return map[tone][variant];
}

function freshnessTone(
  tag: "FRESH" | "STALE" | "OLD" | "UNKNOWN"
): Tone {
  if (tag === "FRESH") return "ok";
  if (tag === "STALE") return "warn";
  if (tag === "OLD") return "error";
  return "neutral";
}

// ─── Task display name ────────────────────────────────────────────────────────

function taskDisplayName(taskKey: string): string {
  const names: Record<string, string> = {
    full_snapshot: "Full Snapshot",
    run_cycle: "Run Cycle",
    derivatives_history: "Derivatives History",
    volatility_history: "Volatility History",
  };
  return names[taskKey] ?? taskKey;
}

// ─── Last run time ────────────────────────────────────────────────────────────

function lastRunAgo(task: SchedulerTask): string {
  const ts = task.last_finished_at ?? task.last_started_at;
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  return formatAgeSec(sec);
}

// ─── Sub-component: TaskRow ───────────────────────────────────────────────────

function TaskRow({ taskKey, task }: { taskKey: string; task: SchedulerTask }) {
  const { label, tone } = taskStatusLabel(task);
  const ago = lastRunAgo(task);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
      {/* Task name */}
      <span className="w-40 shrink-0 text-xs font-mono text-neutral-300">
        {taskDisplayName(taskKey)}
      </span>

      {/* Status badge */}
      <span
        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono font-semibold
          ${toneClass(tone, "bg")} ${toneClass(tone, "text")} ${toneClass(tone, "border")}`}
      >
        {task.running ? (
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        ) : null}
        {label}
      </span>

      {/* Last run ago */}
      <span className="text-xs text-neutral-500">
        {ago !== "—" ? `${ago} ago` : "—"}
      </span>

      {/* Error count badge */}
      {task.error_count > 0 && (
        <span className="text-xs font-mono text-rose-400">
          ✗ {task.error_count}
        </span>
      )}

      {/* Success count */}
      {task.success_count > 0 && (
        <span className="text-xs font-mono text-emerald-600">
          ✓ {task.success_count}
        </span>
      )}
    </div>
  );
}

// ─── Sub-component: TaskErrorDetail ──────────────────────────────────────────

function TaskErrorDetail({
  taskKey,
  task,
}: {
  taskKey: string;
  task: SchedulerTask;
}) {
  if (!task.last_error) return null;
  // Truncate long errors
  const msg =
    task.last_error.length > 120
      ? task.last_error.slice(0, 120) + "…"
      : task.last_error;

  return (
    <div className="mt-0.5 rounded border border-rose-900/40 bg-rose-950/20 px-2 py-1 text-xs text-rose-400 font-mono">
      <span className="text-rose-600 mr-1">[{taskKey}]</span>
      {msg}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SchedulerHeartbeatCard({ result }: Props) {
  // ถ้าไม่มี result ให้ silent — ไม่แสดงอะไร
  if (!result) return null;

  // ─── Case: ไม่พบไฟล์ ──────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500">
            ⚙️ Scheduler
          </span>
          <span className="text-xs text-neutral-600">{result.warning}</span>
        </div>
      </div>
    );
  }

  const hb = result.heartbeat;
  const ageSec = result.ageSec;
  const freshnessTag = heartbeatFreshnessTag(ageSec);
  const ftone = freshnessTone(freshnessTag);

  // ─── ลำดับ tasks ──────────────────────────────────────────────────────────
  const orderedKeys: string[] = [
    ...KNOWN_TASKS.filter((k) => k in hb.tasks),
    ...Object.keys(hb.tasks).filter(
      (k) => !(KNOWN_TASKS as readonly string[]).includes(k)
    ),
  ];

  // ─── มี error task ไหน ────────────────────────────────────────────────────
  const errorTasks = orderedKeys.filter((k) => {
    const t = hb.tasks[k];
    return (
      t &&
      (t.last_status === "error" || t.last_status === "startup_error") &&
      t.last_error
    );
  });

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
      {/* Header */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-neutral-200">
          ⚙️ Scheduler Heartbeat
        </span>

        {/* Heartbeat age badge */}
        <span
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono
            ${toneClass(ftone, "bg")} ${toneClass(ftone, "text")} ${toneClass(ftone, "border")}`}
        >
          {freshnessTag === "FRESH" ? "●" : freshnessTag === "STALE" ? "◐" : "○"}{" "}
          {ageSec !== null ? `${formatAgeSec(ageSec)} ago` : "UNKNOWN"}
        </span>

        {/* Scheduler model */}
        <span className="text-xs text-neutral-600">
          model: <code className="text-neutral-500">{hb.scheduler_model}</code>
        </span>
      </div>

      {/* Divider */}
      <div className="mb-2 border-t border-neutral-800" />

      {/* Task rows */}
      <div className="divide-y divide-neutral-800/50">
        {orderedKeys.map((k) => {
          const task = hb.tasks[k];
          if (!task) return null;
          return <TaskRow key={k} taskKey={k} task={task} />;
        })}
      </div>

      {/* Error details (collapsed style) */}
      {errorTasks.length > 0 && (
        <div className="mt-2 space-y-1">
          {errorTasks.map((k) => (
            <TaskErrorDetail key={k} taskKey={k} task={hb.tasks[k]!} />
          ))}
        </div>
      )}
    </div>
  );
}
