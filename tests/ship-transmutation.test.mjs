import assert from "node:assert/strict";
import test from "node:test";
import {
  shipFormForIsland,
  shipTransmutationPlan,
  shipTransmutationStage,
} from "../games/make-a-mess/src/game/shipTransmutation.ts";

test("Town and Viking Village expose the two implemented physical forms", () => {
  assert.equal(shipFormForIsland("town"), "town-airship");
  assert.equal(shipFormForIsland("viking-village"), "sky-longship");
  assert.equal(shipFormForIsland("astana"), null);
});

test("both directions preserve one ship identity and reset damage for this milestone", () => {
  const outward = shipTransmutationPlan("town", "viking-village");
  const homeward = shipTransmutationPlan("viking-village", "town");
  assert.ok(outward);
  assert.ok(homeward);
  assert.equal(outward.entityId, homeward.entityId);
  assert.equal(outward.sourceForm, homeward.destinationForm);
  assert.equal(outward.destinationForm, homeward.sourceForm);
  assert.equal(outward.passengerFrame, "preserve");
  assert.equal(outward.damageTransfer, "reset");
});

test("the observable rebuild order is material, function, then silhouette", () => {
  const plan = shipTransmutationPlan("town", "viking-village");
  assert.ok(plan);
  assert.deepEqual(plan.stages.map((stage) => stage.id), [
    "material",
    "function",
    "silhouette",
  ]);
  assert.equal(shipTransmutationStage(0.1), "material");
  assert.equal(shipTransmutationStage(0.4), "function");
  assert.equal(shipTransmutationStage(0.9), "silhouette");
});

test("there is no accidental transmutation through Astana or a closed route", () => {
  assert.equal(shipTransmutationPlan("town", "astana"), null);
  assert.equal(shipTransmutationPlan("town", "grand-terminal"), null);
  assert.equal(shipTransmutationPlan("town", "town"), null);
});
