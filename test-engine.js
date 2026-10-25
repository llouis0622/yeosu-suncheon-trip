// Domain regressions for the actual three-day journey, independent of the UI.
const assert=require('node:assert/strict');
const E=require('./engine.js'),r=require('./data.json')[0];
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
for(let c=0;c<r.courses.length;c++){
 const p=E.createPlan(r,c),s=E.schedule(r,p);
 check(s.days.length===3,'exactly three days');
 check(s.days[0].blocks.find(b=>b.kind==='travel').from==='busan','Busan departure');
 const firstHotel=s.days[0].blocks.find(b=>b.kind==='hotel');
 check(firstHotel.start>=1200,'no Suncheon hotel detour before Yeosu tourism');
 check(s.days[0].blocks.some(b=>b.from==='ys_station'&&b.to==='sc_station'),'night transfer through correct train stations');
 check(s.days[2].blocks.some(b=>b.from==='sc_hub'&&b.to==='busan'),'return bus through correct terminals');
 check(s.returnMinute<=1080,'recommended plans arrive before 18:00 including delay');
 check(s.days[0].blocks.filter(b=>b.kind==='hotel').every(b=>b.poi===p.hotel)&&s.days[1].blocks.filter(b=>b.kind==='hotel').every(b=>b.poi===p.hotel),'same lodging both nights');
 check(!s.warnings.some(w=>/휴무와|마감.*보다|목표 출발/.test(w)),'sample does not violate known closures or transfers');
 for(const d of s.days)for(let i=1;i<d.blocks.length;i++)check(d.blocks[i].start>=d.blocks[i-1].end,'no overlapping blocks');
 const n=E.normalizePlan(r,p);check(JSON.stringify(n.items.map(d=>d.map(x=>x.poi)))===JSON.stringify(p.items.map(d=>d.map(x=>x.poi))),'saved route order preserved');
}
const p=E.createPlan(r,3),get=id=>r.points.find(x=>x.id===id);
check(E.isClosed(get('sc_garden'),2)&&E.isClosed(get('sc_wetland'),2),'last Monday closures');
check(!E.isClosed(get('sc_garden'),1)&&!E.isClosed(get('sc_wetland'),1),'Sunday open by regular calendar');
check(E.isClosed(get('sc_hwawol'),1)&&!E.isClosed(get('sc_hwawol'),2),'Sunday food closure');
p.items[2]=[{uid:'closed',poi:'sc_garden',duration:60,start:null}];check(E.schedule(r,p).warnings.some(x=>x.includes('휴무와')),'date collision warns');
p.items[2]=[];p.returnDeparture=990;check(E.schedule(r,p).warnings.some(x=>x.includes('18:00 목표')),'late return warns');
p.returnDeparture=870;p.items[0]=[{uid:'long',poi:'ys_aquaplanet',duration:720,start:null}];check(E.schedule(r,p).warnings.some(x=>x.includes('목표 출발')),'missed night departure warns');
p.items[0]=[];p.transferMode='bus';p.transferRide=54;p.transferDeparture=1245;
check(E.schedule(r,p).days[0].blocks.some(b=>b.from==='ys_hub'&&b.to==='sc_hub'),'bus mode changes station endpoints');
p.luggage=true;const bag=E.schedule(r,p);check(bag.days[0].blocks.some(b=>b.title==='여수터미널 맡긴 짐 찾기'),'luggage retrieval is scheduled');
const item=id=>({uid:id,poi:id,duration:90,start:null});p.items[1]=[item('sc_garden'),item('sc_wetland')];p.items[0]=[];p.items[2]=[];
check(E.schedule(r,p).costParts.tickets===20000,'garden/wetland admission not counted twice for two people');
const a=get('ys_aquaplanet'),b=get('ys_goso');
for(const mode of ['walk','transit','taxi','mixed'])check(Number.isFinite(E.travel(r,a,b,mode).minutes),'all travel modes estimated');
check(E.travel(r,a,b,'transit',37).minutes===37,'manual transfer retained');
const bad=E.normalizePlan(r,{...p,hotel:'not-a-hotel',returnRide:-20,mode:'unknown',items:[[item('<script>')],[],[]]});
check(bad.hotel!=='not-a-hotel'&&bad.returnRide>=60&&bad.items[0].length===0,'import validates types and known places');
check(new Set(r.points.map(p=>p.id)).size===r.points.length,'unique place identifiers');
for(const q of r.points){check(q.coord.length===2&&q.coord.every(Number.isFinite),'coordinates present');if(q.type!=='transit')check(q.sources?.length>0&&q.desc&&q.costNote&&q.hours.note,'all 84 recommendations have supporting detail');}
console.log(checks+' itinerary/data assertions passed. Timetables and availability are reference information.');
