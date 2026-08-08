# Evidence card 01 — VX-8 «Yaqui», integrated-duct combat hexacopter

**VX-8 «Yaqui»**, named by the owner on 2026-08-09. The index alludes to the
ducted-fan VTOL line — Piasecki VZ-8 Airgeep, Bell X-22 — and the eight
propulsors; the name is a people the army naming tradition never took, chosen
for character rather than for shape: the Yaqui were subdued by neither Spain nor
Mexico. `HX-D` was the working designation and is retired.

A separate object from RAX-8 Tonkawa
(`combatHexacopterObject.ts`) and from SR-6 Skat. Nothing from the abandoned
`codex/integrated-duct-hexacopter-runtime` line is inherited: that branch was
cancelled by the owner on 2026-08-08 and its geometry, contours and captures own
nothing here.

## 1. Identity and source hierarchy

- Fictional single-seat armoured VTOL. Six vertical lift fans are cored into one
  load-bearing lifting body; two longitudinal reversible fans are recessed into
  the upper body and supply yaw authority, cruise thrust and braking.
- `user contract 2026-08-08`: "как и RAX — 6 винтов + 2 горизонтальных двигателя
  управления рысканьем / продольного полёта / торможения". The count is exact.
- Tier A (owner-selected concept, character only): the graphite hexacopter frame
  supplied in chat on 2026-08-08. It owns stance, massing, surface hierarchy and
  the read of the machine — low broad armoured plate, polygonal duct bezels,
  many-bladed fans with conical spinners, dorsal longitudinal channels breaking
  the rear edge, sharp faceted nose with the canopy cut into the nose surface,
  four splayed articulated legs, chin gun and sensor.
  **It owns no dimension, no hidden member and no joint.**
- Tier E: the same image for anything not in the list above.
- `published` (typology only, no dimensions): NASA ducted-fan work — shaped
  nacelle, small controlled tip gap, generous static-lift inlet lip, a real
  diffuser rather than a decorative hole; NASA multirotor testing — fore/aft
  rotor interference and vertical station staggering are real effects; NASA
  variable-pitch fan work — reversible axial flow is feasible; NASA eVTOL crash
  research — survival cell → seat → crushable subfloor → gear load path.
- `authored`: every dimension, station, section, member, joint and clearance
  below.

**Reference file is an open debt.** The concept lives in the conversation, not
yet in `docs/duct-hexacopter/reference/`. Registered-pixel fit (masks, IoU,
landmark overlays) is therefore **not claimed** for the D-line until the owner
drops the PNG into that folder. Until then the concept is used as a shape
argument read by eye, and that is stated wherever it matters.

## 2. Frame, datum, scale

- Metres, `+Y` up, `+Z` nose, `+X` starboard-right when viewed from the front,
  origin at ground-centre in the undeformed landing pose.
- `y = 0` is the pad datum: four soles touch it, nothing else does.
- Human anchor: a 95 kg-class equipped pilot. Clear shoulder width `1.06 m`,
  seated headroom `1.32 m`, eye anchor `[0, 1.88, 2.35]`, tub floor `y = 0.94`
  over a `0.22 m` crushable subfloor.
- Mass is deliberately not authored. Playgate derives it from live pieces and
  material densities; the object owns geometry, stations and axes only.

### Authored envelope

| Quantity | Value |
| --- | ---: |
| hull length (transom → nose tip) | `7.40 m` |
| core length recovered from parts | `7.53 m` |
| width over the mid duct cells | `7.24 m` |
| core height recovered from parts | `1.57 m` |
| crown on the axis, amidships | `y = 1.55 m` |
| crown on the axis, at the nose tip | `y = 0.95 m` |
| belly on the axis, amidships | `y = 0.60 m` |

### The dorsal line: cut, crest, dip

`owner direction 2026-08-08`: the cabin ends on a **raked cut** — its top stands
`0.60 m` aft of its foot, about `44°` from vertical — and the body then carries
on to the tail at the same height. There is no cabin-to-body slope. Aft of the
cut the crest sinks gently below the tunnel tops (`2.05` at `z = −1`, `1.82` at
the transom), so a valley forms between the two channel humps, and the
transition from the cabin lies **across** both humps on three transverse members
rather than running between them.

### The body is a loft, not a plate

`d1` built both deck flanges as flat planes and cut the plan with a stencil. The
owner rejected it on sight — constant section, axis no taller than the chine, a
nose that is a wall. Two station tables now own every vertical dimension in the
canonical file, and no member is permitted a hand-typed deck height.

