"use client";

import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from "three";
import type {
  LandscapeVisualChunkDefinition,
  LandscapeVisualDefinition,
} from "./destructionScene.ts";
import { dutchPolderGroundTint } from "./dutchPolderVegetation.ts";
import {
  getPieceMaterial,
  pieceMaterialBaseColor,
} from "./materialTextures.ts";

function landscapeProfileBand(
  profile: LandscapeVisualDefinition["landscapeSurface"],
): number {
  if (profile === "viking-ground") return -1;
  if (profile === "city-ground") return -2;
  if (profile === "dutch-polder-ground") return -3;
  return 0;
}

function visibleTriangleData(
  chunk: LandscapeVisualChunkDefinition,
  hiddenPieceIds: ReadonlySet<string>,
): { readonly indices: number[]; readonly owners: string[] } {
  const indices: number[] = [];
  const owners: string[] = [];
  for (let triangle = 0; triangle < chunk.triangleOwners.length; triangle += 1) {
    const owner = chunk.triangleOwners[triangle];
    if (hiddenPieceIds.has(owner)) continue;
    const offset = triangle * 3;
    indices.push(
      chunk.indices[offset],
      chunk.indices[offset + 1],
      chunk.indices[offset + 2],
    );
    owners.push(owner);
  }
  return { indices, owners };
}

const LandscapeRenderChunk = memo(function LandscapeRenderChunk({
  chunk,
  hiddenPieceIds,
  hiddenKey,
  material,
  color,
  landscapeSurface,
  breakableMaterial,
  groundTint,
}: {
  chunk: LandscapeVisualChunkDefinition;
  hiddenPieceIds: ReadonlySet<string>;
  hiddenKey: string;
  material: MeshStandardMaterial;
  color: string;
  landscapeSurface: LandscapeVisualDefinition["landscapeSurface"];
  breakableMaterial: LandscapeVisualDefinition["material"];
  groundTint: ((x: number, z: number) => readonly [number, number, number]) | null;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, owners } = useMemo(() => {
    const visible = visibleTriangleData(chunk, hiddenPieceIds);
    const next = new BufferGeometry();
    next.setAttribute(
      "position",
      new Float32BufferAttribute(chunk.vertices.flatMap((vertex) => [...vertex]), 3),
    );
    next.setAttribute(
      "normal",
      new Float32BufferAttribute(chunk.normals.flatMap((normal) => [...normal]), 3),
    );
    if (groundTint) {
      // Грунт несёт цвет СВОЕЙ растительности, из того же сэмплера, который её
      // и расставляет. Без этого берег читался голым при любой густоте: на
      // склоне, если смотреть вдоль него, между вертикальными стеблями всегда
      // видно землю, а земля была одной плоской заливкой.
      next.setAttribute(
        "color",
        new Float32BufferAttribute(
          chunk.vertices.flatMap((vertex) => [...groundTint(vertex[0], vertex[2])]),
          3,
        ),
      );
    }
    next.setIndex(visible.indices);
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4),
    );
    next.setAttribute(
      "bakedAoA",
      new InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4),
    );
    next.setAttribute(
      "bakedAoB",
      new InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4),
    );
    next.setAttribute(
      "bakedSkyExposure",
      new InstancedBufferAttribute(new Float32Array([1]), 1),
    );
    next.setAttribute(
      "materialFaceMaskPos",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    next.setAttribute(
      "materialFaceMaskNeg",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    next.setAttribute(
      "silicateJointBand",
      new InstancedBufferAttribute(
        new Float32Array([landscapeProfileBand(landscapeSurface)]),
        1,
      ),
    );
    next.setAttribute(
      "silicateJointTint",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    next.computeBoundingBox();
    next.computeBoundingSphere();
    return { geometry: next, owners: visible.owners };
  // hiddenKey is the compact invalidation key for this specific chunk.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunk, hiddenKey, landscapeSurface, groundTint]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) return;
    current.setMatrixAt(0, new Matrix4());
    current.setColorAt(0, new Color(color));
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) current.instanceColor.needsUpdate = true;
    current.computeBoundingSphere();
  }, [color, geometry]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, 1]}
      receiveShadow
      userData={{
        breakableTriangleOwnerIds: owners,
        breakableMaterial,
      }}
    />
  );
});

const LandscapeColliderChunk = memo(function LandscapeColliderChunk({
  chunk,
  hiddenPieceIds,
  hiddenKey,
}: {
  chunk: LandscapeVisualChunkDefinition;
  hiddenPieceIds: ReadonlySet<string>;
  hiddenKey: string;
}) {
  const args = useMemo(() => {
    const visible = visibleTriangleData(chunk, hiddenPieceIds);
    return [
      new Float32Array(chunk.vertices.flatMap((vertex) => [...vertex])),
      new Uint32Array(visible.indices),
    ] as [Float32Array, Uint32Array];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunk, hiddenKey]);

  return <TrimeshCollider args={args} friction={0.84} restitution={0.008} />;
});

