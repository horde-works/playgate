/**
 * ОСТРОВ — ПРЕПЯТСТВИЕ, А НЕ ДЕКОРАЦИЯ.
 *
 * Наблюдение Igor (12.08.2026):
 *
 * > RAX охотно в манёврах уходит ниже уровня острова. Это может не быть
 * > проблемой, пока он за пределами, но он часто либо уходит под остров и
 * > больше не может подняться (остров над головой), либо цепляется за край и
 * > не знает, что делать. То, что для него лететь ниже нуля в норме
 * > одновременно с неизбеганием статических препятствий, — это всё
 * > деградирует логику коптеров.
 *
 * ЧТО ЗДЕСЬ ЛЕЧИТСЯ И ЧТО НЕТ. Это не облёт статики: поля расстояний и
 * планировщика тут нет и не нужно. Машину губит не «не облетает башню», а
 * «летает под островом» — а остров это один диск, и он описывается тремя
 * числами. Ниже палубы ЗА пределами острова остаётся законным: так прямо и
 * сказано, и отнимать у машины половину пространства ради одного случая
 * значило бы вернуть «позу как закон», которую мы только что сняли.
 *
 * ТРИ СЛУЧАЯ, И ТРЕТИЙ ВАЖНЕЕ ДВУХ ПЕРВЫХ:
 *
 *  1. НИЖЕ ПОЛА ВНУТРИ ОСТРОВА, но выше палубы — набирать высоту. Обычный пол.
 *  2. ЗА КРОМКОЙ, НИЖЕ ПОЛА, ИДЁТ ВНУТРЬ — набирать заранее, с тем темпом, что
 *     нужен, чтобы успеть к кромке. Пол, объявленный только «внутри», машина
 *     пересечёт снизу и упрётся в кромку — ровно то, что Igor и наблюдал.
 *  3. ПОД ОСТРОВОМ — уходить В СТОРОНУ, а не вверх. Здесь набор высоты
 *     смертелен: над машиной твёрдое тело. Это тот же закон, что у расхождения
 *     у палубы, — нельзя уступать дорогу в грунт, — только вывернутый.
 *
 * Модуль чистый: ни React, ни Rapier, ни имён машин. На входе положение и
 * скорость, на выходе желаемые скорости.
 */

import type { SceneVector3 } from "./destructionScene.ts";

/** Остров тремя числами: где он, какой ширины и на какой высоте его палуба. */
export interface WorldIsland {
  /** Центр диска в плане, [x, z]. */
  readonly centre: readonly [number, number];
  readonly radius: number;
  /** Высота палубы — верхней поверхности, по которой машины ходят. */
  readonly deck: number;
}

export interface WorldEnvelope {
  /**
   * Запас над палубой, ниже которого над островом лететь нельзя. Не «высота
   * маршрута»: это пол, за которым начинается беда, а не рабочая высота.
   */
  readonly clearance: number;
  /**
   * Насколько глубоко под палубой машина считается УЖЕ ПОД ОСТРОВОМ. Небольшая
   * величина: у кромки палуба не бесконечно тонкая, и машина, чуть провалившись
   * под её уровень у самого края, ещё имеет над собой небо.
   */
  readonly underDepth: number;
  /**
   * Полоса за кромкой, в которой машина уже обязана думать о ней, м. Дальше
   * острова нет и пола нет.
   */
  readonly reach: number;
  /** Располагаемая скороподъёмность, м/с: по ней решается «успею ли». */
  readonly climbRate: number;
}

export const DEFAULT_WORLD_ENVELOPE: WorldEnvelope = {
  // Двенадцать метров — та же высота отрыва от палубы, которой живут трассы:
  // ниже неё над островом машине делать нечего ни на маршруте, ни в бою.
  clearance: 12,
  // Три метра под палубой — это уже не «задел кромку», а «зашёл снизу».
  underDepth: 3,
  // Сорок метров запаса: на скоростях полигона это три секунды, и набор
  // успевает быть манёвром, а не рывком.
  reach: 40,
  climbRate: 8,
};

export interface WorldFloorInput {
  /** Мировой центр машины. */
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  readonly island: WorldIsland;
  readonly envelope?: WorldEnvelope;
}

