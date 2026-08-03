import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { createDutchPolderLandscapeLab } from "../games/make-a-mess/src/content/scenes/dutchPolder/dutchPolderLandscapeLab.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const labRoot = join(repositoryRoot, "games/make-a-mess/src/authoring/objectLab");
const files = new Map([
  ["/", join(labRoot, "object-lab.html")],
  ["/object-lab.js", join(labRoot, "object-lab.js")],
  ["/vendor/three.module.js", join(repositoryRoot, "node_modules/three/build/three.module.js")],
  ["/vendor/three.core.js", join(repositoryRoot, "node_modules/three/build/three.core.js")],
]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const port = Number(process.env.PLAYGATE_LANDSCAPE_LAB_PORT ?? 4174);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/model.json") {
      const profile = url.searchParams.get("profile") === "soft-faceted" ? "soft-faceted" : "smooth";
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(createDutchPolderLandscapeLab(profile)));
      return;
    }
    const file = files.get(url.pathname);
    if (!file) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`landscape lab http://127.0.0.1:${port}\n`);
});

