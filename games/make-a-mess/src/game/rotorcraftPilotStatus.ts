/**
 * ЧТО ЧЕЛОВЕК ЗА ШТУРВАЛОМ ВИДИТ О СЕБЕ.
 *
 * Модуль отвечает на один вопрос — какой доклад уходит наружу, — и ни на один
 * сверх: ни как машину вести (`rotorcraftPilot`), ни как её держит микшер
 * (`rotorcraftDynamics`). Здесь только перевод состояния в приборы.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Сборка доклада и разбор дальномеров по секторам жили
 * в `VehicleFrameSystem`: первая — внутри покадрового колбэка, второй —
 * в подвале файла, за восемью тысячами строк от места вызова. Ни то, ни другое
 * не было покрыто ничем, хотя это ПРИБОРНАЯ ДОСКА: по ней человек решает,
 * снижаться ему или уходить, и молчаливо переставленный сектор врёт не хуже
 * сломанного датчика.
 *
 * Здесь нет ни React, ни Rapier, ни three: на входе числа, на выходе числа.
 */

import {
  LANDING_READY_SECONDS,
  type RotorcraftPilotState,
} from "./rotorcraftPilot.ts";
import type { VehicleObstacleReading } from "./vehicleSafetyAutomation.ts";

export { LANDING_READY_SECONDS };

export type RotorcraftProximitySector =
  | "fore"
  | "aft"
  | "port"
  | "starboard"
  | "above"
  | "below";

export interface RotorcraftProximityReading {
  readonly distance: number | null;
  readonly intervening: boolean;
}

export interface RotorcraftPilotStatus {
  readonly mode: RotorcraftPilotState["mode"];
  readonly targetAltitude: number;
  readonly currentAltitude: number;
  readonly verticalSpeed: number;
  readonly groundSpeed: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly sensorAssistEnabled: boolean;
  readonly landingReady: boolean;
  readonly proximity: Readonly<
    Record<RotorcraftProximitySector, RotorcraftProximityReading>
  >;
  readonly motorOutput: readonly number[];
  readonly motorAvailability: readonly number[];
}

/**
 * ДАЛЬНОМЕРЫ — ПО СЕКТОРАМ КОРПУСА, а не по номерам датчиков.
 *
 * Человеку нужен ответ «слева близко», а не «датчик номер четыре». Разбор идёт
 * по НОРМАЛИ препятствия в осях машины: вертикаль отбирается первой (пол и
 * потолок важнее борта), остальное делится продольной и поперечной осями по
 * тому, какая проекция больше.
 *
 * В секторе остаётся БЛИЖАЙШЕЕ показание. Но признак вмешательства
 * автоматики — липкий: если в том же секторе сработал другой датчик, признак
 * поднимается и на более далёком показании. Иначе прибор гасил бы
 * предупреждение ровно в тот момент, когда автоматика уже вмешалась.
 */
export function rotorcraftProximitySectors(
  nose: readonly [number, number, number],
  readings: readonly VehicleObstacleReading[],
  intervened: ReadonlySet<number>,
): Readonly<Record<RotorcraftProximitySector, RotorcraftProximityReading>> {
  const empty = (): RotorcraftProximityReading => ({
    distance: null,
    intervening: false,
  });
  const sectors: Record<RotorcraftProximitySector, RotorcraftProximityReading> =
    {
      fore: empty(),
      aft: empty(),
      port: empty(),
      starboard: empty(),
      above: empty(),
      below: empty(),
    };
  const noseLength = Math.hypot(nose[0], nose[2]) || 1;
  const fore = [nose[0] / noseLength, nose[2] / noseLength] as const;
  const starboard = [-fore[1], fore[0]] as const;
  for (const reading of readings) {
    const normal = reading.localNormal;
    let sector: RotorcraftProximitySector;
    if (normal[1] >= 0.65) {
      sector = "above";
    } else if (normal[1] <= -0.65) {
      sector = "below";
    } else {
      const longitudinal = normal[0] * fore[0] + normal[2] * fore[1];
      const lateral = normal[0] * starboard[0] + normal[2] * starboard[1];
      sector =
        Math.abs(longitudinal) >= Math.abs(lateral)
          ? longitudinal >= 0
            ? "fore"
            : "aft"
          : lateral >= 0
            ? "starboard"
            : "port";
    }
    const previous = sectors[sector];
    if (previous.distance === null || reading.distance < previous.distance) {
      sectors[sector] = {
        distance: Math.round(reading.distance * 10) / 10,
        intervening: intervened.has(reading.sensorIndex),
      };
    } else if (intervened.has(reading.sensorIndex) && !previous.intervening) {
      sectors[sector] = { ...previous, intervening: true };
    }
  }
  return sectors;
}

