import assert from "node:assert/strict";
import test from "node:test";
import { Euler, Quaternion, Vector3 } from "three";
import { propPollardWillow } from "../games/make-a-mess/src/content/prefabs/coreFlora.ts";
import { willowWhipFan } from "../games/make-a-mess/src/game/treeVisualModel.ts";

// Паспорт снят по фото: ряд над канавкой в Вассенааре (пропорции и разлёт
// пучка) и старая голова в парке Аудегейн (наплыв, желваки, мох).
const SEEDS = [71, 72, 73, 7, 128];

function pieceAxis(piece) {
  return new Vector3(0, 1, 0)
    .applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...(piece.rotation ?? [0, 0, 0]))),
    )
    .normalize();
}

function whipStart(piece) {
  return new Vector3(...piece.position).addScaledVector(
    pieceAxis(piece),
    -piece.size[1] / 2,
  );
}

function willow(seed) {
  const pieces = propPollardWillow({ seed });
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  return {
    pieces,
    byId,
    trunk: byId.get("trunk"),
    head: byId.get("head"),
    whips: pieces.filter(({ id }) => /^whip:\d+$/.test(id)),
    leaves: pieces.filter(({ id }) => id.includes(":leaf:")),
    knobs: pieces.filter(({ treeVisual }) => treeVisual?.role === "knob"),
  };
}

test("the pollard trunk is a stump, not a pole", () => {
  for (const seed of SEEDS) {
    const { trunk } = willow(seed);
    const slenderness = trunk.size[1] / trunk.size[0];
    assert.ok(
      slenderness >= 2.6 && slenderness <= 4.2,
      `seed ${seed}: стройность ${slenderness.toFixed(2)} вне референсных 2.6–4.2`,
    );
    assert.ok(trunk.size[1] >= 1.7 && trunk.size[1] <= 2.3, `seed ${seed}`);
  }
});

test("the head swallows the trunk end instead of sitting on top of it", () => {
  for (const seed of SEEDS) {
    const { trunk, head } = willow(seed);
    const trunkTop = trunk.size[1];
    const headBottom = head.position[1] - head.size[1] / 2;
    const headTop = head.position[1] + head.size[1] / 2;
    assert.ok(
      head.size[0] >= trunk.size[0] * 1.4,
      `seed ${seed}: голова ${head.size[0].toFixed(2)} у́же 1.4 калибра ствола`,
    );
    assert.ok(
      headBottom < trunkTop && headTop > trunkTop - head.size[1] * 0.6,
      `seed ${seed}: торец ствола ${trunkTop.toFixed(2)} не внутри головы ` +
        `${headBottom.toFixed(2)}..${headTop.toFixed(2)}`,
    );
  }
});

// Класс ошибки, из-за которого голова разъезжалась на висящие абажуры: труба
// рендерера ужимает вершину куска и не имеет торцов, поэтому КОРОТКИЙ И
// ШИРОКИЙ деревянный кусок неизбежно читается как отдельный колпак с просветом
// до соседнего. Такие формы обязаны быть замкнутым комом (role "knob").
test("no woody tube is shorter than it is thick", () => {
  for (const seed of SEEDS) {
    for (const piece of willow(seed).pieces) {
      const role = piece.treeVisual?.role;
      if (role !== "trunk" && role !== "branch") {
        continue;
      }
      assert.ok(
        piece.size[1] >= piece.size[0],
        `seed ${seed}: ${piece.id} — труба ${piece.size[0].toFixed(2)}×` +
          `${piece.size[1].toFixed(2)}, это абажур, а не член дерева`,
      );
    }
  }
});

test("the whip bunch stands up: half-angle near 11 degrees, extremes under 22", () => {
  for (const seed of SEEDS) {
    const { whips } = willow(seed);
    assert.ok(whips.length >= 20, `seed ${seed}: гнёзд ${whips.length}`);
    const tilts = whips
      .map((whip) => Math.acos(Math.min(1, pieceAxis(whip).y)))
      .sort((left, right) => left - right);
    const median = tilts[Math.floor(tilts.length / 2)];
    const ninetieth = tilts[Math.floor(tilts.length * 0.9)];
    assert.ok(
      median <= 0.22,
      `seed ${seed}: медианный наклон ${((median * 180) / Math.PI).toFixed(1)}°`,
    );
    assert.ok(
      ninetieth <= 0.32,
      `seed ${seed}: 90-й процентиль ${((ninetieth * 180) / Math.PI).toFixed(1)}°`,
    );
    assert.ok(
      tilts[tilts.length - 1] <= 0.38,
      `seed ${seed}: крайний прут ${((tilts[tilts.length - 1] * 180) / Math.PI).toFixed(1)}°`,
    );
  }
});

