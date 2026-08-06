// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

import type { SceneVector3 } from "./destructionScene.ts";

/**
 * СТОЙКА — ОБЩИЙ ОРГАН ОПОРЫ: ЛУЧ, ГАЗ И МАСЛО
 *
 * Стойка — это то, чем машина упирается в грунт: подвеска автомобиля, шасси
 * самолёта, опора винтокрылой машины. Общего у них ровно столько, сколько
 * написано здесь: луч из верха стойки вниз по СВОЕЙ оси, ход от выпуска до
 * упора и закон силы вдоль этой оси. Всё, чем они отличаются, живёт снаружи:
 * шина создаёт продольную и боковую силы своим законом (`carDynamics`), пятка
 * умеет только трение, а убирающийся кулак — вообще не физика.
 *
 * ── ПОЧЕМУ ЛУЧ, А НЕ КОЛЛАЙДЕР ────────────────────────────────────────────
 *
 * Опора-коллайдер — жёсткий столб: движок решает касание одним импульсом за
 * один шаг, и вся энергия снижения выдаётся мгновенно. Ход, нарисованный в
 * олео, при этом остаётся украшением, а закон материалов судит по ПИКОВОЙ
 * скорости, хотя опора существует ровно для того, чтобы превратить пик в
 * работу. Кроме того, коллайдер на опоре и луч подвески несовместимы: луч
 * находит опору в собственной пятке. Поэтому у машины со стойками её опорные
 * куски выключаются из компаунда (`contactMemberExcludes`), а держит машину
 * этот модуль.
 *
 * ── ВЕРХ СТОЙКИ — НЕ ПЯТКА И НЕ ЦЕНТР КОЛЕСА ──────────────────────────────
 *
 * `mount` — точка, ИЗ КОТОРОЙ выходит шток, а `extendedReach` — расстояние от
 * неё до опорной поверхности при ПОЛНОМ ВЫПУСКЕ. На этой мине уже сидели:
 * колесо, нарисованное прямо в точке паспорта, встало на статическую осадку
 * выше грунта, и машина поехала по воздуху. Авторская поза машины — это поза
 * ПОД НАГРУЗКОЙ, то есть уже сжатая на статическую осадку, поэтому полный
 * выпуск лежит НИЖЕ авторского нуля. `oleoStrut`/`coilStrut` считают это сами.
 *
 * ── ПОЧЕМУ ГАЗ, А НЕ ПРУЖИНА ──────────────────────────────────────────────
 *
 * Линейная пружина запасает ½·F_max·s и отдаёт всё обратно: машина козлит.
 * Газовый столб сжимается политропно — мягко ловит в начале хода и становится
 * почти непроходимым к концу, поэтому та же энергия укладывается в меньший
 * ход, а до железного упора дело не доходит. Это не украшение модели: разница
 * видна в кадре — машина на олео приседает и ОСТАЁТСЯ присевшей.
 *
 * ── ПРУЖИНА — ЭТО ОЛЕО С БЕСКОНЕЧНЫМ ГАЗОВЫМ СТОЛБОМ ──────────────────────
 *
 * Закон здесь ОДИН, и второго сорта стойки не существует. При L₀ → ∞
 *
 *     F(s) = F₀·[(L₀/(L₀−s))ⁿ − 1] → F₀·n·s/L₀,
 *
 * то есть ровно линейная пружина. Отсюда же следует потолок жёсткости витой
 * пружины: у неё отношение силы на упоре к статической равно 1/осадка и
 * больше стать не может. Просить у олео `compressedLoadFactor ≤ 1/staticSag`
 * значит просить пружину — модуль так её и выдаёт, без ветки кода.
 *
 * ── МАСЛО НЕСИММЕТРИЧНО, И ИМЕННО ЭТИМ СТОЙКА НЕ КОЗЛИТ ───────────────────
 *
 * На сжатии масло идёт через большой жиклёр турбулентно — сила квадратична по
 * скорости и максимальна в первый миг касания, когда скорость наибольшая:
 * именно она, а не газ, съедает энергию посадки. На отбое клапан почти закрыт,
 * течение ламинарное, сила линейна — стойка распрямляется медленно и не
 * возвращает машине то, что запас газ.
 *
 * Демпфер ограничен сверху импульсом, который гасит относительную скорость
 * ровно в ноль за шаг: настоящий демпфер движение останавливает, но не
 * разворачивает. Без этой заслонки честно медленный отбой на шаге 1/60
 * разносит явный интегратор.
 *
 * ── ЧЕГО ЗДЕСЬ НЕТ ────────────────────────────────────────────────────────
 *
 * Ни поиска опоры (луч бросает вызывающий: в рантайме — rapier, в тесте —
 * плоскость), ни знания о конкретной машине, ни уборки стойки. Убранная
 * стойка — это `availability = 0`, и посадка на брюхо после этого судится
 * общим законом материалов, а не поправкой здесь.
 */

