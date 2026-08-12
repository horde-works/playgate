import type { SceneVector3 } from "../../../game/destructionScene.ts";
import type { NimbusMutableGroup } from "./nimbusAuthoring.ts";
import {
  nimbusGroundSeatBox,
  nimbusNoise,
  nimbusOrient,
  nimbusPrimitive,
} from "./nimbusAuthoring.ts";
import {
  NIMBUS_BOWL_YAW,
  NIMBUS_SPINDLE_TOWER_CENTRE,
  NIMBUS_TOWER_CENTRE,
  nimbusGroundUnder,
} from "./nimbusShell.ts";
import {
  NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS,
  nimbusAtmosphericSupportEndpoints,
} from "./nimbusAtmosphericTower.ts";

const YARD_ALONG: readonly [number, number] = [
  Math.cos(NIMBUS_BOWL_YAW),
  Math.sin(NIMBUS_BOWL_YAW),
];
const YARD_ACROSS: readonly [number, number] = [
  -Math.sin(NIMBUS_BOWL_YAW),
  Math.cos(NIMBUS_BOWL_YAW),
];
const YARD_ROTATION = nimbusOrient(
  [YARD_ALONG[0], 0, YARD_ALONG[1]],
  [0, 1, 0],
);

const BERM_PITCH = 4;
const BERM_HEIGHT = 1.65;
const PLAZA_PITCH = 6;

export const NIMBUS_OFFICE_PLAZA_IDS = [
  "office-rim",
  "office-spindle",
] as const;

interface NimbusGroundInfrastructureGroups {
  readonly earthworks: NimbusMutableGroup;
  readonly retaining: NimbusMutableGroup;
  readonly officePlazas: NimbusMutableGroup;
}

function offsetPoint(
  origin: readonly [number, number],
  along: readonly [number, number],
  across: readonly [number, number],
  alongOffset: number,
  acrossOffset: number,
): readonly [number, number] {
  return [
    origin[0] + along[0] * alongOffset + across[0] * acrossOffset,
    origin[1] + along[1] * alongOffset + across[1] * acrossOffset,
  ];
}

function createSupportBerms(
  earthworks: NimbusMutableGroup,
  retaining: NimbusMutableGroup,
): void {
  let supportIndex = 0;
  for (const station of NIMBUS_ATMOSPHERIC_SUPPORT_STATIONS) {
    for (const side of [-1, 1] as const) {
      const [base] = nimbusAtmosphericSupportEndpoints(station, side);
      const origin = [base[0], base[2]] as const;
      for (let along = -16; along <= 16; along += BERM_PITCH) {
        for (let inward = -8; inward <= 24; inward += BERM_PITCH) {
          const across = -side * inward;
          if (Math.abs(along) < 7 && Math.abs(across) < 6.4) continue;
          const distance = Math.hypot(along / 18, (inward - 1) / 27);
          const irregularEdge = 0.92
            + (nimbusNoise(supportIndex, along + inward, 141) - 0.5) * 0.2;
          if (distance > irregularEdge) continue;
          const [x, z] = offsetPoint(
            origin,
            YARD_ALONG,
            YARD_ACROSS,
            along,
            across,
          );
          const ground = nimbusGroundUnder(x, z).top;
          const shoulder = Math.pow(Math.max(0, 1 - distance), 1.25);
          const height = Math.max(
            0.22,
            BERM_HEIGHT * shoulder
              + (nimbusNoise(x, z, 142) - 0.5) * 0.24,
          );
          const centreY = ground - 0.08 + height / 2;
          // Ровно шаг. Нахлёст в 8 см ничего не закрывал: ступеньку между
          // клетками разной высоты он не прячет (её видно с боку в любом
          // случае), а вот у клеток одинаковой высоты делал верх общим — и
          // они спорили за пиксели.
          const size: SceneVector3 = [BERM_PITCH, height, BERM_PITCH];
          const stony = distance > 0.68 || nimbusNoise(x, z, 143) > 0.78;
          nimbusPrimitive(
            earthworks,
            `support-berm:${supportIndex}:fill:${along}:${inward}`,
            stony ? "soil" : "earth",
            "groundTile",
            [x, centreY, z],
            size,
            stony
              ? nimbusNoise(x, z, 144) > 0.5 ? "#696858" : "#5d6251"
              : nimbusNoise(x, z, 145) > 0.5 ? "#67634f" : "#747052",
            {
              rotation: YARD_ROTATION,
              textureProfile: stony ? "nimbus-crushed-aggregate" : undefined,
              contactBoxes: [nimbusGroundSeatBox(centreY, size, ground)],
              contactBearingOrder: true,
              bearsLoad: false,
              surface: stony ? [{ kind: "damp", amount: 0.22 }] : undefined,
            },
          );
        }
      }

      // Only the cut facing the work bowl is retained. The outer three sides
      // remain soil, so each mound grows out of the natural slope.
      for (const along of [-4, 0, 4]) {
        const across = -side * 6.45;
        const [x, z] = offsetPoint(
          origin,
          YARD_ALONG,
          YARD_ACROSS,
          along,
          across,
        );
        const ground = nimbusGroundUnder(x, z).top;
        const height = 1.25 + nimbusNoise(supportIndex, along, 146) * 0.55;
        const centre: SceneVector3 = [x, ground + height / 2, z];
        const size: SceneVector3 = [4.1, height, 0.34];
        nimbusPrimitive(
          retaining,
          `support-berm:${supportIndex}:retaining:${along}`,
          "concrete",
          "panel",
          centre,
          size,
          along === 0 ? "#777c78" : "#686f6d",
          {
            rotation: YARD_ROTATION,
            textureProfile: "nimbus-board-formed-concrete",
            contactBoxes: [nimbusGroundSeatBox(centre[1], size, ground)],
            contactBearingOrder: true,
            bearsLoad: false,
          },
        );
      }
      supportIndex += 1;
    }
  }
}

