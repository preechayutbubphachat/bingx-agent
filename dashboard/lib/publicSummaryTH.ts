// dashboard/lib/publicSummaryTH.ts
// Goal:
// - Prefer agent reason (reason_agent.one_liner / reason_agent.bullets) when present
// - Fallback to legacy reason (decision.reason?.trend/momentum/volatility/...) safely
// - Never crash when keys are missing/undefined

type AnyObj = Record<string, any>;

export type PublicReasonPick = {
  source: "AGENT" | "LEGACY" | "SUMMARY_FOR_BOT" | "NONE";
  one_liner?: string;
  bullets: string[];
};

// -----------------------------
// Small safe helpers
// -----------------------------
function isObj(x: any): x is AnyObj {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function asString(x: any): string | undefined {
  if (typeof x === "string") return x.trim() || undefined;
  if (typeof x === "number" && Number.isFinite(x)) return String(x);
  return undefined;
}

function asStringArray(x: any): string[] {
  if (Array.isArray(x)) return x.map(asString).filter(Boolean) as string[];
  const s = asString(x);
  return s ? [s] : [];
}

function clampStr(s: string, max = 220): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function uniqKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const k = it.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it.trim());
  }
  return out;
}

function fmtConfPct(conf: any): string | undefined {
  if (typeof conf !== "number" || !Number.isFinite(conf)) return undefined;
  const pct = Math.round(conf * 100);
  if (pct < 0 || pct > 100) return undefined;
  return `${pct}%`;
}

function pickMode(decision: AnyObj): string | undefined {
  return (
    asString(decision?.market_mode) ??
    asString(decision?.marketMode) ??
    asString(decision?.regime) ??
    asString(decision?.mode)
  );
}

// -----------------------------
// Agent reason normalization
// Supports multiple schema variants
// -----------------------------
function normalizeAgentReason(raw: any): { one_liner?: string; bullets: string[] } | null {
  if (!raw) return null;

  // case: raw is a string -> treat as one-liner
  if (typeof raw === "string") {
    const one = asString(raw);
    return one ? { one_liner: one, bullets: [] } : null;
  }

  if (!isObj(raw)) return null;

  const one =
    asString(raw.one_liner) ??
    asString(raw.oneLiner) ??
    asString(raw.oneliner) ??
    asString(raw.summary) ??
    asString(raw.headline);

  const bullets =
    asStringArray(raw.bullets) ||
    asStringArray(raw.bullets_th) ||
    asStringArray(raw.bullet_points) ||
    asStringArray(raw.points);

  const bulletList = Array.isArray(bullets) ? bullets : [];

  if (!one && bulletList.length === 0) return null;
  return { one_liner: one, bullets: bulletList };
}

function pickAgentReason(decision: AnyObj): { one_liner?: string; bullets: string[] } | null {
  // try common locations (robust against schema drift)
  const candidates = [
    decision?.reason_agent,
    decision?.reasonAgent,
    decision?.extras?.reason_agent,
    decision?.extras?.reasonAgent,
    decision?.reason?.reason_agent,
    decision?.reason?.agent,
    decision?.reason?.agent_reason,
    // sometimes agent-like fields get merged into reason
    decision?.reason,
  ];

  for (const c of candidates) {
    // If candidate is the whole legacy reason object, skip unless it clearly has agent-like keys
    if (isObj(c) && !("one_liner" in c) && !("bullets" in c) && !("oneLiner" in c) && !("bullet_points" in c)) {
      continue;
    }
    const n = normalizeAgentReason(c);
    if (n) return n;
  }
  return null;
}

// -----------------------------
// Legacy reason normalization
// -----------------------------
const LEGACY_REASON_ORDER: Array<{ key: string; labelTH: string }> = [
  { key: "trend", labelTH: "แนวโน้ม" },
  { key: "momentum", labelTH: "โมเมนตัม" },
  { key: "volatility", labelTH: "ความผันผวน" },
  { key: "smc", labelTH: "SMC/โครงสร้าง" },
  { key: "price_action", labelTH: "พฤติกรรมราคา" },
  { key: "derivatives", labelTH: "อนุพันธ์ (OI/Funding)" },
  { key: "session", labelTH: "Session" },
  { key: "news", labelTH: "ข่าว" },
  { key: "indicator", labelTH: "อินดิเคเตอร์" },
  { key: "orderbook", labelTH: "ออเดอร์บุ๊ก" },
];

