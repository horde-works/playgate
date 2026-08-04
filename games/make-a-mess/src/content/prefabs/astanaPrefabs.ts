import type { ScenePrefabDefinition, ScenePrefabLibrary } from "../scenes/sceneContract.ts";
import { propBirch, propOak, propPine } from "./coreFlora.ts";

/**
 * Библиотека префабов острова «Астана».
 *
 * Пока здесь только общая флора из `coreFlora`: зелёный пояс по кромке — это
 * сосны и берёзы лесозащитных полос вокруг настоящей Астаны, а тополь (дуб по
 * силуэту кроны ближе всего) уходит во дворы старого города.
 *
 * Астанинские постройки — станции ЛРТ, двухэтажки, доминанты — появятся здесь
 * по мере этапов плана; они контент мира и несут свою лицензию (LICENSING.md).
 */
function prefab(
  id: string,
  displayName: string,
  tags: readonly string[],
  pieces: ScenePrefabDefinition["pieces"],
): ScenePrefabDefinition {
  return { schemaVersion: 1, id, displayName, tags, pieces };
}

const prefabs: readonly ScenePrefabDefinition[] = [
  ...[1, 2, 3, 4].map((seed) =>
    prefab(`core:pine:${seed}`, "Pine tree", ["core", "flora", "tree"], propPine({ seed })),
  ),
  ...[1, 2, 3].map((seed) =>
    prefab(`core:birch:${seed}`, "Birch tree", ["core", "flora", "tree"], propBirch({ seed })),
  ),
  ...[1, 2, 3].map((seed) =>
    // Тополь пока собран формой дуба и держит прежний габарит острова:
    // порода дуба выросла до взрослой, поэтому здесь явный молодой возраст.
    prefab(`core:poplar:${seed}`, "Poplar", ["core", "flora", "tree"], propOak({ seed: seed + 40, scale: 0.42 })),
  ),
];

export const astanaPrefabLibrary: ScenePrefabLibrary = new Map(
  prefabs.map((definition) => [definition.id, definition]),
);

export const astanaPrefabDefinitions = prefabs;
