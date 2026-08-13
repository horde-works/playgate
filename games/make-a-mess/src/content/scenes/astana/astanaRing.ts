// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Эстакада кольца ЛРТ — первое сооружение острова и его скелет.
//
// Референс просмотрен (ночной кадр на Кабанбай батыра, дневная стройка у
// ЭКСПО, проектный рендер). Фирменные черты, без которых линия не она:
//   1. опора-«гриб»: ствол книзу сужается, кверху раскрывается двумя ветвями
//      с аркой между ними, поверх — ригель шире ствола;
//   2. коробчатая балка с наклонными боками и консольными свесами, снизу
//      ритм поперечных диафрагм;
//   3. парапет-жалюзи: вертикальные пластины шагом 0.4 м — самая узнаваемая
//      деталь линии, читается издалека сплошной полосой;
//   4. деформационный шов над каждой опорой;
//   5. светильники под балкой у опор, направленные вниз на проезд;
//   6. кабельный лоток по внутренней стороне парапета.
//
// Над долиной Есиля опор нет: там пролёты моста, и это видно с земли.

import type { MutableGroup } from "./astanaAuthoring.ts";
import { groundSeatBox, primitive } from "./astanaAuthoring.ts";
import { groundUnder } from "./astanaShell.ts";
import {
  RING_PATH_LENGTH,
  insideValley,
  onRingStraight,
  ringBalises,
  ringPathPoint,
  ringPierDistances,
} from "./astanaPlan.ts";

/**
 * Опор на кольце: пять на каждую дугу и четыре на каждую станционную
 * вставку, по четырём секторам — тридцать шесть. Число выводится из разметки,
 * а не пишется рядом с ней: разошедшаяся копия однажды уже развалила тест.
 */
export const RING_BAYS = ringPierDistances().length;
/** Низ балки над грунтом суши. */
export const GIRDER_CLEARANCE = 8.5;
/** Отметка низа балки — одна на всё кольцо, включая пролёты над долиной. */
export const RING_DECK_Y = 0.05 + GIRDER_CLEARANCE;
export const GIRDER_HEIGHT = 2;
/** Верх плиты пути. Отсюда считают всё, что живёт на путях. */
export const TRACK_TOP = RING_DECK_Y + GIRDER_HEIGHT + 0.28;
/** Головка рельса: по ней катится колесо. */
export const RAIL_HEAD = TRACK_TOP + 0.16;
/**
 * Пол платформы. Отметка задана вагоном: пол вагона на 1.10 м над головкой
 * рельса, платформа на два сантиметра ниже — посадка в один шаг, без ступени
 * и без порога. Число живёт здесь, а не в станции: на него смотрят и опоры
 * (портальная рама должна дотянуться), и станция, и сам состав.
 */
export const PLATFORM_Y = RAIL_HEAD + 1.08;
const GIRDER_WIDTH = 5.6;
const DECK_WIDTH = 8.6;
const PARAPET_PITCH = 0.4;
const PARAPET_HEIGHT = 1.1;
const TRACK_GAUGE = 1.435;

const CONCRETE = "#d3d5d9";
const CONCRETE_SHADE = "#c2c5c9";
const CONCRETE_DEEP = "#b0b4b8";
const PARAPET = "#e3e5e9";
const STEEL_RAIL = "#6f7375";
const IRON = "#4f5457";

export interface RingBay {
  readonly index: number;
  /** Пройденный путь до опоры. */
  readonly distance: number;
  /** Направление пути в этой точке, радианы (0 = +x). */
  readonly angle: number;
  readonly point: readonly [number, number];
  /** Опора стоит на прямой станционной вставке. */
  readonly onStraight: boolean;
  /** Под опорой долина реки: вместо «гриба» встаёт мостовой бык. */
  readonly overValley: boolean;
}

/** Разметка пролётов кольца: где стоят опоры и какие из них речные. */
export function ringBays(): readonly RingBay[] {
  const distances = ringPierDistances();
  return distances.map((distance, index) => {
    const point = ringPathPoint(distance);
    const next = ringPathPoint(distance + 0.5);
    const previous = ringPathPoint(distance - 0.5);
    // Ригель разворачивается поперёк ПУТИ, а не по радиусу: на прямой
    // вставке радиус и путь расходятся.
    const angle = Math.atan2(
      next[1] - previous[1],
      next[0] - previous[0],
    ) + Math.PI / 2;
    return {
      index,
      distance,
      angle,
      point,
      onStraight: onRingStraight(distance),
      overValley: insideValley(point[0], point[1]),
    };
  });
}

