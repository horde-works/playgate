import assert from "node:assert/strict";
import test from "node:test";
import {
  DUTCH_POLDER_SPILL_MOUTHS,
  LIP_PLACE_OFFSET,
  LIP_SAMPLE_INSET,
  POLDER_MOUTH_LIPS,
  POLDER_SPILL_LIPS,
  SPILL_GRAVITY,
  SPRAY_BIRTH_TO,
  VEIL_FADE_TO,
  VEIL_FALL_TIME,
  WEIR_COEFFICIENT,
  buildSpillVeilModel,
  polderLipLineAt,
  polderSheetSpills,
  polderSpillApproach,
  spillAcrossAt,
  spillDrawdownAt,
  spillDrawdownRatio,
  spillDropShape,
  spillOutwardShape,
} from "../games/make-a-mess/src/game/dutchPolderSpillModel.ts";
import {
  POLDER_WATER_LEVEL_DATUM,
  buildWaterSheetModel,
  waterSheetHalfWidth,
} from "../games/make-a-mess/src/game/dutchPolderWaterModel.ts";
import {
  dutchPolderLandscapeMesh,
  dutchPolderVisualTopAt,
} from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderLandscapeDocument.ts";

/** The lattice the turf shell is actually meshed on. */
const pitch = dutchPolderLandscapeMesh.minimumCellSize;
const shell = new Set();
let minimumX = Number.POSITIVE_INFINITY;
let minimumZ = Number.POSITIVE_INFINITY;
for (const chunk of dutchPolderLandscapeMesh.chunks) {
  for (let offset = 0; offset < chunk.vertices.length; offset += 4) {
    const corner = chunk.vertices[offset];
    if (!corner) continue;
    shell.add(`${corner[0].toFixed(4)}:${corner[2].toFixed(4)}`);
    minimumX = Math.min(minimumX, corner[0]);
    minimumZ = Math.min(minimumZ, corner[2]);
  }
}
function overIsland(x, z) {
  const latticeX = Math.floor((x - minimumX) / pitch + 1e-9);
  const latticeZ = Math.floor((z - minimumZ) / pitch + 1e-9);
  return shell.has(
    `${(minimumX + latticeX * pitch).toFixed(4)}:${(minimumZ + latticeZ * pitch).toFixed(4)}`,
  );
}
function sheetVerticesOverAir(model) {
  let over = 0;
  for (let index = 0; index < model.positions.length / 3; index += 1) {
    if (!overIsland(model.positions[index * 3], -model.positions[index * 3 + 1])) {
      over += 1;
    }
  }
  return over;
}

test("every channel end that reaches the rim is found, and only those", () => {
  const ids = DUTCH_POLDER_SPILL_MOUTHS.map((mouth) => mouth.id).sort();
  assert.deepEqual(ids, [
    "C1-main:head",
    "C1-main:tail",
    "C2-southwest-outlet:tail",
    "C4-east-outlet:tail",
  ]);
  // The field drain is the polder's controlled outlet and stops well inland.
  assert.ok(!ids.some((id) => id.startsWith("C3")));
});

test("the sheet stops where the island does", () => {
  const loose = sheetVerticesOverAir(buildWaterSheetModel());
  const clipped = sheetVerticesOverAir(buildWaterSheetModel(polderSheetSpills()));
  // The free-end overrun hangs metres of water past the rim at every mouth.
  assert.ok(clipped < loose, `clipping gained nothing: ${clipped} vs ${loose}`);
  // What is left is the far corner of each diagonal lip. The sheet ends on a
  // straight ring, so reaching the edge on one side necessarily overshoots on
  // the other — and overshoot is invisible (the vertical-column test drops it
  // per pixel) while falling short bares the bed, which is not.
  assert.ok(clipped <= 40, `still ${clipped} sheet vertices over open air`);
});

/**
 * Width of the water on the surface the player SEES, measured ON THE LIP.
 *
 * Not two metres upstream of it, which is how this used to be asked and is the
 * whole bug: the polder's drawn shell is a voxel-smoothed version of its carve,
 * and the smoothing does not merely narrow the trough by 0.4–0.8 m, it WANDERS
 * it 0.65 m sideways along the run. A width taken at a fixed offset from the
 * authored centreline two metres upstream is therefore a different part of the
 * section, and holding the fall to it cost 1.8 m of a 6.8 m crest.
 *
 * Measured off `polderSheetSpills` and the drawn shell, so nothing here reads
 * the lip columns the model is being judged on.
 */
