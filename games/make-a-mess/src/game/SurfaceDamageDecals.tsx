"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { BreakableMaterial } from "./destructionScene";

/**
 * ОТМЕТИНА ВМЕСТО ПЕРЕСБОРКИ.
 *
 * Пулевое отверстие не меняет форму куска — оно меняет его поверхность.
 * Раньше это различие в движке отсутствовало: любое попадание переводило
 * авторскую сетку в воксельные коробки, и корпус машины после одной пули
 * читался кубиками. Теперь мелкое повреждение остаётся на сетке, а видимым
 * его делает эта система: пробоина, окалина вокруг неё и осыпавшаяся кромка.
 *
 * Отметина живёт в системе своего носителя. У постройки это мир, у машины —
 * её компаунд, поэтому пробоины едут вместе с бортом, а не висят в воздухе на
 * месте попадания.
 *
 * Бюджет жёсткий и заранее посчитанный: один InstancedMesh на весь мир,
 * кольцевой буфер на MAXIMUM_DECALS отметин, ноль дополнительных проходов и
 * ни одного нового материала на кусок. Переполнение вытесняет самую старую —
 * так же, как это делают следы от машин и попадания пулемёта.
 */

export const MAXIMUM_DECALS = 192;
/** Отступ от поверхности: меньше — z-fighting, больше — отметина «висит». */
const SURFACE_OFFSET = 0.012;

export interface SurfaceDamageDecalRequest {
  /** Кусок, которому принадлежит отметина: с ним она и исчезнет. */
  readonly sourceId: string;
  /** Точка в системе носителя (мир либо компаунд машины). */
  readonly point: readonly [number, number, number];
  /** Нормаль поверхности в той же системе; годится и обратное направление пули. */
  readonly normal: readonly [number, number, number];
  readonly radius: number;
  readonly material: BreakableMaterial;
  /** Носитель отметины; null — мир. */
  readonly clusterId: string | null;
}

export interface SurfaceDamageDecalRuntime {
  spawn(request: SurfaceDamageDecalRequest): void;
  /** Кусок перешёл в воксели или исчез — его отметины больше не нужны. */
  dropSource(sourceId: string): void;
  clear(): void;
}

