// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Инфраструктура, снятая с текущей композиции, но сохранённая как точное ТЗ.
// Этот файл не импортируется генератором сцены: отложенный объект не может
// случайно вернуться в живую геометрию.

export interface DeferredBridgeDraft {
  readonly id: string;
  readonly purpose: string;
  readonly status: "deferred";
  readonly reason: string;
  readonly anchorX: number;
  readonly riverWidthScaleAtRemoval: number;
  readonly southLandClearance: number;
  readonly northLandClearance: number;
  readonly lateralOffsets: readonly number[];
  readonly halfWidth: number;
  readonly forVehicles: boolean;
}

/**
 * Последний вариант автомобильного моста Достык.
 *
 * Ось строилась поперёк долины при x = anchorX. Начальная точка лежала на
 * southLandClearance метров глубже южной границы долины; общая длина была
 * равна полной ширине долины плюс сумма обоих береговых выпусков. Значения
 * lateralOffsets последовательно прибавлялись к anchorX.
 *
 * Геометрия сохранена только как история принятого решения. Возвращать её
 * без нового проектирования нельзя: кривая была обходным манёвром вокруг
 * уже расставленных объектов, а не убедительным автомобильным мостом.
 */
export const DEFERRED_DOSTYK_BRIDGE_DRAFT: DeferredBridgeDraft = {
  id: "dostyk",
  purpose: "Автомобильный переход с левого берега в старый город",
  status: "deferred",
  reason: "Кривая ось не образовывала ясной городской связности и ломала общий план",
  anchorX: -76,
  riverWidthScaleAtRemoval: 0.7,
  southLandClearance: 8,
  northLandClearance: 4,
  lateralOffsets: [22, 22, 22, 14, 4, -2, -4, -4, -4, -4, -4, -4, -4],
  halfWidth: 6,
  forVehicles: true,
};
