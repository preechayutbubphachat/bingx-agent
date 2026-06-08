// dashboard/lib/trend/trendPaperArmSession.test.ts
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendPaperArmSession.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTrendPaperArmSession,
  isTrendPaperArmSessionActive,
  consumeTrendPaperArmSessionEntry,
  deriveTrendPaperArmSessionStatus,
  type TrendPaperArmSession,
} from "./trendPaperArmSession.ts";

const NOW = "2026-06-08T00:00:00.000Z";
const PLUS_1H = "2026-06-08T01:00:00.000Z";
const MINUS_1H = "2026-06-07T23:00:00.000Z";

function mk(over: Partial<TrendPaperArmSession> = {}): TrendPaperArmSession {
  return {
    schemaVersion: "trend-paper-arm-session/1",
    sessionId: "sess-1",
    status: "ACTIVE",
    symbol: "BTC-USDT",
    direction: "SHORT",
    startedAt: MINUS_1H,
    expiresAt: PLUS_1H,
    maxEntries: 3,
    usedEntries: 0,
    maxRiskPerTradePct: 1,
    maxSessionRiskPct: 3,
    approvedBy: "OPERATOR",
    paperOnly: true,
    liveActivationAllowed: false,
    exchangeOrderAllowed: false,
    oldExposurePolicy: "QUARANTINE_OLD_GRID_EXPOSURE",
    notes: [],
    ...over,
  };
}

test("missing session => not active", () => {
  assert.equal(isTrendPaperArmSessionActive(null, NOW), false);
  assert.equal(deriveTrendPaperArmSessionStatus(null, NOW), "MISSING");
});

test("ACTIVE valid session => active", () => {
  const s = mk();
  assert.equal(validateTrendPaperArmSession(s).valid, true);
  assert.equal(isTrendPaperArmSessionActive(s, NOW), true);
  assert.equal(deriveTrendPaperArmSessionStatus(s, NOW), "ACTIVE");
});

test("expired session => expired / not active", () => {
  const s = mk({ startedAt: "2026-06-07T22:00:00.000Z", expiresAt: MINUS_1H });
  assert.equal(isTrendPaperArmSessionActive(s, NOW), false);
  assert.equal(deriveTrendPaperArmSessionStatus(s, NOW), "EXPIRED");
});

test("limit reached => not active / LIMIT_REACHED", () => {
  const s = mk({ maxEntries: 2, usedEntries: 2 });
  assert.equal(isTrendPaperArmSessionActive(s, NOW), false);
  assert.equal(deriveTrendPaperArmSessionStatus(s, NOW), "LIMIT_REACHED");
});

test("liveActivationAllowed true rejected", () => {
  const r = validateTrendPaperArmSession(mk({ liveActivationAllowed: true as unknown as false }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("liveActivationAllowed")));
});

test("exchangeOrderAllowed true rejected", () => {
  const r = validateTrendPaperArmSession(mk({ exchangeOrderAllowed: true as unknown as false }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("exchangeOrderAllowed")));
});

test("paperOnly false rejected", () => {
  const r = validateTrendPaperArmSession(mk({ paperOnly: false as unknown as true }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("paperOnly")));
});

test("oldExposurePolicy not quarantine rejected", () => {
  const r = validateTrendPaperArmSession(mk({ oldExposurePolicy: "USE_OLD_GRID" as unknown as "QUARANTINE_OLD_GRID_EXPOSURE" }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("oldExposurePolicy")));
});

test("expiresAt <= startedAt rejected", () => {
  const r = validateTrendPaperArmSession(mk({ startedAt: PLUS_1H, expiresAt: MINUS_1H }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("expiresAt")));
});

test("maxEntries < 1 and usedEntries > maxEntries rejected", () => {
  assert.equal(validateTrendPaperArmSession(mk({ maxEntries: 0 })).valid, false);
  assert.equal(validateTrendPaperArmSession(mk({ maxEntries: 2, usedEntries: 3 })).valid, false);
});

test("insane risk caps rejected", () => {
  assert.equal(validateTrendPaperArmSession(mk({ maxRiskPerTradePct: 99 })).valid, false);
  assert.equal(validateTrendPaperArmSession(mk({ maxSessionRiskPct: 99 })).valid, false);
  assert.equal(validateTrendPaperArmSession(mk({ maxRiskPerTradePct: 0 })).valid, false);
});

test("consume increments and flips to LIMIT_REACHED at cap", () => {
  let s = mk({ maxEntries: 2, usedEntries: 0 });
  s = consumeTrendPaperArmSessionEntry(s);
  assert.equal(s.usedEntries, 1);
  assert.equal(s.status, "ACTIVE");
  s = consumeTrendPaperArmSessionEntry(s);
  assert.equal(s.usedEntries, 2);
  assert.equal(s.status, "LIMIT_REACHED");
  assert.equal(isTrendPaperArmSessionActive(s, NOW), false);
});

test("REVOKED / INACTIVE never active", () => {
  assert.equal(isTrendPaperArmSessionActive(mk({ status: "REVOKED" }), NOW), false);
  assert.equal(isTrendPaperArmSessionActive(mk({ status: "INACTIVE" }), NOW), false);
});
