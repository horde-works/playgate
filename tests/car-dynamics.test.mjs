import assert from "node:assert/strict";
import test from "node:test";
import {
  RESTING_BODY,
  rotateVector,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  advanceCarSteering,
  carForces,
  carHandlingBalance,
} from "../games/make-a-mess/src/game/carDynamics.ts";

// ---------------------------------------------------------------------------
// ЕДЕТ ЛИ ОНА НА САМОМ ДЕЛЕ
//
// Файл гоняет машину СИЛАМИ через тот же `stepBody`, которым живут все машины
// проекта. Формулы по отдельности здесь не проверяются: стенд, который считает
// силы по-своему, отвечает на вопрос «сходится ли моя модель», а нужен ответ
// на вопрос «едет ли машина».
//
// Стенд-заготовка: просторный седан рубежа шестидесятых-семидесятых —
// длинная база, мягкая подвеска, барабанные тормоза, шины похуже нынешних.
// Числа взяты по этому классу машин, а не назначены: настоящий паспорт со
// своей геометрией и массами кусков придёт отдельно, и тогда масса и тензор
// будут считаться из авторских кусков, а не из коробки.
// ---------------------------------------------------------------------------

const GRAVITY = 9.81;
const STEP = 1 / 120;

const MASS = 1600;
/** База и колея просторного седана тех лет. */
const WHEELBASE = 2.9;
const TRACK = 1.5;
/** Развесовка 52/48 по передней оси. */
const FRONT_AXLE_X = -0.48 * WHEELBASE;
const REAR_AXLE_X = 0.52 * WHEELBASE;
/** Нос смотрит в −x, как у всех машин проекта. */
const NOSE = [-1, 0, 0];
const CENTRE_OF_MASS = [0, 0.55, 0];
const HUB_HEIGHT = 0.5;

const WHEEL_BASE_SPEC = {
  radius: 0.36,
  travel: 0.2,
  stiffness: 45000,
  damping: 2600,
  grip: 0.9,
  cornering: 3500,
};

function wheel(id, axle, x, z, steerShare, brakeShare) {
  return {
    ...WHEEL_BASE_SPEC,
    id,
    axle,
    hub: [x, HUB_HEIGHT, z],
    steerShare,
    brakeShare,
  };
}

const WHEELS = [
  wheel("front-left", "front", FRONT_AXLE_X, -TRACK / 2, 1, 0.3),
  wheel("front-right", "front", FRONT_AXLE_X, TRACK / 2, 1, 0.3),
  wheel("rear-left", "rear", REAR_AXLE_X, -TRACK / 2, 0, 0.2),
  wheel("rear-right", "rear", REAR_AXLE_X, TRACK / 2, 0, 0.2),
];

function machine(layout, availability = [1, 1, 1, 1]) {
  return {
    wheels: WHEELS,
    nose: NOSE,
    centreOfMass: CENTRE_OF_MASS,
    mass: MASS,
    layout,
    driveForce: 4200,
    brakeForce: 11000,
    rollingResistance: 0.015,
    availability,
  };
}

// Кузов как коробка 4.9 × 1.45 × 1.85. Настоящий тензор придёт из авторских
// кусков вместе с паспортом; коробка нужна только чтобы стенд был честным по
// порядку величин, а не по числу.
const BODY = { length: 4.9, height: 1.45, width: 1.85 };
const INERTIA_XX = (MASS / 12) * (BODY.height ** 2 + BODY.width ** 2);
const INERTIA_YY = (MASS / 12) * (BODY.length ** 2 + BODY.width ** 2);
const INERTIA_ZZ = (MASS / 12) * (BODY.length ** 2 + BODY.height ** 2);
const PROPERTIES = {
  mass: MASS,
  centre: CENTRE_OF_MASS,
  inertia: [INERTIA_XX, 0, 0, 0, INERTIA_YY, 0, 0, 0, INERTIA_ZZ],
  inverseInertia: [
    1 / INERTIA_XX, 0, 0,
    0, 1 / INERTIA_YY, 0,
    0, 0, 1 / INERTIA_ZZ,
  ],
  pieces: 1,
};

/** Аэродинамика кузова тех лет: около 450 Н на тридцати метрах в секунду. */
const DAMPING = { linear: 15, angular: 0 };

