import assert from "node:assert/strict";
import test from "node:test";
import { runDuel, summarise } from "./air-combat-rig.mjs";
import { combatHexacopterRangeDocument } from "../games/make-a-mess/src/content/scenes/combatHexacopterRangeDocument.ts";

/** Небо берётся из документа мира, а не переписывается сюда числом. */
const RANGE_SKY_RADIUS = combatHexacopterRangeDocument.world.skyRadius;

/**
 * Приёмка воздушного боя. Сам стенд — `air-combat-rig.mjs`: он вынесен из
 * теста, потому что тем же кодом гоняется доводочная диагностика, а
 * диагностика не должна тащить за собой приёмку.
 */

test("RAX находит чужой борт и доводит бой до отказа цели", () => {
  const report = runDuel({ seconds: 150 });
  console.log(`\n[дуэль: злой маршрут]\n  ${summarise(report)}\n`);

  assert.notEqual(report.outcome, "survived", "цель обязана быть сбита");
  assert.ok(report.passes >= 1, "бой обязан состоять из заходов");
  assert.ok(
    report.cannonBladeKills + report.rocketBladeKills >= 2,
    "отказ обязан прийти от снятых лопастей, а не сам по себе",
  );
});

test("ни одного пуска внутри собственного радиуса поражения", () => {
  const report = runDuel({ seconds: 150 });
  assert.equal(report.selfDamage, 0, "машина не имеет права подрывать себя");
});

test("бой ИДЁТ ЗАХОДАМИ, а не одним бесконечным преследованием", () => {
  const report = runDuel({ seconds: 150 });
  const attack = report.modeSeconds.attack ?? 0;
  const total = report.seconds;
  assert.ok(
    attack < total * 0.85,
    `в атаке ${attack.toFixed(1)} из ${total.toFixed(1)} с — заход перестал быть проходом`,
  );
  assert.ok(
    (report.modeSeconds.break ?? 0) > 0,
    "срыв обязан быть отдельной фазой, а не мгновением",
  );
});

test("бой не решается первым же проходом: цель переживает хотя бы один заход", () => {
  // Вердикт Igor: «нормально и даже желательно, чтобы атакующий не сбивал цель
  // с первого раза; не сбил — продолжает охотиться». Это требование к РИТМУ, а
  // не к точности: заход даёт одну огневую возможность, и её по построению не
  // хватает на две соседние стороны.
  for (const targetKind of ["evasive", "circuit"]) {
    const report = runDuel({ seconds: 150, targetKind });
    assert.ok(
      report.passes >= 2,
      `${targetKind}: бой кончился за ${report.passes} заход(а) — машина бьёт на поражение сразу`,
    );
  }
});

test("охота не упирается в боекомплект: работают оба ствола", () => {
  const report = runDuel({ seconds: 150 });
  // Настойчивость: пушка работает в тех же заходах, а не «когда-нибудь потом»,
  // и под не запирается счётчиком — расход держат темп и один рипл на заход.
  assert.ok(report.cannonShots > 0, "пушка обязана участвовать в бою");
  assert.ok(report.rocketsFired > 0, "под обязан участвовать в бою");
  assert.ok(
    report.rocketsFired <= report.passes * 3,
    `${report.rocketsFired} ракет на ${report.passes} заходов — правило одного рипла нарушено`,
  );
});

test("злой маршрут ДЕЙСТВИТЕЛЬНО труднее ровного круга", () => {
  const easy = runDuel({ seconds: 150, targetKind: "circuit" });
  const hard = runDuel({ seconds: 150, targetKind: "evasive" });
  console.log(
    `\n[ровный круг]\n  ${summarise(easy)}\n\n[злой маршрут]\n  ${summarise(hard)}\n`,
  );
  // Одинаковые числа почти всегда означают, что правка не подключена, а не что
  // она нейтральна.
  assert.notEqual(
    easy.seconds.toFixed(1),
    hard.seconds.toFixed(1),
    "маршрут цели не влияет на бой — значит он не подключён",
  );
  assert.ok(
    hard.seconds > easy.seconds,
    `на злом маршруте цель обязана жить дольше: ${hard.seconds.toFixed(1)} против ${easy.seconds.toFixed(1)}`,
  );
});

