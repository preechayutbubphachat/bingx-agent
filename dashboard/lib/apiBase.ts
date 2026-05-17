// dashboard/lib/apiBase.ts
function stripSlash(s: string) {
    return s.replace(/\/+$/, "");
}

export const API_BASE = stripSlash(process.env.NEXT_PUBLIC_API_BASE ?? "");

export function apiUrl(path: string) {
    const p = path.startsWith("/") ? path : `/${path}`;
    if (!API_BASE) return p;

    // ✅ browser safety: ถ้า base ไม่ตรง origin -> ใช้ relative
    if (typeof window !== "undefined") {
        const origin = stripSlash(window.location.origin);
        if (stripSlash(API_BASE) !== origin) return p;
    }

    return `${API_BASE}${p}`;
}
