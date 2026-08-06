import { transmittanceTable, multiScatterTable, transmittanceAt, AIR_LAW }
  from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/atmosphereModel.ts";
const t = transmittanceTable(), m = multiScatterTable();
const range = (a) => { let lo=Infinity, hi=-Infinity, nz=Infinity;
  for (const v of a) { if(v<lo)lo=v; if(v>hi)hi=v; if(v>0&&v<nz)nz=v; }
  return `min ${lo.toExponential(2)}  smallest>0 ${nz.toExponential(2)}  max ${hi.toExponential(2)}`; };
console.log("transmittance:", range(t));
console.log("multiScatter :", range(m));
console.log("\n--- how much brighter the beam is at cloud base than at the ground ---");
for (const deg of [10, 4, 2, 0, -1]) {
  const s = Math.sin(deg*Math.PI/180);
  const g = transmittanceAt(0, s), c = transmittanceAt(680, s), h = transmittanceAt(1830, s);
  console.log(`sun ${String(deg).padStart(3)}°  ground ${g.map(v=>v.toFixed(3)).join(",")}`
    + `  base 680m ${c.map(v=>v.toFixed(3)).join(",")}`
    + `  top 1830m ${h.map(v=>v.toFixed(3)).join(",")}`);
}
