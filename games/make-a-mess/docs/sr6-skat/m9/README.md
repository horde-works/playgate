# SR-6 Skat — M7…M9: authoring tools, box space frame, faceted survival cell

All renders in this folder come from one code-native model, hash `c890322475bc`, against the measured stations in
[`../evidence-card-m10.md`](../evidence-card-m10.md),
built by `games/make-a-mess/src/content/objects/vehicles/sr6SkatObject.ts`.

## Why M6 could not be corrected in place

M6 was built from the wrong primitive vocabulary. Its body was a smooth loft
whose sections shared vertices, so `computeVertexNormals()` averaged away every
authored crease; its airframe was six separate discs joined by constant-radius
tubes. No amount of added detail reaches the reference from there.

## M7 — authoring tools

`games/make-a-mess/src/content/objects/authoring/solidBuilders.ts` adds the
three things the previous helpers could not express, proven by
`tests/solid-builders.test.mjs`:

- **Facets that own their vertices.** Adjacent faces never share a vertex, so a
  crease survives the renderer's normal pass. This is what makes a faceted
  wedge possible at all.
- **A plan triangulator for simple polygons with holes** (ear clipping, hole
  bridging by shortest proven-visible segment, diagonal split as the escape
  hatch). The previous `addPlanPlate` could only fan-triangulate a convex
  outline. Splits are accepted only when the two halves provably partition the
  parent, because an unvalidated split silently papers a hole over with
  inside-out triangles.
- **Chamfered slabs, box-section members, faceted lofts and surfaces of
  revolution**, plus `facetVolume` — a divergence-theorem check that proves a
  solid is wound outward instead of inside out.

## M8 — the airframe is an open box space frame

The first M8 pass read the reference as a single cut carbon plate. A
higher-resolution reference showed that to be wrong: the machine carries load
through deep box members with **large voids between them**, and the nacelles are
separate rings.

What the frame is now:

- two **side torque boxes** running the full length outboard of all three
  nacelles, with the cooling ribs the reference sheet calls out;
- **transverse frames fore and aft**, each a chamfered carbon panel with real
  lightening windows cut through it;
- **short webs in every nacelle-to-nacelle gap**, so the ring pairs stay tied to
  each other;
- **eight independent roots into the cockpit core**, landing in visible
  clevises. The nacelle-to-nacelle path and the cockpit path are separate: a hit
  that takes out the cell does not release the nacelles from one another.

Each nacelle is one closed revolved cross-section — bell-mouth inlet, throat,
exit diffuser, chamfered outer wall — with a machined rim proud on top.

Nacelles now **clear each other**: 74 mm between the forward and middle rings,
779 mm between middle and rear. M8's first pass merged the forward pair into one
figure-eight opening, which no ducted-fan airframe does. Forward fan diameter
follows from that spacing (1.09 m); the rear/front disc ratio stays at 1.34, the
value the mixer assumes.

## M9 — the body is a run of flat surfaces

The contours are not rounded. Only the transitions are, and they are rounded by
narrow chamfer strips rather than by curving the panels. Sections therefore sit
at the creases instead of being sampled along a curve: five rails per side plus
two centreline rails give the top panel, deck chamfer, flank, chine chamfer,
belly bevel and flat bottom.

Stations are no longer estimated by eye. They are read off the reference's three
projections and anchored to the rotor rows, which the flight model fixes:

- nose tip at Z +2.34, level with the front rings;
- **the glass starts at Z +1.07 — exactly the leading edge of the second rotor
  row**;
- the canopy tops out at Z +0.55 at Y 1.71 and **never descends again**;
- **the glass hands its top line to the body**: a coaming step lifts the deck
  from the sill to that same 1.71 between Z 0.00 and −0.12, before the canopy
  ends at −0.07, so the two read as one continuous line rather than a glass
  bubble followed by a separate white one;
- the **rollover / parachute hump runs level from Z −0.12 to −0.95 and is wider
  than the cockpit**: maximum beam 0.520 aft of the canopy against 0.399 under
  it;
- aft of the bay the rear body has **its own profile** — a shoulder break at
  Z −1.25 and a long shallow run — and it **carries all the way to the tail
  beam at Z −2.18**, where the transom vents sit, instead of being chopped off
  in mid-air.

