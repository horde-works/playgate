import assert from "node:assert/strict";
import test from "node:test";

import { sceneCopy } from "../app/i18n/dictionary.ts";

test("The Capital gate has complete copy in every interface language", () => {
  const expectedTitles = {
    en: "Welcome to the Capital island.",
    es: "Bienvenido a la isla Capital.",
    ru: "Добро пожаловать на остров-столицу.",
  };

  for (const [language, startTitle] of Object.entries(expectedTitles)) {
    const copy = sceneCopy.astana[language];
    assert.equal(copy.status, "Make a Mess / The Capital");
    assert.equal(copy.startTitle, startTitle);
    assert.ok(copy.eyebrow.length > 0);
    assert.ok(copy.ready.length > 0);
    assert.ok(copy.description.length > 0);
    assert.doesNotMatch(copy.description, /Astana|Астана|Astaná/);
    assert.doesNotMatch(copy.description, /Байтерек|Baiterek|LRT|ЛРТ/);
  }
});

test("The Capital gate is about connection rather than destruction", () => {
  for (const copy of Object.values(sceneCopy.astana)) {
    assert.doesNotMatch(copy.startTitle, /break|romper|сломать/i);
    assert.doesNotMatch(copy.description, /break|romper|сломать/i);
  }
});
