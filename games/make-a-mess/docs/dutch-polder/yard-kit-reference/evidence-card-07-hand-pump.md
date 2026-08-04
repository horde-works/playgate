# Evidence card 07 — cast-iron yard pump (`handpomp`)

## Identity and source hierarchy

- Object: a small private cast-iron lever pump on a square stone plate with a working wooden bucket; it is not an ornate municipal fountain or a modern decorative garden replica.
- `period manufacturer catalogue`: the Becking & Bongers model sheet published through Agriwiki establishes the private bore-pump family: a slender cast barrel, top pivot, long opposed lever and side/downturned spout. The catalogue also shows that related pumps were sold in several sizes with the same construction.
- `published agricultural typology`: Agriwiki records that cast-iron private hand pumps became common at Dutch farms and houses in the nineteenth century, and that their lever cap could be rotated around the pump body.
- `heritage record`: the Noord-Beveland monument book records a slender nineteenth-century cast-iron column pump on a square natural-stone plate. Its photographed municipal example is more ornate and does not own this small object’s fittings or dimensions.
- `documentary archaeological object`: Archeologisch Depot Utrecht establishes the coopered oak bucket family: vertical oak staves, an open top, iron hoops, iron bail handle and a boarded bottom.
- `authored passport`: the yard-kit brief owns all exact pump, spout, lever, pivot, foundation and bucket dimensions.
- Current code, ImageGen output and modern decorative products do not own hidden geometry or dimensions.

Sources:

- https://agriwiki.whapsite.nl/index.php?title=Pomp_gietijzer
- https://www.noord-beveland.nl/sites/noord_beveland/files/2022-02/Monumenten%20Boekwerk%20Noord-Beveland%2C%202004.pdf, pp. 53–54.
- https://www.archeologischdepotutrecht.nl/vindplaatsen/odijk-het-burgje-en-de-vinkenburg/twee-houten-emmers/
- `pasted-text.txt`, object passport 7.

## Local frame and envelopes

- Units: metres, 1:1. `+Y` up. The spout and bucket are toward `+Z`; the operating lever extends toward `-Z` so the bucket working zone remains clear.
- Ground datum: `y = 0`.
- Stone plate: exactly `0.55 × 0.55 × 0.12 m`, from `y = 0` to `0.12 m`.
- Cast-iron column: exactly `1.15 m` from the plate top at `y = 0.12` to `y = 1.27 m`. The passport diameter `0.14 m` is interpreted as the maximum working barrel diameter; the shaft tapers from radius `0.070 m` to `0.055 m` toward the cap. A wider foot collar is a separate fixing flange, not part of the nominal barrel diameter.
- Spout centreline: exactly `y = 0.82 m`. Its `0.22 m` projection is measured from the front surface of the nominal barrel (`z = 0.07`) to the nozzle centreline (`z = 0.29`); this keeps the downturned outlet over the near edge of the working bucket.
- Lever: exact pivot-to-tip length `0.55 m`, authored at `12°` downward toward `-Z`; the final `0.15 m` is a wooden grip. Pivot diameter: exactly `0.06 m`.
- Bucket: maximum/top diameter exactly `0.28 m`, height exactly `0.26 m`; authored bottom diameter `0.24 m` follows the documented downward taper. Its centre is `z = 0.41 m`, placing its top opening beneath the downturned spout without colliding with the stone plate at ground level.

## Named construction

- One square natural-stone plate, the sole pump ground contact.
- One low cast-iron foot flange overlapping both plate and barrel.
- One sixteen-facet tapered cast-iron barrel, maximum diameter `0.14 m`.
- One top cap that overlaps the barrel and carries the transverse `0.06 m` pivot pin.
- One cast spout made from an outward tube and a short downturned nozzle with positive overlap at the elbow. Curvature between them is compressed to their intersecting cast volumes within the fifteen-part budget.
- One metal lever from pivot to `0.40 m` along its axis and one axial oak grip for the final `0.15 m`.
- One open oak bucket mesh containing twelve real stave volumes and a raised inner bottom; the central volume above the bottom remains empty.
- One metal mesh containing exactly two exterior hoop bands.
- Three joined iron bail-handle segments running from one rim attachment over the bucket to the opposite rim.

## Load and attachment paths

- Pump: ground → stone plate → foot flange → tapered barrel → cap → pivot pin → metal lever → wooden grip.
- Spout: tapered barrel → outward cast tube → overlapping downturned nozzle.
- Bucket: ground → stave lower ends and boarded bottom → stave shell → two enclosing hoops. The iron bail terminates at opposite upper staves/rim points and is continuous through two shared intermediate joints.
- Working relation: the bucket is independent and grounded; its open top overlaps the nozzle’s vertical projection in plan, so it can actually receive water.

## Protected scope

- Preserve accepted schouw, mooring posts, jetty, yard shed, hekje, turfhok and ditch privy geometry and PNGs.
- Do not edit `dutchPolderDocument.ts`, terrain, routes, parcels, reserves or placement.
- Do not register a prefab or author a scene adapter before visual acceptance.
- Do not modify existing bridge, field or boundary families.

## Rejection conditions

- Stone plate differs from `0.55 × 0.55 × 0.12 m` or misses `y = 0`.
- Metal column height differs from `1.15 m`, maximum barrel diameter differs from `0.14 m`, or the barrel widens toward the top.
- Spout centreline differs from `y = 0.82 m`, surface-to-nozzle projection differs from `0.22 m`, or the nozzle does not turn down over the bucket opening.
- Lever chain differs from `0.55 m`, grip is not wood, pivot differs from `0.06 m`, or any segment is detached.
- Bucket differs from `Ø0.28 × 0.26 m`, is a closed/solid cylinder, lacks two hoops, floats, or its handle ends in air.
- Any pump carrier or attachment terminates without physical contact/overlap.
- The object exceeds 15 parts or reads as an ornate public monument rather than a compact yard pump.

## Invariant → parameter → test → camera

| Invariant | Parameter owner | Independent test | Fixed camera |
| --- | --- | --- | --- |
| Exact grounded stone plate | base box | recover bounds and minimum Y | `hand-pump-front`, three-quarter |
| `1.15 m` tapered `Ø0.14 m` column | flange/barrel/cap union | recover metal-column Y union and barrel mesh radii | front / profile |
| Spout at `0.82 m`, projection `0.22 m` | spout endpoints | recover centreline and barrel-face-to-nozzle distance | profile / spout detail |
| `0.55 m` lever and `Ø0.06 m` pivot | lever chain endpoints + pin radius | recover pivot-to-tip chain and diameter | profile / three-quarter |
| Complete attachment chain | interval/end-point schedule | positive overlaps from plate through grip | three-quarter / detail |
| Open `Ø0.28 × 0.26 m` stave bucket | bucket mesh | recover bounds; probe empty interior above bottom | front / high detail |
| Two hoops and attached bail | hoop mesh + three handle rods | recover two Y bands; shared handle endpoints/rim contact | bucket detail |
| No plate/bucket collision | grounded plan intervals by height | assert disjoint ground footprints; nozzle plan falls inside top opening | high / profile |
