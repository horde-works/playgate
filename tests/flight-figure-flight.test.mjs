import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import { COMBAT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { rotateVector } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  advanceFlightFigure,
  beginFlightFigure,
  figureCapabilityOf,
  planFlightFigure,
} from "../games/make-a-mess/src/game/flightFigures.ts";
import {
  centreOf,
  createMachine,
  dt,
  forwardAxis,
  stepMachine,
} from "./rotorcraft-rig.mjs";

/**
 * ФИГУРА НА НАСТОЯЩИХ СИЛАХ.
 *
 * Расписание позы можно проверить арифметикой — это делает `flight-figures`.
 * Здесь проверяется другое и единственно важное: ЛЕТИТ ЛИ по нему машина.
 * Между расписанием и полётом стоят микшер, актуаторы, инерция моторов,
 * сопротивление и вес, и ровно там расписание уже дважды оказывалось
 * невыполнимым — сначала бочкой вместо петли, потом полубочкой, расписанной
 * впятеро быстрее доступного газа.
 */

const SPEED = 16;
const rax = airVehicles.find((entry) => entry.id === "combat-hexacopter");
const pieces = compileSceneGroups(
  createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_RANGE_PLACEMENT),
  new Map(),
).clusters[0].pieces;

function build() {
  return createMachine({
    pieces,
    vehicle: rax,
    startPoint: [0, 60, 0],
    startVelocity: [SPEED, 0, 0],
    startNose: [1, 0, 0],
  });
}

const capability = figureCapabilityOf(build().machine);

/** Прогон одной фигуры от ровного полёта до ровного полёта. */
function fly(kind, { settleSteps = 60, afterSteps = 150 } = {}) {
  const m = build();
  const level = {
    forwardSpeed: SPEED,
    lateralSpeed: 0,
    yawRate: 0,
    liftFraction: 0,
  };
  for (let step = 0; step < settleSteps; step += 1) stepMachine(m, level);

  const entry = centreOf(m);
  const entryNose = forwardAxis(m);
  const flat = Math.hypot(entryNose[0], entryNose[2]) || 1;
  const plan = planFlightFigure(
    kind,
    SPEED,
    capability,
    [entryNose[0] / flat, entryNose[2] / flat],
    m.state.orientation,
  );

  let episode = beginFlightFigure(plan);
  const track = [];
  let stalled = 0;
  while (!episode.done) {
    const speed = Math.hypot(...m.state.velocity);
    const advanced = advanceFlightFigure(
      episode,
      m.state.orientation,
      speed,
      dt,
    );
    episode = advanced.episode;
    stepMachine(m, {
      forwardSpeed: advanced.command.speed,
      lateralSpeed: 0,
      yawRate: 0,
      liftFraction: advanced.command.liftFraction,
      attitude: advanced.command.attitude,
      attitudeRate: advanced.command.angularVelocity,
    });
    if ((m.lastResult?.maneuverScale ?? 1) < 0.5) stalled += 1;
    const centre = centreOf(m);
    track.push({
      seconds: episode.seconds,
      up: rotateVector(m.state.orientation, [0, 1, 0]),
      nose: forwardAxis(m),
      height: centre[1] - entry[1],
      along:
        (centre[0] - entry[0]) * (entryNose[0] / flat) +
        (centre[2] - entry[2]) * (entryNose[2] / flat),
      speed: Math.hypot(...m.state.velocity),
    });
  }

  const exitNose = forwardAxis(m);
  for (let step = 0; step < afterSteps; step += 1) stepMachine(m, level);
  return {
    plan,
    episode,
    track,
    stalled,
    exitNose,
    entryNose: [entryNose[0] / flat, 0, entryNose[2] / flat],
    settledUp: rotateVector(m.state.orientation, [0, 1, 0]),
    settledSpeed: Math.hypot(...m.state.velocity),
  };
}

const loop = fly("loop");
const immelmann = fly("immelmann");

test("ПЕТЛЯ: машина действительно переворачивается, а не обходит верх боком", () => {
  const lowest = loop.track.reduce((worst, s) => Math.min(worst, s.up[1]), 1);
  assert.ok(lowest < -0.95, `самая перевёрнутая поза дала ось вверх ${lowest.toFixed(2)}`);
  // И проходит через зенит носом: без этого «переворот» был бы бочкой. Именно
  // ею петля и оказалась в первом прогоне, пока расписание собиралось не в той
  // системе отсчёта.
  const zenith = loop.track.reduce((best, s) => Math.max(best, s.nose[1]), -1);
  const nadir = loop.track.reduce((worst, s) => Math.min(worst, s.nose[1]), 1);
  assert.ok(zenith > 0.95, `нос поднялся только до ${zenith.toFixed(2)}`);
  assert.ok(nadir < -0.95, `нос опустился только до ${nadir.toFixed(2)}`);
});

