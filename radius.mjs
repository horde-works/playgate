import { dc3AirportRoute, DC3_ROUTE_TURN_RADIUS, DC3_CIRCUIT_RADIUS } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/dc3AirportRoutes.ts";
import { AIRPORT_RUNWAY, AIRPORT_RUNWAY_TOP_Y } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/content/scenes/islandAirport/islandAirportPlan.ts";
import { DC3_AIRPLANE_PASSPORT as P } from "/Users/kirisyuk/cursor/playgate/games/make-a-mess/src/game/dc3Airplane.ts";
const r=dc3AirportRoute("survey",[AIRPORT_RUNWAY.westDesignatorX,AIRPORT_RUNWAY_TOP_Y,AIRPORT_RUNWAY.centreZ]);
const L=r.length;
console.log("объявленный радиус разворотов трассы:", DC3_ROUTE_TURN_RADIUS.toFixed(0), " круг:", DC3_CIRCUIT_RADIUS.toFixed(0));
let worst=Infinity, at=0, sweep=0;
for(let d=L*0.70; d<=L*0.90; d+=15){
  const a=r.point((d-15)/L), b=r.point(d/L), c=r.point((d+15)/L);
  const d1=[b[0]-a[0],b[2]-a[2]], d2=[c[0]-b[0],c[2]-b[2]];
  const arc=Math.hypot(...d1)+Math.hypot(...d2);
  const t=Math.atan2(d1[1]*d2[0]-d1[0]*d2[1], d1[0]*d2[0]+d1[1]*d2[1]);
  if(Math.abs(t)>1e-6){ const R=arc/Math.abs(t); sweep+=Math.abs(t); if(R<worst){worst=R;at=d/L;} }
}
const V=r.requirement("speedLimit",0.8);
console.log(`фактический минимальный радиус на заходном развороте: ${worst.toFixed(0)} м на ${(at*100).toFixed(1)}%`);
console.log(`суммарный поворот: ${(sweep*180/Math.PI).toFixed(0)}°`);
console.log(`потребный крен при ${V.toFixed(0)} м/с: ${(Math.atan(V*V/(9.81*worst))*180/Math.PI).toFixed(1)}° при пределе ${(P.maximumBank*180/Math.PI).toFixed(0)}°`);
