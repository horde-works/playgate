/**
 * ПОДВИЖНЫЙ БАТЧ НОСИТЕЛЯ: куски машины одним draw на материал.
 *
 * Паспорт — docs/carrier-batched-render.md. До этого модуля каждый целый
 * член compound-кластера рисовался в динамическом пути отдельным
 * InstancedMesh на уникальную сетку: один DC-3 стоил 532 draw при 22 у всего
 * остального острова. Здесь те же куски идут материальным батчером статики
 * (BatchedMesh, инстанс = кусок), а поза пишется покадрово тем же законом,
 * которым их двигал динамический путь.
 *
 * Закон позы — перенос `setClusteredFragmentMatrix` с центром фрагмента = 0:
 * у батча инстанс несёт ЦЕЛЬНУЮ геометрию куска в его локальной раме, поэтому
 * якорь артикуляции — собственное начало куска, ровно как у фрагментов
 * (fallbackPosition). Числа допусков гейта — те же, что в динамическом пути.
 */

import { Euler, Object3D, Quaternion, Vector3 } from "three";
import type { BreakablePieceDefinition } from "./destructionScene.ts";
import {
  compoundMemberNeedsIndividualBody,
  type CompoundKinematicClusterDefinition,
} from "./compoundKinematicCluster.ts";
import type { MemberArticulation } from "./clusterMemberArticulation.ts";
import { isVehicleFramePiece } from "./vehicleFrames.ts";

/** Допуски гейта — копия динамического пути: тонкая рябь позы не пишет матриц. */
export const CARRIER_POSITION_EPSILON = 1e-5;
export const CARRIER_QUATERNION_EPSILON = 1e-6;

/**
 * Кусок едет в батче носителя, только если его поза ЦЕЛИКОМ принадлежит
 * кластеру: без петли (створки живут своим механизмом), без собственного
 * тела позы (артикулированные стойки), не actor-only, не cinderBlock, не
 * mutable. Сломанность сюда не входит нарочно: список батча стабилен на всю
 * сессию, слом гасит инстанс, а не пересобирает геометрию.
 */
export function carrierBatchEligible(
  piece: BreakablePieceDefinition,
  compoundDefinition: CompoundKinematicClusterDefinition | undefined,
  mutablePieceIds: ReadonlySet<string>,
): boolean {
  if (!compoundDefinition) return false;
  if (piece.hinge) return false;
  if (piece.intactCollisionRole === "actor-only") return false;
  if (piece.shape === "cinderBlock") return false;
  if (mutablePieceIds.has(piece.id)) return false;
  if (compoundMemberNeedsIndividualBody(compoundDefinition, piece, false)) {
    return false;
  }
  return true;
}

const restEuler = new Euler();
const restQuaternion = new Quaternion();
const articulationEuler = new Euler();
const articulationQuaternion = new Quaternion();
const articulationAxis = new Vector3();
const memberOffset = new Vector3();

/**
 * Мировая матрица целого члена носителя.
 *
 * pos = clusterPos + R(clusterQ)·(rest − origin + slide);
 * quat = clusterQ · A · restQ; scale — авторский размер куска. `A` —
 * артикуляция вокруг собственного начала куска (steer/spin в осях куска,
 * turn — вокруг чужой оси в осях кластера), тем же порядком premultiply,
 * что в динамическом пути.
 */
export function writeCarrierMemberMatrix(
  target: Object3D,
  piece: BreakablePieceDefinition,
  clusterOrigin: readonly [number, number, number],
  clusterPosition: { readonly x: number; readonly y: number; readonly z: number },
  clusterQuaternion: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  },
  articulation: MemberArticulation | undefined,
): void {
  const rotation = piece.rotation;
  restEuler.set(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0);
  const ownRotation = restQuaternion.setFromEuler(restEuler);
  if (articulation) {
    articulationEuler.set(0, articulation.steer, articulation.spin, "YZX");
    ownRotation.premultiply(
      articulationQuaternion.setFromEuler(articulationEuler),
    );
    if (articulation.turn) {
      articulationAxis.set(...articulation.turn.axis);
      ownRotation.premultiply(
        articulationQuaternion.setFromAxisAngle(
          articulationAxis,
          articulation.turn.angle,
        ),
      );
    }
  }
  const slide = articulation?.slide;
  memberOffset.set(
    piece.position[0] - clusterOrigin[0] + (slide?.[0] ?? 0),
    piece.position[1] - clusterOrigin[1] + (slide?.[1] ?? 0),
    piece.position[2] - clusterOrigin[2] + (slide?.[2] ?? 0),
  );
  target.quaternion.set(
    clusterQuaternion.x,
    clusterQuaternion.y,
    clusterQuaternion.z,
    clusterQuaternion.w,
  );
  memberOffset.applyQuaternion(target.quaternion);
  target.position.set(
    clusterPosition.x + memberOffset.x,
    clusterPosition.y + memberOffset.y,
    clusterPosition.z + memberOffset.z,
  );
  target.quaternion.multiply(ownRotation);
  target.scale.set(piece.size[0], piece.size[1], piece.size[2]);
  target.updateMatrix();
}

