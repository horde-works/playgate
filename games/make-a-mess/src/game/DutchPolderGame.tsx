"use client";

import { DutchPolderWater } from "./DutchPolderWater";
import { dutchPolderScene } from "./dutchPolderScene";
import { MakeAMessGame } from "./MakeAMessGame";

export function DutchPolderGame() {
  return (
    <MakeAMessGame
      scene={dutchPolderScene}
      worldOverlay={<DutchPolderWater />}
    />
  );
}
