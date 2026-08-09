# Casebook: accepted object studies — yard kit and machines

## Contents

1. How to use this casebook
2. Schouw
3. Mooring posts
4. Jetty and stairs
5. Yard shed and lifting gear
6. Picket fence and gate
7. Peat store
8. Ditch privy
9. De Kat paint mill (M1)
10. SR-6 Skat: primitive vocabulary and shared normals
11. SR-6 Skat: member families, air gaps, livery and control lines
12. RAX-8 Tonkawa combat hexacopter (C1 → C2)
13. VX-8 Yaqui integrated-duct hexacopter: the loft, the panels and the cake
14. Cross-case best practices
15. Cross-case worst practices

## 1. How to use this casebook

These cases record process lessons, not reusable dimensions. Read the relevant case before building an object with the same risk.

Do not copy a case’s form into a new type. Copy its verification strategy:

- which hidden side proved the construction;
- which test exposed the defect;
- which representation fixed it;
- which tempting shortcut failed.

## 2. Schouw

### Risk

A shallow open boat can look plausible from the side while lacking a physical bottom. Side ribbons and dark shadows create a false sense of enclosure.

### Bad practice

- Start from a pretty three-quarter boat render.
- Model only side boards, gunwales and transoms.
- Assume the dark area below benches is a hull bottom.
- Validate only overall length and beam.

### Correction

- Define waterline and light draught explicitly.
- Build central flat bottom boards and rising end boards.
- Join bottom, chine, side ribbons and transoms through shared station points.
- Add internal frames only after the lower shell is continuous.
- Use an underside/high interior view.

### Tests that matter

- bottom-board count and exact board width/thickness;
- minimum bottom Y equals waterline minus draught;
- end bottom sections meet central top line;
- transom/side union recovers exact length/beam;
- required high/underside view exists.

### General lesson

For any shell, prove the least visible closure first. A silhouette is not a volume.

## 3. Mooring posts

### Risk

Small forged rings can appear attached in front view while floating in depth.

### Bad practice

- Place ring and bracket by visual proximity.
- Test ring height but not bracket/ring overlap.
- Use one camera aligned with the depth error.

### Correction

- Build a bracket that physically intersects the pile.
- Place ring tube through/around the bracket’s depth interval.
- Add a cap/ring diagonal detail view.
- Test the Z overlap independently.

### Tests that matter

- two-pile spacing;
- driven/wet/dry height datums;
- faceted cap topology;
- ring center above waterline;
- positive bracket-to-pile and ring-to-bracket overlap.

### General lesson

Every loop, hook, hinge or strap needs a complete attachment chain. “Near” is not “attached.”

## 4. Jetty and stairs

### Risk

Treads pushed into straight diagonal boards look like steps from one angle but are physically recessed into the stringers.

### Bad practice

- Use two unnotched sloped beams as stringers.
- Intersect horizontal tread boxes with them.
- Accept the result because the top faces align.

### Correction

- Build stepped/notched stringer meshes.
- Give every tread a horizontal ledge.
- Keep stringer material below the tread volume inside the tread’s Z interval.
- Verify both stringers at both tread edges.

### Tests that matter

- four piles grounded to bed datum;
- bearers touch piles and deck;
- board count, gap and deck top above waterline;
- each tread bottom equals ledge top;
- no stringer vertex occupies forbidden tread volume;
- no rail group for a private jetty when the passport forbids rails.

### General lesson

Interpenetration is not joinery. If the joint shape matters, model the receiving notch/seat.

## 5. Yard shed and lifting gear

### Risk

A shed can have an attractive façade while its signature lifting beam, hook or rings are detached. Because the fitting is small, the whole building’s meaning becomes decorative rather than functional.

### Bad practice

- Treat the projecting lifting beam as ornament.
- Hang rings/hooks under it with an arbitrary gap.
- Hide the attachment under the gable.
- Spend detail on cladding before proving the hoist path.

### Correction

- Establish wall frame → gable carrier → projecting beam → iron eye/ring → hook.
- Recover the exact beam projection from geometry.
- Require hardware/beam depth overlap.
- Add a close diagonal camera aimed along the lifting beam.
- Preserve the rest of the accepted shed when only rings are wrong.

### General lesson

When the user identifies one local defect on an accepted object, fix only that defect. Do not regenerate or restyle the building.

## 6. Picket fence and gate

### Risk

A domestic Zaan picket fence can be confused with the existing field fence or built with almost-correct spacing that prevents modules from joining.

### Good practice

