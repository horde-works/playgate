export type AirportPoint2 = readonly [x: number, z: number];

/**
 * Authored, non-radial shoreline. The long east-west shoulders belong to the
 * runway; the wider northern waist carries the terminal and landside loop.
 */
export const ISLAND_AIRPORT_SHORELINE: readonly AirportPoint2[] = [
  [-118, -19],
  [-113, -42],
  // ── ЮЖНОЕ РАСШИРЕНИЕ ПОД ВТОРУЮ ПОЛОСУ (вердикт Igor, 15.08.2026) ──────
  //
  // Остров отвоёвывает у воды пояс под ВПП 08 и рулёжную схему: после
  // посадки на 09 самолёт сруливает НАЛЕВО (терминал — по правому крылу),
  // прокатывается по 08 обратным курсом и финальным доворотом встаёт на
  // стартовую точку 09 носом на восток — готовым к следующему вылету.
  // Кромка держит нерадиальный характер берега; до кромки плиты 08 (z=−73)
  // всюду не меньше восьми метров насыпи.
  [-112, -68],
  [-103, -84],
  [-64, -86],
  [-28, -83],
  [8, -86],
  [46, -84],
  [88, -82],
  [106, -66],
  [108, -37],
  [119, -15],
  [116, 13],
  [104, 35],
  [80, 49],
  [42, 56],
  [4, 54],
  [-34, 57],
  [-72, 51],
  [-101, 38],
  [-116, 17],
] as const;

/**
 * КОНВЕРТ МИРА РАЗДВИНУТ ПОД КРЫЛАТУЮ МАШИНУ, А ЗЕМЛЯ — НЕТ.
 *
 * Четыре величины живут отдельно и меняются по отдельности (§8 контракта
 * машин). Земля осталась прежней: остров не растёт, чтобы спрятать ошибку
 * трассы. Границу игрока тоже не двигали — ходить дальше по-прежнему некуда.
 *
 * Выросли ровно две, и обе от ТРАССЫ, а не от вкуса:
 *
 *   - `skyRadius` обязан накрыть самую дальнюю точку трассы. У DC-3 это
 *     1799 м, и число это выведено, а не выбрано: глиссада 4° с 42 м требует
 *     596 м прямой, ПЕРЕД ней идёт горизонтальная площадка 700 м (иначе
 *     боковой контур не успевает сойтись до начала снижения и машина садится
 *     рядом с бетоном — замер дал двенадцать метров при полуширине семь), а
 *     войти в этот створ можно только развернувшись на него, то есть уйдя
 *     ещё дальше на запад. Плюс запас на габарит и на упавшего за борт
 *     пассажира;
 *   - `cameraFar` обязан показать машину с противоположной стороны круга,
 *     то есть примерно два радиуса плюс глубина неба.
 *
 * Меньший конверт означал бы либо круг, не помещающийся в небо, либо
 * глиссаду под конверт вместо глиссады под машину.
 */
export const AIRPORT_WORLD = {
  center: [0, 0] as const,
  // Южный пояс: земля выросла под ВПП 08 (кромка берега до z=−85).
  halfExtents: [122, 88] as const,
  radius: 134,
  boundaryRadius: 166,
  skyRadius: 2250,
  cameraFar: 4700,
} as const;

export const AIRPORT_RUNWAY = {
  centreZ: -22,
  /**
   * ПОЛОСА ПРОДЛЕНА НА ЗАПАД ПОД НЕДОЛЁТ (вердикт Igor, 15.08.2026): глиссаду
   * не трогаем, запас берём бетоном. Колёса пересекали старую западную кромку
   * на 0.3 м — любой разброс касания цеплял ступеньку плиты (полоса поднята
   * на 0.29 м над грунтом), и машина ломалась о край. Теперь кромка на 44 м
   * раньше точки прицеливания: колёса проходят её на 0.73 м.
   */
  length: 192,
  width: 14,
  centreX: -8,
  westThresholdX: -104,
  eastThresholdX: 88,
  thresholdInset: 7,
  /** Painted 09 / 27 block. The DC-3 hold sits on 09, nose east. */
  westDesignatorX: -66,
  eastDesignatorX: 66,
  /** Slab centre height; top is this plus half of `surfaceHeight`. */
  surfaceY: 0.18,
  surfaceHeight: 0.22,
} as const;

export const AIRPORT_RUNWAY_TOP_Y =
  AIRPORT_RUNWAY.surfaceY + AIRPORT_RUNWAY.surfaceHeight / 2;

