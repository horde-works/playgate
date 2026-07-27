import assert from "node:assert/strict";
import test from "node:test";
import {
  minimumGlassGlow,
  pieceMaterialBaseColor,
  pieceMaterialOpacity,
  resolveGlowIntensity,
  SIGNAL_GLASS_DAY_GLOW,
} from "../games/make-a-mess/src/game/materialTextures.ts";
import {
  clearPassengerGlassColor,
  departureSignalColor,
  informationDisplayColor,
} from "../games/make-a-mess/src/game/destructionScene.ts";

test("signal glass keeps a daytime glow while ordinary windows switch off", () => {
  const signalMinimum = minimumGlassGlow("#7fe6a0");
  const windowMinimum = minimumGlassGlow("#f2dfa7");
  const controlledMinimum = minimumGlassGlow(departureSignalColor);
  const displayMinimum = minimumGlassGlow(informationDisplayColor);
  assert.equal(signalMinimum, SIGNAL_GLASS_DAY_GLOW);
  assert.equal(windowMinimum, 0);
  assert.equal(controlledMinimum, 0);
  assert.equal(displayMinimum, SIGNAL_GLASS_DAY_GLOW);
  assert.equal(resolveGlowIntensity(0, signalMinimum), SIGNAL_GLASS_DAY_GLOW);
  assert.equal(resolveGlowIntensity(0, windowMinimum), 0);
  assert.equal(resolveGlowIntensity(2.7, signalMinimum), SIGNAL_GLASS_DAY_GLOW);

  // Инстансный батчер обязан оставить сигнальный цвет на БАЗОВОМ материале:
  // emissive выбирается до применения instanceColor.
  assert.equal(pieceMaterialBaseColor("glass", "#7fe6a0"), "#7fe6a0");
  assert.equal(pieceMaterialBaseColor("glass", "#f08a80"), "#f08a80");
  assert.equal(pieceMaterialBaseColor("glass", "#f4f1e2"), "#f4f1e2");
  assert.equal(
    pieceMaterialBaseColor("glass", departureSignalColor),
    departureSignalColor,
  );
  assert.equal(
    pieceMaterialBaseColor("glass", informationDisplayColor),
    informationDisplayColor,
  );
  assert.equal(pieceMaterialBaseColor("glass", "#4c88aa"), "#ffffff");
  assert.equal(
    pieceMaterialBaseColor("glass", clearPassengerGlassColor),
    clearPassengerGlassColor,
  );
  assert.equal(pieceMaterialOpacity("glass", clearPassengerGlassColor), 0.22);
  assert.equal(pieceMaterialOpacity("glass", "#4c88aa"), 0.45);
});
