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

/** Mass properties in the representation expected by Rapier. */
export interface PrincipalMassProperties {
  readonly mass: number;
  readonly centre: SceneVector3;
  readonly principalInertia: SceneVector3;
  readonly inertiaFrame: Quaternion;
}

/** Converts a rotation matrix (principal axes in columns) to a quaternion. */
function quaternionFromRotationMatrix(matrix: Matrix3): Quaternion {
  const trace = matrix[0] + matrix[4] + matrix[8];
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    w = scale / 4;
    x = (matrix[7] - matrix[5]) / scale;
    y = (matrix[2] - matrix[6]) / scale;
    z = (matrix[3] - matrix[1]) / scale;
  } else if (matrix[0] > matrix[4] && matrix[0] > matrix[8]) {
    const scale = Math.sqrt(1 + matrix[0] - matrix[4] - matrix[8]) * 2;
    w = (matrix[7] - matrix[5]) / scale;
    x = scale / 4;
    y = (matrix[1] + matrix[3]) / scale;
    z = (matrix[2] + matrix[6]) / scale;
  } else if (matrix[4] > matrix[8]) {
    const scale = Math.sqrt(1 + matrix[4] - matrix[0] - matrix[8]) * 2;
    w = (matrix[2] - matrix[6]) / scale;
    x = (matrix[1] + matrix[3]) / scale;
    y = scale / 4;
    z = (matrix[5] + matrix[7]) / scale;
  } else {
    const scale = Math.sqrt(1 + matrix[8] - matrix[0] - matrix[4]) * 2;
    w = (matrix[3] - matrix[1]) / scale;
    x = (matrix[2] + matrix[6]) / scale;
    y = (matrix[5] + matrix[7]) / scale;
    z = scale / 4;
  }
  return normalizeQuaternion([x, y, z, w]);
}

/**
 * Diagonalises the authored symmetric inertia tensor for Rapier.
 *
 * Jacobi rotations are deterministic for a 3x3 tensor and avoid replacing
 * the authored mass model with collider-volume mass. Columns of `axes` are
 * the principal axes in the carrier's local frame.
 */
export function principalMassProperties(
  properties: MassProperties,
  origin: SceneVector3 = [0, 0, 0],
): PrincipalMassProperties {
  const tensor = [...properties.inertia];
  const axes = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let p = 0;
    let q = 1;
    let largest = Math.abs(tensor[1]);
    for (const [row, column] of [[0, 2], [1, 2]] as const) {
      const value = Math.abs(tensor[row * 3 + column]);
      if (value > largest) {
        largest = value;
        p = row;
        q = column;
      }
    }
    const scale = Math.max(
      1,
      Math.abs(tensor[0]),
      Math.abs(tensor[4]),
      Math.abs(tensor[8]),
    );
    if (largest <= scale * 1e-12) {
      break;
    }
    const app = tensor[p * 3 + p];
    const aqq = tensor[q * 3 + q];
    const apq = tensor[p * 3 + q];
    const angle = 0.5 * Math.atan2(2 * apq, aqq - app);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    for (let index = 0; index < 3; index += 1) {
      const aip = tensor[index * 3 + p];
      const aiq = tensor[index * 3 + q];
      tensor[index * 3 + p] = cosine * aip - sine * aiq;
      tensor[index * 3 + q] = sine * aip + cosine * aiq;
    }
    for (let index = 0; index < 3; index += 1) {
      const api = tensor[p * 3 + index];
      const aqi = tensor[q * 3 + index];
      tensor[p * 3 + index] = cosine * api - sine * aqi;
      tensor[q * 3 + index] = sine * api + cosine * aqi;
    }
    // Remove round-off asymmetry after A' = J^T A J.
    tensor[p * 3 + q] = 0;
    tensor[q * 3 + p] = 0;

    for (let row = 0; row < 3; row += 1) {
      const vip = axes[row * 3 + p];
      const viq = axes[row * 3 + q];
      axes[row * 3 + p] = cosine * vip - sine * viq;
      axes[row * 3 + q] = sine * vip + cosine * viq;
    }
  }

  // A quaternion represents only a proper rotation. Eigenvector signs are
  // arbitrary, so flip one column when Jacobi produced a reflection.
  const determinant =
    axes[0] * (axes[4] * axes[8] - axes[5] * axes[7]) -
    axes[1] * (axes[3] * axes[8] - axes[5] * axes[6]) +
    axes[2] * (axes[3] * axes[7] - axes[4] * axes[6]);
  if (determinant < 0) {
    axes[2] *= -1;
    axes[5] *= -1;
    axes[8] *= -1;
  }

  return {
    mass: properties.mass,
    centre: [
      properties.centre[0] - origin[0],
      properties.centre[1] - origin[1],
      properties.centre[2] - origin[2],
    ],
    principalInertia: [
      Math.max(1e-9, tensor[0]),
      Math.max(1e-9, tensor[4]),
      Math.max(1e-9, tensor[8]),
    ],
    inertiaFrame: quaternionFromRotationMatrix(axes),
  };
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