test("whips leave the head, and the bunch is twice the trunk", () => {
  for (const seed of SEEDS) {
    const { trunk, head, whips } = willow(seed);
    const headCentre = new Vector3(...head.position);
    for (const whip of whips) {
      const start = whipStart(whip);
      const radial = Math.hypot(
        start.x - headCentre.x,
        start.z - headCentre.z,
      );
      assert.ok(
        radial <= head.size[0] * 0.5,
        `seed ${seed}: ${whip.id} стартует в ${radial.toFixed(2)} от оси, ` +
          `голова радиусом ${(head.size[0] / 2).toFixed(2)}`,
      );
      assert.ok(
        start.y >= headCentre.y - head.size[1] &&
          start.y <= headCentre.y + head.size[1],
        `seed ${seed}: ${whip.id} стартует мимо головы по высоте`,
      );
      assert.equal(whip.treeVisual.parentLocalId, "head");
    }
    const bunch = Math.max(
      ...whips.map((whip) => whipStart(whip).y + whip.size[1] * pieceAxis(whip).y),
    ) - trunk.size[1];
    assert.ok(
      bunch >= trunk.size[1] * 1.3 && bunch <= trunk.size[1] * 2.6,
      `seed ${seed}: пучок ${bunch.toFixed(2)} м при стволе ${trunk.size[1].toFixed(2)}`,
    );
  }
});

test("leaves run along the whip instead of balling up at its tip", () => {
  for (const seed of SEEDS) {
    const { whips, byId } = willow(seed);
    for (const whip of whips) {
      const start = whipStart(whip);
      const axis = pieceAxis(whip);
      const stations = [0, 1, 2]
        .map((index) => byId.get(`${whip.id}:leaf:${index}`))
        .filter(Boolean)
        .map((leaf) =>
          new Vector3(...leaf.position).sub(start).dot(axis) / whip.size[1],
        )
        .sort((left, right) => left - right);
      assert.equal(stations.length, 3, `seed ${seed}: ${whip.id}`);
      assert.ok(stations[0] <= 0.4, `seed ${seed}: ${whip.id} гол снизу`);
      assert.ok(stations[2] >= 0.72, `seed ${seed}: ${whip.id} гол сверху`);
      for (let index = 1; index < stations.length; index += 1) {
        assert.ok(
          stations[index] - stations[index - 1] <= 0.3,
          `seed ${seed}: ${whip.id} — разрыв листвы ` +
            `${(stations[index] - stations[index - 1]).toFixed(2)} длины`,
        );
      }
    }
  }
});

test("one whip body renders as a bunch of near-parallel rods", () => {
  for (const seed of SEEDS) {
    const { whips } = willow(seed);
    let rendered = 0;
    for (const whip of whips) {
      const axis = pieceAxis(whip);
      const start = whipStart(whip);
      const rods = willowWhipFan(
        [start.x, start.y, start.z],
        [axis.x, axis.y, axis.z],
        whip.size[1],
        whip.size[0],
        seed + whips.indexOf(whip),
      );
      assert.ok(rods.length >= 4);
      rendered += rods.filter(({ index }) => index < 3).length;
      for (const rod of rods) {
        const direction = new Vector3(...rod.direction);
        assert.ok(
          Math.abs(direction.length() - 1) < 1e-6,
          "стержень должен быть единичным вектором",
        );
        if (rod.index === 0) {
          assert.ok(direction.distanceTo(axis) < 1e-6);
          continue;
        }
        const spread = Math.acos(Math.min(1, direction.dot(axis)));
        const limit = rod.index === 3 ? 0.32 : 0.1;
        assert.ok(
          spread <= limit,
          `seed ${seed}: стержень ${rod.index} расходится на ` +
            `${((spread * 180) / Math.PI).toFixed(1)}°`,
        );
        assert.ok(rod.length < whip.size[1] && rod.length > 0);
        assert.ok(rod.diameter < whip.size[0]);
      }
    }
    assert.ok(
      rendered >= 60 && rendered <= 90,
      `seed ${seed}: отрисованных прутьев ${rendered}, референс 50–80`,
    );
  }
});