/** Поворот вокруг Y, переводящий локальный +X в направление (dx, dz). */
function yawAlong(dx: number, dz: number): readonly [number, number, number] {
  return [0, Math.atan2(-dz, dx), 0];
}

/**
 * Опора-«гриб». Ствол собран тремя секциями с расширением кверху, две ветви
 * расходятся из его головы и образуют арку, ригель ложится поперёк пути.
 */
function createPier(
  piers: MutableGroup,
  index: number,
  x: number,
  z: number,
  angle: number,
  inValley = false,
  onStraight = false,
): void {
  const base = groundUnder(x, z).top;
  const top = RING_DECK_Y;
  // Ригель идёт поперёк пути, значит его длинная сторона — по радиусу.
  const across = yawAlong(Math.cos(angle), Math.sin(angle));
  const along = yawAlong(-Math.sin(angle), Math.cos(angle));
  const id = (suffix: string) => `pier:${index}:${suffix}`;

  primitive(piers, id("footing"), "concrete", "stoneBlock",
    [x, base - 0.35, z], [4.6, 1.4, 4.6], CONCRETE_DEEP,
    { rotation: across, bearingArea: 12,
      contactBoxes: [groundSeatBox(base - 0.35, [4.6, 1.4, 4.6], base)] });

  if (onStraight) {
    // Портальная (straddle) опора станции: две колонны по сторонам и широкий
    // поперечный ригель, который несёт и путевые балки, и платформу. Так это
    // и делают на эстакадных станциях — одна общая рама, а не путь отдельно
    // и платформа отдельно.
    //
    // Смещения считаются по вектору К ЦЕНТРУ острова: платформа всегда на
    // внутренней стороне кольца, и рама должна вылетать именно туда.
    const capHeight = 1;
    const height = top - capHeight - base;
    const radius = Math.hypot(x, z);
    const inwardX = -x / radius;
    const inwardZ = -z / radius;
    const platformReach = 8.4;
    const legs: readonly (readonly [string, number])[] = [
      ["out", -3.2],
      ["in", platformReach - 1.2],
    ];
    for (const [name, offset] of legs) {
      const bx = x + inwardX * offset;
      const bz = z + inwardZ * offset;
      primitive(piers, id(`portal-leg:${name}`), "concrete", "stoneBlock",
        [bx, base + height / 2, bz], [1.15, height, 1.15], CONCRETE,
        { rotation: across, bearingArea: 10, volume: height * 0.5 });
      primitive(piers, id(`portal-foot:${name}`), "concrete", "stoneBlock",
        [bx, base - 0.35, bz], [3.2, 1.2, 3.2], CONCRETE_DEEP,
        { rotation: across, bearingArea: 10,
          contactBoxes: [groundSeatBox(base - 0.35, [3.2, 1.2, 3.2],
            groundUnder(bx, bz).top)] });
    }

    // Стойки платформы: ригель рамы лежит на уровне низа путевых балок, а
    // пол платформы выше — между ними короткие стойки, и они обязаны
    // дотянуться ровно до низа плиты платформы, иначе рама несёт только путь,
    // а платформа стоит сама по себе.
    const platformTop = PLATFORM_Y - 0.36;
    for (const lane of [2.22, 6.42]) {
      const sx = x + inwardX * lane;
      const sz = z + inwardZ * lane;
      primitive(piers, id(`platform-post:${lane > 4 ? "in" : "out"}`), "concrete", "stoneBlock",
        [sx, top + (platformTop - top) / 2, sz],
        [0.7, platformTop - top, 0.7], CONCRETE,
        { rotation: across, bearingArea: 6, volume: 1.4, carriesAttachments: true,
          attachmentSupportMode: "wall", sideAttachmentReach: 1.2 });
    }

    const capOffset = (platformReach - 1.2 - 3.2) / 2;
    primitive(piers, id("portal-cap"), "concrete", "stoneBlock",
      [x + inwardX * capOffset, top - 0.5, z + inwardZ * capOffset],
      [platformReach + 3.4, 1, 2.4], CONCRETE_SHADE,
      { rotation: across, bearingArea: 16, volume: 8, carriesAttachments: true,
        attachmentSupportMode: "wall", sideAttachmentReach: 1.6 });
    for (const side of [-1, 1] as const) {
      primitive(piers, id(`bearing:${side > 0 ? "n" : "s"}`), "steel", "steelSheet",
        [
          x - Math.sin(angle) * side * 0.7,
          top - 0.06,
          z + Math.cos(angle) * side * 0.7,
        ],
        [1.8, 0.12, 0.7], IRON, { rotation: across, bearingArea: 2.4 });
    }
    return;
  }

  if (inValley) {
    // Мостовой бык: в пойме и русле «гриб» неуместен — там стоит массивный
    // столб с ледорезом, как на настоящем переходе через Есиль.
    const height = top - base;
    primitive(piers, id("pylon"), "concrete", "stoneBlock",
      [x, base + height / 2, z], [3.4, height, 4.4], CONCRETE,
      { rotation: across, bearingArea: 9 });
    // Ледорез стоит в русле, и дно под ним ступенькой ниже подошвы быка —
    // отметку его опирания надо брать под ним самим, а не под опорой.
    const cutwaterX = x - Math.sin(angle) * 2.5;
    const cutwaterZ = z + Math.cos(angle) * 2.5;
    const cutwaterBase = groundUnder(cutwaterX, cutwaterZ).top;
    const cutwaterHeight = top - 1.02 - cutwaterBase;
    primitive(piers, id("cutwater"), "concrete", "panel",
      [cutwaterX, cutwaterBase + cutwaterHeight / 2, cutwaterZ],
      [2.2, cutwaterHeight, 1.6], CONCRETE_SHADE,
      { rotation: [0, across[1] + Math.PI / 4, 0], bearingArea: 3 });
    primitive(piers, id("cap"), "concrete", "stoneBlock",
      [x, top - 0.57, z], [DECK_WIDTH - 0.6, 0.9, 3], CONCRETE_SHADE,
      { rotation: across, bearingArea: 7 });
    for (const side of [-1, 1] as const) {
      primitive(piers, id(`bearing:${side > 0 ? "n" : "s"}`), "steel", "steelSheet",
        [
          x - Math.sin(angle) * side * 0.7,
          top - 0.06,
          z + Math.cos(angle) * side * 0.7,
        ],
        [1.8, 0.12, 0.7], IRON, { rotation: across, bearingArea: 2.4 });
    }
    return;
  }

  // Ствол: три секции, книзу уже — «гриб» растёт из земли, а не стоит трубой.
  const shaftHeight = (top - base - 1.02) * 0.62;
  const sections = 3;
  for (let section = 0; section < sections; section += 1) {
    const fraction = section / sections;
    const height = shaftHeight / sections;
    const width = 2.3 + fraction * 0.75;
    primitive(piers, id(`shaft:${section}`), "concrete", "stoneBlock",
      [x, base + height * (section + 0.5), z],
      [width, height + 0.02, width * 0.86], section % 2 === 0 ? CONCRETE : CONCRETE_SHADE,
      { rotation: across, bearingArea: 5.5 });
  }

  // Две ветви: расходятся от головы ствола к краям ригеля, между ними арка.
  //
  // Наклон задаётся третьим эйлером, и он крутит ЛОКАЛЬНЫЙ x к локальному y
  // ДО рыскания — значит знак наклона одинаков по всему кольцу и зависит
  // только от стороны. Прежняя поправка на знак косинуса курса переворачивала
  // ветви на половине кольца: вместо арки они сходились крестом.
  const shoulder = base + shaftHeight;
  const rise = top - 1.02 - shoulder;
  const lean = Math.atan2(1.55, rise);
  const branchLength = Math.hypot(1.55, rise) + 0.1;
  const branchCentre = shoulder + rise / 2;
  // Наклонная деталь опирается ТОРЦАМИ: пятками на голову ствола и темечком
  // под ригель. Габарит пятна в мировых осях наклон раздувает — чтобы низ
  // пятна лёг ровно на голову ствола, отметку считаем от этого габарита.
  const padThickness = 0.24;
  const padWidth = 0.5;
  const padExtent =
    Math.sin(lean) * padWidth + Math.cos(lean) * padThickness;
  const footLocal = (shoulder + padExtent / 2 - branchCentre) / Math.cos(lean);
  const headLocal =
    (top - 1.02 - padExtent / 2 - branchCentre) / Math.cos(lean);
  for (const side of [-1, 1] as const) {
    primitive(piers, id(`branch:${side > 0 ? "r" : "l"}`), "concrete", "panel",
      [
        x + Math.cos(angle) * side * 0.78,
        branchCentre,
        z + Math.sin(angle) * side * 0.78,
      ],
      [1.5, branchLength, 1.9],
      CONCRETE,
      {
        rotation: [0, across[1], -side * lean],
        bearingArea: 3.2,
        contactBearingOrder: true,
        carriesAttachments: true,
        attachmentSupportMode: "cable",
        sideAttachmentReach: 1.4,
        contactBoxes: [
          { position: [0, footLocal, 0], size: [padWidth, padThickness, 1.9] },
          { position: [0, headLocal, 0], size: [padWidth, padThickness, 1.9] },
        ],
      });
  }

  // Ригель шире ствола: на нём лежат две балки соседних пролётов.
  primitive(piers, id("cap"), "concrete", "stoneBlock",
    [x, top - 0.57, z], [DECK_WIDTH - 0.6, 0.9, 2.6], CONCRETE_SHADE,
    { rotation: across, bearingArea: 7, carriesAttachments: true,
      attachmentSupportMode: "cable", sideAttachmentReach: 1.2 });
  // Подферменники: балка садится на них, а не на всю плоскость ригеля.
  for (const side of [-1, 1] as const) {
    primitive(piers, id(`bearing:${side > 0 ? "n" : "s"}`), "steel", "steelSheet",
      [
        x - Math.sin(angle) * side * 0.7,
        top - 0.06,
        z + Math.cos(angle) * side * 0.7,
      ],
      [1.8, 0.12, 0.7], IRON, { rotation: across, bearingArea: 2.4 });
  }

  // Светильник под ригелем, направленный вниз на проезд: он привинчен к низу
  // ригеля, поэтому и в расчёте держится за него, а не висит сам по себе.
  primitive(piers, id("lamp"), "steel", "panel",
    [x, top - 1.06, z], [0.5, 0.16, 0.34], IRON,
    {
      rotation: along,
      bearsLoad: false,
      sideAttachmentReach: 0.5,
      light: { color: "#ffe3b0", distance: 16, intensity: 0.9, position: [0, -0.2, 0] },
    });
}

