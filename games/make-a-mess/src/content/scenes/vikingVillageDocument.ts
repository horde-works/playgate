import type {
  AuthoredSceneDocument,
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
  ScenePrefabInstanceDefinition,
  SceneTransform,
  SurfaceTreatment,
} from "./sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  SceneVector3,
  SupportMode,
} from "../../game/destructionScene.ts";
import {
  vikingPlanLocalPoint,
  vikingTrafficRoutes,
  vikingVillageHomes,
} from "./vikingVillagePlan.ts";

interface MutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

const WORLD_CENTER_Z = -10;
const WORLD_RADIUS = 96;
const groups = new Map<string, MutableGroup>();

function group(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode = "stack",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) {
    return existing;
  }
  const created = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

function primitive(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: Omit<ScenePrimitiveDefinition, "kind" | "id" | "material" | "shape" | "size" | "color" | "transform"> & {
    readonly rotation?: SceneVector3;
    readonly scale?: SceneVector3;
  } = {},
): void {
  const { rotation, scale, ...definition } = options;
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation, scale },
    ...definition,
  });
}

function place(
  target: MutableGroup,
  id: string,
  prefab: string,
  transform: SceneTransform,
  options: Pick<ScenePrefabInstanceDefinition, "palette" | "surface"> = {},
): void {
  target.objects.push({ kind: "prefab", id, prefab, transform, ...options });
}

function noise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 91.17 + z * 47.71 + salt * 19.13) * 43758.5453;
  return value - Math.floor(value);
}

function angleDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function distanceToVillagePath(x: number, z: number): number {
  const windingCenter = Math.sin((z + 8) * 0.105) * 2.6;
  return Math.abs(x - windingCenter);
}

// True when a world point falls inside (or within `margin` of) any house
// footprint. Used to keep yard clutter — barrels, woodpiles, pen posts —
// from clipping through the walls of a dwelling.
function insideAnyHome(x: number, z: number, margin = 0.6): boolean {
  for (const home of vikingVillageHomes) {
    const dx = x - home.position[0];
    const dz = z - home.position[1];
    const cosine = Math.cos(-home.yaw);
    const sine = Math.sin(-home.yaw);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    if (
      Math.abs(localX) < home.width / 2 + margin &&
      Math.abs(localZ) < home.length / 2 + margin
    ) {
      return true;
    }
  }
  return false;
}

// True near any dwelling's doorway — used to keep the threshold clear so a
// barrel, mushrooms or gravel never block the entrance.
function nearAnyDoor(x: number, z: number, radius = 2.4): boolean {
  for (const home of vikingVillageHomes) {
    const [doorX, doorZ] = vikingPlanLocalPoint(
      home.position,
      home.yaw,
      0,
      home.length / 2,
    );
    if (Math.hypot(x - doorX, z - doorZ) < radius) {
      return true;
    }
  }
  return false;
}

function palisadeRadius(angle: number): number {
  return 57
    + Math.sin(angle * 3.1) * 2.8
    + Math.sin(angle * 7 + 1.4) * 0.85
    + Math.sin(angle * 13 - 0.5) * 0.32;
}

function createTerrain(): void {
  const base = group("terrain-base", "Deep village earth", "earth");
  const surface = group("terrain-surface", "Grass, mud and travelled ground", "grass");
  const stones = group("terrain-stones", "Rocky Scandinavian ground", "stone");
  const tile = 4;

  for (let x = -96; x <= 96; x += tile) {
    for (let z = WORLD_CENTER_Z - 96; z <= WORLD_CENTER_Z + 96; z += tile) {
      const radius = Math.hypot(x, z - WORLD_CENTER_Z);
      const edge = 92 + (noise(x, z, 4) - 0.5) * 8 + Math.sin(z * 0.075) * 2.4;
      if (radius > edge) {
        continue;
      }
      const key = `${x}:${z}`;
      primitive(base, `earth:${key}`, "earth", "groundTile", [x, -0.62, z], [4.05, 1, 4.05], "#554432");

      const grassVariation = noise(x, z, 2);
      const grassPatch = noise(x, z, 8);
      // Richer, patchier grass so the ground never reads as one flat colour.
      const surfaceColor = grassVariation > 0.8
        ? "#63704b"
        : grassVariation > 0.6
          ? "#5a6c46"
          : grassVariation < 0.16
            ? "#485a3b"
            : grassVariation < 0.34
              ? "#4f6042"
              : grassPatch > 0.58
                ? "#566848"
                : "#546544";
      // Tiles sit flush, edge to edge (no steps); the uneven-earth look is a
      // cheap shader micro-relief on the ground itself, not geometry.
      primitive(surface, `cover:${key}`, "grass", "groundTile", [x, -0.04, z], [4.06, 0.18, 4.06], surfaceColor, {
        surface: grassVariation < 0.18 ? [{ kind: "damp", amount: 0.12 }] : undefined,
        landscapeSurface: "viking-ground",
      });
    }
  }

  for (let index = 0; index < 150; index += 1) {
    const angle = noise(index, 2, 3) * Math.PI * 2;
    const radius = 68 + noise(index, 8, 5) * 17;
    const x = Math.cos(angle) * radius;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    const sx = 0.45 + noise(index, 1, 7) * 2.2;
    const sy = 0.35 + noise(index, 5, 8) * 1.8;
    const sz = 0.5 + noise(index, 9, 6) * 2.0;
    if (z > 34 && distanceToVillagePath(x, z) < 7.5) {
      continue;
    }
    primitive(
      stones,
      `boulder:${index}`,
      index % 4 === 0 ? "basalt" : "stone",
      "stoneBlock",
      [x, sy / 2 - 0.01, z],
      [sx, sy, sz],
      index % 4 === 0 ? "#42474a" : index % 3 === 0 ? "#797a70" : "#62655f",
      {
        rotation: [noise(index, 3) * 0.25, noise(index, 4) * Math.PI, noise(index, 5) * 0.18],
        // Mossy Scandinavian rocks: heavy moss on their crowns and shaded
        // north sides, patterned by the shader.
        surface: [{ kind: "moss", amount: 0.55 + noise(index, 6, 9) * 0.4 }],
      },
    );
  }

  // A deliberately uneven stone apron feeds into the hall's raised side steps.
  for (let row = 0; row < 5; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      primitive(
        stones,
        `hall-apron:${row}:${column}`,
        "stone",
        "stoneBlock",
        [2.4 + row * 1.48, 0.09, -9 + column * 1.38 + Math.sin(row) * 0.2],
        [1.42, 0.24, 1.3],
        (row + column) % 2 === 0 ? "#89877c" : "#706f68",
        { rotation: [0, (noise(row, column, 2) - 0.5) * 0.12, 0] },
      );
    }
  }
}

interface FencePoint {
  readonly x: number;
  readonly z: number;
  readonly angle: number;
  readonly skipped: boolean;
}

function createPalisade(): void {
  const palisade = group("palisade", "Irregular palisade and village gates", "wood");
  const ornaments = group("gate-ornaments", "Gate shields and approach spikes", "wood", "mounted");
  const points: FencePoint[] = [];
  const count = 432;
  const gateHalfAngle = 3.55 / 57;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const radius = palisadeRadius(angle);
    const skipped =
      angleDistance(angle, Math.PI / 2) < gateHalfAngle ||
      angleDistance(angle, Math.PI * 1.5) < gateHalfAngle;
    const point = {
      x: Math.cos(angle) * radius,
      z: WORLD_CENTER_Z + Math.sin(angle) * radius,
      angle,
      skipped,
    };
    points.push(point);
    if (!skipped) {
      place(palisade, `stake:${index}`, "viking:palisade", {
        position: [point.x, 0, point.z],
        rotation: [0, -angle + Math.PI / 2 + (noise(index, 3, 71) - 0.5) * 0.05, 0],
        scale: [1, 0.92 + noise(index, 5, 72) * 0.15, 1],
      }, {
        palette: {
          timber: index % 7 === 0 ? "#49372c" : index % 5 === 0 ? "#816047" : "#674a36",
          cut: "#a4825d",
        },
        // Weathered stockade: mossy tops, damp bases; a quarter of the stakes
        // greener and mouldier so the wall reads as decades-old timber.
        surface: index % 4 === 0
          ? [{ kind: "moss", amount: 0.7 }, { kind: "mold", amount: 0.42 }]
          : [{ kind: "moss", amount: 0.4 }, { kind: "damp", amount: 0.4 }],
      });
    }
  }

  for (let index = 0; index < count; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % count];
    if (current.skipped || next.skipped) {
      continue;
    }
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.hypot(dx, dz);
    for (const [rail, y] of [1.7, 3.15].entries()) {
      primitive(
        palisade,
        `binding:${rail}:${index}`,
        "wood",
        "plank",
        [(current.x + next.x) / 2, y, (current.z + next.z) / 2],
        [length + 0.24, 0.2, 0.25],
        (index + rail) % 4 === 0 ? "#806047" : "#503b2e",
        {
          rotation: [0, -Math.atan2(dz, dx), 0],
          contactBoxes: [
            { position: [-length / 2 + 0.12, 0, 0], size: [0.42, 0.26, 0.44] },
            { position: [length / 2 - 0.12, 0, 0], size: [0.42, 0.26, 0.44] },
          ],
          sideAttachmentReach: 0.62,
          bearsLoad: false,
        },
      );
    }
  }

  const northZ = WORLD_CENTER_Z + palisadeRadius(Math.PI / 2);
  const southZ = WORLD_CENTER_Z - palisadeRadius(Math.PI * 1.5);
  const gates = [
    { id: "north", z: northZ, outward: 1 },
    { id: "south", z: southZ, outward: -1 },
  ] as const;
  for (const gate of gates) {
    for (const side of [-1, 1] as const) {
      place(palisade, `${gate.id}:post:${side}`, "viking:gate-post", { position: [side * 3.72, 0, gate.z] }, {
        surface: [{ kind: "moss", amount: 0.5 }, { kind: "damp", amount: 0.45 }],
      });
      place(palisade, `${gate.id}:leaf:${side}`, "viking:gate-leaf", {
        position: [side * 1.72, 0, gate.z - gate.outward * 0.15],
        rotation: [0, gate.outward < 0 ? Math.PI : 0, 0],
        // Mirror the prefab around the outer post so each leaf keeps its hinge
        // at the jamb. South is already yaw-rotated, hence the outward term.
        scale: [-side * gate.outward * 1.14, 1.08, 1],
      }, {
        surface: [{ kind: "moss", amount: 0.32 }, { kind: "damp", amount: 0.4 }],
      });
      // Левые (западные) щиты висят на фланговом коле частокола с его
      // НАРУЖНОЙ грани — они встречают входящего, как и правые на столбах.
      // На столбе ворот левый диск врезался в соседние колья.
      const shieldOverride: Record<string, readonly [number, number, number]> = {
        "north:-1": [-3.99, 3.35, 45.38],
        "south:-1": [-4.4, 3.35, -70.69],
      };
      place(ornaments, `${gate.id}:shield:${side}`, "viking:shield", {
        position:
          shieldOverride[`${gate.id}:${side}`] ??
          [side * 3.28, 3.35, gate.z + gate.outward * 0.66],
        rotation: [0, gate.outward < 0 ? Math.PI : 0, 0],
      }, {
        palette: { paint: side < 0 ? "#8f3028" : "#35566a", stripe: "#d2b56a" },
      });
    }
    place(palisade, `${gate.id}:lintel`, "viking:log:12", { position: [0, 6.9, gate.z], scale: [0.72, 1, 1] }, {
      palette: { timber: "#463429" },
      surface: [{ kind: "moss", amount: 0.55 }],
    });

    for (const side of [-1, 1] as const) {
      for (let spike = 0; spike < 4; spike += 1) {
        const x = side * (6.2 + spike * 1.25);
        primitive(
          ornaments,
          `${gate.id}:approach-spike:${side}:${spike}`,
          "wood",
          "cylinder",
          [x, 1.65, gate.z + gate.outward * (2.1 + spike * 0.35)],
          [0.42, 4.2, 0.42],
          spike % 2 === 0 ? "#6b4c34" : "#846146",
          {
            rotation: [gate.outward * 0.68, 0, side * 0.08],
            contactBoxes: [{ position: [0, 0, 0], size: [0.42, 4.2, 0.42] }],
          },
        );
      }
    }
  }
}

// Weathering amounts now drive the spatial biofilm shader (moss on the
// roofs and log tops, mould and damp rising from the sills), so they can be
// authored at real strength — the shader keeps the growth patchy.
const buildingTreatments: readonly SurfaceTreatment[] = [
  { kind: "moss", amount: 0.6 },
  { kind: "damp", amount: 0.4 },
];
const weatheredTreatments: readonly SurfaceTreatment[] = [
  { kind: "moss", amount: 0.78 },
  { kind: "mold", amount: 0.5 },
];

function createBuildings(): void {
  const buildings = group("buildings", "Log houses and the great hall", "wood");
  place(buildings, "great-hall", "viking:hall", { position: [0, 0, -17] }, {
    palette: {
      hallTimber: "#775138",
      timber: "#6d4b35",
      darkTimber: "#362b25",
      lightTimber: "#98704d",
      roof: "#51483a",
      mossRoof: "#3d4b36",
      door: "#382923",
    },
    surface: buildingTreatments,
  });

  vikingVillageHomes.forEach((home, index) => {
    place(buildings, home.id, home.prefabId, {
      position: [home.position[0], 0, home.position[1]],
      rotation: [0, home.yaw, 0],
    }, {
      palette: {
        timber: index % 2 === 0 ? "#6d4d38" : "#79543a",
        darkTimber: "#3b3028",
        lightTimber: "#9a704b",
        roof: index % 3 === 0 ? "#57503f" : "#4b4437",
        mossRoof: "#41503a",
        door: "#3a2b25",
      },
      surface: index % 3 === 0 ? weatheredTreatments : buildingTreatments,
    });
  });
}

function addShelter(
  target: MutableGroup,
  id: string,
  x: number,
  z: number,
  yaw: number,
): void {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const local = (lx: number, lz: number): readonly [number, number] => [
    x + lx * cosine - lz * sine,
    z + lx * sine + lz * cosine,
  ];
  const roofPitch = 0.15;
  const rearZ = -2.2;
  const frontZ = 2.2;

  // A raised dry floor makes this a weapon store, rather than four posts
  // coincidentally standing around a rack in wet grass.
  for (let board = 0; board < 9; board += 1) {
    const [floorX, floorZ] = local(-2.8 + board * 0.7, 0);
    primitive(target, `${id}:floor:${board}`, "wood", "plank", [floorX, 0.12, floorZ], [0.66, 0.2, 4.55], board % 2 === 0 ? "#725039" : "#805a3d", {
      rotation: [0, -yaw, 0],
      surface: [{ kind: "damp", amount: 0.08 }],
    });
  }

  const postSites = [[-2.9, rearZ], [2.9, rearZ], [-2.9, frontZ], [2.9, frontZ]] as const;
  for (const [index, [lx, lz]] of postSites.entries()) {
    const [px, pz] = local(lx, lz);
    const height = lz < 0 ? 3.55 : 2.95;
    primitive(target, `${id}:post:${index}`, "wood", "cylinder", [px, height / 2, pz], [0.38, height, 0.38], index % 2 === 0 ? "#4a372c" : "#59402f");
  }

  // Headers tie every post together. The two side rafters follow the roof
  // pitch, so the roof has a legible load path and survives scene startup.
  for (const [index, lz] of [rearZ, frontZ].entries()) {
    const [px, pz] = local(0, lz);
    const beamY = lz < 0 ? 3.66 : 3.06;
    primitive(target, `${id}:header:${index}`, "wood", "plank", [px, beamY, pz], [6.15, 0.26, 0.28], "#49362b", {
      rotation: [0, -yaw, 0],
      contactBoxes: [
        { position: [-2.9, 0, 0], size: [0.55, 0.28, 0.55] },
        { position: [0, 0, 0], size: [6.15, 0.28, 0.55] },
        { position: [2.9, 0, 0], size: [0.55, 0.28, 0.55] },
      ],
    });
  }
  for (let rafter = 0; rafter < 8; rafter += 1) {
    const [rafterX, rafterZ] = local(-2.8 + rafter * 0.8, 0);
    primitive(target, `${id}:roof-rafter:${rafter}`, "wood", "plank", [rafterX, 3.68, rafterZ], [0.24, 0.24, 4.82], "#403027", {
      rotation: [roofPitch, -yaw, 0],
      contactBearingOrder: true,
      contactBoxes: [
        { position: [0, -0.1, -2.08], size: [0.3, 0.14, 0.4] },
        { position: [0, -0.1, 2.08], size: [0.3, 0.14, 0.4] },
      ],
    });
  }

  // Narrow roof boards form one continuous lean-to plane. Seams remain
  // visible, but there is no oversized split slab or fake ridge anymore.
  for (let board = 0; board < 8; board += 1) {
    const [roofX, roofZ] = local(-2.8 + board * 0.8, 0);
    primitive(target, `${id}:roof-board:${board}`, "wood", "plank", [roofX, 3.86, roofZ], [0.84, 0.15, 5.35], board % 3 === 0 ? "#4b4939" : "#55503d", {
      rotation: [roofPitch, -yaw, 0],
      contactBearingOrder: true,
      contactBoxes: [
        { position: [0, -0.07, -2.08], size: [0.78, 0.12, 0.4] },
        { position: [0, -0.07, 2.08], size: [0.78, 0.12, 0.4] },
      ],
      surface: [{ kind: "damp", amount: 0.16 }, { kind: "moss", amount: board % 3 === 0 ? 0.08 : 0.03 }],
    });
  }

  // A low rear wall gives the weapons a dry, readable background while the
  // front and both sides stay open for access.
  for (let row = 0; row < 5; row += 1) {
    const [wallX, wallZ] = local(0, rearZ + 0.08);
    primitive(target, `${id}:back-wall:${row}`, "wood", "plank", [wallX, 0.2 + row * 0.34, wallZ], [5.85, 0.36, 0.18], row % 2 === 0 ? "#664731" : "#765238", {
      rotation: [0, -yaw, 0],
      carriesAttachments: true,
    });
  }

  for (const side of [-1, 1] as const) {
    const [rackX, rackZ] = local(side * 1.55, -1.28);
    place(target, `${id}:sword-rack:${side}`, "viking:sword-rack", {
      position: [rackX, 0.08, rackZ],
      rotation: [0, -yaw, 0],
      scale: [0.78, 1, 0.9],
    });
  }
}

