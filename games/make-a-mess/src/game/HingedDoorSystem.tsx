"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import type { BreakablePieceDefinition } from "./destructionScene";
import type { VehicleFramePoseState } from "./VehicleFrameSystem";
import {
  multiplyQuaternions,
  vehiclePiecePosition,
  vehicleRotation,
} from "./vehicleFrames";
import {
  horizontalGateDistance,
  automaticSlideDoorPolicy,
  automaticSlideDoorShouldOpen,
  hingedLeafRotationAxis,
  hingedDoorGroupKey,
  hingedDoorLockedToCarrier,
  inwardDoorSwingSign,
  plugSlideApproachRadius,
  plugSlideDoorPolicy,
  plugSlideReleaseRadius,
  tailRampPolicy,
  townHouseDoorPolicy,
  DOOR_APPROACH_HEIGHT,
  VIKING_GATE_APPROACH_RADIUS,
  VIKING_GATE_RELEASE_RADIUS,
  vikingDoorPolicy,
  vikingGateLeafPolicy,
  vikingHallGatePolicy,
  type PlugSlideDoorPolicy,
  type AutomaticSlideDoorPolicy,
  type TailRampPolicy,
  type VikingDoorPolicy,
  type VikingGateLeafPolicy,
  type TownHouseDoorPolicy,
} from "./hingedGatePolicy";
import { PHYSICS_TIME_STEP } from "./compoundKinematicCluster";
import {
  entryInteractionMatches,
  type EntryInteractionTarget,
} from "./entryInteraction";
import { runtimeDiagnosticsEnabled } from "./runtimeDiagnostics";

export type HingedEntryApproach = EntryInteractionTarget;

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
  readonly gate: VikingGateLeafPolicy | null;
  readonly hallGate: VikingGateLeafPolicy | null;
  readonly vikingDoor: VikingDoorPolicy | null;
  readonly townHouseDoor: TownHouseDoorPolicy | null;
  /** Створка не распахивается, а выходит из проёма и едет вдоль борта. */
  readonly plugSlide: PlugSlideDoorPolicy | null;
  /** Paired terminal leaf driven directly by a proximity sensor. */
  readonly automaticSlide: AutomaticSlideDoorPolicy | null;
  /** Кормовой бронелист вращается вокруг поперечной оси и становится трапом. */
  readonly tailRamp: TailRampPolicy | null;
}

interface GateGroup {
  readonly id: string;
  readonly center: readonly [number, number, number];
  readonly leaves: readonly DoorGroup[];
}