/**
 * Пролёт: коробчатая балка со свесами и диафрагмами, парапет-жалюзи по обоим
 * краям, путь с контактным рельсом и кабельный лоток.
 */
function createSegment(
  deck: MutableGroup,
  parapets: MutableGroup,
  track: MutableGroup,
  index: string,
  start: readonly [number, number],
  end: readonly [number, number],
  onPierStart: boolean,
  onPierEnd: boolean,
  atStation = false,
): void {
  const [x1, z1] = start;
  const [x2, z2] = end;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const midX = (x1 + x2) / 2;
  const midZ = (z1 + z2) / 2;
  const rotation = yawAlong(dx, dz);
  const deckBottom = RING_DECK_Y;
  const deckTop = deckBottom + GIRDER_HEIGHT;
  const id = (suffix: string) => `span:${index}:${suffix}`;

  // Единица длины вдоль пролёта и поперёк него — дальше всё считается в них.
  const alongX = dx / length;
  const alongZ = dz / length;
  const acrossX = -alongZ;
  const acrossZ = alongX;
  const at = (t: number, offset: number, y: number): readonly [number, number, number] => [
    x1 + alongX * t + acrossX * offset,
    y,
    z1 + alongZ * t + acrossZ * offset,
  ];

  // Коробчатая балка: полая, поэтому масса задана честно, а не габаритом.
  primitive(deck, id("girder"), "concrete", "stoneBlock",
    [midX, deckBottom + GIRDER_HEIGHT / 2, midZ],
    [length, GIRDER_HEIGHT, GIRDER_WIDTH], CONCRETE,
    {
      rotation,
      volume: length * 0.9,
      carriesAttachments: true,
      attachmentSupportMode: "wall",
      // Сегмент над долиной висит между соседями: он берёт нагрузку бортом,
      // а не пяткой, поэтому ему нужен вылет найтовки.
      sideAttachmentReach: onPierStart && onPierEnd ? undefined : 0.6,
      // Полая преднапряжённая коробка работает всем сечением стенок и плит.
      // Шесть условных квадратов хватало для пустого пути, но состав на
      // западной вставке перегружал четыре несущих пролёта. Это расчётное
      // сечение балки, не площадь двух видимых подферменников.
      bearingArea: 16,
      contactBoxes: [
        // Пятки на концах: ими балка садится на подферменники опор.
        { position: [-length / 2 + 0.9, -GIRDER_HEIGHT / 2, 0], size: [1.8, 0.3, 2.2] },
        { position: [length / 2 - 0.9, -GIRDER_HEIGHT / 2, 0], size: [1.8, 0.3, 2.2] },
        // Верхняя плита: на ней лежит путь. Без неё решатель не видит, на что
        // опереть плиту основания, и весь путь висит в воздухе.
        { position: [0, GIRDER_HEIGHT / 2 - 0.15, 0], size: [length, 0.3, GIRDER_WIDTH] },
        // Тело балки: к нему крепятся свесы и диафрагмы.
        { position: [0, 0, 0], size: [length, GIRDER_HEIGHT, GIRDER_WIDTH] },
      ],
    });

  // Консольные свесы: плита выходит за коробку и держит парапет. Секциями по
  // четыре метра — так у каждого носителя свой десяток жалюзи.
  const bays = Math.max(2, Math.round(length / 4.4));
  const bayLength = length / bays;
  for (const side of [-1, 1] as const) {
    for (let bay = 0; bay < bays; bay += 1) {
      primitive(deck, id(`cantilever:${side > 0 ? "out" : "in"}:${bay}`), "concrete", "panel",
        at((bay + 0.5) * bayLength, side * (DECK_WIDTH / 2 - 0.75), deckTop - 0.28),
        // Одна непрерывная плоскость обязана делиться ровно по шагу. Запас
        // 40 мм заставлял каждую пару секций спорить верхними и нижними
        // гранями по всему кольцу.
        [bayLength, 0.56, 1.5], CONCRETE_SHADE,
        { rotation, volume: bayLength * 0.18, carriesAttachments: true,
          attachmentSupportMode: "cable", sideAttachmentReach: 0.5,
          bearingArea: 4 });
    }
  }

  // Диафрагмы: ритм поперечных рёбер, видимый снизу.
  const ribs = Math.max(4, Math.round(length / 3.7));
  for (let rib = 1; rib < ribs; rib += 1) {
    const t = (length * rib) / ribs;
    primitive(deck, id(`rib:${rib}`), "concrete", "panel",
      // Диафрагма входит в коробку прежними 360 мм и той же деталью выступает
      // на 180 мм вниз. Линия врубки скрыта балкой, а видимой нижней гранью
      // владеет только ребро — без потери признанного несущего контакта.
      at(t, 0, deckBottom + 0.09), [0.34, 0.54, GIRDER_WIDTH + 0.1], CONCRETE_DEEP,
      { rotation, bearsLoad: false, volume: 0.6, sideAttachmentReach: 0.4 });
  }

  // Деформационный шов ставится только там, где пролёт кончается опорой.
  if (onPierEnd) {
    primitive(deck, id("joint"), "steel", "steelSheet",
      at(length, 0, deckTop + 0.02), [0.24, 0.1, DECK_WIDTH - 0.4], IRON,
      { rotation, bearsLoad: false, sideAttachmentReach: 0.4 });
  }

  // На станционном пролёте внутреннего парапета НЕТ: там платформа и
  // платформенные двери. Раньше жалюзи стояли ровно в теле платформы и не
  // давали плите сесть на свои балки.
  const innerSide = (() => {
    const probe = at(length / 2, DECK_WIDTH / 2 - 0.14, 0);
    return Math.hypot(probe[0], probe[2]) < Math.hypot(midX, midZ) ? 1 : -1;
  })();

  // Парапет-жалюзи: вертикальные пластины постоянного шага по обоим краям.
  // Пластины нарезаются ВНУТРИ своей секции свеса: на границе секций пластина
  // не находила носителя и повисала — по одной на каждые четыре метра.
  for (const side of [-1, 1] as const) {
    if (atStation && side === innerSide) {
      continue;
    }
    const edge = side * (DECK_WIDTH / 2 - 0.14);
    for (let bay = 0; bay < bays; bay += 1) {
      const plates = Math.max(1, Math.floor((bayLength - 0.3) / PARAPET_PITCH));
      const margin = (bayLength - plates * PARAPET_PITCH) / 2;
      for (let plate = 0; plate < plates; plate += 1) {
        const t = bay * bayLength + margin + (plate + 0.5) * PARAPET_PITCH;
        primitive(
          parapets,
          id(`plate:${side > 0 ? "o" : "i"}:${bay}:${plate}`),
          "plastic",
          "panel",
          at(t, edge, deckTop + PARAPET_HEIGHT / 2),
          [0.07, PARAPET_HEIGHT, 0.42], PARAPET,
          // Вылет найтовки 1.4 м — минимум, при котором держатся пластины у
          // краёв секции: зазор до носителя меряется по его габариту.
          { rotation, bearsLoad: false, volume: 0.006, sideAttachmentReach: 1.4 },
        );
      }
    }
    // Поручень поверх жалюзи и цоколь под ними — без них полоса рассыпается.
    // И то и другое идёт СЕКЦИЯМИ по четыре метра: на цельный двадцатиметровый
    // цоколь решатель навешивает лишь часть пластин, и края пролёта осыпались.
    const sections = bays;
    for (let section = 0; section < sections; section += 1) {
      const sectionLength = bayLength;
      const centre = (section + 0.5) * sectionLength;
      primitive(parapets, id(`kerb:${side > 0 ? "o" : "i"}:${section}`), "concrete", "panel",
        at(centre, edge, deckTop + 0.13), [sectionLength + 0.04, 0.26, 0.4], CONCRETE_SHADE,
        { rotation, carriesAttachments: true, attachmentSupportMode: "cable",
          bearingArea: 3.2, volume: sectionLength * 0.03 });
      primitive(parapets, id(`rail:${side > 0 ? "o" : "i"}:${section}`), "steel", "cylinder",
        at(centre, edge, deckTop + PARAPET_HEIGHT + 0.06),
        [0.09, sectionLength + 0.04, 0.09], "#c9ccce",
        { rotation: [0, rotation[1], Math.PI / 2], bearsLoad: false, volume: 0.08,
          sideAttachmentReach: 0.35 });
    }
  }

  // Путь: бетонное основание, две рельсовые нити и контактный рельс сбоку.
  primitive(track, id("slab"), "concrete", "panel",
    at(length / 2, 0, deckTop + 0.14), [length + 0.04, 0.28, 3.1], CONCRETE_DEEP,
    { rotation, volume: length * 0.24, carriesAttachments: true,
      attachmentSupportMode: "wall" });
  for (const side of [-1, 1] as const) {
    // Рельс НЕСЁТ: по нему катится состав, и это единственная его работа.
    // Пока он был bearsLoad: false, поезду не на что было встать.
    primitive(track, id(`rail:${side > 0 ? "r" : "l"}`), "steel", "panel",
      at(length / 2, side * (TRACK_GAUGE / 2), deckTop + 0.36),
      [length + 0.04, 0.16, 0.08], STEEL_RAIL,
      { rotation, volume: length * 0.02, bearingArea: length * 0.08,
        sideAttachmentReach: 0.3 });
  }
  primitive(track, id("contact-rail"), "steel", "panel",
    at(length / 2, 1.55, deckTop + 0.42), [length + 0.04, 0.13, 0.09], "#8b8f91",
    { rotation, volume: length * 0.02, sideAttachmentReach: 0.9, bearingArea: 0.8,
      carriesAttachments: true, attachmentSupportMode: "cable" });
  primitive(track, id("contact-cover"), "plastic", "panel",
    at(length / 2, 1.55, deckTop + 0.535), [length + 0.04, 0.07, 0.22], "#9b6a3a",
    { rotation, bearsLoad: false, volume: length * 0.02, sideAttachmentReach: 0.3 });

  // Кабельный лоток по внутренней стороне.
  primitive(track, id("cable-tray"), "steel", "panel",
    at(length / 2, -(DECK_WIDTH / 2 - 0.55), deckTop + 0.28),
    [length + 0.04, 0.22, 0.34], IRON,
    { rotation, bearsLoad: false, volume: length * 0.03, sideAttachmentReach: 0.45 });
}

