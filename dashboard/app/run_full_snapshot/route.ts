// dashboard/app/run_full_snapshot/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getBaseUrl() {
    const base = process.env.BINGX_AGENT_BASE_URL?.trim();
    return base && base.length ? base : null;
}

function originFromReq(req: Request) {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
}

export async function GET(req: Request) {
    const base = getBaseUrl();
    if (!base) {
        return NextResponse.json(
            {
                ok: false,
                error: "BINGX_AGENT_BASE_URL_NOT_SET",
                hint: "Set .env.local -> BINGX_AGENT_BASE_URL=http://127.0.0.1:<agent_port> แล้ว restart dev server",
            },
            { status: 500 }
        );
    }

    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const target = `${base}/run_full_snapshot${qs ? `?${qs}` : ""}`;

    // กันตั้งค่า baseUrl ชี้กลับมาที่ dashboard เอง (จะวนลูป)
    const origin = originFromReq(req);
    if (target.startsWith(origin)) {
        return NextResponse.json(
            {
                ok: false,
                error: "snapshot_proxy_loop",
                message: "BINGX_AGENT_BASE_URL ชี้มาที่ dashboard เอง (จะวนลูป)",
                target,
                origin,
                hint: "ตั้ง BINGX_AGENT_BASE_URL ให้เป็นพอร์ต agent จริง (เช่น :3000) และให้ dashboard รันคนละพอร์ต",
            },
            { status: 500 }
        );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    try {
        const r = await fetch(target, { cache: "no-store", signal: ctrl.signal });
        const text = await r.text();

        // พยายามคืน JSON ถ้า parse ได้
        try {
            const j = JSON.parse(text);
            return NextResponse.json({ ...j, target }, { status: r.status });
        } catch {
            return NextResponse.json(
                {
                    ok: false,
                    error: "non_json_response",
                    status: r.status,
                    target,
                    body: text.slice(0, 500),
                },
                { status: 502 }
            );
        }
    } catch (e: any) {
        const msg = String(e?.message ?? e);
        const code = e?.cause?.code || e?.code || null; // ECONNREFUSED / ENOTFOUND / etc.

        return NextResponse.json(
            {
                ok: false,
                error: "snapshot_proxy_failed",
                message: msg,
                code,
                target,
                hint: "Agent ไม่ได้รัน/พอร์ตไม่ถูก/บล็อค firewall. เช็ก netstat และตั้ง BINGX_AGENT_BASE_URL ให้ตรง",
            },
            { status: 502 }
        );
    } finally {
        clearTimeout(timer);
    }
}
