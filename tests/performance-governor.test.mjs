import assert from "node:assert/strict";
import test from "node:test";
import { performanceGovernor } from "../games/make-a-mess/src/game/performanceGovernor.ts";

function frames(count, frameMs, cpuMs, physicsMs = 0) {
  for (let index = 0; index < count; index += 1) {
    performanceGovernor.recordPhysics(physicsMs);
    performanceGovernor.recordFrame(frameMs, cpuMs, 100, 1_000_000);
  }
}

test("governor separates GPU pressure from CPU and physics pressure", () => {
  performanceGovernor.reset();
  performanceGovernor.recordGpu(30);
  frames(140, 30, 4);
  let sample = performanceGovernor.getSnapshot();
  assert.equal(sample.bottleneck, "gpu");
  assert.equal(sample.gpuQuality, 0);
  assert.equal(sample.cpuQuality, 2);

  performanceGovernor.reset();
  frames(140, 25, 18, 1);
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.bottleneck, "cpu");
  assert.equal(sample.cpuQuality, 0);

  performanceGovernor.reset();
  frames(140, 25, 10, 8);
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.bottleneck, "physics");
  assert.equal(sample.physicsQuality, 0);
});

test("ручной оверрайд замораживает оси, сенсоры продолжают мерить", async () => {
  const { manualSettingsFromSnapshot, parseGraphicsSettings } = await import(
    "../games/make-a-mess/src/game/graphicsSettings.ts"
  );

  performanceGovernor.reset();
  performanceGovernor.setQualityOverride({
    cpuQuality: 1,
    gpuQuality: 0,
    physicsQuality: 2,
  });
  // Тяжёлые кадры при оверрайде не роняют оси ниже выбранного...
  performanceGovernor.recordGpu(30);
  frames(140, 30, 20, 8);
  let sample = performanceGovernor.getSnapshot();
  assert.equal(sample.gpuQuality, 0);
  assert.equal(sample.cpuQuality, 1);
  assert.equal(sample.physicsQuality, 2);
  // ...а сенсоры живут: HUD остаётся честным.
  assert.ok(sample.frameMs > 20, "frameMs перестал измеряться под оверрайдом");
  assert.equal(sample.bottleneck !== "balanced", true);

  // Лёгкие кадры не «восстанавливают» оси вверх мимо руки игрока.
  frames(400, 10, 3, 0);
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.gpuQuality, 0);
  assert.equal(sample.cpuQuality, 1);

  // Снятие оверрайда возвращает автомат: восстановление идёт своим темпом.
  // gpuMs — EMA от recordGpu, лёгкий GPU надо тоже записывать.
  performanceGovernor.setQualityOverride(null);
  for (let index = 0; index < 1200; index += 1) {
    performanceGovernor.recordGpu(5);
    performanceGovernor.recordPhysics(0);
    performanceGovernor.recordFrame(10, 3, 100, 1_000_000);
  }
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.gpuQuality, 2, "автомат не восстановился после ручного");

  // Закон панели: выключение автомата предзаполняется выбором автомата.
  performanceGovernor.reset();
  performanceGovernor.recordGpu(30);
  frames(140, 30, 4);
  performanceGovernor.setRenderScaleLevel(2);
  const manual = manualSettingsFromSnapshot(performanceGovernor.getSnapshot());
  assert.equal(manual.auto, false);
  assert.equal(manual.gpuQuality, 0);
  assert.equal(manual.renderScaleLevel, 2);

  // Сохранённое переживает мусор в localStorage.
  assert.equal(parseGraphicsSettings("{broken").auto, true);
  assert.equal(
    parseGraphicsSettings(JSON.stringify(manual)).renderScaleLevel,
    2,
  );

  performanceGovernor.setQualityOverride(null);
  performanceGovernor.reset();
});
