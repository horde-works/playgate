import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { ductHexacopterRangePadDocument } from "../games/make-a-mess/src/content/scenes/ductHexacopterRangePadDocument.ts";
import { DUCT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/rangeDuctHexacopter.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { rotateVector } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  advanceFlightFigure,
  beginFlightFigure,
  figureCapabilityOf,
  flightFigureVerdict,
  invertedRecoveryHeight,
  planFlightFigure,
  runningTurnProfile,
} from "../games/make-a-mess/src/game/flightFigures.ts";
import {
  centreOf,
  createMachine,
  dt,
  forwardAxis,
  stepMachine,
} from "./rotorcraft-rig.mjs";

/**
 * ФИГУРЫ VX-8 «Yaqui» НА НАСТОЯЩИХ СИЛАХ.
 *
 * Соседний стенд (`flight-figure-flight`) проверяет фигуры RAX-8, и повторять
 * его здесь незачем: петля, иммельман и петля вниз — общие. Здесь проверяется
 * то, что у ДРУГОЙ машины получается по-другому, и главным образом одно:
 *
 * У VX-8 есть орган, которого у RAX-8 нет, — тоннели вдоль носа на 53.9 м/с²,
 * впятеро сильнее собственного наклона. Из него следует фигура, которой у
 * винтокрылой машины быть не должно: КУЛЬБИТ. Полупетля вверх, реверс, кувырок
 * через нос и уход тем же курсом — ВЫШЕ входа, а не ниже.
 *
 * И из того же паспорта следует запрет, который стоил трёх сходов и записан
 * тут же: бочку эта машина крутит только отдельно. Тест на запрет — не
 * педантизм: параметр «бочка в петле» уже был написан однажды, и вернуть его
 * стоило бы дешевле, чем снова выяснить, почему нельзя.
 */

const SPEED = 14;
const vx = airVehicles.find((entry) => entry.id === "duct-hexacopter");
const pieces = compileSceneGroups(
  ductHexacopterRangePadDocument,
  new Map(),
).clusters.find(
  (cluster) => cluster.id === DUCT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
).pieces;

function build() {
  return createMachine({
    pieces,
    vehicle: vx,
    // Высоко и в чистом небе: стенд проверяет фигуру, а не ворота. Ворота —
    // отдельным тестом ниже, и там высота как раз назначается недостаточной.
    startPoint: [0, 120, 0],
    startVelocity: [SPEED, 0, 0],
    startNose: [1, 0, 0],
  });
}

const capability = figureCapabilityOf(build().machine);

/** Прогон одной фигуры от ровного полёта до ровного полёта. */
function fly(kind, { settleSteps = 90, bank = 0, sweep, spin } = {}) {
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
  const heading = [entryNose[0] / flat, entryNose[2] / flat];
  const plan = planFlightFigure(
    kind,
    SPEED,
    capability,
    heading,
    m.state.orientation,
    bank,
    sweep,
    spin,
  );

  let episode = beginFlightFigure(plan);
  const track = [];
  let stalled = 0;
  // Страховка от вечного цикла: эпизод снимается по времени сам, но если
  // когда-нибудь перестанет — тест обязан упасть, а не повиснуть.
  for (let guard = 0; !episode.done && guard < 3000; guard += 1) {
    const advanced = advanceFlightFigure(
      episode,
      m.state.orientation,
      Math.hypot(...m.state.velocity),
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
      up: rotateVector(m.state.orientation, [0, 1, 0]),
      nose: forwardAxis(m),
      height: centre[1] - entry[1],
      along:
        (centre[0] - entry[0]) * heading[0] +
        (centre[2] - entry[2]) * heading[1],
      side:
        (centre[0] - entry[0]) * -heading[1] +
        (centre[2] - entry[2]) * heading[0],
      speed: Math.hypot(...m.state.velocity),
      vertical: m.state.velocity[1],
      demand: advanced.command.speed,
    });
  }

  const exitNose = forwardAxis(m);
  return {
    plan,
    episode,
    track,
    stalled,
    heading,
    headingCos: (exitNose[0] * heading[0] + exitNose[2] * heading[1]) /
      (Math.hypot(exitNose[0], exitNose[2]) || 1),
    settledUp: rotateVector(m.state.orientation, [0, 1, 0]),
  };
}

