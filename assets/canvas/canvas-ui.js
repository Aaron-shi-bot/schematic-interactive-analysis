let lastSavedSnapshot=null;
const snapshotKey=s=>JSON.stringify([s?.modelContent,s?.privateContent]);
function save(){if(window.openai?.setWidgetState){const snapshot={modelContent:{schema:config.stateSchema||"schematic-canvas-v1",circuit:data.circuit,inputs:state,module:ui.module,selected:ui.probe,method:config.method},privateContent:ui};lastSavedSnapshot=snapshotKey(snapshot);window.openai.setWidgetState(snapshot).catch(()=>{})}}
function applySaved(raw){
 const m=raw?.modelContent,p=raw?.privateContent;if(m?.circuit!==data.circuit||![config.stateSchema||"schematic-canvas-v1",...(config.compatibleSchemas||[])].includes(m?.schema))return;
 state=M.normalize(m.inputs);
 if(p){ui.module=moduleOf(p.module)?p.module:null;for(const k of ["large","showModules","probeMode"])if(typeof p[k]==="boolean")ui[k]=p[k];
  if(Number.isFinite(p.zoom))ui.zoom=Math.max(1,Math.min(8,p.zoom));for(const k of ["panX","panY"])if(Number.isFinite(p[k]))ui[k]=Math.max(-1500,Math.min(1500,p[k]));
  if(typeof p.probe==="string"&&((p.probe.startsWith("c:")&&comps[p.probe.slice(2)])||(p.probe.startsWith("n:")&&Object.hasOwn(data.topology.nets,p.probe.slice(2)))))ui.probe=p.probe;
  if(Object.hasOwn(M.defaults,p.edit)&&modules.some(m=>m.resistors.includes(p.edit)))ui.edit=p.edit;
  ui.probePin=pinByRef[p.probePin]?.net===ui.probe.slice(2)?p.probePin:null;
  // The removed compact-diagram mode used a different Y coordinate system.
  // Refit its saved camera once; preserve all electrical inputs and selection.
  if(typeof p.compactSpacing==="boolean"){ui.zoom=1;ui.panX=ui.panY=0}
 }
}
function buildPanel(){
 const m=selectedModule();$("#mw-panel").hidden=!m;$(".mw-workspace").classList.toggle("has-panel",!!m);$("#mw-module-select").value=m?.id||"";
 $(".mw-panel-body").scrollTop=0;
 $(".mw-panel-content").scrollTop=0;
 $("#mw-selection-label").textContent=m?m.number+" · "+m.name:"整图 · "+modules.length+" 个模块";if(!m)return;
 $("#mw-module-title").textContent=m.number+" · "+m.name;$("#mw-module-model").textContent=m.model;
 $("#mw-module-function").textContent=m.function;$("#mw-module-usage").textContent=m.usage;$("#mw-module-limit").textContent=m.limitations;
 const holder=$("#mw-module-controls");holder.replaceChildren();
 for(const key of m.controls){const c=controls[key],scale=c.scale||1,wrap=document.createElement("div");wrap.className="mw-control";
  const label=document.createElement("label");label.className="form-label";label.htmlFor="mw-param-"+key;label.textContent=c.label;wrap.append(label);
  const row=document.createElement("div");row.className="mw-control-line";
  if(c.slider){const range=document.createElement("input");Object.assign(range,{type:"range",className:"form-range",min:c.slider[0],max:c.slider[1],step:c.step});range.dataset.key=key;range.dataset.scale=scale;range.setAttribute("aria-label",c.label+"滑块");row.append(range)}
  const field=document.createElement("input");Object.assign(field,{type:"number",className:"form-control",id:"mw-param-"+key,min:M.ranges[key][0]*scale,max:M.ranges[key][1]*scale,step:c.step});field.dataset.key=key;field.dataset.scale=scale;
  const fieldWrap=document.createElement("div");if(c.slider)fieldWrap.className="mw-number";fieldWrap.append(field);row.append(fieldWrap);wrap.append(row);holder.append(wrap);
 }
 $("#mw-zero-action").hidden=!m.calibration;$("#mw-target-section").hidden=!m.inverse;
 if(m.calibration)$("#mw-auto-zero").textContent=m.calibration.label;
 if(m.inverse){const target=$("#mw-target-input"),key=m.inverse.targetKey,c=controls[key];
  $("#mw-target-section summary").textContent=m.inverse.title||"目标电压反求";$("#mw-target-label").textContent=m.inverse.targetLabel||c.label;$("#mw-inverse").textContent=m.inverse.label;
  target.dataset.key=key;target.dataset.scale=c.scale||1;target.min=M.ranges[key][0]*(c.scale||1);target.max=M.ranges[key][1]*(c.scale||1);target.step=c.step;
 }else delete $("#mw-target-input").dataset.key;
 $("#mw-inverse-result").textContent="";$("#mw-edit-section").hidden=!m.resistors.length;
 $("#mw-edit-id").replaceChildren();for(const id of m.resistors)option($("#mw-edit-id"),id,id);
 if(m.resistors.length&&!m.resistors.includes(ui.edit))ui.edit=m.resistors[0];
 const select=$("#mw-probe-select");select.replaceChildren();
 const nodes=document.createElement("optgroup");nodes.label="节点电压";
 for(const n of moduleNodeIds(m))option(nodes,"n:"+n,labels[n]||n);if(nodes.children.length)select.append(nodes);
 const branches=document.createElement("optgroup");branches.label="元件 / 支路";
 for(const id of m.components)if(comps[id].pins.some(p=>isProbeNet(p.net)))option(branches,"c:"+id,id+" · "+comps[id].value);if(branches.children.length)select.append(branches);
 const options=[...select.options];
 if(!options.some(o=>o.value===ui.probe)){ui.probe=options.find(o=>o.value===m.default_probe)?.value||options[0]?.value||"";ui.probePin=null}
 $(".mw-probe-debug").hidden=!options.length;$(".mw-panel-content").classList.toggle("no-probe",!options.length);sync();
}
function selectModule(id){ui.module=moduleOf(id)?id:null;if(ui.module)ui.probe=selectedModule().default_probe;ui.probePin=null;buildPanel();render();save()}
function choose(probe,pinRef=null){
 if(probe.startsWith("p:")){const p=pinByRef[probe.slice(2)];if(!p)return;pinRef=p.ref;probe="n:"+p.net}
 if(probe.startsWith("n:")&&!isProbeNet(probe.slice(2)))return;
 if(probe.startsWith("c:")&&!comps[probe.slice(2)]?.pins.some(p=>isProbeNet(p.net)))return;
 const id=probe.slice(2),pin=pinByRef[pinRef],current=selectedModule();
 const matches=m=>probe.startsWith("c:")?m.components.includes(id):pin?m.components.includes(pin.component):moduleNodeIds(m).includes(id);
 const m=current&&matches(current)?current:modules.find(matches);
 const changed=m&&m.id!==ui.module;ui.probe=probe;ui.probePin=pin?.net===id?pin.ref:null;
 if(m)ui.module=m.id;if(changed)buildPanel();
 const select=$("#mw-probe-select");if(![...select.options].some(o=>o.value===probe))option(select,probe,labels[id]||id);sync();render();save();
}
function sync(){
 root.classList.toggle("is-compact",!ui.large);
 $$("[data-key]").forEach(e=>{if(e!==document.activeElement)e.value=+(state[e.dataset.key]*Number(e.dataset.scale||1)).toFixed(4)});
 $("#mw-zoom-value").textContent=Math.round(ui.zoom*100)+"%";$("#mw-minus").disabled=ui.zoom<=1;$("#mw-plus").disabled=ui.zoom>=8;
 $("#mw-large").setAttribute("aria-pressed",String(ui.large));$("#mw-show-modules").checked=ui.showModules;$("#mw-probe-mode").checked=ui.probeMode;
 $("#mw-probe-select").value=probeSelectionValue();$("#mw-edit-id").value=ui.edit;if(M.ranges[ui.edit]){const field=$("#mw-edit-value");[field.min,field.max]=M.ranges[ui.edit]}if(document.activeElement!==$("#mw-edit-value"))$("#mw-edit-value").value=state[ui.edit];
}
function scheduleDraw(){if(!drawPending){drawPending=true;requestAnimationFrame(()=>{drawPending=false;draw()})}}
function render(){
 result=M.compute(state);const m=selectedModule(),holder=$("#mw-node-values");holder.replaceChildren();
 if(m){const table=document.createElement("table");table.className="table table-sm";const body=document.createElement("tbody");
  for(const n of [...new Set(m.nodes)].filter(isProbeNet)){const row=document.createElement("tr"),name=document.createElement("td"),value=document.createElement("td");name.textContent=labels[n]||n;value.className="tabular-nums text-end";value.dataset.node=n;value.textContent=result.displayNodes[n]===null?"越界 · 已撤下":fmt(result.displayNodes[n]);row.append(name,value);body.append(row)}if(body.children.length){table.append(body);holder.append(table)}
 }
 $("#mw-status").textContent=result.valid?(M.status?.(result,state,fmt)||config.method):"模型越界："+result.warnings.join("；");
 $("#mw-status").classList.toggle("text-destructive",!result.valid);if(m)probe();scheduleDraw();
}
root.addEventListener("input",e=>{
 const key=e.target.dataset.key;if(!key)return;const n=Number(e.target.value),scale=Number(e.target.dataset.scale||1);
 if(e.target.value===""||!e.target.checkValidity()||!Number.isFinite(n)){e.target.setAttribute("aria-invalid","true");$("#mw-status").textContent="输入无效；结果仍对应上一次有效条件";$("#mw-status").classList.add("text-destructive");$("#mw-probe-kind").textContent="探针 · 上一次有效结果";return}
 e.target.removeAttribute("aria-invalid");state[key]=n/scale;sync();render();$("#mw-inverse-result").textContent="";save();
});
$("#mw-edit-id").addEventListener("change",e=>{ui.edit=e.target.value;sync();choose("c:"+ui.edit)});
$("#mw-edit-value").addEventListener("input",e=>{const n=Number(e.target.value);if(e.target.value===""||!e.target.checkValidity()||!Number.isFinite(n)){e.target.setAttribute("aria-invalid","true");$("#mw-status").textContent="阻值无效；结果仍对应上一次有效条件";return}e.target.removeAttribute("aria-invalid");state[ui.edit]=n;$("#mw-inverse-result").textContent="";render();save()});
$("#mw-module-select").addEventListener("change",e=>selectModule(e.target.value));$("#mw-close").addEventListener("click",()=>selectModule(null));
$("#mw-probe-select").addEventListener("change",e=>choose(e.target.value));
function runAction(action){
 if(!action)return;const r=M.runAction(action,state);
 if(r.ok){state=M.normalize({...state,...r.patch});sync();render()}
 $("#mw-inverse-result").textContent=r.message;save();
}
$("#mw-auto-zero").addEventListener("click",()=>runAction(selectedModule()?.calibration?.action));
$("#mw-inverse").addEventListener("click",()=>runAction(selectedModule()?.inverse?.action));
function zoomTo(z,px,py){const oldScale=Number(svg.dataset.scale),base=Number(svg.dataset.baseScale),oldZoom=ui.zoom;ui.zoom=Math.max(1,Math.min(8,z));
 if(px!=null&&oldScale&&oldZoom!==ui.zoom){const box=svg.getBoundingClientRect(),dx=px-box.width/2,dy=py-box.height/2,newScale=base*ui.zoom;ui.panX+=dx/oldScale-dx/newScale;ui.panY+=-dy/oldScale+dy/newScale}
 sync();draw();save();
}
$("#mw-plus").addEventListener("click",()=>zoomTo(ui.zoom*1.25));$("#mw-minus").addEventListener("click",()=>zoomTo(ui.zoom/1.25));
$("#mw-fit").addEventListener("click",()=>{ui.zoom=1;ui.panX=ui.panY=0;sync();draw();save()});
$("#mw-large").addEventListener("click",()=>{ui.large=!ui.large;sync();draw();save()});
$("#mw-show-modules").addEventListener("change",e=>{ui.showModules=e.target.checked;draw();save()});
$("#mw-probe-mode").addEventListener("change",e=>{ui.probeMode=e.target.checked;draw();save()});
svg.addEventListener("wheel",e=>{e.preventDefault();const box=svg.getBoundingClientRect();zoomTo(ui.zoom*Math.exp(-e.deltaY*.0015),e.clientX-box.left,e.clientY-box.top)},{passive:false});
svg.addEventListener("pointerdown",e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:ui.panX,py:ui.panY,scale:Number(svg.dataset.scale)};dragged=false});
window.addEventListener("pointermove",e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>6){dragged=true;ui.panX=Math.max(-1500,Math.min(1500,drag.px-dx/drag.scale));ui.panY=Math.max(-1500,Math.min(1500,drag.py+dy/drag.scale));scheduleDraw()}});
const endDrag=()=>{if(dragged)save();drag=null;setTimeout(()=>{dragged=false},40)};window.addEventListener("pointerup",endDrag);window.addEventListener("pointercancel",endDrag);
const full=$("#mw-fullscreen");full.hidden=!document.fullscreenEnabled;
full.addEventListener("click",async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();$("#mw-screen-status").textContent=""}catch{$("#mw-screen-status").textContent="当前宿主不允许全屏；可使用独立大画布页面。"}});
document.addEventListener("fullscreenchange",()=>{full.textContent=document.fullscreenElement?"退出全屏":"全屏";scheduleDraw()});
window.addEventListener("resize",scheduleDraw);
window.addEventListener("openai:set_globals",e=>{const s=e.detail?.globals?.widgetState;if(s&&snapshotKey(s)!==lastSavedSnapshot){applySaved(s);buildPanel();sync();render()}});
applySaved(window.openai?.widgetState);buildPanel();sync();render();new ResizeObserver(scheduleDraw).observe(svg.parentElement);
root.SchematicCanvasTest={getState:()=>({...state}),getResult:()=>result,getUI:()=>({...ui}),getModules:()=>modules};