function visibleRiverAtLip(lip) {
  const { anchor, outward } = lip.mouth;
  const sheet = polderSheetSpills().find(
    (spill) => spill.channelId === lip.mouth.channelId
      && spill.end === lip.mouth.end,
  );
  const at = (across) => {
    const distance = sheet.distance + sheet.slope * across - LIP_SAMPLE_INSET;
    return [
      anchor[0] + outward[0] * distance - outward[1] * across,
      anchor[1] + outward[1] * distance + outward[0] * across,
    ];
  };
  let from = null;
  let to = null;
  for (let across = -7; across <= 7; across += 0.05) {
    // The same threshold the nappe uses, so this compares like with like.
    if (dutchPolderVisualTopAt(...at(across)) < POLDER_WATER_LEVEL_DATUM - 0.02) {
      if (from === null) from = across;
      to = across;
    }
  }
  return from === null ? 0 : to - from;
}

test("the fall is exactly as wide as the water the player can see", () => {
  for (const lip of POLDER_SPILL_LIPS) {
    const river = visibleRiverAtLip(lip);
    const wetted = lip.wettedTo - lip.wettedFrom;
    assert.ok(
      Math.abs(wetted - river) < 0.3,
      `${lip.mouth.id}: ${wetted.toFixed(2)} m of curtain over ${river.toFixed(2)} m of river`,
    );
  }
});

test("continuity limits how much pours, never how wide it pours", () => {
  for (const lip of POLDER_SPILL_LIPS) {
    // A crest wider than the section feeding it carries thinner, slower water.
    // It does not carry a narrower ribbon: that was the old failure, and it is
    // the one thing this scaling may not be allowed to do.
    assert.ok(
      lip.continuity > 0 && lip.continuity <= 1,
      `${lip.mouth.id}: continuity ${lip.continuity}`,
    );
    const free = lip.columns.reduce(
      (total, column) => total
        + (column.head > 0.02 ? WEIR_COEFFICIENT * column.head ** 1.5 * 0.2 : 0),
      0,
    );
    assert.ok(
      Math.abs(lip.discharge - free * lip.continuity) < 1e-9,
      `${lip.mouth.id}: ${lip.discharge} is not ${free} scaled by ${lip.continuity}`,
    );
    // Every strip with visible water over it pours. None may be vetoed.
    for (const column of lip.columns) {
      if (column.head > 0.02) {
        assert.ok(
          column.discharge > 0,
          `${lip.mouth.id}: ${column.head.toFixed(3)} m of water at across ${column.across} pours nothing`,
        );
      }
    }
  }
});

test("the fall is not a ribbon of one thickness", () => {
  const lip = POLDER_SPILL_LIPS[0];
  const wet = lip.columns.filter((column) => column.discharge > 0);
  const speeds = new Set(wet.map((column) => column.velocity.toFixed(2)));
  // Clamping the head against the authored bed datum used to hand 14 of 26
  // columns identical speed and identical thickness. A curtain of constant
  // thickness is the one thing a waterfall never is.
  assert.ok(
    speeds.size > wet.length * 0.8,
    `only ${speeds.size} distinct speeds over ${wet.length} wet columns`,
  );
  const fastest = Math.max(...wet.map((column) => column.velocity));
  const slowest = Math.min(...wet.map((column) => column.velocity));
  assert.ok(fastest > slowest * 2, `${slowest} … ${fastest} m/s across the mouth`);
});

test("the sheet's last ring and the curtain's top row are one line", () => {
  for (const lip of POLDER_SPILL_LIPS) {
    const sheet = polderSheetSpills().find(
      (spill) => spill.channelId === lip.mouth.channelId
        && spill.end === lip.mouth.end,
    );
    // The dark band of bare bed between the river and the fall was these two
    // being measured separately and disagreeing. They are now the same line
    // evaluated twice, so the only difference allowed is the placing offset.
    for (const across of [-3, -1.5, 0, 1.5, 3]) {
      const onSheet = sheet.distance + sheet.slope * across;
      const onVeil = polderLipLineAt(lip, across) + LIP_PLACE_OFFSET;
      assert.ok(
        Math.abs(onVeil - onSheet - LIP_PLACE_OFFSET) < 1e-9,
        `${lip.mouth.id}: ${onSheet} vs ${onVeil} at across ${across}`,
      );
    }
  }
});

