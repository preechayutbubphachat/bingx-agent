"use client";
return {
    wrap: "border border-white/10 bg-white/5",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/20",
    title: "text-white/90",
};
}


if (status === "WAITING") {
    return {
        wrap: "border border-white/10 bg-white/5",
        dot: "bg-white/25",
        badge: "bg-white/5 text-white/70 border border-white/10",
        title: "text-white/90",
    };
}


if (status === "LOCKED" || status === "SKIPPED") {
    return {
        wrap: "border border-white/5 bg-white/3 opacity-75",
        dot: "bg-white/15",
        badge: "bg-white/3 text-white/50 border border-white/5",
        title: "text-white/70",
    };
}


// FAILED
return {
    wrap: "border border-rose-500/30 bg-rose-500/10",
    dot: "bg-rose-400",
    badge: "bg-rose-500/15 text-rose-200 border border-rose-500/30",
    title: "text-rose-50",
};
}


export default function PlanStepsRow({
    label,
    steps,
    activeStepId,
}: {
    label?: string;
    steps: StepUI[];
    activeStepId: 1 | 2 | 3 | null;
}) {
    return (
        <div className="rounded-xl bg-neutral-950/60 p-4">
            {label && <div className="text-sm text-neutral-200 font-semibold">{label}</div>}


            <div className={`mt-${label ? "3" : "0"} grid gap-2 sm:grid-cols-3`}>
                {steps.map((s) => {
                    const active = activeStepId === s.id;
                    const t = tone(s.status, active);


                    return (
                        <div key={s.id} className={`rounded-xl border p-3 ${t.wrap}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`mt-1 h-3 w-3 rounded-full ${t.dot}`} />
                                    <div className="min-w-0">
                                        <div className={`text-sm font-semibold ${t.title}`}>{s.title}</div>
                                        <div className="mt-0.5 text-xs text-neutral-400 break-words">{s.detail}</div>
                                        {s.why && <div className="mt-1 text-[11px] text-neutral-500">state: {s.why}</div>}
                                    </div>
                                </div>


                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${t.badge}`}>{s.badge}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}