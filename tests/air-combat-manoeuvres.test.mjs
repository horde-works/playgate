import assert from "node:assert/strict";
import test from "node:test";
import {
  aspectAngle,
  bearingTo,
  chooseAirManoeuvre,
  estimateAirManoeuvres,
  predictionHorizon,
  secondsToBoresight,
  timeToReach,
} from "../games/make-a-mess/src/game/airCombatManoeuvres.ts";

/**
 * ОЦЕНЩИК МАНЁВРОВ: проверяется не «работает ли», а ВЫБИРАЕТ ЛИ ОН ТО ЖЕ, ЧТО
 * ВЫБРАЛ БЫ ЧЕЛОВЕК, ПОНИМАЮЩИЙ ФИЗИКУ.
 *
 * Каждый кандидат обязан выигрывать в своей ситуации и проигрывать в чужой.
 * Оценщик, у которого один манёвр побеждает всегда, — это прежний рудимент под
 * новым именем, и такой тест его поймает.
 */

/** Паспорт RAX-8 в величинах манёвра — числа замеренные, не выдуманные. */
const RAX = {
  maximumSpeed: 21,
  lateralAcceleration: 14.5,
  surgeAcceleration: 24.8,
  yawRate: 0.72,
  firingRange: 46,
  minimumRange: 12,
  gunCone: 0.09,
  // Иммельман RAX-8 на 16 м/с: 5.1 с, и высоты он не ТРАТИТ, а набирает —
  // отсюда нулевая цена. Машине, у которой разворот делается петлёй вниз,
  // сюда пришёл бы её провал, и ворота этажа заработали бы сами.
  reversal: { seconds: 5.1, cost: 0 },
  floor: 6,
};

const still = (centre) => ({
  centre,
  velocity: [0, 0, 0],
  turnRate: 0,
});

const hunterAt = (centre, velocity = [21, 0, 0], nose = [1, 0]) => ({
  centre,
  velocity,
  nose,
});

test("ГОРИЗОНТ ПРЕДСКАЗАНИЯ — СВОЙСТВО ЧУЖОЙ ДУГИ, а не общая константа", () => {
  // Верить экстраполяции можно ровно столько, сколько цель остаётся в СВОЕЙ
  // дуге. Мера у дуги угловая: четверть оборота. Общая константа обслужить и
  // стометровую прямую, и сорокаметровый круг не может — это уже стоило
  // прогона.
  assert.equal(predictionHorizon({ turnRate: 0 }), 12, "прямой верят дольше всех");
  const lazy = predictionHorizon({ turnRate: 0.2 });
  const brisk = predictionHorizon({ turnRate: 0.8 });
  assert.ok(brisk < lazy, `вёрткой цели верят дольше: ${brisk} против ${lazy}`);
  assert.ok(predictionHorizon({ turnRate: 9 }) >= 2, "снизу горизонт подпёрт");
});

test("ВСТРЕЧА РЕШАЕТСЯ ПО БУДУЩЕМУ — И ТОЛЬКО КОГДА ДУГА ЗАГИБАЕТ КО МНЕ", () => {
  // Вся разница между «догнать» и «встретить» — в одном сравнении, и правда
  // тут у́же, чем хотелось бы. Цель идёт ТРИДЦАТЬ, я двадцать один: догнать
  // нельзя никогда. Но её собственный разворот может принести её мне навстречу
  // — а может унести. Оценщик обязан различать эти два случая, и различает он
  // их ЗНАКОМ, а не наличием кривизны.
  const crossing = { centre: [90, 30, 0], velocity: [0, 0, 30], turnRate: 0 };
  assert.equal(
    timeToReach([0, 30, 0], 21, crossing, 46),
    Number.POSITIVE_INFINITY,
    "идущая мимо и быстрее меня недостижима",
  );
  const inward = timeToReach([0, 30, 0], 21, { ...crossing, turnRate: -0.33 }, 46);
  assert.ok(
    Number.isFinite(inward) && inward < 4,
    `дуга, загибающая ко мне, обязана решаться: ${inward}`,
  );
  assert.equal(
    timeToReach([0, 30, 0], 21, { ...crossing, turnRate: 0.33 }, 46),
    Number.POSITIVE_INFINITY,
    "дуга, уводящая прочь, решения не даёт — и врать об этом нельзя",
  );
  // И решение обязано укладываться в СВОЙ горизонт: за его пределом это уже не
  // предсказание, а выдумка.
  assert.ok(inward <= predictionHorizon({ turnRate: -0.33 }));
});

