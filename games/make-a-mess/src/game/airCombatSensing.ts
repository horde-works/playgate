/**
 * БОЕВОЕ ЗРЕНИЕ: как мир превращается в снимки, по которым живёт бой.
 *
 * Модуль отвечает на один вопрос — ЧТО МАШИНА ВИДИТ — и ни на один сверх.
 * Куда её вести, стрелять ли и как держать позу решают соседи
 * (`airCombatPilot`, `vehicleGunnery`, `airCombatPosture`); здесь только
 * перевод состояния мира в `AirCombatTrack` и `AirCombatOwnState`.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Раньше эта полусотня строк жила прямо в
 * `VehicleFrameSystem.tsx`, внутри покадрового цикла. Пока потребитель был
 * один — автомат нападения, — это не мешало. Но у зрения потребителей будет
 * больше: уклонение — это ровно то же самое зрение, только смотрит жертва, а
 * не охотник. Оставить сборку внутри компонента значило приговорить второго
 * потребителя либо родиться внутри того же компонента, либо продублировать
 * цикл. Отсюда правило, ради которого файл и заведён: ЗРЕНИЕ ОБЩЕЕ, РЕШЕНИЕ
 * ЧАСТНОЕ.
 *
 * Здесь нет ни React, ни Rapier, ни three, ни имён конкретных машин: на входе
 * структурные снимки, на выходе числа. Поэтому тест исполняет ровно тот код,
 * который летает.
 *
 * ГРАНИЦА СЛЕПОТЫ намеренная и держится (`docs/air-combat-lessons.md`, §2):
 * наружу видно положение, скорость, вращение, габарит и кольца движителей —
 * и НЕ видно маршрута, прогресса по нему, будущих точек и определения машины.
 * Экстраполятор, знающий чужой план, берёт идеальное упреждение и разбирает
 * цель за два попадания.
 */

import { rotateVector, type Quaternion } from "./clusterDynamics.ts";
import type { SceneVector3 } from "./destructionScene.ts";
import type { CommandActuatorBinding } from "./vehicleActuation.ts";
import { propulsionHealth } from "./vehiclePropulsionAutomation.ts";
import { allegianceOf, type VehicleAllegiance } from "./vehicleAllegiance.ts";
import type { AirCombatTrack } from "./vehicleGunnery.ts";
import type { AirCombatOwnState } from "./airCombatPilot.ts";
import type { BodyReport } from "./airCombatPosture.ts";

/**
 * Габаритная коробка кадра в его собственных осях. Объявлена здесь, а не
 * взята из описания кадра целиком, ровно затем, чтобы зрению нельзя было
 * дотянуться до остального паспорта.
 */
export interface SightedBounds {
  readonly minimum: SceneVector3;
  readonly maximum: SceneVector3;
}

/**
 * ПАСПОРТНАЯ ЧАСТЬ ЧУЖОГО БОРТА — то, что не меняется от кадра к кадру.
 *
 * Интерфейс структурный: описание кадра из рантайма подходит под него как
 * есть, ничего сужать и оборачивать не надо. Это же и защита — добавить сюда
 * маршрут физически некуда, не расширив тип, а расширение видно в диффе.
 */
export interface SightedFrame {
  readonly id: string;
  readonly clusterId: string;
  /**
   * Сторона. Не объявлена — борт вне боя вовсе: он не цель и не наблюдаемый.
   * Мирным этот признак и не ставят (`vehicleAllegiance.ts`).
   */
  readonly allegiance?: VehicleAllegiance;
  readonly localBounds: SightedBounds;
  readonly actuators: readonly CommandActuatorBinding[];
  readonly flight: {
    readonly limits: { readonly enginePoints: readonly SceneVector3[] };
  };
}

/**
 * ПОКАДРОВАЯ ЧАСТЬ — где борт сейчас и что с ним.
 *
 * `flight` и `recovery` объявлены как `object | null` намеренно: зрению нужен
 * ровно факт «летит / отказал», а не содержимое. Тип, который нельзя прочесть,
 * нельзя и подсмотреть.
 */
export interface SightedState {
  readonly body: {
    readonly position: SceneVector3;
    readonly orientation: Quaternion;
    readonly velocity: SceneVector3;
    readonly angularVelocity: SceneVector3;
  };
  /** Масса не посчитана — борт ещё не собран, и видеть его нечем. */
  readonly mass: { readonly centre: SceneVector3 } | null;
  /** Полётное состояние: `null` — не в воздухе. */
  readonly flight: object | null;
  /**
   * Аварийное состояние. Отказавший борт из боя выпадает — но НЕ ВЕСЬ ЦИКЛ.
   *
   * Фаза `arrival` — это машина, которая уже летит к своему берту своим ходом:
   * она жива, видна и по всем правилам является целью. Прежде сюда смотрели
   * одним вопросом «есть ли авария», и прибывающая машина была для охотника
   * невидимкой — он спокойно давал ей сесть и снова взлететь (наблюдение
   * Igor, 11.08.2026).
   */
  readonly recovery: { readonly lifecycle: { readonly phase: string } } | null;
  readonly supportContacts: number;
}

/**
 * Доступ к миру двумя вопросами. Именно функциями, а не готовыми массивами:
 * состояния живут в рантайме изменяемыми картами, и копировать их целиком
 * ради одного кадра было бы дороже самого зрения.
 */
export interface SightedWorld {
  readonly stateOf: (frameId: string) => SightedState | undefined;
  /**
   * Члены кластера, ещё физически висящие на борту. Оторванная гондола
   * перестаёт числиться и тем самым перестаёт давать тягу.
   */
  readonly attachedTo: (clusterId: string) => ReadonlySet<string>;
}

