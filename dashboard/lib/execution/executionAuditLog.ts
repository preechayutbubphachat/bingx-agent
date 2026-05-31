import * as fs from "fs/promises";
import * as path from "path";

import type { BrokerMode, OrderResult, ReconcileResult } from "../broker/types";
import type { RiskOverlay } from "../riskTypes";
import type { PaperExecutionDecision } from "./paperExecutionEngine";
import type { TradingModeGateResult } from "./tradingModeGate";

export type ExecutionAuditEventType =
  | "AUTH_REJECTED"
  | "RUNNER_REQUESTED"
  | "PLAN_EVALUATED"
  | "RISK_EVALUATED"
  | "INTENT_CREATED"
  | "INTENT_SKIPPED"
  | "INTENT_REJECTED"
  | "ORDER_SIMULATED"
  | "ORDER_SHADOWED"
  | "POSITION_OPENED"
  | "POSITION_CLOSED"
  | "MODE_BLOCKED"
  | "FAIL_SAFE_TRIGGERED"
  | "RECONCILE_RESULT"
  | "LIVE_SHADOW_SUMMARY"
  | "FILL_RESULT"
  | "RUNNER_COMPLETED"
  | "RUNNER_REJECTED";

export type ExecutionAuditEvent = {
  schema_version: "execution_audit_v1";
  ts: number;
  type: ExecutionAuditEventType;
  symbol: string;
  mode: BrokerMode | string;
  eventKey?: string | null;
  candleKey?: string | null;
  payload: Record<string, unknown>;
};

export type ExecutionAuditLogger = {
  append(event: ExecutionAuditEvent): Promise<void>;
  appendMany(events: ExecutionAuditEvent[]): Promise<void>;
  path: string;
};

export type ResolveExecutionAuditLoggerOptions = {
  rootDir?: string | null;
  fileName?: string | null;
  env?: Record<string, string | undefined>;
};

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function redactKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("secret") ||
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("signature") ||
    normalized.includes("passphrase") ||
    normalized.includes("authorization") ||
    normalized === "token" ||
    normalized.endsWith("_token")
  );
}

export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (redactKey(key)) {
        output[key] = "[REDACTED]";
        continue;
      }
      output[key] = sanitizeForAudit(raw);
    }
    return output;
  }

  return String(value);
}

export function buildExecutionAuditPath(rootDir: string, fileName = "execution_audit.jsonl") {
  return path.resolve(rootDir, fileName);
}

export function buildDefaultExecutionAuditPath(options?: ResolveExecutionAuditLoggerOptions) {
  const env = options?.env;
  const explicitPath = toText(env?.EXECUTION_AUDIT_LOG_PATH);
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  const rootDir =
    toText(options?.rootDir) ??
    toText(env?.EXECUTION_AUDIT_ROOT_DIR) ??
    path.resolve(process.cwd(), "tmp");
  const fileName = toText(options?.fileName) ?? toText(env?.EXECUTION_AUDIT_FILE_NAME) ?? "execution_audit.jsonl";
  return buildExecutionAuditPath(rootDir, fileName);
}

export function createExecutionAuditLogger(filePath: string): ExecutionAuditLogger {
  return {
    path: filePath,
    async append(event: ExecutionAuditEvent) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      const line = JSON.stringify(sanitizeForAudit(event));
      await fs.appendFile(filePath, `${line}\n`, "utf8");
    },
    async appendMany(events: ExecutionAuditEvent[]) {
      if (events.length === 0) return;
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      const lines = events.map((event) => JSON.stringify(sanitizeForAudit(event))).join("\n");
      await fs.appendFile(filePath, `${lines}\n`, "utf8");
    },
  };
}

export function ensureExecutionAuditLogger(
  logger?: ExecutionAuditLogger | null,
  options?: ResolveExecutionAuditLoggerOptions
): ExecutionAuditLogger {
  if (logger) return logger;
  return createExecutionAuditLogger(buildDefaultExecutionAuditPath(options));
}

export function createAuditEvent(
  type: ExecutionAuditEventType,
  args: {
    symbol: string;
    mode: BrokerMode | string;
    eventKey?: string | null;
    candleKey?: string | null;
    payload: Record<string, unknown>;
    ts?: number | null;
  }
): ExecutionAuditEvent {
  return {
    schema_version: "execution_audit_v1",
    ts: typeof args.ts === "number" && Number.isFinite(args.ts) ? args.ts : Date.now(),
    type,
    symbol: args.symbol,
    mode: args.mode,
    eventKey: args.eventKey ?? null,
    candleKey: args.candleKey ?? null,
    payload: args.payload,
  };
}

