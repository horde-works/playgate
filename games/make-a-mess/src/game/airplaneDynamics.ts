// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import type { SceneVector3 } from "./destructionScene.ts";
import type { VehicleGuidanceDemand } from "./vehicleFrames.ts";
import type { RotorcraftTurnCapability } from "./rotorcraftSpeedGovernor.ts";

/**
 * ФИЗИКА КРЫЛАТОЙ МАШИНЫ: ПОДЪЁМ С НАПОРА, НЕ С ОБОРОТОВ
 *
 * Дирижабль держит газ. Коптер держит винты: нет тяги — нет подъёма, а
 * горизонталь рождается наклоном диска. Самолёт держит КРЫЛО, и только пока
 * есть скорость. Нет хода — нет силы. Это не «коптер с крыльями».
 *
 * ── ПОВЕРХНОСТИ, А НЕ КОЭФФИЦИЕНТЫ ────────────────────────────────────────
 *
 * Первая редакция этого модуля считала одну силу в одной точке и добавляла к
 * ней момент от створок чистой парой. Машина не полетела ни в одном режиме:
 * нос уходил вниз сам, а постоянная просьба виража укладывала её на спину за
 * десять секунд. Причина была не в числах. Момент — это УСКОРЕНИЕ, поэтому
 * створка, привязанная прямо к просьбе автопилота, делает угол крена и
 * тангажа свободным интегратором; а без хвоста машине нечем вернуть нос к
 * потоку.
 *
 * Теперь машина — это ЧЕТЫРЕ НЕСУЩИЕ ПОВЕРХНОСТИ и два винта, каждый со своей
 * точкой приложения:
 *
 *   - две консоли крыла на ±четверти размаха;
 *   - стабилизатор на своём плече;
 *   - киль на своём.
 *
 * Скорость набегающего потока у каждой считается ЧЕСТНО, как `v + ω × r`.
 * Отсюда даром, без единого назначенного коэффициента, получается всё, что
 * пришлось бы иначе выдумывать:
 *
 *   - продольная устойчивость: угол атаки вырос — стабилизатор поднял хвост;
 *   - демпфирование тангажа: нос идёт вверх — хвост идёт вниз и тормозит;
 *   - демпфирование крена: опускающаяся консоль встречает поток под большим
 *     углом и толкает обратно;
 *   - флюгерная устойчивость и демпфирование рыскания — то же на киле;
 *   - обратный момент рыскания от элеронов: поднятая консоль тащит больше.
 *
 * Момент нигде не задаётся отдельно: он есть следствие плеча. Rapier принимает
 * силы в точках, поэтому чистых пар здесь больше нет.
 *
 * ── ГРАНИЦА ───────────────────────────────────────────────────────────────
 *
 * Guidance общий (`VehicleGuidanceDemand`). Исполнение другое:
 *
 *   - ход вдоль носа — тяга моторов, не наклон диска;
 *   - набор — угол тангажа, а не «доля веса»;
 *   - вираж — КРЕН, а не рыскание: разворачивает горизонтальная проекция
 *     подъёмной силы, руль направления только убирает скольжение;
 *   - боковой ход guidance самолёт не исполняет: он не голономный;
 *   - закрылки — конфигурация захода, не непрерывный канал набора.
 *
 * Автомат внутри замкнут на ПОЗУ, а не на просьбу (§3.3.1 контракта: поза —
 * вход каскада). Автопилот владеет только `VehicleGuidanceDemand`.
 *
 * Модуль чистый: ни three, ни rapier, ни знания о сцене.
 */

export const AIR_DENSITY = 1.225;
export const GRAVITY = 9.81;

/**
 * Точка машины в связанных осях, ОТ ЦЕНТРА МАСС и в терминах носа.
 *
 * Не `SceneVector3`: авторские оси объекта развёрнуты посадкой в мир (у DC-3
 * на полосе 09 нос смотрит в +X, а нарисован в +Z), и паспорт, написанный в
 * xyz, начал бы врать сразу после первого поворота карты. «Вперёд, вверх,
 * вправо» разворота не боится.
 */
export interface AirplaneStation {
  /** Вперёд по носу, м. Отрицательное — за центром масс. */
  readonly ahead: number;
  /** Вверх, м. */
  readonly above: number;
  /** На правый борт, м. */
  readonly right: number;
}

/**
 * СЕКЦИЯ КРЫЛА: своя площадь, своё плечо и своя доля хода створок.
 *
 * Консоль как одна поверхность — удобное упрощение ровно до первой створки.
 * Створки висят не по всему размаху: закрылок стоит внутри, элерон снаружи,
 * — и приложить их приращение к площади всей консоли значит соврать сразу
 * дважды: перепутать плечо (у элерона оно вдвое больше центроида консоли) и
 * заставить всю консоль сваливаться от отклонения створки, занимающей четверть
 * её площади. Секции убирают обе лжи и ничего не добавляют от себя: площади,
 * плечи и границы сняты с нарисованной сетки.
 */
export interface AirplaneWingSection {
  readonly station: AirplaneStation;
  /** Площадь секции, м². */
  readonly area: number;
  /** Доля хода ЭЛЕРОНА, доходящая до секции: у корневой ноль. */
  readonly aileron: number;
  /** Доля хода ЗАКРЫЛКА, доходящая до секции. */
  readonly flap: number;
}

/** Оперение: площадь, наклон кривой, плечо и власть створки. */
export interface AirplaneEmpennage {
  readonly area: number;
  /** dCl/dα, 1/рад. */
  readonly liftSlope: number;
  readonly station: AirplaneStation;
  /** Приращение Cl на единицу команды створки. */
  readonly controlPower: number;
  /**
   * СКОС ПОТОКА ЗА КРЫЛОМ, dε/dα. Только у горизонтального оперения.
   *
   * Крыло отклоняет поток вниз, и хвост видит НЕ ТОТ угол атаки, что машина.
   * Без скоса стабилизатор на большом угле создаёт почти столько же
   * пикирующего момента, сколько руль высоты способен дать кабрирующего:
   * замер дал 420 Н·м против 389 Н·м — руль в упоре, нос не идёт, машина
   * висит на срывном угле и валится с виража. Величина не назначается:
   * для эллиптического крыла `dε/dα ≈ 2·Clα/(π·λ)`.
   */
  readonly downwash?: number;
}

export interface AirplanePassport {
  /**
   * ПЛОТНОСТЬ ВОЗДУХА ЭТОГО МИРА, а не справочная.
   *
   * Масса машины в проекте считается по нарисованным кускам и живёт в
   * СОБСТВЕННОЙ единице (см. «Масса, развесовка и подъём» в
   * airborne-vehicle-dynamics.md): её калибруют по соседней машине, а не по
   * килограммам. Аэродинамика же считается по настоящим площадям в метрах.
   * Связать одно с другим может только плотность среды — она и выводится из
   * тождества сваливания при ФАКТИЧЕСКОЙ массе кластера.
   *
   * Это не подгонка: тождество `q·S·CLmax = mg` на скорости сваливания есть
   * определение веса типа, и если вес известен из кусков, то неизвестной в
   * нём остаётся ровно плотность. Держать вместо этого справочные 1.225 при
   * массе кусков означало бы силы, завышенные в двести раз, — машина
   * разлеталась на части в первом же кадре после загрузки карты.
   */
  readonly airDensity: number;
  readonly wingArea: number;
  readonly wingSpan: number;
  readonly meanChord: number;
  readonly stallSpeed: number;
  readonly stallSpeedFlaps: number;
  readonly cruiseSpeed: number;
  /** Потолок хода: дальше автомат не разгоняет и трасса не просит. */
  readonly maximumSpeed: number;
  readonly cl0: number;
  readonly clAlpha: number;
  readonly clFlap: number;
  readonly clMax: number;
  readonly cd0: number;
  readonly inducedFactor: number;
  /** Тяга ОДНОГО вала на полном газу, Н. */
  readonly enginePower: number;
  readonly engineStations: readonly AirplaneStation[];
  /**
   * СЕКЦИИ КРЫЛА ПО РАЗМАХУ. Сначала левые, потом правые; сумма площадей
   * равна `wingArea`.
   */
  readonly wingSections: readonly AirplaneWingSection[];
  /**
   * МЕСТНОЕ приращение Cl на единицу элерона — НА СЕКЦИИ, ГДЕ ОН ВИСИТ.
   *
   * Прежде это число размазывалось по всей консоли, и цена ошибки была не
   * количественной. Элерон занимает концевые 36% размаха, но приращение
   * прикладывалось ко ВСЕЙ площади: чтобы момент крена сошёлся, величину
   * приходилось держать умеренной — 0.55, — а прикладывалась она к панели,
   * которая в горизонте уже несёт Cl около 0.75 и в вираже около 0.95.
   * Сумма выходила за Clmax, консоль сваливалась ЦЕЛИКОМ, подъём на ней
   * обваливался до 45% — и момент крена МЕНЯЛ ЗНАК. Замер: на постоянной
   * просьбе о вираже 34° машина уходила в крен −93° с элероном в упоре
   * навстречу и падала в воду за пятнадцать секунд.
   *
   * Теперь створка живёт на своей секции: приращение местное (около 1.0 при
   * относительной хорде 0.27 и ходе 25°), площадь — концевой полосы, плечо —
   * её собственное. Срыв концевой полосы больше не выключает консоль.
   */
  readonly aileronPower: number;
  readonly tail: AirplaneEmpennage;
  readonly fin: AirplaneEmpennage;
  /** Предел крена в вираже, рад. Политика, а не предел прочности. */
  readonly maximumBank: number;
  /** Предел угла наклона траектории, рад: и вверх, и вниз. */
  readonly maximumClimbAngle: number;
  /** Скорость отрыва носового колеса, м/с. */
  readonly rotateSpeed: number;
  /** Тангаж на разбеге до Vr, рад: машина стоит на своих стойках. */
  readonly groundPitch: number;
  /**
   * БАЗА ШАССИ, м: от главных колёс до хвостового. Ею и только ею связаны
   * просимый темп разворота и угол рулевого колеса.
   */
  readonly wheelbase: number;
  /** Полный ход рулевого колеса, рад. */
  readonly steerRange: number;
  /** Полуколея главных стоек, м — плечо разворота вокруг колеса. */
  readonly mainWheelHalfTrack?: number;
  /** Сопротивление качению главных колёс, доля их нормальной реакции. */
  readonly mainWheelRollingResistance?: number;
  /** Ось главных стоек впереди центра масс, м; знак берётся из чертежа. */
  readonly mainAxleAheadOfCentre?: number;
  /**
   * ПОТОЛОК ХОДА ТОРМОЗА: ЗА НИМ МАШИНА ВСТАЁТ НА НОС.
   *
   * У хвостовой машины центр масс ПОЗАДИ главных колёс, и это единственное,
   * что удерживает её от капота при торможении. Момент считается вокруг оси
   * главных колёс: тормоз даёт `b·grip·m·g` на плече высоты центра масс `h`,
   * вес возвращает на плече выноса `Δx`. Равенство даёт `b = Δx/(grip·h)` —
   * ни одного назначенного числа, только чертёж и сцепление покрытия.
   *
   * Без потолка автомат честно давал полный тормоз: замер — тангаж −25° на
   * семи метрах в секунду, то есть винты в бетоне на исправной машине,
   * которая только что села точно в точку.
   */
  readonly brakeCeiling: number;
}

export interface AirplaneAvailability {
  readonly engines: readonly number[];
  readonly aileron: number;
  readonly elevator: number;
  readonly rudder: number;
  readonly flap: number;
  /**
   * Доли уцелевших панелей крыла. Порядок авторский: сначала ЛЕВЫЕ, потом
   * правые — тем же порядком, что `wingPanels` вида судна. Аэродинамика
   * сворачивает их в две консоли по половинам списка.
   */
  readonly wingPanels: readonly number[];
}

export interface AirplaneSurfaceCommand {
  /** Крен: плюс — правая консоль вниз. */
  readonly aileron: number;
  /** Тангаж: плюс — нос вверх. */
  readonly elevator: number;
  /** Рыскание: плюс — нос вправо. */
  readonly rudder: number;
  readonly flap: number;
  /** Фактическая доля тяги каждого вала. Отрицательная — реверс. */
  readonly throttle: readonly [number, number];
  /** Колёсный тормоз, 0…1. Живёт на стойках, но просит его автомат. */
  readonly brake: number;
  /** Раздельное торможение бортов, −1…+1; на DC-3 pivot не используется. */
  readonly brakeSplit?: number;
  /** Хвостовое колесо свободно флюгирует за движением на pivot. */
  readonly casterFree?: boolean;
  /**
   * РУЛЁЖНОЕ КОЛЕСО — ОТДЕЛЬНЫЙ КАНАЛ ОТ КИЛЯ, −1…+1 рулевого хода.
   *
   * На рулении аэродинамическим створкам делать нечего (вердикт Igor,
   * 15.08.2026): киль в нейтрали, а прямую вдоль осевой держит хвостовое
   * колесо своей сцепкой. Пока оба жили в одном `rudder`, молчание киля
   * означало и молчание колеса — машина теряла наземное поперечное
   * управление целиком (замер: ушла с карты на первой же ноге).
   */
  readonly steer?: number;
}

