// ===== UPLOAD DROPDOWN (chọn loại trước khi mở file picker) =====
let pendingUploadTarget=null,pendingUploadMode='replace';
function toggleUploadMenu(ev){
  ev.stopPropagation();
  document.getElementById("uploadDdMenu").classList.toggle("show");
}
function pickUploadType(target,mode){
  pendingUploadTarget=target;
  pendingUploadMode=mode||'replace';
  document.getElementById("uploadDdMenu").classList.remove("show");
  document.getElementById("fh").click();
}
document.addEventListener("click",function(e){
  if(e.target.closest(".upload-dd-wrap")||e.target.closest(".upload-actions"))return;
  ["uploadDdMenu","histDdMenu","bcHistMenu"].forEach(id=>{
    const menu=document.getElementById(id);
    if(menu&&menu.classList.contains("show"))menu.classList.remove("show");
  });
});

// ===== FILE UPLOAD =====
document.getElementById("fh").addEventListener("change",function(e){
  const files=Array.from(e.target.files);
  if(!files.length)return;
  e.target.value="";
  const target=pendingUploadTarget||"don";
  const mode=pendingUploadMode||"replace";
  pendingUploadTarget=null;pendingUploadMode='replace';
  window._uploadMode=mode;
  // Cảnh báo mềm nếu tên file gợi ý sai loại đang chọn (không chặn, chỉ xác nhận lại)
  const allNames=files.map(f=>f.name.toLowerCase()).join(" | ");
  const looksKM=/\bkm\b|khuyenmai|khuyến mãi|khuyen mai|promo/i.test(allNames);
  const looksDon=/duyet ?don|duyệt đơn|don hang|đơn hàng/i.test(allNames);
  if(target==="don"&&looksKM&&!looksDon){
    if(!confirm("Tên file (\""+files.map(f=>f.name).join(", ")+"\") trông giống dữ liệu KHUYẾN MÃI, nhưng bạn đang chọn tải vào mục DUYỆT ĐƠN.\n\nBạn có chắc muốn tiếp tục?"))return;
  }
  if(target==="km"&&looksDon&&!looksKM){
    if(!confirm("Tên file (\""+files.map(f=>f.name).join(", ")+"\") trông giống dữ liệu DUYỆT ĐƠN, nhưng bạn đang chọn tải vào mục KHUYẾN MÃI.\n\nBạn có chắc muốn tiếp tục?"))return;
  }
  window._lastUploadFiles=files; // giữ file gốc để backup lên cloud sau khi xử lý xong
  processFiles(files,0,null,target);
});

// ===== LỌC NGÀY KHI CỘNG DỒN: giữ mọi ngày có lượng đơn đáng kể, bỏ mẩu lẻ ở ranh giới nửa đêm =====
// Chỉ dùng cho chế độ "Thêm ngày (cộng dồn)". Mirror cách chia ngày trong processChunks:
// DON = cột T (idx19, GMT-4); KM = cột B (idx1, GMT+8 → GMT-4 trừ 12h).
function _dayOfRow(row,target){
  let pd=null;
  if(target==="km"){
    const v=row[1];
    if(v instanceof Date)pd=v;
    else if(typeof v==="number"&&v>40000)pd=new Date((v-25569)*86400000);
    else if(v){try{pd=new Date(String(v).replace(" ","T"));}catch(e){}}
    if(!pd||isNaN(pd.getTime()))return 0;
    return new Date(pd.getTime()-12*3600000).getDate();
  }
  const v=row[19];
  if(v instanceof Date)pd=v;
  else if(typeof v==="number"&&v>40000)pd=new Date((v-25569)*86400000);
  else if(v){try{pd=new Date(String(v).replace(/(\d{4})\/(\d{2})\/(\d{2})/,'$1-$2-$3').replace(" ","T"));}catch(e){}}
  if(!pd||isNaN(pd.getTime()))return 0;
  return pd.getDate();
}
// Trả về aoa đã lọc; chính aoa nếu không cần lọc; null nếu user hủy.
function filterUploadDays(aoa,target){
  const hist={};
  for(let i=1;i<aoa.length;i++){const d=_dayOfRow(aoa[i]||[],target);if(d)hist[d]=(hist[d]||0)+1;}
  const days=Object.keys(hist).map(Number);
  if(days.length<=1)return aoa;
  const max=Math.max(...days.map(d=>hist[d]));
  // Giữ ngày nếu >=5% ngày lớn nhất HOẶC >=100 đơn (bảo vệ ngày thật nhưng ít đơn); còn lại = mẩu lẻ -> bỏ.
  const keep=new Set(days.filter(d=>hist[d]>=max*0.05||hist[d]>=100));
  const drop=days.filter(d=>!keep.has(d)).sort((a,b)=>a-b);
  if(!drop.length)return aoa;
  const dd=d=>String(d).padStart(2,"0");
  const keepStr=[...keep].sort((a,b)=>a-b).map(d=>"ngày "+dd(d)+" ("+hist[d].toLocaleString("vi")+" đơn)").join(", ");
  const dropStr=drop.map(d=>"ngày "+dd(d)+" ("+hist[d]+" đơn)").join(", ");
  const dropTotal=drop.reduce((s,d)=>s+hist[d],0);
  if(!confirm("File này chứa nhiều ngày:\n\n• GIỮ: "+keepStr+"\n• BỎ (lẻ ở ranh giới nửa đêm): "+dropStr+"\n\nTổng "+dropTotal+" đơn lẻ sẽ bị loại để không lẫn sang ngày khác.\n\nĐồng ý?"))return null;
  const out=[aoa[0]];
  for(let i=1;i<aoa.length;i++){const row=aoa[i]||[];const d=_dayOfRow(row,target);if(d===0||keep.has(d))out.push(row);}
  return out;
}