function localPoint(
  x: number,
  z: number,
  yaw: number,
  localX: number,
  localZ: number,
): readonly [number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    x + localX * cosine - localZ * sine,
    z + localX * sine + localZ * cosine,
  ];
}

function addChoppingYard(target: MutableGroup, id: string, x: number, z: number, yaw: number): void {
  primitive(target, `${id}:block`, "wood", "cylinder", [x, 0.46, z], [1.15, 0.92, 1.15], "#624631", {
    surface: [{ kind: "damp", amount: 0.18 }],
  });
  for (let index = 0; index < 7; index += 1) {
    const [px, pz] = localPoint(x, z, yaw, -2.1 + (index % 4) * 0.9, 1.25 + Math.floor(index / 4) * 0.55);
    primitive(target, `${id}:split-log:${index}`, "wood", "cylinder", [px, 0.18, pz], [0.32, 0.82, 0.32], index % 2 === 0 ? "#8c6545" : "#5e422f", {
      rotation: [0, yaw, Math.PI / 2],
      contactBoxes: [{ position: [0, 0, 0], size: [0.32, 0.82, 0.32] }],
    });
  }
  // Колун ВОТКНУТ в колоду лезвием: тонкая голова сидит в дереве у верха
  // чурбака, рукоять продолжает её ось вверх и в сторону. Раньше топор
  // стоял обухом с головой на верхнем конце рукояти.
  const [headX, headZ] = localPoint(x, z, yaw, 0.3, -0.08);
  primitive(target, `${id}:axe-head`, "steel", "steelSheet", [headX, 1.0, headZ], [0.44, 0.36, 0.07], "#4a5050", {
    rotation: [0, yaw, -0.42],
    sideAttachmentReach: 0.35,
    bearsLoad: false,
  });
  const [handleX, handleZ] = localPoint(x, z, yaw, 0.58, -0.08);
  primitive(target, `${id}:axe-handle`, "wood", "plank", [handleX, 1.63, handleZ], [0.11, 1.35, 0.11], "#9a7048", {
    rotation: [0.08, yaw, -0.42],
    sideAttachmentReach: 0.4,
    bearsLoad: false,
  });
}

function addDryingRack(
  structures: MutableGroup,
  cloth: MutableGroup,
  id: string,
  x: number,
  z: number,
  yaw: number,
  hideColor: string,
): void {
  const postHeight = 2.7;
  const railHeight = 2.42;
  for (const side of [-1, 1] as const) {
    const [px, pz] = localPoint(x, z, yaw, side * 1.65, 0);
    primitive(cloth, `${id}:post:${side}`, "wood", "cylinder", [px, postHeight / 2, pz], [0.26, postHeight, 0.26], "#4c382c", {
      carriesAttachments: true,
    });
  }
  // A RIGID rail lashed between the two posts. The old "cable" support let it
  // sag and hang crooked; a normal reach-based side-attach holds it straight
  // and is rotation-agnostic (unlike a sit-on footprint the solver mis-reads).
  primitive(cloth, `${id}:rail`, "wood", "plank", [x, railHeight, z], [3.6, 0.17, 0.19], "#684a34", {
    rotation: [0, yaw, 0],
    bearsLoad: true,
    carriesAttachments: true,
    sideAttachmentReach: 0.7,
    contactBoxes: [{ position: [0, 0, 0], size: [3.6, 0.17, 0.19] }],
  });
  primitive(cloth, `${id}:hide`, "cloth", "panel", [x, railHeight - 0.83, z], [2.45, 1.7, 0.06], hideColor, {
    rotation: [0, yaw, 0],
    bearsLoad: false,
    sideAttachmentReach: 0.55,
    contactBoxes: [{ position: [0, 0, 0], size: [2.45, 1.7, 0.06] }],
    surface: [{ kind: "damp", amount: 0.16 }],
  });
}

function addVillageWell(target: MutableGroup, id: string, x: number, z: number): void {
  // Ring stones sized to the inner arc so neighbours butt with a mortar gap
  // instead of overlapping and z-fighting at the rim's inner edge.
  const wellStoneCount = 12;
  const wellRadius = 1.42;
  for (let index = 0; index < wellStoneCount; index += 1) {
    const angle = (index / wellStoneCount) * Math.PI * 2;
    primitive(
      target,
      `${id}:stone:${index}`,
      "stone",
      "stoneBlock",
      [x + Math.cos(angle) * wellRadius, 0.32, z + Math.sin(angle) * wellRadius],
      [0.6, 0.62, 0.52],
      index % 3 === 0 ? "#77766e" : index % 2 === 0 ? "#666860" : "#858278",
      { rotation: [0, -angle, 0], surface: [{ kind: "moss", amount: 0.14 }] },
    );
  }
  for (const side of [-1, 1] as const) {
    primitive(target, `${id}:post:${side}`, "wood", "cylinder", [x + side * 1.7, 1.75, z], [0.34, 3.5, 0.34], "#4b372b", {
      carriesAttachments: true,
    });
    primitive(target, `${id}:bearing:${side}`, "wood", "plank", [x + side * 1.48, 0.98, z], [0.3, 1.96, 0.36], "#5d4331");
  }
  primitive(target, `${id}:crossbeam`, "wood", "plank", [x, 3.12, z], [3.75, 0.28, 0.3], "#6e5038", {
    bearsLoad: false,
    attachmentSupportMode: "wall",
    sideAttachmentReach: 2,
  });
  primitive(target, `${id}:windlass`, "wood", "cylinder", [x, 0.84, z], [0.38, 3.1, 0.38], "#7c573b", {
    rotation: [0, 0, Math.PI / 2],
    contactBoxes: [{ position: [0, 0, 0], size: [0.38, 3.1, 0.38] }],
    bearsLoad: false,
  });
  // A taut rope from the windlass down to the bucket (a static line for now).
  primitive(target, `${id}:rope`, "cloth", "cylinder", [x + 0.25, 0.62, z], [0.055, 0.5, 0.055], "#6a5b3f", {
    bearsLoad: false,
    surface: [{ kind: "damp", amount: 0.2 }],
  });
  primitive(target, `${id}:bucket`, "wood", "cylinder", [x + 0.25, 0.36, z], [0.5, 0.5, 0.5], "#5a4030");
}

function addSledge(target: MutableGroup, id: string, x: number, z: number, yaw: number): void {
  for (const side of [-1, 1] as const) {
    const [runnerX, runnerZ] = localPoint(x, z, yaw, side * 0.78, 0);
    primitive(target, `${id}:runner:${side}`, "wood", "plank", [runnerX, 0.14, runnerZ], [0.18, 0.22, 3.65], "#4a352a", {
      rotation: [0, yaw, 0],
    });
  }
  for (let slat = 0; slat < 5; slat += 1) {
    const [slatX, slatZ] = localPoint(x, z, yaw, 0, -1.25 + slat * 0.62);
    primitive(target, `${id}:slat:${slat}`, "wood", "plank", [slatX, 0.34, slatZ], [1.85, 0.16, 0.48], slat % 2 === 0 ? "#876044" : "#6c4b36", {
      rotation: [0, yaw, 0],
    });
  }
  for (const side of [-1, 1] as const) {
    const [shaftX, shaftZ] = localPoint(x, z, yaw, side * 0.62, 3.0);
    primitive(target, `${id}:shaft:${side}`, "wood", "cylinder", [shaftX, 0.12, shaftZ], [0.18, 3.4, 0.18], "#5b3f2e", {
      rotation: [Math.PI / 2, yaw, 0],
      contactBoxes: [{ position: [0, 0, 0], size: [0.18, 3.4, 0.18] }],
    });
  }
}

function addFirewoodPile(target: MutableGroup, id: string, x: number, z: number, yaw: number): void {
  for (let index = 0; index < 10; index += 1) {
    const row = Math.floor(index / 5);
    const [px, pz] = localPoint(x, z, yaw, -1.7 + (index % 5) * 0.82, row * 0.48);
    primitive(target, `${id}:log:${index}`, "wood", "cylinder", [px, 0.19, pz], [0.34, 0.76, 0.34], index % 3 === 0 ? "#825c3d" : "#5d402e", {
      rotation: [0, yaw, Math.PI / 2],
      contactBoxes: [{ position: [0, 0, 0], size: [0.34, 0.76, 0.34] }],
      surface: index % 4 === 0 ? [{ kind: "damp", amount: 0.16 }] : undefined,
    });
  }
}

function addHerbGarden(
  structures: MutableGroup,
  growth: MutableGroup,
  id: string,
  x: number,
  z: number,
  yaw: number,
): void {
  for (let bed = 0; bed < 4; bed += 1) {
    const [bedX, bedZ] = localPoint(x, z, yaw, -2.1 + bed * 1.4, 0);
    primitive(growth, `${id}:soil:${bed}`, "earth", "panel", [bedX, 0.07, bedZ], [0.9, 0.05, 4.4], bed % 2 === 0 ? "#4f3d30" : "#594435", {
      rotation: [0, yaw, 0],
      bearsLoad: false,
      surface: [{ kind: "damp", amount: 0.38 }],
    });
    for (let plant = 0; plant < 7; plant += 1) {
      const [plantX, plantZ] = localPoint(x, z, yaw, -2.1 + bed * 1.4, -1.7 + plant * 0.56);
      primitive(growth, `${id}:plant:${bed}:${plant}`, "foliage", "panel", [plantX, 0.26, plantZ], [0.34, 0.5, 0.04], (bed + plant) % 3 === 0 ? "#687347" : "#435b3d", {
        rotation: [0, yaw + (plant % 2) * Math.PI / 2, 0],
        bearsLoad: false,
      });
    }
  }
  for (const side of [-1, 1] as const) {
    const [edgeX, edgeZ] = localPoint(x, z, yaw, side * 2.85, 0);
    primitive(structures, `${id}:edge:${side}`, "wood", "plank", [edgeX, 0.13, edgeZ], [0.16, 0.22, 4.8], "#514033", {
      rotation: [0, yaw, 0],
    });
  }
}

function addAnimalPen(target: MutableGroup, id: string, x: number, z: number, width: number, depth: number): void {
  const posts: Array<readonly [number, number]> = [];
  for (let ix = 0; ix <= 4; ix += 1) {
    posts.push([x - width / 2 + (ix / 4) * width, z - depth / 2]);
    posts.push([x - width / 2 + (ix / 4) * width, z + depth / 2]);
  }
  for (let iz = 1; iz < 4; iz += 1) {
    posts.push([x - width / 2, z - depth / 2 + (iz / 4) * depth]);
    posts.push([x + width / 2, z - depth / 2 + (iz / 4) * depth]);
  }
  posts.forEach(([px, pz], index) => {
    primitive(target, `${id}:post:${index}`, "wood", "cylinder", [px, 0.82, pz], [0.24, 1.64, 0.24], index % 3 === 0 ? "#806047" : "#503a2e");
  });
  const rails = [
    [x, z - depth / 2, width, 0], [x, z + depth / 2, width, 0],
    [x - width / 2, z, depth, Math.PI / 2], [x + width / 2, z, depth, Math.PI / 2],
  ] as const;
  rails.forEach(([rx, rz, span, yaw], index) => {
    for (const y of [0.55, 1.18]) {
      primitive(target, `${id}:rail:${index}:${y}`, "wood", "plank", [rx, y, rz], [span, 0.16, 0.18], "#624632", {
        rotation: [0, yaw, 0],
        sideAttachmentReach: 0.48,
        bearsLoad: false,
      });
    }
  });
}


// Fill a dwelling with lived-in furnishings, themed by the household's trade.
// Everything is floor-standing and placed in the house's local frame, so it
// follows the building's position and yaw and never pokes through a wall.
function furnishHome(
  interiors: MutableGroup,
  storage: MutableGroup,
  lights: MutableGroup,
  home: (typeof vikingVillageHomes)[number],
): void {
  // Local frame (matches the house's real orientation now that the plan point
  // helper is consistent): +Z is the door, -Z the back gable, ±X the side
  // walls. Everything is kept a hand's width off the inner wall faces so no
  // piece clips a wall, and the whole door end (high +Z) is left clear to walk
  // in past an open floor.
  const sideInner = home.width / 2 - 0.32;
  const backInner = home.length / 2 - 0.32;
  const leftWallX = -(sideInner - 0.6);
  const rightWallX = sideInner - 0.6;
  const put = (
    target: MutableGroup,
    id: string,
    prefab: string,
    localX: number,
    localZ: number,
    localYaw = 0,
  ): void => {
    const [x, z] = vikingPlanLocalPoint(home.position, home.yaw, localX, localZ);
    place(target, `furnish:${home.id}:${id}`, prefab, {
      position: [x, 0.24, z],
      rotation: [0, home.yaw + localYaw, 0],
    });
  };

  // Sleeping bench and chest along the left wall, headboard to the back gable;
  // a cupboard against the back wall; a cooking cauldron (its embers light the
  // room) just off the central axis with stools drawn up to it.
  put(interiors, "bed", "viking:bed", leftWallX, -(backInner - 1.2), Math.PI / 2);
  put(interiors, "chest", "viking:chest", leftWallX + 0.05, -(backInner - 3.3), Math.PI / 2);
  put(interiors, "cupboard", "viking:cupboard", 1.15, -(backInner - 0.28), 0);
  put(lights, "cauldron", "viking:cauldron", 0.4, -0.9);
  put(interiors, "stool:0", "viking:stool", -1.35, 0.1);
  put(interiors, "stool:1", "viking:stool", 1.45, -0.7);

  switch (home.id) {
    case "weaver":
      put(interiors, "loom", "viking:loom", rightWallX - 0.05, -1.3, Math.PI / 2);
      put(storage, "baskets", "viking:baskets", rightWallX - 0.1, 1.6);
      break;
    case "brewer":
      for (const [index, [lx, lz]] of ([[rightWallX, -1.7], [rightWallX, -0.4], [rightWallX - 1.05, -1.05]] as const).entries()) {
        const [x, z] = vikingPlanLocalPoint(home.position, home.yaw, lx, lz);
        place(storage, `furnish:${home.id}:cask:${index}`, "viking:barrel", {
          position: [x, 0.24, z],
          rotation: [0, home.yaw, 0],
          scale: [0.9, 0.9, 0.9],
        });
      }
      break;
    case "smith":
      put(interiors, "anvil", "viking:anvil", rightWallX - 0.15, -0.2);
      put(storage, "baskets", "viking:baskets", rightWallX - 0.1, 1.7);
      break;
    case "fisher":
      put(storage, "baskets", "viking:baskets", rightWallX - 0.1, -1.3);
      put(interiors, "baskets:2", "viking:baskets", rightWallX - 0.1, 1.5);
      break;
    case "elder":
      put(storage, "baskets", "viking:baskets", rightWallX - 0.1, -1.4);
      put(interiors, "elder-stool", "viking:stool", rightWallX - 0.1, 0.7);
      break;
    default:
      // Family houses get a second sleeping bench for the children.
      put(interiors, "bed:2", "viking:bed", rightWallX, -(backInner - 1.2), Math.PI / 2);
      break;
  }
}

