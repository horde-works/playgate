import type {
  ObjectLabModel,
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";
import { dutchLampFixture } from "../dutchLighting/dutchLightingFixtures.ts";

type DutchLandscapeKitLabModel = ObjectLabModel & {
  materialOverrides: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];
const parts: ObjectLabPart[] = [];

const addBox = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
  rotation?: ObjectPoint,
) => parts.push({ kind: "box", id, group, material, center, size, rotation });

const addBeam = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth = width,
) => parts.push({ kind: "beam", id, group, material, from, to, width, depth });

const addCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  radius: number,
  radialSegments = 10,
) => parts.push({ kind: "cylinder", id, group, material, from, to, radius, radialSegments });

const addMesh = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  vertices: ObjectPoint[],
  triangles: Array<readonly [number, number, number]>,
  doubleSided = false,
) => parts.push({ kind: "mesh", id, group, material, vertices, triangles, doubleSided });

const addRibbonPrism = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  outerLower: readonly ObjectPoint[],
  outerUpper: readonly ObjectPoint[],
  insetX: number,
) => {
  const outer = [...outerLower, ...outerUpper];
  const inner = outer.map(([x, y, z]) => point(x + insetX, y, z));
  const vertices = [...outer, ...inner];
  const count = outerLower.length;
  const triangles: Array<readonly [number, number, number]> = [];
  const outerLowerAt = (index: number) => index;
  const outerUpperAt = (index: number) => count + index;
  const innerLowerAt = (index: number) => count * 2 + index;
  const innerUpperAt = (index: number) => count * 3 + index;

  for (let index = 1; index < count; index += 1) {
    const previous = index - 1;
    triangles.push(
      [outerLowerAt(previous), outerLowerAt(index), outerUpperAt(index)],
      [outerLowerAt(previous), outerUpperAt(index), outerUpperAt(previous)],
      [innerLowerAt(previous), innerUpperAt(index), innerLowerAt(index)],
      [innerLowerAt(previous), innerUpperAt(previous), innerUpperAt(index)],
      [outerLowerAt(previous), innerLowerAt(index), outerLowerAt(index)],
      [outerLowerAt(previous), innerLowerAt(previous), innerLowerAt(index)],
      [outerUpperAt(previous), outerUpperAt(index), innerUpperAt(index)],
      [outerUpperAt(previous), innerUpperAt(index), innerUpperAt(previous)],
    );
  }
  for (const index of [0, count - 1]) {
    const reverse = index === 0;
    const face: Array<readonly [number, number, number]> = [
      [outerLowerAt(index), outerUpperAt(index), innerUpperAt(index)],
      [outerLowerAt(index), innerUpperAt(index), innerLowerAt(index)],
    ];
    triangles.push(...(reverse ? face.map(([a, b, c]) => [a, c, b] as const) : face));
  }
  addMesh(id, group, material, vertices, triangles);
};

const addExtrudedFace = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  face: readonly ObjectPoint[],
  extrusion: ObjectPoint,
) => {
  const back = face.map(([x, y, z]) => point(x + extrusion[0], y + extrusion[1], z + extrusion[2]));
  const vertices = [...face, ...back];
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 1; index < face.length - 1; index += 1) {
    triangles.push([0, index, index + 1], [face.length, face.length + index + 1, face.length + index]);
  }
  for (let index = 0; index < face.length; index += 1) {
    const next = (index + 1) % face.length;
    triangles.push([index, face.length + next, next], [index, face.length + index, face.length + next]);
  }
  addMesh(id, group, material, vertices, triangles);
};

const addDoorLeafWithHeartCutout = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  frontZ: number,
  depth: number,
  heartCenterY: number,
  heartSize: number,
) => {
  const halfHeart = heartSize / 2;
  const heartBottom = heartCenterY - halfHeart;
  const heartTop = heartCenterY + halfHeart;
  const centerZ = frontZ - depth / 2;
  addBox(`${id}:lower`, group, material, point(0, (minY + heartBottom) / 2, centerZ), point(maxX - minX, heartBottom - minY, depth));
  addBox(`${id}:upper`, group, material, point(0, (heartTop + maxY) / 2, centerZ), point(maxX - minX, maxY - heartTop, depth));
  addBox(`${id}:left`, group, material, point((minX - halfHeart) / 2, heartCenterY, centerZ), point(-halfHeart - minX, heartSize, depth));
  addBox(`${id}:right`, group, material, point((maxX + halfHeart) / 2, heartCenterY, centerZ), point(maxX - halfHeart, heartSize, depth));

  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  const appendHardEdgedPrism = (face: readonly ObjectPoint[]) => {
    const backZ = frontZ - depth;
    const frontStart = vertices.length;
    vertices.push(...face);
    triangles.push([frontStart, frontStart + 1, frontStart + 2]);
    const backStart = vertices.length;
    vertices.push(...face.map(([x, y]) => point(x, y, backZ)));
    triangles.push([backStart, backStart + 2, backStart + 1]);
    for (let index = 0; index < 3; index += 1) {
      const next = (index + 1) % 3;
      const sideStart = vertices.length;
      vertices.push(
        face[index], face[next],
        point(face[next][0], face[next][1], backZ),
        point(face[index][0], face[index][1], backZ),
      );
      triangles.push([sideStart, sideStart + 1, sideStart + 2], [sideStart, sideStart + 2, sideStart + 3]);
    }
  };
  appendHardEdgedPrism([
    point(-halfHeart, heartBottom, frontZ),
    point(0, heartBottom, frontZ),
    point(-halfHeart, heartCenterY - 0.005, frontZ),
  ]);
  appendHardEdgedPrism([
    point(0, heartBottom, frontZ),
    point(halfHeart, heartBottom, frontZ),
    point(halfHeart, heartCenterY - 0.005, frontZ),
  ]);
  appendHardEdgedPrism([
    point(-halfHeart, heartCenterY - 0.005, frontZ),
    point(-halfHeart, heartTop, frontZ),
    point(-halfHeart * 0.75, heartTop, frontZ),
  ]);
  appendHardEdgedPrism([
    point(-halfHeart * 0.75, heartTop, frontZ),
    point(0, heartCenterY + halfHeart * 0.5, frontZ),
    point(halfHeart * 0.75, heartTop, frontZ),
  ]);
  appendHardEdgedPrism([
    point(halfHeart * 0.75, heartTop, frontZ),
    point(halfHeart, heartTop, frontZ),
    point(halfHeart, heartCenterY - 0.005, frontZ),
  ]);
  addMesh(`${id}:heart-infill`, group, material, vertices, triangles);
};

const addTaperedCylinder = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  x: number,
  bottomY: number,
  topY: number,
  z: number,
  bottomRadius: number,
  topRadius: number,
  segments = 12,
) => {
  const vertices: ObjectPoint[] = [];
  for (const [y, radius] of [[bottomY, bottomRadius], [topY, topRadius]] as const) {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      vertices.push(point(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius));
    }
  }
  const bottomCentre = vertices.length;
  vertices.push(point(x, bottomY, z));
  const topCentre = vertices.length;
  vertices.push(point(x, topY, z));
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    triangles.push(
      [index, next, segments + next], [index, segments + next, segments + index],
      [bottomCentre, next, index], [topCentre, segments + index, segments + next],
    );
  }
  addMesh(id, group, material, vertices, triangles);
};

const addOpenStaveBucket = (
  id: string,
  group: string,
  x: number,
  bottomY: number,
  z: number,
  height: number,
  bottomRadius: number,
  topRadius: number,
  wallThickness: number,
  segments = 12,
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  const pushClosedStave = (angle0: number, angle1: number) => {
    const start = vertices.length;
    const outer = (angle: number, y: number, radius: number) =>
      point(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius);
    vertices.push(
      outer(angle0, bottomY, bottomRadius), outer(angle1, bottomY, bottomRadius),
      outer(angle1, bottomY + height, topRadius), outer(angle0, bottomY + height, topRadius),
      outer(angle0, bottomY, bottomRadius - wallThickness), outer(angle1, bottomY, bottomRadius - wallThickness),
      outer(angle1, bottomY + height, topRadius - wallThickness), outer(angle0, bottomY + height, topRadius - wallThickness),
    );
    triangles.push(
      [start, start + 1, start + 2], [start, start + 2, start + 3],
      [start + 4, start + 6, start + 5], [start + 4, start + 7, start + 6],
      [start, start + 3, start + 7], [start, start + 7, start + 4],
      [start + 1, start + 5, start + 6], [start + 1, start + 6, start + 2],
      [start, start + 4, start + 5], [start, start + 5, start + 1],
      [start + 3, start + 2, start + 6], [start + 3, start + 6, start + 7],
    );
  };
  for (let index = 0; index < segments; index += 1) {
    pushClosedStave(index / segments * Math.PI * 2, (index + 1) / segments * Math.PI * 2);
  }

  const bottomDiskRadius = bottomRadius - wallThickness / 2;
  const diskBottomY = bottomY + 0.008;
  const diskTopY = bottomY + 0.026;
  const bottomRingStart = vertices.length;
  for (const y of [diskBottomY, diskTopY]) {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      vertices.push(point(x + Math.cos(angle) * bottomDiskRadius, y, z + Math.sin(angle) * bottomDiskRadius));
    }
  }
  const diskBottomCentre = vertices.length;
  vertices.push(point(x, diskBottomY, z));
  const diskTopCentre = vertices.length;
  vertices.push(point(x, diskTopY, z));
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const lower = bottomRingStart + index;
    const lowerNext = bottomRingStart + next;
    const upper = bottomRingStart + segments + index;
    const upperNext = bottomRingStart + segments + next;
    triangles.push(
      [lower, lowerNext, upperNext], [lower, upperNext, upper],
      [diskBottomCentre, lowerNext, lower], [diskTopCentre, upper, upperNext],
    );
  }
  addMesh(id, group, "timber-mid", vertices, triangles);
};

const addBucketHoops = (
  id: string,
  group: string,
  x: number,
  z: number,
  bottomRadius: number,
  topRadius: number,
  bucketHeight: number,
  hoopCentres: readonly number[],
  segments = 12,
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  const hoopHeight = 0.018;
  const hoopThickness = 0.008;
  for (const centreY of hoopCentres) {
    const radiusAtHoop = bottomRadius + (topRadius - bottomRadius) * centreY / bucketHeight;
    const innerRadius = radiusAtHoop - 0.001;
    const outerRadius = innerRadius + hoopThickness;
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const angle0 = index / segments * Math.PI * 2;
      const angle1 = next / segments * Math.PI * 2;
      const start = vertices.length;
      const at = (angle: number, y: number, radius: number) =>
        point(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius);
      vertices.push(
        at(angle0, centreY - hoopHeight / 2, innerRadius), at(angle1, centreY - hoopHeight / 2, innerRadius),
        at(angle1, centreY + hoopHeight / 2, innerRadius), at(angle0, centreY + hoopHeight / 2, innerRadius),
        at(angle0, centreY - hoopHeight / 2, outerRadius), at(angle1, centreY - hoopHeight / 2, outerRadius),
        at(angle1, centreY + hoopHeight / 2, outerRadius), at(angle0, centreY + hoopHeight / 2, outerRadius),
      );
      triangles.push(
        [start, start + 2, start + 1], [start, start + 3, start + 2],
        [start + 4, start + 5, start + 6], [start + 4, start + 6, start + 7],
        [start, start + 1, start + 5], [start, start + 5, start + 4],
        [start + 3, start + 7, start + 6], [start + 3, start + 6, start + 2],
        [start, start + 4, start + 7], [start, start + 7, start + 3],
        [start + 1, start + 2, start + 6], [start + 1, start + 6, start + 5],
      );
    }
  }
  addMesh(id, group, "metal", vertices, triangles);
};

const addTubeAlongPolyline = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  path: readonly ObjectPoint[],
  radius: number,
  radialSegments = 6,
) => {
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    const previous = path[Math.max(0, pathIndex - 1)];
    const next = path[Math.min(path.length - 1, pathIndex + 1)];
    const tangentLength = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
    const tangentX = (next[0] - previous[0]) / tangentLength;
    const tangentY = (next[1] - previous[1]) / tangentLength;
    const [x, y, z] = path[pathIndex];
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const angle = radialIndex / radialSegments * Math.PI * 2;
      const inPlane = Math.sin(angle) * radius;
      vertices.push(point(
        x - tangentY * inPlane,
        y + tangentX * inPlane,
        z + Math.cos(angle) * radius,
      ));
    }
  }
  for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex += 1) {
    const ring = pathIndex * radialSegments;
    const nextRing = ring + radialSegments;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const nextRadial = (radialIndex + 1) % radialSegments;
      triangles.push(
        [ring + radialIndex, ring + nextRadial, nextRing + nextRadial],
        [ring + radialIndex, nextRing + nextRadial, nextRing + radialIndex],
      );
    }
  }
  const startCentre = vertices.length;
  vertices.push(path[0]);
  const endCentre = vertices.length;
  vertices.push(path[path.length - 1]);
  const lastRing = (path.length - 1) * radialSegments;
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    const nextRadial = (radialIndex + 1) % radialSegments;
    triangles.push(
      [startCentre, radialIndex, nextRadial],
      [endCentre, lastRing + nextRadial, lastRing + radialIndex],
    );
  }
  addMesh(id, group, material, vertices, triangles);
};

const addPointedPicket = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  x: number,
  bottomY: number,
  tipY: number,
  shoulderY: number,
  z: number,
  width: number,
  depth: number,
) => addExtrudedFace(
  id,
  group,
  material,
  [
    point(x - width / 2, bottomY, z - depth / 2),
    point(x - width / 2, shoulderY, z - depth / 2),
    point(x, tipY, z - depth / 2),
    point(x + width / 2, shoulderY, z - depth / 2),
    point(x + width / 2, bottomY, z - depth / 2),
  ],
  point(0, 0, depth),
);

const addFacetedCap = (
  id: string,
  group: string,
  material: ObjectMaterialId,
  x: number,
  baseY: number,
  z: number,
  radius: number,
  height: number,
) => {
  const halfSide = radius / Math.sqrt(2);
  const vertices = [
    point(x - halfSide, baseY, z - halfSide), point(x + halfSide, baseY, z - halfSide),
    point(x + halfSide, baseY, z + halfSide), point(x - halfSide, baseY, z + halfSide),
    point(x, baseY + height, z),
  ];
  addMesh(id, group, material, vertices, [
    [0, 2, 1], [0, 3, 2],
    [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4],
  ]);
};

