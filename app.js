'use strict';
const $=s=>document.querySelector(s),uid=()=>Math.random().toString(36).slice(2,10);
const cv=$('#cv'),cx=cv.getContext('2d');
let db,projects=[],P,tool='select',sel=new Set(),selEdge=null,undo=[],redo=[],bmp=new Map(),busy=0,drag=null,space=false,clip=null,dirty=true,W=0,H=0,saveT,focus=false,idx=new Map(),failed=new Set();
const open=()=>new Promise((ok,no)=>{const r=indexedDB.open('reelmind',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('blobs')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const store=(s,m,f)=>new Promise((ok,no)=>{const t=db.transaction(s,m),q=f(t.objectStore(s));t.oncomplete=()=>ok(q&&q.result);t.onerror=()=>no(t.error)});
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.opacity=1;clearTimeout(t._t);t._t=setTimeout(()=>t.style.opacity=0,2200)};
const reindex=()=>{idx=new Map(P.items.map(i=>[i.id,i]))},byId=id=>idx.get(id),redraw=()=>dirty=true;
function save(){$('#status').textContent='Saving…';clearTimeout(saveT);saveT=setTimeout(async()=>{try{await store('projects','readwrite',s=>s.put(P));$('#status').textContent='Saved'}catch(e){$('#status').textContent='Save failed';toast('Could not save: '+e.message)}},400)}
const snap=()=>{undo.push(JSON.stringify({i:P.items,e:P.edges}));if(undo.length>100)undo.shift();redo=[]};
function restore(s){const o=JSON.parse(s);P.items=o.i;P.edges=o.e;sel.clear();selEdge=null;reindex();redraw();save();lib()}
function doUndo(){if(!undo.length)return;redo.push(JSON.stringify({i:P.items,e:P.edges}));restore(undo.pop())}
function doRedo(){if(!redo.length)return;undo.push(JSON.stringify({i:P.items,e:P.edges}));restore(redo.pop())}
// ---------- projects
const blank=n=>({id:uid(),name:n,items:[],edges:[],view:{x:300,y:200,z:1}});
async function loadAll(){projects=await store('projects','readonly',s=>s.getAll());if(!projects.length){projects=[blank('Film Project 01')];await store('projects','readwrite',s=>s.put(projects[0]))}setP(projects[0])}
function setP(p){P=p;sel.clear();selEdge=null;undo=[];redo=[];bmp.clear();failed.clear();reindex();$('#pname').textContent=p.name;plist();lib();fitIfNew();redraw()}
const fitIfNew=()=>{};
function plist(){const l=$('#plist');l.innerHTML='';projects.forEach(p=>{const d=document.createElement('div');d.textContent=p.name;if(p===P)d.className='cur';d.onclick=()=>{save();setP(p)};l.appendChild(d)})}
$('#pNew').onclick=async()=>{const n=prompt('Project name','Film Project '+String(projects.length+1).padStart(2,'0'));if(!n)return;const p=blank(n);projects.push(p);await store('projects','readwrite',s=>s.put(p));setP(p)};
$('#pRen').onclick=()=>{const n=prompt('Rename project',P.name);if(n){P.name=n;$('#pname').textContent=n;plist();save()}};
$('#pDup').onclick=async()=>{const p=JSON.parse(JSON.stringify(P));p.id=uid();p.name=P.name+' copy';projects.push(p);await store('projects','readwrite',s=>s.put(p));setP(p)};
$('#pDel').onclick=async()=>{if(!confirm('Delete "'+P.name+'" permanently?'))return;await store('projects','readwrite',s=>s.delete(P.id));projects=projects.filter(p=>p!==P);if(!projects.length){projects=[blank('Film Project 01')];await store('projects','readwrite',s=>s.put(projects[0]))}setP(projects[0])};
// ---------- images
async function addFiles(files,at){files=[...files].filter(f=>f.type.startsWith('image/'));if(!files.length)return toast('No image files found');snap();
 const c=at||{x:(W/2-P.view.x)/P.view.z,y:(H/2-P.view.y)/P.view.z},cols=Math.ceil(Math.sqrt(files.length)),x0=c.x-cols*130,y0=c.y-Math.ceil(files.length/cols)*100;let n=0,bad=0;
 const one=async(f,k)=>{try{const b=await createImageBitmap(f,{resizeWidth:384}),id=uid();await store('blobs','readwrite',s=>s.put(f,id));
  const it={id,type:'img',x:x0+(k%cols)*260,y:y0+Math.floor(k/cols)*220,w:240,h:240*b.height/b.width,r:b.height/b.width,name:f.name,notes:'',tags:'',shot:''};bmp.set(id,b);P.items.push(it);sel.add(id)}catch(e){bad++}toast(`Adding images… ${++n}/${files.length}`);redraw()};
 sel.clear();let k=0;const q=files.map((f,i)=>i);await Promise.all([0,1,2,3].map(async()=>{while(k<files.length){const i=k++;await one(files[i],i)}}));
 reindex();save();lib();toast(bad?`Added ${files.length-bad}, ${bad} failed to decode`:`Added ${files.length} images`)}
async function thumb(it){if(bmp.has(it.id)||failed.has(it.id)||busy>=6)return;busy++;try{const b=await store('blobs','readonly',s=>s.get(it.id));if(!b)throw 0;bmp.set(it.id,await createImageBitmap(b,{resizeWidth:384}))}catch(e){failed.add(it.id)}busy--;redraw()}
function lib(){const l=$('#lib'),q=$('#search').value.toLowerCase();l.innerHTML='';P.items.filter(i=>i.type==='img'&&(!q||(i.notes+i.tags+i.shot+i.name).toLowerCase().includes(q))).slice(0,60).forEach(i=>{const im=document.createElement('img');im.title=i.name||'';store('blobs','readonly',s=>s.get(i.id)).then(b=>{if(b){im.src=URL.createObjectURL(b);im.onload=()=>URL.revokeObjectURL(im.src)}});im.onclick=()=>{sel=new Set([i.id]);centerOn(i);redraw()};l.appendChild(im)})}
$('#search').oninput=lib;$('#upBtn').onclick=()=>$('#file').click();$('#file').onchange=e=>{addFiles(e.target.files);e.target.value=''};
// ---------- geometry
const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
function rectEdge(r,t){const c=center(r),dx=t.x-c.x,dy=t.y-c.y,s=Math.min(dx?r.w/2/Math.abs(dx):1e9,dy?r.h/2/Math.abs(dy):1e9);return s>=1?c:{x:c.x+dx*s,y:c.y+dy*s}}
function geom(e){const a=byId(e.a),b=byId(e.b);if(!a||!b)return null;const ca=center(a),cb=center(b),k=e.curve===false?0:.2;const m={x:(ca.x+cb.x)/2-(cb.y-ca.y)*k,y:(ca.y+cb.y)/2+(cb.x-ca.x)*k};return{p0:rectEdge(a,m),p1:rectEdge(b,m),m}}
const bez=(g,t)=>({x:(1-t)**2*g.p0.x+2*(1-t)*t*g.m.x+t*t*g.p1.x,y:(1-t)**2*g.p0.y+2*(1-t)*t*g.m.y+t*t*g.p1.y});
const wp=e=>{const r=cv.getBoundingClientRect(),v=P.view;return{x:(e.clientX-r.left-v.x)/v.z,y:(e.clientY-r.top-v.y)/v.z,sx:e.clientX-r.left,sy:e.clientY-r.top}};
const inR=(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
function hit(p){for(let i=P.items.length-1;i>=0;i--){const it=P.items[i];if(it.type!=='frame'&&inR(p,it))return it}for(let i=P.items.length-1;i>=0;i--){const it=P.items[i];if(it.type==='frame'&&(p.y<it.y+34/P.view.z&&inR(p,it)||sel.has(it.id)&&inR(p,it)))return it}return null}
function hitEdge(p){const tol=8/P.view.z;for(const e of P.edges){const g=geom(e);if(!g)continue;for(let t=0;t<=1;t+=.05){const q=bez(g,t);if(Math.hypot(q.x-p.x,q.y-p.y)<tol)return e}}return null}
function linked(){const s=new Set(sel);let grow=true;while(grow){grow=false;P.edges.forEach(e=>{if(s.has(e.a)&&!s.has(e.b)){s.add(e.b);grow=true}if(s.has(e.b)&&!s.has(e.a)){s.add(e.a);grow=true}})}return s}
// ---------- render
function wrap(c,t,w){const o=[];for(const para of String(t).split('\n')){let l='';for(const wd of para.split(' ')){const n=l?l+' '+wd:wd;if(c.measureText(n).width>w&&l){o.push(l);l=wd}else l=n}o.push(l)}return o}
function draw(c,v,w,h,exp){c.setTransform(1,0,0,1,0,0);c.fillStyle='#0e0f12';c.fillRect(0,0,w,h);
 if(!exp){const g=40*v.z;if(g>7){c.fillStyle='#22242b';const ox=v.x%g,oy=v.y%g;for(let x=ox;x<w;x+=g)for(let y=oy;y<h;y+=g)c.fillRect(x,y,1.5,1.5)}}
 c.setTransform(v.z,0,0,v.z,v.x,v.y);const x0=-v.x/v.z,y0=-v.y/v.z,x1=x0+w/v.z,y1=y0+h/v.z,fs=focus&&sel.size?linked():null,fr=Math.max(1/v.z,1);
 const vis=i=>exp||(i.x<x1&&i.x+i.w>x0&&i.y<y1&&i.y+i.h>y0);
 for(const it of P.items){if(it.type!=='frame'||!vis(it))continue;c.globalAlpha=fs&&!fs.has(it.id)?.3:1;c.fillStyle=it.color+'18';c.strokeStyle=it.color+(sel.has(it.id)?'ff':'88');c.lineWidth=(sel.has(it.id)?2:1.5)*fr;c.beginPath();c.roundRect(it.x,it.y,it.w,it.h,14);c.fill();c.stroke();c.fillStyle=it.color;c.font='600 22px Inter,Segoe UI,sans-serif';c.textBaseline='top';c.fillText(it.text,it.x+16,it.y+10)}
 for(const e of P.edges){const g=geom(e);if(!g)continue;const on=e===selEdge,dim=fs&&!(fs.has(e.a)&&fs.has(e.b));if(!exp&&Math.max(g.p0.x,g.p1.x,g.m.x)<x0||Math.min(g.p0.x,g.p1.x,g.m.x)>x1||Math.max(g.p0.y,g.p1.y,g.m.y)<y0||Math.min(g.p0.y,g.p1.y,g.m.y)>y1)if(!exp)continue;
  c.globalAlpha=dim?.12:1;c.strokeStyle=e.color||'#7cc4ff';c.fillStyle=c.strokeStyle;c.lineWidth=((e.width||3)+(on?2:0));c.beginPath();c.moveTo(g.p0.x,g.p0.y);c.quadraticCurveTo(g.m.x,g.m.y,g.p1.x,g.p1.y);c.stroke();
  const an=Math.atan2(g.p1.y-g.m.y,g.p1.x-g.m.x),L=16+(e.width||3)*2;c.beginPath();c.moveTo(g.p1.x,g.p1.y);c.lineTo(g.p1.x-L*Math.cos(an-.4),g.p1.y-L*Math.sin(an-.4));c.lineTo(g.p1.x-L*Math.cos(an+.4),g.p1.y-L*Math.sin(an+.4));c.closePath();c.fill();
  if(e.label){const q=bez(g,.5);c.font='500 15px Inter,sans-serif';const tw=c.measureText(e.label).width;c.fillStyle='#0e0f12';c.fillRect(q.x-tw/2-6,q.y-12,tw+12,24);c.fillStyle=e.color||'#7cc4ff';c.textBaseline='middle';c.fillText(e.label,q.x-tw/2,q.y)}}
 for(const it of P.items){if(it.type==='frame'||!vis(it))continue;c.globalAlpha=fs&&!fs.has(it.id)?.15:1;const s=sel.has(it.id);
  if(it.type==='img'){const b=bmp.get(it.id);if(b)c.drawImage(b,it.x,it.y,it.w,it.h);else{c.fillStyle='#1b1d24';c.fillRect(it.x,it.y,it.w,it.h);if(!exp)thumb(it)}
   if(it.shot&&v.z>.25){c.fillStyle='#000c';c.font='600 13px Inter,sans-serif';c.textBaseline='top';const tw=c.measureText(it.shot).width;c.fillRect(it.x+6,it.y+6,tw+14,22);c.fillStyle='#fff';c.fillText(it.shot,it.x+13,it.y+11)}
   if(it.notes&&v.z>.35){c.fillStyle='#9aa0ad';c.font='13px Inter,sans-serif';c.textBaseline='top';wrap(c,it.notes,it.w).slice(0,2).forEach((l,i)=>c.fillText(l,it.x,it.y+it.h+6+i*16))}}
  else if(it.type==='note'){c.fillStyle=it.color;c.fillRect(it.x,it.y,it.w,it.h);c.fillStyle='#1b1b1b';c.font='16px Inter,sans-serif';c.textBaseline='top';wrap(c,it.text,it.w-20).slice(0,Math.floor((it.h-16)/21)).forEach((l,i)=>c.fillText(l,it.x+10,it.y+10+i*21))}
  else{c.fillStyle=it.color;c.font='600 30px Inter,sans-serif';c.textBaseline='top';wrap(c,it.text,it.w).forEach((l,i)=>c.fillText(l,it.x,it.y+i*38))}
  if(s&&!exp){c.strokeStyle='#7cc4ff';c.lineWidth=2*fr;c.strokeRect(it.x,it.y,it.w,it.h);c.fillStyle='#7cc4ff';c.fillRect(it.x+it.w-6*fr,it.y+it.h-6*fr,12*fr,12*fr)}}
 c.globalAlpha=1;
 if(drag&&drag.k==='conn'){const a=center(drag.from);c.strokeStyle='#7cc4ff';c.setLineDash([8,6]);c.lineWidth=2*fr;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(drag.x,drag.y);c.stroke();c.setLineDash([])}
 if(drag&&drag.k==='box'){c.strokeStyle='#7cc4ff';c.fillStyle='#7cc4ff22';c.lineWidth=fr;const r=drag.r;c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x,r.y,r.w,r.h)}}
function size(){const d=devicePixelRatio||1,r=cv.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*d;cv.height=H*d;redraw()}
addEventListener('resize',size);
function loop(){if(dirty&&P){dirty=false;const d=devicePixelRatio||1;cx.setTransform(d,0,0,d,0,0);cx.save();cx.scale(d,d);draw(cx,P.view,W,H,false);cx.restore();$('#zoom').textContent=Math.round(P.view.z*100)+'%'}requestAnimationFrame(loop)}
// ---------- view
function bounds(its){if(!its.length)return null;let a=1e18,b=1e18,c=-1e18,d=-1e18;its.forEach(i=>{a=Math.min(a,i.x);b=Math.min(b,i.y);c=Math.max(c,i.x+i.w);d=Math.max(d,i.y+i.h)});return{x:a,y:b,w:c-a,h:d-b}}
function fit(){const r=bounds(P.items);if(!r)return;const z=Math.min(W/(r.w+160),H/(r.h+160),2);P.view={z,x:W/2-(r.x+r.w/2)*z,y:H/2-(r.y+r.h/2)*z};redraw();save()}
function zoomAt(sx,sy,z){const v=P.view;z=Math.max(.02,Math.min(8,z));v.x=sx-(sx-v.x)*z/v.z;v.y=sy-(sy-v.y)*z/v.z;v.z=z;redraw()}
const centerOn=i=>{const v=P.view;v.x=W/2-(i.x+i.w/2)*v.z;v.y=H/2-(i.y+i.h/2)*v.z};
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,P.view.z*Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015)));save()},{passive:false});
$('#bFit').onclick=fit;$('#b100').onclick=()=>{zoomAt(W/2,H/2,1);save()};
// ---------- tools
const TOOLS=[['select','➤','Select (V)'],['hand','✋','Pan (H / hold Space)'],['connect','⤳','Connect (C): drag from one item to another'],['text','T','Text (T)'],['note','▤','Sticky note (N)'],['frame','▢','Frame / act (F)'],['upload','⇪','Upload images (U)'],['delete','🗑','Delete selection (Del)']];
const tb=$('#tools');TOOLS.forEach(([k,ic,t])=>{const b=document.createElement('button');b.textContent=ic;b.title=t;b.dataset.k=k;b.onclick=()=>{if(k==='upload')$('#file').click();else if(k==='delete')del();else setTool(k)};tb.appendChild(b)});
function setTool(k){tool=k;[...tb.children].forEach(b=>b.classList.toggle('on',b.dataset.k===k));cv.style.cursor=k==='hand'?'grab':k==='select'?'default':'crosshair'}
function create(k,p){snap();const d={note:{w:220,h:160,color:'#f5d76e',text:'Scene idea…'},text:{w:320,h:50,color:'#e6e7ea',text:'Scene title'},frame:{w:640,h:420,color:'#6aa9ff',text:'ACT 1 — INTRODUCTION'}}[k],it={id:uid(),type:k,x:p.x-d.w/2,y:p.y-d.h/2,...d};if(k==='frame')P.items.unshift(it);else P.items.push(it);reindex();sel=new Set([it.id]);redraw();save()}
function del(){if(!sel.size&&!selEdge)return;snap();if(selEdge)P.edges=P.edges.filter(e=>e!==selEdge);P.items=P.items.filter(i=>!sel.has(i.id));P.edges=P.edges.filter(e=>!sel.has(e.a)&&!sel.has(e.b));sel.clear();selEdge=null;reindex();redraw();save();lib()}
function copy(){clip={items:P.items.filter(i=>sel.has(i.id)).map(i=>({...i})),edges:P.edges.filter(e=>sel.has(e.a)&&sel.has(e.b)).map(e=>({...e}))}}
function paste(){if(!clip||!clip.items.length)return;snap();const m=new Map();sel.clear();clip.items.forEach(i=>{const n={...i,id:uid(),x:i.x+40,y:i.y+40};m.set(i.id,n.id);P.items.push(n);sel.add(n.id);if(n.type==='img'&&bmp.has(i.id))bmp.set(n.id,bmp.get(i.id));else if(n.type==='img')store('blobs','readonly',s=>s.get(i.id)).then(b=>b&&store('blobs','readwrite',s=>s.put(b,n.id)))});
 clip.edges.forEach(e=>P.edges.push({...e,id:uid(),a:m.get(e.a),b:m.get(e.b)}));clip.items.forEach(i=>{i.x+=40;i.y+=40});reindex();redraw();save();lib()}
