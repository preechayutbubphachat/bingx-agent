"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  step2Text: string | null;
  oneLiner: string;
};

type Hit = { label: string; index: number };

const KEYWORDS: Array<{ re: RegExp; cls: string }> = [
  { re: /ระวัง|ความเสี่ยง|เสี่ยง|เตือน/gi, cls: "bg-rose-500/20 text-rose-200" },
  { re: /รอ|คอนเฟิร์ม|ยืนยัน|confirmation/gi, cls: "bg-amber-500/20 text-amber-200" },
  { re: /SMC|Order Block|OB|FVG|BOS|CHOCH|CHoCH|liquidity|sweep/gi, cls: "bg-sky-500/20 text-sky-200" },
  {
    re: /OI|open interest|funding|orderflow|imbalance|squeeze|crowded/gi,
    cls: "bg-emerald-500/20 text-emerald-200",
  },
];

const SECTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "SMC", re: /Smart Money Concept|SMC/i },
  { label: "Orderflow", re: /Orderflow|Derivatives|Futures/i },
  { label: "Risk", re: /Macro|News|Risk|ความเสี่ยง|ข่าว/i },
];

function highlightLine(line: string) {
  let parts: Array<{ text: string; cls?: string }> = [{ text: line }];

  for (const keyword of KEYWORDS) {
    const next: typeof parts = [];

    for (const part of parts) {
      if (part.cls) {
        next.push(part);
        continue;
      }

      const source = part.text;
      let lastIndex = 0;
      const matches = Array.from(source.matchAll(keyword.re));

      if (matches.length === 0) {
        next.push(part);
        continue;
      }

      for (const match of matches) {
        const index = match.index ?? 0;
        const hit = match[0];

        if (index > lastIndex) {
          next.push({ text: source.slice(lastIndex, index) });
        }

        next.push({ text: hit, cls: keyword.cls });
        lastIndex = index + hit.length;
      }

      if (lastIndex < source.length) {
        next.push({ text: source.slice(lastIndex) });
      }
    }

    parts = next;
  }

  return parts;
}

export default function Step2Panel({ step2Text, oneLiner }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => {
    const text = step2Text?.trim() || "ยังไม่พบไฟล์ latest_step2.txt (STEP02)";
    return text.split(/\r?\n/);
  }, [step2Text]);

  const sectionHits: Hit[] = useMemo(() => {
    const hits: Hit[] = [];

    for (const section of SECTION_PATTERNS) {
      const index = lines.findIndex((line) => section.re.test(line));
      if (index >= 0) {
        hits.push({ label: section.label, index });
      }
    }

    return hits;
  }, [lines]);

  const summaryLine = useMemo(() => {
    return oneLiner?.trim() || "-";
  }, [oneLiner]);

  function jumpToLine(lineIndex: number, label: string) {
    const element = scrollRef.current?.querySelector(`[data-ln="${lineIndex}"]`) as HTMLElement | null;
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(label);
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(step2Text?.trim() || summaryLine);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl bg-neutral-900 p-6 shadow">
      <div className="mb-4 flex flex-col gap-3 border-b border-white/5 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-neutral-200">
            สรุปจากระบบ (ภาษาไทยแบบโปรเทรดเดอร์ — STEP02)
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            ใช้สำหรับอ่านภาพรวม, rationale, และ context แบบไม่ต้องไล่ JSON ทีละก้อน
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {sectionHits.map((hit) => (
            <button
              key={hit.label}
              onClick={() => jumpToLine(hit.index, hit.label)}
              className={`rounded-full border px-3 py-1 text-xs transition hover:bg-neutral-800 ${
                active === hit.label
                  ? "border-neutral-500 text-neutral-100"
                  : "border-neutral-700 text-neutral-300"
              }`}
              type="button"
            >
              📌 {hit.label}
            </button>
          ))}

          <button
            onClick={copyAll}
            type="button"
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-200 transition hover:bg-white/5"
            title="Copy STEP02 text"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-white/5 bg-neutral-950/60 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-neutral-500">Quick Context</div>
        <div className="mt-1 line-clamp-2 text-sm text-neutral-200">{summaryLine}</div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="max-h-[420px] overflow-y-auto pr-1 text-sm leading-7 text-neutral-200"
        >
          <div className="space-y-1">
            {lines.map((line, index) => {
              const parts = highlightLine(line);
              const isSectionStart = sectionHits.some((hit) => hit.index === index);

              return (
                <div
                  key={index}
                  data-ln={index}
                  className={`grid grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-lg px-2 py-1 ${
                    isSectionStart ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <div className="select-none text-right font-mono text-[11px] text-neutral-500">
                    L{index + 1}
                  </div>

                  <div className="whitespace-pre-wrap break-words">
                    {parts.map((part, partIndex) =>
                      part.cls ? (
                        <mark key={partIndex} className={`rounded px-1 ${part.cls}`}>
                          {part.text}
                        </mark>
                      ) : (
                        <span key={partIndex}>{part.text}</span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-neutral-900 to-transparent" />
      </div>
    </section>
  );
}