# Discrepancy pass 05 — small peat store, revision a8

## Fixed-camera review

- `peat-store-front`: open front, unequal eaves, dark frame and rear ventilation slats read correctly.
- `peat-store-profile`: roof direction and the independent four-post load path read correctly.
- `peat-store-three-quarter`: the lower fuel bulk read correctly as the budget-preserving mass, but exposed that the visible bricks engaged it by only about `5 mm` in depth.
- `peat-store-stack-detail`: the `±12°` plan alternation was numerically present but visually too weak; it read as displaced brickwork rather than a deliberate ventilated chevron lattice.

## Correction owned by revision a9

- Move the visible courses back over the grounded bulk so each first-course brick has more than `0.10 m` of real support depth.
- Increase the authored plan alternation to `±24°`, then recompute centre pitch from the rotated AABB so the clear X gap remains exactly `0.04 m`.
- Raise the stack-detail camera so the plan weave, physical overlap and open gaps are visible in one frame.
- Add an independent minimum support-depth assertion.

No accepted yard-kit object or world-placement file is changed by this pass.
