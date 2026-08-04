# Dutch polder landscape kit — evidence and acceptance card

Status: canonical standalone kit, before scene adapter.

## Source ownership

- Rijksdienst voor het Cultureel Erfgoed monument descriptions own the bridge
  hierarchy: timber deck on beams/posts, masonry or piled abutments, timber
  railings and explicit metal joints where a mechanism requires them.
- Zaans Museum owns the ensemble rule: the small-scale Zaan landscape is read
  as one maintained system of wooden buildings, paths, fences, canals and
  flowerbeds.
- Nederlands Openluchtmuseum owns the working-garden distinction: vegetable
  and flower beds are separate cultivated strips used for sowing, weeding and
  harvesting, not a flat ornamental colour field.
- The historical `schouw` construction family owns the flat bottom and simple
  raked board ends; the yard-kit passport owns the 4.60 × 1.45 m envelope.
- The yard study PNGs own the accepted visual character of the schouw,
  mooring-post module and private jetty. The fixed PNGs in this directory are
  the canonical geometry proof, not a second design.

Sources:

- https://monumentenregister.cultureelerfgoed.nl/monumenten/520609
- https://monumentenregister.cultureelerfgoed.nl/monumenten/339227
- https://zaansmuseum.nl/en/see-do/wooden-dreams/
- https://www.openluchtmuseum.nl/nl/verdiep/de-tuinen-van-het-huis-van-herinnering
- https://nl.wikipedia.org/wiki/Schouw_(historisch_scheepje)
- https://www.johvdmeulen.nl/schouw-bouwen/

## Authored dimensions

- bridge clear water span: `4.20 m`;
- finished deck width: `2.52 m`;
- crown rise: `0.40 m`;
- compacted shell path: `2.20 m` over a `2.50 m` earth sub-base;
- retaining masonry module: `5.00 m`;
- raised field-bed module: `4 × 0.82 × 6.00 m` ridges;
- timber revetment module: `6.40 m`.
- schouw: `4.60 × 1.45 m`, `0.15 m` light draught, waterline at local `y=0`;
- mooring posts: two `1.60 m` piles at `3.20 m` centres;
- private jetty: `2.40 × 1.10 m`, deck top `0.30 m` above its local waterline;
- timber field-fence module: `6.00 m`, four driven posts and two rails;
- hedgerow module: `6.00 m`, seven woody stems beneath overlapping crowns;
- pollard-willow module: one trunk, five cut-back branches and five separate
  regrowth crowns.

These are game-world decisions constrained by a full player route and the
already authored channel widths. They are not presented as published heritage
measurements.

## Rejection conditions

- deck or rails end in air instead of bearings/posts;
- bridge axis runs along the canal rather than across it;
- one monolithic stone-coloured slab replaces coursed masonry;
- flower colour is painted on ground without beds, stems and blossoms;
- sheet piling relies on water as support instead of walers and land anchors;
- finished path is wider than its sub-base or floats over a terrain step.
- a hedge is a row of foliage blocks without woody stems;
- a schouw gains a keel, pointed stems, cabin or yacht-like fittings;
- a mooring pile has a flat top or loses its forged ring;
- a private jetty gains a railing, loses one of its seven deck boards or puts
  its steps anywhere except the water end;
- a pollard willow is a generic tree silhouette without the cut crown and
  visible regrowth branches;
- fences, hedges or willows are redrawn ad hoc in the world instead of placed
  from the canonical field-edge prefabs.

## Integration rule

Scene prefabs must be generated from the exact canonical parts grouped here.
World placement may rotate or repeat a module, but may not rebuild a simpler
schouw, mooring module, jetty, bridge, wall, field, revetment, willow, fence or
hedge in a scene-only helper.