export function HingedDoorSystem({
  openEntries,
  pieces,
  bodies,
  brokenPieces,
  resetVersion,
  entryOpenRequestVersion = 0,
  entryOpenRequestTargetRef,
  entryOpenRequests,
  onEntryApproachChange = () => {},
  movingVehicles,
  dockedVehicles,
  vehicleFramePoses,
}: {
  pieces: readonly BreakablePieceDefinition[];
  bodies: { current: Map<string, RapierRigidBody> };
  brokenPieces: { current: ReadonlySet<string> };
  resetVersion: number;
  entryOpenRequestVersion?: number;
  /** Точный адресат Space; соседний вход не должен принять ту же команду. */
  entryOpenRequestTargetRef?: { current: EntryInteractionTarget | null };
  /** Входы, которые прямо сейчас открывает кто-то, кроме игрока (жители). */
  entryOpenRequests?: { current: ReadonlySet<string> };
  /** Сюда кладутся входы, чьи створки РЕАЛЬНО распахнуты: жители ждут именно этого. */
  openEntries?: { current: Set<string> };
  onEntryApproachChange?: (entry: HingedEntryApproach | null) => void;
  /** Кластеры, которые сейчас везёт кадр транспорта: их створками правит он. */
  movingVehicles?: { current: ReadonlySet<string> };
  /** Кластеры, уже принятые швартовом и снова доступные для посадки. */
  dockedVehicles?: { current: ReadonlySet<string> };
  /** Их ещё не обнулённая физическая поза — дверь не должна прыгать в origin. */
  vehicleFramePoses?: { current: ReadonlyMap<string, VehicleFramePoseState> };
}) {
  const { camera } = useThree();
  const { rapier } = useRapier();

  // A plank door is many boards (and iron straps) sharing one hinge. Group them
  // so the whole leaf answers one interaction and swings every member by the
  // same angle, instead of fanning open independently like an accordion.
  const doorGroups = useMemo<DoorGroup[]>(() => {
    const groups = new Map<
      string,
      { members: BreakablePieceDefinition[]; hinge: NonNullable<BreakablePieceDefinition["hinge"]> }
    >();
    for (const piece of pieces) {
      if (!piece.hinge) {
        continue;
      }
      const key = hingedDoorGroupKey(piece.id, piece.clusterId);
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
        gate: vikingGateLeafPolicy(key),
        hallGate: vikingHallGatePolicy(key),
        vikingDoor: vikingDoorPolicy(key),
        townHouseDoor: townHouseDoorPolicy(key),
        plugSlide: plugSlideDoorPolicy(key),
        automaticSlide: automaticSlideDoorPolicy(key),
        tailRamp: tailRampPolicy(key),
      };
    });
  }, [pieces]);

  const gateGroups = useMemo<GateGroup[]>(() => {
    const gates = new Map<string, DoorGroup[]>();
    for (const group of doorGroups) {
      if (!group.gate) {
        continue;
      }
      const leaves = gates.get(group.gate.gateId) ?? [];
      leaves.push(group);
      gates.set(group.gate.gateId, leaves);
    }
    return [...gates.entries()].map(([id, leaves]) => ({
      id,
      leaves,
      center: [
        leaves.reduce((sum, leaf) => sum + leaf.center[0], 0) / leaves.length,
        leaves.reduce((sum, leaf) => sum + leaf.center[1], 0) / leaves.length,
        leaves.reduce((sum, leaf) => sum + leaf.center[2], 0) / leaves.length,
      ] as const,
    }));
  }, [doorGroups]);

  const states = useRef(new Map<string, { angle: number; sign: number }>());
  const cameraDirection = useRef(new Vector3());
  const directionToDoor = useRef(new Vector3());
  const doorQuaternion = useRef(new Quaternion());
  const rampQuaternion = useRef(new Quaternion());
  const composedQuaternion = useRef(new Quaternion());
  const doorRelative = useRef(new Vector3());
  const doorUpAxis = useRef(new Vector3(0, 1, 0));
  const rampAxis = useRef(new Vector3(1, 0, 0));
  const shadowAccumulator = useRef(1);
  const shadowRefreshRequested = useRef(false);
  const carrierDoorTelemetryAt = useRef(0);
  const doorDiagnostics = useMemo(
    () => runtimeDiagnosticsEnabled("door"),
    [],
  );
  const doorDiagnosticTarget = useMemo(
    () => new URLSearchParams(window.location.search).get("mamDoorTarget"),
    [],
  );
  const approachedEntry = useRef<HingedEntryApproach | null>(null);
  const openedEntries = useRef(new Set<string>());
  const handledEntryRequest = useRef(entryOpenRequestVersion);

  useEffect(() => {
    states.current.clear();
    openedEntries.current.clear();
    approachedEntry.current = null;
    onEntryApproachChange(null);
  }, [onEntryApproachChange, resetVersion]);

  useBeforePhysicsStep(() => {
    const delta = PHYSICS_TIME_STEP;
    camera.getWorldDirection(cameraDirection.current);
    shadowAccumulator.current += delta;
    let doorMoved = false;
    let carrierDoorTelemetry: {
      id: string;
      angle: number;
      targetAngle: number;
      open: boolean;
      carrier: boolean;
      bodyPositions: readonly (readonly [number, number, number])[];
      bodyRotations: readonly (readonly [number, number, number, number])[];
    } | null = null;

    const cameraPosition = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ] as const;
    const dockedCarrierFrame = (group: DoorGroup): VehicleFramePoseState | null => {
      const clusterId = group.members[0]?.piece.clusterId;
      if (!clusterId || !dockedVehicles?.current.has(clusterId)) {
        return null;
      }
      return vehicleFramePoses?.current.get(clusterId) ?? null;
    };
    const groupWorldCenter = (group: DoorGroup): readonly [number, number, number] => {
      const carrier = dockedCarrierFrame(group);
      return carrier
        ? vehiclePiecePosition(
            carrier.origin,
            group.center,
            carrier.pose,
            vehicleRotation(carrier.pose, carrier.nose),
          )
        : group.center;
    };
    let nearestEntry: HingedEntryApproach | null = null;
    let nearestEntryDistance = Number.POSITIVE_INFINITY;
    for (const gate of gateGroups) {
      const usable = gate.leaves.some((leaf) =>
        leaf.members.some((member) => !brokenPieces.current.has(member.piece.id)),
      );
      if (!usable) {
        openedEntries.current.delete(gate.id);
        continue;
      }
      const distance = horizontalGateDistance(cameraPosition, gate.center);
      if (distance <= VIKING_GATE_APPROACH_RADIUS && distance < nearestEntryDistance) {
        nearestEntry = { id: gate.id, kind: "gate" };
        nearestEntryDistance = distance;
      }
      if (distance > VIKING_GATE_RELEASE_RADIUS) {
        openedEntries.current.delete(gate.id);
      }
    }

    for (const group of doorGroups) {
      const doorId = group.vikingDoor?.doorId
        ?? group.townHouseDoor?.doorId
        ?? group.plugSlide?.doorId
        ?? group.tailRamp?.doorId;
      if (!doorId) {
        continue;
      }
      const clusterId = group.members[0]?.piece.clusterId;
      if (
        hingedDoorLockedToCarrier({
          clusterId,
          dockedVehicles: dockedVehicles?.current,
          vehicleFramePoses: vehicleFramePoses?.current,
        })
      ) {
        openedEntries.current.delete(doorId);
        continue;
      }
      const usable = group.members.some(
        (member) => !brokenPieces.current.has(member.piece.id),
      );
      if (!usable) {
        openedEntries.current.delete(doorId);
        continue;
      }
      const center = groupWorldCenter(group);
      const distance = horizontalGateDistance(cameraPosition, center);
      // Одной горизонтальной дистанции мало: без порога по высоте дверь
      // поднятой гондолы открывается с земли под ней.
      const rise = Math.abs(cameraPosition[1] - center[1]);
      const approachRadius = plugSlideApproachRadius(group.plugSlide);
      const releaseRadius = plugSlideReleaseRadius(group.plugSlide);
      if (
        distance <= approachRadius &&
        rise <= DOOR_APPROACH_HEIGHT &&
        distance < nearestEntryDistance
      ) {
        nearestEntry = {
          id: doorId,
          kind: group.townHouseDoor || group.plugSlide ? "town-door" : "door",
        };
        nearestEntryDistance = distance;
      }
      if (distance > releaseRadius || rise > DOOR_APPROACH_HEIGHT + 1) {
        openedEntries.current.delete(doorId);
      }
    }

    const currentEntry = approachedEntry.current;
    if (
      nearestEntry?.id !== currentEntry?.id ||
      nearestEntry?.kind !== currentEntry?.kind
    ) {
      approachedEntry.current = nearestEntry;
      onEntryApproachChange(nearestEntry);
    }
    if (handledEntryRequest.current !== entryOpenRequestVersion) {
      handledEntryRequest.current = entryOpenRequestVersion;
      const approached = approachedEntry.current;
      if (
        approached &&
        entryInteractionMatches(
          entryOpenRequestTargetRef?.current,
          approached,
        )
      ) {
        openedEntries.current.add(approached.id);
      }
    }

    openEntries?.current.clear();

    for (const group of doorGroups) {
      const clusterId = group.members[0]?.piece.clusterId;
      if (
        hingedDoorLockedToCarrier({
          clusterId,
          dockedVehicles: dockedVehicles?.current,
          vehicleFramePoses: vehicleFramePoses?.current,
        })
      ) {
        const locked = states.current.get(group.key);
        if (locked) {
          locked.angle = 0;
          locked.sign = 0;
        }
        continue;
      }
      const hinge = group.hinge;
      const center = groupWorldCenter(group);
      const carrier = dockedCarrierFrame(group);
      const carrierRotation = carrier
        ? vehicleRotation(carrier.pose, carrier.nose)
        : null;
      let state = states.current.get(group.key);
      if (!state) {
        state = { angle: 0, sign: 0 };
        states.current.set(group.key, state);
      }

      // One open/close decision for the whole leaf, measured to the leaf centre.
      const dx = camera.position.x - center[0];
      const dy = camera.position.y - center[1];
      const dz = camera.position.z - center[2];
      const distance = Math.hypot(dx, dy, dz);
      let open: boolean;
      if (group.hallGate) {
        // Ворота зала живут своим распорядком: днём настежь, на ночь сами
        // затворяются. Запрос игрока их не касается — для этого боковой вход.
        state.sign = group.hallGate.swingSign;
        open = entryOpenRequests?.current.has(group.hallGate.gateId) ?? false;
      } else if (group.automaticSlide) {
        open = automaticSlideDoorShouldOpen(
          distance,
          state.angle > 0.05,
          group.automaticSlide,
        );
      } else {
        const interactiveEntryId = group.gate?.gateId
          ?? group.vikingDoor?.doorId
          ?? group.townHouseDoor?.doorId
          ?? group.plugSlide?.doorId
          ?? group.tailRamp?.doorId;
        // (обычные двери и ворота деревни)
        if (interactiveEntryId) {
          open =
            openedEntries.current.has(interactiveEntryId) ||
            (entryOpenRequests?.current.has(interactiveEntryId) ?? false);
          if (open) {
            if (group.gate) {
              state.sign = group.gate.swingSign;
            } else if (group.tailRamp) {
              state.sign = Math.sign(group.tailRamp.openAngle) || -1;
            } else if (group.vikingDoor || group.townHouseDoor) {
              state.sign = inwardDoorSwingSign(
                center,
                hinge.pivot,
                hinge.normal,
              );
            }
          }
        } else if (state.angle > 0.05) {
          open = distance < 3.6;
        } else {
          directionToDoor.current
            .set(
              center[0] - camera.position.x,
              center[1] - camera.position.y,
              center[2] - camera.position.z,
            )
            .normalize();
          open =
            distance < 2.8 &&
            directionToDoor.current.dot(cameraDirection.current) > 0.25;
        }
      }

      if (
        !group.hallGate &&
        !group.gate &&
        !group.vikingDoor &&
        !group.townHouseDoor &&
        !group.automaticSlide &&
        !group.tailRamp &&
        open &&
        state.sign === 0
      ) {
        const side =
          Math.sign(dx * hinge.normal[0] + dz * hinge.normal[2]) || 1;
        const crossDotNormal =
          hinge.direction[2] * hinge.normal[0] -
          hinge.direction[0] * hinge.normal[2];
        state.sign = -side * Math.sign(crossDotNormal || 1);
      }

      // Житель проходит не тогда, когда попросил, а когда створ ДЕЙСТВИТЕЛЬНО
      // ушёл в сторону. Порог в треть распаха — это уже проходимый проём.
      if (openEntries) {
        const entryId =
          group.hallGate?.gateId ??
          group.gate?.gateId ??
          group.vikingDoor?.doorId ??
          group.townHouseDoor?.doorId ??
          group.plugSlide?.doorId ??
          group.automaticSlide?.doorId ??
          group.tailRamp?.doorId;
        if (entryId && state.angle > 0.6) {
          openEntries.current.add(entryId);
        }
      }

      // Ворота зала стоят открытыми весь день, поэтому их отводят почти
      // вплотную к торцу: створка под сто градусов торчала бы прямо в подход,
      // и входящие обтирали бы её боками.
      // У прислонно-сдвижной створки «угол» — это доля хода 0..1.
      const targetAngle = open
        ? group.plugSlide || group.automaticSlide
          ? 1
          : group.tailRamp
            ? Math.abs(group.tailRamp.openAngle)
          : group.hallGate
            ? 2.9
            : group.gate
              ? 1.45
              : 1.8
        : 0;
      const previousAngle = state.angle;
      state.angle +=
        (targetAngle - state.angle) * Math.min(
          1,
          delta * (group.plugSlide || group.automaticSlide
            ? open ? 2.4 : 2.0
            : group.tailRamp
              ? open ? 0.9 : 0.72
            : group.gate ? open ? 2.7 : 2.1 : open ? 5 : 3),
        );
      doorMoved ||= Math.abs(state.angle - previousAngle) > 0.0005;

      const closedNow = !open && state.angle < 0.02;
      if (closedNow) {
        state.angle = 0;
        state.sign = 0;
      }

      // Прислонно-сдвижная створка: сперва выходит из проёма по нормали, затем
      // едет вдоль борта (право = up × наружная нормаль, знак — slideSign).
      // Поворота нет вовсе — полотно и ручка просто переносятся вместе.
      const plug = group.plugSlide;
      const automaticSlide = group.automaticSlide;
      const plugOffset = plug
        ? Math.min(1, state.angle / plug.plugShare) * plug.plugDepth
        : 0;
      const slideOffset = plug
        ? Math.max(0, (state.angle - plug.plugShare) / (1 - plug.plugShare))
          * plug.travel
          * (plug.slideSign ?? 1)
        : automaticSlide
          ? state.angle * automaticSlide.travel * automaticSlide.slideSign
          : 0;
      const slideRight: readonly [number, number, number] = [
        hinge.normal[2],
        0,
        -hinge.normal[0],
      ];

      if (
        doorDiagnostics &&
        (
          doorDiagnosticTarget === group.key ||
          (!doorDiagnosticTarget && (plug || group.tailRamp))
        )
      ) {
        carrierDoorTelemetry = {
          id: plug?.doorId ?? group.tailRamp?.doorId ?? group.key,
          angle: state.angle,
          targetAngle,
          open,
          carrier: carrier !== null,
          bodyPositions: group.members.flatMap((member) => {
            const body = bodies.current.get(member.piece.id);
            if (!body) {
              return [];
            }
            const position = body.translation();
            return [[position.x, position.y, position.z] as const];
          }),
          bodyRotations: group.members.flatMap((member) => {
            const body = bodies.current.get(member.piece.id);
            if (!body) {
              return [];
            }
            const rotation = body.rotation();
            return [[
              rotation.x,
              rotation.y,
              rotation.z,
              rotation.w,
            ] as const];
          }),
        };
      }

      // The same rotation is applied to every surviving board and strap, each
      // orbiting the shared pivot — so the leaf stays one rigid piece.
      doorQuaternion.current.setFromAxisAngle(
        doorUpAxis.current.set(...hingedLeafRotationAxis(group.key)),
        state.sign * state.angle,
      );
      for (const member of group.members) {
        const piece = member.piece;
        if (brokenPieces.current.has(piece.id)) {
          continue;
        }
        // В полёте створка принадлежит кадру. После физического приёма
        // швартовом она снова наша, но всё ещё преобразуется через текущую
        // позу корабля, пока лебёдка выбирает последние сантиметры.
        if (movingVehicles?.current.has(piece.clusterId) && !carrier) {
          continue;
        }
        const body = bodies.current.get(piece.id);
        if (!body) {
          continue;
        }
        if (closedNow) {
          if (carrier && carrierRotation) {
            const placed = vehiclePiecePosition(
              carrier.origin,
              piece.position,
              carrier.pose,
              carrierRotation,
            );
            const rotated = multiplyQuaternions(carrierRotation, [
              member.baseQuaternion.x,
              member.baseQuaternion.y,
              member.baseQuaternion.z,
              member.baseQuaternion.w,
            ]);
            if (body.bodyType() !== rapier.RigidBodyType.KinematicPositionBased) {
              body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
            }
            body.setNextKinematicTranslation({ x: placed[0], y: placed[1], z: placed[2] });
            body.setNextKinematicRotation({
              x: rotated[0], y: rotated[1], z: rotated[2], w: rotated[3],
            });
            continue;
          }
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
        if (plug || automaticSlide) {
          const localPosition: readonly [number, number, number] = [
            piece.position[0] + hinge.normal[0] * plugOffset + slideRight[0] * slideOffset,
            piece.position[1],
            piece.position[2] + hinge.normal[2] * plugOffset + slideRight[2] * slideOffset,
          ];
          const placed = carrier && carrierRotation
            ? vehiclePiecePosition(carrier.origin, localPosition, carrier.pose, carrierRotation)
            : localPosition;
          const rotated = carrierRotation
            ? multiplyQuaternions(carrierRotation, [
                member.baseQuaternion.x,
                member.baseQuaternion.y,
                member.baseQuaternion.z,
                member.baseQuaternion.w,
              ])
            : [
                member.baseQuaternion.x,
                member.baseQuaternion.y,
                member.baseQuaternion.z,
                member.baseQuaternion.w,
              ] as const;
          body.setNextKinematicTranslation({
            x: placed[0],
            y: placed[1],
            z: placed[2],
          });
          body.setNextKinematicRotation({
            x: rotated[0],
            y: rotated[1],
            z: rotated[2],
            w: rotated[3],
          });
          continue;
        }
        if (group.tailRamp) {
          rampQuaternion.current.setFromAxisAngle(
            rampAxis.current
              .set(...group.tailRamp.rotationAxis)
              .normalize(),
            state.sign * state.angle,
          );
          doorRelative.current.set(
            piece.position[0] - hinge.pivot[0],
            piece.position[1] - hinge.pivot[1],
            piece.position[2] - hinge.pivot[2],
          ).applyQuaternion(rampQuaternion.current);
          const localPosition: readonly [number, number, number] = [
            hinge.pivot[0] + doorRelative.current.x,
            hinge.pivot[1] + doorRelative.current.y,
            hinge.pivot[2] + doorRelative.current.z,
          ];
          const placed = carrier && carrierRotation
            ? vehiclePiecePosition(
                carrier.origin,
                localPosition,
                carrier.pose,
                carrierRotation,
              )
            : localPosition;
          const localRotation = multiplyQuaternions(
            [
              rampQuaternion.current.x,
              rampQuaternion.current.y,
              rampQuaternion.current.z,
              rampQuaternion.current.w,
            ],
            [
              member.baseQuaternion.x,
              member.baseQuaternion.y,
              member.baseQuaternion.z,
              member.baseQuaternion.w,
            ],
          );
          const rotated = carrierRotation
            ? multiplyQuaternions(carrierRotation, localRotation)
            : localRotation;
          body.setNextKinematicTranslation({
            x: placed[0],
            y: placed[1],
            z: placed[2],
          });
          body.setNextKinematicRotation({
            x: rotated[0],
            y: rotated[1],
            z: rotated[2],
            w: rotated[3],
          });
          continue;
        }
        doorRelative.current.set(
          piece.position[0] - hinge.pivot[0],
          0,
          piece.position[2] - hinge.pivot[2],
        ).applyQuaternion(doorQuaternion.current);
        body.setNextKinematicTranslation({
          x: hinge.pivot[0] + doorRelative.current.x,
          y: piece.position[1],
          z: hinge.pivot[2] + doorRelative.current.z,
        });
        // Ordinary doors retain the original vertical yaw mechanism. Ramp
        // kinematics above must never reinterpret their authored leaf vector
        // as a hinge axis.
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

    if (doorDiagnostics) {
      const now = performance.now();
      if (now >= carrierDoorTelemetryAt.current) {
        carrierDoorTelemetryAt.current = now + 100;
        document.documentElement.dataset.mamCarrierDoor = JSON.stringify(
          carrierDoorTelemetry,
        );
      }
    }

    if (doorMoved && shadowAccumulator.current > 0.18) {
      shadowAccumulator.current = 0;
      shadowRefreshRequested.current = true;
    }
  });

  useEffect(() => () => {
    delete document.documentElement.dataset.mamCarrierDoor;
  }, []);

  // Shadow rendering belongs to the render clock; physical door poses do not.
  useFrame((frameState) => {
    if (!shadowRefreshRequested.current) {
      return;
    }
    shadowRefreshRequested.current = false;
    frameState.gl.shadowMap.needsUpdate = true;
  });

  return null;
}