test("ЦЕЛЬ, КОТОРАЯ БЫСТРЕЕ И ИДЁТ ПРЯМО, НЕ ПЕРЕХВАТЫВАЕТСЯ — и это ОТВЕТ", () => {
  // Главное умение оценщика: сказать «решения нет». Сегодняшний автомат этого
  // сказать не может и потому стоит на станции, делая вид, что охотится.
  const running = {
    centre: [140, 30, 0],
    velocity: [30, 0, 0],
    turnRate: 0,
  };
  assert.equal(
    timeToReach([0, 30, 0], 21, running, 46),
    Number.POSITIVE_INFINITY,
  );
  const verdict = estimateAirManoeuvres(
    { own: hunterAt([0, 30, 0]), target: running },
    RAX,
  ).find((candidate) => candidate.kind === "intercept");
  assert.equal(verdict.feasible, false);
  assert.match(verdict.reason, /цель быстрее/);
});

test("ПИКИРОВАНИЕ ПОКУПАЕТ ХОД, КОТОРОГО У МОТОРА НЕТ", () => {
  // Тот же убегающий, но я на сорок метров выше. `√(21² + 2·9.81·40)` = 34 м/с
  // против его тридцати — и встреча, которой без превышения не было, решается.
  const running = { centre: [140, 30, 0], velocity: [30, 0, 0], turnRate: 0 };
  const low = estimateAirManoeuvres(
    { own: hunterAt([0, 30, 0]), target: running },
    RAX,
  );
  const high = estimateAirManoeuvres(
    { own: hunterAt([0, 90, 0]), target: running },
    RAX,
  );
  assert.equal(
    low.find((c) => c.kind === "intercept").feasible,
    false,
    "на одной высоте убегающий не перехватывается",
  );
  assert.equal(
    low.find((c) => c.kind === "dive").feasible,
    false,
    "без превышения пикировать нечем",
  );
  const dive = high.find((c) => c.kind === "dive");
  assert.equal(dive.feasible, true, dive.reason ?? "");
  assert.ok(dive.cost > 30, `пикирование обязано СТОИТЬ высоты: ${dive.cost}`);
  // И выбор обязан взять именно его: другого решения нет.
  const chosen = chooseAirManoeuvre(
    { own: hunterAt([0, 90, 0]), target: running },
    RAX,
  );
  assert.equal(chosen.kind, "dive");
});

test("ПИКИРОВАТЬ В ЗЕМЛЮ НЕЛЬЗЯ: этаж отнимает манёвр, а не уменьшает его", () => {
  const running = { centre: [140, 8, 0], velocity: [30, 0, 0], turnRate: 0 };
  const estimate = estimateAirManoeuvres(
    { own: hunterAt([0, 14, 0]), target: running },
    RAX,
  ).find((c) => c.kind === "dive");
  assert.equal(estimate.feasible, false);
  assert.match(estimate.reason, /превышения|этаж/);
});

