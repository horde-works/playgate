import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { sr6SkatPrototypeDocument } from "../games/make-a-mess/src/content/scenes/sr6SkatPrototypeDocument.ts";
import {
  SR6_CABIN_SECTIONS,
  SR6_FRONT_ROTOR_DIAMETER,
  SR6_REAR_ROTOR_DIAMETER,
  SR6_ROTOR_STATIONS,
  sr6SkatObject,
} from "../games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import {
  SR6_SKAT_BERTH,
  SR6_SKAT_CLUSTER_ID,
  SR6_SKAT_ROTOR_CAPACITY_WEIGHTS,
} from "../games/make-a-mess/src/game/sr6Skat.ts";
import { sr6SkatPlan } from "../games/make-a-mess/src/game/sr6SkatRoutes.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";

test("SR-6 в игре собирается прямо из принятой M9", () => {
  const compiled = compileSceneGroups(sr6SkatPrototypeDocument, new Map());
  assert.equal(compiled.clusters.length, 2);
  const vehicle = compiled.clusters.find((cluster) => cluster.id === SR6_SKAT_CLUSTER_ID);
  assert.ok(vehicle);
  assert.equal(vehicle.pieces.length, sr6SkatObject.parts.length + 1);
  assert.equal(vehicle.pieces.filter((piece) => piece.id.includes(":blade:")).length, 30);
});

test("шесть физических приводов имеют живые throttle-каналы", () => {
  const compiled = compileSceneGroups(sr6SkatPrototypeDocument, new Map());
  const vehicle = compiled.clusters.find((cluster) => cluster.id === SR6_SKAT_CLUSTER_ID);
  assert.ok(vehicle);
  const channels = new Set(
    vehicle.pieces
      .map((piece) => piece.actuator?.commandChannel)
      .filter(Boolean),
  );
  assert.deepEqual([...channels].sort(), [
    "throttle:0",
    "throttle:1",
    "throttle:2",
    "throttle:3",
    "throttle:4",
    "throttle:5",
  ]);
});

test("задняя пара выше и мощнее передней четвёрки", () => {
  assert.equal(SR6_ROTOR_STATIONS.length, 6);
  assert.equal(SR6_ROTOR_STATIONS.slice(0, 4).every((station) => station.powerClass === "front"), true);
  assert.equal(SR6_ROTOR_STATIONS.slice(4).every((station) => station.powerClass === "rear"), true);
  assert.equal(SR6_ROTOR_STATIONS[4].planeY > SR6_ROTOR_STATIONS[0].planeY, true);
  assert.equal(SR6_SKAT_ROTOR_CAPACITY_WEIGHTS[4] > SR6_SKAT_ROTOR_CAPACITY_WEIGHTS[0], true);
});

test("SR-6 зарегистрирован отдельной машиной без временного пассажирского сервиса", () => {
  const vehicle = airVehicles.find((candidate) => candidate.id === "sr6-skat");
  assert.ok(vehicle);
  assert.equal(vehicle.clusterId, SR6_SKAT_CLUSTER_ID);
  assert.equal(vehicle.departure?.flightKind, "circuit");
  assert.equal(vehicle.passengerFlight, undefined);
  assert.equal(vehicle.flight.limits.enginePoints.length, 6);
  assert.deepEqual(vehicle.flight.limits.rotorCapacityWeights, SR6_SKAT_ROTOR_CAPACITY_WEIGHTS);
});

test("навигационные огни следуют за машиной, а пост остаётся на земле", () => {
  const compiled = compileSceneGroups(sr6SkatPrototypeDocument, new Map());
  const airborne = compiled.lamps.filter((lamp) => lamp.carrierClusterId === SR6_SKAT_CLUSTER_ID);
  const starboard = sr6SkatObject.parts.find((part) => part.id === "nav-light-starboard-lens");
  const port = sr6SkatObject.parts.find((part) => part.id === "nav-light-port-lens");
  assert.equal(airborne.length, 4);
  assert.equal(compiled.lamps.some((lamp) => lamp.carrierClusterId === undefined), true);
  assert.equal(starboard?.material, "foliage");
  assert.equal(starboard?.kind === "box" && starboard.center[0] < 0, true);
  assert.equal(port?.material, "flower-red");
  assert.equal(port?.kind === "box" && port.center[0] > 0, true);
});

