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
ok(v.schedule.edges.some(e=>e.from==='ys_goso'&&e.to==='ys_aquaplanet'),'map connections follow new order');
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
console.log(checks+' timeline grid, resize, reorder, persistence and constraint assertions passed.');
