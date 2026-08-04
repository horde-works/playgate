# Evidence card 09 — bean frame (`bonenrek` / `bonenstaken`)

## Identity and source hierarchy

- Object: a short domestic double-row A-frame for climbing beans, made from ten slender natural poles, five top bindings and one longitudinal ridge pole over a raised soil bed. It is not a trellis panel, wire crop system, pergola, wigwam or decorative garden arch.
- `technical, Wageningen agricultural bulletin, 1957`: Dutch pole-bean support used ash, willow or pine poles, normally `2–3 m` long. Long poles were crossed or grouped; a documented intermediate form set two rows of poles obliquely and tied them above the midpoint to one horizontal pole. This source owns the load-bearing topology and historical Dutch construction family, not this object's species or exact dimensions.
- `documentary, Collectie Gelderland / Elisabeth Weeshuis Museum`: a 1939 Geldermalsen farmyard photograph explicitly identifies `bonenstaken` behind the wash area. It owns period working-yard context and the repeated slender-pole reading, not measurable geometry.
- `collection image, Kunstcollectie Provincie Gelderland`: `bonenstaken (1)` records repeated crossed pole pairs planted directly in garden soil. It corroborates the open, irregular natural-pole silhouette; as an artwork rather than a measured record it does not own dimensions.
- `institutional horticultural guidance, Royal Horticultural Society`: the traditional support is a double row of bamboo canes or hazel poles sloped inward, with each pair tied near the top to a horizontal cane to make a stable A-frame. It owns the hazel option and explicit pair/ridge attachment logic, not Dutch regional history or this passport's numbers.
- `authored passport`: the yard-kit brief owns exactly ten hazel poles at `2.40 m × Ø0.030 m`, two rows at `0.55 m` longitudinal pitch and `0.70 m` transverse spacing, pair ties at `y = 2.10 m`, one `Ø0.035 m` top horizontal pole, `timber-mid`, and a `0.20 m`-high soil bed.
- `derived completion`: symmetric five-station layout, exact pole endpoints above the tie, ridge overhang, soil-bed plan and opaque binding-cord section are derived only to close the specified construction.
- Current code, generated imagery, retail products and planting diagrams do not own geometry.

Sources:

- https://edepot.wur.nl/273638 — `De teelt van snijbonen`, Wageningen, Mededeling no. 7, 1957, pp. 19–20 (PDF pages 14–15).
- https://www.collectiegelderland.nl/museumculemborg/object/9b4d02cc-ced4-c177-3038-bef0e110fca6 — `Foto, voorstellende wasdag, Geldermalsen, 1939`.
- https://www.collectiegelderland.nl/provinciegelderland/object/b6aea8c8-061a-cb39-568b-613593a7c7ca — `bonenstaken (1)`.
- https://www.rhs.org.uk/vegetables/runner-beans/grow-your-own — `How to grow runner beans`, section `Putting up supports`.
- `pasted-text.txt`, object passport 9.

## Local frame and derived geometry

- Units: metres at 1:1. `+Y` up. Five stations run along X; the two planted rows run at `z = ±0.35 m`. `+Z` is the front.
- Exact station centres: `x = -1.10, -0.55, 0, 0.55, 1.10 m`; every adjacent pitch is exactly `0.55 m`.
- Exact row spacing: the paired base-axis endpoints are at `z = ±0.35 m`, hence `0.70 m` apart.
- Exact tie line: all five pole pairs pass through `(x, 2.10, 0)` and are bound there. This is simultaneously the ridge-pole axis.
- Exact pole length: each centreline begins at its row point `(x, 0, ±0.35)` and follows the line through the tie point until its centreline length is exactly `2.40 m`. The base-to-tie distance is `sqrt(2.10² + 0.35²) ≈ 2.129 m`; the remaining `≈0.271 m` continues beyond the tie. The derived tip reaches about `y = 2.367 m` and crosses the centre plane slightly, so the tie is visibly below the tips rather than being an unexplained butt joint.
- Pole section: exact `Ø0.030 m`, represented by a ten-sided cylinder. Natural hazel irregularity belongs to texture/material variation later; bending the exact engineering centreline would destroy the measurable passport.
- Ridge pole: one exact `Ø0.035 m` cylinder on the tie axis at `y = 2.10 m`, `z = 0`. Authored endpoints `x = ±1.25 m` provide `0.15 m` overhang beyond the outer pairs and keep every tie away from an unsupported end.
- Soil bed: one filled opaque `soil-bed` box, authored `2.60 × 0.20 × 1.10 m`, centred at `y = 0.10 m`. All ten pole axes start inside its plan. The pole cylinders intentionally pass through the filled bed; the support is planted, not balanced on its surface.
- Bindings: five closed opaque cord loops in one mesh, centred at the five tie stations in planes normal to X. Each loop has authored major radius `0.022 m` and tube radius `0.006 m`; its inner radius is smaller than the ridge radius, creating positive intersection rather than floating rings.

