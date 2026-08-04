# SR-6 Skat — M1 object study

> Superseded by M2. The product owner selected the first ImageGen direction as a
> 4-forward + 2-rear architecture. M1 remains only as the rejected 3+3 comparison.

Standalone aircraft study. It is deliberately not registered in a world, the scene
compiler, interaction, routes or physics. All acceptance PNGs except
`concept-direction.png` are rendered from one canonical model and stamped with the
same model hash.

## Design thesis

SR-6 is a compact single-seat, battery-electric, thrust-borne aircraft. Six fixed
ducted rotors form two transverse rows of three. The cabin fits in the 2.41 m clear
longitudinal bay between the front-centre and rear-centre ducts; it never intersects
a rotor disk.

The visual idea is a stingray in plan and a single-seat formula car in profile, but
the form follows four physical systems:

1. a closed composite survival cell around the pilot;
2. two transverse spars carrying the three ducts in each rotor row;
3. two outer longitudinal torque boxes joining the rotor rows into a ladder frame;
4. a low, isolated battery keel below the seat.

The rear “hump” is not decorative bodywork. It contains the rollover arch,
ballistic-parachute bay, high-voltage isolation hardware and cooling exhaust. The
open diagonal bays in the outer torque boxes are cooling paths and visual proof of
the load path. Four landing legs attach to those structural nodes.

## Fixed dimensional anchors

| Parameter | M1 value |
|---|---:|
| Overall length | 5.19 m |
| Overall width | 4.68 m |
| Overall height | 1.90 m |
| Rotor count | 6, fixed horizontal axes |
| Rotor diameter | 1.34 m |
| Rotor row spacing | 3.75 m |
| Rotor column spacing | 1.62 m |
| Total disk area | 8.46 m² |
| Duct underside clearance | 0.78 m |
| Landing footprint | 3.60 × 2.14 m |
| Estimated centre of mass | Y +0.64 m |
| Lift plane | Y +0.92 m |
| Canopy-open service height | 2.55 m target |

Local origin is ground centre, Y is up, and +Z is forward.

The protected rotor sweep stays inside the fixed 5.19 × 4.68 m plan envelope. The
canopy is a separate shell group and is intended to hinge forward by 62° only after
all six rotors report zero speed. Its left sill carries a mechanically obvious inside
and outside emergency release.

## Preliminary mass and power budget

These are design targets, not certified performance claims.

| Item | M1 target |
|---|---:|
| Maximum take-off mass | 420 kg |
| Pilot allowance | 95 kg |
| Gross / usable battery | 35 / 30 kWh |
| Battery pack target | 150 kg |
| Empty mass target | 304 kg |
| Hover disk loading | 49.6 kg/m² / 10.2 lb/ft² |
| Ideal induced hover power, sea level | 58 kW |
| Estimated electrical hover power | 81 kW |
| Installed continuous / peak power | 150 / 240 kW |
| Nominal urban mission | 14 min / about 16 km at 70 km/h |
| Contingency reserve target | 5 min powered flight |
| Design speed limit | 100 km/h |

At the target mass, loss of any one rotor leaves the centre of mass inside the
convex hull of the other five rotor centres. Momentum-theory power rises by about
9.5% for level one-rotor-out hover, so five 25 kW continuous channels have enough
paper margin for a controlled landing. This does not claim dispatch after a failure,
two-rotor-out capability, certification or safe parachute deployment below its
minimum altitude.

The alternating reaction-torque pattern when viewed from above is:

```text
FRONT +Z
CW   CCW  CW
CCW  CW   CCW
REAR -Z
```

Roll, pitch and vertical force come from differential rotor thrust; yaw comes from
the alternating reaction moments. Forward flight requires the whole airframe to
tilt. There is no hidden cruise propeller, wing, tail fin or trim ballast.

## Acceptance views

- `top.png` — controls the exact 3+3 topology and protected rotor sweep;
- `front.png`, `left.png`, `rear.png` — control orthographic proportion;
- `three-quarter-left.png`, `three-quarter-right.png` — control silhouette and overlap;
- `high-three-quarter.png` — proves all six rotors and the two structural rows;
- `underside.png` — controls battery keel and landing load path;
- `rotor-joint.png` — controls the duct / spar / torque-box node;
- `structural-cutaway.png` — hides named shell groups and exposes the real inner system;
- `silhouette.png` — controls the primary plan outline;
- `concept-direction.png` — ImageGen material/industrial-design reference only; it is
  explicitly not a geometry source and its missing centre ducts are rejected.

Regenerate the canonical set from the repository root:

```sh
node --experimental-strip-types scripts/capture-sr6-skat-object-lab.mjs
```

## Current discrepancies before scene work

- M1 proves topology, scale and load paths; surface continuity is still a structural
  grey model, not a production Class-A skin.
- The canopy opening sweep is specified but not yet rendered as a second state.
- Rotor aerodynamics, duct lip section, blade twist, thermal sizing and acoustic
  interaction require analysis or test; the current blades are envelope witnesses.
- The 35 kWh pack and 304 kg empty-mass target need a component-level mass roll-up.
- The ballistic parachute is a high-altitude last resort; low-altitude safety depends
  on one-motor-out controlled landing and energy-absorbing structure.
- Ground personnel still require a rotor/downwash exclusion procedure despite the
  rings and top guards.

Status: ready for visual acceptance. No city placement or runtime integration has
been attempted.