const addForgedRing = (
  id: string,
  group: string,
  center: ObjectPoint,
  outerRadius: number,
  tubeRadius: number,
) => {
  const segments = 12;
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  for (const depth of [-tubeRadius, tubeRadius]) {
    for (const radius of [outerRadius, outerRadius - tubeRadius * 2]) {
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        vertices.push(point(
          center[0] + Math.cos(angle) * radius,
          center[1] + Math.sin(angle) * radius,
          center[2] + depth,
        ));
      }
    }
  }
  const loop = (depth: number, ring: number, index: number) => depth * segments * 2 + ring * segments + index;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    triangles.push(
      [loop(0, 0, index), loop(0, 0, next), loop(1, 0, next)],
      [loop(0, 0, index), loop(1, 0, next), loop(1, 0, index)],
      [loop(0, 1, index), loop(1, 1, next), loop(0, 1, next)],
      [loop(0, 1, index), loop(1, 1, index), loop(1, 1, next)],
      [loop(0, 0, index), loop(0, 1, next), loop(0, 0, next)],
      [loop(0, 0, index), loop(0, 1, index), loop(0, 1, next)],
      [loop(1, 0, index), loop(1, 0, next), loop(1, 1, next)],
      [loop(1, 0, index), loop(1, 1, next), loop(1, 1, index)],
    );
  }
  addMesh(id, group, "metal", vertices, triangles);
};

const addSteppedStringer = (
  id: string,
  x: number,
) => {
  const segments = [
    { z0: 1.08, z1: 1.22, top: 0.598, bottom0: 0.45, bottom1: 0.36 },
    { z0: 1.22, z1: 1.46, top: 0.428, bottom0: 0.36, bottom1: 0.205 },
    { z0: 1.46, z1: 1.70, top: 0.258, bottom0: 0.205, bottom1: 0.05 },
  ] as const;
  const vertices: ObjectPoint[] = [];
  const triangles: Array<readonly [number, number, number]> = [];
  for (const segment of segments) {
    const start = vertices.length;
    for (const faceX of [x - 0.04, x + 0.04]) {
      vertices.push(
        point(faceX, segment.top, segment.z0),
        point(faceX, segment.top, segment.z1),
        point(faceX, segment.bottom1, segment.z1),
        point(faceX, segment.bottom0, segment.z0),
      );
    }
    triangles.push(
      [start, start + 1, start + 2], [start, start + 2, start + 3],
      [start + 4, start + 6, start + 5], [start + 4, start + 7, start + 6],
      [start, start + 4, start + 5], [start, start + 5, start + 1],
      [start + 1, start + 5, start + 6], [start + 1, start + 6, start + 2],
      [start + 2, start + 6, start + 7], [start + 2, start + 7, start + 3],
      [start + 3, start + 7, start + 4], [start + 3, start + 4, start],
    );
  }
  addMesh(id, "jetty-steps", "timber-dark", vertices, triangles);
};

const addOrganicCrown = (
  id: string,
  group: string,
  center: ObjectPoint,
  size: ObjectPoint,
  phase = 0,
) => {
  const vertices: ObjectPoint[] = [
    point(center[0], center[1] - size[1] / 2, center[2]),
    point(center[0], center[1] + size[1] / 2, center[2]),
  ];
  const segments = 8;
  for (const [ring, yFactor, radiusFactor] of [[0, -0.24, 1], [1, 0.26, 0.82]] as const) {
    for (let index = 0; index < segments; index += 1) {
      const angle = phase + (index / segments) * Math.PI * 2 + ring * 0.18;
      const irregular = 0.88 + ((index * 7 + ring * 3) % 5) * 0.055;
      vertices.push(point(
        center[0] + Math.cos(angle) * size[0] * 0.5 * radiusFactor * irregular,
        center[1] + size[1] * yFactor + ((index % 3) - 1) * 0.035,
        center[2] + Math.sin(angle) * size[2] * 0.5 * radiusFactor * irregular,
      ));
    }
  }
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const lower = 2 + index;
    const lowerNext = 2 + next;
    const upper = 2 + segments + index;
    const upperNext = 2 + segments + next;
    triangles.push([0, lowerNext, lower], [lower, lowerNext, upperNext], [lower, upperNext, upper], [upper, upperNext, 1]);
  }
  addMesh(id, group, "foliage", vertices, triangles, true);
};

const schouwGroups = ["schouw-hull", "schouw-frame", "schouw-fittings"] as const;
const mooringPostGroups = ["mooring-posts-primary", "mooring-posts-fittings"] as const;
const jettyGroups = ["jetty-primary", "jetty-deck", "jetty-steps"] as const;
const picketFenceGroups = [
  "picket-fence-primary",
  "picket-fence-cladding",
  "picket-gate-frame",
  "picket-gate-cladding",
  "picket-gate-hardware",
] as const;
const peatStoreGroups = [
  "peat-store-primary",
  "peat-store-roof-skin",
  "peat-store-cladding",
  "peat-store-fuel",
] as const;
const privyGroups = [
  "privy-primary",
  "privy-floor-seat",
  "privy-cladding",
  "privy-door",
  "privy-hardware",
  "privy-roof-skin",
] as const;
const handPumpGroups = [
  "hand-pump-primary",
  "hand-pump-hardware",
  "hand-pump-bucket",
  "hand-pump-bucket-hardware",
] as const;
const dryingLineGroups = [
  "drying-line-primary",
  "drying-line-lines",
  "drying-line-prop",
] as const;
const beanFrameGroups = [
  "bean-frame-primary",
  "bean-frame-bindings",
  "bean-frame-bed",
] as const;
const rainBarrelGroups = [
  "rain-barrel-primary",
  "rain-barrel-hardware",
  "rain-barrel-support",
  "rain-barrel-downspout",
] as const;

// Schouw: the model zero is the light-ship waterline. Its flat bottom sits
// 0.15 m below zero; this is the deliberate exception to the ground datum used
// by the land objects in this kit.
const schouwBottomRise = Math.atan2(0.18, 0.36);
const schouwBottomEndLength = Math.hypot(0.36, 0.18);
const schouwBottomEndCentreY = (-0.128 + 0.052) / 2 - 0.011 * Math.cos(schouwBottomRise);
for (const x of [-0.36, -0.12, 0.12, 0.36]) {
  addBox(`schouw-bottom:${x}:mid`, "schouw-hull", "timber-mid", point(x, -0.139, 0), point(0.24, 0.022, 3.5));
  addBox(`schouw-bottom:${x}:stern`, "schouw-hull", "timber-mid", point(x, schouwBottomEndCentreY, -1.93), point(0.24, 0.022, schouwBottomEndLength), point(schouwBottomRise, 0, 0));
  addBox(`schouw-bottom:${x}:bow`, "schouw-hull", "timber-mid", point(x, schouwBottomEndCentreY, 1.93), point(0.24, 0.022, schouwBottomEndLength), point(-schouwBottomRise, 0, 0));
}

const schouwBottomLine = [
  [0.38, 0.03, -2.11], [0.44, -0.15, -1.75], [0.47, -0.15, -1.15],
  [0.475, -0.15, 0], [0.47, -0.15, 1.15], [0.44, -0.15, 1.75], [0.38, 0.03, 2.11],
] as const;
const schouwChineLine = [
  [0.50, 0.16, -2.18], [0.57, 0.09, -1.75], [0.595, 0.075, -1.15],
  [0.60, 0.07, 0], [0.595, 0.075, 1.15], [0.57, 0.09, 1.75], [0.50, 0.16, 2.18],
] as const;
const schouwSheerLine = [
  [0.57, 0.38, -2.30], [0.65, 0.34, -1.75], [0.69, 0.31, -1.15],
  [0.695, 0.30, 0], [0.69, 0.31, 1.15], [0.65, 0.34, 1.75], [0.57, 0.38, 2.30],
] as const;
for (const side of [-1, 1] as const) {
  const pointsAt = (line: typeof schouwBottomLine | typeof schouwChineLine | typeof schouwSheerLine) =>
    line.map(([width, y, z]) => point(side * width, y, z));
  const lower = pointsAt(schouwBottomLine);
  const chine = pointsAt(schouwChineLine);
  const top = pointsAt(schouwSheerLine);
  addRibbonPrism(`schouw-side:${side}:lower`, "schouw-hull", "timber-dark", lower, chine, -side * 0.022);
  addRibbonPrism(`schouw-side:${side}:upper`, "schouw-hull", "timber-dark", chine, top, -side * 0.022);
  addRibbonPrism(
    `schouw-gunwale:${side}`,
    "schouw-fittings",
    "paint-light",
    top.map(([x, y, z]) => point(x + side * 0.03, y, z)),
    top.map(([x, y, z]) => point(x + side * 0.03, y + 0.03, z)),
    -side * 0.06,
  );
}

addExtrudedFace(
  "schouw-transom:bow",
  "schouw-hull",
  "timber-dark",
  [point(-0.38, 0.03, 2.11), point(0.38, 0.03, 2.11), point(0.50, 0.16, 2.18), point(0.57, 0.38, 2.30), point(-0.57, 0.38, 2.30), point(-0.50, 0.16, 2.18)],
  point(0, 0, -0.022),
);
addExtrudedFace(
  "schouw-transom:stern",
  "schouw-hull",
  "timber-dark",
  [point(0.38, 0.03, -2.11), point(-0.38, 0.03, -2.11), point(-0.50, 0.16, -2.18), point(-0.57, 0.38, -2.30), point(0.57, 0.38, -2.30), point(0.50, 0.16, -2.18)],
  point(0, 0, 0.022),
);
for (const end of [-1, 1] as const) {
  addBeam(`schouw-transom-trim:${end}:left`, "schouw-fittings", "paint-light", point(-0.38, 0.03, end * 2.11), point(-0.57, 0.38, end * 2.30), 0.055, 0.03);
  addBeam(`schouw-transom-trim:${end}:right`, "schouw-fittings", "paint-light", point(0.38, 0.03, end * 2.11), point(0.57, 0.38, end * 2.30), 0.055, 0.03);
  addBeam(`schouw-transom-trim:${end}:top`, "schouw-fittings", "paint-light", point(-0.57, 0.38, end * 2.30), point(0.57, 0.38, end * 2.30), 0.055, 0.03);
}

for (const [index, z] of [-1.6, -0.8, 0, 0.8, 1.6].entries()) {
  addBeam(`schouw-frame:${index}:floor`, "schouw-frame", "timber-mid", point(-0.43, -0.103, z), point(0.43, -0.103, z), 0.05, 0.07);
  for (const side of [-1, 1] as const) {
    addBeam(`schouw-frame:${index}:side:${side}`, "schouw-frame", "timber-mid", point(side * 0.43, -0.103, z), point(side * 0.645, 0.285, z), 0.05, 0.07);
  }
}
for (const z of [-0.55, 0.55]) {
  addBox(`schouw-bench:${z}`, "schouw-frame", "timber-mid", point(0, 0.2625, z), point(1.12, 0.035, 0.26));
}
addBox("schouw-foredeck", "schouw-frame", "timber-mid", point(0, 0.2875, 2), point(1.02, 0.035, 0.5));
for (const side of [-1, 1] as const) {
  addBeam(`schouw-oar:${side}:shaft`, "schouw-fittings", "timber-mid", point(side * 0.15, 0.36, 0.25), point(side * 2.32, 0.18, -0.45), 0.045, 0.045);
  addBeam(`schouw-oar:${side}:blade`, "schouw-fittings", "timber-mid", point(side * 2.32, 0.18, -0.45), point(side * 2.62, 0.13, -0.55), 0.12, 0.025);
  addBox(`schouw-rowlock:${side}:base`, "schouw-fittings", "timber-dark", point(side * 0.66, 0.315, 0.25), point(0.06, 0.03, 0.085));
  for (const z of [0.222, 0.278]) {
    addCylinder(`schouw-rowlock:${side}:prong:${z}`, "schouw-fittings", "timber-dark", point(side * 0.66, 0.33, z), point(side * 0.66, 0.39, z), 0.012, 7);
  }
}

// Two-pile mooring module. y=0 is the driven tip datum; the waterline anchor
// is 0.85 m above it so 0.75 m remains visible above water.
for (const x of [-1.6, 1.6]) {
  addCylinder(`mooring-post:${x}:shaft:wet`, "mooring-posts-primary", "timber-dark", point(x, 0, 0), point(x, 0.85, 0), 0.09, 8);
  addCylinder(`mooring-post:${x}:shaft:dry`, "mooring-posts-primary", "timber-dark", point(x, 0.85, 0), point(x, 1.5, 0), 0.09, 8);
  addFacetedCap(`mooring-post:${x}:cap`, "mooring-posts-primary", "timber-dark", x, 1.5, 0, 0.09, 0.1);
  addBox(`mooring-post:${x}:ring-bracket`, "mooring-posts-fittings", "metal", point(x, 1.46, 0.1), point(0.045, 0.08, 0.035));
  addForgedRing(`mooring-post:${x}:ring`, "mooring-posts-fittings", point(x, 1.40, 0.125), 0.07, 0.012);
}

// Private landing jetty. y=0 is the channel-bed datum, the local waterline is
// y=0.33 and the deck top is therefore exactly 0.30 m above the water.
for (const x of [-0.46, 0.46]) {
  for (const z of [-1.12, 1.12]) {
    addCylinder(`jetty-pile:${x}:${z}`, "jetty-primary", "timber-dark", point(x, 0, z), point(x, 0.78, z), 0.07, 10);
  }
}
for (const x of [-0.38, 0.38]) {
  addBox(`jetty-bearer:${x}`, "jetty-primary", "timber-dark", point(x, 0.528, 0), point(0.1, 0.14, 2.4));
}
for (let index = 0; index < 7; index += 1) {
  const x = -0.48 + index * 0.16;
  addBox(`jetty-deck-board:${index}`, "jetty-deck", "timber-mid", point(x, 0.614, 0), point(0.15, 0.032, 2.4));
}
for (const x of [-0.25, 0.25]) {
  addSteppedStringer(`jetty-step-stringer:${x}`, x);
}
addBox("jetty-step:upper", "jetty-steps", "timber-mid", point(0, 0.444, 1.34), point(0.6, 0.032, 0.24));
addBox("jetty-step:lower", "jetty-steps", "timber-mid", point(0, 0.274, 1.58), point(0.6, 0.032, 0.24));

