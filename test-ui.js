// Executes the shipped event handlers and scheduling state with a lightweight DOM fixture.
// This validates interaction logic, not rendered geometry or real touch hardware.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('ui.js','utf8'),DATA=require('./data.json'),E=require('./engine.js');
const nodes=new Map(),listeners={},windowListeners={};let checks=0,clock=1000;
const classList=()=>{const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}};
function el(id){if(!nodes.has(id))nodes.set(id,{id,tagName:'DIV',innerHTML:'',textContent:'',value:'',dataset:{},style:{},attrs:{},hidden:false,open:false,scrollLeft:0,scrollTop:0,scrollWidth:1440,clientWidth:600,classList:classList(),children:[],
 setAttribute(k,v){this.attrs[k]=String(v)},removeAttribute(k){delete this.attrs[k]},getBoundingClientRect(){return{left:0,top:0,right:600,bottom:400,width:600,height:400}},addEventListener(){},focus(){doc.activeElement=this},showModal(){this.open=true},close(){this.open=false},closest(){return{scrollIntoView(){}}},querySelectorAll(){return[]},setSelectionRange(){}});return nodes.get(id)}
const doc={getElementById:el,activeElement:{tagName:'BODY',dataset:{}},addEventListener(type,fn){(listeners[type]??=[]).push(fn)},querySelectorAll(){return[]},hidden:false};
el('travelData').textContent=JSON.stringify(DATA);el('embeddedPlans').textContent='{}';
const context={TripEngine:E,document:doc,window:{addEventListener(type,fn){(windowListeners[type]??=[]).push(fn)}},localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),performance:{now:()=>clock},location:{hash:''},requestAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},Map,Set};
vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('new ResizeObserver(')),context);
vm.runInContext('for(const name of ["renderPins","renderRoutes","updatePins","closeRegions"])this[name]=()=>{};',context);
const run=s=>vm.runInContext(s,context),snap=()=>run('JSON.stringify(plan())'),check=(v,m)=>{assert(v,m);checks++};
function target(data={},id='',value=''){const t={id,value,dataset:data,tagName:'BUTTON',classList:classList(),closest(sel){for(const selector of sel.split(',')){const m=selector.trim().match(/^\[data-([\w-]+)\]$/);if(m){const k=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());if(k in data)return t;}}return null}};return t;}
function click(data){const t=target(data);for(const fn of listeners.click||[])fn({target:t,clientX:0,clientY:0,preventDefault(){}})}
function change(id,value){const t=target({},id,value);for(const fn of listeners.change||[])fn({target:t})}
function key(k,extra={}){let prevented=false;for(const fn of listeners.keydown||[])fn({key:k,code:'',target:target(),preventDefault(){prevented=true},...extra});return prevented}
const uid=()=>run('plan().items[state.day][0]?.uid'),select=(id,c=0)=>run(`selectRegion(${JSON.stringify(id)},${c},false);undo=[];redo=[];`);
const fragments=[];
for(const r of DATA)for(let c=0;c<r.courses.length;c++){
 select(r.id,c);if(!run('plan().items[0].length'))context.addPoint(r.points.find(p=>p.type==='cafe').id,0);const before=snap(),n=run('plan().items[0].length'),candidate=r.points.find(p=>!['hotel','transit'].includes(p.type));
 click({action:'add-place'});check(el('dialog').open&&el('dialog').dataset.kind==='place-picker','add button opens picker');
 fragments.push({name:r.id+'/'+c+'/picker',html:el('dialogBody').innerHTML});const beforeUid=uid();change('pickerBefore',beforeUid);click({pick:candidate.id});const added=run('state.editUid');
 check(run('plan().items[0][0].uid')===added,'picker inserts before a specified visit');
 check(run('plan().items[0].length')===n+1,'insertion preserves existing visits');
 check(el('dialogBody').innerHTML.includes('이 날짜에 포함'),'picker immediately reflects additions');el('dialog').close();
 const duration=run('findItem(state.editUid).item.duration');click({resizeStop:added,delta:'10'});
 check(run('findItem(state.editUid).item.duration')===duration+10,'duration increase from card');
 click({resizeStop:added,delta:'-10'});check(run('findItem(state.editUid).item.duration')===duration,'duration decrease from card');
 click({shiftStop:added,delta:'1'});check(run('findItem(state.editUid).index')===1,'card arrow reorders');
 check(run('result.days[0].blocks.filter(b=>b.kind==="visit")[1].uid')===added,'schedule uses reordered visits');
 click({relocate:added});el('moveDay').value='1';change('moveDay','1');el('movePosition').value='0';click({action:'apply-move'});
 check(run('findItem(state.editUid).day')===1&&run('findItem(state.editUid).index')===0,'move dialog changes date and position');
 check(!el('dialog').open&&run('state.day')===1,'move opens target date and closes dialog');
 const moved=snap();click({removeStop:added});check(!run(`findItem(${JSON.stringify(added)})`),'delete removes correct occurrence');
 click({action:'undo'});check(snap()===moved,'undo restores exact item settings and order');
 click({action:'redo'});check(!run(`findItem(${JSON.stringify(added)})`),'redo deletes same occurrence');
 click({action:'undo'});click({resizeStop:added,delta:'10'});check(run('redo.length')===0,'new edit clears redo branch');
 for(let day=0;day<3;day++){run(`state.day=${day};renderPlanner();`);fragments.push({name:r.id+'/'+c+'/day'+day,html:el('planner').innerHTML});check(el('planner').innerHTML.includes('data-planner-view="sequence"'),'visit order view is always accessible');check(el('planner').innerHTML.includes('id="timeCanvas"'),'24h timeline remains available');}
 // Preserve generated fragments for independent HTML structure validation.
 fragments.push({name:r.id+'/'+c,html:el('planner').innerHTML});
 click({plannerView:'sequence'});fragments.push({name:r.id+'/'+c+'/sequence',html:el('planner').innerHTML});check(run('state.plannerView')==='sequence','view switch selects editable sequence');
 click({plannerView:'timeline'});click({action:'expand-planner'});check(run('state.plannerExpanded'),'expand works');click({action:'expand-planner'});
 run('result=E.schedule(region(),plan());');for(const day of run('result.days'))for(let i=1;i<day.blocks.length;i++)check(day.blocks[i].start>=day.blocks[i-1].end,'edited blocks remain chronological');
}