/** Что видит машина в потоке. Всё в связанных осях. */
export interface AirplaneAirState {
  /** Истинная воздушная скорость, м/с: модуль вектора, а не его проекция. */
  readonly airspeed: number;
  /** Угол атаки, рад. */
  readonly alpha: number;
  /** Угол скольжения, рад: плюс — поток с правого борта. */
  readonly beta: number;
  /** Тангаж носа над горизонтом, рад. */
  readonly pitch: number;
  /** Крен, рад: плюс — правая консоль вниз. */
  readonly bank: number;
  /**
   * ТЕМП КРЕНА, рад/с — производная того самого `bank`, а не проекция на нос.
   *
   * Правый разворот вокруг оси носа по правилу правой руки поднимает ПРАВУЮ
   * консоль, то есть УМЕНЬШАЕТ крен: проекция угловой скорости на нос равна
   * минус скорости изменения крена. Прежде здесь стояла сама проекция, и
   * демпфирующий член контура крена оказался положительной обратной связью:
   * машина перекладывалась на 66° при заданных 40°, ловила скольжение и
   * уходила в спираль. Один знак — и весь разворот.
   */
  readonly rollRate: number;
  /** Темп тангажа, рад/с: плюс — нос вверх. */
  readonly pitchRate: number;
  /** Темп рыскания, рад/с: плюс — нос вправо. */
  readonly yawRate: number;
  /** Вертикальная скорость, м/с. */
  readonly climbRate: number;
  /** Путевая скорость по горизонтали, м/с. */
  readonly groundSpeed: number;
  /** Signed speed along the aircraft nose; negative means rolling backward. */
  readonly forwardSpeed?: number;
}

export interface AirplaneForcePoint {
  readonly force: readonly [number, number, number];
  readonly point: readonly [number, number, number];
}

export interface AirplaneAuthority {
  readonly throttle: number;
  readonly aileron: number;
  readonly elevator: number;
  readonly rudder: number;
  readonly flap: number;
}

export interface AirplaneFlightStep {
  readonly requested: AirplaneSurfaceCommand;
  readonly delivered: AirplaneSurfaceCommand;
  readonly air: AirplaneAirState;
  readonly airspeed: number;
  readonly alpha: number;
  readonly flap: number;
  readonly forces: readonly AirplaneForcePoint[];
  readonly authority: AirplaneAuthority;
  readonly lift: number;
  readonly drag: number;
  readonly thrust: number;
  /** Заданная поза, которую держит автомат: приёмке нужно ЧТО просили. */
  readonly targetPitch: number;
  readonly targetBank: number;
  readonly stalled: boolean;
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
  const blend = clamp01(flap);
  return clean + (dirty - clean) * blend;
}

/** Предельный угол атаки: он и есть паспортный Clmax, а не второе число. */
/**
 * МИНИМАЛЬНАЯ ЛЁТНАЯ СКОРОСТЬ — Vref, 1.3 ОТ СВАЛИВАНИЯ В КОНФИГУРАЦИИ.
 *
 * Не запас «на всякий случай» и не подобранное число: 1.3·Vs — классическая
 * скорость захода, и множитель этот существует именно потому, что на глиссаде
 * машина ещё маневрирует — довыравнивается по створу, парирует снос, выбирает
 * выравнивание, — а всякий манёвр это перегрузка, то есть подъём скорости
 * сваливания в `sqrt(n)` раз. Полтора «же» на выравнивании дают ровно 1.22, и
 * тридцать процентов покрывают их с небольшим остатком.
 *
 * Цена отсутствия этого пола замерена. Регулятор хода строит профиль
 * торможения от остатка трассы и у порога просил 15 м/с; машина держалась за
 * собственный пол 1.15·Vs = 31 м/с, шла на угле атаки 23° и сваливалась в
 * трёхстах метрах до полосы. Крылатая машина ниже своей скорости не летит
 * медленно — она НЕ ЛЕТИТ. Ниже этой полки ход опускает только опора.
 */
export const AIRPLANE_REFERENCE_MARGIN = 1.3;

export function airplaneReferenceSpeed(
  passport: AirplanePassport,
  flap: number,
): number {
  return stallSpeedOf(passport, flap) * AIRPLANE_REFERENCE_MARGIN;
}

export function stallAlphaOf(
  passport: Pick<AirplanePassport, "clMax" | "cl0" | "clAlpha">,
): number {
  return (passport.clMax - passport.cl0) / passport.clAlpha;
}

/**
 * Что несёт одна панель крыла. Воздух берётся ИЗ ПАСПОРТА, а не справочный:
 * иначе приговор «летит / свалилась / кувыркается» выносится в одной
 * атмосфере, а силы считаются в другой, и панель, не несущая машину, по
 * бумаге держит её с полусотенным запасом. Ровно этот разрыв поймал тест
 * сваливания сразу после перекалибровки массы.
 */
export function wingPanelCapacity(
  passport: Pick<AirplanePassport, "wingArea" | "clMax" | "airDensity">,
  airspeed: number,
  flap: number,
  panelCount: number,
): number {
  const cl = passport.clMax + passport.clMax * 0.18 * clamp01(flap);
  const area = passport.wingArea / Math.max(1, panelCount);
  return dynamicPressure(airspeed, passport.airDensity) * area * cl;
}

// ---------------------------------------------------------------------------
// СВЯЗАННЫЕ ОСИ
// ---------------------------------------------------------------------------

type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

/**
 * Тройка связанных осей машины. Нос авторский, верх — вертикаль мира,
 * ортогонализованная к носу: пока машина нарисована крыльями в горизонт (а она
 * нарисована), другого определения «верха» у неё нет.
 */
export interface AirplaneAxes {
  readonly forward: SceneVector3;
  readonly up: SceneVector3;
  readonly right: SceneVector3;
}

export function airplaneAxes(nose: SceneVector3): AirplaneAxes {
  const forward = normalize(nose);
  const vertical: SceneVector3 = [0, 1, 0];
  const along = dot(forward, vertical);
  const rawUp: SceneVector3 = [
    vertical[0] - forward[0] * along,
    vertical[1] - forward[1] * along,
    vertical[2] - forward[2] * along,
  ];
  const up = Math.hypot(...rawUp) > 1e-6 ? normalize(rawUp) : ([0, 0, 1] as SceneVector3);
  return { forward, up, right: cross(up, forward) };
}

function stationVector(axes: AirplaneAxes, station: AirplaneStation): SceneVector3 {
  return [
    axes.forward[0] * station.ahead + axes.up[0] * station.above + axes.right[0] * station.right,
    axes.forward[1] * station.ahead + axes.up[1] * station.above + axes.right[1] * station.right,
    axes.forward[2] * station.ahead + axes.up[2] * station.above + axes.right[2] * station.right,
  ];
}

/**
 * Состояние в потоке. Скорость и угловая скорость приходят МИРОВЫЕ, здесь они
 * разворачиваются в связанные: угол атаки при крене иначе считается неверно —
 * прежняя редакция брала его из мировых углов и на спине меняла знак сама.
 */
export function airplaneAirState(input: {
  readonly velocity: SceneVector3;
  readonly angularVelocity: SceneVector3;
  readonly orientation: Quaternion;
  readonly nose: SceneVector3;
}): AirplaneAirState {
  const axes = airplaneAxes(input.nose);
  const local = rotateByInverse(input.orientation, input.velocity);
  const omega = rotateByInverse(input.orientation, input.angularVelocity);
  const forward = dot(local, axes.forward);
  const upward = dot(local, axes.up);
  const rightward = dot(local, axes.right);
  const airspeed = Math.hypot(...local);
  const worldForward = rotateByQuaternion(input.orientation, axes.forward);
  const worldUp = rotateByQuaternion(input.orientation, axes.up);
  const worldRight = rotateByQuaternion(input.orientation, axes.right);
  return {
    airspeed,
    alpha: airspeed > 0.4 ? Math.atan2(-upward, forward) : 0,
    beta: airspeed > 0.4 ? Math.asin(clamp(rightward / airspeed, -1, 1)) : 0,
    pitch: Math.atan2(worldForward[1], Math.hypot(worldForward[0], worldForward[2])),
    bank: Math.atan2(-worldRight[1], worldUp[1]),
    rollRate: -dot(omega, axes.forward),
    pitchRate: -dot(omega, axes.right),
    yawRate: dot(omega, axes.up),
    climbRate: input.velocity[1],
    groundSpeed: Math.hypot(input.velocity[0], input.velocity[2]),
    forwardSpeed: forward,
  };
}

/** Истинная воздушная скорость. Проекция на нос — не она, и это стоило полёта. */
export function airplaneAirspeed(velocity: SceneVector3): number {
  return Math.hypot(...velocity);
}

// ---------------------------------------------------------------------------
// АВТОМАТ УПРАВЛЕНИЯ
// ---------------------------------------------------------------------------

/**
 * Закрылки — конфигурация автомата, не рычаг автопилота.
 * Заход выпускает полностью. На малой скорости — тоже. На крейсере убирает.
 */
export function airplaneFlapFor(
  demand: Pick<VehicleGuidanceDemand, "finalPhase" | "forwardSpeed">,
  airspeed: number,
  passport: Pick<
    AirplanePassport,
    "stallSpeed" | "stallSpeedFlaps" | "cruiseSpeed" | "rotateSpeed"
  >,
  availability = 1,
  onGround = false,
  /**
   * Высота над опорой, м. Отличает разбег от беды: и там, и там машина
   * медленная, но на разбеге ей нужен ВЗЛЁТНЫЙ угол щитка, а в воздухе —
   * посадочный. Признака нагрузки на стойку для этого мало: на разбеге олео
   * разгружается за несколько секунд до отрыва, машина висит в сантиметрах
   * над бетоном, и автомат успевал выпустить полный щиток посреди разгона.
   * Со стороны это выглядит подтормаживанием и съедает полосу.
   */
  // Не сообщили — значит машина НЕ у земли: молчание не должно означать
  // «стою на полосе», иначе крейсер получает взлётный щиток.
  heightAboveGround = Number.POSITIVE_INFINITY,
): number {
  const speed = Math.max(airspeed, demand.forwardSpeed * 0.25);
  // ВЗЛЁТНОЕ ПОЛОЖЕНИЕ — НЕ ПОСАДОЧНОЕ. Правило «медленно — значит полностью»
  // верно в воздухе и неверно на полосе: полный щиток на разбеге добавляет
  // больше сопротивления, чем подъёма, и удлиняет разбег на ровном месте.
  // Взлётное положение — у машины НА ЗЕМЛЕ и не на заходе. Соблазн привязать
  // его к скорости (ниже Vr — значит взлёт) неверен: медленно и в воздухе —
  // это не взлёт, а машина, которой не хватает подъёма, и ей нужен полный
  // щиток. Дёрганья на отрыве это не создаёт: там скорость уже выше Vr, и
  // воздушное расписание даёт почти тот же угол.
  const departing =
    !demand.finalPhase &&
    (onGround || heightAboveGround < TAKEOFF_CONFIGURATION_HEIGHT);
  const wanted = demand.finalPhase
    ? 1
    : departing
      ? 0.5
      : speed < passport.stallSpeedFlaps * 1.18
        ? 1
        : speed < passport.stallSpeed * 1.22
          ? 0.55
          : speed > passport.cruiseSpeed * 0.82
            ? 0
            : 0.25;
  return wanted * clamp01(availability);
}

/**
 * УСИЛЕНИЕ КОНТУРА ПОЗЫ ЛОЖИТСЯ НА НАПОР, А НЕ НА СКОРОСТЬ.
 *
 * Власть створки пропорциональна `q`, поэтому постоянное усиление на заходе
 * даёт вчетверо более вялую машину, чем на крейсере, а на разгоне — вчетверо
 * более резкую. Отношение напоров держит контур одинаковым везде и не требует
 * ни одной таблицы.
 */
function surfaceGain(passport: AirplanePassport, airspeed: number): number {
  const reference = passport.cruiseSpeed * passport.cruiseSpeed;
  const live = Math.max(airspeed * airspeed, passport.stallSpeedFlaps * passport.stallSpeedFlaps * 0.36);
  return clamp(reference / live, 0.25, 6);
}

/**
 * Угол атаки установившегося горизонта на этой скорости, крене и закрылках.
 * Это ЗАДАНИЕ тангажа, а не его измерение: нос обязан стоять там, где крыло
 * само несёт вес, иначе контур высоты воюет с контуром скорости.
 */
export function airplaneTrimAlpha(
  passport: AirplanePassport,
  airspeed: number,
  flap: number,
  bank: number,
  wingLoading: number,
): number {
  const q = dynamicPressure(
    Math.max(airspeed, passport.stallSpeedFlaps * 0.5),
    passport.airDensity,
  );
  const required = (wingLoading / Math.max(0.2, Math.cos(bank))) / (q * passport.wingArea);
  const alpha = (required - passport.cl0 - passport.clFlap * flap) / passport.clAlpha;
  const ceiling = stallAlphaOf(passport) * 0.85;
  return clamp(alpha, -ceiling, ceiling);
}

/**
 * Крен координированного виража. Темп рыскания — СЛЕДСТВИЕ крена, поэтому
 * просьбу автопилота о развороте автомат превращает в угол, а не в момент:
 * момент сделал бы угол свободным интегратором, и машина легла бы на спину.
 */
export function airplaneBankFor(
  passport: AirplanePassport,
  yawRateDemand: number,
  airspeed: number,
): number {
  const speed = Math.max(airspeed, passport.stallSpeedFlaps);
  const bank = Math.atan((yawRateDemand * speed) / GRAVITY);
  return clamp(bank, -passport.maximumBank, passport.maximumBank);
}

/**
 * Отклик вертикального контура: за столько просьба о доле веса превращается в
 * вертикальную скорость. Ровно это число связывает силу с углом, и оно одно
 * на весь модуль — газ и руль высоты обязаны считать один и тот же набор.
 */
export const CLIMB_RESPONSE_SECONDS = 2.5;

/**
 * До этой высоты машина считается ещё взлетающей: щиток стоит во взлётном
 * положении, а не в посадочном. Тридцать метров — это уже уверенный отрыв, но
 * ещё не рубеж уборки механизации.
 */
const TAKEOFF_CONFIGURATION_HEIGHT = 30;

/** Ниже этой высоты машина держит крылья горизонтально: только взлёт. */
const TAKEOFF_WINGS_LEVEL_HEIGHT = 12;
/** Выше этой манёвр открыт полностью. */
export const TAKEOFF_MANOEUVRE_HEIGHT = 60;

