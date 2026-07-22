# Playgate — Architecture & Engine Specification

Playgate is a home-made collection of small, hand-built games. Its centrepiece
is **Make a Mess**, a real-time destruction sandbox: every wall, arch, rail and
fitting is an individual body that knows what it is made of, what holds it up
and how it should break. Three maps share one engine — an open block of houses
(`open-house`), a mountain fortress (`minas-tirith`) and a railway museum
(`grand-terminal`).

This document describes the whole system: the web application, the destruction
engine, the rendering and physics pipelines, the authoring model for maps, and
the internationalisation layer.

---

## 1. Technology stack

| Layer            | Choice                                                             |
| ---------------- | ----------------------------------------------------------------- |
| App framework    | React Server Components on a Vite-based Next-compatible runtime (`vinext`) |
| 3D               | three.js `0.185` via `@react-three/fiber` + `@react-three/drei`   |
| Physics          | Rapier via `@react-three/rapier`                                  |
| Post-processing  | `three/examples` EffectComposer, `n8ao`, custom shaders           |
| Language         | TypeScript (strict), plain-JS ESM Node test runner                |
| Deploy target    | A Cloudflare-style worker (`dist/server/index.js`)                |

There is no game server: a map is a **pure data description** compiled at import
time into an immutable scene object. All simulation runs on the client.

---

## 2. Repository layout

```
app/                     Web app (RSC): landing, catalogue, per-game routes
  components/            SiteHeader, GameCard, HomeView, CatalogView, LanguageSwitcher
  i18n/                  config, dictionary, LanguageProvider (see §9)
  globals.css            All styling
games/
  registry.ts            The catalogue: one entry per game
  make-a-mess/src/game/  The engine + the three scenes (see §3)
tests/                   Node test-runner specs (*.test.mjs), run against source and dist
docs/                    This document
```

### Engine modules (`games/make-a-mess/src/game/`)

| Module | Responsibility |
| ------ | -------------- |
| `destructionScene.ts` | Scene model: materials, shapes, clusters, pieces, `createDestructionScene`, structural material profiles |
| `structuralPhysics.ts` | The static structural solver (support graph, cantilever, overload) |
| `destructionRuntime.ts` | Runtime fracture: shards, remnants, local fracture, settle |
| `voxelFracture.ts` | Cubic voxel fragmentation of a struck piece |
| `runtimeStructure.ts` | Incremental structural re-evaluation after a break |
| `spatialIndex.ts` | Broad-phase spatial hash for hit tests and neighbour queries |
| `occupancyGrid.ts` | Bit-occupancy grid of the static world (DDA ray marching) |
| `bakedLighting.ts` | Per-piece baked corner AO + sky exposure |
| `worldLightingBake.ts` | Incremental re-bake as the world is destroyed |
| `intactWorldBatching.ts` / `IntactBreakableWorld.tsx` | Instanced rendering of the un-broken world |
| `DynamicBreakableWorld.tsx` | Instanced rendering of shards/remnants and lit-glass quenching |
| `staticColliders.ts` | Chunked trimesh colliders for the static world |
| `materialTextures.ts` | Procedural materials + `onBeforeCompile` shader injection |
| `materialAppearance.ts` | Wetness, streaking and per-material surface tuning |
| `boxFaceMasks.ts` | Per-face exposure masks from sibling adjacency |
| `silicateJoints.ts` | Mortar/joint banding between masonry pieces |
| `WorldEnvironment.tsx` | Sky, fog, day/night cycle, pooled lamp lights |
| `CinematicPostProcessing.tsx` | The always-on post pipeline (AO, bloom, shafts, grade) |
| `HingedDoorSystem.tsx` | Kinematic swinging doors driven by player proximity |
| `FirstPersonWeapons.tsx` | Hammer, grenade/rocket launchers, machine gun |
| `playerMovement.ts` | Capsule movement, auto-step, flight |
| `impactAudio.ts` / `impactSoundPolicy.ts` | Impact sound synthesis and budgeting |
| `MakeAMessGame.tsx` | The top-level game component, HUD and input |

The scenes themselves are `destructionScene.ts` (`open-house`),
`minasTirithScene.ts` (+ `minasTirithWorldbuilding.ts`) and
`grandTerminalScene.ts`, each wrapped by a thin `*Game.tsx` that binds the scene
to `MakeAMessGame`.

