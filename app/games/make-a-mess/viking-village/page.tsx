import type { Metadata } from "next";
import { VikingVillageGame } from "../../../../games/make-a-mess/src/game/VikingVillageGame";

export const metadata: Metadata = {
  title: "Make a Mess: Viking Village",
  description:
    "Полностью разрушаемая обитаемая деревня викингов с частоколом, длинными домами, залом конунга, оружейными навесами и каменистым лесом.",
};

export default function VikingVillagePage() {
  return <VikingVillageGame />;
}
