import { propWeepingWillow } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/content/prefabs/coreFlora.ts";
import { createStructuralSolver } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/structuralPhysics.ts";
import { structuralMaterialProfiles } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/destructionScene.ts";
const ground = { id: "plate", material: "stone", shape: "groundTile", position: [0, -0.5, 0], size: [40, 1, 40], foundation: true };
for (const seed of [81, 82, 29]) {
  for (const scale of [0.9, 1.0, 1.06]) {
    const pieces = [ground, ...propWeepingWillow({ seed, scale })];
    const collapsed = [...createStructuralSolver(pieces, structuralMaterialProfiles).resolve(new Set())];
    console.log(`seed ${seed} scale ${scale} → ${collapsed.length ? collapsed.slice(0, 4).join(" ") + ` (${collapsed.length})` : "стоит целиком"}`);
  }
}
