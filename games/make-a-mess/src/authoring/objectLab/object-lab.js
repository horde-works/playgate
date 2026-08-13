import * as THREE from "/vendor/three.module.js";

const query = new URLSearchParams(location.search);
const requestedView = query.get("view") ?? "three-quarter-left";
const modelQuery = query.has("profile") ? `?profile=${encodeURIComponent(query.get("profile"))}` : "";
const model = await fetch(`/model.json${modelQuery}`).then((response) => response.json());
const view = model.views.find((candidate) => candidate.id === requestedView) ?? model.views[0];
const silhouette = view.id === "silhouette";
const night = view.lighting === "night";

const palette = {
  foundation: { color: 0x777b7d, roughness: 0.95 },
  brick: { color: 0x82817d, roughness: 1 },
  "timber-dark": { color: 0x34383a, roughness: 0.88 },
  "timber-mid": { color: 0x666a69, roughness: 0.9 },
  cladding: { color: 0xa1a19a, roughness: 1 },
  thatch: { color: 0x77766f, roughness: 1 },
  roof: { color: 0x777873, roughness: 1 },
  "roof-dark": { color: 0x454849, roughness: 0.96 },
  "roof-warm": { color: 0x866f62, roughness: 1 },
  earth: { color: 0x655f55, roughness: 1 },
  grass: { color: 0x7d9073, roughness: 1 },
  "grass-crown": { color: 0x928d67, roughness: 1 },
  "grass-bench": { color: 0x78896d, roughness: 1 },
  "water-reserve": { color: 0x3e7990, roughness: 0.62, metalness: 0.08 },
  path: { color: 0xc1ae7e, roughness: 0.95 },
  "bridge-seat": { color: 0x946d42, roughness: 0.9 },
  reserve: { color: 0xd9bd62, roughness: 0.82 },
  stone: { color: 0x77766f, roughness: 0.98 },
  mortar: { color: 0xaaa69a, roughness: 1 },
  "shell-path": { color: 0xd9cfac, roughness: 0.96 },
  "soil-bed": { color: 0x5e4632, roughness: 1 },
  foliage: { color: 0x4f713f, roughness: 1 },
  "flower-red": { color: 0xc84944, roughness: 0.88 },
  "flower-yellow": { color: 0xe4bd3e, roughness: 0.88 },
  "flower-blue": { color: 0x527fbd, roughness: 0.88 },
  "flower-purple": { color: 0x8b5ca8, roughness: 0.88 },
  canvas: { color: 0xd8d4c9, roughness: 0.96, transparent: true, opacity: 0.82, side: THREE.DoubleSide },
  metal: { color: 0x52585b, roughness: 0.52, metalness: 0.35 },
  "paint-light": { color: 0xc4c3ba, roughness: 0.82 },
  "paint-accent": { color: 0x8d8b84, roughness: 0.82 },
  // Transparent envelopes must not write depth: otherwise a pane or lantern
  // lens can erase the real interior/bulb it is specifically meant to reveal.
  glazing: { color: 0x385869, roughness: 0.12, metalness: 0.04, transparent: true, opacity: 0.42, depthWrite: false },
  "lamp-glass": { color: 0xb9c7c8, roughness: 0.14, transparent: true, opacity: 0.16, depthWrite: false },
  "lamp-bulb": { color: 0xffd394, roughness: 0.18, transparent: true, opacity: 1, depthWrite: false },
  "dark-recess": { color: 0x111416, roughness: 1 },
  opening: { color: 0x171a1c, roughness: 1 },
  "palace-concrete": { color: 0xc7c4ba, roughness: 0.94 },
  "palace-stone": { color: 0xb9b5a9, roughness: 0.9 },
  "palace-accent-blue": { color: 0x48657a, roughness: 0.55 },
  "palace-accent-red": { color: 0x8c5748, roughness: 0.58 },
  "palace-frame-metal": { color: 0x333b40, roughness: 0.32, metalness: 1 },
  "palace-glazing": { color: 0x476672, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false },
  "palace-roof-metal": { color: 0xb2c0c3, roughness: 0.55, metalness: 1 },
  "palace-interior-dark": { color: 0x272b2c, roughness: 0.88 },
  "palace-sign-metal": { color: 0xe0ddd2, roughness: 0.5, metalness: 0.1 },
};

for (const [id, override] of Object.entries(model.materialOverrides ?? {})) {
  palette[id] = { ...(palette[id] ?? {}), ...override };
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(silhouette ? 0xf1efe8 : night ? 0x07101a : 0xd9dde0, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = silhouette ? 1 : night ? 1.16 : 1.08;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = silhouette ? null : new THREE.Fog(night ? 0x07101a : 0xd9dde0, model.labEnvironment?.fogNear ?? 62, model.labEnvironment?.fogFar ?? 90);
const root = new THREE.Group();
root.name = model.id;
scene.add(root);

const materials = Object.fromEntries(
  Object.entries(palette).map(([id, definition]) => [
    id,
    new THREE.MeshStandardMaterial(silhouette
      ? { color: 0x25282a, roughness: 1, side: THREE.DoubleSide }
      : id === "lamp-bulb" && night
        ? { ...definition, emissive: 0xffa94d, emissiveIntensity: 4.5 }
        : definition),
  ]),
);

const edgeMaterial = new THREE.LineBasicMaterial({
  color: silhouette ? 0x25282a : 0x25292b,
  transparent: true,
  opacity: silhouette ? 0 : 0.27,
});

const toVector = (value) => new THREE.Vector3(value[0], value[1], value[2]);

function orientAlongY(object, from, to) {
  const start = toVector(from);
  const end = toVector(to);
  const direction = end.clone().sub(start);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return direction.length();
}

function addEdges(mesh, threshold = 28) {
  if (silhouette) return;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), edgeMaterial);
  edges.renderOrder = 2;
  mesh.add(edges);
}

