"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Night-only glow. Daylight uses the direct renderer; running a second scene
 * pass for screen-space AO was far more expensive than this voxel scene's
 * actual geometry and duplicated every visible triangle.
 */
export function TeardownPostProcessing({
  compact,
}: {
  compact: boolean;
}) {
  const { camera, gl, scene, size } = useThree();
  const dpr = useThree((state) => state.viewport.dpr);
  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = compact
      ? null
      : new UnrealBloomPass(new Vector2(32, 32), 0.16, 0.42, 1.18);
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    if (bloomPass) {
      composer.addPass(bloomPass);
    }
    composer.addPass(outputPass);

    return { bloomPass, composer, outputPass };
  }, [camera, compact, gl, scene]);

  useEffect(() => {
    const pixelRatio = dpr;
    pipeline.composer.setPixelRatio(pixelRatio);
    pipeline.composer.setSize(size.width, size.height);
    pipeline.bloomPass?.setSize(
      Math.max(64, Math.round(size.width * pixelRatio * 0.5)),
      Math.max(64, Math.round(size.height * pixelRatio * 0.5)),
    );
  }, [compact, dpr, pipeline, size.height, size.width]);

  useEffect(
    () => () => {
      pipeline.bloomPass?.dispose();
      pipeline.outputPass.dispose();
      pipeline.composer.dispose();
    },
    [pipeline],
  );

  useFrame((_, delta) => {
    pipeline.composer.render(delta);
  }, 1);

  return null;
}
