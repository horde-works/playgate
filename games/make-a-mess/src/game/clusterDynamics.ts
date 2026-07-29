import type { BreakablePieceDefinition, SceneVector3 } from "./destructionScene";

/**
 * Физика движущегося кластера: масса, центр масс, тензор инерции и
 * интегратор твёрдого тела.
 *
 * Смысл модуля в том, что поведение объекта НЕ прописывается кривыми, а
 * следует из его устройства. Подъём приложен в центре объёма оболочки, вес —
 * в центре масс, который висит ниже: эта пара сама даёт маятник, отвисающую
 * гондолу и клевок на торможении. Снесли хвостовой вагон — центр масс уехал
 * вперёд, плечо пары изменилось, нос задрался. Не как фича, а как арифметика.
 *
 * Модуль намеренно чистый: ни three, ни rapier, ни сцены. Плотности приходят
 * функцией, куски — массивом. Всё, что здесь есть, считается в тесте.
 */

export type Quaternion = readonly [number, number, number, number];
export type Matrix3 = readonly number[];   // 9 чисел, по строкам

export const IDENTITY_QUATERNION: Quaternion = [0, 0, 0, 1];

export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function normalizeQuaternion(q: Quaternion): Quaternion {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

export function quaternionAboutAxis(axis: SceneVector3, angle: number): Quaternion {
  const length = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const half = angle / 2;
  const s = Math.sin(half) / length;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

export function rotateVector(q: Quaternion, v: SceneVector3): SceneVector3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

export function conjugateQuaternion(q: Quaternion): Quaternion {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Матрица поворота из эйлеров сцены (интринсический XYZ, как в компиляторе). */
export function rotationMatrixFromEuler(euler: SceneVector3): Matrix3 {
  const [rx, ry, rz] = euler;
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  // Столбцы — образы локальных осей, как их строит compileScene.
  return [
    cy * cz, -cy * sz, sy,
    sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
    -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy,
  ];
}

export function multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += a[row * 3 + k] * b[k * 3 + column];
      }
      out[row * 3 + column] = sum;
    }
  }
  return out;
}