/** A finite momentum transfer at one world-space point. */
export interface AppliedImpulse {
  readonly impulse: SceneVector3;
  readonly point: SceneVector3;
}

export const RESTING_BODY: BodyState = {
  position: [0, 0, 0],
  orientation: IDENTITY_QUATERNION,
  velocity: [0, 0, 0],
  angularVelocity: [0, 0, 0],
};

/**
 * Transfers linear and angular momentum without routing a custom-integrated
 * carrier through a second physics body. The impulse is applied in world
 * space; inertia is evaluated in the body's current orientation.
 */
export function applyImpulseAtPoint(
  state: BodyState,
  properties: MassProperties,
  applied: AppliedImpulse,
): BodyState {
  if (properties.mass <= 0) {
    return state;
  }
  const velocity: SceneVector3 = [
    state.velocity[0] + applied.impulse[0] / properties.mass,
    state.velocity[1] + applied.impulse[1] / properties.mass,
    state.velocity[2] + applied.impulse[2] / properties.mass,
  ];
  const lever: SceneVector3 = [
    applied.point[0] - state.position[0],
    applied.point[1] - state.position[1],
    applied.point[2] - state.position[2],
  ];
  const angularImpulseWorld = cross(lever, applied.impulse);
  const angularImpulseBody = rotateVector(
    conjugateQuaternion(state.orientation),
    angularImpulseWorld,
  );
  const deltaOmegaBody = applyMatrix(
    properties.inverseInertia,
    angularImpulseBody,
  );
  const deltaOmegaWorld = rotateVector(state.orientation, deltaOmegaBody);
  return {
    ...state,
    velocity,
    angularVelocity: [
      state.angularVelocity[0] + deltaOmegaWorld[0],
      state.angularVelocity[1] + deltaOmegaWorld[1],
      state.angularVelocity[2] + deltaOmegaWorld[2],
    ],
  };
}

/** Velocity inherited by material separating from a rotating rigid carrier. */
export function bodyPointVelocity(
  state: Pick<BodyState, "velocity" | "angularVelocity">,
  worldLever: SceneVector3,
): SceneVector3 {
  const spinVelocity = cross(state.angularVelocity, worldLever);
  return [
    state.velocity[0] + spinVelocity[0],
    state.velocity[1] + spinVelocity[1],
    state.velocity[2] + spinVelocity[2],
  ];
}

/**
 * Keeps the physical pose and velocity field continuous when a subset of a
 * rigid cluster detaches. The new centre of mass is another material point
 * of the same body, so it inherits v + omega x r instead of teleporting or
 * retaining the old centre's velocity.
 */
export function rebaseBodyMassProperties(
  stateAtOldCentre: BodyState,
  previous: MassProperties,
  next: MassProperties,
): BodyState {
  if (previous.mass <= 0 || next.mass <= 0) {
    return stateAtOldCentre;
  }
  const localShift: SceneVector3 = [
    next.centre[0] - previous.centre[0],
    next.centre[1] - previous.centre[1],
    next.centre[2] - previous.centre[2],
  ];
  const worldShift = rotateVector(stateAtOldCentre.orientation, localShift);
  return {
    ...stateAtOldCentre,
    position: [
      stateAtOldCentre.position[0] + worldShift[0],
      stateAtOldCentre.position[1] + worldShift[1],
      stateAtOldCentre.position[2] + worldShift[2],
    ],
    velocity: bodyPointVelocity(stateAtOldCentre, worldShift),
  };
}

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