test("the willow stays inside its render budget", () => {
  for (const seed of SEEDS) {
    const { pieces, leaves, knobs, whips } = willow(seed);
    // Тел — не больше прежней ивы (97): плотность взята распределением, а не
    // числом разрушаемых кусков.
    assert.ok(pieces.length <= 130, `seed ${seed}: кусков ${pieces.length}`);
    // Лепестков листвы три на ком; выше 240 крона начинает стоить дороже травы.
    assert.ok(leaves.length * 3 <= 240, `seed ${seed}: лепестков ${leaves.length * 3}`);
    // Труб на дерево: ствол + 4 стержня на гнездо.
    assert.ok(1 + whips.length * 4 <= 120, `seed ${seed}`);
    assert.ok(knobs.length >= 8 && knobs.length <= 12, `seed ${seed}`);
  }
});

test("every willow piece hangs on a chain that ends at the trunk", () => {
  for (const seed of SEEDS) {
    const { pieces, byId } = willow(seed);
    for (const piece of pieces) {
      let current = piece;
      for (let step = 0; step < 8 && current.id !== "trunk"; step += 1) {
        const parent = current.treeVisual?.parentLocalId;
        assert.ok(parent, `seed ${seed}: ${current.id} без родителя`);
        current = byId.get(parent);
        assert.ok(current, `seed ${seed}: родитель ${parent} не найден`);
      }
      assert.equal(current.id, "trunk", `seed ${seed}: ${piece.id} висит в воздухе`);
    }
  }
});

// Порода читается размером. Дуб полевой межи — самое крупное лиственное этих
// ландшафтов, стриженая ива — самое приземистое; если они одного роста, берег
// читается садом одинаковых кустов. Молодое дерево задаётся `scale` на месте
// посадки (город: TOWN_OAK_AGE), а не занижением породы.
test("the oak towers over the pollard willow", async () => {
  const { propOak } = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  const top = (pieces) =>
    Math.max(...pieces.map((piece) => piece.position[1] + piece.size[1] / 2));
  const span = (pieces) =>
    Math.max(
      ...pieces.map(
        (piece) =>
          (Math.hypot(piece.position[0], piece.position[2]) +
            Math.max(...piece.size) / 2) *
          2,
      ),
    );
  for (const seed of SEEDS) {
    const oak = propOak({ seed });
    const trunk = oak.find(({ id }) => id === "trunk");
    const height = top(oak);
    const slenderness = trunk.size[1] / trunk.size[0];
    assert.ok(
      height >= 8.5 && height <= 12.5,
      `seed ${seed}: дуб ${height.toFixed(1)} м вне 8.5–12.5`,
    );
    assert.ok(
      span(oak) >= 6.5,
      `seed ${seed}: крона дуба ${span(oak).toFixed(1)} м у́же 6.5`,
    );
    assert.ok(
      slenderness >= 5.5 && slenderness <= 10,
      `seed ${seed}: стройность дуба ${slenderness.toFixed(1)}`,
    );
    assert.ok(
      height >= top(propPollardWillow({ seed })) * 1.4,
      `seed ${seed}: дуб ${height.toFixed(1)} не выше стриженой ивы в 1.4 раза`,
    );
    // Крона осыпается секциями: ни одна не должна падать одним комом.
    const foliage = oak.filter(({ treeVisual }) => treeVisual?.role === "foliage");
    assert.ok(foliage.length >= 55, `seed ${seed}: секций кроны ${foliage.length}`);
    assert.ok(
      Math.max(...foliage.map((piece) => Math.max(...piece.size))) < 1,
      `seed ${seed}: секция кроны крупнее метра`,
    );
    assert.ok(oak.length <= 130, `seed ${seed}: тел ${oak.length}`);
  }
});