/**
 * ДОЛЯ ПРЕДЕЛЬНОГО НАКЛОНА, КОТОРУЮ МАШИНА БЕРЁТ НА ВЗЛЁТЕ. Три четверти:
 * четверть остаётся контуру на парирование, иначе первый же порыв сажает
 * машину на упор угла атаки.
 */
export const TAKEOFF_CLIMB_SHARE = 0.75;

/**
 * УГОЛ НАБОРА ВЗЛЁТНОГО РЕЖИМА. Экспортируется НЕ для красоты: профиль трассы
 * обязан спрашивать его у машины, а не назначать свой.
 *
 * Пока трасса объявляла собственный градиент, он расходился с тем, что машина
 * делает на самом деле: профиль просил пять градусов, машина брала девять — и
 * автопилот сразу после отрыва требовал СНИЖЕНИЯ, чтобы вернуть её на профиль.
 * Замер: просьба о снижении −0.22 держалась семь секунд подряд с момента
 * отрыва, и газ уходил в ноль вслед за ней. Со стороны это «взлётный режим,
 * а сразу за ним ноль».
 */
export function airplaneTakeoffClimbAngle(passport: AirplanePassport): number {
  return passport.maximumClimbAngle * TAKEOFF_CLIMB_SHARE;
}

/** За столько машина выбирает крен до заданного. */
const ROLL_SECONDS = 1.5;
/** Потолок темпа крена: выше него вираж читается броском. Экспортируется,
 * потому что от него считаются ворота «возмущения»: перекладка на СВОЁМ
 * командном темпе — это манёвр, а не срыв. */
export const ROLL_RATE_LIMIT = 0.5;
/**
 * Усиление контура темпа крена. Замерено, а не выбрано: у этой машины элерон
 * даёт 2.2 рад/с² на единицу команды, и усиление 2.2 разносит явный интегратор
 * на шаге 1/60 — крен уходил за шестьдесят градусов на ровной горизонтали без
 * единой просьбы. 0.8 держит вираж чисто: 39° крена, 2.4° скольжения, круг
 * радиусом 280 м без раскачки.
 */
const ROLL_RATE_GAIN = 0.8;

/**
 * ПОТОЛОК КРЕНА: НАБОР И ВИРАЖ ДЕЛЯТ ОДНУ ПОДЪЁМНУЮ СИЛУ.
 *
 * В вираже крыло несёт `W/cos φ`, а на наборе — ещё и просимую прибавку. Обе
 * задачи оплачиваются одним и тем же Cl, и когда сумма выходит за Clmax,
 * машина не «немного не дотягивает», а СВАЛИВАЕТСЯ. Замер: автопилот просил
 * одновременно полный набор и сорок градусов крена, руль высоты вставал в
 * упор, угол атаки уходил за срыв, и через три секунды крен был +42° при
 * заданных −40°. Машина уходила в воду на первом же развороте.
 *
 * Поэтому крен ограничивается тем, что осталось от подъёмной силы ПОСЛЕ
 * вертикальной просьбы. Это не поправка на устойчивость, а тождество:
 * `cos φ ≥ W·(1 + прибавка) / (Clmax·q·S)`. Тот же закон, что уже записан
 * для винтокрылой машины («крен съедает вертикаль»), только у крыла он
 * выводится из Clmax, а не из тяги.
 */
export function airplaneBankCeiling(
  passport: AirplanePassport,
  airspeed: number,
  weight: number,
  liftFraction: number,
  flap: number,
): number {
  const q = dynamicPressure(
    Math.max(airspeed, passport.stallSpeedFlaps * 0.5),
    passport.airDensity,
  );
  // Восемь десятых, а не девять: рулю высоты нужен собственный запас по углу
  // атаки, иначе машина «укладывается в бюджет» ровно до первого движения
  // рулём и срывается на нём же.
  const usable =
    0.8 * (passport.clMax + passport.clFlap * clamp01(flap)) * q * passport.wingArea;
  const wanted = weight * (1 + Math.max(0, liftFraction));
  if (!(usable > 0)) return 0;
  return Math.acos(clamp(wanted / usable, 0, 1));
}

/**
 * УСТАНОВИВШИЙСЯ ТЕМП КРЕНА НА ЕДИНИЦУ ЭЛЕРОНА. Вывод, а не замер.
 *
 * Пропорциональный контур по темпу проседает: он создаёт отклонение только
 * ОШИБКОЙ, а установившийся темп уравновешивается демпфированием крыла. Замер
 * на прежней редакции: на просьбе 0.35 рад/с машина давала 0.17 и выходила на
 * тридцать пять градусов ШЕСТЬ СЕКУНД. Автопилот же считает темп рыскания
 * доставленным сразу, и всё это время видел растущую ошибку, которую сам же и
 * создал, — отсюда перекладки с упора на упор.
 *
 * В установившемся крене момент элеронов равен демпфирующему, и напор в обеих
 * частях сокращается. Остаётся геометрия секций:
 *
 *     Σ A·δ_ail·y  ·  aileronPower   =   Clα · (p/V) · Σ A·y²
 *
 * Слева — момент створок, справа — демпфирование: секция на плече `y` при
 * темпе `p` встречает поток под добавочным углом `p·y/V`. Отсюда
 *
 *     p = δ · aileronPower · V · Σ(A·доля·y) / (Clα · Σ(A·y²)).
 *
 * Ни одного подобранного числа: всё это площади и плечи с нарисованной сетки.
 */
export function airplaneRollRatePerAileron(
  passport: AirplanePassport,
  airspeed: number,
): number {
  const speed = Math.max(airspeed, passport.stallSpeedFlaps);
  let moment = 0;
  let damping = 0;
  for (const section of passport.wingSections) {
    const arm = Math.abs(section.station.right);
    moment += section.area * section.aileron * arm;
    damping += section.area * arm * arm;
  }
  if (!(damping > 0) || !(passport.clAlpha > 0)) return 0;
  return (passport.aileronPower * moment * speed) / (passport.clAlpha * damping);
}

/**
 * ПЕРЕКЛЮЧЕНИЕ С ПРОБЕГА НА РУЛЕНИЕ.
 *
 * Приземлился — полный стоп пробегом; после фактической остановки управление
 * принимает отдельный наземный автопилот. Маршрут объявляет последовательность
 * rollout → taxi и дальнейшую геометрию, а исполнение rollout завершается
 * физическим результатом требования: машина стоит на опоре.
 */
export type AirplaneTaxiPhase = "rollout" | "taxi";

export interface AirplaneTaxiState {
  readonly phase: AirplaneTaxiPhase;
}

export function advanceAirplaneTaxi(
  previous: AirplaneTaxiState | null,
  input: {
    readonly journey: AirplaneJourneyStage;
    readonly onGround: boolean;
    readonly groundSpeed: number;
  },
): AirplaneTaxiState | null {
  const arrival =
    input.journey === "approach" ||
    input.journey === "rollout" ||
    input.journey === "taxi";
  if (!arrival) return null;
  // Маршрутный `touchdown` начинает ПОСАДОЧНЫЙ ПРОБЕГ. Касание может
  // защёлкнуть его чуть раньше, если физическая машина пришла ниже плана;
  // промах на сантиметры вверх, напротив, не имеет права оставить автомат в
  // полёте после уже пройденной точки касания. Реверс начнёт гасить ход, а
  // колодки физически подхватят его только после нагрузки стойки.
  if (previous?.phase === "rollout") {
    return input.onGround && input.groundSpeed < 0.4
      ? { phase: "taxi" }
      : previous;
  }
  if (previous?.phase === "taxi") return previous;
  if (input.journey === "rollout" || input.journey === "taxi") {
    return { phase: "rollout" };
  }
  if (!input.onGround) return null;
  return {
    phase: "rollout",
  };
}

/** Подмножество общего словаря стадий, которое различает крылатая машина. */
export type AirplaneJourneyStage =
  | "docked"
  | "attention"
  | "departure"
  | "cruise"
  | "approach"
  | "rollout"
  | "taxi"
  | "failed";

export interface AirplaneControlInput {
  readonly passport: AirplanePassport;
  readonly guidance: VehicleGuidanceDemand;
  readonly air: AirplaneAirState;
  /** Вес машины, Н: рабочая точка считается от живого паспорта. */
  readonly weight: number;
  /** Стойки нагружены: разбег и пробег — другой закон, чем полёт. */
  readonly onGround: boolean;
  readonly flapAvailability?: number;
  /**
   * Сколько секунд идёт предполётная проверка органов. `undefined` — машина
   * уже в рейсе, проверка позади. Часы держит рантайм: автомат остаётся
   * чистым, а закон проверки живёт здесь, рядом с законом полёта.
   */
  /**
   * СТАДИЯ РЕЙСА ИЗ ОБЩЕГО ЖУРНАЛА (`LampEventState`), а не собственный
   * признак автомата. Тот же словарь, по которому убираются опоры и светят
   * сигнальные стёкла: `docked` — рейса нет, `attention` — прогрев и проверка
   * у берта, `departure` — взлёт, дальше маршрут и заход. Заводить рядом свой
   * счётчик «отправлена ли машина» значит завести вторую правду о том же.
   */
  readonly journey?: AirplaneJourneyStage;
  /** Сколько длится текущая стадия, с: проверке органов нужен только он. */
  readonly journeySeconds?: number;
  /** Высота над опорой, м: разбег отличается от полёта именно ею. */
  readonly heightAboveGround?: number;
  /** Фаза наземного завершения рейса, если вызывающий её ведёт. */
  readonly taxi?: AirplaneTaxiPhase | null;
  /** Позиционная команда наземного автопилота: DC-3 находится в вершине. */
  readonly taxiPivot?: boolean;
  /** Продольное ускорение, рассчитанное профилем скорости DC-3 taxi. */
  readonly taxiAcceleration?: number;
  /** Direct rest-to-rest yaw acceleration from the ground navigator. */
  readonly taxiYawAcceleration?: number;
  /** Момент инерции вокруг вертикали, нужный наземному yaw-контру. */
  readonly yawInertia?: number;
  /** Реальный отклик двигателей, с. */
  readonly yawResponseSeconds?: number;
  /** Физическое угловое демпфирование корпуса, 1/с. */
  readonly yawDamping?: number;
}

/** Maximum yaw authority of the opposed propeller pair about the main axle. */
export function airplaneGroundYawAuthority(
  passport: AirplanePassport,
  yawInertia: number,
  mass = 0,
): {
  readonly coupleArm: number;
  readonly moment: number;
  readonly angularAcceleration: number;
} {
  const left = passport.engineStations[0];
  const right = passport.engineStations[1];
  if (!left || !right) {
    throw new Error("Airplane ground yaw requires two engine stations");
  }
  if (yawInertia <= 0) {
    throw new Error("Airplane ground yaw requires positive yaw inertia");
  }
  const coupleArm = Math.abs(left.right - right.right);
  const moment = coupleArm * passport.enginePower;
  const axleAhead = passport.mainAxleAheadOfCentre ?? 0;
  const pivotInertia = yawInertia + Math.max(0, mass) * axleAhead * axleAhead;
  return {
    coupleArm,
    moment,
    angularAcceleration: moment / pivotInertia,
  };
}

/**
 * Propeller wrench for a stationary ground turn.
 *
 * The navigator owns the rest-to-rest angular acceleration. This allocator
 * converts it directly into moment and simultaneously solves the common
 * thrust which keeps the main axle still. The latter is not optional for a
 * taildragger whose mass centre is behind the axle: while the body rotates,
 * the centre must accelerate towards the axle by `a = r * yawRate²`. The same
 * geometry gives the parallel-axis yaw inertia `I_axle = I_centre + m*r²`.
 * No authored throttle split belongs here; both propeller forces are the
 * solution of those two equations.
 */
export function airplaneGroundYawThrottles(input: {
  readonly passport: AirplanePassport;
  readonly angularAcceleration: number;
  readonly yawRate: number;
  readonly forwardSpeed: number;
  readonly mass: number;
  readonly yawInertia: number;
  readonly responseSeconds: number;
  readonly angularDamping?: number;
}): readonly [number, number] {
  const { passport } = input;
  const left = passport.engineStations[0];
  const right = passport.engineStations[1];
  if (!left || !right) {
    throw new Error("Airplane ground yaw requires two engine stations");
  }
  if (input.responseSeconds <= 0) {
    throw new Error("Airplane ground yaw requires positive response time");
  }
  if (input.mass <= 0 || input.yawInertia <= 0) {
    throw new Error("Airplane ground yaw requires positive mass and yaw inertia");
  }

  // Forward thrust at a right-offset engine produces negative world yaw.
  const leftYawArm = -left.right;
  const rightYawArm = -right.right;
  const coupleArm = leftYawArm - rightYawArm;
  if (Math.abs(coupleArm) <= 1e-6) return [0, 0];
  const damping = Math.max(0, input.angularDamping ?? 0);
  const axleAhead = passport.mainAxleAheadOfCentre ?? 0;
  const axleYawInertia =
    input.yawInertia + input.mass * axleAhead * axleAhead;
  const mainNormalShare =
    passport.wheelbase > 1e-6
      ? clamp((passport.wheelbase - axleAhead) / passport.wheelbase, 0, 1)
      : 0;
  const rollingYawResistance =
    (passport.mainWheelRollingResistance ?? 0) *
    input.mass *
    GRAVITY *
    mainNormalShare *
    (passport.mainWheelHalfTrack ?? 0);
  const requestedMoment =
    axleYawInertia * input.angularAcceleration +
    input.yawInertia * damping * input.yawRate +
    Math.sign(
      Math.abs(input.yawRate) > 1e-4
        ? input.yawRate
        : input.angularAcceleration,
    ) * rollingYawResistance;

  // The axle rolling speed equals the centre's body-forward speed. Holding
  // the axle fixes that velocity while the centre follows its circular path.
  const requestedForwardForce =
    input.mass *
    (axleAhead * input.yawRate * input.yawRate -
      input.forwardSpeed / input.responseSeconds);

  // Preserve the calculated axle-holding force when the requested wrench
  // reaches the two-engine envelope. Uniformly scaling both equations made
  // the main axle creep whenever the yaw channel asked for full authority.
  // With F = L + R fixed, each engine's ±P bound gives the exact feasible
  // interval for L; clamping the moment solution to that interval spends all
  // remaining authority on yaw without sacrificing the positional equation.
  const forwardForce = clamp(
    requestedForwardForce,
    -2 * passport.enginePower,
    2 * passport.enginePower,
  );
  const requestedLeft =
    (requestedMoment - rightYawArm * forwardForce) / coupleArm;
  const minimumLeft = Math.max(
    -passport.enginePower,
    forwardForce - passport.enginePower,
  );
  const maximumLeft = Math.min(
    passport.enginePower,
    forwardForce + passport.enginePower,
  );
  const leftForce = clamp(requestedLeft, minimumLeft, maximumLeft);
  const rightForce = forwardForce - leftForce;
  return [
    leftForce / passport.enginePower,
    rightForce / passport.enginePower,
  ];
}

