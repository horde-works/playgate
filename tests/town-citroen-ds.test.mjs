import assert from "node:assert/strict";
import test from "node:test";
import {
  DS_BRAKE_DECELERATION,
  DS_CENTRE_HEIGHT,
  DS_CENTRE_HEIGHT_SHARE_LIMIT,
  DS_CENTRE_OF_MASS,
  DS_CLUSTER_ID,
  DS_CORNERING_PER_SHARE,
  DS_DAMPING_RATIO,
  DS_DRIVE_ACCELERATION,
  DS_ROLLING_RESISTANCE,
  DS_SUSPENSION_TRAVEL,
  DS_TYRE_GRIP,
  DS_FRONT_AXLE_X,
  DS_FRONT_WEIGHT_SHARE,
  DS_HEADLAMP_STATIONS,
  DS_HEIGHT,
  DS_HUB_HEIGHT,
  DS_LENGTH,
  DS_MASS,
  DS_MAXIMUM_STEER,
  DS_NOSE,
  DS_NOSE_X,
  DS_ROAD_CENTRE_Z,
  DS_ROAD_HALF_WIDTH,
  DS_PARK_X,
  DS_PARK_Z,
  DS_REAR_AXLE_X,
  DS_ROAD_TOP_Y,
  DS_STATIC_COMPRESSION,
  DS_TAIL_X,
  DS_TRACK_FRONT,
  DS_TRACK_REAR,
  DS_TYRE_HALF_WIDTH,
  DS_WHEELBASE,
  DS_WHEEL_RADIUS,
  DS_WHEEL_STATIONS,
  DS_WIDTH,
  dsCornerDamping,
  dsCornerStiffness,
  dsHalfWidth,
  dsHeadlampDirection,
  dsSillHeight,
  dsStationOf,
  dsStationX,
  dsSurfacePoint,
  dsTopHeight,
} from "../games/make-a-mess/src/game/townCitroenDs.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import {
  massProperties,
  rotateVector,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  advanceCarSteering,
  carForces,
} from "../games/make-a-mess/src/game/carDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  TOWN_DS_DRIVER_SEAT,
  passengerSeatIsIntact,
} from "../games/make-a-mess/src/game/passengerSeats.ts";

// ---------------------------------------------------------------------------
// ПАСПОРТ ДО КУСКОВ
//
// Этот файл проверяет ИНВАРИАНТЫ ОБРАЗА И ФИЗИКИ, а не сборку. Он существует
// именно затем, чтобы ошибка профиля обнаружилась до того, как из него будут
// нарезаны полсотни панелей: ступенька в обводе, перевёрнутая колея или
// центр масс не там ловятся здесь одной строкой, а в документе — только
// глазами и уже поздно.
// ---------------------------------------------------------------------------

const SAMPLES = 400;
const stations = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);

// ---------------------------------------------------------------------------
// 1. Образ: это именно та машина
// ---------------------------------------------------------------------------

test("габариты сняты с настоящей машины", () => {
  assert.ok(Math.abs(DS_LENGTH - 4.874) < 1e-9);
  assert.ok(Math.abs(DS_WIDTH - 1.79) < 1e-9);
  assert.ok(Math.abs(DS_HEIGHT - 1.464) < 1e-9);
  assert.ok(Math.abs(DS_WHEELBASE - 3.125) < 1e-9);
  // База занимает почти две трети длины: свесы у машины короткие спереди и
  // длинные сзади, и это видно в профиль.
  assert.ok(DS_WHEELBASE / DS_LENGTH > 0.63);
  const rearOverhang = DS_TAIL_X - DS_REAR_AXLE_X;
  const frontOverhang = DS_FRONT_AXLE_X - DS_NOSE_X;
  assert.ok(
    rearOverhang > frontOverhang,
    `задний свес ${rearOverhang.toFixed(2)} не длиннее переднего ${frontOverhang.toFixed(2)}`,
  );
});

test("передняя колея ШИРЕ задней — главный признак образа", () => {
  assert.ok(
    DS_TRACK_FRONT - DS_TRACK_REAR > 0.15,
    `колеи почти одинаковы: ${DS_TRACK_FRONT} против ${DS_TRACK_REAR}`,
  );
  for (const station of DS_WHEEL_STATIONS) {
    const track = Math.abs(station.hub[2]) * 2;
    const wanted = station.axle === "front" ? DS_TRACK_FRONT : DS_TRACK_REAR;
    assert.ok(
      Math.abs(track - wanted) < 1e-9,
      `${station.id}: колея ${track} вместо ${wanted}`,
    );
  }
});

test("в плане машина — капля: плечи впереди, корма уже носа", () => {
  const widths = stations.map((u) => dsHalfWidth(u));
  const widest = Math.max(...widths);
  assert.ok(
    Math.abs(widest * 2 - DS_WIDTH) < 0.02,
    `максимальная ширина ${(widest * 2).toFixed(3)} против паспортной ${DS_WIDTH}`,
  );
  const widestAt = stations[widths.indexOf(widest)];
  assert.ok(
    widestAt < 0.5,
    `плечи оказались позади середины: u=${widestAt.toFixed(2)}`,
  );
  // Сходится корма сильнее, чем нос: иначе получится симметричная лодка.
  const tailTaper = widest - dsHalfWidth(1);
  const noseTaper = widest - dsHalfWidth(0);
  assert.ok(
    tailTaper > noseTaper,
    `корма сужается не сильнее носа: ${tailTaper.toFixed(3)} против ${noseTaper.toFixed(3)}`,
  );
});