test("the birch is a tall slender tree, not a sapling", async () => {
  const { propBirch, propOak } = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  const top = (pieces) =>
    Math.max(...pieces.map((piece) => piece.position[1] + piece.size[1] / 2));
  const width = (pieces) =>
    Math.max(
      ...pieces.map(
        (piece) =>
          (Math.hypot(piece.position[0], piece.position[2]) +
            Math.max(piece.size[0], piece.size[2]) / 2) *
          2,
      ),
    );
  for (const seed of SEEDS) {
    const birch = propBirch({ seed });
    const trunk = birch.find(({ id }) => id === "trunk");
    const height = top(birch);
    const slenderness = trunk.size[1] / trunk.size[0];
    assert.ok(
      height >= 11.5 && height <= 15,
      `seed ${seed}: берёза ${height.toFixed(1)} м вне 11.5–15`,
    );
    // Подпись породы — не рост, а узость: крона берёзы вдвое-втрое у́же дуба.
    assert.ok(
      width(birch) <= height * 0.55,
      `seed ${seed}: крона берёзы ${width(birch).toFixed(1)} шире половины высоты`,
    );
    assert.ok(
      slenderness >= 25 && slenderness <= 42,
      `seed ${seed}: стройность берёзы ${slenderness.toFixed(1)}`,
    );
    assert.ok(
      width(birch) < width(propOak({ seed })) * 0.85,
      `seed ${seed}: берёза не у́же дуба`,
    );
    const foliage = birch.filter(({ treeVisual }) => treeVisual?.role === "foliage");
    assert.ok(foliage.length >= 40, `seed ${seed}: секций кроны ${foliage.length}`);
    assert.ok(
      Math.max(...foliage.map((piece) => Math.max(...piece.size))) < 1,
      `seed ${seed}: секция кроны берёзы крупнее метра`,
    );
    assert.ok(birch.length <= 130, `seed ${seed}: тел ${birch.length}`);
  }
});

// Крона — не одно пятно: её оболочка выгорела на солнце, а нутро сидит в тени.
// Если обе части красить одной палитрой, дерево читается плоским.
test("crown shell and crown interior are painted apart", async () => {
  const { propBirch, propOak } = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  for (const [name, pieces, shell, interior] of [
    ["дуб", propOak({ seed: 71 }), /^leaf:(p|s):/, /^leaf:(pm|pl|sm|core):/],
    ["берёза", propBirch({ seed: 71 }), /^leaf:(p|s|top):/, /^leaf:(pm|sm):/],
  ]) {
    const colours = (match) =>
      new Set(
        pieces
          .filter(({ id, treeVisual }) => treeVisual?.role === "foliage" && match.test(id))
          .map(({ color }) => color),
      );
    const sun = colours(shell);
    const shade = colours(interior);
    assert.ok(sun.size >= 2, `${name}: оболочка кроны одноцветна`);
    assert.ok(shade.size >= 2, `${name}: нутро кроны одноцветно`);
    for (const tone of sun) {
      assert.ok(!shade.has(tone), `${name}: ${tone} и на солнце, и в тени`);
    }
  }
});