interface PlazaDefinition {
  readonly id: typeof NIMBUS_OFFICE_PLAZA_IDS[number];
  readonly centre: readonly [number, number];
  readonly halfAlong: number;
  readonly halfAcross: number;
  readonly entranceSign: -1 | 1;
}

const OFFICE_PLAZAS: readonly PlazaDefinition[] = [
  {
    id: "office-rim",
    centre: NIMBUS_TOWER_CENTRE,
    halfAlong: 34,
    halfAcross: 27,
    entranceSign: -1,
  },
  {
    id: "office-spindle",
    centre: NIMBUS_SPINDLE_TOWER_CENTRE,
    halfAlong: 37,
    halfAcross: 25,
    entranceSign: 1,
  },
] as const;

function createOfficePlazas(officePlazas: NimbusMutableGroup): void {
  for (const plaza of OFFICE_PLAZAS) {
    const length = Math.hypot(...plaza.centre);
    const radial = [plaza.centre[0] / length, plaza.centre[1] / length] as const;
    const tangent = [radial[1], -radial[0]] as const;
    const rotation = nimbusOrient(
      [tangent[0], 0, tangent[1]],
      [0, 1, 0],
    );
    const alongLimit = Math.ceil(plaza.halfAlong / PLAZA_PITCH) * PLAZA_PITCH;
    const acrossLimit = Math.ceil(plaza.halfAcross / PLAZA_PITCH) * PLAZA_PITCH;
    for (let along = -alongLimit; along <= alongLimit; along += PLAZA_PITCH) {
      for (let across = -acrossLimit; across <= acrossLimit; across += PLAZA_PITCH) {
        const ellipse = Math.hypot(
          along / plaza.halfAlong,
          across / plaza.halfAcross,
        );
        const edgeNoise = (nimbusNoise(along, across, plaza.id.length) - 0.5) * 0.09;
        const entranceApron = plaza.entranceSign * across > plaza.halfAcross * 0.72
          && Math.abs(along) < 13;
        if (ellipse > 1 + edgeNoise && !entranceApron) continue;
        const [x, z] = offsetPoint(
          plaza.centre,
          tangent,
          radial,
          along,
          across,
        );
        const ground = nimbusGroundUnder(x, z).top;
        const outer = ellipse > 0.72;
        nimbusPrimitive(
          officePlazas,
          `${plaza.id}:tile:${along}:${across}`,
          outer ? "asphalt" : "concrete",
          "groundTile",
          [x, ground + 0.09, z],
          // Ровно шаг: `+ 0.04` делал верхние плоскости соседних плит общими,
          // и мостовая площадей спорила за пиксели по всей решётке.
          [PLAZA_PITCH, 0.18, PLAZA_PITCH],
          outer
            ? nimbusNoise(x, z, 151) > 0.5 ? "#4b5152" : "#555b5a"
            : nimbusNoise(x, z, 152) > 0.5 ? "#a4a8a3" : "#929792",
          {
            rotation,
            textureProfile: outer
              ? "nimbus-technical-deck"
              : "nimbus-board-formed-concrete",
            bearsLoad: false,
            contactBearingOrder: true,
          },
        );
      }
    }
  }
}

export function createNimbusGroundInfrastructure(
  groups: NimbusGroundInfrastructureGroups,
): void {
  createSupportBerms(groups.earthworks, groups.retaining);
  createOfficePlazas(groups.officePlazas);
}
