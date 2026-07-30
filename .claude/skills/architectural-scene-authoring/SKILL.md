---
name: architectural-scene-authoring
description: Build, revise, diagnose, or audit reference-faithful physical places and architectural forms in Make a Mess. Use for buildings, stations, platforms, monuments, bridges, streets, public interiors, façades, roofs, canopies, glazing, curved shells, vehicle exterior/interior architecture, fixture mounting, architectural lighting, player access, urban composition, promenades, embankments, LRT exits, visual comparison with photographs, unsupported scene pieces, or any request to make an authored place physically and visually match reality.
---

# Architectural Scene Authoring

Treat the authored result as one spatial contract: reference form, human use,
material, light, collision and structural support must describe the same place.
Do not substitute an implementation report for a verified scene.

## Load the contract

Before changing code, read
[`games/make-a-mess/docs/physical-architecture-guide.md`](../../../games/make-a-mess/docs/physical-architecture-guide.md)
completely. It defines the shared quality bar, owner boundaries, autonomous
design process, causal-detail rules, diagnostic order and acceptance matrix.

Then read these architectural contracts completely:

1. [`games/make-a-mess/docs/architectural-authoring.md`](../../../games/make-a-mess/docs/architectural-authoring.md)
   for research, geometry passports, buildings, public space, materials,
   landmark light and urban integration;
2. [`games/make-a-mess/docs/geometry-lessons.md`](../../../games/make-a-mess/docs/geometry-lessons.md)
   for exact topology, transforms and independent acceptance tests.

The architectural guide owns the workflow. The geometry lessons provide its
low-level mathematical contract and do not replace it.

Read these in addition when relevant:

- island shell, terrain, structural solver and deterministic frames:
  [`.claude/skills/world-building/SKILL.md`](../world-building/SKILL.md);
- Astana plan, scale, inventories and object passports:
  [`games/make-a-mess/docs/astana-brief.md`](../../../games/make-a-mess/docs/astana-brief.md);
- exact Khan Shatyr geometry:
  [`games/make-a-mess/docs/khan-shatyr-geometry.md`](../../../games/make-a-mess/docs/khan-shatyr-geometry.md);
- transport construction and solver lessons:
  [`games/make-a-mess/docs/transport-lessons.md`](../../../games/make-a-mess/docs/transport-lessons.md);
- airborne carrier dynamics: use `$airborne-vehicle-authoring` and its
  normative dynamics contract.

Inspect the current implementation, compiler/runtime owners and targeted tests
after reading the applicable documents. Do not trust remembered constants or
assume existing code is reference-correct.

## Work in acceptance-sized milestones

For a substantial object, complete and report each milestone before the next
large implementation block unless the user requests uninterrupted end-to-end
delivery.

### 1. Audit and protect scope

- Read repository instructions.
- Inspect the dirty tree; stop if another active agent is changing the same
  files.
- Do not repair defects in a foreign object unless the user explicitly adds it
  to scope.
- Do not start, restart or kill the shared frontend when another agent owns it.
- Locate the object passport, authoring helpers, scene document, compiler,
  intact/dynamic renderers and tests.
- Record the existing piece count, unsupported baseline, relevant test result
  and deterministic control frames.
- Write the protected scope explicitly: physics, livery, ids, placement or
  other elements the request excludes.

### 2. Convert references into invariants

- Require front, profile, both three-quarter views, roof/high view, important
  joints and night when lighting matters.
- Distinguish photographs, drawings and concept renders; record conflicts.
- Mark each value as published, derived, calibrated, estimated or authored.
- Extract countable topology, one scale, proportions, control lines, curvature
  changes, material boundaries, openings, support points and human routes.
- Write the short rejection list: conditions that fail the object even when its
  silhouette looks plausible.
- Map every invariant to a named parameter, an independent test where possible
  and a control camera.
- Do not start detailed geometry from one attractive perspective.
- When the requirement is qualitative, extract its geometry instead of asking
  the user for coordinates. “Whale, not bomb” already implies length, taper,
  asymmetric forehead, continuous nose and tail profiles.

### 3. Establish the place before the skin

- Fix local axes, vertical datum, footprint and relation to terrain/path.
- Use true scaled bounds and natural material colours in the blockout; do not
  substitute a flat footprint when height balance is the actual decision.
- Build the primary silhouette and negative spaces first.
- Prove the main player route in both directions.
- Accept front, profile and diagonal gray-box views before fittings.
- Keep one scale across the object; document deliberate gameplay exceptions.

### 4. Build exact form from shared sources

- Create canonical points, edges and profiles once; make adjacent surfaces
  share them.
- Build rods from their endpoints and complex orientation from a basis.
- Use boxes for planar volumes, `visualProfile` for simple planar outlines,
  `visualMesh` for double curvature and exact glazing, and a sampled surface
  function for repeated shells.
