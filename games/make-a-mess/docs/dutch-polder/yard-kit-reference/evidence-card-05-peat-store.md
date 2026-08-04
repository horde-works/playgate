# Evidence card 05 — small peat store (`turfhok`)

## Identity and source hierarchy

- Object: a small domestic lean-to that keeps the winter peat stack dry while air can pass around it; it is not a closed garden shed or a decorative pile.
- `documentary photographs`: the 1975 RCE front/rear records of the timber peat stores at Kolhorn establish the North-Holland family of dark timber storage buildings, legible roof protection and deliberately utilitarian wall treatment.
- `published functional description`: the `Turfschuur` record states that the walls consisted of slats with openings so wind could pass freely and keep the store ventilated.
- `authored passport`: the yard-kit brief owns the small `2.60 × 1.20 m` lean-to format, post heights, peat-brick dimensions, `0.04 m` airflow gap and stack envelope.
- Current code and generated imagery do not own any hidden joint or dimension.

Sources:

- https://commons.wikimedia.org/wiki/File:Turfschuur_nr._1,_voorgevel_-_Kolhorn_-_20126407_-_RCE.jpg
- https://commons.wikimedia.org/wiki/File:Turfschuur_nr._1,_achtergevel_-_Kolhorn_-_20126408_-_RCE.jpg
- https://www.agriwiki.nl/index.php?title=Turfschuur
- `pasted-text.txt`, object passport 5.

## Local frame and envelopes

- Units: metres, 1:1. `+Y` up, `+Z` is the open/front side, length runs along `X`.
- Ground datum: `y = 0`.
- Structural post footprint: exactly `2.60 × 1.20 m` between outer post faces.
- Front post height: `2.15 m`; rear post height: `1.75 m`; the roof therefore falls toward `-Z`.
- Derived rafter pitch between post centrelines: `atan(0.40 / 1.10) = 19.98°`.
- Authored roof skin: `2.80 m` long, `1.45 m` slope depth, `0.055 m` thick; it overhangs the post footprint and brings the complete height to approximately `2.274 m`.
- Peat stack: exactly `2.20 m` long and `1.60 m` high; authored depth `0.62 m` for a believable domestic reserve within the `1.20 m` shelter.

## Named construction

- Four tarred timber posts, `0.10 × 0.10 m`, at the footprint corners.
- Two longitudinal wall plates, section `0.10 × 0.12 m`, joining the front and rear post pairs.
- Three rafters, section `0.08 × 0.10 m`, running down the slope; two short side knee braces prevent a visually unbraced canopy.
- One dark, nonbearing roof skin. Tarred boarding is an `authored` small-object adaptation; the RCE photographs show the wider material family, not this exact roof.
- Six rear slats with real open air gaps. The front remains wholly open so the stack is usable and its construction is visible.
- The lower bulk of peat is one solid mass to preserve the object budget. The top three visible courses contain eighteen real `0.30 × 0.14 × 0.10 m` bricks.
- Visible bricks alternate `±24°` in plan. Their independently derived centre pitch preserves a `0.04 m` clear X gap after rotation, producing a legible ventilated chevron lattice without floating pieces.

## Load and attachment paths

- Shelter: ground → four posts → two plates → three rafters → roof skin.
- Lateral restraint: each knee brace intersects one front post and its side rafter.
- Ventilation slats terminate inside both rear posts; they do not carry the roof.
- Fuel: ground → solid lower peat mass → first visible course → second course → third course. Every visible brick touches the material below and slightly engages the backing mass in depth.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty, yard shed and hekje geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain, routes, parcels, reserves or placement.
- Do not register a prefab or author a scene adapter before visual acceptance.
- Do not modify the existing bridge, field or yard-boundary object families.

## Rejection conditions

- Post footprint differs from `2.60 × 1.20 m`, or any post misses `y = 0`.
- Front/rear post heights differ from `2.15 / 1.75 m`, or the roof falls toward the open front.
- Roof, plates or rafters terminate in air instead of sharing physical overlap.
- Front is closed, or the rear becomes an unventilated solid panel.
- Stack differs from `2.20 × 1.60 m`.
- Visible peat bricks differ from `0.30 × 0.14 × 0.10 m`, lose the `0.04 m` airflow gap, float, or become a decorative façade detached from the bulk.
- The object exceeds 60 parts or reads as a generic house/shed instead of fuel storage.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Exact footprint and unequal post heights | post centres/sizes | recover all four outer faces and tops | `peat-store-front`, `peat-store-profile` |
| Roof falls rearward and contacts frame | rafter endpoints + roof rotation | recover slope sign, angle and depth overlap | profile / three-quarter |
| Open front, ventilated rear | slat intervals and group inventory | recover positive gaps; assert no front wall | front / rear three-quarter |
| Stack `2.20 × 1.60 m` | bulk and three top courses | recover union bounds | front / stack detail |
| Brick size and `0.04 m` air gap | rotated brick schedule | recover rotated X extents and adjacent gaps | stack detail / high three-quarter |
| Honest support | post and bulk bottoms; course intervals | minimum carrier bottom and vertical contact checks | front / three-quarter |