---

## 3. The scene model

A scene is a list of **clusters**, each holding **pieces**. A piece is the unit
of destruction:

```ts
interface BreakablePieceDefinition {
  id: string;                 // globally unique
  clusterId: string;
  material: BreakableMaterial; // brick, wood, stone, steel, glass, concrete, …
  shape: BreakableShape;       // brick, plank, panel, glassPane, steelSheet, stoneBlock, groundTile, cylinder
  position: [x, y, z];
  size: [x, y, z];
  color: string;
  rotation?: [x, y, z];
  contactBoxes?: { position; size }[]; // structural footprint override (see §4)
  bearsLoad?: boolean;         // per-piece override of the material default
  carriesAttachments?: boolean;
  hinge?: DoorHingeDefinition; // makes the piece a swinging door
}
```

`createDestructionScene({ id, clusters, lamps, … })` flattens the clusters into
`breakablePieces`, builds id/cluster lookup maps, constructs the structural
solver once, and exposes the query/fracture API used at runtime
(`resolveStructuralCollapse`, `structuralScopeFor`, `fractureLocallyAt`,
`settleAfterBreak`). Scenes are immutable and computed at module-load; the
runtime only ever holds a **set of broken piece ids** as mutable state.

### Materials

Each material has two profiles:

- a **runtime profile** (`materialRuntimeProfiles`): density and appearance
  inputs used for debris mass and rendering;
- a **structural profile** (`structuralMaterialProfiles`): `compressionStrength`,
  `cantilever`, `maximumVerticalGap`, `bearsLoad`, `carriesAttachments`,
  `sideAttachmentReach`, `foundation`.

Examples: `steel` is strong with a long cantilever (2.1) and a large vertical
gap tolerance (1.1); `glass`/`darkGlass` set `bearsLoad: false` so they can
never hold anything up; `earth`/`soil` are `foundation: true` (infinite,
grounded). Per-piece `bearsLoad`/`carriesAttachments` override the material
default for special cases (e.g. glazing panels that must not form a
self-supporting arch).

---

## 4. Structural solver (`structuralPhysics.ts`)

The solver decides, for any set of broken pieces, which surviving pieces are
still supported and which must fall. It is **static and binary**: a piece is
either firmly held or it detaches entirely. There is no tilting or partial
sag — a beam that loses its load path falls as a whole.

### Support graph

For every piece the solver precomputes two candidate lists using a spatial hash
(cell size 2.5):

- **vertical supports** — things it can *sit on* (`canSitOn`): bearing-patch
  overlap in X/Z, a vertical gap within `maximumVerticalGap` (and not embedded
  deeper than `MAXIMUM_DETAILED_BEARING_OVERLAP = 0.12`), and a height/rank
  ordering so a piece rests on something genuinely below or stronger.
- **side attachments** — things it can *hang off* (`canAttachToSide`): only onto
  a **wall-like** support (`support.size.y ≥ piece.size.y × 1.5`) that
  `carriesAttachments`, within `sideAttachmentReach`, with ≥18 % vertical
  overlap. Side ties may only share load toward an already-shorter path to the
  foundation, which prevents equal-level pieces forming self-supporting cycles.

`contactBoxes` let a visually complex piece declare a simpler structural
footprint (or several) — e.g. a round boiler that should bear on a saddle strip,
or a stepped bracket whose real contact is a couple of patches. When present
they replace the piece's own bounding box for all bearing maths.

### Foundations and islands

Foundation pieces (`earth`, `soil`) are stable roots, not bridges: two buildings
touching the same terrain do not merge into one recalculation island. Non-
foundation load paths form connected components; foundation cells are then
attached to whichever islands they touch. This keeps a local break from forcing
a whole-map re-solve.

### Stability and overload

`findStableStructure(broken)` grows the stable set from the foundations upward:
a piece becomes stable when its supports carry its centre of mass
(`supportsCenterOfMass`, cantilever scaled by how wide the bearing hull is) or
when a valid side tie reaches an already-stable, shorter-path neighbour. Then up
to `MAXIMUM_OVERLOAD_PASSES = 8` overload passes distribute weight down the
support graph by contact area and drop any piece whose load exceeds its
`supportCapacity` (bearing area × compression strength, with a column bonus).
Anything not in the final stable set is released.