// Domestic Zaan picket fence: a three-metre module and a 0.95 m gate share
// one hinge post.  It remains a distinct family from the driven field fence.
const picketModuleLeft = -2;
const picketModuleRight = 1;
const picketPostSize = 0.09;
const picketPostCentres = [picketModuleLeft + picketPostSize / 2, picketModuleRight - picketPostSize / 2] as const;
for (const [index, x] of picketPostCentres.entries()) {
  addBox(`picket-fence-post:${index}`, "picket-fence-primary", "cladding", point(x, 0.5, 0), point(picketPostSize, 1, picketPostSize));
  addFacetedCap(`picket-fence-post-cap:${index}`, "picket-fence-primary", "paint-light", x, 1, 0, 0.11 / Math.sqrt(2), 0.11);
}
for (const y of [0.18, 0.68]) {
  addBox(`picket-fence-rail:${y}`, "picket-fence-primary", "cladding", point(-0.5, y, 0), point(2.82, 0.07, 0.035));
}
for (let index = 0; index < 20; index += 1) {
  addPointedPicket(
    `picket-fence-picket:${index}`,
    "picket-fence-cladding",
    "cladding",
    -1.83 + index * 0.14,
    0.06,
    0.86,
    0.76,
    0.025,
    0.075,
    0.02,
  );
}

const gateMinX = 1;
const gateMaxX = 1.95;
const gateCentreX = (gateMinX + gateMaxX) / 2;
for (const x of [gateMinX + 0.035, gateMaxX - 0.035]) {
  addBox(`picket-gate-frame-stile:${x}`, "picket-gate-frame", "paint-light", point(x, 0.5, 0.025), point(0.07, 0.9, 0.055));
}
for (const y of [0.085, 0.915]) {
  addBox(`picket-gate-frame-rail:${y}`, "picket-gate-frame", "paint-light", point(gateCentreX, y, 0.025), point(0.81, 0.07, 0.055));
}
for (let index = 0; index < 6; index += 1) {
  addPointedPicket(
    `picket-gate-picket:${index}`,
    "picket-gate-cladding",
    "cladding",
    1.125 + index * 0.14,
    0.12,
    0.88,
    0.78,
    0.06,
    0.075,
    0.02,
  );
}
addBeam("picket-gate-diagonal", "picket-gate-frame", "paint-light", point(1.07, 0.14, 0.07), point(1.88, 0.86, 0.07), 0.07, 0.04);

for (const y of [0.28, 0.76]) {
  addCylinder(`picket-gate-hinge-pin:${y}`, "picket-gate-hardware", "metal", point(1, y - 0.06, 0.06), point(1, y + 0.06, 0.06), 0.018, 10);
  addBox(`picket-gate-hinge-strap:${y}`, "picket-gate-hardware", "metal", point(1.17, y, 0.06), point(0.34, 0.05, 0.03));
}
addBox("picket-gate-latch-post", "picket-fence-primary", "cladding", point(2, 0.5, 0), point(0.09, 1, 0.09));
addFacetedCap("picket-gate-latch-post-cap", "picket-fence-primary", "paint-light", 2, 1, 0, 0.11 / Math.sqrt(2), 0.11);
addBox("picket-gate-latch-bar", "picket-gate-hardware", "metal", point(1.82, 0.61, 0.06), point(0.30, 0.045, 0.03));
addBox("picket-gate-latch-catch", "picket-gate-hardware", "metal", point(1.97, 0.61, 0.06), point(0.05, 0.10, 0.035));
addCylinder("picket-gate-latch-handle", "picket-gate-hardware", "metal", point(1.69, 0.56, 0.08), point(1.69, 0.66, 0.08), 0.014, 8);

// Small ventilated peat store.  The front remains fully open; a grounded bulk
// volume carries three explicit top courses whose plan alternation exposes the
// authored airflow lattice without spending the budget on hidden bricks.
const peatStoreWidth = 2.6;
const peatStoreDepth = 1.2;
const peatStoreFrontPostHeight = 2.15;
const peatStoreRearPostHeight = 1.75;
const peatStorePostSize = 0.1;
const peatStorePostX = peatStoreWidth / 2 - peatStorePostSize / 2;
const peatStorePostZ = peatStoreDepth / 2 - peatStorePostSize / 2;
const peatStoreRoofPitch = Math.atan2(
  peatStoreFrontPostHeight - peatStoreRearPostHeight,
  peatStorePostZ * 2,
);
const peatStoreRafterCentreBelowPostTop = 0.03;
for (const x of [-peatStorePostX, peatStorePostX]) {
  addBox(`peat-store-post:front:${x}`, "peat-store-primary", "timber-dark", point(x, peatStoreFrontPostHeight / 2, peatStorePostZ), point(peatStorePostSize, peatStoreFrontPostHeight, peatStorePostSize));
  addBox(`peat-store-post:rear:${x}`, "peat-store-primary", "timber-dark", point(x, peatStoreRearPostHeight / 2, -peatStorePostZ), point(peatStorePostSize, peatStoreRearPostHeight, peatStorePostSize));
}
addBeam("peat-store-plate:front", "peat-store-primary", "timber-dark", point(-peatStorePostX, peatStoreFrontPostHeight, peatStorePostZ), point(peatStorePostX, peatStoreFrontPostHeight, peatStorePostZ), 0.1, 0.12);
addBeam("peat-store-plate:rear", "peat-store-primary", "timber-dark", point(-peatStorePostX, peatStoreRearPostHeight, -peatStorePostZ), point(peatStorePostX, peatStoreRearPostHeight, -peatStorePostZ), 0.1, 0.12);
for (const x of [-peatStorePostX, 0, peatStorePostX]) {
  addBeam(
    `peat-store-rafter:${x}`,
    "peat-store-primary",
    "timber-dark",
    point(x, peatStoreRearPostHeight - peatStoreRafterCentreBelowPostTop, -peatStorePostZ),
    point(x, peatStoreFrontPostHeight - peatStoreRafterCentreBelowPostTop, peatStorePostZ),
    0.08,
    0.1,
  );
}
for (const x of [-peatStorePostX, peatStorePostX]) {
  addBeam(
    `peat-store-knee-brace:${x}`,
    "peat-store-primary",
    "timber-dark",
    point(x, 1.65, peatStorePostZ),
    point(x, 2 + 0.15 * Math.tan(peatStoreRoofPitch) - 0.08, 0.15),
    0.07,
    0.06,
  );
}
addBox(
  "peat-store-roof-skin",
  "peat-store-roof-skin",
  "roof-dark",
  point(0, 2, 0),
  point(2.8, 0.055, 1.45),
  point(-peatStoreRoofPitch, 0, 0),
);
for (let index = 0; index < 6; index += 1) {
  addBox(
    `peat-store-rear-slat:${index}`,
    "peat-store-cladding",
    "timber-dark",
    point(0, 0.22 + index * 0.28, -peatStorePostZ),
    point(peatStorePostX * 2, 0.12, 0.03),
  );
}

const peatStackLength = 2.2;
const peatStackHeight = 1.6;
const peatBrickSize = point(0.3, 0.1, 0.14);
const peatBrickYaw = 24 * Math.PI / 180;
const peatBrickRotatedWidth = peatBrickSize[0] * Math.cos(peatBrickYaw) + peatBrickSize[2] * Math.sin(peatBrickYaw);
const peatBrickPitch = peatBrickRotatedWidth + 0.04;
addBox("peat-store-stack-bulk", "peat-store-fuel", "soil-bed", point(0, 0.65, -0.21), point(peatStackLength, 1.3, 0.62));
for (let course = 0; course < 3; course += 1) {
  for (let index = 0; index < 6; index += 1) {
    const yaw = ((course + index) % 2 === 0 ? 1 : -1) * peatBrickYaw;
    addBox(
      `peat-store-brick:${course}:${index}`,
      "peat-store-fuel",
      "soil-bed",
      point((index - 2.5) * peatBrickPitch, 1.35 + course * 0.1, 0.03),
      peatBrickSize,
      point(0, yaw, 0),
    );
  }
}

// One-person ditch privy.  The door faces land (+Z), while the rear wall and
// the drop below the seat remain genuinely open toward the water (-Z).
const privyWidth = 1.05;
const privyDepth = 1.25;
const privyHalfWidth = privyWidth / 2;
const privyHalfDepth = privyDepth / 2;
const privyFloorTop = 0.2;
const privyFrontEave = 2;
const privyRearEave = 1.78;
const privyRoofPitch = Math.atan2(privyFrontEave - privyRearEave, privyDepth);
const privyBankEdgeZ = 0.475;
const privyCantileverRearZ = -privyHalfDepth;
const privyCantileverFrontZ = 0.75;
const privyCantileverLength = privyCantileverFrontZ - privyCantileverRearZ;
const privyHeartCenterY = 1.45;
const privyHeartSize = 0.12;
const privyPostSize = 0.08;
const privyPostX = privyHalfWidth - privyPostSize / 2;
const privyPostZ = privyHalfDepth - privyPostSize / 2;
const privyPlateDrop = 0.04;

for (const x of [-0.45, 0.45]) {
  addBox(
    `privy-cantilever:${x}`,
    "privy-primary",
    "timber-dark",
    point(x, 0.08, (privyCantileverRearZ + privyCantileverFrontZ) / 2),
    point(0.12, 0.16, privyCantileverLength),
  );
}
for (const x of [-privyPostX, privyPostX]) {
  for (const [side, z, top] of [
    ["rear", -privyPostZ, privyRearEave],
    ["front", privyPostZ, privyFrontEave],
  ] as const) {
    addBox(
      `privy-post:${side}:${x}`,
      "privy-primary",
      "timber-dark",
      point(x, (0.16 + top) / 2, z),
      point(privyPostSize, top - 0.16, privyPostSize),
    );
  }
  addBeam(
    `privy-side-plate:${x}`,
    "privy-primary",
    "timber-dark",
    point(x, privyRearEave - privyPlateDrop, -privyPostZ),
    point(x, privyFrontEave - privyPlateDrop, privyPostZ),
    0.08,
    0.1,
  );
}
addBeam("privy-front-plate", "privy-primary", "timber-dark", point(-privyPostX, privyFrontEave - privyPlateDrop, privyPostZ), point(privyPostX, privyFrontEave - privyPlateDrop, privyPostZ), 0.08, 0.1);
addBeam("privy-rear-plate", "privy-primary", "timber-dark", point(-privyPostX, privyRearEave - privyPlateDrop, -privyPostZ), point(privyPostX, privyRearEave - privyPlateDrop, -privyPostZ), 0.08, 0.1);

// Three floor pieces leave a 0.34 m wide drop open all the way to the rear.
addBox("privy-floor:front", "privy-floor-seat", "timber-mid", point(0, 0.18, 0.1725), point(0.97, 0.04, 0.905));
for (const side of [-1, 1] as const) {
  addBox(
    `privy-floor:rear:${side}`,
    "privy-floor-seat",
    "timber-mid",
    point(side * 0.3275, 0.18, -0.4525),
    point(0.315, 0.04, 0.345),
  );
}

const privyRoofLineAt = (z: number) =>
  privyRearEave + (z + privyHalfDepth) / privyDepth * (privyFrontEave - privyRearEave);
for (const side of [-1, 1] as const) {
  for (let index = 0; index < 5; index += 1) {
    const rawZ0 = -privyHalfDepth + index * 0.25;
    const rawZ1 = rawZ0 + 0.25;
    const z0 = rawZ0 + (index === 0 ? 0 : 0.003);
    const z1 = rawZ1 - (index === 4 ? 0 : 0.003);
    addExtrudedFace(
      `privy-side-board:${side}:${index}`,
      "privy-cladding",
      "cladding",
      [
        point(side * privyHalfWidth, privyFloorTop, z0),
        point(side * privyHalfWidth, privyRoofLineAt(z0), z0),
        point(side * privyHalfWidth, privyRoofLineAt(z1), z1),
        point(side * privyHalfWidth, privyFloorTop, z1),
      ],
      point(-side * 0.025, 0, 0),
    );
  }
}

const privyDoorOpeningHalfWidth = 0.32;
const privyFacadeDepth = 0.025;
const privyFacadeZ = privyHalfDepth - privyFacadeDepth / 2;
const privyPierWidth = privyHalfWidth - privyDoorOpeningHalfWidth;
for (const side of [-1, 1] as const) {
  addBox(
    `privy-front-pier:${side}`,
    "privy-cladding",
    "cladding",
    point(side * (privyDoorOpeningHalfWidth + privyPierWidth / 2), (privyFloorTop + privyFrontEave) / 2, privyFacadeZ),
    point(privyPierWidth, privyFrontEave - privyFloorTop, privyFacadeDepth),
  );
}
addBox(
  "privy-front-head",
  "privy-cladding",
  "cladding",
  point(0, 1.975, privyFacadeZ),
  point(privyDoorOpeningHalfWidth * 2, 0.05, privyFacadeDepth),
);

addDoorLeafWithHeartCutout(
  "privy-door-leaf",
  "privy-door",
  "cladding",
  -0.31,
  0.31,
  privyFloorTop,
  1.95,
  0.651,
  0.025,
  privyHeartCenterY,
  privyHeartSize,
);
for (const side of [-1, 1] as const) {
  addBox(`privy-door-trim:${side}`, "privy-door", "paint-light", point(side * 0.345, 1.1, 0.665), point(0.05, 1.8, 0.03));
}
addBox("privy-door-trim:head", "privy-door", "paint-light", point(0, 1.975, 0.665), point(0.74, 0.05, 0.03));

for (const y of [0.58, 1.6]) {
  addCylinder(`privy-hinge-pin:${y}`, "privy-hardware", "metal", point(-0.32, y - 0.055, 0.655), point(-0.32, y + 0.055, 0.655), 0.014, 8);
  addBox(`privy-hinge-strap:${y}`, "privy-hardware", "metal", point(-0.22, y, 0.655), point(0.2, 0.04, 0.022));
}
addBox("privy-latch-bar", "privy-hardware", "metal", point(0.235, 1.08, 0.655), point(0.19, 0.04, 0.022));
addBox("privy-latch-catch", "privy-hardware", "metal", point(0.33, 1.08, 0.655), point(0.03, 0.095, 0.028));

// The seat top is exactly 0.50 m above the finished floor and remains open to
// the water at the back instead of hiding a solid waste box.
addBox("privy-seat-apron", "privy-floor-seat", "timber-mid", point(0, 0.43, -0.2675), point(0.97, 0.46, 0.025));
for (const side of [-1, 1] as const) {
  addBox(`privy-seat-side:${side}`, "privy-floor-seat", "timber-mid", point(side * 0.3275, 0.68, -0.4525), point(0.315, 0.04, 0.345));
}
addBox("privy-seat-front", "privy-floor-seat", "timber-mid", point(0, 0.68, -0.32), point(0.34, 0.04, 0.08));

const privyRoofHorizontalDepth = 1.41;
const privyRoofSlopeDepth = privyRoofHorizontalDepth / Math.cos(privyRoofPitch);
const privyRoofThickness = 0.05;
const privyRoofCenterY = privyFrontEave
  - privyHalfDepth * Math.tan(privyRoofPitch)
  + privyRoofThickness / (2 * Math.cos(privyRoofPitch));
