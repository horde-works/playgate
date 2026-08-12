import type {
  BreakableClusterDefinition,
  BreakableMaterial,
  BreakablePieceDefinition,
  BreakableShape,
  LampDefinition,
  LampEventLightingDefinition,
  SceneVector3,
} from "./destructionScene.ts";
import { SILICATE_JOINT } from "./silicateJoints.ts";

/**
 * The stronghold does not operate a civil airship. Its carrier is a flying
 * siege gallery: a rigid gas hull carries an armoured fighting deck, while a
 * cast ram in the bow doubles as the pin caught by the barbican's jaws.
 */
export const BASALT_SKY_RAM_CLUSTER_ID = "stronghold:sky-ram";
export const BASALT_SKY_RAM_BERTH_CLUSTER_ID = "stronghold:sky-ram-berth";

export const BASALT_SKY_RAM_ORIGIN: SceneVector3 = [0, 12.8, -101.5];
export const BASALT_SKY_RAM_NOSE: SceneVector3 = [0, 0, 1];
export const BASALT_SKY_RAM_MOORING_POINT: SceneVector3 = [0, 5.72, -89.72];
// The gas-cell trim is fixed. Changes to the completed structure are balanced
// with physical ballast instead of silently moving this force application.
export const BASALT_SKY_RAM_LIFT_CENTRE: SceneVector3 = [0, 13.1, -102.19];
export const BASALT_SKY_RAM_GALLERY_FLOOR_Y = 5.14;
export const BASALT_SKY_RAM_GALLERY_ROOF_Y = 8.12;
export const BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH = 1.34;
export const BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH = 1.88;

const RAM_ORIGIN_Z = BASALT_SKY_RAM_ORIGIN[2];
const IRON = "#303639";
const IRON_EDGE = "#51595c";
const CITADEL_STEEL = "#43494b";
const CITADEL_STEEL_DARK = "#343a3c";
const RIVET_STEEL = "#73797a";
const BLACK_CLOTH = "#2b3235";
const BLACK_CLOTH_DARK = "#21272a";
const SOOT = "#181d1f";
const BASALT = "#2c3133";
const BASALT_EDGE = "#414648";
const OLD_BRASS = "#806541";
const EMBER = "#ff5a27";

export interface BasaltSkyRamScene {
  readonly clusters: readonly BreakableClusterDefinition[];
  readonly lamps: readonly LampDefinition[];
}

function ramPoint(a: number, b: number, y: number): SceneVector3 {
  return [b, y, RAM_ORIGIN_Z + a];
}

/** Exported for the vehicle frame, route interactions and tests. */
export function basaltSkyRamPoint(
  longitudinal: number,
  lateral: number,
  y: number,
): SceneVector3 {
  return ramPoint(longitudinal, lateral, y);
}

function norm([x, y, z]: SceneVector3): SceneVector3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/** Euler orientation whose local X follows xDirection and local Y faces out. */
function orient(
  xDirection: SceneVector3,
  yDirection: SceneVector3,
): SceneVector3 {
  const x = norm(xDirection);
  const dot =
    yDirection[0] * x[0] + yDirection[1] * x[1] + yDirection[2] * x[2];
  const y = norm([
    yDirection[0] - x[0] * dot,
    yDirection[1] - x[1] * dot,
    yDirection[2] - x[2] * dot,
  ]);
  const z: SceneVector3 = [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const ry = Math.asin(Math.max(-1, Math.min(1, z[0])));
  if (Math.abs(z[0]) < 0.9999999) {
    return [Math.atan2(-z[1], z[2]), ry, Math.atan2(-y[0], x[0])];
  }
  return [Math.atan2(y[2], y[1]), ry, 0];
}

function rodRotation(dx: number, dy: number, dz: number): SceneVector3 {
  return [Math.atan2(dz, dy), 0, Math.atan2(-dx, Math.hypot(dy, dz))];
}

function addRod(
  pieces: BreakablePieceDefinition[],
  id: string,
  clusterId: string,
  from: SceneVector3,
  to: SceneVector3,
  diameter: number,
  color = IRON_EDGE,
  options: Partial<BreakablePieceDefinition> = {},
): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  pieces.push({
    id,
    clusterId,
    material: "steel",
    shape: "cylinder",
    position: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    rotation: rodRotation(dx, dy, dz),
    size: [diameter, Math.hypot(dx, dy, dz), diameter],
    color,
    ...options,
  });
}

function addPiece(
  pieces: BreakablePieceDefinition[],
  id: string,
  clusterId: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: Partial<BreakablePieceDefinition> = {},
): void {
  pieces.push({
    id,
    clusterId,
    material,
    shape,
    position,
    size,
    color,
    ...options,
  });
}

/**
 * Add one exact intact shell patch while keeping a compact breakable proxy.
 * Neighbouring patches may share authored world vertices, so their rendered
 * edges meet exactly instead of overlapping a row of tilted rectangles.
 */
function addSurfaceMeshPiece(
  pieces: BreakablePieceDefinition[],
  id: string,
  clusterId: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  vertices: readonly SceneVector3[],
  indices: readonly number[],
  color: string,
  options: Partial<BreakablePieceDefinition> = {},
): void {
  const minimum = [0, 1, 2].map((axis) =>
    Math.min(...vertices.map((vertex) => vertex[axis])));
  const maximum = [0, 1, 2].map((axis) =>
    Math.max(...vertices.map((vertex) => vertex[axis])));
  const centre = [0, 1, 2].map((axis) =>
    (minimum[axis] + maximum[axis]) / 2) as unknown as SceneVector3;
  const size = [0, 1, 2].map((axis) =>
    Math.max(0.025, maximum[axis] - minimum[axis])) as unknown as SceneVector3;
  const localVertices = vertices.map((vertex) =>
    [0, 1, 2].map((axis) =>
      (vertex[axis] - centre[axis]) / size[axis]) as unknown as SceneVector3);
  const area = indexedSurfaceArea(vertices, indices);
  const inferredThickness = options.volume && area > 1e-8
    ? options.volume / area
    : undefined;

  addPiece(pieces, id, clusterId, material, shape, centre, size, color, {
    ...options,
    voxelization: options.voxelization ?? {
      mode: "shell",
      ...(inferredThickness ? { thickness: inferredThickness } : {}),
    },
    visualMesh: { vertices: localVertices, indices },
  });
}

const ramEventLighting: LampEventLightingDefinition = {
  sourceClusterId: BASALT_SKY_RAM_CLUSTER_ID,
  levels: {
    docked: { intensityMultiplier: 0.34, distanceMultiplier: 0.72 },
    attention: { intensityMultiplier: 1.25, distanceMultiplier: 1.12 },
    departure: { intensityMultiplier: 1, distanceMultiplier: 1 },
    inTransit: { intensityMultiplier: 0.74, distanceMultiplier: 0.9 },
    cruise: { intensityMultiplier: 0.62, distanceMultiplier: 0.86 },
    approach: { intensityMultiplier: 1.2, distanceMultiplier: 1.08 },
    failed: { intensityMultiplier: 0.12, distanceMultiplier: 0.48 },
  },
};

const dorsalEmberEventLighting: LampEventLightingDefinition = {
  sourceClusterId: BASALT_SKY_RAM_CLUSTER_ID,
  levels: {
    docked: { intensityMultiplier: 0.92, distanceMultiplier: 1 },
    attention: { intensityMultiplier: 1.3, distanceMultiplier: 1.12 },
    departure: { intensityMultiplier: 1.12, distanceMultiplier: 1.06 },
    inTransit: { intensityMultiplier: 1, distanceMultiplier: 1 },
    cruise: { intensityMultiplier: 0.88, distanceMultiplier: 0.94 },
    approach: { intensityMultiplier: 1.22, distanceMultiplier: 1.1 },
    failed: { intensityMultiplier: 0.2, distanceMultiplier: 0.52 },
  },
};

const berthEventLighting: LampEventLightingDefinition = {
  sourceClusterId: BASALT_SKY_RAM_CLUSTER_ID,
  levels: {
    docked: { intensityMultiplier: 1.55, distanceMultiplier: 1.12 },
    attention: { intensityMultiplier: 1.9, distanceMultiplier: 1.2 },
    departure: { intensityMultiplier: 0.22, distanceMultiplier: 0.6 },
    inTransit: { intensityMultiplier: 0.08, distanceMultiplier: 0.45 },
    cruise: { intensityMultiplier: 0.08, distanceMultiplier: 0.45 },
    approach: { intensityMultiplier: 1.7, distanceMultiplier: 1.16 },
    failed: { intensityMultiplier: 0.16, distanceMultiplier: 0.52 },
  },
};

