# Dutch polder night lighting — evidence card 01

## Intent and source hierarchy

The baseline night is a dark, inhabited working polder. It follows ordinary
Dutch mill, farm, canal and bridge lighting: warm domestic rooms, shielded oil
or electric work lamps and sparse entrance lamps. Kinderdijk-style coloured
floodlighting is event lighting and is explicitly outside this pass.

Reference order: real fixture construction and photographed night use first;
accepted canonical object geometry second; the generated island illustration
only for the three unequal reflection clusters (west, east and north-east).

## Authored lighting hierarchy

| Cluster | Readable subject | Canonical sources | Intended pool on land/water |
| --- | --- | --- | --- |
| west | H1 merchant house + B1 | domestic hanging lamp, workshop lamp, entrance lantern, two bridge lanterns | 8–16 m warm pools; long broken reflection beside B1 |
| east | H2 stolp + B5 | residential lamp, side utility lantern, two bridge lanterns | 9–16 m; residence bright, barn mostly dark |
| north-east | M4 paltrok at fork | two shielded saw-floor lamps | 14 m work pools visible through the open rear |
| centre | M3 sawmill | two hanging saw-floor lamps | 14 m narrow working rhythm, not a glowing shell |
| minor | M1 and M2 | one local task/domestic lamp each | 9–12 m; enough to identify occupation, weaker than houses |
| crossing | B3 | two bridge lanterns | 16 m landing and rail reflection |

B2 and B4 remain dark. No baseline spotlights, façade wash, sail lighting,
visible beams or camera-facing lamp beacons are permitted.

## Fixture construction

Every source is owned by a physical `lamp-glass` lens. A wall lantern is:
carrier wall/post → mounting plate → projecting arm → metal cap/body → glass
lens. A hanging work lamp is: roof beam → hook/chain → cap → glass lens. The
members overlap at their joints; no decorative part may hover near a carrier.
The light origin is the lens centre in canonical object coordinates.

The lens is real glass. Roofs, walls and recesses remain opaque. Object Lab may
show a separate cutaway view, but the integrated object always uses its full,
physical materials.

## Photometric contract in current engine units

Existing decorative town lamps use roughly intensity 3 at 10–12 m and became
too weak for this world's large, dark rural spacing. Polder values deliberately
match the already proven brighter prefab range:

- domestic interior: intensity at least 10, radius at least 9 m;
- mill/work lamp: intensity at least 16, radius at least 14 m;
- exterior door/bridge lamp: intensity at least 18, radius at least 15 m;
- warm colour range: 1900–2400 K equivalent (`#ffb45f`–`#ffe0aa`);
- day factor: 0 for exterior lamps, no more than 0.06 for deep interiors;
- every polder lamp sets `localPoolCapacity: 6`; no beacon.

These are lower rejection limits, not targets to dial downward. If the nearest
lit cluster does not reveal timber/brick texture and a recognisable path or
water edge at night, the pass fails even when the lens itself is visible.

## Runtime budget

The water already adds mirror and refraction scene passes. The scene may author
many destructible lenses, but the shared point-light pool activates at most six
near the camera. Fixtures in one building or bridge use one `poolGroupId`, and
the representative source has a higher priority so a cluster reads coherently.
Rotors stay static; lighting must not reintroduce per-frame object transforms.

Measure night views with 0, 2, 4 and 6 active point lights. Reject a sustained
frame-time regression above 20% relative to the current static-rotor night.

## Invariant → test → camera

| Invariant | Automated check | Fixed visual check |
| --- | --- | --- |
| source is inside its glass lens | source-to-lens bounds | close fixture study |
| fixture reaches a real carrier | prefix parts + overlap/contact | paired full/cutaway object view |
| no transparent building shell | material inventory | full night and day 3/4 |
| pools are strong enough to read surfaces | minimum intensity/radius | ground-level approach view |
| unequal darkness is preserved | B2/B4 have no lit prefab | wide island night view |
| reflections come from scene geometry | no beacons/billboards | low canal view at H1/B1, H2/B5, M4 |
| bounded cost | capacity exactly six; no spotlights | profiler at 0/2/4/6 active lights |

Known unrelated baseline discrepancy: three weeping-willow strand pieces are
currently rejected by the support audit. Lighting work must not hide or rewrite
that pre-existing failure.
