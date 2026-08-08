# Discrepancy log — `d3a-dorsal-skin`

Canonical revision `duct-hex-d3a-dorsal-skin-2026-08-08`, model hash
`cad7065c1bcd`, 503 parts against a ceiling of 820 — 416 core, 52 skin.

## Fourth owner direction: the top silhouette

> «Прямоугольные конструкции на входах убрать вовсе. За ними стоит трапеция —
> её вершины соединить с конечными вершинами кабины, вторыми левой и правой от
> центрального продольного элемента, а центральный — с серединой верха трапеции.
> Тем самым возникнут большие воздуховоды слева и справа от кабины сами собой…
> У тебя идеальный силуэт корпуса, но нет силуэта верха.»

| Direction | Correction | Regression proof |
| --- | --- | --- |
| drop the rectangular intake frames | both lips and all eight stays deleted | test fails on any part whose id contains `intake-lip` or `intake-stay` |
| tie the trapezoid's top corners to the cabin's second longitudinal member out from the crown | two `transition-spine` members run from each **shoulder** rail up to the hump corner over its channel | test recovers each member's ends: low end on the shoulder, high end on the hump crown, plus an explicit check that the shoulder sits above the sill |
| tie the crown rail to the middle of the trapezoid's top | the crest chain now passes through the trapezoid station | the crest test already owned this: it must pick up the canopy at the cut and carry on |
| skin what the trusses describe | armour patches over both channel humps, over the crest between them, and across the transition to the cabin — 52 plates in a `hull-dorsal` group | tests require skin above each channel, a valley between the humps, and the transition wedge to open toward the mouth |
| **correction:** the first attempt attached to the sills, one row too low | the owner named the consequence before any render did: "у тебя сейчас спад из тоннеля под кабину" — the roof dived from the channel down under the cabin, so the transition read as a ramp and no central passage existed. Re-attached to the shoulders: the roof stays up, a central tunnel carries the cabin's line aft, and the side ducts gain a real forward opening (`0.42 m` where it used to be zero) | test measures the duct at the mouth (`0.88 m`) against its front face (`0.42 m`), and probes the central tunnel for emptiness at two stations |
| panels butt-joined to the cabin instead of lying over it | a centre strip is now laid **over** the canopy crown from the windscreen bow, past the cut and into the transition, so the cabin and the dorsal centre are one surface rather than two parts that meet | the strip's stations read `canopyCrownAt`, the same table the bows read |
| a cabin rail stopped short of the vertex it pointed at | the shoulder rail ended at the sill station, `0.44 m` away from the cut frame's shoulder vertex it was aimed at; it now starts on that vertex | the transition test recovers the shoulder point and requires the rail's end on it |
| seam between the transition roof and the dorsal skin | the roof was lofted to its own corners while the skin used the section points; they no longer merely meet — the roof is lofted **onto the section's own points** at the trapezoid | shared vertices by construction |
| the intake had no lower edge | a member runs from the cabin's aft sill along the hull surface to the foot of the trapezoid: the duct's outer floor line, and what finishes the intake visually | part exists per side with its ends on the sill and the trapezoid foot |
| a hole under the central tunnel | the tunnel's inboard wall is carried forward to the cabin as a plate, separating the side duct from the central passage | central-tunnel probe: the passage must be empty and at least `0.45 m` tall |
| the hump was an open box fore and aft | end faces closed everywhere except the two real openings — the channel mouth and its exhaust | inventory test caught the first attempt: snapping to the nearest section vertex produced a zero-area plate where the skin already meets the deck |
| the transition zone was lofted in several plates | it is now **one polygon per side**, from the trapezoid to the cabin and no further, on the four vertices that already exist | test requires exactly one roof part per side |
| the cabin was cut off square across the front, fighting the hull's wedge plan | the canopy runs forward to a point of its own at `z = 3.42`: the plan half-width tapers into it, both sills converge on it through new nose ribs, and the deck opening and the tub follow | test requires each nose rib to reach past `z = 3.35` and the pair to converge inside `0.16 m` of the axis |
| the front projection showed straight through the hull edge | there was no side at all — the two deck flanges were plates with open air between them. A chine band now closes the perimeter from deck to belly along the same contour | test walks five stations and requires the band to reach the deck above and the belly below at each |
| the dorsal read as transparent in plan | the skin was level with the trusses, so every frame poked through it by a few centimetres | the skin is lifted `0.07 m` and now lies ON the trusses, which is also how a real panel sits |
| large air ducts beside the cabin | left over by construction: floor is the deck trough, inboard wall is the cabin side, roof is the transition patch | test probes the layer above the deck beside the cabin for emptiness, and measures the wedge from the emitted roof — `0.88 m` at the mouth against `0.24 m` at the cabin |

## Third owner direction: end the cabin, don't taper it away

> «Конец просится продолжиться до хвоста уже корпусом без ската кабины к
> корпусу + диагональный срез кабины, а не по нормали к корпусу + обыграть
> переход на хвосте лёгким прогибом между тоннелями + переход от кабины гребнем
> наложить на гребни и дать там место воздухозаборникам.»

