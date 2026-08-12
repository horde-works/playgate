/**
 * РАСХОЖДЕНИЕ В ВОЗДУХЕ — инстинкт на одно измерение богаче нашего.
 *
 * Задача Igor (12.08.2026): «Инстинкт нас заставляет избегать столкновений.
 * Мы ходим двумерно — инстинкт двумерный. Но для трёхмерной машины он больше
 * на одно измерение».
 *
 * И наблюдение оттуда же, которое задаёт форму правила: «все кейсы, где они
 * сталкивались, — вертикальные или вертикально-диагональные». Это не
 * случайность полигона. Машины идут по авторским трассам, разведённым в
 * плане, и сходятся они там, где трассы пересекаются ПО ВЫСОТЕ, — то есть
 * ровно в том измерении, которого у двумерного инстинкта нет.
 *
 * ПРАВИЛО: ВЫШЕ — ВВЕРХ, НИЖЕ — ВНИЗ.
 *
 * У него есть свойство, ради которого оно и выбрано: оно РАЗРЕШАЕТСЯ БЕЗ
 * ПЕРЕГОВОРОВ. Обе машины считают одно и то же по одним и тем же наблюдаемым
 * величинам и получают противоположные ответы — расхождение растёт вдвое
 * быстрее, чем если бы уступала одна. Морское «оба вправо» устроено так же и
 * по той же причине; здесь у него просто на одну ось больше.
 *
 * Ничьи разрешаются ИМЕНЕМ БОРТА, а не случайностью: на равной высоте
 * сравниваются опознавательные строки, и меньшая идёт вверх. Это некрасиво и
 * абсолютно надёжно — а бросок монеты у двух машин даёт одинаковый ответ в
 * половине случаев, и это ровно те случаи, ради которых модуль написан.
 *
 * Модуль чистый: ни React, ни Rapier, ни имён машин. На входе снимки, на
 * выходе единичный вектор.
 */

import type { SceneVector3 } from "./destructionScene.ts";

const EPSILON = 1e-6;

/** Наблюдаемое о чужом борте. Ровно столько, сколько видно снаружи. */
export interface SeparationTraffic {
  readonly id: string;
  readonly centre: SceneVector3;
  readonly velocity: SceneVector3;
  /** Радиус описанной сферы по габариту, м. */
  readonly radius: number;
}

export interface SeparationSelf extends SeparationTraffic {}

export interface SeparationEnvelope {
  /**
   * Промах, который считается достаточным, м. Считается ПО ГАБАРИТАМ: к нему
   * прибавляются радиусы обеих машин, иначе большой борт расходился бы по
   * меркам маленького.
   */
  readonly minimumMiss: number;
  /** Дальше этого времени до сближения тревожиться рано, с. */
  readonly horizonSeconds: number;
  /**
   * Высота, ниже которой вниз нельзя. Уступать дорогу, вжимаясь в грунт, —
   * это обменять одно столкновение на другое; у палубы нижний уходит вбок.
   */
  readonly deck: number;
}

export const DEFAULT_SEPARATION_ENVELOPE: SeparationEnvelope = {
  // Три габарита между бортами — это видно как расхождение, а не как
  // «пронесло». Меньше — и зритель считает промах случайностью.
  minimumMiss: 14,
  // Восемь секунд: на скорости полигона это полтораста метров, и манёвр
  // успевает быть плавным. Больше — и машины начинают шарахаться от бортов,
  // с которыми разошлись бы сами.
  horizonSeconds: 8,
  deck: 6,
};

export interface ClosestApproach {
  /** Время до наибольшего сближения, с. Ноль — уже минимум или расходятся. */
  readonly seconds: number;
  /** Расстояние между центрами в этот миг, м. */
  readonly miss: number;
  /** Куда будет смещён чужой борт относительно нас в этот миг. */
  readonly offset: SceneVector3;
}

/**
 * НАИБОЛЬШЕЕ СБЛИЖЕНИЕ — замкнутым решением, а не перебором шагов.
 *
 * Относительное движение прямолинейно, поэтому минимум расстояния берётся
 * производной: t = −(r·v)/(v·v). Отрицательное время означает, что минимум
 * позади — борта уже расходятся, и тревожиться не о чем.
 */
export function closestApproach(
  self: SeparationTraffic,
  other: SeparationTraffic,
): ClosestApproach {
  const relative: SceneVector3 = [
    other.centre[0] - self.centre[0],
    other.centre[1] - self.centre[1],
    other.centre[2] - self.centre[2],
  ];
  const closing: SceneVector3 = [
    other.velocity[0] - self.velocity[0],
    other.velocity[1] - self.velocity[1],
    other.velocity[2] - self.velocity[2],
  ];
  const speedSquared =
    closing[0] * closing[0] + closing[1] * closing[1] + closing[2] * closing[2];
  const seconds =
    speedSquared < EPSILON
      ? 0
      : Math.max(
          0,
          -(
            relative[0] * closing[0] +
            relative[1] * closing[1] +
            relative[2] * closing[2]
          ) / speedSquared,
        );
  const offset: SceneVector3 = [
    relative[0] + closing[0] * seconds,
    relative[1] + closing[1] * seconds,
    relative[2] + closing[2] * seconds,
  ];
  return {
    seconds,
    miss: Math.hypot(offset[0], offset[1], offset[2]),
    offset,
  };
}