type Vector3 = readonly [number, number, number];

/**
 * Газовая пружина стойки. Сила отсчитывается ОТ ПОЛНОГО ВЫПУСКА: при нулевом
 * обжатии шток лежит на выпускном упоре и грунту ничего не передаёт.
 */
export interface StrutSpring {
  /** Масштаб кривой, Н. Выводится из статической нагрузки, а не назначается. */
  readonly preload: number;
  /** Длина газового столба при полном выпуске, м. `Infinity` — витая пружина. */
  readonly gasLength: number;
  /** Показатель политропы: 1 — изотерма, 1.4 — адиабата, 1.3 — удар. */
  readonly polytropic: number;
}

/**
 * Демпфер. Четыре числа вместо двух законов: витой пружине нужны только
 * линейные члены, олео — квадратичный на сжатии и линейный на отбое.
 */
export interface StrutDamper {
  /** Н·с/м на сжатии. */
  readonly compressionLinear: number;
  /** Н·с²/м² на сжатии: жиклёр, турбулентное течение. */
  readonly compressionQuadratic: number;
  /** Н·с/м на отбое. Всегда больше, чем на сжатии. */
  readonly recoilLinear: number;
  /** Н·с²/м² на отбое. */
  readonly recoilQuadratic: number;
}

export interface SupportStrut {
  readonly id: string;
  /** Верх стойки в авторских осях машины. НЕ пятка и не центр колеса. */
  readonly mount: SceneVector3;
  /** Куда стойка смотрит, в авторских осях. Единичный. */
  readonly axis: SceneVector3;
  /** От верха до опорной поверхности при полном выпуске, вдоль оси, м. */
  readonly extendedReach: number;
  /** Полный ход от выпуска до упора, м. */
  readonly stroke: number;
  /** Обжатие под собственной статической нагрузкой, м. */
  readonly staticSag: number;
  readonly spring: StrutSpring;
  readonly damper: StrutDamper;
  /** Масса, которую держит эта стойка. Нужна только заслонке демпфера. */
  readonly supportedMass: number;
  /** Сцепление пятки с покрытием, μ. */
  readonly grip: number;
  /** Н на м/с проскальзывания пятки: трение покоя без дрожи на месте. */
  readonly slipStiffness: number;
}

/**
 * Что луч нашёл под верхом стойки. Считает это ВЫЗЫВАЮЩИЙ: модуль о мире не
 * знает ничего.
 */
export interface StrutGroundProbe {
  /** Расстояние от верха стойки до опоры ВДОЛЬ ОСИ СТОЙКИ, м. */
  readonly distance: number;
  /** Нормаль опоры, мировая, единичная. */
  readonly normal: Vector3;
  /** Множитель к паспортному μ: единица — сухая твердь. */
  readonly surfaceGrip?: number;
}

