// dashboard/components/plan-steps/types.ts

// UI step status
export type StepStatus = "LOCKED" | "WAITING" | "CONFIRMED" | "FAILED" | "SKIPPED";

// Backend/engine step status
export type EngineStepStatus = "WAITING" | "PASS" | "WARN" | "FAIL" | "DONE";

// StepSet keys (UI fallback / backend can provide step_set too)
export type StepSetKey =
    | "GRID_SWEEP_PIPELINE"
    | "BREAKOUT_SWITCH_MODE"
    | "MODE_LOCKED_NO_TRADE"
    | "MODE_LOCKED_TREND"
    | "TREND_UP_STEPSET";

// UI step item
export type StepUI = {
    id: string;              // ✅ เปลี่ยนเป็น string (รองรับ "SWEEP_5M", "trend_tp1", ...)
    title: string;
    status: StepStatus;
    badge: string;           // e.g. "WAIT", "PASS", "DONE"
    detail: string;
    why?: string;
};

// Engine payload for plan steps
export type PlanStatusState = {
    generated_at: string;
    age_sec: number | null;

    price?: { close_5m?: number | null; close_1h?: number | null };
    plan?: any;

    state: {
        code: string;
        headline: string;
        direction_hint?: string;
        confidence?: number | null;

        // ✅ backend บอกชุด step ได้เอง
        step_set?: StepSetKey;

        // trend extras (optional)
        confirm_ts?: number | null;
        entry_1_done?: boolean;
        entry_2_done?: boolean;
    };

    signals?: Record<string, any>;
    next_actions?: string[];

    steps: Array<{
        id: string;
        title: string;
        status: EngineStepStatus;
        why?: string;
        data?: any;
    }>;

    event_log?: Array<{ t: string; event: string; note?: string }>;
};

// PlanStatus = /api/plan-status response
export type PlanStatus = {
    ok: boolean;
    symbol: string;

    updated_at: number; // server response time (ms)
    source_updated_at: number | null; // collector time (sec/ms)

    price: { close_5m: number | null; close_1h: number | null };

    mode_lock?: {
        value: string;
        changed?: boolean;
    };

    plan: {
        market_regime: string;
        market_mode: string;
        risk_warning: string[];
        confidence: number | null;
        sweep_target: { side: "UP" | "DOWN"; zone: [number, number] };
        grid: { upper: number; lower: number; count: number | null };
    };

    derivatives?: {
        updated_at?: number | null;
        freshness?: { tag: string; ageSec: number | null };

        oi: {
            now: number | null;
            at_sweep: number | null;
            trend_5m: { dir: string; pct: number };
            trend_15m: { dir: string; pct: number };

            has_data?: boolean;
            status?: string;
            reason?: string | null;

            source?: any;
            integrity?: any;
        };

        funding: {
            now: number | null;
            trend_5m: { dir: string; pct: number };
            trend_15m: { dir: string; pct: number };

            has_data?: boolean;
            status?: string;
            reason?: string | null;

            source?: any;
            integrity?: any;
        };

        crowd: {
            side: string;
            trapped: string;
            crowd_th: string;
            trapped_th: string;
            note: string;
        };
    };

    states: {
        sweep_5m: string;
        rejection_15m: string;
        confirm_1h: string;
        plan_state: string;
    };

    plan_status_state?: PlanStatusState | null;

    explain_th: string;

    // เผื่อมี debug/explain เพิ่ม ไม่ทำให้ TS พัง
    [k: string]: any;
};

export type LogItem = {
    t: number;
    type?: string; // "STATE_CHANGE" | "MODE_SWITCH" | ...
    from: string | null;
    to: string;
    mode_lock?: string;

    price?: { close_5m: number | null };
    deriv?: {
        oi5_dir?: string;
        oi5_pct?: number;
        fund5_dir?: string;
        fund5_pct?: number;
        crowd?: string;
        trapped?: string;
    };

    sweep?: any;
    explain_th?: string;

    from_mode?: string | null;
    to_mode?: string | null;
    to_plan_state?: string | null;
};

// buildSteps output
export type BuildStepsResult = {
    key: StepSetKey;
    title: string;
    steps: StepUI[];
    activeStepId: string | null; // ✅ เปลี่ยนเป็น string | null
};
