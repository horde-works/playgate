import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const route = pathname === "/"
    ? "index"
    : pathname.replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9/-]+$/.test(route)) {
    throw new Error(`Unsafe production route: ${pathname}`);
  }

  const artifact = new URL(
    `../.next/server/app/${route}.html`,
    import.meta.url,
  );
  const metadataArtifact = new URL(
    `../.next/server/app/${route}.meta`,
    import.meta.url,
  );
  try {
    const [html, metadata] = await Promise.all([
      readFile(artifact, "utf8"),
      readFile(metadataArtifact, "utf8").then(JSON.parse),
    ]);
    return { html, metadata };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Missing Next.js production output for ${pathname}; run npm run build first`,
        { cause: error },
      );
    }
    throw error;
  }
}

test("production-renders the handmade games hero", async () => {
  const { html, metadata } = await render();
  assert.equal(metadata.headers["x-nextjs-prerender"], "1");
  // The site renders in its default language (English) on the server; the
  // language switcher swaps copy on the client.
  assert.match(html, /Games we/);
  assert.match(html, /make ourselves/);
  assert.match(html, /Make a Mess/);
  assert.match(html, /href="\/games"/);
  assert.match(html, /href="\/games\/make-a-mess"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("production-renders the catalog and game space", async () => {
  const [catalog, game, fortress] = await Promise.all([
    render("/games"),
    render("/games/make-a-mess"),
    render("/games/make-a-mess/basalt-stronghold"),
  ]);

  for (const rendered of [catalog, game, fortress]) {
    assert.equal(rendered.metadata.headers["x-nextjs-prerender"], "1");
  }

  assert.match(catalog.html, /Catalogue/);
  assert.match(catalog.html, /Make a Mess: Basalt Stronghold/);
  assert.match(catalog.html, /href="\/games\/make-a-mess\/basalt-stronghold"/);
  assert.match(catalog.html, /Next slot/);
  assert.match(game.html, /Make a Mess \/ 004/);
  assert.match(fortress.html, /Make a Mess \/ Basalt Stronghold/);

  // Before the player enters, the page is the launch card and nothing else.
  // The in-world interface used to be rendered behind it — a live objective
  // panel counting nothing, a weapon chip for a weapon nobody is holding and a
  // control strip for controls that do not respond yet. It is gone now, and
  // the served HTML is what proves the frame owns that rule from the first
  // byte rather than hiding the panels with a stylesheet.
  for (const rendered of [game, fortress]) {
    assert.match(rendered.html, /class="gate-card"/);
    assert.match(rendered.html, /Everything can break/);
    assert.match(rendered.html, /class="world-shutter is-boot"/);
    assert.doesNotMatch(rendered.html, /class="game-objective"/);
    assert.doesNotMatch(rendered.html, /class="controls-hint"/);
    assert.doesNotMatch(rendered.html, /class="mode-chips"/);
  }
});
