# Evidence card 10 — Zaan yard picket fence and gate (`hekje`)

## Identity and source hierarchy

- Object: low painted garden boundary for a Zaan house lane; it is not the existing driven-post field fence.
- `published`: the official Zaanse Schans record for Zeilenmakerspad 3 identifies green fences along the ditch as the boundary of the path-side bleaching fields.
- `documentary photograph`: the official Zeilenmakerspad 1 exterior photograph shows the low fence family in the house-and-ditch ensemble and establishes its domestic scale and open vertical rhythm.
- `authored passport`: the yard-kit brief owns every exact dimension, pitch, colour assignment and the inclusion of a gate.
- Current code and generic image generation do not own hidden construction or dimensions.

Sources:

- https://www.zaanseschans.com/en/zeilenmakerspad-3/
- https://www.zaanseschans.com/en/zeilenmakerspad-1/
- `pasted-text.txt`, object passport 10.

## Local frame and complete envelope

- Units: metres, 1:1.
- `+Y` up; fence runs along `+X`; thin direction is `Z`; front is `+Z`.
- Ground datum: `y = 0`; both module posts and the gate latch post begin at this plane.
- Fence module: exactly `3.00 m` between its outer post faces, placed from `x = -2.00` to `x = +1.00` in the combined laboratory assembly.
- Gate leaf: `0.95 × 0.90 m`, immediately to the right of the module; the right module post owns the hinge.
- Structural module boundaries: `x = -2.00 … +1.00`; the separate `0.11 m` finials deliberately overhang those post faces.
- Complete visible assembly envelope, including finial overhang and latch handle: `x = -2.010 … +2.055`, `y = 0 … 1.11`, `z = -0.055 … +0.094`.

## Named construction

- Module posts: `0.09 × 0.09 × 1.00 m`, green painted wood, with separate white square pyramidal finials, base `0.11 m`, height `0.11 m`.
- Rails: two green members, section `0.07 × 0.035 m`, centre heights `0.18` and `0.68 m`; they terminate on the inner post faces.
- Pickets: twenty closed pointed boards in the 3 m bay; each body is `0.075 × 0.020 × 0.80 m`, exact centre pitch `0.140 m`, therefore exact clear gap `0.065 m`.
- Gate: white rectangular frame, six green pointed infill pickets, one compression brace from lower hinge corner to upper latch corner.
- Hardware: two forged straps reach two hinge pins on the shared post; a separate latch bar reaches a catch fixed to the latch post.
- Material boundary: pickets, rails and posts `cladding`; post finials and gate frame `paint-light`; hinges and latch `metal`.

## Load and attachment path

- Module: ground → two posts → two rails → twenty pickets.
- Gate: ground → shared hinge post → hinge pins/straps → gate frame → infill and diagonal; latch post carries only the catch when closed.
- Pickets do not touch ground; each intersects both rails.
- The gate leaf has ground clearance and is not treated as a support.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty and yard-shed geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain, routes, parcels, reserves or placement.
- Do not register a prefab or author a scene adapter before visual acceptance.
- Do not alter the existing field-fence groups; `hekje` is a distinct domestic object family.

## Rejection conditions

- Module outer width differs from `3.00 m`.
- Picket width differs from `0.075 m`, centre pitch from `0.140 m`, or clear gap from `0.065 m`.
- The row becomes a solid wall or the pointed boards intersect each other.
- Any of the three posts does not reach `y = 0`.
- Rails or gate hardware terminate in air instead of reaching their posts/frame.
- Gate is not `0.95 × 0.90 m`, has no diagonal, or has no physical hinge/latch chain.
- Domestic green/white material boundary is lost or the object reads as the existing field fence.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Exact tiling module | `DUTCH_PICKET_FENCE_MODULE_LENGTH` | recover outer faces of module posts | `picket-fence-front` |
| 20 boards at 0.14 pitch and 0.065 gap | picket centre sequence | recover mesh bounds and adjacent centres | front / high |
| Low open domestic silhouette | post, rail and picket heights | recover complete envelope and negative gaps | front / three-quarter |
| Gate 0.95 × 0.90 with compression brace | hinge/latch axes and frame endpoints | recover leaf bounds; check brace endpoints | front / gate detail |
| Physical hinge and latch chains | pins, straps, bar, catch | proximity/overlap checks | `picket-fence-gate-detail` |
| Honest ground contact | three post bottoms | minimum carrier bottom exactly `0` | front / three-quarter |
