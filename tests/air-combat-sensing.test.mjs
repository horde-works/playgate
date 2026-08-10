import assert from "node:assert/strict";
import test from "node:test";
import {
  airCombatOwnState,
  airCombatTracks,
  frameHalfSpan,
  sightedCentre,
} from "../games/make-a-mess/src/game/airCombatSensing.ts";

/**
 * БОЕВОЕ ЗРЕНИЕ.
 *
 * Проверяется не «работает ли сборка», а ГРАНИЦЫ: что зрение видит ровно
 * наблюдаемое и ничего сверх, что оно НЕ решает свой-чужой за автомат, и что
 * оси выводятся соглашением проекта, а не на глаз. Отрицательные утверждения
 * здесь важнее положительных: модуль заведён затем, чтобы у уклонения был тот
 * же взгляд, а расширить взгляд молча — самый дешёвый способ сломать баланс.
 */

const SQRT_HALF = Math.SQRT1_2;
/** Поворот на +90° вокруг +Y: соглашением проекта он ведёт +Z к +X. */
const YAW_90 = [0, SQRT_HALF, 0, SQRT_HALF];
const IDENTITY = [0, 0, 0, 1];

function bounds(halfWidth, halfDepth) {
  return {
    minimum: [-halfWidth, -0.5, -halfDepth],
    maximum: [halfWidth, 0.5, halfDepth],
  };
}

/** Привязка движителя: один необязательный член, вклад единица. */
function ring(index) {
  return {
    id: `ring-${index}`,
    commandChannel: `throttle:${index}`,
    members: [
      { pieceId: `ring-${index}`, contribution: 1, required: false },
    ],
    totalContribution: 1,
  };
}

function frameOf(overrides = {}) {
  return {
    id: "target",
    clusterId: "target-cluster",
    allegiance: "yaqui",
    localBounds: bounds(2, 3),
    actuators: [ring(0), ring(1)],
    flight: { limits: { enginePoints: [[1, 0, 0], [-1, 0, 0]] } },
    nose: [0, 0, 1],
    ...overrides,
  };
}

function stateOf(overrides = {}) {
  return {
    body: {
      position: [10, 20, 30],
      orientation: IDENTITY,
      velocity: [1, 2, 3],
      angularVelocity: [0, 0.4, 0],
    },
    mass: { centre: [0, 0, 0] },
    flight: {},
    recovery: null,
    supportContacts: 0,
    ...overrides,
  };
}

/** Мир из одной карты состояний и одного набора висящих членов. */
function worldOf(states, attached = new Set(["ring-0", "ring-1"])) {
  return {
    stateOf: (id) => states.get(id),
    attachedTo: () => attached,
  };
}

test("наблюдатель не видит сам себя", () => {
  const frames = [frameOf({ id: "self" })];
  const states = new Map([["self", stateOf()]]);
  assert.deepEqual(airCombatTracks("self", frames, worldOf(states)), []);
});

test("борт без объявленной стороны в бою не существует", () => {
  const frames = [frameOf({ allegiance: undefined })];
  const states = new Map([["target", stateOf()]]);
  assert.deepEqual(airCombatTracks("self", frames, worldOf(states)), []);
});

test("несобранный борт пропускается, а не подставляет ноль", () => {
  const frames = [frameOf()];
  const states = new Map([["target", stateOf({ mass: null })]]);
  assert.deepEqual(airCombatTracks("self", frames, worldOf(states)), []);
  // И отдельно: состояния может не быть вовсе.
  assert.deepEqual(airCombatTracks("self", frames, worldOf(new Map())), []);
});

test("ЗРЕНИЕ НЕ РЕШАЕТ СВОЙ-ЧУЖОЙ: союзник тоже попадает в список", () => {
  // Отбор цели принадлежит автомату, а уклонению нужен ровно тот же список —
  // только смотреть оно будет на охотника. Отфильтруй вражду здесь, и второй
  // потребитель получит список без того, кто ему нужен.
  const frames = [
    frameOf({ id: "ally", clusterId: "ally", allegiance: "tonkawa" }),
    frameOf({ id: "foe", clusterId: "foe", allegiance: "yaqui" }),
  ];
  const states = new Map([
    ["ally", stateOf()],
    ["foe", stateOf()],
  ]);
  const tracks = airCombatTracks("self", frames, worldOf(states));
  assert.deepEqual(
    tracks.map((track) => track.id).sort(),
    ["ally", "foe"],
  );
});

