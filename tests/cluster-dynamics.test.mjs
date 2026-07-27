import assert from "node:assert/strict";
import test from "node:test";
import {
  RESTING_BODY,
  angularMomentum,
  cross,
  kineticEnergy,
  linearMomentum,
  massProperties,
  pieceMass,
  rotateVector,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  grandTerminalScene,
  skyBerthMetrics,
} from "../games/make-a-mess/src/game/grandTerminalScene.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { vehicleFrameForCluster } from "../games/make-a-mess/src/game/vehicleFrames.ts";

const SKY_TRAIN = "terminal:sky-train";
const densityOf = (material) => structuralMaterialProfiles[material].density;
const ship = grandTerminalScene.breakablePieces.filter(
  (piece) => piece.clusterId === SKY_TRAIN,
);

test("a single box has the mass and inertia the textbook says", () => {
  // Проверяем на кубе, для которого ответ известен точно: I = m·a²/6.
  const cube = [{
    id: "cube",
    clusterId: "test",
    material: "steel",
    shape: "steelSheet",
    position: [3, 4, 5],
    size: [2, 2, 2],
    color: "#fff",
  }];
  const density = densityOf("steel");
  const properties = massProperties(cube, densityOf);

  assert.equal(Math.abs(properties.mass - 8 * density) < 1e-9, true);
  for (const axis of [0, 1, 2]) {
    assert.equal(Math.abs(properties.centre[axis] - cube[0].position[axis]) < 1e-9, true);
  }
  const expected = (properties.mass * 4) / 6;
  for (const diagonal of [0, 4, 8]) {
    assert.equal(Math.abs(properties.inertia[diagonal] - expected) < 1e-9, true,
      `${properties.inertia[diagonal]} против ${expected}`);
  }
  // Вне диагонали у центрированного куба нули.
  for (const off of [1, 2, 3, 5, 6, 7]) {
    assert.equal(Math.abs(properties.inertia[off]) < 1e-9, true);
  }
});

test("two boxes put the centre of mass where the lever says", () => {
  const light = {
    id: "a", clusterId: "t", material: "wood", shape: "plank",
    position: [0, 0, 0], size: [1, 1, 1], color: "#fff",
  };
  const heavy = {
    id: "b", clusterId: "t", material: "wood", shape: "plank",
    position: [10, 0, 0], size: [1, 1, 1], color: "#fff", volume: 3,
  };
  const properties = massProperties([light, heavy], densityOf);
  // Массы 1 и 3 → центр на трёх четвертях пути.
  assert.equal(Math.abs(properties.centre[0] - 7.5) < 1e-9, true, String(properties.centre[0]));
  // Перенос осей: I = Σ m·r² вокруг вертикали.
  const expected = 1 * densityOf("wood") * 7.5 ** 2 + 3 * densityOf("wood") * 2.5 ** 2;
  assert.equal(properties.inertia[4] > expected, true, "инерция коробок ещё и своя");
});

test("the sky train hangs its mass below the hull axis", () => {
  const properties = massProperties(ship, densityOf);
  const M = skyBerthMetrics;

  assert.equal(properties.mass > 0, true);
  assert.equal(properties.pieces, ship.length);
  // Центр масс — под осью оболочки: вагоны висят снизу, и это то, что даёт
  // кораблю маятник и отвисающую гондолу.
  assert.equal(properties.centre[1] < M.hullY, true,
    `центр масс на ${properties.centre[1].toFixed(2)}, ось на ${M.hullY}`);
  // И примерно на оси пути по горизонтали.
  assert.equal(Math.abs(properties.centre[2] - M.trackZ) < 1.5, true);

  // Тензор симметричен и положительно определён.
  for (const [a, b] of [[1, 3], [2, 6], [5, 7]]) {
    assert.equal(Math.abs(properties.inertia[a] - properties.inertia[b]) < 1e-6, true);
  }
  for (const diagonal of [0, 4, 8]) {
    assert.equal(properties.inertia[diagonal] > 0, true);
  }
  // Корабль длинный: вокруг продольной оси (X) вертеться легче всего.
  assert.equal(properties.inertia[0] < properties.inertia[4], true);
  assert.equal(properties.inertia[0] < properties.inertia[8], true);
});

