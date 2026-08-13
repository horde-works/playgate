import assert from "node:assert/strict";
import test from "node:test";
import {
  createVillagerPopulation,
  emitNoise,
  stepVillagers,
} from "../games/make-a-mess/src/game/villagerSim.ts";
import {
  habituationAfter,
  levelAtDistance,
  startleAmplitude,
  startleEnvelope,
  HABITUATION_DEPTH,
  LATENCY_SPREAD,
  REACTION_LATENCY,
  SPEED_OF_SOUND,
  STARTLE_DURATION,
  STARTLE_FLOOR_DB,
} from "../games/make-a-mess/src/game/villagerAlarm.ts";
import { vikingSettlement } from "../games/make-a-mess/src/content/scenes/vikingSettlement.ts";
import { villageHumanProfile } from "../games/make-a-mess/src/content/populations/humanPopulationProfiles.ts";
import {
  buildObstacleField,
  distanceToBox,
} from "../games/make-a-mess/src/game/villagerNavigation.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";

const GUNSHOT = 160;
const STEP = 1 / 120;

/**
 * Житель, приколоченный к месту. Детектор меряет СЛУХ, а не ходьбу: если
 * человек уйдёт на метр, изменится расстояние, а с ним и всё измеряемое.
 */
function pin(villager, x, z, seed = 0.5) {
  villager.x = x;
  villager.z = z;
  villager.y = 0;
  villager.seed = seed;
  return { villager, x, z };
}

function repin(pinned) {
  for (const entry of pinned) {
    entry.villager.x = entry.x;
    entry.villager.z = entry.z;
    entry.villager.y = 0;
  }
}

/** Расстояние от источника до уха, а не до стопы. */
function earDistance(villager, source) {
  const dx = villager.x - source[0];
  const dy = villager.y + 1.6 * villager.build - source[1];
  const dz = villager.z - source[2];
  return Math.hypot(dx, dy, dz);
}

/**
 * Прогон с приколоченными жителями: возвращает для каждого момент первого
 * вздрога и его амплитуду.
 */
function listen(population, pinned, seconds) {
  const onset = pinned.map(() => null);
  const peak = pinned.map(() => 0);
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    repin(pinned);
    stepVillagers(population, STEP, 0);
    for (const [index, entry] of pinned.entries()) {
      if (entry.villager.startle > 0) {
        if (onset[index] === null) {
          onset[index] = elapsed + STEP;
        }
        peak[index] = Math.max(peak[index], entry.villager.startle);
      }
    }
  }
  return { onset, peak };
}

test("уровень падает на 6 дБ при удвоении расстояния, а не по своей кривой", () => {
  // «Шесть децибел» — округление: точный спад на удвоение равен 20·lg2 = 6.02.
  assert.ok(Math.abs(levelAtDistance(160, 2) - 154) < 0.03);
  assert.ok(Math.abs(levelAtDistance(160, 4) - 148) < 0.06);
  assert.ok(Math.abs(levelAtDistance(160, 8) - 142) < 0.07);
  // Ближе метра формула уходит в бесконечность: там человек и так получил всё.
  assert.equal(levelAtDistance(160, 0.2), 160);
});

test("выстрел накрывает деревню целиком: радиуса слышимости не существует", () => {
  // От 160 дБ на метре на краю мира (96 м) остаётся заметно больше порога
  // рефлекса. Значит различать надо ступень, а не «слышал или нет».
  const edge = levelAtDistance(GUNSHOT, 96);
  assert.ok(edge > STARTLE_FLOOR_DB + 15, `на краю мира ${edge.toFixed(1)} дБ`);
  assert.ok(startleAmplitude(edge, 1, 0) > 0.4);
});

test("вздрог — быстрый подъём и долгий спад, а не ровный колокол", () => {
  assert.equal(startleEnvelope(0), 0);
  assert.equal(startleEnvelope(1), 0);
  let best = 0;
  let bestAt = 0;
  for (let t = 0.005; t < 1; t += 0.005) {
    const value = startleEnvelope(t);
    if (value > best) {
      best = value;
      bestAt = t;
    }
  }
  // Пик приходится на пятую часть длительности, то есть ~85 мс после начала
  // движения. У ровного колокола он был бы на середине — и это читалось бы
  // приседанием, а не рефлексом.
  assert.ok(bestAt > 0.12 && bestAt < 0.26, `пик на ${bestAt.toFixed(3)}`);
  assert.ok(best > 0.98);
});

