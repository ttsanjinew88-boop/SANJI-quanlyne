// ===== EMBEDDED DATA (rỗng — dữ liệu thật tải từ cloud sau khi đăng nhập) =====
const MD = (function(){
  const NM={fkjade:"JADE",fkcarbon:"CARBON",fkmember:"MEMBER",fkangel:"ANGEL",fkgeon:"GEON",fkdante:"DANTE",fkpiu:"PIU",fkchamy:"CHAMY",fkluby:"LUBY",fkaimee:"AIMEE",fkantony:"ANTONY",fktrucia:"TRUCIA",fkminty:"MINTY",fkbrenna:"BRENNA",fkseren:"SEREN"};
  const VIP=["fkjade","fkcarbon","fkmember","fkangel","fkgeon","fkdante","fkpiu"];
  const ONL=["fkchamy","fkluby","fkaimee","fkantony","fktrucia","fkminty","fkbrenna","fkseren"];
  const z31=()=>new Array(31).fill(0),z24=()=>new Array(24).fill(0);
  const lbl=Array.from({length:24},(_,h)=>String(h).padStart(2,"0")+"H");
  const fd={};
  Object.keys(NM).forEach(fk=>{fd[fk]={name:NM[fk],group:VIP.includes(fk)?"vip":"onl",total_score:0,total_count:0,day_scores:z31(),day_counts:z31(),hour_scores_gmt7:z24(),hour_counts_gmt7:z24(),hour_scores_gmt4:z24()};});
  return{month:"",days:Array.from({length:31},(_,i)=>i+1),days_in_month:[],hour_labels_gmt7:lbl,hour_labels_gmt4:lbl,day_scores:z31(),day_counts:z31(),hour_scores_gmt7:z24(),hour_counts_gmt7:z24(),hour_scores_gmt4:z24(),hour_counts_gmt4:z24(),fk_data:fd,fkvip:VIP,fkonl:ONL};
})();
const GMT_OFFSET = 11;
const FK_SEARCH = {fkjade:"fkjade",fkcarbon:"carbon",fkmember:"fkmember",fkangel:"fkangel",fkgeon:"fkgeon",fkdante:"fkdante",fkpiu:"fkpiu",fkchamy:"chamy",fkluby:"fkluby",fkaimee:"aimee",fkantony:"antony",fktrucia:"trucia",fkminty:"minty",fkbrenna:"brenna",fkseren:"seren"};
const FK_KEYS = Object.keys(FK_SEARCH);
const FK_NAMES = {fkjade:"JADE",fkcarbon:"CARBON",fkmember:"MEMBER",fkangel:"ANGEL",fkgeon:"GEON",fkdante:"DANTE",fkpiu:"PIU",fkchamy:"CHAMY",fkluby:"LUBY",fkaimee:"AIMEE",fkantony:"ANTONY",fktrucia:"TRUCIA",fkminty:"MINTY",fkbrenna:"BRENNA",fkseren:"SEREN"};
const FKVIP=["fkjade","fkcarbon","fkmember","fkangel","fkgeon","fkdante","fkpiu"];
const FKONL=["fkchamy","fkluby","fkaimee","fkantony","fktrucia","fkminty","fkbrenna","fkseren"];
const FK_COL={fkangel:"#f0b429",fkpiu:"#ff6b35",fkcarbon:"#3b82f6",fkbrenna:"#ec4899",fkdante:"#8b5cf6",fkgeon:"#10b981",fkluby:"#06b6d4",fkjade:"#f97316",fkmember:"#a855f7",fkchamy:"#60a5fa",fkantony:"#a78bfa",fkaimee:"#34d399",fktrucia:"#fb923c",fkminty:"#e879f9",fkseren:"#facc15"};
// Load persisted custom colors for hourly chart
(function(){const s=JSON.parse(localStorage.getItem('FK_COL_CUSTOM')||'{}');FK_KEYS.forEach(k=>{if(s[k])FK_COL[k]=s[k];});})();
const VIP_COL='#06b6d4',ONL_COL='#a78bfa'; /* đồng bộ màu tab Phân Ca: cyan / tím nhạt */
function fkGrpCol(fk){return FKVIP.includes(fk)?VIP_COL:ONL_COL;}

