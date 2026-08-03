// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import type { SceneVector3 } from "./destructionScene.ts";
import {
  DS_FRONT_AXLE_X,
  DS_GROUND_CLEARANCE,
  DS_WHEEL_RADIUS,
  DS_HEIGHT,
  DS_WHEEL_CENTRE_HEIGHT,
  DS_LENGTH,
  DS_NOSE_X,
  DS_REAR_AXLE_X,
  DS_WIDTH,
} from "./townCitroenDs.ts";

/**
 * ПОВЕРХНОСТЬ КУЗОВА «DS»
 *
 * Всё, что было до этого модуля, задавало кузов ТРЕМЯ продольными профилями:
 * полуширина в плане, верхняя линия, линия порога. Такой набор описывает
 * коробку с гнутой верхней кромкой, и ничем другим он быть не может: борт у
 * него вертикален на всей высоте. Ни завала стекла, ни плеча, ни седловины
 * капота, ни подбора юбки выразить нечем, а между вертикальным бортом и
 * горизонтальной палубой остаётся открытая щель — на крыше она достигала
 * 319 мм, и сквозь неё было видно салон.
 *
 * Здесь кузов задан так, как задаётся настоящий кузов: ПОПЕРЕЧНЫМ СЕЧЕНИЕМ,
 * едущим вдоль машины. `dsSection(u)` возвращает замкнутый контур, а
 * `dsBodyPoint(u, theta)` — точку на нём. Из ОДНОЙ этой функции дальше
 * выводится всё: обшивка, палубы, стёкла, арки, поясная линия, разъёмы
 * дверей. Правка образа — правка станции, а не пересборка панелей.
 *
 * ── ЧТО ТАКОЕ theta ───────────────────────────────────────────────────────
 *
 * Контур обходится ОДНИМ параметром от 0 до 1 по левому борту (+z) и
 * зеркалится на правый. Опорные узлы:
 *
 *   theta = 0.00  днище на оси симметрии (низ, z = 0)
 *   theta = 0.18  край юбки: кузов ушёл вбок и вниз, дальше подбор
 *   theta = 0.42  ТАЛИЯ — самая широкая точка сечения
 *   theta = 0.62  ПЛЕЧО — ребро, вокруг которого читается весь бок
 *   theta = 0.80  кромка крыши
 *   theta = 1.00  венец крыши на оси симметрии (верх, z = 0)
 *
 * Между узлами контур интерполируется гладко, поэтому касательная не рвётся
 * и широкий блик проходит по борту без ступеньки.
 *
 * ── ОТКУДА ЧИСЛА ──────────────────────────────────────────────────────────
 *
 * Все станции сняты с заводского четырёхвидового чертежа: огибающая вида
 * сбоку дала верхнюю линию, вида в плане — полуширину, видов спереди и сзади
 * — форму сечения (полуширина по высоте). Полный разбор источников,
 * погрешностей и таблицы — `docs/citroen-ds-brief.md`.
 *
 * Сканы анизотропны на 3…10 %, поэтому абсолютный масштаб взят ТОЛЬКО из
 * напечатанных на чертеже размеров, а с обводов снята одна форма,
 * нормированная в этот габарит.
 */

// ---------------------------------------------------------------------------
// ИНТЕРПОЛЯЦИЯ
// ---------------------------------------------------------------------------

export interface ProfileStation {
  readonly u: number;
  readonly value: number;
}

/**
 * Гладкая интерполяция по станциям.
 *
 * Между узлами берётся `6t⁵ − 15t⁴ + 10t³`, а не привычный `3t² − 2t³`: у
 * первого на узлах обнуляется И ПЕРВАЯ, И ВТОРАЯ производная, то есть обвод
 * получается C2, а не только C1. Разница не теоретическая: у C1-обвода на
 * каждом узле скачет кривизна, и по борту машины проходит еле уловимая
 * ступенька, которую видно широким бликом на глянце — там, где на матовой
 * оболочке дирижабля её никто бы не заметил.
 */
