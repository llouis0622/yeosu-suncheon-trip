const project=c=>({x:(c[0]-124)*80,y:(40-c[1])*100});
function fit(coords,pad=.2,min=3){const pts=coords.map(project),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2,ratio=state.width/state.height;let w=Math.max(min,Math.max(...xs)-Math.min(...xs))*(1+pad*2),h=Math.max(min,Math.max(...ys)-Math.min(...ys))*(1+pad*2);if(w/h<ratio)w=h*ratio;else h=w/ratio;return{x:cx-w/2,y:cy-h/2,w,h};}
function nationalView(){return fit([[125.65,33.15],[130.35,38.73]],.075,100);}
function fitSelected(){state.fitMode='all';pauseMap();if(!region()){animateView(nationalView());return;}animateView(fit(region().points.filter(p=>p.type!=='origin').map(p=>p.coord),.18,3));}
function focusMap(p){state.fitMode=null;pauseMap();const v=project(p.coord),w=Math.min(state.camera.w,9),h=w*state.height/state.width;animateView({x:v.x-w/2,y:v.y-h/2,w,h},250);}
const lerp=(a,b,t)=>a+(b-a)*t;
function animateView(to,duration=320){state.tween={from:{...state.camera},to,start:performance.now(),duration:motion.matches?0:duration};}
function screen(c){const p=project(c),v=state.camera;return{x:(p.x-v.x)/v.w*state.width,y:(p.y-v.y)/v.h*state.height};}
function curve(a,b){const p=project(a.coord),q=project(b.coord),dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,bend=Math.min(len*.12,35);return{p,q,c:{x:(p.x+q.x)/2-dy/len*bend,y:(p.y+q.y)/2+dx/len*bend}};}
function curvePoint(c,t){return{x:(1-t)**2*c.p.x+2*(1-t)*t*c.c.x+t*t*c.q.x,y:(1-t)**2*c.p.y+2*(1-t)*t*c.c.y+t*t*c.q.y};}
const curvePath=c=>`M${c.p.x},${c.p.y} Q${c.c.x},${c.c.y} ${c.q.x},${c.q.y}`;
function renderPins(){
 const selected=new Set(result.steps.map(x=>x.poi));
 const list=region().points.map(p=>({p,layer:p.type==='origin'?'origin':selected.has(p.id)?'selected':'candidate'}));
 $('pins').innerHTML=list.map(x=>`<button class="map-pin local layer-${x.layer} ${state.selected===x.p.id?'current':''}" data-pin="${x.p.id}" data-type="${x.p.type}" aria-label="${esc(x.p.name)} · ${x.layer==='selected'?'내 일정':'후보 장소'}"><span class="pin-dot"></span><span class="pin-label">${esc(x.p.name)}</span></button>`).join('');
 state.pins=list.map((x,i)=>({...x,el:$('pins').children[i]}));paintMap();
}
function updatePins(){const boxes=[],co=new Map(),detail=E.clamp((250-state.camera.w)/180,0,1),ordered=[...state.pins].sort((a,b)=>(b.p.id===state.selected?8:0)+(b.layer==='selected'?2:0)+(b.region?4:0)-((a.p.id===state.selected?8:0)+(a.layer==='selected'?2:0)+(a.region?4:0)));
 for(const x of ordered){const p=screen(x.p.coord),k=(x.owner||'')+x.p.coord.join(','),n=co.get(k)||0;co.set(k,n+1);if(n){p.x+=Math.cos(n*2.4)*Math.min(42,16+n*9);p.y+=Math.sin(n*2.4)*Math.min(42,16+n*9);}x.el.hidden=p.x<-24||p.x>state.width+24||p.y<-24||p.y>state.height+24;if(x.el.hidden)continue;x.el.style.left=p.x+'px';x.el.style.top=p.y+'px';if(x.global){x.el.style.opacity=String(.12+detail*.65);x.el.style.pointerEvents=detail>.25?'auto':'none';}
 const l=x.el.querySelector('.pin-label');if(x.global&&state.camera.w>95){l.style.visibility='hidden';continue;}const w=Math.min(150,x.p.name.length*11+20),h=27,opts=[[14,-h/2],[-w-14,-h/2],[12,16],[-w-12,16],[12,-h-16],[-w-12,-h-16]];let off=null;for(const[dx,dy]of opts){const b={x:p.x+dx,y:p.y+dy,w,h};if(b.x<4||b.x+w>state.width-4||b.y<4||b.y+h>state.height-4)continue;if(!boxes.some(o=>b.x<o.x+o.w+4&&b.x+w+4>o.x&&b.y<o.y+o.h+3&&b.y+h+3>o.y)){off=[dx,dy];boxes.push(b);break;}}
 l.style.visibility=off||state.selected===x.p.id?'visible':'hidden';off=off||[12,12];l.style.left=24+off[0]+'px';l.style.top=24+off[1]+'px';}
}
function renderRoutes(){
 const edges=result.edges.filter(e=>point(e.from)&&point(e.to)&&e.from!==e.to).map(e=>({...e,a:point(e.from),b:point(e.to),kind:state.routeDay===null||e.day===state.routeDay?'selected':'muted',curve:curve(point(e.from),point(e.to))}));
 $('routeLayer').innerHTML=edges.map((e,i)=>{
  const active=e.kind==='selected',color=['#ead39b','#b5cce3','#c7b7dc'][e.day];
  return `<path data-route-from="${e.from}" data-route-to="${e.to}" data-route-day="${e.day}" d="${curvePath(e.curve)}" fill="none" stroke="${color}" stroke-opacity="${active?.7:.13}" stroke-width="${active?2:1}" vector-effect="non-scaling-stroke"/>`+Array.from({length:2},(_,j)=>`<g id="flow-${i}-${j}"><path d="M-5-4L0 0-5 4M0-4L5 0 0 4" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>`).join('');
 }).join('');
 state.flows=edges.map((e,i)=>({...e,arrows:[0,1].map(j=>$('flow-'+i+'-'+j))}));
 if(!state.playback){$('activeTrail').setAttribute('d','');$('movingArrow').style.display='none';}
}
function paintMap(){$('mapSvg').setAttribute('viewBox',`${state.camera.x} ${state.camera.y} ${state.camera.w} ${state.camera.h}`);updatePins();paintPlaybackMarker();}
function paintFlow(){const v=state.camera,scale=v.w/state.width;state.flows.forEach((e,i)=>e.arrows.forEach((el,j)=>{const t=motion.matches?(j+1)/(e.arrows.length+1):(state.flowClock/(e.kind==='selected'?7600:10000)+j/e.arrows.length+i*.071)%1,c=e.curve,p=curvePoint(c,t),dx=2*((1-t)*(c.c.x-c.p.x)+t*(c.q.x-c.c.x)),dy=2*((1-t)*(c.c.y-c.p.y)+t*(c.q.y-c.c.y));el.style.display=p.x<v.x||p.x>v.x+v.w||p.y<v.y||p.y>v.y+v.h?'none':'';el.style.opacity=String((e.kind==='selected'?.88:.13)*Math.min(1,t*12,(1-t)*12));el.setAttribute('transform',`translate(${p.x} ${p.y}) scale(${scale}) rotate(${Math.atan2(dy,dx)*180/Math.PI})`);}));}
function playEdges(){let edges=result?.edges.filter(e=>e.day===state.day)||[];if(state.fromPoint){const p=point(state.fromPoint);if(!p)return[];const i=edges.findIndex(e=>e.from===p.id);if(i>=0)edges=edges.slice(i);else if(edges.length){const next=point(edges[0].to),v=E.travel(region(),p,next,plan().mode);edges=[{from:p.id,to:next.id,day:state.day,mode:v.mode,minutes:v.minutes},...edges.slice(1)];}}return edges.filter(e=>e.from!==e.to&&point(e.from)&&point(e.to));}
function playbackPoint(id){return id==='busan'?E.origin(region(),state.playback?.edges[state.playIndex]?.to==='busan'):point(id);}
function updatePlaybackControls(){const playback=state.playback,arrival=playback?.kind==='arrival',label=state.playing?(arrival?'Ⅱ 이동 멈춤':'Ⅱ 일시정지'):playback?'▶ 이어 재생':'▶ 일정 시작';for(const id of ['playRoute','mapPlay']){const b=$(id);if(b){b.textContent=label;b.setAttribute('aria-label',label.replace(/[▶Ⅱ]/g,'').trim());b.setAttribute('aria-pressed',String(state.playing));}}if($('mapPlayback'))$('mapPlayback').hidden=!region();if($('skipArrival'))$('skipArrival').hidden=!arrival;if($('arrivalReplay'))$('arrivalReplay').hidden=arrival;}
function stopPlayback(){state.playing=false;state.playback=null;state.fromPoint=null;state.playIndex=0;state.elapsed=0;state.tween=null;if($('playCaption'))$('playCaption').hidden=true;if($('activeTrail'))$('activeTrail').setAttribute('d','');if($('movingArrow'))$('movingArrow').style.display='none';updatePlaybackControls();}
function startPlayback(kind,edges){state.fitMode=null;setPane('map');if(state.plannerExpanded){state.plannerExpanded=false;renderPlanner();}stopPlayback();if(!edges.length){toast('재생할 이동 경로가 없습니다. 장소를 추가해 주세요.');return;}state.playback={kind,edges:edges.map(e=>({...e})),leg:null};state.playIndex=0;state.elapsed=0;state.playing=true;setPlayCamera();updatePlaybackControls();$('viewport').closest('.map-frame')?.scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'nearest'});}
function startArrival(){startPlayback('arrival',result.edges.filter(e=>e.day===0).slice(0,2));}
function togglePlay(from=null){if(!region())return;if(state.playing&&!from){pauseMap();return;}if(!from&&state.playback){setPane('map');if(state.plannerExpanded){state.plannerExpanded=false;renderPlanner();}state.playing=true;state.tween=null;state.playback.resume={from:{...state.camera},elapsed:0};showPlayCaption();updatePlaybackControls();$('viewport').closest('.map-frame')?.scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'nearest'});return;}state.fromPoint=from;const edges=playEdges();startPlayback('day',edges);}
function showPlayCaption(){const e=state.playback?.edges[state.playIndex];if(!e)return;const a=playbackPoint(e.from),target=playbackPoint(e.to);$('playCaption').hidden=false;$('playCaption').innerHTML=`<small>${state.playback.kind==='arrival'?'부산에서 '+esc(region().name)+'으로':E.date(e.day)} · ${MODES[e.mode]||'경로 미리보기'}${e.minutes?' '+e.minutes+'분':''}</small><b>${esc(a.name)} → ${esc(target.name)}</b><p>${esc(target.desc||'도착 후 후보 장소를 살펴보세요.')}</p>`;}
const smoothStep=t=>t*t*(3-2*t);
function setPlayCamera(){const e=state.playback?.edges[state.playIndex];if(!e){finishPlayback();return;}const a=playbackPoint(e.from),b=playbackPoint(e.to),c=curve(a,b),distance=Math.hypot(c.q.x-c.p.x,c.q.y-c.p.y),intercity=e.from==='busan'||e.to==='busan';state.playback.leg={curve:c,startCamera:{...state.camera},duration:intercity?4200:2600,startSpan:intercity?E.clamp(distance*.5,24,145):E.clamp(distance*.8,4,32),endSpan:intercity?12:E.clamp(distance*.55,4,22),progress:0};state.elapsed=0;state.tween=null;showPlayCaption();updatePlaybackControls();}
function followView(p,span){const ratio=state.width/state.height,w=span*Math.max(1,ratio),h=w/ratio;return{x:p.x-w/2,y:p.y-h*.46,w,h};}
function blendView(a,b,t){return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),w:lerp(a.w,b.w,t),h:lerp(a.h,b.h,t)};}
function paintPlaybackMarker(){const leg=state.playback?.leg;if(!leg)return;const c=leg.curve,t=leg.progress,p=curvePoint(c,t),dx=2*((1-t)*(c.c.x-c.p.x)+t*(c.q.x-c.c.x)),dy=2*((1-t)*(c.c.y-c.p.y)+t*(c.q.y-c.c.y));$('activeTrail').setAttribute('d',curvePath({p:c.p,c:{x:lerp(c.p.x,c.c.x,t),y:lerp(c.p.y,c.c.y,t)},q:p}));$('movingArrow').style.display='';$('movingArrow').setAttribute('transform',`translate(${p.x} ${p.y}) scale(${state.camera.w/state.width}) rotate(${Math.atan2(dy,dx)*180/Math.PI})`);}
function finishPlayback(){const kind=state.playback?.kind;stopPlayback();if(kind==='arrival')fitDay();}
function pauseMap(){state.playing=false;state.tween=null;if($('playCaption'))$('playCaption').hidden=true;updatePlaybackControls();}
function tick(now){const dt=lastFrame?Math.min(now-lastFrame,50):0;lastFrame=now;state.flowClock+=dt;if(state.tween){const tw=state.tween,t=tw.duration?E.clamp((now-tw.start)/tw.duration,0,1):1;state.camera=blendView(tw.from,tw.to,smoothStep(t));if(t>=1)state.tween=null;paintMap();}
 if(state.playing&&state.playback?.leg){const playback=state.playback,leg=playback.leg,resuming=Boolean(playback.resume);if(!resuming)state.elapsed+=dt;const t=E.clamp((state.elapsed-500)/leg.duration,0,1);leg.progress=smoothStep(t);const p=curvePoint(leg.curve,leg.progress),view=followView(p,lerp(leg.startSpan,leg.endSpan,leg.progress));if(resuming){playback.resume.elapsed+=dt;const f=smoothStep(E.clamp(playback.resume.elapsed/400,0,1));state.camera=motion.matches?view:blendView(playback.resume.from,view,f);if(f>=1)delete playback.resume;}else if(motion.matches){if(state.elapsed>=500+leg.duration)state.camera=view;}else state.camera=blendView(leg.startCamera,view,smoothStep(E.clamp(state.elapsed/500,0,1)));paintMap();if(!resuming&&state.elapsed>=500+leg.duration+550){state.playIndex++;setPlayCamera();}}
 if(now-paintTime>40){paintFlow();paintTime=now;}requestAnimationFrame(tick);}