test("в профиль гребень крыши стоит ПОЗАДИ середины", () => {
  const tops = stations.map((u) => dsTopHeight(u));
  const peak = Math.max(...tops);
  assert.ok(
    Math.abs(peak - DS_HEIGHT) < 0.01,
    `пик ${peak.toFixed(3)} против паспортной высоты ${DS_HEIGHT}`,
  );
  const peakAt = stations[tops.indexOf(peak)];
  assert.ok(
    peakAt > 0.5,
    `гребень оказался впереди середины: u=${peakAt.toFixed(2)}`,
  );
  // Нос ниже кормы: машина «едет носом вниз».
  assert.ok(
    dsTopHeight(0) < dsTopHeight(1),
    "нос не ниже кормы — образ потерян",
  );
});

test("обвод гладкий: ни одной ступеньки в профиле", () => {
  // Ступенька — это скачок ВТОРОЙ разности. Порог замерен по самому обводу:
  // на гладких участках она на порядок меньше, и излом видно сразу.
  for (const [name, profile] of [
    ["полуширина", dsHalfWidth],
    ["верх", dsTopHeight],
    ["порог", dsSillHeight],
  ]) {
    let worst = 0;
    for (let index = 1; index < SAMPLES; index += 1) {
      const before = profile(stations[index - 1]);
      const here = profile(stations[index]);
      const after = profile(stations[index + 1]);
      worst = Math.max(worst, Math.abs(after - 2 * here + before));
    }
    assert.ok(
      worst < 0.002,
      `${name}: излом обвода, вторая разность ${worst.toFixed(5)}`,
    );
  }
});

test("порог всюду ниже верхней линии, а под ним есть просвет", () => {
  for (const u of stations) {
    const sill = dsSillHeight(u);
    const top = dsTopHeight(u);
    assert.ok(top - sill > 0.2, `на u=${u.toFixed(2)} борт схлопнулся`);
    assert.ok(sill > 0.15, `на u=${u.toFixed(2)} юбка легла на землю`);
  }
  // Машина не цепляет землю свесами: под носом и кормой просвет больше, чем
  // под серединой.
  assert.ok(dsSillHeight(0) > dsSillHeight(0.5));
  assert.ok(dsSillHeight(1) > dsSillHeight(0.5));
});

test("точка поверхности лежит между порогом и верхом", () => {
  for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    for (const side of [-1, 1]) {
      const low = dsSurfacePoint(u, side, 0);
      const high = dsSurfacePoint(u, side, 1);
      assert.ok(Math.abs(low[0] - dsStationX(u)) < 1e-9);
      assert.ok(Math.abs(low[2] - side * dsHalfWidth(u)) < 1e-9);
      assert.ok(Math.abs(low[1] - dsSillHeight(u)) < 1e-9);
      assert.ok(Math.abs(high[1] - dsTopHeight(u)) < 1e-9);
    }
  }
  assert.ok(Math.abs(dsStationOf(dsStationX(0.37)) - 0.37) < 1e-9);
});

// ---------------------------------------------------------------------------
// 2. Физика: числа выведены, а не назначены
// ---------------------------------------------------------------------------

test("развесовка 65/35 и центр масс из неё же", () => {
  const total = DS_WHEEL_STATIONS.reduce((sum, s) => sum + s.weightShare, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `доли веса дают ${total}`);
  const front = DS_WHEEL_STATIONS.filter((s) => s.axle === "front").reduce(
    (sum, s) => sum + s.weightShare,
    0,
  );
  assert.ok(Math.abs(front - DS_FRONT_WEIGHT_SHARE) < 1e-9);
  // Центр масс обязан стоять там, куда его ставит развесовка, а не рядом.
  const fromFront = DS_CENTRE_OF_MASS[0] - DS_FRONT_AXLE_X;
  const share = 1 - fromFront / DS_WHEELBASE;
  assert.ok(
    Math.abs(share - DS_FRONT_WEIGHT_SHARE) < 1e-6,
    `по положению центра масс на перед приходится ${(share * 100).toFixed(1)}%`,
  );
});

test("тормозные доли следуют за переносом веса", () => {
  const total = DS_WHEEL_STATIONS.reduce((sum, s) => sum + s.brakeShare, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `тормозные доли дают ${total}`);
  const front = DS_WHEEL_STATIONS.filter((s) => s.axle === "front").reduce(
    (sum, s) => sum + s.brakeShare,
    0,
  );
  // Перед тормозит СИЛЬНЕЕ, чем несёт в покое: на торможении вес переезжает
  // вперёд, и обратное распределение блокировало бы задние колёса первыми.
  assert.ok(
    front > DS_FRONT_WEIGHT_SHARE,
    `перед берёт ${(front * 100).toFixed(0)}% тормоза при ${(DS_FRONT_WEIGHT_SHARE * 100).toFixed(0)}% веса`,
  );
});

