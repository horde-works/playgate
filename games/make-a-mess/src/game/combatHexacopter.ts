import {
  COMBAT_HEX_HEIGHT,
  COMBAT_HEX_LANDING_STATIONS,
  COMBAT_HEX_LENGTH,
  COMBAT_HEX_LIFT_STATIONS,
  COMBAT_HEX_OLEO_STATIC_SAG_SHARE,
  COMBAT_HEX_OLEO_STROKE,
  COMBAT_HEX_WIDTH,
  COMBAT_HEX_YAW_STATIONS,
} from "../content/objects/vehicles/combatHexacopterObject.ts";
import type { SceneVector3 } from "./destructionScene.ts";
import { strutRetractionAngle } from "./supportStrut.ts";
import {
  ROTORCRAFT_AUXILIARY_YAW_PRIMARY_SHARE,
  ROTORCRAFT_YAW_RATE_GAIN,
  yawThrusterAllocation,
} from "./rotorcraftDynamics.ts";
import type {
  VehicleFrameDefinition,
  VehicleSupportStrutDefinition,
} from "./vehicleFrames.ts";
import {
  explosiveProfile,
  MG_FIRE_INTERVAL,
  MG_RANGE,
} from "./destructionRuntime.ts";
import type { VehicleArmament, WeaponMount } from "./vehicleGunnery.ts";

export const COMBAT_HEXACOPTER_BLUEPRINT_ID = "combat-hexacopter";
export const RAX8_TONKAWA_NAME = "RAX-8 Tonkawa";
export const RAX8_TONKAWA_TELEMETRY_LABEL = "RAX-8 TONKAWA";

export interface CombatHexacopterPlacement {
  readonly sceneId: string;
  readonly clusterId: string;
  readonly position: SceneVector3;
  readonly yaw: number;
}

export interface CombatHexacopterYawThruster {
  readonly id: "left" | "right";
  readonly point: SceneVector3;
  /** Reversible thrust axis in the authored body frame. */
  readonly axis: SceneVector3;
  readonly maximumForce: number;
}

export interface CombatHexacopterBlueprint {
  readonly id: typeof COMBAT_HEXACOPTER_BLUEPRINT_ID;
  readonly telemetryLabel: typeof RAX8_TONKAWA_TELEMETRY_LABEL;
  readonly placement: CombatHexacopterPlacement;
  readonly origin: SceneVector3;
  readonly nose: SceneVector3;
  readonly liftCentre: SceneVector3;
  readonly mooringPoint: SceneVector3;
  readonly enginePoints: readonly SceneVector3[];
  readonly rotorCapacityWeights: readonly number[];
  readonly rotorSpinDirections: readonly (-1 | 1)[];
  readonly yawThrusters: readonly CombatHexacopterYawThruster[];
  readonly proximitySensors: readonly {
    readonly point: SceneVector3;
    readonly normal: SceneVector3;
  }[];
  /** Четыре опоры машины: паспорт без нагрузки, массу подставит рантайм. */
  readonly landingStruts: readonly VehicleSupportStrutDefinition[];
  /** Стволы и трубы в авторской позе покоя, как enginePoints. */
  readonly armament: VehicleArmament;
  readonly envelope: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  };
  readonly flight: {
    readonly liftSource: "rotor";
    readonly liftReserve: number;
    readonly maximumTilt: number;
    readonly liftTrimRange: number;
    readonly spoolSeconds: number;
    readonly linearDamping: number;
    readonly angularDamping: number;
    readonly lateralDragRatio: number;
  };
}

export const COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT: CombatHexacopterPlacement = {
  sceneId: "combat-hexacopter-prototype",
  clusterId: "combat-hexacopter-prototype:vehicle",
  // This is an isolated authoring datum, not a world-map berth.
  position: [0, 0, 0],
  yaw: 0,
};

