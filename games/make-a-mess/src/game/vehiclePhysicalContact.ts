interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ContactManifoldLike {
  numSolverContacts(): number;
  solverContactPoint(index: number): Vector3Like;
  normal(): Vector3Like;
}

interface NarrowPhaseLike {
  contactPairsWith(
    collider: number,
    callback: (other: number) => void,
  ): void;
  contactPair(
    first: number,
    second: number,
    callback: (manifold: ContactManifoldLike) => void,
  ): void;
}

interface ContactBodyLike {
  worldCom(): Vector3Like;
  numColliders(): number;
  collider(index: number): { readonly handle: number };
}

export interface ActivePhysicalContactRegistry {
  /** Record one real collider pair reported by Rapier. */
  enter(ownCollider: number, otherCollider: number): void;
  /** Remove a pair when Rapier reports that its contact ended. */
  exit(ownCollider: number, otherCollider: number): void;
  /** Iterate only pairs which are currently touching the carrier. */
  forEach(callback: (ownCollider: number, otherCollider: number) => void): void;
  size(): number;
  clear(): void;
}

/**
 * Event-driven support ledger for compound carriers.
 *
 * The former runtime path crossed the JS/Wasm boundary once for every
 * collider on every 60 Hz step (more than a thousand calls for the sky ram),
 * even while the vehicle was airborne. Rapier already emits exact pair
 * enter/exit events, so keep only those live pairs. Their current manifold is
 * still checked every step because a persistent contact can rotate from floor
 * to wall without exiting. Cost is therefore O(active contacts), not
 * O(carrier colliders). The full scanner below remains a diagnostic oracle.
 */
export function createActivePhysicalContactRegistry(): ActivePhysicalContactRegistry {
  const activePairs = new Map<string, readonly [number, number]>();
  const pairId = (ownCollider: number, otherCollider: number) =>
    ownCollider < otherCollider
      ? `${ownCollider}:${otherCollider}`
      : `${otherCollider}:${ownCollider}`;
  return {
    enter(ownCollider, otherCollider) {
      activePairs.set(pairId(ownCollider, otherCollider), [
        ownCollider,
        otherCollider,
      ]);
    },
    exit(ownCollider, otherCollider) {
      activePairs.delete(pairId(ownCollider, otherCollider));
    },
    forEach(callback) {
      activePairs.forEach(([ownCollider, otherCollider]) =>
        callback(ownCollider, otherCollider),
      );
    },
    size() {
      return activePairs.size;
    },
    clear() {
      activePairs.clear();
    },
  };
}

/**
 * ЧТО ВНЕШНИЙ МИР ДЕЛАЕТ С МАШИНОЙ ПРЯМО СЕЙЧАС — одним снимком.
 *
 * Раньше из контактов извлекали ровно одно число: сколько манифестов держат
 * машину снизу. Этого хватает, чтобы понять «села», и не хватает ни для чего
 * другого. Между тем в тех же манифестах лежит ответ на вопрос, который
 * дороже: КУДА МИР ТОЛКАЕТ. Машина, зацепившаяся за обломок, отличается от
 * стоящей на грунте не количеством контактов, а направлением их нормалей — и
 * выход из зацепа считается по ним же.
 *
 * Поэтому примитив здесь один и он полный; счётчик опор ниже — его частный
 * случай. Два обхода одних и тех же манифестов с двумя копиями правила о
 * знаке нормали были бы вторым шансом ошибиться этим знаком.
 */
export interface ExternalContactSummary {
  /** Сколько чужих тел сейчас касаются машины. */
  readonly count: number;
  /**
   * Сколько из них ПОДПИРАЮТ её снизу. Это и есть прежний счётчик опор:
   * нормаль, направленная к телу, смотрит вверх круче 0.35.
   */
  readonly support: number;
  /**
   * Куда мир толкает машину — сумма нормалей, приведённых к направлению «в
   * тело», нормированная. Нулевой вектор означает уравновешенный зажим: мир
   * давит со всех сторон разом, и одного направления выхода у него нет.
   */
  readonly push: readonly [number, number, number];
}

/** Ничего не касается. Общий неизменяемый ноль, чтобы не плодить объекты. */
export const NO_EXTERNAL_CONTACTS: ExternalContactSummary = {
  count: 0,
  support: 0,
  push: [0, 0, 0],
};