test("гидропневматика садится РОВНО в середину хода", () => {
  assert.ok(Math.abs(DS_STATIC_COMPRESSION - DS_SUSPENSION_TRAVEL / 2) < 1e-9);
  for (const station of DS_WHEEL_STATIONS) {
    const stiffness = dsCornerStiffness(station.weightShare);
    const settle = (DS_MASS * 9.81 * station.weightShare) / stiffness;
    assert.ok(
      Math.abs(settle - DS_STATIC_COMPRESSION) < 1e-9,
      `${station.id} садится на ${settle.toFixed(3)} вместо ${DS_STATIC_COMPRESSION}`,
    );
    // Ход отбоя и ход сжатия остаются машине поровну — этого и добивается
    // самовыравнивание.
    assert.ok(DS_SUSPENSION_TRAVEL - settle > 0.1);
  }
});

test("демпфирование даёт паспортное относительное затухание", () => {
  for (const station of DS_WHEEL_STATIONS) {
    const stiffness = dsCornerStiffness(station.weightShare);
    const damping = dsCornerDamping(station.weightShare);
    const cornerMass = DS_MASS * station.weightShare;
    const zeta = damping / (2 * Math.sqrt(stiffness * cornerMass));
    assert.ok(
      Math.abs(zeta - DS_DAMPING_RATIO) < 1e-9,
      `${station.id}: затухание ${zeta.toFixed(3)}`,
    );
  }
  // Мягкая, но не разболтанная: собственная частота около 1.25 Гц.
  const stiffness = dsCornerStiffness(DS_FRONT_WEIGHT_SHARE / 2);
  const cornerMass = DS_MASS * (DS_FRONT_WEIGHT_SHARE / 2);
  const hertz = Math.sqrt(stiffness / cornerMass) / (2 * Math.PI);
  assert.ok(
    hertz > 1.05 && hertz < 1.45,
    `собственная частота ${hertz.toFixed(2)} Гц`,
  );
});

test("кузов накрывает колёса обеих осей", () => {
  // Требование образа и требование геометрии здесь одно и то же: у этой
  // машины шины не выступают за борт нигде. Проверяется по колее, ширине
  // шины и профилю — а не по кадру.
  // Полширины шины — из паспорта, чтобы проверка и профиль не разошлись.
  for (const station of DS_WHEEL_STATIONS) {
    const u = dsStationOf(station.hub[0]);
    const outer = Math.abs(station.hub[2]) + DS_TYRE_HALF_WIDTH;
    assert.ok(
      dsHalfWidth(u) >= outer,
      `${station.id}: борт ${dsHalfWidth(u).toFixed(3)} уже колеса ${outer.toFixed(3)}`,
    );
  }
});

test("ступица стоит так, что снаряжённая машина уже на паспортном клиренсе", () => {
  assert.ok(
    Math.abs(DS_HUB_HEIGHT - (DS_WHEEL_RADIUS + DS_STATIC_COMPRESSION)) < 1e-9,
  );
  // Колесо не торчит сквозь юбку: порог над осью колеса на уровне арок.
  const frontU = dsStationOf(DS_FRONT_AXLE_X);
  assert.ok(dsSillHeight(frontU) < DS_HUB_HEIGHT);
});

test("предельный угол руля даёт настоящий разворот", () => {
  const radius = DS_WHEELBASE / Math.tan(DS_MAXIMUM_STEER);
  assert.ok(
    Math.abs(radius * 2 - 11.5) < 0.2,
    `диаметр разворота ${(radius * 2).toFixed(2)} м`,
  );
  assert.ok(DS_MAXIMUM_STEER > 0.4 && DS_MAXIMUM_STEER < 0.6);
});

test("силы выводятся из массы, а не заданы числом", () => {
  // Проверка масштабонезависимости: удвой массу — удвоятся и силы, а
  // ускорения останутся паспортными.
  const drive = DS_MASS * DS_DRIVE_ACCELERATION;
  const brake = DS_MASS * DS_BRAKE_DECELERATION;
  assert.ok(brake > drive * 2, "тормоз обязан быть сильнее тяги");
  // Замедление не может превышать сцепление: тормозить сильнее, чем держит
  // шина, машина не умеет, и требовать этого от паспорта нельзя.
  assert.ok(
    DS_BRAKE_DECELERATION <= 0.8 * 9.81 + 1e-9,
    `паспортное замедление ${DS_BRAKE_DECELERATION} выше предела сцепления`,
  );
  assert.ok(DS_CORNERING_PER_SHARE > 0);
});

// ---------------------------------------------------------------------------
// 3. Фары
// ---------------------------------------------------------------------------

test("внутренняя пара фар уходит в поворот, внешняя стоит", () => {
  assert.equal(DS_HEADLAMP_STATIONS.length, 4);
  assert.equal(
    DS_HEADLAMP_STATIONS.filter((lamp) => lamp.directional).length,
    2,
  );
  // Прямо: все четыре смотрят вперёд, то есть по носу.
  for (const lamp of DS_HEADLAMP_STATIONS) {
    const [x, z] = dsHeadlampDirection(lamp, 0);
    assert.ok(Math.abs(x - -1) < 1e-9 && Math.abs(z) < 1e-9);
  }
  // Руль вправо: луч уходит к ПРАВОМУ борту, то есть туда же, куда повёрнуты
  // колёса. При носе в −x правый борт — это −z.
  const inner = DS_HEADLAMP_STATIONS.find((lamp) => lamp.directional);
  const outer = DS_HEADLAMP_STATIONS.find((lamp) => !lamp.directional);
  const turned = dsHeadlampDirection(inner, 0.4);
  assert.ok(turned[1] < -0.1, `внутренняя фара ушла в z=${turned[1].toFixed(3)}`);
  assert.ok(Math.abs(dsHeadlampDirection(outer, 0.4)[1]) < 1e-9);
  // Луч не обгоняет колёса.
  const angle = Math.abs(Math.atan2(-turned[1], -turned[0]));
  assert.ok(angle < 0.4, `фара довернулась на ${angle.toFixed(3)} при руле 0.4`);
});