// ---------- pointer
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);const p=wp(e),v=P.view;
 if(e.button===1||tool==='hand'||space||e.button===2){drag={k:'pan',sx:e.clientX,sy:e.clientY,vx:v.x,vy:v.y};cv.style.cursor='grabbing';return}
 if(tool==='connect'){const it=hit(p);if(it&&it.type!=='frame')drag={k:'conn',from:it,x:p.x,y:p.y};return}
 if(tool!=='select'){create(tool,p);setTool('select');return}
 const one=sel.size===1?byId([...sel][0]):null;
 if(one&&Math.abs(p.x-(one.x+one.w))<14/v.z&&Math.abs(p.y-(one.y+one.h))<14/v.z){snap();drag={k:'resize',it:one,moved:true};return}
 const it=hit(p);
 if(it){if(e.shiftKey){sel.has(it.id)?sel.delete(it.id):sel.add(it.id)}else if(!sel.has(it.id))sel=new Set([it.id]);selEdge=null;
  const o=new Map();sel.forEach(id=>{const i=byId(id);o.set(id,{x:i.x,y:i.y});if(i.type==='frame')P.items.forEach(j=>{if(j.type!=='frame'&&!o.has(j.id)&&inR(center(j),i))o.set(j.id,{x:j.x,y:j.y})})});
  drag={k:'move',sx:p.x,sy:p.y,o,moved:false};redraw();return}
 const ed=hitEdge(p);if(ed){selEdge=ed;sel.clear();redraw();return}
 if(!e.shiftKey)sel.clear();selEdge=null;drag={k:'box',sx:p.x,sy:p.y,r:{x:p.x,y:p.y,w:0,h:0}};redraw()});