function position(e){const v=$('viewport'),r=v.getBoundingClientRect();return{x:(e.clientX-r.left)*v.offsetWidth/r.width-v.clientLeft,y:(e.clientY-r.top)*v.offsetHeight/r.height-v.clientTop};}
function zoom(factor,at={x:state.width/2,y:state.height/2},duration=150){state.fitMode=null;const v={...(state.tween?.to||state.camera)},w=E.clamp(v.w*factor,.6,1500),h=w*state.height/state.width,ax=at.x/state.width,ay=at.y/state.height;pauseMap();animateView({x:v.x+v.w*ax-w*ax,y:v.y+v.h*ay-h*ay,w,h},duration);}
function beginGesture(moved=false){const pts=[...pointers.values()];if(!pts.length){gesture=null;return;}const center=pts.length>1?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:pts[0],v={...state.camera};gesture={camera:v,center,moved:pts.length>1||moved,distance:pts.length>1?Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)):0,anchor:{x:v.x+center.x/state.width*v.w,y:v.y+center.y/state.height*v.h}};}
function clearGesture(){pendingTap=null;const ids=[...pointers.keys()];pointers.clear();gesture=null;ids.forEach(id=>{if($('viewport').hasPointerCapture?.(id))$('viewport').releasePointerCapture(id);});$('viewport').classList.remove('dragging');}
function onPointerDown(e){if(e.button!==0||e.target.closest('.map-buttons,a')||pointers.size>=2)return;if(!pointers.size){ignoreClickUntil=0;pendingTap=null;}pauseMap();pointers.set(e.pointerId,position(e));beginGesture(gesture?.moved||false);}
function onPointerMove(e){if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,position(e));const pts=[...pointers.values()],g=gesture,c=pts.length>1?{x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}:pts[0],dx=c.x-g.center.x,dy=c.y-g.center.y;if(!g.moved&&Math.hypot(dx,dy)<(e.pointerType==='touch'?8:4))return;g.moved=true;state.fitMode=null;$('viewport').classList.add('dragging');try{$('viewport').setPointerCapture(e.pointerId);}catch{}
 if(pts.length>1){const dist=Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)),w=E.clamp(g.camera.w*g.distance/dist,.6,1500),h=w*state.height/state.width;state.camera={x:g.anchor.x-c.x/state.width*w,y:g.anchor.y-c.y/state.height*h,w,h};}else state.camera={...g.camera,x:g.camera.x-dx/state.width*g.camera.w,y:g.camera.y-dy/state.height*g.camera.h};paintMap();e.preventDefault();}
