import assert from "node:assert/strict";
import test from "node:test";
import {
  airVehicles,
  ISLAND_AIRPORT_DC3_AIR_VEHICLE,
} from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  DC3_CIRCUIT_RADIUS,
  DC3_FLARE_ROUNDING,
  DC3_GLIDE_ANGLE,
  DC3_TOUCHDOWN_X,
  DC3_TURN_RADIUS,
  dc3AirportArrivalPlan,
  dc3AirportPlan,
  dc3AirportRoute,
  dc3GlideAltitude,
} from "../games/make-a-mess/src/game/dc3AirportRoutes.ts";
import {
  ISLAND_AIRPORT_DC3_COMMAND_POST,
  ISLAND_AIRPORT_DC3_PLACEMENT,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportDc3.ts";
import {
  AIRPORT_RUNWAY,
  AIRPORT_RUNWAY_TOP_Y,
  AIRPORT_WORLD,
} from "../games/make-a-mess/src/content/scenes/islandAirport/islandAirportPlan.ts";
import { vehicleFrames } from "../games/make-a-mess/src/game/vehicleFrames.ts";
import { compileCommandActuators } from "../games/make-a-mess/src/game/vehicleActuation.ts";
import { dc3BlockoutObject } from "../games/make-a-mess/src/content/objects/aircraft/dc3BlockoutObject.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import {
  DC3_ACTUATOR_PIECES,
  DC3_AIRPLANE_CLASS,
  DC3_AIRPLANE_PASSPORT,
  DC3_GUIDANCE_CENTRE_HEIGHT,
  DC3_STAND_CLUSTER_ID,
  DC3_STALL_MASS,
  compileDc3AirplanePieces,
  createDc3Propellers,
  dc3AirplanePoint,
  dc3AirplaneVector,
  dc3AirplaneStandFrame,
  dc3AirplaneStandMass,
  dc3AirplaneStandPieces,
  dc3AirplaneStandVehicle,
  dc3SurfaceDeflectionDegrees,
} from "../games/make-a-mess/src/game/dc3Airplane.ts";
import { createAirplane, stepAirplane, centreOf, dt } from "./airplane-rig.mjs";
import { dc3AirframeParts } from "../games/make-a-mess/src/content/objects/aircraft/dc3AirframeParts.ts";

test("compiled pieces keep Object Lab ids and actuator channels", () => {
  const pieces = compileDc3AirplanePieces();
  assert.equal(pieces.length, dc3AirframeParts().length);
  assert.ok(pieces.every((piece) => piece.clusterId === DC3_STAND_CLUSTER_ID));
  for (const entry of DC3_ACTUATOR_PIECES) {
    const piece = pieces.find((item) => item.id === entry.id);
    assert.ok(piece, `missing compiled part ${entry.id}`);
    assert.equal(piece.actuator?.commandChannel, entry.actuator.commandChannel);
  }
  const channels = compileCommandActuators(pieces)
    .map((binding) => binding.commandChannel)
    .sort();
  assert.deepEqual(channels, [
    "aileron",
    "elevator",
    "flap",
    "rudder",
    "throttle:0",
    "throttle:1",
  ]);
  assert.equal(
    pieces.filter((piece) => piece.hinge).length,
    0,
    "control surfaces are not door hinges",
  );
  assert.ok(Object.keys(dc3BlockoutObject.surfaceHinges).length >= 9);
  // Обшивка крыла — набор панелей, а не одна шкура: ищем панель, а не кусок
  // `wing-right`, которого больше нет.
  const wing = pieces.find((piece) => piece.id.startsWith("wing-right:"));
  const cage = pieces.filter((piece) => piece.id.startsWith("fuselage-frame-") || piece.id.startsWith("longeron-"));
  assert.ok(wing, "нет ни одной панели правой консоли");
  assert.equal(wing?.material, "aluminium");
  assert.ok(cage.length > 0 && cage.every((piece) => piece.material === "steel"));
});

