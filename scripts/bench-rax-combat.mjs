#!/usr/bin/env node

import { runDuel, summarise } from "../tests/air-combat-rig.mjs";

const valueAfter = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const seconds = Number(valueAfter("--seconds", "150"));
const requestedTarget = valueAfter("--target", "both");
const json = process.argv.includes("--json");
if (!Number.isFinite(seconds) || seconds <= 0) {
  throw new Error("--seconds должен быть положительным числом");
}
if (!["hx6", "vx8", "both"].includes(requestedTarget)) {
  throw new Error("--target: hx6, vx8 или both");
}

const scenarios = requestedTarget === "both"
  ? [
      { key: "hx6-circuit", target: "hx6", targetKind: "circuit" },
      { key: "hx6-evasive", target: "hx6", targetKind: "evasive" },
      { key: "vx8", target: "vx8", targetKind: "evasive" },
    ]
  : [{ key: requestedTarget, target: requestedTarget, targetKind: "evasive" }];

const started = performance.now();
const reports = scenarios.map((scenario) => ({
  ...scenario,
  report: runDuel({
    seconds,
    target: scenario.target,
    targetKind: scenario.targetKind,
  }),
}));
const wallSeconds = (performance.now() - started) / 1000;

if (json) {
  console.log(JSON.stringify({ seconds, wallSeconds, reports }, null, 2));
} else {
  for (const { key, report } of reports) {
    console.log(`\n[${key}]\n  ${summarise(report)}\n`);
  }
  console.log(`стенд: ${wallSeconds.toFixed(1)} с стеночного времени`);
}
