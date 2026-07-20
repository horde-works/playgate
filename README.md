# Handmade Games

A home for small, handcrafted browser games. The first game is
**Make a Mess**, a destruction sandbox built around recognizable objects,
materials, and structural failure.

## Prerequisites

- Node.js `>=22.13.0`

## Local development

```bash
npm install
npm run dev
npm run build
```

## Firebase Hosting

The repository is linked to the `playgate-handmade-games` Firebase project.
Firebase uses a separate static export, so the existing local Vinext workflow
stays unchanged.

```bash
npm run build:firebase
npm run deploy:firebase
```

## Repository shape

- `app`: hero page, catalog, and game routes
- `games/registry.ts`: one typed entry per game
- `games/make-a-mess`: isolated game runtime, content, and tooling
- `games/make-a-mess/src/content`: typed object and material contracts

The Make a Mess destruction core stays independent from React and rendering.
The intact visual asset, structural representation, physics body, and feedback
profile are separate layers of one object definition. Structural failure uses
directed load paths, material capacity, and span/cantilever limits, so a remote
connection cannot keep an otherwise unsupported storey in the air. The same
solver runs for every assembly at scene start, after each impact, and on reset;
it contains no house-specific support rules.

Destruction uses a material-resolution voxel body behind every visible object.
The same damage function edits an attached wall section, a falling beam, or a
settled fragment; only pose, motion, and current structural connections differ.
Surviving connected components remain physical and destructible. Their true
volume and remaining bearing area feed back into the structural load solver.

Wall courses are generated against real opening bounds, so doors, windows, and
corners receive fitted full/half/cut pieces automatically. Tiled surfaces use
the same boundary rule: adjacent floor, deck, roof, and lawn cells meet without
hidden air gaps.

## Useful commands

- `npm run dev`: start local development
- `npm run build`: verify the production build
- `npm run build:firebase`: create the static Firebase Hosting bundle
- `npm run deploy:firebase`: build and deploy to Firebase Hosting
- `npm test`: build and verify the hero, catalog, and game routes
