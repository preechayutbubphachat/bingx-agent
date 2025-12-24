import { promises as fs } from "fs";
import path from "path";

function resolveDataDir() {
  const envDir = process.env.DATA_DIR ?? ".."; // ให้ default เป็นโฟลเดอร์แม่
  return path.resolve(process.cwd(), envDir);
}

async function statSafe(p: string) {
  try { return await fs.stat(p); } catch { return null; }
}

export async function readLatest() {
  const dir = resolveDataDir();
  const decisionPath = path.join(dir, "latest_decision.json");
  const step2Path = path.join(dir, "latest_step2.txt");

  const decisionStat = await statSafe(decisionPath);
  if (!decisionStat) {
    return { ok: false as const, error: "latest_decision.json not found", dir };
  }

  const decisionRaw = await fs.readFile(decisionPath, "utf-8");
  const decision = JSON.parse(decisionRaw);

  const step2Stat = await statSafe(step2Path);
  const step2Text = step2Stat ? await fs.readFile(step2Path, "utf-8") : null;

  return {
    ok: true as const,
    dir,
    updatedAt: decisionStat.mtimeMs,
    decision,
    step2Text,
  };
}