function processFiles(files,idx,acc,target){
  if(idx>=files.length){finalizeResult(acc,target);return;}
  const file=files[idx];
  showProg((target==="km"?"[Khuyến Mãi] ":"")+files.map(f=>f.name).join(", "));
  setProg(0,"Đang đọc file "+(idx+1)+"/"+files.length+"...","");
  const reader=new FileReader();
  reader.onload=function(ev){
    setProg(5,"Đang parse Excel...","");
    setTimeout(function(){
      try{
        const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
        const wsName=wb.SheetNames.find(s=>s.toUpperCase()==="XUAT")||wb.SheetNames[0];
        const ws=wb.Sheets[wsName];
        setProg(15,"Đang chuyển đổi dữ liệu...","");
        setTimeout(function(){
          const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""});
          // Chế độ cộng dồn: loại các đơn thuộc ngày lẻ ở ranh giới (giữ mọi ngày thật)
          let useAoa=aoa;
          if(window._uploadMode==="add"){
            const f=filterUploadDays(aoa,target);
            if(f===null){hideProg();return;}
            useAoa=f;
          }
          const nd=initAccum();
          processChunks(useAoa,1,nd,files,idx,acc,target);
        },30);
      }catch(err){hideProg();alert("Lỗi đọc file: "+err.message);}
    },50);
  };
  reader.readAsArrayBuffer(file);
}

// ===== BÁO CÁO ĐƠN RÚT: helper dùng chung =====
const DR_DEFAULT_BR=[[200,5000],[5001,20000],[20001,50000],[50001,149999],[150000,500000]];
function brLabelOf(lo,hi){return lo.toLocaleString('vi')+' – '+hi.toLocaleString('vi');}
// Số tiền hạn mức của FK (từ LIMITS, ví dụ "40.000" -> 40000); 0 = chưa đặt
function fkLimitNum(fk){const s=(LIMITS[fk]&&LIMITS[fk].limit)||'';const n=parseInt(String(s).replace(/[^\d]/g,''),10);return isNaN(n)?0:n;}
function fmtDurSec(d){if(d==null)return '';d=Math.round(d);const h=Math.floor(d/3600),m=Math.floor((d%3600)/60),s=d%60;if(h>0)return h+'g'+String(m).padStart(2,'0')+'p';if(m>0)return m+'p'+String(s).padStart(2,'0')+'s';return s+'s';}
function m31x24(){return Array.from({length:31},()=>new Array(24).fill(0));}
function initAccum(){
  const nd={
    day_scores:new Array(31).fill(0), day_counts:new Array(31).fill(0),
    hour_scores_gmt7:new Array(24).fill(0), hour_counts_gmt7:new Array(24).fill(0),
    hour_scores_gmt4:new Array(24).fill(0), hour_counts_gmt4:new Array(24).fill(0),
    fk_data:{}, days_in_month:[], month:"",
    _dayRaw:new Array(31).fill(0), _hr7Raw:new Array(24).fill(0), _hr4Raw:new Array(24).fill(0),
    _daySet:new Set(), _mSet:new Set(),
    _day7Raw:new Array(31).fill(0), day_counts_d7:new Array(31).fill(0), _d7Set:new Set(),
    _hbd7:m31x24(), cbd7:m31x24(), // điểm & số đơn theo [ngày][giờ GMT+7] — cho view Theo Ngày
    _unk:{}, // mã "fk..." trong ghi chú không khớp nhân viên nào -> cảnh báo cuối lần upload
    kmstat:{ok:new Array(31).fill(0),rej:new Array(31).fill(0),reward:new Array(31).fill(0),promos:{}} // KM: thành công/từ chối/tiền thưởng theo ngày + theo từng mã KM
  };
  FK_KEYS.forEach(fk=>{
    nd.fk_data[fk]={
      name:FK_NAMES[fk], group:FKVIP.includes(fk)?"vip":"onl",
      total_score:0, total_count:0,
      day_scores:new Array(31).fill(0), day_counts:new Array(31).fill(0),
      hour_scores_gmt7:new Array(24).fill(0), hour_counts_gmt7:new Array(24).fill(0),
      hour_scores_gmt4:new Array(24).fill(0),
      _dayRaw:new Array(31).fill(0), _hr7Raw:new Array(24).fill(0), _hr4Raw:new Array(24).fill(0),
      _day7Raw:new Array(31).fill(0),
      _hbd7:m31x24(), _cbd7:m31x24()
    };
  });
  return nd;
}

