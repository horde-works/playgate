import assert from "node:assert/strict";
import test from "node:test";
import { astanaScene } from "../games/make-a-mess/src/game/astanaScene.ts";
import {
  RING_RADIUS,
  TRAIN_LENGTH,
  astanaStations,
  ringPathPoint,
  stationDistance,
} from "../games/make-a-mess/src/content/scenes/astana/astanaPlan.ts";
import {
  DOORWAYS,
  LIFT_FROM_T,
  LIFT_HALF,
  LIFT_LANE,
  LIFT_TO_T,
  PLATFORM_LENGTH,
  PLATFORM_Y,
  STATION_ACCESS_PROFILE_SEGMENTS,
  STATION_ACCESS_SHELL_RIBS,
  STATION_ENTRANCE_PORTAL_FRAMES,
  STATION_LIGHT_COLOR,
  STATION_SHELL_PROFILE_SEGMENTS,
  STATION_SHELL_PROTOTYPE,
  STATION_SHELL_RIBS,
  STATION_SHELL_ENTRY_FROM_T,
  STATION_SHELL_ENTRY_TO_T,
  STATION_SHELL_ENTRY_TOP,
} from "../games/make-a-mess/src/content/scenes/astana/astanaStation.ts";

const pieces = astanaScene.breakablePieces;
const ofStation = (station, part) =>
  pieces.filter((piece) => piece.id.includes(`:${station}:`) && piece.id.includes(part));

const stationFrame = (station) => {
  const distance = stationDistance(station.compass);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const length = Math.hypot(ahead[0] - behind[0], ahead[1] - behind[1]);
  const radius = Math.hypot(station.center[0], station.center[1]);
  return {
    along: [(ahead[0] - behind[0]) / length, (ahead[1] - behind[1]) / length],
    inward: [-station.center[0] / radius, -station.center[1] / radius],
  };
};

const stationLocal = (station, piece) => {
  const frame = stationFrame(station);
  const dx = piece.position[0] - station.center[0];
  const dz = piece.position[2] - station.center[1];
  return {
    t: dx * frame.along[0] + dz * frame.along[1],
    w: dx * frame.inward[0] + dz * frame.inward[1],
  };
};

