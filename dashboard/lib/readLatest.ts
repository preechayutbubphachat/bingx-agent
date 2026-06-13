import { promises as fs } from "fs";
import path from "path";
import {
    buildCanonicalMarketRegime,
    buildMultiTimeframeIndicatorEvidence,
    type CanonicalMarketRegime,
} from "./market-regime/canonicalMarketRegime.ts";

type RuntimeFileStatus = "ok" | "missing" | "empty" | "invalid";

export type RuntimeFileMeta = {
    name: string;
    path: string;
    source: "root" | "mirror";
    status: RuntimeFileStatus;
    size: number | null;
    mtimeMs: number | null;
    mtimeIso: string | null;
    ageSec: number | null;
    warning?: string;
};

export type RuntimeSourceInfo = {
    rootDir: string;
    mirrorDir: string;
    files: RuntimeFileMeta[];
    fallbackUsed: boolean;
    warnings: string[];
};

const ROOT_JSON_FILES = [
    "market_snapshot.json",
    "latest_decision.json",
    "news_context.json",
    "plan_status_state.json",
] as const;

const STALE_MS = 30 * 60 * 1000;

function unique(items: string[]) {
    return [...new Set(items.filter(Boolean))];
}

async function statSafe(p: string) {
    try {
        return await fs.stat(p);
    } catch {
        return null;
    }
}

export async function resolveRuntimeDir() {
    const envDir =
        process.env.BINGX_AGENT_DIR?.trim() ||
        process.env.BINGX_DATA_DIR?.trim() ||
        process.env.DATA_DIR?.trim();
    const cwd = process.cwd();
    const candidates = unique([
        envDir ? path.resolve(cwd, envDir) : "",
        path.resolve(cwd, ".."),
        cwd,
        path.resolve(cwd, "../.."),
    ]);

    for (const dir of candidates) {
        const hasDecision = await statSafe(path.join(dir, "latest_decision.json"));
        const hasSnapshot = await statSafe(path.join(dir, "market_snapshot.json"));
        if (hasDecision || hasSnapshot) {
            return {
                dir,
                mirrorDir: path.join(cwd, "public", "data"),
            };
        }
    }

    return {
        dir: path.resolve(cwd, ".."),
        mirrorDir: path.join(cwd, "public", "data"),
    };
}

function metaFromStat(name: string, filePath: string, source: "root" | "mirror", st: Awaited<ReturnType<typeof statSafe>>): RuntimeFileMeta {
    if (!st) {
        return {
            name,
            path: filePath,
            source,
            status: "missing",
            size: null,
            mtimeMs: null,
            mtimeIso: null,
            ageSec: null,
            warning: `${name} missing`,
        };
    }

    const ageSec = Math.max(0, Math.floor((Date.now() - st.mtimeMs) / 1000));
    const meta: RuntimeFileMeta = {
        name,
        path: filePath,
        source,
        status: st.size > 0 ? "ok" : "empty",
        size: st.size,
        mtimeMs: st.mtimeMs,
        mtimeIso: new Date(st.mtimeMs).toISOString(),
        ageSec,
    };

    if (st.size <= 0) {
        meta.warning = `${name} is empty`;
    } else if (Date.now() - st.mtimeMs > STALE_MS) {
        meta.warning = `${name} may be stale (${ageSec}s old)`;
    }

    return meta;
}

