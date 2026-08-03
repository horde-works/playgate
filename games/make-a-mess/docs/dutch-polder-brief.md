# Dutch Polder World — research and spatial contract

Status: implemented spatial contract. Canonical objects, terrain, reusable
landscape kit and data-first scene are built; sail animation is temporarily
disabled for an isolated performance pass;
wind and real water remain deliberately outside scope.

Concept reference:
`/Users/kirisyuk/Downloads/Gemini_Generated_Image_nngrc0nngrc0nngr.png`.

Topographic drawing: [`dutch-polder-topography.png`](./dutch-polder-topography.png).

## 1. Protected scope

- The world contains four windmills, two structurally different houses,
  flower fields, dry paths, canals, bridges and an irregular floating-island
  shell.
- The design uses natural architectural scale: `1 authored metre = 1 world
  metre`. Only visually necessary minimum member thicknesses may be enlarged.
- Wind is explicitly outside this world milestone. There is no wind vector,
  aerodynamic force, wind sensing, cap yaw, body yaw, or coupling to airships.
- Each sail cross remains a separate complete authored group around its fixed
  windshaft, but is currently static. A later animation/mechanism pass must be
  measured independently and is not a simulation of wind.
- Real water simulation is outside the milestone. The water datum, channels,
  banks, bridge clearances, waterfall mouths and water-driven machine
  interfaces are authored now so a later water system does not require a
  terrain rewrite.
- Existing dirty work in town/vehicle/runtime files is foreign work and is not
  part of this design.

## 2. Sources and confidence

Priority is construction description and mill passport, then multi-angle
photography, then the concept image. The concept owns composition and mood; it
does not own architectural dimensions.

Every number below is marked as:

- `published`: present in a primary or specialist registry source;
- `derived`: calculated from published values;
- `calibrated`: measured from a suitable image against a published value;
- `estimated`: bounded visual estimate awaiting a better source;
- `authored`: deliberate game/world decision.

Primary source set:

