"use client";

import {
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import type {
  BreakablePieceDefinition,
  ConstantRotorDefinition,
} from "./destructionScene.ts";
import {
  PHYSICS_TIME_STEP,
  type CompoundKinematicClusterDefinition,
  type CompoundKinematicClusterRegistry,
} from "./compoundKinematicCluster.ts";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies.tsx";

export function constantRotorClusterDefinitions(
  rotors: readonly ConstantRotorDefinition[],
): readonly CompoundKinematicClusterDefinition[] {
  return rotors.map((rotor) => ({
    id: `constant-rotor:${rotor.clusterId}`,
    clusterId: rotor.clusterId,
    origin: rotor.pivot,
  }));
}

interface ConstantRotorSystemProps {
  readonly definitions: readonly ConstantRotorDefinition[];
  readonly pieces: readonly BreakablePieceDefinition[];
  readonly bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  readonly brokenPieces: { readonly current: ReadonlySet<string> };
  readonly inactivePieces: ReadonlySet<string>;
  readonly resetVersion: number;
  readonly clusterRegistry: CompoundKinematicClusterRegistry;
}

/**
 * Deterministic mechanism owner for mill sail crosses. It knows only pivot,
 * axis and constant angular speed. There is deliberately no wind vector,
 * aerodynamic force, cap yaw or vehicle coupling anywhere in this system.
 */
export function ConstantRotorSystem({
  definitions,
  pieces,
  bodies,
  brokenPieces,
  inactivePieces,
  resetVersion,
  clusterRegistry,
}: ConstantRotorSystemProps) {
  const { rapier } = useRapier();
  const availableDefinitions = useMemo(() => {
    const clusters = new Set(pieces.map(({ clusterId }) => clusterId));
    return definitions.filter(({ clusterId }) => clusters.has(clusterId));
  }, [definitions, pieces]);
  const compoundDefinitions = useMemo(
    () => constantRotorClusterDefinitions(availableDefinitions),
    [availableDefinitions],
  );
  const members = useMemo(() => new Map(
    availableDefinitions.map((definition) => [
      definition.clusterId,
      pieces.filter((piece) => piece.clusterId === definition.clusterId),
    ] as const),
  ), [availableDefinitions, pieces]);
  const angles = useRef(new Map<string, number>());
  const released = useRef(new Set<string>());
  const axis = useMemo(() => new Vector3(), []);
  const local = useMemo(() => new Vector3(), []);
  const world = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);
  const carrierRotation = useMemo(() => new Quaternion(), []);
  const pieceRotation = useMemo(() => new Quaternion(), []);

  useEffect(() => {
    angles.current.clear();
    released.current.clear();
  }, [resetVersion]);

  useBeforePhysicsStep(() => {
    for (const definition of availableDefinitions) {
      const runtime = clusterRegistry.current.get(definition.clusterId);
      if (!runtime) continue;
      if (runtime.body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
        runtime.body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      }
      const angle = (angles.current.get(definition.clusterId) ?? 0)
        + definition.radiansPerSecond * PHYSICS_TIME_STEP;
      angles.current.set(definition.clusterId, angle);
      axis.set(...definition.axis).normalize();
      carrierRotation.setFromAxisAngle(axis, angle);
      runtime.body.setNextKinematicTranslation({
        x: definition.pivot[0],
        y: definition.pivot[1],
        z: definition.pivot[2],
      });
      runtime.body.setNextKinematicRotation(carrierRotation);

      for (const piece of members.get(definition.clusterId) ?? []) {
        if (!brokenPieces.current.has(piece.id)) {
          released.current.delete(piece.id);
          continue;
        }
        if (released.current.has(piece.id)) continue;
        const body = bodies.current.get(piece.id);
        if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) continue;

        local.set(
          piece.position[0] - definition.pivot[0],
          piece.position[1] - definition.pivot[1],
          piece.position[2] - definition.pivot[2],
        );
        world.copy(local).applyQuaternion(carrierRotation).add(new Vector3(...definition.pivot));
        pieceRotation.setFromEuler(new Euler(...(piece.rotation ?? [0, 0, 0])));
        pieceRotation.premultiply(carrierRotation);
        tangent.copy(axis).cross(local.clone().applyQuaternion(carrierRotation))
          .multiplyScalar(definition.radiansPerSecond);
        const prior = body.linvel();
        body.setTranslation(world, true);
        body.setRotation(pieceRotation, true);
        body.setLinvel({ x: prior.x + tangent.x, y: prior.y + tangent.y, z: prior.z + tangent.z }, true);
        body.setAngvel({
          x: axis.x * definition.radiansPerSecond,
          y: axis.y * definition.radiansPerSecond,
          z: axis.z * definition.radiansPerSecond,
        }, true);
        released.current.add(piece.id);
      }
    }
  });

  if (compoundDefinitions.length === 0) return null;
  return (
    <CompoundKinematicClusterBodies
      definitions={compoundDefinitions}
      pieces={pieces}
      brokenPieces={inactivePieces}
      registry={clusterRegistry}
    />
  );
}