export interface CarrierPoseCacheEntry {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

/**
 * Сдвинулась ли поза носителя заметнее допуска. Первый вызов всегда «да»:
 * батч рождается в позе покоя и обязан однажды переехать в живую.
 */
export function carrierPoseAdvanced(
  cache: Map<string, CarrierPoseCacheEntry>,
  clusterId: string,
  position: { readonly x: number; readonly y: number; readonly z: number },
  quaternion: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  },
): boolean {
  const cached = cache.get(clusterId);
  if (!cached) {
    cache.set(clusterId, {
      position: new Vector3(position.x, position.y, position.z),
      quaternion: new Quaternion(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      ),
    });
    return true;
  }
  const moved =
    Math.abs(position.x - cached.position.x) > CARRIER_POSITION_EPSILON ||
    Math.abs(position.y - cached.position.y) > CARRIER_POSITION_EPSILON ||
    Math.abs(position.z - cached.position.z) > CARRIER_POSITION_EPSILON ||
    Math.abs(quaternion.x - cached.quaternion.x) > CARRIER_QUATERNION_EPSILON ||
    Math.abs(quaternion.y - cached.quaternion.y) > CARRIER_QUATERNION_EPSILON ||
    Math.abs(quaternion.z - cached.quaternion.z) > CARRIER_QUATERNION_EPSILON ||
    Math.abs(quaternion.w - cached.quaternion.w) > CARRIER_QUATERNION_EPSILON;
  if (moved) {
    cached.position.set(position.x, position.y, position.z);
    cached.quaternion.set(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    );
  }
  return moved;
}

/**
 * Радиус сферы носителя вокруг его текущей позы: максимум |rest − origin| по
 * кускам плюс полудиагональ самого куска. Считается один раз на кластер;
 * покадровая сфера рейкаста — поза кластера + этот радиус.
 */
export function carrierClusterRadius(
  pieces: readonly BreakablePieceDefinition[],
  origin: readonly [number, number, number],
): number {
  let radius = 0;
  for (const piece of pieces) {
    const dx = piece.position[0] - origin[0];
    const dy = piece.position[1] - origin[1];
    const dz = piece.position[2] - origin[2];
    const halfDiagonal =
      Math.hypot(piece.size[0], piece.size[1], piece.size[2]) / 2;
    radius = Math.max(radius, Math.hypot(dx, dy, dz) + halfDiagonal);
  }
  return radius;
}

export interface BreakableRenderSplit {
  /** Куски, погашенные в статическом мире (как раньше, плюс батч-носители). */
  readonly hiddenPieceIds: ReadonlySet<string>;
  /** Динамические визуалы — прежний путь, минус целые члены носителей. */
  readonly bodyPieces: readonly BreakablePieceDefinition[];
  /** Куски, которым нужен собственный RigidBody, — без изменений. */
  readonly physicalBodyPieces: readonly BreakablePieceDefinition[];
  /** Целые члены носителей: рисуются подвижным батчем. */
  readonly carrierBatchedPieces: readonly BreakablePieceDefinition[];
}

/**
 * Развод кусков по рендерам — вынесенное решение из `BreakableObjects`
 * (MakeAMessGame), один в один, плюс четвёртый выход: целые члены
 * compound-носителей уходят в подвижный батч вместо динамических визуалов.
 * Сломанный член батча идёт прежней дорогой: dynamicVisuals + тело.
 */
export function splitBreakableRenderPieces(input: {
  readonly pieces: readonly BreakablePieceDefinition[];
  readonly brokenPieces: ReadonlySet<string>;
  readonly shatteredPieces: ReadonlySet<string>;
  readonly kinematicClusterDefinitions: readonly CompoundKinematicClusterDefinition[];
  readonly mutablePieceIds: ReadonlySet<string>;
  readonly presentBrokenPiece: (
    piece: BreakablePieceDefinition,
  ) => BreakablePieceDefinition;
  readonly memberNeedsIndividualBody: (
    definition: CompoundKinematicClusterDefinition,
    piece: BreakablePieceDefinition,
    broken: boolean,
  ) => boolean;
}): BreakableRenderSplit {
  const hidden = new Set<string>();
  const dynamicVisuals: BreakablePieceDefinition[] = [];
  const physicalBodies: BreakablePieceDefinition[] = [];
  const carrierBatched: BreakablePieceDefinition[] = [];
  const compoundDefinitionByCluster = new Map(
    input.kinematicClusterDefinitions.map(
      (definition) => [definition.clusterId, definition] as const,
    ),
  );
  for (const piece of input.pieces) {
    if (input.shatteredPieces.has(piece.id)) {
      hidden.add(piece.id);
      continue;
    }
    const compoundDefinition = compoundDefinitionByCluster.get(piece.clusterId);
    const broken = input.brokenPieces.has(piece.id);
    if (
      broken ||
      piece.hinge ||
      piece.intactCollisionRole === "actor-only" ||
      isVehicleFramePiece(piece) ||
      compoundDefinition !== undefined ||
      piece.shape === "cinderBlock"
    ) {
      hidden.add(piece.id);
      if (
        !broken &&
        carrierBatchEligible(piece, compoundDefinition, input.mutablePieceIds)
      ) {
        carrierBatched.push(piece);
        continue;
      }
      const visualPiece = broken ? input.presentBrokenPiece(piece) : piece;
      dynamicVisuals.push(visualPiece);
      if (
        !compoundDefinition ||
        input.memberNeedsIndividualBody(compoundDefinition, piece, broken)
      ) {
        physicalBodies.push(visualPiece);
      }
    }
  }
  return {
    hiddenPieceIds: hidden,
    bodyPieces: dynamicVisuals,
    physicalBodyPieces: physicalBodies,
    carrierBatchedPieces: carrierBatched,
  };
}
