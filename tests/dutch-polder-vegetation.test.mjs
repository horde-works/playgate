import assert from "node:assert/strict";
import test from "node:test";

import { sampleDutchPolderVegetation } from "../games/make-a-mess/src/game/dutchPolderVegetation.ts";

const bedSample = (channelDistance) => ({
  elevation: -0.25,
  groundKind: "bed",
  surface: "soil",
  pathWeight: 0,
  channelId: "C1-main",
  channelDistance,
});

test("polder reeds leave the channel centre open and gather near the inner bank", () => {
  let centreReeds = 0;
  let innerBankReeds = 0;
  const samples = 400;
  for (let index = 0; index < samples; index += 1) {
    const x = -60 + index * 0.31;
    const z = 11 + (index % 17) * 0.37;
    if (sampleDutchPolderVegetation(bedSample(0), x, z)?.kind === 1) {
      centreReeds += 1;
    }
    if (sampleDutchPolderVegetation(bedSample(2.02), x, z)?.kind === 1) {
      innerBankReeds += 1;
    }
  }

  assert.ok(centreReeds < samples * 0.14, `centre reeds: ${centreReeds}`);
  assert.ok(innerBankReeds > centreReeds * 2, `${centreReeds} -> ${innerBankReeds}`);
});
