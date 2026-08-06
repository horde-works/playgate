import { skyRadiance, setAirHaze } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/atmosphereModel.ts";
import { skyHaze } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/skyWeatherModel.ts";
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lum=(c)=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
const dirAt=(e,a)=>{const er=e*Math.PI/180,ar=a*Math.PI/180;
  return [Math.cos(er)*Math.cos(ar),Math.sin(er),Math.cos(er)*Math.sin(ar)];};
const angleTo=(a,b)=>Math.acos(clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1))*180/Math.PI;
const GATES=[3,4,4.2,5,6];
console.log("worst case over all suns 2..60 and both airs:");
console.log("gate   max reach   max share");
const worst = Object.fromEntries(GATES.map(g=>[g,[0,0]]));
for (const theme of ["town","fortress"]) {
  setAirHaze(skyHaze(theme));
  for (const sunDeg of [2,5,10,20,40,60]) {
    const sun = dirAt(sunDeg,0);
    let dome=0; const st=Object.fromEntries(GATES.map(g=>[g,[0,0]]));
    for (let e=1;e<90;e+=2) for (let a=0;a<360;a+=6) {
      const d=dirAt(e,a), sa=Math.cos(e*Math.PI/180); dome+=sa;
      const L=lum(skyRadiance(d,sun));
      for (const g of GATES) if (L>g) { st[g][0]=Math.max(st[g][0],angleTo(d,sun)); st[g][1]+=sa; }
    }
    for (const g of GATES) { worst[g][0]=Math.max(worst[g][0],st[g][0]); worst[g][1]=Math.max(worst[g][1],100*st[g][1]/dome); }
  }
}
for (const g of GATES) console.log(`${String(g).padStart(4)}   ${worst[g][0].toFixed(0).padStart(5)}°   ${worst[g][1].toFixed(2).padStart(6)}%`);