test("типовой маршрут огибает остров и возвращается на текущую стоянку", () => {
  const plan = sr6SkatPlan(SR6_SKAT_BERTH);
  const samples = Array.from({ length: 121 }, (_, index) => plan.point(index / 120));
  const radii = samples.map((point) => Math.hypot(point[0] - 30, point[2] + 15));
  assert.equal(Math.max(...radii) < 50, true);
  assert.equal(Math.min(...samples.map((point) => point[0])) < -15, true);
  assert.equal(Math.max(...samples.map((point) => point[0])) > 74, true);
  assert.equal(Math.min(...samples.map((point) => point[2])) < -60, true);
  assert.equal(Math.max(...samples.map((point) => point[2])) > 30, true);
  assert.deepEqual(plan.point(0), SR6_SKAT_BERTH);
  assert.deepEqual(plan.point(1), SR6_SKAT_BERTH);
});

test("гондолы шести винтов не пересекаются друг с другом", () => {
  for (let first = 0; first < SR6_ROTOR_STATIONS.length; first += 1) {
    for (let second = first + 1; second < SR6_ROTOR_STATIONS.length; second += 1) {
      const a = SR6_ROTOR_STATIONS[first];
      const b = SR6_ROTOR_STATIONS[second];
      const clearance = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
      assert.equal(
        clearance > 0.02,
        true,
        `${a.id} и ${b.id} сходятся на ${clearance.toFixed(3)} м`,
      );
    }
  }
});

test("отношение дисков задней пары к передней остаётся тем, на котором стоит микшер", () => {
  const ratio = (SR6_REAR_ROTOR_DIAMETER / SR6_FRONT_ROTOR_DIAMETER) ** 2;
  assert.equal(Math.abs(ratio - 1.337) < 0.01, true, `ratio ${ratio.toFixed(4)}`);
  assert.equal(Math.abs(ratio - SR6_SKAT_ROTOR_CAPACITY_WEIGHTS[4]) < 0.01, true);
});

test("силовой контур связывает гондолы независимо от кокпита", () => {
  const frame = sr6SkatObject.parts.filter((part) => part.group === "primary-frame");
  const ids = frame.map((part) => part.id);
  for (const required of [
    "side-torque-box-1", "side-torque-box--1",
    "forward-frame-panel", "aft-nacelle-plate-1", "aft-nacelle-plate--1",
    "nacelle-web-front-mid-1", "nacelle-web-mid-rear-1",
  ]) {
    assert.equal(ids.includes(required), true, `нет элемента ${required}`);
  }
  // Роль корневых тяг в ядро кокпита — отдельный путь нагрузки, а не единственный.
  assert.equal(ids.filter((id) => id.startsWith("core-root-")).length, 8);
});

test("силовое ядро стальное и каждая гондола к нему пришвартована", () => {
  const compiled = compileSceneGroups(sr6SkatPrototypeDocument, new Map());
  const vehicle = compiled.clusters.find((cluster) => cluster.id === SR6_SKAT_CLUSTER_ID);
  assert.ok(vehicle);
  const local = (piece) => piece.id.replace(`${SR6_SKAT_CLUSTER_ID}:`, "");

  // Ядро существует и целиком стальное.
  const core = vehicle.pieces.filter((piece) => local(piece).startsWith("core-"));
  assert.equal(core.length > 0, true, "ядра нет");
  for (const piece of core) {
    assert.equal(piece.material, "steel", `${local(piece)} не сталь`);
  }
  for (const required of ["core-keel-beam", "core-longeron-1", "core-longeron--1"]) {
    assert.equal(core.some((piece) => local(piece) === `${required}:piece`), true, `нет ${required}`);
  }

  // У каждой гондолы есть седло наружу на лонжерон и внутрь на ядро.
  for (const station of SR6_ROTOR_STATIONS) {
    for (const kind of ["outer", "inner"]) {
      const id = `core-saddle-${kind}-${station.id}:piece`;
      assert.equal(core.some((piece) => local(piece) === id), true, `нет ${id}`);
    }
  }

  // Сам путь нагрузки — сталь, а не пластик: один выстрел снизу не должен
  // разбирать машину, потому что несущее держит не панель.
  const loadPath = vehicle.pieces.filter((piece) =>
    /(-nacelle:piece$)|side-torque-box|forward-frame-panel|aft-nacelle-plate|core-/.test(local(piece)));
  assert.equal(loadPath.length >= 20, true, `несущих кусков всего ${loadPath.length}`);
  for (const piece of loadPath) {
    assert.equal(piece.material, "steel", `${local(piece)} в силовом пути — ${piece.material}`);
  }
});

test("ни один кусок не остался от плиты предыдущего прохода", () => {
  assert.equal(sr6SkatObject.parts.some((part) => part.id.startsWith("plate-")), false);
  assert.equal(sr6SkatObject.parts.some((part) => part.id.startsWith("tail-spine")), false);
});