| Station `z` | crown `y` | belly `y` | depth on the axis |
| ---: | ---: | ---: | ---: |
| `+4.10` nose tip | `0.95` | `0.73` | `0.22` |
| `+3.05` nose frame | `1.30` | `0.685` | `0.62` |
| `+2.02` front ducts | `1.47` | `0.645` | `0.83` |
| `0.00` amidships | `1.55` | `0.60` | `0.95` |
| `−2.02` rear ducts | `1.50` | `0.655` | `0.85` |
| `−3.30` transom | `1.38` | `0.78` | `0.60` |

Laterally the crown falls `0.30 m` and the belly lifts `0.20 m` from the axis to
the chine on a `1.6`-power ramp, so the section is a lens: `0.95 m` deep on the
axis against `0.45 m` at the chine. Both numbers are recovered from the emitted
surface by a triangle probe, not restated from the tables.

Three envelopes are tracked separately and never merged: **hull footprint**
(load-bearing plan), **fixed envelope** (incl. legs, nacelle tails, chin gun),
**kinematic reserve** (eight swept discs).

### Six lift stations

| Pair | X | Z | Rotor plane Y | Tip Ø | Throat Ø | Structural outer Ø |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| front | ±2.20 | +2.02 | 1.039 | 1.44 | 1.58 | 1.80 |
| middle | ±2.56 | 0.00 | 1.050 | 1.44 | 1.58 | 1.80 |
| rear | ±2.20 | −2.02 | 1.099 | 1.44 | 1.58 | 1.80 |

- Rotor planes are derived, not typed: each is the mid-height between crown and
  belly at its own station, plus the rear stagger below.
- Centre-to-centre front→middle is `2.052 m` against `1.80 m` of paired outer
  radius. Along a constant station the rings leave a **`0.22 m` clear band** at
  `z = ±1.01`, and that band is where the two full-span transverse frames live.
  The duct pack and the frame grid are the same decision.
- The rear pair carries an explicit `0.04 m` stagger over the loft (NASA
  multirotor interference), rather than inheriting whatever the surface gives.
- Alternating spin signs: front-left cw, front-right ccw, middle-left ccw,
  middle-right cw, rear-left cw, rear-right ccw.

### Two longitudinal control ducts

- Centres `[±0.98, 1.66, −1.25]`, axes parallel to `+Z`, tunnel from
  `z = +0.55` to `z = −3.20`; the tail fairing that breaks the transom belongs
  to the hull revision.
- Each channel is **sunk into the deck**: the deck surface carries a trough
  `0.26 m` deep and `0.80 m` wide under it, fading in ahead of the mouth so the
  surface rises in front of each intake. The mouth itself is an armoured lip on
  four stays, larger than the tunnel it feeds.
- Tip Ø `0.60`, throat Ø `0.66`, structural outer Ø `0.80`.
- Both ends stay aerodynamically open; the aft lip and the stator pack are real
  so reverse flow is not a painted fiction.
- Mirrored lever arms are authored; delivered force and yaw moment are runtime
  results of live mass, allocation, actuator state and damage.
- The six-rotor mixer still owns pitch, roll and yaw. The pair supplements yaw
  and owns cruise/braking. The autopilot asks for ordinary body yaw rate and
  never addresses these two directly.

## 3. Named construction

1. **Survival cell** — tub floor, front pressure arch, side longerons, roll
   hoop, seat rails, crushable subfloor.
2. **Twin keel boxes** — `x = ±0.62`, transom to nose frame; they carry the gun
   hardpoint, the subfloor and the gear reaction.
3. **Frame grid** — nose frame `z = +3.05`, full-span duct-band frames
   `z = ±1.01`, centre frames `z = 0, ±2.02` (inboard of the duct rings only),
   tail frame `z = −3.05`.
4. **Chined outer rail** — a faceted longitudinal box following the plan edge,
   tangent to all three rings per side; it is the outer boundary of every root
   web.
5. **Six annular torque cells** — twelve steel segments per ring plus splice
   straps, closed by paired upper and lower root webs into rail and frames.
6. **Lift flow path** — bell-mouth inlet lip, recessed rotor, spinner and three
   motor pylons, lower stator/guard plane, expanding diffuser.
7. **Dorsal spine box** — energy bus and avionics between the two tunnels; it is
   structure, never a third propulsor and never an intake.
8. **Two yaw tunnel assemblies** — straight shells on two saddle frames each.
9. **Four gear trunnion boxes** — on the outer rail at the corner facets, never
   in a diffuser wall.
10. **Mission systems** — chin gun cradle on the keel hardpoint, sensor yoke on
    the nose frame.

Real negative spaces: six complete lift flow paths, both yaw tunnels, guard-vane
gaps, motor-pylon gaps, cabin volume, gear clearance. No dark material may stand
in for any of them.