- Match tangents and, where the specular silhouette requires it, curvature.
- Build openings as holes in the shell; separate body, dark mask, glass and
  frame.
- Build fixture support chains (`surface → base → bracket → device`) before
  decorative detail.
- Preserve protected livery and physics while correcting their carrier form.
- Derive mounted-device clearance from the actual outer surface. A device whose
  coordinates exist but whose volume is buried inside the shell is not visible
  or physically mounted.

### 5. Reconcile visual, collision and support models

- Keep exact visual geometry, player collision and structural contacts separate
  but spatially consistent.
- Author `contactBoxes` in local coordinates and use honest `volume`,
  `bearingArea`, `bearsLoad` and `carriesAttachments` values.
- Prove zero unsupported pieces across the whole scene, not only the edited
  cluster.
- Check that new exact geometry renders in both intact and dynamic paths.
- For public places, run the real capsule through each entrance and vertical
  route separately, including working zones and head clearance.

### 6. Author material and light from physical sources

- Make metal, plastic, glass, stone and paint differ by optical response, not
  only color.
- Keep flat graphics in texture/UV/palette carriers; use geometry only for
  thickness, shadow and real gaps.
- Separate visible fixture, emissive surface and actual light.
- Root spotlights at the physical lens, derive direction from the same carrier,
  and verify the real illuminated target.
- Check day, evening and night transitions and route legibility.
- Verify physical light radius and shared-pool selection separately. A correct
  close view does not prove that a landmark remains lit in a flyover.

### 7. Integrate the city and landscape

- Start from destinations, exact entrances, station exits and natural desire
  lines; draw paths and roads afterward.
- Turn every LRT exit into a deliberate arrival space connected to the route
  graph, never a path placed approximately near the station.
- Make rings and path necklaces enterable from one or both justified sides,
  materially graded and useful. Fill meaningful branch spaces with planting,
  water, light or a small plaza.
- Preserve view corridors and air between landmarks. Recheck every footprint
  against all public entrances.
- Treat both riverbanks and bridge approaches as continuous public routes.

### 8. Run the autonomous comparison loop

- Capture the same front, profile, both diagonal, high, joint and night views.
- Compare in the order silhouette → control lines → negative space → volumes →
  glazing → joints → material → light → detail.
- Write concrete discrepancies and identify the owning profile/function.
- Correct one form class, capture again and continue without waiting for the
  user to identify visible defects.
- Prefer local correction when topology can express the invariant. Rebuild only
  after proving the topology is insufficient.

### 9. Verify and hand off

Run, at minimum:

```bash
npx tsc --noEmit
npx eslint <changed-files>
node --test <object-tests> <structure-tests> <walkability-tests>
```

Also verify:

- exact counts only for reference-defined or functional invariants;
- dimensions, endpoints, tangent/curvature continuity and maximum error from
  compiled pieces;
- whole-scene initial support and relevant destruction behavior;
- player access in both directions;
- dynamic movement for platforms, vehicles or attached effects;
- matched-reference screenshots after the last code change.

Report unrelated baseline failures separately. Do not weaken a new invariant to
make an unrelated suite green.

## Non-negotiable rules

- Never add detail to compensate for a wrong primary silhouette.
- Never replace an exact count, common vertex, face normal or defining angle
  with a visually similar rhythm.
- Never claim joined rods meet until their compiled world endpoints have been
  independently reconstructed and measured.
- Never model reference-critical geometry from a single perspective.
- Never call a polyline smooth when its tangent or visible normal jumps.
- Never treat a dark windshield mask as one oversized glass pane.
- Never place glass or a door on top of a solid wall instead of making a real
  opening.
- Never use a decorative stripe to fake missing body curvature.
- Never create an artificial roof hump to hide a bad roof-to-front transition.
- Never leave a canopy, device or light without a visible attachment path.
- Never start a beam in empty space in front of its fixture.
- Never turn livery or flat ornament into a stack of physical stickers.
- Never accept unsupported pieces, hidden decorative supports or a collider
  that closes the visible passage.
- Never validate geometry only through the helper that constructed it.
- Never rebuild an object after the user asked for correction unless the
  existing topology is demonstrably incapable of the required form.
- Never claim visual completion without current matched-view evidence.
- Never silently include a foreign repair in the architectural diff.
- Never change the shared hinge policy for ordinary doors to make a cargo ramp
  open correctly; give a different articulation its own semantic policy.

## Handoff

Lead with the visible and functional outcome. Include:

- which reference invariants now own the form;
- which protected areas remained unchanged;
- result of support, walkability, movement and lighting checks;
- targeted and broader test results;
- links to the normative guide and main implementation/test files;
- actual residual discrepancies, if any.

If the user asked for a picture, provide the final current frame, not a prose
promise to capture one later. When final visual control belongs to the user or
another agent, say **ready for visual acceptance**, not **visually accepted**.
Do not stage or commit unless requested.
