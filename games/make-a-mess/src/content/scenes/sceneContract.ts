import type {
  BreakableMaterial,
  BreakableShape,
  DestructionSceneCopy,
  DestructionSceneDefinition,
  LandscapeSurfaceProfile,
  SceneVector3,
  SurfaceTextureProfile,
  SupportMode,
  TreeVisualDefinition,
  VegetationVisualDefinition,
} from "../../game/destructionScene.ts";

export type SceneEuler = SceneVector3;

export interface SceneTransform {
  readonly position: SceneVector3;
  readonly rotation?: SceneEuler;
  readonly scale?: SceneVector3;
}

export type SurfaceTreatment =
  | {
      readonly kind: "damp";
      readonly amount: number;
    }
  | {
      readonly kind: "moss";
      readonly amount: number;
    }
  | {
      readonly kind: "mold";
      readonly amount: number;
    };

export interface SceneContactBox {
  readonly position: SceneVector3;
  readonly size: SceneVector3;
}

export interface SceneLightSource {
  readonly position?: SceneVector3;
  readonly color: string;
  readonly distance: number;
  readonly intensity: number;
}

export interface SceneHinge {
  readonly pivot: SceneVector3;
  readonly direction: SceneVector3;
  readonly normal: SceneVector3;
}

export interface ScenePrefabPieceDefinition {
  readonly id: string;
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly position: SceneVector3;
  readonly rotation?: SceneEuler;
  readonly size: SceneVector3;
  readonly volume?: number;
  readonly bearingArea?: number;
  readonly color: string;
  readonly colorSlot?: string;
  readonly contactBoxes?: readonly SceneContactBox[];
  readonly bearsLoad?: boolean;
  readonly carriesAttachments?: boolean;
  readonly attachmentSupportMode?: "wall" | "cable" | "hinge";
  readonly sideAttachmentReach?: number;
  readonly contactBearingOrder?: boolean;
  readonly hinge?: SceneHinge;
  readonly light?: SceneLightSource;
  readonly textureProfile?: SurfaceTextureProfile;
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  readonly treeVisual?: TreeVisualDefinition;
  readonly vegetationVisual?: VegetationVisualDefinition;
  /** 0..1 organic weathering receptivity fed to the biofilm shader mask. */
  readonly weathering?: number;
}

export interface ScenePrefabDefinition {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly tags: readonly string[];
  readonly pieces: readonly ScenePrefabPieceDefinition[];
}

interface SceneObjectBase {
  readonly id: string;
  readonly transform: SceneTransform;
  readonly surface?: readonly SurfaceTreatment[];
}

export interface ScenePrefabInstanceDefinition extends SceneObjectBase {
  readonly kind: "prefab";
  readonly prefab: string;
  readonly palette?: Readonly<Record<string, string>>;
}

export interface ScenePrimitiveDefinition extends SceneObjectBase {
  readonly kind: "primitive";
  readonly material: BreakableMaterial;
  readonly shape: BreakableShape;
  readonly size: SceneVector3;
  readonly volume?: number;
  readonly bearingArea?: number;
  readonly color: string;
  readonly contactBoxes?: readonly SceneContactBox[];
  readonly bearsLoad?: boolean;
  readonly carriesAttachments?: boolean;
  readonly attachmentSupportMode?: "wall" | "cable" | "hinge";
  readonly sideAttachmentReach?: number;
  readonly contactBearingOrder?: boolean;
  readonly hinge?: SceneHinge;
  readonly light?: SceneLightSource;
  readonly textureProfile?: SurfaceTextureProfile;
  readonly landscapeSurface?: LandscapeSurfaceProfile;
  readonly treeVisual?: TreeVisualDefinition;
  readonly vegetationVisual?: VegetationVisualDefinition;
  /** 0..1 organic weathering receptivity fed to the biofilm shader mask. */
  readonly weathering?: number;
}

export type SceneObjectDefinition =
  | ScenePrefabInstanceDefinition
  | ScenePrimitiveDefinition;

export interface SceneGroupDefinition {
  readonly id: string;
  readonly label: string;
  readonly material: BreakableMaterial;
  readonly supportMode: SupportMode;
  readonly objects: readonly SceneObjectDefinition[];
}

export interface SceneWorldDefinition {
  readonly playerSpawn: SceneVector3;
  readonly cameraFar: number;
  readonly center: readonly [x: number, z: number];
  readonly halfExtents: readonly [x: number, z: number];
  readonly radius?: number;
  readonly safetyFloorY: number;
}

export interface AuthoredSceneDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly environment: DestructionSceneDefinition["environment"];
  readonly world: SceneWorldDefinition;
  readonly copy: DestructionSceneCopy;
  readonly groups: readonly SceneGroupDefinition[];
}

export interface CompiledSceneArtifact {
  readonly schemaVersion: 1;
  readonly sourceSceneId: string;
  readonly prefabIds: readonly string[];
  readonly groupCount: number;
  readonly objectCount: number;
  readonly pieceCount: number;
  readonly lampCount: number;
}

export interface SceneCompilationResult {
  readonly scene: DestructionSceneDefinition;
  readonly artifact: CompiledSceneArtifact;
}

export type ScenePrefabLibrary = ReadonlyMap<string, ScenePrefabDefinition>;