`resolveStructuralCollapse(broken)` returns exactly the set that should fall.
Every scene ships **zero unsupported pieces before the player touches it** —
this is asserted in tests and re-checked after every authoring change.

---

## 5. Runtime fracture (`destructionRuntime.ts`, `voxelFracture.ts`)

When a weapon hits a piece:

1. **Hit test** — `readBreakableHit` resolves the struck piece via the spatial
   index and the Rapier ray.
2. **Local fracture** — `fractureLocallyAt` breaks the struck piece and, for
   rockets/explosions, nearby pieces within a blast radius, producing cubic
   **voxel fragments** (`voxelFracture.ts`) as *shards* (small, fully dynamic)
   and *remnants* (larger surviving chunks that keep the parent's material and
   shape).
3. **Settle** — `settleAfterBreak` runs the structural solver on the new broken
   set and releases everything that lost support, so a cut column drops the
   floors above it.

Fragments and remnants become dynamic Rapier bodies rendered by
`DynamicBreakableWorld`. A broken lit-glass fixture is **quenched** (its emissive
is dropped) so shattered windows and lamps go dark.

### Rounds are faceted, not sliced

The `cylinder` shape exists, but the preferred way to build anything round that
should break well is a **faceted stack of ordinary boxes** — a stepped octagonal
silhouette (`addFacetedCylinder` in `grandTerminalScene.ts`). Boilers, chimneys,
wheels, columns and barrels are built this way. A hit then carves the same cubic
voxel debris as every wall, instead of an axial "slice" that reads as an error.
This is the house pattern for round destructibles.

### Filling gaps between straight walls and curved roofs

A recurring modelling problem is the crescent gap where a rectangular wall meets
a round roof. The house solution is a **faceted gable** (`addFacetedGable`): a
short stack of ever-narrower boxes that traces the roof's ellipse, each box a
plain voxel-breakable body. This closes the gap without a bespoke curved mesh
and without leaving a hole.

---

## 6. Rendering

### Instanced batching

The static, un-broken world is drawn with `InstancedMesh` batches, split by
`geometryKind` (box vs. faceted-round vs. ground tile). Per-instance data is
uploaded as instanced attributes:

- `materialAnchor` — object-space texture anchoring;
- `bakedAoA` / `bakedAoB` — 8-corner baked ambient occlusion;
- `bakedSkyExposure` — how much open sky the piece sees;
- `silicateJointBand` / `silicateJointTint` — mortar banding;
- `materialFaceMaskPos` / `materialFaceMaskNeg` — per-face exposure masks so a
  face buried against a sibling is not lit or bevelled like an exposed one.

When pieces break, only the changed instances are diffed out of the intact batch
and handed to the dynamic renderer, keeping draw calls flat.

### Materials and shaders

`materialTextures.ts` builds procedural `MeshStandardMaterial`s and injects GLSL
via `onBeforeCompile`: sun-tinted depth fog, wet-ground reflectance at grazing
angles, and baked-AO/sky-exposure sampling. The shader cache key
(`customProgramCacheKey`) is versioned (`material-space-v6`) so material variants
don't collide. Lit glass (`litWindowColor`) carries an emissive that the day/night
cycle ramps up after dusk — this drives glowing signage such as the terminal's
departures board.

### Post-processing (`CinematicPostProcessing.tsx`)

An always-on EffectComposer chain: `N8AOPass` (screen-space AO over the baked
AO) → `UnrealBloomPass` → a custom cinematic shader (28-tap sun shafts marched
toward the sun, a glare halo and lens-dirt that only light up when the sun disc
is actually visible, plus a gentle grade) → `OutputPass` (AgX tone mapping) →
`SMAAPass`. Because the composer path bypasses MSAA, `shadowMap.autoUpdate`
stays on and SMAA resolves edges.

### Environment (`WorldEnvironment.tsx`)

Sky, sun-tinted fog and a day/night cycle whose fog and sky distances scale with
the map's `worldRadius` (so a round map's dome edge never shows as a band). A
`LampLightPool` keeps a small fixed set of real `PointLight`s and assigns them to
the nearest lit lamps with hysteresis — the forward renderer has no light
culling, so the pool bounds light count while keeping the illusion of many lamps.