// ---------------------------------------------------------------------------
// 4. Место в городе
// ---------------------------------------------------------------------------

test("машина встаёт на асфальт главной улицы и влезает в полосу", () => {
  const road = townScene.breakablePieces.filter(
    (piece) => piece.id.startsWith("town:road:main"),
  );
  assert.ok(road.length > 0, "главной улицы в городе нет");
  const top = Math.max(
    ...road.map((piece) => piece.position[1] + piece.size[1] / 2),
  );
  assert.ok(
    Math.abs(top - DS_ROAD_TOP_Y) < 1e-6,
    `верх асфальта ${top.toFixed(3)}, а паспорт ждёт ${DS_ROAD_TOP_Y}`,
  );
  // Полотно: полоса z, которую покрывают плиты на выбранной координате.
  const here = road.filter(
    (piece) => Math.abs(piece.position[0] - DS_PARK_X) <= piece.size[0] / 2,
  );
  assert.ok(here.length > 0, `на x=${DS_PARK_X} асфальта нет`);
  const zLow = Math.min(...here.map((p) => p.position[2] - p.size[2] / 2));
  const zHigh = Math.max(...here.map((p) => p.position[2] + p.size[2] / 2));
  assert.ok(
    DS_PARK_Z - DS_WIDTH / 2 > zLow && DS_PARK_Z + DS_WIDTH / 2 < zHigh,
    `машина шириной ${DS_WIDTH} не влезает в полосу ${zLow}…${zHigh}`,
  );
});

test("на выбранном месте пусто и есть разгон в обе стороны", () => {
  const box = {
    x0: DS_PARK_X + DS_NOSE_X,
    x1: DS_PARK_X + DS_TAIL_X,
    z0: DS_PARK_Z - DS_WIDTH / 2,
    z1: DS_PARK_Z + DS_WIDTH / 2,
    y1: DS_ROAD_TOP_Y + DS_HEIGHT,
  };
  const intruders = townScene.breakablePieces.filter((piece) => {
    if (piece.clusterId === DS_CLUSTER_ID) return false;
    const half = piece.size.map((v) => v / 2);
    if (piece.position[1] - half[1] > box.y1) return false;
    // Дорожное полотно машине не помеха: она на нём и стоит.
    if (piece.position[1] + half[1] <= DS_ROAD_TOP_Y + 1e-6) return false;
    return (
      piece.position[0] + half[0] > box.x0 &&
      piece.position[0] - half[0] < box.x1 &&
      piece.position[2] + half[2] > box.z0 &&
      piece.position[2] - half[2] < box.z1
    );
  });
  assert.deepEqual(
    intruders.map((piece) => piece.id),
    [],
    "место под машину занято",
  );
  // Улица длинная в обе стороны: машине есть где разогнаться и затормозить.
  const road = townScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("town:road:main"),
  );
  const xs = road.map((piece) => piece.position[0]);
  assert.ok(DS_PARK_X - Math.min(...xs) > 30, "слишком близко к западному концу");
  assert.ok(Math.max(...xs) - DS_PARK_X > 30, "слишком близко к восточному концу");
});

test("машина стоит в своём ряду, а не верхом на осевой", () => {
  const marks = townScene.breakablePieces.filter((piece) =>
    piece.id.startsWith("town:mark:main"),
  );
  assert.ok(marks.length > 0, "осевой разметки нет");
  const axis = marks[0].position[2];
  assert.ok(
    Math.abs(axis - DS_ROAD_CENTRE_Z) < 1e-9,
    `осевая идёт по z=${axis}, а паспорт считает осью ${DS_ROAD_CENTRE_Z}`,
  );
  // Борт не достаёт до осевой, и колесо не свисает с полотна.
  assert.ok(
    DS_PARK_Z + DS_WIDTH / 2 < axis,
    "кузов заходит на осевую",
  );
  assert.ok(
    DS_PARK_Z - DS_WIDTH / 2 > DS_ROAD_CENTRE_Z - DS_ROAD_HALF_WIDTH,
    "кузов свисает с полотна",
  );
  // Нос смотрит на запад, поэтому свой ряд — южный, то есть z меньше оси.
  assert.ok(DS_NOSE[0] < 0 && DS_PARK_Z < axis);
});

// ---------------------------------------------------------------------------
// 5. Собранная машина
//
// Всё выше проверяет ЗАМЫСЕЛ. Ниже проверяется, что собранные куски ему
// отвечают: масса, развесовка, симметрия, габарит, органы. Расхождение здесь
// означает ошибку сборки, а не паспорта.
// ---------------------------------------------------------------------------

const density = (material) => structuralMaterialProfiles[material].density;
const carPieces = townScene.breakablePieces.filter(
  (piece) => piece.clusterId === DS_CLUSTER_ID,
);
const carMass = massProperties(carPieces, density);
const local = [
  carMass.centre[0] - DS_PARK_X,
  carMass.centre[1] - DS_ROAD_TOP_Y,
  carMass.centre[2] - DS_PARK_Z,
];