test("losing the tail coach moves the centre of mass forward", () => {
  // Ровно ваш пример: срубили хвостовой вагон — центр масс уехал к носу, и
  // пара «подъём выше, вес ниже» задерёт нос сама.
  const whole = massProperties(ship, densityOf);
  const withoutTail = massProperties(
    ship.filter((piece) => !piece.id.startsWith(`${SKY_TRAIN}:tail:`)),
    densityOf,
  );

  assert.equal(withoutTail.mass < whole.mass, true);
  // Нос корабля смотрит на −x, хвостовой вагон стоит по +x.
  assert.equal(withoutTail.centre[0] < whole.centre[0] - 0.5, true,
    `было ${whole.centre[0].toFixed(2)}, стало ${withoutTail.centre[0].toFixed(2)}`);
});

test("tearing the envelope keeps the weight but takes away the lift", () => {
  // Подъём считаем по доле уцелевшей оболочки: рвётся полотно — падает
  // подъёмная сила, а вес почти не меняется.
  const skin = ship.filter((piece) => piece.id.startsWith(`${SKY_TRAIN}:skin:`));
  assert.equal(skin.length > 100, true, `полотнищ всего ${skin.length}`);

  const whole = massProperties(ship, densityOf);
  const halfSkin = new Set(skin.slice(0, Math.floor(skin.length / 2)).map((p) => p.id));
  const torn = massProperties(
    ship.filter((piece) => !halfSkin.has(piece.id)),
    densityOf,
  );

  const skinShare = 1 - torn.mass / whole.mass;
  assert.equal(skinShare < 0.25, true, `полотно весит ${(skinShare * 100).toFixed(0)}% корабля`);
});

test("momentum and kinetic energy are the numbers a collision will need", () => {
  const properties = massProperties(ship, densityOf);
  const velocity = [12, 0, 0];
  const spin = [0, 0.4, 0];

  const p = linearMomentum(properties, velocity);
  assert.equal(Math.abs(p[0] - properties.mass * 12) < 1e-9, true);

  const energy = kineticEnergy(properties, velocity, spin);
  const doubled = kineticEnergy(properties, [24, 0, 0], spin);
  // Поступательная часть растёт как квадрат скорости.
  const linear = 0.5 * properties.mass * 144;
  assert.equal(Math.abs(doubled - energy - 3 * linear) < 1e-6, true);

  const L = angularMomentum(properties, spin);
  assert.equal(L[1] > 0, true);
  assert.equal(kineticEnergy(properties, [0, 0, 0], [0, 0, 0]), 0);
});

test("a free body keeps its momentum and spins about its own axis", () => {
  const properties = massProperties(ship, densityOf);
  let state = {
    ...RESTING_BODY,
    position: properties.centre,
    velocity: [3, 0, 0],
    angularVelocity: [0, 0.2, 0],
  };
  const noDamping = { linear: 0, angular: 0 };
  for (let step = 0; step < 600; step += 1) {
    state = stepBody(state, properties, [], noDamping, 1 / 120);
  }
  // Без сил скорость не меняется, а пройденный путь равен v·t.
  assert.equal(Math.abs(state.velocity[0] - 3) < 1e-9, true);
  assert.equal(Math.abs(state.position[0] - properties.centre[0] - 15) < 0.05, true,
    String(state.position[0] - properties.centre[0]));
  // Вращение продолжается, ориентация нормирована.
  const norm = Math.hypot(...state.orientation);
  assert.equal(Math.abs(norm - 1) < 1e-6, true);
  assert.equal(state.angularVelocity[1] > 0.1, true);
});

test("damping calms the swing without braking a steady turn", () => {
  const properties = massProperties(ship, densityOf);
  const swinging = {
    ...RESTING_BODY,
    position: properties.centre,
    angularVelocity: [0, 0, 0.5],
  };
  let calmed = swinging;
  const calm = { linear: 0, angular: properties.inertia[8] * 0.8 };
  for (let step = 0; step < 600; step += 1) {
    calmed = stepBody(calmed, properties, [], calm, 1 / 120);
  }
  assert.equal(Math.abs(calmed.angularVelocity[2]) < 0.05, true,
    `качка осталась ${calmed.angularVelocity[2]}`);

  // А заданный разворот тем же демпфированием НЕ тормозится: гасим
  // отклонение от желаемого, а не движение вообще.
  let turning = { ...RESTING_BODY, position: properties.centre, angularVelocity: [0, 0.3, 0] };
  const holdTurn = {
    linear: 0,
    angular: properties.inertia[4] * 0.8,
    desiredAngularVelocity: [0, 0.3, 0],
  };
  for (let step = 0; step < 600; step += 1) {
    turning = stepBody(turning, properties, [], holdTurn, 1 / 120);
  }
  assert.equal(Math.abs(turning.angularVelocity[1] - 0.3) < 0.02, true,
    `разворот сбился до ${turning.angularVelocity[1]}`);
});