const worst = (track, pick) => track.reduce((low, s) => Math.min(low, pick(s)), Infinity);
const best = (track, pick) => track.reduce((high, s) => Math.max(high, pick(s)), -Infinity);

const kulbit = fly("kulbit");
const roll = fly("roll");

test("КУЛЬБИТ: машина проходит тангажом ПОЛНЫЙ оборот, а не половину", () => {
  assert.equal(kulbit.episode.done, true);
  assert.equal(kulbit.episode.aborted, false);
  // Нос обязан побывать и в зените, и в земле: без второго это иммельман, без
  // первого — вообще не фигура. Оба конца — свидетельство того, что кувырок
  // состоялся, а не оборвался на верхушке.
  assert.ok(
    best(kulbit.track, (s) => s.nose[1]) > 0.95,
    `нос поднялся только до ${best(kulbit.track, (s) => s.nose[1]).toFixed(2)}`,
  );
  assert.ok(
    worst(kulbit.track, (s) => s.nose[1]) < -0.95,
    `нос опустился только до ${worst(kulbit.track, (s) => s.nose[1]).toFixed(2)}`,
  );
  assert.ok(
    worst(kulbit.track, (s) => s.up[1]) < -0.9,
    `машина не переворачивалась: ось вверх ${worst(kulbit.track, (s) => s.up[1]).toFixed(2)}`,
  );
});

test("КУЛЬБИТ уходит ТЕМ ЖЕ КУРСОМ — в этом вся разница с иммельманом", () => {
  // Полный оборот тангажа возвращает курс на место. Полоборота — разворачивает.
  // Здесь и лежит граница между двумя фигурами, и она проверяется числом.
  assert.ok(
    kulbit.headingCos > 0.9,
    `курс ушёл на ${(Math.acos(kulbit.headingCos) * 57.3).toFixed(0)}°`,
  );
  assert.ok(
    kulbit.settledUp[1] > 0.98,
    `вышла накренённой: ось вверх ${kulbit.settledUp[1].toFixed(3)}`,
  );
});

test("КУЛЬБИТ поднимает машину и НИ РАЗУ не опускает её ниже входа", () => {
  // Это его главное свойство и то, ради чего он существует. Иммельман кончает
  // наверху, но разворачивает; петля возвращает курс, но кончает ниже входа на
  // всю свою просадку. Кульбит — единственная фигура, которая делает и то, и
  // другое, и платит за это только небом.
  const lowest = worst(kulbit.track, (s) => s.height);
  assert.ok(lowest > -1, `провалилась на ${(-lowest).toFixed(1)} м ниже входа`);
  assert.equal(kulbit.plan.dip, 0, "объявленный провал обязан быть нулевым");
  const exit = kulbit.track.at(-1).height;
  assert.ok(exit > 12, `вышла всего на ${exit.toFixed(1)} м выше входа`);
  // И отдаёт машину ещё НА ПОДЪЁМЕ: хвост гашения ей не нужен, гасить нечего.
  assert.ok(
    kulbit.track.at(-1).vertical > 4,
    `отдала машину с вертикалью ${kulbit.track.at(-1).vertical.toFixed(1)} м/с`,
  );
});

test("КУЛЬБИТ укладывается в объявленное небо и в объявленное время", () => {
  const peak = best(kulbit.track, (s) => s.height);
  assert.ok(
    peak <= kulbit.plan.ceiling,
    `набрала ${peak.toFixed(1)} м при объявленных ${kulbit.plan.ceiling.toFixed(1)}`,
  );
  // Объявляется ЗАВЕДОМО больше набранного, и это не запас на глаз: потолок —
  // интеграл ТРЕБОВАНИЯ, а машина идёт за требованием с отставанием. Ворота
  // обязаны считать по просьбе, а не по тому, что из неё обычно выходит.
  assert.ok(kulbit.plan.ceiling > peak);
  assert.ok(
    kulbit.episode.seconds < kulbit.plan.seconds * 1.25,
    `${kulbit.episode.seconds.toFixed(2)} с против плановых ${kulbit.plan.seconds.toFixed(2)}`,
  );
});

