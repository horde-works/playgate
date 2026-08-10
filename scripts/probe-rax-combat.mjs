// ПРОБА БОЕВОГО КОНТУРА RAX-8 В ЖИВОМ МИРЕ, ЧИСЛАМИ.
//
// Зачем: `VehicleFrameSystem` не покрыт тестами вовсе, а врезка боя живёт
// именно в нём. Стенды (`tests/air-combat-*`) исполняют пилота, прицел и позу
// на настоящих силах, но НЕ проверяют проводку: собрались ли треки, пришёл ли
// пост из паспорта, построился ли снимок себя. Ровно там жили обе поломки
// запуска боевой задачи 08.08.2026.
//
// Проба не снимает красоту. Она поднимает обе машины полигона их собственными
// автоматами и две минуты (`--seconds`, по умолчанию 120) читает
// `__mamAirCombat()`: режим, цель, счёт заходов. Успех — это ВЫХОД ИЗ
// `station` С НЕПУСТОЙ ЦЕЛЬЮ, потому что выйти оттуда нельзя, не собрав ни
// трека, ни поста, ни снимка себя.
//
//   npm run dev            # в другом окне, из корня
//   node scripts/probe-rax-combat.mjs [--port 3000] [--seconds 120]
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TERMS_VERSION } from "../app/legal/consent.ts";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const PORT = Number(argOf("--port", "3000"));
const CDP_PORT = Number(argOf("--cdp", "9391"));
const SECONDS = Number(argOf("--seconds", "120"));
const OUT = argOf("--out", "playgate-frames/rax-combat-probe");
const BASE = `http://127.0.0.1:${PORT}`;
const SCENE_PATH = "/games/make-a-mess/combat-hexacopter-range";
/** Свой борт и чужой: без второго бой не начнётся и проба ничего не скажет. */
const HUNTER = "combat-hexacopter";
const PREY = "duct-hexacopter";

function chromePath() {
  const explicit = process.env.PLAYGATE_CHROME;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`PLAYGATE_CHROME points at a missing file: ${explicit}`);
    }
    return explicit;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Chrome not found; set PLAYGATE_CHROME");
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Минимальный клиент CDP: в Node 22 есть глобальный WebSocket, пакет `ws` не нужен. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.next = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Сборка сцены замораживает главный поток на секунды, а в dev вместе с
      // первой компиляцией маршрута — на десятки.
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 300000);
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `eval failed: ${result.exceptionDetails.text} ${
          result.exceptionDetails.exception?.description ?? ""
        }`,
      );
    }
    return result.result.value;
  }
}