## Named construction and part budget

- Ten independent `timber-mid` hazel-pole cylinders: one front-row and one rear-row pole at each station.
- One `timber-mid` horizontal ridge-pole cylinder.
- One closed mesh containing five separate `timber-dark` cord loops. The loops remain distinct connected components inside one render part; part batching does not turn them into a fictitious continuous strap.
- One filled `soil-bed` box.
- Planned part count: `13 / 14`. Plants, beans, labels, scenery and transparent guides are excluded.

## Load and attachment paths

- Ground/bed → two planted pole feet at each station → paired inclined poles → positive pole/pole intersection at `y = 2.10 m`.
- The horizontal ridge passes through all five pair intersections, tying the stations into one longitudinal frame.
- Every cord loop encloses and intersects the ridge/pair joint. No loop is suspended beside the timber and no ridge rests unsupported above the crossings.
- The `0.271 m` pole tails above each tie show the binding topology and prevent the visual falsehood of poles terminating exactly at the cord.

## Informational-transparency contract

- The soil bed is complete filled geometry. The portions of poles inside it remain canonical and are merely occluded in ordinary views.
- Poles, ridge, bed and bindings are fully opaque. No alpha, transmission, clipping, cutaway material or missing surface is stored in code.
- A future diagnostic view may hide or fade the bed only as a view-local override paired with an opaque view of the identical parts, revision and hash. No transparent diagnostic capture is required for acceptance.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty, yard shed, hekje, turfhok, ditch privy, hand pump and drying line geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain, routes, parcels, reserves, placement or prefab definitions.
- Do not register or adapt `dutch:landscape:bean-frame` before visual acceptance.
- Do not modify existing bridge, lighting, field or boundary families.

## Rejection conditions

- There are not exactly ten primary poles, any pole centreline is not `2.40 m`, any diameter differs from `0.030 m`, or primary material is not `timber-mid`.
- There are not exactly five X stations, adjacent pitch differs from `0.55 m`, a station lacks a pair, or the two base rows differ from `0.70 m` spacing.
- Either pole of a pair fails to pass through the exact tie `(x, 2.10, 0)`, terminates at/below the tie, or does not slope inward from its row.
- The ridge is absent, differs from `Ø0.035 m`, does not span all five stations, floats away from a crossing, or lacks end overhang.
- There are not exactly five closed binding components, a binding floats clear of the joint, or bindings are transparent/informational marks.
- The filled bed is absent, not `0.20 m` high, starts above/below `y = 0`, or a pole foot lies outside its plan.
- Object exceeds `14` parts, depends on foliage to explain its structure, or reads as bamboo lattice, metal trellis, wigwam or pergola.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Ten exact `2.40 m × Ø0.030 m` poles | cylinder endpoints/radii | recover count, centreline lengths, radii and material | front, profile, three-quarter |
| Five stations at `0.55 m` | pole base X values | cluster X coordinates and compare four adjacent differences | front orthographic |
| Two rows at `0.70 m` | pole base Z values | recover two signed Z clusters and separation | profile orthographic |
| Five exact ties at `y = 2.10 m` | derived pole lines | intersect each segment with the tie plane and require `(x, 2.10, 0)`; require tips above it | profile, tie detail |
| Attached `Ø0.035 m` ridge | ridge cylinder | recover diameter/axis/span and distance to every pair crossing | front, high |
| Five real opaque bindings | binding mesh topology | recover five connected components/X clusters; reject transparency; test joint overlap | tie detail, high |
| Filled `0.20 m` soil bed | bed box | recover Y bounds and test all pole feet inside plan | profile, high |
| Budget and protected scope | filtered group inventory | require `13 ≤ 14`, total `≤ 600`, accepted counts unchanged | all captures |
