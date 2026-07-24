"use client";

import { MakeAMessGame } from "./MakeAMessGame";
import { townFlyover } from "./townFlyover";
import { townScene } from "./townScene";

export function TownGame() {
  return <MakeAMessGame scene={townScene} flyover={townFlyover} />;
}