test("all four stations are built to one drawing", () => {
  // Вердикт заказчика: станции типовые. Значит опись деталей у всех четырёх
  // совпадает до штуки — расхождение означает, что одну где-то упростили.
  const inventories = astanaStations.map((station) => {
    const counts = new Map();
    for (const piece of pieces) {
      if (!piece.id.includes(`:${station.id}:`)) {
        continue;
      }
      // Отбрасываем имя станции и номера — остаётся род детали.
      const kind = piece.id
        .replace(`:${station.id}:`, ":")
        .replace(/:\d+/g, ":N");
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return counts;
  });

  const [reference] = inventories;
  assert.ok(reference.size > 40, `родов деталей на станции: ${reference.size}`);
  for (let index = 1; index < inventories.length; index += 1) {
    const other = inventories[index];
    assert.deepEqual(
      [...other].sort(),
      [...reference].sort(),
      `станция ${astanaStations[index].id} собрана не по типовому чертежу`,
    );
  }
});

test("the platform is a single one, and always on the inner side", () => {
  // В отличие от оригинала платформа одна и смотрит в центр острова: путь
  // односторонний, и всё, что относится к посадке, обязано быть внутри
  // кольца. Проверяется по радиусу: платформа ближе к центру, чем путь.
  for (const station of astanaStations) {
    const slabs = ofStation(station.id, ":slab:");
    assert.ok(slabs.length >= 5, `${station.id}: плита платформы секциями`);
    const trackRadius = Math.hypot(station.center[0], station.center[1]);
    for (const slab of slabs) {
      const radius = Math.hypot(slab.position[0], slab.position[2]);
      assert.ok(
        radius < trackRadius,
        `${slab.id} оказалась снаружи кольца: ${radius.toFixed(1)} при пути ${trackRadius.toFixed(1)}`,
      );
    }
    // Ни одной детали станции по внешнюю сторону пути дальше габарита опоры.
    for (const piece of pieces.filter((item) => item.id.includes(`:${station.id}:`))) {
      const radius = Math.hypot(piece.position[0], piece.position[2]);
      assert.ok(
        radius < RING_RADIUS + 4,
        `${piece.id} вылез наружу кольца: ${radius.toFixed(1)}`,
      );
    }
  }
});

test("the screen doors line up with the train, and the platform outlasts it", () => {
  // Платформа длиннее состава на четыре метра — это допуск на точность
  // остановки, ради которого и стоят балисы.
  assert.equal(PLATFORM_LENGTH, TRAIN_LENGTH + 4);
  for (const station of astanaStations) {
    const leaves = ofStation(station.id, ":psd:leaf:");
    assert.equal(leaves.length, DOORWAYS * 2, `${station.id}: по две створки на проём`);
    const posts = ofStation(station.id, ":psd:mullion:");
    assert.equal(posts.length, DOORWAYS + 1, `${station.id}: стойка на каждый край проёма`);
    for (const leaf of leaves) {
      assert.ok(
        leaf.position[1] > PLATFORM_Y && leaf.position[1] < PLATFORM_Y + 2.6,
        `${leaf.id} висит не на уровне дверей вагона`,
      );
    }
  }
});

test("the platform climate wall reaches both ends and seals against the roof", () => {
  for (const station of astanaStations) {
    const topBelts = ofStation(station.id, ":psd:top:");
    const endWalls = ofStation(station.id, ":psd:end-wall:");
    const endPosts = ofStation(station.id, ":psd:end-mullion:");
    const endHeaders = ofStation(station.id, ":psd:end-header:");
    const headers = ofStation(station.id, ":psd:header:");
    const canopyRoofs = ofStation(station.id, ":roof:");
    assert.equal(topBelts.length, 1);
    assert.equal(endWalls.length, 2, `${station.id}: торцевые дыры стены не закрыты`);
    assert.equal(endPosts.length, 2, `${station.id}: у торцов нет крайних стоек`);
    assert.equal(endHeaders.length, 2, `${station.id}: верх торцевых секций открыт`);
    assert.ok(canopyRoofs.length >= 6);

    const topBelt = topBelts[0];
    const beltLocal = stationLocal(station, topBelt);
    assert.ok(Math.abs(beltLocal.t) < 1e-9);
    assert.ok(Math.abs(topBelt.size[0] - PLATFORM_LENGTH) < 1e-9,
      `${station.id}: верхний пояс не дошёл до краёв платформы`);
    assert.ok(Math.abs(beltLocal.t - topBelt.size[0] / 2 + PLATFORM_LENGTH / 2) < 1e-9);
    assert.ok(Math.abs(beltLocal.t + topBelt.size[0] / 2 - PLATFORM_LENGTH / 2) < 1e-9);

    const wallEdges = endWalls.flatMap((piece) => {
      const local = stationLocal(station, piece);
      return [local.t - piece.size[0] / 2, local.t + piece.size[0] / 2];
    });
    assert.ok(Math.abs(Math.min(...wallEdges) + PLATFORM_LENGTH / 2) < 1e-9,
      `${station.id}: стекло не дошло до начала платформы`);
    assert.ok(Math.abs(Math.max(...wallEdges) - PLATFORM_LENGTH / 2) < 1e-9,
      `${station.id}: стекло не дошло до конца платформы`);

    const postEdges = endPosts.flatMap((piece) => {
      const local = stationLocal(station, piece);
      return [local.t - piece.size[0] / 2, local.t + piece.size[0] / 2];
    });
    assert.ok(Math.abs(Math.min(...postEdges) + PLATFORM_LENGTH / 2) < 1e-9);
    assert.ok(Math.abs(Math.max(...postEdges) - PLATFORM_LENGTH / 2) < 1e-9);

    const beltBottom = topBelt.position[1] - topBelt.size[1] / 2;
    const beltTop = topBelt.position[1] + topBelt.size[1] / 2;
    const roofBottom = Math.min(...canopyRoofs.map((piece) =>
      piece.position[1] - piece.size[1] / 2));
    assert.ok(Math.abs(beltTop - roofBottom) < 1e-9,
      `${station.id}: верхний зазор стены ${roofBottom - beltTop} м`);
    for (const header of [...headers, ...endHeaders]) {
      assert.ok(Math.abs(header.position[1] + header.size[1] / 2 - beltBottom) < 1e-9,
        `${station.id}: щель между перемычкой и верхним поясом`);
    }
    for (const wall of endWalls) {
      assert.ok(Math.abs(
        wall.position[1] + wall.size[1] / 2
          - (endHeaders[0].position[1] - endHeaders[0].size[1] / 2),
      ) < 1e-9, `${station.id}: щель над торцевым стеклом`);
    }
  }
});

test("the platform entrance is clear of benches and bins", () => {
  for (const station of astanaStations) {
    const benches = ofStation(station.id, ":bench:");
    const benchLegs = ofStation(station.id, ":bench-leg:");
    const bins = ofStation(station.id, ":bin:");
    assert.equal(benches.length, 2, `${station.id}: удалена лишняя лавка`);
    assert.equal(benchLegs.length, 4, `${station.id}: у лавок неверное число ножек`);
    assert.equal(bins.length, 2, `${station.id}: удалена лишняя урна`);
    for (const fixture of [...benches, ...benchLegs, ...bins]) {
      const t = stationLocal(station, fixture).t;
      assert.ok(t <= STATION_SHELL_ENTRY_FROM_T || t >= STATION_SHELL_ENTRY_TO_T,
        `${station.id}: ${fixture.id} снова стоит в горловине входа`);
    }
  }
});

test("the climb is one continuous core, and every way up exists", () => {
  // Схема сменилась по итогам аудита проходимости: разнесённый мезонин с
  // разворотом заменён ОДНИМ непрерывным ядром вдоль платформы. Настоящая
  // станция линии двухэтажная и читается одной фразой — касса и турникеты
  // внизу, платформа наверху, между ними одна видимая группа подъёма.
  for (const station of astanaStations) {
    for (const flight of ["stair", "escalator"]) {
      const steps = ofStation(station.id, `:${flight}:step:`);
      assert.ok(steps.length >= 40, `${station.id}: у марша ${flight} ступеней ${steps.length}`);
      const heights = steps.map((step) => step.position[1]);
      // Один марш забирает весь подъём: от пола вестибюля до платформы.
      assert.ok(
        Math.max(...heights) - Math.min(...heights) > 10,
        `${station.id}: марш ${flight} не забирает подъём целиком`,
      );
    }
    // Верхняя площадка вровень с платформой и примыкает к её задней кромке.
    // Тамбур — ровно две осмысленные плиты: продольная у платформы и вторая
    // перед выходом лифта. Автоматическая нарезка вокруг шахты запрещена.
    const deck = ofStation(station.id, ":deck:slab:");
    assert.equal(deck.length, 2, `${station.id}: верхний тамбур снова раздроблен`);
    assert.equal(ofStation(station.id, ":deck-lift:").length, 0);
    for (const slab of deck) {
      assert.ok(Math.abs(slab.position[1] + 0.22 - PLATFORM_Y) < 0.01);
    }
    // Лифт — объект с полом и потолком, а не сплошной блок.
    assert.equal(ofStation(station.id, ":lift-floor").length, 1);
    assert.equal(ofStation(station.id, ":lift-ceiling").length, 1);
    assert.equal(ofStation(station.id, ":lift-call").length, 1);
    // Линия оплаты: барьер с проходами, и один из них широкий.
    assert.ok(ofStation(station.id, ":fare-barrier:").length >= 3);
    const gatePieces = ofStation(station.id, ":gate:");
    assert.equal(gatePieces.length, 8, "по две тумбы на проход");
    for (let gate = 0; gate < 4; gate += 1) {
      const pair = gatePieces.filter((piece) => piece.id.includes(`:gate:${gate}:`))
        .sort((left, right) => stationLocal(station, left).t - stationLocal(station, right).t);
      assert.equal(pair.length, 2);
      const clear = stationLocal(station, pair[1]).t - stationLocal(station, pair[0]).t
        - pair[0].size[0] / 2 - pair[1].size[0] / 2;
      assert.ok(clear >= 1, `${station.id}: проход ${gate} между турникетами ${clear} м`);
    }
    assert.equal(ofStation(station.id, ":gate-light:").length, 0,
      "зелёная перекладина снова перекрывает проход турникета");
  }
});

test("the entrance is an opening, not a pane of glass", () => {
  // Первый и достаточный стоппер прошлой сборки: все шесть пролётов фасада
  // были заполнены стеклом, и станция начиналась с непроходимой стены.
  for (const station of astanaStations) {
    const mullions = ofStation(station.id, ":hall-mullion:");
    const panes = ofStation(station.id, ":hall-glass:");
    assert.equal(mullions.length, 8);
    assert.equal(panes.length, 6);
    const distance = stationDistance(station.compass);
    const ahead = ringPathPoint(distance + 1);
    const behind = ringPathPoint(distance - 1);
    const length = Math.hypot(ahead[0] - behind[0], ahead[1] - behind[1]);
    const along = [(ahead[0] - behind[0]) / length, (ahead[1] - behind[1]) / length];
    const postTs = mullions.map((piece) =>
      (piece.position[0] - station.center[0]) * along[0]
        + (piece.position[2] - station.center[1]) * along[1])
      .sort((left, right) => left - right);
    const clearSpans = postTs.slice(0, -1).map((from, index) => postTs[index + 1] - from);
    assert.ok(Math.max(...clearSpans) > 3.1,
      `${station.id}: стойки снова стоят внутри дверного проёма`);
    assert.equal(ofStation(station.id, ":hall-lintel").length, 1);
    assert.equal(ofStation(station.id, ":hall-door:").length, 2);
  }
});

test("nothing on a station starts unsupported", () => {
  assert.equal(astanaScene.resolveStructuralCollapse(new Set()).size, 0);
});

test("the first station alone carries the acceptance shell", () => {
  const shell = pieces.filter((piece) =>
    piece.id.includes(":prototype-zhibek-zholy-shell:"));
  assert.ok(shell.length > 400, `наружный корпус слишком неполон: ${shell.length} деталей`);

  const arches = shell.filter((piece) =>
    /:prototype-zhibek-zholy-shell:rib:\d+:arch:\d+:piece$/.test(piece.id));
  const legs = shell.filter((piece) =>
    /:prototype-zhibek-zholy-shell:rib:\d+:leg:(outer|inner):piece$/.test(piece.id));
  const purlins = shell.filter((piece) => /:roof-purlin:\d+:\d+:piece$/.test(piece.id));
  const skin = shell.filter((piece) =>
    /:prototype-zhibek-zholy-shell:roof-skin:\d+:\d+:piece$/.test(piece.id));
  assert.equal(arches.length, STATION_SHELL_RIBS * STATION_SHELL_PROFILE_SEGMENTS);
  assert.equal(legs.length, STATION_SHELL_RIBS * 2);
  assert.equal(
    purlins.length,
    (STATION_SHELL_RIBS - 1) * (STATION_SHELL_PROFILE_SEGMENTS - 1),
  );
  assert.equal(
    skin.length,
    (STATION_SHELL_RIBS - 1) * STATION_SHELL_PROFILE_SEGMENTS,
  );

  const prototype = astanaStations.find((station) => station.id === STATION_SHELL_PROTOTYPE);
  assert.ok(prototype, "приёмочная станция должна существовать в плане");
  const centre = shell.reduce(
    (sum, piece) => [sum[0] + piece.position[0], sum[1] + piece.position[2]],
    [0, 0],
  ).map((sum) => sum / shell.length);
  const nearest = astanaStations.reduce((best, station) => {
    const distance = Math.hypot(centre[0] - station.center[0], centre[1] - station.center[1]);
    return distance < best.distance ? { station, distance } : best;
  }, { station: astanaStations[0], distance: Number.POSITIVE_INFINITY });
  assert.equal(nearest.station.id, STATION_SHELL_PROTOTYPE,
    "опытный корпус оказался не на первой станции");
});

test("every rendered station rib is one exact continuous arch", () => {
  // Проверяем конечную геометрию после компиляции. Локальная ось +y детали
  // преобразуется тем же R = Rx·Ry·Rz, которым пользуется сцена.
  const renderedYAxis = (rotation) => {
    const [rx, ry, rz] = rotation;
    const sx = Math.sin(rx);
    const cx = Math.cos(rx);
    const sy = Math.sin(ry);
    const cy = Math.cos(ry);
    const sz = Math.sin(rz);
    const cz = Math.cos(rz);
    return [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz];
  };
  const endcaps = (piece) => {
    const axis = renderedYAxis(piece.rotation);
    return [-1, 1].map((sign) => piece.position.map((value, dimension) =>
      value + sign * axis[dimension] * piece.size[1] / 2));
  };
  const gap = (left, right) => Math.min(...endcaps(left).flatMap((a) =>
    endcaps(right).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))));
  const shellPart = (part) => pieces.find((piece) =>
    piece.id.includes(`:prototype-zhibek-zholy-shell:${part}:piece`));

  for (let rib = 0; rib < STATION_SHELL_RIBS; rib += 1) {
    const outerLeg = shellPart(`rib:${rib}:leg:outer`);
    const innerLeg = shellPart(`rib:${rib}:leg:inner`);
    const arch = Array.from({ length: STATION_SHELL_PROFILE_SEGMENTS }, (_, segment) =>
      shellPart(`rib:${rib}:arch:${segment}`));
    assert.ok(outerLeg && innerLeg && arch.every(Boolean), `ребро ${rib} собрано не полностью`);
    const chain = [outerLeg, ...arch, innerLeg];
    for (let joint = 0; joint + 1 < chain.length; joint += 1) {
      const distance = gap(chain[joint], chain[joint + 1]);
      assert.ok(distance < 1e-8,
        `ребро ${rib}, стык ${joint}: торцы расходятся на ${distance} м`);
    }
  }
});

