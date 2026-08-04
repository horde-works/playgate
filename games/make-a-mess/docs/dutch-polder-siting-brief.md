# Dutch Polder — siting, parcels and orientation brief

## Status update — the seating contract landed, and two objects moved

Everything below is still the work order. What has actually been built, and
where it overrides the text:

- **Levelled ground is now a plot, not a circle.** `LandscapeFlatPad` carries
  `yaw` and `halfExtents`; every pad is the object's own ground-contact
  footprint — read from its canonical object study by
  `dutchPolderGroundFootprint` — plus a working margin. The old pads were
  circles of `reserve.radius * 0.42`, which for the Zaan house meant 3.2 m of
  levelled ground under an eleven-metre brick plinth.
- **`DUTCH_POLDER_BUILDING_PLOTS` owns position, bearing and datum.** Scene
  placements, landscape pads, reserve circles and the ends of mandatory routes
  are all derived from it, so they can no longer drift apart.
- **A route may no longer re-cut levelled ground.** Every one of the six
  objects had a groove of 0.15–0.37 m under its plinth, cut by the mandatory
  route that ended inside the building. The corridor grade is now damped by the
  pad weight, so the ramp rises to meet the yard across the pad's shoulder.
- **§4.4 is overridden: H1 moved to the south bank**, `(-54, 26)`, bearing
  341.6°, on the polder datum. Holding `(6.3 m from C1)` was not survivable:
  the house origin stood inside the channel's own excavated bank (7.7 m of
  bed + bank + terrace), a third of the plinth hung up to 2.25 m in the air,
  and the front door opened onto a 1.91 m drop. It now fronts the water square
  (0.0° off the perpendicular of the reach it faces), keeps a 274 m² parcel for
  the hamlet to grow into, and its gate stands 11.1 m from the B1 landing. The
  hamlet of §4.4 still belongs on that lane; `west-red`, `west-yellow` and the
  two western field fences were removed rather than nudged, and the western
  field pattern is re-cut with it.
- **§4.5 is overridden: H2 moved 8 m forward along its own axis** to
  `(27.49, 36.19)`, bearing unchanged. Its rear tail plinth stood 1.55 m from
  the C4 centreline — inside a 3.8 m water prism — and hung 1.09 m.
- **Detectors 14 and 16 exist now**, plus a third: the design surface under
  every building is its own pad to the millimetre, no pad may reach into a
  channel bed or bank, and a route ends at the declared gate.
- **Next instance of the same defect, measured but not fixed:** all ten bridge
  approach ends are authored at 0.92 / 0.80 / 1.10 while the ground under them
  samples 0.42–0.62, and `B3`'s south landing sits in the channel bed.

Status: **work order, not yet implemented.** This document extends
[`dutch-polder-brief.md`](./dutch-polder-brief.md) and does not replace it. The
shoreline polygon, the six terrain datums, the natural 1:1 scale, the six
canonical object passports and the acceptance taxonomy of that document all
stay in force. What changes here is **where the objects stand, which way they
face, and what surrounds them**.

Read before starting: the repo skills `world-building` and
`architectural-scene-authoring`, then §4 and §6 of the existing brief. Every
number below is marked with the same confidence taxonomy the existing brief
uses: `published` / `derived` / `calibrated` / `estimated` / `authored`.

---

## 1. The problem being fixed

