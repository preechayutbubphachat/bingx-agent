import type { LogItem } from "./types";

/** -----------------------------
 * Timeline / Plan Tracker (เดิม)
 * ------------------------------ */

export function tfProgressFromPlanState(ps: string) {
    const s = (ps ?? "").toUpperCase();
    if (s.includes("WAIT_SWEEP")) return "ครบ: —";
    if (s.includes("WAIT_15M_REJECTION")) return "ครบ: 5m";
    if (s.includes("WAIT_1H_CONFIRM")) return "ครบ: 5m + 15m";
    if (s.includes("FAKEOUT_CONFIRMED") || s.includes("RANGE_PLAY"))
        return "ครบ: 5m + 15m + 1H";
    if (s.includes("BREAKOUT_CONFIRMED") || s.includes("SWITCH_MODE"))
        return "ครบ: 5m + 15m + 1H";
    if (s.includes("NO_TRADE") || s.includes("LOCKED")) return "ครบ: —";
    return "ครบ: —";
}

export function eventIcon(e: LogItem) {
    const type = String(e.type ?? "").toUpperCase();
    const to = String(e.to ?? "").toUpperCase();

    if (type.includes("MODE_SWITCH")) return "🔁";
    if (to.includes("SWEEP")) return "🧹";
    if (to.includes("REJECTION")) return "🪝";
    if (to.includes("FAKEOUT") || to.includes("RANGE_PLAY")) return "✅";
    if (to.includes("BREAKOUT") || to.includes("SWITCH_MODE")) return "🚀";
    if (to.includes("NO_DATA") || to.includes("FAILED")) return "⚠️";
    if (to.includes("NO_TRADE") || to.includes("LOCKED")) return "🔒";
    return "•";
}

export function oneLineSummary(e: LogItem) {
    if (e.explain_th && e.explain_th.trim().length) return e.explain_th.trim();

    const to = String(e.to ?? "").toUpperCase();
    if (to.includes("WAIT_SWEEP")) return "ยังไม่เข้าจังหวะ — รอให้กวาดบนก่อน";
    if (to.includes("WAIT_15M_REJECTION"))
        return "กวาดบนแล้ว — รอ 15m ปิดยืนยัน rejection";
    if (to.includes("WAIT_1H_CONFIRM"))
        return "15m ผ่านแล้ว — รอ 1H ยืนยัน fakeout/breakout";
    if (to.includes("FAKEOUT_CONFIRMED") || to.includes("RANGE_PLAY"))
        return "ยืนยัน fakeout — กลับมาเล่นในกรอบ";
    if (to.includes("BREAKOUT_CONFIRMED") || to.includes("SWITCH_MODE"))
        return "ยืนยัน breakout — หยุดกริด/เตรียมเปลี่ยนโหมด";
    if (to.includes("NO_TRADE")) return "ล็อก NO_TRADE — งดเทรดตามบทวิเคราะห์";
    if (to.includes("TREND")) return "ล็อก TREND — พักแผนกริด";
    return `สถานะเปลี่ยน → ${e.to}`;
}

