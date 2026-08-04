# SR-6 Skat — evidence card M10

Measured off the three orthographic projections on the reference sheet (3/4,
top right, side bottom left) plus the two callout insets. Every station is
anchored to the **rotor rows**, which are fixed by the flight model, so the
reference proportions transfer without needing the sheet's absolute scale.

## Fixed anchors (never authored, never guessed)

| anchor | Z |
|---|---|
| front row centre | +1.750 |
| front row leading edge | +2.370 |
| mid row leading edge | +1.070 |
| mid row centre | +0.450 |
| mid row trailing edge | −0.170 |
| rear row leading edge | −0.944 |
| rear row centre | −1.650 |
| rear row trailing edge | −2.356 |

Nacelle outer radius 0.620 forward / 0.706 rear. Rotor planes 0.88 / 0.90 / 1.06.

## Cabin stations read off the reference

| station | Z | source |
|---|---|---|
| nose tip | +2.340 | side + top: the spear point reaches the front rings |
| forward body break | +1.850 | side: the nose blade stops rising |
| windscreen base | **+1.070** | **the glass starts exactly where the second rotor row starts** |
| canopy peak reached | +0.550 | side: top line stops rising |
| canopy top level run | +0.550 → 0.000 | side: **the glass rises and never comes back down** |
| coaming step | 0.000 → −0.120 | side: the deck climbs to the glass's own top |
| canopy rear frame | −0.070 | swallowed by the step, so the top line is continuous |
| hump level run | −0.120 → −0.950 | inset: level with the canopy peak, Y 1.700 |
| shoulder break | −1.250 | side: the rear body's own profile starts here |
| tail | **−2.180** | side: the body runs out to the tail beam at −2.22 |

## Cabin invariants

1. **The glass does not descend after its peak.** Canopy top and rear-body top
   are one horizontal line at Y ≈ 1.71. A canopy that domes and falls back to a
   low rear deck is the wrong machine.
2. **The rear cabin is not smaller than the front.** Maximum beam is *aft* of
   the cockpit: flank half-width 0.520 at Z −0.95 against 0.398 at Z 0.00.
3. The rear volume carries the rollover/parachute hump: hatch on top, an angled
   louvre in the flank, an orange triangle below the rear facet.
4. Nose is a blunt wedge in plan and a thin blade in profile.
5. Under-body: nose and tail bevel down to the battery bay, which is the lowest
   and flattest element and hangs below the frame.
6. **The glass hands its top line to the body.** The deck reaches the canopy's
   own top height *before* the canopy ends, so the two read as one line. A body
   whose deck sits below the glass and picks up again later is a separate
   bubble, not a cabin.
7. **The rear body reaches the tail beam.** It is not chopped off in mid-air,
   and between the bay and the beam it has its own profile: a shoulder break at
   Z −1.25 and a long shallow run, not a smooth dome.
8. **The bone/carbon boundary on the flank is a straight diagonal**, not the
   maximum-beam crease. It runs from Y 1.020 at the nose to Y 1.150 at the
   transom, slightly rising aft, and stays strictly between the chine and flank
   rails at every station — so it cuts across the flank instead of following the
   body's own dip. The large bone panel above it is where the livery sits.

## Plan outline — read from the 3/4, not from the sheet's top view

The sheet's top-right projection is not self-consistent (it draws four ducts on
a six-duct machine), so the plan is taken from the 3/4 view, where the body's
plan edges can be traced against the frame. Three invariants come out of it:

1. **One straight taper.** Flank half-width runs on a single straight line from
   the nose to the widest station — the plan edge is one facet, not a spindle.
   Nose 0.100 → widest 0.520.
2. **The body is about a fifth of the span.** Maximum beam 1.04 m against 4.92 m
   overall. A narrower fuselage reads as a toy fixed to a frame.
3. **The transom is a broad square cut, not a point.** Flank half-width at the
   transom stays above 85 % of maximum, and the transom carries two rectangular
   vents.

All three are asserted in `tests/sr6-skat.test.mjs`.

## Nacelle attachment — front and rear differ

- **Front:** round tubes. One inboard tube per side from the fuselage flank to
  the nacelle, plus a forward tie into the front cross frame. Visible as
  cylinders crossing the open bay in the 3/4 view.
- **Rear:** broad swept carbon plates, not tubes. A wide chamfered panel runs
  from the rear body's flank out to each rear nacelle and forms the visible
  underside of the aft structure.
- **Outboard, both:** one continuous side torque box passes all three nacelles.

## Side torque box (callout inset)

Deep box, polished metal top cap running nearly the full length, a long
recessed louvre grille in the outboard face with an orange accent line, and a
chamfered lower edge.

## Rejection list — conditions that fail the object even if the silhouette looks plausible

- canopy that starts forward of the mid row leading edge;
- canopy top line that descends aft of its peak;
- rear body narrower or shorter than the cockpit;
- front and rear nacelle attachments built from the same member type;
- nacelles that intersect each other;
- any body panel rounded rather than faceted between its creases;
- a plan edge that curves between the nose and the widest station;
- a tail that tapers to a point in plan, or one that stops short of the tail
  beam;
- a deck that dips between the canopy's top and the rear body;
- a flank that is one undivided bone panel, or whose bone/carbon boundary
  follows a form crease instead of a straight line.