test("машина собрана и стоит одним кластером", () => {
  assert.ok(carPieces.length > 40, `в машине только ${carPieces.length} кусков`);
  const clusters = new Set(carPieces.map((piece) => piece.clusterId));
  assert.equal(clusters.size, 1);
});

test("кластер DS — тот же контракт составного тела, что у гексакоптера", async () => {
  const { townDsClusterDefinition } = await import(
    "../games/make-a-mess/src/game/townCitroenDs.ts"
  );
  const { vehicleFrames } = await import(
    "../games/make-a-mess/src/game/vehicleFrames.ts"
  );
  const cluster = townDsClusterDefinition();
  assert.equal(cluster.clusterId, DS_CLUSTER_ID);
  assert.equal(cluster.id, "town-ds");
  assert.ok(cluster.origin);
  // Колёса — лучи подвески, не Rapier-катки: иначе трение солвера держит
  // машину намертво.
  assert.ok(
    cluster.contactMemberExcludes?.some((match) => match.includes("wheel")),
  );
  // Гексакоптер остаётся в airborne-списке; машина рядом с ним по контракту
  // тела, но не внутри VehicleFrameSystem.
  assert.ok(
    vehicleFrames.some((frame) => frame.clusterId.includes("hexacopter")),
  );
});

test("оболочка — visualMesh из профиля, а не стопка коробок", () => {
  const shell = carPieces.filter((piece) =>
    /:(skin:|bonnet|boot:lid|roof|nose:cap|tail:cap|spat:|glass:)/.test(piece.id),
  );
  assert.ok(shell.length >= 12, `оболочечных кусков ${shell.length}`);
  for (const piece of shell) {
    assert.ok(
      piece.visualMesh && piece.visualMesh.vertices.length >= 9,
      `${piece.id}: нет visualMesh`,
    );
    assert.ok(
      piece.voxelization?.mode === "shell",
      `${piece.id}: нет shell-вокселизации`,
    );
  }
  // Старый монстр нарезал борт десятками steelSheet без mesh.
  const facetedLower = carPieces.filter((piece) =>
    /:skin:(left|right):lower:\d+:/.test(piece.id),
  );
  assert.equal(facetedLower.length, 0, "бортовые коробки-панели не убраны");
});

test("собранная масса совпадает с паспортной", () => {
  assert.ok(
    Math.abs(carMass.mass - DS_MASS) < DS_MASS * 0.03,
    `собрано ${carMass.mass.toFixed(3)} против паспортных ${DS_MASS}`,
  );
  // И она осталась в масштабе города, а не улетела в масштаб летающих машин.
  const brick = townScene.breakablePieces
    .filter((piece) => piece.material === "brick")
    .map((piece) => massProperties([piece], density).mass)
    .sort((a, b) => a - b);
  const median = brick[Math.floor(brick.length / 2)];
  const ratio = carMass.mass / median;
  assert.ok(
    ratio > 3 && ratio < 30,
    `машина против медианного кирпичного куска ${ratio.toFixed(1)}:1 — это не удар, а другой масштаб`,
  );
});

test("развесовка собранной машины — та самая 65/35", () => {
  const fromFront = local[0] - DS_FRONT_AXLE_X;
  const share = 1 - fromFront / DS_WHEELBASE;
  assert.ok(
    Math.abs(share - DS_FRONT_WEIGHT_SHARE) < 0.02,
    `собранная машина несёт на переду ${(share * 100).toFixed(1)}%`,
  );
});

test("центр масс низкий и лежит на оси симметрии", () => {
  assert.ok(
    local[1] / DS_HEIGHT < DS_CENTRE_HEIGHT_SHARE_LIMIT,
    `центр масс на ${((local[1] / DS_HEIGHT) * 100).toFixed(1)}% высоты`,
  );
  assert.ok(
    Math.abs(local[1] - DS_CENTRE_HEIGHT) < 0.03,
    `высота центра масс ${local[1].toFixed(3)} против паспортной ${DS_CENTRE_HEIGHT}`,
  );
  // Симметрия — не косметика: несимметричная машина едет боком сама по себе.
  assert.ok(
    Math.abs(local[2]) < 0.01,
    `центр масс сдвинут на борт на ${local[2].toFixed(4)} м`,
  );
});

test("ни один кусок не авторен за паспортным габаритом", () => {
  // Описанная сфера куска — негодная мера: у панели длиной в полметра она
  // вдвое больше её толщины во все стороны сразу. Проверяется другое и более
  // полезное: ЦЕНТР каждого куска лежит внутри габарита машины. Панель,
  // поставленная не на ту станцию или не на тот борт, ловится сразу.
  const margin = 0.16;
  for (const piece of carPieces) {
    const x = piece.position[0] - DS_PARK_X;
    const y = piece.position[1] - DS_ROAD_TOP_Y;
    const z = piece.position[2] - DS_PARK_Z;
    assert.ok(
      x > DS_NOSE_X - margin && x < DS_TAIL_X + margin,
      `${piece.id}: продольно вне габарита, x=${x.toFixed(2)}`,
    );
    assert.ok(
      Math.abs(z) < DS_WIDTH / 2 + margin,
      `${piece.id}: за бортом, z=${z.toFixed(2)}`,
    );
    assert.ok(
      y > -margin && y < DS_HEIGHT + margin,
      `${piece.id}: по высоте вне габарита, y=${y.toFixed(2)}`,
    );
    // И ни один кусок не утоплен в асфальт.
    assert.ok(y > 0 - 0.02, `${piece.id} утоплен в дорогу: y=${y.toFixed(3)}`);
  }
});

