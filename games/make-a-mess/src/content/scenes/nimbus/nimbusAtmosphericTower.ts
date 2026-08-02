import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGroundSeatBox,
  nimbusOrient,
  nimbusPrimitive,
  nimbusRod,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_BOWL_YAW,
  nimbusGroundUnder,
  nimbusPointOnShipyard,
} from "./nimbusShell.ts";

export const NIMBUS_ATMOSPHERIC_SUPPORT_COUNT = 6;
export const NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS = [-54, 0, 54] as const;
export const NIMBUS_ATMOSPHERIC_WORK_HALF_LENGTH = 68;
export const NIMBUS_ATMOSPHERIC_WORK_HALF_WIDTH = 31;
export const NIMBUS_ATMOSPHERIC_CLEAR_HEIGHT = 35;
export const NIMBUS_ATMOSPHERIC_BODY_LEVELS = 17;
export const NIMBUS_ATMOSPHERIC_BODY_SECTORS = 26;
export const NIMBUS_ATMOSPHERIC_BODY_BOTTOM = 46;
export const NIMBUS_ATMOSPHERIC_BODY_LEVEL_HEIGHT = 4.5;
export const NIMBUS_ATMOSPHERIC_TOP_BEVEL_HEIGHT = 5;
export const NIMBUS_ATMOSPHERIC_FAN_COUNT = 2;
export const NIMBUS_ATMOSPHERIC_FAN_BOTTOM_LEVEL = 5;
export const NIMBUS_ATMOSPHERIC_FAN_TOP_LEVEL = 11;
export const NIMBUS_ATMOSPHERIC_DUCT_RADIUS = 9.2;
export const NIMBUS_ATMOSPHERIC_DUCT_SEGMENTS = 16;
export const NIMBUS_ATMOSPHERIC_SUPPORT_SEGMENTS = 10;
export const NIMBUS_ATMOSPHERIC_CONSTRUCTION_CRANE_COUNT = 3;

const SUPPORT_BASE_ACROSS = 66;
const SUPPORT_TOP_ACROSS = 31;
const SUPPORT_TOP_HEIGHT = NIMBUS_ATMOSPHERIC_BODY_BOTTOM;
const FOUNDATION_PAD_HEIGHT = 1.2;
const SUPPORT_OUTER_OFFSETS = [
  [-3.5, -2.35],
  [-3.5, 2.35],
  [3.5, -2.35],
  [3.5, 2.35],
] as const;

const CONCRETE_DARK = "#5f6667";
const CONCRETE_MID = "#7d8280";
const STEEL_DARK = "#26343a";
const STEEL_MID = "#4c5d63";
const STEEL_LIGHT = "#8a989a";
const CERAMIC = "#dce1de";
const CERAMIC_WARM = "#c7cec9";
const GLASS = "#16323d";
const AIR_BLUE = "#55b8c7";
const SERVICE_ORANGE = "#d46b32";

const YARD_ALONG: SceneVector3 = [
  Math.cos(NIMBUS_BOWL_YAW),
  0,
  Math.sin(NIMBUS_BOWL_YAW),
];
const YARD_ACROSS: SceneVector3 = [
  -Math.sin(NIMBUS_BOWL_YAW),
  0,
  Math.cos(NIMBUS_BOWL_YAW),
];
const SHIPYARD_CENTRE = nimbusPointOnShipyard(0, 0);
const SHIPYARD_DATUM = nimbusGroundUnder(
  SHIPYARD_CENTRE[0],
  SHIPYARD_CENTRE[2],
).top;
export const NIMBUS_ATMOSPHERIC_BASE_Y = SHIPYARD_DATUM;
export const NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT =
  NIMBUS_ATMOSPHERIC_BODY_BOTTOM
  + (NIMBUS_ATMOSPHERIC_BODY_LEVELS - 1) * NIMBUS_ATMOSPHERIC_BODY_LEVEL_HEIGHT
  + NIMBUS_ATMOSPHERIC_TOP_BEVEL_HEIGHT;
export const NIMBUS_ATMOSPHERIC_ROOF_Y =
  NIMBUS_ATMOSPHERIC_BASE_Y + NIMBUS_ATMOSPHERIC_TOTAL_HEIGHT;

export interface NimbusAtmosphericTowerGroups {
  readonly foundation: NimbusMutableGroup;
  readonly primary: NimbusMutableGroup;
  readonly liftTruss: NimbusMutableGroup;
  readonly floors: NimbusMutableGroup;
  readonly shell: NimbusMutableGroup;
  readonly fittings: NimbusMutableGroup;
  readonly crown: NimbusMutableGroup;
  readonly constructionCranes: NimbusMutableGroup;
}

interface SupportPath {
  readonly index: number;
  readonly side: -1 | 1;
  readonly stationIndex: number;
  readonly base: SceneVector3;
  readonly top: SceneVector3;
  readonly direction: SceneVector3;
  readonly lateral: SceneVector3;
  readonly depth: SceneVector3;
}

interface BodyProfile {
  readonly y: number;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly chamfer: number;
}

function add(
  point: SceneVector3,
  ...offsets: readonly (readonly [SceneVector3, number])[]
): SceneVector3 {
  return offsets.reduce<SceneVector3>(
    (result, [axis, amount]) => [
      result[0] + axis[0] * amount,
      result[1] + axis[1] * amount,
      result[2] + axis[2] * amount,
    ],
    point,
  );
}

function subtract(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: SceneVector3, amount: number): SceneVector3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function normalize(value: SceneVector3): SceneVector3 {
  const length = Math.hypot(...value) || 1;
  return scale(value, 1 / length);
}

function dot(left: SceneVector3, right: SceneVector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function midpoint(...points: readonly SceneVector3[]): SceneVector3 {
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
    points.reduce((sum, point) => sum + point[2], 0) / points.length,
  ];
}

function yardPoint(
  along: number,
  across: number,
  relativeHeight: number,
): SceneVector3 {
  const horizontal = nimbusPointOnShipyard(along, across);
  return [horizontal[0], SHIPYARD_DATUM + relativeHeight, horizontal[2]];
}

function supportTopAlong(station: number): number {
  return station * 0.76;
}