// Сосна обыкновенная: голый ствол на половину высоты и крона подушками
// наверху. Дети смеялись над прежней «ёлкой» — конусом из ярусов-блинов.
test("the pine is a bare-boled tree, not a christmas cone", async () => {
  const { propPine, PINE_NOMINAL_HEIGHT } = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  for (const seed of SEEDS) {
    const pine = propPine({ seed });
    const byId = new Map(pine.map((piece) => [piece.id, piece]));
    const bole = byId.get("trunk");
    const stem = byId.get("stem");
    const height = Math.max(
      ...pine.map((piece) => piece.position[1] + piece.size[1] / 2),
    );
    const limbs = pine.filter(({ id }) => /^limb:\d+$/.test(id));
    const needles = pine.filter(({ id }) => id.includes(":needles:"));
    const stubs = pine.filter(({ id }) => id.startsWith("stub:"));

    assert.ok(
      height >= 16 && height <= 21,
      `seed ${seed}: сосна ${height.toFixed(1)} м вне 16–21`,
    );
    assert.ok(
      Math.abs(height - PINE_NOMINAL_HEIGHT) <= 2.6,
      `seed ${seed}: номинал породы ${PINE_NOMINAL_HEIGHT} разошёлся с ${height.toFixed(1)}`,
    );
    // Голый ствол — половина дерева: по нему сосну и узнают.
    const crownBase = Math.min(
      ...limbs.map(
        (limb) => limb.position[1] - Math.abs(limb.size[1] * Math.cos(limb.rotation?.[2] ?? 0)) / 2,
      ),
    );
    assert.ok(
      crownBase >= height * 0.45,
      `seed ${seed}: крона начинается на ${(crownBase / height * 100).toFixed(0)}% высоты`,
    );
    assert.ok(stem, `seed ${seed}: нет верхней части ствола`);
    // Рыжий верх и серый комель — вторая подпись породы.
    assert.notEqual(stem.color, bole.color, `seed ${seed}: кора одноцветна`);
    assert.ok(limbs.length >= 8, `seed ${seed}: сучьев ${limbs.length}`);
    assert.ok(stubs.length >= 3, `seed ${seed}: сухих сучьев ${stubs.length}`);
    assert.ok(needles.length >= 10, `seed ${seed}: подушек ${needles.length}`);
    // Подушка меряется ОТ СУКА: на коротком верхнем сучке большая подушка
    // перекрывает соседние, и крона превращается в кашу из хвои.
    for (const cushion of needles) {
      const limb = pine.find(({ id }) => id === cushion.id.split(":needles:")[0]);
      assert.ok(limb, `seed ${seed}: у подушки нет сука`);
      assert.ok(
        cushion.size[0] <= limb.size[1] * 0.62,
        `seed ${seed}: подушка ${cushion.size[0].toFixed(2)} шире 0.62 сука ` +
          `${limb.size[1].toFixed(2)}`,
      );
      assert.ok(
        cushion.size[0] >= Math.min(0.55, limb.size[1] * 0.35),
        `seed ${seed}: подушка ${cushion.size[0].toFixed(2)} мельче трети сука`,
      );
    }
    // Масса подушки идёт от размера: при фиксированном объёме мелкое дерево
    // несёт ту же хвою на вчетверо более тонком суку и решатель роняет сук.
    for (const cushion of needles) {
      const bounding = cushion.size[0] * cushion.size[1] * cushion.size[2];
      assert.ok(
        cushion.volume < bounding && cushion.volume > bounding * 0.05,
        `seed ${seed}: объём подушки ${cushion.volume.toFixed(3)} не от размера`,
      );
    }
    assert.ok(pine.length <= 60, `seed ${seed}: тел ${pine.length}`);
    // Сучья почти горизонтальны — это и делает крону слоистой.
    const tilts = limbs.map((limb) => Math.acos(Math.min(1, pieceAxis(limb).y)));
    assert.ok(
      Math.min(...tilts) >= 0.75,
      `seed ${seed}: самый крутой сук ${((Math.min(...tilts) * 180) / Math.PI).toFixed(0)}°`,
    );
  }
});