In plan — traced off the 3/4 view, because the sheet's own top projection draws
four ducts on a six-duct machine — the outline is **one straight taper** from a
blunt nose to the widest station aft of the cockpit, closing on a **broad square
transom** with two vents rather than a point. Maximum beam is 1.04 m against
4.92 m overall span: roughly a fifth, where the previous pass sat near a
seventh and read as a spine bolted to a frame.

Nine of those invariants are asserted in `tests/sr6-skat.test.mjs`, including the glass
station being derived from the rotor row rather than typed in.

Underneath, nose and tail are both **bevelled down toward the battery bay**,
which is the lowest and flattest part of the machine and hangs below the frame
where it can be seen.

The underside is a different material, not a different paint: **bolted steel
plate** over both bevels and the bay, with visible bosses along the edge. It
compiles to `steel` in the world, so the belly survives impacts the composite
shell does not. The mass it costs is paid for in `airVehicles.ts` — engine power
62 → 76, so thrust-to-weight does not drop.

## Cockpit and canopy

The cabin-to-cockpit transition is authored: a dark coaming steps the white deck
down into the glazing, sill rails run the length of the opening, and a rear
frame arch closes the canopy against the deck.

Inside is a cockpit, not a mannequin: seat pan, back, bolsters, rails, harness
and buckle; instrument shroud with a screen; side consoles and throttle levers;
a control column with a yoke and grips; rudder pedals. Glazing is smoked
blue-black rather than window glass.

**Front and rear nacelles are attached by different members**, as on the
reference: the forward units by round spars — an inboard tube per side plus a
forward tie into the front cross frame — and the aft pair by broad swept carbon
plates with a lightening window, which also form the visible underside of the
rear structure. A test rejects the two ever becoming the same member type.

The forward frame has a centre slot the cell's chin drops through, so the body
passes between frame members instead of intersecting them.

Landing gear is a real assembly with its own materials: a machined trunnion
bolted under the torque box, a tapered two-stage carbon main strut, a separate
drag link, an anodised scissor across the sliding joint, a polished oleo with a
gland, and a pivoting pad on its own bearing.

Lower contours: the side torque boxes carry a stepped lower rail, and the body's
own flat bottom is the floor — there is no separate pan.

## Colour does its own work

Five fields, one bright line, one accent — and every boundary sits on a control
line of the form, not on a painted edge:

| field | surface it owns |
|---|---|
| bone composite | deck, shoulder and the flank above the livery line |
| carbon | frame, nacelles, and the flank below the livery line |
| steel | the flat bottom over the battery bay |
| smoked glass | canopy |
| dark recess | voids, louvre wells, hatches |

**The bone/carbon boundary on the flank is a straight diagonal**, running from
Y 1.020 at the nose to Y 1.150 at the transom. Held on the maximum-beam crease
it followed the body's own dip and the flank read as one undivided panel; run
straight, it cuts the large flat bone panel the livery sits on and drops the
carbon below it. A test proves the line stays strictly between the chine and
flank rails at every station, so it can never quietly collapse back onto a
crease.

The **bright line** is reserved for the top edges of primary structure: the
nacelle rims and a polished cap running the full length of each side torque
box. That line is what draws the silhouette in profile and in plan, so it is
structure-coloured rather than decoration.

**Orange is never a shape.** It marks rotor sense, service points, release
handles and warning triangles only. The six orange hub discs of the previous
pass were the largest orange area on the machine and read as toy parts; hubs are
machined metal now, and the orange moved to a **tip band carried in the blades'
own vertex colours**, so it rides the blade through spin-up without costing a
second rigid body.

## Budget

307 → 267 parts, 12 320 → 30 400 triangles. Detail moved into vertices, not into
rigid bodies: each duct guard is one mesh instead of fifteen breakable pieces.

## Protected and unchanged

Rotor station coordinates, spin senses, power classes, `throttle:0..5`, route
plans and world placement. Engine power was raised deliberately, on request, to
carry the steel belly.

## Residual discrepancies — the M10 list

- the nose is a long flat blade; the reference spear has more section depth
  behind the tip;
- the plan outline has not yet been measured against the reference's top view
  with the same rigour as the profile;
- hub, blades and guard are still M6 geometry: the reference has a tall machined
  hub with a cone spinner, wider swept blades and a finer mesh;
- materials are flat greys; carbon weave, brushed titanium and their optical
  response are M11, and the Object Lab has no environment map, so smooth glass
  currently reads matte.

Status: **ready for visual acceptance** of the frame architecture and the cell's
control lines.
