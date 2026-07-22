/**
 * Global wind strength (0..1), shared by every wind-driven effect: cloth sway
 * in the piece material, grass blades, and any future banners. `WindController`
 * measures the frame rate and ramps this toward 0 when the game drops below a
 * playable rate, so a struggling machine stops paying for wind animation.
 */
export const windState = { strength: 1 };