test("снимок цели несёт ровно наблюдаемые поля и ни одного сверх", () => {
  // Сторож границы слепоты. Появление здесь маршрута, прогресса или будущих
  // точек уронит тест — и это единственный способ поймать такое расширение
  // раньше, чем экстраполятор начнёт брать идеальное упреждение.
  const frames = [frameOf()];
  const states = new Map([["target", stateOf()]]);
  const [track] = airCombatTracks("self", frames, worldOf(states));
  assert.deepEqual(Object.keys(track).sort(), [
    "allegiance",
    "centre",
    "failed",
    "id",
    "landed",
    "radius",
    "turnRate",
    "velocity",
    "weakPoints",
  ]);
  assert.deepEqual(Object.keys(track.weakPoints[0]).sort(), [
    "health",
    "point",
  ]);
});

test("скорость, вращение и габарит доезжают до СВОИХ полей", () => {
  // Проверка на подмену индекса и поля. Без неё `turnRate` и `verticalSpeed`
  // не утверждены нигде: тест на состав снимка смотрит только на присутствие
  // ключа, а фикстура подобрана так, что подмена оси даёт молчаливый ноль.
  const frames = [frameOf()];
  const states = new Map([
    [
      "target",
      stateOf({
        body: {
          ...stateOf().body,
          velocity: [7, -3, 11],
          angularVelocity: [0.9, 0.4, -0.6],
        },
      }),
    ],
  ]);
  const [track] = airCombatTracks("self", frames, worldOf(states));
  assert.deepEqual(track.velocity, [7, -3, 11]);
  assert.equal(track.turnRate, 0.4, "манёвр берётся вокруг вертикали");
  assert.equal(track.radius, 3, "радиус — по большей горизонтальной стороне");

  const own = airCombatOwnState(
    frameOf(),
    stateOf({
      body: {
        ...stateOf().body,
        velocity: [7, -3, 11],
        angularVelocity: [0.9, 0.4, -0.6],
      },
    }),
    [0, 0, 0],
  );
  assert.deepEqual(own.velocity, [7, -3, 11]);
  assert.equal(own.verticalSpeed, -3, "вертикальная скорость — это ось Y");
  assert.equal(own.radius, 3);
});

test("центр считается от центра масс, а не от начала кадра", () => {
  const frames = [frameOf()];
  const states = new Map([
    ["target", stateOf({ mass: { centre: [0, 1, 0] } })],
  ]);
  const [track] = airCombatTracks("self", frames, worldOf(states));
  assert.deepEqual(track.centre, [10, 21, 30]);
  assert.deepEqual(sightedCentre([10, 20, 30], [0, 1, 0]), [10, 21, 30]);
});

test("кольца поворачиваются вместе с корпусом", () => {
  // Кольцо, стоящее на правом борту в осях кадра, при развороте на 90°
  // обязано оказаться позади: иначе прицел бьёт в место, где кольца нет.
  const frames = [frameOf()];
  const states = new Map([
    ["target", stateOf({ body: { ...stateOf().body, orientation: YAW_90 } })],
  ]);
  const [track] = airCombatTracks("self", frames, worldOf(states));
  const [first, second] = track.weakPoints;
  assert.ok(Math.abs(first.point[0] - 10) < 1e-9, "по X кольцо не сместилось");
  assert.ok(Math.abs(first.point[2] - 29) < 1e-9, "по Z ушло на метр назад");
  assert.ok(Math.abs(second.point[2] - 31) < 1e-9, "второе — на метр вперёд");
});

test("живучесть кольца берётся из движителей, а не назначается", () => {
  const frames = [frameOf()];
  const states = new Map([["target", stateOf()]]);
  const [whole] = airCombatTracks(
    "self",
    frames,
    worldOf(states, new Set(["ring-0", "ring-1"])),
  );
  assert.deepEqual(whole.weakPoints.map((point) => point.health), [1, 1]);

  const [maimed] = airCombatTracks(
    "self",
    frames,
    worldOf(states, new Set(["ring-0"])),
  );
  assert.deepEqual(maimed.weakPoints.map((point) => point.health), [1, 0]);
});

test("кольцо без своей привязки считается целым, а не пропавшим", () => {
  // Машина вправе не описывать движители актуаторами вовсе: тогда живучесть
  // неизвестна, и честный ответ — единица, а не пустая точка в прицеле.
  const frames = [frameOf({ actuators: [] })];
  const states = new Map([["target", stateOf()]]);
  const [track] = airCombatTracks("self", frames, worldOf(states));
  assert.equal(track.weakPoints.length, 2);
  assert.deepEqual(track.weakPoints.map((point) => point.health), [1, 1]);
});

