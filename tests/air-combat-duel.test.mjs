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
  // Разница обязана быть в ИСХОДЕ, а не в оттенках. Гость города сбивается за
  // сорок с небольшим секунд; соседняя боевая машина переживает все полтораста.
  assert.notEqual(guest.outcome, "survived", "гость обязан быть сбит");
  assert.equal(
    yaqui.outcome,
    "survived",
    "сосед перестал переживать бой — это хорошая новость и повод переписать утверждение",
  );
});

test("ОХОТНИК НЕ СТОИТ НА СТАНЦИИ, пока цель в воздухе", () => {
  // ЭТО УТВЕРЖДЕНИЕ ЗАМЕНИЛО СВОЮ ПРОТИВОПОЛОЖНОСТЬ, и историю стоит помнить.
  //
  // Пока тело вели в саму цель, погоня за тем, кто быстрее, не сходилась
  // никогда: RAX-8 простаивал СТО ПЯТЬ секунд из полутораста, а прежняя
  // редакция этого теста закрепляла безнадёжность как факт — с припиской, что
  // её исправление будет поводом переписать утверждение. Оно и вышло.
  //
  // Лечение — одна величина: упреждение тела берётся не меньшим, чем
  // упреждение прицела, и равным времени встречи, когда то больше. Погоня
  // превратилась во встречу, станция обнулилась, заходов стало вчетверо
  // больше, а первое попадание пришло на пятой секунде вместо двадцать первой.
  const stationSeconds = yaqui.modeSeconds.station ?? 0;
  assert.ok(
    stationSeconds < yaqui.seconds * 0.05,
    `на станции ${stationSeconds.toFixed(0)} из ${yaqui.seconds.toFixed(0)} с — охотник снова ждёт вместо того, чтобы охотиться`,
  );
  assert.ok(
    yaqui.passes >= 15,
    `заходов всего ${yaqui.passes}: бой перестал быть непрерывным`,
  );
  assert.ok(
    yaqui.firstBloodAt !== null && yaqui.firstBloodAt < 12,
    `первое попадание на ${yaqui.firstBloodAt}-й секунде`,
  );
});

test("ПОД ОГНЁМ ЦЕЛЬ ВСЁ ЕЩЁ КРУТИТ СВОИ НОМЕРА — и это проверяемо", () => {
  // Прежде VX-8 не отрабатывал в бою НИ ОДНОГО номера: к моменту, когда номер
  // наступал по трассе, машина была уже без колец, и ворота отказывали ей
  // поимённо — «недобор власти». Ворота были правы; неправ был бой, который
  // ломал цель за двадцать секунд, ничего при этом не добивая.
  //
  // Теперь охотник работает непрерывно, но и цель доживает до своих номеров:
  // замер даёт семь-восемь фигур за полтораста секунд, включая оба кульбита.
  const keys = yaqui.targetFigures.map((entry) => entry.key);
  assert.ok(
    keys.length >= 5,
    `цель отработала ${keys.length} номеров: ${keys.join(", ") || "ни одного"}`,
  );
  assert.ok(
    keys.some((key) => key.startsWith("kulbit")),
    "кульбит обязан состояться под огнём — иначе его не увидит никто",
  );
  // А ворота остаются воротами: когда власть просядет, номер не начнётся, и
  // причина будет названа, а не проглочена.
  assert.ok(
    yaqui.targetSkips.every((reason) => /власти|высоты|ход мал|неба/.test(reason)),
    `пропуски по неизвестной причине: ${[...new Set(yaqui.targetSkips)].join("; ")}`,
  );
});
