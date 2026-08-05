import assert from "node:assert/strict";
import test from "node:test";
import { compileSceneDocument } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { combatHexacopterRangeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterRangeDocument.ts";
import { surfaceGap } from "./piece-contact.mjs";
import { COMBAT_HEXACOPTER_RANGE_PLACEMENT } from "../games/make-a-mess/src/game/combatHexacopter.ts";
import {
  combatHexacopterRangeCircuit,
  combatHexacopterRangePlan,
} from "../games/make-a-mess/src/game/combatHexacopterRangeRoutes.ts";

const compilation = compileSceneDocument(
  combatHexacopterRangeDocument,
  new Map(),
);

test("полигон — круглый стометровый земляной диск под отдельными стальными плитами", () => {
  assert.equal(combatHexacopterRangeDocument.world.radius, 50);
  const earth = compilation.scene.breakablePieces.find((piece) => piece.id.includes(":earth-disc:"));
  const plates = compilation.scene.breakablePieces.filter((piece) => piece.id.includes(":plate:"));
  assert.deepEqual(earth?.size, [100, 1.4, 100]);
  assert.equal(earth?.material, "earth");
  assert.equal(plates.length, 64);
  assert.equal(plates.every((piece) => piece.material === "steel" && piece.position[1] > 0), true);
});

test("машина, физический пульт и стартовая точка принадлежат одному отдельному миру", () => {
  const vehicle = compilation.scene.breakableClusters.find(
    (cluster) => cluster.id === COMBAT_HEXACOPTER_RANGE_PLACEMENT.clusterId,
  );
  const dispatch = compilation.scene.breakableClusters.find(
    (cluster) => cluster.id === "combat-hexacopter-range:dispatch",
  );
  assert.equal(vehicle?.pieces.length, 663);
  assert.ok(dispatch?.pieces.some((piece) => piece.id.includes(":screen:")));
  assert.equal(compilation.scene.resolveStructuralCollapse(new Set()).size, 0);
});

test("показательный маршрут уходит за остров, крутит восьмёрку и возвращает машину на место взлёта", () => {
  const berth = COMBAT_HEXACOPTER_RANGE_PLACEMENT.position;
  const plan = combatHexacopterRangePlan(berth);
  assert.deepEqual(plan.point(0), berth);
  assert.deepEqual(plan.point(1), berth);
  assert.ok(plan.verticalDeparture);
  assert.ok(plan.verticalArrival);
  // Маршрут НАМЕРЕННО выходит за кромку земли: машина летающая, её предел
  // задаёт оболочка мира, а не грунт. Дальний участок обязан быть, но обязан и
  // оставаться внутри видимого неба.
  let farthest = 0;
  for (let index = 0; index <= 400; index += 1) {
    const point = plan.point(index / 400);
    farthest = Math.max(farthest, Math.hypot(point[0], point[2]));
  }
  assert.ok(farthest > 95, `самая дальняя точка всего в ${farthest.toFixed(1)} м`);
  assert.ok(
    farthest < combatHexacopterRangeDocument.world.skyRadius,
    `маршрут ${farthest.toFixed(1)} м выходит за небо ${combatHexacopterRangeDocument.world.skyRadius}`,
  );

  // ВОСЬМЁРКА: на ней знак кривизны обязан смениться. Считаем поворот носа по
  // касательной и требуем оба знака на участке перед заходом.
  const turn = (progress) => {
    const ahead = plan.point(Math.min(1, progress + 0.004));
    const behind = plan.point(Math.max(0, progress - 0.004));
    return Math.atan2(ahead[0] - behind[0], ahead[2] - behind[2]);
  };
  let clockwise = 0;
  let counter = 0;
  for (let index = 1; index < 120; index += 1) {
    const at = 0.5 + (index / 120) * 0.45;
    let delta = turn(at) - turn(at - 0.003);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (delta > 0.002) clockwise += 1;
    if (delta < -0.002) counter += 1;
  }
  assert.ok(clockwise > 12 && counter > 12,
    `восьмёрки нет: витков по часовой ${clockwise}, против ${counter}`);
  const radii = Array.from({ length: 9 }, (_, index) => {
    const point = combatHexacopterRangeCircuit.point(0.12 + index * 0.085);
    return Math.hypot(point[0], point[2]);
  });
  assert.ok(Math.max(...radii) - Math.min(...radii) > 5);
});

// ---------------------------------------------------------------------------
// ОПОРА ПРОВЕРЯЕТСЯ ГЕОМЕТРИЕЙ, А НЕ ДОПУСКОМ
//
// Класс дефекта, ради которого этот блок написан: гондола была не
// конструкцией, а облицовкой. Внутри неё ничто не могло нести ничего, силовой
// путь обрывался за корневым лонжероном, и держалось всё на допуске крепления
// в 1.62 м при проектной норме 0.14…0.5. На целой машине это не было видно
// вовсе — а на разбитой девять накладок оставались висеть в воздухе там, где
// двигателя уже не существовало.
// ---------------------------------------------------------------------------

const VEHICLE_CLUSTER = COMBAT_HEXACOPTER_RANGE_PLACEMENT.clusterId;
const vehiclePieces = compilation.scene.breakablePieces.filter(
  (piece) => piece.clusterId === VEHICLE_CLUSTER,
);

test("допуск крепления остаётся длиной болта, а не разрешением висеть", () => {
  // Верхняя граница взята по проекту: самый щедрый допуск у прочих машин —
  // 0.5 м. Всё, что больше, means опору ищут там, где её видно быть не может.
  const PROJECT_MAXIMUM = 0.5;
  const generous = vehiclePieces.filter(
    (piece) => (piece.sideAttachmentReach ?? 0) > PROJECT_MAXIMUM,
  );
  assert.deepEqual(
    generous.map((piece) => `${piece.id} = ${piece.sideAttachmentReach}`),
    [],
    "допуск крепления снова раздут выше проектной нормы",
  );
});

test("кольцо гондолы — набор стальных сегментов, и он несёт нагрузку", () => {
  const segments = vehiclePieces.filter((piece) => /-ring-segment-\d+:piece$/.test(piece.id));
  const collarTop = vehiclePieces.filter((piece) => /-collar-top-\d+:piece$/.test(piece.id));
  const collarBottom = vehiclePieces.filter((piece) => /-collar-bottom-\d+:piece$/.test(piece.id));
  assert.equal(segments.length, 72, "шесть гондол по двенадцать сегментов");
  assert.equal(collarTop.length, 72, "сплошной верхний конический воротник");
  assert.equal(collarBottom.length, 72, "сплошной нижний конический воротник");
  for (const piece of [...segments, ...collarTop, ...collarBottom]) {
    assert.equal(piece.material, "steel", `${piece.id} не стальной`);
    assert.equal(piece.bearsLoad, true, `${piece.id} не несёт нагрузку`);
  }
});

test("уничтожение кольца уносит с собой всю обшивку своей гондолы", () => {
  const ring = vehiclePieces.filter((piece) =>
    /:engine:0:.*(ring-segment|ring-splice|collar-top|collar-bottom)-\d+:/.test(piece.id),
  );
  assert.equal(ring.length > 40, true, `кольцо гондолы 0: ${ring.length} кусков`);
  const removed = new Set(ring.map((piece) => piece.id));
  const collapsed = compilation.scene.resolveStructuralCollapse(removed);
  // Ни один кусок разрушенного кольца не имеет права уцелеть: держаться ему
  // больше не за что, и это ровно тот кадр, который был снят как дефект.
  for (const piece of ring) {
    assert.equal(
      collapsed.has(piece.id),
      true,
      `${piece.id} пережил уничтожение собственного кольца`,
    );
  }
});

test("вращающаяся лопасть никому не служит опорой и не опирается на стенку", () => {
  const blades = vehiclePieces.filter((piece) => /:blade:\d+:piece$/.test(piece.id));
  assert.equal(blades.length, 44, "тридцать подъёмных и четырнадцать управляющих");
  for (const blade of blades) {
    assert.equal(
      blade.carriesAttachments,
      false,
      `${blade.id} объявлен опорой, хотя вращается`,
    );
    assert.equal(
      blade.sideAttachmentReach <= 0.06,
      true,
      `${blade.id} дотягивается до стенки тоннеля вместо своей ступицы`,
    );
  }
});

test("корни передних тяг лежат в борту, а не рядом с ним", () => {
  // Нос сужается быстрее, чем средние станции, и корень, посчитанный их
  // логикой, вставал в пятнадцати сантиметрах от обшивки: в кадре между тягой
  // и корпусом была видна щель. Мерится РАССТОЯНИЕ МЕЖДУ ПОВЕРХНОСТЯМИ — тем
  // же независимым измерителем, что ловит любую висящую деталь, а не паспортным
  // допуском, которым эту щель когда-то и закрыли.
  const hull = vehiclePieces.filter(
    (piece) =>
      piece.bearsLoad &&
      /armoured-body-shell|nose-dorsal-armour|canopy-cheek|survival|forward-shoulder-deck|coaming|sill/.test(
        piece.id,
      ),
  );
  assert.equal(hull.length > 8, true, `несущего корпуса найдено ${hull.length}`);
  for (const side of ["front-left", "front-right"]) {
    const strut = vehiclePieces.find((piece) => piece.id.includes(`clevis-inboard-${side}`));
    assert.ok(strut, `нет тяги ${side}`);
    const gap = surfaceGap(strut, hull, { voxel: 0.04 });
    assert.equal(
      gap < 0.08,
      true,
      `тяга ${side} отстоит от борта на ${gap.toFixed(3)} м — между ней и корпусом щель`,
    );
  }
});

test("коридор — требование участка: узко у земли, свобода на круге", () => {
  const berth = COMBAT_HEXACOPTER_RANGE_PLACEMENT.position;
  const plan = combatHexacopterRangePlan(berth);
  assert.ok(plan.corridor, "маршрут обязан объявлять коридор");
  assert.equal(plan.corridor(0.02) <= 4, true, "взлётный столб — строгие метры");
  assert.equal(plan.corridor(0.5) >= 25, true, "круг — свобода гоночной линии");
  assert.equal(plan.corridor(0.98) <= 4, true, "посадочный столб — строгие метры");
});

test("побрякушка не переживает своего носителя: сенсоры падают с пушкой и носом", () => {
  // «Нижний сенсор в полуметре от корпуса и откреплён» — так выглядел шар
  // подвеса после гибели подбородочной пушки: допуск 0.42 дотягивался до
  // дальней структуры, и мелочь висела в воздухе. Теперь у сенсоров и огней
  // побрякушечный допуск 0.12: держаться можно только за своего носителя.
  const cannonDead = new Set(
    vehiclePieces.filter((piece) => /chin-cannon/.test(piece.id)).map((p) => p.id),
  );
  const afterCannon = compilation.scene.resolveStructuralCollapse(cannonDead);
  const window = vehiclePieces.find((piece) => piece.id.includes("sensor-window"));
  assert.ok(window);
  assert.equal(
    afterCannon.has(window.id),
    true,
    "окно сенсора обязано упасть вместе с пушечным узлом",
  );
  const noseDead = new Set(
    vehiclePieces
      .filter((piece) =>
        /armoured-body-shell|nose-dorsal|survival-keel|chin-cannon/.test(piece.id),
      )
      .map((p) => p.id),
  );
  const afterNose = compilation.scene.resolveStructuralCollapse(noseDead);
  const ball = vehiclePieces.find((piece) => piece.id.includes("sensor-ball"));
  assert.ok(ball);
  assert.equal(
    afterNose.has(ball.id),
    true,
    "шар подвеса обязан упасть вместе с носом, а не висеть в воздухе",
  );
});