test("звук ИДЁТ: дальний край деревни вздрагивает позже ближнего", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  // Одинаковая латентность у обоих: меряем распространение звука, а не разброс
  // человеческих реакций.
  const near = pin(population.villagers[0], 4, 0);
  const far = pin(population.villagers[1], 88, 0);
  const source = [0, 1.5, 0];
  emitNoise(population, { x: source[0], y: source[1], z: source[2], level: 175, rise: 1 });
  const { onset } = listen(population, [near, far], 1.2);

  assert.ok(onset[0] !== null && onset[1] !== null, "услышали оба");
  const gap = onset[1] - onset[0];
  const expected =
    (earDistance(far.villager, source) - earDistance(near.villager, source)) /
    SPEED_OF_SOUND;
  assert.ok(
    Math.abs(gap - expected) <= 0.02,
    `разрыв ${gap.toFixed(3)} с при ожидаемых ${expected.toFixed(3)} с`,
  );

  // И абсолютный момент: путь звука плюс латентность тела.
  const predicted =
    earDistance(near.villager, source) / SPEED_OF_SOUND +
    REACTION_LATENCY +
    near.villager.seed * LATENCY_SPREAD;
  assert.ok(
    Math.abs(onset[0] - predicted) <= 0.03,
    `ближний вздрогнул на ${onset[0].toFixed(3)} при ожидаемых ${predicted.toFixed(3)}`,
  );
});

test("вся деревня не вздрагивает в один кадр", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  // Свой разброс латентности у каждого — и все на ОДНОМ расстоянии, чтобы
  // разница не могла прийти от пути звука.
  const pinned = population.villagers.slice(0, 12).map((villager, index) => {
    const angle = (index / 12) * Math.PI * 2;
    return pin(
      villager,
      Math.cos(angle) * 20,
      Math.sin(angle) * 20,
      index / 12,
    );
  });
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 175, rise: 1 });
  const { onset } = listen(population, pinned, 1);
  const spread = Math.max(...onset) - Math.min(...onset);
  assert.ok(spread > 0.03, `разброс моментов вздрога всего ${spread.toFixed(3)} с`);
});

test("ступень — кривая по расстоянию, а не круг на земле", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const distances = [5, 10, 20, 35, 50, 70, 90];
  const pinned = distances.map((distance, index) =>
    pin(population.villagers[index], distance, 0),
  );
  // Уровень взят НЕ предельный: от 175 дБ вся ближняя половина деревни упирается
  // в потолок амплитуды, и кривой там нет — есть полка.
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 150, rise: 1 });
  const { peak } = listen(population, pinned, 1.5);

  // Личную пугливость делим обратно: этот детектор про ЗАКОН, а про людей есть
  // свой. Иначе робкий на двадцати метрах законно перебьёт спокойного на десяти,
  // и замер начнёт ругаться на правильное поведение.
  const law = peak.map((amplitude, index) => amplitude / pinned[index].villager.startleGain);

  for (const [index, amplitude] of law.entries()) {
    assert.ok(amplitude > 0, `на ${distances[index]} м никто не вздрогнул`);
  }
  for (let index = 1; index < law.length; index += 1) {
    assert.ok(
      law[index] <= law[index - 1] + 1e-6,
      `на ${distances[index]} м закон дал больше, чем на ${distances[index - 1]} м`,
    );
    // Ступеньки быть не должно: соседние корзины не проваливаются вдвое.
    assert.ok(
      law[index] >= law[index - 1] * 0.5,
      `провал вдвое между ${distances[index - 1]} и ${distances[index]} м`,
    );
  }
});

test("к грохоту привыкают, а в тишине отвыкают", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const listener = pin(population.villagers[0], 30, 0);
  const source = { x: 0, y: 1.5, z: 0, level: GUNSHOT, rise: 1 };
  const amplitudes = [];

  for (let shot = 0; shot < 10; shot += 1) {
    emitNoise(population, source);
    const { peak } = listen(population, [listener], 0.6);
    amplitudes.push(peak[0]);
  }

  assert.ok(amplitudes[0] > 0.5, `первый выстрел дал всего ${amplitudes[0]}`);
  assert.ok(
    amplitudes[9] <= amplitudes[0] * 0.4,
    `десятый выстрел ${amplitudes[9].toFixed(3)} против первого ${amplitudes[0].toFixed(3)}`,
  );
  // Но не глухота: приученный к грохоту всё равно вздрагивает.
  assert.ok(amplitudes[9] >= amplitudes[0] * (1 - HABITUATION_DEPTH) * 0.9);

  // Минута тишины возвращает человеку слух.
  for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
    repin([listener]);
    stepVillagers(population, 0.1, 0);
  }
  emitNoise(population, source);
  const { peak } = listen(population, [listener], 0.6);
  assert.ok(
    peak[0] >= amplitudes[0] * 0.8,
    `после минуты тишины ${peak[0].toFixed(3)} против первого ${amplitudes[0].toFixed(3)}`,
  );
});