/**
 * Путевые балисы: серые коробки на плите между рельсами. На перегоне редкие,
 * перед каждой станцией — группа из трёх с сокращающимся вдвое шагом и сама
 * точка остановки. По ним состав уточняет позицию, поэтому попадает дверьми
 * в платформенные.
 */
function createBalises(track: MutableGroup): void {
  const bays = ringBays();
  const deckTop = RING_DECK_Y + GIRDER_HEIGHT;

  for (const balise of ringBalises()) {
    // Балиса лежит на ПЛИТЕ ПУТИ, а плита — прямая хорда между опорами.
    // Считая точку по дуге пути, я выводил её наружу от полотна на стрелку
    // пролёта: на перегонах балисы съезжали с плиты.
    let index = 0;
    for (let bay = 0; bay < bays.length; bay += 1) {
      const next = bays[(bay + 1) % bays.length];
      const span = (next.distance - bays[bay].distance + RING_PATH_LENGTH) % RING_PATH_LENGTH;
      const offset = (balise.distance - bays[bay].distance + RING_PATH_LENGTH) % RING_PATH_LENGTH;
      if (offset < span) {
        index = bay;
        break;
      }
    }
    const from = bays[index];
    const to = bays[(index + 1) % bays.length];
    const span = (to.distance - from.distance + RING_PATH_LENGTH) % RING_PATH_LENGTH;
    const t = ((balise.distance - from.distance + RING_PATH_LENGTH) % RING_PATH_LENGTH) / span;
    const x = from.point[0] + (to.point[0] - from.point[0]) * t;
    const z = from.point[1] + (to.point[1] - from.point[1]) * t;
    const rotation = yawAlong(to.point[0] - from.point[0], to.point[1] - from.point[1]);
    const stopPoint = balise.kind === "stop";

    // Форма настоящая: плоский прямоугольник, ДЛИННОЙ стороной поперёк пути,
    // жёлто-охровый. Точка остановки — крупнее и ярче.
    primitive(track, `balise:${balise.id}`, "steel", "panel",
      [x, deckTop + 0.34, z],
      stopPoint ? [0.26, 0.13, 1.05] : [0.22, 0.11, 0.86],
      stopPoint ? "#d8ab2c" : "#b8912c",
      { rotation, bearsLoad: false, volume: 0.02, sideAttachmentReach: 0.5 });
    // Кабель к лотку — балиса не висит сама по себе.
    primitive(track, `balise-cable:${balise.id}`, "steel", "panel",
      [x, deckTop + 0.3, z], [0.07, 0.05, 1.5], "#3f4447",
      { rotation, bearsLoad: false, volume: 0.01, sideAttachmentReach: 0.7 });
  }
}

