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
//   100 ~ 500        -> trong hàng có SỐ nằm trong khoảng
//   agribank, acb    -> trúng BẤT KỲ từ nào trong danh sách
//   【NTK-TBA】       -> hàng có chứa chuỗi này
// Hàng của bảng phải đủ `needed` điều kiện thì mới được tô.
// ============================================================
const WK={
  cfg:{promoGroups:[],extId:''},
  booted:false, loading:false, _ch:null,
  _push:'', _pushAt:0,

  COLORS:['#ef4444','#f97316','#f59e0b','#22c55e','#06b6d4','#3b82f6','#7c3aed','#ec4899'],

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
        WK.cfg.extId=String(d.extId||WK.cfg.extId||'');
      }
      WK.push();
      if(WK.visible())WK.render();
    }catch(e){console.error('WK.onPulse',e);}
  },

  async save(label){
    if(!WK.canEdit()){alert('Chỉ ADMIN / Tổ Trưởng được sửa nhóm điều kiện.');return;}
    try{
      await SB.saveReport('warnkw','all',{promoGroups:WK.cfg.promoGroups,extId:WK.cfg.extId});
      // Bấm chuông: mọi dashboard đang mở nhận trong dưới 1 giây
      await SB.client().from('warnkw_pulse').update({v:Date.now(),at:new Date().toISOString()}).eq('id',1);
      if(typeof logAction==='function')logAction('NHÓM ĐIỀU KIỆN',label||'cập nhật');
      WK.push();
      WK.render();
    }catch(e){
      console.error('WK.save',e);
      alert('Lỗi lưu: '+(e.message||e)+'\n\nNếu báo thiếu quyền: chạy supabase_warnkw_setup.sql.');
    }
  },

  // ===== Đẩy sang extension trên máy này =====
  push(){
    const id=String(WK.cfg.extId||'').trim();
    if(!id){WK._push='noid';return;}
    if(typeof chrome==='undefined'||!chrome.runtime||!chrome.runtime.sendMessage){WK._push='nochrome';return;}
    try{
      chrome.runtime.sendMessage(id,{type:'SANJI_SYNC',promoGroups:WK.cfg.promoGroups},()=>{
        WK._push=(chrome.runtime.lastError)?'fail':'ok';
        WK._pushAt=Date.now();
        if(WK.visible())WK.render();
      });
    }catch(e){WK._push='fail';}
  },

  shown(){ if(!WK.booted)WK.boot(); else WK.render(); },

  // ===== Thao tác =====
  _g(i){return WK.cfg.promoGroups[i];},
  // Ngưỡng không được vượt số điều kiện thật, nếu không nhóm KHÔNG BAO GIỜ tô
  _clamp(g){
    const n=(g.conditions||[]).filter(c=>String(c).trim()).length;
    if(!g.needed||g.needed<1)g.needed=1;
    if(g.needed>n)g.needed=n||1;
  },
  addGroup(){
    if(!WK.canEdit())return;
    const name=prompt('Tên nhóm điều kiện (chữ này hiện trong ô cảnh báo: "Trùng ‹tên nhóm›"):');
    if(!name||!name.trim())return;
    WK.cfg.promoGroups.push({
      id:'p'+Date.now().toString(36),
      name:name.trim(),
      color:WK.COLORS[WK.cfg.promoGroups.length%WK.COLORS.length],
      conditions:[],needed:1,domains:[],enabled:true
    });
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
    const dm=document.getElementById('wkDm'+i);
    if(ta)g.conditions=ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(nd)g.needed=parseInt(nd.value,10)||1;
    if(dm)g.domains=dm.value.split(/[\n,\s]+/).map(s=>s.trim().toLowerCase())
      .filter(s=>/^[a-z0-9.-]+$/.test(s));
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
          '<button class="abtn abtn-sm abtn-pu" onclick="WK.addGroup()">+ Thêm nhóm</button>':'')+
      '</div>';

    // Bảng cú pháp — người soạn không phải nhớ, và nó khớp đúng content.js
    h+='<div class="chart-card" style="margin-bottom:14px;font-size:.68rem;color:var(--mu);line-height:1.9">'+
       '<b style="color:var(--tx)">Cách viết điều kiện</b> — mỗi dòng một điều kiện, hàng của bảng phải đủ số điều kiện đã đặt thì mới được tô.<br>'+
       '<code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px" data-noi18n>100 ~ 500</code> — trong hàng có SỐ nằm trong khoảng<br>'+
       '<code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px" data-noi18n>agribank, acb</code> — trúng BẤT KỲ từ nào trong danh sách<br>'+
       '<code style="background:var(--card2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px" data-noi18n>【NTK-TBA】</code> — hàng có chứa chuỗi này'+
       '</div>';

    if(!gs.length){
      h+='<div class="chart-card" style="text-align:center;color:var(--mu);padding:26px">'+
         'Chưa có nhóm điều kiện nào.'+(ed?' Bấm “+ Thêm nhóm”, hoặc “⬆ Nạp từ file” nếu đã có sẵn trên máy nhân viên.':'')+'</div>';
      b.innerHTML=h;return;
    }

    gs.forEach((g,i)=>{
      const on=g.enabled!==false;
      const conds=(g.conditions||[]).filter(c=>String(c).trim());
      const nTot=conds.length||1;
      const need=Math.min(g.needed||1,nTot);
      h+='<div class="chart-card" style="margin-bottom:12px;border-left:4px solid '+hesc(g.color||'#f97316')+(on?'':';opacity:.55')+'">'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-bottom:10px">'+
          '<span style="font-size:.86rem;font-weight:700;color:var(--tx)" data-noi18n>'+hesc(g.name)+'</span>'+
          '<span style="font-size:.62rem;color:var(--mu)">cần đủ '+need+'/'+nTot+' điều kiện · '+
            ((g.domains||[]).length?hesc((g.domains||[]).join(', ')):'mọi trang đã cho phép')+'</span>'+
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
          ' style="width:100%;min-height:86px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:8px 10px;font-size:.72rem;font-family:ui-monospace,monospace;resize:vertical">'+
          hesc(conds.join('\n'))+'</textarea>'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px">'+
          '<label style="font-size:.62rem;color:var(--mu)">Cần đủ</label>'+
          '<select id="wkNeed'+i+'" '+(ed?'':'disabled')+' style="background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:5px 8px;font-size:.68rem">'+
            Array.from({length:nTot},(_,k)=>'<option value="'+(k+1)+'"'+((k+1)===need?' selected':'')+'>'+(k+1)+'</option>').join('')+
          '</select>'+
          '<span id="wkNeedTot'+i+'" style="font-size:.62rem;color:var(--mu)">/ '+nTot+' điều kiện</span>'+
          '<label style="font-size:.62rem;color:var(--mu);margin-left:8px">Chỉ tô trên domain</label>'+
          '<input id="wkDm'+i+'" '+(ed?'':'readonly')+' value="'+hesc((g.domains||[]).join(', '))+'"'+
            ' placeholder="để trống = mọi trang extension được phép chạy"'+
            ' style="flex:1;min-width:180px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:6px 10px;font-size:.68rem">'+
          (ed?'<button class="abtn abtn-sm abtn-ok" onclick="WK.saveGroup('+i+')">Lưu nhóm này</button>':'')+
        '</div>'+
      '</div>';
    });

    if(!ed)h+='<div style="font-size:.66rem;color:var(--mu);text-align:center;padding:6px">Bạn có quyền XEM. Sửa nhóm điều kiện: ADMIN hoặc Tổ Trưởng.</div>';
    h+='<div style="font-size:.62rem;color:var(--mu2);text-align:center;padding:10px 6px 2px">Nhóm TỪ KHÓA trong extension do nhân viên tự quản lý — hệ thống không đụng tới.</div>';
    b.innerHTML=h;
  }
};
// Phơi ra window: `const WK={}` nằm ở global LEXICAL scope, không tự có trên window
// (cùng bẫy với AUTH/SOP/EX). switchRp trong bc.js kiểm `window.WK`.
window.WK=WK;
