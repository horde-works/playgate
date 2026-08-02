// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import type { SceneVector3 } from "./destructionScene.ts";

/**
 * ФИЗИКА КОЛЁСНОЙ МАШИНЫ: ЛУЧ, ПЯТНО КОНТАКТА И КРУГ ТРЕНИЯ
 *
 * Ни одна машина проекта до сих пор не опиралась на грунт органами. Дирижабль
 * висит на объёме газа, коптер — на собственных винтах, состав ЛРТ вообще не
 * физический: его поза считается по одометрии. Автомобиль устроен иначе, и вся
 * его повадка живёт в одном месте — в четырёх пятнах контакта размером с
 * ладонь.
 *
 * ПОЧЕМУ КОЛЕСО — ЛУЧ, А НЕ КОЛЛАЙДЕР. Соблазн отдать колесо физическому
 * движку велик: поставил цилиндр, включил трение — и поехали. Не поедет.
 * Трение коллайдера ИЗОТРОПНО: оно одинаково сопротивляется движению вперёд и
 * вбок, а колесо тем и является колесом, что вперёд катится почти свободно, а
 * вбок держит всем сцеплением. Машина на цилиндрах ведёт себя как ящик на
 * льду, и никакой поворот руля этого не исправит. Поэтому колесо здесь —
 * луч из ступицы вниз: подвеска даёт нормальную реакцию, а продольную и
 * боковую силы шина создаёт сама, каждую по своему закону.
 *
 * ЧТО ИЗ ЭТОГО СЛЕДУЕТ, И ЧЕГО НЕТ НИ У ОДНОЙ ДРУГОЙ МАШИНЫ ПРОЕКТА:
 *
 *   - у силы появляется СОБСТВЕННОЕ НАПРАВЛЕНИЕ. У всех прежних машин тяга
 *     приложена вдоль оси корпуса, и её направление — свойство машины целиком.
 *     Повёрнутое колесо толкает туда, куда смотрит оно, а не корпус. Отсюда и
 *     весь поворот: момент рыскания рождается не пером и не разнотягом, а тем,
 *     что боковая сила передних колёс приложена впереди центра масс;
 *
 *   - сцепление КОНЕЧНО и делится между двумя задачами. Круг трения — не
 *     украшение модели, а её содержание: колесо, отдавшее сцепление разгону,
 *     не может тем же сцеплением держать поворот. Отсюда сами собой выходят и
 *     снос переднего привода под тягой, и занос заднего, и разница между ними;
 *
 *   - нагрузка на колесо ПЕРЕМЕННАЯ. Машина клюёт на торможении и приседает на
 *     разгоне, и вместе с нагрузкой переезжает сцепление. Считать это отдельным
 *     эффектом не нужно: подвеска на луче даёт перенос веса сама, потому что
 *     сила приложена в пятне контакта, то есть НИЖЕ центра масс;
 *
 *   - потеря колеса — не «минус четверть тяги». Угол проваливается, нагрузка
 *     уходит на оставшиеся, и если колесо было ведущим, оставшаяся тяга
 *     становится несимметричной и сама разворачивает машину. Всё это здесь
 *     получается из `availability`, а не из отдельного правила.
 *
 * ПРИВОД — ОДНО СЛОВО В ПАСПОРТЕ. Передний, задний и полный отличаются только
 * тем, какие колёса получают момент. Ни закон шины, ни подвеска, ни рулевое
 * от этого не зависят, поэтому вариации машины — это данные, а не код.
 *
 * Модуль чистый: ни three, ни rapier, ни знания о конкретной машине. Вход
 * один — `carForces`; его зовут и рантайм, и тест, и разойтись им негде.
 */

type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

/**
 * Ось машины. Авторская, а не вычисленная из геометрии: у трёхосной или
 * сочленённой машины «перед и зад» по расстоянию до центра масс угадываются
 * неверно, а паспорт знает это точно.
 */
export type CarAxle = "front" | "rear";

/**
 * Привод. Единственное, чем отличаются варианты одной машины: какие колёса
 * получают момент. Всё остальное поведение — следствие круга трения.
 */
