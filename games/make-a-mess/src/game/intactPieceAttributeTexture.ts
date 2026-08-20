import { Color, DataTexture, FloatType, RGBAFormat } from "three";
import type { PieceBakeResult } from "./bakedLighting.ts";
import type { BreakablePieceDefinition } from "./destructionScene.ts";
import { materialAnchorWithWeathering } from "./materialAppearance.ts";
import {
  hasSilicateJoints,
  silicateJointBand,
  silicateJointTint,
} from "./silicateJoints.ts";

const jointTint = new Color();

/** Eight RGBA texels per instance: anchor, AO, sky/band, face masks, tint. */
export const PIECE_ATTR_PIXELS = 8;

export interface IntactPieceAttributeTexture {
  readonly texture: DataTexture;
  readonly array: Float32Array;
  writePiece(index: number, piece: BreakablePieceDefinition): void;
  writeBake(index: number, result: PieceBakeResult): void;
  flush(): void;
  dispose(): void;
}

function textureSizeFor(maxInstanceCount: number): number {
  let size = Math.sqrt(Math.max(1, maxInstanceCount) * PIECE_ATTR_PIXELS);
  size = Math.ceil(size / PIECE_ATTR_PIXELS) * PIECE_ATTR_PIXELS;
  return Math.max(size, PIECE_ATTR_PIXELS);
}

function pixelOffset(index: number, pixel: number): number {
  return (index * PIECE_ATTR_PIXELS + pixel) * 4;
}

export function createIntactPieceAttributeTexture(
  maxInstanceCount: number,
): IntactPieceAttributeTexture {
  const size = textureSizeFor(maxInstanceCount);
  const array = new Float32Array(size * size * 4);
  const texture = new DataTexture(array, size, size, RGBAFormat, FloatType);
  texture.needsUpdate = true;

  return {
    texture,
    array,
    writePiece(index, piece) {
      const anchor = materialAnchorWithWeathering(
        piece.position,
        [0, 0, 0],
        piece.weathering,
      );
      array.set(anchor, pixelOffset(index, 0));
      // Default unoccluded until the baker streams a result.
      array.fill(1, pixelOffset(index, 1), pixelOffset(index, 1) + 4);
      array.fill(1, pixelOffset(index, 2), pixelOffset(index, 2) + 4);
      const skyBand = pixelOffset(index, 3);
      array[skyBand] = 1;
      array[skyBand + 1] = 0;
      array[skyBand + 2] = 0;
      array[skyBand + 3] = 0;
      const facePos = pixelOffset(index, 4);
      const faceNeg = pixelOffset(index, 5);
      if (
        piece.shape === "groundTile" ||
        piece.shape === "sphere" ||
        piece.visualMesh
      ) {
        array.fill(0, facePos, facePos + 3);
        array.fill(0, faceNeg, faceNeg + 3);
      } else if (piece.shape === "cylinder") {
        array[facePos] = 0;
        array[facePos + 1] = 1;
        array[facePos + 2] = 0;
        array[faceNeg] = 0;
        array[faceNeg + 1] = 1;
        array[faceNeg + 2] = 0;
      } else {
        array.fill(1, facePos, facePos + 3);
        array.fill(1, faceNeg, faceNeg + 3);
      }
      array[facePos + 3] = 0;
      array[faceNeg + 3] = 0;
      const tint = pixelOffset(index, 6);
      array.fill(0, tint, tint + 4);
      if (piece.landscapeSurface) {
        array[skyBand + 1] =
          piece.landscapeSurface === "viking-ground"
            ? -1
            : piece.landscapeSurface === "city-ground"
              ? -2
              : -3;
      } else if (hasSilicateJoints(piece.id, piece.material)) {
        array[skyBand + 1] = silicateJointBand(piece.size);
        jointTint.set(silicateJointTint(piece.color));
        array[tint] = jointTint.r;
        array[tint + 1] = jointTint.g;
        array[tint + 2] = jointTint.b;
      }
    },
    writeBake(index, result) {
      const aoA = pixelOffset(index, 1);
      const aoB = pixelOffset(index, 2);
      for (let corner = 0; corner < 4; corner += 1) {
        array[aoA + corner] = result.cornerAo[corner];
        array[aoB + corner] = result.cornerAo[corner + 4];
      }
      array[pixelOffset(index, 3)] = result.skyExposure;
    },
    flush() {
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
