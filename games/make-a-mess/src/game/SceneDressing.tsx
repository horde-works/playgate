"use client";

import { useMemo, type RefObject } from "react";
import { WireSpans, type WireSpan } from "./WireSpans";
import { IvyPatches, WeedClumps, type IvyRun, type WeedPoint } from "./Undergrowth";
import { Puddles, type PuddleSpot } from "./Puddles";
import {
  vikingPlanLocalPoint,
  vikingVillageHomes,
} from "../content/scenes/vikingVillagePlan";

/**
 * Per-scene "connective tissue": wires and ropes strung between the authored
 * structures, ivy climbing their walls and weeds pooling at their footings.
 * All of it is decoration (three draw calls max), authored against the same
 * coordinates the scenes build from — so it hugs the world instead of
 * floating in it.
 */

interface DressingConfig {
  readonly wires?: readonly WireSpan[];
  readonly ivy?: readonly IvyRun[];
  readonly weeds?: readonly WeedPoint[];
  readonly puddles?: readonly PuddleSpot[];
}

function hash(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// ---------------------------------------------------------------------------
// Viking village

// Mirrors palisadeRadius() in vikingVillageDocument.ts (kept inline so the
// open-house route does not pull the whole viking document into its bundle).
const VIKING_CENTER_Z = -10;
function vikingPalisadeRadius(angle: number): number {
  return (
    57 +
    Math.sin(angle * 3.1) * 2.8 +
    Math.sin(angle * 7 + 1.4) * 0.85 +
    Math.sin(angle * 13 - 0.5) * 0.32
  );
}

const ROPE = "#66573c";

function vikingDressing(): DressingConfig {
  const northZ = VIKING_CENTER_Z + vikingPalisadeRadius(Math.PI / 2);
  const southZ = VIKING_CENTER_Z - vikingPalisadeRadius(Math.PI * 1.5);

  const wires: WireSpan[] = [];
  // Pennant ropes across both gates, plus a taut guy-rope bracing each post.
  for (const [gateZ, inward] of [
    [northZ, -1],
    [southZ, 1],
  ] as const) {
    wires.push({
      from: [-3.72, 6.3, gateZ],
      to: [3.72, 6.3, gateZ],
      sag: 0.55,
      thickness: 0.05,
      color: ROPE,
    });
    for (const side of [-1, 1] as const) {
      wires.push({
        from: [side * 3.72, 6.35, gateZ],
        to: [side * 5.9, 0.15, gateZ + inward * 3.4],
        sag: 0.06,
        thickness: 0.045,
        color: "#59492f",
      });
    }
  }
  // A festoon line from the hall's south gable across the commons to the well.
  wires.push({
    from: [0, 7.05, -2.35],
    to: [-10, 3.05, 13],
    sag: 1.15,
    thickness: 0.05,
    color: ROPE,
  });

  const ivy: IvyRun[] = [];
  // Short tangent arcs of ivy on the palisade's inner face, skipping the gates.
  for (let arc = 0; arc < 12; arc += 1) {
    const angle = (arc / 12) * Math.PI * 2 + 0.26;
    const nearNorthGate = Math.abs(Math.sin(angle) - 1) < 0.035 && Math.cos(angle) < 0.25;
    const nearSouthGate = Math.abs(Math.sin(angle) + 1) < 0.035 && Math.cos(angle) < 0.25;
    if (nearNorthGate || nearSouthGate) {
      continue;
    }
    if (hash(arc, 3) > 0.7) {
      continue; // growth is patchy, not a hedge
    }
    const spread = 0.05 + hash(arc, 5) * 0.035;
    const radius = vikingPalisadeRadius(angle) - 0.48;
    const pointAt = (a: number): readonly [number, number, number] => [
      Math.cos(a) * radius,
      0.12,
      VIKING_CENTER_Z + Math.sin(a) * radius,
    ];
    ivy.push({
      a: pointAt(angle - spread),
      b: pointAt(angle + spread),
      height: 2.4 + hash(arc, 7) * 1.2,
      normal: [-Math.cos(angle), -Math.sin(angle)],
      density: 3.6,
    });
  }
  // Back gables of a few dwellings and the hall's north gable.
  for (const homeId of ["weaver", "fisher", "family-north", "elder"]) {
    const home = vikingVillageHomes.find((entry) => entry.id === homeId);
    if (!home) {
      continue;
    }
    const a = vikingPlanLocalPoint(home.position, home.yaw, -home.width / 2 + 0.7, -home.length / 2 - 0.4);
    const b = vikingPlanLocalPoint(home.position, home.yaw, home.width / 2 - 0.7, -home.length / 2 - 0.4);
    const origin = vikingPlanLocalPoint(home.position, home.yaw, 0, 0);
    const out = vikingPlanLocalPoint(home.position, home.yaw, 0, -1);
    const normalLength = Math.hypot(out[0] - origin[0], out[1] - origin[1]) || 1;
    ivy.push({
      a: [a[0], 0.25, a[1]],
      b: [b[0], 0.25, b[1]],
      height: 2.3,
      normal: [(out[0] - origin[0]) / normalLength, (out[1] - origin[1]) / normalLength],
      density: 3.4,
    });
  }
  ivy.push({
    a: [-6, 0.25, -31.85],
    b: [6, 0.25, -31.85],
    height: 3.6,
    normal: [0, -1],
    density: 3,
  });

  const weeds: WeedPoint[] = [];
  // Weeds pooling along the palisade footing…
  for (let step = 0; step < 72; step += 1) {
    const angle = (step / 72) * Math.PI * 2;
    if (hash(step, 21) > 0.62) {
      continue;
    }
    const radius = vikingPalisadeRadius(angle) - 1.05 - hash(step, 22) * 0.5;
    weeds.push({
      x: Math.cos(angle) * radius,
      z: VIKING_CENTER_Z + Math.sin(angle) * radius,
      scale: 0.8 + hash(step, 23) * 0.7,
      dry: 0.25 + hash(step, 24) * 0.6,
    });
  }
  // …and at every dwelling's wall footings.
  for (const [homeIndex, home] of vikingVillageHomes.entries()) {
    for (let sprout = 0; sprout < 7; sprout += 1) {
      const seed = homeIndex * 13 + sprout;
      const side = sprout % 2 === 0 ? 1 : -1;
      const local = vikingPlanLocalPoint(
        home.position,
        home.yaw,
        side * (home.width / 2 + 0.55 + hash(seed, 31) * 0.4),
        (hash(seed, 32) - 0.5) * home.length * 0.85,
      );
      weeds.push({
        x: local[0],
        z: local[1],
        scale: 0.7 + hash(seed, 33) * 0.6,
        dry: 0.2 + hash(seed, 34) * 0.5,
      });
    }
  }
  // Hall footing and the base of the well.
  for (let sprout = 0; sprout < 10; sprout += 1) {
    const side = sprout % 2 === 0 ? 1 : -1;
    weeds.push({
      x: side * (7.6 + hash(sprout, 41) * 0.5),
      z: -30 + hash(sprout, 42) * 26,
      scale: 0.75 + hash(sprout, 43) * 0.6,
      dry: 0.3 + hash(sprout, 44) * 0.5,
    });
  }

  // Stake-and-rope marking around the new longhouse plot.
  const plot: readonly (readonly [number, number])[] = [
    [-33.4, -17.4],
    [-22.6, -17.4],
    [-22.6, -6.6],
    [-33.4, -6.6],
  ];
  for (let corner = 0; corner < plot.length; corner += 1) {
    const from = plot[corner];
    const to = plot[(corner + 1) % plot.length];
    wires.push({
      from: [from[0], 1.02, from[1]],
      to: [to[0], 1.02, to[1]],
      sag: 0.09,
      thickness: 0.035,
      color: "#7a6a4a",
    });
  }

  const puddles: PuddleSpot[] = [
    { x: -7.6, z: 12.2, r: 0.9 },
    { x: -4.6, z: 14.7, r: 0.7 },
    { x: 0.4, z: 41.6, r: 1.15 },
    { x: -12.8, z: -2.8, r: 0.8 },
    { x: 37.4, z: -12.3, r: 0.7 },
    { x: 23.4, z: 10.8, r: 0.85 },
    { x: 2.1, z: -6.4, r: 0.95 },
    { x: -27.2, z: -8.6, r: 0.8 },
  ].map((spot) => ({ ...spot, y: 0.058 }));

  return { wires, ivy, weeds, puddles };
}

// ---------------------------------------------------------------------------
// Open house (the town block)

function openHouseDressing(): DressingConfig {
  const wires: WireSpan[] = [];
  const POWER = "#1d1e1c";

  // Overhead lines pole-to-pole along all three streets.
  const mainPoles = [-8, 10, 28, 58, 70];
  for (let index = 0; index < mainPoles.length - 1; index += 1) {
    wires.push({
      from: [mainPoles[index], 4.62, -8.72],
      to: [mainPoles[index + 1], 4.62, -8.72],
      color: POWER,
    });
  }
  const southPoles = [-2, 22, 52, 70];
  for (let index = 0; index < southPoles.length - 1; index += 1) {
    wires.push({
      from: [southPoles[index], 4.62, -25.45],
      to: [southPoles[index + 1], 4.62, -25.45],
      color: POWER,
    });
  }
  const crossPoles = [-44, -22, 4];
  for (let index = 0; index < crossPoles.length - 1; index += 1) {
    wires.push({
      from: [45.85, 4.62, crossPoles[index]],
      to: [45.85, 4.62, crossPoles[index + 1]],
      color: POWER,
    });
  }
  // Service drops from the street poles into the buildings.
  const drops: readonly (readonly [WireSpan["from"], WireSpan["to"]])[] = [
    [[10, 4.62, -8.72], [16, 6.2, -7.85]],
    [[28, 4.62, -8.72], [30, 6.2, -7.85]],
    [[-8, 4.62, -8.72], [2.8, 5.2, -6.75]],
    [[10, 4.62, -8.72], [14, 6.2, -16.9]],
    [[45.85, 4.62, -22], [48.2, 6.2, -20.5]],
    [[-2, 4.62, -25.45], [-6, 2.45, -24.85]],
  ];
  for (const [from, to] of drops) {
    wires.push({ from, to, color: POWER, thickness: 0.03 });
  }
  // Dead cables snaking on the ground by the garages and the k1 entrance.
  const groundRuns: readonly (readonly (readonly [number, number, number])[])[] = [
    [
      [-10.8, 0.07, -19.0],
      [-7.4, 0.06, -18.55],
      [-4.2, 0.07, -19.15],
      [-1.6, 0.06, -18.7],
    ],
    [
      [21, 0.07, -0.8],
      [24.5, 0.06, -1.55],
      [27.6, 0.07, -0.85],
    ],
  ];
  for (const run of groundRuns) {
    for (let index = 0; index < run.length - 1; index += 1) {
      wires.push({
        from: run[index],
        to: run[index + 1],
        sag: 0,
        thickness: 0.05,
        color: "#161717",
        segments: 3,
      });
    }
  }

  const ivy: IvyRun[] = [
    // The garages' back wall — classic overgrowth territory.
    { a: [-10.9, 0.2, -25.08], b: [8.9, 0.2, -25.08], height: 2.05, normal: [0, -1], density: 4.6 },
    // Both faces of the concrete fence.
    { a: [-11, 0.15, -26.16], b: [9.6, 0.15, -26.16], height: 1.85, normal: [0, 1], density: 3.2 },
    { a: [-8.5, 0.15, -26.44], b: [2.5, 0.15, -26.44], height: 1.8, normal: [0, -1], density: 3.6 },
    // The abandoned shell k4: ivy takes its east gable two floors up.
    { a: [10.22, 0.3, -41.5], b: [10.22, 0.3, -35.5], height: 5.0, normal: [1, 0], density: 2.8 },
    // The old house's west wall.
    { a: [-4.28, 0.25, -6.35], b: [-4.28, 0.25, 0.35], height: 3.1, normal: [-1, 0], density: 3.4 },
  ];

  const weeds: WeedPoint[] = [];
  // Seams along the main street curbs (skipping the junction mouth).
  for (let step = 0; step < 52; step += 1) {
    const x = -11 + step * 1.62;
    if (x > 36 && x < 48) {
      continue;
    }
    if (hash(step, 51) > 0.55) {
      continue;
    }
    const north = hash(step, 52) > 0.5;
    weeds.push({
      x: x + (hash(step, 53) - 0.5) * 0.7,
      z: north ? -8.62 + hash(step, 54) * 0.25 : -15.38 - hash(step, 54) * 0.25,
      scale: 0.55 + hash(step, 55) * 0.5,
      dry: 0.35 + hash(step, 56) * 0.5,
    });
  }
  // Garage row: grass against the back and side walls.
  for (let step = 0; step < 18; step += 1) {
    weeds.push({
      x: -11 + step * 1.18 + (hash(step, 61) - 0.5) * 0.5,
      z: -25.35 - hash(step, 62) * 0.35,
      scale: 0.7 + hash(step, 63) * 0.6,
      dry: 0.3 + hash(step, 64) * 0.4,
    });
  }
  // The concrete fence line collects the tallest weeds.
  for (let step = 0; step < 16; step += 1) {
    const side = step % 2 === 0 ? 1 : -1;
    weeds.push({
      x: -11 + step * 1.32 + (hash(step, 71) - 0.5) * 0.6,
      z: -26.3 + side * (0.42 + hash(step, 72) * 0.3),
      scale: 0.85 + hash(step, 73) * 0.75,
      dry: 0.25 + hash(step, 74) * 0.55,
    });
  }
  // Khrushchevka plinths (the strip mowers never reach).
  for (const [buildingIndex, [bx0, bx1, bz]] of (
    [
      [12.6, 33.4, -0.55],
      [12.6, 33.4, -8.45],
      [12.6, 33.4, -16.55],
      [-11.4, 9.4, -34.55],
      [14.6, 35.4, -34.55],
      [48.6, 69.4, 19.45],
    ] as const
  ).entries()) {
    for (let sprout = 0; sprout < 7; sprout += 1) {
      const seed = buildingIndex * 17 + sprout;
      if (hash(seed, 81) > 0.72) {
        continue;
      }
      weeds.push({
        x: bx0 + hash(seed, 82) * (bx1 - bx0),
        z: bz + (hash(seed, 83) - 0.5) * 0.3,
        scale: 0.5 + hash(seed, 84) * 0.5,
        dry: 0.3 + hash(seed, 85) * 0.5,
      });
    }
  }
  // Playground edges.
  for (const [px, pz] of [
    [21, 3.8],
    [65, 7],
  ] as const) {
    for (let sprout = 0; sprout < 8; sprout += 1) {
      const angle = (sprout / 8) * Math.PI * 2 + px;
      weeds.push({
        x: px + Math.cos(angle) * (4.1 + hash(sprout + px, 91) * 0.8),
        z: pz + Math.sin(angle) * (3.6 + hash(sprout + px, 92) * 0.8),
        scale: 0.6 + hash(sprout + px, 93) * 0.5,
        dry: 0.25 + hash(sprout + px, 94) * 0.45,
      });
    }
  }

  const puddles: PuddleSpot[] = [
    { x: 14.2, z: -13.4, r: 1.2, y: 0.09 },
    { x: 33.5, z: -10.6, r: 0.9, y: 0.09 },
    { x: 40.8, z: -14.2, r: 1.05, y: 0.09 },
    { x: 52.2, z: -30.7, r: 1.25, y: 0.09 },
    { x: 2.5, z: -31.3, r: 0.8, y: 0.09 },
    { x: 23.2, z: 0.5, r: 0.8, y: 0.055 },
    { x: -6.2, z: -18.6, r: 1.0, y: 0.055 },
    { x: 4.5, z: 1.4, r: 0.55, y: 0.055 },
    { x: 60.2, z: 1.5, r: 0.5, y: 0.055 },
    { x: 24.2, z: -32.9, r: 0.9, y: 0.055 },
  ];

  return { wires, ivy, weeds, puddles };
}

// ---------------------------------------------------------------------------

function rainSeamDressing(): DressingConfig {
  const wires: WireSpan[] = [];
  const CABLE = "#202321";

  // Воздушка расходится с деревянного столба на киоск, дом и участок
  // частника; ещё одна нитка сшивает оба дома двора. Провисшие провода —
  // те самые линии, которыми прошиты все четыре фотографии.
  wires.push(
    { from: [-2.4, 5.85, 40.3], to: [-7.1, 3.5, 44.1], sag: 0.5, thickness: 0.035, color: CABLE },
    { from: [-2.4, 5.9, 40.3], to: [5.2, 5.75, 33.95], sag: 0.55, thickness: 0.035, color: CABLE },
    { from: [-2.4, 5.8, 40.3], to: [7.05, 3.66, 41.05], sag: 0.62, thickness: 0.03, color: CABLE },
    { from: [-2.4, 5.95, 40.3], to: [-18.4, 6.1, 43.5], sag: 0.85, thickness: 0.03, color: CABLE },
    { from: [10.75, 5.6, 23.6], to: [11.5, 5.15, 12.3], sag: 0.42, thickness: 0.032, color: CABLE },
    { from: [3.1, 5.55, 33.9], to: [-1.55, 2.2, 33.2], sag: 0.3, thickness: 0.028, color: "#514536" },
  );

  const ivy: IvyRun[] = [
    // Белая стена проулка, задний профлист и западная решётка зарастают.
    { a: [-1.32, 0.15, 24.2], b: [-1.32, 0.15, 32.6], height: 1.75, normal: [1, 0], density: 3.2 },
    { a: [-8.2, 0.15, -25.5], b: [0.6, 0.15, -25.5], height: 1.6, normal: [0, 1], density: 3.0 },
    { a: [-11.68, 0.15, 5], b: [-11.68, 0.15, 15], height: 1.7, normal: [1, 0], density: 3.1 },
    { a: [17.68, 0.15, 8], b: [17.68, 0.15, -2], height: 1.5, normal: [-1, 0], density: 2.8 },
  ];

  const weeds: WeedPoint[] = [];
  const addRun = (
    start: readonly [number, number],
    end: readonly [number, number],
    count: number,
    salt: number,
    dry = 0.35,
  ): void => {
    for (let index = 0; index < count; index += 1) {
      if (hash(index, salt) > 0.74) {
        continue;
      }
      const t = (index + hash(index, salt + 1) * 0.6) / count;
      weeds.push({
        x: start[0] + (end[0] - start[0]) * t + (hash(index, salt + 2) - 0.5) * 0.65,
        z: start[1] + (end[1] - start[1]) * t + (hash(index, salt + 3) - 0.5) * 0.65,
        scale: 0.55 + hash(index, salt + 4) * 0.8,
        dry: dry + hash(index, salt + 5) * 0.35,
      });
    }
  };
  // Бурьян живёт там, где не ходят: вдоль заборов, за сараем, на обочине
  // и по кромке стройки. По центру двора его вытоптали.
  addRun([-11.2, -23], [-11.2, 33], 40, 111, 0.34);
  addRun([17.5, -22], [17.5, 30], 34, 121, 0.38);
  addRun([-7.8, -17.7], [-0.8, -17.7], 14, 131, 0.26);
  addRun([-7.6, -24.8], [3, -24.9], 16, 141, 0.42);
  addRun([-11.2, 36.6], [-4.2, 36.6], 12, 151, 0.34);
  addRun([4.2, 36.6], [17.4, 36.6], 16, 161, 0.34);
  addRun([-12.6, 39.6], [-12.6, 47.5], 12, 171, 0.4);
  addRun([-16, -27.6], [16, -27.6], 22, 181, 0.46);
  addRun([2.9, 23], [2.9, 33.4], 10, 191, 0.22);
  addRun([-2.9, 47.5], [-2.9, 53], 8, 201, 0.3);

  const puddles: PuddleSpot[] = [
    // Улица и киоск.
    { x: -3.4, z: 45.9, r: 1.3, y: 0.075 },
    { x: 8.8, z: 46.2, r: 0.92, y: 0.075 },
    { x: -9.6, z: 44.4, r: 1.1, y: 0.055 },
    // Ворота, проулок, двор.
    { x: -0.2, z: 37.4, r: 1.15, y: 0.055 },
    { x: 0.65, z: 27.3, r: 0.85, y: 0.055 },
    { x: -2.5, z: 2.4, r: 1.0, y: 0.055 },
    { x: -3.9, z: -9.6, r: 0.9, y: 0.055 },
    { x: 12.7, z: 20.4, r: 0.72, y: 0.055 },
    // Лужа у велосипедов, как на снимке.
    { x: -3.3, z: -16.7, r: 1.05, y: 0.055 },
    // Стройка и свежая плитка, отражающая башни.
    { x: -2.2, z: -33.4, r: 1.5, y: 0.055 },
    { x: 7.6, z: -35.6, r: 1.1, y: 0.055 },
    { x: -4.2, z: -44.6, r: 1.05, y: 0.075 },
    { x: 9.8, z: -46.2, r: 0.85, y: 0.075 },
  ];

  return { wires, ivy, weeds, puddles };
}

// ---------------------------------------------------------------------------

const configBuilders: Record<string, () => DressingConfig> = {
  "viking-village": vikingDressing,
  "open-house": openHouseDressing,
  "rain-seam": rainSeamDressing,
};

export function SceneDressing({
  sceneId,
  nightRef,
}: {
  sceneId: string;
  nightRef: RefObject<number>;
}) {
  const config = useMemo(() => configBuilders[sceneId]?.(), [sceneId]);
  if (!config) {
    return null;
  }
  return (
    <>
      {config.wires?.length ? <WireSpans spans={config.wires} /> : null}
      {config.ivy?.length ? <IvyPatches runs={config.ivy} nightRef={nightRef} /> : null}
      {config.weeds?.length ? <WeedClumps points={config.weeds} nightRef={nightRef} /> : null}
      {config.puddles?.length ? <Puddles spots={config.puddles} /> : null}
    </>
  );
}