addBox(
  "privy-roof-skin",
  "privy-roof-skin",
  "roof-dark",
  point(0, privyRoofCenterY, 0),
  point(1.25, privyRoofThickness, privyRoofSlopeDepth),
  point(-privyRoofPitch, 0, 0),
);

// Nineteenth-century private cast-iron hand pump with a separate stave-built
// oak bucket.  The stone plate and bucket both use y=0 as their ground datum;
// +Z is the working/spout side and the lever swings away toward -Z.
const handPumpStoneSize = 0.55;
const handPumpStoneHeight = 0.12;
const handPumpColumnHeight = 1.15;
const handPumpColumnBottomY = handPumpStoneHeight;
const handPumpColumnTopY = handPumpColumnBottomY + handPumpColumnHeight;
const handPumpBarrelRadius = 0.07;
const handPumpBarrelTopRadius = 0.055;
const handPumpSpoutY = 0.82;
const handPumpSpoutProjection = 0.22;
const handPumpNozzleZ = handPumpBarrelRadius + handPumpSpoutProjection;
const handPumpPivotY = 1.21;
const handPumpPivotDiameter = 0.06;
const handPumpLeverLength = 0.55;
const handPumpLeverAngle = 12 * Math.PI / 180;
const handPumpGripLength = 0.15;
const handPumpBucketDiameter = 0.28;
const handPumpBucketHeight = 0.26;
const handPumpBucketTopRadius = handPumpBucketDiameter / 2;
const handPumpBucketBottomRadius = 0.12;
const handPumpBucketZ = 0.41;

addBox(
  "hand-pump-stone-base",
  "hand-pump-primary",
  "stone",
  point(0, handPumpStoneHeight / 2, 0),
  point(handPumpStoneSize, handPumpStoneHeight, handPumpStoneSize),
);
addCylinder(
  "hand-pump-foot-flange",
  "hand-pump-primary",
  "metal",
  point(0, handPumpColumnBottomY, 0),
  point(0, 0.23, 0),
  0.1,
  12,
);
addTaperedCylinder(
  "hand-pump-barrel",
  "hand-pump-primary",
  "metal",
  0,
  0.18,
  1.19,
  0,
  handPumpBarrelRadius,
  handPumpBarrelTopRadius,
  16,
);
addCylinder(
  "hand-pump-top-cap",
  "hand-pump-primary",
  "metal",
  point(0, 1.15, 0),
  point(0, handPumpColumnTopY, 0),
  handPumpBarrelRadius,
  12,
);
addCylinder(
  "hand-pump-spout",
  "hand-pump-hardware",
  "metal",
  point(0, handPumpSpoutY, handPumpBarrelTopRadius),
  point(0, handPumpSpoutY, handPumpNozzleZ),
  0.028,
  10,
);
addCylinder(
  "hand-pump-nozzle",
  "hand-pump-hardware",
  "metal",
  point(0, handPumpSpoutY + 0.015, handPumpNozzleZ),
  point(0, 0.73, handPumpNozzleZ),
  0.03,
  10,
);
addCylinder(
  "hand-pump-pivot",
  "hand-pump-hardware",
  "metal",
  point(-0.09, handPumpPivotY, 0),
  point(0.09, handPumpPivotY, 0),
  handPumpPivotDiameter / 2,
  12,
);
const handPumpLeverPoint = (distance: number) => point(
  0,
  handPumpPivotY - Math.sin(handPumpLeverAngle) * distance,
  -Math.cos(handPumpLeverAngle) * distance,
);
addBeam(
  "hand-pump-lever",
  "hand-pump-hardware",
  "metal",
  handPumpLeverPoint(0),
  handPumpLeverPoint(handPumpLeverLength - handPumpGripLength + 0.01),
  0.028,
  0.04,
);
addCylinder(
  "hand-pump-wood-grip",
  "hand-pump-hardware",
  "timber-mid",
  handPumpLeverPoint(handPumpLeverLength - handPumpGripLength - 0.01),
  handPumpLeverPoint(handPumpLeverLength),
  0.025,
  10,
);

addOpenStaveBucket(
  "hand-pump-bucket-shell",
  "hand-pump-bucket",
  0,
  0,
  handPumpBucketZ,
  handPumpBucketHeight,
  handPumpBucketBottomRadius,
  handPumpBucketTopRadius,
  0.012,
  12,
);
addBucketHoops(
  "hand-pump-bucket-hoops",
  "hand-pump-bucket-hardware",
  0,
  handPumpBucketZ,
  handPumpBucketBottomRadius,
  handPumpBucketTopRadius,
  handPumpBucketHeight,
  [0.065, 0.205],
  12,
);
const handPumpBailLeft = point(-0.13, 0.22, handPumpBucketZ);
const handPumpBailLeftShoulder = point(-0.075, 0.39, handPumpBucketZ);
const handPumpBailRightShoulder = point(0.075, 0.39, handPumpBucketZ);
const handPumpBailRight = point(0.13, 0.22, handPumpBucketZ);
addCylinder("hand-pump-bucket-bail:left", "hand-pump-bucket-hardware", "metal", handPumpBailLeft, handPumpBailLeftShoulder, 0.008, 8);
addCylinder("hand-pump-bucket-bail:top", "hand-pump-bucket-hardware", "metal", handPumpBailLeftShoulder, handPumpBailRightShoulder, 0.008, 8);
addCylinder("hand-pump-bucket-bail:right", "hand-pump-bucket-hardware", "metal", handPumpBailRightShoulder, handPumpBailRight, 0.008, 8);

// Fixed farmyard drying line.  The two opaque cord meshes follow one exact
// parabolic sag; a removable leaning Y-prop meets both low midspan points.
const dryingLineSpan = 7;
const dryingLineHalfSpan = dryingLineSpan / 2;
const dryingLinePostSection = 0.09;
const dryingLinePostHeight = 2;
const dryingLineCrossbarLength = 0.55;
const dryingLineCrossbarSection = 0.07;
const dryingLineCrossbarY = 1.95;
const dryingLineEndpointY = 1.96;
const dryingLineSag = 0.12;
const dryingLineRadius = 0.006;
const dryingLineZStations = [-0.2, 0.2] as const;
const dryingLinePropLength = 2.3;
const dryingLinePropRadius = 0.025;
const dryingLinePropTopY = dryingLineEndpointY - dryingLineSag - 0.09;
const dryingLinePropQuadraticA = 1 + dryingLinePropRadius ** 2 / dryingLinePropLength ** 2;
const dryingLinePropQuadraticB = -2 * dryingLinePropTopY * dryingLinePropRadius / dryingLinePropLength;
const dryingLinePropQuadraticC = dryingLinePropTopY ** 2 - dryingLinePropLength ** 2;
const dryingLinePropRun = (
  -dryingLinePropQuadraticB
  + Math.sqrt(dryingLinePropQuadraticB ** 2 - 4 * dryingLinePropQuadraticA * dryingLinePropQuadraticC)
) / (2 * dryingLinePropQuadraticA);
const dryingLinePropFootY = dryingLinePropRadius * dryingLinePropRun / dryingLinePropLength;
const dryingLinePropFoot = point(dryingLinePropRun, dryingLinePropFootY, 0);
const dryingLinePropTop = point(0, dryingLinePropTopY, 0);

for (const x of [-dryingLineHalfSpan, dryingLineHalfSpan]) {
  addBox(
    `drying-line-post:${x}`,
    "drying-line-primary",
    "timber-dark",
    point(x, dryingLinePostHeight / 2, 0),
    point(dryingLinePostSection, dryingLinePostHeight, dryingLinePostSection),
  );
  addBox(
    `drying-line-crossbar:${x}`,
    "drying-line-primary",
    "timber-dark",
    point(x, dryingLineCrossbarY, 0),
    point(dryingLineCrossbarSection, dryingLineCrossbarSection, dryingLineCrossbarLength),
  );
}

for (const z of dryingLineZStations) {
  const path = Array.from({ length: 13 }, (_, index) => {
    const x = -dryingLineHalfSpan + index / 12 * dryingLineSpan;
    const normalizedX = x / dryingLineHalfSpan;
    const y = dryingLineEndpointY - dryingLineSag * (1 - normalizedX ** 2);
    return point(x, y, z);
  });
  addTubeAlongPolyline(`drying-line-rope:${z}`, "drying-line-lines", "timber-mid", path, dryingLineRadius, 6);
}

addCylinder(
  "drying-line-prop-shaft",
  "drying-line-prop",
  "timber-mid",
  dryingLinePropFoot,
  dryingLinePropTop,
  dryingLinePropRadius,
  8,
);
const dryingLineForkStart = point(
  dryingLinePropFoot[0] + (dryingLinePropTop[0] - dryingLinePropFoot[0]) * 0.955,
  dryingLinePropFoot[1] + (dryingLinePropTop[1] - dryingLinePropFoot[1]) * 0.955,
  0,
);
for (const z of dryingLineZStations) {
  addCylinder(
    `drying-line-prop-fork:${z}`,
    "drying-line-prop",
    "timber-mid",
    dryingLineForkStart,
    point(0, dryingLineEndpointY - dryingLineSag, z),
    0.018,
    7,
  );
}

// Short domestic bean frame: five exact paired stations are planted in a
// filled bed, cross at the common tie line and continue above it to preserve
// the real bound A-frame topology.  The ridge and five opaque cord loops pass
// through those same structural joints.
const beanFramePoleLength = 2.4;
const beanFramePoleRadius = 0.015;
const beanFrameStationPitch = 0.55;
const beanFrameRowSpacing = 0.7;
const beanFrameTieY = 2.1;
const beanFrameRidgeRadius = 0.0175;
const beanFrameStations = [-1.1, -0.55, 0, 0.55, 1.1] as const;
const beanFrameBedSize = point(2.6, 0.2, 1.1);
const beanFrameBaseToTie = Math.hypot(beanFrameTieY, beanFrameRowSpacing / 2);

for (const x of beanFrameStations) {
  for (const rowSign of [-1, 1] as const) {
    const baseZ = rowSign * beanFrameRowSpacing / 2;
    const base = point(x, 0, baseZ);
    const tip = point(
      x,
      beanFrameTieY / beanFrameBaseToTie * beanFramePoleLength,
      baseZ - baseZ / beanFrameBaseToTie * beanFramePoleLength,
    );
    addCylinder(
      `bean-frame-pole:${x}:${rowSign}`,
      "bean-frame-primary",
      "timber-mid",
      base,
      tip,
      beanFramePoleRadius,
      10,
    );
  }
}

addCylinder(
  "bean-frame-ridge",
  "bean-frame-primary",
  "timber-mid",
  point(-1.25, beanFrameTieY, 0),
  point(1.25, beanFrameTieY, 0),
  beanFrameRidgeRadius,
  10,
);

const beanFrameBindingVertices: ObjectPoint[] = [];
const beanFrameBindingTriangles: Array<readonly [number, number, number]> = [];
const beanFrameBindingMajorRadius = 0.022;
const beanFrameBindingTubeRadius = 0.006;
const beanFrameBindingMajorSegments = 12;
const beanFrameBindingTubeSegments = 6;
for (const x of beanFrameStations) {
  const vertexOffset = beanFrameBindingVertices.length;
  for (let majorIndex = 0; majorIndex < beanFrameBindingMajorSegments; majorIndex += 1) {
    const majorAngle = majorIndex / beanFrameBindingMajorSegments * Math.PI * 2;
    for (let tubeIndex = 0; tubeIndex < beanFrameBindingTubeSegments; tubeIndex += 1) {
      const tubeAngle = tubeIndex / beanFrameBindingTubeSegments * Math.PI * 2;
      const radial = beanFrameBindingMajorRadius + Math.cos(tubeAngle) * beanFrameBindingTubeRadius;
      beanFrameBindingVertices.push(point(
        x + Math.sin(tubeAngle) * beanFrameBindingTubeRadius,
        beanFrameTieY + Math.cos(majorAngle) * radial,
        Math.sin(majorAngle) * radial,
      ));
    }
  }
  const vertexAt = (majorIndex: number, tubeIndex: number) => vertexOffset
    + (majorIndex % beanFrameBindingMajorSegments) * beanFrameBindingTubeSegments
    + (tubeIndex % beanFrameBindingTubeSegments);
  for (let majorIndex = 0; majorIndex < beanFrameBindingMajorSegments; majorIndex += 1) {
    for (let tubeIndex = 0; tubeIndex < beanFrameBindingTubeSegments; tubeIndex += 1) {
      beanFrameBindingTriangles.push(
        [vertexAt(majorIndex, tubeIndex), vertexAt(majorIndex + 1, tubeIndex), vertexAt(majorIndex + 1, tubeIndex + 1)],
        [vertexAt(majorIndex, tubeIndex), vertexAt(majorIndex + 1, tubeIndex + 1), vertexAt(majorIndex, tubeIndex + 1)],
      );
    }
  }
}
addMesh(
  "bean-frame-bindings",
  "bean-frame-bindings",
  "timber-dark",
  beanFrameBindingVertices,
  beanFrameBindingTriangles,
);
addBox(
  "bean-frame-soil-bed",
  "bean-frame-bed",
  "soil-bed",
  point(0, beanFrameBedSize[1] / 2, 0),
  beanFrameBedSize,
);

// Wall-side rain barrel. Twelve closed oak stave shells meet without leakage
// gaps around a real hollow interior and separate bottom head. Three forged
// hoops engage the bulged envelope; two bricks carry the barrel at ground.
// The hollow wooden downspout ends over the opening and exposes named future
// wall anchors rather than inventing building geometry in this object study.
const rainBarrelDiameter = 0.62;
const rainBarrelHeight = 0.88;
const rainBarrelBottomY = 0.07;
const rainBarrelTopY = rainBarrelBottomY + rainBarrelHeight;
const rainBarrelEndRadius = 0.28;
const rainBarrelWallThickness = 0.018;
const rainBarrelStaveCount = 12;
const rainBarrelRingY = [rainBarrelBottomY, 0.15, 0.51, 0.87, rainBarrelTopY] as const;
const rainBarrelRingRadius = [rainBarrelEndRadius, 0.292, rainBarrelDiameter / 2, 0.292, rainBarrelEndRadius] as const;
const rainBarrelRadiusAt = (y: number) => {
  for (let index = 1; index < rainBarrelRingY.length; index += 1) {
    if (y > rainBarrelRingY[index]) continue;
    const t = (y - rainBarrelRingY[index - 1]) / (rainBarrelRingY[index] - rainBarrelRingY[index - 1]);
    return rainBarrelRingRadius[index - 1] + (rainBarrelRingRadius[index] - rainBarrelRingRadius[index - 1]) * t;
  }
  return rainBarrelRingRadius[rainBarrelRingRadius.length - 1];
};

