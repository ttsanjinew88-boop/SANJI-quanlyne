// ===== THỐNG KÊ KHUYẾN MÃI (thành công / từ chối / tiền thưởng đã phát) =====
function rKmStat(ds){
  const box=document.getElementById('data-kmstat');
  if(!box)return;
  if(dataSrc!=='km'||!ds){box.style.display='none';return;}
  box.style.display='block';
  const cards=document.getElementById('kmstatCards');
  const note=document.getElementById('kmstatNote');
  const wrap=document.getElementById('kmstatTblWrap');
  if(!ds.kmstat){
    cards.innerHTML='';
    wrap.style.display='none';
    note.style.display='block';
    document.getElementById('kmstatPromoTbl').innerHTML='';
    document.getElementById('kmstatPromoHdr').style.display='none';
    return;
  }
  note.style.display='none';wrap.style.display='block';
  const st=ds.kmstat;
  const ok=st.ok.reduce((a,b)=>a+b,0),rej=st.rej.reduce((a,b)=>a+b,0),rw=st.reward.reduce((a,b)=>a+b,0);
  const rate=(ok+rej)?Math.round(ok/(ok+rej)*100):0;
  cards.innerHTML=
    `<div class='stat-card gr'><div class='stat-lbl'>KM thành công</div><div class='stat-val gr'>${nn(ok)}</div><div class='stat-sub'>đơn được duyệt (cột Lý do từ chối trống)</div></div>`+
    `<div class='stat-card pk'><div class='stat-lbl'>KM từ chối</div><div class='stat-val' style='color:#ef4444'>${nn(rej)}</div><div class='stat-sub'>đơn bị từ chối (có lý do)</div></div>`+
    `<div class='stat-card bl'><div class='stat-lbl'>Tỷ lệ thành công</div><div class='stat-val bl'>${rate}%</div><div class='stat-sub'>${nn(ok)} / ${nn(ok+rej)} đơn</div></div>`+
    `<div class='stat-card go'><div class='stat-lbl'>Tiền thưởng đã phát</div><div class='stat-val go'>${nn(Math.round(rw))}</div><div class='stat-sub'>tổng cột Điểm thưởng của đơn thành công</div></div>`;
  // Bảng theo TỪNG MÃ KHUYẾN MÃI (NEW88_150_NV1 / NV2... tách riêng)
  const promos=Object.entries(st.promos||{}).sort((a,b)=>(b[1].ok+b[1].rej)-(a[1].ok+a[1].rej));
  const promoHtml=promos.length
    ?'<thead><tr><th style="text-align:left">Mã khuyến mãi</th><th style="color:#10b981">Thành công</th><th style="color:#ef4444">Từ chối</th><th>Tổng đơn</th><th>Tỷ lệ TC</th><th style="color:var(--go)">Tiền thưởng đã phát</th></tr></thead><tbody>'+
      promos.map(([nm,p])=>{
        const t=p.ok+p.rej;
        return `<tr><td style="text-align:left;font-weight:800;color:var(--cy)">${nm}</td><td style="color:#10b981;font-weight:700">${nn(p.ok)}</td><td style="color:#ef4444;font-weight:700">${p.rej?nn(p.rej):'-'}</td><td>${nn(t)}</td><td>${t?Math.round(p.ok/t*100):0}%</td><td style="color:var(--go);font-weight:800">${nn(Math.round(p.reward))}</td></tr>`;
      }).join('')+'</tbody>'
    :'';
  document.getElementById('kmstatPromoTbl').innerHTML=promoHtml;
  document.getElementById('kmstatPromoHdr').style.display=promos.length?'':'none';
  // Bảng số theo ngày GMT-4: ngày nào có đơn thì hiện
  const days=[];
  for(let d=1;d<=31;d++)if(st.ok[d-1]||st.rej[d-1])days.push(d);
  const tbl=document.getElementById('kmstatTbl');
  if(!days.length){tbl.innerHTML='<tbody><tr><td style="padding:12px;color:var(--mu)">Chưa có dữ liệu ngày nào.</td></tr></tbody>';return;}
  tbl.innerHTML='<thead><tr><th>Ngày (GMT−4)</th><th style="color:#10b981">Thành công</th><th style="color:#ef4444">Từ chối</th><th>Tổng đơn</th><th>Tỷ lệ TC</th><th style="color:var(--go)">Tiền thưởng đã phát</th></tr></thead><tbody>'+
    days.map(d=>{
      const o=st.ok[d-1],j=st.rej[d-1],t=o+j;
      return `<tr><td style="font-weight:800">${d}</td><td style="color:#10b981;font-weight:700">${nn(o)}</td><td style="color:#ef4444;font-weight:700">${j?nn(j):'-'}</td><td>${nn(t)}</td><td>${t?Math.round(o/t*100):0}%</td><td style="color:var(--go);font-weight:800">${nn(Math.round(st.reward[d-1]))}</td></tr>`;
    }).join('')+
    `<tr class="total-row"><td style="font-weight:900">TỔNG</td><td style="font-weight:900;color:#10b981">${nn(ok)}</td><td style="font-weight:900;color:#ef4444">${nn(rej)}</td><td style="font-weight:900">${nn(ok+rej)}</td><td style="font-weight:900">${rate}%</td><td style="font-weight:900;color:var(--go)">${nn(Math.round(rw))}</td></tr></tbody>`;
}
function rAll(){
  const act=document.querySelector(".pg.active")?.id;
  if(act==="pg-data")rDataTab();
  if(act==="pg-ko")rKO();
  if(act==="pg-shift")rShiftPanel();
  if(act==="pg-rank")rRank();
  if(act==="pg-admin")rAdminPanel();
  if(act==="pg-log")rLogPanel();
}
function bldDayBtns(ds){ds=ds||curDataSet();const days=ds.days_in_month_d7||ds.days_in_month||[];document.getElementById("dayBtns").innerHTML=days.map(d=>"<button class='day-btn"+(selDay===d?" active":"")+"' onclick='sDy("+d+",this)'>"+String(d).padStart(2,"0")+"</button>").join("");}
function sDy(d,el){selDay=d;document.querySelectorAll(".day-btn").forEach(b=>b.classList.remove("active"));el.classList.add("active");rDay(curDataSet());}

