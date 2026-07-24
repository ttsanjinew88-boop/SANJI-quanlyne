// ===== THÁNG HIỆN TẠI + DỮ LIỆU THEO THÁNG =====
let CUR_MONTH=null,_shiftReady=false;
function curMonthKey(){const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');}
// Cập nhật nhãn tháng trên nút chọn tháng (header)
function setMonthLabel(mk,empty){const b=document.getElementById('btnMonth');if(b)b.textContent='Tháng '+dispMonth(mk)+(empty?' (trống)':'')+' ▾';}
// Dataset rỗng (tháng chưa có dữ liệu) — đủ cấu trúc để mọi tab render không lỗi
function emptyDataset(mk){
  const z31=()=>Array(31).fill(0),z24=()=>Array(24).fill(0);
  const lbl=Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+'H');
  const fd={};
  FK_KEYS.forEach(fk=>{fd[fk]={name:FK_NAMES[fk],group:FKVIP.includes(fk)?'vip':'onl',total_score:0,total_count:0,day_scores:z31(),day_counts:z31(),hour_scores_gmt7:z24(),hour_counts_gmt7:z24(),hour_scores_gmt4:z24()};});
  return{month:dispMonth(mk),empty:true,days:Array.from({length:31},(_,i)=>i+1),days_in_month:[],hour_labels_gmt7:lbl,hour_labels_gmt4:lbl,day_scores:z31(),day_counts:z31(),hour_scores_gmt7:z24(),hour_counts_gmt7:z24(),hour_scores_gmt4:z24(),hour_counts_gmt4:z24(),fk_data:fd,fkvip:FKVIP,fkonl:FKONL};
}
// Áp dữ liệu phân ca đã lưu (gán FK + khung giờ)
function applyShiftData(sd){
  if(sd&&sd.assign)FK_KEYS.forEach(fk=>{shAssign[fk]=sd.assign[fk]||null;});
  if(sd&&sd.hours)['sf','st','tf','tt','g1f','g1t','g2f','g2t'].forEach(k=>{if(sd.hours[k]!=null){const el=document.getElementById(k);if(el)el.value=sd.hours[k];}});
}
// Lưu phân ca lên cloud theo tháng đang xem (debounce để gom nhiều click thành 1 lần lưu)
let _shiftTimer=null;
function saveShift(){
  clearTimeout(_shiftTimer);
  _shiftTimer=setTimeout(_saveShiftNow,1200);
}
async function _saveShiftNow(){
  if(!SB.ready()||!CUR_PROFILE||!CUR_MONTH||!_shiftReady)return;
  try{
    const hours={sf:+document.getElementById('sf').value||8,st:+document.getElementById('st').value||17,tf:+document.getElementById('tf').value||22,tt:+document.getElementById('tt').value||4,
      g1f:+document.getElementById('g1f').value||10,g1t:+document.getElementById('g1t').value||14,g2f:+document.getElementById('g2f').value||18,g2t:+document.getElementById('g2t').value||22};
    await SB.saveReport('shift',CUR_MONTH,{assign:shAssign,hours});
    setCloudStatus('Đã lưu phân ca tháng '+dispMonth(CUR_MONTH)+' ✓');
    logAction('Chỉnh phân ca','Tháng '+dispMonth(CUR_MONTH));
  }catch(e){console.error('saveShift',e);setCloudStatus('Lỗi lưu phân ca',true);}
}
function shUpdateHours(){
  if(CUR_PROFILE&&!canEdit('shift')){setCloudStatus('Bạn chỉ có quyền XEM phân ca',true);return;}
  rShiftPanel();saveShift();
}
// Tải dữ liệu của THÁNG HIỆN TẠI sau khi đăng nhập (tự chuyển khi qua tháng mới)
async function bootData(){
  if(!SB.ready())return;
  const mk=curMonthKey();
  CUR_MONTH=mk;
  try{
    setCloudStatus('Đang tải dữ liệu tháng '+dispMonth(mk)+'...');
    const[don,km,shift,an,wk,lm,ov]=await Promise.all([SB.loadReport('don',mk),SB.loadReport('km',mk),SB.loadReport('shift',mk),SB.loadReport('anomaly',mk),SB.loadReport('work',mk),SB.loadReport('limits',mk),SB.loadReport('ov',mk)]);
    WORK=wk||{};
    LIMITS=lm||{};
    await inheritLimitsIfEmpty(mk);
    if(ov&&Object.keys(ov).length){KO_OV=ov;}
    else{
      // di trú 1 lần: dữ liệu tổng quan cũ còn trong máy -> cloud tháng hiện tại
      const legacy=loadKoOvLegacy();
      KO_OV=Object.keys(legacy).length?legacy:{};
      if(Object.keys(legacy).length){try{await SB.saveReport('ov',mk,KO_OV);localStorage.removeItem(KO_OV_KEY);}catch(e){}}
    }
    D=don||emptyDataset(mk);
    KMD=km||null;
    if(shift)applyShiftData(shift);
    _shiftReady=true;
    if(an&&an.abuse){
      KO_AN=an;
    }else{
      // di trú 1 lần: bảng bất thường cũ còn trong máy (localStorage) -> cloud tháng hiện tại
      const legacy=loadKoAnLegacy();
      const hasLegacy=Object.keys(legacy.abuse||{}).length>0||Object.keys(legacy.mkt||{}).length>0;
      KO_AN=hasLegacy?legacy:{abuse:{},mkt:{}};
      if(hasLegacy){
        try{await SB.saveReport('anomaly',mk,KO_AN);localStorage.removeItem(KO_AN_KEY);}catch(e){}
      }
    }
    selDay=null;
    setMonthLabel(mk,!don);
    rAll();
    setCloudStatus(don?'Dữ liệu tháng '+dispMonth(mk)+' ✓':'Chưa có dữ liệu tháng '+dispMonth(mk)+' — bấm Upload Excel để thêm',!don);
    BC.loadSuspects();
    processUrlAction();
  }catch(e){
    console.error('bootData',e);
    _shiftReady=true;
    setCloudStatus('Lỗi tải dữ liệu cloud',true);
  }
}
// "06/2026" hoặc "6/2026" -> "2026-06" (định dạng lưu DB, sort được)
function normMonth(m){const p=/^(\d{1,2})\/(\d{4})$/.exec(String(m||'').trim());return p?p[2]+'-'+p[1].padStart(2,'0'):String(m||'').trim();}
// "2026-06" -> "06/2026" (định dạng hiển thị)
function dispMonth(m){const p=/^(\d{4})-(\d{2})$/.exec(String(m||''));return p?p[2]+'/'+p[1]:m;}
function setCloudStatus(msg,isErr){
  const el=document.getElementById('cloudStatus');
  if(!el)return;
  el.textContent=msg||'';
  el.style.color=isErr?'var(--re)':'var(--mu2)';
  if(msg&&!isErr&&/✓/.test(msg))setTimeout(()=>{if(el.textContent===msg)el.textContent='';},6000);
}
// Cắt bỏ các cột (0-based) khỏi file Excel -> trả về File mới cùng tên (dùng SheetJS đã nạp sẵn)
async function stripSensitiveCols(file,colIdx){
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(new Uint8Array(buf),{type:"array"});
  const drop=new Set(colIdx);
  wb.SheetNames.forEach(nm=>{
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[nm],{header:1,raw:true,defval:""});
    const cleaned=aoa.map(r=>r.filter((_,i)=>!drop.has(i)));
    wb.Sheets[nm]=XLSX.utils.aoa_to_sheet(cleaned);
  });
  const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  return new File([out],file.name.replace(/\.(xlsx|xls)$/i,"")+"_loc.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

async function cloudSaveKO(target,nd){
  if(!SB.ready())return;
  const type=target==="km"?"km":"don";
  const month=normMonth(nd.month);
  const lbl=type==="km"?"Khuyến Mãi":"Duyệt Đơn";
  try{
    // Nhận diện dữ liệu trùng tháng cũ đã có trên cloud
    let exists=false;
    try{const rows=await SB.listReports();exists=rows.some(r=>r.type===type&&r.month===month);}catch(e){}
    if(exists){
      // Lưới an toàn: bản mới ít ngày hơn bản cloud -> cảnh báo mất dữ liệu
      let dayWarn='';
      try{
        const old=await SB.loadReport(type,month);
        const oldDays=((old&&old.days_in_month)||[]).length;
        const newDays=((nd&&nd.days_in_month)||[]).length;
        if(newDays<oldDays){
          if(!confirm("NGUY HIỂM — SẼ MẤT DỮ LIỆU!\n\nBản upload mới chỉ có "+newDays+" ngày dữ liệu.\nBản trên cloud của tháng "+dispMonth(month)+" đang có "+oldDays+" ngày.\n\nThay thế sẽ MẤT "+(oldDays-newDays)+" ngày dữ liệu!\n(Có thể bạn quên chọn đủ file từ đầu tháng?)\n\nBạn có CHẮC CHẮN muốn thay thế không?")){
            setCloudStatus("Không lưu — dữ liệu cũ tháng "+dispMonth(month)+" ("+oldDays+" ngày) được giữ nguyên",true);
            return;
          }
          dayWarn=' (bản mới ÍT ngày hơn: '+newDays+' so với '+oldDays+')';
        }else if(!confirm("CẢNH BÁO TRÙNG DỮ LIỆU\n\nTháng "+dispMonth(month)+" ĐÃ CÓ dữ liệu "+lbl+" trên cloud ("+oldDays+" ngày). Bản mới có "+newDays+" ngày.\n\nBạn có muốn THAY THẾ dữ liệu cũ bằng dữ liệu vừa upload không?\n\n— OK: ghi đè dữ liệu cũ\n— Cancel: giữ nguyên dữ liệu cũ trên cloud")){
          setCloudStatus("Không lưu — dữ liệu cũ tháng "+dispMonth(month)+" trên cloud được giữ nguyên",true);
          return;
        }
      }catch(e){
        if(!confirm("CẢNH BÁO TRÙNG DỮ LIỆU\n\nTháng "+dispMonth(month)+" ĐÃ CÓ dữ liệu "+lbl+" trên cloud.\n\nBạn có muốn THAY THẾ không?")){
          setCloudStatus("Không lưu — giữ nguyên dữ liệu cũ",true);
          return;
        }
      }
    }else if(month!==curMonthKey()){
      if(!confirm("Dữ liệu vừa upload thuộc THÁNG CŨ ("+dispMonth(month)+"), không phải tháng hiện tại ("+dispMonth(curMonthKey())+").\n\nLưu vào tháng "+dispMonth(month)+" trên cloud?")){
        setCloudStatus("Đã hủy lưu cloud",true);
        return;
      }
    }
    setCloudStatus("Đang lưu cloud...");
    await SB.saveReport(type,month,nd);
    const fCnt=(window._lastUploadFiles||[]).length;
    // Duyệt Đơn: cắt bỏ cột G/H/I (thông tin nhạy cảm) trước khi sao lưu file gốc lên Storage
    let upFiles=window._lastUploadFiles;
    if(type==="don"&&upFiles&&upFiles.length){
      try{upFiles=await Promise.all(upFiles.map(f=>stripSensitiveCols(f,[6,7,8])));}catch(e){console.error('stripCols',e);}
    }
    await SB.uploadOriginals(upFiles,type,month);
    window._lastUploadFiles=null;
    CUR_MONTH=month;
    setCloudStatus("Đã lưu cloud tháng "+dispMonth(month)+" ✓");
    logAction('Upload dữ liệu '+lbl,'Tháng '+dispMonth(month)+' · '+fCnt+' file · '+(((nd&&nd.days_in_month)||[]).length)+' ngày'+(exists?' · thay thế bản cũ':' · lưu mới'));
  }catch(e){
    console.error("cloudSaveKO",e);
    setCloudStatus("Lỗi lưu cloud: "+(e.message||e),true);
  }
}
async function toggleHistMenu(ev){
  ev.stopPropagation();
  const menu=document.getElementById("histDdMenu");
  if(menu.classList.contains("show")){menu.classList.remove("show");return;}
  document.getElementById("uploadDdMenu")?.classList.remove("show");
  menu.classList.add("show");
  if(!SB.ready()){
    menu.innerHTML="<div class='upload-dd-item' style='color:var(--mu);cursor:default'>Chưa cấu hình cloud — điền SB_URL và SB_KEY trong file</div>";
    return;
  }
  menu.innerHTML="<div class='upload-dd-item' style='color:var(--mu);cursor:default'>Đang tải danh sách...</div>";
  try{
    const rows=(await SB.listReports()).filter(r=>r.type==="don"||r.type==="km");
    const byMonth={};
    rows.forEach(r=>{(byMonth[r.month]=byMonth[r.month]||[]).push(r.type);});
    const mk=curMonthKey();
    if(!byMonth[mk])byMonth[mk]=[]; // tháng hiện tại luôn có trong danh sách kể cả khi trống
    const months=Object.keys(byMonth).sort().reverse();
    menu.innerHTML=months.map(m=>{
      const has=byMonth[m];
      const tag=m===mk?' <span style="color:var(--gr);font-size:.6rem">(hiện tại)</span>':'';
      const info=has.length?(has.includes('km')?' — Đơn + KM':' — Đơn'):' — trống';
      const cur=m===CUR_MONTH?' style="background:rgba(124,58,237,.18)"':'';
      return `<div class="upload-dd-item"${cur} onclick="loadHistMonth('${m}')">Tháng ${dispMonth(m)}${tag}${info}</div>`;
    }).join("");
  }catch(e){
    console.error("toggleHistMenu",e);
    menu.innerHTML="<div class='upload-dd-item' style='color:var(--re);cursor:default'>Lỗi tải danh sách cloud</div>";
  }
}
async function loadHistMonth(m){
  document.getElementById("histDdMenu").classList.remove("show");
  try{
    setCloudStatus("Đang tải tháng "+dispMonth(m)+"...");
    const[don,km,shift,an,wk,lm,ov]=await Promise.all([SB.loadReport("don",m),SB.loadReport("km",m),SB.loadReport("shift",m),SB.loadReport("anomaly",m),SB.loadReport("work",m),SB.loadReport("limits",m),SB.loadReport("ov",m)]);
    CUR_MONTH=m;
    WORK=wk||{};
    LIMITS=lm||{};
    await inheritLimitsIfEmpty(m);
    KO_OV=(ov&&Object.keys(ov).length)?ov:{};
    D=don||emptyDataset(m);
    KMD=km||null;
    if(shift)applyShiftData(shift);
    KO_AN=(an&&an.abuse)?an:{abuse:{},mkt:{}};
    setMonthLabel(m,!don);
    selDay=null;
    rAll();
    setCloudStatus(don?"Đã tải tháng "+dispMonth(m)+" ✓":"Tháng "+dispMonth(m)+" chưa có dữ liệu — Upload Excel để thêm",!don);
  }catch(e){
    console.error("loadHistMonth",e);
    setCloudStatus("Lỗi tải dữ liệu cloud",true);
  }
}

let D=MD,KMD=null,CH={},dCh=null,selDay=null,rkGrp="vip",mView="diem",selFK=null;
let koView="overview",anCat="abuse";
let shAssign={},shView="don";
FK_KEYS.forEach(fk=>shAssign[fk]=null);
["fkangel","fkpiu","fkcarbon","fkdante","fkgeon"].forEach(fk=>shAssign[fk]="sang");
["fkjade","fkmember"].forEach(fk=>shAssign[fk]="trung");

// ===== KO: BẢNG TỔNG QUAN (Cộng/Trừ/Khác/Ghi chú) — localStorage =====
const KO_OV_KEY="fk_ko_overview_v1"; // chỉ dùng để di trú dữ liệu cũ 1 lần
function loadKoOvLegacy(){try{return JSON.parse(localStorage.getItem(KO_OV_KEY))||{};}catch(e){return {};}}
let KO_OV={};
let _ovTimer=null;
function saveKoOv(){
  clearTimeout(_ovTimer);
  _ovTimer=setTimeout(_saveKoOvCloud,1000);
}
async function _saveKoOvCloud(){
  if(!SB.ready()||!CUR_PROFILE||!CUR_MONTH)return;
  try{
    await SB.saveReport('ov',CUR_MONTH,KO_OV);
    setCloudStatus('Đã lưu tổng quan tháng '+dispMonth(CUR_MONTH)+' ✓');
  }catch(e){console.error('_saveKoOvCloud',e);setCloudStatus('Lỗi lưu tổng quan',true);}
}
function ovGet(fk){return {cong:0,tru:0,khac:"",note:"",wd:null,...(KO_OV[fk]||{})};}
function ovSet(fk,field,val){
  if(typeof CUR_PROFILE!=='undefined'&&CUR_PROFILE&&typeof canEdit==='function'&&!canEdit('ko')){alert('Bạn chỉ có quyền XEM tab Hiệu Suất KO.');return;}
  if(!KO_OV[fk])KO_OV[fk]={cong:0,tru:0,khac:"",note:"",wd:null};KO_OV[fk][field]=val;saveKoOv();
}

// ===== KO: BẢNG BẤT THƯỜNG THEO NGÀY (2 danh mục) — lưu CLOUD theo tháng =====
const KO_AN_KEY="fk_ko_anomaly_grid_v1"; // chỉ còn dùng để di trú dữ liệu cũ 1 lần
const AN_CATS={abuse:"Cược bất thường — Lạm dụng",mkt:"Đại lý ngoài — MKT bất thường"};
function loadKoAnLegacy(){try{const d=JSON.parse(localStorage.getItem(KO_AN_KEY));return d&&d.abuse?d:{abuse:{},mkt:{}};}catch(e){return {abuse:{},mkt:{}};}}
let KO_AN={abuse:{},mkt:{}};
let _anTimer=null,_anDirty=false;
function saveKoAn(){
  _anDirty=true; // đang có thay đổi cục bộ chưa lưu -> tạm dừng auto-sync để không bị ghi đè
  clearTimeout(_anTimer);
  _anTimer=setTimeout(_saveKoAnCloud,1200);
}
async function _saveKoAnCloud(){
  if(!SB.ready()||!CUR_PROFILE||!CUR_MONTH)return;
  try{
    await SB.saveReport('anomaly',CUR_MONTH,KO_AN);
    _anDirty=false;
    setCloudStatus('Đã lưu bất thường tháng '+dispMonth(CUR_MONTH)+' ✓');
    const det=_anChanges.map(c=>(FK_NAMES[c.fk]||c.fk)+' · '+(c.cat==='mkt'?'Đại lý ngoài':'Cược lạm dụng')+' · ngày '+c.day+': '+c.from+' → '+c.to).join(' | ');
    _anChanges=[];
    if(det)logAction('Chỉnh bất thường','Tháng '+dispMonth(CUR_MONTH)+' · '+det.slice(0,600));
  }catch(e){console.error('_saveKoAnCloud',e);setCloudStatus('Lỗi lưu bất thường',true);}
}

function anGet(cat,fk,day){return (KO_AN[cat]&&KO_AN[cat][fk]&&KO_AN[cat][fk][day])||0;}
let _anChanges=[]; // gom các thay đổi để ghi Lịch Sử chi tiết (ô nào, cũ -> mới)
function anSet(cat,fk,day,val){
  if(typeof CUR_PROFILE!=='undefined'&&CUR_PROFILE&&typeof canEdit==='function'&&!canEdit('ko')){alert('Bạn chỉ có quyền XEM tab Hiệu Suất KO.');if(typeof rKoAnomaly==='function')rKoAnomaly();return;}
  const from=anGet(cat,fk,day);
  const to=Math.max(0,Number(val)||0);
  if(from===to)return;
  if(!KO_AN[cat])KO_AN[cat]={};if(!KO_AN[cat][fk])KO_AN[cat][fk]={};KO_AN[cat][fk][day]=to;
  _anChanges.push({cat,fk,day,from,to});
  saveKoAn();
}
function anTotal(cat,fk){const m=(KO_AN[cat]&&KO_AN[cat][fk])||{};return Object.values(m).reduce((s,v)=>s+(Number(v)||0),0);}
function anAdd(cat,fk,day,delta){anSet(cat,fk,day,anGet(cat,fk,day)+delta);}

// ===== URL handler (nút Xác Nhận/Theo Dõi/Hủy từ Telegram) =====
// ?confirm_anomaly=fkjade&date=2026-07-03&cat=mkt&count=3&rid=abc
// Bắt action lúc mở trang, XỬ LÝ SAU KHI ĐĂNG NHẬP để ghi điểm lên cloud (đúng người, đúng ngày, đúng tháng)
let PENDING_URL={action:null};
(function captureUrlAction(){
  const p=new URLSearchParams(location.search);
  const rid=p.get("rid");
  const fk=p.get("confirm_anomaly"),date=p.get("date"),cat=p.get("cat")==="mkt"?"mkt":"abuse",cnt=Number(p.get("count")||1);
  const fkw=p.get("watch_anomaly"),fkd=p.get("dismiss_anomaly");
  if(fk&&FK_KEYS.includes(fk)&&date)PENDING_URL.action={type:'confirm',fk,date,cat,cnt,rid};
  else if(fkw&&FK_KEYS.includes(fkw))PENDING_URL.action={type:'watch',fk:fkw,date:p.get("date")||'',rid};
  else if(fkd)PENDING_URL.action={type:'dismiss',fk:fkd,date:p.get("date")||'',rid};
  if(PENDING_URL.action)history.replaceState(null,"",location.pathname);
})();
function showUrlToast(t){
  const el=document.getElementById("url-toast");
  if(!el)return;
  const nm=(FK_NAMES[t.fk]||t.fk||"");
  const dayNum=t.date?Number(t.date.slice(-2)):"-";
  const month=t.date?Number(t.date.slice(5,7)):"-";
  if(t.type==="confirm"){
    el.innerHTML=`Đã xác nhận báo cáo bất thường<br><b>+${t.cnt} điểm</b> cho <b>${nm}</b> ngày <b>${dayNum}/${month}</b> (đã lưu cloud)`;
    el.style.background="#16a34a";
  }else if(t.type==="watch"){
    el.innerHTML=`Đã ghi nhận <b>Theo Dõi Thêm</b> cho <b>${nm}</b>`;
    el.style.background="#2563eb";
  }else if(t.type==="dismiss"){
    el.innerHTML=`Đã <b>Hủy Bỏ</b> báo cáo cược bất thường của <b>${nm}</b>`;
    el.style.background="#6b7280";
  }else if(t.type==="err"){
    el.innerHTML=t.msg||"Lỗi xử lý";
    el.style.background="#dc2626";
  }else{
    el.innerHTML=`Báo cáo này đã được xử lý rồi, không thể thực hiện lần 2`;
    el.style.background="#dc2626";
  }
  el.style.display="block";el.style.opacity="1";
  setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.style.display="none",600);},5000);
}
// Gọi sau khi đăng nhập + tải xong dữ liệu tháng
async function processUrlAction(){
  const a=PENDING_URL.action;
  if(!a)return;
  PENDING_URL.action=null;
  try{
    // rid dùng 1 lần — kiểm tra trên CLOUD nên chặn được cả khi mở link trên máy khác
    let rids=null;
    if(a.rid){
      rids=(await SB.loadReport('rids','all'))||{list:[]};
      if((rids.list||[]).includes(a.rid)){showUrlToast({type:'used',fk:a.fk,date:a.date});return;}
    }
    if(a.type==='confirm'){
      if(!canEdit('ko')){showUrlToast({type:'err',msg:'Tài khoản của bạn không có quyền SỬA tab Hiệu Suất KO — không thể cộng điểm'});return;}
      const mk=a.date.slice(0,7);
      const day=Number(a.date.slice(-2));
      if(mk===CUR_MONTH){
        // tháng đang xem: cộng trực tiếp, tự lưu cloud
        if(!KO_AN[a.cat])KO_AN[a.cat]={};
        if(!KO_AN[a.cat][a.fk])KO_AN[a.cat][a.fk]={};
        KO_AN[a.cat][a.fk][day]=(Number(KO_AN[a.cat][a.fk][day])||0)+a.cnt;
        saveKoAn();
        if(document.querySelector('.pg.active')?.id==='pg-ko')rKO();
      }else{
        // tháng khác: đọc-sửa-ghi thẳng lên cloud của tháng đó
        const an=(await SB.loadReport('anomaly',mk))||{abuse:{},mkt:{}};
        if(!an[a.cat])an[a.cat]={};
        if(!an[a.cat][a.fk])an[a.cat][a.fk]={};
        an[a.cat][a.fk][day]=(Number(an[a.cat][a.fk][day])||0)+a.cnt;
        await SB.saveReport('anomaly',mk,an);
      }
      logAction('Xác nhận bất thường (Telegram)',(FK_NAMES[a.fk]||a.fk)+' · +'+a.cnt+' · ngày '+a.date+' · '+(a.cat==='mkt'?'Đại lý ngoài':'Cược lạm dụng'));
    }else if(a.type==='watch'){
      logAction('Theo dõi thêm (Telegram)',(FK_NAMES[a.fk]||a.fk)+' · ngày '+a.date);
    }else if(a.type==='dismiss'){
      logAction('Hủy báo cáo (Telegram)',(FK_NAMES[a.fk]||a.fk)+' · ngày '+a.date);
    }
    if(a.rid&&rids){rids.list=rids.list||[];rids.list.push(a.rid);await SB.saveReport('rids','all',rids);}
    showUrlToast(a);
  }catch(e){
    console.error('processUrlAction',e);
    showUrlToast({type:'err',msg:'Lỗi xử lý xác nhận — hãy mở lại link từ Telegram'});
  }
}