test("ВСТРЕЧНЫЙ КУРС БЬЁТ ВСЁ ОСТАЛЬНОЕ, когда цель идёт на меня", () => {
  const incoming = {
    centre: [90, 30, 0],
    velocity: [-28, 0, 0],
    turnRate: 0,
  };
  const geometry = { own: hunterAt([0, 30, 0]), target: incoming };
  assert.ok(aspectAngle(geometry) < 0.1, "ракурс обязан быть встречным");
  const chosen = chooseAirManoeuvre(geometry, RAX);
  assert.equal(chosen.kind, "headOn");
  assert.equal(chosen.cost, 0, "встречный курс не стоит ничего");
  // И он же обязан ОТКАЗАТЬСЯ, когда цель отвернула: иначе он врёт о сближении.
  const away = {
    ...incoming,
    velocity: [28, 0, 0],
  };
  const refused = estimateAirManoeuvres(
    { own: hunterAt([0, 30, 0]), target: away },
    RAX,
  ).find((c) => c.kind === "headOn");
  assert.equal(refused.feasible, false);
});

test("НАВЕДЕНИЕ НОСА — ОТДЕЛЬНАЯ ВЕЛИЧИНА, и против вёрткого оно НЕВОЗМОЖНО", () => {
  // Скорость набора угла есть МОЙ темп минус ЕГО. Против того, кто крутится не
  // медленнее, ответ не «долго», а никогда: большое число выбор рано или поздно
  // выберет, бесконечность — никогда.
  const lazy = secondsToBoresight(Math.PI / 2, 21, 0.1, RAX);
  assert.ok(lazy > 0 && lazy < 6, `${lazy} с на девяносто градусов`);
  assert.equal(
    secondsToBoresight(Math.PI / 2, 21, 1.4, RAX),
    Number.POSITIVE_INFINITY,
    "против вёрткого наведение обязано быть объявлено невозможным",
  );
  // И собственный темп падает с ходом: вираж радиусом v²/a тем ленивее, чем
  // быстрее машина идёт. Это и решает дальше выбор между виражом и фигурой.
  assert.ok(
    secondsToBoresight(Math.PI / 2, 35, 0, RAX) >
      secondsToBoresight(Math.PI / 2, 15, 0, RAX),
    "на большом ходу доворот обязан быть медленнее",
  );
  // В конусе доворачивать нечего.
  assert.equal(secondsToBoresight(0.05, 21, 0, RAX), 0);
});

test("ДИСТАНЦИЯ ОГНЯ — НЕ ОГНЕВОЕ РЕШЕНИЕ: ствол неподвижен", () => {
  // Цель уже близко, но мимо носа. Кандидат, возвращающий здесь ноль, побеждал
  // бы всегда и всюду — ровно этим первая редакция и болела.
  const beside = { centre: [0, 30, 25], velocity: [0, 0, -18], turnRate: 0.2 };
  const intercept = estimateAirManoeuvres(
    { own: hunterAt([0, 30, 0]), target: beside },
    RAX,
  ).find((c) => c.kind === "intercept");
  assert.ok(intercept.feasible);
  assert.ok(
    intercept.seconds > 1,
    `в дистанции, но мимо носа, решение объявлено за ${intercept.seconds} с`,
  );
});

test("РАЗВОРОТ ФИГУРОЙ ВЫИГРЫВАЕТ ПО ХОДУ, а не вообще", () => {
  // Цель за спиной. Развернуться можно виражом (его считает `secondsToBoresight`)
  // или фигурой. Что дешевле — решает СКОРОСТЬ: время фигуры от хода не зависит,
  // а вираж радиусом v²/a с ходом тяжелеет.
  const behind = still([-40, 30, 0]);
  assert.ok(
    bearingTo([1, 0], [0, 30, 0], [-40, 30, 0]) > Math.PI * 0.9,
    "цель обязана быть за спиной",
  );
  const slow = chooseAirManoeuvre(
    { own: hunterAt([0, 30, 0], [21, 0, 0]), target: behind },
    RAX,
  );
  const fast = chooseAirManoeuvre(
    { own: hunterAt([0, 30, 0], [34, 0, 0]), target: behind },
    RAX,
  );
  assert.equal(slow.kind, "intercept", "на малом ходу вираж дешевле фигуры");
  assert.equal(fast.kind, "reverse", "на большом ходу фигура обязана выиграть");
  // Впереди фигура не предлагается вовсе.
  const refused = estimateAirManoeuvres(
    { own: hunterAt([0, 30, 0]), target: still([40, 30, 0]) },
    RAX,
  ).find((c) => c.kind === "reverse");
  assert.equal(refused.feasible, false);
  assert.match(refused.reason, /не за спиной/);
});

