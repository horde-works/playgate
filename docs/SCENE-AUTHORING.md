# Scene authoring model

Viking Village is the pilot for a data-first map pipeline. The three older
maps remain on their current builders until the pilot proves the model in
play; there is no risky all-at-once migration.

## Flow

```text
serialized scene document
        +
versioned prefab library
        |
        v
scene compiler + validation
        |
        v
existing destruction scene/runtime
```

The authored document contains only serializable values: groups, primitive or
prefab instances, transforms, palettes, surface treatments, lights, hinges and
physical contact proxies. Procedural layout code may generate this document,
but the generated result can be saved as JSON and later produced by a visual
editor without changing the runtime.

## Physical contract

Every visible authored part is a normal breakable piece. A prefab does not get
special physics after compilation. Logs, roofs, cloth, shields, furniture,
terrain and vegetation all reach the same material, support, fracture and
collision systems used by the existing maps.

Complex or rotated shapes may supply small contact boxes. These are physical
support points rather than hidden indestructible braces. The compiler refuses
to load a scene whose intact state contains unsupported pieces. Thin or sparse
objects may also specify their physical volume so foliage and cloth do not
behave like solid blocks.

## Files

- `games/make-a-mess/src/content/scenes/sceneContract.ts` — serializable schema.
- `games/make-a-mess/src/content/scenes/compileScene.ts` — compiler and intact-state validation.
- `games/make-a-mess/src/content/prefabs/vikingPrefabs.ts` — reusable Viking object kit.
- `games/make-a-mess/src/content/scenes/vikingVillageDocument.ts` — pilot scene document.

An editor can therefore operate on the document and prefab contracts instead
of importing React, Three.js or the physics runtime.