const NEUTRAL = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/**
 * Плоский асфальт под всей машиной. Луч идёт из ступицы вниз ПО ОСИ КОРПУСА,
 * поэтому на крене расстояние до плоскости растёт — ровно так его и меряет
 * рантайм своим лучом.
 */
function flatGroundProbes(vehicle, state, groundY = 0) {
  const up = rotateVector(state.orientation, [0, 1, 0]);
  if (up[1] <= 1e-6) return vehicle.wheels.map(() => null);
  return vehicle.wheels.map((entry) => {
    const local = [
      entry.hub[0] - vehicle.centreOfMass[0],
      entry.hub[1] - vehicle.centreOfMass[1],
      entry.hub[2] - vehicle.centreOfMass[2],
    ];
    const world = rotateVector(state.orientation, local);
    const height = state.centre[1] + world[1] - groundY;
    const distance = height / up[1];
    return distance >= 0 ? { distance, normal: [0, 1, 0] } : null;
  });
}

/**
 * Прогон. Возвращает и конечное состояние, и то, что видела машина по дороге:
 * поведение доказывается замером, а не одним кадром.
 */
function drive(vehicle, controls, seconds, options = {}) {
  let state = options.from ?? {
    ...RESTING_BODY,
    position: options.position ?? [0, 0.55, 0],
    velocity: options.velocity ?? [0, 0, 0],
  };
  let steer = 0;
  const steps = Math.round(seconds / STEP);
  let lastForces = null;
  let balance = "grip";
  let maximumYawRate = 0;
  /** Какая ось выбрала сцепление ПЕРВОЙ и на каком угле руля. */
  let firstSlip = null;
  for (let index = 0; index < steps; index += 1) {
    const now = typeof controls === "function" ? controls(index * STEP) : controls;
    steer = advanceCarSteering(steer, now.steer, options.steeringRate ?? 1.6, STEP);
    const carState = {
      orientation: state.orientation,
      centre: state.position,
      velocity: state.velocity,
      angularVelocity: state.angularVelocity,
    };
    const probes = flatGroundProbes(vehicle, carState, options.groundY ?? 0);
    const result = carForces(vehicle, carState, { ...now, steer }, probes);
    lastForces = result;
    balance = carHandlingBalance(vehicle, result);
    if (!firstSlip) {
      for (let entry = 0; entry < result.wheels.length; entry += 1) {
        if (result.wheels[entry].slipping) {
          firstSlip = {
            axle: vehicle.wheels[entry].axle,
            steer,
            seconds: index * STEP,
          };
          break;
        }
      }
    }
    const forces = [
      { force: [0, -MASS * GRAVITY, 0], point: state.position },
      ...result.forces,
    ];
    state = stepBody(state, PROPERTIES, forces, DAMPING, STEP);
    maximumYawRate = Math.max(maximumYawRate, Math.abs(state.angularVelocity[1]));
  }
  const forward = rotateVector(state.orientation, NOSE);
  return {
    state,
    result: lastForces,
    balance,
    steer,
    firstSlip,
    maximumYawRate,
    speed: Math.hypot(state.velocity[0], state.velocity[2]),
    /** Ход вдоль носа: плюс — машина едет вперёд, а не назад. */
    speedAlong: state.velocity[0] * forward[0] + state.velocity[2] * forward[2],
    heading: Math.atan2(forward[2], forward[0]),
  };
}

// ---------------------------------------------------------------------------
// 1. Она стоит
// ---------------------------------------------------------------------------

test("машина стоит на четырёх колёсах, а не проваливается и не подпрыгивает", () => {
  const run = drive(machine("rear"), NEUTRAL, 3);
  assert.equal(run.result.contacts, 4, "не все колёса нашли опору");
  const load = run.result.wheels.reduce((sum, entry) => sum + entry.load, 0);
  // Успокоившаяся подвеска держит ровно вес: это и есть проверка, что пружина
  // с амортизатором сошлись, а не качают машину.
  assert.ok(
    Math.abs(load - MASS * GRAVITY) < MASS * GRAVITY * 0.02,
    `суммарная реакция ${load.toFixed(0)} Н против веса ${(MASS * GRAVITY).toFixed(0)} Н`,
  );
  assert.ok(
    Math.abs(run.state.velocity[1]) < 0.02,
    `машина всё ещё качается: ${run.state.velocity[1].toFixed(3)} м/с по вертикали`,
  );
});

