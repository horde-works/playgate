export type ConstructionPartKind =
  | "beam"
  | "plate"
  | "wheel"
  | "engine"
  | "seat"
  | "rotor";

export type ConstructionVec3 = readonly [number, number, number];
export type ConstructionQuat = readonly [number, number, number, number];

export interface ConstructionCatalogPart {
  kind: ConstructionPartKind;
  label: string;
  shape: "box" | "cylinder";
  defaultSize: ConstructionVec3;
  minSize: ConstructionVec3;
  maxSize: ConstructionVec3;
  sizeStep: ConstructionVec3;
  density: number;
  structural: boolean;
}

export interface ConstructionPart {
  id: string;
  kind: ConstructionPartKind;
  localPosition: ConstructionVec3;
  localRotation: ConstructionQuat;
  size: ConstructionVec3;
}

export interface ConstructionConnection {
  id: string;
  a: string;
  b: string;
}

export interface ConstructionAssembly {
  id: string;
  position: ConstructionVec3;
  rotation: ConstructionQuat;
  linvel: ConstructionVec3;
  angvel: ConstructionVec3;
  parts: ConstructionPart[];
  connections: ConstructionConnection[];
}

export interface ConstructionSave {
  version: 1;
  assemblies: ConstructionAssembly[];
}

export type ConstructionMachineKind = "inert" | "car" | "rotorcraft";

export interface ConstructionMachineClassification {
  kind: ConstructionMachineKind;
  canDrive: boolean;
  canFly: boolean;
  controllerPartId: string | null;
  enginePartId: string | null;
  wheelPartIds: string[];
  rotorPartIds: string[];
  missing: Array<"controller" | "engine" | "wheels" | "rotors">;
}

export const CONSTRUCTION_SAVE_VERSION = 1 as const;
export const CONSTRUCTION_MAX_ASSEMBLIES = 24;
export const CONSTRUCTION_MAX_PARTS = 180;
export const CONSTRUCTION_SNAP_STEP = 0.25;

const CATALOG: Record<ConstructionPartKind, ConstructionCatalogPart> = {
  beam: {
    kind: "beam",
    label: "Beam",
    shape: "box",
    defaultSize: [2.5, 0.25, 0.25],
    minSize: [0.5, 0.15, 0.15],
    maxSize: [8, 0.75, 0.75],
    sizeStep: [0.25, 0.05, 0.05],
    density: 420,
    structural: true,
  },
  plate: {
    kind: "plate",
    label: "Plate",
    shape: "box",
    defaultSize: [2.5, 0.18, 1.5],
    minSize: [0.5, 0.1, 0.5],
    maxSize: [6, 0.5, 4],
    sizeStep: [0.25, 0.05, 0.25],
    density: 340,
    structural: true,
  },
  wheel: {
    kind: "wheel",
    label: "Wheel",
    shape: "cylinder",
    defaultSize: [0.42, 0.22, 0.42],
    minSize: [0.28, 0.14, 0.28],
    maxSize: [0.9, 0.45, 0.9],
    sizeStep: [0.05, 0.02, 0.05],
    density: 580,
    structural: false,
  },
  engine: {
    kind: "engine",
    label: "Engine",
    shape: "box",
    defaultSize: [0.9, 0.65, 0.75],
    minSize: [0.9, 0.65, 0.75],
    maxSize: [0.9, 0.65, 0.75],
    sizeStep: [0, 0, 0],
    density: 820,
    structural: true,
  },
  seat: {
    kind: "seat",
    label: "Controller",
    shape: "box",
    defaultSize: [0.7, 0.85, 0.65],
    minSize: [0.7, 0.85, 0.65],
    maxSize: [0.7, 0.85, 0.65],
    sizeStep: [0, 0, 0],
    density: 180,
    structural: true,
  },
  rotor: {
    kind: "rotor",
    label: "Rotor",
    shape: "cylinder",
    defaultSize: [1.7, 0.09, 1.7],
    minSize: [0.8, 0.06, 0.8],
    maxSize: [3.5, 0.18, 3.5],
    sizeStep: [0.1, 0.01, 0.1],
    density: 95,
    structural: false,
  },
};