function ha(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;}
function nn(v){return(v||0).toLocaleString("vi-VN");}
// Chống XSS: escape dữ liệu người-dùng-nhập (từ file Excel) trước khi đưa vào innerHTML
function hesc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ===== NGHI NGỜ: tùy chỉnh cột hiển thị bảng chi tiết khách =====
// Đầy đủ 20 cột — đúng như tab Tổng Hợp (ĐL là tiêu đề thẻ nên không lặp trong bảng khách)
const SUSPECT_COLS=[
  {k:'id',label:'Tên tài khoản',cell:r=>hesc(r.id)},
  {k:'cap_bac',label:'Cấp bậc',cls:'ell',cell:r=>hesc(r.cap_bac)},
  {k:'ho_ten',label:'Họ tên đăng kí',cell:r=>hesc(r.ho_ten)},
  {k:'khach',label:'Khách',cell:r=>r.khach==='Mới'?'<span class="b-moi">Mới</span>':'<span class="b-cu">Cũ</span>'},
  {k:'chi_tieu',label:'Chỉ tiêu',cell:r=>r.chi_tieu==='Đạt'?'<span class="b-dat">Đạt</span>':'<span class="b-chua">Chưa</span>'},
  {k:'tien_nap',label:'Tiền nạp',cell:r=>BC.fmt(r.tien_nap)},
  {k:'lan_nap',label:'Lần nạp',cell:r=>r.lan_nap},
  {k:'tien_rut',label:'Tiền rút',cell:r=>BC.fmt(r.tien_rut)},
  {k:'lan_rut',label:'Lần rút',cell:r=>r.lan_rut},
  {k:'am_duong',label:'Âm/Dương',cell:r=>BC.ad(r.am_duong)},
  {k:'cuoc_hop_le',label:'Cược hợp lệ',cell:r=>BC.fmt(r.cuoc_hop_le)},
  {k:'ngan_hang',label:'Ngân hàng',cell:r=>hesc(r.ngan_hang)},
  {k:'chi_nhanh',label:'Chi nhánh',cell:r=>hesc(r.chi_nhanh)},
  {k:'stk',label:'STK',cell:r=>hesc(r.stk)},
  {k:'ip',label:'IP',style:'font-size:10px',cell:r=>hesc(r.ip)},
  {k:'thiet_bi',label:'Thiết bị',cell:r=>r.thiet_bi==='Điện thoại'?'Điện Thoại':'Máy Tính'},
  {k:'link_dk',label:'LINK đăng ký',cls:'ell',style:'font-size:10px',cell:r=>hesc(r.link_dk)},
  {k:'link_dn',label:'LINK đăng nhập',cls:'ell',style:'font-size:10px',cell:r=>hesc(r.link_dn)},
  {k:'game',label:'Cược sảnh',cell:r=>hesc(r.game||'')}
];
// Dùng key phiên bản mới -> mọi người mặc định hiện đủ 20 cột (cấu hình cũ 12 cột không còn áp)
let SUSPECT_VIS=(function(){try{const s=JSON.parse(localStorage.getItem('bc_suspect_cols_v2'));return s&&s.length?new Set(s):new Set(SUSPECT_COLS.map(c=>c.k));}catch(e){return new Set(SUSPECT_COLS.map(c=>c.k));}})();
function suspectSaveCols(){localStorage.setItem('bc_suspect_cols_v2',JSON.stringify([...SUSPECT_VIS]));}
function toggleSuspectColsPanel(){const el=document.getElementById('bc-suspect-cols');el.style.display=el.style.display==='none'?'flex':'none';if(el.style.display==='flex')renderSuspectColsPanel();}
function renderSuspectColsPanel(){
  document.getElementById('bc-suspect-cols').innerHTML=SUSPECT_COLS.map(c=>`<label style="display:flex;align-items:center;gap:5px;background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:700;color:var(--tx)"><input type="checkbox" ${SUSPECT_VIS.has(c.k)?'checked':''} onchange="toggleSuspectCol('${c.k}')" style="accent-color:var(--bl);cursor:pointer">${c.label}</label>`).join('')
    +`<button onclick="SUSPECT_VIS=new Set(SUSPECT_COLS.map(c=>c.k));suspectSaveCols();renderSuspectColsPanel();BC.renderSuspects()" style="font-size:11px;padding:4px 10px;background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.4);color:var(--bl2);border-radius:6px;cursor:pointer;font-weight:700">Chọn tất cả</button>`;
}
function toggleSuspectCol(k){if(SUSPECT_VIS.has(k))SUSPECT_VIS.delete(k);else SUSPECT_VIS.add(k);if(!SUSPECT_VIS.size)SUSPECT_VIS.add(k);suspectSaveCols();renderSuspectColsPanel();BC.renderSuspects();}
function dch(id){if(CH[id]){CH[id].destroy();delete CH[id];}}
function hrs(f,t){const a=[];if(f<=t){for(let h=f;h<=t;h++)a.push(h);}else{for(let h=f;h<24;h++)a.push(h);for(let h=0;h<=t;h++)a.push(h);}return a;}
function co(s){return{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:s,grid:{color:"rgba(255,255,255,.04)"},ticks:{color:"#64748b",font:{size:9}},border:{color:"#1e2545"}},y:{stacked:s,grid:{color:"rgba(255,255,255,.06)"},ticks:{color:"#64748b",font:{size:9}},border:{color:"#1e2545"}}},plugins:{legend:{display:false},tooltip:{backgroundColor:"#131830",titleColor:"#e2e8f0",bodyColor:"#94a3b8",borderColor:"#252d55",borderWidth:1}}};}
function coL(s){const o=co(s);o.plugins.legend={display:true,labels:{color:"#94a3b8",font:{size:9},boxWidth:9}};return o;}