test("lift above the centre of mass rights the ship by itself", () => {
  // Ключевая проверка всей затеи: подъём приложен ВЫШЕ центра масс, поэтому
  // наклонённый корабль возвращается сам, без единой прописанной кривой.
  const properties = massProperties(ship, densityOf);
  const gravity = 9.81;
  const liftPoint = [properties.centre[0], properties.centre[1] + 3.4, properties.centre[2]];

  let state = {
    ...RESTING_BODY,
    position: properties.centre,
    // Наклон на 12° вокруг поперечной оси корабля (нос вверх).
    orientation: [0, 0, Math.sin(0.105), Math.cos(0.105)],
  };
  const damping = { linear: 0, angular: properties.inertia[8] * 0.35 };
  let maxTilt = 0;
  for (let step = 0; step < 3000; step += 1) {
    // Подъём — в точке, жёстко связанной с корпусом: она едет вместе с ним.
    const arm = rotateVector(state.orientation, [
      liftPoint[0] - properties.centre[0],
      liftPoint[1] - properties.centre[1],
      liftPoint[2] - properties.centre[2],
    ]);
    const forces = [
      { force: [0, -properties.mass * gravity, 0], point: state.position },
      {
        force: [0, properties.mass * gravity, 0],
        point: [
          state.position[0] + arm[0],
          state.position[1] + arm[1],
          state.position[2] + arm[2],
        ],
      },
    ];
    state = stepBody(state, properties, forces, damping, 1 / 120);
    const nose = rotateVector(state.orientation, [-1, 0, 0]);
    maxTilt = Math.max(maxTilt, Math.abs(nose[1]));
  }
  const nose = rotateVector(state.orientation, [-1, 0, 0]);
  assert.equal(Math.abs(nose[1]) < 0.02, true, `остался наклон ${nose[1]}`);
  assert.equal(maxTilt > 0.1, true, "наклон вообще должен был случиться");
});

test("cross products are the ones the moments rely on", () => {
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(cross([0, 1, 0], [0, 0, 1]), [1, 0, 0]);
  assert.equal(pieceMass(
    { material: "wood", size: [2, 3, 4], position: [0, 0, 0] },
    densityOf,
  ), 24 * densityOf("wood"));
});

test("the sky train manifest points the lift above its own centre of mass", () => {
  // Вся модель держится на том, что подъём приложен ВЫШЕ центра масс. Если
  // манифест это нарушит, корабль станет переворачиваться — поэтому проверяем.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const properties = massProperties(ship, densityOf);

  assert.equal(frame.liftCentre[1] > properties.centre[1] + 0.5, true,
    `подъём на ${frame.liftCentre[1]}, центр масс на ${properties.centre[1].toFixed(2)}`);
  // И по горизонтали они близки: иначе целый корабль висел бы с дифферентом.
  assert.equal(Math.abs(frame.liftCentre[0] - properties.centre[0]) < 2.5, true,
    `плечо по длине ${(frame.liftCentre[0] - properties.centre[0]).toFixed(2)} м`);
  assert.equal(Math.abs(frame.liftCentre[2] - properties.centre[2]) < 1.0, true);

  // Оболочка, по которой считается подъём, действительно существует.
  const envelope = ship.filter((piece) => piece.id.includes(frame.envelopeMatch));
  assert.equal(envelope.length > 100, true, `оболочка из ${envelope.length} кусков`);
});

