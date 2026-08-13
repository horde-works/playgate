import assert from "node:assert/strict";
import test from "node:test";
import {
  passingAdvice,
  PASSING_COMFORT,
  YIELD_EARLY_SHARE,
} from "../games/make-a-mess/src/game/villagerPassing.ts";
import {
  createVillagerPopulation,
  stepVillagers,
} from "../games/make-a-mess/src/game/villagerSim.ts";
import { vikingSettlement } from "../games/make-a-mess/src/content/scenes/vikingSettlement.ts";
import { villageHumanProfile } from "../games/make-a-mess/src/content/populations/humanPopulationProfiles.ts";

/** Идущий на север (+z) стоит в начале координат, если не сказано иное. */
function walker(x, z, yaw, speed = 1.3) {
  return { x, z, yaw, speed };
}

/**
 * Прогон встречи двух пешеходов по закону расхождения: каждый кадр советуется,
 * доворачивается и шагает. Возвращает историю поправок и минимальное
 * расстояние, на которое они сошлись.
 */
function meet(a, b, seconds = 6, step = 1 / 60) {
  const state = [{ ...a }, { ...b }];
  const history = [[], []];
  let closest = Infinity;
  let firstReaction = null;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    const gap = Math.hypot(state[0].x - state[1].x, state[0].z - state[1].z);
    closest = Math.min(closest, gap);
    const advice = state.map((who, index) =>
      passingAdvice(who, [state[1 - index]]),
    );
    for (const [index, who] of state.entries()) {
      history[index].push(advice[index].steer);
      if (firstReaction === null && Math.abs(advice[index].steer) > 0.01) {
        firstReaction = gap;
      }
      // Доворот ограничен так же, как в симуляции.
      who.yaw += Math.max(-0.06, Math.min(0.06, advice[index].steer * 0.35));
      const pace = who.speed * advice[index].pace;
      who.x += Math.sin(who.yaw) * pace * step;
      who.z += Math.cos(who.yaw) * pace * step;
    }
  }
  return { history, closest, firstReaction, state };
}

test("попутчиков не расталкивает: промах не меняется — трогать нечего", () => {
  // Двое идут рядом в одну сторону в метре друг от друга. Прежнее правило по
  // расстоянию расталкивало их всю дорогу; по промаху трогать их незачем.
  const me = walker(0, 0, 0);
  const mate = walker(1, 0.5, 0);
  assert.equal(passingAdvice(me, [mate]).steer, 0);
  assert.equal(passingAdvice(mate, [me]).steer, 0);

  // И даже если они ближе комфортного промаха: раз он не сокращается, это не
  // сближение, а просто соседство.
  const tight = walker(PASSING_COMFORT * 0.6, 3, 0);
  assert.equal(passingAdvice(me, [tight]).steer, 0);
});

test("уже разошедшихся не догоняют поправкой", () => {
  // Сосед позади и уходит дальше: момент сближения в прошлом.
  const me = walker(0, 0, 0);
  const behind = walker(0.2, -1.5, Math.PI);
  assert.equal(passingAdvice(me, [behind]).steer, 0);
});

test("расхождение начинается ЗА НЕСКОЛЬКО МЕТРОВ, а не у самого тела", () => {
  // Лоб в лоб с малым боковым смещением: с восьми метров сходятся.
  const { firstReaction, closest } = meet(
    walker(0, -4, 0),
    walker(0.05, 4, Math.PI),
  );
  assert.ok(firstReaction !== null, "никто не отреагировал вовсе");
  assert.ok(
    firstReaction > 3,
    `первая поправка только на ${firstReaction.toFixed(2)} м — это радиус тела, а не расхождения`,
  );
  // И они действительно разошлись, а не прошли сквозь друг друга.
  assert.ok(closest > 0.8, `сошлись на ${closest.toFixed(2)} м`);
});

test("не дёргаются: поправка не пляшет знаком", () => {
  // Закон СЧИТАЕТ поправку, а не подбирает её: доворот берётся ровно такой,
  // чтобы набрать недостающий просвет за оставшееся время. Поэтому правильное
  // поведение — один ранний доворот, а дальше курс держится, и требовать
  // непрерывной правки было бы требованием подделки.
  const { history } = meet(walker(0, -4, 0), walker(0.05, 4, Math.PI));
  for (const [index, track] of history.entries()) {
    const active = track.filter((value) => Math.abs(value) > 1e-4);
    assert.ok(active.length > 0, `участник ${index} не правил курс вовсе`);
    let flips = 0;
    for (let step = 1; step < active.length; step += 1) {
      if (Math.sign(active[step]) !== Math.sign(active[step - 1])) {
        flips += 1;
      }
    }
    assert.equal(flips, 0, `участник ${index} перекладывался ${flips} раз`);
    // И совет не скачет между кадрами: закон непрерывен по построению.
    let jump = 0;
    for (let step = 1; step < track.length; step += 1) {
      jump = Math.max(jump, Math.abs(track[step] - track[step - 1]));
    }
    assert.ok(jump < 0.12, `скачок совета ${jump.toFixed(3)} рад за кадр`);
  }
});