export function hasOpenPositionLike(position: { side?: string | null; size?: number | null } | null | undefined): boolean {
  if (!position) return false;
  const side = toText(position.side)?.toUpperCase();
  const size = typeof position.size === "number" ? position.size : Number(position.size ?? 0);
  return (side === "LONG" || side === "SHORT") && Number.isFinite(size) && size > 0;
}

export function auditPayloadFromDecision(decision: PaperExecutionDecision) {
  return {
    action: decision.action,
    allowed: decision.allowed,
    blockedByIdempotency: decision.blockedByIdempotency,
    reasons: decision.reasons,
    intents: decision.intents.map((intent) => ({
      intentKey: intent.intentKey ?? null,
      parentIntentKey: intent.parentIntentKey ?? null,
      kind: intent.kind,
      side: intent.side ?? null,
      quantity: intent.quantity ?? null,
      orderType: intent.orderType ?? null,
      reduceOnly: intent.reduceOnly ?? false,
      closePosition: intent.closePosition ?? false,
    })),
  };
}

export function classifyIntentEvent(decision: PaperExecutionDecision): ExecutionAuditEventType {
  if (decision.allowed && decision.intents.length > 0) return "INTENT_CREATED";
  if (decision.blockedByIdempotency) return "INTENT_SKIPPED";
  if (!decision.allowed) return "INTENT_REJECTED";
  return "INTENT_SKIPPED";
}

export function auditPayloadFromRisk(risk: RiskOverlay) {
  return {
    status: risk.status,
    truthStatus: risk.truthStatus,
    canOpenNewTrade: risk.canOpenNewTrade,
    shouldFreezeTrading: risk.shouldFreezeTrading,
    shouldReduceRisk: risk.shouldReduceRisk,
    shouldForceExit: risk.shouldForceExit,
    reasons: risk.reasons,
    hardStopReasons: risk.hardStopReasons,
    warnings: risk.warnings,
  };
}

export function auditPayloadFromBrokerResults(results: OrderResult[]) {
  return results.map((result) => ({
    ok: result.ok,
    mode: result.mode,
    actionPermission: result.actionPermission,
    orderId: result.orderId ?? null,
    clientOrderId: result.clientOrderId ?? null,
    status: result.status,
    filledQuantity: result.filledQuantity ?? null,
    averageFillPrice: result.averageFillPrice ?? null,
    rejectedReason: result.rejectedReason ?? null,
    idempotencyKey: result.idempotencyKey ?? null,
  }));
}

export function auditPayloadFromReconcile(sync: ReconcileResult | undefined) {
  if (!sync) return null;
  return {
    ok: sync.ok,
    requiresFreeze: sync.requiresFreeze,
    requiresReduce: sync.requiresReduce,
    requiresForceExit: sync.requiresForceExit,
    requiresCancel: sync.requiresCancel,
    issues: sync.issues,
    lastSyncAtMs: sync.lastSyncAtMs,
  };
}

export function auditPayloadFromGate(gate: TradingModeGateResult) {
  return {
    mode: gate.mode,
    action: gate.action,
    allowStrategy: gate.allowStrategy,
    allowBrokerSync: gate.allowBrokerSync,
    allowExecution: gate.allowExecution,
    allowLiveExecution: gate.allowLiveExecution,
    shadowOnly: gate.shadowOnly,
    actionPermission: gate.actionPermission,
    verdict: gate.verdict,
    blockingConditionIds: gate.blockingConditionIds,
    proofRequirements: gate.proofRequirements,
    freshnessStatus: gate.freshnessStatus,
    safetyEnvelope: gate.safetyEnvelope,
    reasons: gate.reasons,
  };
}

export function inferAuditMode(preferred: BrokerMode | string | null | undefined, fallback: BrokerMode | string) {
  return toText(preferred) ?? fallback;
}

export type ExecutionAuditContract = {
  requiredTypes: ExecutionAuditEventType[];
  presentTypes: string[];
  missingTypes: ExecutionAuditEventType[];
  contractSatisfied: boolean;
};

export function buildExecutionAuditContract(
  eventTypes: Array<string | null | undefined>,
  requiredTypes: ExecutionAuditEventType[]
): ExecutionAuditContract {
  const presentTypes = Array.from(
    new Set(eventTypes.map((item) => toText(item)).filter((item): item is string => Boolean(item)))
  );
  const missingTypes = requiredTypes.filter((item) => !presentTypes.includes(item));

  return {
    requiredTypes,
    presentTypes,
    missingTypes,
    contractSatisfied: missingTypes.length === 0,
  };
}
