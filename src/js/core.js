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
// ===== ROSTER (danh sách nhân viên) — CÓ THỂ THÊM/BỚT, lưu cloud RIÊNG TỪNG THÁNG (report type 'roster', month 'YYYY-MM') =====
// Sửa roster tháng nào chỉ ảnh hưởng tháng đó; tháng mới kế thừa roster tháng gần nhất trước đó (xem applyRosterForMonth ở data-boot.js).
// Mỗi member: {key, name, group:'vip'|'onl', col, search, active}
//  - key: mã nội bộ (vd 'fkjade') — DUY NHẤT, không đổi sau khi tạo.
//  - search: chuỗi con để nhận diện FK từ cột note file Excel (mfk()). Mặc định = key.
//  - active:false = đã nghỉ → ẨN khỏi mọi bảng/phân ca/chip HIỆN TẠI, nhưng name vẫn giữ để render lịch sử.
const ROSTER_DEFAULT=[
  {key:"fkjade",name:"JADE",group:"vip",col:"#f97316",search:"fkjade"},
  {key:"fkcarbon",name:"CARBON",group:"vip",col:"#3b82f6",search:"carbon"},
  {key:"fkmember",name:"MEMBER",group:"vip",col:"#a855f7",search:"fkmember"},
  {key:"fkangel",name:"ANGEL",group:"vip",col:"#f0b429",search:"fkangel"},
  {key:"fkgeon",name:"GEON",group:"vip",col:"#10b981",search:"fkgeon"},
  {key:"fkdante",name:"DANTE",group:"vip",col:"#8b5cf6",search:"fkdante"},
  {key:"fkpiu",name:"PIU",group:"vip",col:"#ff6b35",search:"fkpiu"},
  {key:"fkchamy",name:"CHAMY",group:"onl",col:"#60a5fa",search:"chamy"},
  {key:"fkluby",name:"LUBY",group:"onl",col:"#06b6d4",search:"fkluby"},
  {key:"fkaimee",name:"AIMEE",group:"onl",col:"#34d399",search:"aimee"},
  {key:"fkantony",name:"ANTONY",group:"onl",col:"#a78bfa",search:"antony"},
  {key:"fktrucia",name:"TRUCIA",group:"onl",col:"#fb923c",search:"trucia"},
  {key:"fkminty",name:"MINTY",group:"onl",col:"#e879f9",search:"minty"},
  {key:"fkbrenna",name:"BRENNA",group:"onl",col:"#ec4899",search:"brenna"},
  {key:"fkseren",name:"SEREN",group:"onl",col:"#facc15",search:"seren"}
];
let ROSTER=ROSTER_DEFAULT.map(m=>({...m,active:true}));
// Biến SUY RA từ ROSTER (rebuild bởi applyRoster). active-only cho hiển thị/phân công hiện tại;
// FK_NAMES giữ CẢ nhân viên đã nghỉ để render dữ liệu lịch sử không bị "undefined".
let FK_SEARCH={},FK_KEYS=[],FK_NAMES={},FKVIP=[],FKONL=[],FK_COL={};
const NAME2FK={}; // TÊN(hoa) -> key, dùng khi dán phân công/điểm từ Excel
function applyRoster(){
  FK_SEARCH={};FK_NAMES={};FK_COL={};FKVIP=[];FKONL=[];
  const active=ROSTER.filter(m=>m.active!==false);
  FK_KEYS=active.map(m=>m.key);
  ROSTER.forEach(m=>{FK_NAMES[m.key]=m.name;if(m.col)FK_COL[m.key]=m.col;});
  active.forEach(m=>{FK_SEARCH[m.key]=(m.search||m.key).toLowerCase();(m.group==="onl"?FKONL:FKVIP).push(m.key);});
  // màu tùy chỉnh (biểu đồ theo giờ) ghi đè màu roster
  try{const s=JSON.parse(localStorage.getItem('FK_COL_CUSTOM')||'{}');Object.keys(s).forEach(k=>{if(s[k])FK_COL[k]=s[k];});}catch(e){}
  Object.keys(NAME2FK).forEach(k=>delete NAME2FK[k]);
  active.forEach(m=>{NAME2FK[String(m.name).toUpperCase()]=m.key;});
}
applyRoster();
// Đảm bảo 1 dataset (don/km) có đủ fk_data cho MỌI nhân viên đang active + đồng bộ nhóm vip/onl theo ROSTER.
// Gọi sau khi load dataset từ cloud (bootData/loadHistMonth) để nhân viên MỚI hiện ngay & không vỡ render.
function reconcileDataset(ds){
  if(!ds||!ds.fk_data)return ds;
  const z31=()=>Array(31).fill(0),z24=()=>Array(24).fill(0);
  FK_KEYS.forEach(fk=>{
    if(!ds.fk_data[fk])ds.fk_data[fk]={name:FK_NAMES[fk],group:FKVIP.includes(fk)?'vip':'onl',total_score:0,total_count:0,day_scores:z31(),day_counts:z31(),hour_scores_gmt7:z24(),hour_counts_gmt7:z24(),hour_scores_gmt4:z24()};
    else{ds.fk_data[fk].name=FK_NAMES[fk];ds.fk_data[fk].group=FKVIP.includes(fk)?'vip':'onl';}
  });
  ds.fkvip=FKVIP.slice();ds.fkonl=FKONL.slice();
  return ds;
}
// Quyền quản lý roster: ADMIN hoặc Tổ Trưởng
function canManageRoster(){return !!(CUR_PROFILE&&(CUR_PROFILE.is_admin||roleOf(CUR_PROFILE).key==='totruong'));}
const VIP_COL='#06b6d4',ONL_COL='#a78bfa'; /* đồng bộ màu tab Phân Ca: cyan / tím nhạt */
function fkGrpCol(fk){return FKVIP.includes(fk)?VIP_COL:ONL_COL;}

