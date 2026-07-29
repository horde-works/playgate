"use client";

import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import type { BreakablePieceDefinition } from "./destructionScene";
import {
  compoundClusterColliders,
  compoundClusterOwnsPiece,
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
  const visualRoot = useRef<Group>(null);
  // Полный список кусков сцены сканируется один раз на сцену, а не на каждое
  // разрушение где угодно в мире.
  const memberPieces = useMemo(
    () => pieces.filter((piece) => compoundClusterOwnsPiece(definition, piece)),
    [definition, pieces],
  );
  // brokenPieces — глобальное множество, его identity меняется от любого
  // разрушения в мире. Компаунд же зависит только от своих членов, поэтому
  // проекция на них кодируется примитивным ключом: пока свои куски целы,
  // ключ не меняется — и пересборка сотен коллайдеров не запускается от
  // чужой пулевой дырки на другом конце карты.
  const brokenMemberKey = useMemo(() => {
    const ids: string[] = [];
    for (const piece of memberPieces) {
      if (brokenPieces.has(piece.id)) {
        ids.push(piece.id);
      }
    }
    return ids.join("|");
  }, [brokenPieces, memberPieces]);
  const brokenMembers = useMemo(
    () => new Set(brokenMemberKey ? brokenMemberKey.split("|") : []),
    [brokenMemberKey],
  );
  const colliders = useMemo(
    () => compoundClusterColliders(definition, memberPieces, brokenMembers),
    [brokenMembers, definition, memberPieces],
  );
  const memberIds = useMemo(
    () =>
      new Set(
        memberPieces
          .filter((piece) => !brokenPieces.has(piece.id))
          .map((piece) => piece.id),
      ),
    [brokenPieces, memberPieces],
  );
  const attachedMemberIds = useMemo(
    () =>
      new Set(
        pieces
          .filter(
            (piece) =>
              piece.clusterId === definition.clusterId &&
              !brokenPieces.has(piece.id),
          )
          .map((piece) => piece.id),
      ),
    [brokenPieces, definition.clusterId, pieces],
  );

  useEffect(() => {
    const current = body.current;
    const currentVisualRoot = visualRoot.current;
    if (!current || !currentVisualRoot) {
      return undefined;
    }
    const registrations = registry.current;
    registrations.set(definition.clusterId, {
      definition,
      body: current,
      visualRoot: currentVisualRoot,
      memberIds,
      attachedMemberIds,
    });
    return () => {
      if (registrations.get(definition.clusterId)?.body === current) {
        registrations.delete(definition.clusterId);
      }
    };
  }, [attachedMemberIds, definition, memberIds, registry]);

  // Стабильные элементы: при ре-рендере родителя по чужому поводу React
  // сравнивает те же самые ссылки и не переустанавливает пропы у сотен
  // коллайдеров (инлайновые массивы args/position ломали бы memo).
  const colliderElements = useMemo(
    () =>
      colliders.map((collider) =>
        collider.shape === "sphere" ? (
          <BallCollider
            key={collider.id}
            args={collider.args as [number]}
            position={[...collider.position]}
            friction={collider.friction}
            restitution={collider.restitution}
          />
        ) : collider.shape === "cylinder" ? (
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
      ),
    [colliders],
  );

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
      {colliderElements}
      <group ref={visualRoot} />
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