The compiled polder reads as an exhibition of windmills rather than a working
landscape. That is not a taste judgement; it is measurable in the current data
([`dutchPolderDocument.ts:406-413`](../src/content/scenes/dutchPolder/dutchPolderDocument.ts#L406-L413)):

| Symptom | Measurement | Why it reads as a museum |
| --- | --- | --- |
| Objects face the visitor | mean front bearing of the four mills is **179.8°**; the spawn is `[0, 2, 50]` looking north | all four machines are turned square to the entry camera, like objects on plinths |
| Machines separated from their resource | distance to the nearest water: M2 **36.9 m**, M3 **38.8 m**, M1 **26.8 m**, M4 **11.4 m** | a mill further from its resource than its own sail span cannot be doing work |
| One band of objects, one band of land | mills at z = −13, −25, −28, +4; canals, fields and the farm at z = +9…+50 | the north half is the display case, the south half is the diorama floor |
| No shared wind | bearings 152° / 168° / 194° / 205°, spread **53°** | millers turn every cap into the same wind; a 53° spread is only possible if the mills are ornaments |
| Wind contradicted by the sun | [`windState.ts:14`](../src/game/windState.ts#L14) is a south-westerly, but the four mills stand 20–73° off it | the world already blows a wind the mills ignore |
| Compass derived from the ornaments | `DUTCH_POLDER_EAST_VECTOR` is the mean rotor normal ([`dutchPolderDocument.ts:415-437`](../src/content/scenes/dutchPolder/dutchPolderDocument.ts#L415-L437)), giving "east" ≈ `+Z`, i.e. the sun rises in the world's south | the compass follows the mills instead of the mills following the compass; it contradicts §3 of the existing brief (`map north = −Z`) |
| Buildings without parcels | H1 stands alone in meadow; H2 is a roof on open grass; both houses have paths that end at the building origin | in the Netherlands a building is the centre of a bounded plot, never a free object on turf |
| Fields as postage stamps | seven beds at yaws −0.24…+0.16 rad, scattered 18–86 m from the farm, floating in grass | real bulb land is ditch-bounded parcels of parallel strips, filled edge to edge |

---

## 2. Reference: how these things really stand

This chapter is the part the implementing agent must not paraphrase away. The
placement rules in §4 are consequences of it.

### 2.1 The Zaan industrial mills are factories on a bank

The Zaan region ran roughly 600 industrial windmills in the 18th century —
paint, oil, sawing, paper, mustard, snuff. They were not agricultural. Two
consequences dominate their siting: (`published`, Zaanse Schans / Zaansche
Molen sources already cited in the parent brief)

- **Everything moves by water.** Raw material arrives by barge and product
  leaves by barge. The mill therefore stands directly on the bank with its own
  loading platform, hoisting door and stack yard; the working yard is on the
  landward side and the water side is kept clear for mooring.
- **They stand in a row along the water, unevenly spaced.** A row is not the
  problem in the current scene — a row *facing away from the water* is. The
  Zaanse Schans row works because every mill has its back to the land and its
  loading face to the river.
- **De Kat** (the M1 source) is an octagonal paint mill standing on the east
  bank of the Zaan; it grinds chalk and tropical dye-woods and sells pigment on
  site. Nothing about a paint mill wants height — it wants a quay. (`published`)
- **Het Jonge Schaap** (M3) is a hexagonal smock sawmill: logs are floated to
  the mill, hauled out of the water up a slipway onto a long deck, sawn by
  reciprocating frames and stacked as timber in the yard. The long sheds and
  the log deck are one axis, and that axis points at the water. (`published`)
- **De Gekroonde Poelenburg** (M4) is a paltrok: the *entire body* turns on a
  wooden roller ring. Because the body swings, the ground around it must be a
  ring — log stacks, saw floors and paths are arranged annularly, never on one
  fixed side. It too was fed by water. (`published`)

### 2.2 The wipmolen is a pump, and a pump has a fixed topology

The M2 source family (Poldermolen Oudegein) is a drainage mill. Its siting is
not a preference, it is plumbing: (`published` for the mechanism, `estimated`
for the general arrangement, to be re-verified against a poldermolen source
before this document is treated as final)

- The mill stands **on the boundary** between the low polder it drains and the
  higher **boezem** canal that carries the water away to sea.
- Water path: field ditches (*sloten*) → collector (*wetering*) → the mill's
  inlet → the **scoop wheel** (*scheprad*, here 4.72 m × 0.30 m) turning in a
  narrow **wheel race** → over the lip into the boezem.
- The race ends in a **flap door** (*wachtdeur*) that closes by itself when the
  mill stops, so the boezem cannot run back into the polder. Without it the
  polder floods the moment the wind drops.
- **The two water bodies are at different levels and never openly connected.**
  Every other crossing is a gated culvert (*duiker met schuif*). This is the
  single most legible piece of polder logic and the scene currently has none of
  it: `C3` runs straight into `C1`, which would drown the polder.
- Where one mill cannot make the lift, mills are chained in a *molengang*
  (Kinderdijk). Not needed here: our lift is small, see §5.
- The miller **lives in the mill**: it has a kitchen garden, a shed, a peat
  stack, a privy, a rowing boat and a jetty. It is reached by a footpath along
  the dike, not by a cart road.
- A wipmolen is a **ground-sailer**: the sail tips pass about 0.40 m above the
  ground *at the mill itself*, rising quickly outward (see the envelope in §4.3).
  The apron immediately around it is therefore lethal and physically bare — no
  fence, no bush, no path, no person — while the yard beyond stays usable. Real
  mill yards show this as a clean disc of short grass at the foot of the mill.

### 2.3 The stolp farm is a parcel, not a building

(`published` for the construction — Beemsters Wapen monument record — and
`estimated` for the yard arrangement, which is standard North-Holland practice)

- One huge pyramidal roof over a square plan; internally the four-post timber
  *vierkant* carries the roof and encloses the hay store. Living quarters at the
  front, byre and threshing floor around the frame.
- The farm sits on a raised **werf** surrounded by its own **ring ditch**,
  entered over a bridge or a dam with a culvert. The ditch is the property line
  and the drainage in one.
- In front: a formal **voortuin** behind a low fence or clipped hedge, with a
  straight path to a front door that is used for weddings and funerals only. The
  family enters at the side.
- Behind and beside: the working **erf** — hay barrick, muck heap on a kerbed
  slab, milk house on the cool side, cattle drinking ramp into the ditch.
- An **orchard** of high-stem fruit trees on a wide grid, fenced against cattle.
- A **windsingel** — a double row of elm or poplar on the exposed side, usually
  north and west — shelters the yard. The front stays open to the road, because
  the front is for display.
- The **hooiberg** (hay barrick): four or five oak poles with a movable
  pyramidal roof raised on pins as the stack grows. It is the most instantly
  Dutch object in any farmyard and the scene has none.

### 2.4 Zaan houses stand in a lane, gable to the water

(`published` for the construction — Het Jagershuis and the Zaanse Schans timber
history — `estimated` for the lane grain)

Timber-framed, painted green with white trim, **gable-end to the street or the
water**, on narrow plots in a row along a dike or a lane, each door reached by
its own little footbridge over the frontage ditch, with a jetty at the water and
a small garden behind. A single Zaan house alone in a meadow is a category
error: it is an urban building type.

### 2.5 Free wind (*molenbiotoop*) is what makes mill landscapes look right

A working mill needs unobstructed wind. The Dutch heritage rule of thumb keeps
obstacles within roughly 100 m below the height of the lowest sail tip, easing
with distance beyond that. (`estimated` — the standard *biotoopformule* is
maintained by De Hollandsche Molen; re-verify the exact coefficients before
quoting them in code comments.)

The landscape consequence is what matters here: **trees cluster at houses and
along the leeward ditches, and there is a conspicuously bare fetch on the
windward side of every mill.** Applying that one rule generates authentic
asymmetric planting for free. Uniform scatter — which is what the polder has
now — is the signature of an algorithm.

### 2.6 Water has a hierarchy

- *sloot* — field ditch, 1–2 m, in the polder, at polder level.
- *wetering / tochtsloot* — collector, 2.5–4 m, gathers the sloten to the mill.
- *vaart / boezem* — navigable, 6–12 m, at boezem level, carries barges.

A canal is navigable only if it *looks* navigable: no reed at the loading point,
timber piling, mooring posts, a quay deck, a moored boat. The polder's five
bridges are already *kwakels* — steeply arched footbridges — a shape that exists
precisely so a barge can pass beneath. The scene has therefore already promised
navigation and not delivered it. Deliver the reading, not the clearance survey.

### 2.7 Mill language (*molentaal*) — free narrative, zero cost

The resting position of the sail cross is a public message: the cross stopped
just before the vertical means "coming joy", just past it means "coming sorrow";
a fully reefed cross with the mill turned out of the wind means the mill is
stopped. One mill set deliberately out of the wind, cross in a rest position,
with a ladder and a spare stock lying at its foot, makes the other three read as
*running*. (`published` as folk practice; treat as authored world content.)

---

## 3. Design law

**Rule zero: this is a picture, not a survey.** Everything below exists to fix a
symptom measured in §1 — nothing is here because it is true in the Netherlands.
Where a rule and the frame disagree, the frame wins: relax the rule, note that
you relaxed it, and move on. Reality is being used as a source of *legible
cause* — the reason a thing stands where it stands — and the moment a rule stops
buying legibility and starts buying pedantry, drop it. Two consequences worth
stating plainly: approximate is fine when the eye cannot tell, and no detector is
worth satisfying if satisfying it makes the shot worse.

With that said — seven rules. Every placement decision below is derived from
them, and the core detectors in §9 test them.

1. **Machine before picture.** A machine stands within one sail span of its
   resource, or is joined to it by a *built* transport chain — road, ramp, quay,
   slipway. No machine may be connected to its resource by empty grass.
2. **One wind, one moment in time.** All working mills face the same wind within
   ±8°. Exactly one mill may be out of the wind, and it must show why.
3. **Buildings are parcels.** Every building sits inside a bounded plot with an
   edge (ditch, fence, hedge, wall or bank), exactly one declared entrance, and
   a working yard. Paths end at the entrance, never at the building origin.
4. **Water has levels, and levels do not touch.** Polder water and boezem water
   are different datums, connected only through the mill race or a gated
   structure.
5. **Free wind governs planting.** Trees live at houses and downwind. The
   windward fetch of every working mill is bare.
6. **Land use is zoned, not sprinkled.** Bulb parcel, hay meadow, grazing,
   orchard, kitchen garden and reed bed are six different surfaces with
   different edges — not one lawn with decorations on it.
7. **Composition 1–2–1 with depth.** One dominant, one working pair sharing a
   yard, one small solitary far away, plus something in the near foreground of
   the entry camera.

---

## 4. Object work orders

Summary of the moves. All coordinates `(x, z)`, map north = `−Z`.

| Id | Now | Target | Verdict |
| --- | --- | --- | --- |
| `M1` De Kat | `(2, −13)` +5.20, bearing 168° | **stays** at `(2, −13)` +5.20, bearing 225° ±8° | keep position, rebuild its logistics chain and yard |
| `M2` wipmolen | `(−40, −25)` +2.40, bearing 152° | `(−22, 18)` ±2 at bank datum ≈ +0.90, bearing 225° ±8° | **relocate** — a pump must stand on the polder/boezem seam |
| `M3` Jonge Schaap | `(36, −28)` +2.80, bearing 194° | `(27, 0)` ±2 at the C1 north bank, bearing 225° ±8° | **relocate** to the water; log deck axis at the pond |
| `M4` paltrok | `(50, 4)` +1.90, bearing 205° | hold, or nudge ≤4 m toward the C1/C4 fork; **parked out of the wind**, bearing 300–340° | keep site, rebuild the yard as a ring, park the body |
| `H1` Zaan house | `(−50, 4)` +2.25, bearing 128° | hold position, bearing ≈ **196°** (gable to the water) | reorient, and give it a hamlet |
| `H2` stolp | `(31, 29)` +1.45, bearing 206° | hold position and bearing | orientation is already right — build the werf around it |

### 4.1 M1 — De Kat stays on the crown, and gets its transport chain

The mill does not move. That means the scene must supply, as built objects,
what the hill takes away — a factory on a knoll is legitimate only if you can
see how the goods get up and down.

Build:

- **Cart road** from the mill yard down the south-west flank to the canal. The
  existing mandatory route `central-crown-switchback` is the right line; promote
  it from a 2.15 m footpath to a **3.0–3.2 m cart road**: compacted shell over a
  sub-base, two wheel ruts, a hairpin of inner radius ≥5 m, a passing bay at
  mid-height, edge posts on the outer side, and coursed retaining walls at the
  two switchback noses (the `dutch:landscape:retaining-wall` prefab exists).
  Grade stays inside the mandatory-route limit of 1:12.
- **De Kat's quay** at the foot, on the north bank of `C1`, centred near
  `(−9, 13)` — clear of the `B2` bridge seat at `(0.03, 14.25)` by ≥8 m. Deck
  ≈12 × 3.2 m at bank datum, timber sheet piling, four mooring posts, steps to
  the water, iron rings, a hand crane or hoist frame, and one **moored barge**.
- **Quay store** (`pakhuis`) beside the quay, 7 × 5 m, with loading doors and a
  hoisting beam under the gable — the transfer point between barge and cart.
- **Crown yard**: paved apron around the octagon instead of turf, stacked
  barrels, a covered dye-wood billet stack, a chalk heap under a lean-to, a
  fenced yard edge, and the hoisting beam over the mill's own loading door.
  The existing attached shed keeps its production connection.
- The crown's remaining slope stays bare — see the planting law, it is directly
  upwind of M1.

### 4.2 M2 — the wipmolen becomes a pump again

Preferred origin **`(−22, 18)`**, on the south bank of `C1`, standing on the
low polder with the boezem in front of it. Verified clearances at that point:
7.4 m to the `C1` centreline, 22.3 m to the nearest bridge seat, 36.6 m to the
shoreline, 39.2 m to M1, 31.5 m to H1 — no reserve circle conflicts.

Build:

- **W1 wetering** — a new collector ditch at polder level, roughly
  `(−48, 33) → (−34, 29) → (−26, 24) → (−22, 21)`, width 2.4 m, gathering the
  western field ditches and delivering to the mill inlet.
- **Wheel race** running north from the mill to the boezem: ≈6.0 × 1.2 m, bed at
  `−2.15` per the parent brief, the curved timber trough hugging the 4.72 m
  scoop wheel, masonry cheeks, and a **flap door** at the boezem end.
- **Gated culvert** wherever polder water and boezem water still meet — in
  particular at the existing `C3` mouth, which must stop being an open junction:
  either close it with a stop-log sluice or re-route `C3` into `W1`. The
  implementing agent picks; the law in §3.4 decides the outcome, not the method.
- **Miller's plot** on the polder side: kitchen garden in raised beds, a shed, a
  peat stack, a privy over the ditch, a jetty and a rowing boat, a drying line.
  Bounded by a ditch and a low fence — a parcel, per §3.3.
- **The swept apron is bare.** Nothing may rise above `h(d)` as defined in §4.3:
  in practice a clean apron of about 6 m radius with no fence, bush, bed or
  stone, easing outward. The mandatory route `west-bank-spine` must be bent
  south to keep **≥8 m** from the origin, which leaves 3.3 m of headroom over a
  cart. Currently that route passes within 0.6 m of the proposed site — a
  required edit, not an optional one.
- Alternative site, if the implementing agent prefers the textbook junction: move
  the `C3` mouth east to ≈`(14, 12.6)` and stand the mill at ≈`(16, 19)`. This is
  hydrologically purer but forces H2 ≈8 m south-east to clear the reserve
  circles. Do not adopt it without redoing the farm parcel.

### 4.3 M3 + M4 — one saw yard on the water

This is the working pair of the 1–2–1 composition. Both mills serve one trade
and share one water frontage.

**Constraint discovered while checking feasibility, and it matters:** with the
parent brief's "shore clearance" read as *sails must not reach the shoreline*,
there is **exactly one** legal cell in the whole eastern lobe for a second
sawmill. That constraint is wrong, and it is a direct cause of the current
layout — it pushes every mill into the middle of the island. Replace it:

> **Clearance rule (replaces "shore clearance").** The sail circle may overhang
> the shoreline, the canal and the water — that is what a bank mill does. What
> the sail circle must never intersect is terrain, a roof, a bridge deck, a tree
> crown, or another mill's sail circle. Separately, the **building footprint**
> must stand wholly on land with ≥1.5 m margin.

**The swept volume is a bowl, not a cylinder.** The sails turn in a vertical
disc, so the low tip only passes close to the ground *at the mill's own axis*.
Rotating that disc about the vertical gives the clearance surface:

```text
h(d) = baseY + hub − sqrt(R² − d²)      for d ≤ R
```

For the M2 wipmolen (`hub` 12.85, `R` 12.45) that is:

| distance from axis `d` | 0 | 2 | 4 | 6 | 8 | 10 | 12 m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lowest sail height above base | 0.40 | 0.56 | 1.06 | 1.94 | 3.31 | 5.43 | 9.53 m |

So a 1.8 m person is inside the sails only within **5.7 m** of the axis, not
within 12.45 m. Use `h(d)`, never a flat cylinder — a cylinder rule sterilises a
490 m² circle that in reality is a bare 100 m² apron with an open yard around it.

With that rule the eastern water opens up. Verified solution:

- **M3 at `(27, 0)` ±2** — 9.6 m to the `C1` centreline, 41 m to the shoreline,
  23.3 m to M4 at its current origin. If the implementing agent wants more
  separation margin, either take M3 to `(26, 0)` (24.3 m) or nudge M4 to
  `(53, 6)` (25.5 m). Reserve circles must clear by ≥1.5 m.
- **M4 holds `(50, 4)`** or nudges as above. It is the only mill currently sited
  correctly and it keeps its bench.

Build for the pair:

- **Log pond (*houtkolk*)** — a basin cut off the `C1` north bank near
  `(30, 7)`, ≈18 × 12 m, at boezem level, bed −1.40. A second, smaller pond or
  a widened reach serves M4 at the `C1`/`C4` fork.
- **Slipway** from each pond up to the mill deck: greased timber baulks at
  ≈1:6, chains, and a windlass or capstan at the head.
- **Log deck** for M3 continuing the shed axis to the water — the axis, the
  deck, the slipway and the pond must be one straight line, readable from the
  air.
- **Stacks**: round logs 0.35–0.6 m diameter, 6–9 m long, in low pyramids near
  the water; sawn planks in open stickered piles ≈2.2 m high with slat spacers,
  in the landward yard, some under a low open roof.
- **M4's ring yard**: because the paltrok body turns, its stacks, saw floors and
  paths are arranged **annularly** around the roller ring. No prop may sit on
  one fixed side, and nothing may stand where a swinging wing would strike.
- **Quay and barge** at the pond mouth for the finished timber.
- M4 is the **parked mill**: body turned 300–340°, sail cross in a rest
  position, a stock laid on trestles, a ladder against the body, a tarpaulin.

### 4.4 H1 — give the Zaan house a lane

The house holds its position (6.3 m from `C1` is exactly right for its type) and
is **re-oriented to ≈196°**, presenting its gable to the water. The canal runs
at bearing 106° there, so 196° is the perpendicular — the Zaan rule. Current
128° points the gable at nothing.

Build a **hamlet of four to six volumes**, because this building type does not
exist alone:

- one smaller timber house or cottage, gable also to the water, offset along the
  bank so the two gables are not aligned;
- a **pakhuis** / shed with loading doors and a hoisting beam;
- a privy over the frontage ditch;
- a paved **lane** 2.2 m wide running along the bank and joining bridge `B1`;
- a **footbridge per door** across the frontage ditch;
- a jetty with a small boat;
- green-painted fences with white posts, a well pump, a bean frame, a laundry
  line, and a strip garden behind each plot.

Each plot is bounded and has one entrance from the lane.

### 4.5 H2 — build the werf around the farm

Position and bearing stay: 206° faces the arrival route from the south-west,
which is correct for a front. Everything else is missing.

Build:

- **Ring ditch** around the farm platform, 2.0 m wide, at polder level, forming
  a parcel of roughly 46 × 38 m;
- **entrance dam** 4.0 m wide with a culvert, and a white timber gate;
- **voortuin** between the gate and the brick front: low clipped hedge or
  painted fence, symmetric beds, straight path to the front door, two shaped
  shrubs;
- **erf** behind: hooiberg (four oak poles ≈6.5 m, spacing ≈4.2 m, movable
  thatched pyramidal roof on pins, ladder), muck heap on a kerbed slab, milk
  house, cattle drinking ramp into the ditch, a cart, a farm boat at the ditch;
- **orchard** of 12–20 high-stem fruit trees on an ≈8 × 8 m grid, post-and-rail
  fenced against cattle, on the side away from the front;
- **windsingel** — a double row of elm or poplar, ≈3.5 m spacing, 12–16 m tall,
  on the north-west of the yard. It must sit outside every mill's windward
  fetch (§6) — check before planting.

---

## 5. Water and level contract

| Body | Level | Role |
| --- | ---: | --- |
| Boezem — `C1` and its outlets `C2`, `C4` | **0.00** (existing datum) | navigable trade water; discharges over the two shore lips |
| Polder system — `W1` wetering, `C3` as a field ditch, all new sloten | **−0.55** (`authored`) | drainage at polder level |
| Wheel race at M2 | bed −2.15, lifting from −0.55 to 0.00 | the only open connection between the two |

A 0.55 m lift is inside the range a single wipmolen handles, so no *molengang*
is needed. Polder ground at +0.80 therefore stands ≈1.35 m above its own ditch
water — a correct polder section.

**Navigable reach:** `C1` from bridge `B2` eastwards to the saw yard, plus the
log ponds. Requirements on that reach only: reed cleared at the quays, timber
piling, mooring posts, and a moored boat where the trade is. West of `B2`,
`C1` is drainage water and needs none of that — which is also what permits M2's
ground-sailing sails to sweep over it.

The current water sheet ([`dutchPolderWaterModel.ts`](../src/game/dutchPolderWaterModel.ts))
is one mesh at one datum. Two levels means either a second sheet or a per-reach
datum. Author the **geometry** — races, doors, sluice, ponds, bank heights — in
full now; the second visual level may follow in a separate pass, exactly as the
parent brief authored the channels before the water existed. Do not author the
geometry in a way that assumes a single level.

### 5.1 The five bridges are the fixed frame

The five bridge seats do not move. They are the only crossings in the world, and
that makes them the **hardest constraint in this document** — harder than the
shoreline, because the shoreline only says where land ends, while the bridges
say where movement is possible.

**A bridge seat is a node in two graphs at once.** On land it is the only place a
route may cross water, so it governs where paths run and therefore where every
parcel entrance and every building front can be. On the water it is a gate on the
navigable reach, so it governs where quays, basins, ponds and moorings may sit.
Both roles must be declared in data for all five seats. Five consequences,
measured from the kwakel geometry in
[`dutchLandscapeKitObject.ts:93-150`](../src/content/objects/dutchLandscape/dutchLandscapeKitObject.ts#L93-L150):

**a. The bridges are the water gates — but the gauge is not enforced.**

| Seat | Bank datum | Deck crown | Rail crown | Soffit over the water datum |
| --- | ---: | ---: | ---: | ---: |
| `B1`, `B2`, `B3` | 0.92 | 1.32 | 2.34 | 0.98 m |
| `B4` | 0.80 | 1.20 | 2.22 | 0.86 m |
| `B5` | 1.10 | 1.50 | 2.52 | 1.16 m |

Clear span 4.2 m at every seat. Those numbers are recorded as fact, **not as a
constraint**: the bridges are what they are, and a loaded barge passing beneath
is an accepted convention of this world. Do **not** shrink the barge to fit the
soffit, do not raise a deck, and do not write an air-draught detector. Design the
barge to the right proportions for a Zaan *praam* — roughly 8–12 m × 2.4–3.0 m,
low freeboard, lowering mast — because that is what makes it read correctly, and
let it pass.

What the seats still govern on the water is **position**: which reach is
navigable, and where a quay, basin or mooring may sit relative to a crossing.
That part is enforced, in (b) and (c) below.

**b. `B3` *is* the fork.** The `C1`/`C4` junction at `(39, 12)` lies **2.22 m**
from the `B3` seat. The main canal therefore cannot be widened anywhere near the
fork, and the saw yard's log pond **must be a side basin, not a widened reach**.
The candidate pond centre given in §4.3 was wrong on exactly this point: an
18 × 12 m basin at `(30, 7)` puts its east edge 6.1 m from `B3`. Corrected
constraint: the basin opens off the `C1` north bank between x ≈ 18 and x ≈ 34,
area ≥120 m², bed −1.40, mouth ≥4 m wide, **≥10 m clear of any bridge abutment**,
and it must not overlap M3's 20 × 13.8 m shed footprint — the slipway is what
joins the two. Solve the outline against those numbers rather than adopting a
centre point from this document.

**c. The bank datum is frozen at five points.** Every re-cut — wheel race, log
basins, quay piling, widened mouths — must leave the bank level unchanged at
0.92 / 0.92 / 0.92 / 0.80 / 1.10 at the five seats, or the bridge seats no
longer land on their banks.

**d. The bridges own the circulation graph, and therefore every parcel
entrance.** All thirteen mandatory routes hang off the ten fixed approach
endpoints in `DUTCH_POLDER_BRIDGE_APPROACHES`. A relocated object does not get to
invent its own access: it must re-attach to one of those ten points. That
decides which side of each building is the front:

- M2 at `(−22, 18)` attaches to the `B2` west approach `(−0.43, 10.57)` along the
  existing south-bank spine, 22.3 m away. Its yard gate therefore faces
  east-north-east and the mill's back is to the west.
- M3 at `(27, 0)` attaches to the `B2` north approach through the re-cut
  `central-to-sawyard` route. Land gate west, water gate south — the two sides
  of a saw yard end up on opposite faces, which is what they should be.
- M1's cart road joins the `B2` north approach, and the quay sits 9.1 m west of
  the seat. `B2` therefore becomes the hinge of the whole centre: bridge,
  landing, road junction and the crown above it. That is what a real polder
  crossing looks like, and it is a reason to concentrate rather than spread.
- The alternative wipmolen site at the `C3` mouth is now definitively rejected:
  that mouth is 5.0 m from `B2`.

**e. Every bridge must still lead somewhere after re-zoning.** `B4` currently
serves the western fields and `B5` the farm-to-paltrok link. When §7 re-zones the
land, both banks of all five seats must keep a declared destination. A bridge
that leads to nothing reads as scenery and undoes the work.

**What the bridges do *not* constrain:** sail circles. Checked all four mills
against all five seats — only `M4`/`B3` come within reach at all (12.5 m centre
to centre), and there the sail envelope stands 6.42 m above a rail crown of
2.34 m, clearing by 4.08 m. See the corrected envelope rule below.

---

## 6. Compass, wind and planting law

### 6.1 Fix the compass first — it is the cheapest change with the largest payoff

- Author the compass as a constant: `north = [0, −1]`, `east = [1, 0]`, matching
  §3 of the parent brief. Delete the derivation of `DUTCH_POLDER_EAST_VECTOR`
  from rotor facings.
- Prevailing wind: **south-westerly**, already correct in
  [`windState.ts:14`](../src/game/windState.ts#L14) as a vector blowing toward
  the north-east. Under the authored compass it is consistent; under the derived
  one it was not.
- **Working mills face 225° ±8°.** M1, M2, M3 take that bearing. M4 is the
  parked mill at 300–340°.
- The test `polder east points dawn light into all four rotor faces` in
  [`tests/dutch-polder-scene.test.mjs`](../../../tests/dutch-polder-scene.test.mjs)
  encodes the inverted dependency and must be replaced. Cinematography is solved
  by **choosing the hour**, not by rotating the planet: with north = `−Z`, mill
  fronts at 225° point west-south-west, so an **afternoon** sun rakes the sail
  faces directly and reads them from the entry camera in three-quarter. Pick the
  solar hour to suit and assert the compass separately from the lighting.

### 6.2 Planting

- **Windward fetch bare.** Inside a 60 m wedge centred on 225° ±60° from each
  *working* mill: no tree, no hedge, no crown above 3 m. Nothing else generates
  authentic asymmetry this cheaply.
- **Trees live where people live**: the farm windsingel and orchard, the Zaan
  hamlet, the miller's plot, and the leeward ditches.
- **Pollard willows** (`dutch:landscape:pollard-willow` exists in the kit) in
  rows along the polder ditches. They are the element that draws the parcel grid
  on the ground; use them as lines, never as scatter.
- **Reed** stays a wet-band plant per the existing vegetation model, and is
  **cleared at every quay, slipway and drinking ramp** — reed at a loading point
  is a tell that nothing is loaded there.

---

## 7. Land use — replace seven floating beds with six surfaces

Delete the current `DUTCH_POLDER_FIELD_PLACEMENTS` scatter and zone the polder:

| Surface | Where | Edge | Content |
| --- | --- | --- | --- |
| **Bulb parcels** | two or three rectangles in the south and south-east, belonging to H2 | ditch on all sides, path on one | long strips parallel to the parcel's long axis, filling it edge to edge, one colour per parcel |
| **Hay meadow** | central south polder | ditch and willow row | tall grass, a hay cart track, the hooiberg's supply |
| **Grazing** | western polder around M2 | ditch and post-and-rail fence | short grass, a drinking ramp, cattle if the world ever gets them |
| **Orchard** | at the farm | post-and-rail | high-stem trees on a grid |
| **Kitchen gardens** | miller's plot, hamlet strips | low fence | raised beds, frames |
| **Reed bed** | wet corners of the outlets | waterline | existing vegetation bands |

Bulb parcel rules, from §2.6 and real bulb land: all beds inside one parcel
share **one yaw** (within 0.02 rad); beds fill **≥70%** of the parcel area; a
1.2 m headland separates the outer bed from the ditch; colour changes **per
parcel**, not per bed. The current per-bed yaw jitter reads as sloppiness, not
as nature — remove it.

---

## 8. What must be designed that does not exist yet

The kit today has: bridge, field bed, retaining wall, revetment, path, pollard
willow, field fence, hedgerow, three core trees
([`dutchPolderPrefabs.ts:236-251`](../src/content/prefabs/dutchPolderPrefabs.ts#L236-L251)).
Everything below is new. Each needs a passport in the same form the parent brief
uses for the mills — source family, published invariants, authored massing
envelope, rejection conditions — and each must be reviewable in the Object Lab
before it reaches the scene, per §9 of the parent brief.

**Water and industry**

1. **Quay / kade** — timber sheet piling, plank deck on cross bearers, mooring
   posts ≈0.25 m diameter, steps, iron rings, bollards. Deck ≈12 × 3.2 m.
2. **Cargo barge (*praam*)** — flat-bottomed, ≈8–12 m × 2.4–3.0 m, ≈0.6 m
   draught, open hold, mast, rudder and tiller. Two variants: loaded with
   dye-wood/chalk, loaded with logs.
3. **Hand crane / hoist frame** at the quay, plus hoisting beams under gables.
4. **Pakhuis / store shed** — 7 × 5 m, loading doors, gable hoist.
5. **Slipway** — greased timber baulks at ≈1:6, chains, windlass or capstan.
6. **Log stacks** and **stickered plank stacks**, instanced.
7. **Cart road cross-section** — 3.0–3.2 m, shell over sub-base, wheel ruts,
   edge posts, passing bay.

**Hydraulics**

8. **Scoop-wheel race** — ≈6.0 × 1.2 m, masonry cheeks, curved timber trough
   around the 4.72 m wheel, bed −2.15.
9. **Flap door (*wachtdeur*)** — self-closing timber door at the race mouth.
10. **Stop-log sluice (*duiker met schuif*)** — culvert through a dam, vertical
    timber gate in grooves, screw handle.

**Farmyard**

11. **Hooiberg** — four or five oak poles ≈6.5 m, spacing ≈4.2 m, movable
    pyramidal thatched roof on pins, ladder. Highest-value single object in the
    whole list.
12. **Werf dam and gate** — 4.0 m dam with culvert, white timber gate.
13. **Muck heap** on a kerbed slab, **milk house**, **cattle drinking ramp**.
14. **Voortuin kit** — low hedge or painted picket fence, symmetric beds,
    straight path, shaped shrubs.
15. **Orchard tree** — high-stem fruit form, distinct from the three core trees.
16. **Windsingel row** — elm/poplar, 12–16 m, in a double row.

**Hamlet and small props**

17. **Small Zaan cottage** and a second shed variant, to give H1 neighbours.
18. **Private footbridge** — narrow plank crossing over a frontage ditch,
    smaller than the kwakel.
19. **Jetty and rowing boat**, **well pump**, **peat stack**, **privy over a
    ditch**, **laundry line**, **bean frame**.
20. **Repair evidence set** for the parked mill — trestles, a spare stock, a
    ladder, a tarpaulin, a tool chest.

Use the existing instancing paths for anything that repeats (stacks, orchard,
willow rows, bulb strips). None of this may become one structural piece per
object — the parent brief's §10 rule about flower rows applies to all of it.

---

## 9. Acceptance detectors

**Two tiers, and only the first is mandatory.** Rule zero applies here more than
anywhere: a wall of thirty green assertions is not the goal, a good frame is.

- **Core (must be green):** 1, 2, 3, 5, 8, 9, 11, 12, 14, 15, 16, 22, 29, 30.
  These are the ones that protect the reading — the compass, one wind, machines
  at their resource, water levels that do not touch, sails that hit nothing,
  parcels with entrances, depth in the frame, and the existing regressions. If
  one of these goes red, something visible is broken.
- **Advisory (check, judge, and feel free to fail on purpose):** everything else.
  Tolerances like "collinear within 6°" or "yaw within 0.02 rad" are there to say
  *what kind of thing* to look at, not to be defended to the last decimal. Record
  the deviation and the reason; do not bend the scene to the number.

The stage that introduces a rule closes with its **core** detectors green.

**Orientation and compass**

1. `solarFrame.north` is exactly the authored `[0, −1]`; no module imports rotor
   facings to build the compass.
2. Every mill declared `working` has a front bearing within 8° of 225°.
3. Exactly one mill is declared `parked`, its bearing differs from 225° by ≥60°,
   and its repair-evidence props exist within 12 m of its origin.
4. H1's front bearing is within 10° of the perpendicular to the local canal
   tangent, on the water side.

**Machine and resource**

5. Every industrial mill origin lies within 20 m of navigable water **and** has a
   quay, deck or slipway prefab within 14 m on the water side.
6. M1, which does not stand at water, has a continuous built chain — cart road
   → quay → store — with no gap longer than 3 m between successive built
   elements, from its yard to the boezem.
7. M3's shed axis, log deck, slipway and pond centre are collinear within 6°.

**Hydraulics**

8. Every polder water body is at −0.55 and every boezem reach at 0.00.
9. There is exactly one open connection between the two levels, and it is M2's
   wheel race. Every other crossing carries a sluice or culvert prefab.
10. The race bed is at −2.15 and the flap door sits at the boezem end.

**Sails and safety**

11. No two sail circles overlap; every pair clears by ≥1.5 m.
12. For every mill and every piece within `R` of its axis, the piece top is below
    `h(d) = baseY + hub − sqrt(R² − d²)`. Overhanging water or shoreline is
    explicitly allowed; roofs, bridge decks, tree crowns and terrain are not.
    (Measured headroom today: `M4` over `B3` — the only mill/bridge pair within
    reach at all — clears by 4.08 m.)
13. No mandatory route passes where `h(d)` drops below 2.6 m — for M2 that is
    ≥8 m from the axis. No prop of any height stands within 6 m of a
    ground-sailer axis.
14. Every building footprint stands wholly on land with ≥1.5 m margin.

**Parcels**

15. Every one of the six principal buildings belongs to a parcel polygon with a
    continuous edge and exactly one declared entrance.
16. Every mandatory route terminates at a parcel entrance, not at a building
    origin.
17. The farm parcel contains a ring ditch, a dam with culvert, a voortuin
    polygon, a hooiberg and an orchard.
18. H1's parcel is one of at least three plots on a shared lane.

**Land use and planting**

19. Beds within one bulb parcel read as one field, not as separate stamps: a
    shared yaw, filling most of the parcel, held off the ditch by a headland.
    (Numeric form for a test, if you want one: yaw spread ≤0.02 rad, ≥70%
    coverage, ≥1.2 m headland. The reading is the point, not the numbers.)
20. The windward side of each working mill is visibly open — no tall crowns in
    the wedge upwind. A wedge of 225° ±60° out to 60 m is a good default; narrow
    it wherever an open fetch would leave a dull empty quarter in the frame.
21. No reed stands in front of a quay, slipway or drinking ramp.

**Composition**

22. Distances from the spawn to the six principal masses span ≥30 m between
    smallest and largest, and no three fall within 5 m of one another. (The
    proposed layout gives ≈37 / 40 / 60 / 63 / 68 / 68 m — currently they bunch
    at the back.)
23. At least one pair of principal masses lies within 35 m of each other and
    shares one parcel; at least one principal mass is ≥45 m from any other.
24. The existing non-radial rules of the parent brief §11 still pass: four
    distinct mill base heights, no three equal radii, no repeated
    distance-and-bearing pair.

**Bridges (fixed frame, §5.1)**

25. All five seats keep their authored positions and bank datums
    (0.92 / 0.92 / 0.92 / 0.80 / 1.10); no re-cut changes the bank level within
    6 m of a seat.
26. Every seat is declared in **both** graphs: a land route crosses it, and the
    reach beneath it is marked navigable or not. No air-draught or beam check —
    see §5.1a.
27. No basin, quay, pond or widened reach comes within 10 m of a bridge
    abutment.
28. Both banks of all five seats have a declared destination in the route graph;
    no seat is a crossing to nothing.

**Regression**

29. Whole-scene initial unsupported count remains zero.
30. Every mandatory route still connects spawn, both houses, all four mills and
    all five bridges, at ≤1:12.

---

## 10. Order of work

Stages are closed completely, with detectors, before the next one opens — the
long-run rule: no stage is left "mostly done".

| Stage | Content | Detectors | Cost |
| --- | --- | --- | --- |
| 0 | Compass constant, wind contract, all six bearings, solar hour | 1–4 | very low, very high payoff |
| 1 | Two water levels, `W1` wetering, M2 relocation, race, flap door, sluice, route bend | 8–10, 13, 25, 28 | high |
| 2 | Saw yard: M3 relocation, basins, slipways, decks, stacks, M4 ring yard and parking | 5, 7, 11–12, 23, 25, 27 | high |
| 3 | M1 logistics chain: cart road, quay, store, crown yard, moored barge | 6, 27 | medium |
| 4 | Farm werf: ditch, dam, voortuin, hooiberg, orchard, windsingel, yard props | 15–17 | medium |
| 5 | Zaan hamlet at H1: lane, plots, cottage, shed, footbridges, jetty | 4, 18 | medium |
| 6 | Land-use zoning, ditch grid, bulb parcels, meadow, grazing | 19, 28 | medium |
| 7 | Planting law: windward fetch, willow rows, reed clearing | 20–21 | low |
| 8 | Composition audit and fixed high-view frames | 22–24, 29–30 | low |

Stage 0 alone removes the museum reading from the entry frame, because it turns
four objects that face the visitor into four machines that face the weather. Do
it first and re-shoot the reference frame before anything is moved — that frame
is the baseline every later stage is judged against.