for (let staveIndex = 0; staveIndex < rainBarrelStaveCount; staveIndex += 1) {
  const angle0 = staveIndex / rainBarrelStaveCount * Math.PI * 2;
  const angle1 = (staveIndex + 1) / rainBarrelStaveCount * Math.PI * 2;
  const vertices: ObjectPoint[] = [];
  for (let ringIndex = 0; ringIndex < rainBarrelRingY.length; ringIndex += 1) {
    const y = rainBarrelRingY[ringIndex];
    const outerRadius = rainBarrelRingRadius[ringIndex];
    const innerRadius = outerRadius - rainBarrelWallThickness;
    vertices.push(
      point(Math.cos(angle0) * outerRadius, y, Math.sin(angle0) * outerRadius),
      point(Math.cos(angle1) * outerRadius, y, Math.sin(angle1) * outerRadius),
      point(Math.cos(angle0) * innerRadius, y, Math.sin(angle0) * innerRadius),
      point(Math.cos(angle1) * innerRadius, y, Math.sin(angle1) * innerRadius),
    );
  }
  const triangles: Array<readonly [number, number, number]> = [];
  const at = (ringIndex: number, localIndex: number) => ringIndex * 4 + localIndex;
  for (let ringIndex = 0; ringIndex < rainBarrelRingY.length - 1; ringIndex += 1) {
    triangles.push(
      [at(ringIndex, 0), at(ringIndex, 1), at(ringIndex + 1, 1)],
      [at(ringIndex, 0), at(ringIndex + 1, 1), at(ringIndex + 1, 0)],
      [at(ringIndex, 2), at(ringIndex + 1, 3), at(ringIndex, 3)],
      [at(ringIndex, 2), at(ringIndex + 1, 2), at(ringIndex + 1, 3)],
      [at(ringIndex, 0), at(ringIndex + 1, 0), at(ringIndex + 1, 2)],
      [at(ringIndex, 0), at(ringIndex + 1, 2), at(ringIndex, 2)],
      [at(ringIndex, 1), at(ringIndex, 3), at(ringIndex + 1, 3)],
      [at(ringIndex, 1), at(ringIndex + 1, 3), at(ringIndex + 1, 1)],
    );
  }
  const topRing = rainBarrelRingY.length - 1;
  triangles.push(
    [at(0, 0), at(0, 2), at(0, 3)], [at(0, 0), at(0, 3), at(0, 1)],
    [at(topRing, 0), at(topRing, 1), at(topRing, 3)], [at(topRing, 0), at(topRing, 3), at(topRing, 2)],
  );
  addMesh(
    `rain-barrel-stave:${staveIndex}`,
    "rain-barrel-primary",
    "timber-mid",
    vertices,
    triangles,
  );
}

addCylinder(
  "rain-barrel-bottom-head",
  "rain-barrel-primary",
  "timber-mid",
  point(0, rainBarrelBottomY + 0.013, 0),
  point(0, rainBarrelBottomY + 0.035, 0),
  rainBarrelEndRadius - rainBarrelWallThickness / 2,
  rainBarrelStaveCount,
);

