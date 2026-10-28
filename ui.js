'use strict';
const DATA=JSON.parse(document.getElementById('travelData').textContent),E=TripEngine,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS={sight:'관광',food:'음식점',cafe:'카페',hotel:'숙소',origin:'부산 출발·도착'},MODES={car:'자차',walk:'도보'};
const STORAGE_KEY=location.search.includes('trip-test=1')?'yeosu-suncheon-fixed-test':'yeosu-suncheon-fixed-v5';
const state={region:DATA[0].id,day:0,routeDay:0,selected:null,expandedPlace:null,type:'all',query:'',city:'all',activeSlot:'',pane:'split',plannerExpanded:false,plannerView:'sequence',camera:{x:0,y:0,w:500,h:650},width:600,height:650,tween:null,pins:[],flows:[],playing:false,playIndex:0,elapsed:0,flowClock:0,fromPoint:null,playback:null};
const region=()=>DATA[0],point=id=>region().points.find(p=>p.id===id),motion=matchMedia('(prefers-reduced-motion: reduce)');
let selectedPlan=E.createPlan(region()),result,undo=[],redo=[],storageOk=true,toastTimer,pointers=new Map(),gesture=null,ignoreClickUntil=0,pendingTap=null,lastFrame=0,paintTime=0;
const plan=()=>selectedPlan;
const durationLabel=n=>n<60?n+'분':Math.floor(n/60)+'시간'+(n%60?' '+n%60+'분':'');
const allSlots=()=>E.slots(region());
const slot=id=>allSlots().find(s=>s.id===id);
const slotLabel=s=>`${s.day+1}일차 ${s.title}`;
const mapUrl=p=>'https://map.naver.com/p/search/'+encodeURIComponent(p.city+' '+p.name);
function routeUrl(b){const a=point(b.from),z=point(b.to),params=new URLSearchParams({slat:a.coord[1],slng:a.coord[0],sname:a.name,dlat:z.coord[1],dlng:z.coord[0],dname:z.name,appname:'https://llouis0622.github.io/yeosu-suncheon-trip/'});return 'nmap://route/'+(b.mode==='walk'?'walk':'car')+'?'+params;}
function restoreSaved(){try{const saved=localStorage.getItem(STORAGE_KEY)||(STORAGE_KEY.endsWith('-test')?null:localStorage.getItem('yeosu-suncheon-fixed-v4'));if(saved){selectedPlan=E.normalizePlan(region(),JSON.parse(saved));persist();}}catch{storageOk=false;}
 try{if(location.hash.startsWith('#plan=')){const raw=location.hash.slice(6);if(raw.length>12000)throw Error('too long');selectedPlan=E.normalizePlan(region(),JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)))));persist();history.replaceState(null,'',location.pathname+location.search);}}catch{toast('공유 링크를 읽지 못해 저장된 선택 또는 기본 일정으로 열었습니다.');}}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(plan()));storageOk=true;}catch{storageOk=false;}}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function mutate(fn){const previous=JSON.stringify(plan());fn(plan());selectedPlan=E.normalizePlan(region(),plan());if(previous===JSON.stringify(plan()))return;undo.push(previous);if(undo.length>40)undo.shift();redo=[];stopPlayback();persist();refresh();}
