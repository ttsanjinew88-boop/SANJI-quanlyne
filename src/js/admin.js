// ===== ADMIN PANEL =====
function rAdminPanel(){
  if(!CUR_PROFILE)return;
  const isAdmin=CUR_PROFILE.is_admin,isTT=roleOf(CUR_PROFILE).key==='totruong';
  if(!isAdmin&&!isTT)return;
  // Tổ Trưởng: ẩn form tạo tài khoản + khu xóa dữ liệu, chỉ thấy danh sách để đổi mật khẩu nhân viên
  const createCard=document.getElementById('au-user');
  if(createCard)createCard.closest('.chart-card').style.display=isAdmin?'':'none';
  const delCard=document.getElementById('admDeleteCard');
  if(delCard){delCard.style.display=isAdmin?'':'none';if(isAdmin)admFillDelMonths();}
  const ipCard=document.getElementById('admIpCard');
  if(ipCard){ipCard.style.display=isAdmin?'':'none';if(isAdmin)admLoadIps();}
  const pf=document.getElementById('au-perms');
  if(isAdmin&&!pf.dataset.built){
    pf.innerHTML=PERM_TABS.map(t=>
      `<label class="adm-chk" style="gap:7px">${t.label}
        <select data-k="${t.k}" class="adm-inp" style="min-width:76px;padding:3px 6px;font-size:.65rem">
          <option value="">—</option><option value="view">Xem</option><option value="edit">Sửa</option>
        </select>
      </label>`).join('');
    pf.dataset.built="1";
    admRolePreset();
  }
  admLoadUsers();
}
function admRolePreset(){
  const r=document.getElementById('au-role').value;
  const preset=(ROLES[r]||ROLES.nhanvien).preset;
  document.querySelectorAll('#au-perms select[data-k]').forEach(s=>{s.value=preset[s.dataset.k]||'';});
}
function permVal(v){return v==='edit'?'edit':(v?'view':'');}
function permLabel(v){return v==='edit'?'Sửa':(v?'Xem':'—');}
async function admLoadUsers(){
  const list=document.getElementById('admUserList');
  const isAdmin=CUR_PROFILE.is_admin;
  list.innerHTML='<div style="color:var(--mu);font-size:.7rem;padding:10px 0">Đang tải...</div>';
  try{
    const{data,error}=await SB.client().from('profiles').select('*').order('created_at');
    if(error)throw error;
    // trạng thái khóa + số lần sai của từng tài khoản
    const lockMap={};
    try{
      const{data:sec}=await SB.client().from('login_security').select('*');
      (sec||[]).forEach(x=>{lockMap[x.username]={locked:x.locked,fails:x.fails};});
    }catch(e){}
    const headPerms=isAdmin?PERM_TABS.map(t=>`<th class="tc">${t.label}</th>`).join(''):'';
    list.innerHTML=`<table class="adm-tbl"><thead><tr><th>Tài khoản</th><th class="tc">Cấp bậc</th>${headPerms}${isAdmin?'<th class="tc">Admin</th>':''}<th class="tc">Khóa TK</th><th class="tc">Reset 2FA</th><th class="tc">Mật khẩu</th></tr></thead><tbody>`+
      data.map(u=>{
        const perms=u.perms||{};
        const isSelf=u.user_id===CUR_PROFILE.user_id;
        const role=roleOf(u);
        const roleCell=u.is_admin
          ?`<span style="background:rgba(124,58,237,.18);color:var(--pu2);border-radius:10px;padding:2px 10px;font-size:.6rem;font-weight:800">ADMIN</span>`
          :(isAdmin
            ?`<select class="adm-inp" style="min-width:110px;padding:4px 8px;font-size:.65rem" onchange="admSetRole('${u.user_id}',this.value,this)">
                <option value="nhanvien" ${role.key==='nhanvien'?'selected':''}>Nhân viên</option>
                <option value="totruong" ${role.key==='totruong'?'selected':''}>Tổ Trưởng</option>
              </select>`
            :`<span style="background:rgba(100,116,139,.18);color:var(--mu2);border-radius:10px;padding:2px 10px;font-size:.6rem;font-weight:800">${role.label}</span>`);
        // Nút đổi mật khẩu: admin đổi tất cả; Tổ Trưởng chỉ đổi Nhân viên; ai cũng đổi được của mình (nút trên chip)
        const canPw=isAdmin||(role.key==='nhanvien'&&!u.is_admin);
        const pwCell=(canPw&&!isSelf)
          ?`<button onclick="admChangePw('${u.user_id}','${(u.username||'').replace(/'/g,'')}')" style="padding:3px 10px;background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.35);color:var(--pu2);border-radius:5px;cursor:pointer;font-size:.62rem;font-weight:700">Đổi MK</button>`
          :(isSelf?'<span style="color:var(--mu);font-size:.6rem">(nút Đổi MK trên góc phải)</span>':'<span style="color:var(--mu)">—</span>');
        const permCells=isAdmin
          ?PERM_TABS.map(t=>`<td class="tc">${u.is_admin
              ?'<span style="color:var(--pu2);font-size:.62rem;font-weight:700">Sửa</span>'
              :`<select class="adm-inp" style="min-width:66px;padding:3px 4px;font-size:.62rem" onchange="admSetPermLevel('${u.user_id}','${t.k}',this.value,this)">
                  <option value="" ${!perms[t.k]?'selected':''}>—</option>
                  <option value="view" ${permVal(perms[t.k])==='view'?'selected':''}>Xem</option>
                  <option value="edit" ${permVal(perms[t.k])==='edit'?'selected':''}>Sửa</option>
                </select>`}</td>`).join('')
          :'';
        const adminCell=isAdmin?`<td class="tc"><input type="checkbox" ${u.is_admin?'checked':''} ${isSelf?'disabled':''} onchange="admSetAdmin('${u.user_id}',this.checked,this)"></td>`:'';
        // Khóa TK: admin khóa được mọi người (trừ mình); Tổ Trưởng chỉ khóa Nhân viên
        const lk=lockMap[u.username]||{locked:false,fails:0};
        const canLock=(isAdmin&&!isSelf)||(!isAdmin&&role.key==='nhanvien'&&!u.is_admin);
        const lockCell=canLock
          ?`<button onclick="admToggleLock('${(u.username||'').replace(/'/g,'')}',${lk.locked?'false':'true'})" style="padding:3px 10px;border-radius:5px;cursor:pointer;font-size:.62rem;font-weight:700;${lk.locked?'background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);color:#10b981':'background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#f87171'}">${lk.locked?'Mở khóa':'Khóa'}</button>`
            +(lk.locked?'<div style="font-size:.55rem;color:#f87171;margin-top:2px;font-weight:800">ĐANG KHÓA</div>':(lk.fails?`<div style="font-size:.55rem;color:var(--mu);margin-top:2px">sai ${lk.fails} lần</div>`:''))
          :(lk.locked?'<span style="color:#f87171;font-size:.6rem;font-weight:800">KHÓA</span>':'<span style="color:var(--mu)">—</span>');
        // Reset 2FA: admin reset mọi người; Tổ Trưởng reset Nhân viên
        const canReset=isAdmin||(role.key==='nhanvien'&&!u.is_admin);
        const resetCell=canReset
          ?`<button onclick="admReset2fa('${u.user_id}','${(u.username||'').replace(/'/g,'')}')" style="padding:3px 10px;border-radius:5px;cursor:pointer;font-size:.62rem;font-weight:700;background:rgba(6,182,212,.15);border:1px solid rgba(6,182,212,.4);color:var(--cy)">Reset</button>`
          :'<span style="color:var(--mu)">—</span>';
        return `<tr><td style="font-weight:700;color:var(--tx)">${(u.username||'').toUpperCase()}${isSelf?' <span style="color:var(--pu2);font-size:.6rem">(bạn)</span>':''}</td>`+
          `<td class="tc">${roleCell}</td>${permCells}${adminCell}<td class="tc">${lockCell}</td><td class="tc">${resetCell}</td><td class="tc">${pwCell}</td></tr>`;
      }).join('')+'</tbody></table>';
  }catch(e){
    console.error('admLoadUsers',e);
    list.innerHTML='<div style="color:var(--re);font-size:.7rem;padding:10px 0">Lỗi tải danh sách: '+(e.message||e)+'</div>';
  }
}
async function admSetPermLevel(uid,k,val,sel){
  try{
    const{data,error}=await SB.client().from('profiles').select('perms,username').eq('user_id',uid).single();
    if(error)throw error;
    const perms=data.perms||{};
    if(val)perms[k]=val;else delete perms[k];
    const{error:e2}=await SB.client().from('profiles').update({perms}).eq('user_id',uid);
    if(e2)throw e2;
    logAction('Phân quyền','Tài khoản '+(data.username||'').toUpperCase()+' · '+k+' = '+permLabel(val));
  }catch(e){
    console.error('admSetPermLevel',e);
    alert('Lỗi lưu quyền: '+(e.message||e));
    admLoadUsers();
  }
}
// Đổi mật khẩu tài khoản khác (admin: tất cả; Tổ Trưởng: chỉ nhân viên — server kiểm tra lại)
async function admChangePw(uid,uname){
  const pw=prompt('Nhập MẬT KHẨU MỚI cho tài khoản '+uname.toUpperCase()+' (tối thiểu 6 ký tự):');
  if(pw===null)return;
  if(pw.length<6){alert('Mật khẩu tối thiểu 6 ký tự');return;}
  try{
    const{error}=await SB.client().rpc('change_password',{target_id:uid,new_password:pw});
    if(error)throw error;
    alert('Đã đổi mật khẩu cho '+uname.toUpperCase()+' ✓\nHãy gửi mật khẩu mới cho người dùng.');
    logAction('Đổi mật khẩu','Tài khoản '+uname.toUpperCase());
  }catch(e){
    console.error('admChangePw',e);
    alert('Lỗi: '+(e.message||e));
  }
}
// Tự đổi mật khẩu của chính mình (nút trên chip góc phải)
async function selfChangePw(){
  if(!CUR_PROFILE)return;
  const pw=prompt('Nhập MẬT KHẨU MỚI cho tài khoản của bạn (tối thiểu 6 ký tự):');
  if(pw===null)return;
  if(pw.length<6){alert('Mật khẩu tối thiểu 6 ký tự');return;}
  try{
    const{error}=await SB.client().rpc('change_password',{target_id:CUR_PROFILE.user_id,new_password:pw});
    if(error)throw error;
    alert('Đã đổi mật khẩu ✓ Lần đăng nhập sau dùng mật khẩu mới.');
    logAction('Đổi mật khẩu','Tự đổi mật khẩu của mình');
  }catch(e){
    console.error('selfChangePw',e);
    alert('Lỗi: '+(e.message||e));
  }
}
// ===== 2FA GOOGLE AUTHENTICATOR (Supabase MFA/TOTP) =====
let _enrollFactorId=null;
function close2faModal(){document.getElementById('tfaModal').style.display='none';}
async function open2faModal(){
  if(!CUR_PROFILE||!SB.ready())return;
  const modal=document.getElementById('tfaModal');modal.style.display='flex';
  document.getElementById('tfa-err').textContent='';
  ['tfa-on','tfa-off','tfa-enroll'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('tfa-loading').style.display='block';
  try{
    const{data}=await SB.client().auth.mfa.listFactors();
    const verified=(data.totp||[]).some(f=>f.status==='verified');
    document.getElementById('tfa-loading').style.display='none';
    document.getElementById(verified?'tfa-on':'tfa-off').style.display='block';
  }catch(e){
    console.error('open2faModal',e);
    document.getElementById('tfa-loading').style.display='none';
    document.getElementById('tfa-off').style.display='block';
  }
}
async function start2faEnroll(){
  const err=document.getElementById('tfa-err');err.textContent='';
  try{
    // xóa các thiết bị chưa xác nhận còn sót
    const{data:f}=await SB.client().auth.mfa.listFactors();
    for(const fac of (f.all||[]))if(fac.status==='unverified'){try{await SB.client().auth.mfa.unenroll({factorId:fac.id});}catch(e){}}
    const{data,error}=await SB.client().auth.mfa.enroll({factorType:'totp',friendlyName:'SANJI-'+Date.now()});
    if(error){err.textContent='Lỗi: '+error.message;return;}
    _enrollFactorId=data.id;
    document.getElementById('tfa-qr').src=data.totp.qr_code;
    document.getElementById('tfa-secret').textContent=data.totp.secret;
    document.getElementById('tfa-off').style.display='none';
    document.getElementById('tfa-enroll').style.display='block';
    const c=document.getElementById('tfa-code');c.value='';setTimeout(()=>c.focus(),100);
  }catch(e){console.error('start2faEnroll',e);err.textContent='Lỗi tạo mã 2FA (kiểm tra MFA đã bật trong Supabase chưa)';}
}
async function confirm2faEnroll(){
  const code=document.getElementById('tfa-code').value.trim();
  const err=document.getElementById('tfa-err');err.textContent='';
  if(!/^\d{6}$/.test(code)){err.textContent='Nhập đúng mã 6 số';return;}
  try{
    const{error}=await SB.client().auth.mfa.challengeAndVerify({factorId:_enrollFactorId,code});
    if(error){err.textContent='Mã không đúng — thử lại';return;}
    logAction('Bật 2FA','Google Authenticator');
    close2faModal();
    alert('Đã BẬT 2FA thành công!\nTừ lần đăng nhập sau, bạn sẽ cần nhập mã 6 số từ Google Authenticator.');
  }catch(e){console.error('confirm2faEnroll',e);err.textContent='Lỗi xác nhận';}
}
async function disable2fa(){
  if(!confirm('Tắt 2FA?\nĐăng nhập sẽ không cần mã 6 số nữa.'))return;
  const err=document.getElementById('tfa-err');err.textContent='';
  try{
    const{data}=await SB.client().auth.mfa.listFactors();
    for(const fac of (data.all||[])){try{await SB.client().auth.mfa.unenroll({factorId:fac.id});}catch(e){}}
    logAction('Tắt 2FA','Google Authenticator');
    close2faModal();
    alert('Đã tắt 2FA.');
  }catch(e){console.error('disable2fa',e);err.textContent='Lỗi tắt 2FA (cần đã đăng nhập bằng 2FA phiên này)';}
}
function copy2faSecret(){
  const s=document.getElementById('tfa-secret').textContent;
  try{navigator.clipboard.writeText(s);setCloudStatus('Đã copy mã bí mật 2FA');}catch(e){}
}

// Reset 2FA của tài khoản khác (qua Edge Function; server kiểm tra quyền lần nữa)
async function admReset2fa(uid,uname){
  if(!confirm('RESET 2FA cho tài khoản '+uname.toUpperCase()+'?\n\nThiết bị Google Authenticator cũ sẽ bị gỡ. Lần đăng nhập kế tiếp, tài khoản này sẽ được yêu cầu quét MÃ QR MỚI để thiết lập lại.'))return;
  try{
    const{data:sess}=await SB.client().auth.getSession();
    const token=sess&&sess.session&&sess.session.access_token;
    if(!token){alert('Phiên hết hạn, đăng nhập lại');return;}
    const r=await fetch(SB_URL+'/functions/v1/super-function',{method:'POST',headers:{'Authorization':'Bearer '+token,'apikey':SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'reset_2fa',target:uid})});
    const res=await r.json();
    if(!res.ok)throw new Error(res.description||'Lỗi');
    logAction('Reset 2FA',uname.toUpperCase());
    alert('Đã reset 2FA cho '+uname.toUpperCase()+' ✓\nĐã gỡ '+(res.removed||0)+' thiết bị. Người dùng sẽ thiết lập lại khi đăng nhập lần sau.');
  }catch(e){alert('Lỗi reset 2FA: '+(e.message||e));}
}

