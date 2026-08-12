// ПРЕДЛАГАЕТ ЛИ МИР СЕСТЬ ЗА УПРАВЛЕНИЕ, ЧИСЛАМИ.
//
// Зачем: место пилота объявлено, зарегистрировано и покрыто ГЕОМЕТРИЧЕСКИМ
// тестом — а предложит ли мир за него сесть, не проверял никто. Именно там и
// сидел дефект: коптер Нимба обещал в паспорте ручной полёт (`manual` и на
// вылет, и на поездку), кабина у него та же, что у городского, — а общий
// покадровый контур узнавал кресло пилота по ИМЕНИ кресла городской машины,
// и ни одна из шести проверок на Нимбе не срабатывала.
//
// Проба телепортирует человека к точке кресла и читает `__mamEntryState()`.
// Успех — ТОТ САМЫЙ пост этой машины (не любой с нужным действием) плюс, для
// винтокрылой, рейс с человеком за штурвалом именно на ней.
//
//   npm run dev                       # в другом окне, из корня
//   node scripts/probe-pilot-seat.mjs [--scene nimbus] [--port 3000]
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TERMS_VERSION } from "../app/legal/consent.ts";
import {
  NIMBUS_HEXACOPTER_PILOT_SEAT,
  SKY_TRAIN_DRIVER_SEAT,
  TOWN_HEXACOPTER_PILOT_SEAT,
} from "../games/make-a-mess/src/game/passengerSeats.ts";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

/**
 * СЦЕНА БЕРЁТСЯ ОТ МАШИНЫ, А НЕ ОТ ИМЕНИ КРЕСЛА.
 *
 * `town:hexacopter:pilot-seat` живёт НЕ в городе: вертипад HX-6 целиком
 * переехал на полигон Tonkawa (вердикт 07.08.2026, `townScene.ts`), и в
 * городской сцене этой машины нет вовсе. Первая редакция пробы честно
 * телепортировалась в город по имени кресла и получила пустой пост — то есть
 * «сломано» там, где машины просто нет.
 */
const SCENES = {
  nimbus: {
    path: "/games/make-a-mess/nimbus",
    seat: NIMBUS_HEXACOPTER_PILOT_SEAT,
    vehicleId: "nimbus-hexacopter",
    expectPost: "nimbus:hexacopter:ride",
  },
  hx6: {
    path: "/games/make-a-mess/combat-hexacopter-range",
    seat: TOWN_HEXACOPTER_PILOT_SEAT,
    vehicleId: "town-hexacopter",
    expectPost: "town:hexacopter:ride",
  },
  /**
   * Состав неба: место машиниста, а не пилота. Управления винтами оно не даёт
   * и «manual» не предлагает — проба обязана останавливаться на предложении
   * сесть, а не требовать штурвала от того, у кого его нет.
   *
   * И место это ДОСТИЖИМО ТОЛЬКО В РЕЙСЕ: `passengerSeatContextAction` требует
   * `carrierActive`, то есть живого рейса. У стоящего состава кресло машиниста
   * не предлагают вовсе, поэтому проба сначала отправляет его сама. Первая
   * редакция этого не делала и зеленела на посте ПОЕЗДКИ, приняв его за место
   * машиниста, — то есть врал сам детектор.
   */
  terminal: {
    path: "/games/make-a-mess/grand-terminal",
    seat: SKY_TRAIN_DRIVER_SEAT,
    vehicleId: "sky-train",
    departFirst: "tour",
  },
};

const SCENE = argOf("--scene", "nimbus");
const PORT = Number(argOf("--port", "3000"));
const CDP_PORT = Number(argOf("--cdp", "9393"));
const OUT = argOf("--out", "playgate-frames/pilot-seat-probe");
const BASE = `http://127.0.0.1:${PORT}`;

