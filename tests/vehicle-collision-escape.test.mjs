import assert from "node:assert/strict";
import test from "node:test";
import {
  beginCollisionEscape,
  stepCollisionEscape,
} from "../games/make-a-mess/src/game/vehicleCollisionEscape.ts";

/**
 * СТЕНД ВЫХОДА ИЗ СТОЛКНОВЕНИЯ.
 *
 * Проверяется гипотеза Igor: «выходим из столкновения наиболее эффективным
 * способом — буквально обратным тому, что привело к столкновению, но тут надо
 * проверить кейсы, могу быть неправ».
 *
 * Здесь не проверка «работает ли модуль» — здесь ПРОВЕРКА ПРАВИЛА. Поэтому
 * рядом с боевым правилом гоняются два простых, из которых оно сложено, и
 * каждый случай показывает, какое из них где ломается. Тест, гоняющий только
 * победителя, не отличил бы удачу от закона.
 *
 * Машина — шар радиуса r, препятствия — коробки, мир гасит составляющую
 * скорости внутрь тела, как это делает решатель. Тяжесть скомпенсирована
 * подъёмом, располагаемое ускорение манёвра скромное (1.2 g): судится ум
 * правила, а не запас тяги.
 */

const GRAVITY = 9.81;
const ACCELERATION = 1.2 * GRAVITY;
const STEP = 1 / 120;
const RADIUS = 1.2;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => (len(a) > 1e-9 ? scale(a, 1 / len(a)) : [0, 0, 0]);

const box = (min, max) => ({ min, max });

function boxContact(shape, point, radius) {
  const closest = [0, 1, 2].map((axis) =>
    Math.max(shape.min[axis], Math.min(shape.max[axis], point[axis])),
  );
  const away = sub(point, closest);
  const distance = len(away);
  if (distance >= radius) {
    return null;
  }
  if (distance < 1e-9) {
    // Центр внутри тела: нормаль по ближайшей грани.
    let best = Infinity;
    let normal = [0, 1, 0];
    for (const [candidate, depth] of [
      [[-1, 0, 0], point[0] - shape.min[0]],
      [[1, 0, 0], shape.max[0] - point[0]],
      [[0, -1, 0], point[1] - shape.min[1]],
      [[0, 1, 0], shape.max[1] - point[1]],
      [[0, 0, -1], point[2] - shape.min[2]],
      [[0, 0, 1], shape.max[2] - point[2]],
    ]) {
      if (depth < best) {
        best = depth;
        normal = candidate;
      }
    }
    return { normal, depth: radius + best };
  }
  return { normal: norm(away), depth: radius - distance };
}

function contactsAt(world, point) {
  return world
    .map((shape) => boxContact(shape, point, RADIUS))
    .filter((contact) => contact !== null);
}

/** Сводка ровно того вида, какой даёт `summariseExternalContacts` рантайма. */
function summarise(found) {
  if (found.length === 0) {
    return { count: 0, push: [0, 0, 0] };
  }
  let push = [0, 0, 0];
  for (const contact of found) {
    push = add(push, contact.normal);
  }
  return { count: found.length, push: norm(push) };
}

function clearance(world, point) {
  let best = Infinity;
  for (const shape of world) {
    const closest = [0, 1, 2].map((axis) =>
      Math.max(shape.min[axis], Math.min(shape.max[axis], point[axis])),
    );
    best = Math.min(best, len(sub(point, closest)) - RADIUS);
  }
  return best;
}

/**
 * Прогон одного правила по одному случаю. Возвращает время до свободы или
 * null. Доводка манёвра (последнее осмысленное направление, когда правило
 * молчит) — свойство манёвра, а не правила, поэтому она общая для всех.
 */
function escapeTime(scene, rule, seconds = 6) {
  let position = [...scene.start];
  let velocity = [...scene.entry];
  let last = [0, 0, 0];
  let freeFor = 0;
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    const found = contactsAt(scene.world, position);
    const contact = summarise(found);
    if (contact.count === 0 && clearance(scene.world, position) > 0.3) {
      freeFor += STEP;
      if (freeFor > 0.4) {
        return elapsed;
      }
    } else {
      freeFor = 0;
    }
    const asked = rule({ contact, position, entry: scene.entry });
    const commanded = len(asked) > 1e-6 ? asked : last;
    last = commanded;
    velocity = add(velocity, scale(commanded, ACCELERATION * STEP));
    for (const one of found) {
      const into = dot(velocity, one.normal);
      if (into < 0) {
        velocity = sub(velocity, scale(one.normal, into));
      }
      position = add(position, scale(one.normal, Math.min(one.depth, 0.02)));
    }
    if (found.length > 0) {
      // Трение зацепа: без него любой шар выскальзывает сам, и стенд ничего
      // не проверяет.
      const along = dot(velocity, contact.push);
      velocity = add(
        scale(contact.push, along),
        scale(sub(velocity, scale(contact.push, along)), 0.9),
      );
    }
    position = add(position, scale(velocity, STEP));
    if (len(velocity) > 40) {
      velocity = scale(norm(velocity), 40);
    }
  }
  return null;
}

