import type { Camera, Object3D, Scene, WebGLRenderer } from "three";

/**
 * Защищённый двойник `WebGLRenderer.compileAsync` (three r185).
 *
 * Родной поллер читает `materialProperties.currentProgram` БЕЗ guard:
 * материал, dispose-нутый между `compile()` и тиком поллера — смена сцены,
 * HMR, пересборка оверлеев, — роняет setTimeout-колбэк неперехваченным
 * «undefined is not an object (evaluating 'program.isReady')» (формулировка
 * Safari; `.catch` у промиса не помогает — бросок живёт в таймере, и промис
 * просто никогда не решается). Здесь тот же протокол ожидания, но материал
 * с исчезнувшей программой считается «ждать нечего»: его свойства сброшены,
 * компилировать больше нечего.
 */
export function safeCompileAsync(
  renderer: WebGLRenderer,
  scene: Object3D,
  camera: Camera,
  targetScene: Scene | null = null,
): Promise<void> {
  const materials = renderer.compile(scene, camera, targetScene);
  const { properties } = renderer;
  return new Promise((resolve) => {
    function checkMaterialsReady(): void {
      for (const material of [...materials]) {
        const materialProperties = properties.get(material) as {
          currentProgram?: { isReady(): boolean };
        };
        const program = materialProperties.currentProgram;
        if (!program || program.isReady()) {
          materials.delete(material);
        }
      }
      if (materials.size === 0) {
        resolve();
        return;
      }
      setTimeout(checkMaterialsReady, 10);
    }
    checkMaterialsReady();
  });
}