export const CONSTRUCTION_CATALOG = Object.freeze(
  Object.values(CATALOG),
) as readonly ConstructionCatalogPart[];

export function constructionCatalogPart(
  kind: ConstructionPartKind,
): ConstructionCatalogPart {
  return CATALOG[kind];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeConstructionSize(
  kind: ConstructionPartKind,
  requested: ConstructionVec3,
): ConstructionVec3 {
  const spec = constructionCatalogPart(kind);
  return requested.map((value, axis) => {
    const min = spec.minSize[axis];
    const max = spec.maxSize[axis];
    const step = spec.sizeStep[axis];
    const bounded = clamp(finite(value) ? value : spec.defaultSize[axis], min, max);
    return step > 0
      ? Math.round((Math.round((bounded - min) / step) * step + min) * 1e6) /
          1e6
      : spec.defaultSize[axis];
  }) as unknown as ConstructionVec3;
}

export function snapConstructionPoint(
  point: ConstructionVec3,
  step = CONSTRUCTION_SNAP_STEP,
): ConstructionVec3 {
  if (!finite(step) || step <= 0) return [...point];
  return point.map((value) => {
    const snapped = Math.round(value / step) * step;
    return Object.is(snapped, -0) ? 0 : snapped;
  }) as unknown as ConstructionVec3;
}

export function constructionPartVolume(part: ConstructionPart): number {
  const size = normalizeConstructionSize(part.kind, part.size);
  return size[0] * size[1] * size[2];
}

export function constructionPartMass(part: ConstructionPart): number {
  return constructionPartVolume(part) * constructionCatalogPart(part.kind).density;
}

export function constructionAssemblyMass(assembly: ConstructionAssembly): number {
  return assembly.parts.reduce((sum, part) => sum + constructionPartMass(part), 0);
}

export function constructionConnectionId(a: string, b: string): string {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

export function constructionComponents(
  partIds: readonly string[],
  connections: readonly ConstructionConnection[],
): string[][] {
  const known = new Set(partIds);
  const neighbors = new Map(partIds.map((id) => [id, new Set<string>()]));
  for (const connection of connections) {
    if (connection.a === connection.b || !known.has(connection.a) || !known.has(connection.b)) {
      continue;
    }
    neighbors.get(connection.a)?.add(connection.b);
    neighbors.get(connection.b)?.add(connection.a);
  }
  const unseen = new Set(partIds);
  const components: string[][] = [];
  while (unseen.size > 0) {
    const seed = unseen.values().next().value as string;
    const queue = [seed];
    const component: string[] = [];
    unseen.delete(seed);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      component.push(id);
      for (const neighbor of neighbors.get(id) ?? []) {
        if (unseen.delete(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

export function splitConstructionAssembly(
  assembly: ConstructionAssembly,
  removedConnectionId: string,
): ConstructionAssembly[] {
  const connections = assembly.connections.filter(
    (connection) => connection.id !== removedConnectionId,
  );
  const components = constructionComponents(
    assembly.parts.map((part) => part.id),
    connections,
  );
  if (components.length <= 1) return [{ ...assembly, connections }];
  return components.map((ids, index) => {
    const included = new Set(ids);
    return {
      ...assembly,
      id: index === 0 ? assembly.id : `${assembly.id}-split-${index}`,
      parts: assembly.parts.filter((part) => included.has(part.id)),
      connections: connections.filter(
        (connection) => included.has(connection.a) && included.has(connection.b),
      ),
    };
  });
}

export function classifyConstructionAssembly(
  assembly: ConstructionAssembly,
): ConstructionMachineClassification {
  const controller = assembly.parts.find((part) => part.kind === "seat") ?? null;
  const engine = assembly.parts.find((part) => part.kind === "engine") ?? null;
  const wheels = assembly.parts.filter((part) => part.kind === "wheel");
  const rotors = assembly.parts.filter((part) => part.kind === "rotor");
  const canDrive = Boolean(controller && engine && wheels.length >= 4);
  const canFly = Boolean(controller && engine && rotors.length >= 3);
  const missing: ConstructionMachineClassification["missing"] = [];
  if (!controller) missing.push("controller");
  if (!engine) missing.push("engine");
  if (wheels.length < 4) missing.push("wheels");
  if (rotors.length < 3) missing.push("rotors");
  return {
    kind: canFly ? "rotorcraft" : canDrive ? "car" : "inert",
    canDrive,
    canFly,
    controllerPartId: controller?.id ?? null,
    enginePartId: engine?.id ?? null,
    wheelPartIds: wheels.map((part) => part.id),
    rotorPartIds: rotors.map((part) => part.id),
    missing,
  };
}

function vec3(value: unknown): ConstructionVec3 | null {
  return Array.isArray(value) && value.length === 3 && value.every(finite)
    ? [value[0], value[1], value[2]]
    : null;
}

function quat(value: unknown): ConstructionQuat | null {
  return Array.isArray(value) && value.length === 4 && value.every(finite)
    ? [value[0], value[1], value[2], value[3]]
    : null;
}

function constructionKind(value: unknown): value is ConstructionPartKind {
  return typeof value === "string" && value in CATALOG;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseConstructionSave(raw: string | null): ConstructionSave | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record(value) || value.version !== CONSTRUCTION_SAVE_VERSION || !Array.isArray(value.assemblies)) {
    return null;
  }
  if (value.assemblies.length > CONSTRUCTION_MAX_ASSEMBLIES) return null;
  const assemblies: ConstructionAssembly[] = [];
  const assemblyIds = new Set<string>();
  const globalPartIds = new Set<string>();
  for (const candidate of value.assemblies) {
    if (!record(candidate) || typeof candidate.id !== "string" || candidate.id.length > 160 || assemblyIds.has(candidate.id) || !Array.isArray(candidate.parts) || candidate.parts.length === 0 || !Array.isArray(candidate.connections)) return null;
    assemblyIds.add(candidate.id);
    const position = vec3(candidate.position);
    const rotation = quat(candidate.rotation);
    const linvel = vec3(candidate.linvel);
    const angvel = vec3(candidate.angvel);
    if (!position || !rotation || !linvel || !angvel) return null;
    const parts: ConstructionPart[] = [];
    for (const item of candidate.parts) {
      if (!record(item) || typeof item.id !== "string" || item.id.length > 160 || globalPartIds.has(item.id) || !constructionKind(item.kind)) return null;
      const localPosition = vec3(item.localPosition);
      const localRotation = quat(item.localRotation);
      const size = vec3(item.size);
      if (!localPosition || !localRotation || !size) return null;
      globalPartIds.add(item.id);
      parts.push({ id: item.id, kind: item.kind, localPosition, localRotation, size: normalizeConstructionSize(item.kind, size) });
    }
    const partIds = new Set(parts.map((part) => part.id));
    const connectionIds = new Set<string>();
    const connections: ConstructionConnection[] = [];
    for (const item of candidate.connections) {
      if (!record(item) || typeof item.a !== "string" || typeof item.b !== "string" || item.a === item.b || !partIds.has(item.a) || !partIds.has(item.b)) return null;
      const id = constructionConnectionId(item.a, item.b);
      if (connectionIds.has(id)) continue;
      connectionIds.add(id);
      connections.push({ id, a: item.a, b: item.b });
    }
    if (constructionComponents(parts.map((part) => part.id), connections).length !== 1) return null;
    assemblies.push({ id: candidate.id, position, rotation, linvel, angvel, parts, connections });
  }
  if (globalPartIds.size > CONSTRUCTION_MAX_PARTS) return null;
  return { version: CONSTRUCTION_SAVE_VERSION, assemblies };
}

export function serializeConstructionSave(
  assemblies: readonly ConstructionAssembly[],
): string {
  return JSON.stringify({ version: CONSTRUCTION_SAVE_VERSION, assemblies });
}