function createRearBarbican(lamps: LampDefinition[]): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const clusterId = BASALT_SKY_RAM_BERTH_CLUSTER_ID;

  // Two battered basalt shoulders carry a split deck. The open throat in the
  // middle belongs to the ram and remains clear even when the carrier pitches.
  for (const side of [-1, 1] as const) {
    for (let course = 0; course < 4; course += 1) {
      for (let bay = 0; bay < 3; bay += 1) {
        const stagger = course % 2 === 0 ? 0 : 0.48;
        addPiece(
          pieces,
          `stronghold:berth:shoulder:${side}:${course}:${bay}`,
          clusterId,
          "basalt",
          "stoneBlock",
          [side * (4.2 + bay * 1.0 + stagger), 0.55 + course * 1.05, -89.2],
          // Кладка, а не монолит: блок = шаг минус общий шов крепости.
          // Стояло [1.08, 1.06] при шагах 1.0 и 1.05 — то есть блоки лезли
          // друг на друга на 80 мм по горизонтали и на 10 мм по вертикали, и
          // их наружные грани спорили за пиксели (35 находок). Нахлёст здесь
          // не закрывал ничего: закрывать было нечего.
          [1.0 - SILICATE_JOINT, 1.05 - SILICATE_JOINT, 4.35],
          course === 3 ? BASALT_EDGE : BASALT,
          { weathering: 0.38 },
        );
      }
    }

    addPiece(
      pieces,
      `stronghold:berth:deck:${side}:front`,
      clusterId,
      "steel",
      "steelSheet",
      [side * 4.65, 4.7, -88.4],
      [4.15, 0.28, 4.2],
      IRON,
      {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      },
    );
    addPiece(
      pieces,
      `stronghold:berth:deck:${side}:aft`,
      clusterId,
      "steel",
      "steelSheet",
      [side * 4.65, 4.7, -92.45],
      [4.15, 0.28, 3.92],
      IRON,
      {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      },
    );

    // A side catwalk reaches the gallery door while keeping the central
    // capture jaw unobstructed. The last span is a sacrificial boarding brow.
    addPiece(
      pieces,
      `stronghold:berth:catwalk:${side}`,
      clusterId,
      "steel",
      "steelSheet",
      [side * 4.65, 4.76, -96.1],
      [2.35, 0.2, 3.45],
      "#343a3d",
      {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
        attachmentSupportIds: [`stronghold:berth:deck:${side}:aft`],
      },
    );
    for (const railSide of [-1, 1] as const) {
      const x = side * 4.65 + railSide * 1.08;
      addRod(
        pieces,
        `stronghold:berth:catwalk:${side}:rail:${railSide}`,
        clusterId,
        [x, 4.94, -94.55],
        [x, 5.72, -97.68],
        0.11,
        IRON_EDGE,
        {
          bearsLoad: false,
          sideAttachmentReach: 0.25,
          attachmentSupportIds: [`stronghold:berth:catwalk:${side}`],
        },
      );
    }
  }

  // East stair: traffic reaches the machinery from the tower yard without
  // crossing the exposed capture axis.
  for (let tread = 0; tread < 9; tread += 1) {
    addPiece(
      pieces,
      `stronghold:berth:stair:${tread}`,
      clusterId,
      "basalt",
      "stoneBlock",
      [6.25, 0.22 + tread * 0.49, -82.1 - tread * 0.68],
      [2.45, 0.5, 0.82],
      tread % 2 === 0 ? BASALT_EDGE : BASALT,
      { weathering: 0.34 },
    );
  }
  for (const side of [-1, 1] as const) {
    addRod(
      pieces,
      `stronghold:berth:stair:rail:${side}`,
      clusterId,
      [6.25 + side * 1.08, 1.05, -82.05],
      [6.25 + side * 1.08, 5.33, -87.75],
      0.12,
      IRON_EDGE,
      { bearsLoad: false },
    );
  }

  // The jaw is a literal socket around the cast nose. It is visibly tied
  // down into both basalt shoulders, so the winch does not read as magic.
  for (const side of [-1, 1] as const) {
    addPiece(
      pieces,
      `stronghold:berth:capture:bearer:${side}`,
      clusterId,
      "steel",
      "steelSheet",
      [side * 1.72, 4.84, -89.55],
      [3.5, 0.34, 1.12],
      IRON,
      {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        attachmentSupportIds: [`stronghold:berth:deck:${side}:front`],
      },
    );
    addPiece(
      pieces,
      `stronghold:berth:capture:cheek:${side}`,
      clusterId,
      "steel",
      "steelSheet",
      [side * 0.58, 5.7, -89.55],
      [0.34, 1.25, 1.4],
      "#505659",
      {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
        attachmentSupportIds: [`stronghold:berth:capture:bearer:${side}`],
      },
    );
    addRod(
      pieces,
      `stronghold:berth:capture:brace:${side}:0`,
      clusterId,
      [side * 0.68, 5.35, -90.0],
      [side * 3.7, 4.78, -91.45],
      0.18,
      IRON_EDGE,
      {
        attachmentSupportMode: "cable",
        sideAttachmentReach: 4,
        attachmentSupportIds: [`stronghold:berth:capture:cheek:${side}`],
      },
    );
    addRod(
      pieces,
      `stronghold:berth:capture:brace:${side}:1`,
      clusterId,
      [side * 0.68, 5.96, -89.45],
      [side * 3.7, 4.78, -87.5],
      0.18,
      IRON_EDGE,
      {
        attachmentSupportMode: "cable",
        sideAttachmentReach: 4,
        attachmentSupportIds: [`stronghold:berth:capture:cheek:${side}`],
      },
    );
  }
  addPiece(
    pieces,
    "stronghold:berth:capture:sill",
    clusterId,
    "steel",
    "steelSheet",
    [0, 5.08, -89.55],
    [1.5, 0.28, 1.45],
    "#4b5154",
    {
      carriesAttachments: true,
      sideAttachmentReach: 2.1,
      attachmentSupportIds: [
        "stronghold:berth:capture:bearer:-1",
        "stronghold:berth:capture:bearer:1",
      ],
    },
  );

  // Capstan and chain train. Small individual links give the docking head the
  // same close-up honesty as the working machinery on the older maps.
  addPiece(
    pieces,
    "stronghold:berth:capstan:post",
    clusterId,
    "steel",
    "cylinder",
    [5.15, 5.38, -89.1],
    [0.52, 1.15, 0.52],
    IRON_EDGE,
    { carriesAttachments: true, attachmentSupportMode: "cable" },
  );
  addPiece(
    pieces,
    "stronghold:berth:capstan:wheel",
    clusterId,
    "steel",
    "cylinder",
    [5.15, 5.78, -89.1],
    [1.72, 0.18, 1.72],
    OLD_BRASS,
    { carriesAttachments: true, bearsLoad: false },
  );
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = (spoke / 8) * Math.PI * 2;
    addRod(
      pieces,
      `stronghold:berth:capstan:spoke:${spoke}`,
      clusterId,
      [5.15, 5.9, -89.1],
      [5.15 + Math.cos(angle) * 1.06, 5.9, -89.1 + Math.sin(angle) * 1.06],
      0.1,
      OLD_BRASS,
      { bearsLoad: false },
    );
  }
  for (let link = 0; link < 14; link += 1) {
    const t = link / 13;
    addPiece(
      pieces,
      `stronghold:berth:chain:${link}`,
      clusterId,
      "steel",
      "cylinder",
      [5.0 * (1 - t), 5.11 + Math.sin(t * Math.PI) * 0.24, -89.18 - t * 0.28],
      [0.16, 0.08, 0.25],
      "#373d40",
      {
        rotation: [0, 0, link % 2 === 0 ? 0 : Math.PI / 2],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.48,
        attachmentSupportIds: [
          link === 0
            ? "stronghold:berth:capstan:post"
            : `stronghold:berth:chain:${link - 1}`,
        ],
      },
    );
  }

  // Lit cressets are both range markers and a visual berth state display.
  for (const side of [-1, 1] as const) {
    const x = side * 3.1;
    const id = `stronghold:berth:cresset:${side}`;
    addRod(
      pieces,
      `${id}:post`,
      clusterId,
      [x, 4.84, -88.15],
      [x, 6.45, -88.15],
      0.14,
      IRON_EDGE,
    );
    addPiece(
      pieces,
      id,
      clusterId,
      "darkGlass",
      "cylinder",
      [x, 6.54, -88.15],
      [0.42, 0.5, 0.42],
      EMBER,
      { bearsLoad: false },
    );
    lamps.push({
      id,
      position: [x, 6.58, -88.15],
      color: EMBER,
      distance: 15,
      intensity: 4.2,
      poolPriority: 6,
      eventLighting: berthEventLighting,
      transition: { fadeInSeconds: 0.55, fadeOutSeconds: 1.1 },
    });
  }

  return {
    id: clusterId,
    label: "Rear barbican sky-ram berth",
    material: "basalt",
    supportMode: "stack",
    pieces,
  };
}

interface EnvelopeSection {
  readonly a: number;
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
  readonly crownAdvance?: number;
  readonly bellyRecess?: number;
}

/**
 * The side elevation is authored first, like a hull lofting drawing. The
 * broad body holds its depth for only the middle third; aft sections flow
 * into a long caudal peduncle, while the last five bow sections climb into a
 * sperm-whale forehead whose lower line ends 1.3 m earlier than the crown.
 */
const ENVELOPE_SECTIONS: readonly EnvelopeSection[] = [
  { a: -17.1, halfWidth: 0.12, top: 13.12, bottom: 12.56 },
  { a: -16.3, halfWidth: 0.58, top: 13.66, bottom: 11.94 },
  { a: -15.0, halfWidth: 1.22, top: 14.38, bottom: 11.22 },
  { a: -13.2, halfWidth: 2.16, top: 15.26, bottom: 10.34 },
  { a: -10.8, halfWidth: 3.02, top: 15.96, bottom: 9.7 },
  { a: -7.6, halfWidth: 3.56, top: 16.4, bottom: 9.34 },
  { a: -3.8, halfWidth: 3.82, top: 16.62, bottom: 9.18 },
  { a: 0.3, halfWidth: 3.9, top: 16.68, bottom: 9.15 },
  { a: 3.7, halfWidth: 3.78, top: 16.64, bottom: 9.2 },
  { a: 6.1, halfWidth: 3.55, top: 16.58, bottom: 9.36 },
  {
    a: 7.65,
    halfWidth: 3.1,
    top: 16.48,
    bottom: 9.72,
    crownAdvance: 0.08,
  },
  {
    a: 8.65,
    halfWidth: 2.35,
    top: 16.38,
    bottom: 10.38,
    crownAdvance: 0.18,
    bellyRecess: 0.05,
  },
  {
    a: 9.25,
    halfWidth: 1.45,
    top: 16.22,
    bottom: 11.35,
    crownAdvance: 0.35,
    bellyRecess: 0.18,
  },
  {
    a: 9.58,
    halfWidth: 0.65,
    top: 16.0,
    bottom: 12.55,
    crownAdvance: 0.55,
    bellyRecess: 0.45,
  },
  {
    a: 9.65,
    halfWidth: 0.08,
    top: 15.7,
    bottom: 13.45,
    crownAdvance: 0.68,
    bellyRecess: 0.7,
  },
];

function smoothstep01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function mix(from: number, to: number, blend: number): number {
  return from + (to - from) * blend;
}