test("the two roof rims form opposite waves", () => {
  const rim = (side, bay) => pieces.find((piece) =>
    piece.id.includes(`:prototype-zhibek-zholy-shell:wave-rim:${side}:${bay}:piece`));
  const lastBay = STATION_SHELL_RIBS - 2;
  const outerStart = rim("outer", 0);
  const outerEnd = rim("outer", lastBay);
  const innerStart = rim("inner", 0);
  const innerEnd = rim("inner", lastBay);
  assert.ok(outerStart && outerEnd && innerStart && innerEnd);
  assert.ok(outerStart.position[1] - outerEnd.position[1] > 2,
    "наружная кромка не опускается вдоль станции");
  assert.ok(innerEnd.position[1] - innerStart.position[1] > 2,
    "внутренняя кромка не поднимается навстречу наружной");
});

test("the platform climate wall has a real framed entrance", () => {
  const prototype = astanaStations.find((station) => station.id === STATION_SHELL_PROTOTYPE);
  assert.ok(prototype);
  const distance = stationDistance(prototype.compass);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const length = Math.hypot(ahead[0] - behind[0], ahead[1] - behind[1]);
  const along = [(ahead[0] - behind[0]) / length, (ahead[1] - behind[1]) / length];
  const localT = (piece) =>
    (piece.position[0] - prototype.center[0]) * along[0]
      + (piece.position[2] - prototype.center[1]) * along[1];
  const renderedYAxis = (rotation) => {
    const [rx, ry, rz] = rotation;
    const sx = Math.sin(rx);
    const cx = Math.cos(rx);
    const sy = Math.sin(ry);
    const cy = Math.cos(ry);
    const sz = Math.sin(rz);
    const cz = Math.cos(rz);
    return [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz];
  };
  const lowerCapY = (piece) => {
    const axis = renderedYAxis(piece.rotation);
    return Math.min(
      piece.position[1] - axis[1] * piece.size[1] / 2,
      piece.position[1] + axis[1] * piece.size[1] / 2,
    );
  };

  const shell = pieces.filter((piece) =>
    piece.id.includes(":prototype-zhibek-zholy-shell:"));
  const transomPanes = shell.filter((piece) =>
    piece.id.includes(":side:inner:")
      && localT(piece) > STATION_SHELL_ENTRY_FROM_T
      && localT(piece) < STATION_SHELL_ENTRY_TO_T);
  assert.ok(transomPanes.length >= 3, "над входом нет климатической фрамуги");
  assert.ok(transomPanes.every((piece) => lowerCapY(piece) >= STATION_SHELL_ENTRY_TOP - 0.08),
    "боковое стекло снова перекрыло вход в климатическую зону");

  assert.equal(shell.filter((piece) => piece.id.includes(":access:collar:jamb:")).length, 2);
  assert.equal(shell.filter((piece) => piece.id.includes(":access:collar:header:")).length, 1);
  assert.equal(shell.filter((piece) => piece.id.includes(":entry:")).length, 0,
    "короткий приставной козырёк не был удалён");
});

