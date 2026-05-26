import { NextResponse } from "next/server";

type Severity = "ok" | "warning" | "critical" | "fatal";

type SafeErrorResponseInput = {
  code: string;
  message: string;
  status?: string;
  severity?: Severity;
  warnings?: string[];
  nextActions?: string[];
  extra?: Record<string, unknown>;
};

function safeMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  if (typeof error === "string" && error.trim()) return error.slice(0, 240);
  return fallback;
}

export function safeErrorBody(input: SafeErrorResponseInput) {
  return {
    ok: false,
    status: input.status ?? "ERROR",
    severity: input.severity ?? "critical",
    error: input.code,
    message: input.message,
    readOnly: true,
    warnings: input.warnings ?? [],
    nextActions:
      input.nextActions && input.nextActions.length > 0
        ? input.nextActions
        : ["Check runtime files and server logs", "Run /api/runtime-audit"],
    ...(input.extra ?? {}),
  };
}

export function safeJsonErrorResponse(
  error: unknown,
  input: Omit<SafeErrorResponseInput, "message"> & { fallbackMessage: string },
  status = 200
) {
  return NextResponse.json(
    safeErrorBody({
      ...input,
      message: safeMessage(error, input.fallbackMessage),
    }),
    { status }
  );
}