/**
 * ЗАПРОШЕННЫЕ ОРГАНЫ. Пять замкнутых контуров и ни одной свободной интеграции.
 */
export function airplaneAllocate(input: AirplaneControlInput): AirplaneSurfaceCommand {
  const { passport, guidance, air, weight, onGround } = input;
  const gain = surfaceGain(passport, air.airspeed);
  const flap = airplaneFlapFor(
    guidance,
    air.airspeed,
    passport,
    input.flapAvailability ?? 1,
    onGround,
    input.heightAboveGround ?? Number.POSITIVE_INFINITY,
  );

  // Маршрут объявляет departure и его траекторию; автопилот формирует
  // требования скорости и подъёма, а этот автомат лишь распределяет их по
  // тяге и поверхностям в пределах физики машины.
  const height = input.heightAboveGround ?? Number.POSITIVE_INFINITY;
  // СТОЯНКА, ПРОГРЕВ И ВЗЛЁТ РАЗЛИЧАЮТСЯ ПО ОБЩЕМУ ЖУРНАЛУ РЕЙСА.
  //
  // Своего признака «отправлена ли машина» у автомата нет и быть не должно:
  // журнал уже ведётся, по нему убираются опоры и светят сигнальные стёкла.
  // Попытка вывести отправление из просимого хода стоила двух регрессий
  // подряд — сначала самолёт уезжал взлетать сам, потому что стоял низко над
  // землёй, потом не трогался по команде, потому что разгонная полка в первые
  // секунды ниже порога.
  const stage = input.journey ?? "cruise";
  const parked = stage === "docked";
  const checking = stage === "attention";
  // ── ХОД ───────────────────────────────────────────────────────────────
  // Газ замкнут на скорость. Разомкнутая полка «просьба / крейсер» держала
  // единицу всю дорогу, пока машина разгонялась в пикировании до 129 м/с.
  // Arrival и final остаются полётом: на них действует лётный минимум.
  // Только маршрутный rollout либо уже случившееся физическое касание снимает
  // этот минимум и разрешает реверс. Taxi — следующая отдельная фаза.
  const groundOperation =
    stage === "rollout" || stage === "taxi" || input.taxi != null;
  const targetSpeed = clamp(
    Math.abs(guidance.forwardSpeed),
    // Arrival and final remain flight. The floor disappears only when the
    // route has entered rollout (or physical contact latched it early).
    onGround || groundOperation ? 0 : airplaneReferenceSpeed(passport, flap),
    passport.maximumSpeed,
  );
  // ГАЗ ОБЯЗАН ЗНАТЬ ПРО НАБОР, ИНАЧЕ КОНТУРЫ ГАСЯТ ДРУГ ДРУГА.
  //
  // Рабочая точка горизонта покрывает только сопротивление. Набор — это ещё
  // `W·sin γ` сверху, и без этого слагаемого машина ведёт себя ровно так, как
  // и вела на замере: задирает нос, теряет ход, контур скорости добавляет газ
  // ровно столько, чтобы вернуть ход, — и высота не растёт вовсе. Полсотни
  // секунд полёта на пятнадцати метрах при полной просьбе о наборе.
  //
  // На земле рабочей точки горизонта НЕТ и спрашивать её нельзя: на нулевой
  // скорости потребный Cl уходит в десятки, и стоящая машина получала семь
  // десятых газа — она уезжала со стоянки сама.
  // Прибавка к тяге идёт от ПРОСЬБЫ, а не от текущего снижения. Замер на
  // первой редакции: feedforward, считавший угол от собственной вертикальной
  // скорости, срезал газ ровно тогда, когда машина уже проваливалась, — и тем
  // углублял провал. Штопор из одной строки: газ 0.24 → 0.08 → 0.00 при
  // полной просьбе о наборе.
  // ТЯГА НЕ БЫВАЕТ ОТРИЦАТЕЛЬНОЙ В ВОЗДУХЕ, И РАБОЧАЯ ТОЧКА ТОЖЕ.
  //
  // На снижении потребная тяга равна `сопротивление − W·sin γ`, и ниже нуля
  // она не опускается: машине, которой нужно «меньше нуля», нужен не реверс,
  // а другой угол снижения. Без этого пола просьба о снижении вычитала из
  // рабочей точки больше, чем в ней было, газ уходил в ноль — и винты
  // ОСТАНАВЛИВАЛИСЬ прямо на наборе. Со стороны это выключенные двигатели.
  const throttleTrim = onGround
    ? 0
    : Math.max(
        0,
        (levelThrust(passport, targetSpeed, weight, flap) +
          weight * clamp(guidance.liftFraction, -0.5, 0.5)) /
          Math.max(1, 2 * passport.enginePower),
      );
  const speedError = targetSpeed - air.airspeed;
  const rawThrottle = throttleTrim + speedError * 0.08;
  // ── ТОРМОЗИТ ТОТ, КТО ОСТАНАВЛИВАЕТСЯ, А НЕ ТОТ, КТО РАЗБЕГАЕТСЯ ────────
  //
  // Признак «машина на земле» для тормоза и реверса недостаточен: разбег и
  // пробег оба идут по бетону. На разбеге просьба о ходе гуляет — ограничитель
  // скорости готовится к первому развороту и на секунду опускает её ниже
  // достигнутой, — и машина честно давала колодки и реверс посреди разгона.
  // Со стороны это выглядит как два подтормаживания и отрыв с середины полосы.
  //
  // Разделяет их ФАЗА РЕЙСА, которую трасса и так объявляет. Разбег идёт до
  // створа, пробег — после него; одной скорости для различения мало, потому
  // что разгонная полка сама выходит на режим не мгновенно и в начале разбега
  // лежит ниже достигнутого хода. Признак створа у контракта уже есть, и это
  // ровно тот признак, который нужен: колодки и обратный шаг — органы
  // ПРИБЫТИЯ.
  // СТОЯЩАЯ МАШИНА ДЕРЖИТСЯ ТОРМОЗОМ — тот же закон, что у наземной машины
  // проекта: пока рейса нет, колодки зажаты.
  const stopping = groundOperation;
  // ── ПРОБЕГ: КАСАНИЕ ОЗНАЧАЕТ ТОРМОЖЕНИЕ ДО НУЛЯ, А НЕ ПОЕЗДКУ К ТОЧКЕ ──
  //
  // Прежде пробег слушал тормозную кривую трассы: она ведёт к стоп-узлу у
  // дальнего порога и разрешает катиться, пока остаток велик. Машина, чей
  // тормозной путь — половина полосы, честно доезжала до конца, а признак
  // «останавливаюсь» мигал вслед за полкой, дёргая реверс. Настоящий экипаж
  // делает наоборот: колодки и полный реверс СРАЗУ после касания — реверс
  // эффективнее всего на скорости, — реверс прибирается на малом ходу, чтобы
  // не гнать поток на себя, колодки дожимают до нуля. Где машина встала —
  // там рейс и кончился; рулёжка к стоянке — не часть посадки.
  // Физическое руление объявлено вызывающим отдельно от посадочного створа.
  // Наземному path follower для этого не надо притворяться лётным approach.
  const rolloutLatched = input.taxi === "rollout";
  const taxiGrounded = onGround && input.taxi === "taxi";
  const grounded = rolloutLatched || (stopping && onGround) || taxiGrounded;
  const taxiPhase = rolloutLatched
    ? "rollout"
    : taxiGrounded
      ? "taxi"
      : grounded
        ? "rollout"
        : null;
  // ── ЗАВЕРШЕНИЕ РЕЙСА НА ЗЕМЛЕ: СТОП → ВЫДЕРЖКА → РУЛЕНИЕ ──────────────
  //
  // Пробег: полный реверс и колодки до полной остановки — куда бы ни звала
  // полка трассы; реверс прибирается на малом ходу. Руление: медленно и строго
  // по осевой; на вершинах ломаной
  // машина разворачивается НА МЕСТЕ разнотягом — внешний двигатель вперёд,
  // внутренний в реверс: у настоящей хвостовой машины это и есть штатный
  // наземный разворот, а не сглаженная дуга, которая не умещается в ширину
  // перемычки.
  const taxiDemand = Math.abs(guidance.forwardSpeed);
  const rollout = taxiPhase === "rollout";
  const taxiing = taxiPhase === "taxi";
  const rolloutExcess = air.groundSpeed - (rollout ? 0 : taxiDemand);
  // Колодки помогают исполнить уже выбранную наземным автопилотом
  // скорость; сама трасса даёт только верхнюю полку.
  const brakeThreshold = 0.2;
  // ── ПОВОРОТ НА ЗЕМЛЕ — РАЗНОФАЗ ДВИГАТЕЛЕЙ ПО СПРОСУ АВТОПИЛОТА ───────
  //
  // Никаких фаз манёвра, ворот и стоп-точек (вердикт Igor, 15.08.2026:
  // «машина САМА поворачивает: автопилот командует как, автомат исполняет
  // разнофазом в сторону поворота, едет дальше по траектории»). Автомат
  // закрывает недобор темпа рыскания парой винтов и одновременно удерживает
  // середину главной оси: на прямой спрос закрыт колесом и пара молчит, у излома
  // трассы спрос превышает возможности качения — пара доворачивает машину,
  // прицел уходит на следующую прямую, спрос гаснет, машина едет дальше.
  // Ноль поступательного спроса с ненулевым рысканием — команда pivot от
  // наземного path follower. В этот момент поворот принадлежит только паре
  // двигателей: колесо и раздельная колодка не создают второго yaw-закона.
  // Нулевая скорость и ошибка курса сами по себе НЕ означают поворот.
  // Разнофаз разрешает только наземный path follower, уже захвативший
  // геометрическую вершину маршрута. Иначе любая большая ошибка курса вдали
  // от вершины превращала машину в самовольный pivot на месте.
  const groundPivoting = taxiing && input.taxiPivot === true;
  // Pivot has one actuator: the propeller pair. Its difference creates yaw;
  // its calculated sum prevents the freely rolling main axle from creeping.
  // A split wheel brake was not a passive anchor in the physical model: its
  // stiff contact accelerated the centre around the wheel and produced the
  // wide, growing spiral seen in the game. Main wheels therefore roll in
  // opposite directions and the tail wheel follows as a caster.
  const taxiBrakeSplit = 0;
  // Наземный path follower задаёт не только скорость, но и продольное
  // ускорение её позиционной кривой. Исполнитель переводит ускорение в
  // одинаковый газ обоих двигателей; обратная связь уже включена в саму
  // команду профиля. Старый P-контур остаётся только запасным контрактом для
  // наземного вызова без профиля.
  // Решение «можно ли уже ехать» принадлежит наземному path follower: он
  // держит forwardSpeed=0 до взятия выходного курса. Исполнитель не заводит
  // рядом второй gate по ошибке yawRate — тот душил тягу даже на прямой.
  const taxiSpeedError = taxiDemand - air.groundSpeed;
  const taxiMass = weight / GRAVITY;
  const fullForwardAcceleration =
    taxiMass > 1e-6 ? (2 * passport.enginePower) / taxiMass : 0;
  const profileAcceleration = input.taxiAcceleration;
  const profiledTaxi = taxiing && profileAcceleration !== undefined;
  const taxiThrottle = groundPivoting
    ? 0
    : profileAcceleration !== undefined
      ? clamp(
          profileAcceleration / Math.max(1e-6, fullForwardAcceleration),
          -1,
          1,
        )
      : clamp(
        (taxiDemand > 0.05 ? 0.04 : 0) + taxiSpeedError * 0.3,
        -1,
        0.35,
      );
  const rolloutThrottle = rollout
    ? -clamp01((rolloutExcess - 2) / 6)
    : taxiThrottle;
  const throttle = parked || checking
    ? 0
    : grounded
      ? rolloutThrottle
      : clamp(rawThrottle, 0, 1);

  // ── КРЕН ──────────────────────────────────────────────────────────────
  // Каскад, а не одна пропорция: угол задаёт ТЕМП крена, темп задаёт элерон.
  // Прямая пропорция по углу упиралась в упор на каждом входе в вираж и потом
  // раскачивала машину — 58°, 42°, 28°, 43° на одной и той же просьбе.
  // ── ПРИОРИТЕТ ВЗЛЁТА ──────────────────────────────────────────────────
  //
  // Настоящий экипаж на взлёте не маневрирует: взлётный режим, отрыв, выход
  // на безопасную высоту — и только потом развороты. Это не запрет манёвра, а
  // очерёдность: у самой земли крен стоит дорого (он крадёт вертикаль и
  // приближает консоль к полосе), а выигрыш от него нулевой — трасса всё
  // равно идёт прямо. Ниже `TAKEOFF_WINGS_LEVEL_HEIGHT` крен запрещён, к
  // `TAKEOFF_MANOEUVRE_HEIGHT` открывается полностью.
  const heightShare = clamp01(
    (height - TAKEOFF_WINGS_LEVEL_HEIGHT) /
      (TAKEOFF_MANOEUVRE_HEIGHT - TAKEOFF_WINGS_LEVEL_HEIGHT),
  );
  const bankCeiling =
    heightShare *
    airplaneBankCeiling(
      passport,
      air.airspeed,
      weight,
      guidance.liftFraction,
      flap,
    );
  const targetBank = onGround
    ? 0
    : clamp(
        airplaneBankFor(passport, guidance.yawRate, air.airspeed),
        -bankCeiling,
        bankCeiling,
      );
  const rollDemand = clamp(
    (targetBank - air.bank) / ROLL_SECONDS,
    -ROLL_RATE_LIMIT,
    ROLL_RATE_LIMIT,
  );
  // ── СКОЛЬКО ЭЛЕРОНА НУЖНО НА ЗАДАННЫЙ ТЕМП — ИЗВЕСТНО ЗАРАНЕЕ ──────────
  //
  // Пропорциональный контур по темпу проседает: он создаёт отклонение только
  // ошибкой, а установившийся темп крена уравновешивается демпфированием
  // консолей. Замер: на просьбе 0.35 рад/с машина давала 0.17 и выходила на
  // тридцать пять градусов ШЕСТЬ СЕКУНД. Автопилот же считает темп рыскания
  // доставленным сразу — у винтокрылой машины так и есть, — и всё это время
  // видел растущую ошибку, которую сам же и создал. Отсюда перекладки с упора
  // на упор и вылет с трассы при полуторакратном запасе поворотливости.
  //
  // Потребное отклонение выводится, а не подбирается (см.
  // `airplaneRollRatePerAileron`).
  const rollRatePerAileron = airplaneRollRatePerAileron(passport, air.airspeed);
  const aileronTrim =
    rollRatePerAileron > 1e-6 ? rollDemand / rollRatePerAileron : 0;
  // ── БАЛАНСИРОВКА ЭЛЕРОНА В УСТАНОВИВШЕМСЯ ВИРАЖЕ ─────────────────────
  //
  // Внешняя консоль идёт быстрее внутренней на ω·y и несёт больше: вираж
  // ВКАТЫВАЕТ машину глубже в крен. Держать крен постоянным можно только
  // встречным элероном, а встречный элерон пропорциональный контур создаёт
  // единственным способом — ПОСТОЯННОЙ ошибкой крена (~1°). Лишний градус
  // крена — лишние ~8% рыскания, и путевой закон компенсировал их стоячим
  // смещением +7.5 м внутрь круга. Замер баланса: спрос 0.051, полёт 0.055.
  //
  // Потребный элерон выводится из тех же секций, что считают силы: момент
  // вкатывания `(2ω/V)·q·Σ(A·cl·y²)` против момента створки
  // `δ·aileronPower·q·Σ(A·доля·y)` — напор сокращается:
  //
  //     δ = 2·ω·cl · Σ(A·y²) / (V · aileronPower · Σ(A·доля·y)).
  //
  // Феедфорвард считается от ПРОСИМОГО темпа: от замеренного он превратился
  // бы во вторую обратную связь.
  let turnHold = 0;
  if (!onGround && passport.aileronPower > 1e-6) {
    let damping = 0;
    let authority = 0;
    for (const section of passport.wingSections) {
      const arm = Math.abs(section.station.right);
      damping += section.area * arm * arm;
      authority += section.area * section.aileron * arm;
    }
    if (authority > 1e-6) {
      const sectionCl =
        passport.cl0 + passport.clAlpha * air.alpha + passport.clFlap * flap;
      const speed = Math.max(air.airspeed, passport.stallSpeedFlaps);
      // Знак: вкатывание действует В сторону виража, контр-элерон — против.
      turnHold =
        (-2 * guidance.yawRate * sectionCl * damping) /
        (speed * passport.aileronPower * authority);
    }
  }
  // ЗАПИРАТЬ ЭЛЕРОН ПО ЗАПАСУ ДО СРЫВА — ПРОБОВАЛОСЬ И ОТМЕНЕНО.
  //
  // Соблазн понятен: створка и подъёмная сила делят один Clmax, и полный ход
  // на нагруженном крыле выводит концевую секцию за срыв. Но потолок
  // `(Clmax − Cl)/aileronPower` запирает элерон ровно там, где крен и нужен:
  // в вираже угол атаки уже поднят перегрузкой, запас уходит в ноль, и машина
  // получает 0.2 хода против собственной спиральной неустойчивости. Замер:
  // крен −35° → −90° за две секунды при элероне, стоящем в этом потолке.
  //
  // Секции сделали ограничитель ненужным: срыв концевой полосы больше не
  // выключает консоль целиком и НЕ МЕНЯЕТ ЗНАК момента — он лишь слабеет
  // вдвое. Предел крена по остатку подъёмной силы (`airplaneBankCeiling`)
  // остаётся единственным и достаточным.
  const aileron = clamp(
    aileronTrim + turnHold + gain * ROLL_RATE_GAIN * (rollDemand - air.rollRate),
    -1,
    1,
  );

  // ── ТАНГАЖ ────────────────────────────────────────────────────────────
  // Выравнивание принадлежит профилю маршрута. DC-3 уже получает C¹-глиссаду,
  // которая снимает наклон до нуля у посадочной высоты центра масс. Второе
  // выравнивание по просвету стойки поднимало фактическую траекторию над этой
  // кривой и переводило снижение в набор ещё до физического касания.
  // НА ПРОБЕГЕ ПОЗА — ТРЁХТОЧЕЧНАЯ, А НЕ РАЗБЕЖНАЯ.
  //
  // `groundPitchTarget` написана для РАЗБЕГА: «нос поднимается по мере
  // разгона», и цель считается от скорости. На пробеге последовательность
  // скоростей обратная, и та же функция на посадочных 34 м/с требовала 3.5°
  // вместо трёхточечных 10.6°. Для машины с хвостовым колесом это команда
  // «держи хвост вверху» — то есть ровно поза капота через нос: автомат гнал
  // нос вниз, тангаж проходил ноль и уходил в минус, а тормоза при этом были
  // в нуле, и потому в них дело и не было.
  //
  // На пробеге лётчик делает обратное: держит хвост и ждёт, пока тот сядет.
  // Расписание подъёма носа по скорости принадлежит РАЗБЕГУ и только ему.
  const takingOff = stage === "departure";
  const targetPitch = onGround
    ? takingOff
      ? groundPitchTarget(passport, air.airspeed)
      : passport.groundPitch
    : flightPitchTarget(passport, guidance, air, weight, flap);
  const elevator = clamp(
    airplaneTrimElevator(passport, air, weight, flap) +
      gain * (2.4 * (targetPitch - air.pitch) - 1.3 * air.pitchRate),
    -1,
    1,
  );

  // ── РЫСКАНИЕ ──────────────────────────────────────────────────────────
  // В воздухе руль только убирает скольжение: разворачивает крен. На земле он
  // же и есть рулевое — вместе с хвостовым колесом.
  // ── КООРДИНАЦИЯ ВИРАЖА ВЫВОДИТСЯ, А НЕ ГАСИТСЯ ────────────────────────
  //
  // Прежде здесь стоял член `−0.8·yawRate`: демпфирование рыскания. Для
  // голландского шага это верно, а для виража — ровно наоборот. В развороте
  // машина ВРАЩАЕТСЯ, и киль на своём плече встречает поток под добавочным
  // углом `ω·l/V`: это его собственный флюгерный момент, направленный ПРОТИВ
  // разворота. Демпфирующий член добавляется к нему же — и удержать вираж
  // руль может только тогда, когда машина наберёт скольжение, достаточное,
  // чтобы член `1.8·β` его пересилил. Замер установившегося виража: 2.7°
  // скольжения, которое не уходит никогда, потому что оно и есть рабочая
  // точка контура. На створе это два с половиной метра в секунду сноса вбок
  // при формально верном курсе.
  //
  // Потребное отклонение считается, а не подбирается: киль должен создать
  // момент, равный своему же вращательному, и напор в обеих частях
  // сокращается —
  //
  //     δ = Clα(киль) · (ω·l / V) / controlPower(руль).
  //
  // Контуру остаётся чистое скольжение, и в установившемся вираже оно ноль.
  const finArm = Math.abs(passport.fin.station.ahead);
  const coordination =
    passport.fin.controlPower > 1e-6
      ? (passport.fin.liftSlope * air.yawRate * finArm) /
        (Math.max(air.airspeed, passport.stallSpeedFlaps) * passport.fin.controlPower)
      : 0;
  // ── НА ЗЕМЛЕ РУЛЬ — ЭТО РУЛЕВОЕ КОЛЕСО, И СВЯЗЬ ТУТ ГЕОМЕТРИЧЕСКАЯ ─────
  //
  // Пропорция «просимый темп × 2.2» не связана ни с чем: на разбеге она даёт
  // почти ноль, а на пробеге, где ход упал до трёх метров в секунду, тот же
  // темп требует уже полного отклонения — и машина, доехавшая до осевой,
  // разворачивалась поперёк полосы. Замер: двадцать девять метров от осевой
  // к остановке при касании в сорока сантиметрах.
  //
  // Связь между темпом разворота и углом колеса известна точно и называется
  // велосипедной моделью: `tan δ = ω·база / V`. Ни одного коэффициента.
  // На пробеге и выдержке машина НЕ следует за поворотом трассы: вершина
  // рулёжной ломаной читается упреждением за десятки метров, и тормозящая
  // машина «срезала» угол прямо на пробеге, уезжая с полосы боком (замер:
  // 14 м от осевой к остановке). До конца выдержки руль держит прямую;
  // разворот на месте добавляет полный руль в сторону разнотяга.
  // На рулении машина правит СВОИМ прицелом (угол на точку трассы впереди),
  // а не спросом общего автопилота: его путевой закон рассчитан на вираж
  // состоянием и на рулёжном ходу даёт сотые доли — машина, вышедшая из
  // разворота в трёх метрах от осевой, ехала параллельно ей весь остаток
  // ноги (замер стенда, 15.08.2026).
  //
  // Потолок спроса — КОНУС СЦЕПЛЕНИЯ хвостового колеса, а не полный ход
  // руля: колесо, повёрнутое дальше 0.6 рад от направления качения,
  // срывается в свободный кастор и теряет ВСЮ власть. Полный руль после
  // разворота — где корпус ещё градусов на десять расходится с курсом —
  // держал колесо за конусом непрерывно: тупик, в котором ошибка не
  // закрывается никогда, а руль вечно стоит в упоре (замер: снос рос с 0.4
  // до 8 м при руле −1.00 всю ногу). Запас 0.25 рад — на это самое
  // рассогласование корпуса с курсом.
  const groundYawDemand =
    rollout
      ? clamp(guidance.yawRate, -0.015, 0.015)
      : guidance.yawRate;
  const steerAngle = Math.atan(
    (groundYawDemand * passport.wheelbase) / Math.max(1, air.groundSpeed),
  );
  // Колесо — свой канал: на земле рулит ОНО, а киль без напора нем. На
  // пробеге створка киля зеркалит СПРОС (её конвенция «плюс — нос вправо»
  // своя); на рулении и развороте она в нейтрали.
  //
  // ПОТОЛОК КОЛЕСА — КОНУС СЦЕПЛЕНИЯ, А НЕ ПОЛНЫЙ ХОД. Колесо дальше
  // 0.6 рад от направления качения флюгирует и теряет ВСЮ власть; полный
  // ход при рассогласовании корпуса с курсом — тупик кастора: после
  // разворота остаточное вращение не гасилось ничем, и машина кружила
  // при насыщенном верном спросе (замер стенда, 15.08.2026 — читался как
  // «инверсия знака», ею не являясь: первая нога тем же знаком держалась).
  // Запас 0.25 рад — на само рассогласование.
  const steerGripCone = 0.6 - 0.25;
  const steerCommand =
    clamp(steerAngle, -steerGripCone, steerGripCone) / passport.steerRange;
  // Рулевое колесо лишь ориентирует свободный кастор по уже заказанному
  // вращению. Силовой момент pivot по-прежнему создаёт разнофаз двигателей.
  const steer = onGround ? steerCommand : 0;
  const rudder = onGround
    ? taxiing
      ? 0
      : steerCommand
    : clamp(coordination + gain * 1.8 * air.beta, -1, 1);

  // ── ТОРМОЗ ────────────────────────────────────────────────────────────
  // Колодки живут на стойках: в воздухе их зажатие бессмысленно, но и вредным
  // не бывает — колесо там ничего не держит. Зажимаем по НАМЕРЕНИЮ, а трение
  // возникнет ровно в тот кадр, когда появится опора.
  const brake = parked || checking
    ? 1
    : grounded
        ? // У профилированного taxi реверс — единственный закон торможения;
          // колодки лишь удерживают уже достигнутый ноль. Иначе неизвестное
          // второе замедление ломает рассчитанную точку остановки.
          groundPivoting
          ? 0
          : rollout
          ? rolloutBrake(passport, air)
          : profiledTaxi
            ? taxiDemand < 0.05 && air.groundSpeed < 0.08
              ? passport.brakeCeiling
              : 0
          : taxiDemand < 0.05 && air.groundSpeed < 0.08
            ? passport.brakeCeiling
            : clamp(
                (air.groundSpeed - taxiDemand - brakeThreshold) * 0.4,
                0,
                passport.brakeCeiling,
              )
        : stopping && speedError < 0
        ? Math.min(
            passport.brakeCeiling,
            clamp01(-speedError * 0.12 - 0.05),
          )
        : 0;

  // ── ПРОВЕРКА ОРГАНОВ ──────────────────────────────────────────────────
  // Перед вылетом руль принадлежит проверке, а не наведению. Газ и тормоз
  // остаются автомату: машина стоит на колодках и никуда не едет.
  if (checking) {
    const check = airplanePreflightCommand(
      input.journeySeconds ?? 0,
      airplaneFlapFor(
        guidance,
        air.airspeed,
        passport,
        input.flapAvailability ?? 1,
        true,
        0,
      ),
    );
    return {
      aileron: check.aileron,
      elevator: check.elevator,
      rudder: check.rudder,
      flap: check.flap,
      throttle: [0, 0],
      brake: 1,
    };
  }

  // ── НА РУЛЕНИИ ОРГАНЫ УПРАВЛЕНИЯ МОЛЧАТ (вердикт Igor, 15.08.2026) ─────
  //
  // В стадиях руления и разворота аэродинамическим створкам делать
  // нечего: напора нет, каждая их дрожь — лётный контур, шумящий вхолостую.
  // Закрылки убраны, рули в нейтрали. Машиной правят ДВИГАТЕЛИ и ТОРМОЗА:
  // прямую вдоль осевой держит малый разнотяг по ошибке курса — та же пара,
  // что крутит разворот, только без реверса и на порядок мягче.
  const groundStage = taxiing;
  const pivotThrottle = groundPivoting
    ? airplaneGroundYawThrottles({
        passport,
        angularAcceleration: input.taxiYawAcceleration ?? 0,
        yawRate: air.yawRate,
        forwardSpeed: air.forwardSpeed ?? 0,
        mass: taxiMass,
        yawInertia: input.yawInertia ?? 0,
        responseSeconds: input.yawResponseSeconds ?? 0,
        angularDamping: input.yawDamping,
      })
    : null;
  const throttleLeft = pivotThrottle?.[0] ?? throttle;
  const throttleRight = pivotThrottle?.[1] ?? throttle;
  return {
    aileron: groundStage ? 0 : aileron,
    elevator: groundStage ? 0 : elevator,
    rudder,
    flap: groundStage ? 0 : flap,
    throttle: [throttleLeft, throttleRight],
    brake,
    brakeSplit: taxiBrakeSplit,
    steer,
    casterFree: groundPivoting,
  };
}