test("каждое колесо — актуатор со своим required core", () => {
  for (const station of DS_WHEEL_STATIONS) {
    const channel = `wheel:${station.id}`;
    const members = carPieces.filter(
      (piece) => piece.actuator?.commandChannel === channel,
    );
    assert.ok(members.length >= 2, `${channel}: членов ${members.length}`);
    const core = members.filter((piece) => piece.actuator?.required);
    assert.equal(
      core.length,
      1,
      `${channel}: required core должен быть ровно один, а их ${core.length}`,
    );
    // Ядро — ступица: потеряли её, и никакая уцелевшая резина канал не спасёт.
    assert.ok(core[0].id.endsWith(":hub:piece"), `ядро канала — ${core[0].id}`);
  }
});

test("крыша НЕ стальная, а колёса не из стали целиком", () => {
  const roof = carPieces.find((piece) => piece.id.endsWith(":roof:piece"));
  assert.ok(roof, "крыши нет");
  assert.equal(roof.material, "plastic");
  for (const station of DS_WHEEL_STATIONS) {
    const tyre = carPieces.find((piece) =>
      piece.id.endsWith(`:wheel:${station.id}:tyre:piece`),
    );
    assert.ok(tyre, `нет шины ${station.id}`);
    assert.notEqual(tyre.material, "steel");
  }
});

test("четыре фары светят и привязаны к машине", () => {
  const lamps = townScene.spotLightDefinitions.filter(
    (light) => light.carrierClusterId === DS_CLUSTER_ID,
  );
  assert.equal(lamps.length, 4, `прожекторов ${lamps.length}`);
  for (const lamp of lamps) {
    // Свет уходит вперёд по носу, а не назад в салон.
    assert.ok(lamp.direction[0] < -0.9, `фара светит в ${lamp.direction[0]}`);
    assert.equal(lamp.dayIntensityFactor, 0);
  }
  const directional = lamps.filter((lamp) => lamp.id.includes("inner"));
  assert.equal(directional.length, 2);
});

test("силовой набор спрятан за кузовом", () => {
  // У летающей машины силовой набор показывают: он и есть её механика. У
  // дорожной он под кузовом, и «видно раму» — это дефект, а не честность.
  // Проверяется буквально: низ каждого силового куска лежит ВЫШЕ линии
  // порога в его же станции, значит сбоку его не видно ни в одном ракурсе.
  const structural = carPieces.filter((piece) =>
    /:(platform|frame:rail|subframe|gearbox|final-drive|engine|hydraulics|fuel-tank|cabin:floor):/.test(
      piece.id,
    ),
  );
  assert.ok(structural.length >= 8, `силовых кусков всего ${structural.length}`);
  for (const piece of structural) {
    const x = piece.position[0] - DS_PARK_X;
    const bottom = piece.position[1] - DS_ROAD_TOP_Y - piece.size[1] / 2;
    const sill = dsSillHeight(Math.max(0, Math.min(1, dsStationOf(x))));
    assert.ok(
      bottom >= sill - 1e-9,
      `${piece.id}: низ ${bottom.toFixed(3)} ниже порога ${sill.toFixed(3)}`,
    );
  }
  // И они тоньше силового набора летающей машины: у луча гексакоптера 0.22.
  const rails = carPieces.filter((piece) => piece.id.includes(":frame:rail:"));
  assert.equal(rails.length, 2);
  for (const rail of rails) {
    assert.ok(
      rail.size[1] < 0.12 && rail.size[2] < 0.12,
      `лонжерон ${rail.size[1]} × ${rail.size[2]} — толще, чем нужно дорожной машине`,
    );
  }
});

test("луч фар — тот же прибор, что у посадочных фар гексакоптера", () => {
  const hexacopter = townScene.spotLightDefinitions.filter((light) =>
    light.id.includes("headlight"),
  );
  const ours = townScene.spotLightDefinitions.filter(
    (light) => light.carrierClusterId === DS_CLUSTER_ID,
  );
  assert.ok(hexacopter.length > 0, "фар гексакоптера в сцене нет");
  const reference = hexacopter[0];
  for (const lamp of ours) {
    assert.equal(lamp.color, reference.color);
    assert.equal(lamp.distance, reference.distance);
    assert.equal(lamp.intensity, reference.intensity);
    assert.equal(lamp.penumbra, reference.penumbra);
    assert.equal(lamp.decay, reference.decay);
    assert.deepEqual(lamp.transition, reference.transition);
    // Видимый луч и ореол прибора — это и есть «как у гексакоптера».
    assert.deepEqual(lamp.visibleBeam, reference.visibleBeam);
    assert.deepEqual(lamp.fixtureGlow, reference.fixtureGlow);
  }
});

// ---------------------------------------------------------------------------
// 6. Как в неё садятся
//
// Симптом, с которого это началось: возле корпуса не появлялось никакого
// сообщения. Причина была не в подсказке — у машины вообще не было поста.
// Здесь проверяется главное отличие автомобиля от летающих машин проекта: в
// коптер сначала ЗАЛЕЗАЮТ, и предложение живёт внутри кабины, а к машине
// подходят СНАРУЖИ, и предложение обязано быть у двери.
// ---------------------------------------------------------------------------

