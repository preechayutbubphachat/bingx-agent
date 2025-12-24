"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ✅ ยิงผ่าน Next route ในโปรเจกต์เดียวกัน (ชัวร์สุด)
const SNAPSHOT_PATH =
    "/run_full_snapshot?symbol=BTC-USDT&klineLimit=200&depthLimit=50";

type LogItem = {
    ts: number;
    status: "success" | "error";
    ms?: number;
    message?: string;
};

const LS_KEY = "snapshot_run_logs_v1";
const MAX_LOGS = 20;

function loadLogs(): LogItem[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(0, MAX_LOGS);
    } catch {
        return [];
    }
}

function saveLogs(logs: LogItem[]) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
    } catch { }
}

export default function RunSnapshotButton() {
    const router = useRouter();

    const [cooldown, setCooldown] = useState(0);
    const [loading, setLoading] = useState(false);

    // ล่าสุดสำเร็จเมื่อไร (epoch ms)
    const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
    const [tick, setTick] = useState(0); // อัปเดต "กี่วินาทีที่แล้ว"

    const [logs, setLogs] = useState<LogItem[]>([]);
    const disabled = loading || cooldown > 0;

    // ✅ กัน cooldown timer ซ้อน/ค้าง
    const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // cleanup timer ตอน unmount
    useEffect(() => {
        return () => {
            if (cooldownTimerRef.current) {
                clearInterval(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
            }
        };
    }, []);

    // โหลด log ตอน mount
    useEffect(() => {
        const l = loadLogs();
        setLogs(l);
        const lastOk = l.find((x) => x.status === "success");
        if (lastOk) setLastSuccessAt(lastOk.ts);
    }, []);

    // timer อัปเดต "กี่วินาทีที่แล้ว" ทุก 1 วิ
    useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const lastSuccessText = useMemo(() => {
        if (!lastSuccessAt) return "ยังไม่มีการรันสำเร็จ";
        const sec = Math.max(0, Math.floor((Date.now() - lastSuccessAt) / 1000));
        if (sec < 60) return `สำเร็จเมื่อ ${sec}s ที่แล้ว`;
        const min = Math.floor(sec / 60);
        const rem = sec % 60;
        return `สำเร็จเมื่อ ${min}m ${rem}s ที่แล้ว`;
    }, [lastSuccessAt, tick]);

    function pushLog(item: LogItem) {
        setLogs((prev) => {
            const next = [item, ...prev].slice(0, MAX_LOGS);
            saveLogs(next);
            return next;
        });
        if (item.status === "success") setLastSuccessAt(item.ts);
    }

    function startCooldown(seconds = 5) {
        setCooldown(seconds);

        if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
        }

        cooldownTimerRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    if (cooldownTimerRef.current) {
                        clearInterval(cooldownTimerRef.current);
                        cooldownTimerRef.current = null;
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    async function runSnapshot() {
        if (disabled) return;

        const started = performance.now();
        setLoading(true);

        try {
            const res = await fetch(SNAPSHOT_PATH, { method: "GET" });
            const ms = Math.round(performance.now() - started);

            // ✅ อ่าน text ก่อน แล้วค่อยพยายาม parse (กัน JSON parse fail + ได้ข้อความ error ชัด)
            let rawText = "";
            let payload: any = null;

            try {
                rawText = await res.text();
                payload = rawText ? JSON.parse(rawText) : null;
            } catch {
                // rawText ไม่ใช่ JSON ก็ปล่อยไว้
            }

            if (!res.ok) {
                const msg =
                    payload?.message ||
                    payload?.error ||
                    (rawText ? rawText.slice(0, 160) : "") ||
                    `HTTP ${res.status}`;

                pushLog({
                    ts: Date.now(),
                    status: "error",
                    ms,
                    message: msg,
                });
                return;
            }

            pushLog({ ts: Date.now(), status: "success", ms });

            // ✅ cooldown 5 วิ (กันกดรัว)
            startCooldown(5);

            // ✅ auto refresh หน้า เมื่อ snapshot เสร็จ
            router.refresh();
        } catch (err: any) {
            const ms = Math.round(performance.now() - started);
            pushLog({
                ts: Date.now(),
                status: "error",
                ms,
                message: err?.message ?? "fetch failed",
            });
        } finally {
            setLoading(false);
        }
    }

    function clearLogs() {
        setLogs([]);
        saveLogs([]);
        setLastSuccessAt(null);
    }

    return (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-medium text-neutral-200">
                        🔄 Manual Snapshot
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">{lastSuccessText}</div>
                    <div className="text-[11px] text-neutral-500 mt-1 truncate">
                        path: {SNAPSHOT_PATH}
                    </div>
                </div>

                <button
                    onClick={runSnapshot}
                    disabled={disabled}
                    className={`
            rounded-xl px-4 py-2 text-sm font-medium transition
            ${disabled
                            ? "bg-neutral-800 text-neutral-400 cursor-not-allowed"
                            : "bg-sky-600 text-white hover:bg-sky-500"
                        }
          `}
                >
                    {loading
                        ? "⏳ กำลังดึงข้อมูล..."
                        : cooldown > 0
                            ? `⏱ รอ ${cooldown}s`
                            : "🚀 Run Full Snapshot"}
                </button>
            </div>

            <div className="rounded-xl bg-neutral-950/60 p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-neutral-400">
                        ประวัติการกด (ล่าสุด {MAX_LOGS} รายการ)
                    </div>
                    <button
                        onClick={clearLogs}
                        className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                        ล้างประวัติ
                    </button>
                </div>

                {logs.length === 0 ? (
                    <div className="text-xs text-neutral-500">ยังไม่มี log</div>
                ) : (
                    <ul className="space-y-1 text-xs">
                        {logs.map((x, i) => {
                            const t = new Date(x.ts).toLocaleTimeString();
                            const ok = x.status === "success";
                            return (
                                <li
                                    key={i}
                                    className={`flex items-center justify-between gap-3 ${ok ? "text-emerald-200" : "text-rose-200"
                                        }`}
                                >
                                    <span className="truncate">
                                        {ok ? "✅" : "⛔"} {t} · {x.ms ?? "-"}ms{" "}
                                        {!ok && x.message ? `· ${x.message}` : ""}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
