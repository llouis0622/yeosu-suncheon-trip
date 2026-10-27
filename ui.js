'use strict';
const DATA=JSON.parse(document.getElementById('travelData').textContent),E=TripEngine,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS={sight:'관광',food:'음식점',cafe:'카페',hotel:'숙소',origin:'부산 출발·도착'},MODES={car:'자차',walk:'도보'};
const STORAGE_KEY=location.search.includes('trip-test=1')?'yeosu-suncheon-fixed-test':'yeosu-suncheon-fixed-v4';
const state={region:DATA[0].id,day:0,routeDay:0,selected:null,type:'all',query:'',city:'all',activeSlot:'',pane:'split',plannerExpanded:false,plannerView:'sequence',camera:{x:0,y:0,w:500,h:650},width:600,height:650,tween:null,pins:[],flows:[],playing:false,playIndex:0,elapsed:0,flowClock:0,fromPoint:null,playback:null};
const region=()=>DATA[0],point=id=>region().points.find(p=>p.id===id),motion=matchMedia('(prefers-reduced-motion: reduce)');
let selectedPlan=E.createPlan(region()),result,undo=[],redo=[],storageOk=true,toastTimer,pointers=new Map(),gesture=null,ignoreClickUntil=0,pendingTap=null,lastFrame=0,paintTime=0;
const plan=()=>selectedPlan;
const durationLabel=n=>n<60?n+'분':Math.floor(n/60)+'시간'+(n%60?' '+n%60+'분':'');
const allSlots=()=>E.slots(region());
const slot=id=>allSlots().find(s=>s.id===id);
const slotLabel=s=>`${s.day+1}일차 ${s.title}`;
const mapUrl=p=>'https://map.naver.com/p/search/'+encodeURIComponent(p.city+' '+p.name);
function routeUrl(b){const a=point(b.from),z=point(b.to),part=p=>encodeURIComponent(p.name)+','+p.coord[1]+','+p.coord[0];return 'https://map.kakao.com/link/by/'+(b.mode==='walk'?'foot':'car')+'/'+part(a)+'/'+part(z);}
function restoreSaved(){try{const s=localStorage.getItem(STORAGE_KEY);if(s)selectedPlan=E.normalizePlan(region(),JSON.parse(s));}catch{storageOk=false;}
 try{if(location.hash.startsWith('#plan=')){const raw=location.hash.slice(6);if(raw.length>12000)throw Error('too long');selectedPlan=E.normalizePlan(region(),JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)))));persist();history.replaceState(null,'',location.pathname+location.search);}}catch{toast('공유 링크를 읽지 못해 저장된 선택 또는 기본 일정으로 열었습니다.');}}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(plan()));storageOk=true;}catch{storageOk=false;}}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function mutate(fn){const previous=JSON.stringify(plan());fn(plan());selectedPlan=E.normalizePlan(region(),plan());if(previous===JSON.stringify(plan()))return;undo.push(previous);if(undo.length>40)undo.shift();redo=[];stopPlayback();persist();refresh();}