cv.addEventListener('pointermove',e=>{if(!drag)return;const p=wp(e);
 if(drag.k==='pan'){P.view.x=drag.vx+e.clientX-drag.sx;P.view.y=drag.vy+e.clientY-drag.sy}
 else if(drag.k==='move'){if(!drag.moved){snap();drag.moved=true}const dx=p.x-drag.sx,dy=p.y-drag.sy;drag.o.forEach((o,id)=>{const i=byId(id);i.x=o.x+dx;i.y=o.y+dy})}
 else if(drag.k==='resize'){const i=drag.it;i.w=Math.max(40,p.x-i.x);i.h=i.type==='img'?i.w*i.r:Math.max(30,p.y-i.y)}
 else if(drag.k==='conn'){drag.x=p.x;drag.y=p.y}
 else if(drag.k==='box'){drag.r={x:Math.min(p.x,drag.sx),y:Math.min(p.y,drag.sy),w:Math.abs(p.x-drag.sx),h:Math.abs(p.y-drag.sy)}}
 redraw()});
cv.addEventListener('pointerup',e=>{if(!drag)return;const p=wp(e),d=drag;drag=null;setTool(tool);
 if(d.k==='conn'){const t=hit(p);if(t&&t!==d.from&&t.type!=='frame'&&!P.edges.some(x=>x.a===d.from.id&&x.b===t.id)){snap();P.edges.push({id:uid(),a:d.from.id,b:t.id,color:'#7cc4ff',width:3,curve:true,label:''});save()}}
 else if(d.k==='box'){P.items.forEach(i=>{const r=d.r;if(i.x<r.x+r.w&&i.x+i.w>r.x&&i.y<r.y+r.h&&i.y+i.h>r.y&&(r.w>3||r.h>3))sel.add(i.id)})}
 if(d.k==='move'||d.k==='resize'||d.k==='pan')save();redraw()});
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('dblclick',e=>{const p=wp(e),it=hit(p);if(it){if(it.type==='img')return inspect(it);const t=prompt('Edit text',it.text);if(t!==null){snap();it.text=t;redraw();save()}return}
 const ed=hitEdge(p);if(ed){const t=prompt('Connection label (e.g. "cut to", "flashback")',ed.label||'');if(t!==null){snap();ed.label=t;redraw();save()}}});
