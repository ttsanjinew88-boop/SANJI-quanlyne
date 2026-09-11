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

// ===== KHUYẾN MÃI: FILE GMT+8, HỆ THỐNG THỐNG KÊ GMT-4 (chốt 11/09/2026 — canh bởi test nhóm 15) =====
// Nền tảng xuất file KM cắt theo NGÀY GMT+8 (cột B = Thời gian gửi, GMT+8). Một ngày GMT+8 = từ 12:00 hôm TRƯỚC
// tới 12:00 hôm đó theo GMT-4 ⇒ mỗi file KM luôn chia đôi sang HAI ngày GMT-4 (và file ngày 01 có nửa thuộc THÁNG TRƯỚC).
// ⇒ Mọi con số KM (điểm, số đơn, Thống kê KM, view Theo Ngày) chia ngày theo GMT-4; ô ngày-giờ hbd7/cbd7 = [ngày GMT-4][giờ GMT+7]
//    giống hệt Duyệt Đơn. Cộng dồn KHÔNG thay theo NGÀY mà thay theo từng GIỜ file mới phủ (kmReplaceCells).
// Bản cũ: Theo Ngày chia GMT+7, điểm/Thống kê chia GMT-4, tìm "ngày trùng" theo GMT+7 rồi xoá CẢ NGÀY ⇒ mỗi lần cộng dồn
// xoá mất nửa ngày của file hôm trước (đo 10/09/2026: 4 ngày × 72 đơn chỉ còn 81/288); và dòng tháng trước bị dồn
// vào "ngày 30/31" của tháng mới. Bộ dữ liệu theo cách mới mang cờ kmV2:true.
function kmTime(v){
  let pd=null;
  if(v instanceof Date)pd=v;
  else if(typeof v==="number"&&v>40000)pd=new Date((v-25569)*86400000);
  else if(v){try{pd=new Date(String(v).replace(/(\d{4})\/(\d{2})\/(\d{2})/,'$1-$2-$3').replace(" ","T"));}catch(e){}}
  return(pd&&!isNaN(pd.getTime()))?pd:null;
}
const kmT4=pd=>new Date(pd.getTime()-12*3600000);            // GMT+8 → GMT-4
const kmMonthOf=p4=>p4.getFullYear()+'-'+String(p4.getMonth()+1).padStart(2,'0');
const kmCell=p4=>(p4.getDate()-1)*24+(p4.getHours()+GMT_OFFSET)%24;   // chỉ số ô [ngày GMT-4][giờ GMT+7]
// Mọi ô giờ từ giờ của dòng sớm nhất tới giờ của dòng muộn nhất (GMT-4) — "khoảng file này phủ".
function kmCovCells(t0,t1){
  const out=[];if(t0==null||t1==null)return out;
  const t=new Date(t0);t.setMinutes(0,0,0);
  for(let ms=t.getTime();ms<=t1;ms+=3600000)out.push(kmCell(new Date(ms)));
  return out;
}
// Thống kê KM lưu theo Ô (sparse) để thay lại đúng từng giờ; ok/rej/reward/promos suy ra từ ô.
function kmstatAdd(st,k,name,ok,rej,rw){
  const c=st.cells[k]||(st.cells[k]={ok:0,rej:0,rw:0,p:{}});
  c.ok+=ok;c.rej+=rej;c.rw+=rw;
  const p=c.p[name]||(c.p[name]=[0,0,0]);p[0]+=ok;p[1]+=rej;p[2]+=rw;
}
function kmstatRecalc(st){
  if(!st||!st.cells)return;
  st.ok=new Array(31).fill(0);st.rej=new Array(31).fill(0);st.reward=new Array(31).fill(0);st.promos={};
  Object.keys(st.cells).forEach(k=>{
    const c=st.cells[k],d=Math.floor(Number(k)/24);
    st.ok[d]+=c.ok;st.rej[d]+=c.rej;st.reward[d]+=c.rw;
    Object.entries(c.p||{}).forEach(([nm,p])=>{
      const P=st.promos[nm]||(st.promos[nm]={ok:0,rej:0,reward:0});P.ok+=p[0];P.rej+=p[1];P.reward+=p[2];
    });
  });
}
// Xoá sạch các ô (chỉ số ô) khỏi bộ dữ liệu KM — cả tổng, từng nhân viên (kể cả người đã ẩn), lẫn Thống kê KM.
function kmClearCells(ds,cells){
  cells.forEach(k=>{
    const d=Math.floor(k/24),h=k%24;
    ds.hbd7[d][h]=0;ds.cbd7[d][h]=0;
    Object.keys(ds.fk_data||{}).forEach(fk=>{const b=ds.fk_data[fk];if(b&&b.hbd7&&b.cbd7){b.hbd7[d][h]=0;b.cbd7[d][h]=0;}});
    if(ds.kmstat&&ds.kmstat.cells)delete ds.kmstat.cells[k];
  });
}