export async function readRuntimeJson<T>(name: string, rootDir: string, mirrorDir?: string) {
    const rootPath = path.join(rootDir, name);
    const rootStat = await statSafe(rootPath);
    const rootMeta = metaFromStat(name, rootPath, "root", rootStat);

    async function parse(filePath: string) {
        const raw = await fs.readFile(filePath, "utf-8");
        if (!raw.trim()) {
            throw new Error("empty_file");
        }
        return JSON.parse(raw) as T;
    }

    if (rootMeta.status === "ok") {
        try {
            return {
                ok: true as const,
                value: await parse(rootPath),
                meta: rootMeta,
                fallbackUsed: false,
            };
        } catch (e: any) {
            rootMeta.status = "invalid";
            rootMeta.warning = `${name} invalid JSON: ${String(e?.message ?? e)}`;
        }
    }

    if (mirrorDir) {
        const mirrorPath = path.join(mirrorDir, name);
        const mirrorStat = await statSafe(mirrorPath);
        const mirrorMeta = metaFromStat(name, mirrorPath, "mirror", mirrorStat);
        if (mirrorMeta.status === "ok") {
            try {
                return {
                    ok: true as const,
                    value: await parse(mirrorPath),
                    meta: { ...mirrorMeta, warning: `fallback mirror used for ${name}` },
                    rootMeta,
                    fallbackUsed: true,
                };
            } catch (e: any) {
                mirrorMeta.status = "invalid";
                mirrorMeta.warning = `${name} mirror invalid JSON: ${String(e?.message ?? e)}`;
            }
        }

        return {
            ok: false as const,
            value: null,
            meta: rootMeta,
            mirrorMeta,
            fallbackUsed: false,
        };
    }

    return {
        ok: false as const,
        value: null,
        meta: rootMeta,
        fallbackUsed: false,
    };
}

export function buildSourceInfo(rootDir: string, mirrorDir: string, reads: Array<Awaited<ReturnType<typeof readRuntimeJson<any>>>>): RuntimeSourceInfo {
    const files = reads.flatMap((read) => [read.meta, "rootMeta" in read ? read.rootMeta : null, "mirrorMeta" in read ? read.mirrorMeta : null]).filter(Boolean) as RuntimeFileMeta[];
    const warnings = files.flatMap((file) => (file.warning ? [file.warning] : []));

    return {
        rootDir,
        mirrorDir,
        files,
        fallbackUsed: reads.some((read) => read.fallbackUsed),
        warnings,
    };
}

function normalizeRegime(regime: unknown, marketMode: unknown) {
    const r = String(regime ?? "").trim().toUpperCase();
    const m = String(marketMode ?? "").trim().toUpperCase();
    const key = `${r} ${m}`;

    if (r && r !== "UNKNOWN") return r;

    if (key.includes("NO_TRADE")) return "NO_TRADE";
    if (key.includes("TREND_DOWN") || key.includes("SHORT")) return "TREND_DOWN";
    if (key.includes("TREND_UP") || key.includes("LONG")) return "TREND_UP";
    if (key.includes("RANGE") || key.includes("GRID")) return "RANGE";
    if (key.includes("TREND")) return "TREND";

    return "UNKNOWN";
}

function fallbackDecision() {
    return {
        market_mode: "UNKNOWN",
        confidence: null,
        levels: {},
        parameters_for_grid_or_trend: {},
        reason: {},
        risk_warning: ["runtime data is unavailable or invalid"],
        summary_for_bot: "",
        symbol: "BTC-USDT",
        regime: "UNKNOWN",
    };
}

export type LatestCanonicalMarketRegimeDiagnostic = {
    regime: CanonicalMarketRegime["regime"];
    direction: CanonicalMarketRegime["direction"];
    confidence: number;
    source: "canonicalMarketRegime";
    reasons: string[];
    computedAt: string;
    decisionRegime: string | null;
    decisionRegimeMismatch: boolean;
    paperActivationAllowed: false;
    liveActivationAllowed: false;
};

function normalizeDecisionRegimeForCompare(value: unknown): string | null {
    const text = String(value ?? "").trim().toUpperCase();
    return text && text !== "UNKNOWN" ? text : null;
}

