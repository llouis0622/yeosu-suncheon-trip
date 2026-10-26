// Exercise the shipped animation loop with deterministic frame times.
// These checks cover camera/state behavior, not browser layout or physical devices.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('ui.js','utf8'),DATA=require('./data.json'),E=require('./engine.js');
let now=1000,checks=0,scrolled=0;
const elements=new Map();
function element(id){
 if(!elements.has(id))elements.set(id,{id,hidden:false,style:{},dataset:{},attrs:{},textContent:'',innerHTML:'',scrollTop:0,
  setAttribute(k,v){this.attrs[k]=v;},classList:{add(){},remove(){}},closest(){return {scrollIntoView(){scrolled++;}};}});
 return elements.get(id);
}
element('travelData').textContent=JSON.stringify(DATA);element('embeddedPlans').textContent='{}';
const context={TripEngine:E,document:{getElementById:element},localStorage:{getItem:()=>null,setItem(){}},
 matchMedia:()=>({matches:false}),performance:{now:()=>now},location:{hash:''},requestAnimationFrame(){},
 setTimeout:()=>1,clearTimeout(){},Map,Set};
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf("$('viewport').addEventListener('pointerdown'")),context);
vm.runInContext(source.slice(source.indexOf('function resizeMap('),source.indexOf('new ResizeObserver(')),context);
vm.runInContext('for(const name of ["cancelTimeline","renderHeader","renderRegions","renderCourseBar","renderCandidatePanel","renderPlanner","renderPins","updatePins","closeRegions"])this[name]=()=>{};',context);
const run=code=>vm.runInContext(code,context);
const check=(value,message)=>{assert(value,message);checks++;};
function frames(ms){for(let elapsed=0;elapsed<ms;elapsed+=25){now+=25;context.tick(now);}}
const camera=()=>run('({...state.camera})');
const center=v=>({x:v.x+v.w/2,y:v.y+v.h*.46});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function select(id,preview=true){run(`selectRegion(${JSON.stringify(id)},0,${preview})`);}

// The nationwide overview has stronger persistent lines and several moving chevrons.
run('state.region=null;state.camera=nationalView();renderRoutes();paintFlow();');
check(run('state.flows.length')===1,'all regional departure routes remain visible');
check(run('state.flows.every(e=>e.kind==="national"&&e.arrows.length===3)'),'each regional route has three flow arrows');
check(element('routeLayer').innerHTML.includes('stroke-opacity="0.46"'),'national lines are clearly stronger than the former 0.15 opacity');
check(run('state.flows.some(e=>e.arrows.some(a=>Number(a.style.opacity)>.6))'),'moving arrows retain visible opacity');

// For each aspect ratio, selecting a region travels from Busan and the camera
// stays with the arrow throughout the trip rather than fitting both endpoints once.
for(const [width,height] of [[900,520],[760,360],[600,520],[366,310]]){
 run(`state.width=${width};state.height=${height};state.camera=nationalView();`);
 select('yeosu-suncheon');
 check(run('state.playing&&state.playback.kind==="arrival"'),'region selection starts departure playback');
 check(run('state.playback.edges[0].from==="busan"'),'departure starts in Busan');
 frames(650);let before=center(camera());
 for(let i=0;i<4;i++){
  frames(700);const current=center(camera()),position=run('curvePoint(state.playback.leg.curve,state.playback.leg.progress)');
  check(distance(before,current)>1,'camera continuously advances during a leg');
  check(distance(current,position)<1e-8,'moving arrow stays in the camera focus area');
  check(Math.abs(camera().w/camera().h-width/height)<1e-8,'camera preserves the map aspect ratio');
  before=current;
 }
 frames(2500);
 check(run('!state.playing&&state.playback===null'),'arrival preview completes without starting an unwanted local tour');
 const expected=run('fit(region().points.filter(p=>p.type!=="transit").map(p=>p.coord),.18,3)');
 check(distance(center(camera()),center(expected))<1e-8,'arrival ends with all regional candidates framed');
 check(element('mapPlay').textContent==='▶ 일정 시작','map provides a local itinerary start button after arrival');
}

