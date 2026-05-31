import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function toText(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function maskValue(v: string | null | undefined) {
  if (!v) return null;
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}********${v.slice(-2)}`;
}

function readEnvValueFromFile(filePath: string, names: string[]) {
  try {
    if (!fsSync.existsSync(filePath)) return null;
    const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      for (const name of names) {
        if (!trimmed.startsWith(`${name}=`)) continue;
        const raw = trimmed.slice(name.length + 1).trim();
        const unquoted = raw.replace(/^['"]|['"]$/g, "").trim();
        if (unquoted) return unquoted;
      }
    }
  } catch {}
  return null;
}

function getAuthToken(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  const headerKey =
    req.headers.get("x-run-cycle-key") ||
    req.headers.get("x-internal-key") ||
    req.headers.get("x-api-key");

  if (headerKey) return headerKey.trim();

  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey) return urlKey.trim();

  return null;
}

function resolveExpectedSecret() {
  const fromEnv =
    process.env.RUN_CYCLE_TRIGGER_KEY ||
    process.env.INTERNAL_API_KEY ||
    process.env.REFRESH_ENDPOINT_KEY ||
    "";
  if (fromEnv) return fromEnv;

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env.local"),
    path.resolve(process.cwd(), "..", ".env"),
  ];

  for (const filePath of candidates) {
    const fromFile = readEnvValueFromFile(filePath, [
      "RUN_CYCLE_TRIGGER_KEY",
      "INTERNAL_API_KEY",
      "REFRESH_ENDPOINT_KEY",
    ]);
    if (fromFile) return fromFile;
  }

  return "";
}

function verifyAuth(req: NextRequest) {
  const expected = resolveExpectedSecret();

  if (!expected) {
    return {
      ok: false,
      reason:
        "missing server secret: set RUN_CYCLE_TRIGGER_KEY (or INTERNAL_API_KEY / REFRESH_ENDPOINT_KEY)",
      expectedMasked: null as string | null,
      receivedMasked: null as string | null,
    };
  }

  const received = getAuthToken(req);

  return {
    ok: !!received && received === expected,
    reason: received ? "bad key" : "missing key",
    expectedMasked: maskValue(expected),
    receivedMasked: maskValue(received),
  };
}

function isSafeAuditFileName(file: string) {
  if (!file) return false;
  if (file.includes("/") || file.includes("\\") || file.includes("\0")) return false;
  if (file.includes("..")) return false;
  return /^[A-Za-z0-9._-]+\.jsonl$/i.test(file);
}

function isPathInsideDir(filePath: string, dirPath: string) {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dirPath);
  const rel = path.relative(resolvedDir, resolvedFile);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    return json(401, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason,
      expectedMasked: auth.expectedMasked,
      receivedMasked: auth.receivedMasked,
    });
  }

  const file = toText(req.nextUrl.searchParams.get("file"));
  if (!isSafeAuditFileName(file)) {
    return json(400, {
      ok: false,
      error: "BAD_FILE",
      note: "execution-audit export only allows single execution-runner .jsonl basenames",
    });
  }

  const auditRootDir = path.resolve(process.cwd(), "tmp", "execution-runner");
  const resolvedPath = path.resolve(auditRootDir, file);

  if (!isPathInsideDir(resolvedPath, auditRootDir)) {
    return json(400, {
      ok: false,
      error: "BAD_PATH",
      file,
      auditRootDir,
    });
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      return json(400, {
        ok: false,
        error: "NOT_A_FILE",
        file,
        resolvedPath,
      });
    }

    const body = await fs.readFile(resolvedPath);
    const headers = new Headers();
    headers.set("content-type", "application/x-ndjson; charset=utf-8");
    headers.set("content-disposition", `attachment; filename="${file}"`);
    headers.set("cache-control", "no-store");
    headers.set("content-length", String(body.byteLength));
    headers.set("x-content-type-options", "nosniff");
    headers.set("x-obgate-audit-export-root", auditRootDir);
    headers.set("x-obgate-audit-export-file", file);

    return new NextResponse(body, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(404, {
      ok: false,
      error: "FILE_NOT_FOUND",
      file,
      resolvedPath,
      message,
    });
  }
}