function processChunks(aoa,start,nd,files,fileIdx,prevAcc,target){
  const CHUNK=10000;
  const total=aoa.length;
  const end=Math.min(start+CHUNK,total);
  for(let i=start;i<end;i++){
    const row=aoa[i];
    if(!row||row.length<18)continue;
    let pd=null,fk=null,sc=0,h4=0,h7=0,day=0,hbdDay=0;
    if(target==="km"){
      // KM: cột B (idx 1) = Thời gian gửi GMT+8, cột R (idx 17) = Nhân viên xử lý
      if(row[1] instanceof Date){pd=row[1];}
      else if(typeof row[1]==="number"&&row[1]>40000){pd=new Date((row[1]-25569)*86400000);}
      else if(row[1]){try{pd=new Date(String(row[1]).replace(" ","T"));}catch(e){}}
      if(!pd||isNaN(pd.getTime()))continue;
      // GMT+8 → GMT-4: trừ 12 giờ — đồng nhất logic ngày với file Duyệt Đơn
      const pd4=new Date(pd.getTime()-12*3600000);
      h4=pd4.getHours(); h7=(h4+GMT_OFFSET)%24; day=pd4.getDate();
      nd._daySet.add(day);
      nd._mSet.add((pd4.getMonth()+1)+"/"+pd4.getFullYear());
      // GMT+7 display tracking (pd4 + 11h = GMT+7)
      const pd7=new Date(pd.getTime()-3600000);
      const day_gmt7=pd7.getDate();
      // Thống kê KM (đếm MỌI dòng, kể cả không nhận diện được FK) — chia ngày theo GMT-4 (độc lập với KM Theo Ngày):
      // cột Q (idx 16) Lý do từ chối: có chữ = từ chối, trống = thành công; cột L (idx 11) Điểm thưởng
      const rejTxt=String(row[16]||"").trim();
      const promoName=String(row[14]||"").trim()||"(không mã)"; // cột O: Mã khuyến mãi — tách riêng NV1/NV2...
      if(!nd.kmstat.promos[promoName])nd.kmstat.promos[promoName]={ok:0,rej:0,reward:0};
      const P=nd.kmstat.promos[promoName];
      if(rejTxt){nd.kmstat.rej[day-1]++;P.rej++;}
      else{
        nd.kmstat.ok[day-1]++;P.ok++;
        const reward=typeof row[11]==="number"?row[11]:(parseFloat(String(row[11]||"").replace(/[^0-9.\-]/g,""))||0);
        nd.kmstat.reward[day-1]+=reward;P.reward+=reward;
      }
      fk=mfk(String(row[17]||""));
      if(!fk){noteUnknownFk(nd,row[17]);continue;}
      sc=1;
      hbdDay=day_gmt7; // KM: view Theo Ngày dùng ngày GMT+7
      nd._day7Raw[day_gmt7-1]+=sc; nd.day_counts_d7[day_gmt7-1]++; nd._d7Set.add(day_gmt7);
      nd.fk_data[fk]._day7Raw[day_gmt7-1]+=sc;
    }else{
      // DON: cột T (idx 19) = ngày giờ, cột U (idx 20) = ghi chú FK, cột F (idx 5) = Cấp độ thành viên
      const note=String(row[20]||""),status=String(row[17]||"").trim(),colB=row[1];
      // Chỉ nhận 3 trạng thái: Đã rút tiền / Đã trả lại / Đã từ chối — dòng khác bỏ hẳn
      if(!donStatusKind(status))continue;
      const amt=typeof row[15]==="number"?row[15]:(parseFloat(String(row[15]||"").replace(/[^0-9.\-]/g,""))||0);
      // Quy định: đơn của tài khoản CÓ TÍCH XANH (✅ ở cột F) với số tiền < 7000 -> bỏ hẳn, không điểm không đếm đơn
      const capdo=String(row[5]||"");
      if(capdo.includes("✅")&&amt<7000)continue;
      if(row[19] instanceof Date){pd=row[19];}
      else if(typeof row[19]==="number"&&row[19]>40000){pd=new Date((row[19]-25569)*86400000);}
      else if(row[19]){try{pd=new Date(String(row[19]).replace(/(\d{4})\/(\d{2})\/(\d{2})/,'$1-$2-$3').replace(' ','T'));}catch(e){}}
      if(!pd||isNaN(pd.getTime()))continue;
      h4=pd.getHours(); h7=(h4+GMT_OFFSET)%24; day=pd.getDate();
      nd._daySet.add(day);
      nd._mSet.add((pd.getMonth()+1)+"/"+pd.getFullYear());
      fk=mfk(note);
      if(!fk){noteUnknownFk(nd,note);continue;}
      sc=gsc(colB,amt,status);
      hbdDay=day; // DON: view Theo Ngày dùng ngày GMT-4 (đồng nhất day_scores)
    }
    nd._hbd7[hbdDay-1][h7]+=sc; nd.cbd7[hbdDay-1][h7]++;
    nd.fk_data[fk]._hbd7[hbdDay-1][h7]+=sc; nd.fk_data[fk]._cbd7[hbdDay-1][h7]++;
    nd.fk_data[fk]._dayRaw[day-1]+=sc; nd.fk_data[fk].day_counts[day-1]++;
    nd.fk_data[fk]._hr7Raw[h7]+=sc; nd.fk_data[fk].hour_counts_gmt7[h7]++;
    nd.fk_data[fk]._hr4Raw[h4]+=sc; nd.fk_data[fk].total_count++;
    nd._dayRaw[day-1]+=sc; nd.day_counts[day-1]++;
    nd._hr7Raw[h7]+=sc; nd.hour_counts_gmt7[h7]++;
    nd._hr4Raw[h4]+=sc; nd.hour_counts_gmt4[h4]++;
  }
  const pct=15+Math.floor((end/total)*80);
  const fileBase=fileIdx/files.length*100;
  const fileShare=100/files.length;
  const totalPct=Math.round(fileBase+pct*fileShare/100);
  setProg(Math.min(99,totalPct),"Đã xử lý "+end.toLocaleString()+" / "+total.toLocaleString()+" dòng","File "+(fileIdx+1)+" / "+files.length);
  if(end<total){
    setTimeout(()=>processChunks(aoa,end,nd,files,fileIdx,prevAcc,target),0);
  }else{
    const merged=mergeAccum(prevAcc,nd);
    processFiles(files,fileIdx+1,merged,target);
  }
}

