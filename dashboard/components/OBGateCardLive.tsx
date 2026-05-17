"use client";

import { useEffect, useState } from "react";
import OBGateCard from "@/components/OBGateCard";

const POLL_MS = 10_000;

export default function OBGateCardLive() {
    const [obGate, setObGate] = useState<any | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function load() {
        const res = await fetch("/api/plan-status", { cache: "no-store" });
        if (!res.ok) throw new Error(`plan-status http ${res.status}`);
        const j = await res.json();
        if (!j?.ok) throw new Error("plan-status not ok");

        // ✅ รองรับหลาย path แบบไม่ต้องเดา
        const g =
            j?.planStatus?.ob_gate ??
            j?.plan?.ob_gate ??
            j?.ob_gate ??
            null;

        setObGate(g);
    }

    useEffect(() => {
        (async () => {
            try {
                setErr(null);
                await load();
            } catch (e: any) {
                setErr(e?.message ?? "failed to load ob_gate");
            }
        })();

        const id = setInterval(async () => {
            try {
                await load();
            } catch {
                // ignore
            }
        }, POLL_MS);

        return () => clearInterval(id);
    }, []);

    if (err) {
        return (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
                โหลด OB Gate ไม่ได้: {err}
            </div>
        );
    }

    return <OBGateCard obGate={obGate} />;
}
