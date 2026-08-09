import type { SceneVector3 } from "./destructionScene.ts";
import {
  createDuctHexacopterBlueprint,
  createDuctHexacopterVehicleFrame,
  type DuctHexacopterPlacement,
} from "./ductHexacopter.ts";
import { COMBAT_HEXACOPTER_RANGE_SCENE_ID } from "./combatHexacopter.ts";
import {
  RANGE_DECK_TOP_Y,
  RANGE_HEXACOPTER_PAD_X,
  RANGE_HEXACOPTER_PAD_Z,
} from "./rangeHexacopter.ts";

/**
 * ГДЕ СТОИТ VX-8 «Yaqui» НА ПОЛИГОНЕ TONKAWA.
 *
 * Паспорт машины (`ductHexacopter.ts`) берт не выбирает и выбирать не должен —
 * он сам это и говорит: «the berth belongs to the range scene and is chosen by
 * the session that owns placement». Это тот файл. Здесь только координаты и
 * ничего про саму машину.
 *
 * ПОЧЕМУ ИМЕННО ЗДЕСЬ. Вертипад HX-6 стоит на восточном краю диска, в
 * (30, -14); RAX-8 — в центре. VX-8 садится ТРЕТЬИМ, рядом с HX-6 и на том же
 * меридиане: двенадцать метров к югу от него. Три соображения, и все три
 * измеримы:
 *
 *   - от центра до этого берта 39.7 м при суше радиусом 50 — машина стоит на
 *     настиле, а не на кромке;
 *   - показательная программа RAX-8 предупреждает документом полигона: всё
 *     выше нескольких метров ИЛИ ближе тридцати метров к его площадке обязано
 *     быть сверено с трассой. Этот пад — ниже полутора метров и в сорока
 *     метрах, то есть не задевает ни одного из двух условий;
 *   - до вертипада HX-6 двенадцать метров при полуразмахе VX-8 в 3.64 и
 *     радиусе вертипада около 2.9 — между габаритами остаётся пять метров.
 */
export const DUCT_HEXACOPTER_RANGE_PAD_X = RANGE_HEXACOPTER_PAD_X;
export const DUCT_HEXACOPTER_RANGE_PAD_Z = RANGE_HEXACOPTER_PAD_Z - 12;

/** Диск пада: полуразмах машины 3.64 плюс запас на промах при посадке. */
export const DUCT_HEXACOPTER_RANGE_PAD_RADIUS = 6.2;
export const DUCT_HEXACOPTER_RANGE_PAD_THICKNESS = 0.22;

/** Верх пада — на него встают опоры, от него же считается ход амортизатора. */
export const DUCT_HEXACOPTER_RANGE_PAD_TOP_Y =
  RANGE_DECK_TOP_Y + DUCT_HEXACOPTER_RANGE_PAD_THICKNESS;

export const DUCT_HEXACOPTER_RANGE_BERTH: SceneVector3 = [
  DUCT_HEXACOPTER_RANGE_PAD_X,
  DUCT_HEXACOPTER_RANGE_PAD_TOP_Y,
  DUCT_HEXACOPTER_RANGE_PAD_Z,
];

/**
 * Нос — в центр полигона, как и у HX-6 с его западным носом. Считается, а не
 * пишется числом: авторский нос машины смотрит в +Z, поворот на yaw даёт
 * мировое направление (sin yaw, cos yaw), и приравнять его к направлению «на
 * центр» — это ровно `atan2(-x, -z)`. Записанный градусами, он разошёлся бы с
 * бертом при первом же его переносе.
 */
export const DUCT_HEXACOPTER_RANGE_YAW = Math.atan2(
  -DUCT_HEXACOPTER_RANGE_PAD_X,
  -DUCT_HEXACOPTER_RANGE_PAD_Z,
);

/** Своя группа и свой кластер — документ полигона прямо этого и требует. */
export const DUCT_HEXACOPTER_RANGE_GROUP_ID = "duct-vehicle";

export const DUCT_HEXACOPTER_RANGE_PLACEMENT: DuctHexacopterPlacement = {
  sceneId: COMBAT_HEXACOPTER_RANGE_SCENE_ID,
  clusterId: `${COMBAT_HEXACOPTER_RANGE_SCENE_ID}:${DUCT_HEXACOPTER_RANGE_GROUP_ID}`,
  position: DUCT_HEXACOPTER_RANGE_BERTH,
  yaw: DUCT_HEXACOPTER_RANGE_YAW,
};

/**
 * Пульт отправки стоит СНАРУЖИ диска пада, со стороны вертипада HX-6: человек
 * приходит от знакомой площадки и не переступает через опоры машины.
 */
export const DUCT_HEXACOPTER_RANGE_DISPATCH_POINT: SceneVector3 = [
  DUCT_HEXACOPTER_RANGE_PAD_X + 7.4,
  DUCT_HEXACOPTER_RANGE_PAD_TOP_Y + 1,
  DUCT_HEXACOPTER_RANGE_PAD_Z + 3.6,
];

