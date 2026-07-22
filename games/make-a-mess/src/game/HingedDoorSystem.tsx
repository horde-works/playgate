"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import type { BreakablePieceDefinition } from "./destructionScene";

interface DoorMember {
  readonly piece: BreakablePieceDefinition;
  // The board's own resting orientation (the house yaw baked in at compile).
  // The swing is composed ON TOP of this, so a rotated house's door stays one
  // rigid leaf instead of snapping every board back to axis-aligned.
  readonly baseQuaternion: Quaternion;
}

interface DoorGroup {
  readonly key: string;
  readonly members: readonly DoorMember[];
  readonly hinge: NonNullable<BreakablePieceDefinition["hinge"]>;
  readonly center: readonly [number, number, number];
}

export function HingedDoorSystem({
  pieces,
  bodies,
  brokenPieces,
  resetVersion,
}: {
  pieces: readonly BreakablePieceDefinition[];
  bodies: { current: Map<string, RapierRigidBody> };
  brokenPieces: { current: ReadonlySet<string> };
  resetVersion: number;
}) {
  const { camera } = useThree();
  const { rapier } = useRapier();

  // A plank door is many boards (and iron straps) sharing one hinge. Group them
  // so the whole leaf swings on ONE state — approaching it opens every board by
  // the same angle at the same instant, instead of each board fanning open
  // independently like an accordion.
  const doorGroups = useMemo<DoorGroup[]>(() => {
    const groups = new Map<
      string,
      { members: BreakablePieceDefinition[]; hinge: NonNullable<BreakablePieceDefinition["hinge"]> }
    >();
    for (const piece of pieces) {
      if (!piece.hinge) {
        continue;
      }
      const key = piece.id.replace(/:(board|strap):\d+$/, "");
      const existing = groups.get(key);
      if (existing) {
        existing.members.push(piece);
      } else {
        groups.set(key, { members: [piece], hinge: piece.hinge });
      }
    }
    return [...groups.entries()].map(([key, { members, hinge }]) => {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const member of members) {
        sx += member.position[0];
        sy += member.position[1];
        sz += member.position[2];
      }
      const count = members.length;
      const doorMembers: DoorMember[] = members.map((piece) => {
        const [rx, ry, rz] = piece.rotation ?? [0, 0, 0];
        return {
          piece,
          baseQuaternion: new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
        };
      });
      return {
        key,
        members: doorMembers,
        hinge,
        center: [sx / count, sy / count, sz / count] as const,
      };
    });
  }, [pieces]);

  const states = useRef(new Map<string, { angle: number; sign: number }>());
  const cameraDirection = useRef(new Vector3());
  const directionToDoor = useRef(new Vector3());
  const doorQuaternion = useRef(new Quaternion());
  const composedQuaternion = useRef(new Quaternion());
  const doorRelative = useRef(new Vector3());
  const doorUpAxis = useRef(new Vector3(0, 1, 0));
  const shadowAccumulator = useRef(1);

  useEffect(() => {
    states.current.clear();
  }, [resetVersion]);

  useFrame((frameState, delta) => {
    camera.getWorldDirection(cameraDirection.current);
    shadowAccumulator.current += delta;
    let doorMoved = false;

    for (const group of doorGroups) {
      const hinge = group.hinge;
      let state = states.current.get(group.key);
      if (!state) {
        state = { angle: 0, sign: 0 };
        states.current.set(group.key, state);
      }

      // One open/close decision for the whole leaf, measured to the leaf centre.
      const dx = camera.position.x - group.center[0];
      const dy = camera.position.y - group.center[1];
      const dz = camera.position.z - group.center[2];
      const distance = Math.hypot(dx, dy, dz);
      let open: boolean;
      if (state.angle > 0.05) {
        open = distance < 3.6;
      } else {
        directionToDoor.current
          .set(
            group.center[0] - camera.position.x,
            group.center[1] - camera.position.y,
            group.center[2] - camera.position.z,
          )
          .normalize();
        open =
          distance < 2.8 &&
          directionToDoor.current.dot(cameraDirection.current) > 0.25;
      }

      if (open && state.sign === 0) {
        const side =
          Math.sign(dx * hinge.normal[0] + dz * hinge.normal[2]) || 1;
        const crossDotNormal =
          hinge.direction[2] * hinge.normal[0] -
          hinge.direction[0] * hinge.normal[2];
        state.sign = -side * Math.sign(crossDotNormal || 1);
      }

      const targetAngle = open ? 1.8 : 0;
      const previousAngle = state.angle;
      state.angle +=
        (targetAngle - state.angle) * Math.min(1, delta * (open ? 5 : 3));
      doorMoved ||= Math.abs(state.angle - previousAngle) > 0.0005;

      const closedNow = !open && state.angle < 0.02;
      if (closedNow) {
        state.angle = 0;
        state.sign = 0;
      }

      // The same rotation is applied to every surviving board and strap, each
      // orbiting the shared pivot — so the leaf stays one rigid piece.
      doorQuaternion.current.setFromAxisAngle(
        doorUpAxis.current,
        state.sign * state.angle,
      );
      for (const member of group.members) {
        const piece = member.piece;
        if (brokenPieces.current.has(piece.id)) {
          continue;
        }
        const body = bodies.current.get(piece.id);
        if (!body) {
          continue;
        }
        if (closedNow) {
          if (body.bodyType() !== rapier.RigidBodyType.Fixed) {
            body.setBodyType(rapier.RigidBodyType.Fixed, true);
            body.setTranslation(
              { x: piece.position[0], y: piece.position[1], z: piece.position[2] },
              false,
            );
            // Restore the board's OWN resting orientation, not identity.
            body.setRotation(member.baseQuaternion, false);
          }
          continue;
        }
        // A board that broke loose turns dynamic — leave it to the physics.
        if (body.bodyType() === rapier.RigidBodyType.Dynamic) {
          continue;
        }
        if (body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
          body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
        }
        doorRelative.current
          .set(piece.position[0] - hinge.pivot[0], 0, piece.position[2] - hinge.pivot[2])
          .applyQuaternion(doorQuaternion.current);
        body.setNextKinematicTranslation({
          x: hinge.pivot[0] + doorRelative.current.x,
          y: piece.position[1],
          z: hinge.pivot[2] + doorRelative.current.z,
        });
        // Swing composed onto the board's resting orientation → the whole leaf
        // turns as one rigid piece even on a yaw-rotated house.
        composedQuaternion.current.multiplyQuaternions(
          doorQuaternion.current,
          member.baseQuaternion,
        );
        body.setNextKinematicRotation({
          x: composedQuaternion.current.x,
          y: composedQuaternion.current.y,
          z: composedQuaternion.current.z,
          w: composedQuaternion.current.w,
        });
      }
    }

    if (doorMoved && shadowAccumulator.current > 0.18) {
      shadowAccumulator.current = 0;
      frameState.gl.shadowMap.needsUpdate = true;
    }
  });

  return null;
}