export const COMBAT_HEXACOPTER_RANGE_SCENE_ID = "combat-hexacopter-range";
export const COMBAT_HEXACOPTER_RANGE_BERTH: SceneVector3 = [0, 0.08, 0];
export const COMBAT_HEXACOPTER_RANGE_DISPATCH_POINT: SceneVector3 = [5.2, 1.08, 2.2];
export const COMBAT_HEXACOPTER_RANGE_PLACEMENT: CombatHexacopterPlacement = {
  sceneId: COMBAT_HEXACOPTER_RANGE_SCENE_ID,
  clusterId: `${COMBAT_HEXACOPTER_RANGE_SCENE_ID}:vehicle`,
  position: COMBAT_HEXACOPTER_RANGE_BERTH,
  yaw: 0,
};

const liftTipRadius = (station: typeof COMBAT_HEX_LIFT_STATIONS[number]) =>
  station.outerRadius - 0.105;
const standardDiscArea = liftTipRadius(COMBAT_HEX_LIFT_STATIONS[0]) ** 2;

export const COMBAT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS =
  COMBAT_HEX_LIFT_STATIONS.map((station) =>
    liftTipRadius(station) ** 2 / standardDiscArea,
  );

export const COMBAT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS =
  COMBAT_HEX_LIFT_STATIONS.map((station) =>
    station.spin === "cw" ? 1 as const : -1 as const,
  );

/**
 * The accepted yaw tunnels are real reversible fans, not an aerodynamic
 * rudder. Their authority therefore exists at zero airspeed. The selected
 * force keeps the channel clearly stronger than reaction torque while still
 * leaving the lift controller responsible for cancelling the small coupled
 * side force caused by the mirrored 18-degree installation.
 */
export const COMBAT_HEXACOPTER_YAW_FAN_FORCE = 125;

const rotated = (value: SceneVector3, yaw: number): SceneVector3 => {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [
    value[0] * cosine + value[2] * sine,
    value[1],
    -value[0] * sine + value[2] * cosine,
  ];
};

export function combatHexacopterVector(
  placement: CombatHexacopterPlacement,
  local: SceneVector3,
): SceneVector3 {
  return rotated(local, placement.yaw);
}

export function combatHexacopterPoint(
  placement: CombatHexacopterPlacement,
  local: SceneVector3,
): SceneVector3 {
  const offset = combatHexacopterVector(placement, local);
  return [
    placement.position[0] + offset[0],
    placement.position[1] + offset[1],
    placement.position[2] + offset[2],
  ];
}

/**
 * ВООРУЖЕНИЕ БЕРЁТСЯ ИЗ АВТОРСКОЙ ГЕОМЕТРИИ, А НЕ ПРИДУМЫВАЕТСЯ РЯДОМ.
 *
 * Стволы и трубы на модели уже стоят (`combatHexacopterObject.ts:1401-1453`):
 * подбородочная спарка из трёх стволов с дульным срезом на z = 3.60 и два
 * пода по шесть труб с устьями на z = 1.62. Все они НЕПОДВИЖНЫ и смотрят по
 * оси корпуса — поэтому «стреляет строго вперёд» это не упрощение механики, а
 * честность к принятой машине.
 *
 * Числа здесь дублировать нельзя: расхождение паспорта с моделью означало бы,
 * что трасса выходит не из ствола. Проверяется тестом по кускам сцены.
 */
const CANNON_MUZZLE_Z = 3.6;
const CANNON_BARRELS: readonly SceneVector3[] = [
  [0, 0.315, CANNON_MUZZLE_Z],
  [-0.043, 0.357, CANNON_MUZZLE_Z],
  [0.043, 0.357, CANNON_MUZZLE_Z],
];

const POD_MOUTH_Z = 1.62;
const POD_CENTRE_X = 1.18;
const POD_TUBE_OFFSETS: readonly (readonly [number, number])[] = [
  [-0.11, -0.09],
  [-0.11, 0.09],
  [0, -0.09],
  [0, 0.09],
  [0.11, -0.09],
  [0.11, 0.09],
];

