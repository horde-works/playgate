# Evidence card 11 — rain barrel (`regenton`)

## Identity and source hierarchy

- Object: a wall-side wooden rain barrel on two brick supports, supplied from a square wooden downspout; explicitly not a modern plastic tank, masonry cistern, closed shipping cask or freestanding decorative barrel.
- `documentary, Nederlands Openluchtmuseum`: the 1936 Kethel farmyard photograph explicitly identifies the large wall-side vessel as a `regenton`. It records a broad wooden barrel body immediately below a vertical wall drain and owns the working-yard relationship, not exact dimensions.
- `documentary, Nederlands Openluchtmuseum`: the 1940 Schiebroek farmyard photograph shows a visibly staved wooden barrel with repeated iron hoops directly beneath a downpipe at a shed wall. It owns the stave/hoop/downspout construction family and wall-side silhouette, not exact counts or scale.
- `documentary, Nederlands Openluchtmuseum`: the 1937 Zonnemaire bakery photograph records a rain collector directly beside the building and below the eave discharge. Its vessel is masonry, so it owns placement/function only and is explicitly rejected as the barrel material reference.
- `documentary, Nederlands Openluchtmuseum`: the 1935 Winterswijk photograph records a real farm downpipe terminating above a water receiver. It supports the open discharge relationship but not the passport's square wooden section.
- `authored passport`: the yard-kit brief owns the exact oak barrel maximum diameter `0.62 m`, stave height `0.88 m`, twelve staves, three forged hoops, `0.10 × 0.10 m` wooden downspout, exact `0.15 m` outlet clearance above the barrel and two-brick support.
- `derived completion`: the barrel end diameter, belly curve, wall thickness, bottom head, hoop stations, brick dimensions, downspout length and wall brackets are authored to close the construction without changing the passport envelope.
- Current code, generated imagery and modern retail rain barrels do not own geometry.

Sources:

- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/865e3619-5ee0-52b4-9928-267556acb13f — `Binnenplaats van een boerderij, Kethel, 1936`.
- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/d0ff183a-49c9-5758-89dc-1b722a0bbb14 — `Erf met karnmolen, Schiebroek, 1940`.
- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/9cbcc96d-50d3-50a4-983d-6d529adbbdfa — `Bakhuis van boerderij Kreekzicht, Zonnemaire, 1937`.
- https://www.collectiegelderland.nl/nederlandsopenluchtmuseum/object/dbf32ea0-7eb8-5321-86c8-231516131423 — `Putdeksel en regenpijp, Winterswijk, 1935`.
- `pasted-text.txt`, object passport 11.

## Local frame and envelopes

- Units: metres at 1:1. `+Y` up, `+Z` front. The future building wall is behind the barrel at negative Z; no wall or map surface is added to this standalone object.
- Ground datum: `y = 0`. Two real brick boxes begin at ground and end at `y = 0.07 m`.
- Authored brick size: `0.22 × 0.07 × 0.11 m`, centres at `x = ±0.18 m`, long axis X. Both bricks lie below the circular barrel footprint and positively support its lower stave ring.
- Barrel datum: stave bottoms at exact brick top `y = 0.07 m`; stave tops at `y = 0.95 m`, so stave height is exactly `0.88 m`.
- Barrel diameter interpretation: passport `Ø0.62 m` is the maximum belly diameter at mid-height. Authored end diameter is `Ø0.56 m`; the ring radii vary symmetrically through `0.280, 0.292, 0.310, 0.292, 0.280 m`.
- Stave thickness: authored `0.018 m`. Each stave is a closed wedge shell with outer and inner faces, hard radial seams and no leakage gap. Twelve staves meet at exact angular boundaries; seams are material joints, not open slots.
- Barrel interior: the top remains genuinely open. A separate oak bottom head spans the inner diameter near the lower chime and positively overlaps the stave interiors. No dark cap or transparent water substitutes for the hollow volume.
- Hoops: three forged-metal annular bands at authored centre heights `0.20, 0.51, 0.82 m` above the stave bottom. Each has authored vertical width `0.035 m` and radial thickness `0.008 m`, following the local barrel radius with positive engagement.
- Downspout: one real hollow square tube, external section exactly `0.10 × 0.10 m`, authored wall thickness `0.012 m`, from `y = 1.10` to `2.10 m`. The bottom is exactly `0.15 m` above the barrel top and is open.
- The downspout axis is authored at `(x=0,z=-0.17 m)`, entirely inside the barrel's open clear top plan, so falling water enters the barrel rather than the rim or ground.
- Two compact forged brackets at authored Y stations connect the downspout to a named future wall plane `z = -0.30 m`. They end at the wall anchor rather than a fake wall panel.