export interface StrutReaction {
  readonly id: string;
  readonly contact: boolean;
  /** Обжатие, м, 0…stroke. Им же рисуется осадка штока. */
  readonly compression: number;
  /** Ход ЗА упором, м. Больше нуля — стойка пробита насквозь. */
  readonly overtravel: number;
  /** Стойка дошла до железного упора: остаток удара принимает корпус. */
  readonly bottomedOut: boolean;
  /** Реакция опоры, Н. Прикладывается ВДОЛЬ НОРМАЛИ, см. `strutReaction`. */
  readonly load: number;
  /** Вклад газа, Н. */
  readonly spring: number;
  /** Вклад масла, Н. Отрицательный на отбое. */
  readonly damping: number;
}

const EPSILON = 1e-9;

function normalize(v: SceneVector3): SceneVector3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > EPSILON ? [v[0] / length, v[1] / length, v[2] / length] : v;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

// ---------------------------------------------------------------------------
// ЗАКОН
// ---------------------------------------------------------------------------

/**
 * Сила газа при данном обжатии. Витая пружина — это же выражение при
 * бесконечном столбе, и отдельной ветки для неё нет по существу, а не для
 * краткости.
 */
export function strutSpringForce(
  strut: SupportStrut,
  compression: number,
): number {
  const { preload, gasLength, polytropic } = strut.spring;
  const s = clamp(compression, 0, strut.stroke);
  if (s <= 0) {
    return 0;
  }
  if (!Number.isFinite(gasLength)) {
    return preload * s;
  }
  return preload * (Math.pow(gasLength / (gasLength - s), polytropic) - 1);
}

/**
 * Сила масла. Плюс — сопротивление сжатию, минус — сопротивление отбою.
 *
 * Заслонка: настоящий демпфер способен остановить относительное движение, но
 * не развернуть его. Импульс за шаг ограничен `m·|v|`, иначе честно медленный
 * отбой на шаге 1/60 разносит явный интегратор.
 */
export function strutDamperForce(
  strut: SupportStrut,
  closingSpeed: number,
  step: number,
): number {
  const { damper } = strut;
  const speed = Math.abs(closingSpeed);
  const linear = closingSpeed > 0 ? damper.compressionLinear : damper.recoilLinear;
  const quadratic =
    closingSpeed > 0 ? damper.compressionQuadratic : damper.recoilQuadratic;
  const magnitude = linear * speed + quadratic * speed * speed;
  const limit =
    step > 0 && strut.supportedMass > 0
      ? (strut.supportedMass * speed) / step
      : Number.POSITIVE_INFINITY;
  return Math.sign(closingSpeed) * Math.min(magnitude, limit);
}

/**
 * Скорость сжатия стойки по тому, как движется её верх.
 *
 * Не «минус вертикальная скорость»: у наклонной стойки шток идёт по своей оси,
 * и путь до опоры сокращается быстрее, чем падает машина. Опора неподвижна,
 * поэтому производная расстояния берётся честно, по плоскости с нормалью
 * `normal`.
 */
export function strutClosingSpeed(
  mountVelocity: Vector3,
  axisWorld: Vector3,
  normal: Vector3,
): number {
  const along =
    axisWorld[0] * normal[0] + axisWorld[1] * normal[1] + axisWorld[2] * normal[2];
  if (Math.abs(along) < EPSILON) {
    return 0;
  }
  const approach =
    mountVelocity[0] * normal[0] +
    mountVelocity[1] * normal[1] +
    mountVelocity[2] * normal[2];
  return approach / along;
}