// ===== TAB: DỮ LIỆU — Theo Ngày =====
function rDay(ds){
  ds=ds||curDataSet();if(!ds)return;
  const d=selDay;if(!d)return;
  const dayScores=ds.day_scores_d7||ds.day_scores;
  const dayCounts=ds.day_counts_d7||ds.day_counts;
  const ts=dayScores[d-1]||0,tc=dayCounts[d-1]||0;
  // Dữ liệu giờ THEO ĐÚNG NGÀY đã chọn (hbd7); file cũ chưa có -> tạm dùng tổng cả tháng
  const perDay=!!(ds.hbd7&&ds.hbd7[d-1]);
  const hs7=perDay?ds.hbd7[d-1].map(Math.ceil):ds.hour_scores_gmt7; // roundV2: ô thô có 0.5 -> làm tròn lên khi hiển thị
  const hc7=perDay?ds.cbd7[d-1]:ds.hour_counts_gmt7;
  const peakH=hs7.indexOf(Math.max(...hs7));
  document.getElementById("d_s").textContent=nn(ts);
  document.getElementById("d_ss").textContent="Ngày "+String(d).padStart(2,"0")+" / Tháng "+ds.month;
  document.getElementById("d_c").textContent=nn(tc);
  document.getElementById("d_ph").textContent=String(peakH).padStart(2,"0")+"H–"+String((peakH+1)%24).padStart(2,"0")+"H";
  document.getElementById("d_ps").textContent=nn(hc7[peakH])+" đơn/h"+(perDay?" · ngày "+String(d).padStart(2,"0"):" (cả tháng — upload lại file để xem theo ngày)");
  const fkd={};FK_KEYS.forEach(fk=>{const fd=ds.fk_data[fk];fkd[fk]=(fd.day_scores_d7||fd.day_scores)[d-1]||0;});
  const vs=[...ds.fkvip].sort((a,b)=>fkd[b]-fkd[a]),os=[...ds.fkonl].sort((a,b)=>fkd[b]-fkd[a]);
  document.getElementById("d_tv").textContent=vs[0]?ds.fk_data[vs[0]].name:"-";document.getElementById("d_tvs").textContent=vs[0]?nn(fkd[vs[0]])+" điểm":"-";
  document.getElementById("d_to").textContent=os[0]?ds.fk_data[os[0]].name:"-";document.getElementById("d_tos").textContent=os[0]?nn(fkd[os[0]])+" điểm":"-";
  const top3=hs7.map((s,i)=>({h:i,s,c:hc7[i]})).sort((a,b)=>b.s-a.s).slice(0,3);
  document.getElementById("dt3").innerHTML=top3.map((x,i)=>"<div class='top3-item'><div class='top3-rank rk"+(i+1)+"'>"+(i+1)+"</div><div class='top3-label'>"+String(x.h).padStart(2,"0")+"H – "+String((x.h+1)%24).padStart(2,"0")+"H</div><div><div class='top3-val'>"+nn(x.s)+"</div><div class='top3-sub'>"+nn(x.c)+" đơn</div></div></div>").join("");
  // GMT-4 của ngày: xoay mảng GMT+7 (lệch cố định 11 giờ)
  const hs4=perDay?Array.from({length:24},(_,h)=>hs7[(h+11)%24]):ds.hour_scores_gmt4;
  const lbl=Array.from({length:24},(_,h)=>String(h).padStart(2,"0")+"H");
  dch("dhc");CH.dhc=new Chart(document.getElementById("dhc"),{type:"line",data:{labels:lbl,datasets:[{label:"GMT−4",data:hs4,borderColor:"#94a3b8",backgroundColor:"rgba(148,163,184,.05)",fill:true,tension:.4,pointRadius:2,borderWidth:1.5,borderDash:[4,3]},{label:"GMT+7",data:hs7,borderColor:"#7c3aed",backgroundColor:"rgba(124,58,237,.1)",fill:true,tension:.4,pointRadius:hs7.map((_,i)=>i===peakH?6:2),pointBackgroundColor:hs7.map((_,i)=>i===peakH?"#f59e0b":"#7c3aed"),borderWidth:2}]},options:coL(false)});
  const fkHr=fk=>{const fd=ds.fk_data[fk];return(perDay&&fd.hbd7)?fd.hbd7[d-1].map(Math.ceil):fd.hour_scores_gmt7;};
  dch("dvc");CH.dvc=new Chart(document.getElementById("dvc"),{type:"bar",data:{labels:lbl,datasets:ds.fkvip.filter(fk=>ds.fk_data[fk].total_score>0).map(fk=>({label:ds.fk_data[fk].name,data:fkHr(fk),backgroundColor:ha(FK_COL[fk],.7),borderColor:FK_COL[fk],borderWidth:1}))},options:coL(true)});
  dch("doc");CH.doc=new Chart(document.getElementById("doc"),{type:"bar",data:{labels:lbl,datasets:ds.fkonl.filter(fk=>ds.fk_data[fk].total_score>0).map(fk=>({label:ds.fk_data[fk].name,data:fkHr(fk),backgroundColor:ha(FK_COL[fk],.7),borderColor:FK_COL[fk],borderWidth:1}))},options:coL(true)});
}

