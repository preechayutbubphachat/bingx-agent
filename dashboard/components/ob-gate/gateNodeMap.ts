// dashboard/components/ob-gate/gateNodeMap.ts
/**
 * gateNodeMap.ts = “สัญญากลาง” สำหรับ OB Gate UI
 *
 * เป้าหมาย:
 * - UI (OBGateCard) เรียก mapAllGates(ob_gate) แล้วได้ข้อมูลที่ “normalize แล้ว” ใช้ได้ทันที
 * - รองรับหลายคีย์ (กัน backend เปลี่ยนชื่อ field ในอนาคต)
 *
 * โครงหลักที่ UI ต้องใช้:
 * - gates: touch/sweep/reclaim/choch
 * - pipeline: h1 (zone/bias/note), m5 confirm, entry
 * - meta: title/subtitle/bias
 */

export type GateNode = {
    status?: string;     // raw for tone (READY/WAIT/FAIL/...)
    status_th?: string;  // label (TH)
    note_th?: string;
    note?: string;
    bias_1h?: string;
    raw?: any;
};

export type GateH1 = {
    status?: string;
    status_th?: string;
    zone?: [number, number] | null;
    note_th?: string;
    note?: string;
    bias_1h?: string;
    raw?: any;
};

export type GateM5 = {
    status?: string;
    status_th?: string;
    note_th?: string;
    note?: string;
    raw?: any;
};

export type GateEntry = {
    status?: string;
    status_th?: string;

    reason_th?: string;
    hint_th?: string;
    hint?: string;

    entry_zone?: [number, number] | null;
    sl?: number | null;
    tp1?: number | null;

    why?: string;
    why_th?: string;

    raw?: any;
};

export type GateMeta = {
    title_th?: string;
    subtitle_th?: string;
    bias_1h?: string;
};

export type GateMap = {
    touch: GateNode;
    sweep: GateNode;
    reclaim: GateNode;
    choch: GateNode;

    h1: GateH1;
    m5: GateM5;
    entry: GateEntry;

    meta: GateMeta;
    raw?: any;
};

// -------- helpers (safe getters) --------
function getPath(obj: any, path: string): any {
    try {
        return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
    } catch {
        return undefined;
    }
}

