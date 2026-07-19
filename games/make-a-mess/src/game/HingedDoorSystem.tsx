"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { breakablePieces } from "./destructionScene";

export function HingedDoorSystem({
  bodies,
  brokenPieces,
  resetVersion,
}: {
  bodies: { current: Map<string, RapierRigidBody> };
  brokenPieces: { current: ReadonlySet<string> };
  resetVersion: number;
}) {
  const { camera } = useThree();
  const { rapier } = useRapier();
  const hingedDoors = useMemo(
    () => breakablePieces.filter((piece) => piece.hinge),
    [],
  );
  const states = useRef(new Map<string, { angle: number; sign: number }>());
  const cameraDirection = useRef(new Vector3());
  const directionToDoor = useRef(new Vector3());
  const doorQuaternion = useRef(new Quaternion());
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

    for (const door of hingedDoors) {
      if (brokenPieces.current.has(door.id)) {
        states.current.delete(door.id);
        continue;
      }
      const body = bodies.current.get(door.id);
      if (!body || body.bodyType() === rapier.RigidBodyType.Dynamic) {
        continue;
      }

      const hinge = door.hinge!;
      let state = states.current.get(door.id);
      if (!state) {
        state = { angle: 0, sign: 0 };
        states.current.set(door.id, state);
      }

      const dx = camera.position.x - hinge.pivot[0];
      const dy = camera.position.y - door.position[1];
      const dz = camera.position.z - hinge.pivot[2];
      const distance = Math.hypot(dx, dy, dz);
      let open: boolean;

      if (state.angle > 0.05) {
        open = distance < 3.2;
      } else {
        directionToDoor.current
          .set(
            door.position[0] - camera.position.x,
            door.position[1] - camera.position.y,
            door.position[2] - camera.position.z,
          )
          .normalize();
        open =
          distance < 2.4 &&
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

      if (!open && state.angle < 0.02) {
        state.angle = 0;
        state.sign = 0;
        if (body.bodyType() !== rapier.RigidBodyType.Fixed) {
          body.setBodyType(rapier.RigidBodyType.Fixed, true);
          body.setTranslation(
            {
              x: door.position[0],
              y: door.position[1],
              z: door.position[2],
            },
            false,
          );
          body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
        }
        continue;
      }

      if (body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
        body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      }

      doorQuaternion.current.setFromAxisAngle(
        doorUpAxis.current,
        state.sign * state.angle,
      );
      doorRelative.current
        .set(
          door.position[0] - hinge.pivot[0],
          0,
          door.position[2] - hinge.pivot[2],
        )
        .applyQuaternion(doorQuaternion.current);
      body.setNextKinematicTranslation({
        x: hinge.pivot[0] + doorRelative.current.x,
        y: door.position[1],
        z: hinge.pivot[2] + doorRelative.current.z,
      });
      body.setNextKinematicRotation({
        x: doorQuaternion.current.x,
        y: doorQuaternion.current.y,
        z: doorQuaternion.current.z,
        w: doorQuaternion.current.w,
      });
    }

    if (doorMoved && shadowAccumulator.current > 0.18) {
      shadowAccumulator.current = 0;
      frameState.gl.shadowMap.needsUpdate = true;
    }
  });

  return null;
}