function mergeAccum(base,add){
  if(!base) return add;
  for(let i=0;i<31;i++){base._dayRaw[i]+=add._dayRaw[i];base.day_counts[i]+=add.day_counts[i];base._day7Raw[i]+=add._day7Raw[i];base.day_counts_d7[i]+=add.day_counts_d7[i];}
  for(let i=0;i<24;i++){base._hr7Raw[i]+=add._hr7Raw[i];base.hour_counts_gmt7[i]+=add.hour_counts_gmt7[i];base._hr4Raw[i]+=add._hr4Raw[i];base.hour_counts_gmt4[i]+=add.hour_counts_gmt4[i];}
  for(let d=0;d<31;d++)for(let h=0;h<24;h++){base._hbd7[d][h]+=add._hbd7[d][h];base.cbd7[d][h]+=add.cbd7[d][h];}
  if(base.kmstat&&add.kmstat){
    for(let i=0;i<31;i++){base.kmstat.ok[i]+=add.kmstat.ok[i];base.kmstat.rej[i]+=add.kmstat.rej[i];base.kmstat.reward[i]+=add.kmstat.reward[i];}
    if(add.kmstat.promos){
      if(!base.kmstat.promos)base.kmstat.promos={};
      Object.entries(add.kmstat.promos).forEach(([nm,p])=>{
        if(!base.kmstat.promos[nm])base.kmstat.promos[nm]={ok:0,rej:0,reward:0};
        base.kmstat.promos[nm].ok+=p.ok;base.kmstat.promos[nm].rej+=p.rej;base.kmstat.promos[nm].reward+=p.reward;
      });
    }
  }
  FK_KEYS.forEach(fk=>{
    const bf=base.fk_data[fk],af=add.fk_data[fk];
    bf.total_count+=af.total_count;
    for(let i=0;i<31;i++){bf._dayRaw[i]+=af._dayRaw[i];bf.day_counts[i]+=af.day_counts[i];bf._day7Raw[i]+=af._day7Raw[i];}
    for(let i=0;i<24;i++){bf._hr7Raw[i]+=af._hr7Raw[i];bf.hour_counts_gmt7[i]+=af.hour_counts_gmt7[i];bf._hr4Raw[i]+=af._hr4Raw[i];}
    for(let d=0;d<31;d++)for(let h=0;h<24;h++){bf._hbd7[d][h]+=af._hbd7[d][h];bf._cbd7[d][h]+=af._cbd7[d][h];}
  });
  if(add._unk){if(!base._unk)base._unk={};Object.entries(add._unk).forEach(([k,v])=>{base._unk[k]=(base._unk[k]||0)+v;});}
  add._daySet.forEach(d=>base._daySet.add(d));
  add._mSet.forEach(m=>base._mSet.add(m));
  add._d7Set.forEach(d=>base._d7Set.add(d));
  return base;
}

