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
  invertedRecoveryHeight,
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
function fly(kind, { settleSteps = 60, afterSteps = 150, bank = 0, sweep } = {}) {
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
    bank,
    sweep,
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
      m.state.velocity[1],
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
      side:
        (centre[0] - entry[0]) * (-entryNose[2] / flat) +
        (centre[2] - entry[2]) * (entryNose[0] / flat),
      along:
        (centre[0] - entry[0]) * (entryNose[0] / flat) +
        (centre[2] - entry[2]) * (entryNose[2] / flat),
      speed: Math.hypot(...m.state.velocity),
      sink: m.state.velocity[1],
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
const splitS = fly("split-s");
const banked = fly("loop", { bank: 0.55 });
const threeQuarter = fly("loop", { sweep: (Math.PI * 3) / 2 });

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
  assert.ok(exit > 0, `вышла на ${exit.toFixed(1)} м относительно входа`);
  assert.ok(exit < immelmann.plan.ceiling);
});

test("ФИГУРА ГАСИТ СНИЖЕНИЕ САМА, а не отдаёт его автопилоту", () => {
  // Без хвоста возврата иммельман отдавал машину с 15.7 м/с снижения. Дальше
  // автопилот просил максимальный подъём — и всё равно терял тридцать шесть
  // метров, до самой земли: он сидел в насыщении, то есть в отказе. Фигура не
  // имеет права передавать эстафету в таком состоянии.
  for (const [name, run] of [["петля", loop], ["иммельман", immelmann]]) {
    const worst = run.track.reduce((deep, s) => Math.min(deep, s.sink), 0);
    assert.ok(worst < -4, `${name}: снижения не было вовсе, замер лукавит`);
    const parting = run.track.at(-1).sink;
    assert.ok(
      parting > -2,
      `${name} отдаёт машину со снижением ${parting.toFixed(1)} м/с`,
    );
  }
});

test("ПЕТЛЯ ВНИЗ теряет высоту, разворачивает курс и оставляет машину РОВНОЙ", () => {
  assert.equal(splitS.episode.done, true);
  assert.equal(splitS.episode.aborted, false);
  const lowest = splitS.track.reduce((worst, s) => Math.min(worst, s.up[1]), 1);
  assert.ok(lowest < -0.9, `не перевернулась: ${lowest.toFixed(2)}`);
  assert.ok(
    splitS.settledUp[1] > 0.98,
    `осталась накренённой: ось вверх ${splitS.settledUp[1].toFixed(2)}`,
  );
  const turn =
    splitS.exitNose[0] * splitS.entryNose[0] +
    splitS.exitNose[2] * splitS.entryNose[2];
  assert.ok(turn < -0.8, `курс развернуло только на ${(Math.acos(turn) * 57.3).toFixed(0)}°`);
  // Главное: она ТЕРЯЕТ высоту. Ради этого она и есть — единственная фигура,
  // которой можно входить в глиссаду.
  const exit = splitS.track.at(-1).height;
  assert.ok(exit < -splitS.plan.radius, `потеряла всего ${(-exit).toFixed(1)} м`);
  assert.ok(-exit < splitS.plan.dip, `провалилась на ${(-exit).toFixed(1)} при объявленных ${splitS.plan.dip.toFixed(1)}`);
});

test("НИ ОДНА фигура не оставляет машину без управления", () => {
  // `maneuverScale` ниже половины означает, что аллокатор не смог дать
  // требуемую позу и удерживает нынешнюю. Один такой кадр вверх ногами — и
  // фигура кончается случайностью. Оба излома расписания стоили таких кадров,
  // и оба вылечены: полубочка идёт по своему профилю разгона-торможения, а
  // разность темпа не берётся поперёк стыка.
  assert.equal(loop.stalled, 0, `петля потеряла управление на ${loop.stalled} кадрах`);
  // У петли ВНИЗ стык полубочки и дуги стоит нескольких кадров удержания:
  // полубочка кончается нулевым темпом, дуга просит полный, а машина в этот
  // момент перевёрнута и власти у неё меньше. Замерено три кадра из трёхсот;
  // сглаживать дугу пробовал — стало сорок пять, потому что профиль
  // разгона-торможения просит вдвое больший темп в середине.
  assert.ok(splitS.stalled <= 4, `петля вниз потеряла управление на ${splitS.stalled} кадрах`);
  assert.equal(
    immelmann.stalled,
    0,
    `иммельман потерял управление на ${immelmann.stalled} кадрах`,
  );
});

