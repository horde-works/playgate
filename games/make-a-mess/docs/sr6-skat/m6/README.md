# SR-6 Skat — M6 separate raised tail spine

M6 corrects the conceptual error retained by M5: the cockpit survival cell no
longer continues as a full-depth body to the tail. All renders in this folder
come from one code-native model with hash `47c217c2816c`.

## Three separate central volumes

1. The survival cell runs from the nose to the rear bulkhead immediately behind
   the pilot at Z -0.55 m.
2. The battery keel is a separate 2.13 m central pod below the cell. It reaches
   neither nose nor tail.
3. A separate raised tail spine begins at Z -0.40 m and tapers to Z -2.02 m.

The spine is intentionally thin. Its lower surface rises from Y 1.05 m to
Y 1.10 m before returning to Y 1.05 m at the tail. Its upper surface descends
from Y 1.78 m to Y 1.14 m, while half-width contracts from 0.42 m to 0.06 m.
Consequently the spine narrows in side profile and plan at the same time.

## Open rear structural bay

The volume below the spine is not bodywork. It contains:

- an upper tapered moment shelf from the cockpit bulkhead to each rear duct;
- lower tubular longerons;
- opposing bay diagonals;
- the existing rear duct hard-points and moment boxes.

This leaves a visible open triangular bay between the white spine and the lower
motor contour, matching the load-path logic of the selected reference.

## Acceptance views

- `right.png` matches the side-reference orientation: cockpit/nose left, tail
  spine right;
- `left.png` is the opposite orthographic control;
- `three-quarter-right.png` proves that the spine is a narrow raised volume, not
  a flat side-profile trick;
- `top.png` controls the taper in plan;
- `structural-cutaway.png` exposes the rear shelf, longerons and diagonals.

## Ownership and status

- Canonical model:
  `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`
- Deterministic capture:
  `scripts/capture-sr6-skat-object-lab.mjs`
- Render identity and twelve-view list: `manifest.json`

World placement and flight physics remain untouched. Status: ready for visual
acceptance of the corrected central-body topology.