const SCENES = [
  {
    name: "лобовой удар в навес",
    start: [0, 3.0, 0],
    entry: [0, 6, 0],
    world: [box([-8, 4.0, -8], [8, 6, 8])],
  },
  {
    name: "щель: зажало между двумя телами",
    start: [2.0, 0, 0],
    entry: [7, 0, 0],
    world: [box([-1, 0.9, -6], [8, 3, 6]), box([-1, -3, -6], [8, -0.9, 6])],
  },
  {
    name: "касательный чирк о стену",
    start: [0, 0, 1.1],
    entry: [9, 0, 0.8],
    world: [box([-10, -6, 2.2], [10, 6, 8])],
  },
  {
    name: "внутренний угол по диагонали",
    start: [-1.0, 0, -1.0],
    entry: [5, 0, 5],
    world: [box([0.1, -6, -10], [10, 6, 10]), box([-10, -6, 0.1], [10, 6, 10])],
  },
  {
    name: "села на мачту сверху",
    start: [0, 1.1, 0],
    entry: [0, -5, 0],
    world: [box([-0.6, -10, -0.6], [0.6, 0.0, 0.6])],
  },
  {
    name: "подкралась почти без хода",
    start: [0, 0, 1.15],
    entry: [0.15, 0, 0.1],
    world: [box([-10, -6, 2.2], [10, 6, 8])],
  },
  {
    name: "чужое тело легло сверху, вход нулевой",
    start: [0, 0, 0],
    entry: [0, 0, 0],
    world: [box([-6, 1.1, -6], [6, 4, 6])],
  },
  {
    name: "удар сбоку по неподвижной, вход нулевой",
    start: [0, 0, 0],
    entry: [0, 0, 0],
    world: [box([-10, -6, 1.1], [10, 6, 8])],
  },
  {
    name: "карман: назад ходу нет, свободно вверх",
    start: [0, 0, 0],
    entry: [6, 0, 0],
    world: [
      box([1.15, -6, -8], [8, 1.0, 8]),
      box([-8, -6, -8], [-1.15, 1.0, 8]),
      box([-8, -6, 1.15], [8, 1.0, 8]),
      box([-8, -6, -8], [8, 1.0, -1.15]),
    ],
  },
];

/** Правило A — гипотеза Igor в чистом виде. */
const reverseEntry = ({ entry }) => scale(norm(entry), -1);

/** Правило B — идти туда, куда мир и так толкает. */
const alongPush = ({ contact }) => contact.push;

/** Боевое правило: то, что живёт в рантайме. */
function moduleRule(scene) {
  let state = beginCollisionEscape(scene.entry);
  return ({ contact, position }) => {
    const stepped = stepCollisionEscape(state, {
      contact,
      position,
      deltaSeconds: STEP,
    });
    state = stepped.state;
    return stepped.direction;
  };
}

/**
 * Прогон правила по всем случаям. Довод берётся ФАБРИКОЙ, а не готовым
 * правилом: у боевого есть состояние, и на каждый случай оно должно быть
 * своим — иначе упорство приходит в следующую сцену уже уставшим.
 */
function sweep(factory) {
  return SCENES.map((scene) => ({
    name: scene.name,
    seconds: escapeTime(scene, factory(scene)),
  }));
}

/** Правило без состояния выглядит фабрикой, чтобы вызов был один на всех. */
const stateless = (rule) => () => rule;

