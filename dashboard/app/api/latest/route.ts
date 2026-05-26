import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readLatest } from "@/lib/readLatest";
import { safeJsonErrorResponse } from "@/lib/safeJsonResponse";

function resolveDataDir() {
  const envDir = process.env.DATA_DIR ?? ".";
  // ทำให้เป็น absolute path
  return path.resolve(process.cwd(), envDir);
}

async function statSafe(p: string) {
  try { return await fs.stat(p); } catch { return null; }
}

export async function GET() {
  try {
    const data = await readLatest();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error in latest";
    console.error("[/api/latest] Unexpected error:", message);
    return safeJsonErrorResponse(err, {
      code: "LATEST_RUNTIME_READ_FAILED",
      fallbackMessage: "Unable to read latest runtime payload",
      status: "ERROR",
      severity: "critical",
      warnings: ["Latest runtime payload is unavailable"],
      nextActions: ["Check BINGX_AGENT_DIR", "Verify latest_decision.json and market_snapshot.json"],
    });
  }
}
