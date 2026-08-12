// Проверки ПЕРЕВОДА принятого объекта в паспорт машины. Смысл всех тестов
// здесь один: паспорт не имеет права разойтись с геометрией, которую владелец
// принял глазами. Неверный перевод в полёте не виден — он всплывает силуэтом
// или графом опор, и найдёт его не тест, а игрок.
import test from "node:test";
import assert from "node:assert/strict";

import {
  createDuctHexacopterBlueprint,
  createDuctHexacopterVehicleFrame,
  ductHexacopterPrototypeBlueprint,
  ductHexacopterPrototypeFrame,
  DUCT_HEXACOPTER_PROPOSED_LIMITS,
  DUCT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS,
  DUCT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS,
} from "../games/make-a-mess/src/game/ductHexacopter.ts";
import {
  ductHexacopterObject,
  ductHexacopterPartBounds,
  DUCT_HEX_GEAR_RETRACTION,
  DUCT_HEX_LANDING_STATIONS,
  DUCT_HEX_LIFT_STATIONS,
  DUCT_HEX_YAW_STATIONS,
} from "../games/make-a-mess/src/content/objects/vehicles/ductHexacopterObject.ts";

const blueprint = ductHexacopterPrototypeBlueprint;
const frame = ductHexacopterPrototypeFrame;
const partById = (id) => ductHexacopterObject.parts.find((part) => part.id === id);

test("точки тяги стоят на осях колец, а не рядом с ними", () => {
  assert.equal(blueprint.enginePoints.length, 6);
  assert.equal(DUCT_HEXACOPTER_ROTOR_CAPACITY_WEIGHTS.length, 6);
  assert.equal(DUCT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS.length, 6);

  // Порядок трёх массивов связан индексом: смеситель читает их парами. Если
  // один из них когда-нибудь соберут отдельным проходом, кольца поменяются
  // знаками вращения и машина закрутится вокруг себя.
  DUCT_HEX_LIFT_STATIONS.forEach((station, index) => {
    const point = blueprint.enginePoints[index];
    assert.ok(Math.hypot(point[0] - station.x, point[2] - station.z) < 1e-9,
      `${station.id}: точка тяги уехала с оси кольца`);
    assert.ok(Math.abs(point[1] - station.planeY) < 1e-9,
      `${station.id}: точка тяги не на плоскости диска`);
    assert.equal(DUCT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS[index], station.spin === "cw" ? 1 : -1,
      `${station.id}: знак вращения разошёлся с объектом`);
  });

  const clockwise = DUCT_HEXACOPTER_ROTOR_SPIN_DIRECTIONS.filter((sign) => sign === 1).length;
  assert.equal(clockwise, 3, "реактивные моменты не уравновешены");
});

test("продольная пара: ось строго вдоль киля, реверсивная, с настоящим плечом", () => {
  assert.equal(blueprint.yawThrusters.length, 2);
  for (const thruster of blueprint.yawThrusters) {
    const station = DUCT_HEX_YAW_STATIONS.find((candidate) => candidate.id === thruster.id);
    assert.ok(station, `нет станции ${thruster.id}`);
    assert.ok(Math.abs(thruster.point[0] - station.x) < 1e-9, "тоннель уехал по борту");
    assert.ok(Math.abs(thruster.axis[0]) < 1e-9 && Math.abs(thruster.axis[1]) < 1e-9,
      `${thruster.id}: ось не параллельна килю — появится боковая сила, которую никто не гасит`);
    assert.ok(thruster.maximumForce > 0, `${thruster.id}: нулевая тяга`);
  }
  const [left, right] = blueprint.yawThrusters;
  assert.ok(Math.abs(left.point[0] + right.point[0]) < 1e-9, "плечи не зеркальны");
  assert.ok(Math.abs(left.point[0]) > 0.5, "плечо рыскания меньше полуметра — момента не будет");
});

test("опоры: паспорт стойки собран из колена и оси пятки объекта", () => {
  assert.equal(blueprint.landingStruts.length, 4);
  for (const strut of blueprint.landingStruts) {
    const station = DUCT_HEX_LANDING_STATIONS.find((candidate) => candidate.id === strut.plan.id);
    assert.ok(station, `нет станции ${strut.plan.id}`);
    for (const axis of [0, 1, 2]) {
      assert.ok(Math.abs(strut.plan.mount[axis] - station.knee[axis]) < 1e-9,
        `${strut.plan.id}: опора считается не от колена`);
      assert.ok(Math.abs(strut.plan.axis[axis] - (station.axle[axis] - station.knee[axis])) < 1e-9,
        `${strut.plan.id}: ось стойки не смотрит на пятку`);
    }
    assert.ok(strut.plan.stroke > 0, `${strut.plan.id}: нулевой ход олео`);

    // Каждый кусок, объявленный обязательным или ходящим, обязан существовать в
    // объекте: имя, которого нет, — это молча неработающая нога.
    for (const member of [...strut.requiredMembers, ...strut.travellingMembers, ...strut.foldingMembers]) {
      const id = member.replaceAll(":", "");
      assert.ok(partById(id), `${strut.plan.id}: в паспорте объявлен кусок ${id}, которого нет в объекте`);
    }
    // Цапфа — ось, вокруг которой ходит остальное, — сама складываться не может.
    assert.ok(!strut.foldingMembers.some((member) => member.includes("trunnion")),
      `${strut.plan.id}: цапфа попала в складывающиеся куски`);
  }
});