export function nimbusAtmosphericSupportEndpoints(
  station: number,
  side: -1 | 1,
): readonly [SceneVector3, SceneVector3] {
  const horizontal = nimbusPointOnShipyard(station, side * SUPPORT_BASE_ACROSS);
  const ground = nimbusGroundUnder(horizontal[0], horizontal[2]).top;
  return [
    [horizontal[0], ground + FOUNDATION_PAD_HEIGHT, horizontal[2]],
    yardPoint(supportTopAlong(station), side * SUPPORT_TOP_ACROSS, SUPPORT_TOP_HEIGHT),
  ];
}

function supportPaths(): readonly SupportPath[] {
  const paths: SupportPath[] = [];
  for (const [stationIndex, station] of NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS.entries()) {
    for (const side of [-1, 1] as const) {
      const [base, top] = nimbusAtmosphericSupportEndpoints(station, side);
      const direction = normalize(subtract(top, base));
      // Gram-Schmidt keeps the shaft section square even for the end supports,
      // which lean both across the yard and toward the upper mantle.
      const lateral = normalize(subtract(
        YARD_ALONG,
        scale(direction, dot(YARD_ALONG, direction)),
      ));
      const depth = normalize(cross(direction, lateral));
      paths.push({
        index: paths.length,
        side,
        stationIndex,
        base,
        top,
        direction,
        lateral,
        depth,
      });
    }
  }
  return paths;
}

function pointOnSupport(path: SupportPath, t: number): SceneVector3 {
  return [
    path.base[0] + (path.top[0] - path.base[0]) * t,
    path.base[1] + (path.top[1] - path.base[1]) * t,
    path.base[2] + (path.top[2] - path.base[2]) * t,
  ];
}

function createFoundations(
  foundation: NimbusMutableGroup,
  paths: readonly SupportPath[],
): void {
  for (const path of paths) {
    const ground = path.base[1] - FOUNDATION_PAD_HEIGHT;
    const padSize: SceneVector3 = [11.5, FOUNDATION_PAD_HEIGHT, 10.5];
    const padCentre: SceneVector3 = [
      path.base[0],
      ground + FOUNDATION_PAD_HEIGHT / 2,
      path.base[2],
    ];
    nimbusPrimitive(
      foundation,
      `pad:${path.index}`,
      "concrete",
      "panel",
      padCentre,
      padSize,
      path.stationIndex === 1 ? CONCRETE_MID : CONCRETE_DARK,
      {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [nimbusGroundSeatBox(padCentre[1], padSize, ground)],
        contactBearingOrder: true,
        bearingArea: 82,
      },
    );

    for (const [pileIndex, [alongOffset, acrossOffset]] of [
      [-3.5, -3],
      [-3.5, 3],
      [3.5, -3],
      [3.5, 3],
    ].entries()) {
      const pileHorizontal = add(
        path.base,
        [YARD_ALONG, alongOffset],
        [YARD_ACROSS, acrossOffset],
      );
      const pileHeight = 8.5;
      nimbusPrimitive(
        foundation,
        `pile:${path.index}:${pileIndex}`,
        "concrete",
        "cinderBlock",
        [pileHorizontal[0], ground - pileHeight / 2 + 0.35, pileHorizontal[2]],
        [1.7, pileHeight + 0.7, 1.7],
        pileIndex % 2 === 0 ? CONCRETE_DARK : CONCRETE_MID,
        {
          textureProfile: "nimbus-board-formed-concrete",
          bearsLoad: false,
          sideAttachmentReach: 0.8,
          volume: 18,
        },
      );
    }
  }
}

function shaftCorner(
  centre: SceneVector3,
  path: SupportPath,
  lateral: number,
  depth: number,
): SceneVector3 {
  return add(centre, [path.lateral, lateral], [path.depth, depth]);
}

function createSupport(
  primary: NimbusMutableGroup,
  liftTruss: NimbusMutableGroup,
  fittings: NimbusMutableGroup,
  path: SupportPath,
): void {
  const liftOffsets = [
    [-1.25, -0.95],
    [-1.25, 0.95],
    [1.25, -0.95],
    [1.25, 0.95],
  ] as const;

  for (let segment = 0; segment < NIMBUS_ATMOSPHERIC_SUPPORT_SEGMENTS; segment += 1) {
    const fromCentre = pointOnSupport(
      path,
      Math.max(0, segment / NIMBUS_ATMOSPHERIC_SUPPORT_SEGMENTS - 0.008),
    );
    const toCentre = pointOnSupport(
      path,
      Math.min(1, (segment + 1) / NIMBUS_ATMOSPHERIC_SUPPORT_SEGMENTS + 0.008),
    );

    for (const [chord, [lateral, depth]] of SUPPORT_OUTER_OFFSETS.entries()) {
      nimbusRod(
        primary,
        `support:${path.index}:primary:${segment}:${chord}`,
        "concrete",
        shaftCorner(fromCentre, path, lateral, depth),
        shaftCorner(toCentre, path, lateral, depth),
        chord % 2 === 0 ? 1.55 : 1.35,
        chord % 2 === 0 ? CONCRETE_MID : CONCRETE_DARK,
        {
          textureProfile: "nimbus-board-formed-concrete",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.82,
          carriesAttachments: true,
          bearingArea: 1_200,
        },
      );
    }

    for (const [rail, [lateral, depth]] of liftOffsets.entries()) {
      nimbusRod(
        liftTruss,
        `lift-shaft:${path.index}:rail:${segment}:${rail}`,
        "steel",
        shaftCorner(fromCentre, path, lateral, depth),
        shaftCorner(toCentre, path, lateral, depth),
        0.34,
        rail < 2 ? STEEL_LIGHT : STEEL_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.55,
          carriesAttachments: true,
          bearingArea: 24,
        },
      );
    }

    const crossFaces = [
      [0, 1],
      [1, 3],
      [3, 2],
      [2, 0],
    ] as const;
    for (const [face, [a, b]] of crossFaces.entries()) {
      const outerA = SUPPORT_OUTER_OFFSETS[a];
      const outerB = SUPPORT_OUTER_OFFSETS[b];
      nimbusRod(
        primary,
        `support:${path.index}:cross:${segment}:${face}:a`,
        "steel",
        shaftCorner(fromCentre, path, outerA[0], outerA[1]),
        shaftCorner(toCentre, path, outerB[0], outerB[1]),
        0.3,
        face === 0 ? SERVICE_ORANGE : STEEL_DARK,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.62,
          bearingArea: 80,
        },
      );
      nimbusRod(
        primary,
        `support:${path.index}:cross:${segment}:${face}:b`,
        "steel",
        shaftCorner(fromCentre, path, outerB[0], outerB[1]),
        shaftCorner(toCentre, path, outerA[0], outerA[1]),
        0.3,
        STEEL_MID,
        {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.62,
          bearingArea: 80,
        },
      );
    }

    const segmentCentre = midpoint(fromCentre, toCentre);
    const segmentLength = Math.hypot(...subtract(toCentre, fromCentre));
    const glassFaces: readonly (readonly [
      axis: SceneVector3,
      offset: number,
      width: number,
    ])[] = [
      [path.lateral, -0.98, 2.5],
      [path.lateral, 0.98, 2.5],
      [path.depth, -1.28, 1.9],
      [path.depth, 1.28, 1.9],
    ];
    for (const [face, [axis, offset, width]] of glassFaces.entries()) {
      const surfaceCentre = add(
        segmentCentre,
        [face < 2 ? path.depth : path.lateral, offset],
      );
      nimbusPrimitive(
        liftTruss,
        `lift-shaft:${path.index}:glass:${segment}:${face}`,
        "darkGlass",
        "glassPane",
        surfaceCentre,
        [width, segmentLength * 1.015, 0.12],
        GLASS,
        {
          rotation: nimbusOrient(axis, path.direction),
          bearsLoad: false,
          sideAttachmentReach: 0.48,
          volume: width * segmentLength * 0.035,
        },
      );
    }

    // A second diagonal route remains visibly independent from the lift shaft.
    const stairFrom = add(
      fromCentre,
      [path.lateral, segment % 2 === 0 ? 2.2 : 3.05],
      [path.depth, -0.15],
    );
    const stairTo = add(
      toCentre,
      [path.lateral, segment % 2 === 0 ? 3.05 : 2.2],
      [path.depth, -0.15],
    );
    nimbusRod(
      fittings,
      `support-stair:${path.index}:flight:${segment}`,
      "steel",
      stairFrom,
      stairTo,
      0.28,
      STEEL_LIGHT,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
      },
    );
    nimbusRod(
      fittings,
      `support-stair:${path.index}:landing:${segment}`,
      "steel",
      add(toCentre, [path.lateral, 2.05], [path.depth, -0.15]),
      add(toCentre, [path.lateral, 3.2], [path.depth, -0.15]),
      0.32,
      segment % 3 === 2 ? SERVICE_ORANGE : STEEL_MID,
      {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.55,
      },
    );
  }
}