test("the stair climb is enclosed by one sloping shell with an open street portal", () => {
  const shell = pieces.filter((piece) =>
    piece.id.includes(":prototype-zhibek-zholy-shell:"));
  const accessArches = shell.filter((piece) =>
    /:access:rib:\d+:arch:\d+:piece$/.test(piece.id));
  const accessLegs = shell.filter((piece) =>
    /:access:rib:\d+:leg:(inner|outer):piece$/.test(piece.id));
  const accessRoof = shell.filter((piece) => piece.id.includes(":access:roof-skin:"));
  const accessCeiling = shell.filter((piece) => piece.id.includes(":access:ceiling-skin:"));
  assert.equal(
    accessArches.length,
    STATION_ACCESS_SHELL_RIBS * STATION_ACCESS_PROFILE_SEGMENTS,
  );
  assert.equal(accessLegs.length, STATION_ACCESS_SHELL_RIBS * 2);
  assert.equal(
    accessRoof.length,
    (STATION_ACCESS_SHELL_RIBS - 1) * STATION_ACCESS_PROFILE_SEGMENTS,
  );
  assert.equal(accessCeiling.length, accessRoof.length,
    "у наклонной кровли отсутствует повторяющая её внутренняя подшивка");
  const rampSlab = shell.filter((piece) => piece.id.includes(":access:ramp-slab:"));
  assert.equal(rampSlab.length, 1);
  assert.ok(rampSlab[0].size[2] > 5.8,
    "лестница и эскалатор снова стоят на раздельных основаниях");

  const landing = ofStation(STATION_SHELL_PROTOTYPE, ":deck:slab:");
  assert.equal(landing.length, 2,
    "верхний тамбур должен состоять ровно из двух несущих плит");
  assert.equal(ofStation(STATION_SHELL_PROTOTYPE, ":deck-lift:").length, 0,
    "лифт снова пристроен отдельным отростком за пределами тамбура");
  const mushroom = ofStation(STATION_SHELL_PROTOTYPE, ":deck:column:");
  assert.equal(mushroom.length, 4, "под тамбуром должен быть один ствол с тремя лепестками");
  assert.equal(mushroom.filter((piece) => piece.shape === "cylinder").length, 1,
    "у грибовидной опоры должен быть один ствол");
  assert.equal(mushroom.filter((piece) => piece.shape === "panel").length, 3,
    "у грибовидной опоры должно быть ровно три лепестка");

  const topEnd = shell.filter((piece) => piece.id.includes(":access:end:top:"));
  const groundEnd = shell.filter((piece) => piece.id.includes(":access:end:ground:"));
  assert.equal(topEnd.length, STATION_ACCESS_PROFILE_SEGMENTS * 3 * 3,
    "у предварительного тамбура нет заднего витража");
  assert.equal(groundEnd.length, topEnd.length);

  const portalArches = shell.filter((piece) =>
    /:portal:rib:\d+:arch:\d+:piece$/.test(piece.id));
  const portalLegs = shell.filter((piece) =>
    /:portal:rib:\d+:leg:(a|b):piece$/.test(piece.id));
  const portalRoof = shell.filter((piece) => piece.id.includes(":portal:roof-skin:"));
  const portalCheeks = shell.filter((piece) => piece.id.includes(":portal:cheek:"));
  assert.equal(
    portalArches.length,
    STATION_ENTRANCE_PORTAL_FRAMES * STATION_ACCESS_PROFILE_SEGMENTS,
  );
  assert.equal(portalLegs.length, STATION_ENTRANCE_PORTAL_FRAMES * 2);
  assert.equal(
    portalRoof.length,
    (STATION_ENTRANCE_PORTAL_FRAMES - 1) * STATION_ACCESS_PROFILE_SEGMENTS,
  );
  assert.equal(portalCheeks.length, (STATION_ENTRANCE_PORTAL_FRAMES - 1) * 2 * 3);
  assert.equal(shell.filter((piece) => piece.id.includes(":portal:end-glass:")).length, 0,
    "уличный портал снова закрыт торцевым стеклом");

  const archAt = (rib, segment) => shell.find((piece) =>
    piece.id.includes(`:access:rib:${rib}:arch:${segment}:piece`));
  const topApex = archAt(2, Math.floor(STATION_ACCESS_PROFILE_SEGMENTS / 2));
  const footApex = archAt(8, Math.floor(STATION_ACCESS_PROFILE_SEGMENTS / 2));
  assert.ok(topApex && footApex);
  assert.ok(topApex.position[1] - footApex.position[1] > 8,
    "кровля подъёма не следует за перепадом лестницы");

  const prototypeCanopy = ofStation(STATION_SHELL_PROTOTYPE, ":hall-canopy");
  assert.equal(prototypeCanopy.length, 1);
  assert.ok(prototypeCanopy[0].size[2] <= 0.6,
    "прежний плоский наружный навес остался перед порталом");

  const boardArms = ofStation(STATION_SHELL_PROTOTYPE, ":board-arm:");
  assert.ok(boardArms.every((piece) =>
    piece.position[1] + piece.size[1] / 2 <= PLATFORM_Y + 3.16),
  "подвесное оборудование снова пробивает низкую кровлю платформы");
});

