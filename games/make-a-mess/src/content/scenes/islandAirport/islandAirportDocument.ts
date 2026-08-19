import type {
  AuthoredSceneDocument,
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
} from "../sceneContract.ts";
import type { SceneVector3 } from "../../../game/destructionScene.ts";
import {
  AIRPORT_APRON,
  AIRPORT_CONTROL_TOWER,
  AIRPORT_FUEL_FARM,
  AIRPORT_RUNWAY,
  AIRPORT_TAXIWAY,
  AIRPORT_TERMINAL,
  AIRPORT_WORLD,
  AIRPORT_RUNWAY_08,
  AIRPORT_TAXI_LINKS,
  ISLAND_AIRPORT_SHORELINE,
  airportDistanceToShoreline,
  airportInsideRectangle,
  airportPointInShoreline,
} from "./islandAirportPlan.ts";
import {
  islandAirportDc3CommandPostGroup,
  islandAirportDc3Group,
  islandAirportDc3MotionInstruments,
} from "./islandAirportDc3.ts";

type MutableGroup = SceneGroupDefinition & { objects: SceneObjectDefinition[] };

const groups = new Map<string, MutableGroup>();

function group(
  id: string,
  label: string,
  material: SceneGroupDefinition["material"],
  supportMode: SceneGroupDefinition["supportMode"] = "stack",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) return existing;
  const created: MutableGroup = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

function primitive(
  target: MutableGroup,
  id: string,
  material: ScenePrimitiveDefinition["material"],
  shape: ScenePrimitiveDefinition["shape"],
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  overrides: Partial<Omit<ScenePrimitiveDefinition, "id" | "kind" | "material" | "shape" | "size" | "color" | "transform">> & {
    readonly rotation?: SceneVector3;
  } = {},
): void {
  const { rotation, ...rest } = overrides;
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation },
    ...rest,
  });
}

const terrain = group("terrain", "Flat irregular island substrate", "earth");
const turf = group("turf", "Airfield grass cover", "grass");
const shoreline = group("shoreline", "Reclaimed island riprap edge", "stone");
const pavement = group("pavement", "Runway apron taxiway and roads", "asphalt");
const markings = group("markings", "Runway and apron paint", "plaster", "mounted");
const terminalStructure = group("terminal-structure", "Terminal load-bearing frame", "concrete");
const terminalEnvelope = group("terminal-envelope", "Terminal climate envelope", "sheetMetal");
const terminalGlass = group("terminal-glass", "Terminal glazing and doors", "glass", "mounted");
const terminalInterior = group("terminal-interior", "Terminal public interior", "wood");
const terminalLighting = group("terminal-lighting", "Terminal physical light fixtures", "steel", "mounted");
const tower = group("control-tower", "Air traffic control tower", "concrete");
const hangar = group("maintenance-hangar", "Maintenance hangar", "steel");
const fireStation = group("fire-station", "Airport fire station", "concrete");
const airfield = group("airfield-equipment", "Airfield lighting and equipment", "steel", "mounted");
const landside = group("landside", "Parking access and street furniture", "concrete");
const fuelFarm = group("fuel-farm", "Fuel farm and service yard", "steel");
const airfieldLife = group("airfield-life", "Ground handling and rescue equipment", "steel");
const beaconRotor = group("tower-beacon-rotor", "Rotating airport beacon head", "steel");

const GROUND_BOTTOM = -4.2;
const GROUND_STEP = 6;
const PAVING_CLEARANCE = GROUND_STEP / 2 + 0.1;

function pavedAt(x: number, z: number): boolean {
  return airportInsideRectangle(x, z, AIRPORT_RUNWAY.centreX, AIRPORT_RUNWAY.centreZ, AIRPORT_RUNWAY.length + 4, AIRPORT_RUNWAY.width + 4, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_RUNWAY_08.centreX, AIRPORT_RUNWAY_08.centreZ, AIRPORT_RUNWAY_08.length + 4, AIRPORT_RUNWAY_08.width + 4, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_TAXI_LINKS.eastX, (AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY_08.centreZ) / 2, AIRPORT_TAXI_LINKS.width, Math.abs(AIRPORT_RUNWAY.centreZ - AIRPORT_RUNWAY_08.centreZ), PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_TAXI_LINKS.westX, (AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY_08.centreZ) / 2, AIRPORT_TAXI_LINKS.width, Math.abs(AIRPORT_RUNWAY.centreZ - AIRPORT_RUNWAY_08.centreZ), PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 44, -12.75, 24, 4.5, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, -88, -76, 24, 6, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_APRON.centre[0], AIRPORT_APRON.centre[1], AIRPORT_APRON.width, AIRPORT_APRON.depth, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_TAXIWAY.centre[0], AIRPORT_TAXIWAY.centre[1], AIRPORT_TAXIWAY.width, AIRPORT_TAXIWAY.length, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 8, 39, 88, 9, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, -43, 46.25, 33, 8.5, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 55, 46, 23, 8, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 68.5, 34.75, 5, 15.5, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 74, 27, 6, 5, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_TERMINAL.origin[0], AIRPORT_TERMINAL.origin[2], AIRPORT_TERMINAL.width, AIRPORT_TERMINAL.depth, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 61, 13, 27, 25, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, -58, 15, 24, 17, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, 64.5, 2, 22, 21, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, -58, 3, 24, 13, PAVING_CLEARANCE) ||
    airportInsideRectangle(x, z, AIRPORT_FUEL_FARM.centre[0], AIRPORT_FUEL_FARM.centre[1], 25, 12, PAVING_CLEARANCE);
}

for (let x = -117; x <= 117; x += GROUND_STEP) {
  for (let z = -87; z <= 57; z += GROUND_STEP) {
    const halfTile = GROUND_STEP / 2;
    const cornersInside = [-1, 1].every((sideX) =>
      [-1, 1].every((sideZ) =>
        airportPointInShoreline(x + sideX * halfTile, z + sideZ * halfTile)
      )
    );
    if (!cornersInside || airportDistanceToShoreline(x, z) < halfTile) continue;
    primitive(
      terrain,
      `earth:${x}:${z}`,
      "earth",
      "groundTile",
      [x, GROUND_BOTTOM / 2, z],
      [GROUND_STEP, -GROUND_BOTTOM, GROUND_STEP],
      (x + z) % 18 === 0 ? "#665642" : "#5b4c3b",
      { foundation: true, carriesAttachments: true },
    );
    if (!pavedAt(x, z)) {
      primitive(
        turf,
        `grass:${x}:${z}`,
        "grass",
        "groundTile",
        [x, 0.07, z],
        [GROUND_STEP, 0.14, GROUND_STEP],
        (x - z) % 24 === 0 ? "#718556" : "#687d50",
        { carriesAttachments: true, volume: GROUND_STEP * GROUND_STEP * 0.14 },
      );
    }
  }
}

// A reclaimed-airfield riprap belt follows the exact non-radial boundary.
// Each block is a foundation root: the engineered shore does not borrow a
// hidden support path from whichever six-metre earth cell happens to be near.
for (let segment = 0; segment < ISLAND_AIRPORT_SHORELINE.length; segment += 1) {
  const [ax, az] = ISLAND_AIRPORT_SHORELINE[segment];
  const [bx, bz] = ISLAND_AIRPORT_SHORELINE[(segment + 1) % ISLAND_AIRPORT_SHORELINE.length];
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const count = Math.ceil(length / 3.2);
  const blockLength = length / count;
  const yaw = -Math.atan2(dz, dx);
  for (let block = 0; block < count; block += 1) {
    const t = (block + 0.5) / count;
    const edgeX = ax + dx * t;
    const edgeZ = az + dz * t;
    const inwardX = -dz / length;
    const inwardZ = dx / length;
    const x = edgeX + inwardX * 1.05;
    const z = edgeZ + inwardZ * 1.05;
    primitive(
      shoreline,
      `riprap:${segment}:${block}`,
      "stone",
      "stoneBlock",
      [x, -0.48 - (block % 3) * 0.04, z],
      [blockLength + 0.12, 1.35, 2.45],
      block % 3 === 0 ? "#68635a" : block % 3 === 1 ? "#5c5953" : "#747068",
      { rotation: [0, yaw, (block % 2 ? 0.025 : -0.02)], foundation: true, volume: blockLength * 2.3 },
    );
  }
}

