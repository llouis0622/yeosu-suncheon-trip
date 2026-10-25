/* Planning engine. Recorded directional routes and published services take priority. */
(function(root){
'use strict';
const ORIGIN={id:'busan',name:'부산서부버스터미널(사상)',type:'transit',coord:[128.9859,35.1626]};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),round5=n=>Math.ceil(n/5)*5;
const finite=(v,f)=>Number.isFinite(Number(v))&&v!==null&&v!==''?Number(v):f;
function origin(r,back=false){return{...ORIGIN,...(back?r.transport?.return?.busanHub:r.transport?.busanHub),id:'busan'};}
function km(a,b){const rad=Math.PI/180,p1=a.coord[1]*rad,p2=b.coord[1]*rad,dp=p2-p1,dl=(b.coord[0]-a.coord[0])*rad;return 6371*2*Math.asin(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2));}
function travel(r,a,b,mode='taxi',override){
 if(!a||!b||a.id===b.id)return{minutes:0,low:0,high:0,mode,note:'같은 장소'};
 if(mode==='mixed'){const dist=km(a,b);mode=dist<0.85?'walk':dist<4.5?'transit':'taxi';}
 if(mode==='car'&&!r.carAllowed)mode='taxi';
 if(Number.isFinite(override)){const n=clamp(Math.round(override),0,600);return{minutes:n,low:n,high:n,mode,note:'직접 입력한 이동시간',manual:true};}
 if(a.complex&&a.complex===b.complex)return{minutes:10,low:5,high:20,mode:'walk',estimate:true,onsite:true,note:'같은 시설·단지 내부 이동입니다. 주차 후 도보10분을 확보한 계획값이며, 실내 출입구·동선은 현장에서 확인하세요.'};
 const known=(r.transferOverrides||[]).find(x=>x.from===a.id&&x.to===b.id&&x.mode===mode);
 const routeMode=mode==='car'||mode==='taxi'?'road':mode;
 const rec=r.routes?.[a.id+'>'+b.id+':'+routeMode],intercity=a.id==='busan'||b.id==='busan';
 const routeA=routeMode==='road'&&a.roadCoord?{coord:a.roadCoord}:a,routeB=routeMode==='road'&&b.roadCoord?{coord:b.roadCoord}:b,access=routeMode==='road'?(a.roadAccessMinutes||0)+(b.roadAccessMinutes||0):0;
 if(rec?.status==='ok'&&rec.seconds>=0&&(!rec.fromCoord||km(routeA,{coord:rec.fromCoord})<.03)&&(!rec.toCoord||km(routeB,{coord:rec.toCoord})<.03)){
  const raw=Math.ceil(rec.seconds/60),buffer=mode==='car'?10:mode==='taxi'?8:mode==='transit'?10:0,traffic=intercity?Math.max(20,round5(raw*.2)):0,n=round5(Math.max(5,raw)+buffer+traffic+access);
  return{minutes:n,low:raw+buffer+access,high:n+round5(Math.max(5,raw*.2)),rawMinutes:raw,bufferMinutes:buffer+traffic+access,meters:rec.meters,mode,verified:true,checkedAt:rec.checkedAt,sourceUrl:rec.sourceUrl,note:'카카오 '+(routeMode==='road'?'자동차 경로':mode==='walk'?'도보 경로':'대중교통 경로')+' 조회 '+raw+'분 + '+(buffer+traffic)+'분 '+(intercity?'도로 지연·승하차':'승하차·대기')+' 여유.'+(access?' 차량 하차점↔시설 도보 '+access+'분 추가(계획값).':'')+' 조회 시점 결과이며 여행일 평균·실시간 보장은 아닙니다.'};
 }
 if(known&&Number.isFinite(known.minutes))return{minutes:known.minutes,low:round5(known.minutes*.85),high:round5(known.minutes*1.2),mode,note:known.note||'별도 조사한 구간의 계획 이동시간',sourceUrl:known.sourceUrl,recorded:true};
 const distance=km(routeA,routeB),urban=['seoul','daejeon','suwon','sejong','changwon','ulsan','gimhae'].includes(r.id);
 let base, note;
 if(intercity&&r.carAllowed){
  const hub=r.points.find(x=>x.id===r.transport?.hubId)||{coord:r.center},reference=Math.max(10,km(origin(r),hub)),baseline=(b.id==='busan'?r.return:r.arrival).minutes;
  base=baseline*clamp(distance/reference,.35,2)+Math.max(20,baseline*.2)+10;
  note='부산역↔지역 도심 대표시간을 실제 방문지 거리로 보정하고 도로 지연·주차 여유를 더한 계획치. 해당 구간 길찾기 조회 전입니다.';
 }else{
  const road=distance*(urban?1.4:1.6);
  base=mode==='walk'?road/4*60:mode==='transit'?road/(urban?19:22)*60+(distance<1?10:25):road/(distance>25?45:urban?25:30)*60+(mode==='car'?10:8);
  note=mode==='transit'?'이 구간 대중교통 노선은 미조회입니다. 거리·대기 추정으로 실제 환승·배차에 따라 크게 달라질 수 있습니다.':'이 구간 길찾기는 미조회입니다. 좌표 거리·우회·승하차 여유를 반영한 임시 계획치입니다.';
 }
 const failed=r.routeFailures?.[a.id+'>'+b.id+':'+routeMode];if(failed)note=(failed==='NO_RESULTS'?'지도 조회에서 이용 가능한 경로를 찾지 못했습니다. 배차·운영 여부를 직접 확인하세요. ':'지도 조회가 완료되지 않은 구간입니다. ')+note.replace('이 구간 대중교통 노선은 미조회입니다. ','').replace('이 구간 길찾기는 미조회입니다. ','');
 const mid=round5(Math.max(mode==='walk'?5:10,base)+access);
 return{minutes:mid,low:round5(mid*.8),high:round5(mid*1.35),mode,note,estimate:true};
}
function createPlan(r,index=0){
 index=clamp(Math.trunc(finite(index,0)),0,r.courses.length-1);
 const c=r.courses[index];
 return {version:3,region:r.id,baseCourse:index,name:c.name,hotel:c.hotel||r.points.find(x=>x.type==='hotel').id,friday:false,departFriday:1140,departSaturday:450,busanAccess:30,starts:[540,540,540],mode:'mixed',transferDeparture:1200,transferMode:'rail',returnDeparture:870,arrivalRide:147,transferRide:25,returnRide:158,delayBuffer:30,hotelBudget:300000,luggage:false,extra:0,items:c.days.map((ids,d)=>ids.map((id,i)=>({uid:r.id+'-'+index+'-'+d+'-'+i,poi:id,duration:c.durations?.[id]||r.points.find(x=>x.id===id)?.visitMin||60,start:c.startTimes?.[id]??null,mode:c.modes?.[id]||null,travel:null})))};
}
function normalizePlan(r,input){
 if(!input||!Array.isArray(input.items)||input.items.length!==3)throw Error('3일 일정 형식이 아닙니다.');
 const p=createPlan(r,input.baseCourse), modes=['mixed','walk','taxi','transit'];
 p.luggage=Boolean(input.luggage);p.edited=Boolean(input.edited);p.name=String(input.name||p.name).slice(0,80);
 p.hotel=r.points.some(x=>x.id===input.hotel&&x.type==='hotel')?input.hotel:p.hotel;
 for(const [field,min,max] of [['departSaturday',240,1080],['transferDeparture',960,1380],['returnDeparture',720,1200],['busanAccess',0,180],['arrivalRide',60,360],['transferRide',10,180],['returnRide',60,360],['delayBuffer',0,120],['hotelBudget',0,3000000],['extra',0,10000000]])p[field]=clamp(finite(input[field],p[field]),min,max);
 p.transferMode=input.transferMode==='bus'?'bus':'rail';p.mode=modes.includes(input.mode)?input.mode:p.mode;
 p.starts=[0,1,2].map(i=>clamp(finite(input.starts?.[i],p.starts[i]),300,1320));
 p.items=input.items.map((items,d)=>{if(!Array.isArray(items))throw Error('일자별 장소 배열이 필요합니다.');return items.slice(0,30).filter(x=>x&&r.points.some(v=>v.id===x.poi&&!['hotel','transit'].includes(v.type))).map((x,i)=>({uid:r.id+'-saved-'+d+'-'+i,poi:x.poi,duration:clamp(finite(x.duration,60),15,720),start:x.start==null?null:clamp(finite(x.start,0),0,1439),mode:modes.includes(x.mode)?x.mode:null,travel:x.travel==null?null:clamp(finite(x.travel,0),0,600)}));});
 return p;
}
function isClosed(q,day){const h=q.hours||{},dateISO=['2026-11-28','2026-11-29','2026-11-30'][day];return(h.closedDays||[]).includes([6,0,1][day])||(h.closedDates||[]).includes(dateISO);}
function schedule(r,p){
 const lookup=id=>id==='busan'?origin(r):r.points.find(x=>x.id===id),hotel=lookup(p.hotel);
 if(!hotel)throw Error('숙소 후보를 선택해 주세요.');
 const out={days:[],warnings:[],steps:[],edges:[],hotel,cost:0,costParts:{hotel:p.hotelBudget,intercity:r.intercityCost||120000,local:0,food:0,tickets:0,extra:p.extra||0},returnMinute:0,returnHub:origin(r,true).name,routeCoverage:{verified:0,estimate:0,manual:0,onsite:0},unconfirmedService:true};
 const busan=origin(r),ysHub=lookup('ys_hub'),scHub=lookup('sc_hub'),ysStation=lookup('ys_station'),scStation=lookup('sc_station');
 const ticketSeen=new Set();
 function warn(d,text){d.warnings.push(text);out.warnings.push(text);}
 function add(d,kind,start,end,point,title,extra={}){const b={kind,start,end,poi:point?.id,title:title||point?.name,...extra};d.blocks.push(b);if(point&&kind!=='wait')out.steps.push({day:d.day,poi:point.id,start,end,uid:extra.uid,kind});return b;}
 function leg(d,a,b,t,mode=p.mode,override,uid){const v=travel(r,a,b,mode,override);if(v.minutes){add(d,'travel',t,t+v.minutes,b,a.name+' → '+b.name,{...v,from:a.id,to:b.id,uid:uid?'travel-'+uid:undefined});out.edges.push({from:a.id,to:b.id,day:d.day,mode:v.mode,minutes:v.minutes});d.travelMin+=v.minutes;out.routeCoverage[v.onsite?'onsite':v.verified?'verified':v.manual?'manual':'estimate']++;if(v.mode==='taxi')out.costParts.local+=Math.max(5000,Math.ceil((3500+(v.meters?v.meters/1000:km(a,b)*1.6)*1500)/1000)*1000);else if(v.mode==='transit')out.costParts.local+=5000;}return t+v.minutes;}
 function service(d,a,b,ready,target,ride,mode,buffer,label){
  let depart=Math.max(target,ready+20);
  if(ready+20>target)warn(d,label+': 승차 준비 포함 도착 '+time(ready+20)+'가 목표 출발 '+time(target)+'보다 늦습니다. 장소를 줄이거나 실제 후속편으로 시각을 바꿔주세요.');
  add(d,'wait',ready,depart,null,'승차 준비 20분 · 출발 전 여유');
  add(d,'travel',depart,depart+ride,b,a.name+' → '+b.name,{minutes:ride,low:ride,high:ride+buffer,mode,from:a.id,to:b.id,note:label+' · 계획 출발 '+time(depart)+'. 여행일 확정 배차가 아닌 편집 가능한 참고 시간입니다. 지연 여유 '+buffer+'분은 다음 블록에 별도 반영됩니다.',sourceUrl:mode==='rail'?'https://www.korail.com/':a.id==='busan'?'https://www.kobus.co.kr/':'https://txbus.t-money.co.kr/',scheduled:false});
  out.edges.push({from:a.id,to:b.id,day:d.day,mode,minutes:ride});d.travelMin+=ride;
  if(buffer)add(d,'wait',depart+ride,depart+ride+buffer,null,'이동 지연 여유 '+buffer+'분');
  return depart+ride+buffer;
 }
 for(let day=0;day<3;day++){
  const d={day,blocks:[],warnings:[],travelMin:0,visitMin:0};out.days.push(d);
  let t,prev;
  if(day===0){
   const ready=Math.max(0,p.departSaturday-20),start=Math.max(0,ready-p.busanAccess);
   add(d,'origin',start,ready,busan,'사상터미널까지 이동 · '+p.busanAccess+'분');
   t=service(d,busan,ysHub,ready,p.departSaturday,p.arrivalRide,'bus',p.delayBuffer,'부산 → 여수 첫차 참고안');prev=ysHub;if(p.luggage){add(d,'wait',t,t+15,null,'여수터미널 짐 보관');t+=15;}
  }else{
   t=p.starts[day];prev=hotel;add(d,'hotel',0,t,hotel,day===2?'숙박 · 조식 · 체크아웃 준비':'숙박 · 조식');
   if(day===2){add(d,'hotel',t,t+20,hotel,'체크아웃 · 짐 보관 또는 휴대');t+=20;if(t>(hotel.checkOutMin||660))warn(d,'체크아웃이 '+time(t)+'입니다. 숙소 퇴실 시각을 확인하세요.');}
  }
  for(const item of p.items[day]){
   const q=lookup(item.poi);if(!q)continue;
   t=leg(d,prev,q,t,item.mode||p.mode,item.travel,item.uid);
   if(item.start!=null){if(item.start>t){add(d,'wait',t,item.start,null,'희망 시작 시각까지 여유');t=item.start;}else if(item.start<t)warn(d,q.name+': 희망 시작 '+time(item.start)+'보다 도착 '+time(t)+'가 늦습니다.');}
   const h={...(q.hours||{}),...(q.hours?.byDay?.[[6,0,1][day]]||{})};
   if(isClosed(q,day))warn(d,q.name+': '+date(day)+' 휴무와 겹칩니다. 다른 날짜 또는 장소를 선택하세요.');
   if(q.city!==(day===0?'여수':'순천'))warn(d,q.name+': '+date(day)+'의 기본 도시와 다릅니다. 도시 간 추가 이동을 확인하세요.');
   if(Number.isFinite(h.open)&&t<h.open){add(d,'wait',t,h.open,null,q.name+' 개장 대기');t=h.open;}
   const duration=clamp(finite(item.duration,q.visitMin||60),15,720);
   for(const [start,end] of h.breaks||[])if(t<end&&t+duration>start){add(d,'wait',t,end,null,q.name+' 준비시간 이후 방문');t=end;}
   if(Number.isFinite(h.lastEntry)&&t>h.lastEntry)warn(d,q.name+': 입장마감 '+time(h.lastEntry)+' 이후 도착입니다.');
   add(d,'visit',t,t+duration,q,null,{uid:item.uid,duration});d.visitMin+=duration;
   if(Number.isFinite(h.close)&&t+duration>h.close)warn(d,q.name+': 계획 종료 '+time(t+duration)+'가 마감 '+time(h.close)+'보다 늦습니다.');
   if(q.type==='food'||q.type==='cafe')out.costParts.food+=(q.cost??(q.type==='food'?18000:8000))*2;
   else {const ticket=q.ticketGroup?day+':'+q.ticketGroup:null;if(!ticket||!ticketSeen.has(ticket)){out.costParts.tickets+=(q.cost||0)*2;if(ticket)ticketSeen.add(ticket);}}
   t+=duration;prev=q;
  }
  if(day===0){
   const rail=p.transferMode==='rail',from=rail?ysStation:ysHub,to=rail?scStation:scHub;
   if(p.luggage){t=leg(d,prev,ysHub,t,p.mode==='mixed'?'taxi':p.mode);add(d,'wait',t,t+15,null,'여수터미널 맡긴 짐 찾기');t+=15;prev=ysHub;if(t>1260)warn(d,'짐 보관소 안내 종료 21:00 이후 회수입니다. 운영시간을 확인하세요.');}t=leg(d,prev,from,t,p.mode==='mixed'?'taxi':p.mode);t=service(d,from,to,t,p.transferDeparture,p.transferRide,p.transferMode,10,'여수 → 순천 저녁 이동');t=leg(d,to,hotel,t);
   out.transferArrival=t;
  }else if(day===2){
   t=leg(d,prev,scHub,t);t=service(d,scHub,busan,t,p.returnDeparture,p.returnRide,'bus',p.delayBuffer,'순천 → 부산 귀환');
   add(d,'origin',t,t+10,busan,'부산 사상 도착');out.returnMinute=t;
   if(t>1080)warn(d,'부산 도착 '+time(t)+' — 18:00 목표보다 '+(t-1080)+'분 늦습니다.');
   else if(t>1050)warn(d,'부산 도착 '+time(t)+' — 18시까지 여유가 30분 미만입니다.');
  }else t=leg(d,prev,hotel,t);
  if(day<2){const checkin=Math.max(t,day===0?(hotel.checkInMin||900):0);if(checkin>t)add(d,'wait',t,checkin,null,'체크인 전 여유');add(d,'hotel',checkin,Math.max(1440,checkin+15),hotel,'순천 · 같은 객실에서 '+(day===0?'첫째':'둘째')+' 밤');if(checkin>1320)warn(d,'숙소 도착 '+time(checkin)+'입니다. 늦은 체크인 가능 여부를 확인하세요.');}
  if(t>1440)warn(d,date(day)+' 일정이 자정을 넘습니다. 장소 수·체류시간을 줄여주세요.');
 }
 const meals=p.items.flat().filter(x=>lookup(x.poi)?.type==='food').length;
 out.costParts.food+=Math.max(0,7-meals)*36000;
 out.cost=Object.values(out.costParts).reduce((a,b)=>a+b,0);
 if(out.cost>1200000)out.warnings.push('2인 계획예산이 120만원을 넘습니다. 숙소 예산과 이동·입장료를 조정하세요.');
 if(hotel.room?.bathStatus!=='confirmed')out.warnings.push('선택한 숙소는 예약할 객실의 욕조·스파 조건 확인이 필요합니다.');
 out.hoursUnconfirmed=[...new Set(out.steps.filter(x=>x.kind==='visit').map(x=>lookup(x.poi)).filter(q=>!Number.isFinite(q.hours?.open)||!Number.isFinite(q.hours?.close)).map(q=>q.name))];
 return out;
}

function time(n){const next=n>=1440?'익일 ':'';const m=((Math.round(n)%1440)+1440)%1440;return next+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function date(d){return ['11.28 토','11.29 일','11.30 월'][d]||'11.27 금';}
const api={ORIGIN,origin,km,travel,createPlan,normalizePlan,schedule,isClosed,time,date,clamp};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TripEngine=api;
})(typeof window!=='undefined'?window:this);