const LandscapeShellEdgeChunk = memo(function LandscapeShellEdgeChunk({
  chunk,
  hiddenPieceIds,
  hiddenKey,
  depth,
  material,
  color,
  breakableMaterial,
}: {
  chunk: LandscapeVisualChunkDefinition;
  hiddenPieceIds: ReadonlySet<string>;
  hiddenKey: string;
  depth: number;
  material: MeshStandardMaterial;
  color: string;
  breakableMaterial: LandscapeVisualDefinition["material"];
}) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, owners } = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const nextOwners: string[] = [];
    for (const edge of chunk.shellEdges ?? []) {
      if (
        hiddenPieceIds.has(edge.ownerPieceId) ||
        !hiddenPieceIds.has(edge.neighborPieceId)
      ) continue;
      const offset = positions.length / 3;
      positions.push(
        ...edge.start,
        ...edge.end,
        edge.end[0], edge.end[1] - depth, edge.end[2],
        edge.start[0], edge.start[1] - depth, edge.start[2],
      );
      indices.push(
        offset, offset + 1, offset + 2,
        offset, offset + 2, offset + 3,
      );
      nextOwners.push(edge.ownerPieceId, edge.ownerPieceId);
    }
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(positions, 3));
    next.setIndex(indices);
    next.computeVertexNormals();
    next.setAttribute(
      "materialAnchor",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4),
    );
    next.setAttribute(
      "bakedAoA",
      new InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4),
    );
    next.setAttribute(
      "bakedAoB",
      new InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4),
    );
    next.setAttribute(
      "bakedSkyExposure",
      new InstancedBufferAttribute(new Float32Array([1]), 1),
    );
    next.setAttribute(
      "materialFaceMaskPos",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    next.setAttribute(
      "materialFaceMaskNeg",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    next.setAttribute(
      "silicateJointBand",
      new InstancedBufferAttribute(new Float32Array([0]), 1),
    );
    next.setAttribute(
      "silicateJointTint",
      new InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3),
    );
    next.computeBoundingBox();
    next.computeBoundingSphere();
    return { geometry: next, owners: nextOwners };
  // hiddenKey is the compact invalidation key for this specific chunk.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunk, depth, hiddenKey]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current || owners.length === 0) return;
    current.setMatrixAt(0, new Matrix4());
    current.setColorAt(0, new Color(color));
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) current.instanceColor.needsUpdate = true;
    current.computeBoundingSphere();
  }, [color, geometry, owners.length]);

  if (owners.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, 1]}
      receiveShadow
      userData={{
        breakableTriangleOwnerIds: owners,
        breakableMaterial,
      }}
    />
  );
});

export const LandscapeSurface = memo(function LandscapeSurface({
  definition,
  hiddenPieceIds,
}: {
  definition: LandscapeVisualDefinition;
  hiddenPieceIds: ReadonlySet<string>;
}) {
  const sharedMaterial = useMemo(() => getPieceMaterial(
    definition.material,
    pieceMaterialBaseColor(definition.material, definition.color),
    definition.textureProfile,
  ), [definition.color, definition.material, definition.textureProfile]);

  // Тинт грунта пока есть только у польдера: там растительность банду́ется по
  // глубине, и земля обязана соглашаться с ней.
  const groundTint = definition.landscapeSurface === "dutch-polder-ground"
    ? dutchPolderGroundTint
    : null;

  // ВАЖНО: включать vertexColors на общем материале нельзя — он лежит в кэше
  // и раздаётся всем кускам мира с тем же ключом. Хуже того, у материала есть
  // свой `customProgramCacheKey`, и он НЕ учитывает vertexColors: three молча
  // переиспользовал бы программу, скомпилированную без USE_COLOR, и вершинный
  // цвет просто не доехал бы до кадра. Поэтому клон и свой ключ.
  const material = useMemo(() => {
    if (!groundTint) return sharedMaterial;
    const tinted = sharedMaterial.clone();
    tinted.vertexColors = true;
    const inheritedKey = sharedMaterial.customProgramCacheKey?.bind(sharedMaterial);
    tinted.customProgramCacheKey = () =>
      `${inheritedKey ? inheritedKey() : sharedMaterial.uuid}:vertex-tint`;
    return tinted;
  }, [sharedMaterial, groundTint]);

  useEffect(() => {
    if (material === sharedMaterial) return;
    return () => material.dispose();
  }, [material, sharedMaterial]);
  const shell = definition.destructionShell;
  const shellMaterial = useMemo(() => shell
    ? getPieceMaterial(
        shell.material,
        pieceMaterialBaseColor(shell.material, shell.color),
      )
    : null,
  [shell]);

  const chunks = definition.chunks.map((chunk) => ({
    chunk,
    hiddenKey: chunk.ownerPieceIds
      .filter((pieceId) => hiddenPieceIds.has(pieceId))
      .join("|"),
  }));

  return (
    <group>
      {chunks.map(({ chunk, hiddenKey }) => (
        <LandscapeRenderChunk
          key={`render:${chunk.id}`}
          chunk={chunk}
          hiddenPieceIds={hiddenPieceIds}
          hiddenKey={hiddenKey}
          material={material}
          color={definition.color}
          landscapeSurface={definition.landscapeSurface}
          breakableMaterial={definition.material}
          groundTint={groundTint}
        />
      ))}
      {shell && shellMaterial ? chunks.map(({ chunk, hiddenKey }) => (
        <LandscapeShellEdgeChunk
          key={`shell:${chunk.id}`}
          chunk={chunk}
          hiddenPieceIds={hiddenPieceIds}
          hiddenKey={hiddenKey}
          depth={shell.depth}
          material={shellMaterial}
          color={shell.color}
          breakableMaterial={shell.material}
        />
      )) : null}
      <RigidBody type="fixed" colliders={false}>
        {chunks.map(({ chunk, hiddenKey }) => (
          <LandscapeColliderChunk
            key={`collider:${chunk.id}`}
            chunk={chunk}
            hiddenPieceIds={hiddenPieceIds}
            hiddenKey={hiddenKey}
          />
        ))}
      </RigidBody>
    </group>
  );
});
