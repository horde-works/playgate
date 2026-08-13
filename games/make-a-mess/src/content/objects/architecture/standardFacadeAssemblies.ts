import type {
  ObjectLabPart,
  ObjectMaterialId,
  ObjectPoint,
} from "../dutchWindmills/objectModel.ts";

export type RectilinearFace = "front-z" | "rear-z" | "right-x" | "left-x";

export type FacadeOpening = {
  readonly id: string;
  readonly centerU: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
};

type FaceFrame = {
  readonly normalAxis: 0 | 2;
  readonly tangentAxis: 0 | 2;
  readonly outward: -1 | 1;
};

const FRAME_BY_FACE: Readonly<Record<RectilinearFace, FaceFrame>> = {
  "front-z": { normalAxis: 2, tangentAxis: 0, outward: 1 },
  "rear-z": { normalAxis: 2, tangentAxis: 0, outward: -1 },
  "right-x": { normalAxis: 0, tangentAxis: 2, outward: 1 },
  "left-x": { normalAxis: 0, tangentAxis: 2, outward: -1 },
};

const point = (x: number, y: number, z: number): ObjectPoint => [x, y, z];

function worldPoint(
  face: RectilinearFace,
  u: number,
  y: number,
  normal: number,
): ObjectPoint {
  return FRAME_BY_FACE[face].normalAxis === 2
    ? point(u, y, normal)
    : point(normal, y, u);
}

function worldSize(
  face: RectilinearFace,
  tangent: number,
  height: number,
  normal: number,
): ObjectPoint {
  return FRAME_BY_FACE[face].normalAxis === 2
    ? point(tangent, height, normal)
    : point(normal, height, tangent);
}

function addBox(
  result: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  center: ObjectPoint,
  size: ObjectPoint,
): void {
  result.push({ kind: "box", id, group, material, center, size });
}

function addBeam(
  result: ObjectLabPart[],
  id: string,
  group: string,
  material: ObjectMaterialId,
  from: ObjectPoint,
  to: ObjectPoint,
  width: number,
  depth: number,
): void {
  result.push({ kind: "beam", id, group, material, from, to, width, depth });
}

export function solidIntervals(
  minimum: number,
  maximum: number,
  gaps: readonly (readonly [number, number])[],
): Array<readonly [number, number]> {
  const intervals: Array<readonly [number, number]> = [];
  let cursor = minimum;
  for (const [rawStart, rawEnd] of [...gaps].sort((a, b) => a[0] - b[0])) {
    const start = Math.max(minimum, rawStart);
    const end = Math.min(maximum, rawEnd);
    if (start > cursor + 1e-6) intervals.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < maximum - 1e-6) intervals.push([cursor, maximum]);
  return intervals.filter(([start, end]) => end - start > 1e-5);
}

export type SegmentedWallOptions = {
  readonly id: string;
  readonly group: string;
  readonly material: ObjectMaterialId;
  readonly face: RectilinearFace;
  /** Coordinate of the exterior finished face. */
  readonly plane: number;
  readonly thickness: number;
  readonly uMin: number;
  readonly uMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly openings: readonly FacadeOpening[];
};

/** Standard thick wall emitted as solid boxes around real rectangular voids. */
export function segmentedWallWithOpenings(
  options: SegmentedWallOptions,
): ObjectLabPart[] {
  const result: ObjectLabPart[] = [];
  const { outward } = FRAME_BY_FACE[options.face];
  const normalCenter = options.plane - outward * options.thickness / 2;
  const levels = [...new Set([
    options.yMin,
    options.yMax,
    ...options.openings.flatMap((opening) => [
      opening.centerY - opening.height / 2,
      opening.centerY + opening.height / 2,
    ]),
  ].filter((y) => y >= options.yMin && y <= options.yMax))].sort((a, b) => a - b);

  for (let band = 0; band < levels.length - 1; band += 1) {
    const y0 = levels[band];
    const y1 = levels[band + 1];
    const midY = (y0 + y1) / 2;
    const gaps = options.openings
      .filter((opening) => midY > opening.centerY - opening.height / 2 + 1e-7
        && midY < opening.centerY + opening.height / 2 - 1e-7)
      .map((opening) => [
        opening.centerU - opening.width / 2,
        opening.centerU + opening.width / 2,
      ] as const);
    for (const [segment, [u0, u1]] of solidIntervals(
      options.uMin,
      options.uMax,
      gaps,
    ).entries()) {
      addBox(
        result,
        `${options.id}:band-${band}:segment-${segment}`,
        options.group,
        options.material,
        worldPoint(options.face, (u0 + u1) / 2, (y0 + y1) / 2, normalCenter),
        worldSize(options.face, u1 - u0, y1 - y0, options.thickness),
      );
    }
  }
  return result;
}