test("shooting the tail drops the nose and floats the ship, with no authored curve", () => {
  // Здесь модель ответила НЕ так, как мы ожидали, и оказалась права.
  // Сносим хвостовой вагон: центр масс уезжает ВПЕРЁД, а подъём остаётся в
  // центре объёма оболочки — то есть теперь ПОЗАДИ центра масс. Пара
  // «подъём сзади-сверху, вес спереди-снизу» опускает нос и задирает корму,
  // а не наоборот: тяжёлым остался нос, он и тонет. Плюс корабль всплывает —
  // подъём прежний, а веса стало меньше.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const whole = massProperties(ship, densityOf);
  const damaged = massProperties(
    ship.filter((piece) => !piece.id.startsWith(`${SKY_TRAIN}:tail:`)),
    densityOf,
  );
  const gravity = 9.81;
  // Подъём остался прежним — оболочка цела; вес упал вместе с вагоном.
  const lift = whole.mass * gravity;

  let state = { ...RESTING_BODY, position: damaged.centre };
  const damping = { linear: 0, angular: damaged.inertia[8] * 0.6 };
  for (let step = 0; step < 900; step += 1) {
    const arm = rotateVector(state.orientation, [
      frame.liftCentre[0] - damaged.centre[0],
      frame.liftCentre[1] - damaged.centre[1],
      frame.liftCentre[2] - damaged.centre[2],
    ]);
    state = stepBody(
      state,
      damaged,
      [
        { force: [0, -damaged.mass * gravity, 0], point: state.position },
        {
          force: [0, lift, 0],
          point: [
            state.position[0] + arm[0],
            state.position[1] + arm[1],
            state.position[2] + arm[2],
          ],
        },
      ],
      damping,
      1 / 120,
    );
  }

  // Нос корабля смотрит на −x, корма — на +x.
  const nose = rotateVector(state.orientation, [-1, 0, 0]);
  const tail = rotateVector(state.orientation, [1, 0, 0]);
  assert.equal(nose[1] < -0.02, true, `нос ушёл на ${nose[1].toFixed(3)}`);
  assert.equal(tail[1] > 0.02, true, `корма ушла на ${tail[1].toFixed(3)}`);
  // Подъём остался прежним, а веса стало меньше — корабль всплывает.
  assert.equal(state.position[1] > damaged.centre[1], true);

  // И обратная проверка, чтобы правило было видно целиком: снеси НОСОВОЙ
  // вагон — задерётся нос.
  const noHead = massProperties(
    ship.filter((piece) => !piece.id.startsWith(`${SKY_TRAIN}:head:`)),
    densityOf,
  );
  let other = { ...RESTING_BODY, position: noHead.centre };
  for (let step = 0; step < 900; step += 1) {
    const arm = rotateVector(other.orientation, [
      frame.liftCentre[0] - noHead.centre[0],
      frame.liftCentre[1] - noHead.centre[1],
      frame.liftCentre[2] - noHead.centre[2],
    ]);
    other = stepBody(
      other,
      noHead,
      [
        { force: [0, -noHead.mass * gravity, 0], point: other.position },
        {
          force: [0, lift, 0],
          point: [
            other.position[0] + arm[0],
            other.position[1] + arm[1],
            other.position[2] + arm[2],
          ],
        },
      ],
      { linear: 0, angular: noHead.inertia[8] * 0.6 },
      1 / 120,
    );
  }
  assert.equal(rotateVector(other.orientation, [-1, 0, 0])[1] > 0.02, true,
    "без носового вагона нос обязан задраться");
});

test("trimmed lift keeps the intact ship level, and damage alone tilts it", () => {
  // «Развесить балласт»: подъём прикладывается там, где целый корабль
  // балансирует по горизонтали, и на оси оболочки по высоте. Тогда целым он
  // висит ровно — а весь дифферент, который увидит игрок, будет следствием
  // повреждений, а не нашей неаккуратности.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  const whole = massProperties(ship, densityOf);
  const trim = [whole.centre[0], frame.liftCentre[1], whole.centre[2]];
  const gravity = 9.81;

  let state = { ...RESTING_BODY, position: whole.centre };
  for (let step = 0; step < 1200; step += 1) {
    const arm = rotateVector(state.orientation, [
      trim[0] - whole.centre[0],
      trim[1] - whole.centre[1],
      trim[2] - whole.centre[2],
    ]);
    state = stepBody(
      state,
      whole,
      [
        { force: [0, -whole.mass * gravity, 0], point: state.position },
        {
          force: [0, whole.mass * gravity, 0],
          point: [
            state.position[0] + arm[0],
            state.position[1] + arm[1],
            state.position[2] + arm[2],
          ],
        },
      ],
      { linear: 0, angular: whole.inertia[8] * 0.5 },
      1 / 120,
    );
  }
  const nose = rotateVector(state.orientation, [-1, 0, 0]);
  assert.equal(Math.abs(nose[1]) < 0.005, true, `целый корабль висит с дифферентом ${nose[1]}`);
  assert.equal(Math.abs(state.position[1] - whole.centre[1]) < 0.01, true,
    "и никуда не всплывает и не тонет");
  assert.equal(trim[1] > whole.centre[1] + 0.5, true);
});

