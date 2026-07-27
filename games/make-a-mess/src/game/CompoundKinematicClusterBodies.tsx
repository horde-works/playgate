"use client";

import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { BreakablePieceDefinition } from "./destructionScene";
import {
  compoundClusterColliders,
  type CompoundKinematicClusterDefinition,
  type CompoundKinematicClusterRegistry,
} from "./compoundKinematicCluster";

function CompoundKinematicClusterBody({
  definition,
  pieces,
  brokenPieces,
  registry,
}: {
  definition: CompoundKinematicClusterDefinition;
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  registry: CompoundKinematicClusterRegistry;
}) {
  const body = useRef<RapierRigidBody>(null);
  const colliders = useMemo(
    () => compoundClusterColliders(definition, pieces, brokenPieces),
    [brokenPieces, definition, pieces],
  );
  const memberIds = useMemo(
    () => new Set(colliders.map((collider) => collider.sourceId)),
    [colliders],
  );

  useEffect(() => {
    const current = body.current;
    if (!current) {
      return undefined;
    }
    const registrations = registry.current;
    registrations.set(definition.clusterId, {
      definition,
      body: current,
      memberIds,
    });
    return () => {
      if (registrations.get(definition.clusterId)?.body === current) {
        registrations.delete(definition.clusterId);
      }
    };
  }, [definition, memberIds, registry]);

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      position={[...definition.origin]}
      colliders={false}
      canSleep={false}
      additionalSolverIterations={4}
      userData={{ compoundKinematicCluster: definition.clusterId }}
    >
      {colliders.map((collider) =>
        collider.shape === "cylinder" ? (
          <CylinderCollider
            key={collider.id}
            args={collider.args as [number, number]}
            position={[...collider.position]}
            rotation={[...collider.rotation]}
            friction={collider.friction}
            restitution={collider.restitution}
          />
        ) : (
          <CuboidCollider
            key={collider.id}
            args={collider.args as [number, number, number]}
            position={[...collider.position]}
            rotation={[...collider.rotation]}
            friction={collider.friction}
            restitution={collider.restitution}
          />
        ),
      )}
    </RigidBody>
  );
}

/** One authoritative contact body per cluster, independent of object policy. */
export function CompoundKinematicClusterBodies({
  definitions,
  pieces,
  brokenPieces,
  registry,
}: {
  definitions: readonly CompoundKinematicClusterDefinition[];
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  registry: CompoundKinematicClusterRegistry;
}) {
  return (
    <>
      {definitions.map((definition) => (
        <CompoundKinematicClusterBody
          key={definition.id}
          definition={definition}
          pieces={pieces}
          brokenPieces={brokenPieces}
          registry={registry}
        />
      ))}
    </>
  );
}