// ---------------------------------------------------------------------------
// СОСЕД ПО ПОЛИГОНУ
// ---------------------------------------------------------------------------

/**
 * Один прогон на все утверждения ниже: дуэль в полтораста секунд стоит дорого,
 * а вопросы к ней разные и независимые.
 */
const yaqui = runDuel({ seconds: 150, target: "vx8" });

test("НЕБО ПОКРЫВАЕТ ВСЁ, ЧТО ЛЕТИТ, — и дальше всех летит промах", () => {
  console.log(`
[дуэль: RAX-8 против VX-8]
  ${summarise(yaqui)}
`);
  // Купол рисуется конечным радиусом; вышедшее за него оказывается нарисовано
  // на пустоте. Предел задаёт НЕ машина: ракета, не нашедшая цели, летит, пока
  // не кончится взрыватель, — 173 м от точки пуска, где бы та ни случилась.
  assert.ok(
    yaqui.reachRockets > yaqui.reachMachines,
    `ракеты (${yaqui.reachRockets.toFixed(0)} м) не обогнали машины (${yaqui.reachMachines.toFixed(0)} м) — замер подозрителен`,
  );
  assert.ok(
    yaqui.reachRockets < RANGE_SKY_RADIUS,
    `ракеты уходят на ${yaqui.reachRockets.toFixed(0)} м при небе ${RANGE_SKY_RADIUS} м`,
  );
  assert.ok(
    yaqui.reachMachines < RANGE_SKY_RADIUS,
    `машины уходят на ${yaqui.reachMachines.toFixed(0)} м при небе ${RANGE_SKY_RADIUS} м`,
  );
});

test("СОСЕД — ЦЕЛЬ ДРУГОГО КЛАССА, а не тот же гость побыстрее", () => {
  const guest = runDuel({ seconds: 150, target: "hx6" });
  // Разница обязана быть в ИСХОДЕ, а не в оттенках. Гость города сбивается;
  // соседняя боевая машина переживает те же полтораста секунд.
  assert.notEqual(guest.outcome, "survived", "гость обязан быть сбит");
  // И вот почему, числом: атакующему объявлено 21 м/с, а сосед идёт по прямым
  // тридцать. ДОГНАТЬ ЕГО НЕЛЬЗЯ — можно только встретить. Отсюда и время на
  // станции: преследование вырождается в ожидание.
  const stationSeconds = yaqui.modeSeconds.station ?? 0;
  assert.ok(
    stationSeconds > yaqui.seconds * 0.3,
    `на станции ${stationSeconds.toFixed(0)} из ${yaqui.seconds.toFixed(0)} с — ` +
      "погоня перестала быть безнадёжной, и это повод переписать утверждение, а не радоваться",
  );
});

test("ЦЕЛЬ, ПОТЕРЯВШАЯ ВЛАСТЬ, ФИГУР НЕ КРУТИТ — ворота считают то же, что в показе", () => {
  // VX-8 объявляет пять номеров, но в бою не отработал ни одного, и причина
  // названа воротами поимённо: «недобор власти». К моменту, когда номер
  // наступает, машина уже без колец.
  //
  // Это правильное поведение и одновременно приговор нынешней раскладке:
  // фигура привязана к ДОЛЕ ТРАССЫ, а не к угрозе. Кульбит как средство
  // разорвать заход обязан вызываться боем, а не точкой маршрута, — иначе он
  // случается тогда, когда уже поздно.
  assert.ok(
    yaqui.targetSkips.length > 0,
    "цель не пропустила ни одного номера — раскладка изменилась, утверждение пора пересмотреть",
  );
  assert.ok(
    yaqui.targetSkips.every((reason) => reason.includes("власти")),
    `пропуски не по власти: ${[...new Set(yaqui.targetSkips)].join("; ")}`,
  );
});