// ===== TAB: DỮ LIỆU — Theo Tháng =====
function rMonth(ds){
  ds=ds||curDataSet();if(!ds)return;
  const dayScores=ds.day_scores_d7||ds.day_scores;
  const dayCounts=ds.day_counts_d7||ds.day_counts;
  const actD=ds.days_in_month_d7||ds.days_in_month||[];
  const ts=dayScores.reduce((a,b)=>a+b,0),tc=dayCounts.reduce((a,b)=>a+b,0);
  const pd=actD.length?actD.reduce((b,d)=>dayScores[d-1]>dayScores[b-1]?d:b,actD[0]):1;
  const vs=[...ds.fkvip].filter(fk=>ds.fk_data[fk].total_score>0).sort((a,b)=>ds.fk_data[b].total_score-ds.fk_data[a].total_score);
  const os=[...ds.fkonl].filter(fk=>ds.fk_data[fk].total_score>0).sort((a,b)=>ds.fk_data[b].total_score-ds.fk_data[a].total_score);
  document.getElementById("m_s").textContent=nn(ts);document.getElementById("m_p").textContent="Tháng "+ds.month;
  document.getElementById("m_c").textContent=nn(tc);
  document.getElementById("m_pd").textContent="Ngày "+pd;document.getElementById("m_pds").textContent=nn(dayScores[pd-1])+" điểm · "+nn(dayCounts[pd-1])+" đơn";
  document.getElementById("m_tv").textContent=vs[0]?ds.fk_data[vs[0]].name:"-";document.getElementById("m_tvs").textContent=vs[0]?nn(ds.fk_data[vs[0]].total_score)+" điểm":"-";
  document.getElementById("m_to").textContent=os[0]?ds.fk_data[os[0]].name:"-";document.getElementById("m_tos").textContent=os[0]?nn(ds.fk_data[os[0]].total_score)+" điểm":"-";
  dch("mdc");CH.mdc=new Chart(document.getElementById("mdc"),{type:"bar",data:{labels:actD.map(d=>""+d),datasets:[{label:"Điểm",data:actD.map(d=>dayScores[d-1]),backgroundColor:actD.map(d=>d===pd?"rgba(245,158,11,.85)":"rgba(124,58,237,.55)"),borderColor:actD.map(d=>d===pd?"#f59e0b":"#7c3aed"),borderWidth:1,borderRadius:4}]},options:co(false)});
  // TB thời gian cao điểm trong tháng (GMT+7): tổng điểm từng giờ chia số ngày -> cột vàng = giờ cao điểm TB
  const nDays=Math.max(actD.length,1);
  const hlbl=Array.from({length:24},(_,h)=>String(h).padStart(2,"0")+"H");
  const avg=ds.hour_scores_gmt7.map(v=>Math.round(v/nDays));
  const pa=avg.indexOf(Math.max(...avg));
  dch("mavg");CH.mavg=new Chart(document.getElementById("mavg"),{type:"bar",data:{labels:hlbl,datasets:[{label:"TB điểm/giờ/ngày",data:avg,backgroundColor:avg.map((_,i)=>i===pa?"rgba(245,158,11,.85)":"rgba(6,182,212,.55)"),borderColor:avg.map((_,i)=>i===pa?"#f59e0b":"#06b6d4"),borderWidth:1,borderRadius:4}]},options:co(false)});
}

