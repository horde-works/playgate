# M2 — Poldermolen Oudegein-type wipmolen

Standalone structural object study. It is not registered in a world, the scene
compiler, the support solver, water simulation, or physics.

## Fixed dimensional anchors

- sail span: 24.90 m
- rotor hub: +12.85 m
- lower blade envelope: +0.40 m
- windshaft length: 5.14 m
- external half-open scoop wheel: 4.72 × 0.30 m
- lower tower envelope: 8.60 × 8.20 m
- upper house envelope: 5.60 × 7.40 m

The local origin is the lower-tower ground centre, Y is up, and +Z is the
front/rotor side. The upper house, tail and scoop wheel are fixed. Only the
sail rotor contract permits constant rotation; wind and yaw are explicitly
disabled.

## Rejection conditions

- lower tower and upper house merge into one continuous tapered skin;
- upper house loses its visible seat/main-post relationship;
- blade clearance stops reading as a ground-sailer;
- rear stair and tail are decorative pieces without connection to the house;
- scoop wheel is detached from the water shaft or hidden inside the tower;
- a scene adapter silently enables wind, upper-house yaw or tail yaw.

All PNG files are rendered from the same canonical object and stamped with the
same model hash. `rear.png` controls the scoop-wheel/shaft relation;
`seat-and-tail.png` controls the separate upper machine; `silhouette.png`
controls the defining two-mass outline.

Regenerate the set from the repository root:

```sh
node --experimental-strip-types scripts/capture-oudegein-wipmolen-object-lab.mjs
```

