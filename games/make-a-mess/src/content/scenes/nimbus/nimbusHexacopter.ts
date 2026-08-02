import { Euler, Quaternion, Vector3 } from "three";
import type {
  SceneObjectDefinition,
  ScenePrimitiveDefinition,
} from "../sceneContract.ts";
import type {
  SceneVector3,
  SpotLightDefinition,
} from "../../../game/destructionScene.ts";
import {
  HEXACOPTER_PAD_TOP_Y,
} from "../../../game/townHexacopter.ts";
import {
  NIMBUS_HEXACOPTER_CLUSTER_ID,
  NIMBUS_HEXACOPTER_NOSE,
  NIMBUS_HEXACOPTER_PAD_ID,
  NIMBUS_HEXACOPTER_PAD_TOP_Y,
  NIMBUS_HEXACOPTER_YAW,
  nimbusHexacopterPoint,
  nimbusHexacopterPointFromTown,
  nimbusHexacopterVectorFromTown,
} from "../../../game/nimbusHexacopter.ts";
import {
  townVertipadDocument,
  townVertipadSpotLights,
} from "../townVertipadDocument.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusOrient,
  nimbusPrimitive,
} from "./nimbusAuthoring.ts";

function rotatedEuler(rotation?: SceneVector3): SceneVector3 {
  const authored = new Quaternion().setFromEuler(
    new Euler(...(rotation ?? [0, 0, 0])),
  );
  const yaw = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    NIMBUS_HEXACOPTER_YAW,
  );
  const result = new Euler().setFromQuaternion(yaw.multiply(authored));
  return [result.x, result.y, result.z];
}

function transformedObject(object: SceneObjectDefinition): SceneObjectDefinition {
  return {
    ...object,
    transform: {
      ...object.transform,
      position: nimbusHexacopterPointFromTown(object.transform.position),
      rotation: rotatedEuler(object.transform.rotation),
    },
  } as SceneObjectDefinition;
}

function requireSourceHexacopter() {
  const group = townVertipadDocument.groups.find(
    (candidate) => candidate.id === "hexacopter",
  );
  if (!group) {
    throw new Error("Town HX-6 source group is missing");
  }
  return group;
}

const sourceHexacopter = requireSourceHexacopter();

export const nimbusHexacopterSpotLights: readonly SpotLightDefinition[] =
  townVertipadSpotLights.map((light) => ({
    ...light,
    id: light.id.replace("town-vertipad:hexacopter", NIMBUS_HEXACOPTER_CLUSTER_ID),
    position: nimbusHexacopterPointFromTown(light.position),
    direction: nimbusHexacopterVectorFromTown(light.direction),
    carrierClusterId: NIMBUS_HEXACOPTER_CLUSTER_ID,
  }));

function createPadFixtures(pad: NimbusMutableGroup): void {
  const socket = nimbusHexacopterPoint(1.32, 0, HEXACOPTER_PAD_TOP_Y);
  nimbusPrimitive(
    pad,
    `${NIMBUS_HEXACOPTER_PAD_ID}:hx6-socket:cup`,
    "steel",
    "cylinder",
    [socket[0], NIMBUS_HEXACOPTER_PAD_TOP_Y + 0.09, socket[2]],
    [0.42, 0.18, 0.42],
    "#9ba2a8",
    {
      textureProfile: "painted-steel",
      bearsLoad: false,
      carriesAttachments: false,
    },
  );
  nimbusPrimitive(
    pad,
    `${NIMBUS_HEXACOPTER_PAD_ID}:hx6-socket:collar`,
    "steel",
    "cylinder",
    [socket[0], NIMBUS_HEXACOPTER_PAD_TOP_Y + 0.19, socket[2]],
    [0.5, 0.05, 0.5],
    "#dbe2e6",
    {
      textureProfile: "painted-steel",
      bearsLoad: false,
      carriesAttachments: false,
    },
  );

  const console = nimbusHexacopterPoint(2.9, -2.9, HEXACOPTER_PAD_TOP_Y);
  nimbusPrimitive(
    pad,
    `${NIMBUS_HEXACOPTER_PAD_ID}:hx6-dispatch:post`,
    "steel",
    "cylinder",
    [console[0], NIMBUS_HEXACOPTER_PAD_TOP_Y + 0.5, console[2]],
    [0.1, 1, 0.1],
    "#464d52",
    {
      textureProfile: "painted-steel",
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.3,
      carriesAttachments: true,
      bearingArea: 0.5,
    },
  );
  const consoleRotation = nimbusOrient(NIMBUS_HEXACOPTER_NOSE, [0, 1, 0]);
  nimbusPrimitive(
    pad,
    `${NIMBUS_HEXACOPTER_PAD_ID}:hx6-dispatch:board`,
    "steel",
    "steelSheet",
    [console[0], NIMBUS_HEXACOPTER_PAD_TOP_Y + 1.02, console[2]],
    [0.46, 0.05, 0.34],
    "#353b40",
    {
      rotation: consoleRotation,
      textureProfile: "painted-steel",
      bearsLoad: false,
      carriesAttachments: true,
      attachmentSupportMode: "cable",
      sideAttachmentReach: 0.25,
    },
  );
  nimbusPrimitive(
    pad,
    `${NIMBUS_HEXACOPTER_PAD_ID}:hx6-dispatch:screen`,
    "glass",
    "glassPane",
    [
      console[0] + NIMBUS_HEXACOPTER_NOSE[0] * 0.05,
      NIMBUS_HEXACOPTER_PAD_TOP_Y + 1.02,
      console[2] + NIMBUS_HEXACOPTER_NOSE[2] * 0.05,
    ],
    [0.36, 0.03, 0.24],
    "#0e3a45",
    {
      rotation: consoleRotation,
      bearsLoad: false,
      sideAttachmentReach: 0.2,
      light: {
        color: "#46d3e8",
        distance: 6,
        intensity: 1.6,
        dayIntensityFactor: 0.7,
        poolPriority: 5,
      },
    },
  );
}

export function createNimbusHexacopter(
  vehicle: NimbusMutableGroup,
  existingPad: NimbusMutableGroup,
): void {
  for (const object of sourceHexacopter.objects) {
    vehicle.objects.push(transformedObject(object));
  }
  createPadFixtures(existingPad);
}

export const NIMBUS_HEXACOPTER_SOURCE_PIECE_COUNT =
  sourceHexacopter.objects.filter(
    (object): object is ScenePrimitiveDefinition => object.kind === "primitive",
  ).length;
