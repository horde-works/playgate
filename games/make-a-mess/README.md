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

## Prototype 004

The first playable 3D slice lives in `src/game/MakeAMessGame.tsx`:

- first-person WASD movement and mouse look
- an open yard and a two-storey house built with Three.js and Rapier
- brick, stone, wood, plaster, glass, steel, soil, and concrete on one typed
  runtime contract
- doors, windows, floors, stairs, roof sheets, a terrace, furniture, and a
  stone gazebo assembled entirely from breakable parts
- a global structural support graph that detaches every part without a path to
  the ground
- persistent physical fragments that can be struck again, transient dust,
  synthesized material sound, reset, and a first-person hammer
