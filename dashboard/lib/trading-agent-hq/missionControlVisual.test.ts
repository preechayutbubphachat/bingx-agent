// Run: node --test --experimental-strip-types lib/trading-agent-hq/missionControlVisual.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  cyberProgressTone,
  hudPanelClass,
  missionCardTone,
  reviewOnlySafetyCopy,
} from "./missionControlVisual.ts";

test("mission control visual helpers keep D6.1 HUD surfaces dark and luminous", () => {
  assert.match(hudPanelClass("cyan"), /bg-slate-950\/80/);
  assert.match(hudPanelClass("magenta"), /border-fuchsia-300\/30/);
  assert.match(missionCardTone("ACTIVE"), /cyan/);
  assert.match(missionCardTone("BLOCKED"), /rose/);
  assert.match(missionCardTone("WAITING_DATA"), /amber/);
});

test("review-only safety copy never implies activation or order placement", () => {
  assert.equal(reviewOnlySafetyCopy(), "ใช้เพื่อรีวิวเท่านั้น · ไม่ใช่ Activation · ไม่ใช่ Live · ไม่ใช่ Order");
  assert.doesNotMatch(reviewOnlySafetyCopy().toLowerCase(), /ready to trade|go live|activate now/);
});

test("cyber progress tone maps review scores without trading language", () => {
  assert.match(cyberProgressTone(82), /emerald/);
  assert.match(cyberProgressTone(45), /cyan/);
  assert.match(cyberProgressTone(12), /amber/);
  assert.match(cyberProgressTone(null), /slate/);
});
