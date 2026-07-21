declare module "n8ao" {
  import type {
    Camera,
    Color,
    Scene,
    WebGLRenderer,
    WebGLRenderTarget,
  } from "three";
  import { Pass } from "three/examples/jsm/postprocessing/Pass.js";

  export interface N8AOConfiguration {
    aoSamples: number;
    aoRadius: number;
    aoTones: number;
    denoiseSamples: number;
    denoiseRadius: number;
    distanceFalloff: number;
    intensity: number;
    denoiseIterations: number;
    renderMode: number;
    color: Color;
    gammaCorrection: boolean;
    screenSpaceRadius: boolean;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    transparencyAware: boolean;
    accumulate: boolean;
  }

  export class N8AOPass extends Pass {
    constructor(
      scene: Scene,
      camera: Camera,
      width?: number,
      height?: number,
    );
    readonly configuration: N8AOConfiguration;
    setQualityMode(
      mode: "Performance" | "Low" | "Medium" | "High" | "Ultra",
    ): void;
    setSize(width: number, height: number): void;
    dispose(): void;
    render(
      renderer: WebGLRenderer,
      writeBuffer: WebGLRenderTarget,
      readBuffer: WebGLRenderTarget,
      deltaTime?: number,
      maskActive?: boolean,
    ): void;
  }
}
