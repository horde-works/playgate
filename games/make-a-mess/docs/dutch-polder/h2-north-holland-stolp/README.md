# H2 — North-Holland stolp farm / rear tail

Status: standalone structural model for visual review. It is not compiled into
the Dutch polder scene.

Canonical geometry:
`src/content/objects/dutchHouses/northHollandStolpFarmObject.ts`.

Capture command:

```sh
node scripts/capture-north-holland-stolp-object-lab.mjs
```

## Source hierarchy

1. [Beemsters Wapen, Rijksmonument 511363](https://www.monumenten.nl/monument/511363)
   owns the 1884 North-Holland stolp identity: rectangular main plan, internal
   timber vierkant, six-bay symmetrical brick residence, two pairs of garden
   doors, timber dars wall, rear dars doors and a rear tail where the hipped
   roof changes to a gabled roof.
2. [Boerderijenstichting Noord-Holland](https://www.boerderijenstichting.nl/beeldbank/)
   owns the type invariant: a pyramidal, square-plan shell supported by a
   four-post timber vierkant. Its normalstolp description also fixes the
   dwelling at the front, dars and stable parallel behind it, and tail additions
   as service expansion.
3. The concept image owns only the object's world role and readable rural
   silhouette. It does not own construction or dimensions.

## Metric contract

| Quantity | Value | Confidence |
| --- | ---: | --- |
| main stolp wall footprint | 14.60 × 13.40 m | authored |
| full wall depth with tail | 19.30 m | derived |
| main eave | +3.25 m | authored |
| crown | +10.70 m | authored |
| complete roof envelope | 15.44 × 20.53 m | derived from final roof vertices |
| internal vierkant | 7.40 × 7.00 m | authored construction reconstruction |
| rear tail | 5.00 × 7.20 m | authored |
| world clearance radius | 13.00 m | derived from complete roof envelope |

The former `14.6 × 13.4 m` “envelope” was only the main wall footprint. It
could not include a real 7.2 m tail. H2 now carries three independent bounds:
main wall, combined wall and complete roof. At the planned island position the
larger reserve reduces shore clearance from 12.8 m to approximately 9.8 m but
does not force a larger island.

## Construction logic

- Four 0.38 m posts, four top plates and eight knee braces form the vierkant.
- Outer rafters run from the eaves to the vierkant plates. Inner principal
  rafters continue from those same bearings to the short crown ridge.
- The large roof uses four shared-profile planes, hip caps, tile courses and
  separate dark-front/warm-side tile systems visible in the source.
- The residential face has six real openings: four windows and two pairs of
  double garden doors. Four rusticated pilasters divide the same three façade
  fields as the reference.
- A shallow brick cross-gable enters the front roof through two explicit metal
  valleys and a continuous weather underlay.
- The barn side is individual timber lap geometry with three stable windows.
  The rear dars opening has two leaves, two jambs, a header and three hinges per
  outer leaf edge.
- The offset tail has its own sill/post/tie/rafter frame. It passes through an
  open rear bay with two posts and a header; its gable roof emerges beneath a
  continuous rear weather plane and two flashings.

## Review views

- `front`: six-bay residence and cross-gable hierarchy;
- `left`: timber dars wall and three stable windows;
- `rear`: paired dars doors and offset tail gable;
- `right`: brick dwelling-to-timber service transition;
- both three-quarter views and `high-three-quarter`: dominant pyramid plus two
  deliberately unequal roof interruptions;
- `vierkant-cutaway`: four-post load path from ground to crown;
- `tail-junction-cutaway`: open rear bay, tail frame and flashing support;
- `silhouette`: material-neutral recognition.

## Rejection checks

- ordinary cottage enlarged under a pyramid;
- roof visually carried by the exterior walls while the vierkant floats inside;
- tail omitted from the world clearance radius;
- front cross-gable or tail roof represented by intersecting closed shells
  without underlay, frame and flashing;
- six black decals on a solid front wall instead of six openings;
- paired doors with missing leaves, one-sided hinges or hinges detached from
  the jambs;
- residential and barn halves distinguished only by colour;
- a centred/symmetrical tail that erases the service asymmetry;
- any wind or rotor contract inherited by this static house.