Taken as given, and it turned out to be four separate contracts.

| Direction | Correction | Regression proof |
| --- | --- | --- |
| no cabin-to-body slope aft | `CANOPY_CROWN` holds `2.12` to the cut; a new `DORSAL_CREST` table carries the same height aft to the tail | test asserts the crest picks up the canopy within `0.02 m` at the cut and never drops more than `0.12 m` behind the cabin |
| diagonal cut, not a station normal to the keel | the cut frame's points ride a raked plane: its top stands `0.6 m` aft of its foot | test recovers the frame's own vertices and requires `30°–60°` of rake |
| a gentle dip between the tunnels aft | the crest sinks below the tunnel tops from `z = −1` and lands at `1.82` on the transom | test requires the crest below the tunnel top aft, above `1.85`, and monotonically falling |
| lay the transition over the ridges and make room for the intakes | three transverse members ride from the deck over each tunnel to the crest; each tunnel gets an armoured intake lip on four stays, and the mouth moved forward to `z = +0.55` | tests require each overlay to reach past both tunnels and above their tops, each lip to be larger than its tunnel, and the mouth to be empty |

### What the intake exposed

Putting the mouth where it belongs proved the tunnels had been **crossing the
deck flange since they were lowered**: their bottom sat `0.26 m` below the deck
top, two solids sharing one volume, and no test had ever asked. The deck now
carries a real trough under each channel, fading in ahead of the mouth so the
surface rises in front of the intake exactly as the concept shows.

The trough then exposed a second, subtler lie: a channel crossed by one wide
deck panel is interpolated flat, so the emitted deck lost the trough the tables
described. The deck is now panelled into nine lanes whose boundaries bracket the
cabin and straddle each channel — 90 panels instead of 30. Both faults have
tests: no deck vertex may lie inside a tunnel throat, and the deck under a
channel must sit at least `0.15 m` below the deck beside it.

Earlier defects, fixed before this revision and kept here because they are the
same class: band frames emitted as stubs (span helper returned zero where the
contour has no vertex); orthographic views cropped by the capture frame; nose
and transom contour ends carried by nothing; dorsal pair reading as two loose
logs.

## Open, and deliberately open

- **The dorsal channels are not yet recessed.** Both tunnels stand on their
  saddles above the crown. The half-buried read belongs to the armour hump of
  the hull revision. If the hump cannot produce it, the tunnels move and the
  saddles follow — not the other way round.
- **The deck falls from crown to chine on one straight ramp.** The concept
  terraces that fall into faceted steps; the steps are skin, and skin is the
  next revision.
- **Nothing touches the ground.** The core floats at `y ≥ 0.44`; the four legs
  and the contact chain arrive with the rig. The trunnions that will carry them
  exist and are tested against the rail today.
- **Registered pixel fit is not claimed.** The concept lives in the
  conversation, not in `reference/`.
- **No world placement, no adapter, no prefab.** By contract, not by omission.
 Supersedes `d1-core`, whose captures were
deleted rather than kept: the owner rejected that shape on sight and nothing in
it is worth preserving as a comparison.

## Owner verdict that drove this revision

> «Нет того агрессивного наката сзади вперёд… как будто каждая боковая плита
> одинаковой высоты и центральная продольная ось на такой же высоте, как и
> бока… это кусок теста, торт. Летательные аппараты не такие.»

Correct, and the fault was in the core, not in the missing skin. `d1` built both
deck flanges as flat planes at fixed Y and cut the plan with a stencil, so every
section from nose to transom had the same depth and the axis stood no taller
than the chine. An airframe is a loft.

| View and symptom | Physical cause | Owner | Correction | Regression proof | Result |
| --- | --- | --- | --- | --- | --- |
| profile, front: constant-depth slab, axis level with the chine, nose a wall | both flanges were planes; the plan was a stencil | deck flanges | crown line and belly line as station tables plus a lateral ramp; `deckTopAt`/`bellyAt` now own every Y in the file — flanges, ring plates, frame caps, rail, keels, trunnions | new test probes the emitted surface: axis depth must exceed chine depth by `0.35 m`, crown must fall `0.4 m` to the nose, belly must lift `0.1 m` to the chine, and no flange may be planar | corrected: waist `0.95`, chine `0.45`, nose `0.26`, crown drop `0.60` |
| probe: the deck sagged `0.16 m` below its own crown at the axis | one plate with seven holes; the ear-clipped skin owns vertices only on the contour and the wells, so a triangle ran from the transom to the cabin and the loft was interpolated away | deck emitter | the deck is emitted bay by bay, bounded by the frame stations, each well wholly inside one bay | the same surface probe, with a `0.10 m` chord tolerance stated as a tolerance rather than hidden | corrected: residual `0.08 m`, which is the panel chord between frames |
| build failure: `triangulatePlan stalled` | the cabin opening came within `0.04 m` of the front band frame, and two `0.022` chamfers met inside that gap | cabin hole | opening pulled back to `z = 1.16`; the roll hoop stays at `1.05` | the model no longer builds if a hole reaches a bay boundary — the stall is the test | corrected |