- Let the passport own exact picket width, gap and module length.
- Derive pitch as width + gap.
- Set first/last post outer faces to exact module bounds.
- Keep fence and gate families distinct.
- Model gate frame, diagonal brace, pins, straps, latch bar and receiving catch.
- Give the gate a shared hinge post and separate latch post.

### Tests that matter

- module outer-face length;
- picket bounds and exact adjacent clear gaps;
- rail contact with every picket;
- gate leaf width/height;
- diagonal direction from lower hinge side toward upper latch side;
- hinge and latch attachment chains;
- established green/light palette.

### General lesson

Repeated exact spacing is structural interface data. Test clear gaps and module envelope, not only count.

## 7. Peat store

### Risk

Explicitly modelling every fuel brick can exhaust the budget, while one solid brown block loses ventilation and identity.

### Good practice

- Use one grounded lower bulk mass.
- Add only the visible top two or three courses explicitly.
- Derive rotated brick pitch so the clear gap remains exact after yaw.
- Keep front open and rear slatted.
- Use unequal post heights to own roof pitch.
- Show fuel stack in a dedicated detail camera.

### Tests that matter

- four grounded posts and exact footprint;
- front/rear heights and rearward slope;
- plate/rafter/roof contact;
- open front and positive rear slat gaps;
- stack union bounds;
- visible brick size, rotation, support and exact rotated gap;
- object budget.

### General lesson

Budget compression should merge hidden mass, not defining visible topology or airflow.

## 8. Ditch privy

### Risk A — Image/geometry divergence

A generated or conceptual privy image can look perfect while saying nothing about cantilever length, floor opening, seat, rear wall or door topology.

### Good practice

- Use museum/heritage sources for the over-ditch type and seat function.
- Let the passport own exact plan, eaves, cantilevers, door and heart.
- Define the bank edge as an anchor instead of adding fake terrain.

### Risk B — fake door perforation

The first canonical door had a mathematical heart hole, but one shared perforated mesh produced a huge false triangular highlight. Smooth normals mixed the broad front face with the reveal.

### Bad response

- Change lighting or color.
- Retouch the PNG.
- Keep the mesh because the hole test passes.

### Correction

- Rebuild the leaf from four flat solid regions.
- Fill only the material outside the heart bounding box with hard-edged triangular prisms.
- Preserve a real `0.12 × 0.12` void and test an interior probe.
- Recapture all views.

### Risk C — detached hardware

Pre-capture tests found straps/latch `0.013 m` ahead of the door.

Correction: move hardware into the leaf/trim depth interval and require positive overlap.

### Risk D — roof penetration

High rear view showed side plates as raised ribs on top of the roof.

Correction: lower plates beneath the eave line until their top fibres engage the roof underside but do not cross the upper skin. Verify endpoints in roof-local coordinates.

### Risk E — fake direct drop

An absent rear wall is insufficient if the floor or seat remains solid.

Correction: use three floor pieces and three seat pieces around a clear rear drop. Probe through both layers.

### Tests that matter

- exact wall plan from output cladding;
- two grounded beam sections and anchor-to-free-end projection;
- each post bears on its corresponding beam;
- front/rear eaves and slope sign;
- door-leaf envelope and real facade opening;
- heart bounds, center and empty probe;
- hardware overlap;
- no rear wall inventory;
- direct-drop probe through floor and seat;
- seat top relative to finished floor;
- roof-local carrier engagement;
- `45 / 45` budget and current fixed views.

### General lesson

Tests and renders catch different truths. The successful loop required both, twice.

## 9. De Kat paint mill (M1)

The first proven exemplar of the whole method — a working windmill built as one canonical object with a frozen motion contract. Record: `games/make-a-mess/docs/dutch-polder/m1-de-kat/README.md` (historical per-milestone README, kept as history).

### Decisions worth copying

- the real sail span and the gallery deck level became the first dimensional anchors;
- the octagonal smock owns the main mass;
- the boat-shaped cap is built from sections, not a generic cone;
- the sails are construction — bearing spar, rear lath, crossbars and cloth — not a textured plane;
- the annex has its own three-dimensional volume and roof;
- the profile view honestly collapses the rotor to an edge: the proof the object is truly 3D rather than a set of facades;
- eight PNGs from one model with one hash;
- the absence of wind is verified as a data contract, not a chat agreement.

### General lesson

A machine's identity lives in its construction families. Anchors first, mass owners second, mechanism as a separate group with one pivot — and the forbidden dynamics written as testable data.

## 10. SR-6 Skat: primitive vocabulary and shared normals

### Risk

A renderer's normal pass can destroy the exact features the reference is made of.

### What happened (M6)

