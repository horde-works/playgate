import type { SceneVector3 } from "./destructionScene.ts";

/**
 * УДАР ДВУХ ОБЪЕКТОВ. Не контакт.
 *
 * Контакт — это ограничение «не проникай»: непрерывная штрафная реакция и
 * трение под лежащим корпусом. Им занимаются щупы, и урона они не производят
 * никогда. Удар — событие: два куска встретились в точке с относительной
 * скоростью. Вывести одно из другого нельзя, и это не вкусовое решение:
 * величина силы штрафной пружины зависит от её жёсткости и размера шага, то
 * есть ею измеряется настройка интегратора, а не физика.
 *
 * С точки зрения мира машина — обычный объект, как летящая в дом ракета. Вся
 * разница в том, что ракета после попадания исчезает, а машина остаётся и
 * обязана получить своё.
 *
 * Из одного удара следуют две вещи с РАЗНЫМ статусом:
 *
 *   импульс      — обязателен всегда, даже когда ничего не сломалось;
 *   разрушение   — условно и спрашивается у каждой стороны отдельно, каждой
 *                  со своим материалом.
 *
 * Модуль намеренно чистый: ни three, ни rapier, ни каталога материалов —
 * свойства приходят функцией, как плотности в `massProperties`.
 */

/** Свойства материала, нужные удару. Приходят из каталога сцены. */
export interface ContactMaterialProfile {
  /** Коэффициент восстановления: какая доля скорости вернётся отскоком. */
  readonly restitution: number;
  /**
   * Относительное сопротивление разрушению в шкале урона проекта. Это не
   * Дж/м³, а порядковая стойкость материала: сталь 24 против бетона 2.4.
   */
  readonly fractureEnergy: number;
}

/** Одна из двух встретившихся сторон. */
export interface VehicleContactBody {
  readonly pieceId: string;
  readonly material: string;
  /** Объём материала куска: через него считается сечение его крепления. */
  readonly volume: number;
}

export interface VehicleContactEvent {
  /** Мировая точка контакта. */
  readonly point: SceneVector3;
  /** Единичная нормаль от поверхности препятствия В СТОРОНУ машины. */
  readonly normal: SceneVector3;
  /** Скорость точки машины МИНУС скорость точки препятствия. */
  readonly relativeVelocity: SceneVector3;
  /**
   * Эффективная масса машины в этой точке вдоль нормали. Именно она, а не
   * полная: плечо делает вынесенную точку заметно легче, и полная масса
   * завысила бы импульс в разы.
   */
  readonly effectiveMass: number;
  readonly vehicle: VehicleContactBody;
  /** Null, когда встреченная геометрия не является разрушаемым куском. */
  readonly obstacle: VehicleContactBody | null;
}

export interface VehicleContactResolution {
  /** Нормальная скорость сближения, м/с. Ноль означает расхождение. */
  readonly closingSpeed: number;
  readonly restitution: number;
  /** Импульс машине в точке контакта. Есть ВСЕГДА, когда есть сближение. */
  readonly impulse: SceneVector3;
  /** Энергия, ушедшая в смятие обеих сторон. */
  readonly absorbedEnergy: number;
  /** Доля этой энергии, доставшаяся машине. */
  readonly vehicleShare: number;
  readonly vehicleEnergy: number;
  readonly obstacleEnergy: number;
  /** Крепление куска машины не выдержало: он покидает compound body. */
  readonly detachesVehiclePiece: boolean;
  /**
   * Насколько кусок машины близок к отрыву, 0…1. Наблюдаемая величина для
   * телеметрии и тестов: по ней видно, что порог не «почти сработал».
   */
  readonly vehicleJointLoad: number;
  /**
   * Нормированная интенсивность для закона материалов мира. Считается тем же
   * способом, что у падающего обломка: доставленное ускорение против веса
   * встреченного куска.
   */
  readonly obstacleIntensity: number;
}

const GRAVITY = 9.81;

/**
 * Восстановление пары. Берётся среднее, и это осознанное приближение: у всех
 * материалов проекта оно лежит между 0.008 и 0.14, то есть удары почти
 * полностью пластичные, и разница между средним и любой другой сверткой
 * меньше, чем разброс внутри самого материала.
 */
export function contactRestitution(
  vehicle: ContactMaterialProfile,
  obstacle: ContactMaterialProfile | null,
): number {
  const first = Math.max(0, Math.min(1, vehicle.restitution));
  if (!obstacle) {
    return first;
  }
  const second = Math.max(0, Math.min(1, obstacle.restitution));
  return (first + second) / 2;
}

/**
 * Как энергия смятия делится между сторонами.
 *
 * Мнётся сильнее тот, кто податливее, поэтому доля обратна стойкости. Сталь
 * (24) о бетон (2.4) отдаёт машине девять процентов: дом рассыпается, а
 * машине достаётся десятая часть — которой, впрочем, хватает на крепление.
 */