function pickLegacyReason(decision: AnyObj): { one_liner?: string; bullets: string[] } | null {
  const r = decision?.reason;

  // some versions put a text summary here
  if (typeof r === "string") {
    const one = asString(r);
    return one ? { one_liner: one, bullets: [] } : null;
  }

  if (!isObj(r)) return null;

  // If legacy has one_liner/bullets too (agent-like), we let agent path handle it.
  // Here we strictly build from known string fields.
  const out: string[] = [];

  for (const { key, labelTH } of LEGACY_REASON_ORDER) {
    const v = asString((r as AnyObj)[key]);
    if (v) out.push(`${labelTH}: ${v}`);
  }

  // If nothing matched known keys, include any remaining string fields (best-effort)
  if (out.length === 0) {
    for (const [k, v] of Object.entries(r)) {
      const s = asString(v);
      if (s) out.push(`${k}: ${s}`);
    }
  }

  if (out.length === 0) return null;
  return { bullets: out };
}

// -----------------------------
// summary_for_bot fallback (optional safety net)
// -----------------------------
function pickSummaryForBot(decision: AnyObj): { one_liner?: string; bullets: string[] } | null {
  const s = asString(decision?.summary_for_bot);
  if (!s) return null;

  // split by lines, keep non-empty
  const lines = s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  // if it looks like bullet list, keep as bullets
  if (lines.length >= 2) return { bullets: lines };
  // else treat as one-liner
  return { one_liner: lines[0], bullets: [] };
}

// -----------------------------
// Thai-friendly polishing
// -----------------------------
function thaiifyInline(s: string): string {
  let t = s.trim();

  // common tokens from agent one_liner
  t = t.replace(/\bnews=SKIPPED\b/gi, "ข่าว=ข้าม");
  t = t.replace(/\bnews=OK\b/gi, "ข่าว=อ่าน");
  t = t.replace(/\bnews=UNKNOWN\b/gi, "ข่าว=ไม่ทราบ");

  t = t.replace(/\bPrice:\s*/gi, "ราคา: ");
  t = t.replace(/\blast_close\b/gi, "ปิดล่าสุด");
  t = t.replace(/\blast_close≈/gi, "ปิดล่าสุด≈");
  t = t.replace(/\blast_close\s*≈/gi, "ปิดล่าสุด≈");

  // conf=0.xx -> conf≈xx%
  t = t.replace(/\bconf\s*=\s*(0?\.\d+)\b/gi, (_m, num) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return "conf=?";
    return `conf≈${Math.round(n * 100)}%`;
  });

  // tighten separators
  t = t.replace(/\s*\|\s*/g, " | ");
  t = t.replace(/\s{2,}/g, " ");

  return t;
}

function categorizePrefixTH(line: string): string {
  const s = line.toLowerCase();

  // already has an emoji prefix → don't double-prefix
  if (/^[\u{1F300}-\u{1FAFF}]/u.test(line.trim())) return "";

  if (s.startsWith("smc:") || s.includes("swing_") || s.includes("eq") || s.includes("liquidity"))
    return "🧠 ";
  if (s.startsWith("risk:") || s.includes("sweep") || s.includes("crowding") || s.includes("trapped"))
    return "⚠️ ";
  if (s.includes("rsi") || s.includes("macd") || s.includes("ema") || s.includes("atr") || s.includes("bbw") || s.includes("slope"))
    return "📉 ";
  if (s.includes("trigger") || s.includes("entry") || s.includes("กติกา") || s.includes("รอ") || s.includes("เข้า"))
    return "🎯 ";
  if (s.includes("session")) return "🕒 ";
  if (s.includes("news") || s.includes("ข่าว")) return "📰 ";

  return "• ";
}

function polishBulletTH(line: string): string {
  const raw = line.trim();
  if (!raw) return "";

  // unify "Risk:" and "SMC:" a bit
  let t = thaiifyInline(raw);

  if (/^risk:\s*/i.test(t)) t = t.replace(/^risk:\s*/i, "ความเสี่ยง: ");
  if (/^smc:\s*/i.test(t)) t = t.replace(/^smc:\s*/i, "SMC: ");

  const prefix = categorizePrefixTH(t);
  // if prefix is "• " we don't want to end up with "• " inside UI bullet list too noisy,
  // but some callers render without bullets; keep a mild prefix only when it's meaningful.
  if (prefix === "• ") return clampStr(t, 260);

  return clampStr(prefix + t, 260);
}