export type CarDriveLayout = "front" | "rear" | "all";

export interface CarWheel {
  readonly id: string;
  readonly axle: CarAxle;
  /**
   * Ступица в авторских координатах — начало луча подвески. Луч идёт вниз по
   * оси КОРПУСА, а не по мировой вертикали: стойка наклоняется вместе с
   * машиной, и на крене колесо ищет опору под собой, а не под горизонтом.
   */
  readonly hub: SceneVector3;
  readonly radius: number;
  /** Ход подвески от полного отбоя до полного сжатия, м. */
  readonly travel: number;
  /** Жёсткость пружины, Н/м. */
  readonly stiffness: number;
  /** Сопротивление амортизатора, Н·с/м. */
  readonly damping: number;
  /**
   * Доля общего угла руля. Единица — колесо поворачивается на полный угол,
   * ноль — не поворачивается вовсе. Малая величина на задней оси описывает
   * подруливающую заднюю подвеску и ничего больше.
   */
  readonly steerShare: number;
  /** Доля общего тормозного усилия. Обычно перед тормозит сильнее задка. */
  readonly brakeShare: number;
  /** Сцепление пары «шина — покрытие»: μ. */
  readonly grip: number;
  /**
   * Боковая жёсткость шины, Н на м/с БОКОВОГО ПРОСКАЛЬЗЫВАНИЯ.
   *
   * Настоящая шина считает силу по углу увода, но угол — это отношение
   * скоростей, и на околонулевом ходу он вырождается: у стоящей машины любое
   * микроскопическое боковое движение даёт угол в девяносто градусов, и модель
   * начинает бить машину поперёк на парковке. Скорость проскальзывания
   * определена везде, включая покой, поэтому закон здесь линеен по ней и
   * ограничен кругом трения. На рабочих углах это та же прямая, что и у
   * настоящей шины, а срыв даёт круг, а не формула увода.
   */
  readonly cornering: number;
}

export interface CarMachine {
  readonly wheels: readonly CarWheel[];
  /** Куда смотрит нос в авторских координатах. */
  readonly nose: SceneVector3;
  /** Авторский центр масс — начало всех плеч. */
  readonly centreOfMass: SceneVector3;
  readonly mass: number;
  readonly layout: CarDriveLayout;
  /** Суммарная тяга на всех ведущих колёсах при полном газе, Н. */
  readonly driveForce: number;
  /** Суммарное тормозное усилие при полностью нажатом тормозе, Н. */
  readonly brakeForce: number;
  /**
   * Сопротивление качению, доля веса. Малое число, но именно оно
   * останавливает машину с отпущенным газом.
   */
  readonly rollingResistance: number;
  /** Доля тяги каждого колеса, 0…1: выбитое колесо не даёт ничего. */
  readonly availability: readonly number[];
}

export interface CarState {
  /** Кватернион позы: [x, y, z, w]. */
  readonly orientation: Quaternion;
  /** Мировой центр масс. */
  readonly centre: Vector3;
  readonly velocity: Vector3;
  readonly angularVelocity: Vector3;
}

/**
 * Что луч подвески нашёл под ступицей. Считает это ВЫЗЫВАЮЩИЙ: в рантайме —
 * rapier, в тесте — плоскость. Модуль о мире не знает ничего.
 */
export interface CarGroundProbe {
  /**
   * Расстояние от ступицы до опоры ВДОЛЬ ОСИ СТОЙКИ, м. Бесконечность или
   * больше `radius + travel` означает, что колесо в воздухе.
   */
  readonly distance: number;
  /** Нормаль опоры в мировых осях, единичная. */
  readonly normal: Vector3;
  /**
   * Сцепление покрытия множителем к паспортному μ колеса. Единица — сухой
   * асфальт, меньше — то, по чему машина сейчас едет.
   */
  readonly surfaceGrip?: number;
}

