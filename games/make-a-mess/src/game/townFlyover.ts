import type { CinematicFlyoverDefinition } from "./cinematicFlyoverPlan";

const stillRoot = "/games/make-a-mess/flyovers/town";

/**
 * The town is not presented as a collection of props. The camera follows the
 * order in which the place grew: private yards, imposed lines, apartment
 * blocks, the shared spaces between them, an ordinary repair, and finally the
 * unofficial routes that keep the whole neighbourhood connected.
 */
export const townFlyover: CinematicFlyoverDefinition = {
  id: "never-all-at-once",
  title: "Never All at Once",
  locationLabel: "THE OLD QUARTER",
  storyLabel: "A CITY STORY",
  backLabel: "BACK TO THE CITY",
  durationSeconds: 112,
  fileName: "town-never-all-at-once",
  keyframes: [
    // The first old house: a low, damp walk from the household path towards
    // the terrace. The camera stays east of the bicycle shed.
    { at: 0, position: [-5.7, 2.15, 7.1], lookAt: [0, 1.15, 2.7], fov: 55, timeOfDay: "day" },
    { at: 0.065, position: [-4.6, 2.35, 6.0], lookAt: [0, 1.35, 2.55], fov: 52, timeOfDay: "day" },
    { at: 0.095, position: [-2.5, 10.5, 1.2], lookAt: [-1.5, 1.8, 9.0], fov: 55, timeOfDay: "day" },

    // Over the blue gate and into the older plot. The east-side arc keeps the
    // satellite dish out of the lens while the gate, fence and utility lines
    // layer the frame in front of the house.
    { at: 0.125, position: [10.5, 10.5, 2.8], lookAt: [-2.0, 1.3, 9.0], fov: 56, timeOfDay: "day" },
    { at: 0.19, position: [11.5, 9.0, 3.8], lookAt: [-4.0, 1.4, 11.0], fov: 53, timeOfDay: "day" },

    // The private houses cease to be an isolated vignette: the rise reveals
    // the kiosk, panel block and courtyard sharing the same strip of ground.
    { at: 0.255, position: [5.6, 7.0, 11.5], lookAt: [14.5, 3.0, 4.0], fov: 55, timeOfDay: "day" },
    { at: 0.315, position: [8.0, 12.6, 8.5], lookAt: [24.0, 4.8, 1.0], fov: 51, timeOfDay: "day" },

    // A close architectural run along the inhabited face of k1. The street
    // side remains outside the balcony envelopes by more than two metres.
    { at: 0.36, position: [8.5, 7.4, 2.6], lookAt: [21.0, 5.0, -0.8], fov: 50, timeOfDay: "day" },
    { at: 0.415, position: [31.8, 6.8, 2.9], lookAt: [22.0, 5.0, -0.8], fov: 52, timeOfDay: "day" },

    // Leave the block around its east end, then follow the main street west
    // to the garage frontage. This avoids cutting through k1 or k2.
    { at: 0.46, position: [39.0, 8.5, -12.0], lookAt: [20.0, 3.2, -15.5], fov: 55, timeOfDay: "day" },
    { at: 0.515, position: [7.0, 4.4, -14.7], lookAt: [-2.0, 1.2, -21.8], fov: 54, timeOfDay: "day" },
    { at: 0.555, position: [-14.2, 4.2, -17.8], lookAt: [-2.2, 1.0, -22.1], fov: 51, timeOfDay: "day" },

    // Rise above the garage row, descend into the south street and hold the
    // opened heating main as the narrative turning point.
    { at: 0.59, position: [-8.0, 13.5, -27.4], lookAt: [18.0, 1.0, -32.5], fov: 56, timeOfDay: "day" },
    { at: 0.635, position: [17.2, 5.4, -28.8], lookAt: [23.8, 0.55, -33.2], fov: 50, timeOfDay: "day" },
    { at: 0.675, position: [31.4, 4.8, -30.7], lookAt: [24.0, 0.55, -33.4], fov: 49, timeOfDay: "day" },

    // Around k5's east end and down the actual asphalt spur to the southern
    // homestead. Sunset arrives as the pillar and porch lamps become useful.
    { at: 0.71, position: [42.0, 8.2, -39.0], lookAt: [31.0, 2.0, -47.0], fov: 54, timeOfDay: "sunset" },
    { at: 0.75, position: [37.8, 4.3, -47.8], lookAt: [27.0, 1.7, -52.6], fov: 52, timeOfDay: "sunset" },
    { at: 0.79, position: [17.0, 3.35, -47.2], lookAt: [16.0, 1.15, -53.3], fov: 55, timeOfDay: "sunset" },

    // The cross street lifts us back through the lived-in eastern courtyards.
    // The old shop-house and k6 share the frame as the windows come on.
    { at: 0.81, position: [42.0, 8.5, -49.0], lookAt: [56.0, 3.5, -39.5], fov: 54, timeOfDay: "sunset" },
    { at: 0.835, position: [43.5, 11.5, -38.0], lookAt: [56.0, 3.5, -39.5], fov: 54, timeOfDay: "sunset" },
    { at: 0.86, position: [45.0, 9.5, -20.0], lookAt: [58.0, 5.0, -20.0], fov: 51, timeOfDay: "night" },
    { at: 0.885, position: [46.0, 8.2, 4.0], lookAt: [56.0, 3.3, 1.0], fov: 52, timeOfDay: "night" },

    // Final orbit: high enough to read the street grid and the round edge of
    // the map, slow enough to let the last title own the frame.
    { at: 0.91, position: [73.0, 26.0, 21.0], lookAt: [30.0, 3.2, -15.0], fov: 53, timeOfDay: "night" },
    { at: 0.945, position: [84.0, 39.0, -12.0], lookAt: [30.0, 3.0, -15.0], fov: 50, timeOfDay: "night" },
    { at: 0.975, position: [60.0, 50.0, -62.0], lookAt: [30.0, 2.8, -15.0], fov: 48, timeOfDay: "night" },
    { at: 1, position: [12.0, 55.0, -73.0], lookAt: [30.0, 2.8, -15.0], fov: 48, timeOfDay: "night" },
  ],
  chapters: [
    {
      id: "before-the-street",
      from: 0.015,
      to: 0.105,
      kicker: "NEVER ALL AT ONCE",
      title: "The city did not begin with a street.",
      body: "It began with a door someone meant to come back through.",
      align: "left",
      captureAt: 0.065,
      stillImage: `${stillRoot}/text/01-before-the-street.png`,
      cleanStillImage: `${stillRoot}/clean/01-before-the-street.png`,
    },
    {
      id: "the-lines",
      from: 0.115,
      to: 0.215,
      title: "Then came the lines.",
      body: "Fences. Wires. Roads. Names for where life was already happening.",
      align: "right",
      captureAt: 0.18,
      stillImage: `${stillRoot}/text/02-the-lines.png`,
      cleanStillImage: `${stillRoot}/clean/02-the-lines.png`,
    },
    {
      id: "around-the-old-city",
      from: 0.225,
      to: 0.335,
      title: "The new city rose around the old one.",
      body: "Neither learned how to disappear.",
      align: "left",
      captureAt: 0.3,
      stillImage: `${stillRoot}/text/03-around-the-old-city.png`,
      cleanStillImage: `${stillRoot}/clean/03-around-the-old-city.png`,
    },
    {
      id: "one-winter-at-a-time",
      from: 0.345,
      to: 0.445,
      title: "Everyone finished their own small part.",
      body: "A window. A balcony. One winter at a time.",
      align: "right",
      captureAt: 0.405,
      stillImage: `${stillRoot}/text/04-one-winter-at-a-time.png`,
      cleanStillImage: `${stillRoot}/clean/04-one-winter-at-a-time.png`,
    },
    {
      id: "the-neighbourhood",
      from: 0.455,
      to: 0.565,
      title: "What the plan left between buildings…",
      body: "…became the neighbourhood.",
      align: "left",
      captureAt: 0.525,
      stillImage: `${stillRoot}/text/05-the-neighbourhood.png`,
      cleanStillImage: `${stillRoot}/clean/05-the-neighbourhood.png`,
    },
    {
      id: "ordinary-failure",
      from: 0.575,
      to: 0.685,
      title: "The city broke in ordinary ways.",
      body: "Someone opened the ground. Everyone found another path.",
      align: "right",
      captureAt: 0.65,
      stillImage: `${stillRoot}/text/06-ordinary-failure.png`,
      cleanStillImage: `${stillRoot}/clean/06-ordinary-failure.png`,
    },
    {
      id: "the-real-map",
      from: 0.695,
      to: 0.815,
      title: "Rain remembered every route.",
      body: "The official ones — and the ones people actually used.",
      align: "left",
      captureAt: 0.755,
      stillImage: `${stillRoot}/text/07-the-real-map.png`,
      cleanStillImage: `${stillRoot}/clean/07-the-real-map.png`,
    },
    {
      id: "shared-light",
      from: 0.82,
      to: 0.9,
      title: "By night, every era shared the same light.",
      body: "Nothing here was finished. Nothing here was gone.",
      align: "right",
      captureAt: 0.884,
      stillImage: `${stillRoot}/text/08-shared-light.png`,
      cleanStillImage: `${stillRoot}/clean/08-shared-light.png`,
    },
    {
      id: "never-all-at-once",
      from: 0.915,
      to: 0.995,
      kicker: "NO ONE EVER FINISHED THIS PLACE",
      title: "NEVER ALL AT ONCE",
      body: "The city simply kept becoming.",
      align: "center",
      textScale: "hero",
      captureAt: 0.96,
      stillImage: `${stillRoot}/text/09-never-all-at-once.png`,
      cleanStillImage: `${stillRoot}/clean/09-never-all-at-once.png`,
    },
  ],
};
