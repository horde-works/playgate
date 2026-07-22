import type { Metadata } from "next";
import { GrandTerminalGame } from "../../../../games/make-a-mess/src/game/GrandTerminalGame";

export const metadata: Metadata = {
  title: "Make a Mess: Grand Terminal",
  description:
    "Полностью разрушаемый европейский вокзал-музей с платформами, стеклянным дебаркадером, паровозами и кассовым залом.",
};

export default function GrandTerminalPage() {
  return <GrandTerminalGame />;
}
