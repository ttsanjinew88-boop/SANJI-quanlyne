// ===== NHẮC NHỞ TELEGRAM — nguồn thứ 3 của tab Dữ Liệu (port từ web app Apps Script) =====
// Cấu hình lưu cloud: reports type='tgremind' month='all' -> {groups:[{id,name,chatId,topicId,enabled,reminders:[]}]}
// ĐỘNG CƠ KHÔNG CHẠY TRONG TRÌNH DUYỆT: pg_cron gọi Edge Function `tg-remind` mỗi phút (xem
// supabase_remind_setup.sql). Đóng dashboard thì nhắc nhở VẪN chạy. Trình duyệt chỉ soạn cấu hình,
// gửi thử và xem lịch sử. Múi giờ khóa cứng GMT+7 (server tự tính, không đọc giờ máy người dùng).
// Token bot KHÔNG bao giờ có trong file này — nằm ở secret TG_BOT_TOKEN của Supabase.
const RM={
  CFG:{groups:[]}, cur:null, loaded:false, loading:false, view:'cfg', tickAt:0, dirty:false,
  MODES:[['','Chọn giờ'],['hourly','Mỗi giờ'],['daily','Mỗi ngày'],['exact','Đúng giờ'],['interval','Cách giờ']],
  canEdit(){return !!CUR_PROFILE&&(CUR_PROFILE.is_admin||roleOf(CUR_PROFILE).key==='totruong');},
  uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);},
  modeLabel(m){const f=RM.MODES.filter(x=>x[0]===m)[0];return f?f[1]:m;},
  curGroup(){return RM.CFG.groups.filter(g=>g.id===RM.cur)[0]||null;},

  // ---------- nạp / lưu ----------
  // Nạp cấu hình từ cloud. CHỈ render sau khi nạp xong — render sớm rồi mới nạp thì thao tác
  // của người dùng trong lúc chờ sẽ bị bản trên cloud ghi đè (đã vấp khi thử).
  async boot(){
    if(RM.loaded){RM.render();return;}
    if(RM.loading)return;
    RM.loading=true;
    const main=document.getElementById('rmMain'),gate=document.getElementById('rmNoPerm');
    if(!RM.canEdit()){RM.loading=false;RM.render();return;}
    gate.style.display='none';main.style.display='block';
    document.getElementById('rmStatus').textContent='Đang tải...';
    try{
      const d=await SB.loadReport('tgremind','all');
      RM.CFG=(d&&d.groups)?d:{groups:[]};
    }catch(e){RM.CFG={groups:[]};}
    RM.loaded=true;RM.loading=false;
    if(!RM.cur&&RM.CFG.groups.length)RM.cur=RM.CFG.groups[0].id;
    RM.render();
    RM.loadTick();
  },
  async save(notify,label){
    try{
      await SB.saveReport('tgremind','all',RM.CFG);
      RM.dirty=false;
      if(notify)RM.chip('✓ Đã lưu cấu hình');
      if(label)RM.log('cfg',label,'ok');
    }catch(e){alert('Lỗi lưu cấu hình nhắc nhở: '+(e.message||e));}
  },
  // Ghi lịch sử RIÊNG của tab này (bảng tg_remind_log) — không trộn vào tab Lịch Sử chung
  async log(kind,detail,status){
    if(!SB.ready()||!CUR_PROFILE)return;
    try{
      await SB.client().from('tg_remind_log').insert({kind,who:CUR_PROFILE.username||'',detail:String(detail||'').slice(0,300),status:status||'ok'});
    }catch(e){/* lịch sử hỏng không được chặn thao tác chính */}
  },
  chip(t){
    const el=document.getElementById('rmChip');if(!el)return;
    el.textContent=t;el.style.opacity='1';
    clearTimeout(RM._ct);RM._ct=setTimeout(()=>{el.style.opacity='0';},2600);
  },
  async loadTick(){
    try{
      const d=await SB.loadReport('tgremind_tick','all');
      RM.tickAt=d&&d.at?Number(d.at):0;
    }catch(e){RM.tickAt=0;}
    RM.renderStatus();
  },

  // ---------- gọi Edge Function ----------
  async call(body){
    const{data:sess}=await SB.client().auth.getSession();
    const token=sess&&sess.session&&sess.session.access_token;
    if(!token)throw new Error('Phiên hết hạn, đăng nhập lại');
    const r=await fetch(SB_URL+'/functions/v1/tg-remind',{method:'POST',headers:{'Authorization':'Bearer '+token,'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    let j=null;try{j=await r.json();}catch(e){}
    if(!j)throw new Error('Không gọi được máy chủ (hàm tg-remind đã deploy chưa?)');
    if(!j.ok)throw new Error(j.description||'Lỗi không rõ');
    return j;
  },

  // ---------- nhóm ----------
  addGroup(){
    if(!RM.canEdit())return;
    const g={id:RM.uid('g'),name:'Nhóm mới',chatId:'',topicId:'',enabled:true,reminders:[]};
    RM.CFG.groups.push(g);RM.cur=g.id;RM.render();RM.save(false,'Tạo nhóm nhận mới');
  },
  delGroup(){
    const g=RM.curGroup();if(!g||!RM.canEdit())return;
    if(!confirm('Xóa nhóm "'+(g.name||'')+'" và toàn bộ mốc nhắc của nhóm này?'))return;
    RM.CFG.groups=RM.CFG.groups.filter(x=>x.id!==g.id);
    RM.cur=RM.CFG.groups.length?RM.CFG.groups[0].id:null;
    RM.render();RM.save(true,'Xóa nhóm nhận "'+(g.name||'')+'"');
  },
  selGroup(id){RM.cur=id;RM.render();},
  setGroup(k,v){const g=RM.curGroup();if(!g||!RM.canEdit())return;g[k]=v;RM.dirty=true;if(k==='name')RM.renderGroupSel();},
  toggleGroup(){
    const g=RM.curGroup();if(!g||!RM.canEdit())return;
    g.enabled=g.enabled===false;RM.render();
    RM.save(false,(g.enabled?'Bật':'Tắt')+' nhóm nhận "'+(g.name||'')+'"');
  },

  // ---------- mốc nhắc ----------
  addRem(){
    const g=RM.curGroup();if(!g||!RM.canEdit())return;
    g.reminders.push({id:RM.uid('r'),mode:'',time:'',content:'',enabled:true});
    RM.dirty=true;RM.renderRems();
  },
  delRem(rid){
    const g=RM.curGroup();if(!g||!RM.canEdit())return;
    const r=g.reminders.filter(x=>x.id===rid)[0];
    if(!confirm('Xóa mốc nhắc này?'))return;
    g.reminders=g.reminders.filter(x=>x.id!==rid);
    RM.renderRems();RM.save(true,'Xóa mốc nhắc '+((r&&r.time)||'')+' của nhóm "'+(g.name||'')+'"');
  },
  setRem(rid,k,v){
    const g=RM.curGroup();if(!g||!RM.canEdit())return;
    const r=g.reminders.filter(x=>x.id===rid)[0];if(!r)return;
    r[k]=v;RM.dirty=true;
    if(k==='mode'){r.time='';RM.renderRems();}else{RM.renderStat();}
  },
  toggleRem(rid){
    const g=RM.curGroup();if(!g||!RM.canEdit())return;
    const r=g.reminders.filter(x=>x.id===rid)[0];if(!r)return;
    r.enabled=r.enabled===false;RM.renderRems();
    RM.save(false,(r.enabled?'Bật':'Tắt')+' mốc nhắc '+(r.time||''));
  },
  async testRem(rid){
    const g=RM.curGroup();if(!g)return;
    const r=g.reminders.filter(x=>x.id===rid)[0];if(!r)return;
    if(!r.content){alert('Mốc nhắc này chưa có nội dung.');return;}
    if(!g.chatId){alert('Nhóm này chưa có ID nhóm Telegram.');return;}
    try{
      await RM.call({action:'test',chatId:g.chatId,topicId:g.topicId||'',text:r.content});
      RM.chip('✓ Đã gửi thử tới nhóm');
      RM.log('cfg','Gửi thử mốc nhắc tới nhóm "'+(g.name||'')+'"','ok');
    }catch(e){alert('Gửi thử lỗi: '+(e.message||e));}
  },
  async testConn(){
    const g=RM.curGroup();if(!g)return;
    const el=document.getElementById('rmConnMsg');
    if(!g.chatId){el.style.color='var(--re)';el.textContent='❌ Chưa nhập ID nhóm Telegram.';return;}
    el.style.color='var(--mu)';el.textContent='Đang kiểm tra...';
    try{
      const j=await RM.call({action:'check',chatId:g.chatId,topicId:g.topicId||''});
      el.style.color='var(--gr)';
      el.textContent='✅ Bot @'+(j.bot||'')+' — đã gửi tin kiểm tra vào nhóm.';
      RM.log('cfg','Kiểm tra kết nối nhóm "'+(g.name||'')+'"','ok');
    }catch(e){el.style.color='var(--re)';el.textContent='❌ '+(e.message||e);}
  },

  // ---------- khung nhìn ----------
  setView(v,el){
    RM.view=v;
    el.parentElement.querySelectorAll('.vt-btn').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('rmPaneCfg').style.display=(v==='cfg')?'block':'none';
    document.getElementById('rmPaneLog').style.display=(v==='log')?'block':'none';
    if(v==='log')RM.loadLog();
  },

  // ---------- render ----------
  render(){
    const gate=document.getElementById('rmNoPerm'),main=document.getElementById('rmMain');
    if(!RM.canEdit()){gate.style.display='block';main.style.display='none';return;}
    gate.style.display='none';main.style.display='block';
    RM.renderGroupSel();
    const g=RM.curGroup();
    document.getElementById('rmEmpty').style.display=g?'none':'block';
    document.getElementById('rmBody').style.display=g?'block':'none';
    if(!g)return;
    document.getElementById('rmName').value=g.name||'';
    document.getElementById('rmChat').value=g.chatId||'';
    document.getElementById('rmTopic').value=g.topicId||'';
    document.getElementById('rmSw').className='rm-sw'+(g.enabled===false?'':' on');
    document.getElementById('rmConnMsg').textContent='';
    RM.renderRems();
    RM.renderStatus();
  },
  renderGroupSel(){
    const s=document.getElementById('rmGroupSel');if(!s)return;
    s.innerHTML=RM.CFG.groups.map(g=>'<option value="'+g.id+'"'+(g.id===RM.cur?' selected':'')+'>'+
      hesc((g.enabled===false?'⏸ ':'')+(g.name||'(chưa đặt tên)'))+'</option>').join('');
    s.style.display=RM.CFG.groups.length?'':'none';
  },
  renderStatus(){
    const bar=document.getElementById('rmStatus');if(!bar)return;
    let bad='';
    if(!RM.tickAt)bad='⚠️ Động cơ chưa chạy lần nào — kiểm tra đã bật pg_cron và deploy hàm tg-remind chưa (xem supabase_remind_setup.sql).';
    else{
      const m=Math.round((Date.now()-RM.tickAt)/60000);
      if(m>5)bad='⚠️ Động cơ ngừng '+m+' phút — nhắc nhở có thể không được gửi. Kiểm tra job pg_cron trên Supabase.';
    }
    if(bad){
      bar.style.background='rgba(239,68,68,.12)';bar.style.border='1px solid rgba(239,68,68,.5)';bar.style.color='#fca5a5';
      bar.textContent=bad;
    }else{
      const m=Math.round((Date.now()-RM.tickAt)/60000);
      bar.style.background='rgba(16,185,129,.10)';bar.style.border='1px solid rgba(16,185,129,.4)';bar.style.color='#6ee7b7';
      bar.textContent='✅ Động cơ đang chạy — lượt kiểm tra gần nhất '+(m<=1?'dưới 1 phút trước':m+' phút trước')+' (giờ Việt Nam GMT+7).';
    }
  },
  renderRems(){
    const g=RM.curGroup();if(!g)return;
    const wrap=document.getElementById('rmList');
    if(!g.reminders.length){
      wrap.innerHTML='<div style="padding:16px 4px;font-size:.68rem;color:var(--mu)">Chưa có mốc nhắc nào. Bấm "Thêm mốc nhắc".</div>';
      RM.renderStat();return;
    }
    wrap.innerHTML=g.reminders.map(r=>{
      const opts=RM.MODES.map(m=>'<option value="'+m[0]+'"'+(r.mode===m[0]?' selected':'')+'>'+m[1]+'</option>').join('');
      const ph=r.mode==='hourly'?'phút 0–59':(r.mode==='exact'?'08:00,12:00':(r.mode==='interval'?'số giờ (vd 3)':'HH:mm'));
      return '<div class="rm-row">'+
        '<div>'+
          '<select class="rm-inp rm-msel'+(r.mode?' has':'')+'" onchange="RM.setRem(\''+r.id+'\',\'mode\',this.value)">'+opts+'</select>'+
          (r.mode?'<input class="rm-inp" value="'+hesc(r.time||'')+'" placeholder="'+ph+'" oninput="RM.setRem(\''+r.id+'\',\'time\',this.value)">':'')+
          '<div class="rm-try"><a href="javascript:void(0)" onclick="RM.testRem(\''+r.id+'\')">gửi thử ▶</a></div>'+
        '</div>'+
        '<textarea class="rm-inp rm-ta" data-noi18n placeholder="Nội dung tin nhắn..." oninput="RM.setRem(\''+r.id+'\',\'content\',this.value)">'+hesc(r.content||'')+'</textarea>'+
        '<div class="rm-c"><div class="rm-sw'+(r.enabled===false?'':' on')+'" onclick="RM.toggleRem(\''+r.id+'\')"><i></i></div></div>'+
        '<div class="rm-c"><a class="rm-trash" href="javascript:void(0)" onclick="RM.delRem(\''+r.id+'\')" title="Xóa">🗑</a></div>'+
      '</div>';
    }).join('');
    RM.renderStat();
  },
  renderStat(){
    const g=RM.curGroup(),el=document.getElementById('rmStat');if(!el)return;
    if(!g){el.textContent='';return;}
    const on=g.reminders.filter(r=>r.enabled!==false).length;
    el.textContent=g.reminders.length+' mốc nhắc · '+on+' đang bật';
  },

  // ---------- lịch sử riêng ----------
  async loadLog(){
    const w=document.getElementById('rmLogList');
    w.innerHTML='<div style="padding:14px 4px;font-size:.68rem;color:var(--mu)">Đang tải...</div>';
    try{
      const{data,error}=await SB.client().from('tg_remind_log').select('at,kind,who,detail,status').order('at',{ascending:false}).limit(200);
      if(error)throw error;
      if(!data||!data.length){w.innerHTML='<div style="padding:14px 4px;font-size:.68rem;color:var(--mu)">Chưa có ghi nhận nào.</div>';return;}
      w.innerHTML=data.map(it=>{
        const ok=String(it.status||'').indexOf('ok')===0;
        return '<div class="rm-log">'+
          '<div class="rm-log-t">'+hesc(RM.fmtTime(it.at))+'</div>'+
          '<div>'+(it.kind==='send'?'Gửi tin':'Thao tác')+'</div>'+
          '<div data-noi18n>'+hesc(it.who||'HỆ THỐNG')+'</div>'+
          '<div data-noi18n>'+hesc(it.detail||'')+'</div>'+
          '<div style="color:'+(ok?'var(--gr)':'var(--re)')+'" data-noi18n>'+hesc(it.status||'')+'</div>'+
        '</div>';
      }).join('');
    }catch(e){w.innerHTML='<div style="padding:14px 4px;font-size:.68rem;color:var(--re)">Lỗi tải lịch sử: '+hesc(e.message||String(e))+' — đã chạy supabase_remind_setup.sql chưa?</div>';}
  },
  fmtTime(iso){
    // Hiển thị theo GMT+7 để khớp với giờ động cơ chấm mốc
    const d=new Date(iso);if(isNaN(d))return String(iso||'');
    const v=new Date(d.getTime()+7*3600000),p=n=>n<10?'0'+n:''+n;
    return p(v.getUTCDate())+'/'+p(v.getUTCMonth()+1)+'/'+v.getUTCFullYear()+' '+p(v.getUTCHours())+':'+p(v.getUTCMinutes())+':'+p(v.getUTCSeconds());
  }
};
window.RM=RM;
