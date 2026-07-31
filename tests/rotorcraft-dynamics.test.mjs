import assert from "node:assert/strict";
import test from "node:test";
import {
  mixRotorThrust,
  rotorcraftAttitudeMoment,
  rotorcraftAttitudeTarget,
  rotorcraftMaximumAcceleration,
} from "../games/make-a-mess/src/game/rotorcraftDynamics.ts";
import {
  HEXACOPTER_DUCTS,
  hexacopterDuctPoint,
  hexacopterPoint,
} from "../games/make-a-mess/src/game/townHexacopter.ts";

const points = HEXACOPTER_DUCTS.map((station) => hexacopterDuctPoint(station));
const centre = hexacopterPoint(0, 0, 1);
const nose = [-1, 0, 0];
const base = {
  points,
  centreOfMass: centre,
  nose,
  availability: points.map(() => 1),
  capacity: 1000,
};

test("горизонт у коптера рождается наклоном, и его предел — из наклона", () => {
  const tilt = (25 * Math.PI) / 180;
  // a = g·tan θ. Никакого отдельного «бокового движителя» в этом нет.
  assert.equal(
    Math.abs(rotorcraftMaximumAcceleration(tilt) - 9.81 * Math.tan(tilt)) < 1e-9,
    true,
  );
  const target = rotorcraftAttitudeTarget(
    { forward: 2.5, lateral: 0 },
    tilt,
  );
  assert.equal(Math.abs(target.pitch - Math.atan(2.5 / 9.81)) < 1e-9, true);
  assert.equal(target.roll, 0);
});

test("наклон ограничен паспортным, сколько ускорения ни проси", () => {
  const tilt = (20 * Math.PI) / 180;
  const target = rotorcraftAttitudeTarget(
    { forward: 100, lateral: -100 },
    tilt,
  );
  assert.equal(Math.abs(target.pitch - tilt) < 1e-9, true);
  assert.equal(Math.abs(target.roll + tilt) < 1e-9, true);
});

test("микшер держит висение: ровная тяга, нулевые моменты", () => {
  const mix = mixRotorThrust(base, {
    collective: 1,
    pitchMoment: 0,
    rollMoment: 0,
  });
  assert.equal(mix.thrust.length, 6);
  for (const value of mix.thrust) {
    assert.equal(Math.abs(value - 1000 / 6) < 1e-6, true);
  }
  assert.equal(Math.abs(mix.deliveredPitchMoment) < 1e-6, true);
  assert.equal(Math.abs(mix.deliveredRollMoment) < 1e-6, true);
});

test("момент доступен и на полном газе — убавлением противоположной стороны", () => {
  // Прибавить нельзя, но убавить встречной стороне можно всегда. Поэтому
  // управляемость на полном газе не пропадает; пропадает часть суммарной
  // тяги, и машина на манёвре проседает. Ужимать ради момента общий газ —
  // ошибка: это отнимает подъём ровно тогда, когда он нужнее всего.
  const saturated = mixRotorThrust(base, {
    collective: 1,
    pitchMoment: 200,
    rollMoment: 0,
  });
  assert.equal(
    saturated.deliveredPitchMoment > 200 * 0.4,
    true,
    `на полном газе выдано всего ${saturated.deliveredPitchMoment.toFixed(1)} из 200`,
  );
  assert.equal(
    saturated.deliveredThrust < 1000,
    true,
    "момент не стоил машине ни грамма тяги — так не бывает",
  );
});

test("рыскание — перекос реактивных моментов, а не отдельный орган", () => {
  const mix = mixRotorThrust(base, {
    collective: 0.5,
    pitchMoment: 0,
    rollMoment: 0,
    yawMoment: 40,
  });
  // Одна пара ускоряется, встречная замедляется: суммарная тяга та же.
  assert.equal(Math.abs(mix.deliveredThrust - 500) < 1, true);
  assert.equal(Math.abs(mix.deliveredYawMoment - 40) < 1, true);
  // И ни крена, ни тангажа это не создаёт: винты чередуются по кругу.
  assert.equal(Math.abs(mix.deliveredPitchMoment) < 1, true);
  assert.equal(Math.abs(mix.deliveredRollMoment) < 1, true);
});