export function createRingViaduct(
  piers: MutableGroup,
  deck: MutableGroup,
  parapets: MutableGroup,
  track: MutableGroup,
): void {
  const bays = ringBays();

  for (const bay of bays) {
    createPier(
      piers,
      bay.index,
      bay.point[0],
      bay.point[1],
      bay.angle,
      bay.overValley,
      bay.onStraight,
    );
  }

  // Пролёты идут от опоры к опоре, а над долиной сливаются в один длинный —
  // мостовой, без промежуточных опор в пойме.
  //
  // Балка режется на сегменты не больше 12 м: прямая хорда через долину
  // уходила от кольца на 9.7 м, и на её концах парапет отрывался от края
  // плиты. Сегменты идут по ДУГЕ, поэтому эстакада держит радиус везде.
  const standing = bays;
  for (let index = 0; index < standing.length; index += 1) {
    const from = standing[index];
    const to = standing[(index + 1) % standing.length];
    let sweep = to.angle - from.angle;
    if (sweep <= 0) {
      sweep += Math.PI * 2;
    }
    createSegment(
      deck,
      parapets,
      track,
      `${from.index}`,
      from.point,
      to.point,
      true,
      true,
      from.onStraight && to.onStraight,
    );
    void RING_PATH_LENGTH;
  }

  createBalises(track);
}
