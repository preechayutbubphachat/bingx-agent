"use client";

import { useState } from "react";

type Mode = "NO_NEWS" | "WITH_NEWS";

function tailText(s: string, max = 1200) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function pickFirst(...xs: Array<string | null | undefined>) {
  for (const x of xs) {
    const v = String(x ?? "").trim();
    if (v) return v;
  }
  return "";
}

function buildDebugLine(j: any) {
  if (!j) return "";
  const parts: string[] = [];

  // status-ish
  if (typeof j.code === "number") parts.push(`code=${j.code}`);
  if (typeof j.took_ms === "number") parts.push(`took=${j.took_ms}ms`);

  // where it ran
  const via = j?._proxy?.target ? `via ${j._proxy.target}` : "";
  if (via) parts.push(via);

  // optional tails
  const errTail = tailText(String(j?.stderr_tail ?? ""), 300);
  const outTail = tailText(String(j?.stdout_tail ?? ""), 300);
  if (errTail) parts.push(`stderr="${errTail}"`);
  if (outTail) parts.push(`stdout="${outTail}"`);

  return parts.length ? ` :: ${parts.join(" | ")}` : "";
}

export default function RunCycleButton() {
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<Mode | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(mode: Mode) {
    if (busy) return;
    setBusy(true);
    setBusyMode(mode);
    setMsg(null);

    try {
      const res = await fetch("/api/run-cycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mode }),
      });

      const text = await res.text();

      // รองรับ response ที่ไม่ใช่ JSON (เช่น HTML error / proxy error)
      let j: any = null;
      try {
        j = JSON.parse(text);
      } catch {
        j = null;
      }

      // ถ้า response ไม่ใช่ JSON แต่ HTTP ไม่ ok → โยน error ชัด ๆ
      if (!res.ok && !j) {
        throw new Error(`HTTP_${res.status} ${res.statusText} :: ${tailText(text)}`);
      }

      // ถ้าเป็น JSON แต่ ok=false หรือ HTTP ไม่ ok → รวมข้อมูล debug
      if (!res.ok || j?.ok === false) {
        const err = pickFirst(
          j?.error,
          j?.message,
          j?.msg,
          res.statusText,
          `HTTP_${res.status}`
        );

        // บางครั้ง backend ส่ง ok:false แต่ error อยู่ใน stderr_tail
        const debug = buildDebugLine(j);
        const bodyPreview = j ? tailText(JSON.stringify(j), 1200) : tailText(text, 1200);

        throw new Error(`${err}${debug} :: ${bodyPreview}`);
      }

      // success
      setMsg(mode === "WITH_NEWS" ? "✅ รันรอบใหม่ (พร้อมข่าว) แล้ว" : "✅ รันรอบใหม่ (no-news) แล้ว");

      // ให้คนเห็นข้อความนิดนึงก่อนรีโหลด (ไม่งั้นเหมือนกดแล้ววาร์ป)
      setTimeout(() => window.location.reload(), 350);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  const spin = (m: Mode) => (busy && busyMode === m ? "…" : m === "NO_NEWS" ? "⚡ Cycle" : "📰 Fix+News");

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={() => run("NO_NEWS")}
        className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        title="รันรอบใหม่แบบไม่ดึงข่าว"
      >
        {spin("NO_NEWS")}
      </button>

      <button
        disabled={busy}
        onClick={() => run("WITH_NEWS")}
        className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        title="รันรอบใหม่แบบดึงข่าว 1 ครั้ง (ใช้ตอนแผนพัง/ต้องรีคอนเท็กซ์)"
      >
        {spin("WITH_NEWS")}
      </button>

      {msg ? <span className="text-xs text-neutral-400">{msg}</span> : null}
    </div>
  );
}