export interface WorldFloorAvoidance {
  /** Желаемая вертикальная скорость, м/с. Положительная — вверх. */
  readonly climb: number;
  /** Желаемая скорость ОТ центра острова, м/с. */
  readonly outward: number;
  /** Срочность 0..1: чем ближе беда, тем сильнее поправка. */
  readonly urgency: number;
  /** Что именно происходит — для разбора и телеметрии. */
  readonly reason: "above" | "approaching" | "under";
}

const EPSILON = 1e-6;

/**
 * НУЖНО ЛИ ЧТО-ТО ДЕЛАТЬ С ПОЛОМ МИРА — и что именно.
 *
 * `null` означает «машина в порядке»: либо она выше пола, либо острова рядом
 * нет вовсе. Молчание здесь — самый частый ответ, и это правильно: конверт не
 * ведёт машину, он её только не пускает.
 */
export function worldFloorAvoidance(
  input: WorldFloorInput,
): WorldFloorAvoidance | null {
  const envelope = input.envelope ?? DEFAULT_WORLD_ENVELOPE;
  const island = input.island;
  const dx = input.centre[0] - island.centre[0];
  const dz = input.centre[2] - island.centre[1];
  const distance = Math.hypot(dx, dz);
  const floor = island.deck + envelope.clearance;
  const height = input.centre[1];
  if (height >= floor) {
    return null;
  }
  if (distance > island.radius + envelope.reach) {
    // Острова рядом нет. Ниже палубы здесь законно и красиво.
    return null;
  }
  // Наружу — единичный вектор от центра острова. У самого центра направления
  // нет; тогда любое, лишь бы определённое.
  const outwardX = distance > EPSILON ? dx / distance : 1;
  const outwardZ = distance > EPSILON ? dz / distance : 0;
  const radialSpeed = input.velocity[0] * outwardX + input.velocity[2] * outwardZ;

  // СЛУЧАЙ ТРЕТИЙ, И ОН ПЕРВЫЙ ПО ВАЖНОСТИ: машина под островом. Вверх нельзя
  // — там тело. Единственный выход наружу, и торопиться с ним тем сильнее, чем
  // глубже машина забралась под диск.
  if (
    distance < island.radius &&
    height < island.deck - envelope.underDepth
  ) {
    const depth = island.deck - height;
    return {
      climb: 0,
      outward: envelope.climbRate,
      // Половина срочности — уже за то, что машина под островом; остальное
      // растёт с глубиной и упирается в единицу метрах на двадцати пяти. Без
      // запаса шкалы первый же случай насыщал её целиком, и «глубже» переставало
      // что-либо значить.
      urgency: Math.min(1, 0.5 + depth / (envelope.clearance * 4)),
      reason: "under",
    };
  }

  const shortfall = floor - height;
  if (distance <= island.radius) {
    // Над островом, но ниже пола. Обычный набор; срочность — доля недобора.
    return {
      climb: envelope.climbRate,
      outward: 0,
      urgency: Math.min(1, shortfall / envelope.clearance),
      reason: "above",
    };
  }

  // За кромкой и ниже пола. Пока машина уходит или идёт вдоль — это её право.
  const closing = -radialSpeed;
  if (closing <= EPSILON) {
    return null;
  }
  // СКОЛЬКО ОСТАЛОСЬ ДО КРОМКИ и хватит ли этого на набор. Вопрос ставится
  // именно так, а не «далеко ли до кромки»: машине важно не расстояние, а
  // успевает ли она подняться, идя с этим ходом.
  const secondsToRim = (distance - island.radius) / closing;
  const neededRate = shortfall / Math.max(0.5, secondsToRim);
  if (neededRate <= envelope.climbRate) {
    return {
      climb: neededRate,
      outward: 0,
      urgency: Math.min(1, neededRate / envelope.climbRate),
      reason: "approaching",
    };
  }
  // Не успевает. Значит идти внутрь нельзя вовсе: набирать И отворачивать.
  return {
    climb: envelope.climbRate,
    outward: closing,
    urgency: 1,
    reason: "approaching",
  };
}
