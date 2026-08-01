/**
 * СТЕНД ВЗРЫВА: та же арифметика, что в игре, но без браузера.
 *
 * Игра судит цель по её ВОКСЕЛЬНОЙ геометрии (compilePieceDamageGeometry),
 * а не по габаритной коробке — из-за этого прежний черновой стенд врал:
 * он говорил «лопасть цела» там, где живая сцена её сносила. Здесь тот же
 * источник геометрии, тот же порог carve и та же таблица прозрачности,
 * поэтому стенд можно использовать вместо прогона, а живой прогон — как
 * подтверждение.
 *
 * ГРАНИЦА ТОЧНОСТИ. Стенд перебирает окклюдеры полным списком, а игра
 * берёт их из пространственного индекса вдоль луча, который на касательных
 * трассах возвращает не всех. Поэтому прямое попадание стенд и игра считают
 * одинаково (проверено: 1.00 двигателя там и там), а на скользящих ракурсах
 * стенд даёт НИЖНЮЮ оценку урона. Для калибровки этого достаточно: если
 * нижняя оценка уже в полосе, живой прогон её только подтвердит.
 *
 * Запуск: node --experimental-strip-types tools/blast-lab.mjs [kind]
 */
import { Euler, Quaternion, Vector3 } from "three";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";
import { getPieceRenderBoxes } from "../games/make-a-mess/src/game/breakableGeometry.ts";
import {
  levelLiftCeiling,
  liftHoldVerdict,
  rotorLiftState,
} from "../games/make-a-mess/src/game/vehicleLiftGeometry.ts";
import { airVehicles } from "../games/make-a-mess/src/game/airVehicles.ts";
import { massProperties } from "../games/make-a-mess/src/game/clusterDynamics.ts";
import { structuralMaterialProfiles } from "../games/make-a-mess/src/game/destructionScene.ts";
import {
  blastEnergyAtDistance,
  closestPointOnOccupiedGeometry,
  explosiveProfile,
  fractureEnergyByMaterial,
  segmentIntersectsOccupiedGeometry,
} from "../games/make-a-mess/src/game/destructionRuntime.ts";

/** Та же таблица, что в MakeAMessGame.blastTransmissionByMaterial. */
export const BLAST_TRANSMISSION = {
  glass: 0.76, darkGlass: 0.68, plaster: 0.36, plastic: 0.48, wood: 0.24,
  cloth: 0.7, foliage: 0.58, grass: 0.11, soil: 0.1, earth: 0.09, brick: 0.06,
  asphalt: 0.05, concrete: 0.025, stone: 0.02, graphiteStone: 0.018,
  basalt: 0.014, steel: 0.01,
};

/**
 * Игра судит взрыв ТОЙ ЖЕ занятой геометрией, что и occupiedBoxesForBlast:
 * подробные коробки берутся только у составных кусков, всем остальным —
 * габарит. Стенд обязан повторять это буквально, иначе он «видит» больше
 * препятствий, чем игра, и молча занижает урон.
 */
function blastBoxes(piece) {
  return piece.shape === "cinderBlock" ? getPieceRenderBoxes(piece) : undefined;
}

/** Мировые куски кластера с их боевой геометрией. */
export function clusterTargets(clusterId, pieces = townScene.breakablePieces) {
  return pieces
    .filter((piece) => piece.clusterId === clusterId)
    .map((piece) => ({
      piece,
      position: new Vector3(...piece.position),
      quaternion: new Quaternion().setFromEuler(
        new Euler(
          piece.rotation?.[0] ?? 0,
          piece.rotation?.[1] ?? 0,
          piece.rotation?.[2] ?? 0,
        ),
      ),
      boxes: blastBoxes(piece),
    }));
}

/**
 * Кто вскрыт этим взрывом. Возвращает множество id, повторяя порядок
 * рассуждения игры: ближайшая точка занятой геометрии -> окклюзия по лучу
 * -> энергия против порога материала.
 */
export function blastVictims(kind, blastPoint, targets) {
  const profile = explosiveProfile(kind);
  const centre = new Vector3(...blastPoint);
  const reachable = targets
    .map((target) => {
      const impact = closestPointOnOccupiedGeometry(
        centre,
        target.position,
        target.piece.size,
        target.quaternion,
        target.boxes,
      );
      return { ...target, impact, distance: centre.distanceTo(impact) };
    })
    .filter((target) => target.distance < profile.blastRadius)
    .sort((left, right) => left.distance - right.distance);

  const victims = new Set();
  for (const target of reachable) {
    let transmission = 1;
    for (const occluder of reachable) {
      if (
        occluder.piece.id === target.piece.id ||
        occluder.distance >= target.distance - 0.08 ||
        // Кусок, ВНУТРИ которого сработал заряд, не экранирует ничего: он
        // сам и есть первая жертва. Без этого правила ступица кольца
        // «закрывала» собственные лопасти от взрыва в её же оси.
        occluder.distance <= 0.05
      ) {
        continue;
      }
      if (
        segmentIntersectsOccupiedGeometry(
          centre,
          target.impact,
          occluder.position,
          occluder.piece.size,
          occluder.quaternion,
          occluder.boxes,
          0.025,
        )
      ) {
        transmission *= BLAST_TRANSMISSION[occluder.piece.material] ?? 0.1;
        if (transmission < 0.04) break;
      }
    }
    const energy =
      blastEnergyAtDistance(target.distance, profile.blastRadius, profile.damageEnergy) *
      transmission;
    if (energy > fractureEnergyByMaterial[target.piece.material] * 1.15) {
      victims.add(target.piece.id);
    }
  }
  return victims;
}