export function transposeMatrix(m: Matrix3): Matrix3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function applyMatrix(m: Matrix3, v: SceneVector3): SceneVector3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function invertSymmetricMatrix(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) {
    return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  const inv = 1 / determinant;
  return [
    (e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv,
    (f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    (d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

export function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Массовые свойства кластера, посчитанные по УЦЕЛЕВШИМ кускам. */
export interface MassProperties {
  readonly mass: number;
  /** Центр масс в тех же координатах, в которых заданы куски. */
  readonly centre: SceneVector3;
  /** Тензор инерции относительно центра масс. */
  readonly inertia: Matrix3;
  readonly inverseInertia: Matrix3;
  readonly pieces: number;
}

/**
 * Mass seen by an impulse at a body point along one world-space direction.
 * This includes the angular acceleration created by the impulse arm, unlike
 * a plain fraction of total mass.
 */
export function pointEffectiveMass(
  properties: MassProperties,
  orientation: Quaternion,
  lever: SceneVector3,
  direction: SceneVector3,
): number {
  const directionLength = Math.hypot(...direction);
  if (properties.mass <= 0 || directionLength <= 1e-9) {
    return 0;
  }
  const unitDirection: SceneVector3 = [
    direction[0] / directionLength,
    direction[1] / directionLength,
    direction[2] / directionLength,
  ];
  const angularImpulseWorld = cross(lever, unitDirection);
  const angularImpulseBody = rotateVector(
    conjugateQuaternion(orientation),
    angularImpulseWorld,
  );
  const angularResponseBody = applyMatrix(
    properties.inverseInertia,
    angularImpulseBody,
  );
  const inverseEffectiveMass = 1 / properties.mass +
    angularImpulseBody[0] * angularResponseBody[0] +
    angularImpulseBody[1] * angularResponseBody[1] +
    angularImpulseBody[2] * angularResponseBody[2];
  return inverseEffectiveMass > 1e-12 ? 1 / inverseEffectiveMass : 0;
}

export const EMPTY_MASS: MassProperties = {
  mass: 0,
  centre: [0, 0, 0],
  inertia: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  inverseInertia: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  pieces: 0,
};

export function pieceMass(
  piece: BreakablePieceDefinition,
  densityOf: (material: BreakablePieceDefinition["material"]) => number,
): number {
  const volume =
    piece.volume ?? piece.size[0] * piece.size[1] * piece.size[2];
  return volume * densityOf(piece.material);
}

/**
 * Масса, центр масс и тензор инерции набора кусков. Инерция каждой коробки
 * считается в её собственных осях и поворачивается в мир — иначе повёрнутые
 * куски (а их у корабля половина) врали бы.
 */
export function massProperties(
  pieces: readonly BreakablePieceDefinition[],
  densityOf: (material: BreakablePieceDefinition["material"]) => number,
): MassProperties {
  let mass = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const piece of pieces) {
    const m = pieceMass(piece, densityOf);
    mass += m;
    cx += m * piece.position[0];
    cy += m * piece.position[1];
    cz += m * piece.position[2];
  }
  if (mass <= 0) {
    return EMPTY_MASS;
  }
  const centre: SceneVector3 = [cx / mass, cy / mass, cz / mass];

  const inertia = new Array<number>(9).fill(0);
  for (const piece of pieces) {
    const m = pieceMass(piece, densityOf);
    const [w, h, d] = piece.size;
    // Инерция коробки в её собственных осях.
    const local: Matrix3 = [
      (m / 12) * (h * h + d * d), 0, 0,
      0, (m / 12) * (w * w + d * d), 0,
      0, 0, (m / 12) * (w * w + h * h),
    ];
    const rotation = rotationMatrixFromEuler(piece.rotation ?? [0, 0, 0]);
    const rotated = multiplyMatrices(
      multiplyMatrices(rotation, local),
      transposeMatrix(rotation),
    );
    // Перенос осей: |r|²E − r⊗r.
    const r: SceneVector3 = [
      piece.position[0] - centre[0],
      piece.position[1] - centre[1],
      piece.position[2] - centre[2],
    ];
    const rr = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const shift = m * ((row === column ? rr : 0) - r[row] * r[column]);
        inertia[row * 3 + column] += rotated[row * 3 + column] + shift;
      }
    }
  }

  return {
    mass,
    centre,
    inertia,
    inverseInertia: invertSymmetricMatrix(inertia),
    pieces: pieces.length,
  };
}

export function linearMomentum(
  properties: MassProperties,
  velocity: SceneVector3,
): SceneVector3 {
  return [
    properties.mass * velocity[0],
    properties.mass * velocity[1],
    properties.mass * velocity[2],
  ];
}

export function angularMomentum(
  properties: MassProperties,
  angularVelocity: SceneVector3,
): SceneVector3 {
  return applyMatrix(properties.inertia, angularVelocity);
}

/**
 * Кинетическая энергия — то число, которое потом заберёт столкновение:
 * из него по профилю материала считаются выбитые воксели, и у каждой
 * стороны по своему.
 */
export function kineticEnergy(
  properties: MassProperties,
  velocity: SceneVector3,
  angularVelocity: SceneVector3,
): number {
  const linear =
    0.5 *
    properties.mass *
    (velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
  const L = angularMomentum(properties, angularVelocity);
  const spin =
    0.5 *
    (angularVelocity[0] * L[0] +
      angularVelocity[1] * L[1] +
      angularVelocity[2] * L[2]);
  return linear + spin;
}

/** Состояние твёрдого тела. Положение — это положение ЦЕНТРА МАСС. */
export interface BodyState {
  readonly position: SceneVector3;
  readonly orientation: Quaternion;
  readonly velocity: SceneVector3;
  readonly angularVelocity: SceneVector3;
}

export const RESTING_BODY: BodyState = {
  position: [0, 0, 0],
  orientation: IDENTITY_QUATERNION,
  velocity: [0, 0, 0],
  angularVelocity: [0, 0, 0],
};

/** Сила, приложенная в точке (в мировых координатах). */
export interface AppliedForce {
  readonly force: SceneVector3;
  readonly point: SceneVector3;
}

export interface Damping {
  /** Гасит поступательное движение: F -= k·v. */
  readonly linear: number;
  /** Успокаивает качку: M -= k·(ω − ω_желаемое). */
  readonly angular: number;
  /**
   * Желаемая угловая скорость: демпфируем ОТКЛОНЕНИЕ от неё, а не движение
   * вообще. Иначе успокоение качки заодно тормозило бы установившийся
   * разворот.
   */
  readonly desiredAngularVelocity?: SceneVector3;
}

/**
 * Шаг интегрирования (полунеявный Эйлер). Крутящий момент считается
 * относительно ЦЕНТРА МАСС, тензор инерции живёт в системе тела, поэтому
 * угловая часть считается через момент импульса — включая гироскопический
 * член ω × Iω.
 */
export function stepBody(
  state: BodyState,
  properties: MassProperties,
  forces: readonly AppliedForce[],
  damping: Damping,
  dt: number,
): BodyState {
  if (properties.mass <= 0 || dt <= 0) {
    return state;
  }

  let fx = 0;
  let fy = 0;
  let fz = 0;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  for (const applied of forces) {
    fx += applied.force[0];
    fy += applied.force[1];
    fz += applied.force[2];
    const r: SceneVector3 = [
      applied.point[0] - state.position[0],
      applied.point[1] - state.position[1],
      applied.point[2] - state.position[2],
    ];
    const moment = cross(r, applied.force);
    tx += moment[0];
    ty += moment[1];
    tz += moment[2];
  }

  // Сопротивление среды.
  fx -= damping.linear * state.velocity[0];
  fy -= damping.linear * state.velocity[1];
  fz -= damping.linear * state.velocity[2];

  const desired = damping.desiredAngularVelocity ?? [0, 0, 0];
  tx -= damping.angular * (state.angularVelocity[0] - desired[0]);
  ty -= damping.angular * (state.angularVelocity[1] - desired[1]);
  tz -= damping.angular * (state.angularVelocity[2] - desired[2]);

  const velocity: SceneVector3 = [
    state.velocity[0] + (fx / properties.mass) * dt,
    state.velocity[1] + (fy / properties.mass) * dt,
    state.velocity[2] + (fz / properties.mass) * dt,
  ];
  const position: SceneVector3 = [
    state.position[0] + velocity[0] * dt,
    state.position[1] + velocity[1] * dt,
    state.position[2] + velocity[2] * dt,
  ];

  // Угловая часть — в системе тела.
  const toBody = conjugateQuaternion(state.orientation);
  const omegaBody = rotateVector(toBody, state.angularVelocity);
  const torqueBody = rotateVector(toBody, [tx, ty, tz]);
  const angularMomentumBody = applyMatrix(properties.inertia, omegaBody);
  const gyroscopic = cross(omegaBody, angularMomentumBody);
  const nextMomentumBody: SceneVector3 = [
    angularMomentumBody[0] + (torqueBody[0] - gyroscopic[0]) * dt,
    angularMomentumBody[1] + (torqueBody[1] - gyroscopic[1]) * dt,
    angularMomentumBody[2] + (torqueBody[2] - gyroscopic[2]) * dt,
  ];
  const nextOmegaBody = applyMatrix(properties.inverseInertia, nextMomentumBody);
  const angularVelocity = rotateVector(state.orientation, nextOmegaBody);

  const spin: Quaternion = [
    angularVelocity[0],
    angularVelocity[1],
    angularVelocity[2],
    0,
  ];
  const derivative = multiplyQuaternions(spin, state.orientation);
  const orientation = normalizeQuaternion([
    state.orientation[0] + 0.5 * derivative[0] * dt,
    state.orientation[1] + 0.5 * derivative[1] * dt,
    state.orientation[2] + 0.5 * derivative[2] * dt,
    state.orientation[3] + 0.5 * derivative[3] * dt,
  ]);

  return { position, orientation, velocity, angularVelocity };
}
