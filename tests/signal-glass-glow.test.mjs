import assert from "node:assert/strict";
import test from "node:test";
import {
  minimumGlassGlow,
  resolveGlowIntensity,
  SIGNAL_GLASS_DAY_GLOW,
} from "../games/make-a-mess/src/game/materialTextures.ts";

test("signal glass keeps a daytime glow while ordinary windows switch off", () => {
  const signalMinimum = minimumGlassGlow("#7fe6a0");
  const windowMinimum = minimumGlassGlow("#f2dfa7");
  assert.equal(signalMinimum, SIGNAL_GLASS_DAY_GLOW);
  assert.equal(windowMinimum, 0);
  assert.equal(resolveGlowIntensity(0, signalMinimum), SIGNAL_GLASS_DAY_GLOW);
  assert.equal(resolveGlowIntensity(0, windowMinimum), 0);
  assert.equal(resolveGlowIntensity(2.7, signalMinimum), 2.7);
});
