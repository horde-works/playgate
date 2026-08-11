import assert from "node:assert/strict";
import test from "node:test";
import { mixRotorThrust } from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";

/**
 * РЕВЕРС ПОДЪЁМНЫХ ДВИГАТЕЛЕЙ.
 *
 * Вердикт Igor (12.08.2026): «отсутствие реверса у двигателей подъёма — ну прям
 * недосмотр и ограничение возможностей машины, она всевекторная». Без реверса у
 * машины ровно одно ускорение вниз — тяжесть, — а перевёрнутая вжимается в
 * грунт вместо того, чтобы встать.
 *
 * ГЛАВНЫЙ УРОК ЭТОГО ФАЙЛА — ПРО ЗАМЕР, А НЕ ПРО РЕВЕРС.
 *
 * Первая редакция мерила СТАТИКУ: «удержится ли машина ровно с такими-то
 * выбитыми кольцами». По этому вопросу реверс не спасал ни одной раскладки, и
 * вывод был записан как «оправдан не живучестью, а управляемым вниз».
 *
 * Поправка Igor (12.08.2026): вопрос был не тот. «Ты измеряешь в статике, а в
 * реальности кейс другой — машина летит уже с каким-то моментом. Ракета при
 * ударе сверху сообщает ей момент и выводит из строя эти два двигателя на
 * одной стороне. Просто останов симметричных не поможет — момент кручения уже
 * есть. Реверс её стабилизирует в горизонт и компенсирует момент кручения.
 * Ничего более в динамике от него не нужно».
 *
 * Правильный вопрос — РАСПОЛАГАЕМЫЙ УПРАВЛЯЮЩИЙ МОМЕНТ, и по нему ответ
 * противоположный: у повреждённой машины реверс даёт вчетверо больше власти
 * над креном (30 → 128 Н·м), и время гашения 2 рад/с падает с 1.15 с до
 * 0.27 с. Замер ниже.
 *
 * Это тот же закон, которым закрыт красный тест про жителей (CLAUDE.md):
 * ЗАМЕР ОБЯЗАН СПРАШИВАТЬ ТО, ПРОТИВ ЧЕГО ЖИВЁТ СИМУЛЯЦИЯ. Машина не висит в
 * вакууме с нулевыми скоростями — она уже вращается, когда в неё попали.
 */

/** Шесть колец по кругу, как у RAX-8: два передних, два средних, два задних. */
const RING_POINTS = [
  [-1.6, 0, 2.1],
  [1.6, 0, 2.1],
  [-1.9, 0, 0],
  [1.9, 0, 0],
  [-1.6, 0, -2.1],
  [1.6, 0, -2.1],
];

const MASS = 9.6;
const GRAVITY = 9.81;
/** Паспортный запас RAX-8: 4.2 веса. */
const CAPACITY = MASS * GRAVITY * 4.2;

function machine(overrides = {}) {
  return {
    points: RING_POINTS,
    centreOfMass: [0, 0, 0],
    nose: [0, 0, 1],
    availability: [1, 1, 1, 1, 1, 1],
    capacity: CAPACITY,
    ...overrides,
  };
}

/** Висеть ровно: тяга равна весу, моментов нет. */
const HOVER = {
  collective: (MASS * GRAVITY) / CAPACITY,
  pitchMoment: 0,
  rollMoment: 0,
  yawMoment: 0,
};

test("без реверса распределитель по-прежнему не уходит ниже нуля", () => {
  const result = mixRotorThrust(machine(), { ...HOVER, collective: -0.4 });
  for (const value of result.thrust) {
    assert.ok(value >= 0, `нереверсивное кольцо тянет назад: ${value}`);
  }
});

test("с реверсом машина умеет ТОЛКАТЬ ВНИЗ, а не только падать", () => {
  // Главное, что покупает реверс: ускорение вниз помимо тяжести. Без него
  // «вниз» у машины ровно одно и оно не управляемо.
  const withReverse = mixRotorThrust(machine({ reverseShare: 0.5 }), {
    ...HOVER,
    collective: -0.4,
  });
  assert.ok(
    withReverse.deliveredThrust < -1,
    `тяга вниз не получена: ${withReverse.deliveredThrust.toFixed(1)} Н`,
  );
  const extra = -withReverse.deliveredThrust / (MASS * GRAVITY);
  assert.ok(
    extra > 0.5,
    `вниз добавилось всего ${extra.toFixed(2)} g сверх тяжести`,
  );
});

