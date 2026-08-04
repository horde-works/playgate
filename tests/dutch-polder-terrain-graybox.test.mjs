import assert from "node:assert/strict";
import test from "node:test";
import {
  DUTCH_POLDER_BRIDGE_SEATS,
  DUTCH_POLDER_BRIDGE_APPROACHES,
  DUTCH_POLDER_BUILDING_PLOTS,
  DUTCH_POLDER_CHANNELS,
  DUTCH_POLDER_CHANNEL_BANK_WIDTH,
  DUTCH_POLDER_OBJECT_RESERVES,
  DUTCH_POLDER_PAD_BANK_MARGIN,
  DUTCH_POLDER_PAD_SHORE_MARGIN,
  DUTCH_POLDER_ROUTES,
  DUTCH_POLDER_SHORELINE,
  DUTCH_POLDER_ZONES,
  dutchPolderGroundTopAt,
  dutchPolderKeepOut,
  dutchPolderPlotArrival,
  dutchPolderPlotToWorld,
  dutchPolderRectRadius,
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
  // A circle is the true keep-out shape for a mill, because its sails sweep
  // one. A building has no sails, so its reserve is read from the plot it
  // actually occupies rather than from an authored radius.
  for (const plot of DUTCH_POLDER_BUILDING_PLOTS) {
    const reserve = DUTCH_POLDER_OBJECT_RESERVES.find(({ id }) => id === plot.id);
    assert.equal(plot.sweep !== undefined, plot.id.startsWith("M"), `${plot.id}: sweep belongs to mills`);
    assert.equal(
      reserve.radius,
      Math.max(plot.sweep ?? 0, dutchPolderRectRadius(dutchPolderKeepOut(plot))),
      plot.id,
    );
    assert.ok(
      reserve.radius >= dutchPolderRectRadius(plot.footprint),
      `${plot.id}: reserve smaller than the building itself`,
    );
  }
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
  // A route has to deliver a visitor to the parcel gate where one is declared,
  // and only to the building origin while an object still has no parcel.
  for (const plot of DUTCH_POLDER_BUILDING_PLOTS) {
    const [x, , z] = dutchPolderPlotArrival(plot);
    assert.ok(reached.has(`${x.toFixed(2)}:${z.toFixed(2)}`), `${plot.id}: no mandatory route`);
  }
});

test("levelled ground carries the whole building and never eats a canal bank", () => {
  for (const plot of DUTCH_POLDER_BUILDING_PLOTS) {
    // The pad exists to hold the object up, so it must contain the footprint.
    assert.ok(plot.pad.minX <= plot.footprint.minX && plot.pad.maxX >= plot.footprint.maxX, `${plot.id}: pad narrower than its building`);
    assert.ok(plot.pad.minZ <= plot.footprint.minZ && plot.pad.maxZ >= plot.footprint.maxZ, `${plot.id}: pad shorter than its building`);
    let worstChannel = Number.POSITIVE_INFINITY;
    let worstShore = Number.POSITIVE_INFINITY;
    for (let ix = 0; ix <= 20; ix += 1) {
      for (let iz = 0; iz <= 20; iz += 1) {
        const [x, z] = dutchPolderPlotToWorld(
          plot,
          plot.pad.minX + (plot.pad.maxX - plot.pad.minX) * ix / 20,
          plot.pad.minZ + (plot.pad.maxZ - plot.pad.minZ) * iz / 20,
        );
        for (const channel of DUTCH_POLDER_CHANNELS) {
          worstChannel = Math.min(
            worstChannel,
            channelDistance(x, z, channel)
              - (channel.width / 2 + DUTCH_POLDER_CHANNEL_BANK_WIDTH + DUTCH_POLDER_PAD_BANK_MARGIN),
          );
        }
        worstShore = Math.min(worstShore, DUTCH_POLDER_SHORELINE.reduce(
          (best, point, index) => Math.min(best, distanceToSegment(x, z, point, DUTCH_POLDER_SHORELINE[(index + 1) % DUTCH_POLDER_SHORELINE.length])),
          Number.POSITIVE_INFINITY,
        ) - DUTCH_POLDER_PAD_SHORE_MARGIN);
      }
    }
    // Levelled ground may lap the soft terrace of a channel; the bed and the
    // bank are the shape of the waterway and belong to the water, not to a
    // construction pad that would flatten them into a lip.
    assert.ok(worstChannel > 0, `${plot.id}: levelled ground reaches into a canal bank by ${(-worstChannel).toFixed(2)} m`);
    assert.ok(worstShore > 0, `${plot.id}: levelled ground reaches the island edge by ${(-worstShore).toFixed(2)} m`);
  }
});
