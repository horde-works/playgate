/**
 * Global wind strength (0..1), shared by every wind-driven effect: cloth sway
 * in the piece material, grass blades, and any future banners. `WindController`
 * measures the frame rate and ramps this toward 0 when the game drops below a
 * playable rate, so a struggling machine stops paying for wind animation.
 *
 * `direction` is the horizontal unit vector the wind BLOWS TOWARD. Gusts travel
 * along it as a wave, and anything that streams downwind — reed leaves, smoke,
 * banners — must agree with it, or the scene shows two different winds at once.
 * A Dutch polder sits under a prevailing south-westerly, hence the default.
 */
export const windState = {
  strength: 1,
  direction: [0.71, -0.71] as [x: number, z: number],
};