function slabStrip(
  id: string,
  centre: SceneVector3,
  totalLength: number,
  width: number,
  alongX = true,
  color = "#34383b",
): void {
  const segmentLength = 6;
  const count = Math.ceil(totalLength / segmentLength);
  const actual = totalLength / count;
  for (let index = 0; index < count; index += 1) {
    const offset = -totalLength / 2 + actual * (index + 0.5);
    primitive(
      pavement,
      `${id}:${index}`,
      "asphalt",
      "groundTile",
      alongX ? [centre[0] + offset, centre[1], centre[2]] : [centre[0], centre[1], centre[2] + offset],
      alongX ? [actual, 0.22, width] : [width, 0.22, actual],
      index % 7 === 0 ? "#383c3f" : color,
      { carriesAttachments: true, volume: actual * width * 0.22 },
    );
  }
}

slabStrip("runway", [AIRPORT_RUNWAY.centreX, AIRPORT_RUNWAY.surfaceY, AIRPORT_RUNWAY.centreZ], AIRPORT_RUNWAY.length, AIRPORT_RUNWAY.width);
slabStrip("runway-08", [AIRPORT_RUNWAY_08.centreX, AIRPORT_RUNWAY_08.surfaceY, AIRPORT_RUNWAY_08.centreZ], AIRPORT_RUNWAY_08.length, AIRPORT_RUNWAY_08.width);
// Перемычки идут ВДОЛЬ Z: totalLength — пролёт между полосами, width — их x-габарит.
const TAXI_LINK_SPAN = Math.abs(AIRPORT_RUNWAY.centreZ - AIRPORT_RUNWAY_08.centreZ) - AIRPORT_RUNWAY.width;
slabStrip("taxi-link-east", [AIRPORT_TAXI_LINKS.eastX, 0.18, (AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY_08.centreZ) / 2], TAXI_LINK_SPAN, AIRPORT_TAXI_LINKS.width, false);
slabStrip("taxi-link-west", [AIRPORT_TAXI_LINKS.westX, 0.18, (AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY_08.centreZ) / 2], TAXI_LINK_SPAN, AIRPORT_TAXI_LINKS.width, false);
slabStrip("apron", [AIRPORT_APRON.centre[0], 0.18, AIRPORT_APRON.centre[1]], AIRPORT_APRON.width, AIRPORT_APRON.depth);
slabStrip("taxiway", [AIRPORT_TAXIWAY.centre[0], 0.18, AIRPORT_TAXIWAY.centre[1]], AIRPORT_TAXIWAY.length, AIRPORT_TAXIWAY.width, false);
slabStrip("landside-loop", [8, 0.18, 39], 88, 7);
slabStrip("west-parking", [-43, 0.18, 46.25], 32, 7.5);
slabStrip("east-parking", [55, 0.18, 46], 22, 7);
slabStrip("fuel-service-road", [68.5, 0.18, 34.75], 15.5, 5, false);
slabStrip("fuel-service-yard-entry", [74, 0.18, 27], 6, 5);
slabStrip("hangar-apron", [64.5, 0.18, 2], 22, 21);
slabStrip("fire-apron", [-58, 0.18, 3], 24, 13);

function paint(
  id: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  color = "#f4f2df",
  rotation?: SceneVector3,
): void {
  // ── РАЗМЕТКА ПЛОСКАЯ, КАК НАСТОЯЩАЯ ─────────────────────────────────────
  //
  // Трёхсантиметровая плитка краски — это бордюр: колесо на рулении спотыкалось
  // о кромочную полосу, пересекающую устье перемычки, а колесо-якорь на
  // развороте соскальзывало с её ребра (замер Igor, 15.08.2026). Восемь
  // миллиметров колесо радиусом полметра не замечает, а глаз читает как
  // прежде: низ плитки лежит на бетоне (0.29), верх — 0.298.
  primitive(markings, id, "plaster", "groundTile", [x, 0.294, z], [width, 0.008, depth], color, {
    rotation,
    bearsLoad: false,
    // Paint is a visual/material layer, not an 8 mm Rapier kerb. `bearsLoad`
    // only affects the structural graph; without this flag the quiet-world
    // collider still presented every marking to the landing-gear ray as a
    // real step.
    intactCollider: false,
    volume: width * depth * 0.008,
    contactBearingOrder: true,
  });
}

for (let x = -96; x <= 72; x += 12) paint(`centreline:${x}`, x, AIRPORT_RUNWAY.centreZ, 5.4, 0.28);
for (const side of [-1, 1]) {
  paint(`runway-edge:${side}`, AIRPORT_RUNWAY.centreX, AIRPORT_RUNWAY.centreZ + side * (AIRPORT_RUNWAY.width / 2 - 0.35), AIRPORT_RUNWAY.length - 4, 0.22);
  for (let stripe = 0; stripe < 6; stripe += 1) {
    paint(
      `threshold-west:${side}:${stripe}`,
      AIRPORT_RUNWAY.westThresholdX + AIRPORT_RUNWAY.thresholdInset,
      AIRPORT_RUNWAY.centreZ + side * (1.15 + stripe * 0.82),
      5.8,
      0.42,
    );
    paint(
      `threshold-east:${side}:${stripe}`,
      AIRPORT_RUNWAY.eastThresholdX - AIRPORT_RUNWAY.thresholdInset,
      AIRPORT_RUNWAY.centreZ + side * (1.15 + stripe * 0.82),
      5.8,
      0.42,
    );
  }
}
paint("aiming-west:north", -54, AIRPORT_RUNWAY.centreZ - 2.8, 9, 1.1);
paint("aiming-west:south", -54, AIRPORT_RUNWAY.centreZ + 2.8, 9, 1.1);
paint("aiming-east:north", 54, AIRPORT_RUNWAY.centreZ - 2.8, 9, 1.1);
paint("aiming-east:south", 54, AIRPORT_RUNWAY.centreZ + 2.8, 9, 1.1);

const digitSegments = {
  0: ["a", "b", "c", "d", "e", "f"],
  2: ["a", "b", "d", "e", "g"],
  7: ["a", "b", "c"],
  9: ["a", "b", "c", "d", "f", "g"],
} as const;
const digitSegmentGeometry = {
  a: [3.1, 0, 0.5, 2.8],
  b: [1.55, 1.5, 2.6, 0.45],
  c: [-1.55, 1.5, 2.6, 0.45],
  d: [-3.1, 0, 0.5, 2.8],
  e: [-1.55, -1.5, 2.6, 0.45],
  f: [1.55, -1.5, 2.6, 0.45],
  g: [0, 0, 0.5, 2.8],
} as const;

function runwayDigit(id: string, digit: keyof typeof digitSegments, x: number, z: number, facing: -1 | 1): void {
  for (const segment of digitSegments[digit]) {
    const [along, across, width, depth] = digitSegmentGeometry[segment];
    paint(`runway-number:${id}:${segment}`, x + along * facing, z + across * facing, width, depth);
  }
}

runwayDigit("09:0", 0, -66, AIRPORT_RUNWAY.centreZ - 2.2, 1);
runwayDigit("09:9", 9, -66, AIRPORT_RUNWAY.centreZ + 2.2, 1);
runwayDigit("27:2", 2, 66, AIRPORT_RUNWAY.centreZ + 2.2, -1);
runwayDigit("27:7", 7, 66, AIRPORT_RUNWAY.centreZ - 2.2, -1);
// Touchdown rubber and maintenance patches break the computer-clean runway
// without turning every six-metre slab into a different asphalt swatch.
for (const end of [-1, 1]) for (const side of [-1, 1]) for (let mark = 0; mark < 5; mark += 1) {
  paint(`rubber:${end}:${side}:${mark}`, end * (43 + mark * 2.1), AIRPORT_RUNWAY.centreZ + side * (0.9 + (mark % 2) * 0.35), 1.8, 0.16, "#202426", [0, side * 0.04, 0]);
}
paint("repair-patch:west", -22, AIRPORT_RUNWAY.centreZ + 3.9, 12, 2.3, "#292e31", [0, 0.03, 0]);
paint("repair-patch:east", 35, AIRPORT_RUNWAY.centreZ - 3.5, 8, 1.7, "#292e31", [0, -0.025, 0]);
paint("taxiway-centre", 18, -12.75, 0.25, 4.5, "#e1bc34");
paint("hold-short:north", 18, -13.1, 11, 0.22, "#e1bc34");
paint("hold-short:south", 18, -13.7, 11, 0.22, "#e1bc34");
for (const stand of AIRPORT_APRON.stands) {
  paint(`stand-line:${stand.id}`, stand.x, 1.5, 0.22, 15, "#e1bc34");
  paint(`stand-stop:${stand.id}`, stand.x, 7.1, stand.role === "heritage" ? 7 : 5, 0.22, "#e1bc34");
}
for (const [index, x, z, rotation] of [[0, -18, -0.4, -0.18], [1, 48, 1.8, 0.22]] as const) {
  paint(`taxi-arc:${index}`, x, z, 12, 0.2, "#d8af39", [0, rotation, 0]);
}