function armament(placement: CombatHexacopterPlacement): VehicleArmament {
  const cannonMounts: WeaponMount[] = CANNON_BARRELS.map((local, index) => ({
    id: `chin-cannon-barrel-${index}`,
    muzzle: combatHexacopterPoint(placement, local),
  }));
  const tubeMounts: WeaponMount[] = [];
  for (const side of [-1, 1] as const) {
    POD_TUBE_OFFSETS.forEach(([dx, dy], index) => {
      tubeMounts.push({
        id: `launcher-tube-${side}-${index}`,
        muzzle: combatHexacopterPoint(placement, [
          side * POD_CENTRE_X + dx,
          0.65 + dy,
          POD_MOUTH_Z,
        ]),
      });
    });
  }
  return {
    cannon: {
      kind: "cannon",
      projectile: {
        kind: "armourPiercing",
        // Авторский паспорт: проходит 40–50 мм наружной брони VX-8 при
        // близком к нормали ударе, но не его 70–110 мм силовые тоннели.
        // Число принадлежит боеприпасу, а не цели; граница конструкции
        // независимо восстанавливается из канонической геометрии в тесте.
        steelPenetration: { steelThicknessAtNormal: 0.055 },
      },
      mounts: cannonMounts,
      // Доставка пока сохраняет вылизанные дальность и ритм старой установки.
      // Отличие не в скрытом уроне, а в терминальной работе с листом.
      range: MG_RANGE,
      fireInterval: MG_FIRE_INTERVAL,
      dispersion: 0.012,
      // Две очереди на удержание. Меньше — машина щёлкает одиночными на
      // пролёте угла и читается автоматом; больше — не успевает открыть огонь
      // на быстром проходе.
      trackingSeconds: 0.22,
    },
    rockets: {
      kind: "podRocket",
      mounts: tubeMounts,
      explosive: "podRocket",
      // Три трубы в рипле: одиночная ракета кольца почти не снимает, а веер из
      // трёх закрывает ошибку упреждения примерно на ширину цели.
      rippleSize: 3,
      rippleInterval: 0.14,
      reloadSeconds: 2.2,
      // Полминуты на снаряжение пустого пода — вердикт Igor. Это два-три
      // захода на одной пушке: пустой под читается как событие, а бой не глохнет.
      rearmSeconds: 30,
      // Ракета — оружие ПОДХОДА, пушка — оружие прохода, поэтому её конверт
      // длиннее пушечного. Дальше 85 м время полёта переваливает за 0.9 с и
      // ошибка упреждения растёт быстрее, чем помогает веер.
      range: 85,
      // ШАГ ВЕЕРА ПОДБИРАЛСЯ ЗАМЕРОМ И БЫЛ УМЕНЬШЕН ВЧЕТВЕРО.
      //
      // Замысел «широкий веер закрывает ошибку упреждения» был верен ровно до
      // тех пор, пока упреждение бралось пропорциональным контуром и ошибка
      // держалась в четверть радиана. После подачи темпа линии визирования
      // вперёд ошибка ушла на порядок, и прежние 0.035 рад (метр на тридцати
      // метрах) стали РАЗБРАСЫВАТЬ ракеты с выбранного кольца на корпус: 19
      // снятых кусков и ни одного кольца.
      //
      // Теперь это не дробь, а короткая очередь: 0.36 м между ракетами на
      // тридцати метрах — меньше габарита кольца.
      rippleSpread: 0.012,
      // Ворота пуска: трубы неподвижны, значит решение обязано лежать почти на
      // оси. Три градуса.
      aimTolerance: 0.052,
      // Середина рабочего конверта: ближе сведения трубы бьют наружу, дальше —
      // внутрь, и на краях конверта расхождение остаётся меньше метра.
      harmonisationRange: 40,
      // ВЫВОДИТСЯ, А НЕ ВЫБИРАЕТСЯ: от устья до передней кромки габарита
      // (3.44 − 1.62 = 1.82), плюс радиус неконтактного взрывателя, плюс
      // запас. Без слагаемого со взрывателем снаряд вышел бы наружу и тут же
      // сработал по своей машине.
      launchClearance:
        COMBAT_HEX_LENGTH / 2 -
        POD_MOUTH_Z +
        (explosiveProfile("podRocket").proximityFuse ?? 0) +
        0.3,
      armSeconds: 0.35,
    },
  };
}