/**
 * БАЛАНСИРОВКА: КАКОЙ РУЛЬ НУЖЕН, ЧТОБЫ МОМЕНТ БЫЛ НОЛЬ.
 *
 * Пропорциональный контур создаёт отклонение створки только ОШИБКОЙ, поэтому
 * машина без балансировки летит с постоянным недобором тангажа: замер дал
 * 10.7° ошибки в вираже и устойчивое снижение 4.4 м/с при исправной машине и
 * нулевой просьбе о снижении. Интегратор решил бы это памятью между кадрами;
 * здесь память не нужна — балансировка ВЫВОДИТСЯ из равенства моментов:
 *
 *     L_кр · плечо_кр + L_хв · плечо_хв = 0.
 *
 * Отсюда потребная подъёмная сила хвоста, из неё — потребный Cl, из него —
 * руль. Всё, что остаётся контуру, — разница между этим полётом и заданным.
 */
export function airplaneTrimElevator(
  passport: AirplanePassport,
  air: AirplaneAirState,
  weight: number,
  flap: number,
): number {
  const q = dynamicPressure(
    Math.max(air.airspeed, passport.stallSpeedFlaps * 0.5),
    passport.airDensity,
  );
  const tailArm = passport.tail.station.ahead;
  // Плечо крыла — центр давления ВСЕХ секций, взвешенный по площади: секции
  // разного размера, и среднее по списку сместило бы фокус к концевой полосе.
  const wingSpan = passport.wingSections.reduce(
    (sum, section) => sum + section.area,
    0,
  );
  const wingArm =
    wingSpan > 0
      ? passport.wingSections.reduce(
          (sum, section) => sum + section.station.ahead * section.area,
          0,
        ) / wingSpan
      : 0;
  if (Math.abs(tailArm) < 0.1 || passport.tail.controlPower < 1e-6) return 0;
  const wingLift = weight / Math.max(0.2, Math.cos(air.bank));
  const requiredTailLift = (-wingLift * wingArm) / tailArm;
  const requiredCl = requiredTailLift / Math.max(1, q * passport.tail.area);
  // Закрылки сдвигают фокус крыла назад и добавляют пикирующий момент —
  // тот самый, из-за которого заход требует руля даже на верной скорости.
  const flapMoment = passport.clFlap * flap * 0.18;
  // СКОС ПОТОКА ОБЯЗАН СТОЯТЬ И ЗДЕСЬ, А НЕ ТОЛЬКО В СИЛАХ.
  //
  // Балансировка спрашивает, сколько Cl хвост уже создаёт САМ, чтобы попросить
  // у руля только разницу. Хвост же видит поток, отклонённый крылом вниз, и
  // угол атаки у него меньше в `1 − dε/dα` раз. Без этого множителя собственный
  // вклад стабилизатора завышался в полтора раза, руль высоты получал лишние
  // 0.17 хода — и контур позы гасил их единственным доступным ему способом:
  // постоянной ОШИБКОЙ. Замер: просили горизонт, машина держала тангаж на 4°
  // выше заданного и устойчиво набирала 2.7 м/с, а на просьбу о снижении 4.9
  // м/с давала 2.3. Профиль трассы при таком смещении недостижим ни на одном
  // участке, и автопилот всю дорогу просил вертикаль в упор.
  const fromAlpha =
    passport.tail.liftSlope * air.alpha * (1 - (passport.tail.downwash ?? 0));
  return clamp(
    (fromAlpha - requiredCl + flapMoment) / passport.tail.controlPower,
    -0.85,
    0.85,
  );
}