test("every access and entrance rib has exact shared endpoints", () => {
  const renderedYAxis = (rotation) => {
    const [rx, ry, rz] = rotation;
    const sx = Math.sin(rx);
    const cx = Math.cos(rx);
    const sy = Math.sin(ry);
    const cy = Math.cos(ry);
    const sz = Math.sin(rz);
    const cz = Math.cos(rz);
    return [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz];
  };
  const endcaps = (piece) => {
    const axis = renderedYAxis(piece.rotation);
    return [-1, 1].map((sign) => piece.position.map((value, dimension) =>
      value + sign * axis[dimension] * piece.size[1] / 2));
  };
  const gap = (left, right) => Math.min(...endcaps(left).flatMap((a) =>
    endcaps(right).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))));
  const shellPart = (part) => pieces.find((piece) =>
    piece.id.includes(`:prototype-zhibek-zholy-shell:${part}:piece`));

  const verify = (prefix, ribs) => {
    for (let rib = 0; rib < ribs; rib += 1) {
      const left = shellPart(`${prefix}:rib:${rib}:leg:${prefix === "access" ? "inner" : "a"}`);
      const right = shellPart(`${prefix}:rib:${rib}:leg:${prefix === "access" ? "outer" : "b"}`);
      const arch = Array.from({ length: STATION_ACCESS_PROFILE_SEGMENTS }, (_, segment) =>
        shellPart(`${prefix}:rib:${rib}:arch:${segment}`));
      assert.ok(left && right && arch.every(Boolean), `${prefix}: рама ${rib} неполна`);
      const chain = [left, ...arch, right];
      for (let joint = 0; joint + 1 < chain.length; joint += 1) {
        const distance = gap(chain[joint], chain[joint + 1]);
        assert.ok(distance < 1e-8,
          `${prefix}: рама ${rib}, стык ${joint} расходится на ${distance} м`);
      }
    }
  };

  verify("access", STATION_ACCESS_SHELL_RIBS);
  verify("portal", STATION_ENTRANCE_PORTAL_FRAMES);
});

test("the inner ceiling and end glazing stay inside the decorative shell", () => {
  const innerRoof = ofStation(STATION_SHELL_PROTOTYPE, ":roof:");
  assert.equal(innerRoof.length, 6);
  assert.ok(innerRoof.every((piece) => piece.size[2] <= 5.01),
    "внутренний потолок снова шире климатической оболочки");
  assert.ok(innerRoof.every((piece) => piece.position[1] + piece.size[1] / 2 < PLATFORM_Y + 3.7),
    "внутренний потолок снова пробивает низкую кромку волны");

  const shell = pieces.filter((piece) =>
    piece.id.includes(":prototype-zhibek-zholy-shell:"));
  const entranceLining = shell.filter((piece) =>
    piece.id.includes(":entrance-lining:ceiling:"));
  const entranceFascia = shell.filter((piece) =>
    piece.id.includes(":entrance-lining:fascia:"));
  assert.equal(entranceLining.length, 16,
    "нижняя грань плиты вестибюля зашита не полностью");
  assert.equal(entranceFascia.length, 4,
    "торцы плиты вестибюля остались открыты");
  assert.ok(entranceLining.every((piece) =>
    piece.material === "steel"
      && ["#d9dde1", "#cbd1d6"].includes(piece.color)
      && piece.size[1] <= 0.08),
  "подшивка должна состоять из тонких серых металлических кассет");
  assert.equal(shell.filter((piece) =>
    piece.id.includes(":entrance-lining:sign-rail:")).length, 1);

  const endPanes = shell.filter((piece) => piece.id.includes(":end-glass:"));
  assert.ok(endPanes.length >= STATION_SHELL_PROFILE_SEGMENTS * 6,
    "торцевое стекло не нарезано по кривой арки");
  assert.ok(endPanes.every((piece) => piece.size[0] < 0.6),
    "широкая торцевая панель снова может высунуть угол за арку");
});

