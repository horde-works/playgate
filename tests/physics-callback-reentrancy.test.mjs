import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ДВА ЗАКОНА ПРО ГРАНИЦУ ФИЗИЧЕСКОГО МИРА.
//
// Оба нарушения давали одну и ту же ошибку из wasm — «recursive use of an
// object detected which would lead to unsafe aliasing in Rust», — и оба
// невидимы для обычных тестов: живут в React-компоненте, который ничем не
// покрыт. Поэтому сторож смотрит в исходник.

const GAME = fileURLToPath(
  new URL("../games/make-a-mess/src/game/MakeAMessGame.tsx", import.meta.url),
);

// Концы строк нормализуются: на Windows файл лежит с CRLF, и поиск по «\n»
// там не совпадает. Сторож на этом уже один раз покраснел на чужой машине,
// оставшись зелёным на своей.
const source = readFileSync(GAME, "utf8").replace(/\r\n/g, "\n");

function componentSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `компонент ${name} не найден`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

function braceBlockAfter(text, marker) {
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `не найдено: ${marker}`);
  let depth = 0;
  for (let index = start + marker.length - 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  assert.fail(`незакрытая скобка после ${marker}`);
}

test("снаряд не подрывается изнутри колбэка столкновения", () => {
  const handler = braceBlockAfter(
    componentSource("Grenade"),
    "onCollisionEnter={",
  );

  // Rapier зовёт этот обработчик из-под собственного шага, одолжив мир
  // наружу. Всё, что трогает мир или React, обязано уехать в кадр.
  for (const forbidden of [
    "onExplode(",
    "trigger(",
    "triggerAt(",
    "explodeAt(",
    "applyImpulse",
    "setLinvel",
    "setAngvel",
  ]) {
    assert.ok(
      !handler.includes(forbidden),
      `обработчик столкновения снаряда снова делает ${forbidden}`,
    );
  }
  assert.match(
    handler,
    /pendingContact\.current =/,
    "обработчик обязан только отметить касание",
  );
});

test("модель оружия ждёт свою текстуру под собственной границей", () => {
  const physics = source.search(/<Physics\n/);
  assert.notEqual(physics, -1, "<Physics> не найден");
  assert.match(
    source.slice(Math.max(0, physics - 200), physics),
    /<Suspense/,
    "внешняя граница ожидания стоит над <Physics> — это исходное устройство",
  );

  const start = source.indexOf("<FirstPersonToolLighting />");
  const end = source.indexOf("<MouseLook", start);
  assert.ok(start !== -1 && end !== -1, "блок модели вида не найден");
  const viewModel = source.slice(start, end);

  // Без своей границы ожидание текстуры ствола гасит поддерево до <Physics>
  // и пересобирает весь физический мир на первой же смене оружия.
  assert.ok(
    viewModel.includes("<Suspense") && viewModel.includes("</Suspense>"),
    "модели оружия нужна собственная граница Suspense",
  );
  const boundary = viewModel.slice(
    viewModel.indexOf("<Suspense"),
    viewModel.indexOf("</Suspense>"),
  );
  for (const weapon of [
    "FirstPersonHammer",
    "FirstPersonLauncher",
    "FirstPersonRocketLauncher",
    "FirstPersonDemolitionCharge",
    "FirstPersonMachineGun",
  ]) {
    assert.ok(
      boundary.includes(weapon),
      `${weapon} остался вне собственной границы ожидания`,
    );
  }
});
