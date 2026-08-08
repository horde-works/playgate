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
  AIRPORT_RUNWAY,
  AIRPORT_TERMINAL,
  AIRPORT_WORLD,
  ISLAND_AIRPORT_SHORELINE,
  airportDistanceToShoreline,
  airportInsideRectangle,
  airportPointInShoreline,
} from "./islandAirportPlan.ts";

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

const GROUND_BOTTOM = -4.2;
const GROUND_STEP = 6;

function pavedAt(x: number, z: number): boolean {
  return airportInsideRectangle(x, z, 0, AIRPORT_RUNWAY.centreZ, AIRPORT_RUNWAY.length + 4, AIRPORT_RUNWAY.width + 4, 2) ||
    airportInsideRectangle(x, z, AIRPORT_APRON.centre[0], AIRPORT_APRON.centre[1], AIRPORT_APRON.width, AIRPORT_APRON.depth, 2) ||
    airportInsideRectangle(x, z, 18, -10.5, 16, 17, 2) ||
    airportInsideRectangle(x, z, 8, 39, 82, 9, 2) ||
    airportInsideRectangle(x, z, -43, 47, 35, 16, 2) ||
    airportInsideRectangle(x, z, 58, 45, 31, 15, 2) ||
    airportInsideRectangle(x, z, AIRPORT_TERMINAL.origin[0], AIRPORT_TERMINAL.origin[2], AIRPORT_TERMINAL.width, AIRPORT_TERMINAL.depth, 2) ||
    airportInsideRectangle(x, z, 61, 13, 27, 25, 2) ||
    airportInsideRectangle(x, z, -58, 15, 24, 17, 2);
}

for (let x = -117; x <= 117; x += GROUND_STEP) {
  for (let z = -57; z <= 57; z += GROUND_STEP) {
    if (!airportPointInShoreline(x, z) || airportDistanceToShoreline(x, z) < 3.4) continue;
    primitive(
      terrain,
      `earth:${x}:${z}`,
      "earth",
      "groundTile",
      [x, GROUND_BOTTOM / 2, z],
      [GROUND_STEP + 0.08, -GROUND_BOTTOM, GROUND_STEP + 0.08],
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
        [GROUND_STEP + 0.06, 0.14, GROUND_STEP + 0.06],
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
    const inwardLength = Math.hypot(edgeX, edgeZ) || 1;
    const x = edgeX - edgeX / inwardLength * 1.05;
    const z = edgeZ - edgeZ / inwardLength * 1.05;
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
      alongX ? [actual + 0.04, 0.22, width] : [width, 0.22, actual + 0.04],
      index % 3 === 0 ? color : index % 3 === 1 ? "#303538" : "#383c3f",
      { carriesAttachments: true, volume: actual * width * 0.22 },
    );
  }
}

slabStrip("runway", [0, 0.18, AIRPORT_RUNWAY.centreZ], AIRPORT_RUNWAY.length, AIRPORT_RUNWAY.width);
slabStrip("apron", [AIRPORT_APRON.centre[0], 0.18, AIRPORT_APRON.centre[1]], AIRPORT_APRON.width, AIRPORT_APRON.depth);
slabStrip("taxiway", [18, 0.18, -11], 22, 12, false);
slabStrip("landside-loop", [8, 0.18, 39], 88, 7);
slabStrip("west-parking", [-43, 0.18, 48], 34, 15);
slabStrip("east-parking", [58, 0.18, 46], 30, 14);
slabStrip("hangar-apron", [61, 0.18, 2], 29, 21);
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
  primitive(markings, id, "plaster", "groundTile", [x, 0.305, z], [width, 0.03, depth], color, {
    rotation,
    bearsLoad: false,
    volume: width * depth * 0.008,
    contactBearingOrder: true,
  });
}

