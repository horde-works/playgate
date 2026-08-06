# Geometry, construction and support

## Contents

1. Coordinate contract
2. Decomposition
3. Primitive selection
4. Shared geometry
5. Openings and hollow objects
6. Load paths
7. Attachments and moving parts
8. Roofs and slopes
9. Stairs, boats and water objects
10. Repetition and budgets
11. Materials and grouping
12. Geometry failure modes
13. Measured drawings and blueprints

## 1. Coordinate contract

Declare before modelling:

- units and absolute scale;
- `+Y` or other up axis;
- front direction;
- origin meaning;
- ground or water datum;
- later placement anchors.

For a `+Y`-up, `+Z`-front object, use consistent names:

- `front` = positive Z;
- `rear/water` = negative Z;
- `left/right` = negative/positive X when viewed from front;
- `bottom/top` = Y bounds.

Do not let an isolated Object Lab floor redefine a water object. A boat can use waterline zero if documented. A bank-cantilever object can keep `y = 0` as bank top and expose `bankEdge` as an anchor.

Ground/contact tests must inspect the parts the later footprint function will inspect. If the engine treats bottoms `≤ 0.06 m` as grounded, ensure real carriers reach that interval.

## 2. Decomposition

Draw a bill of construction before creating parts.

Classify each proposed part:

- **primary carrier**: foundation, pile, beam, post, frame, hull bottom;
- **secondary carrier**: plate, rafter, floor, seat apron, door frame;
- **surface**: cladding, roof skin, hull side, stave shell;
- **functional**: door, lever, spout, tread, seat, oar;
- **attachment**: hinge, bracket, pin, ring, latch, hoop;
- **contents**: peat mass, water bucket interior, cargo;
- **diagnostic anchor**: non-rendered relation for later placement.

Model an annex or attached wing as a connected mass with its own three-dimensional volume and its own roof, never as a rectangle applied to the facade.

Build the bill against the budget. Reserve parts for defining features before decorative subdivision.

Example budget table:

| System | Planned parts | Why retained |
| --- | ---: | --- |
| grounded support | 4 | defines load path |
| body/shell | 8 | silhouette and real opening |
| roof | 3 | slope and bearing |
| hardware | 6 | working attachment chain |
| functional interior | 4 | explains use |
| detail reserve | 2 | only after verification |

## 3. Primitive selection

### Boxes

Use for real prismatic boards, slabs, stones, panels and treads.

Check all three semantic dimensions. In many schemas a cylinder reports `[diameter, length, diameter]`, while a box reports `[X, Y, Z]`; never transfer cylinder thinking to boxes.

Avoid boxes when:

- a top must slope continuously;
- an object is hollow or tapered;
- a silhouette requires a polygon;
- a real notch/opening would be filled.

### Endpoint beams/rods

Use for structural members with meaningful joints: rafters, braces, rails, handles, oars.

Define endpoints at joint centers or bearing surfaces. Test endpoint contact independently. Do not stop rods visually short to avoid overlap; real joinery requires engagement.

### Cylinders

Use for shafts, piles, pins and tubes with constant radius.

Use enough radial segments to communicate material and scale:

- 6–8 for rough/forged/faceted small items;
- 8–12 for timber and cast iron;
- higher only when silhouette requires it.

Do not use a solid cylinder for a bucket, barrel hoop, ring or pipe opening when the hollow topology is visible.

### Meshes

Use for:

- tapered columns and barrels;
- open buckets and rings;
- perforated leaves;
- sloped-head cladding;
- hull ribbons and transoms;
- notched stringers;
- faceted caps;
- irregular but planar prisms.

Build closed volumes unless the physical part is a deliberately thin two-sided sheet. Confirm triangle winding and normals in the actual renderer.

## 4. Shared geometry

Define common values once:

- half-width/half-depth;
- post offsets derived from outer faces and section;
- roof-line function;
- pitch from exact gap;
- waterline/bank anchor;
- opening bounds;
- repeated station array.