select('yeosu-suncheon');
click({city:'순천'});check(run('visiblePoints().every(p=>p.city==="순천")'),'city filter restricts list');
click({category:'hotel'});check(run('visiblePoints().length')===12,'all 12 lodging candidates visible');
change('stayKind','spa');check(run('visiblePoints().length')===6,'six spa/independent lodgings');
change('stayKind','hotel');check(run('visiblePoints().length')===6,'six hotel choices');
click({city:'all'});click({category:'all'});
const first=uid();context.editSelect(first);change('duration','95');change('legMinutes','37');change('legMode','walk');change('preferredStart','13:15');
check(run('selectedItem().item.duration')===100&&run('selectedItem().item.travel')===40,'manual duration/transfer');
check(run('selectedItem().item.start')===800,'manual start snaps 13:15 to 13:20');
change('editDay','1');check(run('selectedItem().day')===1&&run('selectedItem().item.travel')===40,'move retains manual fields');
click({action:'recommended-duration'});check(run('selectedItem().item.duration===Math.max(10,Math.floor(point(selectedItem().item.poi).visitMin/10)*10)'),'recommendation restored');
const exported=JSON.parse(run('JSON.stringify(plan())'));
const normalized=E.normalizePlan(DATA[0],exported);
check(JSON.stringify(normalized.items.map(a=>a.map(x=>[x.poi,x.duration,x.travel,x.mode,x.start])))===JSON.stringify(exported.items.map(a=>a.map(x=>[x.poi,x.duration,x.travel,x.mode,x.start]))),'export/import preserves editing');
context.openDetail('sc_garden');run('state.day=2;');context.openDetail('sc_garden');check(el('detailBody').innerHTML.includes('휴무'),'closed date appears in detail');
context.openDetail('sc_stay_raum');check(el('detailBody').innerHTML.includes('작동하지'),'bathtub limitation visible');
context.settings();check(el('dialogBody').innerHTML.includes('id="transferDeparture"')&&el('dialogBody').innerHTML.includes('id="luggage"'),'settings expose intercity and luggage controls');
run('state.city="all";state.type="all";state.query="<img src=x onerror=alert(1)>";renderCandidatePanel();');check(!el('candidatePanel').innerHTML.includes('<img src=x'),'search HTML is escaped');
// Share the actual edited plan, including Korean text, then load it through startup.
Object.assign(context,{TextEncoder,TextDecoder,Uint8Array,btoa,atob});
vm.runInContext(source.slice(source.indexOf('async function sharePlan(){')),context);
(async()=>{
 let copied='';
 context.navigator={clipboard:{async writeText(value){copied=value}}};
 Object.assign(context.location,{protocol:'file:',hostname:'',origin:'null',pathname:'/trip.html'});
 await context.sharePlan();check(!copied&&el('importStatus').textContent.includes('배포 후'),'local files guide to file sharing');
 Object.assign(context.location,{protocol:'https:',hostname:'llouis0622.github.io',origin:'https://llouis0622.github.io',pathname:'/yeosu-suncheon-trip/'});
 run('plan().name="우리의 여수 · 순천 여행";');
 const sharedPlan=snap();await context.sharePlan();
 check(copied.startsWith('https://llouis0622.github.io/yeosu-suncheon-trip/#yeosu-suncheon/0~'),'share links retain project subpath');
 context.location.hash=copied.slice(copied.indexOf('#'));
 context.history={replaceState(_s,_t,url){context.location.hash=url.slice(url.indexOf('#'))}};
 run('saved={};');
 const importStart=source.indexOf('try{const encoded=location.hash');
 vm.runInContext(source.slice(importStart,source.indexOf('\nconst region=',importStart)),context);
 const reloaded=JSON.parse(snap()),expected=JSON.parse(sharedPlan);
 check(reloaded.name===expected.name,'shared UTF-8 title survives');
 check(JSON.stringify(reloaded.items.map(d=>d.map(x=>[x.poi,x.duration,x.start,x.mode,x.travel])))===JSON.stringify(expected.items.map(d=>d.map(x=>[x.poi,x.duration,x.start,x.mode,x.travel]))),'shared plan retains date/order/duration/manual travel');
 check(context.location.hash==='#yeosu-suncheon/0','shared snapshot hash becomes ordinary navigation after load');
 context.navigator.clipboard.writeText=async()=>{throw Error('clipboard unavailable')};el('shareUrl').select=()=>{};
 await context.sharePlan();check(el('shareUrl').value.includes('~'),'clipboard refusal exposes a selectable link');
 run('plan().name="가".repeat(20000);');copied='';await context.sharePlan();
 check(el('importStatus').textContent.includes('일정이 길어'),'oversize snapshots guide to JSON instead of making broken links');
 console.log(checks+' UI editing/sharing assertions passed. DOM fixture only; pixels/touch not verified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
