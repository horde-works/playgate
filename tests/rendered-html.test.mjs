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
  assert.match(html, /Игры, которые/);
  assert.match(html, /Make a Mess/);
  assert.match(html, /href="\/games"/);
  assert.match(html, /href="\/games\/make-a-mess"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the catalog and game space", async () => {
  const [catalogResponse, gameResponse] = await Promise.all([
    render("/games"),
    render("/games/make-a-mess"),
  ]);

  assert.equal(catalogResponse.status, 200);
  assert.equal(gameResponse.status, 200);

  const [catalogHtml, gameHtml] = await Promise.all([
    catalogResponse.text(),
    gameResponse.text(),
  ]);

  assert.match(catalogHtml, /Каталог/);
  assert.match(catalogHtml, /Следующий слот/);
  assert.match(gameHtml, /Make a Mess \/ 004/);
  assert.match(gameHtml, /Дом — объект/);
  assert.match(gameHtml, /Всё можно сломать/);
  assert.match(gameHtml, /панельная\s+четырёхэтажка/);
  assert.match(gameHtml, /Взять молоток/);
});