/** Положение рычагов. Ни маршрута, ни решений — только органы. */
export interface CarControls {
  /** Газ и задний ход: −1…1. */
  readonly throttle: number;
  /** Тормоз: 0…1. */
  readonly brake: number;
  /** Угол поворота управляемых колёс, рад: плюс — вправо. */
  readonly steer: number;
  /** Ручник: тормозит только заднюю ось и не боится её сорвать. */
  readonly handbrake: boolean;
}

export interface CarWheelResult {
  readonly id: string;
  readonly contact: boolean;
  /** Нормальная реакция, Н. Ноль — колесо в воздухе или его нет. */
  readonly load: number;
  /** Сжатие подвески, м. */
  readonly compression: number;
  /** Доставленная продольная сила вдоль колеса, Н. */
  readonly longitudinal: number;
  /** Доставленная боковая сила, Н. */
  readonly lateral: number;
  /** Скорость проскальзывания вбок, м/с. */
  readonly lateralSlip: number;
  /** Сцепления не хватило: колесо скользит. */
  readonly slipping: boolean;
  /** Доля круга трения, которую колесо выбрало: 1 — ровно на пределе. */
  readonly gripUsed: number;
}

export interface CarForcePoint {
  readonly force: Vector3;
  readonly point: Vector3;
}

export interface CarForceResult {
  readonly forces: readonly CarForcePoint[];
  readonly wheels: readonly CarWheelResult[];
  /** Сколько колёс сейчас на опоре. Ноль — машина в воздухе. */
  readonly contacts: number;
}

const EPSILON = 1e-9;

function rotateByQuaternion(q: Quaternion, v: SceneVector3): Vector3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function scale(v: Vector3, k: number): Vector3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > EPSILON ? [v[0] / length, v[1] / length, v[2] / length] : v;
}

