import * as fs from "fs/promises";
import * as path from "path";

import type { ValidationResult, TrendPaperJournalEvent } from "./trendPaperJournalSchema.ts";
import { appendTrendPaperJournalEvent } from "./trendPaperJournalWriter.ts";
import {
  consumeTrendPaperArmSessionEntry,
  deriveTrendPaperArmSessionStatus,
  readTrendPaperArmSession,
  resolveTrendPaperArmSessionPath,
  validateTrendPaperArmSession,
  type TrendPaperArmSession,
} from "./trendPaperArmSession.ts";

export type TrendPaperArmSessionConsumeReason =
  | "CONSUMED"
  | "NOT_AN_ENTRY_EVENT"
  | "SESSION_MISSING"
  | "SESSION_ID_MISMATCH"
  | "SESSION_NOT_ACTIVE"
  | "SESSION_EXPIRED"
  | "SESSION_LIMIT_REACHED"
  | "SESSION_INVALID"
  | "WRITE_FAILED";

export interface TrendPaperArmSessionWriterOptions {
  journalDir?: string;
  sessionPath?: string;
  expectedSessionId?: string;
  now?: number;
}

export interface TrendPaperArmSessionWriteResult {
  ok: true;
  path: string;
  session: TrendPaperArmSession;
  validation: ValidationResult;
}

export interface TrendPaperArmSessionConsumeResult {
  ok: boolean;
  consumed: boolean;
  reason: TrendPaperArmSessionConsumeReason;
  before: TrendPaperArmSession | null;
  after: TrendPaperArmSession | null;
  path: string;
  liveActivationAllowed: false;
  exchangeOrderAllowed: false;
}

export interface TrendPaperEntryAppendConsumeResult {
  journalAppended: boolean;
  journalPath: string | null;
  sessionConsumed: boolean;
  sessionConsumeReason: TrendPaperArmSessionConsumeReason | null;
  sessionBefore: TrendPaperArmSession | null;
  sessionAfter: TrendPaperArmSession | null;
  operatorAction: "inspect session manually" | null;
}

const SESSION_FILE_NAME = "trend_paper_arm_session.json";
const SESSION_DIR_NAME = "trend-paper";
const SESSION_PATH_SUFFIX = `/${SESSION_DIR_NAME}/${SESSION_FILE_NAME}`;

function resolveSessionPath(options: TrendPaperArmSessionWriterOptions = {}): string {
  const filePath = options.sessionPath
    ? path.resolve(options.sessionPath)
    : resolveTrendPaperArmSessionPath(options.journalDir ?? null);
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.endsWith(SESSION_PATH_SUFFIX)) {
    throw new Error("trend_paper_arm_session_path_not_allowed");
  }
  return filePath;
}

function tempSessionPath(filePath: string, now: number) {
  return `${filePath}.tmp-${process.pid}-${now}-${Math.random().toString(16).slice(2)}`;
}

async function atomicWrite(filePath: string, content: string, now: number) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = tempSessionPath(filePath, now);
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function writeTrendPaperArmSession(
  session: TrendPaperArmSession,
  options: TrendPaperArmSessionWriterOptions = {},
): Promise<TrendPaperArmSessionWriteResult> {
  const filePath = resolveSessionPath(options);
  const validation = validateTrendPaperArmSession(session);
  if (!validation.valid) {
    throw new Error(`trend_paper_arm_session_validation_failed:${validation.errors.join(",")}`);
  }
  const now = typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now();
  await atomicWrite(filePath, `${JSON.stringify(session, null, 2)}\n`, now);
  return { ok: true, path: filePath, session, validation };
}