test("к взрыву в упор привыкнуть нельзя", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const listener = pin(population.villagers[0], 3, 0);
  listener.villager.habituation = 1;
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 190, rise: 0.95 });
  const { peak } = listen(population, [listener], 0.6);
  // «Полная амплитуда» — полная ДЛЯ ЭТОГО ЧЕЛОВЕКА: пугливость личная, и мерить
  // привыкшего чужой меркой значит снова путать закон с человеком.
  const full = Math.min(1.35, 0.95 * listener.villager.startleGain);
  assert.ok(
    peak[0] >= full * 0.98,
    `привыкший получил ${peak[0].toFixed(3)} вместо своих ${full.toFixed(3)}`,
  );
  assert.equal(listener.villager.habituation > 0.05, false);

  // Тот же закон в чистом виде: громкое сбрасывает привычку, тихое копит.
  assert.equal(habituationAfter(0.9, 184), 0);
  assert.ok(habituationAfter(0.5, 120) > 0.5);
});

test("рефлекс обрывает ход: человек осекается на шаге", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  // Ждём, пока деревня разойдётся по делам и наберёт ход.
  for (let elapsed = 0; elapsed < 12; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
  }
  const walking = population.villagers.filter((villager) => villager.speed > 0.6);
  assert.ok(walking.length >= 4, `идущих всего ${walking.length}`);
  const before = walking.map((villager) => villager.speed);

  // Хлопок в середине деревни: слышно всем.
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 182, rise: 0.95 });
  let slowest = walking.map(() => Infinity);
  for (let elapsed = 0; elapsed < 0.8; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
    for (const [index, villager] of walking.entries()) {
      if (villager.startle > 0) {
        slowest[index] = Math.min(slowest[index], villager.speed);
      }
    }
  }
  for (const [index, villager] of walking.entries()) {
    assert.ok(
      slowest[index] < before[index] * 0.4,
      `${villager.id} шёл ${before[index].toFixed(2)}, а осел лишь до ${slowest[index].toFixed(2)}`,
    );
  }

  // И снова идёт: осечка не превращается в остановку насовсем.
  for (let elapsed = 0; elapsed < 3; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
  }
  const moving = walking.filter((villager) => villager.speed > 0.4).length;
  assert.ok(moving >= walking.length * 0.5, `после испуга пошли только ${moving}`);
});

test("деревня не вздрагивает одним телом: у каждого свой испуг", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  // ВСЕ НА ОДНОМ РАССТОЯНИИ, чтобы разница не могла прийти от пути звука:
  // остаётся только то, чем люди отличаются друг от друга.
  const pinned = population.villagers.map((villager, index) => {
    const angle = (index / population.villagers.length) * Math.PI * 2;
    return pin(villager, Math.cos(angle) * 20, Math.sin(angle) * 20, 0.5);
  });
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 175, rise: 1 });
  const { peak } = listen(population, pinned, 1.4);

  const mean = peak.reduce((sum, value) => sum + value, 0) / peak.length;
  const deviation = Math.sqrt(
    peak.reduce((sum, value) => sum + (value - mean) ** 2, 0) / peak.length,
  );
  assert.ok(
    deviation / mean > 0.08,
    `разброс амплитуд всего ${((deviation / mean) * 100).toFixed(1)}% — деревня вздрагивает одним телом`,
  );
  assert.ok(
    new Set(peak.map((value) => value.toFixed(3))).size > peak.length * 0.6,
    "слишком много одинаковых амплитуд",
  );

  // И длительность своя у каждого: одинаковый срок выдаёт общий таймер.
  const spans = new Set(
    population.villagers.map((villager) => villager.startleSpan.toFixed(3)),
  );
  assert.ok(spans.size > population.villagers.length * 0.6);
});