export function dayKeyTH(ts: number) {
    return new Date(ts).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function timeTH(ts: number) {
    return new Date(ts).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function groupTimeline(items: LogItem[]) {
    const sorted = [...(items ?? [])].sort((a, b) => b.t - a.t);
    const groups: { key: string; label: string; items: LogItem[] }[] = [];

    for (const it of sorted) {
        const key = new Date(it.t).toISOString().slice(0, 10);
        const label = dayKeyTH(it.t);
        const g = groups.find((x) => x.key === key);
        if (g) g.items.push(it);
        else groups.push({ key, label, items: [it] });
    }

    return groups;
}

export function todayKeyISO() {
    return new Date().toISOString().slice(0, 10);
}

/** ---------------------------------------
 * NEW: Derivatives 2-liner (Thai summary)
 * ใช้สำหรับ “บรรทัดท้ายการ์ด”
 * ---------------------------------------- */

export type DerivDir = "UP" | "DOWN" | "FLAT" | "UNKNOWN";

export function dirFromPct(pct: number | null | undefined, flatThreshold = 0.05): DerivDir {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "UNKNOWN";
    if (pct > flatThreshold) return "UP";
    if (pct < -flatThreshold) return "DOWN";
    return "FLAT";
}

function arrow(d: DerivDir) {
    if (d === "UP") return "↑";
    if (d === "DOWN") return "↓";
    if (d === "FLAT") return "↔";
    return "?";
}

function crowdShortTH(crowd?: string) {
    const c = String(crowd ?? "").toUpperCase();
    if (c.includes("CROWDED_LONG") || c === "LONGS") return "Long หนา";
    if (c.includes("CROWDED_SHORT") || c === "SHORTS") return "Short หนา";
    if (c.includes("NEUTRAL") || c.includes("MIXED")) return "คนกระจาย";
    return "ยังไม่ชัด";
}

function freshnessShort(ageSec?: number | null) {
    if (ageSec === null || ageSec === undefined || !Number.isFinite(ageSec)) return "";
    if (ageSec < 120) return ""; // fresh ไม่ต้องแปะให้รก
    const m = Math.max(1, Math.round(ageSec / 60));
    return ` | ข้อมูลช้า ~${m}m`;
}

function coreStateTH(priceDir: DerivDir, oiDir: DerivDir) {
    // 9 สภาวะ: Price vs OI
    if (priceDir === "UP" && oiDir === "UP") {
        return { state: "เติมแรงตามเทรน (Build-up)", action: "ตามได้ แต่ห้ามไล่ — รอย่อ/confirm" };
    }
    if (priceDir === "UP" && oiDir === "DOWN") {
        return { state: "เด้งจากปิด Short (เด้งไว-หมดไว)", action: "อย่าไล่ — รอ OI กลับขึ้นก่อน" };
    }
    if (priceDir === "UP" && oiDir === "FLAT") {
        return { state: "ไหลขึ้นเบา ๆ ยังไม่ยืนยันแรง", action: "รอ confirm 5m ก่อนเข้า" };
    }

    if (priceDir === "DOWN" && oiDir === "UP") {
        return { state: "เติมแต่ราคาถอย (เสี่ยง Trap/ล้าง)", action: "อย่าสวนมั่ว — รอ sweep+reclaim" };
    }
    if (priceDir === "DOWN" && oiDir === "DOWN") {
        return { state: "ปิดโพสิชัน/โดนล้าง (ใกล้ exhaustion)", action: "รอ reclaim แล้วค่อยเข้า (เด้งแรงได้)" };
    }
    if (priceDir === "DOWN" && oiDir === "FLAT") {
        return { state: "ไหลลงเงียบ ๆ ยังไม่จบ", action: "เลี่ยง Long — รอฐาน/สัญญาณกลับตัว" };
    }

    if (priceDir === "FLAT" && oiDir === "UP") {
        return { state: "อัดสปริง (ใกล้ระเบิด)", action: "รอหลุดกรอบ + confirm — ระวังแทงล้างก่อน" };
    }
    if (priceDir === "FLAT" && oiDir === "DOWN") {
        return { state: "ตลาดพัก/รีเซ็ต (ความร้อนลด)", action: "รอทิศทางใหม่ ไม่ต้องรีบ" };
    }

    return { state: "ช็อป/เสียงรบกวน", action: "NO TRADE ดีกว่าเสียเลือด" };
}

function overlayRiskTH(args: {
    fundingDir: DerivDir;
    oiDir: DerivDir;
    priceDir: DerivDir;
    crowd?: string;
}) {
    const { fundingDir, oiDir, priceDir, crowd } = args;

    const risks: string[] = [];
    const c = String(crowd ?? "").toUpperCase();

    // Crowding
    if (c.includes("CROWDED_LONG") || c === "LONGS") risks.push("ระวังไส้ล้างฝั่ง Long");
    if (c.includes("CROWDED_SHORT") || c === "SHORTS") risks.push("ระวัง squeeze ฝั่ง Short");

    // Funding heat/trap logic แบบสั้น
    if (fundingDir === "UP" && oiDir === "UP") {
        risks.push("Funding ร้อน ห้ามไล่");
    }
    if (fundingDir === "DOWN" && oiDir === "UP" && (priceDir === "FLAT" || priceDir === "DOWN")) {
        risks.push("เติมแต่ไม่ไป เสี่ยง trap");
    }
    if (fundingDir === "DOWN" && oiDir === "UP" && priceDir === "UP") {
        // เคสดีต่อเทรน
        risks.push("ฟีเวอร์ลดลง (ดีต่อเทรน)");
    }

    return risks.length ? risks.join(" | ") : "";
}

/**
 * ✅ ตัวนี้คือสิ่งที่คุณจะเอาไปวางท้ายการ์ด
 * ส่งค่า dir ของ price/oi/funding (5m เป็นหลัก) + crowd + freshness ageSec
 *
 * คืน:
 *  - line1: “กำลังเกิด: ...”
 *  - line2: “แผน/ระวัง: ...”
 */
export function buildDerivativesTwoLiner(input: {
    // ใช้ 5m เป็นหลัก
    price5mDir: DerivDir;
    oi5mDir: DerivDir;
    funding5mDir: DerivDir;

    // Optional: ช่วยเพิ่มบริบท (ถ้าคุณมี)
    price15mDir?: DerivDir;
    oi15mDir?: DerivDir;
    funding15mDir?: DerivDir;

    crowding?: string; // "CROWDED_LONG" | "CROWDED_SHORT" | "NEUTRAL" | ...
    freshnessAgeSec?: number | null; // เช่น 243
}) {
    const priceDir = input.price5mDir ?? "UNKNOWN";
    const oiDir = input.oi5mDir ?? "UNKNOWN";
    const fundDir = input.funding5mDir ?? "UNKNOWN";

    const core = coreStateTH(priceDir, oiDir);
    const crowdTH = crowdShortTH(input.crowding);

    const risk = overlayRiskTH({
        fundingDir: fundDir,
        oiDir,
        priceDir,
        crowd: input.crowding,
    });

    const stale = freshnessShort(input.freshnessAgeSec);

    // บรรทัด 1: กำลังเกิด (สั้น)
    const line1 = `กำลังเกิด: ${core.state} (P${arrow(priceDir)} + OI${arrow(oiDir)} | F${arrow(fundDir)} | ${crowdTH})`;

    // บรรทัด 2: แผน/ระวัง (คำสั่งสั้น)
    const line2 = `แผน/ระวัง: ${core.action}${risk ? ` — ${risk}` : ""}${stale}`;

    return { line1, line2 };
}
