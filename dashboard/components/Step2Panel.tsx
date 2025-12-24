"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  step2Text: string | null;
  oneLiner: string; // สรุป 1 ประโยค (ส่งมาจาก page.tsx)
};

type Hit = { label: string; index: number };

const KEYWORDS: Array<{ re: RegExp; cls: string }> = [
  // ไทย
  { re: /ระวัง|ความเสี่ยง|เสี่ยง|เตือน/gi, cls: "bg-rose-500/20 text-rose-200" },
  { re: /รอ|คอนเฟิร์ม|ยืนยัน|confirmation/gi, cls: "bg-amber-500/20 text-amber-200" },

  // SMC / jargon
  { re: /SMC|Order Block|OB|FVG|BOS|CHOCH|CHoCH|liquidity|sweep/gi, cls: "bg-sky-500/20 text-sky-200" },

  // Derivatives / flow
  { re: /OI|open interest|funding|orderflow|imbalance|squeeze|crowded/gi, cls: "bg-emerald-500/20 text-emerald-200" },
];

// หาหัวข้อจาก STEP02 (รองรับทั้งไทย/อังกฤษ)
const SECTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "SMC", re: /Smart Money Concept|SMC/ },
  { label: "Orderflow", re: /Orderflow|Derivatives|Futures/ },
  { label: "Risk", re: /Macro|News|Risk|ความเสี่ยง|ข่าว/ },
];

function highlightLine(line: string) {
  // วิธี: เดินผ่าน keywords แล้ว wrap เป็น <mark> แบบไม่ซ้อนกันมากเกินไป
  let parts: Array<{ text: string; cls?: string }> = [{ text: line }];

  for (const k of KEYWORDS) {
    const next: typeof parts = [];
    for (const p of parts) {
      if (p.cls) {
        next.push(p);
        continue;
      }
      const s = p.text;
      let lastIdx = 0;
      const matches = Array.from(s.matchAll(k.re));
      if (matches.length === 0) {
        next.push(p);
        continue;
      }
      for (const m of matches) {
        const idx = m.index ?? 0;
        const hit = m[0];
        if (idx > lastIdx) next.push({ text: s.slice(lastIdx, idx) });
        next.push({ text: hit, cls: k.cls });
        lastIdx = idx + hit.length;
      }
      if (lastIdx < s.length) next.push({ text: s.slice(lastIdx) });
    }
    parts = next;
  }

  return parts;
}

export default function Step2Panel({ step2Text, oneLiner }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string>("");

  const lines = useMemo(() => {
    const txt = step2Text ?? "ยังไม่พบไฟล์ latest_step2.txt (STEP02)";
    return txt.split(/\r?\n/);
  }, [step2Text]);

  // สแกนหัวข้อเพื่อทำ Jump (หา line index)
  const sectionHits: Hit[] = useMemo(() => {
    const hits: Hit[] = [];
    for (const s of SECTION_PATTERNS) {
      const idx = lines.findIndex((ln) => s.re.test(ln));
      if (idx >= 0) hits.push({ label: s.label, index: idx });
    }
    return hits;
  }, [lines]);

  function jumpToLine(lineIndex: number, label: string) {
    const el = scrollRef.current?.querySelector(`[data-ln="${lineIndex}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(label);
  }

  return (
    <div className="rounded-2xl bg-neutral-900 p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-medium text-neutral-300">
            สรุปจากระบบ (ภาษาไทยแบบโปรเทรดเดอร์ — STEP02)
          </div>
          <div className="mt-1 text-sm text-neutral-200">
            <span className="text-neutral-400">สรุป 1 ประโยค:</span>{" "}
            <span className="font-medium">{oneLiner}</span>
          </div>
        </div>

        {/* Jump Buttons */}
        <div className="flex flex-wrap gap-2 justify-end">
          {sectionHits.map((h) => (
            <button
              key={h.label}
              onClick={() => jumpToLine(h.index, h.label)}
              className={`rounded-full border px-3 py-1 text-xs hover:bg-neutral-800 ${
                active === h.label ? "border-neutral-500 text-neutral-100" : "border-neutral-700 text-neutral-300"
              }`}
            >
              📌 {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scroll Area */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="max-h-[360px] overflow-y-auto pr-2 text-sm leading-relaxed text-neutral-200"
        >
          <div className="space-y-1">
            {lines.map((ln, i) => {
              const parts = highlightLine(ln);
              return (
                <div key={i} data-ln={i} className="whitespace-pre-wrap">
                  {parts.map((p, j) =>
                    p.cls ? (
                      <mark key={j} className={`rounded px-1 ${p.cls}`}>
                        {p.text}
                      </mark>
                    ) : (
                      <span key={j}>{p.text}</span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Fade bottom */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-neutral-900 to-transparent" />
      </div>
    </div>
  );
}