test("развесовка приходит из геометрии, а не назначается", () => {
  const run = drive(machine("rear"), NEUTRAL, 3);
  const front = run.result.wheels
    .filter((entry) => entry.id.startsWith("front"))
    .reduce((sum, entry) => sum + entry.load, 0);
  const total = run.result.wheels.reduce((sum, entry) => sum + entry.load, 0);
  const share = front / total;
  assert.ok(
    Math.abs(share - 0.52) < 0.02,
    `на переднюю ось пришлось ${(share * 100).toFixed(1)}% вместо 52%`,
  );
});

// ---------------------------------------------------------------------------
// 2. Она едет и останавливается
// ---------------------------------------------------------------------------

test("машина трогается и разгоняется", () => {
  const run = drive(machine("rear"), { ...NEUTRAL, throttle: 1 }, 6);
  // 4200 Н на 1600 кг — это 2.6 м/с²; за шесть секунд с учётом качения и
  // аэродинамики машина обязана выйти за пятьдесят километров в час.
  assert.ok(
    run.speedAlong > 14,
    `за шесть секунд разогналась только до ${run.speedAlong.toFixed(1)} м/с`,
  );
  assert.ok(
    run.speedAlong < 20,
    `разгон нефизично быстрый: ${run.speedAlong.toFixed(1)} м/с`,
  );
});

test("на отпущенном газе машина катится и сама останавливается", () => {
  const rolling = drive(machine("rear"), NEUTRAL, 12, {
    velocity: [-12, 0, 0],
  });
  assert.ok(
    rolling.speedAlong < 12,
    "накат ничего не отнял: сопротивления качения нет",
  );
  assert.ok(
    rolling.speedAlong > 1,
    `машина встала за двенадцать секунд наката: ${rolling.speedAlong.toFixed(1)} м/с`,
  );
});

test("тормоз останавливает машину и переносит вес на передние колёса", () => {
  const braking = drive(machine("rear"), { ...NEUTRAL, brake: 1 }, 4, {
    velocity: [-20, 0, 0],
  });
  assert.ok(
    braking.speedAlong < 1,
    `с двадцати метров в секунду не остановилась за четыре секунды: ${braking.speedAlong.toFixed(2)} м/с`,
  );
  // Клевок: во время торможения передняя ось нагружена сильнее статических 52%.
  const midway = drive(machine("rear"), { ...NEUTRAL, brake: 1 }, 0.6, {
    velocity: [-20, 0, 0],
  });
  const front = midway.result.wheels
    .filter((entry) => entry.id.startsWith("front"))
    .reduce((sum, entry) => sum + entry.load, 0);
  const total = midway.result.wheels.reduce((sum, entry) => sum + entry.load, 0);
  assert.ok(
    front / total > 0.56,
    `на торможении передняя ось несёт ${((front / total) * 100).toFixed(1)}% — клевка нет`,
  );
});

// ---------------------------------------------------------------------------
// 3. Она поворачивает — и поворачивает колёсами
// ---------------------------------------------------------------------------

test("поворот руля вправо уводит машину вправо", () => {
  const run = drive(
    machine("rear"),
    { ...NEUTRAL, throttle: 0.35, steer: 0.15 },
    5,
    { velocity: [-10, 0, 0] },
  );
  // Нос смотрит в −x, поэтому правый борт — это −z, и машина обязана уехать
  // именно туда. Ошибка знака здесь означала бы, что руль работает наоборот.
  assert.ok(
    run.state.position[2] < -1,
    `при руле вправо машина ушла в z=${run.state.position[2].toFixed(2)}`,
  );
  assert.ok(
    run.maximumYawRate > 0.05,
    "корпус не разворачивался вовсе: боковая сила не создаёт момента",
  );
});

test("радиус поворота убывает с углом руля", () => {
  const radius = (steer) => {
    const run = drive(
      machine("rear"),
      { ...NEUTRAL, throttle: 0.35, steer },
      6,
      { velocity: [-10, 0, 0] },
    );
    const yaw = Math.abs(run.state.angularVelocity[1]);
    return yaw > 1e-3 ? run.speed / yaw : Infinity;
  };
  const gentle = radius(0.08);
  const firm = radius(0.2);
  assert.ok(
    firm < gentle,
    `радиус не убывает: ${gentle.toFixed(1)} м при малом угле против ${firm.toFixed(1)} м при большом`,
  );
  assert.ok(
    firm > 5 && firm < 60,
    `радиус нефизичен: ${firm.toFixed(1)} м`,
  );
});

