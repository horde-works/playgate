// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk

/**
 * Skyline landmarks must retain their authored lighting at least as far as
 * Khan Shatyr. This value affects ranking in the shared point-light pool; it
 * is intentionally separate from the physical cast distance of each lamp.
 */
export const ASTANA_LANDMARK_LIGHT_PRIORITY = 32;

/** Do not let a nearby entrance reduce the whole city's active pool. */
export const ASTANA_LANDMARK_LOCAL_POOL_CAPACITY = 12;

/** Lowest useful cast for a compact landmark; distributed linear lights differ. */
export const ASTANA_LANDMARK_MIN_LIGHT_DISTANCE = 32;

/** One landmark must be one selectable skyline family, including its doors. */
export const ASTANA_PYRAMID_LIGHT_GROUP = "astana:pyramid:architectural-lighting";
export const ASTANA_OPERA_LIGHT_GROUP = "astana:opera:architectural-lighting";
