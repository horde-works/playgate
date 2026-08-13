import type { SceneVector3 } from "./destructionScene.ts";
import type { VehicleGuidanceDemand } from "./vehicleFrames.ts";
import type { RotorcraftTurnCapability } from "./rotorcraftSpeedGovernor.ts";

/**
 * ФИЗИКА КРЫЛАТОЙ МАШИНЫ: ПОДЪЁМ С НАПОРА, НЕ С ОБОРОТОВ
 *
 * Дирижабль держит газ. Коптер держит винты: нет тяги — нет подъёма, а
 * горизонталь рождается наклоном диска. Самолёт держит КРЫЛО, и только
 * пока есть скорость. Нет хода — нет силы. Это не «коптер с крыльями».
 *
 * Guidance общий (`VehicleGuidanceDemand`). Исполнение другое:
 *
 *   - ход вдоль носа — тяга моторов, не наклон диска;
 *   - набор — лишняя подъёмная сила (угол атаки и закрылки);
 *   - крен и разворот — элероны и педаль; боковой ход guidance
 *     самолёт не исполняет: он не голономный;
 *   - закрылки — конфигурация захода, не непрерывный канал набора.
 *
 * Это внутренний контур — автомат управления. Автопилот (или пилот) владеет
 * только `VehicleGuidanceDemand`. Здесь: закрылки по фазе и скорости, газ,
 * элерон, руль высоты, педаль; власть снизу (`AirplaneAuthority`), чтобы
 * автопилот масштабировал просьбы по паспорту, а не по догадке.
 *
 * Модуль чистый: ни three, ни rapier, ни знания о сцене.
 */

export const AIR_DENSITY = 1.225;
export const GRAVITY = 9.81;

export interface AirplanePassport {
  readonly wingArea: number;
  readonly meanChord: number;
  readonly stallSpeed: number;
  readonly stallSpeedFlaps: number;
  readonly cruiseSpeed: number;
  readonly cl0: number;
  readonly clAlpha: number;
  readonly clFlap: number;
  readonly clMax: number;
  readonly cd0: number;
  readonly inducedFactor: number;
  readonly enginePower: number;
  readonly enginePoints: readonly SceneVector3[];
  readonly liftCentre: SceneVector3;
  readonly aileronAuthority: number;
  readonly elevatorAuthority: number;
  readonly rudderAuthority: number;
}

export interface AirplaneAvailability {
  readonly engines: readonly number[];
  readonly aileron: number;
  readonly elevator: number;
  readonly rudder: number;
  readonly flap: number;
  readonly wingPanels: readonly number[];
}

export interface AirplaneSurfaceCommand {
  readonly aileron: number;
  readonly elevator: number;
  readonly rudder: number;
  readonly flap: number;
  readonly throttle: readonly [number, number];
}

export interface AirplaneState {
  readonly airspeed: number;
  readonly alpha: number;
  readonly beta: number;
}

export interface AirplaneForces {
  readonly lift: number;
  readonly drag: number;
  readonly thrust: number;
  readonly force: SceneVector3;
  readonly moment: SceneVector3;
}

export interface AirplaneAuthority {
  readonly throttle: number;
  readonly aileron: number;
  readonly elevator: number;
  readonly rudder: number;
  readonly flap: number;
}

export interface AirplaneForcePoint {
  readonly force: readonly [number, number, number];
  readonly point: readonly [number, number, number];
}

export interface AirplaneFlightStep {
  readonly requested: AirplaneSurfaceCommand;
  readonly delivered: AirplaneSurfaceCommand;
  readonly airspeed: number;
  readonly alpha: number;
  readonly flap: number;
  readonly forces: readonly AirplaneForcePoint[];
  readonly authority: AirplaneAuthority;
  readonly lift: number;
  readonly drag: number;
  readonly thrust: number;
}

export function dynamicPressure(airspeed: number, density = AIR_DENSITY): number {
  return 0.5 * density * airspeed * airspeed;
}

export function stallSpeedOf(
  passport: Pick<AirplanePassport, "stallSpeed" | "stallSpeedFlaps">,
  flap: number,
): number {
  const clean = passport.stallSpeed;
  const dirty = passport.stallSpeedFlaps;
  const blend = Math.max(0, Math.min(1, flap));
  return clean + (dirty - clean) * blend;
}

export function wingPanelCapacity(
  passport: Pick<AirplanePassport, "wingArea" | "clMax">,
  airspeed: number,
  flap: number,
  panelCount: number,
): number {
  const cl = passport.clMax + passport.clMax * 0.18 * Math.max(0, Math.min(1, flap));
  const area = passport.wingArea / Math.max(1, panelCount);
  return dynamicPressure(airspeed) * area * cl;
}

/**
 * Закрылки — конфигурация автомата, не рычаг автопилота.
 * Заход выпускает полностью. На малой скорости — тоже. На крейсере убирает.
 */