export function buildLatestCanonicalMarketRegimeDiagnostic(input: {
    decision: Record<string, any> | null | undefined;
    marketSnapshot: unknown;
    computedAt?: string;
}): LatestCanonicalMarketRegimeDiagnostic | null {
    if (!input.marketSnapshot) return null;
    const indicatorEvidenceByTimeframe = buildMultiTimeframeIndicatorEvidence(input.marketSnapshot);
    const canonical = buildCanonicalMarketRegime({
        marketSnapshot: input.marketSnapshot,
        indicatorEvidenceByTimeframe,
        legacyPlanMode: typeof input.decision?.market_mode === "string" ? input.decision.market_mode : null,
    });
    const decisionRegime = normalizeDecisionRegimeForCompare(input.decision?.regime);
    return {
        regime: canonical.regime,
        direction: canonical.direction,
        confidence: canonical.confidence,
        source: "canonicalMarketRegime",
        reasons: canonical.reasons,
        computedAt: input.computedAt ?? new Date().toISOString(),
        decisionRegime,
        decisionRegimeMismatch: decisionRegime != null && decisionRegime !== canonical.regime,
        paperActivationAllowed: false,
        liveActivationAllowed: false,
    };
}

export async function readLatest() {
    const { dir, mirrorDir } = await resolveRuntimeDir();

    const [snapshotRead, decisionRead, newsRead, stateRead] = await Promise.all([
        readRuntimeJson<any>("market_snapshot.json", dir, mirrorDir),
        readRuntimeJson<any>("latest_decision.json", dir, mirrorDir),
        readRuntimeJson<any>("news_context.json", dir),
        readRuntimeJson<any>("plan_status_state.json", dir),
    ]);

    const step2Path = path.join(dir, "latest_step2.txt");
    const step2Stat = await statSafe(step2Path);
    const step2Text = step2Stat && step2Stat.size > 0 ? await fs.readFile(step2Path, "utf-8").catch(() => null) : null;

    const decision = decisionRead.ok ? decisionRead.value : fallbackDecision();
    const regimeRaw = decision?.regime;
    const marketMode = decision?.market_mode;
    const regimeNorm = normalizeRegime(regimeRaw, marketMode);

    if (String(regimeRaw ?? "").toUpperCase() !== regimeNorm) {
        decision.regime_raw = regimeRaw ?? null;
    }
    decision.regime = regimeNorm;
    const canonicalDiagnostic = buildLatestCanonicalMarketRegimeDiagnostic({
        decision,
        marketSnapshot: snapshotRead.ok ? snapshotRead.value : null,
    });
    if (canonicalDiagnostic) {
        decision.diagnostics = {
            ...(decision.diagnostics && typeof decision.diagnostics === "object" ? decision.diagnostics : {}),
            canonicalMarketRegime: canonicalDiagnostic,
        };
    }

    const sourceInfo = buildSourceInfo(dir, mirrorDir, [snapshotRead, decisionRead, newsRead, stateRead]);
    if (step2Stat) {
        sourceInfo.files.push(metaFromStat("latest_step2.txt", step2Path, "root", step2Stat));
    }

    const authoritativeOk = snapshotRead.ok && decisionRead.ok && !snapshotRead.fallbackUsed && !decisionRead.fallbackUsed;

    return {
        ok: true as const,
        authoritativeOk,
        dir,
        updatedAt: decisionRead.meta.mtimeMs ?? snapshotRead.meta.mtimeMs ?? Date.now(),
        decision,
        marketSnapshot: snapshotRead.ok ? snapshotRead.value : null,
        newsContext: newsRead.ok ? newsRead.value : null,
        planStatusState: stateRead.ok ? stateRead.value : null,
        step2Text,
        sourceInfo,
        freshness: {
            rootFilesRead: ROOT_JSON_FILES,
            fallbackUsed: sourceInfo.fallbackUsed,
            warnings: sourceInfo.warnings,
        },
    };
}

export type ReadLatestExportContract = {
    buildSourceInfo: typeof buildSourceInfo;
    readLatest: typeof readLatest;
    readRuntimeJson: typeof readRuntimeJson;
    resolveRuntimeDir: typeof resolveRuntimeDir;
};