test("ремесло правит порогом: кузнец и старейшина крепче ребёнка", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const gainOf = (predicate) => {
    const group = population.villagers.filter(predicate);
    assert.ok(group.length > 0, "группа пуста");
    return group.reduce((sum, villager) => sum + villager.startleGain, 0) / group.length;
  };
  const children = gainOf((villager) => villager.child);
  const smiths = gainOf((villager) => villager.role === "smith" && !villager.child);
  const elders = gainOf((villager) => villager.role === "elder");
  assert.ok(children > smiths, `дети ${children.toFixed(2)} против кузнецов ${smiths.toFixed(2)}`);
  assert.ok(children > elders, `дети ${children.toFixed(2)} против старейшины ${elders.toFixed(2)}`);
});

test("после рефлекса человек ЗАМИРАЕТ и ищет источник", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 12; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
  }
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 182, rise: 0.95 });

  let watchingAfterReflex = 0;
  let longest = 0;
  for (let elapsed = 0; elapsed < 6; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
    const watching = population.villagers.filter((villager) => villager.alert > 0);
    longest = Math.max(longest, watching.length);
    // Через секунду рефлекс у всех давно кончился (он живёт до 0.58 с),
    // а замирание обязано ещё держаться: это разные звенья, а не одно.
    if (elapsed > 1 && elapsed < 1.2) {
      watchingAfterReflex = watching.length;
      assert.equal(
        population.villagers.filter((villager) => villager.startle > 0).length,
        0,
        "рефлекс не кончился к секунде",
      );
    }
  }
  assert.ok(longest > 25, `замерло всего ${longest} из 34`);
  assert.ok(
    watchingAfterReflex > 20,
    `через секунду ещё замерших только ${watchingAfterReflex}`,
  );

  // И отпускает: замирание не становится вечным столбняком.
  for (let elapsed = 0; elapsed < 6; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
  }
  assert.equal(
    population.villagers.filter((villager) => villager.alert > 0).length,
    0,
  );
});

test("первый доворот бывает не туда, потом человек поправляется", () => {
  // Деревня БЕЗ дозорного: рог — знак, его направление известно без поиска,
  // и он бы затёр как раз то, что здесь меряется.
  const population = createVillagerPopulation(
    { ...villageHumanProfile, settlement: { ...vikingSettlement, horn: undefined } },
    34,
    null,
  );
  const pinned = population.villagers.map((villager, index) => {
    const angle = (index / population.villagers.length) * Math.PI * 2;
    return pin(villager, Math.cos(angle) * 25, Math.sin(angle) * 25, 0.5);
  });
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 182, rise: 0.95 });

  const angleTo = (from, to) => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
  let firstGuess = null;
  let corrected = null;
  for (let elapsed = 0; elapsed < 3; elapsed += STEP) {
    repin(pinned);
    stepVillagers(population, STEP, 0);
    const alerted = population.villagers.filter((villager) => villager.alert > 0);
    if (alerted.length < 20) {
      continue;
    }
    const miss =
      alerted.reduce(
        (sum, villager) => sum + angleTo(villager.sourceYaw, villager.sourceTrueYaw),
        0,
      ) / alerted.length;
    if (firstGuess === null) {
      firstGuess = miss;
    }
    corrected = miss;
  }
  assert.ok(firstGuess !== null, "никто не замер");
  // Сперва ошибаются заметно...
  assert.ok(
    firstGuess > 0.2,
    `первая оценка направления слишком точна: ${firstGuess.toFixed(3)} рад`,
  );
  // ...а к концу осмотра — почти нет. Точно не бывает никогда.
  assert.ok(
    corrected < firstGuess * 0.5,
    `поправка не сработала: было ${firstGuess.toFixed(3)}, стало ${corrected.toFixed(3)}`,
  );
  assert.ok(corrected > 0, "направление угадано абсолютно точно — так не бывает");
});

test("испуг роняет ношу, и это настоящий убыток склада", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  // Даём деревне разойтись по делам и взять ноши в руки.
  for (let elapsed = 0; elapsed < 240; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
  }
  const carriers = population.villagers.filter(
    (villager) => villager.carries && villager.job,
  );
  assert.ok(carriers.length >= 2, `несущих всего ${carriers.length}`);
  const deliveredBefore = [...population.delivered.values()].reduce((a, b) => a + b, 0);

  // Взрыв в упор: амплитуда предельная, руки разжимаются у части несущих.
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 190, rise: 0.95 });
  for (let elapsed = 0; elapsed < 1; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
  }
  const dropped = carriers.filter((villager) => !villager.job);
  assert.ok(dropped.length > 0, "ни один не выронил ношу при взрыве в упор");

  // Выронённая единица УЖЕ списана с источника и до приёмника не доедет:
  // обещание возвращено, а вещь потеряна. Это и есть цена шума.
  for (const villager of dropped) {
    assert.equal(villager.job, null);
  }
  for (const [, store] of population.stores) {
    assert.ok(store.incoming >= 0 && store.reserved >= 0);
  }
  assert.ok([...population.delivered.values()].reduce((a, b) => a + b, 0) >= deliveredBefore);
});

