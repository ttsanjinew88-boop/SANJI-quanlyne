// ============================================================
// TỪ KHÓA CẢNH BÁO (module WK) — tab nhỏ thứ 3 của T23
//
// Nguồn sự thật: reports type='warnkw' month='all' = {groups:[...], extId:'...'}.
// Bảng warnkw_pulse CHỈ chứa một số phiên bản, dùng làm "chuông cửa" Realtime.
//
// Vì sao KHÔNG bật Realtime thẳng trên `reports`: bảng đó chứa dataset don/km cả
// tháng (hàng trăm KB mỗi dòng) -> mỗi lần ai upload Excel là cả dòng bay qua
// WebSocket tới mọi dashboard đang mở. Xem ghi chú trong supabase_warnkw_setup.sql.
//
// Đường đi của một lần sửa:
//   TT bấm Lưu -> ghi reports + tăng số ở warnkw_pulse
//   -> Realtime báo cho MỌI dashboard đang mở (nhân viên mở suốt ca)
//   -> mỗi dashboard tự đọc lại bộ từ khóa và đẩy sang extension trên MÁY ĐÓ
//      qua chrome.runtime.sendMessage (manifest khai externally_connectable).
// Nhờ vậy extension không cần mật khẩu, token hay mã thiết bị nào.
//
// ⚠ CHỈ ĐẨY DỮ LIỆU (tên/màu/từ khóa/domain). Không bao giờ đẩy CSS thô hay mã để
//   chạy — extension chạy trên máy nhân viên, ranh giới này phải giữ tuyệt đối.
// ============================================================
const WK={
  cfg:{groups:[],extId:''},
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
        WK.cfg.groups=Array.isArray(d.groups)?d.groups:[];
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

  // Có người sửa từ khóa ở máy khác -> đọc lại rồi đẩy sang extension của MÁY NÀY
  async onPulse(){
    try{
      const d=await SB.loadReport('warnkw','all');
      if(d&&typeof d==='object'){
        WK.cfg.groups=Array.isArray(d.groups)?d.groups:[];
        WK.cfg.extId=String(d.extId||WK.cfg.extId||'');
      }
      WK.push();
      if(WK.visible())WK.render();
    }catch(e){console.error('WK.onPulse',e);}
  },

  async save(label){
    if(!WK.canEdit()){alert('Chỉ ADMIN / Tổ Trưởng được sửa từ khóa cảnh báo.');return;}
    try{
      await SB.saveReport('warnkw','all',{groups:WK.cfg.groups,extId:WK.cfg.extId});
      // Bấm chuông: mọi dashboard đang mở nhận trong dưới 1 giây
      await SB.client().from('warnkw_pulse').update({v:Date.now(),at:new Date().toISOString()}).eq('id',1);
      if(typeof logAction==='function')logAction('TỪ KHÓA CẢNH BÁO',label||'cập nhật');
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
      chrome.runtime.sendMessage(id,{type:'SANJI_SYNC',groups:WK.cfg.groups},()=>{
        WK._push=(chrome.runtime.lastError)?'fail':'ok';
        WK._pushAt=Date.now();
        if(WK.visible())WK.render();
      });
    }catch(e){WK._push='fail';}
  },

  shown(){ if(!WK.booted)WK.boot(); else WK.render(); },

  // ===== Thao tác trên nhóm =====
  _g(i){return WK.cfg.groups[i];},
  addGroup(){
    if(!WK.canEdit())return;
    const name=prompt('Tên nhóm mới (chữ này sẽ hiện trong ô cảnh báo: "Trùng ‹tên nhóm›"):');
    if(!name||!name.trim())return;
    WK.cfg.groups.push({
      id:'g'+Date.now().toString(36),
      name:name.trim(),
      color:WK.COLORS[WK.cfg.groups.length%WK.COLORS.length],
      keywords:[],domains:[],enabled:true
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
    WK.cfg.groups.splice(i,1);
    WK.save('xóa nhóm '+g.name);
  },
  saveKw(i){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    const ta=document.getElementById('wkKw'+i);if(!ta)return;
    // Ngăn cách bằng xuống dòng HOẶC dấu phẩy; bỏ rỗng và trùng (không phân biệt hoa thường)
    const seen=new Set();
    g.keywords=ta.value.split(/[\n,]/).map(s=>s.trim()).filter(s=>{
      if(!s)return false;
      const k=s.toLowerCase();
      if(seen.has(k))return false;
      seen.add(k);return true;
    });
    WK.save('cập nhật từ khóa nhóm '+g.name+' ('+g.keywords.length+' từ)');
  },
  saveDomains(i){
    if(!WK.canEdit())return;
    const g=WK._g(i);if(!g)return;
    const inp=document.getElementById('wkDm'+i);if(!inp)return;
    g.domains=inp.value.split(/[\n,\s]+/).map(s=>s.trim().toLowerCase())
      .filter(s=>/^[a-z0-9.-]+$/.test(s));
    WK.save('cập nhật domain nhóm '+g.name);
  },
  setExtId(){
    if(!(CUR_PROFILE&&CUR_PROFILE.is_admin)){alert('Chỉ ADMIN đặt được mã extension.');return;}
    const v=prompt('Mã extension (Extension ID trong chrome://extensions):',WK.cfg.extId||'');
    if(v===null)return;
    WK.cfg.extId=v.trim();
    WK.save('đặt mã extension');
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
    const totalKw=WK.cfg.groups.reduce((n,g)=>n+(g.keywords||[]).length,0);

    let h='<div class="chart-card" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px">'+
      '<span style="font-size:.72rem;color:var(--tx);font-weight:700">'+WK.cfg.groups.length+' nhóm · '+totalKw+' từ khóa</span>'+
      '<span style="flex:1"></span>'+WK.statusHtml()+
      '<button class="abtn abtn-sm abtn-ghost" onclick="WK.push()">⟳ Đẩy lại</button>'+
      (CUR_PROFILE&&CUR_PROFILE.is_admin?'<button class="abtn abtn-sm abtn-ghost" onclick="WK.setExtId()">Mã extension</button>':'')+
      (ed?'<button class="abtn abtn-sm abtn-pu" onclick="WK.addGroup()">+ Thêm nhóm</button>':'')+
      '</div>';

    if(!WK.cfg.groups.length){
      h+='<div class="chart-card" style="text-align:center;color:var(--mu);padding:26px">'+
         'Chưa có nhóm nào.'+(ed?' Bấm “+ Thêm nhóm” để bắt đầu.':'')+'</div>';
      b.innerHTML=h;return;
    }

    WK.cfg.groups.forEach((g,i)=>{
      const on=g.enabled!==false;
      h+='<div class="chart-card" style="margin-bottom:12px;border-left:4px solid '+hesc(g.color||'#ef4444')+(on?'':';opacity:.55')+'">'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-bottom:10px">'+
          '<span style="font-size:.86rem;font-weight:700;color:var(--tx)" data-noi18n>'+hesc(g.name)+'</span>'+
          '<span style="font-size:.62rem;color:var(--mu)">'+(g.keywords||[]).length+' từ · '+
            ((g.domains||[]).length?hesc((g.domains||[]).join(', ')):'mọi trang đã cho phép')+'</span>'+
          '<span style="flex:1"></span>'+
          (ed?
            WK.COLORS.map(c=>'<span onclick="WK.setColor('+i+',\''+c+'\')" title="Đổi màu" style="width:15px;height:15px;border-radius:4px;background:'+c+';cursor:pointer;display:inline-block;border:2px solid '+(g.color===c?'var(--tx)':'transparent')+'"></span>').join('')+
            '<button class="abtn abtn-sm abtn-ghost" onclick="WK.renameGroup('+i+')">✎ Tên</button>'+
            '<button class="abtn abtn-sm '+(on?'abtn-ghost':'abtn-ok')+'" onclick="WK.toggleGroup('+i+')">'+(on?'Tắt':'Bật')+'</button>'+
            '<button class="abtn abtn-sm abtn-danger" onclick="WK.delGroup('+i+')">Xóa</button>'
          :'')+
        '</div>'+
        '<label style="display:block;font-size:.62rem;color:var(--mu);margin-bottom:4px">Từ khóa — mỗi dòng một từ, hoặc ngăn bằng dấu phẩy</label>'+
        '<textarea id="wkKw'+i+'" data-noi18n '+(ed?'':'readonly')+
          ' style="width:100%;min-height:78px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:8px 10px;font-size:.72rem;font-family:inherit;resize:vertical">'+
          hesc((g.keywords||[]).join('\n'))+'</textarea>'+
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px">'+
          '<label style="font-size:.62rem;color:var(--mu)">Chỉ tô trên domain</label>'+
          // KHÔNG gắn data-noi18n ở đây: giá trị domain nằm trong thuộc tính `value`
          // (i18n không đụng tới), còn placeholder thì CẦN được dịch.
          '<input id="wkDm'+i+'" '+(ed?'':'readonly')+' value="'+hesc((g.domains||[]).join(', '))+'"'+
            ' placeholder="để trống = mọi trang extension được phép chạy"'+
            ' style="flex:1;min-width:200px;background:var(--card2);border:1px solid var(--border2);border-radius:8px;color:var(--tx);padding:6px 10px;font-size:.68rem">'+
          (ed?'<button class="abtn abtn-sm abtn-ok" onclick="WK.saveKw('+i+');WK.saveDomains('+i+')">Lưu nhóm này</button>':'')+
        '</div>'+
      '</div>';
    });

    if(!ed)h+='<div style="font-size:.66rem;color:var(--mu);text-align:center;padding:6px">Bạn có quyền XEM. Sửa từ khóa: ADMIN hoặc Tổ Trưởng.</div>';
    b.innerHTML=h;
  }
};
// Phơi ra window: `const WK={}` nằm ở global LEXICAL scope, không tự có trên window
// (cùng bẫy với AUTH/SOP/EX). switchRp trong bc.js kiểm `window.WK`.
window.WK=WK;
