// ===== T4 — QUY TRÌNH CÔNG VIỆC (SOP) =====
// 4 tab nhỏ dùng CHUNG một bộ khối nội dung: qt (quy trình duyệt đơn) · ld (nhóm lạm dụng)
// · game (trò chơi lạm dụng) · doc (lưu trình công việc).
// Lưu CLOUD (khác NTK/DR vốn session-only): bảng `reports`
//   - type 'sop_index' month 'all'      -> mục lục 4 tab {tab:[{gid,gname,items:[{id,name,level}]}]}
//   - type 'sop_item'  month <id mục>   -> nội dung 1 mục (tách nhỏ để mở mục nào tải mục đó)
// Ảnh: Supabase Storage bucket 'quytrinh' (PRIVATE) -> hiển thị bằng signed URL có hạn.
// Quyền: TẠM THỜI chỉ ADMIN (xem + sửa) — gate ở applyPerms (#tsb4) và SOP.canEdit().
// Song ngữ: nhãn giao diện dịch qua I18N; nội dung người dùng gõ gắn data-noi18n (giữ tiếng Việt),
// mỗi chuỗi có sẵn chỗ chứa bản dịch `en` + dấu vết `envi` -> Xuất/Nhập JSON để dịch một lượt.
const SOP={
  BUCKET:'quytrinh',
  TABS:[
    {k:'qt',  label:'Quy Trình Duyệt Đơn', unit:'Chủ đề',  subs:'step', subName:'Bước'},
    {k:'ld',  label:'Nhóm Lạm Dụng',       unit:'Dấu hiệu',subs:'',     subName:''},
    {k:'game',label:'Trò Chơi Lạm Dụng',   unit:'Sảnh',    subs:'acc',  subName:'Trò chơi'},
    {k:'doc', label:'Lưu Trình Công Việc', unit:'Mục',     subs:'',     subName:''}
  ],
  LEVELS:{hi:'Nguy hiểm cao',go:'Trung bình',mu:'Theo dõi'},
  GLEVELS:{hi:'Cấm cược',go:'Hạn chế',mu:'Theo dõi'},
  view:'qt', idx:null, cur:null, curId:'', curSub:0, edit:false,
  booted:false, _urls:{}, _imgTarget:null, _blkEdit:null,

  canEdit(){return !!(CUR_PROFILE&&CUR_PROFILE.is_admin);},
  tabDef(k){return SOP.TABS.find(t=>t.k===(k||SOP.view));},
  uid(p){return p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);},

  // ---------- NẠP / LƯU ----------
  async boot(){
    if(SOP.booted)return;SOP.booted=true;
    try{
      SOP.idx=await SB.loadReport('sop_index','all');
    }catch(e){console.error('SOP index',e);}
    if(!SOP.idx||!SOP.idx.tabs)SOP.idx={v:1,tabs:{qt:[],ld:[],game:[],doc:[]}};
    SOP.TABS.forEach(t=>{if(!Array.isArray(SOP.idx.tabs[t.k]))SOP.idx.tabs[t.k]=[];});
    SOP.renderTabs();
    await SOP.openFirst();
  },
  async saveIndex(){
    try{await SB.saveReport('sop_index','all',SOP.idx);SOP.flash();}
    catch(e){SOP.dlg({title:'Lỗi lưu mục lục',msg:String(e.message||e),okText:'Đã hiểu'});}
  },
  async saveItem(){
    if(!SOP.cur)return;
    try{await SB.saveReport('sop_item',SOP.curId,SOP.cur);SOP.flash();}
    catch(e){SOP.dlg({title:'Lỗi lưu nội dung',msg:String(e.message||e),okText:'Đã hiểu'});}
  },
  flash(){
    const el=document.getElementById('sopSaved');if(!el)return;
    el.textContent='✓ Đã lưu';el.style.opacity='1';
    clearTimeout(SOP._ft);SOP._ft=setTimeout(()=>{el.style.opacity='.45';},1800);
  },
  groups(){return SOP.idx.tabs[SOP.view]||[];},
  findItem(id){
    for(const g of SOP.groups()){const it=(g.items||[]).find(x=>x.id===id);if(it)return{g,it};}
    return null;
  },
  // tìm trong CẢ 4 tab (dùng khi nhập bản dịch: mục có thể thuộc tab khác tab đang mở)
  findItemAny(id){
    for(const t of SOP.TABS)for(const g of (SOP.idx.tabs[t.k]||[])){
      const it=(g.items||[]).find(x=>x.id===id);if(it)return{t:t.k,g,it};
    }
    return null;
  },
  async openFirst(){
    const g=SOP.groups().find(g=>(g.items||[]).length);
    if(g)await SOP.open(g.items[0].id);else{SOP.cur=null;SOP.curId='';SOP.render();}
  },
  async open(id){
    SOP.curId=id;SOP.curSub=0;
    try{SOP.cur=await SB.loadReport('sop_item',id);}catch(e){SOP.cur=null;console.error(e);}
    if(!SOP.cur){
      const f=SOP.findItem(id);
      SOP.cur={id,tab:SOP.view,name:f?f.it.name:'(mục trống)',subs:[],blocks:[]};
    }
    if(!Array.isArray(SOP.cur.subs))SOP.cur.subs=[];
    if(!Array.isArray(SOP.cur.blocks))SOP.cur.blocks=[];
    SOP.render();
  },

  // ---------- KHUNG GIAO DIỆN ----------
  renderTabs(){
    const w=document.getElementById('sopTabs');if(!w)return;
    w.innerHTML=SOP.TABS.map(t=>`<div class="tab${t.k===SOP.view?' active':''}" onclick="SOP.setView('${t.k}')">${hesc(t.label)}</div>`).join('');
  },
  async setView(k){
    if(SOP.view===k)return;
    SOP.view=k;SOP.renderTabs();await SOP.openFirst();
  },
  toggleEdit(){
    if(!SOP.canEdit())return;
    SOP.edit=!SOP.edit;SOP.render();
  },
  render(){
    SOP.renderRail();SOP.renderPane();SOP.hydrateImgs();
  },

  // ---------- CỘT TRÁI ----------
  renderRail(){
    const el=document.getElementById('sopRail');if(!el)return;
    const d=SOP.tabDef(),ed=SOP.edit&&SOP.canEdit();
    const q=(SOP._q||'').toLowerCase();
    let h=`<div class="sec-hdr">${hesc(d.unit)}</div>
      <input class="sop-inp" placeholder="Tìm ${hesc(d.unit.toLowerCase())}…" value="${hesc(SOP._q||'')}" oninput="SOP.search(this.value)" style="width:100%;margin-bottom:12px">`;
    const gs=SOP.groups();
    if(!gs.length)h+=`<div class="sop-empty">Chưa có nhóm nào.${ed?' Bấm ＋ Nhóm để tạo.':''}</div>`;
    gs.forEach((g,gi)=>{
      const items=(g.items||[]).filter(it=>!q||(it.name||'').toLowerCase().includes(q));
      if(q&&!items.length&&!(g.name||'').toLowerCase().includes(q))return;
      h+=`<div class="sop-grp" data-noi18n>${hesc(g.name)}${ed?`<span class="sop-gx" title="Đổi tên nhóm" onclick="SOP.renameGroup(${gi})">✎</span><span class="sop-gx" title="Xoá nhóm" onclick="SOP.delGroup(${gi})">✕</span>`:''}</div>`;
      if(!items.length)h+=`<div class="sop-empty sm">— trống —</div>`;
      items.forEach(it=>{
        const on=it.id===SOP.curId,dot=it.level||'',n=SOP.badgeOf(it);
        h+=`<div class="sop-it${on?' on':''}" onclick="SOP.open('${it.id}')">
          <span class="sop-dot ${hesc(dot)}"></span>
          <span class="sop-itt" data-noi18n>${hesc(SOP.nameOf(it))}</span>
          ${n?`<span class="sop-n">${hesc(n)}</span>`:''}
          ${ed?`<span class="sop-x" onclick="event.stopPropagation();SOP.delItem('${it.id}')">✕</span>`:''}
        </div>`;
      });
    });
    if(ed)h+=`<div style="display:flex;gap:6px;margin-top:14px">
      <button class="abtn abtn-pu abtn-sm" style="flex:1;justify-content:center" onclick="SOP.addItem()">＋ ${hesc(d.unit)}</button>
      <button class="abtn abtn-ghost abtn-sm" style="flex:1;justify-content:center" onclick="SOP.addGroup()">＋ Nhóm</button></div>`;
    if(SOP.view==='ld'||SOP.view==='game'){
      const L=SOP.view==='game'?SOP.GLEVELS:SOP.LEVELS;
      h+=`<div class="sop-leg"><span class="sop-lg hi"></span>${hesc(L.hi)} <span class="sop-lg go"></span>${hesc(L.go)} <span class="sop-lg mu"></span>${hesc(L.mu)}</div>`;
    }
    el.innerHTML=h;
  },
  // Tên mục ở cột trái lấy từ MỤC LỤC (không tải nội dung) -> bản dịch tên được chép sang idx lúc nhập
  nameOf(it){
    if(it.en_name&&typeof I18N!=='undefined'&&I18N.lang==='en')return it.en_name;
    return it.name||'';
  },
  badgeOf(it){
    if(SOP.view==='qt')return it.n?it.n+' bước':'';
    if(SOP.view==='game')return it.n?it.n+' game':'';
    if(SOP.view==='ld')return it.n?it.n+' ảnh':'';
    return '';
  },
  search(v){SOP._q=v;SOP.renderRail();},

  // ---------- CỘT PHẢI ----------
  renderPane(){
    const el=document.getElementById('sopPane');if(!el)return;
    if(!SOP.cur){el.innerHTML=`<div class="sop-empty big">Chưa có nội dung. ${SOP.canEdit()?'Bật Chế độ biên tập rồi thêm nhóm và mục.':''}</div>`;return;}
    const d=SOP.tabDef(),ed=SOP.edit&&SOP.canEdit(),f=SOP.findItem(SOP.curId);
    const gname=f?f.g.name:'';
    let h=`<div class="sop-h">
      <div><div class="sop-crumb" data-noi18n>${hesc(gname)} ›</div>
        <div class="sop-t"><span data-noi18n>${hesc(SOP.tx(SOP.cur,'name'))}</span>${SOP.lvlChip(f&&f.it)}</div>
        <div class="sop-m">${hesc(SOP.metaLine())}</div></div>
      <div style="display:flex;gap:6px;align-items:center">
        <span id="sopSaved" class="sop-saved">✓ Đã lưu</span>
        ${ed?`<button class="abtn abtn-ghost abtn-sm" onclick="SOP.renameItem()">Đổi tên</button>`:''}
        ${SOP.view==='doc'?`<button class="abtn abtn-ghost abtn-sm" onclick="SOP.printDoc()">In</button>`:''}
        ${(ed&&d.subs)?`<button class="abtn abtn-pu abtn-sm" onclick="SOP.addSub()">＋ ${hesc(d.subName)}</button>`:''}
      </div></div>`;

    if(d.subs==='step')h+=SOP.stepBarHtml(ed)+SOP.stepBodyHtml(ed);
    else if(d.subs==='acc')h+=SOP.accHtml(ed);
    else h+=SOP.blocksHtml(SOP.cur.blocks,ed,'i');
    el.innerHTML=h;
  },
  metaLine(){
    const d=SOP.tabDef();
    if(d.subs)return SOP.cur.subs.length+' '+d.subName.toLowerCase()+' · cập nhật '+(SOP.cur.upd||'—');
    return SOP.cur.blocks.length+' khối nội dung · cập nhật '+(SOP.cur.upd||'—');
  },
  lvlChip(it){
    if(!it||!it.level||(SOP.view!=='ld'&&SOP.view!=='game'))return '';
    const L=SOP.view==='game'?SOP.GLEVELS:SOP.LEVELS;
    return ` <span class="sop-lvl ${hesc(it.level)}">${hesc((L[it.level]||'').toUpperCase())}</span>`;
  },

  // ----- qt: thanh bước -----
  // Thanh bước: một đường ray liền chạy từ TÂM chấm đầu tới TÂM chấm cuối; phần đã đi qua
  // sáng xanh–tím theo tỉ lệ bước hiện tại. Chấm có vành cùng màu nền -> ray không xuyên qua chấm.
  stepBarHtml(ed){
    const ss=SOP.cur.subs,n=ss.length;
    if(!n)return `<div class="sop-empty big">Chưa có bước nào.${ed?' Bấm ＋ Bước ở trên.':''}</div>`;
    const p=n>1?(SOP.curSub/(n-1)):0;
    // class sop-srail (KHÔNG phải sop-rail — tên đó đã là cột chủ đề bên trái)
    let h=`<div class="sop-steps${ed?' has-add':''}"><div class="sop-srail" style="--p:${p}">`;
    ss.forEach((s,i)=>{
      // sáng = các bước TRƯỚC bước đang xem (không nhớ lịch sử đã mở: đang ở bước 1
      // thì bước 2 phải tối, dù trước đó có mở qua)
      const cls=i===SOP.curSub?'on':(i<SOP.curSub?'read':'todo');
      h+=`<div class="sop-sdot ${cls}" onclick="SOP.goSub(${i})"><i>${i+1}</i><span data-noi18n>${hesc(s.name||'')}</span></div>`;
    });
    h+='</div>';
    if(ed)h+=`<button class="abtn abtn-ghost abtn-sm sop-sadd" onclick="SOP.addSub()">＋ Thêm bước</button>`;
    return h+'</div>';
  },
  stepBodyHtml(ed){
    const s=SOP.cur.subs[SOP.curSub];if(!s)return '';
    let h=`<div class="sop-subh"><div class="sop-subt">Bước ${SOP.curSub+1} — <span data-noi18n>${hesc(s.name||'')}</span></div>`;
    if(ed)h+=`<div style="display:flex;gap:6px">
      <button class="abtn abtn-ghost abtn-sm" onclick="SOP.renameSub(${SOP.curSub})">Đổi tên bước</button>
      <button class="abtn abtn-danger abtn-sm" onclick="SOP.delSub(${SOP.curSub})">Xoá bước</button></div>`;
    h+='</div>';
    h+=SOP.blocksHtml(s.blocks,ed,'s'+SOP.curSub);
    if(SOP.cur.subs.length>1){
      h+=`<div class="sop-nav">
        <button class="abtn abtn-ghost abtn-sm"${SOP.curSub? '':' disabled'} onclick="SOP.goSub(${SOP.curSub-1})">← Bước trước</button>
        <button class="abtn abtn-pu abtn-sm"${SOP.curSub<SOP.cur.subs.length-1?'':' disabled'} onclick="SOP.goSub(${SOP.curSub+1})">Bước sau →</button></div>`;
    }
    return h;
  },
  goSub(i){
    if(i<0||i>=SOP.cur.subs.length)return;
    SOP.curSub=i;SOP.renderPane();SOP.hydrateImgs();
  },

  // ----- game: khối gập -----
  accHtml(ed){
    const ss=SOP.cur.subs;
    if(!ss.length)return `<div class="sop-empty big">Sảnh này chưa có trò chơi nào.${ed?' Bấm ＋ Trò chơi ở trên.':''}</div>`;
    let h='';
    ss.forEach((s,i)=>{
      const open=i===SOP.curSub;
      const L=SOP.GLEVELS;
      h+=`<div class="sop-acc${open?' open':''}">
        <div class="sop-acch" onclick="SOP.goAcc(${i},event)">
          <span class="sop-car">${open?'▾':'▸'}</span>
          <span class="sop-acct" data-noi18n>${hesc(s.name||'')}</span>
          ${s.level?`<span class="sop-lvl ${hesc(s.level)}">${hesc((L[s.level]||'').toUpperCase())}</span>`:''}
          <span class="sop-accm">${hesc(s.code||'')}${s.code?' · ':''}${SOP.countImgs(s.blocks)} ảnh</span>
          ${ed?`<span class="sop-accb">
            <button class="abtn abtn-ghost abtn-sm" onclick="SOP.renameSub(${i})">✎</button>
            <button class="abtn abtn-ghost abtn-sm" onclick="SOP.moveSub(${i},-1)">↑</button>
            <button class="abtn abtn-ghost abtn-sm" onclick="SOP.moveSub(${i},1)">↓</button>
            <button class="abtn abtn-danger abtn-sm" onclick="SOP.delSub(${i})">🗑</button></span>`:''}
        </div>`;
      if(open)h+=`<div class="sop-accb2">${SOP.gameCardHtml(s,i,ed)}${SOP.blocksHtml(s.blocks,ed,'s'+i)}</div>`;
      h+='</div>';
    });
    return h;
  },
  gameCardHtml(s,i,ed){
    const rows=[['Mã game',s.code||'—'],['Trạng thái',SOP.GLEVELS[s.level]||'—'],['Áp dụng từ',s.from||'—']];
    return `<div class="sop-gcard">
      <div class="sop-gthumb">${s.thumb?`<img data-p="${hesc(s.thumb)}" alt="" onclick="SOP.lightbox('${hesc(s.thumb)}')">`:'<span>Chưa có ảnh bìa</span>'}
        ${ed?`<button class="abtn abtn-ghost abtn-sm" onclick="SOP.pickThumb(${i})">${s.thumb?'Đổi ảnh bìa':'＋ Ảnh bìa'}</button>`:''}</div>
      <div>${rows.map(r=>`<div class="sop-grow"><span>${hesc(r[0])}</span><b data-noi18n>${hesc(r[1])}</b></div>`).join('')}
        ${ed?`<button class="abtn abtn-ghost abtn-sm" style="margin-top:8px;width:100%;justify-content:center" onclick="SOP.editGame(${i})">✎ Sửa thông tin</button>`:''}</div>
    </div>`;
  },
  goAcc(i,e){
    if(e&&e.target.closest('button'))return;
    SOP.curSub=(SOP.curSub===i)?-1:i;SOP.renderPane();SOP.hydrateImgs();
  },
  countImgs(bs){return (bs||[]).reduce((n,b)=>n+(b.t==='img'?(b.imgs||[]).length:0),0);},

  // ---------- KHỐI NỘI DUNG ----------
  blocksHtml(bs,ed,scope){
    bs=bs||[];
    let h='';
    if(!bs.length)h+=`<div class="sop-empty">Chưa có nội dung.${ed?' Dùng các nút bên dưới để thêm khối.':''}</div>`;
    bs.forEach((b,i)=>{h+=SOP.blockHtml(b,i,ed,scope);});
    if(ed){
      h+=`<div class="sop-addbar">
        <button class="abtn abtn-pu abtn-sm" onclick="SOP.addBlock('${scope}','text')">＋ Văn bản</button>
        <button class="abtn abtn-pu abtn-sm" onclick="SOP.addBlock('${scope}','img')">＋ Hình ảnh</button>`;
      if(SOP.view==='ld'||SOP.view==='game')h+=`<button class="abtn abtn-ghost abtn-sm" onclick="SOP.addBlock('${scope}','feat')">＋ ${SOP.view==='game'?'Cách lạm dụng':'Đặc điểm'}</button>`;
      if(SOP.view==='doc')h+=`<button class="abtn abtn-ghost abtn-sm" onclick="SOP.addBlock('${scope}','table')">＋ Bảng</button>`;
      h+=`<button class="abtn abtn-ghost abtn-sm" onclick="SOP.addBlock('${scope}','info')">＋ Khung ghi nhớ</button>
        <button class="abtn abtn-ghost abtn-sm" onclick="SOP.addBlock('${scope}','warn')">＋ Khung lưu ý</button>
        <button class="abtn abtn-ghost abtn-sm" onclick="SOP.addBlock('${scope}','ban')">＋ Khung cấm</button></div>`;
    }
    return h;
  },
  blockHtml(b,i,ed,scope){
    const tools=ed?`<div class="sop-btools">
      <button class="abtn abtn-ghost abtn-sm" onclick="SOP.editBlock('${scope}',${i})">✎</button>
      <button class="abtn abtn-ghost abtn-sm" onclick="SOP.moveBlock('${scope}',${i},-1)">↑</button>
      <button class="abtn abtn-ghost abtn-sm" onclick="SOP.moveBlock('${scope}',${i},1)">↓</button>
      <button class="abtn abtn-danger abtn-sm" onclick="SOP.delBlock('${scope}',${i})">🗑</button></div>`:'';
    const editing=SOP._ed&&SOP._ed.scope===scope&&SOP._ed.i===i;
    if(b.t==='text'){
      // SOẠN TẠI CHỖ (không dùng prompt: prompt không xuống dòng, không căn chỉnh được)
      if(editing)return `<div class="sop-blk editing" data-noi18n>
        <input class="sop-eh" id="sopEdH" placeholder="Tiêu đề nhỏ (để trống nếu không cần)" value="${hesc(b.h||'')}">
        <textarea class="sop-eb" id="sopEdB" rows="6" placeholder="Nội dung… (Enter để xuống dòng, mỗi dòng trống tách một đoạn)">${hesc(b.b||'')}</textarea>
        ${SOP.edBar()}</div>`;
      return `<div class="sop-blk">${tools}
        ${b.h?`<div class="sop-bh" data-noi18n>${hesc(SOP.tx(b,'h'))}</div>`:''}
        <div class="sop-body" data-noi18n>${SOP.para(SOP.tx(b,'b'))}</div></div>`;
    }
    if(b.t==='img'){
      const imgs=b.imgs||[],cols=b.cols||(imgs.length>1?2:1);
      let g=imgs.map((im,k)=>`<div class="sop-imgbox"${imgs.length>1&&k===imgs.length-1&&imgs.length%cols===1?' style="grid-column:1/-1"':''}>
          <img data-p="${hesc(im.u)}" alt="" onclick="SOP.lightbox('${hesc(im.u)}')">
          ${(SOP._ed&&SOP._ed.scope===scope&&SOP._ed.i===i&&SOP._ed.k===k)
            ?`<div class="sop-cap" data-noi18n><input class="sop-eh" id="sopEdH" placeholder="Chú thích ảnh" value="${hesc(im.cap||'')}">${SOP.edBar()}</div>`
            :`<div class="sop-cap" data-noi18n>${hesc(SOP.tx(im,'cap'))||'&nbsp;'}</div>`}
          ${ed?`<div class="sop-imgb"><button class="abtn abtn-ghost abtn-sm" onclick="SOP.capImg('${scope}',${i},${k})">✎ Chú thích</button><button class="abtn abtn-danger abtn-sm" onclick="SOP.delImg('${scope}',${i},${k})">🗑</button></div>`:''}
        </div>`).join('');
      if(!imgs.length)g=`<div class="sop-imgph">Chưa có ảnh${ed?' — bấm ＋ Thêm ảnh':''}</div>`;
      return `<div class="sop-blk">${tools}
        <div class="sop-grid" style="grid-template-columns:repeat(${cols},1fr)">${g}</div>
        ${ed?`<div class="sop-imgctl"><button class="abtn abtn-ghost abtn-sm" onclick="SOP.pickImg('${scope}',${i})">＋ Thêm ảnh</button>
          <span>Bố cục:</span>${[1,2,3].map(c=>`<button class="abtn ${c===cols?'abtn-pu':'abtn-ghost'} abtn-sm" onclick="SOP.setCols('${scope}',${i},${c})">${c} cột</button>`).join('')}</div>`:''}</div>`;
    }
    if(b.t==='feat'){
      const its=b.items||[],fk=SOP._ed&&SOP._ed.scope===scope&&SOP._ed.i===i?SOP._ed.k:null;
      const form=k=>{
        const f=k>=0?(its[k]||{}):{};
        return `<div class="sop-feat editing" data-noi18n><span class="sop-fn">${k>=0?k+1:its.length+1}</span><div style="flex:1">
          <input class="sop-eh" id="sopEdH" placeholder="Tiêu đề (in đậm)" value="${hesc(f.b||'')}">
          <textarea class="sop-eb" id="sopEdB" rows="2" placeholder="Giải thích / ví dụ (không bắt buộc)">${hesc(f.d||'')}</textarea>
          ${SOP.edBar()}</div></div>`;
      };
      return `<div class="sop-blk">${tools}${b.h?`<div class="sop-bh" data-noi18n>${hesc(SOP.tx(b,'h'))}</div>`:''}
        ${its.map((f,k)=>fk===k?form(k):`<div class="sop-feat"><span class="sop-fn">${k+1}</span><div>
          <b data-noi18n>${hesc(SOP.tx(f,'b'))}</b>${f.d?`<div class="sop-fd" data-noi18n>${hesc(SOP.tx(f,'d'))}</div>`:''}</div>
          ${ed?`<span class="sop-featb"><button class="abtn abtn-ghost abtn-sm" onclick="SOP.editFeat('${scope}',${i},${k})">✎</button><button class="abtn abtn-danger abtn-sm" onclick="SOP.delFeat('${scope}',${i},${k})">🗑</button></span>`:''}</div>`).join('')||(fk===-1?'':'<div class="sop-empty sm">— chưa có mục nào —</div>')}
        ${fk===-1?form(-1):''}
        ${(ed&&fk===null)?`<button class="abtn abtn-ghost abtn-sm" style="margin-top:10px" onclick="SOP.editFeat('${scope}',${i},-1)">＋ Thêm mục</button>`:''}</div>`;
    }
    if(b.t==='table'){
      const rows=b.rows||[];
      return `<div class="sop-blk">${tools}
        ${b.h?`<div class="sop-bh" data-noi18n>${hesc(SOP.tx(b,'h'))}</div>`:''}
        <div style="overflow-x:auto"><table class="sop-tbl${ed?' edit':''}" data-noi18n>${rows.map((r,ri)=>`<tr>${r.map((c,ci)=>{
          const a=ed?` contenteditable="true" spellcheck="false" onblur="SOP.tblCell('${scope}',${i},${ri},${ci},this)"`:'';
          return ri?`<td${a}>${hesc(c)}</td>`:`<th${a}>${hesc(c)}</th>`;}).join('')}</tr>`).join('')}</table></div>
        ${ed?`<div class="sop-imgctl"><span>Bấm thẳng vào ô để sửa.</span>
          <button class="abtn abtn-ghost abtn-sm" onclick="SOP.tblRow('${scope}',${i},1)">＋ Dòng</button>
          <button class="abtn abtn-ghost abtn-sm" onclick="SOP.tblRow('${scope}',${i},-1)">－ Dòng</button>
          <button class="abtn abtn-ghost abtn-sm" onclick="SOP.tblCol('${scope}',${i},1)">＋ Cột</button>
          <button class="abtn abtn-ghost abtn-sm" onclick="SOP.tblCol('${scope}',${i},-1)">－ Cột</button></div>`:''}</div>`;
    }
    // note: info / warn / ban
    const kind=b.t==='ban'?'ban':(b.t==='warn'?'warn':'info');
    const pre={info:'ℹ Ghi nhớ:',warn:'⚠ Lưu ý:',ban:'🚫 Tuyệt đối không:'}[kind];
    if(editing)return `<div class="sop-blk plain" data-noi18n><div class="sop-note ${kind} editing"><b>${pre}</b>
      <textarea class="sop-eb" id="sopEdB" rows="3" placeholder="Nội dung khung…">${hesc(b.b||'')}</textarea>
      ${SOP.edBar()}</div></div>`;
    return `<div class="sop-blk plain">${tools}<div class="sop-note ${kind}"><b>${pre}</b> <span data-noi18n>${hesc(SOP.tx(b,'b'))}</span></div></div>`;
  },
  // lấy chuỗi theo ngôn ngữ: có bản EN + đang bật EN thì dùng, thiếu thì rơi về tiếng Việt
  tx(o,f){
    const en=o&&o.en&&o.en[f];
    if(en&&typeof I18N!=='undefined'&&I18N.lang==='en')return en;
    return (o&&o[f])||'';
  },
  para(s){return hesc(s||'').split(/\n+/).map(l=>l.trim()).filter(Boolean).map(l=>`<p>${l}</p>`).join('')||'<p class="sop-mu">(trống)</p>';},

  // ---------- HỘP THOẠI CHUNG (thay confirm/prompt của trình duyệt) ----------
  // Trả Promise: xác nhận -> true/null · nhập chữ -> chuỗi/null · chọn -> giá trị/null
  dlg(o){
    const m=document.getElementById('sopDlg');if(!m)return Promise.resolve(null);
    document.getElementById('sopDlgT').textContent=o.title||'';
    const msg=document.getElementById('sopDlgM');
    msg.innerHTML=o.msg?hesc(o.msg).replace(/\n/g,'<br>'):'';
    msg.style.display=o.msg?'':'none';
    const inp=document.getElementById('sopDlgI');
    inp.style.display=o.input?'':'none';
    inp.value=o.value||'';inp.placeholder=o.placeholder||'';
    const opts=document.getElementById('sopDlgOpts'),bar=document.getElementById('sopDlgB');
    opts.innerHTML='';opts.style.display=o.options?'':'none';
    bar.style.display=o.options?'none':'';
    if(o.options){
      o.options.forEach(op=>{
        const b=document.createElement('button');
        b.className='abtn abtn-ghost abtn-sm sop-dlg-opt';b.textContent=op.label;
        b.onclick=()=>SOP.dlgClose(op.v);
        opts.appendChild(b);
      });
    }else{
      const ok=document.getElementById('sopDlgOK');
      ok.textContent=o.okText||'Đồng ý';
      ok.className='abtn abtn-sm '+(o.danger?'abtn-danger':(o.input?'abtn-ok':'abtn-pu'));
      ok.onclick=()=>SOP.dlgClose(o.input?(inp.value||''):true);
    }
    m.classList.add('show');
    setTimeout(()=>{(o.input?inp:document.getElementById('sopDlgOK')||inp).focus();
      if(o.input&&inp.setSelectionRange)inp.setSelectionRange(inp.value.length,inp.value.length);},30);
    return new Promise(res=>{SOP._dlgRes=res;});
  },
  dlgClose(v){
    const m=document.getElementById('sopDlg');if(m)m.classList.remove('show');
    const r=SOP._dlgRes;SOP._dlgRes=null;if(r)r(v);
  },
  confirmBox(msg,opt){
    return SOP.dlg({title:(opt&&opt.title)||'Xác nhận',msg,okText:(opt&&opt.okText)||'Xoá',danger:!(opt&&opt.safe)})
      .then(v=>v===true);
  },
  promptBox(title,value,placeholder){
    return SOP.dlg({title,input:true,value:value||'',placeholder:placeholder||'',okText:'Lưu'})
      .then(v=>(v===null?null:String(v).trim()));
  },

  // ---------- SỬA MỤC LỤC ----------
  async addGroup(){
    const n=await SOP.promptBox('Tên nhóm mới','','vd: Duyệt đơn cơ bản');if(!n)return;
    SOP.groups().push({gid:SOP.uid('g'),name:n,items:[]});
    await SOP.saveIndex();SOP.renderRail();
  },
  async renameGroup(gi){
    const g=SOP.groups()[gi];if(!g)return;
    const n=await SOP.promptBox('Tên nhóm',g.name);if(!n)return;
    g.name=n;await SOP.saveIndex();SOP.renderRail();
  },
  async delGroup(gi){
    const g=SOP.groups()[gi];if(!g)return;
    const n=(g.items||[]).length;
    if(!await SOP.confirmBox(n?`Xoá nhóm "${g.name}" cùng ${n} mục bên trong?`:`Xoá nhóm "${g.name}"?`,{title:'Xoá nhóm'}))return;
    SOP.groups().splice(gi,1);await SOP.saveIndex();
    logAction('SOP xoá nhóm',SOP.view+' · '+g.name);
    await SOP.openFirst();
  },
  async addItem(){
    const gs=SOP.groups();
    const d=SOP.tabDef();
    if(!gs.length){await SOP.dlg({title:'Chưa có nhóm',msg:'Hãy tạo Nhóm trước rồi mới thêm '+d.unit.toLowerCase()+'.',okText:'Đã hiểu'});return;}
    const n=await SOP.promptBox(d.unit+' mới');if(!n)return;
    let gi=0;
    if(gs.length>1){
      const v=await SOP.dlg({title:'Thuộc nhóm nào?',options:gs.map((g,i)=>({label:g.name,v:i}))});
      if(v===null)return;gi=v;
    }
    const it={id:SOP.uid('i'),name:n};
    if(SOP.view==='ld'||SOP.view==='game')it.level=(await SOP.askLevel())||'mu';
    (gs[gi].items=gs[gi].items||[]).push(it);
    await SOP.saveIndex();
    SOP.cur={id:it.id,tab:SOP.view,name:it.name,subs:[],blocks:[],upd:SOP.today()};
    SOP.curId=it.id;SOP.curSub=0;
    await SOP.saveItem();SOP.render();
  },
  askLevel(){
    const L=SOP.view==='game'?SOP.GLEVELS:SOP.LEVELS;
    return SOP.dlg({title:'Chọn mức độ',options:[{label:L.hi,v:'hi'},{label:L.go,v:'go'},{label:L.mu,v:'mu'}]});
  },
  async renameItem(){
    const f=SOP.findItem(SOP.curId);if(!f)return;
    const n=await SOP.promptBox('Tên',f.it.name);if(!n)return;
    f.it.name=n;SOP.cur.name=n;
    if(SOP.view==='ld'||SOP.view==='game'){const lv=await SOP.askLevel();if(lv)f.it.level=lv;}
    await SOP.saveIndex();await SOP.saveItem();SOP.render();
  },
  async delItem(id){
    const f=SOP.findItem(id);if(!f)return;
    if(!await SOP.confirmBox(`Xoá "${f.it.name}"? Không khôi phục được.`,{title:'Xoá '+SOP.tabDef().unit.toLowerCase()}))return;
    f.g.items.splice(f.g.items.indexOf(f.it),1);
    await SOP.saveIndex();
    logAction('SOP xoá mục',SOP.view+' · '+f.it.name);
    if(SOP.curId===id)await SOP.openFirst();else SOP.renderRail();
  },
  today(){const d=new Date();return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();},
  touch(){SOP.cur.upd=SOP.today();},
  syncCount(){
    const f=SOP.findItem(SOP.curId);if(!f)return;
    const d=SOP.tabDef();
    f.it.n=d.subs?SOP.cur.subs.length:SOP.cur.blocks.reduce((n,b)=>n+(b.t==='img'?(b.imgs||[]).length:0),0);
    SOP.saveIndex();
  },

  // ---------- BƯỚC / TRÒ CHƠI ----------
  async addSub(){
    const d=SOP.tabDef();if(!d.subs||!SOP.cur)return;
    const n=await SOP.promptBox(d.subName+' mới');if(!n)return;
    const s={id:SOP.uid('s'),name:n,blocks:[]};
    if(d.subs==='acc'){
      s.level=(await SOP.askLevel())||'mu';
      s.code=(await SOP.promptBox('Mã game','','bỏ trống nếu không có'))||'';
      s.from=(await SOP.promptBox('Áp dụng từ ngày','','vd 01/08/2026'))||'';
    }
    SOP.cur.subs.push(s);SOP.curSub=SOP.cur.subs.length-1;
    SOP.touch();await SOP.saveItem();SOP.syncCount();SOP.render();
  },
  async renameSub(i){
    const s=SOP.cur.subs[i];if(!s)return;
    const n=await SOP.promptBox('Tên',s.name);if(!n)return;
    s.name=n;SOP.touch();await SOP.saveItem();SOP.render();
  },
  async editGame(i){
    const s=SOP.cur.subs[i];if(!s)return;
    const c=await SOP.promptBox('Mã game',s.code||'');if(c===null)return;
    const fr=await SOP.promptBox('Áp dụng từ ngày',s.from||'','vd 01/08/2026');if(fr===null)return;
    const lv=await SOP.askLevel();
    s.code=c;s.from=fr;if(lv)s.level=lv;
    SOP.touch();await SOP.saveItem();SOP.render();
  },
  async moveSub(i,d){
    const ss=SOP.cur.subs,j=i+d;if(j<0||j>=ss.length)return;
    [ss[i],ss[j]]=[ss[j],ss[i]];
    if(SOP.curSub===i)SOP.curSub=j;else if(SOP.curSub===j)SOP.curSub=i;
    await SOP.saveItem();SOP.render();
  },
  async delSub(i){
    const s=SOP.cur.subs[i];if(!s)return;
    if(!await SOP.confirmBox(`Xoá "${s.name}"?`,{title:'Xoá '+SOP.tabDef().subName.toLowerCase()}))return;
    SOP.cur.subs.splice(i,1);
    if(SOP.curSub>=SOP.cur.subs.length)SOP.curSub=Math.max(0,SOP.cur.subs.length-1);
    SOP.touch();await SOP.saveItem();SOP.syncCount();SOP.render();
  },

  // ---------- KHỐI ----------
  blocksOf(scope){
    if(scope==='i')return SOP.cur.blocks;
    const i=parseInt(scope.slice(1),10),s=SOP.cur.subs[i];
    return s?(s.blocks=s.blocks||[]):null;
  },
  // ---------- SOẠN TẠI CHỖ ----------
  // Thanh nút dùng chung cho mọi ô soạn (Lưu xanh lá / Huỷ viền mờ). Ctrl+Enter = lưu, Esc = huỷ.
  edBar(){
    return `<div class="sop-ebar">
      <button class="abtn abtn-ok abtn-sm" onclick="SOP.edSave()">Lưu</button>
      <button class="abtn abtn-ghost abtn-sm" onclick="SOP.edCancel()">Huỷ</button>
      <span class="sop-ehint">Ctrl+Enter để lưu · Esc để huỷ</span></div>`;
  },
  edOpen(scope,i,k){
    SOP._ed={scope,i,k:(k===undefined?null:k)};
    SOP.renderPane();SOP.hydrateImgs();
    setTimeout(()=>{
      const el=document.getElementById('sopEdH')||document.getElementById('sopEdB');
      if(el){el.focus();if(el.setSelectionRange)el.setSelectionRange(el.value.length,el.value.length);}
    },30);
  },
  edCancel(){
    const e=SOP._ed;SOP._ed=null;
    // khối văn bản/khung vừa thêm mà bỏ trống -> gỡ luôn cho khỏi rác
    if(e&&e.k===null){
      const bs=SOP.blocksOf(e.scope),b=bs&&bs[e.i];
      if(b&&(b.t==='text'||b.t==='info'||b.t==='warn'||b.t==='ban')&&!(b.b||'').trim()&&!(b.h||'').trim())bs.splice(e.i,1);
    }
    SOP.renderPane();SOP.hydrateImgs();
  },
  async edSave(){
    const e=SOP._ed;if(!e)return;
    const H=document.getElementById('sopEdH'),B=document.getElementById('sopEdB');
    const hv=H?H.value.trim():'',bv=B?B.value:'';
    const bs=SOP.blocksOf(e.scope),b=bs&&bs[e.i];
    if(!b){SOP._ed=null;SOP.renderPane();return;}
    if(b.t==='feat'){
      b.items=b.items||[];
      if(!hv){SOP.dlg({title:'Thiếu tiêu đề',msg:'Hãy nhập tiêu đề trước khi lưu.',okText:'Đã hiểu'});return;}
      if(e.k>=0){b.items[e.k].b=hv;b.items[e.k].d=bv.trim();}
      else b.items.push({b:hv,d:bv.trim()});
    }else if(b.t==='img'){
      const im=(b.imgs||[])[e.k];if(im)im.cap=hv;
    }else if(b.t==='text'){
      if(!hv&&!bv.trim()){SOP.edCancel();return;}
      b.h=hv;b.b=bv;
    }else{
      if(!bv.trim()){SOP.edCancel();return;}
      b.b=bv;
    }
    SOP._ed=null;SOP.touch();await SOP.saveItem();SOP.syncCount();SOP.render();
  },
  async addBlock(scope,t){
    const bs=SOP.blocksOf(scope);if(!bs)return;
    let b={t};
    if(t==='text'){
      // thêm khối rỗng rồi mở ngay ô soạn tại chỗ (không hỏi qua prompt)
      b.h='';b.b='';bs.push(b);SOP.edOpen(scope,bs.length-1);return;
    }else if(t==='img'){b.imgs=[];b.cols=2;}
    else if(t==='feat'){b.items=[];}
    else if(t==='table'){b.rows=[['Cột 1','Cột 2','Cột 3'],['','','']];}
    else{
      // khung ghi nhớ / lưu ý / cấm: thêm rỗng rồi mở ô soạn tại chỗ
      b.b='';bs.push(b);SOP.edOpen(scope,bs.length-1);return;
    }
    bs.push(b);SOP.touch();await SOP.saveItem();SOP.syncCount();SOP.render();
    if(t==='img')SOP.pickImg(scope,bs.length-1);
  },
  async editBlock(scope,i){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b)return;
    if(b.t==='text'||b.t==='info'||b.t==='warn'||b.t==='ban'){SOP.edOpen(scope,i);return;}
    if(b.t==='table'){
      const h=await SOP.promptBox('Tiêu đề bảng',b.h||'','bỏ trống nếu không cần');if(h===null)return;b.h=h;
    }else if(b.t==='img'){
      SOP.pickImg(scope,i);return;
    }else if(b.t==='feat'){
      const h=await SOP.promptBox('Tiêu đề khối',b.h||'','bỏ trống nếu không cần');if(h===null)return;b.h=h;
    }
    SOP.touch();await SOP.saveItem();SOP.render();
  },
  // ---------- BẢNG: sửa thẳng trên ô ----------
  async tblCell(scope,i,r,c,el){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b||!b.rows[r])return;
    // textContent chứ KHÔNG innerText: hàng tiêu đề có CSS text-transform:uppercase,
    // innerText trả về chữ ĐÃ in hoa -> lưu xuống là hỏng dữ liệu gốc.
    const v=el.textContent.replace(/\s+$/,'');
    if(b.rows[r][c]===v)return;
    b.rows[r][c]=v;SOP.touch();await SOP.saveItem();
  },
  async tblRow(scope,i,d){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b)return;
    if(d>0)b.rows.push(new Array(b.rows[0].length).fill(''));
    else if(b.rows.length>2)b.rows.pop();
    await SOP.saveItem();SOP.render();
  },
  async tblCol(scope,i,d){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b)return;
    if(d>0)b.rows.forEach((r,ri)=>r.push(ri?'':'Cột '+(r.length+1)));
    else if(b.rows[0].length>1)b.rows.forEach(r=>r.pop());
    await SOP.saveItem();SOP.render();
  },
  async moveBlock(scope,i,d){
    const bs=SOP.blocksOf(scope),j=i+d;if(!bs||j<0||j>=bs.length)return;
    [bs[i],bs[j]]=[bs[j],bs[i]];await SOP.saveItem();SOP.render();
  },
  async delBlock(scope,i){
    const bs=SOP.blocksOf(scope);if(!bs||!bs[i])return;
    if(!await SOP.confirmBox('Xoá khối này?',{title:'Xoá khối'}))return;
    bs.splice(i,1);SOP.touch();await SOP.saveItem();SOP.syncCount();SOP.render();
  },
  editFeat(scope,i,k){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b)return;
    b.items=b.items||[];SOP.edOpen(scope,i,k);
  },
  async delFeat(scope,i,k){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b||!b.items[k])return;
    if(!await SOP.confirmBox('Xoá mục này?',{title:'Xoá mục'}))return;
    b.items.splice(k,1);await SOP.saveItem();SOP.render();
  },
  async setCols(scope,i,c){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i];if(!b)return;
    b.cols=c;await SOP.saveItem();SOP.render();
  },
  capImg(scope,i,k){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i],im=b&&(b.imgs||[])[k];if(!im)return;
    SOP.edOpen(scope,i,k);
  },
  async delImg(scope,i,k){
    const bs=SOP.blocksOf(scope),b=bs&&bs[i],im=b&&(b.imgs||[])[k];if(!im)return;
    if(!await SOP.confirmBox('Xoá ảnh này?',{title:'Xoá ảnh'}))return;
    const path=im.u;b.imgs.splice(k,1);
    await SOP.saveItem();SOP.syncCount();SOP.render();
    try{await SB.client().storage.from(SOP.BUCKET).remove([path]);}catch(e){console.warn('xoá ảnh storage',e);}
  },

  // ---------- ẢNH ----------
  pickImg(scope,i){SOP._imgTarget={scope,i,thumb:-1};document.getElementById('sopFile').click();},
  pickThumb(i){SOP._imgTarget={scope:null,i,thumb:i};document.getElementById('sopFile').click();},
  async onFile(inp){
    const files=[...(inp.files||[])];inp.value='';
    if(!files.length||!SOP._imgTarget)return;
    const keep=document.getElementById('sopNoCompress');
    const raw=keep&&keep.checked;
    const st=document.getElementById('sopUpStatus');
    for(let n=0;n<files.length;n++){
      if(st)st.textContent=`Đang tải ảnh ${n+1}/${files.length}…`;
      try{
        const blob=raw?files[n]:await SOP.compress(files[n]);
        const ext=raw?(files[n].name.split('.').pop()||'png'):'webp';
        const path=SOP.curId+'/'+SOP.uid('p')+'.'+ext;
        const{error}=await SB.client().storage.from(SOP.BUCKET).upload(path,blob,{contentType:blob.type||'image/webp',upsert:false});
        if(error)throw error;
        const t=SOP._imgTarget;
        if(t.thumb>=0){SOP.cur.subs[t.thumb].thumb=path;}
        else{
          const bs=SOP.blocksOf(t.scope),b=bs&&bs[t.i];
          if(b){b.imgs=b.imgs||[];b.imgs.push({u:path,cap:''});}
        }
      }catch(e){SOP.dlg({title:'Tải ảnh thất bại',msg:String(e.message||e),okText:'Đã hiểu'});break;}
    }
    if(st)st.textContent='';
    SOP._imgTarget=null;SOP.touch();await SOP.saveItem();SOP.syncCount();SOP.render();
  },
  // Nén: giữ nguyên tới 1920px (ảnh chụp màn hình chữ nhỏ vẫn sắc), WebP 0.85 (~120-250 KB/ảnh)
  compress(file){
    return new Promise((res,rej)=>{
      if(!/^image\//.test(file.type)){rej(new Error('Không phải file ảnh'));return;}
      const img=new Image(),url=URL.createObjectURL(file);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const MAX=1920,sc=Math.min(1,MAX/Math.max(img.width,img.height));
        const c=document.createElement('canvas');
        c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        c.toBlob(b=>b?res(b):rej(new Error('Nén ảnh lỗi')),'image/webp',.85);
      };
      img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Không đọc được ảnh'));};
      img.src=url;
    });
  },
  async signed(path){
    if(SOP._urls[path]&&SOP._urls[path].exp>Date.now())return SOP._urls[path].u;
    const{data,error}=await SB.client().storage.from(SOP.BUCKET).createSignedUrl(path,3600);
    if(error||!data)return '';
    SOP._urls[path]={u:data.signedUrl,exp:Date.now()+50*60*1000};
    return data.signedUrl;
  },
  async hydrateImgs(){
    const els=[...document.querySelectorAll('#t4 img[data-p]')];
    for(const el of els){
      const p=el.getAttribute('data-p');
      const u=await SOP.signed(p);
      if(u)el.src=u;else el.replaceWith(Object.assign(document.createElement('div'),{className:'sop-imgph',textContent:'Không tải được ảnh'}));
    }
  },
  lightbox(path){
    const m=document.getElementById('sopLb');if(!m)return;
    SOP._lbZoom=1;
    SOP.signed(path).then(u=>{
      const img=document.getElementById('sopLbImg');
      img.src=u;img.style.transform='scale(1)';
      document.getElementById('sopLbOpen').href=u;
    });
    m.classList.add('show');
  },
  lbZoom(d){
    const img=document.getElementById('sopLbImg');if(!img)return;
    SOP._lbZoom=Math.max(1,Math.min(4,(SOP._lbZoom||1)+d));
    img.style.transform='scale('+SOP._lbZoom+')';
  },

  // ---------- IN ----------
  printDoc(){
    document.body.classList.add('sop-printing');
    setTimeout(()=>{window.print();setTimeout(()=>document.body.classList.remove('sop-printing'),400);},60);
  },

  // ---------- XUẤT / NHẬP BẢN DỊCH ----------
  // Gom mọi chuỗi tiếng Việt kèm đường dẫn -> file JSON để dịch một lượt, rồi nhập ngược lại.
  paths(item){
    const out=[];
    const push=(o,f,p)=>{if(o&&o[f]&&String(o[f]).trim())out.push({p,vi:o[f],en:(o.en&&o.en[f])||'',cu:(o.envi&&o.envi[f])||''});};
    push(item,'name','name');
    (item.blocks||[]).forEach((b,i)=>walkBlk(b,'blocks.'+i));
    (item.subs||[]).forEach((s,i)=>{
      push(s,'name','subs.'+i+'.name');
      (s.blocks||[]).forEach((b,j)=>walkBlk(b,'subs.'+i+'.blocks.'+j));
    });
    function walkBlk(b,p){
      push(b,'h',p+'.h');push(b,'b',p+'.b');
      (b.items||[]).forEach((f,k)=>{push(f,'b',p+'.items.'+k+'.b');push(f,'d',p+'.items.'+k+'.d');});
      (b.imgs||[]).forEach((im,k)=>push(im,'cap',p+'.imgs.'+k+'.cap'));
      (b.rows||[]).forEach((r,ri)=>r.forEach((c,ci)=>{if(String(c||'').trim())out.push({p:p+'.rows.'+ri+'.'+ci,vi:c,en:'',cu:''});}));
    }
    return out;
  },
  async exportTrans(){
    if(!SOP.canEdit())return;
    const out={v:1,at:new Date().toISOString(),items:[]};
    for(const t of SOP.TABS){
      for(const g of (SOP.idx.tabs[t.k]||[])){
        for(const it of (g.items||[])){
          let d=null;
          try{d=await SB.loadReport('sop_item',it.id);}catch(e){}
          if(!d)continue;
          const rows=SOP.paths(d).map(r=>({p:r.p,vi:r.vi,en:r.en,stale:!!(r.en&&r.cu&&r.cu!==r.vi)}));
          if(rows.length)out.items.push({id:it.id,tab:t.k,group:g.name,name:it.name,rows});
        }
      }
    }
    const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='quy_trinh_cong_viec_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  },
  importTrans(){if(SOP.canEdit())document.getElementById('sopTransFile').click();},
  async onTransFile(inp){
    const f=(inp.files||[])[0];inp.value='';if(!f)return;
    let data;
    try{data=JSON.parse(await f.text());}catch(e){SOP.dlg({title:'Không đọc được file',msg:String(e.message||e),okText:'Đã hiểu'});return;}
    if(!data||!Array.isArray(data.items)){SOP.dlg({title:'Sai định dạng',msg:'File thiếu danh sách items.',okText:'Đã hiểu'});return;}
    let nItem=0,nStr=0,idxTouched=false;
    for(const rec of data.items){
      let d=null;
      try{d=await SB.loadReport('sop_item',rec.id);}catch(e){}
      if(!d)continue;
      let touched=false;
      (rec.rows||[]).forEach(r=>{
        if(!r.en||!String(r.en).trim())return;
        if(SOP.setPath(d,r.p,r.en,r.vi)){nStr++;touched=true;}
      });
      if(touched){nItem++;await SB.saveReport('sop_item',rec.id,d);}
      // tên mục hiện ở cột trái đọc từ mục lục -> chép bản dịch tên sang idx
      const enName=(rec.rows||[]).find(r=>r.p==='name'&&r.en&&String(r.en).trim());
      if(enName){const f=SOP.findItemAny(rec.id);if(f){f.it.en_name=enName.en;idxTouched=true;}}
    }
    if(idxTouched)await SOP.saveIndex();
    SOP.dlg({title:'Đã nhập bản dịch',msg:`${nStr} chuỗi trong ${nItem} mục.`,okText:'Xong'});
    logAction('SOP nhập bản dịch',nStr+' chuỗi · '+nItem+' mục');
    if(SOP.curId)await SOP.open(SOP.curId);
  },
  // ghi bản dịch vào o.en[field] + lưu dấu vết bản VI lúc dịch vào o.envi[field]
  setPath(root,p,en,vi){
    const parts=p.split('.');const field=parts.pop();
    let o=root;
    for(const k of parts){o=o&&o[/^\d+$/.test(k)?Number(k):k];if(!o)return false;}
    if(Array.isArray(o)){ // ô bảng: rows.<ri>.<ci> -> field là chỉ số cột
      const ci=Number(field);if(isNaN(ci)||o[ci]===undefined)return false;
      o[ci]=en;return true;
    }
    if(!o||typeof o!=='object')return false;
    o.en=o.en||{};o.envi=o.envi||{};
    o.en[field]=en;o.envi[field]=vi!==undefined?vi:o[field];
    return true;
  }
};
// `const SOP` nằm ở global LEXICAL scope, KHÔNG có trên window (cùng bẫy với AUTH) ->
// i18n.js kiểm `window.SOP` sẽ trượt âm thầm nếu không phơi ra.
window.SOP=SOP;
// Ô chọn file ảnh + file bản dịch nằm trong HTML T4; nối sự kiện sau khi DOM sẵn sàng.
(function(){
  const w=()=>{
    const f=document.getElementById('sopFile');
    if(f)f.addEventListener('change',()=>SOP.onFile(f));
    const t=document.getElementById('sopTransFile');
    if(t)t.addEventListener('change',()=>SOP.onTransFile(t));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',w);else w();
  // Hộp thoại chung: Enter = đồng ý · Esc / bấm nền tối = huỷ (phải TRẢ Promise, nếu không
  // handler .dr-modal chung chỉ đóng lớp phủ mà lời gọi await treo mãi)
  document.addEventListener('keydown',e=>{
    if(!SOP._dlgRes)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();SOP.dlgClose(null);}
    else if(e.key==='Enter'&&e.target&&e.target.id==='sopDlgI'){e.preventDefault();
      const ok=document.getElementById('sopDlgOK');if(ok)ok.click();}
  },true);
  const dm=()=>{const m=document.getElementById('sopDlg');
    if(m)m.addEventListener('click',e=>{if(e.target===m&&SOP._dlgRes)SOP.dlgClose(null);});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',dm);else dm();
  // Phím tắt trong ô soạn tại chỗ: Ctrl+Enter lưu · Esc huỷ (Esc bắt ở giai đoạn capture để
  // không bị handler đóng .dr-modal chung của DR nuốt mất)
  document.addEventListener('keydown',e=>{
    if(!SOP._ed)return;
    const t=e.target;if(!t||(t.id!=='sopEdH'&&t.id!=='sopEdB'))return;
    if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();SOP.edSave();}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();SOP.edCancel();}
    else if(e.key==='Enter'&&t.id==='sopEdH'){e.preventDefault();const b=document.getElementById('sopEdB');if(b)b.focus();else SOP.edSave();}
  },true);
})();