test("севшей цель считается только стоящей на опорах", () => {
  const frames = [frameOf()];
  const parked = new Map([
    ["target", stateOf({ flight: null, supportContacts: 3 })],
  ]);
  assert.equal(airCombatTracks("self", frames, worldOf(parked))[0].landed, true);

  // Не летит, но и не стоит — падает. Это не «села», атака не снимается.
  const falling = new Map([
    ["target", stateOf({ flight: null, supportContacts: 0 })],
  ]);
  assert.equal(
    airCombatTracks("self", frames, worldOf(falling))[0].landed,
    false,
  );

  // Летит и касается — взлетает или садится. Тоже не «села».
  const rolling = new Map([["target", stateOf({ supportContacts: 2 })]]);
  assert.equal(
    airCombatTracks("self", frames, worldOf(rolling))[0].landed,
    false,
  );
});

test("отказ виден отдельно от посадки", () => {
  const frames = [frameOf()];
  const states = new Map([["target", stateOf({ recovery: {} })]]);
  const [track] = airCombatTracks("self", frames, worldOf(states));
  assert.equal(track.failed, true);
  assert.equal(track.landed, false);
});

test("радиус берётся по горизонтали и никогда по высоте", () => {
  // Высота дала бы у винтокрылой систематически заниженный габарит.
  assert.equal(frameHalfSpan(bounds(2, 3)), 3);
  assert.equal(frameHalfSpan(bounds(5, 1)), 5);
  assert.equal(
    frameHalfSpan({ minimum: [-1, -40, -1], maximum: [1, 40, 1] }),
    1,
  );
});

test("правый борт выводится соглашением проекта, а не на глаз", () => {
  // `pitchAxisOf(nose) = (−nz, nx)`, и это ровно `nose × up` в правой тройке
  // с вертикалью +Y: (0,0,1) × (0,1,0) = (−1,0,0). То есть у носа вдоль +Z
  // правый борт смотрит в −X, а не в +X — знак тут не угадывается, он
  // считается. (Первая редакция этого теста угадывала и была неправа.)
  const own = airCombatOwnState(
    frameOf({ nose: [0, 0, 1] }),
    stateOf({ body: { ...stateOf().body, orientation: IDENTITY } }),
    [0, 0, 0],
  );
  assert.deepEqual(own.starboard, [-1, 0, 0]);
  assert.deepEqual(own.gunAxis, [0, 0, 1]);
  assert.deepEqual(own.nose, [0, 1]);
});

test("ствол докладывается ФАКТИЧЕСКИЙ, с разворотом корпуса", () => {
  const own = airCombatOwnState(
    frameOf({ nose: [0, 0, 1] }),
    stateOf({ body: { ...stateOf().body, orientation: YAW_90 } }),
    [0, 0, 0],
  );
  assert.ok(Math.abs(own.gunAxis[0] - 1) < 1e-9, "ствол ушёл в +X");
  assert.ok(Math.abs(own.gunAxis[2]) < 1e-9);
  // Плоский нос — единичный, и знак тот же.
  assert.ok(Math.abs(own.nose[0] - 1) < 1e-9);
  assert.ok(Math.abs(own.nose[1]) < 1e-9);
});

test("ствол в зенит не рождает NaN в плоском курсе", () => {
  // Отвесная поза законна: у этой машины вектор курса любой. Горизонтального
  // курса у неё в этот момент нет, и ответ обязан остаться числом.
  const own = airCombatOwnState(
    frameOf({ nose: [0, 1, 0] }),
    stateOf({ body: { ...stateOf().body, orientation: IDENTITY } }),
    [0, 0, 0],
  );
  assert.deepEqual(own.gunAxis, [0, 1, 0]);
  assert.ok(Number.isFinite(own.nose[0]) && Number.isFinite(own.nose[1]));
  assert.deepEqual(own.nose, [0, 0]);
});

test("сторона по умолчанию мирная, а не пустая", () => {
  const own = airCombatOwnState(
    frameOf({ allegiance: undefined }),
    stateOf(),
    [0, 0, 0],
  );
  assert.equal(own.allegiance, "civil");
});

test("отчёт тела передаётся как есть, а отсутствие — как отсутствие", () => {
  const silent = airCombatOwnState(frameOf(), stateOf(), [0, 0, 0]);
  assert.equal(silent.body, undefined);

  const report = { maneuverScale: 0.3, thrust: 1, pitch: 0, roll: 1 };
  const loud = airCombatOwnState(
    frameOf(),
    stateOf({ rotorBody: report }),
    [0, 0, 0],
  );
  assert.equal(loud.body, report);

  // null в рантайме означает «не докладывали», и это то же самое отсутствие.
  const nulled = airCombatOwnState(
    frameOf(),
    stateOf({ rotorBody: null }),
    [0, 0, 0],
  );
  assert.equal(nulled.body, undefined);
});
