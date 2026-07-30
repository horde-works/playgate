"use client";

// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import {
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import type { BreakablePieceDefinition, LampEventState } from "./destructionScene";
import {
  PHYSICS_TIME_STEP,
  type CompoundKinematicClusterRegistry,
} from "./compoundKinematicCluster";
import { CompoundKinematicClusterBodies } from "./CompoundKinematicClusterBodies";
import { advanceTrain, trainEventState, type TrainState } from "./astanaTrainControl";
import {
  astanaTrainClusterDefinitions,
  astanaTrainSectionPose,
  initialAstanaTrainState,
} from "./astanaTrainRuntime";

interface AstanaTrainSystemProps {
  readonly pieces: readonly BreakablePieceDefinition[];
  readonly bodies: MutableRefObject<Map<string, RapierRigidBody>>;
  readonly brokenPieces: { current: ReadonlySet<string> };
  readonly inactivePieces: ReadonlySet<string>;
  readonly resetVersion: number;
  readonly movingVehicles: MutableRefObject<Set<string>>;
  readonly dockedVehicles: MutableRefObject<Set<string>>;
  readonly clusterEventStates: MutableRefObject<Map<string, LampEventState>>;
  readonly clusterRegistry: CompoundKinematicClusterRegistry;
}

function memberWorldPosition(
  piece: BreakablePieceDefinition,
  origin: readonly [number, number, number],
  position: readonly [number, number, number],
  rotation: Quaternion,
  target: Vector3,
): Vector3 {
  return target
    .set(
      piece.position[0] - origin[0],
      piece.position[1] - origin[1],
      piece.position[2] - origin[2],
    )
    .applyQuaternion(rotation)
    .add(new Vector3(...position));
}

/**
 * Runtime bridge between the pure GoA4 controller and three Rapier bodies.
 * Each section gets its own rail pose; the train therefore articulates on
 * curves while still presenting one continuous moving support to passengers.
 */
