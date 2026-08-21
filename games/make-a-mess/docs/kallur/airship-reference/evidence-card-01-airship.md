# Evidence card 01 — Kallur airship («небольшой гинденбург» в вертолётной стилизации)

## Identity and source hierarchy

Imagined, stylized object. Igor's verdict (21.08.2026) owns the concept:

- form family — a SMALL rigid airship («небольшой гинденбург»): elliptical
  nose, midship ahead of the middle, long power-law tail cone, cruciform
  tail fins;
- styling — colour stylization after the national airline helicopters of
  the Faroes: **no exact livery** (no rights) — red + white palette only;
- fusion — the gondola is an elongated RED helicopter cabin **merged into
  the hull as a keel**, not hung on struts; the balloon is white with a
  red cheatline and red tail fins;
- **no main rotor** — a rotor under a balloon is an oxymoron; the
  helicopter reads through the cabin form, chin glazing and colour, thrust
  comes from two side engine pods (Igor accepted this correction);
- parking — on a simple platform with wooden plank decking (NOT a mooring
  mast), location undecided (spawn trailhead vs summit plateau); the
  landing gear is therefore helicopter SKIDS, y=0 is the skid plane.

Typology facts (rigid airships of the 1930s, light utility helicopters)
establish the family only; every dimension below is `authored` and owned
by this passport.

## Local frame and envelope

- up +Y, front +Z (nose at +z), origin ground-centre = skid contact plane.
- Hull: length **11.2 m** (1.34× smaller than the terminal wagon-airship's
  15 m — verdict «в 1.3–1.5 раза меньше»), max diameter **2.84 m**,
  midship at 35% from the nose, hull axis at y = 3.25.
- Full envelope with fins ≈ 11.2 × 3.6 × 4.9 m.
- Scale gate: the summit plateau spans ~50–60 m (measured), the ship takes
  ~20% of it — noticeable, not dominating. Lighthouse is 7.0 m tall; the
  ship tops out below it.

## Parts and construction

- `airship-hull` — one loft: radius is a function of station (elliptic
  nose 35%, tail `(1-t²)^0.62`); 28 wedges × 14 stations, closed at both
  tips; white skin + red cheatline lanes (two wedge lanes just above the
  waterline, full-station range mid-hull) split by material only — same
  loft function owns both.
- `airship-fins` — 4 cruciform prisms, root edges derived from the SAME
  hull profile function, red.
- `airship-gondola` — helicopter cabin: floor, red chin panel, glazed
  windshield (two panes, centre post), side walls as sill + header +
  posts with REAL openings (window pane, blind panel, sliding door with
  its own pane), rear wall; wall tops bury into the hull belly (top edge
  2.35 > belly line everywhere along the cabin) — the fusion verdict.
- `airship-keel` — tapering keel wedge from cabin rear to the tail,
  top face follows the hull belly from the profile function (the
  «helicopter tail boom» read, merged).
- `airship-motors` — 2 side pods on strut pylons, static two-blade props.
- `airship-skids` — two longitudinal tubes + 4 raked struts; tube bottoms
  at y = 0 exactly.
- `airship-glazing` — every transparent part; ordinary glass, no emission.

## Load path

platform ← skid tubes ← raked struts ← cabin floor ← cabin walls buried
into hull ← hull; motor pods ← pylon struts ← hull.

## Motion contract

None this milestone: propellers and rudders are frozen
(`motionConstraints.frozen`). Flight/docking simulation is excluded scope.

## Protected scope

World scenes, terrain, prefabs, adapters untouched until explicit visual
acceptance. Lighthouse and boulder kit accepted — not collateral.

## Rejection conditions

- a main rotor appears on the gondola;
- glazing painted over an unbroken wall (fake window);
- skid bottoms off the y=0 datum;
- gondola hung on struts instead of merged (visible gap between cabin top
  and hull belly);
- hull length outside 10.0–11.5 m (dominates or vanishes on the plateau);
- any emissive glass.

## Invariant → test → camera

| invariant | test | camera |
|---|---|---|
| hull length/diameter recovered from mesh | kallur-airship.test.mjs | front/profile ortho |
| skids on y=0 | datum test | profile |
| cabin top buried into hull belly (positive overlap) | fusion test | three-quarter |
| fins root inside hull surface | attachment test | rear |
| glazing only in airship-glazing group | material audit | gondola-detail |
| closed hull: positive signed volume | solid test | — |
| no rotor part above cabin | rejection test | high-three-quarter |