export function sampleProfile(
  stations: readonly ProfileStation[],
  u: number,
): number {
  const clamped = Math.max(0, Math.min(1, u));
  if (clamped <= stations[0].u) return stations[0].value;
  const last = stations[stations.length - 1];
  if (clamped >= last.u) return last.value;
  for (let index = 1; index < stations.length; index += 1) {
    const before = stations[index - 1];
    const after = stations[index];
    if (clamped <= after.u) {
      const span = after.u - before.u;
      const t = span > 1e-9 ? (clamped - before.u) / span : 0;
      const smooth = t * t * t * (t * (t * 6 - 15) + 10);
      return before.value + (after.value - before.value) * smooth;
    }
  }
  return last.value;
}

// ---------------------------------------------------------------------------
// ПРОДОЛЬНЫЕ ПРОФИЛИ
//
// `u` идёт от носа (0) к корме (1). Числа — метры, сняты с чертежа.
// ---------------------------------------------------------------------------

/**
 * ВЕРХНЯЯ ЛИНИЯ. Гребень — не точка, а ПЛАТО u = 0.44…0.56, и лежит оно
 * практически ровно на середине машины. Паспорт до этого утверждал «позади
 * середины» и уводил гребень к 0.56; на заводском чертеже он на 0.48.
 *
 * Нос опускается до 0.544, корма до 0.493. Прежняя модель держала их на 0.72
 * и 0.96 — корма была на полметра выше правды и читалась стеной.
 *
 * ЗНАЧЕНИЯ СГЛАЖЕНЫ фильтром 1-2-1 (гребень закреплён). Скан чертежа даёт
 * около семи миллиметров шума на пиксель, а C2-интерполяция послушно
 * превращает этот шум в рябь: до сглаживания кривизна меняла знак восемь раз
 * на длине машины, и по лобовому и заднему свесу шли волны. После — четыре
 * раза, ровно столько перегибов у машины и есть.
 */
const DS_TOP_STATIONS: readonly ProfileStation[] = [
  { u: 0.00, value: 0.544 },
  { u: 0.04, value: 0.701 },
  { u: 0.08, value: 0.813 },
  { u: 0.12, value: 0.881 },
  { u: 0.16, value: 0.928 },
  { u: 0.20, value: 0.967 },
  { u: 0.24, value: 1.003 },
  // Капот почти горизонтален, а лобовое поднимает линию РАНО и круто.
  { u: 0.28, value: 1.058 },
  { u: 0.32, value: 1.154 },
  { u: 0.36, value: 1.281 },
  { u: 0.40, value: 1.388 },
  { u: 0.44, value: 1.446 },
  // Гребень — ПЛАТО, и лежит оно практически на середине машины.
  { u: 0.48, value: DS_HEIGHT },
  { u: 0.52, value: DS_HEIGHT },
  { u: 0.56, value: 1.457 },
  { u: 0.60, value: 1.442 },
  { u: 0.64, value: 1.420 },
  { u: 0.68, value: 1.386 },
  { u: 0.72, value: 1.327 },
  // Спад кормы начинается на 0.72 и идёт ровным длинным скатом.
  { u: 0.76, value: 1.232 },
  { u: 0.80, value: 1.116 },
  { u: 0.84, value: 1.003 },
  { u: 0.88, value: 0.901 },
  { u: 0.92, value: 0.795 },
  { u: 0.96, value: 0.660 },
  { u: 1.00, value: 0.493 },
];

/**
 * ПОЛУШИРИНА ПО ТАЛИИ. Капля в плане куда мягче, чем кажется: от максимума
 * 0.902 к u = 0.90 обвод сходится всего на 12 %, а резкое схождение занимает
 * последние четыре процента длины.
 *
 * Максимум приходится на КОНЕЦ КАПОТА (u ≈ 0.30), а не на передние двери.
 */