test("the platform end corners and curved gables are completely closed", () => {
  const prototype = astanaStations.find((station) => station.id === STATION_SHELL_PROTOTYPE);
  assert.ok(prototype);
  const shell = pieces.filter((piece) =>
    piece.id.includes(":prototype-zhibek-zholy-shell:"));
  const endPanes = shell.filter((piece) => piece.id.includes(":end-glass:"));
  const fascias = shell.filter((piece) => piece.id.includes(":end-roof-fascia:"));
  const cornerReturns = shell.filter((piece) => piece.id.includes(":platform-corner-return:"));
  const cornerPosts = shell.filter((piece) => piece.id.includes(":platform-corner-post:"));
  const upperPortalJambs = shell.filter((piece) =>
    piece.id.includes(":track-portal:") && piece.id.includes(":upper-"));

  assert.ok(endPanes.length >= STATION_SHELL_PROFILE_SEGMENTS * 12 * 2,
    "торцевой фронтон снова нарезан крупными прямоугольниками");
  assert.ok(endPanes.every((piece) => piece.size[0] <= 0.13),
    "клин между прямоугольным стеклом и кривой кровлей снова видим");
  assert.equal(fascias.length, endPanes.length,
    "не каждый верхний клин торцевого стекла закрыт фасцией");
  assert.ok(fascias.every((piece) => piece.color === "#cbd1d6" && piece.size[2] === 0.22),
    "фасция торца должна быть тонкой серой подшивкой");
  assert.equal(cornerReturns.length, 2,
    "верхние углы продольной стены не замкнуты стеклянными возвратами");
  assert.equal(cornerPosts.length, 2,
    "в линии сгиба торцевого и продольного стекла нет стоек");
  assert.equal(upperPortalJambs.length, 4,
    "стойки поездных порталов не доведены до ската");

  const renderedYAxis = (rotation) => {
    const [rx, ry, rz] = rotation;
    const sx = Math.sin(rx);
    const cx = Math.cos(rx);
    const sy = Math.sin(ry);
    const cy = Math.cos(ry);
    const sz = Math.sin(rz);
    const cz = Math.cos(rz);
    return [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz];
  };
  const endcaps = (piece) => {
    const axis = renderedYAxis(piece.rotation);
    return [-1, 1].map((sign) => piece.position.map((value, dimension) =>
      value + sign * axis[dimension] * piece.size[1] / 2));
  };
  const gap = (left, right) => Math.min(...endcaps(left).flatMap((a) =>
    endcaps(right).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))));

  for (const end of ["a", "b"]) {
    const chain = fascias.filter((piece) => piece.id.includes(`:end-roof-fascia:${end}:`))
      .sort((left, right) => stationLocal(prototype, right).w - stationLocal(prototype, left).w);
    assert.ok(chain.length >= STATION_SHELL_PROFILE_SEGMENTS * 12);
    for (let index = 0; index + 1 < chain.length; index += 1) {
      assert.ok(gap(chain[index], chain[index + 1]) < 1e-8,
        `фасция торца ${end} расходится в стыке ${index}`);
    }
  }

  for (const corner of cornerReturns) {
    const axis = renderedYAxis(corner.rotation);
    const lowerY = Math.min(
      corner.position[1] - axis[1] * corner.size[1] / 2,
      corner.position[1] + axis[1] * corner.size[1] / 2,
    );
    assert.ok(Math.abs(lowerY - (PLATFORM_Y + 3.25)) < 1e-6,
      "стеклянный угловой возврат не начинается от верхнего пояса стены");
  }
});

test("the lift shaft is glazed continuously on all four sides", () => {
  for (const station of astanaStations) {
    const sidePanes = [
      ...ofStation(station.id, ":lift-glass:o:"),
      ...ofStation(station.id, ":lift-glass:i:"),
    ];
    const topEnd = ofStation(station.id, ":lift-glass:end-top:");
    const groundEnd = ofStation(station.id, ":lift-glass:end-ground:");
    const upper = ofStation(station.id, ":lift-glass:upper:");
    assert.equal(sidePanes.length, 8, `${station.id}: неполны боковые стены лифта`);
    assert.equal(topEnd.length, 4, `${station.id}: нет заднего стекла лифта`);
    assert.equal(groundEnd.length, 3, `${station.id}: нет переднего стекла над дверью`);
    assert.equal(upper.length, 3,
      `${station.id}: верх лифта должен иметь две боковые и одну заднюю стенку`);
    assert.ok(upper.every((piece) => !piece.id.includes(":front")),
      `${station.id}: верхний выход лифта снова закрыт стеклом`);

    const liftCentreT = (LIFT_FROM_T + LIFT_TO_T) / 2;
    const landing = ofStation(station.id, ":deck:slab:");
    assert.ok(landing.every((piece) => {
      const local = stationLocal(station, piece);
      return Math.abs(local.t - liftCentreT) >= piece.size[0] / 2
        || Math.abs(local.w - LIFT_LANE) >= piece.size[2] / 2;
    }), `${station.id}: плита перекрыла вырез шахты лифта`);
    assert.ok(LIFT_LANE - LIFT_HALF > 13 && LIFT_LANE + LIFT_HALF < 17,
      `${station.id}: лифт снова вышел за габарит верхнего тамбура`);

    for (const panes of [
      ofStation(station.id, ":lift-glass:o:"),
      ofStation(station.id, ":lift-glass:i:"),
      topEnd,
    ]) {
      const ordered = [...panes].sort((left, right) => left.position[1] - right.position[1]);
      for (let index = 0; index + 1 < ordered.length; index += 1) {
        const upper = ordered[index].position[1] + ordered[index].size[1] / 2;
        const lower = ordered[index + 1].position[1] - ordered[index + 1].size[1] / 2;
        assert.ok(Math.abs(upper - lower) < 1e-9,
          `${station.id}: щель между поясами лифта ${index} равна ${lower - upper} м`);
      }
    }
  }
});