// УБОРКА ШАССИ: ВПЕРЁД, И КОЛЕСО ОСТАЁТСЯ СНАРУЖИ.
//
// Приводится общим правилом рейса (крейсер — убрано, всё остальное и отказ —
// выпущено), поэтому здесь проверяется ДАННЫЕ: те ли куски едут, вокруг той
// ли оси и на тот ли угол. Хвостовое колесо у этого типа не убирается, и это
// не упущение — так на машине.
test("основная стойка убирается вперёд, хвостовая остаётся", () => {
  const struts = dc3AirplaneStandFrame.supportStruts;
  const main = struts.filter((strut) => strut.plan.id !== "gear-tail");
  const tail = struts.find((strut) => strut.plan.id === "gear-tail");
  assert.equal(main.length, 2);
  assert.equal(tail?.retraction, undefined, "хвостовое колесо не убирается");
  for (const strut of main) {
    const retraction = strut.retraction;
    assert.ok(retraction, `${strut.plan.id}: уборка не объявлена`);
    // Ось размахная: складывание идёт вперёд, а не вбок.
    assert.ok(
      Math.abs(retraction.hinge[0]) > 0.9 || Math.abs(retraction.hinge[2]) > 0.9,
      "ось уборки должна быть размахной",
    );
    const degrees = (retraction.angle * 180) / Math.PI;
    assert.ok(
      degrees < -90 && degrees > -115,
      `угол уборки ${degrees.toFixed(0)}° вне коридора «колесо торчит на треть»`,
    );
    assert.ok(retraction.seconds > 2, "мгновенная уборка читается телепортом");
    // Едет вся нога, но НЕ узлы навески: они остаются на гондоле.
    assert.ok(
      strut.foldingMembers.some((member) => member.includes("-wheel")),
      "колесо обязано ехать со стойкой",
    );
    assert.ok(
      strut.foldingMembers.every((member) => !member.includes("trunnion")
        && !member.includes("jack-fitting")),
      "узлы навески не едут: они и есть точка поворота",
    );
  }
});

test("the compound envelope is the skin, not the cage", () => {
  const colliders = compoundClusterColliders(
    dc3AirplaneStandFrame,
    dc3AirplaneStandPieces,
    new Set(),
  );
  const ids = colliders.map((collider) => collider.sourceId);
  // Набор и салон не участвуют в ударе о полосу. Проверяется результат
  // сборки, а не строка маски: маска могла бы совпасть, а кусок остаться.
  for (const needle of [
    "gear-",
    "stringer-",
    "longeron-",
    "fuselage-frame-",
    "cabin-",
    "cockpit-",
    "centre-tank-",
    "wing-spar-",
    "wing-former-",
  ]) {
    assert.equal(
      ids.some((id) => id.includes(needle)),
      false,
      `${needle} остался в обводе`,
    );
  }
  assert.ok(ids.some((id) => id.startsWith("fuselage:")), "нет панели фюзеляжа");
  assert.ok(ids.some((id) => id.startsWith("nacelle-")), "нет панели гондолы");
  assert.ok(
    ids.some((id) => id.startsWith("wing-left:") || id.startsWith("wing-right:")),
    "нет панели крыла",
  );
  assert.ok(ids.some((id) => id.includes("propeller-")), "нет винта");
  // Длинный AABB набора — это и был невидимый удар: ящик на всю длину
  // фюзеляжа. Обшивка нарезана отсеками, такого пролёта у неё нет.
  const longSpan = colliders.filter(
    (collider) =>
      collider.shape === "cuboid" &&
      Math.max(collider.args[0], collider.args[2]) > 4,
  );
  assert.equal(
    longSpan.length,
    0,
    `длинный ящик в обводе: ${longSpan.map((collider) => collider.sourceId).join(", ")}`,
  );
  const remainingOleo = Math.max(
    ...dc3AirplaneStandFrame.supportStruts.map(
      (strut) => strut.plan.stroke * (1 - strut.plan.staticSagShare),
    ),
  );
  const cuboidCorners = (collider) => {
    const [hx, hy, hz] = collider.args;
    const [x, y, z] = collider.position;
    const corners = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corners.push([x + sx * hx, y + sy * hy, z + sz * hz]);
        }
      }
    }
    return corners;
  };
  const restMin = Math.min(
    ...colliders.flatMap((collider) => cuboidCorners(collider).map((point) => point[1])),
  );
  assert.ok(
    restMin > remainingOleo,
    `в стоянке низ обвода ${restMin.toFixed(3)} м — меньше остатка олео ${remainingOleo.toFixed(3)} м`,
  );
  // Плоский фюзеляж: раньше стрингер уходил под бетон уже на +4°.
  const level = DC3_AIRPLANE_PASSPORT.groundPitch;
  const cosine = Math.cos(level);
  const sine = Math.sin(level);
  const levelMin = Math.min(
    ...colliders.flatMap((collider) =>
      cuboidCorners(collider).map((point) => point[1] * cosine - point[2] * sine),
    ),
  );
  assert.ok(
    levelMin > 0,
    `на ровном фюзеляже обвод уходит под бетон на ${levelMin.toFixed(3)} м`,
  );
});