const DS_WAIST_STATIONS: readonly ProfileStation[] = [
  { u: 0.00, value: 0.367 },
  { u: 0.04, value: 0.534 },
  { u: 0.08, value: 0.696 },
  { u: 0.12, value: 0.808 },
  { u: 0.16, value: 0.858 },
  { u: 0.20, value: 0.877 },
  { u: 0.24, value: 0.891 },
  { u: 0.28, value: 0.899 },
  { u: 0.32, value: 0.901 },
  { u: 0.36, value: 0.900 },
  { u: 0.40, value: 0.898 },
  { u: 0.44, value: 0.894 },
  { u: 0.48, value: 0.890 },
  { u: 0.52, value: 0.885 },
  { u: 0.56, value: 0.879 },
  { u: 0.60, value: 0.875 },
  { u: 0.64, value: 0.871 },
  { u: 0.68, value: 0.867 },
  { u: 0.72, value: 0.862 },
  { u: 0.76, value: 0.852 },
  { u: 0.80, value: 0.839 },
  { u: 0.84, value: 0.822 },
  { u: 0.88, value: 0.803 },
  { u: 0.92, value: 0.765 },
  { u: 0.96, value: 0.652 },
  { u: 1.00, value: 0.445 },
];

/**
 * ЛИНИЯ ЮБКИ — низ видимого кузова. Между колёсами машина висит на
 * паспортных 145 мм клиренса; на обоих свесах юбка поднимается, иначе машина
 * цепляла бы землю носом на въезде.
 */
const DS_SKIRT_STATIONS: readonly ProfileStation[] = [
  { u: 0.0, value: 0.38 },
  { u: 0.06, value: 0.24 },
  { u: 0.14, value: 0.17 },
  { u: 0.25, value: DS_GROUND_CLEARANCE },
  { u: 0.5, value: DS_GROUND_CLEARANCE },
  { u: 0.75, value: DS_GROUND_CLEARANCE },
  { u: 0.86, value: 0.17 },
  { u: 0.94, value: 0.26 },
  { u: 1.0, value: 0.4 },
];

/**
 * ВЫСОТА ТАЛИИ — на какой высоте сечение шире всего. У этой машины талия
 * низкая и почти постоянная: 0.69 м по всей длине, чуть выше на свесах, где
 * кузов уже собрался в клин.
 */
const DS_WAIST_HEIGHT_STATIONS: readonly ProfileStation[] = [
  { u: 0.0, value: 0.44 },
  { u: 0.08, value: 0.6 },
  { u: 0.2, value: 0.68 },
  { u: 0.5, value: 0.69 },
  { u: 0.8, value: 0.69 },
  { u: 0.92, value: 0.66 },
  { u: 1.0, value: 0.46 },
];

/**
 * ЛИНИЯ ПЛЕЧА — высота ребра, отделяющего борт от остекления и палуб. Это
 * САМАЯ ЗАМЕТНАЯ линия машины в профиль: по ней идёт хром, на ней стоят
 * ручки, ею же режется верх дверей.
 *
 * Впереди плечо ныряет к фарам, у салона держится ровно, сзади поднимается
 * вместе с крылом и уходит в корму.
 */
const DS_SHOULDER_STATIONS: readonly ProfileStation[] = [
  // На обоих концах плечо СХОДИТСЯ с венцом: палуба между ними сужается в
  // ноль, и машина закрывается носом и кормой. Держать плечо высоко до
  // самого торца нельзя — сечение выворачивается наизнанку.
  { u: 0.0, value: 0.4 },
  { u: 0.04, value: 0.58 },
  { u: 0.08, value: 0.7 },
  { u: 0.14, value: 0.8 },
  { u: 0.2, value: 0.86 },
  { u: 0.3, value: 0.92 },
  { u: 0.36, value: 0.96 },
  { u: 0.44, value: 0.99 },
  { u: 0.56, value: 1.0 },
  { u: 0.68, value: 1.01 },
  { u: 0.76, value: 1.02 },
  { u: 0.84, value: 1.01 },
  { u: 0.88, value: 0.9 },
  { u: 0.92, value: 0.79 },
  { u: 0.96, value: 0.66 },
  { u: 1.0, value: 0.43 },
];

/**
 * ПОЛУШИРИНА ПО ПЛЕЧУ, долей от талии. На виде спереди на высоте плеча
 * сечение уже талии примерно на четверть — это и есть подбор борта кверху,
 * без которого машина выглядит коробкой.
 */