Make adjacent parts share these values. Examples:

- wall board tops call the same roof-line function as the posts;
- roof rotation derives from the same front/rear eaves;
- door piers end at the exact opening boundary;
- gate rails and hardware use the same leaf bounds;
- a boat side ribbon and transom use the same station points.

Avoid magic offsets. Name deliberate offsets by purpose: `roofThickness`, `trimNormalOffset`, `hingeEngagement`, `boardGap`.

## 5. Openings and hollow objects

### Real door/window opening

Build:

- left pier;
- right pier;
- head/lintel;
- optional sill;
- leaf/glass inside the wall depth.

Do not place a leaf over one full wall panel. Tests must first prove the shell opening exists, then measure the leaf.

### Small perforation such as a heart

Options:

1. one triangulated mesh with a hole and hard normals;
2. several solid regions around the void;
3. boxes for broad regions plus small hard-edged prism infills around the contour.

Prefer option 3 when renderer normal generation smooths one large perforated mesh incorrectly. Test both the hole bounds and an interior probe point that must remain uncovered.

Do not accept:

- black decal on a solid leaf;
- double-sided face that conceals a filled back;
- giant false highlight caused by normals shared between face and reveal;
- coplanar overlapping polygons around the opening.

### Open bucket/barrel

Model at least:

- outer stave surface;
- inner surface with visible wall thickness;
- bottom and bottom-to-wall joint;
- open top;
- external hoops;
- handle attachments if the handle is shown.

One mesh may contain many staves if the part budget is strict, but its silhouette and open interior must be real.

### Direct drop or drain

Split floor/seat geometry around the void. Probe a point through every relevant layer. A dark material or absent rear wall is insufficient if a floor slab still closes the path.

## 6. Load paths

Write each load path as a chain:

`datum → foundation → primary carrier → secondary frame → surface/dependent`.

Examples:

- `ground → stone base → pump foot → tapered barrel → cap/pivot → lever`;
- `bank datum → cantilever beams → posts → plates → roof`;
- `channel bed → piles → bearers → deck boards → steps`;
- `waterline contract → flat hull bottom → frames → side ribbons → gunwale`.

Tests must prove:

- datum contact;
- horizontal overlap at bearing;
- vertical boundary contact or intentional positive engagement;
- dependent not below/away from carrier;
- no decorative surface is the only carrier.

A mathematically zero contact is acceptable for clean bearing surfaces; hardware normally needs positive overlap. Use tolerances only for floating-point error, not visible gaps.

### Unequal load distribution

If the source shows an unequal load split, show it in the construction: the main load path must run continuously to the body, while a secondary roller/guide support must not read as an equal foundation. Two identical-looking supports under an asymmetric machine are a construction lie the silhouette will repeat.

### Cantilevers

Define:

- support/bank anchor;
- free end;
- exact projection;
- landward tail or embedment;
- carried post/frame locations.

Do not add fake bank geometry to a standalone asset. Expose a named anchor and let the later site adapter own terrain embedment.

### Grounded but visually elevated objects

Use real piles, legs, blocks or a foundation down to the datum. Never let the renderer’s shadow imply support.

## 7. Attachments and moving parts

Model the complete attachment chain before decoration. Store each mechanism's axis and pivot exactly once. For kinematic groups, motion contracts, second states and swept envelopes, read articulation.md — the boundary of the moving group is drawn before geometry, not after.

### Hinged leaf

Build the leaf from its hinge axis, not from the opening centre: `post/jamb → bracket or pin → strap/knuckle → leaf`.

Require:

- pin intersects carrier;
- strap reaches pin and leaf;
- leaf edge coincides with its hinge axis;
- leaf has clearance from frame;
- latch overlaps leaf and catch;
- catch overlaps receiving jamb/post.