test("the stand frame reads the object and stays out of the vehicle-frame catalog", () => {
  const frame = dc3AirplaneStandFrame;
  assert.equal(frame.id, DC3_AIRPLANE_CLASS.id);
  assert.equal(frame.clusterId, DC3_STAND_CLUSTER_ID);
  assert.equal(frame.envelopeMatch, "wing-");
  assert.equal(frame.independentMemberMatches, undefined);
  assert.ok(frame.nose[2] > 0.8);
  assert.ok(Math.abs(frame.liftCentre[0]) < 0.4);
  assert.equal(dc3AirplaneStandVehicle.flight.liftSource, "wing");
  assert.equal(dc3AirplaneStandVehicle.flight.airplane, DC3_AIRPLANE_CLASS.passport);
  // Стенд — это СТЕНД: свой кластер, свой берт, никаких сцен. В реестр
  // судов уходит посаженная на полосу машина, а не он.
  assert.equal(
    airVehicles.some((vehicle) => vehicle.clusterId === DC3_STAND_CLUSTER_ID),
    false,
  );
  // Кадр ТИПА в реестре есть — это посаженная на полосу машина. Стендового
  // кластера там нет и быть не должно: у стенда нет сцены.
  assert.equal(
    vehicleFrames.some((item) => item.clusterId === DC3_STAND_CLUSTER_ID),
    false,
  );
});

test("the airport DC-3 is dispatched from its own command post", () => {
  const vehicle = ISLAND_AIRPORT_DC3_AIR_VEHICLE;
  assert.equal(vehicle.clusterId, ISLAND_AIRPORT_DC3_PLACEMENT.clusterId);
  // МАШИНА ОБЯЗАНА СТОЯТЬ В ОБОИХ РЕЕСТРАХ, И ИМЕННО В ЭТОМ ПОРЯДКЕ.
  //
  // `vehicleFrames` заставляет неподвижный мир отпустить куски, `airVehicles`
  // строит из них тело. Только во втором — это 127 неподвижных коллайдеров и
  // динамический компаунд в одной точке: машину рвёт на первом же шаге, и
  // никакой другой тест этого не ловит.
  assert.ok(
    vehicleFrames.some((item) => item.clusterId === vehicle.clusterId),
    "кадр не в vehicleFrames: мир не отпустит куски",
  );
  assert.ok(
    airVehicles.some((item) => item.clusterId === vehicle.clusterId),
    "машина не в airVehicles: тело не построится",
  );
  assert.equal(vehicle.flight.liftSource, "wing");
  assert.equal(vehicle.flight.airplane, DC3_AIRPLANE_CLASS.passport);
  // Облёт — один рейс. Учебное руление — вторая команда той же стойки,
  // без сорокаминутного полёта (вердикт Igor, 15.08.2026).
  assert.deepEqual(
    vehicle.departure?.target.actions?.map((action) => action.id),
    ["survey", "taxi"],
  );
  assert.equal(vehicle.departure?.flightKind, "survey");
  // Пункт стоит на траве, а не на бетоне: разбег не проходит сквозь человека.
  const post = ISLAND_AIRPORT_DC3_COMMAND_POST;
  assert.ok(
    post[2] > AIRPORT_RUNWAY.centreZ + AIRPORT_RUNWAY.width / 2,
    "командный пункт стоит вне полосы",
  );
  assert.ok(
    Math.hypot(post[0], post[2]) < AIRPORT_WORLD.boundaryRadius,
    "до пункта можно дойти",
  );
});

