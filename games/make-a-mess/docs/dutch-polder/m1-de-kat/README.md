# M1 — De Kat-type paint mill

Standalone structural object study. It is intentionally not registered in a world,
the scene compiler, the support solver, or physics.

## Fixed dimensional anchors

- sail span: 21.76 m
- gallery deck: +7.10 m
- gallery outer diameter: 13.20 m
- rotor hub: +15.80 m
- cap crown: +19.00 m
- maximum rotor envelope: +26.68 m

The local origin is the mill ground centre, Y is up, and +Z is the front/rotor side.
The cap is fixed. The rotor contract permits constant rotation only and explicitly has
no wind coupling.

## Acceptance views

All PNG files are rendered from the same canonical object and stamped with the same
model hash. Orthographic front/left/rear views control proportion; perspective views
control construction and overlap; `rotor-joint.png` controls the hub assembly;
`silhouette.png` controls the primary outline.

Regenerate the set from the repository root:

```sh
node --experimental-strip-types scripts/capture-dutch-windmill-object-lab.mjs
```