for (const part of model.parts) {
  if (view.hiddenGroups?.includes(part.group)) continue;
  let mesh;
  if (part.kind === "box") {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), materials[part.material]);
    mesh.position.set(...part.center);
    if (part.rotation) mesh.rotation.set(...part.rotation);
    addEdges(mesh);
  } else if (part.kind === "beam") {
    const length = toVector(part.to).distanceTo(toVector(part.from));
    mesh = new THREE.Mesh(new THREE.BoxGeometry(part.width, length, part.depth), materials[part.material]);
    orientAlongY(mesh, part.from, part.to);
    addEdges(mesh);
  } else if (part.kind === "cylinder") {
    const length = toVector(part.to).distanceTo(toVector(part.from));
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(part.radius, part.radius, length, part.radialSegments, 1, false),
      materials[part.material],
    );
    orientAlongY(mesh, part.from, part.to);
    addEdges(mesh);
  } else if (part.kind === "mesh") {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(part.vertices.flat(), 3));
    if (part.normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(part.normals.flat(), 3));
    if (part.vertexColors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(part.vertexColors.flat(), 3));
    geometry.setIndex(part.triangles.flat());
    if (!part.normals) geometry.computeVertexNormals();
    const baseMaterial = materials[part.material];
    const material = (part.doubleSided && baseMaterial.side !== THREE.DoubleSide) || part.vertexColors
      ? baseMaterial.clone()
      : baseMaterial;
    if (part.doubleSided) material.side = THREE.DoubleSide;
    if (part.vertexColors) {
      material.color.set(0xffffff);
      material.vertexColors = true;
    }
    mesh = new THREE.Mesh(geometry, material);
    if (part.showEdges !== false) addEdges(mesh, 18);
  }
  if (!mesh) continue;
  mesh.name = part.id;
  // Force nested transparent layers into physical outside-to-inside order.
  // Distance sorting is ambiguous because pane, lens and bulb can share a
  // centre line; without this the clear envelope can paint over the emitter.
  if (["glazing", "palace-glazing"].includes(part.material)) mesh.renderOrder = 3;
  if (part.material === "lamp-glass") mesh.renderOrder = 4;
  if (part.material === "lamp-bulb") mesh.renderOrder = 5;
  mesh.castShadow = !silhouette && !["canvas", "glazing", "palace-glazing", "lamp-glass", "lamp-bulb"].includes(part.material);
  mesh.receiveShadow = !silhouette;
  mesh.userData.group = part.group;
  root.add(mesh);
}

if (!silhouette) {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(model.labEnvironment?.floorRadius ?? 29, 96),
    new THREE.MeshStandardMaterial({ color: night ? 0x17221f : 0xc4c8ca, roughness: night ? 0.78 : 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = model.labEnvironment?.floorY ?? -0.04;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(model.labEnvironment?.gridSize ?? 42, model.labEnvironment?.gridDivisions ?? 42, 0x7a7f82, 0xaeb3b5);
  grid.position.y = (model.labEnvironment?.floorY ?? -0.04) + 0.025;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);
}

scene.add(new THREE.HemisphereLight(
  night ? 0x6f86a8 : 0xf3f5f5,
  night ? 0x07100d : 0x4d5255,
  silhouette ? 2.2 : night ? 0.32 : 2.65,
));
if (!silhouette) {
  const key = new THREE.DirectionalLight(night ? 0x9db9df : 0xffffff, night ? 0.68 : 4.1);
  key.position.set(-18, 34, 25);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -10;
  key.shadow.bias = -0.00045;
  scene.add(key);
  const rim = new THREE.DirectionalLight(night ? 0x3f5874 : 0xbfcbd0, night ? 0.34 : 1.15);
  rim.position.set(23, 18, -24);
  scene.add(rim);

  if (night) {
    for (const part of model.parts) {
      if (!part.light || view.hiddenGroups?.includes(part.group)) continue;
      const source = part.light.position ?? part.center;
      if (!source) continue;
      const lamp = new THREE.PointLight(part.light.color, part.light.intensity, part.light.distance, 1.55);
      lamp.position.set(...source);
      lamp.castShadow = false;
      scene.add(lamp);
    }
  }
}

const aspect = innerWidth / innerHeight;
let camera;
if (view.projection === "orthographic") {
  const height = view.orthoHeight;
  camera = new THREE.OrthographicCamera(-height * aspect / 2, height * aspect / 2, height / 2, -height / 2, 0.1, 160);
} else {
  camera = new THREE.PerspectiveCamera(view.fov ?? 38, aspect, 0.1, 180);
}
camera.position.set(...view.position);
if (view.up) camera.up.set(...view.up);
camera.lookAt(...view.target);

document.getElementById("title").textContent = model.title;
document.getElementById("view").textContent = view.label;
document.getElementById("dimensions").innerHTML = [
  ...model.labMetrics.map((metric) => {
    const sign = metric.signed === false || metric.label === "SAIL SPAN" ? "" : "+";
    const unit = metric.unit ?? "m";
    return `${metric.label} ${sign}${metric.value.toFixed(metric.decimals ?? 2)}${unit ? ` ${unit}` : ""}`;
  }),
].join("<br>");
document.getElementById("hash").textContent = `${model.revision} · ${model.modelHash}`;

renderer.render(scene, camera);
document.documentElement.dataset.ready = "true";