## Named construction and part budget

- Twelve independent closed `timber-mid` stave meshes, one per exact 30-degree sector.
- One closed `timber-mid` bottom-head mesh inside the lower chime.
- One `metal` mesh containing three separate closed hoop bands.
- Two grounded `brick` boxes.
- One hollow `timber-dark` square downspout mesh with open lower and upper ends.
- One `metal` mesh containing two wall-bracket loops/ties.
- Planned part count: `18 / 20`. No lid, tap, water surface, wall, gutter or scenery is invented.

## Load and attachment paths

- Barrel: ground → two bricks → lower stave ring → twelve staves → three binding hoops. The internal bottom head overlaps and is carried by the lower staves.
- Rain delivery: future wall/eave owned by placement → wall-plane bracket anchors → two forged brackets → hollow wooden downspout → open outlet `0.15 m` above the open barrel.
- The downspout is intentionally an externally carried service element. Its named wall anchors tell the placement agent what must touch the building without encoding a building or site coordinate here.
- Water is not modelled as a structural carrier. The barrel remains physically supported when empty.

## Material contract

- Staves and bottom: `timber-mid` → established oak/ordinary wood binding.
- Downspout: `timber-dark` → weathered exterior timber binding.
- Hoops and brackets: `metal` → established forged steel binding.
- Supports: `brick` → established brick binding.
- All canonical materials are opaque and filled. No material id or runtime binding is added.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty, yard shed, hekje, turfhok, ditch privy, hand pump, drying line and bean frame geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain graybox, routes, parcels, reserves or any physical world placement.
- Code-level prefab registration is allowed by the current user instruction only after this canonical object passes its capture/test loop. Registration must consume the canonical parts and established material bindings.
- Do not modify existing bridge, lighting, field or boundary families.

## Rejection conditions

- Barrel lacks exactly twelve stave meshes, any stave height differs from `0.88 m`, maximum outer diameter differs from `0.62 m`, or the top/interior is closed.
- Staves visibly gap/leak, lose their inner faces, share smoothed normals across seams, or fail to meet the bottom head.
- There are not exactly three closed metal hoops, a hoop floats outside the stave envelope, or a hoop is painted into the wood.
- Either brick misses `y = 0`, barrel bottom differs from brick top, either brick lies outside the barrel footprint, or the barrel appears sunk into the ground.
- Downspout outer section differs from `0.10 × 0.10 m`, is solid at its outlet, outlet clearance differs from `0.15 m`, or discharge misses the open barrel plan.
- Downspout has no explicit future-wall attachment chain/anchors, or a fake wall/site slab is added to carry it.
- Object exceeds `20` parts, uses a modern plastic/metal tank silhouette, or depends on transparent water/scenery to explain function.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Twelve exact staves | stave mesh output | recover count, disconnected closed volumes, Y height and maximum radial envelope | front, three-quarter |
| Real open barrel and bottom | inner stave faces + bottom head | probe top-centre emptiness; recover inner radius and bottom overlap | high, interior detail |
| Three attached forged hoops | hoop mesh topology | recover three components/Y bands and positive radial engagement | front, high |
| Two grounded brick supports | brick boxes | recover count/size, min Y and positive plan overlap with lower staves | profile, support detail |
| Hollow `0.10 m` downspout | tube mesh | recover outer/inner section and open-end topology | front, high |
| Exact `0.15 m` outlet clearance | tube lower Y vs stave top | compare recovered bounds | profile |
| Outlet enters barrel | downspout XY/XZ plan | require its whole outlet square inside clear top radius | high |
| Correct opaque material split | part materials + prefab pieces | exact material ids/colors; reject transparency overrides | three-quarter, high |
| Budget and protected scope | filtered inventory | require `18 ≤ 20`, ensemble `≤ 600`, accepted counts unchanged | all captures |