export function airplaneFlapFor(
  demand: Pick<VehicleGuidanceDemand, "approachPhase" | "forwardSpeed">,
  airspeed: number,
  passport: Pick<AirplanePassport, "stallSpeed" | "stallSpeedFlaps" | "cruiseSpeed">,
  availability = 1,
): number {
  const speed = Math.max(airspeed, demand.forwardSpeed * 0.25);
  const wanted = demand.approachPhase
    ? 1
    : speed < passport.stallSpeedFlaps * 1.18
      ? 1
      : speed < passport.stallSpeed * 1.22
        ? 0.55
        : speed > passport.cruiseSpeed * 0.82
          ? 0
          : 0.25;
  return wanted * Math.max(0, Math.min(1, availability));
}

/**
 * Guidance → створки и газ. Боковой ход отбрасывается: самолёт им не ездит.
 * Тяга держит заданный ход; набор просит газ и руль высоты, не collective.
 */
export function airplaneAllocate(
  demand: VehicleGuidanceDemand,
  passport: AirplanePassport,
  _availability: AirplaneAvailability,
  airspeed = passport.cruiseSpeed,
): AirplaneSurfaceCommand {
  const flap = airplaneFlapFor(demand, airspeed, passport, 1);
  const speedTarget = Math.max(0, demand.forwardSpeed);
  const throttle = Math.max(
    0,
    Math.min(1, speedTarget / Math.max(1, passport.cruiseSpeed) + demand.liftFraction * 0.35),
  );
  const climb = Math.max(-1, Math.min(1, demand.liftFraction));
  const turn = Math.max(-1, Math.min(1, demand.yawRate / 0.35));
  return {
    aileron: turn,
    elevator: climb,
    rudder: turn * 0.45,
    flap,
    throttle: [throttle, throttle],
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function share(delivered: number, requested: number): number {
  if (Math.abs(requested) < 1e-6) return 1;
  return clamp01(Math.abs(delivered) / Math.abs(requested));
}

function rotateByQuaternion(
  quaternion: readonly [number, number, number, number],
  vector: SceneVector3,
): SceneVector3 {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function dot(a: SceneVector3, b: SceneVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function airplaneAirspeed(
  velocity: SceneVector3,
  orientation: readonly [number, number, number, number],
  nose: SceneVector3,
): number {
  const worldNose = rotateByQuaternion(orientation, nose);
  return Math.max(0, dot(velocity, worldNose));
}

export function airplaneAlpha(
  velocity: SceneVector3,
  orientation: readonly [number, number, number, number],
  nose: SceneVector3,
): number {
  const worldNose = rotateByQuaternion(orientation, nose);
  const speed = Math.hypot(...velocity);
  if (speed < 0.4) return 0;
  const flightPath = Math.atan2(velocity[1], Math.hypot(velocity[0], velocity[2]));
  const nosePitch = Math.atan2(worldNose[1], Math.hypot(worldNose[0], worldNose[2]));
  return nosePitch - flightPath;
}

/**
 * Поворотливость СНИЗУ, из паспорта и текущего напора. Автопилот не голономный:
 * поперечного ускорения нет — вираж только курсом. Темп рыскания — из
 * координированного крена на текущей скорости.
 */
export function airplaneTurnCapability(
  passport: AirplanePassport,
  airspeed: number,
  mass: number,
): RotorcraftTurnCapability {
  const speed = Math.max(airspeed, passport.stallSpeedFlaps);
  const maxBank = (28 * Math.PI) / 180;
  const yawRate = Math.min(0.32, (GRAVITY * Math.tan(maxBank)) / speed);
  const q = dynamicPressure(Math.max(airspeed, 8));
  const drag = q * passport.wingArea * (passport.cd0 + 0.04);
  return {
    yawRate,
    lateralAcceleration: 0,
    braking: mass > 1e-6 ? drag / mass : 0,
    responseSeconds: 1.6,
  };
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Чистая пара: сумма сил ноль, момент — доставленный. Тот же приём, что у
 * реактивного рыскания коптера: Rapier принимает только силы в точках.
 */
function coupleForMoment(
  worldMoment: SceneVector3,
  centre: SceneVector3,
  arm: number,
): AirplaneForcePoint[] {
  const magnitude = Math.hypot(...worldMoment);
  if (magnitude < 1e-6 || arm < 1e-6) return [];
  const axis: SceneVector3 = [
    worldMoment[0] / magnitude,
    worldMoment[1] / magnitude,
    worldMoment[2] / magnitude,
  ];
  const hint: SceneVector3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const radial = cross(axis, hint);
  const radialLength = Math.hypot(...radial);
  if (radialLength < 1e-6) return [];
  const unitR: SceneVector3 = [
    radial[0] / radialLength,
    radial[1] / radialLength,
    radial[2] / radialLength,
  ];
  const unitF = cross(axis, unitR);
  const forceMag = magnitude / (2 * arm);
  const force: SceneVector3 = [
    unitF[0] * forceMag,
    unitF[1] * forceMag,
    unitF[2] * forceMag,
  ];
  return [
    {
      force,
      point: [
        centre[0] + unitR[0] * arm,
        centre[1] + unitR[1] * arm,
        centre[2] + unitR[2] * arm,
      ],
    },
    {
      force: [-force[0], -force[1], -force[2]],
      point: [
        centre[0] - unitR[0] * arm,
        centre[1] - unitR[1] * arm,
        centre[2] - unitR[2] * arm,
      ],
    },
  ];
}

function deliverCommand(
  requested: AirplaneSurfaceCommand,
  availability: AirplaneAvailability,
): AirplaneSurfaceCommand {
  return {
    aileron: requested.aileron * availability.aileron,
    elevator: requested.elevator * availability.elevator,
    rudder: requested.rudder * availability.rudder,
    flap: requested.flap * availability.flap,
    throttle: [
      requested.throttle[0] * (availability.engines[0] ?? 0),
      requested.throttle[1] * (availability.engines[1] ?? 0),
    ],
  };
}

/**
 * Внутренний контур крылатой машины. Вход — guidance автопилота. Выход —
 * доставленные органы, силы в мире и власть, которой автопилот учится.
 */
export function airplaneFlightStep(input: {
  readonly passport: AirplanePassport;
  readonly guidance: VehicleGuidanceDemand;
  readonly availability: AirplaneAvailability;
  readonly mass: number;
  readonly orientation: readonly [number, number, number, number];
  readonly velocity: SceneVector3;
  readonly centre: SceneVector3;
  readonly nose: SceneVector3;
}): AirplaneFlightStep {
  const { passport, guidance, availability, orientation, velocity, centre, nose } = input;
  const airspeed = airplaneAirspeed(velocity, orientation, nose);
  const alpha = airplaneAlpha(velocity, orientation, nose);
  const requested = airplaneAllocate(guidance, passport, availability, airspeed);
  const delivered = deliverCommand(requested, availability);
  const aero = airplaneForces(
    delivered,
    { airspeed, alpha, beta: 0 },
    passport,
    availability,
  );
  const worldForce = rotateByQuaternion(orientation, aero.force);
  const worldMoment = rotateByQuaternion(orientation, aero.moment);
  const liftPoint = rotateByQuaternion(orientation, [
    passport.liftCentre[0],
    passport.liftCentre[1],
    passport.liftCentre[2],
  ]);
  const forces: AirplaneForcePoint[] = [
    {
      force: worldForce,
      point: [
        centre[0] + liftPoint[0],
        centre[1] + liftPoint[1],
        centre[2] + liftPoint[2],
      ],
    },
    ...coupleForMoment(
      worldMoment,
      centre,
      Math.max(2, passport.meanChord * 2),
    ),
  ];
  return {
    requested,
    delivered,
    airspeed,
    alpha,
    flap: delivered.flap,
    forces,
    authority: {
      throttle: share(
        delivered.throttle[0] + delivered.throttle[1],
        requested.throttle[0] + requested.throttle[1],
      ),
      aileron: share(delivered.aileron, requested.aileron),
      elevator: share(delivered.elevator, requested.elevator),
      rudder: share(delivered.rudder, requested.rudder),
      flap: share(delivered.flap, requested.flap),
    },
    lift: aero.lift,
    drag: aero.drag,
    thrust: aero.thrust,
  };
}

export function airplaneForces(
  command: AirplaneSurfaceCommand,
  state: AirplaneState,
  passport: AirplanePassport,
  availability: AirplaneAvailability,
): AirplaneForces {
  const q = dynamicPressure(state.airspeed);
  const stall = stallSpeedOf(passport, command.flap);
  const stalled = state.airspeed < stall * 0.98;
  const panelLive =
    availability.wingPanels.reduce((sum, value) => sum + Math.max(0, value), 0) /
    Math.max(1, availability.wingPanels.length);
  const clUnstalled =
    (passport.cl0 +
      passport.clAlpha * state.alpha +
      passport.clFlap * command.flap +
      command.elevator * 0.22) *
    panelLive;
  const cl = stalled ? clUnstalled * 0.35 : Math.min(passport.clMax * 1.15, clUnstalled);
  const cd =
    passport.cd0 +
    passport.inducedFactor * cl * cl +
    command.flap * 0.06 +
    Math.abs(command.aileron) * 0.01;
  const lift = q * passport.wingArea * cl;
  const drag = q * passport.wingArea * cd;
  const thrust =
    command.throttle[0] * passport.enginePower +
    command.throttle[1] * passport.enginePower;
  const side = q * passport.wingArea * 0.12 * state.beta;
  const force: SceneVector3 = [side, lift, thrust - drag];
  const yawFromAsymmetry =
    (command.throttle[1] - command.throttle[0]) *
    passport.enginePower *
    Math.abs(passport.enginePoints[0]?.[0] ?? 0);
  const moment: SceneVector3 = [
    command.elevator * q * passport.elevatorAuthority * availability.elevator,
    command.rudder * q * passport.rudderAuthority * availability.rudder + yawFromAsymmetry,
    command.aileron * q * passport.aileronAuthority * availability.aileron,
  ];
  return { lift, drag, thrust, force, moment };
}

export const INTACT_AIRPLANE_AVAILABILITY: AirplaneAvailability = {
  engines: [1, 1],
  aileron: 1,
  elevator: 1,
  rudder: 1,
  flap: 1,
  wingPanels: [1, 1, 1, 1],
};
