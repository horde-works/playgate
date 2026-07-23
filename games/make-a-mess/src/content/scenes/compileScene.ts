import {
  createDestructionScene,
  type BreakableClusterDefinition,
  type BreakablePieceDefinition,
  type LampDefinition,
  type SceneVector3,
} from "../../game/destructionScene.ts";
import type {
  AuthoredSceneDocument,
  SceneCompilationResult,
  SceneContactBox,
  SceneEuler,
  SceneHinge,
  SceneLightSource,
  SceneObjectDefinition,
  ScenePrefabDefinition,
  ScenePrefabLibrary,
  ScenePrefabPieceDefinition,
  SceneTransform,
  SurfaceTreatment,
} from "./sceneContract.ts";

interface RotationMatrix {
  readonly x: SceneVector3;
  readonly y: SceneVector3;
  readonly z: SceneVector3;
}

function multiplyColor(color: string, tint: SceneVector3): string {
  const normalized = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return color;
  }
  const channels = [0, 2, 4].map((offset, index) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(Number.parseInt(normalized.slice(offset, offset + 2), 16) * tint[index]),
      ),
    ),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function treatedColor(
  color: string,
  treatments: readonly SurfaceTreatment[] | undefined,
): string {
  // A gentle base tone only: the spatial biofilm pattern now lives in the
  // shader (driven by the `weathering` attribute below), so this flat tint is
  // kept subtle to avoid double-darkening a surface that the shader also ages.
  let next = color;
  for (const treatment of treatments ?? []) {
    const amount = Math.max(0, Math.min(1, treatment.amount)) * 0.4;
    if (treatment.kind === "damp") {
      next = multiplyColor(next, [1 - amount * 0.3, 1 - amount * 0.25, 1 - amount * 0.22]);
    } else if (treatment.kind === "moss") {
      next = multiplyColor(next, [1 - amount * 0.34, 1 - amount * 0.12, 1 - amount * 0.38]);
    } else {
      next = multiplyColor(next, [1 - amount * 0.28, 1 - amount * 0.3, 1 - amount * 0.25]);
    }
  }
  return next;
}

// Materials that can grow moss, hold mould or spall render. Metals, glass and
// cloth stay clean, so their weathering receptivity is zero and the shader
// biofilm skips them entirely.
const weatheringReceptivity: Partial<Record<string, number>> = {
  wood: 1,
  stone: 1,
  brick: 0.95,
  concrete: 0.9,
  plaster: 1,
  basalt: 0.85,
  graphiteStone: 0.7,
  foliage: 1,
};

function weatheringAmount(
  material: string,
  treatments: readonly SurfaceTreatment[] | undefined,
): number | undefined {
  const receptivity = weatheringReceptivity[material] ?? 0;
  if (receptivity === 0 || !treatments || treatments.length === 0) {
    return undefined;
  }
  let amount = 0;
  for (const treatment of treatments) {
    const strength = Math.max(0, Math.min(1, treatment.amount));
    // Moss reads strongest, mould a touch less, plain damp mostly as sheen.
    const weight = treatment.kind === "moss" ? 1 : treatment.kind === "mold" ? 0.9 : 0.55;
    amount = Math.max(amount, strength * weight);
  }
  const combined = amount * receptivity;
  return combined > 0.001 ? Math.min(1, combined) : undefined;
}

function rotationMatrix(rotation: SceneEuler = [0, 0, 0]): RotationMatrix {
  const [rx, ry, rz] = rotation;
  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);

  return {
    x: [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    y: [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    z: [sy, -sx * cy, cx * cy],
  };
}

function rotate(vector: SceneVector3, matrix: RotationMatrix): SceneVector3 {
  return [
    vector[0] * matrix.x[0] + vector[1] * matrix.y[0] + vector[2] * matrix.z[0],
    vector[0] * matrix.x[1] + vector[1] * matrix.y[1] + vector[2] * matrix.z[1],
    vector[0] * matrix.x[2] + vector[1] * matrix.y[2] + vector[2] * matrix.z[2],
  ];
}

function composedRotationMatrix(
  parent: SceneEuler,
  local: SceneEuler,
): RotationMatrix {
  const parentMatrix = rotationMatrix(parent);
  const localMatrix = rotationMatrix(local);
  return {
    x: rotate(localMatrix.x, parentMatrix),
    y: rotate(localMatrix.y, parentMatrix),
    z: rotate(localMatrix.z, parentMatrix),
  };
}

function eulerFromRotationMatrix(matrix: RotationMatrix): SceneEuler {
  const m11 = matrix.x[0];
  const m12 = matrix.y[0];
  const m13 = matrix.z[0];
  const m22 = matrix.y[1];
  const m23 = matrix.z[1];
  const m32 = matrix.y[2];
  const m33 = matrix.z[2];
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), y, Math.atan2(-m12, m11)];
  }
  return [Math.atan2(m32, m22), y, 0];
}