The body was a smooth loft whose sections shared vertices, so `computeVertexNormals()` averaged away every authored crease; the airframe was six separate discs joined by constant-radius tubes. No amount of added detail could reach the reference from that vocabulary — M6 could not be corrected in place and had to be replaced.

### Correction (M7 tooling)

- facets that own their vertices: adjacent faces never share a vertex, so a crease survives the normal pass;
- a plan triangulator for simple polygons with holes, whose splits are accepted only when the halves provably partition the parent — an unvalidated split silently papers a hole over with inside-out triangles;
- chamfered slabs, box-section members, faceted lofts, surfaces of revolution, and `facetVolume` — a divergence-theorem check that a solid is wound outward.

### General lesson

Choose the primitive vocabulary before detailing: a wrong vocabulary is a rebuild, not a fix. When creases define the reference, duplicate vertices per face. Validate every hole-split mechanically.

## 11. SR-6 Skat: member families, air gaps, livery and control lines

From M8–M10; measured record `games/make-a-mess/docs/sr6-skat/evidence-card-m10.md`.

### Open truss vs carved slab

The first M8 pass read the airframe as a single cut carbon plate. The higher-resolution reference showed deep box members with large voids between them. If the reference breathes, model the voids — they are structure, not background.

### Air gaps between nacelles

The first pass merged the forward ring pair into one figure-eight opening, which no ducted-fan airframe does. Nacelles clear each other by measured gaps, and fan diameter follows from that spacing.

### Different member families, protected by test

Front nacelles attach by round tubes (an inboard tube per side plus a forward tie); rear nacelles by broad swept carbon plates that also form the visible underside of the aft structure. A test rejects the two ever becoming the same member type: member family is identity, the same rank as a count.

### Livery boundary is a straight diagonal, not a form edge

Held on the maximum-beam crease, the bone/carbon boundary followed the body's own dip and the flank read as one undivided panel. Run as a straight diagonal from nose to transom it cuts the large flat panel the livery sits on; a test keeps the line strictly between the chine and flank rails at every station so it can never quietly collapse back onto a crease.

### «Остекление отдаёт свою верхнюю линию корпусу»

The glass hands its top line to the body: a coaming step lifts the deck to the canopy's own top height before the canopy ends, so glass and deck read as one continuous line rather than a glass bubble followed by a separate hump. The rejection list bans any deck that dips between the canopy top and the rear body.

### General lesson

On a vehicle, control lines and member families are invariants of the same rank as counts. Protect each with its own test, or a later "cleanup" will average them away.

## 12. RAX-8 Tonkawa combat hexacopter (C1 → C2)

Records: `games/make-a-mess/docs/combat-hexacopter/discrepancy-log-c2.md` and `evidence-card-01-combat-hexacopter.md`.

### No perimeter bumper cage

C1's continuous outer torque rails plus front/rear bridges formed a rectangular safety cage absent from the concept and explicitly rejected by the owner. The correction deleted every external perimeter member from canonical geometry — removal, not concealment — and the regression test asserts that no primary-frame part reaches the outboard rotor envelope. Every lift ring instead ties inward through two separated tapered root paths into the armoured core.

### Mirrored 18° yaw-axis splay

Both yaw tunnels sat parallel to the centreline; the concept demanded mirrored diagonal shoulder installations. The fix rotated the complete assemblies — tunnel, rim, hub, blades, stators and carriers — and the test recovers the mirrored −18/+18° plan cant from emitted geometry as equal/opposite angles with zero vertical delta.

### Joint seating

Braces that terminate "visually near" rings are detached hardware at vehicle scale too. Each root now ends in a tangential ring saddle and pin at the nacelle and a local doubler at the survival structure.

### General lessons

Direct owner corrections are Tier A and override the concept sheet. A mirrored installation is one parameterized assembly instantiated twice — never two hand-placed copies. "Delete the cage" class corrections must remove members from canonical geometry and be locked by a test that the class cannot return.

## 13. VX-8 Yaqui integrated-duct hexacopter: the loft, the panels and the cake

### Risk

A machine whose plan is dictated by a pack of units — six ducts here, two
engines and two nacelles on a transport — invites two mistakes at once. The
plan gets solved carefully and the **section gets forgotten**, so the body
becomes a plate of constant thickness with a stencil outline. Then, when the
section is finally authored as a loft, the emitted skin quietly flattens it
again, because a panel only carries the surface at its corners.

### Bad practice

- Author the deck as two flat flanges at fixed heights and cut the plan with a
  stencil. The owner's verdict on the first revision was one word: *торт* — a
  cake. Constant section, axis level with the chine, nose a wall.