function createSupportConnections(
  primary: NimbusMutableGroup,
  fittings: NimbusMutableGroup,
  path: SupportPath,
): void {
  for (const [chord, [lateral, depth]] of SUPPORT_OUTER_OFFSETS.entries()) {
    const chordBase = shaftCorner(path.base, path, lateral, depth);
    const shoeY = path.base[1] + 0.14;
    const shoe: SceneVector3 = [chordBase[0], shoeY, chordBase[2]];
    nimbusPrimitive(fittings, `support-foot:${path.index}:${chord}:anchor-shoe`,
      "steel", "steelSheet", shoe, [2.5, 0.28, 2.5], STEEL_DARK, {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9,
        carriesAttachments: true,
        bearingArea: 220,
      });
    nimbusRod(primary, `support-foot:${path.index}:${chord}:pinned-seat`,
      "steel", shoe, chordBase, 0.58,
      chord % 2 === 0 ? SERVICE_ORANGE : STEEL_LIGHT, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.85,
        carriesAttachments: true,
        bearingArea: 260,
      });
  }

  const station = NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS[path.stationIndex];
  const plateCentre = yardPoint(
    supportTopAlong(station),
    path.side * SUPPORT_TOP_ACROSS,
    NIMBUS_ATMOSPHERIC_BODY_BOTTOM + 2.45,
  );
  nimbusPrimitive(primary, `support-head:${path.index}:receiver-plate`, "steel",
    "steelSheet", plateCentre, [10.5, 4.9, 0.52], STEEL_DARK, {
      rotation: nimbusOrient(YARD_ALONG, [0, 1, 0]),
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.15,
      carriesAttachments: true,
      bearingArea: 2_400,
    });
  nimbusRod(primary, `support-head:${path.index}:transfer-beam`, "steel",
    yardPoint(supportTopAlong(station) - 5.1, path.side * SUPPORT_TOP_ACROSS,
      NIMBUS_ATMOSPHERIC_BODY_BOTTOM + 0.72),
    yardPoint(supportTopAlong(station) + 5.1, path.side * SUPPORT_TOP_ACROSS,
      NIMBUS_ATMOSPHERIC_BODY_BOTTOM + 0.72),
    0.72, SERVICE_ORANGE, {
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.05,
      carriesAttachments: true,
      bearingArea: 1_200,
    });
  for (const [chord, [lateral, depth]] of SUPPORT_OUTER_OFFSETS.entries()) {
    const chordTop = shaftCorner(path.top, path, lateral, depth);
    const receiver = yardPoint(
      supportTopAlong(station) + lateral * 0.92,
      path.side * SUPPORT_TOP_ACROSS,
      NIMBUS_ATMOSPHERIC_BODY_BOTTOM + 1.25 + (depth + 2.35) / 4.7 * 2.4,
    );
    nimbusRod(primary, `support-head:${path.index}:gusset:${chord}`, "steel",
      chordTop, receiver, 0.62,
      chord % 2 === 0 ? STEEL_LIGHT : SERVICE_ORANGE, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.95,
        carriesAttachments: true,
        bearingArea: 780,
      });
  }
}

const BODY_STANDARD_LEVELS = NIMBUS_ATMOSPHERIC_BODY_LEVELS - 1;

function bodyProfile(level: number): BodyProfile {
  const standardLevel = Math.min(BODY_STANDARD_LEVELS, Math.max(0, level));
  const t = standardLevel / BODY_STANDARD_LEVELS;
  const bevel = Math.max(0, level - BODY_STANDARD_LEVELS);
  return {
    y: SHIPYARD_DATUM + NIMBUS_ATMOSPHERIC_BODY_BOTTOM
      + standardLevel * NIMBUS_ATMOSPHERIC_BODY_LEVEL_HEIGHT
      + bevel * NIMBUS_ATMOSPHERIC_TOP_BEVEL_HEIGHT,
    halfLength: 54 - 9 * t - 5 * bevel,
    halfWidth: 31 - 5 * t - 5 * bevel,
    chamfer: 9 - t - 3 * bevel,
  };
}

