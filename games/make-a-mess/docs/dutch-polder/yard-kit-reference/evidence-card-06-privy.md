# Evidence card 06 — ditch privy (`huisje`)

## Identity and source hierarchy

- Object: a one-person timber privy projecting from the bank over a ditch; it is not a generic garden shed and not a bucket-toilet cabinet.
- `North-Holland documentary record`: Boerderijenstichting Noord-Holland describes the historic type as a black-tarred cabinet at the back of a farmyard, on posts above the ditch edge.
- `museum reconstruction and collection description`: Boomkwekerijmuseum explicitly identifies the outside toilet above the ditch beside its reconstructed 1870 nursery dwelling. The Zuiderzeemuseum Jisp record separately confirms the rear-yard arrangement, while warning that its current privy placement is reconstructed rather than original evidence.
- `published first-person record`: a North-Holland local-history account describes a wooden cabin of roughly one square metre on posts above the water, reached from the bank, with a transverse seat board about `0.50 m` above the floor.
- `regional typology description`: the Alblasserwaard study records small square timber enclosures, a lockable door with a small eye-level light opening, a mono-pitch roof and, in wet regions, direct siting above a ditch.
- `authored passport`: the yard-kit brief owns every exact dimension, the two cantilever beams, Zaan-green cladding, light trim, heart cutout and open water-side rear.
- Current code and generated imagery do not own any hidden joint or dimension.

Sources:

- https://www.boerderijenstichting.nl/media/7294/nieuwsbrief-100.pdf
- https://boomkwekerijmuseum.nl/vaste-collectie/
- https://www.zuiderzeecollectie.nl/object/collect/Zuiderzee_museum-76217
- https://www.lijnendoordetijd.nl/wp-content/uploads/2022/06/kroniek2019.pdf
- https://geschiedenisalblasserwaard.wordpress.com/2021/05/13/de-buitenplee/
- `pasted-text.txt`, object passport 6.

## Local frame and envelopes

- Units: metres, 1:1. `+Y` up, `+Z` is the landward door/front side; water and the open rear are toward `-Z`.
- Ground/bank-top datum: `y = 0`. The two cantilever beams have their lower faces on this datum so the standalone object has an honest carrier.
- Cabin outer wall plan: exactly `1.05 × 1.25 m`, bounded by `x = ±0.525` and `z = ±0.625`.
- Front cornice/eave: exactly `y = 2.00 m`. Authored rear eave: `y = 1.78 m`, making the roof fall toward the water at `atan(0.22 / 1.25) = 9.98°`.
- Each cantilever beam is exactly `0.12 × 0.16 m`. Its water-side end is `z = -0.625`; the bank-edge anchor is `z = +0.475`, so the projection beyond the bank is exactly `1.10 m`. The beam continues to `z = +0.750` for a short landward bearing tail.
- Door leaf: exactly `0.62 × 1.75 m`, from `y = 0.20` to `1.95 m`. Its heart cutout has an exact `0.12 × 0.12 m` bounding box centred at `y = 1.45 m`.
- Authored roof skin: `1.25 m` wide with `0.10 m` side overhangs, and a `1.41 m` horizontal depth with `0.08 m` front/rear overhangs.

## Named construction

- Two longitudinal timber cantilever beams, `0.12 m` wide and `0.16 m` deep, aligned beneath the side frames.
- Four `0.08 × 0.08 m` corner posts bear directly on the beams; their unequal front/rear tops establish the roof fall.
- A three-piece boarded floor leaves a real central water-side drop opening. Nothing opaque closes that opening below the seat.
- Both side walls use five vertical green boards with individually sloped heads. The door-side wall is assembled only from two piers and a short head panel around the door opening.
- The entire rear wall remains absent above the floor/seat line. The corner posts and side-board returns remain visible from the water-side camera.
- The closed green door is one watertight extruded leaf with a genuine heart-shaped hole; the opening is absent geometry, not a dark decal on a solid slab.
- Three light-painted trim boards frame the door. Two strap hinges, pins and a latch visibly bridge leaf to jamb.
- The internal seat is a transverse board `0.50 m` above the floor, split around a direct-drop opening and carried by a front apron. Its form is authored from the functional descriptions; the passport does not prescribe the seat aperture shape.
- One dark mono-pitch roof skin spans both side frames and projects beyond the cladding.

## Load and attachment paths

- Cabin: bank-top datum → two cantilever beams → four corner posts and floor → side/front wall frame → roof skin.
- Landward anchorage is represented by the `0.275 m` beam tails beyond the bank-edge anchor; final embedment belongs to the later site adapter and is deliberately not invented here.
- Door: left jamb → two hinge pins → two overlapping straps → door leaf. The right latch crosses leaf and jamb.
- Seat: floor/side structure → front apron and side ledges → three seat-board pieces. The opening remains vertically clear to the open water-side rear.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty, yard shed, hekje and turfhok geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain, routes, parcels, reserves or placement.
- Do not register a prefab or author a scene adapter before visual acceptance.
- Do not modify the existing bridge, field or yard-boundary object families.

## Rejection conditions

- Cabin plan differs from `1.05 × 1.25 m`, front eave differs from `2.00 m`, or roof falls toward land.
- Either cantilever beam differs from `0.12 × 0.16 m`, misses `y = 0`, or projects a distance other than `1.10 m` beyond the bank-edge anchor.
- Door leaf differs from `0.62 × 1.75 m`; the heart bounds differ from `0.12 m`, its centre differs from `y = 1.45 m`, or any door/wall geometry closes the heart opening.
- Front cladding continues behind the leaf instead of leaving a real door opening.
- Any rear wall closes the water side, or the floor/seat becomes an opaque box with no direct-drop opening.
- Posts, hinges, latch, seat or roof terminate in air instead of sharing physical overlap with their carriers.
- The object exceeds 45 parts or reads as a generic shed rather than an over-ditch privy.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Exact `1.05 × 1.25 m` cabin plan | side/front cladding outer faces | recover union bounds | `privy-front`, `privy-profile` |
| `2.00 m` front eave and rearward roof fall | post tops + roof rotation | recover eave endpoints, slope sign and angle | profile / three-quarter |
| Two `0.12 × 0.16 m` beams and `1.10 m` projection | beam sizes + bank anchor | recover sections and rear-end-to-anchor distance | profile / rear-water |
| Real `0.62 × 1.75 m` door opening | facade piers/head + leaf bounds | recover empty opening before leaf; recover leaf bounds | front / door detail |
| Real `0.12 m` heart at `y = 1.45 m` | door mesh inner loop | recover inner-loop bounds; probe absence at centre | door detail |
| Entire rear wall open | group inventory and rear plane | assert no vertical closure across rear plane | rear-water |
| Functional seat and clear drop | floor/seat intervals | recover seat height and positive open vertical path | rear-water / high three-quarter |
| Honest support and attachments | beam/post/hinge intervals | carrier contact and overlap checks | three-quarter / rear-water |