function createVillageLife(): void {
  const structures = group("working-yards", "Weapon shelters, drying racks and work yards", "wood");
  const interiors = group("hall-interior", "Great hall feast and household objects", "wood");
  const cloth = group("cloth-and-banners", "Laundry, banners and woven cloth", "cloth", "mounted");
  const storage = group("storage", "Barrels, crates and winter stores", "wood");
  const lights = group("firelight", "Torches and hearths", "wood", "mounted");
  const growth = group("growth", "Moss, fungus and mushrooms", "foliage", "mounted");

  // The great hall is laid out as a used communal room, not a symmetrical showroom.
  // A pair of high seats for the konung and his wife, set either side of the
  // gable ridge-post so the post reads as the hall's centre pillar between them
  // rather than blocking a lone throne.
  place(interiors, "konung-throne", "viking:throne", {
    position: [-1.95, 0.22, -28.2],
    rotation: [0, Math.PI, 0],
  });
  place(interiors, "consort-throne", "viking:throne", {
    position: [1.95, 0.22, -28.2],
    rotation: [0, Math.PI, 0],
    scale: [0.9, 0.94, 0.9],
  });
  for (const [row, z] of [-22.5, -16.5, -10.5].entries()) {
    for (const side of [-1, 1] as const) {
      place(interiors, `table:${row}:${side}`, "viking:feast-table", { position: [side * 3.15, 0.22, z], rotation: [0, Math.PI / 2, 0] });
      place(interiors, `bench-inner:${row}:${side}`, "viking:bench", { position: [side * 1.7, 0.22, z], rotation: [0, Math.PI / 2, 0] });
      place(interiors, `bench-outer:${row}:${side}`, "viking:bench", { position: [side * 4.65, 0.22, z], rotation: [0, Math.PI / 2, 0] });
      if (row !== 1) {
        place(lights, `hall-table-lamp:${row}:${side}`, "viking:table-lamp", {
          position: [side * 3.15, 1.34, z],
        });
      }
    }
  }
  place(lights, "hall-hearth", "viking:hearth", { position: [0, 0.22, -16.5] });
  for (const [index, [x, z]] of [[-5.3, -27], [5.2, -26.2], [-5.5, -7.2], [5.2, -8.4]].entries()) {
    place(storage, `hall-barrel:${index}`, "viking:barrel", { position: [x, 0.22, z], rotation: [0, noise(index, z) * Math.PI, 0] });
  }
  for (const side of [-1, 1] as const) {
    // Mounted on the OUTSIDE face of the hall's south gable (z ≈ -2.05, the
    // face is at -2.26) so the shields read from the commons instead of being
    // buried between the gable logs. Spread to the wall edges.
    place(interiors, `hall-shield:${side}`, "viking:shield", { position: [side * 5.4, 3.55, -2.02] }, {
      palette: { paint: side < 0 ? "#963b2e" : "#365f67", stripe: "#c7a95e" },
    });
    primitive(cloth, `hall-banner:${side}`, "cloth", "panel", [side * 5.4, 2.25, -2.06], [1.15, 2.15, 0.06], side < 0 ? "#732d28" : "#344f61", {
      bearsLoad: false,
      sideAttachmentReach: 0.36,
      surface: [{ kind: "damp", amount: 0.08 }],
    });
  }

  // A busy communal yard makes the hall part of the settlement, not an isolated monument.
  place(lights, "commons-hearth", "viking:hearth", { position: [-11.5, 0, -1.5] });
  place(interiors, "commons-bench:north", "viking:bench", { position: [-11.5, 0, 1.4], rotation: [0, 0, 0] });
  place(interiors, "commons-bench:south", "viking:bench", { position: [-11.5, 0, -4.4], rotation: [0, Math.PI, 0] });
  place(interiors, "commons-bench:west", "viking:bench", { position: [-14.3, 0, -1.5], rotation: [0, Math.PI / 2, 0], scale: [0.72, 0.9, 0.9] });
  for (let index = 0; index < 6; index += 1) {
    place(storage, `commons-store:${index}`, "viking:barrel", {
      position: [-18 + (index % 3) * 1.35, 0, 4 + Math.floor(index / 3) * 1.28],
      rotation: [0, noise(index, 4, 94) * Math.PI, 0],
      scale: [0.8 + (index % 2) * 0.12, 0.8 + (index % 2) * 0.12, 0.8 + (index % 2) * 0.12],
    });
  }

  addShelter(structures, "north-armoury", 38, 16, -0.2);
  addShelter(structures, "smith-store", 40, -14, 0.18);

  addVillageWell(structures, "village-well", -10, 13);
  addAnimalPen(structures, "goat-pen", 13, 20, 10, 8);
  addChoppingYard(structures, "weaver-chopping", -21, 13, -0.3);
  addChoppingYard(structures, "brewer-chopping", 22, 1, 0.55);
  addChoppingYard(structures, "south-chopping", -23, -37, -0.82);
  addSledge(structures, "north-sledge", -8, 34, 0.18);
  addSledge(structures, "smith-sledge", 29, -20, -0.38);
  addFirewoodPile(storage, "weaver-wood", -35, 0, 0.18);
  addFirewoodPile(storage, "brewer-wood", 33, 0, -0.24);
  addFirewoodPile(storage, "fisher-wood", -39, -34, 0.72);
  addFirewoodPile(storage, "elder-wood", -20, -54, 0.1);
  addDryingRack(structures, cloth, "hide-rack-west", -42, -12, 0.62, "#8a6245");
  addDryingRack(structures, cloth, "hide-rack-east", 43, 1, -0.4, "#9a795b");
  addDryingRack(structures, cloth, "fish-rack", -12, 39, 0.1, "#8c8a77");
  addDryingRack(structures, cloth, "commons-drying", 15, 3, -0.18, "#866349");
  addHerbGarden(structures, growth, "kitchen-garden", 15, -17, 0.16);
  for (let bale = 0; bale < 9; bale += 1) {
    primitive(storage, `goat-hay:${bale}`, "foliage", "plank", [14.5 + (bale % 3) * 1.05, 0.34, 20 + Math.floor(bale / 3) * 0.9], [0.92, 0.62, 0.72], bale % 2 === 0 ? "#8c824f" : "#756d43", {
      rotation: [0, (noise(bale, 3, 111) - 0.5) * 0.18, 0],
    });
  }
  for (let stack = 0; stack < 18; stack += 1) {
    const layer = Math.floor(stack / 6);
    const x = 31 + (stack % 6) * 1.0;
    const z = -49 + layer * 0.2;
    primitive(storage, `firewood:${stack}`, "wood", "cylinder", [x, 0.27 + layer * 0.42, z], [0.42, 1.9, 0.42], stack % 3 === 0 ? "#4a3326" : "#6f4b31", {
      rotation: [0, 0, Math.PI / 2],
      contactBoxes: [{ position: [0, 0, 0], size: [0.42, 1.9, 0.42] }],
    });
  }

  const laundrySites = [
    ["weaver", -38, 15, 0.25],
    ["brewer", 33, 18, -0.15],
    ["south", -27, -39, 0.52],
  ] as const;
  laundrySites.forEach(([id, x, z, yaw], index) => {
    place(cloth, `laundry:${id}`, "viking:laundry", { position: [x, 0, z], rotation: [0, yaw, 0] }, {
      palette: {
        clothA: index === 0 ? "#c0ae88" : "#8d775d",
        clothB: index === 1 ? "#384f66" : "#7f3b35",
        clothC: "#68776a",
        clothD: "#c8c0a7",
      },
    });
  });

  for (let index = 0; index < 24; index += 1) {
    const site = index % 3;
    const baseX = site === 0 ? -30 : site === 1 ? 28 : 5;
    const baseZ = site === 0 ? 7 : site === 1 ? 7 : -35;
    const barrelX = baseX + (noise(index, 2) - 0.5) * 9;
    const barrelZ = baseZ + (noise(index, 6) - 0.5) * 7;
    // A barrel that lands inside a dwelling would clip its wall — skip it.
    if (insideAnyHome(barrelX, barrelZ, 0.8) || nearAnyDoor(barrelX, barrelZ, 2.8)) {
      continue;
    }
    place(storage, `yard-barrel:${index}`, "viking:barrel", {
      position: [barrelX, 0, barrelZ],
      rotation: [0, noise(index, 7) * Math.PI, 0],
      scale: [0.78 + noise(index, 3) * 0.35, 0.78 + noise(index, 3) * 0.35, 0.78 + noise(index, 3) * 0.35],
    });
  }

  // Standing lights mark the gates and commons. Domestic light is attached
  // to actual thresholds below, so it reads as part of inhabited buildings.
  // Standing torches only mark the gates now. The commons pair sat right in
  // front of the hall shields — redundant with the wall torches there.
  const standingTorchSites = [
    // Западный факел вынесен НАРУЖУ перед частоколом: он освещает подход к
    // воротам; на z=45 его корзина сидела прямо в кольях.
    ["north-gate-west", -5, 46],
    ["north-gate-east", 5, 45],
    ["south-gate-west", -4.5, -64],
    ["south-gate-east", 4.5, -64],
  ] as const;
  standingTorchSites.forEach(([id, x, z]) => {
    place(lights, `standing-torch:${id}`, "viking:torch", { position: [x, 0, z] });
  });

  // Every dwelling gets a pair of wall-mounted lights at its real door.
  // Their positions derive from the same authored house plan as the paths,
  // so moving a house does not leave its light or threshold behind.
  vikingVillageHomes.forEach((home) => furnishHome(interiors, storage, lights, home));

  // A smoke-hole louver on every roof with a lit hearth, so the plume leaves
  // through a real vent instead of straight out of the thatch. The set matches
  // the smoking sources in SmokePlumes (fisher and the east family keep cold
  // hearths). The collar rests on the roof ridge-beam, whose bearing top sits
  // at wallHeight + 2.7 (small 3.0 m walls, long 3.4 m, hall 5.2 m).
  place(structures, "smoke-louver:great-hall", "viking:smoke-louver", {
    position: [0, 5.2 + 2.65, -17],
  });
  for (const home of vikingVillageHomes) {
    if (home.id === "fisher" || home.id === "family-east") {
      continue;
    }
    const ridgeTop = (home.prefabId === "viking:house:long" ? 3.4 : 3.0) + 2.65;
    place(structures, `smoke-louver:${home.id}`, "viking:smoke-louver", {
      position: [home.position[0], ridgeTop, home.position[1]],
      // Turn the louver to the house so its little ridge cap runs along the
      // roof ridge, not across it.
      rotation: [0, home.yaw, 0],
    });
  }

  vikingVillageHomes.forEach((home) => {
    for (const side of [-1, 1] as const) {
      const [x, z] = vikingPlanLocalPoint(
        home.position,
        home.yaw,
        side * 1.48,
        home.length / 2 + 0.31,
      );
      place(lights, `door-torch:${home.id}:${side}`, "viking:wall-torch", {
        position: [x, 2.25, z],
        rotation: [0, home.yaw, 0],
      });

      const [insideX, insideZ] = vikingPlanLocalPoint(
        home.position,
        home.yaw,
        side * (home.width / 2 - 0.32),
        side * home.length * 0.18,
      );
      place(lights, `home-interior-torch:${home.id}:${side}`, "viking:wall-torch", {
        position: [insideX, home.prefabId === "viking:house:long" ? 2.45 : 2.2, insideZ],
        rotation: [0, home.yaw + (side < 0 ? Math.PI / 2 : -Math.PI / 2), 0],
      });
    }
  });

  // The great hall door is on its east wall. A pair outside announces the
  // entrance; rows on the inner wall posts make the whole room usable at
  // night instead of leaving a bright hearth in a black volume.
  const hallDoorZ = -17 + 29 * 0.28;
  for (const side of [-1, 1] as const) {
    place(lights, `hall-entry-torch:${side}`, "viking:hall-wall-torch", {
      position: [7.81, 2.8, hallDoorZ + side * 1.52],
      rotation: [0, Math.PI / 2, 0],
    });
  }
  for (const [row, z] of [-27, -21, -15, -9].entries()) {
    place(lights, `hall-interior-torch:west:${row}`, "viking:hall-wall-torch", {
      position: [-7.28, 3.25, z],
      rotation: [0, Math.PI / 2, 0],
    });
    place(lights, `hall-interior-torch:east:${row}`, "viking:hall-wall-torch", {
      position: [7.28, 3.25, z],
      rotation: [0, -Math.PI / 2, 0],
    });
  }
  for (const side of [-1, 1] as const) {
    // Spread to the wall edges (were clustered near the centre) so they flank
    // the thrones instead of crowding the ridge post.
    place(lights, `hall-interior-torch:throne:${side}`, "viking:hall-wall-torch", {
      position: [side * 5.7, 3.45, -31.28],
      rotation: [0, 0, 0],
    });
  }
  // A pair on the south gable, at the wall edges just outside the shields, to
  // light them without ever standing in front of them.
  for (const side of [-1, 1] as const) {
    place(lights, `hall-gable-torch:${side}`, "viking:hall-wall-torch", {
      position: [side * 6.75, 2.7, -1.95],
      rotation: [0, 0, 0],
    });
  }

  for (let index = 0; index < 42; index += 1) {
    const angle = noise(index, 2, 13) * Math.PI * 2;
    const radius = 18 + noise(index, 7, 12) * 42;
    const x = Math.cos(angle) * radius;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    if (nearAnyDoor(x, z, 3.0) || insideAnyHome(x, z, 1.0)) {
      continue;
    }
    place(growth, `mushroom:${index}`, "viking:mushrooms", {
      position: [x, 0, z],
      rotation: [0, noise(index, 9) * Math.PI, 0],
      scale: [0.7 + noise(index, 3) * 0.8, 0.7 + noise(index, 3) * 0.8, 0.7 + noise(index, 3) * 0.8],
    });
  }

  // Tufts, reeds and kitchen herbs give the ground a vertical layer without hiding the paths.
  for (let index = 0; index < 96; index += 1) {
    const angle = noise(index, 2, 101) * Math.PI * 2;
    const radius = 15 + Math.sqrt(noise(index, 5, 102)) * 42;
    const x = Math.cos(angle) * radius;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    if (distanceToVillagePath(x, z) < 3 || Math.hypot(x - 9, z + 9) < 5 || nearAnyDoor(x, z, 2.6) || insideAnyHome(x, z, 0.8)) {
      continue;
    }
    const height = 0.28 + noise(index, 7, 103) * 0.65;
    const color = index % 5 === 0 ? "#6f7345" : index % 3 === 0 ? "#41553b" : "#506344";
    for (const cross of [0, Math.PI / 2]) {
      primitive(growth, `tuft:${index}:${cross}`, "foliage", "panel", [x, height / 2, z], [0.42 + noise(index, cross, 104) * 0.34, height, 0.035], color, {
        rotation: [0, noise(index, 8, 105) * Math.PI + cross, 0],
        bearsLoad: false,
      });
    }
  }
}

function createWoodland(): void {
  const woodland = group("woodland", "Sparse wet woodland", "wood");
  for (let index = 0; index < 34; index += 1) {
    const angle = noise(index, 4, 22) * Math.PI * 2;
    const radius = 72 + noise(index, 8, 23) * 17;
    const x = Math.cos(angle) * radius;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    if (Math.abs(x) < 12 && z > 35) {
      continue;
    }
    // Composite trees from the shared flora core: pine forest with birches
    // scattered through it, every tree a different seed and scale.
    const birch = noise(index, 5, 25) > 0.72;
    const variant = birch
      ? `core:birch:${1 + (index % 2)}`
      : `core:pine:${1 + (index % 4)}`;
    place(woodland, `tree:${index}`, variant, {
      position: [x, 0, z],
      rotation: [0, noise(index, 6, 26) * Math.PI * 2, 0],
      scale: [
        0.85 + noise(index, 7, 27) * 0.5,
        0.85 + noise(index, 7, 27) * 0.5,
        0.85 + noise(index, 7, 27) * 0.5,
      ],
    });
  }
}

