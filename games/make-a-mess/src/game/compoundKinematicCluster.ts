import type { RapierRigidBody } from "@react-three/rapier";
import type { MutableRefObject } from "react";
import type { Group } from "three";
import type { ActivePhysicalContactRegistry } from "./vehiclePhysicalContact.ts";
import { getPieceRenderBoxes } from "./breakableGeometry.ts";
import {
  materialRuntimeProfiles,
  type BreakablePieceDefinition,
  type SceneVector3,
} from "./destructionScene.ts";
import {
  applyMatrix,
  conjugateQuaternion,
  eulerFromQuaternion,
  multiplyQuaternions,
  quaternionFromEuler,
  rotateVector,
  rotationMatrixFromEuler,
  type Quaternion,
} from "./clusterDynamics.ts";

/** The simulation clock shared by every controller that feeds Rapier. */
export const PHYSICS_TIME_STEP = 1 / 60;

/**
 * Minimal contract for any authored object which moves as one rigid frame.
 * Route, engine and autopilot policy deliberately do not belong here.
 */
export interface CompoundKinematicClusterDefinition {
  readonly id: string;
  readonly clusterId: string;
  readonly origin: SceneVector3;
  /** Articulated members keep their own contact body inside the moving frame. */
  readonly independentMemberMatches?: readonly string[];
  /**
   * Optional structural contact envelope. Every intact member still follows
   * the frame visually, but decorative detail need not become a Rapier shape.
   */
  readonly contactMemberMatches?: readonly string[];
  /**
   * Members intentionally inside a hollow berth or mechanism proxy. The
   * surrounding hull remains physical; only the inserted fitting is omitted
   * from the carrier's outer contact envelope.
   */
  readonly contactMemberExcludes?: readonly string[];
  /** Visible, non-contact proximity equipment carried by the rigid frame. */
  readonly proximitySensors?: readonly {
    readonly point: SceneVector3;
    readonly normal: SceneVector3;
    readonly enabledByDefault?: boolean;
  }[];
}

export interface CompoundKinematicClusterRuntime {
  readonly definition: CompoundKinematicClusterDefinition;
  readonly body: RapierRigidBody;
  /** Visual attachments inherit the exact rendered transform of the body. */
  readonly visualRoot: Group;
  /** Intact members whose rendered pose is owned by the compound frame. */
  readonly memberIds: ReadonlySet<string>;
  /** Intact attachments, including articulated members with their own body. */
  readonly attachedMemberIds: ReadonlySet<string>;
  /** Only collider pairs currently touching this carrier. */
  readonly activePhysicalContacts: ActivePhysicalContactRegistry;
}

export type CompoundKinematicClusterRegistry = MutableRefObject<
  Map<string, CompoundKinematicClusterRuntime>
>;

/** Momentum waiting for a custom-integrated compound carrier. */
export interface CompoundKinematicImpulse {
  readonly impulse: SceneVector3;
  readonly point: SceneVector3;
}

export type CompoundKinematicImpulseRegistry = MutableRefObject<
  Map<string, CompoundKinematicImpulse[]>
>;

export function queueCompoundKinematicImpulse(
  registry: CompoundKinematicImpulseRegistry,
  clusterId: string,
  applied: CompoundKinematicImpulse,
): void {
  const pending = registry.current.get(clusterId);
  if (pending) {
    pending.push(applied);
  } else {
    registry.current.set(clusterId, [applied]);
  }
}

/**
 * ТЕКУЩАЯ ПОЗА КЛАСТЕРА КАК СИСТЕМА КООРДИНАТ.
 *
 * Все куски кластера авторятся в мировых координатах его места рождения
 * («авторская система»). Пока кластер целиком движется твёрдым телом, его
 * авторская система жива: авторская точка p видна в мире как
 * `T + R·(p − origin)`, где (T, R) — поза тела Rapier, а origin — авторская
 * точка привязки тела. Урон члену кластера судится ИМЕННО в авторской
 * системе: точка удара переводится сюда, воксельная сетка члена честна в
 * любой позе, а стоящая машина — частный случай T=origin, R=1.
 */
export interface CompoundClusterWorldTransform {
  readonly position: SceneVector3;
  readonly rotation: Quaternion;
}

