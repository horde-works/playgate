import type { Metadata } from "next";
import { BasaltStrongholdGame } from "../../../../games/make-a-mess/src/game/BasaltStrongholdGame";

export const metadata: Metadata = {
  title: "Make a Mess: Basalt Stronghold",
  description:
    "Полностью разрушаемая горная крепость со стеной, воротами и тёмной многоэтажной башней.",
};

export default function BasaltStrongholdPage() {
  return <BasaltStrongholdGame />;
}
