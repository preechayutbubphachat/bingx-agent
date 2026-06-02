import type { ReactNode } from "react";

export default function PanelShell({
  title,
  icon,
  children,
  actionLabel,
}: {
  title: string;
  icon: string;
  children: ReactNode;
  actionLabel?: string;
}) {
  return (
    <section className="flex min-h-[174px] min-w-0 flex-col rounded-2xl border border-[#bd8245]/70 bg-[#fff8ec] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-black text-[#2f241b]"><span aria-hidden="true">{icon}</span> {title}</h2>
        <button type="button" className="rounded-full px-2 py-1 text-xs font-black text-[#9a6937] hover:bg-[#ffe5b9] focus:outline-none focus:ring-2 focus:ring-[#7c4d1d]">
          ☆
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {actionLabel ? (
        <button type="button" className="mt-3 min-h-10 rounded-xl border border-[#c89658] bg-[#f7cf8d] px-3 py-2 text-xs font-black text-[#3f2f22] hover:bg-[#f4bf65] focus:outline-none focus:ring-2 focus:ring-[#7c4d1d]">
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
