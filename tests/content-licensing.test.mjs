import assert from "node:assert/strict";
import test from "node:test";
import {
  describeContentLicence,
  forbidsCommercialUse,
  forbidsDerivatives,
} from "../games/make-a-mess/src/game/contentLicensing.ts";

test("no-derivatives licences are recognised", () => {
  assert.equal(forbidsDerivatives("CC-BY-NC-ND-4.0"), true);
  assert.equal(forbidsDerivatives("CC-BY-ND-4.0"), true);

  assert.equal(forbidsDerivatives("CC-BY-NC-4.0"), false);
  assert.equal(forbidsDerivatives("CC-BY-SA-4.0"), false);
  assert.equal(forbidsDerivatives("AGPL-3.0-or-later"), false);
  assert.equal(forbidsDerivatives(null), false);
  // «ND» внутри слова — не запрет: ищем именно поле идентификатора.
  assert.equal(forbidsDerivatives("ODbL-1.0"), false);
  assert.equal(forbidsDerivatives("LicenseRef-INDUSTRIAL"), false);
});

test("non-commercial licences are recognised", () => {
  assert.equal(forbidsCommercialUse("CC-BY-NC-ND-4.0"), true);
  assert.equal(forbidsCommercialUse("CC-BY-NC-SA-4.0"), true);

  assert.equal(forbidsCommercialUse("CC-BY-4.0"), false);
  assert.equal(forbidsCommercialUse("AGPL-3.0-or-later"), false);
  assert.equal(forbidsCommercialUse(undefined), false);
  assert.equal(forbidsCommercialUse("LicenseRef-ENCLOSED"), false);
});

test("a world without its own licence falls back to the repository one", () => {
  assert.equal(describeContentLicence(null), "AGPL-3.0-or-later (как код)");
  assert.equal(describeContentLicence(""), "AGPL-3.0-or-later (как код)");
  assert.equal(describeContentLicence("CC-BY-NC-ND-4.0"), "CC-BY-NC-ND-4.0");
});

test("the Astana licence closes both doors at once", () => {
  // Мир-портрет реального города: ни переработки (значит и разрушимой
  // версии), ни коммерческой сборки — см. LICENSING.md.
  const astana = "CC-BY-NC-ND-4.0";

  assert.equal(forbidsDerivatives(astana), true);
  assert.equal(forbidsCommercialUse(astana), true);
});