// Heaped fieldstones and gravel-strewn path edges — the stony Scandinavian
// ground reads as lived-on, not swept. Piles are mossy cairns of clustered
// boulders; pebbles line the busiest trodden routes where boots kick them clear.
function createRockwork(): void {
  const stones = group("terrain-stones", "Rocky Scandinavian ground", "stone");

  const pileSites: readonly (readonly [number, number])[] = [
    [46, 33], [-47, 22], [49, -24], [-44, -49], [38, 46], [-39, 47], [47, 6],
    [-51, -8], [20, -53], [-27, 45], [12, 48], [-16, -58], [52, 14], [-52, 34],
    [43, -44], [-33, -55], [30, 40], [-45, -2], [8, 52], [51, -40], [-20, 50],
    [36, -50], [-48, -28], [23, 44],
  ];
  pileSites.forEach(([cx, cz], pile) => {
    if (insideAnyHome(cx, cz, 1.8)) {
      return;
    }
    // Real heaps: a broad ring of boulders on the ground, then a second course
    // stacked squarely onto those base stones, so it reads as a piled cairn.
    const count = 9 + Math.floor(noise(pile, cx, 2) * 7);
    const baseCount = Math.max(4, Math.floor(count * 0.62));
    const bases: { x: number; z: number; top: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      const sx = 0.5 + noise(index, cx, 7) * 1.1;
      const sy = 0.42 + noise(index, cx, 9) * 0.78;
      const sz = 0.52 + noise(index, cz, 11) * 1.1;
      let x: number;
      let z: number;
      let y: number;
      if (index < baseCount) {
        const angle = noise(index, cx, pile) * Math.PI * 2;
        const radius = 1.55 * Math.sqrt(noise(index, cz, pile + 1));
        x = cx + Math.cos(angle) * radius;
        z = cz + Math.sin(angle) * radius;
        y = sy / 2 - 0.04;
        bases.push({ x, z, top: y + sy / 2 });
      } else {
        const base = bases[index % bases.length];
        x = base.x + (noise(index, 3) - 0.5) * 0.3;
        z = base.z + (noise(index, 4) - 0.5) * 0.3;
        y = base.top + sy / 2 - 0.14; // rests on the base stone, slightly sunk
      }
      primitive(
        stones,
        `rock-pile:${pile}:${index}`,
        index % 4 === 0 ? "basalt" : "stone",
        "stoneBlock",
        [x, y, z],
        [sx, sy, sz],
        index % 4 === 0 ? "#42474a" : index % 3 === 0 ? "#797a70" : "#63665f",
        {
          rotation: [noise(index, 1) * 0.3, noise(index, 2) * Math.PI, noise(index, 3) * 0.24],
          surface: [{ kind: "moss", amount: 0.45 + noise(index, cx, 5) * 0.4 }],
        },
      );
    }
  });

  // Дуги распахивания воротных створок держим чистыми: створки уходят
  // внутрь деревни, и любой камушек на дуге они проходили бы насквозь.
  const insideGateSwing = (x: number, z: number): boolean => {
    const northZ = WORLD_CENTER_Z + palisadeRadius(Math.PI / 2);
    const southZ = WORLD_CENTER_Z - palisadeRadius(Math.PI * 1.5);
    return (
      (Math.abs(x) < 4.6 && z > northZ - 4.4 && z < northZ + 0.8) ||
      (Math.abs(x) < 4.6 && z < southZ + 4.4 && z > southZ - 0.8)
    );
  };

  let pebble = 0;
  for (const route of vikingTrafficRoutes) {
    if (route.wear < 0.58) {
      continue; // only the busy routes shed gravel to their verges
    }
    for (let segment = 0; segment < route.points.length - 1; segment += 1) {
      const a = route.points[segment];
      const b = route.points[segment + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.floor(length / 1.6));
      const normalX = length > 0 ? -(b[1] - a[1]) / length : 0;
      const normalZ = length > 0 ? (b[0] - a[0]) / length : 0;
      for (let step = 0; step < steps; step += 1) {
        const fraction = step / steps;
        const px = a[0] + (b[0] - a[0]) * fraction;
        const pz = a[1] + (b[1] - a[1]) * fraction;
        for (const side of [-1, 1] as const) {
          pebble += 1;
          if (noise(pebble, segment, 3) > 0.5) {
            continue; // scattered, not a kerb
          }
          const offset = route.width + 0.15 + noise(pebble, 1) * 0.45;
          const ex = px + normalX * side * offset;
          const ez = pz + normalZ * side * offset;
          if (
            insideAnyHome(ex, ez, 0.3) ||
            nearAnyDoor(ex, ez, 1.8) ||
            insideGateSwing(ex, ez)
          ) {
            continue;
          }
          const size = 0.12 + noise(pebble, 7) * 0.24;
          primitive(
            stones,
            `pebble:${pebble}`,
            pebble % 5 === 0 ? "basalt" : "stone",
            "stoneBlock",
            [ex, size / 2 - 0.04, ez],
            [size, size * 0.7, size * 1.15],
            pebble % 3 === 0 ? "#6d6f68" : "#7d7e74",
            {
              rotation: [0, noise(pebble, 2) * Math.PI, 0],
              surface: noise(pebble, 4) > 0.62 ? [{ kind: "moss", amount: 0.3 }] : undefined,
            },
          );
        }
      }
    }
  }
}


/**
 * The lived-in pass: working clutter in NESTS (not sprinkled), earth berms
 * against the palisade, duckboard walkways over the churned mud, firewood
 * stacked under the eaves, awnings and wall shields on the dwellings, antlers
 * over the hall door, pennant streamers on the gate lintels and a runestone
 * by the road — the human marks that make the village a place, not a diorama.
 */
function createLivedInDressing(): void {
  const storage = group("storage", "Barrels, crates and winter stores", "wood");
  const structures = group("working-yards", "Weapon shelters, drying racks and work yards", "wood");
  const ornaments = group("gate-ornaments", "Gate shields and approach spikes", "wood", "mounted");
  const earthworks = group("earthworks", "Berms, middens and heaped soil", "earth");
  const stones = group("terrain-stones", "Rocky Scandinavian ground", "stone");

  // --- Working clutter, clustered where the work happens -------------------
  const nests: readonly (readonly [string, string, number, number, number, number?])[] = [
    // [prefab, id, x, z, yaw?, y?]
    ["viking:barrel", "hallside:cask", 8.75, -16.6, 0],
    ["core:barrel-lying", "hallside:cask-down", 9.6, -18.3, 0.4],
    ["core:crate", "hallside:crate:0", 8.65, -19.6, 0.3],
    ["core:crate", "hallside:crate:1", 8.7, -19.62, 1.75, 0.75],
    ["core:sacks", "hallside:sacks", 8.55, -21.6, 1.1],
    ["core:bucket", "hallside:bucket", 8.5, -15.4, 0],
    ["viking:barrel", "brewer:cask:0", 23.2, 3.6, 0],
    ["viking:barrel", "brewer:cask:1", 24.35, 2.6, 0],
    ["core:barrel-lying", "brewer:cask-down", 22.4, 4.45, 1.2],
    ["core:sacks", "brewer:sacks", 24.9, 4.1, 2.2],
    ["core:plank-stack", "smithy:planks", 38.2, -11.2, 0.6],
    ["core:crate", "smithy:crate", 40.0, -12.3, 1.2],
    ["core:barrel-lying", "smithy:cask-down", 37.2, -13.0, -0.5],
    ["core:bucket", "smithy:bucket", 39.2, -10.4, 0],
    ["core:crate", "gate:crate:0", 2.6, 39.8, 0.9],
    ["core:crate", "gate:crate:1", 2.64, 39.78, 2.3, 0.75],
    ["core:tarp", "gate:tarp", 4.15, 38.7, 0.5],
    ["core:plank-stack", "gate:planks", 1.8, 37.6, 1.35],
    ["core:sacks", "gate:sacks", 4.5, 40.6, 0.2],
    ["core:bucket", "well:bucket:0", -8.6, 12.1, 0],
    ["core:bucket", "well:bucket:1", -11.2, 14.35, 0],
    ["core:tarp", "well:tarp", -12.6, 11.3, 1.9],
    ["core:crate", "fishrack:crate", -13.6, 37.9, 0.7],
    ["core:sacks", "fishrack:sacks", -10.6, 37.4, 1.5],
  ] as const;
  for (const [prefabId, id, x, z, yaw, y] of nests) {
    place(storage, `nest:${id}`, prefabId, {
      position: [x, y ?? 0, z],
      rotation: [0, yaw ?? 0, 0],
    });
  }

  // --- Earth berms against the palisade + a midden behind the hall ---------
  const bermAngles = [0.45, 1.15, 2.35, 3.55, 5.35];
  for (const [index, angle] of bermAngles.entries()) {
    const radius = palisadeRadius(angle) - 1.5;
    const x = Math.cos(angle) * radius;
    const z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    const yaw = angle + Math.PI / 2;
    primitive(earthworks, `berm:${index}:base`, "earth", "stoneBlock",
      [x, 0.24, z], [3.1, 0.52, 1.7], "#5b4832", {
        rotation: [0, yaw, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [1.7, 0.52, 1.7] }],
        surface: [{ kind: "moss", amount: 0.55 }],
      });
    primitive(earthworks, `berm:${index}:top`, "earth", "stoneBlock",
      [x, 0.66, z], [2.0, 0.4, 1.1], "#61503a", {
        rotation: [0, yaw + 0.08, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [1.1, 0.4, 1.1] }],
        surface: [{ kind: "moss", amount: 0.45 }],
      });
  }
  primitive(earthworks, "midden:base", "earth", "stoneBlock",
    [4.2, 0.26, -35.2], [2.7, 0.56, 2.1], "#4f4231", {
      rotation: [0, 0.6, 0],
      contactBoxes: [{ position: [0, 0, 0], size: [1.6, 0.56, 1.6] }],
      surface: [{ kind: "damp", amount: 0.4 }],
    });
  primitive(earthworks, "midden:top", "earth", "stoneBlock",
    [4.35, 0.65, -35.1], [1.6, 0.34, 1.2], "#57493a", {
      rotation: [0, 0.95, 0],
      contactBoxes: [{ position: [0, 0, 0], size: [1.0, 0.34, 1.0] }],
      surface: [{ kind: "moss", amount: 0.3 }],
    });

  // --- Duckboard walkways over the busiest mud -----------------------------
  const addDuckboard = (
    id: string,
    from: readonly [number, number],
    to: readonly [number, number],
  ): void => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const dirX = dx / length;
    const dirZ = dz / length;
    // Local X of a piece with rotation ry points at [cos ry, -sin ry].
    const runnerYaw = Math.atan2(-dirZ, dirX);
    const plankYaw = Math.atan2(dirX, dirZ);
    for (const side of [-1, 1] as const) {
      const ox = -dirZ * side * 0.52;
      const oz = dirX * side * 0.52;
      primitive(structures, `duckboard:${id}:runner:${side}`, "wood", "plank",
        [from[0] + dx / 2 + ox, 0.055, from[1] + dz / 2 + oz],
        [length + 0.3, 0.11, 0.16], "#5d4531", {
          rotation: [0, runnerYaw, 0],
          contactBoxes: [{
            position: [0, 0, 0],
            size: [length + 0.2, 0.12, 0.3],
          }],
          surface: [{ kind: "damp", amount: 0.35 }],
        });
    }
    const steps = Math.floor(length / 0.58);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / Math.max(steps, 1);
      const x = from[0] + dx * t;
      const z = from[1] + dz * t;
      primitive(structures, `duckboard:${id}:plank:${step}`, "wood", "plank",
        [x, 0.075, z], [1.5, 0.07, 0.4], step % 3 === 0 ? "#6d5138" : "#63492f", {
          rotation: [0, plankYaw, 0],
          contactBoxes: [{ position: [0, 0, 0], size: [0.9, 0.07, 0.9] }],
          surface: step % 4 === 0 ? [{ kind: "damp", amount: 0.3 }] : undefined,
        });
    }
  };
  addDuckboard("well", [1.3, 13.8], [-3.9, 14.2]);
  const gateApproachZ = WORLD_CENTER_Z + palisadeRadius(Math.PI / 2);
  addDuckboard("gate", [0, gateApproachZ - 2.6], [0, gateApproachZ - 6.4]);

  // --- Firewood stacked under the eaves ------------------------------------
  for (const homeId of ["fisher", "family-east", "elder"]) {
    const home = vikingVillageHomes.find((entry) => entry.id === homeId);
    if (!home) {
      continue;
    }
    const [x, z] = vikingPlanLocalPoint(home.position, home.yaw, home.width / 2 + 0.82, -1);
    addFirewoodPile(storage, `eaves-wood-${homeId}`, x, z, Math.PI / 2 - home.yaw);
  }

  // --- Door awnings on two dwellings ---------------------------------------
  for (const homeId of ["weaver", "family-east"]) {
    const home = vikingVillageHomes.find((entry) => entry.id === homeId);
    if (!home) {
      continue;
    }
    const half = home.length / 2;
    const post = (side: -1 | 1): readonly [number, number] =>
      vikingPlanLocalPoint(home.position, home.yaw, side * 1.18, half + 0.95);
    for (const side of [-1, 1] as const) {
      const [px, pz] = post(side);
      primitive(structures, `awning:${homeId}:post:${side}`, "wood", "cylinder",
        [px, 1.16, pz], [0.16, 2.32, 0.16], "#4c382c");
    }
    const [bx, bz] = vikingPlanLocalPoint(home.position, home.yaw, 0, half + 0.95);
    primitive(structures, `awning:${homeId}:beam`, "wood", "plank",
      [bx, 2.38, bz], [2.72, 0.14, 0.14], "#5d4634", {
        rotation: [0, home.yaw, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [2.6, 0.14, 2.6] }],
      });
    for (const offset of [-0.95, -0.32, 0.32, 0.95]) {
      const [rx, rz] = vikingPlanLocalPoint(home.position, home.yaw, offset, half + 0.62);
      primitive(structures, `awning:${homeId}:roof:${offset}`, "wood", "plank",
        [rx, 2.5, rz], [0.58, 0.06, 1.5], "#6a4f38", {
          rotation: [0, home.yaw, 0],
          contactBoxes: [{ position: [0, 0, 0], size: [0.55, 0.06, 0.55] }],
          sideAttachmentReach: 0.6,
          surface: [{ kind: "moss", amount: 0.25 }],
        });
    }
  }

  // --- Painted shields hung on house walls ---------------------------------
  const smith = vikingVillageHomes.find((entry) => entry.id === "smith");
  if (smith) {
    const [sx, sz] = vikingPlanLocalPoint(smith.position, smith.yaw, smith.width / 2 + 0.14, 1.2);
    place(ornaments, "houseshield:smith", "viking:shield", {
      position: [sx, 2.5, sz],
      rotation: [0, smith.yaw + Math.PI / 2, 0],
    }, { palette: { paint: "#7c3b2c", stripe: "#c9a95d" } });
  }
  const familyNorth = vikingVillageHomes.find((entry) => entry.id === "family-north");
  if (familyNorth) {
    const [sx, sz] = vikingPlanLocalPoint(familyNorth.position, familyNorth.yaw, -1.7, familyNorth.length / 2 + 0.14);
    place(ornaments, "houseshield:family-north", "viking:shield", {
      position: [sx, 2.35, sz],
      rotation: [0, familyNorth.yaw, 0],
    }, { palette: { paint: "#33566b", stripe: "#d2c08a" } });
  }

  // --- Antlers over the hall door ------------------------------------------
  for (const side of [-1, 1] as const) {
    primitive(ornaments, `hall-antler:${side}`, "wood", "plank",
      [7.68, 3.92, -8.88 + side * 0.17], [0.07, 0.72, 0.07], "#d8cdb6", {
        rotation: [side * 0.62, 0, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.55,
        contactBoxes: [{ position: [0, 0, 0], size: [0.07, 0.72, 0.5] }],
      });
  }

  // --- Pennant streamers on both gate lintels ------------------------------
  const pennantColors = ["#8f3a2d", "#c9a95d", "#33566b", "#cfc4a4"];
  for (const [gateId, gateZ] of [
    ["north", WORLD_CENTER_Z + palisadeRadius(Math.PI / 2)],
    ["south", WORLD_CENTER_Z - palisadeRadius(Math.PI * 1.5)],
  ] as const) {
    for (const [index, x] of [-2.4, -0.8, 0.8, 2.4].entries()) {
      primitive(ornaments, `pennant:${gateId}:${index}`, "cloth", "panel",
        [x, 6.32, gateZ], [0.17, 0.92, 0.05], pennantColors[index % pennantColors.length], {
          rotation: [0, 0, (index % 2 === 0 ? 1 : -1) * 0.06],
          bearsLoad: false,
          sideAttachmentReach: 0.8,
          contactBoxes: [{ position: [0, 0, 0], size: [0.17, 0.92, 0.05] }],
        });
    }
  }

  // --- A runestone by the road and two carved waymarks ---------------------
  for (const [index, [bx, bz, bw]] of ([[4.9, 26.2, 1.5], [5.6, 26.9, 1.2]] as const).entries()) {
    primitive(stones, `runestone:base:${index}`, "stone", "stoneBlock",
      [bx, 0.2, bz], [bw, 0.42, bw * 0.8], "#6e6f66", {
        rotation: [0, 0.4 + index, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [bw * 0.8, 0.42, bw * 0.8] }],
        surface: [{ kind: "moss", amount: 0.5 }],
      });
  }
  primitive(stones, "runestone:slab", "stone", "stoneBlock",
    [5.2, 1.42, 26.5], [1.18, 2.3, 0.44], "#787a71", {
      rotation: [0.05, 0.52, 0.03],
      contactBoxes: [{ position: [0, 0, 0], size: [0.8, 2.3, 0.8] }],
      surface: [{ kind: "moss", amount: 0.4 }],
    });
  for (const [index, [ox, oy, tilt]] of ([[-0.13, 1.15, 0.5], [0.02, 1.55, -0.4], [0.09, 0.85, 0.25]] as const).entries()) {
    primitive(stones, `runestone:band:${index}`, "stone", "stoneBlock",
      [5.2 + ox + Math.sin(0.52) * 0.24, oy, 26.5 + Math.cos(0.52) * 0.24], [0.5, 0.13, 0.06], "#a6b8bf", {
        rotation: [0, 0.52, tilt],
        bearsLoad: false,
        sideAttachmentReach: 0.35,
        contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.13, 0.5] }],
      });
  }
  for (const [index, [mx, mz]] of ([[-3.2, 18.5], [5.8, -2.0]] as const).entries()) {
    primitive(structures, `waymark:${index}:post`, "wood", "cylinder",
      [mx, 1.3, mz], [0.3, 2.6, 0.3], "#4d3a2c", {
        surface: [{ kind: "moss", amount: 0.3 }],
      });
    for (const [bandIndex, y] of [1.9, 2.25].entries()) {
      primitive(structures, `waymark:${index}:band:${bandIndex}`, "wood", "cylinder",
        [mx, y, mz], [0.36, 0.13, 0.36], bandIndex === 0 ? "#8f3a2d" : "#c9a95d", {
          bearsLoad: false,
          sideAttachmentReach: 0.2,
          contactBoxes: [{ position: [0, 0, 0], size: [0.36, 0.13, 0.36] }],
        });
    }
  }
}