function historyStep(back=true){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(JSON.stringify(plan()));selectedPlan=E.normalizePlan(region(),JSON.parse(from.pop()));stopPlayback();persist();refresh();toast(back?'선택을 되돌렸습니다.':'선택을 다시 적용했습니다.');}
function refresh(){result=E.schedule(region(),plan());renderHeader();renderCandidatePanel();renderPlanner();renderPins();renderRoutes();updatePlaybackControls();}
function changeDay(day){stopPlayback();state.day=day;state.routeDay=day;renderHeader();renderPlanner();renderCandidateList();renderPins();renderRoutes();fitDay();}
function renderHeader(){
 $('mapDays').innerHTML=[0,1,2].map(d=>`<button data-day="${d}" aria-pressed="${state.routeDay===d}">${d+1}일차</button>`).join('')+`<button data-action="all-days" aria-pressed="${state.routeDay===null}">전체</button>`;
 $('mapHelp').textContent='번호·화살표: 방문 순서 · 실제 길찾기는 네이버지도';
 $('main').dataset.layout=workspaceLayout();$('main').dataset.pane=state.pane;
 for(const p of ['split','map','places','schedule'])$('pane-'+p).setAttribute('aria-pressed',String(state.pane===p));
 applyPaneSizes();
}
function candidatePoints(){return region().points.filter(p=>p.type!=='origin').sort((a,b)=>Number(!!b.savedByUser)-Number(!!a.savedByUser));}
function visiblePoints(){return candidatePoints().filter(p=>(state.city==='all'||p.city===state.city)&&(state.type==='all'||p.type===state.type||state.type==='fixed'&&['sight','hotel'].includes(p.type))&&(!state.activeSlot||(state.activeSlot==='hotel'?p.type==='hotel':E.eligible(region(),state.activeSlot,p)))&&(!state.query||[p.name,p.city,p.area,p.desc,...(p.tags||[])].join(' ').toLowerCase().includes(state.query.toLowerCase())));}
function brief(text,limit=100){const value=String(text||'').trim();return value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;}
function inlineGuide(p){
 const hours=p.type==='hotel'?'확정 숙소 · 같은 숙소에서 2박':p.hours?.note||'운영시간은 네이버지도에서 확인하세요.';
 const note=p.type==='hotel'?'객실별 바다 전망과 욕조 유무는 예약한 객실 기준으로 확인하세요.':p.accessNote;
 const source=(p.links||[]).find(l=>/^https?:\/\//.test(l.url)&&!/(naver\.me|map\.naver)/.test(l.url));
 return `<dl><div><dt>주소</dt><dd>${esc(p.address||p.area)}</dd></div><div><dt>시간</dt><dd>${esc(brief(hours,110))}</dd></div>${note?`<div><dt>참고</dt><dd>${esc(brief(note,100))}</dd></div>`:''}</dl>${/근사|대략|미검증/.test(p.coordStatus||'')?'<p class="guide-note">지도 위치는 근사치입니다. 입구는 네이버지도에서 확인하세요.</p>':''}${source?`<a class="guide-source" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">추가 안내 ↗</a>`:''}`;
}
function card(p){
 const used=p.type==='hotel'?plan().hotel===p.id:Object.values(plan().choices).includes(p.id)||result.steps.some(x=>x.poi===p.id);
 const available=p.type!=='hotel'&&allSlots().some(s=>E.eligible(region(),s.id,p)),targetDay=slot(state.activeSlot)?.day??state.day,expanded=state.expandedPlace===p.id;
 const toggle=`data-expand="${p.id}" aria-expanded="${expanded}" aria-controls="guide-${p.id}"`;
 return `<article class="candidate ${state.selected===p.id?'focused':''} ${expanded?'is-expanded':''}" data-card="${p.id}"><div class="candidate-kicker"><span>${esc(p.city)} · ${CATS[p.type]}${p.savedByUser?' · ★ 저장':''}</span>${used?'<span class="selected-label">✓ 선택됨</span>':''}</div><button class="card-title" ${toggle}>${esc(p.name)}</button><p class="candidate-meta">${esc(p.area)}${p.type==='hotel'?' · 여수 2박':''}</p><p class="candidate-description">${esc(brief(p.desc))}</p>${E.isClosed(p,targetDay)?`<p class="closure-note">${E.date(targetDay)} 휴무 안내</p>`:''}${available?'':`<span class="fixed-badge">${p.type==='hotel'?'확정 숙소 · 여수 2박':used?'확정 방문지':'참고 후보'}</span>`}<div class="candidate-actions">${available?`<button class="choose" data-use="${p.id}">${state.activeSlot?'이 장소 선택':'일정에 선택'}</button>`:''}<a class="naver-link" href="${mapUrl(p)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} 네이버지도">네이버지도 ↗</a><button class="guide-toggle" ${toggle}>${expanded?'안내 접기 ⌃':'안내 ⌄'}</button></div><div id="guide-${p.id}" class="inline-guide" ${expanded?'':'hidden'}>${inlineGuide(p)}</div></article>`;
}
function toggleCard(id){
 const p=point(id);if(!p)return;
 state.expandedPlace=state.expandedPlace===id?null:id;
 for(const el of $('candidateList').querySelectorAll('[data-card]')){
  const expanded=el.dataset.card===state.expandedPlace;el.classList.toggle('is-expanded',expanded);el.querySelector('.inline-guide').hidden=!expanded;
  el.querySelectorAll('[data-expand]').forEach(b=>b.setAttribute('aria-expanded',String(expanded)));
  el.querySelector('.guide-toggle').textContent=expanded?'안내 접기 ⌃':'안내 ⌄';
 }
 if(state.expandedPlace){pauseMap();state.selected=id;renderPins();focusMap(p);}
}
function renderCandidatePanel(){
 const sc=$('candidateList'),top=sc?.scrollTop||0,left=sc?.scrollLeft||0;
 $('candidatePanel').innerHTML=`<div class="candidate-head"><div class="candidate-title"><h2>추천 <small id="candidateCount"></small></h2><input id="search" type="search" placeholder="장소·음식 검색" aria-label="장소 검색" value="${esc(state.query)}"></div><div class="candidate-filter"><select id="candidateCity" aria-label="도시 필터"><option value="all">두 도시</option><option value="순천" ${state.city==='순천'?'selected':''}>순천</option><option value="여수" ${state.city==='여수'?'selected':''}>여수</option></select><div class="category-tabs" aria-label="장소 분류">${[['all','전체'],['food','식당'],['cafe','카페'],['fixed','관광·숙소']].map(([k,v])=>`<button data-category="${k}" aria-pressed="${state.type===k}">${v}</button>`).join('')}</div></div><label class="slot-select"><span>선택 위치</span><select id="activeSlot" aria-label="장소를 반영할 일정"><option value="">모든 추천 장소</option>${allSlots().map(s=>`<option value="${s.id}" ${state.activeSlot===s.id?'selected':''}>${slotLabel(s)} · ${durationLabel(s.duration)}</option>`).join('')}</select></label></div><div class="candidate-list" id="candidateList"></div>`;
 renderCandidateList();$('candidateList').scrollTop=top;$('candidateList').scrollLeft=left;
}
function renderCandidateList(){const list=visiblePoints();$('candidateCount').textContent=list.length+'곳';$('candidateList').innerHTML=list.map(card).join('')||'<p class="empty">조건에 맞는 후보가 없습니다.</p>';}
function openSlot(id){
 if(id!=='hotel'&&!slot(id))return;
 if($('dialog').open)$('dialog').close();
 state.activeSlot=id;state.type='all';state.city='all';state.query='';
 if(slot(id)){state.day=slot(id).day;state.routeDay=state.day;}
 if(compactWorkspace()||state.pane==='schedule')setPane('places');
 renderCandidatePanel();renderPlanner();renderHeader();renderPins();renderRoutes();$('candidateList').scrollTop=0;$('candidateList').scrollLeft=0;
 $('activeSlot').focus({preventScroll:true});
}
function selectCandidate(id){
 const p=point(id);if(!p)return;
 if(p.type==='hotel'){openDetail(id);return;}
 if(state.activeSlot&&E.eligible(region(),state.activeSlot,p)){applyChoice(state.activeSlot,id);return;}
 const valid=allSlots().filter(s=>E.eligible(region(),s.id,p));if(!valid.length)return;

 modal(p.name+' · 넣을 시간',`<p>방문 순서와 체류시간은 유지됩니다.</p><div class="choice-list">${valid.map(s=>`<button data-pick-slot="${s.id}" data-poi="${id}"><b>${slotLabel(s)}</b><span>${durationLabel(s.duration)} · ${esc(point(plan().choices[s.id])?.name||'미선택')}</span></button>`).join('')}</div>`);
}
function applyChoice(id,poi){
 if(!E.eligible(region(),id,point(poi)))return;
 if($('dialog').open)$('dialog').close();state.selected=poi;
 if(slot(id)){state.day=slot(id).day;state.routeDay=state.day;}
 mutate(p=>{p.choices[id]=poi;if(id==='d2-lunch')p.lunchMode='nearby';});
 if(compactWorkspace())setPane('schedule');
 toast(point(poi).name+' 반영 · 동선과 도착 시각을 계산했습니다.');
}
function clearSlot(id){if(!slot(id))return;mutate(p=>p.choices[id]=null);toast('장소 선택을 해제했습니다. 체류시간은 유지됩니다.');}
function modal(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function openDetail(id){
 const p=point(id);if(!p)return;pauseMap();state.selected=id;focusMap(p);
 if(p.type==='origin'){toast(p.name+' · 정확한 집 주소가 아닌 동네 기준점입니다.');return;}
 if($('dialog').open)$('dialog').close();
 if(!visiblePoints().some(q=>q.id===id)){state.activeSlot='';state.type='all';state.city='all';state.query='';}
 state.expandedPlace=id;
 if(compactWorkspace()||['map','schedule'].includes(state.pane))setPane('places');
 renderCandidatePanel();renderPins();
 requestAnimationFrame(()=>{const card=$('candidateList').querySelector(`[data-card="${id}"]`);if(card){card.scrollIntoView({block:'nearest',inline:'nearest'});card.querySelector('.card-title').focus({preventScroll:true});}});
}
function blockAction(b,i){return b.kind==='reststop'?'data-action="lunch-options"':b.slotId?`data-slot="${b.slotId}"`:b.kind==='travel'?`data-travel="${i}"`:b.poi?`data-detail="${b.poi}"`:'';}
function sequenceHtml(d){return d.blocks.map((b,i)=>{
 if(b.kind==='travel')return `<li class="transfer"><button data-travel="${i}"><span>${MODES[b.mode]} 약 ${b.minutes}분</span><small>${esc(b.segmentTitle||point(b.to)?.name)}</small><span>↘</span></button></li>`;
 if(b.kind==='wait')return `<li class="wait-row"><time>${E.time(b.start)}–${E.time(b.end)}</time><span>${esc(b.title)}</span></li>`;
 return `<li class="agenda-event ${b.kind} ${b.slotId?'selectable':''}" data-block="${b.uid||b.kind+'-'+i}" data-start="${b.start}" data-end="${b.end}" ${b.slotId?`data-slot-value="${plan().choices[b.slotId]||''}"`:''}><div class="event-time"><time>${E.time(b.start)}</time>${b.end>b.start?`<small>${E.time(b.end)}</small>`:''}</div><div class="event-content"><button class="event-main" ${blockAction(b,i)}><small>${b.kind==='hotel'?esc(point(b.poi)?.name||'여수 숙소')+(b.duration?' · ':''):b.slotTitle&&!b.fixed?esc(b.slotTitle)+' · ':''}${b.duration?durationLabel(b.duration):''}</small><strong>${esc(b.title)}</strong>${b.slotId?`<span class="choose-label">${b.poi?'장소 변경':'장소 선택'} ↗</span>`:''}</button>${b.slotId&&b.poi?`<button class="clear-choice" data-clear-slot="${b.slotId}" aria-label="${esc(b.slotTitle)} 장소 선택 해제">×</button>`:''}</div></li>`;
 }).join('');}
function horizontalTimeline(){return stackedWorkspace()&&state.pane==='split'||state.pane==='schedule'&&!compactWorkspace();}
function timelineHtml(d){const horizontal=horizontalTimeline(),pos=horizontal?'left':'top',size=horizontal?'width':'height';return `<div class="time-canvas" id="timeCanvas"><div class="hour-ruler">${Array.from({length:25},(_,i)=>`<span style="${pos}:${i/24*100}%">${String(i).padStart(2,'0')}</span>`).join('')}</div><div class="time-row">${d.blocks.filter(b=>b.end>b.start).map(b=>{const i=d.blocks.indexOf(b),end=Math.min(1440,b.end),start=Math.min(1440,b.start);if(end<=start)return '';return `<button class="time-block ${b.kind}" style="${pos}:${start/1440*100}%;${size}:${(end-start)/1440*100}%" ${blockAction(b,i)} title="${esc(b.title)} ${E.time(b.start)}–${E.time(b.end)}" aria-label="${esc(b.title)} ${E.time(b.start)}부터 ${E.time(b.end)}"><span>${esc(b.title)}</span><small>${E.time(b.start)}–${E.time(b.end)}</small></button>`;}).join('')}</div></div>`;}
function renderPlanner(){
 const d=result.days[state.day],old=$('scheduleScroll'),prevDay=old?.dataset.scheduleDay,top=old?.scrollTop||0,left=old?.scrollLeft||0;
 $('planner').className='planner '+(horizontalTimeline()?'horizontal':'vertical');
 $('planner').innerHTML=`<div class="planner-top"><h2>일정</h2><div class="planner-view"><button data-view="sequence" aria-pressed="${state.plannerView==='sequence'}">시간표</button><button data-view="timeline" aria-pressed="${state.plannerView==='timeline'}">24시</button></div><div class="planner-tools"><button data-action="undo" aria-label="선택 되돌리기" ${undo.length?'':'disabled'}>↶</button><button data-action="redo" aria-label="선택 다시 실행" ${redo.length?'':'disabled'}>↷</button><button data-action="save" aria-label="선택 저장·공유">···</button></div></div><div class="planner-days">${[0,1,2].map(day=>`<button data-day="${day}" aria-pressed="${state.day===day}">${E.date(day)}</button>`).join('')}</div>${state.day===2?`<div class="planner-note meal-mode" aria-label="마지막 날 점심 방식"><span>점심</span><button data-lunch-mode="road" aria-pressed="${plan().lunchMode==='road'}">휴게소 30분</button><button data-lunch-mode="nearby" aria-pressed="${plan().lunchMode==='nearby'}">여수에서 간단히</button></div>`:'<p class="planner-note">베네치아 2박 · 선택한 식당·카페에 따라 이동시간 계산</p>'}<div class="schedule-scroll ${state.plannerView}" id="scheduleScroll" data-schedule-day="${state.day}" tabindex="0" aria-label="${E.date(state.day)} 고정 일정 시간표">${state.plannerView==='sequence'?`<ol class="agenda">${sequenceHtml(d)}</ol>`:timelineHtml(d)}</div><div class="planner-foot"><span>${d.unselected.length?'미선택 '+d.unselected.length+'곳':'장소 선택 완료'}</span><button data-action="schedule-info" class="${result.returnMinute>1080?'late':''}">부산 ${E.time(result.returnMinute)}${result.warnings.length?' · 확인 '+result.warnings.length:''} ↗</button></div>`;
 const sc=$('scheduleScroll');if(String(state.day)===prevDay){sc.scrollTop=top;sc.scrollLeft=left;}else if(state.plannerView==='timeline'){const first=state.day===0?420:480;if(horizontalTimeline())sc.scrollLeft=first/1440*2160;else sc.scrollTop=first/1440*2160;}
}
function travelInfo(i){const b=result.days[state.day].blocks[Number(i)];if(b?.kind!=='travel')return;modal('구간 이동',`<p><b>${esc(b.segmentTitle||b.title)}</b></p><p>${MODES[b.mode]} 약 ${b.minutes}분 · ${E.time(b.start)}–${E.time(b.end)}</p><p>${esc(b.note)}</p><div class="detail-links"><a href="${routeUrl(b)}">네이버지도 앱 길찾기 ↗</a><a href="${mapUrl(point(b.from))}" target="_blank" rel="noopener noreferrer">출발지 · 네이버지도 웹 ↗</a><a href="${mapUrl(point(b.to))}" target="_blank" rel="noopener noreferrer">도착지 · 네이버지도 웹 ↗</a></div><p class="fine">앱 길찾기는 네이버지도 앱이 설치된 기기에서 열립니다. 컴퓨터에서는 출발지·도착지 웹 링크를 이용하세요. 지도 연결선은 도로 경로가 아닌 방문 방향입니다.</p>`);}
function scheduleInfo(){modal('이동·운영시간 확인',`<div class="summary-grid"><div><small>순천 → 여수 출발</small><b>${E.time(result.transferDeparture)}</b></div><div><small>여수 → 부산 출발</small><b>${E.time(result.returnDeparture)}</b></div><div><small>당감동 도착 예상</small><b>${E.time(result.pickupReturnMinute)}</b></div><div><small>대연동 도착 예상</small><b>${E.time(result.returnMinute)}</b></div></div><p>숙소는 여수 베네치아 2박으로 확정했습니다. 둘째 날은 09:00 출발, 마지막 날은 09:30부터 체크아웃을 준비합니다. 아침은 숙소에서 쉬거나 간단히 먹는 시간으로 두었습니다.</p><p>첫날 빵 포장·간단한 점심 40분, 둘째 날 점심 60분, 저녁 90분, 마지막 날 빵집·카페 40분입니다. 미선택 시간도 확보하고, 장소를 고르면 우회 이동과 개장 대기를 더합니다.</p><p>${plan().lunchMode==='road'?'귀환 중 휴게소 식사 30분을 포함합니다. 휴게소 위치는 정하지 않았으며 출발 약 90분 뒤 쉬는 것으로 시간을 계산합니다.':'마지막 날은 여수에서 30분간 간단히 먹고 출발합니다. 휴게소 식사 시간을 중복해서 더하지 않습니다.'}</p>${result.warnings.length?`<ul>${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:'<p>현재 계산에서 알려진 운영시간·귀환 목표 초과는 없습니다.</p>'}<p class="fine">이동시간과 장소 좌표 일부는 추정입니다. 주차·교통·대기 상황에 따라 달라집니다.</p>`);}
function saveDialog(){modal('선택 저장·공유',`<p>${storageOk?'현재 브라우저에 선택이 자동 저장됩니다.':'브라우저 자동 저장이 제한되어 있습니다. JSON 저장을 이용하세요.'} 다른 기기에는 공유 링크나 JSON 파일로 전달할 수 있습니다.</p><div class="choice-list"><button data-action="share">현재 선택 공유 링크 복사</button><button data-action="download">선택 정보 JSON 저장</button><label class="upload">JSON 가져오기<input id="importFile" type="file" accept="application/json,.json"></label><button data-action="reset">기본 선택으로 복원 · 베네치아</button></div><p id="importStatus" role="status"></p>`);}
function download(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(plan(),null,2)],{type:'application/json'}));a.href=url;a.download='여수-순천-선택.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function share(){const bytes=new TextEncoder().encode(JSON.stringify(plan())),encoded=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=location.origin+location.pathname+'#plan='+encoded;try{await navigator.clipboard.writeText(url);$('importStatus').textContent='현재 선택을 담은 링크를 복사했습니다.';}catch{$('importStatus').innerHTML='<label>공유 링크<input id="shareUrl" readonly></label>';$('shareUrl').value=url;$('shareUrl').select();}}
function help(){modal('사용 안내',`<p><b>베네치아 2박과 확정 관광 순서에서 먹을 곳을 고릅니다.</b></p><ul><li>지도를 끌면 다른 지역도 볼 수 있으며, 축소하면 전국과 더 넓은 지역까지 볼 수 있습니다.</li><li>추천 카드에서 네이버지도를 바로 열거나 이름·안내 버튼으로 필요한 설명을 펼칩니다.</li><li>추천은 전체 / 식당 / 카페 / 관광·숙소로 나뉩니다. ★ 저장 표시는 보내주신 네이버 목록에 있는 곳입니다.</li><li>첫날: 찹쌀떡 다음에 구디스파이 또는 화월당을 선택해 간단히 먹고 국가정원으로 갑니다.</li><li>첫날 저녁과 둘째 날 점심·저녁을 고르면 그 식당을 거치는 경로가 생깁니다. ×를 누르면 미선택으로 돌아갑니다.</li><li>아침은 숙소에서 쉬거나 간단히 먹고 생략할 수 있도록 별도 식당 경로를 두지 않았습니다.</li><li>마지막 날 빵집·카페를 선택하고, 점심은 여수 식당 또는 귀환 중 휴게소 중에서 고릅니다.</li><li>휴게소는 아직 위치를 정하지 않아 점을 임의로 찍지 않고 30분의 식사 시간만 귀환 계산에 더합니다.</li><li>OpenStreetMap 배경에 방문 순서와 화살표를 표시합니다. 실제 도로 길찾기는 네이버지도 앱 또는 웹 링크를 이용하세요.</li><li>경계선으로 화면 크기를 조절할 수 있습니다. 새로고침하면 50:25:25로 돌아오며 장소 선택은 저장됩니다.</li></ul><p class="fine">부산 출발·픽업은 동네 기준점입니다. 지도 배경은 온라인 연결이 필요하며, 장소 위치 일부는 근사 좌표입니다.</p>`);}

const PHONE_MEDIA='(max-width: 599px), (max-width: 1199px) and (max-height: 599px), (max-width: 759px) and (max-height: 759px)';
const PORTRAIT_MEDIA='(min-width: 600px) and (min-height: 600px) and (orientation: portrait)';
const compactWorkspace=()=>matchMedia(PHONE_MEDIA).matches;
const stackedWorkspace=()=>!compactWorkspace()&&matchMedia(PORTRAIT_MEDIA).matches;
const workspaceLayout=()=>compactWorkspace()?'phone':stackedWorkspace()?'rows':'columns';
const DEFAULT_PANE_SIZES=[.5,.25,.25];
let paneSizes={columns:[...DEFAULT_PANE_SIZES],rows:[...DEFAULT_PANE_SIZES]},paneGesture=null;
function paneSpace(layout=workspaceLayout()){const rect=$('main').getBoundingClientRect();return Math.max(1,rect[layout==='rows'?'height':'width']-40);}
function paneMinimums(space,layout){return(layout==='rows'?[200,140,190]:[220,190,210]).map((pixels,i)=>Math.min(pixels/space,i===0 ? .3 : i===2 ? .25 : .2));}
function fitPaneSizes(values,space,layout){const minimum=paneMinimums(space,layout),extra=values.map((v,i)=>Math.max(0,v-minimum[i])),sum=extra.reduce((a,b)=>a+b,0),free=1-minimum.reduce((a,b)=>a+b,0);return minimum.map((v,i)=>v+free*(sum?extra[i]/sum:1/3));}
function applyPaneSizes(values){
 const layout=workspaceLayout();if(layout==='phone')return;
 const main=$('main'),space=paneSpace(layout),sizes=fitPaneSizes(values||paneSizes[layout],space,layout),minimum=paneMinimums(space,layout);
 ['map','places','plan'].forEach((name,i)=>main.style.setProperty('--pane-'+name,sizes[i]+'fr'));
 main.dataset.paneSizes=sizes.join(',');
 ['mapDivider','planDivider'].forEach((id,i)=>{const divider=$(id),before=i?sizes[0]:0;divider.setAttribute('aria-orientation',layout==='rows'?'horizontal':'vertical');divider.setAttribute('aria-valuenow',String(Math.round((before+sizes[i])*100)));divider.setAttribute('aria-valuemin',String(Math.ceil((before+minimum[i])*100)));divider.setAttribute('aria-valuemax',String(Math.floor((before+sizes[i]+sizes[i+1]-minimum[i+1])*100)));divider.setAttribute('aria-valuetext','지도 '+Math.round(sizes[0]*100)+'%, 추천 '+Math.round(sizes[1]*100)+'%, 일정 '+Math.round(sizes[2]*100)+'%');});
 return sizes;
}
// Keep orientation-specific sizes only while this page is open; reload starts at 50:25:25.
function rememberPaneSizes(layout,sizes){paneSizes[layout]=[...sizes];}
function resizePanePair(sizes,index,delta,space,layout){const next=[...sizes],minimum=paneMinimums(space,layout),pair=sizes[index]+sizes[index+1];next[index]=E.clamp(sizes[index]+delta,minimum[index],pair-minimum[index+1]);next[index+1]=pair-next[index];return next;}
function cancelPaneResize(){const g=paneGesture;if(!g)return;paneGesture=null;if(g.handle.hasPointerCapture?.(g.id))g.handle.releasePointerCapture(g.id);g.handle.removeAttribute('aria-grabbed');delete $('main').dataset.resizing;document.body?.classList.remove('resizing-panes');applyPaneSizes();}
function onPaneResizeDown(e){
 if(paneGesture){if(paneGesture.id!==e.pointerId)cancelPaneResize();return;}
 const handle=e.target.closest('[data-resize-pane]'),layout=workspaceLayout();if(!handle||layout==='phone'||state.pane!=='split'||e.button!==0||e.isPrimary===false)return;
 const sizes=applyPaneSizes(),axis=layout==='rows'?'clientY':'clientX';
 paneGesture={id:e.pointerId,handle,index:Number(handle.dataset.resizePane),layout,axis,origin:e[axis],space:paneSpace(layout),sizes,preview:sizes,moved:false};
 try{handle.setPointerCapture(e.pointerId);}catch{}handle.focus({preventScroll:true});e.preventDefault();
}
function onPaneResizeMove(e){const g=paneGesture;if(!g||g.id!==e.pointerId)return;const delta=e[g.axis]-g.origin;if(!g.moved&&Math.abs(delta)<3)return;g.moved=true;g.preview=resizePanePair(g.sizes,g.index,delta/g.space,g.space,g.layout);applyPaneSizes(g.preview);$('main').dataset.resizing=g.layout;g.handle.setAttribute('aria-grabbed','true');document.body?.classList.add('resizing-panes');e.preventDefault();}
function onPaneResizeEnd(e){const g=paneGesture;if(!g||g.id!==e.pointerId)return;if(e.type==='pointerup'&&g.moved){onPaneResizeMove(e);rememberPaneSizes(g.layout,g.preview);}cancelPaneResize();}
function resetPaneSizes(){cancelPaneResize();const layout=workspaceLayout();if(layout==='phone')return;rememberPaneSizes(layout,DEFAULT_PANE_SIZES);applyPaneSizes();toast('지도 50% · 추천 25% · 일정 25%로 되돌렸습니다.');}
function paneResizeKeyboard(e){const handle=e.target.closest('[data-resize-pane]');if(!handle)return;if(e.key==='Home'){e.preventDefault();resetPaneSizes();return;}const layout=workspaceLayout();if(layout==='phone'||state.pane!=='split')return;const keys=layout==='rows'?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];if(!keys.includes(e.key))return;e.preventDefault();const delta=(e.key===keys[0]?-1:1)*(e.shiftKey ? .01 : .05),sizes=resizePanePair(applyPaneSizes(),Number(handle.dataset.resizePane),delta,paneSpace(layout),layout);rememberPaneSizes(layout,sizes);applyPaneSizes();}
function setPane(pane){
 cancelPaneResize();state.pane=['split','map','places','schedule'].includes(pane)?pane:'map';
 if(compactWorkspace()&&state.pane==='split')state.pane='map';
 state.plannerExpanded=!compactWorkspace()&&state.pane==='schedule';
 $('main').dataset.pane=state.pane;
 for(const p of ['split','map','places','schedule'])$('pane-'+p).setAttribute('aria-pressed',String(state.pane===p));
 if(!['map','split'].includes(state.pane))pauseMap();
 renderPlanner();
}
function togglePlanner(){
 if(compactWorkspace()){setPane(state.pane==='schedule'?'map':'schedule');return;}
 setPane(state.plannerExpanded?'split':'schedule');
}
function syncWorkspace(){
 cancelPaneResize();
 // Keep the chosen pane while adapting its time axis to the available width.
 if(compactWorkspace()&&state.plannerExpanded)state.pane='schedule';
 if(compactWorkspace()&&state.pane==='split')state.pane='map';
 state.plannerExpanded=!compactWorkspace()&&state.pane==='schedule';
 renderHeader();renderPlanner();

}
function syncVisibleViewport(){
 const v=window.visualViewport;
 // Pinch zoom is browser magnification, not a change of application layout.
 if(v&&v.scale!==1)return;
 document.documentElement.style.setProperty('--visible-height',Math.round(v?.height||window.innerHeight)+'px');
 document.documentElement.style.setProperty('--viewport-top',Math.round(v?.offsetTop||0)+'px');
}

function handleAction(action){
 if(action==='play')togglePlay();else if(action==='arrival')startArrival();else if(action==='skip-arrival'){stopPlayback();fitDay();}
 else if(action==='undo')historyStep();else if(action==='redo')historyStep(false);else if(action==='info')help();
 else if(action==='lunch-options'){state.day=2;renderPlanner();toast('시간표 위에서 휴게소 또는 여수 점심을 고르세요.');}
 else if(action==='save')saveDialog();else if(action==='schedule-info')scheduleInfo();else if(action==='download')download();else if(action==='share')share();
 else if(action==='all-days'){state.routeDay=null;renderHeader();renderPins();renderRoutes();fitSelected();}
 else if(action==='reset'){mutate(p=>Object.assign(p,E.createPlan(region())));$('dialog').close();toast('기본 선택으로 돌아왔습니다. 되돌리기도 가능합니다.');}
}
document.addEventListener('click',e=>{
 const attr=(key)=>e.target.closest('button[data-'+key+']');let n;
 if(n=attr('pane'))setPane(n.dataset.pane);
 else if(n=attr('day'))changeDay(Number(n.dataset.day));
 else if(n=attr('category')){state.type=n.dataset.category;state.activeSlot='';renderCandidatePanel();}
 else if(n=attr('slot'))openSlot(n.dataset.slot);
 else if(n=attr('lunch-mode')){mutate(p=>p.lunchMode=n.dataset.lunchMode==='nearby'?'nearby':'road');if(plan().lunchMode==='nearby')openSlot('d2-lunch');}
 else if(n=attr('clear-slot'))clearSlot(n.dataset.clearSlot);
 else if(n=attr('use'))selectCandidate(n.dataset.use);
 else if(n=attr('pick-slot'))applyChoice(n.dataset.pickSlot,n.dataset.poi);
 else if(n=attr('expand'))toggleCard(n.dataset.expand);
 else if(n=attr('detail'))openDetail(n.dataset.detail);
 else if(n=attr('travel'))travelInfo(n.dataset.travel);
 else if(n=attr('view')){state.plannerView=n.dataset.view;renderPlanner();}
 else if(n=attr('action'))handleAction(n.dataset.action);
});
document.addEventListener('input',e=>{if(e.target.id==='search'){state.query=e.target.value;renderCandidateList();}});
document.addEventListener('change',async e=>{
 if(e.target.id==='candidateCity'){state.city=e.target.value;renderCandidateList();}
 else if(e.target.id==='activeSlot'){if(e.target.value)openSlot(e.target.value);else {state.activeSlot='';renderCandidatePanel();}}
 else if(e.target.id==='importFile'){
  try{const file=e.target.files?.[0];if(!file)return;if(file.size>30000)throw Error('선택 정보 파일은 30KB 이하여야 합니다.');const next=E.normalizePlan(region(),JSON.parse(await file.text()));mutate(p=>Object.assign(p,next));$('importStatus').textContent='선택을 가져와 지도와 시간표에 반영했습니다.';}
  catch(error){$('importStatus').textContent='가져오지 않았습니다: '+error.message;}
 }
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){cancelPaneResize();clearGesture();pauseMap();}
 const typing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);
 if((e.metaKey||e.ctrlKey)&&!typing&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();historyStep(e.key.toLowerCase()==='z'&&!e.shiftKey);}
});
$('brand').onclick=goNational;$('homeBtn').onclick=goNational;$('fitBtn').onclick=fitSelected;
$('closeDialog').onclick=()=>$('dialog').close();
for(const id of ['dialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
document.addEventListener('pointerdown',onPaneResizeDown);window.addEventListener('pointermove',onPaneResizeMove,{passive:false});window.addEventListener('pointerup',onPaneResizeEnd);window.addEventListener('pointercancel',onPaneResizeEnd);
for(const id of ['mapDivider','planDivider']){const el=$(id);el.addEventListener('dblclick',resetPaneSizes);el.addEventListener('keydown',paneResizeKeyboard);el.addEventListener('lostpointercapture',e=>{if(paneGesture?.id===e.pointerId)cancelPaneResize();});}
window.addEventListener('blur',cancelPaneResize);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelPaneResize();clearGesture();pauseMap();}lastFrame=0;});
function init(){
 restoreSaved();result=E.schedule(region(),plan());state.pane=compactWorkspace()?'map':'split';syncVisibleViewport();renderHeader();setupMap();refresh();
 window.visualViewport?.addEventListener('resize',syncVisibleViewport);window.visualViewport?.addEventListener('scroll',syncVisibleViewport);
 window.addEventListener('resize',()=>{syncVisibleViewport();if(!paneGesture)applyPaneSizes();});
 for(const query of [PHONE_MEDIA,PORTRAIT_MEDIA])matchMedia(query).addEventListener('change',syncWorkspace);
}
init();
