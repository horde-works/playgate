import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the handmade games hero", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  // The site renders in its default language (English) on the server; the
  // language switcher swaps copy on the client.
  assert.match(html, /Games we/);
  assert.match(html, /make ourselves/);
  assert.match(html, /Make a Mess/);
  assert.match(html, /href="\/games"/);
  assert.match(html, /href="\/games\/make-a-mess"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the catalog and game space", async () => {
  const [catalogResponse, gameResponse, fortressResponse] = await Promise.all([
    render("/games"),
    render("/games/make-a-mess"),
    render("/games/make-a-mess/minas-tirith"),
  ]);

  assert.equal(catalogResponse.status, 200);
  assert.equal(gameResponse.status, 200);
  assert.equal(fortressResponse.status, 200);

  const [catalogHtml, gameHtml, fortressHtml] = await Promise.all([
    catalogResponse.text(),
    gameResponse.text(),
    fortressResponse.text(),
  ]);

  assert.match(catalogHtml, /Catalogue/);
  assert.match(catalogHtml, /Make a Mess: Minas Tirith/);
  assert.match(catalogHtml, /href="\/games\/make-a-mess\/minas-tirith"/);
  assert.match(catalogHtml, /Next slot/);
  assert.match(gameHtml, /Make a Mess \/ 004/);
  assert.match(gameHtml, /The house is the toy/);
  assert.match(gameHtml, /Everything can break/);
  assert.match(gameHtml, /four-storey blocks/);
  assert.match(gameHtml, /Grab the hammer/);
  assert.match(fortressHtml, /Make a Mess \/ Minas Tirith/);
  assert.match(fortressHtml, /The fortress is the toy/);
  assert.match(fortressHtml, /Head for the gate/);
});