test("нос вниз — это больше тяги СЗАДИ, а не спереди", () => {
  const mix = mixRotorThrust(base, {
    collective: 0.5,
    pitchMoment: 200,
    rollMoment: 0,
  });
  // Станции 0 и 5 — носовые (a > 0), 2 и 3 — кормовые (a < 0).
  const bow = (mix.thrust[0] + mix.thrust[5]) / 2;
  const stern = (mix.thrust[2] + mix.thrust[3]) / 2;
  assert.equal(stern > bow, true, `корма ${stern.toFixed(1)} нос ${bow.toFixed(1)}`);
  assert.equal(Math.abs(mix.deliveredPitchMoment - 200) < 1, true);
});

test("крен поднимает один борт и опускает другой", () => {
  const mix = mixRotorThrust(base, {
    collective: 0.5,
    pitchMoment: 0,
    rollMoment: 150,
  });
  // Борт определяется ТАК ЖЕ, как его считает физика: правый = up × forward
  // в правой системе координат. Опираться здесь на авторскую ось документа
  // нельзя — она у машины оказалась зеркальной, и тест бы это скрыл.
  const lateralArm = (point) => {
    const dx = point[0] - centre[0];
    const dz = point[2] - centre[2];
    return dx * nose[2] - dz * nose[0];
  };
  const starboard = mix.thrust.filter((_, index) => lateralArm(points[index]) > 0);
  const port = mix.thrust.filter((_, index) => lateralArm(points[index]) < 0);
  const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;
  assert.equal(mean(port) > mean(starboard), true);
  assert.equal(Math.abs(mix.deliveredRollMoment - 150) < 1, true);
});

test("винт не тянет вниз и не даёт больше своего предела", () => {
  const mix = mixRotorThrust(base, {
    collective: 1,
    pitchMoment: 100000,
    rollMoment: 0,
  });
  for (const value of mix.thrust) {
    assert.equal(value >= 0, true, "винт потянул вниз");
    assert.equal(value <= 1000 / 6 + 1e-6, true, "винт превысил свой предел");
  }
  // После зажима момент честно меньше запрошенного: автоматика обязана знать,
  // чего она НЕ получила.
  assert.equal(mix.deliveredPitchMoment < 100000, true);
});

test("потерянное кольцо не даёт тяги, а остальные добирают своё", () => {
  const damaged = {
    ...base,
    availability: base.availability.map((value, index) => (index === 3 ? 0 : value)),
  };
  const mix = mixRotorThrust(damaged, {
    collective: 0.5,
    pitchMoment: 0,
    rollMoment: 0,
  });
  assert.equal(mix.thrust[3], 0);
  assert.equal(mix.deliveredThrust < 500, true);
  // И перекос теперь настоящий: пять винтов вокруг центра масс дают момент.
  assert.equal(
    Math.abs(mix.deliveredRollMoment) + Math.abs(mix.deliveredPitchMoment) > 1,
    true,
  );
});

test("контур угловой скорости тянет к цели и гасит вращение", () => {
  const inertia = 90;
  // Нужен угол больше текущего — момент положительный.
  assert.equal(rotorcraftAttitudeMoment(0.2, 0, 0, inertia) > 0, true);
  // Уже на угле, но вращаемся — момент против вращения.
  assert.equal(rotorcraftAttitudeMoment(0.2, 0.2, 0.5, inertia) < 0, true);
  // На цели и без вращения — момента нет.
  assert.equal(Math.abs(rotorcraftAttitudeMoment(0.2, 0.2, 0, inertia)) < 1e-9, true);
});
