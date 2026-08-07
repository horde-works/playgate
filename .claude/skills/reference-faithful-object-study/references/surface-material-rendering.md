# Surface, material, lighting and render parity

## Contents

1. Authority and stage order
2. Material contract
3. Texture and UV contract
4. Glass, lenses and emission
5. Diagnostic and acceptance lighting
6. Color management and render convergence
7. Target-renderer parity
8. Export and optimization
9. Validation matrix
10. Failure modes

## 1. Authority and stage order

Materials reveal geometry; they never repair it. Work in this order:

1. body family, silhouette and negative spaces;
2. supports, joints and surface boundaries;
3. semantic material assignment;
4. UV/texture coverage where needed;
5. neutral diagnostic render;
6. calibrated acceptance look;
7. target-renderer/export parity.

If silhouette, fit, solid validity or attachment fails, material/look work may be
researched but not finalized. A darker texture is not a hole, panel gap, intake
or structural recess.

## 2. Material contract

Define materials semantically before renderer-specific settings:

- physical family: metal, painted metal, composite, plastic, rubber, glass,
  fabric, wood, masonry, emissive element;
- finish: raw, brushed, anodized, matte, satin, polished, weathered;
- canonical group ids and runtime mapping;
- PBR channels and numeric ranges;
- whether texture, vertex color or constants own each channel;
- collision/support/damage semantics, if material ids participate in them.

For metal/roughness PBR, treat metalness as a material classification: use
`0` for dielectrics/coatings and `1` for exposed conductive metal. Intermediate
values are reserved for genuinely mixed pixels in a texture, not for making a
surface vaguely "more metallic". Painted metal's visible paint is dielectric;
exposed scratches may reveal metal through a mask.

Use roughness and normal response to communicate finish. Do not encode broad
shape, seams or panel depth only in a normal map when silhouette or shadow
requires geometry.

Keep names stable and meaningful, such as `frame-metal-brushed` or
`canopy-glass-smoked`; never accept anonymous `Material.001`-style ids in a
canonical/exported asset.

## 3. Texture and UV contract

Use textures only when they add information that geometry/material constants
cannot carry efficiently: coating breakup, woven scale, fine scratches, decals,
serials, small fastener variation or baked high-frequency normals.

For every textured closed/extruded part verify coverage independently on:

- front/hero surfaces;
- rear/back caps;
- sidewalls/reveals;
- interior surfaces visible through real openings;
- mirrored/repeated instances.

An overlay plane or front projection that leaves sides/back unowned is not
surface coverage.

Record UV seams, island padding, texel density and intended atlas region.
Mirrored UVs are allowed only when asymmetrical wear, text, navigation marks or
handed decals do not require unique space.

Color-space rule:

- base color and ordinary emissive color: sRGB input;
- roughness, metalness, AO, height and normal data: linear/non-color input;
- normal maps use the target renderer's expected tangent convention and are
  checked on the exported mesh, not only in an authoring tool.

Procedural DCC shaders that the target format cannot reproduce must be baked or
re-authored in the runtime material system. Never deliver a look that exists
only in Blender/Cycles while the game receives flat defaults.

## 4. Glass, lenses and emission

Transparent materials remain limited to physically transparent prototypes.
The geometry contract in SKILL.md and verification-visual-loop.md still owns
real openings and the transparency double audit.

- canopy/window glass: dielectric, non-metal, finite thickness when edge/tint
  matters, ordinary non-emissive glazing;
- coloured thick glass: use thickness-dependent absorption where the target
  renderer supports it, otherwise document the bounded approximation;
- clear lens: separate from contained bulb/flame/emissive element;
- emissive mesh: owns visible glow only; a separate bounded light source owns
  illumination when the renderer requires it;
- black glass is not a substitute for an absent interior.

Verify front and grazing angles. A material that reads as opaque metal at one
angle or disappears due to winding/culling fails even if its opacity number is
correct.

## 5. Diagnostic and acceptance lighting

Maintain at least two lighting roles:

1. **neutral diagnostic** — broad, repeatable illumination that exposes normals,
   facets, waviness, z-fighting, glass boundaries and material separation;
2. **acceptance/character** — the approved studio/day/night look, still unable
   to conceal construction.

