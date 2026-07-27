// Rapier interaction groups: membership << 16 | filter.
const GROUP_WORLD = 0x0001;
const GROUP_DEBRIS = 0x0002;
const GROUP_ACTOR = 0x0004;
const GROUP_ACTOR_DETAIL = 0x0008;
const GROUP_BOUNDARY = 0x0010;
const GROUP_VEHICLE_QUERY = 0x0020;

const interactionGroups = (membership: number, filter: number): number =>
  ((membership << 16) | filter) >>> 0;

// A freshly broken cluster settles without colliding with its siblings, but
// the player and debris remain contained by the invisible edge of the map.
export const DEBRIS_SETTLING = interactionGroups(
  GROUP_DEBRIS,
  GROUP_WORLD | GROUP_ACTOR | GROUP_BOUNDARY,
);

export const DEBRIS_NORMAL = interactionGroups(
  GROUP_DEBRIS,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR | GROUP_BOUNDARY,
);

export const ACTOR_NORMAL = interactionGroups(
  GROUP_ACTOR,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR_DETAIL | GROUP_BOUNDARY,
);

/** Passenger on an airborne carrier may cross the ground-player boundary. */
export const ACTOR_ABOARD = interactionGroups(
  GROUP_ACTOR,
  GROUP_WORLD | GROUP_DEBRIS | GROUP_ACTOR_DETAIL,
);

export const DEBRIS_ACTOR_DETAIL = interactionGroups(
  GROUP_ACTOR_DETAIL,
  GROUP_ACTOR,
);

/** Player/debris containment. Airborne vehicle probes deliberately ignore it. */
export const WORLD_BOUNDARY = interactionGroups(
  GROUP_BOUNDARY,
  GROUP_DEBRIS | GROUP_ACTOR,
);

/** Query mask for physical vehicle contacts with structures and debris. */
export const VEHICLE_CONTACT_QUERY = interactionGroups(
  GROUP_VEHICLE_QUERY,
  GROUP_WORLD | GROUP_DEBRIS,
);