const DS_SHOULDER_WIDTH_STATIONS: readonly ProfileStation[] = [
  { u: 0.0, value: 0.5 },
  { u: 0.08, value: 0.7 },
  { u: 0.2, value: 0.78 },
  { u: 0.32, value: 0.8 },
  { u: 0.5, value: 0.81 },
  { u: 0.68, value: 0.8 },
  { u: 0.8, value: 0.78 },
  { u: 0.9, value: 0.72 },
  { u: 1.0, value: 0.55 },
];

/**
 * ПОЛУШИРИНА КРЫШИ, долей от талии. Крыша у этой машины ЗАМЕТНО уже борта и
 * сходится к обоим концам — потому и держится на тонких стойках, и потому же
 * стекло завалено.
 */
const DS_ROOF_WIDTH_STATIONS: readonly ProfileStation[] = [
  { u: 0.36, value: 0.0 },
  { u: 0.44, value: 0.5 },
  { u: 0.5, value: 0.56 },
  { u: 0.58, value: 0.58 },
  { u: 0.66, value: 0.57 },
  { u: 0.72, value: 0.54 },
  { u: 0.78, value: 0.46 },
  { u: 0.84, value: 0.3 },
  { u: 0.9, value: 0.0 },
];

/**
 * ПОДБОР ЮБКИ — насколько сечение уже талии у самого низа. Кузов не падает
 * от талии к земле отвесно: он подворачивается внутрь, и именно поэтому
 * машина смотрится сидящей, а не поставленной на колёса.
 */
const DS_TUCK_STATIONS: readonly ProfileStation[] = [
  { u: 0.0, value: 0.5 },
  { u: 0.1, value: 0.76 },
  { u: 0.25, value: 0.86 },
  { u: 0.5, value: 0.88 },
  // У ЗАДНЕГО КОЛЕСА подбор почти снят: колесо там закрыто целиком, и борт
  // обязан обходить шину снаружи по всей её верхней половине. При подборе
  // 0.86 панель садилась внутрь покрышки на 34 мм у самой ступицы.
  { u: 0.75, value: 0.95 },
  { u: 0.9, value: 0.94 },
  { u: 1.0, value: 0.5 },
];

// ---------------------------------------------------------------------------
// ДОСТУП К ПРОФИЛЯМ
// ---------------------------------------------------------------------------

export const dsTopHeight = (u: number): number =>
  sampleProfile(DS_TOP_STATIONS, u);
export const dsWaistHalfWidth = (u: number): number =>
  sampleProfile(DS_WAIST_STATIONS, u);
export const dsSkirtHeight = (u: number): number =>
  sampleProfile(DS_SKIRT_STATIONS, u);
export const dsWaistHeight = (u: number): number =>
  sampleProfile(DS_WAIST_HEIGHT_STATIONS, u);
export const dsShoulderHeight = (u: number): number =>
  sampleProfile(DS_SHOULDER_STATIONS, u);

/** Полуширина на высоте плеча, метры. */
export const dsShoulderHalfWidth = (u: number): number =>
  dsWaistHalfWidth(u) * sampleProfile(DS_SHOULDER_WIDTH_STATIONS, u);

/** Полуширина крыши, метры. Ноль там, где крыши уже нет. */
export const dsRoofHalfWidth = (u: number): number =>
  dsWaistHalfWidth(u) * sampleProfile(DS_ROOF_WIDTH_STATIONS, u);

/** Полуширина у самого низа юбки, метры. */
export const dsSkirtHalfWidth = (u: number): number =>
  dsWaistHalfWidth(u) * sampleProfile(DS_TUCK_STATIONS, u);

/** Продольная координата станции в авторских осях. */
export const dsStationX = (u: number): number => DS_NOSE_X + u * DS_LENGTH;

/** Обратно: доля длины по авторской координате. */
export const dsStationOf = (x: number): number => (x - DS_NOSE_X) / DS_LENGTH;

// ---------------------------------------------------------------------------
// СЕЧЕНИЕ
// ---------------------------------------------------------------------------

