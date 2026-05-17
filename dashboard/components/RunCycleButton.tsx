"use client";

import { useState } from "react";

export default function RunCycleButton() {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    async function run(mode: "NO_NEWS" | "WITH_NEWS") {
        if (busy) return;
        setBusy(true);
        setMsg(null);

        try {
            const res = await fetch("/api/run-cycle", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode }),
            });

            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j?.ok) throw new Error(j?.error || res.statusText);

            setMsg(mode === "WITH_NEWS" ? "✅ รันรอบใหม่ (พร้อมข่าว) แล้ว" : "✅ รันรอบใหม่ (no-news) แล้ว");
            // รีเฟรชหน้าเพื่อดึง latest_decision ใหม่
            window.location.reload();
        } catch (e: any) {
            setMsg(`❌ ${e?.message ?? String(e)}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            <button
                disabled={busy}
                onClick={() => run("NO_NEWS")}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                title="รันรอบใหม่แบบไม่ดึงข่าว"
            >
                ⚡ Cycle
            </button>

            <button
                disabled={busy}
                onClick={() => run("WITH_NEWS")}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                title="รันรอบใหม่แบบดึงข่าว 1 ครั้ง (ใช้ตอนแผนพัง/ต้องรีคอนเท็กซ์)"
            >
                📰 Fix+News
            </button>

            {msg ? <span className="text-xs text-neutral-400">{msg}</span> : null}
        </div>
    );
}