// ===== PROGRESS UI =====
function showProg(fileName){
  document.getElementById("progFile").textContent=fileName;
  document.getElementById("progFill").style.width="0%";
  document.getElementById("progPct").textContent="0%";
  document.getElementById("progRows").textContent="Chuẩn bị...";
  document.getElementById("progStep").textContent="";
  document.getElementById("progOverlay").classList.add("show");
}
function setProg(pct,rows,step){
  document.getElementById("progFill").style.width=pct+"%";
  document.getElementById("progPct").textContent=pct+"%";
  if(rows) document.getElementById("progRows").textContent=rows;
  if(step) document.getElementById("progStep").textContent=step;
}
function hideProg(){document.getElementById("progOverlay").classList.remove("show");}

// ===== SCORE FUNCTION (same business rule as original) =====
// Chỉ 3 trạng thái được nhận vào hệ thống: Đã rút tiền / Đã trả lại (trả về) / Đã từ chối.
// Trả về 'rut' | 'tra' | 'tuchoi' | null (null = dòng bị bỏ, không điểm không đếm đơn).
function donStatusKind(s){
  const st=String(s||"").trim().toLowerCase();
  if(st==="đã rút tiền")return"rut";
  if(st==="đã trả lại"||st==="đã trả về")return"tra";
  if(st==="đã từ chối"||st==="từ chối")return"tuchoi";
  return null;
}
function gsc(b,a,s){
  const bs=String(b||"").trim();
  const ip=bs==="phải";
  const lt=!bs;
  let v=0;
  const kind=donStatusKind(s);
  if(kind==="rut"){
    if(ip){if(a>=50&&a<=500)v+=2;else if(a>=501&&a<=4999)v+=3;else if(a>=5000&&a<=49999)v+=4;else if(a>=50000&&a<=500000)v+=5;}
    else if(lt){if(a<100000)v+=1;else v+=1.5;}
  }else if(kind==="tra"){
    v+=1;
  }
  // 'tuchoi': 0 điểm nhưng vẫn đếm đơn (lọc dòng lạ nằm ở processChunks)
  return v;
}
function mfk(note){const n=note.toLowerCase();for(const fk of FK_KEYS)if(n.includes(FK_SEARCH[fk]))return fk;return null;}