/**
 * ВПП 08 — вторая полоса в южном поясе, обратная дорожка посадочной схемы.
 *
 * Оси разнесены на 44 м: наземный разворот DC-3 на рулении — около 20 м
 * радиуса, связки-перемычки вписываются дугами с полуторным запасом. Полоса
 * повторяет главную по длине и ширине — остров-аэропорт растёт возможностями
 * (и будущими столкновениями), а не декорацией. Огней у 08 нет намеренно:
 * это дневная рулёжная полоса, её бюджет света — ноль.
 */
export const AIRPORT_RUNWAY_08 = {
  centreZ: -66,
  length: AIRPORT_RUNWAY.length,
  width: AIRPORT_RUNWAY.width,
  centreX: AIRPORT_RUNWAY.centreX,
  westThresholdX: AIRPORT_RUNWAY.westThresholdX,
  eastThresholdX: AIRPORT_RUNWAY.eastThresholdX,
  westDesignatorX: AIRPORT_RUNWAY.westDesignatorX,
  eastDesignatorX: AIRPORT_RUNWAY.eastDesignatorX,
  surfaceY: AIRPORT_RUNWAY.surfaceY,
  surfaceHeight: AIRPORT_RUNWAY.surfaceHeight,
} as const;

/** Перемычки между 09 и 08: сруливание после пробега и выход к старту. */
export const AIRPORT_TAXI_LINKS = {
  /** Восточная — съезд с 09 после пробега (стоп в районе x≈27…40). */
  eastX: 44,
  /** Западная — с 08 к стартовой точке 09 (порог и берт −66). */
  westX: -88,
  /**
   * Ширина 24 — в 1.7 раза шире полосы (вердикт Igor, 15.08.2026): дуга
   * хвоста при якорном развороте — 11.8 м от вершины, и в полуширине 12 она
   * умещается целиком, с кромкой мощения колесо больше не встречается. Кромка
   * здесь — не бордюр, а ОБРЫВ в 15 см (плита 0.29, трава 0.14): сползшее
   * колесо — толчок, крен и разгрузка стойки.
   */
  width: 24,
} as const;

export const AIRPORT_APRON = {
  centre: [15, 0.5] as const,
  width: 76,
  depth: 22,
  stands: [
    { id: "01", x: -2, clearSpan: 32, role: "heritage" },
    { id: "02", x: 31, clearSpan: 20, role: "utility" },
  ] as const,
} as const;

export const AIRPORT_TAXIWAY = {
  centre: [18, -12.75] as const,
  length: 4.5,
  width: 16,
} as const;

export const AIRPORT_FUEL_FARM = {
  centre: [88, 27] as const,
  tankXs: [82.5, 88, 93.5] as const,
  minX: 77,
  maxX: 99,
  minZ: 22.5,
  maxZ: 31.5,
} as const;

export const AIRPORT_TERMINAL = {
  origin: [8, 0.36, 20] as const,
  width: 52,
  depth: 20,
  wallTop: 6.3,
  roofTop: 6.59,
  bayCount: 8,
  bayWidth: 6.5,
  airsideZ: 10,
  landsideZ: 30,
} as const;

export const AIRPORT_CONTROL_TOWER = {
  centre: [39, 17] as const,
  shaftWidth: 6,
  shaftDepth: 6,
  cabFloor: 10.8,
  cabHeight: 3.05,
  roofY: 13.85,
} as const;

export function airportPointInShoreline(x: number, z: number): boolean {
  let inside = false;
  for (
    let current = 0, previous = ISLAND_AIRPORT_SHORELINE.length - 1;
    current < ISLAND_AIRPORT_SHORELINE.length;
    previous = current, current += 1
  ) {
    const [cx, cz] = ISLAND_AIRPORT_SHORELINE[current];
    const [px, pz] = ISLAND_AIRPORT_SHORELINE[previous];
    const crosses = (cz > z) !== (pz > z) &&
      x < ((px - cx) * (z - cz)) / (pz - cz) + cx;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function airportDistanceToShoreline(x: number, z: number): number {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ISLAND_AIRPORT_SHORELINE.length; index += 1) {
    const [ax, az] = ISLAND_AIRPORT_SHORELINE[index];
    const [bx, bz] = ISLAND_AIRPORT_SHORELINE[(index + 1) % ISLAND_AIRPORT_SHORELINE.length];
    const dx = bx - ax;
    const dz = bz - az;
    const denominator = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / denominator));
    closest = Math.min(closest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return closest;
}

export function airportInsideRectangle(
  x: number,
  z: number,
  centreX: number,
  centreZ: number,
  width: number,
  depth: number,
  margin = 0,
): boolean {
  return Math.abs(x - centreX) <= width / 2 + margin &&
    Math.abs(z - centreZ) <= depth / 2 + margin;
}
