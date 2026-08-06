/**
 * Whether the polder's fall is currently being drawn.
 *
 * Frame state shared between the curtain and its mist, in the same shape as
 * {@link windState}: the two live in different components but are one effect,
 * and a fall whose water has been shed while its spray keeps emitting is worse
 * than either state on its own. `DutchPolderWater` owns the decision;
 * `DutchPolderSpray` reads it. Nothing else may write it.
 */
export const spillPowerState = {
  on: true,
};