const localYawThrusters = (): readonly CombatHexacopterYawThruster[] =>
  COMBAT_HEX_YAW_STATIONS.map((station) => ({
    id: station.id,
    point: [station.x, station.y, station.z],
    axis: [Math.sin(station.cant), 0, Math.cos(station.cant)],
    maximumForce: COMBAT_HEXACOPTER_YAW_FAN_FORCE,
  }));

/**
 * СЕНСОРЫ ДИСТАНЦИИ КРЕПЯТСЯ, А НЕ ВИСЯТ. Правило посадки прибора на
 * сегментированное кольцо: СТРОГО СЕРЕДИНА БОКОВОЙ ПЛИТЫ — стыковые планки
 * идут каждые 30°, и сырой «радиус наружу» сажал датчик на стык. Если плита
 * занята путевым огнём (средние гондолы), прибор уходит на СОСЕДНЮЮ плиту,
 * более близкую к нормали борта. Верхний и нижний датчики кольца сидят на
 * кромках воротников того же азимута, а не парят над зевом ротора.
 * Корпусные — НА обшивке: брюшной прежде висел в сорока сантиметрах под
 * днищем и читался «откреплённым бирюзовым фонарём» у земли.
 */
const RING_PLATE = Math.PI / 6;

function plateMiddleAzimuth(outwardAzimuth: number, blocked?: number): number {
  const middleOf = (raw: number) =>
    Math.round((raw - RING_PLATE / 2) / RING_PLATE) * RING_PLATE +
    RING_PLATE / 2;
  const nearest = middleOf(outwardAzimuth);
  if (blocked === undefined) {
    return nearest;
  }
  const wrap = (value: number) =>
    Math.atan2(Math.sin(value), Math.cos(value));
  if (Math.abs(wrap(nearest - blocked)) > 1e-6) {
    return nearest;
  }
  const before = nearest - RING_PLATE;
  const after = nearest + RING_PLATE;
  return Math.abs(wrap(before - outwardAzimuth)) <=
    Math.abs(wrap(after - outwardAzimuth))
    ? before
    : after;
}

function proximitySensors(
  placement: CombatHexacopterPlacement,
): CombatHexacopterBlueprint["proximitySensors"] {
  const sensors: {
    point: SceneVector3;
    normal: SceneVector3;
  }[] = [
    // Корпусные — на обшивке. Нос и хвост совпадают с бронёй; брюшной сидит
    // на днище (низ обшивки 0.42), верхний — на хребте (1.86).
    { point: combatHexacopterPoint(placement, [0, 0.82, 3.15]), normal: combatHexacopterVector(placement, [0, 0, 1]) },
    { point: combatHexacopterPoint(placement, [0, 1.7, -3.25]), normal: combatHexacopterVector(placement, [0, 0, -1]) },
    { point: combatHexacopterPoint(placement, [0, 1.88, -1.18]), normal: [0, 1, 0] },
    { point: combatHexacopterPoint(placement, [0, 0.4, 0]), normal: [0, -1, 0] },
  ];
  const wall = 0.065 / 2;
  for (const station of COMBAT_HEX_LIFT_STATIONS) {
    const outwardAzimuth = Math.atan2(station.z, station.x);
    // На средних гондолах середину носовой плиты занимает путевой огонь.
    const lightAzimuth = station.id.startsWith("middle")
      ? station.x < 0
        ? Math.PI - RING_PLATE / 2
        : RING_PLATE / 2
      : undefined;
    const azimuth = plateMiddleAzimuth(outwardAzimuth, lightAzimuth);
    const chord = station.outerRadius * Math.cos(RING_PLATE / 2) + wall / 2;
    const radial = chord + 0.05;
    const across: SceneVector3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const deck = station.planeY + 0.15;
    const floor = station.planeY - 0.2;
    const wallMiddleY = (deck - 0.02 + floor + 0.02) / 2;
    sensors.push(
      {
        point: combatHexacopterPoint(placement, [
          station.x + across[0] * radial,
          wallMiddleY,
          station.z + across[2] * radial,
        ]),
        normal: combatHexacopterVector(placement, across),
      },
      // Верхний и нижний смотрят сквозь ось ротора — им место НАД и ПОД
      // кольцом, как и было: правило середины плиты касается только боковых.
      {
        point: combatHexacopterPoint(placement, [station.x, deck + 0.03, station.z]),
        normal: [0, 1, 0],
      },
      {
        point: combatHexacopterPoint(placement, [station.x, floor - 0.02, station.z]),
        normal: [0, -1, 0],
      },
    );
  }
  return sensors;
}

