import type { Camera, IUniform, Vector3 } from "three";

/**
 * Skip vertex work for vegetation whose origin is well off-screen.
 *
 * Distance fade MUST stay view-independent: gating range on the view cone
 * made the polder boil when the mouse panned. This only moves already
 * off-screen tufts out of clip, so they reappear at the same size.
 */
export const VEGETATION_ORIGIN_CULL_GLSL = /* glsl */ `
          vec3 cullToCam = origin.xyz - uCamera;
          if (dot(cullToCam, uViewDir) < -1.2) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          vec4 originClip = projectionMatrix * viewMatrix * origin;
          if (originClip.w > 0.02) {
            vec2 cullNdc = originClip.xy / originClip.w;
            if (abs(cullNdc.x) > 1.65 || abs(cullNdc.y) > 1.65) {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              return;
            }
          }
`;

export function writeVegetationViewCull(
  uniforms: { [name: string]: IUniform },
  camera: Camera,
): void {
  const cameraUniform = uniforms.uCamera?.value as Vector3 | undefined;
  const viewDirUniform = uniforms.uViewDir?.value as Vector3 | undefined;
  if (cameraUniform) cameraUniform.copy(camera.position);
  if (viewDirUniform) camera.getWorldDirection(viewDirUniform);
}