// ===== SUPABASE CLOUD STORAGE =====
// Điền 2 giá trị dưới đây sau khi tạo project trên supabase.com
// (Settings -> API -> Project URL và anon public key)
const SB_URL="https://dntqyipgpuibkaarhqcc.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudHF5aXBncHVpYmthYXJocWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTE2MzgsImV4cCI6MjA5ODc2NzYzOH0.A4c33V7s-GJo9Sw7sGKmkItS8wiOgQ628di4L5B5fik";
const SB=(function(){
  let cli=null;
  function ready(){
    if(cli)return true;
    if(!SB_URL||!SB_KEY||!window.supabase)return false;
    cli=window.supabase.createClient(SB_URL,SB_KEY);
    return true;
  }
  async function saveReport(type,month,data){
    if(!ready())return{skipped:true};
    const{error}=await cli.from('reports').upsert({type,month,data,updated_at:new Date().toISOString()},{onConflict:'type,month'});
    if(error)throw error;
    return{ok:true};
  }
  async function uploadOriginals(files,type,month){
    if(!ready()||!files||!files.length)return{skipped:true};
    for(const f of files){
      const path=`${type}/${month}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const{error}=await cli.storage.from('originals').upload(path,f,{upsert:false});
      if(error&&!/already exists/i.test(String(error.message||'')))throw error;
    }
    return{ok:true};
  }
  async function listReports(){
    if(!ready())return[];
    const{data,error}=await cli.from('reports').select('type,month,updated_at').order('month',{ascending:false});
    if(error)throw error;
    return data||[];
  }
  async function loadReport(type,month){
    if(!ready())return null;
    const{data,error}=await cli.from('reports').select('data').eq('type',type).eq('month',month).maybeSingle();
    if(error)throw error;
    return data?data.data:null;
  }
  function client(){ready();return cli;}
  return{ready,client,saveReport,uploadOriginals,listReports,loadReport};
})();