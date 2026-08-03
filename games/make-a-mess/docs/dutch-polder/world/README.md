# Dutch Polder — implemented world

The accepted 143 × 109 m non-radial polder is compiled as a playable
`make-a-mess-dutch-polder` scene.  It keeps six different terrain datums, an
18-point shoreline, four distinct full-scale windmills, two houses, four canal
systems, five canonical kwakel bridges and a deliberately uneven field/path
composition.

## Compiled inventory

- 6,555 breakable pieces from 2,781 authored objects;
- 21 semantic groups and 18 canonical prefabs;
- four complete static sail crosses, still separated from fixed mill bodies so
  their future mechanism can be optimized without rebuilding the objects;
- zero initially unsupported pieces;
- five bridges, seven raised flower beds, ten bridge-bank revetments, five
  retaining-wall modules, eight fence/hedge modules and six pollard willows;
- an irregular cliff skirt generated from the shoreline, open at channel
  mouths.

## Deliberate exclusions

The thin canal surface is a replaceable visual datum only.  It applies no
buoyancy, current or water force.  Mill sails are rigid and temporarily static;
the scene contains no constant-rotor runtime, wind vector, aerodynamic
coupling, cap yaw, cloth sail, airship effect or airship-island registration.

## Authoring boundary

Canonical mills and houses live under `content/objects/`; the reusable bridge,
path, masonry, raised-bed, revetment and field-edge set lives under
`content/objects/dutchLandscape/`.  `dutchPolderPrefabs.ts` is the one-part to
one-piece compiler adapter.  `dutchPolderDocument.ts` owns only topography,
routes, placement, canal reservations and mechanism instances.

Every reusable landscape family was accepted in Object Lab before world
integration.  Its fixed evidence views and manifest are in the adjacent
`landscape-kit/` directory.
