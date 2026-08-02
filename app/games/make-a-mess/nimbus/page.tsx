import type { Metadata } from "next";
import { NimbusGame } from "../../../../games/make-a-mess/src/game/NimbusGame";

export const metadata: Metadata = {
  title: "Make a Mess: Nimbus",
  description:
    "A technological world built into a vast natural basin, with a great machine rising below and a shield tower on the rim.",
};

export default function NimbusPage() {
  return <NimbusGame />;
}