/** Опорные узлы обхода контура. Именованы, чтобы знаки нигде не выписывались. */
export const DS_THETA_KEEL = 0.0;
export const DS_THETA_SKIRT = 0.18;
export const DS_THETA_WAIST = 0.42;
/**
 * СКУЛА — узел между талией и плечом, и без него борт не работает.
 *
 * На виде спереди сечение от талии вверх почти не сужается: полуширина
 * держится в пределах 0.93…0.96 от максимума аж до 840 мм высоты, и только
 * потом идёт завал к крыше. То есть борт над талией ПРЯМОЙ, а не сразу
 * заваленный.
 *
 * Пока этого узла не было, сечение начинало подбираться прямо от талии, и на
 * высоте верха шины кузов оказывался уже колеса: спереди покрышка вылезала
 * из-под крыла на 96 мм, а сзади борт проходил СКВОЗЬ колесо на 87 мм.
 */
export const DS_THETA_HAUNCH = 0.52;
/**
 * Какую долю талии держит скула. Замер с вида спереди: 0.93…0.96.
 *
 * НАД ОСЯМИ доля поднята почти до единицы: крыло обязано накрыть покрышку по
 * всей её высоте, а не только по талии. Передняя колея широкая (1516), шина
 * выходит на 853 от оси, и при ровных 0.955 верх покрышки торчал из-под
 * крыла на 19 мм.
 */
const DS_HAUNCH_SHARE_STATIONS: readonly ProfileStation[] = [
  { u: 0.0, value: 0.93 },
  { u: 0.12, value: 0.96 },
  { u: 0.21, value: 0.995 },
  { u: 0.3, value: 0.965 },
  { u: 0.5, value: 0.95 },
  { u: 0.72, value: 0.955 },
  { u: 0.85, value: 0.985 },
  { u: 1.0, value: 0.93 },
];
export const dsHaunchWidthShare = (u: number): number =>
  sampleProfile(DS_HAUNCH_SHARE_STATIONS, u);
export const DS_THETA_SHOULDER = 0.62;
export const DS_THETA_ROOF_EDGE = 0.8;
export const DS_THETA_CROWN = 1.0;

export interface DsSection {
  readonly u: number;
  readonly keel: number;
  readonly skirt: number;
  readonly skirtHalf: number;
  readonly waist: number;
  readonly waistHalf: number;
  readonly haunch: number;
  readonly haunchHalf: number;
  readonly shoulder: number;
  readonly shoulderHalf: number;
  readonly roofEdge: number;
  readonly roofHalf: number;
  readonly crown: number;
}