test("ФИГУРА, СТОЯЩАЯ ВЫСОТЫ, ОТНИМАЕТСЯ ЭТАЖОМ, а не дорожает", () => {
  // У RAX-8 разворот делается иммельманом и высоты не тратит. Машине, которой
  // разворачиваться приходится петлёй вниз, сюда приходит её провал — и ворота
  // этажа обязаны сработать сами, без отдельного правила.
  const diving = { ...RAX, reversal: { seconds: 4.2, cost: 34 } };
  const low = estimateAirManoeuvres(
    { own: hunterAt([0, 20, 0]), target: still([-40, 20, 0]) },
    diving,
  ).find((c) => c.kind === "reverse");
  assert.equal(low.feasible, false);
  assert.match(low.reason, /высоты на фигуру/);
  const high = estimateAirManoeuvres(
    { own: hunterAt([0, 80, 0]), target: still([-40, 80, 0]) },
    diving,
  ).find((c) => c.kind === "reverse");
  assert.equal(high.feasible, true, high.reason ?? "");
  assert.equal(high.cost, 34, "цена высоты обязана быть объявлена, а не забыта");
});

test("НИ ОДИН КАНДИДАТ НЕ ПОБЕЖДАЕТ ВСЕГДА — иначе это прежний рудимент", () => {
  // Смысл всей затеи. Если в наборе разных ситуаций выбор всегда один и тот же,
  // значит оценщик ничего не оценивает.
  const situations = [
    // убегающий быстрее, я выше — пикирование
    { own: hunterAt([0, 90, 0]), target: { centre: [140, 30, 0], velocity: [30, 0, 0], turnRate: 0 } },
    // идёт навстречу — встречный курс
    { own: hunterAt([0, 30, 0]), target: { centre: [90, 30, 0], velocity: [-28, 0, 0], turnRate: 0 } },
    // ходит по кругу на одной высоте — встреча по хорде
    { own: hunterAt([0, 30, 0]), target: { centre: [70, 30, 0], velocity: [0, 0, 20], turnRate: 0.33 } },
    // за спиной, и я иду быстро после пикирования — разворот через верх
    { own: hunterAt([0, 30, 0], [34, 0, 0]), target: still([-40, 30, 0]) },
  ];
  const chosen = situations.map((geometry) => chooseAirManoeuvre(geometry, RAX));
  for (const [index, verdict] of chosen.entries()) {
    assert.ok(verdict, `ситуация ${index}: решения не нашлось вовсе`);
  }
  const kinds = new Set(chosen.map((verdict) => verdict.kind));
  assert.ok(
    kinds.size >= 3,
    `на четырёх разных положениях выбрано ${kinds.size} разных манёвра: ${[...kinds].join(", ")}`,
  );
});

test("«РЕШЕНИЯ НЕТ» — законный ответ, и его надо уметь получить", () => {
  // Быстрее меня, идёт прямо, я не выше, дистанция огромная. Гнаться —
  // бессмысленно, и честный автомат обязан вернуть `null`, а не выбрать
  // погоню за неимением лучшего.
  const hopeless = {
    own: hunterAt([0, 8, 0]),
    target: { centre: [200, 8, 0], velocity: [30, 0, 0], turnRate: 0 },
  };
  assert.equal(chooseAirManoeuvre(hopeless, RAX), null);
});
