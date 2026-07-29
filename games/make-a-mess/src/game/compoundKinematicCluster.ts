import type { RapierRigidBody } from "@react-three/rapier";
import type { MutableRefObject } from "react";
import type { Group } from "three";
import { getPieceRenderBoxes } from "./breakableGeometry.ts";
import {
  materialRuntimeProfiles,
  type BreakablePieceDefinition,
  type SceneVector3,
} from "./destructionScene.ts";
import { applyMatrix, rotationMatrixFromEuler } from "./clusterDynamics.ts";

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
}

export type CompoundKinematicClusterRegistry = MutableRefObject<
  Map<string, CompoundKinematicClusterRuntime>
>;

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
 * Selects the single pose writer for an articulated cluster member.
 * The carrier locks and transports hinges while underway; when an independent
 * mechanism is active (for example at a dock), that mechanism owns the body.
 */
export function compoundCarrierOwnsMemberPose(
  piece: BreakablePieceDefinition,
  independentMechanismActive: boolean,
): boolean {
  return !piece.hinge || !independentMechanismActive;
}

/**
 * Builds one compound contact shape from all intact members. A removed member
 * simply disappears from the compound; its detached rigid body can then take
 * over without leaving a duplicate contact surface behind.
 */
export function compoundClusterColliders(
  cluster: CompoundKinematicClusterDefinition,
  pieces: readonly BreakablePieceDefinition[],
  brokenPieces: ReadonlySet<string>,
): readonly CompoundClusterColliderDefinition[] {
  const colliders: CompoundClusterColliderDefinition[] = [];
  for (const piece of pieces) {
    if (
      !compoundClusterOwnsPiece(cluster, piece) ||
      (cluster.contactMemberMatches &&
        !cluster.contactMemberMatches.some((match) => piece.id.includes(match))) ||
      brokenPieces.has(piece.id)
    ) {
      continue;
    }
    const rotation = piece.rotation ?? ([0, 0, 0] as const);
    const rotationMatrix = rotationMatrixFromEuler(rotation);
    const profile = materialRuntimeProfiles[piece.material];
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
        friction: piece.material === "wood" ? 0.66 : 0.84,
        restitution: profile.restitution,
      });
    }
  }
  return colliders;
}