// ===== LỌC NGÀY KHI CỘNG DỒN: giữ mọi ngày có lượng đơn đáng kể, bỏ mẩu lẻ ở ranh giới nửa đêm =====
// Chỉ dùng cho chế độ "Thêm ngày (cộng dồn)". Chia ngày theo đúng cách FILE được cắt:
// DON = cột T (idx19, GMT-4); KM = cột B (idx1) theo ngày GMT+8 GỐC — file KM cắt theo GMT+8, đổi sang GMT-4
// thì ngày nào cũng thành 2 nửa to ngang nhau và không bao giờ nhận ra được mẩu lẻ.
function _dayOfRow(row,target){
  let pd=null;
  if(target==="km"){
    pd=kmTime(row[1]);
    return pd?pd.getDate():0;
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
  if(idx>=files.length){if(target==="km")kmProcessAll(acc||[]);else finalizeResult(acc,target);return;}
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
          if(target==="km"){
            // KM: gom dòng của mọi file, đọc hết rồi mới CHIA THEO THÁNG GMT-4 (kmProcessAll)
            const rows=acc||[];for(let i=1;i<useAoa.length;i++)rows.push(useAoa[i]);
            processFiles(files,idx+1,rows,target);
            return;
          }
          const nd=initAccum();
          processChunks(useAoa,1,nd,files,idx,acc,target);
        },30);
      }catch(err){hideProg();alert("Lỗi đọc file: "+err.message);}
    },50);
  };
  reader.readAsArrayBuffer(file);
}

