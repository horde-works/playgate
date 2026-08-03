import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labRoot = join(repositoryRoot, "games/make-a-mess/src/authoring/objectLab");
const threeModule = join(repositoryRoot, "node_modules/three/build/three.module.js");
const threeCore = join(repositoryRoot, "node_modules/three/build/three.core.js");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export async function captureObjectLab(model, relativeOutputRoot) {
  const outputRoot = join(repositoryRoot, relativeOutputRoot);
  const modelHash = createHash("sha256").update(JSON.stringify(model)).digest("hex").slice(0, 12);
  const modelPayload = JSON.stringify({ ...model, modelHash });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (process.env.PLAYGATE_CAPTURE_DEBUG === "1") process.stderr.write(`request ${url.pathname}\n`);
      if (url.pathname === "/model.json") {
        response.writeHead(200, { "content-type": mime[".json"], "cache-control": "no-store" });
        response.end(modelPayload);
        return;
      }
      const file = url.pathname === "/"
        ? join(labRoot, "object-lab.html")
        : url.pathname === "/object-lab.js"
          ? join(labRoot, "object-lab.js")
          : url.pathname === "/vendor/three.module.js"
            ? threeModule
            : url.pathname === "/vendor/three.core.js"
              ? threeCore
              : null;
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

  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Object Lab failed to acquire a local port");

  const chromeCandidates = [
    process.env.PLAYGATE_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  const chrome = chromeCandidates[0];
  if (!chrome) throw new Error("Chrome not found; set PLAYGATE_CHROME to its executable");

  await mkdir(outputRoot, { recursive: true });

  const capture = (viewId) => new Promise((resolveCapture, rejectCapture) => {
    const destination = join(outputRoot, `${viewId}.png`);
    const child = spawn(chrome, [
      "--headless=new",
      "--hide-scrollbars",
      "--disable-gpu-sandbox",
      "--disable-search-engine-choice-screen",
      "--enable-logging=stderr",
      "--no-first-run",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=1800",
      "--window-size=1280,1280",
      `--screenshot=${destination}`,
      `http://127.0.0.1:${address.port}/?view=${encodeURIComponent(viewId)}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectCapture);
    child.on("exit", (code) => {
      if (process.env.PLAYGATE_CAPTURE_DEBUG === "1" && stdout) process.stdout.write(stdout);
      if (process.env.PLAYGATE_CAPTURE_DEBUG === "1" && stderr) process.stderr.write(stderr);
      if (code === 0) resolveCapture(destination);
      else rejectCapture(new Error(`Chrome capture failed for ${viewId} (${code})\n${stderr}`));
    });
  });

  try {
    const requestedViewIds = process.env.PLAYGATE_CAPTURE_VIEWS?.split(",").filter(Boolean);
    const views = requestedViewIds?.length
      ? model.views.filter((view) => requestedViewIds.includes(view.id))
      : model.views;
    for (const view of views) {
      const destination = await capture(view.id);
      process.stdout.write(`captured ${destination}\n`);
    }
    await writeFile(
      join(outputRoot, "manifest.json"),
      `${JSON.stringify({
        modelId: model.id,
        revision: model.revision,
        modelHash,
        generatedAt: new Date().toISOString(),
        views: model.views.map(({ id, label, projection }) => ({ id, label, projection, file: `${id}.png` })),
      }, null, 2)}\n`,
    );
  } finally {
    await new Promise((resolveClose) => {
      server.close(resolveClose);
      server.closeAllConnections();
    });
  }
}