test("the ship is balanced by real ballast, not by a fudge factor", () => {
  // Тест на равновесность. Подъём приложен в центре объёма оболочки, а плечо
  // до центра масс всего пара метров — значит даже полметра продольного
  // перекоса дают заметный дифферент. Балансировать это надо НАСТОЯЩИМ
  // грузом в носу, а не подкруткой точки приложения силы, иначе модель
  // перестанет быть честной.
  const M = skyBerthMetrics;
  const hullCentre = (M.hullFrom + M.hullTo) / 2;
  const hullLength = M.hullTo - M.hullFrom;
  const properties = massProperties(ship, densityOf);

  const offset = properties.centre[0] - hullCentre;
  assert.equal(Math.abs(offset) < hullLength * 0.01, true,
    `центр масс в ${offset.toFixed(2)} м от центра оболочки`);

  // И тот же перекос в углах: равновесный дифферент целого корабля.
  const arm = M.hullY - properties.centre[1];
  const trimDegrees = (Math.atan2(offset, arm) * 180) / Math.PI;
  assert.equal(Math.abs(trimDegrees) < 2, true, `дифферент ${trimDegrees.toFixed(1)}°`);

  // Балласт — настоящий кусок, его можно увидеть и потерять.
  const ballast = ship.find((piece) => piece.id === `${SKY_TRAIN}:ballast`);
  assert.notEqual(ballast, undefined);
  assert.equal(ballast.position[0] < hullCentre - 8, true, "балласт должен быть в носу");

  // Без него корабль заметно задирает нос — значит груз работает, а не лежит.
  const withoutBallast = massProperties(
    ship.filter((piece) => !piece.id.startsWith(`${SKY_TRAIN}:ballast`)),
    densityOf,
  );
  const wrongTrim =
    (Math.atan2(withoutBallast.centre[0] - hullCentre, M.hullY - withoutBallast.centre[1]) * 180) /
    Math.PI;
  assert.equal(wrongTrim > 8, true, `без балласта дифферент всего ${wrongTrim.toFixed(1)}°`);
});

test("ground support levels a ship that has lost its lift", () => {
  // Чувствительность к настоящему миру: опоры под днищем принимают вес и,
  // будучи разнесены по длине, сами выравнивают севший корабль.
  const frame = vehicleFrameForCluster(SKY_TRAIN);
  assert.equal(frame.supports.length >= 4, true, "опор должно быть несколько");
  const properties = massProperties(ship, densityOf);
  const gravity = 9.81;

  // Садим наклонённый корабль на ровную «землю» под точками опоры.
  let state = {
    ...RESTING_BODY,
    position: properties.centre,
    orientation: [0, 0, Math.sin(0.09), Math.cos(0.09)],
  };
  const groundY = 0.94;
  const stiffness = (properties.mass * gravity) / 0.22 / frame.supports.length;
  for (let step = 0; step < 2400; step += 1) {
    const forces = [{ force: [0, -properties.mass * gravity, 0], point: state.position }];
    for (const support of frame.supports) {
      const arm = rotateVector(state.orientation, [
        support[0] - properties.centre[0],
        support[1] - properties.centre[1],
        support[2] - properties.centre[2],
      ]);
      const point = [
        state.position[0] + arm[0],
        state.position[1] + arm[1],
        state.position[2] + arm[2],
      ];
      const penetration = groundY - point[1];
      if (penetration > 0) {
        forces.push({
          force: [0, stiffness * penetration - 40 * Math.min(0, state.velocity[1]), 0],
          point,
        });
      }
    }
    state = stepBody(state, properties, forces, { linear: 3, angular: properties.inertia[8] * 1.2 }, 1 / 240);
  }

  const nose = rotateVector(state.orientation, [-1, 0, 0]);
  assert.equal(Math.abs(nose[1]) < 0.05, true, `севший корабль остался с креном ${nose[1].toFixed(3)}`);
  assert.equal(Math.abs(state.velocity[1]) < 0.2, true, "и должен успокоиться");
});
