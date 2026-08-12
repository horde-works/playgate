import type {
  Collider,
  RigidBody,
  Shape,
  World,
} from "@dimforge/rapier3d-compat";

/**
 * НАСКОЛЬКО ГЛУБОКО, А НЕ «КАСАЮТСЯ ЛИ».
 *
 * Ворота, за которыми свежий обломок перестаёт быть призраком и начинает
 * сталкиваться с себе подобными, раньше спрашивали у Rapier факт пересечения
 * форм. Это неверный вопрос: солвер штатно оставляет в покоящемся контакте
 * миллиметры проникновения — замерено 2.4 мм на двух улёгшихся плитах, — и
 * `intersectionWithShape` честно называет их пересечением. Ворота не
 * открывались никогда: на фасаде хрущёвки `hru:south:0` из 165 кусков 154 не
 * вышли из льготы за 15 секунд и остались вмурованными друг в друга на 5.5 см
 * в среднем и на 29.6 см в худшей паре.
 *
 * Порог отделяет покой солвера (миллиметры) от настоящей заделки куска в кусок
 * (сантиметры и десятки сантиметров). Спрашивается он УМЕНЬШЕННОЙ формой: если
 * ужатая на порог форма всё ещё встречает соседа, значит перекрытие глубже
 * порога. Тонкой детали ужимать нечего, поэтому запас ограничен долей
 * полуразмера — у лопасти в 28 мм порог в 5 см означал бы отрицательную форму.
 *
 * ВЕЛИЧИНА — ЭТО ЦЕНА КАДРА, И ОНА ЗАМЕРЕНА. Порог решает, какой кусок ещё
 * растолкать, а какой оставить в покое: чем он больше, тем больше кусков
 * вооружается и тем дороже куча. На обвале целой хрущёвки (1192 куска) 2 и
 * 5 см дают 1.43 мс на шаг физики и полное засыпание, а с 8 см начинается
 * другой режим — 6.1 мс на шаг и 400 тел, которые не засыпают вовсе. Пять
 * сантиметров — наибольшее значение по эту сторону обрыва; оно же выше
 * авторских стыков впритык (боевой ход крепости состыкован с перекрытием
 * 3.6 см, и объявлять такой стык заделкой было бы неверно).
 */
export const DEBRIS_EMBED_TOLERANCE = 0.05;

/** Ужимать можно не больше этой доли полуразмера — иначе тонкое исчезнет. */
const MAX_SHRINK_FRACTION = 0.4;

interface MutableVector {
  x: number;
  y: number;
  z: number;
}

interface CuboidLike extends Shape {
  halfExtents: MutableVector;
}

interface BallLike extends Shape {
  radius: number;
}

interface CylinderLike extends BallLike {
  halfHeight: number;
}

function shrink(value: number, margin: number): number {
  return value - Math.min(margin, value * MAX_SHRINK_FRACTION);
}

/**
 * Временно ужимает форму коллайдера и возвращает восстановитель. Форма у
 * rapier-compat кэшируется на стороне JS, поэтому правка видна только запросу,
 * а само физическое тело в wasm не меняется ни на шаг.
 */
function shrinkShape(shape: Shape, margin: number): (() => void) | null {
  if ("halfExtents" in shape) {
    const cuboid = shape as CuboidLike;
    const half = cuboid.halfExtents;
    const original = { x: half.x, y: half.y, z: half.z };
    half.x = shrink(original.x, margin);
    half.y = shrink(original.y, margin);
    half.z = shrink(original.z, margin);
    return () => {
      half.x = original.x;
      half.y = original.y;
      half.z = original.z;
    };
  }
  if ("radius" in shape && "halfHeight" in shape) {
    const cylinder = shape as CylinderLike;
    const radius = cylinder.radius;
    const halfHeight = cylinder.halfHeight;
    cylinder.radius = shrink(radius, margin);
    cylinder.halfHeight = shrink(halfHeight, margin);
    return () => {
      cylinder.radius = radius;
      cylinder.halfHeight = halfHeight;
    };
  }
  if ("radius" in shape) {
    const ball = shape as BallLike;
    const radius = ball.radius;
    ball.radius = shrink(radius, margin);
    return () => {
      ball.radius = radius;
    };
  }
  // Форму, которую ужать нечем, спрашиваем как есть: это осторожнее (кусок
  // просто дольше побудет призраком), а не опаснее.
  return null;
}

function collidesDeeply(
  world: World,
  ownCollider: Collider,
  body: RigidBody,
  blockingBodyHandles: ReadonlySet<number>,
  ignoredColliderGroup: number,
  tolerance: number,
): boolean {
  const restore = shrinkShape(ownCollider.shape, tolerance);
  try {
    return Boolean(
      world.intersectionWithShape(
        ownCollider.translation(),
        ownCollider.rotation(),
        ownCollider.shape,
        undefined,
        undefined,
        ownCollider,
        body,
        (otherCollider) => {
          if (otherCollider.collisionGroups() === ignoredColliderGroup) {
            return false;
          }
          const otherBody = otherCollider.parent();
          return Boolean(
            otherBody &&
              otherBody.handle !== body.handle &&
              blockingBodyHandles.has(otherBody.handle),
          );
        },
      ),
    );
  } finally {
    restore?.();
  }
}

/**
 * True, когда одна из физических форм этого обломка ЗАДЕЛАНА в другое тело из
 * `blockingBodyHandles` глубже порога. Маски столкновений намеренно
 * игнорируются: обломок в льготной группе как раз ни с кем из них не
 * сталкивается, и проверяется именно это состояние.
 *
 * В список блокирующих тел входят и собратья-обломки, и составные носители:
 * закон один — «пока сидишь в чужом теле, не толкайся».
 */
export function debrisBodyIsEmbedded(
  world: World,
  body: RigidBody,
  blockingBodyHandles: ReadonlySet<number>,
  ignoredColliderGroup: number,
  tolerance: number = DEBRIS_EMBED_TOLERANCE,
): boolean {
  for (let index = 0; index < body.numColliders(); index += 1) {
    const ownCollider = body.collider(index);
    if (ownCollider.collisionGroups() === ignoredColliderGroup) {
      continue;
    }
    if (
      collidesDeeply(
        world,
        ownCollider,
        body,
        blockingBodyHandles,
        ignoredColliderGroup,
        tolerance,
      )
    ) {
      return true;
    }
  }
  return false;
}