/**
 * The village's STORY: it is growing. A new longhouse is going up on the
 * south-west plot — three courses of the log frame laid, corner posts up,
 * timber stacked beside a hewing trestle in fresh chips, stake-and-rope
 * marking the plot. And the gate watch has just changed: spears lean by the
 * palisade, a shield set down beside them.
 */
function createStorySites(): void {
  const structures = group("working-yards", "Weapon shelters, drying racks and work yards", "wood");
  const storage = group("storage", "Barrels, crates and winter stores", "wood");
  const ornaments = group("gate-ornaments", "Gate shields and approach spikes", "wood", "mounted");
  const siteX = -28;
  const siteZ = -12;

  // Three alternating courses of an 8x8 frame.
  for (let course = 0; course < 3; course += 1) {
    const y = 0.32 + course * 0.5;
    if (course % 2 === 0) {
      for (const side of [-1, 1] as const) {
        place(structures, `newhouse:course:${course}:${side}`, "viking:log:8", {
          position: [siteX, y, siteZ + side * 4],
        });
      }
    } else {
      for (const side of [-1, 1] as const) {
        place(structures, `newhouse:course:${course}:${side}`, "viking:log:8", {
          position: [siteX + side * 4, y, siteZ],
          rotation: [0, Math.PI / 2, 0],
        });
      }
    }
  }
  for (const [index, [cx, cz]] of ([[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]] as const).entries()) {
    place(structures, `newhouse:post:${index}`, "viking:post:3", {
      position: [siteX + cx, 0, siteZ + cz],
    });
  }
  // Fresh wall logs are staged as builders actually leave them: parallel and
  // clear of one another, with their eastern ends resting on the west wall's
  // top course and their western ends on the ground outside the footprint.
  for (const [index, [ox, oy, oz, yaw, slope]] of ([
    [-0.08, 0.84, -2.7, -0.018, 0.15],
    [0.04, 0.87, -0.9, 0.012, 0.155],
    [-0.04, 0.9, 0.9, -0.01, 0.16],
    [0.08, 0.93, 2.7, 0.016, 0.165],
  ] as const).entries()) {
    place(storage, `newhouse:timber:${index}`, "viking:log:8", {
      position: [siteX - 8 + ox, oy, siteZ + oz],
      rotation: [0, yaw, slope],
    });
  }
  // Hewing trestle: a work log up on two chocks, chips everywhere.
  for (const side of [-1, 1] as const) {
    primitive(structures, `newhouse:chock:${side}`, "wood", "cylinder",
      [siteX + 1.2 + side * 1.4, 0.26, siteZ + 6.2], [0.52, 0.52, 0.52], "#4a3526");
  }
  place(structures, "newhouse:worklog", "viking:log:4", {
    position: [siteX + 1.2, 0.78, siteZ + 6.2],
  });
  for (let chip = 0; chip < 9; chip += 1) {
    primitive(structures, `newhouse:chip:${chip}`, "wood", "plank",
      [siteX + 0.4 + noise(chip, 1, 61) * 2.2, 0.045, siteZ + 5.3 + noise(chip, 2, 62) * 1.9],
      [0.3 + noise(chip, 3, 63) * 0.22, 0.05, 0.1], chip % 2 === 0 ? "#b08d5e" : "#9a7a4e", {
        rotation: [0, noise(chip, 4, 64) * Math.PI, 0],
      });
  }
  // Plot marking stakes (the rope between them is strung by SceneDressing).
  for (const [index, [mx, mz]] of ([[-5.4, -5.4], [5.4, -5.4], [5.4, 5.4], [-5.4, 5.4]] as const).entries()) {
    primitive(structures, `newhouse:stake:${index}`, "wood", "cylinder",
      [siteX + mx, 0.55, siteZ + mz], [0.14, 1.1, 0.14], "#6b4f35");
  }

  // The gate watch just changed: spears lean on the palisade, a shield rests.
  const gateZ = WORLD_CENTER_Z + palisadeRadius(Math.PI / 2);
  for (const [index, lean] of ([[0.3], [0.24]] as const).entries()) {
    const sx = -5.1 - index * 0.55;
    primitive(ornaments, `watch:spear:${index}:shaft`, "wood", "cylinder",
      [sx, 1.35, gateZ - 1.05], [0.09, 2.7, 0.09], "#6b503a", {
        rotation: [lean[0], 0, 0.05 * (index === 0 ? 1 : -1)],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.85,
        contactBoxes: [{ position: [0, 0, 0], size: [0.4, 2.7, 1.1] }],
      });
    primitive(ornaments, `watch:spear:${index}:head`, "steel", "steelSheet",
      [sx, 2.72, gateZ - 1.48], [0.09, 0.34, 0.05], "#8f979a", {
        bearsLoad: false,
        sideAttachmentReach: 0.5,
        contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.5, 0.6] }],
      });
  }
  place(ornaments, "watch:shield", "viking:shield", {
    position: [-6.6, 0.8, gateZ - 0.95],
    rotation: [0.42, 0.2, 0],
  }, { palette: { paint: "#5e6a48", stripe: "#c9b06a" } });
}

/**
 * Фьордовый причал за южными воротами. Земля здесь выступает мысом до
 * радиуса ~92 и обрывается в туман; мостки продолжают мыс: береговые
 * прогоны лежат на земле, последняя секция уходит за кромку на боковых
 * креплениях, сваи под ней висят прямо в тумане — вода не видна, но причал
 * знает, где она. Перевёрнутая лодка и весло на берегу говорят, что отсюда
 * ходят; фонарь на конце мостков — единственный огонь над «водой» ночью.
 */
function createFjordJetty(): void {
  const jetty = group("fjord-jetty", "Jetty over the fog", "wood", "stack");
  const centerX = -1.2;
  const runnerXs = [centerX - 0.66, centerX + 0.66] as const;
  const deckStartZ = -91.3;
  const deckEndZ = -107.54;

  // Прогоны: три береговые секции лежат на земле, четвёртая продолжает их
  // за кромку — она держится боковым креплением за соседку, как перила
  // частокола, а не опорой (под ней уже нечего подпирать).
  const runnerCentersZ = [-93.0, -97.3, -101.6, -105.9] as const;
  for (const [sideIndex, rx] of runnerXs.entries()) {
    for (const [segment, cz] of runnerCentersZ.entries()) {
      // Каждая секция найтована к соседке ("cable" обходит правило высоты
      // настенного крепления — прогоны одной высоты). Береговые секции и
      // так лежат на земле, но шумовая кромка тайлов дырявая, поэтому цепь
      // до берега — единственная опора, которой можно верить.
      primitive(jetty, `runner:${sideIndex}:${segment}`, "wood", "plank",
        [rx, 0.105, cz], [0.18, 0.13, 4.34],
        segment % 2 === 0 ? "#5d4531" : "#54402d", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.2, 0.14, 4.3] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.9,
          surface: [{ kind: "damp", amount: 0.45 }],
        });
    }
  }

  // Настил: доски поперёк, с лёгким разнобоем — мостки, а не палуба.
  const plankCount = Math.round((deckStartZ - deckEndZ) / 0.56);
  for (let plank = 0; plank <= plankCount; plank += 1) {
    const z = deckStartZ - plank * 0.56;
    primitive(jetty, `deck:${plank}`, "wood", "plank",
      [centerX, 0.205, z], [1.9, 0.07, 0.44],
      plank % 3 === 0 ? "#6d5138" : plank % 3 === 1 ? "#63492f" : "#725039", {
        rotation: [0, (noise(plank, 3, 21) - 0.5) * 0.05, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [1.6, 0.07, 0.44] }],
        surface: plank % 4 === 0 ? [{ kind: "damp", amount: 0.4 }] : undefined,
      });
  }

  // Сваи: несут не нагрузку, а рассказ — уходят из-под настила в туман.
  for (const [pairIndex, pz] of [-96.2, -100.4, -104.6, -107.2].entries()) {
    for (const side of [-1, 1] as const) {
      primitive(jetty, `pile:${pairIndex}:${side}`, "wood", "cylinder",
        [centerX + side * 0.98, -1.45, pz], [0.28, 3.4, 0.28],
        pairIndex % 2 === 0 ? "#4a372c" : "#553f2e", {
          rotation: [side * 0.03, 0, -side * 0.04],
          contactBoxes: [{ position: [0, 0, 0], size: [0.28, 3.4, 0.28] }],
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.85,
          surface: [{ kind: "damp", amount: 0.6 }, { kind: "moss", amount: 0.3 }],
        });
    }
  }

  // Конец мостков: кнехт для швартова и фонарный столб над туманом.
  primitive(jetty, "bollard", "wood", "cylinder",
    [centerX + 0.62, 0.72, -107.1], [0.3, 0.95, 0.3], "#4a372c", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.3, 0.95, 0.3] }],
      surface: [{ kind: "damp", amount: 0.5 }],
    });
  primitive(jetty, "lamp-post", "wood", "cylinder",
    [centerX - 0.68, 1.09, -107.15], [0.22, 1.7, 0.22], "#3f3027", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.22, 1.7, 0.22] }],
      carriesAttachments: true,
      surface: [{ kind: "damp", amount: 0.5 }],
    });
  primitive(jetty, "lamp-arm", "wood", "plank",
    [centerX - 0.45, 1.98, -107.15], [0.56, 0.08, 0.08], "#3f3027", {
      bearsLoad: false,
      sideAttachmentReach: 0.5,
      contactBoxes: [{ position: [0, 0, 0], size: [0.56, 0.08, 0.08] }],
    });
  primitive(jetty, "lamp-cap", "steel", "steelSheet",
    [centerX - 0.2, 1.92, -107.15], [0.24, 0.05, 0.24], "#353a3b", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
    });
  primitive(jetty, "lamp-flame", "glass", "glassPane",
    [centerX - 0.2, 1.78, -107.15], [0.15, 0.2, 0.15], "#f2dfa7", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
      light: { color: "#ffb46a", distance: 9, intensity: 3 },
    });

  // Швартовый канат провис с кнехта к ближней свае.
  primitive(jetty, "mooring-rope", "wood", "cylinder",
    [centerX + 0.78, 0.15, -106.55], [0.05, 1.35, 0.05], "#7a6648", {
      rotation: [0.6, 0, 0.25],
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.3,
      contactBoxes: [{ position: [0, 0, 0], size: [0.05, 1.35, 0.05] }],
    });

  // Берег: перевёрнутая лодка на просушке и весло рядом. Корпус собран
  // цепочкой опор: гунвалы на земле, борта на гунвалах, киль сверху.
  const boatX = 2.6;
  const boatZ = -89.8;
  for (const side of [-1, 1] as const) {
    primitive(jetty, `boat:gunwale:${side}`, "wood", "plank",
      [boatX, 0.13, boatZ + side * 0.62], [3.3, 0.16, 0.24],
      side < 0 ? "#5a4230" : "#63482f", {
        contactBoxes: [{ position: [0, 0, 0], size: [3.3, 0.16, 0.24] }],
        surface: [{ kind: "damp", amount: 0.4 }],
      });
    primitive(jetty, `boat:strake:${side}`, "wood", "panel",
      [boatX, 0.4, boatZ + side * 0.44], [3.1, 0.42, 0.08],
      side < 0 ? "#6b4c34" : "#725038", {
        rotation: [-side * 0.6, 0, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [2.8, 0.5, 0.3] }],
        surface: [{ kind: "damp", amount: 0.3 }],
      });
  }
  primitive(jetty, "boat:keel", "wood", "plank",
    [boatX, 0.64, boatZ], [3.4, 0.13, 0.16], "#3f3027", {
      contactBoxes: [{ position: [0, 0, 0], size: [3.0, 0.14, 0.6] }],
      surface: [{ kind: "moss", amount: 0.25 }],
    });
  for (const end of [-1, 1] as const) {
    primitive(jetty, `boat:stem:${end}`, "wood", "plank",
      [boatX + end * 1.78, 0.28, boatZ], [0.45, 0.35, 0.85], "#59402f", {
        rotation: [0, end * 0.55, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [0.45, 0.35, 0.5] }],
      });
  }
  primitive(jetty, "oar:shaft", "wood", "plank",
    [4.9, 0.035, -91.6], [1.9, 0.05, 0.14], "#6d5138", {
      rotation: [0, 1.0, 0],
    });
  primitive(jetty, "oar:blade", "wood", "plank",
    [5.7, 0.04, -92.9], [0.42, 0.045, 0.22], "#63492f", {
      rotation: [0, 1.0, 0],
    });

  // Бочка у корня мостков — причал живёт, сюда носят и отсюда уносят.
  primitive(jetty, "barrel", "wood", "cylinder",
    [0.6, 0.4, -91.6], [0.55, 0.8, 0.55], "#5b4331", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.8, 0.5] }],
      surface: [{ kind: "damp", amount: 0.35 }],
    });

  // Перила западной стороны настила: стойки стоят на досках, поручень
  // навешен — на мостках над пропастью держатся за что-то.
  const railPostsZ = [-94.2, -96.9, -99.6, -102.3, -105.0] as const;
  for (const [postIndex, pz] of railPostsZ.entries()) {
    primitive(jetty, `rail-post:${postIndex}`, "wood", "cylinder",
      [centerX - 0.82, 0.73, pz], [0.11, 0.98, 0.11], "#4a372c", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.13, 0.98, 0.13] }],
        carriesAttachments: true,
        surface: [{ kind: "damp", amount: 0.5 }],
      });
  }
  for (let railSegment = 0; railSegment < railPostsZ.length - 1; railSegment += 1) {
    const midZ = (railPostsZ[railSegment] + railPostsZ[railSegment + 1]) / 2;
    primitive(jetty, `rail:${railSegment}`, "wood", "plank",
      [centerX - 0.82, 1.24, midZ], [0.09, 0.07, 2.85],
      railSegment % 2 === 0 ? "#5d4531" : "#54402d", {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.6,
        contactBoxes: [{ position: [0, 0, 0], size: [0.09, 0.07, 2.85] }],
        surface: [{ kind: "damp", amount: 0.4 }],
      });
  }

  // Береговые кнехты у корня причала и бухта каната на настиле.
  for (const side of [-1, 1] as const) {
    primitive(jetty, `shore-bollard:${side}`, "wood", "cylinder",
      [centerX + side * 1.15, 0.44, -91.9], [0.26, 0.85, 0.26], "#4a372c", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.26, 0.85, 0.26] }],
        surface: [{ kind: "damp", amount: 0.45 }, { kind: "moss", amount: 0.2 }],
      });
  }
  primitive(jetty, "rope-coil", "wood", "cylinder",
    [centerX + 0.45, 0.31, -103.9], [0.52, 0.13, 0.52], "#7a6648", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.13, 0.5] }],
      bearsLoad: false,
    });

  // Рыбацкие ящики на берегу: один под крышкой, второй брошен пустым.
  primitive(jetty, "crate:a", "wood", "plank",
    [1.9, 0.21, -92.7], [0.55, 0.38, 0.42], "#5f4834", {
      surface: [{ kind: "damp", amount: 0.3 }],
    });
  primitive(jetty, "crate:a:lid", "wood", "plank",
    [1.9, 0.43, -92.7], [0.58, 0.06, 0.45], "#6a5138", {
      rotation: [0, 0.12, 0],
    });
  primitive(jetty, "crate:b", "wood", "plank",
    [2.6, 0.18, -92.3], [0.46, 0.32, 0.38], "#564130", {
      rotation: [0, 0.5, 0],
      surface: [{ kind: "damp", amount: 0.35 }],
    });
}