/**
 * ТАНГАЖ НА ПОЛОСЕ: ТРИ ТОЧКИ, ХВОСТ, ОТРЫВ.
 *
 * Хвостовая машина стоит на трёх точках, поднимает хвост, когда руль высоты
 * начинает работать, и отрывается на Vr. Без средней ступени машина уходит в
 * воздух прямо из стояночного угла: на десяти градусах атаки крыло несёт её
 * раньше, чем она разогналась, — взлёт получается, но по недоразумению.
 */
function groundPitchTarget(passport: AirplanePassport, airspeed: number): number {
  if (airspeed >= passport.rotateSpeed) {
    return passport.maximumClimbAngle * 0.55;
  }
  const tailUp = passport.rotateSpeed * 0.55;
  if (airspeed <= tailUp) {
    return passport.groundPitch;
  }
  const blend = (airspeed - tailUp) / Math.max(1, passport.rotateSpeed - tailUp);
  return passport.groundPitch * (1 - blend * 0.75);
}

/**
 * Тяга установившегося горизонта на заданной скорости. Feedforward берётся от
 * ФАКТИЧЕСКОГО паспорта, а не от полки трассы (§4.2).
 */
function levelThrust(
  passport: AirplanePassport,
  speed: number,
  weight: number,
  flap: number,
): number {
  const q = dynamicPressure(
    Math.max(speed, passport.stallSpeedFlaps * 0.5),
    passport.airDensity,
  );
  // Крыло не умеет нести больше своего Clmax, и просить у него этого нельзя:
  // без потолка сопротивление на малой скорости уходит в десятки весов.
  const cl = Math.min(passport.clMax, weight / Math.max(1, q * passport.wingArea));
  const cd = passport.cd0 + passport.inducedFactor * cl * cl + flap * 0.06;
  return q * passport.wingArea * cd;
}

/**
 * Заданный тангаж в полёте: наклон траектории плюс балансировочный угол атаки.
 *
 * Просьба автопилота — вертикальная сила сверх веса; за время отклика она
 * превращается в вертикальную СКОРОСТЬ, а та — в угол наклона траектории.
 * Ограничение по углу атаки стоит здесь, а не в аэродинамике: машина не имеет
 * права просить у крыла того, чего у крыла нет.
 */
function flightPitchTarget(
  passport: AirplanePassport,
  guidance: VehicleGuidanceDemand,
  air: AirplaneAirState,
  weight: number,
  flap: number,
): number {
  // ПРОСЬБА О СИЛЕ — ЭТО ПРИРАЩЕНИЕ К ТЕКУЩЕЙ ВЕРТИКАЛЬНОЙ СКОРОСТИ.
  //
  // Читать её как саму скорость соблазнительно и неверно: наверху уже стоит
  // контур высоты автопилота со своими усилениями (0.06 на метр, 0.12 на
  // метр в секунду), и второе интегрирование внутри превращает пару в
  // релейный контур. Замер: машина проскакивала профиль на одиннадцать
  // метров вверх и через три секунды била в воду. Полторы секунды отклика —
  // это доля веса, превращённая в вертикальное ускорение, и ничего сверх.
  // ── ПРОСЬБА ЧИТАЕТСЯ АБСОЛЮТНО, А НЕ КАК ПРИБАВКА К СЕБЕ ───────────────
  //
  // «Текущая вертикальная скорость плюс просимое приращение» выглядит честным
  // прочтением силы, но делает внутренний контур ИНТЕГРАТОРОМ БЕЗ ОПОРЫ: чем
  // быстрее машина набирает, тем быстрее ей велено набирать. Останавливают
  // это только упоры — предел угла наклона и срывной угол атаки, — и машина
  // ходит между ними предельным циклом. Замер ступеньки: просили 3.2 м/с,
  // получили колебание 2 → 14 → 5 → 15 м/с с тангажом от 10° до 28°.
  //
  // Абсолютное прочтение убирает интегратор целиком: доля веса задаёт УГОЛ
  // наклона траектории, и ничего больше. Положение по высоте держит контур
  // автопилота — у него для этого есть и ошибка высоты, и её производная.
  const targetClimbRate = guidance.liftFraction * GRAVITY * CLIMB_RESPONSE_SECONDS;
  const speed = Math.max(air.airspeed, passport.stallSpeedFlaps);
  const pathAngle = clamp(
    Math.asin(clamp(targetClimbRate / speed, -1, 1)),
    -passport.maximumClimbAngle,
    passport.maximumClimbAngle,
  );
  const trim = airplaneTrimAlpha(passport, air.airspeed, flap, air.bank, weight);
  // ВТОРОГО КОНТУРА ПО ВЕРТИКАЛИ ЗДЕСЬ НЕТ, И БЫТЬ НЕ ДОЛЖНО.
  //
  // Заданный наклон траектории уже содержит просьбу целиком: он считается от
  // ТЕКУЩЕЙ вертикальной скорости плюс запрошенное приращение. Отдельная
  // поправка «цель минус текущая» при таком чтении вырождается в постоянное
  // смещение — на насыщенной просьбе это девять градусов тангажа, приклеенных
  // к цели, и машина качается между набором и снижением по тринадцать метров
  // в секунду. Высоту держит автопилот, наклон — этот контур, и ровно один раз.
  const ceiling = stallAlphaOf(passport) * 0.85;
  return clamp(pathAngle + trim, air.alpha - ceiling, air.alpha + ceiling);
}

/**
 * РАБОЧИЙ РЕЗЕРВ ВИРАЖА. Паспортный крен — ПРЕДЕЛ, а не рабочая точка:
 * дуга, пролетаемая на пределе, не оставляет ничего ни порыву, ни набору,
 * ни рулю высоты (они делят один Clmax). Рабочая точка держит резерв в 1.6
 * по кривизне — тот же коэффициент, которым трасса прокладывает свои
 * радиусы (`DC3_ROUTE_TURN_RADIUS = DC3_TURN_RADIUS · 1.6`): рабочий крен
 * ≈ 27° при пределе 40°. Публикуется машиной, а не трассой — по логике
 * гексакоптеров: маршрут задаёт ПОТОЛОК намерения, а скорость, достаточную
 * для входа в манёвр, автопилот считает сам из того, что машина ему честно
 * объявила.
 */
export const AIRPLANE_TURN_RESERVE = 1.6;

/**
 * Поворотливость СНИЗУ, из паспорта и текущего напора. Автопилот не голономный:
 * поперечного ускорения нет — вираж только курсом.
 */
