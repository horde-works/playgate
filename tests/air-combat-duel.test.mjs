import assert from "node:assert/strict";
import test from "node:test";
import { runDuel, summarise } from "./air-combat-rig.mjs";

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

test("боекомплект кончился — охота продолжается пушкой", () => {
  const report = runDuel({ seconds: 150 });
  // Настойчивость: пушка обязана работать в тех же заходах, а не «когда-нибудь».
  assert.ok(report.cannonShots > 0, "пушка обязана участвовать в бою");
  assert.ok(
    report.rocketsFired <= 12,
    "под не может выдать больше, чем в нём труб",
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
