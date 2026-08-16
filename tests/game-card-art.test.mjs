import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { games } from "../games/registry.ts";

const root = path.resolve(import.meta.dirname, "..");
const cardSource = readFileSync(path.join(root, "app/components/GameCard.tsx"), "utf8");
const styleSource = readFileSync(path.join(root, "app/globals.css"), "utf8");

/* Обложки уже были перепутаны местами (аэропорт показывал вокзал): у карточки
   правильная ссылка и неправильная картинка ни тайпчеком, ни глазами по коду не
   ловятся. Ловит только связь art ↔ slug. */
test("card art belongs to its own world", () => {
  for (const game of games) {
    assert.ok(
      game.slug.endsWith(game.art),
      `${game.slug}: обложка "${game.art}" принадлежит другому миру`,
    );
  }
});

test("every world has its own card art, none falls back to the default", () => {
  const arts = games.map((game) => game.art);
  assert.equal(new Set(arts).size, arts.length, `обложки повторяются: ${arts.join(", ")}`);

  for (const game of games) {
    if (game.art === "mess") {
      continue; // "mess" и есть ветка по умолчанию — своей проверки не требует.
    }
    assert.ok(
      cardSource.includes(`game.art === "${game.art}"`),
      `GameCard не рисует обложку "${game.art}" — карточка уйдёт в общую MAKE A MESS`,
    );
  }
});

test("each card art has its own styles", () => {
  const classes = [...cardSource.matchAll(/game-card-art game-card-art-([a-z-]+)/g)].map(
    (match) => match[1],
  );
  assert.ok(classes.length >= games.length - 1);
  for (const name of classes) {
    assert.ok(
      styleSource.includes(`.game-card-art-${name} {`),
      `в globals.css нет стилей .game-card-art-${name}`,
    );
  }
});