function inspect(it){const lb=$('#lb');$('#lbNotes').value=it.notes;$('#lbTags').value=it.tags;$('#lbShot').value=it.shot;lb.hidden=false;store('blobs','readonly',s=>s.get(it.id)).then(b=>{if(b)$('#lbImg').src=URL.createObjectURL(b)});
 $('#lbClose').onclick=()=>{snap();it.notes=$('#lbNotes').value;it.tags=$('#lbTags').value;it.shot=$('#lbShot').value;lb.hidden=true;URL.revokeObjectURL($('#lbImg').src);redraw();save();lib()}}
// ---------- toolbar actions
$('#bUndo').onclick=doUndo;$('#bRedo').onclick=doRedo;
$('#col').oninput=e=>{snap();const c=e.target.value;if(selEdge)selEdge.color=c;sel.forEach(id=>{const i=byId(id);if(i.type!=='img')i.color=c});redraw();save()};
$('#bCurve').onclick=()=>{if(!selEdge)return toast('Select a connection first (click its line)');snap();selEdge.curve=selEdge.curve===false;redraw();save()};
$('#bFocus').onclick=e=>{focus=!focus;e.target.classList.toggle('on',focus);if(focus&&!sel.size)toast('Select an item to highlight its connected storyline');redraw()};
const dl=(b,n)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
const url=b=>new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(b)});
$('#bExp').onclick=async()=>{try{toast('Building backup…');const o=JSON.parse(JSON.stringify(P));o.images={};for(const i of P.items)if(i.type==='img'){const b=await store('blobs','readonly',s=>s.get(i.id));if(b)o.images[i.id]=await url(b)}dl(new Blob([JSON.stringify(o)],{type:'application/json'}),P.name+'.reelmind.json');toast('Project exported')}catch(e){toast('Export failed: '+e.message)}};
$('#bImp').onclick=()=>$('#impf').click();
$('#impf').onchange=async e=>{try{const o=JSON.parse(await e.target.files[0].text());if(!o.items||!o.edges)throw new Error('Not a Reel Mind project');for(const id in o.images||{})await fetch(o.images[id]).then(r=>r.blob()).then(b=>store('blobs','readwrite',s=>s.put(b,id)));delete o.images;o.id=uid();o.name+=' (imported)';projects.push(o);await store('projects','readwrite',s=>s.put(o));setP(o);toast('Project imported')}catch(err){toast('Import failed: '+err.message)}e.target.value=''};
$('#bPng').onclick=()=>{const r=bounds(P.items);if(!r)return toast('Nothing to export');const pad=60,s=Math.min(1,6000/(r.w+2*pad),6000/(r.h+2*pad)),c=document.createElement('canvas');c.width=(r.w+2*pad)*s;c.height=(r.h+2*pad)*s;draw(c.getContext('2d'),{x:(pad-r.x)*s,y:(pad-r.y)*s,z:s},c.width,c.height,true);c.toBlob(b=>dl(b,P.name+'.png'))};
// ---------- keyboard & drop
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const k=e.key.toLowerCase(),m=e.ctrlKey||e.metaKey;
 if(k===' '){space=true;cv.style.cursor='grab';e.preventDefault();return}
 if(m&&k==='z'){e.shiftKey?doRedo():doUndo();e.preventDefault()}else if(m&&k==='y')doRedo();
 else if(m&&k==='c')copy();else if(m&&k==='v')paste();else if(m&&k==='d'){e.preventDefault();copy();paste()}
 else if(m&&k==='a'){e.preventDefault();sel=new Set(P.items.map(i=>i.id));redraw()}
 else if(k==='delete'||k==='backspace')del();else if(k==='escape'){sel.clear();selEdge=null;setTool('select');redraw()}
 else if(!m){const t={v:'select',h:'hand',c:'connect',t:'text',n:'note',f:'frame'}[k];if(t)setTool(t);else if(k==='u')$('#file').click()}});
addEventListener('keyup',e=>{if(e.key===' '){space=false;setTool(tool)}});
const dz=$('#drop');let dc=0;addEventListener('dragenter',e=>{e.preventDefault();dc++;dz.style.display='flex'});addEventListener('dragleave',()=>{if(--dc<=0){dc=0;dz.style.display='none'}});addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dc=0;dz.style.display='none';addFiles(e.dataTransfer.files,wp(e))});
addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])];if(f.length)addFiles(f)});
// ---------- boot
(async()=>{try{db=await open();size();setTool('select');await loadAll();loop()}catch(e){document.body.insertAdjacentHTML('beforeend','<p style="position:fixed;inset:80px 280px;color:#f88">Storage unavailable: '+e.message+'. Serve the folder over http://localhost (or use a normal, non-private browser window).</p>')}})();
