/**
 * ПЛИТА, А НЕ КУБ.
 *
 * Оболочка авторится тонкой: обшивка боевого коптера — 7.8 мм металла, кровля
 * мельницы — 4.5 см тростника. Решётка повреждения таких толщин не имеет и
 * иметь не может: её клетка выбирается по бюджету тела и составляет 9–65 см.
 * Одна клетка — это «здесь есть материал», а не «здесь материала на всю
 * клетку».
 *
 * До сих пор обрубок рисовался и сталкивался ИМЕННО клетками. Корпус, у
 * которого скорлупа тоньше сантиметра, после первой же воронки превращался в
 * связку кубов по 14 см и раздувался в восемнадцать раз поперёк обшивки —
 * компактная машина мгновенно становилась рыбой-шаром. Массу это не ломало
 * (её выправляет volumeScale), а силуэт ломало полностью.
 *
 * `volumeScale` и есть недостающее число. Он равен отношению материала к
 * геометрии решётки, а для оболочки в один слой клеток это ровно отношение
 * толщины к клетке. Поэтому коробку достаточно сжать по ТОЙ оси, вдоль
 * которой она занимает одну клетку: остальные две идут вдоль поверхности и
 * ужимать их нельзя — это разорвёт обшивку на редкие точки.
 *
 * Центр коробки не меняется: авторская поверхность проходит серединой клетки,
 * и плита обязана лечь на неё, а не на её край.
 */

export interface ShellPlateBox {
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

/** Ниже этого плита вырождается: z-fighting в рендере, дрожь в контакте. */
const MINIMUM_PLATE_THICKNESS = 0.008;

export function shellPlateBoxes(
  boxes: readonly ShellPlateBox[],
  cellSize: readonly [number, number, number] | undefined,
  volumeScale: number | undefined,
): readonly ShellPlateBox[] {
  // Сплошное тело: решётка и есть материал, ужимать нечего. Только у оболочки
  // volumeScale меньше единицы — она и отличает одно от другого.
  if (!cellSize || volumeScale === undefined || volumeScale >= 1) {
    return boxes;
  }

  let changed = false;
  const plates = boxes.map((box) => {
    // У ОБОЛОЧКИ НЕТ ОБЪЁМНЫХ КУСКОВ. Даже блок в две-три клетки толщиной —
    // это не монолит, а сложенная вдвое обшивка или сошедшиеся поверхности:
    // рисовать его кубом значит вернуть ту же рыбу-шар в складках корпуса.
    // Сжимается самая тонкая ось, поэтому пятно плиты остаётся прежним, а
    // суммарный нарисованный объём сходится с авторским материалом.
    let thinAxis: 0 | 1 | 2 = 0;
    for (const axis of [1, 2] as const) {
      if (box.size[axis] < box.size[thinAxis]) {
        thinAxis = axis;
      }
    }

    const thickness = Math.max(
      MINIMUM_PLATE_THICKNESS,
      box.size[thinAxis] * volumeScale,
    );
    if (thickness >= box.size[thinAxis]) {
      return box;
    }
    changed = true;
    const size: [number, number, number] = [...box.size] as [
      number,
      number,
      number,
    ];
    size[thinAxis] = thickness;
    return { ...box, size };
  });

  return changed ? plates : boxes;
}
