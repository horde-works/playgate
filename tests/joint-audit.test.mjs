import assert from "node:assert/strict";
import test from "node:test";
import { auditScene, loadScene, sceneNames } from "../tools/joint-audit.mjs";

/**
 * БЮДЖЕТ СТЫКОВ ПО МИРАМ.
 *
 * Считаются две величины, обе — про то, что видит игрок, а не про то, что
 * держит нагрузку (за нагрузку отвечает `resolveStructuralCollapse`, и он к
 * щели в сантиметр совершенно равнодушен):
 *
 *   - СКВОЗНЫЕ ЩЕЛИ В ПЛОСКОСТИ — разрыв между соседями по курсу, в который
 *     не заходит никакая другая геометрия и сквозь который луч уходит в
 *     воздух с обеих сторон. Это «видно небо в стене» и «видно этаж под
 *     полом»;
 *   - НАЛОЖЕНИЯ — две сонаправленные грани в одной плоскости с перекрытием по
 *     площади, спорящие за пиксели ближе 60 м. Это «рябит».
 *
 * Цифры — ПОТОЛКИ, а не цели. Смысл теста ровно один: ни одно из чисел не
 * должно вырасти. Опустилось — опустить и потолок тем же коммитом, иначе
 * следующая регрессия спрячется под запасом.
 *
 * Почему потолки, а не ноль. Часть находок — принятые решения (накладной
 * декор, притирка облицовки), часть — незакрытый долг, снятый замером
 * 10.08.2026 и перечисленный в скилле world-building, §2. Ноль здесь означал
 * бы, что весь долг закрыт, а он не закрыт.
 */
const BUDGET = {
  town: { seeThrough: 459, fights: 117 },
  terminal: { seeThrough: 148, fights: 289 },
  viking: { seeThrough: 180, fights: 62 },
  basalt: { seeThrough: 5, fights: 82 },
  polder: { seeThrough: 34, fights: 353 },
  astana: { seeThrough: 141, fights: 1082 },
  nimbus: { seeThrough: 552, fights: 2086 },
  range: { seeThrough: 0, fights: 3 },
};

// Разбор сцены стоит секунды, а нужен двум проверкам сразу. Считаем один раз
// на мир и переиспользуем — иначе набор удваивается на ровном месте.
const reports = new Map();
const reportFor = async (name) => {
  if (!reports.has(name)) reports.set(name, auditScene(name, await loadScene(name)));
  return reports.get(name);
};

test("бюджет стыков: у каждого мира есть потолок", () => {
  assert.deepEqual(
    Object.keys(BUDGET).sort(),
    [...sceneNames].sort(),
    "новый мир обязан получить свою строку бюджета, а не проехать мимо проверки",
  );
});

for (const name of sceneNames) {
  test(`стыки: ${name} не расходятся и не рябят сильнее прежнего`, async () => {
    const report = await reportFor(name);
    const seeThrough = report.seams.filter(
      (seam) => !seam.layered && seam.openSides === 2,
    );
    const fights = report.fights.filter((fight) => fight.onset < 60);
    const worst = (rows, key) =>
      rows.length
        ? ` худшая: ${rows.map((row) => `${row.a} × ${row.b} (${key(row)})`)[0]}`
        : "";

    assert.ok(
      seeThrough.length <= BUDGET[name].seeThrough,
      `${name}: сквозных щелей ${seeThrough.length} против потолка `
        + `${BUDGET[name].seeThrough}.${worst(seeThrough, (row) => `${Math.round(row.gap * 1000)} мм`)}`,
    );
    assert.ok(
      fights.length <= BUDGET[name].fights,
      `${name}: наложений ${fights.length} против потолка ${BUDGET[name].fights}.`
        + `${worst(fights, (row) => `грань ${row.facing}, δ ${Math.round(row.delta * 1000)} мм`)}`,
    );
  });
}

/**
 * Отдельно и жёстко: ПЛИТОЧНОЕ ПОКРЫТИЕ НЕ ПЕРЕКРЫВАЕТСЯ САМО С СОБОЙ.
 *
 * Грунт, мостовая, перрон и балласт мостятся сеткой из `groundTile`. Соблазн
 * взять плитку чуть шире шага, чтобы «наверняка не было щели», стоил игре
 * решётки ряби с шагом плитки во ВСЕХ мирах сразу: у соседей совпадала верхняя
 * плоскость, а тон у них разный, поэтому спор виден как шум.
 *
 * Правило: размер плитки равен шагу. Тогда грани соседей совпадают ТОЧНО, и
 * это единственное безопасное состояние — ошибка округления даёт зазор или
 * нахлёст микронной ширины, то есть меньше пикселя. Нахлёст в сантиметры такой
 * милости не знает: он виден всегда и на любом удалении.
 *
 * Ноль — по всем сеткам. Единственное исключение объявлено числом ниже: у
 * «Астаны» мостовая кладётся не сеткой, а ПОЛИЛИНИЕЙ (`addCellSegment`), и на
 * изломе трассы два соседних звена накрывают угол вдвоём. Это другая задача —
 * зарезать угол на ус, — и она стоит дороже четырёх находок. Число держится
 * здесь ровно затем, чтобы оно не выросло незаметно.
 */
const TILE_OVERLAP_ALLOWANCE = {
  astana: 4, // изломы полилиний причала Атырау
};

test("плиточные покрытия примыкают, а не перекрываются", async () => {
  const byScene = new Map(sceneNames.map((name) => [name, []]));
  for (const name of sceneNames) {
    const report = await reportFor(name);
    for (const fight of report.fights) {
      if (fight.facing !== "+Y" || fight.delta > 1e-6) continue;
      if (!report.tileIds.has(fight.a) || !report.tileIds.has(fight.b)) continue;
      byScene.get(name).push(`${fight.a} × ${fight.b}`);
    }
  }
  for (const [name, offenders] of byScene) {
    const allowed = TILE_OVERLAP_ALLOWANCE[name] ?? 0;
    assert.ok(
      offenders.length <= allowed,
      `${name}: плитка перекрывается ${offenders.length} раз при допуске ${allowed}.\n`
        + offenders.slice(0, 6).map((line) => `  ${line}`).join("\n"),
    );
  }
});