export type PanelGridOptions = Omit<SegmentedWallOptions, "thickness"> & {
  readonly columns: number;
  readonly rows: number;
  readonly thickness: number;
  readonly horizontalGap: number;
  readonly verticalGap: number;
};

/** Standard rectangular rain-screen cells, each clipped around real apertures. */
export function standardPanelGridAroundOpenings(
  options: PanelGridOptions,
): ObjectLabPart[] {
  const result: ObjectLabPart[] = [];
  // Sub-pixel slivers appear when an opening falls within a few millimetres of
  // a module seam. They are not real panels; merge that tolerance into the
  // aperture before emitting standard rectangles.
  const clippedOpenings = options.openings.map((opening) => {
    const cellWidth = (options.uMax - options.uMin) / options.columns;
    const cellHeight = (options.yMax - options.yMin) / options.rows;
    const left = opening.centerU - opening.width / 2;
    const right = opening.centerU + opening.width / 2;
    const bottom = opening.centerY - opening.height / 2;
    const top = opening.centerY + opening.height / 2;
    const snapU = (value: number) => {
      const seam = options.uMin + Math.round((value - options.uMin) / cellWidth) * cellWidth;
      return Math.abs(seam - value) < 0.04 ? seam : value;
    };
    const snapY = (value: number) => {
      const seam = options.yMin + Math.round((value - options.yMin) / cellHeight) * cellHeight;
      return Math.abs(seam - value) < 0.04 ? seam : value;
    };
    const snappedLeft = snapU(left);
    const snappedRight = snapU(right);
    const snappedBottom = snapY(bottom);
    const snappedTop = snapY(top);
    return {
      ...opening,
      centerU: (snappedLeft + snappedRight) / 2,
      width: snappedRight - snappedLeft,
      centerY: (snappedBottom + snappedTop) / 2,
      height: snappedTop - snappedBottom,
    };
  });
  const cellWidth = (options.uMax - options.uMin) / options.columns;
  const cellHeight = (options.yMax - options.yMin) / options.rows;
  for (let row = 0; row < options.rows; row += 1) {
    const cellY0 = options.yMin + row * cellHeight + options.verticalGap / 2;
    const cellY1 = options.yMin + (row + 1) * cellHeight - options.verticalGap / 2;
    for (let column = 0; column < options.columns; column += 1) {
      const cellU0 = options.uMin + column * cellWidth + options.horizontalGap / 2;
      const cellU1 = options.uMin + (column + 1) * cellWidth - options.horizontalGap / 2;
      const cellOpenings = options.openings.filter((opening) =>
        opening.centerU + opening.width / 2 > cellU0
          && opening.centerU - opening.width / 2 < cellU1
          && opening.centerY + opening.height / 2 > cellY0
          && opening.centerY - opening.height / 2 < cellY1
      );
      const clippedCellOpenings = clippedOpenings.filter((opening) =>
        opening.centerU + opening.width / 2 > cellU0
          && opening.centerU - opening.width / 2 < cellU1
          && opening.centerY + opening.height / 2 > cellY0
          && opening.centerY - opening.height / 2 < cellY1
      );
      result.push(...segmentedWallWithOpenings({
        id: `${options.id}:panel-${column}-${row}`,
        group: options.group,
        material: options.material,
        face: options.face,
        plane: options.plane,
        thickness: options.thickness,
        uMin: cellU0,
        uMax: cellU1,
        yMin: cellY0,
        yMax: cellY1,
        openings: clippedCellOpenings.length > 0 ? clippedCellOpenings : cellOpenings,
      }));
    }
  }
  return result;
}

export type WindowAssemblyOptions = FacadeOpening & {
  readonly group: string;
  readonly face: RectilinearFace;
  readonly plane: number;
  readonly wallThickness: number;
  readonly frameMaterial: ObjectMaterialId;
  readonly glassMaterial: ObjectMaterialId;
  readonly revealMaterial: ObjectMaterialId;
  readonly interiorMaterial: ObjectMaterialId;
  readonly columns?: number;
  readonly rows?: number;
  readonly interiorDepth?: number;
};

