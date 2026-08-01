"use client";

import { useFrame } from "@react-three/fiber";
import { useRapier, type RapierRigidBody } from "@react-three/rapier";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  Quaternion,
  Shape,
  Sphere,
  SphereGeometry,
  Vector3,
} from "three";
import {
  type BreakablePieceDefinition,
} from "./destructionScene";
import {
  type RemnantDefinition,
  type ShardDefinition,
} from "./destructionRuntime";
import {
  getPieceMaterial,
} from "./materialTextures";
import { materialAnchorWithWeathering } from "./materialAppearance";
import {
  silicateJointBand,
  silicateJointTint,
} from "./silicateJoints";
import {
  treeBarkPhase,
  treeWoodSpecies,
} from "./treeVisualModel";
import { treeBarkAtlas } from "./treeBarkAtlas";
import type { CompoundKinematicClusterRegistry } from "./compoundKinematicCluster";
import { markActiveShotPerformance } from "./shotPerformanceTrace";

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 20, 1);
const UNIT_SPHERE = new SphereGeometry(0.5, 32, 20);

function dynamicSurfacePolygonGeometry(
  profile: NonNullable<BreakablePieceDefinition["visualProfile"]>,
): ExtrudeGeometry {
  if (profile.vertices.length < 3) {
    throw new Error("A dynamic surface polygon needs at least three vertices");
  }
  const [[firstX, firstY], ...rest] = profile.vertices;
  const shape = new Shape().moveTo(firstX, firstY);
  for (const [x, y] of rest) {
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    bevelEnabled: false,
  }).translate(0, 0, -0.5);
}

