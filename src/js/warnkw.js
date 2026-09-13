// ============================================================
// ĐIỀU KIỆN CẢNH BÁO (module WK) — tab nhỏ thứ 3 của T23
//
// PHÂN VAI (chốt 03/09/2026):
//   • NHÓM ĐIỀU KIỆN (tab KM của extension) -> HỆ THỐNG quản lý TẠI ĐÂY.
//     Nhân viên chỉ xem trên máy, không sửa được. Mỗi lần đồng bộ THAY TOÀN BỘ.
//   • NHÓM TỪ KHÓA (tab Nhóm của extension) -> NHÂN VIÊN tự do thêm/bớt.
//     Dashboard KHÔNG đọc, KHÔNG ghi, KHÔNG xoá — cố ý để yên.
//
// Nguồn sự thật: reports type='warnkw' month='all' = {promoGroups:[...], extId}.
// Bảng warnkw_pulse chỉ chứa một số phiên bản, dùng làm "chuông cửa" Realtime.
//
// ⚠ KHÔNG bật Realtime trên `reports`: bảng đó chứa dataset don/km cả tháng (hàng
//   trăm KB/dòng) -> mỗi lần upload Excel là cả dòng bay qua WebSocket tới mọi
//   dashboard. Xem ghi chú trong supabase_warnkw_setup.sql.
//
// Đường đi của một lần sửa:
//   TT bấm Lưu -> ghi reports + tăng số ở warnkw_pulse
//   -> Realtime báo cho MỌI dashboard đang mở (nhân viên mở suốt ca)
//   -> mỗi dashboard đọc lại rồi đẩy sang extension TRÊN MÁY ĐÓ qua
//      chrome.runtime.sendMessage (manifest khai externally_connectable).
// Nhờ vậy extension không cần mật khẩu, token hay mã thiết bị nào.
//
// CÚ PHÁP ĐIỀU KIỆN (khớp đúng promoConditionMatches trong content.js):
//   100 ~ 500        -> trong trang có SỐ nằm trong khoảng
//   agribank, acb    -> trúng BẤT KỲ từ nào trong danh sách
//   【NTK-TBA】       -> trang có chứa chuỗi này
// PHẠM VI luôn là CẢ TRANG (chốt 06/09/2026): gộp text cả trang rồi đếm, đủ
// `needed` điều kiện thì tô mọi chỗ khớp. Phạm vi "theo hàng bảng" đã BỎ —
// dấu hiệu trên trang chi tiết hội viên nằm rải rác nhiều dòng, không cùng
// hàng bảng nào. Ô "Giới hạn thêm" của từng nhóm cũng đã bỏ: danh sách domain
// dùng chung ở trên đã quyết định extension chạy ở đâu.
// ============================================================
const WK={
  // topics: [{id,name,note}] — CHỦ ĐỀ gom nhiều nhóm điều kiện, mỗi chủ đề có MỘT
  // lời nhắc hiện to + đỏ trong ô cảnh báo. Nhóm không thuộc chủ đề nào vẫn chạy
  // bình thường, chỉ là không có lời nhắc.
  cfg:{topics:[],promoGroups:[],domains:[],extId:''},
  booted:false, loading:false, _ch:null,
  _push:'', _pushAt:0,

  COLORS:['#ef4444','#f97316','#f59e0b','#22c55e','#06b6d4','#3b82f6','#7c3aed','#ec4899'],

  // File cài đặt cho nhân viên (Supabase Storage, bucket công khai).
  // ⚠ Ra bản mới: chạy dong-goi.ps1, XOÁ file zip cũ trên Supabase rồi upload bản mới
  // (Supabase không ghi đè, upload trùng tên sẽ đẻ ra "canhbaone (1).zip"),
  // và sửa EXT_VER ở đây cho khớp manifest để nhân viên biết máy mình cũ hay mới.
  EXT_ZIP:'https://dntqyipgpuibkaarhqcc.supabase.co/storage/v1/object/public/CanhBaoNe/canhbaone.zip',
  EXT_VER:'2.0',

  canEdit(){return !!(CUR_PROFILE&&(CUR_PROFILE.is_admin||roleOf(CUR_PROFILE).key==='totruong'));},
  visible(){const el=document.getElementById('tkw');return !!(el&&el.style.display!=='none');},

  // ===== Nạp / lưu =====
  async boot(){
    if(WK.booted||WK.loading||!SB.ready())return;
    WK.loading=true;
    try{
      const d=await SB.loadReport('warnkw','all');
      if(d&&typeof d==='object'){
        WK.cfg.promoGroups=Array.isArray(d.promoGroups)?d.promoGroups:[];
        WK.cfg.topics=Array.isArray(d.topics)?d.topics:[];
        WK.cfg.domains=Array.isArray(d.domains)?d.domains:[];
        WK.cfg.extId=String(d.extId||'');
      }
      WK.booted=true;
      WK.subscribe();
      WK.push();               // đẩy ngay lúc đăng nhập đầu ca
    }catch(e){console.error('WK.boot',e);}
    WK.loading=false;
    if(WK.visible())WK.render();
  },

  subscribe(){
    if(WK._ch||!SB.ready())return;
    try{
      WK._ch=SB.client().channel('warnkw-pulse')
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'warnkw_pulse'},()=>WK.onPulse())
        .subscribe();
    }catch(e){console.error('WK.subscribe',e);}
  },

  // Có người sửa ở máy khác -> đọc lại rồi đẩy sang extension của MÁY NÀY
  async onPulse(){
    try{
      const d=await SB.loadReport('warnkw','all');
      if(d&&typeof d==='object'){
        WK.cfg.promoGroups=Array.isArray(d.promoGroups)?d.promoGroups:[];
        WK.cfg.topics=Array.isArray(d.topics)?d.topics:[];
        WK.cfg.domains=Array.isArray(d.domains)?d.domains:[];
        WK.cfg.extId=String(d.extId||WK.cfg.extId||'');
      }
      WK.push();
      if(WK.visible())WK.render();
    }catch(e){console.error('WK.onPulse',e);}
  },

  async save(label){
    if(!WK.canEdit()){alert('Chỉ ADMIN / Tổ Trưởng được sửa nhóm điều kiện.');return;}
    try{
      await SB.saveReport('warnkw','all',{topics:WK.cfg.topics,promoGroups:WK.cfg.promoGroups,domains:WK.cfg.domains,extId:WK.cfg.extId});

      // ĐỌC LẠI để xác nhận đã ghi thật. Không có bước này thì một lần ghi bị RLS
      // chặn hoặc ghi hụt vẫn im re, người dùng tưởng đã lưu (đã vấp 05/09/2026:
      // danh sách domain "biến mất" sau khi bấm Lưu mà không báo gì).
      const back=await SB.loadReport('warnkw','all');
      const okD=Array.isArray(back&&back.domains)?back.domains.length:0;
      if(okD!==WK.cfg.domains.length){
        throw new Error('Ghi xong đọc lại chỉ thấy '+okD+'/'+WK.cfg.domains.length+
          ' domain. Nhiều khả năng RLS chặn ghi type "warnkw" — chạy supabase_warnkw_setup.sql.');
      }

      // Bấm chuông: mọi dashboard đang mở nhận trong dưới 1 giây.
      // ⚠ Query của supabase-js KHÔNG throw khi bị RLS chặn — nó trả {error} hoặc
      //   0 dòng. Phải kiểm tay, nếu không lỗi trôi qua không ai biết.
      const {data:pRows,error:pErr}=await SB.client().from('warnkw_pulse')
        .update({v:Date.now(),at:new Date().toISOString()}).eq('id',1).select('id');
      if(pErr||!(pRows&&pRows.length))throw new Error('Lưu được nhưng KHÔNG bấm chuông được ('+
        (pErr?pErr.message:'RLS chặn cập nhật warnkw_pulse hoặc bảng thiếu dòng id=1')+
        '). Máy khác sẽ chỉ nhận khi đăng nhập lại.');

      if(typeof logAction==='function')logAction('NHÓM ĐIỀU KIỆN',label||'cập nhật');
      WK._savedAt=Date.now();
      WK.push();
      WK.render();
    }catch(e){
      console.error('WK.save',e);
      WK._savedAt=0;
      alert('LƯU KHÔNG THÀNH CÔNG\n\n'+(e.message||e));
      WK.render();
    }
  },

  // ===== Đẩy sang extension trên máy này =====
  push(){
    const id=String(WK.cfg.extId||'').trim();
    if(!id){WK._push='noid';return;}
    if(typeof chrome==='undefined'||!chrome.runtime||!chrome.runtime.sendMessage){WK._push='nochrome';return;}
    try{
      chrome.runtime.sendMessage(id,{type:'SANJI_SYNC',topics:WK.cfg.topics,promoGroups:WK.cfg.promoGroups,domains:WK.cfg.domains},()=>{
        WK._push=(chrome.runtime.lastError)?'fail':'ok';
        WK._pushAt=Date.now();
        if(WK.visible())WK.render();
      });
    }catch(e){WK._push='fail';}
  },

  shown(){ if(!WK.booted)WK.boot(); else WK.render(); },

  // Extension vừa được CÀI/BẬT LẠI trên máy này thì nó gọi hàm này (background.js
  // chèn lệnh vào trang dashboard đang mở) để xin dữ liệu ngay, khỏi phải chờ ai đó
  // bấm Lưu trên dashboard mới có nhóm điều kiện.
  // ⚠ PHẢI đi qua boot() khi chưa nạp xong: gọi thẳng push() lúc WK.cfg còn rỗng là
  // đẩy danh sách RỖNG sang extension, xoá sạch nhóm điều kiện trên máy đó.
  // Chưa đăng nhập thì boot() tự thoát sớm, lát nữa applyPerms sẽ đẩy.
  // ⚠ PHẢI ĐỌC LẠI MÁY CHỦ, ĐỪNG đẩy `WK.cfg` đang nhớ sẵn (sửa 13/09/2026).
  // Bản cũ gọi thẳng push(): tab dashboard mở từ sáng, ngủ đông rồi lỡ mất tiếng
  // chuông Realtime ⇒ WK.cfg là bản CŨ, đẩy sang extension vẫn là điều kiện cũ —
  // mà `syncedAt` vẫn đổi nên nút ↺ trong popup báo "✓ Đã cập nhật". Nhãn nói dối
  // đúng lúc nhân viên bấm nút để chắc ăn. onPulse() đọc lại report rồi mới push.
  syncNow(){ if(WK.booted)WK.onPulse(); else WK.boot(); },

  // ===== Domain hậu đài (extension chạy ở đâu) =====
  // Nhận cả "https://abc.example.com/", "abc.example.com:8080/xyz", "*.example.com"
  // -> nhân viên dán thẳng URL trên thanh địa chỉ là được, khỏi phải tự cắt.
  // ⚠ ĐỪNG ghi domain hậu đài thật vào đây — repo này PUBLIC (GitHub Pages gói Free).
  _host(s){
    return String(s||'').trim().toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//,'')   // bỏ scheme
      .replace(/[/?#].*$/,'')                   // bỏ path/query/hash
      .replace(/:\d+$/,'')                      // bỏ port
      .replace(/\.$/,'');
  },
  _validHost(h){
    return /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h);
  },
  saveDomains(){
    if(!WK.canEdit())return;
    const ta=document.getElementById('wkDomains');if(!ta)return;
    const raw=ta.value.split(/[\n,;\s]+/).map(s=>WK._host(s)).filter(Boolean);
    const bad=raw.filter(h=>!WK._validHost(h));
    const seen=new Set(),ok=[];
    raw.forEach(h=>{if(WK._validHost(h)&&!seen.has(h)){seen.add(h);ok.push(h);}});
    if(bad.length&&!confirm('Bỏ qua '+bad.length+' dòng không hợp lệ:\n'+bad.slice(0,5).join('\n')+'\n\nTiếp tục lưu '+ok.length+' domain?'))return;
    WK.cfg.domains=ok;
    WK.save('cập nhật danh sách domain ('+ok.length+')');
  },

  // ===== Chủ đề (gom nhóm + lời nhắc) =====
  _t(i){return WK.cfg.topics[i];},
  topicOf(g){return WK.cfg.topics.find(t=>t.id===(g&&g.topicId))||null;},
  addTopic(){
    if(!WK.canEdit())return;
    const name=prompt('Tên chủ đề (VD: Lạm Dụng Đặc Điểm / Lạm Dụng IP / Lạm Dụng Tên Thật):');
    if(!name||!name.trim())return;
    const note=prompt('Lời nhắc cho chủ đề này — hiện TO và ĐỎ trong ô cảnh báo:',
      'Trùng '+name.trim()+' — cần kiểm tra kỹ trước khi xử lý');
    if(note===null)return;
    // Hỏi luôn bản EN ở đây cho tiện; bỏ trống cũng được, sửa sau ở ô bên dưới thẻ
    // chủ đề. Bỏ trống thì bản EN rơi về tiếng Việt, không bao giờ mất dòng cảnh báo.
    const en=prompt('Lời nhắc tiếng Anh (cho nhân viên nước ngoài) — bỏ trống cũng được:','');
    const o={id:'t'+Date.now().toString(36),name:name.trim(),note:String(note||'').trim()};
    if(en&&en.trim())o.en_note=en.trim();
    WK.cfg.topics.push(o);
    WK.save('thêm chủ đề '+name.trim());
  },
  editTopic(i){
    if(!WK.canEdit())return;
    const t=WK._t(i);if(!t)return;
    const n=prompt('Tên chủ đề:',t.name);
    if(n===null)return;
    if(n.trim())t.name=n.trim();
    WK.save('đổi tên chủ đề '+t.name);
  },
  saveTopicNote(i){
    if(!WK.canEdit())return;
    const t=WK._t(i);if(!t)return;
    const ta=document.getElementById('wkTn'+i);if(!ta)return;
    t.note=ta.value.trim();
    const te=document.getElementById('wkTe'+i);
    if(te){ const v=te.value.trim(); if(v)t.en_note=v; else delete t.en_note; }
    WK.save('cập nhật lời nhắc chủ đề '+t.name);
  },
  delTopic(i){
    if(!WK.canEdit())return;
    const t=WK._t(i);if(!t)return;
    const n=WK.cfg.promoGroups.filter(g=>g.topicId===t.id).length;
    if(!confirm('Xóa chủ đề "'+t.name+'"?\n\n'+n+' nhóm đang thuộc chủ đề này sẽ mất lời nhắc (nhóm KHÔNG bị xóa).'))return;
    WK.cfg.promoGroups.forEach(g=>{if(g.topicId===t.id)delete g.topicId;});
    WK.cfg.topics.splice(i,1);
    WK.save('xóa chủ đề '+t.name);
  },
  setGroupTopic(i,tid){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    if(tid)g.topicId=tid; else delete g.topicId;
    WK.save('đổi chủ đề nhóm '+g.name);
  },

  // ===== Thao tác =====
  _g(i){return WK.cfg.promoGroups[i];},
  // Ngưỡng không được vượt số điều kiện thật, nếu không nhóm KHÔNG BAO GIỜ tô
  _clamp(g){
    const n=(g.conditions||[]).filter(c=>String(c).trim()).length;
    if(!g.needed||g.needed<1)g.needed=1;
    if(g.needed>n)g.needed=n||1;
  },
  // Link nhóm Telegram của nhóm điều kiện. CHỈ nhận t.me / telegram.me / tg://
  // ⚠ Đây KHÔNG phải chuyện làm đẹp: link này được nhét thẳng vào href của ô cảnh
  // báo đang chạy TRÊN TRANG HẬU ĐÀI. Một link "javascript:..." là chạy được mã
  // tuỳ ý trong phiên làm việc của nhân viên. Trả '' nếu rỗng, null nếu sai.
  // background.js lọc lại lần nữa — chỗ đó mới là chốt chặn thật, chỗ này chỉ để
  // báo cho người nhập biết ngay lúc gõ.
  _tgOk(v){
    const s=String(v==null?'':v).trim();
    if(!s)return '';
    if(s.length>300)return null;
    if(/^tg:\/\/[A-Za-z0-9_?=&.\/+-]+$/.test(s))return s;
    if(/^https:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_?=&.\/+#-]*$/.test(s))return s;
    return null;
  },
  addGroup(topicId){
    if(!WK.canEdit())return;
    const name=prompt('Tên nhóm điều kiện (chữ này hiện trong ô cảnh báo: "Trùng ‹tên nhóm›"):');
    if(!name||!name.trim())return;
    const g={
      id:'p'+Date.now().toString(36),
      name:name.trim(),
      color:WK.COLORS[WK.cfg.promoGroups.length%WK.COLORS.length],
      conditions:[],needed:1,enabled:true
    };
    if(topicId)g.topicId=topicId;
    WK.cfg.promoGroups.push(g);
    WK.save('thêm nhóm '+name.trim());
  },
  renameGroup(i){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    const n=prompt('Tên nhóm:',g.name);
    if(!n||!n.trim())return;
    const old=g.name;g.name=n.trim();
    WK.save('đổi tên nhóm '+old+' → '+g.name);
  },
  setColor(i,c){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    g.color=c;WK.save('đổi màu nhóm '+g.name);
  },
  toggleGroup(i){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    g.enabled=g.enabled===false;
    WK.save((g.enabled?'bật':'tắt')+' nhóm '+g.name);
  },
  delGroup(i){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    if(!confirm('Xóa nhóm "'+g.name+'"?\n\nCả tổ sẽ mất nhóm này ngay khi đồng bộ.'))return;
    WK.cfg.promoGroups.splice(i,1);
    WK.save('xóa nhóm '+g.name);
  },
  saveGroup(i){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    const ta=document.getElementById('wkCond'+i);
    const nd=document.getElementById('wkNeed'+i);
    const tg=document.getElementById('wkTg'+i);
    // Bo o "Gioi han them" va o "Pham vi" (chot 06/09/2026): domain dung chung o tren
    // da quyet dinh extension chay o dau, va pham vi luon la CA TRANG.
    if(tg){
      const v=WK._tgOk(tg.value);
      // Link sai thi DUNG HAN, khong luu gi ca. Bo qua am tham thi nguoi nhap tuong
      // da xong, ca to bam nut khong ra gi ma khong ai biet tai sao.
      if(v===null){
        alert('Link Telegram không hợp lệ:\n\n'+tg.value.trim()+
              '\n\nChỉ nhận link bắt đầu bằng https://t.me/ hoặc tg://\n'+
              'Cách lấy: mở nhóm Telegram → tên nhóm → Invite Link / Link mời.\n\n'+
              'Chưa lưu gì cả — sửa lại rồi bấm Lưu.');
        tg.focus();return;
      }
      if(v)g.tg=v; else delete g.tg;
    }
    if(ta)g.conditions=ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(nd)g.needed=parseInt(nd.value,10)||1;
    WK._clamp(g);
    WK.save('cập nhật nhóm '+g.name+' ('+g.needed+'/'+g.conditions.length+' điều kiện)');
  },
  // Ô chọn ngưỡng đổi ngay khi gõ thêm/bớt dòng điều kiện, khỏi phải Lưu mới thấy
  syncNeed(i){
    const ta=document.getElementById('wkCond'+i),nd=document.getElementById('wkNeed'+i);
    if(!ta||!nd)return;
    const n=ta.value.split('\n').map(s=>s.trim()).filter(Boolean).length||1;
    const cur=Math.min(parseInt(nd.value,10)||1,n);
    nd.innerHTML=Array.from({length:n},(_,k)=>'<option value="'+(k+1)+'"'+((k+1)===cur?' selected':'')+'>'+(k+1)+'</option>').join('');
    const lb=document.getElementById('wkNeedTot'+i);
    if(lb)lb.textContent='/ '+n+' điều kiện';
  },
  setExtId(){
    if(!(CUR_PROFILE&&CUR_PROFILE.is_admin)){alert('Chỉ ADMIN đặt được mã extension.');return;}
    const v=prompt('Mã extension (Extension ID trong chrome://extensions):',WK.cfg.extId||'');
    if(v===null)return;
    WK.cfg.extId=v.trim();
    WK.save('đặt mã extension');
  },

  // Nạp nhóm điều kiện từ file Export sẵn có của extension — khỏi gõ lại từ đầu
  importFile(){
    if(!WK.canEdit())return;
    const inp=document.createElement('input');
    inp.type='file';inp.accept='.json';
    inp.onchange=e=>{
      const f=e.target.files&&e.target.files[0];if(!f)return;
      const r=new FileReader();
      r.onload=ev=>{
        try{
          const j=JSON.parse(ev.target.result);
          const arr=Array.isArray(j.promoGroups)?j.promoGroups:null;
          if(!arr||!arr.length){alert('File không có nhóm điều kiện nào.\n\nDùng file Export lấy từ extension Cảnh Báo NE.');return;}
          const clean=arr.map((g,k)=>{
            const conds=(Array.isArray(g.conditions)?g.conditions:[]).map(c=>String(c==null?'':c).trim()).filter(Boolean);
            const o={
              id:'p'+Date.now().toString(36)+k,
              name:String(g.name||'Nhóm '+(k+1)).slice(0,60),
              color:/^#[0-9a-fA-F]{6}$/.test(String(g.color||''))?g.color:WK.COLORS[k%WK.COLORS.length],
              conditions:conds,
              needed:parseInt(g.needed,10)||1,
              domains:(Array.isArray(g.domains)?g.domains:[]).map(d=>String(d).trim().toLowerCase()).filter(d=>/^[a-z0-9.-]+$/.test(d)),
              enabled:g.enabled!==false
            };
            // Link sai trong file thì BỎ link đó, vẫn nạp nhóm (khác lúc gõ tay:
            // ở đây không có ai đang ngồi sửa từng dòng để mà bắt dừng lại).
            const tg=WK._tgOk(g&&g.tg);
            if(tg)o.tg=tg;
            WK._clamp(o);return o;
          }).filter(g=>g.conditions.length);
          if(!clean.length){alert('Không nhóm nào có điều kiện hợp lệ.');return;}
          if(!confirm('Nạp '+clean.length+' nhóm điều kiện từ file?\n\nDanh sách hiện tại ('+WK.cfg.promoGroups.length+' nhóm) sẽ bị THAY THẾ.'))return;
          WK.cfg.promoGroups=clean;
          WK.save('nạp '+clean.length+' nhóm từ file');
        }catch(err){alert('Lỗi đọc file JSON');}
      };
      r.readAsText(f);
    };
    inp.click();
  },

  // ===== Giao diện =====
  statusHtml(){
    const m={
      ok:['var(--gr)','✓ Đã đẩy sang extension trên máy này'],
      fail:['var(--go)','⚠ Chưa thấy extension trên máy này — kiểm tra đã cài và bật chưa'],
      noid:['var(--mu2)','Chưa đặt mã extension'],
      nochrome:['var(--mu2)','Trình duyệt này không chạy được extension']
    }[WK._push]||['var(--mu2)','Chưa đẩy lần nào'];
    const t=WK._pushAt?new Date(WK._pushAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'';
    // Giờ tách sang span data-noi18n riêng: dính vào câu thì chuỗi không còn khớp
    // NGUYÊN VĂN khóa trong I18N.EN nữa và sẽ kẹt tiếng Việt khi bật EN.
    return '<span style="color:'+m[0]+';font-size:.68rem">'+hesc(m[1])+
           (t?'<span data-noi18n> · '+t+'</span>':'')+'</span>';
  },

  render(){
    const b=document.getElementById('wkBody');if(!b)return;
    if(WK.loading){b.innerHTML='<div class="chart-card" style="text-align:center;color:var(--mu)">Đang tải…</div>';return;}
    const ed=WK.canEdit();
    const gs=WK.cfg.promoGroups;

    let h='<div class="chart-card" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px">'+
      '<span style="font-size:.72rem;color:var(--tx);font-weight:700">'+gs.length+' nhóm điều kiện</span>'+
      '<span style="flex:1"></span>'+WK.statusHtml()+
      '<button class="abtn abtn-sm abtn-ghost" onclick="WK.push()">⟳ Đẩy lại</button>'+
      (CUR_PROFILE&&CUR_PROFILE.is_admin?'<button class="abtn abtn-sm abtn-ghost" onclick="WK.setExtId()">Mã extension</button>':'')+
      (ed?'<button class="abtn abtn-sm abtn-ghost" onclick="WK.importFile()">⬆ Nạp từ file</button>'+
          '<button class="abtn abtn-sm abtn-pu" onclick="WK.addTopic()">+ Thêm chủ đề</button>':'')+
      '</div>';

    // Khối CÀI EXTENSION — mọi vai trò đều thấy, vì ai cũng phải tự cài trên máy mình.
    // ⚠ Phát hành bằng ZIP + "Tải tiện ích đã giải nén", KHÔNG phải .crx: Chrome chặn
    // cài .crx ngoài Web Store trên máy thường (CRX_REQUIRED_PROOF_MISSING), mà ép cài
    // bằng chính sách thì đòi máy phải thuộc doanh nghiệp được quản lý (đã thử 08/09/2026).
    h+='<div class="chart-card" style="margin-bottom:14px">'+
       '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:8px">'+
         '<span style="font-size:.76rem;font-weight:700;color:var(--tx)">Cài extension trên máy</span>'+
         '<span style="font-size:.62rem;color:var(--mu)">bản '+hesc(WK.EXT_VER)+' · làm một lần cho mỗi máy</span>'+
         '<span style="flex:1"></span>'+
         '<a class="abtn abtn-sm abtn-pu" href="'+WK.EXT_ZIP+'" download data-noi18n>⬇ Tải Cảnh Báo NE</a>'+
       '</div>'+
       '<div style="font-size:.66rem;color:var(--mu);line-height:2">'+
         '<b style="color:var(--tx)">1.</b> Bấm nút trên để tải file nén về máy.<br>'+
         '<b style="color:var(--tx)">2.</b> Giải nén ra một thư mục <b>cố định</b>, ví dụ ổ C — '+
           '<b style="color:var(--go)">xoá thư mục này là extension mất</b>, nên đừng để trong Downloads.<br>'+
         '<b style="color:var(--tx)">3.</b> Mở Chrome, gõ <code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:0 5px" data-noi18n>chrome://extensions</code> '+
           'rồi bật <b>Chế độ nhà phát triển</b> ở góc trên bên phải.<br>'+
         '<b style="color:var(--tx)">4.</b> Bấm <b>Tải tiện ích đã giải nén</b> và chọn thư mục vừa giải nén.<br>'+
         '<b style="color:var(--tx)">5.</b> Vào <code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:0 5px" data-noi18n>chrome://extensions/shortcuts</code> '+
           'gán phím <b>Alt+Q</b> cho “Mở Cảnh Báo NE”.<br>'+
         '<b style="color:var(--tx)">6.</b> Đang cài bản cũ thì gỡ nó trong <code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:0 5px" data-noi18n>chrome://extensions</code>, '+
           '<b style="color:var(--go)">xoá luôn thư mục cũ</b>, rồi làm lại từ bước 2. '+
           '<b style="color:var(--re)">Đừng giải nén đè lên thư mục cũ</b> — Windows sẽ bỏ qua cả thư mục con, '+
           'extension chạy nửa cũ nửa mới mà không báo lỗi gì.'+
       '</div>'+
       '</div>';

    // Danh sách domain hậu đài — quyết định extension CHẠY Ở ĐÂU.
    // Không khai trong manifest nữa: background.js đăng ký content script lúc chạy
    // theo danh sách này, nên thêm bao nhiêu domain cũng được, đổi lúc nào cũng được,
    // KHÔNG phải đóng gói lại .crx rồi đi cập nhật từng máy.
    h+='<div class="chart-card" style="margin-bottom:14px">'+
       '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-bottom:8px">'+
         '<span style="font-size:.76rem;font-weight:700;color:var(--tx)">Trang hậu đài</span>'+
         '<span style="font-size:.62rem;color:var(--mu)">'+WK.cfg.domains.length+' domain · extension CHỈ chạy trên các trang này</span>'+
         '<span style="flex:1"></span>'+
         (WK._savedAt?'<span style="font-size:.64rem;color:var(--gr)">✓ Đã lưu<span data-noi18n> '+
            new Date(WK._savedAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})+'</span></span>':'')+
         (ed?'<button class="abtn abtn-sm abtn-ok" onclick="WK.saveDomains()">Lưu danh sách</button>':'')+
       '</div>'+
       '<textarea id="wkDomains" data-noi18n '+(ed?'':'readonly')+
         ' placeholder="mỗi dòng một domain — dán thẳng URL cũng được"'+
         ' style="width:100%;min-height:64px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:8px 10px;font-size:.72rem;font-family:ui-monospace,monospace;resize:vertical">'+
         hesc(WK.cfg.domains.join('\n'))+'</textarea>'+
       '<div style="font-size:.62rem;color:var(--mu);margin-top:6px;line-height:1.8">'+
         'Dán nguyên địa chỉ trên thanh trình duyệt cũng được — hệ thống tự cắt lấy phần domain. '+
         'Dùng <code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:0 5px" data-noi18n>*.tencongty.com</code> để phủ mọi subdomain, tiện khi hậu đài hay đổi domain.'+
       '</div>'+
       '</div>';

    // Bảng cú pháp — người soạn không phải nhớ, và nó khớp đúng content.js
    h+='<div class="chart-card" style="margin-bottom:14px;font-size:.68rem;color:var(--mu);line-height:1.9">'+
       '<b style="color:var(--tx)">Cách viết điều kiện</b> — mỗi dòng một điều kiện. Đủ số điều kiện đã đặt ở BẤT KỲ đâu trong trang là tô.<br>'+
       '<code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px" data-noi18n>100 ~ 500</code> — trong hàng có SỐ nằm trong khoảng<br>'+
       '<code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px" data-noi18n>agribank, acb</code> — trúng BẤT KỲ từ nào trong danh sách<br>'+
       '<code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px" data-noi18n>【NTK-TBA】</code> — hàng có chứa chuỗi này'+
       '</div>';

    if(!gs.length&&!WK.cfg.topics.length){
      h+='<div class="chart-card" style="text-align:center;color:var(--mu);padding:26px">'+
         'Chưa có chủ đề nào.'+(ed?' Bấm “+ Thêm chủ đề” để bắt đầu, hoặc “⬆ Nạp từ file” nếu đã có sẵn trên máy nhân viên.':'')+'</div>';
      b.innerHTML=h;return;
    }

    // Mỗi CHỦ ĐỀ là một khối, các nhóm của nó nằm LỒNG BÊN TRONG. Trước đây chủ đề
    // nằm một thẻ riêng còn nhóm liệt kê phẳng bên dưới -> nhìn không ra nhóm nào
    // thuộc chủ đề nào (user chê 06/09/2026).
    const groupCard=(g,i)=>{
      const on=g.enabled!==false;
      const conds=(g.conditions||[]).filter(c=>String(c).trim());
      const nTot=conds.length||1;
      const need=Math.min(g.needed||1,nTot);
      return '<div style="background:var(--card2);border:1px solid var(--border2);border-radius:9px;padding:12px 14px;margin-top:10px;border-left:4px solid '+hesc(g.color||'#f97316')+(on?'':';opacity:.55')+'">'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-bottom:10px">'+
          '<span style="font-size:.86rem;font-weight:700;color:var(--tx)" data-noi18n>'+hesc(g.name)+'</span>'+
          '<span style="font-size:.62rem;color:var(--mu)">cần đủ '+need+'/'+nTot+' điều kiện '+
            'trong cả trang</span>'+
          '<span style="flex:1"></span>'+
          (ed?
            WK.COLORS.map(c=>'<span onclick="WK.setColor('+i+',\''+c+'\')" title="Đổi màu" style="width:15px;height:15px;border-radius:4px;background:'+c+';cursor:pointer;display:inline-block;border:2px solid '+(g.color===c?'var(--tx)':'transparent')+'"></span>').join('')+
            '<button class="abtn abtn-sm abtn-ghost" onclick="WK.renameGroup('+i+')">✎ Tên</button>'+
            '<button class="abtn abtn-sm '+(on?'abtn-ghost':'abtn-ok')+'" onclick="WK.toggleGroup('+i+')">'+(on?'Tắt':'Bật')+'</button>'+
            '<button class="abtn abtn-sm abtn-danger" onclick="WK.delGroup('+i+')">Xóa</button>'
          :'')+
        '</div>'+
        '<label style="display:block;font-size:.62rem;color:var(--mu);margin-bottom:4px">Điều kiện — mỗi dòng một điều kiện</label>'+
        '<textarea id="wkCond'+i+'" data-noi18n '+(ed?'oninput="WK.syncNeed('+i+')"':'readonly')+
          ' style="width:100%;min-height:86px;background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:8px 10px;font-size:.72rem;font-family:ui-monospace,monospace;resize:vertical">'+
          hesc(conds.join('\n'))+'</textarea>'+
        // Link nhóm Telegram: nhóm này trúng thì ô cảnh báo hiện thêm một dòng
        // "Mở nhóm Telegram" để nhân viên bấm thẳng sang nhóm chứa thông tin lạm
        // dụng, khỏi ngồi mò xem loại này thuộc nhóm nào. Bỏ trống = không hiện dòng đó.
        '<label style="display:block;font-size:.62rem;color:var(--mu);margin:8px 0 4px">'+
          'Link nhóm Telegram — bỏ trống thì ô cảnh báo không hiện nút</label>'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<input id="wkTg'+i+'" type="text" '+(ed?'':'readonly')+' data-noi18n'+
            ' placeholder="https://t.me/..." value="'+hesc(g.tg||'')+'"'+
            ' style="flex:1;min-width:0;background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:7px 10px;font-size:.68rem;font-family:ui-monospace,monospace">'+
          (g.tg?'<a class="abtn abtn-sm abtn-ghost" href="'+hesc(g.tg)+'" target="_blank" rel="noopener noreferrer" data-noi18n>Thử mở</a>':'')+
        '</div>'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px">'+
          '<label style="font-size:.62rem;color:var(--mu)">Cần đủ</label>'+
          '<select id="wkNeed'+i+'" '+(ed?'':'disabled')+' style="background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:5px 8px;font-size:.68rem">'+
            Array.from({length:nTot},(_,k)=>'<option value="'+(k+1)+'"'+((k+1)===need?' selected':'')+'>'+(k+1)+'</option>').join('')+
          '</select>'+
          '<span id="wkNeedTot'+i+'" style="font-size:.62rem;color:var(--mu)">/ '+nTot+' điều kiện, tính trên cả trang</span>'+
          '<label style="font-size:.62rem;color:var(--mu);margin-left:8px">Chuyển sang chủ đề</label>'+
          '<select '+(ed?'onchange="WK.setGroupTopic('+i+',this.value)"':'disabled')+
            ' style="background:var(--card);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:5px 8px;font-size:.68rem">'+
            '<option value=""'+(g.topicId?'':' selected')+'>— không —</option>'+
            WK.cfg.topics.map(t=>'<option value="'+hesc(t.id)+'"'+(g.topicId===t.id?' selected':'')+' data-noi18n>'+hesc(t.name)+'</option>').join('')+
          '</select>'+
          '<span style="flex:1"></span>'+
          (ed?'<button class="abtn abtn-sm abtn-ok" onclick="WK.saveGroup('+i+')">Lưu nhóm này</button>':'')+
        '</div>'+
      '</div>';
    };

    // Từng CHỦ ĐỀ: tiêu đề + lời nhắc + các nhóm của nó nằm bên trong
    WK.cfg.topics.forEach((t,ti)=>{
      const mine=gs.map((g,i)=>({g,i})).filter(x=>x.g.topicId===t.id);
      h+='<div class="chart-card" style="margin-bottom:14px;border-left:4px solid var(--re)">'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px">'+
          '<span style="font-size:.9rem;font-weight:700;color:var(--tx);letter-spacing:.03em" data-noi18n>'+hesc(t.name)+'</span>'+
          '<span style="font-size:.62rem;color:var(--mu)">'+mine.length+' nhóm</span>'+
          '<span style="flex:1"></span>'+
          (ed?'<button class="abtn abtn-sm abtn-ghost" onclick="WK.editTopic('+ti+')">✎ Tên</button>'+
              '<button class="abtn abtn-sm abtn-pu" onclick="WK.addGroup(\''+hesc(t.id)+'\')">+ Thêm nhóm</button>'+
              '<button class="abtn abtn-sm abtn-danger" onclick="WK.delTopic('+ti+')">Xóa chủ đề</button>':'')+
        '</div>'+
        '<label style="display:block;font-size:.62rem;color:var(--mu);margin:10px 0 4px">Lời nhắc — hiện TO và ĐỎ trong ô cảnh báo khi nhóm bất kỳ của chủ đề này trùng</label>'+
        '<textarea id="wkTn'+ti+'" data-noi18n '+(ed?'':'readonly')+
          ' placeholder="VD: Trùng Lạm Dụng IP — cần kiểm tra IP kỹ"'+
          ' style="width:100%;min-height:44px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--re);font-weight:700;padding:7px 10px;font-size:.74rem;font-family:inherit;resize:vertical">'+
          hesc(t.note||'')+'</textarea>'+
        // Bản tiếng Anh của lời nhắc — cho nhân viên nước ngoài. Đây là chữ NGHIỆP VỤ
        // do Tổ Trưởng soạn nên KHÔNG dịch máy được; phải tự nhập, đúng cách T4/T5
        // đang làm (cột en_*). Bỏ trống thì ô cảnh báo bản EN rơi về tiếng Việt —
        // thà đọc tiếng Việt còn hơn mất hẳn dòng cảnh báo.
        '<label style="display:block;font-size:.62rem;color:var(--mu);margin:8px 0 4px">'+
          'Lời nhắc tiếng Anh — bỏ trống thì nhân viên bật EN vẫn thấy dòng tiếng Việt ở trên</label>'+
        '<textarea id="wkTe'+ti+'" data-noi18n '+(ed?'':'readonly')+
          ' placeholder="e.g. Duplicate abuse IP — check the IP carefully"'+
          ' style="width:100%;min-height:44px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--re);font-weight:700;padding:7px 10px;font-size:.74rem;font-family:inherit;resize:vertical">'+
          hesc(t.en_note||'')+'</textarea>'+
        (ed?'<div style="text-align:right;margin-top:6px"><button class="abtn abtn-sm abtn-ok" onclick="WK.saveTopicNote('+ti+')">Lưu lời nhắc</button></div>':'')+
        (mine.length?mine.map(x=>groupCard(x.g,x.i)).join('')
          :'<div style="font-size:.66rem;color:var(--mu);text-align:center;padding:14px 0 4px">Chủ đề này chưa có nhóm nào.</div>')+
      '</div>';
    });

    // Nhóm chưa gán chủ đề — vẫn tô bình thường, chỉ là không có lời nhắc
    const orphan=gs.map((g,i)=>({g,i})).filter(x=>!WK.cfg.topics.some(t=>t.id===x.g.topicId));
    if(orphan.length){
      h+='<div class="chart-card" style="margin-bottom:14px;border-left:4px solid var(--mu2)">'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px">'+
          '<span style="font-size:.9rem;font-weight:700;color:var(--mu)">Chưa thuộc chủ đề nào</span>'+
          '<span style="font-size:.62rem;color:var(--mu)">'+orphan.length+' nhóm · vẫn tô bình thường, chỉ là không có lời nhắc</span>'+
        '</div>'+
        orphan.map(x=>groupCard(x.g,x.i)).join('')+
      '</div>';
    }

    if(!ed)h+='<div style="font-size:.66rem;color:var(--mu);text-align:center;padding:6px">Bạn có quyền XEM. Sửa nhóm điều kiện: ADMIN hoặc Tổ Trưởng.</div>';
    h+='<div style="font-size:.62rem;color:var(--mu2);text-align:center;padding:10px 6px 2px">Nhóm TỪ KHÓA trong extension do nhân viên tự quản lý — hệ thống không đụng tới.</div>';
    b.innerHTML=h;
  }
};
// Phơi ra window: `const WK={}` nằm ở global LEXICAL scope, không tự có trên window
// (cùng bẫy với AUTH/SOP/EX). switchRp trong bc.js kiểm `window.WK`.
window.WK=WK;
