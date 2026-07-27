"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useLayoutEffect, type MutableRefObject } from "react";
import type {
  BreakablePieceDefinition,
  LampEventState,
  MutableSceneObjectDefinition,
} from "./destructionScene";
import {
  updateMutableSceneObjects,
  type MutablePieceVisualState,
} from "./sceneDynamics";

export function SceneMutableObjectSystem({
  definitions,
  pieceById,
  worldTimeRef,
  resolveEventState,
  states,
}: {
  definitions: readonly MutableSceneObjectDefinition[];
  pieceById: ReadonlyMap<string, BreakablePieceDefinition>;
  worldTimeRef: MutableRefObject<number>;
  resolveEventState: (sourceClusterId: string) => LampEventState;
  states: MutableRefObject<Map<string, MutablePieceVisualState>>;
}) {
  const update = useCallback((deltaSeconds?: number) => {
    updateMutableSceneObjects({
      definitions,
      pieceById,
      worldTime: worldTimeRef.current,
      realTimeMs: Date.now(),
      deltaSeconds,
      resolveEventState,
      target: states.current,
    });
  }, [definitions, pieceById, resolveEventState, states, worldTimeRef]);

  useLayoutEffect(() => {
    update();
    return () => {
      states.current.clear();
    };
  }, [states, update]);
  useFrame((_state, deltaSeconds) => update(deltaSeconds));

  return null;
}