test("ПЕТЛЯ заканчивается ровной машиной, тем же курсом и на маршрутном ходу", () => {
  assert.equal(loop.episode.done, true);
  assert.equal(loop.episode.aborted, false);
  assert.ok(loop.settledUp[1] > 0.98, `вышла с осью вверх ${loop.settledUp[1].toFixed(2)}`);
  const turn =
    loop.exitNose[0] * loop.entryNose[0] + loop.exitNose[2] * loop.entryNose[2];
  assert.ok(turn > 0.9, `курс развернуло на ${(Math.acos(turn) * 57.3).toFixed(0)}°`);
  // Ход держится в маршрутном коридоре: фигура крутит машину, а не разгоняет.
  const fastest = loop.track.reduce((best, s) => Math.max(best, s.speed), 0);
  assert.ok(fastest < 26, `разогналась до ${fastest.toFixed(1)} м/с`);
  assert.ok(loop.settledSpeed > 10, `${loop.settledSpeed.toFixed(1)} м/с на выходе`);
});

test("ПЕТЛЯ укладывается в объявленное небо и в объявленное время", () => {
  const peak = loop.track.reduce((best, s) => Math.max(best, s.height), 0);
  assert.ok(peak > loop.plan.radius, `набрала всего ${peak.toFixed(1)} м`);
  assert.ok(
    peak <= loop.plan.ceiling,
    `набрала ${peak.toFixed(1)} м при объявленных ${loop.plan.ceiling.toFixed(1)}`,
  );
  assert.ok(
    loop.episode.seconds < loop.plan.seconds * 1.25,
    `${loop.episode.seconds.toFixed(2)} с против плановых ${loop.plan.seconds.toFixed(2)}`,
  );
});

test("ПЕТЛЯ проседает — и просадка укладывается в объявленный провал", () => {
  // Просадка не огрех, а физика: на вертикальных кусках вес держать нечем.
  // Важно, чтобы она была ОБЪЯВЛЕНА, иначе ворота пустят машину туда, откуда
  // она не вернётся.
  const lowest = loop.track.reduce((worst, s) => Math.min(worst, s.height), 0);
  assert.ok(lowest < 0, "петля обязана просесть — иначе замер лукавит");
  assert.ok(
    -lowest < loop.plan.dip,
    `просела на ${(-lowest).toFixed(1)} м при объявленных ${loop.plan.dip.toFixed(1)}`,
  );
});

test("ИММЕЛЬМАН разворачивает курс и оставляет машину РОВНОЙ", () => {
  assert.equal(immelmann.episode.done, true);
  assert.equal(immelmann.episode.aborted, false);
  const lowest = immelmann.track.reduce((worst, s) => Math.min(worst, s.up[1]), 1);
  assert.ok(lowest < -0.9, `не перевернулась: ${lowest.toFixed(2)}`);
  assert.ok(
    immelmann.settledUp[1] > 0.98,
    `осталась накренённой: ось вверх ${immelmann.settledUp[1].toFixed(2)}`,
  );
  const turn =
    immelmann.exitNose[0] * immelmann.entryNose[0] +
    immelmann.exitNose[2] * immelmann.entryNose[2];
  assert.ok(turn < -0.8, `курс развернуло только на ${(Math.acos(turn) * 57.3).toFixed(0)}°`);
});

test("ИММЕЛЬМАН оставляет машину ВЫШЕ входа: ради этого он и делается", () => {
  const exit = immelmann.track.at(-1).height;
  assert.ok(exit > immelmann.plan.radius * 0.6, `вышла на ${exit.toFixed(1)} м выше входа`);
  assert.ok(exit < immelmann.plan.ceiling);
});

test("НИ ОДНА фигура не оставляет машину без управления", () => {
  // `maneuverScale` ниже половины означает, что аллокатор не смог дать
  // требуемую позу и удерживает нынешнюю. Один такой кадр вверх ногами — и
  // фигура кончается случайностью. Оба излома расписания стоили таких кадров,
  // и оба вылечены: полубочка идёт по своему профилю разгона-торможения, а
  // разность темпа не берётся поперёк стыка.
  assert.equal(loop.stalled, 0, `петля потеряла управление на ${loop.stalled} кадрах`);
  assert.equal(
    immelmann.stalled,
    0,
    `иммельман потерял управление на ${immelmann.stalled} кадрах`,
  );
});
