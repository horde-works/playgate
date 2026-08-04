# Discrepancy pass 05 — small peat store, revision a9

## Fixed-camera review

- The corrected fuel courses now have substantial plan overlap with the grounded bulk, and the high detail view exposes the alternating chevron layout.
- `peat-store-profile` exposed a separate roof joint error: all three rafter centrelines lay in the roof-skin centre plane, leaving half of each structural section visibly above the weather surface.

## Correction owned by revision a10

- Lower all three rafter centrelines `0.08 m` while keeping their slope and exact X stations.
- Their ends remain inside the front/rear wall plates; their upper faces now meet the underside of the roof skin instead of penetrating its top.
- Lower both knee-brace endpoints by the same amount so each brace still terminates on its side rafter.
- Replace the centreline-inside-roof test with an independent oriented-section overlap test that includes roof and rafter half-thicknesses.

No other yard-kit geometry changes in this pass.