for (let x = -72; x <= 72; x += 12) paint(`centreline:${x}`, x, AIRPORT_RUNWAY.centreZ, 5.4, 0.28);
for (const side of [-1, 1]) {
  paint(`runway-edge:${side}`, 0, AIRPORT_RUNWAY.centreZ + side * (AIRPORT_RUNWAY.width / 2 - 0.35), AIRPORT_RUNWAY.length - 4, 0.22);
  for (let stripe = 0; stripe < 6; stripe += 1) {
    paint(`threshold-west:${side}:${stripe}`, -80, AIRPORT_RUNWAY.centreZ + side * (1.15 + stripe * 0.82), 5.8, 0.42);
    paint(`threshold-east:${side}:${stripe}`, 80, AIRPORT_RUNWAY.centreZ + side * (1.15 + stripe * 0.82), 5.8, 0.42);
  }
}
paint("aiming-west:north", -54, AIRPORT_RUNWAY.centreZ - 2.8, 9, 1.1);
paint("aiming-west:south", -54, AIRPORT_RUNWAY.centreZ + 2.8, 9, 1.1);
paint("aiming-east:north", 54, AIRPORT_RUNWAY.centreZ - 2.8, 9, 1.1);
paint("aiming-east:south", 54, AIRPORT_RUNWAY.centreZ + 2.8, 9, 1.1);
paint("taxiway-centre", 18, -10.5, 0.25, 19, "#e1bc34");
for (const standX of [-10, 12, 34]) {
  paint(`stand-line:${standX}`, standX, 1, 0.22, 12, "#e1bc34");
  paint(`stand-stop:${standX}`, standX, 6, 5.5, 0.22, "#e1bc34");
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
      // Sliding leaves are parked against the jambs, leaving a real 1.9 m
      // clear opening at the centre of every public doorway.
      primitive(terminalGlass, `${side}:door:${bay}:${sign}`, "glass", "glassPane", [x + sign * 1.5, 1.93, z], [0.92, 3.0, 0.11], "#9dc1c8", {
        bearsLoad: false,
        volume: 0.04,
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
    primitive(terminalEnvelope, `roof:${zone}:${bay}`, "sheetMetal", "steelSheet", [x, 6.55, z], [bayWidth, 0.18, depth], "#dfe4e4", {
      bearsLoad: false,
      textureProfile: "painted-steel",
      volume: bayWidth * depth * 0.035,
      contactBearingOrder: true,
    });
  }
  primitive(terminalGlass, `skylight:${bay}`, "glass", "glassPane", [x, 6.57, 20], [bayWidth + 0.08, 0.12, 3.72], "#b7d0d2", {
    bearsLoad: false,
    volume: 0.08,
    contactBearingOrder: true,
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
primitive(terminalInterior, "baggage-wall", "concrete", "panel", [31.5, 2.15, 25], [0.3, 3.4, 9.2], "#c5c7c5", { carriesAttachments: true });
primitive(terminalInterior, "service-wall-west", "concrete", "panel", [-15, 2.15, 19], [0.3, 3.4, 8], "#c5c7c5", { carriesAttachments: true });
counter("cafe", -10.5, 14.2, Math.PI);

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
  primitive(tower, `shaft-z:${side}`, "concrete", "panel", [towerX, 5.5, towerZ + side * 2.85], [5.7, 10.2, 0.5], "#9da5a6", { carriesAttachments: true });
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
primitive(tower, "beacon-mast", "steel", "cylinder", [towerX, 15.55, towerZ], [0.16, 2.2, 0.16], "#596367", { carriesAttachments: true });
primitive(tower, "beacon-lens", "glass", "cylinder", [towerX, 16.72, towerZ], [0.46, 0.24, 0.46], "#f4f1e2", { bearsLoad: false, carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.2, volume: 0.02 });
primitive(tower, "beacon-bulb", "glass", "sphere", [towerX, 16.72, towerZ], [0.16, 0.16, 0.16], "#f4f1e2", {
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
): void {
  primitive(target, `${id}:foundation`, "concrete", "groundTile", [centreX, 0.2, centreZ], [width, 0.4, depth], "#92999a", { foundation: true, carriesAttachments: true });
  primitive(target, `${id}:rear`, "concrete", "panel", [centreX, height / 2 + 0.4, centreZ + depth / 2], [width, height, 0.4], "#aeb3b2", { carriesAttachments: true });
  for (const side of [-1, 1]) primitive(target, `${id}:side:${side}`, "concrete", "panel", [centreX + side * width / 2, height / 2 + 0.4, centreZ], [0.4, height, depth], "#9fa7a7", { carriesAttachments: true });
  const bay = width / doorCount;
  for (let index = 0; index < doorCount; index += 1) {
    const x = centreX - width / 2 + bay * (index + 0.5);
    primitive(target, `${id}:door:${index}`, "sheetMetal", "steelSheet", [x, height / 2, centreZ - depth / 2], [bay - 0.7, height - 0.8, 0.16], index % 2 ? accent : "#c9cecc", { bearsLoad: false, textureProfile: "painted-steel", volume: 0.5 });
    if (index < doorCount - 1) primitive(target, `${id}:pier:${index}`, "steel", "plank", [x + bay / 2, height / 2 + 0.4, centreZ - depth / 2], [0.42, height, 0.42], "#606a6e", { carriesAttachments: true });
  }
  for (let frame = 0; frame <= 4; frame += 1) {
    const x = centreX - width / 2 + (width * frame) / 4;
    primitive(target, `${id}:roof-frame:${frame}`, "steel", "plank", [x, height + 0.25, centreZ], [0.3, 0.36, depth + 0.2], "#616b6e", { carriesAttachments: true });
  }
  primitive(target, `${id}:roof`, "sheetMetal", "steelSheet", [centreX, height + 0.52, centreZ], [width + 0.6, 0.22, depth + 0.6], "#d1d7d5", { bearsLoad: false, textureProfile: "painted-steel", volume: width * depth * 0.03 });
}

portalBuilding(hangar, "hangar", 61, 13, 26, 22, 8.2, 2, "#5f8190");
portalBuilding(fireStation, "fire", -58, 15, 22, 14, 5.8, 3, "#c94135");

// Runway edge/threshold lights: base, housing, clear lens, contained signal bulb.
function airfieldLight(id: string, x: number, z: number, color: string, height = 0.46): void {
  primitive(airfield, `${id}:base`, "concrete", "stoneBlock", [x, 0.22, z], [0.34, 0.28, 0.34], "#8d9391", { carriesAttachments: true, volume: 0.03 });
  primitive(airfield, `${id}:stem`, "steel", "cylinder", [x, 0.38 + height / 2, z], [0.08, height, 0.08], "#5e686b", {
    carriesAttachments: true,
    attachmentSupportMode: "hinge",
    sideAttachmentReach: 0.18,
    maximumVerticalGap: 0.035,
    volume: 0.004,
  });
  primitive(airfield, `${id}:lens`, "glass", "cylinder", [x, 0.48 + height / 2, z], [0.24, 0.18, 0.24], "#dce6df", { carriesAttachments: true, attachmentSupportMode: "hinge", sideAttachmentReach: 0.18, volume: 0.006 });
  primitive(airfield, `${id}:bulb`, "glass", "sphere", [x, 0.48 + height / 2, z], [0.1, 0.1, 0.1], color, { bearsLoad: false, sideAttachmentReach: 0.18, volume: 0.001 });
}

for (let x = -84; x <= 84; x += 8) {
  for (const side of [-1, 1]) airfieldLight(`edge:${x}:${side}`, x, AIRPORT_RUNWAY.centreZ + side * 7.55, "#f4f1e2");
}
for (const end of [-1, 1]) {
  const x = end * 86.5;
  for (let index = -3; index <= 3; index += 1) {
    airfieldLight(`threshold:${end}:${index}`, x, AIRPORT_RUNWAY.centreZ + index * 1.7, end < 0 ? "#7fe6a0" : "#f08a80", 0.32);
  }
}
for (let index = 0; index < 4; index += 1) airfieldLight(`papi:${index}`, -53 + index * 1.35, AIRPORT_RUNWAY.centreZ + 10.2, index < 2 ? "#f4f1e2" : "#f08a80", 0.28);

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
    const x = side < 0 ? -58 + index * 3.8 : 44 + index * 3.5;
    paint(`parking:${side}:${index}`, x, side < 0 ? 48 : 46, 0.12, 5.4);
  }
}
paint("crosswalk:north", 8, 34.8, 14, 0.7);
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

// Fuel tanks are real revolved vessels on concrete saddles inside a guarded yard.
for (let index = 0; index < 3; index += 1) {
  const x = 70 + index * 5.4;
  primitive(fuelFarm, `tank-pad:${index}`, "concrete", "groundTile", [x, 0.18, 38], [4.6, 0.36, 4.6], "#8e9492", { foundation: true, carriesAttachments: true });
  primitive(fuelFarm, `tank:${index}`, "steel", "cylinder", [x, 2.2, 38], [3.7, 4.0, 3.7], "#d4d7d1", { textureProfile: "painted-steel", carriesAttachments: true, volume: 7.5 });
  primitive(fuelFarm, `cap:${index}`, "steel", "cylinder", [x, 4.35, 38], [0.7, 0.28, 0.7], "#6d7779", { bearsLoad: false, volume: 0.06 });
}
for (let segment = 0; segment < 10; segment += 1) {
  const x = 65 + segment * 2.3;
  primitive(fuelFarm, `fence:${segment}`, "steel", "panel", [x, 1.15, 33.5], [2.25, 1.8, 0.08], "#697477", { bearsLoad: false, volume: 0.04 });
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
  groups: [...groups.values()],
};
