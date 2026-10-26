// Interaction regressions at responsive breakpoints. No browser layout is simulated.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const DATA=require('./data.json'),E=require('./engine.js');
const source=fs.readFileSync('ui.js','utf8');
const nodes=new Map(),events={};let width=390,checks=0;
const classes=()=>{const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}};
function el(id){if(!nodes.has(id))nodes.set(id,{id,tagName:'DIV',innerHTML:'',textContent:'',value:'',dataset:{},style:{setProperty(k,v){this[k]=v}},attrs:{},hidden:false,open:false,scrollLeft:0,scrollTop:0,scrollWidth:1440,clientWidth:600,classList:classes(),
 setAttribute(k,v){this.attrs[k]=String(v)},removeAttribute(k){delete this.attrs[k]},getAttribute(k){return this.attrs[k]},getBoundingClientRect(){return{left:0,top:0,right:600,bottom:400,width:600,height:400}},addEventListener(){},focus(){doc.activeElement=this},showModal(){this.open=true},close(){this.open=false},closest(){return{scrollIntoView(){}}},querySelectorAll(){return[]}});return nodes.get(id)}
const doc={getElementById:el,activeElement:{tagName:'BODY'},documentElement:el('html'),addEventListener(k,f){(events[k]??=[]).push(f)},querySelectorAll(){return[]}};
const win={innerHeight:844,visualViewport:{height:844,offsetTop:0,scale:1},addEventListener(){}};
el('travelData').textContent=JSON.stringify(DATA);el('embeddedPlans').textContent='{}';
const context={TripEngine:E,document:doc,window:win,localStorage:{getItem:()=>null,setItem(){}},matchMedia:q=>({matches:q.includes('max-width')&&width<=Number(q.match(/\d+/)[0])}),performance:{now:()=>1000},location:{hash:''},requestAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},Map,Set};
vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('new ResizeObserver(')),context);
vm.runInContext('renderRegions=()=>{};renderPins=()=>{};renderRoutes=()=>{};paintMap=()=>{};',context);
const run=c=>vm.runInContext(c,context),check=(v,m)=>{assert(v,m);checks++};
const sizes=[[320,568],[360,640],[390,844],[430,932],[600,960],[768,1024],[820,1180],[900,600],[1024,768],[1366,768],[1920,1080],[740,360]];
for(const [w,h] of sizes){
 width=w;win.innerHeight=h;win.visualViewport.height=h;context.syncVisibleViewport();
 check(el('html').style['--visible-height']===h+'px','visible height follows viewport');
 for(const r of DATA)for(let c=0;c<r.courses.length;c++){
  run(`selectRegion(${JSON.stringify(r.id)},${c},false)`);
  context.setPlannerView('timeline');context.setPane('schedule');
  check(run('state.pane')==='schedule'&&el('pane-schedule').attrs['aria-pressed']==='true','schedule tab is selectable');
  check(el('planner').innerHTML.includes('data-action="add-place"'),'schedule retains add control');
  if(w<=900)check(el('planner').innerHTML.includes('planner-extra'),'compact schedule exposes full visit list alongside timeline');
  context.setPlannerView('sequence');
  if(w<=900&&run('plan().items[state.day].length'))check(el('planner').innerHTML.includes('sequence-list vertical'),'compact visits use vertical cards');
  const uid=run('plan().items[0][0]?.uid');
  if(uid){
   const old=run('plan().items[0][0].duration');context.adjustDuration(uid,10);
   check(run('plan().items[0][0].duration')===Math.min(720,old+10),'inline duration edit survives responsive rendering');
   context.historyStep();check(run('plan().items[0][0].duration')===old,'undo restores edited duration');
   context.moveStop(uid,1,0);check(run('plan().items[1][0].uid')===uid,'move between dates');
   context.historyStep();check(run('plan().items[0][0].uid')===uid,'undo move');
  }
  context.setPane('places');check(!run('state.playing'),'hidden map is paused');
  context.togglePlay();check(run('state.pane')==='map','playback opens the map from any pane');context.stopPlayback();
 }
}
width=1440;run('selectRegion("yeosu-suncheon",0,false);state.plannerExpanded=true;renderPlanner();');
const snapshot=run('JSON.stringify(plan())');
width=390;context.syncWorkspace();
check(run('state.pane')==='schedule'&&!run('state.plannerExpanded'),'desktop expansion becomes a compact schedule pane');
check(run('JSON.stringify(plan())')===snapshot,'rotation preserves the entire plan');
context.togglePlanner();check(run('state.pane')==='map','compact collapse returns to map');
context.setPlannerView('timeline');check(run('state.pane')==='schedule','compact dock opens timeline in schedule pane');
context.openRegions();check(el('main').inert&&el('appHeader').inert,'drawer prevents focus behind it');
check(doc.activeElement===el('closeRegions'),'drawer moves focus inside');
el('sidebar').querySelectorAll=()=>[el('closeRegions'),el('lastRegion')];
doc.activeElement=el('lastRegion');let prevented=false;
for(const f of events.keydown)f({key:'Tab',target:{closest:()=>null},preventDefault(){prevented=true}});
check(prevented&&doc.activeElement===el('closeRegions'),'drawer keyboard focus wraps');
context.closeRegions();check(!el('main').inert&&!el('appHeader').inert&&doc.activeElement===el('openRegions'),'drawer restores focus and interactivity');
context.openRegions();width=1366;context.syncWorkspace();check(!el('sidebar').classList.contains('open')&&!el('main').inert,'wide layout clears drawer overlay');
width=390;win.visualViewport.height=310;win.visualViewport.offsetTop=24;context.syncVisibleViewport();
check(el('html').style['--visible-height']==='310px'&&el('html').style['--viewport-top']==='24px','keyboard-visible height and offset are applied');
win.visualViewport.scale=2;win.visualViewport.height=155;context.syncVisibleViewport();check(el('html').style['--visible-height']==='310px','pinch zoom does not collapse layout');
// An active search input must not be replaced on every keystroke or IME composition.
context.openPlacePicker();const results=el('pickerResults');el('dialogBody').querySelector=s=>s==='.picker-results'?results:null;
const before=el('dialogBody').innerHTML;
const input={id:'pickerSearch',value:'여수'};
for(const f of events.input)f({target:input,isComposing:true});
check(run('state.pickerQuery')==='','IME composition is not interrupted');
for(const f of events.compositionend)f({target:input});
check(run('state.pickerQuery')==='여수'&&results.innerHTML.includes('여수'),'completed Korean search updates results');
check(el('dialogBody').innerHTML===before,'search preserves input node and keyboard focus');
input.value='unlikely-no-matching-place';for(const f of events.input)f({target:input,isComposing:false});
check(results.innerHTML.includes('조건에 맞는 장소가 없습니다.'),'empty search is explained');
console.log(`${checks} responsive interaction checks passed for ${sizes.length} viewport configurations and all 4 courses. Browser geometry and physical devices NOT verified.`);