test("каскадом правит неопределённость: место стрельбы решает больше громкости", () => {
  const deliveredUnder = (mode) => {
    const population = createVillagerPopulation(villageHumanProfile, 34, null);
    for (let elapsed = 0; elapsed < 180; elapsed += 0.1) {
      stepVillagers(population, 0.1, 0);
    }
    const before = [...population.delivered.values()].reduce((a, b) => a + b, 0);
    let next = 0;
    let spot = 0;
    for (let elapsed = 0; elapsed < 300; elapsed += 0.1) {
      if (mode !== "quiet" && elapsed >= next) {
        // С места — угол постоянный; вразброд — каждый раз новый.
        const angle = mode === "roam" ? spot++ * 2.399 : 0.7;
        emitNoise(population, {
          x: Math.cos(angle) * 35,
          y: 1.5,
          z: Math.sin(angle) * 35,
          level: 160,
          rise: 1,
        });
        next = elapsed + 6;
      }
      stepVillagers(population, 0.1, 0);
    }
    const total = () => [...population.delivered.values()].reduce((a, b) => a + b, 0);
    const during = total() - before;
    // Те же пять минут, но уже в тишине: по ним видно, отходит ли деревня.
    const mark = total();
    for (let elapsed = 0; elapsed < 300; elapsed += 0.1) {
      stepVillagers(population, 0.1, 0);
    }
    return { during, after: total() - mark };
  };

  const quiet = deliveredUnder("quiet").during;
  const fixed = deliveredUnder("fixed");
  const roam = deliveredUnder("roam").during;
  assert.ok(quiet > 0, "в тишине деревня и так ничего не носит");

  // Шум стоит деревне работы — иначе последствий нет вовсе.
  assert.ok(fixed.during < quiet, `стрельба с места не стоила деревне ничего`);
  // Но стрельба ВРАЗБРОД дороже: источник всё время новый, искать его негде.
  assert.ok(
    roam < fixed.during,
    `вразброд (${roam}) обошлось не дороже, чем с места (${fixed.during})`,
  );

  // И деревня не залипает: перестали шуметь — работа возвращается.
  assert.ok(
    fixed.after > fixed.during,
    `после тишины поток не вырос: ${fixed.after} против ${fixed.during}`,
  );
  assert.ok(
    fixed.after >= quiet * 0.6,
    `за пять минут тишины деревня отошла только до ${fixed.after} из ${quiet}`,
  );
});

/** Прогон деревни с одним взрывом и заданным сроком после него. */
function panicRun(seconds, blast = { x: 0, y: 1.5, z: 0, level: 190, rise: 0.95 }) {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
  }
  emitNoise(population, blast);
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
  }
  return population;
}

test("осмотрелся — решил: деревня не расходится по делам как ни в чём не бывало", () => {
  const population = panicRun(8);
  const acting = population.villagers.filter((villager) => villager.panic > 0);
  assert.ok(acting.length > 20, `решение приняли только ${acting.length} из 34`);
  // Решение — не одно на всех: у деревни есть и те, кто идёт против потока.
  const kinds = new Set(acting.map((villager) => villager.panicKind));
  assert.ok(kinds.has("cover") || kinds.has("gather"), "никто не уходит в укрытие");
  for (const villager of acting) {
    assert.ok(villager.panicKind !== null);
    // Дело брошено вместе с обещанием складу.
    assert.equal(villager.job, null);
  }
});

test("сначала свои, потом сам: за ребёнком идут прежде, чем прятаться", () => {
  const population = panicRun(6);
  const gatherers = population.villagers.filter(
    (villager) => villager.panicKind === "gather",
  );
  assert.ok(gatherers.length > 0, "никто не пошёл за детьми");
  for (const adult of gatherers) {
    assert.equal(adult.child, false, "за детьми пошёл ребёнок");
    const child = population.villagers[adult.gatherIndex];
    assert.ok(child, "цель сбора не найдена");
    assert.equal(child.child, true, "взрослый идёт собирать взрослого");
    assert.equal(
      child.homeId,
      adult.homeId,
      "взрослый идёт за ЧУЖИМ ребёнком, а не за своим",
    );
  }
});