// KM: chia các dòng theo THÁNG GMT-4 rồi dựng MỘT bộ dữ liệu cho mỗi tháng. Tháng nhiều dòng nhất là tháng chính
// (đi theo chế độ upload đã chọn); tháng còn lại (thường là nửa ngày cuối tháng trước trong file ngày 01) được
// CỘNG DỒN theo từng giờ vào đúng tháng của nó — không bao giờ lẫn sang tháng chính.
function kmProcessAll(rows){
  const byM={};
  for(const row of rows){
    if(!row||row.length<18)continue;
    const pd=kmTime(row[1]);if(!pd)continue;
    const mk=kmMonthOf(kmT4(pd));(byM[mk]=byM[mk]||[]).push(row);
  }
  // nhiều dòng nhất đứng đầu; HOÀ (file ngày 01 chia đúng đôi) thì tháng SAU thắng — đó là tháng của file theo GMT+8
  const months=Object.keys(byM).sort((a,b)=>(byM[b].length-byM[a].length)||(a<b?1:-1));
  if(!months.length){finalizeResult(initAccum(),"km");return;}
  const out=[];
  const step=i=>{
    if(i>=months.length){finalizeResult(out[0],"km",out.slice(1));return;}
    processChunks([[]].concat(byM[months[i]]),1,initAccum(),[{name:"Tháng "+dispMonth(months[i])}],0,null,"km",nd=>{out.push(nd);step(i+1);});
  };
  step(0);
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
    kmstat:{ok:new Array(31).fill(0),rej:new Array(31).fill(0),reward:new Array(31).fill(0),promos:{},cells:{}}, // KM: thành công/từ chối/tiền thưởng theo ngày + theo từng mã KM (suy từ cells)
    _t0:null,_t1:null // KM: dòng sớm/muộn nhất (GMT-4) — khoảng giờ file phủ, dùng khi cộng dồn
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

function processChunks(aoa,start,nd,files,fileIdx,prevAcc,target,next){
  const CHUNK=10000;
  const total=aoa.length;
  const end=Math.min(start+CHUNK,total);
  for(let i=start;i<end;i++){
    const row=aoa[i];
    if(!row||row.length<18)continue;
    let pd=null,fk=null,sc=0,h4=0,h7=0,day=0,hbdDay=0;
    if(target==="km"){
      // KM: cột B (idx 1) = Thời gian gửi GMT+8, cột R (idx 17) = Nhân viên xử lý. MỌI thứ chia ngày theo GMT-4
      // (xem đầu file). Dòng đã được kmProcessAll chia sẵn theo tháng GMT-4 nên cả bộ chỉ có 1 tháng.
      pd=kmTime(row[1]);if(!pd)continue;
      const pd4=kmT4(pd);
      h4=pd4.getHours(); h7=(h4+GMT_OFFSET)%24; day=pd4.getDate();
      nd._daySet.add(day);
      nd._mSet.add((pd4.getMonth()+1)+"/"+pd4.getFullYear());
      const t=pd4.getTime();
      if(nd._t0==null||t<nd._t0)nd._t0=t;
      if(nd._t1==null||t>nd._t1)nd._t1=t;
      // Thống kê KM (đếm MỌI dòng, kể cả không nhận diện được FK), ghi theo Ô ngày-giờ:
      // cột Q (idx 16) Lý do từ chối: có chữ = từ chối, trống = thành công; cột L (idx 11) Điểm thưởng
      const rejTxt=String(row[16]||"").trim();
      const promoName=String(row[14]||"").trim()||"(không mã)"; // cột O: Mã khuyến mãi — tách riêng NV1/NV2...
      const reward=rejTxt?0:(typeof row[11]==="number"?row[11]:(parseFloat(String(row[11]||"").replace(/[^0-9.\-]/g,""))||0));
      kmstatAdd(nd.kmstat,(day-1)*24+h7,promoName,rejTxt?0:1,rejTxt?1:0,reward);
      fk=mfk(String(row[17]||""));
      if(!fk){noteUnknownFk(nd,row[17]);continue;}
      sc=1;
      hbdDay=day; // KM: ô ngày-giờ theo ngày GMT-4 — giống Duyệt Đơn
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
    setTimeout(()=>processChunks(aoa,end,nd,files,fileIdx,prevAcc,target,next),0);
  }else{
    const merged=mergeAccum(prevAcc,nd);
    if(next)next(merged);
    else processFiles(files,fileIdx+1,merged,target);
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
  // KM kmV2: Thống kê KM nằm ở ô — xoá ô của ngày rồi suy lại (kể cả tổng theo mã KM, bản cũ không trừ phần này)
  if(ds.kmstat&&ds.kmstat.cells){for(let h=0;h<24;h++)delete ds.kmstat.cells[di*24+h];kmstatRecalc(ds.kmstat);}
  // Duyệt theo KEY CÓ TRONG BẢN GHI (không dùng FK_KEYS): xóa ngày ở tháng khác / nhân viên đã ẩn
  // vẫn phải trừ đúng, nếu không tổng tháng về 0 mà ô của FK đó còn số.
  Object.keys(ds.fk_data||{}).forEach(fk=>{
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
  Object.keys(ds.fk_data||{}).forEach(fk=>{
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
// ⚠ KHÔNG đổi màn hình / tháng đang xem cho tới khi máy chủ lưu xong (nghiệm thu 10/09/2026 — canh bởi test nhóm 11–12).
// Bản cũ gán KMD/D + CUR_MONTH rồi mới lưu ⇒ lưu hỏng thì màn hình hiện số chưa hề có trên máy chủ; và nếu file
// là THÁNG KHÁC thì Bất Thường/Tổng Quan/Hạn Mức/Công Việc vẫn là của tháng đang xem ⇒ sửa 1 ô là ghi đè tháng vừa upload.
// KM: các ô file này phủ. Có khoảng giờ (_cov từ finalizeResult) thì dùng; không có (bộ dữ liệu dựng tay) thì lấy
// mọi ô có đơn / có thống kê.
function kmCoverOf(nd){
  if(Array.isArray(nd._cov)&&nd._cov.length)return nd._cov;
  const s=new Set();
  for(let d=0;d<31;d++)for(let h=0;h<24;h++)if((nd.cbd7[d][h]||0)>0)s.add(d*24+h);
  Object.keys((nd.kmstat&&nd.kmstat.cells)||{}).forEach(k=>s.add(Number(k)));
  return[...s];
}
// Thay lại ĐÚNG các ô giờ file mới phủ (xoá ô cũ trong khoảng đó rồi cộng bản mới) — giờ khác giữ nguyên.
function kmReplaceCells(base,nd,cov){
  kmClearCells(base,cov);
  dsAddInto(base,nd);
  base.kmstat=base.kmstat||{};base.kmstat.cells=base.kmstat.cells||{};
  Object.entries((nd.kmstat&&nd.kmstat.cells)||{}).forEach(([k,c])=>{base.kmstat.cells[k]=JSON.parse(JSON.stringify(c));});
  kmstatRecalc(base.kmstat);
  dsRecalcScores(base);   // KM mỗi đơn 1 điểm (số nguyên) ⇒ làm tròn không đổi gì, chỉ suy lại mọi tổng từ ô
}
// Mô tả các ô đã có dữ liệu mà sẽ bị thay: "ngày 01: 12h–23h (GMT-4) — 345 đơn"
function kmOverlapText(base,cov){
  const byDay={};
  cov.forEach(k=>{
    const d=Math.floor(k/24),h=k%24,n=(base.cbd7[d][h]||0);
    const st=base.kmstat&&base.kmstat.cells&&base.kmstat.cells[k];
    if(!n&&!st)return;
    const h4=(h-GMT_OFFSET+24)%24,x=byDay[d]||(byDay[d]={h0:h4,h1:h4,n:0});
    x.h0=Math.min(x.h0,h4);x.h1=Math.max(x.h1,h4);x.n+=n||(st.ok+st.rej);
  });
  return Object.keys(byDay).map(Number).sort((a,b)=>a-b).map(d=>{const x=byDay[d],p=v=>String(v).padStart(2,'0');
    return '• ngày '+p(d+1)+': '+p(x.h0)+'h–'+p(x.h1)+'h (GMT-4) — '+x.n.toLocaleString('vi')+' đơn';}).join('\n');
}
// opt.quiet: phần của THÁNG KHÁC tháng chính trong cùng file KM — không chuyển màn hình sang tháng đó,
//            tháng đó còn định dạng cũ thì không hỏi mà ghi vào opt.notes để báo gộp một lần.
// Trả true nếu đã lưu; false nếu huỷ / không cộng được / lưu hỏng.
async function applyAddMode(target,nd,opt){
  opt=opt||{};
  const type=target==="km"?"km":"don";
  const month=normMonth(nd.month);
  const lbl=type==="km"?"Khuyến Mãi":"Duyệt Đơn";
  const cov=type==="km"?kmCoverOf(nd):null;delete nd._cov;
  let ghi=null,ghiChu='',xong='';
  try{
    let base=null;
    try{base=await SB.loadReport(type,month);}catch(e){}
    if(!base){
      // Cloud chưa có -> lưu thẳng như bản đầu tiên
      ghi=nd;
      ghiChu=dsDaysPresent(nd).join(', ')+' · lần đầu';
      xong='Đã thêm dữ liệu tháng '+dispMonth(month)+' ✓';
    }else{
      // Kiểm "dữ liệu cũ" dựa trên bản ghi, KHÔNG dựa vào 1 FK cụ thể (FK_KEYS[0] có thể là người mới thêm
      // -> chưa có trong bản ghi cloud, sẽ báo nhầm là dữ liệu cũ).
      const anyFk=base.fk_data?Object.values(base.fk_data).some(f=>f&&f.cbd7):false;
      const legacy=!base.cbd7||!base.fk_data||!anyFk||(type==="don"&&!base.roundV2)||(type==="km"&&!base.kmV2);
      if(legacy){
        const why=type==="km"
          ?'Dữ liệu Khuyến Mãi tháng '+dispMonth(month)+' được tạo theo cách chia ngày CŨ (trước 11/09/2026) nên chưa cộng dồn được.'
          :'Dữ liệu '+lbl+' tháng '+dispMonth(month)+' được tạo TRƯỚC bản cập nhật (cách làm tròn cũ) nên chưa cộng dồn được.';
        if(opt.quiet&&opt.notes){opt.notes.push(why);return false;}
        alert(why+'\n\nHãy upload lại 1 lần ở chế độ "Thay thế cả tháng" cho tháng này, sau đó mới dùng "Thêm ngày".');
        return false;
      }
      // Bổ sung ô trống cho nhân viên có trong danh sách nhưng chưa có trong bản ghi cloud
      // (thêm sau lần upload đầu của tháng) — nếu không, dsAddInto sẽ BỎ QUA toàn bộ đơn của họ.
      reconcileDataset(base);
      const newDays=dsDaysPresent(nd);
      if(type==="km"){
        const trung=kmOverlapText(base,cov);
        if(trung&&!confirm('Khoảng giờ của file này ĐÃ CÓ dữ liệu Khuyến Mãi tháng '+dispMonth(month)+' trên cloud:\n\n'+trung+'\n\nTHAY LẠI đúng các giờ này bằng dữ liệu mới? (giờ khác giữ nguyên, KHÔNG cộng đôi)\n\n— OK: thay lại các giờ trùng\n— Cancel: hủy, không lưu gì')){
          setCloudStatus('Đã hủy — dữ liệu cũ tháng '+dispMonth(month)+' giữ nguyên',true);
          return false;
        }
        kmReplaceCells(base,nd,cov);
        ghiChu='thêm ngày ['+newDays.join(', ')+'] theo giờ GMT-4'+(trung?' · thay lại: '+trung.replace(/\n/g,' '):'');
      }else{
        const baseDays=dsDaysPresent(base);
        const overlap=newDays.filter(d=>baseDays.includes(d));
        if(overlap.length){
          if(!confirm('Các ngày ['+overlap.join(', ')+'] ĐÃ CÓ dữ liệu trên cloud.\n\nBạn muốn THAY LẠI các ngày này bằng dữ liệu mới không? (các ngày khác giữ nguyên, KHÔNG cộng đôi)\n\n— OK: thay lại các ngày trùng\n— Cancel: hủy, không lưu gì')){
            setCloudStatus('Đã hủy — dữ liệu cũ tháng '+dispMonth(month)+' giữ nguyên',true);
            return false;
          }
          overlap.forEach(d=>dsSubtractDay(base,d));
        }
        dsAddInto(base,nd);
        dsRecalcScores(base); // DON: tính lại toàn bộ từ ô thô — kết quả không phụ thuộc thứ tự/số lần upload
        ghiChu='thêm ngày ['+newDays.join(', ')+']'+(overlap.length?' · thay lại ['+overlap.join(', ')+']':'');
      }
      dsRecalcDays(base);
      base.month=nd.month;base.fkvip=FKVIP;base.fkonl=FKONL;
      ghi=base;
      xong='Đã cộng dồn ngày ['+newDays.join(', ')+'] vào tháng '+dispMonth(month)+' ✓';
    }
    await saveMonthData(type,month,ghi);
  }catch(e){
    // Ghi hỏng: màn hình và tháng đang xem CHƯA bị đụng tới -> vẫn đúng bản trên máy chủ, cứ upload lại là được.
    saveFailed('Cộng dồn ngày vào tháng '+dispMonth(month)+' — màn hình vẫn giữ bản đang có trên máy chủ',e);
    return false;
  }
  logAction('Thêm ngày (cộng dồn) '+lbl,'Tháng '+dispMonth(month)+' · '+ghiChu);
  if(opt.quiet&&month!==CUR_MONTH){if(opt.notes)opt.notes.push(xong);return true;}
  const hien=await showSavedDataset(type,month,ghi);
  setCloudStatus(hien?xong:xong+' — màn hình vẫn đang ở tháng '+dispMonth(CUR_MONTH)+' (còn thay đổi chưa lưu)',!hien);
  return true;
}

// Biến bộ tích luỹ thành bộ dữ liệu để lưu (không hỏi gì, không lưu gì).
function finalizeDataset(nd,target){
    if(target==="km"){
      // KM: điểm luôn nguyên (mỗi đơn = 1). Mọi thứ theo ngày GMT-4 (kmV2) — KHÔNG còn bản "_d7" theo GMT+7.
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
        delete fd._dayRaw;delete fd._hr7Raw;delete fd._hr4Raw;delete fd._day7Raw;
      });
      kmstatRecalc(nd.kmstat);
      nd._cov=kmCovCells(nd._t0,nd._t1);   // khoảng giờ file phủ — applyAddMode/cloudSaveKO gỡ ra trước khi lưu
      nd.kmV2=true;
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
    delete nd._t0;delete nd._t1;
    return nd;
}
// extras (chỉ KM): bộ dữ liệu của các THÁNG KHÁC trong cùng file — cộng dồn theo giờ vào đúng tháng của chúng,
// SAU KHI tháng chính đã lưu xong (tháng chính bị Huỷ / lưu hỏng thì không đụng tới tháng nào khác).
function finalizeResult(nd,target,extras){
  extras=extras||[];
  setProg(100,"Hoàn tất!","Đang cập nhật giao diện...");
  setTimeout(async function(){
    finalizeDataset(nd,target);
    extras.forEach(x=>finalizeDataset(x,target));
    const matched=x=>FK_KEYS.reduce((s,fk)=>s+x.fk_data[fk].total_count,0);
    const totalMatched=[nd,...extras].reduce((s,x)=>s+matched(x),0);
    if(totalMatched===0){
      hideProg();
      alert("❌ Không nhận diện được dữ liệu nào trong file.\n\nVui lòng kiểm tra lại:\n— File có đúng định dạng/cột như mẫu không?\n— Bạn có đang chọn đúng loại tải lên (Duyệt Đơn / Khuyến Mãi) không?\n\nDữ liệu hiện có KHÔNG bị thay đổi.");
      return;
    }
    hideProg();
    // CẢNH BÁO: ghi chú có mã "FK..." nhưng KHÔNG khớp nhân viên nào trong danh sách của tháng
    // (nhân viên bị ẩn / mới thêm / sai "Mã Excel") -> những đơn này bị bỏ hoàn toàn, không tính cho ai.
    const unkAll={};
    [nd,...extras].forEach(x=>{Object.entries(x._unk||{}).forEach(([k,v])=>{unkAll[k]=(unkAll[k]||0)+v;});delete x._unk;});
    const unk=Object.entries(unkAll).filter(([k,v])=>v>=10).sort((a,b)=>b[1]-a[1]);
    if(unk.length){
      const lst=unk.slice(0,10).map(([k,v])=>"   • "+k.toUpperCase()+" — "+v.toLocaleString("vi")+" đơn").join("\n");
      const tot=unk.reduce((s,x)=>s+x[1],0);
      if(!confirm("⚠ CÓ "+tot.toLocaleString("vi")+" ĐƠN KHÔNG TÍNH CHO AI\n\nGhi chú của các đơn này có mã FK nhưng KHÔNG khớp nhân viên nào trong danh sách tháng đang mở:\n\n"+lst+"\n\nNguyên nhân thường gặp: nhân viên đang bị ẩn (nghỉ), chưa được thêm vào danh sách tháng này, hoặc \"Mã Excel\" trong 👥 Quản lý nhân viên không trùng với ghi chú.\n\n— OK: vẫn lưu (số đơn trên sẽ MẤT)\n— Cancel: hủy để sửa danh sách nhân viên rồi upload lại")){
        setCloudStatus("Đã hủy upload — hãy sửa Mã Excel / danh sách nhân viên rồi tải lại",true);
        return;
      }
    }
    hideProg();
    let ok;
    if(window._uploadMode==='add'){
      // Chế độ cộng dồn: gộp vào dữ liệu tháng đang có trên cloud
      ok=await applyAddMode(target,nd);
    }else{
      // Chế độ thay thế cả tháng (mặc định). ⚠ KHÔNG gán D/KMD ở đây: cloudSaveKO chỉ đưa bản mới lên màn hình
      // SAU KHI máy chủ lưu xong — bấm Huỷ / lưu hỏng thì màn hình giữ bản đang có trên máy chủ (nghiệm thu 10/09/2026).
      ok=await cloudSaveKO(target,nd);
    }
    if(!ok||!extras.length)return;
    const notes=[];
    for(const x of extras){
      const cnt=[...Object.values(x.kmstat&&x.kmstat.cells||{})].reduce((s,c)=>s+c.ok+c.rej,0);
      notes.push('File có '+cnt.toLocaleString('vi')+' dòng thuộc THÁNG '+dispMonth(normMonth(x.month))+' (theo GMT-4):');
      await applyAddMode(target,x,{quiet:true,notes});
    }
    alert('ℹ FILE KHUYẾN MÃI CÓ DỮ LIỆU CỦA 2 THÁNG\n\n'+notes.join('\n')+'\n\nFile KM tính theo giờ GMT+8 nên file ngày 01 luôn có nửa ngày cuối của tháng trước (GMT-4). Phần đó đã được cộng theo từng giờ vào đúng tháng của nó.');
  },50);
}
