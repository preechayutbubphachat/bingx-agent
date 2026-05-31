import crypto from "crypto";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";

export const KILL_SWITCH_EFFECT_SCOPE = "global_trade_actions" as const;

const KILL_SWITCH_STATE_SCHEMA_VERSION = "operator_kill_switch_state_v1" as const;
const KILL_SWITCH_AUDIT_SCHEMA_VERSION = "operator_kill_switch_audit_v1" as const;
const KILL_SWITCH_STATE_FILE_NAME = "kill_switch_state.json";
const KILL_SWITCH_AUDIT_FILE_NAME = "kill_switch_audit.jsonl";

export type KillSwitchEffectScope = typeof KILL_SWITCH_EFFECT_SCOPE;

export type OperatorKillSwitchState = {
  schema_version: typeof KILL_SWITCH_STATE_SCHEMA_VERSION;
  active: boolean;
  reason: string | null;
  actor: string | null;
  actuator: string | null;
  effect_scope: KillSwitchEffectScope;
  updated_at: string | null;
  updated_at_ms: number | null;
};

export type OperatorKillSwitchSnapshot = {
  exists: boolean;
  path: string;
  auditPath: string;
  readError: string | null;
  state: OperatorKillSwitchState;
};

export type SetOperatorKillSwitchStateInput = {
  active: boolean;
  reason?: string | null;
  actor?: string | null;
  actuator?: string | null;
  route?: string | null;
};

export type SetOperatorKillSwitchStateResult = {
  changed: boolean;
  path: string;
  auditPath: string;
  previousState: OperatorKillSwitchState;
  snapshot: OperatorKillSwitchSnapshot;
};

type OperatorKillSwitchAuditEvent = {
  schema_version: typeof KILL_SWITCH_AUDIT_SCHEMA_VERSION;
  ts: number;
  type: "KILL_SWITCH_SET";
  payload: {
    active: boolean;
    previous_active: boolean;
    changed: boolean;
    reason: string | null;
    actor: string | null;
    actuator: string | null;
    route: string | null;
    effect_scope: KillSwitchEffectScope;
    state_path: string;
  };
};

