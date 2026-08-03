import assert from "node:assert/strict";
import test from "node:test";

import {
  meadowClump,
  sampleDutchPolderVegetation,
} from "../games/make-a-mess/src/game/dutchPolderVegetation.ts";
import { WATER_LEVEL } from "../games/make-a-mess/src/game/dutchPolderWaterModel.ts";

const bedSample = (channelDistance) => ({
  elevation: -0.25,
  groundKind: "bed",
  surface: "soil",
  pathWeight: 0,
  channelId: "C1-main",
  channelDistance,
});

const bankSample = (elevation, channelDistance) => ({
  elevation,
  groundKind: "bank",
  surface: "grass",
  pathWeight: 0,
  channelId: "C1-main",
  channelDistance,
});

test("the dredged lane down the middle of a channel stays open water", () => {
  // The centre used to be judged by species, but species is now decided by
  // depth alone — what keeps the lane clear is DENSITY. A reed may be the right
  // plant for the middle of the bed and still be given nowhere to stand.
  const meanKeep = (channelDistance) => {
    let total = 0;
    const samples = 500;
    for (let index = 0; index < samples; index += 1) {
      const x = -60 + index * 0.27;
      const z = 12 + (index % 19) * 0.41;
      const style = sampleDutchPolderVegetation(bedSample(channelDistance), x, z);
      total += style?.kind === 1 ? style.keep : 0;
    }
    return total / samples;
  };

  const centre = meanKeep(0);
  const innerBank = meanKeep(3.4);
  assert.ok(centre < 0.02, `the dredged lane must stay open: ${centre.toFixed(4)}`);
  assert.ok(innerBank > centre * 8, `${centre.toFixed(4)} -> ${innerBank.toFixed(4)}`);
});

// Bands are anchored to HOW DEEP THE WATER STANDS, not to sideways distance:
// measured across four cuts of C1-main the terrain crosses the waterline about
// 3.3 m out, nowhere near bedWidth / 2. Sweeping depth is therefore the only
// sweep that tests the real axis.
test("reed bands by depth and gives up as the ground lifts", () => {
  const meanKeep = (elevation) => {
    let total = 0;
    const samples = 500;
    for (let index = 0; index < samples; index += 1) {
      const x = -60 + index * 0.27;
      const z = 12 + (index % 19) * 0.41;
      const style = sampleDutchPolderVegetation(bankSample(elevation, 3.6), x, z);
      total += style?.kind === 1 ? style.keep : 0;
    }
    return total / samples;
  };

  const depths = [-0.4, -0.15, 0.05, 0.25, 0.45, 0.7];
  const profile = depths.map((elevation) => meanKeep(elevation + WATER_LEVEL));
  const readable = depths.map((d, i) => `${d}:${profile[i].toFixed(3)}`).join(" ");

  // Density PEAKS in the shallows and falls away in both directions: reed is
  // thickest in ten to thirty centimetres of water, thinner where it is drowned
  // and thinner again where the ground has dried out. A monotone fall from the
  // deepest point would be the wrong shape, however tidy it looks.
  const peak = profile.indexOf(Math.max(...profile));
  assert.ok(peak > 0, `reed must not be densest at its deepest — ${readable}`);
  assert.ok(profile[0] > 0.05, `reed must still stand in deeper water — ${readable}`);
  for (let step = peak + 1; step < profile.length; step += 1) {
    assert.ok(
      profile[step] <= profile[step - 1] + 1e-9,
      `reed must thin once the ground lifts past the peak — ${readable}`,
    );
  }
  assert.equal(profile.at(-1), 0, `dry bank must carry no reed — ${readable}`);
});

// The single most artificial thing in the aerial view was an even reed fringe
// down every channel on both banks. A polder ditch is mown under the water
// board's schouw, so the regime belongs to a stretch of frontage: some clean,
// some reeded on one bank, a few on both. If this ever collapses to all-or-
// nothing the aerial goes back to looking stamped.
test("bank maintenance varies along a channel instead of being uniform", () => {
  const licensed = [];
  for (let along = 0; along < 130; along += 2) {
    const x = -67 + along;
    const z = 13.5;
    const near = sampleDutchPolderVegetation(bankSample(-0.2 + WATER_LEVEL, 3.4), x, z);
    licensed.push(near?.kind === 1 ? near.keep : 0);
  }
  const reeded = licensed.filter((keep) => keep > 0.05).length;
  const share = reeded / licensed.length;
  assert.ok(share > 0.15, `every frontage came out mown: ${share.toFixed(2)}`);
  assert.ok(share < 0.9, `every frontage came out reeded: ${share.toFixed(2)}`);

  // And it must actually switch along the run, not split the channel in half.
  let switches = 0;
  for (let index = 1; index < licensed.length; index += 1) {
    if ((licensed[index] > 0.05) !== (licensed[index - 1] > 0.05)) switches += 1;
  }
  assert.ok(switches >= 3, `regime barely changes along the channel: ${switches} switches`);
});