// ===== TAB: HIỆU SUẤT DUYỆT ĐƠN (FKVIP / FKONL gộp 1 bảng, xếp hạng riêng biệt) =====
function fkGroupCardHtml(fk,rank,isS,dataObj){
  dataObj=dataObj||D;
  const fd=dataObj.fk_data[fk];
  const tot=isS?fd.total_score:fd.total_count;
  const max=isS?Math.max(...[...dataObj.fkvip,...dataObj.fkonl].map(k=>dataObj.fk_data[k].total_score),1):Math.max(...[...dataObj.fkvip,...dataObj.fkonl].map(k=>dataObj.fk_data[k].total_count),1);
  const pct=Math.round((tot/max)*100);
  const col=fkGrpCol(fk);
  const badgeCls=fd.group==="vip"?"vip-badge":"onl-badge";
  const rankCol=rank===1?"background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#111":rank===2?"background:linear-gradient(135deg,#94a3b8,#cbd5e1);color:#111":rank===3?"background:linear-gradient(135deg,#cd7f32,#b87333);color:#fff":"background:#1e2545;color:#64748b";
  return `<div class="fk-card fk-card-mini" title="Bấm để xem biểu đồ ${fd.name}" onclick="rPerfDetail('${fk}','${dataObj===KMD?'km':'don'}')">
    <div class="fk-card-rank" style="${rankCol}">${tot>0?rank:"-"}</div>
    <div class="fkm-name" style="color:${col}">${fd.name}</div>
    <div class="fkm-score" style="color:${col}">${tot>0?nn(tot):"-"}</div>
    <div class="fkm-sub">${isS?nn(fd.total_count)+" đơn":nn(fd.total_score)+" điểm"}</div>
    <div class="fk-mini-bar"><div class="fk-mini-bar-fill" style="width:${pct}%;background:${col}"></div></div>
  </div>`;
}
function rPerfDetail(fk,which){
  const dataObj=which==="km"?KMD:D;
  if(!dataObj)return;
  const fd=dataObj.fk_data[fk];if(!fd)return;
  document.getElementById('koCmName').textContent=fd.name;
  const badge=document.getElementById('koCmBadge');
  badge.textContent=(fd.group==="vip"?"FKVIP":"FKONL")+(which==="km"?" · KHUYẾN MÃI":" · DUYỆT ĐƠN");
  badge.className='fk-card-type '+(fd.group==="vip"?"vip-badge":"onl-badge");
  document.getElementById('koCmSc').textContent=nn(fd.total_score);
  document.getElementById('koCmCt').textContent=nn(fd.total_count);
  const scores=which==='km'?(fd.day_scores_d7||fd.day_scores):fd.day_scores;
  dch('koCmCh');
  document.getElementById('koChartModal').classList.add('show'); // hiện modal trước để canvas có kích thước
  CH.koCmCh=new Chart(document.getElementById('koCmCh'),{type:'bar',data:{labels:dataObj.days,datasets:[{label:'Điểm theo ngày',data:scores,backgroundColor:ha(fkGrpCol(fk),.75),borderColor:fkGrpCol(fk),borderWidth:1,borderRadius:3}]},options:co(false)});
}
function koCloseChart(){dch('koCmCh');document.getElementById('koChartModal').classList.remove('show');}
function buildCombinedPerfTable(dataObj,isS,src){
  src=src||'don';
  const canFix=isS&&typeof canEdit==='function'&&canEdit('ko'); // chế độ Điểm + quyền Sửa -> cho chỉnh tay
  const allD=Array.from({length:31},(_,i)=>i+1),actD=dataObj.days_in_month||[];
  const vipRanked=[...dataObj.fkvip].sort((a,b)=>dataObj.fk_data[b].total_score-dataObj.fk_data[a].total_score);
  const onlRanked=[...dataObj.fkonl].sort((a,b)=>dataObj.fk_data[b].total_score-dataObj.fk_data[a].total_score);
  const vipRank={};vipRanked.forEach((fk,i)=>{vipRank[fk]=dataObj.fk_data[fk].total_score>0?i+1:"-";});
  const onlRank={};onlRanked.forEach((fk,i)=>{onlRank[fk]=dataObj.fk_data[fk].total_score>0?i+1:"-";});
  let h="<table class='mtbl'><thead><tr><th class='sticky-col'>TÊN NHÂN VIÊN</th><th>BXH</th><th>Tổng</th>";
  allD.forEach(d=>{h+="<th style='"+(actD.includes(d)?"":"color:#64748b")+"'>"+d+"</th>";});
  h+="</tr></thead><tbody>";
  function rowsFor(list,rankMap,rowCls){
    list.forEach(fk=>{
      const fd=dataObj.fk_data[fk],tot=isS?fd.total_score:fd.total_count,rnk=rankMap[fk],bc=rnk===1?"cell-1":rnk===2?"cell-2":rnk===3?"cell-3":"";
      h+="<tr class='"+rowCls+"'><td class='sticky-col'>"+fd.name+"</td><td class='"+bc+"'>"+rnk+"</td><td class='cell-tot'>"+(tot>0?nn(tot):"-")+"</td>";
      allD.forEach(d=>{
        const v=isS?fd.day_scores[d-1]:fd.day_counts[d-1];
        const cls=(v===0?"cell-zero":v>=(isS?2000:800)?"cell-hi":"");
        if(canFix){
          h+=`<td class="${cls} cell-edit" contenteditable="true" data-fk="${fk}" data-day="${d}" data-src="${src}" title="Bấm để chỉnh tay điểm" onblur="perfEdit(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${v===0?"":nn(v)}</td>`;
        }else{
          h+="<td class='"+cls+"'>"+(v===0?"-":nn(v))+"</td>";
        }
      });
      h+="</tr>";
    });
  }
  rowsFor(dataObj.fkvip,vipRank,"vip-row");
  rowsFor(dataObj.fkonl,onlRank,"onl-row");
  const allFK=[...dataObj.fkvip,...dataObj.fkonl];
  const tg=isS?allFK.reduce((s,fk)=>s+dataObj.fk_data[fk].total_score,0):allFK.reduce((s,fk)=>s+dataObj.fk_data[fk].total_count,0);
  h+="<tr class='total-row'><td class='sticky-col'>TỔNG</td><td>-</td><td>"+nn(tg)+"</td>";
  allD.forEach(d=>{const v=isS?allFK.reduce((s,fk)=>s+dataObj.fk_data[fk].day_scores[d-1],0):allFK.reduce((s,fk)=>s+dataObj.fk_data[fk].day_counts[d-1],0);h+="<td>"+(v>0?nn(v):"-")+"</td>";});
  h+="</tr></tbody></table>";
  return h;
}
// Chỉnh tay điểm Duyệt Đơn / Khuyến Mãi theo ngày (khi hệ thống cập nhật sai) — lưu cloud + ghi Lịch Sử chi tiết
function perfEdit(el){
  const fk=el.dataset.fk,d=Number(el.dataset.day),src=el.dataset.src==='km'?'km':'don';
  const ds=src==='km'?KMD:D;
  if(!ds||!ds.fk_data[fk]){rKoDaily();return;}
  const fd=ds.fk_data[fk];
  const from=fd.day_scores[d-1]||0;
  const to=Math.max(0,Number(String(el.textContent).replace(/[^\d]/g,''))||0);
  if(to===from){rKoDaily();return;}
  fd.day_scores[d-1]=to;
  fd.total_score=fd.day_scores.reduce((a,b)=>a+(b||0),0);
  if(Array.isArray(ds.day_scores))ds.day_scores[d-1]=Math.max(0,(ds.day_scores[d-1]||0)+(to-from));
  savePerfEdit(src,fk,d,from,to);
  rKoDaily();
}
async function savePerfEdit(src,fk,d,from,to){
  if(!SB.ready()||!CUR_MONTH)return;
  try{
    setCloudStatus('Đang lưu chỉnh tay...');
    await SB.saveReport(src,CUR_MONTH,src==='km'?KMD:D);
    setCloudStatus('Đã lưu chỉnh tay ✓');
    logAction('Chỉnh tay điểm '+(src==='km'?'Khuyến Mãi':'Duyệt Đơn'),(FK_NAMES[fk]||fk)+' · ngày '+d+'/'+dispMonth(CUR_MONTH)+': '+nn(from)+' → '+nn(to));
  }catch(e){
    console.error('savePerfEdit',e);
    setCloudStatus('Lỗi lưu chỉnh tay',true);
  }
}
function rKoDaily(){
  const isS=mView==="diem";
  document.getElementById("vipCount").textContent=D.fkvip.length+" người";
  document.getElementById("onlCount").textContent=D.fkonl.length+" người";
  const vRanked=[...D.fkvip].sort((a,b)=>D.fk_data[b].total_score-D.fk_data[a].total_score);
  const oRanked=[...D.fkonl].sort((a,b)=>D.fk_data[b].total_score-D.fk_data[a].total_score);
  document.getElementById("perfVipGrid").innerHTML=vRanked.map((fk,i)=>fkGroupCardHtml(fk,i+1,isS,D)).join("");
  document.getElementById("perfOnlGrid").innerHTML=oRanked.map((fk,i)=>fkGroupCardHtml(fk,i+1,isS,D)).join("");
  document.getElementById("perfCombinedTable").innerHTML=buildCombinedPerfTable(D,isS,'don');

  if(KMD){
    document.getElementById("kmEmptyState").style.display="none";
    document.getElementById("kmDataWrap").style.display="block";
    const badge=document.getElementById("kmStatusBadge");
    badge.textContent="Tháng "+(KMD.month||"-");
    badge.style.cssText="background:rgba(16,185,129,.15);color:#10b981";
    document.getElementById("kmVipCount").textContent=KMD.fkvip.length+" người";
    document.getElementById("kmOnlCount").textContent=KMD.fkonl.length+" người";
    const kv=[...KMD.fkvip].sort((a,b)=>KMD.fk_data[b].total_score-KMD.fk_data[a].total_score);
    const ko=[...KMD.fkonl].sort((a,b)=>KMD.fk_data[b].total_score-KMD.fk_data[a].total_score);
    document.getElementById("kmVipGrid").innerHTML=kv.map((fk,i)=>fkGroupCardHtml(fk,i+1,isS,KMD)).join("");
    document.getElementById("kmOnlGrid").innerHTML=ko.map((fk,i)=>fkGroupCardHtml(fk,i+1,isS,KMD)).join("");
    document.getElementById("kmCombinedTable").innerHTML=buildCombinedPerfTable(KMD,isS,'km');
  }else{
    document.getElementById("kmEmptyState").style.display="block";
    document.getElementById("kmDataWrap").style.display="none";
  }
}
// ===== TAB: TỔNG QUAN helpers =====
function combinedTotal(fk){return (D.fk_data[fk]?.total_score||0)+(KMD?(KMD.fk_data[fk]?.total_score||0):0);}
function anCombined(fk){return anTotal('abuse',fk)+anTotal('mkt',fk);}
function ovWorkDays(fk){
  const fd=D.fk_data[fk];
  return (D.days_in_month||[]).filter(d=>(fd.day_scores[d-1]||0)>0).length;
}
function calcBonusPenalty(fkList){
  const EXCL=['C.Bộ Phận','Về Phép','Học Việc','Nghỉ Việc'];
  const active=fkList.filter(fk=>!EXCL.includes(ovGet(fk).khac));
  const perfSorted=[...active].sort((a,b)=>combinedTotal(b)-combinedTotal(a));
  const anSorted=[...active].sort((a,b)=>anCombined(b)-anCombined(a));
  const anRank={};anSorted.forEach((fk,i)=>{anRank[fk]=i+1;});
  const sumActive=active.reduce((s,fk)=>s+combinedTotal(fk),0);
  const avg=active.length?sumActive/active.length:0;
  const CONG_VALS=[15,10,5];
  const cong={},tru={};
  fkList.forEach(fk=>{cong[fk]=0;tru[fk]=0;});
  for(let i=0;i<Math.min(3,perfSorted.length);i++){
    const fk=perfSorted[i];
    if((anRank[fk]||999)<=4) cong[fk]=CONG_VALS[i];
  }
  active.forEach(fk=>{
    if((anRank[fk]||999)<=3) return;
    const diffPct=avg>0?((avg-combinedTotal(fk))/avg*100):0;
    if(diffPct>=15) tru[fk]=10;
    else if(diffPct>=8) tru[fk]=5;
  });
  return {cong,tru};
}
function buildOvTable(fkList){
  const EXCL=['C.Bộ Phận','Về Phép','Học Việc','Nghỉ Việc'];
  const {cong:congMap,tru:truMap}=calcBonusPenalty(fkList);
  const active=fkList.filter(fk=>!EXCL.includes(ovGet(fk).khac));
  const ranked=[...active].sort((a,b)=>combinedTotal(b)-combinedTotal(a));
  const rm={};ranked.forEach((fk,i)=>{rm[fk]=i+1;});
  const grpTotal=active.reduce((s,fk)=>s+combinedTotal(fk),0)||1;
  const maxTotal=Math.max(...fkList.map(fk=>combinedTotal(fk)),1);
  const KHAC_OPTS=['','C.Bộ Phận','Về Phép','Học Việc','Nghỉ Việc'];
  let h="<thead><tr><th style='text-align:left'>TÊN NHÂN VIÊN</th><th>BXH</th><th style='text-align:left'>Tổng (đơn+KM)</th><th>Ngày làm việc</th><th>TB ngày</th><th>Tỷ trọng</th><th>Cộng</th><th>Trừ</th><th>Khác</th><th style='text-align:left'>Ghi chú</th></tr></thead><tbody>";
  fkList.forEach(fk=>{
    const fd=D.fk_data[fk];
    const ov=ovGet(fk);
    const isExcl=EXCL.includes(ov.khac);
    const ctot=combinedTotal(fk);
    // Ngày làm việc: điền tay (ưu tiên) > Tổng ngày làm từ lưới Công Việc Mỗi Ngày > suy từ ngày có điểm
    const wd=ov.wd!=null?ov.wd:(typeof wkTotalDays==='function'&&wkTotalDays(fk)>0?wkTotalDays(fk):ovWorkDays(fk));
    const avg=wd?Math.round(ctot/wd):0;
    const pct=isExcl?"-":Math.round(ctot/grpTotal*1000)/10+"%";
    const barPct=Math.round(ctot/maxTotal*100);
    const col=fkGrpCol(fk);
    const rnk=isExcl?"-":(rm[fk]||"-");
    const bc=rnk===1?"cell-1":rnk===2?"cell-2":rnk===3?"cell-3":"";
    const congVal=isExcl?0:congMap[fk];
    const truVal=isExcl?0:truMap[fk];
    const congDisp=isExcl?"-":congVal>0?`<span style="color:#10b981;font-weight:800">+${congVal}</span>`:`<span style="color:var(--mu)">-</span>`;
    const truDisp=isExcl?"-":truVal>0?`<span style="color:#ef4444;font-weight:800">-${truVal}</span>`:`<span style="color:var(--mu)">-</span>`;
    const khacOpts=KHAC_OPTS.map(o=>`<option value="${o}"${ov.khac===o?" selected":""}>${o||"—"}</option>`).join("");
    const rowStyle=isExcl?"opacity:.55":"";
    // Quyền SỬA tab KO mới chỉnh được Ngày làm việc / Khác / Ghi chú — quyền xem chỉ đọc
    const canFixOv=CUR_PROFILE?canEdit('ko'):false;
    const wdCell=canFixOv
      ?`<td class="cell-edit" contenteditable="true" data-fk="${fk}" data-f="wd" onblur="onOvBlur(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}" style="text-align:center">${wd}</td>`
      :`<td style="text-align:center">${wd}</td>`;
    const khacCell=canFixOv
      ?`<td style="padding:2px 4px"><select data-fk="${fk}" onchange="onKhacChange(this)" style="background:var(--card2);border:1px solid var(--border);color:var(--tx);padding:2px 4px;border-radius:4px;font-size:.62rem;width:100%">${khacOpts}</select></td>`
      :`<td style="text-align:center">${ov.khac||'—'}</td>`;
    const noteCell=canFixOv
      ?`<td class="cell-edit" contenteditable="true" data-fk="${fk}" data-f="note" onblur="onOvBlur(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}" style="text-align:left">${ov.note||""}</td>`
      :`<td style="text-align:left">${ov.note||""}</td>`;
    h+=`<tr style="${rowStyle}">
      <td class="sticky-col"><b>${fd.name}</b>${isExcl?`<span style="font-size:.55rem;background:rgba(239,68,68,.15);color:#ef4444;border-radius:4px;padding:1px 5px;margin-left:5px">${ov.khac}</span>`:""}</td>
      <td class="${bc}">${rnk}</td>
      <td class="bar-cell"><div class="bar-fill" style="width:${barPct}%;background:${col}"></div><span class="bar-text">${nn(ctot)}</span></td>
      ${wdCell}
      <td>${nn(avg)}</td>
      <td>${pct}</td>
      <td style="text-align:center">${congDisp}</td>
      <td style="text-align:center">${truDisp}</td>
      ${khacCell}
      ${noteCell}
    </tr>`;
  });
  h+="</tbody>";
  return h;
}
function ovFootHtml(fkList){
  const EXCL=['C.Bộ Phận','Về Phép','Học Việc','Nghỉ Việc'];
  const active=fkList.filter(fk=>!EXCL.includes(ovGet(fk).khac));
  const n=active.length||1;
  const sumScore=active.reduce((s,fk)=>s+combinedTotal(fk),0);
  const sumCount=active.reduce((s,fk)=>s+D.fk_data[fk].total_count+(KMD?KMD.fk_data[fk]?.total_count||0:0),0);
  const avgScore=Math.round(sumScore/n*10)/10;
  const avgCount=Math.round(sumCount/n);
  const avgPct=Math.round((100/n)*10)/10;
  return `<div class="ofc"><div class="ofl">Tổng TB / người</div><div class="ofv">${nn(avgScore)}</div><div style="font-size:.6rem;color:var(--mu2)">${nn(avgCount)} đơn TB</div></div>
  <div class="ofc"><div class="ofl">${active.length} FK (${fkList.length} tổng)</div><div class="ofv">${nn(sumScore)}</div></div>
  <div class="ofc"><div class="ofl">Hiệu suất TB (tỷ trọng đều)</div><div class="ofv">${avgPct}%</div></div>`;
}
function onOvBlur(el){
  const fk=el.dataset.fk,f=el.dataset.f;
  let val=el.textContent.trim();
  if(f==="wd"){val=val.replace(/[^\d]/g,"");ovSet(fk,f,val===""?null:Number(val));}
  else if(f==="note"){ovSet(fk,f,val);}
  rKoOverview();
}
function onKhacChange(el){ovSet(el.dataset.fk,'khac',el.value);rKoOverview();}
function rKoOverview(){
  document.getElementById("ovVipCount").textContent=D.fkvip.length+" người";
  document.getElementById("ovOnlCount").textContent=D.fkonl.length+" người";
  document.getElementById("ovVipTbl").innerHTML=buildOvTable(D.fkvip);
  document.getElementById("ovOnlTbl").innerHTML=buildOvTable(D.fkonl);
  document.getElementById("ovVipFoot").innerHTML=ovFootHtml(D.fkvip);
  document.getElementById("ovOnlFoot").innerHTML=ovFootHtml(D.fkonl);
  // Bảng hạn mức duyệt đơn (dữ liệu nhập ở view Đề Xuất Hạn Mức Duyệt)
  const lt=document.getElementById('ovLimitTbl');
  if(lt){
    const rows=FK_KEYS.filter(fk=>LIMITS[fk]&&(LIMITS[fk].limit||LIMITS[fk].pcq));
    lt.innerHTML='<thead><tr><th style="text-align:left">NHÂN VIÊN</th><th>Nhóm</th><th>Hạn mức duyệt đơn</th><th>Phê duyệt PCQ</th></tr></thead><tbody>'+
      (rows.length?rows.map(fk=>{
        const lm=LIMITS[fk];
        return `<tr><td style="text-align:left;font-weight:700">${FK_NAMES[fk]}</td><td><span style="color:${fkGrpCol(fk)};font-weight:700">${FKVIP.includes(fk)?'FKVIP':'FKONL'}</span></td><td style="color:var(--go);font-weight:800">${lm.limit||'—'}</td><td style="color:${lm.pcq==='Duyệt'?'#10b981':lm.pcq==='Từ chối'?'#ef4444':'var(--mu)'};font-weight:700">${lm.pcq||'—'}</td></tr>`;
      }).join(''):'<tr><td colspan="4" style="color:var(--mu);padding:14px">Chưa có hạn mức nào — nhập trong view Đề Xuất Hạn Mức Duyệt</td></tr>')+'</tbody>';
  }
}