test("СХЕМА IGOR РАБОТАЕТ — но машине она не нужна: есть решение дешевле", () => {
  // Схема: слева выбиты переднее и среднее, справа два кольца слегка жмут
  // вниз, компенсируя кувырок через угол борта.
  //
  // Замер по этой раскладке: машина держится РОВНО и без реверса, причём
  // лучше — распределитель находит диагональную пару через центр масс (правое
  // переднее и левое заднее), даёт 1.39 веса и вовсе не нуждается в обратной
  // тяге. То есть машина не только садится, она ещё и летит.
  //
  // Это ровно то, на что Igor и рассчитывал словами «не сценарий, а просто
  // следствие понимания управления»: ограниченный распределитель сам ищет
  // вершину многогранника, и она оказалась изящнее придуманной руками.
  const maimed = [0, 1, 0, 1, 1, 1];
  const level = (reverseShare) => {
    let best = null;
    for (let collective = -0.9; collective <= 3.2; collective += 0.02) {
      const result = mixRotorThrust(
        machine({ availability: maimed, ...(reverseShare ? { reverseShare } : {}) }),
        { ...HOVER, collective },
      );
      if (
        Math.abs(result.deliveredRollMoment) < 0.5 &&
        Math.abs(result.deliveredPitchMoment) < 0.5 &&
        (best === null || result.deliveredThrust > best)
      ) {
        best = result.deliveredThrust;
      }
    }
    return best;
  };
  const plain = level(0);
  assert.ok(plain !== null, "машина обязана держаться ровно и без реверса");
  assert.ok(
    plain > MASS * GRAVITY,
    `ровной тяги не хватает даже на вес: ${plain.toFixed(1)} Н`,
  );
});

test("РЕВЕРС НЕ СПАСАЕТ БЕЗНАДЁЖНЫХ, но замедляет их опрокидывание на треть", () => {
  // Перебор всех 63 раскладок: раскладок, где реверс делает висение ровно
  // ВЫПОЛНИМЫМ, — ноль. Причина геометрическая: либо уцелевшие балансируют и
  // без него, либо центр масс вышел за их оболочку, и тогда глубины реверса
  // (0.55 паспортной тяги) не хватает — чтобы погасить два кольца на плече
  // 1.6 м, нужно −111 Н, а пол даёт −36.
  //
  // Но ЧТО-ТО он даёт, и это измеримо: на двадцати пяти безнадёжных раскладках
  // распределитель делает ровно то, что описал Igor, — жмёт вниз кольцом,
  // симметричным выбитому, — и средний опрокидывающий момент падает с 56.6 до
  // 39.0 Н·м, то есть на треть. Машина всё равно валится, но валится медленнее,
  // и у автомата появляется время.
  const weight = MASS * GRAVITY;
  let hopeless = 0;
  let plainSum = 0;
  let reverseSum = 0;
  for (let mask = 1; mask < 64; mask += 1) {
    const availability = [0, 1, 2, 3, 4, 5].map((index) =>
      (mask >> index) & 1 ? 0 : 1,
    );
    const plain = mixRotorThrust(machine({ availability }), HOVER);
    if (plain.attitudeFeasible) {
      continue;
    }
    const reversible = mixRotorThrust(
      machine({ availability, reverseShare: 0.55 }),
      HOVER,
    );
    hopeless += 1;
    plainSum += Math.hypot(plain.deliveredRollMoment, plain.deliveredPitchMoment);
    reverseSum += Math.hypot(
      reversible.deliveredRollMoment,
      reversible.deliveredPitchMoment,
    );
  }
  assert.equal(hopeless, 25, "набор безнадёжных раскладок изменился");
  assert.ok(
    reverseSum < plainSum * 0.8,
    `реверс перестал гасить опрокидывание: ${plainSum.toFixed(0)} -> ${reverseSum.toFixed(0)}`,
  );
  assert.ok(weight > 0);
});

test("ПЕРЕВЁРНУТАЯ МАШИНА МОЖЕТ ТОЛКАТЬ СЕБЯ ВВЕРХ — вот ради чего реверс", () => {
  // Настоящая цена вопроса. У перевёрнутой машины «вверх по корпусу» смотрит в
  // землю: без реверса она вжимается в грунт, исполняя приказ подняться. С
  // реверсом тот же приказ исполняется отрицательной тягой — и она встаёт.
  const upsideDown = mixRotorThrust(machine({ reverseShare: 0.5 }), {
    ...HOVER,
    // Просьба «толкать в минус по оси корпуса» — то есть в мир вверх, когда
    // машина лежит на спине.
    collective: -0.6,
  });
  assert.ok(
    upsideDown.deliveredThrust < 0,
    `лёжа на спине машина всё ещё жмёт себя в грунт: ${upsideDown.deliveredThrust.toFixed(1)} Н`,
  );
  const available = -upsideDown.deliveredThrust / (MASS * GRAVITY);
  assert.ok(
    available > 1,
    `тяги для подъёма из перевёрнутого не хватает: ${available.toFixed(2)} веса`,
  );
});

