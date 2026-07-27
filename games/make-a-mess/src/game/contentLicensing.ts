/**
 * Разбор SPDX-лицензии КОНТЕНТА мира. Одна истина на три места: сборка сцены
 * (`createDestructionScene`), отчёт `scripts/check-licensing.mjs` и тесты.
 *
 * Код репозитория везде AGPL-3.0-or-later и никаких ограничений на
 * модификацию не несёт — речь только о контенте миров, см. LICENSING.md.
 */

/** Лицензия запрещает распространять переработанный материал (NoDerivatives). */
export function forbidsDerivatives(licence: string | null | undefined): boolean {
  return /(^|-)ND(-|$)/.test(licence ?? "");
}

/** Лицензия запрещает коммерческое использование (NonCommercial). */
export function forbidsCommercialUse(
  licence: string | null | undefined,
): boolean {
  return /(^|-)NC(-|$)/.test(licence ?? "");
}

/**
 * Человекочитаемая строка лицензии контента для отчётов и титров: у мира без
 * своей лицензии контент живёт под лицензией репозитория.
 */
export function describeContentLicence(licence: string | null | undefined): string {
  return licence && licence.length > 0
    ? licence
    : "AGPL-3.0-or-later (как код)";
}