/** Все опорные величины сечения в одной станции. */
export function dsSection(u: number): DsSection {
  const skirt = dsSkirtHeight(u);
  const crown = dsTopHeight(u);
  const waist = dsWaistHeight(u);
  const shoulder = dsShoulderHeight(u);
  const roofHalf = dsRoofHalfWidth(u);
  // Кромка крыши лежит чуть ниже венца: крыша выпуклая, а не плоская.
  const roofEdge = roofHalf > 1e-4 ? crown - 0.045 : crown;
  // Сечение обязано идти СНИЗУ ВВЕРХ без разворотов: порог < талия < плечо <
  // венец. Стоит плечу подняться выше венца — а к корме оно к этому и
  // стремится, — как палуба выворачивается наизнанку, и в этом месте
  // силуэт разъезжается с чертежом на семьсот миллиметров. Это уже случалось;
  // зажим оставлен как страховка, а станции исправлены отдельно.
  const safeWaist = Math.min(waist, crown - 0.12);
  const safeShoulder = Math.min(
    Math.max(shoulder, safeWaist + 0.04),
    crown - 0.03,
  );
  const waistHalf = dsWaistHalfWidth(u);
  // Скула стоит на пяти восьмых пути от талии к плечу и держит почти всю
  // ширину: борт над талией прямой.
  const haunch = safeWaist + (safeShoulder - safeWaist) * 0.62;
  return {
    u,
    // Днище на оси симметрии лежит ниже края юбки — кузов не плоскодонный.
    keel: skirt - 0.02,
    skirt,
    skirtHalf: dsSkirtHalfWidth(u),
    waist: safeWaist,
    waistHalf,
    haunch,
    haunchHalf: waistHalf * dsHaunchWidthShare(u),
    shoulder: safeShoulder,
    shoulderHalf: dsShoulderHalfWidth(u),
    roofEdge,
    roofHalf,
    crown,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Сглаженный шаг: на концах производная нулевая, стыка узлов не видно. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Точка контура сечения: возвращает полуширину и высоту при заданном theta.
 * Обход от киля (0) к венцу (1); отрицательный theta не имеет смысла.
 *
 * Между узлами интерполяция сглаженная, поэтому плечо получается РЕБРОМ по
 * скорости, но не разрывом по касательной: сечение остаётся гладким, а глаз
 * всё равно читает линию — ровно как на настоящей машине.
 */
export function dsSectionPoint(
  section: DsSection,
  theta: number,
): readonly [halfWidth: number, height: number] {
  const t = Math.max(0, Math.min(1, theta));
  const between = (
    t0: number,
    t1: number,
    w0: number,
    w1: number,
    y0: number,
    y1: number,
  ): readonly [number, number] => {
    const k = ease((t - t0) / (t1 - t0));
    return [lerp(w0, w1, k), lerp(y0, y1, k)];
  };
  if (t <= DS_THETA_SKIRT) {
    return between(
      DS_THETA_KEEL, DS_THETA_SKIRT,
      0, section.skirtHalf,
      section.keel, section.skirt,
    );
  }
  if (t <= DS_THETA_WAIST) {
    return between(
      DS_THETA_SKIRT, DS_THETA_WAIST,
      section.skirtHalf, section.waistHalf,
      section.skirt, section.waist,
    );
  }
  if (t <= DS_THETA_HAUNCH) {
    return between(
      DS_THETA_WAIST, DS_THETA_HAUNCH,
      section.waistHalf, section.haunchHalf,
      section.waist, section.haunch,
    );
  }
  if (t <= DS_THETA_SHOULDER) {
    return between(
      DS_THETA_HAUNCH, DS_THETA_SHOULDER,
      section.haunchHalf, section.shoulderHalf,
      section.haunch, section.shoulder,
    );
  }
  if (t <= DS_THETA_ROOF_EDGE) {
    return between(
      DS_THETA_SHOULDER, DS_THETA_ROOF_EDGE,
      section.shoulderHalf, section.roofHalf,
      section.shoulder, section.roofEdge,
    );
  }
  return between(
    DS_THETA_ROOF_EDGE, DS_THETA_CROWN,
    section.roofHalf, 0,
    section.roofEdge, section.crown,
  );
}

/**
 * ТОЧКА ПОВЕРХНОСТИ КУЗОВА в авторских осях машины.
 *
 * `side` = +1 — левый борт (+z), −1 — правый. Это единственная функция, из
 * которой строится вся обшивка: если панель не выводится отсюда, она и не
 * лежит на кузове.
 */
export function dsBodyPoint(
  u: number,
  theta: number,
  side: number,
): SceneVector3 {
  const [halfWidth, height] = dsSectionPoint(dsSection(u), theta);
  return [dsStationX(u), height, side * halfWidth];
}

/**
 * Нормаль поверхности в точке — из двух касательных, посчитанных по ТОЙ ЖЕ
 * функции. Считать её отдельной формулой нельзя: разъедется с геометрией на
 * первой же правке станции.
 */
export function dsBodyNormal(
  u: number,
  theta: number,
  side: number,
): SceneVector3 {
  const step = 0.004;
  const along = sub(
    dsBodyPoint(Math.min(1, u + step), theta, side),
    dsBodyPoint(Math.max(0, u - step), theta, side),
  );
  const around = sub(
    dsBodyPoint(u, Math.min(1, theta + step), side),
    dsBodyPoint(u, Math.max(0, theta - step), side),
  );
  const normal = cross(around, along);
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const sign = side >= 0 ? 1 : -1;
  return [
    (normal[0] / length) * sign,
    (normal[1] / length) * sign,
    (normal[2] / length) * sign,
  ];
}

function sub(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// ---------------------------------------------------------------------------
// АРКИ
//
// Арка — ВЫРЕЗ в оболочке, а не панель поверх неё. Функция возвращает, на
// какую высоту поднят низ кузова в этой станции: ниже неё поверхности нет.
// ---------------------------------------------------------------------------

/** Передняя арка открыта; задняя закрыта щитком, и выреза у неё нет. */
export const DS_FRONT_ARCH_RADIUS = 0.42;

export function dsArchFloor(u: number): number {
  const dx = dsStationX(u) - DS_FRONT_AXLE_X;
  if (Math.abs(dx) >= DS_FRONT_ARCH_RADIUS) return -Infinity;
  // Арка ОПИРАЕТСЯ НА ПОРОГ, а не висит на высоте ступицы: у её концов вырез
  // сходит на нет и борт продолжается вниз, как на настоящей машине.
  //
  // Пока проём строился полукругом от ступицы, у обоих концов арки из борта
  // вырезалась полоса от порога до 0.495 — колеса там уже нет, и сквозь эту
  // прореху было видно платформу и агрегаты.
  //
  // По вертикали арка вытянута: верх обязан обойти покрышку с зазором, а по
  // длине проём ограничен радиусом.
  const sill = dsSkirtHeight(u);
  const crest = DS_WHEEL_CENTRE_HEIGHT + DS_WHEEL_RADIUS + DS_ARCH_CLEARANCE;
  const shape = Math.sqrt(
    Math.max(0, 1 - (dx * dx) / (DS_FRONT_ARCH_RADIUS * DS_FRONT_ARCH_RADIUS)),
  );
  // Показатель задаёт, насколько быстро вырез сходит к порогу у своих концов.
  // При 0.62 арка получалась «жирной»: у самого края она всё ещё висела на
  // двести миллиметров над порогом, то есть кузов был вырезан там, где колеса
  // уже нет.
  return sill + (crest - sill) * Math.pow(shape, 1.35);
}

/** Зазор между покрышкой и кромкой крыла. */
export const DS_ARCH_CLEARANCE = 0.035;

/** Щиток заднего колеса: продольные границы выреза под него. */
export const DS_SPAT_FRONT_U = dsStationOf(DS_REAR_AXLE_X - 0.44);
export const DS_SPAT_REAR_U = dsStationOf(DS_REAR_AXLE_X + 0.36);

// ---------------------------------------------------------------------------
// КОНТРОЛЬНЫЕ ЛИНИИ ОБРАЗА
// ---------------------------------------------------------------------------

/**
 * Разъёмы дверей и границы салона по длине. Сняты с профиля.
 *
 * ОСНОВАНИЕ ЛОБОВОГО берётся не на глаз, а по ПЕРЕЛОМУ верхней линии: до
 * u = 0.28 она идёт почти горизонтально (1.00 → 1.03), а дальше взлетает
 * (1.12 → 1.30 → 1.43). Значит стекло начинается там, где начинается взлёт,
 * то есть на 0.30.
 *
 * Пока здесь стояло 0.355, палуба капота доезжала до СЕРЕДИНЫ подъёма и
 * закрывала снизу заметный кусок лобового стекла.
 */
export const DS_COWL_U = 0.3;
export const DS_DOOR_FRONT_U = 0.395;
export const DS_DOOR_MIDDLE_U = 0.565;
export const DS_DOOR_REAR_U = 0.735;
export const DS_BACKLIGHT_U = 0.79;
export const DS_ROOF_FRONT_U = 0.44;
export const DS_ROOF_REAR_U = 0.755;

/** Ширина машины по бамперам — именно она даёт паспортные 1803. */
export const DS_BUMPER_HALF_WIDTH = DS_WIDTH / 2;

/**
 * Верх бамперного клинка над грунтом. Оба числа ПРОСТАВЛЕНЫ на заводском
 * чертеже (560 спереди, 430 сзади) — их не надо выводить из обвода. Разные
 * они не по прихоти: сзади машина ниже, и бампер идёт за ней.
 */
export const DS_BUMPER_TOP_FRONT = 0.56;
export const DS_BUMPER_TOP_REAR = 0.43;
/** Высота самого клинка. */
export const DS_BUMPER_DEPTH = 0.115;
/** Докуда бампер заворачивает на борта. */
export const DS_BUMPER_HORN_FRONT_U = 0.095;
export const DS_BUMPER_HORN_REAR_U = 0.905;
