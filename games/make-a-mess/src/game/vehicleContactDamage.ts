import type { SceneVector3 } from "./destructionScene.ts";

/**
 * УДАР ДВУХ ОБЪЕКТОВ. Не контакт.
 *
 * Контакт — это ограничение «не проникай», нормальная реакция и трение
 * Rapier. Удар — измеренное событие того же солвера: два куска встретились и
 * передали конечный импульс. Код ниже не создаёт второй ответ на
 * столкновение, а переводит измерение в шкалу общего закона разрушения.
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
 * ЗАКОНА РАЗРУШЕНИЯ ЗДЕСЬ НЕТ. Обе стороны судятся одним и тем же законом
 * материалов проекта — `classifyLandingDamage`, которым уже судится падающий
 * обломок. Он откалиброван в настоящих м/с, поэтому масштаб масс проекта его
 * не касается. Этот модуль только ИЗМЕРЯЕТ удар: скорость сближения, импульс
 * и интенсивность каждой стороне — в той же калибровке, в которой закон
 * получает их от обломков. Собственная шкала прочности машины была бы вторым
 * законом, а второго закона быть не должно.
 *
 * Модуль намеренно чистый: ни three, ни rapier, ни каталога материалов —
 * свойства приходят функцией, как плотности в `massProperties`.
 */

/** Свойства материала, нужные удару. Приходят из каталога сцены. */
export interface ContactMaterialProfile {
  /** Коэффициент восстановления: какая доля скорости вернётся отскоком. */
  readonly restitution: number;
  /**
   * Плотность в шкале проекта: масса куска = volume × density. Нужна не для
   * вердикта, а для интенсивности — импульс сравнивается с весом куска.
   */
  readonly density: number;
}

/** Одна из двух встретившихся сторон. */
export interface VehicleContactBody {
  readonly pieceId: string;
  readonly material: string;
  /** Объём материала куска — авторская ручка массы, а не геометрия. */
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
  /**
   * Normal impulse measured by the real contact solver. When present it is
   * authoritative: no second synthetic collision response is generated.
   */
  readonly normalImpulse?: number;
  readonly vehicle: VehicleContactBody;
  /** Null, когда встреченная геометрия не является разрушаемым куском. */
  readonly obstacle: VehicleContactBody | null;
  /**
   * ДОЛЯ ЭТОГО КОНТАКТА В ОДНОМ УДАРЕ, 0…1.
   *
   * У удара один импульс, и он делится, а не размножается. Машина, легшая
   * бортом на стену, даёт десятки пар одновременно; если каждой отдать полный
   * останавливающий импульс, корабль отскочит от собственного касания быстрее,
   * чем летел. Это сохранение, а не настройка. Скорость сближения долей НЕ
   * делится: она интенсивная величина, у всех пар одного удара она своя и
   * настоящая.
   *
   * Не задана — единица: одиночный контакт получает весь удар.
   */
  readonly share?: number;
}

export interface VehicleContactResolution {
  /** Нормальная скорость сближения, м/с. Ноль означает расхождение. */
  readonly closingSpeed: number;
  readonly restitution: number;
  /** Импульс машине в точке контакта. Есть ВСЕГДА, когда есть сближение. */
  readonly impulse: SceneVector3;
  /**
   * Интенсивность для закона материалов на стороне МАШИНЫ: средняя сила
   * этого контакта за шаг против веса её куска, в калибровке закона обломков.
   */
  readonly vehicleIntensity: number;
  /** То же для встреченного куска мира. Ноль, когда кусок не опознан. */
  readonly obstacleIntensity: number;
}

/**
 * Заявка на разрушение, которую удар отдаёт наружу. Она НЕ содержит вердикта
 * «сломать»: она содержит замер, а закон материалов один на обе стороны и
 * применяется там, где он живёт.
 */
export interface VehicleContactDamageRequest {
  readonly point: SceneVector3;
  /** Куда шёл удар: по ней разлетаются осколки. */
  readonly direction: SceneVector3;
  readonly closingSpeed: number;
  /** Кусок машины, встретивший мир. Судится своим материалом. */
  readonly vehiclePieceId: string;
  readonly vehicleIntensity: number;
  /** Встреченный кусок мира, если он опознан. Судится своим материалом. */
  readonly worldPieceId: string | null;
  readonly worldIntensity: number;
}

/**
 * Калибровка интенсивности закона обломков: у лежащего обломка intensity =
 * сила контакта / (масса × 320), а «сила» у rapier — это импульс, умноженный
 * на частоту шага. Удар обязан мерить ровно в этой шкале, иначе один закон
 * получит два разных термометра. Обе константы — свойства существующего
 * замера, а не ручки этого модуля.
 */
const PHYSICS_STEP_HZ = 60;
const LANDING_INTENSITY_FORCE_SCALE = 320;

function contactIntensity(impulseMagnitude: number, mass: number): number {
  return (
    (impulseMagnitude * PHYSICS_STEP_HZ) /
    Math.max(1e-6, mass * LANDING_INTENSITY_FORCE_SCALE)
  );
}

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
 * Один удар: одно измерение, два замера.
 *
 * Импульс возвращается всегда. Вердикты здесь не выносятся: замер каждой
 * стороны уходит одному закону материалов, где сторона отвечает своим
 * материалом — поэтому дом может рассыпаться, а машина уцелеть, и наоборот.
 */
export function resolveVehicleContact(
  event: VehicleContactEvent,
  materialOf: (material: string) => ContactMaterialProfile,
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
    vehicleIntensity: 0,
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
  const measuredClosingSpeed = -(
    event.relativeVelocity[0] * unit[0] +
    event.relativeVelocity[1] * unit[1] +
    event.relativeVelocity[2] * unit[2]
  );
  const share = Math.max(0, Math.min(1, event.share ?? 1));
  const measuredImpulse = Math.max(0, event.normalImpulse ?? 0);
  const closingSpeed = event.normalImpulse === undefined
    ? measuredClosingSpeed
    : measuredImpulse / Math.max(1e-9, event.effectiveMass * (1 + restitution));
  if (closingSpeed <= 0) {
    return idle;
  }
  const magnitude = event.normalImpulse === undefined
    ? event.effectiveMass * closingSpeed * (1 + restitution) * share
    : measuredImpulse;
  const vehicleMass = Math.max(1e-9, event.vehicle.volume) *
    Math.max(1e-6, vehicleProfile.density);
  const obstacleMass = event.obstacle && obstacleProfile
    ? Math.max(1e-9, event.obstacle.volume) *
      Math.max(1e-6, obstacleProfile.density)
    : null;
  return {
    closingSpeed,
    restitution,
    // Импульс толкает машину ОТ препятствия, вдоль нормали.
    impulse: [
      unit[0] * magnitude,
      unit[1] * magnitude,
      unit[2] * magnitude,
    ],
    vehicleIntensity: contactIntensity(magnitude, vehicleMass),
    obstacleIntensity:
      obstacleMass === null ? 0 : contactIntensity(magnitude, obstacleMass),
  };
}