function bodyRing(profile: BodyProfile): readonly SceneVector3[] {
  const points: SceneVector3[] = [];
  const longInner = profile.halfLength - profile.chamfer;
  const endInner = profile.halfWidth - profile.chamfer;
  for (let step = 0; step <= 8; step += 1) {
    points.push(yardPoint(
      -longInner + longInner * 2 * step / 8,
      profile.halfWidth,
      profile.y - SHIPYARD_DATUM,
    ));
  }
  points.push(yardPoint(profile.halfLength, endInner, profile.y - SHIPYARD_DATUM));
  for (let step = 1; step <= 3; step += 1) {
    points.push(yardPoint(
      profile.halfLength,
      endInner - endInner * 2 * step / 3,
      profile.y - SHIPYARD_DATUM,
    ));
  }
  points.push(yardPoint(longInner, -profile.halfWidth, profile.y - SHIPYARD_DATUM));
  for (let step = 1; step <= 8; step += 1) {
    points.push(yardPoint(
      longInner - longInner * 2 * step / 8,
      -profile.halfWidth,
      profile.y - SHIPYARD_DATUM,
    ));
  }
  points.push(yardPoint(-profile.halfLength, -endInner, profile.y - SHIPYARD_DATUM));
  for (let step = 1; step <= 3; step += 1) {
    points.push(yardPoint(
      -profile.halfLength,
      -endInner + endInner * 2 * step / 3,
      profile.y - SHIPYARD_DATUM,
    ));
  }
  return points;
}

function createDuctClearDeck(
  floors: NimbusMutableGroup,
  id: string,
  profile: BodyProfile,
  y: number,
): void {
  const clearance = NIMBUS_ATMOSPHERIC_DUCT_RADIUS + 0.8;
  const ductAlong = 21;
  const longInner = profile.halfLength - profile.chamfer;
  const sideBandWidth = profile.halfWidth - clearance;
  const bands: readonly (readonly [
    along: number,
    across: number,
    length: number,
    width: number,
  ])[] = [
    [0, -(clearance + sideBandWidth / 2), longInner * 2, sideBandWidth],
    [0, clearance + sideBandWidth / 2, longInner * 2, sideBandWidth],
    [-(longInner + ductAlong + clearance) / 2, 0,
      longInner - ductAlong - clearance, clearance * 2],
    [0, 0, (ductAlong - clearance) * 2, clearance * 2],
    [(longInner + ductAlong + clearance) / 2, 0,
      longInner - ductAlong - clearance, clearance * 2],
  ];
  for (const [panel, [along, across, length, width]] of bands.entries()) {
    if (length < 0.5 || width < 0.5) continue;
    nimbusPrimitive(floors, `${id}:${panel}`, "concrete", "panel",
      yardPoint(along, across, y - SHIPYARD_DATUM),
      [length, 0.32, width], panel % 2 === 0 ? "#888d89" : "#7e8481", {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: "nimbus-board-formed-concrete",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.82,
        contactBearingOrder: true,
        bearingArea: 300,
      });
  }
}

function createBodyStructure(
  primary: NimbusMutableGroup,
  floors: NimbusMutableGroup,
  paths: readonly SupportPath[],
): void {
  const roof = bodyProfile(NIMBUS_ATMOSPHERIC_BODY_LEVELS);
  for (const path of paths) {
    const station = NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS[path.stationIndex];
    const roofNode = yardPoint(
      supportTopAlong(station) * roof.halfLength / 54,
      path.side * roof.halfWidth * 0.76,
      roof.y - SHIPYARD_DATUM,
    );
    nimbusRod(primary, `upper-rib:${path.index}`, "concrete",
      pointOnSupport(path, 0.88), roofNode, 1.8,
      path.index % 3 === 0 ? CONCRETE_DARK : CONCRETE_MID, {
        textureProfile: "nimbus-board-formed-concrete",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.2,
        carriesAttachments: true,
        bearingArea: 4_000,
      });
  }

  for (let level = 0; level < NIMBUS_ATMOSPHERIC_BODY_LEVELS; level += 1) {
    const lower = bodyProfile(level);
    const upper = bodyProfile(level + 1);
    const lowerRing = bodyRing(lower);
    const upperRing = bodyRing(upper);

    for (const [stationIndex, station] of NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS.entries()) {
      const along = supportTopAlong(station) * upper.halfLength / 54;
      nimbusRod(primary, `floor-truss:${level}:${stationIndex}`, "steel",
        yardPoint(along, -upper.halfWidth * 0.98, upper.y - SHIPYARD_DATUM - 0.36),
        yardPoint(along, upper.halfWidth * 0.98, upper.y - SHIPYARD_DATUM - 0.36),
        0.62, stationIndex === 1 ? STEEL_LIGHT : STEEL_MID, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.1,
          carriesAttachments: true,
          bearingArea: 320,
        });
    }

    for (let sector = 0; sector < NIMBUS_ATMOSPHERIC_BODY_SECTORS; sector += 1) {
      const next = (sector + 1) % NIMBUS_ATMOSPHERIC_BODY_SECTORS;
      nimbusRod(primary, `perimeter:${level}:${sector}`, "steel",
        upperRing[sector], upperRing[next], 0.44,
        level % 4 === 3 ? SERVICE_ORANGE : STEEL_MID, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.72,
          carriesAttachments: true,
          bearingArea: 80,
        });
      nimbusRod(primary, `facade-column:${level}:${sector}`, "steel",
        lowerRing[sector], upperRing[sector], 0.38, STEEL_DARK, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.7,
          carriesAttachments: true,
          bearingArea: 65,
        });
    }

    createDuctClearDeck(floors, `floor-deck:${level}`, upper,
      upper.y - 0.36);
  }
  const belly = bodyProfile(0);
  createDuctClearDeck(floors, "belly-deck", belly, belly.y + 0.18);
}

