# M4 — De Gekroonde Poelenburg-type paltrok sawmill

Standalone structural object study. It is not registered in a world, the scene
compiler, the support solver, water simulation, or physics.

## Fixed dimensional and mechanical anchors

- published sail span: 23.0 m
- authored rotor hub: +11.8 m; lower operating envelope: +0.3 m
- crown: +13.3 m
- masonry roller-wall outside diameter: 7.2 m
- complete rotating body including wings: 17.8 × 12.6 m
- sixteen represented wooden rollers between two timber tracks
- central king post and crossed principal beams
- three saw frames on an open, three-sided saw floor
- sixteen separate overlapping courses in the windward stepped wall
- complete fixed-body front envelope: Z +6.30 m
- rotor plane: Z +6.90 m; nearest blade surface remains at least 0.40 m in
  front of the complete support envelope

The earlier 20.4 m concept estimate has been rejected after research. The
future world reserve for M4 must therefore grow from 11.0 m to 12.0 m before
placement; no world coordinates are changed by this object milestone.

The entire historical body, wings and saw floor share one yaw pivot over the
roller ring. That yaw, the rollers, saw frames and log carriages are fixed in
this milestone. Only the sail rotor contract permits constant rotation; wind
is explicitly disabled.

## Rejection conditions

- a generic tower silhouette replaces the broad low wings;
- the open saw floor becomes a closed rectangular shed;
- the brick ring becomes a solid cylinder or hides the wooden rollers;
- the central king post is absent or disconnected from the body cross;
- overlapping plank courses become a texture without stepped geometry;
- saw frames become ornament without blades and carriage lines;
- the full sail envelope intersects the front roof or stage;
- a clearance check uses only the roof while ignoring the farther-projecting
  floor, stage, rail or support edge;
- a scene adapter silently enables wind, whole-body yaw or roller motion.

All PNG files are rendered from the same canonical object and stamped with the
same model hash. `rear.png` and `three-quarter-rear.png` control the open saw
floor; `roller-ring.png` isolates the central load path and roller circle;
`open-saw-floor.png` isolates the three frames; `silhouette.png` rejects a
generic tower reading.

Regenerate the set from the repository root:

```sh
node --experimental-strip-types scripts/capture-gekroonde-poelenburg-object-lab.mjs
```
