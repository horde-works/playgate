// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Нур Алем / Kazakhstan Pavilion. AS+GG absolutes: a slightly modified
// 80 m sphere in a 100 m high structure, central double core, eight floors,
// smooth double-curved glass and a wind scoop at the top. The island uses
// one 0.325 scale, yielding a 26 m sphere and 32.5 m total height.

import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { MutableGroup } from "./astanaAuthoring.ts";
import { orient, primitive } from "./astanaAuthoring.ts";
import { NUR_ALEM_CENTRE } from "./astanaLayout.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  ASTANA_LANDMARK_LIGHT_PRIORITY,
  ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
} from "./astanaLighting.ts";

export const NUR_ALEM_REAL_SPHERE_DIAMETER = 80;
export const NUR_ALEM_REAL_HEIGHT = 100;
export const NUR_ALEM_SCALE = 0.325;
export const NUR_ALEM_SPHERE_DIAMETER =
  NUR_ALEM_REAL_SPHERE_DIAMETER * NUR_ALEM_SCALE;
export const NUR_ALEM_HEIGHT = NUR_ALEM_REAL_HEIGHT * NUR_ALEM_SCALE;
export const NUR_ALEM_SPHERE_RADIUS = NUR_ALEM_SPHERE_DIAMETER / 2;
export const NUR_ALEM_SPHERE_CENTRE_Y =
  NUR_ALEM_HEIGHT - NUR_ALEM_SPHERE_RADIUS;
export const NUR_ALEM_SPHERE_BOTTOM =
  NUR_ALEM_SPHERE_CENTRE_Y - NUR_ALEM_SPHERE_RADIUS;
export const NUR_ALEM_FLOOR_COUNT = 8;
export const NUR_ALEM_LATITUDE_COUNT = 15;
export const NUR_ALEM_LONGITUDE_COUNT = 24;
export const NUR_ALEM_PETAL_COUNT = 4;
export const NUR_ALEM_PETAL_SEGMENTS = 9;
export const NUR_ALEM_NECK_BANDS = 9;
export const NUR_ALEM_NECK_SEGMENTS = 32;
export const NUR_ALEM_CONNECTOR_SEGMENTS = 6;

const BASE_Y = groundUnder(NUR_ALEM_CENTRE[0], NUR_ALEM_CENTRE[1]).top;
const GLASS = "#2f7d8c";
const FRAME = "#aab9ba";
const CORE = "#253d43";
const FLOOR = "#344e54";
const ROOF = "#aab3b2";
const PAVILION_GLASS = "#275f70";
const PAVING = "#b8b9b4";
const NIGHT_COLOURS = ["#42b8cf", "#3d8fc5", "#50c5b2"] as const;
const FRAME_RADIUS = NUR_ALEM_SPHERE_RADIUS + 0.07;
const EXPO_PLAZA_DIAMETER = 44;
const EXPO_PLAZA_THICKNESS = 0.32;
const EXPO_PLAZA_TOP = EXPO_PLAZA_THICKNESS;
const LATITUDE_MIN = -75 * Math.PI / 180;
const LATITUDE_MAX = 75 * Math.PI / 180;
const PETAL_RADIUS = 15.8;
const PETAL_SPAN = 62 * Math.PI / 180;
const PETAL_DEPTH = 6.8;
const PETAL_HEIGHT = 3.45;
const NECK_BOTTOM_RADIUS = 7.15;
const NECK_TOP_RADIUS = 2.35;
const CONNECTOR_INNER_RADIUS = 6.45;
const CONNECTOR_OUTER_RADIUS = PETAL_RADIUS - PETAL_DEPTH / 2 + 0.15;
const NUR_ALEM_LIGHT_GROUP = "astana:nur-alem:sphere";