export function contactEnergyShare(
  vehicle: ContactMaterialProfile,
  obstacle: ContactMaterialProfile | null,
): number {
  const own = Math.max(1e-6, vehicle.fractureEnergy);
  if (!obstacle) {
    // Встречена неразрушаемая геометрия: мяться больше некому.
    return 1;
  }
  const other = Math.max(1e-6, obstacle.fractureEnergy);
  return other / (own + other);
}

/**
 * СТОЙКОСТЬ КРЕПЛЕНИЯ. Сталь не крошится — отказывает узел, которым кусок
 * держится за корпус, и это другое, гораздо меньшее число, чем прочность
 * самого материала.
 *
 * Сечение крепления растёт как площадь, то есть как `V^(2/3)`: у маленького
 * ребра фонаря узел во много раз слабее, чем у килевого поддона, хотя сталь
 * одна и та же. Множитель — единственное авторское число этого модуля, и оно
 * выведено из ТРЕБОВАНИЯ, а не назначено: посадка на собственные опоры на
 * всей эксплуатационной вертикальной скорости не должна отрывать ничего, а
 * удар на маршевой скорости обязан отрывать встреченное. См.
 * `tests/vehicle-contact-damage.test.mjs`, где обе границы проверяются.
 */
export const JOINT_ENERGY_SCALE = 7;

export function vehicleJointCapacity(
  body: VehicleContactBody,
  profile: ContactMaterialProfile,
): number {
  const volume = Math.max(1e-9, body.volume);
  return (
    JOINT_ENERGY_SCALE *
    Math.max(1e-6, profile.fractureEnergy) *
    Math.cbrt(volume * volume)
  );
}

/**
 * Один удар: одно измерение, два вердикта.
 *
 * Импульс возвращается всегда. Разрушение — только там, где энергия смятия
 * превысила то, что сторона способна принять; вопрос задаётся каждой стороне
 * своим материалом, поэтому дом может рассыпаться, а машина уцелеть, и
 * наоборот.
 */
export function resolveVehicleContact(
  event: VehicleContactEvent,
  materialOf: (material: string) => ContactMaterialProfile,
  obstacleMassOf?: (obstacle: VehicleContactBody) => number,
): VehicleContactResolution {
  const length = Math.hypot(event.normal[0], event.normal[1], event.normal[2]);
  const vehicleProfile = materialOf(event.vehicle.material);
  const obstacleProfile = event.obstacle
    ? materialOf(event.obstacle.material)
    : null;
  const restitution = contactRestitution(vehicleProfile, obstacleProfile);
  const idle: VehicleContactResolution = {
    closingSpeed: 0,
    restitution,
    impulse: [0, 0, 0],
    absorbedEnergy: 0,
    vehicleShare: contactEnergyShare(vehicleProfile, obstacleProfile),
    vehicleEnergy: 0,
    obstacleEnergy: 0,
    detachesVehiclePiece: false,
    vehicleJointLoad: 0,
    obstacleIntensity: 0,
  };
  if (length <= 1e-9 || event.effectiveMass <= 0) {
    return idle;
  }
  const unit: SceneVector3 = [
    event.normal[0] / length,
    event.normal[1] / length,
    event.normal[2] / length,
  ];
  // Нормаль смотрит в машину, поэтому сближение — это движение машины ПРОТИВ
  // неё. Скользящая составляющая сюда не входит вовсе: полёт вдоль стены не
  // является ударом, сколько бы он ни длился.
  const closingSpeed = -(
    event.relativeVelocity[0] * unit[0] +
    event.relativeVelocity[1] * unit[1] +
    event.relativeVelocity[2] * unit[2]
  );
  if (closingSpeed <= 0) {
    return idle;
  }

  const magnitude = event.effectiveMass * closingSpeed * (1 + restitution);
  const absorbedEnergy =
    0.5 *
    event.effectiveMass *
    closingSpeed *
    closingSpeed *
    (1 - restitution * restitution);
  const vehicleShare = contactEnergyShare(vehicleProfile, obstacleProfile);
  const vehicleEnergy = absorbedEnergy * vehicleShare;
  const obstacleEnergy = absorbedEnergy * (1 - vehicleShare);
  const capacity = vehicleJointCapacity(event.vehicle, vehicleProfile);
  const obstacleMass = event.obstacle
    ? Math.max(1e-6, obstacleMassOf?.(event.obstacle) ?? 1)
    : 1;
  return {
    closingSpeed,
    restitution,
    // Импульс толкает машину ОТ препятствия, вдоль нормали.
    impulse: [
      unit[0] * magnitude,
      unit[1] * magnitude,
      unit[2] * magnitude,
    ],
    absorbedEnergy,
    vehicleShare,
    vehicleEnergy,
    obstacleEnergy,
    detachesVehiclePiece: vehicleEnergy > capacity,
    vehicleJointLoad: capacity > 0 ? vehicleEnergy / capacity : 0,
    // Тот же смысл, что у обломка: доставленное ускорение против собственного
    // веса встреченного куска. Для машины против панели дома оно заведомо
    // велико, и решать будет СКОРОСТЬ — как и задумано.
    obstacleIntensity: magnitude / Math.max(1e-6, obstacleMass * GRAVITY),
  };
}
