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
    id:['id','so tai khoan','số tài khoản','tai khoan','account','tài khoản'],
    time:['thoi gian nap tien','thoi gian nap','thoi gian','thời gian nạp tiền','thời gian nạp','time','deposit time','time deposit','created at','joined at'],
    name:['ten that','ten','tên thật','name','full name','ho ten','ho va ten','họ tên'],
    ip:['ip','dia chi ip','địa chỉ ip','ip address'],
    level:['cap do thanh vien','cấp độ thành viên','level','rank'],
    money:['tien nap','tiền nạp','so tien','money','amount','số tiền'],
    branch:['chi nhanh','chi nhánh','branch']
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
        // chỉ nhận biến thể đủ dài để tránh 'id'/'ip' ăn nhầm những cột khác
        if(c.length>=3&&hdr[i].indexOf(c)!==-1&&c.length>bestLen){best=i;bestLen=c.length;}
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
      out.push({first:first.id,name:first.name,ip:first.ip,cmd:cmd,accs:arr});
    });

    st.groups=out.length;
    st.accsInGroups=out.reduce((s,g)=>s+g.accs.length,0);
    st.distinct=0;groups.forEach(g=>{st.distinct+=g.size;});

    NTK.groups=out;NTK.stats=st;NTK.page=1;NTK.q='';
    const qEl=document.getElementById('ntkSearch');if(qEl)qEl.value='';
    NTK.setProg(-1);
    NTK.setStatus('✓ Đã xử lý <b>'+hesc(srcLabel||'')+'</b> — '+nn(st.total)+' dòng dữ liệu, tìm được <b>'+
      nn(out.length)+'</b> nhóm nghi ngờ NTK.');
    NTK.render();
  },

  /* ================= HIỂN THỊ ================= */
  filtered(){
    const q=NTK.norm(NTK.q);
    let g=NTK.groups;
    if(q)g=g.filter(x=>NTK.norm(x.name).indexOf(q)!==-1||x.ip.indexOf(NTK.q.trim())!==-1||
      x.accs.some(a=>a.id.indexOf(NTK.q.trim())!==-1));
    g=g.slice().sort((a,b)=>NTK.sortDesc?b.accs.length-a.accs.length:a.accs.length-b.accs.length);
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
      card('Nhóm nghi ngờ NTK',nn(st.groups),'var(--go)')+
      card('Tài khoản trong nhóm',nn(st.accsInGroups),'var(--re)');

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
    const all=NTK.filtered(),tot=Math.max(1,Math.ceil(all.length/NTK.PS));
    if(NTK.page>tot)NTK.page=tot;
    const pageItems=all.slice((NTK.page-1)*NTK.PS,NTK.page*NTK.PS);
    document.getElementById('ntkCount').textContent=nn(all.length)+' nhóm';

    if(!all.length){
      document.getElementById('ntkList').innerHTML=
        '<div style="padding:26px;text-align:center;color:var(--mu);font-size:.7rem">Không có nhóm nào khớp.</div>';
      document.getElementById('ntkPager').innerHTML='';
      return;
    }

    const rows=[];
    pageItems.forEach(g=>{
      g.accs.forEach((a,idx)=>{
        rows.push('<tr'+(idx===0?' style="background:rgba(124,58,237,.1)"':'')+'>'+
          '<td style="color:var(--pu2);font-weight:700">'+(idx===0?hesc(a.id):'')+'</td>'+
          '<td style="color:var(--go);font-weight:700">'+(idx===0?'':hesc(a.id))+'</td>'+
          '<td>'+hesc(a.level)+'</td>'+
          '<td style="font-weight:600">'+hesc(a.name)+'</td>'+
          '<td style="text-align:right">'+hesc(a.money)+'</td>'+
          '<td>'+hesc(a.branch)+'</td>'+
          '<td style="color:var(--cy);font-family:monospace">'+hesc(a.ip)+'</td>'+
          '<td>'+hesc(a.id)+'</td>'+
          '<td style="font-size:.58rem;color:var(--mu2)">'+NTK.fmtDate(a.time)+'</td>'+
          '</tr>');
      });
      rows.push('<tr><td colspan="9" style="background:var(--card2);padding:8px 10px">'+
        '<div style="display:flex;gap:10px;align-items:flex-start">'+
        '<button class="abtn abtn-sm abtn-pu" onclick="NTK.copyCmd(\''+encodeURIComponent(g.first)+'\')">📋 Copy câu lệnh</button>'+
        // data-noi18n: câu lệnh là NỘI DUNG NGHIỆP VỤ dán sang hệ thống xử lý — dịch sang tiếng Anh là hỏng
        '<div data-noi18n style="flex:1;font-size:.62rem;line-height:1.6;color:var(--tx)">'+hesc(g.cmd)+'</div></div></td></tr>');
    });

    document.getElementById('ntkList').innerHTML=
      '<table class="ntk-tbl"><thead><tr>'+
      ['Tài khoản nạp đầu','Những tài khoản nạp sau','Cấp độ thành viên','Tên thật','Tiền nạp','Chi nhánh','IP','Tài khoản','Thời gian nạp']
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

  copyCmd(encFirst){
    const first=decodeURIComponent(encFirst);
    const g=NTK.groups.find(x=>x.first===first);
    if(!g)return;
    const done=()=>{setCloudStatus&&setCloudStatus('Đã copy câu lệnh NTK ✓');};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(g.cmd).then(done,()=>{});
    else{const t=document.createElement('textarea');t.value=g.cmd;document.body.appendChild(t);t.select();
      try{document.execCommand('copy');done();}catch(e){}t.remove();}
  },

  /* ---- Xuất CSV: với hàng chục nghìn dòng thì CSV an toàn hơn hẳn XML SpreadsheetML ---- */
  exportCsv(){
    if(!NTK.groups.length){alert('Chưa có dữ liệu để tải.');return;}
    const esc=v=>{const s=(v===null||v===undefined)?'':String(v);
      return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const lines=[['Tài khoản nạp đầu','Những tài khoản nạp sau','Cấp độ thành viên','Tên thật',
      'Tiền nạp','Chi nhánh','IP','Tài khoản','Thời gian nạp','Câu lệnh NTK'].join(',')];
    NTK.filtered().forEach(g=>{
      g.accs.forEach((a,idx)=>{
        lines.push([idx===0?g.first:'',idx===0?'':a.id,a.level,a.name,a.money,a.branch,a.ip,a.id,
          NTK.fmtDate(a.time),g.cmd].map(esc).join(','));
      });
    });
    const blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='Lenh_NTK_'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  },

  clearAll(){
    if(NTK.groups.length&&!confirm('Xóa toàn bộ dữ liệu NTK đang có trong phiên này?'))return;
    NTK.rows=[];NTK.groups=[];NTK.stats=null;NTK.page=1;NTK.q='';NTK.fileName='';
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