const terminalHalfWidth = AIRPORT_TERMINAL.width / 2;
const bayWidth = AIRPORT_TERMINAL.bayWidth;
const firstBayX = AIRPORT_TERMINAL.origin[0] - terminalHalfWidth + bayWidth / 2;

for (let bay = 0; bay < AIRPORT_TERMINAL.bayCount; bay += 1) {
  const x = firstBayX + bay * bayWidth;
  primitive(terminalStructure, `foundation:${bay}`, "concrete", "groundTile", [x, 0.2, 20], [bayWidth, 0.4, 20], "#9da2a3", {
    foundation: true,
    carriesAttachments: true,
    bearingArea: 18,
  });
  primitive(terminalInterior, `floor:${bay}`, "stone", "groundTile", [x, 0.43, 20], [bayWidth, 0.06, 19.6], bay % 2 === 0 ? "#c6c3bb" : "#bdbab2", {
    carriesAttachments: true,
    bearingArea: 12,
    contactBearingOrder: true,
    textureProfile: "city-gray-pavers",
  });
}

for (let frame = 0; frame <= AIRPORT_TERMINAL.bayCount; frame += 1) {
  const x = AIRPORT_TERMINAL.origin[0] - terminalHalfWidth + frame * bayWidth;
  for (const z of [AIRPORT_TERMINAL.airsideZ, AIRPORT_TERMINAL.landsideZ]) {
    primitive(terminalStructure, `column:${frame}:${z}`, "steel", "plank", [x, 3.35, z], [0.46, 5.9, 0.46], "#aeb8bd", {
      carriesAttachments: true,
      textureProfile: "matte-aluminium",
    });
  }
  primitive(terminalStructure, `roof-beam:${frame}`, "steel", "plank", [x, 6.18, 20], [0.36, 0.42, 20.4], "#8e999f", {
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    textureProfile: "matte-aluminium",
  });
}

function facadeBay(side: "airside" | "landside", bay: number, doorway: boolean): void {
  const z = side === "airside" ? AIRPORT_TERMINAL.airsideZ : AIRPORT_TERMINAL.landsideZ;
  const x = firstBayX + bay * bayWidth;
  primitive(terminalEnvelope, `${side}:header:${bay}`, "sheetMetal", "panel", [x, 5.85, z], [bayWidth - 0.46, 0.9, 0.3], "#dbe1e2", {
    bearsLoad: false,
    textureProfile: "painted-steel",
    volume: 0.28,
  });
  if (!doorway) {
    primitive(terminalEnvelope, `${side}:sill:${bay}`, "concrete", "panel", [x, 0.95, z], [bayWidth - 0.46, 1.1, 0.34], "#9da5a6", {
      carriesAttachments: true,
      volume: 0.5,
    });
    primitive(terminalGlass, `${side}:window:${bay}`, "glass", "glassPane", [x, 3.45, z], [bayWidth - 0.72, 3.9, 0.12], "#83aeb8", {
      bearsLoad: false,
      volume: 0.12,
    });
  } else {
    const pierWidth = (bayWidth - 4) / 2;
    for (const sign of [-1, 1]) {
      primitive(terminalEnvelope, `${side}:door-pier:${bay}:${sign}`, "concrete", "panel", [x + sign * (2 + pierWidth / 2), 2.95, z], [pierWidth, 4.9, 0.34], "#a8adae", {
        carriesAttachments: true,
        volume: pierWidth * 1.4,
      });
      // Breakable automatic leaves start closed and use the shared kinematic
      // door owner. The hinge frame supplies the outward and slide axes.
      primitive(terminalGlass, `${side}:door:${bay}:${sign}`, "glass", "glassPane", [x + sign * 0.5, 1.93, z], [0.96, 3.0, 0.11], "#9dc1c8", {
        bearsLoad: false,
        volume: 0.04,
        hinge: {
          pivot: [x + sign * 0.5, 1.93, z],
          direction: [sign, 0, 0],
          normal: [0, 0, side === "landside" ? 1 : -1],
        },
      });
    }
    primitive(terminalGlass, `${side}:transom:${bay}`, "glass", "glassPane", [x, 4.4, z], [3.92, 2, 0.11], "#83aeb8", {
      bearsLoad: false,
      volume: 0.05,
    });
  }
  for (const offset of [-1, 1]) {
    primitive(terminalEnvelope, `${side}:mullion:${bay}:${offset}`, "steel", "plank", [x + offset * bayWidth / 4, 3.45, z - (side === "airside" ? -0.08 : 0.08)], [0.1, 3.9, 0.12], "#5f6b70", {
      bearsLoad: false,
      textureProfile: "matte-aluminium",
      volume: 0.02,
    });
  }
}

for (let bay = 0; bay < AIRPORT_TERMINAL.bayCount; bay += 1) {
  facadeBay("airside", bay, bay === 2 || bay === 5);
  facadeBay("landside", bay, bay === 3 || bay === 4);
  const x = firstBayX + bay * bayWidth;
  for (const [zone, z, depth] of [["south", 14, 8], ["north", 26, 8]] as const) {
    primitive(terminalEnvelope, `roof:${zone}:${bay}`, "sheetMetal", "steelSheet", [x, 6.5, z], [bayWidth, 0.18, depth], "#dfe4e4", {
      bearsLoad: false,
      textureProfile: "painted-steel",
      volume: bayWidth * depth * 0.035,
      contactBearingOrder: true,
    });
    primitive(terminalStructure, `roof-riser:${zone}:${bay}`, "steel", "plank", [x - bayWidth / 2 + 0.18, 6.96, zone === "south" ? 17.9 : 22.1], [0.16, 0.92, 0.18], "#66757b", {
      carriesAttachments: true,
      attachmentSupportMode: "hinge",
      textureProfile: "matte-aluminium",
    });
  }
  // A raised continuous lantern gives the low terminal a wind-scooped civic
  // silhouette without competing with the control tower.
  for (const side of [-1, 1]) {
    primitive(terminalGlass, `clerestory:${bay}:${side}`, "glass", "glassPane", [x, 6.92, 20 + side * 1.82], [bayWidth, 0.9, 0.12], "#9fc2c8", {
      bearsLoad: false,
      volume: 0.05,
    });
  }
  primitive(terminalGlass, `skylight:${bay}`, "glass", "glassPane", [x, 7.42, 20], [bayWidth, 0.18, 3.72], "#b7d0d2", {
    bearsLoad: false,
    volume: 0.08,
    contactBearingOrder: true,
  });
  primitive(terminalStructure, `clerestory-frame:${bay}`, "steel", "plank", [x - bayWidth / 2 + 0.18, 6.94, 20], [0.16, 1.06, 3.9], "#66757b", {
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    textureProfile: "matte-aluminium",
  });
}

for (const side of [-1, 1]) {
  const x = AIRPORT_TERMINAL.origin[0] + side * terminalHalfWidth;
  for (const segment of [-1, 1]) {
    primitive(terminalEnvelope, `end-wall:${side}:${segment}`, "concrete", "panel", [x, 3.35, 20 + segment * 5], [0.38, 5.9, 10], segment < 0 ? "#aeb5b5" : "#9fa8a9", {
      carriesAttachments: true,
      volume: 4.8,
    });
  }
}

// Landside entrance canopy: a visible wall beam, cantilevers, edge and roof.
for (const x of [-4, 8, 20]) {
  primitive(terminalStructure, `canopy-arm:${x}`, "steel", "plank", [x, 4.15, 32.2], [0.2, 0.25, 4.4], "#66757b", {
    carriesAttachments: true,
    textureProfile: "matte-aluminium",
  });
  primitive(terminalStructure, `canopy-post:${x}`, "steel", "plank", [x, 2.2, 34.3], [0.22, 4, 0.22], "#66757b", {
    textureProfile: "matte-aluminium",
  });
}
primitive(terminalEnvelope, "canopy-roof", "sheetMetal", "steelSheet", [8, 4.42, 32.2], [26, 0.18, 4.8], "#d8dfe0", {
  bearsLoad: false,
  textureProfile: "painted-steel",
  volume: 2.4,
});
primitive(terminalEnvelope, "canopy-edge", "sheetMetal", "panel", [8, 4.25, 34.58], [26.4, 0.42, 0.16], "#e96537", {
  bearsLoad: false,
  textureProfile: "painted-steel",
  volume: 0.18,
});

