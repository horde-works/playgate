import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  RING_BAYS,
  RING_DECK_Y,
  ringBays,
} from "../games/make-a-mess/src/content/scenes/astana/astanaRing.ts";
import {
  RING_RADIUS,
  RING_STRAIGHT_LENGTH,
  RING_STRAIGHT_OFFSET,
  TRAIN_LENGTH,
  ringBalises,
  ringPierDistances,
  stationDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";

const pieces = astanaScene.breakablePieces;
const group = (name) => pieces.filter((piece) => piece.id.startsWith(`astana:${name}`));
const withPart = (name, part) =>
  group(name).filter((piece) => piece.id.includes(`:${part}`));

test("the viaduct is built to its parts list, not sketched", () => {
  // Детектор упрощения: счётные детали из паспорта мира. «Примерно столько»
  // не считается — эстакада либо собрана, либо нет.
  //
  // Опор стало тридцать шесть, а не двадцать восемь: под каждую станционную
  // вставку врезано по четыре опоры вместо двух, иначе поезд длиной сорок
  // пять метров вставал бы на пролёт длиннее собственной базы.
  assert.equal(RING_BAYS, 36);
  assert.equal(ringBays().length, RING_BAYS);
  assert.equal(
    withPart("lrt-piers", "cap").length + withPart("lrt-piers", "portal-cap").length,
    RING_BAYS,
    "ригель на каждой опоре: обычный на «грибе» и портальный на станционной",
  );
  assert.equal(withPart("lrt-deck", "girder").length, RING_BAYS, "балка на каждый пролёт");
  assert.equal(withPart("lrt-track", "slab").length, RING_BAYS);
  assert.equal(withPart("lrt-track", "contact-rail").length, RING_BAYS);
  assert.equal(withPart("lrt-track", "rail:l").length, RING_BAYS, "левая рельсовая нить");
  assert.equal(withPart("lrt-track", "rail:r").length, RING_BAYS, "правая рельсовая нить");
  // На станционных пролётах внутреннего парапета нет — там платформа и
  // платформенные стенки, а жалюзи стояли бы прямо в теле платформы.
  assert.ok(
    withPart("lrt-parapet", "plate").length >= 2400,
    `жалюзи парапета: ${withPart("lrt-parapet", "plate").length}`,
  );
  assert.ok(withPart("lrt-deck", "rib").length >= 100, "диафрагмы под балкой");
});

test("piers stand on the ground and river piers replace the mushrooms", () => {
  const bays = ringBays();
  // Три типа опоры, и порядок разбора именно такой: станционная вставка
  // важнее долины — портальная рама нужна и над водой.
  const straight = bays.filter((bay) => bay.onStraight);
  const river = bays.filter((bay) => bay.overValley && !bay.onStraight);
  const mushroom = bays.filter((bay) => !bay.overValley && !bay.onStraight);
  assert.equal(straight.length + river.length + mushroom.length, RING_BAYS);
  assert.ok(river.length >= 2, `опор в долине: ${river.length}`);
  assert.ok(river.length <= 10, "долина не должна съедать полкольца");

  // На суше — «гриб» с ветвями и светильником, в долине — бык с ледорезом.
  assert.equal(withPart("lrt-piers", "branch").length, mushroom.length * 2);
  assert.equal(withPart("lrt-piers", "pylon").length, river.length);
  assert.equal(withPart("lrt-piers", "cutwater").length, river.length);
  assert.equal(
    withPart("lrt-piers", "lamp").length,
    mushroom.length,
    "светильник под балкой у каждой наземной опоры",
  );
  assert.equal(
    withPart("lrt-piers", "portal-cap").length,
    straight.length,
    "портальная рама на каждой опоре станционной вставки",
  );
});

test("the deck keeps one level all the way round", () => {
  // Отметка постоянная даже над долиной: считать её от грунта под пролётом
  // нельзя, там дно проваливается на два метра.
  for (const girder of withPart("lrt-deck", "girder")) {
    const bottom = girder.position[1] - girder.size[1] / 2;
    assert.ok(
      Math.abs(bottom - RING_DECK_Y) < 0.01,
      `${girder.id}: низ балки на ${bottom.toFixed(2)} вместо ${RING_DECK_Y}`,
    );
  }
});

test("the viaduct follows the ring and leaves the street clear beneath", () => {
  for (const piece of group("lrt-")) {
    const radius = Math.hypot(piece.position[0], piece.position[2]);
    // Кольцо больше не окружность: на станционных вставках путь спрямляется
    // внутрь, поэтому нижняя граница опущена на величину спрямления. Плюс
    // портальная рама станции вылетает к платформе — она вся на внутренней
    // стороне, и внутренняя нога рамы стоит в семи метрах от оси пути.
    assert.ok(
      radius > RING_RADIUS - RING_STRAIGHT_OFFSET - 8
        && radius < RING_RADIUS + 6.5,
      `${piece.id} ушёл с кольца: радиус ${radius.toFixed(1)}`,
    );
  }
  // Под балкой проходит проспект: 8.5 м до низа — это габарит, а не «повыше».
  const girder = withPart("lrt-deck", "girder")[0];
  assert.ok(girder.position[1] - girder.size[1] / 2 >= 8.5);
});

test("station straights are cut into the ring on the same piers", () => {
  // Станция прямая по определению: состав из трёх секций встаёт на вставку
  // целиком, а её концы — обязательно опоры, а не середина пролёта.
  assert.equal(RING_STRAIGHT_LENGTH, TRAIN_LENGTH + 7);
  assert.ok(RING_STRAIGHT_OFFSET > 3 && RING_STRAIGHT_OFFSET < 4);

  const bays = ringBays();
  // Опора либо на дуге (радиус 98), либо в середине вставки (98 − спрямление).
  // Концы вставок совпадают с опорами дуги — станционный участок опирается на
  // те же «грибы», что и вся линия.
  const stationPiers = bays.filter(
    (bay) =>
      Math.abs(
        Math.hypot(bay.point[0], bay.point[1])
          - (RING_RADIUS - RING_STRAIGHT_OFFSET),
      ) < 0.4,
  );
  assert.equal(stationPiers.length, 4, "по опоре в середине каждой вставки");
  assert.ok(
    bays.filter((bay) => bay.onStraight).length >= 4,
    "на прямых участках должны стоять опоры",
  );
  assert.equal(ringPierDistances().length, bays.length);

  // Ригель разворачивается поперёк ПУТИ: на вставке путь и радиус расходятся,
  // и опора, повёрнутая по радиусу, стояла бы наискось к платформе.
  for (const bay of stationPiers) {
    const radial = Math.atan2(bay.point[1], bay.point[0]);
    assert.ok(
      Math.abs(Math.atan2(Math.sin(bay.angle - radial), Math.cos(bay.angle - radial)))
        > 1.2,
      "ригель станционной опоры должен идти поперёк пути",
    );
  }
});

test("balises close in on every stopping point", () => {
  // Настоящая линия так и работает: одометрия по колёсам дрейфует, балиса
  // обнуляет ошибку, и перед платформой их ставят группой с сокращающимся
  // шагом — последняя коррекция приходит перед самой точкой остановки.
  const balises = ringBalises();
  for (const compass of ["east", "north", "west", "south"]) {
    const group = balises
      .filter((balise) => balise.station === compass)
      .sort((left, right) => left.distance - right.distance);
    assert.equal(group.length, 4, `у станции ${compass} не четыре балисы`);

    const stop = group[group.length - 1];
    assert.equal(stop.kind, "stop");
    assert.ok(
      Math.abs(stop.distance - (stationDistance(compass) + TRAIN_LENGTH / 2)) < 0.01,
      "точка остановки — нос состава на середине вставки",
    );

    // Шаг сокращается монотонно: 32 → 16 → 8.
    const gaps = group
      .slice(1)
      .map((balise, index) => balise.distance - group[index].distance);
    for (let index = 1; index < gaps.length; index += 1) {
      assert.ok(
        gaps[index] < gaps[index - 1],
        `у станции ${compass} шаг балис не сокращается: ${gaps.join(", ")}`,
      );
    }
  }
  // На перегонах балисы тоже есть, иначе одометрия уплывёт на дуге.
  assert.ok(balises.filter((balise) => balise.kind === "line").length >= 4);
});

test("nothing on the viaduct starts unsupported", () => {
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});
