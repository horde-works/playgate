# Island Airport authoring brief

## Scope and evidence tier

This is an authored fictional regional airport, not a reconstruction of a named site. The evidence tier is owner-authored type fidelity: ordinary short-field airport proportions and systems are combined into one internally consistent world. No external image or generated image is a canonical geometry source.

The architectural precedents used for vocabulary are already shipped worlds: Grand Terminal for a traversable public hall and explicit glazing assemblies; Dutch Polder for an irregular non-radial shoreline; Astana for legible public circulation and daylight. Their exact shapes and dimensions are not copied.

## Canonical plan

- Island shoreline: 237 m east-west by 112 m north-south, flat, irregular, and wider on the landside half.
- Runway: 176 × 14 m on z = -22 m, with 7 m threshold insets, centreline, edge lines, threshold bars, aiming points, edge lamps and PAPI.
- Apron: 76 × 19 m with three marked stands; a 12 m taxiway joins it to the runway.
- Terminal: 52 × 20 m, eight 6.5 m structural bays, 6.3 m wall line and 6.72 m roof line.
- Public routes: two independent north-south routes, each with an open landside sliding doorway, a security lane and an open airside sliding doorway.
- Supporting systems: integrated control tower, maintenance hangar, three-bay rescue station, fuel farm, landside loop, two parking courts and physical lighting.

## Construction logic

The terminal is one continuous assembly: concrete bay foundations carry steel perimeter columns; transverse roof beams carry opaque roof sheets and the skylight band. Facades use real sill/header/mullion/glass assemblies. Door leaves are visibly parked at their jambs and leave at least 1.9 m of clear opening.

Interior objects are physical: check-in desks, security rails and arches, gate seating, a faceted baggage carousel with an empty centre, cafe counter, partitions, and a departure board on two posts. Hanging lights use the explicit dependency chain roof beam → stem → housing → lens → bulb/light.

The tower, hangar, rescue station and runway equipment follow the same rule. Airfield lights use pavement → concrete base → stem → lens → bulb. Breaking a base removes the complete local assembly; breaking a roof beam removes only its locally dependent skylights and fixtures.

## Visual invariants

- The shoreline must read as long and non-circular in an aerial three-quarter view.
- The runway must dominate the south half without touching the shore.
- The terminal must read as a low civic hall, not a warehouse: continuous glazed facades, entrance canopy, clear roof rhythm and visible public interior.
- The tower must remain the sole vertical landmark.
- Glass is reserved for actual panes, lenses and display faces; opaque structure remains visible around it.
- Runway and public-hall lights must read as contained sources, never as bare floating point lights.

## Rejection list

- Circular or mountainous island.
- Kilometre-scale runway or runway clipped by the shore.
- Sealed terminal, fake doors, painted-on windows, duplicate walls behind glazing.
- Decorative control tower without a cab, maintenance/rescue/fuel systems omitted, or lights without carriers.
- Initial unsupported pieces, grass crossing paved operational areas, or either public route failing in either direction.

## Fixed visual checks

1. Aerial overview from the south-west: whole shoreline, runway, apron and landside systems.
2. Landside eye-level view: canopy, open entrance and hall depth.
3. Airside oblique view: apron, glazed facade, tower, hangar and rescue station.
4. Interior view through the security lanes: check-in, board, skylights, seating and baggage zone.
5. Sunset aerial: runway light rhythm and tower/terminal light hierarchy.

Any discrepancy found in these views is fixed in the canonical scene document; there is no second presentation-only model.