test("each propeller is rigidly framed by its nacelle shaft", () => {
  const propellers = createDc3Propellers(ISLAND_AIRPORT_DC3_PLACEMENT);
  for (const [index, side] of ["left", "right"].entries()) {
    const canonical = dc3BlockoutObject.propellerShafts[side];
    const propeller = propellers[index];
    const expectedHub = dc3AirplanePoint(
      ISLAND_AIRPORT_DC3_PLACEMENT,
      canonical.pivot,
    );
    const expectedAxis = dc3AirplaneVector(
      ISLAND_AIRPORT_DC3_PLACEMENT,
      canonical.axis,
    );
    assert.deepEqual(propeller.hub, expectedHub);
    assert.deepEqual(propeller.axis, expectedAxis);
    assert.ok(Math.abs(Math.hypot(...propeller.axis) - 1) < 1e-12);
    assert.equal(propeller.phaseSign, 1);

    const blades = dc3BlockoutObject.parts.filter(
      (part) => part.kind === "mesh" && part.group === canonical.group,
    );
    assert.equal(blades.length, 3);
    for (const blade of blades) {
      const centre = [0, 1, 2].map(
        (axis) =>
          blade.vertices.reduce((sum, vertex) => sum + vertex[axis], 0) /
          blade.vertices.length,
      );
      const radius = centre.map((value, axis) => value - canonical.pivot[axis]);
      const axial = radius.reduce(
        (sum, value, axis) => sum + value * canonical.axis[axis],
        0,
      );
      assert.ok(
        Math.abs(axial) < 1e-9,
        `${side} blade centre is not in the shaft-normal plane: ${axial}`,
      );
    }
  }
});

test("the survey route is one flight: runway, circuit, glide slope, rollout", () => {
  const berth = [
    AIRPORT_RUNWAY.westDesignatorX,
    AIRPORT_RUNWAY_TOP_Y,
    AIRPORT_RUNWAY.centreZ,
  ];
  const plan = dc3AirportPlan("survey", berth);
  // РАЗБЕГ И ПРОБЕГ ИДУТ ПО БЕТОНУ. Ноль и единица трассы обязаны лежать на
  // высоте плиты: у крылатой машины нет вертикального отхода.
  // План говорит ЦЕНТРОМ машины (как весь флот): на полосе это высота центра
  // стоящей машины — колёса при этом на бетоне.
  const standing = AIRPORT_RUNWAY_TOP_Y + DC3_GUIDANCE_CENTRE_HEIGHT;
  assert.ok(Math.abs(plan.altitude(0) - standing) < 0.01);
  assert.ok(Math.abs(plan.altitude(1) - standing) < 0.01);
  assert.equal(plan.verticalDeparture, undefined);
  assert.equal(plan.verticalArrival, undefined);
  // Круг выше острова и не идеально ровный: облёт, а не шайба.
  const heights = [];
  for (let i = 0; i <= 60; i += 1) heights.push(plan.altitude(i / 60));
  const top = Math.max(...heights);
  assert.ok(top > 120, `круг слишком низкий: ${top.toFixed(0)}`);
  const circuit = heights.slice(12, 40);
  assert.ok(
    Math.max(...circuit) - Math.min(...circuit) > 25,
    "траектория облёта обязана дышать по высоте",
  );
  // ГЛИССАДА — ПРЯМАЯ И КОМФОРТНАЯ. Считаем её угол по самой трассе.
  const final = plan.finalFrom;
  const a = plan.point(final);
  const b = plan.point(final + (1 - final) * 0.5);
  const slope = Math.atan2(a[1] - b[1], Math.hypot(a[0] - b[0], a[2] - b[2]));
  assert.ok(
    slope > (3 * Math.PI) / 180 && slope < (5.5 * Math.PI) / 180,
    `глиссада ${((slope * 180) / Math.PI).toFixed(1)}° вне комфортного створа`,
  );
  // Створ идёт ВДОЛЬ полосы, а не через остров.
  assert.ok(Math.abs(a[2] - AIRPORT_RUNWAY.centreZ) < 4);
  assert.ok(a[0] < AIRPORT_RUNWAY.westThresholdX);
  // Кромка плиты: выравнивание ещё выше плиты. Иначе колёса встречают грунт
  // за метр до бетона. Запас живёт в дуге выравнивания, не в сдвиге прицела.
  const lip = dc3GlideAltitude(DC3_TOUCHDOWN_X - AIRPORT_RUNWAY.westThresholdX);
  assert.ok(
    lip - standing > AIRPORT_RUNWAY_TOP_Y,
    `у кромки глиссада всего ${(lip - standing).toFixed(2)} м над стоянкой`,
  );
  const glideSlope = Math.tan(DC3_GLIDE_ANGLE);
  const join = DC3_FLARE_ROUNDING;
  assert.ok(
    Math.abs(
      dc3GlideAltitude(join) - (standing + (glideSlope * join) / 2),
    ) < 1e-9,
    "добавка выравнивания не должна ломать стык с прямой глиссадой",
  );
  const far = join + 40;
  assert.ok(
    Math.abs(
      dc3GlideAltitude(far) -
        (standing + glideSlope * far - (glideSlope * join) / 2),
    ) < 1e-9,
    "прямая глиссада не должна ехать из-за финиша",
  );
});

