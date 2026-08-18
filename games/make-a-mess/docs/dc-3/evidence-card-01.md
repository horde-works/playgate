# Evidence card 01 — Douglas DC-3

## Identity and source hierarchy

- Object: Douglas DC-3 civil passenger airliner, 1935–1940s type.
- Explicitly not: C-47 / Dakota cargo door and astrodome; DC-2; a generated
  “vintage airliner” picture used as a drawing.
- Current milestone: isolated Object Lab **shape prototype B01**. No world
  adapter, no physics, no destruction, no livery.

Sources:

- `published` — National Air and Space Museum object
  [A19530075000](https://airandspace.si.edu/collection-objects/douglas-dc-3/nasm_A19530075000):
  wingspan 29 m (95 ft), length 19.7 m (64 ft 6 in), height 5 m (16 ft 11 in),
  empty 7 650 kg. Eastern Air Lines airframe, 1936, Wright SGR 1820-71.
- `published` — AOPA type article, 2005: length 64 ft 5 in; height 16 ft 11.5 in
  tail-down, 14 ft 11 in tail height, 23 ft 6 in tail-up; wingspan 95 ft; wing
  area 987 sq ft; Hamilton Standard ~11 ft 7 in.
- `published` — DC-3A-S1C3G compilation (Wikipedia, citing Jane’s-class
  figures): length 64 ft 5 in; span 95 ft 0 in; height 16 ft 9 in level /
  23 ft 6 in; wing area 987 sq ft; aspect 9.17; airfoil NACA 2215 / 2206;
  propeller 11 ft 6 in.
- `passport` — this card and `source-expectations-s01.json`. Exact B01
  envelopes are the published metre conversions there.
- `authored` — station tables, dihedral, engine half-span, three-point pitch,
  nacelle and empennage chords. No manufacturer drawing is in the repository.
- `documentary` — NASM stills of A19530075000 in `docs/dc-3/references/`:
  front cone (NASM2020-00888), 3/4 cockpit (NASM2018-10063), side deck
  (NASM2020-00887), tail close-up (NASM2018-10067), 3/4 airframe
  (NASM2025-02160). They own nose and fin topology, not millimetres.
- ImageGen and attractive renders own nothing.

NASM’s move-contractor fuselage width 4.14 m is recorded as a **conflict** and
is not used as a body diameter.

## Local frame and envelopes

- Units: metres, 1:1.
- Object Lab: `+Y` up, `+Z` nose, origin on the ground under the main-gear
  axle line (`ground-centre`).
- The airframe is built in a body frame (waterline along `+Z`) and then
  pitched nose-up so all three wheels sit on `y = 0`. This is the tail-down
  museum sit, not a level three-view plate.
- A separate `plan` camera looks along the body up-axis so the wing planform
  is not foreshortened by that sit.
- Human scale: 1.75 m, recorded as an anchor, not a mesh.

Published envelopes (frozen in `source-expectations-s01.json`):

| Quantity | Value | Authority |
| --- | ---: | --- |
| Wingspan | 28.956 m | 95 ft 0 in |
| Length along fuselage | 19.659 m | 64 ft 6 in |
| Height, tail-down | 5.156 m | 16 ft 11 in, top of fin. Fuselage in the same sit is 14 ft 11.5 in on the type; a restored oleo may put the cabin AABB above the fin |
| Wing area | 91.69 m² | 987 sq ft |
| Propeller diameter | 3.505 m | 11 ft 6 in |

## Canonical representation

- Owner: `src/content/objects/aircraft/dc3BlockoutObject.ts`.
- Derivatives: Object Lab PNGs under `docs/dc-3/blockout-b01/`.
- No CAD/GLB sidecar this milestone.
- Registration of photographic silhouettes is deferred: B01 is a published-
  envelope prototype, not a fitted overlay against one airframe photo.

## Named construction

| System | Family | B01 content |
| --- | --- | --- |
| Fuselage | lofted oval shell | accepted cabin (roof, round-in, blunt windshield); upper half flattens toward the glass and anti-glare deck; bullet cap from the sill to the last ring; a separate nose overlay closes that ring to a rounded tip |
| Wing | tapered loft, outer dihedral | low-wing: root lower surface on the keel; center almost flat, outer 5°; aileron is a rectangular inset that stops 52 cm short of the tip; the fixed cap outboard rounds leading and trailing edges and pinches thickness to a closed edge; nav lights sit in glass sensor-cap blisters on the tip, facing outboard, bulb nested inside |
| Nacelles | metal teardrop, same diameter as the cowl | shaft on the local wing chord, not a pod under the box; frozen look in `blockout-b01-freeze-teardrop/` (hash `92a6706e0bf6`) |
| Engines | Wright R-1820 radial | nine cylinders inside each cowl |
| Propellers | three paddle blades | frozen; no aero |
| Empennage | height-lofted fin (dorsal in the same mass) + tapered stabilizer | rudder and elevator cut from those lofts as hinged leaves; stabilizer rounds the box to the elevator, which stays a rectangular inset; fin outline frozen in `blockout-b01-freeze-fin/` |
| Control surfaces | hinged leaves on the rear-spar / fin-hinge line | ailerons, split flaps (skip the nacelle), elevator, rudder; flaps-down is a posed second state |
| Core | skin-on-frame cage inset from the loft: three spars, wing formers, frames, four longerons, eight stringers, engine mounts | skins stay filled and outside the cage; wing spars and formers sit 32–40% of local thickness inside the airfoil so the 12 mm panel skin does not cut them; cutaway hides named skin groups only |
| Gear | mains into nacelles, tailwheel | three-point contact; knuckle box hangs under the cowl; oleo 0.90 m (90% of the pre-low-wing 1.0 m); trunnions pick up the front spar |
| Cockpit | two-pane greenhouse: central windshields in a V plus a side light each side | side lights sit on the loft, cropped to two-thirds height from the sill; aft sill raked 8 cm toward the nose so the outer aft frame sits on the loft at head and sill; leftover windshield-to-side slit sewn with a sharp skin plug, not a third pane; greenhouse beam follows the cabin-to-nose taper; forehead is a convex brow on the V of the windshield heads, following loft generators to ring 5.8 (each generator keeps its chevron angle, including samples on the head bar); the 18° roof sectors beside gore2, from the temple ring 5.55 onto that visor aft, are loft patches whose columns follow the visor aft samples (not a two-point chord); aft hull follows the loft from station 5.15 onto the rear frame; the nose cheek (gore 0/4) runs from the cap to station 5.15 with its top on the side-light sill frame; from the plug sill edge the 36°–54° sector runs onto the first cap ring, sharing the sill-fairing outboard and the cheek generator, not a radial skirt under the sills; no sill skirt; cage stops behind the side-light frame; roof does not rise above the cabin |
| Cabin windows, doors, stringers, tanks, livery | — | deferred |

## Load path

The DC-3 is a low-wing semi-monocoque whose **wing box is the primary
carrier**. Documentary type (DCA description; Leeham / stressed-skin
survey): three spars tip-to-tip, outer panels bolted just outboard of
the nacelles, fuselage of frames and longerons in Alclad 24-ST.

Authored chord stations, not a manufacturer drawing:

| Member | Station | What it carries |
| --- | ---: | --- |
| Front spar | 18% chord | engines, main-gear trunnions |
| Main spar | 38% chord | wing bending, fuel bay ahead |
| Rear spar | 70% chord | wing box close; flap and aileron hinge |
| Fuselage frames | loft stations | ring the skin, sit on the box |
| Four longerons | crown/keel lanes | axial stiffness |
| Cabin floor | y = 0.36 m body | walks above the carry-through |
| Wright mount | firewall → crankcase | radial hangs on the front spar |
| Fin / stab spars | inset from LE/TE | empennage into aft frames |

Eight stringers plus four longerons are the simplified grid the fuselage
skin rivets to — the same skin-on-frame rule as SR-6 / hexacopter cores:
members sample the loft tables and sit inset; the skin is a separate
outer loft. Cutaway cameras hide `fuselage`, `wing`, `nacelle-*` and
`empennage` only.

## Motion contract

- Static airframe except lab-posed control surfaces.
- Kinematic groups named `propeller-left` and `propeller-right`: each owns one
  nacelle-local shaft frame (`pivot`, directed `axis`, `phaseSign`) in the
  canonical object. Runtime adds phase around that axis only; the carrier pose
  moves the complete nacelle/shaft/propeller assembly. Both shafts rotate
  clockwise when viewed from behind the engines; phase is frozen in Object Lab.
- Typed hinges on `surfaceHinges`: ailerons ±25°, flaps 0 to −42° (TE
  down), elevator −22° / +18°, rudder ±25°. Pivot, axis, range and rest
  live once; Object Lab and the tests read the same record.
- Discrete second state: `*-flaps-down` views pose the four flap leaves
  at `flapDownDegrees`. Same parts, same hash family, different pose.
- Class declared: `liftSource: "wing"` in `dc3Airplane.ts`. Guidance maps
  to the existing hinge channels (`throttle:0/1`, `aileron`, `elevator`,
  `rudder`, `flap`). Not registered in `airVehicles`. No world.
- Excluded: retraction, world coupling, windows, VehicleFrameSystem wiring.

## Protected scope

- Do not edit palace, hexacopter, or other in-flight object studies.
- Do not register a prefab or place the DC-3 in any world.
- Do not invent C-47 cargo geometry.

## Rejection conditions

- Fuselage of constant section (“cake”).
- One nacelle, or props as painted circles on a solid wall.
- Overall span or fuselage length off the published values by more than the
  B01 test tolerance.
- Wheels off the ground, or the belly buried in the floor.
- World / compiler / physics imports.
- Claiming visual acceptance without current same-hash PNGs.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Wingspan 28.956 m | published envelope | recovered X of wing parts | front, plan |
| Fuselage length 19.659 m | published envelope | range along body +Z | right-profile |
| Tail-down height 5.156 m | published envelope | recovered Y of all parts | right-profile, front |
| Two props 3.505 m | published envelope | cylinder radii | front, three-quarter |
| Lofted fuselage, not a cake | station tables | crown/width change nose→cabin→tail | right-profile, plan |
| Three-point sit | authored pitch | mains + tailwheel at y≈0 | right-profile |
| Low-wing, shafts on the chord | keel table + `wingAt` | root lower ≈ keel; hub Y = local chord | front, 3/4 |
| Twin nacelles mirrored | authored half-span | two groups, opposite X | front, plan |
| Three spars tip-to-tip | authored chord fractions | recovered X span and Z order | core-detail-cutaway, right-profile-cutaway |
| Frames, longerons and stringers inside the shell | loft stations, 12 cm inset | per-band cage inside skin | high-three-quarter-cutaway |
| Mounts pick up crankcase and gear | front spar | stay/trunnion endpoints | nacelle-detail, core-detail-cutaway |
| Flap / aileron / elevator / rudder are openings | rear spar 70%, fin hinge 60%, stab 72% | gap between fixed loft and leaf; typed hinge | flap-detail, tail-detail |
| Flaps-down is the same leaves posed | `surfaceHinges` + view.articulation | paired cameras, TE drops, sweep misses fuselage | flap-detail-flaps-down, high-three-quarter-flaps-down |