test("место водителя принадлежит машине и цело", () => {
  assert.equal(TOWN_DS_DRIVER_SEAT.carrierClusterId, DS_CLUSTER_ID);
  const ids = new Set(carPieces.map((piece) => piece.id));
  for (const required of TOWN_DS_DRIVER_SEAT.requiredPieceIds) {
    assert.ok(ids.has(required), `кресло требует кусок, которого нет: ${required}`);
  }
  assert.equal(passengerSeatIsIntact(TOWN_DS_DRIVER_SEAT, new Set()), true);
  // Потеряли руль — сесть за него больше нельзя.
  assert.equal(
    passengerSeatIsIntact(
      TOWN_DS_DRIVER_SEAT,
      new Set(["town-boulevard:ds:steering:wheel:piece"]),
    ),
    false,
  );
});

test("предложение сесть стоит СНАРУЖИ, у водительской двери", () => {
  const post = [
    TOWN_DS_DRIVER_SEAT.interactionPoint[0] - DS_PARK_X,
    TOWN_DS_DRIVER_SEAT.interactionPoint[1] - DS_ROAD_TOP_Y,
    TOWN_DS_DRIVER_SEAT.interactionPoint[2] - DS_PARK_Z,
  ];
  const u = dsStationOf(post[0]);
  // Снаружи борта — иначе человек, стоящий у машины, ничего не увидит, и
  // именно это и наблюдалось.
  assert.ok(
    Math.abs(post[2]) > dsHalfWidth(u),
    `пост внутри кузова: |z|=${Math.abs(post[2]).toFixed(2)} против борта ${dsHalfWidth(u).toFixed(2)}`,
  );
  // Но и не в соседнем ряду: до него надо дойти, а не наткнуться.
  assert.ok(Math.abs(post[2]) < dsHalfWidth(u) + 1.0);
  // Руль у машины СЛЕВА: правый борт смотрит в −z, значит водитель в +z.
  assert.ok(post[2] > 0, "пост оказался на пассажирской стороне");
  // На высоте глаз стоящего человека, а не на уровне порога.
  assert.ok(post[1] > 1.2 && post[1] < 1.8, `пост на высоте ${post[1]}`);
  // Радиус подхода накрывает борт машины целиком: подойти можно откуда угодно.
  assert.ok(TOWN_DS_DRIVER_SEAT.approachRadius >= 1.5);
  assert.ok(
    TOWN_DS_DRIVER_SEAT.releaseRadius > TOWN_DS_DRIVER_SEAT.approachRadius,
  );
});

test("водитель садится в кабину, а выходит на дорогу", () => {
  const head = [
    TOWN_DS_DRIVER_SEAT.occupantPoint[0] - DS_PARK_X,
    TOWN_DS_DRIVER_SEAT.occupantPoint[1] - DS_ROAD_TOP_Y,
    TOWN_DS_DRIVER_SEAT.occupantPoint[2] - DS_PARK_Z,
  ];
  const headU = dsStationOf(head[0]);
  // Голова ВНУТРИ кузова и ниже крыши: иначе камера окажется снаружи стекла.
  assert.ok(
    Math.abs(head[2]) < dsHalfWidth(headU),
    `голова водителя снаружи борта: ${head[2].toFixed(2)}`,
  );
  assert.ok(
    head[1] > dsSillHeight(headU) && head[1] < dsTopHeight(headU),
    `голова водителя на высоте ${head[1].toFixed(2)}, борт ${dsSillHeight(headU).toFixed(2)}…${dsTopHeight(headU).toFixed(2)}`,
  );
  assert.ok(head[2] > 0, "водитель сел справа");

  const out = [
    TOWN_DS_DRIVER_SEAT.exitPoint[0] - DS_PARK_X,
    TOWN_DS_DRIVER_SEAT.exitPoint[1] - DS_ROAD_TOP_Y,
    TOWN_DS_DRIVER_SEAT.exitPoint[2] - DS_PARK_Z,
  ];
  // Выходят наружу, на свою же сторону, и на полотно дороги, а не в стену.
  assert.ok(Math.abs(out[2]) > dsHalfWidth(dsStationOf(out[0])));
  assert.ok(out[2] > 0);
  assert.ok(
    DS_PARK_Z + out[2] < DS_ROAD_CENTRE_Z + DS_ROAD_HALF_WIDTH,
    "выход из машины ведёт за полотно дороги",
  );
});

// ---------------------------------------------------------------------------
// 7. Едет ли ИМЕННО ЭТА машина
//
// Силовая модель проверена отдельно, на заготовке стенда. Здесь через те же
// силы и тот же `stepBody` гоняется НАСТОЯЩИЙ паспорт: масса и тензор взяты у
// собранной машины, колёса — у её станций, тяга и тормоз выведены из её
// ускорений. Расхождение здесь означает, что паспорт красив, но не едет.
// ---------------------------------------------------------------------------

const DS_MACHINE_WHEELS = DS_WHEEL_STATIONS.map((station) => ({
  id: station.id,
  axle: station.axle,
  hub: station.hub,
  radius: DS_WHEEL_RADIUS,
  travel: DS_SUSPENSION_TRAVEL,
  stiffness: dsCornerStiffness(station.weightShare),
  damping: dsCornerDamping(station.weightShare),
  steerShare: station.steerShare,
  brakeShare: station.brakeShare,
  grip: DS_TYRE_GRIP,
  cornering: DS_CORNERING_PER_SHARE * station.weightShare,
}));