export function AstanaTrainSystem({
  pieces,
  bodies,
  brokenPieces,
  inactivePieces,
  resetVersion,
  movingVehicles,
  dockedVehicles,
  clusterEventStates,
  clusterRegistry,
}: AstanaTrainSystemProps) {
  const { rapier } = useRapier();
  const definitions = useMemo(() => {
    const available = new Set(pieces.map((piece) => piece.clusterId));
    return astanaTrainClusterDefinitions().filter((definition) =>
      available.has(definition.clusterId),
    );
  }, [pieces]);
  const memberPieces = useMemo(() => {
    const byCluster = new Map<string, readonly BreakablePieceDefinition[]>();
    for (const definition of definitions) {
      byCluster.set(
        definition.clusterId,
        pieces.filter((piece) => piece.clusterId === definition.clusterId),
      );
    }
    return byCluster;
  }, [definitions, pieces]);
  const state = useRef<TrainState>(initialAstanaTrainState());
  const releasedMembers = useRef(new Set<string>());
  const previousWorld = useMemo(() => new Vector3(), []);
  const currentWorld = useMemo(() => new Vector3(), []);
  const ownRotation = useMemo(() => new Quaternion(), []);
  const previousRotation = useMemo(() => new Quaternion(), []);
  const currentRotation = useMemo(() => new Quaternion(), []);

  useEffect(() => {
    state.current = initialAstanaTrainState();
    releasedMembers.current.clear();
  }, [resetVersion]);

  useEffect(
    () => () => {
      for (const definition of definitions) {
        movingVehicles.current.delete(definition.clusterId);
        dockedVehicles.current.delete(definition.clusterId);
        clusterEventStates.current.delete(definition.clusterId);
      }
    },
    [clusterEventStates, definitions, dockedVehicles, movingVehicles],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || definitions.length === 0) {
      return undefined;
    }
    const scope = window as unknown as Record<string, unknown>;
    const inspect = () => ({
      state: state.current,
      sections: definitions.map((definition) => {
        const body = clusterRegistry.current.get(definition.clusterId)?.body;
        return {
          clusterId: definition.clusterId,
          translation: body ? body.translation() : null,
          rotation: body ? body.rotation() : null,
        };
      }),
    });
    scope.__mamAstanaTrain = inspect;
    return () => {
      if (scope.__mamAstanaTrain === inspect) {
        delete scope.__mamAstanaTrain;
      }
    };
  }, [clusterRegistry, definitions]);

  useBeforePhysicsStep(() => {
    if (definitions.length === 0) {
      return;
    }

    const before = state.current;
    const next = advanceTrain(before, PHYSICS_TIME_STEP);
    state.current = next;
    const event = trainEventState(next);

    for (const [index, definition] of definitions.entries()) {
      const runtime = clusterRegistry.current.get(definition.clusterId);
      const beforePose = astanaTrainSectionPose(before.distance, index);
      const nextPose = astanaTrainSectionPose(next.distance, index);
      if (runtime) {
        runtime.body.setNextKinematicTranslation({
          x: nextPose.position[0],
          y: nextPose.position[1],
          z: nextPose.position[2],
        });
        runtime.body.setNextKinematicRotation({
          x: nextPose.rotation[0],
          y: nextPose.rotation[1],
          z: nextPose.rotation[2],
          w: nextPose.rotation[3],
        });
      }

      clusterEventStates.current.set(definition.clusterId, event);
      if (event === "docked") {
        dockedVehicles.current.add(definition.clusterId);
        movingVehicles.current.delete(definition.clusterId);
      } else {
        dockedVehicles.current.delete(definition.clusterId);
        movingVehicles.current.add(definition.clusterId);
      }

      previousRotation.set(...beforePose.rotation);
      currentRotation.set(...nextPose.rotation);
      for (const piece of memberPieces.get(definition.clusterId) ?? []) {
        if (!brokenPieces.current.has(piece.id)) {
          releasedMembers.current.delete(piece.id);
          continue;
        }
        if (releasedMembers.current.has(piece.id)) {
          continue;
        }
        const body = bodies.current.get(piece.id);
        if (!body || body.bodyType() !== rapier.RigidBodyType.Dynamic) {
          continue;
        }

        memberWorldPosition(
          piece,
          definition.origin,
          beforePose.position,
          previousRotation,
          previousWorld,
        );
        memberWorldPosition(
          piece,
          definition.origin,
          nextPose.position,
          currentRotation,
          currentWorld,
        );
        ownRotation.setFromEuler(
          new Euler(
            piece.rotation?.[0] ?? 0,
            piece.rotation?.[1] ?? 0,
            piece.rotation?.[2] ?? 0,
          ),
        );
        ownRotation.premultiply(currentRotation);

        const inherited = currentWorld.clone().sub(previousWorld)
          .multiplyScalar(1 / PHYSICS_TIME_STEP);
        const existingLinear = body.linvel();
        const existingAngular = body.angvel();
        const yawRate = Math.atan2(
          Math.sin(nextPose.deltaYaw - beforePose.deltaYaw),
          Math.cos(nextPose.deltaYaw - beforePose.deltaYaw),
        ) / PHYSICS_TIME_STEP;
        body.setTranslation(currentWorld, true);
        body.setRotation(ownRotation, true);
        body.setLinvel({
          x: existingLinear.x + inherited.x,
          y: existingLinear.y + inherited.y,
          z: existingLinear.z + inherited.z,
        }, true);
        body.setAngvel({
          x: existingAngular.x,
          y: existingAngular.y + yawRate,
          z: existingAngular.z,
        }, true);
        releasedMembers.current.add(piece.id);
      }
    }
  });

  if (definitions.length === 0) {
    return null;
  }
  return (
    <CompoundKinematicClusterBodies
      definitions={definitions}
      pieces={pieces}
      brokenPieces={inactivePieces}
      registry={clusterRegistry}
    />
  );
}
