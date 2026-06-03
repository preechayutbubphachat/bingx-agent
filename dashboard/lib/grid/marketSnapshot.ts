// dashboard/lib/grid/marketSnapshot.ts
// Algorithm v2 hotfix helper — select the LATEST close from a market_snapshot.
// Root cause fixed: snapshot candle arrays are oldest→newest; reading the FIRST close
// gave a stale price. Prefer max-timestamp candle, else the LAST element, never the first
// unless it is the only/newest one. Pure, no I/O.

type AnyObj = Record<string, unknown>;
const obj = (v: unknown): AnyObj => (v && typeof v === "object" ? (v as AnyObj) : {});
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

const CANDLE_ARRAY_KEYS = ["candles", "ohlc", "ohlcv", "klines", "bars", "closes", "candles5m", "data"];
const TS_KEYS = ["t", "time", "ts", "closeTime", "openTime", "timestamp"];
const CLOSE_KEYS = ["close", "c", "closePrice", "lastPrice"];
const LATEST_SCALAR_KEYS = ["lastClose", "last_close", "latestClose", "latest_close", "lastPrice"];

function tsOf(c: AnyObj): number | null {
  for (const k of TS_KEYS) {
    const n = num(c[k]);
    if (n != null) return n;
  }
  return null;
}
function closeOf(c: AnyObj): number | null {
  for (const k of CLOSE_KEYS) {
    const n = num(c[k]);
    if (n != null) return n;
  }
  return null;
}
function firstArray(s: AnyObj): unknown[] | null {
  for (const k of CANDLE_ARRAY_KEYS) {
    if (Array.isArray(s[k]) && (s[k] as unknown[]).length > 0) return s[k] as unknown[];
  }
  return null;
}

/**
 * Returns the most-recent close price from a market_snapshot, or null.
 * Priority: explicit latest scalar → max-timestamp candle → last array element → top-level close.
 */
export function getLatestCloseFromMarketSnapshot(snapshot: unknown): number | null {
  const s = obj(snapshot);

  // 1) explicit "latest" scalar wins
  for (const k of LATEST_SCALAR_KEYS) {
    const n = num(s[k]);
    if (n != null) return n;
  }

  // 2) candle array
  const arr = firstArray(s);
  if (arr) {
    // plain numeric closes array → last element (oldest→newest assumed)
    if (typeof arr[arr.length - 1] === "number") return num(arr[arr.length - 1]);

    const candles = arr.map(obj);
    const tsList = candles.map(tsOf);
    const allHaveTs = tsList.every((t) => t != null);
    if (allHaveTs) {
      // pick candle with the maximum timestamp (robust to array order)
      let bestIdx = 0;
      for (let i = 1; i < candles.length; i++) {
        if ((tsList[i] as number) >= (tsList[bestIdx] as number)) bestIdx = i;
      }
      return closeOf(candles[bestIdx]);
    }
    // no timestamps → last element
    return closeOf(candles[candles.length - 1]);
  }

  // 3) top-level scalar close (last resort)
  return num(s.close) ?? num(s.c);
}