/**
 * ЧЕТЫРЕ ОПОРЫ КАК ФИЗИЧЕСКИЙ ОРГАН, А НЕ КАК ЖЁСТКИЙ СТОЛБ.
 *
 * Раньше нога держала машину коллайдерами: касание решалось одним импульсом
 * за шаг, нарисованный ход олео был украшением, а закон материалов судил
 * посадку по пиковой скорости вместо работы. Теперь ногу держит стойка —
 * газовая пружина с несимметричным маслом, — а куски `landing-` выключены из
 * компаунда, иначе луч стойки нашёл бы опору в собственной пятке.
 *
 * Числа выбраны по этой машине и проверены прогоном посадок на шаге 1/60:
 *
 *   0.5 м/с (штатная автоматическая) — 2.4 g, полход;
 *   2.0 м/с (расчётная) — 4.6 g, 83% хода, отскок 0.5 м/с;
 *   3.0 м/с — ровно упор;
 *   4.0 м/с — упор пробит, остаток принимает корпус и судит закон материалов.
 *
 * Ход 0.12 м снят с нарисованного цилиндра: колено 0.38 → ось пятки 0.17.
 * Ось стойки — тот же отрезок, наклонённый наружу и вдоль борта, поэтому
 * сжимается она чуть быстрее, чем машина снижается.
 *
 * УБОРКА. Цапфа нарисована вдоль оси z, поэтому нога складывается в плоскости
 * борта — к продольной оси корпуса, как и положено. Угол не назначен, а выведен
 * из геометрии: столько, чтобы пятка ушла под самое низкое место днища и там
 * остановилась. У кормовых ног днище выше, но высота уборки для всех одна —
 * иначе четыре ноги вставали бы на четырёх разных уровнях без всякой на то
 * причины.
 */
const GEAR_TUCKED_HEIGHT = 0.36;
const GEAR_RETRACT_SECONDS = 4;
/** Всё, что висит НА цапфе. Сама цапфа не складывается: она и есть ось. */
const GEAR_FOLDING_PARTS = [
  "main-strut",
  "drag-link",
  "knee",
  "oleo",
  "oleo-gland",
  "oleo-piston",
  "scissor",
  "pad-pivot",
  "pad",
  "pad-sole",
] as const;

