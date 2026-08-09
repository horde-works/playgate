// Проверки СБОРКИ объекта в куски сцены. Здесь ловится то, что не видно ни в
// лаборатории, ни в полёте: маски кадра читают эти строки, и одна переименованная
// деталь молча превращает лопасть в неподвижный кусок, а ногу — в коллайдер,
// который находит опору в собственной пятке.
import test from "node:test";
import assert from "node:assert/strict";

import {
  createDuctHexacopterDocument,
  ductHexacopterPrototypeDocument,
} from "../games/make-a-mess/src/content/scenes/ductHexacopterPrototypeDocument.ts";
import {
  ductHexacopterObject,
  DUCT_HEX_LIFT_STATIONS,
  DUCT_HEX_YAW_STATIONS,
} from "../games/make-a-mess/src/content/objects/vehicles/ductHexacopterObject.ts";
import { ductHexacopterPrototypeFrame } from "../games/make-a-mess/src/game/ductHexacopter.ts";

const document = ductHexacopterPrototypeDocument;
const pieces = document.groups[0].objects;

test("в сцену уехал весь объект и ровно один раз", () => {
  assert.equal(document.groups.length, 1, "машина обязана быть одной группой и одним кластером");
  assert.equal(pieces.length, ductHexacopterObject.parts.length,
    "число кусков разошлось с числом деталей объекта");
  assert.equal(new Set(pieces.map((piece) => piece.id)).size, pieces.length, "куски с одинаковыми id");
  for (const piece of pieces) {
    assert.ok(piece.transform?.position, `${piece.id}: кусок без положения`);
    assert.ok(piece.size.every((value) => value > 0), `${piece.id}: вырожденный габарит`);
  }
});

test("маски кадра находят то, ради чего они написаны", () => {
  const [bladeMask] = ductHexacopterPrototypeFrame.independentMemberMatches;
  const [landingMask] = ductHexacopterPrototypeFrame.contactMemberExcludes;

  const blades = pieces.filter((piece) => piece.id.includes(bladeMask.replaceAll(":", "")));
  assert.equal(blades.length, DUCT_HEX_LIFT_STATIONS.length + DUCT_HEX_YAW_STATIONS.length,
    "независимых тел должно быть ровно восемь — по одному на вентилятор");
  for (const blade of blades) {
    assert.equal(blade.carriesAttachments, false, `${blade.id}: на вращающемся куске что-то висит`);
    assert.equal(blade.bearsLoad, false, `${blade.id}: лопасть объявлена несущей`);
    assert.ok(blade.sideAttachmentReach <= 0.1,
      `${blade.id}: допуск ${blade.sideAttachmentReach} даст лопасти опору в стенке тоннеля`);
  }

  const landing = pieces.filter((piece) => piece.id.startsWith(landingMask.replaceAll(":", "")));
  assert.ok(landing.length >= 36, `ног в сцене всего ${landing.length} кусков`);
  // Исключение работает по префиксу: если куску сменят имя, нога вернётся в
  // обвод компаунда и машина сядет в воздухе.
  for (const piece of landing) {
    assert.ok(piece.id.startsWith("landing-"), `${piece.id}: нога потеряла свой префикс`);
  }
});

test("восемь приводов, у каждого обязательный мотор и вклад лопасти", () => {
  const actuators = new Map();
  for (const piece of pieces) {
    if (!piece.actuator) continue;
    const entry = actuators.get(piece.actuator.id) ?? { required: 0, contribution: 0, channel: piece.actuator.commandChannel };
    if (piece.actuator.required) entry.required += 1;
    if (piece.actuator.contribution) entry.contribution += piece.actuator.contribution;
    actuators.set(piece.actuator.id, entry);
  }
  assert.equal(actuators.size, 8, "приводов должно быть восемь: шесть подъёмных и два продольных");
  for (const [id, entry] of actuators) {
    assert.equal(entry.required, 1, `${id}: обязательный кусок не один`);
    assert.ok(entry.contribution > 0, `${id}: привод без вклада — тяга не появится`);
    assert.ok(/^(throttle|yaw-throttle):\d$/.test(entry.channel), `${id}: канал команды ${entry.channel}`);
  }
});

test("прозрачно только стекло, и оно ничего не несёт", () => {
  const glass = pieces.filter((piece) => piece.material === "darkGlass");
  assert.equal(glass.length, 16, `стеклянных кусков ${glass.length}, а панелей фонаря шестнадцать`);
  for (const piece of glass) {
    assert.ok(piece.id.startsWith("canopy-pane-"), `${piece.id}: стеклом стал не фонарь`);
    assert.equal(piece.bearsLoad, false, `${piece.id}: стекло объявлено несущим`);
  }
});

test("силовой путь: ядро и обшивка несут, начинка и вращающееся — нет", () => {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  for (const part of ductHexacopterObject.parts) {
    const piece = byId.get(part.id) ?? [...byId.values()].find((candidate) => candidate.id.endsWith(part.id));
    if (!piece) continue;
    if (part.group.startsWith("core-") || part.group.startsWith("hull-")) {
      assert.equal(piece.bearsLoad, true, `${part.id}: конструкция объявлена ненесущей`);
    }
    if (part.group === "interior") {
      assert.equal(piece.bearsLoad, false, `${part.id}: начинка кабины объявлена несущей`);
    }
  }
});

test("размещение переносит и поворачивает всю машину целиком", () => {
  const moved = createDuctHexacopterDocument({
    sceneId: "berth-test",
    clusterId: "berth-test:vx8",
    position: [30, 0.5, -14],
    yaw: Math.PI / 2,
  });
  const movedPieces = moved.groups[0].objects;
  assert.equal(movedPieces.length, pieces.length);
  assert.equal(moved.groups[0].id, "vx8", "группа обязана называться так, как её зовёт кластер");

  const centre = movedPieces.reduce(
    (sum, piece) => [
      sum[0] + piece.transform.position[0] / movedPieces.length,
      sum[1] + piece.transform.position[1] / movedPieces.length,
      sum[2] + piece.transform.position[2] / movedPieces.length,
    ],
    [0, 0, 0],
  );
  assert.ok(Math.abs(centre[0] - 30) < 1.2 && Math.abs(centre[2] + 14) < 1.2,
    `машина не переехала на причал: центр кусков ${centre.map((v) => v.toFixed(2)).join("/")}`);

  // Поворот обязан быть общим: если хотя бы один кусок остался в авторской позе,
  // машина приедет с вывернутой деталью, и заметит это игрок, а не тест.
  const authored = new Map(pieces.map((piece) => [piece.id, piece.transform.position]));
  for (const piece of movedPieces) {
    const source = authored.get(piece.id);
    const localX = piece.transform.position[0] - 30;
    const localZ = piece.transform.position[2] + 14;
    // Поворот на 90 градусов переводит авторский z в x.
    assert.ok(Math.abs(localX - source[2]) < 1e-6 && Math.abs(localZ + source[0]) < 1e-6,
      `${piece.id}: кусок не повернулся вместе с машиной`);
  }
});
