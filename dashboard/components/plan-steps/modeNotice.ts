import type { LogItem, PlanStatus } from "./types";


export type ModeNotice = {
    show: boolean;
    icon: string;
    title: string;
    detail: string;
    tone: "emerald" | "amber" | "sky" | "neutral";
};


export function findLatestStateChange(logs: LogItem[]): LogItem | null {
    const xs = (logs ?? []).filter((x) => String(x.type ?? "").toUpperCase().includes("STATE_CHANGE"));
    if (!xs.length) return null;
    return xs.slice().sort((a, b) => b.t - a.t)[0] ?? null;
}


export function computeModeNotice(data: PlanStatus, latestChange: LogItem | null): ModeNotice {
    const ps = String(data?.states?.plan_state ?? "").toUpperCase();


    if (ps.includes("BREAKOUT_CONFIRMED_SWITCH_MODE")) {
        return {
            show: true,
            icon: "🚀",
            tone: "sky",
            title: "Breakout จริง → ต้องเปลี่ยนเกม",
            detail: "หยุด Grid / เลิกเล่นในกรอบ แล้วให้ agent ออกแผนใหม่ (TREND หรือ NO_TRADE)",
        };
    }


    // ถ้าคุณอยากให้แสดงเมื่อ plan_state บางอย่างเปลี่ยนแรงๆ เพิ่มได้ตรงนี้
    // ตัวอย่าง: FAKEOUT_CONFIRMED_RANGE_PLAY = กลับมาเล่นในกรอบ
    if (ps.includes("FAKEOUT_CONFIRMED") || ps.includes("RANGE_PLAY")) {
        return {
            show: true,
            icon: "✅",
            tone: "emerald",
            title: "ยืนยัน Fakeout → เกมกรอบกลับมา",
            detail: "โหมดกริดมีน้ำหนักขึ้น (แต่ยังต้องดูเงื่อนไขอื่น เช่น OI/Funding/Session)",
        };
    }


    // default = ไม่โชว์
    return { show: false, icon: "", tone: "neutral", title: "", detail: "" };
}