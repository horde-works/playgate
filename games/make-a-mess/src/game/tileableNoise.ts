/**
 * Seamless value noise for the procedural maps the polder builds at load time.
 * Kept apart from its users so the ripple field, the duckweed rafts and the
 * falling water share one hash: three copies of "the same" noise drift apart
 * the moment somebody tunes one of them.
 */

export function hashCell(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

/**
 * The same noise with its own period on each axis.
 *
 * Water in the air is not made of round blobs. A sheet coming off a lip tears
 * along its flow into ropes that are long down the fall and narrow across it,
 * and an isotropic map cannot draw that at any scale — it can only make the
 * grain finer, which is how a curtain ends up reading as television snow. The
 * anisotropy has to be in the stored field, because the shader's own
 * coordinates (metres across, seconds of departure) are the frame the strands
 * are long in.
 */
export function tileableNoise2(
  u: number,
  v: number,
  periodU: number,
  periodV: number,
  seed: number,
): number {
  const x = u * periodU;
  const y = v * periodV;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fractionX = x - cellX;
  const fractionY = y - cellY;
  const weightX = fractionX * fractionX * (3 - 2 * fractionX);
  const weightY = fractionY * fractionY * (3 - 2 * fractionY);
  const wrapU = (value: number) => ((value % periodU) + periodU) % periodU;
  const wrapV = (value: number) => ((value % periodV) + periodV) % periodV;
  const x0 = wrapU(cellX);
  const x1 = wrapU(cellX + 1);
  const y0 = wrapV(cellY);
  const y1 = wrapV(cellY + 1);
  const bottom = hashCell(x0, y0, seed) * (1 - weightX)
    + hashCell(x1, y0, seed) * weightX;
  const top = hashCell(x0, y1, seed) * (1 - weightX)
    + hashCell(x1, y1, seed) * weightX;
  return bottom * (1 - weightY) + top * weightY;
}

export function tileableNoise(
  u: number,
  v: number,
  period: number,
  seed: number,
): number {
  return tileableNoise2(u, v, period, period, seed);
}
