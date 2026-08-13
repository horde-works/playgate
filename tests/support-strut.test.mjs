import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupportStruts,
  coilStrut,
  oleoStrut,
  strutClosingSpeed,
  strutFoldAngle,
  strutFoldOffset,
  strutPadFriction,
  strutReaction,
  strutSpringForce,
  strutVisualSlide,
  strutWeightShares,
} from "../games/make-a-mess/src/game/supportStrut.ts";
import { compoundClusterColliders } from "../games/make-a-mess/src/game/compoundKinematicCluster.ts";
import {
  massProperties,
  rotateVector,
  stepBody,
} from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import { compileSceneGroups } from "../games/make-a-mess/src/content/scenes/compileScene.ts";
import { createCombatHexacopterPrototypeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterPrototypeDocument.ts";
import {
  COMBAT_HEX_BODY_SECTIONS,
  COMBAT_HEX_LANDING_STATIONS,
} from "../games/make-a-mess/src/content/objects/vehicles/combatHexacopterObject.ts";
import {
  COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT,
  combatHexacopterPrototypeFrame,
} from "../games/make-a-mess/src/game/combatHexacopter.ts";
import { COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE } from "../games/make-a-mess/src/game/airVehicles.ts";
import { isRotorLandingComplete } from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";

// ---------------------------------------------------------------------------
// ДЕРЖИТ ЛИ ОНА МАШИНУ И СЪЕДАЕТ ЛИ ПОСАДКУ
//
// Формулы по отдельности здесь не проверяются. Стойка гоняется тем же шагом
// 1/60, каким живёт мир, и отвечает на три вопроса: стоит ли машина ровно там,
// где её нарисовали; во что обходится посадка; и правда ли газ с маслом ведут
// себя иначе, чем витая пружина, — ради этой разницы всё и затевалось.
//
// Стенд-заготовка — RAX-8 Tonkawa: масса и центр масс сняты с его собственных
// кусков, геометрия ног — с посадочных станций объекта.
// ---------------------------------------------------------------------------

const GRAVITY = 9.81;
const STEP = 1 / 60;

const vehiclePieces = compileSceneGroups(
  createCombatHexacopterPrototypeDocument(COMBAT_HEXACOPTER_PROTOTYPE_PLACEMENT),
  new Map(),
).clusters[0].pieces;
const vehicleMass = massProperties(
  vehiclePieces,
  (material) => structuralMaterialProfiles[material].density,
);

/** Пятки посадочных станций объекта — по ним и считается развесовка. */
const LANDING_STATIONS = COMBAT_HEX_LANDING_STATIONS.map((station) => ({
  id: station.id,
  knee: station.knee,
  foot: [station.axle[0], 0, station.axle[2]],
}));

const STROKE = 0.12;
const SAG_SHARE = 0.25;

const shares = strutWeightShares(
  LANDING_STATIONS.map((station) => station.foot),
  vehicleMass.centre,
);

/**
 * Стойки собираются РОВНО ТАК, как их собирает живая машина: из паспорта
 * кадра и измеренной массы. Своей копии чисел у стенда нет — иначе он мерил бы
 * себя, а не машину.
 */
function hexacopterStruts() {
  return buildSupportStruts(
    combatHexacopterPrototypeFrame.supportStruts.map(
      (definition) => definition.plan,
    ),
    vehicleMass.mass * GRAVITY,
    vehicleMass.centre,
  );
}

/**
 * Стенд одного угла: подрессоренная масса падает на одну стойку. Интегратор
 * тот же полуявный, что и в `stepBody`, и шаг тот же — иначе стенд отвечал бы
 * на вопрос про свою арифметику, а не про стойку.
 */
function dropCorner(strut, sinkRate, seconds = 6) {
  const mass = strut.supportedMass;
  let travel = 0;
  let velocity = sinkRate;
  let peakLoad = 0;
  let deepest = 0;
  let maximumOvertravel = 0;
  let bottomedOut = false;
  let rebound = 0;
  for (let index = 0; index < Math.round(seconds / STEP); index += 1) {
    const probe =
      travel > 0 ? { distance: strut.extendedReach - travel, normal: [0, 1, 0] } : null;
    const reaction = strutReaction(strut, probe, velocity, STEP);
    peakLoad = Math.max(peakLoad, reaction.load);
    deepest = Math.max(deepest, reaction.compression);
    maximumOvertravel = Math.max(maximumOvertravel, reaction.overtravel);
    bottomedOut = bottomedOut || reaction.bottomedOut;
    velocity += (GRAVITY - reaction.load / mass) * STEP;
    travel += velocity * STEP;
    rebound = Math.max(rebound, -velocity);
    assert.equal(Number.isFinite(travel), true, "стенд разошёлся");
  }
  return {
    peakLoadFactor: peakLoad / (mass * GRAVITY),
    strokeUsed: deepest / strut.stroke,
    maximumOvertravel,
    bottomedOut,
    rebound,
    restTravel: travel,
  };
}

test("кадр объявляет четыре опоры и выключает ноги из обвода компаунда", () => {
  const definitions = combatHexacopterPrototypeFrame.supportStruts;
  assert.equal(definitions.length, 4);
  assert.deepEqual(combatHexacopterPrototypeFrame.contactMemberExcludes, [
    ":landing-",
  ]);
  // ЛУЧ СТОЙКИ НЕ ДОЛЖЕН НАХОДИТЬ ОПОРУ В СОБСТВЕННОЙ ПЯТКЕ. Проверяется не
  // маска, а результат: в контактном обводе машины ног нет ни одной.
  const colliders = compoundClusterColliders(
    {
      id: "test",
      clusterId: combatHexacopterPrototypeFrame.clusterId,
      origin: [0, 0, 0],
      contactMemberExcludes:
        combatHexacopterPrototypeFrame.contactMemberExcludes,
    },
    vehiclePieces,
    new Set(),
  );
  assert.ok(colliders.length > 500, `кусков в обводе ${colliders.length}`);
  assert.equal(
    colliders.some((collider) => collider.sourceId.includes(":landing-")),
    false,
  );
  // Зато кусками машины они остаются: их можно сломать взрывом, они несут
  // нагрузку в решателе и ими же рисуется ход штока.
  assert.equal(
    vehiclePieces.filter((piece) => piece.id.includes(":landing-")).length,
    44,
  );
  for (const definition of definitions) {
    for (const mask of [
      ...definition.requiredMembers,
      ...definition.travellingMembers,
      ...definition.halfTravellingMembers,
    ]) {
      assert.ok(
        vehiclePieces.some((piece) => piece.id.includes(mask)),
        `маска ${mask} не нашла куска`,
      );
    }
  }
});

test("ход штока виден: разгруженная стойка выпускается, обжатая убирается", () => {
  const [front] = hexacopterStruts();
  const extended = strutVisualSlide(front, 0);
  const resting = strutVisualSlide(front, front.staticSag);
  const compressed = strutVisualSlide(front, front.stroke);
  // Авторская поза — поза под нагрузкой: на статике шток стоит там, где
  // нарисован, и ни на миллиметр в сторону.
  assert.ok(Math.hypot(...resting) < 1e-12);
  // В воздухе нога выпускается НИЖЕ авторской, на упоре уходит ВЫШЕ неё.
  assert.ok(extended[1] < 0 && compressed[1] > 0);
  assert.ok(
    Math.abs(compressed[1] - (front.stroke - front.staticSag) * Math.abs(front.axis[1])) < 1e-12,
  );
  // Шток ходит по СВОЕЙ оси, поэтому уезжает и вбок — иначе он вылез бы из
  // наклонного цилиндра.
  assert.ok(Math.abs(compressed[0]) > 0.005 && Math.abs(compressed[2]) > 0.005);
});

test("убранная нога уходит ПОД ДНИЩЕ и ВНУТРЬ, симметрично по бортам", () => {
  const definitions = combatHexacopterPrototypeFrame.supportStruts;
  const tucked = definitions.map((definition, index) => {
    const station = COMBAT_HEX_LANDING_STATIONS[index];
    const foot = [station.axle[0], 0.055, station.axle[2]];
    const offset = strutFoldOffset(
      definition.retraction,
      definition.retraction.angle,
      foot,
    );
    return [foot[0] + offset[0], foot[1] + offset[1], foot[2] + offset[2]];
  });
  for (const [index, foot] of tucked.entries()) {
    const station = COMBAT_HEX_LANDING_STATIONS[index];
    // Ровно на объявленную высоту: угол выведен из геометрии, а не подобран.
    assert.ok(Math.abs(foot[1] - 0.36) < 1e-9, `${station.id}: пятка на ${foot[1]}`);
    // Внутрь — то есть ближе к продольной оси, чем была.
    assert.ok(
      Math.abs(foot[0]) < Math.abs(station.axle[0]) - 0.6,
      `${station.id}: ${station.axle[0]} → ${foot[0]}`,
    );
    assert.equal(Math.sign(foot[0]), Math.sign(station.axle[0]), "перескочила ось");
    // Цапфа лежит вдоль корпуса, поэтому нога складывается В ПЛОСКОСТИ БОРТА.
    assert.ok(Math.abs(foot[2] - station.axle[2]) < 1e-9, "уехала вдоль корпуса");
  }
  // Борта зеркальны и друг друга не задевают.
  assert.ok(Math.abs(tucked[0][0] + tucked[1][0]) < 1e-9);
  assert.ok(Math.abs(tucked[2][0] + tucked[3][0]) < 1e-9);
  assert.ok(Math.abs(tucked[0][0] - tucked[1][0]) > 1.4, "пятки сошлись под килем");
  // Угол не круглый и не назначенный: у кормовых ног цапфа выше, и им нужно
  // меньше, чтобы прийти на ту же высоту.
  const degrees = definitions.map(
    (definition) => Math.abs(definition.retraction.angle * 180 / Math.PI),
  );
  assert.ok(degrees[0] > 65 && degrees[0] < 70, `нос ${degrees[0]}`);
  assert.ok(degrees[2] < degrees[0] - 4, `корма ${degrees[2]} против носа ${degrees[0]}`);
});

test("складывание — жёсткий поворот ноги, а не растягивание", () => {
  const [definition] = combatHexacopterPrototypeFrame.supportStruts;
  const retraction = definition.retraction;
  const knee = COMBAT_HEX_LANDING_STATIONS[0].knee;
  const foot = [
    COMBAT_HEX_LANDING_STATIONS[0].axle[0],
    0.055,
    COMBAT_HEX_LANDING_STATIONS[0].axle[2],
  ];
  for (const fraction of [0.25, 0.5, 0.8, 1]) {
    const angle = strutFoldAngle(retraction, fraction);
    const move = (point) => {
      const offset = strutFoldOffset(retraction, angle, point);
      return [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];
    };
    const movedKnee = move(knee);
    const movedFoot = move(foot);
    // Расстояние между кусками ноги сохраняется — значит нога не рвётся.
    const before = Math.hypot(
      knee[0] - foot[0],
      knee[1] - foot[1],
      knee[2] - foot[2],
    );
    const after = Math.hypot(
      movedKnee[0] - movedFoot[0],
      movedKnee[1] - movedFoot[1],
      movedKnee[2] - movedFoot[2],
    );
    assert.ok(Math.abs(before - after) < 1e-9, `длина ноги ${before} → ${after}`);
    // И расстояние до цапфы тоже: она ось, а не точка притяжения.
    for (const [original, moved] of [[knee, movedKnee], [foot, movedFoot]]) {
      const radiusBefore = Math.hypot(
        original[0] - retraction.pivot[0],
        original[1] - retraction.pivot[1],
      );
      const radiusAfter = Math.hypot(
        moved[0] - retraction.pivot[0],
        moved[1] - retraction.pivot[1],
      );
      assert.ok(Math.abs(radiusBefore - radiusAfter) < 1e-9);
    }
  }
  // Цапфа стоит на месте: она ось, а не член ноги.
  assert.deepEqual(strutFoldOffset(retraction, retraction.angle, retraction.pivot), [0, 0, 0]);
  assert.equal(
    definition.foldingMembers.some((mask) => mask.includes("trunnion")),
    false,
    "цапфа не должна складываться вокруг самой себя",
  );
});

test("механизм трогается и останавливается плавно", () => {
  const [definition] = combatHexacopterPrototypeFrame.supportStruts;
  const retraction = definition.retraction;
  assert.equal(strutFoldAngle(retraction, 0), 0);
  assert.ok(Math.abs(strutFoldAngle(retraction, 1) - retraction.angle) < 1e-12);
  const rate = (at) =>
    Math.abs(
      strutFoldAngle(retraction, at + 0.01) - strutFoldAngle(retraction, at),
    );
  // На концах хода скорость почти ноль, в середине — наибольшая.
  assert.ok(rate(0) < rate(0.5) * 0.25, `старт ${rate(0)} против середины ${rate(0.5)}`);
  assert.ok(rate(0.98) < rate(0.5) * 0.25, "останавливается рывком");
  assert.ok(rate(0.5) > rate(0.25) && rate(0.5) > rate(0.75));
  // За объявленные секунды доходит до упора, и ни шагом раньше.
  const steps = Math.ceil(retraction.seconds / STEP);
  assert.ok(steps > 200 && steps < 260, `шагов на уборку ${steps}`);
});

test("убранная нога не залезает в корпус", () => {
  // Обвод корпуса по авторским сечениям: днище и полуширина скулы на данном z.
  const hullAt = (z) => {
    const sections = [...COMBAT_HEX_BODY_SECTIONS].sort((a, b) => a.z - b.z);
    const after = sections.find((section) => section.z >= z) ?? sections.at(-1);
    const before = [...sections].reverse().find((section) => section.z <= z) ?? sections[0];
    if (after === before) return { belly: before.bellyY, half: before.chineHalf };
    const t = (z - before.z) / (after.z - before.z);
    return {
      belly: before.bellyY + (after.bellyY - before.bellyY) * t,
      half: before.chineHalf + (after.chineHalf - before.chineHalf) * t,
    };
  };
  const lowerLeg = ["oleo-piston", "knee", "pad-pivot", "pad", "pad-sole"];
  for (const [index, definition] of combatHexacopterPrototypeFrame.supportStruts.entries()) {
    const station = COMBAT_HEX_LANDING_STATIONS[index];
    for (const part of lowerLeg) {
      const mask = `:landing-${part}-${station.id}:`;
      const piece = vehiclePieces.find((candidate) => candidate.id.includes(mask));
      assert.ok(piece, mask);
      const offset = strutFoldOffset(
        definition.retraction,
        definition.retraction.angle,
        piece.position,
      );
      const folded = [
        piece.position[0] + offset[0],
        piece.position[1] + offset[1],
        piece.position[2] + offset[2],
      ];
      const hull = hullAt(folded[2]);
      const belowBelly = folded[1] < hull.belly - 0.02;
      const outsideChine = Math.abs(folded[0]) > hull.half + 0.02;
      assert.ok(
        belowBelly || outsideChine,
        `${mask} убралась внутрь обшивки: [${folded.map((v) => v.toFixed(2)).join(", ")}], днище ${hull.belly.toFixed(2)}, скула ${hull.half.toFixed(2)}`,
      );
    }
  }
});

test("все складывающиеся маски находят свои куски", () => {
  for (const definition of combatHexacopterPrototypeFrame.supportStruts) {
    for (const mask of definition.foldingMembers) {
      assert.ok(
        vehiclePieces.some((piece) => piece.id.includes(mask)),
        `маска ${mask} не нашла куска`,
      );
    }
    // Ходящие со штоком складываются вместе со всей ногой — иначе шток
    // остался бы висеть в воздухе на убранной ноге.
    for (const mask of definition.travellingMembers) {
      assert.ok(
        definition.foldingMembers.includes(mask),
        `${mask} ходит со штоком, но не складывается`,
      );
    }
  }
});

test("развесовка по четырём опорам — рычаг, а не выдумка", () => {
  assert.equal(shares.length, 4);
  const total = shares.reduce((sum, share) => sum + share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `сумма долей ${total}`);
  // Борта расходятся ровно настолько, насколько несимметрична сама машина:
  // её центр масс сидит в сорока микронах от продольной оси.
  assert.ok(Math.abs(vehicleMass.centre[0]) < 1e-4);
  assert.ok(Math.abs(shares[0] - shares[1]) < 1e-4);
  assert.ok(Math.abs(shares[2] - shares[3]) < 1e-4);
  // Центр масс лежит впереди середины, поэтому носовые ноги грузятся сильнее.
  assert.ok(shares[0] > shares[2], `нос ${shares[0]}, корма ${shares[2]}`);
  // Тот же ответ, что у обычного рычага по продольной оси.
  const front = LANDING_STATIONS[0].foot[2];
  const rear = LANDING_STATIONS[2].foot[2];
  const lever = (vehicleMass.centre[2] - rear) / (front - rear) / 2;
  assert.ok(Math.abs(shares[0] - lever) < 1e-4, `${shares[0]} против ${lever}`);
});

test("верх стойки выше опоры ровно на выпуск минус статическая осадка", () => {
  for (const strut of hexacopterStruts()) {
    const descent = Math.abs(strut.axis[1]);
    const authored = (strut.mount[1] - 0) / descent;
    assert.ok(
      Math.abs(strut.extendedReach - strut.staticSag - authored) < 1e-12,
      `${strut.id}: выпуск ${strut.extendedReach}`,
    );
    // Наклонная стойка достаёт до грунта ДЛИННЕЕ, чем падает по вертикали.
    assert.ok(descent < 0.96 && descent > 0.9, `наклон ${descent}`);
    assert.ok(authored > strut.mount[1], "ход считается по оси, а не по вертикали");
  }
});

test("под собственным весом машина стоит ровно в авторской позе", () => {
  for (const strut of hexacopterStruts()) {
    const reaction = strutReaction(
      strut,
      { distance: strut.extendedReach - strut.staticSag, normal: [0, 1, 0] },
      0,
      STEP,
    );
    const expected = strut.supportedMass * GRAVITY;
    assert.ok(
      Math.abs(reaction.load - expected) / expected < 1e-9,
      `${strut.id}: ${reaction.load} против ${expected}`,
    );
    assert.equal(reaction.bottomedOut, false);
  }
});

test("витая пружина — предельный случай олео, а не второй закон", () => {
  const common = {
    id: "limit",
    mount: [0, 0.4, 0],
    axis: [0, -1, 0],
    stroke: 0.32,
    staticLoad: 500,
    staticSagShare: 0.5,
  };
  const coil = coilStrut(common);
  // Больше 1/осадка витая пружина дать не может — просьба ниже потолка
  // возвращает именно её, без ветки кода.
  const asked = oleoStrut({ ...common, compressedLoadFactor: 2 });
  assert.equal(Number.isFinite(asked.spring.gasLength), false);
  assert.equal(coil.spring.gasLength, Number.POSITIVE_INFINITY);
  // Жёсткость — то же правило, по которому живёт подвеска машины.
  assert.ok(Math.abs(coil.spring.preload - 500 / 0.16) < 1e-9);
  for (const compression of [0, 0.05, 0.16, 0.3]) {
    assert.ok(
      Math.abs(
        strutSpringForce(coil, compression) - strutSpringForce(asked, compression),
      ) < 1e-9,
    );
  }
  // И этот же потолок: на упоре пружина отдаёт ровно 1/осадка статики.
  assert.ok(Math.abs(strutSpringForce(coil, 0.32) / 500 - 2) < 1e-9);
});

test("газ отдаёт запрошенный потолок на упоре и мягок в начале хода", () => {
  const [front] = hexacopterStruts();
  const staticLoad = front.supportedMass * GRAVITY;
  assert.ok(Number.isFinite(front.spring.gasLength));
  assert.ok(front.spring.gasLength > front.stroke);
  const atStop = strutSpringForce(front, front.stroke) / staticLoad;
  assert.ok(Math.abs(atStop - 6) < 1e-6, `на упоре ${atStop}`);
  // Мягче витой пружины на первой половине хода и жёстче на последней —
  // ровно этим олео и укладывает ту же энергию в меньший ход.
  const coil = coilStrut({
    id: "coil",
    mount: front.mount,
    axis: front.axis,
    stroke: front.stroke,
    staticLoad,
    staticSagShare: SAG_SHARE,
  });
  assert.ok(strutSpringForce(front, 0.02) < strutSpringForce(coil, 0.02));
  assert.ok(strutSpringForce(front, 0.1) > strutSpringForce(coil, 0.1));
});

test("расчётная посадка 2 м/с укладывается в ход", () => {
  const [front, , rear] = hexacopterStruts();
  for (const strut of [front, rear]) {
    const result = dropCorner(strut, 2);
    assert.equal(result.bottomedOut, false, `${strut.id} пробил ход`);
    assert.ok(
      result.strokeUsed > 0.7 && result.strokeUsed < 0.95,
      `${strut.id}: съедено ${(result.strokeUsed * 100).toFixed(0)}% хода`,
    );
    assert.ok(
      result.peakLoadFactor > 3 && result.peakLoadFactor < 5.5,
      `${strut.id}: пик ${result.peakLoadFactor.toFixed(2)} g`,
    );
    // Осела и осталась осевшей: к концу прогона стойка стоит на статике.
    assert.ok(
      Math.abs(result.restTravel - strut.staticSag) < 0.004,
      `${strut.id}: успокоилась на ${result.restTravel}`,
    );
  }
});

test("штатная посадка почти не тревожит машину, четыре метра в секунду доходят до упора", () => {
  const [front] = hexacopterStruts();
  const gentle = dropCorner(front, 0.5);
  assert.equal(gentle.bottomedOut, false);
  assert.ok(gentle.peakLoadFactor < 2.6, `пик ${gentle.peakLoadFactor}`);

  const hard = dropCorner(front, 4);
  assert.equal(hard.bottomedOut, true, "четыре метра в секунду обязаны дойти до упора");
  assert.ok(hard.strokeUsed >= 1);
  assert.ok(
    hard.maximumOvertravel < 0.04,
    `железный упор пропустил пятку ещё на ${hard.maximumOvertravel.toFixed(3)} м`,
  );
  assert.ok(
    Math.abs(hard.restTravel - front.staticSag) < 0.004,
    `после удара стойка не вернулась на статику: ${hard.restTravel}`,
  );
});

test("за концом хода остаток удара принимает железный упор", () => {
  const [front] = hexacopterStruts();
  const overtravel = 0.025;
  const closingSpeed = 3;
  const reaction = strutReaction(
    front,
    {
      distance: front.extendedReach - front.stroke - overtravel,
      normal: [0, 1, 0],
    },
    closingSpeed,
    STEP,
  );
  const requiredLoad =
    (front.supportedMass * (closingSpeed + overtravel / STEP)) / STEP;
  assert.equal(reaction.bottomedOut, true);
  assert.ok(reaction.bottomStop > 0, "флаг упора есть, а его реакции нет");
  assert.ok(
    Math.abs(reaction.load - requiredLoad) / requiredLoad < 1e-12,
    `${reaction.load} Н вместо импульса ${requiredLoad} Н`,
  );
});

test("RAX выключает кольца после касания и оседает на олео, а не падает на них", () => {
  const [front] = hexacopterStruts();
  const tolerance = COMBAT_HEXACOPTER_RANGE_AIR_VEHICLE.flight.landing;
  let height = 0.08;
  let velocity = -0.2;
  let contactLastStep = false;
  let enginesOn = true;
  let shutdownHeight = Number.NaN;
  for (let index = 0; index < Math.round(4 / STEP); index += 1) {
    if (
      enginesOn &&
      isRotorLandingComplete(
        tolerance,
        { horizontal: 0, height },
        {
          speed: 0,
          verticalSpeed: velocity,
          uprightCos: 1,
          angularSpeed: 0,
        },
        contactLastStep ? 1 : 0,
        true,
      )
    ) {
      assert.equal(contactLastStep, true, "кольца погасли без реакции стойки");
      enginesOn = false;
      shutdownHeight = height;
    }
    const travel = front.staticSag - height;
    const reaction = strutReaction(
      front,
      travel > 0
        ? {
            distance: front.extendedReach - travel,
            normal: [0, 1, 0],
          }
        : null,
      -velocity,
      STEP,
    );
    contactLastStep = reaction.contact;
    const engineAcceleration = enginesOn ? GRAVITY : 0;
    velocity +=
      (-GRAVITY + engineAcceleration + reaction.load / front.supportedMass) *
      STEP;
    height += velocity * STEP;
  }
  assert.equal(enginesOn, false, "RAX завис над опорами с работающими кольцами");
  assert.ok(
    shutdownHeight <= front.staticSag,
    `кольца погасли при зазоре ${(shutdownHeight - front.staticSag).toFixed(4)} м`,
  );
  assert.ok(
    Math.abs(height) < 0.004,
    `после выключения RAX не сел в авторскую осадку: ${height.toFixed(4)} м`,
  );
});

test("олео не козлит, а витая пружина той же жёсткости — козлит", () => {
  const [front] = hexacopterStruts();
  const coil = coilStrut({
    id: "coil",
    mount: front.mount,
    axis: front.axis,
    stroke: front.stroke,
    staticLoad: front.supportedMass * GRAVITY,
    staticSagShare: SAG_SHARE,
    dampingRatio: 0.32,
  });
  const oleoLanding = dropCorner(front, 2);
  const coilLanding = dropCorner(coil, 2);
  assert.ok(
    oleoLanding.rebound < 0.3 * 2,
    `отскок олео ${oleoLanding.rebound.toFixed(3)} м/с`,
  );
  assert.ok(
    coilLanding.rebound > oleoLanding.rebound * 1.5,
    `пружина ${coilLanding.rebound.toFixed(3)} против олео ${oleoLanding.rebound.toFixed(3)}`,
  );
});

test("отбой туже сжатия: стойка распрямляется медленнее, чем села", () => {
  const [front] = hexacopterStruts();
  const compressing = strutReaction(
    front,
    { distance: front.extendedReach - front.staticSag, normal: [0, 1, 0] },
    0.5,
    STEP,
  );
  const extending = strutReaction(
    front,
    { distance: front.extendedReach - front.staticSag, normal: [0, 1, 0] },
    -0.5,
    STEP,
  );
  assert.ok(compressing.damping > 0 && extending.damping < 0);
  assert.ok(
    Math.abs(extending.damping) > compressing.damping,
    `сжатие ${compressing.damping}, отбой ${extending.damping}`,
  );
});

test("потерянная стойка не держит ничего", () => {
  const [front] = hexacopterStruts();
  const probe = { distance: front.extendedReach - front.staticSag, normal: [0, 1, 0] };
  assert.equal(strutReaction(front, probe, 0, STEP, 0).load, 0);
  assert.equal(strutReaction(front, null, 0, STEP).contact, false);
  assert.equal(
    strutReaction(front, { ...probe, distance: front.extendedReach + 0.2 }, 0, STEP)
      .contact,
    false,
  );
});

test("скорость сжатия наклонной стойки больше скорости снижения", () => {
  const [front] = hexacopterStruts();
  const closing = strutClosingSpeed([0, -1, 0], front.axis, [0, 1, 0]);
  assert.ok(closing > 1.03 && closing < 1.12, `сжатие ${closing} на 1 м/с снижения`);
  assert.equal(strutClosingSpeed([0, 1, 0], front.axis, [0, 1, 0]) < 0, true);
});

test("пятка держит от сползания, но не сильнее сцепления", () => {
  const [front] = hexacopterStruts();
  const load = front.supportedMass * GRAVITY;
  const crawling = strutPadFriction(front, load, [0.01, 0, 0]);
  assert.ok(crawling[0] < 0 && Math.abs(crawling[0]) < front.grip * load);
  const sliding = strutPadFriction(front, load, [3, 0, 0]);
  assert.ok(
    Math.abs(Math.hypot(...sliding) - front.grip * load) < 1e-9,
    "на срыве держит ровно μ·N",
  );
  assert.deepEqual(strutPadFriction(front, 0, [3, 0, 0]), [0, 0, 0]);
  const wet = strutPadFriction(front, load, [3, 0, 0], 0.4);
  assert.ok(Math.hypot(...wet) < Math.hypot(...sliding));
});

test("машина целиком садится на четыре стойки и стоит ровно", () => {
  const struts = hexacopterStruts();
  const damping = { linear: 0, angular: 0 };
  let state = {
    position: [0, 0.25, 0],
    orientation: [0, 0, 0, 1],
    velocity: [0, -1.5, 0],
    angularVelocity: [0, 0, 0],
  };
  let deepest = 0;
  let bottomedOut = false;
  for (let index = 0; index < Math.round(5 / STEP); index += 1) {
    const centre = [
      vehicleMass.centre[0] + state.position[0],
      vehicleMass.centre[1] + state.position[1],
      vehicleMass.centre[2] + state.position[2],
    ];
    const forces = [
      { force: [0, -vehicleMass.mass * GRAVITY, 0], point: centre },
    ];
    for (const strut of struts) {
      const axisWorld = rotateVector(state.orientation, strut.axis);
      const mountWorld = rotateVector(state.orientation, [
        strut.mount[0] - vehicleMass.centre[0],
        strut.mount[1] - vehicleMass.centre[1],
        strut.mount[2] - vehicleMass.centre[2],
      ]).map((value, axis) => value + centre[axis]);
      if (!(axisWorld[1] < -1e-6)) continue;
      const distance = mountWorld[1] / -axisWorld[1];
      const lever = [
        mountWorld[0] - centre[0],
        mountWorld[1] - centre[1],
        mountWorld[2] - centre[2],
      ];
      const mountVelocity = [
        state.velocity[0] +
          state.angularVelocity[1] * lever[2] -
          state.angularVelocity[2] * lever[1],
        state.velocity[1] +
          state.angularVelocity[2] * lever[0] -
          state.angularVelocity[0] * lever[2],
        state.velocity[2] +
          state.angularVelocity[0] * lever[1] -
          state.angularVelocity[1] * lever[0],
      ];
      const closing = strutClosingSpeed(mountVelocity, axisWorld, [0, 1, 0]);
      const reaction = strutReaction(
        strut,
        { distance, normal: [0, 1, 0] },
        closing,
        STEP,
      );
      deepest = Math.max(deepest, reaction.compression);
      bottomedOut = bottomedOut || reaction.bottomedOut;
      if (reaction.load <= 0) continue;
      // Реакция идёт по нормали опоры, а не по оси стойки: ногу держат ещё
      // цапфа и подкос, и на машину приходит только то, что дал грунт.
      forces.push({
        force: [0, reaction.load, 0],
        point: [
          mountWorld[0] + axisWorld[0] * distance,
          mountWorld[1] + axisWorld[1] * distance,
          mountWorld[2] + axisWorld[2] * distance,
        ],
      });
    }
    const stepped = stepBody({ ...state, position: centre }, vehicleMass, forces, damping, STEP);
    state = {
      ...stepped,
      position: stepped.position.map(
        (value, axis) => value - vehicleMass.centre[axis],
      ),
    };
  }
  assert.equal(bottomedOut, false, "полутора метров в секунду не хватает на упор");
  assert.ok(deepest > struts[0].staticSag, "стойки обязаны были сработать");
  // Машина вернулась в авторскую позу: ноль по всем осям с точностью до
  // сантиметра, и никакого остаточного крена.
  assert.ok(
    Math.abs(state.position[1]) < 0.01,
    `осталась на ${state.position[1].toFixed(4)} м от авторской высоты`,
  );
  assert.ok(Math.hypot(...state.velocity) < 0.02, "не успокоилась");
  assert.ok(Math.hypot(...state.angularVelocity) < 0.02, "качается");
  assert.ok(Math.abs(state.orientation[0]) < 0.01 && Math.abs(state.orientation[2]) < 0.01);
});
