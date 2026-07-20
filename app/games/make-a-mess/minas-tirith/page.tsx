import type { Metadata } from "next";
import { MinasTirithGame } from "../../../../games/make-a-mess/src/game/MinasTirithGame";

export const metadata: Metadata = {
  title: "Make a Mess: Minas Tirith",
  description:
    "Полностью разрушаемая горная крепость со стеной, воротами и тёмной многоэтажной башней.",
};

export default function MinasTirithPage() {
  return <MinasTirithGame />;
}