// Two coloured floor lines make arrivals and departures legible at walking
// height, instead of relying on furniture placement alone.
for (const [id, x, color] of [["arrivals", 4.75, "#4b91aa"], ["departures", 11.25, "#d9ad3f"]] as const) {
  primitive(terminalInterior, `wayfinding:${id}`, "plastic", "groundTile", [x, 0.475, 20], [0.22, 0.025, 18.4], color, { bearsLoad: false, contactBearingOrder: true, volume: 0.02 });
}

function counter(id: string, x: number, z: number, yaw = 0): void {
  primitive(terminalInterior, `${id}:base`, "wood", "panel", [x, 1.02, z], [2.6, 1.15, 0.75], "#907052", { rotation: [0, yaw, 0], carriesAttachments: true });
  primitive(terminalInterior, `${id}:top`, "wood", "plank", [x, 1.64, z], [2.9, 0.12, 0.92], "#bd9a72", { rotation: [0, yaw, 0] });
  primitive(terminalInterior, `${id}:screen`, "darkGlass", "glassPane", [x, 2.15, z - 0.22], [0.85, 0.65, 0.08], "#20384a", { rotation: [0, yaw, 0], bearsLoad: false, volume: 0.02 });
}

for (let index = 0; index < 4; index += 1) counter(`checkin:${index}`, -12 + index * 4.2, 25.4);

// Security lanes leave two 2.1 m clear channels through the hall.
for (const laneX of [5, 10.5]) {
  for (const side of [-1, 1]) {
    primitive(terminalInterior, `security:${laneX}:rail:${side}`, "steel", "plank", [laneX + side * 1.12, 0.9, 20.8], [0.08, 1.05, 5.8], "#808b90", { carriesAttachments: true });
  }
  primitive(terminalInterior, `security:${laneX}:arch-left`, "steel", "plank", [laneX - 1.08, 1.55, 18.2], [0.16, 2.3, 0.2], "#8f9da2");
  primitive(terminalInterior, `security:${laneX}:arch-right`, "steel", "plank", [laneX + 1.08, 1.55, 18.2], [0.16, 2.3, 0.2], "#8f9da2");
  primitive(terminalInterior, `security:${laneX}:arch-head`, "steel", "plank", [laneX, 2.65, 18.2], [2.32, 0.16, 0.2], "#8f9da2");
}

function seatRow(id: string, x: number, z: number): void {
  primitive(terminalInterior, `${id}:beam`, "steel", "plank", [x, 0.63, z], [5.4, 0.15, 0.18], "#556166", { carriesAttachments: true });
  for (let seat = 0; seat < 4; seat += 1) {
    const sx = x - 2.05 + seat * 1.36;
    primitive(terminalInterior, `${id}:seat:${seat}`, "plastic", "panel", [sx, 0.92, z], [1.08, 0.12, 0.92], seat % 2 ? "#557b8d" : "#4b7084", { rotation: [-0.08, 0, 0], carriesAttachments: true, attachmentSupportMode: "hinge" });
    primitive(terminalInterior, `${id}:back:${seat}`, "plastic", "panel", [sx, 1.45, z + 0.42], [1.08, 1.02, 0.12], seat % 2 ? "#557b8d" : "#4b7084", { bearsLoad: false });
  }
  for (const sx of [x - 2.4, x + 2.4]) primitive(terminalInterior, `${id}:leg:${sx}`, "steel", "plank", [sx, 0.42, z], [0.12, 0.7, 0.12], "#596469");
}

seatRow("gate-seats:a", 21, 15.7);
seatRow("gate-seats:b", 21, 18.4);
seatRow("gate-seats:c", 28, 15.7);

// Baggage carousel: faceted loop around a real empty centre.
for (let index = 0; index < 16; index += 1) {
  const angle = (index / 16) * Math.PI * 2;
  primitive(terminalInterior, `carousel:${index}`, "steel", "plank", [23 + Math.cos(angle) * 5, 0.82, 25.3 + Math.sin(angle) * 2.2], [2.05, 0.18, 0.72], "#5e6669", {
    rotation: [0, -angle + Math.PI / 2, 0],
    bearsLoad: false,
    volume: 0.08,
  });
}

// Partitions produce actual rooms while preserving the two public north-south routes.
// The baggage wall has a real belt opening rather than a conveyor painted onto it.
primitive(terminalInterior, "baggage-wall:south", "concrete", "panel", [31.5, 2.15, 21.75], [0.3, 3.4, 3.3], "#c5c7c5", { carriesAttachments: true });
primitive(terminalInterior, "baggage-wall:north", "concrete", "panel", [31.5, 2.15, 28.25], [0.3, 3.4, 3.3], "#c5c7c5", { carriesAttachments: true });
primitive(terminalInterior, "baggage-feed:bed", "steel", "plank", [31, 0.72, 25.3], [6, 0.22, 1.15], "#596469", { carriesAttachments: true });
for (let slat = 0; slat < 8; slat += 1) {
  primitive(terminalInterior, `baggage-feed:slat:${slat}`, "plastic", "plank", [28.45 + slat * 0.73, 0.88, 25.3], [0.62, 0.08, 1.02], "#272c2e", { bearsLoad: false, volume: 0.025 });
}
primitive(terminalInterior, "service-wall-west", "concrete", "panel", [-15, 2.15, 19], [0.3, 3.4, 8], "#c5c7c5", { carriesAttachments: true });
counter("cafe", -10.5, 14.2, Math.PI);

// A compact WC core occupies the west service bay; the recessed entrance is
// kept off both security routes and remains visibly traversable.
primitive(terminalInterior, "wc:east-wall", "concrete", "panel", [-11.65, 2.05, 21.2], [0.22, 3.2, 5.6], "#c5c7c5", { carriesAttachments: true });
primitive(terminalInterior, "wc:front-left", "concrete", "panel", [-16.45, 2.05, 18.45], [2.4, 3.2, 0.22], "#c5c7c5", { carriesAttachments: true });
primitive(terminalInterior, "wc:front-right", "concrete", "panel", [-12.65, 2.05, 18.45], [1.8, 3.2, 0.22], "#c5c7c5", { carriesAttachments: true });
primitive(terminalInterior, "wc:sign", "darkGlass", "glassPane", [-14.55, 3.2, 18.3], [1.05, 0.52, 0.06], "#28516a", { bearsLoad: false, volume: 0.01 });
for (const [index, x] of [[0, -16.3], [1, -13.6]] as const) {
  primitive(terminalInterior, `wc:cubicle:${index}`, "plastic", "panel", [x + 1.2, 1.45, 22.6], [0.1, 2.3, 2.2], "#d8dcda", { carriesAttachments: true });
  primitive(terminalInterior, `wc:fixture:${index}:base`, "stone", "cylinder", [x, 0.72, 22.45], [0.78, 0.72, 0.92], "#e4e4df", { carriesAttachments: true });
  primitive(terminalInterior, `wc:fixture:${index}:tank`, "stone", "panel", [x, 1.12, 22.82], [0.8, 0.68, 0.24], "#e4e4df", { bearsLoad: false, volume: 0.08 });
}

// Gate desks sit beside, not across, the two airside door approaches.
counter("gate-desk:west", -8.5, 13.2, Math.PI);
counter("gate-desk:east", 27.5, 13.2, Math.PI);

// Departure board: opaque carrier, frame, non-emissive display glass and small status lamps.
for (const x of [6, 10]) {
  primitive(terminalInterior, `departures-post:${x}`, "steel", "plank", [x, 2.35, 23.8], [0.14, 3.8, 0.14], "#596469", { carriesAttachments: true, attachmentSupportMode: "hinge" });
}
primitive(terminalInterior, "departures-carrier", "steel", "panel", [8, 4.35, 23.8], [5.8, 1.75, 0.18], "#465158", { carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.25 });
primitive(terminalInterior, "departures-screen", "darkGlass", "glassPane", [8, 4.35, 23.68], [5.35, 1.35, 0.07], "#19364b", { bearsLoad: false, volume: 0.03, sideAttachmentReach: 0.2 });
for (let row = 0; row < 4; row += 1) {
  primitive(terminalInterior, `departures-status:${row}`, "glass", "glassPane", [5.7, 4.77 - row * 0.28, 23.62], [0.18, 0.1, 0.04], row === 3 ? "#f08a80" : "#7fe6a0", { bearsLoad: false, volume: 0.001, sideAttachmentReach: 0.2 });
}

