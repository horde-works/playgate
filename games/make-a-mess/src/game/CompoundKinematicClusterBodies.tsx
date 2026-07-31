"use client";

import {
  BallCollider,
  CollisionEnterPayload,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Vector3, type Group } from "three";
import type { BreakablePieceDefinition } from "./destructionScene";
import {
  compoundClusterColliders,
  compoundClusterOwnsPiece,
  type CompoundKinematicClusterDefinition,
  type CompoundKinematicClusterRegistry,
} from "./compoundKinematicCluster";

/**
 * Один удар глазами мира: какой кусок машины во что въехал и где.
 *
 * Здесь нет ни скоростей, ни массы, ни вердиктов — только факт встречи. Всё
 * остальное считает владелец тела, потому что только он знает свою позу.
 */
export interface CompoundClusterContact {
  readonly clusterId: string;
  /** Piece of the carrier that met the world. */
  readonly pieceId: string;
  /** World contact point. */
  readonly point: readonly [number, number, number];
  /** Unit normal pointing from the obstacle surface toward the carrier. */
  readonly normal: readonly [number, number, number];
}

function CompoundKinematicClusterBody({
  definition,
  pieces,
  brokenPieces,
  registry,
  onContact,
}: {
  definition: CompoundKinematicClusterDefinition;
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  registry: CompoundKinematicClusterRegistry;
  onContact?: (contact: CompoundClusterContact) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const visualRoot = useRef<Group>(null);
  const contactPoint = useRef(new Vector3());
  // Значение берётся у самого движка, а не прямым импортом: пакет rapier —
  // транзитивная зависимость react-three-rapier и в package.json не объявлен.
  const { rapier } = useRapier();
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

  /**
   * УДАР. Мир видит машину обычным объектом, поэтому событие приходит из
   * движка, а не из щупов. Здесь только опознание: какой кусок и куда смотрит
   * поверхность. Импульс, энергия и вердикты — у владельца тела.
   *
   * Точка берётся по коллайдеру, а не по манифольду: у пары «кинематическое ↔
   * статическое» солвер не работает, solver-контактов может не быть вовсе, а
   * куски машины мелкие — сантиметры разницы не меняют ни плечо, ни адрес
   * встреченной панели.
   */
  const handleCollision = useCallback(
    (payload: CollisionEnterPayload) => {
      const handler = onContact;
      const object = payload.target.colliderObject;
      if (!handler || !object) {
        return;
      }
      const pieceId = object.name;
      if (!pieceId) {
        return;
      }
      object.getWorldPosition(contactPoint.current);
      const raw = payload.manifold.normal();
      let nx = raw.x;
      let ny = raw.y;
      let nz = raw.z;
      const length = Math.hypot(nx, ny, nz);
      if (length <= 1e-6) {
        return;
      }
      nx /= length;
      ny /= length;
      nz /= length;
      // Нормаль обязана смотреть ИЗ поверхности препятствия в машину. Знак у
      // манифольда зависит от порядка коллайдеров в паре, поэтому он не
      // угадывается, а проверяется геометрией: от точки контакта к центру
      // собственного куска.
      const bodyPosition = payload.target.rigidBody
        ? payload.target.rigidBody.translation()
        : { x: 0, y: 0, z: 0 };
      const toCarrier = [
        bodyPosition.x - contactPoint.current.x,
        bodyPosition.y - contactPoint.current.y,
        bodyPosition.z - contactPoint.current.z,
      ];
      if (nx * toCarrier[0] + ny * toCarrier[1] + nz * toCarrier[2] < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      handler({
        clusterId: definition.clusterId,
        pieceId,
        point: [
          contactPoint.current.x,
          contactPoint.current.y,
          contactPoint.current.z,
        ],
        normal: [nx, ny, nz],
      });
    },
    [definition.clusterId, onContact],
  );

  // Стабильные элементы: при ре-рендере родителя по чужому поводу React
  // сравнивает те же самые ссылки и не переустанавливает пропы у сотен
  // коллайдеров (инлайновые массивы args/position ломали бы memo).
  const colliderElements = useMemo(
    () =>
      colliders.map((collider) =>
        collider.shape === "sphere" ? (
          <BallCollider
            key={collider.id}
            name={collider.sourceId}
            args={collider.args as [number]}
            position={[...collider.position]}
            friction={collider.friction}
            restitution={collider.restitution}
          />
        ) : collider.shape === "cylinder" ? (
          <CylinderCollider
            key={collider.id}
            name={collider.sourceId}
            args={collider.args as [number, number]}
            position={[...collider.position]}
            rotation={[...collider.rotation]}
            friction={collider.friction}
            restitution={collider.restitution}
          />
        ) : (
          <CuboidCollider
            key={collider.id}
            name={collider.sourceId}
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
      // Пара «кинематическое ↔ статическое» по умолчанию не считается вовсе,
      // поэтому целый мир машину не видел. Без этого флага удара о дом нет как
      // события, а не как урона.
      activeCollisionTypes={
        rapier.ActiveCollisionTypes.DEFAULT |
        rapier.ActiveCollisionTypes.KINEMATIC_FIXED
      }
      onCollisionEnter={onContact ? handleCollision : undefined}
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
  onContact,
}: {
  definitions: readonly CompoundKinematicClusterDefinition[];
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  registry: CompoundKinematicClusterRegistry;
  onContact?: (contact: CompoundClusterContact) => void;
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
          onContact={onContact}
        />
      ))}
    </>
  );
}