/**
 * ЕДИНСТВЕННОЕ МЕСТО, ГДЕ СЧИТАЕТСЯ РЕАКЦИЯ СТОЙКИ.
 *
 * НАГРУЗКА ПРИКЛАДЫВАЕТСЯ ВДОЛЬ НОРМАЛИ ОПОРЫ, А НЕ ВДОЛЬ ОСИ СТОЙКИ. Нога —
 * трёхзвенник: цапфа, подкос и шток. Двухсиловым стержнем она не является, и
 * потому на машину от неё действует ТОЛЬКО реакция грунта; осевую и боковую
 * составляющие разбирают между собой цапфа и подкос — те самые, которые и
 * нарисованы ради этого. Ось стойки задаёт геометрию луча и ход штока, но не
 * направление силы. Модель, толкавшая машину вдоль оси, разъезжала: у
 * разнонагруженных передних и задних ног горизонтальные составляющие не
 * сходятся, и машина уползала с площадки на ровном месте.
 *
 * Честная цена упрощения: у наклонной стойки осевая работа штока и работа
 * реакции расходятся на cos²θ — на восемнадцати градусах это девять процентов
 * демпферного члена. Платой за эти проценты был бы полный расчёт трёхзвенника.
 *
 * `availability` — доля уцелевшего органа: ноль означает и отстреленную
 * стойку, и убранную. И то и другое роняет угол машины на грунт, и обе
 * причины должны выглядеть одинаково.
 */
export function strutReaction(
  strut: SupportStrut,
  probe: StrutGroundProbe | null,
  closingSpeed: number,
  step: number,
  availability = 1,
): StrutReaction {
  const share = clamp(availability, 0, 1);
  const idle: StrutReaction = {
    id: strut.id,
    contact: false,
    compression: 0,
    overtravel: 0,
    bottomedOut: false,
    load: 0,
    spring: 0,
    damping: 0,
  };
  if (!probe || share <= EPSILON || !(probe.distance < strut.extendedReach)) {
    return idle;
  }
  const travel = strut.extendedReach - probe.distance;
  const compression = clamp(travel, 0, strut.stroke);
  const overtravel = Math.max(0, travel - strut.stroke);
  const spring = strutSpringForce(strut, compression);
  const damping = strutDamperForce(strut, closingSpeed, step);
  return {
    id: strut.id,
    contact: true,
    compression,
    overtravel,
    bottomedOut: overtravel > 0,
    load: Math.max(0, (spring + damping) * share),
    spring,
    damping,
  };
}

/**
 * Трение пятки. В отличие от шины пятка изотропна: она не катится и держит во
 * все стороны одинаково. Линейность по скорости проскальзывания — не
 * упрощение, а лекарство: на стоящей машине угол увода вырождается, и модель,
 * считающая силу по углу, начинает дёргать машину на месте.
 */
export function strutPadFriction(
  strut: SupportStrut,
  load: number,
  slipVelocity: Vector3,
  surfaceGrip = 1,
): Vector3 {
  const speed = Math.hypot(slipVelocity[0], slipVelocity[1], slipVelocity[2]);
  if (speed < EPSILON || load <= 0) {
    return [0, 0, 0];
  }
  const demand = strut.slipStiffness * speed;
  const limit = strut.grip * surfaceGrip * load;
  const magnitude = Math.min(demand, limit);
  const scale = -magnitude / speed;
  return [
    slipVelocity[0] * scale,
    slipVelocity[1] * scale,
    slipVelocity[2] * scale,
  ];
}

// ---------------------------------------------------------------------------
// ПАСПОРТ
//
// Числа выводятся из ДОЛИ ВЕСА на стойке и нарисованного хода, а не
// назначаются. Поэтому паспорт остаётся верным при любой массе машины и в
// любом масштабе мира: перевесили батареи — стойка сама стала жёстче.
// ---------------------------------------------------------------------------