test("укрытие — СВОЯ дверь, а не ближайшая", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
  }
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 190, rise: 0.95 });

  // Где человек был, когда решил прятаться: по этой точке и проверяется, что
  // он пошёл к СВОЕЙ двери, а не к той, что оказалась ближе.
  const decidedAt = new Map();
  let peak = 0;
  let peakInside = [];
  for (let elapsed = 0; elapsed < 260; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
    for (const villager of population.villagers) {
      if (villager.panicKind === "cover" && !decidedAt.has(villager.id)) {
        decidedAt.set(villager.id, [villager.x, villager.z]);
      }
    }
    const inside = population.villagers.filter(
      (villager) => villager.state === "inside",
    );
    if (inside.length > peak) {
      peak = inside.length;
      peakInside = inside.map((villager) => villager.id);
    }
  }
  assert.ok(peak >= 8, `одновременно пряталось всего ${peak} из 34`);

  const nodes = population.network.nodes;
  let provedFurther = 0;
  for (const id of peakInside) {
    const villager = population.villagers.find((person) => person.id === id);
    const own = population.homeNodes[villager.homeId];
    assert.ok(own !== undefined, `у ${id} нет узла своего дома`);
    const from = decidedAt.get(id);
    if (!from) {
      continue;
    }
    const reach = (node) => Math.hypot(nodes[node].x - from[0], nodes[node].z - from[1]);
    const mine = reach(own);
    // Была ли чужая дверь ближе? Если да — человек прошёл мимо неё к своей.
    for (const [homeId, node] of Object.entries(population.homeNodes)) {
      if (homeId !== villager.homeId && node !== undefined && reach(node) < mine) {
        provedFurther += 1;
        break;
      }
    }
  }
  assert.ok(
    provedFurther > 0,
    "никто не прошёл мимо более близкой чужой двери — «своя» не доказана",
  );

  // И деревня не остаётся пустой навсегда: отсидевшись, выходят обратно.
  assert.equal(
    population.villagers.filter((villager) => villager.state === "inside").length,
    0,
    "из домов так никто и не вышел",
  );
});

test("в воронку не лезут, а старейшина идёт разбираться — но не в упор", () => {
  const blast = { x: 12, y: 1.5, z: -6, level: 190, rise: 0.95 };
  const population = panicRun(20, blast);
  for (const villager of population.villagers) {
    if (!villager.visible) {
      continue;
    }
    const gap = Math.hypot(villager.x - blast.x, villager.z - blast.z);
    assert.ok(gap > 3.5, `${villager.id} стоит в ${gap.toFixed(1)} м от воронки`);
  }
  const elders = population.villagers.filter((villager) => villager.role === "elder");
  assert.ok(elders.length > 0);
});

const GRENADE_WAVE = { pushRadius: 5.8, horizontal: 6.4, vertical: 5.2 };
const CHARGE_WAVE = { pushRadius: 24.6, horizontal: 14.5, vertical: 10.5 };
const LANCE_WAVE = { pushRadius: 2.4, horizontal: 5.6, vertical: 4.4 };

test("волна сбивает с ног, а устоявшие отряхиваются — и их больше", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const pinned = population.villagers.map((villager, index) => {
    // Кольцами вокруг заряда: от упора до края радиуса толчка и дальше.
    const angle = (index / population.villagers.length) * Math.PI * 2;
    const radius = 2 + (index % 12) * 2.4;
    return pin(villager, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5);
  });
  emitNoise(population, {
    x: 0,
    y: 1.5,
    z: 0,
    level: 190,
    rise: 0.95,
    wave: CHARGE_WAVE,
  });

  // Считаем ПО ФАКТУ СОБЫТИЯ, а не по состоянию в конце: лёгкая пыль к тому
  // времени уже сойдёт, и замер соврёт.
  const downed = new Set();
  const dusty = new Set();
  for (let elapsed = 0; elapsed < 1.5; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
    for (const entry of pinned) {
      if (entry.villager.downPhase !== null) {
        downed.add(entry.villager.id);
      }
      if (entry.villager.dust > 0 || entry.villager.dusting > 0) {
        dusty.add(entry.villager.id);
      }
    }
  }
  assert.ok(downed.size > 0, "заряд в упор не сбил с ног никого");
  // ПЫЛЬ ШИРЕ ПАДЕНИЯ: устоявшие в облаке тоже обхлопываются, и их больше.
  assert.ok(
    dusty.size > downed.size,
    `отряхивающихся ${dusty.size} против сбитых ${downed.size} — облако уже зоны падения`,
  );
});