function scaled(vector: SceneVector3, scale: SceneVector3): SceneVector3 {
  return [vector[0] * scale[0], vector[1] * scale[1], vector[2] * scale[2]];
}

function transformedPosition(
  local: SceneVector3,
  transform: SceneTransform,
): SceneVector3 {
  const scale = transform.scale ?? [1, 1, 1];
  const rotated = rotate(scaled(local, scale), rotationMatrix(transform.rotation));
  return [
    transform.position[0] + rotated[0],
    transform.position[1] + rotated[1],
    transform.position[2] + rotated[2],
  ];
}

function transformedSize(size: SceneVector3, transform: SceneTransform): SceneVector3 {
  const scale = transform.scale ?? [1, 1, 1];
  return [
    Math.abs(size[0] * scale[0]),
    Math.abs(size[1] * scale[1]),
    Math.abs(size[2] * scale[2]),
  ];
}

function transformedContactSize(
  size: SceneVector3,
  transform: SceneTransform,
): SceneVector3 {
  const local = transformedSize(size, transform);
  const matrix = rotationMatrix(transform.rotation);
  return [
    Math.abs(matrix.x[0]) * local[0] + Math.abs(matrix.y[0]) * local[1] + Math.abs(matrix.z[0]) * local[2],
    Math.abs(matrix.x[1]) * local[0] + Math.abs(matrix.y[1]) * local[1] + Math.abs(matrix.z[1]) * local[2],
    Math.abs(matrix.x[2]) * local[0] + Math.abs(matrix.y[2]) * local[1] + Math.abs(matrix.z[2]) * local[2],
  ];
}

function transformedRotation(
  local: SceneEuler | undefined,
  transform: SceneTransform,
): SceneEuler | undefined {
  const parent = transform.rotation;
  if (!local && !parent) {
    return undefined;
  }
  if (!local) {
    return parent;
  }
  if (!parent) {
    return local;
  }
  // Euler components cannot be added once a prefab contains rotations on
  // more than one axis. Compose the matrices so rotated log walls, doors and
  // roof timbers keep their local orientation when the whole house is yawed.
  return eulerFromRotationMatrix(composedRotationMatrix(parent, local));
}

function transformedBoxes(
  boxes: readonly SceneContactBox[] | undefined,
  transform: SceneTransform,
): readonly SceneContactBox[] | undefined {
  return boxes?.map((box) => ({
    position: transformedPosition(box.position, transform),
    size: transformedContactSize(box.size, transform),
  }));
}

function transformedHinge(
  hinge: SceneHinge | undefined,
  transform: SceneTransform,
): SceneHinge | undefined {
  if (!hinge) {
    return undefined;
  }
  const matrix = rotationMatrix(transform.rotation);
  return {
    pivot: transformedPosition(hinge.pivot, transform),
    direction: rotate(hinge.direction, matrix),
    normal: rotate(hinge.normal, matrix),
  };
}

function assertPositiveSize(id: string, size: SceneVector3): void {
  if (size.some((component) => !Number.isFinite(component) || component <= 0)) {
    throw new Error(`Scene object ${id} has an invalid size: ${size.join(", ")}`);
  }
}

function compilePiece(
  sceneId: string,
  groupId: string,
  object: SceneObjectDefinition,
  source: ScenePrefabPieceDefinition,
  palette: Readonly<Record<string, string>> | undefined,
): { readonly piece: BreakablePieceDefinition; readonly light?: LampDefinition } {
  const id = `${sceneId}:${groupId}:${object.id}:${source.id}`;
  const size = transformedSize(source.size, object.transform);
  assertPositiveSize(id, size);
  const color = treatedColor(
    source.colorSlot ? palette?.[source.colorSlot] ?? source.color : source.color,
    object.surface,
  );
  const piece: BreakablePieceDefinition = {
    id,
    clusterId: `${sceneId}:${groupId}`,
    material: source.material,
    shape: source.shape,
    position: transformedPosition(source.position, object.transform),
    rotation: transformedRotation(source.rotation, object.transform),
    size,
    volume: source.volume === undefined
      ? undefined
      : source.volume * Math.abs(
        (object.transform.scale?.[0] ?? 1) *
        (object.transform.scale?.[1] ?? 1) *
        (object.transform.scale?.[2] ?? 1),
      ),
    bearingArea: source.bearingArea === undefined
      ? undefined
      : source.bearingArea * Math.abs(
        (object.transform.scale?.[0] ?? 1) *
        (object.transform.scale?.[2] ?? 1),
      ),
    color,
    contactBoxes: transformedBoxes(source.contactBoxes, object.transform),
    carriesAttachments: source.carriesAttachments,
    bearsLoad: source.bearsLoad,
    attachmentSupportMode: source.attachmentSupportMode,
    sideAttachmentReach: source.sideAttachmentReach,
    contactBearingOrder: source.contactBearingOrder,
    textureProfile: source.textureProfile,
    landscapeSurface: source.landscapeSurface,
    weathering: source.weathering ?? weatheringAmount(source.material, object.surface),
    hinge: transformedHinge(source.hinge, object.transform),
  };
  return {
    piece,
    light: source.light
      ? compileLight(id, source.light, object.transform)
      : undefined,
  };
}