test("КУЛЬБИТ ТРЕБУЕТ РЕВЕРСА — и требует его носом в землю, а не как попало", () => {
  // Вот здесь и живёт вся фигура: одно отрицательное число в требовании хода.
  // Проверяется не то, что оно отрицательное, а то, что оно отрицательное
  // ТАМ, ГДЕ НАДО. Реверс при носе в зенит опускал бы машину вместо подъёма.
  let deepest = 0;
  let deepestNoseY = 0;
  for (let index = 0; index <= 200; index += 1) {
    const progress = index / 200;
    const command = kulbit.plan.command(progress);
    if (command.speed < deepest) {
      deepest = command.speed;
      deepestNoseY = rotateVector(command.attitude, vx.nose)[1];
    }
  }
  assert.ok(
    deepest < -SPEED * 0.5,
    `самая глубокая просьба хода — ${deepest.toFixed(1)} м/с, реверса нет`,
  );
  const noseLength = Math.hypot(vx.nose[0], vx.nose[1], vx.nose[2]);
  assert.ok(
    deepestNoseY / noseLength < -0.8,
    `полный реверс просится при носе ${(deepestNoseY / noseLength).toFixed(2)} — не в землю`,
  );
});

test("КУЛЬБИТ не оставляет машину без управления ни на одном кадре", () => {
  // `maneuverScale` ниже половины означает, что аллокатор не смог дать позу и
  // держит нынешнюю. Один такой кадр посреди кувырка — и фигура кончается
  // случайностью. Стык дуги и кувырка сделан БЕЗ разрыва темпа именно ради
  // этого: кувырок начинается с той угловой скорости, которая уже есть.
  assert.equal(
    kulbit.stalled,
    0,
    `кульбит потерял управление на ${kulbit.stalled} кадрах`,
  );
});

test("СТЫК ДУГИ И КУВЫРКА идёт без разрыва темпа", () => {
  // Проверяется на расписании, а не на машине: разрыв темпа виден в плане
  // раньше, чем в полёте, и ловить его надо там.
  const rate = (progress) =>
    Math.hypot(...kulbit.plan.command(progress).angularVelocity);
  let jump = 0;
  for (let index = 1; index <= 400; index += 1) {
    jump = Math.max(jump, Math.abs(rate(index / 400) - rate((index - 1) / 400)));
  }
  assert.ok(jump < 0.35, `темп расписания скачет на ${jump.toFixed(2)} рад/с`);
});

test("ПОВОРОТ С ХОДУ сворачивается в прежнюю перекладку при нулевом входе", () => {
  // `halfTurnSeconds` теперь ЧАСТНЫЙ СЛУЧАЙ этой формулы, а не отдельная
  // формула рядом. Проверяется именно это: два выражения, которые обязаны
  // совпадать, совпадают до числа.
  for (const alpha of [0.5, 2, 8]) {
    const profile = runningTurnProfile(Math.PI, alpha);
    assert.ok(
      Math.abs(profile.seconds - 2 * Math.sqrt(Math.PI / alpha)) < 1e-9,
      `α=${alpha}: ${profile.seconds} против ${2 * Math.sqrt(Math.PI / alpha)}`,
    );
    assert.ok(Math.abs(profile.angleAt(0)) < 1e-9);
    assert.ok(Math.abs(profile.angleAt(1) - Math.PI) < 1e-9);
  }
  // А с ненулевым входом поворот занимает МЕНЬШЕ времени: часть темпа уже есть.
  const cold = runningTurnProfile(Math.PI, 2);
  const running = runningTurnProfile(Math.PI, 2, 1.14);
  assert.ok(
    running.seconds < cold.seconds,
    `с ходу ${running.seconds.toFixed(2)} с против ${cold.seconds.toFixed(2)} с холодного`,
  );
  assert.ok(running.peakRate > cold.peakRate);
});

test("БОЧКА: машина крутится вокруг НОСА, а нос остаётся в горизонте", () => {
  assert.equal(roll.episode.done, true);
  assert.equal(roll.episode.aborted, false);
  // Нос не уходит: это и отличает бочку от петли. Замер даёт ±0.23 — остаток
  // просадки, а не подъём носа.
  assert.ok(
    Math.abs(best(roll.track, (s) => s.nose[1])) < 0.35 &&
      Math.abs(worst(roll.track, (s) => s.nose[1])) < 0.35,
    `нос ушёл в диапазон ${worst(roll.track, (s) => s.nose[1]).toFixed(2)}..${best(roll.track, (s) => s.nose[1]).toFixed(2)}`,
  );
  // А корпус переворачивается целиком.
  assert.ok(
    worst(roll.track, (s) => s.up[1]) < -0.95,
    `не перевернулась: ось вверх ${worst(roll.track, (s) => s.up[1]).toFixed(2)}`,
  );
  assert.ok(roll.settledUp[1] > 0.98);
  assert.ok(roll.headingCos > 0.95, `курс ушёл на ${(Math.acos(roll.headingCos) * 57.3).toFixed(0)}°`);
  assert.equal(roll.stalled, 0, `${roll.stalled} кадров без управления`);
});

