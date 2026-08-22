import type {
  BreakableMaterial,
  BreakableShape,
  CommandActuatorTag,
  DamageVoxelizationDefinition,
  DestructionSceneCopy,
  DestructionSceneDefinition,
  LampBeaconDefinition,
  LampEventLightingDefinition,
  LandscapeSurfaceProfile,
  LandscapeVisualDefinition,
  MutableSceneObjectDefinition,
  SceneVector3,
  SpotLightDefinition,
  SurfaceMeshProfile,
  SurfacePolygonProfile,
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
  /** Keep the light in the authored coordinate frame of its moving group. */
  readonly followsGroup?: boolean;
  /** Keep interior fixtures visibly powered even under daylight. */
  readonly dayIntensityFactor?: number;
  /** Bias safety and interior lighting ahead of decorative outdoor lamps. */
  readonly poolPriority?: number;
  /** Nearby fixtures may reserve a smaller share of the shared light pool. */
  readonly localPoolCapacity?: number;
  /** Fixtures in one room are selected as a coherent set. */
  readonly poolGroupId?: string;
  /** Reserve one real source from this group before filling nearby detail. */
  readonly reservePoolGroup?: boolean;
  /** Suppress this interior light for a player seated in its moving group. */
  readonly interior?: boolean;
  /** Long-range camera-facing signal halo. */
  readonly beacon?: LampBeaconDefinition;
  /** Optional carrier lifecycle which drives this fixture. */
  readonly eventLighting?: LampEventLightingDefinition;
  readonly transition?: {
    readonly fadeInSeconds: number;
    readonly fadeOutSeconds: number;
  };
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
  readonly visualProfile?: SurfacePolygonProfile;
  readonly visualMesh?: SurfaceMeshProfile;
  readonly voxelization?: DamageVoxelizationDefinition;
  readonly plateThickness?: number;
  readonly volume?: number;
  readonly bearingArea?: number;
  readonly foundation?: boolean;
  /** Keep collision/support but reject every destruction input. Defaults true. */
  readonly destructible?: boolean;
  readonly intactVisible?: boolean;
  readonly intactCollider?: boolean;
  /** Intact support seen by actors but ignored by vehicles and world debris. */
  readonly intactCollisionRole?: "actor-only";
  readonly color: string;
  readonly colorSlot?: string;
  readonly contactBoxes?: readonly SceneContactBox[];
  readonly bearsLoad?: boolean;
  readonly carriesAttachments?: boolean;
  readonly attachmentSupportMode?: "wall" | "cable" | "hinge";
  readonly sideAttachmentReach?: number;
  readonly contactBearingOrder?: boolean;
  /**
   * Сужение окна опоры для этого куска. Нужно парящей машине над твердью:
   * у стали окно 1.1 м, и любая её деталь в метре над асфальтом иначе
   * «садится» на него, получая второй корень устойчивости мимо собственного
   * силового узла (vehicle-authoring references/assembly.md, п. 21).
   */
  readonly maximumVerticalGap?: number;
  readonly hinge?: SceneHinge;
  readonly actuator?: CommandActuatorTag;
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
  readonly visualProfile?: SurfacePolygonProfile;
  readonly visualMesh?: SurfaceMeshProfile;
  readonly voxelization?: DamageVoxelizationDefinition;
  readonly plateThickness?: number;
  readonly volume?: number;
  readonly bearingArea?: number;
  readonly foundation?: boolean;
  /** Keep collision/support but reject every destruction input. Defaults true. */
  readonly destructible?: boolean;
  readonly intactVisible?: boolean;
  readonly intactCollider?: boolean;
  /** Intact support seen by actors but ignored by vehicles and world debris. */
  readonly intactCollisionRole?: "actor-only";
  readonly color: string;
  readonly contactBoxes?: readonly SceneContactBox[];
  readonly bearsLoad?: boolean;
  readonly carriesAttachments?: boolean;
  readonly attachmentSupportMode?: "wall" | "cable" | "hinge";
  readonly sideAttachmentReach?: number;
  readonly contactBearingOrder?: boolean;
  /**
   * Сужение окна опоры для этого куска. Нужно парящей машине над твердью:
   * у стали окно 1.1 м, и любая её деталь в метре над асфальтом иначе
   * «садится» на него, получая второй корень устойчивости мимо собственного
   * силового узла (vehicle-authoring references/assembly.md, п. 21).
   */
  readonly maximumVerticalGap?: number;
  readonly hinge?: SceneHinge;
  readonly actuator?: CommandActuatorTag;
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
  /** Initial camera yaw; 0 looks toward world -Z. */
  readonly playerSpawnYaw?: number;
  readonly cameraFar: number;
  readonly center: readonly [x: number, z: number];
  readonly halfExtents: readonly [x: number, z: number];
  readonly boundaryRadius?: number;
  readonly skyRadius?: number;
  readonly radius?: number;
  /** Exact shoreline used by atmosphere/edge rendering for non-circular islands. */
  readonly edgeBoundary?: readonly (readonly [x: number, z: number])[];
  readonly safetyFloorY: number;
}

export interface SceneConstantRotorDefinition {
  /** Authored scene group containing only the moving rotor members. */
  readonly groupId: string;
  /** World-space pivot and axis; the scene compiler resolves the cluster id. */
  readonly pivot: SceneVector3;
  readonly axis: SceneVector3;
  readonly radiansPerSecond: number;
}

export interface AuthoredSceneDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly environment: DestructionSceneDefinition["environment"];
  readonly world: SceneWorldDefinition;
  /** Populations mounted by capability, never by checking this document id. */
  readonly inhabitants?: DestructionSceneDefinition["inhabitantDefinitions"];
  readonly copy: DestructionSceneCopy;
  readonly groups: readonly SceneGroupDefinition[];
  readonly landscapeVisual?: LandscapeVisualDefinition;
  /** Deterministic local mechanisms. This is not a wind or aerodynamic model. */
  readonly constantRotors?: readonly SceneConstantRotorDefinition[];
  /** Directed fixtures with real surface light and optional volumetric beams. */
  readonly spotLights?: readonly SpotLightDefinition[];
  /**
   * Изменяемые объекты сцены: часы, табло и СКЛАДЫ с видимым уровнем. Сцена
   * лишь объявляет их куски изменяемыми; кто и когда их гасит — дело рантайма.
   */
  readonly mutableObjects?: readonly MutableSceneObjectDefinition[];
  /** Flight instruments portaled onto a named panel piece. */
  readonly motionInstruments?: DestructionSceneDefinition["motionInstrumentDefinitions"];
  /** Мир-заповедник: ломать нельзя ничего (см. LICENSING.md). */
  readonly indestructible?: boolean;
  /**
   * SPDX-лицензия КОНТЕНТА мира, если она отличается от лицензии репозитория.
   * Лицензия с запретом производных требует `indestructible: true` — связку
   * проверяет `createDestructionScene` на сборке.
   */
  readonly contentLicense?: string;
  /** Дальности тумана [near, far]; без них считаются от радиуса мира. */
  readonly fogDistances?: readonly [near: number, far: number];
  /** Географический базис сцены для физической солнечной траектории. */
  readonly solarFrame?: DestructionSceneDefinition["solarFrame"];
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
