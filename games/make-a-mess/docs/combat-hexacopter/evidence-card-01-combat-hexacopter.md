# Evidence card 01 — RAX-8 Tonkawa (`combat-hexacopter`)

## Identity and source hierarchy

- Object: **RAX-8 Tonkawa**, a fictional one-seat armed electric VTOL with six lift rotors and two dedicated yaw-control ducted fans; explicitly not an SR-6 variant and not a conventional winged aircraft.
- `user contract`: the supplied concept owns the visible character: low wide stance, six independent annular lift nacelles, raised central tail spine, paired canted shoulder yaw fans, graphite/olive/titanium material hierarchy, compact chin weapon and restrained modular stores.
- `user correction 2026-08-04`: there is no continuous external bumper, rail or perimeter frame on any side. Every lift nacelle is tied inward to the armoured core by local tapered root structures.
- `user correction 2026-08-04`: yaw-fan axes are diagonal in plan rather than parallel to the body centreline; the two forward-facing axes diverge outward symmetrically.
- `user correction 2026-08-04`: nacelle-to-core transitions may use more parts and deliberately unequal sections to reproduce thick roots, thinner open trusses and accurately seated joints. SR-6/Skat is explicitly not a visual source.
- `published`: Jetson ONE brackets one-seat occupant scale, package and aluminium space-frame precedent. It does not own this object's dimensions.
- `published`: NASA multirotor and ducted-rotor work owns the need for rotor/airframe clearance, real inlet lips, small tip gaps and explicit treatment of vertically staggered aft rotors.
- `published`: NASA eVTOL crashworthiness work owns the systems chain landing gear -> energy-absorbing subfloor -> seat/restraint -> survival cell.
- `published mechanism`: opposed fore/aft thrust from laterally separated ducted fans can apply a yaw moment; the current object authors a mirrored outward-canted pair around that principle.
- `authored`: all exact dimensions, hidden joints, armour segmentation, weapon installation and service access are original engineering choices for this object.
- The concept image is visual evidence only. It does not own hidden structure, dimensions or attachment paths.

Sources:

- Approved concept: `reference/combat-hexacopter-concept.png`.
- Jetson ONE technical specifications: <https://jetson.com/jetson-one>
- NASA Multirotor Test Bed: <https://ntrs.nasa.gov/api/citations/20205004029/downloads/1426_Russell_063020.pdf?attachment=true>
- NASA ducted rotor tip-gap and inlet-lip study: <https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20050009943.pdf>
- NASA eVTOL occupant protection: <https://ntrs.nasa.gov/api/citations/20200002696/downloads/20200002696.pdf>
- Opposed thrust yaw-control mechanism: <https://patents.google.com/patent/US20020113165A1/en>

## Local frame and envelopes

- Metres, `+Y` up, `+Z` nose/front, `-X` left and `+X` right when viewed from the front.
- Origin is ground centre; landing-pad soles contact `y = 0`, Object Lab floor is `y = 0`.
- Recovered canonical envelope: length `6.889 m`, width `6.873 m`, height `2.000 m`; these values are computed from emitted geometry rather than copied declarations.
- Main lift rotor stations: front `x = +/-2.35, z = +1.95`, middle `x = +/-2.62, z = +0.20`, rear `x = +/-2.25, z = -1.85 m`.
- Front/middle tip diameter `1.46 m`; rear tip diameter `1.66 m`. Rear rotor plane is `0.17 m` above the front plane.
- Yaw-fan centres are at `x = +/-1.02, y = 1.36, z = -0.48 m`; their local axes are canted `18 deg` outward in plan from `+Z`; fan tip diameter `0.68 m`; each tunnel is `0.76 m` long.
- Cockpit survival cell clear shoulder width is `1.12 m`; pilot eye anchor is `[0, 1.58, 0.82]`.
- The raised tail spine ends at `z = -3.25 m`; the nose armour tip ends at `z = +3.15 m`.

## Named construction

- Six independent bell-mouth lift nacelles with machined rims, open five-blade rotors, motor hubs, three motor pylons, segmented outer armour and local service hardware.
- Two outward-canted reversible yaw tunnels with front bell mouths, rear diffusers, seven-blade fans, stators and four-point diagonal carriers.
- Discontinuous inner primary frame: twelve nacelle-root engagements, tapered torque-box transitions, local ring doublers and diagonal inner spars. No structural member runs around the outside of the rotor array.
- Survival structure: keel box, four lower longerons, canopy sills, front/rear arches and shoulder clevises.
- Outer shell: faceted armoured nose, lower chine/keel shell, canopy glazing, olive shoulder armour and a narrow raised dorsal systems spine.
- Crash chain: four pads, pivot, oleo, scissor, tapered main strut, drag link, trunnion, lower longeron, energy-absorbing keel/subfloor and seat cell.
- Weapons: one compact chin autocannon, two six-tube modular pods and protected feed/power boxes. Weapons are dependents, never carriers.
- Real negative spaces: all eight fan throats, open truss bays between the cell and nacelles, yaw tunnel bores, blade-to-ring clearances and landing-gear clearances.

