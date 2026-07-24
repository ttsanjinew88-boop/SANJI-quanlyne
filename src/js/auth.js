// ===== AUTH: ĐĂNG NHẬP + PHÂN QUYỀN THEO TAB =====
const PERM_TABS=[
  {k:'data',el:'tabData',label:'Dữ Liệu'},
  {k:'ko',el:'tabKo',label:'Hiệu Suất KO'},
  {k:'shift',el:'tabShift',label:'Phân Ca'},
  {k:'rank',el:'tabRank',label:'Xếp Hạng'},
  {k:'bc',el:null,label:'Báo Cáo Đại Lý'},
  {k:'log',el:'tabLog',label:'Lịch Sử'}
];
let CUR_PROFILE=null;
// Cấp bậc: lưu trong perms._role; preset = quyền mặc định khi chọn cấp bậc lúc tạo tài khoản
// Mỗi tab có 2 mức quyền: 'view' (chỉ xem) | 'edit' (xem + chỉnh sửa)
const ROLES={
  totruong:{label:'TỔ TRƯỞNG',color:'#3b82f6',preset:{data:'edit',ko:'edit',shift:'edit',rank:'edit',bc:'edit',log:'view'}},
  nhanvien:{label:'NHÂN VIÊN',color:'#64748b',preset:{data:'view',ko:'view'}}
};
// Quyền xem: có bất kỳ giá trị nào (view/edit/true cũ). Quyền sửa: đúng 'edit' (giá trị true cũ = chỉ xem)
function canView(k){if(!CUR_PROFILE)return false;if(CUR_PROFILE.is_admin)return true;return !!(CUR_PROFILE.perms||{})[k];}
function canEdit(k){if(!CUR_PROFILE)return false;if(CUR_PROFILE.is_admin)return true;return (CUR_PROFILE.perms||{})[k]==='edit';}
// Ghi lịch sử thao tác lên cloud
async function logAction(action,detail){
  if(!SB.ready()||!CUR_PROFILE)return;
  try{
    await SB.client().from('audit_log').insert({user_id:CUR_PROFILE.user_id,username:CUR_PROFILE.username,action,detail:detail||''});
  }catch(e){console.error('logAction',e);}
}
function roleOf(profile){
  if(!profile)return null;
  if(profile.is_admin)return{key:'admin',label:'ADMIN',color:'#7c3aed'};
  const k=(profile.perms&&profile.perms._role)==='totruong'?'totruong':'nhanvien';
  return{key:k,label:ROLES[k].label,color:ROLES[k].color};
}
const LOGIN_AT_KEY='login_at_v1';
const SESSION_MAX_MS=24*3600*1000; // phiên đăng nhập tối đa 24 giờ
function sessionExpired(){
  const at=Number(localStorage.getItem(LOGIN_AT_KEY)||0);
  return !at||Date.now()-at>SESSION_MAX_MS;
}
// ===== WHITE IP: chỉ IP trong danh sách mới được đăng nhập =====
let CUR_IP=null;
async function fetchMyIP(){
  if(CUR_IP)return CUR_IP;
  try{
    const r=await fetch('https://api.ipify.org?format=json');
    const j=await r.json();
    CUR_IP=j.ip||null;
  }catch(e){CUR_IP=null;}
  return CUR_IP;
}
// Danh sách trống = chưa bật White IP; lỗi mạng khi kiểm tra = cho qua (tránh tự khóa toàn hệ thống)
async function ipAllowed(){
  try{
    const{data,error}=await SB.client().rpc('get_whiteip');
    if(error)return true;
    const list=Array.isArray(data)?data:[];
    if(!list.length)return true;
    const ip=await fetchMyIP();
    if(!ip)return true;
    return list.includes(ip);
  }catch(e){return true;}
}
function showIpBlocked(){
  const box=document.querySelector('.login-box');
  if(box)box.innerHTML=`<div class="login-logo" style="background:linear-gradient(135deg,#dc2626,#7f1d1d)">✕</div>
    <div class="login-title" style="color:#f87171">IP KHÔNG ĐƯỢC PHÉP</div>
    <div class="login-sub" style="line-height:1.7">Thiết bị của bạn (IP: <b style="color:var(--tx)">${CUR_IP||'không xác định'}</b>)<br>không nằm trong danh sách White IP.<br>Liên hệ ADMIN để được thêm IP này.</div>`;
  document.getElementById('loginOverlay').style.display='flex';
}
const AUTH={
  emailOf(u){return u.trim().toLowerCase()+'@sanji.app';},
  async init(){
    if(!SB.ready()){
      document.getElementById('lg-err').textContent='Chưa cấu hình cloud (SB_URL/SB_KEY)';
      return;
    }
    if(!(await ipAllowed())){
      try{await SB.client().auth.signOut();}catch(e){}
      showIpBlocked();
      return;
    }
    try{
      const{data}=await SB.client().auth.getSession();
      if(data&&data.session){
        if(sessionExpired()){
          // quá 24h -> buộc đăng nhập lại
          await SB.client().auth.signOut();
          localStorage.removeItem(LOGIN_AT_KEY);
          document.getElementById('lg-err').textContent='Phiên đăng nhập đã hết hạn (24h) — vui lòng đăng nhập lại';
          return;
        }
        // BẮT BUỘC 2FA khi khôi phục phiên
        AUTH._pendingUser=data.session.user;
        const{data:factors}=await SB.client().auth.mfa.listFactors();
        const verified=((factors&&factors.totp)||[]).find(f=>f.status==='verified');
        if(verified){
          if(await AUTH.needs2fa()){AUTH.show2faStep();return;}
          AUTH._pendingUser=null;await AUTH.postLogin(data.session.user);return;
        }
        await AUTH.showEnrollStep();return;
      }
    }catch(e){console.error('AUTH.init',e);}
    // chưa đăng nhập -> overlay đang hiển thị sẵn
  },
  async login(){
    const u=document.getElementById('lg-user').value.trim();
    const p=document.getElementById('lg-pass').value;
    const err=document.getElementById('lg-err'),btn=document.getElementById('lg-btn');
    err.textContent='';
    if(!u||!p){err.textContent='Nhập tên đăng nhập và mật khẩu';return;}
    if(!SB.ready()){err.textContent='Chưa cấu hình cloud';return;}
    btn.disabled=true;btn.textContent='Đang đăng nhập...';
    try{
      if(!(await ipAllowed())){showIpBlocked();return;}
      // tài khoản đang bị khóa?
      try{
        const{data:locked}=await SB.client().rpc('is_locked',{uname:u.toLowerCase()});
        if(locked===true){
          err.textContent='Tài khoản đã bị KHÓA (đăng nhập sai quá 5 lần hoặc bị khóa thủ công) — liên hệ ADMIN/Tổ Trưởng để mở khóa';
          return;
        }
      }catch(e){}
      const{data,error}=await SB.client().auth.signInWithPassword({email:AUTH.emailOf(u),password:p});
      if(error){
        if(/invalid/i.test(error.message)){
          // đếm số lần sai — quá 5 lần server tự khóa
          let msg='Sai tên đăng nhập hoặc mật khẩu';
          try{
            const{data:lf}=await SB.client().rpc('login_fail',{uname:u.toLowerCase()});
            if(lf&&lf.locked)msg='Sai quá 5 lần — tài khoản đã bị KHÓA. Liên hệ ADMIN/Tổ Trưởng để mở khóa.';
            else if(lf&&lf.fails)msg='Sai tên đăng nhập hoặc mật khẩu — còn '+(5-lf.fails)+' lần thử trước khi bị khóa';
          }catch(e){}
          err.textContent=msg;
        }else{
          err.textContent='Lỗi: '+error.message;
        }
        return;
      }
      try{await SB.client().rpc('login_ok',{uname:u.toLowerCase()});}catch(e){}
      localStorage.setItem(LOGIN_AT_KEY,String(Date.now()));
      // BẮT BUỘC 2FA: đã bật -> nhập mã; chưa bật -> ép thiết lập trước khi vào
      AUTH._pendingUser=data.user;
      const{data:factors}=await SB.client().auth.mfa.listFactors();
      const verified=((factors&&factors.totp)||[]).find(f=>f.status==='verified');
      if(verified){AUTH.show2faStep();}
      else{await AUTH.showEnrollStep();}
    }catch(e){
      console.error('AUTH.login',e);
      err.textContent='Lỗi kết nối, thử lại';
    }finally{
      btn.disabled=false;btn.textContent='Đăng nhập';
    }
  },
  async needs2fa(){
    try{
      const{data}=await SB.client().auth.mfa.getAuthenticatorAssuranceLevel();
      return !!data&&data.nextLevel==='aal2'&&data.currentLevel!=='aal2';
    }catch(e){return false;}
  },
  show2faStep(){
    document.getElementById('lg-step1').style.display='none';
    document.getElementById('lg-stepEnroll').style.display='none';
    document.getElementById('lg-step2fa').style.display='block';
    document.getElementById('lg-err').textContent='';
    const c=document.getElementById('lg-2fa-code');c.value='';setTimeout(()=>c.focus(),100);
  },
  _reset2faStep(){
    document.getElementById('lg-step1').style.display='block';
    document.getElementById('lg-step2fa').style.display='none';
    document.getElementById('lg-stepEnroll').style.display='none';
    document.getElementById('lg-2fa-code').value='';
    document.getElementById('lg-enroll-code').value='';
  },
  _enrollFactorId:null,_enrollSecret:'',
  // Dựng link otpauth với nhãn tùy chỉnh: "He Thong NE : <TÊN> - <ngày>"
  _buildOtpUri(secret,uname){
    const now=new Date();
    const dd=String(now.getDate()).padStart(2,'0'),mm=String(now.getMonth()+1).padStart(2,'0'),yy=now.getFullYear();
    const issuer='He Thong NE';
    const account=(uname||'').toUpperCase()+' - '+dd+'/'+mm+'/'+yy;
    return 'otpauth://totp/'+encodeURIComponent(issuer)+':'+encodeURIComponent(account)+'?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30';
  },
  async showEnrollStep(){
    document.getElementById('lg-step1').style.display='none';
    document.getElementById('lg-step2fa').style.display='none';
    document.getElementById('lg-stepEnroll').style.display='block';
    document.getElementById('lg-err').textContent='';
    try{
      // dọn factor chưa xác nhận còn sót
      const{data:f}=await SB.client().auth.mfa.listFactors();
      for(const fac of (f.all||[]))if(fac.status==='unverified'){try{await SB.client().auth.mfa.unenroll({factorId:fac.id});}catch(e){}}
      const{data,error}=await SB.client().auth.mfa.enroll({factorType:'totp',friendlyName:'SANJI-'+Date.now()});
      if(error){document.getElementById('lg-err').textContent='Lỗi tạo 2FA: '+error.message;return;}
      AUTH._enrollFactorId=data.id;
      AUTH._enrollSecret=data.totp.secret;
      const uname=(AUTH._pendingUser&&AUTH._pendingUser.email||'').split('@')[0];
      document.getElementById('lg-secret').textContent=data.totp.secret;
      const uri=AUTH._buildOtpUri(data.totp.secret,uname);
      try{
        const qr=qrcode(0,'M');qr.addData(uri);qr.make();
        document.getElementById('lg-qr').src=qr.createDataURL(5,8);
      }catch(e){document.getElementById('lg-qr').src=data.totp.qr_code;} // dự phòng QR mặc định Supabase
      const c=document.getElementById('lg-enroll-code');c.value='';setTimeout(()=>c.focus(),150);
    }catch(e){console.error('showEnrollStep',e);document.getElementById('lg-err').textContent='Lỗi thiết lập 2FA';}
  },
  async confirmEnrollLogin(){
    const code=document.getElementById('lg-enroll-code').value.trim();
    const err=document.getElementById('lg-err'),btn=document.getElementById('lg-enroll-btn');
    err.textContent='';
    if(!/^\d{6}$/.test(code)){err.textContent='Nhập đúng mã 6 số';return;}
    btn.disabled=true;btn.textContent='Đang xác nhận...';
    try{
      const{error}=await SB.client().auth.mfa.challengeAndVerify({factorId:AUTH._enrollFactorId,code});
      if(error){err.textContent='Mã không đúng — thử lại';return;}
      const u=AUTH._pendingUser;AUTH._pendingUser=null;AUTH._reset2faStep();
      try{await logAction('Bật 2FA','Google Authenticator (bắt buộc lúc đăng nhập)');}catch(e){}
      await AUTH.postLogin(u);
    }catch(e){console.error('confirmEnrollLogin',e);err.textContent='Lỗi xác nhận 2FA';}
    finally{btn.disabled=false;btn.textContent='Xác nhận & vào hệ thống';}
  },
  copyEnrollSecret(){try{navigator.clipboard.writeText(AUTH._enrollSecret);}catch(e){}},
  async cancel2fa(){
    try{await SB.client().auth.signOut();}catch(e){}
    AUTH._pendingUser=null;
    AUTH._reset2faStep();
    document.getElementById('lg-err').textContent='';
  },
  async verifyLogin2fa(){
    const code=document.getElementById('lg-2fa-code').value.trim();
    const err=document.getElementById('lg-err'),btn=document.getElementById('lg-2fa-btn');
    err.textContent='';
    if(!/^\d{6}$/.test(code)){err.textContent='Nhập đúng mã 6 số';return;}
    btn.disabled=true;btn.textContent='Đang xác minh...';
    try{
      const{data:factors}=await SB.client().auth.mfa.listFactors();
      const totp=(factors.totp||[]).find(f=>f.status==='verified');
      if(!totp){err.textContent='Không tìm thấy thiết bị 2FA';return;}
      const{data:ch,error:ce}=await SB.client().auth.mfa.challenge({factorId:totp.id});
      if(ce){err.textContent='Lỗi: '+ce.message;return;}
      const{error:ve}=await SB.client().auth.mfa.verify({factorId:totp.id,challengeId:ch.id,code});
      if(ve){err.textContent='Mã không đúng hoặc đã hết hạn — thử lại';return;}
      const u=AUTH._pendingUser||(await SB.client().auth.getUser()).data.user;
      AUTH._pendingUser=null;AUTH._reset2faStep();
      await AUTH.postLogin(u);
    }catch(e){console.error('verifyLogin2fa',e);err.textContent='Lỗi xác minh 2FA';}
    finally{btn.disabled=false;btn.textContent='Xác minh';}
  },
  async postLogin(user){
    try{
      const{data,error}=await SB.client().from('profiles').select('*').eq('user_id',user.id).single();
      if(error||!data){
        document.getElementById('lg-err').textContent='Tài khoản chưa có hồ sơ quyền — liên hệ admin';
        await SB.client().auth.signOut();
        return;
      }
      CUR_PROFILE=data;
      document.getElementById('loginOverlay').style.display='none';
      applyPerms();
      bootData();
    }catch(e){
      console.error('AUTH.postLogin',e);
      document.getElementById('lg-err').textContent='Lỗi tải hồ sơ người dùng';
    }
  },
  async logout(){
    try{await SB.client().auth.signOut();}catch(e){}
    localStorage.removeItem(LOGIN_AT_KEY);
    location.reload();
  }
};
// Kiểm tra định kỳ: đang dùng mà quá 24h kể từ lúc đăng nhập -> tự đăng xuất
setInterval(function(){
  if(CUR_PROFILE&&sessionExpired()){
    alert('Phiên đăng nhập đã hết hạn (24 giờ) — hệ thống sẽ đăng xuất.');
    AUTH.logout();
  }
},5*60*1000);
// Auto-sync 60s: nút Xác Nhận Telegram cộng điểm thẳng lên cloud -> kéo về máy đang mở, khỏi F5
setInterval(async function(){
  if(!CUR_PROFILE||!SB.ready()||!CUR_MONTH||document.hidden||_anDirty)return;
  try{
    const an=await SB.loadReport('anomaly',CUR_MONTH);
    const fresh=(an&&an.abuse)?an:{abuse:{},mkt:{}};
    if(_anDirty)return; // vừa có chỉnh tay trong lúc chờ mạng -> bỏ lượt sync này
    if(JSON.stringify(fresh)!==JSON.stringify(KO_AN)){
      KO_AN=fresh;
      setCloudStatus('Đã đồng bộ điểm bất thường mới từ Telegram ✓');
      const act=document.querySelector('.pg.active')?.id;
      if(act==='pg-ko')rKO();
      if(act==='pg-rank')rRank();
    }
  }catch(e){}
},60*1000);
function curPerms(){
  if(!CUR_PROFILE)return{};
  if(CUR_PROFILE.is_admin)return{data:true,ko:true,shift:true,rank:true,bc:true};
  return CUR_PROFILE.perms||{};
}
function applyPerms(){
  const p=CUR_PROFILE;if(!p)return;
  PERM_TABS.forEach(t=>{
    if(!t.el)return;
    const el=document.getElementById(t.el);
    if(el)el.style.display=canView(t.k)?'':'none';
  });
  const tsb2=document.getElementById('tsb2');
  if(tsb2)tsb2.style.display=canView('bc')?'':'none';
  // Quản Trị: admin thấy đầy đủ; Tổ Trưởng thấy để đổi mật khẩu nhân viên
  const ta=document.getElementById('tabAdmin');
  if(ta)ta.style.display=(p.is_admin||roleOf(p).key==='totruong')?'':'none';
  // Chỉ quyền SỬA tab Dữ Liệu mới được upload Excel
  const upBtn=document.getElementById('btnUploadExcel');
  if(upBtn)upBtn.parentElement.style.display=canEdit('data')?'':'none';
  // Tab Nghi Ngờ trong BC tool: ADMIN + Tổ Trưởng (TT xem/tô ô/gửi Sheet; đánh dấu-bỏ nghi ngờ vẫn chỉ ADMIN)
  const tsus=document.getElementById('bcTabSuspect');
  const isTTup=p.is_admin||roleOf(p).key==='totruong';
  if(tsus)tsus.style.display=isTTup?'':'none';
  const sbt=document.getElementById('bcSusSheetBtn');
  if(sbt)sbt.style.display=isTTup?'':'none';
  const spb=document.getElementById('bcSusSepBtn');
  if(spb)spb.style.display=p.is_admin?'':'none';
  // View Đề Xuất Hạn Mức Duyệt: chỉ quyền SỬA tab Hiệu Suất KO mới thấy
  const klb=document.getElementById('koLimitBtn');
  if(klb)klb.style.display=canEdit('ko')?'':'none';
  const chip=document.getElementById('userChip');
  document.getElementById('userChipName').textContent=(p.username||'').toUpperCase()+' · '+roleOf(p).label;
  chip.style.display='flex';
  // nếu tab đang mở bị ẩn -> nhảy sang tab đầu tiên được phép
  const active=document.querySelector('.tabs-wrap .tab.active');
  if(active&&active.style.display==='none'){
    const first=[...document.querySelectorAll('.tabs-wrap .tab')].find(t=>t.style.display!=='none');
    if(first)first.click();
  }
  // nếu đang đứng ở BC tool mà mất quyền -> về tool 1
  if(!canView('bc')&&document.getElementById('t2').style.display!=='none'){
    switchTool('t1');
  }
}