/**
 * Небесный драккар у фьордового причала. Единственный способ попасть на
 * остров — корабль, который в каждом мире принимает форму этого мира: здесь
 * это драккар, подвешенный под полосатым шерстяным баллоном на четырёх
 * стропах. Внутри баллона — «подъёмное сердце» (материал earth: для
 * решателя это фундамент, парящая точка опоры — баллон и есть то, что
 * держит корабль). Вся цепочка нагрузок висит на сердце: стропы → планшири
 * → пояса обшивки клинкером (каждый найтован к соседнему, cable) → киль;
 * палуба лежит на стрингерах и шпангоутах. Порви полотнища, разбей сердце —
 * и весь корабль уйдёт в туман. Сходни лежат одним концом на настиле
 * причала, другим на палубе: по ним можно взойти на борт, а рушатся они
 * вместе с любой из своих опор.
 *
 * Посадка выверена скриптом (scratchpad place/verify-skyship): центр
 * (8.25, -102.5), курс +6°, нос — к пирсу. Под низкой серединой киля
 * (локально a∈[-4.9, 4.6]) — только туман; оба конца корпуса задраны
 * (как у настоящего драккара), поэтому корма может нависать над отмелью
 * у x≥13, а нос — над голым берегом у корня причала. Весь корабль внутри
 * стены мира r=96 (корпус ≤94.9, баллон ≤95.6) — до него честно достают
 * и молот, и ракеты.
 */