function envelopeSectionAt(a: number): EnvelopeSection {
  if (a <= ENVELOPE_SECTIONS[0].a) {
    return ENVELOPE_SECTIONS[0];
  }
  const last = ENVELOPE_SECTIONS[ENVELOPE_SECTIONS.length - 1];
  if (a >= last.a) {
    return last;
  }
  for (let index = 0; index < ENVELOPE_SECTIONS.length - 1; index += 1) {
    const from = ENVELOPE_SECTIONS[index];
    const to = ENVELOPE_SECTIONS[index + 1];
    if (a > to.a) {
      continue;
    }
    const blend = smoothstep01((a - from.a) / (to.a - from.a));
    return {
      a,
      halfWidth: mix(from.halfWidth, to.halfWidth, blend),
      top: mix(from.top, to.top, blend),
      bottom: mix(from.bottom, to.bottom, blend),
      crownAdvance: mix(from.crownAdvance ?? 0, to.crownAdvance ?? 0, blend),
      bellyRecess: mix(from.bellyRecess ?? 0, to.bellyRecess ?? 0, blend),
    };
  }
  return last;
}

function envelopePointOnSection(
  section: EnvelopeSection,
  phi: number,
): SceneVector3 {
  const cosine = Math.cos(phi);
  const crown = Math.max(0, cosine);
  const belly = Math.max(0, -cosine);
  const equator = (section.top + section.bottom) / 2;
  const y = cosine >= 0
    ? equator + (section.top - equator) * Math.pow(crown, 0.86)
    : equator - (equator - section.bottom) * Math.pow(belly, 0.94);
  const axialOffset =
    (section.crownAdvance ?? 0) * Math.pow(crown, 1.55) -
    (section.bellyRecess ?? 0) * Math.pow(belly, 1.35);
  return ramPoint(
    section.a + axialOffset,
    section.halfWidth * Math.sin(phi),
    y,
  );
}

function envelopeSurfacePoint(a: number, phi: number): SceneVector3 {
  return envelopePointOnSection(envelopeSectionAt(a), phi);
}

function envelopeRadius(a: number): number {
  const section = envelopeSectionAt(a);
  return Math.max(
    section.halfWidth,
    (section.top - section.bottom) / 2,
  );
}

function subtractPoint(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function indexedSurfaceArea(
  vertices: readonly SceneVector3[],
  indices: readonly number[],
): number {
  let area = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const origin = vertices[indices[index]];
    const ab = subtractPoint(vertices[indices[index + 1]], origin);
    const ac = subtractPoint(vertices[indices[index + 2]], origin);
    const normal = cross(ab, ac);
    area += Math.hypot(normal[0], normal[1], normal[2]) / 2;
  }
  return area;
}

function envelopeSurfaceFrame(
  a: number,
  phi: number,
): { readonly longitudinal: SceneVector3; readonly outward: SceneVector3 } {
  const longitudinal = norm(subtractPoint(
    envelopeSurfacePoint(a + 0.06, phi),
    envelopeSurfacePoint(a - 0.06, phi),
  ));
  const circumferential = norm(subtractPoint(
    envelopeSurfacePoint(a, phi + 0.035),
    envelopeSurfacePoint(a, phi - 0.035),
  ));
  return { longitudinal, outward: norm(cross(longitudinal, circumferential)) };
}

