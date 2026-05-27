"use client";

import { useMemo, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const next = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const sp = new URLSearchParams(window.location.search);
    return sp.get("next") || "/";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      setErr("รหัสไม่ถูกครับ (ประตูไม่เปิด 😄)");
      return;
    }

    window.location.href = next;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-semibold">OB Gate — Login</div>
        <div className="text-xs text-white/60 mt-1">ใส่รหัสก่อนเข้าดูแดชบอร์ด</div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 outline-none"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {err ? <div className="text-sm text-rose-300">{err}</div> : null}

          <button className="w-full rounded-xl bg-emerald-500/90 hover:bg-emerald-500 px-3 py-2 font-semibold">
            เข้าใช้งาน
          </button>
        </form>

        <div className="text-[11px] text-white/45 mt-3">
          * ถ้าคุณเข้ามาถึงหน้านี้ แปลว่าประตูกำลังทำงานอยู่ 👌
        </div>
      </div>
    </div>
  );
}