test("the upper vestibule is two non-overlapping slabs on one three-petal support", () => {
  const renderedYAxis = (rotation) => {
    const [rx, ry, rz] = rotation;
    const sx = Math.sin(rx);
    const cx = Math.cos(rx);
    const sy = Math.sin(ry);
    const cy = Math.cos(ry);
    const sz = Math.sin(rz);
    const cz = Math.cos(rz);
    return [-cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz];
  };
  const endcaps = (piece) => {
    const axis = renderedYAxis(piece.rotation);
    return [-1, 1].map((sign) => piece.position.map((value, dimension) =>
      value + sign * axis[dimension] * piece.size[1] / 2));
  };
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  for (const station of astanaStations) {
    const slabs = ofStation(station.id, ":deck:slab:");
    assert.equal(slabs.length, 2, `${station.id}: тамбур не из двух плит`);
    const [mainSlab, liftSlab] = [...slabs].sort((left, right) => right.size[0] - left.size[0]);
    const mainLocal = stationLocal(station, mainSlab);
    const liftLocal = stationLocal(station, liftSlab);
    const mainOuter = mainLocal.w + mainSlab.size[2] / 2;
    const liftInner = liftLocal.w - liftSlab.size[2] / 2;
    assert.ok(Math.abs(mainOuter - liftInner) < 1e-9,
      `${station.id}: между двумя плитами щель ${liftInner - mainOuter} м`);
    assert.ok(Math.abs(liftLocal.t - liftSlab.size[0] / 2 - LIFT_TO_T) < 1e-9,
      `${station.id}: выход лифта не совпал с кромкой второй плиты`);
    assert.ok(slabs.every((slab) =>
      Math.abs(slab.position[1] + slab.size[1] / 2 - PLATFORM_Y) < 1e-9),
    `${station.id}: выход второго этажа не в уровне платформы`);

    const overlapT = Math.min(
      mainLocal.t + mainSlab.size[0] / 2,
      liftLocal.t + liftSlab.size[0] / 2,
    ) - Math.max(
      mainLocal.t - mainSlab.size[0] / 2,
      liftLocal.t - liftSlab.size[0] / 2,
    );
    const overlapW = Math.min(mainOuter, liftLocal.w + liftSlab.size[2] / 2)
      - Math.max(mainLocal.w - mainSlab.size[2] / 2, liftInner);
    assert.ok(overlapT <= 1e-9 || overlapW <= 1e-9,
      `${station.id}: плиты перекрываются и дадут рябь текстуры`);

    const support = ofStation(station.id, ":deck:column:");
    const stems = support.filter((piece) => piece.shape === "cylinder");
    const petals = support.filter((piece) => piece.shape === "panel");
    assert.equal(stems.length, 1, `${station.id}: у тамбура не один ствол`);
    assert.equal(petals.length, 3, `${station.id}: лепестков не три`);
    const lowerEnds = petals.map((petal) =>
      endcaps(petal).sort((left, right) => left[1] - right[1])[0]);
    assert.ok(lowerEnds.every((end) => distance(end, lowerEnds[0]) < 1e-8),
      `${station.id}: три лепестка не сходятся в одной голове ствола`);

    for (const petal of petals) {
      const upperEnd = endcaps(petal).sort((left, right) => right[1] - left[1])[0];
      const endpoint = stationLocal(station, { position: upperEnd });
      assert.ok(slabs.some((slab) => {
        const local = stationLocal(station, slab);
        return Math.abs(endpoint.t - local.t) < slab.size[0] / 2
          && Math.abs(endpoint.w - local.w) < slab.size[2] / 2
          && upperEnd[1] > slab.position[1] - slab.size[1] / 2
          && upperEnd[1] < slab.position[1] + slab.size[1] / 2;
      }), `${station.id}: лепесток не входит в несущую плиту`);
    }

    const posts = ofStation(station.id, ":lift-post:");
    assert.equal(posts.length, 4);
    const postTops = posts.map((post) => post.position[1] + post.size[1] / 2);
    assert.equal(new Set(postTops.map((top) => top.toFixed(6))).size, 4,
      `${station.id}: колонны лифта снова обрезаны одной высотой`);

    const infill = ofStation(station.id, ":lift-exit:outer-infill-beam:");
    assert.equal(infill.length, 1, `${station.id}: наружный разрыв шахты не зашит`);
    const infillLocal = stationLocal(station, infill[0]);
    assert.ok(Math.abs(infillLocal.t + infill[0].size[0] / 2 - LIFT_TO_T) < 1e-9,
      `${station.id}: балка наложена поверх пола вместо стыка`);
    assert.ok(Math.abs(
      infillLocal.w + infill[0].size[2] / 2
        - (liftLocal.w + liftSlab.size[2] / 2),
    ) < 1e-9, `${station.id}: балка не дошла до наружного стекла`);

    // Рябь возникает у двух горизонтальных поверхностей с одной высотой и
    // ненулевой общей площадью. Проверяем не только две плиты, а все тонкие
    // горизонтальные детали в полном пятне лифтового холла.
    const hallSurfaces = pieces.filter((piece) => {
      const rotation = piece.rotation ?? [0, 0, 0];
      if (!piece.id.includes(`:${station.id}:`)
        || Math.abs(rotation[0]) > 1e-9
        || Math.abs(rotation[2]) > 1e-9
        || piece.size[1] > 0.5) {
        return false;
      }
      const local = stationLocal(station, piece);
      return local.t > -22.5 && local.t < -13 && local.w > 6.5 && local.w < 18;
    });
    for (let left = 0; left < hallSurfaces.length; left += 1) {
      for (let right = left + 1; right < hallSurfaces.length; right += 1) {
        const a = hallSurfaces[left];
        const b = hallSurfaces[right];
        const aTop = a.position[1] + a.size[1] / 2;
        const bTop = b.position[1] + b.size[1] / 2;
        if (Math.abs(aTop - bTop) > 1e-7) {
          continue;
        }
        const aLocal = stationLocal(station, a);
        const bLocal = stationLocal(station, b);
        const commonT = Math.min(aLocal.t + a.size[0] / 2, bLocal.t + b.size[0] / 2)
          - Math.max(aLocal.t - a.size[0] / 2, bLocal.t - b.size[0] / 2);
        const commonW = Math.min(aLocal.w + a.size[2] / 2, bLocal.w + b.size[2] / 2)
          - Math.max(aLocal.w - a.size[2] / 2, bLocal.w - b.size[2] / 2);
        assert.ok(commonT <= 1e-7 || commonW <= 1e-7,
          `${station.id}: coplanar overlap ${a.id} / ${b.id}`);
      }
    }
  }
});

