// FILE: dashboard/components/RefreshPageButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RefreshPageButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastClickedAt, setLastClickedAt] = useState<number | null>(null);

  const disabled = isPending;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setLastClickedAt(Date.now());
        startTransition(() => router.refresh());
      }}
      className={`rounded-xl border px-3 py-2 text-sm transition
        ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-neutral-900"}
        border-neutral-700 bg-neutral-950 text-neutral-100`}
      title="รีเฟรชหน้าเพื่อดึงข้อมูลล่าสุด"
    >
      {isPending ? "กำลังรีเฟรช…" : "↻ รีเฟรช"}
      {lastClickedAt && !isPending ? (
        <span className="ml-2 text-xs text-neutral-400">
          ({Math.max(0, Math.floor((Date.now() - lastClickedAt) / 1000))}s)
        </span>
      ) : null}
    </button>
  );
}


// ==========================
// PATCH: dashboard/app/public/page.tsx
// 1) เพิ่ม import
// 2) วางปุ่มในแถบด้านบน (ข้าง CopyPostButton / RunSnapshotButton)
// ==========================

// ✅ เพิ่มบรรทัดนี้ในส่วน import ของ page.tsx
// import RefreshPageButton from "@/components/RefreshPageButton";

// ✅ จากนั้น ใส่ปุ่มในแถวนี้ (ตัวอย่าง)
// <div className="flex items-center gap-3">
//   <CopyPostButton text={postText} />
//   <RefreshPageButton />
//   <RunSnapshotButton />
// </div>