// ===== WHITE IP (chỉ ADMIN quản lý) =====
let WHITE_LIST=[];
async function admLoadIps(){
  try{
    const{data}=await SB.client().rpc('get_whiteip');
    WHITE_LIST=Array.isArray(data)?data:[];
  }catch(e){WHITE_LIST=[];}
  fetchMyIP().then(ip=>{const el=document.getElementById('admMyIp');if(el)el.textContent=ip||'không xác định';});
  const el=document.getElementById('admIpList');
  if(!el)return;
  el.innerHTML=WHITE_LIST.length
    ?WHITE_LIST.map(ip=>`<span style="background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.35);color:var(--cy);border-radius:14px;padding:4px 12px;font-size:.68rem;font-weight:700;display:flex;align-items:center;gap:7px">${ip}<b style="cursor:pointer;color:#f87171" title="Xóa IP" onclick="admDelIp('${ip}')">✕</b></span>`).join('')
    :'<span style="color:var(--mu);font-size:.68rem">Danh sách trống — White IP đang TẮT</span>';
}
async function admAddIp(){
  if(!CUR_PROFILE||!CUR_PROFILE.is_admin)return;
  const inp=document.getElementById('admIpInput');
  const ip=inp.value.trim();
  if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)){alert('IP không hợp lệ (định dạng: x.x.x.x)');return;}
  if(WHITE_LIST.includes(ip)){alert('IP đã có trong danh sách');return;}
  const my=await fetchMyIP();
  if(!WHITE_LIST.length&&my&&ip!==my){
    if(!confirm('CẢNH BÁO TỰ KHÓA!\n\nBạn sắp BẬT White IP nhưng IP đầu tiên ('+ip+') KHÁC IP hiện tại của bạn ('+my+').\n\nĐăng xuất xong bạn sẽ KHÔNG đăng nhập lại được!\n\nVẫn tiếp tục?'))return;
  }
  try{
    WHITE_LIST.push(ip);
    await SB.saveReport('whiteip','all',{list:WHITE_LIST});
    logAction('White IP','Thêm '+ip);
    inp.value='';
    admLoadIps();
  }catch(e){alert('Lỗi lưu White IP: '+(e.message||e));}
}
async function admDelIp(ip){
  if(!CUR_PROFILE||!CUR_PROFILE.is_admin)return;
  const my=await fetchMyIP();
  if(ip===my&&!confirm('Đây là IP HIỆN TẠI của bạn — xóa xong bạn có thể bị khóa khỏi hệ thống!\n\nVẫn xóa?'))return;
  try{
    WHITE_LIST=WHITE_LIST.filter(x=>x!==ip);
    await SB.saveReport('whiteip','all',{list:WHITE_LIST});
    logAction('White IP','Xóa '+ip);
    admLoadIps();
  }catch(e){alert('Lỗi lưu White IP: '+(e.message||e));}
}
// Khóa / mở khóa tài khoản (ADMIN + Tổ Trưởng; server kiểm tra quyền lần nữa)
async function admToggleLock(uname,val){
  if(!confirm((val?'KHÓA':'MỞ KHÓA')+' tài khoản '+uname.toUpperCase()+'?'))return;
  try{
    const{error}=await SB.client().rpc('set_lock',{uname,val});
    if(error)throw error;
    logAction(val?'Khóa tài khoản':'Mở khóa tài khoản',uname.toUpperCase());
    admLoadUsers();
  }catch(e){alert('Lỗi: '+(e.message||e));}
}
// Xóa toàn bộ dữ liệu cloud của 1 tháng (chỉ ADMIN, xác nhận 2 lớp)
async function admFillDelMonths(){
  try{
    const rows=await SB.listReports();
    const months=[...new Set(rows.map(r=>r.month).filter(m=>/^\d{4}-\d{2}$/.test(m)))].sort().reverse();
    const sel=document.getElementById('admDelMonth');
    const cur=sel.value;
    sel.innerHTML='<option value="">-- Chọn tháng --</option>'+months.map(m=>`<option value="${m}">Tháng ${dispMonth(m)}</option>`).join('');
    if(cur)sel.value=cur;
  }catch(e){console.error('admFillDelMonths',e);}
}
// Tải toàn bộ dữ liệu 1 tháng ra file JSON (sao lưu tay, phòng gói free không backup tự động)
async function admExportMonth(){
  if(!CUR_PROFILE||!CUR_PROFILE.is_admin)return;
  const m=document.getElementById('admDelMonth').value;
  const msg=document.getElementById('admDelMsg');
  if(!m){msg.style.color='var(--re)';msg.textContent='Chưa chọn tháng để sao lưu';return;}
  try{
    msg.style.color='var(--mu2)';msg.textContent='Đang tải dữ liệu tháng '+dispMonth(m)+'...';
    const types=['don','km','shift','anomaly','work','limits','ov','bc'];
    const out={month:m,exported_at:new Date().toISOString(),by:CUR_PROFILE.username,data:{}};
    for(const t of types){out.data[t]=await SB.loadReport(t,m);}
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='sanji_backup_'+m+'.json';
    a.click();
    URL.revokeObjectURL(a.href);
    logAction('Tải sao lưu JSON','Tháng '+dispMonth(m));
    msg.style.color='var(--gr)';msg.textContent='Đã tải file sao lưu tháng '+dispMonth(m)+' ✓';
  }catch(e){
    console.error('admExportMonth',e);
    msg.style.color='var(--re)';msg.textContent='Lỗi tải sao lưu: '+(e.message||e);
  }
}
async function admDeleteMonth(){
  if(!CUR_PROFILE||!CUR_PROFILE.is_admin)return;
  const m=document.getElementById('admDelMonth').value;
  const msg=document.getElementById('admDelMsg');
  if(!m){msg.style.color='var(--re)';msg.textContent='Chưa chọn tháng';return;}
  if(!confirm('XÓA VĨNH VIỄN toàn bộ dữ liệu tháng '+dispMonth(m)+' trên cloud?\n\nGồm: Duyệt Đơn · Khuyến Mãi · Phân Ca · Bất Thường · Báo cáo đại lý\n\nHành động KHÔNG THỂ hoàn tác!'))return;
  const typed=prompt('Xác nhận lần cuối — gõ chính xác:\n\nXOA '+dispMonth(m));
  if(typed!=='XOA '+dispMonth(m)){msg.style.color='var(--re)';msg.textContent='Chuỗi xác nhận không khớp — đã hủy, không xóa gì.';return;}
  try{
    msg.style.color='var(--mu2)';msg.textContent='Đang xóa...';
    const{error}=await SB.client().from('reports').delete().eq('month',m);
    if(error)throw error;
    logAction('XÓA DỮ LIỆU THÁNG','Tháng '+dispMonth(m)+' — toàn bộ báo cáo trên cloud');
    msg.style.color='var(--gr)';msg.textContent='Đã xóa sạch dữ liệu tháng '+dispMonth(m)+' trên cloud ✓ (file Excel gốc vẫn còn trong Storage)';
    admFillDelMonths();
    if(m===CUR_MONTH)bootData(); // đang xem đúng tháng vừa xóa -> tải lại thành trống
  }catch(e){
    console.error('admDeleteMonth',e);
    msg.style.color='var(--re)';msg.textContent='Lỗi xóa: '+(e.message||e);
  }
}
// ===== TAB LỊCH SỬ =====
async function rLogPanel(){
  const el=document.getElementById('logList');
  if(!el)return;
  el.innerHTML='<div style="color:var(--mu);font-size:.7rem;padding:10px 0">Đang tải...</div>';
  try{
    const{data,error}=await SB.client().from('audit_log').select('*').order('id',{ascending:false}).limit(300);
    if(error)throw error;
    if(!data.length){el.innerHTML='<div style="color:var(--mu);font-size:.7rem;padding:10px 0">Chưa có thao tác nào được ghi nhận.</div>';return;}
    el.innerHTML=`<table class="adm-tbl"><thead><tr><th>Thời gian (GMT+7)</th><th>Tài khoản</th><th>Thao tác</th><th>Chi tiết</th></tr></thead><tbody>`+
      data.map(r=>{
        const t=new Date(r.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
        return `<tr><td style="white-space:nowrap;color:var(--mu2)">${t}</td><td style="font-weight:700;color:var(--pu2)">${(r.username||'?').toUpperCase()}</td><td style="font-weight:600">${r.action}</td><td style="color:var(--mu2)">${r.detail||''}</td></tr>`;
      }).join('')+'</tbody></table>';
  }catch(e){
    console.error('rLogPanel',e);
    el.innerHTML='<div style="color:var(--re);font-size:.7rem;padding:10px 0">Lỗi tải lịch sử: '+(e.message||e)+'<br>(Bạn đã chạy file supabase_update2.sql chưa?)</div>';
  }
}
async function admSetRole(uid,role,sel){
  try{
    const{data,error}=await SB.client().from('profiles').select('perms').eq('user_id',uid).single();
    if(error)throw error;
    const perms=data.perms||{};perms._role=role;
    const{error:e2}=await SB.client().from('profiles').update({perms}).eq('user_id',uid);
    if(e2)throw e2;
    logAction('Đổi cấp bậc','Tài khoản ID '+uid.slice(0,8)+' → '+(ROLES[role]?ROLES[role].label:role));
  }catch(e){
    console.error('admSetRole',e);
    alert('Lỗi lưu cấp bậc: '+(e.message||e));
    admLoadUsers();
  }
}
async function admSetAdmin(uid,val,cb){
  if(!confirm(val?'Cấp quyền ADMIN cho tài khoản này? Admin có toàn quyền, kể cả tạo tài khoản.':'Gỡ quyền ADMIN của tài khoản này?')){
    if(cb)cb.checked=!val;return;
  }
  try{
    const{error}=await SB.client().from('profiles').update({is_admin:val}).eq('user_id',uid);
    if(error)throw error;
    logAction(val?'Cấp quyền ADMIN':'Gỡ quyền ADMIN','Tài khoản ID '+uid.slice(0,8));
    admLoadUsers();
  }catch(e){
    console.error('admSetAdmin',e);
    if(cb)cb.checked=!val;
    alert('Lỗi: '+(e.message||e));
  }
}
async function admCreateUser(){
  const uEl=document.getElementById('au-user'),pEl=document.getElementById('au-pass'),msg=document.getElementById('au-msg');
  const u=uEl.value.trim(),p=pEl.value;
  msg.style.color='var(--mu2)';msg.textContent='';
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(u)){msg.style.color='var(--re)';msg.textContent='Tên đăng nhập 3-20 ký tự, chỉ chữ/số/gạch dưới';return;}
  if(p.length<6){msg.style.color='var(--re)';msg.textContent='Mật khẩu tối thiểu 6 ký tự';return;}
  const perms={_role:document.getElementById('au-role').value};
  document.querySelectorAll('#au-perms select[data-k]').forEach(s=>{if(s.value)perms[s.dataset.k]=s.value;});
  msg.textContent='Đang tạo tài khoản...';
  try{
    // client phụ để signUp không ảnh hưởng phiên admin đang đăng nhập
    const tmp=window.supabase.createClient(SB_URL,SB_KEY,{auth:{storageKey:'sb-tmp-signup',persistSession:false,autoRefreshToken:false}});
    const{data,error}=await tmp.auth.signUp({email:AUTH.emailOf(u),password:p});
    if(error){
      msg.style.color='var(--re)';
      msg.textContent=/already/i.test(error.message)?'Tên đăng nhập đã tồn tại':('Lỗi: '+error.message);
      return;
    }
    // trigger đã tạo hồ sơ; giờ cập nhật quyền theo lựa chọn
    const{error:e2}=await SB.client().from('profiles').update({perms}).eq('user_id',data.user.id);
    if(e2)throw e2;
    msg.style.color='var(--gr)';
    msg.textContent='Đã tạo tài khoản '+u.toUpperCase()+' ✓ (mật khẩu bạn vừa đặt, hãy gửi cho nhân viên)';
    logAction('Tạo tài khoản',u.toUpperCase()+' · cấp bậc '+(ROLES[perms._role]?ROLES[perms._role].label:perms._role));
    uEl.value='';pEl.value='';
    admLoadUsers();
  }catch(e){
    console.error('admCreateUser',e);
    msg.style.color='var(--re)';
    msg.textContent='Lỗi tạo tài khoản: '+(e.message||e);
  }
}
