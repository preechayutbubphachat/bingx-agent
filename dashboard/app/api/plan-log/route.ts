import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveDataDir() {
  const envDir = process.env.BINGX_DATA_DIR?.trim();
  const candidates = [
    envDir,
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    const probe = path.join(dir, "latest_decision.json");
    if (await fileExists(probe)) return dir;
  }
  return process.cwd();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") ?? "30")));

  const dataDir = await resolveDataDir();
  const logPath = path.join(dataDir, "plan_status_log.jsonl");

  if (!(await fileExists(logPath))) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const raw = await fs.readFile(logPath, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const tail = lines.slice(Math.max(0, lines.length - limit));

  const items = tail
    .map((ln) => {
      try {
        return JSON.parse(ln);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, items });
}
