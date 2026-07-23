"use client";

import { MakeAMessGame } from "./MakeAMessGame";
import { vikingVillageFlyover } from "./vikingVillageFlyover";
import { vikingVillageScene } from "./vikingVillageScene";

export function VikingVillageGame() {
  return (
    <MakeAMessGame
      scene={vikingVillageScene}
      flyover={vikingVillageFlyover}
    />
  );
}