// Плакучая ива — противоположность стриженой: там столб с шапкой прутьев
// вверх, здесь купол шире собственной высоты с занавесом до земли.
test("the weeping willow is a dome, and its curtain is drawn, not bodied", async () => {
  const { propWeepingWillow } = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  const { buildTreeVisuals } = await import(
    "../games/make-a-mess/src/game/treeVisualInstances.ts"
  );
  for (const seed of SEEDS) {
    const tree = propWeepingWillow({ seed });
    const trunk = tree.find(({ id }) => id === "trunk");
    const limbs = tree.filter(({ id }) => /^limb:\d+$/.test(id));
    const height = Math.max(
      ...tree.map((piece) => piece.position[1] + piece.size[1] / 2),
    );
    const width = Math.max(
      ...tree.map(
        (piece) =>
          (Math.hypot(piece.position[0], piece.position[2]) +
            Math.max(piece.size[0], piece.size[2]) / 2) * 2,
      ),
    );
    assert.ok(height >= 6 && height <= 9, `seed ${seed}: высота ${height.toFixed(1)}`);
    // Купол: крона не у́же собственной высоты — этим она и отличается от всех
    // прочих деревьев карты.
    assert.ok(
      width >= height,
      `seed ${seed}: крона ${width.toFixed(1)} у́же высоты ${height.toFixed(1)}`,
    );
    // Сучьев немного (3–4), зато каждый ветвится: масса кроны — в ветвях
    // второго порядка и в побегах, а не в числе спиц из ствола.
    assert.ok(limbs.length >= 3, `seed ${seed}: сучьев ${limbs.length}`);
    const forks = tree.filter(({ id }) => /^limb:\d+:fork:\d+$/.test(id));
    assert.ok(
      forks.length >= limbs.length * 2,
      `seed ${seed}: ветвей второго порядка ${forks.length} на ${limbs.length} сучьев`,
    );
    assert.ok(trunk.size[1] / trunk.size[0] <= 8, `seed ${seed}: ствол слишком тонкий`);
    // Тел мало: занавес — работа рендера, а не физики. Тонкий отвес как тело
    // теряет опору от любого поворота посадки. В телах живёт только СКЕЛЕТ —
    // ствол, сучья, ветви второго порядка и листва на них.
    assert.ok(tree.length <= 40, `seed ${seed}: тел ${tree.length}`);
    // Скелет обязан ВЕТВИТЬСЯ: колесо спиц из одной точки читается картонкой,
    // а плакучая ива — обычное дерево, с которого падают побеги.
    assert.ok(
      tree.some(({ id }) => /^limb:\d+:fork:\d+$/.test(id)),
      `seed ${seed}: у скелета нет ветвей второго порядка`,
    );
    assert.equal(
      tree.some(({ id }) => id.includes(":strand:")),
      false,
      `seed ${seed}: плеть стала телом`,
    );

    const visual = buildTreeVisuals(
      tree.map((piece) => ({ ...piece, id: `object:${piece.id}` })),
    );
    // Занавес существует и висит вниз: стержней много, и они отвесны.
    assert.ok(visual.wood.length >= 60, `seed ${seed}: стержней ${visual.wood.length}`);
    assert.ok(visual.foliage.length >= 150, `seed ${seed}: лепестков ${visual.foliage.length}`);
  }
});

// Мир польдера держат ГОЛОВЧАТЫЕ ивы: их сажают, потому что корень держит
// откос. Плакучая — дерево двора и воды, её единицы. Если счёт перевернётся,
// берег перестанет быть рабочим ландшафтом и станет парком.
test("the polder bank belongs to pollards, not to weeping willows", async () => {
  const { dutchPolderScene } = await import(
    "../games/make-a-mess/src/game/dutchPolderScene.ts"
  );
  const trunks = dutchPolderScene.breakablePieces.filter(
    (piece) => piece.treeVisual?.role === "trunk",
  );
  const pollards = trunks.filter((piece) => piece.id.includes(":pollard-willows:"));
  const weeping = trunks.filter((piece) => piece.id.includes(":weeping-willows:"));
  assert.ok(weeping.length >= 2, `плакучих ${weeping.length}`);
  assert.ok(
    pollards.length >= weeping.length * 3,
    `головчатых ${pollards.length} против плакучих ${weeping.length}`,
  );
  // Плакучая ива не должна перекрывать проход по мосту: её занавес шире
  // собственной высоты и достаёт до земли.
  const bridges = dutchPolderScene.breakablePieces.filter((piece) =>
    piece.id.includes(":bridges:"),
  );
  for (const tree of weeping) {
    const closest = Math.min(
      ...bridges.map((piece) =>
        Math.hypot(
          piece.position[0] - tree.position[0],
          piece.position[2] - tree.position[2],
        ),
      ),
    );
    assert.ok(
      closest > 4,
      `${tree.id}: занавес в ${closest.toFixed(1)} м от моста — закрывает проход`,
    );
  }
});