// Complete hanging fixture chain: roof beam -> stem -> housing -> clear lens -> bulb/light.
for (let row = 0; row < 2; row += 1) {
  for (let column = 0; column < 4; column += 1) {
    const x = -11.5 + column * 13;
    const z = 15.5 + row * 9;
    const fixture = `fixture:${row}:${column}`;
    primitive(terminalLighting, `${fixture}:stem`, "steel", "cylinder", [x, 5.55, z], [0.08, 1.25, 0.08], "#4d585c", { carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.28, volume: 0.01 });
    primitive(terminalLighting, `${fixture}:housing`, "steel", "cylinder", [x, 4.92, z], [0.62, 0.22, 0.62], "#3f494d", { carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.18, volume: 0.03 });
    primitive(terminalLighting, `${fixture}:lens`, "glass", "cylinder", [x, 4.73, z], [0.48, 0.28, 0.48], "#d9e4df", { bearsLoad: true, carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.18, volume: 0.02 });
    primitive(terminalLighting, `${fixture}:bulb`, "glass", "sphere", [x, 4.74, z], [0.16, 0.16, 0.16], "#f4f1e2", {
      bearsLoad: false,
      sideAttachmentReach: 0.18,
      volume: 0.002,
      light: {
        color: "#ffe7bd",
        distance: 13,
        intensity: 3.4,
        dayIntensityFactor: 0.28,
        poolPriority: 2.1,
        localPoolCapacity: 8,
        poolGroupId: "airport-terminal-hall",
        reservePoolGroup: column === 1 && row === 0,
        interior: true,
        transition: { fadeInSeconds: 0.28, fadeOutSeconds: 0.24 },
      },
    });
  }
}

const [towerX, towerZ] = AIRPORT_CONTROL_TOWER.centre;
primitive(tower, "foundation", "concrete", "groundTile", [towerX, 0.2, towerZ], [7.2, 0.4, 7.2], "#8f9798", { foundation: true, carriesAttachments: true });
for (const side of [-1, 1]) {
  primitive(tower, `shaft-x:${side}`, "concrete", "panel", [towerX + side * 2.85, 5.5, towerZ], [0.5, 10.2, 6], "#abb1b1", { carriesAttachments: true });
  if (side > 0) {
    primitive(tower, `shaft-z:${side}`, "concrete", "panel", [towerX, 5.5, towerZ + side * 2.85], [5.7, 10.2, 0.5], "#9da5a6", { carriesAttachments: true });
  } else {
    for (const jamb of [-1, 1]) primitive(tower, `shaft-z:${side}:jamb:${jamb}`, "concrete", "panel", [towerX + jamb * 1.95, 5.5, towerZ - 2.85], [1.8, 10.2, 0.5], "#9da5a6", { carriesAttachments: true });
    primitive(tower, `shaft-z:${side}:lintel`, "concrete", "panel", [towerX, 7.2, towerZ - 2.85], [2.1, 6.8, 0.5], "#9da5a6", { carriesAttachments: true });
    primitive(tower, "service-door", "sheetMetal", "steelSheet", [towerX, 1.75, towerZ - 2.9], [1.8, 2.7, 0.14], "#586b70", { bearsLoad: false, carriesAttachments: true, textureProfile: "painted-steel", volume: 0.18 });
  }
}
primitive(tower, "cab-floor", "steel", "groundTile", [towerX, 10.8, towerZ], [8.8, 0.32, 8.8], "#6c7579", { carriesAttachments: true, bearingArea: 10 });
for (const side of [-1, 1]) {
  primitive(tower, `cab-glass-x:${side}`, "glass", "glassPane", [towerX + side * 4.15, 12.35, towerZ], [0.14, 2.65, 7.8], "#789eaa", { bearsLoad: false, volume: 0.16 });
  primitive(tower, `cab-glass-z:${side}`, "glass", "glassPane", [towerX, 12.35, towerZ + side * 4.15], [8.1, 2.65, 0.14], "#789eaa", { bearsLoad: false, volume: 0.16 });
}
for (const xOffset of [-4.1, 4.1]) for (const zOffset of [-4.1, 4.1]) {
  primitive(tower, `cab-post:${xOffset}:${zOffset}`, "steel", "plank", [towerX + xOffset, 12.35, towerZ + zOffset], [0.22, 2.7, 0.22], "#5b666a", { carriesAttachments: true });
}
primitive(tower, "cab-roof", "sheetMetal", "steelSheet", [towerX, AIRPORT_CONTROL_TOWER.roofY, towerZ], [9.3, 0.26, 9.3], "#d7dddd", { carriesAttachments: true, attachmentSupportMode: "hinge", textureProfile: "painted-steel", volume: 2.1 });
primitive(tower, "beacon-mast", "steel", "cylinder", [towerX, 15.05, towerZ], [0.16, 2.2, 0.16], "#596367", { carriesAttachments: true });
primitive(beaconRotor, "beacon-crossbar", "steel", "plank", [towerX, 16.22, towerZ], [1.35, 0.12, 0.12], "#596367", { carriesAttachments: true, volume: 0.01 });
primitive(beaconRotor, "beacon-lens", "glass", "cylinder", [towerX + 0.62, 16.22, towerZ], [0.46, 0.24, 0.46], "#f4f1e2", { bearsLoad: false, carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.2, volume: 0.02 });
primitive(beaconRotor, "beacon-bulb", "glass", "sphere", [towerX + 0.62, 16.22, towerZ], [0.16, 0.16, 0.16], "#f4f1e2", {
  bearsLoad: false,
  sideAttachmentReach: 0.2,
  volume: 0.002,
  light: { color: "#fff0cf", distance: 19, intensity: 4.2, poolPriority: 2.8, poolGroupId: "airport-tower", reservePoolGroup: true },
});

function portalBuilding(
  target: MutableGroup,
  id: string,
  centreX: number,
  centreZ: number,
  width: number,
  depth: number,
  height: number,
  doorCount: number,
  accent: string,
  openDoorIndex: number | null = null,
): void {
  primitive(target, `${id}:foundation`, "concrete", "groundTile", [centreX, 0.2, centreZ], [width, 0.4, depth], "#92999a", { foundation: true, carriesAttachments: true });
  const primaryMember = { carriesAttachments: true, maximumVerticalGap: 0.05 } as const;
  primitive(target, `${id}:rear`, "concrete", "panel", [centreX, height / 2 + 0.4, centreZ + depth / 2], [width, height, 0.4], "#aeb3b2", primaryMember);
  for (const side of [-1, 1]) primitive(target, `${id}:side:${side}`, "concrete", "panel", [centreX + side * width / 2, height / 2 + 0.4, centreZ], [0.4, height, depth], "#9fa7a7", primaryMember);
  const bay = width / doorCount;
  for (let index = 0; index < doorCount; index += 1) {
    const x = centreX - width / 2 + bay * (index + 0.5);
    if (index !== openDoorIndex) {
      primitive(target, `${id}:door:${index}`, "sheetMetal", "steelSheet", [x, height / 2, centreZ - depth / 2], [bay - 0.7, height - 0.8, 0.16], index % 2 ? accent : "#c9cecc", { bearsLoad: false, textureProfile: "painted-steel", volume: 0.5, maximumVerticalGap: 0.05 });
    } else {
      primitive(target, `${id}:door-open:${index}`, "sheetMetal", "steelSheet", [x, height - 0.14, centreZ - depth / 2 + 0.5], [bay - 0.7, 0.16, 1.0], accent, { bearsLoad: false, textureProfile: "painted-steel", volume: 0.18 });
    }
    if (index < doorCount - 1) primitive(target, `${id}:pier:${index}`, "steel", "plank", [x + bay / 2, height / 2 + 0.4, centreZ - depth / 2], [0.42, height, 0.42], "#606a6e", primaryMember);
  }
  for (let frame = 0; frame <= 4; frame += 1) {
    const x = centreX - width / 2 + (width * frame) / 4;
    primitive(target, `${id}:roof-frame:${frame}`, "steel", "plank", [x, height + 0.25, centreZ], [0.3, 0.36, depth + 0.2], "#616b6e", { carriesAttachments: true, maximumVerticalGap: 0.05 });
  }
  for (let bayIndex = 0; bayIndex < 4; bayIndex += 1) {
    const x = centreX - width / 2 + (width / 4) * (bayIndex + 0.5);
    primitive(target, `${id}:roof:${bayIndex}`, "sheetMetal", "steelSheet", [x, height + 0.52, centreZ], [width / 4, 0.22, depth + 0.6], "#d1d7d5", {
      bearsLoad: false,
      textureProfile: "painted-steel",
      volume: width * depth * 0.0075,
      contactBearingOrder: true,
      maximumVerticalGap: 0.05,
    });
  }
}