function onPointerEnd(e){if(!pointers.has(e.pointerId))return;const moved=gesture?.moved;pendingTap=!moved&&e.type==='pointerup'?{pos:position(e),time:performance.now()}:null;pointers.delete(e.pointerId);if(moved)ignoreClickUntil=performance.now()+350;if($('viewport').hasPointerCapture?.(e.pointerId))$('viewport').releasePointerCapture(e.pointerId);if(pointers.size)beginGesture(Boolean(moved));else{gesture=null;$('viewport').classList.remove('dragging');}}
function closestPin(pos){let nearest=null,dist=27;for(const p of state.pins){if(p.el.hidden||p.global&&p.el.style.pointerEvents==='none')continue;const x=parseFloat(p.el.style.left)-pos.x,y=parseFloat(p.el.style.top)-pos.y,n=Math.hypot(x,y);if(n<dist){dist=n;nearest=p.el;}}return nearest;}

function fitDay(){state.fitMode='day';stopPlayback();const ids=new Set(result.steps.filter(s=>s.day===state.day).map(s=>s.poi));animateView(fit(region().points.filter(p=>ids.has(p.id)&&p.type!=='origin').map(p=>p.coord),.25,3));}
function goNational(){state.fitMode='national';stopPlayback();setPane('map');animateView(fit(region().points.filter(p=>p.type==='origin'||result.steps.some(s=>s.poi===p.id)).map(p=>p.coord),.15,8));}
function resizeMap(width,height){
 if(width<=0||height<=0)return;clearGesture();const v=state.tween?.to||state.camera;state.width=width;state.height=height;state.tween=null;
 const resized=c=>({x:c.x,y:c.y+c.h/2-c.w*height/width/2,w:c.w,h:c.w*height/width});state.camera=resized(v);
 if(state.fitMode&&!state.playback){
  const ids=new Set(result.steps.filter(s=>state.fitMode!=='day'||s.day===state.day).map(s=>s.poi));
  const coords=region().points.filter(p=>state.fitMode==='all'?p.type!=='origin':state.fitMode==='national'?p.type==='origin'||ids.has(p.id):p.type!=='origin'&&ids.has(p.id)).map(p=>p.coord);
  state.camera=fit(coords,state.fitMode==='day'?.25:state.fitMode==='national'?.15:.18,state.fitMode==='national'?8:3);
 }
 if(state.playback?.leg)state.playback.leg.startCamera=resized(state.playback.leg.startCamera);paintMap();
}
function setupMap(){
 $('viewport').addEventListener('pointerdown',onPointerDown);
 window.addEventListener('pointermove',onPointerMove,{passive:false});window.addEventListener('pointerup',onPointerEnd);window.addEventListener('pointercancel',onPointerEnd);
 $('viewport').addEventListener('lostpointercapture',e=>{if(e.target===$('viewport'))onPointerEnd(e);});
 window.addEventListener('blur',()=>{clearGesture();pauseMap();});
 $('viewport').addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?state.height:1);zoom(Math.exp(E.clamp(delta*.0035,-.55,.55)),position(e),90);},{passive:false});
 $('viewport').addEventListener('click',e=>{if(e.target.closest('.map-buttons,a')||performance.now()<ignoreClickUntil)return;let b=e.target.closest('[data-pin]');if(pendingTap&&performance.now()-pendingTap.time<700)b=closestPin(pendingTap.pos)||b;pendingTap=null;if(b)openDetail(b.dataset.pin);});
 $('zoomIn').onclick=()=>zoom(.58);$('zoomOut').onclick=()=>zoom(1/.58);$('resetView').onclick=fitSelected;
 new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;resizeMap(width,height);}).observe($('viewport'));
 state.fitMode='all';const rect=$('viewport').getBoundingClientRect();state.width=rect.width||600;state.height=rect.height||650;state.camera=fit(region().points.filter(p=>p.type!=='origin').map(p=>p.coord),.18,3);
 requestAnimationFrame(tick);
}
