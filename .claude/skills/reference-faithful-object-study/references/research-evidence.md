# Research and evidence

## Contents

1. Research objective
2. Source hierarchy
3. Search procedure
4. Image collection
5. Extracting invariants
6. Dimensions and uncertainty
7. Contradictions
8. Evidence-card requirements
9. Research failure modes

## 1. Research objective

Research must answer construction questions, not merely find a visually similar picture.

Before searching, list what must be learned:

- identity and regional subtype;
- normal use and location;
- primary silhouette;
- front/back/left/right topology;
- ground, water, wall or carrier relationship;
- load-bearing members;
- joints and fasteners;
- real openings and hollow volumes;
- materials and finish boundaries;
- moving parts and working clearances;
- typical dimensions when the passport is incomplete;
- variants that must not be mixed.

Write the unknowns as questions. Examples:

- Does the boat have a flat boarded bottom or only side planks?
- Does the roof fall toward the water or toward the door?
- Is the iron ring forged through a bracket or merely hung near the beam?
- Is the privy rear wall absent, or only provided with a low hatch?
- Does the pump lever pivot on a top cap or through the barrel wall?
- Is the bucket open, tapered and stave-built, or a solid cylinder?

Stop researching when every acceptance-critical question is either evidenced or explicitly marked authored. Do not stop because one attractive front view was found.

## 2. Source hierarchy

Use source authority per claim, not per page.

### Tier A — direct contract

- explicit current user correction;
- approved object passport;
- measured drawing supplied for this object;
- accepted previous canonical revision for protected parts;
- owner-selected concept direction — for visual character only, never dimensions (see imagination-pipeline.md).

These own exact values and protected appearance unless the user changes them.

### Tier B — primary documentary evidence

- dated archive photograph;
- museum collection object and inventory record;
- heritage-register description and photographs;
- manufacturer catalogue, patent or period trade drawing;
- conservation/restoration survey;
- archaeological record of the physical object;
- direct measurements of the surviving object.

Use these for topology, construction, material family, period fittings and, when stated, dimensions.

### Tier C — institutional interpretation

- museum reconstruction notes;
- official educational description;
- specialist heritage foundation article;
- scholarly typology with citations.

Use these for function and family traits. Check whether a reconstruction admits authored placement or missing evidence.

### Tier D — secondary visual evidence

- auction/listing photographs of genuine old objects;
- restoration contractor pages;
- local-history recollections;
- modern replicas that preserve a known type.

Use for views and joint hypotheses only. Never let an unsourced sales listing override the passport or museum evidence.

### Tier E — non-evidence

- ImageGen output;
- mood boards;
- game screenshots;
- unsourced Pinterest images;
- stylized illustration;
- generic modern product presented as “vintage.”

Use only to generate search terms or discuss visual taste. Do not measure or approve geometry from it.

For imagined objects, the sanctioned ImageGen loop — coherent multi-view sheets, recorded owner selection, internal-anchor scale calibration, self-contradiction audits — is defined in imagination-pipeline.md. Even there, generated images stay in this tier for geometry: character transfers, dimensions never do.

## 3. Search procedure

Search in the object’s local language first. Build a vocabulary table:

| Category | Examples |
| --- | --- |
| common noun | pump, privy, jetty, shed |
| regional noun | `plee`, `huisje`, `turfhok`, `schouw`, `erfpomp` |
| construction | cast iron, cantilever, stave, hoop, clinker, potdeksel |
| function | ditch toilet, peat ventilation, hand water pump |
| institution | museum, archive, heritage register, RCE |
| period/maker | 1870, Nering Bögel, model catalogue |
| hidden side | rear, underside, interior, section, restoration |

Run query families, not one query:

1. `site:<institution> <regional noun>`
2. `<object> museum collection`
3. `<object> heritage register`
4. `<object> restoration construction`
5. `<object> manufacturer catalogue pdf`
6. `<object> rear underside detail`
7. `<object> drawing dimensions section`
8. exact maker/model or monument/inventory number

Use web search for textual claims and image search for candidate views. For technical answers, prefer official documentation and primary sources.

Search neighboring regions only after identifying which traits are shared. A North-Holland farm pump may establish a cast-iron family; it does not automatically own a Zaan yard’s color, size or foundation.

## 4. Image collection

For each candidate image, record:

- source URL and institution;
- date of object and date of photograph;
- documentary/reconstruction/replica classification;
- view direction;
- lens distortion or cropping;
- visible joints;
- claims it can support;
- claims it cannot support.

Collect:

- strict front for symmetry, count and opening bounds;
- strict profile for slope, projection and height stations;
- both diagonals for depth and attachment position;
- rear/underside/interior for hidden topology;
- high view for roof and footprint;
- close joint views for hinge, bracket, ring, nozzle, handle or framing;
- in-use photographs for human scale and working direction.

Download the original or a large institutional derivative when thumbnails hide construction. Inspect the local image at original detail. A search-engine caption is not visual inspection.

When an image will control fit rather than merely explain typology, also create
the registered-source entry required by reference-registration.md: exact local
file, crop, projection, calibration anchor, owned claims, excluded regions,
mask/landmark paths and fit thresholds. Evidence collection and image
registration are separate records; one establishes authority, the other
establishes a reproducible pixel-to-model comparison.