const dsMachine = (availability = [1, 1, 1, 1]) => ({
  wheels: DS_MACHINE_WHEELS,
  nose: DS_NOSE,
  centreOfMass: local,
  mass: carMass.mass,
  layout: "front",
  driveForce: carMass.mass * DS_DRIVE_ACCELERATION,
  brakeForce: carMass.mass * DS_BRAKE_DECELERATION,
  rollingResistance: DS_ROLLING_RESISTANCE,
  availability,
});

const DS_PROPERTIES = {
  mass: carMass.mass,
  centre: local,
  inertia: carMass.inertia,
  inverseInertia: carMass.inverseInertia,
  pieces: carPieces.length,
};

function driveDs(controls, seconds, options = {}) {
  const step = 1 / 120;
  let state = {
    position: options.position ?? [0, local[1], 0],
    orientation: [0, 0, 0, 1],
    velocity: options.velocity ?? [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
  const machine = options.machine ?? dsMachine();
  let steer = 0;
  let lastResult = null;
  for (let index = 0; index < Math.round(seconds / step); index += 1) {
    steer = advanceCarSteering(steer, controls.steer ?? 0, 1.2, step);
    const carState = {
      orientation: state.orientation,
      centre: state.position,
      velocity: state.velocity,
      angularVelocity: state.angularVelocity,
    };
    const up = rotateVector(state.orientation, [0, 1, 0]);
    const probes = machine.wheels.map((wheel) => {
      if (up[1] <= 1e-6) return null;
      const arm = [
        wheel.hub[0] - machine.centreOfMass[0],
        wheel.hub[1] - machine.centreOfMass[1],
        wheel.hub[2] - machine.centreOfMass[2],
      ];
      const world = rotateVector(state.orientation, arm);
      const distance = (state.position[1] + world[1]) / up[1];
      return distance >= 0 ? { distance, normal: [0, 1, 0] } : null;
    });
    const result = carForces(machine, carState, { ...controls, steer }, probes);
    lastResult = result;
    // ВЕС ПРИКЛАДЫВАЕТ ВЫЗЫВАЮЩИЙ. Ровно как в рантайме: у составного тела
    // gravityScale = 0, и машина без этой строки просто улетает вверх на
    // собственных пружинах.
    const forces = [
      { force: [0, -machine.mass * 9.81, 0], point: state.position },
      ...result.forces,
    ];
    state = stepBody(state, DS_PROPERTIES, forces, { linear: machine.mass * 0.011, angular: 0 }, step);
  }
  const forward = rotateVector(state.orientation, DS_NOSE);
  return {
    state,
    result: lastResult,
    speedAlong: state.velocity[0] * forward[0] + state.velocity[2] * forward[2],
    rideHeight: state.position[1],
  };
}

test("машина садится на паспортный клиренс и стоит", () => {
  const run = driveDs({ throttle: 0, brake: 0, steer: 0, handbrake: false }, 4);
  assert.equal(run.result.contacts, 4, "не все колёса нашли дорогу");
  // Клиренс приходит из подвески, а не из авторской координаты: центр масс
  // обязан остаться там, где его поставил паспорт.
  assert.ok(
    Math.abs(run.rideHeight - local[1]) < 0.03,
    `машина осела на ${run.rideHeight.toFixed(3)} против паспортных ${local[1].toFixed(3)}`,
  );
  const load = run.result.wheels.reduce((sum, wheel) => sum + wheel.load, 0);
  assert.ok(
    Math.abs(load - carMass.mass * 9.81) < carMass.mass * 9.81 * 0.03,
    `реакция ${load.toFixed(2)} против веса ${(carMass.mass * 9.81).toFixed(2)}`,
  );
});

test("машина разгоняется и тормозит по паспортным ускорениям", () => {
  const run = driveDs({ throttle: 1, brake: 0, steer: 0, handbrake: false }, 6);
  // Передний привод на 2.8 м/с²: за шесть секунд — уверенно за пятьдесят км/ч.
  assert.ok(
    run.speedAlong > 13,
    `за шесть секунд только ${run.speedAlong.toFixed(1)} м/с`,
  );
  const braking = driveDs(
    { throttle: 0, brake: 1, steer: 0, handbrake: false },
    3,
    { velocity: [-18, 0, 0] },
  );
  assert.ok(
    braking.speedAlong < 1,
    `с восемнадцати метров в секунду не встала за три секунды: ${braking.speedAlong.toFixed(2)}`,
  );
});

test("машина поворачивает и держится на колёсах", () => {
  const run = driveDs(
    { throttle: 0.4, brake: 0, steer: 0.14, handbrake: false },
    5,
    { velocity: [-11, 0, 0] },
  );
  // Нос в −x, правый борт в −z: руль вправо уводит машину туда же.
  assert.ok(run.state.position[2] < -1, `ушла в z=${run.state.position[2].toFixed(2)}`);
  const up = rotateVector(run.state.orientation, [0, 1, 0]);
  assert.ok(
    up[1] > 0.97,
    `кузов завалился в повороте: up.y=${up[1].toFixed(3)}`,
  );
  assert.equal(run.result.contacts, 4, "машина встала на два колеса");
});