function landingStruts(
  placement: CombatHexacopterPlacement,
): readonly VehicleSupportStrutDefinition[] {
  return COMBAT_HEX_LANDING_STATIONS.map((station) => ({
    plan: {
      id: station.id,
      mount: combatHexacopterPoint(placement, station.knee),
      axis: combatHexacopterVector(placement, [
        station.axle[0] - station.knee[0],
        station.axle[1] - station.knee[1],
        station.axle[2] - station.knee[2],
      ]),
      // Опора отсчитывается от СОБСТВЕННОГО датума машины, а не от грунта
      // мира: вылет — свойство ноги, а где под ней земля, каждый шаг ищет луч.
      groundHeight: placement.position[1],
      stroke: COMBAT_HEX_OLEO_STROKE,
      staticSagShare: COMBAT_HEX_OLEO_STATIC_SAG_SHARE,
      compressedLoadFactor: 6,
      designSinkRate: 2,
      oilShareAtDesignRate: 2,
      recoilSeconds: 0.9,
    },
    // Нога держится на главной стойке и кончается пяткой: нет любого из двух —
    // угол проваливается. Цапфа и подкос без главной стойки бесполезны сами.
    requiredMembers: [
      `:landing-main-strut-${station.id}:`,
      `:landing-pad-${station.id}:`,
    ],
    travellingMembers: [
      `:landing-oleo-piston-${station.id}:`,
      `:landing-pad-pivot-${station.id}:`,
      `:landing-pad-${station.id}:`,
      `:landing-pad-sole-${station.id}:`,
    ],
    halfTravellingMembers: [`:landing-scissor-${station.id}:`],
    retraction: {
      // Цапфа: точка крепления, ось — вдоль корпуса, как она и нарисована.
      pivot: combatHexacopterPoint(placement, station.attach),
      hinge: combatHexacopterVector(placement, [0, 0, 1]),
      angle: strutRetractionAngle({
        pivot: station.attach,
        foot: [station.axle[0], 0.055, station.axle[2]],
        tuckedHeight: GEAR_TUCKED_HEIGHT,
      }),
      seconds: GEAR_RETRACT_SECONDS,
    },
    foldingMembers: GEAR_FOLDING_PARTS.map(
      (part) => `:landing-${part}-${station.id}:`,
    ),
  }));
}

export function createCombatHexacopterBlueprint(
  placement: CombatHexacopterPlacement,
): CombatHexacopterBlueprint {
  const enginePoints = COMBAT_HEX_LIFT_STATIONS.map((station) =>
    combatHexacopterPoint(placement, [station.x, station.planeY, station.z]),
  );
  const yawThrusters = localYawThrusters().map((thruster) => ({
    ...thruster,
    point: combatHexacopterPoint(placement, thruster.point),
    axis: combatHexacopterVector(placement, thruster.axis),
  }));
  return {
    id: COMBAT_HEXACOPTER_BLUEPRINT_ID,
    telemetryLabel: RAX8_TONKAWA_TELEMETRY_LABEL,
    placement,
    origin: combatHexacopterPoint(placement, [0, 0.96, 0.08]),
    nose: combatHexacopterVector(placement, [0, 0, 1]),
    liftCentre: combatHexacopterPoint(placement, [0, 1.14, 0.02]),
    mooringPoint: combatHexacopterPoint(placement, [0, 0.34, 2.85]),
    enginePoints,
    rotorCapacityWeights: COMBAT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS,
    rotorSpinDirections: COMBAT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS,
    yawThrusters,
    proximitySensors: proximitySensors(placement),
    landingStruts: landingStruts(placement),
    armament: armament(placement),
    envelope: {
      length: COMBAT_HEX_LENGTH,
      width: COMBAT_HEX_WIDTH,
      height: COMBAT_HEX_HEIGHT,
    },
    flight: {
      liftSource: "rotor",
      // ЗАПАС ПОДЪЁМА ДЕРЖИТ НЕ ВЫСОТУ, А КРЕН.
      //
      // Он и раньше покрывал потерю целого кольца, но с разрешённым жёстким
      // виражом у него появилась вторая работа. В координированном вираже тяга
      // равна весу, делённому на косинус крена: на 56° это 1.79 висения, и всё
      // это ДО того, как винтам понадобится запас на моменты по крену и
      // тангажу. Прежние 3.65 (полезных 3.10 после потолка газа) оставляли на
      // манёвр слишком тонкую полосу, поэтому запас поднят.
      liftReserve: 4.2,
      // ПРЕДЕЛ НАКЛОНА — ПОЛИТИКА, И ОНА БЫЛА ВЫСТАВЛЕНА НЕ ПО ЭТОЙ МАШИНЕ.
      //
      // Физика при располагаемой перегрузке 3.57 разрешает 73.7°. Но упирается
      // вираж не в тягу: он координированный, нос обязан идти по касательной с
      // темпом v/r, и на 30-метровом радиусе предел по тяге потребовал бы 0.98
      // рад/с при располагаемых 0.72. Поэтому политика ставится ТАМ, ГДЕ
      // КОНЧАЕТСЯ РЫСКАНИЕ, а не тяга: 56° дают 14.5 м/с² и 21 м/с на том же
      // радиусе — ровно то, что нос ещё способен обслужить.
      maximumTilt: (56 * Math.PI) / 180,
      liftTrimRange: 0.32,
      spoolSeconds: 3.8,
      linearDamping: 0.19,
      angularDamping: 0.64,
      lateralDragRatio: 7.2,
    },
  };
}

