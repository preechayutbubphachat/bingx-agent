// C:\bingx-agent\run_cycle.js (ESM)
import axios from "axios";
import { spawnSync } from "child_process";

const args = new Set(process.argv.slice(2));
const NO_NEWS = args.has("--no-news");

const symbol = process.env.SYMBOL || "BTC-USDT";
const klineLimit = Number(process.env.KLINE_LIMIT || 200);
const depthLimit = Number(process.env.DEPTH_LIMIT || 50);

async function main() {
    // 1) Refresh market snapshot (no LLM, pure data)
    await axios.get("http://localhost:3000/collect_market_snapshot", {
        params: { symbol, klineLimit, depthLimit },
        timeout: 60_000,
    });

    // 2) Optional news (skip to save quota)
    if (!NO_NEWS) {
        await axios.get("http://localhost:3000/build_news_context", {
            params: { symbol },
            timeout: 60_000,
        });
    } else {
        console.log("[run_cycle] skip news (--no-news)");
    }

    // 3) Run deterministic decision engine (CJS)
    const childArgs = ["C:\\bingx-agent\\run_latest_decision.cjs"];
    if (NO_NEWS) childArgs.push("--no-news");

    const r = spawnSync("node", childArgs, { stdio: "inherit" });

    if (r.error) {
        console.error("[run_cycle] ERROR:", r.error?.message ?? r.error);
        process.exit(1);
    }

    process.exit(r.status ?? 0);
}

main().catch((e) => {
    console.error("[run_cycle] ERROR:", e?.message || e);
    process.exit(1);
});
