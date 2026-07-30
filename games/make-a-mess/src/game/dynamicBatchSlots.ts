/**
 * Бухгалтерия слотов инстанс-батча обломков. Каждый источник (кусок, осколок,
 * остаток) занимает несколько подряд выданных слотов — по одному на видимый
 * бокс. Добавление пишет только новые слоты, удаление закрывает дыры
 * swap-remove'ом с хвоста, поэтому появление или вытеснение одного тела больше
 * не пересобирает геометрию и атрибуты всего батча.
 *
 * Модуль сознательно не знает про three.js: он выдаёт номера слотов и список
 * перемещений, а копирование строк атрибутов делает вызывающая сторона. Так
 * самое ошибкоопасное — порядок swap-remove при многослотовых источниках и
 * решения о росте ёмкости — покрывается юнит-тестами без WebGL.
 */

export interface DynamicSlotState {
  /** slot -> id источника; длина равна count, не capacity. */
  readonly slotSources: string[];
  /** id источника -> занятые им слоты по возрастанию. */
  readonly slotsBySource: Map<string, number[]>;
  capacity: number;
}

/** Перенос строки атрибутов: скопировать слот from в слот to. */
export interface SlotMove {
  readonly from: number;
  readonly to: number;
}

export interface SlotAppendPlan {
  /** Слоты для новых строк, по одному на бокс, в порядке боксов источника. */
  readonly slots: readonly number[];
  /** Не null: перед записью пересоздать буферы под эту ёмкость. */
  readonly grownCapacity: number | null;
}

export interface SlotRemovePlan {
  /** Применять по порядку: копировать строку from поверх строки to. */
  readonly moves: readonly SlotMove[];
  /** Сколько слотов осталось занято после удаления. */
  readonly count: number;
}

export function createDynamicSlotState(capacity: number): DynamicSlotState {
  return {
    slotSources: [],
    slotsBySource: new Map(),
    capacity: Math.max(0, capacity),
  };
}

export function dynamicSlotCount(state: DynamicSlotState): number {
  return state.slotSources.length;
}

/**
 * Выдаёт слоты под источник. Рост ёмкости — с полуторным запасом, чтобы
 * пересоздание буферов оставалось редким событием, а не спутником каждого
 * выстрела.
 */
export function appendDynamicSlots(
  state: DynamicSlotState,
  sourceId: string,
  slotCount: number,
): SlotAppendPlan {
  if (slotCount <= 0 || state.slotsBySource.has(sourceId)) {
    return { slots: [], grownCapacity: null };
  }
  const start = state.slotSources.length;
  const needed = start + slotCount;
  const grownCapacity = needed > state.capacity
    ? Math.max(needed, Math.ceil(state.capacity * 1.5), 64)
    : null;
  if (grownCapacity !== null) {
    state.capacity = grownCapacity;
  }
  const slots: number[] = [];
  for (let offset = 0; offset < slotCount; offset += 1) {
    slots.push(start + offset);
    state.slotSources.push(sourceId);
  }
  state.slotsBySource.set(sourceId, slots);
  return { slots, grownCapacity };
}

/**
 * Освобождает слоты источника, затягивая дыры строками с хвоста. Перемещения
 * возвращаются в безопасном порядке: к моменту копирования строка-донор ещё
 * не перезаписана, а дыры закрываются с наименьших индексов.
 */
export function removeDynamicSlots(
  state: DynamicSlotState,
  sourceId: string,
): SlotRemovePlan {
  const removed = state.slotsBySource.get(sourceId);
  if (!removed || removed.length === 0) {
    return { moves: [], count: state.slotSources.length };
  }
  state.slotsBySource.delete(sourceId);

  const removedSet = new Set(removed);
  const moves: SlotMove[] = [];
  const total = state.slotSources.length;
  const holes = [...removed].sort((left, right) => left - right);
  let tail = total - 1;

  for (const hole of holes) {
    // Хвостовые доноры, которые сами удаляются, пропускаются: их строки
    // никуда переносить не нужно.
    while (tail > hole && removedSet.has(tail)) {
      tail -= 1;
    }
    if (tail <= hole) {
      break;
    }
    const donorSource = state.slotSources[tail];
    moves.push({ from: tail, to: hole });
    state.slotSources[hole] = donorSource;
    const donorSlots = state.slotsBySource.get(donorSource);
    if (donorSlots) {
      const donorIndex = donorSlots.indexOf(tail);
      if (donorIndex >= 0) {
        donorSlots[donorIndex] = hole;
        donorSlots.sort((left, right) => left - right);
      }
    }
    tail -= 1;
  }

  state.slotSources.length = total - removed.length;
  return { moves, count: state.slotSources.length };
}