portalBuilding(hangar, "hangar", 61, 13, 26, 22, 8.2, 2, "#5f8190", 0);
portalBuilding(fireStation, "fire", -58, 15, 22, 14, 5.8, 3, "#c94135", 1);

// Ground-side life establishes scale before aircraft arrive.
function serviceCart(id: string, x: number, z: number, color: string): void {
  primitive(airfieldLife, `${id}:deck`, "steel", "panel", [x, 0.72, z], [3.1, 0.34, 1.35], color, { carriesAttachments: true, textureProfile: "painted-steel" });
  for (const sx of [-1.1, 1.1]) for (const sz of [-0.62, 0.62]) {
    primitive(airfieldLife, `${id}:wheel:${sx}:${sz}`, "plastic", "cylinder", [x + sx, 0.39, z + sz], [0.42, 0.18, 0.42], "#202426", { rotation: [Math.PI / 2, 0, 0], bearsLoad: false });
  }
}
serviceCart("baggage-cart:0", 38, 2.8, "#d6aa3d");
serviceCart("baggage-cart:1", 42, 3.6, "#557b8d");
primitive(airfieldLife, "rescue-tender:body", "steel", "panel", [-58, 1.35, 5.2], [5.2, 1.65, 2.2], "#d94735", { carriesAttachments: true, textureProfile: "painted-steel" });
primitive(airfieldLife, "rescue-tender:cab", "steel", "panel", [-59.4, 2.25, 5.2], [2.1, 1.15, 2.05], "#e65a42", { carriesAttachments: true, textureProfile: "painted-steel" });
for (const x of [-60, -56.5]) for (const z of [4.15, 6.25]) primitive(airfieldLife, `rescue-tender:wheel:${x}:${z}`, "plastic", "cylinder", [x, 0.62, z], [0.72, 0.26, 0.72], "#202426", { rotation: [Math.PI / 2, 0, 0], bearsLoad: false });
for (const [index, x, z] of [[0, 10, 7], [1, 17, 7], [2, 24, 7], [3, 45, 0]] as const) {
  primitive(airfieldLife, `cone:${index}:base`, "plastic", "panel", [x, 0.36, z], [0.72, 0.12, 0.72], "#252a2b", { carriesAttachments: true });
  primitive(airfieldLife, `cone:${index}:body`, "plastic", "cylinder", [x, 0.72, z], [0.4, 0.72, 0.4], "#e96537", { bearsLoad: false });
}

// Runway edge/threshold lights: base, housing, clear lens, contained signal bulb.
// Four taxi vertices are stationary-turn zones. No fixture may occupy the
// circle swept by the tail about the main gear; the link half-width is the
// authored clearance which already contains that sweep.
const taxiTurnCentres = [
  [AIRPORT_TAXI_LINKS.eastX, AIRPORT_RUNWAY.centreZ],
  [AIRPORT_TAXI_LINKS.eastX, AIRPORT_RUNWAY_08.centreZ],
  [AIRPORT_TAXI_LINKS.westX, AIRPORT_RUNWAY_08.centreZ],
  [AIRPORT_TAXI_LINKS.westX, AIRPORT_RUNWAY.centreZ],
] as const;
const airfieldFixtureFootprintRadius = Math.max(
  Math.hypot(0.38, 0.38) / 2,
  Math.hypot(0.44, 0.36) / 2,
);
// Check the fixture's full concrete footprint, not only its centre. Otherwise
// the two edge-light bases beside the eastern 09 turn begin on the swept-circle
// boundary even though their authored coordinates sit just outside it.
const taxiTurnClearance =
  AIRPORT_TAXI_LINKS.width / 2 + airfieldFixtureFootprintRadius;

function insideTaxiTurnSweep(x: number, z: number): boolean {
  return taxiTurnCentres.some(
    ([turnX, turnZ]) => Math.hypot(x - turnX, z - turnZ) <= taxiTurnClearance,
  );
}

function airfieldLight(id: string, x: number, z: number, color: string, height = 0.46): void {
  if (insideTaxiTurnSweep(x, z)) return;
  primitive(airfield, `${id}:base`, "concrete", "stoneBlock", [x, 0.18, z], [0.38, 0.4, 0.38], "#8d9391", { carriesAttachments: true, volume: 0.04 });
  primitive(airfield, `${id}:stem`, "steel", "cylinder", [x, 0.38 + height / 2, z], [0.08, height, 0.08], "#5e686b", {
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    sideAttachmentReach: 0.18,
    maximumVerticalGap: 0.035,
    volume: 0.004,
  });
  primitive(airfield, `${id}:lens`, "glass", "cylinder", [x, 0.48 + height / 2, z], [0.24, 0.18, 0.24], "#dce6df", { carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.18, volume: 0.006 });
  primitive(airfield, `${id}:bulb`, "glass", "sphere", [x, 0.48 + height / 2, z], [0.1, 0.1, 0.1], color, {
    bearsLoad: false,
    sideAttachmentReach: 0.18,
    volume: 0.001,
    light: {
      color,
      distance: id.startsWith("papi:") ? 8 : 6,
      intensity: id.startsWith("papi:") ? 2.8 : 2.2,
      dayIntensityFactor: 0.16,
      poolPriority: id.startsWith("papi:") ? 1.5 : 1.1,
      poolGroupId: id.startsWith("papi:") ? "airport-papi" : "airport-runway-edge",
      localPoolCapacity: id.startsWith("papi:") ? 8 : 18,
    },
  });
}

// ── ПОРОГОВЫЕ ОГНИ — ВРЕЗНЫЕ, КАК НА НАСТОЯЩЕЙ ПОЛОСЕ ──────────────────────
//
// Прежний ряд стоял поперёк полосы на стойках высотой 0.9 м, а колёса на
// глиссаде проходят его на 0.2–0.5 м над плитой: машина сносила огни каждым
// заходом и ломалась об их же основания (замер 15.08.2026 — «споткнулся о
// край ВПП»). Настоящие пороговые огни поэтому и врезаны заподлицо: линза
// торчит из плиты на сантиметры, колесо проходит над ней и по ней. Двуликость
// сохранена: зелёное стекло смотрит на заход, красное — вдоль полосы.
function thresholdLight(id: string, x: number, z: number, approachDirection: -1 | 1): void {
  if (insideTaxiTurnSweep(x, z)) return;
  // Плита основания стоит НА краске порога, не в её плоскости: δ 0 мм между
  // гранями — это спор глубины на любом удалении (закон стыка).
  // Основание сидит на КРАСКЕ порога: её крышка теперь 0.298.
  const paintTop = 0.298;
  const top = paintTop + 0.06;
  primitive(airfield, `${id}:base`, "concrete", "stoneBlock", [x, paintTop + 0.03, z], [0.44, 0.06, 0.36], "#8d9391", { carriesAttachments: true, volume: 0.01 });
  for (const face of ["approach", "runway"] as const) {
    const direction = face === "approach" ? approachDirection : -approachDirection;
    const color = face === "approach" ? "#7fe6a0" : "#f08a80";
    primitive(airfield, `${id}:${face}:lens`, "glass", "glassPane", [x + direction * 0.14, top + 0.035, z], [0.05, 0.07, 0.24], color, { bearsLoad: false, sideAttachmentReach: 0.2, volume: 0.001 });
    primitive(airfield, `${id}:${face}:bulb`, "glass", "sphere", [x + direction * 0.07, top + 0.03, z], [0.07, 0.07, 0.07], color, {
      bearsLoad: false,
      sideAttachmentReach: 0.18,
      volume: 0.001,
      light: { color, distance: 7, intensity: 2.4, dayIntensityFactor: 0.18, poolPriority: 1.2, poolGroupId: `airport-threshold-${face}` },
    });
  }
}

