import type { Object3D } from "three";

/**
 * Что НЕ рисуется в рефракционном проходе воды.
 *
 * Рефракция отвечает на один вопрос — «что видно СКВОЗЬ толщу» — и держит
 * глубину для уреза. Деревья и газон стоят на берегах НАД водой: в
 * преломлённой картинке они не участвуют (толща съедает больше 80% света,
 * смещение размазывает остальное), а их вершинная цена — крупнейшая статья
 * второго полного рендера сцены. Камыш и прочая болотная растительность
 * сюда НЕ регистрируются: их стебли пересекают зеркало воды, и глубина
 * рефракции — то, что даёт им мягкий вход (§10 environmental lessons).
 *
 * Зеркальный проход исключения не читает: отражения деревьев над каналом —
 * опознавательная черта польдера.
 */
const refractionExcluded = new Set<Object3D>();
const hiddenByPass: Object3D[] = [];

/** Регистрация на время жизни компонента; возвращает отписку. */
export function registerRefractionExcluded(object: Object3D): () => void {
  refractionExcluded.add(object);
  return () => refractionExcluded.delete(object);
}

/**
 * Спрятать исключённое на время рефракционного рендера. Прячет только то,
 * что было видимо, и помнит СВОЙ список — чужая невидимость (сломанный
 * кусок, выключенный слой) не будет случайно «восстановлена» в видимое.
 */
export function hideRefractionExcluded(): void {
  for (const object of refractionExcluded) {
    if (object.visible) {
      object.visible = false;
      hiddenByPass.push(object);
    }
  }
}

export function restoreRefractionExcluded(): void {
  for (const object of hiddenByPass) {
    object.visible = true;
  }
  hiddenByPass.length = 0;
}
