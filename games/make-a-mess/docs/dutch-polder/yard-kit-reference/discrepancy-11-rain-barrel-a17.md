# Discrepancy pass 11 — rain barrel, revision a17

## First fixed-camera review

- `rain-barrel-front`: twelve stave sectors, three forged hoops, both brick supports and the wall-side downspout read correctly.
- `rain-barrel-profile`: the downspout outlet clears the barrel top by the specified `0.15 m`; the barrel is carried at brick-top level.
- `rain-barrel-three-quarter`: the open vessel, closed stave walls and downspout-to-barrel service chain read correctly.
- `rain-barrel-high`: the top is genuinely open and the internal bottom head is visible; there is no image-only dark cap.
- The first `rain-barrel-support-detail` camera superimposed the two bricks, so it did not prove the two-point support even though the geometry and test did.
- The first high views did not expose the hollow square section of the dark downspout clearly enough.

## Correction owned by revision a17

- Replace only the support-detail camera with a front orthographic view that resolves both brick boxes and their positive overlap with the lower stave ring.
- Add `rain-barrel-outlet-detail`, viewed upward from below, so the square outlet void and the clear discharge path into the barrel are visible.
- Preserve the accepted geometry, material contract and all ten earlier yard objects.

## Final verification

- Canonical revision/hash: `landscape-kit-a17-2026-08-04` / `ac7e537d4b16`.
- Object inventory: `18 / 20` parts — twelve staves, one bottom head, one three-component hoop mesh, two bricks, one hollow downspout and one two-component bracket mesh.
- Eleven-object yard-kit inventory: `383 / 600` parts. The complete landscape study remains `571 / 600`; the standalone shed remains `120 / 220`.
- Geometry tests: `29 / 29` passing.
- Prefab/material tests: `10 / 10` passing.
- Runtime binding is opaque: `timber-mid` staves/head, `timber-dark` downspout, `metal` hoops/brackets, `brick` supports.
- No world-placement, terrain, route, parcel or reserve file is part of this revision.

## Capture fingerprints

- `rain-barrel-front.png`: `6c0db4402b600f5edc100c37e859871f05d0b21fbc09b8acb19c267023a2f456`
- `rain-barrel-profile.png`: `e39d5f13380c874fe2fb56af6956873c5236d2fcb2dcc60569e8d17ce009b3e1`
- `rain-barrel-three-quarter.png`: `4fdfaa80b6af95c6a98986810f00b003df4d8c5b5a3fc7e1e6d15fddac2d018c`
- `rain-barrel-high.png`: `188b8dbc52a411284c94baedea408aaff83bf00296c3ba30480fe5f952e5e336`
- `rain-barrel-support-detail.png`: `6dbc5bb1bc7d664c95bc9278d00a295d9cf05bc6091e4f1b84877f2edae43aab`
- `rain-barrel-outlet-detail.png`: `bc75cc937afa518c591b2dafc8d87a86a60a410068bdc07aa8f528d5bfdd2976`
