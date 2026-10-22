// A node is one connected electrical net, not one entry per component pin.
// GND stays the voltage reference and is deliberately excluded from probes.
function isProbeNet(net){return !groundNets.has(net)&&Object.hasOwn(data.topology.nets,net)}
function moduleNodeIds(m){return [...new Set(m?[...m.nodes,...pinList.filter(p=>m.components.includes(p.component)).map(p=>p.net)]:Object.keys(data.topology.nets))].filter(isProbeNet)}
function representativePin(net,m=selectedModule()){
 const local=pinList.filter(p=>p.net===net&&(!m||m.components.includes(p.component)));
 return local.find(p=>p.ref===net)||local[0]||pinList.find(p=>p.net===net)||null;
}
function probeCandidates(){return moduleNodeIds(selectedModule()).map(net=>representativePin(net)).filter(Boolean)}
function selectedNodePin(){
 if(!ui.probe.startsWith("n:")||!isProbeNet(ui.probe.slice(2)))return null;
 const net=ui.probe.slice(2),saved=pinByRef[ui.probePin],m=selectedModule();
 if(saved?.net===net&&(!m||m.components.includes(saved.component)))return saved;
 return representativePin(net,m);
}
function probeSelectionValue(){return ui.probe}
function voltageText(net){return result.displayNodes[net]===null?"越界 · 已撤下":fmt(result.displayNodes[net])}
function selectedProbePins(){
 if(!ui.module||!ui.probe)return [];
 if(ui.probe.startsWith("n:"))return [selectedNodePin()].filter(Boolean);
 const id=ui.probe.slice(2),seen=new Set();
 return (comps[id]?.pins||[]).filter(p=>isProbeNet(p.net)&&!seen.has(p.net)&&seen.add(p.net)).map(p=>pinByRef[id+"."+p.pin]);
}
function probe(){
 const id=ui.probe.slice(2),v=result.displayNodes,terminals=$("#mw-probe-terminals");terminals.replaceChildren();
 if(!ui.probe)return;
 if(ui.probe.startsWith("n:")){
  const pin=selectedNodePin();ui.probePin=pin?.ref||null;
  $("#mw-probe-kind").textContent="节点探针 · 电压参考 "+reference;
  $("#mw-probe-title").textContent=pin?pin.ref+(pin.name!==pin.pin?" · "+pin.name:""):labels[id]||id;
  $("#mw-probe-reading").textContent=voltageText(id);
  $("#mw-probe-value").textContent="同一网络："+(data.topology.nets[id]||[]).join("、");
  $("#mw-probe-select").value=probeSelectionValue();return;
 }
 const c=comps[id],pins=Object.fromEntries(c.pins.map(p=>[p.pin,p.net]));
 $("#mw-probe-kind").textContent="支路探针 · 引脚电压参考 "+reference;
 $("#mw-probe-title").textContent=id+" · "+(state[id]!=null?ohm(state[id]):c.value);
 const delta=Number.isFinite(v[pins["1"]])&&Number.isFinite(v[pins["2"]])?v[pins["1"]]-v[pins["2"]]:undefined;
 $("#mw-probe-reading").textContent=c.pins.length===2&&delta!==undefined?"ΔV "+fmt(delta):"";
 let detail="";
 if(!result.valid&&c.pins.some(p=>v[p.net]===null))detail="超出线性模型范围，数值已撤下";
 else if(/^R\d+$/.test(id)&&state[id]!=null&&delta!==undefined){const i=delta/state[id];detail="1 → 2："+fmt(i,"A")+" · 功耗 "+(delta*i*1000).toFixed(3)+" mW"}
 else detail=M.branchDetail?.(id,{state,result,pins,delta,fmt,ohm})||"支路电流待建模；下方可选择引脚测点。";
 $("#mw-probe-value").textContent=detail;
 for(const net of [...new Set(c.pins.map(p=>p.net))]){
  const pins=c.pins.filter(p=>p.net===net),refs=pins.map(p=>id+"."+p.pin);
  if(!isProbeNet(net)){const reference=document.createElement("span");reference.className="text-small";reference.textContent=net+" · 参考地";terminals.append(reference);continue}
  const button=document.createElement("button");button.type="button";button.className="btn";button.dataset.terminalNet=net;button.textContent=refs.join(" / ")+" · "+voltageText(net);button.addEventListener("click",()=>choose("n:"+net,refs[0]));terminals.append(button);
 }
}