export function airplaneTurnCapability(
  passport: AirplanePassport,
  airspeed: number,
  mass: number,
  /**
   * НА ЗЕМЛЕ МАШИНА ПОВОРАЧИВАЕТ КОЛЕСОМ, А НЕ КРЕНОМ. Лётный отклик — 3.45 с
   * перекладки крена — на рулении ложь: рулёжное колесо отвечает за доли
   * секунды, а темп разворота задан велосипедной моделью и разнотягом.
   * Наведение, считавшее рулящую машину лётной, сходилось к осевой за
   * десятки метров — на перемычках шириной 14 это минус пол-перемычки.
   */
  onGround = false,
): RotorcraftTurnCapability {
  if (onGround) {
    const taxiSpeed = Math.max(1.5, Math.min(airspeed, 8));
    const reverseBraking =
      mass > 1e-6
        ? (2 * passport.enginePower) / mass
        : 0;
    return {
      // Велосипедная модель на рулёжном ходу плюс разворот на месте разнотягом.
      yawRate: Math.max(
        0.45,
        (taxiSpeed * Math.tan(passport.steerRange)) / passport.wheelbase,
      ),
      lateralAcceleration: 1.6,
      braking: reverseBraking,
      // Рулёжное колесо перекладывается быстрее полусекунды; 0.7 занижало
      // частоту путевого контура, и офсет выхода из угла (3 м) выветривался
      // сорок метров — колесо шло вдоль кромки 08 за бетоном.
      responseSeconds: 0.45,
      dissipation: reverseBraking,
    };
  }
  const speed = Math.max(airspeed, passport.stallSpeedFlaps);
  const yawRate = (GRAVITY * Math.tan(passport.maximumBank)) / speed;
  const q = dynamicPressure(
    Math.max(airspeed, passport.stallSpeedFlaps * 0.5),
    passport.airDensity,
  );
  const drag = q * passport.wingArea * (passport.cd0 + 0.04);
  return {
    yawRate,
    // ПОПЕРЕЧНОЕ УСКОРЕНИЕ — ЭТО ПРО ВИРАЖ, А НЕ ПРО ХОД БОКОМ.
    //
    // Здесь стоял ноль: «самолёт не голономный, вбок он не ходит». Верно про
    // ПЕРЕМЕЩЕНИЕ и неверно про поле: ограничитель скорости берёт отсюда
    // располагаемое центростремительное ускорение, `sqrt(a·R)`. С нулём
    // разрешённая скорость на любой дуге становилась нулём, и машина ползла
    // по полосе на семи метрах в секунду, не в силах взлететь. У координи-
    // рованного виража это ускорение равно `g·tg φ` — та же формула, что у
    // коптера с его наклоном диска, и ничто иное.
    // Наружу идёт РАБОЧЕЕ ускорение, с резервом: губернатор скорости строит
    // из него `sqrt(a·R)`, и опубликованный предел означал бы дуги, летаемые
    // полным креном без запаса — на порыве это срыв, а на наборе машина
    // делит тот же Clmax с рулём высоты. Замер до резерва: в дугу радиусом
    // 376 м автопилот входил на 55 м/с — крен 39.3° при пределе 40.
    lateralAcceleration:
      (GRAVITY * Math.tan(passport.maximumBank)) / AIRPLANE_TURN_RESERVE,
    braking: mass > 1e-6 ? drag / mass : 0,
    // Рассеивание В ВОЗДУХЕ — только сопротивление на прибранном газу:
    // реверс и колодки живут на земле, и считать их здесь значило бы обещать
    // губернатору энергию, которую в полёте снять нечем.
    dissipation: mass > 1e-6 ? drag / mass : 0,
    // ВРЕМЯ ОТКЛИКА — ЭТО ВЫХОД КОНТУРА КРЕНА, И ОНО ЗАМЕРЕНО.
    //
    // Разворот у крыла начинается с крена: пока машина не легла на угол,
    // виража нет. Контур крена — апериодическое звено с постоянной
    // `ROLL_SECONDS`, значит выход на заданное занимает примерно 2.3 таких
    // постоянных. Ступенька на стенде подтверждает: 3.5 с до сорока градусов.
    // Число публикуется наружу — им живут и ограничитель скорости, и горизонт
    // наведения, и оно обязано быть ПРАВДОЙ, иначе автопилот считает машину
    // расторопнее, чем она есть, и получает перекладки с упора на упор.
    // ЗАПАЗДЫВАНИЕ РАЗВОРОТА — ЭТО КАСКАД КРЕНА, А НЕ ПОДОБРАННЫЙ МНОЖИТЕЛЬ.
    //
    // Вираж у крыла начинается с перекладки крена, и темп рыскания приходит с
    // задержкой всего этого каскада. Внешний контур позы имеет постоянную
    // `ROLL_SECONDS`, внутренний контур темпа — свою, того же порядка; сумма
    // даёт полторы `ROLL_SECONDS`. Замер ступеньки 0.15 рад/с подтверждает:
    // 63% темпа за 2.28 с при выведенных 2.25.
    //
    // Число это не украшение: автопилот строит по нему и горизонт прогноза, и
    // дальность прицела (см. `PURSUIT_LAG_MARGIN` в vehicleFrames).
    responseSeconds: ROLL_SECONDS * 1.5,
  };
}


// ---------------------------------------------------------------------------
// ОРГАНЫ, КОТОРЫЕ ВИДНО
// ---------------------------------------------------------------------------

/** Канал, которым командует автомат. Створка знает только своё имя. */
export type AirplaneControlChannel = "aileron" | "elevator" | "rudder" | "flap";

/** Одна створка на своей петле: что ею двигают и насколько она ходит. */
export interface AirplaneControlSurface {
  /** Маска куска в сцене. */
  readonly memberMatch: string;
  readonly channel: AirplaneControlChannel;
  /** Точка петли, оси кадра. */
  readonly pivot: SceneVector3;
  /** Ось петли, оси кадра. */
  readonly axis: SceneVector3;
  /** Полный ход петли, градусы, из чертежа. */
  readonly minDegrees: number;
  readonly maxDegrees: number;
  /** Знак борта: элероны ходят противофазно, закрылки синфазно. */
  readonly sign: 1 | -1;
}

/** Винт на своём валу: он обязан крутиться от ДОСТАВЛЕННОГО газа. */
export interface AirplanePropeller {
  readonly memberMatch: string;
  /** Центр втулки, оси кадра. */
  readonly hub: SceneVector3;
  /** Ось вала, оси кадра. */
  readonly axis: SceneVector3;
  /** Знак фазы вокруг направленной оси вала. */
  readonly phaseSign: 1 | -1;
  /** Какой вал его крутит. */
  readonly engine: number;
}

/**
 * ВИЗУАЛЬНЫЕ ОБОРОТЫ ВИНТА ИЗ КОМАНДЫ ВАЛА.
 *
 * Тяга у винта падает гораздо быстрее, чем заметные глазу обороты: четыре
 * процента мощности не означают четыре процента визуальной скорости. Гамма
 * оставляет ноль настоящим нулём, не создаёт скачка при запуске и сохраняет
 * прежний темп на полном газу. Авторотация остаётся отдельным нижним пределом.
 */
export function airplanePropellerVisualCommand(
  deliveredThrottle: number,
  windmillCommand: number,
): number {
  if (deliveredThrottle < 0) {
    return -Math.pow(clamp01(-deliveredThrottle), 0.35);
  }
  return Math.max(
    Math.pow(clamp01(deliveredThrottle), 0.35),
    clamp01(windmillCommand),
  );
}

/**
 * УГОЛ СТВОРКИ ИЗ КОМАНДЫ АВТОМАТА.
 *
 * Никаких «примерно так выглядит»: створка отклоняется ровно на ту долю
 * своего чертёжного хода, которую попросил автомат, и в ту сторону, в какую
 * он попросил. Закрылок ходит только вниз и синфазно; элероны — противофазно;
 * руль высоты и направления — в обе стороны на свои разные ходы.
 */
export function controlSurfaceDegrees(
  surface: AirplaneControlSurface,
  command: Pick<AirplaneSurfaceCommand, AirplaneControlChannel>,
): number {
  const value = command[surface.channel];
  if (surface.channel === "flap") {
    // Щиток: ноль — убран, единица — на полный чертёжный выпуск. Ноль тут
    // обязан быть НОЛЁМ, а не минус нулём: угол уходит в поворот куска.
    return clamp01(value) * surface.minDegrees + 0;
  }
  const signed =
    surface.channel === "aileron" ? value * surface.sign : value;
  const travel = signed >= 0 ? surface.maxDegrees : -surface.minDegrees;
  return clamp(signed * Math.abs(travel), surface.minDegrees, surface.maxDegrees) + 0;
}

/**
 * ПРЕДПОЛЁТНАЯ ПРОВЕРКА ОРГАНОВ — ТАКАЯ ЖЕ НАСТОЯЩАЯ, КАК ВСЁ ОСТАЛЬНОЕ.
 *
 * Перед выруливанием экипаж прогоняет каждый канал по полному ходу и смотрит,
 * что створка пошла. Здесь это не украшение: команды идут ТЕМ ЖЕ путём, что и
 * в полёте, и власть по каждому каналу читается той же парой «запрошено →
 * доставлено». Значит проверка честно покажет выбитый канал ещё на стоянке —
 * ровно за этим её и делают.
 *
 * Порядок — тот, что и в кабине: тангаж, крен, педаль, механизация, и в конце
 * всё во взлётное положение.
 */
export const AIRPLANE_PREFLIGHT_SECONDS = 5;

export function airplanePreflightCommand(
  seconds: number,
  takeoffFlap: number,
): Pick<AirplaneSurfaceCommand, AirplaneControlChannel> {
  const sweep = (phase: number) => Math.sin(phase * Math.PI * 2);
  const neutral = { aileron: 0, elevator: 0, rudder: 0, flap: 0 };
  if (seconds < 1) {
    return { ...neutral, elevator: sweep(seconds) };
  }
  if (seconds < 2) {
    return { ...neutral, aileron: sweep(seconds - 1) };
  }
  if (seconds < 3) {
    return { ...neutral, rudder: sweep(seconds - 2) };
  }
  if (seconds < 4) {
    // Механизация ходит только вниз, поэтому её проверяют полным выпуском и
    // уборкой, а не знакопеременным качанием.
    return { ...neutral, flap: 1 - Math.abs(seconds - 3.5) * 2 };
  }
  // Последняя секунда — взлётное положение: створки в нейтраль, щиток на
  // взлётный угол. Дальше руль отдаётся автомату.
  return { ...neutral, flap: takeoffFlap };
}

// ---------------------------------------------------------------------------
// СИЛЫ
// ---------------------------------------------------------------------------

/** Одна несущая поверхность в своём потоке. */
interface SurfaceResult {
  readonly lift: number;
  readonly drag: number;
  readonly force: SceneVector3;
  readonly point: SceneVector3;
  readonly stalled: boolean;
}

/**
 * Подъём и сопротивление одной поверхности в ЕЁ потоке.
 *
 * `flowUp` — компонента набегающего потока, задающая угол атаки поверхности;
 * `flowAlong` — вдоль оси симметрии поверхности. Для крыла и стабилизатора
 * «вверх» — это верх машины, для киля — правый борт: одна функция обслуживает
 * обе плоскости, потому что закон у них один.
 */
function surfaceForce(input: {
  readonly area: number;
  readonly liftSlope: number;
  readonly cl0: number;
  readonly clMax: number;
  readonly cd0: number;
  readonly inducedFactor: number;
  readonly control: number;
  readonly along: SceneVector3;
  readonly upward: SceneVector3;
  readonly localVelocity: SceneVector3;
  readonly availability: number;
  readonly density: number;
  /** Доля поперечного потока, доходящая до поверхности: 1 — весь. */
  readonly flowShare?: number;
  /** Скорость, выше которой напор не считается: заслонка интегратора, м/с. */
  readonly speedCeiling: number;
}): SurfaceResult {
  const forward = dot(input.localVelocity, input.along);
  const upward = dot(input.localVelocity, input.upward) * (input.flowShare ?? 1);
  // ПОТОЛОК НАПОРА. Не физика, а заслонка явного интегратора: машина, уже
  // потерявшая управление, разгоняется до немыслимого, силы растут как
  // квадрат, и следующий шаг выдаёт бесконечность вместо разбора аварии.
  // Настоящий планёр к этой скорости давно рассыпался бы.
  const speedSquared = Math.min(
    input.speedCeiling * input.speedCeiling,
    forward * forward + upward * upward,
  );
  const speed = Math.sqrt(speedSquared);
  if (speed < 0.2 || input.availability <= 0) {
    return { lift: 0, drag: 0, force: [0, 0, 0], point: [0, 0, 0], stalled: false };
  }
  const alpha = Math.atan2(-upward, forward);
  const q = 0.5 * input.density * speedSquared;
  const linear = input.cl0 + input.liftSlope * alpha + input.control;
  const stalled = Math.abs(linear) > input.clMax;
  // За срывом крыло не исчезает: оно теряет большую часть подъёма и набирает
  // сопротивление. Иначе машина в сваливании летит без сил вообще.
  const cl = stalled
    ? Math.sign(linear) * (input.clMax * 0.45 + (Math.abs(linear) - input.clMax) * 0.05)
    : linear;
  const cd =
    input.cd0 + input.inducedFactor * cl * cl + (stalled ? 0.6 * Math.abs(Math.sin(alpha)) : 0);
  const lift = q * input.area * cl * input.availability;
  const drag = q * input.area * cd * input.availability;
  // Подъём перпендикулярен потоку, сопротивление — вдоль него. Обе силы
  // раскладываются по осям поверхности через тот же угол атаки.
  const cosAlpha = forward / speed;
  const sinAlpha = -upward / speed;
  const alongForce = -drag * cosAlpha + lift * sinAlpha;
  const upForce = drag * sinAlpha + lift * cosAlpha;
  return {
    lift,
    drag,
    stalled,
    point: [0, 0, 0],
    force: [
      input.along[0] * alongForce + input.upward[0] * upForce,
      input.along[1] * alongForce + input.upward[1] * upForce,
      input.along[2] * alongForce + input.upward[2] * upForce,
    ],
  };
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
    brake: requested.brake,
    // Раздельное торможение бортов — часть команды: пересборка без него
    // молча хоронила якорь разворота (замер: три правки подряд не меняли
    // ни байта поведения — признак мёртвого канала, а не тонкой физики).
    brakeSplit: requested.brakeSplit,
    casterFree: requested.casterFree,
    // Рулёжное колесо — та же грабля, тот же урок: канал копируется.
    steer: requested.steer,
    throttle: [
      requested.throttle[0] * (availability.engines[0] ?? 0),
      requested.throttle[1] * (availability.engines[1] ?? 0),
    ],
  };
}

/** Левая и правая консоли из авторского списка панелей: половина на борт. */
function panelShares(wingPanels: readonly number[]): readonly [number, number] {
  if (wingPanels.length === 0) return [1, 1];
  const half = Math.max(1, Math.floor(wingPanels.length / 2));
  const mean = (values: readonly number[]) =>
    values.length === 0
      ? 1
      : values.reduce((sum, value) => sum + Math.max(0, value), 0) / values.length;
  return [mean(wingPanels.slice(0, half)), mean(wingPanels.slice(half))];
}

export interface AirplaneForceInput {
  readonly passport: AirplanePassport;
  readonly command: AirplaneSurfaceCommand;
  readonly availability: AirplaneAvailability;
  readonly orientation: Quaternion;
  readonly velocity: SceneVector3;
  readonly angularVelocity: SceneVector3;
  /** Центр масс в мире: все плечи отсчитываются от него. */
  readonly centre: SceneVector3;
  readonly nose: SceneVector3;
}