test("the circuit fits the passport turn, and the world envelope fits the circuit", () => {
  // ТРАССА ШИРЕ МИНИМАЛЬНОГО ВИРАЖА, иначе машина режет её весь полёт.
  assert.ok(DC3_CIRCUIT_RADIUS > DC3_TURN_RADIUS);
  const plan = dc3AirportPlan("survey", [
    AIRPORT_RUNWAY.westDesignatorX,
    AIRPORT_RUNWAY_TOP_Y,
    AIRPORT_RUNWAY.centreZ,
  ]);
  let reach = 0;
  let ceiling = 0;
  for (let i = 0; i <= 400; i += 1) {
    const point = plan.point(i / 400);
    reach = Math.max(reach, Math.hypot(point[0], point[2]));
    ceiling = Math.max(ceiling, point[1]);
  }
  // Небо обязано накрыть трассу, камера — показать машину с той стороны круга.
  assert.ok(
    AIRPORT_WORLD.skyRadius > reach + 40,
    `небо ${AIRPORT_WORLD.skyRadius} не накрывает трассу ${reach.toFixed(0)}`,
  );
  assert.ok(AIRPORT_WORLD.cameraFar > 2 * reach);
  // Землю при этом не растили: конверт двигали, остров — нет.
  // Земля выросла на юг под ВПП 08 — радиус мира следует за берегом.
  assert.equal(AIRPORT_WORLD.radius, 134);
  assert.equal(AIRPORT_WORLD.boundaryRadius, 166);
  assert.ok(ceiling < AIRPORT_WORLD.skyRadius);
});

test("stand mass is the stall identity; CoM stays inside the wing box", () => {
  const mass = dc3AirplaneStandMass(dc3AirplaneStandPieces);
  assert.ok(Math.abs(mass.mass - DC3_STALL_MASS) < 1e-6);
  assert.ok(Math.abs(mass.centre[0]) < 1.2);
  assert.ok(mass.centre[1] > 0.2 && mass.centre[1] < 3.2);
  assert.ok(mass.centre[2] > -6 && mass.centre[2] < 4);
});

