const assert=require('node:assert/strict'),E=require('./engine.js'),r=require('./data.json')[0];
let checks=0;const ok=(v,m)=>{assert(v,m);checks++};
const events=(p,d)=>E.schedule(r,p).days[d].blocks;
const event=(p,d,key)=>events(p,d).find(b=>b.edit?.key===key);
for(let c=0;c<4;c++){
 const p=E.createPlan(r,c),s=E.schedule(r,p);
 for(const day of s.days){
  for(const b of day.blocks.filter(b=>b.kind==='visit'))ok(b.start%10===0&&b.end%10===0,'recommended visit edges use ten-minute grid');
  for(const b of day.blocks.filter(b=>b.edit)){
   const original=JSON.stringify(p),part=(b.edit.parts||['move'])[0],target=(part==='end'?b.end:b.start)+23;
   const v=E.retime(r,p,day.day,b.edit.key,part,target);
   ok(JSON.stringify(p)===original,'preview never mutates saved plan');
   ok(v&&v.block.end>v.block.start,'preview retains a positive block');
   for(const d of v.schedule.days)ok(d.blocks.every((x,i)=>!i||x.start>=d.blocks[i-1].end),'editing keeps travel and visits chronological');
  }
 }
}
let p=E.createPlan(r,0),first=events(p,0).find(b=>b.kind==='visit'),key=first.edit.key;
let v=E.retime(r,p,0,key,'move',first.start+26);
ok(v.block.start===first.start+30,'drag snaps to nearest ten minutes');
ok(v.block.end-v.block.start===first.end-first.start,'move preserves dwell length');
v=E.retime(r,p,0,key,'end',first.end+22);
ok(v.block.start===first.start&&v.block.end===first.end+20,'right handle only extends end');
v=E.retime(r,p,0,key,'start',first.start+23);
ok(v.block.start===first.start+20&&v.block.end===first.end,'left handle preserves end');
v=E.retime(r,p,0,key,'start',0);
ok(v.block.start===first.start&&v.block.end===first.end,'cannot resize into inbound travel');
v=E.retime(r,p,0,key,'end',first.start-100);
ok(v.block.end-v.block.start===10,'minimum stay is one ten-minute cell');
const later=events(p,0).filter(b=>b.kind==='visit')[2];
v=E.retime(r,p,0,key,'move',later.start+10);
ok(v.plan.items[0].findIndex(x=>x.uid===first.uid)>1,'drag across visits changes visit order');
const beforeMoved=v.plan.items[0][v.position-2];
ok(v.schedule.edges.some(e=>e.from===beforeMoved.poi&&e.to==='ys_aquaplanet'),'map connections follow new order');
const leg=events(p,0).find(b=>b.edit?.type==='leg');
v=E.retime(r,p,0,leg.edit.key,'end',leg.end+20);
const restored=E.normalizePlan(r,v.plan),restoredLeg=event(restored,0,leg.edit.key);
ok(restoredLeg&&restoredLeg.end===v.block.end&&restoredLeg.start===v.block.start,'manual transport survives save/import UID normalization');
ok(v.block.end-v.block.start>=10,'manual travel uses nonzero duration');
const rail=events(p,0).find(b=>b.edit?.key==='service:transfer');
v=E.retime(r,p,0,rail.edit.key,'move',rail.start+30);
ok(v.plan.transferDeparture===rail.start+30&&v.block.start%10===0&&v.block.end%10===0,'intercity departure and duration can be moved on grid');
const morning=events(p,1).find(b=>b.edit?.type==='morning');
v=E.retime(r,p,1,morning.edit.key,'end',600);
ok(v.plan.starts[1]===600&&v.block.end===600,'morning edge controls next day departure');
const night=events(p,0).find(b=>b.edit?.type==='night');
v=E.retime(r,p,0,night.edit.key,'start',1320);
ok(v.plan.hotelStarts[0]===1320&&v.block.start===1320,'night edge controls arrival/rest time');
ok(E.retime(r,p,0,key,'move',NaN)===null,'invalid gesture input rejected');
// Stable fixture: no venue waits, ten-minute transfers, and explicitly placed visits.
const flowRegion={...r,points:r.points.map(q=>({...q,hours:{}}))};
const flow=E.createPlan(flowRegion,0);
flow.items[1]=['sc_garden','sc_wetland','sc_brewworks','sc_nanulteo','sc_hwawol'].map((poi,i)=>({uid:'flow-'+i,poi,duration:40,start:550+i*50,travel:10,mode:'taxi'}));
const flowEvents=p=>E.schedule(flowRegion,p).days[1].blocks.filter(b=>b.kind==='visit');
const originalFlow=JSON.stringify(flow),initial=flowEvents(flow),flowKey=initial[1].edit.key;
let ripple=E.retime(flowRegion,flow,1,flowKey,'end',initial[1].end+30);
ok(flowEvents(ripple.plan)[2].start===initial[2].start+30,'extending pushes following visits');
ripple=E.retime(flowRegion,flow,1,flowKey,'end',initial[1].end-20);
ok(flowEvents(ripple.plan)[2].start===initial[2].start-20,'shortening pulls following manually placed visits forward');
ok(ripple.plan.items[1][0].start===flow.items[1][0].start,'unaffected prefix keeps its chosen start');
ok(ripple.plan.items[1][2].start===null,'following starts become automatic for ripple');
ripple=E.retime(flowRegion,flow,1,flowKey,'move',initial[3].start);
ok(ripple.plan.items[1].map(x=>x.uid).join()===['flow-0','flow-2','flow-3','flow-1','flow-4'].join(),'center crossing inserts after the crossed visit');
ok(flowEvents(ripple.plan)[1].start===initial[1].start,'vacated slot is filled by the next visit');
ok(ripple.shifted===2&&ripple.position===4,'preview describes affected neighbors and insertion position');
const earlier=E.retime(flowRegion,flow,1,initial[3].edit.key,'move',initial[1].start-10);
ok(earlier.plan.items[1].map(x=>x.uid).join()===['flow-0','flow-3','flow-1','flow-2','flow-4'].join(),'moving earlier pushes the intervening visits back');
ok(earlier.block.start>=initial[0].end+10,'insertion preserves inbound travel space');
for(const value of [ripple,earlier]){
 ok(JSON.stringify(value.plan.items[0])===JSON.stringify(flow.items[0])&&JSON.stringify(value.plan.items[2])===JSON.stringify(flow.items[2]),'reflow affects only the edited day');
 ok(value.plan.transferDeparture===flow.transferDeparture&&value.plan.returnDeparture===flow.returnDeparture,'service targets remain unchanged when moving a visit');
 ok(flowEvents(value.plan).every(b=>b.start%10===0&&b.end%10===0),'reflow lands on ten-minute cells');
 ok(value.schedule.days[1].blocks.every((b,i,a)=>!i||b.start>=a[i-1].end),'reflow has no final overlap, including transport');
 ok(JSON.stringify(flowEvents(E.normalizePlan(flowRegion,value.plan)))===JSON.stringify(flowEvents(value.plan)),'saved reflow exactly matches preview');
}
const withLeg=JSON.parse(originalFlow),legKey=E.schedule(flowRegion,withLeg).days[1].blocks.find(b=>b.uid==='travel-flow-2').edit.legKey;
withLeg.legTiming[legKey]={start:650,duration:20};
ripple=E.retime(flowRegion,withLeg,1,flowKey,'end',initial[1].end-20);
ok(ripple.plan.legTiming[legKey].duration===20&&ripple.plan.legTiming[legKey].start==null,'reflow preserves manual travel duration and releases its soft start');
ok(JSON.stringify(flow)===originalFlow,'repeated previews leave the original untouched');
const unchanged=E.retime(flowRegion,flow,1,flowKey,'move',initial[1].start);
ok(JSON.stringify(unchanged.plan)===originalFlow&&unchanged.shifted===0,'returning to the original cell preserves all manually placed times');
const repeated=E.retime(flowRegion,flow,1,flowKey,'move',initial[3].start);
ok(JSON.stringify(repeated)===JSON.stringify(E.retime(flowRegion,flow,1,flowKey,'move',initial[3].start)),'preview is deterministic when moving back and forth');
for(let target=0;target<=1440;target+=10){
 const value=E.retime(flowRegion,flow,1,flowKey,'move',target);
 ok(new Set(value.plan.items[1].map(x=>x.uid)).size===5,'repeated reorder never duplicates or loses a visit');
 ok(value.schedule.days[1].blocks.every((b,i,a)=>!i||b.start>=a[i-1].end),'all drag positions remain chronological');
}
console.log(checks+' timeline grid, resize, reorder, persistence and constraint assertions passed.');