// ===== CỘNG DỒN THEO NGÀY (add mode) =====
// Ngày nào đã có dữ liệu (dựa trên số đơn theo ngày-giờ cbd7 — đúng cơ sở ngày cho cả DON/KM)
function dsDaysPresent(ds){
  const out=[];
  if(!ds||!ds.cbd7)return out;
  for(let d=0;d<31;d++){let s=0;for(let h=0;h<24;h++)s+=ds.cbd7[d][h]||0;if(s>0)out.push(d+1);}
  return out;
}
// Cộng toàn bộ dữ liệu "add" vào "base" (theo từng phần tử) — dùng khi ngày không trùng
function dsAddInto(base,add){
  const A=(x,y)=>{for(let i=0;i<x.length;i++)x[i]+=(y[i]||0);};
  A(base.day_scores,add.day_scores);A(base.day_counts,add.day_counts);
  A(base.hour_scores_gmt7,add.hour_scores_gmt7);A(base.hour_counts_gmt7,add.hour_counts_gmt7);
  A(base.hour_scores_gmt4,add.hour_scores_gmt4);A(base.hour_counts_gmt4,add.hour_counts_gmt4);
  for(let d=0;d<31;d++)for(let h=0;h<24;h++){base.hbd7[d][h]+=add.hbd7[d][h]||0;base.cbd7[d][h]+=add.cbd7[d][h]||0;}
  if(add.day_scores_d7){if(!base.day_scores_d7)base.day_scores_d7=new Array(31).fill(0);A(base.day_scores_d7,add.day_scores_d7);}
  if(add.kmstat){
    if(!base.kmstat)base.kmstat={ok:new Array(31).fill(0),rej:new Array(31).fill(0),reward:new Array(31).fill(0),promos:{}};
    A(base.kmstat.ok,add.kmstat.ok);A(base.kmstat.rej,add.kmstat.rej);A(base.kmstat.reward,add.kmstat.reward);
    if(add.kmstat.promos){if(!base.kmstat.promos)base.kmstat.promos={};Object.entries(add.kmstat.promos).forEach(([nm,p])=>{if(!base.kmstat.promos[nm])base.kmstat.promos[nm]={ok:0,rej:0,reward:0};base.kmstat.promos[nm].ok+=p.ok;base.kmstat.promos[nm].rej+=p.rej;base.kmstat.promos[nm].reward+=p.reward;});}
  }
  FK_KEYS.forEach(fk=>{
    const b=base.fk_data[fk],a=add.fk_data[fk];if(!b||!a)return;
    b.total_score+=a.total_score||0;b.total_count+=a.total_count||0;
    A(b.day_scores,a.day_scores);A(b.day_counts,a.day_counts);
    A(b.hour_scores_gmt7,a.hour_scores_gmt7);A(b.hour_counts_gmt7,a.hour_counts_gmt7);A(b.hour_scores_gmt4,a.hour_scores_gmt4);
    for(let d=0;d<31;d++)for(let h=0;h<24;h++){b.hbd7[d][h]+=a.hbd7[d][h]||0;b.cbd7[d][h]+=a.cbd7[d][h]||0;}
    if(a.day_scores_d7){if(!b.day_scores_d7)b.day_scores_d7=new Array(31).fill(0);A(b.day_scores_d7,a.day_scores_d7);}
  });
}
// Trừ bỏ đóng góp của 1 ngày (1-based) khỏi base — dùng trước khi thay lại ngày trùng
function dsSubtractDay(ds,day){
  const di=day-1,rot=h4=>(h4+GMT_OFFSET)%24;
  for(let h=0;h<24;h++){ds.hour_scores_gmt7[h]-=ds.hbd7[di][h]||0;ds.hour_counts_gmt7[h]-=ds.cbd7[di][h]||0;}
  for(let h4=0;h4<24;h4++){ds.hour_scores_gmt4[h4]-=ds.hbd7[di][rot(h4)]||0;ds.hour_counts_gmt4[h4]-=ds.cbd7[di][rot(h4)]||0;}
  ds.day_scores[di]=0;ds.day_counts[di]=0;
  if(ds.day_scores_d7)ds.day_scores_d7[di]=0;
  if(ds.kmstat){ds.kmstat.ok[di]=0;ds.kmstat.rej[di]=0;ds.kmstat.reward[di]=0;}
  FK_KEYS.forEach(fk=>{
    const b=ds.fk_data[fk];if(!b||!b.hbd7||!b.cbd7)return;
    let ss=0,cc=0;
    for(let h=0;h<24;h++){const s=b.hbd7[di][h]||0,c=b.cbd7[di][h]||0;ss+=s;cc+=c;b.hour_scores_gmt7[h]-=s;b.hour_counts_gmt7[h]-=c;}
    for(let h4=0;h4<24;h4++)b.hour_scores_gmt4[h4]-=b.hbd7[di][rot(h4)]||0;
    b.total_score-=ss;b.total_count-=cc;
    b.day_scores[di]=0;b.day_counts[di]=0;
    if(b.day_scores_d7)b.day_scores_d7[di]=0;
    for(let h=0;h<24;h++){b.hbd7[di][h]=0;b.cbd7[di][h]=0;}
  });
  for(let h=0;h<24;h++){ds.hbd7[di][h]=0;ds.cbd7[di][h]=0;}
}
// DON (roundV2): suy MỌI số hiển thị từ ô thô hbd7/cbd7 — làm tròn LÊN riêng từng NGÀY,
// tổng tháng = CỘNG các ngày đã làm tròn. Nhờ vậy upload cả tháng 1 lần hay cộng dồn từng ngày đều ra cùng kết quả.
function dsRecalcScores(ds){
  const rot=h4=>(h4+GMT_OFFSET)%24;
  for(let d=0;d<31;d++){let s=0,c=0;for(let h=0;h<24;h++){s+=ds.hbd7[d][h]||0;c+=ds.cbd7[d][h]||0;}ds.day_scores[d]=Math.ceil(s);ds.day_counts[d]=c;}
  for(let h=0;h<24;h++){let s=0,c=0;for(let d=0;d<31;d++){s+=ds.hbd7[d][h]||0;c+=ds.cbd7[d][h]||0;}ds.hour_scores_gmt7[h]=Math.ceil(s);ds.hour_counts_gmt7[h]=c;}
  for(let h4=0;h4<24;h4++){const h7=rot(h4);let s=0,c=0;for(let d=0;d<31;d++){s+=ds.hbd7[d][h7]||0;c+=ds.cbd7[d][h7]||0;}ds.hour_scores_gmt4[h4]=Math.ceil(s);ds.hour_counts_gmt4[h4]=c;}
  FK_KEYS.forEach(fk=>{
    const b=ds.fk_data[fk];if(!b||!b.hbd7||!b.cbd7)return;
    let tot=0,cnt=0;
    for(let d=0;d<31;d++){let s=0,c=0;for(let h=0;h<24;h++){s+=b.hbd7[d][h]||0;c+=b.cbd7[d][h]||0;}b.day_scores[d]=Math.ceil(s);b.day_counts[d]=c;tot+=Math.ceil(s);cnt+=c;}
    b.total_score=tot;b.total_count=cnt;
    for(let h=0;h<24;h++){let s=0,c=0;for(let d=0;d<31;d++){s+=b.hbd7[d][h]||0;c+=b.cbd7[d][h]||0;}b.hour_scores_gmt7[h]=Math.ceil(s);b.hour_counts_gmt7[h]=c;}
    for(let h4=0;h4<24;h4++){const h7=rot(h4);let s=0;for(let d=0;d<31;d++)s+=b.hbd7[d][h7]||0;b.hour_scores_gmt4[h4]=Math.ceil(s);}
  });
}
// Tính lại danh sách ngày có dữ liệu sau khi cộng dồn
function dsRecalcDays(ds){
  const dim=[];for(let d=0;d<31;d++)if((ds.day_counts[d]||0)>0)dim.push(d+1);
  ds.days_in_month=dim;
  const d7=dsDaysPresent(ds);
  if(ds.day_scores_d7)ds.days_in_month_d7=d7; // KM: ngày theo GMT+7
}
// Lưu 1 tháng (dùng cho add mode): lưu snapshot + backup file gốc (cắt G/H/I nếu DON)
async function saveMonthData(type,month,ds){
  await SB.saveReport(type,month,ds);
  let upFiles=window._lastUploadFiles;
  if(type==="don"&&upFiles&&upFiles.length){try{upFiles=await Promise.all(upFiles.map(f=>stripSensitiveCols(f,[6,7,8])));}catch(e){}}
  await SB.uploadOriginals(upFiles,type,month);
  window._lastUploadFiles=null;
}
// Xử lý upload chế độ "Thêm ngày (cộng dồn)"
async function applyAddMode(target,nd){
  const type=target==="km"?"km":"don";
  const month=normMonth(nd.month);
  const lbl=type==="km"?"Khuyến Mãi":"Duyệt Đơn";
  try{
    let base=null;
    try{base=await SB.loadReport(type,month);}catch(e){}
    if(!base){
      // Cloud chưa có -> lưu thẳng như bản đầu tiên
      if(type==="km")KMD=nd;else{D=nd;setMonthLabel(month,false);}
      CUR_MONTH=month;rAll();
      await saveMonthData(type,month,nd);
      logAction('Thêm ngày (cộng dồn) '+lbl,'Tháng '+dispMonth(month)+' · '+dsDaysPresent(nd).join(', ')+' · lần đầu');
      setCloudStatus('Đã thêm dữ liệu tháng '+dispMonth(month)+' ✓');
      return;
    }
    // Kiểm "dữ liệu cũ" dựa trên bản ghi, KHÔNG dựa vào 1 FK cụ thể (FK_KEYS[0] có thể là người mới thêm
    // -> chưa có trong bản ghi cloud, sẽ báo nhầm là dữ liệu cũ).
    const anyFk=base.fk_data?Object.values(base.fk_data).some(f=>f&&f.cbd7):false;
    const legacy=!base.cbd7||!base.fk_data||!anyFk||(type==="don"&&!base.roundV2);
    if(legacy){
      alert('Dữ liệu '+lbl+' tháng '+dispMonth(month)+' được tạo TRƯỚC bản cập nhật (cách làm tròn cũ) nên chưa cộng dồn được.\n\nHãy upload lại 1 lần ở chế độ "Thay thế cả tháng" cho tháng này, sau đó mới dùng "Thêm ngày".');
      return;
    }
    // Bổ sung ô trống cho nhân viên có trong danh sách nhưng chưa có trong bản ghi cloud
    // (thêm sau lần upload đầu của tháng) — nếu không, dsAddInto sẽ BỎ QUA toàn bộ đơn của họ.
    reconcileDataset(base);
    const baseDays=dsDaysPresent(base),newDays=dsDaysPresent(nd);
    const overlap=newDays.filter(d=>baseDays.includes(d));
    if(overlap.length){
      if(!confirm('Các ngày ['+overlap.join(', ')+'] ĐÃ CÓ dữ liệu trên cloud.\n\nBạn muốn THAY LẠI các ngày này bằng dữ liệu mới không? (các ngày khác giữ nguyên, KHÔNG cộng đôi)\n\n— OK: thay lại các ngày trùng\n— Cancel: hủy, không lưu gì')){
        setCloudStatus('Đã hủy — dữ liệu cũ tháng '+dispMonth(month)+' giữ nguyên',true);
        return;
      }
      overlap.forEach(d=>dsSubtractDay(base,d));
    }
    dsAddInto(base,nd);
    if(type==="don")dsRecalcScores(base); // DON: tính lại toàn bộ từ ô thô — kết quả không phụ thuộc thứ tự/số lần upload
    dsRecalcDays(base);
    base.month=nd.month;base.fkvip=FKVIP;base.fkonl=FKONL;
    if(type==="km")KMD=base;else{D=base;setMonthLabel(month,false);}
    CUR_MONTH=month;rAll();
    await saveMonthData(type,month,base);
    logAction('Thêm ngày (cộng dồn) '+lbl,'Tháng '+dispMonth(month)+' · thêm ngày ['+newDays.join(', ')+']'+(overlap.length?' · thay lại ['+overlap.join(', ')+']':''));
    setCloudStatus('Đã cộng dồn ngày ['+newDays.join(', ')+'] vào tháng '+dispMonth(month)+' ✓');
  }catch(e){
    console.error('applyAddMode',e);
    setCloudStatus('Lỗi cộng dồn: '+(e.message||e),true);
  }
}