export interface StrutMountingOptions {
  readonly id: string;
  /** Верх стойки в авторских осях. */
  readonly mount: SceneVector3;
  /** Куда смотрит шток. Нормируется здесь. */
  readonly axis: SceneVector3;
  /** Уровень опоры в авторских осях: обычно грунт, y = 0. */
  readonly groundHeight?: number;
  /** Полный ход, м. */
  readonly stroke: number;
  /** Статическая нагрузка на эту стойку, Н: доля веса машины. */
  readonly staticLoad: number;
  /** Доля хода, съеденная собственным весом машины. */
  readonly staticSagShare?: number;
  readonly gravity?: number;
  /** Сцепление пятки, μ. */
  readonly grip?: number;
  /** Скорость, на которой трение пятки выходит на предел, м/с. */
  readonly slipSpeed?: number;
}

function mountingCommon(options: StrutMountingOptions) {
  const axis = normalize(options.axis);
  const gravity = options.gravity ?? 9.81;
  const staticSagShare = options.staticSagShare ?? 0.25;
  const staticSag = staticSagShare * options.stroke;
  const descent = Math.abs(axis[1]);
  if (!(descent > EPSILON)) {
    throw new Error(`Стойка ${options.id}: ось не имеет вертикальной составляющей`);
  }
  // ВЕРХ СТОЙКИ ВЫШЕ ОПОРЫ РОВНО НА ПОЛНЫЙ ВЫПУСК МИНУС СТАТИЧЕСКАЯ ОСАДКА.
  // Авторская поза машины — поза под нагрузкой, поэтому полный выпуск лежит
  // ниже неё.
  const groundHeight = options.groundHeight ?? 0;
  const extendedReach =
    (options.mount[1] - groundHeight) / descent + staticSag;
  const grip = options.grip ?? 0.9;
  return {
    axis,
    gravity,
    staticSag,
    extendedReach,
    grip,
    slipStiffness: (grip * options.staticLoad) / (options.slipSpeed ?? 0.12),
    supportedMass: options.staticLoad / gravity,
  };
}

export interface OleoStrutOptions extends StrutMountingOptions {
  /**
   * Во сколько раз сила газа на упоре больше статической. Это и есть потолок
   * перегрузки, который стойка отдаёт корпусу, и он обязан быть больше
   * `1 / staticSagShare` — иначе просят витую пружину, и она же выдаётся.
   */
  readonly compressedLoadFactor?: number;
  readonly polytropic?: number;
  /** Расчётная скорость снижения, на которой считается жиклёр сжатия, м/с. */
  readonly designSinkRate?: number;
  /** Сила масла на расчётной скорости, в долях статической нагрузки. */
  readonly oilShareAtDesignRate?: number;
  /** За сколько секунд стойка распрямляется с полного хода. */
  readonly recoilSeconds?: number;
}

/**
 * Газовый столб по двум точкам кривой: статике и упору.
 *
 *   F(sag)    = W
 *   F(stroke) = K·W
 *
 * Двух уравнений хватает на две неизвестных — `preload` и `gasLength`. Второе
 * замкнутой формулы не имеет, поэтому берётся делением пополам: функция
 * отношения по длине столба строго монотонна, и сорока итераций хватает
 * с запасом.
 */