// Recommended and edited itineraries use the current day and current ordering.
select('yeosu-suncheon',false);run('state.day=1;togglePlay();');
check(run('state.playback.kind==="day"&&state.playback.edges.every(e=>e.day===1)'),'day playback uses the selected day');
frames(700);const first=center(camera());frames(1100);
check(distance(first,center(camera()))>.01,'local route playback moves the camera within a leg');
const pauseElapsed=run('state.elapsed'),pauseCamera=camera();context.togglePlay();frames(900);
check(!run('state.playing')&&run('state.elapsed')===pauseElapsed,'pause freezes route progress');
check(distance(center(camera()),center(pauseCamera))<1e-8,'pause freezes the follow camera');
run('state.camera.x+=30;togglePlay();');frames(400);
check(run('state.playing&&state.elapsed')===pauseElapsed,'resume recenters smoothly without skipping route progress');
frames(600);check(run('state.elapsed')>pauseElapsed,'resume continues from the paused position');
run('mutate(p=>p.items[1].reverse());');
check(run('state.playback===null&&!state.playing'),'editing invalidates the old playback queue');
run('togglePlay();');
check(run('JSON.stringify(state.playback.edges)===JSON.stringify(result.edges.filter(e=>e.day===state.day&&e.from!==e.to))'),'edited route playback uses the newly scheduled order');
run('stopPlayback();state.day=1;state.fromPoint=null;');
const selected=run('result.edges.find(e=>e.day===1&&point(e.from).type!=="transit").from');
context.togglePlay(selected);
check(run('state.playback.edges[0].from')===selected,'play from selected point starts from that point');
const reserve=run('region().points.find(p=>p.type==="cafe"&&!result.edges.some(e=>e.day===1&&e.from===p.id)).id');
context.togglePlay(reserve);
check(run('state.playback.edges[0].from')===reserve,'a candidate outside the itinerary can also start a preview');
check(run('Number.isFinite(state.playback.edges[0].minutes)'),'candidate preview computes its own travel time');
context.changeCourse(1);
check(run('state.playback===null&&!state.playing'),'course switching cancels the previous route');
select('yeosu-suncheon');
check(run('state.playback.kind==="arrival"&&state.playback.edges[0].to===result.edges[0].to'),'switching regions replaces the departure preview');
context.goNational();
check(run('!state.playing&&state.playback===null'),'overview stops playback');

// Orientation changes during departure, local playback, and resume preserve aspect/focus.
select('yeosu-suncheon');frames(150);context.resizeMap(720,340);frames(100);
check(Math.abs(camera().w/camera().h-720/340)<1e-8,'resize during the initial camera transition preserves aspect');
frames(900);context.resizeMap(366,500);frames(25);
check(Math.abs(camera().w/camera().h-366/500)<1e-8,'portrait resize during movement preserves aspect');
check(distance(center(camera()),run('curvePoint(state.playback.leg.curve,state.playback.leg.progress)'))<1e-8,'orientation change keeps the marker in focus');
context.pauseMap();run('state.camera.x+=20;togglePlay();');frames(100);context.resizeMap(1000,520);frames(100);
check(Math.abs(camera().w/camera().h-1000/520)<1e-8,'resize while resuming preserves aspect');
context.stopPlayback();

// All routes, all days, including Friday and the return to the correct Busan hub.
let routes=0;
for(const d of DATA)for(let ci=0;ci<d.courses.length;ci++){
 run(`selectRegion(${JSON.stringify(d.id)},${ci},false);refresh();`);
 for(const day of [0,1,2]){
  run(`stopPlayback();state.day=${day};togglePlay();`);
  const expected=run('playEdges().length');let completed=0;
  while(run('state.playing')){
   const index=run('state.playIndex');
   check(run('Number.isFinite(state.playback.leg.curve.p.x)&&Number.isFinite(state.playback.leg.curve.q.y)'),'route points have finite coordinates');
   run('state.elapsed=1200;');frames(25);
   const position=run('curvePoint(state.playback.leg.curve,state.playback.leg.progress)');
   check(distance(center(camera()),position)<1e-7,'every route segment follows its moving marker');
   run('state.elapsed=500+state.playback.leg.duration+550;');frames(25);completed++;
   check(!run('state.playing')||run('state.playIndex')===index+1,'playback advances exactly one segment');
   assert(completed<100,'playback must terminate');
  }
  check(completed===expected,'each selected day completes all its scheduled legs');routes++;
 }
}
check(scrolled>0,'starting playback brings the map into view');
console.log(`${checks} playback checks passed across ${routes} recommended route/day combinations and 4 map sizes. No browser rendering or physical device test performed.`);
