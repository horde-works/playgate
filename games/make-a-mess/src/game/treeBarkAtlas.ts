import {
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";

let sharedTreeBarkAtlas: Texture | undefined;

/** One atlas instance shared by intact trees and their detached fragments. */
export function treeBarkAtlas(): Texture {
  if (!sharedTreeBarkAtlas) {
    sharedTreeBarkAtlas = new TextureLoader().load(
      "/games/make-a-mess/textures/tree-bark-atlas-v1.png",
    );
    sharedTreeBarkAtlas.colorSpace = SRGBColorSpace;
    sharedTreeBarkAtlas.anisotropy = 4;
  }
  return sharedTreeBarkAtlas;
}