/**
 * РАДИУС ОПИСАННОЙ СФЕРЫ по габариту, м.
 *
 * Берётся большая из горизонтальных сторон, а не диагональ и не высота:
 * попадание считается по габариту в плане, машины полигона плоские, и
 * вертикаль дала бы систематически заниженный радиус у винтокрылых.
 */
export function frameHalfSpan(bounds: SightedBounds): number {
  return (
    Math.max(
      bounds.maximum[0] - bounds.minimum[0],
      bounds.maximum[2] - bounds.minimum[2],
    ) / 2
  );
}

/** Центр масс борта в мировых осях. */
export function sightedCentre(
  position: SceneVector3,
  massCentre: SceneVector3,
): SceneVector3 {
  return [
    massCentre[0] + position[0],
    massCentre[1] + position[1],
    massCentre[2] + position[2],
  ];
}

/**
 * ЧУЖИЕ БОРТА В ВОЗДУХЕ, снимками.
 *
 * Отбор здесь ТОЛЬКО по наблюдаемости: сам себя борт не видит, борт без
 * стороны в бою не участвует, несобранный борт не имеет положения. Свой-чужой
 * СЮДА НЕ ВХОДИТ намеренно — выбор цели принадлежит автомату
 * (`airCombatPilot`), и уклонению нужен ровно тот же список, только смотреть
 * он будет на охотника, а не на добычу. Отфильтруй здесь по вражде — и второй
 * потребитель получит список, из которого вычеркнут именно тот, кто ему нужен.
 */
export function airCombatTracks(
  observerId: string,
  frames: readonly SightedFrame[],
  world: SightedWorld,
): AirCombatTrack[] {
  const tracks: AirCombatTrack[] = [];
  for (const other of frames) {
    if (other.id === observerId || !other.allegiance) {
      continue;
    }
    const state = world.stateOf(other.id);
    if (!state?.mass) {
      continue;
    }
    const massCentre = state.mass.centre;
    const centre = sightedCentre(state.body.position, massCentre);
    const enginePoints = other.flight.limits.enginePoints;
    const health = propulsionHealth(
      other.actuators,
      world.attachedTo(other.clusterId),
      enginePoints.length,
    ).fractions;
    tracks.push({
      id: other.id,
      allegiance: other.allegiance,
      centre,
      velocity: state.body.velocity,
      // «Текущий манёвр» снаружи виден как вращение корпуса. У машины,
      // идущей носом по курсу, это и есть темп разворота её скорости;
      // краб даст расхождение, и это честная слепота наблюдателя.
      turnRate: state.body.angularVelocity[1],
      radius: frameHalfSpan(other.localBounds),
      weakPoints: enginePoints.map((point, index) => {
        const offset = rotateVector(state.body.orientation, [
          point[0] - massCentre[0],
          point[1] - massCentre[1],
          point[2] - massCentre[2],
        ]);
        return {
          point: [
            centre[0] + offset[0],
            centre[1] + offset[1],
            centre[2] + offset[2],
          ] as SceneVector3,
          health: health[index] ?? 1,
        };
      }),
      // Севшая цель не цель, отказавшая — тем более.
      landed: state.flight === null && state.supportContacts > 0,
      // Отказ — это всё, кроме подлёта к своему берту: подлетающий жив и
      // является целью.
      failed:
        state.recovery !== null &&
        state.recovery.lifecycle.phase !== "arrival",
    });
  }
  return tracks;
}

/** Что нужно знать о СЕБЕ сверх того, что видно снаружи о любом борте. */
export interface SightedSelf {
  /** АВТОРСКИЙ нос в осях кадра: поза строится поворотом от позы покоя. */
  readonly nose: SceneVector3;
}

/**
 * СНИМОК СЕБЯ. Всё измеримо, ничего не «сообщается».
 *
 * Отдельная функция нужна затем же, зачем `airCombatTracks`: уклонению
 * понадобится ровно этот снимок, и вывод осей — нос, ствол, правый борт —
 * обязан быть ОДНИМ на всех потребителей. Соглашение проекта тут ровно одно
 * (`pitchAxisOf(nose) = (−nz, nx)`), и второй его вывод в другом файле — это
 * второй шанс ошибиться знаком.
 *
 * Центр масс приходит ОТДЕЛЬНЫМ доводом, а не читается из состояния: у себя
 * он к этому месту уже посчитан и проверен на существование, и заставлять
 * вызывающего доказывать это второй раз значит просить его пересобрать
 * состояние ради одного поля.
 */
export function airCombatOwnState(
  frame: SightedFrame & SightedSelf,
  state: SightedState & {
    /**
     * Отчёт тела о прошлом кадре. Отсутствие означает «мне не докладывают», и
     * тогда машина считает, что держит себя (`airCombatPosture.ts`).
     */
    readonly rotorBody?: BodyReport | null;
  },
  massCentre: SceneVector3,
): AirCombatOwnState {
  const gunAxis = rotateVector(state.body.orientation, frame.nose);
  // Плоская проекция ствола. Ноль здесь физически означает ствол в зенит:
  // горизонтального курса у такой позы нет, и единица — единственный ответ,
  // который не порождает NaN в потребителе.
  const flatGun = Math.hypot(gunAxis[0], gunAxis[2]) || 1;
  return {
    allegiance: allegianceOf(frame),
    centre: sightedCentre(state.body.position, massCentre),
    velocity: state.body.velocity,
    nose: [gunAxis[0] / flatGun, gunAxis[2] / flatGun],
    gunAxis,
    starboard: rotateVector(state.body.orientation, [
      -frame.nose[2],
      0,
      frame.nose[0],
    ]),
    verticalSpeed: state.body.velocity[1],
    radius: frameHalfSpan(frame.localBounds),
    body: state.rotorBody ?? undefined,
  };
}
