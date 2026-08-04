import { propWeepingWillow } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/content/prefabs/coreFlora.ts";
import { structuralMaterialProfiles as prof } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/destructionScene.ts";
const pieces = propWeepingWillow({ seed: 81 });
const byId = new Map(pieces.map((p) => [p.id, p]));
const strand = byId.get("limb:0:strand:0");
const limb = byId.get("limb:0");
const boxes = (p) => (p.contactBoxes?.length ? p.contactBoxes : [{ position: p.position, size: p.size }]);
const lo = (b, a) => b.position[a] - b.size[a] / 2;
const hi = (b, a) => b.position[a] + b.size[a] / 2;
console.log("плеть:", strand.position.map((v)=>v.toFixed(2)).join(","), "size", strand.size.map((v)=>v.toFixed(2)).join(","), "reach", strand.sideAttachmentReach?.toFixed(2));
console.log("сук:  ", limb.position.map((v)=>v.toFixed(2)).join(","), "size", limb.size.map((v)=>v.toFixed(2)).join(","), "carries", limb.carriesAttachments, "mode", limb.attachmentSupportMode);
for (const pb of boxes(strand)) for (const sb of boxes(limb)) {
  const overlap = Math.min(hi(pb,1), hi(sb,1)) - Math.max(lo(pb,1), lo(sb,1));
  const need = Math.min(pb.size[1], sb.size[1]) * 0.18;
  const gx = Math.max(0, Math.abs(pb.position[0]-sb.position[0]) - (pb.size[0]+sb.size[0])/2);
  const gz = Math.max(0, Math.abs(pb.position[2]-sb.position[2]) - (pb.size[2]+sb.size[2])/2);
  console.log(`  бокс ${pb.size.map(v=>v.toFixed(2))} × ${sb.size.map(v=>v.toFixed(2))}: перекрытие ${overlap.toFixed(3)} (нужно ${need.toFixed(3)}), зазор ${Math.hypot(gx,gz).toFixed(3)}`);
}
