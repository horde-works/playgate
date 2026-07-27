// SPDX-License-Identifier: CC-BY-NC-ND-4.0
// SPDX-FileCopyrightText: 2026 Igor Kirisiuk
//
// Авторские хелперы острова «Астана»: группы, примитивы, префабы и общий
// детерминированный шум. Тот же приём, что в документе деревни викингов, но
// вынесен отдельно — мир строится несколькими файлами по этапам плана.

import type {
  SceneGroupDefinition,
  SceneObjectDefinition,
  ScenePrefabInstanceDefinition,
  ScenePrimitiveDefinition,
  SceneTransform,
} from "../sceneContract.ts";
import type {
  BreakableMaterial,
  BreakableShape,
  SceneVector3,
  SupportMode,
} from "../../../game/destructionScene.ts";

export interface MutableGroup {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: SceneObjectDefinition[];
}

const groups = new Map<string, MutableGroup>();

export function group(
  id: string,
  label: string,
  material: BreakableMaterial,
  supportMode: SupportMode = "stack",
): MutableGroup {
  const existing = groups.get(id);
  if (existing) {
    return existing;
  }
  const created: MutableGroup = { id, label, material, supportMode, objects: [] };
  groups.set(id, created);
  return created;
}

type PrimitiveOptions = Omit<
  ScenePrimitiveDefinition,
  "kind" | "id" | "material" | "shape" | "size" | "color" | "transform"
> & {
  readonly rotation?: SceneVector3;
  readonly scale?: SceneVector3;
};

/**
 * Габарит повёрнутой детали в МИРОВЫХ осях. Порядок поворотов — как в
 * compileScene (Эйлер XYZ), иначе честность коробки была бы кажущейся.
 */
function worldExtents(size: SceneVector3, rotation: SceneVector3): SceneVector3 {
  const [rx, ry, rz] = rotation;
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];
  const axes = [
    [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    [sy, -sx * cy, cx * cy],
  ] as const;
  return [0, 1, 2].map((world) =>
    axes.reduce(
      (extent, axis, local) => extent + Math.abs(axis[world]) * size[local],
      0,
    ),
  ) as unknown as SceneVector3;
}

export function primitive(
  target: MutableGroup,
  id: string,
  material: BreakableMaterial,
  shape: BreakableShape,
  position: SceneVector3,
  size: SceneVector3,
  color: string,
  options: PrimitiveOptions = {},
): void {
  const { rotation, scale, ...definition } = options;
  // Решатель нагрузок сравнивает габариты по МИРОВЫМ осям и о повороте детали
  // не знает: `size` он читает как есть. Плита длиной 10 м вдоль платформы,
  // развёрнутой на 90°, выглядит для него плитой 10 м поперёк — и всё, что
  // лежит на её концах, повисает в воздухе. Поэтому повёрнутой детали
  // выдаётся явная контактная коробка: compileScene пересчитает её в мировой
  // габарит, и опирание считается по настоящей тени, а не по повёрнутой.
  const contactBoxes =
    definition.contactBoxes ??
    (rotation && needsHonestContactBox(size, rotation)
      ? ([{ position: [0, 0, 0], size }] as const)
      : undefined);
  target.objects.push({
    kind: "primitive",
    id,
    material,
    shape,
    size,
    color,
    transform: { position, rotation, scale },
    ...definition,
    contactBoxes,
  });
}

/**
 * Коробка опирания для ЗАГЛУБЛЁННОЙ детали. Фундамент честнее закопать —
 * так он и стоит в жизни, — но решателю подошва в метре под землёй читается
 * как глубокое взаимопроникновение, и опоры он отвергает. Поэтому опирание
 * описывается явно: от верха грунта до верха детали.
 */
export function groundSeatBox(
  centreY: number,
  size: SceneVector3,
  groundTop: number,
): { readonly position: SceneVector3; readonly size: SceneVector3 } {
  const top = centreY + size[1] / 2;
  const height = Math.max(0.12, top - groundTop);
  return {
    position: [0, groundTop + height / 2 - centreY, 0],
    size: [size[0], height, size[2]],
  };
}

function needsHonestContactBox(
  size: SceneVector3,
  rotation: SceneVector3,
): boolean {
  const extents = worldExtents(size, rotation);
  return extents.some((extent, axis) => Math.abs(extent - size[axis]) > 1e-6);
}

export function place(
  target: MutableGroup,
  id: string,
  prefab: string,
  transform: SceneTransform,
  options: Pick<ScenePrefabInstanceDefinition, "palette" | "surface"> = {},
): void {
  target.objects.push({ kind: "prefab", id, prefab, transform, ...options });
}

/** Детерминированный шум: одинаковый остров в каждой сборке. */
export function noise(x: number, z: number, salt = 0): number {
  const value = Math.sin(x * 91.17 + z * 47.71 + salt * 19.13) * 43758.5453;
  return value - Math.floor(value);
}

export function collectGroups(): readonly SceneGroupDefinition[] {
  return [...groups.values()].map((entry) => ({
    id: entry.id,
    label: entry.label,
    material: entry.material,
    supportMode: entry.supportMode,
    objects: entry.objects,
  }));
}