// ---------------------------------------------------------------------------
// 4. Привод — одно слово в паспорте, но разная машина
// ---------------------------------------------------------------------------

/**
 * Руль ДОБАВЛЯЕТСЯ медленно, и замеряется не «сорвалась или нет», а КАКАЯ ОСЬ
 * сдалась первой. Разовый резкий угол ничего не различает: на шестнадцати
 * метрах в секунду четверть радиана — это уже полный снос всех четырёх колёс,
 * и оба привода выглядят одинаково сорванными. Разница между ними лежит на
 * ГРАНИЦЕ сцепления, а не за ней.
 */
function gripRamp(vehicle, throttle) {
  return drive(
    vehicle,
    (seconds) => ({ ...NEUTRAL, throttle, steer: seconds * 0.03 }),
    8,
    { velocity: [-16, 0, 0] },
  );
}

test("под тягой первой сдаётся ВЕДУЩАЯ ось: перед сносит, зад срывается", () => {
  // Один и тот же руль и один и тот же газ. Разница целиком в том, какая ось
  // тратит сцепление ещё и на тягу: круг трения делает остальное.
  const front = gripRamp(machine("front"), 0.8);
  const rear = gripRamp(machine("rear"), 0.8);
  assert.notEqual(front.firstSlip, null, "передний привод не сорвался вовсе");
  assert.notEqual(rear.firstSlip, null, "задний привод не сорвался вовсе");
  assert.equal(
    front.firstSlip.axle,
    "front",
    `у переднего привода первой сдалась ${front.firstSlip.axle} ось`,
  );
  assert.equal(
    rear.firstSlip.axle,
    "rear",
    `у заднего привода первой сдалась ${rear.firstSlip.axle} ось`,
  );
});

test("без тяги привод не значит ничего", () => {
  // Проверка на случайную связанность: пока сцепление не тратится на разгон,
  // три машины обязаны быть ОДНОЙ машиной. Если тут появится разница, значит
  // привод протёк куда-то помимо круга трения.
  const angles = ["front", "rear", "all"].map(
    (layout) => gripRamp(machine(layout), 0).firstSlip,
  );
  for (const entry of angles) {
    assert.notEqual(entry, null, "без тяги ни одна не сорвалась");
    assert.equal(entry.axle, angles[0].axle);
    assert.ok(Math.abs(entry.steer - angles[0].steer) < 1e-9);
  }
  // Сдаётся ЗАДНЯЯ ось: развесовка 52/48 оставила ей меньше нагрузки, а
  // поперечной силы в повороте с неё спрашивают почти столько же.
  assert.equal(angles[0].axle, "rear");
});

test("чем больше просят тяги, тем заметнее выигрыш полного привода", () => {
  // Замер, а не вера: у машины этого класса преимущество полного привода на
  // четверти газа лежит в пределах погрешности и становится заметным только
  // ближе к полному. Это и есть правильная форма утверждения — не «полный
  // всегда лучше», а «разница растёт вместе с тем, сколько сцепления уходит
  // на разгон».
  const margin = (throttle) => {
    const front = gripRamp(machine("front"), throttle).firstSlip.steer;
    const all = gripRamp(machine("all"), throttle).firstSlip.steer;
    return all / front - 1;
  };
  const gentle = margin(0.5);
  const hard = margin(1);
  assert.ok(
    hard > gentle,
    `выигрыш не растёт с газом: ${(gentle * 100).toFixed(1)}% на половине против ${(hard * 100).toFixed(1)}% на полном`,
  );
  assert.ok(
    hard > 0.15,
    `на полном газу полный привод выигрывает всего ${(hard * 100).toFixed(1)}%`,
  );
});

// ---------------------------------------------------------------------------
// 5. Повреждение — это не «минус четверть тяги»
// ---------------------------------------------------------------------------

