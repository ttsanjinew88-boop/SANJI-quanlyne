/* ===== T3 — LỌC FILE NTK (Nhiều Tài Khoản) =====
   Port từ Apps Script 'locNhomNTK' sang trình duyệt. SESSION-ONLY: mọi thứ nằm trong RAM,
   F5 là mất, KHÔNG lưu cloud, KHÔNG đụng tới điểm số / roster / upload chính.
   Gom nhóm theo (Tên thật đã chuẩn hóa + IP) -> nhóm có >=2 TÀI KHOẢN KHÁC NHAU = nghi ngờ NTK.

   Khác bản Apps Script (đã sửa lỗi, xem CLAUDE.md mục "T3 — Lọc File NTK"):
   1. Ngày dd/mm/yyyy parse ĐÚNG (bản cũ để new Date() đọc trước -> hiểu thành mm/dd kiểu Mỹ).
   2. Gom nhóm đếm theo SỐ ID PHÂN BIỆT (bản cũ đếm số DÒNG -> 1 TK nạp nhiều lần thành nhóm giả).
   3. Hàng tiêu đề phải khớp >= MIN_HDR loại cột (bản cũ khai báo minMatches rồi không dùng).
   4. Thiếu cột Cấp độ thành viên -> BÁO LỖI (bản cũ bỏ qua âm thầm -> mọi TK cấm lọt lưới).
   5. Dòng in ra và câu lệnh luôn khớp nhau (bản cũ lọc trùng ở câu lệnh nhưng vẫn in dòng).
*/
const NTK={
  PS:25,                 // số NHÓM mỗi trang (phân trang theo nhóm để không cắt rời 1 nhóm)
  MIN_HDR:2,             // số loại cột tối thiểu để coi 1 hàng là hàng tiêu đề
  CHUNK:5000,            // số dòng xử lý mỗi lô trước khi nhả luồng cho giao diện
  IP_SKIP:'104.',        // tiền tố IP bỏ qua (dải proxy/CDN — không phải IP thật của người chơi)
  rows:[],groups:[],stats:null,page:1,q:'',sortDesc:true,fileName:'',

  /* ---- Tên cột chấp nhận (khớp chính xác trước, sau đó khớp CHỨA để chịu được hậu tố kiểu "(GMT+8)") ---- */
  CAND:{
    id:['id','so tai khoan','số tài khoản','tai khoan','account','tài khoản','ten dang nhap','tên đăng nhập'],
    time:['thoi gian nap tien','thoi gian nap','thoi gian','thời gian nạp tiền','thời gian nạp','time','deposit time','time deposit','created at','joined at','thời gian gửi tiền','thoi gian gui tien','thời gian gửi','thoi gian gui'],
    name:['ten that','ten','tên thật','name','full name','ho ten','ho va ten','họ tên'],
    ip:['ip','dia chi ip','địa chỉ ip','ip address','ip dang nhap','ip đăng nhập','ip dang nhap lan cuoi','ip đăng nhập lần cuối','last login ip','login ip'],
    level:['cap do thanh vien','cấp độ thành viên','level','rank'],
    money:['tien nap','tiền nạp','so tien','money','amount','số tiền','so tien gui','số tiền gửi','tien gui','tiền gửi'],
    // 'ngan hang' bắt được tiêu đề thật "Ngân hàng_1 - Quận" (giá trị là tỉnh/quận) -> cột Chi nhánh
    branch:['chi nhanh','chi nhánh','branch','khu vuc','khu vực','ngan hang','ngân hàng','tinh/thanh','tỉnh/thành']
  },
  /* ---- Cấp độ bị loại. Khớp bằng MÃ trong 【】 (O(1) qua Set) + dự phòng khớp chuỗi ---- */
  BANNED_RAW:['【LD-1】LAM DỤNG NHẸ','【LD-2】LAM DỤNG NẶNG','【CC-1】CẤM CHƠI','【KHTV-1】KO KM -HTRA',
    '【NT-1】NHÓM THỬ','【TLT-1】THẮNG LIÊN TIẾP','【DD-1】ĐỐI ĐẦU','【NTK-1】NHIỀU TK',
    '【KCT-1】KO CHỈ TIÊU','【QS-1】QUAN SÁT','【NHRR】RR-NGANHANG'],
  _bannedCodes:null,_bannedTexts:null,

  _initBanned(){
    if(this._bannedCodes)return;
    this._bannedCodes=new Set();this._bannedTexts=[];
    this.BANNED_RAW.forEach(s=>{
      const m=String(s).match(/^【([^】]+)】/);
      if(m)this._bannedCodes.add(NTK.norm(m[1]));
      this._bannedTexts.push(NTK.norm(s));
    });
  },

  /* ================= HELPER ================= */
  // Chuẩn hóa: bỏ dấu, bỏ ký tự ẩn, gộp khoảng trắng, viết thường
  norm(s){
    if(s===null||s===undefined)return '';
    let t=String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    t=t.replace(/[\u0000-\u001f\u007f-\u009f\u200B-\u200F\uFEFF]/g,'');
    return t.replace(/\s+/g,' ').trim().toLowerCase();
  },
  str(v){return v===null||v===undefined?'':String(v).trim();},

  // Tìm cột: ưu tiên khớp CHÍNH XÁC toàn bộ hàng tiêu đề, sau đó mới khớp CHỨA.
  // (Bản Apps Script chỉ khớp chính xác -> "Thời gian nạp tiền (GMT+8)" là trượt.)
  findCol(hdr,list){
    const cands=list.map(NTK.norm).filter(Boolean);
    for(let i=0;i<hdr.length;i++)if(cands.indexOf(hdr[i])!==-1)return i;
    let best=-1,bestLen=0;
    for(let i=0;i<hdr.length;i++){
      if(!hdr[i])continue;
      for(const c of cands){
        // Biến thể ngắn ('ip','id') chỉ nhận khi tiêu đề BẮT ĐẦU bằng nó + khoảng trắng
        // (vd "IP đăng nhập lần cuối") — chứa ở giữa thì bỏ, tránh ăn nhầm cột khác.
        const hit=c.length>=3?hdr[i].indexOf(c)!==-1:hdr[i].indexOf(c+' ')===0;
        if(hit&&c.length>bestLen){best=i;bestLen=c.length;}
      }
    }
    return best;
  },

  // Tìm hàng tiêu đề: đếm số LOẠI cột khớp, phải đạt MIN_HDR mới nhận (sửa lỗi 3)
  findHeaderRow(values,maxSearch){
    const sets={};for(const k in NTK.CAND)sets[k]=new Set(NTK.CAND[k].map(NTK.norm));
    const N=Math.min(values.length,maxSearch);let best={index:-1,matches:0};
    for(let r=0;r<N;r++){
      const row=values[r]||[],found=new Set();
      for(let c=0;c<row.length;c++){
        const cell=NTK.norm(row[c]);if(!cell)continue;
        for(const k in sets)if(sets[k].has(cell))found.add(k);
      }
      if(found.size>best.matches)best={index:r,matches:found.size};
    }
    return best.matches>=NTK.MIN_HDR?best:{index:-1,matches:best.matches};
  },

  // Đổi sang Date. THỨ TỰ QUAN TRỌNG: dd/mm/yyyy phải thử TRƯỚC new Date() (sửa lỗi 1),
  // vì new Date("08/12/2026") bị JavaScript hiểu là 8 tháng 12 theo kiểu Mỹ.
  toDate(v){
    if(v instanceof Date)return isNaN(v.getTime())?null:v;
    if(typeof v==='number'&&isFinite(v)&&v>0)return new Date(Math.round((v-25569)*86400*1000));
    if(typeof v!=='string')return null;
    const s=v.trim();if(!s)return null;
    let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){
      let yy=+m[3];if(yy<100)yy+=(yy>=70?1900:2000);
      const d=new Date(yy,+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
      if(!isNaN(d.getTime()))return d;
    }
    m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){
      const d=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
      if(!isNaN(d.getTime()))return d;
    }
    const d2=new Date(s);
    return isNaN(d2.getTime())?null:d2;
  },

  // So sánh ID tăng dần: số thuần thì so theo số, còn lại so chuỗi có nhận biết số
  cmpId(a,b){
    const A=String(a).trim(),B=String(b).trim();
    if(/^\d+$/.test(A)&&/^\d+$/.test(B))return A.length!==B.length?A.length-B.length:A.localeCompare(B);
    return A.localeCompare(B,undefined,{numeric:true,sensitivity:'base'});
  },

  fmtDate(d){
    if(!(d instanceof Date)||isNaN(d.getTime()))return '';
    const p=n=>String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
  },

  /* ================= NẠP FILE ================= */
  setStatus(html,err){
    const el=document.getElementById('ntkStatus');
    if(el)el.innerHTML='<span style="color:'+(err?'var(--re)':'var(--mu)')+'">'+html+'</span>';
  },
  // Khi file mới lỗi, kết quả cũ vẫn nằm nguyên trong bảng -> phải nói rõ để không bị hiểu nhầm
  keepNote(){return NTK.groups.length?'<br>Bảng bên dưới vẫn là kết quả của file trước.':'';},
  setProg(pct,txt){
    const w=document.getElementById('ntkProg'),f=document.getElementById('ntkProgFill'),t=document.getElementById('ntkProgTxt');
    if(!w)return;
    if(pct<0){w.style.display='none';return;}
    w.style.display='';f.style.width=Math.max(0,Math.min(100,pct))+'%';t.textContent=txt||'';
  },

  async loadFile(file){
    if(!file)return;
    NTK.fileName=file.name||'';
    NTK.setStatus('Đang đọc file <b>'+hesc(NTK.fileName)+'</b>…');
    NTK.setProg(2,'Đang đọc file…');
    await NTK._tick();
    let aoa=null;
    try{
      const buf=await file.arrayBuffer();
      NTK.setProg(8,'Đang giải nén bảng tính… (file 200k dòng mất khoảng 3-8 giây, màn hình sẽ đứng yên trong lúc này)');
      await NTK._tick();
      // dense:true giảm mạnh bộ nhớ với file lớn; thư viện cũ không hiểu thì tự bỏ qua, vô hại
      const wb=XLSX.read(buf,{type:'array',cellDates:true,dense:true});
      const pref=wb.SheetNames.find(n=>NTK.norm(n)==='du lieu goc')||wb.SheetNames[0];
      const ws=wb.Sheets[pref];
      if(!ws)throw new Error('File không có sheet nào đọc được.');
      NTK.setProg(15,'Đang trải dữ liệu ra bảng…');
      await NTK._tick();
      aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,blankrows:false,defval:''});
      // thả tham chiếu workbook để trình duyệt thu hồi bộ nhớ trước khi xử lý
      delete wb.Sheets;
    }catch(e){
      NTK.setProg(-1);NTK.setStatus('✕ Không đọc được file: '+hesc(String(e.message||e))+NTK.keepNote(),true);return;
    }
    await NTK.process(aoa,NTK.fileName);
  },

  // Nhận dữ liệu dán (Ctrl+V) dạng bảng
  applyPasted(rows){
    NTK.fileName='Dữ liệu dán';
    NTK.process(rows,'Dữ liệu dán');
  },

  _tick(){return new Promise(r=>setTimeout(r,0));},

  /* ================= XỬ LÝ ================= */
  async process(values,srcLabel){
    NTK._initBanned();
    if(!values||!values.length){NTK.setProg(-1);NTK.setStatus('✕ Bảng dữ liệu trống.'+NTK.keepNote(),true);return;}

    const hs=NTK.findHeaderRow(values,10);
    if(hs.index<0){
      NTK.setProg(-1);
      const sample=values.slice(0,Math.min(5,values.length))
        .map((r,i)=>'Dòng '+(i+1)+': '+(r||[]).slice(0,8).map(v=>hesc(NTK.str(v))).join(' | ')).join('<br>');
      NTK.setStatus('✕ Không tìm thấy hàng tiêu đề trong 10 dòng đầu (chỉ khớp được '+hs.matches+
        ' loại cột, cần ít nhất '+NTK.MIN_HDR+').<br><span style="color:var(--mu2)">'+sample+'</span>'+NTK.keepNote(),true);
      return;
    }
    const hdr=(values[hs.index]||[]).map(NTK.norm);
    const iID=NTK.findCol(hdr,NTK.CAND.id),iTime=NTK.findCol(hdr,NTK.CAND.time),
          iName=NTK.findCol(hdr,NTK.CAND.name),iIP=NTK.findCol(hdr,NTK.CAND.ip),
          iLv=NTK.findCol(hdr,NTK.CAND.level),iMoney=NTK.findCol(hdr,NTK.CAND.money),
          iBr=NTK.findCol(hdr,NTK.CAND.branch);

    // Cấp độ là cột QUYẾT ĐỊNH của bộ lọc cấm -> thiếu là dừng, không chạy tiếp âm thầm (sửa lỗi 4)
    const miss=[];
    if(iID<0)miss.push('ID');
    if(iTime<0)miss.push('Thời gian nạp tiền');
    if(iName<0)miss.push('Tên thật');
    if(iIP<0)miss.push('IP');
    if(iLv<0)miss.push('Cấp độ thành viên');
    if(miss.length){
      NTK.setProg(-1);
      NTK.setStatus('✕ Thiếu cột bắt buộc: <b>'+hesc(miss.join(', '))+'</b><br>'+
        '<span style="color:var(--mu2)">Tiêu đề đọc được ở dòng '+(hs.index+1)+': '+
        hesc((values[hs.index]||[]).map(NTK.str).filter(Boolean).join(' | ').slice(0,300))+'</span>'+NTK.keepNote(),true);
      return;
    }

    const st={total:values.length-hs.index-1,noKey:0,ipSkip:0,banned:0,kept:0,dupRow:0,
      noMoney:iMoney<0,noBranch:iBr<0,hdrRow:hs.index+1};
    // Gom trực tiếp vào Map lồng: key nhóm -> Map(id -> bản ghi sớm nhất) — vừa gom vừa khử trùng ID (sửa lỗi 2+5)
    const groups=new Map();

    for(let i=hs.index+1;i<values.length;i++){
      if((i&1023)===0){
        const pct=15+Math.round((i/values.length)*70);
        NTK.setProg(pct,'Đang lọc & gom nhóm… '+nn(i-hs.index-1)+' / '+nn(st.total)+' dòng');
        if((i-hs.index-1)%NTK.CHUNK<1024)await NTK._tick();
      }
      const r=values[i];if(!r)continue;
      const id=NTK.str(r[iID]),name=NTK.str(r[iName]),ip=NTK.str(r[iIP]);
      if(!id||!name||!ip){st.noKey++;continue;}
      if(ip.startsWith(NTK.IP_SKIP)){st.ipSkip++;continue;}
      const lv=NTK.str(r[iLv]),lvN=NTK.norm(lv);
      const code=(lvN.match(/^【([^】]+)】/)||[])[1];
      const isBanned=(code&&NTK._bannedCodes.has(code))||
        NTK._bannedTexts.some(b=>b&&lvN.indexOf(b)!==-1)||
        lvN.startsWith('【ntk')||lvN.startsWith('ntk');
      if(isBanned){st.banned++;continue;}
      st.kept++;

      const rec={id:id,time:NTK.toDate(r[iTime]),name:name,ip:ip,level:lv,
        money:iMoney>=0?NTK.str(r[iMoney]):'',branch:iBr>=0?NTK.str(r[iBr]):'',row:i+1};
      const key=NTK.norm(name)+'||'+ip;
      let g=groups.get(key);if(!g){g=new Map();groups.set(key,g);}
      const old=g.get(id);
      if(!old){g.set(id,rec);}
      else{
        st.dupRow++;
        // giữ lần nạp SỚM NHẤT của cùng một TK (mốc để xác định "tài khoản nạp đầu")
        const a=old.time instanceof Date?old.time.getTime():Infinity;
        const b=rec.time instanceof Date?rec.time.getTime():Infinity;
        if(b<a||(a===Infinity&&b===Infinity&&rec.row<old.row))g.set(id,rec);
      }
    }

    NTK.setProg(88,'Đang dựng câu lệnh…');
    await NTK._tick();

    const out=[];
    groups.forEach(g=>{
      if(g.size<2)return;                       // <2 TÀI KHOẢN KHÁC NHAU thì không phải NTK (sửa lỗi 2)
      const arr=Array.from(g.values());
      arr.sort((a,b)=>{
        const A=a.time instanceof Date?a.time.getTime():null,B=b.time instanceof Date?b.time.getTime():null;
        if(A!==null&&B!==null)return A-B;
        if(A!==null)return -1;
        if(B!==null)return 1;
        return a.row-b.row;
      });
      const first=arr[0],after=arr.slice(1).map(x=>x.id).sort(NTK.cmpId);
      const cmd=first.id+', '+after.join(', ')+' là cùng 1 người → Đưa các TK nạp sau: '+
        after.join(', ')+' vào nhóm nhiều tài khoản → Đã xử lý';
      // key ổn định (tên chuẩn hóa + IP) — dùng để nhớ lựa chọn CHUYỂN TAY qua các lần phân loại lại
      out.push({key:NTK.norm(first.name)+'||'+first.ip,first:first.id,name:first.name,ip:first.ip,cmd:cmd,accs:arr});
    });

    st.groups=out.length;
    st.accsInGroups=out.reduce((s,g)=>s+g.accs.length,0);
    st.distinct=0;groups.forEach(g=>{st.distinct+=g.size;});

    NTK.groups=out;NTK.stats=st;NTK.page=1;NTK.q='';
    NTK.manual={};   // file mới -> bỏ mọi lựa chọn chuyển tay của file cũ
    NTK.classify();
    const qEl=document.getElementById('ntkSearch');if(qEl)qEl.value='';
    NTK.setProg(-1);
    NTK.setStatus('✓ Đã xử lý <b>'+hesc(srcLabel||'')+'</b> — '+nn(st.total)+' dòng dữ liệu, tìm được <b>'+
      nn(out.length)+'</b> nhóm nghi ngờ NTK.');
    NTK.render();
  },

  /* ================= CHẤM ĐIỂM LẠM DỤNG =================
     Điều kiện TÁCH sang tab Nhóm Lạm Dụng (chốt với user 14/08/2026, chỉnh được trên giao diện):
       số tài khoản > MIN_ACCS (mặc định 5, tức từ 6 TK)  VÀ  chênh lệch tiền nạp <= MAX_SPREAD (20%).
     Các "đặc điểm" (mẫu ID do tool sinh, chi nhánh bất thường) KHÔNG tự tách nhóm — chúng được
     hiện thành nhãn để người xử lý nhìn ra ngay, và dùng để xếp thứ tự nhóm đáng ngờ lên trước. */
  MAX_SPREAD:0.20,
  MIN_ACCS:5,
  manual:{},   // key nhóm -> true (ép Lạm Dụng) / false (ép về Nhiều TK); do người dùng bấm tay

  // Chuyển tay 1 nhóm giữa 2 tab. Bấm lại lần nữa ở tab kia là trả về đúng kết quả tự động.
  move(encKey,toAbuse){
    const key=decodeURIComponent(encKey),g=NTK.groups.find(x=>x.key===key);
    if(!g)return;
    if(g.auto===toAbuse)delete NTK.manual[key];  // trùng với kết quả tự động -> bỏ ghi đè cho gọn
    else NTK.manual[key]=toAbuse;
    NTK.classify();NTK.render();
  },

  money(v){
    const s=String(v==null?'':v).replace(/[^\d.,-]/g,'').replace(/,/g,'');
    const n=parseFloat(s);
    return isFinite(n)?n:null;
  },
  // Dấu vân tay cấu trúc: chữ -> a, số -> 9, còn lại -> _  (vd 'Trangiuu122' -> 'a8_9 3' dạng nén)
  shapeOf(id){
    const raw=String(id).toLowerCase().replace(/[a-z]/g,'a').replace(/[0-9]/g,'9').replace(/[^a9]/g,'_');
    let out='',i=0;
    while(i<raw.length){let j=i;while(j<raw.length&&raw[j]===raw[i])j++;out+=raw[i]+(j-i);i=j;}
    return out;
  },
  // ID "ký tự lộn xộn": có chuỗi >=4 phụ âm liền nhau, hoặc phần chữ gần như không có nguyên âm
  messyId(id){
    const s=String(id).toLowerCase().replace(/[^a-z]/g,'');
    if(s.length<4)return false;
    if(/[bcdfghjklmnpqrstvwxz]{4,}/.test(s))return true;
    const vow=(s.match(/[aeiouy]/g)||[]).length;
    return vow/s.length<0.2;
  },
  // Chi nhánh: không dấu (bỏ dấu xong vẫn y nguyên) — dấu hiệu gõ ẩu/tool điền
  noDiacritic(s){
    const t=String(s);
    if(!/[a-zA-Z]/.test(t))return false;
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'')===t;
  },

  // Tính đặc điểm + phân loại cho MỌI nhóm. Rẻ (chỉ chạy trên các nhóm đã gom), gọi lại được khi đổi ngưỡng.
  classify(){
    NTK.groups.forEach(g=>{
      const accs=g.accs,n=accs.length;
      // ---- chênh lệch tiền nạp ----
      const ms=accs.map(a=>NTK.money(a.money)).filter(v=>v!==null&&v>0);
      if(ms.length===n&&n>0){
        const mn=Math.min.apply(null,ms),mx=Math.max.apply(null,ms);
        g.mMin=mn;g.mMax=mx;g.spread=mx>0?(mx-mn)/mx:0;
      }else{g.mMin=null;g.mMax=null;g.spread=null;}  // thiếu tiền -> không đủ dữ liệu để kết luận

      // ---- đặc điểm mẫu ID ----
      const marks=[],ids=accs.map(a=>String(a.id));
      const shapes={};ids.forEach(i=>{const s=NTK.shapeOf(i);shapes[s]=(shapes[s]||0)+1;});
      const topShape=Math.max.apply(null,Object.values(shapes));
      if(n>=3&&topShape/n>=0.6)marks.push('Cùng cấu trúc ID');
      // tiền tố chung >=3 ký tự cho >=60% ID
      const low=ids.map(i=>i.toLowerCase()).slice().sort();
      let pref=0;
      for(let L=3;L<=12;L++){
        const cnt={};low.forEach(i=>{if(i.length>=L){const p=i.slice(0,L);cnt[p]=(cnt[p]||0)+1;}});
        const best=Object.values(cnt).length?Math.max.apply(null,Object.values(cnt)):0;
        if(best/n>=0.6)pref=L;else break;
      }
      if(pref>=3)marks.push('Cùng tiền tố ('+pref+' ký tự)');
      // Đuôi số: CHỈ gắn nhãn khi các số đuôi nằm sát nhau (dãy thứ tự do tool sinh).
      // Nhãn "kết thúc bằng số" chung chung đã bỏ: nó bắn trên ~70% nhóm (tên người Việt
      // vốn hay kèm số) nên không phân biệt được gì, chỉ làm loãng các nhãn thật sự đáng chú ý.
      const tails=ids.map(i=>(i.match(/(\d+)$/)||[])[1]).filter(Boolean);
      if(tails.length/n>=0.6){
        const nums=tails.map(Number).filter(isFinite);
        if(nums.length>=3){
          const mn=Math.min.apply(null,nums),mx=Math.max.apply(null,nums);
          if(mx-mn<=nums.length*3)marks.push('Đuôi số liên tiếp');
        }
      }
      if(ids.filter(NTK.messyId).length/n>=0.5)marks.push('Ký tự lộn xộn');
      // Chữ cái lặp liền (nn, aaa, ii, zz): tên đăng nhập người thật hiếm khi có, tool sinh thì đầy
      if(ids.filter(i=>/([a-z])\1/i.test(String(i).replace(/\d/g,''))).length/n>=0.5)
        marks.push('Chữ cái lặp bất thường');
      // Trùng chuỗi con >=4 ký tự giữa các ID trong nhóm (vd 'sonn', 'tranvan', 'depzai')
      if(n>=2){
        const gram={};
        ids.forEach(i=>{
          const s=String(i).toLowerCase().replace(/[^a-z]/g,''),seen=new Set();
          for(let k=0;k+4<=s.length;k++)seen.add(s.substr(k,4));
          seen.forEach(x=>{gram[x]=(gram[x]||0)+1;});
        });
        const shared=new Set(Object.keys(gram).filter(k=>gram[k]>=2));
        if(shared.size){
          const hit=ids.filter(i=>{
            const s=String(i).toLowerCase().replace(/[^a-z]/g,'');
            for(let k=0;k+4<=s.length;k++)if(shared.has(s.substr(k,4)))return true;
            return false;
          }).length;
          if(hit/n>=0.5)marks.push('Trùng chuỗi con trong ID');
        }
      }

      // ---- đặc điểm chi nhánh ----
      const brs=accs.map(a=>String(a.branch||'').trim()).filter(Boolean);
      if(brs.length===n&&n>1){
        const uniq=new Set(brs.map(b=>b.toLowerCase()));
        if(uniq.size===1)marks.push('Chi nhánh giống hệt');
        const letters=b=>/[a-zA-ZÀ-ỹ]/.test(b);
        const lowNo=brs.filter(b=>letters(b)&&b===b.toLowerCase()&&NTK.noDiacritic(b)).length;
        if(lowNo/n>=0.6)marks.push('Chi nhánh viết thường không dấu');
        const up=brs.filter(b=>letters(b)&&b===b.toUpperCase()).length;
        if(up/n>=0.6)marks.push('Chi nhánh in hoa toàn bộ');
      }
      g.marks=marks;

      // ---- phân loại ----
      const auto=(n>NTK.MIN_ACCS)&&(g.spread!==null)&&(g.spread<=NTK.MAX_SPREAD);
      // Người dùng chuyển tay ĐÈ lên kết quả tự động, và giữ nguyên khi đổi ngưỡng
      const man=NTK.manual[g.key];
      g.auto=auto;
      g.moved=(man!==undefined&&man!==auto);
      g.abuse=(man!==undefined)?man:auto;
    });
    NTK.stats.abuseGroups=NTK.groups.filter(g=>g.abuse).length;
    NTK.stats.ntkGroups=NTK.groups.length-NTK.stats.abuseGroups;
  },

  // Đổi ngưỡng trên giao diện -> phân loại lại, KHÔNG phải đọc lại file
  setThresh(){
    const sp=parseFloat(document.getElementById('ntkSpread').value),
          mi=parseInt(document.getElementById('ntkMinAcc').value,10);
    if(isFinite(sp)&&sp>=0&&sp<=100)NTK.MAX_SPREAD=sp/100;
    if(isFinite(mi)&&mi>=1)NTK.MIN_ACCS=mi;
    if(!NTK.stats)return;
    NTK.classify();NTK.page=1;NTK.render();
  },

  setView(v){NTK.view=v;NTK.page=1;NTK.render();},

  /* ================= HIỂN THỊ ================= */
  view:'ntk',
  ROWS:200,   // số DÒNG tối đa mỗi trang (0 = xem tất cả); người dùng chọn ở ô "Hiển thị"

  // Cắt trang theo số DÒNG nhưng KHÔNG xé lẻ một nhóm: nhóm nào vượt quá thì đẩy sang trang sau.
  pageSlices(list){
    const lim=NTK.ROWS;
    if(!lim||lim<=0)return [list];
    const out=[];let cur=[],c=0;
    list.forEach(g=>{
      const n=g.accs.length;
      if(cur.length&&c+n>lim){out.push(cur);cur=[];c=0;}
      cur.push(g);c+=n;
    });
    if(cur.length)out.push(cur);
    return out.length?out:[[]];
  },
  setRows(v){NTK.ROWS=parseInt(v,10)||0;NTK.page=1;NTK.render();},

  filtered(){
    const q=NTK.norm(NTK.q),qr=NTK.q.trim();
    let g=NTK.groups.filter(x=>NTK.view==='abuse'?x.abuse:!x.abuse);
    if(q)g=g.filter(x=>NTK.norm(x.name).indexOf(q)!==-1||x.ip.indexOf(qr)!==-1||
      x.accs.some(a=>a.id.indexOf(qr)!==-1));
    // cùng số TK thì nhóm nhiều "đặc điểm" hơn lên trước
    g=g.slice().sort((a,b)=>{
      const d=NTK.sortDesc?b.accs.length-a.accs.length:a.accs.length-b.accs.length;
      return d!==0?d:(b.marks.length-a.marks.length);
    });
    return g;
  },

  render(){
    const body=document.getElementById('ntkBody'),st=NTK.stats;
    if(!body)return;
    if(!st){body.style.display='none';return;}
    body.style.display='';

    // ---- Thẻ thống kê ----
    const card=(lbl,val,color)=>'<div class="stat-card"><div class="stat-lbl"'+(color?' style="color:'+color+'"':'')+
      '>'+lbl+'</div><div class="stat-val">'+val+'</div></div>';
    document.getElementById('ntkCards').innerHTML=
      card('Dòng dữ liệu đọc',nn(st.total))+
      card('Dòng hợp lệ sau lọc',nn(st.kept),'var(--gr)')+
      card('Tài khoản phân biệt',nn(st.distinct))+
      card('Nhóm nhiều tài khoản',nn(st.ntkGroups),'var(--go)')+
      card('Nhóm lạm dụng',nn(st.abuseGroups),'var(--re)');

    // ---- 2 tab nhỏ ----
    document.getElementById('ntkViews').innerHTML=
      '<div class="vt-btn'+(NTK.view==='ntk'?' active':'')+'" onclick="NTK.setView(\'ntk\')">Nhóm Nhiều Tài Khoản ('+nn(st.ntkGroups)+')</div>'+
      '<div class="vt-btn'+(NTK.view==='abuse'?' active':'')+'" onclick="NTK.setView(\'abuse\')">Nhóm Lạm Dụng ('+nn(st.abuseGroups)+')</div>';

    // ---- Bảng minh bạch phần bị loại ----
    const drop=[
      ['Thiếu ID / Tên thật / IP',st.noKey],
      ['IP bắt đầu 104. (dải proxy/CDN)',st.ipSkip],
      ['Cấp độ nằm trong danh sách loại trừ',st.banned],
      ['Dòng nạp trùng của cùng một tài khoản (đã gộp)',st.dupRow]
    ];
    document.getElementById('ntkDropStat').innerHTML=
      '<div class="chart-title" style="color:var(--pu2)">Thống kê dòng bị loại <span style="color:var(--mu);text-transform:none;letter-spacing:0;font-weight:400">'+
      '<span>— tiêu đề nhận ở dòng '+st.hdrRow+'</span>'+
      (st.noMoney?'<span> · không có cột Tiền nạp</span>':'')+
      (st.noBranch?'<span> · không có cột Chi nhánh</span>':'')+'</span></div>'+
      '<table class="ntk-tbl"><tbody>'+drop.map(d=>'<tr><td>'+d[0]+'</td><td style="text-align:right;font-weight:700;color:'+
      (d[1]?'var(--go)':'var(--mu)')+'">'+nn(d[1])+'</td></tr>').join('')+'</tbody></table>';

    // ---- Danh sách nhóm ----
    const all=NTK.filtered(),pages=NTK.pageSlices(all),tot=pages.length;
    if(NTK.page>tot)NTK.page=tot;
    const pageItems=pages[NTK.page-1]||[];
    const totRows=all.reduce((s,g)=>s+g.accs.length,0);
    document.getElementById('ntkCount').textContent=nn(all.length)+' nhóm · '+nn(totRows)+' dòng';

    if(!all.length){
      document.getElementById('ntkList').innerHTML=
        '<div style="padding:26px;text-align:center;color:var(--mu);font-size:.7rem">Không có nhóm nào khớp.</div>';
      document.getElementById('ntkPager').innerHTML='';
      return;
    }

    const rows=[],pct=v=>v===null?'—':(Math.round(v*1000)/10).toString().replace('.',',')+'%';
    pageItems.forEach(g=>{
      const nAcc=g.accs.length;
      g.accs.forEach((a,idx)=>{
        rows.push('<tr'+(idx===0?' class="ntk-first"':'')+'>'+
          '<td style="color:var(--pu2);font-weight:700">'+(idx===0?hesc(a.id):'')+'</td>'+
          '<td style="color:var(--go);font-weight:700">'+(idx===0?'':hesc(a.id))+'</td>'+
          '<td>'+hesc(a.level)+'</td>'+
          '<td style="font-weight:600">'+hesc(a.name)+'</td>'+
          '<td>'+hesc(a.money)+'</td>'+
          '<td>'+hesc(a.branch)+'</td>'+
          '<td style="color:var(--cy);font-family:monospace">'+hesc(a.ip)+'</td>'+
          '<td>'+hesc(a.id)+'</td>'+
          '<td style="font-size:.58rem;color:var(--mu2)">'+NTK.fmtDate(a.time)+'</td>'+
          // 2 cột tổng hợp của cả nhóm -> gộp ô theo chiều dọc
          (idx===0?'<td rowspan="'+nAcc+'" style="font-weight:800;color:'+
            (g.spread!==null&&g.spread<=NTK.MAX_SPREAD?'var(--re)':'var(--mu2)')+'">'+pct(g.spread)+'</td>':'')+
          (idx===0?'<td rowspan="'+nAcc+'" style="white-space:normal;min-width:170px">'+
            (g.marks.length?g.marks.map(m=>'<span class="ntk-mark">'+m+'</span>').join(' '):
             '<span style="color:var(--mu)">—</span>')+
            (g.moved?'<div><span class="ntk-mark" style="background:rgba(6,182,212,.16);border-color:rgba(6,182,212,.45);color:#67e8f9">Chuyển tay</span></div>':'')+
            '<div style="margin-top:6px"><button class="abtn abtn-sm '+(NTK.view==='abuse'?'abtn-ghost':'abtn-danger')+'" '+
            'onclick="NTK.move(\''+encodeURIComponent(g.key)+'\','+(NTK.view==='abuse'?'false':'true')+')">'+
            (NTK.view==='abuse'?'↩ Trả về Nhiều TK':'⇢ Chuyển nhóm LD')+'</button></div></td>':'')+
          '</tr>');
      });
      rows.push('<tr class="ntk-gap"><td colspan="11"></td></tr>');
    });

    document.getElementById('ntkList').innerHTML=
      '<table class="ntk-tbl"><thead><tr>'+
      ['Nạp Trước','Nạp Sau','Cấp độ thành viên','Tên thật','Tiền nạp','Chi nhánh','IP','Tài khoản','Thời gian nạp','Chênh lệch','Đặc điểm']
        .map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>';

    // ---- Phân trang ----
    let pg='';
    if(tot>1){
      pg='<button class="abtn abtn-sm abtn-ghost" onclick="NTK.go(NTK.page-1)"'+(NTK.page<=1?' disabled':'')+'>‹ Trước</button>'+
         '<span style="font-size:.66rem;color:var(--mu);padding:0 10px">Trang '+NTK.page+' / '+tot+'</span>'+
         '<button class="abtn abtn-sm abtn-ghost" onclick="NTK.go(NTK.page+1)"'+(NTK.page>=tot?' disabled':'')+'>Sau ›</button>';
    }
    document.getElementById('ntkPager').innerHTML=pg;
  },

  go(p){NTK.page=Math.max(1,p);NTK.render();},
  search(v){NTK.q=v||'';NTK.page=1;NTK.render();},
  toggleSort(){NTK.sortDesc=!NTK.sortDesc;
    const b=document.getElementById('ntkSortBtn');
    if(b)b.textContent=NTK.sortDesc?'⇅ Nhóm đông trước':'⇅ Nhóm ít trước';
    NTK.page=1;NTK.render();},

  /* ---- Xuất EXCEL theo TAB ĐANG XEM ----
     Dùng SpreadsheetML (không phải CSV): CSV là văn bản thuần, KHÔNG mang được căn giữa
     hay độ rộng cột. File .xls này Excel mở trực tiếp, giữ nguyên định dạng.
     - Tab Nhiều Tài Khoản: 9 cột, căn giữa tất cả, RIÊNG cột Câu lệnh NTK căn trái.
       (Đã bỏ 3 cột Thời gian nạp / Chênh lệch / Đặc điểm theo yêu cầu — chúng chỉ còn trên giao diện.)
     - Tab Lạm Dụng: chỉ 2 cột Tài khoản (kèm dấu phẩy) + 1 câu lệnh cố định cho mọi dòng.
     Độ rộng cột tự co theo nội dung dài nhất của chính cột đó. */
  ABUSE_CMD:'Nhóm lạm dụng khuyến mãi - đưa vào lạm dụng và lạm dụng hoàn trả - Đã xử lý',

  exportCsv(){
    const list=NTK.filtered();
    if(!list.length){alert('Chưa có dữ liệu để tải.');return;}
    const abuse=NTK.view==='abuse';
    const hdr=abuse?['Tài khoản','Câu lệnh Lạm dụng']
      :['Nạp Trước','Nạp Sau','Cấp độ thành viên','Tên thật','Tiền nạp','Chi nhánh','IP','Tài khoản','Câu lệnh NTK'];
    // cột căn TRÁI (cột câu lệnh); còn lại căn giữa
    const leftCol=hdr.length-1;
    const body=[];
    list.forEach(g=>{
      g.accs.forEach((a,idx)=>{
        body.push(abuse?[a.id+',',NTK.ABUSE_CMD]
          :[idx===0?g.first:'',idx===0?'':a.id,a.level,a.name,a.money,a.branch,a.ip,a.id,g.cmd]);
      });
    });
    if(body.length>60000&&!confirm('File có '+nn(body.length)+' dòng — mở bằng Excel sẽ chậm. Vẫn tải?'))return;

    const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    // Độ rộng: theo ký tự dài nhất của cột (Tahoma 9 ~5,6pt/ký tự), có chặn trên/dưới
    const width=i=>{
      let mx=String(hdr[i]).length;
      for(const r of body){const L=String(r[i]==null?'':r[i]).length;if(L>mx)mx=L;}
      return Math.max(55,Math.min(i===leftCol?620:260,Math.round(mx*5.6+16)));
    };
    const FONT='<Font ss:Name="Tahoma" ss:Size="9" ss:Color="#000000"/>';
    const BD='<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>'+
      '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>'+
      '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>'+
      '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>';
    const styles='<Styles>'+
      '<Style ss:ID="h"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>'+BD+
        '<Font ss:Bold="1" ss:Name="Tahoma" ss:Size="9" ss:Color="#000000"/><Interior ss:Color="#F8CBAD" ss:Pattern="Solid"/></Style>'+
      '<Style ss:ID="c"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/>'+BD+FONT+'</Style>'+
      '<Style ss:ID="l"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/>'+BD+FONT+'</Style>'+
      '</Styles>';
    const cell=(v,i)=>{
      const sty=(i===leftCol)?'l':'c';
      // chỉ cột Tiền nạp mới để kiểu Số (để Excel cộng được); còn lại giữ Chuỗi kẻo mất số 0 đầu
      const isMoney=!abuse&&i===4&&/^\d+(\.\d+)?$/.test(String(v));
      return '<Cell ss:StyleID="'+sty+'"><Data ss:Type="'+(isMoney?'Number':'String')+'">'+esc(v)+'</Data></Cell>';
    };
    const xml='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'+
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
      styles+'<Worksheet ss:Name="'+(abuse?'Nhom Lam Dung':'Lenh NTK')+'"><Table>'+
      hdr.map((h,i)=>'<Column ss:AutoFitWidth="0" ss:Width="'+width(i)+'"/>').join('')+
      '<Row>'+hdr.map(h=>'<Cell ss:StyleID="h"><Data ss:Type="String">'+esc(h)+'</Data></Cell>').join('')+'</Row>'+
      body.map(r=>'<Row>'+r.map(cell).join('')+'</Row>').join('')+
      '</Table></Worksheet></Workbook>';

    const blob=new Blob(['﻿'+xml],{type:'application/vnd.ms-excel;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=(abuse?'Nhom_Lam_Dung_':'Lenh_NTK_')+new Date().toISOString().slice(0,10)+'.xls';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  },

  clearAll(){
    if(NTK.groups.length&&!confirm('Xóa toàn bộ dữ liệu NTK đang có trong phiên này?'))return;
    NTK.rows=[];NTK.groups=[];NTK.stats=null;NTK.page=1;NTK.q='';NTK.fileName='';NTK.manual={};
    const b=document.getElementById('ntkBody');if(b)b.style.display='none';
    const s=document.getElementById('ntkSearch');if(s)s.value='';
    NTK.setProg(-1);NTK.setStatus('Đã xóa dữ liệu. Thả file mới để bắt đầu lại.');
  }
};

/* ---- Gắn sự kiện cho ô thả/dán/chọn file (độc lập hoàn toàn với upload chính) ---- */
(function ntkWire(){
  const drop=document.getElementById('ntkDrop'),fileEl=document.getElementById('ntkFile'),pick=document.getElementById('ntkPick');
  if(!drop)return;
  pick.addEventListener('click',()=>fileEl.click());
  fileEl.addEventListener('change',()=>{NTK.loadFile(fileEl.files[0]);fileEl.value='';});
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.style.borderColor='var(--pu2)';}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.style.borderColor='var(--border2)';}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)NTK.loadFile(f);});
  document.addEventListener('paste',e=>{
    const t3=document.getElementById('t3');
    if(!t3||t3.style.display==='none')return;          // chỉ nhận dán khi đang ở tab Lọc File NTK
    if(e.target&&e.target.id==='ntkSearch')return;
    const items=e.clipboardData&&e.clipboardData.items;
    if(items)for(const it of items)if(it.kind==='file'){const f=it.getAsFile();if(f){e.preventDefault();NTK.loadFile(f);return;}}
    const text=e.clipboardData&&e.clipboardData.getData('text');
    if(text&&text.includes('\t')){e.preventDefault();
      NTK.applyPasted(text.replace(/\r/g,'').split('\n').map(l=>l.split('\t')));}
  });
})();
