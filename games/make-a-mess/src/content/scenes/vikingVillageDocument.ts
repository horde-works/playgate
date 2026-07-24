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

createTerrain();
createPalisade();
createBuildings();
createVillageLife();
createRockwork();
createLivedInDressing();
createStorySites();
createWoodland();

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
