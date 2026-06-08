// dashboard/lib/trend/trendPaperDryRun.test.ts
// Run: node --experimental-strip-types --test dashboard/lib/trend/trendPaperDryRun.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDryRunSession,
  revokeDryRunSession,
  isTrendPaperDryRunAction,
  TREND_PAPER_DRY_RUN_MAX_EXPIRY_MINUTES,
} from "./trendPaperDryRun.ts";
import { validateTrendPaperArmSession } from "./trendPaperArmSession.ts";

const NOW = Date.parse("2026-06-08T00:00:00.000Z");

test("action validation: only the 5 known actions", () => {
  for (const a of ["baseline_check", "create_session", "verify_session", "one_shot_run", "cleanup"]) {
    assert.equal(isTrendPaperDryRunAction(a), true);
  }
  for (const a of ["live", "place_order", "enable_cron", "", null, 42, "BASELINE_CHECK"]) {
    assert.equal(isTrendPaperDryRunAction(a), false);
  }
});

test("buildDryRunSession forces maxEntries=1, usedEntries=0", () => {
  const s = buildDryRunSession({ now: NOW, maxRiskPerTradePct: 99, maxSessionRiskPct: 99 } as never);
  assert.equal(s.maxEntries, 1);
  assert.equal(s.usedEntries, 0);
});

test("buildDryRunSession forces all safety invariants", () => {
  const s = buildDryRunSession({ now: NOW });
  assert.equal(s.paperOnly, true);
  assert.equal(s.paperArmIntentRequested, true);
  assert.equal(s.liveActivationAllowed, false);
  assert.equal(s.exchangeOrderAllowed, false);
  assert.equal(s.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
  assert.equal(s.approvedBy, "OPERATOR");
  assert.equal(s.status, "ACTIVE");
  assert.equal(s.symbol, "BTC-USDT");
});

test("buildDryRunSession caps expiry at 30 minutes", () => {
  const s = buildDryRunSession({ now: NOW, expiryMinutes: 999 });
  const mins = (Date.parse(s.expiresAt) - Date.parse(s.startedAt)) / 60000;
  assert.equal(mins, TREND_PAPER_DRY_RUN_MAX_EXPIRY_MINUTES);
});

test("buildDryRunSession floors expiry at 1 minute", () => {
  const s = buildDryRunSession({ now: NOW, expiryMinutes: 0 });
  const mins = (Date.parse(s.expiresAt) - Date.parse(s.startedAt)) / 60000;
  assert.equal(mins, 1);
});

test("buildDryRunSession default expiry 20 minutes", () => {
  const s = buildDryRunSession({ now: NOW });
  const mins = (Date.parse(s.expiresAt) - Date.parse(s.startedAt)) / 60000;
  assert.equal(mins, 20);
});

test("buildDryRunSession direction normalization (default SHORT)", () => {
  assert.equal(buildDryRunSession({ now: NOW, direction: "LONG" }).direction, "LONG");
  assert.equal(buildDryRunSession({ now: NOW, direction: "ANY" }).direction, "ANY");
  assert.equal(buildDryRunSession({ now: NOW, direction: "garbage" }).direction, "SHORT");
  assert.equal(buildDryRunSession({ now: NOW }).direction, "SHORT");
});

test("buildDryRunSession caps risk inputs (sane bounds)", () => {
  const s = buildDryRunSession({ now: NOW, maxRiskPerTradePct: 99, maxSessionRiskPct: 99 });
  assert.ok(s.maxRiskPerTradePct <= 5);
  assert.ok(s.maxSessionRiskPct <= 20);
});

test("buildDryRunSession output passes the canonical session validator", () => {
  const r = validateTrendPaperArmSession(buildDryRunSession({ now: NOW }));
  assert.equal(r.valid, true, r.errors.join(","));
});

test("revokeDryRunSession sets REVOKED, keeps flags locked, no mutation", () => {
  const s = buildDryRunSession({ now: NOW });
  const r = revokeDryRunSession(s);
  assert.equal(r.status, "REVOKED");
  assert.equal(s.status, "ACTIVE"); // original unchanged
  assert.equal(r.liveActivationAllowed, false);
  assert.equal(r.exchangeOrderAllowed, false);
  assert.equal(r.paperOnly, true);
  assert.equal(r.oldExposurePolicy, "QUARANTINE_OLD_GRID_EXPOSURE");
});
