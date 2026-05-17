// dashboard/components/plan-status/PlanStatusProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/apiBase";

export type PlanStatusResp = {
    ok: boolean;
    t?: number;
    updated_at?: number;
    source_updated_at?: number;

    symbol?: string;
    plan_state?: string;
    mode_lock?: any;

    ob_gate?: any;
    derivatives?: any;
    plan_status_state?: any;

    planStatus?: any;
};

type Ctx = {
    data: PlanStatusResp | null;
    error: string | null;
    fetchedAt: number | null;
    now: number;
    reload: () => Promise<void>;
};

const PlanStatusCtx = createContext<Ctx | null>(null);

async function fetchWithFallback(path: string) {
    const url = apiUrl(path);
    try {
        return await fetch(url, { cache: "no-store" });
    } catch (e) {
        if (url !== path) return await fetch(path, { cache: "no-store" });
        throw e;
    }
}

export function usePlanStatusOptional() {
    return useContext(PlanStatusCtx);
}

export default function PlanStatusProvider(props: { pollMs?: number; children: React.ReactNode }) {
    const pollMs = props.pollMs ?? 10_000;

    const [data, setData] = useState<PlanStatusResp | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const reload = async () => {
        try {
            const res = await fetchWithFallback("/api/plan-status");
            if (!res.ok) throw new Error(`plan-status http ${res.status}`);
            const j = (await res.json()) as PlanStatusResp;
            if (!j?.ok) throw new Error("plan-status not ok");
            setData(j);
            setFetchedAt(Date.now());
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? "failed to load");
        }
    };

    useEffect(() => {
        let alive = true;

        async function loop() {
            if (!alive) return;
            await reload();
        }

        loop();
        const id = setInterval(loop, pollMs);
        return () => {
            alive = false;
            clearInterval(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pollMs]);

    const value = useMemo<Ctx>(
        () => ({ data, error, fetchedAt, now, reload }),
        [data, error, fetchedAt, now]
    );

    return <PlanStatusCtx.Provider value={value}>{props.children}</PlanStatusCtx.Provider>;
}
