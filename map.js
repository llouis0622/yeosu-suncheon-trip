/* Leaflet 1.9.4 + on-demand OSM tiles. Lines show visit order, not road navigation. */
let travelMap, tileLayer, markerLayer, routeLayer, mapMarkers=[],playMarker=null,playFrame=0,playLast=0,playElapsed=0,playEdgesList=[],playIndex=0,resizeFrame=0;
const latlng=p=>[p.coord[1],p.coord[0]];
const DAY_COLORS=['#c05a17','#2264ae','#803ca0'];
function mapCoordinates(mode){
 const ids=new Set(result.steps.filter(s=>mode!=='day'||s.day===state.day).map(s=>s.poi));
 return region().points.filter(p=>mode==='all'?p.type!=='origin':mode==='national'?ids.has(p.id):p.type!=='origin'&&ids.has(p.id)).map(latlng);
}
function fitMap(mode='all',animate=true){
 if(!travelMap)return;state.fitMode=mode;const coords=mapCoordinates(mode);if(!coords.length)return;
 travelMap.fitBounds(coords,{paddingTopLeft:[30,65],paddingBottomRight:[30,100],maxZoom:mode==='national'?10:14,animate:animate&&!motion.matches});
}
function fitSelected(){stopPlayback();fitMap('all');}
function fitDay(){stopPlayback();fitMap('day');}
function goNational(){stopPlayback();setPane('map');requestAnimationFrame(()=>{travelMap.invalidateSize();fitMap('national');});}
function focusMap(p){pauseMap();state.fitMode=null;if(travelMap)travelMap.setView(latlng(p),Math.max(travelMap.getZoom(),15),{animate:!motion.matches});}
function renderPins(){
 if(!markerLayer)return;markerLayer.clearLayers();mapMarkers=[];
 const selected=new Set(result.steps.map(s=>s.poi));
 const order=[...new Set(result.steps.filter(s=>state.routeDay===null||s.day===state.day).map(s=>s.poi))];
 for(const p of region().points){
  const used=selected.has(p.id),n=order.indexOf(p.id),color=p.type==='hotel'?'#734789':used?'#b44a10':p.type==='food'?'#465f75':p.type==='cafe'?'#716485':'#5c6873';
  const html=`<button class="place-pin ${used?'selected':'pin-candidate'}" data-pin="${p.id}" data-type="${p.type}" aria-label="${esc(p.name)} · ${used?'내 일정':'후보 장소'}" style="--pin-color:${color}"><span class="place-dot">${n>=0?n+1:''}</span><span class="place-label">${esc(p.name)}</span></button>`;
  const marker=L.marker(latlng(p),{icon:L.divIcon({className:'place-marker',html,iconSize:[28,28],iconAnchor:[14,14]}),keyboard:false,zIndexOffset:used?500:0}).addTo(markerLayer);
  marker.on('click',()=>openDetail(p.id));mapMarkers.push({p,marker,used});
 }
 updateLabels();
}
function updateLabels(){
 if(!travelMap)return;const seen=[],size=travelMap.getSize();
 for(const x of [...mapMarkers].sort((a,b)=>Number(b.used)-Number(a.used))){
  const button=x.marker.getElement()?.querySelector('button'),label=button?.querySelector('.place-label');if(!label)continue;
  const p=travelMap.latLngToContainerPoint(latlng(x.p)),w=Math.min(170,x.p.name.length*10+14),box={x:p.x+18,y:p.y-12,w,h:24};
  const inside=box.x>4&&box.x+w<size.x-4&&box.y>45&&box.y+24<size.y-75;
  const crowded=seen.some(b=>box.x<b.x+b.w+5&&box.x+box.w+5>b.x&&box.y<b.y+b.h+4&&box.y+box.h+4>b.y);
  label.style.visibility=inside&&!crowded?'visible':'hidden';if(inside&&!crowded)seen.push(box);
 }
}
function renderRoutes(){
 if(!routeLayer)return;routeLayer.clearLayers();
 result.edges.forEach((e,i)=>{
  const a=point(e.from),b=point(e.to);if(!a||!b)return;
  const active=state.routeDay===null||e.day===state.routeDay,color=DAY_COLORS[e.day];
  const line=L.polyline([latlng(a),latlng(b)],{color,weight:active?4:2,opacity:active?.85:.18,dashArray:active?'9 7':null,interactive:false,className:active?'trip-route active-route':'trip-route'}).addTo(routeLayer);
  const el=line.getElement();if(el){el.dataset.routeFrom=e.from;el.dataset.routeTo=e.to;el.dataset.routeDay=e.day;}
  if(active){
   const angle=Math.atan2(-(b.coord[1]-a.coord[1]),(b.coord[0]-a.coord[0])*Math.cos((a.coord[1]+b.coord[1])/2*Math.PI/180))*180/Math.PI;
   for(const f of [.35,.7])L.marker([a.coord[1]+(b.coord[1]-a.coord[1])*f,a.coord[0]+(b.coord[0]-a.coord[0])*f],{interactive:false,keyboard:false,icon:L.divIcon({className:'route-arrow',iconSize:[16,16],iconAnchor:[8,8],html:`<span style="color:${color};transform:rotate(${angle}deg)">➤</span>`})}).addTo(routeLayer);
  }
 });
}
function updatePlaybackControls(){
 const active=state.playing,started=playEdgesList.length>0;
 const b=$('mapPlay');if(b){b.textContent=active?'Ⅱ 일시정지':started?'▶ 이어 재생':'▶ 일정 시작';b.setAttribute('aria-label',active?'일시정지':started?'이어 재생':'일정 시작');b.setAttribute('aria-pressed',String(active));}
 $('skipArrival').hidden=state.playbackKind!=='arrival';$('arrivalReplay').hidden=state.playbackKind==='arrival';
}
function clearGesture(){/* Leaflet owns map gestures and pointer cancellation. */}
function pauseMap(){state.playing=false;cancelAnimationFrame(playFrame);playLast=0;if($('playCaption'))$('playCaption').hidden=true;updatePlaybackControls();}
function stopPlayback(){pauseMap();playEdgesList=[];playIndex=0;playElapsed=0;state.playbackKind=null;if(playMarker){playMarker.remove();playMarker=null;}updatePlaybackControls();}
function showPlayCaption(){const e=playEdgesList[playIndex];if(!e)return;const a=point(e.from),b=point(e.to);$('playCaption').hidden=false;$('playCaption').innerHTML=`<small>${E.date(e.day)} · ${MODES[e.mode]} 약 ${e.minutes}분</small><b>${esc(a.name)} → ${esc(b.name)}</b><p>방문 순서 미리보기 · 실제 길찾기는 네이버지도</p>`;}
function playTick(t){
 if(!state.playing)return;if(playLast)playElapsed+=Math.min(t-playLast,100);playLast=t;
 const e=playEdgesList[playIndex];if(!e){stopPlayback();return;}
 const a=point(e.from),b=point(e.to),f=Math.min(1,playElapsed/2200);
 playMarker.setLatLng([a.coord[1]+(b.coord[1]-a.coord[1])*f,a.coord[0]+(b.coord[0]-a.coord[0])*f]);
 if(f===1){playIndex++;playElapsed=0;showPlayCaption();}
 playFrame=requestAnimationFrame(playTick);
}
function startPlayback(kind,edges){
 stopPlayback();if(!edges.length)return;setPane('map');state.fitMode=null;state.playbackKind=kind;playEdgesList=edges;
 requestAnimationFrame(()=>{
  if(state.playbackKind!==kind||playEdgesList!==edges)return;travelMap.invalidateSize();travelMap.fitBounds(edges.flatMap(e=>[latlng(point(e.from)),latlng(point(e.to))]),{paddingTopLeft:[35,65],paddingBottomRight:[35,110],maxZoom:14,animate:false});
  state.playing=true;playMarker=L.marker(latlng(point(edges[0].from)),{interactive:false,keyboard:false,zIndexOffset:2000,icon:L.divIcon({className:'traveler',html:'●',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(travelMap);
  showPlayCaption();updatePlaybackControls();playFrame=requestAnimationFrame(playTick);
 });
}
function startArrival(){startPlayback('arrival',result.edges.filter(e=>e.day===0).slice(0,2));}
function togglePlay(){if(state.playing){pauseMap();return;}if(playEdgesList.length){state.playing=true;showPlayCaption();updatePlaybackControls();playFrame=requestAnimationFrame(playTick);return;}startPlayback('day',result.edges.filter(e=>e.day===state.day));}
function resizeMap(){
 cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!travelMap||!$('mapCanvas').clientWidth||!$('mapCanvas').clientHeight)return;travelMap.invalidateSize({pan:false});if(state.fitMode&&!state.playing)fitMap(state.fitMode,false);updateLabels();});
}
function setupMap(){
 travelMap=L.map('mapCanvas',{zoomControl:false,attributionControl:true,minZoom:2,maxZoom:18,zoomSnap:.25,zoomDelta:1,worldCopyJump:true,scrollWheelZoom:true});
 travelMap.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
 const test=new URLSearchParams(location.search).get('trip-test')==='1';
 if(!test){
  tileLayer=L.tileLayer(region().map.tileUrl,{minZoom:2,maxZoom:18,noWrap:false,keepBuffer:1,updateWhenIdle:true,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Tiles <a href="https://www.openstreetmap.fr/">OSM France</a> · <a href="https://www.hotosm.org/">HOT</a>'}).addTo(travelMap);
  let failed=0,loaded=0;$('mapCanvas').dataset.tiles='loading';
  tileLayer.on('tileerror',()=>{failed++;$('mapCanvas').dataset.tiles='error';$('mapNotice').hidden=false;});
  tileLayer.on('tileload',()=>{loaded++;if(!failed){$('mapCanvas').dataset.tiles='ready';$('mapNotice').hidden=true;}});
  $('retryMap').onclick=()=>{failed=loaded=0;$('mapNotice').hidden=true;$('mapCanvas').dataset.tiles='loading';tileLayer.redraw();};
 }else{$('mapCanvas').dataset.tiles='test';travelMap.attributionControl.addAttribution('OpenStreetMap · QA: 외부 타일 요청 제외');}
 markerLayer=L.layerGroup().addTo(travelMap);routeLayer=L.layerGroup().addTo(travelMap);
 travelMap.on('moveend zoomend resize',updateLabels);
 travelMap.on('dragstart',()=>{state.fitMode=null;pauseMap();});
 $('mapCanvas').addEventListener('wheel',()=>{state.fitMode=null;pauseMap();},{passive:true});
 travelMap.on('zoomstart',()=>{if(!state.fitMode)pauseMap();});
 $('zoomIn').onclick=()=>{state.fitMode=null;pauseMap();travelMap.zoomIn();};$('zoomOut').onclick=()=>{state.fitMode=null;pauseMap();travelMap.zoomOut();};$('resetView').onclick=fitSelected;
 new ResizeObserver(resizeMap).observe($('mapCanvas'));fitMap('all',false);
}
