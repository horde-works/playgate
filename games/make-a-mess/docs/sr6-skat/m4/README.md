# SR-6 Skat — M4 nacelle-mounted structural loop

> Superseded by M5 after lowering and smoothing the aft survival-cell profile,
> centralising the battery keel and separating cockpit clevises from duct-wall
> hard-points.

M4 corrects two structural-form errors in M3. Every PNG in this folder is a
deterministic render of `sr6SkatObject.ts` with model hash `e826c55bd8f9`.

## Corrected load path

No airframe belt or cross-member crosses a rotor sweep, motor or motor pylon.

- The front bumper sits ahead of both forward disks. Its shell lands on the
  front/inboard quadrants of the two duct housings.
- Three inboard hard-points per side are mounted on the outer duct walls. Root
  beams stop at those hard-points and transfer load into the survival tub.
- Inter-nacelle upper and lower bridges exist only in the free space between
  adjacent duct circumferences. Their endpoints are on duct fore/aft poles.
- Middle and rear cross-car structure is split into left and right halves. Each
  half runs from the central tub to the inboard duct wall; none continues through
  the rotor centre.
- The only structures inside a duct are that duct's own motor, three motor
  pylons, blades and protective grille.

The `top.png` view controls rotor-sweep clearance. `structural-cutaway.png`
exposes the separated roots and `rotor-joint.png` controls the rear hard-point.

## Corrected cockpit rise

The aft rise is now part of the cockpit/survival-cell geometry rather than a
local fairing placed behind a low tub.

- Survival-cell bottom, shoulder and roof all rise aft of the pilot.
- The canopy sill rises from Y 0.97 m at Z +1.05 m to Y 1.34 m at Z -0.68 m.
- Glazing reaches Y 2.04 m at its aft crown.
- The rollover arch rises with the tub to Y 1.96 m.
- The aft crown continues into a single smooth Formula-style hump, tapering from
  Y 2.06 m behind the cockpit to Y 0.92 m at the tail.

The resulting fixed envelope is 4.78 × 4.58 × 2.08 m. Rear rotor planes remain
0.18 m above the foremost rotor plane.

## Ownership and status

- Canonical model:
  `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`
- Deterministic capture:
  `scripts/capture-sr6-skat-object-lab.mjs`
- Render identity and view list: `manifest.json`

This remains an isolated authoring object. World placement, flight physics,
mass validation, FEA, CFD and acoustics are untouched.

Status: ready for visual acceptance of the corrected structure and profile.