function gasColumnLength(
  stroke: number,
  staticSag: number,
  compressedLoadFactor: number,
  polytropic: number,
): number {
  const ratio = (gasLength: number) =>
    (Math.pow(gasLength / (gasLength - stroke), polytropic) - 1) /
    (Math.pow(gasLength / (gasLength - staticSag), polytropic) - 1);
  let low = stroke * (1 + 1e-6);
  let high = stroke * 1e6;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    if (ratio(middle) > compressedLoadFactor) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

export function oleoStrut(options: OleoStrutOptions): SupportStrut {
  const common = mountingCommon(options);
  const polytropic = options.polytropic ?? 1.3;
  const staticSagShare = options.staticSagShare ?? 0.25;
  const requested = options.compressedLoadFactor ?? 6;
  const coilLimit = 1 / staticSagShare;
  const designSinkRate = options.designSinkRate ?? 2;
  const oilShare = options.oilShareAtDesignRate ?? 2;
  const recoilSeconds = options.recoilSeconds ?? 0.9;
  const gasLength =
    requested > coilLimit
      ? gasColumnLength(
          options.stroke,
          common.staticSag,
          requested,
          polytropic,
        )
      : Number.POSITIVE_INFINITY;
  const preload = Number.isFinite(gasLength)
    ? options.staticLoad /
      (Math.pow(gasLength / (gasLength - common.staticSag), polytropic) - 1)
    : options.staticLoad / common.staticSag;
  const compressedLoad = Math.max(requested, coilLimit) * options.staticLoad;
  return {
    id: options.id,
    mount: options.mount,
    axis: common.axis,
    extendedReach: common.extendedReach,
    stroke: options.stroke,
    staticSag: common.staticSag,
    spring: { preload, gasLength, polytropic },
    damper: {
      compressionLinear: 0,
      compressionQuadratic:
        (oilShare * options.staticLoad) / (designSinkRate * designSinkRate),
      // Отбой линеен: клапан почти закрыт, течение ламинарное. Коэффициент —
      // это требование «распрямиться за столько-то секунд с полного хода».
      recoilLinear: (compressedLoad * recoilSeconds) / options.stroke,
      recoilQuadratic: 0,
    },
    supportedMass: common.supportedMass,
    grip: common.grip,
    slipStiffness: common.slipStiffness,
  };
}

// ---------------------------------------------------------------------------
// УБОРКА
//
// Складывание ноги — НЕ ФИЗИКА, и притворяться ею не должно: масса ног у этой
// машины 1.7% от машины на плече в полметра, и пересчёт тензора инерции каждый
// кадр стоил бы дороже всего, что этот пересчёт дал бы. Поэтому уборка живёт
// в рендере — как и поворот колеса.
//
// Одно следствие у неё всё-таки настоящее, и брать его нужно обязательно:
// убранная нога НЕ ДЕРЖИТ. Опора с ненулевой уборкой отдаёт нулевую реакцию, и
// садиться такой машине придётся на брюхо — со всеми последствиями по общему
// закону материалов. Это не поправка здесь, это отсутствие поправки.
// ---------------------------------------------------------------------------

/** Цапфа, вокруг которой нога уходит к корпусу. */
export interface StrutRetraction {
  /** Точка на оси цапфы, авторские оси машины. */
  readonly pivot: SceneVector3;
  /** Ось цапфы, авторские оси. Нормируется. */
  readonly hinge: SceneVector3;
  /** Угол полностью убранной ноги, рад, со знаком. */
  readonly angle: number;
  /** За сколько секунд нога уходит и возвращается. */
  readonly seconds: number;
}

/**
 * Угол уборки ПО ГЕОМЕТРИИ, а не по вкусу: столько, чтобы пятка ушла под
 * заданную высоту, не дальше. Нога вращается в плоскости, перпендикулярной
 * цапфе, поэтому дело сводится к плоской задаче о точке на окружности.
 *
 * Внутрь — это к продольной оси: у левой ноги пятка приходит в +x, у правой в
 * −x. Знак поэтому берётся от того, с какого борта нога, а не назначается.
 */
export function strutRetractionAngle(options: {
  readonly pivot: SceneVector3;
  readonly foot: SceneVector3;
  /** Куда должна прийти пятка по высоте: под брюхо, но не в него. */
  readonly tuckedHeight: number;
}): number {
  const across = options.foot[0] - options.pivot[0];
  const rise = options.foot[1] - options.pivot[1];
  const radius = Math.hypot(across, rise);
  if (!(radius > EPSILON)) {
    return 0;
  }
  const start = Math.atan2(rise, across);
  const target = clamp(
    (options.tuckedHeight - options.pivot[1]) / radius,
    -1,
    1,
  );
  const tucked = Math.asin(target);
  const end = across < 0 ? tucked : Math.PI - tucked;
  const turn = end - start;
  return Math.atan2(Math.sin(turn), Math.cos(turn));
}

/**
 * Мягкие концы хода без единой лишней переменной состояния: доля идёт линейно,
 * угол — по сглаженной. Механизм трогается и останавливается плавно, а рантайму
 * по-прежнему нужно хранить одно число.
 */
export function strutFoldAngle(
  retraction: StrutRetraction,
  fraction: number,
): number {
  const value = clamp(fraction, 0, 1);
  return retraction.angle * value * value * (3 - 2 * value);
}

/**
 * Куда уезжает точка ноги при данном угле уборки. Поворот вокруг ЧУЖОЙ оси
 * (цапфы) раскладывается на поворот вокруг собственного центра куска, который
 * делает рендерер, и вот этот сдвиг центра.
 */
export function strutFoldOffset(
  retraction: StrutRetraction,
  angle: number,
  point: SceneVector3,
): SceneVector3 {
  if (Math.abs(angle) < EPSILON) {
    return [0, 0, 0];
  }
  const axis = normalize(retraction.hinge);
  const arm: SceneVector3 = [
    point[0] - retraction.pivot[0],
    point[1] - retraction.pivot[1],
    point[2] - retraction.pivot[2],
  ];
  // Родригес: поворот плеча вокруг оси цапфы.
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const along =
    axis[0] * arm[0] + axis[1] * arm[1] + axis[2] * arm[2];
  const crossed: SceneVector3 = [
    axis[1] * arm[2] - axis[2] * arm[1],
    axis[2] * arm[0] - axis[0] * arm[2],
    axis[0] * arm[1] - axis[1] * arm[0],
  ];
  return [
    arm[0] * cosine + crossed[0] * sine + axis[0] * along * (1 - cosine) - arm[0],
    arm[1] * cosine + crossed[1] * sine + axis[1] * along * (1 - cosine) - arm[1],
    arm[2] * cosine + crossed[2] * sine + axis[2] * along * (1 - cosine) - arm[2],
  ];
}

/**
 * Паспорт стойки БЕЗ НАГРУЗКИ: всё, что знает автор машины, и ничего, что
 * зависит от её массы. Массу считает рантайм из настоящих кусков, и она
 * меняется по ходу боя, поэтому статическая нагрузка в паспорте была бы
 * враньём с первого же оторванного куска.
 */
export type SupportStrutPlan = Omit<OleoStrutOptions, "staticLoad">;

/**
 * Собрать стойки под измеренную машину: развесовка по расстановке пяток,
 * дальше каждая стойка выводит свои числа из своей доли веса.
 */
export function buildSupportStruts(
  plans: readonly SupportStrutPlan[],
  weight: number,
  centreOfMass: SceneVector3,
): readonly SupportStrut[] {
  const feet = plans.map((plan) => {
    const axis = normalize(plan.axis);
    const reach = (plan.mount[1] - (plan.groundHeight ?? 0)) / Math.abs(axis[1]);
    return [
      plan.mount[0] + axis[0] * reach,
      plan.mount[1] + axis[1] * reach,
      plan.mount[2] + axis[2] * reach,
    ] as SceneVector3;
  });
  const shares = strutWeightShares(feet, centreOfMass);
  return plans.map((plan, index) =>
    oleoStrut({ ...plan, staticLoad: weight * Math.max(0, shares[index]) }),
  );
}

/**
 * Смещение подвижной части ноги относительно АВТОРСКОЙ позы, в осях машины.
 *
 * Авторская поза нарисована под статической нагрузкой, поэтому нулю обжатия
 * соответствует не ноль смещения: сжатая сверх статики стойка убирает шток
 * ВВЕРХ вдоль своей оси, разгруженная — выпускает его вниз. Возвращённый
 * вектор идёт прямо в артикуляцию члена кластера.
 */
export function strutVisualSlide(
  strut: SupportStrut,
  compression: number,
): SceneVector3 {
  const travel = strut.staticSag - clamp(compression, 0, strut.stroke);
  return [
    strut.axis[0] * travel,
    strut.axis[1] * travel,
    strut.axis[2] * travel,
  ];
}

export interface CoilStrutOptions extends StrutMountingOptions {
  /** Относительное демпфирование. 1 — критическое, без раскачки и без отбоя. */
  readonly dampingRatio?: number;
}

/**
 * Витая пружина с обычным амортизатором: подвеска автомобиля. Тот же закон при
 * бесконечном газовом столбе — жёсткость выводится из осадки, демпфирование из
 * относительного, ровно как у машины.
 */
export function coilStrut(options: CoilStrutOptions): SupportStrut {
  const common = mountingCommon(options);
  const stiffness = options.staticLoad / common.staticSag;
  const damping =
    2 *
    (options.dampingRatio ?? 0.32) *
    Math.sqrt(stiffness * common.supportedMass);
  return {
    id: options.id,
    mount: options.mount,
    axis: common.axis,
    extendedReach: common.extendedReach,
    stroke: options.stroke,
    staticSag: common.staticSag,
    spring: {
      preload: stiffness,
      gasLength: Number.POSITIVE_INFINITY,
      polytropic: 1,
    },
    damper: {
      compressionLinear: damping,
      compressionQuadratic: 0,
      recoilLinear: damping,
      recoilQuadratic: 0,
    },
    supportedMass: common.supportedMass,
    grip: common.grip,
    slipStiffness: common.slipStiffness,
  };
}

/**
 * Доли веса на стойках из плана расстановки: где стоят пятки и где висит центр
 * масс. Считается один раз при сборке паспорта — в полёте доли не нужны, там
 * всё делает сама расстановка сил.
 *
 * ЧЕТЫРЁХОПОРНАЯ МАШИНА СТАТИЧЕСКИ НЕОПРЕДЕЛИМА: три уравнения равновесия
 * (сумма сил и два момента) не задают четыре реакции, и лишняя степень
 * свободы — это «перекос по диагонали», который в жизни решают жёсткости, а
 * не статика. Здесь берётся решение наименьшей нормы: единственное, которое
 * не выдумывает перекоса. На прямоугольной расстановке оно совпадает с
 * обычным рычагом по двум осям, а на любой другой остаётся определённым.
 */
export function strutWeightShares(
  feet: readonly SceneVector3[],
  centreOfMass: SceneVector3,
): readonly number[] {
  if (feet.length === 0) {
    return [];
  }
  // Строки: сумма долей, момент вокруг оси x, момент вокруг оси z.
  const rows: Vector3[] = feet.map((foot) => [
    1,
    foot[0] - centreOfMass[0],
    foot[2] - centreOfMass[2],
  ]);
  // Наименьшая норма: shares = Aᵀ(AAᵀ)⁻¹·[1, 0, 0].
  const gram = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        gram[i * 3 + j] += row[i] * row[j];
      }
    }
  }
  const determinant =
    gram[0] * (gram[4] * gram[8] - gram[5] * gram[7]) -
    gram[1] * (gram[3] * gram[8] - gram[5] * gram[6]) +
    gram[2] * (gram[3] * gram[7] - gram[4] * gram[6]);
  if (Math.abs(determinant) < EPSILON) {
    // Пятки на одной прямой: моменты вырождены, делим поровну.
    return feet.map(() => 1 / feet.length);
  }
  // Нужен только первый столбец обратной матрицы: правая часть — [1, 0, 0].
  const lambda: Vector3 = [
    (gram[4] * gram[8] - gram[5] * gram[7]) / determinant,
    -(gram[3] * gram[8] - gram[5] * gram[6]) / determinant,
    (gram[3] * gram[7] - gram[4] * gram[6]) / determinant,
  ];
  return rows.map(
    (row) => row[0] * lambda[0] + row[1] * lambda[1] + row[2] * lambda[2],
  );
}
