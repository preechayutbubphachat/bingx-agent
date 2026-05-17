// dashboard/app/api/run-cycle/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENABLED = /^(1|true|yes)$/i.test(process.env.ENABLE_RUN_CYCLE ?? "");

let RUNNING = false;

function tail(s: string, max = 4000) {
    if (!s) return "";
    return s.length <= max ? s : s.slice(-max);
}

function run(cmd: string, args: string[], cwd: string) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const p = spawn(cmd, args, { cwd, windowsHide: true, shell: false });

        let stdout = "";
        let stderr = "";

        p.stdout?.on("data", (d) => (stdout += String(d)));
        p.stderr?.on("data", (d) => (stderr += String(d)));

        p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
}

export async function GET() {
    return NextResponse.json({
        ok: true,
        enabled: ENABLED,
        running: RUNNING,
    });
}

export async function POST(req: Request) {
    if (!ENABLED) {
        return NextResponse.json(
            { ok: false, error: "run-cycle endpoint is disabled. set ENABLE_RUN_CYCLE=1" },
            { status: 403 }
        );
    }

    if (RUNNING) {
        return NextResponse.json(
            { ok: false, error: "run-cycle is already running" },
            { status: 409 }
        );
    }

    let body: any = {};
    try {
        body = await req.json();
    } catch { }

    const mode = String(body?.mode ?? "NO_NEWS").toUpperCase(); // NO_NEWS | WITH_NEWS
    const agentRoot =
        process.env.BINGX_AGENT_DIR && String(process.env.BINGX_AGENT_DIR).trim()
            ? path.resolve(String(process.env.BINGX_AGENT_DIR))
            : path.resolve(process.cwd(), ".."); // dashboard -> C:\bingx-agent

    const startedAt = Date.now();

    // Prefer your exact cmd for NO_NEWS on Windows
    const noNewsCmd = path.join(agentRoot, "run_cycle_no_news.cmd");
    const scriptJs = path.join(agentRoot, "run_cycle.js");

    let cmd = process.execPath; // node
    let args: string[] = [scriptJs];

    if (process.platform === "win32" && mode === "NO_NEWS" && fs.existsSync(noNewsCmd)) {
        cmd = "cmd.exe";
        args = ["/c", noNewsCmd];
    } else {
        // Fallback: run node script
        if (!fs.existsSync(scriptJs)) {
            return NextResponse.json(
                { ok: false, error: `run_cycle.js not found at: ${scriptJs}` },
                { status: 500 }
            );
        }
        if (mode === "NO_NEWS") args.push("--no-news");
        // WITH_NEWS = no flag (run with news once)
    }

    RUNNING = true;
    try {
        const { code, stdout, stderr } = await run(cmd, args, agentRoot);
        const took_ms = Date.now() - startedAt;

        const ok = code === 0;
        return NextResponse.json({
            ok,
            mode,
            code,
            took_ms,
            cmd: [cmd, ...args].join(" "),
            stdout_tail: tail(stdout),
            stderr_tail: tail(stderr),
        });
    } finally {
        RUNNING = false;
    }
}