Do not trace perspective directly into dimensions. Correct for:

- converging verticals;
- wide-angle enlargement near frame edges;
- camera height;
- foreshortening;
- concealed surfaces;
- later repairs or missing pieces.

## 5. Extracting invariants

Turn each observation into a falsifiable statement.

Weak: “small old pump.”

Strong:

- one vertical cast-iron barrel narrows toward its cap;
- the lever pivots through a visible top bracket;
- the spout exits the barrel below the pivot and turns downward;
- the stone base is wider than all metalwork;
- the bucket is open, stave-built and held by two hoops.

For each invariant record:

- evidence source;
- confidence/classification;
- model owner;
- test method;
- fixed camera.

Countable topology is an invariant: two beams, four posts, five frames, twelve staves, two hoops. Do not replace a defining count with texture unless the passport explicitly allows budget compression.

Negative space is an invariant:

- opening behind a door leaf;
- heart cutout;
- bucket interior;
- boat interior and bottom boundary;
- gap between peat bricks;
- stair notch around a tread;
- rear opening over water.

## 6. Dimensions and uncertainty

Label every parameter:

- `published`: stated by an authoritative source;
- `measured`: recovered from a supplied calibrated drawing/model;
- `calibrated`: measured off an image through a known scale anchor (established Playgate vocabulary; treat as `measured` with the anchor recorded);
- `derived`: calculated from other owned values;
- `estimated`: inferred from documentary imagery with stated uncertainty;
- `authored`: chosen to complete a coherent object where evidence is absent.

Never relabel an authored choice as historical fact.

Use one dimension chain:

1. exact overall envelope;
2. shared datums/control lines;
3. member centers and clear openings;
4. sections and thicknesses;
5. fittings and offsets.

Derive, do not eyeball:

- roof pitch from rise/run;
- cantilever projection from bank anchor to beam end;
- repeated pitch from width + gap;
- rotated clear gap from rotated bounds;
- lever endpoints from length and angle;
- seat height from finished floor top;
- water exposure from waterline anchor.

When a passport says “diameter 0.14” but the column tapers, declare whether `0.14` is maximum, base or nominal diameter. Add a rejection test for that interpretation.

## 7. Contradictions

Create a contradiction table:

| Feature | Source A | Source B | Resolution |
| --- | --- | --- | --- |
| roof material | tiles | tarred boards | passport/project palette owns selected variant |
| rear wall | closed hatch | fully open | current passport explicitly requires open rear |
| pump base | masonry well | square stone plate | current object passport requires `0.55 × 0.55 × 0.12` plate |

Resolution rules:

1. obey explicit user correction;
2. obey approved passport exactness;
3. prefer source closest in region, period and subtype;
4. preserve mechanically necessary construction;
5. label remaining choice authored.

Never average incompatible variants into a hybrid that existed nowhere.

For multi-view sheets, solve a second class of contradiction before geometry:
whether calibrated shared axes and visible part counts can belong to one rigid
object. Use reference-registration.md's conflict report. A view can remain
useful for one owned claim while being disqualified for another; do not promote
one front view to global authority merely because it is visually attractive.

## 8. Evidence-card requirements

Write the card before geometry. It must be specific enough that another agent can reject a wrong model without seeing the author’s intent.

Required sections:

- **Identity and source hierarchy**: object, non-object confusions, source roles, URLs.
- **Local frame and envelopes**: axes, ground/water datum, exact bounds, authored overhangs.
- **Representation and registration**: canonical owner, derived/diagnostic artifacts, registered views, calibration anchors, per-claim authority and unresolved conflicts.
- **Named construction**: every primary member, opening, working element and compression strategy.
- **Load and attachment paths**: explicit chains from datum to final dependent, including named datums/joints/hardpoints and purchased-component interfaces.
- **Protected scope**: accepted work and forbidden integration files.
- **Rejection conditions**: measurable failures and visual category failures.
- **Invariant matrix**: invariant, parameter owner, independent test, fixed camera.

The card must distinguish standalone object truth from later placement truth. Use anchors for bank edges, waterlines, wall attachment points and adapter-owned embedment.

## 9. Research failure modes

### One-image seduction

Symptom: a beautiful diagonal render defines the whole object.

Correction: require strict profile, rear/underside and joint evidence before hidden geometry.

### Search-caption trust

Symptom: the caption says “historic” and becomes proof.

Correction: open the source, verify institution, object date, reconstruction status and image content.

### Typology owns dimensions

Symptom: a museum object’s unrelated dimensions replace the passport.

Correction: use typology for topology/material; use the passport for exact envelope.

### Replica contamination

Symptom: modern decorative products introduce oversized ornaments or impossible hardware.

Correction: keep replicas in Tier D and confirm every defining feature elsewhere.

### Generated-image substitution

Symptom: a reference sheet looks correct while no canonical geometry could produce it.

Correction: discard it from acceptance; build and capture canonical geometry.

### Hidden-side invention without labels

Symptom: unseen support is presented as documentary truth.

Correction: author the simplest coherent joint, label it `authored`, expose it in a test camera.