// Боковые огни — НА ГРУНТЕ, в 2.3 м от кромки плиты: колея шасси ±5.79 м,
// разлёт касания из приёмки — до 2.6 м, и прежние ±7.55 м попадали в сумму.
// Колесо достаёт ±9.3 только при сходе, который приёмка и так считает аварией.
for (let x = -100; x <= 84; x += 8) {
  for (const side of [-1, 1]) {
    // Ряд боковых огней РАЗРЫВАЕТСЯ на примыканиях перемычек — как на
    // настоящих полосах: колонны x=44 и x=−88 стояли ровно на осях рулёжек,
    // и хвостовое колесо сносило огонь при каждом рулении (замер Igor,
    // 15.08.2026 — «один такой на рулёжной дорожке точно видел»).
    const onLink =
      side < 0 &&
      (Math.abs(x - AIRPORT_TAXI_LINKS.eastX) <= AIRPORT_TAXI_LINKS.width / 2 + 1 ||
        Math.abs(x - AIRPORT_TAXI_LINKS.westX) <= AIRPORT_TAXI_LINKS.width / 2 + 1);
    if (onLink) continue;
    airfieldLight(`edge:${x}:${side}`, x, AIRPORT_RUNWAY.centreZ + side * 9.3, "#f4f1e2");
  }
}
for (const end of [-1, 1]) {
  const x = end < 0
    ? AIRPORT_RUNWAY.westThresholdX + AIRPORT_RUNWAY.thresholdInset
    : AIRPORT_RUNWAY.eastThresholdX - AIRPORT_RUNWAY.thresholdInset;
  for (let index = -3; index <= 3; index += 1) {
    thresholdLight(`threshold:${end}:${index}`, x, AIRPORT_RUNWAY.centreZ + index * 1.7, end as -1 | 1);
  }
}
for (let index = 0; index < 4; index += 1) {
  airfieldLight(`papi:west:${index}`, -57, AIRPORT_RUNWAY.centreZ - 9.8 - index * 1.35, index < 2 ? "#f08a80" : "#f4f1e2", 0.28);
  airfieldLight(`papi:east:${index}`, 57, AIRPORT_RUNWAY.centreZ + 9.8 + index * 1.35, index < 2 ? "#f08a80" : "#f4f1e2", 0.28);
}

// ── УШИРЕНИЯ ПРИМЫКАНИЙ (fillets) ────────────────────────────────────────
//
// Разворот на месте — вокруг центра машины: хвостовое колесо на плече 11.8 м
// выметает дугу за кромку на всех четырёх углах рулёжной схемы (замер: до
// четырёх метров за бетон). Настоящие аэродромы ровно для этого уширяют
// примыкания. Каждый квад накрывает расчётное выметание своего угла.
slabStrip("fillet-e09", [44, 0.18, -12.75], 24, 4.5);
slabStrip("fillet-w08", [-88, 0.18, -76], 24, 6);

// Разметка ВПП 08 — дневная рулёжная полоса: номера, ось, кромки. Без огней.
for (let x = -96; x <= 72; x += 12) paint(`centreline-08:${x}`, x, AIRPORT_RUNWAY_08.centreZ, 5.4, 0.28);
for (const side of [-1, 1]) {
  paint(`runway-08-edge:${side}`, AIRPORT_RUNWAY_08.centreX, AIRPORT_RUNWAY_08.centreZ + side * (AIRPORT_RUNWAY_08.width / 2 - 0.35), AIRPORT_RUNWAY_08.length - 4, 0.22);
}
for (const stripe of [-2, -1, 0, 1, 2]) {
  paint(`threshold-08-west:${stripe}`, AIRPORT_RUNWAY_08.westThresholdX + 7, AIRPORT_RUNWAY_08.centreZ + stripe * 2.4, 4.6, 1.1);
  paint(`threshold-08-east:${stripe}`, AIRPORT_RUNWAY_08.eastThresholdX - 7, AIRPORT_RUNWAY_08.centreZ + stripe * 2.4, 4.6, 1.1);
}
// Оси перемычек: с 09 налево, по 08 обратно, доворот на старт.
for (const linkX of [AIRPORT_TAXI_LINKS.eastX, AIRPORT_TAXI_LINKS.westX]) {
  // Штрихи целиком внутри плиты перемычки: мазок через стык — беспризорник.
  for (let z = -56; z <= -32; z += 8) paint(`taxi-link:${linkX}:${z}`, linkX, z, 0.28, 4.6);
}

// Windsock mast and a shaped cloth sock.
primitive(airfield, "windsock-mast", "steel", "cylinder", [-72, 3.4, 1], [0.18, 6.6, 0.18], "#697276", { carriesAttachments: true });
primitive(airfield, "windsock-arm", "steel", "plank", [-70.8, 6.45, 1], [2.4, 0.12, 0.12], "#697276", { carriesAttachments: true, attachmentSupportMode: "hinge" });
primitive(airfield, "windsock", "cloth", "panel", [-68.7, 6.35, 1], [2.7, 0.92, 0.08], "#e96537", {
  bearsLoad: false,
  sideAttachmentReach: 0.24,
  volume: 0.03,
  visualProfile: { vertices: [[-0.5, -0.5], [0.5, -0.23], [0.5, 0.23], [-0.5, 0.5]] },
});

// Parking bays and a readable pedestrian route from spawn to the terminal.
for (const side of [-1, 1]) {
  for (let index = 0; index < 9; index += 1) {
    const x = side < 0 ? -58 + index * 3.8 : 45.5 + index * 2.4;
    paint(`parking:${side}:${index}`, x, 45, 0.12, side < 0 ? 5.4 : 4.2);
  }
}
for (let stripe = -4; stripe <= 4; stripe += 1) paint(`crosswalk:${stripe}`, 8 + stripe * 1.35, 35.8, 0.72, 4.2);
for (const x of [-7, 23]) {
  primitive(landside, `bollard:${x}:base`, "concrete", "stoneBlock", [x, 0.24, 34.5], [0.45, 0.36, 0.45], "#878d8d", { carriesAttachments: true });
  primitive(landside, `bollard:${x}:post`, "steel", "cylinder", [x, 0.82, 34.5], [0.14, 0.95, 0.14], "#697276", {
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    sideAttachmentReach: 0.18,
    maximumVerticalGap: 0.025,
    volume: 0.01,
  });
  primitive(landside, `bollard:${x}:lens`, "glass", "cylinder", [x, 1.32, 34.5], [0.28, 0.18, 0.28], "#dce6df", { carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.18, volume: 0.01 });
  primitive(landside, `bollard:${x}:bulb`, "glass", "sphere", [x, 1.32, 34.5], [0.1, 0.1, 0.1], "#f4f1e2", {
    bearsLoad: false,
    sideAttachmentReach: 0.18,
    volume: 0.001,
    light: { color: "#ffe0a8", distance: 9, intensity: 2.7, poolPriority: 1.8, poolGroupId: "airport-entrance", reservePoolGroup: x < 0 },
  });
}

// The terminal itself is part of a continuous landside/airside boundary.
// Concrete-rooted posts take the loads; infill panels and the closed service
// gate are mounted between them. Both runs terminate inside the riprap belt.
function securityFenceSpan(id: string, fromX: number, toX: number, z = 9.35, gate = false): void {
  const span = toX - fromX;
  const panelCount = Math.ceil(span / 3.8);
  const panelWidth = span / panelCount;
  for (let post = 0; post <= panelCount; post += 1) {
    const x = fromX + panelWidth * post;
    primitive(landside, `security:${id}:footing:${post}`, "concrete", "stoneBlock", [x, 0.18, z], [0.5, 0.36, 0.5], "#858c8b", { foundation: true, carriesAttachments: true, volume: 0.05 });
    primitive(landside, `security:${id}:post:${post}`, "steel", "plank", [x, 1.28, z], [0.14, 2.15, 0.14], "#59666a", { carriesAttachments: true, maximumVerticalGap: 0.04, volume: 0.012 });
  }
  for (let panel = 0; panel < panelCount; panel += 1) {
    const x = fromX + panelWidth * (panel + 0.5);
    primitive(landside, gate ? `security:${id}:gate-leaf:${panel}` : `security:${id}:panel:${panel}`, "steel", gate ? "steelSheet" : "panel", [x, 1.38, z], [panelWidth - 0.18, 1.55, gate ? 0.14 : 0.08], gate ? "#607176" : "#768286", {
      bearsLoad: false,
      attachmentSupportMode: "hinge",
      sideAttachmentReach: 0.24,
      textureProfile: "painted-steel",
      volume: panelWidth * 0.08,
    });
  }
}

