# Discrepancy review 06 — ditch privy (`huisje`) — A11

## Compared material

- Canonical revision: `landscape-kit-a11-2026-08-04`.
- Fixed captures: `privy-front`, `privy-profile`, `privy-three-quarter`, `privy-rear-water`, `privy-door-detail`.
- Contract: `evidence-card-06-privy.md` and yard-kit passport 6.

## First capture findings

1. `door false triangular face` — fail. A single perforated mesh shared smoothed normals between the broad door face and the heart reveal. The opening was mathematically present, but the render produced a large false triangular highlight that changed the apparent door construction.
2. `detached ironwork` — fail in the pre-capture invariant run. Hinge straps and latch sat `0.013 m` in front of the door leaf instead of intersecting it.
3. `roof penetration` — fail. Both sloping side plates projected through the roof skin and appeared as raised ribs on the water-side roof view.
4. `rear closure` — pass. The water-side wall is absent and the transverse seat/drop remain visible.
5. `cantilever carrier` — pass. Both posts on each side bear on the corresponding `0.12 × 0.16 m` longitudinal beam.

## Corrections

- Rebuilt the door as four flat solid regions plus five hard-edged triangular infill prisms around the heart. The result remains one exact `0.62 × 1.75 m` leaf envelope and leaves an actual `0.12 × 0.12 m` heart void centred at `y = 1.45 m`.
- Moved pins, straps and latch into the door/front-trim depth interval; attachment tests now require positive overlap.
- Lowered all upper plates `0.04 m` below the eave line. Their top fibres still intersect the underside of the roof, while no timber crosses its upper face.
- Recaptured all five views from the corrected canonical model so their stamped hash is identical: `54c4b0694d3d`.

## Final autonomous review

- Front: exact green leaf, light frame, three iron straps/latch elements and small heart void are legible without false faces.
- Profile: roof falls toward `-Z`; the two grounded cantilever beams remain the lowest and longest carriers.
- Three-quarter: door/frame/cladding layers remain separate and all four corner posts terminate in the roof assembly.
- Rear-water: no rear wall, no opaque waste box, no closed floor beneath the seat; the direct drop and both beam lines remain visible.
- Door detail: heart is a dark through-opening with visible reveal, not a decal.
- Part count: `45 / 45`; no budget exception.
- Automated result: `17 / 17` landscape-kit tests pass; lint passes.

## Deliberate non-actions

- No bank, ditch or water plane was added to the object. The exact bank edge is an anchor for the later site adapter, not decorative geometry in the canonical asset.
- No prefab, world adapter or placement was created before visual acceptance.