test("НАКЛОНЁННАЯ ПЕТЛЯ идёт под углом к нормали и уносит машину вбок", () => {
  assert.equal(banked.episode.done, true);
  assert.equal(banked.episode.aborted, false);
  // Плоскость наклонена — значит подъём идёт не по вертикали, и машина уходит
  // вбок ровно настолько, насколько плоскость завалена: 2R·sin φ.
  const side = banked.track.reduce(
    (worst, s) => (Math.abs(s.side) > Math.abs(worst) ? s.side : worst),
    0,
  );
  const upright = loop.track.reduce(
    (worst, s) => (Math.abs(s.side) > Math.abs(worst) ? s.side : worst),
    0,
  );
  // Номинально снос равен 2R·sin φ = 13.6 м; замер даёт 10 — машина не летит
  // номинальную окружность, она проседает и срезает. Важно, что снос ЕСТЬ и он
  // порядка радиуса, а прямая петля не сносит вовсе.
  assert.ok(
    Math.abs(side) > banked.plan.radius * 0.6,
    `наклон не сносит: ${side.toFixed(1)} м против ${upright.toFixed(1)} у прямой петли`,
  );
  assert.ok(Math.abs(upright) < 2, `прямая петля снесла на ${upright.toFixed(1)} м`);
  // И небо она просит меньше — часть подъёма ушла вбок.
  const peak = banked.track.reduce((best, s) => Math.max(best, s.height), 0);
  const straight = loop.track.reduce((best, s) => Math.max(best, s.height), 0);
  assert.ok(peak < straight, `${peak.toFixed(1)} м против ${straight.toFixed(1)}`);
  assert.ok(banked.stalled <= 4, `${banked.stalled} кадров без управления`);
});

test("НЕПОЛНАЯ ПЕТЛЯ оставляет машину В ДРУГОМ МЕСТЕ — ради этого она и нужна", () => {
  assert.equal(threeQuarter.episode.done, true);
  assert.equal(threeQuarter.episode.aborted, false);
  // Целая петля возвращает машину в точку входа, и наклон этого не меняет:
  // на 2π и синус, и «единица минус косинус» обнуляются одинаково. Три
  // четверти оборота — не замыкаются, и это единственный способ выйти из
  // фигуры не там, где вошёл.
  const closed = Math.hypot(
    loop.track.at(-1).along,
    loop.track.at(-1).height,
  );
  const open = Math.hypot(
    threeQuarter.track.at(-1).along,
    threeQuarter.track.at(-1).height,
  );
  // Три четверти оборота дают по геометрии смещение R·√2 = 18.4 м; замер даёт
  // 16.0 — машина проседает и срезает. У целой петли остаётся только её
  // собственная просадка, 8.1 м, и она вдвое меньше.
  assert.ok(
    open > threeQuarter.plan.radius,
    `неполная петля закрылась: ${open.toFixed(1)} м при радиусе ${threeQuarter.plan.radius.toFixed(1)}`,
  );
  assert.ok(
    open > closed * 1.7,
    `${open.toFixed(1)} м против ${closed.toFixed(1)} у целой — разницы нет`,
  );
  // Номинально три четверти оставляют машину ВЫШЕ входа на радиус, но замер
  // даёт ниже: просадка фигуры и хвост возврата съедают этот радиус целиком.
  // Это и есть честная разница между окружностью на бумаге и путём машины —
  // и повод не обещать маршруту высоту, которой на выходе не будет.
  // Мерить надо тем же, чем меряют ВОРОТА: провал плюс возврат из
  // перевёрнутого. Один только провал описывает путь фигуры, а хвост возврата
  // — это ещё высота, и у неполной петли она не отыгрывается ничем.
  const clearance =
    threeQuarter.plan.dip + invertedRecoveryHeight(capability);
  assert.ok(
    threeQuarter.track.at(-1).height > -clearance,
    `провалилась на ${(-threeQuarter.track.at(-1).height).toFixed(1)} при запасе ${clearance.toFixed(1)}`,
  );
  // И машину отдают РОВНОЙ, хотя расписание кончилось носом вниз: хвост
  // возврата держит ровную позу, а не последнюю позу расписания.
  assert.ok(
    threeQuarter.settledUp[1] > 0.98,
    `отдана с осью вверх ${threeQuarter.settledUp[1].toFixed(2)}`,
  );
  assert.ok(threeQuarter.stalled <= 4, `${threeQuarter.stalled} кадров без управления`);
});