function dynamicSurfaceMeshGeometry(
  profile: NonNullable<BreakablePieceDefinition["visualMesh"]>,
): BufferGeometry {
  if (profile.vertices.length < 3 || profile.indices.length < 3) {
    throw new Error("A dynamic surface mesh needs vertices and triangle indices");
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      profile.vertices.flatMap((vertex) => [...vertex]),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      profile.vertices.flatMap(([x, y]) => [x + 0.5, y + 0.5]),
      2,
    ),
  );
  geometry.setIndex([...profile.indices]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function detachedFoliageGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertex = 0;

  for (let leaf = 0; leaf < 42; leaf += 1) {
    const phase = leaf * 12.9898;
    const random = (salt: number): number => {
      const value = Math.sin(phase + salt * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const center = new Vector3(
      (random(1) - 0.5) * 0.72,
      (random(2) - 0.5) * 0.68,
      (random(3) - 0.5) * 0.72,
    );
    const normal = new Vector3(
      random(4) * 2 - 1,
      0.25 + random(5),
      random(6) * 2 - 1,
    ).normalize();
    let tangent = normal.clone().cross(new Vector3(0, 1, 0));
    if (tangent.lengthSq() < 0.01) {
      tangent = normal.clone().cross(new Vector3(1, 0, 0));
    }
    tangent.normalize();
    const bitangent = normal.clone().cross(tangent).normalize();
    const width = 0.035 + random(7) * 0.025;
    const height = width * (1.35 + random(8) * 0.5);
    const points = [
      center.clone().addScaledVector(bitangent, -height),
      center.clone().addScaledVector(tangent, width),
      center.clone().addScaledVector(bitangent, height),
      center.clone().addScaledVector(tangent, -width),
    ];
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
    }
    uvs.push(0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const UNIT_FOLIAGE_DEBRIS = detachedFoliageGeometry();

// Порог «покоя» несомого кластера. Пришвартованный корабль качается всё
// слабее; когда его визуальная поза сдвигается меньше, чем на эти допуски
// (0.01 мм / ~микрорадианы), матрицы его кусков перестают переписываться и
// инстанс-буфер не перезаливается впустую. Сравнение идёт с последней
// ЗАПИСАННОЙ позой, поэтому медленный дрейф не теряется — он накапливается
// и переписывает матрицы, как только превысит допуск.
const CLUSTER_POSITION_EPSILON = 1e-5;
const CLUSTER_QUATERNION_EPSILON = 1e-6;
// union() умеет только расширять сферу рейкастов: после перелёта корабля она
// покрывала весь маршрут и переставала отсекать. Периодическая пересборка с
// нуля по фактическим матрицам возвращает ей точный размер.
const RAYCAST_BOUNDS_REBUILD_FRAMES = 240;

interface ClusterRestPose {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

function clusterPoseChanged(
  poses: Map<string, ClusterRestPose>,
  clusterId: string,
  object: Object3D,
): boolean {
  const cached = poses.get(clusterId);
  if (!cached) {
    poses.set(clusterId, {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    });
    return true;
  }
  const moved =
    Math.abs(object.position.x - cached.position.x) >
      CLUSTER_POSITION_EPSILON ||
    Math.abs(object.position.y - cached.position.y) >
      CLUSTER_POSITION_EPSILON ||
    Math.abs(object.position.z - cached.position.z) >
      CLUSTER_POSITION_EPSILON ||
    Math.abs(object.quaternion.x - cached.quaternion.x) >
      CLUSTER_QUATERNION_EPSILON ||
    Math.abs(object.quaternion.y - cached.quaternion.y) >
      CLUSTER_QUATERNION_EPSILON ||
    Math.abs(object.quaternion.z - cached.quaternion.z) >
      CLUSTER_QUATERNION_EPSILON ||
    Math.abs(object.quaternion.w - cached.quaternion.w) >
      CLUSTER_QUATERNION_EPSILON;
  if (moved) {
    cached.position.copy(object.position);
    cached.quaternion.copy(object.quaternion);
  }
  return moved;
}

import {
  buildBatches,
  fragmentHasJoints,
  sourceFragments,
  type DynamicBreakableBatch,
  type DynamicBreakableFragment,
  type DynamicBreakableKind,
} from "./dynamicWorldBatching.ts";
import {
  appendDynamicSlots,
  createDynamicSlotState,
  removeDynamicSlots,
} from "./dynamicBatchSlots.ts";


function setFragmentMatrix(
  dummy: Object3D,
  fragment: DynamicBreakableFragment,
  body: RapierRigidBody | undefined,
  localCenter: Vector3,
  rotation: Quaternion,
): void {
  if (body) {
    const translation = body.translation();
    const bodyRotation = body.rotation();
    rotation.set(
      bodyRotation.x,
      bodyRotation.y,
      bodyRotation.z,
      bodyRotation.w,
    );
    localCenter
      .set(fragment.center[0], fragment.center[1], fragment.center[2])
      .applyQuaternion(rotation);
    dummy.position.set(
      translation.x + localCenter.x,
      translation.y + localCenter.y,
      translation.z + localCenter.z,
    );
  } else {
    rotation.set(...fragment.fallbackQuaternion);
    localCenter
      .set(fragment.center[0], fragment.center[1], fragment.center[2])
      .applyQuaternion(rotation);
    dummy.position.set(
      fragment.fallbackPosition[0] + localCenter.x,
      fragment.fallbackPosition[1] + localCenter.y,
      fragment.fallbackPosition[2] + localCenter.z,
    );
  }

  dummy.quaternion.copy(rotation);
  dummy.scale.set(
    fragment.size[0] + fragment.sizeExpansion,
    fragment.size[1] + fragment.sizeExpansion,
    fragment.size[2] + fragment.sizeExpansion,
  );
  dummy.updateMatrix();
}

function setClusteredFragmentMatrix(
  dummy: Object3D,
  fragment: DynamicBreakableFragment,
  clusterOrigin: readonly [number, number, number],
  clusterObject: Object3D,
  localCenter: Vector3,
  rotation: Quaternion,
): void {
  const ownRotation = rotation.set(...fragment.fallbackQuaternion);
  localCenter
    .set(fragment.center[0], fragment.center[1], fragment.center[2])
    .applyQuaternion(ownRotation);
  localCenter.set(
    localCenter.x + fragment.fallbackPosition[0] - clusterOrigin[0],
    localCenter.y + fragment.fallbackPosition[1] - clusterOrigin[1],
    localCenter.z + fragment.fallbackPosition[2] - clusterOrigin[2],
  );
  localCenter.applyQuaternion(clusterObject.quaternion);
  dummy.position.copy(clusterObject.position).add(localCenter);
  dummy.quaternion.copy(clusterObject.quaternion).multiply(ownRotation);
  dummy.scale.set(
    fragment.size[0] + fragment.sizeExpansion,
    fragment.size[1] + fragment.sizeExpansion,
    fragment.size[2] + fragment.sizeExpansion,
  );
  dummy.updateMatrix();
}

function expandFragmentBounds(
  bounds: Sphere,
  fragmentBounds: Sphere,
  dummy: Object3D,
  fragment: DynamicBreakableFragment,
): void {
  const expansion = fragment.sizeExpansion;
  fragmentBounds.center.copy(dummy.position);
  fragmentBounds.radius =
    Math.hypot(
      fragment.size[0] + expansion,
      fragment.size[1] + expansion,
      fragment.size[2] + expansion,
    ) / 2;
  bounds.union(fragmentBounds);
}

function writeFragmentAttributes(
  geometry: BufferGeometry,
  fragment: DynamicBreakableFragment,
  slot: number,
  treeBark: boolean,
  tint: Color,
): void {
  const anchor = materialAnchorWithWeathering(
    fragment.fallbackPosition,
    fragment.center,
    fragment.weathering,
  );
  const anchors = geometry.getAttribute("materialAnchor") as InstancedBufferAttribute;
  const facePos = geometry.getAttribute("materialFaceMaskPos") as InstancedBufferAttribute;
  const faceNeg = geometry.getAttribute("materialFaceMaskNeg") as InstancedBufferAttribute;
  const bands = geometry.getAttribute("silicateJointBand") as InstancedBufferAttribute;
  const tints = geometry.getAttribute("silicateJointTint") as InstancedBufferAttribute;
  anchors.setXYZW(slot, anchor[0], anchor[1], anchor[2], anchor[3]);
  facePos.setXYZ(slot, ...fragment.faceMaskPositive);
  faceNeg.setXYZ(slot, ...fragment.faceMaskNegative);

  let band = 0;
  let tintR = 0;
  let tintG = 0;
  let tintB = 0;
  if (treeBark && fragment.treeVisual) {
    tintR = treeWoodSpecies(fragment.treeVisual.kind);
    tintG = treeBarkPhase(
      fragment.treeVisual.seed,
      fragment.treeVisualSourceId ?? fragment.sourceId,
    );
  } else if (fragment.landscapeSurface) {
    band = fragment.landscapeSurface === "viking-ground" ? -1 : -2;
  } else if (fragmentHasJoints(fragment)) {
    band = silicateJointBand(fragment.size);
    tint.set(silicateJointTint(fragment.color));
    tintR = tint.r;
    tintG = tint.g;
    tintB = tint.b;
  }
  bands.setX(slot, band);
  tints.setXYZ(slot, tintR, tintG, tintB);
}

function markFragmentAttributesUpdated(
  geometry: BufferGeometry,
  firstSlot: number,
  slotCount: number,
): void {
  if (slotCount <= 0) return;
  for (const attributeName of [
    "materialAnchor",
    "materialFaceMaskPos",
    "materialFaceMaskNeg",
    "silicateJointBand",
    "silicateJointTint",
  ]) {
    const attribute = geometry.getAttribute(attributeName) as InstancedBufferAttribute;
    attribute.addUpdateRange(
      firstSlot * attribute.itemSize,
      slotCount * attribute.itemSize,
    );
    attribute.needsUpdate = true;
  }
}

const DynamicBreakableBatch = memo(function DynamicBreakableBatch({
  batch,
  bodies,
  kinematicClusters,
}: {
  batch: DynamicBreakableBatch;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  kinematicClusters?: CompoundKinematicClusterRegistry;
}) {
  const { rapier, rigidBodyStates } = useRapier();
  const mesh = useRef<InstancedMesh>(null);
  const initialCapacity = Math.max(64, Math.ceil(batch.fragments.length * 1.5));
  const [capacity, setCapacity] = useState(initialCapacity);
  const [slots] = useState(() => createDynamicSlotState(initialCapacity));
  const slotFragments = useRef<DynamicBreakableFragment[]>([]);
  const writtenGeometry = useRef<BufferGeometry | null>(null);
  const geometry = useMemo(() => {
    const source = batch.geometryKind === "surfaceMesh"
      ? dynamicSurfaceMeshGeometry(batch.visualMesh!)
      : batch.geometryKind === "surfacePolygon"
        ? dynamicSurfacePolygonGeometry(batch.visualProfile!)
        : (
        batch.geometryKind === "cylinder"
        ? UNIT_CYLINDER
        : batch.geometryKind === "sphere"
          ? UNIT_SPHERE
        : batch.geometryKind === "foliage"
          ? UNIT_FOLIAGE_DEBRIS
          : UNIT_BOX
      );
    const next = batch.geometryKind === "surfaceMesh" ||
        batch.geometryKind === "surfacePolygon"
      ? source
      : source.clone();
    // xyz = stable world anchor, w = authored exterior weathering. Keeping
    // both values across the intact -> dynamic transition prevents painted,
    // mossy or moulded masonry from flashing back to plain grey on impact.
    const anchors = new Float32Array(capacity * 4);
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(anchors, 4, false),
    );
    // Moving debris gets neutral baked lighting (screen-space AO covers it);
    // without these attributes the shader would read zeros and go black.
    next.setAttribute(
      "bakedAoA",
      new InstancedBufferAttribute(
        new Float32Array(capacity * 4).fill(1),
        4,
        false,
      ),
    );
    next.setAttribute(
      "bakedAoB",
      new InstancedBufferAttribute(
        new Float32Array(capacity * 4).fill(1),
        4,
        false,
      ),
    );
    next.setAttribute(
      "bakedSkyExposure",
      new InstancedBufferAttribute(
        new Float32Array(capacity).fill(1),
        1,
        false,
      ),
    );
    // Exposed-face masks: interior seams of multi-box bodies carry no edge
    // decorations, only genuinely exposed faces do.
    const facePos = new Float32Array(capacity * 3);
    const faceNeg = new Float32Array(capacity * 3);
    next.setAttribute(
      "materialFaceMaskPos",
      new InstancedBufferAttribute(facePos, 3, false),
    );
    next.setAttribute(
      "materialFaceMaskNeg",
      new InstancedBufferAttribute(faceNeg, 3, false),
    );

    const bands = new Float32Array(capacity);
    const tints = new Float32Array(capacity * 3);
    next.setAttribute(
      "silicateJointBand",
      new InstancedBufferAttribute(bands, 1, false),
    );
    next.setAttribute(
      "silicateJointTint",
      new InstancedBufferAttribute(tints, 3, false),
    );
    return next;
  }, [
    batch.geometryKind,
    batch.visualMesh,
    batch.visualProfile,
    capacity,
  ]);
  const material = useMemo(() => {
    const base = getPieceMaterial(
      batch.material,
      batch.materialColor,
      batch.textureProfile,
    );
    const doubleSidedSurface = batch.geometryKind === "surfaceMesh" &&
      batch.visualMesh?.doubleSided !== false;
    if (
      !batch.treeBark &&
      batch.geometryKind !== "foliage" &&
      !doubleSidedSurface
    ) {
      return base;
    }
    const next = base.clone();
    if (batch.geometryKind === "foliage" || doubleSidedSurface) {
      next.side = DoubleSide;
    }
    if (batch.treeBark) {
      const baseCompile = base.onBeforeCompile;
      const baseProgramKey = base.customProgramCacheKey();
      const barkAtlas = treeBarkAtlas();
      next.onBeforeCompile = (compiled, renderer) => {
        baseCompile(compiled, renderer);
        compiled.uniforms.uTreeBarkAtlas = { value: barkAtlas };
        compiled.vertexShader = compiled.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec2 vTreeBarkUv;
varying float vTreeBarkSide;`,
          )
          .replace(
            "#include <beginnormal_vertex>",
            `#include <beginnormal_vertex>
vTreeBarkSide = 1.0 - smoothstep(0.55, 0.9, abs(objectNormal.y));`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vTreeBarkUv = uv;`,
          );
        compiled.fragmentShader = compiled.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform sampler2D uTreeBarkAtlas;
varying vec2 vTreeBarkUv;
varying float vTreeBarkSide;`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
float barkColumn = clamp(floor(vSilicateJointTint.x + 0.5), 0.0, 2.0);
float barkPadding = 0.006;
float barkU = fract(vTreeBarkUv.x + vSilicateJointTint.y * 0.73);
float atlasU = (
  barkColumn + barkPadding + barkU * (1.0 - barkPadding * 2.0)
) / 3.0;
vec3 barkAlbedo = texture2D(
  uTreeBarkAtlas,
  vec2(atlasU, clamp(vTreeBarkUv.y, 0.002, 0.998))
).rgb;
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  barkAlbedo,
  0.94 * clamp(vTreeBarkSide, 0.0, 1.0)
);`,
          );
      };
      next.customProgramCacheKey = () =>
        `${baseProgramKey}:dynamic-tree-bark-v1`;
    }
    return next;
  }, [
    batch.geometryKind,
    batch.material,
    batch.materialColor,
    batch.textureProfile,
    batch.treeBark,
    batch.visualMesh,
  ]);
  const instanceIds = useMemo<string[]>(() => [], []);
  const instanceKinds = useMemo<DynamicBreakableKind[]>(() => [], []);
  const dummy = useMemo(() => new Object3D(), []);
  const localCenter = useMemo(() => new Vector3(), []);
  const rotation = useMemo(() => new Quaternion(), []);
  const raycastBounds = useMemo(() => new Sphere(), []);
  const fragmentBounds = useMemo(() => new Sphere(), []);
  const sleepingSources = useRef(new Set<string>());
  const observedSleepStates = useRef(new Map<string, boolean>());
  const clusterRestPoses = useRef(new Map<string, ClusterRestPose>());
  const observedClusterMotion = useRef(new Map<string, boolean>());
  const boundsRebuildCountdown = useRef(RAYCAST_BOUNDS_REBUILD_FRAMES);
  const clusterObject = useCallback(
    (
      fragment: DynamicBreakableFragment,
      body: RapierRigidBody | undefined,
    ): {
      origin: readonly [number, number, number];
      object: Object3D;
    } | null => {
      if (
        !fragment.clusterId ||
        body?.bodyType() === rapier.RigidBodyType.Dynamic
      ) {
        return null;
      }
      const runtime = kinematicClusters?.current.get(fragment.clusterId);
      if (!runtime) {
        return null;
      }
      // Кусок носится кластером, пока он его член; обрубок — пока родитель не
      // отломан. У отломанного обрубка сразу рождается собственное
      // динамическое тело, поэтому «нет тела» и означает «ещё летит с
      // машиной».
      if (
        fragment.kind === "remnant"
          ? body !== undefined
          : !runtime.memberIds.has(
              fragment.clusterMemberId ?? fragment.sourceId,
            )
      ) {
        return null;
      }
      const object = rigidBodyStates.get(runtime.body.handle)?.object;
      return object
        ? { origin: runtime.definition.origin, object }
        : null;
    },
    [kinematicClusters, rapier, rigidBodyStates],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      if (
        batch.geometryKind === "foliage" ||
        batch.treeBark ||
        (batch.geometryKind === "surfaceMesh" &&
          batch.visualMesh?.doubleSided !== false)
      ) {
        material.dispose();
      }
    },
    [batch.geometryKind, batch.treeBark, batch.visualMesh, material],
  );

  useLayoutEffect(() => {
    const startedAt = performance.now();
    const current = mesh.current;
    if (!current) {
      return;
    }

    const incoming = new Map<string, DynamicBreakableFragment[]>();
    for (const fragment of batch.fragments) {
      const source = incoming.get(fragment.sourceId);
      if (source) source.push(fragment);
      else incoming.set(fragment.sourceId, [fragment]);
    }

    const changedSlots = new Set<number>();
    for (const sourceId of [...slots.slotsBySource.keys()]) {
      const nextFragments = incoming.get(sourceId);
      const occupied = slots.slotsBySource.get(sourceId) ?? [];
      if (nextFragments && nextFragments.length === occupied.length) {
        continue;
      }
      const removal = removeDynamicSlots(slots, sourceId);
      for (const move of removal.moves) {
        changedSlots.add(move.to);
      }
    }

    const previousRows = slotFragments.current;
    const nextRows = new Array<DynamicBreakableFragment>(slots.slotSources.length);
    for (const [sourceId, sourceFragments] of incoming) {
      let occupied = slots.slotsBySource.get(sourceId);
      if (!occupied) {
        const append = appendDynamicSlots(
          slots,
          sourceId,
          sourceFragments.length,
        );
        occupied = [...append.slots];
      }
      occupied.forEach((slot, index) => {
        const fragment = sourceFragments[index];
        nextRows[slot] = fragment;
        if (previousRows[slot] !== fragment) {
          changedSlots.add(slot);
        }
      });
    }
    // The fragment array is derived from the authoritative slot ledger on
    // every changed batch. This makes Fast Refresh and multi-source removals
    // unable to leave a sparse/stale row behind in the persistent GPU buffer.
    slotFragments.current = nextRows;

    if (slots.capacity > capacity) {
      setCapacity(slots.capacity);
      markActiveShotPerformance(
        "dynamic_batch_capacity_growth",
        performance.now() - startedAt,
        { previousCapacity: capacity, nextCapacity: slots.capacity },
      );
      return;
    }

    const fullRewrite = writtenGeometry.current !== geometry;
    const rows = nextRows;
    const rowsToWrite = fullRewrite
      ? rows.map((_, index) => index)
      // A later source removal in the same reconciliation may truncate a
      // slot that an earlier swap marked dirty. It no longer has a GPU row;
      // lowering mesh.count is the whole removal operation for that tail.
      : [...changedSlots].filter((index) => index < rows.length);
    const color = new Color();
    const tint = new Color();
    if (fullRewrite) {
      raycastBounds.makeEmpty();
      sleepingSources.current.clear();
    }
    rowsToWrite.forEach((index) => {
      const fragment = rows[index];
      writeFragmentAttributes(geometry, fragment, index, batch.treeBark, tint);
      const fragmentBody = bodies?.current?.get(fragment.sourceId);
      // Свежий обрубок летящей машины обязан появиться сразу в её позе, а не
      // мигнуть один кадр в авторской точке рождения.
      const carried = clusterObject(fragment, fragmentBody);
      if (carried) {
        setClusteredFragmentMatrix(
          dummy,
          fragment,
          carried.origin,
          carried.object,
          localCenter,
          rotation,
        );
      } else {
        setFragmentMatrix(
          dummy,
          fragment,
          fragmentBody,
          localCenter,
          rotation,
        );
      }
      current.setMatrixAt(index, dummy.matrix);
      if (!fullRewrite) {
        current.instanceMatrix.addUpdateRange(index * 16, 16);
      }
      expandFragmentBounds(
        raycastBounds,
        fragmentBounds,
        dummy,
        fragment,
      );
      current.setColorAt(
        index,
        color.set(
          fragment.materialColor === "#ffffff"
            ? fragment.color
            : "#ffffff",
        ),
      );
      if (!fullRewrite) {
        current.instanceColor?.addUpdateRange(index * 3, 3);
        markFragmentAttributesUpdated(geometry, index, 1);
      }
    });
    if (fullRewrite && rows.length > 0) {
      current.instanceMatrix.addUpdateRange(0, rows.length * 16);
      current.instanceColor?.addUpdateRange(0, rows.length * 3);
      markFragmentAttributesUpdated(geometry, 0, rows.length);
    }
    current.count = rows.length;
    instanceIds.length = rows.length;
    instanceKinds.length = rows.length;
    rows.forEach((fragment, index) => {
      instanceIds[index] = fragment.sourceId;
      instanceKinds[index] = fragment.kind;
    });
    current.instanceMatrix.setUsage(DynamicDrawUsage);
    if (rowsToWrite.length > 0) {
      current.instanceMatrix.needsUpdate = true;
    }
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    // InstancedMesh caches this sphere after its first raycast. Keep our own
    // conservative sphere instead: moving debris expands it incrementally, so
    // raycasts stay valid without an O(instance count) bounds rebuild per frame.
    current.boundingSphere = raycastBounds;
    writtenGeometry.current = geometry;
    markActiveShotPerformance(
      "dynamic_batch_gpu_publication",
      performance.now() - startedAt,
      {
        fragmentCount: rows.length,
        changedSlotCount: rowsToWrite.length,
        fullRewrite,
        geometryKind: batch.geometryKind,
        material: batch.material,
      },
    );
  }, [
    batch.fragments,
    batch.treeBark,
    bodies,
    capacity,
    clusterObject,
    dummy,
    fragmentBounds,
    geometry,
    instanceIds,
    instanceKinds,
    localCenter,
    raycastBounds,
    rotation,
    slots,
  ]);

  useFrame(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }

    let changed = false;
    let firstChangedSlot = Infinity;
    let lastChangedSlot = -1;
    const sleepStates = observedSleepStates.current;
    sleepStates.clear();
    const clusterMotion = observedClusterMotion.current;
    clusterMotion.clear();
    slotFragments.current.forEach((fragment, index) => {
      const body = bodies?.current?.get(fragment.sourceId);
      const clustered = clusterObject(fragment, body);
      if (!body && !clustered) {
        return;
      }
      if (clustered) {
        // Несомый кусок «спит» вместе со своим кластером: пока поза
        // носителя не сдвинулась заметнее допуска, матрицу не переписываем.
        const clusterId = fragment.clusterId ?? "";
        let moved = clusterMotion.get(clusterId);
        if (moved === undefined) {
          moved = clusterPoseChanged(
            clusterRestPoses.current,
            clusterId,
            clustered.object,
          );
          clusterMotion.set(clusterId, moved);
        }
        if (!moved) {
          return;
        }
        setClusteredFragmentMatrix(
          dummy,
          fragment,
          clustered.origin,
          clustered.object,
          localCenter,
          rotation,
        );
        current.setMatrixAt(index, dummy.matrix);
        firstChangedSlot = Math.min(firstChangedSlot, index);
        lastChangedSlot = Math.max(lastChangedSlot, index);
        expandFragmentBounds(
          raycastBounds,
          fragmentBounds,
          dummy,
          fragment,
        );
        changed = true;
        return;
      }
      if (!body) {
        return;
      }
      let sleeping = sleepStates.get(fragment.sourceId);
      if (sleeping === undefined) {
        sleeping = body.isSleeping();
        sleepStates.set(fragment.sourceId, sleeping);
      }
      // Copy the pose once on the awake -> sleeping transition. The sleep
      // manager may stop a body before this renderer's frame callback runs;
      // skipping that transition left the visible fragment at its prior pose.
      if (sleeping && sleepingSources.current.has(fragment.sourceId)) {
        return;
      }
      setFragmentMatrix(
        dummy,
        fragment,
        body,
        localCenter,
        rotation,
      );
      current.setMatrixAt(index, dummy.matrix);
      firstChangedSlot = Math.min(firstChangedSlot, index);
      lastChangedSlot = Math.max(lastChangedSlot, index);
      expandFragmentBounds(
        raycastBounds,
        fragmentBounds,
        dummy,
        fragment,
      );
      changed = true;
    });

    sleepingSources.current.clear();
    for (const [sourceId, sleeping] of sleepStates) {
      if (sleeping) {
        sleepingSources.current.add(sourceId);
      }
    }

    // Инкрементальный union только расширяет сферу; периодически собираем её
    // заново по фактическим матрицам (позиция — элементы 12..14), чтобы после
    // перелёта носителя рейкасты не проверяли пол-маршрута. Спящие фрагменты
    // при этом учитываются: их матрицы уже лежат в буфере.
    boundsRebuildCountdown.current -= 1;
    if (boundsRebuildCountdown.current <= 0) {
      boundsRebuildCountdown.current = RAYCAST_BOUNDS_REBUILD_FRAMES;
      const matrices = current.instanceMatrix.array;
      raycastBounds.makeEmpty();
      slotFragments.current.forEach((fragment, index) => {
        const base = index * 16;
        fragmentBounds.center.set(
          matrices[base + 12],
          matrices[base + 13],
          matrices[base + 14],
        );
        const expansion = fragment.sizeExpansion;
        fragmentBounds.radius =
          Math.hypot(
            fragment.size[0] + expansion,
            fragment.size[1] + expansion,
            fragment.size[2] + expansion,
          ) / 2;
        raycastBounds.union(fragmentBounds);
      });
    }

    if (changed) {
      current.instanceMatrix.addUpdateRange(
        firstChangedSlot * 16,
        (lastChangedSlot - firstChangedSlot + 1) * 16,
      );
      current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, capacity]}
      castShadow={false}
      receiveShadow
      frustumCulled
      userData={{
        breakableInstanceIds: instanceIds,
        breakableInstanceKinds: instanceKinds,
        breakableMaterial: batch.material,
      }}
    />
  );
});