const target = SCENES[SCENE];
if (!target) {
  throw new Error(`unknown scene ${SCENE}; expected one of ${Object.keys(SCENES)}`);
}

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
    `playgate-seat-probe-${process.pid}`,
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
  try {
    const page = await waitFor(
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

    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("handmade-games:terms-acceptance", ${JSON.stringify(
        JSON.stringify({ version: TERMS_VERSION }),
      )}); } catch (error) {}`,
    });

    console.log(`warming ${target.path}…`);
    await fetch(`${BASE}${target.path}`).catch(() => {});
    await cdp.send("Page.navigate", { url: `${BASE}${target.path}` });
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
    await waitFor(
      "__mamTeleport",
      () => cdp.eval(`typeof window.__mamTeleport === "function"`),
      { timeout: 300000, every: 1000 },
    );
    // Мир доставляет игрока в свой playerSpawn уже после клика по входу;
    // телепорт, отданный раньше этого, молча затирается.
    await sleep(6000);

    // РЕЖИМ ПОЛЁТА ВСЕМ. `__mamTeleport` не отключает гравитацию, и человек,
    // поставленный на кресло, начинает падать: пост то ловится, то нет, а
    // читается это как «предложения нет».
    //
    // Проба этим НЕ ТЕРЯЕТ проверки достижимости, потому что никогда её и не
    // вела: телепорт — не ходьба, и «можно ли дойти до кресла» здесь не
    // проверялось ни в одной редакции. Предыдущая правка сняла нажатие ради
    // такой проверки и получила только дребезг. Достижимость — вопрос к
    // разметке мира, и мерить её надо своим инструментом.
    for (const type of ["keyDown", "keyUp"]) {
      await cdp.send("Input.dispatchKeyEvent", {
        type,
        key: "f",
        code: "KeyF",
        windowsVirtualKeyCode: 70,
      });
    }
    await sleep(800);

    // Место, живущее только в рейсе, требует сначала отправить машину.
    if (target.departFirst) {
      const sent = await cdp.eval(
        `window.__mamVehicleDepart(${JSON.stringify(target.vehicleId)}, ${JSON.stringify(target.departFirst)})`,
      );
      if (!sent) {
        throw new Error(
          `${target.vehicleId} не ушёл в рейс: место машиниста недостижимо по построению`,
        );
      }
      await waitFor(
        "carrier underway",
        async () => {
          const raw = await cdp.eval(
            `JSON.stringify((window.__mamVehicles?.() ?? []).find((v) => v.id === ${JSON.stringify(target.vehicleId)})?.flight ?? null)`,
          );
          return JSON.parse(raw ?? "null");
        },
        { timeout: 60000, every: 500 },
      );
    }

    const [x, y, z] = target.seat.interactionPoint;
    console.log(
      `teleporting to ${target.seat.id} @ ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`,
    );
    // Телепорт повторяется намеренно, по той же причине.
    for (const attempt of [0, 1]) {
      await cdp.eval(`window.__mamTeleport(${x}, ${y}, ${z})`);
      if (attempt === 0) await sleep(1500);
    }

    // Пост опознаётся не мгновенно: подход считается покадрово.
    let lastSeen = "null";
    const state = await waitFor(
      "entry state at the seat",
      async () => {
        const raw = await cdp.eval(
          `JSON.stringify(window.__mamEntryState?.() ?? null)`,
        );
        lastSeen = raw ?? "null";
        const parsed = JSON.parse(raw ?? "null");
        return parsed && parsed.actions?.length ? parsed : null;
      },
      { timeout: 30000, every: 500 },
    ).catch(async (error) => {
      // Молчание поста — не «сломано»: у него есть условия (машина на месте,
      // человек внутри её обвода). Диагностика печатает, что мир видел на
      // самом деле, иначе провал невозможно отличить от промаха координатой.
      const where = await cdp.eval(
        `JSON.stringify((window.__mamVehicles?.() ?? []).map((v) => ({ id: v.id, pose: v.pose?.position ?? null })))`,
      );
      console.error("последний пост:", lastSeen);
      console.error("машины мира:", where);
      throw error;
    });

    // ПРЕДЛОЖЕНИЕ — ЕЩЁ НЕ УПРАВЛЕНИЕ, и разница здесь принципиальная. Пост
    // поездки со списком действий существует независимо от кресла: он и был
    // тем самым обещанием, которого машина не выполняла. Управление доказывает
    // только ОДНО — что пост сменился на «встать», потому что встать
    // предлагают ровно тому, кто уже сидит (`passengerSeatContextAction`), а
    // сесть за управление можно только через `manualPilotLaunch`.
    // Место без штурвала (машинист состава) доказывает ровно предложение —
    // требовать от него ручного полёта значило бы придумать способность. Но
    // предложение обязано быть ЕГО: пост поездки живёт в той же точке, и
    // принять его за место машиниста — это позеленеть на чужом.
    if (!target.seat.rotorcraftControls) {
      if (state.kind !== "seat" || state.id !== target.seat.id) {
        throw new Error(
          `у точки кресла предложен ЧУЖОЙ пост: ${state.kind} ${state.id}, а ждали seat ${target.seat.id}`,
        );
      }
      const verdict = { seat: target.seat.id, offered: state, seated: null };
      await writeFile(
        join(OUT, `${SCENE}.json`),
        `${JSON.stringify(verdict, null, 2)}\n`,
      );
      console.log("\n=== ВЕРДИКТ ===");
      console.log(JSON.stringify(verdict, null, 2));
      console.log("\nМЕСТО ПРЕДЛОЖЕНО (штурвала у него нет и не должно быть).");
      return;
    }
    // ПОСТ ОБЯЗАН БЫТЬ ТЕМ САМЫМ. Постов с «manual» у винтокрылой два —
    // в кабине и у стойки площадки, — и оба ведут к передаче управления, но
    // доказывают разное. Если кресло уедет из обвода кабины хоть на метр,
    // человек упадёт на площадку, получит ЕЁ пост, управление ему всё равно
    // дадут (`manualPilotLaunch` про расстояние до кресла не спрашивает), и
    // проба напечатает успех про недостижимое кресло. Ровно этот класс дыры
    // ревью нашло на терминале; здесь он был тот же.
    if (state.id !== target.expectPost) {
      throw new Error(
        `у точки кресла предложен ЧУЖОЙ пост: ${state.id}, а ждали ${target.expectPost}`,
      );
    }
    if (!state.actions.includes("manual")) {
      throw new Error(
        `пост ${state.id} не предлагает manual: доказывать нечего`,
      );
    }
    await cdp.eval(`window.__mamEntryOpen("manual")`);
    // Ждать «встать» здесь нельзя: встать за штурвалом в воздухе запрещено, и
    // пост честно пропадает. Спрашивается ровно тот факт, который отличает
    // починенное от сломанного, — рейс с человеком за штурвалом.
    const seated = await waitFor(
      "manned flight on the carrier",
      async () => {
        const raw = await cdp.eval(
          `JSON.stringify((window.__mamVehicles?.() ?? []).map((v) => ({ id: v.id, kind: v.flight?.kind ?? null, pilot: v.flight?.pilot ?? false })))`,
        );
        const rows = JSON.parse(raw ?? "[]");
        // Управление обязано достаться ИМЕННО ЭТОЙ машине: «кто-то в мире
        // летит с человеком» — не то утверждение, ради которого проба писана.
        return rows.find((row) => row.pilot && row.id === target.vehicleId) ?? null;
      },
      { timeout: 20000, every: 500 },
    );

    const verdict = { seat: target.seat.id, offered: state, seated };
    await writeFile(
      join(OUT, `${SCENE}.json`),
      `${JSON.stringify(verdict, null, 2)}\n`,
    );
    console.log("\n=== ВЕРДИКТ ===");
    console.log(JSON.stringify(verdict, null, 2));
    console.log("\nУПРАВЛЕНИЕ ПЕРЕДАНО: рейс идёт с человеком за штурвалом.");
  } catch (error) {
    console.error("\nПРОВАЛ:", error.message);
    process.exitCode = 1;
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
