"use client";

import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Object3D, Sphere, Vector3 } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import type { BreakablePieceDefinition } from "./destructionScene";
import {
  applyHiddenPieceDiff,
  buildIntactMaterialBatches,
  type IntactMaterialBatch,
} from "./intactWorldBatching";
import {
  createIntactMaterialBatchedMesh,
  disposeIntactBatchedMesh,
  type IntactBatchedMeshBundle,
} from "./intactMaterialBatchedMesh";
import { WorldLightingBake } from "./worldLightingBake";
import {
  compoundClusterCarriesPieceVisual,
  type CompoundKinematicClusterRuntime,
} from "./compoundKinematicCluster";
import {
  getMemberArticulation,
  hasMemberArticulations,
} from "./clusterMemberArticulation";
import {
  carrierClusterRadius,
  carrierPoseAdvanced,
  writeCarrierMemberMatrix,
  type CarrierPoseCacheEntry,
} from "./vehicleClusterBatches";

/**
 * ПОДВИЖНЫЙ БАТЧ НОСИТЕЛЯ (паспорт — docs/carrier-batched-render.md).
 *
 * Целые члены compound-кластеров рисуются теми же материальными батчами, что
 * статический мир: один BatchedMesh на материал, инстанс = кусок. Поза куска
 * пишется покадрово законом динамического пути; слом гасит инстанс и не
 * трогает геометрию. Пока runtime кластера не зарегистрирован, куски стоят в
 * авторской позе покоя — машина видима с первого кадра сцены.
 */
export function VehicleClusterBatchedWorld({
  pieces,
  hiddenPieceIds,
  kinematicClusters,
  bodies,
}: {
  pieces: readonly BreakablePieceDefinition[];
  /** Сломанные и рассыпанные куски: гасятся в батче, рисуются динамикой. */
  hiddenPieceIds: ReadonlySet<string>;
  kinematicClusters: MutableRefObject<
    Map<string, CompoundKinematicClusterRuntime>
  >;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
}) {
  const batches = useMemo(
    () =>
      buildIntactMaterialBatches(pieces).map((batch) => ({
        ...batch,
        id: `carrier:${batch.id}`,
      })),
    [pieces],
  );
  // Запечка мировой AO кускам носителя не положена (паритет с динамическим
  // путём): пустой пекарь оставляет атрибуты в «неокклюжено».
  const lighting = useMemo(() => new WorldLightingBake([]), []);
  return (
    <>
      {batches.map((batch) => (
        <CarrierMaterialBatch
          key={batch.id}
          batch={batch}
          lighting={lighting}
          hiddenPieceIds={hiddenPieceIds}
          kinematicClusters={kinematicClusters}
          bodies={bodies}
        />
      ))}
    </>
  );
}