function world(x: number, y: number, z: number): SceneVector3 {
  return [NUR_ALEM_CENTRE[0] + x, BASE_Y + y, NUR_ALEM_CENTRE[1] + z];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalise(vector: SceneVector3): SceneVector3 {
  const length = Math.hypot(...vector) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function spherePoint(latitude: number, longitude: number, radius = FRAME_RADIUS): SceneVector3 {
  const horizontal = radius * Math.cos(latitude);
  return world(
    horizontal * Math.cos(longitude),
    NUR_ALEM_SPHERE_CENTRE_Y + radius * Math.sin(latitude),
    horizontal * Math.sin(longitude),
  );
}

export interface NurAlemFrameEdge {
  readonly id: string;
  readonly from: SceneVector3;
  readonly to: SceneVector3;
}

function buildFrameTopology(): readonly NurAlemFrameEdge[] {
  const edges: NurAlemFrameEdge[] = [];
  const node = (latitudeIndex: number, longitudeIndex: number): SceneVector3 => {
    const latitude = LATITUDE_MIN
      + (LATITUDE_MAX - LATITUDE_MIN) * latitudeIndex
      / (NUR_ALEM_LATITUDE_COUNT - 1);
    const phase = latitudeIndex % 2 === 0 ? 0 : Math.PI / NUR_ALEM_LONGITUDE_COUNT;
    const longitude = 2 * Math.PI * longitudeIndex / NUR_ALEM_LONGITUDE_COUNT + phase;
    return spherePoint(latitude, longitude);
  };

  for (let latitude = 0; latitude < NUR_ALEM_LATITUDE_COUNT; latitude += 1) {
    for (let longitude = 0; longitude < NUR_ALEM_LONGITUDE_COUNT; longitude += 1) {
      edges.push({
        id: `latitude:${latitude}:${longitude}`,
        from: node(latitude, longitude),
        to: node(latitude, (longitude + 1) % NUR_ALEM_LONGITUDE_COUNT),
      });
      if (latitude < NUR_ALEM_LATITUDE_COUNT - 1) {
        edges.push({
          id: `diagonal-a:${latitude}:${longitude}`,
          from: node(latitude, longitude),
          to: node(latitude + 1, longitude),
        });
        edges.push({
          id: `diagonal-b:${latitude}:${longitude}`,
          from: node(latitude, (longitude + 1) % NUR_ALEM_LONGITUDE_COUNT),
          to: node(latitude + 1, longitude),
        });
      }
    }
  }

  const top = world(0, NUR_ALEM_SPHERE_CENTRE_Y + FRAME_RADIUS, 0);
  const bottom = world(0, NUR_ALEM_SPHERE_CENTRE_Y - FRAME_RADIUS, 0);
  for (let longitude = 0; longitude < NUR_ALEM_LONGITUDE_COUNT; longitude += 1) {
    edges.push({ id: `polar-top:${longitude}`, from: node(NUR_ALEM_LATITUDE_COUNT - 1, longitude), to: top });
    edges.push({ id: `polar-bottom:${longitude}`, from: bottom, to: node(0, longitude) });
  }
  return edges;
}

export const NUR_ALEM_FRAME_EDGES = buildFrameTopology();

function addMember(
  target: MutableGroup,
  edge: NurAlemFrameEdge,
  diameter = 0.058,
): void {
  const chord: SceneVector3 = [
    edge.to[0] - edge.from[0],
    edge.to[1] - edge.from[1],
    edge.to[2] - edge.from[2],
  ];
  const axis = normalise(chord);
  const helper: SceneVector3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const transverse = normalise(cross(helper, axis));
  const length = Math.hypot(...chord);
  primitive(
    target,
    `nur-alem:frame:${edge.id}`,
    "steel",
    "cylinder",
    [
      (edge.from[0] + edge.to[0]) / 2,
      (edge.from[1] + edge.to[1]) / 2,
      (edge.from[2] + edge.to[2]) / 2,
    ],
    [diameter, length, diameter],
    FRAME,
    {
      rotation: orient(transverse, axis),
      textureProfile: "matte-aluminium",
      bearsLoad: false,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.22,
      volume: length * diameter * diameter * 0.55,
    },
  );
}

function createFoundation(target: MutableGroup): void {
  primitive(
    target,
    "nur-alem:plaza-disc",
    "stone",
    "cylinder",
    world(0, EXPO_PLAZA_THICKNESS / 2, 0),
    [EXPO_PLAZA_DIAMETER, EXPO_PLAZA_THICKNESS, EXPO_PLAZA_DIAMETER],
    PAVING,
    {
      textureProfile: "city-gray-pavers",
      bearingArea: Math.PI * (EXPO_PLAZA_DIAMETER / 2) ** 2,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      sideAttachmentReach: 0.35,
      volume: Math.PI * (EXPO_PLAZA_DIAMETER / 2) ** 2 * EXPO_PLAZA_THICKNESS,
    },
  );
  // The photographs never show a drum or a box beneath the sphere.  The
  // public base is a concave glazed saddle: broad at the plaza, pinched at
  // the exact lower tangent of the sphere.  It is therefore authored as a
  // real faceted skin (vertical panes plus rings), not nested cylinders.
  const radiusAt = (y: number): number => {
    const t = Math.max(0, Math.min(1, y / NUR_ALEM_SPHERE_BOTTOM));
    return NECK_TOP_RADIUS
      + (NECK_BOTTOM_RADIUS - NECK_TOP_RADIUS) * (1 - t) ** 1.72;
  };
  const bandHeight = NUR_ALEM_SPHERE_BOTTOM / NUR_ALEM_NECK_BANDS;
  const angleStep = 2 * Math.PI / NUR_ALEM_NECK_SEGMENTS;

  for (let band = 0; band < NUR_ALEM_NECK_BANDS; band += 1) {
    const y0 = band * bandHeight;
    const y1 = (band + 1) * bandHeight;
    const r0 = radiusAt(y0);
    const r1 = radiusAt(y1);
    const radius = (r0 + r1) / 2;
    const y = (y0 + y1) / 2;
    for (let segment = 0; segment < NUR_ALEM_NECK_SEGMENTS; segment += 1) {
      const angle = angleStep * (segment + 0.5);
      const radial: SceneVector3 = [Math.cos(angle), 0, Math.sin(angle)];
      const tangent: SceneVector3 = [-Math.sin(angle), 0, Math.cos(angle)];
      const slope: SceneVector3 = [
        (r1 - r0) * radial[0],
        y1 - y0,
        (r1 - r0) * radial[2],
      ];
      const slant = Math.hypot(r1 - r0, y1 - y0);
      const width = 2 * radius * Math.sin(angleStep / 2) + 0.035;
      primitive(
        target,
        `nur-alem:glazed-saddle:panel:${band}:${segment}`,
        "darkGlass",
        "glassPane",
        world(radius * radial[0], y, radius * radial[2]),
        [width, slant + 0.025, 0.075],
        (band + segment) % 2 === 0 ? "#356f7c" : "#3c7884",
        {
          rotation: orient(tangent, slope),
          bearsLoad: true,
          carriesAttachments: true,
          attachmentSupportMode: "wall",
          sideAttachmentReach: 1.35,
          bearingArea: Math.max(0.08, width * 0.075),
          volume: width * slant * 0.038,
        },
      );
    }
  }

  for (let segment = 0; segment < NUR_ALEM_NECK_SEGMENTS; segment += 1) {
    const angle = angleStep * segment;
    addMember(target, {
      id: `saddle-mullion:${segment}`,
      from: world(NECK_BOTTOM_RADIUS * Math.cos(angle), 0, NECK_BOTTOM_RADIUS * Math.sin(angle)),
      to: world(NECK_TOP_RADIUS * Math.cos(angle), NUR_ALEM_SPHERE_BOTTOM,
        NECK_TOP_RADIUS * Math.sin(angle)),
    }, 0.075);
  }

  for (let band = 0; band <= NUR_ALEM_NECK_BANDS; band += 1) {
    const y = band * bandHeight;
    const radius = radiusAt(y) + 0.02;
    for (let segment = 0; segment < NUR_ALEM_NECK_SEGMENTS; segment += 1) {
      const a0 = angleStep * segment;
      const a1 = angleStep * (segment + 1);
      addMember(target, {
        id: `saddle-ring:${band}:${segment}`,
        from: world(radius * Math.cos(a0), y, radius * Math.sin(a0)),
        to: world(radius * Math.cos(a1), y, radius * Math.sin(a1)),
      }, 0.065);
    }
  }
}

function createCoreAndFloors(target: MutableGroup): void {
  for (const side of [-1, 1] as const) {
    primitive(
      target,
      `nur-alem:double-core:${side}`,
      "steel",
      "stoneBlock",
      world(side * 1.15, NUR_ALEM_HEIGHT / 2, 0),
      [1.55, NUR_ALEM_HEIGHT, 3.1],
      CORE,
      {
        textureProfile: "matte-aluminium",
        bearsLoad: true,
        carriesAttachments: true,
        attachmentSupportMode: "wall",
        sideAttachmentReach: 0.6,
        bearingArea: 6.5,
        // Hollow service core with perimeter steel, not a solid steel billet.
        volume: 1.55 * NUR_ALEM_HEIGHT * 3.1 * 0.18,
      },
    );
  }

  for (let floor = 0; floor < NUR_ALEM_FLOOR_COUNT; floor += 1) {
    const y = NUR_ALEM_SPHERE_BOTTOM + 1.75
      + floor * (NUR_ALEM_HEIGHT - NUR_ALEM_SPHERE_BOTTOM - 3.5)
      / (NUR_ALEM_FLOOR_COUNT - 1);
    const dy = y - NUR_ALEM_SPHERE_CENTRE_Y;
    const radius = Math.sqrt(Math.max(0,
      NUR_ALEM_SPHERE_RADIUS ** 2 - dy ** 2)) - 0.8;
    primitive(
      target,
      `nur-alem:floor:${floor}`,
      "steel",
      "cylinder",
      world(0, y, 0),
      [radius * 2, 0.18, radius * 2],
      FLOOR,
      {
        textureProfile: "matte-aluminium",
        bearsLoad: false,
        attachmentSupportMode: "wall",
        sideAttachmentReach: 1.4,
        // Composite museum floor: deck and radial beams occupy only part of
        // the bounding slab used by the renderer and contact solver.
        volume: Math.PI * radius ** 2 * 0.18 * 0.22,
      },
    );
  }
}

function createSphere(target: MutableGroup): void {
  primitive(
    target,
    "nur-alem:smooth-double-curved-glass",
    "darkGlass",
    "sphere",
    world(0, NUR_ALEM_SPHERE_CENTRE_Y, 0),
    [NUR_ALEM_SPHERE_DIAMETER, NUR_ALEM_SPHERE_DIAMETER, NUR_ALEM_SPHERE_DIAMETER],
    GLASS,
    {
      bearsLoad: true,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.24,
      bearingArea: Math.PI * 4.7 ** 2,
      // Structural mass is the glazed skin, not a solid 26 m glass ball.
      volume: 4 * Math.PI * NUR_ALEM_SPHERE_RADIUS ** 2 * 0.08,
    },
  );
}

function createWindScoop(target: MutableGroup): void {
  const tilt = 36 * Math.PI / 180;
  const centre = world(
    0,
    NUR_ALEM_SPHERE_CENTRE_Y + NUR_ALEM_SPHERE_RADIUS * Math.cos(tilt),
    -NUR_ALEM_SPHERE_RADIUS * Math.sin(tilt),
  );
  const normal: SceneVector3 = [0, Math.cos(tilt), -Math.sin(tilt)];
  primitive(
    target,
    "nur-alem:wind-scoop:recess",
    "darkGlass",
    "cylinder",
    centre,
    [5.8, 0.1, 3.25],
    "#112e38",
    {
      rotation: orient([1, 0, 0], normal),
      bearsLoad: false,
      sideAttachmentReach: 0.28,
      volume: 0.25,
    },
  );

  const tangentY: SceneVector3 = [0, Math.sin(tilt), Math.cos(tilt)];
  const rimSegments = 18;
  for (let segment = 0; segment < rimSegments; segment += 1) {
    const a0 = 2 * Math.PI * segment / rimSegments;
    const a1 = 2 * Math.PI * (segment + 1) / rimSegments;
    const point = (angle: number): SceneVector3 => [
      centre[0] + 3.02 * Math.cos(angle),
      centre[1] + tangentY[1] * 1.72 * Math.sin(angle),
      centre[2] + tangentY[2] * 1.72 * Math.sin(angle),
    ];
    addMember(target, {
      id: `wind-scoop-rim:${segment}`,
      from: point(a0),
      to: point(a1),
    }, 0.11);
  }
}

function createConnectorWings(target: MutableGroup): void {
  const radialLength = (CONNECTOR_OUTER_RADIUS - CONNECTOR_INNER_RADIUS)
    / NUR_ALEM_CONNECTOR_SEGMENTS;
  for (let wing = 0; wing < NUR_ALEM_PETAL_COUNT; wing += 1) {
    const angle = Math.PI / 4 + wing * Math.PI / 2;
    const radial: SceneVector3 = [Math.cos(angle), 0, Math.sin(angle)];
    const tangent: SceneVector3 = [-Math.sin(angle), 0, Math.cos(angle)];
    for (let segment = 0; segment < NUR_ALEM_CONNECTOR_SEGMENTS; segment += 1) {
      const t0 = segment / NUR_ALEM_CONNECTOR_SEGMENTS;
      const t1 = (segment + 1) / NUR_ALEM_CONNECTOR_SEGMENTS;
      const t = (t0 + t1) / 2;
      const radius = CONNECTOR_INNER_RADIUS
        + (CONNECTOR_OUTER_RADIUS - CONNECTOR_INNER_RADIUS) * t;
      const width = 4.1 + 2.0 * t;
      const roofHeight = 5.55 - 1.55 * t + 0.14 * Math.sin(Math.PI * t);
      const centre = world(radius * radial[0], EXPO_PLAZA_TOP, radius * radial[2]);
      primitive(target, `nur-alem:connector:${wing}:floor:${segment}`, "stone", "panel",
        [centre[0], centre[1] + 0.08, centre[2]],
        [width, 0.16, radialLength], PAVING, {
          rotation: orient(tangent, [0, 1, 0]),
          textureProfile: "city-gray-pavers",
          bearsLoad: true,
          carriesAttachments: true,
          bearingArea: width * radialLength,
          volume: width * radialLength * 0.16,
        });
      primitive(target, `nur-alem:connector:${wing}:roof:${segment}`, "steel", "panel",
        [centre[0], centre[1] + roofHeight, centre[2]],
        [width + 0.12, 0.18, radialLength + 0.12], ROOF, {
          rotation: orient(tangent, [0, 1, 0]),
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          attachmentSupportMode: "cable",
          sideAttachmentReach: 1.65,
          volume: width * radialLength * 0.18,
        });
      for (const side of [-1, 1] as const) {
        const sideCentre: SceneVector3 = [
          centre[0] + tangent[0] * width / 2 * side,
          centre[1] + roofHeight / 2,
          centre[2] + tangent[2] * width / 2 * side,
        ];
        primitive(target, `nur-alem:connector:${wing}:glass:${segment}:${side}`,
          "darkGlass", "glassPane", sideCentre,
          [radialLength, roofHeight - 0.22, 0.075], PAVILION_GLASS, {
            rotation: orient(radial, [0, 1, 0]),
            bearsLoad: true,
            carriesAttachments: true,
            attachmentSupportMode: "wall",
            sideAttachmentReach: 0.32,
            bearingArea: 0.09,
            volume: radialLength * roofHeight * 0.038,
          });
      }
    }
  }
}

function createPetals(target: MutableGroup): void {
  createConnectorWings(target);
  for (let petal = 0; petal < NUR_ALEM_PETAL_COUNT; petal += 1) {
    const centreAngle = Math.PI / 4 + petal * Math.PI / 2;
    for (let segment = 0; segment < NUR_ALEM_PETAL_SEGMENTS; segment += 1) {
      const a0 = centreAngle - PETAL_SPAN / 2
        + PETAL_SPAN * segment / NUR_ALEM_PETAL_SEGMENTS;
      const a1 = centreAngle - PETAL_SPAN / 2
        + PETAL_SPAN * (segment + 1) / NUR_ALEM_PETAL_SEGMENTS;
      const angle = (a0 + a1) / 2;
      const arcLength = PETAL_RADIUS * (a1 - a0) + 0.08;
      const relative = Math.abs(angle - centreAngle) / (PETAL_SPAN / 2);
      const segmentDepth = PETAL_DEPTH - 1.45 * relative ** 1.6;
      const roofHeight = PETAL_HEIGHT + 0.62 * Math.cos(relative * Math.PI / 2);
      const radial: SceneVector3 = [Math.cos(angle), 0, Math.sin(angle)];
      const tangent: SceneVector3 = [-Math.sin(angle), 0, Math.cos(angle)];
      const centre = world(
        PETAL_RADIUS * radial[0],
        EXPO_PLAZA_TOP,
        PETAL_RADIUS * radial[2],
      );
      primitive(
        target,
        `nur-alem:petal:${petal}:floor:${segment}`,
        "stone",
        "panel",
        [centre[0], centre[1] + 0.07, centre[2]],
        [arcLength, 0.14, segmentDepth],
        PAVING,
        {
          rotation: orient(tangent, [0, 1, 0]),
          textureProfile: "city-gray-pavers",
          bearsLoad: true,
          carriesAttachments: true,
          attachmentSupportMode: "wall",
          sideAttachmentReach: 0.28,
          bearingArea: arcLength * segmentDepth,
          volume: arcLength * 0.14 * segmentDepth,
        },
      );
      primitive(
        target,
        `nur-alem:petal:${petal}:roof:${segment}`,
        "steel",
        "panel",
        [centre[0], centre[1] + roofHeight, centre[2]],
        [arcLength + 0.12, 0.2, segmentDepth + 0.16],
        ROOF,
        {
          rotation: orient(tangent, [0, 1, 0]),
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          carriesAttachments: true,
          attachmentSupportMode: "wall",
          sideAttachmentReach: 1.8,
          volume: arcLength * 0.2 * segmentDepth,
        },
      );
      for (const side of [-1, 1] as const) {
        const facadeRadius = PETAL_RADIUS + side * segmentDepth / 2;
        primitive(
          target,
          `nur-alem:petal:${petal}:glass:${segment}:${side}`,
          "darkGlass",
          "glassPane",
          [
            NUR_ALEM_CENTRE[0] + facadeRadius * radial[0],
            centre[1] + roofHeight / 2,
            NUR_ALEM_CENTRE[1] + facadeRadius * radial[2],
          ],
          [arcLength, roofHeight - 0.2, 0.08],
          PAVILION_GLASS,
          {
            rotation: orient(tangent, [0, 1, 0]),
            bearsLoad: true,
            carriesAttachments: true,
            attachmentSupportMode: "wall",
            sideAttachmentReach: 0.34,
            bearingArea: 0.09,
            volume: arcLength * (roofHeight - 0.2) * 0.04,
          },
        );
      }
    }

    // Five paired mullions per crescent carry the broad Expo roof and keep
    // the pavilion from reading as one anonymous curved box.
    for (let support = 0; support < 5; support += 1) {
      const angle = centreAngle - PETAL_SPAN / 2
        + PETAL_SPAN * (support + 0.5) / 5;
      for (const side of [-1, 1] as const) {
        const radius = PETAL_RADIUS + side * (PETAL_DEPTH / 2 - 0.22);
        const columnX = NUR_ALEM_CENTRE[0] + radius * Math.cos(angle);
        const columnZ = NUR_ALEM_CENTRE[1] + radius * Math.sin(angle);
        primitive(
          target,
          `nur-alem:petal:${petal}:column:${support}:${side}`,
          "steel",
          "cylinder",
            [columnX, BASE_Y + EXPO_PLAZA_TOP + (PETAL_HEIGHT + 0.35) / 2, columnZ],
            [0.12, PETAL_HEIGHT + 0.35, 0.12],
          FRAME,
          {
            textureProfile: "matte-aluminium",
            bearsLoad: true,
            carriesAttachments: true,
            attachmentSupportMode: "wall",
            sideAttachmentReach: 0.24,
            // The rendered mullion is slender, but it is a paired steel
            // portal welded into a concealed shoe below the pavilion floor.
            // The bearing value describes that shoe, not the visible tube.
            bearingArea: 0.09,
            volume: 0.045,
          },
        );
      }
    }
  }
}

function createLighting(target: MutableGroup): void {
  for (let level = 0; level < NIGHT_COLOURS.length; level += 1) {
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const angle = quadrant * Math.PI / 2 + level * Math.PI / 4;
      primitive(
        target,
        `nur-alem:hidden-sphere-light:${level}:${quadrant}`,
        "steel",
        "steelSheet",
        world(4.2 * Math.cos(angle), 11.5 + level * 7.2, 4.2 * Math.sin(angle)),
        [0.09, 0.09, 0.09],
        CORE,
        {
          textureProfile: "matte-aluminium",
          bearsLoad: false,
          sideAttachmentReach: 1.3,
          volume: 0.001,
          light: {
            color: NIGHT_COLOURS[level],
            distance: 38 + level * 2,
            intensity: 28 - level * 2,
            position: [0, 0, 0],
            dayIntensityFactor: 0,
            poolPriority: ASTANA_LANDMARK_LIGHT_PRIORITY,
            localPoolCapacity: ASTANA_LANDMARK_LOCAL_POOL_CAPACITY,
            poolGroupId: NUR_ALEM_LIGHT_GROUP,
            transition: { fadeInSeconds: 2.4, fadeOutSeconds: 2 },
          },
        },
      );
    }
  }
}

export function createAstanaNurAlem(
  foundation: MutableGroup,
  core: MutableGroup,
  shell: MutableGroup,
  frame: MutableGroup,
  complex: MutableGroup,
  lighting: MutableGroup,
): void {
  createFoundation(foundation);
  createCoreAndFloors(core);
  createSphere(shell);
  NUR_ALEM_FRAME_EDGES.forEach((edge) => addMember(frame, edge));
  createWindScoop(frame);
  createPetals(complex);
  createLighting(lighting);
}
