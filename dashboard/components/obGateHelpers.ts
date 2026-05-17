// dashboard/components/obGateHelpers.ts
export type GateNode = {
    status?: string;
    status_th?: string;
    note_th?: string;
    note?: string;
    bias_1h?: string;
};

function normUpper(x: unknown) {
    return String(x ?? "").trim().toUpperCase();
}

function safeNum(x: any): number | null {
    return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function fmt1(n: number | null) {
    if (n == null) return "—";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function fmtTsShort(ts: any) {
    const t = safeNum(ts);
    if (!t) return "";
    const ms = t < 1e12 ? t * 1000 : t;
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return "";
    }
}

/* ----------------- Why mapping (Thai) ----------------- */

export function whyTH(code?: string) {
    const k = normUpper(code);
    if (!k) return "";

    const map: Record<string, string> = {
        PRICE_OVERLAPS_1H_OB: "ราคาแตะ/ทับโซน 1H OB แล้ว",
        WAIT_RECLAIM_MIDRULE: "รอ reclaim ตามกติกา mid-rule ก่อนอนุญาตเข้า",
        CLOSE_BACK_IN_ZONE_AND_BEYOND_MID: "ต้องปิดกลับเข้าโซนและผ่านกึ่งกลาง (mid) ให้ชัด",
    };

    return map[k] ?? code ?? "";
}

/* ----------------- Pipeline nodes (1H / 5m confirm) ----------------- */

export function nodeFromH1OB(h1_ob: any): GateNode {
    if (!h1_ob) {
        return { status: "WAIT", status_th: "ยังไม่พบ 1H OB", note_th: "" };
    }
    const side = normUpper(h1_ob?.side) || "UNKNOWN";
    const z = h1_ob?.zone;
    const lo = safeNum(z?.low);
    const hi = safeNum(z?.high);

    return {
        status: "PASS",
        status_th: `พบ 1H OB (${side})`,
        note_th: `${fmt1(lo)}–${fmt1(hi)} • ${h1_ob?.note ?? ""}`.trim(),
    };
}

export function nodeFromM5Confirm(m5_ob_confirm: any): GateNode {
    if (!m5_ob_confirm) {
        return { status: "WAIT", status_th: "รอ 5m confirm block", note_th: "" };
    }
    const side = normUpper(m5_ob_confirm?.side) || "UNKNOWN";
    const z = m5_ob_confirm?.zone;
    const lo = safeNum(z?.low);
    const hi = safeNum(z?.high);

    return {
        status: "PASS",
        status_th: `มี 5m Confirm OB (${side})`,
        note_th: `${fmt1(lo)}–${fmt1(hi)} • ${m5_ob_confirm?.note ?? ""}`.trim(),
    };
}

/* ----------------- Gates mapping (touch/sweep/reclaim/choch) ----------------- */

export function gateFromTouch(touch: any): GateNode {
    if (!touch) return { status: "UNKNOWN", status_th: "ไม่พบข้อมูล Touch", note_th: "" };

    const ok = !!touch?.ok;
    const note = whyTH(touch?.why);
    if (ok) return { status: "PASS", status_th: "Touch แล้ว", note_th: note || "แตะโซน 1H OB แล้ว" };
    return { status: "WAIT", status_th: "รอ Touch", note_th: note || "ยังไม่แตะโซน" };
}

export function gateFromSweep(sweep: any): GateNode {
    if (!sweep) return { status: "UNKNOWN", status_th: "ไม่พบข้อมูล Sweep", note_th: "" };

    const seen = !!sweep?.seen;
    const side = normUpper(sweep?.side) || "";
    const price = safeNum(sweep?.price);
    const when = fmtTsShort(sweep?.t);

    if (seen) {
        const note = [`side=${side || "?"}`, price != null ? `@${fmt1(price)}` : "", when ? `(${when})` : ""]
            .filter(Boolean)
            .join(" ");
        return { status: "SEEN", status_th: "มี Sweep แล้ว", note_th: note };
    }

    return { status: "WAIT", status_th: "รอ Sweep", note_th: "" };
}

export function gateFromReclaim(reclaim: any): GateNode {
    if (!reclaim) return { status: "UNKNOWN", status_th: "ไม่พบข้อมูล Reclaim", note_th: "" };

    const ok = !!reclaim?.ok;
    const rule = String(reclaim?.rule ?? "").trim();
    if (ok) return { status: "PASS", status_th: "Reclaim ผ่าน", note_th: rule };
    return { status: "WAIT", status_th: "รอ Reclaim", note_th: rule || "" };
}

export function gateFromChoch(choch: any): GateNode {
    if (!choch) return { status: "UNKNOWN", status_th: "ไม่พบข้อมูล CHOCH", note_th: "" };

    const ok = !!choch?.ok;
    const dir = normUpper(choch?.dir) || "";
    const when = fmtTsShort(choch?.t);

    if (ok) {
        const note = [dir ? `dir=${dir}` : "", when ? `(${when})` : ""].filter(Boolean).join(" ");
        return { status: "PASS", status_th: `CHOCH ผ่าน${dir ? ` (${dir})` : ""}`, note_th: note };
    }

    return { status: "WAIT", status_th: "รอ CHOCH", note_th: dir ? `dir=${dir}` : "" };
}
