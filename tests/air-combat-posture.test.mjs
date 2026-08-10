import assert from "node:assert/strict";
import test from "node:test";
import { rotateVector } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import {
  aimAttitude,
  bodyHolding,
  BODY_UNREPORTED,
  lineOfSightRotation,
  solvePosture,
  sustainableAimElevation,
} from "../games/make-a-mess/src/game/airCombatPosture.ts";

/**
 * ЧУВСТВО ТЕЛА И ПОЗА ПОД ПРИЦЕЛ.
 *
 * Тут проверяется то, ради чего модуль заведён: что вектор курса у этой машины
 * действительно ЛЮБОЙ, что цена этому выводится, а не назначается, и что момент
 * «сейчас свалюсь» есть неравенство, а не таймер.
 */

const GRAVITY = 9.81;
/** Нос авторской позы: вдоль +Z, как у машин полигона. */
const NOSE = [0, 1];
/** RAX-8, замеренный паспорт: резерв 4.2, тоннели 24.81 м/с². */
const RAX = { liftReserve: 4.2, surgeAcceleration: 24.81 };
/** Машина без тоннелей — чтобы видеть, что именно они дают. */
const PLAIN = { liftReserve: 4.2, surgeAcceleration: 0 };

const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const close = (a, b, tolerance = 1e-6) =>
  Math.abs(a[0] - b[0]) < tolerance &&
  Math.abs(a[1] - b[1]) < tolerance &&
  Math.abs(a[2] - b[2]) < tolerance;

test("ПОЗА ВЕДЁТ СТВОЛ КУДА ВЕЛЕНО — включая отвес и перевёрнутое", () => {
  for (const aim of [
    [0, 0, 1],
    [1, 0, 0],
    [0, 0, -1],
    [0, -1, 0],
    [0, 1, 0],
    unit([1, 1, 1]),
    unit([-2, -3, 0.5]),
  ]) {
    const attitude = aimAttitude(NOSE, aim, [0, 1, 0]);
    const pointed = rotateVector(attitude, [NOSE[0], 0, NOSE[1]]);
    assert.ok(
      close(pointed, aim, 1e-6),
      `ствол ушёл в ${pointed.map((v) => v.toFixed(3))} вместо ${aim.map((v) => v.toFixed(3))}`,
    );
  }
});

test("КРЕН ВОКРУГ ОСИ ОГНЯ СВОБОДЕН: «вверх» ставится куда угодно, прицел не двигается", () => {
  const aim = unit([0, -0.6, 1]);
  // Четыре разных «вверх», все перпендикулярные стволу.
  const starboard = unit([1, 0, 0]);
  const overhead = unit([
    aim[1] * starboard[2] - aim[2] * starboard[1],
    aim[2] * starboard[0] - aim[0] * starboard[2],
    aim[0] * starboard[1] - aim[1] * starboard[0],
  ]);
  for (let turn = 0; turn < 4; turn += 1) {
    const angle = (turn * Math.PI) / 2;
    const up = unit([
      overhead[0] * Math.cos(angle) + starboard[0] * Math.sin(angle),
      overhead[1] * Math.cos(angle) + starboard[1] * Math.sin(angle),
      overhead[2] * Math.cos(angle) + starboard[2] * Math.sin(angle),
    ]);
    const attitude = aimAttitude(NOSE, aim, up);
    const pointed = rotateVector(attitude, [NOSE[0], 0, NOSE[1]]);
    const bodyUp = rotateVector(attitude, [0, 1, 0]);
    assert.ok(close(pointed, aim, 1e-6), `крен ${turn} сбил прицел`);
    assert.ok(close(bodyUp, up, 1e-6), `крен ${turn} не поставил «вверх»`);
  }
});

test("РОВНЫЙ ПОЛЁТ БЕЗ ЗАКАЗА — РОВНАЯ ПОЗА И ВИСЕНИЕ", () => {
  const solved = solvePosture(NOSE, [0, 0, 1], [0, 0, 0], RAX);
  const bodyUp = rotateVector(solved.attitude, [0, 1, 0]);
  assert.ok(close(bodyUp, [0, 1, 0], 1e-6), `тело завалено: ${bodyUp}`);
  assert.ok(
    Math.abs(solved.liftFraction) < 1e-6,
    `газ ${solved.liftFraction} вместо висения`,
  );
  assert.ok(Math.abs(solved.surge) < 1e-6, "тоннелям на ровном месте делать нечего");
  assert.equal(solved.feasible, true);
});