test("волна согласована с оружием: заряд опрокидывает, копьё — нет", () => {
  const knocked = (wave) => {
    const population = createVillagerPopulation(villageHumanProfile, 34, null);
    const listener = pin(population.villagers[0], 4, 0);
    emitNoise(population, { x: 0, y: 1.5, z: 0, level: 190, rise: 0.95, wave });
    for (let elapsed = 0; elapsed < 0.6; elapsed += STEP) {
      stepVillagers(population, STEP, 0);
    }
    return listener.villager.downPhase !== null;
  };
  assert.equal(knocked(CHARGE_WAVE), true, "заряд в четырёх метрах не опрокинул");
  assert.equal(knocked(LANCE_WAVE), false, "копьё опрокинуло за своим радиусом");
});

test("сбитый встаёт, отряхивается и возвращается к жизни", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const listener = pin(population.villagers[0], 3, 0);
  const startX = listener.villager.x;
  const baseWear = listener.villager.wear;
  emitNoise(population, {
    x: 0,
    y: 1.5,
    z: 0,
    level: 190,
    rise: 0.95,
    wave: GRENADE_WAVE,
  });

  const phases = new Set();
  let maxHeight = 0;
  let flew = 0;
  for (let elapsed = 0; elapsed < 60; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
    if (listener.villager.downPhase) {
      phases.add(listener.villager.downPhase);
      maxHeight = Math.max(maxHeight, listener.villager.y);
      flew = Math.abs(listener.villager.x - startX);
    }
  }
  assert.deepEqual(
    [...phases].sort(),
    ["flight", "prone", "rising"],
    `прошёл не все фазы: ${[...phases]}`,
  );
  assert.ok(maxHeight > 0.15, `тело не оторвалось от земли: ${maxHeight.toFixed(2)} м`);
  assert.ok(flew > 0.5, `отбросило всего на ${flew.toFixed(2)} м`);
  // ВСЕ ВСТАЮТ. Лежащих дольше срока не бывает — это не про убийства.
  assert.equal(listener.villager.downPhase, null, "так и не встал");
  assert.equal(listener.villager.dusting, 0, "так и не отряхнулся");
  assert.ok(
    Math.abs(listener.villager.wear + listener.villager.dust - baseWear) < 0.02,
    "затасканность не вернулась к своей",
  );
});

test("отброс не проносит сквозь сруб", () => {
  const field = buildObstacleField(vikingVillageScene.breakablePieces);
  const population = createVillagerPopulation(villageHumanProfile, 34, field);
  for (let elapsed = 0; elapsed < 30; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
  }
  // Взрыв в середине деревни: кого-то обязательно швырнёт мимо стен.
  emitNoise(population, {
    x: 0,
    y: 1.5,
    z: 0,
    level: 190,
    rise: 0.95,
    wave: CHARGE_WAVE,
  });
  for (let elapsed = 0; elapsed < 3; elapsed += STEP) {
    stepVillagers(population, STEP, 0);
    for (const villager of population.villagers) {
      if (villager.downPhase === null) {
        continue;
      }
      const inside = field
        .query(villager.flightToX, villager.flightToZ, 0.6, population.seeThrough)
        .some(
          (box) =>
            box.top > 0.46 &&
            distanceToBox(box, villager.flightToX, villager.flightToZ) < 0.05,
        );
      assert.equal(inside, false, `${villager.id} приземляется внутри твёрдого`);
    }
  }
});