function createBodyShell(shell: NimbusMutableGroup): void {
  for (let level = 0; level < NIMBUS_ATMOSPHERIC_BODY_LEVELS; level += 1) {
    const lowerRing = bodyRing(bodyProfile(level));
    const upperRing = bodyRing(bodyProfile(level + 1));
    for (let sector = 0; sector < NIMBUS_ATMOSPHERIC_BODY_SECTORS; sector += 1) {
      const next = (sector + 1) % NIMBUS_ATMOSPHERIC_BODY_SECTORS;
      const lowerA = lowerRing[sector];
      const lowerB = lowerRing[next];
      const upperA = upperRing[sector];
      const upperB = upperRing[next];
      const centre = midpoint(lowerA, lowerB, upperA, upperB);
      const tangent = subtract(midpoint(lowerB, upperB), midpoint(lowerA, upperA));
      const rise = subtract(midpoint(upperA, upperB), midpoint(lowerA, lowerB));
      const width = Math.hypot(...tangent) * 1.025;
      const height = Math.hypot(...rise) * 1.02;
      const technical = level === 0 || level % 4 === 3
        || level === BODY_STANDARD_LEVELS;
      const glazed = !technical && (sector + level) % 5 !== 0;
      nimbusPrimitive(shell, `shell:${level}:${sector}`,
        glazed ? "darkGlass" : "plastic", glazed ? "glassPane" : "panel",
        centre, [width, height, glazed ? 0.16 : 0.24],
        glazed ? GLASS : (sector + level) % 3 === 0 ? CERAMIC_WARM : CERAMIC, {
          rotation: nimbusOrient(tangent, rise),
          textureProfile: glazed ? undefined : "nimbus-ceramic-composite",
          bearsLoad: false,
          sideAttachmentReach: 0.82,
          volume: width * height * (glazed ? 0.035 : 0.055),
        });
    }
  }
}

function ductPoint(
  along: number,
  y: number,
  angle: number,
  radius: number,
): SceneVector3 {
  return add(yardPoint(along, 0, y - SHIPYARD_DATUM),
    [YARD_ALONG, Math.cos(angle) * radius],
    [YARD_ACROSS, Math.sin(angle) * radius]);
}

function createAtmosphericPlant(
  primary: NimbusMutableGroup,
  crown: NimbusMutableGroup,
): void {
  const lower = bodyProfile(0);
  const upper = bodyProfile(NIMBUS_ATMOSPHERIC_BODY_LEVELS);
  const ductHeight = upper.y - lower.y;
  const fanAlong = [-21, 21] as const;
  const ringSegments = NIMBUS_ATMOSPHERIC_DUCT_SEGMENTS;
  const radius = NIMBUS_ATMOSPHERIC_DUCT_RADIUS;
  for (const [fan, along] of fanAlong.entries()) {
    for (let segment = 0; segment < ringSegments; segment += 1) {
      const angleA = segment / ringSegments * Math.PI * 2;
      const angleB = (segment + 1) / ringSegments * Math.PI * 2;
      const lowerA = ductPoint(along, lower.y, angleA, radius);
      const lowerB = ductPoint(along, lower.y, angleB, radius);
      const upperA = ductPoint(along, upper.y, angleA, radius);
      const upperB = ductPoint(along, upper.y, angleB, radius);
      const tangent = subtract(midpoint(lowerB, upperB), midpoint(lowerA, upperA));
      const rise = subtract(midpoint(upperA, upperB), midpoint(lowerA, lowerB));
      nimbusPrimitive(crown, `fan:${fan}:nacelle-shell:${segment}`, "steel",
        "steelSheet", midpoint(lowerA, lowerB, upperA, upperB),
        [Math.hypot(...tangent) * 1.035, Math.hypot(...rise) * 1.002, 0.28],
        segment % 4 === 0 ? STEEL_LIGHT : STEEL_DARK, {
          rotation: nimbusOrient(tangent, rise),
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 0.72,
          volume: ductHeight * 0.5,
        });
      nimbusRod(primary, `fan:${fan}:duct-longitudinal:${segment}`, "steel",
        lowerA, upperA, 0.34,
        segment % 4 === 0 ? SERVICE_ORANGE : STEEL_MID, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.76,
          carriesAttachments: true,
          bearingArea: 180,
        });
    }
    for (const [ring, y] of [lower.y, lower.y + 5.5, upper.y - 1.8, upper.y]
      .entries()) {
      const ringRadius = ring === 0 || ring === 3 ? radius + 0.8 : radius;
      for (let segment = 0; segment < ringSegments; segment += 1) {
        const angleA = segment / ringSegments * Math.PI * 2;
        const angleB = (segment + 1) / ringSegments * Math.PI * 2;
        nimbusRod(primary, `fan:${fan}:ring:${ring}:${segment}`, "steel",
          ductPoint(along, y, angleA, ringRadius),
          ductPoint(along, y, angleB, ringRadius),
          ring === 0 || ring === 3 ? 0.68 : 0.42,
          ring === 0 || ring === 3 ? SERVICE_ORANGE : STEEL_LIGHT, {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.9,
            carriesAttachments: true,
            bearingArea: 220,
          });
      }
    }

    const hubY = lower.y + 5.5;
    const hub = yardPoint(along, 0, hubY - SHIPYARD_DATUM);
    nimbusPrimitive(crown, `fan:${fan}:motor-nacelle`, "steel", "cylinder", hub,
      [4.8, 7.5, 4.8], STEEL_DARK, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.2,
        carriesAttachments: true,
        bearingArea: 420,
    });
    nimbusPrimitive(crown, `fan:${fan}:hub`, "steel", "cylinder", hub,
      [5.8, 2.2, 5.8], SERVICE_ORANGE, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1,
      });
    for (let blade = 0; blade < 8; blade += 1) {
      const angle = blade / 8 * Math.PI * 2 + fan * Math.PI / 8;
      const radial = add([0, 0, 0],
        [YARD_ALONG, Math.cos(angle)],
        [YARD_ACROSS, Math.sin(angle)]);
      const tangent = add([0, 0, 0],
        [YARD_ALONG, -Math.sin(angle)],
        [YARD_ACROSS, Math.cos(angle)]);
      const centre = add(hub, [radial, 5.9], [tangent, 0.6]);
      nimbusPrimitive(crown, `fan:${fan}:rotor-blade:${blade}`, "steel", "panel",
        centre, [6.6, 0.32, 2.15], blade % 2 === 0 ? STEEL_LIGHT : AIR_BLUE, {
          rotation: nimbusOrient(radial, [0, 1, 0]),
          textureProfile: "painted-steel",
          bearsLoad: false,
          sideAttachmentReach: 1.1,
          volume: 3.2,
        });
    }
    for (const braceAngle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      nimbusRod(primary, `fan:${fan}:motor-stator:${braceAngle}`, "steel",
        hub,
        ductPoint(along, hubY, braceAngle, radius - 0.55),
        0.42, STEEL_LIGHT, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.82,
          carriesAttachments: true,
          bearingArea: 160,
        });
    }
  }
}