test("СТВОЛ ВНИЗ — ВЕС ПЕРЕХВАТЫВАЮТ ТОННЕЛИ, И ВИНТАМ СТАНОВИТСЯ ЛЕГЧЕ", () => {
  // Это главный вывод модуля и он контринтуитивный: наклон ствола не удорожает
  // висение, а удешевляет, потому что продольная тяга разворачивается вверх.
  const level = solvePosture(NOSE, [0, 0, 1], [0, 0, 0], RAX);
  const tilted = solvePosture(NOSE, unit([0, -1, 1]), [0, 0, 0], RAX);
  const plumb = solvePosture(NOSE, [0, -1, 0], [0, 0, 0], RAX);

  assert.ok(
    tilted.liftFraction < level.liftFraction,
    `под 45° газ ${tilted.liftFraction.toFixed(3)} обязан быть меньше ровного ${level.liftFraction.toFixed(3)}`,
  );
  // На отвесном стволе поперечной составляющей нет вовсе: винты не нужны.
  assert.ok(
    Math.abs(plumb.liftFraction + 1) < 1e-6,
    `на отвесе газ ${plumb.liftFraction.toFixed(3)}, а должен быть −1 (винты выключены)`,
  );
  // ...а весь вес держит реверс тоннелей, и ровно в один g.
  assert.ok(
    Math.abs(plumb.surge + GRAVITY) < 1e-6,
    `тоннели дают ${plumb.surge.toFixed(2)} вместо −${GRAVITY}`,
  );
  assert.equal(plumb.feasible, true);
});

test("ВЕКТОР КУРСА ЛЮБОЙ — И ЭТО СВОЙСТВО ТОННЕЛЕЙ, А НЕ ЛОЗУНГ", () => {
  // У машины с тоннелями сильнее g предел возвышения вырождается в прямой угол.
  assert.ok(
    Math.abs(sustainableAimElevation(RAX) - Math.PI / 2) < 1e-9,
    `RAX ограничен ${((sustainableAimElevation(RAX) * 180) / Math.PI).toFixed(1)}°`,
  );
  // А без тоннелей ствол и тяга — одна ось, и отвернуть его, оставшись на
  // месте, нельзя вовсе.
  assert.equal(sustainableAimElevation(PLAIN), 0);
  // И это видно в разложении: та же поза, но держать её нечем вдоль оси.
  const plumb = solvePosture(NOSE, [0, -1, 0], [0, 0, 0], PLAIN);
  assert.equal(plumb.surge, 0, "тоннелей нет — продольной тяги нет");
  assert.equal(plumb.limit, "surge", "и упрётся именно в неё");
});

test("«СЕЙЧАС СВАЛЮСЬ» — ЭТО НЕРАВЕНСТВО ПО ПОПЕРЕЧНОЙ СОСТАВЛЯЮЩЕЙ", () => {
  const aim = [0, 0, 1];
  // Поперёк ствола заказано больше, чем винты могут дать: 4.2 g — предел.
  const beyond = solvePosture(NOSE, aim, [0, 5 * GRAVITY, 0], RAX);
  assert.equal(beyond.feasible, false);
  assert.equal(beyond.limit, "lift");
  assert.equal(beyond.margin, 0);
  // Срезано ровно до предела, а не до нуля: поза строится по исполнимой части.
  assert.ok(
    Math.abs(beyond.liftFraction - (RAX.liftReserve - 1)) < 1e-6,
    `срезано до ${beyond.liftFraction.toFixed(2)}, а предел ${(RAX.liftReserve - 1).toFixed(2)}`,
  );
  // А внутри предела остаток убывает монотонно — это и есть «чувство».
  const easy = solvePosture(NOSE, aim, [0, 0, 0], RAX);
  const hard = solvePosture(NOSE, aim, [0, 2 * GRAVITY, 0], RAX);
  assert.ok(easy.feasible && hard.feasible);
  assert.ok(
    easy.margin > hard.margin,
    `остаток не убывает: ${easy.margin.toFixed(2)} против ${hard.margin.toFixed(2)}`,
  );
});