export const DynamicBreakableWorld = memo(function DynamicBreakableWorld({
  pieces,
  shards,
  remnants,
  bodies,
  kinematicClusters,
}: {
  pieces: readonly BreakablePieceDefinition[];
  shards: readonly ShardDefinition[];
  remnants: readonly RemnantDefinition[];
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  kinematicClusters?: CompoundKinematicClusterRegistry;
}) {
  const fragments = useMemo(
    () => sourceFragments(pieces, shards, remnants),
    [pieces, remnants, shards],
  );
  // Батч с прежним составом фрагментов сохраняет прежнюю identity: memo-
  // компонент ниже его даже не ре-рендерит, и геометрия с восемью
  // инстанс-атрибутами не пересоздаётся. Раньше один carve пересобирал ВСЕ
  // батчи мира. Состав сравнивается по ссылкам — фрагменты стабильны
  // благодаря кэшу по объекту-источнику выше. Контейнер кэша — useState, а
  // не ref: чтение ref в рендере запрещено строгим react-hooks линтом.
  const [batchCache] = useState(
    () => new Map<string, DynamicBreakableBatch>(),
  );
  const batches = useMemo(() => {
    const rebuilt = buildBatches(fragments);
    const next = rebuilt.map((batch) => {
      const previous = batchCache.get(batch.id);
      if (
        previous &&
        previous.fragments.length === batch.fragments.length &&
        previous.fragments.every(
          (fragment, index) => fragment === batch.fragments[index],
        )
      ) {
        return previous;
      }
      batchCache.set(batch.id, batch);
      return batch;
    });
    // Исчезнувший батч не должен воскреснуть со старым составом.
    if (batchCache.size > next.length) {
      const liveIds = new Set(next.map((batch) => batch.id));
      for (const id of [...batchCache.keys()]) {
        if (!liveIds.has(id)) {
          batchCache.delete(id);
        }
      }
    }
    return next;
  }, [batchCache, fragments]);

  return (
    <>
      {batches.map((batch) => (
        <DynamicBreakableBatch
          key={batch.id}
          batch={batch}
          bodies={bodies}
          kinematicClusters={kinematicClusters}
        />
      ))}
    </>
  );
});
