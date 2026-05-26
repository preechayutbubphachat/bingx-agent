"use client";

import { useEffect, useMemo, useState } from "react";

function tailText(s: string, max = 400) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max) + "…";
}

export default function ManualOverridesCard() {
  const [adminKey, setAdminKey] = useState("");

  const [jsonText, setJsonText] = useState("");
  const [step2Text, setStep2Text] = useState("");

  const [busy, setBusy] = useState<"LOAD" | "SAVE_JSON" | "SAVE_STEP2" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (adminKey.trim()) h["x-admin-key"] = adminKey.trim();
    return h;
  }, [adminKey]);

  async function loadAll() {
    setBusy("LOAD");
    setMsg(null);
    try {
      const [jRes, sRes] = await Promise.all([
        fetch("/api/admin/latest-decision", { cache: "no-store", headers: adminKey ? { "x-admin-key": adminKey } : {} }),
        fetch("/api/admin/latest-step2", { cache: "no-store", headers: adminKey ? { "x-admin-key": adminKey } : {} }),
      ]);

      const jText = await jRes.text();
      const sText = await sRes.text();

      if (!jRes.ok) throw new Error(`load decision failed: ${jRes.status} :: ${tailText(jText)}`);
      if (!sRes.ok) throw new Error(`load step2 failed: ${sRes.status} :: ${tailText(sText)}`);

      setJsonText(jText);
      setStep2Text(sText);
      setMsg("✅ โหลดไฟล์ล่าสุดเข้าฟอร์มแล้ว");
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveDecision() {
    setBusy("SAVE_JSON");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/latest-decision", {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonText }),
      });
      const text = await res.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { j = null; }

      if (!res.ok || j?.ok === false) {
        throw new Error(`${j?.error || res.statusText || "SAVE_FAIL"} :: ${tailText(text)}`);
      }

      setMsg("✅ บันทึก latest_decision.json แล้ว");
      window.location.reload();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveStep2() {
    setBusy("SAVE_STEP2");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/latest-step2", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: step2Text }),
      });
      const text = await res.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch { j = null; }

      if (!res.ok || j?.ok === false) {
        throw new Error(`${j?.error || res.statusText || "SAVE_FAIL"} :: ${tailText(text)}`);
      }

      setMsg("✅ บันทึก latest_step2.txt แล้ว");
      window.location.reload();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    // ไม่ auto-load เพื่อไม่ชน auth ถ้าตั้ง ADMIN_KEY
  }, []);

  return (
    <div className="rounded-2xl bg-neutral-900 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-200">Manual Override (Admin)</div>
          <div className="text-xs text-neutral-500">
            วาง JSON / STEP02 แล้วเซฟทับไฟล์ล่าสุด (ใช้ตอนอยาก “สั่งสมองระบบ” แบบไม่ต้องรอ agent 😄)
          </div>
        </div>

        <button
          onClick={loadAll}
          disabled={busy !== null}
          className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy === "LOAD" ? "…" : "Load ล่าสุด"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* LEFT: latest_decision.json */}
        <div className="space-y-2">
          <div className="text-xs text-neutral-400">latest_decision.json</div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="h-80 w-full rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 font-mono text-xs text-neutral-200 outline-none focus:border-neutral-600"
            placeholder='วาง JSON ที่นี่ แล้วกด "Save Decision"'
          />
          <button
            onClick={saveDecision}
            disabled={busy !== null}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === "SAVE_JSON" ? "…" : "Save Decision"}
          </button>
        </div>

        {/* RIGHT: latest_step2.txt */}
        <div className="space-y-2">
          <div className="text-xs text-neutral-400">latest_step2.txt (STEP02 ภาษาไทย)</div>
          <textarea
            value={step2Text}
            onChange={(e) => setStep2Text(e.target.value)}
            className="h-80 w-full rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-xs text-neutral-200 outline-none focus:border-neutral-600"
            placeholder='วางสรุปภาษาไทย STEP02 ที่นี่ แล้วกด "Save STEP02"'
          />
          <button
            onClick={saveStep2}
            disabled={busy !== null}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === "SAVE_STEP2" ? "…" : "Save STEP02"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs text-neutral-500">ADMIN_KEY (ถ้าตั้งไว้ใน env):</div>
        <input
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          className="h-8 w-72 max-w-full rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 text-xs text-neutral-200 outline-none focus:border-neutral-600"
          placeholder="ใส่คีย์แล้วค่อย Save/Load"
        />
        {msg ? <span className="text-xs text-neutral-400">{msg}</span> : null}
      </div>
    </div>
  );
}
