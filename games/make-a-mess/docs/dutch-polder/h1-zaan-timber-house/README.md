# H1 — Zaan timber merchant house / workshop

Status: first standalone structural model for review. It is not compiled into
the Dutch polder scene.

Canonical geometry:
`src/content/objects/dutchHouses/zaanTimberMerchantHouseObject.ts`.

Capture command:

```sh
node scripts/capture-zaan-timber-house-object-lab.mjs
```

## Source hierarchy

1. [Het Jagershuis](https://www.zaanseschans.com/en/trash-treasures-het-jagershuis/)
   owns the 1623 timber-merchant identity, black tarred exterior, Gothic
   glazing, shaped front gable and carved crown post.
2. [Kalverringdijk 8](https://www.zaanseschans.com/en/kalverringdijk-8/)
   confirms that the crown post is a rafter/ridge connection rather than a
   floating ornament, and that a shore-side service volume belongs to the
   house system.
3. The concept image owns only the world role and readable domestic massing.
   It does not set the house dimensions or construction.

## Metric contract

| Quantity | Value | Confidence |
| --- | ---: | --- |
| nominal wall footprint | 7.20 × 10.80 m | authored |
| narrow main-body width | 4.80 m | authored |
| eave | +3.35 m | authored |
| roof ridge | +7.15 m | authored |
| roof envelope with overhangs | 7.47 × 11.16 m | derived |
| attached workshop | 4.20 × 4.80 m | authored |
| transverse timber yokes | 5 | authored construction reconstruction |
| crown-post top | +7.68 m | derived from the shaped gable |

The `10.8 × 7.2 m` plan value means wall depth × full wall width. It is not a
box inflated around every roof overhang. The roof has its own recorded
envelope and both remain within H1's 7.3 m world clearance radius.

## Construction logic

- Five transverse yokes, side posts, tie beams and knee braces carry the main
  body independently of the weather cladding.
- Each yoke continues into paired rafters, collars, purlins and one continuous
  ridge beam.
- Side walls use individual overlapping courses; the front gable uses vertical
  boarding behind a geometric shaped outline.
- White gable trim follows the same contour points as the gable face.
- The crown post connects into the ridge zone before receiving its carved
  diamond and finial.
- The workshop overlaps the main body, has its own sill/post/tie/rafter frame,
  and meets the house through a header, two posts and a brace. A butt-jointed
  decorative box is rejected.
- Main and workshop roofs have explicit course lips so a long side elevation
  reads as tiled roof rather than a vertical blank slab.

## Review views

- `front`: shaped merchant gable, shop glazing and workshop hierarchy;
- `left`: 10.8 m deep main body and three side windows;
- `rear` / `right`: asymmetric service volume;
- `three-quarter-left` / `three-quarter-right`: exterior junction and massing;
- `high-three-quarter`: main/workshop roof intersection;
- `frame-cutaway`: five yokes and roof load path;
- `junction-cutaway`: independent workshop frame and framed connection;
- `silhouette`: material-neutral recognition.

## Rejection checks

- generic triangular cottage gable;
- open or transparent rear gable that exposes roof framing in the exterior
  view;
- main body widened until it loses the narrow/deep Zaan proportion;
- cladding treated as the load-bearing frame;
- crown post detached from the ridge;
- workshop roof or frame merely intersects the house without a constructed
  junction;
- primary rafters penetrating the finished roof surface;
- a window or door floating away from its frame or wall plane;
- dimensions labelled as an overall envelope when they describe only the wall
  footprint.