/**
 * Summarise only manifolds which are currently active.
 *
 * `isSelfDebris` excludes the carrier's OWN freshly detached parts. A piece
 * that just broke off materialises inside the hull and leans on it; counted as
 * ground, it makes a flying machine believe it has landed — one broken window
 * was enough to end a healthy flight. Membership ends where the fragment
 * leaves the hull envelope: from there it is an ordinary obstacle again.
 */
export function summariseExternalContacts(
  narrowPhase: NarrowPhaseLike,
  body: ContactBodyLike,
  contacts: Pick<ActivePhysicalContactRegistry, "forEach">,
  isSelfDebris?: (otherCollider: number) => boolean,
): ExternalContactSummary {
  const bodyCentre = body.worldCom();
  let count = 0;
  let support = 0;
  let pushX = 0;
  let pushY = 0;
  let pushZ = 0;
  contacts.forEach((ownCollider, otherCollider) => {
    if (isSelfDebris?.(otherCollider)) {
      return;
    }
    narrowPhase.contactPair(ownCollider, otherCollider, (manifold) => {
      if (manifold.numSolverContacts() === 0) {
        return;
      }
      const point = manifold.solverContactPoint(0);
      const normal = manifold.normal();
      // Rapier не обещает, в какую сторону смотрит нормаль пары: она может
      // смотреть и от машины, и в неё. Приводим её к направлению «в тело» —
      // это и есть та сила, которую машина получает.
      const towardBody =
        normal.x * (bodyCentre.x - point.x) +
        normal.y * (bodyCentre.y - point.y) +
        normal.z * (bodyCentre.z - point.z);
      const sign = towardBody >= 0 ? 1 : -1;
      count += 1;
      pushX += normal.x * sign;
      pushY += normal.y * sign;
      pushZ += normal.z * sign;
      if (normal.y * sign > 0.35) {
        support += 1;
      }
    });
  });
  if (count === 0) {
    return NO_EXTERNAL_CONTACTS;
  }
  const length = Math.hypot(pushX, pushY, pushZ);
  return {
    count,
    support,
    push:
      length > 1e-6
        ? [pushX / length, pushY / length, pushZ / length]
        : [0, 0, 0],
  };
}

/**
 * Count supports by refreshing only manifolds which are currently active.
 * Частный случай `summariseExternalContacts`; оставлен отдельным именем ради
 * читаемости места вызова и старых замеров.
 */
export function countActiveUpwardSupportContacts(
  narrowPhase: NarrowPhaseLike,
  body: ContactBodyLike,
  contacts: Pick<ActivePhysicalContactRegistry, "forEach">,
  isSelfDebris?: (otherCollider: number) => boolean,
): number {
  return summariseExternalContacts(narrowPhase, body, contacts, isSelfDebris)
    .support;
}

/**
 * Counts real Rapier manifolds whose surface normal carries the body upward.
 * Persistence and low-velocity landing criteria remain policy; this function
 * reports only physical contact and never invents a reaction force.
 */
export function countUpwardSupportContacts(
  narrowPhase: NarrowPhaseLike,
  body: ContactBodyLike,
): number {
  const bodyCentre = body.worldCom();
  const seenPairs = new Set<string>();
  let contacts = 0;
  for (let index = 0; index < body.numColliders(); index += 1) {
    const ownCollider = body.collider(index);
    narrowPhase.contactPairsWith(ownCollider.handle, (otherHandle) => {
      const pairKey = `${ownCollider.handle}:${otherHandle}`;
      if (seenPairs.has(pairKey)) {
        return;
      }
      seenPairs.add(pairKey);
      narrowPhase.contactPair(
        ownCollider.handle,
        otherHandle,
        (manifold) => {
          if (manifold.numSolverContacts() === 0) {
            return;
          }
          const point = manifold.solverContactPoint(0);
          const normal = manifold.normal();
          const towardBody =
            normal.x * (bodyCentre.x - point.x) +
            normal.y * (bodyCentre.y - point.y) +
            normal.z * (bodyCentre.z - point.z);
          const normalY = towardBody >= 0 ? normal.y : -normal.y;
          if (normalY > 0.35) {
            contacts += 1;
          }
        },
      );
    });
  }
  return contacts;
}