export const combatHexacopterPrototypeBlueprint =
  createCombatHexacopterBlueprint(COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT);

/**
 * Complete movable-frame passport, deliberately returned by a factory and
 * not inserted into `vehicleFrames`. World registration happens only after a
 * berth is selected.
 */
export function createCombatHexacopterVehicleFrame(
  blueprint: CombatHexacopterBlueprint,
): VehicleFrameDefinition {
  return {
    id: blueprint.id,
    clusterId: blueprint.placement.clusterId,
    telemetryLabel: blueprint.telemetryLabel,
    // Собственное кинематическое тело нужно только тому, чья поза отличается
    // от позы кадра, — вращающимся лопастям. Прежняя маска ":engine:" делала
    // независимым телом ВСЮ гондолу: 390 кусков из 663 получали по телу, а
    // вращались 44. Первый коптер собран правильно — [":blade:"] — и после
    // перестройки гондол в стальной набор эта расточительность подорожала
    // ещё на две с лишним сотни кусков.
    independentMemberMatches: [":blade:"],
    // НОГА И ЛУЧ СТОЙКИ НЕСОВМЕСТИМЫ. Оставленный пятке коллайдер немедленно
    // становится тем, что находит под собой её собственный луч, — машина
    // «садится» в воздухе на нулевом обжатии. Опору держит `supportStrut`,
    // поэтому в обводе компаунда ей делать нечего. Цена честная и известная:
    // отстрелить ногу попаданием больше нельзя, потому что попадания ищутся
    // лучом по коллайдерам. У автомобиля за колёса заплачено тем же.
    contactMemberExcludes: [":landing-"],
    origin: blueprint.origin,
    nose: blueprint.nose,
    mooringPoint: blueprint.mooringPoint,
    liftCentre: blueprint.liftCentre,
    envelopeMatch: ":blade:",
    proximitySensors: blueprint.proximitySensors,
    supportStruts: blueprint.landingStruts,
  };
}

export const combatHexacopterPrototypeFrame =
  createCombatHexacopterVehicleFrame(combatHexacopterPrototypeBlueprint);

export const combatHexacopterRangeBlueprint =
  createCombatHexacopterBlueprint(COMBAT_HEXACOPTER_RANGE_PLACEMENT);

export const combatHexacopterRangeFrame =
  createCombatHexacopterVehicleFrame(combatHexacopterRangeBlueprint);

export interface CombatHexacopterYawAllocation {
  /** Signed reversible command for left/right fan, -1..1. */
  readonly commands: readonly [number, number];
  readonly forces: readonly SceneVector3[];
  readonly netForce: SceneVector3;
  readonly yawMoment: number;
}

/**
 * Раскладка по двум развёрнутым реверсивным тоннелям.
 *
 * Сам закон общий и живёт в винтокрылой физике — своего у этой машины здесь
 * ничего нет, кроме паспорта. Функция остаётся точкой, где паспорт машины
 * встречается с общим законом: она показывает, что тоннели УМЕЮТ, до и
 * независимо от того, что у них попросит автопилот.
 *
 * Плечи считаются от авторского `origin` — это чтение паспорта, а не полётный
 * счёт; в полёте общая физика берёт настоящий центр масс, который живёт своей
 * жизнью после потери куска.
 */
