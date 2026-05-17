// dashboard/components/MarketRegimeRow.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import MarketStatusCard from "@/components/MarketStatusCard";
import type { PlanStatus } from "@/components/plan-steps/types";
import { apiUrl } from "@/lib/apiBase";
import { resolvePlanView } from "@/lib/resolvePlanView";

const POLL_MS = 10_000;

function toMs(ts: unknown): number | undefined {
    if (typeof ts !== "number" || !Number.isFinite(ts)) return undefined;
    // < 1e12 มักเป็น seconds
    return ts < 1e12 ? ts * 1000 : ts;
}

async function fetchWithFallback(path: string) {
    const url = apiUrl(path);
    try {
        return await fetch(url, { cache: "no-store" });
    } catch (e) {
        // ถ้า apiUrl เปลี่ยน host/port แล้ว fetch ไม่ได้ ให้ fallback เป็น relative
        if (url !== path) return await fetch(path, { cache: "no-store" });
        throw e;
    }
}

export default function MarketRegimeRow() {
    const [data, setData] = useState<PlanStatus | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        const res = await fetchWithFallback("/api/plan-status");
        if (!res.ok) throw new Error(`plan-status http ${res.status}`);

        const j = (await res.json()) as PlanStatus;
        if (!j?.ok) throw new Error("plan-status not ok");

        setData(j);
        setErr(null);
    }

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                setErr(null);
                await load();
            } catch (e: any) {
                if (!alive) return;
                setErr(e?.message ?? "failed to load");
            }
        })();

        const id = setInterval(async () => {
            try {
                await load();
            } catch {
                // ignore poll errors
            }
        }, POLL_MS);

        return () => {
            alive = false;
            clearInterval(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const planView = useMemo(() => (data ? resolvePlanView(data) : null), [data]);

    const updatedAtView = useMemo(() => {
        const u = (data as any)?.updated_at ?? (data as any)?.source_updated_at ?? null;
        return toMs(u);
    }, [data]);

    if (err) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
                โหลด Market Regime ไม่ได้: {err}
            </div>
        );
    }

    if (!data || !planView) {
        return (
            <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
                กำลังโหลด Market Regime…
            </div>
        );
    }

    return (
        <MarketStatusCard
            regime={planView.market_regime}
            marketMode={planView.market_mode}
            confidence={planView.confidence}
            updatedAt={updatedAtView}
            riskWarnings={planView.risk_warning}
        />
    );
}