test("ПОПЕРЕЧНОЕ УСКОРЕНИЕ БЕРЁТСЯ КРЕНОМ, И ПРИЦЕЛ ОТ ЭТОГО НЕ ЕДЕТ", () => {
  const aim = [0, 0, 1];
  // Просят уйти вправо (+X) с полутора g. Прицел обязан остаться на месте, а
  // тело — завалиться в ту сторону, куда нужна тяга.
  const solved = solvePosture(NOSE, aim, [1.5 * GRAVITY, 0, 0], RAX);
  const pointed = rotateVector(solved.attitude, [NOSE[0], 0, NOSE[1]]);
  const bodyUp = rotateVector(solved.attitude, [0, 1, 0]);
  assert.ok(close(pointed, aim, 1e-6), `прицел уехал в ${pointed}`);
  assert.ok(bodyUp[0] > 0.5, `тяга не наклонена вправо: ${bodyUp}`);
  assert.ok(bodyUp[1] > 0.5, "и вертикаль при этом не потеряна");
  // Величина тяги — гипотенуза: вес и поперечное вместе.
  const wanted = Math.hypot(GRAVITY, 1.5 * GRAVITY) / GRAVITY - 1;
  assert.ok(Math.abs(solved.liftFraction - wanted) < 1e-6);
});

test("ТЕМП ПОЗЫ — ЭТО ТЕМП ЛИНИИ ВИЗИРОВАНИЯ", () => {
  // Цель в ста метрах по +Z идёт поперёк со скоростью 20 м/с по +X.
  // Линия визирования уходит с темпом 20/100 = 0.2 рад/с вокруг +Y — тем же
  // соглашением, каким живёт весь проект: вращение вокруг +Y ведёт +Z к +X.
  const omega = lineOfSightRotation([0, 0, 100], [20, 0, 0]);
  assert.ok(Math.abs(Math.hypot(omega[0], omega[1], omega[2]) - 0.2) < 1e-9);
  assert.ok(Math.abs(omega[1] - 0.2) < 1e-9, `ось вращения ${omega}`);
  // Уход строго вдоль линии визирования её не вращает вовсе.
  const closing = lineOfSightRotation([0, 0, 100], [0, 0, -30]);
  assert.ok(close(closing, [0, 0, 0], 1e-12));
  // Вблизи нуля темп не считается: делить на квадрат дальности там нельзя.
  assert.ok(close(lineOfSightRotation([0, 0, 0.5], [20, 0, 0]), [0, 0, 0], 1e-12));
});

test("ОТЧЁТ ТЕЛА: молчание означает «держу», а не «падаю»", () => {
  assert.equal(bodyHolding(BODY_UNREPORTED), true);
  // Поза не строится вовсе — машина висит в той, что была.
  assert.equal(bodyHolding({ ...BODY_UNREPORTED, maneuverScale: 0 }), false);
  // Недобор в четверть — ещё вялость, половина — уже потеря управления.
  assert.equal(bodyHolding({ ...BODY_UNREPORTED, maneuverScale: 0.75 }), true);
  assert.equal(bodyHolding({ ...BODY_UNREPORTED, maneuverScale: 0.45 }), false);
});

test("ВЛАСТЬ ПО ОСЯМ — НЕ ПРИЗНАК ПАДЕНИЯ, и это замер, а не мнение", () => {
  // Первая редакция читала ещё и `authority` по трём каналам порогом 0.5.
  // Замер убил это за один прогон: власть по тангажу и крену проваливается в
  // ноль постоянно — и в сближении, и на срыве, где позой никто не командует и
  // машина летит безупречно. Причина простая: `authority` есть ДОЛЯ
  // ИСПОЛНЕННОГО ОТ ЗАКАЗАННОГО, и на почти нулевом заказе она вырождается.
  // Ноль от малого — это «не просили», а не «не смогла».
  //
  // Тест сторожит именно это: пока поза строится, никакой провал власти не
  // объявляет падения. Иначе заход срывался четыре раза в секунду на ровном
  // месте, что и происходило.
  assert.equal(
    bodyHolding({ maneuverScale: 1, thrust: 0, pitch: 0, roll: 0 }),
    true,
  );
});
