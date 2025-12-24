"use client";

import { useEffect, useMemo, useState } from "react";

function formatAge(sec: number | null) {
  if (sec === null) return "-";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function PageFreshBadge() {
  // เวลาเริ่มนับ = ตอนหน้า hydrate (หลัง server render)
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ageSec = useMemo(() => Math.max(0, Math.floor((now - startedAt) / 1000)), [now, startedAt]);

  return (
    <span
      className="rounded-full border border-neutral-700 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-300"
      title="Page Fresh = เวลาตั้งแต่หน้าเพจโหลด/รีเฟรชครั้งล่าสุด (ฝั่ง UI)"
    >
      Page Fresh: <span className="text-neutral-100 font-medium">{formatAge(ageSec)}</span>
    </span>
  );
}
