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
