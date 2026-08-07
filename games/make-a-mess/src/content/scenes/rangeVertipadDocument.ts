import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
} from "./sceneContract.ts";
import type { SpotLightDefinition } from "../../game/destructionScene.ts";
import {
  townVertipadDocument,
  townVertipadSpotLights,
} from "./townVertipadDocument.ts";
import { rangeHexacopterPointFromTown } from "../../game/rangeHexacopter.ts";

/**
 * Вертипад HX-6 на полигоне Tonkawa (фишка №1, вердикт Igor 07.08.2026).
 *
 * Документ города переезжает ЦЕЛИКОМ чистой трансляцией с сохранением
 * ВСЕХ идентификаторов: id документа, групп, кусков, ламп. Город с этим
 * переносом лишается вертипада, поэтому кластер `town-vertipad:hexacopter`
 * живёт ровно в одной сцене — полигоне, — и определение машины, кресло
 * пилота, лампы и тесты сохраняют идентичность; меняются только мировые
 * координаты. Разворота нет (yaw 0): западный нос города с восточного
 * края диска смотрит в центр полигона.
 */
function translatedObject(object: SceneObjectDefinition): SceneObjectDefinition {
  return {
    ...object,
    transform: {
      ...object.transform,
      position: rangeHexacopterPointFromTown(object.transform.position),
    },
  } as SceneObjectDefinition;
}

const translatedGroups: readonly SceneGroupDefinition[] =
  townVertipadDocument.groups.map((group) => ({
    ...group,
    objects: group.objects.map(translatedObject),
  }));

export const rangeVertipadDocument: typeof townVertipadDocument = {
  ...townVertipadDocument,
  groups: [...translatedGroups],
};

export const rangeVertipadSpotLights: readonly SpotLightDefinition[] =
  townVertipadSpotLights.map((light) => ({
    ...light,
    position: rangeHexacopterPointFromTown(light.position),
  }));
