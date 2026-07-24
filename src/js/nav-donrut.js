// ===== NAVIGATION =====
function sw(pg,el){document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));document.querySelectorAll(".pg").forEach(p=>p.classList.remove("active"));el.classList.add("active");document.getElementById("pg-"+pg).classList.add("active");rAll();}
function smv(v,el){mView=v;el.parentElement.querySelectorAll(".vt-btn").forEach(t=>t.classList.remove("active"));el.classList.add("active");rKoDaily();}
function srk(g,el){rkGrp=g;selFK=null;document.getElementById("dp").classList.remove("show");document.getElementById("rkVipBtn").classList.remove("active");document.getElementById("rkOnlBtn").classList.remove("active");el.classList.add("active");rRank();}
function skv(v,el){koView=v;el.parentElement.querySelectorAll(".vt-btn").forEach(t=>t.classList.remove("active"));el.classList.add("active");document.querySelectorAll(".ko-view").forEach(p=>p.style.display="none");document.getElementById("ko-"+v).style.display="block";rKO();}
function sac(c,el){anCat=c;el.parentElement.querySelectorAll(".vt-btn").forEach(t=>t.classList.remove("active"));el.classList.add("active");rKoAnomaly();}
let dataSrc="don";
let donSub='time'; // 'time' = Thời Gian Cao Điểm | 'donrut' = Báo Cáo Đơn Rút
function sds(src,el){dataSrc=src;el.parentElement.querySelectorAll(".vt-btn").forEach(t=>t.classList.remove("active"));el.classList.add("active");selDay=null;
  // Tab con "Báo Cáo Đơn Rút" chỉ có ở nguồn Duyệt Đơn
  document.getElementById('donSubToggle').style.display=(src==='don')?'flex':'none';
  if(src!=='don')donSub='time';
  rDataTab();
}
function setDonSub(v,el){donSub=v;el.parentElement.querySelectorAll(".vt-btn").forEach(t=>t.classList.remove("active"));el.classList.add("active");rDataTab();}
function curDataSet(){return dataSrc==="km"?KMD:D;}
function rDataTab(){
  const ds=curDataSet();
  const empty=document.getElementById("dataEmptyKm"),body=document.getElementById("dataBody");
  if(dataSrc==="km"&&!ds){empty.style.display="block";body.style.display="none";return;}
  empty.style.display="none";body.style.display="block";
  const showDonrut=(dataSrc==='don'&&donSub==='donrut');
  document.getElementById('data-day').style.display=showDonrut?'none':'block';
  document.getElementById('data-kmstat').style.display=(dataSrc==='km')?'block':'none';
  document.getElementById('data-donrut').style.display=showDonrut?'block':'none';
  if(showDonrut){rDonRut();return;}
  // Ngày / Tháng — render trong 1 view
  const days=ds.days_in_month_d7||ds.days_in_month||[];
  if(!selDay&&days.length)selDay=days[0];
  bldDayBtns(ds);
  rDay(ds);
  rMonth(ds);
  rKmStat(ds);
}
// ===== BÁO CÁO ĐƠN RÚT — module độc lập, session-only (port đầy đủ từ PROMAX) =====
// Dữ liệu chỉ nằm trong RAM (DR.raw/DR.data). Không lưu cloud/localStorage — F5 là mất.
const DR={
  raw:null, label:'', data:null,
  brackets:DR_DEFAULT_BR.map(p=>[...p]),
  sortBy:'total',
  labels(){return DR.brackets.map(([lo,hi])=>brLabelOf(lo,hi));},
  bracket(v){
    let x=typeof v==='number'?v:parseFloat(String(v==null?'':v).replace(/[\s,]/g,''));
    if(isNaN(x))return 'Không rõ';
    for(const [lo,hi] of DR.brackets){if(x>=lo&&x<=hi)return brLabelOf(lo,hi);}
    return x>DR.brackets[DR.brackets.length-1][1]?'> mốc cao nhất':'Ngoài khoảng';
  },
  // Đọc 1 ô ngày-giờ giống pipeline chính (Date / serial Excel / chuỗi) — dùng giờ LOCAL để đồng nhất các tab khác
  parseCell(v){
    if(v instanceof Date)return isNaN(v.getTime())?null:v;
    if(typeof v==='number'&&v>40000)return new Date((v-25569)*86400000);
    if(v){try{const d=new Date(String(v).replace(/(\d{4})\/(\d{2})\/(\d{2})/,'$1-$2-$3').replace(' ','T'));return isNaN(d.getTime())?null:d;}catch(e){}}
    return null;
  },
  build(rows,label){
    const body=rows.filter(r=>{
      if(!r||r.length<2||r[0]==null||String(r[0]).trim()==='')return false;
      const joined=r.filter(x=>x!=null).join(' ');
      if(/số thứ tự|hội viên|ghi chú/i.test(joined)&&!/^\d+$/.test(String(r[0]).trim()))return false;
      return true;
    });
    const mk=()=>({total:0,first:0,levels:{},brackets:{},orders:[]});
    const fks={};FK_KEYS.forEach(fk=>fks[fk]=mk());
    const gbr={};let totalRows=body.length,totalNoted=0,totalFirst=0;
    for(const r of body){
      const isFirst=r[1]!=null&&String(r[1]).trim()!=='';
      if(isFirst)totalFirst++;
      const fk=mfk(String(r[20]||''));
      if(!fk)continue;
      const capdo=String(r[5]||'');
      let amt=typeof r[15]==='number'?r[15]:parseFloat(String(r[15]==null?'':r[15]).replace(/[\s,]/g,''));if(isNaN(amt))amt=null;
      // Quy định: đơn tài khoản có tích xanh ✅ (cột F) mà < 7000 -> bỏ hẳn
      if(capdo.includes('✅')&&amt!=null&&amt<7000)continue;
      totalNoted++;
      const level=capdo.trim()||'(không rõ)';
      const br=DR.bracket(amt);
      (gbr[br]=gbr[br]||{total:0,first:0}).total++;if(isFirst)gbr[br].first++;
      const b=fks[fk];
      b.total++;if(isFirst)b.first++;
      (b.levels[level]=b.levels[level]||{total:0,first:0}).total++;if(isFirst)b.levels[level].first++;
      (b.brackets[br]=b.brackets[br]||{total:0,first:0}).total++;if(isFirst)b.brackets[br].first++;
      // Cột T (r[19]) = giờ xử lý xong (GMT−4) · cột J (r[9]) = giờ gửi đơn (GMT−4)
      const en=DR.parseCell(r[19]),stt=DR.parseCell(r[9]);
      let t='',t7='',day7='';
      if(en){
        t=String(en.getHours()).padStart(2,'0')+':'+String(en.getMinutes()).padStart(2,'0');
        const en7=new Date(en.getTime()+GMT_OFFSET*3600000);
        t7=String(en7.getHours()).padStart(2,'0')+':'+String(en7.getMinutes()).padStart(2,'0');
        day7=en7.getDate();
      }
      let dur=null;
      if(stt&&en){const dd=(en.getTime()-stt.getTime())/1000;if(dd>=0&&dd<=7*86400)dur=Math.round(dd);}
      const sttNo=r[0]==null?'':String(r[0]).trim();
      b.orders.push({fk,stt:sttNo,m:r[3]==null?'?':String(r[3]).trim(),lv:level,a:amt,f:isFirst,t,t7,day7,d:dur,b:br});
    }
    return {label,totalRows,totalNoted,totalFirst,gbr,fks};
  },
  getOrders(fk,br){
    if(!DR.data)return[];
    if(fk)return DR.data.fks[fk].orders.filter(o=>o.b===br).sort((a,b)=>(b.a||0)-(a.a||0));
    let all=[];for(const key of FK_KEYS)for(const o of DR.data.fks[key].orders)if(o.b===br)all.push(o);
    all.sort((a,b)=>(b.a||0)-(a.a||0));return all;
  },
  brRows(brs,fk){
    const labs=DR.labels();Object.keys(brs||{}).forEach(l=>{if(!labs.includes(l))labs.push(l);});
    const std=DR.labels();
    const max=Math.max(...labs.map(l=>(brs&&brs[l]?brs[l].total:0)),1);
    return labs.map(l=>{
      const v=(brs&&brs[l])||{total:0,first:0};
      if(v.total===0&&!std.includes(l))return '';
      const w=(v.total/max*100).toFixed(1);
      const hi=l===std[std.length-1];
      const has=v.total>0;
      const col=hi?'var(--go)':'var(--pu2)';
      return `<div class="dr-br ${has?'':'noord'}" data-fk="${fk||''}" data-br="${hesc(l)}" ${has?'onclick="drToggleBr(this)"':''}>
        <span style="font-family:monospace;color:${hi?'var(--go)':'var(--tx)'};font-weight:${hi?'800':'400'}">${hesc(l)}</span>
        <span style="height:12px;background:var(--card2);border-radius:6px;overflow:hidden"><i style="display:block;height:100%;width:${w}%;background:linear-gradient(90deg,${col},var(--bl2))"></i></span>
        <span style="font-family:monospace;color:var(--go);text-align:right;font-weight:700">${v.total}</span>
        <span style="font-family:monospace;color:var(--cy);text-align:right;font-size:.62rem">${v.first?v.first+' lần đầu':'—'}</span>
      </div><div class="dr-orders"></div>`;
    }).join('');
  },
  ordersHTML(list,showFk){
    if(!list.length)return '<div style="padding:8px 12px;color:var(--mu);font-size:.66rem">Không có đơn</div>';
    const gc='24px 1.4fr 84px 1fr 82px 46px 52px 40px 52px';
    const head=`<div style="display:grid;grid-template-columns:${gc};gap:7px;padding:5px 12px;font-size:.54rem;color:var(--mu);text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;background:var(--card2)"><span>#</span><span>Hội viên${showFk?' · FK':''}</span><span>Số thứ tự</span><span>Cấp độ</span><span style="text-align:right">Số tiền</span><span style="text-align:right">GMT−4</span><span style="text-align:right">GMT+7</span><span style="text-align:right">Ngày</span><span style="text-align:right">Xử lý</span></div>`;
    return head+list.map((o,i)=>`<div style="display:grid;grid-template-columns:${gc};gap:7px;padding:4px 12px;font-size:.63rem;border-top:1px solid rgba(30,37,69,.5)">
      <span style="color:var(--mu);font-family:monospace">${i+1}</span>
      <span style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.m)}">${hesc(o.m)}${showFk?`<span style="color:var(--pu2)"> · ${hesc(FK_NAMES[o.fk]||o.fk)}</span>`:''}${o.f?'<span style="color:var(--cy);font-size:.9em"> · lần đầu</span>':''}</span>
      <span style="font-family:monospace;color:var(--cy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.stt)}">${hesc(o.stt||'—')}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu2)" title="${hesc(o.lv)}">${hesc(o.lv)}</span>
      <span style="font-family:monospace;color:var(--go);text-align:right;font-weight:700">${o.a==null?'?':o.a.toLocaleString('vi')}</span>
      <span style="font-family:monospace;color:var(--mu);text-align:right">${o.t||''}</span>
      <span style="font-family:monospace;color:var(--pu2);text-align:right">${o.t7||''}</span>
      <span style="font-family:monospace;color:var(--mu2);text-align:right">${o.day7||''}</span>
      <span style="font-family:monospace;color:${o.d==null?'var(--mu)':o.d>=3600?'var(--re)':o.d>=1800?'var(--go)':'var(--cy)'};text-align:right">${fmtDurSec(o.d)}</span>
    </div>`).join('');
  },
  render(){
    const body=document.getElementById('donrutBody');
    if(!DR.data){body.style.display='none';return;}
    body.style.display='block';
    const d=DR.data;
    const totalT=Object.values(d.gbr).reduce((a,b)=>a+b.total,0);
    const totalF=Object.values(d.gbr).reduce((a,b)=>a+b.first,0);
    const std=DR.labels(),hiLabel=std[std.length-1];
    const hiCount=(d.gbr[hiLabel]||{total:0}).total+(d.gbr['> mốc cao nhất']||{total:0}).total;
    const activeFks=FK_KEYS.filter(fk=>d.fks[fk].total>0).length;
    const over=DR.overLimitOrders();
    document.getElementById('donrutCards').innerHTML=
      `<div class='stat-card pu'><div class='stat-lbl'>Đơn rút FK duyệt</div><div class='stat-val pu'>${nn(totalT)}</div><div class='stat-sub'>tổng ${nn(d.totalRows)} dòng · ${nn(d.totalNoted)} có note FK</div></div>`+
      `<div class='stat-card cy'><div class='stat-lbl'>Đơn rút lần đầu</div><div class='stat-val' style='color:var(--cy)'>${nn(totalF)}</div><div class='stat-sub'>${totalT?Math.round(totalF/totalT*100):0}% tổng đơn FK</div></div>`+
      `<div class='stat-card go'><div class='stat-lbl'>${hesc(hiLabel)}</div><div class='stat-val go'>${nn(hiCount)}</div><div class='stat-sub'>mốc cao nhất</div></div>`+
      `<div class='stat-card bl'><div class='stat-lbl'>FK có duyệt</div><div class='stat-val bl'>${activeFks}/${FK_KEYS.length}</div><div class='stat-sub'>FK có đơn / tổng FK</div></div>`+
      `<div class='stat-card' style='border-color:${over.length?'rgba(239,68,68,.4)':'var(--border)'}'><div class='stat-lbl'>Vượt hạn mức duyệt</div><div class='stat-val' style='color:${over.length?'#f87171':'var(--gr)'}'>${nn(over.length)}</div><div class='stat-sub'>${over.length?'xem cảnh báo bên dưới ▾':'không có đơn vượt'}</div></div>`;
    DR.renderOverLimit(over);
    document.getElementById('donrutGlobal').innerHTML=DR.brRows(d.gbr,'');
    // Theo từng FK
    const q=(document.getElementById('donrutSearch').value||'').trim().toLowerCase();
    let fks=FK_KEYS.map(fk=>({fk,name:FK_NAMES[fk]||fk,...d.fks[fk]}));
    fks.sort((a,b)=>DR.sortBy==='name'?a.name.localeCompare(b.name):(b[DR.sortBy]-a[DR.sortBy])||a.name.localeCompare(b.name));
    document.getElementById('donrutFks').innerHTML=fks.map(f=>{
      const matchName=f.name.toLowerCase().includes(q);
      const matchLevel=q&&Object.keys(f.levels).some(k=>k.toLowerCase().includes(q));
      if(q&&!matchName&&!matchLevel)return '';
      const zero=f.total===0;
      return `<div class="dr-card ${zero?'zero':''}">
        <div class="dr-head" ${zero?'':`onclick="drOpenFk('${f.fk}')"`}>
          <b style="font-family:monospace;font-size:.92rem;letter-spacing:1px;color:${fkGrpCol(f.fk)}">${f.name}</b>
          <span style="margin-left:auto;text-align:right"><b style="font-family:monospace;color:var(--go);font-size:1.05rem">${f.total}</b><div style="font-size:.56rem;color:var(--cy)">${f.first} lần đầu</div></span>
          ${zero?'':'<span style="color:var(--pu2);font-size:.6rem;font-weight:700">Chi tiết ▸</span>'}
        </div>
      </div>`;
    }).join('')||'<div style="color:var(--mu);font-size:.7rem;padding:10px">Không có FK khớp tìm kiếm.</div>';
    DR.renderTg();
  },
  // Đơn vượt hạn mức duyệt: amount > hạn mức của FK (LIMITS ở tab Hiệu Suất KO)
  overLimitOrders(){
    if(!DR.data)return[];
    const out=[];
    for(const fk of FK_KEYS){const lim=fkLimitNum(fk);if(lim<=0)continue;for(const o of DR.data.fks[fk].orders)if(o.a!=null&&o.a>lim)out.push({...o,lim});}
    out.sort((a,b)=>(b.a||0)-(a.a||0));
    return out;
  },
  renderOverLimit(over){
    over=over||DR.overLimitOrders();
    const el=document.getElementById('donrutOverLimit');if(!el)return;
    if(!over.length){el.innerHTML='';return;}
    const gc='24px 1.4fr 1fr 90px 90px 52px 40px';
    // Nhóm theo FK
    const byFk={};over.forEach(o=>{(byFk[o.fk]=byFk[o.fk]||[]).push(o);});
    const blocks=Object.keys(byFk).sort((a,b)=>byFk[b].length-byFk[a].length).map(fk=>{
      const list=byFk[fk],lim=fkLimitNum(fk);
      const rows=list.map((o,i)=>`<div style="display:grid;grid-template-columns:${gc};gap:7px;padding:4px 12px;font-size:.64rem;border-top:1px solid rgba(239,68,68,.18)">
        <span style="color:var(--mu);font-family:monospace">${i+1}</span>
        <span style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.m)}">${hesc(o.m)}${o.f?'<span style="color:var(--cy);font-size:.9em"> · lần đầu</span>':''}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu2)" title="${hesc(o.lv)}">${hesc(o.lv)}</span>
        <span style="font-family:monospace;color:#f87171;text-align:right;font-weight:800">${(o.a||0).toLocaleString('vi')}</span>
        <span style="font-family:monospace;color:var(--mu);text-align:right">HM ${(o.lim||0).toLocaleString('vi')}</span>
        <span style="font-family:monospace;color:var(--pu2);text-align:right">${o.t7||''}</span>
        <span style="font-family:monospace;color:var(--mu2);text-align:right">${o.day7||''}</span>
      </div>`).join('');
      return `<div style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:2px 4px 4px">
          <b style="font-family:monospace;font-size:.9rem;letter-spacing:1px;color:${fkGrpCol(fk)}">${FK_NAMES[fk]||fk}</b>
          <span style="font-size:.62rem;color:var(--mu2)">Hạn mức: <b style="color:var(--go)">${lim.toLocaleString('vi')}</b></span>
          <span style="margin-left:auto;background:rgba(239,68,68,.15);color:#f87171;border-radius:10px;padding:2px 11px;font-size:.62rem;font-weight:800">${list.length} đơn vượt</span>
        </div>
        <div style="display:grid;grid-template-columns:${gc};gap:7px;padding:4px 12px;font-size:.52rem;color:var(--mu);text-transform:uppercase;letter-spacing:.03em;background:var(--card2);border-radius:6px 6px 0 0"><span>#</span><span>Hội viên (ID)</span><span>Cấp độ</span><span style="text-align:right">Số tiền duyệt</span><span style="text-align:right">Hạn mức</span><span style="text-align:right">GMT+7</span><span style="text-align:right">Ngày</span></div>
        ${rows}
      </div>`;
    }).join('');
    el.innerHTML=`<div class="chart-card" style="border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.04)">
      <div class="chart-title" style="color:#f87171;display:flex;align-items:center;gap:8px">⚠ Cảnh báo vượt hạn mức duyệt <span style="color:var(--mu);text-transform:none;letter-spacing:0;font-weight:400">— đơn có số tiền LỚN HƠN hạn mức của FK (đặt ở Hiệu Suất KO → Đề Xuất Hạn Mức Duyệt): hội viên + số tiền + FK duyệt</span></div>
      ${blocks}
    </div>`;
  },
  // ===== XIN Ý KIẾN TT: parse text Telegram + đối chiếu đơn >150k =====
  tgMsgs:null, // [{fk,id,dt:{day,min},amt,raw}]
  tgStts:null, // Set các mã "Số thứ tự" (cột A) tìm thấy trong text dán
  // Quét mọi mã số ≥5 chữ số trong text (mã Số thứ tự file đơn rút dài ~8 số → không trùng giờ/tiền)
  parseSttSet(text){
    const set=new Set();
    const m=String(text||'').match(/\d{5,}/g);
    if(m)m.forEach(x=>set.add(x.replace(/^0+/,'')||x));
    return set;
  },
  // Nhận diện số tiền linh động: 150tr / 150 triệu / 150k / 150.000 / 1500000 → quy về đơn vị file (nghìn)
  parseMoney(s){
    const m=String(s||'').match(/([\d][\d.,\s]*)\s*(tr|triệu|trieu|k|nghìn|nghin)?/i);
    if(!m)return null;
    const num=parseFloat(m[1].replace(/[.,\s]/g,''));if(isNaN(num))return null;
    const u=(m[2]||'').toLowerCase();
    if(u==='tr'||u==='triệu'||u==='trieu')return num*1000;
    if(u==='k'||u==='nghìn'||u==='nghin')return num;
    return num>=1000000?num/1000:num; // số trần: ≥1 triệu coi là VND, còn lại coi là nghìn
  },
  parseTg(text){
    const out=[];
    // Tách tin nhắn: mỗi tin bắt đầu bằng [M/D/YYYY H:MM AM/PM]
    const re=/\[(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\]\s*([^\n]*)/gi;
    const marks=[];let mm;
    while((mm=re.exec(text))!==null)marks.push({idx:mm.index,len:mm[0].length,mo:+mm[1],day:+mm[2],y:+mm[3],h:+mm[4],mi:+mm[5],ap:(mm[6]||'').toUpperCase(),head:mm[7]});
    for(let i=0;i<marks.length;i++){
      const k=marks[i];
      const bodyEnd=i+1<marks.length?marks[i+1].idx:text.length;
      const body=(k.head+'\n'+text.slice(k.idx+k.len,bodyEnd)).trim();
      // Chỉ nhận tin KO gửi: "KO <TÊN> NE: <nội dung>"
      const colon=body.indexOf(':');if(colon<0)continue;
      const sender=body.slice(0,colon),content=body.slice(colon+1).trim();
      const sm=sender.match(/KO\s+([A-ZÀ-Ỹ0-9]+)\s*NE/i);if(!sm)continue;
      const fkName=sm[1].toUpperCase();
      const fk=FK_KEYS.find(x=>(FK_NAMES[x]||'').toUpperCase()===fkName);if(!fk)continue;
      // ID hội viên = token đầu tiên của nội dung
      const idm=content.match(/[A-Za-z0-9_]+/);if(!idm)continue;
      let h=k.h;if(k.ap==='PM'&&h<12)h+=12;if(k.ap==='AM'&&h===12)h=0;
      const am=content.match(/r[úu]t\s*[:\-]?\s*([\d][\d.,\s]*\s*(?:tr|triệu|trieu|k|nghìn|nghin)?)/i);
      out.push({fk,id:idm[0],day:k.day,min:h*60+k.mi,amt:am?DR.parseMoney(am[1]):null,raw:content.split('\n')[0].slice(0,80)});
    }
    return out;
  },
  // Đối chiếu đơn LỚN >150k với mã Số thứ tự trong text: đơn nào STT không có trong text = CHƯA xin ý kiến TT
  sttKey(v){const s=String(v==null?'':v);return s.replace(/^0+/,'')||s;},
  tgCheck(){
    if(!DR.data)return null;
    const TH=150000;
    const big=[];
    for(const fk of FK_KEYS)for(const o of DR.data.fks[fk].orders)if(o.a!=null&&o.a>=TH)big.push(o);
    const res=big.map(o=>({o,sttHit:!!(DR.tgStts&&o.stt&&DR.tgStts.has(DR.sttKey(o.stt)))}));
    // Chưa xin ý kiến lên đầu, rồi số tiền giảm dần
    res.sort((a,b)=>(a.sttHit-b.sttHit)||((b.o.a||0)-(a.o.a||0)));
    return res;
  },
  renderTg(){
    const panel=document.getElementById('donrutTgPanel'),sum=document.getElementById('drTgSum');
    if(!panel)return;
    if(!DR.data||!DR.tgStts){panel.innerHTML='';if(sum)sum.textContent='';return;}
    const res=DR.tgCheck();
    if(!res){panel.innerHTML='';if(sum)sum.textContent='';return;}
    const miss=res.filter(r=>!r.sttHit),okN=res.length-miss.length;
    if(sum)sum.textContent=`${res.length} đơn >150k · ${okN} đã xin ý kiến · ${miss.length} CHƯA xin ý kiến`;
    if(!res.length){panel.innerHTML='<div class="chart-card" style="font-size:.66rem;color:var(--mu)">Không có đơn nào >150.000 trong file để đối chiếu.</div>';return;}
    const gc='24px 104px 96px 1.2fr 92px 78px 52px 1fr';
    const rows=res.map((r,i)=>{const o=r.o,ok=r.sttHit;
      return `<div style="display:grid;grid-template-columns:${gc};gap:7px;padding:5px 12px;font-size:.64rem;border-top:1px solid rgba(30,37,69,.5);background:${ok?'transparent':'rgba(239,68,68,.08)'}">
        <span style="color:var(--mu);font-family:monospace">${i+1}</span>
        <span style="font-family:monospace;color:${ok?'#10b981':'#f87171'};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.stt)}">${hesc(o.stt||'—')}</span>
        <span style="font-family:monospace;color:${fkGrpCol(o.fk)};font-weight:700">${FK_NAMES[o.fk]||o.fk}</span>
        <span style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.m)}">${hesc(o.m)}</span>
        <span style="font-family:monospace;color:var(--go);text-align:right;font-weight:700">${o.a==null?'—':o.a.toLocaleString('vi')}</span>
        <span style="font-family:monospace;color:var(--pu2);text-align:right">${o.t7||''}</span>
        <span style="font-family:monospace;color:var(--mu2);text-align:right">${o.day7||''}</span>
        <span style="font-size:.6rem;${ok?'color:#10b981':'color:#f87171;font-weight:800'}">${ok?'✔ đã xin ý kiến':'⚠ CHƯA XIN Ý KIẾN'}</span>
      </div>`;}).join('');
    panel.innerHTML=`<div class="chart-card" style="border:1px solid ${miss.length?'rgba(239,68,68,.4)':'rgba(16,185,129,.35)'}">
      <div class="chart-title" style="color:${miss.length?'#f87171':'#10b981'}">Đối chiếu xin ý kiến TT — đơn >150.000 <span style="color:var(--mu);text-transform:none;letter-spacing:0;font-weight:400">— khớp Số thứ tự đơn với mã trong text tin nhắn. ${miss.length?'⚠ '+miss.length+' đơn CHƯA xin ý kiến (đỏ, xếp trên cùng)':'tất cả đã xin ý kiến ✓'}</span></div>
      <div style="display:grid;grid-template-columns:${gc};gap:7px;padding:4px 12px;font-size:.52rem;color:var(--mu);text-transform:uppercase;letter-spacing:.03em;background:var(--card2);border-radius:6px 6px 0 0"><span>#</span><span>Số thứ tự</span><span>FK duyệt</span><span>Hội viên (ID)</span><span style="text-align:right">Số tiền</span><span style="text-align:right">GMT+7</span><span style="text-align:right">Ngày</span><span>Trạng thái</span></div>
      ${rows}
    </div>`;
  },
  fkModalHTML(fk){
    const f=DR.data&&DR.data.fks[fk];if(!f)return '';
    const lvs=Object.entries(f.levels).sort((a,b)=>b[1].total-a[1].total);
    const orders=f.orders.slice().sort((a,b)=>(b.a||0)-(a.a||0));
    const gc='24px 1.4fr 84px 1fr 82px 46px 52px 40px 52px 40px';
    const oh=orders.length?(
      `<div style="display:grid;grid-template-columns:${gc};gap:7px;padding:5px 10px;font-size:.54rem;color:var(--mu);text-transform:uppercase;letter-spacing:.03em;position:sticky;top:0;background:var(--card2)"><span>#</span><span>ID đăng nhập</span><span>Số thứ tự</span><span>Cấp độ TV</span><span style="text-align:right">Số tiền</span><span style="text-align:right">GMT−4</span><span style="text-align:right">GMT+7</span><span style="text-align:right">Ngày</span><span style="text-align:right">Xử lý</span><span style="text-align:right">Loại</span></div>`+
      orders.map((o,i)=>`<div style="display:grid;grid-template-columns:${gc};gap:7px;padding:4px 10px;font-size:.63rem;border-top:1px solid rgba(30,37,69,.5)">
        <span style="color:var(--mu);font-family:monospace">${i+1}</span>
        <span style="font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.m)}">${hesc(o.m)}</span>
        <span style="font-family:monospace;color:var(--cy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${hesc(o.stt)}">${hesc(o.stt||'—')}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu2)" title="${hesc(o.lv)}">${hesc(o.lv)}</span>
        <span style="font-family:monospace;color:var(--go);text-align:right;font-weight:700">${o.a==null?'?':o.a.toLocaleString('vi')}</span>
        <span style="font-family:monospace;color:var(--mu);text-align:right">${o.t||''}</span>
        <span style="font-family:monospace;color:var(--pu2);text-align:right">${o.t7||''}</span>
        <span style="font-family:monospace;color:var(--mu2);text-align:right">${o.day7||''}</span>
        <span style="font-family:monospace;color:${o.d==null?'var(--mu)':o.d>=3600?'var(--re)':o.d>=1800?'var(--go)':'var(--cy)'};text-align:right">${fmtDurSec(o.d)}</span>
        <span style="text-align:right;font-family:monospace;font-size:.9em;color:${o.f?'var(--cy)':'var(--mu)'}">${o.f?'đầu':'—'}</span>
      </div>`).join('')
    ):'<div style="padding:10px;color:var(--mu);font-size:.66rem">Không có đơn.</div>';
    return `<div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--pu2);margin:2px 0 4px">Mốc tiền (bấm để xem đơn từng mốc)</div>`+
      `<div>${DR.brRows(f.brackets,fk)}</div>`+
      `<div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mu);margin:14px 0 4px">Cấp độ thành viên</div>`+
      `<div class="dr-lv" style="max-height:none;border-top:none">${lvs.map(([k,v])=>`<div class="dr-lvr"><span style="flex:1;color:var(--tx)">${hesc(k)}</span><span style="font-family:monospace;color:var(--go);min-width:34px;text-align:right">${v.total}</span><span style="font-family:monospace;color:${v.first?'var(--cy)':'var(--mu)'};min-width:64px;text-align:right;font-size:.9em">${v.first?v.first+' lần đầu':'—'}</span></div>`).join('')}</div>`+
      `<div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--go);margin:14px 0 4px">Tất cả đơn (${orders.length}) — kèm ID đăng nhập & cấp độ</div>`+
      `<div style="border:1px solid var(--border);border-radius:8px;overflow:auto;max-height:44vh">${oh}</div>`;
  },
  setStatus(msg,ok){const el=document.getElementById('drStatus');if(!el)return;el.textContent=msg;el.style.color=ok?'var(--cy)':'var(--re)';},
  apply(rows,label){
    try{
      const sum=DR.build(rows,label);
      if(sum.totalRows===0){DR.setStatus('Không tìm thấy dòng dữ liệu nào — kiểm tra lại file/dữ liệu dán.',false);return;}
      DR.raw=rows;DR.label=label;DR.data=sum;
      DR.render();
      DR.setStatus(`✔ ${nn(sum.totalRows)} dòng · ${nn(sum.totalNoted)} đơn có note FK · ${nn(sum.totalFirst)} đơn rút lần đầu.`,true);
    }catch(err){DR.setStatus('Lỗi xử lý dữ liệu: '+err.message,false);}
  },
  loadFile(file){
    if(!file)return;
    DR.setStatus('Đang đọc '+file.name+'…',true);
    const reader=new FileReader();
    reader.onload=e=>{try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
      DR.apply(rows,file.name);
    }catch(err){DR.setStatus('Không đọc được file: '+err.message,false);}};
    reader.onerror=()=>DR.setStatus('Không đọc được file.',false);
    reader.readAsArrayBuffer(file);
  }
};
function rDonRut(){DR.render();}
// ---- Đối chiếu xin ý kiến TT từ text Telegram ----
function drTgCheck(){
  const text=(document.getElementById('drTgText').value||'').trim();
  const sum=document.getElementById('drTgSum');
  if(!DR.data){if(sum)sum.textContent='Chưa có dữ liệu — thả file Excel trước.';return;}
  if(!text){DR.tgStts=null;if(sum)sum.textContent='Chưa dán text.';document.getElementById('donrutTgPanel').innerHTML='';return;}
  const stts=DR.parseSttSet(text);DR.tgStts=stts.size?stts:null;
  if(!DR.tgStts){if(sum)sum.textContent='Không tìm thấy mã Số thứ tự (số) nào trong text.';document.getElementById('donrutTgPanel').innerHTML='';return;}
  DR.renderTg();
}
// ---- Popup toàn bộ thông tin 1 FK ----
function drOpenFk(fk){
  if(!DR.data||!DR.data.fks[fk]||!DR.data.fks[fk].total)return;
  const f=DR.data.fks[fk];
  document.getElementById('drFkTitle').innerHTML=`<b style="font-family:monospace;letter-spacing:1px;color:${fkGrpCol(fk)}">${FK_NAMES[fk]||fk}</b> <span style="color:var(--mu);font-size:.7rem;font-weight:400">· ${f.total} đơn · ${f.first} lần đầu</span>`;
  document.getElementById('drFkBody').innerHTML=DR.fkModalHTML(fk);
  document.getElementById('drFkModal').classList.add('show');
}
function drCloseFk(){document.getElementById('drFkModal').classList.remove('show');}
function drToggleBr(el){
  const box=el.nextElementSibling;if(!box||!box.classList.contains('dr-orders'))return;
  if(box.classList.contains('show')){box.classList.remove('show');return;}
  if(!box.dataset.loaded){const fk=el.dataset.fk||null;box.innerHTML=DR.ordersHTML(DR.getOrders(fk,el.dataset.br),!fk);box.dataset.loaded='1';}
  box.classList.add('show');
}
function drSort(s,el){DR.sortBy=s;el.parentElement.querySelectorAll('.dr-sort').forEach(b=>{if(b.dataset.s)b.classList.remove('active');});el.classList.add('active');DR.render();}
// ---- Sửa mốc tiền ----
function drOpenBrModal(){document.getElementById('drBrText').value=DR.brackets.map(([lo,hi])=>lo.toLocaleString('vi')+' - '+hi.toLocaleString('vi')).join('\n');document.getElementById('drBrErr').textContent='';document.getElementById('drBrModal').classList.add('show');document.getElementById('drBrText').focus();}
function drCloseBrModal(){document.getElementById('drBrModal').classList.remove('show');}
function drApplyBr(){
  try{
    const text=document.getElementById('drBrText').value;
    const pairs=[];
    text.split('\n').map(l=>l.trim()).filter(Boolean).forEach(line=>{
      const m=line.match(/([\d.,\s]+)\s*[-–—]\s*([\d.,\s]+)/);
      if(!m)throw new Error('Không hiểu dòng: "'+line+'" — cần dạng "từ - đến", ví dụ 200 - 5000');
      const lo=parseInt(m[1].replace(/[^\d]/g,''),10),hi=parseInt(m[2].replace(/[^\d]/g,''),10);
      if(isNaN(lo)||isNaN(hi))throw new Error('Số không hợp lệ ở dòng: "'+line+'"');
      if(lo>hi)throw new Error('Mốc "'+line+'": số đầu phải ≤ số sau');
      pairs.push([lo,hi]);
    });
    if(!pairs.length)throw new Error('Chưa có mốc nào — nhập ít nhất 1 dòng.');
    pairs.sort((a,b)=>a[0]-b[0]);
    DR.brackets=pairs;
    if(DR.raw)DR.apply(DR.raw,DR.label); // tính lại toàn bộ theo mốc mới
    document.getElementById('drBrErr').textContent='';
    drCloseBrModal();
  }catch(e){document.getElementById('drBrErr').textContent=e.message;}
}
function drResetBr(){DR.brackets=DR_DEFAULT_BR.map(p=>[...p]);document.getElementById('drBrText').value=DR.brackets.map(([lo,hi])=>lo.toLocaleString('vi')+' - '+hi.toLocaleString('vi')).join('\n');document.getElementById('drBrErr').textContent='';if(DR.raw)DR.apply(DR.raw,DR.label);}
// ---- Wire ô thả file / dán / chọn file (chạy khi parse tới đây, DOM phía trên đã sẵn sàng) ----
(function(){
  const drop=document.getElementById('drDrop'),fileEl=document.getElementById('drFile'),pick=document.getElementById('drPick');
  if(!drop)return;
  pick.addEventListener('click',()=>fileEl.click());
  fileEl.addEventListener('change',()=>{DR.loadFile(fileEl.files[0]);fileEl.value='';});
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.style.borderColor='var(--cy)';}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.style.borderColor='var(--border2)';}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)DR.loadFile(f);});
  document.addEventListener('paste',e=>{
    // Chỉ nhận dán khi đang ở sub-tab Báo Cáo Đơn Rút
    if(!(dataSrc==='don'&&donSub==='donrut'&&document.getElementById('pg-data').classList.contains('active')))return;
    if(e.target&&(e.target.id==='donrutSearch'||e.target.id==='drTgText'))return;
    const items=e.clipboardData&&e.clipboardData.items;
    if(items)for(const it of items)if(it.kind==='file'){const f=it.getAsFile();if(f){e.preventDefault();DR.loadFile(f);return;}}
    const text=e.clipboardData&&e.clipboardData.getData('text');
    if(text&&text.includes('\t')){e.preventDefault();const rows=text.replace(/\r/g,'').split('\n').map(l=>l.split('\t'));DR.apply(rows,'Dữ liệu dán ('+new Date().toLocaleDateString('vi')+')');}
  });
  // Đóng popup Đơn Rút khi bấm nền tối hoặc nhấn Esc
  document.querySelectorAll('.dr-modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show');}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.dr-modal.show').forEach(m=>m.classList.remove('show'));});
})();