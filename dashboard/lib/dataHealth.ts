/**
 * dataHealth.ts
 * Helpers สำหรับแสดงสถานะความสดของข้อมูล (data health / freshness)
 * ให้ UI แปลง sourceInfo / freshness → label ภาษาไทย + สีที่เหมาะสม
 *
 * ใช้ได้ทั้ง server และ client side (no browser APIs)
 */

export type DataHealthStatus =
  | "fresh"
  | "stale"
  | "old"
  | "fallback"
  | "missing"
  | "partial"
  | "unknown";

export type DataHealthInfo = {
  status: DataHealthStatus;
  /** ป้ายภาษาไทยสำหรับแสดงผล */
  labelTH: string;
  /** Tailwind text-* class สำหรับแสดงสี */
  color: string;
  /** อายุข้อมูลในวินาที (null = ไม่ทราบ) */
  ageSec: number | null;
  /** แหล่งที่ใช้อ่าน latest_decision.json จริง */
  decisionKind: "root" | "mirror" | null;
  /** แหล่งที่ใช้อ่าน market_snapshot.json จริง */
  snapshotKind: "root" | "mirror" | null;
};

export type DataHealthInput = {
  freshness?: { tag?: string; ageSec?: number | null } | null;
  decisionKind?: "root" | "mirror" | null;
  snapshotKind?: "root" | "mirror" | null;
  hasDecision?: boolean;
  hasSnapshot?: boolean;
};

/**
 * แปลง freshness + source info → DataHealthInfo
 * ลำดับความสำคัญ:
 *  missing > partial > fallback > old > stale > fresh > unknown
 */
export function getDataHealth(opts: DataHealthInput): DataHealthInfo {
  const {
    freshness = null,
    decisionKind = null,
    snapshotKind = null,
    hasDecision = false,
    hasSnapshot = false,
  } = opts;

  const ageSec = freshness?.ageSec ?? null;
  const tag = String(freshness?.tag ?? "UNKNOWN").trim().toUpperCase();

  // ไม่พบ decision → missing
  if (!hasDecision) {
    return {
      status: "missing",
      labelTH: "ไม่พบไฟล์ข้อมูล",
      color: "text-rose-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  // มี decision แต่ไม่มี snapshot → partial
  if (!hasSnapshot) {
    return {
      status: "partial",
      labelTH: "ข้อมูลไม่สมบูรณ์",
      color: "text-amber-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  // ข้อมูลมาจาก mirror (สำรอง) ไม่ใช่ root
  const usingMirror = decisionKind === "mirror" || snapshotKind === "mirror";
  if (usingMirror) {
    return {
      status: "fallback",
      labelTH: "ใช้ข้อมูลสำรอง",
      color: "text-amber-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  // OLD (เก่ามาก) > STALE > MISSING > FRESH
  if (tag === "OLD") {
    return {
      status: "old",
      labelTH: "ข้อมูลเก่ามาก",
      color: "text-rose-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  if (tag === "STALE") {
    return {
      status: "stale",
      labelTH: "ข้อมูลเก่า",
      color: "text-amber-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  if (tag === "MISSING") {
    return {
      status: "missing",
      labelTH: "ไม่พบไฟล์ข้อมูล",
      color: "text-rose-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  if (tag === "FRESH") {
    return {
      status: "fresh",
      labelTH: "ข้อมูลสด",
      color: "text-emerald-400",
      ageSec,
      decisionKind,
      snapshotKind,
    };
  }

  return {
    status: "unknown",
    labelTH: "ยังไม่ทราบสถานะข้อมูล",
    color: "text-neutral-400",
    ageSec,
    decisionKind,
    snapshotKind,
  };
}

/**
 * แปลงวินาทีเป็นข้อความ m/s
 */
export function formatAgeSeconds(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

/**
 * Tooltip text อธิบาย source kind
 */
export function sourceKindLabel(kind: "root" | "mirror" | null): string {
  if (kind === "root") return "ไฟล์หลัก (root)";
  if (kind === "mirror") return "ไฟล์สำรอง (mirror)";
  return "ไม่ทราบแหล่ง";
}