test("force stand: cruise guidance keeps the wing flying and flaps stay up", () => {
  const machine = createAirplane({
    startPoint: [0, 80, 0],
    startVelocity: [0, 0, 67],
  });
  const start = centreOf(machine);
  let peakLift = 0;
  for (let step = 0; step < 2 / dt; step += 1) {
    const result = stepAirplane(machine, {
      forwardSpeed: 67,
      lateralSpeed: 0,
      yawRate: 0,
      liftFraction: 0.15,
    });
    peakLift = Math.max(peakLift, result.lift);
  }
  const now = centreOf(machine);
  assert.ok(machine.lastStep.airspeed > 40);
  assert.equal(machine.lastStep.flap, 0);
  assert.ok(peakLift > DC3_STALL_MASS * 9.81, "wing never carried the stall weight");
  assert.ok(now[1] > 50, `left the air (${now[1]} m)`);
  assert.ok(machine.lastStep.forces.length >= 1);
});

test("force stand: approach drops flaps; a dead aileron cuts authority", () => {
  const machine = createAirplane({
    startPoint: [0, 60, 0],
    startVelocity: [0, 0, 34],
  });
  const approach = stepAirplane(machine, {
    forwardSpeed: 32,
    lateralSpeed: 8,
    yawRate: 0.18,
    liftFraction: 0.1,
    finalPhase: true,
  });
  assert.equal(approach.flap, 1);
  assert.ok(approach.requested.aileron > 0);
  assert.equal(approach.requested.throttle[0], approach.requested.throttle[1]);
  machine.attached.delete("aileron-left");
  machine.attached.delete("aileron-right");
  const damaged = stepAirplane(machine, {
    forwardSpeed: 32,
    lateralSpeed: 8,
    yawRate: 0.18,
    liftFraction: 0.1,
    finalPhase: true,
  });
  assert.equal(damaged.delivered.aileron, 0);
  assert.equal(damaged.authority.aileron, 0);
  assert.ok(Math.abs(damaged.requested.aileron) > 0.3);
});

function rotateAround(point, pivot, axis, degrees) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const relative = [
    point[0] - pivot[0],
    point[1] - pivot[1],
    point[2] - pivot[2],
  ];
  const axisLength = Math.hypot(...axis) || 1;
  const unit = axis.map((value) => value / axisLength);
  const along = relative[0] * unit[0] + relative[1] * unit[1] + relative[2] * unit[2];
  const crossed = [
    unit[1] * relative[2] - unit[2] * relative[1],
    unit[2] * relative[0] - unit[0] * relative[2],
    unit[0] * relative[1] - unit[1] * relative[0],
  ];
  return [
    pivot[0] + relative[0] * cosine + crossed[0] * sine + unit[0] * along * (1 - cosine),
    pivot[1] + relative[1] * cosine + crossed[1] * sine + unit[1] * along * (1 - cosine),
    pivot[2] + relative[2] * cosine + crossed[2] * sine + unit[2] * along * (1 - cosine),
  ];
}

function trailingEdge(partId) {
  const part = dc3BlockoutObject.parts.find((item) => item.id === partId);
  const hinge = dc3BlockoutObject.surfaceHinges[partId];
  assert.ok(part?.kind === "mesh" && hinge, partId);
  return part.vertices.reduce((aft, vertex) => (vertex[2] < aft[2] ? vertex : aft));
}

function surfaceTravel(partId, command) {
  const hinge = dc3BlockoutObject.surfaceHinges[partId];
  const rest = trailingEdge(partId);
  const posed = rotateAround(
    rest,
    hinge.pivot,
    hinge.axis,
    dc3SurfaceDeflectionDegrees(partId, command),
  );
  return [
    posed[0] - rest[0],
    posed[1] - rest[1],
    posed[2] - rest[2],
  ];
}

