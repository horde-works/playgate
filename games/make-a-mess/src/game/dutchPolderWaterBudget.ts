/**
 * Бюджет служебных проходов воды польдера. Числа живут здесь, а не в
 * компоненте, чтобы тест пришпилил их как закон (см. §10.8
 * environmental-rendering-lessons.md: «крутилки, если ФПС не хватает —
 * MIRROR_SIZE и REFRACTION_SCALE»).
 *
 * Цена, которую этот бюджет держит: зеркало и рефракция — два ПОЛНЫХ рендера
 * сцены на кадр сверх основного. На Iris Xe (машина-пол проекта) именно они
 * вместе с маршем неба давали 78–96 мс GPU и 6.5 млн треугольников кадра при
 * 466 draw calls основного прохода.
 */

/**
 * Рубильник честного A/B: false замораживает все оси на авторском максимуме
 * (качество 2), НЕ отключая сами проходы — изоляция цены адаптива, а не воды.
 */
export const WATER_PASS_QUALITY_ENABLED = true;

/**
 * Авторский размер планарного зеркала. Понижен с 1024 после замера: зеркало
 * читается тремя тапами вдоль направления, куда рябь сместила отражение
 * (см. sampleMirror и reflectionOffset в DutchPolderWater), то есть картинка
 * в нём размазана самой водой — 512 неотличимы, а заливка зеркала вчетверо
 * дешевле. Это решение о цене, зафиксированное тестом, а не дефолт.
 */
export const MIRROR_SIZE = 512;

/**
 * Доля буфера кадра под проход рефракции, по gpuQuality 0/1/2. Рефракция
 * читается сквозь мутную воду (экстинкция ~5.5/м: на 33 см канала доходит
 * меньше пятой части света) — деталь дна не переживает толщу. Глубина в том
 * же таргете держит урез; ниже 0.3 урез становится зернистым на пологом
 * взгляде — не опускать без кадров.
 */
export const REFRACTION_SCALES = [0.3, 0.42, 0.5] as const;

/**
 * Каждый который кадр перерисовывается зеркало, по gpuQuality 0/1/2. Страйд 2
 * оставляет матрицу проектора и текстуру зеркала из ОДНОГО прошлого кадра —
 * отражение целиком запаздывает, но не рвётся. На качестве 2 зеркало живёт
 * покадрово: авторский максимум не страйдится.
 */
export const MIRROR_FRAME_STRIDES = [2, 1, 1] as const;

export type WaterPassQuality = 0 | 1 | 2;

export interface WaterPassBudget {
  readonly refractionScale: number;
  readonly mirrorFrameStride: number;
}

export function waterPassBudget(quality: WaterPassQuality): WaterPassBudget {
  const effective = WATER_PASS_QUALITY_ENABLED ? quality : 2;
  return {
    refractionScale: REFRACTION_SCALES[effective],
    mirrorFrameStride: MIRROR_FRAME_STRIDES[effective],
  };
}
