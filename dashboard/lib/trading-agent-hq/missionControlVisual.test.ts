// Run: node --test --experimental-strip-types lib/trading-agent-hq/missionControlVisual.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisRailReadabilityClass,
  cyberProgressTone,
  hudPanelClass,
  normalizedPanelClass,
  missionCardTone,
  statusWallGridClass,
  statusTileClass,
  threeColumnShellClass,
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

test("D6.2 layout helpers enforce independent desktop column scrolling", () => {
  assert.match(threeColumnShellClass(), /h-screen/);
  assert.match(threeColumnShellClass(), /overflow-hidden/);
  assert.match(threeColumnShellClass(), /lg:flex-row/);
  assert.match(analysisRailReadabilityClass(), /agent-hq-analysis-rail/);
  assert.match(analysisRailReadabilityClass(), /lg:overflow-y-auto/);
  assert.match(analysisRailReadabilityClass(), /lg:overscroll-contain/);
});

test("D6.3 panel helpers normalize card rhythm without fixed clipping", () => {
  assert.match(normalizedPanelClass("compact"), /min-h-\[160px\]/);
  assert.doesNotMatch(normalizedPanelClass("standard"), /h-full/);
  assert.match(normalizedPanelClass("tall"), /min-h-\[360px\]/);
  assert.match(statusTileClass(), /min-h-\[170px\]/);
  assert.doesNotMatch(statusTileClass(), /h-\[116px\]/);
  assert.doesNotMatch(statusTileClass(), /min-h-\[116px\]/);
  assert.match(statusTileClass(), /contain:layout/);
  assert.doesNotMatch(statusTileClass(), /overflow-hidden/);
  assert.doesNotMatch(statusTileClass(), /h-full/);
  assert.match(statusTileClass(), /line-clamp-2/);
  assert.match(statusWallGridClass(), /agent-hq-collapsed-grid/);
  assert.match(statusWallGridClass(), /overflow-visible/);
  assert.doesNotMatch(statusWallGridClass(), /max-h-/);
  assert.doesNotMatch(statusWallGridClass(), /overflow-y-auto/);
  assert.doesNotMatch(statusWallGridClass(), /grid-cols-/);
  assert.doesNotMatch(statusWallGridClass(), /contain:layout_paint/);
});