export interface AirplaneForceResult {
  readonly forces: readonly AirplaneForcePoint[];
  readonly lift: number;
  readonly drag: number;
  readonly thrust: number;
  readonly stalled: boolean;
}

/**
 * СИЛЫ МАШИНЫ: ЧЕТЫРЕ ПОВЕРХНОСТИ И ДВА ВАЛА, КАЖДЫЙ В СВОЕЙ ТОЧКЕ.
 *
 * Ни одного назначенного момента. Устойчивость, демпфирование и разнотяг — всё
 * это плечи, и потому они верны при любой массе, развесовке и повреждении.
 */
export function airplaneForces(input: AirplaneForceInput): AirplaneForceResult {
  const { passport, command, availability, orientation, centre } = input;
  const axes = airplaneAxes(input.nose);
  const localVelocity = rotateByInverse(orientation, input.velocity);
  const localOmega = rotateByInverse(orientation, input.angularVelocity);
  const ceiling = passport.maximumSpeed * 2.5;
  const [leftShare, rightShare] = panelShares(availability.wingPanels);
  const flapLift = passport.clFlap * command.flap;
  const forces: AirplaneForcePoint[] = [];
  let lift = 0;
  let drag = 0;
  let stalled = false;

  const addSurface = (
    station: AirplaneStation,
    result: (local: SceneVector3) => SurfaceResult,
  ): SurfaceResult => {
    const arm = stationVector(axes, station);
    const local = addVectors(localVelocity, cross(localOmega, arm));
    const surface = result(local);
    const worldForce = rotateByQuaternion(orientation, surface.force);
    const worldArm = rotateByQuaternion(orientation, arm);
    forces.push({
      force: worldForce,
      point: [centre[0] + worldArm[0], centre[1] + worldArm[1], centre[2] + worldArm[2]],
    });
    return surface;
  };

  passport.wingSections.forEach((section) => {
    // БОРТ ОПРЕДЕЛЯЕТ ГЕОМЕТРИЯ, А НЕ ПОРЯДОК В СПИСКЕ. Плечо секции знает,
    // с какой она стороны; индекс — не знает и врёт при первой же правке
    // авторского порядка.
    const right = section.station.right >= 0;
    const share = right ? rightShare : leftShare;
    // Элерон работает НЕСИММЕТРИЧНО: одна консоль вниз, другая вверх. Плюс
    // команды — правая консоль вниз, то есть МЕНЬШЕ подъёма справа.
    const aileron =
      (right ? -1 : 1) * command.aileron * passport.aileronPower * section.aileron;
    const surface = addSurface(section.station, (local) =>
      surfaceForce({
        area: section.area,
        liftSlope: passport.clAlpha,
        cl0: passport.cl0,
        // ЩИТОК ПОДНИМАЕТ И САМ ПОТОЛОК, А НЕ ТОЛЬКО ТЕКУЩИЙ Cl.
        //
        // Держать Clmax постоянным значило бы, что механизация не меняет
        // скорость сваливания вовсе: прибавка съедала бы запас до потолка
        // ровно на столько, на сколько его давала. Паспорт же объявляет
        // ДВЕ скорости сваливания, и вторая из них при постоянном потолке
        // недостижима — щиток отодвигает срыв, а не приближает его.
        clMax: passport.clMax + flapLift * section.flap,
        cd0: passport.cd0 + command.flap * 0.06 * section.flap,
        inducedFactor: passport.inducedFactor,
        control: flapLift * section.flap + aileron,
        along: axes.forward,
        upward: axes.up,
        localVelocity: local,
        availability: share,
        density: passport.airDensity,
        speedCeiling: ceiling,
      }),
    );
    lift += surface.lift;
    drag += surface.drag;
    stalled = stalled || surface.stalled;
  });

  const tail = addSurface(passport.tail.station, (local) =>
    surfaceForce({
      area: passport.tail.area,
      liftSlope: passport.tail.liftSlope,
      cl0: 0,
      clMax: 1.2,
      cd0: 0.012,
      inducedFactor: 0.08,
      // ЗНАК: «руль высоты вверх» — это МЕНЬШЕ подъёма на хвосте, а не больше.
      // Стабилизатор стоит ЗА центром масс, поэтому нос поднимает хвост,
      // прижатый вниз. Прямой знак роняет машину носом при полной просьбе о
      // наборе — и роняет молча, потому что контур позы при этом исправен.
      control: -command.elevator * passport.tail.controlPower * availability.elevator,
      along: axes.forward,
      upward: axes.up,
      localVelocity: local,
      availability: 1,
      density: passport.airDensity,
      speedCeiling: ceiling,
      flowShare: 1 - (passport.tail.downwash ?? 0),
    }),
  );
  lift += tail.lift;
  drag += tail.drag;

  const fin = addSurface(passport.fin.station, (local) =>
    surfaceForce({
      area: passport.fin.area,
      liftSlope: passport.fin.liftSlope,
      cl0: 0,
      clMax: 1.2,
      cd0: 0.012,
      inducedFactor: 0.08,
      // Плюс руля — нос вправо. Киль стоит за центром масс, поэтому силу он
      // создаёт влево: «вверх» для киля — это правый борт со знаком минус.
      control: command.rudder * passport.fin.controlPower * availability.rudder,
      along: axes.forward,
      upward: negate(axes.right),
      localVelocity: local,
      availability: 1,
      density: passport.airDensity,
      speedCeiling: ceiling,
    }),
  );
  drag += fin.drag;

  let thrust = 0;
  passport.engineStations.forEach((station, index) => {
    const share = command.throttle[index] ?? 0;
    const magnitude = share * passport.enginePower;
    thrust += magnitude;
    const arm = stationVector(axes, station);
    const worldArm = rotateByQuaternion(orientation, arm);
    const direction = rotateByQuaternion(orientation, axes.forward);
    forces.push({
      force: [direction[0] * magnitude, direction[1] * magnitude, direction[2] * magnitude],
      point: [centre[0] + worldArm[0], centre[1] + worldArm[1], centre[2] + worldArm[2]],
    });
  });

  return { forces, lift, drag, thrust, stalled };
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
  readonly orientation: Quaternion;
  readonly velocity: SceneVector3;
  readonly angularVelocity?: SceneVector3;
  readonly centre: SceneVector3;
  readonly nose: SceneVector3;
  readonly onGround?: boolean;
  /**
   * СТАДИЯ РЕЙСА ИЗ ОБЩЕГО ЖУРНАЛА (`LampEventState`), а не собственный
   * признак автомата. Тот же словарь, по которому убираются опоры и светят
   * сигнальные стёкла: `docked` — рейса нет, `attention` — прогрев и проверка
   * у берта, `departure` — взлёт, дальше маршрут и заход. Заводить рядом свой
   * счётчик «отправлена ли машина» значит завести вторую правду о том же.
   */
  readonly journey?: AirplaneJourneyStage;
  /** Сколько длится текущая стадия, с: проверке органов нужен только он. */
  readonly journeySeconds?: number;
  /** Высота над опорой, м: разбег отличается от полёта именно ею. */
  readonly heightAboveGround?: number;
  /** Фаза наземного завершения рейса, если вызывающий её ведёт. */
  readonly taxi?: AirplaneTaxiPhase | null;
  /** Явное позиционное разрешение разворота в вершине рулёжного пути. */
  readonly taxiPivot?: boolean;
  /** Продольное ускорение профиля DC-3 taxi. */
  readonly taxiAcceleration?: number;
  /** Direct rest-to-rest yaw acceleration from the ground navigator. */
  readonly taxiYawAcceleration?: number;
  /** Момент инерции вокруг вертикали для наземного разворота. */
  readonly yawInertia?: number;
  /** Отклик двигателей, с, для наземного разворота. */
  readonly yawResponseSeconds?: number;
  /** Физическое угловое демпфирование корпуса, 1/с. */
  readonly yawDamping?: number;
}): AirplaneFlightStep {
  const { passport, guidance, availability, orientation, velocity, centre, nose } = input;
  const angularVelocity = input.angularVelocity ?? [0, 0, 0];
  const air = airplaneAirState({ velocity, angularVelocity, orientation, nose });
  const weight = input.mass * GRAVITY;
  const requested = airplaneAllocate({
    passport,
    guidance,
    air,
    weight,
    onGround: input.onGround ?? false,
    flapAvailability: availability.flap,
    journey: input.journey,
    journeySeconds: input.journeySeconds,
    heightAboveGround: input.heightAboveGround,
    taxi: input.taxi,
    taxiPivot: input.taxiPivot,
    taxiAcceleration: input.taxiAcceleration,
    taxiYawAcceleration: input.taxiYawAcceleration,
    yawInertia: input.yawInertia,
    yawResponseSeconds: input.yawResponseSeconds,
    yawDamping: input.yawDamping,
  });
  const delivered = deliverCommand(requested, availability);
  const aero = airplaneForces({
    passport,
    command: delivered,
    availability,
    orientation,
    velocity,
    angularVelocity,
    centre,
    nose,
  });
  const flap = delivered.flap;
  return {
    requested,
    delivered,
    air,
    airspeed: air.airspeed,
    alpha: air.alpha,
    flap,
    forces: aero.forces,
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
    targetPitch: airplaneTargetPitch(
      passport,
      guidance,
      air,
      weight,
      flap,
      input.onGround ?? false,
      (input.journey ?? "cruise") === "departure",
    ),
    // Отчёт обязан показывать ТО ЖЕ, что исполняется: потолок крена входит в
    // заданное значение, а не остаётся внутренней поправкой.
    targetBank: (input.onGround ?? false)
      ? 0
      : (() => {
          const ceiling = airplaneBankCeiling(
            passport,
            air.airspeed,
            weight,
            guidance.liftFraction,
            flap,
          );
          return Math.max(
            -ceiling,
            Math.min(ceiling, airplaneBankFor(passport, guidance.yawRate, air.airspeed)),
          );
        })(),
    stalled: aero.stalled,
  };
}

/**
 * ОДИН ЗАКОН НА ИСПОЛНЕНИЕ И НА ПОКАЗ.
 *
 * Здесь стоял свой `onGround ? groundPitchTarget(...)`, а руль вёлся другой
 * веткой — и после того как разбежное расписание ограничили стадией взлёта,
 * телеметрия продолжала показывать старую цель. Расходящаяся пара «что
 * исполняется» и «что показано» страшнее любой из них по отдельности: именно
 * она увела мою пробу по ложному следу.
 */
function airplaneTargetPitch(
  passport: AirplanePassport,
  guidance: VehicleGuidanceDemand,
  air: AirplaneAirState,
  weight: number,
  flap: number,
  onGround: boolean,
  takingOff: boolean,
): number {
  if (onGround) {
    return takingOff
      ? groundPitchTarget(passport, air.airspeed)
      : passport.groundPitch;
  }
  return flightPitchTarget(passport, guidance, air, weight, flap);
}

export const INTACT_AIRPLANE_AVAILABILITY: AirplaneAvailability = {
  engines: [1, 1],
  aileron: 1,
  elevator: 1,
  rudder: 1,
  flap: 1,
  wingPanels: [1, 1, 1, 1],
};

// ---------------------------------------------------------------------------
// Мелочь
// ---------------------------------------------------------------------------

/**
 * ТОРМОЗ НА ПРОБЕГЕ: НЕ РАНЬШЕ, ЧЕМ СЯДЕТ ХВОСТ.
 *
 * Здесь стоял `passport.brakeCeiling` — полный потолок в тот же кадр, когда
 * коснулись основные колёса. У машины с хвостовым колесом это и есть способ
 * встать на нос: пока хвост в воздухе, вся тормозная сила даёт момент вокруг
 * оси главных колёс, и удерживать её нечем — вес приложен ВЫШЕ и ПОЗАДИ.
 * Лётчик в этот момент не тормозит вообще: он держит хвост, ждёт, пока тот
 * сядет сам, и только потом дожимает.
 *
 * Раньше это сходило с рук: тяжёлая машина медленнее набирала угловую
 * скорость, и потолок успевал отработать до опрокидывания. После того как из
 * набора убрали лишние тонны, запас исчез.
 *
 * Две доли, обе непрерывные — ступенька в тормозе читается рывком:
 *
 *  - `tailShare` — сел ли хвост. Считается по тангажу против трёхточечной
 *    стоянки: на пробеге с поднятым хвостом тангаж заметно меньше;
 *  - `settleShare` — насколько ушла скорость. Сразу после касания крыло ещё
 *    несёт, колёса нагружены слабо, и полный тормоз там не только опасен, но
 *    и бесполезен.
 */
function rolloutBrake(
  passport: Pick<AirplanePassport, "brakeCeiling" | "groundPitch" | "stallSpeed">,
  air: Pick<AirplaneAirState, "pitch" | "groundSpeed">,
): number {
  const threePoint = Math.max(1e-3, passport.groundPitch);
  const tailShare = clamp01(
    (air.pitch - threePoint * 0.55) / (threePoint * 0.35),
  );
  const settleShare = clamp01(
    1 - air.groundSpeed / Math.max(1, passport.stallSpeed),
  );
  return passport.brakeCeiling * tailShare * (0.25 + 0.75 * settleShare);
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clamp(value: number, low: number, high: number): number {
  return value <= low ? low : value >= high ? high : value;
}

function share(delivered: number, requested: number): number {
  if (Math.abs(requested) < 1e-6) return 1;
  return clamp01(Math.abs(delivered) / Math.abs(requested));
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function addVectors(a: Vector3, b: Vector3): SceneVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function negate(a: Vector3): SceneVector3 {
  return [-a[0], -a[1], -a[2]];
}

function normalize(value: Vector3): SceneVector3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function rotateByQuaternion(quaternion: Quaternion, vector: Vector3): SceneVector3 {
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

function rotateByInverse(quaternion: Quaternion, vector: Vector3): SceneVector3 {
  return rotateByQuaternion(
    [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]],
    vector,
  );
}
