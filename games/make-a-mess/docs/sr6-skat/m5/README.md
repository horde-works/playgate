# SR-6 Skat — M5 smooth raised-tail survival cell

> Superseded by M6. M5 incorrectly continued the full-depth survival cell to the
> tail instead of separating it from a thin raised tail spine and open rear bay.

M5 follows the selected side reference more closely without reverting the M4
rotor-clearance correction. Every PNG in this folder is rendered from the same
code-native object with model hash `820da390f04a`.

## Cockpit profile

- The M4 vertical rear hump is removed. Canopy height builds gradually from
  Y 1.08 m at the forward glazing to Y 1.76 m behind the pilot.
- The rear deck peaks only slightly higher at Y 1.78 m, then tapers continuously
  through five progressively narrower sections to Y 0.84 m at the tail.
- The survival-cell bottom also rises aft: from Y 0.42 m near the centre to
  Y 0.65 m near the rear shoulder. The whole cell lifts and narrows rather than
  carrying a tall fairing on a level tub.
- Body and canopy cross-sections use ten perimeter vertices instead of six,
  removing the previous hexagonal shoulders and producing a smoother transition.
- Overall height is reduced from M4's 2.08 m to 1.82 m.

## Central battery keel

The rectangular 2.55 m battery block is replaced by a tapered closed keel from
Z +1.05 m to Z -1.08 m. It is 2.13 m long, widest around the centre and terminates
well before both nose and tail. Its lower surface rises at both ends.

## Cockpit-to-motor-contour interface

The survival cell and the perimeter motor structure remain separate systems with
explicit interfaces:

- three metal cockpit clevises and three duct-wall hard-points per side;
- paired tubular upper/lower links in the open front and middle bays;
- a broad tapered moment box plus diagonal at each rear attachment;
- split central cross-members and inter-nacelle bridges that terminate on duct
  shells and never cross a rotor sweep, motor or motor pylon.

`rotor-joint.png` hides the outer shell specifically to expose these interfaces.
`structural-cutaway.png` shows the complete six-point suspension arrangement.

## Ownership and status

- Canonical geometry:
  `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`
- Deterministic capture:
  `scripts/capture-sr6-skat-object-lab.mjs`
- Render identity: `manifest.json`

No world placement, flight physics, FEA, CFD, acoustic or mass validation was
changed. Status: ready for visual acceptance of the M5 profile and interfaces.
