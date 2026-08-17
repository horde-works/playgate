import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { tiltHexacopterObject } from "../games/make-a-mess/src/content/objects/vehicles/tiltHexacopterObject.ts";

const root = path.resolve("games/make-a-mess/docs/tilt-hexacopter/e02-systems");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const modelBuffer = Buffer.from(`${JSON.stringify(tiltHexacopterObject, null, 2)}\n`);
await fs.writeFile(path.join(root, "e02-model.json"), modelBuffer);

const drawingSpecs = [
  ["SYS-05", "Internal systems arrangement", "SYS-05-internal-arrangement.png"],
  ["ELEC-06", "Electrical power architecture", "ELEC-06-power-architecture.png"],
  ["THM-07", "Thermal management", "THM-07-thermal-management.png"],
  ["SRV-08", "Access and maintenance zones", "SRV-08-access-maintenance.png"],
];
const drawings = [];
for (const [number, title, file] of drawingSpecs) {
  const content = await fs.readFile(path.join(root, file));
  drawings.push({ number, title, file, pixels: [3000, 2100], sha256: sha(content) });
}
const overview = await fs.readFile(path.join(root, "E02-overview.png"));
const manifest = {
  schema: "tilt-hexacopter-engineering-package.v1",
  objectId: tiltHexacopterObject.id,
  geometryRevision: tiltHexacopterObject.revision,
  packageRevision: "E02",
  parentApproval: "../evidence/e01-approval.md",
  exteriorAuthority: "B11 frozen; no silhouette-owning component changed",
  status: "system-packaging-not-for-manufacture",
  units: "metres",
  canonicalModelArtifact: "e02-model.json",
  canonicalModelSha256: sha(modelBuffer),
  inventory: {
    totalParts: tiltHexacopterObject.parts.length,
    crewStations: 2,
    energyModules: 6,
    ringActuators: 6,
    highVoltageBuses: 2,
    coolantTrunks: 4,
    heatExchangers: 2,
    coolantPumps: 2
  },
  drawings,
  overview: { file: "E02-overview.png", pixels: [2400, 1680], sha256: sha(overview) },
  limitations: ["No component mass budget", "No voltage or chemistry selection", "No thermal load sizing", "No access-door or connector detail", "No manufacturing release"]
};
await fs.writeFile(path.join(root, "engineering-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ modelHash: manifest.canonicalModelSha256, parts: manifest.inventory.totalParts, drawings: drawings.length }, null, 2)}\n`);
