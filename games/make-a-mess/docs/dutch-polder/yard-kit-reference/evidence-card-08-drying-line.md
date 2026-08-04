# Evidence card 08 — yard drying line (`drooglijn`)

## Identity and source hierarchy

- Object: a fixed two-post wooden farmyard clothesline with two parallel cord lines and one removable leaning forked prop; it is not a rotary dryer, metal suburban T-post set, bleaching rack or decorative pergola.
- `documentary, Nederlands Openluchtmuseum`: the 1944 Staphorst photograph records a rough squared timber `waslijnpaal`, simple wooden tensioning `klos`, and a line physically wrapped and carried by the post. Its photographed line is metal wire, so it owns the post/attachment family but not this passport's cord material or dimensions.
- `documentary, Nederlands Openluchtmuseum`: the 1936 Brakel and 1937 Loenen farm photographs place long outdoor clotheslines beside working farmyards, kitchen gardens and bleaching ground. They own context and long-span use, not exact framing.
- `documentary, Nederlands Openluchtmuseum`: the 1942 Urk close view records a visibly twisted laundry line used directly as a cloth carrier. It supports an opaque cord/twine reading; it does not own the two-line layout.
- `institutional laundry history, Chertsey Museum`: a long line under wet laundry was commonly supported by a Y-shaped prop to stop it sagging toward the ground. This source owns the forked-prop function only; it is not Dutch regional evidence.
- `authored passport`: the yard-kit brief owns the exact post section/height, span, crossbar length, line count/diameter/sag and prop length.
- `authored completion`: axis choice, crossbar section, line spacing, rope curve, prop lean and fork dimensions complete a mechanically coherent object where the passport is silent.
- Current code, generated imagery and modern rotary/metal products do not own geometry.

Sources:

- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/2269cab9-b3a5-58b6-a473-da4026f71573 — `Waslijnpaal met klos, Staphorst, 1944`.
- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/d80db135-e8b0-53a4-845b-4ab38559d1a5 — `T-boerderij, Brakel, 1936`.
- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/a7237e3c-ec26-52f7-81c2-86428724ebef — `Boerderij, Loenen, 1937`.
- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/e971caac-dce9-52ee-b7c9-442164a1a3d9 — `Waslijn, Urk, 1942`.
- https://chertseymuseum.org/domains/chertseymuseum.org.uk/local/media/images/medium/All_about.....the_Victorians.pdf — laundry-line prop description.
- `pasted-text.txt`, object passport 8.

## Local frame and envelopes

- Units: metres at 1:1. `+Y` up. The exact `7.00 m` line span runs along X; `+Z` is the front and separates the two parallel lines.
- Ground datum: `y = 0`. Both `0.09 × 0.09 m` square post feet and the prop foot reach it. Later placement may visually embed the posts; the standalone object does not add fake soil or underground geometry.
- Posts: centres at `x = ±3.50 m`, visible height exactly `2.00 m`, section exactly `0.09 × 0.09 m`.
- Crossbars: one at each post, exact length `0.55 m` along Z. Authored section `0.07 × 0.07 m`; their centres sit at `y = 1.95 m`, overlapping the upper `0.09 m` of each post while staying below the exact post top.
- Lines: two opaque `timber-mid` cord tubes, exact diameter `0.012 m`, at `z = ±0.20 m`. Their centreline endpoints are `(-3.50, 1.96, z)` and `(3.50, 1.96, z)`, inside the crossbar volume.
- Sag: one symmetric derived parabola per line, `y(x) = 1.96 - 0.12 × (1 - (x / 3.50)^2)`. The exact midpoint centreline is therefore `y = 1.84 m`, giving the passport's `0.12 m` sag arrow without turning the line into straight chords.
- Prop: one removable timber pole with a main-shaft centreline length exactly `2.30 m`. Its fork crotch is authored at `(0, 1.75, 0)`. The foot-cap centre is derived with its cross-section offset so the cylinder's lowest physical fibre, rather than its axis, reaches exactly `y = 0`; the resulting X run is about `1.50 m`, so the pole visibly leans within the span instead of becoming a third post.
- Fork: two authored prongs begin inside the main shaft near its top and end at the exact line midpoints `(0, 1.84, ±0.20)`. Each rope tube and fork tip overlap positively.

## Named construction

- Two grounded square timber posts, one part each.
- Two transverse timber crossbars, one part each, physically intersecting their posts.
- Two independent opaque cord meshes. Each is one capped six-sided tube following a twelve-segment parabolic centreline; the curve is geometry, not a transparent guide or painted line.
- One leaning cylindrical timber prop shaft of exact `2.30 m` centreline length.
- Two cylindrical fork prongs joined to the prop and ending under the two line midpoints.
- Planned part count: `9 / 12`; no garments, pegs, scenery or fake ground consume object budget.

## Load and attachment paths

- End support: ground → left/right post → overlapping crossbar → rope endpoint embedded inside the crossbar.
- Midspan support: ground → leaning prop shaft → two positively overlapping fork prongs → rope midpoint tubes.
- Each line remains one continuous mesh from left crossbar through its supported midpoint to the right crossbar.
- The prop is removable but not unsupported: its foot is the third ground contact and its fork tips engage both lines.

## Informational-transparency contract

- Canonical posts, crossbars, ropes and prop are complete opaque geometry.
- No alpha, transmission, clipping or hidden-part override is stored in the object, materials or future adapter.
- If a diagnostic attachment view is ever useful, it must be a view-only override paired with an opaque view using the same parts, revision and hash. No transparent diagnostic view is required for this simple open construction.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty, yard shed, hekje, turfhok, ditch privy and hand pump geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain, routes, parcels, reserves, placement or prefab definitions.
- Do not register or adapt `dutch:landscape:drying-line` before visual acceptance.
- Do not modify existing bridge, field or boundary families.

## Rejection conditions

- Post section differs from `0.09 × 0.09 m`, visible height differs from `2.00 m`, either post misses `y = 0`, or centre spacing differs from `7.00 m`.
- Either crossbar differs from `0.55 m`, floats above/beside its post, or fails to carry both line endpoints.
- There are not exactly two continuous line meshes, diameter differs from `0.012 m`, endpoints do not span `7.00 m`, or midpoint sag differs from `0.12 m`.
- A line is represented by one straight beam, a transparent guide or disconnected chord pieces.
- Main prop length differs from `2.30 m`, prop foot misses ground, fork is absent, either prong floats, or either line misses its fork tip.
- Object exceeds `12` parts, reads as a modern metal rotary/T-post system, or requires garments/scenery to explain its function.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Two exact grounded posts | post boxes | recover section, min/max Y and centre spacing | `drying-line-front`, three-quarter |
| Attached `0.55 m` crossbars | crossbar boxes | recover Z length and positive post overlap | end detail / three-quarter |
| Two opaque Ø`0.012 m` continuous lines | line meshes | recover topology, tube radius and end stations; reject transparency overrides | front / high |
| Exact `0.12 m` parabolic sag | line centre rings | compare endpoint and midpoint ring centres; verify non-collinear intermediate rings | front orthographic |
| Exact grounded `2.30 m` leaning prop | prop endpoints | recover centreline length, foot Y and nonzero lean | front / profile |
| Fork carries both lines | fork and rope intervals | shared/support-point overlap at both Z stations and prong-to-shaft overlap | prop detail / high |
| Budget and protected scope | filtered group inventory | `≤ 12`, total `≤ 600`, accepted counts unchanged | all captures |