---

## 7. Physics & player

Static geometry uses **chunked trimesh colliders** (`staticColliders.ts`) so the
collider set is cheap to rebuild locally when a region breaks. Dynamic shards and
remnants use cuboid/cylinder colliders sized to their bounding volume.

The player is a capsule (`playerMovement.ts`) with **auto-step**: a probe at
`bottomY + 0.18` lets the player mount ledges taller than ~0.22 m, which is why
porches and platform steps are sized above that threshold. Flight mode disables
gravity. `?spawn=x,y,z` teleports the player anywhere for inspection.

**Hinged doors** (`HingedDoorSystem.tsx`) are kinematic: proximity is measured to
the door-leaf centre (not the hinge pivot, so wide double doors trigger head-on),
and leaves are mounted proud of the wall so they swing without clipping. A door
carries a `hinge` field in its piece definition; the system finds them generically
per scene.

---

## 8. Authoring a map

Maps are written as data using a small `zone` builder that accumulates pieces,
then `finish`ed into clusters. Guidelines that keep a map correct:

1. **Everything stands on something.** After any change, run the scene through
   `resolveStructuralCollapse(new Set())` and require `0` unsupported. Use
   `contactBoxes` when a decorative shape needs a simpler bearing footprint, and
   `bearsLoad: false` on glazing so it can't hold itself up.
2. **Round → faceted.** Use `addFacetedCylinder` for anything round, never a lone
   `cylinder` you expect to break cleanly.
3. **Gaps → faceted gable / smaller boxes.** Close wall-to-curve crescents with
   `addFacetedGable` or a few smaller boxes rather than leaving holes.
4. **Light comes from breakable glass fixtures.** A `LampDefinition` points at a
   glass piece coloured `litWindowColor`; smashing the glass extinguishes the
   light. Glass never emits on its own.
5. **In-world signage is never translated** and is drawn as pixel-text pieces in
   the 3D scene (`addPixelText`), independent of the UI language.

---

## 9. Internationalisation (`app/i18n/`)

The entire UI — site chrome and in-game HUD — supports **English, Spanish and
Russian**, switchable live from a control at the top-right on every screen.
Translations are meaning-first, not word-for-word. The game's name *Make a Mess*
and all in-world signage are never translated.

- `config.ts` — the `Language` type, the language list/labels, and browser/stored
  preference normalisation.
- `dictionary.ts` — every UI string in all three languages (`ui`), plus per-scene
  HUD copy keyed by scene id (`sceneCopy`) and per-game catalogue copy keyed by
  slug (`gameCardCopy`).
- `LanguageProvider.tsx` — a client context. Server and first client render use
  the default (English) so hydration matches; the stored/browser preference is
  applied on mount and persisted to `localStorage`. Exposes `{ language,
  setLanguage, t }` and keeps `<html lang>` in sync.
- `LanguageSwitcher.tsx` — the EN/ES/RU segmented control, styled light on the
  site header and dark on the in-game top bar.

Server components that need metadata (the route `page.tsx` files) stay thin and
render a `"use client"` view (`HomeView`, `CatalogView`) that consumes the
context. The game HUD reads `sceneCopy[scene.id][language]`, falling back to the
scene's own copy if a scene has no translation yet.

---

## 10. Testing & verification

- **Unit/scene tests** (`tests/*.test.mjs`, Node test runner, `--experimental-strip-types`):
  structural integrity (0 unsupported), scene composition (piece counts, required
  clusters, faceted-round and hinged-door invariants, reachability of side halls),
  box-face masks, and server-rendered HTML for the site and game routes.
- **Type & build:** `tsc --noEmit` and the production `build` must be clean (two
  pre-existing unrelated failures in `minasTirithWorldbuilding.ts` and
  `worker/index.ts` are known and ignored).
- **Visual verification:** a headless Chrome driven over the DevTools protocol
  loads a route, enters the 3D scene, walks/looks/acts and captures screenshots.
  `?spawn=x,y,z` and the in-game flight mode make far corners reachable for
  inspection.

The standing bar for any change: **90/90 tests green, types clean, build green,
zero unsupported pieces**, confirmed with screenshots for anything visual.
