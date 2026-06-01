// dashboard/components/trading-agent-hq/AgentBubble.tsx
"use client";

export default function AgentBubble({ text }: { text: string }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full
                 max-w-[180px] rounded-lg bg-white/95 px-2 py-1 text-[11px] leading-tight
                 text-neutral-700 shadow-md ring-1 ring-black/5"
    >
      {text}
      <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-px h-0 w-0
                       border-x-4 border-x-transparent border-t-4 border-t-white/95" />
    </div>
  );
}