function finalizeResult(nd,target){
  setProg(100,"Hoàn tất!","Đang cập nhật giao diện...");
  setTimeout(function(){
    if(target==="km"){
      // KM: điểm luôn nguyên (mỗi đơn = 1) — giữ cách chốt cũ
      for(let i=0;i<31;i++) nd.day_scores[i]=Math.ceil(nd._dayRaw[i]);
      for(let i=0;i<24;i++){nd.hour_scores_gmt7[i]=Math.ceil(nd._hr7Raw[i]);nd.hour_scores_gmt4[i]=Math.ceil(nd._hr4Raw[i]);}
      nd.hbd7=nd._hbd7.map(r=>r.map(Math.ceil));delete nd._hbd7;
      FK_KEYS.forEach(fk=>{
        const fd=nd.fk_data[fk];
        fd.day_scores=fd._dayRaw.map(Math.ceil);
        fd.hour_scores_gmt7=fd._hr7Raw.map(Math.ceil);
        fd.hour_scores_gmt4=fd._hr4Raw.map(Math.ceil);
        fd.total_score=Math.ceil(fd._dayRaw.reduce((a,b)=>a+b,0));
        fd.hbd7=fd._hbd7.map(r=>r.map(Math.ceil));delete fd._hbd7;
        fd.cbd7=fd._cbd7;delete fd._cbd7;
        delete fd._dayRaw;delete fd._hr7Raw;delete fd._hr4Raw;
        if(fd._day7Raw){fd.day_scores_d7=fd._day7Raw.map(Math.ceil);delete fd._day7Raw;}
      });
      nd.day_scores_d7=nd._day7Raw.map(Math.ceil);
      nd.days_in_month_d7=[...nd._d7Set].sort((a,b)=>a-b);
    }else{
      // DON (roundV2): giữ ô ngày-giờ THÔ (số lẻ 0.5), mọi số hiển thị suy từ ô thô —
      // làm tròn LÊN riêng từng ngày, tổng tháng = cộng các ngày đã làm tròn
      nd.hbd7=nd._hbd7;delete nd._hbd7;
      FK_KEYS.forEach(fk=>{
        const fd=nd.fk_data[fk];
        fd.hbd7=fd._hbd7;delete fd._hbd7;
        fd.cbd7=fd._cbd7;delete fd._cbd7;
        delete fd._dayRaw;delete fd._hr7Raw;delete fd._hr4Raw;delete fd._day7Raw;
      });
      dsRecalcScores(nd);
      nd.roundV2=true;
    }
    delete nd._dayRaw;delete nd._hr7Raw;delete nd._hr4Raw;delete nd._day7Raw;delete nd.day_counts_d7;delete nd._d7Set;
    nd.days_in_month=[...nd._daySet].sort((a,b)=>a-b);
    delete nd._daySet;
    const months=[...nd._mSet].sort();
    nd.month=months[months.length-1]||"";
    delete nd._mSet;
    nd.days=Array.from({length:31},(_,i)=>i+1);
    nd.hour_labels_gmt7=Array.from({length:24},(_,h)=>String(h).padStart(2,"0")+"H");
    nd.hour_labels_gmt4=Array.from({length:24},(_,h)=>String(h).padStart(2,"0")+"H");
    nd.fkvip=FKVIP; nd.fkonl=FKONL;
    const totalMatched=FK_KEYS.reduce((s,fk)=>s+nd.fk_data[fk].total_count,0);
    if(totalMatched===0){
      hideProg();
      alert("❌ Không nhận diện được dữ liệu nào trong file.\n\nVui lòng kiểm tra lại:\n— File có đúng định dạng/cột như mẫu không?\n— Bạn có đang chọn đúng loại tải lên (Duyệt Đơn / Khuyến Mãi) không?\n\nDữ liệu hiện có KHÔNG bị thay đổi.");
      return;
    }
    hideProg();
    // CẢNH BÁO: ghi chú có mã "FK..." nhưng KHÔNG khớp nhân viên nào trong danh sách của tháng
    // (nhân viên bị ẩn / mới thêm / sai "Mã Excel") -> những đơn này bị bỏ hoàn toàn, không tính cho ai.
    const unk=Object.entries(nd._unk||{}).filter(([k,v])=>v>=10).sort((a,b)=>b[1]-a[1]);
    delete nd._unk;
    if(unk.length){
      const lst=unk.slice(0,10).map(([k,v])=>"   • "+k.toUpperCase()+" — "+v.toLocaleString("vi")+" đơn").join("\n");
      const tot=unk.reduce((s,x)=>s+x[1],0);
      if(!confirm("⚠ CÓ "+tot.toLocaleString("vi")+" ĐƠN KHÔNG TÍNH CHO AI\n\nGhi chú của các đơn này có mã FK nhưng KHÔNG khớp nhân viên nào trong danh sách tháng đang mở:\n\n"+lst+"\n\nNguyên nhân thường gặp: nhân viên đang bị ẩn (nghỉ), chưa được thêm vào danh sách tháng này, hoặc \"Mã Excel\" trong 👥 Quản lý nhân viên không trùng với ghi chú.\n\n— OK: vẫn lưu (số đơn trên sẽ MẤT)\n— Cancel: hủy để sửa danh sách nhân viên rồi upload lại")){
        setCloudStatus("Đã hủy upload — hãy sửa Mã Excel / danh sách nhân viên rồi tải lại",true);
        return;
      }
    }
    hideProg();
    if(window._uploadMode==='add'){
      // Chế độ cộng dồn: gộp vào dữ liệu tháng đang có trên cloud
      applyAddMode(target,nd);
    }else{
      // Chế độ thay thế cả tháng (mặc định)
      if(target==="km"){KMD=nd;}else{D=nd;setMonthLabel(normMonth(nd.month),false);}
      rAll();
      cloudSaveKO(target,nd);
    }
  },50);
}
