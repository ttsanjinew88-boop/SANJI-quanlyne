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
// Luôn gọi khi đổi tháng, KỂ CẢ khi tháng đó chưa có phân ca (sd rỗng) — nếu không, phân ca của
// tháng trước còn nguyên trong RAM và bị hiểu nhầm là của tháng đang xem (và có thể bị lưu đè sang tháng mới).
function applyShiftData(sd){
  const as=(sd&&sd.assign)||{};
  Object.keys(shAssign).forEach(fk=>{shAssign[fk]=null;});
  FK_KEYS.forEach(fk=>{shAssign[fk]=as[fk]||null;});
  if(sd&&sd.hours)['sf','st','tf','tt','g1f','g1t','g2f','g2t'].forEach(k=>{if(sd.hours[k]!=null){const el=document.getElementById(k);if(el)el.value=sd.hours[k];}});
}
// Lưu phân ca lên cloud theo tháng đang xem (gom nhiều click thành 1 lần lưu — hẹn giờ GẮN VỚI THÁNG, xem scheduleSave)
function saveShift(){scheduleSave('shift',_saveShiftNow,1200);}
async function _saveShiftNow(){
  if(!SB.ready()||!CUR_PROFILE||!CUR_MONTH||!_shiftReady)return;
  try{
    const hours={sf:+document.getElementById('sf').value||8,st:+document.getElementById('st').value||17,tf:+document.getElementById('tf').value||22,tt:+document.getElementById('tt').value||4,
      g1f:+document.getElementById('g1f').value||10,g1t:+document.getElementById('g1t').value||14,g2f:+document.getElementById('g2f').value||18,g2t:+document.getElementById('g2t').value||22};
    await SB.saveReport('shift',CUR_MONTH,{assign:shAssign,hours});
    setCloudStatus('Đã lưu phân ca tháng '+dispMonth(CUR_MONTH)+' ✓');
    logAction('Chỉnh phân ca','Tháng '+dispMonth(CUR_MONTH));
  }catch(e){saveFailed('Phân ca tháng '+dispMonth(CUR_MONTH),e);}
}
function shUpdateHours(){
  if(CUR_PROFILE&&!canEdit('shift')){setCloudStatus('Bạn chỉ có quyền XEM phân ca',true);return;}
  rShiftPanel();saveShift();
}
// Tải dữ liệu của THÁNG HIỆN TẠI sau khi đăng nhập (tự chuyển khi qua tháng mới)
// ⚠ Đổi tháng đi qua loadMonthState + applyMonthState (xem switchToMonth): nạp vào biến TẠM rồi áp MỘT LƯỢT.
// CUR_MONTH chỉ được gán ở applyMonthState — bản cũ gán ngay đầu hàm, rồi mới await nạp.
async function bootData(){
  if(!SB.ready())return;
  const mk=curMonthKey();
  await flushPendingSaves();   // còn thay đổi chưa lưu của tháng đang xem -> lưu NGAY vào đúng tháng đó
  try{
    setCloudStatus('Đang tải dữ liệu tháng '+dispMonth(mk)+'...');
    const st=await loadMonthState(mk);
    if(!(st.ov&&Object.keys(st.ov).length)){
      // di trú 1 lần: dữ liệu tổng quan cũ còn trong máy -> cloud tháng hiện tại
      const legacy=loadKoOvLegacy();
      if(Object.keys(legacy).length){st.ov=legacy;try{await SB.saveReport('ov',mk,legacy);localStorage.removeItem(KO_OV_KEY);}catch(e){}}
    }
    if(!(st.an&&st.an.abuse)){
      // di trú 1 lần: bảng bất thường cũ còn trong máy (localStorage) -> cloud tháng hiện tại
      const legacy=loadKoAnLegacy();
      const hasLegacy=Object.keys(legacy.abuse||{}).length>0||Object.keys(legacy.mkt||{}).length>0;
      if(hasLegacy){
        st.an=legacy;
        // ghi hỏng: coi cả bảng cũ là "thay đổi chưa lưu" để lần sửa kế tiếp đẩy nó lên (xem anMerge)
        try{await SB.saveReport('anomaly',mk,legacy);localStorage.removeItem(KO_AN_KEY);}catch(e){st.anBase={abuse:{},mkt:{}};}
      }
    }
    applyMonthState(mk,st);
    _shiftReady=true;
    selDay=null;
    setMonthLabel(mk,!st.don);
    rAll();
    const don=st.don;
    setCloudStatus(don?'Dữ liệu tháng '+dispMonth(mk)+' ✓':'Chưa có dữ liệu tháng '+dispMonth(mk)+' — bấm Upload Excel để thêm',!don);
    BC.loadSuspects();
    processUrlAction();
  }catch(e){
    console.error('bootData',e);
    _shiftReady=true;
    setCloudStatus('Lỗi tải dữ liệu cloud',true);
  }
}
// ===== ROSTER (danh sách nhân viên) — LƯU CLOUD RIÊNG TỪNG THÁNG (report type 'roster', month = 'YYYY-MM') =====
// Sửa roster ở tháng nào chỉ ảnh hưởng THÁNG ĐÓ. Tháng chưa có roster riêng -> kế thừa tháng gần nhất
// trước đó (rồi tới bản 'all' cũ để tương thích ngược, cuối cùng ROSTER_DEFAULT). Kế thừa KHÔNG tự lưu.
// Áp một danh sách member (mảng) vào ROSTER + rebuild biến suy ra. members rỗng/null -> reset về mặc định.
function applyRosterFromCloud(roster){
  if(roster&&Array.isArray(roster.members)&&roster.members.length){
    ROSTER=roster.members.map(m=>({
      key:String(m.key),
      name:String(m.name||m.key),
      group:m.group==='onl'?'onl':'vip',
      col:m.col||'#7c3aed',
      search:String(m.search||m.key).toLowerCase(),
      active:m.active!==false
    }));
  }else{
    // Không có roster nào áp dụng cho tháng này -> reset về mặc định (tránh rớt roster tháng khác còn trong RAM)
    ROSTER=ROSTER_DEFAULT.map(m=>({...m,active:true}));
  }
  applyRoster();
  if(typeof BC!=='undefined'&&BC.renderFkChips)BC.renderFkChips();
}
// Tìm roster cho tháng mk: bản riêng của tháng -> kế thừa tháng gần nhất trước đó -> bản 'all' cũ -> null (= mặc định).
// CHỈ TẢI, KHÔNG ÁP — để đổi tháng áp mọi thứ một lượt (xem switchToMonth). Không bao giờ ném lỗi.
async function loadRosterMembersFor(mk){
  let members=null;
  try{
    if(SB.ready()){
      const own=await SB.loadReport('roster',mk);
      if(own&&Array.isArray(own.members)&&own.members.length)members=own.members;
      if(!members){
        const reps=await SB.listReports();
        const prev=(reps||[]).filter(r=>r.type==='roster'&&/^\d{4}-\d{2}$/.test(r.month)&&r.month<mk).map(r=>r.month).sort().pop();
        if(prev){const p=await SB.loadReport('roster',prev);if(p&&Array.isArray(p.members)&&p.members.length)members=p.members;}
      }
      if(!members){const leg=await SB.loadReport('roster','all');if(leg&&Array.isArray(leg.members)&&leg.members.length)members=leg.members;}
    }
  }catch(e){console.error('loadRosterMembersFor',e);}
  return members;
}
// Lưu ROSTER lên cloud (RIÊNG tháng đang mở) + rebuild biến suy ra + reconcile dataset đang mở + render lại.
async function saveRoster(actionLabel){
  applyRoster();
  if(D)reconcileDataset(D);
  if(KMD)reconcileDataset(KMD);
  if(typeof BC!=='undefined'&&BC.renderFkChips)BC.renderFkChips();
  const mk=CUR_MONTH||curMonthKey();
  // Trả true/false = lưu được hay không (rosterRename cần biết để mở lối bấm lại — nghiệm thu 10/09/2026).
  // 3 nơi gọi: thêm / sửa tên / ẩn nhân viên; thêm & ẩn bỏ qua giá trị trả về.
  let ok=false;
  try{
    const r=await SB.saveReport('roster',mk,{members:ROSTER});
    // saveReport trả {skipped} (không ném) khi chưa kết nối — coi là HỎNG, không được báo "Đã lưu ✓"
    if(r&&r.skipped)throw new Error('Chưa kết nối máy chủ');
    ok=true;
    setCloudStatus('Đã lưu danh sách nhân viên tháng '+dispMonth(mk)+' ✓');
    if(actionLabel)logAction('Chỉnh danh sách nhân viên',actionLabel+' (tháng '+dispMonth(mk)+')');
  }catch(e){
    saveFailed('Danh sách nhân viên tháng '+dispMonth(mk)+' (nếu lỗi quyền: kiểm tra RLS cho type "roster")',e);
  }
  if(typeof rAll==='function')rAll();
  return ok;
}
// Cập nhật TÊN (+ mã Excel/search nếu truyền) của 1 nhân viên (theo key) trên MỌI bản roster đã lưu
// (tất cả tháng + bản 'all' cũ) -> tháng cũ cũng đổi theo. key nội bộ & điểm số không đổi.
// Các tháng CHƯA có bản riêng sẽ tự lấy giá trị mới qua kế thừa.
// ⚠ TRẢ VỀ KẾT QUẢ, KHÔNG NUỐT LỖI. Bản cũ có try/catch BÊN TRONG vòng lặp chỉ ghi console
// rồi chạy tiếp, nên hàm KHÔNG BAO GIỜ ném lỗi ra ngoài -> mọi tháng hỏng đều bị bỏ qua âm thầm
// và người dùng luôn thấy "đã đổi tên xong". Hậu quả: tháng này tên MỚI, tháng cũ tên CŨ, nhìn
// báo cáo tưởng là hai người khác nhau — đúng cái đã xảy ra với CHAMY -> SOLIS.
// Trả về {failed:[tháng...], skipped:bool}. Hàm là idempotent: chạy lại nhiều lần vô hại.
async function renameMemberEverywhere(key,newName,newSearch){
  if(!SB.ready())return{failed:[],skipped:true};
  const reps=await SB.listReports();
  const months=[...new Set((reps||[]).filter(r=>r.type==='roster').map(r=>r.month))]
    .filter(mo=>mo!==CUR_MONTH); // tháng đang mở sẽ được saveRoster ghi lại
  const one=async mo=>{
    const rep=await SB.loadReport('roster',mo);
    if(!rep||!Array.isArray(rep.members))return;
    let changed=false;
    rep.members.forEach(m=>{
      if(String(m.key)===key){
        if(m.name!==newName){m.name=newName;changed=true;}
        if(newSearch&&(m.search||'').toLowerCase()!==newSearch){m.search=newSearch;changed=true;}
      }
    });
    if(changed)await SB.saveReport('roster',mo,{members:rep.members});
  };
  let failed=[];
  for(const mo of months){try{await one(mo);}catch(e){console.error('renameMemberEverywhere',mo,e);failed.push(mo);}}
  // Thử lại MỘT lượt cho các tháng hỏng (phần lớn là mạng chập nhất thời)
  if(failed.length){
    const again=[];
    for(const mo of failed){try{await one(mo);}catch(e){console.error('renameMemberEverywhere (thử lại)',mo,e);again.push(mo);}}
    failed=again;
  }
  return{failed,skipped:false};
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
// ===== BÁO LƯU THẤT BẠI — DÙNG CHUNG, BẮT BUỘC CHO MỌI ĐƯỜNG GHI DỮ LIỆU =====
// ⚠ setCloudStatus(...,true) MỘT MÌNH LÀ KHÔNG ĐỦ: nó chỉ đổi màu một dòng chữ nhỏ ở góc,
// không chặn thao tác, và trên màn hình đầy bảng biểu thì gần như chắc chắn bị bỏ sót.
// Người dùng đóng cửa sổ trong khi tin là đã lưu — đúng cái bẫy "nhãn nói dối" đã vấp với
// báo OFF (08/09/2026) và với danh sách domain warnkw (05/09/2026).
// LUẬT: ghi dữ liệu mà người dùng nhìn thấy kết quả => hỏng thì PHẢI gọi saveFailed().
let _saveFailCount=0; // tăng mỗi lần saveFailed() — để biết một lượt lưu có hỏng không mà không phải sửa từng hàm lưu
function saveFailed(what,e){
  _saveFailCount++;
  const why=String((e&&(e.message||e.error_description||e.hint))||e||'không rõ nguyên nhân');
  console.error('LƯU THẤT BẠI |',what,e);
  setCloudStatus('Lưu thất bại: '+what,true);
  alert('⚠ LƯU THẤT BẠI — dữ liệu CHƯA được ghi lên máy chủ.\n\n'
    +what+'\n\nLý do:\n'+why
    +'\n\nHãy thử lại. Nếu vẫn lỗi, chụp màn hình này gửi quản trị.');
}
// ===== LƯU HẸN GIỜ — GẮN VỚI THÁNG (nghiệm thu 10/09/2026 — canh bởi test/kiem-tra.html nhóm 10) =====
// Phân Ca / Tổng Quan / Bất Thường / Hạn Mức / Công Việc gom nhiều lần sửa rồi mới lưu (~1 giây).
// ⚠ Bản cũ dùng setTimeout trần: đổi tháng trong lúc chờ thì lượt lưu bắn SAU khi CUR_MONTH đã sang tháng mới
// ⇒ ghi dữ liệu tháng cũ đè lên tháng mới (cả bảng Bất Thường của tháng đó mất trắng) mà vẫn báo ✓.
// Nay: (1) mỗi lượt lưu nhớ THÁNG lúc hẹn; (2) mọi chỗ đổi tháng gọi flushPendingSaves() để LƯU NGAY vào tháng cũ;
// (3) lưới an toàn: lượt nào vẫn lọt tới lúc tháng đã đổi thì KHÔNG ghi mà báo saveFailed.
// ⚠ ĐỪNG "sửa" bằng clearTimeout khi đổi tháng — huỷ lượt lưu = MẤT ô người dùng vừa sửa.
const _pendingSaves={};   // tên -> {name, fn, mk, timer}
function scheduleSave(name,fn,ms){
  const cu=_pendingSaves[name];
  if(cu&&cu.timer)clearTimeout(cu.timer);
  const job={name,fn,mk:CUR_MONTH,timer:null};
  job.timer=setTimeout(()=>runPendingSave(job),ms);
  _pendingSaves[name]=job;
}
// Chạy 1 lượt lưu. Trả true nếu lưu xong; false nếu hỏng hoặc bị lưới an toàn chặn.
async function runPendingSave(job){
  if(job.timer){clearTimeout(job.timer);job.timer=null;}
  if(_pendingSaves[job.name]===job)delete _pendingSaves[job.name];
  if(job.mk!==CUR_MONTH){
    saveFailed('Thay đổi của tháng '+dispMonth(job.mk)+' — đã chuyển sang tháng khác trước khi kịp lưu. Mở lại tháng '+dispMonth(job.mk)+' và nhập lại thay đổi.',new Error('Đã đổi tháng giữa chừng'));
    return false;
  }
  const truoc=_saveFailCount;
  try{await job.fn();}catch(e){saveFailed('Lượt lưu "'+job.name+'"',e);}
  if(_saveFailCount!==truoc){
    // Hỏng: giữ lại (không hẹn giờ) để lần đổi tháng / lần sửa kế tiếp thử lưu lại — dữ liệu vẫn nằm trong máy.
    if(!_pendingSaves[job.name])_pendingSaves[job.name]=job;
    return false;
  }
  return true;
}
// LƯU NGAY mọi thay đổi đang chờ, trong khi CUR_MONTH vẫn là tháng của chúng. Gọi TRƯỚC mọi lần đổi tháng.
async function flushPendingSaves(){
  let ok=true;
  for(const job of Object.values(_pendingSaves)){if(!(await runPendingSave(job)))ok=false;}
  return ok;
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

// Trả true nếu đã lưu lên máy chủ; false nếu huỷ / lưu hỏng / chỉ xem trước tại máy.
async function cloudSaveKO(target,nd){
  const type=target==="km"?"km":"don";
  const month=normMonth(nd.month);
  const lbl=type==="km"?"Khuyến Mãi":"Duyệt Đơn";
  delete nd._cov;   // khoảng giờ file phủ (KM) — chỉ dùng khi cộng dồn, không lưu
  // Không có kết nối: chỉ xem trước tại máy (như trước), không đổi tháng đang xem.
  if(!SB.ready()){if(type==="km")KMD=nd;else{D=nd;setMonthLabel(month,false);}rAll();return false;}
  // ⚠ Bản mới CHỈ lên màn hình SAU KHI máy chủ lưu xong (nghiệm thu 10/09/2026 — canh bởi test nhóm 11–12).
  // Trước đây finalizeResult gán D/KMD trước khi hỏi "trùng dữ liệu" ⇒ bấm Huỷ hoặc lưu hỏng thì màn hình
  // vẫn hiện bản mới CHƯA hề được lưu, trong khi thanh trạng thái ghi "dữ liệu cũ được giữ nguyên".
  let exists=false;
  try{
    // Nhận diện dữ liệu trùng tháng cũ đã có trên cloud
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
            return false;
          }
          dayWarn=' (bản mới ÍT ngày hơn: '+newDays+' so với '+oldDays+')';
        }else if(!confirm("CẢNH BÁO TRÙNG DỮ LIỆU\n\nTháng "+dispMonth(month)+" ĐÃ CÓ dữ liệu "+lbl+" trên cloud ("+oldDays+" ngày). Bản mới có "+newDays+" ngày.\n\nBạn có muốn THAY THẾ dữ liệu cũ bằng dữ liệu vừa upload không?\n\n— OK: ghi đè dữ liệu cũ\n— Cancel: giữ nguyên dữ liệu cũ trên cloud")){
          setCloudStatus("Không lưu — dữ liệu cũ tháng "+dispMonth(month)+" trên cloud được giữ nguyên",true);
          return false;
        }
      }catch(e){
        if(!confirm("CẢNH BÁO TRÙNG DỮ LIỆU\n\nTháng "+dispMonth(month)+" ĐÃ CÓ dữ liệu "+lbl+" trên cloud.\n\nBạn có muốn THAY THẾ không?")){
          setCloudStatus("Không lưu — giữ nguyên dữ liệu cũ",true);
          return false;
        }
      }
    }else if(month!==curMonthKey()){
      if(!confirm("Dữ liệu vừa upload thuộc THÁNG CŨ ("+dispMonth(month)+"), không phải tháng hiện tại ("+dispMonth(curMonthKey())+").\n\nLưu vào tháng "+dispMonth(month)+" trên cloud?")){
        setCloudStatus("Đã hủy lưu cloud",true);
        return false;
      }
    }
    setCloudStatus("Đang lưu cloud...");
    await SB.saveReport(type,month,nd);
  }catch(e){
    // Upload Excel hỏng mà chỉ báo mờ = người dùng tưởng đã lưu, đóng máy, hôm sau mất cả ngày dữ liệu.
    saveFailed('Dữ liệu '+lbl+' tháng '+dispMonth(month)+' (vừa upload) — màn hình vẫn giữ bản đang có trên máy chủ',e);
    return false;
  }
  const fCnt=(window._lastUploadFiles||[]).length;
  // Duyệt Đơn: cắt bỏ cột G/H/I (thông tin nhạy cảm) trước khi sao lưu file gốc lên Storage
  let upFiles=window._lastUploadFiles;
  if(type==="don"&&upFiles&&upFiles.length){
    try{upFiles=await Promise.all(upFiles.map(f=>stripSensitiveCols(f,[6,7,8])));}catch(e){console.error('stripCols',e);}
  }
  try{await SB.uploadOriginals(upFiles,type,month);}catch(e){console.error('uploadOriginals',e);}
  window._lastUploadFiles=null;
  // Khác tháng đang xem ⇒ chuyển HẲN sang tháng đó (nạp cả Bất Thường/Tổng Quan/Hạn Mức/Công Việc/Phân Ca).
  // Bản cũ chỉ gán CUR_MONTH=month ⇒ các bảng khác vẫn là của tháng đang xem, sửa 1 ô là ghi đè tháng vừa upload.
  const hien=await showSavedDataset(type,month,nd);
  setCloudStatus(hien?"Đã lưu cloud tháng "+dispMonth(month)+" ✓":"Đã lưu cloud tháng "+dispMonth(month)+" ✓ — màn hình vẫn đang ở tháng "+dispMonth(CUR_MONTH)+" (còn thay đổi chưa lưu)",!hien);
  logAction('Upload dữ liệu '+lbl,'Tháng '+dispMonth(month)+' · '+fCnt+' file · '+(((nd&&nd.days_in_month)||[]).length)+' ngày'+(exists?' · thay thế bản cũ':' · lưu mới'));
  return true;
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
// ===== ĐỔI THÁNG AN TOÀN (nghiệm thu 10/09/2026 — canh bởi test/kiem-tra.html nhóm 10–12) =====
// ⚠ MỌI chỗ đổi tháng đang xem PHẢI đi qua switchToMonth() (hoặc bootData). KHÔNG gán CUR_MONTH trực tiếp.
//  1. LƯU NGAY các lượt lưu đang chờ vào tháng CŨ trước khi đổi (flushPendingSaves) — không huỷ.
//  2. Nạp đủ dữ liệu tháng mới vào biến TẠM (loadMonthState) rồi ÁP MỘT LƯỢT (applyMonthState), không await xen giữa.
//     Bản cũ gán CUR_MONTH trước rồi mới await nạp roster/hạn mức ⇒ lượt lưu hẹn giờ bắn giữa chừng ghi
//     dữ liệu tháng cũ vào tháng mới và báo ✓.
async function loadMonthState(m){
  const[don,km,shift,an,wk,lm,ov]=await Promise.all([SB.loadReport("don",m),SB.loadReport("km",m),SB.loadReport("shift",m),SB.loadReport("anomaly",m),SB.loadReport("work",m),SB.loadReport("limits",m),SB.loadReport("ov",m)]);
  const roster=await loadRosterMembersFor(m);
  let lim=(lm&&Object.keys(lm).length)?lm:null;
  if(!lim){try{lim=await inheritedLimitsFor(m);}catch(e){console.error('inheritedLimitsFor',e);}}
  return{don,km,shift,an,wk,lim:lim||{},ov,roster};
}
// ĐỒNG BỘ, không await: sau hàm này mọi bảng trong máy + CUR_MONTH cùng thuộc về tháng m.
function applyMonthState(m,st){
  applyRosterFromCloud(st.roster?{members:st.roster}:null);   // phải trước reconcileDataset (dùng FK_KEYS)
  WORK=st.wk||{};
  LIMITS=st.lim;
  KO_OV=(st.ov&&Object.keys(st.ov).length)?st.ov:{};
  D=reconcileDataset(st.don)||emptyDataset(m);
  KMD=reconcileDataset(st.km);
  applyShiftData(st.shift);
  KO_AN=(st.an&&st.an.abuse)?st.an:{abuse:{},mkt:{}};
  // Bảng Bất Thường vừa nạp = bản máy chủ. Xoá dấu vết sửa của tháng trước: nếu người dùng chọn "bỏ thay đổi
  // chưa lưu" khi đổi tháng mà không xoá, _anDirty kẹt true ⇒ vòng đồng bộ 60s tắt tới lúc F5, và Lịch Sử
  // ghi các ô của tháng cũ dưới nhãn tháng mới (sửa 11/09/2026 — test nhóm 14).
  _anBase=st.anBase?anClone(st.anBase):anClone(KO_AN);
  _anDirty=false;_anChanges=[];
  CUR_MONTH=m;
}
// Trả true nếu đã chuyển; false nếu người dùng chọn ở lại (còn thay đổi chưa lưu được) hoặc nạp hỏng.
async function switchToMonth(m){
  if(!(await flushPendingSaves())){
    if(!confirm('⚠ CÒN THAY ĐỔI CHƯA LƯU ĐƯỢC của tháng '+dispMonth(CUR_MONTH)+'.\n\nNếu chuyển sang tháng '+dispMonth(m)+' bây giờ, các thay đổi đó sẽ BỊ BỎ.\n\n— OK: vẫn chuyển tháng và bỏ các thay đổi chưa lưu\n— Cancel: ở lại tháng này (hệ thống sẽ thử lưu lại khi bạn sửa tiếp hoặc chuyển tháng lần nữa)'))return false;
    for(const k in _pendingSaves){clearTimeout(_pendingSaves[k].timer);delete _pendingSaves[k];}   // người dùng đã chọn bỏ
  }
  try{
    setCloudStatus("Đang tải tháng "+dispMonth(m)+"...");
    const st=await loadMonthState(m);
    applyMonthState(m,st);
    setMonthLabel(m,!st.don);
    selDay=null;
    rAll();
    setCloudStatus(st.don?"Đã tải tháng "+dispMonth(m)+" ✓":"Tháng "+dispMonth(m)+" chưa có dữ liệu — Upload Excel để thêm",!st.don);
    return true;
  }catch(e){
    console.error("switchToMonth",e);
    setCloudStatus("Lỗi tải dữ liệu cloud",true);
    return false;
  }
}
// Đưa bộ dữ liệu VỪA LƯU XONG lên màn hình. Cùng tháng đang xem: gán thẳng. Khác tháng: chuyển HẲN sang tháng đó.
async function showSavedDataset(type,month,ds){
  if(month!==CUR_MONTH)return await switchToMonth(month);
  if(type==="km")KMD=ds;else{D=ds;setMonthLabel(month,false);}
  rAll();
  return true;
}
async function loadHistMonth(m){
  const mn=document.getElementById("histDdMenu");if(mn)mn.classList.remove("show");
  await switchToMonth(m);
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
function saveKoOv(){scheduleSave('ov',_saveKoOvCloud,1000);}
async function _saveKoOvCloud(){
  if(!SB.ready()||!CUR_PROFILE||!CUR_MONTH)return;
  try{
    await SB.saveReport('ov',CUR_MONTH,KO_OV);
    setCloudStatus('Đã lưu tổng quan tháng '+dispMonth(CUR_MONTH)+' ✓');
  }catch(e){saveFailed('Tổng Quan (cộng/trừ/ghi chú) tháng '+dispMonth(CUR_MONTH),e);}
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
let _anDirty=false;
// ⚠ KHÔNG ghi đè nguyên bảng Bất Thường (sửa 11/09/2026 — canh bởi test/kiem-tra.html nhóm 14).
// Bot Telegram (super-function, nhánh "cf") cộng điểm THẲNG vào report anomaly trên máy chủ, còn máy này
// chỉ kéo bản mới 60 giây/lần và NGỪNG kéo khi tab bị ẩn. Bản cũ lưu nguyên KO_AN ⇒ Tổ Trưởng quay lại tab
// sau một lúc, sửa 1 ô là XOÁ SẠCH mọi điểm vừa xác nhận qua Telegram, và vẫn báo ✓.
// Nay: _anBase = bản máy chủ lần cuối máy này biết. Lúc lưu: đọc lại máy chủ, chỉ cộng PHẦN CHÊNH (KO_AN − _anBase)
// của những ô đã sửa. Còn hở vài trăm ms giữa đọc và ghi — muốn kín hẳn phải chuyển sang RPC cộng nguyên tử.
let _anBase={abuse:{},mkt:{}};
const anClone=o=>JSON.parse(JSON.stringify(o&&o.abuse?o:{abuse:{},mkt:{}}));
// Trả bản mới = srv + (loc − base) theo từng ô ngày. Ô không đổi so với base giữ nguyên giá trị máy chủ.
function anMerge(srv,base,loc){
  const out=anClone(srv);
  base=base||{};loc=loc||{};
  const keys=(a,b)=>[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])];
  for(const cat of keys(loc,base)){
    const L=loc[cat]||{},B=base[cat]||{};
    for(const fk of keys(L,B)){
      const Lf=L[fk]||{},Bf=B[fk]||{};
      for(const day of keys(Lf,Bf)){
        const d=(Number(Lf[day])||0)-(Number(Bf[day])||0);
        if(!d)continue;
        if(!out[cat])out[cat]={};if(!out[cat][fk])out[cat][fk]={};
        out[cat][fk][day]=Math.max(0,(Number(out[cat][fk][day])||0)+d);
      }
    }
  }
  return out;
}
function saveKoAn(){
  _anDirty=true; // đang có thay đổi cục bộ chưa lưu -> tạm dừng auto-sync để không bị ghi đè
  scheduleSave('an',_saveKoAnCloud,1200);
}
// ⚠ Các lượt lưu Bất Thường phải chạy LẦN LƯỢT: mạng chậm hơn 1,2s thì lượt hẹn giờ kế tiếp bắn khi lượt trước
// chưa xong ⇒ nó dùng _anBase CŨ ⇒ phần sửa của lượt trước bị cộng HAI LẦN lên máy chủ.
let _anInFlight=Promise.resolve();
function _saveKoAnCloud(){
  const p=_anInFlight.then(_saveKoAnOnce,_saveKoAnOnce);
  _anInFlight=p.catch(()=>{});
  return p;
}
async function _saveKoAnOnce(){
  if(!SB.ready()||!CUR_PROFILE||!CUR_MONTH)return;
  const mk=CUR_MONTH;
  const loc=anClone(KO_AN),base=_anBase,chg=_anChanges.slice();
  try{
    const srv=await SB.loadReport('anomaly',mk);
    const merged=anMerge(srv,base,loc);
    if(JSON.stringify(merged)!==JSON.stringify(anClone(srv)))await SB.saveReport('anomaly',mk,merged);
    if(CUR_MONTH===mk){
      // sửa thêm trong lúc chờ mạng thì giữ lại phần đó (lượt lưu kế tiếp đã được hẹn sẵn)
      const moiSua=JSON.stringify(anClone(KO_AN))!==JSON.stringify(loc);
      KO_AN=moiSua?anMerge(merged,loc,KO_AN):merged;
      _anBase=anClone(merged);
      _anDirty=moiSua;
      _anChanges=_anChanges.slice(chg.length);
      // máy chủ có điểm Telegram mới -> hiện luôn, khỏi chờ vòng đồng bộ 60s
      if(JSON.stringify(merged)!==JSON.stringify(loc)&&document.querySelector('.pg.active')?.id==='pg-ko'&&typeof rKO==='function')rKO();
    }
    setCloudStatus('Đã lưu bất thường tháng '+dispMonth(mk)+' ✓');
    const det=chg.map(c=>(FK_NAMES[c.fk]||c.fk)+' · '+(c.cat==='mkt'?'Đại lý ngoài':'Cược lạm dụng')+' · ngày '+c.day+': '+c.from+' → '+c.to).join(' | ');
    if(det)logAction('Chỉnh bất thường','Tháng '+dispMonth(mk)+' · '+det.slice(0,600));
  }catch(e){_anDirty=true;saveFailed('Điểm Bất Thường tháng '+dispMonth(mk),e);}
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
  // Lúc này roster của tháng CHƯA nạp xong (FK_KEYS còn là danh sách mặc định) -> chỉ kiểm ĐỊNH DẠNG mã,
  // kiểm mã có thật để lúc processUrlAction (sau khi nạp roster). Trước đây lọc theo FK_KEYS ở đây làm
  // nút Xác Nhận trên Telegram của nhân viên MỚI thêm bị bỏ qua âm thầm.
  const okKey=k=>/^fk[a-z0-9_]+$/i.test(String(k||''));
  if(fk&&okKey(fk)&&date)PENDING_URL.action={type:'confirm',fk,date,cat,cnt,rid};
  else if(fkw&&okKey(fkw))PENDING_URL.action={type:'watch',fk:fkw,date:p.get("date")||'',rid};
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
      if(!FK_NAMES[a.fk]){showUrlToast({type:'err',msg:'Không tìm thấy nhân viên "'+a.fk+'" trong danh sách — kiểm tra 👥 Quản lý nhân viên'});return;}
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
// Nhận diện FK từ ghi chú: chọn mã KHỚP DÀI NHẤT (tránh mã ngắn của người này "ăn" đơn của người kia,
// vd 'sam' nằm trong 'fkolsam'); trước đây lấy người đầu tiên khớp theo thứ tự roster.
function mfk(note){
  const n=note.toLowerCase();let best=null,bl=0;
  for(const fk of FK_KEYS){const s=FK_SEARCH[fk];if(s&&s.length>bl&&n.includes(s)){best=fk;bl=s.length;}}
  return best;
}
// Gom các mã "fk..." trong ghi chú KHÔNG khớp nhân viên nào -> cảnh báo cuối lần upload (tránh mất đơn âm thầm)
function noteUnknownFk(nd,note){
  const m=String(note||"").toLowerCase().match(/fk\s*[a-z0-9]{2,}/g);
  if(!m||!nd._unk)return;
  m.forEach(c=>{const k=c.replace(/\s+/g,"");nd._unk[k]=(nd._unk[k]||0)+1;});
}