// ===== TAB: BẤT THƯỜNG THEO NGÀY (2 bảng song song: Abuse + MKT) =====
function buildAnGridAbuse(fkList){
  const allD=Array.from({length:31},(_,i)=>i+1),actD=D.days_in_month||[];
  const ranked=[...fkList].sort((a,b)=>anCombined(b)-anCombined(a));
  const rm={};ranked.forEach((fk,i)=>{rm[fk]=i+1;});
  let h="<table class='mtbl'><thead><tr><th class='sticky-col'>TÊN NHÂN VIÊN</th><th>BXH</th><th>Tổng</th>";
  allD.forEach(d=>{h+="<th style='"+(actD.includes(d)?"":"color:#64748b")+"'>"+d+"</th>";});
  h+="</tr></thead><tbody>";
  fkList.forEach(fk=>{
    const fd=D.fk_data[fk],tot=anCombined(fk),rnk=rm[fk],bc=rnk===1?"cell-1":rnk===2?"cell-2":rnk===3?"cell-3":"";
    h+="<tr><td class='sticky-col'>"+fd.name+"</td><td class='"+bc+"'>"+rnk+"</td><td class='cell-tot'>"+(tot>0?nn(tot):"-")+"</td>";
    allD.forEach(d=>{
      const v=anGet('abuse',fk,d);
      h+=`<td class="cell-edit" contenteditable="true" data-fk="${fk}" data-day="${d}" data-cat="abuse" onblur="onAnBlur(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${v||""}</td>`;
    });
    h+="</tr>";
  });
  const tg=fkList.reduce((s,fk)=>s+anCombined(fk),0);
  h+="<tr class='total-row'><td class='sticky-col'>TỔNG</td><td>-</td><td>"+nn(tg)+"</td>";
  allD.forEach(d=>{
    const v=fkList.reduce((s,fk)=>s+anGet('abuse',fk,d)+anGet('mkt',fk,d),0);
    h+="<td>"+(v>0?nn(v):"-")+"</td>";
  });
  h+="</tr></tbody></table>";
  return h;
}
function buildAnGridMkt(fkList){
  const allD=Array.from({length:31},(_,i)=>i+1),actD=D.days_in_month||[];
  let h="<table class='mtbl'><thead><tr><th class='sticky-col'>TÊN NHÂN VIÊN</th><th>Tổng</th>";
  allD.forEach(d=>{h+="<th style='"+(actD.includes(d)?"":"color:#64748b")+"'>"+d+"</th>";});
  h+="</tr></thead><tbody>";
  fkList.forEach(fk=>{
    const fd=D.fk_data[fk],tot=anTotal('mkt',fk);
    h+="<tr><td class='sticky-col'>"+fd.name+"</td><td class='cell-tot'>"+(tot>0?nn(tot):"-")+"</td>";
    allD.forEach(d=>{
      const v=anGet('mkt',fk,d);
      h+=`<td class="cell-edit" contenteditable="true" data-fk="${fk}" data-day="${d}" data-cat="mkt" onblur="onAnBlur(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${v||""}</td>`;
    });
    h+="</tr>";
  });
  const tg=fkList.reduce((s,fk)=>s+anTotal('mkt',fk),0);
  h+="<tr class='total-row'><td class='sticky-col'>TỔNG</td><td>"+nn(tg)+"</td>";
  allD.forEach(d=>{
    const v=fkList.reduce((s,fk)=>s+anGet('mkt',fk,d),0);
    h+="<td>"+(v>0?nn(v):"-")+"</td>";
  });
  h+="</tr></tbody></table>";
  return h;
}
function onAnBlur(el){
  const fk=el.dataset.fk,day=Number(el.dataset.day),cat=el.dataset.cat||'abuse';
  const val=el.textContent.replace(/[^\d]/g,"");
  anSet(cat,fk,day,Number(val||0));
  rKoAnomaly();
}
function rKoAnomaly(){
  document.getElementById("anVipCount").textContent=D.fkvip.length+" người";
  document.getElementById("anOnlCount").textContent=D.fkonl.length+" người";
  document.getElementById("mktVipCount").textContent=D.fkvip.length+" người";
  document.getElementById("mktOnlCount").textContent=D.fkonl.length+" người";
  document.getElementById("anVipTable").innerHTML=buildAnGridAbuse(D.fkvip);
  document.getElementById("anOnlTable").innerHTML=buildAnGridAbuse(D.fkonl);
  document.getElementById("mktVipTable").innerHTML=buildAnGridMkt(D.fkvip);
  document.getElementById("mktOnlTable").innerHTML=buildAnGridMkt(D.fkonl);

  const totalAll=FK_KEYS.reduce((s,fk)=>s+anCombined(fk),0);
  document.getElementById("an_total").textContent=nn(totalAll);

  const vRanked=[...D.fkvip].sort((a,b)=>anCombined(b)-anCombined(a));
  const oRanked=[...D.fkonl].sort((a,b)=>anCombined(b)-anCombined(a));
  const topVip=vRanked[0],topVipT=topVip?anCombined(topVip):0;
  const topOnl=oRanked[0],topOnlT=topOnl?anCombined(topOnl):0;
  document.getElementById("an_topvip").textContent=topVipT>0?D.fk_data[topVip].name:"-";
  document.getElementById("an_topvips").textContent=topVipT>0?nn(topVipT)+" lượt":"-";
  document.getElementById("an_toponl").textContent=topOnlT>0?D.fk_data[topOnl].name:"-";
  document.getElementById("an_toponls").textContent=topOnlT>0?nn(topOnlT)+" lượt":"-";
  const allRanked=[...FK_KEYS].sort((a,b)=>anCombined(b)-anCombined(a));
  const topAll=allRanked[0],topAllT=topAll?anCombined(topAll):0;
  document.getElementById("an_topall").textContent=topAllT>0?D.fk_data[topAll].name:"-";
  document.getElementById("an_topalls").textContent=topAllT>0?nn(topAllT)+" lượt":"-";
}

