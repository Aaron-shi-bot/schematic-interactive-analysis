// Synthetic two-resistor divider: ideal source, DC resistors, no external load.
// Example values are not defaults for other circuits.
(() => {
 const defaults={vin:5,R1:10000,R2:10000,target:3},ranges={vin:[0,12],R1:[1,1000000],R2:[1,1000000],target:[0,12]};
 function normalize(raw={}){const s={...defaults};for(const key in s){const v=Number(raw[key]);if(raw[key]!=null&&Number.isFinite(v)&&v>=ranges[key][0]&&v<=ranges[key][1])s[key]=v}return s}
 function compute(s){const out=s.vin*s.R2/(s.R1+s.R2);return {valid:true,warnings:[],out,displayNodes:{VIN:s.vin,OUT:out,GND:0}}}
 window.SchematicModel={defaults,ranges,normalize,compute,
  status:(r,s,fmt)=>"解析 DC · 输出 = "+fmt(r.out)+" · 理想电源、无外接负载",
  runAction(action,s){
   if(action!=="set-output"||s.target<=0||s.target>=s.vin)return {ok:false,message:"目标必须大于 0 V 且小于输入电压"};
   const r=s.R1*s.target/(s.vin-s.target);
   if(r<ranges.R2[0]||r>ranges.R2[1])return {ok:false,message:"目标所需 R2 超出允许范围"};
   return {ok:true,patch:{R2:r},message:"R2 = "+r.toFixed(2)+" Ω · 回代输出 = "+compute({...s,R2:r}).out.toFixed(4)+" V"};
  },
  branchDetail:(id,{state:s,fmt})=>id==="V1"?"1 → 2："+fmt(-s.vin/(s.R1+s.R2),"A")+" · 电源供电方向为负":null
 };
})();
