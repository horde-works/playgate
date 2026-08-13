import assert from "node:assert/strict";
import test from "node:test";
import {
  humanSettlementPopulation,
  validateCreaturePopulationDefinitions,
} from "../games/make-a-mess/src/game/creaturePopulation.ts";
import { CreatureEventJournal } from "../games/make-a-mess/src/game/creatureWorld.ts";
import { vikingSettlement } from "../games/make-a-mess/src/content/scenes/vikingSettlement.ts";
import { vikingVillageDocument } from "../games/make-a-mess/src/content/scenes/vikingVillageDocument.ts";
import { vikingVillageScene } from "../games/make-a-mess/src/game/vikingVillageScene.ts";
import { townScene } from "../games/make-a-mess/src/game/townScene.ts";

test("a world declares residents without runtime scene-id wiring", () => {
  assert.equal(vikingVillageDocument.inhabitants?.length, 1);
  assert.equal(vikingVillageScene.inhabitantDefinitions.length, 1);

  const residents = vikingVillageScene.inhabitantDefinitions[0];
  assert.equal(residents.id, "viking-village-residents");
  assert.equal(residents.kind, "human-settlement");
  assert.equal(residents.bodyType, "human");
  assert.equal(residents.species, "human");
  assert.equal(residents.count, 34);
  assert.equal(residents.settlement, vikingSettlement);

  // A described but deliberately unpopulated settlement remains empty. The
  // renderer no longer infers residents from a known scene id.
  assert.deepEqual(townScene.inhabitantDefinitions, []);
});

test("population definitions reject ambiguous identity and invalid counts", () => {
  const residents = humanSettlementPopulation({
    id: "residents",
    count: 4,
    settlement: vikingSettlement,
  });

  assert.throws(
    () => validateCreaturePopulationDefinitions("duplicate-world", [residents, residents]),
    /duplicate creature population residents/,
  );
  const neighbours = humanSettlementPopulation({
    id: "neighbours",
    count: 3,
    settlement: vikingSettlement,
  });
  assert.throws(
    () => validateCreaturePopulationDefinitions("two-towns", [residents, neighbours]),
    /multiple human settlements need independent door, stock and inspection bindings/,
  );
  assert.throws(
    () =>
      humanSettlementPopulation({
        id: "nobody",
        count: 0,
        settlement: vikingSettlement,
      }),
    /count must be a positive integer/,
  );
});

test("world events are multicast instead of consumed by the first population", () => {
  const events = new CreatureEventJournal(4);
  let humanCursor = events.latestSequence;
  let animalCursor = events.latestSequence;

  events.publish({ kind: "shot" });
  events.publish({ kind: "collapse" });

  const humanRead = events.readAfter(humanCursor);
  humanCursor = humanRead.cursor;
  assert.deepEqual(humanRead.events.map((event) => event.kind), ["shot", "collapse"]);

  const animalRead = events.readAfter(animalCursor);
  animalCursor = animalRead.cursor;
  assert.deepEqual(animalRead.events.map((event) => event.kind), ["shot", "collapse"]);

  events.publish({ kind: "horn" });
  assert.deepEqual(
    events.readAfter(humanCursor).events.map((event) => event.kind),
    ["horn"],
  );
  assert.deepEqual(
    events.readAfter(animalCursor).events.map((event) => event.kind),
    ["horn"],
  );
});

test("the world event journal is bounded and reports an overrun", () => {
  const events = new CreatureEventJournal(2);
  events.publish("first");
  events.publish("second");
  events.publish("third");

  const read = events.readAfter(0);
  assert.equal(read.dropped, 1);
  assert.deepEqual(read.events, ["second", "third"]);
  assert.equal(read.cursor, 3);
});