export interface SeparationDecision {
  /** С кем расходимся. */
  readonly withId: string;
  /** Куда уходить, единичный вектор в мировых осях. */
  readonly direction: SceneVector3;
  /** Насколько срочно: от нуля на горизонте до единицы у самого борта. */
  readonly urgency: number;
  readonly approach: ClosestApproach;
}

export interface SeparationInput {
  readonly self: SeparationSelf;
  readonly traffic: readonly SeparationTraffic[];
  /** Высота грунта под машиной, м. Ниже неё вниз нельзя. */
  readonly groundHeight: number;
  /**
   * Борт, от которого расходиться НЕ НАДО. Ровно один и по имени: охотник,
   * идущий в атаку, обязан сближаться со своей целью, и инстинкт расхождения
   * для него в этот миг — не осторожность, а срыв задачи.
   */
  readonly exemptId?: string;
  readonly envelope?: SeparationEnvelope;
}

/**
 * РЕШЕНИЕ О РАСХОЖДЕНИИ или `null`, если расходиться не с кем.
 *
 * Из всех бортов берётся ОДИН — самый срочный. Складывать уклонения от
 * нескольких нельзя: сумма двух разумных уходов регулярно даёт третий,
 * ведущий ровно между ними.
 */
export function separationDecision(
  input: SeparationInput,
): SeparationDecision | null {
  const envelope = input.envelope ?? DEFAULT_SEPARATION_ENVELOPE;
  let worst: SeparationDecision | null = null;
  for (const other of input.traffic) {
    if (other.id === input.self.id || other.id === input.exemptId) {
      continue;
    }
    const approach = closestApproach(input.self, other);
    if (approach.seconds > envelope.horizonSeconds) {
      continue;
    }
    const wanted = envelope.minimumMiss + input.self.radius + other.radius;
    if (approach.miss >= wanted) {
      continue;
    }
    // Срочность растёт и от близости промаха, и от близости времени. Первое
    // говорит, насколько плохо разойдёмся, второе — успеем ли что-то сделать.
    const byDistance = 1 - approach.miss / wanted;
    const byTime = 1 - approach.seconds / envelope.horizonSeconds;
    const urgency = Math.max(0, Math.min(1, byDistance * 0.5 + byTime * 0.5));
    if (worst && worst.urgency >= urgency) {
      continue;
    }
    worst = {
      withId: other.id,
      direction: separationDirection(input, other, approach, envelope),
      urgency,
      approach,
    };
  }
  return worst;
}

/**
 * КУДА УХОДИТЬ. Вертикаль — первый ответ, бок — запасной.
 */
function separationDirection(
  input: SeparationInput,
  other: SeparationTraffic,
  approach: ClosestApproach,
  envelope: SeparationEnvelope,
): SceneVector3 {
  const higher = whoGoesUp(input.self, other);
  const headroom = input.self.centre[1] - input.groundHeight;
  // У ПАЛУБЫ ВНИЗ НЕЛЬЗЯ. Нижний борт, которому некуда снижаться, уходит
  // вбок — и именно вбок, а не вверх: вверх идёт другой, и подъём обоих
  // сведёт их точно так же, как если бы не расходился никто.
  if (!higher && headroom < envelope.deck) {
    return sideStep(input.self, other, approach);
  }
  // Чистая вертикаль читается зрителем как расхождение и стоит машине
  // меньше всего: подъём у винтокрылой — самый прямой её манёвр.
  return higher ? [0, 1, 0] : [0, -1, 0];
}

/**
 * КТО ИДЁТ ВВЕРХ. Выше — вверх; на равной высоте решает имя борта.
 *
 * Порог равенства не косметический: без него две машины с разницей в
 * сантиметр меняются ролями от кадра к кадру, и обе дёргаются на месте
 * вместо расхождения.
 */
function whoGoesUp(self: SeparationTraffic, other: SeparationTraffic): boolean {
  const difference = self.centre[1] - other.centre[1];
  const TIE = 1.5;
  if (Math.abs(difference) > TIE) {
    return difference > 0;
  }
  return self.id < other.id;
}

/**
 * УХОД ВБОК: поперёк линии наибольшего сближения, в горизонте.
 *
 * Берётся именно горизонтальная составляющая промаха, вывернутая наружу: это
 * кратчайший путь увеличить промах, не трогая высоту.
 */
function sideStep(
  self: SeparationTraffic,
  other: SeparationTraffic,
  approach: ClosestApproach,
): SceneVector3 {
  const flat = Math.hypot(approach.offset[0], approach.offset[2]);
  if (flat > EPSILON) {
    return [-approach.offset[0] / flat, 0, -approach.offset[2] / flat];
  }
  // Борта строго друг над другом: горизонтального промаха нет вовсе, и
  // выворачивать нечего. Уходим поперёк собственного хода — это единственное
  // направление, которое у машины в этот миг осмысленно.
  const speed = Math.hypot(self.velocity[0], self.velocity[2]);
  if (speed > EPSILON) {
    return [-self.velocity[2] / speed, 0, self.velocity[0] / speed];
  }
  // Ни промаха, ни хода. Имя борта решает и здесь — лишь бы не одинаково.
  return self.id < other.id ? [1, 0, 0] : [-1, 0, 0];
}