function createSkyRam(lamps: LampDefinition[]): BreakableClusterDefinition {
  const pieces: BreakablePieceDefinition[] = [];
  const clusterId = BASALT_SKY_RAM_CLUSTER_ID;

  // Five overlapping keel cells replace the old single invisible "heart".
  // Each is an independent structural root for its longitudinal bay: damage
  // can open one load path without declaring every plate from nose to ramp
  // unsupported. Their total authored mass is unchanged, so the established
  // trim and pendulum remain physical rather than being retuned afterwards.
  const keelCells = [
    { offset: -13.5, length: 5.8, volume: 2.308261665166704 },
    { offset: -8, length: 5.8, volume: 0.5092168343631233 },
    { offset: -2.5, length: 6, volume: 0.5092168343631233 },
    { offset: 3, length: 5.8, volume: 0.5092168343631233 },
    // The forehead closes much earlier than the caudal body. Its root cell is
    // correspondingly shorter, so no structural core can poke through the
    // whale nose as a visible beam. The cell volumes preserve the previous
    // total mass, longitudinal centre and pitch inertia exactly after moving
    // that core inboard; this visual correction cannot secretly alter trim.
    { offset: 7.5, length: 4, volume: 4.6640878317439265 },
  ] as const;
  for (const [index, { offset, length, volume }] of keelCells.entries()) {
    addPiece(
      pieces,
      `stronghold:sky-ram:keel-cell:${index}`,
      clusterId,
      "earth",
      "cylinder",
      [0, BASALT_SKY_RAM_ORIGIN[1], RAM_ORIGIN_Z + offset],
      [1.3, length, 1.3],
      SOOT,
      {
        rotation: [Math.PI / 2, 0, 0],
        volume,
        contactBoxes: [{
          position: [0, 10.4, RAM_ORIGIN_Z + offset],
          size: [11.2, 13.6, 9.5],
        }],
        carriesAttachments: true,
        attachmentSupportMode: "cable",
      },
    );
  }
  // Дифферентовочные тележки под настилом боевой галереи, рядом с её
  // постоянным балластом: у этой машины киль галереи и есть трюм. Это
  // единственный орган корабля, создающий момент по крену и тангажу: он не
  // прикладывает силу, а возит настоящий балласт, и живой центр масс уезжает
  // вместе с ним. Обе стоят над измеренным центром масс целой машины, поэтому
  // сами по себе развесовку не меняют. Снаружи не видны, но куски настоящие:
  // вскроют обшивку — тележку унесёт вместе с балластом.
  for (const [axis, y, travel, mass, along] of [
    ["pitch", 5.3, 5.5, 9.1, true],
    ["roll", 5.62, 1.05, 20.8, false],
  ] as const) {
    const railLength = travel * 2 + 0.8;
    const railPosition = basaltSkyRamPoint(-0.68, -0.02, y);
    addPiece(
      pieces,
      `${clusterId}:trim:${axis}:rail`,
      clusterId,
      "steel",
      "cylinder",
      railPosition,
      [0.12, railLength, 0.12],
      SOOT,
      {
        // Корпус лежит вдоль мировой Z, поэтому продольный рельс кладётся по
        // z, а поперечный — по x.
        rotation: along ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
        contactBoxes: [{
          position: railPosition,
          size: along ? [0.2, 0.2, railLength] : [railLength, 0.2, 0.2],
        }],
        // Привод и есть обязательное ядро органа: рельс перебит — тележка
        // больше не едет, даже если сама цела.
        actuator: {
          id: `basalt-sky-ram:trim:${axis}`,
          commandChannel: `trim:${axis}`,
          required: true,
        },
        bearsLoad: false,
      },
    );
    // Балласт в кованом коробе: объём задан отдельно, иначе короб такого
    // размера весил бы как пустая жестянка.
    addPiece(
      pieces,
      `${clusterId}:trim:${axis}:car`,
      clusterId,
      "steel",
      "steelSheet",
      // Тележка висит под рельсом на короткой серьге, а не сидит в нём.
      [railPosition[0], railPosition[1] - 0.3, railPosition[2]],
      along ? [0.66, 0.44, 0.82] : [0.82, 0.44, 0.66],
      "#5f5a55",
      {
        volume: mass / 3.6,
        contactBoxes: [{
          position: [railPosition[0], railPosition[1] - 0.3, railPosition[2]],
          size: [0.9, 0.52, 0.9],
        }],
        actuator: {
          id: `basalt-sky-ram:trim:${axis}`,
          commandChannel: `trim:${axis}`,
          required: true,
        },
        bearsLoad: false,
      },
    );
  }

  lamps.push({
    id: "stronghold:sky-ram:core-glow",
    position: BASALT_SKY_RAM_ORIGIN,
    carrierClusterId: clusterId,
    color: "#ff9b55",
    distance: 14,
    intensity: 1.65,
    poolPriority: 3,
    eventLighting: ramEventLighting,
  });

  // Every shell cassette is lofted between the SAME section vertices as its
  // neighbours. This is an exact watertight surface, not a row of overlapping
  // flat rectangles trying to approximate one.
  const bays = ENVELOPE_SECTIONS.length - 1;
  const gores = 12;
  const goresPerCassette = 3;
  for (let bay = 0; bay < bays; bay += 1) {
    const from = ENVELOPE_SECTIONS[bay];
    const to = ENVELOPE_SECTIONS[bay + 1];
    for (let cassette = 0; cassette < gores / goresPerCassette; cassette += 1) {
      const firstGore = cassette * goresPerCassette;
      const vertices: SceneVector3[] = [];
      for (const section of [from, to]) {
        for (let edge = 0; edge <= goresPerCassette; edge += 1) {
          const phi = ((firstGore + edge) / gores) * Math.PI * 2;
          vertices.push(envelopePointOnSection(section, phi));
        }
      }
      const row = goresPerCassette + 1;
      const indices: number[] = [];
      for (let gore = 0; gore < goresPerCassette; gore += 1) {
        indices.push(
          gore,
          row + gore + 1,
          gore + 1,
          gore,
          row + gore,
          row + gore + 1,
        );
      }
      const belly = cassette === 1 || cassette === 2;
      addSurfaceMeshPiece(
        pieces,
        `stronghold:sky-ram:skin:${bay}:${cassette}`,
        clusterId,
        "cloth",
        "panel",
        vertices,
        indices,
        belly
          ? SOOT
          : (bay + cassette) % 3 === 0
            ? "#292f32"
            : (bay + cassette) % 2 === 0
              ? BLACK_CLOTH
              : BLACK_CLOTH_DARK,
        {
          volume: indexedSurfaceArea(vertices, indices) * 0.04,
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.34,
        },
      );
    }
  }

  // Exact triangulated end faces close the final asymmetric nose line and the
  // narrow tail aperture without introducing a foreign spherical cap.
  for (const [name, section, nose] of [
    ["tail", ENVELOPE_SECTIONS[0], false],
    ["nose", ENVELOPE_SECTIONS[ENVELOPE_SECTIONS.length - 1], true],
  ] as const) {
    const rim = Array.from({ length: gores }, (_, gore) =>
      envelopePointOnSection(section, (gore / gores) * Math.PI * 2));
    const centre = [0, 1, 2].map((axis) =>
      rim.reduce((sum, point) => sum + point[axis], 0) / rim.length) as unknown as SceneVector3;
    const vertices = [...rim, centre];
    const indices: number[] = [];
    for (let gore = 0; gore < gores; gore += 1) {
      const next = (gore + 1) % gores;
      indices.push(
        gores,
        ...(nose ? [next, gore] : [gore, next]),
      );
    }
    addSurfaceMeshPiece(
      pieces,
      `stronghold:sky-ram:cap:${name}`,
      clusterId,
      "cloth",
      "panel",
      vertices,
      indices,
      name === "nose" ? BLACK_CLOTH : BLACK_CLOTH_DARK,
      {
        volume: indexedSurfaceArea(vertices, indices) * 0.04,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.42,
      },
    );
  }
  // External frame rings and twelve longitudinal ribs visibly explain how a
  // damaged gas hull can remain a single machine until the structure fails.
  for (let ring = 1; ring < ENVELOPE_SECTIONS.length - 1; ring += 2) {
    const a = ENVELOPE_SECTIONS[ring].a;
    const radius = envelopeRadius(a) + 0.08;
    for (let segment = 0; segment < gores; segment += 1) {
      const phi = ((segment + 0.5) / gores) * Math.PI * 2;
      const frame = envelopeSurfaceFrame(a, phi);
      const position = envelopeSurfacePoint(a, phi);
      addPiece(
        pieces,
        `stronghold:sky-ram:ring:${ring}:${segment}`,
        clusterId,
        "steel",
        "steelSheet",
        position,
        [0.2, 0.14, 2 * Math.PI * radius / gores + 0.08],
        segment % 2 === 0 ? IRON_EDGE : IRON,
        {
          rotation: orient(frame.longitudinal, frame.outward),
          bearsLoad: false,
          sideAttachmentReach: 0.38,
        },
      );
    }
  }
  for (let stringer = 0; stringer < gores; stringer += 1) {
    const phi = (stringer / gores) * Math.PI * 2;
    for (let bay = 0; bay < bays; bay += 1) {
      const from = ENVELOPE_SECTIONS[bay];
      const to = ENVELOPE_SECTIONS[bay + 1];
      const a = (from.a + to.a) / 2;
      const frame = envelopeSurfaceFrame(a, phi);
      const fromPosition = envelopePointOnSection(from, phi);
      const toPosition = envelopePointOnSection(to, phi);
      const position: SceneVector3 = [
        (fromPosition[0] + toPosition[0]) / 2,
        (fromPosition[1] + toPosition[1]) / 2,
        (fromPosition[2] + toPosition[2]) / 2,
      ];
      const length = Math.hypot(
        toPosition[0] - fromPosition[0],
        toPosition[1] - fromPosition[1],
        toPosition[2] - fromPosition[2],
      );
      addPiece(
        pieces,
        `stronghold:sky-ram:stringer:${stringer}:${bay}`,
        clusterId,
        "steel",
        "steelSheet",
        position,
        [length + 0.08, 0.12, 0.15],
        IRON_EDGE,
        {
          rotation: orient(frame.longitudinal, frame.outward),
          bearsLoad: false,
          sideAttachmentReach: 0.38,
        },
      );
    }
  }

  // Sparse slate armour protects the gas-cell belt, but deliberately leaves
  // seams and crown fabric vulnerable. Losing it also changes real mass/COM.
  for (const side of [-1, 1] as const) {
    for (const bay of [2, 5, 8, 11] as const) {
      const from = ENVELOPE_SECTIONS[bay];
      const to = ENVELOPE_SECTIONS[bay + 1];
      const a = (from.a + to.a) / 2;
      const surface = envelopeSurfacePoint(
        a,
        side > 0 ? Math.PI / 2 : (Math.PI * 3) / 2,
      );
      addPiece(
        pieces,
        `stronghold:sky-ram:armour:${side}:${bay}`,
        clusterId,
        "graphiteStone",
        "stoneBlock",
        [surface[0] + side * 0.13, surface[1], surface[2]],
        [0.16, 1.28, Math.min(1.85, to.a - from.a) * 0.78],
        bay % 4 === 1 ? "#3c4143" : "#303638",
        {
          rotation: [0, 0, side > 0 ? -0.04 : 0.04],
          volume: 0.24,
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.42,
        },
      );
      for (const rivetY of [-0.48, 0.48] as const) {
        addPiece(
          pieces,
          `stronghold:sky-ram:armour:${side}:${bay}:rivet:${rivetY}`,
          clusterId,
          "steel",
          "cylinder",
          [
            surface[0] + side * 0.24,
            surface[1] + rivetY,
            surface[2],
          ],
          [0.13, 0.12, 0.13],
          OLD_BRASS,
          {
            rotation: [0, 0, Math.PI / 2],
            bearsLoad: false,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.12,
          },
        );
      }
    }
  }

  // The central pressure volume is a fighting citadel, not a civil gas bag.
  // Three courses of seven overlapping plates on each broadside form one
  // continuous armour citadel over the four central keel cells and the
  // lift-distribution manifold. Every lower course follows the next canonical
  // hull meridian while the upper course stands slightly farther out and
  // shingles over it. Only the diagonal trusses pass into the breathing hull;
  // each circular boss is the visible end of one of those internal frames.
  const citadelStations = [-7.75, -5.4, -3.05, -0.7, 1.65, 4, 6.35] as const;
  const citadelKeelCells = [1, 1, 2, 2, 3, 3, 4] as const;
  const citadelCourses = [
    { phi: Math.PI / 3, standOff: 0.48 },
    { phi: (Math.PI * 13) / 30, standOff: 0.44 },
    { phi: (Math.PI * 47) / 90, standOff: 0.4 },
  ] as const;
  for (const side of [-1, 1] as const) {
    for (const [course, courseDefinition] of citadelCourses.entries()) {
      const phi = side > 0
        ? courseDefinition.phi
        : Math.PI * 2 - courseDefinition.phi;
      const standOff = courseDefinition.standOff;
      for (const [panel, a] of citadelStations.entries()) {
      const surface = envelopeSurfacePoint(a, phi);
      const frame = envelopeSurfaceFrame(a, phi);
      const verticalCandidate = norm(cross(frame.longitudinal, frame.outward));
      const vertical: SceneVector3 = verticalCandidate[1] >= 0
        ? verticalCandidate
        : [-verticalCandidate[0], -verticalCandidate[1], -verticalCandidate[2]];
      const plateId = `stronghold:sky-ram:citadel-belt:${side}:${course}:${panel}`;
      const trussId = `stronghold:sky-ram:citadel-truss:${side}:${course}:${panel}`;
      const trussFrom = ramPoint(
        a,
        side * 0.42,
        BASALT_SKY_RAM_ORIGIN[1] + 0.45,
      );
      const trussTo: SceneVector3 = [
        surface[0] + frame.outward[0] * (standOff - 0.15),
        surface[1] + frame.outward[1] * (standOff - 0.15),
        surface[2] + frame.outward[2] * (standOff - 0.15),
      ];
      const plateCentre: SceneVector3 = [
        surface[0] + frame.outward[0] * standOff,
        surface[1] + frame.outward[1] * standOff,
        surface[2] + frame.outward[2] * standOff,
      ];
      addRod(
        pieces,
        trussId,
        clusterId,
        trussFrom,
        trussTo,
        0.16,
        IRON_EDGE,
        {
          volume: 0.018,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.44,
          contactBoxes: [{
            position: [
              (trussFrom[0] + trussTo[0]) / 2,
              (trussFrom[1] + trussTo[1]) / 2,
              (trussFrom[2] + trussTo[2]) / 2,
            ],
            size: [
              Math.abs(trussTo[0] - trussFrom[0]) + 0.16,
              Math.abs(trussTo[1] - trussFrom[1]) + 0.16,
              Math.abs(trussTo[2] - trussFrom[2]) + 0.16,
            ],
          }],
          attachmentSupportIds: [
            `stronghold:sky-ram:keel-cell:${citadelKeelCells[panel]}`,
          ],
        },
      );
      addPiece(
        pieces,
        plateId,
        clusterId,
        "steel",
        "steelSheet",
        plateCentre,
        [2.5, 0.14, 1.5],
        (panel + course) % 2 === 0 ? CITADEL_STEEL : CITADEL_STEEL_DARK,
        {
          rotation: orient(frame.longitudinal, frame.outward),
          volume: 0.115,
          bearsLoad: true,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.48,
          contactBoxes: [{
            position: plateCentre,
            size: [0, 1, 2].map((axis) =>
              Math.abs(frame.longitudinal[axis]) * 2.5 +
              Math.abs(frame.outward[axis]) * 0.14 +
              Math.abs(vertical[axis]) * 1.5
            ) as unknown as SceneVector3,
          }],
          attachmentSupportIds: [trussId],
        },
      );

      const headPosition: SceneVector3 = [
        plateCentre[0] + frame.outward[0] * 0.13,
        plateCentre[1] + frame.outward[1] * 0.13,
        plateCentre[2] + frame.outward[2] * 0.13,
      ];
      addPiece(
        pieces,
        `${plateId}:truss-head`,
        clusterId,
        "steel",
        "cylinder",
        headPosition,
        [0.28, 0.18, 0.28],
        IRON_EDGE,
        {
          rotation: orient(frame.longitudinal, frame.outward),
          volume: 0.008,
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.16,
          attachmentSupportIds: [plateId],
        },
      );

      for (const along of [-0.92, 0.92] as const) {
        for (const across of [-0.57, 0.57] as const) {
          const rivetId = `${plateId}:rivet:${along}:${across}`;
          addPiece(
            pieces,
            rivetId,
            clusterId,
            "steel",
            "cylinder",
            [
              plateCentre[0] +
                frame.longitudinal[0] * along +
                vertical[0] * across +
                frame.outward[0] * 0.13,
              plateCentre[1] +
                frame.longitudinal[1] * along +
                vertical[1] * across +
                frame.outward[1] * 0.13,
              plateCentre[2] +
                frame.longitudinal[2] * along +
                vertical[2] * across +
                frame.outward[2] * 0.13,
            ],
            [0.12, 0.1, 0.12],
            RIVET_STEEL,
            {
              rotation: orient(frame.longitudinal, frame.outward),
              volume: 0.001,
              bearsLoad: false,
              attachmentSupportMode: "cable",
              sideAttachmentReach: 0.28,
              attachmentSupportIds: [plateId],
            },
          );
        }
      }
    }
  }
  }

  // The broadside belt must not stop where the whale forehead begins. Five
  // shrinking plates continue every course over the compound bow curve. As
  // the loft closes, its surface normals turn these plates progressively into
  // a real frontal glacis instead of a flat cap that would square off the
  // silhouette. The longitudinal and circumferential overlaps stay physical
  // all the way to the narrow nose seam; each plate has its own tie back to
  // the forward keel cell, so this armour is structure rather than decal.
  const bowArmourStations = [
    { a: 7.75, length: 1.4, height: 1.45, standOff: 0.4 },
    { a: 8.5, length: 1.25, height: 1.25, standOff: 0.385 },
    { a: 9.05, length: 1.34, height: 1, standOff: 0.37 },
    { a: 9.43, length: 0.95, height: 0.68, standOff: 0.355 },
    { a: 9.61, length: 0.78, height: 0.38, standOff: 0.34 },
  ] as const;
  for (const side of [-1, 1] as const) {
    for (const [course, courseDefinition] of citadelCourses.entries()) {
      const phi = side > 0
        ? courseDefinition.phi
        : Math.PI * 2 - courseDefinition.phi;
      for (const [panel, station] of bowArmourStations.entries()) {
        const surface = envelopeSurfacePoint(station.a, phi);
        const frame = envelopeSurfaceFrame(station.a, phi);
        const verticalCandidate = norm(cross(frame.longitudinal, frame.outward));
        const vertical: SceneVector3 = verticalCandidate[1] >= 0
          ? verticalCandidate
          : [-verticalCandidate[0], -verticalCandidate[1], -verticalCandidate[2]];
        const plateId =
          `stronghold:sky-ram:bow-glacis:${side}:${course}:${panel}`;
        const trussId =
          `stronghold:sky-ram:bow-glacis-truss:${side}:${course}:${panel}`;
        const trussFrom = ramPoint(
          Math.min(station.a, 8.85),
          side * 0.32,
          13.05,
        );
        const trussTo: SceneVector3 = [
          surface[0] + frame.outward[0] * (station.standOff - 0.12),
          surface[1] + frame.outward[1] * (station.standOff - 0.12),
          surface[2] + frame.outward[2] * (station.standOff - 0.12),
        ];
        const plateCentre: SceneVector3 = [
          surface[0] + frame.outward[0] * station.standOff,
          surface[1] + frame.outward[1] * station.standOff,
          surface[2] + frame.outward[2] * station.standOff,
        ];

        addRod(
          pieces,
          trussId,
          clusterId,
          trussFrom,
          trussTo,
          0.14,
          IRON_EDGE,
          {
            volume: 0.012,
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.42,
            contactBoxes: [{
              position: [
                (trussFrom[0] + trussTo[0]) / 2,
                (trussFrom[1] + trussTo[1]) / 2,
                (trussFrom[2] + trussTo[2]) / 2,
              ],
              size: [
                Math.abs(trussTo[0] - trussFrom[0]) + 0.14,
                Math.abs(trussTo[1] - trussFrom[1]) + 0.14,
                Math.abs(trussTo[2] - trussFrom[2]) + 0.14,
              ],
            }],
            attachmentSupportIds: ["stronghold:sky-ram:keel-cell:4"],
          },
        );
        addPiece(
          pieces,
          plateId,
          clusterId,
          "steel",
          "steelSheet",
          plateCentre,
          [station.length, 0.14, station.height],
          (panel + course) % 2 === 0 ? CITADEL_STEEL : CITADEL_STEEL_DARK,
          {
            rotation: orient(frame.longitudinal, frame.outward),
            volume:
              0.115 * station.length * station.height / (2.5 * 1.5),
            bearsLoad: true,
            carriesAttachments: true,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.44,
            contactBoxes: [{
              position: plateCentre,
              size: [0, 1, 2].map((axis) =>
                Math.abs(frame.longitudinal[axis]) * station.length +
                Math.abs(frame.outward[axis]) * 0.14 +
                Math.abs(vertical[axis]) * station.height
              ) as unknown as SceneVector3,
            }],
            attachmentSupportIds: [trussId],
          },
        );

        for (const along of [-0.34, 0.34] as const) {
          for (const across of [-0.34, 0.34] as const) {
            addPiece(
              pieces,
              `${plateId}:rivet:${along}:${across}`,
              clusterId,
              "steel",
              "cylinder",
              [
                plateCentre[0] +
                  frame.longitudinal[0] * station.length * along +
                  vertical[0] * station.height * across +
                  frame.outward[0] * 0.13,
                plateCentre[1] +
                  frame.longitudinal[1] * station.length * along +
                  vertical[1] * station.height * across +
                  frame.outward[1] * 0.13,
                plateCentre[2] +
                  frame.longitudinal[2] * station.length * along +
                  vertical[2] * station.height * across +
                  frame.outward[2] * 0.13,
              ],
              [0.1, 0.08, 0.1],
              RIVET_STEEL,
              {
                rotation: orient(frame.longitudinal, frame.outward),
                volume: 0.0006,
                bearsLoad: false,
                attachmentSupportMode: "cable",
                sideAttachmentReach: 0.22,
                attachmentSupportIds: [plateId],
              },
            );
          }
        }
      }
    }
  }

  // Two long furnace ducts are buried into the lower quarters of the whale
  // hull. They are not pods on brackets: segmented outer cheeks continue the
  // breathing armour line, while the red forward glass sits behind a deep
  // four-lipped embrasure. The real pressure chambers live under those
  // cheeks, so superficial fire has to strip armour before it can cost thrust.
  for (const side of [-1, 1] as const) {
    const ductAxisX = side * 1.65;
    const ductHeight = 1.08;
    const skinOverlap = 0.18;
    const ductCentreY = (a: number): number =>
      envelopeSectionAt(a).bottom - ductHeight / 2 + skinOverlap;
    const actuatorId = `stronghold:sky-ram:furnace:${side}`;
    const commandChannel = `throttle:${side < 0 ? 0 : 1}`;
    addPiece(
      pieces,
      `stronghold:sky-ram:engine:${side}:core`,
      clusterId,
      "steel",
      "cylinder",
      ramPoint(-0.8, ductAxisX, ductCentreY(-0.8)),
      [0.5, 12.2, 0.5],
      "#2b2523",
      {
        rotation: [Math.PI / 2, 0, 0],
        volume: 0.92,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
        actuator: {
          id: actuatorId,
          commandChannel,
          required: true,
        },
      },
    );

    const panelCentres = [-6.25, -4.45, -2.65, -0.85, 0.95, 2.75, 4.55] as const;
    for (const [index, a] of panelCentres.entries()) {
      addPiece(
        pieces,
        `stronghold:sky-ram:engine:${side}:armour:${index}`,
        clusterId,
        "graphiteStone",
        "stoneBlock",
        ramPoint(a, ductAxisX, ductCentreY(a)),
        // Плиты идут шагом 1.8 и смыкаются встык. Стояло 1.86 — нахлёст 60 мм
        // при ОДИНАКОВОМ выносе наружу, то есть не чешуя, а две копланарные
        // грани в споре: чешуя лапает со смещением, здесь смещения нет.
        // Обвод остаётся гранёным — соседние плиты сидят на разной высоте по
        // `ductCentreY`, и стык читается ступенькой, как на настоящей броне.
        [1.34, ductHeight, 1.8],
        index % 2 === 0 ? "#454c4e" : "#343b3d",
        {
          volume: 0.07,
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.46,
        },
      );
      if (index === 0 || index === panelCentres.length - 1) {
        continue;
      }
      addPiece(
        pieces,
        `stronghold:sky-ram:engine:${side}:chamber:${index}`,
        clusterId,
        "steel",
        "steelSheet",
        ramPoint(a, ductAxisX, ductCentreY(a)),
        [0.72, 0.48, 1.46],
        index % 2 === 0 ? "#54271f" : "#3a2521",
        {
          volume: 0.085,
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.42,
          actuator: {
            id: actuatorId,
            commandChannel,
            contribution: 0.17,
          },
        },
      );
    }

    // Five thin steel cheek shields cover the required pressure core from the
    // exposed broadside. Their upper and lower gaps still ventilate the long
    // furnace, while the forward red embrasure and aft exhaust remain open.
    // The shields add real symmetric mass but do not move the ducts or their
    // physical thrust points.
    const shieldRailId = `stronghold:sky-ram:engine:${side}:steel-shield-rail`;
    const shieldRailPosition = ramPoint(
      -0.85,
      side * (Math.abs(ductAxisX) + 0.53),
      ductCentreY(-0.85),
    );
    addPiece(
      pieces,
      shieldRailId,
      clusterId,
      "steel",
      "cylinder",
      shieldRailPosition,
      [0.14, 8.8, 0.14],
      IRON_EDGE,
      {
        rotation: [Math.PI / 2, 0, 0],
        volume: 0.03,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.32,
        contactBoxes: [{
          position: shieldRailPosition,
          size: [0.14, 0.14, 8.8],
        }],
        attachmentSupportIds: [`stronghold:sky-ram:engine:${side}:core`],
      },
    );
    for (const [shield, a] of panelCentres.slice(1, -1).entries()) {
      const shieldId = `stronghold:sky-ram:engine:${side}:steel-shield:${shield}`;
      const shieldX = side * (Math.abs(ductAxisX) + 0.8);
      const shieldY = ductCentreY(a);
      addPiece(
        pieces,
        shieldId,
        clusterId,
        "steel",
        "steelSheet",
        ramPoint(a, shieldX, shieldY),
        [0.14, 1.02, 1.9],
        shield % 2 === 0 ? CITADEL_STEEL_DARK : CITADEL_STEEL,
        {
          volume: 0.102,
          bearsLoad: true,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.34,
          attachmentSupportIds: [shieldRailId],
        },
      );
      for (const vertical of [-0.39, 0.39] as const) {
        for (const longitudinal of [-0.72, 0.72] as const) {
          addPiece(
            pieces,
            `${shieldId}:rivet:${vertical}:${longitudinal}`,
            clusterId,
            "steel",
            "cylinder",
            [
              shieldX + side * 0.1,
              shieldY + vertical,
              RAM_ORIGIN_Z + a + longitudinal,
            ],
            [0.11, 0.08, 0.11],
            RIVET_STEEL,
            {
              rotation: [0, 0, Math.PI / 2],
              volume: 0.0008,
              bearsLoad: false,
              attachmentSupportMode: "cable",
              sideAttachmentReach: 0.24,
              attachmentSupportIds: [shieldId],
            },
          );
        }
      }
    }

    const outletSurface = ramPoint(-7.35, ductAxisX, ductCentreY(-7.35));
    addPiece(
      pieces,
      `stronghold:sky-ram:engine:${side}:outlet-collar`,
      clusterId,
      "graphiteStone",
      "cylinder",
      [outletSurface[0], outletSurface[1], outletSurface[2] - 0.12],
      [1.02, 0.34, 1.02],
      "#353b3d",
      {
        rotation: [Math.PI / 2, 0, 0],
        volume: 0.12,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.45,
      },
    );
    addPiece(
      pieces,
      `stronghold:sky-ram:engine:${side}:outlet`,
      clusterId,
      "steel",
      "cylinder",
      [outletSurface[0], outletSurface[1], outletSurface[2] - 0.38],
      [0.72, 0.74, 0.72],
      SOOT,
      {
        rotation: [Math.PI / 2, 0, 0],
        volume: 0.16,
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        actuator: {
          id: actuatorId,
          commandChannel,
          contribution: 0.15,
        },
      },
    );

    const front = ramPoint(5.45, ductAxisX, ductCentreY(5.45));
    const glassCentre: SceneVector3 = [front[0], front[1], front[2] + 0.18];
    const glassId = `stronghold:sky-ram:engine:${side}:furnace-glass`;
    addPiece(
      pieces,
      glassId,
      clusterId,
      "darkGlass",
      "glassPane",
      glassCentre,
      [0.78, 0.5, 0.1],
      "#b8321f",
      {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.22,
      },
    );
    for (const lip of [-1, 1] as const) {
      addPiece(
        pieces,
        `stronghold:sky-ram:engine:${side}:glass-lip:long:${lip}`,
        clusterId,
        "graphiteStone",
        "stoneBlock",
        [
          glassCentre[0],
          glassCentre[1] + lip * 0.38,
          glassCentre[2] + 0.16,
        ],
        [1.18, 0.18, 0.34],
        lip > 0 ? "#3a4042" : "#292f31",
        {
          volume: 0.08,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        },
      );
      addPiece(
        pieces,
        `stronghold:sky-ram:engine:${side}:glass-lip:short:${lip}`,
        clusterId,
        "graphiteStone",
        "stoneBlock",
        [
          glassCentre[0] + lip * 0.53,
          glassCentre[1],
          glassCentre[2] + 0.16,
        ],
        [0.18, 0.86, 0.34],
        lip > 0 ? "#303638" : "#242a2c",
        {
          volume: 0.075,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.4,
        },
      );
    }
    lamps.push({
      id: glassId,
      position: [glassCentre[0], glassCentre[1], glassCentre[2] + 0.05],
      carrierClusterId: clusterId,
      color: "#ff3d23",
      distance: 11,
      intensity: 5.2,
      poolPriority: 8,
      dayIntensityFactor: 0.7,
      eventLighting: ramEventLighting,
      transition: { fadeInSeconds: 0.35, fadeOutSeconds: 0.8 },
    });
  }

  // A separate dorsal awning follows the sperm-whale back. Two rows of the
  // same graphite armour fall 25° away from a ventilated ridge. The raised
  // stand-off carries both eaves over the side armour instead of through it.
  const awningAngle = (25 * Math.PI) / 180;
  const awningSlopeLength = 4.0;
  const awningCourseLength = awningSlopeLength / 2;
  const awningRidgeHalfGap = 0.12;
  const awningPanelLength = 2.08;
  const awningStandOff = 0.84;
  const awningPanels = [
    [-10.0, -9.7],
    [-7.7, -7.35],
    [-5.4, -5.0],
    [-3.1, -2.65],
    [-0.8, -0.3],
    [1.5, 2.05],
    [3.8, 4.4],
    [6.1, 6.75],
  ] as const;
  for (const [panel, a] of awningPanels) {
    const crown = envelopeSurfacePoint(a, 0);
    const ridgeY = crown[1] + awningStandOff;
    for (const side of [-1, 1] as const) {
      for (const course of [0, 1] as const) {
        const slopeDistance = (course + 0.5) * awningCourseLength;
        addPiece(
          pieces,
          `stronghold:sky-ram:dorsal-awning:${side}:${panel}:${course}`,
          clusterId,
          "graphiteStone",
          "stoneBlock",
          [
            side * (
              awningRidgeHalfGap +
              Math.cos(awningAngle) * slopeDistance
            ),
            ridgeY - Math.sin(awningAngle) * slopeDistance,
            crown[2],
          ],
          [awningCourseLength, 0.11, awningPanelLength],
          (panel + course) % 2 === 0 ? "#3c4244" : "#303638",
          {
            rotation: [0, 0, -side * awningAngle],
            volume: 0.055,
            bearsLoad: false,
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.72,
          },
        );
      }
    }
  }

  // Four red furnace eyes sit below real breaks between roof cassettes. The
  // armour occludes their bodies; only the longitudinal seams and the narrow
  // ventilated ridge expose the glow. Their screen-space beacons preserve the
  // same read at patrol distance without turning the hull itself emissive.
  const dorsalEmberGroupId = "stronghold:sky-ram:dorsal-embers";
  for (const [ember, panelIndex] of [0, 2, 4, 6].entries()) {
    const left = envelopeSurfacePoint(awningPanels[panelIndex][1], 0);
    const right = envelopeSurfacePoint(awningPanels[panelIndex + 1][1], 0);
    const position: SceneVector3 = [
      0,
      Math.min(left[1], right[1]) + awningStandOff - 0.22,
      (left[2] + right[2]) / 2,
    ];
    const id = `stronghold:sky-ram:dorsal-ember:${ember}`;
    addPiece(
      pieces,
      id,
      clusterId,
      "darkGlass",
      "sphere",
      position,
      [0.3, 0.3, 0.3],
      "#ff5a2f",
      {
        volume: 0.001,
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.72,
      },
    );
    lamps.push({
      id,
      position,
      carrierClusterId: clusterId,
      color: "#ff2918",
      distance: 25,
      intensity: 7.4,
      poolPriority: 36,
      poolGroupId: dorsalEmberGroupId,
      dayIntensityFactor: 0.82,
      beacon: {
        physicalDiameter: 0.34,
        minScreenDiameter: 7,
        maxWorldDiameter: 1.7,
        dayOpacity: 0.82,
        nightOpacity: 1,
      },
      eventLighting: dorsalEmberEventLighting,
      transition: { fadeInSeconds: 0.28, fadeOutSeconds: 0.7 },
    });
  }
  for (const a of [-10.65, -7.45, -3.9, -0.15, 3.65, 6.85] as const) {
    const crown = envelopeSurfacePoint(a, 0);
    const ridgeY = crown[1] + awningStandOff;
    for (const side of [-1, 1] as const) {
      const eavePhi = side > 0 ? 1.12 : Math.PI * 2 - 1.12;
      const middlePhi = side > 0 ? 0.58 : Math.PI * 2 - 0.58;
      const skinAnchor = envelopeSurfacePoint(a, eavePhi);
      const middleSkinAnchor = envelopeSurfacePoint(a, middlePhi);
      const eave: SceneVector3 = [
        side * (
          awningRidgeHalfGap +
          Math.cos(awningAngle) * awningSlopeLength
        ),
        ridgeY - Math.sin(awningAngle) * awningSlopeLength,
        crown[2],
      ];
      const middle: SceneVector3 = [
        side * (
          awningRidgeHalfGap +
          Math.cos(awningAngle) * awningCourseLength
        ),
        ridgeY - Math.sin(awningAngle) * awningCourseLength,
        crown[2],
      ];
      addRod(
        pieces,
        `stronghold:sky-ram:dorsal-awning:ridge-post:${side}:${a}`,
        clusterId,
        [crown[0] + side * 0.09, crown[1] - 0.02, crown[2]],
        [side * awningRidgeHalfGap, ridgeY, crown[2]],
        0.1,
        IRON_EDGE,
        { attachmentSupportMode: "cable", sideAttachmentReach: 0.68 },
      );
      addRod(
        pieces,
        `stronghold:sky-ram:dorsal-awning:middle-stay:${side}:${a}`,
        clusterId,
        middleSkinAnchor,
        middle,
        0.1,
        IRON_EDGE,
        { attachmentSupportMode: "cable", sideAttachmentReach: 0.68 },
      );
      addRod(
        pieces,
        `stronghold:sky-ram:dorsal-awning:eave-stay:${side}:${a}`,
        clusterId,
        skinAnchor,
        eave,
        0.1,
        IRON_EDGE,
        { attachmentSupportMode: "cable", sideAttachmentReach: 0.68 },
      );
    }
  }

  // Iron chain suspension. Each diagonal has a different load path: severing
  // a corner leaves the gallery visibly hanging from what remains.
  for (const a of [-6.2, -2.1, 2.1, 6.0] as const) {
    for (const side of [-1, 1] as const) {
      addRod(
        pieces,
        `stronghold:sky-ram:suspension:${a}:${side}:outer`,
        clusterId,
        ramPoint(a, side * 2.65, 10.35),
        ramPoint(a, side * 1.84, 8.02),
        0.13,
        "#343a3d",
        { attachmentSupportMode: "cable", sideAttachmentReach: 0.35 },
      );
      addRod(
        pieces,
        `stronghold:sky-ram:suspension:${a}:${side}:cross`,
        clusterId,
        ramPoint(a - 0.75, side * 2.42, 10.15),
        ramPoint(a + 0.75, side * 1.84, 8.02),
        0.1,
        "#3d4346",
        { attachmentSupportMode: "cable", sideAttachmentReach: 0.35 },
      );
    }
  }

  // Fighting gallery: a narrow keel and splayed armour make an inverted
  // trapezoid in section. The wider shoulder tucks under the furnace ducts;
  // the narrower floor keeps the suspended mass from reading as a box.
  const galleryWallAngle = Math.atan2(
    BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH -
      BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH,
    BASALT_SKY_RAM_GALLERY_ROOF_Y - BASALT_SKY_RAM_GALLERY_FLOOR_Y,
  );
  const gallerySideAt = (y: number): number =>
    BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH +
    (BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH -
      BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH) *
      ((y - BASALT_SKY_RAM_GALLERY_FLOOR_Y) /
        (BASALT_SKY_RAM_GALLERY_ROOF_Y - BASALT_SKY_RAM_GALLERY_FLOOR_Y));
  const floorAs = [-6.5, -4.3, -2.1, 0.1, 2.3, 4.5, 6.4] as const;
  for (const [index, a] of floorAs.entries()) {
    const length = index === floorAs.length - 1 ? 1.6 : 2.08;
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:floor:${index}`,
      clusterId,
      "steel",
      "steelSheet",
      ramPoint(a, 0, BASALT_SKY_RAM_GALLERY_FLOOR_Y),
      [BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH * 2 + 0.08, 0.24, length],
      index % 2 === 0 ? "#353b3e" : "#2d3336",
      { carriesAttachments: true, sideAttachmentReach: 0.42 },
    );
    addRod(
      pieces,
      `stronghold:sky-ram:gallery:keel:${index}`,
      clusterId,
      ramPoint(a - length / 2, 0, BASALT_SKY_RAM_GALLERY_FLOOR_Y - 0.42),
      ramPoint(a + length / 2, 0, BASALT_SKY_RAM_GALLERY_FLOOR_Y - 0.42),
      0.34,
      IRON,
      { carriesAttachments: true },
    );
  }

  // Two solid trim weights are bolted below the aftmost floor cassette. They
  // counter the completed steel bow without changing gas-cell lift or hiding
  // a corrective force in the controller. Their upper faces stay below the
  // deck, their lower faces align with the skids, and each one is physically
  // bolted to the longitudinal keel immediately between them.
  for (const side of [-1, 1] as const) {
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:trim-ballast:${side}`,
      clusterId,
      "steel",
      "stoneBlock",
      ramPoint(-6.5, side * 0.61, 4.74),
      [1.05, 0.72, 1.61],
      side < 0 ? CITADEL_STEEL_DARK : CITADEL_STEEL,
      {
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.28,
        attachmentSupportIds: ["stronghold:sky-ram:gallery:keel:0"],
      },
    );
  }

  for (const side of [-1, 1] as const) {
    for (let bay = 0; bay < 7; bay += 1) {
      const a = -6.25 + bay * 2.02;
      const boardingOpening = side === 1 && (bay === 4 || bay === 5);
      if (!boardingOpening) {
        const lowerBottom = BASALT_SKY_RAM_GALLERY_FLOOR_Y + 0.04;
        const lowerTop = 6.38;
        const lowerY = (lowerBottom + lowerTop) / 2;
        const upperBottom = 6.5;
        const upperTop = BASALT_SKY_RAM_GALLERY_ROOF_Y - 0.08;
        const upperY = (upperBottom + upperTop) / 2;
        addPiece(
          pieces,
          `stronghold:sky-ram:gallery:wall:${side}:${bay}:lower`,
          clusterId,
          "graphiteStone",
          "stoneBlock",
          ramPoint(a, side * gallerySideAt(lowerY), lowerY),
          [0.2, (lowerTop - lowerBottom) / Math.cos(galleryWallAngle), 1.86],
          bay % 2 === 0 ? "#343a3c" : "#292f31",
          {
            volume: 0.19,
            rotation: [0, 0, -side * galleryWallAngle],
            carriesAttachments: true,
            sideAttachmentReach: 0.34,
          },
        );
        addPiece(
          pieces,
          `stronghold:sky-ram:gallery:wall:${side}:${bay}:upper`,
          clusterId,
          "steel",
          "steelSheet",
          ramPoint(a, side * gallerySideAt(upperY), upperY),
          [0.16, (upperTop - upperBottom) / Math.cos(galleryWallAngle), 1.86],
          IRON,
          {
            rotation: [0, 0, -side * galleryWallAngle],
            carriesAttachments: true,
            sideAttachmentReach: 0.34,
          },
        );
        addPiece(
          pieces,
          `stronghold:sky-ram:gallery:slit:${side}:${bay}`,
          clusterId,
          "darkGlass",
          "glassPane",
          ramPoint(a, side * (gallerySideAt(6.44) + 0.105), 6.44),
          [0.04, 0.25, 0.82],
          bay % 3 === 0 ? "#6b281d" : "#394044",
          {
            rotation: [0, 0, -side * galleryWallAngle],
            bearsLoad: false,
            sideAttachmentReach: 0.1,
          },
        );
      } else {
        // Door jambs are real load members; the opening itself stays empty.
        for (const edge of [-1, 1] as const) {
          addRod(
            pieces,
            `stronghold:sky-ram:gallery:door:jamb:${bay}:${edge}`,
            clusterId,
            ramPoint(
              a + edge * 0.82,
              BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH,
              BASALT_SKY_RAM_GALLERY_FLOOR_Y + 0.04,
            ),
            ramPoint(
              a + edge * 0.82,
              BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH,
              BASALT_SKY_RAM_GALLERY_ROOF_Y - 0.04,
            ),
            0.16,
            IRON_EDGE,
          );
        }
      }
    }
  }

  // Deck roof beams and waist-high inner safety rails make the carrier usable
  // in flight without enclosing the player in an opaque collision box.
  for (const a of [-7.15, -5.0, -2.85, -0.7, 1.45, 3.6, 5.75, 7.05] as const) {
    addRod(
      pieces,
      `stronghold:sky-ram:gallery:roof-beam:${a}`,
      clusterId,
      ramPoint(a, -BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH, BASALT_SKY_RAM_GALLERY_ROOF_Y),
      ramPoint(a, BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH, BASALT_SKY_RAM_GALLERY_ROOF_Y),
      0.16,
      IRON_EDGE,
      { carriesAttachments: true },
    );
    for (const side of [-1, 1] as const) {
      addRod(
        pieces,
        `stronghold:sky-ram:gallery:post:${a}:${side}`,
        clusterId,
        ramPoint(
          a,
          side * BASALT_SKY_RAM_GALLERY_BOTTOM_HALF_WIDTH,
          BASALT_SKY_RAM_GALLERY_FLOOR_Y + 0.04,
        ),
        ramPoint(
          a,
          side * BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH,
          BASALT_SKY_RAM_GALLERY_ROOF_Y - 0.04,
        ),
        0.15,
        IRON_EDGE,
      );
    }
  }
  for (let roof = 0; roof < 7; roof += 1) {
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:roof:${roof}`,
      clusterId,
      "steel",
      "steelSheet",
      ramPoint(-6.15 + roof * 2.02, 0, BASALT_SKY_RAM_GALLERY_ROOF_Y + 0.02),
      [BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH * 2 + 0.12, 0.16, 1.9],
      roof % 2 === 0 ? "#262c2f" : "#303639",
      { carriesAttachments: true, sideAttachmentReach: 0.4 },
    );
  }

  // Cargo tail. Closed, the ramp is the sloping lower contour of the stern;
  // opened, it rotates around the floor beam until its lip reaches the same
  // level as the landing skids. The fixed cheeks and roof keep the opening a
  // tapered continuation of the gondola instead of a door pasted on a box.
  const rampHingeA = -7.42;
  const rampTailA = -9.92;
  const rampHingeY = BASALT_SKY_RAM_GALLERY_FLOOR_Y + 0.03;
  const rampTailY = BASALT_SKY_RAM_GALLERY_ROOF_Y - 0.09;
  const rampClosedAngle = Math.atan2(
    rampTailY - rampHingeY,
    rampHingeA - rampTailA,
  );
  const rampLength = Math.hypot(
    rampTailA - rampHingeA,
    rampTailY - rampHingeY,
  );
  const rampPivot = ramPoint(rampHingeA, 0, rampHingeY);
  const rampHinge = {
    pivot: rampPivot,
    direction: [1, 0, 0] as SceneVector3,
    normal: [
      0,
      -Math.cos(rampClosedAngle),
      -Math.sin(rampClosedAngle),
    ] as SceneVector3,
  };
  const rampAttachment = {
    hinge: rampHinge,
    carriesAttachments: true,
    attachmentSupportMode: "cable" as const,
    sideAttachmentReach: 0.62,
    maximumVerticalGap: 0.65,
  };
  const rampStrips = 5;
  for (let strip = 0; strip < rampStrips; strip += 1) {
    const t = (strip + 0.5) / rampStrips;
    const a = rampHingeA + (rampTailA - rampHingeA) * t;
    const y = rampHingeY + (rampTailY - rampHingeY) * t;
    const halfWidth = gallerySideAt(y);
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:ramp:board:${strip}`,
      clusterId,
      "graphiteStone",
      "stoneBlock",
      ramPoint(a, 0, y),
      [halfWidth * 2 - 0.08, 0.14, rampLength / rampStrips + 0.06],
      strip % 2 === 0 ? "#343a3c" : "#292f31",
      {
        ...rampAttachment,
        rotation: [rampClosedAngle, 0, 0],
        volume: 0.075,
        attachmentSupportIds: [
          strip === 0
            ? "stronghold:sky-ram:gallery:floor:0"
            : `stronghold:sky-ram:gallery:ramp:board:${strip - 1}`,
        ],
      },
    );
  }
  for (const [strap, lateral] of [-1.04, 0, 1.04].entries()) {
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:ramp:strap:${strap}`,
      clusterId,
      "steel",
      "steelSheet",
      ramPoint(
        (rampHingeA + rampTailA) / 2,
        lateral,
        (rampHingeY + rampTailY) / 2,
      ),
      [0.12, 0.2, rampLength - 0.16],
      IRON_EDGE,
      {
        ...rampAttachment,
        rotation: [rampClosedAngle, 0, 0],
        attachmentSupportIds: ["stronghold:sky-ram:gallery:ramp:board:2"],
      },
    );
  }
  for (const [brace, t] of [0.18, 0.5, 0.82].entries()) {
    const a = rampHingeA + (rampTailA - rampHingeA) * t;
    const y = rampHingeY + (rampTailY - rampHingeY) * t;
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:ramp:brace:${brace}`,
      clusterId,
      "steel",
      "steelSheet",
      ramPoint(a, 0, y),
      [gallerySideAt(y) * 2 - 0.18, 0.2, 0.14],
      IRON_EDGE,
      {
        ...rampAttachment,
        rotation: [rampClosedAngle, 0, 0],
        attachmentSupportIds: [
          `stronghold:sky-ram:gallery:ramp:board:${Math.min(3, Math.floor(t * 5))}`,
        ],
      },
    );
  }
  for (const [roofIndex, t] of [1 / 6, 0.5, 5 / 6].entries()) {
    addPiece(
      pieces,
      `stronghold:sky-ram:gallery:tail-roof:${roofIndex}`,
      clusterId,
      "steel",
      "steelSheet",
      ramPoint(
        rampHingeA + (rampTailA - rampHingeA) * t,
        0,
        BASALT_SKY_RAM_GALLERY_ROOF_Y + 0.02,
      ),
      [
        BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH * 2 + 0.1,
        0.16,
        (rampHingeA - rampTailA) / 3 + 0.08,
      ],
      roofIndex % 2 === 0 ? "#262c2f" : "#303639",
      {
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.36,
        attachmentSupportIds: [
          roofIndex === 0
            ? "stronghold:sky-ram:gallery:roof-beam:-7.15"
            : `stronghold:sky-ram:gallery:tail-roof:${roofIndex - 1}`,
        ],
      },
    );
  }
  for (const side of [-1, 1] as const) {
    for (let panel = 0; panel < 4; panel += 1) {
      const t0 = panel / 4;
      const t1 = (panel + 1) / 4;
      const a0 = rampHingeA + (rampTailA - rampHingeA) * t0;
      const a1 = rampHingeA + (rampTailA - rampHingeA) * t1;
      const lower0 = rampHingeY + (rampTailY - rampHingeY) * t0;
      const lower1 = rampHingeY + (rampTailY - rampHingeY) * t1;
      const vertices = [
        ramPoint(a0, side * gallerySideAt(lower0), lower0),
        ramPoint(
          a0,
          side * BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH,
          BASALT_SKY_RAM_GALLERY_ROOF_Y,
        ),
        ramPoint(
          a1,
          side * BASALT_SKY_RAM_GALLERY_TOP_HALF_WIDTH,
          BASALT_SKY_RAM_GALLERY_ROOF_Y,
        ),
        ramPoint(a1, side * gallerySideAt(lower1), lower1),
      ] as const;
      addSurfaceMeshPiece(
        pieces,
        `stronghold:sky-ram:gallery:tail-cheek:${side}:${panel}`,
        clusterId,
        "steel",
        "steelSheet",
        vertices,
        side > 0 ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3],
        panel % 2 === 0 ? "#2d3336" : "#252b2e",
        {
          volume: 0.055,
          carriesAttachments: true,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.32,
        },
      );
    }
  }

  // Four landing skids are below the keel, wide enough to form a real support
  // polygon and bowed at their ends by steel stays.
  for (const side of [-1, 1] as const) {
    for (const a of [-4.6, 4.2] as const) {
      addPiece(
        pieces,
        `stronghold:sky-ram:skid:${side}:${a}`,
        clusterId,
        "steel",
        "cylinder",
        ramPoint(a, side * 1.1, 4.38),
        [0.3, 2.9, 0.3],
        "#23292c",
        {
          rotation: [Math.PI / 2, 0, 0],
          carriesAttachments: true,
          maximumVerticalGap: 0.5,
        },
      );
      addRod(
        pieces,
        `stronghold:sky-ram:skid-stay:${side}:${a}`,
        clusterId,
        ramPoint(a, side * 1.28, 4.46),
        ramPoint(a, side * 1.04, BASALT_SKY_RAM_GALLERY_FLOOR_Y - 0.02),
        0.12,
        IRON_EDGE,
      );
    }
  }

  // The ram is a layered cast cone rather than a decorative spike. Its tip
  // is the exact physical point captured by the berth jaw.
  const ramSegments = [
    [7.2, 1.35, 1.25],
    [8.4, 1.05, 1.2],
    [9.5, 0.78, 1.05],
    [10.45, 0.54, 0.9],
    [11.28, 0.32, 0.78],
  ] as const;
  for (const [index, [a, diameter, length]] of ramSegments.entries()) {
    addPiece(
      pieces,
      `stronghold:sky-ram:ram:${index}`,
      clusterId,
      index < 2 ? "graphiteStone" : "steel",
      "cylinder",
      ramPoint(a, 0, 5.72),
      [diameter, length, diameter],
      index < 2 ? "#343a3c" : index === 4 ? "#6d7273" : IRON_EDGE,
      {
        rotation: [Math.PI / 2, 0, 0],
        carriesAttachments: true,
        // Each cast sleeve is an explicit mechanical connector for the next
        // one. The narrow point is pinned only to sleeve 3, never to the
        // berth jaw that happens to surround it while docked.
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.42,
        ...(index === ramSegments.length - 1
          ? {
              attachmentSupportIds: ["stronghold:sky-ram:ram:3"],
            }
          : {}),
      },
    );
  }
  // A compact riveted mantlet turns the first exposed round sleeve into an
  // armoured mounting point. It stays well behind the capture tip, so the
  // berth jaw geometry and mooring tolerances are unchanged.
  const ramMantletId = "stronghold:sky-ram:ram:mantlet";
  const ramMantletPosition = ramPoint(7.55, 0, 5.72);
  addPiece(
    pieces,
    ramMantletId,
    clusterId,
    "steel",
    "hexagonalSheet",
    ramMantletPosition,
    [1.5, 1.22, 0.16],
    CITADEL_STEEL,
    {
      volume: 0.075,
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.34,
      attachmentSupportIds: ["stronghold:sky-ram:ram:0"],
    },
  );
  for (let rivet = 0; rivet < 6; rivet += 1) {
    const angle = (rivet / 6) * Math.PI * 2;
    addPiece(
      pieces,
      `${ramMantletId}:rivet:${rivet}`,
      clusterId,
      "steel",
      "cylinder",
      [
        ramMantletPosition[0] + Math.cos(angle) * 0.48,
        ramMantletPosition[1] + Math.sin(angle) * 0.38,
        ramMantletPosition[2] + 0.12,
      ],
      [0.11, 0.08, 0.11],
      RIVET_STEEL,
      {
        rotation: [Math.PI / 2, 0, 0],
        volume: 0.0008,
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.12,
        attachmentSupportIds: [ramMantletId],
      },
    );
  }
  for (const side of [-1, 1] as const) {
    addRod(
      pieces,
      `stronghold:sky-ram:ram:brace:${side}`,
      clusterId,
      ramPoint(5.9, side * 1.5, 5.05),
      ramPoint(9.25, side * 0.44, 5.72),
      0.22,
      "#3c4245",
    );
  }

  // Tall split tail: enough lever arm for the physical rudder force, and
  // deliberately vulnerable where a fighting machine ought to be vulnerable.
  addPiece(
    pieces,
    "stronghold:sky-ram:tail:spine",
    clusterId,
    "steel",
    "cylinder",
    ramPoint(-14.15, 0, 12.8),
    [0.3, 4.15, 0.3],
    IRON_EDGE,
    {
      carriesAttachments: true,
      actuator: {
        id: "stronghold:sky-ram:rudder",
        commandChannel: "rudder",
        required: true,
      },
    },
  );
  for (const vertical of [-1, 1] as const) {
    addPiece(
      pieces,
      `stronghold:sky-ram:tail:vane:${vertical}`,
      clusterId,
      "cloth",
      "triangularSheet",
      ramPoint(-14.15, 0, 12.8 + vertical * 2.18),
      [4.8, 2.28, 0.1],
      vertical > 0 ? "#242a2d" : "#1b2022",
      {
        rotation: orient([0, 0, 1], [0, vertical, 0]),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
        actuator: {
          id: "stronghold:sky-ram:rudder",
          commandChannel: "rudder",
          contribution: 0.5,
        },
      },
    );
  }
  for (const side of [-1, 1] as const) {
    addPiece(
      pieces,
      `stronghold:sky-ram:tail:side-vane:${side}`,
      clusterId,
      "cloth",
      "triangularSheet",
      ramPoint(-14.15, side * 2.12, 12.8),
      [4.6, 2.15, 0.1],
      side > 0 ? "#303639" : "#22282a",
      {
        rotation: orient([0, 0, 1], [side, 0, 0]),
        bearsLoad: false,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.4,
      },
    );
  }

  return {
    id: clusterId,
    label: "The Sky Ram",
    material: "steel",
    supportMode: "linked",
    pieces,
  };
}

export function createBasaltSkyRamScene(): BasaltSkyRamScene {
  const lamps: LampDefinition[] = [];
  const berth = createRearBarbican(lamps);
  const ram = createSkyRam(lamps);
  return { clusters: [berth, ram], lamps };
}