function compileLight(
  sourcePieceId: string,
  light: SceneLightSource,
  transform: SceneTransform,
): LampDefinition {
  return {
    id: sourcePieceId,
    position: transformedPosition(light.position ?? [0, 0, 0], transform),
    color: light.color,
    distance: light.distance,
    intensity: light.intensity,
  };
}

function primitiveSource(object: Extract<SceneObjectDefinition, { kind: "primitive" }>): ScenePrefabPieceDefinition {
  return {
    id: "piece",
    material: object.material,
    shape: object.shape,
    position: [0, 0, 0],
    size: object.size,
    volume: object.volume,
    bearingArea: object.bearingArea,
    color: object.color,
    contactBoxes: object.contactBoxes,
    bearsLoad: object.bearsLoad,
    carriesAttachments: object.carriesAttachments,
    attachmentSupportMode: object.attachmentSupportMode,
    sideAttachmentReach: object.sideAttachmentReach,
    contactBearingOrder: object.contactBearingOrder,
    hinge: object.hinge,
    light: object.light,
    textureProfile: object.textureProfile,
    landscapeSurface: object.landscapeSurface,
    weathering: object.weathering,
  };
}

function readPrefab(
  object: Extract<SceneObjectDefinition, { kind: "prefab" }>,
  prefabs: ScenePrefabLibrary,
): ScenePrefabDefinition {
  const prefab = prefabs.get(object.prefab);
  if (!prefab) {
    throw new Error(`Scene object ${object.id} references missing prefab ${object.prefab}`);
  }
  return prefab;
}

export function compileSceneDocument(
  document: AuthoredSceneDocument,
  prefabs: ScenePrefabLibrary,
  options: { readonly validateInitialStability?: boolean } = {},
): SceneCompilationResult {
  if (document.schemaVersion !== 1) {
    throw new Error(`Unsupported scene schema ${String(document.schemaVersion)}`);
  }
  const clusters: BreakableClusterDefinition[] = [];
  const lamps: LampDefinition[] = [];
  const ids = new Set<string>();
  const usedPrefabs = new Set<string>();
  let objectCount = 0;

  for (const group of document.groups) {
    const pieces: BreakablePieceDefinition[] = [];
    const objectIds = new Set<string>();
    for (const object of group.objects) {
      objectCount += 1;
      if (objectIds.has(object.id)) {
        throw new Error(`Duplicate object id ${group.id}/${object.id}`);
      }
      objectIds.add(object.id);
      const sources = object.kind === "primitive"
        ? [primitiveSource(object)]
        : readPrefab(object, prefabs).pieces;
      if (object.kind === "prefab") {
        usedPrefabs.add(object.prefab);
      }
      for (const source of sources) {
        const compiled = compilePiece(
          document.id,
          group.id,
          object,
          source,
          object.kind === "prefab" ? object.palette : undefined,
        );
        if (ids.has(compiled.piece.id)) {
          throw new Error(`Duplicate compiled piece id ${compiled.piece.id}`);
        }
        ids.add(compiled.piece.id);
        pieces.push(compiled.piece);
        if (compiled.light) {
          lamps.push(compiled.light);
        }
      }
    }
    clusters.push({
      id: `${document.id}:${group.id}`,
      label: group.label,
      material: group.material,
      supportMode: group.supportMode,
      pieces,
    });
  }

  const scene = createDestructionScene({
    id: document.id,
    title: document.title,
    environment: document.environment,
    playerSpawn: document.world.playerSpawn,
    cameraFar: document.world.cameraFar,
    worldCenter: document.world.center,
    worldHalfExtents: document.world.halfExtents,
    worldRadius: document.world.radius,
    safetyFloorY: document.world.safetyFloorY,
    copy: document.copy,
    clusters,
    lamps,
  });
  const unsupported = scene.resolveStructuralCollapse(new Set());
  if (options.validateInitialStability !== false && unsupported.size > 0) {
    throw new Error(
      `Scene ${document.id} starts with ${unsupported.size} unsupported pieces: ${[...unsupported].slice(0, 12).join(", ")}`,
    );
  }

  return {
    scene,
    artifact: {
      schemaVersion: 1,
      sourceSceneId: document.id,
      prefabIds: [...usedPrefabs].sort(),
      groupCount: clusters.length,
      objectCount,
      pieceCount: scene.breakablePieces.length,
      lampCount: lamps.length,
    },
  };
}
