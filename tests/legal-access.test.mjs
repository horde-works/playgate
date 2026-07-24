import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  TERMS_VERSION,
  canAcceptTerms,
  hasAcceptedCurrentTerms,
  serializeTermsAcceptance,
} from "../app/legal/consent.ts";
import { games } from "../games/registry.ts";

const root = path.resolve(import.meta.dirname, "..");

function sourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(resolved);
    }
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [resolved] : [];
  });
}

test("Terms acceptance requires both opening the document and explicit confirmation", () => {
  assert.equal(canAcceptTerms(false, false), false);
  assert.equal(canAcceptTerms(true, false), false);
  assert.equal(canAcceptTerms(false, true), false);
  assert.equal(canAcceptTerms(true, true), true);
});

test("only the current Terms version counts as accepted", () => {
  assert.equal(hasAcceptedCurrentTerms(null), false);
  assert.equal(hasAcceptedCurrentTerms("not-json"), false);
  assert.equal(hasAcceptedCurrentTerms('{"version":"earlier"}'), false);
  assert.equal(hasAcceptedCurrentTerms(serializeTermsAcceptance()), true);
  assert.equal(JSON.parse(serializeTermsAcceptance()).version, TERMS_VERSION);
});

test("legal pages and footer expose the governing documents", () => {
  for (const route of [
    "terms-of-usage",
    "privacy",
    "third-party-notices",
    "license",
  ]) {
    assert.equal(
      statSync(path.join(root, "app", route, "page.tsx")).isFile(),
      true,
      route,
    );
  }

  const footer = readFileSync(
    path.join(root, "app/components/SiteFooter.tsx"),
    "utf8",
  );
  assert.match(footer, /Terms of Usage/);
  assert.match(footer, /Source code: MIT License/);
});

test("the application contains no code that writes cookies", () => {
  const files = [
    ...sourceFiles(path.join(root, "app")),
    ...sourceFiles(path.join(root, "games")),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /document\.cookie\s*=/, file);
    assert.doesNotMatch(source, /cookieStore\.set\s*\(/, file);
  }
});

test("the experimental Backyards map has no route or catalogue entry", () => {
  assert.equal(
    existsSync(path.join(root, "app/games/make-a-mess/rain-seam/page.tsx")),
    false,
  );
  assert.equal(
    games.some((game) => game.href === "/games/make-a-mess/rain-seam"),
    false,
  );
});