export interface DecalCarrierFrame {
  readonly origin: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

interface DecalSlot {
  active: boolean;
  sourceId: string;
  clusterId: string | null;
  point: Vector3;
  normal: Vector3;
  radius: number;
  color: Color;
}

/**
 * Пробоина рисуется одной текстурой: тёмный зев, рваная кромка и светлая
 * окалина по краю. Рисунок процедурный — он обязан жить в тех же условиях,
 * что и остальная поверхность, и не тянуть за собой файл.
 */
function createDamageTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, size, size);

  const centre = size / 2;
  // Окалина: широкое мягкое пятно, темнее материала, с рваным краем.
  const halo = context.createRadialGradient(
    centre,
    centre,
    size * 0.06,
    centre,
    centre,
    size * 0.5,
  );
  halo.addColorStop(0, "rgba(0, 0, 0, 0.92)");
  halo.addColorStop(0.34, "rgba(0, 0, 0, 0.55)");
  halo.addColorStop(0.72, "rgba(0, 0, 0, 0.16)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(centre, centre, size * 0.5, 0, Math.PI * 2);
  context.fill();

  // Зев: почти чёрный, с неровной кромкой — отверстие не бывает циркульным.
  context.fillStyle = "rgba(0, 0, 0, 0.98)";
  context.beginPath();
  for (let step = 0; step <= 24; step += 1) {
    const angle = (step / 24) * Math.PI * 2;
    const wobble =
      0.15 + 0.035 * Math.sin(angle * 3.7) + 0.022 * Math.sin(angle * 6.1 + 1.3);
    const x = centre + Math.cos(angle) * size * wobble;
    const y = centre + Math.sin(angle) * size * wobble;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();

  // Осыпавшаяся кромка: короткие светлые лучи наружу от зева.
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 1.4;
  for (let ray = 0; ray < 14; ray += 1) {
    const angle = (ray / 14) * Math.PI * 2 + 0.31;
    const inner = size * 0.17;
    const outer = size * (0.22 + 0.1 * Math.abs(Math.sin(angle * 5.3)));
    context.beginPath();
    context.moveTo(
      centre + Math.cos(angle) * inner,
      centre + Math.sin(angle) * inner,
    );
    context.lineTo(
      centre + Math.cos(angle) * outer,
      centre + Math.sin(angle) * outer,
    );
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Цвет окалины: у металла холодная, у камня и дерева — своя пыль. */
const SCORCH_BY_MATERIAL: Partial<Record<BreakableMaterial, string>> = {
  steel: "#b9c2cc",
  sheetMetal: "#c8ced6",
  aluminium: "#b4bcc2",
  wood: "#c8a578",
  plaster: "#e4ded2",
  brick: "#d8b49a",
  concrete: "#cfccc6",
  stone: "#c9c6bf",
  basalt: "#9aa0a6",
  graphiteStone: "#a8adb2",
  plastic: "#d5d5d5",
  asphalt: "#b8b8b8",
};

export function SurfaceDamageDecals({
  runtimeRef,
  carrierFrameOf,
}: {
  runtimeRef: MutableRefObject<SurfaceDamageDecalRuntime | null>;
  /** Живая система носителя; null — кластер не смонтирован. */
  carrierFrameOf: (clusterId: string) => DecalCarrierFrame | null;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const nextSlot = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const worldPoint = useMemo(() => new Vector3(), []);
  const worldNormal = useMemo(() => new Vector3(), []);
  const carrierQuaternion = useMemo(() => new Quaternion(), []);
  const carrierOrigin = useMemo(() => new Vector3(), []);
  const carrierPosition = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(0, 0, 1), []);
  const texture = useMemo(() => createDamageTexture(), []);
  const geometry = useMemo(() => new CircleGeometry(0.5, 14), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        toneMapped: true,
      }),
    [texture],
  );
  const slots = useRef<DecalSlot[]>(
    Array.from({ length: MAXIMUM_DECALS }, () => ({
      active: false,
      sourceId: "",
      clusterId: null,
      point: new Vector3(),
      normal: new Vector3(0, 1, 0),
      radius: 0.1,
      color: new Color("#ffffff"),
    })),
  );

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }, [geometry, material, texture]);

  const hideSlot = useMemo(
    () => (index: number) => {
      dummy.position.set(0, -10_000, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    },
    [dummy],
  );

  useEffect(() => {
    for (let index = 0; index < MAXIMUM_DECALS; index += 1) {
      hideSlot(index);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [hideSlot]);

  useEffect(() => {
    const api: SurfaceDamageDecalRuntime = {
      spawn: (request) => {
        const index = nextSlot.current;
        nextSlot.current = (nextSlot.current + 1) % MAXIMUM_DECALS;
        const slot = slots.current[index];
        slot.active = true;
        slot.sourceId = request.sourceId;
        slot.clusterId = request.clusterId;
        slot.point.set(...request.point);
        slot.normal.set(...request.normal);
        if (slot.normal.lengthSq() < 1e-8) {
          slot.normal.set(0, 1, 0);
        }
        slot.normal.normalize();
        slot.radius = Math.max(0.03, request.radius);
        slot.color.set(SCORCH_BY_MATERIAL[request.material] ?? "#cbcbcb");
      },
      dropSource: (sourceId) => {
        slots.current.forEach((slot, index) => {
          if (slot.active && slot.sourceId === sourceId) {
            slot.active = false;
            hideSlot(index);
          }
        });
        if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
      },
      clear: () => {
        slots.current.forEach((slot, index) => {
          slot.active = false;
          hideSlot(index);
        });
        if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
      },
    };
    runtimeRef.current = api;
    return () => {
      if (runtimeRef.current === api) {
        runtimeRef.current = null;
      }
    };
  }, [hideSlot, runtimeRef]);

  useFrame(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }
    let changed = false;
    for (let index = 0; index < MAXIMUM_DECALS; index += 1) {
      const slot = slots.current[index];
      if (!slot.active) {
        continue;
      }
      worldPoint.copy(slot.point);
      worldNormal.copy(slot.normal);
      if (slot.clusterId) {
        const frame = carrierFrameOf(slot.clusterId);
        if (!frame) {
          // Носитель уехал из мира вместе с отметиной.
          slot.active = false;
          hideSlot(index);
          changed = true;
          continue;
        }
        carrierQuaternion.set(...frame.quaternion);
        carrierOrigin.set(...frame.origin);
        carrierPosition.set(...frame.position);
        worldPoint
          .sub(carrierOrigin)
          .applyQuaternion(carrierQuaternion)
          .add(carrierPosition);
        worldNormal.applyQuaternion(carrierQuaternion);
      }
      dummy.position
        .copy(worldPoint)
        .addScaledVector(worldNormal, SURFACE_OFFSET);
      dummy.quaternion.setFromUnitVectors(forward, worldNormal);
      dummy.scale.setScalar(slot.radius * 2.6);
      dummy.updateMatrix();
      current.setMatrixAt(index, dummy.matrix);
      current.setColorAt(index, slot.color);
      changed = true;
    }
    if (changed) {
      current.instanceMatrix.needsUpdate = true;
      if (current.instanceColor) {
        current.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, MAXIMUM_DECALS]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}
