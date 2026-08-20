import assert from "node:assert/strict";
import test from "node:test";
import {
  PIPELINE_HITCH_IGNORE_MS,
  notifyPipelineHitch,
  performanceGovernor,
} from "../games/make-a-mess/src/game/performanceGovernor.ts";

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
  assert.equal(sample.gpuQuality, 1, "три окна роняют одну ступень, не две");
  assert.equal(sample.cpuQuality, 2);
  assert.equal(performanceGovernor.atmosphereQuality(), 2);

  performanceGovernor.reset();
  frames(140, 25, 18, 1);
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.bottleneck, "cpu");
  assert.equal(sample.cpuQuality, 1);

  performanceGovernor.reset();
  frames(140, 25, 10, 8);
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.bottleneck, "physics");
  assert.equal(sample.physicsQuality, 1);
});

test("one overloaded second does not drop a quality axis", () => {
  performanceGovernor.reset();
  performanceGovernor.recordGpu(30);
  frames(40, 30, 4);
  assert.equal(performanceGovernor.getSnapshot().gpuQuality, 2);
});

test("a missing GPU timer does not infer overload and kill atmosphere", () => {
  performanceGovernor.reset();
  frames(200, 30, 4);
  const sample = performanceGovernor.getSnapshot();
  assert.equal(sample.gpuQuality, 2);
  assert.equal(performanceGovernor.atmosphereQuality(), 2);
});

test("auto atmosphere quality stays at author maximum while GPU axes fall", () => {
  performanceGovernor.reset();
  performanceGovernor.recordGpu(40);
  frames(400, 40, 4);
  assert.equal(performanceGovernor.getSnapshot().gpuQuality, 0);
  assert.equal(performanceGovernor.atmosphereQuality(), 2);
});

test("pipeline hitch freezes quality axes while sensors keep updating", () => {
  performanceGovernor.reset();
  performanceGovernor.recordGpu(30);
  frames(140, 30, 4);
  assert.equal(performanceGovernor.getSnapshot().gpuQuality, 1);
  notifyPipelineHitch(PIPELINE_HITCH_IGNORE_MS);
  const fpsBefore = performanceGovernor.getSnapshot().fps;
  frames(200, 40, 4);
  const sample = performanceGovernor.getSnapshot();
  assert.equal(sample.gpuQuality, 1, "хитч не должен каскадить ещё одну ступень");
  assert.ok(sample.fps < fpsBefore, "HUD продолжает мерить fps во время хитча");
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
  assert.equal(performanceGovernor.atmosphereQuality(), 0);
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
  for (let index = 0; index < 2500; index += 1) {
    performanceGovernor.recordGpu(5);
    performanceGovernor.recordPhysics(0);
    performanceGovernor.recordFrame(10, 3, 100, 1_000_000);
  }
  sample = performanceGovernor.getSnapshot();
  assert.equal(sample.gpuQuality, 2, "автомат не восстановился после ручного");

  // Закон панели: выключение автомата предзаполняется выбором автомата.
  performanceGovernor.reset();
  performanceGovernor.recordGpu(30);
  frames(400, 30, 4);
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