For a paired opening, verify separately: the number of leaves, each leaf's own connection to its own hinge, and the full-open sweep clearing rails, tracks and the threshold over the whole travel — not only at the closed pose.

Millimetre-scale gaps matter. A ring or strap that looks near a beam but does not intersect it is detached.

### Pump lever

`column cap → pivot pin → metal lever → wooden grip`, plus piston/linkage when visible.

Derive lever endpoints from exact length and authored angle. The grip continues the lever axis. The pivot diameter is independent of lever thickness.

### Ring

A visible ring needs a bracket, staple or hole. Construct ring thickness and inner void. Check the ring/bracket depth interval; a correct front view can conceal a detached Z offset.

### Handles

Join every segment. A bucket bail must terminate in lugs/rim positions, not in empty air beside the bucket.

## 8. Roofs and slopes

Derive pitch:

`pitch = atan2(frontEave - rearEave, horizontalRun)`.

For a rearward fall in a `+Z`-front frame, verify the sign of X-axis rotation in the actual renderer.

Separate:

- post/plate control line;
- rafter or upper carrier;
- nonbearing roof skin;
- overhang.

Check high views for:

- plates or rafters piercing the roof;
- false ribs on the upper surface;
- unsupported skin edges;
- asymmetric overhang;
- wrong drainage direction.

If a carrier must touch the roof underside, set its top fibre to engage the underside without crossing the upper face. Test in the roof’s rotated local frame.

### Shell junctions

When large shells intersect — a tower, annex, chimney or duct passing through a roof or wall — design the junction itself: a roof cut, collar, flashing, supports or a transition volume. Never simply pass one closed mesh shell through another; every such entry needs an open span, a support and a flashing/collar, and a test proves the junction exists.

### Wall footprint vs roof envelope

Keep the wall footprint and the roof/fixed envelope as separate recovered numbers with explicit axes. Overhangs, gutters, ridges and decorative finials may legitimately exceed the wall footprint while both contours still fit a shared world clearance; a wall-footprint test proves nothing about a roof overhang. For moving objects a third number — the kinematic reserve — joins them; see articulation.md §4.

## 9. Stairs, boats and water objects

### Stairs

A tread rests on a ledge/notch or bearer. It must not be pushed into a solid diagonal stringer.

Build a stepped stringer mesh when notches are visible. For each tread verify:

- bottom equals ledge top;
- tread front/rear edges correspond to notch boundaries;
- stringer material does not occupy tread volume above the ledge;
- both sides carry the tread.

### Boats

Start with a watertight lower hull:

- bottom boards or bottom shell;
- rising end sections;
- side panels meeting bottom/chine;
- bow/stern transoms;
- frames and benches inside.

Never infer a bottom from side shadows. Inspect underside/high interior views and test bottom bounds, end continuity and draught.

Use a waterline anchor when placement depends on draught. Do not ground a boat at its bottom if the contract uses light-ship waterline zero.

### Piles and water levels

Record driven tip, bed, waterline and visible top as separate datums. A pile can be below ground/water without violating the object ground contract only when explicitly documented.

## 10. Repetition and budgets

Spend parts on observable topology.

Good compression:

- one solid bulk behind a few explicit top courses;
- one mesh containing repeated bucket staves;
- one mesh containing two hoop bands;
- one shell panel per meaningful surface instead of hidden board backs;
- low radial segments appropriate to rough material.

Bad compression:

- replacing a real opening with paint;
- deleting the boat bottom;
- merging hardware into a floating decal;
- closing an open rear to save parts;
- removing support members while keeping decorative cladding;
- shrinking dimensions to fit a budget.

Track both object and ensemble totals after every addition.

## 11. Materials and grouping

Material names may affect physics/support classification. Read the runtime mapping before naming groups.

Keep group semantics explicit:

- `*-primary` for load-bearing structure;
- `*-floor`, `*-frame` for secondary carriers when project rules support them;
- `*-cladding`, `*-trim`, `*-roof-skin` for nonbearing surfaces;
- `*-hardware`, `*-fittings` for attachments;
- `*-contents`, `*-fuel` for carried mass.