test("поправка тем больше, чем позже спохватились", () => {
  // Один и тот же промах, но разное время до сближения: закон обязан просить
  // мягко издали и решительно вблизи. Это и есть «за несколько метров».
  const far = passingAdvice(walker(0, -5, 0), [walker(0.05, 1, Math.PI)]);
  const near = passingAdvice(walker(0, -1, 0), [walker(0.05, 1, Math.PI)]);
  assert.ok(far.steer > 0 && near.steer > 0);
  assert.ok(
    near.steer > far.steer * 2,
    `издали ${far.steer.toFixed(3)} против вблизи ${near.steer.toFixed(3)} — закон не торопится`,
  );
});

test("расходятся СОГЛАСОВАННО: один уступает больше другого", () => {
  // Пересечение под прямым углом: один явно приходит к точке позже.
  const { history } = meet(walker(0, -3, 0), walker(4, 0.4, -Math.PI / 2));
  const effort = history.map((track) =>
    track.reduce((sum, value) => sum + Math.abs(value), 0),
  );
  assert.ok(effort[0] > 0 || effort[1] > 0, "никто не отреагировал");
  const [less, more] = effort.slice().sort((a, b) => a - b);
  assert.ok(
    more > less * 1.4,
    `усилия почти равны (${effort.map((value) => value.toFixed(2)).join(" и ")}) — это зеркальный танец`,
  );
  // Уступающий должен быть один: доля раннего заметно меньше единицы.
  assert.ok(YIELD_EARLY_SHARE < 0.6);
});

test("лоб в лоб расходятся правыми плечами, а не сходятся", () => {
  // Точно встречные курсы: пути параллельны, и общее правило обязано развести.
  const me = walker(0, -3, 0);
  const you = walker(0, 3, Math.PI);
  const mine = passingAdvice(me, [you]);
  const yours = passingAdvice(you, [me]);
  assert.ok(mine.steer > 0 && yours.steer > 0, "оба обязаны взять в свою правую");
  // В своих системах координат оба вправо — значит в мире это разные стороны.
  const { closest } = meet(me, you, 7);
  assert.ok(closest > 0.4, `лоб в лоб сошлись на ${closest.toFixed(2)} м`);
});

test("уступающий сбавляет ход, но не встаёт", () => {
  const advice = passingAdvice(walker(0, -1.2, 0), [walker(0.2, 1.2, Math.PI)]);
  assert.ok(advice.pace < 1, "уступающий не сбавил вовсе");
  assert.ok(advice.pace > 0.7, `сбавил слишком сильно: ${advice.pace.toFixed(2)}`);
});

test("живая деревня: люди не рыскают и не слипаются", () => {
  const population = createVillagerPopulation(villageHumanProfile, 34, null);
  for (let elapsed = 0; elapsed < 40; elapsed += 0.05) {
    stepVillagers(population, 0.05, 0);
  }
  const previous = new Map(
    population.villagers.map((villager) => [villager.id, villager.passYaw]),
  );
  let worstJump = 0;
  let tooClose = 0;
  let episodes = 0;
  let insideFlips = 0;
  const live = new Map(population.villagers.map((villager) => [villager.id, 0]));
  for (let elapsed = 0; elapsed < 60; elapsed += 1 / 60) {
    stepVillagers(population, 1 / 60, 0);
    for (const villager of population.villagers) {
      const before = previous.get(villager.id) ?? 0;
      worstJump = Math.max(worstJump, Math.abs(villager.passYaw - before));
      previous.set(villager.id, villager.passYaw);
      const sign = Math.abs(villager.passYaw) > 0.02 ? Math.sign(villager.passYaw) : 0;
      const was = live.get(villager.id);
      if (sign === 0) {
        if (was !== 0) {
          episodes += 1;
        }
        live.set(villager.id, 0);
        continue;
      }
      if (was !== 0 && sign !== was) {
        insideFlips += 1;
      }
      live.set(villager.id, sign);
    }
    for (const [index, one] of population.villagers.entries()) {
      if (!one.visible || one.state !== "walking") {
        continue;
      }
      for (const two of population.villagers.slice(index + 1)) {
        if (!two.visible || two.state !== "walking") {
          continue;
        }
        if (Math.hypot(one.x - two.x, one.z - two.z) < 0.3) {
          tooClose += 1;
        }
      }
    }
  }
  // Сглаживание обязано держать поправку непрерывной.
  assert.ok(worstJump < 0.05, `поправка прыгает на ${worstJump.toFixed(3)} рад за кадр`);
  // И главное: ВНУТРИ одного расхождения человек не перекладывается. Смена
  // знака между РАЗНЫМИ встречами законна (одного обошёл справа, следующего
  // слева) — дёрганьем она не является, и считать надо не её.
  assert.ok(episodes > 20, `расхождений всего ${episodes} — замер ничего не поймал`);
  assert.equal(insideFlips, 0, `${insideFlips} перекладок внутри расхождения`);
  // И идущие не слипаются в одну точку.
  assert.ok(tooClose < 40, `${tooClose} кадров, где двое идущих ближе 0.3 м`);
});