async function waitFor(label, probe, { timeout = 120000, every = 500 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(every);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const userDataDir = join(
    process.env.TEMP ?? "/tmp",
    `playgate-rax-probe-${process.pid}`,
  );
  const chrome = spawn(
    chromePath(),
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--window-size=1600,900",
      "--hide-scrollbars",
      "--mute-audio",
      "--use-gl=angle",
      "--enable-unsafe-swiftshader",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  const log = [];
  try {
    const target = await waitFor(
      "chrome devtools",
      async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
          const targets = await response.json();
          return targets.find((entry) => entry.type === "page") ?? null;
        } catch {
          return null;
        }
      },
      { timeout: 60000, every: 300 },
    );

    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("handmade-games:terms-acceptance", ${JSON.stringify(
        JSON.stringify({ version: TERMS_VERSION }),
      )}); } catch (error) {}`,
    });

    console.log("warming route…");
    await fetch(`${BASE}${SCENE_PATH}`).catch(() => {});
    await cdp.send("Page.navigate", { url: `${BASE}${SCENE_PATH}` });
    await waitFor("page body", () => cdp.eval("!!document.body"));
    await waitFor(
      "#enter-game enabled",
      () =>
        cdp.eval(
          `(() => { const b = document.querySelector("#enter-game"); return !!b && !b.disabled; })()`,
        ),
      { timeout: 600000, every: 1000 },
    );
    await cdp.eval(`document.querySelector("#enter-game").click()`);
    console.log("entered the world; waiting for the combat probe…");

    // Хук появляется вместе с рантаймом кадров, а не со страницей.
    await waitFor(
      "__mamAirCombat",
      () => cdp.eval(`typeof window.__mamAirCombat === "function"`),
      { timeout: 300000, every: 1000 },
    );
    await sleep(4000);

    // ОБЕ МАШИНЫ ПОДНИМАЮТСЯ СВОИМИ АВТОМАТАМИ. Чужой борт обязателен: без
    // цели автомат честно стоит на посту, и проба не отличит «работает» от
    // «не запустился».
    const departed = {
      hunter: await cdp.eval(
        `window.__mamVehicleDepart(${JSON.stringify(HUNTER)}, "sky-control")`,
      ),
      prey: await cdp.eval(
        `window.__mamVehicleDepart(${JSON.stringify(PREY)}, "circuit")`,
      ),
    };
    console.log("departures:", departed);
    if (!departed.hunter) {
      throw new Error(
        "RAX-8 не ушёл на боевую задачу: __mamVehicleDepart вернул false",
      );
    }
    // Не взлетевшая жертва даёт ровно тот же симптом, что мёртвая проводка, —
    // автомат честно стоит на посту. Без этой проверки проба обвинила бы не то.
    if (!departed.prey) {
      throw new Error(
        "чужой борт не поднялся: пробе не на кого смотреть, вердикт был бы ложным",
      );
    }

    const modes = new Set();
    const targets = new Set();
    let maxPasses = 0;
    let firstEngagementAt = null;
    const started = Date.now();
    let engagementShot = false;

    while ((Date.now() - started) / 1000 < SECONDS) {
      const sample = await cdp.eval(`JSON.stringify(window.__mamAirCombat())`);
      const rows = JSON.parse(sample ?? "[]");
      const hunter = rows.find((row) => row.id === HUNTER) ?? null;
      const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
      if (hunter) {
        modes.add(hunter.mode);
        if (hunter.targetId) targets.add(hunter.targetId);
        maxPasses = Math.max(maxPasses, hunter.passes);
        // ЦЕЛЬ ТРЕБУЕТСЯ ЯВНО. Сегодня автомат и так не выпускает с поста без
        // захвата, но это гарантия ВНУТРИ автомата, а следующий шаг серии —
        // уклонение, то есть ровно то, что может завести выход без цели.
        if (
          hunter.mode !== "station" &&
          hunter.targetId &&
          firstEngagementAt === null
        ) {
          firstEngagementAt = seconds;
          console.log(
            `t=${seconds}s ПЕРВЫЙ ВЫХОД С ПОСТА: ${hunter.mode} → ${hunter.targetId}`,
          );
        }
        log.push({ seconds, ...hunter });
      } else {
        log.push({ seconds, mode: null });
      }
      // Один кадр в момент первого зацепа: он нужен глазу, а не пробе.
      if (firstEngagementAt !== null && !engagementShot) {
        engagementShot = true;
        await cdp.eval(
          `document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()), true`,
        );
        const shot = await cdp.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        await writeFile(
          join(OUT, "engagement.png"),
          Buffer.from(shot.data, "base64"),
        );
      }
      await sleep(500);
    }

    const verdict = {
      modes: [...modes].sort(),
      targets: [...targets],
      maxPasses,
      firstEngagementAt,
      samples: log.length,
    };
    await writeFile(
      join(OUT, "probe.json"),
      `${JSON.stringify({ verdict, log }, null, 2)}\n`,
    );
    console.log("\n=== ВЕРДИКТ ===");
    console.log(JSON.stringify(verdict, null, 2));
    // Выйти из `station` нельзя, не собрав трек, не получив пост из паспорта и
    // не построив снимок себя. Поэтому это и есть проверка проводки.
    if (firstEngagementAt === null) {
      console.error(
        "\nПРОВАЛ: автомат не вышел с поста за отведённое время — либо пост не пришёл из паспорта, либо треки пусты.",
      );
      process.exitCode = 1;
    } else {
      console.log("\nПРОВОДКА ЖИВА: пост, треки и снимок себя собрались.");
    }
  } finally {
    if (cdp) {
      try {
        await cdp.send("Browser.close");
      } catch {}
    }
    chrome.kill();
    // Профиль браузера — мусор сессии, и убирать его обязан тот, кто создал.
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
