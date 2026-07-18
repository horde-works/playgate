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

Wall courses are generated against real opening bounds, so doors, windows, and
corners receive fitted full/half/cut pieces automatically. Tiled surfaces use
the same boundary rule: adjacent floor, deck, roof, and lawn cells meet without
hidden air gaps.

## Useful commands

- `npm run dev`: start local development
- `npm run build`: verify the production build
- `npm test`: build and verify the hero, catalog, and game routes
