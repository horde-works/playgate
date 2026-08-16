"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { Vector3 } from "three";
import type { CompoundKinematicClusterRegistry } from "./compoundKinematicCluster";
import type { VehicleFramePoseState } from "./VehicleFrameSystem";
import {
  observationCameraOffset,
  observationOrbitFromOffset,
  rotateObservationOrbit,
  zoomObservationOrbit,
  type ObservationOrbit,
} from "./vehicleObservationOrbit";

/**
 * Третья глубина телеметрии: камера сходит с плеча игрока и орбитой висит
 * вокруг выбранной машины, пока та летит. Владение камерой — через приоритет
 * кадра: Player и MouseLook пишут позу на приоритете 0, композер рендерит на
 * 1, осмотр встаёт между ними и потому всегда перекрывает игрока, не трогая
 * его подписок. Правила орбиты (зажимы, знаки, зум) — в чистом модуле
 * vehicleObservationOrbit; здесь только подписки на мышь/тач и сама камера.
 */
export const OBSERVATION_CAMERA_FRAME_PRIORITY = 0.5;

/** Структурная выжимка из MobileControlsState: осмотру нужен только взгляд. */
interface TouchLookSource {
  lookDeltaX: number;
  lookDeltaY: number;
}

export function VehicleObservationCamera({
  clusterId,
  poses,
  clusters,
  touchLook,
}: {
  clusterId: string;
  poses: MutableRefObject<ReadonlyMap<string, VehicleFramePoseState>>;
  clusters: CompoundKinematicClusterRegistry;
  touchLook: MutableRefObject<TouchLookSource>;
}) {
  const { gl } = useThree();
  const { rigidBodyStates } = useRapier();
  const orbit = useRef<ObservationOrbit | null>(null);
  const drag = useRef({ active: false, lastX: 0, lastY: 0 });
  const target = useMemo(() => new Vector3(), []);

  // Смена цели пересевает орбиту от текущей камеры: без телепорта взгляда.
  useEffect(() => {
    orbit.current = null;
  }, [clusterId]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const pointerLocked = document.pointerLockElement === gl.domElement;
      const dragging =
        drag.current.active &&
        ((event.buttons & 1) === 1 || (event.buttons & 2) === 2);
      if (!pointerLocked && !dragging) {
        return;
      }
      const deltaX = pointerLocked
        ? event.movementX
        : event.clientX - drag.current.lastX;
      const deltaY = pointerLocked
        ? event.movementY
        : event.clientY - drag.current.lastY;
      drag.current.lastX = event.clientX;
      drag.current.lastY = event.clientY;
      if (orbit.current) {
        orbit.current = rotateObservationOrbit(orbit.current, deltaX, deltaY);
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0 || event.button === 2) {
        drag.current = {
          active: true,
          lastX: event.clientX,
          lastY: event.clientY,
        };
      }
    };

    const handleMouseUp = () => {
      drag.current.active = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (orbit.current) {
        orbit.current = zoomObservationOrbit(orbit.current, event.deltaY);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    // Колесо — на канве и не-пассивно: страница не должна скроллиться зумом.
    gl.domElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      gl.domElement.removeEventListener("wheel", handleWheel);
    };
  }, [gl.domElement]);

  useFrame(({ camera }) => {
    const pose = poses.current.get(clusterId);
    if (!pose) {
      // Поза пропала (машина села или разобрана): кадр остаётся игроку —
      // его записи приоритета 0 уже в камере, а режим закроет onUnavailable.
      return;
    }
    // ЦЕЛЬ КАМЕРЫ ОБЯЗАНА ЖИТЬ В ТОМ ЖЕ КАДРЕ, ЧТО И ВИДИМАЯ МАШИНА.
    // Позы кластеров публикуются из физического шага (сырые 60 Гц), а мир
    // рендерится интерполированными телами rapier: камера, приваренная к
    // шаговой позе, дрожит относительно всего кадра. Тот же закон, что у
    // камеры игрока (Player: «следовать за render object, не за сырой
    // трансляцией»). Поэтому опора — интерполированный render object
    // носителя, а сдвиг до центра масс снят с ТОГО ЖЕ тела тем же
    // поколением: worldCom и translation читаются подряд после шага.
    const carrier = clusters.current.get(clusterId)?.body;
    const rendered = carrier
      ? rigidBodyStates.get(carrier.handle)?.object
      : undefined;
    if (carrier && rendered) {
      rendered.getWorldPosition(target);
      const centre = carrier.worldCom();
      const translation = carrier.translation();
      target.x += centre.x - translation.x;
      target.y += centre.y - translation.y;
      target.z += centre.z - translation.z;
    } else {
      // Запасной путь без носителя в реестре: шаговая поза хуже плавностью,
      // но честнее пустого кадра.
      target.set(
        pose.centreOfMass[0],
        pose.centreOfMass[1],
        pose.centreOfMass[2],
      );
    }
    if (!orbit.current) {
      orbit.current = observationOrbitFromOffset([
        camera.position.x - target.x,
        camera.position.y - target.y,
        camera.position.z - target.z,
      ]);
    }
    const touch = touchLook.current;
    if (touch.lookDeltaX !== 0 || touch.lookDeltaY !== 0) {
      orbit.current = rotateObservationOrbit(
        orbit.current,
        touch.lookDeltaX,
        touch.lookDeltaY,
      );
      touch.lookDeltaX = 0;
      touch.lookDeltaY = 0;
    }
    const offset = observationCameraOffset(orbit.current);
    camera.position.set(
      target.x + offset[0],
      target.y + offset[1],
      target.z + offset[2],
    );
    camera.lookAt(target.x, target.y, target.z);
  }, OBSERVATION_CAMERA_FRAME_PRIORITY);

  return null;
}
