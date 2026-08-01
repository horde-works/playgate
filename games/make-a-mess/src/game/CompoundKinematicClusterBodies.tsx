"use client";

import {
  BallCollider,
  CollisionEnterPayload,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Quaternion, Vector3, type Group } from "three";
import type { BreakablePieceDefinition } from "./destructionScene";
import { VEHICLE_CARRIER } from "./physicsInteractionGroups";
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
  /** Normal impulse actually accepted by Rapier's contact solver. */
  readonly normalImpulse: number;
}

/** Мировая точка локальной точки коллайдера rapier. */
function colliderWorldPoint(
  collider: { translation(): Vector3Like; rotation(): QuaternionLike },
  local: Vector3Like,
): [number, number, number] {
  const t = collider.translation();
  const q = collider.rotation();
  // v' = v + 2·q_vec × (q_vec × v + w·v) — поворот кватернионом без three.
  const cx = q.y * local.z - q.z * local.y + q.w * local.x;
  const cy = q.z * local.x - q.x * local.z + q.w * local.y;
  const cz = q.x * local.y - q.y * local.x + q.w * local.z;
  return [
    t.x + local.x + 2 * (q.y * cz - q.z * cy),
    t.y + local.y + 2 * (q.z * cx - q.x * cz),
    t.z + local.z + 2 * (q.x * cy - q.y * cx),
  ];
}

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

interface QuaternionLike extends Vector3Like {
  w: number;
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
  const sensorElements = useMemo(
    () =>
      (definition.proximitySensors ?? []).map((sensor, index) => {
        const enabled = sensor.enabledByDefault ?? sensor.normal[1] < -0.35;
        const direction = new Vector3(...sensor.normal).normalize();
        const orientation = new Quaternion().setFromUnitVectors(
          new Vector3(0, -1, 0),
          direction,
        );
        return (
          <group
            key={`${definition.clusterId}:sensor:${index}`}
            position={[
              sensor.point[0] - definition.origin[0],
              sensor.point[1] - definition.origin[1],
              sensor.point[2] - definition.origin[2],
            ]}
            quaternion={orientation}
          >
            <mesh position={[0, 0.035, 0]}>
              <cylinderGeometry args={[0.045, 0.06, 0.07, 8]} />
              <meshStandardMaterial
                color="#26343b"
                roughness={0.42}
                metalness={0.72}
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.055, 8, 6]} />
              <meshStandardMaterial
                color={enabled ? "#80eaff" : "#25333a"}
                emissive={enabled ? "#30cfee" : "#000000"}
                emissiveIntensity={enabled ? 2.4 : 0}
                roughness={0.3}
                metalness={0.55}
              />
            </mesh>
          </group>
        );
      }),
    [definition.clusterId, definition.origin, definition.proximitySensors],
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
   * физического движка. Здесь только опознание: какой кусок, где именно и
   * куда смотрит поверхность. Импульс уже применён солвером, а вердикт о
   * разрушении принимает владелец тела.
   *
   * Точка берётся из ГЕОМЕТРИЧЕСКИХ контактов манифолда: они живут в narrow
   * phase. Центр коллайдера годился мелкому куску коптера, где ошибка —
   * сантиметры; у метровой плиты дирижабля он врёт и плечом, и адресом
   * встреченной панели. Локальные точки манифолда отдаются в осях сторон
   * ПАРЫ, чей порядок относительно target/other не гарантирован, поэтому обе
   * интерпретации проверяются совпадением мировых точек; пустой манифолд
   * оставляет центр коллайдера как честный фолбэк.
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
      const manifold = payload.manifold;
      const contactCount = manifold.numContacts();
      // Центр контактного патча: у плоского касания первая точка манифолда —
      // угол полигона, а плечо честнее мерить от центра.
      let first: Vector3Like | null = null;
      let second: Vector3Like | null = null;
      let validPairs = 0;
      for (let index = 0; index < contactCount; index += 1) {
        const one = manifold.localContactPoint1(index);
        const two = manifold.localContactPoint2(index);
        if (!one || !two) {
          continue;
        }
        if (validPairs === 0) {
          first = { x: one.x, y: one.y, z: one.z };
          second = { x: two.x, y: two.y, z: two.z };
        } else if (first && second) {
          first.x += one.x;
          first.y += one.y;
          first.z += one.z;
          second.x += two.x;
          second.y += two.y;
          second.z += two.z;
        }
        validPairs += 1;
      }
      if (first && second && validPairs > 1) {
        first.x /= validPairs;
        first.y /= validPairs;
        first.z /= validPairs;
        second.x /= validPairs;
        second.y /= validPairs;
        second.z /= validPairs;
      }
      const targetCollider = payload.target.collider;
      const otherCollider = payload.other.collider;
      if (first && second && targetCollider && otherCollider) {
        // Вариант А: target — первая сторона пары; вариант Б — вторая. У
        // настоящего контакта мировые точки обеих сторон совпадают с точностью
        // до проникновения, поэтому верна та интерпретация, где они сошлись.
        const aVehicle = colliderWorldPoint(targetCollider, first);
        const aWorld = colliderWorldPoint(otherCollider, second);
        const bVehicle = colliderWorldPoint(targetCollider, second);
        const bWorld = colliderWorldPoint(otherCollider, first);
        const gap = (v: readonly number[], w: readonly number[]) =>
          (v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2 + (v[2] - w[2]) ** 2;
        const [vehiclePoint, worldPoint] =
          gap(aVehicle, aWorld) <= gap(bVehicle, bWorld)
            ? [aVehicle, aWorld]
            : [bVehicle, bWorld];
        contactPoint.current.set(
          (vehiclePoint[0] + worldPoint[0]) / 2,
          (vehiclePoint[1] + worldPoint[1]) / 2,
          (vehiclePoint[2] + worldPoint[2]) / 2,
        );
      }
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
        normalImpulse: Array.from(
          { length: manifold.numSolverContacts() },
          (_, index) => Math.max(0, manifold.contactImpulse(index)),
        ).reduce((sum, impulse) => sum + impulse, 0),
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
            density={0}
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
            density={0}
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
            density={0}
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
      type="dynamic"
      position={[...definition.origin]}
      colliders={false}
      collisionGroups={VEHICLE_CARRIER}
      ccd
      gravityScale={0}
      canSleep
      additionalSolverIterations={4}
      onCollisionEnter={onContact ? handleCollision : undefined}
      userData={{ compoundKinematicCluster: definition.clusterId }}
    >
      {colliderElements}
      {sensorElements}
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
