import type { BreakableMaterial, SceneVector3 } from "./destructionScene";

/**
 * ШОВ КЛАДКИ КРЕПОСТИ И СВЯЗУЮЩЕЕ, КОТОРОЕ ЕГО ЗАКРЫВАЕТ.
 *
 * Крепость сложена из блоков, между которыми оставлен настоящий воздушный шов:
 * так кладка читается кладкой, а не одной вылитой глыбой. Закрывает шов не
 * геометрия, а рендер — блок рисуется шире паспорта на `EXPANSION`, и
 * связующее смыкается поверх зазора (`IntactBreakableWorld.pieceRenderExpansion`).
 * Коллайдеры остаются на паспортном размере, поэтому разрушение видит настоящие
 * блоки, а не сросшуюся стену.
 *
 * ИНВАРИАНТ, РАДИ КОТОРОГО ОБА ЧИСЛА ЛЕЖАТ ЗДЕСЬ РЯДОМ:
 *
 *      EXPANSION > JOINT
 *
 * Стоит шву обогнать связующее — и он открывается насквозь по всей длине блока.
 * Так и было у кроны тёмной башни: её собрали со швом 55 мм при связующем в
 * 52 мм, и в кладке остались щели в 3 мм высотой в блок и длиной 7.5 м. Число
 * шва теперь одно на всю крепость и берётся отсюда, а не набирается руками в
 * каждом генераторе.
 *
 * ЧТО СЮДА НЕ ВХОДИТ. Связующее — приём КЛАДКИ. Настил (пол, кровля, палуба)
 * швов не имеет и мостится встык: у него нет чего закрывать, а расширение на
 * 52 мм превращает стык двух плит в полосу, где две копланарные грани спорят за
 * пиксели. Полы тёмной башни как раз унаследовали связующее по общему префиксу
 * и дали 254 спорных стыка на поверхности, по которой ходят. Отсюда явный
 * список исключений ниже — и он про смысл детали, а не про её материал.
 */
export const SILICATE_JOINT = 0.03;
export const SILICATE_JOINT_EXPANSION = 0.052;

/**
 * Кладка крепости по группам. Список явный, потому что под теми же
 * идентификаторами живут и не-кладка: хребты, осыпь, скальные выходы —
 * это порода, у неё швов нет; таран и его галерея — машина.
 */
const MASONRY_GROUPS: readonly string[] = [
  "stronghold:dark-tower:",
  "stronghold:gatehouse:",
  "stronghold:wall:",
  "stronghold:berth:",
];

/** Настил: мостится встык, связующего не получает (см. шапку). */
const DECKING = /:(floor|roof|deck):/;

export function hasSilicateJoints(
  sourceId: string,
  material: BreakableMaterial,
): boolean {
  if (material !== "basalt" && material !== "graphiteStone") {
    return false;
  }
  if (DECKING.test(sourceId)) {
    return false;
  }
  return MASONRY_GROUPS.some((group) => sourceId.startsWith(group));
}

export function silicateJointBand(size: SceneVector3): number {
  const longestSide = Math.max(size[0], size[1], size[2]);
  return Math.max(0.0025, Math.min(0.015, 0.013 / longestSide));
}

export function silicateJointTint(baseColor: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(baseColor);
  if (!match) {
    return "#465157";
  }

  const value = Number.parseInt(match[1], 16);
  const source = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const mineral = [32, 38, 42];
  const mixed = source.map((channel, index) =>
    Math.round(channel * 0.35 + mineral[index] * 0.65),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