test("automaton deflections pitch aileron and elevator; rudder yaws", () => {
  const rest = {
    aileron: 0,
    elevator: 0,
    rudder: 0,
    flap: 0,
  };
  for (const id of Object.keys(dc3BlockoutObject.surfaceHinges)) {
    assert.equal(dc3SurfaceDeflectionDegrees(id, rest), 0, id);
  }
  const elevator = surfaceTravel("elevator-right", { ...rest, elevator: 1 });
  assert.ok(elevator[1] < -0.12, `elevator climb must drop the trailing edge (${elevator[1]})`);
  assert.ok(Math.abs(elevator[1]) > Math.abs(elevator[0]) * 3, "elevator is not a door");
  const aileron = surfaceTravel("aileron-right", { ...rest, aileron: 1 });
  assert.ok(aileron[1] > 0.08, `right aileron up for a right roll (${aileron[1]})`);
  assert.ok(Math.abs(aileron[1]) > Math.abs(aileron[0]) * 3, "aileron is not a door");
  const rudder = surfaceTravel("rudder", { ...rest, rudder: 1 });
  assert.ok(rudder[0] > 0.08, `rudder right for a right yaw (${rudder[0]})`);
  assert.ok(Math.abs(rudder[0]) > Math.abs(rudder[1]) * 3, "rudder is not an elevator");
  const flap = surfaceTravel("flap-right-inner", { ...rest, flap: 1 });
  assert.ok(flap[1] < -0.25, `flap down (${flap[1]})`);
});

const BERTH = [
  AIRPORT_RUNWAY.westDesignatorX,
  AIRPORT_RUNWAY_TOP_Y,
  AIRPORT_RUNWAY.centreZ,
];

// ---------------------------------------------------------------------------
// НА ЗАХОДЕ НЕ БЫВАЕТ НАБОРА
// ---------------------------------------------------------------------------

test("no approach plan ever orders a climb, from any altitude", () => {
  // Глиссаду перехватывают СНИЗУ: идут в горизонте, пока она сама не
  // опустится до машины. Требование подняться, чтобы «выполнить глиссаду», не
  // встречается ни на одном аэродроме — а прибытийный план его выдавал: он
  // начинался на своей высоте 42 м независимо от того, где машина. Самолёту,
  // идущему на восемнадцати метрах у самого входа, это приходило приказом
  // набрать двадцать четыре метра ПЕРЕД снижением.
  for (const altitude of [12, 18, 30, 42, 60, 90]) {
    const plan = dc3AirportArrivalPlan(BERTH, {
      from: [-900, altitude, 400],
    });
    const start = plan.altitude(0);
    assert.ok(
      start <= altitude + 0.5,
      `заход от ${altitude} м начинается на ${start.toFixed(1)} м — выше машины`,
    );
    let previous = start;
    for (let step = 1; step <= 800; step += 1) {
      const here = plan.altitude(step / 800);
      assert.ok(
        here <= previous + 0.05,
        `заход от ${altitude} м требует набора на ${((step / 800) * 100).toFixed(1)}%: ` +
          `${previous.toFixed(2)} → ${here.toFixed(2)} м`,
      );
      previous = here;
    }
  }
});

test("the approach turn stays well inside the passport bank", () => {
  // Разворот на посадочный курс — самый длинный на трассе (169°). Требовать
  // на нём паспортный предел значит требовать его почти полминуты подряд.
  const route = dc3AirportRoute("survey", BERTH);
  const length = route.length;
  let tightest = Infinity;
  for (let d = length * 0.7; d <= length * 0.92; d += 15) {
    const before = route.point((d - 15) / length);
    const here = route.point(d / length);
    const after = route.point((d + 15) / length);
    const first = [here[0] - before[0], here[2] - before[2]];
    const second = [after[0] - here[0], after[2] - here[2]];
    const arc = Math.hypot(...first) + Math.hypot(...second);
    const turn = Math.atan2(
      first[1] * second[0] - first[0] * second[1],
      first[0] * second[0] + first[1] * second[1],
    );
    if (Math.abs(turn) > 1e-6) tightest = Math.min(tightest, arc / Math.abs(turn));
  }
  const speed = route.requirement("speedLimit", 0.8);
  const bank = Math.atan((speed * speed) / (9.81 * tightest));
  assert.ok(
    bank < DC3_AIRPLANE_PASSPORT.maximumBank * 0.6,
    `заходный разворот требует ${((bank * 180) / Math.PI).toFixed(1)}° крена ` +
      `при радиусе ${tightest.toFixed(0)} м — это рабочая точка у предела`,
  );
});