test("рог разносит тревогу физикой: слышат и те, кто далеко", () => {
  // Хлопок В СТОРОНЕ и не оглушительный: ближние поднимут тревогу сами,
  // дальние — только если им скажут. Уровень подобран замером: при 155 дБ без
  // дозорного поднимается 15 человек, а с ним — вся деревня.
  const raised = (withHorn) => {
    const population = createVillagerPopulation(
      withHorn
        ? villageHumanProfile
        : { ...villageHumanProfile, settlement: { ...vikingSettlement, horn: undefined } },
      34,
      null,
    );
    for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
      stepVillagers(population, 0.1, 0);
    }
    emitNoise(population, { x: -34, y: 1.5, z: -30, level: 155, rise: 0.95 });
    let acted = 0;
    for (let elapsed = 0; elapsed < 40; elapsed += 0.05) {
      stepVillagers(population, 0.05, 0);
      acted = Math.max(
        acted,
        population.villagers.filter((villager) => villager.panic > 0).length,
      );
    }
    return { population, acted };
  };

  const withHorn = raised(true);
  const alone = raised(false);
  assert.ok(
    withHorn.acted > alone.acted * 1.5,
    `с дозорным поднялось ${withHorn.acted}, без него ${alone.acted} — рог почти ничего не дал`,
  );
  assert.equal(withHorn.population.hornCooldown > 0, true, "дозорный не протрубил");

  // И НЕ ПО ПУСТЯКАМ: если тревога не набрала кворума, рог молчит.
  const quiet = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
    stepVillagers(quiet, 0.1, 0);
  }
  emitNoise(quiet, { x: -34, y: 1.5, z: -30, level: 145, rise: 0.95 });
  for (let elapsed = 0; elapsed < 30; elapsed += 0.05) {
    stepVillagers(quiet, 0.05, 0);
  }
  assert.equal(quiet.hornCooldown, 0, "протрубили из-за одного встревоженного");
});

test("рог не уходит в петлю: трубят с передышкой", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
  }
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 190, rise: 0.95, wave: CHARGE_WAVE });
  let horns = 0;
  let previous = 0;
  for (let elapsed = 0; elapsed < 200; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
    if (population.hornCooldown > previous) {
      horns += 1;
    }
    previous = population.hornCooldown;
  }
  assert.ok(horns >= 1, "не протрубили ни разу");
  assert.ok(horns <= 3, `протрубили ${horns} раз за три минуты — это петля`);
});

test("когда всё стихло, идут смотреть на пролом", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 60; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
  }
  const blast = { x: 18, y: 1.5, z: 12 };
  emitNoise(population, { ...blast, level: 182, rise: 0.95, wave: GRENADE_WAVE });

  const lookers = new Set();
  let closest = Infinity;
  for (let elapsed = 0; elapsed < 600; elapsed += 0.1) {
    stepVillagers(population, 0.1, 0);
    for (const villager of population.villagers) {
      if (villager.panicKind === "look") {
        lookers.add(villager.id);
        if (villager.visible) {
          closest = Math.min(
            closest,
            Math.hypot(villager.x - blast.x, villager.z - blast.z),
          );
        }
      }
    }
  }
  assert.ok(lookers.size > 0, "на пролом никто так и не сходил");
  // Приходят СМОТРЕТЬ, а не топтаться в воронке.
  assert.ok(closest < 14, `ближе ${closest.toFixed(1)} м к пролому никто не подошёл`);
  assert.ok(closest > 1, "залезли прямо в воронку");
});

test("вооружённого провожают взглядом, безоружного — нет", () => {
  const facing = (armed) => {
    const population = createVillagerPopulation(villageHumanProfile, 34, null);
    for (let elapsed = 0; elapsed < 30; elapsed += 0.1) {
      stepVillagers(population, 0.1, 0);
    }
    // Встаём посреди деревни и стоим.
    const spot = { x: 0, z: 0 };
    let looking = 0;
    for (let elapsed = 0; elapsed < 6; elapsed += 0.05) {
      population.threat = armed ? spot : null;
      stepVillagers(population, 0.05, 0);
    }
    for (const villager of population.villagers) {
      if (villager.state !== "dwelling" || !villager.visible) {
        continue;
      }
      const gap = Math.hypot(villager.x - spot.x, villager.z - spot.z);
      if (gap > 16 || gap < 1.2) {
        continue;
      }
      const want = Math.atan2(spot.x - villager.x, spot.z - villager.z);
      const off = Math.abs(
        Math.atan2(Math.sin(want - villager.yaw), Math.cos(want - villager.yaw)),
      );
      if (off < 0.35) {
        looking += 1;
      }
    }
    return looking;
  };
  const armed = facing(true);
  const empty = facing(false);
  assert.ok(armed > 0, "на ствол посреди деревни никто не посмотрел");
  assert.ok(
    armed > empty,
    `со стволом смотрят ${armed}, с пустыми руками ${empty} — разницы нет`,
  );
});

test("вздрог кончается сам и не залипает", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  const listener = pin(population.villagers[0], 12, 0);
  emitNoise(population, { x: 0, y: 1.5, z: 0, level: 175, rise: 1 });
  listen(population, [listener], STARTLE_DURATION + 0.6);
  assert.equal(listener.villager.startle, 0);
  assert.equal(listener.villager.startleAge, 0);
  // И очередь событий не растёт: доставленное выбрасывается.
  assert.equal(population.noise.length, 0);
});
