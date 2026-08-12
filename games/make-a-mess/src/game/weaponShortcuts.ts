export type DirectWeaponShortcut =
  | "none"
  | "hammer"
  | "launcher"
  | "mg"
  | "charge"
  | "construction";

/** Digit 4 is deliberately absent: it cycles the two launcher payloads. */
export function directWeaponShortcut(
  digit: number | null,
): DirectWeaponShortcut | null {
  switch (digit) {
    case 0:
      return "none";
    case 1:
      return "hammer";
    case 2:
      return "launcher";
    case 3:
      return "mg";
    case 5:
      return "charge";
    case 6:
      return "construction";
    default:
      return null;
  }
}