export async function consumeTrendPaperArmSessionEntryPersisted(
  session: TrendPaperArmSession | null | undefined,
  options: TrendPaperArmSessionWriterOptions = {},
): Promise<TrendPaperArmSessionConsumeResult> {
  const filePath = resolveSessionPath(options);
  const base = {
    before: session ?? null,
    after: null,
    path: filePath,
    liveActivationAllowed: false as const,
    exchangeOrderAllowed: false as const,
  };
  if (!session) {
    return { ok: false, consumed: false, reason: "SESSION_MISSING", ...base };
  }
  const snapshot = await readTrendPaperArmSession({ filePath });
  if (!snapshot.exists || !snapshot.session) {
    return { ok: false, consumed: false, reason: "SESSION_MISSING", ...base };
  }
  const persisted = snapshot.session;
  const persistedBase = { ...base, before: persisted };
  if (options.expectedSessionId && persisted.sessionId !== options.expectedSessionId) {
    return { ok: false, consumed: false, reason: "SESSION_ID_MISMATCH", ...persistedBase };
  }
  const validation = validateTrendPaperArmSession(persisted);
  if (!validation.valid) {
    return { ok: false, consumed: false, reason: "SESSION_INVALID", ...persistedBase };
  }
  const now = typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now();
  const status = deriveTrendPaperArmSessionStatus(persisted, now);
  if (status === "EXPIRED") {
    return { ok: false, consumed: false, reason: "SESSION_EXPIRED", ...persistedBase };
  }
  if (status === "LIMIT_REACHED") {
    return { ok: false, consumed: false, reason: "SESSION_LIMIT_REACHED", ...persistedBase };
  }
  if (status !== "ACTIVE") {
    return { ok: false, consumed: false, reason: "SESSION_NOT_ACTIVE", ...persistedBase };
  }
  const after = consumeTrendPaperArmSessionEntry(persisted);
  try {
    await writeTrendPaperArmSession(after, { ...options, sessionPath: filePath, now });
    return {
      ok: true,
      consumed: true,
      reason: "CONSUMED",
      before: persisted,
      after,
      path: filePath,
      liveActivationAllowed: false,
      exchangeOrderAllowed: false,
    };
  } catch {
    return { ok: false, consumed: false, reason: "WRITE_FAILED", ...persistedBase };
  }
}

export async function appendTrendPaperEntryAndConsumeSession(input: {
  action: string;
  journalEventDraft: TrendPaperJournalEvent | null;
  validation: ValidationResult | null;
  trendPaperArmSession: TrendPaperArmSession | null | undefined;
  writerOptions?: TrendPaperArmSessionWriterOptions;
  appendJournalEvent?: typeof appendTrendPaperJournalEvent;
  consumeSession?: typeof consumeTrendPaperArmSessionEntryPersisted;
}): Promise<TrendPaperEntryAppendConsumeResult> {
  if (
    input.action === "NO_ACTION" ||
    !input.journalEventDraft ||
    !input.validation?.valid
  ) {
    return {
      journalAppended: false,
      journalPath: null,
      sessionConsumed: false,
      sessionConsumeReason: null,
      sessionBefore: input.trendPaperArmSession ?? null,
      sessionAfter: null,
      operatorAction: null,
    };
  }

  const append = input.appendJournalEvent ?? appendTrendPaperJournalEvent;
  let appendResult: Awaited<ReturnType<typeof appendTrendPaperJournalEvent>>;
  try {
    appendResult = await append(input.journalEventDraft);
  } catch {
    return {
      journalAppended: false,
      journalPath: null,
      sessionConsumed: false,
      sessionConsumeReason: null,
      sessionBefore: input.trendPaperArmSession ?? null,
      sessionAfter: null,
      operatorAction: null,
    };
  }

  // T-3H-2 fix: a one-entry paper-arm session is consumed ONLY by an ENTRY event.
  // Exit / invalidation / partial / cancel events append their journal but must NOT attempt
  // to consume the session (it was already consumed/LIMIT_REACHED at entry) — otherwise the
  // normal exit would emit a false operatorAction="inspect session manually".
  const isEntryEvent =
    input.action === "CREATE_PAPER_ENTRY" || input.journalEventDraft.eventType === "TREND_PAPER_ENTRY";
  if (!isEntryEvent) {
    return {
      journalAppended: true,
      journalPath: appendResult.path,
      sessionConsumed: false,
      sessionConsumeReason: "NOT_AN_ENTRY_EVENT",
      sessionBefore: input.trendPaperArmSession ?? null,
      sessionAfter: null,
      operatorAction: null, // exit/closed-trade is normal — never a manual-inspect warning
    };
  }

  const consume = input.consumeSession ?? consumeTrendPaperArmSessionEntryPersisted;
  const consumeResult = await consume(input.trendPaperArmSession ?? null, input.writerOptions ?? {});
  return {
    journalAppended: true,
    journalPath: appendResult.path,
    sessionConsumed: consumeResult.consumed,
    sessionConsumeReason: consumeResult.consumed ? "CONSUMED" : consumeResult.reason,
    sessionBefore: consumeResult.before,
    sessionAfter: consumeResult.after,
    operatorAction: consumeResult.consumed ? null : "inspect session manually",
  };
}
