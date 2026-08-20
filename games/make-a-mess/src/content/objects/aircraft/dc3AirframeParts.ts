/**
 * СОСТАВ ПЛАНЕРА DC-3 — ОДИН НА СТЕНД И НА МИР.
 *
 * Этот модуль существует ровно затем, чтобы обшивка подменялась в ОДНОМ
 * месте. Куски машины берут отсюда и `dc3Airplane.ts` (стендовый кластер,
 * масса, центр подъёма), и `dc3AirplaneDocument.ts` (куски сцены). Разведи их
 * — и стенд полетит одну машину, а карта загрузит другую; в `dc3Airplane.ts`
 * про эту грабку уже написано, она там однажды была.
 *
 * B01 остаётся каноническим владельцем ФОРМЫ: панели снимаются с его же
 * band-функций и повторяют ту же поверхность. Здесь подменяется
 * ПРЕДСТАВЛЕНИЕ — вместо одной шкуры на консоль приходит набор отсеков.
 *
 * Рулевых поверхностей в подмене нет намеренно: актуатор и петля ищутся по
 * ТОЧНОМУ id куска (`dc3ActuatorFor`, `dc3BlockoutObject.surfaceHinges`), и
 * дробление руля на панели без правки этого поиска остановило бы управление.
 */
import type { ObjectLabPart } from "../dutchWindmills/objectModel.ts";
import { dc3BlockoutObject } from "./dc3BlockoutObject.ts";
import { dc3LiveryTitleParts } from "./dc3LiveryTitles.ts";
import { dc3SkinPanelsByGroup } from "./dc3SkinPanelsObject.ts";

/** Лофтовые шкуры B01, которые заменены панелями. */
export const DC3_PANELLED_LOFT_GROUPS: readonly string[] = [
  "wing",
  "empennage",
  "fuselage",
];

/**
 * Куски B01, заменённые панелями поимённо, а не группой.
 *
 * У гондолы панелизируется только капотная оболочка, губа и тракт.
 * Противопожарная перегородка и кок винта остаются: это не обшивка планера, и
 * подменять их панелями было бы враньём.
 */
export const DC3_PANELLED_LOFT_IDS: readonly string[] = [
  "nacelle-left-body",
  "nacelle-left-cowl-inner",
  "nacelle-left-cowl-lip",
  "nacelle-right-body",
  "nacelle-right-cowl-inner",
  "nacelle-right-cowl-lip",
];

/** Панельные группы, которыми они заменены. */
export const DC3_PANEL_SOURCE_GROUPS: readonly string[] = [
  "wing-panels",
  "stab-panels",
  "fin-panels",
  "fuselage-panels",
  "window-glazing",
  "window-frame",
  "nacelle-panels",
];

/** Куски планера после подмены обшивки. Каркас идёт первым. */
export function dc3AirframeParts(): readonly ObjectLabPart[] {
  return [
    ...dc3BlockoutObject.parts.filter(
      (part) => !DC3_PANELLED_LOFT_GROUPS.includes(part.group)
        && !DC3_PANELLED_LOFT_IDS.includes(part.id),
    ),
    ...dc3SkinPanelsByGroup(DC3_PANEL_SOURCE_GROUPS),
    // Ливрея — краска поверх готовой обшивки, идёт последней и панелизацию
    // не меняет: docs/dc-3/livery-crosstown-p01.md.
    ...dc3LiveryTitleParts,
  ];
}
