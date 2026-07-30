import assert from "node:assert/strict";
import test from "node:test";
import { ui } from "../app/i18n/dictionary.ts";

test("the inter-island weapon refusal exists in every interface language", () => {
  assert.equal(
    ui.en["announce.interIslandWeaponBlocked"],
    "Weapons are not permitted on inter-island flights.",
  );
  assert.equal(
    ui.es["announce.interIslandWeaponBlocked"],
    "No se permite usar armas en los vuelos entre islas.",
  );
  assert.equal(
    ui.ru["announce.interIslandWeaponBlocked"],
    "Оружие не разрешено использовать на межостровных рейсах.",
  );
});