function CarrierMaterialBatch({
  batch,
  lighting,
  hiddenPieceIds,
  kinematicClusters,
  bodies,
}: {
  batch: IntactMaterialBatch;
  lighting: WorldLightingBake;
  hiddenPieceIds: ReadonlySet<string>;
  kinematicClusters: MutableRefObject<
    Map<string, CompoundKinematicClusterRuntime>
  >;
  bodies: MutableRefObject<Map<string, RapierRigidBody>>;
}) {
  const { rigidBodyStates } = useRapier();
  const [bundle, setBundle] = useState<IntactBatchedMeshBundle | null>(null);
  const appliedHidden = useRef(new Set<string>());
  const runtimeHidden = useRef<boolean[]>([]);
  const poseCache = useRef(new Map<string, CarrierPoseCacheEntry>());
  const transform = useMemo(() => new Object3D(), []);
  const bounds = useMemo(() => new Sphere(), []);
  const clusterCentre = useMemo(() => new Vector3(), []);
  const clusterBounds = useMemo(() => new Sphere(), []);

  const clusterInfo = useMemo(() => {
    const byCluster = new Map<
      string,
      { piece: BreakablePieceDefinition; index: number }[]
    >();
    batch.pieces.forEach((piece, index) => {
      const list = byCluster.get(piece.clusterId);
      const entry = { piece, index };
      if (list) list.push(entry);
      else byCluster.set(piece.clusterId, [entry]);
    });
    return byCluster;
  }, [batch.pieces]);

  useLayoutEffect(() => {
    const next = createIntactMaterialBatchedMesh(batch, lighting);
    // Носитель летает: сфера покоя целого меша врёт, наружный отсев выключен,
    // пер-инстансный остаётся. Сфера рейкаста ведётся покадрово по позам.
    next.mesh.frustumCulled = false;
    appliedHidden.current = new Set();
    runtimeHidden.current = new Array(batch.pieces.length).fill(false);
    poseCache.current = new Map();
    setBundle(next);
    return () => {
      disposeIntactBatchedMesh(next);
    };
  }, [batch, lighting]);

  useLayoutEffect(() => {
    if (!bundle) return;
    const { hide, restore } = applyHiddenPieceDiff(
      batch.pieces,
      appliedHidden.current,
      hiddenPieceIds,
    );
    for (const index of hide) bundle.mesh.setVisibleAt(index, false);
    for (const index of restore) bundle.mesh.setVisibleAt(index, true);
  }, [batch.pieces, bundle, hiddenPieceIds]);

  useFrame(() => {
    if (!bundle) return;
    const mesh = bundle.mesh;
    const articulationsLive = hasMemberArticulations();
    let boundsWritten = false;
    for (const [clusterId, clusterPieces] of clusterInfo) {
      const runtime = kinematicClusters.current.get(clusterId);
      const poseObject = runtime
        ? rigidBodyStates.get(runtime.body.handle)?.object
        : undefined;
      if (!runtime || !poseObject) {
        // Реестра ещё (или уже) нет — куски стоят в авторской позе покоя,
        // которую записал создатель батча. Прятать их нельзя: «физика жива,
        // пикселей нет» — ровно класс, который этот путь закрывает.
        continue;
      }
      const moved = carrierPoseAdvanced(
        poseCache.current,
        clusterId,
        poseObject.position,
        poseObject.quaternion,
      );
      for (const { piece, index } of clusterPieces) {
        const carried = compoundClusterCarriesPieceVisual({
          pieceId: piece.id,
          memberIds: runtime.memberIds,
          attachedMemberIds: runtime.attachedMemberIds,
          bodyEnabled: bodies.current.get(piece.id)?.isEnabled(),
        });
        const wasRuntimeHidden = runtimeHidden.current[index];
        if (!carried) {
          // Оторван на лету: инстанс гаснет до React-прохода со сломом,
          // иначе кадр-другой кусок рисуется и батчем, и обломком.
          if (!wasRuntimeHidden && !appliedHidden.current.has(piece.id)) {
            mesh.setVisibleAt(index, false);
          }
          runtimeHidden.current[index] = true;
          continue;
        }
        if (wasRuntimeHidden) {
          runtimeHidden.current[index] = false;
          if (!appliedHidden.current.has(piece.id)) {
            mesh.setVisibleAt(index, true);
          }
        }
        const articulation = articulationsLive
          ? getMemberArticulation(piece.id)
          : undefined;
        if (!moved && !articulation && !wasRuntimeHidden) {
          continue;
        }
        writeCarrierMemberMatrix(
          transform,
          piece,
          runtime.definition.origin,
          poseObject.position,
          poseObject.quaternion,
          articulation,
        );
        mesh.setMatrixAt(index, transform.matrix);
      }
      clusterCentre.set(
        poseObject.position.x,
        poseObject.position.y,
        poseObject.position.z,
      );
      clusterBounds.set(
        clusterCentre,
        carrierRadius(clusterId, clusterPieces, runtime),
      );
      if (boundsWritten) {
        bounds.union(clusterBounds);
      } else {
        bounds.copy(clusterBounds);
        boundsWritten = true;
      }
    }
    if (boundsWritten) {
      mesh.boundingSphere = bounds;
    }
  });

  const radiusCache = useRef(new Map<string, number>());
  function carrierRadius(
    clusterId: string,
    clusterPieces: readonly { piece: BreakablePieceDefinition; index: number }[],
    runtime: CompoundKinematicClusterRuntime,
  ): number {
    const cached = radiusCache.current.get(clusterId);
    if (cached !== undefined) return cached;
    const radius = carrierClusterRadius(
      clusterPieces.map((entry) => entry.piece),
      runtime.definition.origin,
    );
    radiusCache.current.set(clusterId, radius);
    return radius;
  }

  if (!bundle) return null;
  return <primitive object={bundle.mesh} />;
}