test("the train portals have sills and terminal glass stays behind the frames", () => {
  const prototype = astanaStations.find((station) => station.id === STATION_SHELL_PROTOTYPE);
  assert.ok(prototype);
  const distance = stationDistance(prototype.compass);
  const ahead = ringPathPoint(distance + 1);
  const behind = ringPathPoint(distance - 1);
  const length = Math.hypot(ahead[0] - behind[0], ahead[1] - behind[1]);
  const along = [(ahead[0] - behind[0]) / length, (ahead[1] - behind[1]) / length];
  const localT = (piece) =>
    (piece.position[0] - prototype.center[0]) * along[0]
      + (piece.position[2] - prototype.center[1]) * along[1];
  const shell = pieces.filter((piece) =>
    piece.id.includes(":prototype-zhibek-zholy-shell:"));
  const sills = shell.filter((piece) => piece.id.includes(":track-portal:")
    && piece.id.includes(":sill:"));
  assert.equal(sills.length, 4, "нижняя балка должна быть с двух сторон обоих торцов");

  const endPanes = shell.filter((piece) => piece.id.includes(":end-glass:"));
  assert.ok(endPanes.every((piece) => Math.abs(localT(piece)) <= PLATFORM_LENGTH / 2 - 0.15),
    "торцевое стекло снова стоит в лицевой плоскости рамы и выглядывает сбоку");

  const wallMap = ofStation(STATION_SHELL_PROTOTYPE, ":map-case");
  assert.equal(wallMap.length, 1);
  assert.ok(wallMap[0].size[2] <= 0.15 && wallMap[0].size[0] > 1,
    "схема линии снова стала отдельным столбиком на платформе");
});

test("platform finish meets by exact shared edges without overlaps or cracks", () => {
  const bayLength = PLATFORM_LENGTH / 5;
  const tileLength = bayLength / 4;
  for (const station of astanaStations) {
    const stationDeck = pieces.filter((piece) =>
      piece.id.includes(`:station-deck:${station.id}:`));
    const slabs = stationDeck.filter((piece) => piece.id.includes(":slab:"));
    const floors = stationDeck.filter((piece) => piece.id.includes(":floor:"));
    const tactile = stationDeck.filter((piece) => piece.id.includes(":tactile:"));
    assert.ok(slabs.every((piece) => Math.abs(piece.size[0] - bayLength) < 1e-9));
    assert.ok(floors.every((piece) => Math.abs(piece.size[0] - tileLength) < 1e-9));
    assert.ok(tactile.every((piece) => Math.abs(piece.size[0] - bayLength / 6) < 1e-9));
  }
});

test("station interiors have continuous cold daylight lighting at night", () => {
  const lamps = astanaScene.lampDefinitions;
  const assertColdWorkingLight = (lamp, minimumIntensity, minimumDistance) => {
    assert.equal(lamp.color, STATION_LIGHT_COLOR, `${lamp.id}: тёплый спектр`);
    assert.ok(lamp.intensity >= minimumIntensity,
      `${lamp.id}: недостаточная ночная мощность ${lamp.intensity}`);
    assert.ok(lamp.distance >= minimumDistance,
      `${lamp.id}: свет не перекрывает соседнюю секцию`);
    assert.ok(lamp.dayIntensityFactor >= 0.35,
      `${lamp.id}: станционный свет полностью гаснет днём`);
    assert.ok(lamp.poolPriority >= 3,
      `${lamp.id}: рабочий свет уступает декоративным лампам`);
    assert.equal(lamp.localPoolCapacity, 12,
      `${lamp.id}: помещение не помещается в локальный пул света`);
    assert.deepEqual(lamp.transition, { fadeInSeconds: 0.25, fadeOutSeconds: 0.2 },
      `${lamp.id}: источник переключается скачком`);
  };

  for (const station of astanaStations) {
    const platform = lamps.filter((lamp) =>
      lamp.id.includes(`:station-canopy:${station.id}:lamp:`));
    const hall = lamps.filter((lamp) =>
      lamp.id.includes(`:station-concourse:${station.id}:hall-lamp:`));
    const lift = lamps.filter((lamp) =>
      lamp.id.includes(`:station-concourse:${station.id}:lift-ceiling:`));

    assert.equal(platform.length, 6, `${station.id}: платформа освещена не по секциям`);
    assert.equal(hall.length, 4, `${station.id}: вестибюль освещён неравномерно`);
    assert.equal(lift.length, 1, `${station.id}: кабина лифта без собственного света`);
    platform.forEach((lamp) => assertColdWorkingLight(lamp, 4.5, 18));
    hall.forEach((lamp) => assertColdWorkingLight(lamp, 4.5, 16));
    lift.forEach((lamp) => assertColdWorkingLight(lamp, 2, 7));

    assert.equal(new Set(platform.map((lamp) => lamp.poolGroupId)).size, 1,
      `${station.id}: платформа включается отдельными тёмными секциями`);
    assert.equal(new Set(hall.map((lamp) => lamp.poolGroupId)).size, 1,
      `${station.id}: вестибюль включается отдельными тёмными секциями`);

    const platformTs = platform
      .map((lamp) => stationLocal(station, lamp).t)
      .sort((left, right) => left - right);
    const intervals = [
      platformTs[0] + PLATFORM_LENGTH / 2,
      ...platformTs.slice(1).map((value, index) => value - platformTs[index]),
      PLATFORM_LENGTH / 2 - platformTs.at(-1),
    ];
    assert.ok(Math.max(...intervals) <= PLATFORM_LENGTH / 6 + 1e-9,
      `${station.id}: на платформе остался тёмный продольный участок`);
  }

  const prototype = astanaStations.find((station) => station.id === STATION_SHELL_PROTOTYPE);
  assert.ok(prototype);
  const access = lamps.filter((lamp) =>
    lamp.id.includes(":prototype-zhibek-zholy-shell:access:lamp:"));
  assert.equal(access.length, 4, "наклонный рукав освещён не по всей длине");
  access.forEach((lamp) => assertColdWorkingLight(lamp, 4, 15));
  assert.equal(new Set(access.map((lamp) => lamp.poolGroupId)).size, 1,
    "рукав должен включаться одной непрерывной световой группой");
  const accessTs = access
    .map((lamp) => stationLocal(prototype, lamp).t)
    .sort((left, right) => left - right);
  assert.ok(accessTs[0] > -14 && accessTs.at(-1) < 7,
    "крайний светильник рукава вышел за лестницу и эскалатор");
  assert.ok(accessTs.slice(1).every((value, index) => value - accessTs[index] <= 5.25 + 1e-9),
    "между светильниками рукава остался тёмный пролёт");
});
