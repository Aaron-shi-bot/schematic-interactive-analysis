 // Reserve label slots in the fitted view, independently of pan and zoom.
 // A slot may extend beyond its own module's width, but stays outside every
 // circuit region. Its anchor and lane then stay unchanged throughout zooming.
 function layoutModuleLabels(baseScale,w,h){
  const layer=$(".mw-labels"),[x0,y0,x1,y1]=data.modules.full_bounds;layer.replaceChildren();
  const BX=x=>w/2+(x-(x0+x1)/2)*baseScale,BY=y=>h/2-(y-(y0+y1)/2)*baseScale;
  const blocks=modules.map(m=>({x:BX(m.bounds[0]),y:BY(m.bounds[3]),width:(m.bounds[2]-m.bounds[0])*baseScale,height:(m.bounds[3]-m.bounds[1])*baseScale}));
  const occupied=[],layouts=new Map();
  const overlaps=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
  if(!ui.showModules)return layouts;
  for(const m of modules){
   const wrapper=document.createElement("div");wrapper.className="mw-label-wrap";wrapper.dataset.moduleLabel=m.id;
   const button=document.createElement("button");button.type="button";button.className="btn";button.dataset.moduleButton=m.id;button.setAttribute("aria-pressed",String(ui.module===m.id));button.setAttribute("aria-label",m.number+" "+m.name);button.setAttribute("data-tooltip",m.number+" "+m.name);button.addEventListener("click",()=>selectModule(m.id));wrapper.append(button);layer.append(wrapper);
   const anchor=(m.bounds[0]+m.bounds[2])/2,bottom=m.label_side==="bottom",edge=bottom?m.bounds[1]:m.bounds[3];
   let chosen=null;
   for(const full of [true,false]){
    button.textContent=full?m.number+" "+m.name:m.number;
    const width=Math.ceil(button.getBoundingClientRect().width),height=button.offsetHeight;
    for(let lane=0;lane<3;lane++){
     const offset=6+lane*(height+8),box={x:BX(anchor)-width/2,y:BY(edge)+(bottom?offset:-height-offset),width,height};
     if(box.x<4||box.x+width>w-4||box.y<4||box.y+height>h-4)continue;
     if(blocks.some(b=>overlaps(box,b,2))||occupied.some(b=>overlaps(box,b,8)))continue;
     chosen={...box,anchor,edge,bottom,offset,lane,full};break;
    }
    if(chosen)break;
   }
   // Very small previews retain all full names in the module selector instead
   // of laying an unreadable title over the circuit or another title.
   wrapper.hidden=!chosen;if(!chosen)continue;
   occupied.push(chosen);wrapper.dataset.labelLane=chosen.lane;wrapper.dataset.labelFormat=chosen.full?"full":"number";
   layouts.set(m.id,{...chosen,wrapper});
  }
  return layouts;
 }
 function draw(){
  // CSS allocates the viewport; long detail content must never size the drawing.
  const w=Math.max(1,svg.parentElement.clientWidth),h=Math.max(1,svg.parentElement.clientHeight),[x0,y0,x1,y1]=data.modules.full_bounds;
  if(w<40||h<80)return;
  const baseScale=Math.min((w-32)/(x1-x0),Math.max(20,h-128)/(y1-y0)),scale=baseScale*ui.zoom;
  const cx=(x0+x1)/2+ui.panX,cy=(y0+y1)/2+ui.panY;
  const X=x=>w/2+(x-cx)*scale,Y=y=>h/2-(y-cy)*scale;
  svg.setAttribute("viewBox",`0 0 ${w} ${h}`);svg.replaceChildren();
  const g=el("g"),hits=el("g"),textLayer=el("g"),regions=el("g"),probeLayer=el("g",{class:"mw-probe-layer"});svg.append(g,hits,textLayer,regions,probeLayer);
  hits.style.pointerEvents=ui.probeMode?"auto":"none";
  const line=(a,b,cls="mw-shape",wide=1)=>el("line",{x1:X(a[0]),y1:Y(a[1]),x2:X(b[0]),y2:Y(b[1]),class:cls,"stroke-width":wide});
  const selected=activeNet();
  if(data.drawing){const [l,b,r,t]=data.drawing.bounds;
   g.append(el("image",{href:data.drawing.dataUri,x:X(l),y:Y(t),width:(r-l)*scale,height:(t-b)*scale,preserveAspectRatio:"none"}));
   for(const wire of data.topology.wires){const points=wire.points.map(p=>X(p[0])+","+Y(p[1])).join(" ");
    if(wire.net===selected)g.append(el("polyline",{points,class:"mw-wire mw-active","stroke-width":2.5}));
    if(isProbeNet(wire.net)){const hit=el("polyline",{points,class:"mw-hit cursor-interaction","stroke-width":16,"data-net":wire.net});hit.addEventListener("click",()=>{if(!dragged)choose("n:"+wire.net)});hits.append(hit)}
   }
  }
  for(const r of data.drawing?[]:data.records){
   const k=r.RECORD,owner=byIndex[Number(r.OwnerIndex)],x=num(r,"Location.X"),y=num(r,"Location.Y");
   if(!owner&&!["27","29","17"].includes(k))continue;
   if(["6","27"].includes(k)){
    const pts=Array.from({length:Number(r.LocationCount)},(_,j)=>[num(r,"X"+(j+1)),num(r,"Y"+(j+1))]);
    const points=pts.map(p=>X(p[0])+","+Y(p[1])).join(" "),net=wireNet[r._index],active=k==="27"&&net===selected;
    g.append(el("polyline",{points,class:(k==="27"?"mw-wire":"mw-shape")+(active?" mw-active":""),"stroke-width":active?2.5:1.1}));
    if(k==="27"&&isProbeNet(net)){const hit=el("polyline",{points,class:"mw-hit cursor-interaction","stroke-width":16,"data-net":net});hit.addEventListener("click",e=>{if(!dragged){const b=svg.getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top,pin=pinList.filter(p=>p.net===net).sort((a,b)=>Math.hypot(X(a.end[0])-px,Y(a.end[1])-py)-Math.hypot(X(b.end[0])-px,Y(b.end[1])-py))[0];choose("n:"+net,pin?.ref)}});hits.append(hit)}
   } else if(k==="10"||k==="14"){
    const xx=num(r,"Corner.X"),yy=num(r,"Corner.Y");
    g.append(el("rect",{x:X(Math.min(x,xx)),y:Y(Math.max(y,yy)),width:Math.abs(xx-x)*scale,height:Math.abs(yy-y)*scale,class:"mw-shape","stroke-width":1.1}));
   } else if(k==="13"){g.append(line([x,y],[num(r,"Corner.X"),num(r,"Corner.Y")]))}
   else if(k==="8"||k==="12"){
    const radius=num(r,"Radius"),start=Number(r.StartAngle||0),end=Number(r.EndAngle||360);
    if(end-start>=359)g.append(el("ellipse",{cx:X(x),cy:Y(y),rx:radius*scale,ry:num(r,"SecondaryRadius",radius)*scale,class:"mw-shape","stroke-width":1.1}));
    else{const pts=Array.from({length:31},(_,i)=>{const a=(start+(end-start)*i/30)*Math.PI/180;return X(x+radius*Math.cos(a))+","+Y(y+radius*Math.sin(a))}).join(" ");g.append(el("polyline",{points:pts,class:"mw-shape","stroke-width":1.1}))}
   } else if(k==="29"){g.append(el("circle",{cx:X(x),cy:Y(y),r:2.3,class:"mw-dot"}))}
   else if(k==="17"){
    if(groundNets.has(r.Text)){
     const dir=Number(r.Orientation??3),v=[[1,0],[0,1],[-1,0],[0,-1]][dir],a=[x+v[0]*5,y+v[1]*5];
     g.append(line([x,y],a));for(let j=0;j<3;j++){const c=[a[0]+v[0]*j*2,a[1]+v[1]*j*2],l=5-j*1.5;g.append(line([c[0]-v[1]*l,c[1]+v[0]*l],[c[0]+v[1]*l,c[1]-v[0]*l]))}
    } else {textLayer.append(el("text",{x:X(x),y:Y(y)-4*scale,"font-size":8*scale,"text-anchor":"middle"},r.Text))}
   } else if(["34","41"].includes(k)&&r.IsHidden!=="T"&&["Designator","Comment"].includes(r.Name)){
    let label=r.Text;
    if(r.Name==="Comment"&&state[owner?.id]!=null)label=ohm(state[owner.id]);
    if(r.Name==="Comment"){const custom=M.valueLabel?.(owner,state,ohm);if(custom!=null)label=custom}
    textLayer.append(el("text",{x:X(x),y:Y(y),"font-size":8*scale,"data-source-label":r.Name},label));
   }
  }
  for(const c of data.topology.components){
   for(const p of data.drawing?[]:c.pins){
    const active=p.net===selected;g.append(line(p.body,p.end,active?"mw-shape mw-active":"mw-shape",active?2.5:1.1));
    g.append(el("circle",{cx:X(p.end[0]),cy:Y(p.end[1]),r:active?3.5:1.8,class:"mw-dot"+(active?" mw-active":""),"data-pin-end":c.id+"."+p.pin}));
    {const [px,py]=p.body,[ex,ey]=p.end;
     textLayer.append(el("text",{x:X((px+ex)/2),y:Y((py+ey)/2)-2*scale,"font-size":5.5*scale,"text-anchor":"middle"},p.pin))}
    if(c.id.startsWith("U")){
     const dir=p.end[0]>p.body[0]?-1:1;
     textLayer.append(el("text",{x:X(p.body[0])+dir*2*scale,y:Y(p.body[1])+2*scale,"font-size":6*scale,"text-anchor":dir<0?"end":"start"},p.name));
    }
   }
   if(!c.pins.length)continue;
   const xs=c.pins.map(p=>p.body[0]),ys=c.pins.map(p=>p.body[1]);
   const extra=M.hitBounds?.(c);if(extra){xs.push(extra[0],extra[2]);ys.push(extra[1],extra[3])}
   const minx=Math.min(...xs)-3,maxx=Math.max(...xs)+3,miny=Math.min(...ys)-4,maxy=Math.max(...ys)+4;
   const hit=el("rect",{x:X(minx),y:Y(maxy),width:Math.max(16,(maxx-minx)*scale),height:Math.max(16,(maxy-miny)*scale),
     fill:ui.probe==="c:"+c.id?"var(--viz-series-1)":"transparent","fill-opacity":ui.probe==="c:"+c.id?".13":"1",class:"cursor-interaction","data-component":c.id});
   hit.addEventListener("click",()=>{if(!dragged)choose("c:"+c.id)});if(c.pins.some(p=>isProbeNet(p.net)))hits.append(hit);
  }
  const labelLayouts=layoutModuleLabels(baseScale,w,h);
  if(ui.showModules)for(const m of modules){
   const [left,bottom,right,top]=m.bounds,x=X(left),y=Y(top),width=(right-left)*scale,height=(top-bottom)*scale;
   const rect=el("rect",{x,y,width,height,rx:3,class:"mw-region cursor-interaction"+(ui.module===m.id?" is-active":""),"data-module":m.id});
   rect.style.pointerEvents=ui.probeMode?"none":"all";rect.addEventListener("click",()=>{if(!dragged)selectModule(m.id)});regions.append(rect);
   const label=labelLayouts.get(m.id);if(!label)continue;
   const lx=X(label.anchor),ly=Y(label.edge),labelTop=ly+(label.bottom?label.offset:-label.height-label.offset);
   label.wrapper.style.left=(lx-label.width/2)+"px";label.wrapper.style.top=labelTop+"px";
   regions.append(el("line",{x1:lx,x2:lx,y1:label.bottom?labelTop:labelTop+label.height,y2:ly,class:"mw-label-leader"+(ui.module===m.id?" is-active":""),"data-label-leader":m.id}));
  }
  const selectedPins=selectedProbePins(),selectedNets=new Set(selectedPins.map(p=>p.net));
  if(ui.probeMode){
   const candidates=probeCandidates().filter(p=>!selectedNets.has(p.net));
   for(const p of candidates){
    const px=X(p.end[0]),py=Y(p.end[1]);if(px<0||px>w||py<0||py>h)continue;
    const target=el("g",{class:"cursor-interaction","data-probe-pin":p.ref,"data-probe-net":p.net,"data-tooltip":p.ref+" · "+voltageText(p.net)});
    target.append(el("circle",{cx:px,cy:py,r:10,fill:"transparent"}),el("circle",{cx:px,cy:py,r:3.3,class:"mw-probe-node"}));
    target.addEventListener("click",e=>{if(dragged)return;const b=svg.getBoundingClientRect(),mx=e.clientX-b.left,my=e.clientY-b.top;const nearest=candidates.reduce((a,q)=>Math.hypot(X(q.end[0])-mx,Y(q.end[1])-my)<Math.hypot(X(a.end[0])-mx,Y(a.end[1])-my)?q:a,p);choose("p:"+nearest.ref)});probeLayer.append(target);
   }
  }
  for(const p of selectedPins){
   const px=X(p.end[0]),py=Y(p.end[1]);
   const mark=el("g",{class:"cursor-interaction","data-probe-marker":p.ref,"data-probe-net":p.net,"data-tooltip":p.ref+" · "+voltageText(p.net)});
   mark.append(el("circle",{cx:px,cy:py,r:8,class:"mw-probe-halo"}),el("circle",{cx:px,cy:py,r:5,class:"mw-probe-selected","data-active-probe":p.ref}));
   mark.addEventListener("click",()=>{if(!dragged)choose("p:"+p.ref)});probeLayer.append(mark);
   if(selectedPins.length===1){const tag=el("g",{"data-probe-label":p.ref}),tw=p.ref.length*7+14;tag.append(el("rect",{x:px+12,y:py-24,width:tw,height:22,rx:4,class:"mw-probe-tag"}),el("text",{x:px+19,y:py-9,class:"mw-probe-ref"},p.ref));probeLayer.append(tag)}
  }
  svg.dataset.scale=scale;svg.dataset.baseScale=baseScale;svg.dataset.cx=cx;svg.dataset.cy=cy;
 }