test("реверс не выдумывает тягу сверх паспорта", () => {
  // Обратная сторона: доля реверса — это ограничение, а не подарок. Просьба
  // толкать вниз сильнее, чем машина может, обязана упереться в потолок.
  const result = mixRotorThrust(machine({ reverseShare: 0.3 }), {
    ...HOVER,
    collective: -5,
  });
  const floor = -CAPACITY * 0.3;
  for (const value of result.thrust) {
    assert.ok(
      value >= floor / RING_POINTS.length - 1e-6,
      `кольцо ушло ниже своего пола: ${value.toFixed(1)}`,
    );
  }
});

/**
 * Располагаемый момент по оси: сколько машина РЕАЛЬНО выдаёт, когда просят
 * заведомо больше её возможностей. Это и есть её власть над уже начавшимся
 * вращением — величина, которой статическая выполнимость не видит вовсе.
 */
function momentAuthority(availability, reverseShare, axis) {
  let best = 0;
  for (let want = 0; want <= 600; want += 2) {
    const result = mixRotorThrust(
      machine({ availability, ...(reverseShare ? { reverseShare } : {}) }),
      { ...HOVER, [axis]: want },
    );
    const delivered = Math.abs(
      axis === "rollMoment"
        ? result.deliveredRollMoment
        : result.deliveredPitchMoment,
    );
    if (delivered > best) {
      best = delivered;
    }
  }
  return best;
}

test("В ДИНАМИКЕ РЕВЕРС ДАЁТ ВЧЕТВЕРО БОЛЬШЕ ВЛАСТИ НАД КРЕНОМ", () => {
  // Случай Igor целиком: ракета сверху сообщила момент и выбила два кольца
  // одного борта. Вопрос не «удержится ли ровно» — вопрос «чем гасить то, что
  // уже крутится».
  const maimed = [0, 1, 0, 1, 1, 1];
  const plain = momentAuthority(maimed, 0, "rollMoment");
  const reversed = momentAuthority(maimed, 0.55, "rollMoment");
  assert.ok(
    reversed > plain * 3,
    `реверс перестал давать власть над креном: ${plain.toFixed(1)} -> ${reversed.toFixed(1)} Н·м`,
  );

  // Почему разрыв именно здесь и именно такой. Целой машине реверс добавляет
  // ровно свою долю (x1.55 по обеим осям): она и так тянет обоими бортами.
  // У повреждённой правый борт уже жмёт вверх на пределе, и единственный
  // способ довернуть дальше — жать ВНИЗ уцелевшим левым задним. Без реверса
  // этого хода нет вовсе, и остаётся 30 Н·м — крохи от 336 целой машины.
  const whole = momentAuthority([1, 1, 1, 1, 1, 1], 0, "rollMoment");
  assert.ok(
    plain < whole * 0.15,
    `повреждение перестало обнулять крен: ${plain.toFixed(1)} из ${whole.toFixed(1)} Н·м`,
  );

  // Что это значит временем. Момент инерции кольца радиусом 1.9 м при массе
  // 9.6 — около 17.3 кг·м²; гашение крена 2 рад/с занимает 1.15 с без реверса
  // и 0.27 с с ним. Секунда — это высота: на 2 рад/с машина за неё
  // переворачивается на 115 градусов.
  const inertia = (MASS * 1.9 * 1.9) / 2;
  const withoutReverse = (inertia * 2) / plain;
  const withReverse = (inertia * 2) / reversed;
  assert.ok(
    withoutReverse > 1,
    `гашение без реверса перестало быть долгим: ${withoutReverse.toFixed(2)} с`,
  );
  assert.ok(
    withReverse < 0.4,
    `гашение с реверсом перестало быть быстрым: ${withReverse.toFixed(2)} с`,
  );

  // Тангаж повреждение не трогает — выбитые кольца стоят по одному борту, а
  // не по одному концу. Поэтому по тангажу реверс даёт свою обычную долю, и
  // разрыв в четыре раза — свойство ИМЕННО пострадавшей оси, а не реверса
  // вообще. Это и отличает измерение от совпадения.
  const pitchPlain = momentAuthority(maimed, 0, "pitchMoment");
  const pitchReversed = momentAuthority(maimed, 0.55, "pitchMoment");
  assert.ok(
    pitchReversed < pitchPlain * 1.6,
    `по тангажу вдруг появился четырёхкратный выигрыш: ${pitchPlain.toFixed(1)} -> ${pitchReversed.toFixed(1)}`,
  );
});