Scale light size, distance and intensity from recovered object bounds; fixed
world coordinates suitable for a one-metre prop are invalid for an aircraft or
building. Aim lights at the canonical bounds/target, not at an assumed origin.

Provide reflection information for metals and glass through environment or
large area sources. A black world with point lights can make correct metal look
like matte plastic; an overbright rim can erase transparent volume.

For practical/on-object lights, the fixture construction and minimum readable
surface radius from SKILL.md §9.1 remain mandatory. Keep a bounded ambient fill
only to reveal the carrier; it may not overpower the practical source.

## 6. Color management and render convergence

Freeze color-management settings per capture revision: view transform, exposure,
white balance/look and output color space. Do not tune geometry acceptance by
changing exposure between views.

For path-traced acceptance renders:

- use adaptive sampling and a documented denoiser where available;
- increase transmission paths for glass-rich views;
- inspect whether denoising removes thin struts, wires, grille lines or sharp
  material boundaries;
- save lossless PNG/EXR intermediates; encode animation/video only afterwards;
- record render engine/version and material adapter revision.

Draft renders may be faster/lower sample but must keep the same geometry,
camera, materials, color transform and lighting layout unless the manifest
explicitly marks the changed diagnostic setting.

## 7. Target-renderer parity

The runtime/target renderer is authoritative for deliverability. After an
authoring-tool render passes:

- load the compiled/exported artifact through the same material adapter the
  world will use;
- compare material ids, base color, metalness, roughness, transmission,
  emissive ownership, normal orientation and double-sided flags;
- verify semantic groups and transparent-part inventory;
- capture the same orthographic and three-quarter cameras where possible;
- treat any difference as an adapter/export discrepancy, never as permission
  to maintain two looks.

If target constraints require a simplification, make it explicit in the
canonical/runtime material contract and recapture acceptance views.

## 8. Export and optimization

Before GLB/glTF or another runtime export:

- apply/encode transforms without changing the declared local frame;
- preserve units, handedness, up/front axes, pivots and instance transforms;
- ensure the chosen format supports every shipped material channel;
- bake unsupported procedural nodes and include/resolve texture paths;
- verify normals, tangents, UV sets, vertex colors and animation tracks;
- enforce project-specific triangle, material, texture-resolution and file-size
  budgets rather than generic internet limits;
- optimize only after an unoptimized artifact passes parity;
- reimport the optimized artifact and repeat bbox, landmark, material and render
  checks.

Decimation may remove invisible subdivision; it may not move control lines,
close grilles, merge air gaps, detach fasteners or change a rotor/intake
silhouette.

## 9. Validation matrix

| Claim | Independent evidence |
| --- | --- |
| material family | semantic id + PBR parameters |
| complete coverage | UV/material inventory by named surface group |
| no fake geometry | opening/support tests under neutral material |
| correct color space | texture binding audit |
| glass/lens truth | transparent inventory + thickness/winding + contained source |
| diagnostic readability | fixed neutral render |
| approved character | fixed acceptance render and calibrated look notes |
| target parity | compiled/exported material diff + matched-camera capture |
| optimization safety | before/after bounds, landmarks, groups and render |

## 10. Failure modes

| Failure | Correction |
| --- | --- |
| metal looks plastic | inspect environment/reflections, metalness class and roughness |
| paint uses partial metalness | keep coating dielectric; mask exposed metal separately |
| normal/roughness texture looks wrong | bind as linear/non-color and verify tangent convention |
| front looks detailed, sides blank | require closed-surface UV/material coverage |
| Blender render passes, game render fails | fix one material adapter/export contract |
| black canopy conceals empty cabin | model interior; glass stays ordinary dielectric |
| denoiser erases grille/strut | raise convergence or protect real geometry; do not thicken blindly |
| optimization changes silhouette | revert and reduce only non-defining complexity |

## Method provenance

The PBR classification, color-space, closed-surface coverage, scale-aware
lighting and export-parity patterns are adapted from the MIT-licensed
`RobLe3/cc-blender-skill` material/lighting/render/export stack. Renderer-
specific numeric recipes are intentionally not copied; repository material,
physics, capture and adapter contracts own the implementation.
