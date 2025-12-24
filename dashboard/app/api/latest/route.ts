import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readLatest } from "@/lib/readLatest";

function resolveDataDir() {
  const envDir = process.env.DATA_DIR ?? ".";
  // ทำให้เป็น absolute path
  return path.resolve(process.cwd(), envDir);
}

async function statSafe(p: string) {
  try { return await fs.stat(p); } catch { return null; }
}

export async function GET() {
  const data = await readLatest();
  return NextResponse.json(data, { status: data.ok ? 200 : 404 });
}