test("уборка: короткий путь, знак в оси, и контракт тот же, что у объекта", () => {
  for (const strut of blueprint.landingStruts) {
    const contract = DUCT_HEX_GEAR_RETRACTION.find((candidate) => candidate.id === strut.plan.id);
    assert.ok(contract, `нет контракта уборки для ${strut.plan.id}`);
    const degrees = (strut.retraction.angle * 180) / Math.PI;
    assert.ok(Math.abs(degrees - contract.rangeDegrees[1]) < 1e-6,
      `${strut.plan.id}: угол уборки разошёлся с объектом`);
    assert.ok(degrees > 0 && degrees < 180,
      `${strut.plan.id}: ${degrees.toFixed(0)} градусов — это длинный путь, нога пойдёт сквозь грунт`);
    assert.ok(Math.abs(Math.abs(strut.retraction.hinge[2]) - 1) < 1e-9,
      `${strut.plan.id}: петля не вдоль корпуса`);
    assert.ok(strut.retraction.seconds > 0, `${strut.plan.id}: уборка мгновенная`);
  }
});

test("вооружение выходит из настоящих стволов объекта", () => {
  assert.equal(blueprint.armament.cannon.mounts.length, 3);
  assert.equal(blueprint.armament.rockets.mounts.length, 12);
  for (const mount of [...blueprint.armament.cannon.mounts, ...blueprint.armament.rockets.mounts]) {
    const part = partById(mount.id);
    assert.ok(part, `узел ${mount.id} не соответствует ни одной детали объекта`);
    const bounds = ductHexacopterPartBounds(part);
    assert.ok(Math.abs(mount.muzzle[2] - bounds.max[2]) < 1e-9,
      `${mount.id}: срез объявлен не там, где кончается ствол`);
  }
  // Ракета обязана взводиться ЗА пределами машины, иначе она снимет свою же.
  assert.ok(blueprint.armament.rockets.launchClearance > 2,
    "клиренс пуска меньше габарита — снаряд взведётся у своего борта");
});

test("кадр: вращается только то, что вращается, ноги вне обвода", () => {
  assert.deepEqual(frame.independentMemberMatches, [":blade:"],
    "маска независимых тел шире лопастей — сотни кусков получат тела без движения");
  assert.deepEqual(frame.contactMemberExcludes, [":landing-"],
    "нога осталась в обводе компаунда — её собственный луч найдёт опору в пятке");
  assert.ok(frame.supportStruts?.length === 4, "кадр не знает про опоры");
  assert.ok(frame.proximitySensors.length > 0, "кадр без датчиков");
  assert.ok(frame.proximitySensors.some((sensor) => sensor.normal[1] < 0),
    "нет ни одного датчика вниз — оценка высоты на посадке останется пустой");
  assert.equal(frame.envelopeMatch, ":blade:");
  // Паспорт не регистрирует себя в мире: причал выбирает не этот файл.
  assert.equal(frame.clusterId, blueprint.placement.clusterId);
});

test("размещение переносит точки и поворачивает оси, но не наоборот", () => {
  const placed = createDuctHexacopterBlueprint({
    sceneId: "test",
    clusterId: "test:vehicle",
    position: [12, 0.5, -7],
    yaw: Math.PI / 2,
  });
  const placedFrame = createDuctHexacopterVehicleFrame(placed);

  // Точка едет вместе с машиной.
  assert.ok(Math.abs(placed.origin[0] - 12) < 1e-9 && Math.abs(placed.origin[2] + 7) < 1e-9,
    "начало кадра не переехало на причал");
  // Ось только поворачивается: длина обязана остаться единичной, а сдвиг — не попасть в неё.
  for (const thruster of placed.yawThrusters) {
    const length = Math.hypot(...thruster.axis);
    assert.ok(Math.abs(length - 1) < 1e-9, "ось тоннеля перестала быть единичной");
  }
  assert.ok(Math.abs(Math.hypot(...placedFrame.nose) - 1) < 1e-9, "нос перестал быть направлением");
  // Разворот на 90 градусов переводит нос с +z на -x или +x, но не оставляет на месте.
  assert.ok(Math.abs(placedFrame.nose[2]) < 1e-9, "нос не повернулся вместе с машиной");
});

test("предложенные лимиты не молчат нулями", () => {
  assert.ok(DUCT_HEXACOPTER_PROPOSED_LIMITS.enginePower > 0);
  assert.ok(DUCT_HEXACOPTER_PROPOSED_LIMITS.lateralThrust > 1e-6,
    "нулевая боковая тяга молча выключает заданный курс и краб");
  assert.ok(blueprint.flight.liftReserve > 1,
    "запас подъёма не больше единицы — способность машины окажется пустой");
  assert.ok(blueprint.flight.angularDamping > 0,
    "нулевое угловое демпфирование — расписание попросит неудержимый темп");
  assert.ok(blueprint.flight.maximumTilt > 0 && blueprint.flight.spoolSeconds > 0);
});
