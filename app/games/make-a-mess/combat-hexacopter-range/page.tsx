import type { Metadata } from "next";
import { CombatHexacopterRangeGame } from "../../../../games/make-a-mess/src/game/CombatHexacopterRangeGame";

export const metadata: Metadata = {
  title: "Make a Mess: RAX-8 Tonkawa Range",
  description: "A 100 metre steel-plated autonomous RAX-8 Tonkawa test range.",
};

export default function CombatHexacopterRangePage() {
  return <CombatHexacopterRangeGame />;
}