test("БОЧКА ПАДАЕТ, и провал объявлен ЗАРАНЕЕ, а не обнаружен потом", () => {
  // За полный оборот вертикальная составляющая тяги гасит сама себя: интеграл
  // косинуса по обороту равен нулю. Значит, бочка летится баллистически, и
  // объявленный провал — честное `½g·t²`, а не оценка.
  const drop = -worst(roll.track, (s) => s.height);
  assert.ok(drop > 5, `бочка обязана просесть, а замер даёт ${drop.toFixed(1)} м`);
  assert.ok(
    drop < roll.plan.dip,
    `просела на ${drop.toFixed(1)} м при объявленных ${roll.plan.dip.toFixed(1)}`,
  );
  // Тридцать метров — это приговор месту, а не фигуре: бочку этой машине можно
  // крутить только высоко, и ворота обязаны сказать это раньше земли.
  assert.ok(roll.plan.dip > 25, `объявленный провал ${roll.plan.dip.toFixed(1)} м подозрительно мал`);
});

test("БОЧКУ В ПЕТЛЮ И В КУВЫРОК НЕ ПУСКАЮТ — запрет измерен, а не предположен", () => {
  // У винтокрылой машины одна сила и она вдоль оси корпуса; в дуге эта ось
  // обязана смотреть в центр. Крен уводит её оттуда — и центростремительного
  // не остаётся. Замеры (14 м/с): полбочки в петле — сход и 130 м вниз, оборот
  // — петля не замыкается, два оборота — 435 м вниз. В кувырке запрет другой,
  // но такой же жёсткий: там не хватает ВЛАСТИ, машина держит один быстрый
  // канал вращения за раз.
  //
  // Тест сторожит не физику, а КОД: параметр бочки не должен снова просочиться
  // в эти две фигуры. Поэтому проверяется, что `spin` их плана не меняет.
  const heading = [1, 0];
  for (const kind of ["loop", "kulbit"]) {
    const plain = planFlightFigure(kind, SPEED, capability, heading);
    for (const spin of [0.5, 1, 2]) {
      const spun = planFlightFigure(
        kind,
        SPEED,
        capability,
        heading,
        [0, 0, 0, 1],
        0,
        undefined,
        spin,
      );
      assert.equal(spun.seconds, plain.seconds, `${kind}: бочка изменила время`);
      for (const progress of [0.25, 0.5, 0.75]) {
        const a = plain.command(progress).attitude;
        const b = spun.command(progress).attitude;
        const dot = Math.abs(
          a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
        );
        assert.ok(
          dot > 1 - 1e-9,
          `${kind}: бочка ${spin} изменила позу на прогрессе ${progress}`,
        );
      }
    }
  }
});

test("ВОРОТА держат кульбит внизу и пускают наверху", () => {
  const plan = planFlightFigure("kulbit", SPEED, capability, [1, 0]);
  const recovery = invertedRecoveryHeight(capability);
  // Внизу не пускают по возврату из перевёрнутого: у этой машины он стоит
  // 21.4 м, и это не про план фигуры, а про то, чем кончится срыв.
  const low = flightFigureVerdict(
    plan,
    {
      speed: SPEED,
      heightAboveGround: recovery - 2,
      headroom: plan.ceiling + 20,
      authority: 1,
    },
    capability,
  );
  assert.equal(low.flyable, false);
  assert.match(low.reason, /высоты на возврат/);
  // И не пускают, когда сверху нет объявленного неба.
  const tight = flightFigureVerdict(
    plan,
    {
      speed: SPEED,
      heightAboveGround: recovery + 20,
      headroom: plan.ceiling - 1,
      authority: 1,
    },
    capability,
  );
  assert.equal(tight.flyable, false);
  assert.match(tight.reason, /неба/);
  const open = flightFigureVerdict(
    plan,
    {
      speed: SPEED,
      heightAboveGround: recovery + 20,
      headroom: plan.ceiling + 20,
      authority: 1,
    },
    capability,
  );
  assert.equal(open.flyable, true, open.reason ?? "");
});
