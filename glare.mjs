import { skyRadiance, setAirHaze } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/atmosphereModel.ts";
import { skyHaze } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/skyWeatherModel.ts";
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lum=(c)=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
const dirAt=(e,a)=>{const er=e*Math.PI/180,ar=a*Math.PI/180;
  return [Math.cos(er)*Math.cos(ar),Math.sin(er),Math.cos(er)*Math.sin(ar)];};
const angleTo=(a,b)=>Math.acos(clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1))*180/Math.PI;
for (const theme of ["town","fortress"]) {
  setAirHaze(skyHaze(theme));
  console.log(`\n--- ${theme} (haze ${skyHaze(theme)}) ---`);
  console.log("sun   maxSky  horizonAtSun  zenith | over 1.6: reach  share | over 6: reach share | over 12: reach share");
  for (const sunDeg of [2,5,10,20,40,60]) {
    const sun = dirAt(sunDeg,0);
    let maxSky=0, dome=0;
    const stat = {1.6:[0,0], 6:[0,0], 12:[0,0]};
    for (let e=1;e<90;e+=2) for (let a=0;a<360;a+=6) {
      const d=dirAt(e,a), sa=Math.cos(e*Math.PI/180); dome+=sa;
      const L=lum(skyRadiance(d,sun)); maxSky=Math.max(maxSky,L);
      for (const t of [1.6,6,12]) if (L>t) { stat[t][0]=Math.max(stat[t][0],angleTo(d,sun)); stat[t][1]+=sa; }
    }
    const hz=lum(skyRadiance(dirAt(2,0),sun)), zn=lum(skyRadiance(dirAt(88,0),sun));
    console.log(`${String(sunDeg).padStart(3)}°  ${maxSky.toFixed(2).padStart(6)}  ${hz.toFixed(2).padStart(11)}  ${zn.toFixed(2).padStart(6)} |`
      + [1.6,6,12].map(t=>` ${stat[t][0].toFixed(0).padStart(4)}° ${(100*stat[t][1]/dome).toFixed(1).padStart(5)}%`).join(" |"));
  }
}
