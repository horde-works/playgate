const m = await import("/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/basaltStrongholdScene.ts");
const s = m.basaltStrongholdScene;
// front face of the fortress near the shield band: max z of pieces per |x| bucket, y 1..12
const rows = [];
for (const bx of [0, 5, 10, 15, 20, 25, 30]) {
  let best = null;
  for (const p of s.breakablePieces) {
    const c = p.position ?? p.center; const sz = p.size ?? [0,0,0];
    if (!c) continue;
    if (Math.abs(Math.abs(c[0]) - bx) > 2.5) continue;
    if (c[1] < 1 || c[1] > 12) continue;
    const front = c[2] + sz[2] / 2;
    if (front > 12) continue; // ignore outbuildings far in front
    if (!best || front > best.front) best = { front, id: p.id, y: c[1] };
  }
  const shieldZ = 3.45 - bx * bx * 0.00125;
  rows.push({ x: bx, stoneFront: best ? +best.front.toFixed(2) : null, shieldZ: +shieldZ.toFixed(2), gap: best ? +(shieldZ - best.front).toFixed(2) : null, piece: best?.id });
}
console.table(rows);