/** Сколько ДВИГАТЕЛЕЙ по сумме тяги снято: кольцо = 1, лопасть = 1/3. */
export function enginesLost(victims) {
  const perRing = new Map();
  for (const id of victims) {
    const ring = id.match(/engine:(\d+):blade/)?.[1];
    if (ring === undefined) continue;
    perRing.set(ring, (perRing.get(ring) ?? 0) + 1);
  }
  let engines = 0;
  for (const lost of perRing.values()) engines += Math.min(3, lost) / 3;
  return engines;
}

const HEX = "town-vertipad:hexacopter";

/**
 * УДЕРЖАНИЕ, А НЕ СУММА ТЯГИ.
 *
 * Машину сбивает не «сколько процентов тяги снято», а потеря СТОРОНЫ:
 * центр масс выходит за выпуклую оболочку уцелевших колец, и держать позу
 * становится нечем. Поэтому вердикт берётся тем же судьёй, что и в полёте.
 */
export function holdVerdict(clusterId, victims, pieces = townScene.breakablePieces) {
  const frame = airVehicles.find((v) => v.clusterId === clusterId);
  const members = pieces.filter((piece) => piece.clusterId === clusterId);
  const alive = members.filter((piece) => !victims.has(piece.id));
  const mass = massProperties(alive, (m) => structuralMaterialProfiles[m].density);
  const intact = massProperties(members, (m) => structuralMaterialProfiles[m].density);
  const points = frame.flight.limits.enginePoints;
  // Доля живых лопастей канала и есть его доступная тяга.
  const availability = points.map((_, index) => {
    const blades = members.filter((p) => p.id.includes(`engine:${index}:blade:`));
    const live = blades.filter((p) => !victims.has(p.id)).length;
    return blades.length > 0 ? live / blades.length : 1;
  });
  const capacity =
    (intact.mass * 9.81 * (frame.flight.liftReserve ?? 1.35)) / Math.max(1, points.length);
  const verdict = liftHoldVerdict(
    "rotor",
    points.map((point, index) => ({ point, available: availability[index] })),
    mass.centre,
    capacity,
    mass.mass * 9.81,
  );
  return {
    state: rotorLiftState(verdict),
    availability,
    levelCeiling: levelLiftCeiling(points, mass.centre, availability),
    liftToWeight: verdict.liftToWeight,
  };
}
export function hexacopterShotGrid() {
  const shots = [];
  for (let ring = 0; ring < 6; ring += 1) {
    const angle = ((30 + ring * 60) * Math.PI) / 180;
    const at = [69 - 2.15 * Math.cos(angle), 0.9, -3 - 2.15 * Math.sin(angle)];
    shots.push([`ring${ring}:direct`, at]);
    shots.push([
      `ring${ring}:outside`,
      [at[0] + (at[0] - 69) * 0.35, at[1], at[2] + (at[2] + 3) * 0.35],
    ]);
    shots.push([`ring${ring}:above`, [at[0], at[1] + 1.0, at[2]]]);
    // Настоящий боевой ракурс: стрельба с земли, снизу-сбоку. Кольцевой
    // кожух прикрывает винт с борта, но снизу диффузор открыт, и лопасти
    // видны — именно так машину и сбивают на самом деле.
    shots.push([`ring${ring}:below`, [at[0], at[1] - 0.9, at[2]]]);
    shots.push([
      `ring${ring}:below-out`,
      [at[0] + (at[0] - 69) * 0.3, at[1] - 0.7, at[2] + (at[2] + 3) * 0.3],
    ]);
  }
  shots.push(["cabin", [69, 1.7, -3]]);
  shots.push(["under centre", [69, -0.2, -3]]);
  return shots;
}

if (process.argv[1]?.endsWith("blast-lab.mjs")) {
  const targets = clusterTargets(HEX);
  for (const kind of process.argv[2] ? [process.argv[2]] : ["lance", "rocket"]) {
    const values = [];
    const states = [];
    console.log(`\n=== ${kind} ===`);
    for (const [label, at] of hexacopterShotGrid()) {
      const victims = blastVictims(kind, at, targets);
      const lost = enginesLost(victims);
      const hold = holdVerdict(HEX, victims);
      values.push(lost);
      states.push(hold.state);
      console.log(
        `  ${label.padEnd(16)} engines ${lost.toFixed(2)}  thrust [${hold.availability
          .map((v) => v.toFixed(1))
          .join(" ")}]  ceiling ${hold.levelCeiling.toFixed(2)}  => ${hold.state}`,
      );
    }
    const sorted = [...values].sort((a, b) => a - b);
    console.log(
      `  median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)}  min ${sorted[0].toFixed(2)}  max ${sorted.at(-1).toFixed(2)}  in 0.8..1.5: ${values.filter((v) => v >= 0.8 && v <= 1.5).length}/${values.length}`,
    );
    const tumbles = states.filter((s) => s === "tumbling").length;
    const sinks = states.filter((s) => s === "sinking").length;
    console.log(
      `  ВЕРДИКТ УДЕРЖАНИЯ: летит ${states.length - tumbles - sinks}, снижается ${sinks}, ПАДАЕТ ${tumbles} из ${states.length}`,
    );
  }
}