/** Void finish, frame, finite pane and distant interior for one real opening. */
export function standardWindowAssembly(
  options: WindowAssemblyOptions,
): ObjectLabPart[] {
  const result: ObjectLabPart[] = [];
  const { outward } = FRAME_BY_FACE[options.face];
  const halfWidth = options.width / 2;
  const halfHeight = options.height / 2;
  const frame = Math.min(0.1, options.width * 0.12, options.height * 0.12);
  const reveal = Math.min(0.085, frame * 0.9);
  const glassNormal = options.plane - outward * Math.min(0.14, options.wallThickness * 0.34);
  const revealNormal = options.plane - outward * options.wallThickness / 2;
  const outsideNormal = options.plane + outward * 0.035;
  const bottom = options.centerY - halfHeight;
  const top = options.centerY + halfHeight;
  const left = options.centerU - halfWidth;
  const right = options.centerU + halfWidth;
  const columns = options.columns ?? 1;
  const rows = options.rows ?? 1;

  addBox(
    result,
    `${options.id}:glass`,
    `${options.group}:glazing`,
    options.glassMaterial,
    worldPoint(options.face, options.centerU, options.centerY, glassNormal),
    worldSize(options.face, options.width - frame * 1.45, options.height - frame * 1.45, 0.04),
  );

  for (const [edgeId, u] of [["left", left], ["right", right]] as const) {
    addBox(
      result,
      `${options.id}:reveal-${edgeId}`,
      `${options.group}:reveals`,
      options.revealMaterial,
      worldPoint(options.face, u, options.centerY, revealNormal),
      worldSize(options.face, reveal, options.height, options.wallThickness),
    );
    addBeam(
      result,
      `${options.id}:frame-${edgeId}`,
      `${options.group}:frames`,
      options.frameMaterial,
      worldPoint(options.face, u, bottom, outsideNormal),
      worldPoint(options.face, u, top, outsideNormal),
      frame,
      frame,
    );
  }
  for (const [edgeId, y] of [["sill", bottom], ["head", top]] as const) {
    addBox(
      result,
      `${options.id}:reveal-${edgeId}`,
      `${options.group}:reveals`,
      options.revealMaterial,
      worldPoint(options.face, options.centerU, y, revealNormal),
      worldSize(options.face, options.width, reveal, options.wallThickness),
    );
    addBeam(
      result,
      `${options.id}:frame-${edgeId}`,
      `${options.group}:frames`,
      options.frameMaterial,
      worldPoint(options.face, left, y, outsideNormal),
      worldPoint(options.face, right, y, outsideNormal),
      frame,
      frame,
    );
  }
  for (let column = 1; column < columns; column += 1) {
    const u = left + options.width * column / columns;
    addBeam(
      result,
      `${options.id}:mullion-${column}`,
      `${options.group}:frames`,
      options.frameMaterial,
      worldPoint(options.face, u, bottom + frame, outsideNormal),
      worldPoint(options.face, u, top - frame, outsideNormal),
      frame * 0.55,
      frame * 0.55,
    );
  }
  for (let row = 1; row < rows; row += 1) {
    const y = bottom + options.height * row / rows;
    addBeam(
      result,
      `${options.id}:transom-${row}`,
      `${options.group}:frames`,
      options.frameMaterial,
      worldPoint(options.face, left + frame, y, outsideNormal),
      worldPoint(options.face, right - frame, y, outsideNormal),
      frame * 0.55,
      frame * 0.55,
    );
  }

  const interiorDepth = options.interiorDepth ?? 1.8;
  addBox(
    result,
    `${options.id}:interior-back`,
    `${options.group}:interior`,
    options.interiorMaterial,
    worldPoint(
      options.face,
      options.centerU,
      options.centerY,
      options.plane - outward * (options.wallThickness + interiorDepth),
    ),
    worldSize(
      options.face,
      options.width * 1.12,
      options.height * 1.16,
      0.12,
    ),
  );
  return result;
}

export type CurtainDoorGroup = {
  readonly id: string;
  readonly startBay: number;
  readonly baySpan: number;
};

export type CurtainWallOptions = {
  readonly id: string;
  readonly group: string;
  readonly face: RectilinearFace;
  readonly plane: number;
  readonly uMin: number;
  readonly uMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly bays: number;
  readonly rows: number;
  readonly frameMaterial: ObjectMaterialId;
  readonly glassMaterial: ObjectMaterialId;
  readonly doorGroups?: readonly CurtainDoorGroup[];
};