function rKO(){
  if(koView==="overview")rKoOverview();
  else if(koView==="daily")rKoDaily();
  else if(koView==="limit")rKoLimit();
  else rKoAnomaly();
}
// (Cảnh báo "Vượt Hạn Mức" đã chuyển sang tab Dữ Liệu → Báo Cáo Đơn Rút — xem DR.renderOverLimit)

// ===== VIEW: ĐỀ XUẤT HẠN MỨC DUYỆT (lưu cloud theo tháng) =====
let LIMITS={}; // {fk:{limit:'20.000.000đ', pcq:'Duyệt'}}
function rKoLimit(){
  const tbl=document.getElementById('limTbl');
  if(!tbl)return;
  if(CUR_PROFILE&&!canEdit('ko')){tbl.innerHTML='<tbody><tr><td style="padding:16px;color:var(--mu)">Chỉ tài khoản có quyền SỬA tab Hiệu Suất KO mới xem được mục này.</td></tr></tbody>';return;}
  const names=fk=>FK_NAMES[fk]||fk;
  const donV=fk=>D.fk_data[fk]?.total_score||0;
  const kmV=fk=>KMD?(KMD.fk_data[fk]?.total_score||0):0;
  const btV=fk=>anCombined(fk);
  // 3 chart cột: đơn / KM / bất thường (màu theo nhóm VIP cyan - ONL tím)
  const mk=(id,valFn)=>{
    dch(id);
    const fks=FK_KEYS.filter(fk=>valFn(fk)>0);
    if(!fks.length)return;
    CH[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels:fks.map(names),datasets:[{label:'Giá trị',data:fks.map(valFn),backgroundColor:fks.map(fk=>ha(fkGrpCol(fk),.75)),borderColor:fks.map(fk=>fkGrpCol(fk)),borderWidth:1,borderRadius:4}]},options:co(false)});
  };
  mk('lim_don',donV);mk('lim_km',kmV);mk('lim_bt',btV);
  // Bảng %: so với max trong nhóm; VIP = TB(đơn, BT); ONL = TB(đơn, KM, BT)
  const canFix=CUR_PROFILE?canEdit('ko'):false;
  const pct=(v,max)=>max>0?Math.round(v/max*100):0;
  // Ô % dạng thanh bar màu (giống Excel): thanh dài theo %, 3 màu 3 tiêu chí
  const chip=(p,col)=>`<td style="min-width:74px;padding:4px 6px"><div style="position:relative;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:4px;height:17px;overflow:hidden"><div style="position:absolute;left:0;top:0;bottom:0;width:${p}%;background:linear-gradient(90deg,${ha(col,.7)},${ha(col,.45)})"></div><span style="position:relative;display:block;text-align:center;font-size:.6rem;font-weight:800;color:var(--tx);line-height:16px">${p}%</span></div></td>`;
  let h=`<thead><tr><th>STT</th><th>BỘ PHẬN</th><th style="text-align:left">TÊN NHÂN VIÊN</th><th>Hiệu suất đơn</th><th style="color:#3b82f6">%</th><th>Hiệu suất KM</th><th style="color:#ec4899">%</th><th>Hiệu suất bất thường</th><th style="color:#f59e0b">%</th><th>Tổng đánh giá</th><th>Hạn mức đang duyệt</th><th>Phê duyệt PCQ</th></tr></thead><tbody>`;
  let stt=1;
  [{label:'FKVIP',list:D.fkvip,col:'#06b6d4'},{label:'FKONL',list:D.fkonl,col:'#a78bfa'}].forEach(g=>{
    const maxDon=Math.max(...g.list.map(donV),0);
    const maxKm=Math.max(...g.list.map(kmV),0);
    const maxBt=Math.max(...g.list.map(btV),0);
    g.list.forEach((fk,i)=>{
      const pd=pct(donV(fk),maxDon),pk=pct(kmV(fk),maxKm),pb=pct(btV(fk),maxBt);
      const total=Math.round((pd+pk+pb)/3); // cả 2 nhóm: TB 3 tiêu chí
      const lm=LIMITS[fk]||{};
      const limitCell=canFix
        ?`<input type="text" value="${(lm.limit||'').replace(/"/g,'&quot;')}" placeholder="VD: 20.000.000đ" onchange="limSet('${fk}','limit',this.value)" style="background:var(--card2);border:1px solid var(--border2);border-radius:6px;color:var(--go);font-weight:700;font-size:.66rem;padding:4px 8px;width:120px;text-align:center;outline:none">`
        :`<span style="color:var(--go);font-weight:700">${lm.limit||'—'}</span>`;
      const pcqCell=canFix
        ?`<select onchange="limSet('${fk}','pcq',this.value)" style="background:var(--card2);border:1px solid var(--border2);border-radius:6px;color:${lm.pcq==='Duyệt'?'#10b981':lm.pcq==='Từ chối'?'#ef4444':'var(--mu)'};font-weight:700;font-size:.66rem;padding:4px 6px;cursor:pointer;outline:none">
            <option value="" ${!lm.pcq?'selected':''} style="background:#131830">—</option>
            <option value="Duyệt" ${lm.pcq==='Duyệt'?'selected':''} style="background:#131830">Duyệt</option>
            <option value="Từ chối" ${lm.pcq==='Từ chối'?'selected':''} style="background:#131830">Từ chối</option>
          </select>`
        :`<span style="color:${lm.pcq==='Duyệt'?'#10b981':lm.pcq==='Từ chối'?'#ef4444':'var(--mu)'};font-weight:700">${lm.pcq||'—'}</span>`;
      h+=`<tr>`+
        `<td class="stt">${stt++}</td>`+
        (i===0?`<td rowspan="${g.list.length}" style="color:${g.col};font-weight:800;vertical-align:middle">${g.label}</td>`:'')+
        `<td style="text-align:left;font-weight:700;padding-left:9px">${names(fk)}</td>`+
        `<td>${nn(donV(fk))}</td>${chip(pd,'#3b82f6')}`+
        `<td>${kmV(fk)?nn(kmV(fk)):'-'}</td>${chip(pk,'#ec4899')}`+
        `<td>${btV(fk)?nn(btV(fk)):'-'}</td>${chip(pb,'#f59e0b')}`+
        `<td><span style="background:linear-gradient(135deg,rgba(124,58,237,.25),rgba(59,130,246,.25));color:var(--pu2);border-radius:9px;padding:2px 11px;font-size:.68rem;font-weight:900">${total}%</span></td>`+
        `<td>${limitCell}</td><td>${pcqCell}</td></tr>`;
    });
  });
  h+='</tbody>';
  tbl.innerHTML=h;
}
let _limTimer=null,_limChanges=[];
function limSet(fk,field,val){
  if(!canEdit('ko')){alert('Bạn chỉ có quyền XEM.');rKoLimit();return;}
  if(!LIMITS[fk])LIMITS[fk]={};
  const old=LIMITS[fk][field]||'';
  if(old===val)return;
  LIMITS[fk][field]=val;
  _limChanges.push((FK_NAMES[fk]||fk)+' · '+(field==='limit'?'hạn mức':'PCQ')+': '+(old||'—')+' → '+(val||'—'));
  clearTimeout(_limTimer);
  _limTimer=setTimeout(_saveLimits,1200);
}
async function _saveLimits(){
  if(!SB.ready()||!CUR_MONTH)return;
  try{
    await SB.saveReport('limits',CUR_MONTH,LIMITS);
    setCloudStatus('Đã lưu hạn mức duyệt ✓');
    const det=_limChanges.join(' | ');_limChanges=[];
    if(det)logAction('Hạn mức duyệt','Tháng '+dispMonth(CUR_MONTH)+' · '+det.slice(0,600));
    if(koView==='overview')rKoOverview();
  }catch(e){console.error('_saveLimits',e);setCloudStatus('Lỗi lưu hạn mức',true);}
}
// Sao chép hạn mức duyệt từ tháng gần nhất trước đó khi tháng hiện tại CHƯA có (giữ cho tới khi có người chỉnh sửa & lưu)
async function inheritLimitsIfEmpty(mk){
  try{
    if(LIMITS&&Object.keys(LIMITS).length)return; // tháng này đã có hạn mức
    if(!SB.ready())return;
    const reps=await SB.listReports();
    const prevMonth=(reps||[]).filter(r=>r.type==='limits'&&r.month<mk).map(r=>r.month).sort().pop();
    if(!prevMonth)return;
    const old=await SB.loadReport('limits',prevMonth);
    if(!old)return;
    const inh={};
    for(const fk in old){const v=old[fk];if(v&&v.limit)inh[fk]={limit:v.limit};}
    if(Object.keys(inh).length)LIMITS=inh;
  }catch(e){console.error('inheritLimitsIfEmpty',e);}
}