/** Составляющая вектора в плоскости опоры. */
function inPlane(v: Vector3, normal: Vector3): Vector3 {
  const along = dot(v, normal);
  return [
    v[0] - normal[0] * along,
    v[1] - normal[1] * along,
    v[2] - normal[2] * along,
  ];
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Ведущее ли это колесо. Единственное место, где привод вообще упоминается:
 * дальше передний, задний и полный неразличимы, и разницу между ними создаёт
 * круг трения, а не ветка кода.
 */
export function carWheelIsDriven(
  layout: CarDriveLayout,
  axle: CarAxle,
): boolean {
  return layout === "all" || layout === axle;
}

/**
 * Доля общей тяги, приходящая на колесо.
 *
 * Момент делится между ВСЕМИ ведущими колёсами паспорта, а не между уцелевшими.
 * Это не упрощение, а поведение открытого дифференциала: пропавшее колесо
 * забирает свою половину момента и не отдаёт её соседу — на переднем приводе
 * машина без левого колеса не просто теряет тягу, она получает её только
 * справа и тянет корпус в сторону. Блокировка перекладывала бы момент на
 * оставшееся колесо; когда она у машины появится, это будет её собственный
 * орган, а не поправка здесь.
 */
export function carDriveShare(
  machine: CarMachine,
  index: number,
): number {
  const wheel = machine.wheels[index];
  if (!wheel || !carWheelIsDriven(machine.layout, wheel.axle)) {
    return 0;
  }
  const driven = machine.wheels.filter((candidate) =>
    carWheelIsDriven(machine.layout, candidate.axle),
  ).length;
  return driven > 0 ? 1 / driven : 0;
}

/**
 * Руль не телепортируется. Скорость перекладки — свойство машины, и именно она
 * не даёт водителю мгновенно выставить предельный угол на скорости.
 */
export function advanceCarSteering(
  current: number,
  requested: number,
  rate: number,
  deltaSeconds: number,
): number {
  if (deltaSeconds <= 0) return current;
  const step = rate * deltaSeconds;
  const delta = requested - current;
  return Math.abs(delta) <= step ? requested : current + Math.sign(delta) * step;
}

/**
 * Тормоз гаснет у самого нуля хода. Без этого стоящая машина каждый шаг
 * получает полное усилие то в одну, то в другую сторону и мелко дрожит.
 */
const BRAKE_FADE_SPEED = 0.5;

/**
 * ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ДЛЯ КОЛЁСНОЙ МАШИНЫ СЧИТАЮТСЯ СИЛЫ.
 *
 * Возвращает мировые силы в мировых точках приложения — ровно в том виде,
 * в каком их принимает общий шаг тела.
 */
export function carForces(
  machine: CarMachine,
  state: CarState,
  controls: CarControls,
  probes: readonly (CarGroundProbe | null)[],
  gravity = 9.81,
): CarForceResult {
  const up = rotateByQuaternion(state.orientation, [0, 1, 0]);
  const down: Vector3 = [-up[0], -up[1], -up[2]];
  const noseLength = Math.hypot(...machine.nose) || 1;
  const forward = rotateByQuaternion(state.orientation, [
    machine.nose[0] / noseLength,
    machine.nose[1] / noseLength,
    machine.nose[2] / noseLength,
  ]);
  // Правый борт: та же тройка, в которой считает общий автопилот — при носе
  // вдоль +x правый борт смотрит в +z.
  const starboard = normalize(cross(forward, up));

  const forces: CarForcePoint[] = [];
  const wheels: CarWheelResult[] = [];
  let contacts = 0;

  for (let index = 0; index < machine.wheels.length; index += 1) {
    const wheel = machine.wheels[index];
    const available = clamp(machine.availability[index] ?? 1, 0, 1);
    const probe = probes[index] ?? null;
    const reach = wheel.radius + wheel.travel;

    // Колеса нет или под ним пусто: угол просто проваливается, и корпус
    // достаёт до земли сам — это уже работа его собственного контакта.
    if (available <= EPSILON || !probe || !(probe.distance < reach)) {
      wheels.push({
        id: wheel.id,
        contact: false,
        load: 0,
        compression: 0,
        longitudinal: 0,
        lateral: 0,
        lateralSlip: 0,
        slipping: false,
        gripUsed: 0,
      });
      continue;
    }

    const hubLocal: SceneVector3 = [
      wheel.hub[0] - machine.centreOfMass[0],
      wheel.hub[1] - machine.centreOfMass[1],
      wheel.hub[2] - machine.centreOfMass[2],
    ];
    const hubWorld = add(state.centre, rotateByQuaternion(state.orientation, hubLocal));
    const contactPoint = add(hubWorld, scale(down, probe.distance));

    // Скорость самого пятна контакта, а не центра машины: разворот и крен
    // двигают колесо, и шина реагирует именно на это.
    const arm: Vector3 = [
      contactPoint[0] - state.centre[0],
      contactPoint[1] - state.centre[1],
      contactPoint[2] - state.centre[2],
    ];
    const pointVelocity = add(state.velocity, cross(state.angularVelocity, arm));

    // ПОДВЕСКА. Пружина по сжатию, амортизатор по скорости вдоль нормали.
    // Сила приложена в ПЯТНЕ, то есть ниже центра масс, — отсюда и клевок на
    // торможении, и перенос веса в повороте, без единой отдельной формулы.
    const compression = clamp(reach - probe.distance, 0, wheel.travel);
    const closing = -dot(pointVelocity, probe.normal);
    const load = Math.max(
      0,
      (wheel.stiffness * compression + wheel.damping * closing) * available,
    );
    if (load <= EPSILON) {
      wheels.push({
        id: wheel.id,
        contact: true,
        load: 0,
        compression,
        longitudinal: 0,
        lateral: 0,
        lateralSlip: 0,
        slipping: false,
        gripUsed: 0,
      });
      contacts += 1;
      continue;
    }
    contacts += 1;

    // НАПРАВЛЕНИЕ КОЛЕСА. Поворот идёт вокруг оси корпуса, а затем ось катания
    // кладётся в плоскость опоры: на уклоне колесо катится по склону, а не по
    // горизонту.
    const steer = wheel.steerShare * controls.steer;
    const sin = Math.sin(steer);
    const cos = Math.cos(steer);
    const rolling = normalize(
      inPlane(
        [
          forward[0] * cos + starboard[0] * sin,
          forward[1] * cos + starboard[1] * sin,
          forward[2] * cos + starboard[2] * sin,
        ],
        probe.normal,
      ),
    );
    const sideways = normalize(cross(rolling, probe.normal));

    const alongSpeed = dot(pointVelocity, rolling);
    const sideSpeed = dot(pointVelocity, sideways);

    // ПРОДОЛЬНАЯ СИЛА: тяга, тормоз и сопротивление качению.
    const drive =
      machine.driveForce *
      controls.throttle *
      carDriveShare(machine, index) *
      available;
    const handbrakeHere = controls.handbrake && wheel.axle === "rear";
    const brakeDemand = Math.max(
      controls.brake * wheel.brakeShare,
      handbrakeHere ? 1 : 0,
    );
    const brake =
      -Math.sign(alongSpeed) *
      machine.brakeForce *
      brakeDemand *
      available *
      clamp(Math.abs(alongSpeed) / BRAKE_FADE_SPEED, 0, 1);
    const rollingDrag =
      -Math.sign(alongSpeed) *
      machine.rollingResistance *
      load *
      clamp(Math.abs(alongSpeed) / BRAKE_FADE_SPEED, 0, 1);
    const wantedLong = drive + brake + rollingDrag;

    // БОКОВАЯ СИЛА: шина сопротивляется сносу, пока хватает сцепления.
    const wantedLateral = -wheel.cornering * sideSpeed * available;

    // КРУГ ТРЕНИЯ. Здесь и живёт вся разница приводов: колесо, потратившее
    // сцепление на разгон, держит поворот тем хуже, чем сильнее его тянут.
    // Ручник намеренно сбрасывает продольный предел задней оси — он для того
    // и существует, чтобы её сорвать.
    const limit = wheel.grip * (probe.surfaceGrip ?? 1) * load;
    const wanted = Math.hypot(wantedLong, wantedLateral);
    const slipping = wanted > limit + EPSILON;
    const scaleDown = slipping && wanted > EPSILON ? limit / wanted : 1;
    const longitudinal = wantedLong * scaleDown;
    const lateral = wantedLateral * scaleDown;

    forces.push({
      force: add(
        scale(probe.normal, load),
        add(scale(rolling, longitudinal), scale(sideways, lateral)),
      ),
      point: contactPoint,
    });

    wheels.push({
      id: wheel.id,
      contact: true,
      load,
      compression,
      longitudinal,
      lateral,
      lateralSlip: sideSpeed,
      slipping,
      gripUsed: limit > EPSILON ? wanted / limit : 0,
    });
  }

  void gravity;

  return { forces, wheels, contacts };
}

/**
 * ЧТО МАШИНА СЕЙЧАС ДЕЛАЕТ НА ПРЕДЕЛЕ. Детектор, а не украшение: разницу между
 * приводами глазами по траектории не отличить от разницы в настройках, а по
 * тому, КАКАЯ ОСЬ выбрала сцепление первой, — отличить можно и в тесте.
 *
 *   "understeer" — первой сдалась передняя ось: машина едет прямо, куда бы ни
 *                  повернули руль. Штатная беда переднего привода под тягой;
 *   "oversteer"  — сдалась задняя: корпус разворачивает наружу поворота;
 *   "grip"       — обе оси в пределах сцепления.
 */
export type CarHandlingBalance = "grip" | "understeer" | "oversteer" | "sliding";

export function carHandlingBalance(
  machine: CarMachine,
  result: CarForceResult,
): CarHandlingBalance {
  let front = 0;
  let rear = 0;
  for (let index = 0; index < result.wheels.length; index += 1) {
    const wheel = machine.wheels[index];
    const state = result.wheels[index];
    if (!wheel || !state?.contact) continue;
    const used = state.gripUsed;
    if (wheel.axle === "front") front = Math.max(front, used);
    else rear = Math.max(rear, used);
  }
  const frontLost = front > 1;
  const rearLost = rear > 1;
  if (frontLost && rearLost) return "sliding";
  if (frontLost) return "understeer";
  if (rearLost) return "oversteer";
  return "grip";
}