function pick(obj: any, paths: string[]) {
    for (const p of paths) {
        const v = getPath(obj, p);
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
}

function asStr(v: any): string | undefined {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s ? s : undefined;
}

function asNum(v: any): number | undefined {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function normalizeZone(z: any): [number, number] | null {
    if (!z) return null;

    if (Array.isArray(z)) {
        const a = asNum(z[0]);
        const b = asNum(z[1]);
        if (a !== undefined && b !== undefined) return [a, b];
    }

    if (typeof z === "object") {
        const lo = asNum((z as any).low ?? (z as any).l ?? (z as any).min);
        const hi = asNum((z as any).high ?? (z as any).h ?? (z as any).max);
        if (lo !== undefined && hi !== undefined) return [lo, hi];
    }

    return null;
}

function normalizeGateNode(raw: any, fallbackTh?: string): GateNode {
    // 1) ถ้ามี status มาอยู่แล้ว ใช้เลย
    let status = asStr(pick(raw, ["status", "state", "result", "gate_status"])) ?? undefined;

    if (!status) {
        const ok = raw?.ok;
        const seen = raw?.seen;

        if (ok === true || seen === true) status = "PASS";
        else if (ok === false || seen === false) status = "WAIT";
    }

    const status_th =
        asStr(pick(raw, ["status_th", "state_th", "label_th", "label"])) ??
        (status === "PASS" ? "ผ่านแล้ว" : status === "WAIT" ? "รออยู่" : undefined) ??
        (fallbackTh ? fallbackTh : undefined);

    const note_th = asStr(pick(raw, ["note_th", "reason_th", "why_th", "desc_th"]));
    const note = asStr(pick(raw, ["note", "reason", "why", "desc"]));

    const bias_1h = asStr(pick(raw, ["bias_1h", "side", "dir", "bias"]))?.toUpperCase();

    return { status, status_th, note_th, note, bias_1h, raw };
}

function missingGateNode(th = "ไม่มีข้อมูล"): GateNode {
    return { status: "MISSING", status_th: th };
}

function buildH1(ob: any): GateH1 {
    const h1Raw = pick(ob, ["h1_ob", "h1", "htf", "ob_1h", "ob1h", "zone_1h"]) ?? {};
    const zone =
        normalizeZone(pick(h1Raw, ["zone", "ob_zone", "range", "price_zone"])) ??
        normalizeZone(pick(ob, ["h1_ob.zone", "h1.ob_zone", "h1.zone", "ob_zone_1h"])) ??
        null;

    const note_th = asStr(pick(h1Raw, ["note_th", "note", "why_th", "reason_th", "desc_th"])) ?? undefined;
    const note = asStr(pick(h1Raw, ["note", "why", "reason", "desc"])) ?? undefined;

    const b1 = asStr(pick(ob, ["bias_1h"]))?.toUpperCase();
    const b2 =
        asStr(pick(ob, ["h1_ob.side", "h1.side", "htf.bias"]))?.toUpperCase() ??
        asStr(pick(h1Raw, ["side", "bias", "dir"]))?.toUpperCase();

    const bias =
        (b1 && b1 !== "UNKNOWN" ? b1 : undefined) ??
        b2 ??
        undefined;


    const status =
        asStr(pick(h1Raw, ["status", "state"])) ??
        (zone ? "READY" : "MISSING");

    // ถ้า backend ไม่ส่ง status_th มา เราใส่ label แบบไม่เดาตลาด: แค่บอกว่ามี/ไม่มีโซน
    const status_th =
        asStr(pick(h1Raw, ["status_th", "state_th"])) ??
        (zone ? "มีโซน 1H แล้ว" : "ยังไม่มีโซน 1H");

    return { status, status_th, zone, note_th, note, bias_1h: bias, raw: h1Raw };
}

function buildM5(ob: any): GateM5 {
  const m5Raw =
    pick(ob, ["m5_ob_confirm", "m5.confirm", "confirm_5m", "m5_confirm", "lt_confirm"]) ?? null;

  // ✅ ถ้า backend บอกชัดว่า 5m feed หายจริง
  const missingFlag = pick(ob, ["m5_data_missing", "m5_missing", "m5_feed_missing", "missing_5m"]);
  const feedStatus = String(pick(ob, ["m5_data_status", "m5_feed_status"]) ?? "").toUpperCase();

  const feedMissing =
    missingFlag === true ||
    String(missingFlag ?? "").toLowerCase() === "true" ||
    feedStatus === "MISSING";

  if (feedMissing) {
    return {
      status: "MISSING",
      status_th: "5m data ไม่มา (feed missing)",
      note_th: "ตรวจการดึงข้อมูล 5m / cron / cycle",
      raw: { m5Raw, missingFlag, feedStatus },
    };
  }

  // ✅ null/undefined = ยังไม่เกิดสัญญาณ confirm (ไม่ใช่ data หาย)
  if (m5Raw === null || m5Raw === undefined) {
    return {
      status: "WAIT",
      status_th: "รอ 5m confirm",
      note_th: "มีข้อมูลราคา 5m แล้ว แต่ยังไม่พบเงื่อนไขยืนยัน",
      raw: { m5Raw },
    };
  }

  // ✅ รองรับ boolean confirm
  if (typeof m5Raw === "boolean") {
    return {
      status: m5Raw ? "READY" : "WAIT",
      status_th: m5Raw ? "มี confirm 5m แล้ว" : "รอ 5m confirm",
      note_th: m5Raw ? "ผ่านเงื่อนไขยืนยัน" : "ยังไม่ผ่านเงื่อนไขยืนยัน",
      raw: { m5Raw },
    };
  }

  // ✅ รองรับ string confirm เช่น "READY" / "CONFIRMED" / "WAIT"
  if (typeof m5Raw === "string") {
    const s = m5Raw.trim().toUpperCase();
    const ok = ["READY", "CONFIRMED", "OK", "PASS"].includes(s);
    const wait = ["WAIT", "PENDING", "HOLD"].includes(s);

    return {
      status: ok ? "READY" : wait ? "WAIT" : "WAIT",
      status_th: ok ? "มี confirm 5m แล้ว" : "รอ 5m confirm",
      note_th: ok ? "ผ่านเงื่อนไขยืนยัน" : "ยังไม่ผ่านเงื่อนไขยืนยัน",
      raw: { m5Raw },
    };
  }

  // ✅ object (รูปแบบเดิมของคุณ)
  const zone = normalizeZone(pick(m5Raw, ["zone", "ob_zone", "range", "price_zone"])) ?? null;

  const status =
    asStr(pick(m5Raw, ["status", "state"])) ??
    (zone ? "READY" : "WAIT");

  const status_th =
    asStr(pick(m5Raw, ["status_th", "state_th"])) ??
    (zone ? "มี confirm 5m แล้ว" : "รอ 5m confirm");

  const note_th = asStr(pick(m5Raw, ["note_th", "reason_th", "why_th", "desc_th"]));
  const note = asStr(pick(m5Raw, ["note", "reason", "why", "desc"]));

  return { status, status_th, note_th, note, raw: m5Raw };
}




function buildEntry(ob: any): GateEntry {
    const eRaw = pick(ob, ["entry", "trade_entry", "signal.entry", "permission.entry"]) ?? null;
    if (!eRaw) {
        return {
            status: "MISSING",
            status_th: "ไม่มีข้อมูล entry",
            entry_zone: null,
            sl: null,
            tp1: null,
            raw: null,
        };
    }

    const status = asStr(pick(eRaw, ["status", "state"])) ?? "UNKNOWN";
    const status_th = asStr(pick(eRaw, ["status_th", "state_th"])) ?? asStr(status) ?? "—";

    const entry_zone =
        normalizeZone(pick(eRaw, ["entry_zone", "zone", "entryZone", "price_zone"])) ?? null;

    const sl = asNum(pick(eRaw, ["sl", "stop", "stop_loss"])) ?? null;
    const tp1 = asNum(pick(eRaw, ["tp1", "target1", "t1"])) ?? null;

    const why_th = asStr(pick(eRaw, ["why_th", "reason_th", "why", "reason"]));
    const why = asStr(pick(eRaw, ["why", "reason"]));

    const hint_th = asStr(pick(eRaw, ["hint_th", "guide_th"]));
    const hint = asStr(pick(eRaw, ["hint", "guide"]));
    const reason_th = asStr(pick(eRaw, ["reason_th"]));

    return {
        status,
        status_th,
        reason_th,
        hint_th,
        hint,
        entry_zone,
        sl,
        tp1,
        why,
        why_th,
        raw: eRaw,
    };
}

// -------- public --------
export function mapAllGates(obGate: any): GateMap {
    const ob = obGate ?? {};

    // รองรับหลายคีย์สำหรับ gates (กันเปลี่ยนชื่อ)
    const touchRaw = pick(ob, ["touch", "gates.touch", "gate.touch", "smc.touch", "smc_gates.touch", "steps.touch"]);
    const sweepRaw = pick(ob, ["sweep", "gates.sweep", "gate.sweep", "smc.sweep", "smc_gates.sweep", "steps.sweep"]);
    const reclaimRaw = pick(ob, ["reclaim", "gates.reclaim", "gate.reclaim", "smc.reclaim", "smc_gates.reclaim", "steps.reclaim"]);
    const chochRaw = pick(ob, ["choch", "gates.choch", "gate.choch", "smc.choch", "smc_gates.choch", "steps.choch"]);

    const touch = touchRaw ? normalizeGateNode(touchRaw) : missingGateNode("ไม่มีข้อมูล Touch");
    const sweep = sweepRaw ? normalizeGateNode(sweepRaw) : missingGateNode("ไม่มีข้อมูล Sweep");
    const reclaim = reclaimRaw ? normalizeGateNode(reclaimRaw) : missingGateNode("ไม่มีข้อมูล Reclaim");
    const choch = chochRaw ? normalizeGateNode(chochRaw) : missingGateNode("ไม่มีข้อมูล CHOCH");

    const h1 = buildH1(ob);
    const m5 = buildM5(ob);
    const entry = buildEntry(ob);
    const mb1 = asStr(pick(ob, ["bias_1h"]))?.toUpperCase();
    const mb2 = asStr(pick(ob, ["h1_ob.side", "h1.side", "htf.bias"]))?.toUpperCase();

    const meta: GateMeta = {
        title_th: asStr(pick(ob, ["title_th", "title", "meta.title_th", "meta.title"])) ?? "OB Gate",
        subtitle_th:
            asStr(pick(ob, ["subtitle_th", "subtitle", "meta.subtitle_th", "meta.subtitle"])) ??
            "1H ให้โซน — 5m ต้องทำอะไรถึงเข้าได้",


        bias_1h: (h1.bias_1h ?? ((mb1 && mb1 !== "UNKNOWN") ? mb1 : undefined) ?? mb2)?.toUpperCase(),

    };

    return { touch, sweep, reclaim, choch, h1, m5, entry, meta, raw: obGate };
}