/** Всё, из чего собирается доклад. Ни одного поля сверх нужного. */
export interface RotorcraftPilotStatusInput {
  readonly pilot: RotorcraftPilotState;
  /**
   * АВТОРСКИЙ нос машины, в её собственных осях. Им разбираются дальномеры:
   * их нормали тоже местные, и подставить сюда мировое направление значит
   * повернуть всю картину препятствий вместе с машиной.
   */
  readonly nose: readonly [number, number, number];
  /**
   * МИРОВОЕ направление носа — только для курса. Это РАЗНЫЕ векторы, и первая
   * редакция этого модуля их слила: секторы поехали бы вместе с разворотом.
   */
  readonly forward: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  /** Тангаж и крен, уже посчитанные общим `vehicleAttitude`. */
  readonly attitude: { readonly pitch: number; readonly roll: number };
  readonly obstacleReadings: readonly VehicleObstacleReading[];
  readonly intervenedSensors: ReadonlySet<number>;
  readonly motorOutput: readonly number[];
  /** Доля тяги, которую каждый канал ещё способен дать; пусто — неизвестно. */
  readonly propulsionFeedback?: readonly number[];
}

/**
 * ПРИБОРЫ ОКРУГЛЯЮТСЯ ЗДЕСЬ, И ЭТО НЕ КОСМЕТИКА.
 *
 * По этим же округлённым числам считается ключ, которым доклад давится от
 * дребезга (`pilotStatusKey`): высота, шевельнувшаяся на сантиметр, не должна
 * будить перерисовку. Округлять в двух местах порознь значило бы завести два
 * мнения о том, изменилось ли показание.
 */
export function rotorcraftPilotStatusOf(
  input: RotorcraftPilotStatusInput,
): RotorcraftPilotStatus {
  const { pilot, nose, forward, position, velocity, attitude } = input;
  // Курс в градусах. Поворот носа в мир делает вызывающий общим
  // `rotateVector`: заводить здесь второе мнение о повороте незачем.
  const heading =
    ((Math.atan2(forward[0], -forward[2]) * 180) / Math.PI + 360) % 360;
  const motorOutput = input.motorOutput.map(
    (value) => Math.round(value * 100) / 100,
  );
  return {
    mode: pilot.mode,
    targetAltitude: Math.round(pilot.targetAltitude * 10) / 10,
    currentAltitude: Math.round(position[1] * 10) / 10,
    verticalSpeed: Math.round(velocity[1] * 10) / 10,
    groundSpeed: Math.round(Math.hypot(velocity[0], velocity[2]) * 10) / 10,
    heading,
    pitch: attitude.pitch,
    roll: attitude.roll,
    sensorAssistEnabled: pilot.sensorAssistEnabled,
    landingReady: pilot.landingStableSeconds >= LANDING_READY_SECONDS,
    proximity: rotorcraftProximitySectors(
      nose,
      input.obstacleReadings,
      input.intervenedSensors,
    ),
    motorOutput,
    motorAvailability: (
      input.propulsionFeedback ?? motorOutput.map(() => 0)
    ).map((value) => Math.round(value * 100) / 100),
  };
}

/**
 * КЛЮЧ ПРОТИВ ДРЕБЕЗГА, выведенный ИЗ ДОКЛАДА, а не собранный рядом с ним.
 *
 * Угол в ключе огрубляется до градуса намеренно: крен, дрожащий в сотых долях
 * радиана, — это нормальная жизнь винтокрылой машины, а не новость для
 * приборной доски. Прежняя редакция собирала этот список параллельно докладу,
 * из тех же величин, но своим кодом: два списка одних и тех же полей
 * расходятся при первой же правке одного из них.
 */
export function pilotStatusKey(status: RotorcraftPilotStatus): string {
  return JSON.stringify([
    status.mode,
    status.targetAltitude,
    status.currentAltitude,
    status.verticalSpeed,
    status.groundSpeed,
    Math.round(status.heading),
    Math.round((status.pitch * 180) / Math.PI),
    Math.round((status.roll * 180) / Math.PI),
    status.sensorAssistEnabled,
    status.landingReady,
    status.proximity,
    status.motorOutput,
    status.motorAvailability,
  ]);
}