/** Reusable open curtain wall: one physical pane per cell, never a backing wall. */
export function standardCurtainWall(
  options: CurtainWallOptions,
): ObjectLabPart[] {
  const result: ObjectLabPart[] = [];
  const { outward } = FRAME_BY_FACE[options.face];
  const bayWidth = (options.uMax - options.uMin) / options.bays;
  const rowHeight = (options.yMax - options.yMin) / options.rows;
  const frameNormal = options.plane + outward * 0.02;
  const glassNormal = options.plane - outward * 0.055;
  const mullionWidth = 0.12;
  const railHeight = 0.1;
  const doorBays = new Set<number>();
  for (const group of options.doorGroups ?? []) {
    for (let index = 0; index < group.baySpan; index += 1) {
      doorBays.add(group.startBay + index);
    }
  }

  for (let boundary = 0; boundary <= options.bays; boundary += 1) {
    const u = options.uMin + boundary * bayWidth;
    addBeam(
      result,
      `${options.id}:mullion-${boundary}`,
      `${options.group}:frame`,
      options.frameMaterial,
      worldPoint(options.face, u, options.yMin, frameNormal),
      worldPoint(options.face, u, options.yMax, frameNormal),
      mullionWidth,
      mullionWidth,
    );
  }
  for (let boundary = 0; boundary <= options.rows; boundary += 1) {
    const y = options.yMin + boundary * rowHeight;
    addBeam(
      result,
      `${options.id}:rail-${boundary}`,
      `${options.group}:frame`,
      options.frameMaterial,
      worldPoint(options.face, options.uMin, y, frameNormal),
      worldPoint(options.face, options.uMax, y, frameNormal),
      railHeight,
      railHeight,
    );
  }
  for (let bay = 0; bay < options.bays; bay += 1) {
    if (doorBays.has(bay)) continue;
    for (let row = 0; row < options.rows; row += 1) {
      addBox(
        result,
        `${options.id}:pane-${bay}-${row}`,
        `${options.group}:glazing`,
        options.glassMaterial,
        worldPoint(
          options.face,
          options.uMin + (bay + 0.5) * bayWidth,
          options.yMin + (row + 0.5) * rowHeight,
          glassNormal,
        ),
        worldSize(
          options.face,
          bayWidth - mullionWidth,
          rowHeight - railHeight,
          0.04,
        ),
      );
    }
  }

  for (const door of options.doorGroups ?? []) {
    const left = options.uMin + door.startBay * bayWidth;
    const right = left + door.baySpan * bayWidth;
    const middle = (left + right) / 2;
    const leafWidth = (right - left) / 2;
    for (const [leafId, centerU] of [
      ["left", middle - leafWidth / 2],
      ["right", middle + leafWidth / 2],
    ] as const) {
      addBox(
        result,
        `${options.id}:door-${door.id}:${leafId}:glass`,
        `${options.group}:doors:glazing`,
        options.glassMaterial,
        worldPoint(
          options.face,
          centerU,
          (options.yMin + options.yMax) / 2,
          glassNormal,
        ),
        worldSize(
          options.face,
          leafWidth - mullionWidth * 1.4,
          options.yMax - options.yMin - railHeight * 2,
          0.045,
        ),
      );
      for (const u of [centerU - leafWidth / 2, centerU + leafWidth / 2]) {
        addBeam(
          result,
          `${options.id}:door-${door.id}:${leafId}:stile-${u}`,
          `${options.group}:doors:frame`,
          options.frameMaterial,
          worldPoint(options.face, u, options.yMin, frameNormal + outward * 0.02),
          worldPoint(options.face, u, options.yMax, frameNormal + outward * 0.02),
          0.09,
          0.09,
        );
      }
    }
    addBeam(
      result,
      `${options.id}:door-${door.id}:meeting-stile`,
      `${options.group}:doors:frame`,
      options.frameMaterial,
      worldPoint(options.face, middle, options.yMin, frameNormal + outward * 0.025),
      worldPoint(options.face, middle, options.yMax, frameNormal + outward * 0.025),
      0.11,
      0.1,
    );
    for (const [handleId, u] of [
      ["left", middle - 0.18],
      ["right", middle + 0.18],
    ] as const) {
      addBeam(
        result,
        `${options.id}:door-${door.id}:handle-${handleId}`,
        `${options.group}:doors:hardware`,
        options.frameMaterial,
        worldPoint(
          options.face,
          u,
          options.yMin + (options.yMax - options.yMin) * 0.38,
          frameNormal + outward * 0.12,
        ),
        worldPoint(
          options.face,
          u,
          options.yMin + (options.yMax - options.yMin) * 0.66,
          frameNormal + outward * 0.12,
        ),
        0.045,
        0.055,
      );
    }
    addBeam(
      result,
      `${options.id}:door-${door.id}:threshold`,
      `${options.group}:doors:frame`,
      options.frameMaterial,
      worldPoint(options.face, left, options.yMin, frameNormal + outward * 0.02),
      worldPoint(options.face, right, options.yMin, frameNormal + outward * 0.02),
      0.09,
      0.12,
    );
  }
  return result;
}