interface AtmosphericCraneDefinition {
  readonly stationIndex: 0 | 1 | 2;
  readonly side: -1 | 1;
  readonly mastAlongOffset: number;
  readonly topClearance: number;
  readonly jibLength: number;
  readonly target: readonly [number, number];
}

const ATMOSPHERIC_CRANES: readonly AtmosphericCraneDefinition[] = [
  {
    stationIndex: 0, side: 1, mastAlongOffset: 13,
    topClearance: 22, jibLength: 65, target: [-10, 0],
  },
  {
    stationIndex: 1, side: -1, mastAlongOffset: 13,
    topClearance: 30, jibLength: 60, target: [23, 2],
  },
  {
    stationIndex: 2, side: 1, mastAlongOffset: -13,
    topClearance: 18, jibLength: 62.5, target: [8, -3],
  },
] as const;

function cranePoint(
  along: number,
  across: number,
  y: number,
): SceneVector3 {
  return yardPoint(along, across, y - SHIPYARD_DATUM);
}

function createMastSection(
  cranes: NimbusMutableGroup,
  craneIndex: number,
  along: number,
  across: number,
  bottomY: number,
  topY: number,
  section: number,
): void {
  const half = 1.25;
  const corners = [[-half, -half], [-half, half], [half, half], [half, -half]] as const;
  for (const [corner, [da, dc]] of corners.entries()) {
    nimbusRod(cranes, `construction-crane:${craneIndex}:mast-section:${section}:chord:${corner}`,
      "steel", cranePoint(along + da, across + dc, bottomY),
      cranePoint(along + da, across + dc, topY), 0.3,
      corner % 2 === 0 ? STEEL_LIGHT : STEEL_MID, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.62,
        carriesAttachments: true,
        bearingArea: 65,
      });
  }
  for (let face = 0; face < 4; face += 1) {
    const a = corners[face];
    const b = corners[(face + 1) % 4];
    nimbusRod(cranes, `construction-crane:${craneIndex}:mast-section:${section}:face:${face}:brace:a`,
      "steel", cranePoint(along + a[0], across + a[1], bottomY),
      cranePoint(along + b[0], across + b[1], topY), 0.19,
      face % 2 === 0 ? SERVICE_ORANGE : STEEL_DARK, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.52,
      });
    nimbusRod(cranes, `construction-crane:${craneIndex}:mast-section:${section}:face:${face}:brace:b`,
      "steel", cranePoint(along + b[0], across + b[1], bottomY),
      cranePoint(along + a[0], across + a[1], topY), 0.19, STEEL_MID, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.52,
      });
    nimbusRod(cranes, `construction-crane:${craneIndex}:mast-section:${section}:diaphragm:${face}`,
      "steel", cranePoint(along + a[0], across + a[1], topY),
      cranePoint(along + b[0], across + b[1], topY), 0.2, STEEL_DARK, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.5,
      });
  }
}

function createCraneTie(
  cranes: NimbusMutableGroup,
  craneIndex: number,
  definition: AtmosphericCraneDefinition,
  along: number,
  across: number,
  level: number,
): void {
  const y = bodyProfile(level).y;
  const profile = bodyProfile(level);
  const innerAcross = across - definition.side * 1.5;
  const facadeAcross = definition.side * profile.halfWidth;
  const collar = [
    cranePoint(along - 1.5, across - 1.5, y),
    cranePoint(along - 1.5, across + 1.5, y),
    cranePoint(along + 1.5, across + 1.5, y),
    cranePoint(along + 1.5, across - 1.5, y),
  ];
  for (let side = 0; side < 4; side += 1) {
    nimbusRod(cranes, `construction-crane:${craneIndex}:tie:${level}:collar:${side}`,
      "steel", collar[side], collar[(side + 1) % 4], 0.34, SERVICE_ORANGE, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.8,
        carriesAttachments: true,
      });
  }
  const anchors = [-5.2, 5.2].map((offset) =>
    cranePoint(along + offset, facadeAcross, y));
  nimbusRod(cranes, `construction-crane:${craneIndex}:tie:${level}:building-anchor`,
    "steel", anchors[0], anchors[1], 0.55, STEEL_DARK, {
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 1.1,
      carriesAttachments: true,
      bearingArea: 260,
    });
  nimbusRod(cranes, `construction-crane:${craneIndex}:tie:${level}:strut:left`,
    "steel", cranePoint(along - 1.4, innerAcross, y), anchors[0], 0.42, STEEL_LIGHT, {
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.9,
      carriesAttachments: true,
    });
  nimbusRod(cranes, `construction-crane:${craneIndex}:tie:${level}:strut:right`,
    "steel", cranePoint(along + 1.4, innerAcross, y), anchors[1], 0.42, STEEL_LIGHT, {
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.9,
      carriesAttachments: true,
    });
}