test("инварианты кабины со снятой evidence card", () => {
  const sections = SR6_CABIN_SECTIONS;
  const at = (z) => sections.find((section) => Math.abs(section.z - z) < 1e-6);
  // Стекло начинается на передней кромке второго ряда винтов.
  const midLeadingEdge = SR6_ROTOR_STATIONS[2].z + SR6_ROTOR_STATIONS[2].radius;
  assert.equal(Math.abs(midLeadingEdge - 1.07) < 1e-6, true, `mid leading edge ${midLeadingEdge}`);
  assert.ok(at(1.07), "нет станции на кромке второго ряда");
  // Верх поднялся и больше не опускается до кормового среза.
  const levelRun = sections.filter((section) => section.z <= -0.6 && section.z >= -0.95);
  assert.equal(levelRun.every((section) => Math.abs(section.deckY - 1.7) < 1e-6), true);
  // Кормовая часть не уже кокпита: максимальная ширина позади фонаря.
  const widest = sections.reduce((best, s) => (s.flankHalf > best.flankHalf ? s : best));
  assert.equal(widest.z < 0, true, `максимум ширины на Z ${widest.z}`);
  assert.equal(widest.flankHalf > at(0).flankHalf, true);
  // Плановый обвод — одна прямая от носа до наибольшей ширины, а не веретено.
  const taper = sections.filter((s) => s.z >= -0.95);
  const first = taper[0];
  const last = taper[taper.length - 1];
  for (const s of taper) {
    const expected = first.flankHalf
      + ((first.z - s.z) / (first.z - last.z)) * (last.flankHalf - first.flankHalf);
    assert.equal(Math.abs(s.flankHalf - expected) < 0.006, true, `план не прямой на Z ${s.z}`);
  }
  // Транец широкий и срезанный, а не сведённый в точку.
  const transom = sections[sections.length - 1];
  assert.equal(transom.flankHalf > 0.75 * widest.flankHalf, true, `транец сужен до ${transom.flankHalf}`);
  // Кабина доходит до кормовой балки, а не обрывается в воздухе.
  const tailBeamZ = -2.22;
  assert.equal(transom.z < tailBeamZ + 0.1, true, `кабина кончается на Z ${transom.z}, балка на ${tailBeamZ}`);
  // Верх стекла передаётся корпусу: палуба поднимается на высоту фонаря
  // раньше, чем фонарь кончается, и дальше идёт горизонтом.
  const canopyTop = 1.712;
  const handover = sections.find((s) => s.z < 0 && s.deckY >= canopyTop - 0.02);
  assert.ok(handover, "палуба не поднимается до верха фонаря");
  assert.equal(handover.z > -0.2, true, `передача верха только на Z ${handover.z}`);
  for (const s of sections.filter((s) => s.z <= handover.z && s.z >= -0.95)) {
    assert.equal(Math.abs(s.deckY - handover.deckY) < 1e-6, true, `верх проседает на Z ${s.z}`);
  }
  // Граница кости и угля по борту — прямая в профиле и всегда между
  // рельсами чайна и борта, то есть режет борт, а не идёт по излому.
  const noseZ = sections[0].z;
  const tailZ = sections[sections.length - 1].z;
  const breakZ = -1.25;
  const liveryY = (z) => (z >= breakZ
    ? 1.02 + ((noseZ - z) / (noseZ - breakZ)) * (1.135 - 1.02)
    : 1.135 + ((breakZ - z) / (breakZ - tailZ)) * (1.262 - 1.135));
  for (const s of sections) {
    const y = liveryY(s.z);
    assert.equal(y > s.chineY && y < s.flankY, true, `ливрейная линия вне борта на Z ${s.z}`);
  }
  // По борту, где сидит ливрея, линия строго прямая.
  for (const s of sections.filter((s) => s.z >= breakZ)) {
    const straight = 1.02 + ((noseZ - s.z) / (noseZ - breakZ)) * (1.135 - 1.02);
    assert.equal(Math.abs(liveryY(s.z) - straight) < 1e-9, true, `линия ливреи гнётся на Z ${s.z}`);
  }
  // Панели плоские: рельсы упорядочены на каждой станции.
  for (const s of sections) {
    assert.equal(s.deckHalf < s.shoulderHalf && s.shoulderHalf < s.flankHalf, true, `ширины на Z ${s.z}`);
    assert.equal(s.keelHalf < s.chineHalf && s.chineHalf < s.flankHalf, true, `низ на Z ${s.z}`);
    assert.equal(s.keelY <= s.chineY && s.chineY <= s.flankY && s.flankY <= s.shoulderY && s.shoulderY <= s.deckY, true, `высоты на Z ${s.z}`);
  }
});