## Second owner catch: the cell did not describe its own cabin

> «Убедись, что силовые конструкции кабины соответствуют конечной форме кабины —
> не уверен, что сейчас так.»

It was not. The cell was two arches at the ends of a hole, a pair of longerons
buried `0.23 m` below the deck they were supposed to edge, and — worst — the
`z = +2.02` transverse frame arched straight through the volume where the pilot
sits.

| View and symptom | Physical cause | Owner | Correction | Regression proof | Result |
| --- | --- | --- | --- | --- | --- |
| cabin detail: members point nowhere, no line follows any canopy | the canopy had no shape yet, so the cell was authored against nothing | survival cell | the canopy's control lines (`CANOPY_CROWN`, `canopySillAt`) now live in the core; three bows, two sills, two shoulder rails and the crown rail are all emitted from them, and the hull will glaze between the same lines | test recovers each bow's crown from the emitted part and compares it against the canopy line; sills must lie on the deck crown and fall forward with it | corrected |
| cabin detail: transverse frame crosses the cabin at `z = +2.02` | centre frames were emitted as full arches at every station | frame grid | at a cabin station the frame is two side pieces from the sill outboard; the ring closes above through the canopy bow and below through the tub | test walks every part against a two-zone occupant volume (torso and head) and fails on any trespass | corrected |
| head clearance was `0.03 m` under the crown | the canopy peaked behind the head instead of over it | canopy crown table | peak broadened and moved forward: `2.15` at `z = 2.10`, `2.10` at `z = 2.35` | test requires `0.08 m` of helmet clearance at three stations, measured from the crown of the head | corrected |

## Third owner direction: end the cabin, don't taper it away

> «Конец просится продолжиться до хвоста уже корпусом без ската кабины к
> корпусу + диагональный срез кабины, а не по нормали к корпусу + обыграть
> переход на хвосте лёгким прогибом между тоннелями + переход от кабины гребнем
> наложить на гребни и дать там место воздухозаборникам.»

Taken as given, and it turned out to be four separate contracts.

| Direction | Correction | Regression proof |
| --- | --- | --- |
| no cabin-to-body slope aft | `CANOPY_CROWN` holds `2.12` to the cut; a new `DORSAL_CREST` table carries the same height aft to the tail | test asserts the crest picks up the canopy within `0.02 m` at the cut and never drops more than `0.12 m` behind the cabin |
| diagonal cut, not a station normal to the keel | the cut frame's points ride a raked plane: its top stands `0.6 m` aft of its foot | test recovers the frame's own vertices and requires `30°–60°` of rake |
| a gentle dip between the tunnels aft | the crest sinks below the tunnel tops from `z = −1` and lands at `1.82` on the transom | test requires the crest below the tunnel top aft, above `1.85`, and monotonically falling |
| lay the transition over the ridges and make room for the intakes | three transverse members ride from the deck over each tunnel to the crest; each tunnel gets an armoured intake lip on four stays, and the mouth moved forward to `z = +0.55` | tests require each overlay to reach past both tunnels and above their tops, each lip to be larger than its tunnel, and the mouth to be empty |

### What the intake exposed

Putting the mouth where it belongs proved the tunnels had been **crossing the
deck flange since they were lowered**: their bottom sat `0.26 m` below the deck
top, two solids sharing one volume, and no test had ever asked. The deck now
carries a real trough under each channel, fading in ahead of the mouth so the
surface rises in front of the intake exactly as the concept shows.

The trough then exposed a second, subtler lie: a channel crossed by one wide
deck panel is interpolated flat, so the emitted deck lost the trough the tables
described. The deck is now panelled into nine lanes whose boundaries bracket the
cabin and straddle each channel — 90 panels instead of 30. Both faults have
tests: no deck vertex may lie inside a tunnel throat, and the deck under a
channel must sit at least `0.15 m` below the deck beside it.

Earlier defects, fixed before this revision and kept here because they are the
same class: band frames emitted as stubs (span helper returned zero where the
contour has no vertex); orthographic views cropped by the capture frame; nose
and transom contour ends carried by nothing; dorsal pair reading as two loose
logs.

## Open, and deliberately open

- **The dorsal channels are not yet recessed.** Both tunnels stand on their
  saddles above the crown. The half-buried read belongs to the armour hump of
  the hull revision. If the hump cannot produce it, the tunnels move and the
  saddles follow — not the other way round.
- **The deck falls from crown to chine on one straight ramp.** The concept
  terraces that fall into faceted steps; the steps are skin, and skin is the
  next revision.
- **Nothing touches the ground.** The core floats at `y ≥ 0.44`; the four legs
  and the contact chain arrive with the rig. The trunnions that will carry them
  exist and are tested against the rail today.
- **Registered pixel fit is not claimed.** The concept lives in the
  conversation, not in `reference/`.
- **No world placement, no adapter, no prefab.** By contract, not by omission.
