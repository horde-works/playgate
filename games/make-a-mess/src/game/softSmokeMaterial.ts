import {
  NormalBlending,
  ShaderMaterial,
  Vector3,
  type Vector3Tuple,
} from "three";

interface SoftSmokeMaterialOptions {
  readonly denseColor: Vector3Tuple;
  readonly agedColor: Vector3Tuple;
  readonly minimumOpacity: number;
  readonly maximumOpacity: number;
}

/** Shared camera-facing soft smoke used by engines and short weapon puffs. */
export function createSoftSmokeMaterial({
  denseColor,
  agedColor,
  minimumOpacity,
  maximumOpacity,
}: SoftSmokeMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: {
      uDenseColor: { value: new Vector3(...denseColor) },
      uAgedColor: { value: new Vector3(...agedColor) },
      uMinimumOpacity: { value: minimumOpacity },
      uMaximumOpacity: { value: maximumOpacity },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSource;
      attribute float aLife;
      attribute float aSize;
      attribute float aPower;
      attribute float aSeed;
      varying vec2 vQuad;
      varying float vLife;
      varying float vPower;
      varying float vSeed;
      void main() {
        vQuad = position.xy;
        vLife = aLife;
        vPower = aPower;
        vSeed = aSeed;
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 world = aSource +
          camRight * position.x * aSize * 1.18 +
          camUp * position.y * aSize;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform vec3 uDenseColor;
      uniform vec3 uAgedColor;
      uniform float uMinimumOpacity;
      uniform float uMaximumOpacity;
      varying vec2 vQuad;
      varying float vLife;
      varying float vPower;
      varying float vSeed;
      void main() {
        float angle = atan(vQuad.y, vQuad.x);
        float softNoise = 1.0 + 0.075 * sin(angle * 5.0 + vSeed * 6.2832);
        float d = length(vQuad * 2.0) * softNoise;
        float alpha = smoothstep(1.0, 0.12, d);
        alpha *= smoothstep(0.0, 0.07, vLife) * smoothstep(1.0, 0.52, vLife);
        alpha *= mix(uMinimumOpacity, uMaximumOpacity, vPower);
        vec3 smoke = mix(
          uDenseColor,
          uAgedColor,
          smoothstep(0.12, 1.0, vLife)
        );
        gl_FragColor = vec4(smoke, alpha);
      }
    `,
  });
}