test("ГИПОТЕЗА IGOR ВЕРНА КАК ОСНОВА: обратное входу решает шесть случаев из девяти", () => {
  const results = sweep(stateless(reverseEntry));
  const escaped = results.filter((one) => one.seconds !== null);
  assert.equal(escaped.length, 6, "набор решаемых обратным входом изменился");

  // И ЕДИНСТВЕННОЕ РЕШАЕТ ЩЕЛЬ. Это главный довод в её пользу: там, где
  // машину зажало между двумя телами, нормали контактов гасят друг друга, и
  // «иди туда, куда толкает» не даёт направления вовсе.
  const slot = results.find((one) => one.name.startsWith("щель"));
  assert.ok(slot.seconds !== null, "обратное входу перестало решать щель");
  const slotByPush = sweep(stateless(alongPush)).find((one) =>
    one.name.startsWith("щель"),
  );
  assert.equal(
    slotByPush.seconds,
    null,
    "нормаль вдруг научилась выводить из щели — случай перестал различать правила",
  );
});

test("И НЕВЕРНА КАК ЕДИНСТВЕННОЕ: там, где двигалась не машина, обращать нечего", () => {
  const results = sweep(stateless(reverseEntry));
  for (const name of [
    "чужое тело легло сверху, вход нулевой",
    "удар сбоку по неподвижной, вход нулевой",
  ]) {
    assert.equal(
      results.find((one) => one.name === name).seconds,
      null,
      `обратное входу вдруг решило «${name}» — у него нет входа, чтобы обратить`,
    );
  }
  // Ровно эти два случая нормаль и закрывает: знания в двух правилах разные,
  // и одно из другого не выводится.
  const byPush = sweep(stateless(alongPush));
  for (const name of [
    "чужое тело легло сверху, вход нулевой",
    "удар сбоку по неподвижной, вход нулевой",
  ]) {
    assert.ok(byPush.find((one) => one.name === name).seconds !== null);
  }
});

test("КАРМАН НЕ ОТКРЫВАЕТСЯ НИ ОДНИМ ИЗ ДВУХ — нужно упорство", () => {
  // Тупик, вход в который закрылся после того, как машина в него влетела:
  // назад ходу нет, нормали смотрят внутрь, свободно только вверх. Ни одно
  // из простых правил туда не смотрит.
  for (const rule of [stateless(reverseEntry), stateless(alongPush)]) {
    assert.equal(
      sweep(rule).find((one) => one.name.startsWith("карман")).seconds,
      null,
    );
  }
});

test("БОЕВОЕ ПРАВИЛО ВЫХОДИТ ИЗ ВСЕХ ДЕВЯТИ", () => {
  const results = sweep(moduleRule);
  const stuck = results.filter((one) => one.seconds === null);
  assert.deepEqual(
    stuck.map((one) => one.name),
    [],
    "появился зацеп, из которого машина не выбирается",
  );
  // И не ценой вечности: худший случай — та самая щель, из которой машина
  // выползает боком почти пять секунд. Это честно: она там не летит, а
  // протискивается.
  const worst = Math.max(...results.map((one) => one.seconds));
  assert.ok(worst < 5.5, `худший выход стал дольше: ${worst.toFixed(2)} с`);
  const median = results
    .map((one) => one.seconds)
    .sort((a, b) => a - b)[Math.floor(results.length / 2)];
  assert.ok(median < 1.1, `типичный выход стал дольше: ${median.toFixed(2)} с`);
});

test("упорство не мешает медленному, но работающему выходу", () => {
  // Граница, на которой первая редакция и сломалась. Прогресс меряется
  // ДВИЖЕНИЕМ, а не зазором: в щели зазор отрицателен и почти постоянен всё
  // время выхода, и правило, следящее за зазором, бросало работающую
  // попытку на второй секунде.
  let state = beginCollisionEscape([7, 0, 0]);
  const contact = { count: 2, push: [0, 0, 0] };
  // Машина ползёт назад по сантиметру за шаг — это движение, и попытку
  // менять не за что.
  for (let step = 0; step < 240; step += 1) {
    state = stepCollisionEscape(state, {
      contact,
      position: [2 - step * 0.01, 0, 0],
      deltaSeconds: STEP,
    }).state;
  }
  assert.equal(state.turn, 0, "упорство сбило работающую попытку");

  // А неподвижную — меняет, и первый поворот приходит по терпению, не раньше.
  let pinned = beginCollisionEscape([7, 0, 0]);
  for (let step = 0; step < 240; step += 1) {
    pinned = stepCollisionEscape(pinned, {
      contact,
      position: [2, 0, 0],
      deltaSeconds: STEP,
    }).state;
  }
  assert.ok(pinned.turn > 0, "зажатая машина не сменила попытку");
});