test("the scoured sill keeps the sagging sheet clear of the ground", () => {
  for (const lip of POLDER_SPILL_LIPS) {
    const wet = lip.columns.filter((column) => column.discharge > 0);
    const deepest = wet.reduce((best, c) => (c.head > best.head ? c : best), wet[0]);
    const surface = POLDER_WATER_LEVEL_DATUM - deepest.drawdown;
    // The drawdown drops the surface by three fifths of the head it carries.
    // Without the scour that leaves 15 cm over the bed and the first lattice
    // cell rounding the wrong way prints soil through the water.
    assert.ok(
      surface - deepest.lipY > 0.2,
      `${lip.mouth.id}: only ${(surface - deepest.lipY).toFixed(3)} m under the brink`,
    );
    // And nowhere across the mouth may the sheet reach its own bed. This is
    // what the ellipse the sheet used to bend on got wrong: three metres out
    // it sank the surface 3 cm BELOW the ground and printed soil through the
    // river. `drawdown = (1 − k)·head` with k < 1 cannot do that anywhere.
    for (const column of wet) {
      assert.ok(
        POLDER_WATER_LEVEL_DATUM - column.drawdown > column.lipY,
        `${lip.mouth.id}: sheet under its bed at across ${column.across}`,
      );
    }
    // And the flow is the canal's, not the scour hole's.
    assert.ok(lip.discharge < 2, `${lip.mouth.id}: ${lip.discharge.toFixed(2)} m³/s`);
  }
});

test("one drawdown law serves the sheet and the curtain", () => {
  const lip = POLDER_SPILL_LIPS[0];
  const ratio = spillDrawdownRatio(lip.continuity);
  // Substituting the weir law into the brink depth collapses the drawdown to
  // `(1 − k)·head` exactly. If this ever stops holding, the sheet's vertex
  // profile and the curtain's top row have quietly become two different
  // surfaces again, and they will part company at the brink.
  assert.ok(ratio > 0 && ratio < 1, `ratio ${ratio}`);
  for (const column of lip.columns.filter((c) => c.discharge > 0)) {
    assert.ok(
      Math.abs(column.drawdown - ratio * column.head) < 1e-12,
      `across ${column.across}: ${column.drawdown} vs ${ratio * column.head}`,
    );
  }
  // And the share each sheet vertex is given is that law queried, so it can
  // never exceed the peak it is normalised against and must reach it once.
  const approach = polderSpillApproach(lip);
  let peak = 0;
  for (let across = -6; across <= 6; across += 0.05) {
    const share = spillDrawdownAt(lip, across) / approach.sag;
    assert.ok(share >= 0 && share <= 1 + 1e-9, `share ${share} at across ${across}`);
    peak = Math.max(peak, share);
  }
  assert.ok(peak > 0.99, `the profile never reaches its peak (${peak})`);
  // The lip's own frame, so a world point maps back to the across it was
  // measured at. Off by a sign and the whole mouth sags on the wrong side.
  const { anchor, outward } = lip.mouth;
  for (const across of [-2.5, 0, 1.5]) {
    const x = anchor[0] + outward[0] * 3 - outward[1] * across;
    const z = anchor[1] + outward[1] * 3 + outward[0] * across;
    assert.ok(Math.abs(spillAcrossAt(lip, x, z) - across) < 1e-9);
  }
});

test("the brink is critical flow, not an authored number", () => {
  const lip = POLDER_SPILL_LIPS[0];
  const wet = lip.columns.filter((column) => column.discharge > 0);
  const deepest = wet.reduce(
    (best, column) => (column.head > best.head ? column : best),
    wet[0],
  );
  // Froude at the brink of a free overfall sits just above one.
  const froude = deepest.velocity / Math.sqrt(9.81 * deepest.depth);
  assert.ok(froude > 1.4 && froude < 1.9, `Froude ${froude.toFixed(2)}`);
  // The whole mouth carries a plausible mill discharge, not a fire hose.
  assert.ok(
    lip.discharge > 0.3 && lip.discharge < 2,
    `${lip.discharge.toFixed(2)} m³/s`,
  );
});

