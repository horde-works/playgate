/**
 * СВОЙ-ЧУЖОЙ У ВСЕГО, ЧТО ДВИЖЕТСЯ.
 *
 * Признак принадлежит МАШИНЕ, а не карте и не бою: он объявляется в паспорте
 * рядом с остальными её свойствами и читается кем угодно — автоматом боя,
 * жителями, телеметрией. Поэтому здесь нет ни одной ссылки на оружие, цели
 * или конкретную сцену.
 *
 * Отношение враждебности задано СПИСКОМ ИСКЛЮЧЕНИЙ, а не матрицей пар. Матрица
 * растёт квадратом и требует правки при каждом новом клане; правило «разные
 * стороны враждебны, нейтралы не воюют ни с кем» не требует ничего и остаётся
 * читаемым при любом числе сторон.
 *
 * Нейтральность — не «слабость», а ОТСУТСТВИЕ СТОРОНЫ: дирижабль, драккар,
 * автомобиль и поезд возят людей и в чужие счёты не входят. Их нельзя ни
 * атаковать по признаку клана, ни назначить атакующими.
 */

/** Идентификатор стороны. Строка, а не enum: сцены вправе завести свою. */
export type VehicleAllegiance = string;

/**
 * Сторона по умолчанию. Всё, что не объявило принадлежность явно, — мирный
 * транспорт: он не цель и не охотник.
 */
export const CIVIL_ALLEGIANCE: VehicleAllegiance = "civil";

/** Авиация полигона Tonkawa: RAX-8 и всё, что полигон поднимает сам. */
export const TONKAWA_ALLEGIANCE: VehicleAllegiance = "tonkawa";

/** Машины города. На полигоне HX-6 — гость, и именно поэтому он цель. */
export const TOWN_ALLEGIANCE: VehicleAllegiance = "town";

/**
 * Принадлежность объявлена или подразумевается мирной. Отдельная функция
 * нужна затем, чтобы «поле не задано» читалось одинаково у всех потребителей,
 * а не превращалось в `?? "civil"` в каждом месте вызова.
 */
export function allegianceOf(
  source: { readonly allegiance?: VehicleAllegiance } | null | undefined,
): VehicleAllegiance {
  return source?.allegiance ?? CIVIL_ALLEGIANCE;
}

/** Нейтрал не воюет: ни как цель по признаку стороны, ни как охотник. */
export function isNeutralAllegiance(side: VehicleAllegiance): boolean {
  return side === CIVIL_ALLEGIANCE;
}

/**
 * Две стороны враждебны, если они РАЗНЫЕ и ни одна не нейтральна.
 *
 * Симметрично по построению: односторонняя вражда потребовала бы матрицы и
 * немедленно родила бы вопрос «а он знает, что на него охотятся». Здесь
 * ответ один для обеих сторон.
 */
export function isHostileAllegiance(
  side: VehicleAllegiance,
  other: VehicleAllegiance,
): boolean {
  if (side === other) {
    return false;
  }
  return !isNeutralAllegiance(side) && !isNeutralAllegiance(other);
}

/** Удобная форма для двух паспортов сразу. */
export function areHostiles(
  source: { readonly allegiance?: VehicleAllegiance } | null | undefined,
  other: { readonly allegiance?: VehicleAllegiance } | null | undefined,
): boolean {
  return isHostileAllegiance(allegianceOf(source), allegianceOf(other));
}