Do not invent a material id without updating every binding/renderer path required by the project. Prefer the established palette.

Materials must reveal geometry rather than conceal it. Neutral structural renders are useful for checking normal errors and intersections.

## 12. Geometry failure modes

| Failure | Cause | Correction |
| --- | --- | --- |
| plausible but wrong object | silhouette drawn from concept image | return to evidence and control views |
| missing bottom | sides mistaken for complete hull | add real bottom and end continuity |
| embedded tread | straight stringer crosses tread | create notch/ledge geometry |
| detached ring/strap | depth offset not tested | require positive carrier overlap |
| fake opening | dark face on solid wall | split shell around void |
| giant triangular shading | shared normals across perforated face/reveal | use hard-edged regions/prisms |
| roof ribs | plate penetrates skin | lower carrier to underside engagement |
| floating roof | overhang built without frame contact | add/adjust plates/rafters and test local frame |
| bucket reads as barrel | closed top or no handle | create open interior and attachment |
| support appears from shadow | no carrier reaches datum | extend real foundation/pile/leg |
| exact count but generic form | budget spent on repetition | reallocate to defining topology |

## 13. Measured drawings and blueprints

When a scanned factory drawing or measured blueprint exists, it outranks every photograph — but scans lie in their own way. The method below was proven on the Citroën DS study; the object's own passport stays at `games/make-a-mess/docs/citroen-ds-brief.md`.

### Conflict hierarchy

«Напечатанный размер > обвод с чертежа > фотография > текущая реализация»: a dimension printed on the drawing beats an outline traced from the drawing, which beats a photograph, which beats whatever the current implementation happens to contain. Cross-check printed dimensions arithmetically (front overhang + wheelbase + rear overhang = length) before trusting any of them.

### Absolute scale only from printed dimensions

Scans are anisotropic by 3–10%. Take the absolute scale ONLY from printed dimensions; from the traced outlines take shape alone, normalized into that printed envelope.

### Normalized outline tables

Trace each control line as a table over `u` — the fraction of overall length from the nose/front: the top line as height(u), the plan as half-width(u), and cross-sections as half-width per height station. Tables survive rescaling, diff cleanly, and every row is independently checkable against the drawing. Conclusions (crest is a plateau, not a point; taper is one straight facet) are read off the table, not off an impression.

### Clean the traced envelope of dimension lines

A traced envelope happily locks onto extension and dimension lines: on the DS scan the «1470» dimension ran as a dashed line exactly at roof height and the tracer sat on it. Reject such rows with a fact about the object (from the crest the outline only falls in both directions), not by eye.

### Never mix measurements from two scans

Each scan has its own anisotropy. Mixing readings from two scans produced false "discrepancies" up to 700 mm on the DS. Pick one scan per projection family and normalize everything from it; use a second scan only to confirm shape, never to supply numbers.

### Acceptance: overlay in the drawing's pixel frame

The drawing is not only input but the target. Overlay an orthographic render of the COMPILED parts onto the corresponding drawing view in the drawing's own pixel frame, and compare in order: silhouette → control lines → openings → secondary volumes. While points 1–3 diverge, do not build detail.

### Detectors that caught what number-tests missed

Passport-number tests all passed while the assembled car was wrong; these render-side detectors found it:

- **magenta gap detector** — paint interior parts magenta; any magenta visible through the shell is a hole in the skin (the DS arch cut had leaked onto the bonnet deck as a dark lens);
- **wheel-cut detector** — verify the arch cut applies only where intended and the body covers the tyre over its whole height (the section needed an explicit straight "cheek" segment below the waist); separately test that the visible wheel stands ON the road — the suspension station's `hub` field was the strut top, not the wheel centre, and the finished car floated 160 mm with every passport test green (see articulation.md §9).