function createLatticeJib(
  cranes: NimbusMutableGroup,
  craneIndex: number,
  root: SceneVector3,
  direction: SceneVector3,
  lateral: SceneVector3,
  length: number,
): void {
  const sections = Math.ceil(length / 5);
  for (let section = 0; section < sections; section += 1) {
    const fromDistance = section * length / sections;
    const toDistance = (section + 1) * length / sections;
    const bottom = (distance: number, side: number) =>
      add(root, [direction, distance], [lateral, side * 1.15]);
    const top = (distance: number) =>
      add(root, [direction, distance], [[0, 1, 0], 2.5]);
    for (const side of [-1, 1]) {
      nimbusRod(cranes, `construction-crane:${craneIndex}:jib:section:${section}:bottom-chord:${side}`,
        "steel", bottom(fromDistance, side), bottom(toDistance, side), 0.28,
        side < 0 ? STEEL_LIGHT : SERVICE_ORANGE, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.72,
          carriesAttachments: true,
          bearingArea: 85,
        });
      nimbusRod(cranes, `construction-crane:${craneIndex}:jib:section:${section}:web:${side}:a`,
        "steel", bottom(fromDistance, side), top(toDistance), 0.18, STEEL_DARK, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.52,
        });
      nimbusRod(cranes, `construction-crane:${craneIndex}:jib:section:${section}:web:${side}:b`,
        "steel", top(fromDistance), bottom(toDistance, side), 0.18, STEEL_MID, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.52,
        });
    }
    nimbusRod(cranes, `construction-crane:${craneIndex}:jib:section:${section}:top-chord`,
      "steel", top(fromDistance), top(toDistance), 0.28, STEEL_LIGHT, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.72,
        carriesAttachments: true,
      });
    nimbusRod(cranes, `construction-crane:${craneIndex}:jib:section:${section}:cross-member`,
      "steel", bottom(toDistance, -1), bottom(toDistance, 1), 0.2, STEEL_DARK, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.52,
      });
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:jib:section:${section}:catwalk`,
      "steel", "panel", add(root, [direction, (fromDistance + toDistance) / 2],
        [[0, 1, 0], -0.12]),
      [toDistance - fromDistance, 0.16, 1.55], STEEL_DARK, {
        rotation: nimbusOrient(direction, [0, 1, 0]),
        textureProfile: "painted-steel",
        bearsLoad: false,
        sideAttachmentReach: 0.65,
        volume: 0.8,
      });
  }
}

function createAtmosphericConstructionCranes(cranes: NimbusMutableGroup): void {
  const roof = bodyProfile(NIMBUS_ATMOSPHERIC_BODY_LEVELS);
  for (const [craneIndex, crane] of ATMOSPHERIC_CRANES.entries()) {
    const station = NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS[crane.stationIndex];
    // Crane masts occupy facade bays between the six diagonal building
    // supports, so neither independent load path can accidentally bear on
    // the other before the authored wall ties engage.
    const mastAlong = supportTopAlong(station) + crane.mastAlongOffset;
    const mastAcross = crane.side * (bodyProfile(0).halfWidth + 9);
    const horizontal = nimbusPointOnShipyard(mastAlong, mastAcross);
    const ground = nimbusGroundUnder(horizontal[0], horizontal[2]).top;
    const padHeight = 1.1;
    const padCentre = cranePoint(mastAlong, mastAcross, ground + padHeight / 2);
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:foundation-anchor`,
      "concrete", "panel", padCentre, [6.2, padHeight, 6.2], CONCRETE_DARK, {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: "nimbus-board-formed-concrete",
        contactBoxes: [nimbusGroundSeatBox(padCentre[1], [6.2, padHeight, 6.2], ground)],
        contactBearingOrder: true,
        bearingArea: 240,
      });
    for (const [anchor, [da, dc]] of [[-1.25, -1.25], [-1.25, 1.25],
      [1.25, 1.25], [1.25, -1.25]].entries()) {
      nimbusPrimitive(cranes, `construction-crane:${craneIndex}:anchor-shoe:${anchor}`,
        "steel", "steelSheet", cranePoint(mastAlong + da, mastAcross + dc, ground + 1.35),
        [0.75, 0.5, 0.75], SERVICE_ORANGE, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.55,
          carriesAttachments: true,
        });
    }

    const mastBaseY = ground + padHeight;
    const requiredTop = roof.y + crane.topClearance;
    const mastSections = Math.ceil((requiredTop - mastBaseY) / 4.5);
    const mastTopY = mastBaseY + mastSections * 4.5;
    for (let section = 0; section < mastSections; section += 1) {
      createMastSection(cranes, craneIndex, mastAlong, mastAcross,
        mastBaseY + section * 4.5, mastBaseY + (section + 1) * 4.5, section);
    }
    for (const level of [2, 7, 12, 16]) {
      createCraneTie(cranes, craneIndex, crane, mastAlong, mastAcross, level);
    }

    const frameBottom = mastTopY - 8;
    const frameTop = mastTopY - 2.5;
    for (const [corner, [da, dc]] of [[-1.65, -1.65], [-1.65, 1.65],
      [1.65, 1.65], [1.65, -1.65]].entries()) {
      nimbusRod(cranes, `construction-crane:${craneIndex}:climbing-frame:post:${corner}`,
        "steel", cranePoint(mastAlong + da, mastAcross + dc, frameBottom),
        cranePoint(mastAlong + da, mastAcross + dc, frameTop), 0.3, SERVICE_ORANGE, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.7,
          carriesAttachments: true,
        });
    }
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:climbing-frame:hydraulic-pack`,
      "steel", "panel", cranePoint(mastAlong, mastAcross + crane.side * 1.8,
        (frameBottom + frameTop) / 2), [2.1, 2.2, 1.1], STEEL_DARK, {
        rotation: [0, -NIMBUS_BOWL_YAW, 0],
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9,
      });

    const mastTop = cranePoint(mastAlong, mastAcross, mastTopY);
    const target = yardPoint(crane.target[0], crane.target[1], mastTopY - SHIPYARD_DATUM);
    const direction = normalize(subtract(target, mastTop));
    const lateral = normalize(cross([0, 1, 0], direction));
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:slewing-ring`, "steel", "cylinder",
      add(mastTop, [[0, 1, 0], 0.55]), [4.8, 1.1, 4.8], STEEL_DARK, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.1,
        carriesAttachments: true,
        bearingArea: 520,
      });
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:slewing-platform`, "steel", "panel",
      add(mastTop, [[0, 1, 0], 1.35]), [8, 0.5, 4.8], STEEL_MID, {
        rotation: nimbusOrient(direction, [0, 1, 0]),
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.3,
        carriesAttachments: true,
        bearingArea: 430,
      });
    const jibRoot = add(mastTop, [[0, 1, 0], 3.15]);
    for (const side of [-1, 1]) {
      nimbusRod(cranes, `construction-crane:${craneIndex}:compact-head:jib-seat:${side}`,
        "steel", add(mastTop, [lateral, side * 1.15], [[0, 1, 0], 1.6]),
        add(jibRoot, [lateral, side * 1.15]), 0.46, STEEL_LIGHT, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.9,
          carriesAttachments: true,
          bearingArea: 180,
        });
      nimbusRod(cranes, `construction-crane:${craneIndex}:compact-head:counterjib-seat:${side}`,
        "steel", add(mastTop, [direction, -1.2], [lateral, side * 1.5],
          [[0, 1, 0], 1.6]),
        add(jibRoot, [lateral, side * 1.5]), 0.42, STEEL_MID, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.9,
          carriesAttachments: true,
          bearingArea: 150,
        });
    }
    nimbusRod(cranes, `construction-crane:${craneIndex}:compact-head:top-seat`, "steel",
      add(mastTop, [[0, 1, 0], 1.6]), add(jibRoot, [[0, 1, 0], 2.5]),
      0.5, SERVICE_ORANGE, {
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1,
        carriesAttachments: true,
        bearingArea: 220,
      });
    createLatticeJib(cranes, craneIndex, jibRoot, direction, lateral, crane.jibLength);

    const counterLength = 20;
    for (let section = 0; section < 4; section += 1) {
      const from = section * counterLength / 4;
      const to = (section + 1) * counterLength / 4;
      for (const side of [-1, 1]) {
        nimbusRod(cranes,
          `construction-crane:${craneIndex}:counterjib:section:${section}:chord:${side}`,
          "steel", add(jibRoot, [direction, -from], [lateral, side * 1.5]),
          add(jibRoot, [direction, -to], [lateral, side * 1.5]), 0.32, STEEL_MID, {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.72,
            carriesAttachments: true,
          });
        nimbusRod(cranes,
          `construction-crane:${craneIndex}:counterjib:section:${section}:web:${side}`,
          "steel", add(jibRoot, [direction, -from], [lateral, side * 1.5]),
          add(jibRoot, [direction, -to], [[0, 1, 0], 2.2]), 0.2, STEEL_DARK, {
            textureProfile: "painted-steel",
            attachmentSupportMode: "cable",
            sideAttachmentReach: 0.55,
          });
      }
      nimbusPrimitive(cranes,
        `construction-crane:${craneIndex}:counterjib:section:${section}:deck`, "steel", "panel",
        add(jibRoot, [direction, -(from + to) / 2], [[0, 1, 0], -0.12]),
        [to - from, 0.2, 2.8], STEEL_DARK, {
          rotation: nimbusOrient(direction, [0, 1, 0]),
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.8,
          volume: 1.5,
        });
    }

    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:operator-cab`, "darkGlass", "glassPane",
      add(mastTop, [direction, 2.7], [lateral, 2.3], [[0, 1, 0], 2.55]),
      [3.1, 3.1, 2.15], GLASS, {
        rotation: nimbusOrient(direction, [0, 1, 0]),
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.1,
        volume: 3.5,
      });
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:hoist-winch`, "steel", "cylinder",
      add(jibRoot, [direction, -7], [[0, 1, 0], 1.15]), [2.3, 3.6, 2.3], STEEL_LIGHT, {
        rotation: nimbusOrient(direction, lateral),
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9,
      });
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:trolley-winch`, "steel", "cylinder",
      add(jibRoot, [direction, -3.5], [[0, 1, 0], 0.8]), [1.4, 2.5, 1.4], SERVICE_ORANGE, {
        rotation: nimbusOrient(direction, lateral),
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.8,
      });
    for (let block = 0; block < 5; block += 1) {
      nimbusPrimitive(cranes, `construction-crane:${craneIndex}:counterweight:${block}`,
        "concrete", "panel", add(jibRoot, [direction, -16.2 - block * 0.72],
          [[0, 1, 0], 1.35]), [0.62, 3.2, 3.9], CONCRETE_DARK, {
          rotation: nimbusOrient(direction, [0, 1, 0]),
          textureProfile: "nimbus-board-formed-concrete",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.1,
          contactBearingOrder: true,
        });
    }
    const trolleyDistance = crane.jibLength * 0.66;
    const trolley = add(jibRoot, [direction, trolleyDistance], [[0, 1, 0], -0.275]);
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:trolley-frame`, "steel", "panel",
      trolley, [3.1, 0.55, 2.8], SERVICE_ORANGE, {
        rotation: nimbusOrient(direction, [0, 1, 0]),
        textureProfile: "painted-steel",
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9,
      });
    for (const [hanger, [alongOffset, side]] of [
      [-1.05, -1], [-1.05, 1], [1.05, -1], [1.05, 1],
    ].entries()) {
      nimbusRod(cranes, `construction-crane:${craneIndex}:trolley-hanger:${hanger}`,
        "steel", add(jibRoot, [direction, trolleyDistance + alongOffset],
          [lateral, side * 0.92]),
        add(trolley, [direction, alongOffset], [lateral, side * 0.92],
          [[0, 1, 0], 0.25]),
        0.16, STEEL_DARK, {
          textureProfile: "painted-steel",
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.55,
          carriesAttachments: true,
        });
    }
    const hookY = roof.y + 4 + craneIndex * 2;
    for (const side of [-1, 1]) {
      nimbusRod(cranes, `construction-crane:${craneIndex}:reeving-line:${side}`,
        "steel", add(trolley, [lateral, side * 0.38]),
        add([trolley[0], hookY, trolley[2]], [lateral, side * 0.38]),
        0.1, STEEL_DARK, {
          attachmentSupportMode: "cable",
          sideAttachmentReach: 0.35,
          carriesAttachments: true,
          volume: 0.08,
        });
    }
    nimbusPrimitive(cranes, `construction-crane:${craneIndex}:hook-block`, "steel", "cylinder",
      [trolley[0], hookY, trolley[2]], [1.2, 1.6, 1.2], STEEL_DARK, {
        rotation: nimbusOrient(direction, lateral),
        attachmentSupportMode: "cable",
        sideAttachmentReach: 0.9,
        bearsLoad: false,
      });
  }
}

export function createNimbusAtmosphericTower(
  groups: NimbusAtmosphericTowerGroups,
): void {
  const paths = supportPaths();
  createFoundations(groups.foundation, paths);
  for (const path of paths) {
    createSupport(groups.primary, groups.liftTruss, groups.fittings, path);
    createSupportConnections(groups.primary, groups.fittings, path);
  }
  createBodyStructure(groups.primary, groups.floors, paths);
  createBodyShell(groups.shell);
  createAtmosphericPlant(groups.primary, groups.crown);
  createAtmosphericConstructionCranes(groups.constructionCranes);
}