- Emit the whole perforated deck as one plate. The ear-clipped skin owns
  vertices only on the contour and the wells, so a triangle runs from the
  transom to the cabin and the crown sags `0.16 m` at the axis while every
  dimension test passes.
- Lay the skin flush with the frames it covers. Every frame pokes through by
  three centimetres and in plan the whole dorsal reads as transparent.
- Lower a component into the body without asking what it crosses. Two dorsal
  tunnels shared a volume with the deck flange for three revisions; no test ever
  asked, and the defect surfaced only when an intake was moved.
- Build the body from an upper and a lower skin and call it closed. With no
  chine band the front projection looks straight through the hull edge.
- Arch a transverse frame across the cockpit. The pilot was not a volume any
  test knew about; the owner found the frame going through him by eye.
- Aim a rail at a joint and stop short of it. The canopy shoulder rail ended
  `0.44 m` from the vertex it pointed at.

### Correction

- Author crown, keel and lateral falloff as tables; make every member read them;
  forbid hand-typed heights in the file. Result: waist `0.95`, chine `0.45`,
  crown dropping `0.60` to the nose.
- Panel the skin on the features: bay boundaries at the frames, lane boundaries
  bracketing every channel and the cockpit. Thirty panels became ninety, and the
  residual chord fell to `0.08 m` — stated as a tolerance, not hidden.
- Offset the skin outward from the trusses by a real thickness.
- Sink recessed components into the surface itself — a trough in the deck under
  each channel — instead of letting shells interpenetrate.
- Close the perimeter with a chine band from upper skin to belly.
- Store the occupant as two zones, torso and head; split transverse frames into
  side pieces at cabin stations and close the ring above through the canopy bow.
- Land every rail on the vertex it points at.

### Tests that matter

- surface probe: axis depth exceeds chine depth by a stated margin; crown falls
  to the nose; belly lifts to the chine; no flange is planar;
- passport section values agree with probed ones within the panel chord;
- no deck or skin vertex lies inside any recessed component's bore;
- chine band reaches the deck above and the belly below at every sampled station;
- no part except the seat rails intrudes into either occupant zone; headroom is
  measured from the crown of the head with a helmet margin;
- every cutaway has an external twin with an identical camera;
- overview orthographics contain the recovered envelope;
- folded gear clears every duct and stays inside the plan;
- conformal stores: every roof vertex sits on the belly surface;
- transparency audited from both ends — every glazing-material part is a pane,
  every part in the glazing group is glass.

### General lesson

On a packed machine the plan is the easy half. Author the section as data,
panel the skin on the features that section describes, and probe the emitted
surface rather than its vertices — otherwise the tables, the tests and the
render will each describe a different object, and all three will look green.

## 14. Cross-case best practices

1. Write an evidence card before code.
2. Let sources own different claims instead of forcing one source to own everything.
3. Make hidden geometry inspectable with a rear/high/detail view.
4. Build load paths before surfaces.
5. Model negative space as missing material.
6. Derive exact spacing, slope and projection mathematically.
7. Test output geometry independently.
8. Use positive overlap for hardware.
9. Treat a visual artifact as a geometry/normal problem first.
10. Write discrepancy logs with causes and corrections.
11. Recapture every final view after the last change.
12. Freeze accepted objects immediately.
13. Keep adapter/placement separate from object acceptance.
14. Track per-object and total budgets continuously.
15. Show the user the same canonical geometry that will later enter the world.
16. Author a lofted body as control-line tables and let every member read them.
17. Panel a skin on the features it must describe, and state the chord you accept.
18. Turn every reviewer verdict into a named regression test in the same pass.
19. Decide where a stowed member goes before deciding where it hangs.

## 14. Cross-case worst practices

1. Use ImageGen output as construction documentation.
2. Infer hidden structure from a single perspective.
3. Add detail to disguise a wrong silhouette.
4. Use dark color as a hole.
5. Use interpenetration as joinery.
6. Leave rings, straps, hooks or handles microscopically detached.
7. Let rafters/plates pierce a roof and call them ribs.
8. Validate only exported constants rather than part bounds.
9. Increase tolerances instead of fixing contacts.
10. Retouch a PNG instead of correcting canonical geometry.
11. Recapture only one view after changing the model.
12. Register/place before visual approval.
13. Modify accepted neighboring objects during a local fix.
14. Spend the budget on hidden repetition and then delete defining structure.
15. Report intent without showing current rendered evidence.
16. Give a body a constant section and a stencil plan, then hope the skin saves it.
17. Sample vertices to measure the middle of a plate that has none.
18. Let two solids share a volume because no test was ever written to ask.
19. Type ninety degrees for a fold whose geometry needs a hundred and thirty.