## 4. Load paths

- Lift: blade → hub → three pylons → inner ring → annular cell → paired root
  webs → frame grid + outer rail → keel boxes → survival cell.
- Grazing strike: sacrificial lip/vane → outer ring segment → two separated root
  webs → frame. The motor and the blade are never the first impact path.
- Yaw/cruise: blade → hub → stator pack → tunnel shell → two saddles → spine box
  → tail frame and roll hoop.
- Landing: ground → pad → oleo → knee → trunnion box → outer rail → duct-band
  frame → keel box → crushable subfloor → seat rails.
- Gun: barrel → cradle → recoil trunnion → keel hardpoint → nose frame. Nose
  skin carries no recoil.

## 5. Motion contract

- Static: everything except the eight rotor assemblies.
- Kinematic groups: six lift rotors (axis `+Y`), two yaw rotors (axis `+Z`).
- Motion class: constant rotation only, render-side. No rotor, spinner, guard or
  stator receives a collider or rigid body.
- Excluded this study: flight simulation, firing, gear retraction, canopy
  opening, damage behaviour, world placement, routes.
- Every pivot and axis is stored once in the canonical model and read by tests,
  renderer and any later adapter.

## 6. Milestones and gates

| Rev | Contents | Gate |
| --- | --- | --- |
| `d1-core` | flat-plate steel core | rejected: constant section, "a cake" |
| `d2-loft-core` | lofted steel core: crown and belly lines, lens section, bay-panelled deck | owner sees the load path and the section before any skin exists |
| `d3-hull` | armour skin over the frozen core: faceted terraces, nose/canopy continuum, dorsal channel hump | owner accepts the silhouette |
| `d4-rig` | fans, spinners, pylons, stators, guards, legs, gun, sensor, materials, lighting | owner accepts the object |

A later revision may not move a station accepted by an earlier one without a new
owner review recorded here.

## 7. Rejection conditions

- Any count other than six lift fans and two longitudinal fans.
- The machine reads as six rings joined by bars instead of one cored plate.
- A duct is a dark recess, lacks a through path, or ends on a solid face.
- A protective member enters a swept disc, or closes more than 15 % of the
  throat projected area.
- The dorsal spine reads as a third propulsor or an intake.
- A yaw nacelle reads as a round stand-alone pod rather than a channel recessed
  into the upper body.
- The canopy becomes a separate bubble standing on the hull instead of a region
  of the nose surface.
- A leg, a weapon or a sensor loads into a duct wall or into skin.
- A root web is a single thin decorative plate.
- Any capture in a delivered set carries a different revision or model hash.
- Object exceeds `820` parts, or contains duplicate ids or degenerate triangles.

## 8. Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Camera |
| --- | --- | --- | --- |
| 6+2 topology | lift/yaw station arrays | count hubs and axes from emitted parts | top, front |
| duct band is the frame | station geometry + frame Z | recover clear band and frame width from parts | core-top |
| one integrated core | rings, webs, rail, frames | walk carrier graph ring → rail/frame → keel → cell | core-cutaway |
| honest ground chain | trunnion + pad parts | four soles at `y = 0`, chain exists to keel | underside |
| protected discs | lip/guard/rotor/diffuser Y | swept-disc clearance, throat open area ≥ 85 % | duct-detail |
| no ninth engine | spine inventory | no blade or hub on the centreline | top, rear |
| cabin scale | cell sections + eye anchor | recover clear shoulder and head envelope | front, profile |
| envelope bookkeeping | recovered bounds | hull / fixed / kinematic recovered separately | front, profile |
| one revision | model hash | manifest equality across the set | every PNG |

## 9. Part budget

| System | Planned | Note |
| --- | ---: | --- |
| six annular cells (ring segments, splices, webs) | 190 | real segments, real webs |
| frame grid, keels, outer rail | 70 | endpoint boxes at real joints |
| survival cell | 46 | tub, arches, hoop, rails, subfloor |
| spine and two yaw tunnels | 74 | one parameterised assembly, mirrored |
| rotors, spinners, pylons, stators, guards | 150 | eight assemblies |
| outer shell and canopy | 130 | station lofts, no tiled greebles |
| landing gear | 56 | four complete visible chains |
| weapons, sensors, service, lighting | 60 | silhouette- or function-bearing only |
| reserve | 44 | correction margin |
| ceiling | 820 | rejection condition |

## 10. Claims not made

No airworthiness, ballistic protection, blade containment, manufacturability,
thermal or endurance claim. This is a mechanically and aerodynamically coherent
fictional geometry for Object Lab and later Playgate physics mapping.