function historyStep(back=true){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(JSON.stringify(plan()));selectedPlan=E.normalizePlan(region(),JSON.parse(from.pop()));stopPlayback();persist();refresh();toast(back?'선택을 되돌렸습니다.':'선택을 다시 적용했습니다.');}
function refresh(){result=E.schedule(region(),plan());renderHeader();renderCandidatePanel();renderPlanner();renderPins();renderRoutes();updatePlaybackControls();}
function changeDay(day){stopPlayback();state.day=day;state.routeDay=day;renderHeader();renderPlanner();renderCandidateList();renderRoutes();fitDay();}
function renderHeader(){
 $('mapDays').innerHTML=[0,1,2].map(d=>`<button data-day="${d}" aria-pressed="${state.routeDay===d}">${d+1}일차</button>`).join('')+`<button data-action="all-days" aria-pressed="${state.routeDay===null}">전체</button>`;
 $('mapHelp').textContent='밝은 점: 선택한 장소 · 화살표: 이동 방향 · 시간은 추정';
 $('main').dataset.layout=workspaceLayout();$('main').dataset.pane=state.pane;
 for(const p of ['split','map','places','schedule'])$('pane-'+p).setAttribute('aria-pressed',String(state.pane===p));
 applyPaneSizes();
}
function candidatePoints(){return region().points.filter(p=>p.type!=='origin');}
function visiblePoints(){return candidatePoints().filter(p=>(state.city==='all'||p.city===state.city)&&(state.type==='all'||p.type===state.type)&&(!state.activeSlot||(state.activeSlot==='hotel'?p.type==='hotel':E.eligible(region(),state.activeSlot,p)))&&(!state.query||[p.name,p.city,p.area,p.desc,...(p.tags||[])].join(' ').toLowerCase().includes(state.query.toLowerCase())));}
function card(p){
 const used=p.type==='hotel'?plan().hotel===p.id:Object.values(plan().choices).includes(p.id)||result.steps.some(x=>x.poi===p.id);
 const available=allSlots().some(s=>E.eligible(region(),s.id,p)),targetDay=slot(state.activeSlot)?.day??state.day;
 return `<article class="candidate ${state.selected===p.id?'focused':''}" data-card="${p.id}"><div class="candidate-kicker"><span>${esc(p.city)} · ${CATS[p.type]}</span>${used?'<span class="selected-label">✓ 선택됨</span>':''}</div><button class="card-title" data-detail="${p.id}">${esc(p.name)}</button><p class="candidate-meta">${esc(p.area)}${p.type==='hotel'?' · 여수 2박':''}</p><p class="candidate-description">${esc(p.desc)}</p>${p.type==='hotel'?`<p class="room-note">${esc(p.room?.name)} · ${p.room?.bathStatus==='confirmed'?'욕조 안내 확인':'욕조·객실 조건 확인'}</p>`:''}${E.isClosed(p,targetDay)?`<p class="closure-note">${E.date(targetDay)} 휴무 안내</p>`:''}<div class="candidate-actions">${p.type==='hotel'||available?`<button class="choose" data-use="${p.id}">${p.type==='hotel'?(used?'선택한 숙소':'이 숙소로 2박'):state.activeSlot?'이 장소 선택':'일정에 선택'}</button>`:`<span class="fixed-badge">${used?'확정 방문지':'참고 후보'}</span>`}<button data-detail="${p.id}">상세·지도 ↗</button></div></article>`;
}
function renderCandidatePanel(){
 const sc=$('candidateList'),top=sc?.scrollTop||0,left=sc?.scrollLeft||0;
 $('candidatePanel').innerHTML=`<div class="candidate-head"><div class="candidate-title"><h2>추천 <small id="candidateCount"></small></h2><input id="search" type="search" placeholder="장소·음식 검색" aria-label="장소 검색" value="${esc(state.query)}"></div><div class="candidate-filter"><select id="candidateCity" aria-label="도시 필터"><option value="all">두 도시</option><option value="순천" ${state.city==='순천'?'selected':''}>순천</option><option value="여수" ${state.city==='여수'?'selected':''}>여수</option></select><div class="category-tabs" aria-label="장소 분류">${[['all','전체'],['sight','관광'],['food','식당'],['cafe','카페'],['hotel','숙소']].map(([k,v])=>`<button data-category="${k}" aria-pressed="${state.type===k}">${v}</button>`).join('')}</div></div><label class="slot-select"><span>선택 위치</span><select id="activeSlot" aria-label="장소를 반영할 일정"><option value="">모든 추천 장소</option>${allSlots().map(s=>`<option value="${s.id}" ${state.activeSlot===s.id?'selected':''}>${slotLabel(s)} · ${durationLabel(s.duration)}</option>`).join('')}<option value="hotel" ${state.activeSlot==='hotel'?'selected':''}>여수 숙소 · 2박</option></select></label></div><div class="candidate-list" id="candidateList"></div>`;
 renderCandidateList();$('candidateList').scrollTop=top;$('candidateList').scrollLeft=left;
}
function renderCandidateList(){const list=visiblePoints();$('candidateCount').textContent=list.length+'곳';$('candidateList').innerHTML=list.map(card).join('')||'<p class="empty">조건에 맞는 후보가 없습니다.</p>';}
function openSlot(id){
 if(id!=='hotel'&&!slot(id))return;
 if($('detail').open)$('detail').close();if($('dialog').open)$('dialog').close();
 state.activeSlot=id;state.type='all';state.city='all';state.query='';
 if(slot(id)){state.day=slot(id).day;state.routeDay=state.day;}
 if(compactWorkspace()||state.pane==='schedule')setPane('places');
 renderCandidatePanel();renderPlanner();renderHeader();renderRoutes();$('candidateList').scrollTop=0;$('candidateList').scrollLeft=0;
 $('activeSlot').focus({preventScroll:true});
}
function selectCandidate(id){
 const p=point(id);if(!p)return;
 if(p.type==='hotel'){applyChoice('hotel',id);return;}
 if(state.activeSlot&&E.eligible(region(),state.activeSlot,p)){applyChoice(state.activeSlot,id);return;}
 const valid=allSlots().filter(s=>E.eligible(region(),s.id,p));if(!valid.length)return;
 if($('detail').open)$('detail').close();
 modal(p.name+' · 넣을 시간',`<p>방문 순서와 체류시간은 유지됩니다.</p><div class="choice-list">${valid.map(s=>`<button data-pick-slot="${s.id}" data-poi="${id}"><b>${slotLabel(s)}</b><span>${durationLabel(s.duration)} · ${esc(point(plan().choices[s.id])?.name||'미선택')}</span></button>`).join('')}</div>`);
}
function applyChoice(id,poi){
 if(id!=='hotel'&&!E.eligible(region(),id,point(poi)))return;
 if($('dialog').open)$('dialog').close();if($('detail').open)$('detail').close();state.selected=poi;
 if(slot(id)){state.day=slot(id).day;state.routeDay=state.day;}
 mutate(p=>{if(id==='hotel')p.hotel=poi;else p.choices[id]=poi;});
 if(compactWorkspace())setPane('schedule');
 toast(point(poi).name+' 반영 · 동선과 도착 시각을 계산했습니다.');
}
function clearSlot(id){if(!slot(id))return;mutate(p=>p.choices[id]=null);toast('장소 선택을 해제했습니다. 체류시간은 유지됩니다.');}
function modal(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
function openDetail(id){
 const p=point(id);if(!p)return;pauseMap();state.selected=id;renderPins();focusMap(p);
 const available=p.type==='hotel'||allSlots().some(s=>E.eligible(region(),s.id,p));
 $('detailTitle').textContent=p.name;
 $('detailBody').innerHTML=`<p class="detail-meta">${esc(p.city)} · ${CATS[p.type]} · ${esc(p.area)}</p><p>${esc(p.desc)}</p><p class="fine">${esc(p.address||'')}</p>${p.type==='hotel'?`<div class="notice"><b>${esc(p.room?.name)}</b><p>${esc(p.room?.bathDescription)}</p><p>${esc(p.costNote)}</p></div>`:`<p>${esc(p.hours?.note||'운영시간 확인 필요')}</p>`}${p.accessNote?`<p class="fine">${esc(p.accessNote)}</p>`:''}<p class="fine">${esc(p.coordStatus||'지도 출입구는 길찾기에서 확인할 수 있습니다.')}</p><div class="detail-links"><a target="_blank" rel="noopener noreferrer" href="${mapUrl(p)}">네이버 지도 ↗</a><a target="_blank" rel="noopener noreferrer" href="https://map.kakao.com/link/search/${encodeURIComponent(p.city+' '+p.name)}">카카오 지도 ↗</a>${(p.links||[]).filter(l=>/^https?:\/\//.test(l.url)).map(l=>`<a target="_blank" rel="noopener noreferrer" href="${esc(l.url)}">${esc(l.label)} ↗</a>`).join('')}</div>${available?`<button class="primary full" data-use="${p.id}">${p.type==='hotel'?'이 숙소로 2박':'이 장소 선택'}</button>`:'<p class="fine">'+(p.type==='sight'||p.fixedOnly?'확정된 방문 순서에 포함되어 있습니다.':'이번 확정 일정에는 별도 선택 시간이 없는 참고 후보입니다.')+'</p>'}`;
 if(!$('detail').open)$('detail').showModal();
}
function blockAction(b,i){return b.slotId?`data-slot="${b.slotId}"`:b.kind==='travel'?`data-travel="${i}"`:b.poi?`data-detail="${b.poi}"`:'';}
function sequenceHtml(d){return d.blocks.map((b,i)=>{
 if(b.kind==='travel')return `<li class="transfer"><button data-travel="${i}"><span>${MODES[b.mode]} 약 ${b.minutes}분</span><small>${esc(point(b.to)?.name)}</small><span>↘</span></button></li>`;
 if(b.kind==='wait')return `<li class="wait-row"><time>${E.time(b.start)}–${E.time(b.end)}</time><span>${esc(b.title)}</span></li>`;
 return `<li class="agenda-event ${b.kind} ${b.slotId?'selectable':''}" data-block="${b.uid||b.kind+'-'+i}" data-start="${b.start}" data-end="${b.end}" ${b.slotId?`data-slot-value="${plan().choices[b.slotId]||''}"`:''}><div class="event-time"><time>${E.time(b.start)}</time>${b.end>b.start?`<small>${E.time(b.end)}</small>`:''}</div><div class="event-content"><button class="event-main" ${blockAction(b,i)}><small>${b.kind==='hotel'?esc(point(b.poi)?.name||'여수 숙소')+(b.duration?' · ':''):b.slotTitle&&!b.fixed?esc(b.slotTitle)+' · ':''}${b.duration?durationLabel(b.duration):''}</small><strong>${esc(b.title)}</strong>${b.slotId?`<span class="choose-label">${b.poi?'장소 변경':'장소 선택'} ↗</span>`:''}</button>${b.slotId&&b.poi?`<button class="clear-choice" data-clear-slot="${b.slotId}" aria-label="${esc(b.slotTitle)} 장소 선택 해제">×</button>`:''}</div></li>`;
 }).join('');}
function horizontalTimeline(){return stackedWorkspace()&&state.pane==='split'||state.pane==='schedule'&&!compactWorkspace();}
function timelineHtml(d){const horizontal=horizontalTimeline(),pos=horizontal?'left':'top',size=horizontal?'width':'height';return `<div class="time-canvas" id="timeCanvas"><div class="hour-ruler">${Array.from({length:25},(_,i)=>`<span style="${pos}:${i/24*100}%">${String(i).padStart(2,'0')}</span>`).join('')}</div><div class="time-row">${d.blocks.filter(b=>b.end>b.start).map(b=>{const i=d.blocks.indexOf(b),end=Math.min(1440,b.end),start=Math.min(1440,b.start);if(end<=start)return '';return `<button class="time-block ${b.kind}" style="${pos}:${start/1440*100}%;${size}:${(end-start)/1440*100}%" ${blockAction(b,i)} title="${esc(b.title)} ${E.time(b.start)}–${E.time(b.end)}" aria-label="${esc(b.title)} ${E.time(b.start)}부터 ${E.time(b.end)}"><span>${esc(b.title)}</span><small>${E.time(b.start)}–${E.time(b.end)}</small></button>`;}).join('')}</div></div>`;}
function renderPlanner(){
 const d=result.days[state.day],old=$('scheduleScroll'),prevDay=old?.dataset.scheduleDay,top=old?.scrollTop||0,left=old?.scrollLeft||0;
 $('planner').className='planner '+(horizontalTimeline()?'horizontal':'vertical');
 $('planner').innerHTML=`<div class="planner-top"><h2>일정</h2><div class="planner-view"><button data-view="sequence" aria-pressed="${state.plannerView==='sequence'}">시간표</button><button data-view="timeline" aria-pressed="${state.plannerView==='timeline'}">24시</button></div><div class="planner-tools"><button data-action="undo" aria-label="선택 되돌리기" ${undo.length?'':'disabled'}>↶</button><button data-action="redo" aria-label="선택 다시 실행" ${redo.length?'':'disabled'}>↷</button><button data-action="save" aria-label="선택 저장·공유">···</button></div></div><div class="planner-days">${[0,1,2].map(day=>`<button data-day="${day}" aria-pressed="${state.day===day}">${E.date(day)}</button>`).join('')}</div><p class="planner-note">순서·체류시간 고정 · 장소 선택 시 도착 시각 계산</p><div class="schedule-scroll ${state.plannerView}" id="scheduleScroll" data-schedule-day="${state.day}" tabindex="0" aria-label="${E.date(state.day)} 고정 일정 시간표">${state.plannerView==='sequence'?`<ol class="agenda">${sequenceHtml(d)}</ol>`:timelineHtml(d)}</div><div class="planner-foot"><span>${d.unselected.length?'미선택 '+d.unselected.length+'곳':'장소 선택 완료'}</span><button data-action="schedule-info" class="${result.returnMinute>1080?'late':''}">부산 ${E.time(result.returnMinute)}${result.warnings.length?' · 확인 '+result.warnings.length:''} ↗</button></div>`;
 const sc=$('scheduleScroll');if(String(state.day)===prevDay){sc.scrollTop=top;sc.scrollLeft=left;}else if(state.plannerView==='timeline'){const first=state.day===0?420:480;if(horizontalTimeline())sc.scrollLeft=first/1440*2160;else sc.scrollTop=first/1440*2160;}
}
function travelInfo(i){const b=result.days[state.day].blocks[Number(i)];if(b?.kind!=='travel')return;modal('구간 이동',`<p><b>${esc(b.title)}</b></p><p>${MODES[b.mode]} 약 ${b.minutes}분 · ${E.time(b.start)}–${E.time(b.end)}</p><p>${esc(b.note)}</p><div class="detail-links"><a href="${routeUrl(b)}" target="_blank" rel="noopener noreferrer">실제 길찾기 ↗</a></div>`);}
function scheduleInfo(){modal('이동·운영시간 확인',`<div class="summary-grid"><div><small>순천 → 여수 출발</small><b>${E.time(result.transferDeparture)}</b></div><div><small>여수 → 부산 출발</small><b>${E.time(result.returnDeparture)}</b></div><div><small>당감동 도착 예상</small><b>${E.time(result.pickupReturnMinute)}</b></div><div><small>대연동 도착 예상</small><b>${E.time(result.returnMinute)}</b></div></div><p>미선택 식사·휴식도 시간은 확보합니다. 장소를 고르면 우회 이동과 개장 대기를 더합니다. 이동시간은 계획용 추정입니다.</p>${result.warnings.length?`<ul>${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:'<p>현재 계산에서 운영시간·귀환 목표 초과는 없습니다.</p>'}<p class="fine">1일차 점심 90분, 나머지 점심 60분, 저녁 90분, 아침 40분, 3일차 카페·벽화마을 60분을 확보했습니다. 주차·대기 상황에 따라 달라질 수 있습니다.</p>`);}
function saveDialog(){modal('선택 저장·공유',`<p>${storageOk?'현재 브라우저에 선택이 자동 저장됩니다.':'브라우저 자동 저장이 제한되어 있습니다. JSON 저장을 이용하세요.'} 다른 기기에는 공유 링크나 JSON 파일로 전달할 수 있습니다.</p><div class="choice-list"><button data-action="share">현재 선택 공유 링크 복사</button><button data-action="download">선택 정보 JSON 저장</button><label class="upload">JSON 가져오기<input id="importFile" type="file" accept="application/json,.json"></label><button data-action="reset">기본 선택으로 복원 · 신라스테이</button></div><p id="importStatus" role="status"></p>`);}
function download(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(plan(),null,2)],{type:'application/json'}));a.href=url;a.download='여수-순천-선택.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function share(){const bytes=new TextEncoder().encode(JSON.stringify(plan())),encoded=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=location.origin+location.pathname+'#plan='+encoded;try{await navigator.clipboard.writeText(url);$('importStatus').textContent='현재 선택을 담은 링크를 복사했습니다.';}catch{$('importStatus').innerHTML='<label>공유 링크<input id="shareUrl" readonly></label>';$('shareUrl').value=url;$('shareUrl').select();}}
function help(){modal('사용 안내',`<p><b>한 가지 확정 코스에서 식당·카페·숙소만 고릅니다.</b></p><ul><li>시간표의 ‘장소 선택’을 누르면 해당 시간에 넣을 후보가 열립니다.</li><li>미선택 장소는 지도에서 건너뛰고, 선택하면 그곳을 거치는 화살표로 바뀝니다.</li><li>관람 순서와 체류시간은 고정됩니다. 이동·대기시간에 따라 도착 시각만 달라집니다.</li><li>3일차에는 카페 또는 고소동 벽화마을 중 한 곳을 선택합니다.</li><li>선택한 숙소는 여수 2박과 세 날짜의 동선에 함께 반영됩니다.</li><li>지도에는 식당·카페·여수 숙소 후보를 모두 표시합니다. 목록 필터는 지도 후보를 숨기지 않습니다.</li><li>경계선을 끌어 화면 비율을 바꿀 수 있습니다. 두 번 누르거나 새로고침하면 50:25:25로 돌아옵니다.</li></ul><p class="fine">부산 출발·픽업은 동네 기준점이며 정확한 집 주소는 공개하지 않습니다. 지도 화살표는 도로 경로가 아닌 이동 방향입니다.</p>`);}

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
 else if(action==='save')saveDialog();else if(action==='schedule-info')scheduleInfo();else if(action==='download')download();else if(action==='share')share();
 else if(action==='all-days'){state.routeDay=null;renderHeader();renderRoutes();fitSelected();}
 else if(action==='reset'){mutate(p=>Object.assign(p,E.createPlan(region())));$('dialog').close();toast('기본 선택으로 돌아왔습니다. 되돌리기도 가능합니다.');}
}
document.addEventListener('click',e=>{
 const attr=(key)=>e.target.closest('button[data-'+key+']');let n;
 if(n=attr('pane'))setPane(n.dataset.pane);
 else if(n=attr('day'))changeDay(Number(n.dataset.day));
 else if(n=attr('category')){state.type=n.dataset.category;state.activeSlot='';renderCandidatePanel();}
 else if(n=attr('slot'))openSlot(n.dataset.slot);
 else if(n=attr('clear-slot'))clearSlot(n.dataset.clearSlot);
 else if(n=attr('use'))selectCandidate(n.dataset.use);
 else if(n=attr('pick-slot'))applyChoice(n.dataset.pickSlot,n.dataset.poi);
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
$('closeDetail').onclick=()=>$('detail').close();$('closeDialog').onclick=()=>$('dialog').close();
for(const id of ['detail','dialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
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
