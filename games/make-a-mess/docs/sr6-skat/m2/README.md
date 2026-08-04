# SR-6 Skat — M2 4+2 canonical object

> Superseded by M3. Kept only as a visual-development checkpoint.

This is the accepted first ImageGen direction rebuilt as a real canonical 3D object.
`concept-direction.png` is only the surface reference. Every other PNG in this
folder is rendered from `sr6SkatObject.ts` and carries model hash `6a7bf1fd1c0a`.

The object is not yet registered in a world, prefab catalogue, interaction system,
route or physics runtime.

## Exact topology

The aircraft has three rotor stations along the longitudinal axis:

```text
FRONT +Z
  2 × front-class rotors at Z +1.75 m
  2 × front-class rotors at Z +0.45 m
  2 × rear power rotors at Z -1.65 m
REAR -Z
```

The first four rotors are forward of the estimated centre of mass. The rear pair is
not merely commanded harder: it is a visibly different hardware class.

| Parameter | Front class | Rear power class |
|---|---:|---:|
| Count | 4 | 2 |
| Duct diameter | 1.28 m | 1.48 m |
| Disk area per rotor | 1.287 m² | 1.720 m² |
| Nominal thrust ratio | 1.000 | 1.337 |
| Continuous motor target | 22 kW | 30 kW |
| Peak motor target | 35 kW | 50 kW |

At equal disk loading, rear/front thrust per rotor equals the disk-area ratio:
1.3369. The longitudinal area moments around Z = 0 are 5.662 m³ forward and
5.677 m³ rearward, a 0.27% mismatch. In other words, the 4+2 layout balances by
geometry and motor class before the mixer starts trimming it.

## Envelope and preliminary budget

| Parameter | M2 value |
|---|---:|
| Overall fixed envelope | 4.78 × 4.58 × 1.90 m |
| Total rotor disk area | 8.588 m² |
| MTOM design target | 420 kg |
| Disk loading at MTOM | 48.9 kg/m² / 10.0 lb/ft² |
| Ideal induced hover power | 57.6 kW |
| Estimated electrical hover power | 80.0 kW |
| Installed continuous / peak | 148 / 240 kW |
| Battery target | 35 kWh gross / 30 kWh usable |
| Design mission | 14 min / about 16 km at 70 km/h |

These are conceptual sizing values, not certified performance claims.

## Code ownership

- Canonical dimensions, anchors, parts, materials and cameras:
  `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`
- Deterministic capture entry point:
  `scripts/capture-sr6-skat-object-lab.mjs`
- Render manifest and same-revision proof: `manifest.json`

The canonical object is already code-native: ducts, lips, hubs, blades, guards,
cross-members, side torque boxes, cooling ribs, load diagonals, survival shell,
canopy, rollover arch, parachute hatch, battery keel and landing gear are named
parts. A later accepted scene adapter can consume these same parts instead of
redrawing a second vehicle.

## Acceptance views

- `top.png` proves the exact four-forward / two-rear topology and larger rear disks;
- `front.png`, `left.png`, `rear.png` are orthographic controls;
- `three-quarter-left.png` and `three-quarter-right.png` control the ImageGen-like form;
- `high-three-quarter.png` proves all six rotors in one view;
- `underside.png` controls the battery keel and landing load path;
- `rotor-joint.png` controls the larger rear power duct attachment;
- `structural-cutaway.png` hides the named outer shell and canopy groups;
- `silhouette.png` controls the primary plan outline.

Regenerate from the repository root:

```sh
node --experimental-strip-types scripts/capture-sr6-skat-object-lab.mjs
```

Status: ready for visual acceptance. Scene placement and flight integration wait for
that acceptance.
