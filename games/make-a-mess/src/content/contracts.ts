export type Vector3 = readonly [x: number, y: number, z: number];
export type Quaternion = readonly [x: number, y: number, z: number, w: number];

declare const objectIdBrand: unique symbol;
declare const materialIdBrand: unique symbol;
declare const assetPathBrand: unique symbol;

export type ObjectId = string & { readonly [objectIdBrand]: true };
export type MaterialId = string & { readonly [materialIdBrand]: true };
export type AssetPath = string & { readonly [assetPathBrand]: true };

export const objectId = (value: string) => value as ObjectId;
export const materialId = (value: string) => value as MaterialId;
export const assetPath = (value: string) => value as AssetPath;

export interface TransformDefinition {
  readonly position: Vector3;
  readonly rotation?: Quaternion;
  readonly scale?: Vector3;
}

export type ColliderDefinition =
  | {
      readonly shape: "box";
      readonly halfExtents: Vector3;
      readonly offset?: Vector3;
    }
  | {
      readonly shape: "sphere";
      readonly radius: number;
      readonly offset?: Vector3;
    }
  | {
      readonly shape: "capsule";
      readonly radius: number;
      readonly halfHeight: number;
      readonly offset?: Vector3;
    }
  | {
      readonly shape: "mesh";
      readonly source: AssetPath;
      readonly node: string;
    };

export interface RenderLodDefinition {
  readonly source: AssetPath;
  readonly maxDistance: number;
}

export interface RenderDefinition {
  readonly intact: AssetPath;
  readonly damaged?: AssetPath;
  readonly lods?: readonly RenderLodDefinition[];
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export interface StructuralGridDefinition {
  readonly cellSize: number;
  readonly bounds: {
    readonly min: Vector3;
    readonly max: Vector3;
  };
  readonly source?: AssetPath;
}

export interface MaterialVolumeDefinition {
  readonly material: MaterialId;
  readonly nodes: readonly string[];
}

export interface SupportAnchorDefinition<PartName extends string> {
  readonly id: string;
  readonly part: PartName;
  readonly position: Vector3;
  readonly radius: number;
  readonly kind: "ground" | "wall" | "ceiling" | "part";
}

export interface ObjectPartDefinition<PartName extends string> {
  readonly id: PartName;
  readonly node: string;
  readonly material: MaterialId;
  readonly mass: number;
  readonly collider: ColliderDefinition;
  readonly destructible: boolean;
}

export interface JointDefinition<PartName extends string> {
  readonly id: string;
  readonly from: PartName;
  readonly to: PartName | "world";
  readonly kind: "fixed" | "hinge" | "slider";
  readonly breakForce: number;
  readonly breakTorque: number;
  readonly anchor: Vector3;
  readonly axis?: Vector3;
}

export interface DestructionDefinition<PartName extends string> {
  readonly grid: StructuralGridDefinition;
  readonly materialVolumes: readonly MaterialVolumeDefinition[];
  readonly supports: readonly SupportAnchorDefinition<PartName>[];
  readonly detachThreshold: number;
  readonly smallestDynamicChunk: number;
  readonly debrisBudget: number;
}

export interface FeedbackDefinition {
  readonly impactSoundSet: string;
  readonly fractureSoundSet: string;
  readonly dustProfile: string;
  readonly debrisProfile: string;
}

export interface DestructibleObjectDefinition<PartName extends string> {
  readonly schemaVersion: 1;
  readonly id: ObjectId;
  readonly displayName: string;
  readonly tags: readonly string[];
  readonly transform: TransformDefinition;
  readonly render: RenderDefinition;
  readonly parts: readonly ObjectPartDefinition<PartName>[];
  readonly joints: readonly JointDefinition<PartName>[];
  readonly destruction: DestructionDefinition<PartName>;
  readonly feedback: FeedbackDefinition;
}