test("потеря ведущего колеса и отнимает тягу, и тянет машину в сторону", () => {
  const whole = drive(machine("front"), { ...NEUTRAL, throttle: 1 }, 5);
  const damaged = drive(
    machine("front", [0, 1, 1, 1]),
    { ...NEUTRAL, throttle: 1 },
    5,
  );
  assert.ok(
    damaged.speedAlong < whole.speedAlong * 0.85,
    `без переднего левого разгон почти не изменился: ${damaged.speedAlong.toFixed(1)} против ${whole.speedAlong.toFixed(1)} м/с`,
  );
  // Момент от несимметричной тяги: целая машина едет прямо, битая — нет.
  assert.ok(
    Math.abs(whole.state.position[2]) < 0.2,
    `целая машина уехала вбок на ${whole.state.position[2].toFixed(2)} м`,
  );
  assert.ok(
    Math.abs(damaged.state.position[2]) > 0.5,
    `битая машина едет прямо: ${damaged.state.position[2].toFixed(2)} м вбок`,
  );
  assert.equal(
    damaged.result.wheels[0].contact,
    false,
    "выбитое колесо всё ещё держит машину",
  );
});

test("выбитое колесо роняет СВОЙ угол, а вес переходит на оставшиеся", () => {
  // Колесо теряют на ходу, а не при рождении, поэтому замер идёт от машины,
  // которая уже устоялась на четырёх.
  const settled = drive(machine("rear"), NEUTRAL, 3).state;
  const damaged = drive(machine("rear", [0, 1, 1, 1]), NEUTRAL, 0.3, {
    from: settled,
  });
  assert.equal(damaged.result.wheels[0].contact, false);
  assert.equal(damaged.result.wheels[0].load, 0);
  assert.equal(damaged.result.contacts, 3);
  const load = damaged.result.wheels.reduce((sum, entry) => sum + entry.load, 0);
  assert.ok(
    Math.abs(load - MASS * GRAVITY) < MASS * GRAVITY * 0.15,
    `три колеса несут ${load.toFixed(0)} Н против веса ${(MASS * GRAVITY).toFixed(0)} Н`,
  );

  // Заваливается машина именно на ПУСТОЙ угол: колесо было переднее левое.
  // Дальше корпус ложится на землю сам — его контакт живёт вне этого модуля,
  // и чистая модель обязана продолжать ронять угол, а не удерживать его.
  const tipped = drive(machine("rear", [0, 1, 1, 1]), NEUTRAL, 1.2, {
    from: settled,
  });
  const cornerHeight = (state, index) => {
    const hub = WHEELS[index].hub;
    const local = [
      hub[0] - CENTRE_OF_MASS[0],
      hub[1] - CENTRE_OF_MASS[1],
      hub[2] - CENTRE_OF_MASS[2],
    ];
    return state.position[1] + rotateVector(state.orientation, local)[1];
  };
  assert.ok(
    cornerHeight(tipped.state, 0) < cornerHeight(tipped.state, 1) - 0.05,
    "корпус завалился не на тот угол, где нет колеса",
  );
  const up = rotateVector(tipped.state.orientation, [0, 1, 0]);
  assert.ok(up[1] < 0.99, "корпус остался ровным, потеряв опору под углом");
});

// ---------------------------------------------------------------------------
// 6. Рычаги
// ---------------------------------------------------------------------------

test("руль не перекладывается мгновенно", () => {
  const rate = 1.6;
  let angle = 0;
  angle = advanceCarSteering(angle, 0.5, rate, 1 / 60);
  assert.ok(
    angle < 0.5,
    "руль выставил полный угол за один шаг: скорость перекладки не работает",
  );
  for (let index = 0; index < 120; index += 1) {
    angle = advanceCarSteering(angle, 0.5, rate, 1 / 60);
  }
  assert.ok(Math.abs(angle - 0.5) < 1e-9, "руль так и не дошёл до заказанного угла");
});

test("ручник срывает заднюю ось, а обычный тормоз — нет", () => {
  const turning = { ...NEUTRAL, steer: 0.16 };
  const service = drive(machine("rear"), { ...turning, brake: 0.5 }, 2, {
    velocity: [-16, 0, 0],
  });
  const handbrake = drive(
    machine("rear"),
    { ...turning, handbrake: true },
    2,
    { velocity: [-16, 0, 0] },
  );
  const rearUse = (run) =>
    Math.max(
      ...run.result.wheels
        .filter((entry) => entry.id.startsWith("rear"))
        .map((entry) => entry.gripUsed),
    );
  assert.ok(
    rearUse(handbrake) > rearUse(service),
    `ручник грузит зад не сильнее рабочего тормоза: ${rearUse(handbrake).toFixed(2)} против ${rearUse(service).toFixed(2)}`,
  );
});