// ПОЛНЫЙ АУДИТ СКЕЛЕТА. У каждой ветви должно быть понятное начало (стык с
// родителем — либо продолжение конец-в-начало, либо ответвление на его
// поверхности) и понятный конец (потомок, листва или сход на нет). Ветвь,
// обрывающаяся в воздухе, читается обрубком, даже если данные «валидны»:
// у плакучей ивы так висело тринадцать сучьев из двадцати одного.
test("every branch has an honest start and an honest end", async () => {
  const flora = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  const ends = (piece) => {
    const axis = pieceAxis(piece);
    const centre = new Vector3(...piece.position);
    return [
      centre.clone().addScaledVector(axis, -piece.size[1] / 2),
      centre.clone().addScaledVector(axis, piece.size[1] / 2),
    ];
  };
  for (const [name, build] of [
    ["плакучая ива", flora.propWeepingWillow],
    ["головчатая ива", flora.propPollardWillow],
    ["дуб", flora.propOak],
    ["берёза", flora.propBirch],
    ["сосна", flora.propPine],
  ]) {
    for (const seed of SEEDS) {
      const pieces = build({ seed });
      const byId = new Map(pieces.map((piece) => [piece.id, piece]));
      const children = new Map();
      for (const piece of pieces) {
        const parent = piece.treeVisual?.parentLocalId;
        if (parent) {
          children.set(parent, [...(children.get(parent) ?? []), piece]);
        }
      }
      for (const piece of pieces) {
        if (piece.treeVisual?.role !== "branch") {
          continue;
        }
        const parent = byId.get(piece.treeVisual.parentLocalId ?? "");
        const [start, end] = ends(piece);
        if (parent && parent.treeVisual?.role !== "knob") {
          const [from, to] = ends(parent);
          const along = to.clone().sub(from);
          const t = Math.max(
            0,
            Math.min(1, start.clone().sub(from).dot(along) / along.lengthSq()),
          );
          const surface =
            start.distanceTo(from.clone().addScaledVector(along, t)) -
            parent.size[0] / 2;
          const joint = start.distanceTo(to);
          assert.ok(
            joint <= 0.02 || surface <= 0.02,
            `${name} seed ${seed}: ${piece.id} — начало не на родителе ` +
              `(стык ${joint.toFixed(2)} м, до поверхности ${surface.toFixed(2)} м)`,
          );
          assert.ok(
            piece.size[0] <= parent.size[0] * 1.02,
            `${name} seed ${seed}: ${piece.id} толще своего родителя`,
          );
        }
        // Сухой сучок сосны обрывается намеренно — он и есть облом.
        if (piece.treeVisual.localId.startsWith("stub:") || piece.size[0] <= 0.04) {
          continue;
        }
        const covered = (children.get(piece.treeVisual.localId) ?? []).some(
          (child) => {
            const point = child.treeVisual?.role === "foliage"
              ? new Vector3(...child.position)
              : ends(child)[0];
            return point.distanceTo(end) < Math.max(0.7, child.size[0]);
          },
        );
        assert.ok(
          covered,
          `${name} seed ${seed}: ${piece.id} обрывается в воздухе ` +
            `(Ø${piece.size[0].toFixed(3)}) — нет ни потомка, ни листвы на конце`,
        );
      }
    }
  }
});

// Ветвь обязана НАЧИНАТЬСЯ НА СВОЁМ РОДИТЕЛЕ. Восстанавливать ось ветви из её
// поворота нельзя: у ветви соглашение [0, -yaw, -tilt], а у ствола [rx, 0, rz],
// и по стволовой формуле развилки уезжали на полметра — в кадре это читается
// как «ветки не закреплены».
test("every branch starts on the member that carries it", async () => {
  const { propWeepingWillow, propOak, propPine } = await import(
    "../games/make-a-mess/src/content/prefabs/coreFlora.ts"
  );
  const segment = (piece) => {
    const axis = pieceAxis(piece);
    const centre = new Vector3(...piece.position);
    return [
      centre.clone().addScaledVector(axis, -piece.size[1] / 2),
      centre.clone().addScaledVector(axis, piece.size[1] / 2),
    ];
  };
  for (const build of [propWeepingWillow, propOak, propPine]) {
    for (const seed of SEEDS) {
      const pieces = build({ seed });
      const byId = new Map(pieces.map((piece) => [piece.id, piece]));
      for (const piece of pieces) {
        if (piece.treeVisual?.role !== "branch") {
          continue;
        }
        const parent = byId.get(piece.treeVisual.parentLocalId ?? "");
        if (!parent || parent.treeVisual?.role === "knob") {
          continue;
        }
        const [start] = segment(piece);
        const [from, to] = segment(parent);
        const along = to.clone().sub(from);
        const t = Math.max(
          0,
          Math.min(1, start.clone().sub(from).dot(along) / along.lengthSq()),
        );
        const gap =
          start.distanceTo(from.clone().addScaledVector(along, t)) -
          parent.size[0] / 2;
        assert.ok(
          gap <= 0.06,
          `seed ${seed}: ${piece.id} начинается в ${gap.toFixed(2)} м от ` +
            `${parent.id} — ветвь висит в воздухе`,
        );
      }
    }
  }
});