## Load and attachment paths

- Lift: blade -> hub/motor -> three motor pylons -> nacelle ring -> paired local root boxes -> survival-cell shoulder and keel.
- Yaw: blade -> yaw hub -> motor spiders -> canted tunnel -> diagonal upper/lower shoulder clevises -> rear survival arch and dorsal spine.
- Landing: ground -> pad -> pivot/oleo -> main strut + drag link -> trunnion -> lower longeron -> energy-absorbing keel/subfloor -> seat/survival cell.
- Weapon: cannon/pod -> cradle -> hardpoint plate -> survival keel or primary shoulder box. No armour panel carries a weapon by itself.

## Protected scope

- New canonical owner: `src/content/objects/vehicles/combatHexacopterObject.ts`.
- Visual C2 accepted by the owner on `2026-08-04`; canonical geometry is now frozen.
- Runtime owner: `src/game/combatHexacopter.ts`; canonical-to-scene adapter: `src/content/scenes/combatHexacopterPrototypeDocument.ts`.
- Public designation fixed by the owner on `2026-08-04`: `RAX-8 Tonkawa`; internal `combat-hexacopter` ids remain stable compatibility keys.
- Runtime placement is isolated to the dedicated `combat-hexacopter-range` proving ground, with a physical dispatch post and closed autonomous circuit.
- Do not modify SR-6 geometry, Dutch-polder canonical objects or existing vehicle registrations as collateral work.

## Rejection conditions

- Any view does not show exactly six horizontal lift rotors and exactly two diagonally canted yaw fans.
- Any continuous external bumper/rail links the outboard faces of the lift nacelles.
- Either yaw axis remains parallel to the centreline or the two axes fail to diverge outward symmetrically.
- A beam ends in air, crosses a rotor throat or relies on an armour panel as its only carrier.
- A yaw tunnel is a dark painted circle rather than an open bore with fan, hub and stator structure.
- Main nacelle discs overlap or the rear rotor step-up is absent.
- The cockpit reads as a box, the tail spine stays flat, or the silhouette loses the narrow waist around the yaw shoulders.
- Landing pads do not reach datum or weapon hardware floats from its hardpoint.
- Final part inventory exceeds `900` parts, ids are duplicated, or any mesh triangle is degenerate.
- Delivered PNGs differ in revision/model hash or come from noncanonical geometry.

## Invariant -> parameter -> test -> camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| 6+2 propulsion topology | station arrays and emitted part ids | count main/yaw hubs and blade families | top, front-three-quarter |
| diagonal yaw axes | yaw cylinder endpoints | recover equal/opposite X/Z cant and zero Y delta | front, yaw-detail |
| rear lift pair higher/larger | recovered hub/rim bounds | compare diameter and plane Y | profile, rear |
| continuous primary load path | clevis/rail/arch intervals | positive overlap for each chain | structural-cutaway |
| real fan throats | emitted duct geometry and probe paths | axial centre-line probes remain clear | top, front, yaw-detail |
| raised narrow tail | spine section control points | recover crown rise and tail half-width | profile, high-three-quarter |
| crash chain reaches datum | landing assembly endpoints | each pad/oleo/strut/trunnion chain contacts | underside |
| one canonical object | model revision/hash | capture manifest and required views | every delivered PNG |

## Accepted runtime contract

- The accepted `429` canonical parts compile directly into one linked, destructible vehicle cluster; there is no reduced runtime redraw.
- Six lift motors own `throttle:0..5`; two reversible canted yaw fans own `yaw-throttle:0..1`.
- The autopilot continues to request conventional yaw rate only. A lower controller converts yaw-rate error to moment and combines ordinary lift-rotor reaction torque with the two dedicated canted fans.
- Nominal split retains `35%` of requested yaw moment on the ordinary hexacopter channel and gives the balance to the dedicated pair. Either channel takes the residual if the other saturates or is damaged.
- Mirrored `18 deg` fan axes create a coupled lateral force during pure yaw. This is preserved as physical truth and must be cancelled by the lift/attitude controller rather than deleted from the model.
- Placement factory rotates geometry, lift points, yaw points/axes, proximity sensors and movable-frame anchors from one berth/yaw contract.
- Prototype datum `[0,0,0]` remains isolated authoring space; the registered proving-ground berth is a separate placement contract.

## Part budget

| System | Planned | Final | Compression/justification |
| --- | ---: | ---: | --- |
| lift propulsion | 150 | 126 | open rotor units plus segmented nacelle armour |
| yaw propulsion | 34 | 30 | stators merged per tunnel |
| primary/survival structure | 100 | 81 | paired roots, saddles, doublers and survival members |
| shell/canopy/shoulders | 55 | 40 | control-line lofts and local faceted armour only |
| landing gear | 52 | 40 | four complete attachment chains |
| weapons/sensors | 44 | 44 | preserve readable hardpoints and bores |
| service/lighting/detail | 80 | 62 | keep only silhouette- or function-bearing detail |
| interior | 8 | 6 | seat, controls and paired battery modules |
| total | 523 | 429 | must remain <= 900 |
