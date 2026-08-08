"use client";

import { MakeAMessGame } from "./MakeAMessGame";
import { islandAirportFlyover } from "./islandAirportFlyover";
import { islandAirportScene } from "./islandAirportScene";

export function IslandAirportGame() {
  return (
    <MakeAMessGame
      scene={islandAirportScene}
      flyover={islandAirportFlyover}
    />
  );
}
