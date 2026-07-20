# Make a Mess

The first game in the Handmade Games repository.

## Boundaries

- `src/core`: damage, support graph, detachment, and material rules
- `src/physics`: runtime adapter for dynamic bodies and collisions
- `src/rendering`: Three.js and React Three Fiber presentation
- `src/gameplay`: player, tools, objectives, and level flow
- `src/content`: typed object, material, and scene definitions
- `content`: source GLB assets, textures, audio, and compiled structure data
- `tools`: deterministic content validation and compilation

The destruction core must not import React or rendering code. Content may gain
better meshes, textures, effects, and LODs without changing structural rules.

## Prototype 005

The first playable 3D slice lives in `src/game/MakeAMessGame.tsx`:

- first-person WASD movement and mouse look
- an open yard and a two-storey house built with Three.js and Rapier
- brick, stone, wood, plaster, glass, steel, soil, and concrete on one typed
  runtime contract
- doors, windows, floors, stairs, roof sheets, a terrace, furniture, and a
  stone gazebo assembled entirely from breakable parts
- a global structural support graph that detaches every part without a path to
  the ground
- one voxel-damage contract for attached, falling, and settled bodies: holes
  remove real material, connected components become physical compound bodies,
  and every surviving fragment can be damaged again
- one shared material-strength scale for blasts, directed bullet channels,
  hammer impacts, and real landing speed: glass and plaster yield first, then
  wood and masonry, while concrete, stone, and steel retain more section
- grenades deliver distance-based energy into the same material scale, so
  concrete now craters heavily near the burst, while wood, glass, plaster, and
  brick lose proportionally more volume under the same blast
- load propagation through the surviving volume and bearing area, so a narrow
  section can fail under the weight above it
- bounded fragment and compound-collider budgets, sleeping debris, transient
  dust, recorded material sound, reset, hammer, machine gun, and grenades