/**
 * ЖИВАЯ МАССА СОБРАННОЙ МАШИНЫ: 20.05 кг.
 *
 * Не оценка и не вкус — замер по тем же кускам и тем же плотностям, которыми
 * считает рантайм (`massProperties` + `structuralMaterialProfiles` над
 * скомпилированным кластером `combat-hexacopter-range:duct-vehicle`; стенд —
 * `tests/duct-hexacopter-range.test.mjs`). Для сравнения RAX-8 весит 9.58 кг:
 * эта машина ровно вдвое тяжелее, что и обещал её более широкий корпус.
 *
 * ЗАЧЕМ ЧИСЛО ЗДЕСЬ. Паспорт (`ductHexacopter.ts`) сам объявил свои пределы
 * ПРЕДЛОЖЕНИЕМ и отдал массу рантайму: «Everything about mass and inertia stays
 * with the runtime by agreement». Это и есть рантайм.
 */
export const DUCT_HEXACOPTER_MEASURED_MASS = 20.05;

/**
 * Способность, к которой прибиты числа ниже. Взята не с потолка: это то, на чём
 * RAX-8 действительно летает в этом же мире (105 Н·6 при 9.58 кг и 125 Н при
 * I_yy = 36.95). Держать вторую машину на той же способности — единственный
 * способ сказать «она летает» до того, как её увидели в воздухе.
 */
export const RAX8_THRUST_TO_WEIGHT = 6.86;
export const RAX8_LATERAL_PER_KILOGRAM = 7.59;
export const RAX8_YAW_ACCELERATION = 8;

/**
 * ПРЕДЕЛЫ, ПЕРЕСЧИТАННЫЕ НА ИЗМЕРЕННУЮ МАССУ.
 *
 * Из паспорта взята ВЫВОДИМОСТЬ, а не числа. Домашнее правило (`sr6-skat`)
 * читает тяговооружённость как `power·6/(m·g)`, а поперечную как `thrust/m`;
 * RAX-8 живёт на 6.86 и 7.59 и летает. Паспорт решал эту же пару в обратную
 * сторону — от чисел к массе — и получил ~11 кг, потому что собранной машины
 * тогда ещё не существовало. Она собралась вдвое тяжелее:
 *
 *   - `enginePower` 124 давал на 20.05 кг тяговооружённость 3.78 — машина
 *     взлетела бы, но вяло и без запаса на манёвр. 225 возвращает 6.86, то
 *     есть РОВНО ту способность, на которой соседняя машина летает свою
 *     программу;
 *   - `lateralThrust` 83 давал 4.1 Н/кг вместо 7.59. 152 возвращает правило.
 *
 * Значения строго положительны намеренно: паспорт предупреждает, что
 * `lateralThrust` ≤ 0 молча выключает авторский курс и предел заноса.
 */
export const DUCT_HEXACOPTER_RANGE_LIMITS = {
  enginePower: 225,
  lateralThrust: 152,
} as const;

/**
 * ТЯГА ТОННЕЛЕЙ, ПРИБИТАЯ К СОБРАННОМУ КЛАСТЕРУ: 541 Н.
 *
 * Паспорт поставил 1030 Н и сам назвал их временными «по порядку величины, а
 * не по проценту», прямо оставив рантайму право прибить число к собранному
 * телу. Его выкладка подтвердилась замером почти в точности: плечо тоннеля
 * 0.980 м на борт (паспорт: 0.980), радиус инерции рыскания 2.57 м (паспорт:
 * 2.60), живая масса 20.05 кг (их ожидание: 18–26).
 *
 * Разошёлся только вывод. При I_yy = 132.7 кг·м² тысяча тридцать ньютонов дают
 * 15.22 рад/с² — ВДВОЕ больше, чем 8.00 рад/с², на которых RAX-8 действительно
 * проходит свой круг. Паспорт выбрал перелёт сознательно («ошибочное в большую
 * сторону читается как перелёт и чинится сразу»), и это чинится сразу: 541 Н
 * дают ровно 8.00 рад/с² — ту же угловую способность, что у машины, про
 * которую в этом мире уже известно, что она летает.
 */
export const DUCT_HEXACOPTER_RANGE_YAW_FAN_FORCE = 541;

/**
 * Машина в мире. Паспорт нарочно НЕ вставляет свой кадр в `vehicleFrames`:
 * «world registration happens only after a berth is chosen, and the berth is
 * not this file's decision». Берт выбран выше — здесь регистрация и делается.
 */
export const ductHexacopterRangeBlueprint = createDuctHexacopterBlueprint(
  DUCT_HEXACOPTER_RANGE_PLACEMENT,
);

export const ductHexacopterRangeFrame = createDuctHexacopterVehicleFrame(
  ductHexacopterRangeBlueprint,
);

/**
 * Тоннели с прибитой тягой. Сила живёт на точке тяги, поэтому прибить её —
 * значит пересобрать список, а не поправить число где-то рядом.
 */
export const ductHexacopterRangeYawThrusters =
  ductHexacopterRangeBlueprint.yawThrusters.map((thruster) => ({
    ...thruster,
    maximumForce: DUCT_HEXACOPTER_RANGE_YAW_FAN_FORCE,
  }));