function securityFenceReturn(id: string, x: number, fromZ: number, toZ: number): void {
  const span = toZ - fromZ;
  const panelCount = Math.ceil(span / 3.8);
  const panelDepth = span / panelCount;
  for (let post = 0; post <= panelCount; post += 1) {
    const z = fromZ + panelDepth * post;
    primitive(landside, `security:${id}:footing:${post}`, "concrete", "stoneBlock", [x, 0.18, z], [0.5, 0.36, 0.5], "#858c8b", { foundation: true, carriesAttachments: true, volume: 0.05 });
    primitive(landside, `security:${id}:post:${post}`, "steel", "plank", [x, 1.28, z], [0.14, 2.15, 0.14], "#59666a", { carriesAttachments: true, maximumVerticalGap: 0.04, volume: 0.012 });
  }
  for (let panel = 0; panel < panelCount; panel += 1) {
    const z = fromZ + panelDepth * (panel + 0.5);
    primitive(landside, `security:${id}:panel:${panel}`, "steel", "panel", [x, 1.38, z], [0.08, 1.55, panelDepth - 0.18], "#768286", {
      bearsLoad: false,
      attachmentSupportMode: "hinge",
      sideAttachmentReach: 0.24,
      textureProfile: "painted-steel",
      volume: panelDepth * 0.08,
    });
  }
}

// The rescue station and hangar are closed service buildings and therefore
// form solid sections of the boundary at their front facades. Short returns
// connect their corners without sending fence panels through the interiors.
securityFenceSpan("west-shore", -116.43, -69.45);
securityFenceReturn("fire-west-return", -69.45, 8, 9.35);
securityFenceReturn("fire-east-return", -46.55, 8, 9.35);
securityFenceSpan("service-gate", -46.55, -38.55, 9.35, true);
securityFenceSpan("west-terminal", -38.55, -18.2);
securityFenceSpan("east-terminal", 34.2, 47.55);
securityFenceReturn("hangar-west-return", 47.55, 2, 9.35);
securityFenceReturn("hangar-east-return", 74.45, 2, 9.35);
securityFenceSpan("east-shore", 74.45, 116.39);

// Fuel tanks are real revolved vessels on concrete saddles inside a guarded yard.
for (let index = 0; index < 3; index += 1) {
  const x = AIRPORT_FUEL_FARM.tankXs[index];
  primitive(fuelFarm, `tank-pad:${index}`, "concrete", "groundTile", [x, 0.18, AIRPORT_FUEL_FARM.centre[1]], [4.6, 0.36, 4.6], "#8e9492", { foundation: true, carriesAttachments: true });
  primitive(fuelFarm, `tank:${index}`, "steel", "cylinder", [x, 2.2, AIRPORT_FUEL_FARM.centre[1]], [3.7, 4.0, 3.7], "#d4d7d1", { textureProfile: "painted-steel", carriesAttachments: true, volume: 7.5 });
  primitive(fuelFarm, `cap:${index}`, "steel", "cylinder", [x, 4.35, AIRPORT_FUEL_FARM.centre[1]], [0.7, 0.28, 0.7], "#6d7779", { bearsLoad: false, volume: 0.06 });
}
for (const side of [-1, 1]) {
  for (let segment = 0; segment < 10; segment += 1) {
    const x = AIRPORT_FUEL_FARM.minX + segment * ((AIRPORT_FUEL_FARM.maxX - AIRPORT_FUEL_FARM.minX) / 9);
    const z = side < 0 ? AIRPORT_FUEL_FARM.minZ : AIRPORT_FUEL_FARM.maxZ;
    primitive(fuelFarm, `bund-z:${side}:${segment}`, "concrete", "stoneBlock", [x, 0.18, z], [2.3, 0.36, 0.52], "#909694", { foundation: true, carriesAttachments: true, volume: 0.12 });
    const isGate = side < 0 && (segment === 3 || segment === 4);
    primitive(fuelFarm, isGate ? `gate-z:${segment}` : `fence-z:${side}:${segment}`, "steel", isGate ? "steelSheet" : "panel", [x, 1.15, z], [2.25, 1.8, isGate ? 0.14 : 0.08], isGate ? "#586b70" : "#697477", { bearsLoad: false, maximumVerticalGap: 0.04, volume: 0.04 });
  }
}
for (const side of [-1, 1]) {
  for (let segment = 0; segment < 4; segment += 1) {
    const z = 23.6 + segment * 2.25;
    const x = side < 0 ? AIRPORT_FUEL_FARM.minX : AIRPORT_FUEL_FARM.maxX;
    primitive(fuelFarm, `bund-x:${side}:${segment}`, "concrete", "stoneBlock", [x, 0.18, z], [0.52, 0.36, 2.05], "#909694", { foundation: true, carriesAttachments: true, volume: 0.11 });
    primitive(fuelFarm, `fence-x:${side}:${segment}`, "steel", "panel", [x, 1.15, z], [0.08, 1.8, 2], "#697477", { bearsLoad: false, maximumVerticalGap: 0.04, volume: 0.04 });
  }
}
primitive(fuelFarm, "pump-pad", "concrete", "groundTile", [79, 0.18, 27], [2.2, 0.36, 3.4], "#8e9492", { foundation: true, carriesAttachments: true });
primitive(fuelFarm, "pump-skid", "steel", "panel", [79, 0.72, 27], [1.45, 0.7, 2.5], "#53636a", { carriesAttachments: true, maximumVerticalGap: 0.05 });
for (const z of [26.35, 27.65]) {
  primitive(fuelFarm, `pump-pipe:${z}`, "steel", "cylinder", [80.35, 1.02, z], [0.18, 2.2, 0.18], "#d9c34e", { rotation: [0, 0, Math.PI / 2], bearsLoad: false, attachmentSupportMode: "hinge", sideAttachmentReach: 0.22, volume: 0.02 });
}

export const islandAirportDocument: AuthoredSceneDocument = {
  schemaVersion: 1,
  id: "island-airport",
  title: "Make a Mess: Island Airport",
  environment: "town",
  world: {
    playerSpawn: [4.75, 1.25, 42],
    playerSpawnYaw: 0,
    cameraFar: AIRPORT_WORLD.cameraFar,
    center: AIRPORT_WORLD.center,
    halfExtents: AIRPORT_WORLD.halfExtents,
    boundaryRadius: AIRPORT_WORLD.boundaryRadius,
    skyRadius: AIRPORT_WORLD.skyRadius,
    radius: AIRPORT_WORLD.radius,
    edgeBoundary: ISLAND_AIRPORT_SHORELINE,
    safetyFloorY: -4.4,
  },
  fogDistances: [185, 365],
  solarFrame: {
    model: "equinox",
    latitudeDegrees: 43.2,
    east: [1, 0],
    north: [0, -1],
  },
  constantRotors: [{
    groupId: "tower-beacon-rotor",
    pivot: [towerX, 16.22, towerZ],
    axis: [0, 1, 0],
    radiansPerSecond: 1.7,
  }],
  motionInstruments: islandAirportDc3MotionInstruments,
  spotLights: [
    { id: "apron-flood-west", position: [-12, 8.4, 8.8], direction: [0.16, -0.72, -0.67], color: "#ffe6bd", distance: 34, intensity: 11, angle: 0.62, penumbra: 0.55, dayIntensityFactor: 0.08 },
    { id: "apron-flood-east", position: [39, 9.2, 8.8], direction: [-0.1, -0.68, -0.72], color: "#ffe6bd", distance: 38, intensity: 12, angle: 0.65, penumbra: 0.55, dayIntensityFactor: 0.08 },
  ],
  copy: {
    status: "Make a Mess / Island Airport",
    eyebrow: "Regional airport test 001",
    heading: "Остров принимает рейсы.",
    ready: "Аэропорт готов",
    loading: "Включаем огни ВПП…",
    description: "Небольшой островной аэропорт: короткая ВПП, рулёжка и перрон, полноценный пассажирский терминал, диспетчерская башня, ангар, пожарное депо, парковка и служебная зона. Здание открыто для исследования и целиком подчиняется общему движку разрушения.",
    enter: "Войти в аэропорт",
    returnToGame: "Вернуться в терминал",
    reset: "Восстановить аэропорт",
  },
  groups: [
    ...groups.values(),
    islandAirportDc3Group,
    islandAirportDc3CommandPostGroup,
  ],
};