function ha(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;}
function nn(v){return(v||0).toLocaleString("vi-VN");}
// Chống XSS: escape dữ liệu người-dùng-nhập (từ file Excel) trước khi đưa vào innerHTML
function hesc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ===== Ô NHẬP MÃ OTP 6 số rời (dùng chung cho 2FA: đăng nhập / bắt buộc thiết lập / bật trong cài đặt) =====
// HTML chỉ cần <div class="otp-wrap" data-for="<id>" data-submit="Ham.xac.minh"></div>
// OTP tự dựng 6 ô + 1 input ẩn mang đúng <id> để code cũ đọc/ghi .value như thường.
const OTP=(function(){
  const LEN=6;
  function build(wrap){
    if(wrap._otpBuilt)return;
    wrap._otpBuilt=1;
    const forId=wrap.getAttribute('data-for'),submit=wrap.getAttribute('data-submit')||'';
    const hid=document.createElement('input');hid.type='hidden';hid.id=forId;wrap.appendChild(hid);
    const boxes=[];
    for(let i=0;i<LEN;i++){
      const b=document.createElement('input');
      b.type='text';b.className='otp-box';b.inputMode='numeric';b.maxLength=1;b.autocomplete='off';
      b.setAttribute('aria-label','Số thứ '+(i+1));
      wrap.appendChild(b);boxes.push(b);
    }
    const sync=()=>{hid.value=boxes.map(b=>b.value).join('');boxes.forEach(b=>b.classList.toggle('filled',!!b.value));return hid.value;};
    const fire=()=>{const fn=submit.split('.').reduce((o,k)=>o&&o[k],window);if(typeof fn==='function')fn();};
    boxes.forEach((b,i)=>{
      b.addEventListener('focus',()=>b.select());
      b.addEventListener('input',()=>{
        b.value=b.value.replace(/\D/g,'').slice(0,1);
        if(b.value&&i<LEN-1)boxes[i+1].focus();
        if(sync().length===LEN){b.blur();fire();}
      });
      b.addEventListener('keydown',e=>{
        if(e.key==='Backspace'&&!b.value&&i>0){boxes[i-1].value='';boxes[i-1].focus();sync();e.preventDefault();}
        else if(e.key==='ArrowLeft'&&i>0){boxes[i-1].focus();e.preventDefault();}
        else if(e.key==='ArrowRight'&&i<LEN-1){boxes[i+1].focus();e.preventDefault();}
        else if(e.key==='Enter'){sync();fire();}
      });
      b.addEventListener('paste',e=>{
        e.preventDefault();
        const t=(((e.clipboardData||window.clipboardData).getData('text'))||'').replace(/\D/g,'').slice(0,LEN);
        if(!t)return;
        boxes.forEach((bb,j)=>bb.value=t[j]||'');
        boxes[Math.min(t.length,LEN-1)].focus();
        if(sync().length===LEN)fire();
      });
    });
    wrap._boxes=boxes;wrap._hidden=hid;
  }
  return {
    init(){document.querySelectorAll('.otp-wrap').forEach(build);},
    reset(forId){
      const wrap=document.querySelector('.otp-wrap[data-for="'+forId+'"]');
      if(!wrap)return;
      build(wrap);
      wrap._boxes.forEach(b=>{b.value='';b.classList.remove('filled');});
      wrap._hidden.value='';
      setTimeout(()=>wrap._boxes[0].focus(),0);
    }
  };
})();
document.addEventListener('DOMContentLoaded',()=>OTP.init());

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
    // NGỪNG sao lưu file Excel gốc lên Storage (chốt 02/08/2026): dashboard KHÔNG bao giờ
    // đọc lại các file này — chỉ cần "thông tin báo cáo" đã xử lý trong bảng `reports`.
    // Giữ lại file thô chỉ làm bucket `originals` phình vô hạn (~600 MB/tháng, sắp tràn 1 GB Free).
    // Vô hiệu hóa tại điểm nghẽn duy nhất này để chặn mọi chỗ gọi (don/km/bc). Storage đứng yên.
    return{skipped:true};
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