export function compoundClusterWorldTransform(
  body: Pick<RapierRigidBody, "translation" | "rotation">,
): CompoundClusterWorldTransform {
  const translation = body.translation();
  const rotation = body.rotation();
  return {
    position: [translation.x, translation.y, translation.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
  };
}

export function compoundClusterPointToWorld(
  origin: SceneVector3,
  transform: CompoundClusterWorldTransform,
  point: SceneVector3,
): SceneVector3 {
  const turned = rotateVector(transform.rotation, [
    point[0] - origin[0],
    point[1] - origin[1],
    point[2] - origin[2],
  ]);
  return [
    transform.position[0] + turned[0],
    transform.position[1] + turned[1],
    transform.position[2] + turned[2],
  ];
}

export function compoundClusterPointToLocal(
  origin: SceneVector3,
  transform: CompoundClusterWorldTransform,
  world: SceneVector3,
): SceneVector3 {
  const turned = rotateVector(conjugateQuaternion(transform.rotation), [
    world[0] - transform.position[0],
    world[1] - transform.position[1],
    world[2] - transform.position[2],
  ]);
  return [origin[0] + turned[0], origin[1] + turned[1], origin[2] + turned[2]];
}

/** Мировая поза члена кластера: авторская поза, прокачанная позой тела. */
export function compoundMemberWorldPose(
  origin: SceneVector3,
  transform: CompoundClusterWorldTransform,
  authoredPosition: SceneVector3,
  authoredRotation: SceneVector3 | undefined,
): { readonly position: SceneVector3; readonly quaternion: Quaternion } {
  return {
    position: compoundClusterPointToWorld(origin, transform, authoredPosition),
    quaternion: multiplyQuaternions(
      transform.rotation,
      quaternionFromEuler(authoredRotation ?? [0, 0, 0]),
    ),
  };
}

/**
 * Скорость мировой точки, принадлежащей телу кластера: то, что наследуют
 * стружка, осколки и отделившиеся обрубки, рождённые в этой точке.
 */
export function compoundClusterPointWorldVelocity(
  body: Pick<RapierRigidBody, "linvel" | "angvel" | "worldCom">,
  worldPoint: SceneVector3,
): SceneVector3 {
  const linear = body.linvel();
  const angular = body.angvel();
  const centre = body.worldCom();
  const lever: SceneVector3 = [
    worldPoint[0] - centre.x,
    worldPoint[1] - centre.y,
    worldPoint[2] - centre.z,
  ];
  return [
    linear.x + angular.y * lever[2] - angular.z * lever[1],
    linear.y + angular.z * lever[0] - angular.x * lever[2],
    linear.z + angular.x * lever[1] - angular.y * lever[0],
  ];
}

/**
 * Обрубок члена кластера: результат carve, живущий в авторской системе
 * кластера и продолжающий быть его частью, пока родитель не отломан.
 */
export interface CompoundMemberRemnantShape {
  readonly id: string;
  readonly parentId: string;
  readonly material: BreakablePieceDefinition["material"];
  readonly position: SceneVector3;
  readonly quaternion: Quaternion;
  readonly size: readonly [number, number, number];
  readonly boxes?: readonly {
    readonly center: SceneVector3;
    readonly size: readonly [number, number, number];
  }[];
}

export interface CompoundClusterColliderDefinition {
  readonly id: string;
  readonly sourceId: string;
  readonly shape: "cuboid" | "sphere" | "cylinder";
  readonly position: SceneVector3;
  readonly rotation: SceneVector3;
  readonly args:
    | readonly [number, number, number]
    | readonly [number, number]
    | readonly [number];
  readonly friction: number;
  readonly restitution: number;
}

export function compoundClusterOwnsPiece(
  cluster: CompoundKinematicClusterDefinition,
  piece: BreakablePieceDefinition,
): boolean {
  return (
    piece.clusterId === cluster.clusterId &&
    !piece.hinge &&
    !(cluster.independentMemberMatches ?? []).some((match) =>
      piece.id.includes(match),
    )
  );
}

/**
 * Only articulated or independently animated members need their own pose
 * body while intact. Every ordinary member is rendered by the carrier and
 * materialises its individual dynamic body only when it breaks away.
 */
export function compoundMemberNeedsPoseBody(
  cluster: CompoundKinematicClusterDefinition,
  piece: BreakablePieceDefinition,
): boolean {
  return !compoundClusterOwnsPiece(cluster, piece);
}

/**
 * Ordinary intact members need no individual Rapier body at all: the carrier
 * owns their contact shape and rendered pose. A body is materialised only for
 * an articulated attachment or for a member which has actually detached.
 */
export function compoundMemberNeedsIndividualBody(
  cluster: CompoundKinematicClusterDefinition,
  piece: BreakablePieceDefinition,
  detached: boolean,
): boolean {
  return detached || compoundMemberNeedsPoseBody(cluster, piece);
}

/**
 * Selects the single pose writer for an articulated cluster member.
 * The carrier locks hinges while underway and carries them as ordinary
 * cluster visuals (own Rapier body disabled). At a dock the independent
 * door mechanism owns the body again. Never follow the hull with
 * `setNextKinematicTranslation`: that lags a frame and jitters.
 */
export function compoundCarrierOwnsMemberPose(
  piece: BreakablePieceDefinition,
  independentMechanismActive: boolean,
): boolean {
  return !piece.hinge || !independentMechanismActive;
}

/**
 * Render path for a fragment of a moving cluster. Ordinary members have no
 * body and live in `memberIds`. A locked hinge stays in `attachedMemberIds`
 * with its own body disabled, so the renderer parents it to the hull pose
 * instead of interpolating a second kinematic.
 */
export function compoundClusterCarriesPieceVisual(input: {
  readonly pieceId: string;
  readonly memberIds: ReadonlySet<string>;
  readonly attachedMemberIds: ReadonlySet<string>;
  readonly bodyEnabled?: boolean;
}): boolean {
  if (input.memberIds.has(input.pieceId)) return true;
  return input.attachedMemberIds.has(input.pieceId) && input.bodyEnabled === false;
}

const EMPTY_PIECE_ID_SET: ReadonlySet<string> = new Set();

/** Один и тот же закон трения/упругости для куска и его обрубка. */
function memberContactSurface(
  material: BreakablePieceDefinition["material"],
): { readonly friction: number; readonly restitution: number } {
  return {
    friction: material === "wood" ? 0.66 : 0.84,
    restitution: materialRuntimeProfiles[material].restitution,
  };
}

function memberAcceptsContact(
  cluster: CompoundKinematicClusterDefinition,
  piece: BreakablePieceDefinition,
): boolean {
  return (
    compoundClusterOwnsPiece(cluster, piece) &&
    (!cluster.contactMemberMatches ||
      cluster.contactMemberMatches.some((match) => piece.id.includes(match))) &&
    !cluster.contactMemberExcludes?.some((match) => piece.id.includes(match))
  );
}

/**
 * Builds one compound contact shape from all intact members. A removed member
 * simply disappears from the compound; its detached rigid body can then take
 * over without leaving a duplicate contact surface behind. A CARVED member is
 * replaced by its remnants: the hole is real for contacts too, and the
 * surviving stumps keep flying as part of the same rigid frame.
 */
export function compoundClusterColliders(
  cluster: CompoundKinematicClusterDefinition,
  pieces: readonly BreakablePieceDefinition[],
  brokenPieces: ReadonlySet<string>,
  consumedPieces: ReadonlySet<string> = EMPTY_PIECE_ID_SET,
  memberRemnants: readonly CompoundMemberRemnantShape[] = [],
): readonly CompoundClusterColliderDefinition[] {
  const colliders: CompoundClusterColliderDefinition[] = [];
  const contactPieceById = new Map<string, BreakablePieceDefinition>();
  for (const piece of pieces) {
    if (!memberAcceptsContact(cluster, piece) || brokenPieces.has(piece.id)) {
      continue;
    }
    contactPieceById.set(piece.id, piece);
    if (consumedPieces.has(piece.id)) {
      // Кусок съеден carve/shatter: его форму в компаунде дают обрубки ниже.
      continue;
    }
    const rotation = piece.rotation ?? ([0, 0, 0] as const);
    const rotationMatrix = rotationMatrixFromEuler(rotation);
    const surface = memberContactSurface(piece.material);
    for (const [index, box] of getPieceRenderBoxes(piece).entries()) {
      const turnedCenter = applyMatrix(rotationMatrix, box.center);
      const position: SceneVector3 = [
        piece.position[0] - cluster.origin[0] + turnedCenter[0],
        piece.position[1] - cluster.origin[1] + turnedCenter[1],
        piece.position[2] - cluster.origin[2] + turnedCenter[2],
      ];
      colliders.push({
        id: `${piece.id}:${index}`,
        sourceId: piece.id,
        shape:
          piece.shape === "sphere"
            ? "sphere"
            : piece.shape === "cylinder"
              ? "cylinder"
              : "cuboid",
        position,
        rotation,
        args:
          piece.shape === "sphere"
            ? [Math.max(0.002, Math.min(...box.size) / 2 - 0.002)]
            : piece.shape === "cylinder"
            ? [
                Math.max(0.002, box.size[1] / 2 - 0.002),
                Math.max(0.002, (box.size[0] + box.size[2]) / 4 - 0.002),
              ]
            : [
                Math.max(0.002, box.size[0] / 2 - 0.002),
                Math.max(0.002, box.size[1] / 2 - 0.002),
                Math.max(0.002, box.size[2] / 2 - 0.002),
              ],
        friction: surface.friction,
        restitution: surface.restitution,
      });
    }
  }
  for (const remnant of memberRemnants) {
    const parent = contactPieceById.get(remnant.parentId);
    if (!parent || !consumedPieces.has(remnant.parentId)) {
      continue;
    }
    const rotation = eulerFromQuaternion(remnant.quaternion);
    const surface = memberContactSurface(remnant.material);
    const boxes =
      remnant.boxes && remnant.boxes.length > 0
        ? remnant.boxes
        : [{ center: [0, 0, 0] as const, size: remnant.size }];
    for (const [index, box] of boxes.entries()) {
      const turnedCenter = rotateVector(remnant.quaternion, box.center);
      colliders.push({
        id: `${remnant.id}:${index}`,
        sourceId: remnant.parentId,
        shape: "cuboid",
        position: [
          remnant.position[0] - cluster.origin[0] + turnedCenter[0],
          remnant.position[1] - cluster.origin[1] + turnedCenter[1],
          remnant.position[2] - cluster.origin[2] + turnedCenter[2],
        ],
        rotation,
        args: [
          Math.max(0.002, box.size[0] / 2 - 0.002),
          Math.max(0.002, box.size[1] / 2 - 0.002),
          Math.max(0.002, box.size[2] / 2 - 0.002),
        ],
        friction: surface.friction,
        restitution: surface.restitution,
      });
    }
  }
  return colliders;
}