function toText(value: unknown, fallback: string | null = null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function defaultKillSwitchState(): OperatorKillSwitchState {
  return {
    schema_version: KILL_SWITCH_STATE_SCHEMA_VERSION,
    active: false,
    reason: null,
    actor: null,
    actuator: null,
    effect_scope: KILL_SWITCH_EFFECT_SCOPE,
    updated_at: null,
    updated_at_ms: null,
  };
}

export function resolveOperatorDataDir() {
  const env =
    process.env.DATA_DIR ||
    process.env.BINGX_AGENT_DIR ||
    process.env.OBGATE_DATA_DIR ||
    process.env.BINGX_DATA_DIR;

  const cwd = process.cwd();
  const parent = path.resolve(cwd, "..");
  const parent2 = path.resolve(cwd, "..", "..");

  const candidates = [env, cwd, parent, parent2].filter(
    (x): x is string => !!x && typeof x === "string"
  );

  for (const dir of candidates) {
    const markers = [
      path.join(dir, "market_snapshot.json"),
      path.join(dir, "plan_status.json"),
    ];
    if (markers.some((marker) => fssync.existsSync(marker))) {
      return dir;
    }
  }

  return env || cwd;
}

export function resolveKillSwitchPaths(dataDir = resolveOperatorDataDir()) {
  return {
    dataDir,
    statePath: path.join(dataDir, KILL_SWITCH_STATE_FILE_NAME),
    auditPath: path.join(dataDir, KILL_SWITCH_AUDIT_FILE_NAME),
  };
}

async function writeAtomic(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

async function appendJsonl(filePath: string, event: OperatorKillSwitchAuditEvent) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

function normalizeState(value: unknown): OperatorKillSwitchState {
  const base = defaultKillSwitchState();
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    schema_version: KILL_SWITCH_STATE_SCHEMA_VERSION,
    active: Boolean(obj.active),
    reason: toText(obj.reason, null),
    actor: toText(obj.actor, null),
    actuator: toText(obj.actuator, null),
    effect_scope: KILL_SWITCH_EFFECT_SCOPE,
    updated_at: toText(obj.updated_at, null),
    updated_at_ms:
      typeof obj.updated_at_ms === "number" && Number.isFinite(obj.updated_at_ms)
        ? obj.updated_at_ms
        : base.updated_at_ms,
  };
}

export async function readKillSwitchState(): Promise<OperatorKillSwitchSnapshot> {
  const { statePath, auditPath } = resolveKillSwitchPaths();

  try {
    const raw = await fs.readFile(statePath, "utf8");
    return {
      exists: true,
      path: statePath,
      auditPath,
      readError: null,
      state: normalizeState(JSON.parse(raw)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "unknown read failure");
    const normalized =
      message.toLowerCase().includes("enoent") || message.toLowerCase().includes("no such file")
        ? null
        : message;
    return {
      exists: false,
      path: statePath,
      auditPath,
      readError: normalized,
      state: defaultKillSwitchState(),
    };
  }
}

export async function setKillSwitchState(
  input: SetOperatorKillSwitchStateInput
): Promise<SetOperatorKillSwitchStateResult> {
  const previousSnapshot = await readKillSwitchState();
  const previousState = previousSnapshot.state;
  const { statePath, auditPath } = resolveKillSwitchPaths();

  const updatedAtMs = Date.now();
  const nextState: OperatorKillSwitchState = {
    schema_version: KILL_SWITCH_STATE_SCHEMA_VERSION,
    active: Boolean(input.active),
    reason: input.active ? toText(input.reason, null) : null,
    actor: toText(input.actor, null),
    actuator: toText(input.actuator, null),
    effect_scope: KILL_SWITCH_EFFECT_SCOPE,
    updated_at: new Date(updatedAtMs).toISOString(),
    updated_at_ms: updatedAtMs,
  };

  const changed =
    previousState.active !== nextState.active ||
    previousState.reason !== nextState.reason ||
    previousState.actor !== nextState.actor ||
    previousState.actuator !== nextState.actuator;

  await writeAtomic(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

  const auditEvent: OperatorKillSwitchAuditEvent = {
    schema_version: KILL_SWITCH_AUDIT_SCHEMA_VERSION,
    ts: updatedAtMs,
    type: "KILL_SWITCH_SET",
    payload: {
      active: nextState.active,
      previous_active: previousState.active,
      changed,
      reason: toText(input.reason, null),
      actor: nextState.actor,
      actuator: nextState.actuator,
      route: toText(input.route, null),
      effect_scope: KILL_SWITCH_EFFECT_SCOPE,
      state_path: statePath,
    },
  };

  await appendJsonl(auditPath, auditEvent);

  return {
    changed,
    path: statePath,
    auditPath,
    previousState,
    snapshot: {
      exists: true,
      path: statePath,
      auditPath,
      readError: null,
      state: nextState,
    },
  };
}

export function buildKillSwitchResponse(
  snapshot: OperatorKillSwitchSnapshot,
  args?: {
    requestedActive?: boolean | null;
    effectiveActive?: boolean | null;
    source?: string | null;
  }
) {
  return {
    source: toText(args?.source, "operator_runtime_state"),
    requested_active:
      typeof args?.requestedActive === "boolean" ? args.requestedActive : null,
    effective_active:
      typeof args?.effectiveActive === "boolean"
        ? args.effectiveActive
        : snapshot.state.active,
    active: snapshot.state.active,
    reason: snapshot.state.reason,
    actor: snapshot.state.actor,
    actuator: snapshot.state.actuator,
    effect_scope: snapshot.state.effect_scope,
    updated_at: snapshot.state.updated_at,
    updated_at_ms: snapshot.state.updated_at_ms,
    state_path: snapshot.path,
    audit_path: snapshot.auditPath,
    state_exists: snapshot.exists,
    read_error: snapshot.readError,
  };
}