test("the approach hands the sheet a line it can bend to", () => {
  const approach = polderSpillApproach(POLDER_SPILL_LIPS[0]);
  // The drawdown is the difference between normal and brink depth, so it can
  // never exceed the head that produced it.
  const deepest = Math.max(...POLDER_SPILL_LIPS[0].columns.map((c) => c.head));
  assert.ok(approach.sag > 0.05 && approach.sag < deepest, `sag ${approach.sag}`);
  assert.ok(Math.abs(Math.hypot(...approach.outward) - 1) < 1e-9);
  assert.ok(approach.halfWidth < waterSheetHalfWidth(4.2));
});

test("the fall is built exactly as deep as it is drawn", () => {
  const model = buildSpillVeilModel();
  for (const value of [model.positions, model.veil, model.sheet]) {
    for (const number of value) assert.ok(Number.isFinite(number));
  }
  let lowest = Number.POSITIVE_INFINITY;
  let worstEdge = 0;
  const at = (index) => [
    model.positions[index * 3],
    model.positions[index * 3 + 1],
    model.positions[index * 3 + 2],
  ];
  for (let index = 1; index < model.positions.length; index += 3) {
    lowest = Math.min(lowest, model.positions[index]);
  }
  for (let index = 0; index < model.indices.length; index += 3) {
    const [a, b, c] = [
      at(model.indices[index]),
      at(model.indices[index + 1]),
      at(model.indices[index + 2]),
    ];
    worstEdge = Math.max(
      worstEdge,
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
      Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]),
      Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]),
    );
  }
  // A stray vertex makes a triangle that smears across the whole screen.
  assert.ok(worstEdge < 3, `worst triangle edge ${worstEdge.toFixed(2)} m`);
  // There is no cliff foot to reach. This rim is fog, and the fall ends by
  // dissolving into it, so the geometry must stop just past where its own
  // alpha has already reached zero — far enough that no cut edge can show,
  // never so far that rows are built where nothing can be drawn.
  assert.ok(
    lowest < VEIL_FADE_TO && lowest > VEIL_FADE_TO - 1.5,
    `lowest row at ${lowest.toFixed(2)} against a fade that ends at ${VEIL_FADE_TO}`,
  );
  assert.ok(Math.abs(spillDropShape(VEIL_FALL_TIME) - 6.7) < 0.3);
  // Nothing may be born past the end of the water it is torn from.
  assert.ok(SPRAY_BIRTH_TO <= VEIL_FALL_TIME);
});

test("the nappe leaves the rim instead of clinging to it", () => {
  const lip = POLDER_SPILL_LIPS[0];
  const fastest = Math.max(...lip.columns.map((column) => column.velocity));
  // Water's drag time in air is seconds, not half a second: the old 0.55 s
  // capped the throw at 1.13 m for the whole fall and glued the jet to the
  // rim. Halfway down the visible drop it must already be clear of the edge.
  const halfway = spillOutwardShape(VEIL_FALL_TIME / 2) * fastest;
  assert.ok(halfway > 1, `only ${halfway.toFixed(2)} m out at half the fall`);
  // And the fall itself is nearly ballistic — within a tenth of free fall.
  const free = 0.5 * SPILL_GRAVITY * VEIL_FALL_TIME ** 2;
  const drop = spillDropShape(VEIL_FALL_TIME);
  assert.ok(drop > free * 0.9, `${drop.toFixed(2)} m against ${free.toFixed(2)} m free`);
  assert.ok(drop < free, "a falling body cannot beat free fall");
});

test("the budget stays where it was measured", () => {
  const model = buildSpillVeilModel();
  // One draw call for every mouth, and the fill is three sheets deep at the
  // top and one at the bottom. Growing this is a decision, not an accident.
  assert.ok(
    model.triangles <= 2400 * POLDER_SPILL_LIPS.length,
    `${model.triangles} triangles`,
  );
  assert.equal(model.sheet.length / 3, model.positions.length / 3);
  assert.equal(model.veil.length / 4, model.positions.length / 3);
});

test("every measured mouth feeds the sheet, painted or not", () => {
  assert.equal(POLDER_MOUTH_LIPS.length, DUTCH_POLDER_SPILL_MOUTHS.length);
  assert.equal(polderSheetSpills().length, DUTCH_POLDER_SPILL_MOUTHS.length);
});