export function combatHexacopterYawAllocation(
  blueprint: CombatHexacopterBlueprint,
  requestedYawMoment: number,
  availability: readonly [number, number] = [1, 1],
): CombatHexacopterYawAllocation {
  const allocation = yawThrusterAllocation(
    blueprint.yawThrusters,
    blueprint.origin,
    requestedYawMoment,
    availability,
  );
  return {
    commands: [allocation.commands[0] ?? 0, allocation.commands[1] ?? 0],
    forces: allocation.forces,
    netForce: allocation.netForce,
    yawMoment: allocation.yawMoment,
  };
}

/**
 * СТЕНДОВАЯ ПРОБА ОБЪЕДИНЁННОГО КАНАЛА РЫСКАНИЯ.
 *
 * Своего контура управления у этой машины нет и быть не должно: закон раздела
 * момента между реактивным каналом и тоннелями общий, живёт в
 * `rotorcraftForces` и работает у любой винтокрылой машины, которой объявили
 * `yawThrusters`. Здесь остаётся один вопрос, ради которого паспорт и
 * существует: что получится у ЭТОЙ машины при таком-то остатке реактивного
 * момента и такой-то живучести тоннелей.
 *
 * Функция намеренно повторяет порядок общего кода, а не подменяет его: сперва
 * доля реактивного канала, потом тоннели, потом остаток тому, у кого он ещё
 * есть. Расходиться им негде — общий шаг проверяется отдельным прогоном сил.
 */
export interface CombatHexacopterYawDemand {
  /** Traditional autopilot output; no motor topology leaks above this line. */
  readonly wantedYawRate: number;
  readonly actualYawRate: number;
  readonly yawInertia: number;
  /** Moment range still available from reaction torque of the six lift rotors. */
  readonly primaryMinimumMoment: number;
  readonly primaryMaximumMoment: number;
  readonly yawFanAvailability?: readonly [number, number];
}

export interface CombatHexacopterYawControl {
  readonly wantedYawMoment: number;
  readonly primaryYawMoment: number;
  readonly auxiliary: CombatHexacopterYawAllocation;
  readonly deliveredYawMoment: number;
  readonly acceptedYawRate: number;
  readonly authority: number;
}

export function combatHexacopterYawControl(
  blueprint: CombatHexacopterBlueprint,
  demand: CombatHexacopterYawDemand,
): CombatHexacopterYawControl {
  const yawInertia = Math.max(1e-6, demand.yawInertia);
  const wantedYawMoment =
    yawInertia *
    ROTORCRAFT_YAW_RATE_GAIN *
    (demand.wantedYawRate - demand.actualYawRate);
  const minimum = Math.min(
    demand.primaryMinimumMoment,
    demand.primaryMaximumMoment,
  );
  const maximum = Math.max(
    demand.primaryMinimumMoment,
    demand.primaryMaximumMoment,
  );
  const clampPrimary = (moment: number) =>
    Math.max(minimum, Math.min(maximum, moment));
  const preferredAuxiliary = combatHexacopterYawAllocation(
    blueprint,
    wantedYawMoment * (1 - ROTORCRAFT_AUXILIARY_YAW_PRIMARY_SHARE),
    demand.yawFanAvailability,
  );
  const primaryYawMoment = clampPrimary(
    wantedYawMoment - preferredAuxiliary.yawMoment,
  );
  const auxiliary = combatHexacopterYawAllocation(
    blueprint,
    wantedYawMoment - primaryYawMoment,
    demand.yawFanAvailability,
  );
  const deliveredYawMoment = primaryYawMoment + auxiliary.yawMoment;
  const acceptedYawRate =
    demand.actualYawRate +
    deliveredYawMoment / (yawInertia * ROTORCRAFT_YAW_RATE_GAIN);
  const authority = Math.abs(wantedYawMoment) < 1e-6
    ? 1
    : Math.max(0, Math.min(1, deliveredYawMoment / wantedYawMoment));
  return {
    wantedYawMoment,
    primaryYawMoment,
    auxiliary,
    deliveredYawMoment,
    acceptedYawRate,
    authority,
  };
}