// -----------------------------
// Main selector (robust)
// -----------------------------
export function pickPublicReason(decision: any): PublicReasonPick {
  const d: AnyObj = isObj(decision) ? decision : {};

  const agent = pickAgentReason(d);
  if (agent) {
    return {
      source: "AGENT",
      one_liner: agent.one_liner ? thaiifyInline(agent.one_liner) : undefined,
      bullets: agent.bullets.map(thaiifyInline),
    };
  }

  const legacy = pickLegacyReason(d);
  if (legacy) {
    return {
      source: "LEGACY",
      one_liner: legacy.one_liner ? thaiifyInline(legacy.one_liner) : undefined,
      bullets: legacy.bullets.map(thaiifyInline),
    };
  }

  const bot = pickSummaryForBot(d);
  if (bot) {
    return {
      source: "SUMMARY_FOR_BOT",
      one_liner: bot.one_liner ? thaiifyInline(bot.one_liner) : undefined,
      bullets: bot.bullets.map(thaiifyInline),
    };
  }

  return { source: "NONE", bullets: [] };
}

// -----------------------------
// Public API used by UI
// -----------------------------
export function buildPublicBulletsTH(decision: any): string[] {
  const d: AnyObj = isObj(decision) ? decision : {};
  const pick = pickPublicReason(d);

  const bullets: string[] = [];

  // 1) Add a small header-ish bullet (mode + confidence) as a stable anchor
  const mode = pickMode(d);
  const confPct = fmtConfPct(d?.confidence);
  if (mode) {
    bullets.push(`ภาพรวม: ${mode}${confPct ? ` (conf≈${confPct})` : ""}`);
  }

  // 2) Prefer agent reason
  if (pick.source === "AGENT") {
    if (pick.one_liner) bullets.push(polishBulletTH(`สรุป: ${pick.one_liner}`));
    for (const b of pick.bullets) bullets.push(polishBulletTH(b));
  } else {
    // 3) Legacy fallback
    if (pick.one_liner) bullets.push(polishBulletTH(`สรุป: ${pick.one_liner}`));
    for (const b of pick.bullets) bullets.push(polishBulletTH(b));
  }

  // 4) Add risk_warning if present (and not already included)
  const risk = asStringArray(d?.risk_warning ?? d?.riskWarning);
  if (risk.length) {
    const riskLine = `ความเสี่ยง: ${risk.join(" | ")}`;
    bullets.push(polishBulletTH(riskLine));
  }

  // 5) De-dupe, drop empties, cap length
  const cleaned = uniqKeepOrder(bullets.map((x) => x.trim()).filter(Boolean));

  // Keep it tight for public UI
  return cleaned.slice(0, 8);
}

export function buildOneLinerTH(decision: any, bullets?: string[]): string {
  const d: AnyObj = isObj(decision) ? decision : {};
  const pick = pickPublicReason(d);

  // Prefer agent one-liner
  if (pick.source === "AGENT" && pick.one_liner) {
    return clampStr(thaiifyInline(pick.one_liner), 180);
  }

  // Legacy one-liner if exists
  if (pick.one_liner) {
    return clampStr(thaiifyInline(pick.one_liner), 180);
  }

  // If caller passed bullets, use the first meaningful one (strip emoji-ish prefixes)
  const b0 = (bullets ?? []).map((x) => x.trim()).filter(Boolean)[0];
  if (b0) {
    // remove leading emoji/prefix decorations for a clean one-liner
    const cleaned = b0.replace(/^[\u{1F300}-\u{1FAFF}]\s*/u, "").replace(/^(•\s*)/u, "");
    return clampStr(thaiifyInline(cleaned), 180);
  }

  // Last resort: mode + hint from levels
  const mode = pickMode(d);
  const confPct = fmtConfPct(d?.confidence);
  const trigger =
    asString(d?.levels?.trend?.trigger_rule) ??
    asString(d?.levels?.trend?.entry?.hint) ??
    asString(d?.levels?.smc?.liquidity_note);

  const base = mode ? `โหมด: ${mode}${confPct ? ` (conf≈${confPct})` : ""}` : "สรุปตลาด";
  const tail = trigger ? ` | ${thaiifyInline(trigger)}` : "";
  return clampStr(base + tail, 180);
}