- [De Kat mill passport](https://legacy.molendatabase.nl/nederland/molen.php?nummer=753)
  — octagonal paint mill, 21.76 m sail span, 7.10 m gallery level, drive
  inventory and gear counts.
- [De Kat mechanism guide](https://www.zaanschemolen.nl/wp-content/uploads/2023/11/dekat_EN1809-los.pdf)
  — cap winding, upper wheel, crown wheel, vertical drive and brake.
- [Poldermolen Oudegein passport](https://www.molendatabase.nl/nederland/molen.php?nummer=1248)
  — wipmolen, 24.90 m sail span, external 4.72 × 0.30 m scoop wheel,
  5.14 m windshaft and 1.58:1 transmission.
- [De Gekroonde Poelenburg](https://www.zaanschemolen.nl/en/project/the-crowned-poelenburg/)
  — paltrok sawmill, open body, whole-body roller ring and stepped overlapping
  plank wall.
- [Het Jonge Schaap passport](https://legacy.molendatabase.nl/nederland/molen.php?nummer=1290)
  — hexagonal sawmill, 20.50/20.68 m sail span, 5.50 m gallery, three saw
  frames and 1:2.44 transmission.
- [Het Jonge Schaap mechanism guide](https://www.zaanschemolen.nl/wp-content/uploads/2023/10/jongeschaap_EN1809.pdf)
  — log windlass, crankshaft and reciprocating saw-frame process.
- [Zaanse Schans timber construction history](https://www.zaanseschans.com/en/history/)
  — timber yokes, side posts, braces, corbels and stepped overlapping wall
  planks; historical gable development.
- [Het Jagershuis](https://www.zaanseschans.com/en/trash-treasures-het-jagershuis/)
  — 1623 merchant/sawyer house and Gothic crown-post character.
- [Beemsters Wapen monument record](https://monumentenregister.cultureelerfgoed.nl/monumenten/511363)
  — rectangular North-Holland stolp farm, internal timber `vierkant`, mixed
  residential/barn envelope and hipped `stolp` roof.

## 3. Coordinate and metric contract

Canonical world frame:

- `+X`: east;
- `+Z`: south, toward the initial player approach;
- `+Y`: up;
- water surface datum: `Y = 0.00`;
- map north: `-Z`;
- proposed player spawn: `[0, 2.0, 50]`, looking north.

The playable top is not described by a radius. It is an authored polygon with
18 shoreline control points:

```text
(-63,-33) (-43,-49) (-15,-52) (  9,-49) ( 32,-51) ( 57,-40)
( 70,-23) ( 68, -2) ( 73, 18) ( 64, 38) ( 42, 50) ( 18, 55)
( -7, 54) (-30, 57) (-53, 47) (-67, 32) (-70, 13) (-66, -6)
```

Computed envelope:

| Quantity | Value | Confidence |
| --- | ---: | --- |
| East-west extent | 143 m | authored |
| North-south extent | 109 m | authored |
| Top area | 13,058 m² | derived |
| Equal-area circular diameter | 128.94 m | derived |
| Polygon centroid | `(0.55, 2.17)` | derived |
| Maximum shoreline radius | 75.19 m | derived |
| Minimum control-point radius | 49.82 m | derived |
| Perimeter | 422.61 m | derived |

The result is therefore approximately the area of a 129 m round island, but
its actual silhouette is 143 × 109 m. The 1.51 ratio between maximum and
minimum control-point radii is intentional. `world.radius` remains only a
camera/boundary envelope; it must never generate the landform.

For comparison, this sits between the inhabited Viking settlement core and
the full Viking island. It is not the 250 m island written on the concept.

## 4. Topographic thesis

The island is a fused archipelago of six local plates, not a central hill.
Every plate owns a buildable datum and connects through explicit slopes,
bridges or narrow saddles.

| Zone | Role | Buildable top Y | Local relief | Principal occupants |
| --- | --- | ---: | ---: | --- |
| `T1 central-crown` | dominant rock node | +5.20 m | +3.1…+5.8 m | M1 De Kat-type mill |
| `T2 northwest-bench` | older domestic/work terrace | +2.40 m | +1.8…+2.7 m | M2 wipmolen, H1 house |
| `T3 northeast-bench` | saw yard | +2.80 m | +2.1…+3.1 m | M3 hexagonal sawmill |
| `T4 east-bench` | exposed mill shelf | +1.90 m | +1.3…+2.2 m | M4 paltrok |
| `T5 south-polder` | low cultivated ground | +0.80 m | +0.55…+1.05 m | flower fields, drains |
| `T6 southeast-bench` | farm/residential shelf | +1.45 m | +1.0…+1.8 m | H2 stolp farm |

Hydrological levels:

| Surface | Y | Rule |
| --- | ---: | --- |
| visual water plane | 0.00 m | one hard datum |
| normal canal bank top | +0.62…+0.92 m | follows owning polder |
| normal canal bed | -1.40 m | reserved for later water volume |
| mill scoop-wheel pit | -2.15 m | local authored depression |
| waterfall lip | 0.00 m | exact continuation of water plane |

The central crown is deliberately displaced north of the area centroid. The
largest continuous low mass is south of it. The eastern and northwestern
benches are different heights and widths. No two mills share a radial ring or
a common terrain level.

## 5. Water and breakline graph

The channels are authored splines with width and bed depth, not blue tiles
painted over ground.

| Id | Centreline control points `(x,z)` | Width | Outcome |
| --- | --- | ---: | --- |
| `C1 main` | `(-67,15) → (-52,10) → (-38,14) → (-23,10) → (-6,15) → (10,13) → (23,9) → (39,12) → (55,18) → (68,15)` | 4.2 m | main west/east cut |
| `C2 southwest` | `(-30,13) → (-35,29) → (-47,40) → (-52,48)` | 3.5 m | southwest waterfall mouth |
| `C3 field-drain` | `(5,14) → (6,31) → (4,47)` | 2.6 m | narrow controlled polder drain |
| `C4 east-fork` | `(39,12) → (48,25) → (63,32)` | 3.8 m | east waterfall mouth |

Bridge anchors are fixed after the channels, not placed approximately:

- `B1` west domestic bridge near `(-44, 11)`;
- `B2` central saddle bridge near `(0, 14)`;
- `B3` east production bridge near `(41, 13)`;
- `B4` southwest field bridge near `(-40, 33)`;
- `B5` southeast farm bridge near `(53, 27)`.

Normal player routes target at most `1:12` grade. A short scenic footpath may
reach `1:8`, but never on a mandatory route or bridge approach. Paths are
derived from destinations and bridge anchors after the terrain plates exist.

## 6. Placement and clearance contract

The clearance radius is deliberately conservative. It contains the full sail
span, a structural tolerance and room for falling fragments; it does not imply
wind-driven cap yaw.

| Id | Type | Origin `(x,z)` | Base Y | Fixed front | Sail span | Reserve radius | Shore clearance |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `M1` | octagonal paint `stellingmolen` | `(2,-13)` | +5.20 | 168° | 21.76 m | 12.0 m | 24.59 m |
| `M2` | polder `wipmolen` | `(-40,-25)` | +2.40 | 152° | 24.90 m | 13.0 m | 7.61 m |
| `M3` | hexagonal saw `stellingmolen` | `(36,-28)` | +2.80 | 194° | 20.68 m | 11.0 m | 8.44 m |
| `M4` | paltrok sawmill | `(50,4)` | +1.90 | 205° | 23.0 m | 12.0 m | 6.92 m |
| `H1` | Zaan timber merchant house | `(-50,4)` | +2.25 | 128° | — | 7.3 m | 10.42 m |
| `H2` | North-Holland stolp farm | `(31,29)` | +1.45 | 206° | — | 13.0 m | 9.80 m |

Minimum gap between conservative mill reserve circles is 11.93 m (`M3–M4`).
The next smallest is 14.16 m (`M1–M3`). The placement is therefore compact
without making the four mills a regular ring.

## 7. Windmill passports

### M1 — central octagonal paint mill

Source family: De Kat.

Published invariants:

- eight-sided pine smock on an eight-sided wooden substructure;
- attached production shed;
- sail span `21.76 m`;
- gallery level `7.10 m` above the local mill base;
- only the cap is historically wound; horizontal windshaft drive changes to a
  vertical drive through the upper wheel/crown wheel;
- two pairs of edge stones and a chipper mechanism.

Authored massing envelope:

- core across flats: `10.4 m` at base, `5.8 m` below cap;
- gallery outside diameter: `13.2 m`;
- hub height: `15.8 m` above local base;
- cap crown: `19.0 m` above local base;
- attached shed envelope: `8.5 × 5.8 × 4.7 m`;
- maximum rotating height: `26.68 m` above local base.

Rejection conditions:

- circular/conical body instead of an eight-sided framed smock;
- gallery disconnected from visible brackets;
- windshaft missing or not coincident with the sail-cross pivot;
- generic four boards instead of stocks, rods, lattice and sail surfaces;
- annex presented as decorative box without a production connection.

### M2 — northwest polder wipmolen

Source family: Poldermolen Oudegein.

Published invariants:

- `wipmolen`, ground-sailer arrangement;
- thatched lower tower and timber-clad upper house;
- sail span `24.90 m`;
- windshaft length `5.14 m`;
- external half-open scoop wheel `4.72 m` diameter and `0.30 m` wide;
- upper/lower wheel inventory and `1.58:1` transmission.

Authored massing envelope:

- lower tower footprint: `8.6 × 8.2 m`;
- upper house: `5.6 × 7.4 m` with rear tail projection;
- hub height: `12.85 m` above local base;
- blade lower clearance: approximately `0.40 m`;
- scoop-wheel trench: `6.0 × 2.2 m`, bed at `Y = -2.15 m`.

Rejection conditions:

- tapered smock silhouette;
- scoop wheel detached from both the mill gearing and the channel;
- enough lower clearance to stop reading as a ground-sailer;
- upper house and lower tower merged into one continuous skin.

### M3 — northeast hexagonal sawmill

Source family: Het Jonge Schaap.

Published invariants:

- hexagonal timber smock on a wooden base with attached saw sheds;
- sail span `20.50/20.68 m`;
- gallery level `5.50 m`;
- three saw frames, two log carriages and two hoists;
- crank transmission ratio `1:2.44`.

Authored massing envelope:

- hexagonal core across flats: `8.9 m`;
- total shed footprint: `20.0 × 13.8 m`;
- gallery outside diameter: `11.6 m`;
- hub height: `13.7 m` above local base;
- cap crown: `16.5 m`;
- log deck visually continues toward the canal, even before water gameplay.

Rejection conditions:

- octagonal copy of M1;
- missing long shed/log workflow;
- saw frames represented as static wall ornament;
- gallery at the same relative height and diameter as M1.

### M4 — east paltrok sawmill

Source family: De Gekroonde Poelenburg.

Published invariants:

- sail span: `23.0 m`;
- low open sawmill body;
- historically the entire body turns on a large wooden roller ring over a
  brick wall;
- central post carries the principal load;
- stepped overlapping plank wall (`getrapte weeg`);
- side wings/open saw floor are part of the silhouette.

Authored/calibration envelope:

- masonry roller-ring outside diameter: `7.2 m`;
- whole body including wings: `17.8 × 12.6 m`;
- hub height: `11.8 m`;
- roof/crown height: `13.3 m`;
- body and sail cross are both static in the current performance milestone.

Rejection conditions:

- tower silhouette;
- roller ring hidden or replaced by a solid generic foundation;
- closed rectangular shed with sails attached;
- missing open side wings and stepped plank layers.

The earlier `20.4 m` concept estimate was rejected by the M4 object study
after a published `23.0 m` sail span was found. The world reserve and shore
clearance above already contain that correction.

## 8. House passports

### H1 — Zaan timber merchant/workshop house

Source family: Zaanse timber construction and Het Jagershuis.

Construction invariants:

- load-bearing timber yokes and side posts, stabilised by braces/corbels;
- exterior plank cladding is a weather skin, not the primary frame;
- stepped overlapping plank wall;
- narrow/deep body with a readable front gable and smaller service volume;
- carved crown post and white trim belong to actual gable geometry.

Authored wall footprint: `10.8 m` deep × `7.2 m` across the complete asymmetric
wall plan; the narrow main body itself is `4.8 m` wide. Eave `3.35 m`, ridge
`7.15 m`, roof envelope with overhangs `11.16 × 7.47 m`, side service volume
`4.2 × 4.8 m`.

The service volume overlaps the main body and connects through a framed
header/post/brace junction. It is not added outside the `7.2 m` wall width as a
second free-standing box.

### H2 — North-Holland stolp farm

Source family: Beemsters Wapen.

Construction invariants:

- rectangular main footprint;
- internal four-post timber `vierkant` carries the large roof;
- residential front and barn/service sides remain legible;
- dominant hipped/pyramidal roof, with a smaller rear tail changing to a
  gabled roof;
- brick residential wall and timber barn wall are different construction
  systems, not palette variation.

Authored main wall footprint: `14.6 × 13.4 m`, full wall depth with the offset
tail `19.3 m`, eave `3.25 m`, crown `10.7 m`, complete roof envelope
`15.44 × 20.53 m`, internal `vierkant` `7.4 × 7.0 m`, rear tail
`5.0 × 7.2 m`. H2 therefore owns a `13.0 m` world clearance radius and about
`9.8 m` of remaining shore clearance. Never report the main stolp footprint as
the full farm envelope.

The brick front follows the six-bay Beemsters Wapen topology: four flanking
windows and two central pairs of garden doors beneath a shallow cross-gable.
The rear tail is offset and passes through an open framed rear bay; its gable
roof needs a continuous underlay and flashing where it emerges through the
large hipped roof. It must not be a second sealed cottage intersecting the
stolp shell.

## 9. Standalone object-lab contract

The windmills and houses must be reviewable before scene compilation. There is
no support solver, terrain, world shell or gameplay runtime in this harness.

One geometry owner produces both outputs:

```text
object parameters -> canonical geometry/piece description
                  -> standalone object-lab renderer
                  -> scene prefab adapter -> scene compiler
```

The object lab is not allowed to maintain a prettier duplicate mesh. Its input
must be the same canonical points, profiles, member endpoints and material
slots used by the future prefab.

Each revision exports transparent or neutral-background PNGs at identical
scale:

- `front`;
- `profile-left`;
- `rear`;
- `three-quarter-left`;
- `three-quarter-right`;
- `high-three-quarter`;
- `joint-closeup` for cap/shaft/roller ring/frame;
- `silhouette-sheet` with all materials neutralised.

Camera projection defaults to orthographic for shape comparison. One 50 mm
perspective three-quarter camera is added for presentation only. Every PNG
embeds object id, camera id, overall dimensions and revision hash.

The future file boundary is:

- `content/objects/dutchWindmills/`: canonical geometry and passports;
- `content/prefabs/dutchWindmills.ts`: compiler adapter only;
- `authoring/objectLab/`: generic preview and PNG capture harness;
- `content/scenes/dutchPolder/`: placement, terrain, routes and shell;
- `game/ConstantRotorSystem.tsx`: retained generic runtime, not registered by
  the current Dutch polder scene.

No wind import is permitted in `DutchWindmillRotorSystem`.

## 10. Terrain implementation contract

The current static collider uses primitive shape, transform and size; it does
not turn an arbitrary `visualMesh` into matching collision. Therefore:

- flat plate interiors use 4 m authored ground cells;
- bank and terrace transitions use explicit rotated slabs/wedges with matching
  visual geometry and collision;
- 2 m refinement is allowed only around bridge seats, channel corners and mill
  foundations;
- flower rows are instanced vegetation bound to owning ground pieces, never
  one structural piece per flower;
- the island skirt is generated from the shoreline polyline and local top Y,
  not from concentric `WorldEdge` rings;
- channel mouths remove both top ground and cliff lip geometry.

The closest existing references are `nimbusShell.ts` for named relief
components and local pads, and `astanaShell.ts` for semantic ground/water
queries. The Dutch surface must not inherit Nimbus's centred bowl.

## 11. Independent acceptance

### Plan and topography

- exact shoreline bounds, area and equivalent diameter;
- every land cell belongs to one named zone or transition band;
- no land/collider occupies a channel prism;
- all mandatory routes connect spawn, both houses, four mills and five
  bridges;
- mandatory route slope and head-clearance limits pass;
- bridge endpoints land on the intended bank datum;
- waterfall lips meet `Y = 0.00` without an uphill segment;
- whole-scene initial unsupported count is zero after later compilation.

### Non-radial composition

- mill base heights contain at least four distinct values;
- no three mill origins have approximately equal distance to world centre;
- no two mill pairs share both distance and bearing within authored tolerance;
- shoreline radius varies by at least 35% across sampled bearings;
- high-view screenshot retains two large water/field negative spaces and a
  displaced central crown.

### Objects

- published sail spans and gallery levels are reconstructed from compiled
  pieces independently of the authoring helpers;
- fixed windshaft and visible hub pivots coincide within `0.03 m`;
- no sail enters terrain, a roof, bridge or another sail envelope;
- material-neutral silhouette sheet allows all four mills and both houses to
  be identified without colour;
- front/profile/rear/high PNGs show one revision hash and identical bounds;
- the current scene registers zero moving rotors and has no world-wind or
  vehicle dependency.

## 12. Completed acceptance milestones

1. The dimensions, six unequal terrain datums, object families and 143 × 109 m
   irregular envelope were accepted.
2. M1–M4 and H1–H2 were built as standalone canonical Object Lab models with
   fixed PNG evidence before integration.
3. Rotor crosses were separated from fixed construction; their runtime motion
   is currently disabled for isolated performance comparison.
4. The non-radial terrain graybox, object reserves, routes, channels and five
   bridge seats were accepted.
5. A reusable canonical landscape kit was added for bridges, paths, masonry,
   raised beds, revetments, fences, hedges and pollard willows.
6. The accepted objects were compiled into the playable data-first scene with
   zero initially unsupported pieces.
