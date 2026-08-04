# SR-6 Skat — M3 integrated 4+2 airframe

> Superseded by M4 after correcting structural members that crossed rotor sweeps
> and rebuilding the aft cockpit rise as part of the survival cell.

M3 rebuilds the selected concept as one deterministic, code-native 3D object.
`reference-selected.png` preserves the user's crop and `concept-direction.png`
preserves the full visual direction. They are references only. Every acceptance
view is rendered from `sr6SkatObject.ts` and carries model hash `690a74a5fa9a`.

The object is deliberately isolated. It is not registered in a world, prefab
catalogue, route, interaction system or flight-physics runtime.

## Form and load-path decisions

- A broad front bumper shell stitches the two foremost ducts together. It is a
  deep structural module with a carbon leading edge, metal inset and two load
  links into the central tub, not a decorative beam.
- All six ducts belong to a continuous airframe around the cockpit: floor and
  power cross-members, kinked upper/lower side rails, front/rear torque-box
  shells, shoulder gussets, root gussets, ribs and open-bay diagonals.
- The cockpit roof rises aft from 1.08 m at the forward glazing to 1.92 m at the
  roll arch, then becomes the tapered Formula-style survival hump.
- The rear power pair sits at Y 1.06 m, 0.18 m above the forward-class rotor
  planes. Its larger ducts and motors make the power difference visible.
- The side structure intentionally alternates between broad closed torque-box
  areas and narrow exposed tubular spans. The gaps are structural bays rather
  than uniformly filled bodywork.

## Exact topology

```text
FRONT +Z
  2 × front-class rotors at Z +1.75 m, plane Y 0.88 m
  2 × front-class rotors at Z +0.45 m, plane Y 0.90 m
  2 × rear power rotors at Z -1.65 m, plane Y 1.06 m
REAR -Z
```

| Parameter | Front class | Rear power class |
|---|---:|---:|
| Count | 4 | 2 |
| Duct diameter | 1.28 m | 1.48 m |
| Disk area per rotor | 1.287 m² | 1.720 m² |
| Nominal thrust ratio | 1.000 | 1.337 |
| Continuous motor target | 22 kW | 30 kW |
| Peak motor target | 35 kW | 50 kW |

At equal disk loading, rear/front thrust per rotor is 1.3369. The longitudinal
area moments about the estimated CG at Z = 0 are 5.662 m³ forward and 5.677 m³
rearward: a 0.27% mismatch before control-mixer trim.

## Envelope and preliminary sizing

| Parameter | M3 value |
|---|---:|
| Overall fixed envelope | 4.78 × 4.58 × 2.00 m |
| Total rotor disk area | 8.588 m² |
| MTOM design target | 420 kg |
| Disk loading at MTOM | 48.9 kg/m² / 10.0 lb/ft² |
| Estimated electrical hover power | 80 kW |
| Installed continuous / peak | 148 / 240 kW |
| Battery target | 35 kWh gross / 30 kWh usable |

These are conceptual sizing values, not certified performance claims.

## Named model systems

- six detailed rotor assemblies: deep shrouds, metal lips, swept blades, motor
  hubs, three motor pylons, radial and concentric guards, service panels;
- front bumper shell and its tub links;
- side torque boxes, rails, ribs, gussets, cross-members and open-bay diagonals;
- survival cell, rising glazing, roll arch, parachute hatch and cooling intakes;
- battery keel, seat, pilot restraint system and articulated landing gear.

## Code ownership

- Canonical geometry, materials, anchors and cameras:
  `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`
- Deterministic same-model capture:
  `scripts/capture-sr6-skat-object-lab.mjs`
- Render identity and view list: `manifest.json`

Regenerate from the repository root:

```sh
node --experimental-strip-types scripts/capture-sr6-skat-object-lab.mjs
```

## Known M3 limits

- The model is at structural-design fidelity, before final Class-A surface
  continuity, production panel gaps, fasteners and material/UV finishing.
- Canopy opening, hinge and emergency-release kinematics are not authored yet.
- Mass distribution, structural FEA, rotor/duct CFD, downwash, acoustics and
  controllability remain validation work; current values are design targets.
- No scene placement or flight integration should be started before visual
  acceptance of this canonical object.

Status: ready for visual acceptance.