const rainBarrelHoopCentres = [0.2, 0.51, 0.82] as const;
const rainBarrelHoopHeight = 0.035;
const rainBarrelHoopThickness = 0.008;
const rainBarrelHoopVertices: ObjectPoint[] = [];
const rainBarrelHoopTriangles: Array<readonly [number, number, number]> = [];
for (const centreY of rainBarrelHoopCentres) {
  const innerRadius = rainBarrelRadiusAt(centreY) - 0.002;
  const outerRadius = innerRadius + rainBarrelHoopThickness;
  const start = rainBarrelHoopVertices.length;
  for (const [y, radius] of [
    [centreY - rainBarrelHoopHeight / 2, innerRadius],
    [centreY - rainBarrelHoopHeight / 2, outerRadius],
    [centreY + rainBarrelHoopHeight / 2, innerRadius],
    [centreY + rainBarrelHoopHeight / 2, outerRadius],
  ] as const) {
    for (let segment = 0; segment < rainBarrelStaveCount; segment += 1) {
      const angle = segment / rainBarrelStaveCount * Math.PI * 2;
      rainBarrelHoopVertices.push(point(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
  }
  const at = (ring: number, segment: number) => start
    + ring * rainBarrelStaveCount
    + segment % rainBarrelStaveCount;
  for (let segment = 0; segment < rainBarrelStaveCount; segment += 1) {
    const next = (segment + 1) % rainBarrelStaveCount;
    rainBarrelHoopTriangles.push(
      [at(0, segment), at(2, next), at(0, next)], [at(0, segment), at(2, segment), at(2, next)],
      [at(1, segment), at(1, next), at(3, next)], [at(1, segment), at(3, next), at(3, segment)],
      [at(0, segment), at(0, next), at(1, next)], [at(0, segment), at(1, next), at(1, segment)],
      [at(2, segment), at(3, next), at(2, next)], [at(2, segment), at(3, segment), at(3, next)],
    );
  }
}
addMesh(
  "rain-barrel-hoops",
  "rain-barrel-hardware",
  "metal",
  rainBarrelHoopVertices,
  rainBarrelHoopTriangles,
);

const rainBarrelBrickSize = point(0.22, rainBarrelBottomY, 0.11);
for (const x of [-0.18, 0.18]) {
  addBox(
    `rain-barrel-brick:${x}`,
    "rain-barrel-support",
    "brick",
    point(x, rainBarrelBrickSize[1] / 2, 0),
    rainBarrelBrickSize,
  );
}

const rainBarrelDownspoutSize = 0.1;
const rainBarrelDownspoutWall = 0.012;
const rainBarrelDownspoutBottomY = rainBarrelTopY + 0.15;
const rainBarrelDownspoutTopY = 2.1;
const rainBarrelDownspoutZ = -0.17;
const downspoutOuter = rainBarrelDownspoutSize / 2;
const downspoutInner = downspoutOuter - rainBarrelDownspoutWall;
const downspoutOuterCorners = [
  [-downspoutOuter, -downspoutOuter], [downspoutOuter, -downspoutOuter],
  [downspoutOuter, downspoutOuter], [-downspoutOuter, downspoutOuter],
] as const;
const downspoutInnerCorners = [
  [-downspoutInner, -downspoutInner], [downspoutInner, -downspoutInner],
  [downspoutInner, downspoutInner], [-downspoutInner, downspoutInner],
] as const;
const downspoutVertices: ObjectPoint[] = [];
for (const y of [rainBarrelDownspoutBottomY, rainBarrelDownspoutTopY]) {
  for (const [x, z] of [...downspoutOuterCorners, ...downspoutInnerCorners]) {
    downspoutVertices.push(point(x, y, rainBarrelDownspoutZ + z));
  }
}
const downspoutTriangles: Array<readonly [number, number, number]> = [];
for (let side = 0; side < 4; side += 1) {
  const next = (side + 1) % 4;
  downspoutTriangles.push(
    [side, next, 8 + next], [side, 8 + next, 8 + side],
    [4 + side, 12 + next, 4 + next], [4 + side, 12 + side, 12 + next],
    [side, 4 + next, next], [side, 4 + side, 4 + next],
    [8 + side, 8 + next, 12 + next], [8 + side, 12 + next, 12 + side],
  );
}
addMesh(
  "rain-barrel-downspout",
  "rain-barrel-downspout",
  "timber-dark",
  downspoutVertices,
  downspoutTriangles,
);

const rainBarrelWallPlaneZ = -0.3;
const rainBarrelBracketVertices: ObjectPoint[] = [];
const rainBarrelBracketTriangles: Array<readonly [number, number, number]> = [];
const appendRainBarrelBracketBox = (center: ObjectPoint, size: ObjectPoint) => {
  const start = rainBarrelBracketVertices.length;
  for (const xSign of [-1, 1]) for (const ySign of [-1, 1]) for (const zSign of [-1, 1]) {
    rainBarrelBracketVertices.push(point(
      center[0] + xSign * size[0] / 2,
      center[1] + ySign * size[1] / 2,
      center[2] + zSign * size[2] / 2,
    ));
  }
  const at = (x: number, y: number, z: number) => start + (x + 1) / 2 * 4 + (y + 1) / 2 * 2 + (z + 1) / 2;
  rainBarrelBracketTriangles.push(
    [at(-1, -1, -1), at(-1, 1, 1), at(-1, 1, -1)], [at(-1, -1, -1), at(-1, -1, 1), at(-1, 1, 1)],
    [at(1, -1, -1), at(1, 1, -1), at(1, 1, 1)], [at(1, -1, -1), at(1, 1, 1), at(1, -1, 1)],
    [at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1)], [at(-1, -1, -1), at(1, -1, 1), at(-1, -1, 1)],
    [at(-1, 1, -1), at(1, 1, 1), at(1, 1, -1)], [at(-1, 1, -1), at(-1, 1, 1), at(1, 1, 1)],
    [at(-1, -1, -1), at(-1, 1, -1), at(1, 1, -1)], [at(-1, -1, -1), at(1, 1, -1), at(1, -1, -1)],
    [at(-1, -1, 1), at(1, -1, 1), at(1, 1, 1)], [at(-1, -1, 1), at(1, 1, 1), at(-1, 1, 1)],
  );
};
for (const y of [1.42, 1.88]) {
  appendRainBarrelBracketBox(
    point(0, y, (rainBarrelDownspoutZ - downspoutOuter + rainBarrelWallPlaneZ) / 2),
    point(0.025, 0.025, rainBarrelDownspoutZ - downspoutOuter - rainBarrelWallPlaneZ + 0.012),
  );
}
addMesh(
  "rain-barrel-wall-brackets",
  "rain-barrel-hardware",
  "metal",
  rainBarrelBracketVertices,
  rainBarrelBracketTriangles,
);

const bridgeGroups = ["bridge-masonry", "bridge-primary", "bridge-deck", "bridge-rails"] as const;
const bridgeLitGroups = [...bridgeGroups, "bridge-lighting"] as const;
const fieldGroups = ["field-earth", "field-crops"] as const;
const wallGroups = ["retaining-masonry"] as const;
const revetmentGroups = ["canal-revetment"] as const;
const pathGroups = ["path-cross-section"] as const;
const willowGroups = ["pollard-willow"] as const;
const fenceGroups = ["polder-fence"] as const;
const hedgeGroups = ["field-hedge"] as const;

const bridgeProfile = [
  [-2.8, 0.78], [-1.9, 0.96], [-0.95, 1.12], [0, 1.18],
  [0.95, 1.12], [1.9, 0.96], [2.8, 0.78],
] as const;

// Two coursed field-stone abutments. Every block bears on the previous course;
// the timber stringers land on cap stones instead of terminating in air.
for (const bank of [-1, 1] as const) {
  const bankZ = bank * 3.18;
  for (let course = 0; course < 3; course += 1) {
    const count = course % 2 === 0 ? 5 : 4;
    const blockWidth = 3.25 / count;
    for (let index = 0; index < count; index += 1) {
      const x = -1.625 + blockWidth * (index + 0.5);
      addBox(
        `bridge-abutment:${bank}:course:${course}:block:${index}`,
        "bridge-masonry",
        "stone",
        point(x, 0.18 + course * 0.36, bankZ),
        point(blockWidth - 0.025, 0.34, 0.86),
      );
    }
  }
  for (const x of [-1.25, -0.42, 0.42, 1.25]) {
    addBox(`bridge-cap:${bank}:${x}`, "bridge-masonry", "stone", point(x, 1.18, bankZ - bank * 0.08), point(0.78, 0.22, 1.04));
  }
}

for (const x of [-0.82, 0.82]) {
  for (let index = 1; index < bridgeProfile.length; index += 1) {
    const [z0, y0] = bridgeProfile[index - 1];
    const [z1, y1] = bridgeProfile[index];
    addBeam(`bridge-stringer:${x}:${index - 1}`, "bridge-primary", "timber-dark", point(x, y0 - 0.2, z0), point(x, y1 - 0.2, z1), 0.24, 0.28);
  }
}
for (let index = 0; index < 15; index += 1) {
  const z = -2.8 + index * 0.4;
  const segment = bridgeProfile.findIndex(([profileZ]) => profileZ >= z);
  const hi = Math.max(1, segment);
  const [z0, y0] = bridgeProfile[hi - 1];
  const [z1, y1] = bridgeProfile[hi];
  const t = Math.max(0, Math.min(1, (z - z0) / (z1 - z0)));
  const y = y0 + (y1 - y0) * t;
  const pitch = -Math.atan2(y1 - y0, z1 - z0);
  addBox(`bridge-deck:${index}`, "bridge-deck", "timber-mid", point(0, y, z), point(2.52, 0.12, 0.43), point(pitch, 0, 0));
}
for (const side of [-1, 1] as const) {
  const x = side * 1.22;
  for (const [index, [z, y]] of bridgeProfile.entries()) {
    addBeam(`bridge-post:${side}:${index}`, "bridge-rails", "timber-dark", point(x, y + 0.03, z), point(x, y + 1.02, z), 0.13, 0.13);
    if (index > 0) {
      const [previousZ, previousY] = bridgeProfile[index - 1];
      addBeam(`bridge-handrail:${side}:${index - 1}`, "bridge-rails", "timber-mid", point(x, previousY + 1.02, previousZ), point(x, y + 1.02, z), 0.13, 0.15);
      addBeam(`bridge-midrail:${side}:${index - 1}`, "bridge-rails", "timber-mid", point(x, previousY + 0.54, previousZ), point(x, y + 0.54, z), 0.085, 0.085);
    }
  }
}

for (const side of [-1, 1] as const) {
  parts.push(...dutchLampFixture({
    id: `bridge-lantern:${side}`,
    group: "bridge-lighting",
    lens: point(side * 1.52, 1.94, 0),
    carrierPoint: point(side * 1.22, 2.04, 0),
    carrier: "wall-x",
    outward: side,
    lampClass: "exterior",
    poolGroupId: "dutch-polder:bridge",
    priority: side === -1 ? 2.3 : 1.9,
  }));
}

// Six-metre flower-bed module: raised ridges, individual stems and blossoms.
for (const x of [-1.65, -0.55, 0.55, 1.65]) {
  addBox(`field-ridge:${x}`, "field-earth", "soil-bed", point(x, 0.22, 0), point(0.82, 0.44, 6));
  for (let row = 0; row < 13; row += 1) {
    const z = -2.76 + row * 0.46;
    addBeam(`field-stem:${x}:${row}`, "field-crops", "foliage", point(x, 0.42, z), point(x, 0.78 + (row % 3) * 0.035, z), 0.045, 0.045);
    const flowerMaterial: ObjectMaterialId = x < -1 ? "flower-red" : x < 0 ? "flower-yellow" : x < 1 ? "flower-purple" : "flower-blue";
    addBox(`field-flower:${x}:${row}`, "field-crops", flowerMaterial, point(x, 0.82 + (row % 3) * 0.035, z), point(0.18, 0.14, 0.18), point(0, row * 0.71, 0));
  }
}

// Alternating bond and cap stones make the retaining wall a constructible
// module rather than a single masonry-coloured slab.
for (let course = 0; course < 4; course += 1) {
  const count = course % 2 === 0 ? 6 : 5;
  const width = 5 / count;
  for (let index = 0; index < count; index += 1) {
    addBox(`wall-course:${course}:block:${index}`, "retaining-masonry", "stone", point(-2.5 + width * (index + 0.5), 0.17 + course * 0.34, 0), point(width - 0.028, 0.32, 0.54));
  }
}
for (let index = 0; index < 5; index += 1) addBox(`wall-cap:${index}`, "retaining-masonry", "stone", point(-2 + index, 1.47, 0), point(0.96, 0.22, 0.7));

// Timber sheet piles are tied by walers and landward anchors; the water itself
// is not treated as structural support.
for (let index = 0; index < 13; index += 1) {
  const x = -3 + index * 0.5;
  addBox(`revetment-sheet:${index}`, "canal-revetment", "timber-mid", point(x, 0.04, 0), point(0.48, 1.75, 0.18));
  if (index % 3 === 0) {
    addBeam(`revetment-post:${index}`, "canal-revetment", "timber-dark", point(x, -0.78, 0.12), point(x, 1.2, 0.12), 0.18, 0.18);
    addBeam(`revetment-anchor:${index}`, "canal-revetment", "timber-dark", point(x, 0.58, 0.1), point(x, 0.18, 1.25), 0.13, 0.13);
  }
}
for (const y of [-0.2, 0.66]) addBeam(`revetment-waler:${y}`, "canal-revetment", "timber-dark", point(-3.2, y, -0.14), point(3.2, y, -0.14), 0.16, 0.18);

addBox("path-subbase", "path-cross-section", "earth", point(0, 0.1, 0), point(2.5, 0.2, 6));
addBox("path-shell", "path-cross-section", "shell-path", point(0, 0.25, 0), point(2.2, 0.1, 6));
for (const side of [-1, 1] as const) addBox(`path-shoulder:${side}`, "path-cross-section", "grass", point(side * 1.36, 0.08, 0), point(0.52, 0.16, 6));

// Pollard willow: one old trunk and a deliberately visible crown of cut-back
// branches.  It remains a small reusable object, not a procedural tree blob.
addCylinder("willow-trunk", "pollard-willow", "timber-dark", point(0, 0, 0), point(0, 3.15, 0), 0.34, 12);
for (const [index, [x, y, z]] of [
  [-1.15, 4.15, -0.45], [1.2, 4.05, -0.3], [-0.75, 4.35, 0.85],
  [0.8, 4.28, 0.9], [0.05, 4.55, 0.12],
].entries()) {
  addCylinder(`willow-branch:${index}`, "pollard-willow", "timber-mid", point(0, 2.55, 0), point(x, y, z), 0.13, 9);
  addOrganicCrown(`willow-crown:${index}`, "pollard-willow", point(x, y + 0.12, z), point(1.65, 1.32, 1.45), index * 0.63);
}

// Six-metre field fence: four driven posts and two continuous rails.  Gates
// can later replace one bay without redrawing the rest of the boundary.
for (const x of [-3, -1, 1, 3]) {
  addCylinder(`fence-post:${x}`, "polder-fence", "timber-dark", point(x, 0, 0), point(x, 1.35, 0), 0.105, 8);
}
for (const y of [0.48, 1.03]) addBeam(`fence-rail:${y}`, "polder-fence", "timber-mid", point(-3, y, 0), point(3, y, 0), 0.095, 0.085);

// Hedgerow has a physical woody line beneath overlapping foliage crowns.  The
// overlap is biological continuity; the stems are still the load path.
for (let index = 0; index < 7; index += 1) {
  const x = -3 + index;
  addCylinder(`hedge-stem:${index}`, "field-hedge", "timber-mid", point(x, 0, 0), point(x, 1.18, 0), 0.07, 7);
  addOrganicCrown(`hedge-crown:${index}`, "field-hedge", point(x, 1.02 + (index % 2) * 0.08, 0), point(1.28, 1.5, 1.18), index * 0.47);
}

const allGroups = [
  ...schouwGroups, ...mooringPostGroups, ...jettyGroups, ...picketFenceGroups, ...peatStoreGroups, ...privyGroups, ...handPumpGroups, ...dryingLineGroups, ...beanFrameGroups, ...rainBarrelGroups,
  ...bridgeLitGroups, ...fieldGroups, ...wallGroups, ...revetmentGroups,
  ...pathGroups, ...willowGroups, ...fenceGroups, ...hedgeGroups,
];
const hiddenExcept = (visible: readonly string[]) => allGroups.filter((group) => !visible.includes(group));

export const DUTCH_PATH_WIDTH = 2.2;
export const DUTCH_PATH_SUBBASE_WIDTH = 2.5;
export const DUTCH_BRIDGE_CLEAR_SPAN = 4.2;
export const DUTCH_BRIDGE_DECK_WIDTH = 2.52;
export const DUTCH_SCHOUW_LENGTH = 4.6;
export const DUTCH_SCHOUW_BEAM = 1.45;
export const DUTCH_SCHOUW_LIGHT_DRAUGHT = 0.15;
export const DUTCH_MOORING_POST_SPACING = 3.2;
export const DUTCH_MOORING_POST_WATERLINE_Y = 0.85;
export const DUTCH_MOORING_RING_HEIGHT_ABOVE_WATER = 0.55;
export const DUTCH_JETTY_LENGTH = 2.4;
export const DUTCH_JETTY_WIDTH = 1.1;
export const DUTCH_JETTY_WATERLINE_Y = 0.33;
export const DUTCH_JETTY_DECK_TOP_Y = 0.63;
export const DUTCH_PICKET_FENCE_MODULE_LENGTH = 3;
export const DUTCH_PICKET_FENCE_PICKET_WIDTH = 0.075;
export const DUTCH_PICKET_FENCE_PICKET_PITCH = 0.14;
export const DUTCH_PICKET_FENCE_PICKET_GAP = 0.065;
export const DUTCH_PICKET_GATE_WIDTH = 0.95;
export const DUTCH_PICKET_GATE_HEIGHT = 0.9;
export const DUTCH_PEAT_STORE_WIDTH = peatStoreWidth;
export const DUTCH_PEAT_STORE_DEPTH = peatStoreDepth;
export const DUTCH_PEAT_STORE_FRONT_POST_HEIGHT = peatStoreFrontPostHeight;
export const DUTCH_PEAT_STORE_REAR_POST_HEIGHT = peatStoreRearPostHeight;
export const DUTCH_PEAT_STORE_ROOF_PITCH = peatStoreRoofPitch;
export const DUTCH_PEAT_STACK_LENGTH = peatStackLength;
export const DUTCH_PEAT_STACK_HEIGHT = peatStackHeight;
export const DUTCH_PEAT_BRICK_GAP = 0.04;
export const DUTCH_PEAT_BRICK_YAW = peatBrickYaw;
export const DUTCH_PRIVY_WIDTH = privyWidth;
export const DUTCH_PRIVY_DEPTH = privyDepth;
export const DUTCH_PRIVY_FRONT_EAVE = privyFrontEave;
export const DUTCH_PRIVY_REAR_EAVE = privyRearEave;
export const DUTCH_PRIVY_ROOF_PITCH = privyRoofPitch;
export const DUTCH_PRIVY_BANK_EDGE_Z = privyBankEdgeZ;
export const DUTCH_PRIVY_CANTILEVER_PROJECTION = privyBankEdgeZ - privyCantileverRearZ;
export const DUTCH_PRIVY_DOOR_WIDTH = 0.62;
export const DUTCH_PRIVY_DOOR_HEIGHT = 1.75;
export const DUTCH_PRIVY_HEART_SIZE = privyHeartSize;
export const DUTCH_PRIVY_HEART_CENTER_Y = privyHeartCenterY;
export const DUTCH_HAND_PUMP_COLUMN_HEIGHT = handPumpColumnHeight;
export const DUTCH_HAND_PUMP_COLUMN_DIAMETER = handPumpBarrelRadius * 2;
export const DUTCH_HAND_PUMP_SPOUT_Y = handPumpSpoutY;
export const DUTCH_HAND_PUMP_SPOUT_PROJECTION = handPumpSpoutProjection;
export const DUTCH_HAND_PUMP_LEVER_LENGTH = handPumpLeverLength;
export const DUTCH_HAND_PUMP_PIVOT_DIAMETER = handPumpPivotDiameter;
export const DUTCH_HAND_PUMP_STONE_SIZE = handPumpStoneSize;
export const DUTCH_HAND_PUMP_STONE_HEIGHT = handPumpStoneHeight;
export const DUTCH_HAND_PUMP_BUCKET_DIAMETER = handPumpBucketDiameter;
export const DUTCH_HAND_PUMP_BUCKET_HEIGHT = handPumpBucketHeight;
export const DUTCH_DRYING_LINE_SPAN = dryingLineSpan;
export const DUTCH_DRYING_LINE_POST_SECTION = dryingLinePostSection;
export const DUTCH_DRYING_LINE_POST_HEIGHT = dryingLinePostHeight;
export const DUTCH_DRYING_LINE_CROSSBAR_LENGTH = dryingLineCrossbarLength;
export const DUTCH_DRYING_LINE_DIAMETER = dryingLineRadius * 2;
export const DUTCH_DRYING_LINE_SAG = dryingLineSag;
export const DUTCH_DRYING_LINE_PROP_LENGTH = dryingLinePropLength;
export const DUTCH_BEAN_FRAME_POLE_LENGTH = beanFramePoleLength;
export const DUTCH_BEAN_FRAME_POLE_DIAMETER = beanFramePoleRadius * 2;
export const DUTCH_BEAN_FRAME_STATION_PITCH = beanFrameStationPitch;
export const DUTCH_BEAN_FRAME_ROW_SPACING = beanFrameRowSpacing;
export const DUTCH_BEAN_FRAME_TIE_Y = beanFrameTieY;
export const DUTCH_BEAN_FRAME_RIDGE_DIAMETER = beanFrameRidgeRadius * 2;
export const DUTCH_BEAN_FRAME_BED_HEIGHT = beanFrameBedSize[1];
export const DUTCH_RAIN_BARREL_DIAMETER = rainBarrelDiameter;
export const DUTCH_RAIN_BARREL_HEIGHT = rainBarrelHeight;
export const DUTCH_RAIN_BARREL_STAVE_COUNT = rainBarrelStaveCount;
export const DUTCH_RAIN_BARREL_HOOP_COUNT = rainBarrelHoopCentres.length;
export const DUTCH_RAIN_BARREL_BRICK_HEIGHT = rainBarrelBrickSize[1];
export const DUTCH_RAIN_BARREL_DOWNSPOUT_SIZE = rainBarrelDownspoutSize;
export const DUTCH_RAIN_BARREL_OUTLET_CLEARANCE = rainBarrelDownspoutBottomY - rainBarrelTopY;

export const dutchLandscapeKitObject: DutchLandscapeKitLabModel = {
  id: "dutch-landscape-kit",
  revision: "landscape-kit-a17-2026-08-04",
  title: "Dutch polder landscape kit — water, yard, bridge, beds, banks and field edges",
  units: "metres",
  coordinates: { up: "+Y", front: "+Z", origin: "ground-centre" },
  materialOverrides: {
    cladding: { color: 0x315c46, roughness: 0.9 },
  },
  sourceNotes: [
    "RCE monument descriptions establish the bridge hierarchy used here: timber deck on beams and posts, masonry or piled bank bearings, timber rails, and iron only at joints when required.",
    "The Zaanse landscape source owns the ensemble of wooden buildings, paths, fences, canals and flowerbeds; it does not supply dimensions, so gameplay-safe widths are authored and labelled.",
    "The Openluchtmuseum garden record supports distinct working beds rather than one painted flower carpet. Ridges, stems and blossoms remain separate layers.",
    "SSRP's Open Schouw type description establishes the shallow flat box, mildly curved longitudinal line and outward-falling sides; the 4.60 by 1.45 metre envelope, seven authored stations and board schedule come from the yard-kit evidence card.",
    "The accepted multi-angle studies own visible character only. Canonical hull panels, end rake, pile ring datum and notched stair support derive from the evidence card and measurable invariants.",
    "Private landing stages remain railing-free, drain between seven longitudinal boards, and place their deck 0.30 metre above the local waterline.",
    "The official Zeilenmakerspad 3 record places green fences along the ditch around path-side bleaching fields; the yard-kit passport owns the exact three-metre domestic module, picket pitch and gate dimensions.",
    "The RCE Kolhorn photographs establish the dark North-Holland timber peat-store family, while the published Turfschuur record establishes slatted ventilation; the yard-kit passport owns this smaller open-front lean-to, its exact post heights and fuel-stack schedule.",
    "North-Holland heritage and museum records establish the tarred timber privy over a ditch, its mono-pitch roof, light opening and raised transverse seat; the yard-kit passport owns the exact cabin, cantilever, door and heart-cutout dimensions modelled here.",
    "A period Becking & Bongers catalogue establishes the slender tapered private cast-iron pump, top cross-pivot, long rear lever and opposed side spout; the Noord-Beveland record supports its square stone plate, and the Utrecht archaeological buckets support a real open oak-stave vessel with iron hoops and bail. The yard-kit passport owns all exact pump and bucket dimensions.",
    "Nederlands Openluchtmuseum farm photographs establish the rough timber waslijnpaal, physically secured line and long working-yard span; institutional laundry history establishes the Y-prop used against sag. The yard-kit passport owns the exact two-post, two-line and prop dimensions modelled here.",
    "Wageningen's 1957 bean-cultivation bulletin establishes the Dutch double-row inclined-pole frame tied to a horizontal ridge; a Geldermalsen 1939 farm photograph establishes period yard use, and RHS guidance supports hazel poles and paired top bindings. The yard-kit passport owns the exact ten-pole, five-station and soil-bed dimensions modelled here.",
    "Nederlands Openluchtmuseum farm photographs from Kethel and Schiebroek establish the wall-side staved rain barrel, repeated iron hoops and downspout relationship. The yard-kit passport owns the exact twelve staves, three hoops, barrel envelope, square wooden downspout and two-brick support modelled here.",
  ],
  dimensions: {
    schouwLength: DUTCH_SCHOUW_LENGTH,
    schouwBeam: DUTCH_SCHOUW_BEAM,
    schouwLightDraught: DUTCH_SCHOUW_LIGHT_DRAUGHT,
    mooringPostSpacing: DUTCH_MOORING_POST_SPACING,
    mooringPostOverallLength: 1.6,
    mooringPostWaterlineY: DUTCH_MOORING_POST_WATERLINE_Y,
    mooringRingHeightAboveWater: DUTCH_MOORING_RING_HEIGHT_ABOVE_WATER,
    jettyLength: DUTCH_JETTY_LENGTH,
    jettyWidth: DUTCH_JETTY_WIDTH,
    jettyWaterlineY: DUTCH_JETTY_WATERLINE_Y,
    jettyDeckTopY: DUTCH_JETTY_DECK_TOP_Y,
    picketFenceModuleLength: DUTCH_PICKET_FENCE_MODULE_LENGTH,
    picketFencePicketWidth: DUTCH_PICKET_FENCE_PICKET_WIDTH,
    picketFencePicketPitch: DUTCH_PICKET_FENCE_PICKET_PITCH,
    picketFencePicketGap: DUTCH_PICKET_FENCE_PICKET_GAP,
    picketGateWidth: DUTCH_PICKET_GATE_WIDTH,
    picketGateHeight: DUTCH_PICKET_GATE_HEIGHT,
    peatStoreWidth: DUTCH_PEAT_STORE_WIDTH,
    peatStoreDepth: DUTCH_PEAT_STORE_DEPTH,
    peatStoreFrontPostHeight: DUTCH_PEAT_STORE_FRONT_POST_HEIGHT,
    peatStoreRearPostHeight: DUTCH_PEAT_STORE_REAR_POST_HEIGHT,
    peatStoreRoofPitchDegrees: DUTCH_PEAT_STORE_ROOF_PITCH * 180 / Math.PI,
    peatStackLength: DUTCH_PEAT_STACK_LENGTH,
    peatStackHeight: DUTCH_PEAT_STACK_HEIGHT,
    peatBrickGap: DUTCH_PEAT_BRICK_GAP,
    peatBrickYawDegrees: DUTCH_PEAT_BRICK_YAW * 180 / Math.PI,
    privyWidth: DUTCH_PRIVY_WIDTH,
    privyDepth: DUTCH_PRIVY_DEPTH,
    privyFrontEave: DUTCH_PRIVY_FRONT_EAVE,
    privyRearEave: DUTCH_PRIVY_REAR_EAVE,
    privyRoofPitchDegrees: DUTCH_PRIVY_ROOF_PITCH * 180 / Math.PI,
    privyCantileverProjection: DUTCH_PRIVY_CANTILEVER_PROJECTION,
    privyDoorWidth: DUTCH_PRIVY_DOOR_WIDTH,
    privyDoorHeight: DUTCH_PRIVY_DOOR_HEIGHT,
    privyHeartSize: DUTCH_PRIVY_HEART_SIZE,
    privyHeartCenterY: DUTCH_PRIVY_HEART_CENTER_Y,
    handPumpColumnHeight: DUTCH_HAND_PUMP_COLUMN_HEIGHT,
    handPumpColumnDiameter: DUTCH_HAND_PUMP_COLUMN_DIAMETER,
    handPumpSpoutY: DUTCH_HAND_PUMP_SPOUT_Y,
    handPumpSpoutProjection: DUTCH_HAND_PUMP_SPOUT_PROJECTION,
    handPumpLeverLength: DUTCH_HAND_PUMP_LEVER_LENGTH,
    handPumpPivotDiameter: DUTCH_HAND_PUMP_PIVOT_DIAMETER,
    handPumpStoneSize: DUTCH_HAND_PUMP_STONE_SIZE,
    handPumpStoneHeight: DUTCH_HAND_PUMP_STONE_HEIGHT,
    handPumpBucketDiameter: DUTCH_HAND_PUMP_BUCKET_DIAMETER,
    handPumpBucketHeight: DUTCH_HAND_PUMP_BUCKET_HEIGHT,
    dryingLineSpan: DUTCH_DRYING_LINE_SPAN,
    dryingLinePostSection: DUTCH_DRYING_LINE_POST_SECTION,
    dryingLinePostHeight: DUTCH_DRYING_LINE_POST_HEIGHT,
    dryingLineCrossbarLength: DUTCH_DRYING_LINE_CROSSBAR_LENGTH,
    dryingLineDiameter: DUTCH_DRYING_LINE_DIAMETER,
    dryingLineSag: DUTCH_DRYING_LINE_SAG,
    dryingLinePropLength: DUTCH_DRYING_LINE_PROP_LENGTH,
    beanFramePoleLength: DUTCH_BEAN_FRAME_POLE_LENGTH,
    beanFramePoleDiameter: DUTCH_BEAN_FRAME_POLE_DIAMETER,
    beanFrameStationPitch: DUTCH_BEAN_FRAME_STATION_PITCH,
    beanFrameRowSpacing: DUTCH_BEAN_FRAME_ROW_SPACING,
    beanFrameTieHeight: DUTCH_BEAN_FRAME_TIE_Y,
    beanFrameRidgeDiameter: DUTCH_BEAN_FRAME_RIDGE_DIAMETER,
    beanFrameBedHeight: DUTCH_BEAN_FRAME_BED_HEIGHT,
    rainBarrelDiameter: DUTCH_RAIN_BARREL_DIAMETER,
    rainBarrelHeight: DUTCH_RAIN_BARREL_HEIGHT,
    rainBarrelStaveCount: DUTCH_RAIN_BARREL_STAVE_COUNT,
    rainBarrelHoopCount: DUTCH_RAIN_BARREL_HOOP_COUNT,
    rainBarrelBrickHeight: DUTCH_RAIN_BARREL_BRICK_HEIGHT,
    rainBarrelDownspoutSize: DUTCH_RAIN_BARREL_DOWNSPOUT_SIZE,
    rainBarrelOutletClearance: DUTCH_RAIN_BARREL_OUTLET_CLEARANCE,
    bridgeClearSpan: DUTCH_BRIDGE_CLEAR_SPAN,
    bridgeDeckWidth: DUTCH_BRIDGE_DECK_WIDTH,
    bridgeRise: 0.4,
    pathFinishedWidth: DUTCH_PATH_WIDTH,
    pathSubbaseWidth: DUTCH_PATH_SUBBASE_WIDTH,
    retainingWallModuleLength: 5,
    flowerBedModuleLength: 6,
    revetmentModuleLength: 6.4,
    fenceModuleLength: 6,
    hedgeModuleLength: 6,
    pollardWillowHeight: 5.1,
  },
  labMetrics: [
    { label: "SCHOUW L × B", value: DUTCH_SCHOUW_LENGTH, decimals: 2, unit: "m length" },
    { label: "JETTY TOP", value: DUTCH_JETTY_DECK_TOP_Y - DUTCH_JETTY_WATERLINE_Y, decimals: 2, signed: true },
    { label: "BRIDGE CLEAR", value: DUTCH_BRIDGE_CLEAR_SPAN, decimals: 1 },
    { label: "DECK WIDTH", value: DUTCH_BRIDGE_DECK_WIDTH, decimals: 2 },
    { label: "PATH WIDTH", value: DUTCH_PATH_WIDTH, decimals: 1 },
    { label: "HEKJE MODULE", value: DUTCH_PICKET_FENCE_MODULE_LENGTH, decimals: 2 },
    { label: "PEAT STACK", value: DUTCH_PEAT_STACK_LENGTH, decimals: 2, unit: "m length" },
    { label: "HUISJE PLAN", value: DUTCH_PRIVY_WIDTH, decimals: 2, unit: "m wide" },
    { label: "HUISJE CANT.", value: DUTCH_PRIVY_CANTILEVER_PROJECTION, decimals: 2, unit: "m beyond bank" },
    { label: "HANDPOMP", value: DUTCH_HAND_PUMP_COLUMN_HEIGHT, decimals: 2, unit: "m column" },
    { label: "DROOGLIJN", value: DUTCH_DRYING_LINE_SPAN, decimals: 2, unit: "m span" },
    { label: "BONENREK", value: DUTCH_BEAN_FRAME_POLE_LENGTH, decimals: 2, unit: "m pole" },
    { label: "REGENTON", value: DUTCH_RAIN_BARREL_HEIGHT, decimals: 2, unit: "m barrel" },
    { label: "WALL MODULE", value: 5, decimals: 1 },
  ],
  anchors: {
    schouwWaterline: point(0, 0, 0),
    schouwBottom: point(0, -DUTCH_SCHOUW_LIGHT_DRAUGHT, 0),
    schouwBow: point(0, 0.195, DUTCH_SCHOUW_LENGTH / 2),
    schouwStern: point(0, 0.195, -DUTCH_SCHOUW_LENGTH / 2),
    mooringPostWaterline: point(0, DUTCH_MOORING_POST_WATERLINE_Y, 0),
    jettyWaterline: point(0, DUTCH_JETTY_WATERLINE_Y, 0),
    jettyDeckTop: point(0, DUTCH_JETTY_DECK_TOP_Y, 0),
    picketFenceModuleLeft: point(picketModuleLeft, 0, 0),
    picketFenceModuleRight: point(picketModuleRight, 0, 0),
    picketGateHinge: point(gateMinX, 0.5, 0.09),
    picketGateLatch: point(gateMaxX, 0.61, 0.09),
    peatStoreGround: point(0, 0, 0),
    peatStoreFrontPlate: point(0, peatStoreFrontPostHeight, peatStorePostZ),
    peatStoreRearPlate: point(0, peatStoreRearPostHeight, -peatStorePostZ),
    peatStackTop: point(0, peatStackHeight, 0.03),
    privyBankEdge: point(0, 0, DUTCH_PRIVY_BANK_EDGE_Z),
    privyWaterSideEnd: point(0, 0, privyCantileverRearZ),
    privyFrontEave: point(0, DUTCH_PRIVY_FRONT_EAVE, privyHalfDepth),
    privyRearEave: point(0, DUTCH_PRIVY_REAR_EAVE, -privyHalfDepth),
    privyHeartCenter: point(0, DUTCH_PRIVY_HEART_CENTER_Y, 0.651),
    handPumpGround: point(0, 0, 0),
    handPumpSpoutOutlet: point(0, 0.73, handPumpNozzleZ),
    handPumpPivot: point(0, handPumpPivotY, 0),
    handPumpBucketCentre: point(0, handPumpBucketHeight / 2, handPumpBucketZ),
    dryingLineLeftPostGround: point(-dryingLineHalfSpan, 0, 0),
    dryingLineRightPostGround: point(dryingLineHalfSpan, 0, 0),
    dryingLineMidSupport: point(0, dryingLineEndpointY - dryingLineSag, 0),
    dryingLinePropGround: point(dryingLinePropFoot[0], 0, 0),
    beanFrameBedGround: point(0, 0, 0),
    beanFrameCentralTie: point(0, DUTCH_BEAN_FRAME_TIE_Y, 0),
    beanFrameRidgeLeft: point(-1.25, DUTCH_BEAN_FRAME_TIE_Y, 0),
    beanFrameRidgeRight: point(1.25, DUTCH_BEAN_FRAME_TIE_Y, 0),
    rainBarrelGround: point(0, 0, 0),
    rainBarrelBottom: point(0, rainBarrelBottomY, 0),
    rainBarrelOutlet: point(0, rainBarrelDownspoutBottomY, rainBarrelDownspoutZ),
    rainBarrelWallBracketLower: point(0, 1.42, rainBarrelWallPlaneZ),
    rainBarrelWallBracketUpper: point(0, 1.88, rainBarrelWallPlaneZ),
    bridgeCentre: point(0, 1.18, 0),
    bridgeNorthBearing: point(0, 1.18, -3.18),
    bridgeSouthBearing: point(0, 1.18, 3.18),
    pathCentre: point(0, 0.3, 0),
  },
  motionConstraints: { staticKit: true, windSimulation: false, waterSimulation: false },
  parts,
  views: [
    { id: "schouw-front", label: "Schouw · flat bottom and raked bow board", projection: "orthographic", position: point(0, 1.05, 7), target: point(0, 0.08, 0), orthoHeight: 2.3, hiddenGroups: hiddenExcept(schouwGroups) },
    { id: "schouw-profile", label: "Schouw · 4.60 m shallow-water profile", projection: "orthographic", position: point(7, 0.15, 0), target: point(0, 0.15, 0), orthoHeight: 5.25, hiddenGroups: hiddenExcept(schouwGroups) },
    { id: "schouw-three-quarter", label: "Schouw · frames, benches and paired oars", projection: "perspective", position: point(5.6, 3.2, 6.4), target: point(0, 0.02, 0), fov: 32, hiddenGroups: hiddenExcept(schouwGroups) },
    { id: "schouw-high", label: "Schouw · flat floor and working interior", projection: "perspective", position: point(-5.4, 4.6, -6.2), target: point(0, -0.02, 0), fov: 32, hiddenGroups: hiddenExcept(schouwGroups) },
    { id: "mooring-posts-front", label: "Meerpalen · two piles at 3.20 m centres", projection: "orthographic", position: point(0, 1.15, 7), target: point(0, 0.78, 0), orthoHeight: 4.1, hiddenGroups: hiddenExcept(mooringPostGroups) },
    { id: "mooring-posts-profile", label: "Meerpalen · circular oak shafts and rings", projection: "orthographic", position: point(6, 0.8, 0), target: point(0, 0.8, 0), orthoHeight: 2.25, hiddenGroups: hiddenExcept(mooringPostGroups) },
    { id: "mooring-posts-three-quarter", label: "Meerpalen · tarred oak and forged fittings", projection: "perspective", position: point(5.2, 3.1, 6), target: point(0, 0.75, 0), fov: 31, hiddenGroups: hiddenExcept(mooringPostGroups) },
    { id: "mooring-posts-cap-ring", label: "Meerpalen · four-faced cap and forged ring", projection: "perspective", position: point(3.4, 2.55, 3.5), target: point(1.25, 1.02, 0), fov: 26, hiddenGroups: hiddenExcept(mooringPostGroups) },
    { id: "jetty-front", label: "Private steiger · two water steps and no rail", projection: "orthographic", position: point(0, 1.35, 5), target: point(0, 0.42, 0.3), orthoHeight: 2.3, hiddenGroups: hiddenExcept(jettyGroups) },
    { id: "jetty-profile", label: "Private steiger · deck 0.30 m above water", projection: "orthographic", position: point(5, 0.45, 0.2), target: point(0, 0.45, 0.2), orthoHeight: 3.45, hiddenGroups: hiddenExcept(jettyGroups) },
    { id: "jetty-three-quarter", label: "Private steiger · four piles, bearers and steps", projection: "perspective", position: point(4.2, 3.1, 5.2), target: point(0, 0.35, 0.25), fov: 32, hiddenGroups: hiddenExcept(jettyGroups) },
    { id: "jetty-high", label: "Private steiger · seven drained deck boards", projection: "perspective", position: point(-4.2, 4.2, -4.6), target: point(0, 0.35, 0), fov: 31, hiddenGroups: hiddenExcept(jettyGroups) },
    { id: "picket-fence-front", label: "Hekje · exact three-metre module and 0.95 m gate", projection: "orthographic", position: point(0, 1.3, 7), target: point(0, 0.5, 0), orthoHeight: 4.8, hiddenGroups: hiddenExcept(picketFenceGroups) },
    { id: "picket-fence-three-quarter", label: "Hekje · green pickets, white gate and grounded posts", projection: "perspective", position: point(5.4, 2.8, 6.2), target: point(0, 0.48, 0), fov: 30, hiddenGroups: hiddenExcept(picketFenceGroups) },
    { id: "picket-fence-gate-detail", label: "Hekje · shared hinge post, straps, brace and latch", projection: "perspective", position: point(4.2, 2.25, 4.7), target: point(1.48, 0.54, 0.02), fov: 25, hiddenGroups: hiddenExcept(picketFenceGroups) },
    { id: "peat-store-front", label: "Turfhok · open front and ventilated peat stack", projection: "orthographic", position: point(0, 1.25, 6), target: point(0, 1.05, 0), orthoHeight: 3.4, hiddenGroups: hiddenExcept(peatStoreGroups) },
    { id: "peat-store-profile", label: "Turfhok · rearward roof fall from unequal posts", projection: "orthographic", position: point(5, 1.25, 0), target: point(0, 1.05, 0), orthoHeight: 3.35, hiddenGroups: hiddenExcept(peatStoreGroups) },
    { id: "peat-store-three-quarter", label: "Turfhok · four-post frame, slatted back and dry fuel", projection: "perspective", position: point(4.4, 3.25, 5.2), target: point(0, 1.0, 0), fov: 31, hiddenGroups: hiddenExcept(peatStoreGroups) },
    { id: "peat-store-stack-detail", label: "Turfhok · three explicit chevron courses with 40 mm air gaps", projection: "perspective", position: point(3.4, 3.25, 4.2), target: point(0, 1.3, 0), fov: 25, hiddenGroups: hiddenExcept(peatStoreGroups) },
    { id: "privy-front", label: "Huisje · exact door and open heart cutout", projection: "orthographic", position: point(0, 1.15, 5), target: point(0, 1.05, 0), orthoHeight: 2.75, hiddenGroups: hiddenExcept(privyGroups) },
    { id: "privy-profile", label: "Huisje · 1.10 m cantilever beyond bank and rearward roof fall", projection: "orthographic", position: point(4.5, 1.15, 0), target: point(0, 1, 0), orthoHeight: 2.8, hiddenGroups: hiddenExcept(privyGroups) },
    { id: "privy-three-quarter", label: "Huisje · grounded beams, framed door and water-side opening", projection: "perspective", position: point(3.6, 2.8, 4.2), target: point(0, 1, 0), fov: 30, hiddenGroups: hiddenExcept(privyGroups) },
    { id: "privy-rear-water", label: "Huisje · open rear, raised seat and clear direct drop", projection: "perspective", position: point(-3.4, 2.6, -4), target: point(0, 0.95, -0.2), fov: 30, hiddenGroups: hiddenExcept(privyGroups) },
    { id: "privy-door-detail", label: "Huisje · real 120 mm heart void and attached ironwork", projection: "perspective", position: point(1.75, 2.05, 3), target: point(0, 1.35, 0.58), fov: 24, hiddenGroups: hiddenExcept(privyGroups) },
    { id: "hand-pump-front", label: "Handpomp · tapered iron column, spout and receiving bucket", projection: "orthographic", position: point(0, 0.9, 4), target: point(0, 0.68, 0.16), orthoHeight: 1.75, hiddenGroups: hiddenExcept(handPumpGroups) },
    { id: "hand-pump-profile", label: "Handpomp · 0.22 m spout projection and rear lever", projection: "orthographic", position: point(4, 0.9, 0), target: point(0, 0.65, 0), orthoHeight: 1.7, hiddenGroups: hiddenExcept(handPumpGroups) },
    { id: "hand-pump-three-quarter", label: "Handpomp · stone footing, working head and oak bucket", projection: "perspective", position: point(2.5, 1.8, 3.2), target: point(0, 0.65, 0.1), fov: 28, hiddenGroups: hiddenExcept(handPumpGroups) },
    { id: "hand-pump-bucket-detail", label: "Handpomp · open stave bucket", projection: "perspective", position: point(1.5, 0.9, 1.7), target: point(0, 0.25, 0.35), fov: 25, hiddenGroups: hiddenExcept(handPumpGroups) },
    { id: "hand-pump-pivot-detail", label: "Handpomp · attached pivot and grip", projection: "perspective", position: point(1.3, 1.6, -1.8), target: point(0, 1.13, -0.1), fov: 24, hiddenGroups: hiddenExcept(handPumpGroups) },
    { id: "drying-line-front", label: "Drooglijn · exact span, sag and leaning prop", projection: "orthographic", position: point(0, 2.1, 10), target: point(0, 1.05, 0), orthoHeight: 7.9, hiddenGroups: hiddenExcept(dryingLineGroups) },
    { id: "drying-line-profile", label: "Drooglijn · twin lines on transverse bars", projection: "orthographic", position: point(9, 1, 0), target: point(0, 1, 0), orthoHeight: 3.5, hiddenGroups: hiddenExcept(dryingLineGroups) },
    { id: "drying-line-three-quarter", label: "Drooglijn · grounded posts and working Y-prop", projection: "perspective", position: point(9, 4.5, 10.5), target: point(0, 1.05, 0), fov: 30, hiddenGroups: hiddenExcept(dryingLineGroups) },
    { id: "drying-line-high", label: "Drooglijn · two continuous opaque cords", projection: "perspective", position: point(-8, 6.5, 9), target: point(0, 1.15, 0), fov: 32, hiddenGroups: hiddenExcept(dryingLineGroups) },
    { id: "drying-line-prop-detail", label: "Drooglijn · fork supports both midpoints", projection: "perspective", position: point(2.5, 2.8, 3.8), target: point(0, 1.65, 0), fov: 26, hiddenGroups: hiddenExcept(dryingLineGroups) },
    { id: "bean-frame-front", label: "Bonenrek · five exact paired stations", projection: "orthographic", position: point(0, 1.45, 6), target: point(0, 1.15, 0), orthoHeight: 3.2, hiddenGroups: hiddenExcept(beanFrameGroups) },
    { id: "bean-frame-profile", label: "Bonenrek · 0.70 m rows and ties at 2.10 m", projection: "orthographic", position: point(5, 1.45, 0), target: point(0, 1.18, 0), orthoHeight: 3.25, hiddenGroups: hiddenExcept(beanFrameGroups) },
    { id: "bean-frame-three-quarter", label: "Bonenrek · planted A-frame and filled bed", projection: "perspective", position: point(3.8, 3.2, 4.5), target: point(0, 1.05, 0), fov: 30, hiddenGroups: hiddenExcept(beanFrameGroups) },
    { id: "bean-frame-high", label: "Bonenrek · continuous ridge and five bindings", projection: "perspective", position: point(-3.7, 4.3, -4.1), target: point(0, 1.2, 0), fov: 30, hiddenGroups: hiddenExcept(beanFrameGroups) },
    { id: "bean-frame-tie-detail", label: "Bonenrek · poles continue above bound ridge", projection: "perspective", position: point(1.45, 2.7, 1.9), target: point(0.55, 2.1, 0), fov: 24, hiddenGroups: hiddenExcept(beanFrameGroups) },
    { id: "rain-barrel-front", label: "Regenton · twelve oak staves and three forged hoops", projection: "orthographic", position: point(0, 1.1, 4), target: point(0, 1.02, -0.03), orthoHeight: 2.45, hiddenGroups: hiddenExcept(rainBarrelGroups) },
    { id: "rain-barrel-profile", label: "Regenton · brick support and outlet 0.15 m above", projection: "orthographic", position: point(4, 1.1, 0), target: point(0, 1.02, -0.06), orthoHeight: 2.45, hiddenGroups: hiddenExcept(rainBarrelGroups) },
    { id: "rain-barrel-three-quarter", label: "Regenton · grounded barrel and wall-service chain", projection: "perspective", position: point(2.7, 2.25, 3.2), target: point(0, 0.95, -0.04), fov: 28, hiddenGroups: hiddenExcept(rainBarrelGroups) },
    { id: "rain-barrel-high", label: "Regenton · real open top and hollow square downspout", projection: "perspective", position: point(-2.3, 2.85, 2.7), target: point(0, 0.83, -0.04), fov: 28, hiddenGroups: hiddenExcept(rainBarrelGroups) },
    { id: "rain-barrel-support-detail", label: "Regenton · stave ring bears on two bricks", projection: "orthographic", position: point(0, 0.4, 3), target: point(0, 0.17, 0), orthoHeight: 0.78, hiddenGroups: hiddenExcept(rainBarrelGroups) },
    { id: "rain-barrel-outlet-detail", label: "Regenton · open square outlet over clear top", projection: "perspective", position: point(0.95, 1.02, 1.15), target: point(0, 1.1, -0.17), fov: 24, hiddenGroups: hiddenExcept(rainBarrelGroups) },
    { id: "bridge-front", label: "Kwakel bridge · load path and paired rails", projection: "orthographic", position: point(8.8, 3.1, 0), target: point(0, 0.75, 0), orthoHeight: 7.5, hiddenGroups: hiddenExcept(bridgeGroups) },
    { id: "bridge-profile", label: "Kwakel bridge · crown, stringers and abutments", projection: "orthographic", position: point(0, 3.0, 9), target: point(0, 0.75, 0), orthoHeight: 6.5, hiddenGroups: hiddenExcept(bridgeGroups) },
    { id: "bridge-high", label: "Kwakel bridge · deck boards meet both banks", projection: "perspective", position: point(7.5, 6.8, 8.5), target: point(0, 0.6, 0), fov: 34, hiddenGroups: hiddenExcept(bridgeGroups) },
    { id: "bridge-night", label: "Kwakel bridge · night landing and water-edge pool", projection: "perspective", position: point(7.5, 3.8, 8.5), target: point(0, 1.0, 0), fov: 34, hiddenGroups: hiddenExcept(bridgeLitGroups), lighting: "night" },
    { id: "field-bed", label: "Working flower beds · ridges, stems and blossoms", projection: "perspective", position: point(7, 5.5, 8), target: point(0, 0.2, 0), fov: 33, hiddenGroups: hiddenExcept(fieldGroups) },
    { id: "masonry", label: "Retaining masonry · alternating bond and cap", projection: "perspective", position: point(6.5, 3.2, 5.5), target: point(0, 0.7, 0), fov: 31, hiddenGroups: hiddenExcept(wallGroups) },
    { id: "revetment", label: "Canal revetment · sheet piles, walers and anchors", projection: "perspective", position: point(6.8, 3.6, 5.8), target: point(0, 0.1, 0), fov: 32, hiddenGroups: hiddenExcept(revetmentGroups) },
    { id: "path", label: "Dry path · compacted shell over earth sub-base", projection: "perspective", position: point(5, 3.2, 7), target: point(0, 0.1, 0), fov: 34, hiddenGroups: hiddenExcept(pathGroups) },
    { id: "pollard-willow", label: "Pollard willow · trunk, cut crown and regrowth", projection: "perspective", position: point(7, 5.8, 8), target: point(0, 2.1, 0), fov: 32, hiddenGroups: hiddenExcept(willowGroups) },
    { id: "field-fence", label: "Field fence · driven posts and continuous rails", projection: "perspective", position: point(7, 3.2, 6), target: point(0, 0.65, 0), fov: 31, hiddenGroups: hiddenExcept(fenceGroups) },
    { id: "hedgerow", label: "Hedgerow · woody line beneath overlapping crowns", projection: "perspective", position: point(7, 3.7, 6), target: point(0, 0.8, 0), fov: 31, hiddenGroups: hiddenExcept(hedgeGroups) },
  ],
};

export const dutchLandscapeBridgeParts = parts.filter((part) => bridgeGroups.includes(part.group as typeof bridgeGroups[number]));
export const dutchLandscapeLitBridgeParts = parts.filter((part) => bridgeLitGroups.includes(part.group as typeof bridgeLitGroups[number]));
export const dutchLandscapeSchouwParts = parts.filter((part) => schouwGroups.includes(part.group as typeof schouwGroups[number]));
export const dutchLandscapeMooringPostParts = parts.filter((part) => mooringPostGroups.includes(part.group as typeof mooringPostGroups[number]));
export const dutchLandscapeJettyParts = parts.filter((part) => jettyGroups.includes(part.group as typeof jettyGroups[number]));
export const dutchLandscapePicketFenceParts = parts.filter((part) => picketFenceGroups.includes(part.group as typeof picketFenceGroups[number]));
export const dutchLandscapePeatStoreParts = parts.filter((part) => peatStoreGroups.includes(part.group as typeof peatStoreGroups[number]));
export const dutchLandscapePrivyParts = parts.filter((part) => privyGroups.includes(part.group as typeof privyGroups[number]));
export const dutchLandscapeHandPumpParts = parts.filter((part) => handPumpGroups.includes(part.group as typeof handPumpGroups[number]));
export const dutchLandscapeDryingLineParts = parts.filter((part) => dryingLineGroups.includes(part.group as typeof dryingLineGroups[number]));
export const dutchLandscapeBeanFrameParts = parts.filter((part) => beanFrameGroups.includes(part.group as typeof beanFrameGroups[number]));
export const dutchLandscapeRainBarrelParts = parts.filter((part) => rainBarrelGroups.includes(part.group as typeof rainBarrelGroups[number]));
export const dutchLandscapeFieldParts = parts.filter((part) => fieldGroups.includes(part.group as typeof fieldGroups[number]));
export const dutchLandscapeWallParts = parts.filter((part) => wallGroups.includes(part.group as typeof wallGroups[number]));
export const dutchLandscapeRevetmentParts = parts.filter((part) => revetmentGroups.includes(part.group as typeof revetmentGroups[number]));
export const dutchLandscapePathParts = parts.filter((part) => pathGroups.includes(part.group as typeof pathGroups[number]));
export const dutchLandscapeWillowParts = parts.filter((part) => willowGroups.includes(part.group as typeof willowGroups[number]));
export const dutchLandscapeFenceParts = parts.filter((part) => fenceGroups.includes(part.group as typeof fenceGroups[number]));
export const dutchLandscapeHedgeParts = parts.filter((part) => hedgeGroups.includes(part.group as typeof hedgeGroups[number]));
