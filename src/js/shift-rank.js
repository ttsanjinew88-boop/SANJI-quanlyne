// ===== TAB: PHÂN CA =====
function toggleFK(fk,ca){
  if(CUR_PROFILE&&!canEdit('shift')){setCloudStatus('Bạn chỉ có quyền XEM phân ca',true);return;}
  shAssign[fk]=shAssign[fk]===ca?null:ca;rShiftPanel();saveShift();
}
function rShiftPanel(){
  const sf=parseInt(document.getElementById("sf").value)||8,st=parseInt(document.getElementById("st").value)||17;
  const tf=parseInt(document.getElementById("tf").value)||22,tt=parseInt(document.getElementById("tt").value)||4;
  const g1f=parseInt(document.getElementById("g1f").value)||10,g1t=parseInt(document.getElementById("g1t").value)||14;
  const g2f=parseInt(document.getElementById("g2f").value)||18,g2t=parseInt(document.getElementById("g2t").value)||22;
  document.getElementById("sh_sang_hrs").textContent=String(sf).padStart(2,"0")+"H – "+String(st).padStart(2,"0")+"H (GMT+7)";
  document.getElementById("sh_trung_hrs").textContent=String(tf).padStart(2,"0")+"H – "+String(tt).padStart(2,"0")+"H qua đêm";
  document.getElementById("sh_gay_hrs").textContent=String(g1f).padStart(2,"0")+"H – "+String(g1t).padStart(2,"0")+"H & "+String(g2f).padStart(2,"0")+"H – "+String(g2t).padStart(2,"0")+"H (GMT+7)";
  ["sang","trung","gay"].forEach(ca=>{
    const el=document.getElementById("sh_"+ca+"_fks");
    const inCa=FK_KEYS.filter(fk=>shAssign[fk]===ca),free=FK_KEYS.filter(fk=>!shAssign[fk]);
    el.innerHTML=inCa.map(fk=>"<div class='fk-chip "+ca+"' onclick='toggleFK(\""+fk+"\",\""+ca+"\")'>"+(D.fk_data[fk]?.name||fk)+" ✖</div>").join("")+"<div style='font-size:.58rem;color:var(--mu);padding:3px 0;width:100%'>+ thêm:</div>"+free.map(fk=>"<div class='fk-chip free' onclick='toggleFK(\""+fk+"\",\""+ca+"\")'>"+(D.fk_data[fk]?.name||fk)+" +</div>").join("");
  });
  document.getElementById("sh_free").textContent=FK_KEYS.filter(fk=>!shAssign[fk]).map(fk=>D.fk_data[fk]?.name||fk).join(", ")||"(không có)";
  if(shView==="work")rWork();else rShift(); // đổi phân ca -> lưới Công Việc Mỗi Ngày xếp lại ca ngay lập tức
}
function sshv(v,el){
  shView=v;
  el.parentElement.querySelectorAll(".vt-btn").forEach(t=>t.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("sh-don").style.display=v==="don"?"block":"none";
  document.getElementById("sh-km").style.display=v==="km"?"block":"none";
  document.getElementById("sh-work").style.display=v==="work"?"block":"none";
  if(v==="work")rWork();else rShift();
}

// ===== CÔNG VIỆC MỖI NGÀY (lưu cloud theo tháng) =====
let WORK={}; // {fk:{ngày:'DD'|'KM'|'HT'|'OFF'}}
const WK_CODES={
  DD:{full:'Duyệt đơn',col:'#10b981'},
  KM:{full:'Kiểm tra nhóm và duyệt khuyến mãi',col:'#f59e0b'},
  HT:{full:'Hỗ trợ hoặc làm công việc cấp trên giao',col:'#3b82f6'},
  OFF:{full:'Nghỉ / không trực',col:'#ef4444'}
};
function daysInViewMonth(){const p=(CUR_MONTH||curMonthKey()).split('-');return new Date(+p[0],+p[1],0).getDate();}
function rWork(){
  const tbl=document.getElementById('wkTbl');
  if(!tbl)return;
  const nD=daysInViewMonth();
  const canFix=CUR_PROFILE?canEdit('shift'):false;
  const groups=[
    {key:'sang',label:'CA SÁNG',col:'#06b6d4'},
    {key:'gay',label:'CA GÃY',col:'#f59e0b'},
    {key:'trung',label:'CA TRUNG',col:'#a78bfa'},
    {key:null,label:'CHƯA PHÂN CA',col:'#64748b'}
  ];
  document.getElementById('wk_month').textContent='Tháng '+dispMonth(CUR_MONTH||curMonthKey());
  document.getElementById('wk_chips').innerHTML=Object.entries(WK_CODES).map(([k,c])=>`<span style="background:${ha(c.col,.18)};color:${c.col};border:1px solid ${c.col};border-radius:10px;padding:1px 9px;font-size:.6rem;font-weight:800">${k}</span>`).join('');
  let h='<thead><tr><th class="sticky-col">CA</th><th>NHÂN VIÊN</th>';
  for(let d=1;d<=nD;d++)h+='<th>'+d+'</th>';
  h+='</tr></thead><tbody>';
  groups.forEach(g=>{
    const fks=FK_KEYS.filter(fk=>(shAssign[fk]||null)===g.key);
    if(!fks.length)return;
    fks.forEach((fk,i)=>{
      h+=`<tr class="wk-${g.key||'none'}">`;
      if(i===0)h+=`<td class="sticky-col" rowspan="${fks.length}" style="color:${g.col};font-weight:800;vertical-align:middle;text-align:center">${g.label}</td>`;
      h+=`<td style="font-weight:700;text-align:left;padding-left:9px">${FK_NAMES[fk]}</td>`;
      for(let d=1;d<=nD;d++){
        const v=(WORK[fk]||{})[d]||'';
        const c=WK_CODES[v];
        if(canFix){
          h+=`<td style="padding:2px 1px"><select onchange="wkSet('${fk}',${d},this.value)" style="background:${c?ha(c.col,.22):'var(--card2)'};color:${c?c.col:'var(--mu)'};border:1px solid ${c?c.col:'var(--border)'};border-radius:5px;font-size:.58rem;font-weight:800;padding:2px 0;cursor:pointer;outline:none">`+
            `<option value="" ${!v?'selected':''} style="background:#131830;color:#64748b">–</option>`+
            Object.keys(WK_CODES).map(k=>`<option value="${k}" ${v===k?'selected':''} style="background:${ha(WK_CODES[k].col,.25)};color:${WK_CODES[k].col};font-weight:800">${k}</option>`).join('')+
          `</select></td>`;
        }else{
          h+=`<td>${c?`<span style="background:${ha(c.col,.18)};color:${c.col};border-radius:8px;padding:1px 6px;font-size:.56rem;font-weight:800">${v}</span>`:'<span style="color:var(--mu)">–</span>'}</td>`;
        }
      }
      h+='</tr>';
    });
  });
  h+='</tbody>';
  tbl.innerHTML=h;
  // Bảng thống kê công bằng: đếm số ngày mỗi loại công việc
  let s='<thead><tr><th style="text-align:left">NHÂN VIÊN</th><th style="color:#f59e0b">KM</th><th style="color:#10b981">DD</th><th style="color:#3b82f6">HT</th><th style="color:#ef4444">OFF</th><th>Tổng ngày làm</th></tr></thead><tbody>';
  FK_KEYS.forEach(fk=>{
    const m=WORK[fk]||{};
    const cnt={KM:0,DD:0,HT:0,OFF:0};
    Object.keys(m).forEach(d=>{const v=m[d];if(cnt[v]!==undefined)cnt[v]++;});
    const half=wkHalfCount(fk);
    const total=wkTotalDays(fk);
    if(!total&&!cnt.OFF&&!half)return;
    s+=`<tr><td style="text-align:left;font-weight:700">${FK_NAMES[fk]}</td>`+
      `<td style="color:#f59e0b;font-weight:800">${cnt.KM||'-'}</td>`+
      `<td style="color:#10b981;font-weight:800">${cnt.DD||'-'}</td>`+
      `<td style="color:#3b82f6;font-weight:800">${cnt.HT||'-'}</td>`+
      `<td style="color:#ef4444;font-weight:800">${(cnt.OFF+half*0.5)||'-'}</td>`+
      `<td style="font-weight:800;color:var(--pu2)">${total||'-'}</td></tr>`;
  });
  s+='</tbody>';
  document.getElementById('wkSum').innerHTML=s;
  document.getElementById('wkLegend').innerHTML=Object.entries(WK_CODES).map(([k,c])=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px"><span style="background:${ha(c.col,.18)};color:${c.col};border:1px solid ${c.col};border-radius:10px;padding:3px 14px;font-size:.66rem;font-weight:800;min-width:48px;text-align:center">${k}</span><span style="font-size:.72rem;color:var(--mu2)">${c.full}</span></div>`).join('')
    +'<div style="font-size:.62rem;color:var(--mu);margin-top:6px">Tổng ngày làm = KM + DD + HT − 0.5 × số lần OFF nửa ngày · Tổng này tự cập nhật vào cột "Ngày làm việc" ở Tổng Quan.</div>';
  // Bảng báo cáo OFF / chuyển ngày gần đây
  const reps=(WORK._reports||[]).slice(-10).reverse();
  const repEl=document.getElementById('wkReports');
  if(repEl)repEl.innerHTML=reps.length?reps.map(r=>{
    const t=new Date(r.at).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const what=r.type==='half'?`OFF đột xuất <b style="color:#f87171">0.5 ngày</b> (ngày ${r.day})`:r.type==='full'?`OFF đột xuất <b style="color:#f87171">1 ngày</b> (ngày ${r.day})`:`Chuyển OFF <b style="color:var(--go)">ngày ${r.day} → ${r.to}</b>`;
    return `<div style="padding:5px 0;border-bottom:1px solid rgba(30,37,69,.5)"><b style="color:var(--tx)">${FK_NAMES[r.fk]||r.fk}</b> · ${what} · <span style="color:var(--mu)">${t} · bởi ${(r.by||'').toUpperCase()}</span></div>`;
  }).join(''):'<div style="color:var(--mu);padding:5px 0">Chưa có báo cáo nào trong tháng.</div>';
}
// ===== TỰ ĐỘNG PHÂN CÔNG: chia đều DD/KM/HT theo từng ca, giữ nguyên OFF =====
// Luật: mỗi ngày mỗi ca 1 KM + 1 HT (nếu đủ người), còn lại DD; ngẫu nhiên nhưng cân bằng;
//       Thứ 2: mỗi nhân viên tối đa 1 lần KM trong tháng
// Lõi phân công tự động từ ngày startDay đến cuối tháng.
// Ưu tiên cân bằng: KM và DD đều nhất có thể trước, sau đó tới HT.
// Giữ nguyên OFF; ngày trước startDay giữ nguyên và được đếm vào bộ đếm cân bằng.
function wkAssignCore(startDay){
  const nD=daysInViewMonth();
  const parts=(CUR_MONTH||curMonthKey()).split('-');
  const y=+parts[0],mo=+parts[1];
  const isMon=d=>new Date(y,mo-1,d).getDay()===1;
  const kmCount={},htCount={},ddCount={},kmMon={};
  FK_KEYS.forEach(fk=>{kmCount[fk]=0;htCount[fk]=0;ddCount[fk]=0;kmMon[fk]=0;});
  FK_KEYS.forEach(fk=>{
    const m2=WORK[fk]||{};
    // đếm các ngày đã chốt trước startDay để cân bằng tiếp nối
    for(let d=1;d<startDay;d++){
      const v=m2[d];
      if(v==='KM'){kmCount[fk]++;if(isMon(d))kmMon[fk]++;}
      else if(v==='HT')htCount[fk]++;
      else if(v==='DD')ddCount[fk]++;
    }
    // xóa phân công từ startDay trở đi, giữ OFF
    for(let d=startDay;d<=nD;d++){if(m2[d]&&m2[d]!=='OFF')delete m2[d];}
  });
  ['sang','gay','trung'].forEach(ca=>{
    const members=FK_KEYS.filter(fk=>shAssign[fk]===ca);
    if(!members.length)return;
    for(let d=startDay;d<=nD;d++){
      const avail=members.filter(fk=>((WORK[fk]||{})[d])!=='OFF');
      if(!avail.length)continue;
      const mon=isMon(d);
      // KM (ưu tiên 1): người ít KM nhất; thứ 2 loại người đã có KM-thứ-2
      const kmPool=avail.filter(fk=>!mon||kmMon[fk]<1);
      let kmPick=null;
      if(kmPool.length){
        const min=Math.min(...kmPool.map(fk=>kmCount[fk]));
        const cands=kmPool.filter(fk=>kmCount[fk]===min);
        kmPick=cands[Math.floor(Math.random()*cands.length)];
      }
      // HT (ưu tiên 3): người ít HT nhất; hòa nhau -> ưu tiên người đang NHIỀU DD (để DD đều lại)
      let htPick=null;
      const htPool=avail.filter(fk=>fk!==kmPick);
      if(htPool.length){
        const min=Math.min(...htPool.map(fk=>htCount[fk]));
        let cands=htPool.filter(fk=>htCount[fk]===min);
        const maxDd=Math.max(...cands.map(fk=>ddCount[fk]));
        cands=cands.filter(fk=>ddCount[fk]===maxDd);
        htPick=cands[Math.floor(Math.random()*cands.length)];
      }
      avail.forEach(fk=>{
        if(!WORK[fk])WORK[fk]={};
        if(fk===kmPick){WORK[fk][d]='KM';kmCount[fk]++;if(mon)kmMon[fk]++;}
        else if(fk===htPick){WORK[fk][d]='HT';htCount[fk]++;}
        else{WORK[fk][d]='DD';ddCount[fk]++;}
      });
    }
  });
}
function wkAutoAssign(){
  if(!canEdit('shift')){alert('Bạn chỉ có quyền XEM.');return;}
  if(!confirm('TỰ ĐỘNG PHÂN CÔNG tháng '+dispMonth(CUR_MONTH||curMonthKey())+'?\n\n— Giữ nguyên các ô OFF đã điền\n— Mỗi ngày mỗi ca: 1 KM + 1 HT, còn lại DD — ưu tiên chia đều KM và DD trước, HT sau\n— Thứ 2: mỗi người tối đa 1 lần KM/tháng\n\nPhân công cũ (không phải OFF) sẽ bị GHI ĐÈ.'))return;
  wkAssignCore(1);
  _wkChanges.push('Tự Động Phân Công toàn tháng');
  clearTimeout(_wkTimer);
  _wkTimer=setTimeout(_saveWork,800);
  rWork();
  setCloudStatus('Đã tự động phân công tháng '+dispMonth(CUR_MONTH)+' ✓');
}
// Cân bằng lại từ 1 ngày (sau báo cáo OFF/chuyển ngày) — chỉ khi lưới đã có phân công
function wkRebalanceFrom(startDay){
  const hasPlan=FK_KEYS.some(fk=>Object.values(WORK[fk]||{}).some(v=>v&&v!=='OFF'));
  if(hasPlan)wkAssignCore(startDay);
}
// Tổng ngày làm của 1 FK trong tháng = KM+DD+HT − 0.5 × số báo cáo OFF nửa ngày
function wkHalfCount(fk){return ((WORK&&WORK._reports)||[]).filter(r=>r.fk===fk&&r.type==='half').length;}
function wkTotalDays(fk){
  const m2=(WORK&&WORK[fk])||{};
  let t=0;
  Object.keys(m2).forEach(d=>{const v=m2[d];if(v==='KM'||v==='DD'||v==='HT')t++;});
  return t?t-wkHalfCount(fk)*0.5:0;
}
// ===== BÁO CÁO OFF ĐỘT XUẤT / CHUYỂN NGÀY OFF =====
// Quyền XEM tab Phân Ca vẫn dùng được chức năng này (mục đích: nhân viên tự báo)
function wkOffOpen(){
  if(!CUR_PROFILE||!canView('shift')){alert('Bạn cần quyền xem tab Phân Ca.');return;}
  const nD=daysInViewMonth();
  document.getElementById('wkOffFk').innerHTML='<option value="">-- Chọn nhân viên --</option>'+FK_KEYS.map(fk=>`<option value="${fk}">${FK_NAMES[fk]}</option>`).join('');
  const dayOpts='<option value="">-- Chọn ngày --</option>'+Array.from({length:nD},(_,i)=>`<option value="${i+1}">Ngày ${i+1}</option>`).join('');
  document.getElementById('wkOffDay').innerHTML=dayOpts;
  document.getElementById('wkOffTo').innerHTML=dayOpts;
  document.getElementById('wkOffType').value='half';
  wkOffTypeChange();
  document.getElementById('wkOffMsg').textContent='';
  document.getElementById('wkOffModal').style.display='flex';
}
function wkOffTypeChange(){
  const t=document.getElementById('wkOffType').value;
  document.getElementById('wkOffToRow').style.display=t==='move'?'flex':'none';
  document.getElementById('wkOffDayLbl').textContent=t==='move'?'Ngày đang OFF:':'Ngày OFF:';
}
async function wkOffConfirm(){
  const msg=document.getElementById('wkOffMsg');
  const fk=document.getElementById('wkOffFk').value;
  const type=document.getElementById('wkOffType').value;
  const d=Number(document.getElementById('wkOffDay').value);
  const to=Number(document.getElementById('wkOffTo').value);
  msg.style.color='var(--re)';
  if(!fk){msg.textContent='Chưa chọn nhân viên';return;}
  if(!d){msg.textContent='Chưa chọn ngày';return;}
  if(type==='move'){
    if(!to){msg.textContent='Chưa chọn ngày chuyển tới';return;}
    if(to===d){msg.textContent='Ngày chuyển tới phải khác ngày đang OFF';return;}
    if(((WORK[fk]||{})[d])!=='OFF'){msg.textContent=FK_NAMES[fk]+' không OFF vào ngày '+d+' — kiểm tra lại';return;}
    if(((WORK[fk]||{})[to])==='OFF'){msg.textContent='Ngày '+to+' đã là ngày OFF sẵn';return;}
  }
  const by=(CUR_PROFILE.username||'').toUpperCase();
  if(!WORK._reports)WORK._reports=[];
  const rec={fk,type,day:d,at:new Date().toISOString(),by:CUR_PROFILE.username};
  if(type==='half'){
    WORK._reports.push(rec);
    logAction('Báo cáo OFF đột xuất','0.5 ngày · '+FK_NAMES[fk]+' · ngày '+d+'/'+dispMonth(CUR_MONTH)+' · bởi '+by+' (không đổi bảng phân công, trừ 0.5 vào Tổng ngày làm)');
  }else if(type==='full'){
    if(!WORK[fk])WORK[fk]={};
    WORK[fk][d]='OFF';
    WORK._reports.push(rec);
    wkRebalanceFrom(d);
    logAction('Báo cáo OFF đột xuất','1 ngày · '+FK_NAMES[fk]+' · ngày '+d+'/'+dispMonth(CUR_MONTH)+' · bởi '+by+' · đã tự cân bằng phân công từ ngày '+d);
  }else{
    rec.to=to;
    delete WORK[fk][d];
    if(!WORK[fk])WORK[fk]={};
    WORK[fk][to]='OFF';
    WORK._reports.push(rec);
    const from=Math.min(d,to);
    wkRebalanceFrom(from);
    logAction('Chuyển ngày OFF',FK_NAMES[fk]+' · từ ngày '+d+' sang ngày '+to+'/'+dispMonth(CUR_MONTH)+' · bởi '+by+' · đã tự cân bằng từ ngày '+from);
  }
  clearTimeout(_wkTimer);
  _wkTimer=setTimeout(_saveWork,600);
  rWork();
  document.getElementById('wkOffModal').style.display='none';
  setCloudStatus('Đã ghi nhận báo cáo OFF ✓');
}

// ===== DÁN TỪ EXCEL (phân công / điểm duyệt đơn / điểm KM) =====
let _pasteMode='work';
const NAME2FK={};FK_KEYS.forEach(fk=>{NAME2FK[FK_NAMES[fk].toUpperCase()]=fk;});
function openPasteModal(mode){
  if(!canEdit(mode==='work'?'shift':'ko')){alert('Bạn chỉ có quyền XEM.');return;}
  if(mode==='km'&&!KMD){alert('Chưa có dữ liệu Khuyến Mãi tháng này — upload file KM trước.');return;}
  _pasteMode=mode;
  document.getElementById('pasteTitle').textContent=mode==='work'?'Dán phân công từ Excel — Công Việc Mỗi Ngày':'Dán điểm từ Excel — '+(mode==='km'?'Khuyến Mãi':'Duyệt Đơn');
  document.getElementById('pasteHint').innerHTML=
    'Copy vùng dữ liệu trong Excel (bôi đen → Ctrl+C) rồi dán vào ô bên dưới (Ctrl+V).<br>'+
    'Mỗi dòng: <b style="color:var(--tx)">TÊN NHÂN VIÊN</b> (GEON, DANTE, LUBY...) rồi tới giá trị của <b>ngày 1, 2, 3...</b> mỗi cột 1 ngày — cột CA đứng trước tên cũng nhận được.<br>'+
    (mode==='work'
      ?'Giá trị hợp lệ: <b style="color:#10b981">DD</b> · <b style="color:#f59e0b">KM</b> · <b style="color:#3b82f6">HT</b> · <b style="color:#ef4444">OFF</b> — ô trống giữ nguyên giá trị cũ. Mẹo: chỉ dán các ô OFF rồi bấm Tự Động Phân Công.'
      :'Giá trị là SỐ ĐIỂM từng ngày — ô trống giữ nguyên giá trị cũ.');
  document.getElementById('pasteArea').value='';
  document.getElementById('pasteMsg').textContent='';
  document.getElementById('pasteModal').style.display='flex';
}
function closePasteModal(){document.getElementById('pasteModal').style.display='none';}
function applyPaste(){
  const raw=document.getElementById('pasteArea').value;
  const msg=document.getElementById('pasteMsg');
  const lines=raw.split(/\r?\n/).filter(l=>l.trim());
  const nD=daysInViewMonth();
  let applied=0;const skipped=[];
  lines.forEach(line=>{
    const cells=line.split('\t');
    // tên nhân viên có thể ở cột 1-3 (cho phép cột CA/STT đứng trước)
    let nameIdx=-1,fk=null;
    for(let i=0;i<Math.min(cells.length,3);i++){
      const cand=NAME2FK[String(cells[i]).trim().toUpperCase()];
      if(cand){nameIdx=i;fk=cand;break;}
    }
    if(!fk){skipped.push(String(cells[0]).trim()||'(trống)');return;}
    for(let d=1;d<=nD;d++){
      const v=String(cells[nameIdx+d]??'').trim().toUpperCase();
      if(!v)continue;
      if(_pasteMode==='work'){
        if(!WK_CODES[v])continue;
        if(!WORK[fk])WORK[fk]={};
        WORK[fk][d]=v;applied++;
      }else{
        const num=Number(v.replace(/[^\d]/g,''));
        if(isNaN(num)||v.replace(/[^\d]/g,'')==='')continue;
        const ds=_pasteMode==='km'?KMD:D;
        if(!ds||!ds.fk_data[fk])continue;
        ds.fk_data[fk].day_scores[d-1]=num;applied++;
      }
    }
  });
  if(!applied){
    msg.style.color='var(--re)';
    msg.textContent='Không áp dụng được ô nào'+(skipped.length?' — dòng không nhận diện tên: '+skipped.slice(0,5).join(', '):'');
    return;
  }
  if(_pasteMode==='work'){
    _wkChanges.push('Dán từ Excel: '+applied+' ô');
    clearTimeout(_wkTimer);_wkTimer=setTimeout(_saveWork,800);
    rWork();
  }else{
    const ds=_pasteMode==='km'?KMD:D;
    FK_KEYS.forEach(fk=>{const fd=ds.fk_data[fk];if(fd)fd.total_score=fd.day_scores.reduce((a,b)=>a+(b||0),0);});
    if(Array.isArray(ds.day_scores))for(let d=0;d<31;d++)ds.day_scores[d]=FK_KEYS.reduce((s,fk)=>s+((ds.fk_data[fk]?.day_scores[d])||0),0);
    savePasteScores(_pasteMode,applied);
    rKoDaily();
  }
  msg.style.color='var(--gr)';
  msg.textContent='Đã áp dụng '+applied+' ô ✓'+(skipped.length?' · bỏ qua dòng: '+skipped.slice(0,5).join(', '):'');
}
async function savePasteScores(src,n){
  if(!SB.ready()||!CUR_MONTH)return;
  try{
    await SB.saveReport(src,CUR_MONTH,src==='km'?KMD:D);
    setCloudStatus('Đã lưu điểm dán từ Excel ✓');
    logAction('Dán điểm từ Excel',(src==='km'?'Khuyến Mãi':'Duyệt Đơn')+' · tháng '+dispMonth(CUR_MONTH)+' · '+n+' ô');
  }catch(e){console.error('savePasteScores',e);setCloudStatus('Lỗi lưu điểm dán',true);}
}

let _wkTimer=null,_wkChanges=[];
function wkSet(fk,d,v){
  if(!canEdit('shift')){alert('Bạn chỉ có quyền XEM.');rWork();return;}
  const old=(WORK[fk]||{})[d]||'';
  if(old===v)return;
  if(!WORK[fk])WORK[fk]={};
  if(v)WORK[fk][d]=v;else delete WORK[fk][d];
  _wkChanges.push(FK_NAMES[fk]+' ngày '+d+': '+(old||'–')+' → '+(v||'–'));
  clearTimeout(_wkTimer);
  _wkTimer=setTimeout(_saveWork,1200);
  rWork();
}
async function _saveWork(){
  if(!SB.ready()||!CUR_MONTH)return;
  try{
    await SB.saveReport('work',CUR_MONTH,WORK);
    setCloudStatus('Đã lưu công việc ngày tháng '+dispMonth(CUR_MONTH)+' ✓');
    const det=_wkChanges.join(' | ');_wkChanges=[];
    if(det)logAction('Công việc mỗi ngày','Tháng '+dispMonth(CUR_MONTH)+' · '+det.slice(0,600));
  }catch(e){console.error('_saveWork',e);setCloudStatus('Lỗi lưu công việc ngày',true);}
}
function rShift(){
  // 3 ca: Sáng (cyan) / Trung (tím nhạt) / Gãy (hổ phách) — dùng chung cho Duyệt Đơn & KM
  const CAS=[
    {key:'sang',label:'Ca Sáng',col:'#06b6d4',rgba:'rgba(6,182,212,.65)',cls:'cy'},
    {key:'trung',label:'Ca Trung',col:'#a78bfa',rgba:'rgba(167,139,250,.65)',cls:'pu'},
    {key:'gay',label:'Ca Gãy',col:'#f59e0b',rgba:'rgba(245,158,11,.65)',cls:'go'}
  ];
  const lbl7=Array.from({length:24},(_,h)=>String(h).padStart(2,"0")+"H");
  const isKm=shView==="km";
  const ds=isKm?KMD:D;
  if(isKm){
    const empty=document.getElementById("sh_km_empty"),data=document.getElementById("sh_km_data");
    if(!KMD){empty.style.display="block";data.style.display="none";return;}
    empty.style.display="none";data.style.display="block";
  }
  const rows=CAS.map(c=>{
    const fks=FK_KEYS.filter(fk=>shAssign[fk]===c.key);
    const S=fks.reduce((s,fk)=>s+(ds.fk_data[fk]?.total_score||0),0);
    const C=fks.reduce((s,fk)=>s+(ds.fk_data[fk]?.total_count||0),0);
    return Object.assign({},c,{fks,S,C});
  });
  const tot=rows.reduce((s,r)=>s+r.S,0),ctot=rows.reduce((s,r)=>s+r.C,0);
  rows.forEach(r=>{r.sp=tot?((r.S/tot)*100).toFixed(1):0;r.cp=ctot?((r.C/ctot)*100).toFixed(1):0;});
  const lead=rows.reduce((b,r)=>r.S>b.S?r:b,rows[0]);
  document.getElementById(isKm?"sh_km_stats":"sh_stats").innerHTML=
    rows.map(r=>`<div class='stat-card ${r.cls}'><div class='stat-lbl'>${r.label}${isKm?' KM':''}</div><div class='stat-val' style='color:${r.col}'>${nn(r.S)}</div><div class='stat-sub'>${nn(r.C)} đơn · ${r.sp}%</div></div>`).join('')
    +`<div class='stat-card pk'><div class='stat-lbl'>Ca dẫn đầu</div><div class='stat-val pk'>${lead.S>0?lead.label:'-'}</div><div class='stat-sub'>${lead.S>0?nn(lead.S)+' điểm':'-'}</div></div>`;
  const seg=key=>rows.filter(r=>Number(r[key])>0).map(r=>`<div class='ratio-seg' style='width:${r[key]}%;background:${r.col}'>${r[key]}%</div>`).join('');
  document.getElementById(isKm?"sh_km_ratio":"sh_ratio").innerHTML=
    `<div style='font-size:.68rem;color:var(--mu);margin-bottom:5px'>Tỷ lệ ${rows.map(r=>`<b style='color:${r.col}'>${r.label}</b>`).join(' vs ')}</div>`
    +`<div style='font-size:.65rem;color:var(--mu);margin-bottom:3px'>Điểm:</div><div class='ratio-bar'>${seg('sp')}</div>`
    +`<div class='ratio-labels'>${rows.map(r=>`<span style='color:${r.col}'>${r.label.replace('Ca ','')} ${nn(r.S)}</span>`).join('')}</div>`
    +`<div style='font-size:.65rem;color:var(--mu);margin:8px 0 3px'>Số đơn:</div><div class='ratio-bar'>${seg('cp')}</div>`
    +`<div class='ratio-labels'>${rows.map(r=>`<span style='color:${r.col}'>${r.label.replace('Ca ','')} ${nn(r.C)}</span>`).join('')}</div>`
    +rows.map(r=>`<div style='margin-top:6px;font-size:.63rem;color:var(--mu)'>${r.label}: <b style='color:${r.col}'>${r.fks.map(f=>ds.fk_data[f]?.name||f).join(', ')||'(chưa gán)'}</b></div>`).join('');
  const hrcId=isKm?"sh_km_hrc":"sh_hrc";
  dch(hrcId);
  const hrDs=rows.filter(r=>r.fks.length).map(r=>({label:r.label,data:Array.from({length:24},(_,h)=>r.fks.reduce((s,fk)=>s+(ds.fk_data[fk]?.hour_counts_gmt7[h]||0),0)),backgroundColor:r.rgba,borderColor:r.col,borderWidth:1,borderRadius:3}));
  if(hrDs.length)CH[hrcId]=new Chart(document.getElementById(hrcId),{type:"bar",data:{labels:lbl7,datasets:hrDs},options:coL(false)});
  const chIds=isKm?{sang:"sh_km_sc",trung:"sh_km_tc",gay:"sh_km_gc"}:{sang:"sh_sc",trung:"sh_tc",gay:"sh_gc"};
  rows.forEach(r=>{
    const id=chIds[r.key];
    dch(id);
    if(!r.fks.length)return;
    const vals=r.fks.map(f=>isKm?(ds.fk_data[f]?.total_count||0):(ds.fk_data[f]?.total_score||0));
    CH[id]=new Chart(document.getElementById(id),{type:"bar",data:{labels:r.fks.map(f=>ds.fk_data[f]?.name||f),datasets:[{label:isKm?"Đơn":"Điểm",data:vals,backgroundColor:r.fks.map(f=>ha(FK_COL[f],.8)),borderColor:r.fks.map(f=>FK_COL[f]),borderWidth:1,borderRadius:4}]},options:co(false)});
  });
}

// ===== TAB: XẾP HẠNG =====
function rRank(){
  // Tháng hiện tại: ẩn tên vinh danh từ ngày 1-25 (BXH còn biến động), hiện từ ngày 26; tháng cũ luôn hiện
  const hideNames=(CUR_MONTH===curMonthKey())&&(new Date().getDate()<=25);
  document.getElementById("rkpl").innerHTML="Tháng "+D.month+(hideNames?" <span style='color:var(--go);font-size:.85em'>— tên vinh danh sẽ hiển thị từ ngày 26 hàng tháng</span>":"");
  const IMG='https://media.88new11.com/public/new88/site-tong/8d45f036-33ce-42e4-86c7-6b4174a6e109.png';
  function mkTrophyRow(fkList,cid){
    // Đồng bộ logic BXH của bảng Tổng Quan: Tổng (đơn + KM), loại Học Việc/Nghỉ Việc/Về Phép/C.Bộ Phận
    const EXCL=['C.Bộ Phận','Về Phép','Học Việc','Nghỉ Việc'];
    const {cong}=calcBonusPenalty(fkList);
    const active=fkList.filter(fk=>!EXCL.includes(ovGet(fk).khac));
    const s=[...active].sort((a,b)=>combinedTotal(b)-combinedTotal(a)).slice(0,3);
    // visual order: 2nd(left), 1st(center), 3rd(right) — position in image
    const slots=[
      {fk:s[1],l:'18%',t:'68%',nc:'#c4b5fd',sc:'#a855f7',fs:'clamp(1rem,3.2vw,1.5rem)'},
      {fk:s[0],l:'50.8%',t:'67%',nc:'#fbbf24',sc:'#f59e0b',fs:'clamp(1.3rem,4.2vw,1.95rem)'},
      {fk:s[2],l:'83%',t:'68%',nc:'#93c5fd',sc:'#60a5fa',fs:'clamp(1rem,3.2vw,1.5rem)'}
    ].filter(x=>x.fk);
    const ov=slots.map(x=>{
      const fd=D.fk_data[x.fk];
      const stroke="-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 10px "+x.nc;
      // Ẩn tên khi: (1) ngày 1-25 tháng hiện tại, (2) không có điểm CỘNG (hạng xử lý bất thường thấp)
      const label=(!hideNames&&combinedTotal(x.fk)>0&&(cong[x.fk]||0)>0)?fd.name:"";
      return "<div style=\"position:absolute;left:"+x.l+";top:"+x.t+";transform:translate(-50%,-50%);text-align:center\"><div style=\"color:"+x.nc+";font-weight:900;font-size:"+x.fs+";text-shadow:"+stroke+";letter-spacing:1px;white-space:nowrap\">"+label+"</div></div>";
    }).join('');
    document.getElementById(cid).innerHTML="<div style=\"position:relative;border-radius:12px;overflow:hidden\"><img src=\""+IMG+"\" style=\"width:100%;display:block\" loading=\"lazy\">"+ov+"</div>";
  }
  mkTrophyRow(D.fkvip,'rk-vip');
  mkTrophyRow(D.fkonl,'rk-onl');
}
function sFk(fk){selFK=fk;document.getElementById("dp").classList.add("show");rDC(fk);}
function rDC(fk){
  const fd=D.fk_data[fk];if(!fd)return;
  document.getElementById("dp").classList.add("show");
  document.getElementById("dpn").textContent=fd.name;
  document.getElementById("dpb").className="fk-card-type "+(fd.group==="vip"?"vip-badge":"onl-badge");
  document.getElementById("dpb").textContent=fd.group==="vip"?"FKVIP":"FKONL";
  document.getElementById("dp_sc").textContent=nn(fd.total_score);
  document.getElementById("dp_ct").textContent=nn(fd.total_count);
  if(dCh)dCh.destroy();
  const col=FK_COL[fk]||"#7c3aed",actD=(D.days_in_month||[]).filter(d=>D.day_scores[d-1]>0);
  dCh=new Chart(document.getElementById("dp_ch"),{type:"bar",data:{labels:actD.map(d=>""+d),datasets:[{label:"Điểm",data:actD.map(d=>fd.day_scores[d-1]),backgroundColor:ha(col,.7),borderColor:col,borderWidth:1,borderRadius:4}]},options:co(false)});
}

function toggleFKColorPicker(){
  const el=document.getElementById('fk-color-picker');
  if(!el)return;
  if(el.style.display==='none'){
    el.innerHTML=FK_KEYS.map(fk=>`<label style="display:flex;align-items:center;gap:5px;background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;cursor:pointer"><input type="color" value="${FK_COL[fk]||'#7c3aed'}" onchange="updateFKColor('${fk}',this.value)" style="width:22px;height:22px;border:none;border-radius:3px;cursor:pointer;padding:0;background:none"><span style="font-size:.68rem;font-weight:700;color:var(--tx)">${FK_NAMES[fk]}</span></label>`).join('');
    el.style.display='flex';
  }else{
    el.style.display='none';
  }
}
function updateFKColor(fk,hex){
  FK_COL[fk]=hex;
  const s=JSON.parse(localStorage.getItem('FK_COL_CUSTOM')||'{}');
  s[fk]=hex;localStorage.setItem('FK_COL_CUSTOM',JSON.stringify(s));
  rDataTab(); // vẽ lại toàn bộ chart với màu mới (giữ đúng ngày đang chọn)
}

rAll();