function createSkyLongship(): void {
  const ship = group("sky-longship", "Sky longship at the fog jetty", "wood", "stack");
  const alpha = (6 * Math.PI) / 180;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cx = 8.25;
  const cz = -102.5;
  // Локальные оси: a — вдоль киля (нос в -a, к пирсу), b — на правый борт
  // (север). Мир: x = cx + a·ca - b·sa, z = cz + a·sa + b·ca.
  const P = (a: number, b: number, y: number): SceneVector3 =>
    [cx + a * ca - b * sa, y, cz + a * sa + b * ca];
  // Контактные коробки авторятся в ЛОКАЛЬНЫХ координатах куска — компилятор
  // сам поворачивает их в мировой AABB (transformedContactSize).
  // Ориентация цилиндра осью вдоль вектора d. Эйлеры интринсические XYZ
  // (как в three.js: R = Rx·Ry·Rz), поэтому образ локальной оси y —
  // второй столбец матрицы; при ry = 0 система решается в два atan2.
  const rodRotation = (dx: number, dy: number, dz: number): SceneVector3 =>
    [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
  const alongAxis = rodRotation(ca, 0, sa);
  const acrossAxis = rodRotation(-sa, 0, ca);

  // === Подъёмное сердце: парящий фундамент внутри баллона. Контактная
  // коробка — весь объём баллона, чтобы полотнища, конусы и стропы честно
  // находили опору; объём занижен — «газ», а не земля, и при разрушении
  // не заваливает мир обломками.
  primitive(ship, "heart", "earth", "cylinder",
    P(0, 0, 8.1), [3.2, 9.0, 3.2], "#e6d3a0", {
      rotation: alongAxis,
      volume: 6,
      contactBoxes: [{ position: [0, 0, 0], size: [4.75, 14.3, 4.75] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      light: { color: "#ffc98a", distance: 14, intensity: 2.4 },
    });

  // === Оболочка: продольные полотнища крашеной шерсти, марена и овсяная
  // некрашеная — 10 клиньев по кругу, между ними щели, сквозь которые ночью
  // сочится свет сердца. Профиль сигары — по станциям.
  const envelopeRadius = (a: number): number =>
    2.35 * Math.pow(Math.max(0.04, 1 - Math.pow(Math.abs(a) / 7.15, 2.4)), 0.62);
  // Клинья идут ровными продольными полосами без сдвига между станциями —
  // иначе оболочка читается черепицей, а не шитым баллоном.
  for (let station = 0; station < 10; station += 1) {
    const a = -6.3 + station * 1.4;
    const radius = envelopeRadius(a);
    const width = ((2 * Math.PI * radius) / 10) * 0.96;
    // Наклон панели по крутизне профиля: у концов сигары клин прижимается
    // к оси — без этого плоские хорды торчат из силуэта сломанными досками.
    const taper = Math.atan2(envelopeRadius(a + 0.69) - envelopeRadius(a - 0.69), 1.38);
    // Наклонная панель короче в проекции на ось: у крутых концов сигары
    // кольца расходились бы щелями — удлиняем хорду на 1/cos(наклона).
    const goreLength = Math.min(2.1, 1.38 / Math.cos(taper)) + 0.08;
    for (let gore = 0; gore < 10; gore += 1) {
      const phi = (gore / 10) * Math.PI * 2;
      const isBelly = Math.cos(phi) < -0.45;
      primitive(ship, `gore:${station}:${gore}`, "cloth", "panel",
        P(a, radius * Math.sin(phi), 8.1 + radius * Math.cos(phi)),
        [goreLength, 0.08, width],
        gore % 2 === 0 ? "#8e4a37" : "#c3ac8a", {
          rotation: [phi, -alpha, taper],
          surface: isBelly ? [{ kind: "damp", amount: 0.3 }] : undefined,
        });
    }
  }
  // Бронзовые оковки: носовой и кормовой конусы с тараном-шпилем впереди
  // и три деревянных пера-стабилизатора у хвоста.
  for (const end of [-1, 1] as const) {
    const tag = end < 0 ? "bow" : "stern";
    primitive(ship, `cone:${tag}:0`, "steel", "cylinder",
      P(end * 6.9, 0, 8.1), [1.72, 0.85, 1.72], "#77653c", {
        rotation: alongAxis,
        contactBoxes: [{ position: [0, 0, 0], size: [1.9, 1.3, 1.9] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
      });
    primitive(ship, `cone:${tag}:1`, "steel", "cylinder",
      P(end * 7.45, 0, 8.1), [1.0, 0.65, 1.0], "#6b5a36", {
        rotation: alongAxis,
        contactBoxes: [{ position: [0, 0, 0], size: [1.15, 1.5, 1.15] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.3,
      });
  }
  primitive(ship, "ram-spike", "steel", "cylinder",
    P(-7.9, 0, 8.1), [0.28, 0.6, 0.28], "#8a7647", {
      rotation: alongAxis,
      contactBoxes: [{ position: [0, 0, 0], size: [0.4, 1.6, 0.4] }],
      bearsLoad: false,
      sideAttachmentReach: 0.3,
    });
  for (const [finIndex, roll] of [0, 2.0, -2.0].entries()) {
    // Корень пера сидит в бронзовом конусе (радиус оболочки у хвоста мал),
    // наружу выходит только лопасть.
    const radius = 0.95;
    primitive(ship, `fin:${finIndex}`, "wood", "panel",
      P(6.95, radius * Math.sin(roll), 8.1 + radius * Math.cos(roll)),
      [1.9, 1.05, 0.09], "#4a372c", {
        rotation: [roll, -alpha, 0.35],
        contactBoxes: [{ position: [0, 0, 0], size: [1.9, 1.15, 0.12] }],
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
  }

  // === Четыре несущие стропы: от сердца к планширям. bearingArea —
  // «плетёный строп держит на разрыв», иначе решатель раздавит их весом
  // корпуса.
  for (const a of [-3.5, 3.5] as const) {
    for (const side of [-1, 1] as const) {
      primitive(ship, `sling:${a}:${side}`, "wood", "cylinder",
        P(a, side * 1.72, 4.4), [0.09, 5.0, 0.09], "#7a6648", {
          contactBoxes: [{ position: [0, 0, 0], size: [0.11, 5.0, 0.11] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.6,
          bearingArea: 0.55,
        });
      primitive(ship, `deadeye:${a}:${side}`, "wood", "plank",
        P(a, side * 1.72, 2.26), [0.16, 0.24, 0.16], "#41332a", {
          bearsLoad: false,
          sideAttachmentReach: 0.3,
        });
    }
  }

  // === Корпус. Клинкерная обшивка: каждый пояс найтован к соседнему выше,
  // планширь — к стропам. Сегменты по три на пояс, правый борт с проёмом
  // лацпорта у носа (a -5.0..-4.0) — туда приходят сходни.
  const strakeBands = [
    {
      tag: "sheer", b: 1.58, y: 1.70, h: 0.56, roll: 0.22,
      colors: ["#553f2c", "#4f3b2a"],
      segments: [[-5.6, -1.9], [-1.9, 1.8], [1.8, 5.3]],
    },
    {
      tag: "mid", b: 1.52, y: 1.28, h: 0.48, roll: 0.34,
      colors: ["#4f3b2a", "#463527"],
      segments: [[-5.4, -2.6], [-2.6, 0.2], [0.2, 2.9], [2.9, 5.1]],
    },
    {
      tag: "garboard", b: 1.3, y: 0.91, h: 0.42, roll: 0.5,
      colors: ["#463527", "#41332a"],
      segments: [[-5.1, -3.2], [-3.2, -1.1], [-1.1, 1.0], [1.0, 3.0], [3.0, 4.8]],
    },
  ] as const;
  for (const [sideTag, side] of [["port", -1], ["starboard", 1]] as const) {
    for (const band of strakeBands) {
      for (const [segment, [a1, a2]] of band.segments.entries()) {
        const length = a2 - a1;
        primitive(ship, `strake:${sideTag}:${band.tag}:${segment}`, "wood", "panel",
          P((a1 + a2) / 2, side * band.b, band.y),
          [length, band.h, 0.09],
          band.colors[segment % 2], {
            rotation: [side * band.roll, -alpha, 0],
            contactBoxes: [{
              position: [0, 0, 0],
              size: [length, band.h + 0.04, 0.16],
            }],
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.42,
            surface: band.tag === "garboard" ? [{ kind: "damp", amount: 0.35 }] : undefined,
          });
      }
    }
    // Планширь — брус поверх верхнего пояса, корень всей цепочки бортов.
    const capSegments = [[-5.7, -2.0], [-2.0, 1.9], [1.9, 5.4]] as const;
    for (const [segment, [a1, a2]] of capSegments.entries()) {
      const length = a2 - a1;
      primitive(ship, `gunwale:${sideTag}:${segment}`, "wood", "plank",
        P((a1 + a2) / 2, side * 1.55, 2.02),
        [length, 0.24, 0.3], segment % 2 === 0 ? "#54402d" : "#5d4531", {
          rotation: [0, -alpha, 0],
          contactBoxes: [{ position: [0, 0, 0], size: [length, 0.24, 0.34] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
        });
    }
  }
  // Днищевые пояса и киль: низкая середина висит над чистым туманом.
  for (const side of [-1, 1] as const) {
    for (const [segment, [a1, a2]] of ([[-4.7, -1.7], [-1.7, 1.5], [1.5, 4.4]] as const).entries()) {
      const length = a2 - a1;
      primitive(ship, `bottom:${side}:${segment}`, "wood", "panel",
        P((a1 + a2) / 2, side * 0.55, 0.575),
        [length, 0.46, 0.09], segment % 2 === 0 ? "#41332a" : "#3a2d22", {
          rotation: [side * 0.72, -alpha, 0],
          contactBoxes: [{ position: [0, 0, 0], size: [length, 0.46, 0.14] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.42,
          surface: [{ kind: "damp", amount: 0.4 }],
        });
    }
  }
  for (const [segment, [a1, a2]] of ([[-4.9, -1.8], [-1.8, 1.6], [1.6, 4.6]] as const).entries()) {
    const length = a2 - a1;
    primitive(ship, `keel:${segment}`, "wood", "plank",
      P((a1 + a2) / 2, 0, 0.48),
      [length, 0.36, 0.24], "#3a2d22", {
        rotation: [0, -alpha, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [length, 0.36, 0.28] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        surface: [{ kind: "damp", amount: 0.45 }],
      });
  }

  // Штевни: оба конца задраны. Нос несёт голову дракона над самым берегом
  // у корня причала, корма завивается хвостом.
  const stemPieces: readonly {
    id: string; a: number; y: number; len: number; pitch: number; h: number;
  }[] = [
    { id: "stem:bow:0", a: -5.45, y: 1.0, len: 1.7, pitch: -0.68, h: 0.42 },
    { id: "stem:bow:1", a: -6.3, y: 1.95, len: 1.05, pitch: -0.96, h: 0.36 },
    { id: "stem:stern:0", a: 5.15, y: 1.05, len: 1.5, pitch: 0.62, h: 0.4 },
    { id: "stem:stern:1", a: 6.0, y: 1.95, len: 0.95, pitch: 0.92, h: 0.34 },
  ];
  for (const stem of stemPieces) {
    primitive(ship, stem.id, "wood", "plank",
      P(stem.a, 0, stem.y), [stem.len, stem.h, 0.22], "#3a2d22", {
        rotation: [0, -alpha, stem.pitch],
        contactBoxes: [{ position: [0, 0, 0], size: [stem.len, stem.h + 0.06, 0.26] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
  }
  primitive(ship, "dragon:neck:0", "wood", "plank",
    P(-6.68, 0, 2.55), [0.5, 0.58, 0.3], "#3a2d22", {
      rotation: [0, -alpha, -0.38],
      contactBoxes: [{ position: [0, 0, 0], size: [0.64, 0.72, 0.34] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "dragon:neck:1", "wood", "plank",
    P(-6.92, 0, 3.02), [0.42, 0.44, 0.26], "#3a2d22", {
      rotation: [0, -alpha, -0.78],
      contactBoxes: [{ position: [0, 0, 0], size: [0.56, 0.6, 0.3] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "dragon:head", "wood", "plank",
    P(-7.16, 0, 3.36), [0.66, 0.34, 0.34], "#41332a", {
      rotation: [0, -alpha, 0.16],
      contactBoxes: [{ position: [0, 0, 0], size: [0.74, 0.46, 0.38] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "dragon:jaw", "wood", "plank",
    P(-7.42, 0, 3.14), [0.44, 0.11, 0.24], "#3a2d22", {
      rotation: [0, -alpha, 0.34],
      bearsLoad: false,
      sideAttachmentReach: 0.35,
    });
  primitive(ship, "dragon:crest", "wood", "plank",
    P(-7.08, 0, 3.6), [0.4, 0.08, 0.38], "#c9a86a", {
      rotation: [0, -alpha, 0.16],
      bearsLoad: false,
      sideAttachmentReach: 0.35,
    });
  for (const side of [-1, 1] as const) {
    primitive(ship, `dragon:horn:${side}`, "wood", "plank",
      P(-6.98, side * 0.18, 3.64), [0.28, 0.22, 0.07], "#3a2d22", {
        rotation: [side * 0.5, -alpha, -0.6],
        bearsLoad: false,
        sideAttachmentReach: 0.35,
      });
  }
  // Кормовой конёк: спираль из трёх сегментов, сужающихся к завитку —
  // узнаваемый силуэт драккара с обоих концов.
  primitive(ship, "tail:curl:0", "wood", "plank",
    P(6.28, 0, 2.52), [0.42, 0.62, 0.2], "#3a2d22", {
      rotation: [0, -alpha, 1.05],
      contactBoxes: [{ position: [0, 0, 0], size: [0.6, 0.7, 0.24] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "tail:curl:1", "wood", "plank",
    P(6.12, 0, 3.0), [0.46, 0.24, 0.17], "#3a2d22", {
      rotation: [0, -alpha, 0.35],
      contactBoxes: [{ position: [0, 0, 0], size: [0.5, 0.32, 0.2] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  primitive(ship, "tail:curl:2", "wood", "plank",
    P(5.86, 0, 3.02), [0.3, 0.18, 0.14], "#c9a86a", {
      rotation: [0, -alpha, -0.75],
      bearsLoad: false,
      sideAttachmentReach: 0.35,
    });

  // Носовые и кормовые скулы: диагональные доски, сводящие борта к штевням.
  // Водорез: каждый пояс продолжается собственной полосой от своего торца
  // к штевню — начало утоплено в пояс на четверть метра, конец в штевне,
  // поэтому щелей между водорезом и бортами нет ни спереди, ни сзади.
  for (const band of strakeBands) {
    const bowEnd = band.segments[0][0];
    const sternEnd = band.segments[band.segments.length - 1][1];
    for (const side of [-1, 1] as const) {
      for (const [end, endTag, bandEnd] of [[-1, "bow", bowEnd], [1, "stern", sternEnd]] as const) {
        const from = P(bandEnd - end * 0.25, side * band.b, band.y);
        const to = P(end * (endTag === "bow" ? 6.35 : 6.3), 0, band.y + 0.55);
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const dz = to[2] - from[2];
        const run = Math.hypot(dx, dz);
        primitive(ship, `cutwater:${endTag}:${side}:${band.tag}`, "wood", "panel",
          [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
          [Math.hypot(dx, dy, dz) + 0.1, band.h, 0.09], "#4f3b2a", {
            rotation: [0, Math.atan2(-dz, dx), Math.atan2(dy, run)],
            contactBoxes: [{ position: [0, 0, 0], size: [Math.hypot(dx, dy, dz) + 0.1, band.h + 0.04, 0.15] }],
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.5,
          });
      }
    }
  }

  // Верх борта завершён: бревно планширя продолжается угловым бревном от
  // каждого конца к коньку.
  for (const side of [-1, 1] as const) {
    for (const [end, endTag] of [[-1, "bow"], [1, "stern"]] as const) {
      const from = P(end === -1 ? -5.55 : 5.25, side * 1.55, 2.02);
      const to = P(end === -1 ? -6.5 : 6.4, 0, end === -1 ? 2.72 : 2.68);
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const dz = to[2] - from[2];
      const run = Math.hypot(dx, dz);
      primitive(ship, `gunwale-finial:${endTag}:${side}`, "wood", "plank",
        [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
        [Math.hypot(dx, dy, dz) + 0.15, 0.2, 0.24], "#54402d", {
          rotation: [0, Math.atan2(-dz, dx), Math.atan2(dy, run)],
          contactBoxes: [{ position: [0, 0, 0], size: [Math.hypot(dx, dy, dz) + 0.15, 0.24, 0.3] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
        });
    }
  }

  // === Внутренний набор: шпангоуты на обшивке, три стрингера, палуба.
  for (const [ribIndex, a] of [-4.4, -2.2, 0, 2.2, 4.4].entries()) {
    primitive(ship, `rib:${ribIndex}`, "wood", "plank",
      P(a, 0, 0.68), [0.14, 0.36, 2.7], "#41332a", {
        rotation: [0, -alpha, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [0.14, 0.36, 2.7] }],
        sideAttachmentReach: 0.45,
      });
  }
  for (const [stringerIndex, b] of [-0.83, 0, 0.83].entries()) {
    primitive(ship, `stringer:${stringerIndex}`, "wood", "plank",
      P(0, b, 0.92), [11.7, 0.12, 0.3], "#463527", {
        rotation: [0, -alpha, 0],
        contactBoxes: [{ position: [0, 0, 0], size: [11.7, 0.12, 0.3] }],
      });
  }
  const deckRuns = [-0.83, 0, 0.83] as const;
  const deckSegments = [[-4.95, -2.55], [-2.45, -0.05], [0.05, 2.45], [2.55, 4.95]] as const;
  for (const [runIndex, b] of deckRuns.entries()) {
    for (const [segment, [a1, a2]] of deckSegments.entries()) {
      const length = a2 - a1;
      primitive(ship, `deck:${runIndex}:${segment}`, "wood", "plank",
        P((a1 + a2) / 2, b, 1.01), [length, 0.06, 0.76],
        (runIndex + segment) % 2 === 0 ? "#5d4936" : "#66503a", {
          rotation: [0, -alpha, 0],
          contactBoxes: [{ position: [0, 0, 0], size: [length, 0.06, 0.76] }],
        });
    }
  }
  // Носовая и кормовая части пола зашиты целиком: поперечные доски
  // сужаются вслед за бортами, отверстий в палубе нет.
  for (const [end, endTag] of [[-1, "bow"], [1, "stern"]] as const) {
    for (const [fillIndex, [fillA, halfWidth]] of ([
      [5.12, 1.32], [5.46, 1.0], [5.8, 0.62],
    ] as const).entries()) {
      primitive(ship, `deck-fill:${endTag}:${fillIndex}`, "wood", "plank",
        P(end * fillA, 0, 1.01), [0.6, 0.06, halfWidth * 2],
        fillIndex % 2 === 0 ? "#66503a" : "#5d4936", {
          rotation: [0, -alpha, 0],
          contactBoxes: [{ position: [0, 0, 0], size: [0.6, 0.06, halfWidth * 2] }],
        });
    }
  }

  primitive(ship, "keelson", "wood", "plank",
    P(0.15, 0, 0.96), [1.4, 0.2, 1.1], "#41332a", {
      rotation: [0, -alpha, 0],
      contactBoxes: [{ position: [0, 0, 0], size: [1.4, 0.2, 1.1] }],
    });

  // === Рангоут: мачта на кильсоне, рея, полуубранный полосатый парус —
  // баллон над ним делает всю работу, парус остался из вежливости к ветру.
  primitive(ship, "mast", "wood", "cylinder",
    P(0.15, 0, 3.26), [0.36, 4.4, 0.36], "#4f3b2a", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.38, 4.4, 0.38] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
    });
  primitive(ship, "yard", "wood", "cylinder",
    P(0.15, 0, 4.42), [0.16, 4.6, 0.16], "#463527", {
      rotation: acrossAxis,
      contactBoxes: [{ position: [0, 0, 0], size: [0.18, 4.8, 0.18] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.35,
    });
  primitive(ship, "sail:roll", "cloth", "cylinder",
    P(0.28, 0, 4.24), [0.42, 4.3, 0.42], "#b89f7d", {
      rotation: acrossAxis,
      contactBoxes: [{ position: [0, 0, 0], size: [0.44, 4.4, 0.44] }],
    });
  for (const [panelIndex, b] of [-1.42, 0, 1.42].entries()) {
    primitive(ship, `sail:panel:${panelIndex}`, "cloth", "panel",
      P(0.42, b, 3.35), [0.07, 2.2, 1.35],
      panelIndex % 2 === 0 ? "#b89f7d" : "#8e4a37", {
        rotation: [0, -alpha, panelIndex === 1 ? 0.05 : -0.04],
        contactBoxes: [{ position: [0, 0, 0], size: [0.24, 2.2, 1.35] }],
      });
  }
  primitive(ship, "pennant", "cloth", "panel",
    P(0.55, 0, 5.24), [0.72, 0.26, 0.05], "#8e4a37", {
      rotation: [0, -alpha + 0.35, 0],
      contactBoxes: [{ position: [0, 0, 0], size: [0.8, 0.3, 0.1] }],
    });
  // Штаги к штевням — стоячий такелаж, чисто рассказ.
  for (const [stayTag, aTip, yTip] of [["bow", -6.1, 2.3], ["stern", 5.9, 2.35]] as const) {
    const dx = (aTip - 0.15) * ca;
    const dz = (aTip - 0.15) * sa;
    const dy = yTip - 5.3;
    const length = Math.hypot(dx, dy, dz) - 0.3;
    primitive(ship, `stay:${stayTag}`, "wood", "cylinder",
      P((0.15 + aTip) / 2, 0, (5.3 + yTip) / 2), [0.05, length, 0.05], "#7a6648", {
        rotation: rodRotation(dx, dy, dz),
        contactBoxes: [{ position: [0, 0, 0], size: [0.2, length, 0.2] }],
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
  }

  // === Жизнь на палубе: груз принайтован ближе к корме, бухта каната и
  // рулевое весло уложены — пришли и ошвартовались.
  place(ship, "cargo:cask:0", "viking:barrel", {
    position: P(1.35, -0.55, 1.04),
    rotation: [0, 0.6, 0],
  });
  place(ship, "cargo:cask:1", "viking:barrel", {
    position: P(2.0, -1.0, 1.04),
    rotation: [0, -0.9, 0],
  });
  place(ship, "cargo:crate", "core:crate", {
    position: P(-1.7, -0.8, 1.04),
    rotation: [0, 0.35, 0],
  });
  place(ship, "cargo:sacks", "core:sacks", {
    position: P(-2.7, 0.62, 1.04),
    rotation: [0, -0.5, 0],
  });
  primitive(ship, "rope-coil", "wood", "cylinder",
    P(-3.7, 0.72, 1.105), [0.5, 0.13, 0.5], "#7a6648", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.48, 0.13, 0.48] }],
      bearsLoad: false,
    });
  // Рулевое весло навешено на правой раковине кормы и уходит лопастью
  // в туман — фирменная черта, с мостков читается сразу.
  primitive(ship, "rudder:mount", "wood", "plank",
    P(4.55, 1.62, 2.02), [0.26, 0.3, 0.24], "#41332a", {
      rotation: [0, -alpha, 0],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.4,
    });
  {
    const rudderTop = P(4.35, 1.86, 2.85);
    const rudderTip = P(5.65, 2.02, 1.15);
    const dx = rudderTip[0] - rudderTop[0];
    const dy = rudderTip[1] - rudderTop[1];
    const dz = rudderTip[2] - rudderTop[2];
    const rudderLength = Math.hypot(dx, dy, dz);
    primitive(ship, "rudder:shaft", "wood", "cylinder",
      [(rudderTop[0] + rudderTip[0]) / 2, (rudderTop[1] + rudderTip[1]) / 2, (rudderTop[2] + rudderTip[2]) / 2],
      [0.12, rudderLength, 0.12], "#54402d", {
        rotation: rodRotation(dx, dy, dz),
        contactBoxes: [{ position: [0, 0, 0], size: [0.24, rudderLength, 0.24] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
      });
    primitive(ship, "rudder:blade", "wood", "plank",
      [
        rudderTip[0] + (dx / rudderLength) * 0.34,
        rudderTip[1] + (dy / rudderLength) * 0.34,
        rudderTip[2] + (dz / rudderLength) * 0.34,
      ], [0.07, 0.95, 0.4], "#5d4531", {
        rotation: rodRotation(dx, dy, dz),
        contactBoxes: [{ position: [0, 0, 0], size: [0.35, 0.95, 0.45] }],
        bearsLoad: false,
        sideAttachmentReach: 0.4,
      });
    {
      // Румпель выходит из головы валька внутрь корабля, к рулевому.
      // Начало — точно на оси валька, чуть ниже его верхнего торца.
      const tillerFrom: SceneVector3 = [
        rudderTop[0] + (dx / rudderLength) * 0.1,
        rudderTop[1] + (dy / rudderLength) * 0.1,
        rudderTop[2] + (dz / rudderLength) * 0.1,
      ];
      const tillerTo = P(4.0, 0.8, 2.45);
      const tx = tillerTo[0] - tillerFrom[0];
      const ty = tillerTo[1] - tillerFrom[1];
      const tz = tillerTo[2] - tillerFrom[2];
      primitive(ship, "rudder:tiller", "wood", "cylinder",
        [(tillerFrom[0] + tillerTo[0]) / 2, (tillerFrom[1] + tillerTo[1]) / 2, (tillerFrom[2] + tillerTo[2]) / 2],
        [0.07, Math.hypot(tx, ty, tz), 0.07], "#5d4531", {
          rotation: rodRotation(tx, ty, tz),
          contactBoxes: [{ position: [0, 0, 0], size: [0.3, Math.hypot(tx, ty, tz), 0.3] }],
          bearsLoad: false,
          sideAttachmentReach: 0.5,
        });
    }
  }

  // Вёсла: по пять на борт, выпущены в небо чуть вразнобой — на земле
  // грести не о что, но силуэт с крыльями вёсел и есть драккар.
  for (const side of [-1, 1] as const) {
    // Правый борт смотрит на отмель: там вёсла приподняты, чтобы лопасти
    // висели над берегом, а не опирались о него. Левый борт — над туманом,
    // эти распущены вниз во всю длину.
    for (const [oarIndex, oarA] of [-3.6, -1.8, 0, 1.8, 3.6].entries()) {
      const droop = (side > 0 ? 0.13 : 0.27) + 0.02 * oarIndex;
      const outboard = side > 0 ? 1.9 : 2.4;
      const sweep = 0.22;
      const inboard = P(oarA, side * 1.18, 1.16);
      const tip = P(oarA + sweep * outboard, side * (1.42 + outboard), 1.08 - droop * outboard);
      const dx = tip[0] - inboard[0];
      const dy = tip[1] - inboard[1];
      const dz = tip[2] - inboard[2];
      const length = Math.hypot(dx, dy, dz);
      primitive(ship, `oar:${side}:${oarIndex}`, "wood", "cylinder",
        [(inboard[0] + tip[0]) / 2, (inboard[1] + tip[1]) / 2, (inboard[2] + tip[2]) / 2],
        [0.07, length, 0.07], oarIndex % 2 === 0 ? "#5d4936" : "#54402d", {
          rotation: rodRotation(dx, dy, dz),
          contactBoxes: [{ position: [0, 0, 0], size: [0.15, length, 0.15] }],
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.5,
          // Решатель вправе повести долю нагрузки днища через валёк —
          // плетёный из ясеня, выдержит.
          bearingArea: 0.6,
        });
      primitive(ship, `oar:${side}:${oarIndex}:blade`, "wood", "plank",
        [tip[0] + dx / length * 0.45, tip[1] + dy / length * 0.45, tip[2] + dz / length * 0.45],
        [0.05, 1.0, 0.3], "#63492f", {
          rotation: rodRotation(dx, dy, dz),
          contactBoxes: [{ position: [0, 0, 0], size: [0.3, 1.0, 0.3] }],
          bearsLoad: false,
          sideAttachmentReach: 0.4,
        });
    }
  }

  // Щиты по бортам — те же, что встречают у ворот деревни: тёмно-красный и
  // стально-синий с золотой полосой. Каждому добавлены железный обод-подложка
  // и золотая поперечина — крест поверх полосы префаба.
  const shieldPalettes = [
    { paint: "#8f3028", stripe: "#d2b56a" },
    { paint: "#35566a", stripe: "#d2b56a" },
  ] as const;
  const shieldSpots: readonly (readonly [number, number])[] = [
    [-3.9, -1], [-2.3, -1], [-0.7, -1], [0.9, -1], [2.5, -1],
    [-3.3, 1], [-1.5, 1], [0.1, 1], [1.7, 1], [3.3, 1],
  ];
  for (const [shieldIndex, [a, side]] of shieldSpots.entries()) {
    place(ship, `shield:${shieldIndex}`, "viking:shield", {
      position: P(a, side * 1.8, 1.98),
      rotation: [0, -alpha + (side < 0 ? 0 : Math.PI), 0],
    }, { palette: shieldPalettes[shieldIndex % shieldPalettes.length] });
    primitive(ship, `shield:${shieldIndex}:rim`, "steel", "cylinder",
      P(a, side * 1.74, 1.98), [1.56, 0.05, 1.56], "#3d4145", {
        rotation: acrossAxis,
        contactBoxes: [{ position: [0, 0, 0], size: [1.56, 0.06, 1.56] }],
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
    primitive(ship, `shield:${shieldIndex}:stripe`, "wood", "plank",
      P(a, side * 1.92, 1.98), [0.16, 1.24, 0.06], "#d2b56a", {
        rotation: [0, -alpha, 0],
        bearsLoad: false,
        sideAttachmentReach: 0.5,
      });
  }

  // Кормовой фонарь на хвостовом штевне — второй огонь над туманом,
  // перекликается с фонарём причала.
  primitive(ship, "lantern:post", "wood", "cylinder",
    P(5.6, -0.35, 2.6), [0.13, 1.5, 0.13], "#3f3027", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.14, 1.5, 0.14] }],
      carriesAttachments: true,
      sideAttachmentReach: 0.5,
    });
  primitive(ship, "lantern:arm", "wood", "plank",
    P(5.85, -0.35, 3.28), [0.5, 0.07, 0.07], "#3f3027", {
      rotation: [0, -alpha, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.5,
    });
  primitive(ship, "lantern:cap", "steel", "steelSheet",
    P(6.05, -0.35, 3.22), [0.22, 0.05, 0.22], "#353a3b", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
    });
  primitive(ship, "lantern:flame", "glass", "glassPane",
    P(6.05, -0.35, 3.08), [0.13, 0.18, 0.13], "#f2dfa7", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
      light: { color: "#ffb46a", distance: 9, intensity: 3 },
    });

  // Носовой фонарь висит под головой дракона, сдвинут на правую скулу,
  // чтобы не спорить со швартовым канатом (тот идёт от шеи по центру).
  primitive(ship, "lantern:bow:arm", "wood", "plank",
    P(-6.82, 0.22, 2.42), [0.5, 0.07, 0.07], "#3f3027", {
      rotation: [0, -alpha - 0.45, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.5,
    });
  primitive(ship, "lantern:bow:cap", "steel", "steelSheet",
    P(-7.02, 0.36, 2.36), [0.2, 0.05, 0.2], "#353a3b", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
    });
  primitive(ship, "lantern:bow:flame", "glass", "glassPane",
    P(-7.02, 0.36, 2.22), [0.13, 0.18, 0.13], "#f2dfa7", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
      light: { color: "#ffb46a", distance: 9, intensity: 3 },
    });

  // Топовый огонь: короткий кронштейн под самым топом мачты, фонарь висит
  // впереди неё — ночью подсвечивает брюхо баллона и парус.
  primitive(ship, "lantern:mast:arm", "wood", "plank",
    P(-0.13, 0, 5.08), [0.5, 0.07, 0.07], "#3f3027", {
      rotation: [0, -alpha, 0],
      bearsLoad: false,
      sideAttachmentReach: 0.5,
    });
  primitive(ship, "lantern:mast:cap", "steel", "steelSheet",
    P(-0.35, 0, 5.02), [0.2, 0.05, 0.2], "#353a3b", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
    });
  primitive(ship, "lantern:mast:flame", "glass", "glassPane",
    P(-0.35, 0, 4.88), [0.13, 0.18, 0.13], "#f2dfa7", {
      bearsLoad: false,
      sideAttachmentReach: 0.6,
      light: { color: "#ffb46a", distance: 11, intensity: 3 },
    });

  // === Швартовка к пирсу. Носовой канат провисает к кнехту на конце
  // мостков, шпринг — к новой утке у корня сходней. Оба — рассказ, не
  // опора: корабль держит только сердце баллона.
  const bowLinePoints: readonly SceneVector3[] = [
    [1.35, 2.35, -103.2],
    [0.25, 1.35, -105.3],
    [-0.55, 1.1, -106.95],
  ];
  for (let segment = 0; segment < bowLinePoints.length - 1; segment += 1) {
    const [x1, y1, z1] = bowLinePoints[segment];
    const [x2, y2, z2] = bowLinePoints[segment + 1];
    const length = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    // Сегменты провиса держатся цепочкой за шею дракона; они «несущие»
    // только друг для друга — кнехт пирса крепить не умеет (wall-режим).
    primitive(ship, `bow-line:${segment}`, "wood", "cylinder",
      [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2], [0.055, length, 0.055], "#7a6648", {
        rotation: rodRotation(x2 - x1, y2 - y1, z2 - z1),
        contactBoxes: [{ position: [0, 0, 0], size: [0.15, length, 0.15] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.6,
      });
  }
  primitive(ship, "mooring-cleat", "wood", "cylinder",
    [-0.7, 0.49, -101.05], [0.2, 0.5, 0.2], "#4a372c", {
      contactBoxes: [{ position: [0, 0, 0], size: [0.2, 0.5, 0.2] }],
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      surface: [{ kind: "damp", amount: 0.4 }],
    });
  // Береговые буйки: нос и корма растянуты швартовами в распор — к
  // полосатому бую на отмели северо-востока и к бую на языке мыса. Канаты
  // натянуты (корабль рвётся вверх), буйки просто стоят на земле.
  const moorBuoys: readonly {
    tag: string; at: readonly [number, number];
    shipPoint: SceneVector3;
  }[] = [
    { tag: "north", at: [13.6, -97.6], shipPoint: P(4.8, 1.55, 2.0) },
    { tag: "west", at: [0.6, -103.6], shipPoint: P(-5.3, -1.5, 1.9) },
  ];
  for (const buoy of moorBuoys) {
    const [bx, bz] = buoy.at;
    primitive(ship, `buoy:${buoy.tag}:base`, "stone", "stoneBlock",
      [bx, 0.19, bz], [0.62, 0.28, 0.56], "#62655f", {
        rotation: [0, noise(bx, bz, 31) * Math.PI, 0],
        surface: [{ kind: "moss", amount: 0.4 }],
      });
    primitive(ship, `buoy:${buoy.tag}:float`, "wood", "cylinder",
      [bx, 0.61, bz], [0.44, 0.56, 0.44], "#8e4a37", {
        contactBoxes: [{ position: [0, 0, 0], size: [0.44, 0.56, 0.44] }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
      });
    primitive(ship, `buoy:${buoy.tag}:cap`, "wood", "cylinder",
      [bx, 0.94, bz], [0.3, 0.1, 0.3], "#c3ac8a", {
        bearsLoad: false,
        sideAttachmentReach: 0.3,
      });
    const top: SceneVector3 = [bx, 0.94, bz];
    const dx = top[0] - buoy.shipPoint[0];
    const dy = top[1] - buoy.shipPoint[1];
    const dz = top[2] - buoy.shipPoint[2];
    const length = Math.hypot(dx, dy, dz) - 0.2;
    primitive(ship, `moor-line:${buoy.tag}`, "wood", "cylinder",
      [(top[0] + buoy.shipPoint[0]) / 2, (top[1] + buoy.shipPoint[1]) / 2, (top[2] + buoy.shipPoint[2]) / 2],
      [0.05, length, 0.05], "#7a6648", {
        rotation: rodRotation(dx, dy, dz),
        contactBoxes: [{ position: [0, 0, 0], size: [0.18, length, 0.18] }],
        bearsLoad: false,
        sideAttachmentReach: 0.6,
      });
  }

  {
    const springFrom: SceneVector3 = [-0.7, 0.72, -101.08];
    const springTo = P(-5.15, 1.55, 1.98);
    const dx = springTo[0] - springFrom[0];
    const dy = springTo[1] - springFrom[1];
    const dz = springTo[2] - springFrom[2];
    primitive(ship, "spring-line", "wood", "cylinder",
      [(springFrom[0] + springTo[0]) / 2, (springFrom[1] + springTo[1]) / 2, (springFrom[2] + springTo[2]) / 2],
      [0.05, Math.hypot(dx, dy, dz) - 0.15, 0.05], "#7a6648", {
        rotation: rodRotation(dx, dy, dz),
        contactBoxes: [{ position: [0, 0, 0], size: [0.15, Math.hypot(dx, dy, dz) - 0.15, 0.15] }],
        bearsLoad: false,
        sideAttachmentReach: 0.6,
      });
  }

  // === Сходни: доска просто переброшена с настила через планширь —
  // западный конец лежит на пирсе, точка опоры — сам планширь у a≈-4.1,
  // хвост нависает над палубой. Никаких предметов на доске: взошёл — прыгай.
  {
    const railTop = 2.14;
    const browJetty: SceneVector3 = [-0.8, 0.29, -99.15];
    const railPoint = P(-4.75, 1.55, railTop + 0.04);
    const runX = railPoint[0] - browJetty[0];
    const runZ = railPoint[2] - browJetty[2];
    const run = Math.hypot(runX, runZ);
    const slope = (railPoint[1] - browJetty[1]) / run;
    const dirX = runX / run;
    const dirZ = runZ / run;
    const westBack = 0.02;
    const eastOver = 0.55;
    const west: SceneVector3 = [
      browJetty[0] - dirX * westBack, browJetty[1] - slope * westBack, browJetty[2] - dirZ * westBack,
    ];
    const east: SceneVector3 = [
      railPoint[0] + dirX * eastOver, railPoint[1] + slope * eastOver, railPoint[2] + dirZ * eastOver,
    ];
    const browPitch = Math.atan(slope);
    const browLength = (run + westBack + eastOver) / Math.cos(browPitch);
    const center: SceneVector3 = [
      (west[0] + east[0]) / 2, (west[1] + east[1]) / 2 - 0.045, (west[2] + east[2]) / 2,
    ];
    const localAlong = (point: SceneVector3): number =>
      ((point[0] - center[0]) * dirX + (point[2] - center[2]) * dirZ) / Math.cos(browPitch);
    primitive(ship, "brow", "wood", "plank",
      center, [browLength, 0.09, 0.6], "#5d4531", {
        rotation: [0, Math.atan2(-dirZ, dirX), browPitch],
        contactBoxes: [
          { position: [localAlong(browJetty), 0.04, 0], size: [0.6, 0.1, 0.55] },
          { position: [localAlong(railPoint), -0.01, 0], size: [0.5, 0.1, 0.55] },
          { position: [0, 0, 0], size: [browLength * 0.55, 0.09, 0.56] },
        ],
        // Наклонная доска: её центр ниже планширя, «кто на ком лежит»
        // должны решать опорные пятна на концах, не центр рендера.
        contactBearingOrder: true,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        surface: [{ kind: "damp", amount: 0.35 }],
      });
  }
}

/**
 * Прибрежная полоса: непрерывный периметр берега. Осока и жёсткая трава
 * гуще всего у самой кромки, между ними плоские замшелые камни и плавник —
 * брёвна, которые «вынесло» из тумана. Кромка читается берегом в любой
 * точке круга, а не только у причала.
 */
function createShoreFringe(): void {
  const fringe = group("shore-fringe", "Shoreline sedge and drift", "grass", "stack");

  // Точная копия терраинной сетки: клетка есть, если её центр внутри
  // шумовой кромки. Полоса ищет самый внешний существующий тайл на своём
  // азимуте и отступает от него на метр внутрь.
  const tileExists = (x: number, z: number): boolean => {
    const cellX = Math.round(x / 4) * 4;
    const cellZ = WORLD_CENTER_Z + Math.round((z - WORLD_CENTER_Z) / 4) * 4;
    if (cellX < -96 || cellX > 96) {
      return false;
    }
    const radius = Math.hypot(cellX, cellZ - WORLD_CENTER_Z);
    const edge = 92 + (noise(cellX, cellZ, 4) - 0.5) * 8 + Math.sin(cellZ * 0.075) * 2.4;
    return radius <= edge;
  };

  const steps = 112;
  for (let step = 0; step < steps; step += 1) {
    const seedA = noise(step, 4, 61);
    const seedB = noise(step, 9, 67);
    const angle = (step / steps) * Math.PI * 2 + (seedA - 0.5) * 0.04;
    let radius = 93.5;
    let x = Math.cos(angle) * radius;
    let z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    for (let pull = 0; pull < 6 && !tileExists(x, z); pull += 1) {
      radius -= 1.8;
      x = Math.cos(angle) * radius;
      z = WORLD_CENTER_Z + Math.sin(angle) * radius;
    }
    if (!tileExists(x, z)) {
      continue;
    }
    radius -= 1.1;
    x = Math.cos(angle) * radius;
    z = WORLD_CENTER_Z + Math.sin(angle) * radius;

    // У причала берег и так занят делом.
    if (Math.abs(x) < 5.5 && z < -86) {
      continue;
    }

    const kind = noise(step, 13, 71);
    if (kind < 0.1) {
      continue;
    }
    if (kind < 0.24) {
      // Плавник: осклизлое бревно, вынесенное «водой».
      const along = step % 2 === 0;
      const length = 1.6 + seedB * 1.4;
      primitive(fringe, `drift:${step}`, "wood", "cylinder",
        [x, 0.16, z], [0.3, length, 0.3],
        seedB > 0.5 ? "#544536" : "#4b3e31", {
          rotation: along ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
          contactBoxes: [{ position: [0, 0, 0], size: along ? [0.32, length, 0.3] : [0.32, length, 0.3] }],
          surface: [{ kind: "damp", amount: 0.55 }, { kind: "moss", amount: 0.4 }],
        });
    } else if (kind < 0.42) {
      const width = 0.7 + seedB * 1.1;
      primitive(fringe, `shore-stone:${step}`, step % 5 === 0 ? "basalt" : "stone", "stoneBlock",
        [x, 0.1 + width * 0.12, z], [width, 0.22 + width * 0.26, width * 0.78],
        step % 5 === 0 ? "#42474a" : step % 2 === 0 ? "#6d6f68" : "#7a7b72", {
          rotation: [0, seedA * Math.PI, 0.04],
          surface: [{ kind: "moss", amount: 0.5 + seedB * 0.3 }, { kind: "damp", amount: 0.4 }],
        });
    } else {
      // Осока: пучок из двух-трёх жёстких куп с наклоном от «воды».
      const clumps = 2 + Math.floor(seedB * 1.99);
      for (let clump = 0; clump < clumps; clump += 1) {
        const clumpAngle = angle + (noise(step, clump, 73) - 0.5) * 1.6;
        const cx = x + Math.cos(clumpAngle) * (0.35 + clump * 0.3);
        const cz = z + Math.sin(clumpAngle) * (0.3 + clump * 0.28);
        const height = 0.55 + noise(step, clump, 79) * 0.5;
        primitive(fringe, `sedge:${step}:${clump}`, "foliage", "groundTile",
          [cx, height / 2, cz], [0.3 + seedA * 0.2, height, 0.26],
          clump % 2 === 0 ? "#5b6b44" : "#52633e", {
            rotation: [(seedB - 0.5) * 0.2, noise(step, clump, 83) * Math.PI, (seedA - 0.5) * 0.24],
            vegetationVisual: { kind: "shrub", seed: step * 7 + clump },
            bearsLoad: false,
          });
      }
    }
  }
}

createTerrain();
createPalisade();
createBuildings();
createVillageLife();
createRockwork();
createLivedInDressing();
createStorySites();
createWoodland();
createFjordJetty();
createSkyLongship();
createShoreFringe();

export const vikingVillageDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "viking-village",
  title: "Make a Mess: Viking Village",
  environment: "fortress",
  world: {
    playerSpawn: [0, 1.3, 75],
    cameraFar: 270,
    center: [0, WORLD_CENTER_Z],
    halfExtents: [102, 102],
    radius: WORLD_RADIUS,
    safetyFloorY: -2.4,
  },
  copy: {
    status: "Make a Mess / Viking Village",
    eyebrow: "North settlement test 001",
    heading: "Деревня — объект.",
    ready: "The village is awake",
    loading: "Разжигаем очаги…",
    description:
      "Неровная северная деревня внутри частокола: большой зал конунга, жилые дома, грязные тропы, склады оружия, щиты, бельё, бочки, факелы, влажный камень, мох и грибы. Всё собрано из редакторно-готовых объектов и подчиняется общему движку разрушения.",
    enter: "Войти через ворота",
    returnToGame: "Вернуться в деревню",
    reset: "Отстроить поселение заново",
  },
  groups: [...groups.values()].map((current): SceneGroupDefinition => ({
    ...current,
    objects: current.objects,
  })),
};