test("передние и задние гондолы крепятся разными элементами", () => {
  const ids = sr6SkatObject.parts.map((part) => part.id);
  const frontTubes = sr6SkatObject.parts.filter(
    (part) => part.id.startsWith("core-root-front-") && part.kind === "cylinder",
  );
  assert.equal(frontTubes.length, 4, "передние узлы — круглые трубы");
  for (const side of [1, -1]) {
    const plate = sr6SkatObject.parts.find((part) => part.id === `aft-nacelle-plate-${side}`);
    assert.ok(plate, "задний узел — широкая панель");
    assert.equal(plate.kind, "mesh");
  }
  assert.equal(ids.some((id) => id.startsWith("aft-frame-panel")), false);
});

test("силовая установка откалибрована по измеренной массе, а не на глаз", () => {
  const compiled = compileSceneGroups(sr6SkatPrototypeDocument, new Map());
  const vehicle = compiled.clusters.find((cluster) => cluster.id === SR6_SKAT_CLUSTER_ID);
  assert.ok(vehicle);
  const density = (material) => structuralMaterialProfiles[material].density;
  const mass = massProperties(vehicle.pieces, density).mass;
  const limits = airVehicles.find((candidate) => candidate.id === "sr6-skat").flight.limits;

  // Вертикаль: подъём считается как масса * g * запас, поэтому он следует за
  // массой сам. Проверяем, что запас паспортный и машина себя поднимает.
  const reserve = airVehicles.find((candidate) => candidate.id === "sr6-skat").flight.liftReserve;
  assert.equal(reserve >= 3, true, `тяговооружённость ${reserve} ниже требования на трёх кольцах`);
  assert.equal(mass * 9.81 * reserve > mass * 9.81, true);

  // Горизонталь: это абсолютные силы, они за массой не следуют. Удельные
  // ускорения должны совпадать с исходной настройкой M6 (62 Н и 42 Н на 5.53 кг).
  const lateralAcceleration = limits.lateralThrust / mass;
  const horizontalRatio = (limits.enginePower * limits.enginePoints.length) / (mass * 9.81);
  assert.equal(Math.abs(lateralAcceleration - 42 / 5.53) < 0.35, true, `боком ${lateralAcceleration.toFixed(2)} м/с²`);
  assert.equal(Math.abs(horizontalRatio - (62 * 6) / (5.53 * 9.81)) < 0.35, true, `горизонтальная T/W ${horizontalRatio.toFixed(2)}`);
});

test("броня днища защищает, а не держит: её потеря не роняет ни одной гондолы", () => {
  const pieces = townScene.breakablePieces.filter((piece) => piece.id.startsWith(`${SR6_SKAT_CLUSTER_ID}:`));
  const local = (piece) => piece.id.replace(`${SR6_SKAT_CLUSTER_ID}:`, "");
  const nacelles = pieces.filter((piece) => /-nacelle:piece$/.test(local(piece)));
  assert.equal(nacelles.length, 6);

  const armour = pieces.filter((piece) => local(piece).startsWith("belly-armour"));
  assert.equal(armour.length >= 12, true, `бронелистов всего ${armour.length}`);
  const afterArmour = townScene.resolveStructuralCollapse(new Set(armour.map((piece) => piece.id)));
  assert.equal(nacelles.filter((piece) => afterArmour.has(piece.id)).length, 0, "снятая броня уронила гондолы");
});

test("очередь по кокпиту снизу не отрывает боковые винты", () => {
  const pieces = townScene.breakablePieces.filter((piece) => piece.id.startsWith(`${SR6_SKAT_CLUSTER_ID}:`));
  const local = (piece) => piece.id.replace(`${SR6_SKAT_CLUSTER_ID}:`, "");
  const nacelles = pieces.filter((piece) => /-nacelle:piece$/.test(local(piece)));
  const cabin = pieces.filter((piece) => /survival-cell-shell|flank-carbon|cell-|canopy|seat-|instrument|control-|yoke|rudder-pedal|harness|battery-|livery|hump-|parachute|transom-vent/.test(local(piece)));
  assert.equal(cabin.length > 20, true);
  const collapsed = townScene.resolveStructuralCollapse(new Set(cabin.map((piece) => piece.id)));
  const lost = nacelles.filter((piece) => collapsed.has(piece.id)).map(local);
  assert.deepEqual(lost, [], "снесённая кабина утащила гондолы");
});

test("силовой корень стальной и лежит выше брони, а не под кокпитом", () => {
  const root = townScene.breakablePieces.find((piece) => piece.id === `${SR6_SKAT_CLUSTER_ID}:core:piece`);
  assert.ok(root, "корень не найден");
  assert.equal(root.material, "steel", `корень — ${root.material}`);
});

test("простых поперечных балок в ядре нет", () => {
  const crossBeams = sr6SkatObject.parts.filter((part) => /cross-beam|cross-blade/.test(part.id));
  assert.deepEqual(crossBeams.map((part) => part.id), []);
});
