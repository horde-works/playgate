import assert from "node:assert/strict";
import test from "node:test";
import {
  DUTCH_POLDER_BRIDGE_SEATS,
  DUTCH_POLDER_BRIDGE_APPROACHES,
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_OBJECT_RESERVES,
  DUTCH_POLDER_ROUTES,
  DUTCH_POLDER_SHORELINE,
  DUTCH_POLDER_ZONES,
  dutchPolderGroundTopAt,
  dutchPolderTerrainGraybox,
} from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderTerrainGraybox.ts";

const distanceToSegment = (x, z, [ax, az], [bx, bz]) => {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

const channelDistance = (x, z, channel) => Math.min(...channel.points.slice(1).map((end, index) =>
  distanceToSegment(x, z, channel.points[index], end),
));

test("остров — 18-точечная нерадиальная форма с шестью разными строительными отметками", () => {
  assert.equal(DUTCH_POLDER_SHORELINE.length, 18);
  assert.deepEqual(DUTCH_POLDER_ZONES.map(({ topY }) => topY).sort((a, b) => a - b), [0.8, 1.45, 1.9, 2.4, 2.8, 5.2]);
  assert.equal(dutchPolderTerrainGraybox.dimensions.shorelineWidth, 143);
  assert.equal(dutchPolderTerrainGraybox.dimensions.shorelineDepth, 109);
  assert.equal(dutchPolderTerrainGraybox.dimensions.topArea, 13058);
  assert.equal(dutchPolderTerrainGraybox.coordinates.origin, "island-centroid");
});

test("каждый принятый объект получает истинную отметку и отдельный радиус резерва", () => {
  assert.deepEqual(DUTCH_POLDER_OBJECT_RESERVES.map(({ id }) => id), ["M1", "M2", "M3", "M4", "H1", "H2"]);
  for (const reserve of DUTCH_POLDER_OBJECT_RESERVES) {
    const [x, z] = reserve.position;
    assert.ok(Math.abs(dutchPolderGroundTopAt(x, z) - reserve.baseY) <= 0.2, `${reserve.id}: base Y is detached from terrain`);
  }
  assert.equal(DUTCH_POLDER_OBJECT_RESERVES.find(({ id }) => id === "H2").radius, 13);
});

test("грубые клетки не пересекают математические водные призмы", () => {
  const cellHalfDiagonal = Math.hypot(2, 2);
  const surfaces = dutchPolderTerrainGraybox.parts.filter((part) => part.group === "terrain-surface");
  assert.ok(surfaces.length > 300);
  for (const surface of surfaces) {
    assert.equal(surface.kind, "box");
    for (const channel of DUTCH_POLDER_CHANNELS) {
      assert.ok(
        channelDistance(surface.center[0], surface.center[2], channel) > channel.width / 2 + cellHalfDiagonal - 1e-9,
        `${surface.id} overlaps ${channel.id}`,
      );
    }
  }
  assert.equal(dutchPolderTerrainGraybox.parts.filter((part) => part.group === "channel-bed").length, 16);
});

test("каждый мост ориентирован поперёк своего канала и имеет две противоположные опоры", () => {
  for (const bridge of DUTCH_POLDER_BRIDGE_SEATS) {
    const channel = DUTCH_POLDER_CHANNELS.find(({ id }) => id === bridge.channelId);
    const pads = dutchPolderTerrainGraybox.parts.filter((part) => part.id.startsWith(`bridge-seat:${bridge.id}:`));
    const axis = dutchPolderTerrainGraybox.parts.find((part) => part.id === `bridge-axis:${bridge.id}`);
    assert.equal(pads.length, 2, `${bridge.id}: exactly two bank seats`);
    assert.equal(axis.kind, "beam");
    const midpoint = [(axis.from[0] + axis.to[0]) / 2, (axis.from[2] + axis.to[2]) / 2];
    assert.ok(Math.hypot(midpoint[0] - bridge.position[0], midpoint[1] - bridge.position[1]) < 1e-9, `${bridge.id}: axis misses centreline`);
    const seatVectors = pads.map((pad) => {
      assert.equal(pad.kind, "box");
      return [pad.center[0] - bridge.position[0], pad.center[2] - bridge.position[1]];
    });
    assert.ok(Math.hypot(seatVectors[0][0] + seatVectors[1][0], seatVectors[0][1] + seatVectors[1][1]) < 1e-9, `${bridge.id}: seats are not opposing banks`);
    assert.ok(channelDistance(...midpoint, channel) < 0.001, `${bridge.id}: not on named channel`);
  }
});

test("обязательная сеть имеет связный путь от входа к каждому принятому объекту и не круче 1:12", () => {
  assert.ok(DUTCH_POLDER_ROUTES.every(({ mandatory }) => mandatory));
  const nodes = new Map();
  const key = ([x, , z]) => `${x.toFixed(2)}:${z.toFixed(2)}`;
  for (const route of DUTCH_POLDER_ROUTES) {
    for (let index = 1; index < route.points.length; index += 1) {
      const from = key(route.points[index - 1]);
      const to = key(route.points[index]);
      nodes.set(from, [...(nodes.get(from) ?? []), to]);
      nodes.set(to, [...(nodes.get(to) ?? []), from]);
      const [ax, ay, az] = route.points[index - 1];
      const [bx, by, bz] = route.points[index];
      assert.ok(Math.abs(by - ay) / Math.hypot(bx - ax, bz - az) <= 1 / 12 + 1e-9, `${route.id}:${index - 1} exceeds 1:12`);
    }
  }
  for (const bridge of DUTCH_POLDER_BRIDGE_APPROACHES) {
    const from = key(bridge.ends[0]);
    const to = key(bridge.ends[1]);
    nodes.set(from, [...(nodes.get(from) ?? []), to]);
    nodes.set(to, [...(nodes.get(to) ?? []), from]);
  }
  const reached = new Set([key(DUTCH_POLDER_ROUTES[0].points[0])]);
  for (const node of reached) for (const next of nodes.get(node) ?? []) reached.add(next);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of [...reached]) for (const next of nodes.get(node) ?? []) if (!reached.has(next)) { reached.add(next); expanded = true; }
  }
  for (const { id, position } of DUTCH_POLDER_OBJECT_RESERVES) assert.ok(reached.has(`${position[0].toFixed(2)}:${position[1].toFixed(2)}`), `${id}: no mandatory route`);
});
