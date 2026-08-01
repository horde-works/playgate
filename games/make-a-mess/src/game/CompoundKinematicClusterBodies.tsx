"use client";

import {
  BallCollider,
  CollisionEnterPayload,
  CollisionExitPayload,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Quaternion, Vector3, type Group } from "three";
import type { BreakablePieceDefinition } from "./destructionScene";
import type { RemnantDefinition } from "./destructionRuntime";
import { VEHICLE_CARRIER } from "./physicsInteractionGroups";
import { createActivePhysicalContactRegistry } from "./vehiclePhysicalContact";
import {
  compoundClusterColliders,
  compoundClusterOwnsPiece,
  type CompoundKinematicClusterDefinition,
  type CompoundKinematicClusterRegistry,
  type CompoundMemberRemnantShape,
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
  detachedPieces,
  consumedPieces,
  remnants,
  registry,
  onContact,
}: {
  definition: CompoundKinematicClusterDefinition;
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  /** Члены, ушедшие из компаунда НАСОВСЕМ (отлом, распыление, пропажа). */
  detachedPieces?: ReadonlySet<string>;
  /** Члены, съеденные carve: их контактную форму дают обрубки. */
  consumedPieces?: ReadonlySet<string>;
  remnants?: readonly RemnantDefinition[];
  registry: CompoundKinematicClusterRegistry;
  onContact?: (contact: CompoundClusterContact) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const visualRoot = useRef<Group>(null);
  const contactPoint = useRef(new Vector3());
  const activePhysicalContacts = useMemo(
    () => createActivePhysicalContactRegistry(),
    [],
  );
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
  // Для контактной формы «ушёл насовсем» и «съеден carve» — разные судьбы:
  // у первого нет ничего, у второго форму дают обрубки. Оба множества
  // проецируются на своих членов тем же примитивным ключом, что и broken.
  const detachedMemberKey = useMemo(() => {
    const source = detachedPieces ?? brokenPieces;
    const ids: string[] = [];
    for (const piece of memberPieces) {
      if (source.has(piece.id)) {
        ids.push(piece.id);
      }
    }
    return ids.join("|");
  }, [brokenPieces, detachedPieces, memberPieces]);
  const detachedMembers = useMemo(
    () => new Set(detachedMemberKey ? detachedMemberKey.split("|") : []),
    [detachedMemberKey],
  );
  const consumedMemberKey = useMemo(() => {
    if (!consumedPieces) {
      return "";
    }
    const ids: string[] = [];
    for (const piece of memberPieces) {
      if (consumedPieces.has(piece.id)) {
        ids.push(piece.id);
      }
    }
    return ids.join("|");
  }, [consumedPieces, memberPieces]);
  const consumedMembers = useMemo(
    () => new Set(consumedMemberKey ? consumedMemberKey.split("|") : []),
    [consumedMemberKey],
  );
  const memberRemnantKey = useMemo(
    () =>
      (remnants ?? [])
        .filter((remnant) => remnant.clusterId === definition.clusterId)
        .map((remnant) => remnant.id)
        .join("|"),
    [definition.clusterId, remnants],
  );
  const memberRemnants = useMemo<readonly CompoundMemberRemnantShape[]>(
    () =>
      (remnants ?? []).filter(
        (remnant) => remnant.clusterId === definition.clusterId,
      ),
    // Ключ по id: обрубок неизменен по содержимому, а чужой carve на другом
    // конце карты не должен пересобирать сотни коллайдеров этой машины.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberRemnantKey],
  );
  const colliders = useMemo(
    () =>
      compoundClusterColliders(
        definition,
        memberPieces,
        detachedMembers,
        consumedMembers,
        memberRemnants,
      ),
    [consumedMembers, definition, detachedMembers, memberPieces, memberRemnants],
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

  // Свежайший состав для регистрации: сам объект регистрации не должен
  // зависеть от него, иначе кластер исчезает из реестра на каждое разрушение.
  const latestMembership = useRef({ memberIds, attachedMemberIds });
  latestMembership.current = { memberIds, attachedMemberIds };

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
      memberIds: latestMembership.current.memberIds,
      attachedMemberIds: latestMembership.current.attachedMemberIds,
      activePhysicalContacts,
    });
    return () => {
      if (registrations.get(definition.clusterId)?.body === current) {
        registrations.delete(definition.clusterId);
      }
    };
    // РЕЕСТР ЖИВЁТ, ПОКА ЖИВО ТЕЛО.
    //
    // Раньше сюда входили и множества членов, а они рождаются заново от
    // ЛЮБОГО разрушения. Эффект перезапускался, его cleanup на мгновение
    // убирал кластер из реестра — и всё, что рождалось в это окно, кластера
    // не находило: обрубки летящей машины вставали в авторскую позу, то есть
    // сыпались на её стоянку за километр от неё самой. Состав обновляется
    // мутацией ниже, поэтому окна пустоты больше нет.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhysicalContacts, definition, registry]);

  // Состав меняется часто; запись в реестре живая и правится на месте.
  useEffect(() => {
    latestMembership.current = { memberIds, attachedMemberIds };
    const runtime = registry.current.get(definition.clusterId);
    if (runtime && runtime.body === body.current) {
      registry.current.set(definition.clusterId, {
        ...runtime,
        memberIds,
        attachedMemberIds,
      });
    }
  }, [attachedMemberIds, definition.clusterId, memberIds, registry]);

  useEffect(
    () => () => activePhysicalContacts.clear(),
    [activePhysicalContacts],
  );

  const contactPairHandles = useCallback(
    (
      payload: CollisionEnterPayload | CollisionExitPayload,
    ): readonly [number, number] | null => {
      const own = payload.target.collider?.handle;
      const other = payload.other.collider?.handle;
      if (own === undefined || other === undefined) {
        return null;
      }
      return [own, other];
    },
    [],
  );

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
      const pair = contactPairHandles(payload);
      if (pair) {
        activePhysicalContacts.enter(pair[0], pair[1]);
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
    [
      activePhysicalContacts,
      contactPairHandles,
      definition.clusterId,
      onContact,
    ],
  );

  const handleCollisionExit = useCallback(
    (payload: CollisionExitPayload) => {
      const pair = contactPairHandles(payload);
      if (pair) {
        activePhysicalContacts.exit(pair[0], pair[1]);
      }
    },
    [activePhysicalContacts, contactPairHandles],
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
      onCollisionExit={handleCollisionExit}
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
  detachedPieces,
  consumedPieces,
  remnants,
  registry,
  onContact,
}: {
  definitions: readonly CompoundKinematicClusterDefinition[];
  pieces: readonly BreakablePieceDefinition[];
  brokenPieces: ReadonlySet<string>;
  detachedPieces?: ReadonlySet<string>;
  consumedPieces?: ReadonlySet<string>;
  remnants?: readonly RemnantDefinition[];
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
          detachedPieces={detachedPieces}
          consumedPieces={consumedPieces}
          remnants={remnants}
          registry={registry}
          onContact={onContact}
        />
      ))}
    </>
  );
}
