"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import {
  luminanceFromBytes,
  screenLuminanceProbe,
} from "./screenLuminanceProbe";

/**
 * Читает готовый кадр в точках, заказанных screenLuminanceProbe.
 *
 * Живёт ПОСЛЕ пост-цепочки (priority 2 > composer.render на 1): дефолтный
 * фреймбуфер в этот момент держит финальный кадр текущего rAF, и readPixels
 * честен без preserveDrawingBuffer. Координаты переводятся из client в
 * пиксели буфера через фактический прямоугольник канваса — так учтены и
 * DPR, и адаптивный render scale.
 */
const SAMPLE_INTERVAL_SECONDS = 0.25;

export function ScreenLuminanceSampler() {
  const { gl } = useThree();
  const sinceSample = useRef(SAMPLE_INTERVAL_SECONDS);
  const pixel = useRef(new Uint8Array(4));

  useFrame((_, delta) => {
    if (screenLuminanceProbe.requests.size === 0) {
      return;
    }
    sinceSample.current += delta;
    if (sinceSample.current < SAMPLE_INTERVAL_SECONDS) {
      return;
    }
    sinceSample.current = 0;
    const context = gl.getContext();
    const canvasRect = gl.domElement.getBoundingClientRect();
    if (canvasRect.width < 1 || canvasRect.height < 1) {
      return;
    }
    const scaleX = context.drawingBufferWidth / canvasRect.width;
    const scaleY = context.drawingBufferHeight / canvasRect.height;
    for (const [key, point] of screenLuminanceProbe.requests) {
      const bufferX = Math.round((point.x - canvasRect.left) * scaleX);
      // GL считает от нижнего края.
      const bufferY = Math.round(
        context.drawingBufferHeight - (point.y - canvasRect.top) * scaleY,
      );
      if (
        bufferX < 0 ||
        bufferY < 0 ||
        bufferX >= context.drawingBufferWidth ||
        bufferY >= context.drawingBufferHeight
      ) {
        continue;
      }
      context.readPixels(
        bufferX,
        bufferY,
        1,
        1,
        context.RGBA,
        context.UNSIGNED_BYTE,
        pixel.current,
      );
      screenLuminanceProbe.results.set(
        key,
        luminanceFromBytes(pixel.current[0], pixel.current[1], pixel.current[2]),
      );
    }
    screenLuminanceProbe.version += 1;
  }, 2);

  return null;
}
