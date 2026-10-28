/* One agreed itinerary. Only meal, café and lodging choices are persisted. */
(function (root) {
'use strict';
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const round10 = n => Math.ceil(n / 10) * 10;
const ORIGIN = {id:'busan', name:'부산 대연동 출발', type:'origin', city:'부산', coord:[129.091,35.137]};
const origin = r => r.points.find(p => p.id === 'busan') || ORIGIN;
const dates = ['2026-11-28','2026-11-29','2026-11-30'];
const date = d => ['11.28 토','11.29 일','11.30 월'][d];
function time(n) { const m = Math.round(n) % 1440; return (n >= 1440 ? '익일 ' : '') + String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); }
function km(a,b) { const rad=Math.PI/180, p=a.coord[1]*rad, q=b.coord[1]*rad; return 6371*2*Math.asin(Math.sqrt(Math.sin((q-p)/2)**2+Math.cos(p)*Math.cos(q)*Math.sin((b.coord[0]-a.coord[0])*rad/2)**2)); }
function isClosed(q, day) { const h=q?.hours||{}; return (h.closedDays||[]).includes([6,0,1][day]) || (h.closedDates||[]).includes(dates[day]); }
function travel(r,a,b,mode='car') {
 if (!a || !b || a.id===b.id) return {minutes:0,mode,note:'같은 장소'};
 const key=a.id+'>'+b.id, preset=r.driveEstimates?.[key];
 if (preset) return {minutes:preset.minutes, mode:preset.mode||mode, estimate:true, note:preset.note||'주차·승하차 여유를 포함한 계획용 추정입니다. 실시간 경로가 아닙니다.'};
 const intercity=a.city==='부산'||b.city==='부산';
 if (intercity) return {minutes: a.city===b.city?30:190,mode:'car',estimate:true,note:'도시 간 자차 이동 계획치입니다. 휴게소·정체에 따라 달라집니다.'};
 if (a.city!==b.city) return {minutes:60,mode:'car',estimate:true,note:'순천↔여수 자차 이동 약 50~70분을 반영한 계획치입니다.'};
 if (a.complex && a.complex===b.complex) return {minutes:10,mode:'walk',estimate:true,note:'같은 엑스포 권역 안에서 도보 이동 10분을 잡았습니다. 차량을 두고 관람하는 계획입니다.'};
 const distance=km(a,b), routeMode=mode==='walk'?'walk':'road', rec=r.routes?.[key+':'+routeMode];
 if(rec?.status==='ok' && (!rec.fromCoord || km(a,{coord:rec.fromCoord})<.05) && (!rec.toCoord || km(b,{coord:rec.toCoord})<.05)) {
  const access=(a.roadAccessMinutes||0)+(b.roadAccessMinutes||0), raw=Math.ceil(rec.seconds/60);
  return {minutes:round10(raw+(mode==='walk'?0:10)+access),mode,verified:true,checkedAt:rec.checkedAt,sourceUrl:rec.sourceUrl,note:'기존 경로 조회 '+raw+'분에 주차·승하차·출입구 이동 여유를 더한 계획치입니다. 실시간 교통이 아닙니다.'};
 }
 if(distance<.65 && !a.hill && !b.hill) return {minutes:round10(Math.max(10,distance*1.35/4*60)),mode:'walk',estimate:true,note:'가까운 두 장소를 도보로 연결한 거리 기반 추정입니다.'};
 return {minutes:round10(Math.max(10,distance*1.6/(distance>15?45:30)*60+10+(a.roadAccessMinutes||0)+(b.roadAccessMinutes||0))),mode:'car',estimate:true,note:'좌표 거리·도로 우회·주차 여유를 반영한 추정입니다. 실제 도로 경로는 길찾기에서 확인할 수 있습니다.'};
}
function slots(r) { return r.itinerary.days.flatMap((d,day)=>d.filter(x=>x.kind==='slot').map(x=>({...x,day}))); }
function eligible(r,slotId,p) {
 const s=slots(r).find(x=>x.id===slotId);
 return Boolean(s&&p&&p.city===s.city&&!p.fixedOnly&&(s.only?s.only.includes(p.id):(s.types.includes(p.type)||s.allow?.includes(p.id))));
}
function createPlan(r) { return {version:5,region:r.id,hotel:r.itinerary.defaultHotel,choices:Object.fromEntries(slots(r).map(s=>[s.id,null])),lunchMode:'road',mode:'car'}; }
function normalizePlan(r,input) {
 if(!input || ![4,5].includes(input.version) || input.region!==r.id || !input.choices || typeof input.choices!=='object' || Array.isArray(input.choices)) throw Error('이 여행 일정의 선택 정보가 아닙니다.');
 const p=createPlan(r);
 for(const s of slots(r)) { const q=r.points.find(x=>x.id===input.choices[s.id]); if(eligible(r,s.id,q)) p.choices[s.id]=q.id; }
 p.lunchMode=input.version===4?(p.choices['d2-lunch']?'nearby':'road'):input.lunchMode==='nearby'?'nearby':'road';
 return p;
}
function schedule(r,input) {
 const p=normalizePlan(r,input), lookup=id=>r.points.find(x=>x.id===id), hotel=lookup(p.hotel);
 const out={days:[],steps:[],edges:[],warnings:[],hotel:p.hotel,transferDeparture:null,returnDeparture:null,returnMinute:null};
 function warn(d,text) { d.warnings.push(text); out.warnings.push(text); }
 function add(d,kind,start,end,point,title,extra={}) {
  if(end<start) throw Error('음수 일정 시간');
  const b={kind,start,end,poi:point?.id,title:title||point?.name,...extra}; d.blocks.push(b);
  if(point && kind!=='travel' && kind!=='wait') out.steps.push({day:d.day,poi:point.id,start,end,kind,uid:extra.uid});
  return b;
 }
 function leg(d,a,b,t,restMinutes=0) {
  if(!a||!b||a.id===b.id) return t;
  const v=travel(r,a,b), title=a.name+' → '+b.name;
  if(restMinutes) {
   const first=Math.min(90,round10(v.minutes/2));
   add(d,'travel',t,t+first,b,title,{...v,minutes:first,from:a.id,to:b.id,segmentTitle:'부산 방향 · 휴게소 이전 구간'});
   add(d,'reststop',t+first,t+first+restMinutes,null,'휴게소 점심 · 위치는 당일 선택',{duration:restMinutes});
   add(d,'travel',t+first+restMinutes,t+v.minutes+restMinutes,b,title,{...v,minutes:v.minutes-first,from:a.id,to:b.id,segmentTitle:'휴게소 이후 · 당감동'});
   d.visitMin+=restMinutes;
  } else add(d,'travel',t,t+v.minutes,b,title,{...v,from:a.id,to:b.id});
  out.edges.push({from:a.id,to:b.id,day:d.day,mode:v.mode,minutes:v.minutes,restMinutes});d.travelMin+=v.minutes;
  return t+v.minutes+restMinutes;
 }
 function visit(d,q,t,minutes,title,extra={}) {
  if(q) {
   const h={...(q.hours||{}),...(q.hours?.byDay?.[[6,0,1][d.day]]||{})};
   if(isClosed(q,d.day)) warn(d,q.name+': '+date(d.day)+' 휴무 안내가 있습니다.');
   if(Number.isFinite(h.open)&&t<h.open) { add(d,'wait',t,h.open,null,q.name+' 개장 대기');t=h.open; }
   for(const [a,b] of h.breaks||[]) if(t<b&&t+minutes>a) { add(d,'wait',t,b,null,q.name+' 준비시간 이후 방문');t=b; }
   if(Number.isFinite(h.lastEntry)&&t>=h.lastEntry) warn(d,q.name+': 입장마감 '+time(h.lastEntry)+'에 도착하거나 그 이후입니다.');
   if(Number.isFinite(h.close)&&t+minutes>h.close) warn(d,q.name+': 종료 예상 '+time(t+minutes)+'가 안내 마감 '+time(h.close)+' 이후입니다.');
  }
  add(d,q?'visit':'placeholder',t,t+minutes,q,title,{duration:minutes,...extra});d.visitMin+=minutes;return t+minutes;
 }
 for(let day=0;day<3;day++) {
  const d={day,blocks:[],warnings:[],travelMin:0,visitMin:0,unselected:[]};out.days.push(d);
  let prev=day===0?origin(r):hotel, t=r.itinerary.morningDepartures[day];
  if(day===0) add(d,'origin',450,450,prev,'대연동 출발 · 07:30');
  else add(d,'hotel',0,t,hotel,'숙소에서 휴식 · 아침은 간단히 또는 생략');
  for(const item of r.itinerary.days[day]) {
   if(item.conditional&&item.conditional!==p.lunchMode)continue;
   if(item.kind==='pickup') {
    const q=lookup(item.poi);t=leg(d,prev,q,t);add(d,'origin',t,t,q,'민지 픽업 · 순천으로 출발');prev=q;continue;
   }
   if(item.kind==='checkout') {
    t=leg(d,prev,hotel,t);add(d,'hotel',t,t+item.duration,hotel,'체크아웃 · 짐 싣기');t+=item.duration;prev=hotel;continue;
   }
   if(item.kind==='hotel') {
    if(day===0) {out.transferDeparture=t;if(t>1050)warn(d,'순천 출발 '+time(t)+' · 17시 전후 목표보다 늦어집니다.');}
    t=leg(d,prev,hotel,t);
    if(day===0) out.checkinMinute=t;
    add(d,'hotel',t,t+item.duration,hotel,item.title,{duration:item.duration});t+=item.duration;prev=hotel;continue;
   }
   const q=item.kind==='slot'?lookup(p.choices[item.id]):lookup(item.poi);
   if(q) {t=leg(d,prev,q,t);prev=q;}
   if(Number.isFinite(item.notBefore)&&t<item.notBefore) {add(d,'wait',t,item.notBefore,null,item.title+' 전 여유');t=item.notBefore;}
   if(item.kind==='slot'&&!q)d.unselected.push(item.id);
   t=visit(d,q,t,item.duration,q?.name||item.title+' · 장소 미선택',{uid:item.id,slotId:item.kind==='slot'?item.id:null,fixed:item.kind!=='slot',slotTitle:item.title});
  }
  if(day<2) {
   t=leg(d,prev,hotel,t);d.finish=t;add(d,'hotel',t,Math.max(1440,t),hotel,'숙소에서 쉬기');
  } else {
   out.returnDeparture=t;
   if(t>810)warn(d,'여수 출발 '+time(t)+' · 13:30 목표보다 '+(t-810)+'분 늦습니다.');
   const pickup=lookup('busan_pickup');t=leg(d,prev,pickup,t,p.lunchMode==='road'?30:0);out.pickupReturnMinute=t;
   add(d,'origin',t,t,pickup,'당감동 도착');t=leg(d,pickup,origin(r),t);
   add(d,'origin',t,t,origin(r),'대연동 도착');out.returnMinute=t;d.finish=t;
   if(t>1080)warn(d,'대연동 도착 '+time(t)+' · 18시 목표보다 '+(t-1080)+'분 늦습니다.');
  }
  if(d.finish>1440)warn(d,date(day)+' 일정이 자정을 넘습니다. 선택한 장소의 동선을 확인하세요.');
 }
 out.unselected=out.days.flatMap(d=>d.unselected);
 return out;
}
const api={ORIGIN,origin,clamp,round10,km,time,date,isClosed,travel,slots,eligible,createPlan,normalizePlan,schedule};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TripEngine=api;
})(typeof window!=='undefined'?window:this);
