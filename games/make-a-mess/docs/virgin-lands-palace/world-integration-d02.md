# D02 Astana world integration

## Result

- The accepted `d02-2026-08-12-real-openings` object is live on the
  north-west peninsula at the authored Palace site.
- All 1,743 canonical parts compile to exactly 1,743 unique world pieces.
- The former two-volume Palace planning mass is absent.
- Glass is bound only from `palace-glazing`: every window and four door leaves
  remain finite `darkGlass` colliders in real openings.
- The complete Astana scene resolves with zero initially unsupported pieces.

## Integration ownership

The world adapter does not emit alternative visible geometry. It reads the
accepted Object Lab parts and only assigns:

- the site translation and yaw;
- semantic world materials;
- collider participation;
- exact-pitch structural contact tiles for rotated long pieces;
- concealed standard construction metadata: curtain-wall posts behind the
  120 mm covers, 60 mm interior screen studs, and continuous return-wall strip
  footings.

The thin interior backs are non-colliding optical surfaces with a 2 mm physical
sheet volume. They do not turn a real window opening into a wall.

## Verification

- TypeScript: pass.
- Targeted lint: pass.
- Palace, Astana surface, plan, shell, framework and Pyramid regression suite:
  76/76 pass.
- Initial structural resolution: 0 unsupported.
- Palace-prefix joint audit: 1,743 pieces, 0 depth-buffer foils. Reported
  10–20 mm rainscreen/curtain joints and the accepted paired door meeting
  stiles are inherited from the protected D02 assembly; the world adapter
  introduces no second skin or duplicate mass.
- World renders were inspected at front-axis, front-right and peninsula scales.
  They confirm the intended geographic relation: the LRT remains between the
  civic core and the Palace, while the full building occupies its peninsula.

Capture metadata is recorded in [`world-d02/capture-manifest.json`](world-d02/capture-manifest.json).
