// Rapier interaction groups: membership << 16 | filter.
const GROUP_WORLD = 0x0001;
const GROUP_DEBRIS = 0x0002;
const GROUP_ACTOR = 0x0004;
const GROUP_ACTOR_DETAIL = 0x0008;
const GROUP_BOUNDARY = 0x0010;
const GROUP_VEHICLE_QUERY = 0x0020;
const GROUP_VEHICLE = 0x0040;
const GROUP_VEHICLE_ATTACHMENT = 0x0080;

const interactionGroups = (membership: number, filter: number): number =>
  ((membership << 16) | filter) >>> 0;

/**
 * ОБЛОМОК, РОЖДЁННЫЙ ВНУТРИ СВОЕЙ ЖЕ МАШИНЫ.
 *
 * Отломанный член компаунда рождается в ЖИВОЙ позе носителя (см.
 * destruction-lessons §6.3), то есть гарантированно внутри его контактной
 * оболочки: у HX-6 замерено 11–27 коллайдеров носителя на один такой кусок,
 * а взаимопроникновение членов у жёсткой машины намеренное (88 % членов).
 * Это ЕДИНСТВЕННЫЙ случай, которому льгота ещё нужна. Общая льгота на
 * оседание («не сталкиваться с собратьями, пока не разъедемся») отменена: она
 * платила взаимопроникновением — призрак садится в кучу уже вложенным, — и
 * мировой обломок теперь вооружён с рождения. А у члена машины выбора нет,
 * он рождается внутри неё; прежде солвер выталкивал его вместе с носителем,
 * и машина толкалась и кувыркалась.
 *
 * Здесь снят ровно носитель. Всё остальное — мир, игрок, кромка, сенсоры —
 * обязано остаться: кусок, вылетевший из машины, для мира обычный обломок.
 * С собратьями он не сталкивается по той же причине, что и раньше: они
 * рождаются в той же тесноте, что и он.
 */
export const DEBRIS_LEAVING_CARRIER = interactionGroups(
  GROUP_DEBRIS,
  GROUP_WORLD | GROUP_ACTOR | GROUP_BOUNDARY | GROUP_VEHICLE_QUERY,
);

/**
 * Тот же обломок, не сумевший покинуть контур за отпущенное время: он заперт
 * в кольце кожуха или в закрытой гондоле и выйти оттуда не может физически.
 * Со всем остальным миром он уже полноценный обломок, но своей машине он не
 * противник — иначе она вечно вышибала бы его наружу и вечно получала отдачу.
 */
export const DEBRIS_INSIDE_CARRIER = interactionGroups(
  GROUP_DEBRIS,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR | GROUP_BOUNDARY | GROUP_VEHICLE_QUERY,
);

export const DEBRIS_NORMAL = interactionGroups(
  GROUP_DEBRIS,
  GROUP_WORLD |
    GROUP_DEBRIS |
    GROUP_ACTOR |
    GROUP_BOUNDARY |
    GROUP_VEHICLE_QUERY |
    GROUP_VEHICLE,
);

export const ACTOR_NORMAL = interactionGroups(
  GROUP_ACTOR,
  GROUP_WORLD |
    GROUP_DEBRIS |
    GROUP_ACTOR_DETAIL |
    GROUP_BOUNDARY |
    GROUP_VEHICLE |
    GROUP_VEHICLE_ATTACHMENT,
);

/**
 * Пассажир НА ХОДУ по палубе носителя.
 *
 * Отличие от `ACTOR_NORMAL` ровно одно и намеренное: снята граница мира.
 * Кольцо-ограничитель держит пешехода на острове, а улетающий на корабле
 * обязан его пересечь.
 *
 * ВСЁ ОСТАЛЬНОЕ ОБЯЗАНО ОСТАТЬСЯ. Пока отсюда выпадал `GROUP_VEHICLE`,
 * капсула переставала сталкиваться с носителем в тот самый миг, когда его
 * признавали подвижной опорой, — то есть палуба, по которой человек идёт,
 * исчезала у него из-под ног, и он проваливался вниз сквозь корабль.
 * Ощущалось это как «раньше я ехал в его системе отсчёта, а теперь падаю».
 *
 * Сидящий пассажир глушится ИНАЧЕ и отдельно — `setCollisionGroups(0)` на
 * время занятого места, — так что снимать здесь носитель было незачем.
 */
export const ACTOR_ABOARD = interactionGroups(
  GROUP_ACTOR,
  GROUP_WORLD |
    GROUP_DEBRIS |
    GROUP_ACTOR_DETAIL |
    GROUP_VEHICLE |
    GROUP_VEHICLE_ATTACHMENT,
);

export const DEBRIS_ACTOR_DETAIL = interactionGroups(
  GROUP_ACTOR_DETAIL,
  GROUP_ACTOR,
);

/** Player/debris containment. Airborne vehicle sensors deliberately ignore it. */
export const WORLD_BOUNDARY = interactionGroups(
  GROUP_BOUNDARY,
  GROUP_DEBRIS | GROUP_ACTOR,
);

/**
 * Last-resort floor for the player only. Debris and airborne carriers must
 * continue through the visual fog when there is no authored land below them.
 */
export const ACTOR_SAFETY_FLOOR = interactionGroups(
  GROUP_BOUNDARY,
  GROUP_ACTOR,
);

/**
 * ЛЕТЯЩИЙ СНАРЯД. Отличие от `ACTOR_NORMAL` ровно одно и намеренное: снята
 * ГРАНИЦА МИРА.
 *
 * Кольцо-ограничитель и пол безопасности — мебель для ПЕШЕХОДА: одно держит
 * его на острове, другой ловит при падении. Обе невидимы, и обе стояли в
 * фильтре снаряда, потому что снаряд был объявлен «как актёр».
 *
 * Цена замерена глазами Igor: ракеты взрывались в воздухе, сильно не долетая
 * до цели, и небо читалось как барьер с обеих сторон. Так и было — кольцо
 * стоит на радиусе 55, а машины полигона уходят на 144, то есть боевая пара
 * летает СНАРУЖИ ограничителя и стреляет сквозь него. Плита пола на −2
 * ловила то, что летело вниз мимо острова.
 *
 * Членство остаётся `GROUP_ACTOR`: кого снаряд задевает сам, эта правка не
 * меняет — только то, обо что он разбивается.
 */
export const PROJECTILE_FLIGHT = interactionGroups(
  GROUP_ACTOR,
  GROUP_WORLD |
    GROUP_DEBRIS |
    GROUP_ACTOR_DETAIL |
    GROUP_VEHICLE |
    GROUP_VEHICLE_ATTACHMENT,
);

/** Query mask for physical vehicle contacts with structures and debris. */
export const VEHICLE_CONTACT_QUERY = interactionGroups(
  GROUP_VEHICLE_QUERY,
  GROUP_WORLD | GROUP_DEBRIS,
);

/** Dynamic contact body shared by the whole intact carrier. */
export const VEHICLE_CARRIER = interactionGroups(
  GROUP_VEHICLE,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR | GROUP_VEHICLE,
);

/**
 * Authored mechanisms carried by a vehicle have their own pose body but must
 * never become an obstacle to their own compound carrier.
 */
export const VEHICLE_ATTACHMENT = interactionGroups(
  GROUP_VEHICLE_ATTACHMENT,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR,
);
